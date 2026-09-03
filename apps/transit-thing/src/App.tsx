import { BridgethingClient } from '@bridgething/client';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { applyConfig, DEFAULT_CONFIG, type Config } from './config';
import { daemonUrl } from './daemon';
import { DIRECT, FAKE_FIX, SEED_SLOTS, USE_FIXTURES } from './devFlags';
import { useControls } from './hooks/useControls';
import { loadSlots, persistSlots } from './persist';
import { Ambient } from './screens/Ambient';
import { Board } from './screens/Board';
import { RoutePicker, StopPicker } from './screens/Picker';
import { deviceSlots, LOCATE_ROW, reduce, RETRY_ROW, selectOn, type Action, type SelectTarget, type State } from './state';
import { rememberFirstSeen } from './transit/delay';
import { FIXTURE_SLOTS, fixtureSource } from './transit/fixtures';
import { liveSource, type LiveSource } from './transit/live';
import { unitsFor } from './transit/format';
import { locate, type Origin } from './transit/geo';
import { requestRoutes, requestStops } from './transit/requests';
import { dataAsOf, nextLink, type Link } from './transit/status';
import { browserTransport, daemonTransport } from './transit/transport';
import { diffKeys, everySlotHasFeed, forSlot, nextAcrossSlots, slotKey, soonestUpcoming } from './transit/trips';
import type { Slot, Trip } from './transit/types';

const SOON_MS = 20 * 60_000;
// canned or seeded stops are for a dev session and must not land in the device's store, nor pull its stops in
const PERSIST = !USE_FIXTURES && SEED_SLOTS === null;

interface Feed {
  trips: Trip[];
  updatedMs: number;
  firstSeen: Map<string, number>;
}

function without<V>(map: Map<string, V>, keys: string[]): Map<string, V> {
  const next = new Map(map);
  for (const key of keys) next.delete(key);
  return next;
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
  // the last list written to the store, so the same list is not written twice; null until the store has been read
  const persisted = useRef<string | null>(null);
  const restoring = useRef(false);

  // the transport owns a daemon listener, so it lives and dies with an effect rather than a memo
  const [source, setSource] = useState<LiveSource | null>(USE_FIXTURES ? fixtureSource : null);
  useEffect(() => {
    if (USE_FIXTURES) return;
    const transport = DIRECT ? browserTransport() : daemonTransport(client);
    setSource(
      liveSource(transport, () => ({
        baseUrl: configRef.current.apiBaseUrl,
        feed: configRef.current.feed,
        perStop: configRef.current.perStop,
      })),
    );
    return () => transport.dispose();
  }, [client]);

  useEffect(() => {
    if (!source) return;
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

  // a write the store refused is tried again when the daemon link next opens
  const unsaved = useRef<Slot[] | null>(null);
  const retryPersist = useCallback(() => {
    const pending = unsaved.current;
    if (!pending) return;
    unsaved.current = null;
    void persistSlots(client.store, pending).then(ok => {
      if (ok) persisted.current = JSON.stringify(pending);
      else unsaved.current = pending;
    });
  }, [client]);

  // the stops the dial added come back from the store once per session; a store call that fails waits for the next open
  const restoreSlots = useCallback(() => {
    if (!PERSIST || persisted.current !== null || restoring.current) return;
    restoring.current = true;
    void loadSlots(client.store).then(slots => {
      restoring.current = false;
      if (!slots) return;
      persisted.current = JSON.stringify(slots);
      dispatch({ type: 'restore', slots });
    });
  }, [client]);

  useEffect(() => client.on(e => {
    if (e.type === 'open') {
      setEverOpen(true);
      void loadConfig();
      restoreSlots();
      retryPersist();
    }
    if (e.type === 'open' || e.type === 'close' || e.type === 'connecting') setConnection(client.connectionState);
  }), [client, loadConfig, restoreSlots, retryPersist]);

  const device = useMemo(() => deviceSlots(state), [state.slots, state.configKeys]);
  useEffect(() => {
    const json = JSON.stringify(device);
    if (persisted.current === null || persisted.current === json) return;
    void persistSlots(client.store, device).then(ok => {
      if (ok) persisted.current = json;
      else unsaved.current = device;
    });
  }, [client, device]);


  useEffect(() => client.config.onChanged(c => setConfig(prev => applyConfig(prev, c.key, c.value))), [client]);

  useEffect(() => dispatch({ type: 'slots', slots: config.slots ?? [] }), [config.slots]);

  // one subscription per slot key; a slot change touches only its own socket, and every socket redials when the
  // server or the limit changes (this cleanup runs before the effect below on the same commit)
  const subs = useRef(new Map<string, () => void>());
  useEffect(
    () => () => {
      subs.current.forEach(off => off());
      subs.current.clear();
    },
    [source, config.apiBaseUrl, config.perStop],
  );

  useEffect(() => {
    if (!source) return;
    const { add, remove } = diffKeys(subs.current.keys(), state.slots.map(slotKey));
    for (const key of remove) {
      subs.current.get(key)?.();
      subs.current.delete(key);
    }
    if (remove.length > 0) {
      // a slot added back later starts from its first schedule, not from what it showed before
      setFeeds(prev => without(prev, remove));
      setLinks(prev => without(prev, remove));
    }
    for (const slot of state.slots) {
      const key = slotKey(slot);
      if (!add.includes(key) || subs.current.has(key)) continue;
      subs.current.set(
        key,
        source.subscribe(slot, trips => {
          const at = Date.now();
          const mine = forSlot(slot, trips);
          setFeeds(prev => new Map(prev).set(key, { trips: mine, updatedMs: at, firstSeen: rememberFirstSeen(prev.get(key)?.firstSeen ?? new Map(), mine, at) }));
        }),
      );
    }
  }, [source, state.slots, config.apiBaseUrl, config.perStop]);

  const loadStops = useCallback(
    (token: number, origin: Origin | null) => (source ? requestStops({ dispatch, source, token, reqId: ++reqs.current, origin }) : undefined),
    [source],
  );

  const perform = useCallback(
    async (target: SelectTarget) => {
      if (!source) return;
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
