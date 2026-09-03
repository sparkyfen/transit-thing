import { parseSlots } from './config';
import type { Origin } from './transit/geo';
import type { Slot } from './transit/types';

// ?at=lat,lon stands in for the phone's fix
export function parseFix(value: string): Origin | null {
  const parts = value.split(',');
  if (parts.length !== 2) return null;
  const [lat, lon] = parts.map(Number) as [number, number];
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

// dev flags: ?fixtures runs on canned data, ?direct talks to the api from the browser instead of through the phone,
// ?slots=<json> seeds the board; none of them exist in a production build
const flags = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
export const USE_FIXTURES: boolean = import.meta.env.DEV && flags.has('fixtures');
export const DIRECT: boolean = import.meta.env.DEV && flags.has('direct');
export const SEED_SLOTS: Slot[] | null = import.meta.env.DEV ? parseSlots(flags.get('slots') ?? '') : null;
export const FAKE_FIX: Origin | null = import.meta.env.DEV ? parseFix(flags.get('at') ?? '') : null;
