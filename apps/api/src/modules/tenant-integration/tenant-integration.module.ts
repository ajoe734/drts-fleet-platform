import { Module } from "@nestjs/common";

import { FeatureFlagsModule } from "../feature-flags/feature-flags.module";
import { TenantPartnerModule } from "../tenant-partner/tenant-partner.module";
import { TenantIntegrationController } from "./tenant-integration.controller";
import { TenantIntegrationService } from "./tenant-integration.service";

/**
 * Q-TEN10 — aggregated tenant integration readiness.
 *
 * Reuses the already-provisioned `TenantPartnerService` and
 * `FeatureFlagsService` (both exported by their modules) to compose a single
 * readiness summary, so the tenant console issues one request instead of
 * orchestrating per-sub-system reads.
 */
@Module({
  imports: [TenantPartnerModule, FeatureFlagsModule],
  controllers: [TenantIntegrationController],
  providers: [TenantIntegrationService],
  exports: [TenantIntegrationService],
})
export class TenantIntegrationModule {}
