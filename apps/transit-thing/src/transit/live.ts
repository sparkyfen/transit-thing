import { parseRoutes, parseServerMessage, parseStops, routesAtUrl, stopsWithinUrl, subscribeMessage, wsUrl } from './api';
import type { Origin } from './geo';
import { MAX_BODY_BYTES, type Socket, type Transport } from './transport';
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
  const cached = async <T>(cache: Map<string, T>, url: string, parse: (body: unknown) => T, label: string): Promise<T> => {
    const hit = cache.get(url);
    if (hit) return hit;
    const { status, body } = await transport.getJson(url);
    if (status !== 200) throw new ApiError(status, `${label} request returned ${status}`);
    const value = parse(body);
    cache.set(url, value);
    return value;
  };

  return {
    subscribe(slot, onTrips) {
      let socket: Socket | null = null;
      let timer: ReturnType<typeof setTimeout> | null = null;
      let delay = RECONNECT_MIN_MS;
      let stopped = false;

      const dial = () => {
        if (stopped) return;
        const { baseUrl, perStop } = config();
        socket = transport.open(wsUrl(baseUrl), {
          onOpen: () => socket?.send(subscribeMessage(slot, perStop)),
          onText: text => {
            if (text.length > MAX_BODY_BYTES) return;
            const msg = parseServerMessage(text);
            if (msg.kind === 'schedule') {
              // a schedule proves the server accepted the subscription; an open alone can still be refused
              delay = RECONNECT_MIN_MS;
              emit(slot, 'live');
              onTrips(msg.trips);
            } else if (msg.kind === 'error') {
              socket?.close();
              lost();
            }
          },
          onClose: () => lost(),
        });
      };

      const lost = () => {
        if (stopped || timer) return;
        socket = null;
        emit(slot, 'reconnecting');
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
