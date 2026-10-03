/**
 * The exact identifiers SD §4.2's capability issuance (`IssueCapabilityCommand`)
 * and SD §10.1's session routes need, for one attachment. Only ever
 * supplied by a trusted call-admission flow -- the real
 * `apps/api/src/modules/cti-ivr` call-authority verifier
 * `../server.ts`/`../server/media-worker-server.ts` already document as
 * genuinely missing (Codex reopen round 5/6, R4). Nothing in this worker's
 * current production composition constructs one yet; it exists so the
 * trusted persist/tool-execution composition below has a real, typed
 * input to require, rather than inventing a placeholder identity the
 * moment one becomes available. `sessionVersion` is mutable -- each
 * trusted call both consumes the caller's current value and returns the
 * backend's new one, so a binding holder must always read/write it
 * through one single source of truth per attachment, never a stale copy.
 */
export interface VoiceSessionBinding {
  readonly voiceSessionId: string;
  readonly resourceScopeId: string;
  readonly routeProfileVersion: number;
  readonly leaseEpoch: number;
  sessionVersion: number;
}
