import { describe, expect, test } from 'bun:test';
import { lateness, rememberFirstSeen } from './delay';
import type { Trip } from './types';

const trip = (id: string, arrivalTime: number, delaySeconds?: number): Trip => ({
  tripId: id,
  stopId: 's',
  routeId: 'r',
  routeName: '240',
  routeColor: null,
  stopName: 'S',
  headsign: 'H',
  arrivalTime,
  departureTime: arrivalTime,
  isRealtime: true,
  delaySeconds,
});

describe('lateness', () => {
  test('uses delaySeconds when the server sends it', () => {
    expect(lateness(trip('a', 1000, 150), new Map())).toEqual({ kind: 'late', minutes: 3 });
    expect(lateness(trip('a', 1000, -90), new Map())).toEqual({ kind: 'early' });
    expect(lateness(trip('a', 1000, 30), new Map())).toBeNull();
  });
  test('falls back to drift from the first prediction seen', () => {
    const seen = rememberFirstSeen(new Map(), [trip('a', 1000)]);
    expect(lateness(trip('a', 1000), seen)).toBeNull();
    expect(lateness(trip('a', 1130), seen)).toEqual({ kind: 'late', minutes: 2 });
    expect(lateness(trip('a', 920), seen)).toEqual({ kind: 'early' });
  });
  test('a trip never seen before has no drift', () => {
    expect(lateness(trip('b', 5000), new Map([['a', 1000]]))).toBeNull();
  });
});

describe('rememberFirstSeen', () => {
  test('keeps the earliest baseline and drops trips that left', () => {
    let seen = rememberFirstSeen(new Map(), [trip('a', 1000), trip('b', 2000)]);
    seen = rememberFirstSeen(seen, [trip('a', 1100), trip('c', 3000)]);
    expect([...seen.entries()]).toEqual([
      ['a', 1000],
      ['c', 3000],
    ]);
  });
});
