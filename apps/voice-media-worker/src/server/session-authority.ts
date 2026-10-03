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
  /** Bound so a completed-finalization binding for a session id that is
   * never reused (the common case) cannot grow this cache without limit. */
  private static readonly MAX_COMPLETED_ENTRIES = 1000;

  private readonly pending = new Map<string, PendingGrant>();
  private readonly attached = new Map<string, AttachedSession>();
  private readonly completed = new Map<string, AttachedSession>();

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
    this.completed.delete(sessionId);

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

  /** The single authoritative expiry/cleanup path for a pending grant --
   * called both by the TTL timer and by `consumeGrant` when it discovers
   * the grant already expired before the timer fired. Epoch-checked so it
   * can never evict a *different*, newer epoch's pending grant (e.g. one
   * issued for a reused session id after this one was superseded), and
   * guarded by `pending`'s own deletion so it emits `grant.expired` at most
   * once per grant regardless of which path observes the expiry. */
  private handleGrantExpiry(sessionId: string, epoch: number): void {
    const record = this.pending.get(sessionId);
    if (!record || record.epoch !== epoch || record.consumed) return;
    clearTimeout(record.expiryTimer);
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
      // The grant expired before its own TTL timer fired (normal
      // event-loop delay, or this upgrade attempt itself took long enough
      // to cross `expiresAt`). Route through the same cleanup the timer
      // uses so capacity is freed and `grant.expired` still fires exactly
      // once -- previously this branch deleted the record directly without
      // emitting, permanently cancelling the capacity reaper for this
      // session id.
      this.handleGrantExpiry(sessionId, record.epoch);
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

  /** Authoritative recording scope bound at admission/attach time, or still
   * resolvable from a completed finalization for the same session/epoch
   * (see `markCompleted`) so an authorized retry keeps resolving it. Never
   * derived from a later caller-supplied value -- this is what
   * `/recording/finalize` must use instead of trusting its request body. */
  getAuthoritativeScope(sessionId: string): RecordingScope | undefined {
    return (this.attached.get(sessionId) ?? this.completed.get(sessionId))
      ?.scope;
  }

  /** The epoch currently bound (attached or completed) for this session id,
   * or `undefined` if none is (never admitted, never attached, or fenced by
   * a later epoch). `/recording/finalize` must re-verify its own presented
   * token resolves to this exact epoch, not merely that some scope exists. */
  getAuthoritativeEpoch(sessionId: string): number | undefined {
    return (this.attached.get(sessionId) ?? this.completed.get(sessionId))
      ?.epoch;
  }

  getAuthoritativePrincipal(sessionId: string): string | undefined {
    return (this.attached.get(sessionId) ?? this.completed.get(sessionId))
      ?.principalId;
  }

  /** Marks a successfully finalized session's epoch as completed instead of
   * releasing all authority state for it. `MediaRecordingAdapter.
   * sealFinalRecording` is documented reentrant (fixed manifest ref for the
   * same scope/closure) -- the gap this closes is purely that releasing
   * authority immediately after a successful seal made every *authorized*
   * retry (a lost HTTP response, a caller that retries the same request)
   * fail closed with "no authorized recording scope" before ever reaching
   * that reentrant adapter. No-ops if a newer epoch has since superseded
   * this one (e.g. a concurrent reattach for a reused session id raced this
   * seal), so an in-flight older seal can never clobber newer authority. */
  markCompleted(sessionId: string, epoch: number): void {
    const record = this.attached.get(sessionId);
    if (!record || record.epoch !== epoch) return;
    this.attached.delete(sessionId);
    this.completed.set(sessionId, record);
    while (
      this.completed.size > VoiceMediaSessionAuthority.MAX_COMPLETED_ENTRIES
    ) {
      const oldestKey = this.completed.keys().next().value;
      if (oldestKey === undefined) break;
      this.completed.delete(oldestKey);
    }
  }

  /** Releases all authority state for a session id (pending, attached, and
   * completed) once it is fully done and will never be finalized or
   * retried again, or was never usable for recording in the first place. */
  release(sessionId: string): void {
    const pending = this.pending.get(sessionId);
    if (pending) clearTimeout(pending.expiryTimer);
    this.pending.delete(sessionId);
    this.attached.delete(sessionId);
    this.completed.delete(sessionId);
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

/** Compares two recording scopes field-by-field. Used by
 * `/recording/finalize` to require that the *finalize-specific* token's own
 * claimed scope is the exact resource bound to the session, instead of
 * trusting that a finalize token resolving to the right session/epoch/
 * principal is automatically entitled to whatever scope happens to be
 * attached -- a token for a different brand/call/recording/leg, or one with
 * no recording scope at all, must be denied even though it is otherwise a
 * genuine, unexpired, unrevoked token for this exact session and epoch. */
export function recordingScopesMatch(
  a: RecordingScope,
  b: RecordingScope,
): boolean {
  return RECORDING_SCOPE_KEYS.every((key) => a[key] === b[key]);
}

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
