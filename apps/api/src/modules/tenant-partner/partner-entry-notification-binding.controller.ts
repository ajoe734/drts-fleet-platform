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
  async getDeliveries(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    @Param("entrySlug") _entrySlug: string,
  ): Promise<any[]> {
    // Deliveries fetching not fully implemented for this route task
    return [];
  }

  @Post(":entrySlug/notification-deliveries/:outboxId/retry")
  async retryDelivery(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    @Param("entrySlug") _entrySlug: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    @Param("outboxId") _outboxId: string,
  ): Promise<{ status: "ok" }> {
    // Delivery retry not fully implemented for this route task
    return { status: "ok" };
  }
}
