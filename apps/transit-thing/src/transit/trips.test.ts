import { describe, expect, test } from 'bun:test';
import { everySlotHasFeed, forSlot, nextAcrossSlots, slotKey, soonestUpcoming } from './trips';
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

describe('nextAcrossSlots', () => {
  const a = { stopId: 's1', stopName: 'Stop 1', routeIds: ['r1'] };
  const b = { stopId: 's2', stopName: 'Stop 2', routeIds: ['r1'] };
  const cutoff = 20 * 60_000;
  const feeds = (ta: Trip[], tb: Trip[]) =>
    new Map([
      [slotKey(a), { trips: ta }],
      [slotKey(b), { trips: tb }],
    ]);
  test('picks the earlier trip across two slots', () => {
    const next = nextAcrossSlots(feeds([trip('a', 600)], [trip('b', 120)]), [a, b], now, cutoff);
    expect(next?.trip.tripId).toBe('b');
    expect(next?.slot).toBe(b);
  });
  test('nothing when the earliest trip is past the cutoff', () => {
    expect(nextAcrossSlots(feeds([trip('a', 21 * 60)], []), [a, b], now, cutoff)).toBeNull();
  });
  test('nothing when every slot is empty', () => {
    expect(nextAcrossSlots(feeds([], []), [a, b], now, cutoff)).toBeNull();
  });
});

describe('everySlotHasFeed', () => {
  const a = { stopId: 's1', stopName: 'A', routeIds: ['r1'] };
  const b = { stopId: 's2', stopName: 'B', routeIds: ['r2'] };
  test('is false until every slot has a feed', () => {
    expect(everySlotHasFeed(new Map(), [a, b])).toBe(false);
    // vacuously true; callers gate on having stops first
    expect(everySlotHasFeed(new Map(), [])).toBe(true);
    expect(everySlotHasFeed(new Map([[slotKey(a), { trips: [] }]]), [a, b])).toBe(false);
    expect(everySlotHasFeed(new Map([[slotKey(a), { trips: [] }], [slotKey(b), { trips: [] }]]), [a, b])).toBe(true);
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
