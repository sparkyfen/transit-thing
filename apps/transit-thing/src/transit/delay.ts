import type { Trip } from './types';

export type Lateness = { kind: 'late' | 'early'; minutes: number } | null;

const LATE_S = 120;
const EARLY_S = -60;

// servers on the delaySeconds fork say it outright; elsewhere the first prediction seen per trip is the baseline
export function lateness(trip: Trip, firstSeen: Map<string, number>): Lateness {
  const baseline = firstSeen.get(trip.tripId);
  const delay = trip.delaySeconds ?? (baseline === undefined ? 0 : trip.arrivalTime - baseline);
  if (delay >= LATE_S) return { kind: 'late', minutes: Math.round(delay / 60) };
  if (delay <= EARLY_S) return { kind: 'early', minutes: Math.round(-delay / 60) };
  return null;
}

// a baseline older than this is for a trip that has come and gone
const KEEP_S = 3600;

// remembers the first predicted arrival per trip; a trip that drops out of the top of the list for a frame keeps its
// baseline until its predicted arrival is an hour in the past
export function rememberFirstSeen(prev: Map<string, number>, trips: Trip[], nowMs: number): Map<string, number> {
  const next = new Map<string, number>();
  const cutoff = nowMs / 1000 - KEEP_S;
  for (const [id, arrivalTime] of prev) if (arrivalTime >= cutoff) next.set(id, arrivalTime);
  for (const t of trips) if (!next.has(t.tripId)) next.set(t.tripId, t.arrivalTime);
  return next;
}
