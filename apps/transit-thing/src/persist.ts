import type { BridgethingClient } from '@bridgething/client';
import { MAX_SLOTS, parseSlot } from './config';
import { slotKey } from './transit/trips';
import type { Slot } from './transit/types';

export type SlotStore = Pick<BridgethingClient['store'], 'get' | 'put' | 'delete'>;

export const SLOTS_KEY = 'slots';

// the stops the dial added, kept on the device; entries that no longer parse are dropped one by one so a single
// bad stop never empties the board, and a store call that fails answers null so the caller tries again on the next open
export async function loadSlots(store: SlotStore): Promise<Slot[] | null> {
  try {
    const r = await store.get({ key: SLOTS_KEY });
    if (!r.ok) return null;
    if (r.response.value === null) return [];
    let raw: unknown;
    try {
      raw = JSON.parse(r.response.value);
    } catch {
      return [];
    }
    if (!Array.isArray(raw)) return [];
    const slots: Slot[] = [];
    const keys = new Set<string>();
    for (const entry of raw) {
      const slot = parseSlot(entry);
      if (!slot || keys.has(slotKey(slot))) continue;
      keys.add(slotKey(slot));
      slots.push(slot);
      if (slots.length === MAX_SLOTS) break;
    }
    return slots;
  } catch {
    return null;
  }
}

// true when the store took the write; the caller keeps its last known saved list otherwise
export async function persistSlots(store: SlotStore, slots: Slot[]): Promise<boolean> {
  try {
    const kept = slots.slice(0, MAX_SLOTS);
    const r = kept.length === 0 ? await store.delete({ key: SLOTS_KEY }) : await store.put({ key: SLOTS_KEY, value: JSON.stringify(kept) });
    return r.ok;
  } catch {
    return false;
  }
}
