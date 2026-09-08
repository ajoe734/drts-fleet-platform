import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import type {
  CreatePlatformPricingRuleCommand,
  CreatePlatformAdminUserCommand,
  CreatePlatformNoticeCommand,
  CreatePublicInfoVersionCommand,
  GeneratePlacardVersionCommand,
  PlatformAdapter,
  PublishPlacardVersionCommand,
  PublishPlatformPricingRuleCommand,
  PublishPublicInfoVersionCommand,
  SetPlatformMaintenanceModeCommand,
  UpdatePlatformAdapterCommand,
  UpdatePlatformAdminUserRoleCommand,
} from "@drts/contracts";

import {
  ApiRequestError,
  toApiSuccessEnvelope,
} from "../../common/api-envelope";
import { CurrentIdentity } from "../../common/auth";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { READ_HEAVY_RATE_LIMIT } from "../../common/throttling/rate-limit.constants";
import { PlatformAdminService } from "./platform-admin.service";

// The platform-admin console is an authenticated read-heavy surface: the
// dashboard alone fans out ~6 GETs on load (page.tsx loadSnapshot) and every
// governance page adds more, all funneling through one shared bootstrap-actor
// throttle bucket. Under the global default (60 req/min + 5-min block,
// rate-limit.constants.ts) a brief navigation burst locked the whole console
// out with "429 ThrottlerException" for 5 minutes. READ_HEAVY (180/min, no
// block) matches how the sibling read modules (platform-presence, owned-
// mobility, tenant-partner) already protect their list endpoints.
@Throttle(READ_HEAVY_RATE_LIMIT)
@Controller("platform-admin")
export class PlatformAdminController {
  constructor(private readonly platformAdminService: PlatformAdminService) {}

