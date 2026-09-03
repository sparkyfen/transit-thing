import { ID, MAX_PAIRS } from './transit/api';
import type { Slot } from './transit/types';

export interface Config {
  apiBaseUrl: string;
  feed: string;
  slots: Slot[] | null;
  perStop: number;
  ambientIdle: boolean;
}

export const DEFAULT_CONFIG: Config = { apiBaseUrl: 'https://tt.horner.tj/', feed: 'st', slots: null, perStop: 3, ambientIdle: true };

// the manifest pattern only guards the settings page; every path into the app re-checks here
function parseBaseUrl(value: string): string | null {
  let u: URL;
  try {
    u = new URL(value.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash) return null;
  if (u.pathname !== '/' && u.pathname !== '') return null;
  return u.toString();
}

const MAX_SLOTS = 25;

// the whole value is dropped on any bad entry so a half-valid paste never renders
export function parseSlots(value: string): Slot[] | null {
  let raw: unknown;
  try {
    raw = JSON.parse(value);
  } catch {
    return null;
  }
  if (!Array.isArray(raw) || raw.length > MAX_SLOTS) return null;
  const slots: Slot[] = [];
  for (const r of raw) {
    if (typeof r !== 'object' || r === null) return null;
    const { stopId, stopName, routeIds } = r as Record<string, unknown>;
    if (typeof stopId !== 'string' || !ID.test(stopId)) return null;
    if (typeof stopName !== 'string' || stopName.length === 0 || stopName.length > 80) return null;
    if (!Array.isArray(routeIds) || routeIds.length === 0 || routeIds.length > MAX_PAIRS) return null;
    if (!routeIds.every(id => typeof id === 'string' && ID.test(id))) return null;
    slots.push({ stopId, stopName, routeIds: routeIds as string[] });
  }
  return slots;
}

const FEED_CODE = /^[a-z0-9_-]{1,32}$/;

export function applyConfig(prev: Config, key: string, value: string | null): Config {
  switch (key) {
    case 'apiBaseUrl': {
      if (value === null || value.trim() === '') return { ...prev, apiBaseUrl: DEFAULT_CONFIG.apiBaseUrl };
      const url = parseBaseUrl(value);
      return url ? { ...prev, apiBaseUrl: url } : prev;
    }
    case 'slots': {
      if (value === null || value.trim() === '') return { ...prev, slots: null };
      const slots = parseSlots(value);
      return slots ? { ...prev, slots } : prev;
    }
    case 'feed':
      if (value === null) return { ...prev, feed: DEFAULT_CONFIG.feed };
      if (!FEED_CODE.test(value)) return prev;
      return { ...prev, feed: value };
    case 'perStop': {
      if (value === null) return { ...prev, perStop: DEFAULT_CONFIG.perStop };
      const n = Number(value);
      if (!Number.isInteger(n) || n < 1 || n > 4) return prev;
      return { ...prev, perStop: n };
    }
    case 'ambientIdle':
      if (value === null) return { ...prev, ambientIdle: DEFAULT_CONFIG.ambientIdle };
      if (value !== 'true' && value !== 'false') return prev;
      return { ...prev, ambientIdle: value === 'true' };
    default:
      return prev;
  }
}
