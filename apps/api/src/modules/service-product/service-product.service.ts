import { HttpStatus, Injectable, OnModuleInit, Optional } from "@nestjs/common";

import type { AuditLogRecord } from "@drts/contracts";

import type { AuditedActionResult } from "../../common/action-receipt";
import { ApiRequestError } from "../../common/api-envelope";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import { ServiceProductRepository } from "./service-product.repository";
import type {
  CreateServiceProductCommand,
  ServiceProductBillingMode,
  ServiceProductRecord,
  ServiceTiming,
  ServiceProductType,
  UpdateServiceProductCommand,
} from "./service-product.types";
import {
  SERVICE_PRODUCT_BILLING_MODE_VALUES,
  SERVICE_PRODUCT_TYPE_VALUES,
  SERVICE_TIMING_VALUES,
} from "./service-product.types";

@Injectable()
export class ServiceProductService implements OnModuleInit {
  private sequence = 1;
  private records: ServiceProductRecord[] = [];

  constructor(
    private readonly auditNotificationService: AuditNotificationService,
    @Optional() private readonly repository?: ServiceProductRepository,
  ) {}

  async onModuleInit() {
    if (!this.repository) {
      return;
    }

    try {
      const state = await this.repository.loadState();
      if (state.records.length === 0) {
        return;
      }

      this.records = state.records.map((record) => this.cloneRecord(record));
      this.sequence = this.deriveNextSequence(state.records);
    } catch (error) {
      this.repository.reportPersistenceFailure(error, "module init");
    }
  }

  listServiceProducts() {
    return this.records.map((record) => this.cloneRecord(record));
  }

  getServiceProduct(serviceProductId: string) {
    return this.cloneRecord(this.require(serviceProductId));
  }

