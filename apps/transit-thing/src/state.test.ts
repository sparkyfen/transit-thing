import { describe, expect, test } from 'bun:test';
import { IDLE_MS, LOCATE_ROW, pickerMessage, reduce, selectOn, visibleCursor, type State } from './state';
import type { Route, Stop } from './transit/types';

const slot = (n: number) => ({ stopId: `s${n}`, stopName: `Stop ${n}`, routeIds: [`r${n}`] });
const base: State = { slots: [slot(1), slot(2), slot(3)], index: 0, screen: { kind: 'board' }, origin: null, lastInputAt: 0 };
const stop: Stop = { stopId: 's9', stopCode: '9', name: 'Stop 9', lat: 0, lon: 0 };
const stop2: Stop = { stopId: 's10', stopCode: '10', name: 'Stop 10', lat: 0, lon: 0 };
const routes: Route[] = [
  { routeId: 'a', name: 'A', color: null, headsigns: [] },
  { routeId: 'b', name: 'B', color: null, headsigns: [] },
];

const opened = (s: State = base): State => reduce(reduce(s, { type: 'openPicker', token: 1, at: 0 }), { type: 'stopsRequested', token: 1, reqId: 1 });
const picker = (s: State = base): State => reduce(opened(s), { type: 'stops', token: 1, reqId: 1, stops: [stop, stop2] });
const asked = (s: State = picker(), reqId = 2): State => reduce(s, { type: 'routesRequested', token: 1, reqId });
const routesScreen = (s: State = base): State => reduce(asked(picker(s)), { type: 'openRoutes', token: 1, reqId: 2, stop, routes });

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
    const open = opened();
    expect(open.screen).toMatchObject({ kind: 'picker', load: 'loading', locate: 'idle', alert: null, latestReq: 1, stops: [], cursor: 0 });
    expect(picker().screen).toMatchObject({ load: 'ready', stops: [stop, stop2] });
  });
  test('a reply for a request the user already left is dropped', () => {
    const gone = reduce(opened(), { type: 'back', at: 1 });
    expect(reduce(gone, { type: 'stops', token: 1, reqId: 1, stops: [stop] }).screen.kind).toBe('board');
    const reopened = reduce(gone, { type: 'openPicker', token: 2, at: 2 });
    expect(reduce(reopened, { type: 'stops', token: 1, reqId: 1, stops: [stop] }).screen).toMatchObject({ load: 'loading', stops: [] });
  });
  test('a failed load shows a retry row the dial can reach', () => {
    const failed = reduce(opened(), { type: 'stopsFailed', token: 1, reqId: 1 });
    expect(failed.screen).toMatchObject({ load: 'failed', stops: [] });
    const onRetry = reduce(failed, { type: 'turn', delta: 1, at: 1 });
    expect(selectOn(onRetry.screen)).toEqual({ kind: 'retry' });
    expect(reduce(onRetry, { type: 'turn', delta: 1, at: 2 }).screen).toMatchObject({ cursor: 0 });
  });
  test('a failed route load keeps the stops and flags it until the next route request', () => {
    const s = reduce(asked(), { type: 'routesFailed', token: 1, reqId: 2 });
    expect(s.screen).toMatchObject({ load: 'ready', alert: 'routes', stops: [stop, stop2] });
    expect(pickerMessage('ready', 2, false)).toBe('2 stops found.');
    expect(reduce(s, { type: 'stops', token: 1, reqId: 1, stops: [stop] }).screen).toMatchObject({ alert: 'routes', stops: [stop] });
    expect(reduce(s, { type: 'routesRequested', token: 1, reqId: 3 }).screen).toMatchObject({ alert: null, latestRoutesReq: 3 });
    expect(reduce(s, { type: 'routesRequested', token: 2, reqId: 3 }).screen).toMatchObject({ alert: 'routes', latestRoutesReq: 2 });
    expect(reduce(base, { type: 'routesRequested', token: 1, reqId: 3 }).screen.kind).toBe('board');
  });
  test('a route request leaves another alert alone', () => {
    const s = reduce(reduce(picker(), { type: 'locating', token: 1 }), { type: 'locateFailed', token: 1 });
    expect(reduce(s, { type: 'routesRequested', token: 1, reqId: 2 }).screen).toMatchObject({ alert: 'locate' });
  });
  test('a routes reply for an older request that lands after a newer one is ignored', () => {
    const s = asked(asked(picker(), 2), 3);
    expect(reduce(s, { type: 'openRoutes', token: 1, reqId: 2, stop, routes }).screen.kind).toBe('picker');
    expect(reduce(s, { type: 'routesFailed', token: 1, reqId: 2 }).screen).toMatchObject({ alert: null });
    expect(reduce(s, { type: 'openRoutes', token: 1, reqId: 3, stop, routes }).screen).toMatchObject({ kind: 'routes', stop });
    expect(reduce(s, { type: 'routesFailed', token: 1, reqId: 3 }).screen).toMatchObject({ alert: 'routes' });
  });
  test('a new stops request clears the alert so a repeat failure announces again', () => {
    let s = reduce(picker(), { type: 'stopsFailed', token: 1, reqId: 1 });
    expect(s.screen).toMatchObject({ alert: 'refresh' });
    s = reduce(s, { type: 'stopsRequested', token: 1, reqId: 2 });
    expect(s.screen).toMatchObject({ alert: null, load: 'ready', latestReq: 2, stops: [stop, stop2] });
    expect(reduce(s, { type: 'stopsFailed', token: 1, reqId: 2 }).screen).toMatchObject({ alert: 'refresh' });
  });
  test('a retry after a failed load shows the loading message in place of the retry row', () => {
    const failed = reduce(opened(), { type: 'stopsFailed', token: 1, reqId: 1 });
    const onRetry = reduce(failed, { type: 'turn', delta: 1, at: 1 });
    const s = reduce(onRetry, { type: 'stopsRequested', token: 1, reqId: 2 });
    expect(s.screen).toMatchObject({ load: 'loading', cursor: 1, latestReq: 2 });
    expect(pickerMessage('loading', 0, false)).toBe('Loading stops.');
    expect(selectOn(s.screen)).toBeNull();
    expect(reduce(s, { type: 'stops', token: 1, reqId: 2, stops: [stop] }).screen).toMatchObject({ load: 'ready', stops: [stop], cursor: 1 });
    expect(reduce(s, { type: 'stops', token: 1, reqId: 2, stops: [] }).screen).toMatchObject({ load: 'ready', cursor: 0 });
  });
  test('the retry window shows the cursor on the location row and ignores the dial', () => {
    const failed = reduce(opened(), { type: 'stopsFailed', token: 1, reqId: 1 });
    const onRetry = reduce(failed, { type: 'turn', delta: 1, at: 1 });
    const s = reduce(onRetry, { type: 'stopsRequested', token: 1, reqId: 2 });
    expect(s.screen).toMatchObject({ load: 'loading', stops: [], cursor: 1 });
    expect(s.screen.kind === 'picker' && visibleCursor(s.screen)).toBe(LOCATE_ROW);
    expect(reduce(s, { type: 'turn', delta: 1, at: 2 }).screen).toMatchObject({ cursor: 1 });
    expect(reduce(s, { type: 'turn', delta: -1, at: 2 }).screen).toMatchObject({ cursor: 1 });
    expect(selectOn(s.screen)).toBeNull();
    const moved = reduce(picker(), { type: 'turn', delta: 1, at: 3 });
    expect(moved.screen.kind === 'picker' && visibleCursor(moved.screen)).toBe(1);
    expect(reduce(opened(), { type: 'turn', delta: 1, at: 4 }).screen).toMatchObject({ cursor: 0 });
  });
  test('a failed retry leaves the cursor on the retry row', () => {
    const failed = reduce(opened(), { type: 'stopsFailed', token: 1, reqId: 1 });
    const onRetry = reduce(failed, { type: 'turn', delta: 1, at: 1 });
    const again = reduce(reduce(onRetry, { type: 'stopsRequested', token: 1, reqId: 2 }), { type: 'stopsFailed', token: 1, reqId: 2 });
    expect(again.screen).toMatchObject({ load: 'failed', cursor: 1 });
    expect(selectOn(again.screen)).toEqual({ kind: 'retry' });
  });
  test('a reply that lands after a failed fix keeps the location error', () => {
    const failed = reduce(reduce(picker(), { type: 'locating', token: 1 }), { type: 'locateFailed', token: 1 });
    expect(reduce(failed, { type: 'stops', token: 1, reqId: 1, stops: [stop] }).screen).toMatchObject({ load: 'ready', locate: 'failed', stops: [stop] });
    const retried = reduce(reduce(opened(), { type: 'stopsFailed', token: 1, reqId: 1 }), { type: 'stops', token: 1, reqId: 1, stops: [stop] });
    expect(retried.screen).toMatchObject({ load: 'ready', stops: [stop] });
  });
  test('a failed refresh after a failed fix keeps the stops and adds an alert', () => {
    const six = [1, 2, 3, 4, 5, 6].map(n => ({ ...stop, stopId: `s${n}` }));
    let s = reduce(picker(), { type: 'stops', token: 1, reqId: 1, stops: six });
    s = reduce(reduce(s, { type: 'locating', token: 1 }), { type: 'locateFailed', token: 1 });
    s = reduce(s, { type: 'stopsFailed', token: 1, reqId: 1 });
    expect(s.screen).toMatchObject({ load: 'ready', locate: 'failed', alert: 'refresh' });
    expect(s.screen.kind === 'picker' && s.screen.stops).toHaveLength(6);
    expect(selectOn(reduce(s, { type: 'cursor', cursor: 3, at: 1 }).screen)).toEqual({ kind: 'pickStop', stop: six[2]! });
    expect(reduce(s, { type: 'stops', token: 1, reqId: 1, stops: six }).screen).toMatchObject({ alert: 'locate', locate: 'failed' });
  });
  test('a retry keeps the location alert, and so does its reply', () => {
    const failed = reduce(opened(), { type: 'stopsFailed', token: 1, reqId: 1 });
    let s = reduce(reduce(failed, { type: 'locating', token: 1 }), { type: 'locateFailed', token: 1 });
    s = reduce(s, { type: 'stopsRequested', token: 1, reqId: 2 });
    expect(s.screen).toMatchObject({ load: 'loading', locate: 'failed', alert: 'locate' });
    expect(reduce(s, { type: 'stops', token: 1, reqId: 2, stops: [stop] }).screen).toMatchObject({ load: 'ready', alert: 'locate', stops: [stop] });
  });
  test('a failed fix after a failed load keeps the retry row', () => {
    const failed = reduce(opened(), { type: 'stopsFailed', token: 1, reqId: 1 });
    const s = reduce(reduce(failed, { type: 'locating', token: 1 }), { type: 'locateFailed', token: 1 });
    expect(s.screen).toMatchObject({ load: 'failed', locate: 'failed', stops: [] });
    expect(pickerMessage('failed', 0, false)).toBeNull();
    expect(selectOn(reduce(s, { type: 'turn', delta: 1, at: 1 }).screen)).toEqual({ kind: 'retry' });
  });
  test('failures for another request or screen are dropped', () => {
    expect(reduce(picker(), { type: 'stopsFailed', token: 2, reqId: 1 }).screen).toMatchObject({ load: 'ready', alert: null, stops: [stop, stop2] });
    expect(reduce(asked(), { type: 'routesFailed', token: 2, reqId: 2 }).screen).toMatchObject({ alert: null });
    expect(reduce(base, { type: 'stopsFailed', token: 1, reqId: 1 }).screen.kind).toBe('board');
    expect(reduce(base, { type: 'routesFailed', token: 1, reqId: 2 }).screen.kind).toBe('board');
  });
  test('a shorter list or a failure pulls a deep cursor back into range', () => {
    let s = picker();
    s = reduce(reduce(s, { type: 'turn', delta: 1, at: 1 }), { type: 'turn', delta: 1, at: 2 });
    expect(s.screen).toMatchObject({ cursor: 2 });
    expect(reduce(s, { type: 'stops', token: 1, reqId: 1, stops: [stop] }).screen).toMatchObject({ cursor: 1 });
    expect(reduce(s, { type: 'stops', token: 1, reqId: 1, stops: [] }).screen).toMatchObject({ cursor: 0 });
    expect(reduce(reduce(s, { type: 'stops', token: 1, reqId: 1, stops: [] }), { type: 'stopsFailed', token: 1, reqId: 1 }).screen).toMatchObject({ cursor: 0 });
  });
  test('a reply for an older request that lands after a newer one is ignored', () => {
    let s = reduce(opened(), { type: 'stopsRequested', token: 1, reqId: 2 });
    expect(reduce(s, { type: 'stops', token: 1, reqId: 1, stops: [stop] }).screen).toMatchObject({ load: 'loading', stops: [] });
    expect(reduce(s, { type: 'stopsFailed', token: 1, reqId: 1 }).screen).toMatchObject({ load: 'loading' });
    s = reduce(s, { type: 'stops', token: 1, reqId: 2, stops: [stop, stop2] });
    expect(s.screen).toMatchObject({ load: 'ready', stops: [stop, stop2] });
    expect(reduce(s, { type: 'stops', token: 1, reqId: 1, stops: [stop] }).screen).toMatchObject({ stops: [stop, stop2] });
    expect(reduce(s, { type: 'stopsFailed', token: 1, reqId: 1 }).screen).toMatchObject({ alert: null });
  });
  test('a request for another picker does not become the latest', () => {
    expect(reduce(picker(), { type: 'stopsRequested', token: 2, reqId: 5 }).screen).toMatchObject({ latestReq: 1 });
    expect(reduce(base, { type: 'stopsRequested', token: 1, reqId: 5 }).screen.kind).toBe('board');
  });
  test('locating from the retry row leaves the cursor on it', () => {
    const failed = reduce(opened(), { type: 'stopsFailed', token: 1, reqId: 1 });
    const onRetry = reduce(failed, { type: 'turn', delta: 1, at: 1 });
    expect(reduce(onRetry, { type: 'locating', token: 1 }).screen).toMatchObject({ load: 'failed', locate: 'locating', cursor: 1 });
  });
});

