import { describe, expect, test } from 'bun:test';
import { ApiError, liveSource, nextDelay, RECONNECT_MAX_MS, RECONNECT_MIN_MS, WATCHDOG_MS } from './live';
import { LINK_DOWN, MAX_BODY_BYTES, type Socket, type SocketHandlers, type Transport } from './transport';

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
  const calls: string[] = [];
  const transport: Transport = {
    async getJson(url) {
      calls.push(url);
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
  return { transport, sockets, calls };
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
    // an open the server closes before any schedule does not reset the backoff
    sockets[2]!.handlers.onOpen();
    sockets[2]!.handlers.onClose('refused');
    expect(t.pending[0]!.ms).toBe(RECONNECT_MIN_MS * 4);
    t.fire();
    sockets[3]!.handlers.onOpen();
    sockets[3]!.handlers.onText(JSON.stringify({ event: 'schedule', data: { trips: [] } }));
    sockets[3]!.handlers.onClose('drop');
    expect(t.pending[0]!.ms).toBe(RECONNECT_MIN_MS);
  });

  test('the subscribe message goes out again on the new socket after a reconnect', () => {
    const { transport, sockets } = fakeTransport();
    const t = fakeTimers();
    const src = liveSource(transport, config, t.timers);
    src.subscribe(slot, () => {});
    sockets[0]!.handlers.onOpen();
    sockets[0]!.handlers.onClose('gone');
    t.fire();
    sockets[1]!.handlers.onOpen();
    expect(sockets[1]!.sent).toEqual(sockets[0]!.sent);
    expect(JSON.parse(sockets[1]!.sent[0]!).event).toBe('schedule:subscribe');
  });

  test('a base url changed in settings is used by the next dial', () => {
    const { transport, sockets } = fakeTransport();
    const t = fakeTimers();
    let baseUrl = 'https://tt.horner.tj/';
    const src = liveSource(transport, () => ({ ...config(), baseUrl }), t.timers);
    src.subscribe(slot, () => {});
    expect(sockets[0]!.url).toBe('wss://tt.horner.tj/');
    baseUrl = 'https://transit.example/';
    sockets[0]!.handlers.onClose('gone');
    t.fire();
    expect(sockets[1]!.url).toBe('wss://transit.example/');
  });

  test('a removed status handler hears nothing more', () => {
    const { transport, sockets } = fakeTransport();
    const src = liveSource(transport, config, fakeTimers().timers);
    const statuses: string[] = [];
    const off = src.onStatus((_, s) => statuses.push(s));
    src.subscribe(slot, () => {});
    off();
    sockets[0]!.handlers.onClose('gone');
    expect(statuses).toEqual(['connecting']);
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

  test('a frame over the body cap is dropped before parsing', () => {
    const { transport, sockets } = fakeTransport();
    const t = fakeTimers();
    const src = liveSource(transport, config, t.timers);
    const got: number[] = [];
    const statuses: string[] = [];
    src.onStatus((_, s) => statuses.push(s));
    src.subscribe(slot, trips => got.push(trips.length));
    sockets[0]!.handlers.onOpen();
    const one = '{"tripId":"t","stopId":"s","routeId":"r","arrivalTime":1}';
    const frame = `{"event":"schedule","data":{"trips":[${`${one},`.repeat(6000)}${one}]}}`;
    expect(frame.length).toBeGreaterThan(MAX_BODY_BYTES);
    sockets[0]!.handlers.onText(frame);
    expect(got).toEqual([]);
    expect(statuses).toEqual(['connecting']);
    expect(sockets[0]!.closed).toBe(false);
    expect(t.pending.map(p => p.ms)).toEqual([WATCHDOG_MS]);
  });

  test('a dial refused for a missing daemon link does not grow the backoff', () => {
    const { transport, sockets } = fakeTransport();
    const t = fakeTimers();
    const src = liveSource(transport, config, t.timers);
    src.subscribe(slot, () => {});
    sockets[0]!.handlers.onClose('gone');
    t.fire();
    sockets[1]!.handlers.onClose('gone again');
    expect(t.pending[0]!.ms).toBe(RECONNECT_MIN_MS * 2);
    t.fire();
    sockets[2]!.handlers.onClose(LINK_DOWN);
    expect(t.pending[0]!.ms).toBe(RECONNECT_MIN_MS);
    t.fire();
    sockets[3]!.handlers.onClose(LINK_DOWN);
    expect(t.pending[0]!.ms).toBe(RECONNECT_MIN_MS);
    t.fire();
    // a real failure after the link returns grows from the minimum again
    sockets[4]!.handlers.onClose('refused');
    expect(t.pending[0]!.ms).toBe(RECONNECT_MIN_MS);
    t.fire();
    sockets[5]!.handlers.onClose('refused');
    expect(t.pending[0]!.ms).toBe(RECONNECT_MIN_MS * 2);
  });

  test('a socket silent for too long is closed and redialed', () => {
    const { transport, sockets } = fakeTransport();
    const t = fakeTimers();
    const src = liveSource(transport, config, t.timers);
    const statuses: string[] = [];
    src.onStatus((_, s) => statuses.push(s));
    src.subscribe(slot, () => {});
    expect(t.pending).toHaveLength(0);
    sockets[0]!.handlers.onOpen();
    expect(t.pending.map(p => p.ms)).toEqual([WATCHDOG_MS]);
    // every message from the server, heartbeat or schedule, restarts the watchdog
    sockets[0]!.handlers.onText(JSON.stringify({ event: 'heartbeat', data: null }));
    sockets[0]!.handlers.onText(JSON.stringify({ event: 'schedule', data: { trips: [] } }));
    expect(t.pending.map(p => p.ms)).toEqual([WATCHDOG_MS]);
    t.fire();
    expect(sockets[0]!.closed).toBe(true);
    expect(statuses.at(-1)).toBe('reconnecting');
    expect(t.pending.map(p => p.ms)).toEqual([RECONNECT_MIN_MS]);
    t.fire();
    expect(sockets).toHaveLength(2);
    // a close from the server disarms the watchdog, and so does unsubscribing
    sockets[1]!.handlers.onOpen();
    sockets[1]!.handlers.onClose('gone');
    expect(t.pending.map(p => p.ms)).toEqual([RECONNECT_MIN_MS * 2]);
    t.fire();
    sockets[2]!.handlers.onOpen();
    expect(t.pending.map(p => p.ms)).toEqual([WATCHDOG_MS]);
  });

  test('unsubscribing disarms the watchdog', () => {
    const { transport, sockets } = fakeTransport();
    const t = fakeTimers();
    const off = liveSource(transport, config, t.timers).subscribe(slot, () => {});
    sockets[0]!.handlers.onOpen();
    off();
    expect(t.pending).toHaveLength(0);
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
    const url = 'https://tt.horner.tj/stops/within/-122.205,47.606,-122.185,47.624?feedCode=st';
    const { transport } = fakeTransport({ [url]: { status: 200, body: [{ stopId: 'a', stopCode: '1', name: 'A', lat: 1, lon: 2 }] } });
    const src = liveSource(transport, config, fakeTimers().timers);
    expect(await src.stopsNear(null)).toEqual([]);
    expect(await src.stopsNear({ lat: 47.615, lon: -122.195 })).toHaveLength(1);
  });
  test('a place already asked about answers from the session cache', async () => {
    const url = 'https://tt.horner.tj/stops/within/-122.205,47.606,-122.185,47.624?feedCode=st';
    const routesUrl = 'https://tt.horner.tj/stops/st%3Ax/routes';
    const { transport, calls } = fakeTransport({ [url]: { status: 200, body: [{ stopId: 'a', lat: 1, lon: 2 }] }, [routesUrl]: { status: 200, body: [{ routeId: 'r' }] } });
    const src = liveSource(transport, config, fakeTimers().timers);
    expect(await src.stopsNear({ lat: 47.615, lon: -122.195 })).toEqual(await src.stopsNear({ lat: 47.6199, lon: -122.1901 }));
    expect(await src.routesAt('st:x')).toEqual(await src.routesAt('st:x'));
    expect(calls).toEqual([url, routesUrl]);
  });
  test('an empty list is not cached, so a retry asks again', async () => {
    const routesUrl = 'https://tt.horner.tj/stops/st%3Ax/routes';
    const { transport, calls } = fakeTransport({ [routesUrl]: { status: 200, body: [] } });
    const src = liveSource(transport, config, fakeTimers().timers);
    expect(await src.routesAt('st:x')).toEqual([]);
    expect(await src.routesAt('st:x')).toEqual([]);
    expect(calls).toHaveLength(2);
  });
  test('a failed request is not cached', async () => {
    const routesUrl = 'https://tt.horner.tj/stops/st%3Ax/routes';
    const { transport, calls } = fakeTransport({ [routesUrl]: { status: 500, body: null } });
    const src = liveSource(transport, config, fakeTimers().timers);
    await expect(src.routesAt('st:x')).rejects.toBeInstanceOf(ApiError);
    await expect(src.routesAt('st:x')).rejects.toBeInstanceOf(ApiError);
    expect(calls).toHaveLength(2);
  });
  test('a rate limit surfaces as an ApiError with the status', async () => {
    const url = 'https://tt.horner.tj/stops/st%3Ax/routes';
    const { transport } = fakeTransport({ [url]: { status: 429, body: { message: 'slow down' } } });
    const src = liveSource(transport, config, fakeTimers().timers);
    await expect(src.routesAt('st:x')).rejects.toBeInstanceOf(ApiError);
    await src.routesAt('st:x').catch((e: ApiError) => expect(e.status).toBe(429));
  });
});
