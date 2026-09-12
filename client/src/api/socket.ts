import { io, Socket } from "socket.io-client";
import { API_URL } from "./client";

let socket: Socket | null = null;

/** Lazily creates a single shared socket connection for the session.
 * Transport is left to Socket.IO's default negotiation (long-polling first,
 * upgrading to WebSocket when possible) rather than forced to
 * WebSocket-only — some school networks/proxies block the WS upgrade
 * entirely, which would otherwise fail to connect with no fallback. */
export function getSocket(): Socket {
  if (!socket) {
    socket = io(API_URL, { autoConnect: true });
  }
  return socket;
}

export type Ack<T = unknown> = { ok: true; data: T } | { ok: false; error: string; code?: string };

export function emitAsync<T = unknown>(event: string, payload: unknown): Promise<Ack<T>> {
  return new Promise((resolve) => {
    getSocket().emit(event, payload, resolve);
  });
}