describe('locating', () => {
  const far: Stop = { stopId: 'far', stopCode: '3', name: 'Far', lat: 47.7, lon: -122.3 };
  const near: Stop = { stopId: 'near', stopCode: '1', name: 'Near', lat: 47.6151, lon: -122.1951 };
  const mid: Stop = { stopId: 'mid', stopCode: '2', name: 'Mid', lat: 47.62, lon: -122.2 };
  test('the location row waits while a fix is in flight and ignores a second press', () => {
    const s = reduce(picker(), { type: 'locating', token: 1 });
    expect(s.screen).toMatchObject({ locate: 'locating', stops: [stop, stop2] });
    expect(selectOn(s.screen)).toBeNull();
    expect(reduce(s, { type: 'locating', token: 1 })).toBe(s);
    expect(reduce(picker(), { type: 'locating', token: 9 }).screen).toMatchObject({ locate: 'idle' });
  });
  test('a failed fix shows the alert and frees the row', () => {
    const s = reduce(reduce(picker(), { type: 'locating', token: 1 }), { type: 'locateFailed', token: 1 });
    expect(s.screen).toMatchObject({ locate: 'failed', stops: [stop, stop2] });
    expect(s.origin).toBeNull();
    expect(selectOn(s.screen)).toEqual({ kind: 'locate' });
  });
  test('a good fix clears the alert and sorts the stops by distance', () => {
    let s = reduce(picker(), { type: 'stops', token: 1, reqId: 1, stops: [far, near, mid] });
    s = reduce(reduce(s, { type: 'locating', token: 1 }), { type: 'origin', token: 1, origin: { lat: 47.615, lon: -122.195 } });
    expect(s.screen).toMatchObject({ locate: 'idle' });
    s = reduce(s, { type: 'stops', token: 1, reqId: 1, stops: [far, near, mid] });
    expect(s.screen.kind === 'picker' && s.screen.stops.map(x => x.stopId)).toEqual(['near', 'mid', 'far']);
  });
  test('a fix sorts the stops already on screen before the next reply', () => {
    let s = reduce(picker(), { type: 'stops', token: 1, reqId: 1, stops: [far, near, mid] });
    s = reduce(reduce(s, { type: 'locating', token: 1 }), { type: 'origin', token: 1, origin: { lat: 47.615, lon: -122.195 } });
    expect(s.screen.kind === 'picker' && s.screen.stops.map(x => x.stopId)).toEqual(['near', 'mid', 'far']);
  });
  test('stops keep the server order without an origin', () => {
    const s = reduce(picker(), { type: 'stops', token: 1, reqId: 1, stops: [far, near, mid] });
    expect(s.screen.kind === 'picker' && s.screen.stops.map(x => x.stopId)).toEqual(['far', 'near', 'mid']);
  });
  test('a fix or a failure for another request is dropped', () => {
    const s = reduce(picker(), { type: 'locating', token: 1 });
    expect(reduce(s, { type: 'locateFailed', token: 2 })).toBe(s);
    expect(reduce(s, { type: 'origin', token: 2, origin: { lat: 47.615, lon: -122.195 } })).toBe(s);
    expect(reduce(base, { type: 'origin', token: 1, origin: { lat: 47.615, lon: -122.195 } }).origin).toBeNull();
  });
});

