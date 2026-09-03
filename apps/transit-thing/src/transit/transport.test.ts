import { afterEach, describe, expect, test } from 'bun:test';
import type { BridgethingClient } from '@bridgething/client';
import { browserTransport, daemonTransport, jsonOrNull, MAX_BODY_BYTES, type SocketHandlers } from './transport';

type Listener<T> = (msg: T) => void;
interface WsClosed {
  connectionId: string;
  code: number;
  reason: string;
}
interface WsMessage {
  connectionId: string;
  frame: { type: 'text'; data: string } | { type: 'binary'; data: Uint8Array };
}
interface WsErrorEvent {
  connectionId: string;
  error: { type: string };
}

const encode = (text: string) => new TextEncoder().encode(text);

// the transport only needs the net surface, so the fake is a structural object cast to the client type
function fakeClient(opts: { fetch?: { status: number; body: Uint8Array } | 'fail'; open?: 'ok' | 'fail' } = {}) {
  const messages = new Set<Listener<WsMessage>>();
  const closes = new Set<Listener<WsClosed>>();
  const errors = new Set<Listener<WsErrorEvent>>();
  const sent: { connectionId: string; text: string }[] = [];
  const closed: string[] = [];
  const opened: string[] = [];
  const net = {
    onWsMessage: (h: Listener<WsMessage>) => (messages.add(h), () => messages.delete(h)),
    onWsClosed: (h: Listener<WsClosed>) => (closes.add(h), () => closes.delete(h)),
    onWsErrorEvent: (h: Listener<WsErrorEvent>) => (errors.add(h), () => errors.delete(h)),
    fetch: async () => {
      if (opts.fetch === 'fail' || !opts.fetch) return { ok: false, kind: 'domain', error: { error: { type: 'timeout' } } };
      return { ok: true, response: { response: { status: opts.fetch.status, headers: [], body: opts.fetch.body } } };
    },
    wsOpen: async (req: { connectionId: string }) => {
      opened.push(req.connectionId);
      return opts.open === 'fail' ? { ok: false, kind: 'domain', error: { error: { type: 'connectFailed', data: { reason: 'no' } } } } : { ok: true, response: { acceptedProtocol: null } };
    },
    wsSend: async (req: { connectionId: string; frame: { type: 'text'; data: string } }) => {
      sent.push({ connectionId: req.connectionId, text: req.frame.data });
    },
    wsClose: async (req: { connectionId: string }) => {
      closed.push(req.connectionId);
    },
  };
  const client = { net } as unknown as BridgethingClient;
  return {
    client,
    sent,
    closed,
    opened,
    listeners: () => messages.size + closes.size + errors.size,
    message: (m: WsMessage) => messages.forEach(h => h(m)),
    close: (m: WsClosed) => closes.forEach(h => h(m)),
    error: (m: WsErrorEvent) => errors.forEach(h => h(m)),
  };
}

function recorder() {
  const events: string[] = [];
  const handlers: SocketHandlers = {
    onOpen: () => events.push('open'),
    onText: text => events.push(`text:${text}`),
    onClose: reason => events.push(`close:${reason}`),
  };
  return { events, handlers };
}

const tick = () => new Promise(r => setTimeout(r, 0));

describe('daemonTransport sockets', () => {
  test('opens, subscribes on the reply, and ignores other connections', async () => {
    const fake = fakeClient();
    const { events, handlers } = recorder();
    const socket = daemonTransport(fake.client).open('wss://tt.horner.tj/', handlers);
    await tick();
    expect(events).toEqual(['open']);
    const [id] = fake.opened as [string];
    fake.message({ connectionId: 'other', frame: { type: 'text', data: 'nope' } });
    fake.close({ connectionId: 'other', code: 1006, reason: '' });
    fake.error({ connectionId: 'other', error: { type: 'protocolError' } });
    fake.message({ connectionId: id, frame: { type: 'binary', data: new Uint8Array() } });
    fake.message({ connectionId: id, frame: { type: 'text', data: 'hi' } });
    expect(events).toEqual(['open', 'text:hi']);
    socket.send('sub');
    expect(fake.sent).toEqual([{ connectionId: id, text: 'sub' }]);
  });

  test('a failed open reports a close and drops every listener', async () => {
    const fake = fakeClient({ open: 'fail' });
    const { events, handlers } = recorder();
    daemonTransport(fake.client).open('wss://tt.horner.tj/', handlers);
    await tick();
    expect(events).toEqual(['close:connectFailed']);
    expect(fake.listeners()).toBe(0);
  });

  test('a close from the daemon runs every unsubscribe and later events are ignored', async () => {
    const fake = fakeClient();
    const { events, handlers } = recorder();
    const socket = daemonTransport(fake.client).open('wss://tt.horner.tj/', handlers);
    await tick();
    const [id] = fake.opened as [string];
    fake.close({ connectionId: id, code: 1006, reason: '' });
    expect(events).toEqual(['open', 'close:closed 1006']);
    expect(fake.listeners()).toBe(0);
    fake.error({ connectionId: id, error: { type: 'protocolError' } });
    socket.send('late');
    expect(events).toHaveLength(2);
    expect(fake.sent).toEqual([]);
  });

  test('close() tells the daemon once, suppresses later events, and stops sends', async () => {
    const fake = fakeClient();
    const { events, handlers } = recorder();
    const socket = daemonTransport(fake.client).open('wss://tt.horner.tj/', handlers);
    await tick();
    const [id] = fake.opened as [string];
    socket.close();
    socket.close();
    expect(fake.closed).toEqual([id]);
    expect(fake.listeners()).toBe(0);
    fake.close({ connectionId: id, code: 1000, reason: 'done' });
    fake.message({ connectionId: id, frame: { type: 'text', data: 'hi' } });
    socket.send('after');
    expect(events).toEqual(['open']);
    expect(fake.sent).toEqual([]);
  });

  test('an error event before the open reply wins, and the reply is then ignored', async () => {
    const fake = fakeClient();
    const { events, handlers } = recorder();
    daemonTransport(fake.client).open('wss://tt.horner.tj/', handlers);
    const [id] = fake.opened as [string];
    fake.error({ connectionId: id, error: { type: 'gatewayDisconnected' } });
    await tick();
    expect(events).toEqual(['close:gatewayDisconnected']);
  });
});

