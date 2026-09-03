import { describe, expect, test } from 'bun:test';
import { applyConfig, DEFAULT_CONFIG } from './config';

describe('applyConfig', () => {
  test('perStop takes 1 to 4', () => {
    expect(applyConfig(DEFAULT_CONFIG, 'perStop', '2').perStop).toBe(2);
    expect(applyConfig(DEFAULT_CONFIG, 'perStop', '4').perStop).toBe(4);
  });
  test('bad numbers are ignored', () => {
    expect(applyConfig(DEFAULT_CONFIG, 'perStop', '0')).toBe(DEFAULT_CONFIG);
    expect(applyConfig(DEFAULT_CONFIG, 'perStop', '5')).toBe(DEFAULT_CONFIG);
    expect(applyConfig(DEFAULT_CONFIG, 'perStop', '2.5')).toBe(DEFAULT_CONFIG);
    expect(applyConfig(DEFAULT_CONFIG, 'perStop', 'lots')).toBe(DEFAULT_CONFIG);
    expect(applyConfig(DEFAULT_CONFIG, 'perStop', '')).toBe(DEFAULT_CONFIG);
  });
  test('ambientIdle parses true and false only', () => {
    expect(applyConfig(DEFAULT_CONFIG, 'ambientIdle', 'false').ambientIdle).toBe(false);
    expect(applyConfig({ ...DEFAULT_CONFIG, ambientIdle: false }, 'ambientIdle', 'true').ambientIdle).toBe(true);
    expect(applyConfig(DEFAULT_CONFIG, 'ambientIdle', 'yes')).toBe(DEFAULT_CONFIG);
  });
  test('feed takes a lowercase feed code only', () => {
    expect(applyConfig(DEFAULT_CONFIG, 'feed', 'wmata').feed).toBe('wmata');
    expect(applyConfig(DEFAULT_CONFIG, 'feed', 'ST')).toBe(DEFAULT_CONFIG);
    expect(applyConfig(DEFAULT_CONFIG, 'feed', '')).toBe(DEFAULT_CONFIG);
  });
  test('a deleted key falls back to its default', () => {
    const set = { ...DEFAULT_CONFIG, feed: 'wmata', perStop: 1, ambientIdle: false };
    expect(applyConfig(set, 'feed', null).feed).toBe('st');
    expect(applyConfig(set, 'perStop', null).perStop).toBe(3);
    expect(applyConfig(set, 'ambientIdle', null).ambientIdle).toBe(true);
  });
  test('unknown keys are ignored', () => {
    expect(applyConfig(DEFAULT_CONFIG, 'theme', 'dark')).toBe(DEFAULT_CONFIG);
  });
});

