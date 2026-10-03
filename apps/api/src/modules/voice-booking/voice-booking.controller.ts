import {
  Body,
  Controller,
  Get,
  Headers,
  Optional,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { VoiceCapabilityScopeSchema, type VoiceCapabilityScope } from "@drts/contracts";

import { ApiRequestError, toApiSuccessEnvelope } from "../../common/api-envelope";
import { OpenRoute, RequireRealms, RequireScopes, CurrentIdentity } from "../../common/auth";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { IdempotencyService } from "../../common/idempotency";
import {
  VoiceCapabilityService,
  assertVoiceCapabilityScope,
} from "../../common/auth/voice-capability.service";
import { VoiceCapabilityGuard } from "../../common/auth/voice-capability.guard";
import { VoiceBookingMetricsService, type CohortEvaluationFilter } from "../../observability/voice-booking-metrics.service";
import {
  VoiceUsageService,
  type ProviderInvoiceLineItem,
  type VoiceUsageServiceType,
} from "./voice-usage.service";
import { VoiceCommandRunnerService } from "./voice-command-runner.service";
import { VoiceSessionService, type InputResolution } from "./voice-session.service";
import { VoiceBookingRepository } from "./voice-booking.repository";
import { VoiceBookingAuthorizationService } from "./voice-booking-authorization.service";
import { VoiceHandoffService } from "./voice-handoff.service";
import { VoiceToolGatewayService } from "./voice-tool-gateway.service";
import { VoiceHandoffOnlyToolPorts } from "./voice-handoff-tool-ports";

const DEFAULT_TOOL_TURN_TIMEOUT_MS = 8_000;
const MAX_TOOL_TURN_TIMEOUT_MS = 30_000;

@Controller("callcenter/voice")
export class VoiceBookingController {
  constructor(
    private readonly voiceBookingMetricsService: VoiceBookingMetricsService,
    private readonly voiceUsageService: VoiceUsageService,
    @Optional()
    private readonly voiceCommandRunnerService?: VoiceCommandRunnerService,
    @Optional()
    private readonly voiceCapabilityService?: VoiceCapabilityService,
    @Optional()
    private readonly voiceCapabilityGuard?: VoiceCapabilityGuard,
    @Optional()
    private readonly voiceSessionService?: VoiceSessionService,
    @Optional()
    private readonly voiceBookingRepository?: VoiceBookingRepository,
    @Optional()
    private readonly voiceBookingAuthorizationService?: VoiceBookingAuthorizationService,
    @Optional()
    private readonly voiceHandoffService?: VoiceHandoffService,
    @Optional()
    private readonly idempotencyService?: IdempotencyService,
  ) {}

  /**
   * `voiceCapabilityService`/`voiceCapabilityGuard`/`voiceSessionService`/
   * `voiceBookingRepository`/`voiceBookingAuthorizationService`/
   * `voiceHandoffService` are `@Optional()` only so this controller keeps
   * constructing in call sites (legacy unit tests outside this task's
   * write scope) that predate the SD §4.2/§10.1 routes below and only
   * exercise `repairWorkItem`. The real module (`voice-booking.module.ts`)
   * always provides them; this guard fails closed instead of masking an
   * actually-missing dependency as a silent no-op.
   */
  private requireVoiceApplicationDependency<T>(
    value: T | undefined,
    name: string,
  ): T {
    if (value === undefined) {
      throw new ApiRequestError(
        500,
        "VOICE_APPLICATION_DEPENDENCY_UNAVAILABLE",
        `Voice application dependency '${name}' is unavailable.`,
      );
    }
    return value;
  }

  @Get("metrics/cohort")
  @RequireRealms("ops", "platform")
  async getCohortMetrics(
    @Query("windowStart") windowStart?: string,
    @Query("windowEnd") windowEnd?: string,
    @Query("language") language?: string,
    @Query("routeProfileVersion") routeProfileVersion?: string,
    @Query("provider") provider?: string,
    @Query("brandId") brandId?: string,
    @Query("bookingRole") bookingRole?: "self" | "proxy",
    @Query("lineBindingId") lineBindingId?: string,
    @Query("observationWindowClosed") observationWindowClosed?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const filter: CohortEvaluationFilter = {
      windowStart: windowStart ?? new Date(Date.now() - 86400000).toISOString(),
      windowEnd: windowEnd ?? new Date().toISOString(),
      observationWindowClosed: observationWindowClosed !== "false",
      language,
      routeProfileVersion: routeProfileVersion ? Number(routeProfileVersion) : undefined,
      provider,
      brandId,
      bookingRole,
      lineBindingId,
    };

    const report = await this.voiceBookingMetricsService.deriveCohortFromDurableEvidence(filter);

    return toApiSuccessEnvelope(report, requestId);
  }

  @Get("usage/records")
  @RequireRealms("ops", "platform")
  listUsageRecords(
    @Query("voiceSessionId") voiceSessionId?: string,
    @Query("admissionId") admissionId?: string,
    @Query("brandId") brandId?: string,
    @Query("provider") provider?: string,
    @Query("serviceType") serviceType?: VoiceUsageServiceType,
    @Query("usageDate") usageDate?: string,
    @Query("language") language?: string,
    @Query("windowStart") windowStart?: string,
    @Query("windowEnd") windowEnd?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const records = this.voiceUsageService.listUsageRecords({
      voiceSessionId,
      admissionId,
      brandId,
      provider,
      serviceType,
      usageDate,
      language,
      windowStart,
      windowEnd,
    });

    return toApiSuccessEnvelope({ items: records }, requestId);
  }

  @Get("usage/rate-cards")
  @RequireRealms("ops", "platform")
  listRateCards(@Headers("x-request-id") requestId?: string) {
    const cards = this.voiceUsageService.listRateCards();
    return toApiSuccessEnvelope({ items: cards }, requestId);
  }

  @Post("usage/reconcile")
  @RequireRealms("ops", "platform")
  reconcileInvoice(
    @Body()
    body: {
      invoiceRef: string;
      providerAccountId: string;
      invoiceLines: ProviderInvoiceLineItem[];
    },
    @Headers("idempotency-key") _idempotencyKey?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const report = this.voiceUsageService.reconcileInvoice(
      body.invoiceRef,
      body.providerAccountId,
      body.invoiceLines,
    );

    return toApiSuccessEnvelope(report, requestId);
  }

  @Post("work-items/:workId/repair")
  @RequireRealms("ops", "platform")
  async repairWorkItem(
    @Param("workId") workId: string,
    @Body()
    body: {
      requestId?: string;
      actorId: string;
      reason: string;
      expectedLeaseEpoch: number;
      allocatedMaxAttempts?: number;
    },
    @Headers("x-request-id") headerRequestId?: string,
  ) {
    if (!this.voiceCommandRunnerService) {
      throw new ApiRequestError(
        500,
        "RUNNER_SERVICE_UNAVAILABLE",
        "Voice command runner service is unavailable.",
      );
    }

    const effectiveRequestId =
      body.requestId?.trim() || headerRequestId || `req-${Date.now()}`;

    const result = await this.voiceCommandRunnerService.repairFailedWorkItem({
      workId,
      requestId: effectiveRequestId,
      actorId: body.actorId,
      reason: body.reason,
      expectedLeaseEpoch: body.expectedLeaseEpoch,
      allocatedMaxAttempts: body.allocatedMaxAttempts,
    });

    return toApiSuccessEnvelope(result, headerRequestId);
  }

  /**
   * SD §4.2 stage 2: exchanges an already-authenticated workload service
   * principal (stage 1, `BootstrapAuthGuard`/`JwtAuthService` -- a Google
   * workload-identity-verified or dev-bootstrap `actorType=system`
   * identity holding `voice:capability:issue`) for a short-lived,
   * session-bound `voice-tool-gateway` capability token. This is the
   * issuance call site that previously did not exist anywhere in
   * production code (Codex reopen round 5/6, R4) -- `VoiceCapabilityService.issue`
   * itself is unchanged; only this route is new.
   *
   * `issue()` is a stateless JWT mint (no repository write), so a retried
   * call with no key is harmless on its own -- but every other create-type
   * command in this codebase goes through `IdempotencyService`
   * (`tests/security/idempotency-regression-guard.test.ts`,
   * CONF-VERIFY-001), and this worker's own `VoiceApiClient` is a real
   * network caller that can legitimately retry after a timeout without
   * knowing whether the first attempt's response was lost. `required:
   * false` keeps today's caller (which sends no key yet) working
   * unchanged, while a future caller that does supply one gets a real,
   * durable replay of the exact first response instead of a second,
   * independently-expiring token.
   */
  @Post("capabilities")
  @RequireRealms("system")
  @RequireScopes("voice:capability:issue")
  async issueCapability(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Body()
    body: {
      voiceSessionId: string;
      resourceScopeId: string;
      routeProfileVersion: number;
      leaseEpoch: number;
      scopes: VoiceCapabilityScope[];
      ttlSeconds?: number;
    },
    @Headers("idempotency-key") idempotencyKey?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const scopes = body.scopes.map((scope) => VoiceCapabilityScopeSchema.parse(scope));
    const voiceCapabilityService = this.requireVoiceApplicationDependency(
      this.voiceCapabilityService,
      "voiceCapabilityService",
    );
    const idempotencyService = this.requireVoiceApplicationDependency(
      this.idempotencyService,
      "idempotencyService",
    );
    const command = {
      voiceSessionId: body.voiceSessionId,
      resourceScopeId: body.resourceScopeId,
      routeProfileVersion: body.routeProfileVersion,
      leaseEpoch: body.leaseEpoch,
      scopes,
      ...(body.ttlSeconds !== undefined ? { ttlSeconds: body.ttlSeconds } : {}),
    };
    const result = await idempotencyService.execute({
      scope: "voice:capability:issue",
      idempotencyKey,
      required: false,
      requestPath: "callcenter/voice/capabilities",
      payload: command,
      execute: async () => ({
        data: voiceCapabilityService.issue(identity, command),
      }),
    });
    return toApiSuccessEnvelope(result.data, requestId);
  }

  /**
   * SD §10.1 `GET /sessions/{sessionId}`: the stage-1-workload-
   * authenticated read `MediaWorkerServer`'s own admission path
   * (`resolveSessionBinding`, apps/voice-media-worker) uses to resolve a
   * `VoiceSessionBinding` for a call-authority-admitted session, BEFORE it
   * holds any `voice:capability:issue` token for it -- minting one via
   * `issueCapability` above already requires the caller to supply
   * `resourceScopeId`/`routeProfileVersion`/`leaseEpoch`, so it cannot be
   * how a worker first discovers them (AUDIT-VOICE-APPLICATION-WIRING-
   * 20261003 R4-entry). Authenticated exactly like `issueCapability`
   * (stage-1 workload identity via the standard JWT/realm/scope guards,
   * reusing its `voice:capability:issue` scope rather than minting a new
   * scope definition this task's write_scopes does not cover) -- never the
   * `VoiceCapabilityGuard` used by the routes below, since an attachment
   * that has not minted any capability yet is exactly the caller this
   * route exists for. A session id with no durable row (e.g. the real,
   * still-missing SD §4.1 provider webhook never created one) is reported
   * the same way every other session route here already does -- never a
   * fabricated binding.
   */
  @Get("sessions/:sessionId")
  @RequireRealms("system")
  @RequireScopes("voice:capability:issue")
  async getSession(
    @Param("sessionId") sessionId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const voiceSessionService = this.requireVoiceApplicationDependency(
      this.voiceSessionService,
      "voiceSessionService",
    );
    const session = await voiceSessionService.getSession(sessionId);
    return toApiSuccessEnvelope({ session }, requestId);
  }

  /**
   * Backs `VoiceDialoguePersistPort`'s `mode: "trusted"` seam
   * (apps/voice-media-worker/src/dialogue/dialogue-persist-port.ts): a
   * turn's CAS-bound input resolution, authenticated by the SD §4.2
   * capability (`VoiceCapabilityGuard`), never by this route's own bearer
   * token claims being trusted blindly -- `VoiceCapabilityGuard.authenticate`
   * re-verifies signature/issuer/audience/expiry and the resolved
   * `voiceSessionId` must match the path; `VoiceSessionService.resolveInput`
   * itself re-checks `expectedSessionVersion`/`inputEpoch` CAS and rejects
   * (never silently no-ops) on a stale caller.
   */
  @Post("sessions/:sessionId/input-resolutions")
  @OpenRoute()
  async resolveInput(
    @Param("sessionId") sessionId: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body()
    body: {
      expectedSessionVersion: number;
      inputEpoch: number;
      resolution: InputResolution;
    },
    @Headers("x-request-id") requestId?: string,
  ) {
    const voiceCapabilityGuard = this.requireVoiceApplicationDependency(
      this.voiceCapabilityGuard,
      "voiceCapabilityGuard",
    );
    const voiceSessionService = this.requireVoiceApplicationDependency(
      this.voiceSessionService,
      "voiceSessionService",
    );
    const claims = await voiceCapabilityGuard.authenticate(headers);
    if (claims.voiceSessionId !== sessionId) {
      throw new ApiRequestError(
        403,
        "VOICE_SESSION_NOT_OWNER",
        "Voice capability is bound to a different session id.",
      );
    }
    assertVoiceCapabilityScope(claims, "session_execute");
    const session = await voiceSessionService.resolveInput(
      sessionId,
      body.expectedSessionVersion,
      body.inputEpoch,
      body.resolution,
    );
    return toApiSuccessEnvelope({ session }, requestId);
  }

  /**
   * SD §5.3/§5.4/§10.1 `POST /sessions/{sessionId}/events`: durably applies
   * one control-plane event (speech-start, clear, playback terminal, DTMF,
   * owner/language switch) to the session's ordered-event watermark.
   * `VoiceSessionService.recordControlEvent` (SD §5.4) already implements
   * the full dedup/gap/bootstrap/speech-start-watermark machinery this
   * route only exposes -- Codex reopen round 5/6, R4: this worker had no
   * route or client to reach it at all, so the durable speech-start
   * watermark `VoiceSessionService.resolveInput` (above) actually checks
   * against never advanced for any real call. Authenticated the same way
   * as `resolveInput`: the SD §4.2 capability, re-verified here, not this
   * route's own bearer claims trusted blindly, and `leaseEpoch` is always
   * the capability's own bound value -- never a caller-supplied body field
   * -- so a superseded lease can never durably push this watermark
   * forward.
   */
  @Post("sessions/:sessionId/events")
  @OpenRoute()
  async recordControlEvent(
    @Param("sessionId") sessionId: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body()
    body: {
      source: string;
      providerAccountId?: string;
      sourceEventId?: string;
      legId?: string;
      occurredAt: string;
      sequence: number;
      mediaEpoch: number;
      eventType: string;
      payload?: unknown;
      payloadRef?: string;
    },
    @Headers("x-request-id") requestId?: string,
  ) {
    const voiceCapabilityGuard = this.requireVoiceApplicationDependency(
      this.voiceCapabilityGuard,
      "voiceCapabilityGuard",
    );
    const voiceSessionService = this.requireVoiceApplicationDependency(
      this.voiceSessionService,
      "voiceSessionService",
    );
    const claims = await voiceCapabilityGuard.authenticate(headers);
    if (claims.voiceSessionId !== sessionId) {
      throw new ApiRequestError(
        403,
        "VOICE_SESSION_NOT_OWNER",
        "Voice capability is bound to a different session id.",
      );
    }
    assertVoiceCapabilityScope(claims, "session_execute");
    const result = await voiceSessionService.recordControlEvent({
      voiceSessionId: sessionId,
      legId: body.legId ?? null,
      source: body.source,
      providerAccountId: body.providerAccountId ?? null,
      sourceEventId: body.sourceEventId ?? null,
      occurredAt: body.occurredAt,
      sequence: body.sequence,
      mediaEpoch: body.mediaEpoch,
      leaseEpoch: claims.leaseEpoch,
      eventType: body.eventType,
      payload: body.payload,
      payloadRef: body.payloadRef ?? null,
    });
    return toApiSuccessEnvelope(
      {
        deduped: result.deduped,
        applied: result.applied,
        gap: result.gap,
        appliedThroughSequence: result.appliedThroughSequence,
        session: result.session,
      },
      requestId,
    );
  }

  /**
   * Backs `VoiceCallTurnCoordinator.executeTools`'s (apps/voice-media-worker)
   * only real tool outcome, `request_handoff`, through the actual
   * `VoiceToolGatewayService.execute` repair anchor (Codex reopen round
   * 5/6, R4) instead of leaving it an unconsumed interface. `headers` is
   * forwarded as-is to the gateway, which re-authenticates the capability
   * itself (`this.guard.authenticate`) on every proposal, immediately
   * before and after calling the domain port -- this route performs no
   * authorization decision of its own.
   */
  @Post("sessions/:sessionId/handoffs")
  @OpenRoute()
  async requestHandoff(
    @Param("sessionId") sessionId: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body()
    body: {
      inputEpoch: number;
      deadlineMs?: number;
      output: unknown;
    },
    @Headers("x-request-id") requestId?: string,
  ) {
    // Defense in depth, same as `resolveInput` above: the gateway itself
    // re-authenticates the capability per-proposal regardless, but a
    // mismatched path/token pair is rejected before any proposal runs.
    const voiceCapabilityGuard = this.requireVoiceApplicationDependency(
      this.voiceCapabilityGuard,
      "voiceCapabilityGuard",
    );
    const voiceBookingRepository = this.requireVoiceApplicationDependency(
      this.voiceBookingRepository,
      "voiceBookingRepository",
    );
    const voiceBookingAuthorizationService = this.requireVoiceApplicationDependency(
      this.voiceBookingAuthorizationService,
      "voiceBookingAuthorizationService",
    );
    const voiceHandoffService = this.requireVoiceApplicationDependency(
      this.voiceHandoffService,
      "voiceHandoffService",
    );
    const claims = await voiceCapabilityGuard.authenticate(headers);
    if (claims.voiceSessionId !== sessionId) {
      throw new ApiRequestError(
        403,
        "VOICE_SESSION_NOT_OWNER",
        "Voice capability is bound to a different session id.",
      );
    }
    const deadlineMs = Math.min(
      body.deadlineMs ?? DEFAULT_TOOL_TURN_TIMEOUT_MS,
      MAX_TOOL_TURN_TIMEOUT_MS,
    );
    const signal = AbortSignal.timeout(deadlineMs + 1_000);
    const gateway = new VoiceToolGatewayService(
      voiceCapabilityGuard,
      voiceBookingRepository,
      voiceBookingAuthorizationService,
      new VoiceHandoffOnlyToolPorts(
        voiceBookingRepository,
        voiceHandoffService,
      ),
      {
        headers,
        inputEpoch: body.inputEpoch,
        deadline: Date.now() + deadlineMs,
        signal,
      },
    );
    const results = await gateway.execute(body.output);
    return toApiSuccessEnvelope({ results }, requestId);
  }

  /**
   * AUDIT-VOICE-APPLICATION-WIRING-20261003 R4: persists this turn's
   * versioned, encrypted dialogue-content snapshot --
   * `VoiceSessionService.persistDialogueSnapshot`'s own doc and
   * `infra/migrations/V0106__voice_dialogue_snapshot.sql` have the full
   * fencing/encryption/retention contract. Authenticated identically to
   * `resolveInput`/`events` above; `resourceScopeId`/`routeProfileVersion`/
   * `leaseEpoch` are always the capability's own bound values -- never
   * caller-supplied body fields -- so a snapshot can never be recorded
   * against a scope/route/lease this capability does not actually hold.
   */
  @Post("sessions/:sessionId/dialogue-snapshot")
  @OpenRoute()
  async persistDialogueSnapshot(
    @Param("sessionId") sessionId: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body()
    body: {
      expectedSessionVersion: number;
      inputEpoch: number;
      mediaEpoch: number;
      turnId: string;
      content: unknown;
    },
    @Headers("x-request-id") requestId?: string,
  ) {
    const voiceCapabilityGuard = this.requireVoiceApplicationDependency(
      this.voiceCapabilityGuard,
      "voiceCapabilityGuard",
    );
    const voiceSessionService = this.requireVoiceApplicationDependency(
      this.voiceSessionService,
      "voiceSessionService",
    );
    const claims = await voiceCapabilityGuard.authenticate(headers);
    if (claims.voiceSessionId !== sessionId) {
      throw new ApiRequestError(
        403,
        "VOICE_SESSION_NOT_OWNER",
        "Voice capability is bound to a different session id.",
      );
    }
    assertVoiceCapabilityScope(claims, "session_execute");
    const result = await voiceSessionService.persistDialogueSnapshot({
      voiceSessionId: sessionId,
      expectedSessionVersion: body.expectedSessionVersion,
      expectedLeaseEpoch: claims.leaseEpoch,
      expectedResourceScopeId: claims.resourceScopeId,
      expectedRouteProfileVersion: claims.routeProfileVersion,
      inputEpoch: body.inputEpoch,
      mediaEpoch: body.mediaEpoch,
      turnId: body.turnId,
      content: body.content,
    });
    return toApiSuccessEnvelope(result, requestId);
  }

  /**
   * Restoration read `VoiceCallTurnCoordinator.attach` (worker side) uses to
   * seed a bound attachment's dialogue state and
   * `VoiceSessionBinding.sessionVersion` from authoritative truth instead of
   * starting fresh/blank -- see
   * `VoiceSessionService.getDialogueSnapshotRestoration`'s own doc. Same
   * capability/scope boundary as every other session route above.
   */
  @Get("sessions/:sessionId/dialogue-snapshot")
  @OpenRoute()
  async getDialogueSnapshot(
    @Param("sessionId") sessionId: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Headers("x-request-id") requestId?: string,
  ) {
    const voiceCapabilityGuard = this.requireVoiceApplicationDependency(
      this.voiceCapabilityGuard,
      "voiceCapabilityGuard",
    );
    const voiceSessionService = this.requireVoiceApplicationDependency(
      this.voiceSessionService,
      "voiceSessionService",
    );
    const claims = await voiceCapabilityGuard.authenticate(headers);
    if (claims.voiceSessionId !== sessionId) {
      throw new ApiRequestError(
        403,
        "VOICE_SESSION_NOT_OWNER",
        "Voice capability is bound to a different session id.",
      );
    }
    assertVoiceCapabilityScope(claims, "session_execute");
    const result =
      await voiceSessionService.getDialogueSnapshotRestoration(sessionId);
    return toApiSuccessEnvelope(result, requestId);
  }
}
