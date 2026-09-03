import { describe, expect, test } from 'bun:test';
import { loadSlots, persistSlots, SLOTS_KEY, type SlotStore } from './persist';
import type { Slot } from './transit/types';

const slots: Slot[] = [
  { stopId: 'st:1_67652', stopName: 'Bay 9', routeIds: ['st:1_100133', 'st:40_100239'] },
  { stopId: 'nymtabus:MTA NYCT_M42', stopName: 'x', routeIds: ['r'] },
];

// the store is a daemon rpc; the fake records the calls and answers from a single value
function fakeStore(opts: { value?: string | null; fail?: 'reject' | 'error' } = {}) {
  const calls: string[] = [];
  let value = opts.value ?? null;
  const answer = async (key: string) => {
    if (opts.fail === 'reject') throw new Error('rpc timeout');
    if (opts.fail === 'error') return { ok: false as const, kind: 'domain' as const, error: { error: { type: 'denied' } } };
    return { ok: true as const, response: { key, value } };
  };
  const store = {
    get: async (req: { key: string }) => {
      calls.push(`get ${req.key}`);
      return answer(req.key);
    },
    put: async (req: { key: string; value: string }) => {
      calls.push(`put ${req.key} ${req.value}`);
      value = req.value;
      return answer(req.key);
    },
    delete: async (req: { key: string }) => {
      calls.push(`delete ${req.key}`);
      value = null;
      return answer(req.key);
    },
  } as unknown as SlotStore;
  return { store, calls, value: () => value };
}

describe('persistSlots', () => {
  test('writes the list as json under the slots key', async () => {
    const fake = fakeStore();
    await persistSlots(fake.store, slots);
    expect(fake.calls).toEqual([`put ${SLOTS_KEY} ${JSON.stringify(slots)}`]);
  });
  test('an empty list clears the key', async () => {
    const fake = fakeStore({ value: '[]' });
    await persistSlots(fake.store, []);
    expect(fake.calls).toEqual([`delete ${SLOTS_KEY}`]);
    expect(fake.value()).toBeNull();
  });
  test('a store that rejects or refuses is not fatal', async () => {
    await expect(persistSlots(fakeStore({ fail: 'reject' }).store, slots)).resolves.toBe(false);
    await expect(persistSlots(fakeStore({ fail: 'error' }).store, [])).resolves.toBe(false);
  });
});

describe('loadSlots', () => {
  test('round trips what persistSlots wrote', async () => {
    const fake = fakeStore();
    await persistSlots(fake.store, slots);
    expect(await loadSlots(fake.store)).toEqual(slots);
  });
  test('no entry is an empty list', async () => {
    expect(await loadSlots(fakeStore().store)).toEqual([]);
  });
  test('a value that does not parse as slots is dropped', async () => {
    expect(await loadSlots(fakeStore({ value: '{' }).store)).toEqual([]);
    expect(await loadSlots(fakeStore({ value: JSON.stringify([{ stopId: 'a,b', stopName: 'x', routeIds: ['r'] }]) }).store)).toEqual([]);
  });
  test('a store that rejects or refuses answers null so the load can be retried', async () => {
    expect(await loadSlots(fakeStore({ fail: 'reject' }).store)).toBeNull();
    expect(await loadSlots(fakeStore({ fail: 'error' }).store)).toBeNull();
  });
});

describe('a saved list with one bad entry', () => {
  test('keeps the entries that still parse', async () => {
    const good = { stopId: 'st:1_67652', stopName: 'Bay 9', routeIds: ['st:1_100133'] };
    const bad = { stopId: 'st:1_1', stopName: '', routeIds: ['r'] };
    const store = fakeStore({ value: JSON.stringify([bad, good]) }).store;
    expect(await loadSlots(store)).toEqual([good]);
  });
});
