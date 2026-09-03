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
    for (const bad of ['http://tt.example.org', 'https://u:p@tt.example.org/', 'https://tt.example.org/api', 'https://tt.example.org/?x=1', 'nonsense']) {
      expect(applyConfig(DEFAULT_CONFIG, 'apiBaseUrl', bad)).toBe(DEFAULT_CONFIG);
    }
    expect(applyConfig({ ...DEFAULT_CONFIG, apiBaseUrl: 'https://x.y/' }, 'apiBaseUrl', null).apiBaseUrl).toBe(DEFAULT_CONFIG.apiBaseUrl);
  });
  test('parses a slots list and drops the whole value on any bad entry', () => {
    const good = JSON.stringify([{ stopId: 'st:1_67652', stopName: 'Bay 9', routeIds: ['st:1_100133'] }]);
    expect(applyConfig(DEFAULT_CONFIG, 'slots', good).slots).toEqual([{ stopId: 'st:1_67652', stopName: 'Bay 9', routeIds: ['st:1_100133'] }]);
    for (const bad of ['[', '{}', JSON.stringify([{ stopId: 'a b', stopName: 'x', routeIds: ['r'] }]), JSON.stringify([{ stopId: 'a', stopName: 'x', routeIds: [] }]), JSON.stringify([{ stopId: 'a', stopName: 'x', routeIds: ['r'] }, 7])]) {
      expect(applyConfig(DEFAULT_CONFIG, 'slots', bad)).toBe(DEFAULT_CONFIG);
    }
    expect(applyConfig({ ...DEFAULT_CONFIG, slots: [] }, 'slots', '').slots).toBeNull();
  });
});
