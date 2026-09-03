import type { Slot, Trip } from './types';

const GRACE_MS = 30_000;

export function slotKey(slot: Slot): string {
  return `${slot.stopId}|${[...slot.routeIds].sort().join(',')}`;
}

// which subscriptions to open and close so a slot change touches only its own socket
export function diffKeys(have: Iterable<string>, want: string[]): { add: string[]; remove: string[] } {
  const current = new Set(have);
  const wanted = new Set(want);
  return { add: [...wanted].filter(k => !current.has(k)), remove: [...current].filter(k => !wanted.has(k)) };
}

export function forSlot(slot: Slot, trips: Trip[]): Trip[] {
  return trips.filter(t => slot.routeIds.includes(t.routeId));
}

export function soonestUpcoming(trips: Trip[], nowMs: number, n: number): Trip[] {
  return trips
    .filter(t => t.arrivalTime * 1000 >= nowMs - GRACE_MS)
    .sort((a, b) => a.arrivalTime - b.arrivalTime)
    .slice(0, n);
}

export function everySlotHasFeed(feeds: Map<string, unknown>, slots: Slot[]): boolean {
  return slots.every(slot => feeds.has(slotKey(slot)));
}

export interface NextTrip {
  slot: Slot;
  trip: Trip;
}

export function nextAcrossSlots(feeds: Map<string, { trips: Trip[] }>, slots: Slot[], nowMs: number, cutoffMs: number): NextTrip | null {
  let best: NextTrip | null = null;
  for (const slot of slots) {
    const trip = soonestUpcoming(feeds.get(slotKey(slot))?.trips ?? [], nowMs, 1)[0];
    if (trip && (!best || trip.arrivalTime < best.trip.arrivalTime)) best = { slot, trip };
  }
  return best && best.trip.arrivalTime * 1000 - nowMs <= cutoffMs ? best : null;
}
