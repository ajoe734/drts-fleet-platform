import { Controller, Get, Headers, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import type { PlatformTenantGovernanceSummaryQuery } from "@drts/contracts";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { READ_HEAVY_RATE_LIMIT } from "../../common/throttling/rate-limit.constants";
import { PlatformTenantGovernanceService } from "./tenant-governance.service";

// Read-heavy admin console surface — see PlatformAdminController for rationale.
@Throttle(READ_HEAVY_RATE_LIMIT)
@Controller("admin")
export class PlatformTenantGovernanceController {
  constructor(
    private readonly tenantGovernanceService: PlatformTenantGovernanceService,
  ) {}

  @Get("tenant-governance/summary")
  listSummary(
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const query: PlatformTenantGovernanceSummaryQuery = {};
    const parsedPage = this.parsePositiveInt(page);
    const parsedPageSize = this.parsePositiveInt(pageSize);

    if (parsedPage !== undefined) {
      query.page = parsedPage;
    }
    if (parsedPageSize !== undefined) {
      query.pageSize = parsedPageSize;
    }

    return toApiSuccessEnvelope(
      this.tenantGovernanceService.listSummary(query),
      requestId,
    );
  }

  private parsePositiveInt(value?: string) {
    if (!value?.trim()) {
      return undefined;
    }
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      return undefined;
    }
    return parsed;
  }
}