  @Get("public-info")
  listPublicInfoVersions(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      {
        items: this.platformAdminService.listPublicInfoVersions(),
      },
      requestId,
    );
  }

  @Post("public-info")
  createPublicInfoVersion(
    @Body() command: CreatePublicInfoVersionCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.platformAdminService.createPublicInfoVersion(command, requestId),
      requestId,
    );
  }

  @Post("public-info/:versionId/publish")
  publishPublicInfoVersion(
    @Param("versionId") versionId: string,
    @Body() command: PublishPublicInfoVersionCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.platformAdminService.publishPublicInfoVersion(
        versionId,
        command,
        requestId,
        this.requireActorId(identity),
      ),
      requestId,
    );
  }

  @Delete("public-info/:versionId")
  deleteDraftPublicInfoVersion(
    @Param("versionId") versionId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.platformAdminService.deleteDraftPublicInfoVersion(
        versionId,
        requestId,
        this.requireActorId(identity),
      ),
      requestId,
    );
  }

  @Get("placards")
  listPlacardVersions(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      {
        items: this.platformAdminService.listPlacardVersions(),
      },
      requestId,
    );
  }

  @Post("placards")
  generatePlacardVersion(
    @Body() command: GeneratePlacardVersionCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.platformAdminService.generatePlacardVersion(command, requestId),
      requestId,
    );
  }

  @Post("placards/:placardVersionId/publish")
  publishPlacardVersion(
    @Param("placardVersionId") placardVersionId: string,
    @Body() command: PublishPlacardVersionCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.platformAdminService.publishPlacardVersion(
        placardVersionId,
        command,
        requestId,
        this.requireActorId(identity),
      ),
      requestId,
    );
  }

  // ── Platform Admin Users ──────────────────────────────────────────────────

  @Get("users")
  async listPlatformAdminUsers(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      { items: await this.platformAdminService.listPlatformAdminUsers() },
      requestId,
    );
  }

  @Post("users")
  async createPlatformAdminUser(
    @Body() command: CreatePlatformAdminUserCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.platformAdminService.createPlatformAdminUser(
        command,
        requestId,
        this.requireActorId(identity),
      ),
      requestId,
    );
  }

  @Post("users/:userId/role")
  async updatePlatformAdminUserRole(
    @Param("userId") userId: string,
    @Body() command: UpdatePlatformAdminUserRoleCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.platformAdminService.updatePlatformAdminUserRole(
        userId,
        command,
        requestId,
        this.requireActorId(identity),
      ),
      requestId,
    );
  }

  // ── Platform Notices ──────────────────────────────────────────────────────

  @Get("notices")
  listPlatformNotices(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      { items: this.platformAdminService.listPlatformNotices() },
      requestId,
    );
  }

  @Post("notices")
  createPlatformNotice(
    @Body() command: CreatePlatformNoticeCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.platformAdminService.createPlatformNotice(command, requestId),
      requestId,
    );
  }

  @Post("notices/:noticeId/resolve")
  resolveNotice(
    @Param("noticeId") noticeId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.platformAdminService.resolveNotice(noticeId, requestId),
      requestId,
    );
  }

  // ── Maintenance Mode ──────────────────────────────────────────────────────

  @Get("maintenance-mode")
  getMaintenanceMode(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      this.platformAdminService.getMaintenanceMode(),
      requestId,
    );
  }

  @Post("maintenance-mode")
  setMaintenanceMode(
    @Body() command: SetPlatformMaintenanceModeCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.platformAdminService.setMaintenanceMode(command, requestId),
      requestId,
    );
  }

  // ── Platform Pricing Rules ────────────────────────────────────────────────

  @Get("pricing-rules")
  listPlatformPricingRules(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      { items: this.platformAdminService.listPlatformPricingRules() },
      requestId,
    );
  }

  @Post("pricing-rules")
  createPlatformPricingRule(
    @Body() command: CreatePlatformPricingRuleCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.platformAdminService.createPlatformPricingRule(command, requestId),
      requestId,
    );
  }

  @Post("pricing-rules/:ruleId/publish")
  publishPlatformPricingRule(
    @Param("ruleId") ruleId: string,
    @Body() command: PublishPlatformPricingRuleCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.platformAdminService.publishPlatformPricingRule(
        ruleId,
        command,
        requestId,
      ),
      requestId,
    );
  }

  // ── Platform Invoices ────────────────────────────────────────────────────

  @Get("invoices")
  listPlatformInvoices(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      { items: this.platformAdminService.listPlatformInvoices() },
      requestId,
    );
  }

  // ── Platform Adapters ────────────────────────────────────────────────────

  @Get("adapters")
  listPlatformAdapters(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    this.assertAuthorizedRole(identity, "read");
    return toApiSuccessEnvelope(
      { items: this.platformAdminService.listPlatformAdapters() },
      requestId,
    );
  }

  @Get("adapters/:adapterId")
  getPlatformAdapter(
    @Param("adapterId") adapterId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    this.assertAuthorizedRole(identity, "read");
    const adapter = this.platformAdminService.getPlatformAdapter(adapterId);
    if (!adapter) {
      throw new ApiRequestError(
        404,
        "PLATFORM_ADAPTER_NOT_FOUND",
        `Platform adapter '${adapterId}' not found.`,
      );
    }
    return toApiSuccessEnvelope(adapter, requestId);
  }

  @Patch("adapters/:adapterId")
  updatePlatformAdapter(
    @Param("adapterId") adapterId: string,
    @Body() command: UpdatePlatformAdapterCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    this.assertAuthorizedRole(identity, "write");
    const updated = this.platformAdminService.updatePlatformAdapter(
      adapterId,
      command,
      requestId,
      identity?.actorId ?? undefined,
    );
    if (!updated) {
      throw new ApiRequestError(
        404,
        "PLATFORM_ADAPTER_NOT_FOUND",
        `Platform adapter '${adapterId}' not found.`,
      );
    }
    return toApiSuccessEnvelope(updated, requestId);
  }

  @Post("adapters")
  createPlatformAdapter(
    @Body()
    command: Partial<PlatformAdapter> & {
      id: string;
      platformCode: string;
      name: string;
    },
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    this.assertAuthorizedRole(identity, "write");
    const created = this.platformAdminService.createPlatformAdapter(
      command,
      requestId,
      identity?.actorId ?? undefined,
    );
    return toApiSuccessEnvelope(created, requestId);
  }

  private assertAuthorizedRole(
    identity: BootstrapRequestIdentity | null,
    action: "read" | "write" = "read",
  ): void {
    if (!identity) {
      return;
    }
    const realm = identity.realm;
    if (realm !== "platform" && realm !== "system") {
      throw new ApiRequestError(
        403,
        "PLATFORM_ADMIN_FORBIDDEN",
        `Realm '${realm}' is not authorized for platform admin adapter governance.`,
      );
    }
    const requiredScope =
      action === "write" ? "foundation:write" : "foundation:read";
    if (
      identity.scopes &&
      identity.scopes.length > 0 &&
      !identity.scopes.includes(requiredScope)
    ) {
      throw new ApiRequestError(
        403,
        "PLATFORM_ADMIN_FORBIDDEN",
        `Scope '${requiredScope}' is required for adapter governance.`,
      );
    }
  }

  private requireActorId(identity: BootstrapRequestIdentity | null): string {
    const actorId = identity?.actorId?.trim();
    if (!actorId) {
      throw new ApiRequestError(
        401,
        "PLATFORM_ADMIN_IDENTITY_REQUIRED",
        "Platform admin publish routes require an authenticated actorId.",
      );
    }

    return actorId;
  }
}
