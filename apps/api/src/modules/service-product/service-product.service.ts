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

type NormalizedCreateServiceProductCommand = {
  serviceProductId?: string;
  serviceProductType: string;
  displayName: string;
  description?: string | null;
  timing: string;
  active?: boolean;
  defaultBillingMode: string;
  defaultProofRequirements?: string[];
};

type NormalizedUpdateServiceProductCommand = {
  displayName?: string;
  description?: string | null;
  timing?: string;
  active?: boolean;
  defaultBillingMode?: string;
  defaultProofRequirements?: string[];
};

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
    const normalizedCommand = this.normalizeCreateCommand(command);
    this.assertValidType(normalizedCommand.serviceProductType);
    this.assertValidTiming(normalizedCommand.timing);
    this.assertValidBillingMode(normalizedCommand.defaultBillingMode);

    const serviceProductId = this.resolveServiceProductId(normalizedCommand);
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
        (record) =>
          record.serviceProductType === normalizedCommand.serviceProductType,
      )
    ) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "CONFLICT",
        "Service product type already exists.",
        { serviceProductType: normalizedCommand.serviceProductType },
      );
    }

    const now = new Date().toISOString();
    const record: ServiceProductRecord = {
      serviceProductId,
      serviceProductType: normalizedCommand.serviceProductType,
      displayName: this.normalizeRequiredString(
        normalizedCommand.displayName,
        "displayName",
      ),
      description: this.normalizeOptionalString(normalizedCommand.description),
      timing: normalizedCommand.timing,
      active: normalizedCommand.active ?? true,
      defaultBillingMode: normalizedCommand.defaultBillingMode,
      defaultProofRequirements: this.normalizeProofRequirements(
        normalizedCommand.defaultProofRequirements,
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
    const normalizedCommand = this.normalizeUpdateCommand(command);
    const record = this.require(serviceProductId);

    if (normalizedCommand.timing !== undefined) {
      this.assertValidTiming(normalizedCommand.timing);
    }
    if (normalizedCommand.defaultBillingMode !== undefined) {
      this.assertValidBillingMode(normalizedCommand.defaultBillingMode);
    }

    const updated: ServiceProductRecord = {
      ...record,
      displayName:
        normalizedCommand.displayName !== undefined
          ? this.normalizeRequiredString(
              normalizedCommand.displayName,
              "displayName",
            )
          : record.displayName,
      description:
        normalizedCommand.description !== undefined
          ? this.normalizeOptionalString(normalizedCommand.description)
          : record.description,
      timing: normalizedCommand.timing ?? record.timing,
      active: normalizedCommand.active ?? record.active,
      defaultBillingMode:
        normalizedCommand.defaultBillingMode ?? record.defaultBillingMode,
      defaultProofRequirements:
        normalizedCommand.defaultProofRequirements !== undefined
          ? this.normalizeProofRequirements(
              normalizedCommand.defaultProofRequirements,
            )
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

  private resolveServiceProductId(
    command: NormalizedCreateServiceProductCommand,
  ) {
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

  private normalizeCreateCommand(
    command: CreateServiceProductCommand,
  ): NormalizedCreateServiceProductCommand {
    const payload = this.requireObject(command, "body");
    const normalized: NormalizedCreateServiceProductCommand = {
      serviceProductType: this.readRequiredString(
        payload,
        "serviceProductType",
        "serviceProductType",
      ),
      displayName: this.readRequiredString(
        payload,
        "displayName",
        "displayName",
      ),
      timing: this.readRequiredString(payload, "timing", "timing"),
      defaultBillingMode: this.readRequiredString(
        payload,
        "defaultBillingMode",
        "defaultBillingMode",
      ),
    };

    const serviceProductId = this.readOptionalString(
      payload,
      "serviceProductId",
      "serviceProductId",
    );
    if (serviceProductId !== undefined) {
      normalized.serviceProductId = serviceProductId;
    }

    const description = this.readOptionalNullableString(
      payload,
      "description",
      "description",
    );
    if (description !== undefined) {
      normalized.description = description;
    }

    const active = this.readOptionalBoolean(payload, "active", "active");
    if (active !== undefined) {
      normalized.active = active;
    }

    const defaultProofRequirements = this.readOptionalStringArray(
      payload,
      "defaultProofRequirements",
      "defaultProofRequirements",
    );
    if (defaultProofRequirements !== undefined) {
      normalized.defaultProofRequirements = defaultProofRequirements;
    }

    return normalized;
  }

  private normalizeUpdateCommand(
    command: UpdateServiceProductCommand,
  ): NormalizedUpdateServiceProductCommand {
    const payload = this.requireObject(command, "body");
    const normalized: NormalizedUpdateServiceProductCommand = {};

    const displayName = this.readOptionalString(
      payload,
      "displayName",
      "displayName",
    );
    if (displayName !== undefined) {
      normalized.displayName = displayName;
    }

    const description = this.readOptionalNullableString(
      payload,
      "description",
      "description",
    );
    if (description !== undefined) {
      normalized.description = description;
    }

    const timing = this.readOptionalString(payload, "timing", "timing");
    if (timing !== undefined) {
      normalized.timing = timing;
    }

    const active = this.readOptionalBoolean(payload, "active", "active");
    if (active !== undefined) {
      normalized.active = active;
    }

    const defaultBillingMode = this.readOptionalString(
      payload,
      "defaultBillingMode",
      "defaultBillingMode",
    );
    if (defaultBillingMode !== undefined) {
      normalized.defaultBillingMode = defaultBillingMode;
    }

    const defaultProofRequirements = this.readOptionalStringArray(
      payload,
      "defaultProofRequirements",
      "defaultProofRequirements",
    );
    if (defaultProofRequirements !== undefined) {
      normalized.defaultProofRequirements = defaultProofRequirements;
    }

    return normalized;
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

  private requireObject(value: unknown, field: string) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        `${field} must be an object.`,
        { field },
      );
    }

    return value as Record<string, unknown>;
  }

  private readRequiredString(
    payload: Record<string, unknown>,
    key: string,
    field: string,
  ) {
    const value = payload[key];
    if (value === undefined) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        `${field} is required.`,
        { field },
      );
    }
    if (typeof value !== "string") {
      this.throwTypeError(field, "string");
    }
    return value;
  }

  private readOptionalString(
    payload: Record<string, unknown>,
    key: string,
    field: string,
  ) {
    const value = payload[key];
    if (value === undefined) {
      return undefined;
    }
    if (typeof value !== "string") {
      this.throwTypeError(field, "string");
    }
    return value;
  }

  private readOptionalNullableString(
    payload: Record<string, unknown>,
    key: string,
    field: string,
  ) {
    const value = payload[key];
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return null;
    }
    if (typeof value !== "string") {
      this.throwTypeError(field, "string or null");
    }
    return value;
  }

  private readOptionalBoolean(
    payload: Record<string, unknown>,
    key: string,
    field: string,
  ) {
    const value = payload[key];
    if (value === undefined) {
      return undefined;
    }
    if (typeof value !== "boolean") {
      this.throwTypeError(field, "boolean");
    }
    return value;
  }

  private readOptionalStringArray(
    payload: Record<string, unknown>,
    key: string,
    field: string,
  ) {
    const value = payload[key];
    if (value === undefined) {
      return undefined;
    }
    if (!Array.isArray(value)) {
      this.throwTypeError(field, "string array");
    }
    for (const item of value) {
      if (typeof item !== "string") {
        this.throwTypeError(field, "string array");
      }
    }
    return value;
  }

  private throwTypeError(field: string, expected: string): never {
    throw new ApiRequestError(
      HttpStatus.BAD_REQUEST,
      "VALIDATION_ERROR",
      `${field} must be ${expected}.`,
      { field, expected },
    );
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
