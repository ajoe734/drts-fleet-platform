import { randomUUID } from "node:crypto";

import {
  VoiceCallAuthorityError,
  type VoiceCallAuthorityClaims,
  type VoiceCallAuthorityOperation,
  type VoiceCallAuthorityVerifier,
} from "../../../apps/voice-media-worker/src/server/call-authority";
import type { RecordingScope } from "../../../apps/voice-media-worker/src/recording/sealed-recorder";

/**
 * Test double for the real call/line authority this worker does not yet
 * have wired in (see docs/04-uat/audit-voice-runtime-20261002.md). This
 * mocks only the external issuer; every test that uses it still exercises
 * `MediaWorkerServer`'s own verification/binding/fencing logic for real
 * against whatever claims this returns.
 */
const BOTH_OPERATIONS: readonly VoiceCallAuthorityOperation[] = [
  "admit",
  "finalize",
];

export class FakeCallAuthority implements VoiceCallAuthorityVerifier {
  private readonly tokens = new Map<
    string,
    {
      claims: VoiceCallAuthorityClaims;
      expiresAt: number | undefined;
      allowedOperations: readonly VoiceCallAuthorityOperation[];
    }
  >();
  private readonly revoked = new Set<string>();
  private epochCounter = 0;

  /** Issues a fresh token resolving to the given session id. Defaults to a
   * freshly auto-incremented epoch, an undefined (non-recording-eligible)
   * scope, no expiry, and a token capable of both `admit` and `finalize`
   * unless overridden -- `allowedOperations` lets a test mint an
   * admission-only (or finalize-only) token to exercise the operation
   * separation `MediaWorkerServer` is required to enforce. */
  issue(
    sessionId: string,
    options: {
      principalId?: string;
      scope?: RecordingScope | undefined;
      epoch?: number;
      expiresAt?: number;
      allowedOperations?: readonly VoiceCallAuthorityOperation[];
    } = {},
  ): { token: string; claims: VoiceCallAuthorityClaims } {
    const token = `fake-call-authority-token-${randomUUID()}`;
    const epoch = options.epoch ?? ++this.epochCounter;
    const claims: VoiceCallAuthorityClaims = {
      principalId: options.principalId ?? "principal-default",
      sessionId,
      scope: options.scope,
      epoch,
    };
    this.tokens.set(token, {
      claims,
      expiresAt: options.expiresAt,
      allowedOperations: options.allowedOperations ?? BOTH_OPERATIONS,
    });
    return { token, claims };
  }

  /** Marks a previously issued token as revoked without removing its
   * claims, so a verify attempt can distinguish "revoked" from "unknown". */
  revoke(token: string): void {
    this.revoked.add(token);
  }

  async verifySessionAuthority(
    token: string,
    operation: VoiceCallAuthorityOperation,
  ): Promise<VoiceCallAuthorityClaims> {
    if (this.revoked.has(token)) {
      throw new VoiceCallAuthorityError(
        "VOICE_MEDIA_CALL_AUTHORITY_REVOKED",
        "This call-authority token has been revoked.",
      );
    }
    const record = this.tokens.get(token);
    if (!record) {
      throw new VoiceCallAuthorityError(
        "VOICE_MEDIA_CALL_AUTHORITY_INVALID",
        "Unknown or forged call-authority token.",
      );
    }
    if (record.expiresAt !== undefined && Date.now() > record.expiresAt) {
      throw new VoiceCallAuthorityError(
        "VOICE_MEDIA_CALL_AUTHORITY_EXPIRED",
        "This call-authority token has expired.",
      );
    }
    if (!record.allowedOperations.includes(operation)) {
      throw new VoiceCallAuthorityError(
        "VOICE_MEDIA_CALL_AUTHORITY_OPERATION_NOT_PERMITTED",
        `This call-authority token does not permit the '${operation}' operation.`,
      );
    }
    return record.claims;
  }
}
