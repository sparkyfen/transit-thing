import { describe, expect, test } from 'bun:test';
import { badgeColors, clockTime, contrastRatio, countdown, minutesUntil, routeHex, textOn } from './format';

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

describe('routeHex', () => {
  test('accepts six hex digits in either case', () => {
    expect(routeHex('FDB71A')).toBe('#fdb71a');
    expect(routeHex('00a5d2')).toBe('#00a5d2');
  });
  test('rejects anything else', () => {
    expect(routeHex(null)).toBeNull();
    expect(routeHex('')).toBeNull();
    expect(routeHex('zzz')).toBeNull();
    expect(routeHex('#FDB71A')).toBeNull();
    expect(routeHex('fdb71a;background:url(x)')).toBeNull();
  });
});

describe('contrastRatio', () => {
  test('black on white is 21', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
  });
  test('is symmetric', () => {
    expect(contrastRatio('#2b376e', '#efefef')).toBe(contrastRatio('#efefef', '#2b376e'));
  });
});

describe('textOn', () => {
  test('dark text on a light route color', () => {
    expect(textOn('FDB71A')).toBe('#0a0c0e');
    expect(textOn('00A5D2')).toBe('#0a0c0e');
  });
  test('light text on a dark route color', () => {
    expect(textOn('2B376E')).toBe('#efefef');
  });
  test('light text when the color is missing or malformed', () => {
    expect(textOn(null)).toBe('#efefef');
    expect(textOn('zzz')).toBe('#efefef');
  });
  test('picks the side with the higher ratio at the boundary', () => {
    expect(textOn('737373')).toBe('#0a0c0e');
    expect(textOn('727272')).toBe('#efefef');
  });
});

describe('badgeColors', () => {
  test('keeps a color that already reads', () => {
    expect(badgeColors('2B376E')).toEqual({ bg: '#2b376e', fg: '#efefef' });
  });
  test('pulls a mid tone until the text reaches 4.5:1', () => {
    const { bg, fg } = badgeColors('0077C0');
    expect(bg).not.toBe('#0077c0');
    expect(contrastRatio(bg, fg)).toBeGreaterThanOrEqual(4.5);
  });
  test('falls back to the neutral swatch without a color', () => {
    expect(badgeColors(null)).toEqual({ bg: '#2a2f36', fg: '#efefef' });
  });
});
