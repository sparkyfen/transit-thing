import { BridgethingClient } from '@bridgething/client';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { applyConfig, DEFAULT_CONFIG, type Config } from './config';
import { daemonUrl } from './daemon';
import { useControls } from './hooks/useControls';
import { Ambient } from './screens/Ambient';
import { Board } from './screens/Board';
import { RoutePicker, StopPicker } from './screens/Picker';
import { LOCATE_ROW, reduce, RETRY_ROW, selectOn, type Action, type SelectTarget, type State } from './state';
import { FIXTURE_SLOTS, fixtureSource } from './transit/fixtures';
import { unitsFor } from './transit/format';
import { locate, type Origin } from './transit/geo';
import { dataAsOf } from './transit/status';
import { forSlot, nextAcrossSlots, slotKey, soonestUpcoming } from './transit/trips';
import type { Slot, Trip } from './transit/types';

const SOON_MS = 20 * 60_000;

interface Feed {
  trips: Trip[];
  updatedMs: number;
}

const initial: State = { slots: FIXTURE_SLOTS, index: 0, screen: { kind: 'board' }, origin: null, lastInputAt: Date.now() };

export default function App() {
  const client = useMemo(() => new BridgethingClient({ url: daemonUrl() }), []);
  const [state, dispatch] = useReducer(reduce, initial);
  const latest = useRef(state);
  latest.current = state;
  const tokens = useRef(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [feeds, setFeeds] = useState<Map<string, Feed>>(() => new Map());
  const [connection, setConnection] = useState(client.connectionState);
  const [everOpen, setEverOpen] = useState(false);
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);

  useEffect(() => {
    const tick = setInterval(() => {
      const at = Date.now();
      setNowMs(at);
      if (config.ambientIdle) dispatch({ type: 'idle', at });
    }, 1000);
    return () => clearInterval(tick);
  }, [config.ambientIdle]);

  // a list that fails before the socket opens is retried on every open, so a reject is not an error
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

  useEffect(() => {
    void loadConfig();
    return client.config.onChanged(c => setConfig(prev => applyConfig(prev, c.key, c.value)));
  }, [client, loadConfig]);

  useEffect(() => {
    const offs = state.slots.map(slot =>
      fixtureSource.subscribe(slot, trips => {
        const key = slotKey(slot);
        setFeeds(prev => new Map(prev).set(key, { trips: forSlot(slot, trips), updatedMs: Date.now() }));
      }),
    );
    return () => offs.forEach(off => off());
  }, [state.slots]);

  const loadStops = useCallback(async (token: number, origin: Origin | null) => {
    try {
      const stops = await fixtureSource.stopsNear(origin);
      dispatch({ type: 'stops', token, stops });
    } catch {
      dispatch({ type: 'stopsFailed', token });
    }
  }, []);

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
        if (screen.status === 'locating') return;
        dispatch({ type: 'locating', token });
        const here = await locate(client.geo);
        if (!here) return dispatch({ type: 'locateFailed', token });
        dispatch({ type: 'origin', token, origin: here });
        return loadStops(token, here);
      }
      try {
        const routes = await fixtureSource.routesAt(target.stop.stopId);
        dispatch({ type: 'openRoutes', token, stop: target.stop, routes });
      } catch {
        dispatch({ type: 'routesFailed', token });
      }
    },
    [client, loadStops],
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
  if (screen.kind === 'ambient') return <Ambient nowMs={nowMs} next={next} />;
  if (screen.kind === 'picker') {
    return (
      <StopPicker
        stops={screen.stops}
        cursor={screen.cursor}
        status={screen.status}
        origin={state.origin}
        units={unitsFor(config.feed)}
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
      onAddStop={() => void perform({ kind: 'openPicker' })}
    />
  );
}
