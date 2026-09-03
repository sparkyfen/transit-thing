import { BridgethingClient } from '@bridgething/client';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { daemonUrl } from './daemon';
import { useControls } from './hooks/useControls';
import { Ambient } from './screens/Ambient';
import { Board } from './screens/Board';
import { RoutePicker, StopPicker } from './screens/Picker';
import { reduce, selectOn, type Action, type SelectTarget, type State } from './state';
import { FIXTURE_SLOTS, fixtureSource } from './transit/fixtures';
import type { Origin } from './transit/geo';
import { forSlot, slotKey, soonestUpcoming } from './transit/trips';
import type { Slot, Trip } from './transit/types';

const PER_STOP = 3;
const SOON_MS = 20 * 60_000;

interface Feed {
  trips: Trip[];
  updatedMs: number;
}

const initial: State = { slots: FIXTURE_SLOTS, index: 0, screen: { kind: 'board' }, origin: null, lastInputAt: Date.now() };

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export default function App() {
  const client = useMemo(() => new BridgethingClient({ url: daemonUrl() }), []);
  const [state, dispatch] = useReducer(reduce, initial);
  const latest = useRef(state);
  latest.current = state;
  const tokens = useRef(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [feeds, setFeeds] = useState<Map<string, Feed>>(() => new Map());
  const [connected, setConnected] = useState(client.connectionState === 'open');

  useEffect(() => {
    const tick = setInterval(() => {
      const at = Date.now();
      setNowMs(at);
      dispatch({ type: 'idle', at });
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => client.on(e => {
    if (e.type === 'open' || e.type === 'close' || e.type === 'connecting') setConnected(client.connectionState === 'open');
  }), [client]);

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
        const r = await client.geo.getOnce({ accuracy: 'coarse' }).catch(() => null);
        if (!r?.ok) return;
        const here = { lat: round3(r.response.position.lat), lon: round3(r.response.position.lon) };
        dispatch({ type: 'origin', origin: here });
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

  const slot: Slot | null = state.slots[state.index] ?? null;
  const feed = slot ? feeds.get(slotKey(slot)) : undefined;
  const trips = soonestUpcoming(feed?.trips ?? [], nowMs, PER_STOP);

  const next = useMemo(() => {
    let best: { slot: Slot; trip: Trip } | null = null;
    for (const s of state.slots) {
      const t = soonestUpcoming(feeds.get(slotKey(s))?.trips ?? [], nowMs, 1)[0];
      if (t && (!best || t.arrivalTime < best.trip.arrivalTime)) best = { slot: s, trip: t };
    }
    return best && best.trip.arrivalTime * 1000 - nowMs <= SOON_MS ? best : null;
  }, [state.slots, feeds, nowMs]);

  const { screen } = state;
  if (screen.kind === 'ambient') return <Ambient nowMs={nowMs} next={next} />;
  if (screen.kind === 'picker') {
    return (
      <StopPicker
        stops={screen.stops}
        cursor={screen.cursor}
        status={screen.status}
        origin={state.origin}
        onLocate={() => void perform({ kind: 'locate' })}
        onRetry={() => void perform({ kind: 'retry' })}
        onPick={stop => void perform({ kind: 'pickStop', stop })}
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
        onSave={() => dispatch({ type: 'saveSlot', at: Date.now() })}
      />
    );
  }
  return (
    <Board
      slot={slot}
      slotIndex={state.index}
      slotCount={state.slots.length}
      trips={trips}
      perStop={PER_STOP}
      nowMs={nowMs}
      connected={connected}
      updatedMs={feed?.updatedMs ?? null}
      onAddStop={() => void perform({ kind: 'openPicker' })}
    />
  );
}
