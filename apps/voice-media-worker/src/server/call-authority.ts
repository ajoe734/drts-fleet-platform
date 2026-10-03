import type { RecordingScope } from "../recording/sealed-recorder";

/**
 * The authenticated, server-owned facts a trusted call/line authority
 * attests for one admitted session. These must be *resolved* from a
 * caller-presented, independently verifiable token -- never accepted as
 * caller-declared `sessionId`/`scope` body fields on `POST /sessions`.
 * Anyone who holds the single shared operations key (see `./internal-auth`)
 * can reach that route; nothing about that key proves which brand/call/
 * recording the request is actually entitled to.
 */
export interface VoiceCallAuthorityClaims {
  /** The authenticated upstream principal (e.g. the CTI/IVR bridge instance
   * that actually answered this call) this claim was issued to. */
  readonly principalId: string;
  /** The exact session id this claim is bound to. The worker must never
   * admit a *different* caller-declared session id under this token. */
  readonly sessionId: string;
  /** Recording scope for this call, or `undefined` for a session that is
   * not recording-eligible. Never taken from the request body. */
  readonly scope: RecordingScope | undefined;
  /** Monotonic generation for this session id, assigned by the authority
   * (not this worker). A higher epoch presented for a session id that
   * already has attached/pending authority fences every earlier epoch --
   * closing the gap where a session id is reused for an unrelated later
   * call while the previous call's recording authority is still live. */
  readonly epoch: number;
}

export class VoiceCallAuthorityError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "VoiceCallAuthorityError";
  }
}

/**
 * Boundary to the real call/line authority. No production implementation is
 * wired into this worker today (see
 * docs/04-uat/audit-voice-runtime-20261002.md for the concrete missing
 * CTI/IVR issuer wiring) -- `MediaWorkerServer` must refuse admission and
 * finalization rather than silently trust the caller's own claims when this
 * is not configured. Test/dev composition injects a double that implements
 * this same interface against a known, pre-issued token set; only the real
 * upstream issuer identity system is ever mocked, never the worker's own
 * verification/binding logic.
 */
export interface VoiceCallAuthorityVerifier {
  /** Resolves and validates a caller-presented call-authority token.
   * Must reject (throw `VoiceCallAuthorityError`) a missing, expired,
   * replayed, revoked, or otherwise unrecognized token. */
  verifySessionAuthority(token: string): Promise<VoiceCallAuthorityClaims>;
}