describe('alerts', () => {
  test('the newest failure is the one shown', () => {
    let s = reduce(reduce(picker(), { type: 'locating', token: 1 }), { type: 'locateFailed', token: 1 });
    expect(s.screen).toMatchObject({ alert: 'locate' });
    s = reduce(s, { type: 'stopsFailed', token: 1, reqId: 1 });
    expect(s.screen).toMatchObject({ alert: 'refresh', locate: 'failed' });
    s = reduce(asked(s), { type: 'routesFailed', token: 1, reqId: 2 });
    expect(s.screen).toMatchObject({ alert: 'routes', locate: 'failed' });
    s = reduce(s, { type: 'locating', token: 1 });
    expect(s.screen).toMatchObject({ alert: 'routes', locate: 'locating' });
    s = reduce(s, { type: 'locateFailed', token: 1 });
    expect(s.screen).toMatchObject({ alert: 'locate' });
    expect(reduce(s, { type: 'locating', token: 1 }).screen).toMatchObject({ alert: null, locate: 'locating' });
  });
});

describe('pickerMessage', () => {
  test('says what the list is doing when it is empty', () => {
    expect(pickerMessage('loading', 0, false)).toBe('Loading stops.');
    expect(pickerMessage('ready', 0, false)).toBe('No stops found.');
  });
  test('counts the stops once they are in', () => {
    expect(pickerMessage('ready', 1, false)).toBe('1 stop found.');
    expect(pickerMessage('ready', 2, false)).toBe('2 stops found.');
  });
  test('says the list is sorted when a location was used and there is something to sort', () => {
    expect(pickerMessage('ready', 1, true)).toBe('1 stop found.');
    expect(pickerMessage('ready', 2, true)).toBe('2 stops found, closest first.');
  });
  test('keeps the count while locating so a failed fix does not repeat it', () => {
    const s = reduce(picker(), { type: 'locating', token: 1 });
    expect(s.screen).toMatchObject({ load: 'ready', locate: 'locating' });
    expect(s.screen.kind === 'picker' && pickerMessage(s.screen.load, s.screen.stops.length, s.origin !== null)).toBe('2 stops found.');
  });
  test('stays quiet after a failed load', () => {
    expect(pickerMessage('failed', 0, false)).toBeNull();
  });
});

