import { describe, expect, test } from 'bun:test';
import { parseFix } from './devFlags';

describe('parseFix', () => {
  test('needs both coordinates', () => {
    expect(parseFix('47.6155')).toBeNull();
    expect(parseFix('')).toBeNull();
  });
  test('rejects a coordinate that is not a number', () => {
    expect(parseFix('47.6155,west')).toBeNull();
    expect(parseFix('abc,-122.1947')).toBeNull();
  });
  test('reads a good pair', () => {
    expect(parseFix('47.6155,-122.1947')).toEqual({ lat: 47.6155, lon: -122.1947 });
  });
});
