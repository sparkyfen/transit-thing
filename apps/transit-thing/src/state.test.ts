import { describe, expect, test } from 'bun:test';
import { IDLE_MS, reduce, type State } from './state';
import type { Route, Stop } from './transit/types';

const slot = (n: number) => ({ stopId: `s${n}`, stopName: `Stop ${n}`, routeIds: [`r${n}`] });
const base: State = { slots: [slot(1), slot(2), slot(3)], index: 0, screen: { kind: 'board' }, lastInputAt: 0 };
const stop: Stop = { stopId: 's9', stopCode: '9', name: 'Stop 9', lat: 0, lon: 0 };
const routes: Route[] = [
  { routeId: 'a', name: 'A', color: null, headsigns: [] },
  { routeId: 'b', name: 'B', color: null, headsigns: [] },
];

describe('dial on the board', () => {
  test('turns wrap around the slots', () => {
    expect(reduce(base, { type: 'turn', delta: -1, at: 1 }).index).toBe(2);
    expect(reduce({ ...base, index: 2 }, { type: 'turn', delta: 1, at: 1 }).index).toBe(0);
  });
  test('a turn with no slots stays put', () => {
    expect(reduce({ ...base, slots: [] }, { type: 'turn', delta: 1, at: 1 }).index).toBe(0);
  });
});

describe('presets', () => {
  test('jump to the pinned slot and return to the board', () => {
    const s = reduce({ ...base, screen: { kind: 'ambient' } }, { type: 'preset', n: 3, at: 1 });
    expect(s.index).toBe(2);
    expect(s.screen.kind).toBe('board');
  });
  test('an unpinned preset does nothing', () => {
    expect(reduce(base, { type: 'preset', n: 4, at: 1 }).index).toBe(0);
  });
});

describe('ambient', () => {
  test('mode toggles ambient', () => {
    const on = reduce(base, { type: 'mode', at: 1 });
    expect(on.screen.kind).toBe('ambient');
    expect(reduce(on, { type: 'mode', at: 2 }).screen.kind).toBe('board');
  });
  test('idle falls back to ambient only after the timeout', () => {
    expect(reduce(base, { type: 'idle', at: IDLE_MS - 1 }).screen.kind).toBe('board');
    expect(reduce(base, { type: 'idle', at: IDLE_MS }).screen.kind).toBe('ambient');
  });
  test('idle never leaves the picker', () => {
    const s = reduce(base, { type: 'openPicker', stops: [stop], at: 0 });
    expect(reduce(s, { type: 'idle', at: IDLE_MS * 2 }).screen.kind).toBe('picker');
  });
  test('any input wakes it', () => {
    const on = reduce(base, { type: 'mode', at: 1 });
    expect(reduce(on, { type: 'select', at: 2 }).screen.kind).toBe('board');
    expect(reduce(on, { type: 'turn', delta: 1, at: 2 }).screen.kind).toBe('board');
  });
});

describe('picking a stop', () => {
  test('routes toggle with select and the last row saves', () => {
    let s = reduce(base, { type: 'openRoutes', stop, routes, at: 0 });
    s = reduce(s, { type: 'select', at: 1 });
    s = reduce(s, { type: 'turn', delta: 1, at: 2 });
    s = reduce(s, { type: 'select', at: 3 });
    expect(s.screen.kind === 'routes' && s.screen.chosen).toEqual(['a', 'b']);
    s = reduce(s, { type: 'turn', delta: 1, at: 4 });
    s = reduce(s, { type: 'select', at: 5 });
    expect(s.screen.kind).toBe('board');
    expect(s.slots).toHaveLength(4);
    expect(s.index).toBe(3);
    expect(s.slots[3]).toEqual({ stopId: 's9', stopName: 'Stop 9', routeIds: ['a', 'b'] });
  });
  test('saving with nothing chosen is refused', () => {
    let s = reduce(base, { type: 'openRoutes', stop, routes, at: 0 });
    s = reduce(s, { type: 'turn', delta: -1, at: 1 });
    s = reduce(s, { type: 'select', at: 2 });
    expect(s.screen.kind).toBe('routes');
    expect(s.slots).toHaveLength(3);
  });
  test('back leaves the picker', () => {
    const s = reduce(base, { type: 'openPicker', stops: [stop], at: 0 });
    expect(reduce(s, { type: 'back', at: 1 }).screen.kind).toBe('board');
  });
});
