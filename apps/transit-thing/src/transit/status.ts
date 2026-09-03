import { clockTime } from './format';

export type Connection = 'connecting' | 'open' | 'closing' | 'closed';

export interface BoardStatus {
  text: string;
  tone: 'soft' | 'notice' | 'warn';
}

export type FeedLink = 'connecting' | 'live' | 'reconnecting' | null;

export interface Link {
  status: FeedLink;
  // when the feed last came back from reconnecting, so the board can say so briefly
  recoveredAt: number | null;
}

export const RECOVERED_MS = 5_000;

export function nextLink(prev: Link | undefined, status: FeedLink, nowMs: number): Link {
  const recoveredAt = prev?.status === 'reconnecting' && status === 'live' ? nowMs : (prev?.recoveredAt ?? null);
  return { status, recoveredAt };
}

// while the feed has never delivered, the board body carries the connecting text and the header stays empty
export function boardStatus(connection: Connection, updatedMs: number | null, link: Link | null = null, nowMs = 0): BoardStatus | null {
  const feed = link?.status ?? null;
  if (connection === 'open') {
    if (feed === 'reconnecting') return updatedMs === null ? null : { text: `Reconnecting, as of ${clockTime(Math.floor(updatedMs / 1000))}`, tone: 'notice' };
    const recoveredAt = link?.recoveredAt ?? null;
    if (recoveredAt !== null && nowMs - recoveredAt < RECOVERED_MS) return { text: 'Up to date', tone: 'soft' };
    return null;
  }
  if (connection === 'connecting' && updatedMs === null) return { text: 'Connecting', tone: 'soft' };
  if (updatedMs === null) return { text: 'Offline', tone: 'warn' };
  return { text: `Offline, as of ${clockTime(Math.floor(updatedMs / 1000))}`, tone: 'warn' };
}

// a feed that is dialing or reconnecting is as stale as one with no daemon, so every live signal follows one flag
export function boardFresh(connection: Connection, feed: FeedLink): boolean {
  return connection === 'open' && feed === 'live';
}

export function waitingText(connection: Connection, feed: FeedLink): string {
  if (connection !== 'open') return 'Waiting for arrivals.';
  if (feed === 'reconnecting') return 'Reconnecting to the transit server.';
  if (feed === 'connecting') return 'Connecting to the transit server.';
  return 'Waiting for arrivals.';
}

// fixture data lands before the socket opens; only data received since the first open counts as a last update
export function dataAsOf(everOpen: boolean, updatedMs: number | null): number | null {
  return everOpen ? updatedMs : null;
}
