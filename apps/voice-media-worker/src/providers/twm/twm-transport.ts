import type {
  TwmAsrAccessInfo,
  TwmAsrConnectParams,
  TwmAsrServerMessage,
  TwmTtsModelCatalogEntry,
  TwmTtsSynthesizeParams,
} from "./twm-types";

/**
 * Injectable transport boundary for TWM (SD §11.1, §11.2). No HTTP client or
 * WebSocket implementation lives in this repo: production traffic requires
 * an account-verified transport that UV-EXEC-027/028 supplies. Tests and the
 * sandbox path drive these adapters through fixture transports instead of a
 * real network call, per this task's brief ("以文件及 fixture 做 adapter").
 */

// ---------------------------------------------------------------------------
// ASR (Streaming V3.22)
// ---------------------------------------------------------------------------

export interface TwmAsrSocket {
  /** Caller is responsible for keeping each frame under `TWM_ASR_MAX_FRAME_BYTES`. */
  sendAudioFrame(frame: Uint8Array): void;
  /** SD §11.1 step 6: text `EOS`; not itself a passenger confirmation. */
  sendEos(): void;
  onMessage(handler: (message: TwmAsrServerMessage) => void): void;
  close(): void;
}

export interface TwmAsrTransport {
  /** SD §11.1 step 1: `POST /api/v1/login`; the returned Bearer token never leaves the worker. */
  login(): Promise<{ token: string }>;
  /** SD §11.1 step 2: `GET /api/v1/streaming/transcript/access-info`; call this immediately before connecting. */
  fetchAccessInfo(token: string): Promise<TwmAsrAccessInfo>;
  /** SD §11.1 step 3-4: open the socket with the just-fetched ticket; adapter waits for `180` before sending media. */
  connect(
    accessInfo: TwmAsrAccessInfo,
    params: TwmAsrConnectParams,
  ): Promise<TwmAsrSocket>;
}

// ---------------------------------------------------------------------------
// TTS (V2.07)
// ---------------------------------------------------------------------------

export interface TwmTtsSynthesisHandle {
  /** Fixture/streaming chunks; a real transport would yield these as the HTTP chunked response arrives. */
  audioChunks: readonly Uint8Array[];
  /** SD §11.4: best-effort local-transport abort; never awaited by the caller. */
  abort(): void | Promise<void>;
}

export interface TwmTtsTransport {
  /** SD §11.2: TTS login path is documented separately from ASR login; do not assume it is the same endpoint. */
  login(): Promise<{ token: string }>;
  /** SD §11.2: `voice.model` must be chosen from this catalog, never guessed. */
  fetchModels(token: string): Promise<readonly TwmTtsModelCatalogEntry[]>;
  synthesize(
    token: string,
    params: TwmTtsSynthesizeParams,
  ): Promise<TwmTtsSynthesisHandle>;
}
