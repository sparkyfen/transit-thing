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
    const set = { feed: 'wmata', perStop: 1, ambientIdle: false };
    expect(applyConfig(set, 'feed', null).feed).toBe('st');
    expect(applyConfig(set, 'perStop', null).perStop).toBe(3);
    expect(applyConfig(set, 'ambientIdle', null).ambientIdle).toBe(true);
  });
  test('other keys are left for the network client', () => {
    expect(applyConfig(DEFAULT_CONFIG, 'apiBaseUrl', 'https://example.com/')).toBe(DEFAULT_CONFIG);
  });
});
