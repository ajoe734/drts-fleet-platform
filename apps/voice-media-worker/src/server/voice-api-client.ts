import type {
  VoiceCapabilityScope,
  VoiceCapabilityTokenEnvelope,
  VoiceDialogueSnapshotContent,
} from "@drts/contracts";
import type { WorkloadIdentityTokenSource } from "./workload-identity-token-source";

/**
 * The first-party worker/API HTTP client SD §4.2/§10.1 already define
 * (Codex reopen round 5/6, R4) -- previously this worker "has no HTTP
 * client to call apps/api with" at all. Four routes this worker's own
 * dialogue turn loop needs are implemented: capability issuance, the CAS
 * input-resolution persist seam (`VoiceSessionService.resolveInput`), the
 * `request_handoff` tool gateway seam (`VoiceToolGatewayService.execute`
 * via `apps/api`'s `VoiceHandoffOnlyToolPorts`), and the ordered
 * control-event watermark seam (`VoiceSessionService.recordControlEvent`,
 * R4 residual) that durably advances the speech-start `inputEpoch`
 * `resolveInput` itself checks against. This is not a generic HTTP
 * client -- it has no method for any other SD §10.1 route, since nothing
 * in this worker's current composition calls one. `recordControlEvent`'s
 * own result is not yet consumed by `VoiceCallTurnCoordinator` to
 * reconcile this worker's process-local turn-sequencing counter against
 * the authoritative speech-start watermark -- that integration (and the
 * local/remote epoch-semantic split it requires) is scoped separately;
 * this client method exists so a future caller has a real seam to call
 * through rather than none at all.
 */
export class VoiceApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "VoiceApiError";
  }
}

