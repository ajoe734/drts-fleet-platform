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
   */
  @Post("capabilities")
  @RequireRealms("system")
  @RequireScopes("voice:capability:issue")
  issueCapability(
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
    @Headers("x-request-id") requestId?: string,
  ) {
    const scopes = body.scopes.map((scope) => VoiceCapabilityScopeSchema.parse(scope));
    const voiceCapabilityService = this.requireVoiceApplicationDependency(
      this.voiceCapabilityService,
      "voiceCapabilityService",
    );
    const envelope = voiceCapabilityService.issue(identity, {
      voiceSessionId: body.voiceSessionId,
      resourceScopeId: body.resourceScopeId,
      routeProfileVersion: body.routeProfileVersion,
      leaseEpoch: body.leaseEpoch,
      scopes,
      ...(body.ttlSeconds !== undefined ? { ttlSeconds: body.ttlSeconds } : {}),
    });
    return toApiSuccessEnvelope(envelope, requestId);
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
}
