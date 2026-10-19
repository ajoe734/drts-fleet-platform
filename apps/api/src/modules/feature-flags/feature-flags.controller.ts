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
import { RequireRealms, RequireScopes } from "../../common/auth";

@Controller("admin")
@RequireRealms("system", "platform")
export class FeatureFlagsController {
  constructor(private readonly service: FeatureFlagsService) {}

  @Get("flags")
  @RequireRealms("system", "platform")
  @RequireScopes("foundation:read")
  async getAllFlags(
    @Headers("x-request-id") requestId?: string,
    @Headers("x-tenant-id") tenantId?: string,
    @Query("tenantId") selectedTenantId?: string,
  ) {
    const flags = await this.service.getAll(selectedTenantId || tenantId);
    const summary: FeatureFlagSummary = {
      flags,
      notes: [
        "Feature flags control module-level rollout for Phase 1 client surfaces.",
        "Authorized administrators may select tenantId for tenant-specific overrides.",
      ],
    };
    return toApiSuccessEnvelope(summary, requestId);
  }

  @Get("flags/:key")
  @RequireRealms("system", "platform")
  @RequireScopes("foundation:read")
  async getFlag(
    @Param("key") key: string,
    @Headers("x-request-id") requestId?: string,
    @Headers("x-tenant-id") tenantId?: string,
  ) {
    const flag = await this.service.getByKey(key, tenantId);
    return toApiSuccessEnvelope(flag, requestId);
  }

  @Patch("flags/:key")
  @RequireRealms("system", "platform")
  @RequireScopes("foundation:write")
  async updateFlag(
    @Param("key") key: string,
    @Body() body: { enabled: boolean },
    @Headers("x-request-id") requestId?: string,
  ) {
    this.assertEnabled(body?.enabled);
    const updated = await this.service.updateFlag(key, body.enabled);
    if (!updated) {
      throw new ApiRequestError(
        404,
        "FLAG_NOT_FOUND",
        "Global flag not found; write was not acknowledged.",
      );
    }
    return toApiSuccessEnvelope(updated, requestId);
  }

  @Post("flags/:key/tenant-overrides")
  @RequireRealms("system", "platform")
  @RequireScopes("foundation:write")
  async upsertTenantOverride(
    @Param("key") key: string,
    @Query("tenantId") tenantId: string,
    @Body() body: { enabled: boolean; description?: string },
    @Headers("x-request-id") requestId?: string,
  ) {
    this.assertEnabled(body?.enabled);
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
    );
    return toApiSuccessEnvelope(updated, requestId);
  }

  private assertEnabled(enabled: unknown) {
    if (typeof enabled !== "boolean") {
      throw new ApiRequestError(
        400,
        "FLAG_ENABLED_REQUIRED",
        "enabled must be a boolean.",
      );
    }
  }

  @Get("flags/:key/enabled")
  @RequireRealms("system", "platform")
  @RequireScopes("foundation:read")
  async checkFlagEnabled(
    @Param("key") key: string,
    @Headers("x-request-id") requestId?: string,
    @Headers("x-tenant-id") tenantId?: string,
  ) {
    const enabled = await this.service.isEnabled(key, tenantId);
    return toApiSuccessEnvelope({ key, enabled }, requestId);
  }
}
