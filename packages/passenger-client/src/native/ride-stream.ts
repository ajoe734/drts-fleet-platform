import { PASSENGER_RIDE_SSE_EVENTS } from "@drts/contracts";
import type {
  PassengerRideAuthorityView,
  PassengerRideSseEventEnvelope,
} from "@drts/contracts";
import type { PassengerClient } from "../client.js";
import { decodeBookingWire } from "../booking/wire.js";
import { PassengerApiError } from "../auth/errors.js";
import type { NativePassengerSession } from "./session.js";

/** Structural RN XMLHttpRequest boundary; no DOM or platform imports. */
export interface NativePassengerStreamRequest {
  readyState: number;
  status: number;
  responseText: string;
  onreadystatechange: (() => void) | null;
  onprogress: (() => void) | null;
  onload: (() => void) | null;
  onerror: (() => void) | null;
  onabort: (() => void) | null;
  open(method: string, url: string, async: boolean): void;
  setRequestHeader(name: string, value: string): void;
  getResponseHeader(name: string): string | null;
  send(): void;
  abort(): void;
}
export interface NativePassengerAppStatePort {
  currentState(): string;
  subscribe(listener: (state: string) => void): () => void;
}
export type NativePassengerStreamState =
  | "connecting"
  | "connected"
  | "disconnected";
export interface NativePassengerSseFrame {
  event: string;
  data: string;
}

