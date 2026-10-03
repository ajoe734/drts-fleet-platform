import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { Duplex } from "node:stream";
import { EventEmitter } from "node:events";
import {
  completeWebSocketHandshake,
  DEFAULT_WS_MAX_PAYLOAD_BYTES,
  WebSocketServerChannel,
} from "./websocket-channel";
import type { MediaRecordingAdapter } from "../recording/media-recording-adapter";
import { isStrictVoiceMediaEnvironment } from "./environment";
import { VoiceMediaAuthError, verifyVoiceMediaCaller } from "./internal-auth";

/** Default cap on a single HTTP control-plane request body (`/sessions`,
 * `/recording/finalize`). These carry JSON metadata, never raw audio, so this
 * is generous headroom against a peer streaming an unbounded body rather than
 * a realistic payload size. */
export const DEFAULT_HTTP_MAX_BODY_BYTES = 1_048_576; // 1 MiB

class PayloadTooLargeError extends Error {}

export interface MediaWorkerServerConfig {
  port?: number | undefined;
  host?: string | undefined;
  maxConcurrentSessions?: number | undefined;
  wsTimeoutMs?: number | undefined;
  drainTimeoutMs?: number | undefined;
  serviceVersion?: string | undefined;
  recordingAdapter?: MediaRecordingAdapter | undefined;
  /** Shared secret callers must present via the `x-drts-internal-key` header
   * to reach `/drain`, `/sessions`, `/recording/finalize`, or open a
   * WebSocket session. Defaults to `VOICE_MEDIA_INTERNAL_KEY`. */
  internalKey?: string | undefined;
  /** Accepted alongside `internalKey` during a key rotation window.
   * Defaults to `VOICE_MEDIA_INTERNAL_KEY_PREVIOUS`. */
  internalKeyPrevious?: string | undefined;
  maxHttpBodyBytes?: number | undefined;
  maxWsFrameBytes?: number | undefined;
  /** Whether this worker's composed CTI/ASR/TTS/recording providers are
   * actually production-capable (see each provider's `isProductionCapable`).
   * Defaults to `false`: today no provider in this worker is wired to a real
   * vendor, so `/ready` must not claim otherwise in a strict environment. */
  voiceRuntimeProductionCapable?: boolean | undefined;
  voiceRuntimeNotCapableReason?: string | undefined;
}

