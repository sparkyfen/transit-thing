import { describe, expect, test } from 'bun:test';
import { clockTime } from './format';
import { boardStatus, dataAsOf } from './status';

const at = Date.UTC(2026, 8, 2, 20, 0, 0);

describe('boardStatus', () => {
  test('connecting before any data', () => {
    expect(boardStatus('connecting', null)).toEqual({ text: 'Connecting', warn: false });
  });
  test('silent while open', () => {
    expect(boardStatus('open', null)).toBeNull();
    expect(boardStatus('open', at)).toBeNull();
  });
  test('offline with the time of the last data', () => {
    expect(boardStatus('closed', at)).toEqual({ text: `Offline, as of ${clockTime(at / 1000)}`, warn: true });
    expect(boardStatus('connecting', at)).toEqual({ text: `Offline, as of ${clockTime(at / 1000)}`, warn: true });
  });
  test('offline without data', () => {
    expect(boardStatus('closed', null)).toEqual({ text: 'Offline', warn: true });
    expect(boardStatus('closing', null)).toEqual({ text: 'Offline', warn: true });
  });
});

describe('dataAsOf', () => {
  test('data that arrived before the socket ever opened does not count', () => {
    expect(dataAsOf(false, at)).toBeNull();
    expect(boardStatus('connecting', dataAsOf(false, at))).toEqual({ text: 'Connecting', warn: false });
  });
  test('data after the first open does', () => {
    expect(dataAsOf(true, at)).toBe(at);
    expect(dataAsOf(true, null)).toBeNull();
  });
});
