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

export function browserTransport(): Transport {
  return {
    async getJson(url) {
      const res = await fetch(url, { headers: { accept: 'application/json' } });
      const text = await res.text();
      let body: unknown = null;
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
      return { status: res.status, body };
    },
    open(url, handlers) {
      const ws = new WebSocket(url);
      let closed = false;
      ws.onopen = () => handlers.onOpen();
      ws.onmessage = e => {
        if (typeof e.data === 'string') handlers.onText(e.data);
      };
      ws.onclose = e => {
        if (closed) return;
        closed = true;
        handlers.onClose(e.reason || `closed ${e.code}`);
      };
      ws.onerror = () => {
        if (closed) return;
        closed = true;
        handlers.onClose('socket error');
      };
      return {
        send: text => {
          if (ws.readyState === WebSocket.OPEN) ws.send(text);
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
  return {
    async getJson(url) {
      const res = await client.net.fetch({
        request: { url, method: 'GET', headers: [{ name: 'accept', value: 'application/json' }], body: null, timeoutMs: 45_000, redirect: 'follow' },
      });
      if (!res.ok) throw new Error(res.kind === 'domain' ? `net ${res.error.error.type}` : 'daemon request failed');
      const { status, body } = res.response.response;
      const text = new TextDecoder().decode(new Uint8Array(body as unknown as number[]));
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
      return { status, body: parsed };
    },
    open(url, handlers) {
      const connectionId = crypto.randomUUID();
      let closed = false;
      const offs = [
        client.net.onWsMessage(m => {
          if (m.connectionId === connectionId && m.frame.type === 'text') handlers.onText(m.frame.data);
        }),
        client.net.onWsClosed(m => {
          if (m.connectionId !== connectionId || closed) return;
          closed = true;
          offs.forEach(off => off());
          handlers.onClose(m.reason || `closed ${m.code}`);
        }),
        client.net.onWsErrorEvent(m => {
          if (m.connectionId !== connectionId || closed) return;
          closed = true;
          offs.forEach(off => off());
          handlers.onClose(m.error.type);
        }),
      ];
      void client.net.wsOpen({ connectionId, url, protocols: null, headers: null }).then(res => {
        if (closed) return;
        if (res.ok) handlers.onOpen();
        else {
          closed = true;
          offs.forEach(off => off());
          handlers.onClose(res.kind === 'domain' ? res.error.error.type : 'daemon request failed');
        }
      });
      return {
        send: text => {
          if (!closed) void client.net.wsSend({ connectionId, frame: { type: 'text', data: text } });
        },
        close: () => {
          if (closed) return;
          closed = true;
          offs.forEach(off => off());
          void client.net.wsClose({ connectionId, code: 1000, reason: 'done' });
        },
      };
    },
  };
}
