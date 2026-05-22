import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Headers,
  Query,
} from "@nestjs/common";
import { FeatureFlagsService } from "./feature-flags.service";
import type { FeatureFlagSummary } from "@drts/contracts";
import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { ApiRequestError } from "../../common/api-envelope";
import { CurrentIdentity } from "../../common/auth";
import type { BootstrapRequestIdentity } from "../../common/auth";

@Controller("admin")
export class FeatureFlagsController {
  constructor(private readonly service: FeatureFlagsService) {}

  @Get("flags")
  async getAllFlags(
    @Headers("x-request-id") requestId?: string,
    @Headers("x-tenant-id") tenantId?: string,
  ) {
    const flags = await this.service.getAll(tenantId);
    const summary: FeatureFlagSummary = {
      flags,
      notes: [
        "Feature flags control module-level rollout for Phase 1 client surfaces.",
        "Flags are tenant-scoped; include x-tenant-id header for tenant-specific overrides.",
        "Read access allows tenant and platform identities; writes remain platform-admin only.",
      ],
    };
    return toApiSuccessEnvelope(summary, requestId);
  }

  @Get("flags/:key")
  async getFlag(
    @Param("key") key: string,
    @Headers("x-request-id") requestId?: string,
    @Headers("x-tenant-id") tenantId?: string,
  ) {
    const flag = await this.service.getByKey(key, tenantId);
    return toApiSuccessEnvelope(flag, requestId);
  }

  @Patch("flags/:key")
  async updateFlag(
    @Param("key") key: string,
    @Body() body: { enabled: boolean },
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const updated = await this.service.updateFlag(
      key,
      body.enabled,
      requestId,
      identity,
    );
    return toApiSuccessEnvelope(updated, requestId);
  }

  @Post("flags/:key/tenant-overrides")
  async upsertTenantOverride(
    @Param("key") key: string,
    @Query("tenantId") tenantId: string,
    @Body() body: { enabled: boolean; description?: string },
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    if (!tenantId) {
      throw new ApiRequestError(
        400,
        "bad_request",
        "tenantId query parameter is required",
      );
    }
    const updated = await this.service.upsertTenantOverride(
      key,
      tenantId,
      body.enabled,
      body.description,
      requestId,
      identity,
    );
    return toApiSuccessEnvelope(updated, requestId);
  }

  @Get("flags/:key/enabled")
  async checkFlagEnabled(
    @Param("key") key: string,
    @Headers("x-request-id") requestId?: string,
    @Headers("x-tenant-id") tenantId?: string,
  ) {
    const enabled = await this.service.isEnabled(key, tenantId);
    return toApiSuccessEnvelope({ key, enabled }, requestId);
  }
}
