import { vi } from "vitest";

type Handler = (...args: unknown[]) => void;

/** A minimal test double for a socket.io-client Socket: supports on/off/emit
 * with an ack callback, plus a `trigger` helper to simulate a server-pushed
 * event. `emit` is a vi.fn so tests can assert on outgoing calls, but by
 * default it does nothing — configure a per-event response with
 * `respondTo`. */
export function createFakeSocket() {
  const handlers = new Map<string, Handler[]>();
  const responses = new Map<string, unknown>();

  const socket = {
    connected: true,
    id: "fake-socket-id",
    on: vi.fn((event: string, cb: Handler) => {
      const list = handlers.get(event) ?? [];
      list.push(cb);
      handlers.set(event, list);
    }),
    off: vi.fn((event: string, cb: Handler) => {
      handlers.set(event, (handlers.get(event) ?? []).filter((h) => h !== cb));
    }),
    emit: vi.fn((event: string, _payload: unknown, ack?: (response: unknown) => void) => {
      if (ack) ack(responses.get(event) ?? { ok: false, error: "no fake response configured" });
    }),
    /** Simulates the server pushing an event (e.g. "question:start"). */
    trigger(event: string, data?: unknown) {
      for (const h of handlers.get(event) ?? []) h(data);
    },
    /** Configures what `ack` receives the next time `event` is emitted. */
    respondTo(event: string, response: unknown) {
      responses.set(event, response);
    },
  };
  return socket;
}
