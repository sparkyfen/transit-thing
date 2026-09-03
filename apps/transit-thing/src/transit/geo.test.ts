import { describe, expect, test } from 'bun:test';
import { haversine } from './geo';

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
