import { BridgethingClient } from '@bridgething/client';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { applyConfig, DEFAULT_CONFIG, type Config } from './config';
import { daemonUrl } from './daemon';
import { DIRECT, FAKE_FIX, SEED_SLOTS, USE_FIXTURES } from './devFlags';
import { useControls } from './hooks/useControls';
import { Ambient } from './screens/Ambient';
import { Board } from './screens/Board';
import { RoutePicker, StopPicker } from './screens/Picker';
import { LOCATE_ROW, reduce, RETRY_ROW, selectOn, type Action, type SelectTarget, type State } from './state';
import { rememberFirstSeen } from './transit/delay';
import { FIXTURE_SLOTS, fixtureSource } from './transit/fixtures';
import { liveSource, type LiveSource } from './transit/live';
import { unitsFor } from './transit/format';
import { locate, type Origin } from './transit/geo';
import { requestRoutes, requestStops } from './transit/requests';
import { dataAsOf, nextLink, type Link } from './transit/status';
import { browserTransport, daemonTransport } from './transit/transport';
import { everySlotHasFeed, forSlot, nextAcrossSlots, slotKey, soonestUpcoming } from './transit/trips';
import type { Slot, TransitSource, Trip } from './transit/types';

const SOON_MS = 20 * 60_000;

interface Feed {
  trips: Trip[];
  updatedMs: number;
  firstSeen: Map<string, number>;
}

const initial: State = {
  slots: SEED_SLOTS ?? (USE_FIXTURES ? FIXTURE_SLOTS : []),
  configKeys: [],
  index: 0,
  screen: { kind: 'board' },
  origin: null,
  lastInputAt: Date.now(),
};

