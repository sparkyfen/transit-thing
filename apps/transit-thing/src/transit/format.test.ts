import { describe, expect, test } from 'bun:test';
import { clockTime, countdown, minutesUntil, textOn } from './format';

const now = Date.UTC(2026, 8, 2, 20, 0, 0);
const at = (min: number) => Math.floor(now / 1000) + min * 60;

describe('countdown', () => {
  test('says now under half a minute', () => {
    expect(countdown(at(0), now)).toBe('now');
    expect(countdown(at(0) + 20, now)).toBe('now');
  });
  test('rounds to whole minutes', () => {
    expect(countdown(at(3), now)).toBe('3');
    expect(countdown(at(3) + 40, now)).toBe('4');
  });
  test('never goes negative for a trip already gone', () => {
    expect(minutesUntil(at(-5), now)).toBe(0);
  });
});

describe('clockTime', () => {
  test('formats a local time with minutes', () => {
    expect(clockTime(at(0))).toMatch(/\d{1,2}:\d{2}/);
  });
});

describe('textOn', () => {
  test('dark text on a light route color', () => {
    expect(textOn('FDB71A')).toBe('#0a0c0e');
  });
  test('light text on a dark route color', () => {
    expect(textOn('2B376E')).toBe('#efefef');
  });
  test('light text when the color is missing or malformed', () => {
    expect(textOn(null)).toBe('#efefef');
    expect(textOn('zzz')).toBe('#efefef');
  });
});