describe('apiBaseUrl and slots', () => {
  test('accepts an https origin and nothing else', () => {
    expect(applyConfig(DEFAULT_CONFIG, 'apiBaseUrl', 'https://tt.example.org').apiBaseUrl).toBe('https://tt.example.org/');
    for (const bad of ['http://tt.example.org', 'https://u:p@tt.example.org/', 'https://tt.example.org/api', 'https://tt.example.org/?x=1', 'https://tt.example.org/#x', 'nonsense']) {
      expect(applyConfig(DEFAULT_CONFIG, 'apiBaseUrl', bad)).toBe(DEFAULT_CONFIG);
    }
    expect(applyConfig({ ...DEFAULT_CONFIG, apiBaseUrl: 'https://x.y/' }, 'apiBaseUrl', null).apiBaseUrl).toBe(DEFAULT_CONFIG.apiBaseUrl);
  });
  test('parses a slots list and drops the whole value on any bad entry', () => {
    const good = JSON.stringify([{ stopId: 'st:1_67652', stopName: 'Bay 9', routeIds: ['st:1_100133'] }]);
    expect(applyConfig(DEFAULT_CONFIG, 'slots', good).slots).toEqual([{ stopId: 'st:1_67652', stopName: 'Bay 9', routeIds: ['st:1_100133'] }]);
    for (const bad of ['[', '{}', JSON.stringify([{ stopId: 'a\tb', stopName: 'x', routeIds: ['r'] }]), JSON.stringify([{ stopId: 'a', stopName: 'x', routeIds: [] }]), JSON.stringify([{ stopId: 'a', stopName: 'x', routeIds: ['r'] }, 7])]) {
      expect(applyConfig(DEFAULT_CONFIG, 'slots', bad)).toBe(DEFAULT_CONFIG);
    }
    expect(applyConfig({ ...DEFAULT_CONFIG, slots: [] }, 'slots', '').slots).toBeNull();
  });
  test('accepts ids with a space, as the MTA feeds use', () => {
    const value = JSON.stringify([{ stopId: 'nymtabus:MTA NYCT_M42', stopName: 'x', routeIds: ['nymtabus:MTA NYCT_M42'] }]);
    expect(applyConfig(DEFAULT_CONFIG, 'slots', value).slots).toEqual([{ stopId: 'nymtabus:MTA NYCT_M42', stopName: 'x', routeIds: ['nymtabus:MTA NYCT_M42'] }]);
  });
  test('trims ids from settings and rejects delimiters and dots only', () => {
    const value = JSON.stringify([{ stopId: ' st:1_67652', stopName: 'x', routeIds: ['st:1_100133 '] }]);
    expect(applyConfig(DEFAULT_CONFIG, 'slots', value).slots).toEqual([{ stopId: 'st:1_67652', stopName: 'x', routeIds: ['st:1_100133'] }]);
    for (const bad of ['a,b', 'a;b', 'a|b', '.', '..', ' ']) {
      expect(applyConfig(DEFAULT_CONFIG, 'slots', JSON.stringify([{ stopId: bad, stopName: 'x', routeIds: ['r'] }]))).toBe(DEFAULT_CONFIG);
      expect(applyConfig(DEFAULT_CONFIG, 'slots', JSON.stringify([{ stopId: 's', stopName: 'x', routeIds: [bad] }]))).toBe(DEFAULT_CONFIG);
    }
  });
  test('a stop and route set listed twice keeps the first entry', () => {
    const value = JSON.stringify([
      { stopId: 's', stopName: 'first', routeIds: ['r1', 'r2'] },
      { stopId: 's', stopName: 'second', routeIds: ['r2', 'r1'] },
      { stopId: 's', stopName: 'other routes', routeIds: ['r1'] },
    ]);
    expect(applyConfig(DEFAULT_CONFIG, 'slots', value).slots).toEqual([
      { stopId: 's', stopName: 'first', routeIds: ['r1', 'r2'] },
      { stopId: 's', stopName: 'other routes', routeIds: ['r1'] },
    ]);
  });
  test('ids take punctuation and non-ascii letters, up to 128 characters', () => {
    const value = JSON.stringify([{ stopId: 'a/b+c#1', stopName: 'x', routeIds: ['ñ', 'r'.repeat(128)] }]);
    expect(applyConfig(DEFAULT_CONFIG, 'slots', value).slots).toEqual([{ stopId: 'a/b+c#1', stopName: 'x', routeIds: ['ñ', 'r'.repeat(128)] }]);
    expect(applyConfig(DEFAULT_CONFIG, 'slots', JSON.stringify([{ stopId: 'r'.repeat(129), stopName: 'x', routeIds: ['r'] }]))).toBe(DEFAULT_CONFIG);
  });
  test('caps the slot count, the routes per slot, and the stop name', () => {
    const entry = (i: number, routes = 1, name = 'x') => ({ stopId: `s${i}`, stopName: name, routeIds: Array.from({ length: routes }, (_, r) => `r${r}`) });
    expect(applyConfig(DEFAULT_CONFIG, 'slots', JSON.stringify(Array.from({ length: 25 }, (_, i) => entry(i)))).slots).toHaveLength(25);
    expect(applyConfig(DEFAULT_CONFIG, 'slots', JSON.stringify(Array.from({ length: 26 }, (_, i) => entry(i))))).toBe(DEFAULT_CONFIG);
    expect(applyConfig(DEFAULT_CONFIG, 'slots', JSON.stringify([entry(0, 25)])).slots?.[0]?.routeIds).toHaveLength(25);
    expect(applyConfig(DEFAULT_CONFIG, 'slots', JSON.stringify([entry(0, 26)]))).toBe(DEFAULT_CONFIG);
    expect(applyConfig(DEFAULT_CONFIG, 'slots', JSON.stringify([entry(0, 1, 'n'.repeat(80))])).slots).toHaveLength(1);
    expect(applyConfig(DEFAULT_CONFIG, 'slots', JSON.stringify([entry(0, 1, 'n'.repeat(81))]))).toBe(DEFAULT_CONFIG);
    expect(applyConfig(DEFAULT_CONFIG, 'slots', JSON.stringify([entry(0, 1, '')]))).toBe(DEFAULT_CONFIG);
  });
});
