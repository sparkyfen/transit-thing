import { describe, expect, test } from 'bun:test';
import { ApiError, liveSource, nextDelay, RECONNECT_MAX_MS, RECONNECT_MIN_MS } from './live';
import type { Socket, SocketHandlers, Transport } from './transport';

const slot = { stopId: 'st:1_67652', stopName: 'Bay 9', routeIds: ['st:1_100133'] };
const config = () => ({ baseUrl: 'https://tt.horner.tj/', feed: 'st', perStop: 3 });

interface FakeSocket extends Socket {
  url: string;
  handlers: SocketHandlers;
  sent: string[];
  closed: boolean;
}

function fakeTransport(json: Record<string, { status: number; body: unknown }> = {}) {
  const sockets: FakeSocket[] = [];
  const transport: Transport = {
    async getJson(url) {
      const hit = json[url];
      if (!hit) throw new Error(`unexpected ${url}`);
      return hit;
    },
    open(url, handlers) {
      const s: FakeSocket = { url, handlers, sent: [], closed: false, send: t => s.sent.push(t), close: () => (s.closed = true) };
      sockets.push(s);
      return s;
    },
  };
  return { transport, sockets };
}

function fakeTimers() {
  const pending: { fn: () => void; ms: number; id: number }[] = [];
  let id = 0;
  return {
    pending,
    timers: {
      setTimeout: ((fn: () => void, ms: number) => {
        pending.push({ fn, ms, id: ++id });
        return id as unknown as ReturnType<typeof setTimeout>;
      }) as typeof setTimeout,
      clearTimeout: ((h: unknown) => {
        const i = pending.findIndex(p => p.id === (h as number));
        if (i >= 0) pending.splice(i, 1);
      }) as typeof clearTimeout,
    },
    fire() {
      const next = pending.shift();
      next?.fn();
    },
  };
}

describe('liveSource.subscribe', () => {
  test('opens one socket, subscribes on open, and delivers trips', () => {
    const { transport, sockets } = fakeTransport();
    const src = liveSource(transport, config, fakeTimers().timers);
    const got: number[] = [];
    const statuses: string[] = [];
    src.onStatus((_, s) => statuses.push(s));
    src.subscribe(slot, trips => got.push(trips.length));
    expect(sockets).toHaveLength(1);
    expect(sockets[0]!.url).toBe('wss://tt.horner.tj/');
    sockets[0]!.handlers.onOpen();
    expect(JSON.parse(sockets[0]!.sent[0]!).data.routeStopPairs).toBe('st:1_100133,st:1_67652');
    sockets[0]!.handlers.onText(JSON.stringify({ event: 'heartbeat', data: null }));
    sockets[0]!.handlers.onText(
      JSON.stringify({ event: 'schedule', data: { trips: [{ tripId: 't', stopId: 's', routeId: 'r', arrivalTime: 1, departureTime: 1 }] } }),
    );
    expect(got).toEqual([1]);
    expect(statuses).toEqual(['connecting', 'live']);
  });

  test('reconnects with backoff after a close and resets after a schedule', () => {
    const { transport, sockets } = fakeTransport();
    const t = fakeTimers();
    const src = liveSource(transport, config, t.timers);
    const statuses: string[] = [];
    src.onStatus((_, s) => statuses.push(s));
    src.subscribe(slot, () => {});
    sockets[0]!.handlers.onClose('gone');
    expect(statuses.at(-1)).toBe('reconnecting');
    expect(t.pending[0]!.ms).toBe(RECONNECT_MIN_MS);
    t.fire();
    expect(sockets).toHaveLength(2);
    sockets[1]!.handlers.onClose('gone again');
    expect(t.pending[0]!.ms).toBe(RECONNECT_MIN_MS * 2);
    t.fire();
    sockets[2]!.handlers.onOpen();
    sockets[2]!.handlers.onText(JSON.stringify({ event: 'schedule', data: { trips: [] } }));
    sockets[2]!.handlers.onClose('drop');
    expect(t.pending[0]!.ms).toBe(RECONNECT_MIN_MS);
  });

  test('a server error closes the socket and schedules a retry', () => {
    const { transport, sockets } = fakeTransport();
    const t = fakeTimers();
    const src = liveSource(transport, config, t.timers);
    src.subscribe(slot, () => {});
    sockets[0]!.handlers.onOpen();
    sockets[0]!.handlers.onText(JSON.stringify({ status: 'error', message: 'Too many route-stop pairs' }));
    expect(sockets[0]!.closed).toBe(true);
    expect(t.pending).toHaveLength(1);
  });

  test('unsubscribing closes the socket and cancels the retry', () => {
    const { transport, sockets } = fakeTransport();
    const t = fakeTimers();
    const src = liveSource(transport, config, t.timers);
    const off = src.subscribe(slot, () => {});
    sockets[0]!.handlers.onClose('gone');
    off();
    expect(t.pending).toHaveLength(0);
    t.fire();
    expect(sockets).toHaveLength(1);
  });

  test('backoff caps at the maximum', () => {
    expect(nextDelay(RECONNECT_MAX_MS)).toBe(RECONNECT_MAX_MS);
    expect(nextDelay(20_000)).toBe(RECONNECT_MAX_MS);
  });
});

describe('liveSource rest calls', () => {
  test('stopsNear needs an origin and parses the reply', async () => {
    const url = 'https://tt.horner.tj/stops/within/-122.205,47.605,-122.185,47.625?feedCode=st';
    const { transport } = fakeTransport({ [url]: { status: 200, body: [{ stopId: 'a', stopCode: '1', name: 'A', lat: 1, lon: 2 }] } });
    const src = liveSource(transport, config, fakeTimers().timers);
    expect(await src.stopsNear(null)).toEqual([]);
    expect(await src.stopsNear({ lat: 47.615, lon: -122.195 })).toHaveLength(1);
  });
  test('a rate limit surfaces as an ApiError with the status', async () => {
    const url = 'https://tt.horner.tj/stops/st%3Ax/routes';
    const { transport } = fakeTransport({ [url]: { status: 429, body: { message: 'slow down' } } });
    const src = liveSource(transport, config, fakeTimers().timers);
    await expect(src.routesAt('st:x')).rejects.toBeInstanceOf(ApiError);
    await src.routesAt('st:x').catch((e: ApiError) => expect(e.status).toBe(429));
  });
});
