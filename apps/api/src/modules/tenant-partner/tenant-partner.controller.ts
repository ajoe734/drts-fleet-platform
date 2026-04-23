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
  CreateTenantUserCommand,
  CreateTenantWebhookEndpointCommand,
  IssueTenantApiKeyCommand,
  RotateTenantApiKeyCommand,
  SendTestWebhookCommand,
  TenantPartnerSummary,
  UpdateTenantWebhookEndpointCommand,
  UpdateTenantNotificationsCommand,
  UpdateTenantRoleCommand,
  UpdateTenantSlaProfileCommand,
  UpsertTenantAddressCommand,
  UpsertTenantPassengerCommand,
} from "@drts/contracts";

import {
  ApiRequestError,
  toApiListData,
  toApiSuccessEnvelope,
} from "../../common/api-envelope";
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
  @Throttle(READ_HEAVY_RATE_LIMIT)
  listTenantRoles(
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    this.requireTenantId(tenantId);
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
  listWebhookDeliveries(
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const items = this.tenantPartnerService.listWebhookDeliveries(
      this.requireTenantId(tenantId),
    );
    return toApiSuccessEnvelope(toApiListData(items), requestId);
  }

  @Get("tenant/webhooks/:webhookId/deliveries")
  listWebhookDeliveriesByEndpoint(
    @Param("webhookId") webhookId: string,
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const items = this.tenantPartnerService.listWebhookDeliveriesByWebhook(
      this.requireTenantId(tenantId),
      webhookId,
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
  listTenantAudit(
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const items = this.tenantPartnerService.listTenantAudit(
      this.requireTenantId(tenantId),
    );
    return toApiSuccessEnvelope(toApiListData(items), requestId);
  }
}
