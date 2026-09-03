import type { Slot, Trip } from './types';

const GRACE_MS = 30_000;

export function slotKey(slot: Slot): string {
  return `${slot.stopId}|${[...slot.routeIds].sort().join(',')}`;
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
