import { haversine, type Origin } from './transit/geo';
import type { Route, Slot, Stop } from './transit/types';

export type LoadStatus = 'loading' | 'ready' | 'failed';
export type LocateStatus = 'idle' | 'locating' | 'failed';
// one alert shows at a time, the newest failure wins
export type PickerAlert = 'refresh' | 'locate' | 'routes';

// load and locate fail independently: a bad fix must not hide the retry row, and a failed refresh must not drop the stops
type PickerScreen = {
  kind: 'picker';
  token: number;
  latestReq: number;
  stops: Stop[];
  cursor: number;
  load: LoadStatus;
  locate: LocateStatus;
  alert: PickerAlert | null;
};

export type Screen =
  | { kind: 'board' }
  | { kind: 'ambient' }
  | PickerScreen
  | { kind: 'routes'; token: number; latestReq: number; stops: Stop[]; stop: Stop; routes: Route[]; cursor: number; chosen: string[] };

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
  | { type: 'cursor'; cursor: number; at: number }
  | { type: 'toggleRoute'; routeId: string; at: number }
  | { type: 'saveSlot'; at: number }
  | { type: 'openPicker'; token: number; at: number }
  | { type: 'stopsRequested'; token: number; reqId: number }
  | { type: 'stops'; token: number; reqId: number; stops: Stop[] }
  | { type: 'stopsFailed'; token: number; reqId: number }
  | { type: 'openRoutes'; token: number; stop: Stop; routes: Route[] }
  | { type: 'routesRequested'; token: number }
  | { type: 'routesFailed'; token: number }
  | { type: 'locating'; token: number }
  | { type: 'locateFailed'; token: number }
  | { type: 'origin'; token: number; origin: Origin };

// what a dial press means on the screens whose select needs a side effect
export type SelectTarget = { kind: 'openPicker' } | { kind: 'locate' } | { kind: 'retry' } | { kind: 'pickStop'; stop: Stop };

export const IDLE_MS = 60_000;

function wrap(i: number, n: number): number {
  return n === 0 ? 0 : ((i % n) + n) % n;
}

// picker rows: "use my location" first, then either one retry row after a failed load or the stops
export const LOCATE_ROW = 0;
export const RETRY_ROW = 1;
export const stopRow = (i: number) => i + 1;
const stopIndex = (cursor: number) => cursor - 1;

function pickerRows(screen: PickerScreen): number {
  if (screen.load === 'failed') return RETRY_ROW + 1;
  return stopRow(screen.stops.length);
}

function freshPicker(token: number, latestReq: number): PickerScreen {
  return { kind: 'picker', token, latestReq, stops: [], cursor: 0, load: 'loading', locate: 'idle', alert: null };
}

function clampCursor(screen: PickerScreen): PickerScreen {
  return { ...screen, cursor: Math.max(0, Math.min(screen.cursor, pickerRows(screen) - 1)) };
}

// nothing to announce while a fix is in flight: the stops will follow it
export function pickerMessage(load: LoadStatus, locate: LocateStatus, stopCount: number, nearYou: boolean): string | null {
  if (load === 'loading') return 'Loading stops.';
  if (load === 'failed' || locate === 'locating') return null;
  if (stopCount === 0) return 'No stops found.';
  if (stopCount === 1) return '1 stop found.';
  return nearYou ? `${stopCount} stops found, closest first.` : `${stopCount} stops found.`;
}

export function selectOn(screen: Screen): SelectTarget | null {
  if (screen.kind === 'board') return { kind: 'openPicker' };
  if (screen.kind !== 'picker') return null;
  if (screen.cursor === LOCATE_ROW) return screen.locate === 'locating' ? null : { kind: 'locate' };
  if (screen.load === 'failed') return { kind: 'retry' };
  const stop = screen.stops[stopIndex(screen.cursor)];
  return stop ? { kind: 'pickStop', stop } : null;
}

export function sortByDistance(stops: Stop[], origin: Origin | null): Stop[] {
  if (!origin) return stops;
  const from = (s: Stop) => haversine(origin.lat, origin.lon, s.lat, s.lon);
  return [...stops].sort((a, b) => from(a) - from(b));
}

