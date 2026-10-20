import { describe, it, expect, vi } from "vitest";
import { PASSENGER_RIDE_SSE_EVENTS } from "@drts/contracts";
import type { PassengerRideAuthorityView } from "@drts/contracts";
import { PassengerClient } from "../../../packages/passenger-client/src/client.js";
import type { FetchOptions } from "../../../packages/passenger-client/src/client.js";
import {
  NativePassengerRideStream,
  NativePassengerSseParser,
  decodeNativePassengerRideEvent,
} from "../../../packages/passenger-client/src/native/ride-stream.js";
import type { NativePassengerStreamRequest } from "../../../packages/passenger-client/src/native/ride-stream.js";
import {
  NativePassengerReceiptDownloads,
  createNativePassengerBinaryTransport,
} from "../../../packages/passenger-client/src/native/receipt-download.js";
import type { NativePassengerBinaryRequest } from "../../../packages/passenger-client/src/native/receipt-download.js";
import { createNativePassengerAppStatePort } from "../../../apps/passenger-app/lib/native/app-state-port.js";

const id = "00000000-0000-4000-8000-000000000901";
const calculatedAt = "2026-10-14T12:00:00.000Z";
function ride(): PassengerRideAuthorityView {
  return {
    order: {
      orderId: id,
      orderNo: "demo-native-901",
      status: "completed",
      timingMode: "scheduled",
      requestedPickupAt: calculatedAt,
      pickup: { address: "外部地理示意" },
      dropoff: { address: "外部地理示意" },
      cancelableUntil: null,
      cancelledAt: null,
      completedAt: calculatedAt,
    },
    assignment: {
      assignmentVersion: 1,
      eta: { calculatedAt, seconds: 180, freshness: "fresh" },
    },
    rating: null,
    payment: null,
    receipt: {
      receiptId: "receipt-demo-901",
      receiptNo: "demo-901",
      orderId: id,
      issuedAt: calculatedAt,
      amountMinor: 20000,
      record: { htmlUrl: "/unused-metadata" },
    },
    actions: {
      canCancel: false,
      canRate: true,
      canContact: false,
      canReadReceipt: true,
    },
  } as unknown as PassengerRideAuthorityView;
}
function snake(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(snake);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [
      k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`),
      snake(v),
    ]),
  );
}
function envelope(version = 1, eventType = "eta_changed") {
  return {
    eventId: `event-${version}`,
    eventType,
    eventVersion: version,
    assignmentVersion: 1,
    orderId: id,
    occurredAt: calculatedAt,
    data: ride(),
  };
}
function frame(version = 1, eventType = "eta_changed") {
  return `data: ${JSON.stringify(snake(envelope(version, eventType)))}\n\n`;
}
async function flush() {
  for (let i = 0; i < 25; ++i) await Promise.resolve();
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

class StreamRequest implements NativePassengerStreamRequest {
  readyState = 1;
  status = 0;
  responseText = "";
  type = "text/event-stream";
  headers: Record<string, string> = {};
  url = "";
  aborted = 0;
  sent = 0;
  onreadystatechange: (() => void) | null = null;
  onprogress: (() => void) | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  open(_method: string, url: string) {
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  getResponseHeader() {
    return this.type;
  }
  send() {
    ++this.sent;
  }
  abort() {
    ++this.aborted;
    this.onabort?.();
  }
  append(chunk: string) {
    this.readyState = 3;
    this.status = 200;
    this.responseText += chunk;
    this.onprogress?.();
  }
  complete(status: number, body: string) {
    this.readyState = 4;
    this.status = status;
    this.responseText = body;
    this.onreadystatechange?.();
    this.onload?.();
  }
}
function streamSetup() {
  let current: {
    generation: number;
    tokens: { accessToken: string; refreshToken: string };
  } | null = {
    generation: 1,
    tokens: {
      accessToken: "synthetic-access-one",
      refreshToken: "synthetic-refresh-one",
    },
  };
  let state = "active";
  const listeners = new Set<(value: string) => void>();
  const requests: StreamRequest[] = [];
  const reads: string[] = [];
  let readGate: Promise<unknown> | undefined;
  const fetchFn = vi.fn(async (url: string) => {
    reads.push(url);
    if (readGate) await readGate;
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: { ride: snake(ride()) } }),
    };
  });
  const onRide = vi.fn(),
    onEvent = vi.fn(),
    onConnection = vi.fn(),
    onError = vi.fn(),
    onReset = vi.fn();
  const stream = new NativePassengerRideStream({
    baseUrl: "https://api.example.invalid/",
    orderId: id,
    client: new PassengerClient({
      baseUrl: "https://api.example.invalid",
      fetchFn,
    }),
    session: { snapshot: async () => current },
    createRequest: () => {
      const xhr = new StreamRequest();
      requests.push(xhr);
      return xhr;
    },
    appState: {
      currentState: () => state,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
    onRide,
    onEvent,
    onConnection,
    onError,
    onReset,
  });
  return {
    stream,
    requests,
    reads,
    fetchFn,
    onRide,
    onEvent,
    onConnection,
    onError,
    onReset,
    listeners,
    setToken(token: string) {
      if (current)
        current = {
          ...current,
          tokens: { ...current.tokens, accessToken: token },
        };
    },
    endSession() {
      current = null;
    },
    replaceSession() {
      current = {
        generation: 2,
        tokens: {
          accessToken: "new-account",
          refreshToken: "new-account-refresh",
        },
      };
    },
    gate(promise: Promise<unknown>) {
      readGate = promise;
    },
    appState(value: string) {
      state = value;
      for (const listener of listeners) listener(value);
    },
  };
}

describe("Native incremental SSE parser and actual envelope decoding", () => {
  it("handles CRLF across chunks, comments, repeated data lines and two frames", () => {
    const receive = vi.fn();
    const parser = new NativePassengerSseParser(receive);
    parser.push(": keepalive\r");
    parser.push('\ndata: {"value":\r');
    parser.push("\ndata: 2}\r\n\r");
    expect(receive).not.toHaveBeenCalled();
    parser.push("\ndata: next\n\n");
    expect(receive.mock.calls).toEqual([
      [{ event: "message", data: '{"value":\n2}' }],
      [{ event: "message", data: "next" }],
    ]);
  });
  it("retains an incomplete final frame and accepts named-event syntax", () => {
    const receive = vi.fn();
    const parser = new NativePassengerSseParser(receive);
    parser.push("event: eta_changed\ndata: {}\n");
    expect(receive).not.toHaveBeenCalled();
    parser.push("\n");
    expect(receive).toHaveBeenCalledWith({ event: "eta_changed", data: "{}" });
  });
  it.each(PASSENGER_RIDE_SSE_EVENTS)(
    "decodes actual snake-case %s envelope",
    (eventType) => {
      const event = decodeNativePassengerRideEvent(
        snake(envelope(7, eventType)),
        id,
      );
      expect(event.eventType).toBe(eventType);
      expect(event.eventVersion).toBe(7);
      expect(event.data.assignment?.eta.calculatedAt).toBe(calculatedAt);
    },
  );
  it.each([NaN, Infinity, -1])(
    "refuses nonfinite or negative event cursor %s",
    (eventVersion) => {
      expect(() =>
        decodeNativePassengerRideEvent({ ...envelope(), eventVersion }, id),
      ).toThrow();
    },
  );
});

describe("Native real client/XHR stream lifecycle with injected boundaries", () => {
  it("reads current ride before opening exact account path and supplies current Bearer", async () => {
    const h = streamSetup();
    await h.stream.start();
    expect(h.reads).toEqual([
      `https://api.example.invalid/api/passenger-app/rides/${id}`,
    ]);
    expect(h.requests[0]?.url).toBe(
      `https://api.example.invalid/api/passenger-app/rides/${id}/events`,
    );
    expect(h.requests[0]?.headers).toEqual({
      Accept: "text/event-stream",
      Authorization: "Bearer synthetic-access-one",
    });
    expect(h.onRide.mock.calls[0]?.[0].assignment.eta.calculatedAt).toBe(
      calculatedAt,
    );
    h.stream.stop();
  });
  it("consumes incremental responseText once and orders only by eventVersion", async () => {
    const h = streamSetup();
    await h.stream.start();
    const xhr = h.requests[0]!;
    const first = frame(4);
    xhr.append(first.slice(0, 35));
    await flush();
    expect(h.onEvent).not.toHaveBeenCalled();
    xhr.append(first.slice(35) + frame(4) + frame(3) + frame(5));
    xhr.onreadystatechange?.();
    await flush();
    expect(h.onEvent.mock.calls.map((c) => c[0].eventVersion)).toEqual([4, 5]);
    expect(h.stream.lastEventVersion).toBe(5);
    h.stream.stop();
  });
  it("background aborts and foreground re-reads with rotated token; new process cursor resets while captured ETA survives", async () => {
    const h = streamSetup();
    await h.stream.start();
    h.requests[0]!.append(frame(8));
    await flush();
    h.appState("background");
    expect(h.requests[0]!.aborted).toBe(1);
    expect(h.requests[0]!.onprogress).toBeNull();
    h.setToken("synthetic-rotated");
    const gate = deferred<unknown>();
    h.gate(gate.promise);
    h.appState("active");
    await flush();
    expect(h.reads.length).toBe(2);
    expect(h.requests.length).toBe(1);
    gate.resolve(undefined);
    await flush();
    expect(h.requests.length).toBe(2);
    expect(h.requests[1]!.headers.Authorization).toBe(
      "Bearer synthetic-rotated",
    );
    h.requests[1]!.append(frame(7) + frame(9));
    await flush();
    expect(h.onEvent.mock.calls.map((c) => c[0].eventVersion)).toEqual([
      8, 7, 9,
    ]);
    expect(h.onRide.mock.calls[1]?.[0].assignment.eta.calculatedAt).toBe(
      calculatedAt,
    );
    h.stream.stop();
  });
  it("unmount during in-flight authority read does not construct a later XHR", async () => {
    const h = streamSetup();
    const gate = deferred<unknown>();
    h.gate(gate.promise);
    const start = h.stream.start();
    await flush();
    h.stream.stop();
    gate.resolve(undefined);
    await start;
    expect(h.requests).toHaveLength(0);
    expect(h.onRide).not.toHaveBeenCalled();
    expect(h.listeners.size).toBe(0);
  });
  it("account replacement during authority read never publishes the previous account ride", async () => {
    const h = streamSetup();
    const gate = deferred<unknown>();
    h.gate(gate.promise);
    const start = h.stream.start();
    await flush();
    h.replaceSession();
    gate.resolve(undefined);
    await start;
    expect(h.onRide).not.toHaveBeenCalled();
    expect(h.requests).toHaveLength(0);
    expect(h.onReset).toHaveBeenCalled();
    h.stream.stop();
  });
  it("logout cleanup cancels XHR/listener, resets cursor, and ignores old callbacks", async () => {
    const h = streamSetup();
    await h.stream.start();
    const xhr = h.requests[0]!;
    const callback = xhr.onprogress!;
    xhr.append(frame(2));
    await flush();
    h.endSession();
    h.stream.endSession();
    xhr.responseText += frame(3);
    callback();
    await flush();
    expect(h.onEvent).toHaveBeenCalledTimes(1);
    expect(h.stream.lastEventVersion).toBe(0);
    expect(xhr.aborted).toBe(1);
    expect(h.listeners.size).toBe(0);
    expect(h.onReset).toHaveBeenCalled();
  });
  it("detects session clear while progress is pending and publishes no late frame", async () => {
    const h = streamSetup();
    await h.stream.start();
    h.endSession();
    h.requests[0]!.append(frame(1));
    await flush();
    expect(h.onEvent).not.toHaveBeenCalled();
    expect(h.requests[0]!.aborted).toBe(1);
  });
  it("stops delivery within one parsed chunk if its first event unmounts the consumer", async () => {
    const h = streamSetup();
    h.onEvent.mockImplementation(() => h.stream.stop());
    await h.stream.start();
    h.requests[0]!.append(frame(1) + frame(2));
    await flush();
    expect(h.onEvent).toHaveBeenCalledTimes(1);
  });
  it.each([401, 403, 404])(
    "retains actual ownership/auth HTTP status%s and API code",
    async (status) => {
      const h = streamSetup();
      await h.stream.start();
      h.requests[0]!.complete(
        status,
        '{"error":{"code":"PASSENGER_RIDE_NOT_FOUND"}}',
      );
      await flush();
      expect(h.onError.mock.calls[0]?.[0]).toMatchObject({
        status,
        code: "PASSENGER_RIDE_NOT_FOUND",
      });
      expect(h.onEvent).not.toHaveBeenCalled();
      h.stream.stop();
    },
  );
  it("reports late server SSE error as stream failure, never completed ownership", async () => {
    const h = streamSetup();
    await h.stream.start();
    h.requests[0]!.append("event: error\ndata: Api Request Error\n\n");
    await flush();
    expect(h.onError.mock.calls[0]?.[0]).toMatchObject({
      code: "ride_stream_error",
    });
    expect(h.onEvent).not.toHaveBeenCalled();
    h.stream.stop();
  });
  it("network failure preserves authority and explicit retry re-reads before resetting the connection cursor", async () => {
    const h = streamSetup();
    await h.stream.start();
    h.requests[0]!.append(frame(2));
    await flush();
    h.requests[0]!.onerror?.();
    expect(h.onError.mock.calls[0]?.[0]).toMatchObject({ status: 503 });
    await h.stream.reconnect();
    expect(h.reads).toHaveLength(2);
    expect(h.stream.lastEventVersion).toBe(0);
    h.stream.stop();
  });
  it("does not subscribe in background, then opens only after first active read", async () => {
    const h = streamSetup();
    h.appState("background");
    await h.stream.start();
    expect(h.reads).toHaveLength(0);
    h.appState("active");
    await flush();
    expect(h.requests).toHaveLength(1);
    h.stream.stop();
  });
  it("AppState adapter removes the actual platform subscription", () => {
    const remove = vi.fn();
    const addEventListener = vi.fn(() => ({ remove }));
    const port = createNativePassengerAppStatePort({
      currentState: "background",
      addEventListener,
    });
    expect(port.currentState()).toBe("background");
    const listener = vi.fn();
    const cleanup = port.subscribe(listener);
    expect(addEventListener).toHaveBeenCalledWith("change", listener);
    cleanup();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});

