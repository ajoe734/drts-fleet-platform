import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Delete,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import type {
  CreatePartnerChannelEntryCommand,
  IdentityContext,
  IssuePartnerIngressCredentialCommand,
  CreateTenantUserCommand,
  CreateTenantWebhookEndpointCommand,
  IssueTenantApiKeyCommand,
  PartnerIngressCredentialIssued,
  PartnerIngressCredentialRecord,
  PartnerChannelEntryRecord,
  PartnerEligibilityReviewQueueItem,
  PartnerEligibilityReviewResolution,
  PartnerEligibilityVerificationRecord,
  ResolvePartnerEligibilityReviewCommand,
  RevokePartnerIngressCredentialCommand,
  RotateTenantApiKeyCommand,
  SendTestWebhookCommand,
  TenantAddressExportViewRecord,
  TenantIntegrationGovernancePackage,
  TenantPartnerSummary,
  UpdatePartnerChannelEntryCommand,
  UpdateTenantWebhookEndpointCommand,
  UpdateTenantNotificationsCommand,
  UpdateTenantRoleCommand,
  UpdateTenantSlaProfileCommand,
  UpsertTenantAddressCommand,
  UpsertTenantPassengerCommand,
  VerifyPartnerEligibilityCommand,
} from "@drts/contracts";

import {
  ApiRequestError,
  toApiListData,
  toApiSuccessEnvelope,
} from "../../common/api-envelope";
import { CurrentIdentity, OpenRoute, RequireRealms } from "../../common/auth";
import { READ_HEAVY_RATE_LIMIT } from "../../common/throttling/rate-limit.constants";
import { TenantPartnerService } from "./tenant-partner.service";

@Controller()
export class TenantPartnerController {
  constructor(private readonly tenantPartnerService: TenantPartnerService) {}

  private requireTenantId(tenantId?: string) {
    const normalizedTenantId = tenantId?.trim();
    if (!normalizedTenantId) {
      throw new ApiRequestError(
        400,
        "TENANT_ID_REQUIRED",
        "x-tenant-id header is required for tenant-partner endpoints.",
      );
    }

    return normalizedTenantId;
  }

  @Get("tenant-partner/summary")
  @Throttle(READ_HEAVY_RATE_LIMIT)
  getSummary(@Headers("x-request-id") requestId?: string) {
    const summary: TenantPartnerSummary = {
      supportedRoots: ["tenant", "partner", "site", "call_point"],
      sourceOfTruth: "tenant_partner_service",
      notes: [
        "Passenger directory, address book, tenant users/roles, API keys, webhook metadata, and SLA profiles now live in the tenant-partner slice.",
        "Platform admin users remain outside tenant-partner scope.",
      ],
    };

    return toApiSuccessEnvelope(summary, requestId);
  }

  @Get("partner/entries")
  @OpenRoute()
  @Throttle(READ_HEAVY_RATE_LIMIT)
  listPartnerEntries(@Headers("x-request-id") requestId?: string) {
    const items: PartnerChannelEntryRecord[] =
      this.tenantPartnerService.listPartnerEntries();
    return toApiSuccessEnvelope(toApiListData(items), requestId);
  }

