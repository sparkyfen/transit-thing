import type { Route, Slot, Stop } from './transit/types';

export type Screen =
  | { kind: 'board' }
  | { kind: 'ambient' }
  | { kind: 'picker'; stops: Stop[]; cursor: number }
  | { kind: 'routes'; stop: Stop; routes: Route[]; cursor: number; chosen: string[] };

export interface State {
  slots: Slot[];
  index: number;
  screen: Screen;
  lastInputAt: number;
}

export type Action =
  | { type: 'preset'; n: 1 | 2 | 3 | 4; at: number }
  | { type: 'turn'; delta: 1 | -1; at: number }
  | { type: 'select'; at: number }
  | { type: 'back'; at: number }
  | { type: 'mode'; at: number }
  | { type: 'idle'; at: number }
  | { type: 'openPicker'; stops: Stop[]; at: number }
  | { type: 'openRoutes'; stop: Stop; routes: Route[]; at: number }
  | { type: 'jump'; index: number; at: number }
  | { type: 'jumpCursor'; cursor: number; at: number };

export const IDLE_MS = 60_000;

function wrap(i: number, n: number): number {
  return n === 0 ? 0 : ((i % n) + n) % n;
}

export function reduce(state: State, action: Action): State {
  const touched = { ...state, lastInputAt: action.at };
  const { screen } = state;
  switch (action.type) {
    case 'preset': {
      const index = action.n - 1;
      if (index >= state.slots.length) return touched;
      return { ...touched, index, screen: { kind: 'board' } };
    }
    case 'jump':
      return { ...touched, index: wrap(action.index, state.slots.length), screen: { kind: 'board' } };
    case 'turn':
      if (screen.kind === 'picker') {
        return { ...touched, screen: { ...screen, cursor: wrap(screen.cursor + action.delta, screen.stops.length) } };
      }
      if (screen.kind === 'routes') {
        return { ...touched, screen: { ...screen, cursor: wrap(screen.cursor + action.delta, screen.routes.length + 1) } };
      }
      return { ...touched, index: wrap(state.index + action.delta, state.slots.length), screen: { kind: 'board' } };
    case 'select':
      if (screen.kind === 'routes') {
        if (screen.cursor === screen.routes.length) {
          if (screen.chosen.length === 0) return touched;
          const slot: Slot = { stopId: screen.stop.stopId, stopName: screen.stop.name, routeIds: screen.chosen };
          const slots = [...state.slots, slot];
          return { ...touched, slots, index: slots.length - 1, screen: { kind: 'board' } };
        }
        const id = screen.routes[screen.cursor]!.routeId;
        const chosen = screen.chosen.includes(id) ? screen.chosen.filter(r => r !== id) : [...screen.chosen, id];
        return { ...touched, screen: { ...screen, chosen } };
      }
      if (screen.kind === 'ambient') return { ...touched, screen: { kind: 'board' } };
      return touched;
    case 'back':
      if (screen.kind === 'routes') {
        return touched;
      }
      if (screen.kind === 'picker' || screen.kind === 'ambient') return { ...touched, screen: { kind: 'board' } };
      return touched;
    case 'mode':
      return { ...touched, screen: screen.kind === 'ambient' ? { kind: 'board' } : { kind: 'ambient' } };
    case 'idle':
      if (screen.kind !== 'board') return state;
      if (action.at - state.lastInputAt < IDLE_MS) return state;
      return { ...state, screen: { kind: 'ambient' } };
    case 'jumpCursor':
      if (screen.kind === 'picker' || screen.kind === 'routes') return { ...touched, screen: { ...screen, cursor: action.cursor } };
      return touched;
    case 'openPicker':
      return { ...touched, screen: { kind: 'picker', stops: action.stops, cursor: 0 } };
    case 'openRoutes':
      return { ...touched, screen: { kind: 'routes', stop: action.stop, routes: action.routes, cursor: 0, chosen: [] } };
  }
}
