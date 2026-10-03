import type {
  VoiceAsrSegmentResult,
  VoiceAsrTranscribeRequest,
  VoiceSpeechToTextAdapter,
  VoiceTextToSpeechAdapter,
  VoiceTtsPlaybackHandle,
  VoiceTtsSynthesizeRequest,
} from "../../media-provider";
import {
  TWM_PROTOCOL_FIXTURE,
  type TwmAsrRouteProfile,
  type TwmTtsVoiceProfile,
} from "./twm-adapter";

/**
 * Real TWM network clients implementing the documented wire protocol
 * (SD §11, `TWM_PROTOCOL_FIXTURE`). Distinct from `TwmAsrFixtureAdapter` /
 * `TwmTtsFixtureAdapter` in `./twm-adapter`, which never perform I/O.
 *
 * This closes the "no real client exists" gap the 2026-10-02 audit (F06)
 * found -- see `docs/04-uat/audit-voice-runtime-20261002.md` §1/§3: TWM is
 * this design's documented *reference route* (SD §3.5/§11), not yet an
 * awarded vendor (SD §92, SA §312). "Inability to call the real service from
 * this VM" and "inability to implement/unit-verify the client" are two
 * different things -- the HTTP/WebSocket transport is injected so this class
 * and its request/response composition are unit-testable against a mocked
 * boundary, without ever reaching a live network. `isProductionCapable`
 * still defaults to `false` and must stay `false` until a verified TWM
 * account and real base URL exist (UV-EXEC-027/028) -- a working client
 * class is necessary but not sufficient for that attestation.
 */

export interface TwmHttpResponse {
  readonly status: number;
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type TwmHttpTransport = (
  method: "GET" | "POST",
  path: string,
  init?: {
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<TwmHttpResponse>;

export interface TwmWebSocketEvent {
  readonly data?: unknown;
}

/** Minimal surface this client needs from a WebSocket -- satisfied by the
 * platform `WebSocket` global or a test double, never constructed here. */
export interface TwmWebSocketLike {
  send(data: Uint8Array | string): void;
  close(code?: number, reason?: string): void;
  addEventListener(
    type: "open" | "message" | "close" | "error",
    listener: (event: TwmWebSocketEvent) => void,
  ): void;
}

export type TwmWebSocketFactory = (url: string) => TwmWebSocketLike;

export class TwmNetworkError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "TwmNetworkError";
  }
}

export interface TwmNetworkCredentials {
  accountId: string;
  accountSecret: string;
}

async function postJson(
  transport: TwmHttpTransport,
  path: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
  signal?: AbortSignal,
): Promise<{ status: number; body: Record<string, unknown> | undefined }> {
  const res = await transport("POST", path, {
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  });
  const parsed =
    res.status === 204
      ? undefined
      : ((await res.json().catch(() => undefined)) as
          | Record<string, unknown>
          | undefined);
  return { status: res.status, body: parsed };
}

async function getJson(
  transport: TwmHttpTransport,
  path: string,
  headers: Record<string, string> = {},
  signal?: AbortSignal,
): Promise<{ status: number; body: Record<string, unknown> | undefined }> {
  const res = await transport("GET", path, {
    headers,
    ...(signal ? { signal } : {}),
  });
  const parsed =
    res.status === 204
      ? undefined
      : ((await res.json().catch(() => undefined)) as
          | Record<string, unknown>
          | undefined);
  return { status: res.status, body: parsed };
}

// ---------------------------------------------------------------------------
// TTS: login + synthesize are both simple request/response HTTP calls.
// ---------------------------------------------------------------------------

export class TwmTtsNetworkAdapter implements VoiceTextToSpeechAdapter {
  readonly providerName = "twm";
  readonly isProductionCapable: boolean;
  private token: string | undefined;

  constructor(
    private readonly transport: TwmHttpTransport,
    private readonly credentials: TwmNetworkCredentials,
    readonly voices: readonly TwmTtsVoiceProfile[],
    isProductionCapable = false,
  ) {
    this.isProductionCapable = isProductionCapable;
  }

  async login(): Promise<string> {
    const { status, body } = await postJson(
      this.transport,
      TWM_PROTOCOL_FIXTURE.ttsLogin.path,
      {
        accountId: this.credentials.accountId,
        accountSecret: this.credentials.accountSecret,
      },
    );
    const token = body?.token;
    if (status !== 200 || typeof token !== "string" || !token) {
      throw new TwmNetworkError(
        "TWM_TTS_LOGIN_FAILED",
        `TWM TTS login failed with status ${status}.`,
      );
    }
    this.token = token;
    return token;
  }

