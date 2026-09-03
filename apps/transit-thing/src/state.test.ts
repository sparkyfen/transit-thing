import { describe, expect, test } from 'bun:test';
import { IDLE_MS, reduce, selectOn, type State } from './state';
import type { Route, Stop } from './transit/types';

const slot = (n: number) => ({ stopId: `s${n}`, stopName: `Stop ${n}`, routeIds: [`r${n}`] });
const base: State = { slots: [slot(1), slot(2), slot(3)], index: 0, screen: { kind: 'board' }, origin: null, lastInputAt: 0 };
const stop: Stop = { stopId: 's9', stopCode: '9', name: 'Stop 9', lat: 0, lon: 0 };
const stop2: Stop = { stopId: 's10', stopCode: '10', name: 'Stop 10', lat: 0, lon: 0 };
const routes: Route[] = [
  { routeId: 'a', name: 'A', color: null, headsigns: [] },
  { routeId: 'b', name: 'B', color: null, headsigns: [] },
];

const picker = (s: State = base): State =>
  reduce(reduce(s, { type: 'openPicker', token: 1, at: 0 }), { type: 'stops', token: 1, stops: [stop, stop2] });
const routesScreen = (s: State = base): State => reduce(picker(s), { type: 'openRoutes', token: 1, stop, routes });

describe('dial on the board', () => {
  test('turns wrap around the slots', () => {
    expect(reduce(base, { type: 'turn', delta: -1, at: 1 }).index).toBe(2);
    expect(reduce({ ...base, index: 2 }, { type: 'turn', delta: 1, at: 1 }).index).toBe(0);
  });
  test('a turn with no slots stays put', () => {
    expect(reduce({ ...base, slots: [] }, { type: 'turn', delta: 1, at: 1 }).index).toBe(0);
  });
  test('a press opens the stop picker', () => {
    expect(selectOn(base.screen)).toEqual({ kind: 'openPicker' });
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
    expect(reduce(picker(), { type: 'idle', at: IDLE_MS * 2 }).screen.kind).toBe('picker');
  });
  test('any input wakes it', () => {
    const on = reduce(base, { type: 'mode', at: 1 });
    expect(reduce(on, { type: 'select', at: 2 }).screen.kind).toBe('board');
    expect(reduce(on, { type: 'turn', delta: 1, at: 2 }).screen.kind).toBe('board');
  });
});

describe('loading stops', () => {
  test('the picker opens empty and fills when its request lands', () => {
    const open = reduce(base, { type: 'openPicker', token: 1, at: 0 });
    expect(open.screen).toMatchObject({ kind: 'picker', status: 'loading', stops: [], cursor: 0 });
    expect(picker().screen).toMatchObject({ status: 'ready', stops: [stop, stop2] });
  });
  test('a reply for a request the user already left is dropped', () => {
    const open = reduce(base, { type: 'openPicker', token: 1, at: 0 });
    const gone = reduce(open, { type: 'back', at: 1 });
    expect(reduce(gone, { type: 'stops', token: 1, stops: [stop] }).screen.kind).toBe('board');
    const reopened = reduce(gone, { type: 'openPicker', token: 2, at: 2 });
    expect(reduce(reopened, { type: 'stops', token: 1, stops: [stop] }).screen).toMatchObject({ status: 'loading', stops: [] });
  });
  test('a failed load shows a retry row the dial can reach', () => {
    const failed = reduce(reduce(base, { type: 'openPicker', token: 1, at: 0 }), { type: 'stopsFailed', token: 1 });
    expect(failed.screen).toMatchObject({ status: 'stopsFailed', stops: [] });
    const onRetry = reduce(failed, { type: 'turn', delta: 1, at: 1 });
    expect(selectOn(onRetry.screen)).toEqual({ kind: 'retry' });
    expect(reduce(onRetry, { type: 'turn', delta: 1, at: 2 }).screen).toMatchObject({ cursor: 0 });
  });
  test('a failed route load keeps the stops and flags it', () => {
    const s = reduce(picker(), { type: 'routesFailed', token: 1 });
    expect(s.screen).toMatchObject({ status: 'routesFailed', stops: [stop, stop2] });
  });
});

