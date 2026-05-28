import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { FeatureFlagsService } from "./feature-flags.service";
import type { FeatureFlagSummary } from "@drts/contracts";
import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { ApiRequestError } from "../../common/api-envelope";

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
        "This endpoint is admin-only; smoke test with x-actor-type=platform_admin.",
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
    @Headers("x-request-id") requestId?: string,
  ) {
    const updated = await this.service.updateFlag(key, body.enabled);
    return toApiSuccessEnvelope(updated, requestId);
  }

  @Post("flags/:key/tenant-overrides")
  async upsertTenantOverride(
    @Param("key") key: string,
    @Query("tenantId") tenantId: string,
    @Body() body: { enabled: boolean; description?: string },
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
    );
    return toApiSuccessEnvelope(updated, requestId);
  }

  @Delete("flags/:key/tenant-overrides")
  async removeTenantOverride(
    @Param("key") key: string,
    @Query("tenantId") tenantId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    if (!tenantId) {
      throw new ApiRequestError(
        400,
        "bad_request",
        "tenantId query parameter is required",
      );
    }
    const removed = await this.service.removeTenantOverride(key, tenantId);
    return toApiSuccessEnvelope(removed, requestId);
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
