import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import type {
  AcknowledgeTenantRoleCommand,
  CreatePlatformTenantCommand,
  InviteTenantRoleCommand,
  SetPlatformTenantRolloutStageCommand,
  UpdatePlatformTenantOnboardingCommand,
  UpdatePlatformTenantSettingsCommand,
} from "@drts/contracts";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { READ_HEAVY_RATE_LIMIT } from "../../common/throttling/rate-limit.constants";
import { TenantsService } from "./tenants.service";
import type { TenantSummary } from "./tenants.service";

// Read-heavy admin console surface — see PlatformAdminController for rationale.
@Throttle(READ_HEAVY_RATE_LIMIT)
@Controller("platform-admin")
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get("tenants")
  list(@Headers("x-request-id") requestId?: string) {
    const items: TenantSummary[] = this.tenants.list();
    return toApiSuccessEnvelope({ items }, requestId);
  }

  @Post("tenants")
  async create(
    @Body() body: CreatePlatformTenantCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    const created = await this.tenants.create(body, requestId);
    return toApiSuccessEnvelope(created, requestId);
  }

  @Post("tenants/:tenantId/settings")
  async updateSettings(
    @Param("tenantId") tenantId: string,
    @Body() body: UpdatePlatformTenantSettingsCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    const updated = await this.tenants.updateSettings(
      tenantId,
      body,
      requestId,
    );
    return toApiSuccessEnvelope(updated, requestId);
  }

  @Get("tenants/:tenantId")
  getTenant(
    @Param("tenantId") tenantId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(this.tenants.get(tenantId), requestId);
  }

  @Post("tenants/:tenantId/onboarding")
  async updateOnboarding(
    @Param("tenantId") tenantId: string,
    @Body() body: UpdatePlatformTenantOnboardingCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    const updated = await this.tenants.updateOnboarding(
      tenantId,
      body,
      requestId,
    );
    return toApiSuccessEnvelope(updated, requestId);
  }

  @Post("tenants/:tenantId/rollout")
  async setRolloutStage(
    @Param("tenantId") tenantId: string,
    @Body() body: SetPlatformTenantRolloutStageCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    const updated = await this.tenants.setRolloutStage(
      tenantId,
      body,
      requestId,
    );
    return toApiSuccessEnvelope(updated, requestId);
  }

  @Post("tenants/:tenantId/roles/invite")
  async inviteRole(
    @Param("tenantId") tenantId: string,
    @Body() body: InviteTenantRoleCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    const updated = await this.tenants.inviteRole(tenantId, body, requestId);
    return toApiSuccessEnvelope(updated, requestId);
  }

  @Post("tenants/:tenantId/roles/acknowledge")
  async acknowledgeRole(
    @Param("tenantId") tenantId: string,
    @Body() body: AcknowledgeTenantRoleCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    const updated = await this.tenants.acknowledgeRole(
      tenantId,
      body,
      requestId,
    );
    return toApiSuccessEnvelope(updated, requestId);
  }

  @Post("tenants/:tenantId/rollback-hold")
  async rollbackHold(
    @Param("tenantId") tenantId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const updated = await this.tenants.setRollbackHold(tenantId, requestId);
    return toApiSuccessEnvelope(updated, requestId);
  }

  @Post("tenants/:tenantId/suspend")
  async suspend(
    @Param("tenantId") tenantId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const updated = await this.tenants.setStatus(tenantId, "paused", requestId);
    return toApiSuccessEnvelope(updated, requestId);
  }

  @Post("tenants/:tenantId/activate")
  async activate(
    @Param("tenantId") tenantId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const updated = await this.tenants.setStatus(tenantId, "active", requestId);
    return toApiSuccessEnvelope(updated, requestId);
  }
}
