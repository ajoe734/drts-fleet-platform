import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
} from "@nestjs/common";

import type {
  CreatePlatformPricingRuleCommand,
  CreatePlatformAdminUserCommand,
  CreatePlatformNoticeCommand,
  CreatePublicInfoVersionCommand,
  GeneratePlacardVersionCommand,
  PublishPlatformPricingRuleCommand,
  PublishPublicInfoVersionCommand,
  SetPlatformMaintenanceModeCommand,
  UpdatePlatformAdminUserRoleCommand,
} from "@drts/contracts";

import {
  ApiRequestError,
  toApiSuccessEnvelope,
} from "../../common/api-envelope";
import { CurrentIdentity } from "../../common/auth";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { PlatformAdminService } from "./platform-admin.service";

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
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.platformAdminService.publishPlacardVersion(
        placardVersionId,
        requestId,
      ),
      requestId,
    );
  }

  // ── Platform Admin Users ──────────────────────────────────────────────────

  @Get("users")
  listPlatformAdminUsers(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      { items: this.platformAdminService.listPlatformAdminUsers() },
      requestId,
    );
  }

  @Post("users")
  createPlatformAdminUser(
    @Body() command: CreatePlatformAdminUserCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.platformAdminService.createPlatformAdminUser(command, requestId),
      requestId,
    );
  }

  @Post("users/:userId/role")
  updatePlatformAdminUserRole(
    @Param("userId") userId: string,
    @Body() command: UpdatePlatformAdminUserRoleCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.platformAdminService.updatePlatformAdminUserRole(
        userId,
        command,
        requestId,
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
