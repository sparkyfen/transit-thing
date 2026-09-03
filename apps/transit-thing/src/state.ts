import { haversine, type Origin } from './transit/geo';
import { slotKey } from './transit/trips';
import type { Route, Slot, Stop } from './transit/types';

export type LoadStatus = 'loading' | 'ready' | 'failed';
export type LocateStatus = 'idle' | 'locating' | 'failed';
// one alert shows at a time, the newest failure wins
export type PickerAlert = 'refresh' | 'locate' | 'routes';
export type FailReason = 'rateLimited' | 'failed';

// load and locate fail independently: a bad fix must not hide the retry row, and a failed refresh must not drop the stops
type PickerScreen = {
  kind: 'picker';
  token: number;
  latestReq: number;
  latestRoutesReq: number;
  stops: Stop[];
  cursor: number;
  load: LoadStatus;
  locate: LocateStatus;
  alert: PickerAlert | null;
  // why the last stops or routes request failed, so the copy can say when the server asked for a pause
  reason: FailReason;
};

type RoutesScreen = { kind: 'routes'; token: number; latestReq: number; stops: Stop[]; stop: Stop; routes: Route[]; cursor: number; chosen: string[] };

export type Screen = { kind: 'board' } | { kind: 'ambient' } | PickerScreen | RoutesScreen;

