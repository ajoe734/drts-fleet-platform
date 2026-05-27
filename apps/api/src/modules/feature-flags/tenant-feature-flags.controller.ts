import { Controller, Get, Headers } from "@nestjs/common";
import type {
  ResourceActionDescriptor,
  TenantFeatureFlagVisibilityList,
  TenantFeatureFlagVisibilityRecord,
} from "@drts/contracts";
import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { FeatureFlagsService } from "./feature-flags.service";

const PAGE_ACTIONS: ResourceActionDescriptor[] = [
  {
    action: "search",
    enabled: true,
    riskLevel: "low",
  },
  {
    action: "open_platform_admin_feature_flags",
    enabled: true,
    riskLevel: "low",
  },
];

const ITEM_ACTIONS: ResourceActionDescriptor[] = [
  {
    action: "view_change_history",
    enabled: true,
    riskLevel: "low",
  },
];

@Controller("tenant")
export class TenantFeatureFlagsController {
  constructor(private readonly service: FeatureFlagsService) {}

  @Get("feature-flags")
  async getTenantFeatureFlags(
    @Headers("x-request-id") requestId?: string,
    @Headers("x-tenant-id") tenantId?: string,
  ) {
    const flags = tenantId ? await this.service.getAll(tenantId) : [];
    const generatedAt = new Date().toISOString();
    const items: TenantFeatureFlagVisibilityRecord[] = flags.map((flag) => ({
      key: flag.key,
      enabled: flag.enabled,
      description: flag.description,
      scope: flag.tenantId ? "tenant_override" : "global_default",
      rolloutState: flag.tenantId ? "rolling_out" : "steady",
      updatedAt: flag.updatedAt,
      updatedBy: null,
      historyLink: {
        targetApp: "tenant-console",
        route: `/audit?resourceType=feature-flag&resourceId=${encodeURIComponent(flag.key)}`,
        resourceType: "feature_flag",
        resourceId: flag.key,
        openMode: "same_tab",
        label: "View change history",
      },
      availableActions: ITEM_ACTIONS,
    }));

    const response: TenantFeatureFlagVisibilityList = {
      items,
      availableActions: PAGE_ACTIONS,
      refresh: {
        generatedAt,
        staleAfterMs: 30000,
        dataFreshness: "fresh",
        source: this.service.usesPersistentStore() ? "live" : "sandbox",
      },
      refreshTier: "slow",
      ...(items.length === 0
        ? {
            emptyState: {
              reason: "no_data",
              messageCode: "tenant.feature_flags.empty.no_data",
            },
          }
        : {}),
      notes: [
        "Platform Admin remains the write authority for feature flag governance.",
        "Rows scoped as tenant_override are surfaced as rolling_out because this tenant differs from the global default.",
        "updatedBy is not yet emitted by the shared feature flag store and is intentionally null until backend authority lands.",
      ],
    };

    return toApiSuccessEnvelope(response, requestId);
  }
}