  /** Pure request composition -- reused by `synthesize`, independently
   * testable without any transport at all. */
  buildSynthesisRequest(request: VoiceTtsSynthesizeRequest): {
    input: { text: string; textType: string };
    voice: { model: string; languageCode: string; name: string };
    audioConfig: { speakingRate: number };
    outputConfig: { streamMode: number };
  } {
    const voice = this.voices.find(
      (candidate) =>
        candidate.languageCode === request.languageCode &&
        candidate.capabilityVerified,
    );
    if (
      !voice ||
      !voice.model ||
      !voice.name ||
      !voice.textType ||
      (voice.languageCode === "hak-TW" && !voice.accent)
    ) {
      throw new TwmNetworkError(
        "TWM_TTS_VOICE_NOT_VERIFIED",
        `No verified TWM TTS voice is enabled for '${request.languageCode}'.`,
      );
    }
    return {
      input: { text: request.text, textType: voice.textType },
      voice: {
        model: voice.model,
        languageCode: voice.languageCode,
        name: voice.name,
      },
      audioConfig: { speakingRate: 1.0 },
      outputConfig: { streamMode: 1 },
    };
  }

  async synthesize(
    request: VoiceTtsSynthesizeRequest,
  ): Promise<VoiceTtsPlaybackHandle> {
    const payload = this.buildSynthesisRequest(request);
    let token = this.token ?? (await this.login());
    let res = await this.transport(
      "POST",
      TWM_PROTOCOL_FIXTURE.ttsSynthesize.path,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      },
    );
    if (res.status === 401) {
      // Bearer session expired/rejected -- one re-login-and-retry, matching
      // how a real TWM TTS session is expected to be refreshed.
      token = await this.login();
      res = await this.transport(
        "POST",
        TWM_PROTOCOL_FIXTURE.ttsSynthesize.path,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        },
      );
    }
    if (res.status !== 200) {
      throw new TwmNetworkError(
        "TWM_TTS_SYNTHESIZE_FAILED",
        `TWM TTS synthesize failed with status ${res.status}.`,
      );
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength === 0) {
      throw new TwmNetworkError(
        "TWM_TTS_EMPTY_AUDIO",
        "TWM TTS synthesize returned no audio bytes.",
      );
    }
    return {
      playbackId: `twm-live-playback-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      generation: request.generation,
      audioChunks: [bytes],
    };
  }
}

// ---------------------------------------------------------------------------
// ASR: login + access-info over HTTP, then a WebSocket streaming session.
// Preserves the fixture's documented invariants (single-use ticket, 180
// send-ready gate, EOS framing, per-segment monotonic revision) against a
// real, injected transport instead of an in-memory fixture list. Does not
// yet port the fixture's reconnect()/diagnostic-replay handling -- see
// docs/04-uat/audit-voice-runtime-20261002.md §3 for that explicitly
// tracked remainder.
// ---------------------------------------------------------------------------

interface PendingResultWaiter {
  resolve: (result: VoiceAsrSegmentResult) => void;
  reject: (err: Error) => void;
}

/** Bounded backpressure for audio queued while the provider has not yet
 * sent its `180` send-ready status (R12). A caller that keeps streaming
 * well past this many unacknowledged chunks is not going to be rescued by
 * queuing further; failing closed beats growing without bound. */
const MAX_QUEUED_AUDIO_CHUNKS = 64;

export class TwmAsrNetworkAdapter implements VoiceSpeechToTextAdapter {
  readonly providerName = "twm";
  readonly isProductionCapable: boolean;

  private socket: TwmWebSocketLike | undefined;
  private connectPromise: Promise<void> | undefined;
  private closePromise: Promise<void> | undefined;
  private readonly setupController = new AbortController();
  private pendingIngress = 0;
  /** `true` only once the provider's WebSocket `open` event has actually
   * fired -- distinct from `this.socket` being assigned, which happens
   * synchronously well before the handshake completes (R12: `connect()`
   * must not report "connected" while the socket is still CONNECTING). */
  private socketOpen = false;
  private hasAccess = false;
  private ready = false;
  private eosSent = false;
  /** `true` once this adapter has been told to shut down (R11). Terminal:
   * no further login/access-info/socket/open continuation may act on this
   * session once set, and no new resource may be acquired. */
  private terminated = false;
  private readonly usedTickets = new Set<string>();
  private readonly lastRevisionBySegment = new Map<string, number>();
  private readonly finalizedSegments = new Set<string>();
  /** Segment keys that have received a non-final revision but not yet a
   * final one (R11). Distinct from `this.waiters.length`: a per-audio-
   * chunk result waiter is satisfied by the *next* accepted revision,
   * partial or final, so a partial can empty `waiters` while the
   * recognition stream for that segment is still open. Draining on
   * `waiters.length === 0` alone treated a partial as proof the stream was
   * done and closed the socket before the real final ever arrived. */
  private readonly pendingFinalSegments = new Set<string>();
  private readonly bufferedResults: VoiceAsrSegmentResult[] = [];
  private readonly waiters: PendingResultWaiter[] = [];
  private readonly resultListeners: Array<
    (result: VoiceAsrSegmentResult) => void
  > = [];
  /** Audio queued while connected but not yet `180`-ready (R12). Flushed in
   * arrival order the instant readiness is granted, so a caller is never
   * told its chunk was rejected just because it raced the provider's own
   * asynchronous login/open/180 sequence. */
  private readonly audioQueue: Uint8Array[] = [];
  /** Resolves the in-flight `terminate()`'s bounded EOS-drain wait early
   * once every outstanding result waiter has settled, instead of always
   * burning the full configured window. */
  private drainSignal: (() => void) | undefined;
  /** Bounds the whole login/access-info/handshake/open-to-`180` setup
   * window (R12): armed the instant `connect()` is first invoked, cleared
   * once `180` readiness is actually reached. A provider that never opens,
   * never completes the handshake, or opens but never sends `180` left
   * every chunk queued forever and the socket open indefinitely -- nothing
   * in this adapter previously read any of `profile.timeouts` other than
   * `eosDrainMs`. Reuses the documented `noSpeechTimeoutMs` timer for this:
   * a session that never reaches send-ready can, by construction, never
   * have recognized any speech either. */
  private setupDeadlineTimer: NodeJS.Timeout | undefined;
  /** Lets `terminate()`/the setup deadline immediately reject an in-flight
   * `connect()` that is still awaiting login/access-info/the WebSocket
   * handshake (R11 scenario (c), R12) -- the real upstream HTTP/WS promise
   * it is chained from has no cancellation of its own and may not settle
   * for a long time, if ever; this gives every caller awaiting `connect()`
   * a bounded result instead of leaving them pending until that unrelated
   * call eventually resolves. */
  private setupAbort: ((err: Error) => void) | undefined;
  /** Identifies the current connect attempt (R12). `failSetup()` abandons
   * the in-flight attempt without setting the permanent `terminated` flag
   * (a setup timeout is recoverable; a later `transcribe()` may start a
   * fresh attempt) -- but the real upstream login/access-info call that
   * attempt was chained from is never actually cancelled and may still
   * resolve afterward. Without a per-attempt marker, that late resolution
   * would sail past every `assertNotTerminated()` check (`terminated` is
   * still `false`) and go on to acquire access-info and a brand-new
   * provider socket for an attempt nothing is waiting on anymore --
   * exactly as happens, independently, if the caller `close()`s and later
   * starts a fresh `connect()` while the old attempt's HTTP call is still
   * pending. Bumped on every fresh attempt and on `failSetup()`. */
  private connectGeneration = 0;

  constructor(
    private readonly transport: TwmHttpTransport,
    private readonly wsFactory: TwmWebSocketFactory,
    private readonly credentials: TwmNetworkCredentials,
    readonly profile: TwmAsrRouteProfile,
    isProductionCapable = false,
  ) {
    if (
      !profile.modelName.trim() ||
      ![8_000, 16_000].includes(profile.sampleRateHz) ||
      !["pcm_s16le", "g711_ulaw"].includes(profile.audioType)
    ) {
      throw new TwmNetworkError(
        "TWM_ASR_INVALID_PROFILE",
        "Invalid TWM ASR route profile.",
      );
    }
    this.isProductionCapable = isProductionCapable;
  }

  async login(): Promise<string> {
    const { status, body } = await postJson(
      this.transport,
      TWM_PROTOCOL_FIXTURE.asrLogin.path,
      {
        accountId: this.credentials.accountId,
        accountSecret: this.credentials.accountSecret,
      },
      {},
      this.setupController.signal,
    );
    const token = body?.token;
    if (status !== 200 || typeof token !== "string" || !token) {
      throw new TwmNetworkError(
        "TWM_ASR_LOGIN_FAILED",
        `TWM ASR login failed with status ${status}.`,
      );
    }
    return token;
  }

  async getAccessInfo(
    token: string,
  ): Promise<{ websocketUrl: string; ticket: string; expiresAt: string }> {
    const { status, body } = await getJson(
      this.transport,
      TWM_PROTOCOL_FIXTURE.asrAccess.path,
      { Authorization: `Bearer ${token}` },
      this.setupController.signal,
    );
    const websocketUrl = body?.websocketUrl;
    const ticket = body?.ticket;
    const expiresAt = body?.expiresAt;
    if (
      status !== 200 ||
      typeof websocketUrl !== "string" ||
      typeof ticket !== "string" ||
      typeof expiresAt !== "string"
    ) {
      throw new TwmNetworkError(
        "TWM_ASR_ACCESS_INFO_FAILED",
        `TWM ASR access-info failed with status ${status}.`,
      );
    }
    return { websocketUrl, ticket, expiresAt };
  }

  /** Performs login, access-info, ticket binding and the WebSocket
   * handshake. Idempotent no-op once the socket has actually reached
   * `open` -- NOT merely once `this.socket` is assigned, which happens
   * synchronously well before the handshake completes (R12). Single-flight:
   * concurrent callers (e.g. several inbound audio frames arriving before
   * the first connection attempt resolves) await the same in-flight attempt
   * instead of each independently racing login/access-info and overwriting
   * `this.socket` with a second connection and a second consumed ticket.
   * Rejects immediately once this session has been terminated (R11), and
   * fences every awaited step so a login/access-info/open response that
   * finally arrives after termination can never acquire a live socket for
   * a session nobody is attached to anymore. */
  async connect(): Promise<void> {
    if (this.terminated) {
      throw new TwmNetworkError(
        "TWM_ASR_TERMINATED",
        "This ASR session has already been closed.",
      );
    }
    if (this.connectPromise) return this.connectPromise;
    if (this.socket && this.socketOpen) return;
    this.connectGeneration += 1;
    this.armSetupDeadline();
    this.connectPromise = this.performConnect(this.connectGeneration)
      .catch((error: unknown) => {
        this.failSession(
          error instanceof Error ? error : new Error(String(error)),
        );
        throw error;
      })
      .finally(() => {
        this.connectPromise = undefined;
      });
    return this.connectPromise;
  }

  private assertNotTerminated(reason: string): void {
    if (this.terminated) {
      throw new TwmNetworkError("TWM_ASR_TERMINATED", reason);
    }
  }

  /** Throws once this is no longer the live connect attempt: either the
   * session was permanently closed (`terminated`), or this specific
   * attempt was abandoned by the setup deadline and a newer attempt (or
   * none) has since taken its place (R12). Distinguishing the two matters
   * only for the error code surfaced; both must equally refuse to let a
   * stale continuation proceed. */
  private assertCurrentAttempt(generation: number, reason: string): void {
    if (this.terminated) {
      throw new TwmNetworkError("TWM_ASR_TERMINATED", reason);
    }
    if (generation !== this.connectGeneration) {
      throw new TwmNetworkError("TWM_ASR_SETUP_TIMEOUT", reason);
    }
  }

  /** Arms the setup/readiness deadline (R12) if nothing has already armed
   * or resolved it. A no-op once `180` has been reached or the session is
   * already terminated. */
  private armSetupDeadline(): void {
    if (this.setupDeadlineTimer || this.ready || this.terminated) return;
    const timeoutMs = this.profile.timeouts.noSpeechTimeoutMs;
    this.setupDeadlineTimer = setTimeout(() => {
      this.setupDeadlineTimer = undefined;
      if (this.terminated || this.ready) return;
      this.failSetup();
    }, timeoutMs);
  }

  private clearSetupDeadline(): void {
    if (this.setupDeadlineTimer) {
      clearTimeout(this.setupDeadlineTimer);
      this.setupDeadlineTimer = undefined;
    }
  }

  /** Fires when the setup/readiness deadline elapses with `180` still
   * unreached (R12): rejects whatever `connect()` attempt is still
   * in-flight, settles every queued chunk/result waiter instead of
   * leaving them pending forever, and releases the stalled socket (if
   * any). Terminal: late upstream responses cannot resurrect this adapter;
   * reconnect requires a new session-owned adapter and fresh authority. */
  private failSetup(): void {
    const err = new TwmNetworkError(
      "TWM_ASR_SETUP_TIMEOUT",
      `TWM ASR provider did not reach '180' send-ready status within ${this.profile.timeouts.noSpeechTimeoutMs}ms of connecting.`,
    );
    this.failSession(err);
  }

  private failSession(err: Error): void {
    this.terminated = true;
    this.clearSetupDeadline();
    // Retain the owner's generation fence as well as aborting transports:
    // external boundaries are permitted to ignore an AbortSignal.
    this.connectGeneration += 1;
    this.setupAbort?.(err);
    this.setupController.abort();
    this.failPendingWork(err);
    const socket = this.socket;
    this.socket = undefined;
    this.socketOpen = false;
    this.ready = false;
    this.hasAccess = false;
    try {
      socket?.close(1000, "provider failed");
    } catch {
      /* best effort */
    }
  }

  /** Wraps `runConnectSteps()` so the setup deadline/`terminate()` can
   * reject this attempt immediately (`setupAbort`) without waiting for the
   * real, possibly-never-settling upstream login/access-info/handshake
   * call it is chained from (R11 scenario (c), R12). */
  private performConnect(generation: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      this.setupAbort = (err) => {
        if (settled) return;
        settled = true;
        this.setupAbort = undefined;
        reject(err);
      };
      this.runConnectSteps(generation).then(
        () => {
          if (settled) return;
          settled = true;
          this.setupAbort = undefined;
          resolve();
        },
        (err: unknown) => {
          if (settled) return;
          settled = true;
          this.setupAbort = undefined;
          reject(err);
        },
      );
    });
  }

  private async runConnectSteps(generation: number): Promise<void> {
    const token = await this.login();
    this.assertCurrentAttempt(
      generation,
      "ASR session was closed before access-info could be requested.",
    );
    const access = await this.getAccessInfo(token);
    this.assertCurrentAttempt(
      generation,
      "ASR session was closed before the provider socket could be opened.",
    );
    if (
      !Number.isFinite(Date.parse(access.expiresAt)) ||
      Date.parse(access.expiresAt) <= Date.now()
    ) {
      throw new TwmNetworkError(
        "TWM_ASR_TICKET_EXPIRED",
        "TWM access ticket is expired; acquire a fresh ticket before connecting.",
      );
    }
    const url = new URL(access.websocketUrl);
    if (
      url.protocol !== "wss:" ||
      !access.ticket ||
      this.usedTickets.has(access.ticket)
    ) {
      throw new TwmNetworkError(
        "TWM_ASR_TICKET_INVALID",
        "TWM requires a fresh single-use ticket and secure WebSocket URL.",
      );
    }
    this.usedTickets.add(access.ticket);
    url.searchParams.set("ticket", access.ticket);
    url.searchParams.set("modelName", this.profile.modelName);
    url.searchParams.set("type", this.profile.audioType);
    url.searchParams.set("rate", String(this.profile.sampleRateHz));
    url.searchParams.set("enableTransient", "1");
    url.searchParams.set("saveResult", "0");

    this.hasAccess = true;
    const socket = this.wsFactory(url.toString());
    if (this.terminated || generation !== this.connectGeneration) {
      // Closed, or this specific attempt abandoned by the setup deadline,
      // in the gap between the ticket being minted and the socket being
      // constructed -- never adopt it as `this.socket`, and release it
      // immediately rather than leaking a live provider connection that
      // nothing will ever read from.
      try {
        socket.close(1000, "closed");
      } catch {
        // Best effort -- the socket may not even be past CONNECTING yet.
      }
      this.assertCurrentAttempt(
        generation,
        "ASR session was closed before the provider socket could be opened.",
      );
    }
    this.socket = socket;
    socket.addEventListener("message", (event) => this.handleMessage(event));
    socket.addEventListener("close", () => {
      if (this.socket !== socket) return;
      this.failSession(
        new TwmNetworkError(
          "TWM_ASR_CONNECTION_CLOSED",
          "The TWM ASR provider connection closed.",
        ),
      );
    });
    socket.addEventListener("error", () => {
      if (this.socket !== socket) return;
      this.failSession(
        new TwmNetworkError("TWM_ASR_WS_ERROR", "TWM ASR WebSocket failed."),
      );
    });

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      socket.addEventListener("open", () => {
        if (settled) return;
        settled = true;
        this.socketOpen = true;
        resolve();
      });
      socket.addEventListener("error", () => {
        if (settled) return;
        settled = true;
        reject(
          new TwmNetworkError(
            "TWM_ASR_WS_ERROR",
            "TWM ASR WebSocket connection failed.",
          ),
        );
      });
      // A `close()` issued while the socket is still CONNECTING (R11,
      // scenario (b): `terminate()` closing an in-flight handshake) fires
      // `close`, never `open`/`error` -- without this listener the promise
      // above would never settle and every caller awaiting `connect()`
      // would hang forever.
      socket.addEventListener("close", () => {
        if (settled) return;
        settled = true;
        reject(
          new TwmNetworkError(
            "TWM_ASR_WS_CLOSED_BEFORE_OPEN",
            "TWM ASR WebSocket closed before the handshake completed.",
          ),
        );
      });
    });
    this.assertCurrentAttempt(
      generation,
      "ASR session was closed during the provider handshake.",
    );
  }

  private handleMessage(event: TwmWebSocketEvent): void {
    const raw = event.data;
    let parsed: unknown;
    try {
      const text =
        typeof raw === "string"
          ? raw
          : Buffer.from(raw as Uint8Array).toString("utf8");
      parsed = JSON.parse(text);
    } catch {
      return;
    }
    if (typeof parsed !== "object" || parsed === null) return;
    const message = parsed as Record<string, unknown>;

    if (typeof message.status === "number") {
      // `180`, not `100`, is the documented media-send readiness gate.
      this.ready = this.hasAccess && message.status === 180 && !this.eosSent;
      if (this.ready) {
        // Readiness reached within the setup deadline (R12) -- the window
        // this adapter bounds is specifically "connect() started" through
        // "180 reached," so it ends here regardless of how long the call
        // goes on to run afterward.
        this.clearSetupDeadline();
        // R12: `connect()` resolves on the socket's `open` event, which can
        // land in an earlier event-loop turn than this `180`. Audio sent in
        // that gap was queued (never dropped) by `transcribe()`; flush it
        // now in arrival order instead of waiting for another chunk to
        // "poll" with.
        this.tryFlushQueue();
      }
      return;
    }

    if (typeof message.segmentId === "string") {
      const key = `${String(message.providerSessionId)}:${message.segmentId}`;
      const previousRevision = this.lastRevisionBySegment.get(key);
      const revision = message.revision;
      if (
        typeof revision !== "number" ||
        !Number.isInteger(revision) ||
        revision < 0 ||
        this.finalizedSegments.has(key) ||
        (previousRevision !== undefined && revision <= previousRevision)
      ) {
        // A final segment is immutable and revisions must increase -- drop
        // anything that violates that instead of surfacing a corrupt result.
        return;
      }
      this.lastRevisionBySegment.set(key, revision);
      // SD §11.1 point 5: the wire protocol encodes `final` as the numeric
      // `0`/`1`, not a JSON boolean. Comparing against `true` silently
      // treated every provider message as non-final, which both reported a
      // false `final: false` to callers and left `finalizedSegments` empty
      // -- so a later, stale revision for an already-finalized segment was
      // never dropped either.
      const isFinal = message.final === 1;
      if (isFinal) {
        this.finalizedSegments.add(key);
        this.pendingFinalSegments.delete(key);
      } else {
        this.pendingFinalSegments.add(key);
      }
      const result: VoiceAsrSegmentResult = {
        segmentId: message.segmentId,
        revision,
        text: typeof message.text === "string" ? message.text : "",
        final: isFinal,
        language: typeof message.language === "string" ? message.language : "",
      };
      // Push to every registered streaming listener immediately, as soon as
      // the provider message is decoded -- independent of whether another
      // `transcribe()` call ever happens again for this session. Without
      // this, a final revision that arrives after the audio chunk it
      // belongs to has already been sent (no further audio to "poll" with)
      // would sit in `bufferedResults` forever and never reach a caller.
      for (const listener of this.resultListeners) listener(result);
      const waiter = this.waiters.shift();
      if (waiter) {
        waiter.resolve(result);
      } else {
        this.bufferedResults.push(result);
      }
      // Lets a `terminate()` in-flight drain wait (R11 scenario (c)) end the
      // instant every outstanding result has actually arrived, instead of
      // always burning the full configured window. Gated on
      // `pendingFinalSegments`, not merely `waiters.length` -- a partial
      // emptying the waiter queue is not proof the stream is finished.
      this.maybeSignalDrainComplete();
    }
  }

  /** `true` once there is nothing left for an in-flight `terminate()` to
   * wait for: every segment that has received a non-final revision has
   * since been finalized, and no `receiveResult()` caller is still waiting
   * for its first result. */
  private isDrainComplete(): boolean {
    return this.pendingFinalSegments.size === 0 && this.waiters.length === 0;
  }

  private maybeSignalDrainComplete(): void {
    if (this.isDrainComplete()) {
      this.drainSignal?.();
      this.drainSignal = undefined;
    }
  }

  /** Registers a listener invoked for every accepted (monotonic,
   * non-replayed) revision as soon as it is decoded from the provider's
   * WebSocket, independent of `transcribe()`'s request/response pairing.
   * Multiple listeners may be registered; none are ever removed
   * automatically -- callers own exactly one `TwmAsrNetworkAdapter` per
   * session (see `provider-composition.ts`), so this never needs to be
   * shared/unregistered mid-session. */
  onResult(listener: (result: VoiceAsrSegmentResult) => void): void {
    this.resultListeners.push(listener);
  }

  async transcribe(
    request: VoiceAsrTranscribeRequest,
  ): Promise<VoiceAsrSegmentResult> {
    this.assertNotTerminated("ASR session was closed.");
    if (this.eosSent) {
      throw new TwmNetworkError(
        "TWM_ASR_NOT_READY",
        "TWM audio requires an open stream before EOS.",
      );
    }
    if (request.audioChunk.byteLength >= 384 * 1024) {
      throw new TwmNetworkError(
        "TWM_ASR_FRAME_TOO_LARGE",
        "TWM frame must be smaller than 384 KB.",
      );
    }
    if (
      this.pendingIngress + this.audioQueue.length >=
      MAX_QUEUED_AUDIO_CHUNKS
    ) {
      const error = new TwmNetworkError(
        "TWM_ASR_QUEUE_OVERFLOW",
        `TWM audio queue exceeded ${MAX_QUEUED_AUDIO_CHUNKS} chunks awaiting provider '180' readiness.`,
      );
      this.failSession(error);
      throw error;
    }
    this.pendingIngress++;
    try {
      await this.connect();
    } finally {
      this.pendingIngress--;
    }
    this.assertNotTerminated("ASR session was closed.");
    // `connect()` resolving only means the socket reached `open` -- the
    // provider's documented send-ready gate is its own, separately
    // asynchronous `180` status message (R12). Queue rather than reject: a
    // caller streaming audio immediately after connecting (the normal
    // case) must not have its first one or two chunks permanently dropped
    // just because they raced that status message.
    this.audioQueue.push(request.audioChunk);
    this.tryFlushQueue();
    return this.receiveResult();
  }

  /** Sends every queued chunk, in arrival order, exactly once -- a no-op
   * unless the provider has actually granted `180` readiness. Called both
   * from `transcribe()` (the common case: already ready) and from the
   * `180` status handler (the race case: chunks queued before readiness). */
  private tryFlushQueue(): void {
    if (!this.ready || this.eosSent || !this.socket) return;
    while (this.audioQueue.length > 0) {
      const chunk = this.audioQueue.shift()!;
      try {
        this.socket.send(chunk);
      } catch (error) {
        this.failSession(
          error instanceof Error ? error : new Error(String(error)),
        );
        return;
      }
    }
  }

  private receiveResult(): Promise<VoiceAsrSegmentResult> {
    const buffered = this.bufferedResults.shift();
    if (buffered) return Promise.resolve(buffered);
    if (this.terminated) {
      return Promise.reject(
        new TwmNetworkError(
          "TWM_ASR_CLOSED",
          "The ASR session was closed before a result arrived.",
        ),
      );
    }
    return new Promise((resolve, reject) => {
      this.waiters.push({ resolve, reject });
    });
  }

  /** Rejects every outstanding result waiter and discards queued-but-unsent
   * audio (R11): a provider-initiated close/error, or this adapter's own
   * `terminate()`, must settle whatever work was left pending rather than
   * leaving it to hang forever. Safe to call when there is nothing pending. */
  private failPendingWork(err: Error): void {
    const pending = this.waiters.splice(0, this.waiters.length);
    for (const waiter of pending) waiter.reject(err);
    this.audioQueue.length = 0;
    // Nothing will arrive to finalize these once the socket is gone/being
    // discarded -- leaving them pending would make a later `isDrainComplete`
    // check (e.g. a subsequent `terminate()` call) wait for a final that
    // can never come.
    this.pendingFinalSegments.clear();
    this.drainSignal?.();
    this.drainSignal = undefined;
  }

  /** Resolves once every outstanding result waiter has settled AND every
   * segment with an open (non-final) revision has been finalized, or after
   * `timeoutMs`, whichever comes first (R11). */
  private awaitDrain(timeoutMs: number): Promise<void> {
    if (this.isDrainComplete()) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        if (this.drainSignal === finish) this.drainSignal = undefined;
        resolve();
      };
      const timer = setTimeout(finish, timeoutMs);
      this.drainSignal = finish;
    });
  }

  /** Attempts to send the documented EOS control frame: SD §11.1 point 6
   * requires the literal text `EOS`, not a JSON envelope. Never throws --
   * sending on a socket that has not reached `open` is invalid per native
   * WebSocket send semantics, and a send failure here must not prevent the
   * rest of shutdown/cleanup from running. Safe to call multiple times. */
  private sendEosIfPossible(): void {
    if (this.eosSent) return;
    this.eosSent = true;
    this.ready = false;
    if (this.socket && this.socketOpen) {
      try {
        this.socket.send("EOS");
      } catch {
        // Best effort -- cleanup proceeds regardless (R11 scenario (b)).
      }
    }
  }

  /** Signals that no further audio will be sent for this session. Distinct
   * from `close()`: ends the send side but, per SD §11.1 point 6, leaves
   * the receive side open for the provider's final result(s) -- hangup is
   * never consent to discard a final that is already in flight. */
  endAudio(): void {
    this.sendEosIfPossible();
  }

  /** Terminal shutdown (R11): fences every in-flight login/access-info/open
   * continuation, sends EOS if the stream was ever opened, waits up to this
   * profile's configured `eosDrainMs` for any outstanding result to arrive
   * (ending early the instant it does), then settles whatever is still
   * pending and releases the socket. Never throws. Idempotent and safe to
   * call multiple times, from any lifecycle phase (never connected, still
   * connecting, open-but-not-ready, ready-with-pending-work).
   *
   * Returns the `Promise` for that bounded teardown so a caller doing an
   * orderly shutdown (`VoiceMediaWorkerSession.closeAsr`, ultimately
   * `MediaWorkerServer.stop`/`drain`) can actually wait for it to finish
   * instead of only for it to have been *requested* -- discarding this
   * (`void this.terminate(...)`, as this used to do) is exactly what made
   * server shutdown return long before the EOS drain it configured ever
   * ran (R11 scenario (d)). */
  close(code = 1000, reason = ""): Promise<void> {
    this.closePromise ??= this.terminate(code, reason);
    return this.closePromise;
  }

  private async terminate(code: number, reason: string): Promise<void> {
    if (this.terminated) return;
    this.terminated = true;
    this.clearSetupDeadline();
    this.setupController.abort();
    // A `connect()` still awaiting login/access-info/open (R11 scenario
    // (c)) has no bound of its own -- the real HTTP/WS promise it is
    // chained from may not settle for a long time, if ever. Reject it
    // immediately instead of leaving every `transcribe()`/`connect()`
    // caller pending until that unrelated upstream call eventually
    // resolves and the post-await `assertNotTerminated` check finally
    // fires.
    this.setupAbort?.(
      new TwmNetworkError(
        "TWM_ASR_TERMINATED",
        "ASR session was closed before the provider socket could be opened.",
      ),
    );
    this.sendEosIfPossible();
    const drainMs = this.profile.timeouts?.eosDrainMs ?? 0;
    if (!this.isDrainComplete() && drainMs > 0) {
      await this.awaitDrain(drainMs);
    }
    this.failPendingWork(
      new TwmNetworkError(
        "TWM_ASR_CLOSED",
        "The ASR session was closed before a result arrived.",
      ),
    );
    try {
      this.socket?.close(code, reason);
    } catch {
      // Best effort -- the socket may already be closing/closed.
    }
    this.socket = undefined;
    this.socketOpen = false;
    this.ready = false;
    this.hasAccess = false;
  }
}
