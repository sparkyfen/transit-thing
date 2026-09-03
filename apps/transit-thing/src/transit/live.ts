import { parseRoutes, parseServerMessage, parseStops, routesAtUrl, stopsWithinUrl, subscribeMessage, wsUrl } from './api';
import type { Origin } from './geo';
import type { Socket, Transport } from './transport';
import type { Slot, TransitSource } from './types';

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
          onOpen: () => {
            delay = RECONNECT_MIN_MS;
            socket?.send(subscribeMessage(slot, perStop));
          },
          onText: text => {
            const msg = parseServerMessage(text);
            if (msg.kind === 'schedule') {
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
      const { status, body } = await transport.getJson(stopsWithinUrl(baseUrl, feed, origin));
      if (status !== 200) throw new ApiError(status, `stops request returned ${status}`);
      return parseStops(body);
    },

    async routesAt(stopId: string) {
      const { baseUrl } = config();
      const { status, body } = await transport.getJson(routesAtUrl(baseUrl, stopId));
      if (status !== 200) throw new ApiError(status, `routes request returned ${status}`);
      return parseRoutes(body);
    },

    onStatus(handler) {
      statusHandlers.add(handler);
      return () => statusHandlers.delete(handler);
    },
  };
}
