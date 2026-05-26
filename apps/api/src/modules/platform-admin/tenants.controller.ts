import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";

import type {
  AcknowledgeTenantRoleCommand,
  AdvanceTenantRolloutCommand,
  CreatePlatformTenantCommand,
  InviteTenantRoleCommand,
  SetPlatformTenantRolloutStageCommand,
  UpdatePlatformTenantOnboardingCommand,
  UpdatePlatformTenantSettingsCommand,
} from "@drts/contracts";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { TenantRolloutService } from "../tenant-rollout/tenant-rollout.service";
import { TenantsService } from "./tenants.service";
import type { TenantSummary } from "./tenants.service";

@Controller("platform-admin")
export class TenantsController {
  constructor(
    private readonly tenants: TenantsService,
    private readonly tenantRollout: TenantRolloutService,
  ) {}

  @Get("tenants")
  list(@Headers("x-request-id") requestId?: string) {
    const items: TenantSummary[] = this.tenants.list();
    return toApiSuccessEnvelope({ items }, requestId);
  }

  @Post("tenants")
  create(
    @Body() body: CreatePlatformTenantCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    const created = this.tenants.create(body, requestId);
    return toApiSuccessEnvelope(created, requestId);
  }

  @Post("tenants/:tenantId/settings")
  updateSettings(
    @Param("tenantId") tenantId: string,
    @Body() body: UpdatePlatformTenantSettingsCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    const updated = this.tenants.updateSettings(tenantId, body, requestId);
    return toApiSuccessEnvelope(updated, requestId);
  }

  @Get("tenants/:tenantId")
  getTenant(
    @Param("tenantId") tenantId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(this.tenants.get(tenantId), requestId);
  }

  @Get("tenants/:tenantId/rollout-state")
  getRolloutState(
    @Param("tenantId") tenantId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(this.tenantRollout.getState(tenantId), requestId);
  }

  @Post("tenants/:tenantId/onboarding")
  updateOnboarding(
    @Param("tenantId") tenantId: string,
    @Body() body: UpdatePlatformTenantOnboardingCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    const updated = this.tenants.updateOnboarding(tenantId, body, requestId);
    return toApiSuccessEnvelope(updated, requestId);
  }

  @Post("tenants/:tenantId/rollout")
  setRolloutStage(
    @Param("tenantId") tenantId: string,
    @Body() body: SetPlatformTenantRolloutStageCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    const updated = this.tenants.setRolloutStage(tenantId, body, requestId);
    return toApiSuccessEnvelope(updated, requestId);
  }

  @Post("tenants/:tenantId/rollout/advance")
  advanceRollout(
    @Param("tenantId") tenantId: string,
    @Body() body: AdvanceTenantRolloutCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.tenantRollout.advance(tenantId, body, requestId),
      requestId,
    );
  }

  @Post("tenants/:tenantId/roles/invite")
  inviteRole(
    @Param("tenantId") tenantId: string,
    @Body() body: InviteTenantRoleCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    const updated = this.tenants.inviteRole(tenantId, body, requestId);
    return toApiSuccessEnvelope(updated, requestId);
  }

  @Post("tenants/:tenantId/roles/acknowledge")
  acknowledgeRole(
    @Param("tenantId") tenantId: string,
    @Body() body: AcknowledgeTenantRoleCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    const updated = this.tenants.acknowledgeRole(tenantId, body, requestId);
    return toApiSuccessEnvelope(updated, requestId);
  }

  @Post("tenants/:tenantId/rollback-hold")
  rollbackHold(
    @Param("tenantId") tenantId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const updated = this.tenants.setRollbackHold(tenantId, requestId);
    return toApiSuccessEnvelope(updated, requestId);
  }

  @Post("tenants/:tenantId/suspend")
  suspend(
    @Param("tenantId") tenantId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const updated = this.tenants.setStatus(tenantId, "paused", requestId);
    return toApiSuccessEnvelope(updated, requestId);
  }

  @Post("tenants/:tenantId/activate")
  activate(
    @Param("tenantId") tenantId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const updated = this.tenants.setStatus(tenantId, "active", requestId);
    return toApiSuccessEnvelope(updated, requestId);
  }
}
