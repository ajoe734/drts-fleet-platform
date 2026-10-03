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
import {
  recordingScopesMatch,
  VoiceMediaSessionAuthority,
  VoiceMediaSessionAuthorityError,
} from "./session-authority";
import {
  VoiceCallAuthorityError,
  type VoiceCallAuthorityClaims,
  type VoiceCallAuthorityVerifier,
} from "./call-authority";
import type { VoiceSessionComposer } from "./session-composer";
import type {
  VoiceSessionBinding,
  VoiceSessionBindingResolver,
} from "../dialogue/voice-session-binding";

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
  /** How long a `POST /sessions` grant remains attachable before it must be
   * consumed by the WebSocket upgrade. Defaults to `VOICE_MEDIA_SESSION_GRANT_TTL_MS`
   * or 30s; kept short since the grant is meant to be redeemed immediately
   * by the same orchestrator call that just admitted the session. */
  sessionGrantTtlMs?: number | undefined;
  /** Resolves and validates the caller-presented call-authority token on
   * `POST /sessions` and `POST /recording/finalize`. No production
   * implementation is composed by default (see
   * docs/04-uat/audit-voice-runtime-20261002.md) -- without one, this
   * worker refuses both routes rather than trusting the caller's own
   * declared `sessionId`/`scope`. */
  callAuthorityVerifier?: VoiceCallAuthorityVerifier | undefined;
  /** Wires each attached session's binary/control frames to a real ASR/TTS
   * composition (see `./session-composer`). Without one, the worker still
   * admits sessions and negotiates the WebSocket, but nothing ever
   * transcribes or synthesizes anything for them. */
  sessionComposer?: VoiceSessionComposer | undefined;
  /** Resolves this admitted session's trusted `VoiceSessionBinding`
   * (AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-entry) -- without one,
   * `POST /sessions` admission behaves exactly as before: every attached
   * session stays on the fixture-only persistence path. */
  sessionBindingResolver?: VoiceSessionBindingResolver | undefined;
}

export interface MediaSessionRecord {
  sessionId: string;
  connectedAt: string;
  channel?: WebSocketServerChannel | undefined;
  metadata?: Record<string, unknown> | undefined;
  /** Resolved during `POST /sessions` admission, before the WebSocket
   * upgrade ever reaches `sessionComposer.attach` -- `undefined` whenever
   * no `sessionBindingResolver` is configured, or it rejected for this
   * session id (see that resolver's own doc for why that must never fail
   * admission itself). */
  binding?: VoiceSessionBinding | undefined;
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
  private readonly sessionAuthority: VoiceMediaSessionAuthority;
  private isDraining = false;
  private totalAdmitted = 0;
  private isRunning = false;
  private recordingAdapter?: MediaRecordingAdapter | undefined;
  private readonly callAuthorityVerifier:
    | VoiceCallAuthorityVerifier
    | undefined;
  private readonly sessionComposer: VoiceSessionComposer | undefined;
  private readonly sessionBindingResolver:
    | VoiceSessionBindingResolver
    | undefined;

