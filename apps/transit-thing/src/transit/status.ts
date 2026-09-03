import { clockTime } from './format';

export type Connection = 'connecting' | 'open' | 'closing' | 'closed';

export interface BoardStatus {
  text: string;
  warn: boolean;
}

export type FeedLink = 'connecting' | 'live' | 'reconnecting' | null;

export function boardStatus(connection: Connection, updatedMs: number | null, feed: FeedLink = null): BoardStatus | null {
  if (connection === 'open') {
    if (feed === 'reconnecting') return { text: updatedMs === null ? 'Reconnecting' : `Reconnecting, as of ${clockTime(Math.floor(updatedMs / 1000))}`, warn: true };
    if (feed === 'connecting' && updatedMs === null) return { text: 'Connecting', warn: false };
    return null;
  }
  if (connection === 'connecting' && updatedMs === null) return { text: 'Connecting', warn: false };
  if (updatedMs === null) return { text: 'Offline', warn: true };
  return { text: `Offline, as of ${clockTime(Math.floor(updatedMs / 1000))}`, warn: true };
}

// fixture data lands before the socket opens; only data received since the first open counts as a last update
export function dataAsOf(everOpen: boolean, updatedMs: number | null): number | null {
  return everOpen ? updatedMs : null;
}
