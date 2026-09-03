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
      'https://tt.horner.tj/stops/within/-122.205,47.605,-122.185,47.625?feedCode=st',
    );
    expect(routesAtUrl('https://tt.horner.tj/', 'st:1_67652')).toBe('https://tt.horner.tj/stops/st%3A1_67652/routes');
  });
  test('the bounding box sits on a 0.005 degree grid and stays under the server cap', () => {
    expect(bbox({ lat: 47.6155, lon: -122.1947 })).toBe('-122.205,47.605,-122.185,47.625');
    const [w, s, e, n] = bbox({ lat: 47.6155, lon: -122.1947 }).split(',').map(Number) as [number, number, number, number];
    const km2 = (n - s) * 111 * (e - w) * 111 * Math.cos((47.6 * Math.PI) / 180);
    expect(km2).toBeLessThan(5);
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
  test('recognizes heartbeats and errors', () => {
    expect(parseServerMessage(JSON.stringify({ event: 'heartbeat', data: null })).kind).toBe('heartbeat');
    expect(parseServerMessage(JSON.stringify({ status: 'error', message: 'Bad Request' }))).toEqual({ kind: 'error', message: 'Bad Request' });
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
});