  constructor(config?: MediaWorkerServerConfig) {
    super();
    this.recordingAdapter = config?.recordingAdapter;
    this.callAuthorityVerifier = config?.callAuthorityVerifier;
    this.sessionComposer = config?.sessionComposer;
    this.sessionBindingResolver = config?.sessionBindingResolver;
    this.sessionComposer?.on("session.event", (event: unknown) => {
      this.emit("session.event", event);
    });
    this.sessionAuthority = new VoiceMediaSessionAuthority(
      config?.sessionGrantTtlMs ??
        Number(process.env.VOICE_MEDIA_SESSION_GRANT_TTL_MS ?? 30_000),
    );
    // A grant that is never consumed before its TTL (expired, never
    // attached, or a failed handshake that never retries) must not hold its
    // reserved slot forever -- free it as soon as the authority gives up on
    // it, so a replacement session can be admitted.
    this.sessionAuthority.on(
      "grant.expired",
      ({ sessionId }: { sessionId: string; epoch: number }) => {
        const session = this.activeSessions.get(sessionId);
        if (session && !session.channel) {
          this.activeSessions.delete(sessionId);
          this.emit("session.closed", {
            sessionId,
            code: 1008,
            reason: "grant_expired",
          });
        }
      },
    );
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

    // Receive final ASR events while the peer channel can still carry them.
    // Provider cleanup has its own bounded EOS window; the subsequent timeout
    // governs how long to wait for peers to finish/acknowledge shutdown.
    await this.sessionComposer?.drain();
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
    this.isDraining = true;
    await this.sessionComposer?.drain();
    for (const session of this.activeSessions.values()) {
      if (session.channel && !session.channel.destroyed) {
        session.channel.close(1000, "Server stopping");
      }
    }
    this.activeSessions.clear();

    // Closing each channel above synchronously starts the composer's
    // `closeAsr()` teardown (bounded by each provider's own drain, e.g.
    // `TwmAsrNetworkAdapter`'s `eosDrainMs`) for every still-attached
    // session. Awaiting it here -- unconditionally, independent of whether
    // the HTTP listener itself was ever started -- is what makes shutdown
    // actually wait for that teardown instead of returning the instant the
    // channel's "close" event was *emitted* (R11): a provider resource can
    // easily outlive "closed the channel" by the whole configured drain
    // window.
    await this.sessionComposer?.awaitPendingCloses();

    if (!this.isRunning) return;

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

  /**
   * AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-entry: the real production
   * attempt to resolve this admitted session's `VoiceSessionBinding` --
   * `sessionComposer.attach()`'s `binding` parameter previously had no
   * caller at all outside tests. Never throws: a rejection (most likely,
   * today, no `sessionBindingResolver` configured at all, or apps/api has
   * no durable `voice.session` row yet for this id -- the real, still-
   * missing SD §4.1 provider webhook is the genuine external gate, not a
   * defect in this method) just means this attachment stays on the
   * existing fixture-only persistence path, exactly as before this
   * resolver existed.
   */
  private async resolveSessionBinding(
    voiceSessionId: string,
  ): Promise<VoiceSessionBinding | undefined> {
    if (!this.sessionBindingResolver) return undefined;
    try {
      return await this.sessionBindingResolver.resolve(voiceSessionId);
    } catch (err) {
      console.warn(
        `[voice-media-worker] Could not resolve a trusted VoiceSessionBinding for session ` +
          `'${voiceSessionId}': ${err instanceof Error ? err.message : String(err)}. ` +
          `Attaching without one (fixture-only persistence).`,
      );
      return undefined;
    }
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
        .then(async (body) => {
          try {
            // Operations-key-only is deliberately insufficient: the shared
            // key only proves "a trusted operator of this worker," never
            // which specific brand/call/recording this request is entitled
            // to. `sessionId`/`scope` are never taken from this body --
            // only from claims resolved through a verified call-authority
            // token, which the caller cannot forge.
            if (!this.callAuthorityVerifier) {
              res.statusCode = 503;
              res.end(
                JSON.stringify({
                  error:
                    "No call-authority verifier is configured on this worker; refusing to admit a session.",
                  code: "VOICE_MEDIA_CALL_AUTHORITY_NOT_CONFIGURED",
                }),
              );
              return;
            }
            const parsed = body ? JSON.parse(body) : {};
            const callAuthorityToken =
              typeof parsed.callAuthorityToken === "string"
                ? parsed.callAuthorityToken
                : undefined;
            if (!callAuthorityToken) {
              res.statusCode = 401;
              res.end(
                JSON.stringify({
                  error: "callAuthorityToken is required.",
                  code: "VOICE_MEDIA_CALL_AUTHORITY_TOKEN_REQUIRED",
                }),
              );
              return;
            }
            let claims: VoiceCallAuthorityClaims;
            try {
              claims = await this.callAuthorityVerifier.verifySessionAuthority(
                callAuthorityToken,
                "admit",
              );
            } catch (err) {
              res.statusCode = 403;
              res.end(
                JSON.stringify({
                  error: err instanceof Error ? err.message : String(err),
                  code:
                    err instanceof VoiceCallAuthorityError
                      ? err.code
                      : "VOICE_MEDIA_CALL_AUTHORITY_DENIED",
                }),
              );
              return;
            }

            const session = this.admitSession(
              claims.sessionId,
              parsed.metadata,
            );
            let grant: { token: string; epoch: number; expiresAt: number };
            try {
              grant = this.sessionAuthority.issueGrant(
                claims.sessionId,
                claims.principalId,
                claims.scope,
                claims.epoch,
              );
            } catch (err) {
              this.activeSessions.delete(claims.sessionId);
              throw err;
            }
            // Computed from `session` before `resolveSessionBinding` below
            // can attach a `binding` to that same record -- this response's
            // wire shape is unrelated to, and must not change because of,
            // this worker's own internal admission bookkeeping.
            const responseBody = JSON.stringify({
              status: "admitted",
              session,
              grant: {
                token: grant.token,
                epoch: grant.epoch,
                expiresAt: grant.expiresAt,
              },
            });
            // Awaited here, before responding, so the WebSocket upgrade
            // this response's caller sends next (which reads
            // `session.binding` synchronously, see `handleUpgrade`) never
            // races an admission that is still resolving it (AUDIT-VOICE-
            // APPLICATION-WIRING-20261003 R4-entry). A rejection (e.g. no
            // `voice.session` row exists yet for this id) never fails
            // admission itself -- see `resolveSessionBinding`'s own doc.
            session.binding = await this.resolveSessionBinding(
              claims.sessionId,
            );
            res.statusCode = 201;
            res.end(responseBody);
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            res.statusCode =
              err instanceof VoiceMediaSessionAuthorityError &&
              err.code === "VOICE_MEDIA_SESSION_EPOCH_STALE"
                ? 409
                : err instanceof VoiceMediaSessionAuthorityError
                  ? 400
                  : errorMsg.includes("DRAINING") ||
                      errorMsg.includes("CAPACITY")
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
            const sessionId =
              typeof parsed.sessionId === "string" ? parsed.sessionId : "";
            if (!sessionId) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: "sessionId is required" }));
              return;
            }
            // Finalization is authorized separately from admission: holding
            // the shared operations key and knowing a previously-admitted
            // sessionId is not enough on its own to seal that session's
            // recording. The caller must present a call-authority token
            // that re-resolves to this exact session id and the epoch
            // currently bound for it -- a token for a superseded/fenced
            // epoch, or for an unrelated session, is rejected here even if
            // it was once valid.
            if (!this.callAuthorityVerifier) {
              res.statusCode = 503;
              res.end(
                JSON.stringify({
                  error:
                    "No call-authority verifier is configured on this worker; refusing to finalize a recording.",
                  code: "VOICE_MEDIA_CALL_AUTHORITY_NOT_CONFIGURED",
                }),
              );
              return;
            }
            const callAuthorityToken =
              typeof parsed.callAuthorityToken === "string"
                ? parsed.callAuthorityToken
                : undefined;
            if (!callAuthorityToken) {
              res.statusCode = 401;
              res.end(
                JSON.stringify({
                  error: "callAuthorityToken is required.",
                  code: "VOICE_MEDIA_CALL_AUTHORITY_TOKEN_REQUIRED",
                }),
              );
              return;
            }
            let claims: VoiceCallAuthorityClaims;
            try {
              claims = await this.callAuthorityVerifier.verifySessionAuthority(
                callAuthorityToken,
                "finalize",
              );
            } catch (err) {
              res.statusCode = 403;
              res.end(
                JSON.stringify({
                  error: err instanceof Error ? err.message : String(err),
                  code:
                    err instanceof VoiceCallAuthorityError
                      ? err.code
                      : "VOICE_MEDIA_CALL_AUTHORITY_DENIED",
                }),
              );
              return;
            }
            if (claims.sessionId !== sessionId) {
              res.statusCode = 403;
              res.end(
                JSON.stringify({
                  error:
                    "Call-authority token does not resolve to this session id.",
                  code: "VOICE_MEDIA_CALL_AUTHORITY_SESSION_MISMATCH",
                }),
              );
              return;
            }

            // The authoritative scope bound at POST /sessions time -- never
            // the caller's own `scope`/`closure`/`credential` claims in this
            // request body. A caller cannot finalize a recording for a
            // session it never legitimately admitted, nor substitute a
            // forged closure for the trusted ledger's answer.
            const scope =
              this.sessionAuthority.getAuthoritativeScope(sessionId);
            const boundEpoch =
              this.sessionAuthority.getAuthoritativeEpoch(sessionId);
            const boundPrincipal =
              this.sessionAuthority.getAuthoritativePrincipal(sessionId);
            if (
              !scope ||
              boundEpoch === undefined ||
              boundEpoch !== claims.epoch ||
              boundPrincipal !== claims.principalId
            ) {
              res.statusCode = 403;
              res.end(
                JSON.stringify({
                  error: "No authorized recording scope for this session id",
                  code: "VOICE_MEDIA_SESSION_SCOPE_UNKNOWN",
                }),
              );
              return;
            }
            // The finalize-specific token's OWN claims.scope must itself
            // authorize sealing this exact resource -- resolving to the
            // right session/epoch/principal is not, by itself, evidence the
            // caller holds finalize authority for the attached recording.
            // A token with no recording scope (not recording-eligible) or a
            // scope for a different brand/call/recording/leg must be
            // denied even though it is a genuine, unexpired, unrevoked
            // token for this exact session and epoch.
            if (!claims.scope || !recordingScopesMatch(claims.scope, scope)) {
              res.statusCode = 403;
              res.end(
                JSON.stringify({
                  error:
                    "Call-authority token does not authorize this recording scope",
                  code: "VOICE_MEDIA_CALL_AUTHORITY_SCOPE_MISMATCH",
                }),
              );
              return;
            }
            const segments = Array.isArray(parsed.segments)
              ? parsed.segments
              : [];
            const result = await this.recordingAdapter.sealFinalRecording({
              scope,
              segments,
            });
            // Completed, not released: an authorized retry (lost response,
            // retried request) for this exact session/epoch must still
            // resolve this scope and reach the adapter's own reentrant
            // sealing, rather than failing closed as if no authority had
            // ever been granted.
            this.sessionAuthority.markCompleted(sessionId, claims.epoch);
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

    const url = new URL(
      req.url ?? "/",
      `http://${req.headers.host ?? "localhost"}`,
    );
    const sessionId = url.searchParams.get("sessionId");
    const grantToken = url.searchParams.get("grant") ?? undefined;

    // Attachment is deliberately NOT self-admitting. Possession of the
    // shared operations key proves the caller operates this worker; it does
    // not prove the specific `sessionId` it is asking to attach was ever
    // legitimately admitted. The session and its single-use grant must have
    // been issued by a prior `POST /sessions` call -- otherwise any holder
    // of the key could attach to an arbitrary, unissued session id.
    if (!sessionId) {
      socket.write(
        "HTTP/1.1 400 Bad Request\r\nContent-Type: text/plain\r\n\r\nsessionId query parameter is required\r\n",
      );
      socket.destroy();
      return;
    }

    const session = this.activeSessions.get(sessionId);
    if (!session) {
      socket.write(
        "HTTP/1.1 403 Forbidden\r\nContent-Type: text/plain\r\n\r\nNo admitted session for this id; call POST /sessions first\r\n",
      );
      socket.destroy();
      return;
    }
    if (session.channel) {
      socket.write(
        "HTTP/1.1 409 Conflict\r\nContent-Type: text/plain\r\n\r\nSession already attached\r\n",
      );
      socket.destroy();
      return;
    }

    // Checked before consuming the single-use grant: a request that will
    // fail the handshake for a reason unrelated to session authority (no
    // `Sec-WebSocket-Key`) must not burn the grant. Without this ordering,
    // a client that retries the same grant after a transport-level mistake
    // would find it already consumed, and -- because the grant's authority
    // record had already moved from "pending" (TTL-reaped on expiry) to
    // "attached" (held until an explicit close/finalize) -- the admitted
    // slot would never be freed at all.
    const secKey = req.headers["sec-websocket-key"] as string | undefined;
    if (!secKey) {
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.destroy();
      return;
    }

    try {
      this.sessionAuthority.consumeGrant(sessionId, grantToken);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      socket.write(
        `HTTP/1.1 403 Forbidden\r\nContent-Type: text/plain\r\n\r\n${message}\r\n`,
      );
      socket.destroy();
      return;
    }

    const channel = completeWebSocketHandshake(secKey, socket, {
      timeoutMs: this.config.wsTimeoutMs,
      maxPayloadBytes: this.config.maxWsFrameBytes,
    });

    if (!channel) return;

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

    // The actual ASR/TTS/dialogue-event composition entry: without this,
    // every inbound audio/control frame only ever reached the generic
    // `session.message` event above, with no composed ASR/TTS session ever
    // consuming it (see docs/04-uat/audit-voice-runtime-20261002.md). The
    // provider factory can still fail closed here (e.g. a strict
    // environment reaching this handshake despite `/ready` already
    // reporting not-ready) -- that must close the channel, never crash the
    // worker or leave the socket silently unattended.
    try {
      this.sessionComposer?.attach(sessionId, channel, session.binding);
    } catch (err) {
      // The channel's own "close" listener (registered above) performs the
      // actual activeSessions/session.closed cleanup once this reaches the
      // underlying socket's close event -- this must not duplicate it.
      channel.sendText(
        JSON.stringify({
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        }),
      );
      channel.close(1011, "No ASR/TTS provider is available for this session");
      return;
    }

    this.emit("session.connected", session);
  }
}