  createServiceProduct(
    command: CreateServiceProductCommand,
    requestId: string | undefined,
    options: { captureAudit: true },
  ): AuditedActionResult<ServiceProductRecord>;
  createServiceProduct(
    command: CreateServiceProductCommand,
    requestId?: string,
    options?: { captureAudit?: false },
  ): ServiceProductRecord;
  createServiceProduct(
    command: CreateServiceProductCommand,
    requestId?: string,
    options?: { captureAudit?: boolean },
  ) {
    this.assertValidType(command.serviceProductType);
    this.assertValidTiming(command.timing);
    this.assertValidBillingMode(command.defaultBillingMode);

    const serviceProductId = this.resolveServiceProductId(command);
    if (
      this.records.some(
        (record) => record.serviceProductId === serviceProductId,
      )
    ) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "CONFLICT",
        "Service product ID already exists.",
        { serviceProductId },
      );
    }
    if (
      this.records.some(
        (record) => record.serviceProductType === command.serviceProductType,
      )
    ) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "CONFLICT",
        "Service product type already exists.",
        { serviceProductType: command.serviceProductType },
      );
    }

    const now = new Date().toISOString();
    const record: ServiceProductRecord = {
      serviceProductId,
      serviceProductType: command.serviceProductType,
      displayName: this.normalizeRequiredString(
        command.displayName,
        "displayName",
      ),
      description: this.normalizeOptionalString(command.description),
      timing: command.timing,
      active: command.active ?? true,
      defaultBillingMode: command.defaultBillingMode,
      defaultProofRequirements: this.normalizeProofRequirements(
        command.defaultProofRequirements,
      ),
      createdAt: now,
      updatedAt: now,
    };

    this.records = [record, ...this.records];
    this.persist({ records: [record] }, "create_service_product");
    const auditLog = this.recordAudit(
      {
        actorId: null,
        actorType: "platform_admin",
        tenantId: null,
        moduleName: "service-product",
        actionName: "create_service_product",
        resourceType: "service_product",
        resourceId: record.serviceProductId,
        newValuesSummary: {
          serviceProductType: record.serviceProductType,
          timing: record.timing,
          active: record.active,
          defaultBillingMode: record.defaultBillingMode,
          defaultProofRequirements: [...record.defaultProofRequirements],
        },
      },
      requestId,
    );

    const snapshot = this.cloneRecord(record);
    if (options?.captureAudit) {
      return { data: snapshot, auditLog };
    }

    return snapshot;
  }

  updateServiceProduct(
    serviceProductId: string,
    command: UpdateServiceProductCommand,
    requestId: string | undefined,
    options: { captureAudit: true },
  ): AuditedActionResult<ServiceProductRecord>;
  updateServiceProduct(
    serviceProductId: string,
    command: UpdateServiceProductCommand,
    requestId?: string,
    options?: { captureAudit?: false },
  ): ServiceProductRecord;
  updateServiceProduct(
    serviceProductId: string,
    command: UpdateServiceProductCommand,
    requestId?: string,
    options?: { captureAudit?: boolean },
  ) {
    const record = this.require(serviceProductId);

    if (command.timing !== undefined) {
      this.assertValidTiming(command.timing);
    }
    if (command.defaultBillingMode !== undefined) {
      this.assertValidBillingMode(command.defaultBillingMode);
    }

    const updated: ServiceProductRecord = {
      ...record,
      displayName:
        command.displayName !== undefined
          ? this.normalizeRequiredString(command.displayName, "displayName")
          : record.displayName,
      description:
        command.description !== undefined
          ? this.normalizeOptionalString(command.description)
          : record.description,
      timing: command.timing ?? record.timing,
      active: command.active ?? record.active,
      defaultBillingMode:
        command.defaultBillingMode ?? record.defaultBillingMode,
      defaultProofRequirements:
        command.defaultProofRequirements !== undefined
          ? this.normalizeProofRequirements(command.defaultProofRequirements)
          : [...record.defaultProofRequirements],
      updatedAt: new Date().toISOString(),
    };

    this.records = this.records.map((candidate) =>
      candidate.serviceProductId === serviceProductId ? updated : candidate,
    );
    this.persist({ records: [updated] }, "update_service_product");
    const auditLog = this.recordAudit(
      {
        actorId: null,
        actorType: "platform_admin",
        tenantId: null,
        moduleName: "service-product",
        actionName: "update_service_product",
        resourceType: "service_product",
        resourceId: serviceProductId,
        newValuesSummary: {
          timing: updated.timing,
          active: updated.active,
          defaultBillingMode: updated.defaultBillingMode,
          defaultProofRequirements: [...updated.defaultProofRequirements],
        },
      },
      requestId,
    );

    const snapshot = this.cloneRecord(updated);
    if (options?.captureAudit) {
      return { data: snapshot, auditLog };
    }

    return snapshot;
  }

  private require(serviceProductId: string) {
    const normalizedId = this.normalizeRequiredString(
      serviceProductId,
      "serviceProductId",
    );
    const record = this.records.find(
      (candidate) => candidate.serviceProductId === normalizedId,
    );

    if (!record) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "NOT_FOUND",
        "Service product not found.",
        { serviceProductId: normalizedId },
      );
    }

    return record;
  }

  private deriveNextSequence(records: readonly ServiceProductRecord[]) {
    const maxSeq = records.reduce((max, record) => {
      const match = /^SVP-(\d+)$/.exec(record.serviceProductId);
      return match ? Math.max(max, Number.parseInt(match[1]!, 10)) : max;
    }, 0);
    return maxSeq + 1;
  }

  private resolveServiceProductId(command: CreateServiceProductCommand) {
    const providedId = this.normalizeOptionalString(command.serviceProductId);
    if (providedId) {
      return providedId;
    }
    return `SVP-${String(this.sequence++).padStart(6, "0")}`;
  }

  private persist(
    changes: { records?: readonly ServiceProductRecord[] },
    context: string,
  ) {
    if (!this.repository) {
      return;
    }

    const payload: { records?: ServiceProductRecord[] } = {};
    if (changes.records) {
      payload.records = changes.records.map((record) =>
        this.cloneRecord(record),
      );
    }

    void this.repository.persistChanges(payload).catch((error: unknown) => {
      this.repository!.reportPersistenceFailure(error, context);
    });
  }

  private recordAudit(
    input: Omit<AuditLogRecord, "auditId" | "createdAt" | "requestId">,
    requestId?: string,
  ) {
    const log = { ...input };
    if (requestId) {
      (log as { requestId?: string }).requestId = requestId;
    }
    return this.auditNotificationService.recordAuditLog(log);
  }

  private cloneRecord(record: ServiceProductRecord): ServiceProductRecord {
    return {
      ...record,
      defaultProofRequirements: [...record.defaultProofRequirements],
    };
  }

  private normalizeRequiredString(value: string, field: string) {
    const normalized = value.trim();
    if (!normalized) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        `${field} is required.`,
        { field },
      );
    }
    return normalized;
  }

  private normalizeOptionalString(value?: string | null) {
    if (value === undefined || value === null) {
      return null;
    }

    const normalized = value.trim();
    return normalized.length === 0 ? null : normalized;
  }

  private normalizeProofRequirements(values?: string[]) {
    const unique = new Set<string>();

    for (const value of values ?? []) {
      const normalized = value.trim();
      if (normalized) {
        unique.add(normalized);
      }
    }

    return [...unique];
  }

  private assertValidType(type: string): asserts type is ServiceProductType {
    if (!SERVICE_PRODUCT_TYPE_VALUES.includes(type as ServiceProductType)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "Invalid service product type.",
        { serviceProductType: type },
      );
    }
  }

  private assertValidTiming(timing: string): asserts timing is ServiceTiming {
    if (!SERVICE_TIMING_VALUES.includes(timing as ServiceTiming)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "Invalid service timing.",
        { timing },
      );
    }
  }

  private assertValidBillingMode(
    billingMode: string,
  ): asserts billingMode is ServiceProductBillingMode {
    if (
      !SERVICE_PRODUCT_BILLING_MODE_VALUES.includes(
        billingMode as ServiceProductBillingMode,
      )
    ) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "Invalid default billing mode.",
        { defaultBillingMode: billingMode },
      );
    }
  }
}
