import { randomBytes, timingSafeEqual } from "node:crypto";
import { EventEmitter } from "node:events";

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
  principalId: string;
  scope: RecordingScope | undefined;
  expiresAt: number;
  consumed: boolean;
  expiryTimer: NodeJS.Timeout;
}

interface AttachedSession {
  epoch: number;
  principalId: string;
  scope: RecordingScope | undefined;
}

/**
 * Server-owned per-session admission authority for the media worker.
 *
 * The shared `x-drts-internal-key` (see `./internal-auth`) only proves the
 * caller is a trusted operator of this worker -- it is a single global
 * secret, not evidence that a specific `sessionId` was actually admitted or
 * that a specific recording `scope`/`principalId`/`epoch` belongs to it.
 * `issueGrant` must be called only with claims already resolved from a
 * verified `VoiceCallAuthorityVerifier` token (see `./call-authority`),
 * never with caller-declared values. `POST /sessions` is the only place a
 * session's scope is recorded and a grant is issued; WS attachment and
 * recording finalization must present/resolve through that same per-session
 * grant/epoch instead of re-trusting caller-supplied identifiers.
 *
 * Epochs fence stale authority: issuing a strictly higher epoch for a
 * session id that already has pending or attached authority immediately
 * supersedes it, so a session id reused for an unrelated later call can
 * never resolve to the previous call's scope. A grant that is never
 * consumed before its TTL expires emits `grant.expired` so the server can
 * free the capacity it reserved -- otherwise a session that never attaches
 * (expired grant, failed handshake, or no attach attempt at all) would hold
 * its slot forever.
 */
export class VoiceMediaSessionAuthority extends EventEmitter {
  private readonly pending = new Map<string, PendingGrant>();
  private readonly attached = new Map<string, AttachedSession>();

  constructor(private readonly grantTtlMs = 30_000) {
    super();
  }

  private currentEpoch(sessionId: string): number | undefined {
    const attached = this.attached.get(sessionId)?.epoch;
    const pending = this.pending.get(sessionId)?.epoch;
    if (attached === undefined) return pending;
    if (pending === undefined) return attached;
    return Math.max(attached, pending);
  }

  /** Issues a single-use grant for a freshly admitted session, using claims
   * already resolved from a verified call-authority token. Rejects an
   * `epoch` that is not strictly greater than any epoch already pending or
   * attached for this session id -- this is what fences a stale/replayed
   * epoch and what forces a session id reused for a new call to supersede
   * (not merge with) the previous call's authority. */
  issueGrant(
    sessionId: string,
    principalId: string,
    scope: RecordingScope | undefined,
    epoch: number,
  ): { token: string; epoch: number; expiresAt: number } {
    const existingEpoch = this.currentEpoch(sessionId);
    if (existingEpoch !== undefined && epoch <= existingEpoch) {
      throw new VoiceMediaSessionAuthorityError(
        "VOICE_MEDIA_SESSION_EPOCH_STALE",
        `Session epoch ${epoch} is not newer than the current epoch ${existingEpoch} for this session id.`,
      );
    }

    // A strictly higher epoch supersedes any earlier attached authority for
    // this session id immediately -- the previous call's recording is no
    // longer finalizable once a later call has been authorized to reuse the
    // id, even if that previous recording was never finalized.
    const previousPending = this.pending.get(sessionId);
    if (previousPending) clearTimeout(previousPending.expiryTimer);
    this.pending.delete(sessionId);
    this.attached.delete(sessionId);

    const token = randomBytes(32).toString("hex");
    const expiresAt = Date.now() + this.grantTtlMs;
    const expiryTimer = setTimeout(() => {
      this.handleGrantExpiry(sessionId, epoch);
    }, this.grantTtlMs);
    expiryTimer.unref?.();
    this.pending.set(sessionId, {
      token,
      epoch,
      principalId,
      scope,
      expiresAt,
      consumed: false,
      expiryTimer,
    });
    return { token, epoch, expiresAt };
  }

  private handleGrantExpiry(sessionId: string, epoch: number): void {
    const record = this.pending.get(sessionId);
    if (!record || record.epoch !== epoch || record.consumed) return;
    this.pending.delete(sessionId);
    this.emit("grant.expired", { sessionId, epoch });
  }

  /** Consumes the pending grant for a WS attach. Fails closed on every
   * mismatch: missing/unissued session, expired grant, replay of an
   * already-consumed grant, or a token that does not belong to this exact
   * session id. Successful consumption binds the session's authoritative
   * scope/principal/epoch for later recording finalization. */
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
      clearTimeout(record.expiryTimer);
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
    clearTimeout(record.expiryTimer);
    this.attached.set(sessionId, {
      epoch: record.epoch,
      principalId: record.principalId,
      scope: record.scope,
    });
  }

  /** Authoritative recording scope bound at admission/attach time. Never
   * derived from a later caller-supplied value -- this is what
   * `/recording/finalize` must use instead of trusting its request body. */
  getAuthoritativeScope(sessionId: string): RecordingScope | undefined {
    return this.attached.get(sessionId)?.scope;
  }

  /** The epoch currently bound for this session id, or `undefined` if none
   * is attached (never admitted, never attached, or fenced by a later
   * epoch). `/recording/finalize` must re-verify its own presented token
   * resolves to this exact epoch, not merely that some scope exists. */
  getAuthoritativeEpoch(sessionId: string): number | undefined {
    return this.attached.get(sessionId)?.epoch;
  }

  getAuthoritativePrincipal(sessionId: string): string | undefined {
    return this.attached.get(sessionId)?.principalId;
  }

  /** Releases all authority state for a session id once it is fully done
   * (recording finalized, or the session was never usable for recording). */
  release(sessionId: string): void {
    const pending = this.pending.get(sessionId);
    if (pending) clearTimeout(pending.expiryTimer);
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

/** Validates an optional recording scope resolved from a verified
 * call-authority token (never caller-declared request-body JSON). Returns
 * `undefined` when the authority declared no scope at all (session is not
 * recording-eligible); throws when a scope was attempted but is incomplete,
 * so a partially-specified scope can never silently become "no scope
 * required." */
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
