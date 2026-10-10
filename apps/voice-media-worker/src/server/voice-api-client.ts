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

export interface GetSessionResult {
  session: {
    voiceSessionId: string;
    resourceScopeId: string;
    routeProfileVersion: number;
    leaseEpoch: number;
    sessionVersion: number;
  };
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

/**
 * AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-persist late-acceptance fence
 * (Codex reopen, canonical 2026-10-03T23:31:57Z): the single atomic
 * adjudication `reconcileUnresolvedCommit` (`dialogue-persist-port.ts`)
 * falls back to once its own bounded restoration-read polling exhausts
 * with nothing correlating observed -- see
 * `VoiceSessionService.resolveDialogueSnapshotOutcome`'s own doc for the
 * server-side atomicity this relies on.
 */
export interface ResolveDialogueSnapshotOutcomeCommand {
  expectedSessionVersion: number;
  inputEpoch: number;
  mediaEpoch: number;
  turnId: string;
}

/**
 * AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-resolve expired-content
 * resurrection (Codex reopen, canonical 2026-10-04T00:26:49Z): a third
 * shape, distinct from both `accepted: true` (with restorable content) and
 * `accepted: false` (durably voided) -- the exact pending write WAS
 * accepted (never falsely reported as rolled back), but its content has
 * already passed its own retention window server-side and is therefore not
 * returned as restorable/live content at all. Carries the same identifying
 * fields as a normal accepted snapshot (so the worker can still verify this
 * is genuinely an answer about ITS OWN pending write) but never `content`.
 */
export type ResolveDialogueSnapshotOutcomeResult =
  | {
      accepted: true;
      snapshot: PersistDialogueSnapshotResult["snapshot"];
    }
  | {
      accepted: true;
      expired: true;
      voiceSessionId: string;
      sessionVersion: number;
      inputEpoch: number;
      mediaEpoch: number;
      turnId: string;
      retentionExpiresAt: string;
    }
  | {
      accepted: false;
      /** AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-persist incomplete
       * discriminated response validation (Codex reopen, canonical
       * 2026-10-04T01:25:05Z): mirrors `VoiceSessionService
       * .resolveDialogueSnapshotOutcome`'s own doc -- a server-generated
       * correlation token, never a caller-supplied echo. This client-side
       * type is compile-time only (see `VoiceApiClient.request`'s own doc
       * on zero runtime validation); `classifyResolveOutcome`
       * (`dialogue-persist-port.ts`) is what actually enforces these
       * fields correlate before trusting this as confirmed non-acceptance. */
      voiceSessionId: string;
      sessionVersion: number;
      inputEpoch: number;
      mediaEpoch: number;
      turnId: string;
      fenceVersion: number;
    }
  | {
      /** AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-retention purge-receipt
       * lifecycle (Codex reopen, canonical 2026-10-04T02:13:45Z): mirrors
       * `VoiceSessionService.resolveDialogueSnapshotOutcome`'s own doc on
       * this fourth, genuinely indeterminate outcome. This client-side type
       * is compile-time only; `classifyResolveOutcome`
       * (`dialogue-persist-port.ts`) already treats any `accepted` value
       * other than the literals `true`/`false` as its own existing safe
       * `"unknown"` verdict -- bounded-retried, never trusted as either
       * acceptance or confirmed rejection -- with no code changes needed
       * there for this literal specifically. */
      accepted: "unknown";
      voiceSessionId: string;
      sessionVersion: number;
      inputEpoch: number;
      mediaEpoch: number;
      turnId: string;
    };

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
    // AUDIT-VOICE-APPLICATION-WIRING-20261003 R11 residual (Codex reopen,
    // canonical 2026-10-03T20:13:00Z): this workload-identity mint is the
    // FIRST await in this method, ahead of `request()`'s own already-bound
    // fetch/body stages below -- an uncooperative `workloadTokenSource`
    // (the real `GoogleMetadataIdentityTokenSource`'s metadata fetch/body,
    // or any double that ignores `signal`) previously left every caller
    // (`restoreBoundAttachment`, `recordAuthoritativeControlEvent`,
    // `createTrustedDialoguePersistPort`, ...) pending forever regardless
    // of `signal` firing, same class of gap `raceAgainstAbort` already
    // closed for `request()`'s own fetch/body stages.
    const workloadToken = await this.raceAgainstAbort(
      signal,
      this.workloadTokenSource.getToken(signal),
    );
    return this.request<VoiceCapabilityTokenEnvelope>(
      "POST",
      "/callcenter/voice/capabilities",
      workloadToken,
      command,
      signal,
    );
  }

  /**
   * AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-entry: resolves this
   * session's `resourceScopeId`/`routeProfileVersion`/`leaseEpoch`/
   * `sessionVersion` using ONLY this worker's own stage-1 workload
   * identity token -- never a capability token, since minting one
   * (`issueCapability` above) already requires the caller to supply
   * those same coordinates, and this is how a real `MediaWorkerServer`
   * admission (`resolveSessionBinding`) discovers them in the first
   * place to construct a `VoiceSessionBinding`. Rejects (never returns a
   * fabricated/default binding) when apps/api has no durable `voice.session`
   * row for this id -- e.g. the real, still-missing SD §4.1 provider
   * webhook never created one; the caller must treat that as "stay on
   * the fixture-only path for this attachment," not an admission failure.
   */
  async getSession(
    voiceSessionId: string,
    signal?: AbortSignal,
  ): Promise<GetSessionResult> {
    // R11 residual, same as `issueCapability` above.
    const workloadToken = await this.raceAgainstAbort(
      signal,
      this.workloadTokenSource.getToken(signal),
    );
    return this.request<GetSessionResult>(
      "GET",
      `/callcenter/voice/sessions/${encodeURIComponent(voiceSessionId)}`,
      workloadToken,
      undefined,
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

  /** AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-persist late-acceptance
   * fence: see `ResolveDialogueSnapshotOutcomeCommand`'s own doc. */
  async resolveDialogueSnapshotOutcome(
    sessionId: string,
    capabilityToken: string,
    command: ResolveDialogueSnapshotOutcomeCommand,
    signal?: AbortSignal,
  ): Promise<ResolveDialogueSnapshotOutcomeResult> {
    return this.request<ResolveDialogueSnapshotOutcomeResult>(
      "POST",
      `/callcenter/voice/sessions/${encodeURIComponent(sessionId)}/dialogue-snapshot/resolve`,
      capabilityToken,
      command,
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
  /** AUDIT-VOICE-APPLICATION-WIRING-20261003 R11/R12 boundedness residual
   * (Codex reopen, canonical 2026-10-03T19:24:15Z): handing `signal` to
   * `fetchImpl` and to `response.json()` and simply awaiting them is not
   * itself a bound -- an `await` only ever settles once the awaited
   * promise settles, and an uncooperative `fetchImpl` (a hung transport,
   * or a double that never checks `signal` at all) leaves every caller of
   * this method (`restoreBoundAttachment`, `resolveSessionBinding`'s own
   * callers, `recordAuthoritativeControlEvent`, `createTrustedDialogue
   * PersistPort`, ...) pending forever regardless of whatever fires
   * `signal`'s abort event. Races both awaits against `signal` itself,
   * exactly like `VoiceDialogueEngine.boundedStage` already does for the
   * engine's own stages, so every one of this client's callers settles on
   * schedule whether or not the underlying transport cooperates. An
   * orphaned `fetchImpl`/`response.json()` promise (if any) keeps running
   * harmlessly in the background -- its eventual settlement is never
   * awaited or acted on again. */
  private raceAgainstAbort<T>(
    signal: AbortSignal | undefined,
    operation: Promise<T>,
  ): Promise<T> {
    if (!signal) return operation;
    if (signal.aborted) {
      return Promise.reject(
        new Error(
          "voice_api_client_aborted: operation was already aborted before it could run.",
        ),
      );
    }
    return new Promise<T>((resolve, reject) => {
      const onAbort = () => {
        reject(
          new Error(
            "voice_api_client_aborted: operation did not settle before this bound's own abort fired.",
          ),
        );
      };
      signal.addEventListener("abort", onAbort, { once: true });
      operation.then(
        (value) => {
          signal.removeEventListener("abort", onAbort);
          resolve(value);
        },
        (error) => {
          signal.removeEventListener("abort", onAbort);
          reject(error);
        },
      );
    });
  }

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
      response = await this.raceAgainstAbort(
        signal,
        fetchImpl(new URL(path, this.config.baseUrl), {
          method,
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${bearerToken}`,
          },
          body: JSON.stringify(body),
          signal: signal ?? null,
        }),
      );
    } catch (err) {
      throw new VoiceApiError(
        "VOICE_API_UNREACHABLE",
        `Unable to reach apps/api at '${path}': ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    let parsed: unknown;
    try {
      parsed = await this.raceAgainstAbort(signal, response.json());
    } catch (err) {
      // A bound-driven abort (the body read itself hung past `signal`'s
      // own deadline/release) is not a parse failure -- it must still
      // surface as a clear, bounded failure, never be swallowed into a
      // `null` body that then crashes `response.ok` success handling
      // below with an unrelated TypeError.
      if (err instanceof Error && err.message.startsWith("voice_api_client_aborted")) {
        throw new VoiceApiError("VOICE_API_UNREACHABLE", err.message);
      }
      parsed = null;
    }

    if (!response.ok) {
      const envelope = (parsed ?? {}) as ApiErrorEnvelope;
      // AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-persist (Codex reopen,
      // canonical 2026-10-03T22:41:06Z, "every non-2xx is treated as a
      // trustworthy domain decision"): `envelope.error?.code` present means
      // apps/api itself parsed this exact request and returned a structured
      // domain decision (e.g. `VOICE_DRAFT_STALE`) -- that is real evidence
      // the write never landed. Its ABSENCE means this response carries no
      // structured error body at all: an intermediary (reverse proxy, load
      // balancer) returning a bare 502/504, or any other opaque/malformed
      // reply apps/api itself never produced. That case is exactly as
      // ambiguous as `VOICE_API_UNREACHABLE` -- a response being received
      // from *something* is not evidence the application ever saw, let
      // alone rejected, this request -- so it gets its own distinct code
      // instead of silently defaulting to the generic `VOICE_API_ERROR`
      // label, which `dialogue-persist-port.ts`'s `isDefinitiveRejection`
      // check must treat as ambiguous (reconcile), never as a confirmed
      // rejection (fail closed immediately).
      throw new VoiceApiError(
        envelope.error?.code ?? "VOICE_API_UNSTRUCTURED_RESPONSE",
        envelope.error?.message ?? `apps/api '${path}' returned HTTP ${response.status}.`,
      );
    }

    return (parsed as { data: T }).data;
  }
}
