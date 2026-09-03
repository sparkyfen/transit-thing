import { describe, expect, test } from 'bun:test';
import { bbox, parseRoutes, parseServerMessage, parseStops, parseTrip, routesAtUrl, stopsWithinUrl, subscribeMessage, wsUrl } from './api';

const slot = { stopId: 'st:1_67652', stopName: 'Bay 9', routeIds: ['st:1_100133', 'st:40_100239'] };

describe('urls', () => {
  test('websocket url follows the base scheme', () => {
    expect(wsUrl('https://tt.horner.tj/')).toBe('wss://tt.horner.tj/');
    expect(wsUrl('http://10.20.100.80:3000')).toBe('ws://10.20.100.80:3000/');
  });
  test('stops and routes urls encode their parts', () => {
    expect(stopsWithinUrl('https://tt.horner.tj', 'st', { lat: 47.615, lon: -122.195 })).toBe(
      'https://tt.horner.tj/stops/within/-122.205,47.606,-122.185,47.624?feedCode=st',
    );
    expect(routesAtUrl('https://tt.horner.tj/', 'st:1_67652')).toBe('https://tt.horner.tj/stops/st%3A1_67652/routes');
  });
  test('the bounding box is built around the center of a 0.01 degree cell', () => {
    expect(bbox({ lat: 47.6155, lon: -122.1947 })).toBe('-122.205,47.606,-122.185,47.624');
    // every fix inside the cell sends the same box, so the corners reveal only the cell
    expect(bbox({ lat: 47.6101, lon: -122.1999 })).toBe(bbox({ lat: 47.6199, lon: -122.1901 }));
    expect(bbox({ lat: 47.6099, lon: -122.1947 })).not.toBe(bbox({ lat: 47.6155, lon: -122.1947 }));
  });
  test('the bounding box stays under the server cap at every latitude', () => {
    for (const lat of [0, 32.7, 47.6, 60]) {
      const [w, s, e, n] = bbox({ lat, lon: -122.1947 }).split(',').map(Number) as [number, number, number, number];
      const km2 = (n - s) * 111 * (e - w) * 111 * Math.cos((lat * Math.PI) / 180);
      expect(km2).toBeLessThan(5);
      expect(km2).toBeGreaterThan(1);
    }
  });
});

describe('subscribeMessage', () => {
  test('pairs every route with the stop and clamps the limit', () => {
    const msg = JSON.parse(subscribeMessage(slot, 3));
    expect(msg.event).toBe('schedule:subscribe');
    expect(msg.data.routeStopPairs).toBe('st:1_100133,st:1_67652;st:40_100239,st:1_67652');
    expect(msg.data.limit).toBe(3);
    expect(JSON.parse(subscribeMessage(slot, 99)).data.limit).toBe(20);
    expect(JSON.parse(subscribeMessage(slot, 0)).data.limit).toBe(1);
  });
  test('sends the first 25 routes only', () => {
    const routeIds = Array.from({ length: 30 }, (_, i) => `r${i}`);
    const pairs = JSON.parse(subscribeMessage({ ...slot, routeIds }, 3)).data.routeStopPairs.split(';');
    expect(pairs).toHaveLength(25);
    expect(pairs.at(-1)).toBe('r24,st:1_67652');
  });
});

