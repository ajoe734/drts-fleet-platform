import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import {
  CurrentIdentity,
  RequireRealms,
  RequireScopes,
  type BootstrapRequestIdentity,
} from "../../common/auth";
import {
  ApiRequestError,
  toApiSuccessEnvelope,
} from "../../common/api-envelope";
import { PlatformAdminService } from "./platform-admin.service";
import type { NoticeAudience } from "./platform-notice-lifecycle";

/** Separate legal projections. No changes to the global notifications endpoint. */
@Controller()
export class PlatformNoticesController {
  constructor(private readonly service: PlatformAdminService) {}
  private list(
    identity: BootstrapRequestIdentity | null,
    audience: NoticeAudience,
    requestId?: string,
    selectedTenantId?: string,
  ) {
    if (selectedTenantId && selectedTenantId !== identity?.tenantId) {
      throw new ApiRequestError(
        403,
        "NOTICE_TENANT_MISMATCH",
        "Notice reads are bound to the principal's tenant.",
      );
    }
    return toApiSuccessEnvelope(
      {
        items: this.service.listRecipientNotices(identity, audience),
        storageMode: "process_memory",
      },
      requestId,
    );
  }
  @Get("ops/platform-notices")
  @RequireRealms("ops")
  @RequireScopes("notifications:read")
  ops(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return this.list(identity, "ops", requestId);
  }
  @Get("tenant/platform-notices")
  @RequireRealms("tenant")
  @RequireScopes("tenant:read")
  tenant(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
    @Query("tenantId") selectedTenantId?: string,
    @Headers("x-tenant-id") headerTenantId?: string,
  ) {
    if (headerTenantId && headerTenantId !== identity?.tenantId)
      throw new ApiRequestError(
        403,
        "NOTICE_TENANT_MISMATCH",
        "Tenant header does not match the principal.",
      );
    return this.list(identity, "tenants", requestId, selectedTenantId);
  }
  @Get("driver/platform-notices")
  @RequireRealms("driver")
  @RequireScopes("notifications:read")
  driver(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return this.list(identity, "drivers", requestId);
  }
  @Post("ops/platform-notices/:noticeId/read")
  @RequireRealms("ops")
  @RequireScopes("notifications:read")
  readOps(
    @Param("noticeId") id: string,
    @Body() command: { outcomeId: string },
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.service.readRecipientNotice(id, command?.outcomeId, identity, "ops"),
      requestId,
    );
  }
  @Post("tenant/platform-notices/:noticeId/read")
  @RequireRealms("tenant")
  @RequireScopes("tenant:read")
  readTenant(
    @Param("noticeId") id: string,
    @Body() command: { outcomeId: string },
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.service.readRecipientNotice(
        id,
        command?.outcomeId,
        identity,
        "tenants",
      ),
      requestId,
    );
  }
  @Post("driver/platform-notices/:noticeId/read")
  @RequireRealms("driver")
  @RequireScopes("notifications:read")
  readDriver(
    @Param("noticeId") id: string,
    @Body() command: { outcomeId: string },
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.service.readRecipientNotice(
        id,
        command?.outcomeId,
        identity,
        "drivers",
      ),
      requestId,
    );
  }
}
