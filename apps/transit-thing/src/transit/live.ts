import { parseRoutes, parseServerMessage, parseStops, routesAtUrl, stopsWithinUrl, subscribeMessage, wsUrl } from './api';
import type { Origin } from './geo';
import { LINK_DOWN, MAX_BODY_BYTES, type Socket, type Transport } from './transport';
import type { Route, Slot, Stop, TransitSource } from './types';

export type FeedStatus = 'connecting' | 'live' | 'reconnecting';

export interface LiveConfig {
  baseUrl: string;
  feed: string;
  perStop: number;
}

export interface LiveSource extends TransitSource {
  onStatus(handler: (slot: Slot, status: FeedStatus) => void): () => void;
}

export const RECONNECT_MIN_MS = 1_000;
export const RECONNECT_MAX_MS = 30_000;
// the server heartbeats well inside this; a socket silent for longer is gone even if nothing said so
export const WATCHDOG_MS = 75_000;
// a dial refused for a missing daemon link waits for the link to come back; the fallback covers a missed open event
export const LINK_WAIT_MS = 30_000;

export function nextDelay(current: number): number {
  return Math.min(RECONNECT_MAX_MS, current * 2);
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

// one socket per slot: the server allows a single subscription per connection
export function liveSource(transport: Transport, config: () => LiveConfig, timers: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout } = globalThis): LiveSource {
  const statusHandlers = new Set<(slot: Slot, status: FeedStatus) => void>();
  const emit = (slot: Slot, status: FeedStatus) => statusHandlers.forEach(h => h(slot, status));
  // stops take the server about 30 s and it rate limits, so a place already asked about answers from memory
  const stopsCache = new Map<string, Stop[]>();
  const routesCache = new Map<string, Route[]>();
  const cached = async <T extends unknown[]>(cache: Map<string, T>, url: string, parse: (body: unknown) => T, label: string): Promise<T> => {
    const hit = cache.get(url);
    if (hit) return hit;
    const { status, body } = await transport.getJson(url);
    if (status !== 200) throw new ApiError(status, `${label} request returned ${status}`);
    const value = parse(body);
    // an empty list may be a bad reply, so a retry asks again
    if (value.length > 0) cache.set(url, value);
    return value;
  };

  return {
    subscribe(slot, onTrips) {
      let socket: Socket | null = null;
      let timer: ReturnType<typeof setTimeout> | null = null;
      let watchdog: ReturnType<typeof setTimeout> | null = null;
      let offLink: (() => void) | null = null;
      let delay = RECONNECT_MIN_MS;
      let stopped = false;

      const disarm = () => {
        if (watchdog) timers.clearTimeout(watchdog);
        watchdog = null;
      };
      const arm = () => {
        disarm();
        watchdog = timers.setTimeout(() => {
          watchdog = null;
          socket?.close();
          lost('silent');
        }, WATCHDOG_MS);
      };

      const dial = () => {
        if (stopped) return;
        const { baseUrl, perStop } = config();
        socket = transport.open(wsUrl(baseUrl), {
          onOpen: () => {
            arm();
            socket?.send(subscribeMessage(slot, perStop));
          },
          onText: text => {
            if (text.length > MAX_BODY_BYTES) return;
            const msg = parseServerMessage(text);
            if (msg.kind === 'schedule') {
              arm();
              // a schedule proves the server accepted the subscription; an open alone can still be refused
              delay = RECONNECT_MIN_MS;
              emit(slot, 'live');
              onTrips(msg.trips);
            } else if (msg.kind === 'heartbeat') {
              arm();
            } else if (msg.kind === 'error') {
              socket?.close();
              lost('server error');
            }
          },
          onClose: lost,
        });
      };

      const lost = (reason: string) => {
        disarm();
        if (stopped || timer) return;
        socket = null;
        emit(slot, 'reconnecting');
        // with no daemon link nothing was tried, so the redial waits for the link and starts from the minimum
        if (reason === LINK_DOWN) {
          delay = RECONNECT_MIN_MS;
          const redial = () => {
            offLink?.();
            offLink = null;
            if (timer) timers.clearTimeout(timer);
            timer = null;
            dial();
          };
          offLink = transport.onLinkOpen(redial);
          timer = timers.setTimeout(redial, LINK_WAIT_MS);
          return;
        }
        timer = timers.setTimeout(() => {
          timer = null;
          dial();
        }, delay);
        delay = nextDelay(delay);
      };

      emit(slot, 'connecting');
      dial();
      return () => {
        stopped = true;
        disarm();
        offLink?.();
        offLink = null;
        if (timer) timers.clearTimeout(timer);
        socket?.close();
        socket = null;
      };
    },

    async stopsNear(origin: Origin | null) {
      if (!origin) return [];
      const { baseUrl, feed } = config();
      return cached(stopsCache, stopsWithinUrl(baseUrl, feed, origin), parseStops, 'stops');
    },

    async routesAt(stopId: string) {
      const { baseUrl } = config();
      return cached(routesCache, routesAtUrl(baseUrl, stopId), parseRoutes, 'routes');
    },

    onStatus(handler) {
      statusHandlers.add(handler);
      return () => statusHandlers.delete(handler);
    },
  };
}
