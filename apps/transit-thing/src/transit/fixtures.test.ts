import { describe, expect, test } from 'bun:test';
import { FIXTURE_SLOTS, fixtureSource } from './fixtures';
import { forSlot } from './trips';
import type { Trip } from './types';

describe('fixtureSource', () => {
  test('a slot following one route sees only that route after forSlot', () => {
    const slot = { stopId: 'st:1_67652', stopName: 'Bellevue Transit Center - Bay 9', routeIds: ['st:40_100239'] };
    let got: Trip[] = [];
    fixtureSource.subscribe(slot, trips => {
      got = trips;
    });
    expect(got.length).toBeGreaterThan(2);
    const mine = forSlot(slot, got);
    expect(mine).toHaveLength(2);
    expect(mine.every(t => t.routeId === 'st:40_100239' && t.routeName === '550')).toBe(true);
  });
  test('every trip carries the name and color of its route', async () => {
    let checked = 0;
    for (const slot of FIXTURE_SLOTS) {
      const routes = await fixtureSource.routesAt(slot.stopId);
      let got: Trip[] = [];
      fixtureSource.subscribe(slot, trips => {
        got = trips;
      });
      for (const trip of got) {
        const route = routes.find(r => r.routeId === trip.routeId);
        expect(route).toBeDefined();
        expect(trip.routeName).toBe(route!.name);
        expect(trip.routeColor).toBe(route!.color);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
  test('at least one nearby stop has no routes, so the empty routes screen stays reachable', async () => {
    const stops = await fixtureSource.stopsNear(null);
    const routes = await Promise.all(stops.map(s => fixtureSource.routesAt(s.stopId)));
    expect(routes.some(r => r.length === 0)).toBe(true);
  });
});

describe('fixture status', () => {
  test('reports live on subscribe and stops after unsubscribe', () => {
    const seen: string[] = [];
    const off = fixtureSource.onStatus((_, status) => seen.push(status));
    const unsub = fixtureSource.subscribe(FIXTURE_SLOTS[0]!, () => {});
    expect(seen).toEqual(['live']);
    unsub();
    off();
    fixtureSource.subscribe(FIXTURE_SLOTS[0]!, () => {})();
    expect(seen).toEqual(['live']);
  });
});
