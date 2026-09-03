import type { Origin } from './geo';
import type { Route, Slot, Stop, Trip } from './types';

// tt.horner.tj rejects more than 25 pairs per subscription and caps limit at 20
export const MAX_PAIRS = 25;
const MAX_LIMIT = 20;

// server ids and the ids a user pastes into settings pass the same test: any printable character except the
// pair delimiters, no control characters, no whitespace at either end, and an id of dots only is a path, not an id
export const ID = /^(?!\.+$)[^\s,;|\p{C}](?:[^,;|\p{C}]{0,126}[^\s,;|\p{C}])?$/u;
export const MAX_NAME = 80;
const MAX_STOPS = 200;
const MAX_ROUTES = 100;
// the server limit is a total across pairs and the trips arrive in arrival order, so the cap never drops a sooner arrival
const MAX_TRIPS = 50;

// the fix snaps to the center of a 0.01 degree cell (about 1 km) before the box is built, so the request
// only tells the server which cell the device is in, and every fix inside the cell sends the same box;
// the box is 0.018 by 0.020 degrees, which stays under the server's 5 square km cap at every latitude
const CELL = 0.01;
const BBOX_LAT = 0.009;
const BBOX_LON = 0.01;

export function bbox(origin: Origin): string {
  const center = (n: number) => (Math.floor(n / CELL) + 0.5) * CELL;
  const lat = center(origin.lat);
  const lon = center(origin.lon);
  const f = (n: number) => n.toFixed(3);
  return `${f(lon - BBOX_LON)},${f(lat - BBOX_LAT)},${f(lon + BBOX_LON)},${f(lat + BBOX_LAT)}`;
}

function apiUrl(base: string, path: string): string {
  return new URL(path, base.endsWith('/') ? base : `${base}/`).toString();
}

export function wsUrl(base: string): string {
  const u = new URL(base);
  u.protocol = u.protocol === 'http:' ? 'ws:' : 'wss:';
  return u.toString();
}

export function stopsWithinUrl(base: string, feed: string, origin: Origin): string {
  return apiUrl(base, `stops/within/${bbox(origin)}?feedCode=${encodeURIComponent(feed)}`);
}

export function routesAtUrl(base: string, stopId: string): string {
  return apiUrl(base, `stops/${encodeURIComponent(stopId)}/routes`);
}

export function subscribeMessage(slot: Slot, limit: number): string {
  const pairs = slot.routeIds.slice(0, MAX_PAIRS).map(routeId => `${routeId},${slot.stopId}`);
  return JSON.stringify({
    event: 'schedule:subscribe',
    data: { routeStopPairs: pairs.join(';'), limit: Math.max(1, Math.min(MAX_LIMIT, limit)), listMode: 'sequential' },
  });
}

export type ServerMessage = { kind: 'schedule'; trips: Trip[] } | { kind: 'heartbeat' } | { kind: 'error'; message: string } | { kind: 'ignore' };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function name(v: unknown, fallback: string): string {
  return str(v, fallback).slice(0, MAX_NAME);
}

// every field the board reads is checked, because the server is a third party and the kiosk has no error boundary
export function parseTrip(raw: unknown): Trip | null {
  if (!isRecord(raw)) return null;
  const arrivalTime = num(raw.arrivalTime);
  if (arrivalTime === undefined) return null;
  // the board only reads arrivals; a missing departure falls back rather than dropping the trip
  const departureTime = num(raw.departureTime) ?? arrivalTime;
  const tripId = str(raw.tripId);
  const stopId = str(raw.stopId);
  const routeId = str(raw.routeId);
  if (!ID.test(tripId) || !ID.test(stopId) || !ID.test(routeId)) return null;
  return {
    tripId,
    stopId,
    routeId,
    routeName: name(raw.routeName, ''),
    routeColor: typeof raw.routeColor === 'string' ? raw.routeColor : null,
    stopName: name(raw.stopName, ''),
    headsign: name(raw.headsign, ''),
    arrivalTime,
    departureTime,
    isRealtime: raw.isRealtime === true,
    delaySeconds: num(raw.delaySeconds),
  };
}

export function parseServerMessage(text: string): ServerMessage {
  let msg: unknown;
  try {
    msg = JSON.parse(text);
  } catch {
    // a plain text keepalive is not a server error, so it must not cost a reconnect
    return { kind: 'ignore' };
  }
  if (!isRecord(msg)) return { kind: 'ignore' };
  if (msg.event === 'heartbeat') return { kind: 'heartbeat' };
  if (msg.event === 'schedule') {
    const data = isRecord(msg.data) ? msg.data : {};
    const raw = Array.isArray(data.trips) ? data.trips.slice(0, MAX_TRIPS) : [];
    return { kind: 'schedule', trips: raw.map(parseTrip).filter((t): t is Trip => t !== null) };
  }
  if (msg.event === 'error' || msg.status === 'error' || msg.event === 'exception') {
    const data = isRecord(msg.data) ? msg.data : msg;
    return { kind: 'error', message: str(data.message, 'server error') };
  }
  return { kind: 'ignore' };
}

export function parseStops(raw: unknown): Stop[] {
  if (!Array.isArray(raw)) return [];
  const stops: Stop[] = [];
  for (const s of raw) {
    if (stops.length === MAX_STOPS) break;
    if (!isRecord(s)) continue;
    const stopId = str(s.stopId);
    const lat = num(s.lat);
    const lon = num(s.lon);
    if (!ID.test(stopId) || lat === undefined || lon === undefined) continue;
    stops.push({ stopId, stopCode: name(s.stopCode, ''), name: name(s.name, stopId), lat, lon });
  }
  return stops;
}

export function parseRoutes(raw: unknown): Route[] {
  if (!Array.isArray(raw)) return [];
  const routes: Route[] = [];
  for (const r of raw) {
    if (routes.length === MAX_ROUTES) break;
    if (!isRecord(r)) continue;
    const routeId = str(r.routeId);
    if (!ID.test(routeId)) continue;
    const headsigns = Array.isArray(r.headsigns) ? r.headsigns.filter((h): h is string => typeof h === 'string').map(h => h.slice(0, MAX_NAME)) : [];
    routes.push({ routeId, name: name(r.name, routeId), color: typeof r.color === 'string' ? r.color : null, headsigns });
  }
  return routes;
}
