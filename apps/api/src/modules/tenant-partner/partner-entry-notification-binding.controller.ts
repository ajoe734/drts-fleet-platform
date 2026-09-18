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

import { JwtAuthGuard } from "../../common/auth/jwt-auth.guard";
import { PartnerEntryNotificationBindingService, UpdateBindingDto } from "./partner-entry-notification-binding.service";

@Controller("api/platform-admin/partner-entries")
@UseGuards(JwtAuthGuard)
export class PartnerEntryNotificationBindingController {
  constructor(private readonly bindingService: PartnerEntryNotificationBindingService) {}

  @Get(":entrySlug/notification-binding")
  async getBinding(
    @Param("entrySlug") entrySlug: string,
  ): Promise<PartnerEntryNotificationBinding> {
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
  ): Promise<PartnerEntryNotificationBinding> {
    return this.bindingService.updateBinding(entrySlug, dto);
  }

  @Post(":entrySlug/notification-binding/test")
  async testBinding(
    @Param("entrySlug") entrySlug: string,
  ): Promise<{ status: "ok" }> {
    await this.bindingService.testBinding(entrySlug);
    return { status: "ok" };
  }

  @Post(":entrySlug/notification-binding/enable")
  async enableBinding(
    @Param("entrySlug") entrySlug: string,
  ): Promise<PartnerEntryNotificationBinding> {
    return this.bindingService.enableBinding(entrySlug);
  }

  @Post(":entrySlug/notification-binding/disable")
  async disableBinding(
    @Param("entrySlug") entrySlug: string,
  ): Promise<PartnerEntryNotificationBinding> {
    return this.bindingService.disableBinding(entrySlug);
  }

  @Get(":entrySlug/notification-deliveries")
  async getDeliveries(
    @Param("entrySlug") entrySlug: string,
  ): Promise<any[]> {
    // Deliveries fetching not fully implemented for this route task
    return [];
  }

  @Post(":entrySlug/notification-deliveries/:outboxId/retry")
  async retryDelivery(
    @Param("entrySlug") entrySlug: string,
    @Param("outboxId") outboxId: string,
  ): Promise<{ status: "ok" }> {
    // Delivery retry not fully implemented for this route task
    return { status: "ok" };
  }
}
