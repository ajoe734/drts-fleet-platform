import { NativePassengerSseParser } from "../../../packages/passenger-client/src/native/ride-stream";
import type { NativePassengerStreamRequest } from "../../../packages/passenger-client/src/native/ride-stream";

/** Hosted-only transport adapters. All bytes come from actual mounted HTTP;
 * these supply browser EventSource/RN XHR ports without mocking ride logic. */
export class HostedEventSource {
  static origin: () => string;
  static authorization: string;
  static instances: HostedEventSource[] = [];
  readonly frames: string[] = [];
  readonly errors: unknown[] = [];
  private controller?: AbortController;
  private listeners = new Map<string, (event: { data: string }) => void>();
  onopen?: () => void;
  onerror?: (error: unknown) => void;
  constructor(readonly url: string) {
    HostedEventSource.instances.push(this);
    this.reopen();
  }
  addEventListener(name: string, listener: (event: { data: string }) => void) {
    this.listeners.set(name, listener);
  }
  close() {
    this.controller?.abort();
  }
  reopen() {
    this.close();
    const controller = new AbortController();
    this.controller = controller;
    void (async () => {
      try {
        const response = await fetch(
          `${HostedEventSource.origin()}${this.url}`,
          {
            headers: { Authorization: HostedEventSource.authorization },
            signal: controller.signal,
          },
        );
        if (
          !response.ok ||
          !response.headers.get("content-type")?.startsWith("text/event-stream")
        )
          throw new Error(`SSE HTTP ${response.status}`);
        if (controller.signal.aborted) return;
        this.onopen?.();
        const parser = new NativePassengerSseParser((frame) =>
          this.listeners.get(frame.event)?.({ data: frame.data }),
        );
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        while (!controller.signal.aborted) {
          const chunk = await reader.read();
          if (chunk.done) break;
          const text = decoder.decode(chunk.value, { stream: true });
          this.frames.push(text);
          parser.push(text);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          this.errors.push(error);
          this.onerror?.(error);
        }
      }
    })();
  }
}

export class HostedNativeRequest implements NativePassengerStreamRequest {
  readyState = 0;
  status = 0;
  responseText = "";
  onreadystatechange: (() => void) | null = null;
  onprogress: (() => void) | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  private url = "";
  private headers: Record<string, string> = {};
  private contentType: string | null = null;
  private controller = new AbortController();
  constructor(private readonly route: (url: string) => string) {}
  open(_method: string, url: string) {
    this.url = url;
    this.readyState = 1;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  getResponseHeader(name: string) {
    return name.toLowerCase() === "content-type" ? this.contentType : null;
  }
  abort() {
    this.controller.abort();
    this.onabort?.();
  }
  send() {
    void (async () => {
      try {
        const response = await fetch(this.route(this.url), {
          headers: this.headers,
          signal: this.controller.signal,
        });
        this.status = response.status;
        this.contentType = response.headers.get("content-type");
        this.readyState = 2;
        this.onreadystatechange?.();
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        while (!this.controller.signal.aborted) {
          const chunk = await reader.read();
          if (chunk.done) break;
          this.responseText += decoder.decode(chunk.value, { stream: true });
          this.readyState = 3;
          this.onprogress?.();
        }
        if (!this.controller.signal.aborted) {
          this.readyState = 4;
          this.onload?.();
        }
      } catch {
        if (!this.controller.signal.aborted) this.onerror?.();
      }
    })();
  }
}

export async function waitFor(check: () => boolean, label: string) {
  const deadline = Date.now() + 12000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`Timed out: ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
}
