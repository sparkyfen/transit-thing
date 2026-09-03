import type { Trip } from './types';

export type Lateness = { kind: 'late' | 'early'; minutes: number } | null;

export const LATE_S = 120;
export const EARLY_S = -60;

// servers on the delaySeconds fork say it outright; elsewhere the first prediction seen per trip is the baseline
export function lateness(trip: Trip, firstSeen: Map<string, number>): Lateness {
  const delay = trip.delaySeconds ?? (firstSeen.has(trip.tripId) ? trip.arrivalTime - firstSeen.get(trip.tripId)! : 0);
  if (delay >= LATE_S) return { kind: 'late', minutes: Math.round(delay / 60) };
  if (delay <= EARLY_S) return { kind: 'early', minutes: Math.round(-delay / 60) };
  return null;
}

// a scheduled time has no prediction to drift from, and a stale one while the daemon is away says nothing about now
export function showLateness(connected: boolean, trip: Trip): boolean {
  return connected && trip.isRealtime;
}

// remembers the first predicted arrival per trip and forgets trips that left the feed
export function rememberFirstSeen(prev: Map<string, number>, trips: Trip[]): Map<string, number> {
  const next = new Map<string, number>();
  for (const t of trips) next.set(t.tripId, prev.get(t.tripId) ?? t.arrivalTime);
  return next;
}