export interface State {
  slots: Slot[];
  // keys of the slots settings last supplied, so a settings edit can remove or replace them and leave dial-added slots alone
  configKeys: string[];
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
  | { type: 'stopsFailed'; token: number; reqId: number; reason: FailReason }
  | { type: 'openRoutes'; token: number; reqId: number; stop: Stop; routes: Route[] }
  | { type: 'routesRequested'; token: number; reqId: number }
  | { type: 'routesFailed'; token: number; reqId: number; reason: FailReason }
  | { type: 'locating'; token: number }
  | { type: 'locateFailed'; token: number }
  | { type: 'origin'; token: number; origin: Origin }
  | { type: 'slots'; slots: Slot[] };

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

// routes rows: the routes, then the save row
function rowCount(screen: PickerScreen | RoutesScreen): number {
  if (screen.kind === 'routes') return screen.routes.length + 1;
  if (screen.load === 'failed') return RETRY_ROW + 1;
  return stopRow(screen.stops.length);
}

// while a retry is loading the stored cursor waits on the retry row, which is not on screen, so focus sits on the location row
export function visibleCursor(screen: Pick<PickerScreen, 'cursor' | 'load' | 'stops'>): number {
  return screen.load === 'loading' && screen.stops.length === 0 ? LOCATE_ROW : screen.cursor;
}

function freshPicker(token: number, latestReq: number): PickerScreen {
  return { kind: 'picker', token, latestReq, latestRoutesReq: 0, stops: [], cursor: 0, load: 'loading', locate: 'idle', alert: null, reason: 'failed' };
}

function clampCursor<S extends PickerScreen | RoutesScreen>(screen: S): S {
  return { ...screen, cursor: Math.max(0, Math.min(screen.cursor, rowCount(screen) - 1)) };
}

// the count stands while a fix is in flight so a failed fix does not announce it again
export function pickerMessage(load: LoadStatus, stopCount: number, nearYou: boolean): string | null {
  if (load === 'loading') return 'Loading stops.';
  if (load === 'failed') return null;
  if (stopCount === 0) return nearYou ? 'No stops found.' : 'Use my location to find stops.';
  if (stopCount === 1) return '1 stop found.';
  return nearYou ? `${stopCount} stops found, closest first.` : `${stopCount} stops found.`;
}

export function selectOn(screen: Screen): SelectTarget | null {
  if (screen.kind === 'board') return { kind: 'openPicker' };
  if (screen.kind !== 'picker') return null;
  // one cursor drives both the highlight and the press
  const cursor = visibleCursor(screen);
  if (cursor === LOCATE_ROW) return screen.locate === 'locating' ? null : { kind: 'locate' };
  if (screen.load === 'failed') return { kind: 'retry' };
  const stop = screen.stops[stopIndex(cursor)];
  return stop ? { kind: 'pickStop', stop } : null;
}

function sameKeys(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((k, i) => k === b[i]);
}

// a settings edit that only renames a stop keeps its key, so the name is checked beside it
function sameSlots(a: Slot[], b: Slot[]): boolean {
  return sameKeys(a.map(slotKey), b.map(slotKey)) && sameKeys(a.map(s => s.stopName), b.map(s => s.stopName));
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
      // an empty list goes back to loading so the retry row gives way to the loading message; the cursor waits where it
      // is so a failed retry lands back on the retry row, and a failed fix is the location row's news, not the list's
      const load = screen.stops.length === 0 ? 'loading' : screen.load;
      const alert = screen.alert === 'locate' ? 'locate' : null;
      return { ...state, screen: { ...screen, latestReq: action.reqId, load, alert } };
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
      if (screen.stops.length > 0) return { ...state, screen: { ...screen, alert: 'refresh', reason: action.reason } };
      return { ...state, screen: clampCursor({ ...screen, load: 'failed', reason: action.reason }) };
    case 'routesRequested':
      if (screen.kind !== 'picker' || screen.token !== action.token) return state;
      return { ...state, screen: { ...screen, latestRoutesReq: action.reqId, alert: screen.alert === 'routes' ? null : screen.alert } };
    case 'routesFailed':
      if (screen.kind !== 'picker' || screen.token !== action.token || screen.latestRoutesReq !== action.reqId) return state;
      return { ...state, screen: { ...screen, alert: 'routes', reason: action.reason } };
    case 'openRoutes':
      if (screen.kind !== 'picker' || screen.token !== action.token || screen.latestRoutesReq !== action.reqId) return state;
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
    case 'slots': {
      const configKeys = action.slots.map(slotKey);
      const currentKeys = state.slots.map(slotKey);
      // settings come first, then whatever the dial added that settings do not name
      const slots = [
        ...action.slots,
        ...state.slots.filter(s => {
          const key = slotKey(s);
          return !state.configKeys.includes(key) && !configKeys.includes(key);
        }),
      ];
      if (sameSlots(slots, state.slots) && sameKeys(configKeys, state.configKeys)) return state;
      const current = currentKeys[state.index];
      const kept = current === undefined ? -1 : slots.findIndex(s => slotKey(s) === current);
      const index = kept >= 0 ? kept : Math.min(state.index, Math.max(0, slots.length - 1));
      return { ...state, slots, configKeys, index };
    }
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
      // the retry window has one row on screen, so there is nowhere for a turn to go
      if (screen.kind === 'picker' && screen.load === 'loading') return touched;
      if (screen.kind === 'picker' || screen.kind === 'routes') {
        return { ...touched, screen: { ...screen, cursor: wrap(screen.cursor + action.delta, rowCount(screen)) } };
      }
      return { ...touched, index: wrap(state.index + action.delta, state.slots.length), screen: { kind: 'board' } };
    case 'cursor':
      if (screen.kind === 'picker' || screen.kind === 'routes') return { ...touched, screen: clampCursor({ ...screen, cursor: action.cursor }) };
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
      const existing = state.slots.findIndex(s => slotKey(s) === slotKey(slot));
      if (existing >= 0) return { ...touched, index: existing, screen: { kind: 'board' } };
      const slots = [...state.slots, slot];
      return { ...touched, slots, index: slots.length - 1, screen: { kind: 'board' } };
    }
    case 'back':
      if (screen.kind === 'routes') {
        const cursor = stopRow(Math.max(0, screen.stops.findIndex(s => s.stopId === screen.stop.stopId)));
        return { ...touched, screen: clampCursor({ ...freshPicker(screen.token, screen.latestReq), stops: screen.stops, cursor, load: 'ready' }) };
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
