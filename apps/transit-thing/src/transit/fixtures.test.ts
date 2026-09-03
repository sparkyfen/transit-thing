import { describe, expect, test } from 'bun:test';
import { fixtureSource } from './fixtures';
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
});
