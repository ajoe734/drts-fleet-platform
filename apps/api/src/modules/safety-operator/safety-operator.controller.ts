import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from "@nestjs/common";

import type {
  CreateSafetyOperatorAssignmentCommand,
  CreateSafetyOperatorTripCloseoutCommand,
  EndSafetyOperatorShiftCommand,
  EngageSafetyOperatorAssignmentCommand,
  ReleaseSafetyOperatorAssignmentCommand,
  SafetyOperatorAssignmentStatus,
  SafetyOperatorShiftStatus,
  StartSafetyOperatorShiftCommand,
  SubmitSafetyOperatorPreTripChecklistCommand,
  SubmitSafetyOperatorTakeoverReportCommand,
} from "@drts/contracts";

import { toApiListData, toApiSuccessEnvelope } from "../../common/api-envelope";
import {
  CurrentIdentity,
  RequireRealms,
  RequireScopes,
  type BootstrapRequestIdentity,
} from "../../common/auth";
import { SafetyOperatorService } from "./safety-operator.service";

@Controller("safety-operator")
export class SafetyOperatorController {
  constructor(private readonly safetyOperatorService: SafetyOperatorService) {}

  @Get("qualification")
  @RequireRealms("system", "ops", "driver")
  @RequireScopes("driver:read")
  checkQualification(
    @Query("safetyOperatorId") safetyOperatorId: string | undefined,
    @Query("sandboxProgramId") sandboxProgramId: string | undefined,
    @Query("vehicleId") vehicleId: string | undefined,
    @Query("asOf") asOf: string | undefined,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.safetyOperatorService.checkQualification(
        {
          safetyOperatorId: safetyOperatorId ?? "",
          sandboxProgramId: sandboxProgramId ?? "",
          vehicleId: vehicleId ?? null,
          asOf: asOf ?? null,
        },
        identity,
      ),
      requestId,
    );
  }

  @Get("assignments")
  @RequireRealms("system", "ops", "driver")
  @RequireScopes("driver:read")
  listAssignments(
    @Query("safetyOperatorId") safetyOperatorId: string | undefined,
    @Query("vehicleId") vehicleId: string | undefined,
    @Query("status") status: SafetyOperatorAssignmentStatus | undefined,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const query = {
      ...(safetyOperatorId ? { safetyOperatorId } : {}),
      ...(vehicleId ? { vehicleId } : {}),
      ...(status ? { status } : {}),
    };

    return toApiSuccessEnvelope(
      toApiListData(
        this.safetyOperatorService.listAssignments(query, identity),
      ),
      requestId,
    );
  }

  @Post("assignments")
  @RequireRealms("system", "driver")
  @RequireScopes("driver:write")
  async createAssignment(
    @Body() command: CreateSafetyOperatorAssignmentCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.safetyOperatorService.createAssignment(
        command,
        identity,
        requestId,
      ),
      requestId,
    );
  }

  @Post("assignments/:assignmentId/engage")
  @RequireRealms("system", "driver")
  @RequireScopes("driver:write")
  async engageAssignment(
    @Param("assignmentId") assignmentId: string,
    @Body() command: EngageSafetyOperatorAssignmentCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.safetyOperatorService.engageAssignment(
        assignmentId,
        command,
        identity,
        requestId,
      ),
      requestId,
    );
  }

  @Post("assignments/:assignmentId/release")
  @RequireRealms("system", "driver")
  @RequireScopes("driver:write")
  async releaseAssignment(
    @Param("assignmentId") assignmentId: string,
    @Body() command: ReleaseSafetyOperatorAssignmentCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.safetyOperatorService.releaseAssignment(
        assignmentId,
        command,
        identity,
        requestId,
      ),
      requestId,
    );
  }

  @Get("shifts")
  @RequireRealms("system", "ops", "driver")
  @RequireScopes("driver:read")
  listShifts(
    @Query("safetyOperatorId") safetyOperatorId: string | undefined,
    @Query("deviceId") deviceId: string | undefined,
    @Query("status") status: SafetyOperatorShiftStatus | undefined,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const query = {
      ...(safetyOperatorId ? { safetyOperatorId } : {}),
      ...(deviceId ? { deviceId } : {}),
      ...(status ? { status } : {}),
    };

    return toApiSuccessEnvelope(
      toApiListData(this.safetyOperatorService.listShifts(query, identity)),
      requestId,
    );
  }

  @Post("shifts/start")
  @RequireRealms("system", "driver")
  @RequireScopes("driver:write")
  async startShift(
    @Body() command: StartSafetyOperatorShiftCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.safetyOperatorService.startShift(command, identity, requestId),
      requestId,
    );
  }

  @Post("shifts/:shiftId/end")
  @RequireRealms("system", "driver")
  @RequireScopes("driver:write")
  async endShift(
    @Param("shiftId") shiftId: string,
    @Body() command: EndSafetyOperatorShiftCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.safetyOperatorService.endShift(
        shiftId,
        command,
        identity,
        requestId,
      ),
      requestId,
    );
  }

  @Get("pre-trip-checklists")
  @RequireRealms("system", "ops", "driver")
  @RequireScopes("driver:read")
  listPreTripChecklists(
    @Query("safetyOperatorId") safetyOperatorId: string | undefined,
    @Query("vehicleId") vehicleId: string | undefined,
    @Query("shiftId") shiftId: string | undefined,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const query = {
      ...(safetyOperatorId ? { safetyOperatorId } : {}),
      ...(vehicleId ? { vehicleId } : {}),
      ...(shiftId ? { shiftId } : {}),
    };

    return toApiSuccessEnvelope(
      toApiListData(
        this.safetyOperatorService.listPreTripChecklists(query, identity),
      ),
      requestId,
    );
  }

  @Post("pre-trip-checklists")
  @RequireRealms("system", "driver")
  @RequireScopes("driver:write")
  async submitPreTripChecklist(
    @Body() command: SubmitSafetyOperatorPreTripChecklistCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.safetyOperatorService.submitPreTripChecklist(
        command,
        identity,
        requestId,
      ),
      requestId,
    );
  }

  @Get("takeover-reports")
  @RequireRealms("system", "ops", "driver")
  @RequireScopes("driver:read")
  listTakeoverReports(
    @Query("safetyOperatorId") safetyOperatorId: string | undefined,
    @Query("vehicleId") vehicleId: string | undefined,
    @Query("correlationId") correlationId: string | undefined,
    @Query("clientGeneratedReportId")
    clientGeneratedReportId: string | undefined,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const query = {
      ...(safetyOperatorId ? { safetyOperatorId } : {}),
      ...(vehicleId ? { vehicleId } : {}),
      ...(correlationId ? { correlationId } : {}),
      ...(clientGeneratedReportId ? { clientGeneratedReportId } : {}),
    };

    return toApiSuccessEnvelope(
      toApiListData(
        this.safetyOperatorService.listTakeoverReports(query, identity),
      ),
      requestId,
    );
  }

  @Post("takeover-reports")
  @RequireRealms("system", "driver")
  @RequireScopes("driver:write")
  async submitTakeoverReport(
    @Body() command: SubmitSafetyOperatorTakeoverReportCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.safetyOperatorService.submitTakeoverReport(
        command,
        identity,
        requestId,
      ),
      requestId,
    );
  }

  @Get("trip-closeouts")
  @RequireRealms("system", "ops", "driver")
  @RequireScopes("driver:read")
  listTripCloseouts(
    @Query("safetyOperatorId") safetyOperatorId: string | undefined,
    @Query("vehicleId") vehicleId: string | undefined,
    @Query("assignmentId") assignmentId: string | undefined,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const query = {
      ...(safetyOperatorId ? { safetyOperatorId } : {}),
      ...(vehicleId ? { vehicleId } : {}),
      ...(assignmentId ? { assignmentId } : {}),
    };

    return toApiSuccessEnvelope(
      toApiListData(
        this.safetyOperatorService.listTripCloseouts(query, identity),
      ),
      requestId,
    );
  }

  @Post("trip-closeouts")
  @RequireRealms("system", "driver")
  @RequireScopes("driver:write")
  async createTripCloseout(
    @Body() command: CreateSafetyOperatorTripCloseoutCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.safetyOperatorService.createTripCloseout(
        command,
        identity,
        requestId,
      ),
      requestId,
    );
  }
}