export function reduce(state: State, action: Action): State {
  const next = step(state, action);
  const keepsOrigin = next.screen.kind === 'picker' || next.screen.kind === 'routes';
  return keepsOrigin || next.origin === null ? next : { ...next, origin: null };
}

function step(state: State, action: Action): State {
  const { screen } = state;
  switch (action.type) {
    case 'stopsRequested': {
      if (screen.kind !== 'picker' || screen.token !== action.token) return state;
      // an empty list goes back to loading so the retry row gives way to the loading message
      const load = screen.stops.length === 0 ? 'loading' : screen.load;
      return { ...state, screen: clampCursor({ ...screen, latestReq: action.reqId, load, alert: null }) };
    }
    case 'stops': {
      if (screen.kind !== 'picker' || screen.token !== action.token || screen.latestReq !== action.reqId) return state;
      const stops = sortByDistance(action.stops, state.origin);
      // a fresh list settles only the refresh alert; a failed fix or route load still stands
      const alert = screen.alert !== 'refresh' ? screen.alert : screen.locate === 'failed' ? 'locate' : null;
      return { ...state, screen: clampCursor({ ...screen, stops, load: 'ready', alert }) };
    }
    case 'stopsFailed':
      if (screen.kind !== 'picker' || screen.token !== action.token || screen.latestReq !== action.reqId) return state;
      if (screen.stops.length > 0) return { ...state, screen: { ...screen, alert: 'refresh' } };
      return { ...state, screen: clampCursor({ ...screen, load: 'failed' }) };
    case 'routesRequested':
      if (screen.kind !== 'picker' || screen.token !== action.token) return state;
      return { ...state, screen: { ...screen, alert: screen.alert === 'routes' ? null : screen.alert } };
    case 'routesFailed':
      if (screen.kind !== 'picker' || screen.token !== action.token) return state;
      return { ...state, screen: { ...screen, alert: 'routes' } };
    case 'openRoutes':
      if (screen.kind !== 'picker' || screen.token !== action.token) return state;
      return {
        ...state,
        screen: { kind: 'routes', token: screen.token, latestReq: screen.latestReq, stops: screen.stops, stop: action.stop, routes: action.routes, cursor: 0, chosen: [] },
      };
    case 'locating':
      if (screen.kind !== 'picker' || screen.token !== action.token || screen.locate === 'locating') return state;
      return { ...state, screen: { ...screen, locate: 'locating', alert: screen.alert === 'locate' ? null : screen.alert } };
    case 'locateFailed':
      if (screen.kind !== 'picker' || screen.token !== action.token) return state;
      return { ...state, screen: { ...screen, locate: 'failed', alert: 'locate' } };
    case 'origin':
      if (screen.kind !== 'picker' || screen.token !== action.token) return state;
      return { ...state, origin: action.origin, screen: { ...screen, locate: 'idle', stops: sortByDistance(screen.stops, action.origin) } };
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
    case 'cursor':
      if (screen.kind === 'picker') return { ...touched, screen: clampCursor({ ...screen, cursor: action.cursor }) };
      if (screen.kind === 'routes') {
        return { ...touched, screen: { ...screen, cursor: Math.max(0, Math.min(action.cursor, screen.routes.length)) } };
      }
      return touched;
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
      const cursor = screen.routes.findIndex(r => r.routeId === id);
      if (cursor < 0) return touched;
      const chosen = screen.chosen.includes(id) ? screen.chosen.filter(r => r !== id) : [...screen.chosen, id];
      return { ...touched, screen: { ...screen, chosen, cursor } };
    }
    case 'saveSlot': {
      if (screen.kind !== 'routes' || screen.chosen.length === 0) return touched;
      const slot: Slot = { stopId: screen.stop.stopId, stopName: screen.stop.name, routeIds: screen.chosen };
      const slots = [...state.slots, slot];
      return { ...touched, slots, index: slots.length - 1, screen: { kind: 'board' } };
    }
    case 'back':
      if (screen.kind === 'routes') {
        const cursor = stopRow(screen.stops.indexOf(screen.stop));
        return { ...touched, screen: { ...freshPicker(screen.token, screen.latestReq), stops: screen.stops, cursor, load: 'ready' } };
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
      return { ...touched, screen: freshPicker(action.token, 0) };
  }
}
