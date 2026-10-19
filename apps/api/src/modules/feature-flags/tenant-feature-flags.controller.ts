import { Controller, Get, Headers, Query } from "@nestjs/common";
import type { TenantFeatureFlagVisibilityList } from "@drts/contracts";
import {
  ApiRequestError,
  toApiSuccessEnvelope,
} from "../../common/api-envelope";
import {
  CurrentIdentity,
  RequireRealms,
  RequireScopes,
  type BootstrapRequestIdentity,
} from "../../common/auth";
import { FeatureFlagsService } from "./feature-flags.service";

@Controller("tenant/feature-flags")
@RequireRealms("tenant")
@RequireScopes("tenant:read")
export class TenantFeatureFlagsController {
  constructor(private readonly service: FeatureFlagsService) {}

  @Get()
  async list(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
    @Query("tenantId") selectedTenantId?: string,
    @Headers("x-tenant-id") headerTenantId?: string,
  ) {
    if (
      !identity?.actorId ||
      identity.realm !== "tenant" ||
      !identity.tenantId ||
      (selectedTenantId && selectedTenantId !== identity.tenantId) ||
      (headerTenantId && headerTenantId !== identity.tenantId)
    ) {
      throw new ApiRequestError(
        403,
        "TENANT_SCOPE_MISMATCH",
        "A verified own-tenant principal is required.",
      );
    }
    const flags = await this.service.getAll(identity.tenantId);
    const data: TenantFeatureFlagVisibilityList = {
      items: flags.map((flag) => ({
        key: flag.key,
        enabled: flag.enabled,
        description: flag.description,
        scope: flag.tenantId ? "tenant_override" : "global_default",
        rolloutState: "steady",
        updatedAt: flag.updatedAt,
        updatedBy: null,
        availableActions: [],
      })),
      availableActions: [],
      refresh: {
        generatedAt: new Date().toISOString(),
        staleAfterMs: 30_000,
        dataFreshness: "fresh",
        source: "live",
      },
      refreshTier: "slow",
      notes: [
        "Read-only effective values. Platform administration owns writes; storage follows configured feature-flag repository mode.",
      ],
    };
    return toApiSuccessEnvelope(data, requestId);
  }
}
