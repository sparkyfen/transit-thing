import type { BridgethingClient } from '@bridgething/client';
import { parseSlots } from './config';
import type { Slot } from './transit/types';

export type SlotStore = Pick<BridgethingClient['store'], 'get' | 'put' | 'delete'>;

export const SLOTS_KEY = 'slots';

// the stops the dial added, kept on the device; a store that answers with something else is treated as empty,
// and a store call that fails answers null so the caller can try again on the next daemon open
export async function loadSlots(store: SlotStore): Promise<Slot[] | null> {
  try {
    const r = await store.get({ key: SLOTS_KEY });
    if (!r.ok) return null;
    if (r.response.value === null) return [];
    return parseSlots(r.response.value) ?? [];
  } catch {
    return null;
  }
}

export async function persistSlots(store: SlotStore, slots: Slot[]): Promise<void> {
  try {
    if (slots.length === 0) await store.delete({ key: SLOTS_KEY });
    else await store.put({ key: SLOTS_KEY, value: JSON.stringify(slots) });
  } catch {
    // the store is best effort: a write that fails leaves the last saved list in place
  }
}
