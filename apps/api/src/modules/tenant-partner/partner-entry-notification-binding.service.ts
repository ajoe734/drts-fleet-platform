import {
  Injectable,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { randomUUID } from "crypto";

import {
  PartnerEntryNotificationBinding,
  PartnerPassengerEventType,
} from "@drts/contracts";
import { PartnerEntryNotificationBindingRepository } from "./partner-entry-notification-binding.repository";
import { TenantPartnerService } from "./tenant-partner.service";

export class UpdateBindingDto {
  webhookId!: string;
  eventTypes!: PartnerPassengerEventType[];
  expectedVersion?: number;
}

@Injectable()
export class PartnerEntryNotificationBindingService {
  constructor(
    private readonly bindingRepository: PartnerEntryNotificationBindingRepository,
    private readonly tenantPartnerService: TenantPartnerService,
  ) {}

  async getBinding(
    entrySlug: string,
  ): Promise<PartnerEntryNotificationBinding | null> {
    return this.bindingRepository.findByEntrySlug(entrySlug);
  }

  async updateBinding(
    entrySlug: string,
    dto: UpdateBindingDto,
  ): Promise<PartnerEntryNotificationBinding> {
    const entry = await this.tenantPartnerService.getPartnerEntry(entrySlug);
    if (!entry) {
      throw new NotFoundException(`Entry not found: ${entrySlug}`);
    }

    let binding = await this.bindingRepository.findByEntrySlug(entrySlug);
    if (binding) {
      const currentVersion = binding.version;
      if (
        dto.expectedVersion !== undefined &&
        currentVersion !== dto.expectedVersion
      ) {
        throw new ConflictException("Binding version mismatch");
      }
      binding.webhookId = dto.webhookId;
      binding.eventTypes = dto.eventTypes;
      binding.version += 1;
      binding.state = "test_pending";
      binding.validatedEndpointFingerprint = null;
      binding.validatedAt = null;
      binding.updatedAt = new Date().toISOString();

      const success = await this.bindingRepository.updateWithVersion(
        binding,
        currentVersion,
      );
      if (!success) {
        throw new ConflictException("Binding version mismatch");
      }
    } else {
      binding = {
        bindingId: randomUUID(),
        entrySlug: entry.entrySlug,
        tenantId: entry.tenantId,
        partnerId: entry.partnerId,
        webhookId: dto.webhookId,
        version: 1,
        state: "test_pending",
        purpose: "passenger_notification",
        eventTypes: dto.eventTypes,
        schemaVersion: "1.0",
        acknowledgementPolicy: "durable_partner_acceptance_v1",
        validatedEndpointFingerprint: null,
        validatedAt: null,
        updatedAt: new Date().toISOString(),
      };
      await this.bindingRepository.persist(binding);
    }

    return binding;
  }

  async enableBinding(
    entrySlug: string,
  ): Promise<PartnerEntryNotificationBinding> {
    const binding = await this.bindingRepository.findByEntrySlug(entrySlug);
    if (!binding) {
      throw new NotFoundException(`Binding not found for entry: ${entrySlug}`);
    }

    const endpoint = this.tenantPartnerService.getWebhookEndpoint(
      binding.tenantId,
      binding.webhookId,
    );
    if (!endpoint) {
      throw new ConflictException("Webhook endpoint not found");
    }

    const currentFingerprint = `${endpoint.url}|${endpoint.secretVersion}`;
    if (
      binding.validatedEndpointFingerprint !== currentFingerprint ||
      !binding.validatedAt
    ) {
      throw new ConflictException(
        "Binding has not passed contract tests for the current endpoint configuration.",
      );
    }

    binding.state = "ready";
    binding.updatedAt = new Date().toISOString();
    await this.bindingRepository.persist(binding);
    return binding;
  }

  async disableBinding(
    entrySlug: string,
  ): Promise<PartnerEntryNotificationBinding> {
    const binding = await this.bindingRepository.findByEntrySlug(entrySlug);
    if (!binding) {
      throw new NotFoundException(`Binding not found for entry: ${entrySlug}`);
    }
    binding.state = "disabled";
    binding.updatedAt = new Date().toISOString();
    await this.bindingRepository.persist(binding);
    return binding;
  }

  async testBinding(entrySlug: string): Promise<void> {
    const binding = await this.bindingRepository.findByEntrySlug(entrySlug);
    if (!binding) {
      throw new NotFoundException(`Binding not found for entry: ${entrySlug}`);
    }

    const endpoint = this.tenantPartnerService.getWebhookEndpoint(
      binding.tenantId,
      binding.webhookId,
    );
    if (!endpoint) {
      throw new NotFoundException("Webhook endpoint not found");
    }

    // Simulation for this task, would dispatch test payload
    binding.validatedEndpointFingerprint = `${endpoint.url}|${endpoint.secretVersion}`;
    binding.validatedAt = new Date().toISOString();
    binding.updatedAt = new Date().toISOString();
    await this.bindingRepository.persist(binding);
  }
}
