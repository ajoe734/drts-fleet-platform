import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  Post,
  Query,
} from "@nestjs/common";

import type { QuizSubmissionCommand } from "@drts/contracts";
import { SYSTEM_REMEDIATION_ERROR_CODES } from "@drts/contracts";

import {
  ApiRequestError,
  toApiListData,
  toApiSuccessEnvelope,
} from "../../common/api-envelope";
import {
  CurrentIdentity,
  RequireRealms,
  RequireScopes,
  isDriverIdentityMatching,
  normalizeDriverId,
  type BootstrapRequestIdentity,
} from "../../common/auth";
import { AcademyService } from "./academy.service";

function requireDriverId(identity: BootstrapRequestIdentity | null): string {
  const driverId =
    identity?.realm === "driver" ? normalizeDriverId(identity.actorId) : null;
  if (!driverId) {
    throw new ApiRequestError(
      HttpStatus.UNAUTHORIZED,
      "DRIVER_IDENTITY_REQUIRED",
      "A driver identity is required for this operation.",
    );
  }
  return driverId;
}

/**
 * Resolves and enforces the fleet-partner tenant boundary
 * (feature-contracts.md §3.2 Resource Constraint: kind: "tenant", tenant
 * boundary). A `tenant` realm caller may only ever see their own
 * fleetPartnerId (identity.tenantId); `platform`/`ops`/`system` callers have
 * global visibility, matching the Platform Ops row's 全域 scope.
 */
function resolveFleetPartnerId(
  identity: BootstrapRequestIdentity | null,
  requested: string | undefined,
): string {
  if (identity?.realm === "tenant") {
    const own = identity.tenantId?.trim();
    if (!own) {
      throw new ApiRequestError(
        HttpStatus.UNAUTHORIZED,
        "TENANT_IDENTITY_REQUIRED",
        "A tenant identity is required for this operation.",
      );
    }
    if (requested && requested.trim() !== own) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        SYSTEM_REMEDIATION_ERROR_CODES.ACADEMY_FORBIDDEN_FLEET_ACCESS,
        "Fleet partners may only access their own training data.",
        { requestedFleetPartnerId: requested, ownFleetPartnerId: own },
      );
    }
    return own;
  }

  const normalizedRequested = requested?.trim();
  if (!normalizedRequested) {
    throw new ApiRequestError(
      HttpStatus.BAD_REQUEST,
      "FLEET_PARTNER_ID_REQUIRED",
      "fleetPartnerId is required for fleet training endpoints.",
    );
  }
  return normalizedRequested;
}

@Controller("driver-academy")
export class DriverAcademyController {
  constructor(private readonly academyService: AcademyService) {}

  @Get("courses")
  @RequireRealms("system", "driver")
  @RequireScopes("driver:read")
  async listCourses(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const driverId =
      identity?.realm === "driver" ? normalizeDriverId(identity.actorId) : null;
    const items = await this.academyService.listCourses(driverId);
    return toApiSuccessEnvelope(toApiListData(items), requestId);
  }

  @Get("courses/:courseId")
  @RequireRealms("system", "driver")
  @RequireScopes("driver:read")
  async getCourse(
    @Param("courseId") courseId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.academyService.getCourseDetail(courseId),
      requestId,
    );
  }

  @Post("courses/:courseId/quiz/submit")
  @RequireRealms("system", "driver")
  @RequireScopes("driver:write")
  async submitQuiz(
    @Param("courseId") courseId: string,
    @Body() command: QuizSubmissionCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const driverId = requireDriverId(identity);
    return toApiSuccessEnvelope(
      await this.academyService.submitQuiz(courseId, driverId, command),
      requestId,
    );
  }

  @Get("records")
  @RequireRealms("system", "driver")
  @RequireScopes("driver:read")
  async listRecords(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const driverId = requireDriverId(identity);
    const items = await this.academyService.listRecords(driverId);
    return toApiSuccessEnvelope(toApiListData(items), requestId);
  }

  @Get("courses/:courseId/attempts/:attemptId")
  @RequireRealms("system", "driver")
  @RequireScopes("driver:read")
  async getAttempt(
    @Param("attemptId") attemptId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const driverId = requireDriverId(identity);
    const attempt = await this.academyService.getAttempt(attemptId);
    if (!isDriverIdentityMatching(driverId, attempt.driverId)) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        SYSTEM_REMEDIATION_ERROR_CODES.ATTEMPT_NOT_FOUND,
        "Attempt not found.",
        { attemptId },
      );
    }
    return toApiSuccessEnvelope(attempt, requestId);
  }
}

@Controller("fleet-partner/training")
export class FleetPartnerTrainingController {
  constructor(private readonly academyService: AcademyService) {}

  @Get("summary")
  @RequireRealms("system", "platform", "tenant", "ops")
  @RequireScopes("reports:read")
  async summary(
    @Query("fleetPartnerId") fleetPartnerId: string | undefined,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const resolved = resolveFleetPartnerId(identity, fleetPartnerId);
    return toApiSuccessEnvelope(
      await this.academyService.fleetTrainingSummary(resolved),
      requestId,
    );
  }

  @Get("roster")
  @RequireRealms("system", "platform", "tenant", "ops")
  @RequireScopes("reports:read")
  async roster(
    @Query("fleetPartnerId") fleetPartnerId: string | undefined,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const resolved = resolveFleetPartnerId(identity, fleetPartnerId);
    const items = await this.academyService.fleetRoster(resolved);
    return toApiSuccessEnvelope(toApiListData(items), requestId);
  }

  @Get("drivers/:driverId/attempts/:attemptId")
  @RequireRealms("system", "platform", "tenant", "ops")
  @RequireScopes("reports:read")
  async driverAttempt(
    @Param("driverId") driverId: string,
    @Param("attemptId") attemptId: string,
    @Query("fleetPartnerId") fleetPartnerId: string | undefined,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const resolved = resolveFleetPartnerId(identity, fleetPartnerId);
    return toApiSuccessEnvelope(
      await this.academyService.fleetAttemptDrilldown(
        resolved,
        driverId,
        attemptId,
      ),
      requestId,
    );
  }
}