/** Incremental SSE lines, including CRLF split between XHR progress callbacks. */
export class NativePassengerSseParser {
  private pending = "";
  private event = "message";
  private data: string[] = [];
  constructor(
    private readonly receive: (frame: NativePassengerSseFrame) => void,
  ) {}
  push(chunk: string): void {
    this.pending += chunk;
    let end: number;
    while ((end = this.pending.indexOf("\n")) >= 0) {
      const line = this.pending.slice(0, end).replace(/\r$/, "");
      this.pending = this.pending.slice(end + 1);
      if (line === "") {
        if (this.data.length)
          this.receive({ event: this.event, data: this.data.join("\n") });
        this.event = "message";
        this.data = [];
        continue;
      }
      if (line.startsWith(":")) continue;
      const colon = line.indexOf(":");
      const name = colon < 0 ? line : line.slice(0, colon);
      let value = colon < 0 ? "" : line.slice(colon + 1);
      if (value.startsWith(" ")) value = value.slice(1);
      if (name === "data") this.data.push(value);
      else if (name === "event") this.event = value || "message";
    }
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function invalidStream(): never {
  throw new PassengerApiError(
    502,
    "invalid_ride_stream",
    "目前無法確認行程更新。",
  );
}
export function decodeNativePassengerRideEvent(
  raw: unknown,
  orderId: string,
): PassengerRideSseEventEnvelope {
  const event = record(decodeBookingWire(raw));
  const data = record(event?.data);
  const order = record(data?.order);
  if (
    !event ||
    !data ||
    !order ||
    event.orderId !== orderId ||
    order.orderId !== orderId ||
    typeof event.eventId !== "string" ||
    typeof event.eventType !== "string" ||
    !(PASSENGER_RIDE_SSE_EVENTS as readonly string[]).includes(
      event.eventType,
    ) ||
    typeof event.eventVersion !== "number" ||
    !Number.isFinite(event.eventVersion) ||
    event.eventVersion < 0 ||
    typeof event.occurredAt !== "string" ||
    !Number.isFinite(Date.parse(event.occurredAt))
  )
    invalidStream();
  return event as unknown as PassengerRideSseEventEnvelope;
}
function httpError(xhr: NativePassengerStreamRequest): PassengerApiError {
  let code = "unavailable";
  try {
    const payload = record(JSON.parse(xhr.responseText));
    const error = record(payload?.error);
    if (typeof error?.code === "string") code = error.code;
    else if (typeof payload?.error === "string") code = payload.error;
  } catch {
    /* Status is still authoritative for a non-JSON response. */
  }
  return new PassengerApiError(xhr.status, code, "目前無法讀取此行程的更新。");
}

/** Owner supplies the real PassengerClient and current NativePassengerSession. */
export class NativePassengerRideStream {
  private running = false;
  private active = false;
  private epoch = 0;
  private request: NativePassengerStreamRequest | null = null;
  private unsubscribe: (() => void) | undefined;
  private sessionGeneration: number | undefined;
  private cursor = 0;
  private queue: Promise<void> = Promise.resolve();
  constructor(
    private readonly options: {
      baseUrl: string;
      orderId: string;
      session: Pick<NativePassengerSession, "snapshot">;
      client: Pick<PassengerClient, "getRide">;
      createRequest(): NativePassengerStreamRequest;
      appState: NativePassengerAppStatePort;
      onRide(ride: PassengerRideAuthorityView): void;
      onEvent(event: PassengerRideSseEventEnvelope): void;
      onConnection(state: NativePassengerStreamState): void;
      onError(error: unknown): void;
      onReset?(): void;
    },
  ) {}
  get lastEventVersion(): number {
    return this.cursor;
  }
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.active = this.options.appState.currentState() === "active";
    this.unsubscribe = this.options.appState.subscribe((state) => {
      const active = state === "active";
      if (active === this.active) return;
      this.active = active;
      if (active) void this.reconnect();
      else this.close();
    });
    if (this.active) await this.reconnect();
  }
  private close(): void {
    ++this.epoch;
    const request = this.request;
    this.request = null;
    if (request) {
      request.onreadystatechange =
        request.onprogress =
        request.onload =
        request.onerror =
        request.onabort =
          null;
      request.abort();
    }
    this.options.onConnection("disconnected");
  }
  stop(): void {
    this.running = false;
    this.active = false;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.close();
  }
  /** Call before logout/account replacement; no old stream survives local clear. */
  endSession(): void {
    this.stop();
    this.cursor = 0;
    this.sessionGeneration = undefined;
    this.options.onReset?.();
  }
  /** Manual retry or foreground always re-reads authority before resubscription. */
  async reconnect(): Promise<void> {
    this.close();
    if (!this.running || !this.active) return;
    const epoch = this.epoch;
    const live = () => this.running && this.active && epoch === this.epoch;
    this.options.onConnection("connecting");
    try {
      const before = await this.options.session.snapshot();
      if (!live()) return;
      if (!before)
        throw new PassengerApiError(401, "unauthorized", "請重新登入。");
      const response = await this.options.client.getRide(this.options.orderId);
      const current = await this.options.session.snapshot();
      if (!live()) return;
      if (!current || current.generation !== before.generation) {
        this.close();
        this.options.onReset?.();
        return;
      }
      if (
        this.sessionGeneration !== undefined &&
        this.sessionGeneration !== current.generation
      ) {
        this.cursor = 0;
        this.options.onReset?.();
      }
      this.sessionGeneration = current.generation;
      // Versions order one live connection, not different API processes. The
      // authority read above and epoch fence replace the previous connection.
      this.cursor = 0;
      this.options.onReset?.();
      // Existing captured ETA/calculatedAt is forwarded verbatim, never replaced by reconnect time.
      this.options.onRide(response.ride);
      if (!live()) return;
      const xhr = this.options.createRequest();
      this.request = xhr;
      let consumed = 0;
      const fail = (error: unknown) => {
        if (!live()) return;
        this.close();
        this.options.onError(error);
      };
      const parser = new NativePassengerSseParser((frame) => {
        if (!live()) return;
        if (frame.event === "error") {
          throw new PassengerApiError(
            502,
            "ride_stream_error",
            "行程更新中斷，請重新查詢。",
          );
        }
        const event = decodeNativePassengerRideEvent(
          JSON.parse(frame.data),
          this.options.orderId,
        );
        if (event.eventVersion <= this.cursor) return;
        this.cursor = event.eventVersion;
        this.options.onEvent(event);
      });
      const drain = () => {
        this.queue = this.queue
          .then(async () => {
            if (!live()) return;
            if (xhr.readyState < 2 || xhr.status === 0) return;
            if (xhr.status < 200 || xhr.status >= 300) {
              if (xhr.readyState === 4) fail(httpError(xhr));
              return;
            }
            const activeSession = await this.options.session.snapshot();
            if (!live()) return;
            if (
              !activeSession ||
              activeSession.generation !== current.generation
            ) {
              this.close();
              this.options.onReset?.();
              return;
            }
            if (
              activeSession.tokens.accessToken !== current.tokens.accessToken
            ) {
              void this.reconnect();
              return;
            }
            const contentType =
              xhr.getResponseHeader("Content-Type")?.toLowerCase() ?? "";
            if (!contentType.startsWith("text/event-stream")) invalidStream();
            this.options.onConnection("connected");
            const chunk = xhr.responseText.slice(consumed);
            consumed = xhr.responseText.length;
            parser.push(chunk);
          })
          .catch(fail);
      };
      xhr.open(
        "GET",
        `${this.options.baseUrl.replace(/\/+$/, "")}/api/passenger-app/rides/${encodeURIComponent(this.options.orderId)}/events`,
        true,
      );
      xhr.setRequestHeader("Accept", "text/event-stream");
      xhr.setRequestHeader(
        "Authorization",
        `Bearer ${current.tokens.accessToken}`,
      );
      xhr.onreadystatechange = xhr.onprogress = drain;
      xhr.onload = () => {
        drain();
        this.queue = this.queue.then(() => {
          if (live()) this.close();
        });
      };
      xhr.onerror = () =>
        fail(
          new PassengerApiError(
            503,
            "unavailable",
            "行程更新已中斷，請重新查詢。",
          ),
        );
      xhr.onabort = () => {
        if (live()) this.close();
      };
      xhr.send();
    } catch (error) {
      if (live()) {
        this.close();
        this.options.onError(error);
      }
    }
  }
}