export default function App() {
  const client = useMemo(() => new BridgethingClient({ url: daemonUrl() }), []);
  const [state, dispatch] = useReducer(reduce, initial);
  const latest = useRef(state);
  latest.current = state;
  const tokens = useRef(0);
  const reqs = useRef(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [feeds, setFeeds] = useState<Map<string, Feed>>(() => new Map());
  const [connection, setConnection] = useState(client.connectionState);
  const [everOpen, setEverOpen] = useState(false);
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const configRef = useRef(config);
  configRef.current = config;
  const [links, setLinks] = useState<Map<string, Link>>(() => new Map());

  const source = useMemo<TransitSource | LiveSource>(() => {
    if (USE_FIXTURES) return fixtureSource;
    return liveSource(DIRECT ? browserTransport() : daemonTransport(client), () => ({
      baseUrl: configRef.current.apiBaseUrl,
      feed: configRef.current.feed,
      perStop: configRef.current.perStop,
    }));
  }, [client]);

  useEffect(() => {
    if (!('onStatus' in source)) return;
    return source.onStatus((slot, status) => {
      const key = slotKey(slot);
      setLinks(prev => new Map(prev).set(key, nextLink(prev.get(key), status, Date.now())));
    });
  }, [source]);

  useEffect(() => {
    const tick = setInterval(() => {
      const at = Date.now();
      setNowMs(at);
      if (config.ambientIdle) dispatch({ type: 'idle', at });
    }, 1000);
    return () => clearInterval(tick);
  }, [config.ambientIdle]);

  // config is optional: a reject leaves the defaults in place, and the next open reads it again
  const loadConfig = useCallback(
    () =>
      client.config
        .list()
        .then(r => {
          if (r.ok) setConfig(prev => r.response.entries.reduce((c, e) => applyConfig(c, e.key, e.value), prev));
        })
        .catch(() => {}),
    [client],
  );

  useEffect(() => client.on(e => {
    if (e.type === 'open') {
      setEverOpen(true);
      void loadConfig();
    }
    if (e.type === 'open' || e.type === 'close' || e.type === 'connecting') setConnection(client.connectionState);
  }), [client, loadConfig]);

  useEffect(() => client.config.onChanged(c => setConfig(prev => applyConfig(prev, c.key, c.value))), [client]);

  useEffect(() => {
    if (config.slots) dispatch({ type: 'slots', slots: config.slots });
  }, [config.slots]);

  useEffect(() => {
    const offs = state.slots.map(slot =>
      source.subscribe(slot, trips => {
        const key = slotKey(slot);
        const mine = forSlot(slot, trips);
        setFeeds(prev => new Map(prev).set(key, { trips: mine, updatedMs: Date.now(), firstSeen: rememberFirstSeen(prev.get(key)?.firstSeen ?? new Map(), mine) }));
      }),
    );
    return () => offs.forEach(off => off());
  }, [source, state.slots, config.apiBaseUrl, config.perStop]);

  const loadStops = useCallback(
    (token: number, origin: Origin | null) => requestStops({ dispatch, source, token, reqId: ++reqs.current, origin }),
    [source],
  );

  const perform = useCallback(
    async (target: SelectTarget) => {
      if (target.kind === 'openPicker') {
        const token = ++tokens.current;
        dispatch({ type: 'openPicker', token, at: Date.now() });
        return loadStops(token, null);
      }
      const { screen, origin } = latest.current;
      if (screen.kind !== 'picker') return;
      const { token } = screen;
      if (target.kind === 'retry') return loadStops(token, origin);
      if (target.kind === 'locate') {
        if (screen.locate === 'locating') return;
        dispatch({ type: 'locating', token });
        const here = FAKE_FIX ?? (await locate(client.geo));
        if (!here) return dispatch({ type: 'locateFailed', token });
        dispatch({ type: 'origin', token, origin: here });
        return loadStops(token, here);
      }
      return requestRoutes({ dispatch, source, token, reqId: ++reqs.current, stop: target.stop });
    },
    [client, source, loadStops],
  );

  const send = useCallback(
    (action: Action) => {
      if (action.type === 'select') {
        const target = selectOn(latest.current.screen);
        if (target) {
          void perform(target);
          return;
        }
      }
      dispatch(action);
    },
    [perform],
  );

  useControls(send);

  // a tap lands the dial cursor on the row it hit, then does what a press there would
  const tap = useCallback(
    (cursor: number, target: SelectTarget) => {
      dispatch({ type: 'cursor', cursor, at: Date.now() });
      void perform(target);
    },
    [perform],
  );

  const slot: Slot | null = state.slots[state.index] ?? null;
  const feed = slot ? feeds.get(slotKey(slot)) : undefined;
  const trips = soonestUpcoming(feed?.trips ?? [], nowMs, config.perStop);

  const next = useMemo(() => nextAcrossSlots(feeds, state.slots, nowMs, SOON_MS), [state.slots, feeds, nowMs]);

  const { screen } = state;
  if (screen.kind === 'ambient') {
    return <Ambient nowMs={nowMs} next={next} hasStops={state.slots.length > 0} hasFeed={everySlotHasFeed(feeds, state.slots)} />;
  }
  if (screen.kind === 'picker') {
    return (
      <StopPicker
        stops={screen.stops}
        cursor={screen.cursor}
        load={screen.load}
        locate={screen.locate}
        alert={screen.alert}
        reason={screen.reason}
        origin={state.origin}
        units={unitsFor(config.feed)}
        host={new URL(config.apiBaseUrl).host}
        onLocate={() => tap(LOCATE_ROW, { kind: 'locate' })}
        onRetry={() => tap(RETRY_ROW, { kind: 'retry' })}
        onPick={(stop, row) => tap(row, { kind: 'pickStop', stop })}
      />
    );
  }
  if (screen.kind === 'routes') {
    return (
      <RoutePicker
        stop={screen.stop}
        routes={screen.routes}
        cursor={screen.cursor}
        chosen={screen.chosen}
        onToggle={routeId => dispatch({ type: 'toggleRoute', routeId, at: Date.now() })}
        onSave={() => {
          dispatch({ type: 'cursor', cursor: screen.routes.length, at: Date.now() });
          dispatch({ type: 'saveSlot', at: Date.now() });
        }}
      />
    );
  }
  return (
    <Board
      slot={slot}
      slotIndex={state.index}
      slotCount={state.slots.length}
      trips={trips}
      hasFeed={feed !== undefined}
      perStop={config.perStop}
      nowMs={nowMs}
      connection={connection}
      updatedMs={dataAsOf(everOpen, feed?.updatedMs ?? null)}
      link={slot ? (links.get(slotKey(slot)) ?? null) : null}
      firstSeen={feed?.firstSeen ?? new Map()}
      onAddStop={() => void perform({ kind: 'openPicker' })}
    />
  );
}
