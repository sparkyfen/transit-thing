import type { BridgethingClient } from '@bridgething/client';

export interface SocketHandlers {
  onOpen(): void;
  onText(text: string): void;
  onClose(reason: string): void;
}

export interface Socket {
  send(text: string): void;
  close(): void;
}

// the kiosk can only reach the internet through the phone, so the app never touches fetch or WebSocket directly on the device
export interface Transport {
  getJson(url: string): Promise<{ status: number; body: unknown }>;
  open(url: string, handlers: SocketHandlers): Socket;
}

// a stops reply for a full box is a few KB; anything near this size is not the api, and the cap bounds the parse cost
export const MAX_BODY_BYTES = 256 * 1024;
// the request budget is 45 s, and the client rpc has to outlive it to see the reply
const REQUEST_TIMEOUT_MS = 45_000;
const RPC_TIMEOUT_MS = 50_000;

export function jsonOrNull(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function bodyJson(bytes: Uint8Array): unknown {
  if (bytes.byteLength > MAX_BODY_BYTES) throw new Error(`body over ${MAX_BODY_BYTES} bytes`);
  return jsonOrNull(new TextDecoder().decode(bytes));
}

export function browserTransport(): Transport {
  return {
    async getJson(url) {
      const res = await fetch(url, { headers: { accept: 'application/json' }, redirect: 'manual' });
      return { status: res.status, body: bodyJson(new Uint8Array(await res.arrayBuffer())) };
    },
    open(url, handlers) {
      const ws = new WebSocket(url);
      let closed = false;
      const shutdown = (reason: string) => {
        if (closed) return;
        closed = true;
        handlers.onClose(reason);
      };
      ws.onopen = () => handlers.onOpen();
      ws.onmessage = e => {
        if (typeof e.data === 'string') handlers.onText(e.data);
      };
      ws.onclose = e => shutdown(e.reason || `closed ${e.code}`);
      ws.onerror = () => shutdown('socket error');
      return {
        send: text => {
          if (!closed && ws.readyState === WebSocket.OPEN) ws.send(text);
        },
        close: () => {
          closed = true;
          ws.close();
        },
      };
    },
  };
}

export function daemonTransport(client: BridgethingClient): Transport {
  // the daemon drops every socket with its link, without a close event per socket, so one listener stands in while any is open
  const open = new Set<(reason: string) => void>();
  let offLink: (() => void) | null = null;
  const track = (shutdown: (reason: string) => void) => {
    open.add(shutdown);
    offLink ??= client.on(e => {
      if (e.type === 'close') [...open].forEach(s => s('daemon link lost'));
    });
  };
  const untrack = (shutdown: (reason: string) => void) => {
    open.delete(shutdown);
    if (open.size === 0) {
      offLink?.();
      offLink = null;
    }
  };
  return {
    async getJson(url) {
      const res = await client.net.fetch(
        {
          request: { url, method: 'GET', headers: [{ name: 'accept', value: 'application/json' }], body: null, timeoutMs: REQUEST_TIMEOUT_MS, redirect: 'manual' },
        },
        { timeoutMs: RPC_TIMEOUT_MS },
      );
      if (!res.ok) throw new Error(res.kind === 'domain' ? `net ${res.error.error.type}` : 'daemon request failed');
      const { status, body } = res.response.response;
      return { status, body: bodyJson(new Uint8Array(body as unknown as number[])) };
    },
    open(url, handlers) {
      const connectionId = crypto.randomUUID();
      let closed = false;
      // stops every listener; the handler runs only for a close the server or daemon started
      const shutdown = (reason: string | null) => {
        if (closed) return;
        closed = true;
        offs.forEach(off => off());
        untrack(shutdown);
        if (reason !== null) handlers.onClose(reason);
      };
      track(shutdown);
      const offs = [
        client.net.onWsMessage(m => {
          if (m.connectionId === connectionId && !closed && m.frame.type === 'text') handlers.onText(m.frame.data);
        }),
        client.net.onWsClosed(m => {
          if (m.connectionId === connectionId) shutdown(m.reason || `closed ${m.code}`);
        }),
        client.net.onWsErrorEvent(m => {
          if (m.connectionId === connectionId) shutdown(m.error.type);
        }),
      ];
      void client.net.wsOpen({ connectionId, url, protocols: null, headers: null }).then(
        res => {
          if (closed) return;
          if (res.ok) handlers.onOpen();
          else shutdown(res.kind === 'domain' ? res.error.error.type : 'daemon request failed');
        },
        reason => shutdown(String(reason)),
      );
      return {
        send: text => {
          if (!closed) void client.net.wsSend({ connectionId, frame: { type: 'text', data: text } });
        },
        close: () => {
          if (closed) return;
          shutdown(null);
          void client.net.wsClose({ connectionId, code: 1000, reason: 'done' });
        },
      };
    },
  };
}
