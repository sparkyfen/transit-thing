import { describe, expect, test } from 'bun:test';
import { clockTime } from './format';
import { boardFresh, boardStatus, dataAsOf, nextLink, RECOVERED_MS, waitingText, type Link } from './status';

const link = (status: Link['status'], recoveredAt: number | null = null): Link => ({ status, recoveredAt });

const at = Date.UTC(2026, 8, 2, 20, 0, 0);

describe('boardStatus', () => {
  test('connecting before any data', () => {
    expect(boardStatus('connecting', null)).toEqual({ text: 'Connecting', tone: 'soft' });
  });
  test('silent while open', () => {
    expect(boardStatus('open', null)).toBeNull();
    expect(boardStatus('open', at)).toBeNull();
  });
  test('offline with the time of the last data', () => {
    expect(boardStatus('closed', at)).toEqual({ text: `Offline, as of ${clockTime(at / 1000)}`, tone: 'warn' });
    expect(boardStatus('connecting', at)).toEqual({ text: `Offline, as of ${clockTime(at / 1000)}`, tone: 'warn' });
  });
  test('offline without data', () => {
    expect(boardStatus('closed', null)).toEqual({ text: 'Offline', tone: 'warn' });
    expect(boardStatus('closing', null)).toEqual({ text: 'Offline', tone: 'warn' });
  });
});

describe('dataAsOf', () => {
  test('data that arrived before the socket ever opened does not count', () => {
    expect(dataAsOf(false, at)).toBeNull();
    expect(boardStatus('connecting', dataAsOf(false, at))).toEqual({ text: 'Connecting', tone: 'soft' });
  });
  test('data after the first open does', () => {
    expect(dataAsOf(true, at)).toBe(at);
    expect(dataAsOf(true, null)).toBeNull();
  });
});

describe('boardStatus with the feed link', () => {
  test('a lost feed reads reconnecting in the notice tone once there was data', () => {
    expect(boardStatus('open', at, link('reconnecting'))).toEqual({ text: `Reconnecting, as of ${clockTime(at / 1000)}`, tone: 'notice' });
  });
  test('the header stays empty while the feed has never delivered', () => {
    expect(boardStatus('open', null, link('reconnecting'))).toBeNull();
    expect(boardStatus('open', null, link('connecting'))).toBeNull();
    expect(boardStatus('open', 1, link('connecting'))).toBeNull();
    expect(boardStatus('open', 1, link('live'))).toBeNull();
  });
  test('the daemon link wins over the feed link', () => {
    expect(boardStatus('closed', null, link('live'))).toEqual({ text: 'Offline', tone: 'warn' });
  });
  test('a recovered feed reads up to date for a few seconds', () => {
    expect(boardStatus('open', at, link('live', at), at + 1)).toEqual({ text: 'Up to date', tone: 'soft' });
    expect(boardStatus('open', at, link('live', at), at + RECOVERED_MS)).toBeNull();
    expect(boardStatus('closed', at, link('live', at), at + 1)?.tone).toBe('warn');
  });
});

describe('nextLink', () => {
  test('stamps the recovery only on reconnecting to live', () => {
    expect(nextLink(undefined, 'connecting', 1)).toEqual({ status: 'connecting', recoveredAt: null });
    expect(nextLink(link('connecting'), 'live', 2)).toEqual({ status: 'live', recoveredAt: null });
    expect(nextLink(link('reconnecting'), 'live', 3)).toEqual({ status: 'live', recoveredAt: 3 });
    expect(nextLink(link('live', 3), 'live', 4)).toEqual({ status: 'live', recoveredAt: 3 });
  });
});

describe('boardFresh', () => {
  test('only a live feed over an open daemon link is fresh', () => {
    expect(boardFresh('open', 'live')).toBe(true);
    // a slot that is dialing after a resubscribe still holds its old trips; they are not fresh until a schedule lands
    expect(boardFresh('open', 'connecting')).toBe(false);
    expect(boardFresh('open', 'reconnecting')).toBe(false);
    expect(boardFresh('open', null)).toBe(false);
    expect(boardFresh('closed', 'live')).toBe(false);
    expect(boardFresh('connecting', 'live')).toBe(false);
  });
});

describe('waitingText', () => {
  test('names the transit server while the feed dials, otherwise waits', () => {
    expect(waitingText('open', 'connecting')).toBe('Connecting to the transit server.');
    expect(waitingText('open', 'reconnecting')).toBe('Reconnecting to the transit server.');
    expect(waitingText('open', 'live')).toBe('Waiting for arrivals.');
    expect(waitingText('closed', 'reconnecting')).toBe('Waiting for arrivals.');
  });
});
