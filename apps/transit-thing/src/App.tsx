import { BridgethingClient } from '@bridgething/client';
import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { daemonUrl } from './daemon';
import { useControls } from './hooks/useControls';
import { Ambient } from './screens/Ambient';
import { Board } from './screens/Board';
import { RoutePicker, StopPicker } from './screens/Picker';
import { reduce, type State } from './state';
import { FIXTURE_SLOTS, fixtureSource } from './transit/fixtures';
import type { Slot, Trip } from './transit/types';

const PER_STOP = 3;
const SOON_MS = 20 * 60_000;

const initial: State = { slots: FIXTURE_SLOTS, index: 0, screen: { kind: 'board' }, lastInputAt: Date.now() };

export default function App() {
  const client = useMemo(() => new BridgethingClient({ url: daemonUrl() }), []);
  const [state, dispatch] = useReducer(reduce, initial);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [tripsBySlot, setTripsBySlot] = useState<Record<string, Trip[]>>({});
  const [origin, setOrigin] = useState<{ lat: number; lon: number } | null>(null);
  const [connected, setConnected] = useState(client.connectionState === 'open');

  useControls(dispatch);

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
      fixtureSource.subscribe(slot, trips => setTripsBySlot(prev => ({ ...prev, [slot.stopId]: trips }))),
    );
    return () => offs.forEach(off => off());
  }, [state.slots]);

  const openPicker = useCallback(async () => {
    const at = Date.now();
    const here = origin ?? { lat: 47.6155, lon: -122.1947 };
    const stops = await fixtureSource.stopsNear(here.lat, here.lon);
    dispatch({ type: 'openPicker', stops, at });
  }, [origin]);

  useEffect(() => {
    if (state.screen.kind !== 'picker') return;
    client.geo.getOnce({ accuracy: 'coarse' }).then(r => {
      if (r.ok) setOrigin({ lat: r.response.position.lat, lon: r.response.position.lon });
    });
  }, [client, state.screen.kind]);

  const slot: Slot | null = state.slots[state.index] ?? null;
  const trips = slot ? (tripsBySlot[slot.stopId] ?? []) : [];

  const next = useMemo(() => {
    let best: { slot: Slot; trip: Trip } | null = null;
    for (const s of state.slots) {
      for (const t of tripsBySlot[s.stopId] ?? []) {
        if (t.arrivalTime * 1000 < nowMs) continue;
        if (!best || t.arrivalTime < best.trip.arrivalTime) best = { slot: s, trip: t };
      }
    }
    return best && best.trip.arrivalTime * 1000 - nowMs <= SOON_MS ? best : null;
  }, [state.slots, tripsBySlot, nowMs]);

  const { screen } = state;
  if (screen.kind === 'ambient') return <Ambient nowMs={nowMs} next={next} />;
  if (screen.kind === 'picker') {
    return (
      <StopPicker
        stops={screen.stops}
        cursor={screen.cursor}
        origin={origin}
        onPick={async stop => {
          const routes = await fixtureSource.routesAt(stop.stopId);
          dispatch({ type: 'openRoutes', stop, routes, at: Date.now() });
        }}
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
        onToggle={id => {
          const i = screen.routes.findIndex(r => r.routeId === id);
          dispatch({ type: 'jumpCursor', cursor: i, at: Date.now() });
          dispatch({ type: 'select', at: Date.now() });
        }}
        onSave={() => {
          dispatch({ type: 'jumpCursor', cursor: screen.routes.length, at: Date.now() });
          dispatch({ type: 'select', at: Date.now() });
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
      perStop={PER_STOP}
      nowMs={nowMs}
      connected={connected}
      onAddStop={openPicker}
    />
  );
}
