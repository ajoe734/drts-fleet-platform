import { Req, ForbiddenException } from "@nestjs/common";
import { TenantPartnerService } from "./tenant-partner.service";
import {
  Controller,
  Get,
  Put,
  Post,
  Param,
  Body,
  UseGuards,
  NotFoundException,
  NotImplementedException,
} from "@nestjs/common";
import { PartnerEntryNotificationBinding } from "@drts/contracts";

import { BootstrapAuthGuard } from "../../common/auth/bootstrap-auth.guard";
import {
  PartnerEntryNotificationBindingService,
  UpdateBindingDto,
} from "./partner-entry-notification-binding.service";

@Controller("api/platform-admin/partner-entries")
@UseGuards(BootstrapAuthGuard)
export class PartnerEntryNotificationBindingController {
  constructor(
    private readonly bindingService: PartnerEntryNotificationBindingService,
    private readonly tenantPartnerService: TenantPartnerService,
  ) {}

  private async assertScope(req: any, entrySlug: string) {
    const identity = req.identity;
    if (!identity) throw new ForbiddenException("Missing identity");

    // Allow platform and ops to access any entry
    if (identity.realm === "platform" || identity.realm === "ops") return;

    // Otherwise, must be bound to the specific tenant
    const entry = await this.tenantPartnerService.getPartnerEntry(entrySlug);
    if (!entry) throw new NotFoundException(`Entry not found: ${entrySlug}`);
    if (identity.tenantId !== entry.tenantId) {
      throw new ForbiddenException("Cross-tenant access is forbidden");
    }

    // If it's a partner identity, it should also match the entrySlug
    if (
      identity.realm === "partner" &&
      identity.partnerEntrySlug &&
      identity.partnerEntrySlug !== entrySlug
    ) {
      throw new ForbiddenException("Cross-entry access is forbidden");
    }
  }

  @Get(":entrySlug/notification-binding")
  async getBinding(
    @Param("entrySlug") entrySlug: string,
    @Req() req: any,
  ): Promise<PartnerEntryNotificationBinding> {
    await this.assertScope(req, entrySlug);
    const binding = await this.bindingService.getBinding(entrySlug);
    if (!binding) {
      throw new NotFoundException(`No binding found for ${entrySlug}`);
    }
    return binding;
  }

  @Put(":entrySlug/notification-binding")
  async updateBinding(
    @Param("entrySlug") entrySlug: string,
    @Body() dto: UpdateBindingDto,
    @Req() req: any,
  ): Promise<PartnerEntryNotificationBinding> {
    await this.assertScope(req, entrySlug);
    return this.bindingService.updateBinding(entrySlug, dto);
  }

  @Post(":entrySlug/notification-binding/test")
  async testBinding(
    @Param("entrySlug") entrySlug: string,
    @Req() req: any,
  ): Promise<{ status: "ok" }> {
    await this.assertScope(req, entrySlug);
    await this.bindingService.testBinding(entrySlug);
    return { status: "ok" };
  }

  @Post(":entrySlug/notification-binding/enable")
  async enableBinding(
    @Param("entrySlug") entrySlug: string,
    @Req() req: any,
  ): Promise<PartnerEntryNotificationBinding> {
    await this.assertScope(req, entrySlug);
    return this.bindingService.enableBinding(entrySlug);
  }

  @Post(":entrySlug/notification-binding/disable")
  async disableBinding(
    @Param("entrySlug") entrySlug: string,
    @Req() req: any,
  ): Promise<PartnerEntryNotificationBinding> {
    await this.assertScope(req, entrySlug);
    return this.bindingService.disableBinding(entrySlug);
  }

  @Get(":entrySlug/notification-deliveries")
  async getDeliveries(): Promise<any[]> {
    // Descoped for SR-PARTNER-NOTIFY-ROUTE-20260917.
    // Delivery tracking relies on delivery contexts and the outbox which
    // is fully implemented in the subsequent TRANSPORT/ACK tasks (V0105).
    throw new NotImplementedException(
      "Notification delivery fetching is descoped to TRANSPORT task",
    );
  }

  @Post(":entrySlug/notification-deliveries/:outboxId/retry")
  async retryDelivery(): Promise<{ status: "ok" }> {
    // Descoped for SR-PARTNER-NOTIFY-ROUTE-20260917.
    // Delivery retries involve interaction with the new transport layer and
    // delivery contexts, which will be implemented in the subsequent TRANSPORT/ACK tasks (V0105).
    throw new NotImplementedException(
      "Notification delivery retry is descoped to TRANSPORT task",
    );
  }
}