describe('daemonTransport.getJson', () => {
  test('decodes a byte body as json', async () => {
    const fake = fakeClient({ fetch: { status: 200, body: encode('[{"stopId":"a"}]') } });
    expect(await daemonTransport(fake.client).getJson('https://tt.horner.tj/stops')).toEqual({ status: 200, body: [{ stopId: 'a' }] });
  });
  test('malformed bytes give a null body', async () => {
    const fake = fakeClient({ fetch: { status: 200, body: new Uint8Array([0xff, 0x7b]) } });
    expect(await daemonTransport(fake.client).getJson('https://tt.horner.tj/stops')).toEqual({ status: 200, body: null });
  });
  test('a redirect comes back as its status, not followed', async () => {
    const fake = fakeClient({ fetch: { status: 302, body: new Uint8Array() } });
    expect((await daemonTransport(fake.client).getJson('https://tt.horner.tj/stops')).status).toBe(302);
  });
  test('a body over the cap is rejected before parsing', async () => {
    const fake = fakeClient({ fetch: { status: 200, body: encode(`[${'1,'.repeat(MAX_BODY_BYTES / 2)}1]`) } });
    await expect(daemonTransport(fake.client).getJson('https://tt.horner.tj/stops')).rejects.toThrow(/body over/);
  });
  test('a daemon error rejects', async () => {
    const fake = fakeClient({ fetch: 'fail' });
    await expect(daemonTransport(fake.client).getJson('https://tt.horner.tj/stops')).rejects.toThrow('net timeout');
  });
});

describe('jsonOrNull', () => {
  test('parses or gives null', () => {
    expect(jsonOrNull('{"a":1}')).toEqual({ a: 1 });
    expect(jsonOrNull('{')).toBeNull();
  });
});

describe('browserTransport', () => {
  const realFetch = globalThis.fetch;
  const RealWebSocket = globalThis.WebSocket;
  afterEach(() => {
    globalThis.fetch = realFetch;
    globalThis.WebSocket = RealWebSocket;
  });

  test('getJson asks for json without following redirects', async () => {
    const seen: { url: string; init: RequestInit | undefined }[] = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      seen.push({ url, init });
      return new Response('{"ok":true}', { status: 200 });
    }) as unknown as typeof fetch;
    expect(await browserTransport().getJson('https://tt.horner.tj/stops')).toEqual({ status: 200, body: { ok: true } });
    expect(seen[0]?.init?.redirect).toBe('manual');
    globalThis.fetch = (async () => new Response('', { status: 302 })) as unknown as typeof fetch;
    expect((await browserTransport().getJson('https://tt.horner.tj/stops')).status).toBe(302);
    globalThis.fetch = (async () => new Response('x'.repeat(MAX_BODY_BYTES + 1), { status: 200 })) as unknown as typeof fetch;
    await expect(browserTransport().getJson('https://tt.horner.tj/stops')).rejects.toThrow(/body over/);
  });

  test('sockets report one close even when an error precedes it', () => {
    class FakeWebSocket {
      static OPEN = 1;
      readyState = 1;
      sent: string[] = [];
      onopen: (() => void) | null = null;
      onmessage: ((e: { data: unknown }) => void) | null = null;
      onclose: ((e: { code: number; reason: string }) => void) | null = null;
      onerror: (() => void) | null = null;
      static last: FakeWebSocket | null = null;
      constructor(readonly url: string) {
        FakeWebSocket.last = this;
      }
      send(text: string) {
        this.sent.push(text);
      }
      close() {
        this.readyState = 3;
      }
    }
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
    const { events, handlers } = recorder();
    const socket = browserTransport().open('wss://tt.horner.tj/', handlers);
    const ws = FakeWebSocket.last!;
    ws.onopen!();
    socket.send('sub');
    ws.onmessage!({ data: 'hi' });
    ws.onmessage!({ data: new Uint8Array() });
    ws.onerror!();
    ws.onclose!({ code: 1006, reason: '' });
    expect(ws.sent).toEqual(['sub']);
    expect(events).toEqual(['open', 'text:hi', 'close:socket error']);
    socket.send('after');
    expect(ws.sent).toEqual(['sub']);
  });

  test('close() suppresses the close event that follows', () => {
    class FakeWebSocket {
      static OPEN = 1;
      readyState = 1;
      onclose: ((e: { code: number; reason: string }) => void) | null = null;
      static last: FakeWebSocket | null = null;
      constructor(readonly url: string) {
        FakeWebSocket.last = this;
      }
      send() {}
      close() {
        this.readyState = 3;
      }
    }
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
    const { events, handlers } = recorder();
    const socket = browserTransport().open('wss://tt.horner.tj/', handlers);
    socket.close();
    FakeWebSocket.last!.onclose!({ code: 1000, reason: 'bye' });
    expect(events).toEqual([]);
  });
});