describe('picking a stop', () => {
  test('the first row asks for location, the rest are stops', () => {
    const s = picker();
    expect(selectOn(s.screen)).toEqual({ kind: 'locate' });
    const second = reduce(reduce(s, { type: 'turn', delta: 1, at: 1 }), { type: 'turn', delta: 1, at: 2 });
    expect(selectOn(second.screen)).toEqual({ kind: 'pickStop', stop: stop2 });
    expect(reduce(second, { type: 'turn', delta: 1, at: 3 }).screen).toMatchObject({ cursor: 0 });
  });
  test('routes open from the picker only for the live request', () => {
    expect(routesScreen().screen).toMatchObject({ kind: 'routes', stop, routes, cursor: 0, chosen: [] });
    expect(reduce(picker(), { type: 'openRoutes', token: 7, stop, routes }).screen.kind).toBe('picker');
    expect(reduce(base, { type: 'openRoutes', token: 1, stop, routes }).screen.kind).toBe('board');
  });
  test('routes toggle with select and the last row saves', () => {
    let s = routesScreen();
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
  test('touch toggles a route by id without moving the cursor', () => {
    let s = reduce(routesScreen(), { type: 'toggleRoute', routeId: 'b', at: 1 });
    expect(s.screen).toMatchObject({ chosen: ['b'], cursor: 0 });
    s = reduce(s, { type: 'toggleRoute', routeId: 'b', at: 2 });
    expect(s.screen).toMatchObject({ chosen: [] });
    expect(reduce(s, { type: 'toggleRoute', routeId: 'nope', at: 3 }).screen).toMatchObject({ chosen: [] });
  });
  test('touch saves the chosen routes', () => {
    const s = reduce(reduce(routesScreen(), { type: 'toggleRoute', routeId: 'a', at: 1 }), { type: 'saveSlot', at: 2 });
    expect(s.screen.kind).toBe('board');
    expect(s.slots[3]).toEqual({ stopId: 's9', stopName: 'Stop 9', routeIds: ['a'] });
  });
  test('saving with nothing chosen is refused', () => {
    let s = routesScreen();
    s = reduce(s, { type: 'turn', delta: -1, at: 1 });
    s = reduce(s, { type: 'select', at: 2 });
    expect(s.screen.kind).toBe('routes');
    expect(reduce(s, { type: 'saveSlot', at: 3 }).slots).toHaveLength(3);
  });
  test('back leaves the picker', () => {
    expect(reduce(picker(), { type: 'back', at: 1 }).screen.kind).toBe('board');
  });
  test('back on the routes returns to the stop list at the same stop', () => {
    const s = reduce(reduce(picker(), { type: 'openRoutes', token: 1, stop: stop2, routes }), { type: 'back', at: 1 });
    expect(s.screen).toMatchObject({ kind: 'picker', status: 'ready', stops: [stop, stop2], cursor: 2 });
  });
});

describe('location', () => {
  test('the origin lives only while picking', () => {
    const s = reduce(picker(), { type: 'origin', origin: { lat: 47.615, lon: -122.195 } });
    expect(s.origin).toEqual({ lat: 47.615, lon: -122.195 });
    const onRoutes = reduce(s, { type: 'openRoutes', token: 1, stop, routes });
    expect(onRoutes.origin).not.toBeNull();
    expect(reduce(onRoutes, { type: 'back', at: 1 }).origin).not.toBeNull();
    expect(reduce(s, { type: 'back', at: 1 }).origin).toBeNull();
    expect(reduce(s, { type: 'preset', n: 1, at: 1 }).origin).toBeNull();
  });
});
