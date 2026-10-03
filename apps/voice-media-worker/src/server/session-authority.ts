import { randomBytes, timingSafeEqual } from "node:crypto";

import type { RecordingScope } from "../recording/sealed-recorder";

export class VoiceMediaSessionAuthorityError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "VoiceMediaSessionAuthorityError";
  }
}

interface PendingGrant {
  token: string;
  epoch: number;
  scope: RecordingScope | undefined;
  expiresAt: number;
  consumed: boolean;
}

interface AttachedSession {
  epoch: number;
  scope: RecordingScope | undefined;
}

/**
 * Server-owned per-session admission authority for the media worker.
 *
 * The shared `x-drts-internal-key` (see `./internal-auth`) only proves the
 * caller is a trusted operator of this worker -- it is a single global
 * secret, not evidence that a specific `sessionId` was actually admitted or
 * that a specific recording `scope` belongs to it. Without this authority, a
 * holder of that one key could attach a WebSocket to, or finalize a
 * recording for, *any* session id it guesses, because nothing distinguished
 * "knows the operations key" from "was granted this one session." This
 * class closes that gap: `POST /sessions` is the only place a session's
 * scope is recorded and a grant is issued; WS attachment and recording
 * finalization must present/resolve through that same per-session grant
 * instead of re-trusting caller-supplied identifiers.
 */
export class VoiceMediaSessionAuthority {
  private readonly pending = new Map<string, PendingGrant>();
  private readonly attached = new Map<string, AttachedSession>();
  private epochCounter = 0;

  constructor(private readonly grantTtlMs = 30_000) {}

  /** Issues a single-use grant for a freshly admitted session. Replaces any
   * earlier, still-pending grant for the same id (the prior epoch can no
   * longer be consumed). */
  issueGrant(
    sessionId: string,
    scope: RecordingScope | undefined,
  ): { token: string; epoch: number; expiresAt: number } {
    const epoch = ++this.epochCounter;
    const token = randomBytes(32).toString("hex");
    const expiresAt = Date.now() + this.grantTtlMs;
    this.pending.set(sessionId, {
      token,
      epoch,
      scope,
      expiresAt,
      consumed: false,
    });
    return { token, epoch, expiresAt };
  }

  /** Consumes the pending grant for a WS attach. Fails closed on every
   * mismatch: missing/unissued session, expired grant, replay of an
   * already-consumed grant, or a token that does not belong to this exact
   * session id. Successful consumption binds the session's authoritative
   * scope for later recording finalization. */
  consumeGrant(sessionId: string, token: string | undefined): void {
    const record = this.pending.get(sessionId);
    if (!record) {
      throw new VoiceMediaSessionAuthorityError(
        "VOICE_MEDIA_SESSION_GRANT_MISSING",
        "No session grant is pending for this session id; call POST /sessions first.",
      );
    }
    if (!token) {
      throw new VoiceMediaSessionAuthorityError(
        "VOICE_MEDIA_SESSION_GRANT_REQUIRED",
        "A session grant token is required to attach this session.",
      );
    }
    if (record.consumed) {
      throw new VoiceMediaSessionAuthorityError(
        "VOICE_MEDIA_SESSION_GRANT_REPLAYED",
        "This session grant was already consumed.",
      );
    }
    if (Date.now() > record.expiresAt) {
      this.pending.delete(sessionId);
      throw new VoiceMediaSessionAuthorityError(
        "VOICE_MEDIA_SESSION_GRANT_EXPIRED",
        "This session grant has expired.",
      );
    }
    if (!this.timingSafeTokenEquals(token, record.token)) {
      throw new VoiceMediaSessionAuthorityError(
        "VOICE_MEDIA_SESSION_GRANT_INVALID",
        "Session grant token is invalid for this session id.",
      );
    }
    record.consumed = true;
    this.attached.set(sessionId, { epoch: record.epoch, scope: record.scope });
  }

  /** Authoritative recording scope bound at admission/attach time. Never
   * derived from a later caller-supplied value -- this is what
   * `/recording/finalize` must use instead of trusting its request body. */
  getAuthoritativeScope(sessionId: string): RecordingScope | undefined {
    return this.attached.get(sessionId)?.scope;
  }

  /** Releases all authority state for a session id once it is fully done
   * (recording finalized, or the session was never usable for recording). */
  release(sessionId: string): void {
    this.pending.delete(sessionId);
    this.attached.delete(sessionId);
  }

  private timingSafeTokenEquals(provided: string, expected: string): boolean {
    const providedBuf = Buffer.from(provided);
    const expectedBuf = Buffer.from(expected);
    if (providedBuf.length !== expectedBuf.length) return false;
    return timingSafeEqual(providedBuf, expectedBuf);
  }
}

const RECORDING_SCOPE_KEYS: readonly (keyof RecordingScope)[] = [
  "brandId",
  "callId",
  "recordingId",
  "legId",
];

/** Validates an optional caller-declared recording scope at session
 * admission time (an internal-key-gated, trusted call). Returns `undefined`
 * when the caller declared no scope at all (session is not recording-
 * eligible); throws when a scope was attempted but is incomplete, so a
 * partially-specified scope can never silently become "no scope required." */
export function parseRecordingScope(
  input: unknown,
): RecordingScope | undefined {
  if (input === undefined || input === null) return undefined;
  if (typeof input !== "object") {
    throw new VoiceMediaSessionAuthorityError(
      "VOICE_MEDIA_SCOPE_INVALID",
      "scope must be an object with brandId, callId, recordingId, legId.",
    );
  }
  const record = input as Record<string, unknown>;
  const scope: Partial<Record<keyof RecordingScope, string>> = {};
  for (const key of RECORDING_SCOPE_KEYS) {
    const value = record[key];
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new VoiceMediaSessionAuthorityError(
        "VOICE_MEDIA_SCOPE_INVALID",
        `scope.${key} must be a non-empty string.`,
      );
    }
    scope[key] = value;
  }
  return scope as RecordingScope;
}
