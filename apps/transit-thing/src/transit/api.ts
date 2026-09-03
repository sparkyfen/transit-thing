import type { Origin } from './geo';
import type { Route, Slot, Stop, Trip } from './types';

// tt.horner.tj rejects more than 25 pairs per subscription and caps limit at 20
export const MAX_PAIRS = 25;
export const MAX_LIMIT = 20;

// about 700 m each way, snapped outward to a 0.005 degree grid so the request never carries the exact fix;
// the server rejects boxes over 5 square km, and the snapped worst case is about 4
const BBOX_LAT = 0.006;
const BBOX_LON = 0.009;
const GRID = 200;

export function bbox(origin: Origin): string {
  const snap = (n: number, up: boolean) => ((up ? Math.ceil(n * GRID) : Math.floor(n * GRID)) / GRID).toFixed(3);
  const minLon = snap(origin.lon - BBOX_LON, false);
  const minLat = snap(origin.lat - BBOX_LAT, false);
  const maxLon = snap(origin.lon + BBOX_LON, true);
  const maxLat = snap(origin.lat + BBOX_LAT, true);
  return `${minLon},${minLat},${maxLon},${maxLat}`;
}

export function apiUrl(base: string, path: string): string {
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

// every field the board reads is checked, because the server is a third party and the kiosk has no error boundary
export function parseTrip(raw: unknown): Trip | null {
  if (!isRecord(raw)) return null;
  const arrivalTime = Number(raw.arrivalTime);
  if (!Number.isFinite(arrivalTime)) return null;
  const tripId = str(raw.tripId);
  const stopId = str(raw.stopId);
  const routeId = str(raw.routeId);
  if (!tripId || !stopId || !routeId) return null;
  const departureTime = Number.isFinite(Number(raw.departureTime)) ? Number(raw.departureTime) : arrivalTime;
  const delay = Number(raw.delaySeconds);
  return {
    tripId,
    stopId,
    routeId,
    routeName: str(raw.routeName),
    routeColor: typeof raw.routeColor === 'string' ? raw.routeColor : null,
    stopName: str(raw.stopName),
    headsign: str(raw.headsign),
    arrivalTime,
    departureTime,
    isRealtime: raw.isRealtime === true,
    delaySeconds: Number.isFinite(delay) ? delay : undefined,
  };
}

export function parseServerMessage(text: string): ServerMessage {
  let msg: unknown;
  try {
    msg = JSON.parse(text);
  } catch {
    return { kind: 'error', message: 'not json' };
  }
  if (!isRecord(msg)) return { kind: 'ignore' };
  if (msg.event === 'heartbeat') return { kind: 'heartbeat' };
  if (msg.event === 'schedule') {
    const data = isRecord(msg.data) ? msg.data : {};
    const raw = Array.isArray(data.trips) ? data.trips : [];
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
    if (!isRecord(s)) continue;
    const stopId = str(s.stopId);
    const lat = Number(s.lat);
    const lon = Number(s.lon);
    if (!stopId || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    stops.push({ stopId, stopCode: str(s.stopCode), name: str(s.name, stopId), lat, lon });
  }
  return stops;
}

export function parseRoutes(raw: unknown): Route[] {
  if (!Array.isArray(raw)) return [];
  const routes: Route[] = [];
  for (const r of raw) {
    if (!isRecord(r)) continue;
    const routeId = str(r.routeId);
    if (!routeId) continue;
    const headsigns = Array.isArray(r.headsigns) ? r.headsigns.filter((h): h is string => typeof h === 'string') : [];
    routes.push({ routeId, name: str(r.name, routeId), color: typeof r.color === 'string' ? r.color : null, headsigns });
  }
  return routes;
}