export interface VoiceApiClientConfig {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

export interface IssueCapabilityCommand {
  voiceSessionId: string;
  resourceScopeId: string;
  routeProfileVersion: number;
  leaseEpoch: number;
  scopes: readonly VoiceCapabilityScope[];
  ttlSeconds?: number;
}

export interface ResolveInputCommand {
  expectedSessionVersion: number;
  inputEpoch: number;
  resolution: "relevant" | "irrelevant";
}

export interface ResolveInputResult {
  /** The real backend route (`VoiceBookingController#resolveInput`) already
   * returns the full `VoiceSessionRecord` -- `createTrustedDialoguePersistPort`
   * needs more than just `voiceSessionId`/`inputEpoch` to correlate a
   * response against the exact binding it issued the request for (Codex
   * reopen round 5/6, R4-persist residual, then round 13/the no-history-
   * rewrite successor's R4-persist finding): `resourceScopeId`,
   * `routeProfileVersion` and `leaseEpoch` must also match, or a response
   * that happens to carry the right `voiceSessionId`/`inputEpoch`/
   * `sessionVersion+1` but a foreign scope/route/lease could still be
   * silently accepted. */
  session: {
    voiceSessionId: string;
    sessionVersion: number;
    resourceScopeId: string;
    routeProfileVersion: number;
    leaseEpoch: number;
    inputEpoch: number;
    pendingInput: boolean;
  };
}

export interface PersistDialogueSnapshotCommand {
  expectedSessionVersion: number;
  inputEpoch: number;
  mediaEpoch: number;
  turnId: string;
  content: VoiceDialogueSnapshotContent;
}

export interface PersistDialogueSnapshotResult {
  snapshot: {
    snapshotId: string;
    voiceSessionId: string;
    sessionVersion: number;
    inputEpoch: number;
    mediaEpoch: number;
    turnId: string;
    content: VoiceDialogueSnapshotContent;
    createdAt: string;
    retentionExpiresAt: string;
  };
  deduped: boolean;
}

export interface DialogueSnapshotRestorationResult {
  session: {
    voiceSessionId: string;
    sessionVersion: number;
    resourceScopeId: string;
    routeProfileVersion: number;
    leaseEpoch: number;
    inputEpoch: number;
    pendingInput: boolean;
    /** SD §5.4's ordered control-event watermark (`VoiceSessionRecord.
     * lastAppliedControlSequence`, apps/api) -- `attach()`'s
     * `restoreBoundAttachment` seeds this attachment's own next
     * `recordControlEvent` `sequence` from `this value + 1` so a
     * restored/reattached session's control-stream numbering stays
     * contiguous with whatever a prior attachment already durably applied,
     * instead of every fresh `attach()` wrongly restarting at 1 (AUDIT-
     * VOICE-APPLICATION-WIRING-20261003 R4 residual). The real backend
     * route already returns the full session record, including this
     * field -- only this worker-side type was narrower than the actual
     * response. */
    lastAppliedControlSequence: number;
  };
  snapshot: PersistDialogueSnapshotResult["snapshot"] | null;
}

export interface RequestHandoffCommand {
  inputEpoch: number;
  deadlineMs?: number;
  output: unknown;
}

export interface RequestHandoffResult {
  results: ReadonlyArray<{
    status: "queued" | "connected" | "unavailable";
    handoffId: string | null;
  }>;
}

/** Mirrors `RecordControlEventCommand` (apps/api's
 * `voice-session.service.ts`) minus `voiceSessionId`/`leaseEpoch`, which
 * this client's `recordControlEvent` call already carries via the path and
 * the capability token respectively -- never a client-supplied body
 * field, same convention as `issueCapability`/`requestHandoff`. */
export interface RecordControlEventCommand {
  source: string;
  providerAccountId?: string;
  sourceEventId?: string;
  legId?: string;
  occurredAt: string;
  /** This attachment's own monotonic control-stream position (SD §5.4):
   * the caller must track and advance this per attachment, starting at 1
   * for the first event ever sent for a session -- `apps/api` fails this
   * event closed into a durably-buffered gap, never silently skipped, if
   * it does not arrive as the current contiguous next value. */
  sequence: number;
  mediaEpoch: number;
  eventType: string;
  payload?: unknown;
  payloadRef?: string;
}

export interface RecordControlEventResult {
  deduped: boolean;
  applied: boolean;
  gap: boolean;
  appliedThroughSequence: number;
  session: {
    voiceSessionId: string;
    sessionVersion: number;
    inputEpoch: number;
    pendingInput: boolean;
  };
}

interface ApiErrorEnvelope {
  error?: { code?: string; message?: string };
}

export class VoiceApiClient {
  constructor(
    private readonly config: VoiceApiClientConfig,
    private readonly workloadTokenSource: WorkloadIdentityTokenSource,
  ) {}

  /** Stage 1 (workload) + stage 2 (capability) of SD §4.2's exchange,
   * combined: mints this worker's own Google workload identity token,
   * then exchanges it for a short-lived, session-bound capability. */
  async issueCapability(
    command: IssueCapabilityCommand,
    signal?: AbortSignal,
  ): Promise<VoiceCapabilityTokenEnvelope> {
    const workloadToken = await this.workloadTokenSource.getToken(signal);
    return this.request<VoiceCapabilityTokenEnvelope>(
      "POST",
      "/callcenter/voice/capabilities",
      workloadToken,
      command,
      signal,
    );
  }

  async resolveInput(
    sessionId: string,
    capabilityToken: string,
    command: ResolveInputCommand,
    signal?: AbortSignal,
  ): Promise<ResolveInputResult> {
    return this.request<ResolveInputResult>(
      "POST",
      `/callcenter/voice/sessions/${encodeURIComponent(sessionId)}/input-resolutions`,
      capabilityToken,
      command,
      signal,
    );
  }