describe('tapping a row', () => {
  test('moves the picker cursor to the tapped row within range', () => {
    expect(reduce(picker(), { type: 'cursor', cursor: 2, at: 1 }).screen).toMatchObject({ cursor: 2 });
    expect(reduce(picker(), { type: 'cursor', cursor: 9, at: 1 }).screen).toMatchObject({ cursor: 2 });
    expect(reduce(picker(), { type: 'cursor', cursor: -1, at: 1 }).screen).toMatchObject({ cursor: 0 });
  });
  test('moves the routes cursor as far as the save row', () => {
    expect(reduce(routesScreen(), { type: 'cursor', cursor: 2, at: 1 }).screen).toMatchObject({ cursor: 2 });
    expect(reduce(routesScreen(), { type: 'cursor', cursor: 5, at: 1 }).screen).toMatchObject({ cursor: 2 });
  });
  test('does nothing on the board', () => {
    expect(reduce(base, { type: 'cursor', cursor: 1, at: 1 }).screen.kind).toBe('board');
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
    expect(reduce(asked(), { type: 'openRoutes', token: 7, reqId: 2, stop, routes }).screen.kind).toBe('picker');
    expect(reduce(base, { type: 'openRoutes', token: 1, reqId: 2, stop, routes }).screen.kind).toBe('board');
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
  test('touch toggles a route by id and moves the cursor to it', () => {
    let s = reduce(routesScreen(), { type: 'toggleRoute', routeId: 'b', at: 1 });
    expect(s.screen).toMatchObject({ chosen: ['b'], cursor: 1 });
    s = reduce(s, { type: 'toggleRoute', routeId: 'b', at: 2 });
    expect(s.screen).toMatchObject({ chosen: [], cursor: 1 });
    expect(reduce(s, { type: 'toggleRoute', routeId: 'nope', at: 3 }).screen).toMatchObject({ chosen: [], cursor: 1 });
  });
  test('saving a stop and routes already pinned selects that slot instead of adding one', () => {
    const r2: Route = { routeId: 'r2', name: 'R2', color: null, headsigns: [] };
    const pinned = { ...stop, stopId: 's2', name: 'Stop 2' };
    let s = reduce(asked(), { type: 'openRoutes', token: 1, reqId: 2, stop: pinned, routes: [r2] });
    s = reduce(reduce(s, { type: 'toggleRoute', routeId: 'r2', at: 1 }), { type: 'saveSlot', at: 2 });
    expect(s.screen.kind).toBe('board');
    expect(s.slots).toHaveLength(3);
    expect(s.index).toBe(1);
  });
  test('touch saves the chosen routes', () => {
    const s = reduce(reduce(routesScreen(), { type: 'toggleRoute', routeId: 'a', at: 1 }), { type: 'saveSlot', at: 2 });
    expect(s.screen.kind).toBe('board');
    expect(s.slots[3]).toEqual({ stopId: 's9', stopName: 'Stop 9', routeIds: ['a'] });
  });
  test('a stop with no routes is a dead end only until back', () => {
    const s = reduce(asked(), { type: 'openRoutes', token: 1, reqId: 2, stop, routes: [] });
    expect(s.screen).toMatchObject({ kind: 'routes', routes: [], cursor: 0 });
    expect(selectOn(s.screen)).toBeNull();
    const pressed = reduce(s, { type: 'select', at: 1 });
    expect(pressed.screen).toMatchObject({ kind: 'routes', routes: [] });
    expect(pressed.slots).toHaveLength(3);
    expect(reduce(s, { type: 'turn', delta: 1, at: 2 }).screen).toMatchObject({ cursor: 0 });
    expect(reduce(s, { type: 'back', at: 3 }).screen).toMatchObject({ kind: 'picker', load: 'ready', cursor: 1 });
  });
  test('mode during picking goes to ambient', () => {
    expect(reduce(picker(), { type: 'mode', at: 1 }).screen.kind).toBe('ambient');
    expect(reduce(routesScreen(), { type: 'mode', at: 1 }).screen.kind).toBe('ambient');
  });
  test('saving with nothing chosen is refused', () => {
    let s = routesScreen();
    s = reduce(s, { type: 'turn', delta: -1, at: 1 });
    s = reduce(s, { type: 'select', at: 2 });
    expect(s.screen.kind).toBe('routes');
    expect(reduce(s, { type: 'saveSlot', at: 3 }).slots).toHaveLength(3);
  });
  test('tapping the disabled save only moves the cursor to it', () => {
    const s = reduce(reduce(routesScreen(), { type: 'cursor', cursor: 2, at: 1 }), { type: 'saveSlot', at: 2 });
    expect(s.screen).toMatchObject({ kind: 'routes', cursor: 2, chosen: [] });
    expect(s.slots).toHaveLength(3);
  });
  test('back leaves the picker', () => {
    expect(reduce(picker(), { type: 'back', at: 1 }).screen.kind).toBe('board');
  });
  test('back on the routes returns to the stop list at the same stop', () => {
    const s = reduce(reduce(asked(), { type: 'openRoutes', token: 1, reqId: 2, stop: stop2, routes }), { type: 'back', at: 1 });
    expect(s.screen).toMatchObject({ kind: 'picker', load: 'ready', locate: 'idle', stops: [stop, stop2], cursor: 2, latestRoutesReq: 0 });
  });
  test('back on the routes finds the stop by id in a replaced list, or lands on the first stop', () => {
    const copy = { ...stop2 };
    const replaced = reduce(asked(), { type: 'stops', token: 1, reqId: 1, stops: [copy, { ...stop }] });
    const same = reduce(reduce(replaced, { type: 'openRoutes', token: 1, reqId: 2, stop: stop2, routes }), { type: 'back', at: 1 });
    expect(same.screen).toMatchObject({ kind: 'picker', cursor: 1 });
    const missing = reduce(reduce(replaced, { type: 'openRoutes', token: 1, reqId: 2, stop: { ...stop, stopId: 'zz' }, routes }), { type: 'back', at: 1 });
    expect(missing.screen).toMatchObject({ kind: 'picker', cursor: 1 });
    expect(selectOn(missing.screen)).toEqual({ kind: 'pickStop', stop: copy });
  });
  test('back on the routes keeps the latest request so its reply still lands', () => {
    let s = reduce(picker(), { type: 'stopsRequested', token: 1, reqId: 4 });
    s = reduce(reduce(asked(s), { type: 'openRoutes', token: 1, reqId: 2, stop, routes }), { type: 'back', at: 1 });
    expect(s.screen).toMatchObject({ kind: 'picker', latestReq: 4 });
    expect(reduce(s, { type: 'stops', token: 1, reqId: 4, stops: [stop] }).screen).toMatchObject({ load: 'ready', stops: [stop] });
    expect(reduce(s, { type: 'stops', token: 1, reqId: 3, stops: [stop] }).screen).toMatchObject({ stops: [stop, stop2] });
  });
});

describe('location', () => {
  test('the origin lives only while picking', () => {
    const s = reduce(picker(), { type: 'origin', token: 1, origin: { lat: 47.615, lon: -122.195 } });
    expect(s.origin).toEqual({ lat: 47.615, lon: -122.195 });
    const onRoutes = reduce(asked(s), { type: 'openRoutes', token: 1, reqId: 2, stop, routes });
    expect(onRoutes.origin).not.toBeNull();
    expect(reduce(onRoutes, { type: 'back', at: 1 }).origin).not.toBeNull();
    expect(reduce(s, { type: 'back', at: 1 }).origin).toBeNull();
    expect(reduce(s, { type: 'preset', n: 1, at: 1 }).origin).toBeNull();
  });
});