export interface MediaSessionRecord {
  sessionId: string;
  connectedAt: string;
  channel?: WebSocketServerChannel | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export class MediaWorkerServer extends EventEmitter {
  private readonly config: {
    port: number;
    host: string;
    maxConcurrentSessions: number;
    wsTimeoutMs: number;
    drainTimeoutMs: number;
    serviceVersion: string;
    internalKey: string | undefined;
    internalKeyPrevious: string | undefined;
    maxHttpBodyBytes: number;
    maxWsFrameBytes: number;
    voiceRuntimeProductionCapable: boolean;
    voiceRuntimeNotCapableReason: string;
  };
  private readonly server: Server;
  private readonly activeSessions = new Map<string, MediaSessionRecord>();
  private isDraining = false;
  private totalAdmitted = 0;
  private isRunning = false;
  private recordingAdapter?: MediaRecordingAdapter | undefined;

  constructor(config?: MediaWorkerServerConfig) {
    super();
    this.recordingAdapter = config?.recordingAdapter;
    this.config = {
      port:
        config?.port ??
        Number(process.env.VOICE_MEDIA_PORT ?? process.env.PORT ?? 3002),
      host: config?.host ?? "0.0.0.0",
      maxConcurrentSessions:
        config?.maxConcurrentSessions ??
        Number(process.env.VOICE_MEDIA_MAX_CONCURRENT_SESSIONS ?? 100),
      wsTimeoutMs:
        config?.wsTimeoutMs ??
        Number(
          process.env.VOICE_MEDIA_WS_TIMEOUT_SECONDS
            ? Number(process.env.VOICE_MEDIA_WS_TIMEOUT_SECONDS) * 1000
            : 300_000,
        ),
      drainTimeoutMs:
        config?.drainTimeoutMs ??
        Number(
          process.env.VOICE_MEDIA_DRAIN_TIMEOUT_SECONDS
            ? Number(process.env.VOICE_MEDIA_DRAIN_TIMEOUT_SECONDS) * 1000
            : 15_000,
        ),
      serviceVersion: config?.serviceVersion ?? "0.1.0",
      internalKey: config?.internalKey ?? process.env.VOICE_MEDIA_INTERNAL_KEY,
      internalKeyPrevious:
        config?.internalKeyPrevious ??
        process.env.VOICE_MEDIA_INTERNAL_KEY_PREVIOUS,
      maxHttpBodyBytes:
        config?.maxHttpBodyBytes ??
        Number(
          process.env.VOICE_MEDIA_HTTP_MAX_BODY_BYTES ??
            DEFAULT_HTTP_MAX_BODY_BYTES,
        ),
      maxWsFrameBytes:
        config?.maxWsFrameBytes ??
        Number(
          process.env.VOICE_MEDIA_WS_MAX_FRAME_BYTES ??
            DEFAULT_WS_MAX_PAYLOAD_BYTES,
        ),
      voiceRuntimeProductionCapable:
        config?.voiceRuntimeProductionCapable ?? false,
      voiceRuntimeNotCapableReason:
        config?.voiceRuntimeNotCapableReason ??
        "No production-capable CTI/ASR/TTS/recording provider is wired into this worker (see docs/04-uat/audit-voice-runtime-20261002.md).",
    };

    this.server = createServer((req, res) => this.handleHttpRequest(req, res));
    this.server.on("upgrade", (req: IncomingMessage, socket: Duplex) =>
      this.handleUpgrade(req, socket),
    );
  }

  get port(): number {
    return this.config.port;
  }

  get draining(): boolean {
    return this.isDraining;
  }

  get running(): boolean {
    return this.isRunning;
  }

  get sessionCount(): number {
    return this.activeSessions.size;
  }

  get admittedCount(): number {
    return this.totalAdmitted;
  }

  get httpServer(): Server {
    return this.server;
  }

  async start(): Promise<number> {
    if (this.isRunning) return this.config.port;

    return new Promise<number>((resolve, reject) => {
      this.server.on("error", reject);
      this.server.listen(this.config.port, this.config.host, () => {
        this.isRunning = true;
        this.server.removeListener("error", reject);
        const addr = this.server.address();
        const resolvedPort =
          typeof addr === "object" && addr ? addr.port : this.config.port;
        this.config.port = resolvedPort;
        this.emit("ready", { port: resolvedPort });
        resolve(resolvedPort);
      });
    });
  }

  /**
   * Gracefully drains the server:
   * 1. Marks server as draining (/ready immediately returns 503 to signal LB).
   * 2. Rejects new session admissions.
   * 3. Notifies existing sessions and allows in-flight audio/processing to complete.
   * 4. Closes server after all sessions finish or drain timeout expires.
   */
  async drain(
    customTimeoutMs?: number,
  ): Promise<{ drainedSessions: number; timedOut: boolean }> {
    if (this.isDraining && !this.isRunning) {
      return { drainedSessions: 0, timedOut: false };
    }

    this.isDraining = true;
    this.emit("draining");

    const timeout = customTimeoutMs ?? this.config.drainTimeoutMs;
    const initialSessionCount = this.activeSessions.size;

    // Send drain/closing notice to active WebSocket channels
    for (const session of this.activeSessions.values()) {
      if (session.channel && !session.channel.destroyed) {
        session.channel.sendText(
          JSON.stringify({
            type: "server.draining",
            reason: "worker_shutdown",
          }),
        );
      }
    }

    let timedOut = false;
    if (this.activeSessions.size > 0) {
      timedOut = await new Promise<boolean>((resolve) => {
        const checkInterval = setInterval(() => {
          if (this.activeSessions.size === 0) {
            clearInterval(checkInterval);
            clearTimeout(drainTimer);
            resolve(false);
          }
        }, 50);

        const drainTimer = setTimeout(() => {
          clearInterval(checkInterval);
          // Force close any remaining sessions
          for (const session of this.activeSessions.values()) {
            if (session.channel) {
              session.channel.close(1001, "Server drain timeout reached");
            }
          }
          this.activeSessions.clear();
          resolve(true);
        }, timeout);
      });
    }

    await this.stop();
    return { drainedSessions: initialSessionCount, timedOut };
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    for (const session of this.activeSessions.values()) {
      if (session.channel && !session.channel.destroyed) {
        session.channel.close(1000, "Server stopping");
      }
    }
    this.activeSessions.clear();

    return new Promise<void>((resolve, reject) => {
      this.server.close((err) => {
        this.isRunning = false;
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Programmatic admission for a media session (used by HTTP or internal coordinator).
   */
  admitSession(
    sessionId: string,
    metadata?: Record<string, unknown> | undefined,
  ): MediaSessionRecord {
    if (this.isDraining) {
      throw new Error(
        "MEDIA_WORKER_DRAINING: Server is draining; cannot admit new sessions",
      );
    }
    if (this.activeSessions.has(sessionId)) {
      // Without this guard, a second caller presenting the same sessionId
      // (via `/sessions` or the WS upgrade) would silently overwrite the
      // active session record -- orphaning the first caller's channel (it
      // would no longer be reachable from `closeSession`/`drain`) and letting
      // one caller take over bookkeeping for a session it never admitted.
      throw new Error(
        "MEDIA_WORKER_SESSION_ID_CONFLICT: Session id is already active",
      );
    }
    if (this.activeSessions.size >= this.config.maxConcurrentSessions) {
      throw new Error(
        "MEDIA_WORKER_CAPACITY_EXCEEDED: Maximum concurrent sessions reached",
      );
    }

    const session: MediaSessionRecord = {
      sessionId,
      connectedAt: new Date().toISOString(),
      ...(metadata !== undefined ? { metadata } : {}),
    };
    this.activeSessions.set(sessionId, session);
    this.totalAdmitted++;
    this.emit("session.admitted", session);
    return session;
  }

  closeSession(
    sessionId: string,
    code = 1000,
    reason = "Normal closure",
  ): boolean {
    const session = this.activeSessions.get(sessionId);
    if (!session) return false;

    if (session.channel && !session.channel.destroyed) {
      session.channel.close(code, reason);
    }
    this.activeSessions.delete(sessionId);
    this.emit("session.closed", { sessionId, code, reason });
    return true;
  }

  getRecordingAdapter(): MediaRecordingAdapter | undefined {
    return this.recordingAdapter;
  }

  setRecordingAdapter(adapter: MediaRecordingAdapter): void {
    this.recordingAdapter = adapter;
  }

  /** Throws `VoiceMediaAuthError` when the caller may not reach an
   * operational route (`/drain`, `/sessions`, `/recording/finalize`) or open
   * a WebSocket session. See `./internal-auth` for the fail-closed rules. */
  private authenticateCaller(
    headers: Readonly<Record<string, string | string[] | undefined>>,
  ): void {
    verifyVoiceMediaCaller(headers, {
      configuredKey: this.config.internalKey,
      previousKey: this.config.internalKeyPrevious,
    });
  }

  private respondAuthError(res: ServerResponse, err: unknown): void {
    if (err instanceof VoiceMediaAuthError) {
      res.statusCode = err.statusCode;
      res.end(JSON.stringify({ error: err.message, code: err.code }));
      return;
    }
    res.statusCode = 500;
    res.end(
      JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }

  /** Accumulates the request body, rejecting with `PayloadTooLargeError`
   * (and destroying the socket) the moment it exceeds `maxBytes`, instead of
   * buffering an unbounded body from a peer that never stops sending data. */
  private readBoundedBody(
    req: IncomingMessage,
    maxBytes: number,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = "";
      let settled = false;
      req.on("data", (chunk: Buffer | string) => {
        if (settled) return;
        body += chunk;
        if (Buffer.byteLength(body) > maxBytes) {
          settled = true;
          body = "";
          // Drain (and discard) whatever the caller still sends instead of
          // destroying the socket outright, so the 413 response this
          // rejection triggers actually reaches the caller instead of
          // racing a connection reset.
          req.resume();
          reject(
            new PayloadTooLargeError(
              "Request body exceeds maximum allowed size",
            ),
          );
        }
      });
      req.on("end", () => {
        if (!settled) {
          settled = true;
          resolve(body);
        }
      });
      req.on("error", (err) => {
        if (!settled) {
          settled = true;
          reject(err);
        }
      });
    });
  }

  private handleHttpRequest(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(
      req.url ?? "/",
      `http://${req.headers.host ?? "localhost"}`,
    );
    const pathname = url.pathname;

    res.setHeader("Content-Type", "application/json");

    if (
      req.method === "GET" &&
      (pathname === "/health" || pathname === "/healthz")
    ) {
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          status: "ok",
          service: "voice-media-worker",
          version: this.config.serviceVersion,
          uptimeSeconds: Math.floor(process.uptime()),
        }),
      );
      return;
    }

    if (
      req.method === "GET" &&
      (pathname === "/ready" || pathname === "/readyz")
    ) {
      if (
        isStrictVoiceMediaEnvironment() &&
        !this.config.voiceRuntimeProductionCapable
      ) {
        // A strict (staging/production) deployment must never report ready
        // while every CTI/ASR/TTS/recording provider composed into this
        // worker is a non-production-capable fixture -- that is exactly the
        // "looks deployed and healthy but cannot serve a real call" gap the
        // 2026-10-02 audit (F06) flagged.
        res.statusCode = 503;
        res.end(
          JSON.stringify({
            ready: false,
            reason: "voice_runtime_not_production_capable",
            detail: this.config.voiceRuntimeNotCapableReason,
          }),
        );
        return;
      }
      if (this.isDraining) {
        res.statusCode = 503;
        res.end(
          JSON.stringify({
            ready: false,
            reason: "draining",
            activeSessions: this.activeSessions.size,
          }),
        );
        return;
      }
      if (this.activeSessions.size >= this.config.maxConcurrentSessions) {
        res.statusCode = 503;
        res.end(
          JSON.stringify({
            ready: false,
            reason: "capacity_exceeded",
            activeSessions: this.activeSessions.size,
            maxConcurrentSessions: this.config.maxConcurrentSessions,
          }),
        );
        return;
      }

      res.statusCode = 200;
      res.end(
        JSON.stringify({
          ready: true,
          activeSessions: this.activeSessions.size,
          maxConcurrentSessions: this.config.maxConcurrentSessions,
        }),
      );
      return;
    }

    if (
      req.method === "GET" &&
      (pathname === "/status" || pathname === "/metrics")
    ) {
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          service: "voice-media-worker",
          version: this.config.serviceVersion,
          running: this.isRunning,
          draining: this.isDraining,
          activeSessions: this.activeSessions.size,
          totalAdmitted: this.totalAdmitted,
          maxConcurrentSessions: this.config.maxConcurrentSessions,
          wsTimeoutMs: this.config.wsTimeoutMs,
          drainTimeoutMs: this.config.drainTimeoutMs,
          uptimeSeconds: Math.floor(process.uptime()),
        }),
      );
      return;
    }