  /** SD §5.3/§5.4's ordered control-event watermark seam
   * (`VoiceSessionService.recordControlEvent`, Codex reopen round 5/6, R4
   * residual) -- durably applies one control event (speech-start, clear,
   * playback terminal, DTMF, owner/language switch) and, when it is the
   * next contiguous one, advances the session's authoritative
   * `inputEpoch`/`pendingInput` watermark that `resolveInput` above
   * actually checks against. See `RecordControlEventCommand.sequence`'s
   * own doc for the bootstrap/contiguity contract the caller must honor. */
  async recordControlEvent(
    sessionId: string,
    capabilityToken: string,
    command: RecordControlEventCommand,
    signal?: AbortSignal,
  ): Promise<RecordControlEventResult> {
    return this.request<RecordControlEventResult>(
      "POST",
      `/callcenter/voice/sessions/${encodeURIComponent(sessionId)}/events`,
      capabilityToken,
      command,
      signal,
    );
  }

  /** AUDIT-VOICE-APPLICATION-WIRING-20261003 R4: persists this turn's
   * versioned, encrypted dialogue-content snapshot through
   * `VoiceSessionService.persistDialogueSnapshot` (see that service
   * method's own doc and `infra/migrations/V0106__voice_dialogue_snapshot.sql`).
   * Always called with the SAME capability token issued for this turn's
   * `resolveInput` call above, immediately after it succeeds -- content is
   * never persisted by itself without a corresponding admitted CAS. */
  async persistDialogueSnapshot(
    sessionId: string,
    capabilityToken: string,
    command: PersistDialogueSnapshotCommand,
    signal?: AbortSignal,
  ): Promise<PersistDialogueSnapshotResult> {
    return this.request<PersistDialogueSnapshotResult>(
      "POST",
      `/callcenter/voice/sessions/${encodeURIComponent(sessionId)}/dialogue-snapshot`,
      capabilityToken,
      command,
      signal,
    );
  }

  /** Restoration read `VoiceCallTurnCoordinator.attach` uses to seed a bound
   * attachment's dialogue state and `VoiceSessionBinding.sessionVersion`
   * from authoritative truth instead of starting fresh/blank -- see
   * `VoiceSessionService.getDialogueSnapshotRestoration`'s own doc. */
  async getDialogueSnapshotRestoration(
    sessionId: string,
    capabilityToken: string,
    signal?: AbortSignal,
  ): Promise<DialogueSnapshotRestorationResult> {
    return this.request<DialogueSnapshotRestorationResult>(
      "GET",
      `/callcenter/voice/sessions/${encodeURIComponent(sessionId)}/dialogue-snapshot`,
      capabilityToken,
      undefined,
      signal,
    );
  }

  async requestHandoff(
    sessionId: string,
    capabilityToken: string,
    command: RequestHandoffCommand,
    signal?: AbortSignal,
  ): Promise<RequestHandoffResult> {
    return this.request<RequestHandoffResult>(
      "POST",
      `/callcenter/voice/sessions/${encodeURIComponent(sessionId)}/handoffs`,
      capabilityToken,
      command,
      signal,
    );
  }

  /** `signal` is forwarded to the real `fetch` so an in-flight request is
   * actually cancelled on abort, not merely ignored after the fact --
   * callers (e.g. `createTrustedDialoguePersistPort`) still must re-check
   * `signal.aborted` at every await boundary themselves, since an
   * already-settled promise cannot be un-resolved by a signal firing
   * afterward. */
  private async request<T>(
    method: string,
    path: string,
    bearerToken: string,
    body: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    const fetchImpl = this.config.fetchImpl ?? fetch;
    let response: Response;
    try {
      response = await fetchImpl(new URL(path, this.config.baseUrl), {
        method,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify(body),
        signal: signal ?? null,
      });
    } catch (err) {
      throw new VoiceApiError(
        "VOICE_API_UNREACHABLE",
        `Unable to reach apps/api at '${path}': ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      parsed = null;
    }

    if (!response.ok) {
      const envelope = (parsed ?? {}) as ApiErrorEnvelope;
      throw new VoiceApiError(
        envelope.error?.code ?? "VOICE_API_ERROR",
        envelope.error?.message ?? `apps/api '${path}' returned HTTP ${response.status}.`,
      );
    }

    return (parsed as { data: T }).data;
  }
}