  @Get("partner/entries/:entrySlug")
  @OpenRoute()
  @Throttle(READ_HEAVY_RATE_LIMIT)
  getPartnerEntry(
    @Param("entrySlug") entrySlug: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.tenantPartnerService.getPartnerEntry(entrySlug),
      requestId,
    );
  }

  @Get("platform-admin/partner-entries")
  @Throttle(READ_HEAVY_RATE_LIMIT)
  listPlatformPartnerEntries(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      toApiListData(this.tenantPartnerService.listPlatformPartnerEntries()),
      requestId,
    );
  }

  @Post("platform-admin/partner-entries")
  createPlatformPartnerEntry(
    @Body() command: CreatePartnerChannelEntryCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.tenantPartnerService.createPlatformPartnerEntry(command, requestId),
      requestId,
    );
  }

  @Post("platform-admin/partner-entries/:entrySlug")
  updatePlatformPartnerEntry(
    @Param("entrySlug") entrySlug: string,
    @Body() command: UpdatePartnerChannelEntryCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.tenantPartnerService.updatePlatformPartnerEntry(
        entrySlug,
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Post("platform-admin/partner-entries/:entrySlug/activate")
  activatePlatformPartnerEntry(
    @Param("entrySlug") entrySlug: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.tenantPartnerService.setPlatformPartnerEntryStatus(
        entrySlug,
        "active",
        requestId,
      ),
      requestId,
    );
  }

  @Post("platform-admin/partner-entries/:entrySlug/deactivate")
  deactivatePlatformPartnerEntry(
    @Param("entrySlug") entrySlug: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.tenantPartnerService.setPlatformPartnerEntryStatus(
        entrySlug,
        "inactive",
        requestId,
      ),
      requestId,
    );
  }

  @Post("platform-admin/partner-entries/:entrySlug/revoke")
  revokePlatformPartnerEntry(
    @Param("entrySlug") entrySlug: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.tenantPartnerService.revokePlatformPartnerEntry(
        entrySlug,
        requestId,
      ),
      requestId,
    );
  }

  @Get("platform-admin/partner-entries/:entrySlug/credentials")
  listPlatformPartnerIngressCredentials(
    @Param("entrySlug") entrySlug: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const items: PartnerIngressCredentialRecord[] =
      this.tenantPartnerService.listPlatformPartnerIngressCredentials(
        entrySlug,
      );
    return toApiSuccessEnvelope(toApiListData(items), requestId);
  }

  @Post("platform-admin/partner-entries/:entrySlug/credentials/issue")
  issuePlatformPartnerIngressCredential(
    @Param("entrySlug") entrySlug: string,
    @Body() command: IssuePartnerIngressCredentialCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    const issued: PartnerIngressCredentialIssued =
      this.tenantPartnerService.issuePlatformPartnerIngressCredential(
        entrySlug,
        command,
        requestId,
      );
    return toApiSuccessEnvelope(issued, requestId);
  }

  @Post("platform-admin/partner-entries/:entrySlug/credentials/:keyId/revoke")
  revokePlatformPartnerIngressCredential(
    @Param("entrySlug") entrySlug: string,
    @Param("keyId") keyId: string,
    @Body() command: RevokePartnerIngressCredentialCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.tenantPartnerService.revokePlatformPartnerIngressCredential(
        entrySlug,
        keyId,
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Post("partner/eligibility/verify")
  async verifyPartnerEligibility(
    @Body() command: VerifyPartnerEligibilityCommand,
    @CurrentIdentity() identity: IdentityContext | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const verification: PartnerEligibilityVerificationRecord =
      await this.tenantPartnerService.verifyPartnerEligibility(
        command,
        requestId,
        identity,
      );
    return toApiSuccessEnvelope(verification, requestId);
  }

  @Get("partner/eligibility/:eligibilityVerificationId")
  @RequireRealms("partner", "tenant", "platform", "ops")
  @Throttle(READ_HEAVY_RATE_LIMIT)
  getPartnerEligibilityVerification(
    @Param("eligibilityVerificationId") eligibilityVerificationId: string,
    @CurrentIdentity() identity: IdentityContext | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.tenantPartnerService.getPartnerEligibilityVerification(
        eligibilityVerificationId,
        requestId,
        identity,
      ),
      requestId,
    );
  }

  @Get("ops/partner/eligibility/reviews")
  @RequireRealms("platform", "ops")
  @Throttle(READ_HEAVY_RATE_LIMIT)
  listPartnerEligibilityReviewQueue(
    @CurrentIdentity() identity: IdentityContext | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const items: PartnerEligibilityReviewQueueItem[] =
      this.tenantPartnerService.listPartnerEligibilityReviewQueue(
        requestId,
        identity,
      );
    return toApiSuccessEnvelope(toApiListData(items), requestId);
  }

  @Post("ops/partner/eligibility/reviews/resolve")
  @RequireRealms("platform", "ops")
  resolvePartnerEligibilityReview(
    @Body() command: ResolvePartnerEligibilityReviewCommand,
    @CurrentIdentity() identity: IdentityContext | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const resolution: PartnerEligibilityReviewResolution =
      this.tenantPartnerService.resolvePartnerEligibilityReview(
        command,
        requestId,
        identity,
      );
    return toApiSuccessEnvelope(resolution, requestId);
  }

  @Get("tenant/passengers")
  @Throttle(READ_HEAVY_RATE_LIMIT)
  listPassengers(
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const items = this.tenantPartnerService.listPassengers(
      this.requireTenantId(tenantId),
    );
    return toApiSuccessEnvelope(toApiListData(items), requestId);
  }

  @Post("tenant/passengers")
  upsertPassenger(
    @Body() command: UpsertTenantPassengerCommand,
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.tenantPartnerService.upsertPassenger(
        this.requireTenantId(tenantId),
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Get("tenant/addresses")
  @Throttle(READ_HEAVY_RATE_LIMIT)
  listAddresses(
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const items = this.tenantPartnerService.listAddresses(
      this.requireTenantId(tenantId),
    );
    return toApiSuccessEnvelope(toApiListData(items), requestId);
  }

  @Get("tenant/addresses/export-view")
  @Throttle(READ_HEAVY_RATE_LIMIT)
  listAddressExportView(
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const items: TenantAddressExportViewRecord[] =
      this.tenantPartnerService.listAddressExportView(
        this.requireTenantId(tenantId),
      );
    return toApiSuccessEnvelope(toApiListData(items), requestId);
  }
  @Post("tenant/addresses")
  upsertAddress(
    @Body() command: UpsertTenantAddressCommand,
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.tenantPartnerService.upsertAddress(
        this.requireTenantId(tenantId),
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Get("tenant/users")
  @Throttle(READ_HEAVY_RATE_LIMIT)
  listTenantUsers(
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const items = this.tenantPartnerService.listTenantUsers(
      this.requireTenantId(tenantId),
    );
    return toApiSuccessEnvelope(toApiListData(items), requestId);
  }

  @Get("tenant/roles")
  @OpenRoute()
  @Throttle(READ_HEAVY_RATE_LIMIT)
  listTenantRoles(@Headers("x-request-id") requestId?: string) {
    const items = this.tenantPartnerService.listTenantRoles();
    return toApiSuccessEnvelope(toApiListData(items), requestId);
  }

  @Post("tenant/users")
  createTenantUser(
    @Body() command: CreateTenantUserCommand,
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.tenantPartnerService.createTenantUser(
        this.requireTenantId(tenantId),
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Post("tenant/users/:userId/role")
  updateTenantRole(
    @Param("userId") userId: string,
    @Body() command: UpdateTenantRoleCommand,
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.tenantPartnerService.updateTenantUserRole(
        this.requireTenantId(tenantId),
        userId,
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Get("tenant/api-keys")
  @Throttle(READ_HEAVY_RATE_LIMIT)
  listApiKeys(
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const items = this.tenantPartnerService.listApiKeys(
      this.requireTenantId(tenantId),
    );
    return toApiSuccessEnvelope(toApiListData(items), requestId);
  }

  @Post("tenant/api-keys")
  issueApiKey(
    @Body() command: IssueTenantApiKeyCommand,
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.tenantPartnerService.issueApiKey(
        this.requireTenantId(tenantId),
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Post("tenant/api-keys/:apiKeyId/revoke")
  revokeApiKey(
    @Param("apiKeyId") apiKeyId: string,
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.tenantPartnerService.revokeApiKey(
        this.requireTenantId(tenantId),
        apiKeyId,
        requestId,
      ),
      requestId,
    );
  }

  @Post("tenant/api-keys/:apiKeyId/rotate")
  rotateApiKey(
    @Param("apiKeyId") apiKeyId: string,
    @Body() command: RotateTenantApiKeyCommand,
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.tenantPartnerService.rotateApiKey(
        this.requireTenantId(tenantId),
        apiKeyId,
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Get("tenant/notifications")
  @Throttle(READ_HEAVY_RATE_LIMIT)
  getTenantNotifications(
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.tenantPartnerService.getNotificationPreferences(
        this.requireTenantId(tenantId),
      ),
      requestId,
    );
  }

  @Get("tenant/integration-governance")
  @Throttle(READ_HEAVY_RATE_LIMIT)
  getTenantIntegrationGovernancePackage(
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const item: TenantIntegrationGovernancePackage =
      this.tenantPartnerService.getIntegrationGovernancePackage(
        this.requireTenantId(tenantId),
      );
    return toApiSuccessEnvelope(item, requestId);
  }

  @Get("tenant/notifications/feed")
  @Throttle(READ_HEAVY_RATE_LIMIT)
  listTenantNotificationFeed(
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const items = this.tenantPartnerService.listTenantNotifications(
      this.requireTenantId(tenantId),
    );
    return toApiSuccessEnvelope(toApiListData(items), requestId);
  }

  @Post("tenant/notifications")
  updateTenantNotifications(
    @Body() command: UpdateTenantNotificationsCommand,
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.tenantPartnerService.updateNotificationPreferences(
        this.requireTenantId(tenantId),
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Get("tenant/webhooks")
  listWebhookEndpoints(
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const items = this.tenantPartnerService.listWebhookEndpoints(
      this.requireTenantId(tenantId),
    );
    return toApiSuccessEnvelope(toApiListData(items), requestId);
  }

  @Post("tenant/webhooks")
  createWebhookEndpoint(
    @Body() command: CreateTenantWebhookEndpointCommand,
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.tenantPartnerService.createWebhookEndpoint(
        this.requireTenantId(tenantId),
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Post("tenant/webhooks/test")
  async sendTestWebhook(
    @Body() command: SendTestWebhookCommand,
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const result = await this.tenantPartnerService.sendTestWebhook(
      this.requireTenantId(tenantId),
      command,
      requestId,
    );
    return toApiSuccessEnvelope(
      result ?? {
        deliveryId: null,
        httpStatus: 404,
      },
      requestId,
    );
  }

  @Post("tenant/webhooks/:webhookId")
  updateWebhookEndpoint(
    @Param("webhookId") webhookId: string,
    @Body() command: UpdateTenantWebhookEndpointCommand,
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.tenantPartnerService.updateWebhookEndpoint(
        this.requireTenantId(tenantId),
        webhookId,
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Delete("tenant/webhooks/:webhookId")
  deleteWebhookEndpoint(
    @Param("webhookId") webhookId: string,
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.tenantPartnerService.deleteWebhookEndpoint(
        this.requireTenantId(tenantId),
        webhookId,
        requestId,
      ) ?? {
        status: "not_found",
      },
      requestId,
    );
  }

  @Post("tenant/webhooks/:webhookId/rotate-secret")
  rotateWebhookSecret(
    @Param("webhookId") webhookId: string,
    @Body()
    command: {
      secret: string;
      rotationReason?: string;
    },
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const result = this.tenantPartnerService.rotateWebhookSecret(
      this.requireTenantId(tenantId),
      {
        webhookId,
        secret: command.secret,
        ...(command.rotationReason !== undefined
          ? { rotationReason: command.rotationReason }
          : {}),
      },
      requestId,
    );

    return toApiSuccessEnvelope(
      result ?? {
        webhookId: null,
        secretVersion: null,
        httpStatus: 404,
      },
      requestId,
    );
  }

  @Get("tenant/webhooks/deliveries")
  @RequireRealms("tenant", "platform", "ops")
  listWebhookDeliveries(
    @CurrentIdentity() identity: IdentityContext | null,
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const items = this.tenantPartnerService.listWebhookDeliveries(
      this.requireTenantId(tenantId),
      requestId,
      identity,
    );
    return toApiSuccessEnvelope(toApiListData(items), requestId);
  }

  @Get("tenant/webhooks/:webhookId/deliveries")
  @RequireRealms("tenant", "platform", "ops")
  listWebhookDeliveriesByEndpoint(
    @Param("webhookId") webhookId: string,
    @CurrentIdentity() identity: IdentityContext | null,
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const items = this.tenantPartnerService.listWebhookDeliveriesByWebhook(
      this.requireTenantId(tenantId),
      webhookId,
      requestId,
      identity,
    );
    return toApiSuccessEnvelope(toApiListData(items), requestId);
  }

  @Get("tenant/sla")
  getSlaProfile(
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.tenantPartnerService.getSlaProfile(this.requireTenantId(tenantId)),
      requestId,
    );
  }

  @Post("tenant/sla")
  updateSlaProfile(
    @Body() command: UpdateTenantSlaProfileCommand,
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.tenantPartnerService.updateSlaProfile(
        this.requireTenantId(tenantId),
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Get("tenant/audit")
  @RequireRealms("tenant", "platform", "ops")
  listTenantAudit(
    @CurrentIdentity() identity: IdentityContext | null,
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const items = this.tenantPartnerService.listTenantAudit(
      this.requireTenantId(tenantId),
      requestId,
      identity,
    );
    return toApiSuccessEnvelope(toApiListData(items), requestId);
  }
}
