import { Body, Controller, Get, Headers, Post, Put } from "@nestjs/common";

import type {
  AuditLogRecord,
  UpsertApprovedOperatingAreasCommand,
  UpsertApprovedRoutesCommand,
  UpsertSafetyOperatorQualificationsCommand,
  UpsertVehicleEnrollmentsCommand,
  ValidateOperatingAreaPointCommand,
  ValidateRouteContainmentCommand,
} from "@drts/contracts";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { CurrentIdentity } from "../../common/auth";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { SandboxGovernanceService } from "./sandbox-governance.service";

@Controller("admin/sandbox-governance")
export class SandboxGovernanceController {
  constructor(
    private readonly sandboxGovernanceService: SandboxGovernanceService,
  ) {}

  @Get("operating-areas")
  listOperatingAreas(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      { items: this.sandboxGovernanceService.listOperatingAreas() },
      requestId,
    );
  }

  @Put("operating-areas")
  async updateOperatingAreas(
    @Body() command: UpsertApprovedOperatingAreasCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      {
        items: await this.sandboxGovernanceService.updateOperatingAreas(
          command,
          toAuditActor(identity),
          requestId,
        ),
      },
      requestId,
    );
  }

  @Get("routes")
  listRoutes(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      { items: this.sandboxGovernanceService.listRoutes() },
      requestId,
    );
  }

  @Put("routes")
  async updateRoutes(
    @Body() command: UpsertApprovedRoutesCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      {
        items: await this.sandboxGovernanceService.updateRoutes(
          command,
          toAuditActor(identity),
          requestId,
        ),
      },
      requestId,
    );
  }

  @Get("vehicle-enrollments")
  listVehicleEnrollments(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      { items: this.sandboxGovernanceService.listVehicleEnrollments() },
      requestId,
    );
  }

  @Put("vehicle-enrollments")
  async updateVehicleEnrollments(
    @Body() command: UpsertVehicleEnrollmentsCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      {
        items: await this.sandboxGovernanceService.updateVehicleEnrollments(
          command,
          toAuditActor(identity),
          requestId,
        ),
      },
      requestId,
    );
  }

  @Get("safety-operator-qualifications")
  listSafetyOperatorQualifications(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      {
        items:
          this.sandboxGovernanceService.listSafetyOperatorQualifications(),
      },
      requestId,
    );
  }

  @Put("safety-operator-qualifications")
  async updateSafetyOperatorQualifications(
    @Body() command: UpsertSafetyOperatorQualificationsCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      {
        items:
          await this.sandboxGovernanceService.updateSafetyOperatorQualifications(
            command,
            toAuditActor(identity),
            requestId,
          ),
      },
      requestId,
    );
  }

  @Post("validate-point")
  validatePoint(
    @Body() command: ValidateOperatingAreaPointCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.sandboxGovernanceService.validatePointInApprovedArea(command),
      requestId,
    );
  }

  @Post("validate-route")
  validateRoute(
    @Body() command: ValidateRouteContainmentCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.sandboxGovernanceService.validateRouteContainment(command),
      requestId,
    );
  }
}

function toAuditActor(identity: BootstrapRequestIdentity | null) {
  const actorType: AuditLogRecord["actorType"] =
    identity?.actorType === "driver_user"
      ? "ops_user"
      : (identity?.actorType ?? "system");
  return {
    actorId: identity?.actorId ?? null,
    actorType,
    tenantId: identity?.tenantId ?? null,
  };
}
