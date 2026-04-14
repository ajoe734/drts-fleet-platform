import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Delete,
} from "@nestjs/common";

import type {
  CreateTenantUserCommand,
  CreateTenantWebhookEndpointCommand,
  IssueTenantApiKeyCommand,
  RotateTenantApiKeyCommand,
  SendTestWebhookCommand,
  TenantPartnerSummary,
  UpdateTenantNotificationsCommand,
  UpdateTenantRoleCommand,
  UpdateTenantSlaProfileCommand,
  UpsertTenantAddressCommand,
  UpsertTenantPassengerCommand,
} from "@drts/contracts";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { TenantPartnerService } from "./tenant-partner.service";

@Controller()
export class TenantPartnerController {
  constructor(private readonly tenantPartnerService: TenantPartnerService) {}

  @Get("tenant-partner/summary")
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
  listPassengers(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      {
        items: this.tenantPartnerService.listPassengers(),
      },
      requestId,
    );
  }

  @Post("tenant/passengers")
  upsertPassenger(
    @Body() command: UpsertTenantPassengerCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.tenantPartnerService.upsertPassenger(command, requestId),
      requestId,
    );
  }

  @Get("tenant/addresses")
  listAddresses(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      {
        items: this.tenantPartnerService.listAddresses(),
      },
      requestId,
    );
  }

  @Post("tenant/addresses")
  upsertAddress(
    @Body() command: UpsertTenantAddressCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.tenantPartnerService.upsertAddress(command, requestId),
      requestId,
    );
  }

  @Get("tenant/users")
  listTenantUsers(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      {
        items: this.tenantPartnerService.listTenantUsers(),
      },
      requestId,
    );
  }

  @Post("tenant/users")
  createTenantUser(
    @Body() command: CreateTenantUserCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.tenantPartnerService.createTenantUser(command, requestId),
      requestId,
    );
  }

  @Post("tenant/users/:userId/role")
  updateTenantRole(
    @Param("userId") userId: string,
    @Body() command: UpdateTenantRoleCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.tenantPartnerService.updateTenantUserRole(
        userId,
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Get("tenant/api-keys")
  listApiKeys(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      {
        items: this.tenantPartnerService.listApiKeys(),
      },
      requestId,
    );
  }

  @Post("tenant/api-keys")
  issueApiKey(
    @Body() command: IssueTenantApiKeyCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.tenantPartnerService.issueApiKey(command, requestId),
      requestId,
    );
  }

  @Post("tenant/api-keys/:apiKeyId/revoke")
  revokeApiKey(
    @Param("apiKeyId") apiKeyId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.tenantPartnerService.revokeApiKey(apiKeyId, requestId),
      requestId,
    );
  }

  @Post("tenant/api-keys/:apiKeyId/rotate")
  rotateApiKey(
    @Param("apiKeyId") apiKeyId: string,
    @Body() command: RotateTenantApiKeyCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.tenantPartnerService.rotateApiKey(apiKeyId, command, requestId),
      requestId,
    );
  }

  @Get("tenant/notifications")
  getTenantNotifications(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      this.tenantPartnerService.getNotificationPreferences(),
      requestId,
    );
  }

  @Post("tenant/notifications")
  updateTenantNotifications(
    @Body() command: UpdateTenantNotificationsCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.tenantPartnerService.updateNotificationPreferences(
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Get("tenant/webhooks")
  listWebhookEndpoints(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      {
        items: this.tenantPartnerService.listWebhookEndpoints(),
      },
      requestId,
    );
  }

  @Post("tenant/webhooks")
  createWebhookEndpoint(
    @Body() command: CreateTenantWebhookEndpointCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.tenantPartnerService.createWebhookEndpoint(command, requestId),
      requestId,
    );
  }

  @Delete("tenant/webhooks/:webhookId")
  deleteWebhookEndpoint(
    @Param("webhookId") webhookId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.tenantPartnerService.deleteWebhookEndpoint(webhookId, requestId) ?? {
        status: "not_found",
      },
      requestId,
    );
  }

  @Post("tenant/webhooks/test")
  sendTestWebhook(
    @Body() command: SendTestWebhookCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    const result = this.tenantPartnerService.sendTestWebhook(
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

  @Post("tenant/webhooks/:webhookId/rotate-secret")
  rotateWebhookSecret(
    @Param("webhookId") webhookId: string,
    @Body()
    command: {
      secret: string;
      rotationReason?: string;
    },
    @Headers("x-request-id") requestId?: string,
  ) {
    const result = this.tenantPartnerService.rotateWebhookSecret(
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
  listWebhookDeliveries(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      {
        items: this.tenantPartnerService.listWebhookDeliveries(),
      },
      requestId,
    );
  }

  @Get("tenant/webhooks/:webhookId/deliveries")
  listWebhookDeliveriesByEndpoint(
    @Param("webhookId") webhookId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      {
        items:
          this.tenantPartnerService.listWebhookDeliveriesByWebhook(webhookId),
      },
      requestId,
    );
  }

  @Get("tenant/sla")
  getSlaProfile(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      this.tenantPartnerService.getSlaProfile(),
      requestId,
    );
  }

  @Post("tenant/sla")
  updateSlaProfile(
    @Body() command: UpdateTenantSlaProfileCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.tenantPartnerService.updateSlaProfile(command, requestId),
      requestId,
    );
  }

  @Get("tenant/audit")
  listTenantAudit(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      {
        items: this.tenantPartnerService.listTenantAudit(),
      },
      requestId,
    );
  }
}
