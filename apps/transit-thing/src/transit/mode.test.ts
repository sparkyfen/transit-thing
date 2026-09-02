import { describe, expect, test } from 'bun:test';
import { modeFor } from './mode';

describe('modeFor', () => {
  test('numbered routes are buses', () => {
    expect(modeFor('240')).toBe('bus');
    expect(modeFor('B Line')).toBe('bus');
  });
  test('link and sounder are rail', () => {
    expect(modeFor('1 Line')).toBe('rail');
    expect(modeFor('2 Line')).toBe('rail');
    expect(modeFor('Sounder S Line')).toBe('rail');
  });
  test('ferries by name or headsign', () => {
    expect(modeFor('Bainbridge Ferry')).toBe('ferry');
    expect(modeFor('773', 'West Seattle Water Taxi')).toBe('ferry');
  });
  test('streetcars', () => {
    expect(modeFor('First Hill Streetcar')).toBe('tram');
  });
});
