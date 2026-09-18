// Admin API for PartnerEntryNotificationBinding — SR-PARTNER-NOTIFY-ROUTE-20260917
// §3.2. Routes fall under the existing `platform-admin/` auth-policy prefix
// (apps/api/src/common/auth/auth.policy.ts), so no route-specific guard
// decorators are added here — same pattern as the other
// `platform-admin/partner-entries/*` handlers in tenant-partner.controller.ts.
//
// Deliberately not implemented here (design §3.2 lists them, but their
// backing table — mobility.phase1_partner_notification_delivery_contexts,
// migration V0105 — is allocated to SR-PARTNER-NOTIFY-ACK-20260917 /
// SR-PARTNER-NOTIFY-TRANSPORT-20260917, not this task):
//   GET  /api/platform-admin/partner-entries/{entrySlug}/notification-deliveries
//   POST /api/platform-admin/partner-entries/{entrySlug}/notification-deliveries/{outboxId}/retry

import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  Post,
  Put,
} from "@nestjs/common";

import type { PartnerPassengerEventType } from "@drts/contracts";

import { ApiRequestError, toApiSuccessEnvelope } from "../../common/api-envelope";
import { CurrentIdentity } from "../../common/auth";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { PartnerEntryNotificationBindingService } from "./partner-entry-notification-binding.service";

type PutNotificationBindingBody = {
  webhookId: string;
  eventTypes: PartnerPassengerEventType[];
  expectedVersion: number;
};

type BindingVersionBody = {
  expectedVersion: number;
};

function requireExpectedVersion(body: BindingVersionBody | undefined) {
  const expectedVersion = body?.expectedVersion;
  if (typeof expectedVersion !== "number" || !Number.isInteger(expectedVersion)) {
    throw new ApiRequestError(
      HttpStatus.BAD_REQUEST,
      "PARTNER_NOTIFICATION_BINDING_EXPECTED_VERSION_REQUIRED",
      "expectedVersion (integer) is required.",
    );
  }
  return expectedVersion;
}

@Controller()
export class PartnerEntryNotificationBindingController {
  constructor(
    private readonly bindingService: PartnerEntryNotificationBindingService,
  ) {}

  @Get("platform-admin/partner-entries/:entrySlug/notification-binding")
  async getBinding(
    @Param("entrySlug") entrySlug: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.bindingService.getBinding(entrySlug, identity),
      requestId,
    );
  }

  @Put("platform-admin/partner-entries/:entrySlug/notification-binding")
  async putBinding(
    @Param("entrySlug") entrySlug: string,
    @Body() body: PutNotificationBindingBody,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.bindingService.putBinding(
        entrySlug,
        {
          webhookId: body?.webhookId,
          eventTypes: body?.eventTypes,
          expectedVersion: requireExpectedVersion(body),
        },
        identity,
      ),
      requestId,
    );
  }

  @Post("platform-admin/partner-entries/:entrySlug/notification-binding/test")
  async testBinding(
    @Param("entrySlug") entrySlug: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.bindingService.testBinding(entrySlug, identity),
      requestId,
    );
  }

  @Post("platform-admin/partner-entries/:entrySlug/notification-binding/enable")
  async enableBinding(
    @Param("entrySlug") entrySlug: string,
    @Body() body: BindingVersionBody,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.bindingService.enableBinding(
        entrySlug,
        requireExpectedVersion(body),
        identity,
      ),
      requestId,
    );
  }

  @Post("platform-admin/partner-entries/:entrySlug/notification-binding/disable")
  async disableBinding(
    @Param("entrySlug") entrySlug: string,
    @Body() body: BindingVersionBody,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.bindingService.disableBinding(
        entrySlug,
        requireExpectedVersion(body),
        identity,
      ),
      requestId,
    );
  }
}
