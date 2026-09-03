import type { Origin } from './transit/geo';
import type { Route, Slot, Stop } from './transit/types';

export type PickerStatus = 'loading' | 'ready' | 'stopsFailed' | 'routesFailed';

export type Screen =
  | { kind: 'board' }
  | { kind: 'ambient' }
  | { kind: 'picker'; token: number; stops: Stop[]; cursor: number; status: PickerStatus }
  | { kind: 'routes'; token: number; stops: Stop[]; stop: Stop; routes: Route[]; cursor: number; chosen: string[] };

export interface State {
  slots: Slot[];
  index: number;
  screen: Screen;
  origin: Origin | null;
  lastInputAt: number;
}

export type Action =
  | { type: 'preset'; n: 1 | 2 | 3 | 4; at: number }
  | { type: 'turn'; delta: 1 | -1; at: number }
  | { type: 'select'; at: number }
  | { type: 'back'; at: number }
  | { type: 'mode'; at: number }
  | { type: 'idle'; at: number }
  | { type: 'toggleRoute'; routeId: string; at: number }
  | { type: 'saveSlot'; at: number }
  | { type: 'openPicker'; token: number; at: number }
  | { type: 'stops'; token: number; stops: Stop[] }
  | { type: 'stopsFailed'; token: number }
  | { type: 'openRoutes'; token: number; stop: Stop; routes: Route[] }
  | { type: 'routesFailed'; token: number }
  | { type: 'origin'; origin: Origin | null };

// what a dial press means on the screens whose select needs a side effect
export type SelectTarget = { kind: 'openPicker' } | { kind: 'locate' } | { kind: 'retry' } | { kind: 'pickStop'; stop: Stop };

export const IDLE_MS = 60_000;

function wrap(i: number, n: number): number {
  return n === 0 ? 0 : ((i % n) + n) % n;
}

// picker row 0 is "use my location"; a failed load replaces the stops with one retry row
export function pickerRows(screen: Extract<Screen, { kind: 'picker' }>): number {
  if (screen.status === 'stopsFailed') return 2;
  return screen.stops.length + 1;
}

export function selectOn(screen: Screen): SelectTarget | null {
  if (screen.kind === 'board') return { kind: 'openPicker' };
  if (screen.kind !== 'picker') return null;
  if (screen.cursor === 0) return { kind: 'locate' };
  if (screen.status === 'stopsFailed') return { kind: 'retry' };
  const stop = screen.stops[screen.cursor - 1];
  return stop ? { kind: 'pickStop', stop } : null;
}

export function reduce(state: State, action: Action): State {
  const next = step(state, action);
  const keepsOrigin = next.screen.kind === 'picker' || next.screen.kind === 'routes';
  return keepsOrigin || next.origin === null ? next : { ...next, origin: null };
}

function step(state: State, action: Action): State {
  const { screen } = state;
  switch (action.type) {
    case 'stops':
      if (screen.kind !== 'picker' || screen.token !== action.token) return state;
      return { ...state, screen: { ...screen, stops: action.stops, status: 'ready', cursor: Math.min(screen.cursor, action.stops.length) } };
    case 'stopsFailed':
      if (screen.kind !== 'picker' || screen.token !== action.token) return state;
      return { ...state, screen: { ...screen, stops: [], status: 'stopsFailed', cursor: Math.min(screen.cursor, 1) } };
    case 'routesFailed':
      if (screen.kind !== 'picker' || screen.token !== action.token) return state;
      return { ...state, screen: { ...screen, status: 'routesFailed' } };
    case 'openRoutes':
      if (screen.kind !== 'picker' || screen.token !== action.token) return state;
      return { ...state, screen: { kind: 'routes', token: screen.token, stops: screen.stops, stop: action.stop, routes: action.routes, cursor: 0, chosen: [] } };
    case 'origin':
      return { ...state, origin: action.origin };
  }
  const touched = { ...state, lastInputAt: action.at };
  switch (action.type) {
    case 'preset': {
      const index = action.n - 1;
      if (index >= state.slots.length) return touched;
      return { ...touched, index, screen: { kind: 'board' } };
    }
    case 'turn':
      if (screen.kind === 'picker') {
        return { ...touched, screen: { ...screen, cursor: wrap(screen.cursor + action.delta, pickerRows(screen)) } };
      }
      if (screen.kind === 'routes') {
        return { ...touched, screen: { ...screen, cursor: wrap(screen.cursor + action.delta, screen.routes.length + 1) } };
      }
      return { ...touched, index: wrap(state.index + action.delta, state.slots.length), screen: { kind: 'board' } };
    case 'select':
      if (screen.kind === 'routes') {
        if (screen.cursor === screen.routes.length) return step(state, { type: 'saveSlot', at: action.at });
        return step(state, { type: 'toggleRoute', routeId: screen.routes[screen.cursor]!.routeId, at: action.at });
      }
      if (screen.kind === 'ambient') return { ...touched, screen: { kind: 'board' } };
      return touched;
    case 'toggleRoute': {
      if (screen.kind !== 'routes') return touched;
      const id = action.routeId;
      if (!screen.routes.some(r => r.routeId === id)) return touched;
      const chosen = screen.chosen.includes(id) ? screen.chosen.filter(r => r !== id) : [...screen.chosen, id];
      return { ...touched, screen: { ...screen, chosen } };
    }
    case 'saveSlot': {
      if (screen.kind !== 'routes' || screen.chosen.length === 0) return touched;
      const slot: Slot = { stopId: screen.stop.stopId, stopName: screen.stop.name, routeIds: screen.chosen };
      const slots = [...state.slots, slot];
      return { ...touched, slots, index: slots.length - 1, screen: { kind: 'board' } };
    }
    case 'back':
      if (screen.kind === 'routes') {
        const cursor = screen.stops.indexOf(screen.stop) + 1;
        return { ...touched, screen: { kind: 'picker', token: screen.token, stops: screen.stops, cursor, status: 'ready' } };
      }
      if (screen.kind === 'picker' || screen.kind === 'ambient') return { ...touched, screen: { kind: 'board' } };
      return touched;
    case 'mode':
      return { ...touched, screen: screen.kind === 'ambient' ? { kind: 'board' } : { kind: 'ambient' } };
    case 'idle':
      if (screen.kind !== 'board') return state;
      if (action.at - state.lastInputAt < IDLE_MS) return state;
      return { ...state, screen: { kind: 'ambient' } };
    case 'openPicker':
      return { ...touched, screen: { kind: 'picker', token: action.token, stops: [], cursor: 0, status: 'loading' } };
  }
}
