import { describe, expect, test } from 'bun:test';
import {
  ambientTitle,
  badgeColors,
  badgeLabel,
  clockTime,
  contrastRatio,
  distanceLabel,
  minutesUntil,
  routeHex,
  rowTitle,
  unitsFor,
} from './format';

const now = Date.UTC(2026, 8, 2, 20, 0, 0);
const at = (min: number) => Math.floor(now / 1000) + min * 60;

describe('minutesUntil', () => {
  test('is zero under half a minute', () => {
    expect(minutesUntil(at(0), now)).toBe(0);
    expect(minutesUntil(at(0) + 20, now)).toBe(0);
  });
  test('rounds to whole minutes', () => {
    expect(minutesUntil(at(3), now)).toBe(3);
    expect(minutesUntil(at(3) + 40, now)).toBe(4);
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

describe('distanceLabel', () => {
  test('rounds short distances to ten meters', () => {
    expect(distanceLabel(26, 'metric')).toBe('30 m');
    expect(distanceLabel(994, 'metric')).toBe('990 m');
  });
  test('switches to kilometers once the rounded value reaches 1000', () => {
    expect(distanceLabel(995, 'metric')).toBe('1.0 km');
    expect(distanceLabel(999, 'metric')).toBe('1.0 km');
    expect(distanceLabel(1500, 'metric')).toBe('1.5 km');
  });
  test('never reads as zero', () => {
    expect(distanceLabel(0, 'metric')).toBe('10 m');
    expect(distanceLabel(4, 'metric')).toBe('10 m');
    expect(distanceLabel(0, 'us')).toBe('10 ft');
    expect(distanceLabel(1, 'us')).toBe('10 ft');
  });
  test('rounds short US distances to ten feet', () => {
    expect(distanceLabel(26, 'us')).toBe('90 ft');
    expect(distanceLabel(150, 'us')).toBe('490 ft');
    expect(distanceLabel(160, 'us')).toBe('520 ft');
    expect(distanceLabel(300, 'us')).toBe('980 ft');
    expect(distanceLabel(303, 'us')).toBe('990 ft');
  });
  test('switches to miles once the rounded value reaches 1000 ft', () => {
    expect(distanceLabel(304, 'us')).toBe('0.2 mi');
    expect(distanceLabel(305, 'us')).toBe('0.2 mi');
    expect(distanceLabel(1609, 'us')).toBe('1.0 mi');
    expect(distanceLabel(1931, 'us')).toBe('1.2 mi');
  });
});

describe('unitsFor', () => {
  test('US feeds get feet and miles, everything else meters', () => {
    expect(unitsFor('st')).toBe('us');
    expect(unitsFor('wmata')).toBe('us');
    expect(unitsFor('ttc')).toBe('metric');
    expect(unitsFor('')).toBe('metric');
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

describe('badge text color', () => {
  test('dark text on a light route color', () => {
    expect(badgeColors('FDB71A').fg).toBe('#0a0c0e');
    expect(badgeColors('00A5D2').fg).toBe('#0a0c0e');
  });
  test('light text on a dark route color', () => {
    expect(badgeColors('2B376E').fg).toBe('#efefef');
  });
  test('light text when the color is missing or malformed', () => {
    expect(badgeColors(null).fg).toBe('#efefef');
    expect(badgeColors('zzz').fg).toBe('#efefef');
  });
  test('picks the side with the higher ratio at the boundary', () => {
    expect(badgeColors('737373').fg).toBe('#0a0c0e');
    expect(badgeColors('727272').fg).toBe('#efefef');
  });
});

describe('badgeLabel', () => {
  test('short names stay on the badge', () => {
    expect(badgeLabel('240')).toBe('240');
    expect(badgeLabel('B Line')).toBe('B Line');
    expect(badgeLabel('2 Line')).toBe('2 Line');
  });
  test('word-length names leave the badge to the icon', () => {
    expect(badgeLabel('Bainbridge Ferry')).toBeNull();
    expect(badgeLabel('Line 1A')).toBeNull();
  });
  test('an empty name leaves the badge to the icon', () => {
    expect(badgeLabel('')).toBeNull();
  });
});

describe('rowTitle', () => {
  test('a badged route shows the headsign alone', () => {
    expect(rowTitle('240', 'Renton Newcastle')).toBe('Renton Newcastle');
  });
  test('an unbadged route leads with its name', () => {
    expect(rowTitle('Bainbridge Ferry', 'Bainbridge Island')).toBe('Bainbridge Ferry · Bainbridge Island');
  });
  test('an empty name shows the headsign alone', () => {
    expect(rowTitle('', 'Bainbridge Island')).toBe('Bainbridge Island');
  });
});

describe('ambientTitle', () => {
  test('a badged route reads "to" the headsign', () => {
    expect(ambientTitle('240', 'Renton Newcastle')).toBe('to Renton Newcastle');
  });
  test('an unbadged route reads as its row title', () => {
    expect(ambientTitle('Bainbridge Ferry', 'Bainbridge Island')).toBe('Bainbridge Ferry · Bainbridge Island');
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
