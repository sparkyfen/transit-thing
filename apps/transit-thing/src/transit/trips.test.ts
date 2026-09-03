import { describe, expect, test } from 'bun:test';
import { forSlot, slotKey, soonestUpcoming } from './trips';
import type { Trip } from './types';

const now = Date.UTC(2026, 8, 2, 20, 0, 0);
const trip = (id: string, offsetSec: number, routeId = 'r1'): Trip => ({
  tripId: id,
  stopId: 's1',
  routeId,
  routeName: '240',
  routeColor: null,
  stopName: 'Stop',
  headsign: 'Somewhere',
  arrivalTime: Math.floor(now / 1000) + offsetSec,
  departureTime: Math.floor(now / 1000) + offsetSec,
  isRealtime: false,
});

describe('soonestUpcoming', () => {
  test('sorts unsorted input and drops trips that already left', () => {
    const rows = soonestUpcoming([trip('c', 600), trip('gone', -120), trip('a', 60), trip('b', 300)], now, 3);
    expect(rows.map(t => t.tripId)).toEqual(['a', 'b', 'c']);
  });
  test('keeps a trip inside the 30 s grace and slices to n', () => {
    const rows = soonestUpcoming([trip('late', -20), trip('a', 60), trip('b', 120)], now, 2);
    expect(rows.map(t => t.tripId)).toEqual(['late', 'a']);
  });
  test('a trip 31 s gone is dropped', () => {
    expect(soonestUpcoming([trip('gone', -31)], now, 3)).toEqual([]);
  });
});

describe('forSlot', () => {
  test('keeps only the routes the slot follows', () => {
    const slot = { stopId: 's1', stopName: 'Stop', routeIds: ['r2'] };
    expect(forSlot(slot, [trip('a', 60, 'r1'), trip('b', 60, 'r2')]).map(t => t.tripId)).toEqual(['b']);
  });
});

describe('slotKey', () => {
  test('two slots on one stop with different routes get different keys', () => {
    expect(slotKey({ stopId: 's1', stopName: 'Stop', routeIds: ['r1'] })).not.toBe(slotKey({ stopId: 's1', stopName: 'Stop', routeIds: ['r2'] }));
  });
  test('route order does not matter', () => {
    expect(slotKey({ stopId: 's1', stopName: 'Stop', routeIds: ['r2', 'r1'] })).toBe(slotKey({ stopId: 's1', stopName: 'Stop', routeIds: ['r1', 'r2'] }));
  });
});