    if (req.method === "POST" && pathname === "/drain") {
      try {
        this.authenticateCaller(req.headers);
      } catch (err) {
        this.respondAuthError(res, err);
        return;
      }
      res.statusCode = 202;
      res.end(JSON.stringify({ status: "drain_initiated" }));
      void this.drain();
      return;
    }

    if (req.method === "POST" && pathname === "/sessions") {
      try {
        this.authenticateCaller(req.headers);
      } catch (err) {
        this.respondAuthError(res, err);
        return;
      }
      this.readBoundedBody(req, this.config.maxHttpBodyBytes)
        .then((body) => {
          try {
            const parsed = body ? JSON.parse(body) : {};
            const sessionId =
              parsed.sessionId ??
              `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const session = this.admitSession(sessionId, parsed.metadata);
            res.statusCode = 201;
            res.end(JSON.stringify({ status: "admitted", session }));
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            res.statusCode =
              errorMsg.includes("DRAINING") || errorMsg.includes("CAPACITY")
                ? 503
                : errorMsg.includes("CONFLICT")
                  ? 409
                  : 400;
            res.end(JSON.stringify({ error: errorMsg }));
          }
        })
        .catch((err) => {
          if (err instanceof PayloadTooLargeError) {
            res.statusCode = 413;
            res.end(JSON.stringify({ error: err.message }));
            return;
          }
          res.statusCode = 400;
          res.end(
            JSON.stringify({
              error: err instanceof Error ? err.message : String(err),
            }),
          );
        });
      return;
    }

    if (req.method === "POST" && pathname === "/recording/finalize") {
      try {
        this.authenticateCaller(req.headers);
      } catch (err) {
        this.respondAuthError(res, err);
        return;
      }
      if (this.isDraining) {
        res.statusCode = 503;
        res.end(JSON.stringify({ error: "Server is draining" }));
        return;
      }
      this.readBoundedBody(req, this.config.maxHttpBodyBytes)
        .then(async (body) => {
          try {
            if (!this.recordingAdapter) {
              res.statusCode = 503;
              res.end(
                JSON.stringify({
                  error:
                    "MediaRecordingAdapter is not configured on media worker server",
                }),
              );
              return;
            }
            const parsed = body ? JSON.parse(body) : {};
            const result = await this.recordingAdapter.sealFinalRecording({
              credential: parsed.credential ?? "media-internal",
              scope: parsed.scope,
              segments: parsed.segments ?? [],
              closureLedger: parsed.closureLedger ?? {
                resolve: async () => parsed.closure ?? null,
              },
            });
            res.statusCode = 200;
            res.end(JSON.stringify({ status: "sealed", ...result }));
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            res.statusCode = 400;
            res.end(JSON.stringify({ error: errorMsg }));
          }
        })
        .catch((err) => {
          if (err instanceof PayloadTooLargeError) {
            res.statusCode = 413;
            res.end(JSON.stringify({ error: err.message }));
            return;
          }
          res.statusCode = 400;
          res.end(
            JSON.stringify({
              error: err instanceof Error ? err.message : String(err),
            }),
          );
        });
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: "Not Found", path: pathname }));
  }

  private handleUpgrade(req: IncomingMessage, socket: Duplex): void {
    try {
      this.authenticateCaller(req.headers);
    } catch (err) {
      const statusCode =
        err instanceof VoiceMediaAuthError ? err.statusCode : 500;
      const statusText =
        statusCode === 401
          ? "Unauthorized"
          : statusCode === 503
            ? "Service Unavailable"
            : "Internal Server Error";
      const message = err instanceof Error ? err.message : String(err);
      socket.write(
        `HTTP/1.1 ${statusCode} ${statusText}\r\nContent-Type: text/plain\r\n\r\n${message}\r\n`,
      );
      socket.destroy();
      return;
    }

    if (this.isDraining) {
      socket.write(
        "HTTP/1.1 503 Service Unavailable\r\nContent-Type: text/plain\r\n\r\nServer is draining\r\n",
      );
      socket.destroy();
      return;
    }

    if (this.activeSessions.size >= this.config.maxConcurrentSessions) {
      socket.write(
        "HTTP/1.1 503 Service Unavailable\r\nContent-Type: text/plain\r\n\r\nCapacity exceeded\r\n",
      );
      socket.destroy();
      return;
    }

    const url = new URL(
      req.url ?? "/",
      `http://${req.headers.host ?? "localhost"}`,
    );
    const sessionId =
      url.searchParams.get("sessionId") ??
      `ws-session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const secKey = req.headers["sec-websocket-key"] as string | undefined;
    const channel = completeWebSocketHandshake(secKey, socket, {
      timeoutMs: this.config.wsTimeoutMs,
      maxPayloadBytes: this.config.maxWsFrameBytes,
    });

    if (!channel) return;

    let session: MediaSessionRecord;
    try {
      session = this.admitSession(sessionId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      channel.close(
        1013,
        message.includes("CONFLICT")
          ? "Session id already active"
          : "Capacity exceeded or draining",
      );
      return;
    }

    session.channel = channel;

    channel.on("message", (data: string | Buffer, isBinary: boolean) => {
      this.emit("session.message", { sessionId, data, isBinary });
    });

    channel.on("close", (code: number, reason: string) => {
      this.activeSessions.delete(sessionId);
      this.emit("session.closed", { sessionId, code, reason });
    });

    channel.on("error", (err: Error) => {
      this.emit("session.error", { sessionId, error: err });
    });

    this.emit("session.connected", session);
  }
}