describe('parseServerMessage', () => {
  const trip = {
    tripId: 'st:1_842666271',
    stopId: 'st:1_67652',
    routeId: 'st:1_100133',
    routeName: '240',
    routeColor: 'FDB71A',
    stopName: 'Bay 9',
    headsign: 'Renton Newcastle',
    arrivalTime: 1788392700,
    departureTime: 1788392700,
    vehicle: null,
    isRealtime: true,
  };
  test('reads a schedule', () => {
    const msg = parseServerMessage(JSON.stringify({ event: 'schedule', data: { trips: [trip] } }));
    expect(msg.kind).toBe('schedule');
    if (msg.kind !== 'schedule') return;
    expect(msg.trips).toHaveLength(1);
    expect(msg.trips[0]).toMatchObject({ routeName: '240', isRealtime: true, delaySeconds: undefined });
  });
  test('keeps delaySeconds from the fork and drops malformed trips', () => {
    const msg = parseServerMessage(
      JSON.stringify({ event: 'schedule', data: { trips: [{ ...trip, delaySeconds: 150 }, { ...trip, arrivalTime: 'soon' }, 'junk', { tripId: 'x' }] } }),
    );
    expect(msg.kind === 'schedule' && msg.trips.map(t => t.delaySeconds)).toEqual([150]);
  });
  test('times must be finite numbers, never strings or null', () => {
    expect(parseTrip({ ...trip, arrivalTime: '1788392700' })).toBeNull();
    expect(parseTrip({ ...trip, arrivalTime: null })).toBeNull();
    expect(parseTrip({ ...trip, arrivalTime: Infinity })).toBeNull();
    expect(parseTrip({ ...trip, departureTime: '1788392700' })).toBeNull();
    expect(parseTrip({ ...trip, departureTime: null })).toBeNull();
    expect(parseTrip({ ...trip, delaySeconds: '150' })?.delaySeconds).toBeUndefined();
    expect(parseTrip({ ...trip, delaySeconds: null })?.delaySeconds).toBeUndefined();
    expect(parseTrip({ ...trip, delaySeconds: NaN })?.delaySeconds).toBeUndefined();
    expect(parseTrip({ ...trip, delaySeconds: -30 })?.delaySeconds).toBe(-30);
  });
  test('recognizes heartbeats and errors', () => {
    expect(parseServerMessage(JSON.stringify({ event: 'heartbeat', data: null })).kind).toBe('heartbeat');
    expect(parseServerMessage(JSON.stringify({ status: 'error', message: 'Bad Request' }))).toEqual({ kind: 'error', message: 'Bad Request' });
    expect(parseServerMessage(JSON.stringify({ event: 'error', data: { message: 'Too many route-stop pairs' } }))).toEqual({ kind: 'error', message: 'Too many route-stop pairs' });
    expect(parseServerMessage(JSON.stringify({ event: 'exception', data: { status: 'error', message: 'Bad Request' } }))).toEqual({ kind: 'error', message: 'Bad Request' });
    expect(parseServerMessage(JSON.stringify({ event: 'exception' }))).toEqual({ kind: 'error', message: 'server error' });
    expect(parseServerMessage('not json').kind).toBe('error');
    expect(parseServerMessage(JSON.stringify({ event: 'other' })).kind).toBe('ignore');
  });
  test('a missing route color stays null', () => {
    expect(parseTrip({ ...trip, routeColor: null })?.routeColor).toBeNull();
  });
});

describe('parseStops and parseRoutes', () => {
  test('keep well formed entries only', () => {
    const stops = parseStops([{ stopId: 'a', stopCode: '1', name: 'A', lat: 1, lon: 2 }, { stopId: 'b', lat: 'x', lon: 2 }, null]);
    expect(stops).toEqual([{ stopId: 'a', stopCode: '1', name: 'A', lat: 1, lon: 2 }]);
    const routes = parseRoutes([{ routeId: 'r', name: '240', color: 'FDB71A', headsigns: ['X', 3] }, { name: 'no id' }]);
    expect(routes).toEqual([{ routeId: 'r', name: '240', color: 'FDB71A', headsigns: ['X'] }]);
    expect(parseStops({ not: 'a list' })).toEqual([]);
  });
  test('coordinates must be numbers', () => {
    expect(parseStops([{ stopId: 'a', lat: '1', lon: 2 }])).toEqual([]);
    expect(parseStops([{ stopId: 'a', lat: null, lon: 2 }])).toEqual([]);
  });
  test('drop ids outside the id charset and cut names to 80 characters', () => {
    const long = 'x'.repeat(100);
    expect(parseStops([{ stopId: 'a b', lat: 1, lon: 2 }, { stopId: 'a'.repeat(65), lat: 1, lon: 2 }, { stopId: 'ok', name: long, stopCode: long, lat: 1, lon: 2 }])).toEqual([
      { stopId: 'ok', stopCode: 'x'.repeat(80), name: 'x'.repeat(80), lat: 1, lon: 2 },
    ]);
    expect(parseRoutes([{ routeId: '<r>' }, { routeId: 'r', name: long, headsigns: [long] }])).toEqual([{ routeId: 'r', name: 'x'.repeat(80), color: null, headsigns: ['x'.repeat(80)] }]);
  });
  test('keep the first 200 stops and 100 routes', () => {
    const stops = Array.from({ length: 250 }, (_, i) => ({ stopId: `s${i}`, lat: 1, lon: 2 }));
    expect(parseStops(stops)).toHaveLength(200);
    expect(parseStops(stops).at(-1)?.stopId).toBe('s199');
    const routes = Array.from({ length: 150 }, (_, i) => ({ routeId: `r${i}` }));
    expect(parseRoutes(routes)).toHaveLength(100);
  });
});
