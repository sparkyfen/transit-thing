import { describe, expect, test } from 'bun:test';
import { haversine, locate, round3 } from './geo';

describe('haversine', () => {
  test('bay 9 to bay 8 at bellevue transit center is about 25 m', () => {
    const d = haversine(47.615509, -122.194725, 47.615501, -122.194389);
    expect(d).toBeGreaterThan(23);
    expect(d).toBeLessThan(29);
  });
  test('the same point is 0', () => {
    expect(haversine(47.6, -122.2, 47.6, -122.2)).toBe(0);
  });
});

describe('round3', () => {
  test('keeps three decimals', () => {
    expect(round3(47.615509)).toBe(47.616);
    expect(round3(-122.194725)).toBe(-122.195);
  });
});

describe('locate', () => {
  test('rounds a good fix', async () => {
    const geo = { getOnce: async () => ({ ok: true as const, response: { position: { lat: 47.615509, lon: -122.194725 } } }) };
    expect(await locate(geo)).toEqual({ lat: 47.616, lon: -122.195 });
  });
  test('null when the daemon refuses', async () => {
    expect(await locate({ getOnce: async () => ({ ok: false as const }) })).toBeNull();
  });
  test('null when the request throws', async () => {
    expect(await locate({ getOnce: () => Promise.reject(new Error('timeout')) })).toBeNull();
  });
});
