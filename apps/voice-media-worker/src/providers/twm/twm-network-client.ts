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
  init?: { headers?: Record<string, string>; body?: string },
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
): Promise<{ status: number; body: Record<string, unknown> | undefined }> {
  const res = await transport("POST", path, {
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
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
): Promise<{ status: number; body: Record<string, unknown> | undefined }> {
  const res = await transport("GET", path, { headers });
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

export class TwmAsrNetworkAdapter implements VoiceSpeechToTextAdapter {
  readonly providerName = "twm";
  readonly isProductionCapable: boolean;

  private socket: TwmWebSocketLike | undefined;
  private hasAccess = false;
  private ready = false;
  private eosSent = false;
  private readonly usedTickets = new Set<string>();
  private readonly lastRevisionBySegment = new Map<string, number>();
  private readonly finalizedSegments = new Set<string>();
  private readonly bufferedResults: VoiceAsrSegmentResult[] = [];
  private readonly waiters: Array<(result: VoiceAsrSegmentResult) => void> = [];

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
   * handshake. Idempotent no-op once an open socket exists. */
  async connect(): Promise<void> {
    if (this.socket) return;
    const token = await this.login();
    const access = await this.getAccessInfo(token);
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
    this.socket = socket;
    socket.addEventListener("message", (event) => this.handleMessage(event));
    socket.addEventListener("close", () => {
      this.ready = false;
      this.hasAccess = false;
    });

    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve());
      socket.addEventListener("error", () =>
        reject(
          new TwmNetworkError(
            "TWM_ASR_WS_ERROR",
            "TWM ASR WebSocket connection failed.",
          ),
        ),
      );
    });
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
      if (message.final === true) this.finalizedSegments.add(key);
      const result: VoiceAsrSegmentResult = {
        segmentId: message.segmentId,
        revision,
        text: typeof message.text === "string" ? message.text : "",
        final: message.final === true,
        language: typeof message.language === "string" ? message.language : "",
      };
      const waiter = this.waiters.shift();
      if (waiter) waiter(result);
      else this.bufferedResults.push(result);
    }
  }

  async transcribe(
    request: VoiceAsrTranscribeRequest,
  ): Promise<VoiceAsrSegmentResult> {
    await this.connect();
    if (!this.ready || this.eosSent) {
      throw new TwmNetworkError(
        "TWM_ASR_NOT_READY",
        "TWM audio requires 180 ready and an open stream.",
      );
    }
    if (request.audioChunk.byteLength >= 384 * 1024) {
      throw new TwmNetworkError(
        "TWM_ASR_FRAME_TOO_LARGE",
        "TWM frame must be smaller than 384 KB.",
      );
    }
    this.socket!.send(request.audioChunk);
    return this.receiveResult();
  }

  private receiveResult(): Promise<VoiceAsrSegmentResult> {
    const buffered = this.bufferedResults.shift();
    if (buffered) return Promise.resolve(buffered);
    return new Promise((resolve) => {
      this.waiters.push(resolve);
    });
  }

  /** Sends the documented EOS control frame. Receive-side drain stays open
   * after sending stops; final is never consent. */
  endAudio(): void {
    if (!this.eosSent && this.socket) {
      this.socket.send(JSON.stringify({ frame: "EOS" }));
    }
    this.eosSent = true;
    this.ready = false;
  }

  close(code = 1000, reason = ""): void {
    this.socket?.close(code, reason);
    this.socket = undefined;
    this.ready = false;
    this.hasAccess = false;
  }
}