class BinaryRequest implements NativePassengerBinaryRequest {
  status = 200;
  response: unknown = new Uint8Array([37, 80, 68, 70, 45, 49]).buffer;
  responseType = "";
  type = "application/pdf";
  disposition: string | null = 'attachment; filename="ride-demo.pdf"';
  url = "";
  headers: Record<string, string> = {};
  aborted = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  auto = true;
  open(_method: string, url: string) {
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  getResponseHeader(name: string) {
    return name === "Content-Type" ? this.type : this.disposition;
  }
  send() {
    if (this.auto) void Promise.resolve().then(() => this.onload?.());
  }
  abort() {
    ++this.aborted;
    this.onabort?.();
  }
}
function receiptSetup() {
  let current: {
    generation: number;
    tokens: { accessToken: string; refreshToken: string };
  } | null = {
    generation: 1,
    tokens: {
      accessToken: "synthetic-access",
      refreshToken: "synthetic-refresh",
    },
  };
  let view = ride();
  let status = 200;
  let badJson = false;
  let missingPdf = false;
  const binaryRequests: BinaryRequest[] = [];
  let configure: (xhr: BinaryRequest) => void = () => undefined;
  const fetchFn = vi.fn(async (url: string, options?: FetchOptions) => {
    void options;
    return {
      ok: status === 200,
      status,
      json: async () => {
        if (badJson) throw new Error("not json");
        return url.endsWith("/downloads")
          ? {
              data: {
                receipt_url: `/api/passenger-app/rides/${id}/receipt/artifacts/html`,
                html_url: `/api/passenger-app/rides/${id}/receipt/artifacts/html`,
                ...(!missingPdf
                  ? {
                      pdf_url: `/api/passenger-app/rides/${id}/receipt/artifacts/pdf`,
                    }
                  : {}),
                order_id: id,
                certificate_id: "receipt-demo-901",
              },
            }
          : { data: { ride: snake(view) } };
      },
    };
  });
  const files = {
    write: vi.fn(
      async (_input: {
        fileName: string;
        contentType: string;
        bytes: Uint8Array;
      }) => {
        void _input;
        return "file:///synthetic-boundary/ride-demo.pdf";
      },
    ),
    remove: vi.fn(async (uri: string) => {
      void uri;
    }),
    open: vi.fn(async (uri: string, type: string) => {
      void uri;
      void type;
    }),
  };
  const downloads = new NativePassengerReceiptDownloads({
    baseUrl: "https://api.example.invalid",
    fetchFn,
    client: new PassengerClient({
      baseUrl: "https://api.example.invalid",
      fetchFn,
    }),
    session: { snapshot: async () => current },
    binary: createNativePassengerBinaryTransport(() => {
      const xhr = new BinaryRequest();
      configure(xhr);
      binaryRequests.push(xhr);
      return xhr;
    }),
    files,
  });
  return {
    downloads,
    files,
    binaryRequests,
    fetchFn,
    configure(fn: (xhr: BinaryRequest) => void) {
      configure = fn;
    },
    setView(value: PassengerRideAuthorityView) {
      view = value;
    },
    noPdf() {
      missingPdf = true;
    },
    setStatus(value: number) {
      status = value;
    },
    badJson() {
      badJson = true;
    },
    endSession() {
      current = null;
    },
    rotate() {
      if (current) current.tokens.accessToken = "rotated-current";
    },
  };
}
describe("Native real receipt metadata -> authorized bytes -> injected local file", () => {
  it("uses actual ride receipt and downloads metadata, Bearer/arraybuffer and exact bytes before local open", async () => {
    const h = receiptSetup();
    h.rotate();
    const result = await h.downloads.download(id, "pdf");
    expect(h.fetchFn.mock.calls.map((c) => c[0])).toEqual([
      `https://api.example.invalid/api/passenger-app/rides/${id}`,
      `https://api.example.invalid/api/passenger-app/rides/${id}/receipt/downloads`,
    ]);
    expect(h.fetchFn.mock.calls[1]?.[1]?.headers?.Authorization).toBe(
      "Bearer rotated-current",
    );
    const xhr = h.binaryRequests[0]!;
    expect(xhr.url).toBe(
      `https://api.example.invalid/api/passenger-app/rides/${id}/receipt/artifacts/pdf`,
    );
    expect(xhr.headers.Authorization).toBe("Bearer rotated-current");
    expect(xhr.responseType).toBe("arraybuffer");
    expect(h.files.write.mock.calls[0]?.[0]).toEqual({
      fileName: "ride-demo.pdf",
      contentType: "application/pdf",
      bytes: new Uint8Array([37, 80, 68, 70, 45, 49]),
    });
    expect(h.files.open).toHaveBeenCalledWith(result.uri, "application/pdf");
    expect(result.receipt.receiptNo).toBe("demo-901");
    expect(result.byteLength).toBe(6);
  });
  it("downloads actual HTML bytes/content-type without forging a PDF", async () => {
    const h = receiptSetup();
    h.configure((xhr) => {
      xhr.type = "text/html; charset=utf-8";
      xhr.response = new Uint8Array([60, 104, 49, 62]).buffer;
      xhr.disposition = null;
    });
    const result = await h.downloads.download(id, "html", false);
    expect(result.contentType).toBe("text/html; charset=utf-8");
    expect(h.files.write.mock.calls[0]?.[0].fileName).toBe("receipt.html");
    expect(h.files.open).not.toHaveBeenCalled();
  });
  it("missing PDF metadata is explicit and never makes a synthetic artifact", async () => {
    const h = receiptSetup();
    h.noPdf();
    await expect(h.downloads.download(id, "pdf")).rejects.toMatchObject({
      code: "receipt_format_unavailable",
    });
    expect(h.binaryRequests).toHaveLength(0);
    expect(h.files.write).not.toHaveBeenCalled();
  });
  it("authority forbids receipt before requesting downloads or bytes", async () => {
    const h = receiptSetup();
    h.setView({
      ...ride(),
      actions: { ...ride().actions, canReadReceipt: false },
    });
    await expect(h.downloads.download(id, "pdf")).rejects.toMatchObject({
      status: 403,
    });
    expect(h.fetchFn).toHaveBeenCalledTimes(1);
    expect(h.binaryRequests).toHaveLength(0);
  });
  it("pending authority receipt is not downloaded from its presentation URLs", async () => {
    const h = receiptSetup();
    h.setView({ ...ride(), receipt: null });
    await expect(h.downloads.download(id, "pdf")).rejects.toMatchObject({
      code: "PASSENGER_RECEIPT_PENDING",
    });
    expect(h.files.write).not.toHaveBeenCalled();
  });
  it.each([401, 403, 404])(
    "binary HTTP%s retains refusal and writes/opens no local artifact",
    async (status) => {
      const h = receiptSetup();
      h.configure((xhr) => {
        xhr.status = status;
      });
      await expect(h.downloads.download(id, "pdf")).rejects.toMatchObject({
        status,
      });
      expect(h.files.write).not.toHaveBeenCalled();
      expect(h.files.open).not.toHaveBeenCalled();
    },
  );
  it("does not label HTML/wrong bytes as a PDF", async () => {
    const h = receiptSetup();
    h.configure((xhr) => {
      xhr.type = "text/html";
    });
    await expect(h.downloads.download(id, "pdf")).rejects.toMatchObject({
      code: "invalid_receipt_bytes",
    });
    expect(h.files.write).not.toHaveBeenCalled();
  });
  it("unmount aborts pending binary request and removes its callbacks", async () => {
    const h = receiptSetup();
    h.configure((xhr) => {
      xhr.auto = false;
    });
    const request = h.downloads.download(id, "pdf");
    const outcome = expect(request).rejects.toMatchObject({
      code: "cancelled",
    });
    await flush();
    const xhr = h.binaryRequests[0]!;
    h.downloads.dispose();
    await outcome;
    expect(xhr.aborted).toBe(1);
    expect(xhr.onload).toBeNull();
    expect(h.files.write).not.toHaveBeenCalled();
  });
  it("session clear before received bytes writes and opens nothing", async () => {
    const h = receiptSetup();
    h.configure((xhr) => {
      xhr.auto = false;
    });
    const request = h.downloads.download(id, "pdf");
    const outcome = expect(request).rejects.toMatchObject({
      code: "session_changed",
    });
    await flush();
    h.endSession();
    h.binaryRequests[0]!.onload?.();
    await outcome;
    expect(h.files.write).not.toHaveBeenCalled();
  });
  it("awaits actual file write and clears its artifact if session ends during persistence", async () => {
    const h = receiptSetup();
    const gate = deferred<string>();
    h.files.write.mockImplementation(() => gate.promise);
    const request = h.downloads.download(id, "pdf");
    const outcome = expect(request).rejects.toMatchObject({
      code: "session_changed",
    });
    await flush();
    expect(h.files.open).not.toHaveBeenCalled();
    h.endSession();
    gate.resolve("file:///owned-test-artifact");
    await outcome;
    expect(h.files.remove).toHaveBeenCalledWith("file:///owned-test-artifact");
    expect(h.files.open).not.toHaveBeenCalled();
  });
});
