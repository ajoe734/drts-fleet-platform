import { HttpStatus, Injectable, OnModuleInit, Optional } from "@nestjs/common";

import {
  VEHICLE_LICENSE_TYPES,
  type AuditLogRecord,
  type VehicleLicenseType,
} from "@drts/contracts";

import type { AuditedActionResult } from "../../common/action-receipt";
import { ApiRequestError } from "../../common/api-envelope";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import { ServiceProductRepository } from "./service-product.repository";
import type {
  CreateServiceProductCommand,
  RuntimeProfileServiceProductPolicy,
  ServiceProductBillingMode,
  ServiceProductRecord,
  ServiceTiming,
  ServiceProductType,
  UpdateServiceProductCommand,
  UpsertRuntimeProfileServiceProductPolicyCommand,
} from "./service-product.types";
import {
  SERVICE_PRODUCT_BILLING_MODE_VALUES,
  SERVICE_PRODUCT_TYPE_VALUES,
  SERVICE_TIMING_VALUES,
} from "./service-product.types";

const DEFAULT_RUNTIME_SERVICE_PRODUCTS: ServiceProductRecord[] = [
  {
    serviceProductId: "seed-taxi-realtime",
    serviceProductType: "taxi_realtime",
    displayName: "Taxi Realtime",
    description: null,
    timing: "realtime",
    active: true,
    allowedLicenseTypes: ["taxi", "multi_purpose_taxi"],
    meterRequired: true,
    fixedFareAllowed: false,
    defaultBillingMode: "meter",
    defaultProofRequirements: [],
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
  },
  {
    serviceProductId: "seed-taxi-reservation",
    serviceProductType: "taxi_reservation",
    displayName: "Taxi Reservation",
    description: null,
    timing: "reservation",
    active: false,
    allowedLicenseTypes: ["taxi", "multi_purpose_taxi"],
    meterRequired: true,
    fixedFareAllowed: false,
    defaultBillingMode: "meter",
    defaultProofRequirements: [],
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
  },
  {
    serviceProductId: "seed-enterprise-dispatch",
    serviceProductType: "enterprise_dispatch",
    displayName: "Enterprise Dispatch",
    description: null,
    timing: "reservation",
    active: true,
    allowedLicenseTypes: [
      "taxi",
      "multi_purpose_taxi",
      "rental_car",
      "business_vehicle",
    ],
    meterRequired: false,
    fixedFareAllowed: true,
    defaultBillingMode: "tenant_invoice",
    defaultProofRequirements: ["photo"],
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
  },
  {
    serviceProductId: "seed-credit-card-airport-transfer",
    serviceProductType: "credit_card_airport_transfer",
    displayName: "Credit Card Airport Transfer",
    description: null,
    timing: "reservation",
    active: true,
    allowedLicenseTypes: [
      "multi_purpose_taxi",
      "rental_car",
      "business_vehicle",
      "airport_transfer_vehicle",
    ],
    meterRequired: false,
    fixedFareAllowed: true,
    defaultBillingMode: "fixed_fare",
    defaultProofRequirements: ["photo", "signoff"],
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
  },
  {
    serviceProductId: "seed-insurance-replacement-vehicle",
    serviceProductType: "insurance_replacement_vehicle",
    displayName: "Insurance Replacement Vehicle",
    description: null,
    timing: "reservation",
    active: false,
    allowedLicenseTypes: ["rental_car", "business_vehicle"],
    meterRequired: false,
    fixedFareAllowed: true,
    defaultBillingMode: "partner_settlement",
    defaultProofRequirements: ["photo"],
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
  },
  {
    serviceProductId: "seed-travel-agency-transfer",
    serviceProductType: "travel_agency_transfer",
    displayName: "Travel Agency Transfer",
    description: null,
    timing: "reservation",
    active: false,
    allowedLicenseTypes: ["business_vehicle", "airport_transfer_vehicle"],
    meterRequired: false,
    fixedFareAllowed: true,
    defaultBillingMode: "partner_settlement",
    defaultProofRequirements: ["photo", "signoff"],
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
  },
  {
    serviceProductId: "seed-third-party-forwarded-order",
    serviceProductType: "third_party_forwarded_order",
    displayName: "Third-party Forwarded Order",
    description: null,
    timing: "external_defined",
    active: true,
    allowedLicenseTypes: ["taxi", "multi_purpose_taxi"],
    meterRequired: false,
    fixedFareAllowed: false,
    defaultBillingMode: "external_platform_settlement",
    defaultProofRequirements: [],
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
  },
];

const VEHICLE_LICENSE_TYPE_SET = new Set<string>(VEHICLE_LICENSE_TYPES);

type NormalizedCreateServiceProductCommand = {
  serviceProductId?: string;
  serviceProductType: string;
  displayName: string;
  description?: string | null;
  timing: string;
  active?: boolean;
  allowedLicenseTypes?: VehicleLicenseType[];
  meterRequired?: boolean;
  fixedFareAllowed?: boolean;
  defaultBillingMode: string;
  defaultProofRequirements?: string[];
};

type NormalizedUpdateServiceProductCommand = {
  displayName?: string;
  description?: string | null;
  timing?: string;
  active?: boolean;
  allowedLicenseTypes?: VehicleLicenseType[];
  meterRequired?: boolean;
  fixedFareAllowed?: boolean;
  defaultBillingMode?: string;
  defaultProofRequirements?: string[];
};

@Injectable()
export class ServiceProductService implements OnModuleInit {
  private sequence = 1;
  private records: ServiceProductRecord[] = [];
  private runtimePolicies: RuntimeProfileServiceProductPolicy[] = [];

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
      if (state.records.length === 0 && state.runtimePolicies.length === 0) {
        return;
      }

      this.records = state.records.map((record) => this.hydrateRecord(record));
      this.runtimePolicies = state.runtimePolicies.map((policy) => ({
        ...policy,
      }));
      this.sequence = this.deriveNextSequence(state.records);
    } catch (error) {
      this.repository.reportPersistenceFailure(error, "module init");
    }
  }

  listServiceProducts() {
    return this.records.map((record) => this.cloneRecord(record));
  }

  listRuntimeServiceProducts() {
    const recordsByType = new Map(
      this.records.map((record) => [record.serviceProductType, record]),
    );

    return DEFAULT_RUNTIME_SERVICE_PRODUCTS.map((record) =>
      this.cloneRecord(
        this.hydrateRecord(
          recordsByType.get(record.serviceProductType) ?? record,
        ),
      ),
    );
  }

  listRuntimeProfilePolicies() {
    return this.runtimePolicies.map((policy) => ({ ...policy }));
  }

  upsertRuntimeProfilePolicy(
    command: UpsertRuntimeProfileServiceProductPolicyCommand,
  ) {
    if (
      !["ordinary_taxi", "multi_taxi_direct", "business_dispatch"].includes(
        command.runtimeProfileCode,
      )
    ) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "RUNTIME_PROFILE_INVALID",
        "Invalid runtime profile code.",
      );
    }
    this.assertValidType(command.serviceProductCode);
    const effectiveFrom = this.requirePolicyTimestamp(
      command.effectiveFrom,
      "effectiveFrom",
    );
    const effectiveUntil = command.effectiveUntil
      ? this.requirePolicyTimestamp(command.effectiveUntil, "effectiveUntil")
      : null;
    if (
      effectiveUntil !== null &&
      Date.parse(effectiveUntil) <= Date.parse(effectiveFrom)
    ) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "RUNTIME_PROFILE_POLICY_WINDOW_INVALID",
        "effectiveUntil must be after effectiveFrom.",
      );
    }

    const now = new Date().toISOString();
    const existing = this.runtimePolicies.find(
      (policy) =>
        policy.runtimeProfileCode === command.runtimeProfileCode &&
        policy.serviceProductCode === command.serviceProductCode,
    );
    const policy: RuntimeProfileServiceProductPolicy = {
      runtimeProfileCode: command.runtimeProfileCode,
      serviceProductCode: command.serviceProductCode,
      active: command.active,
      effectiveFrom,
      effectiveUntil,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.runtimePolicies = [
      policy,
      ...this.runtimePolicies.filter(
        (candidate) =>
          candidate.runtimeProfileCode !== policy.runtimeProfileCode ||
          candidate.serviceProductCode !== policy.serviceProductCode,
      ),
    ];
    this.persist({ runtimePolicies: [policy] }, "upsert runtime policy");
    return { ...policy };
  }

  assertRuntimeProfileServiceProductActive(
    runtimeProfileCode: RuntimeProfileServiceProductPolicy["runtimeProfileCode"],
    serviceProductCode: ServiceProductType,
  ) {
    const now = Date.now();
    const policy = this.runtimePolicies.find(
      (candidate) =>
        candidate.runtimeProfileCode === runtimeProfileCode &&
        candidate.serviceProductCode === serviceProductCode &&
        candidate.active &&
        Date.parse(candidate.effectiveFrom) <= now &&
        (candidate.effectiveUntil === null ||
          Date.parse(candidate.effectiveUntil) > now),
    );
    if (!policy) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "MULTI_TAXI_SERVICE_PRODUCT_NOT_ALLOWED",
        "The service product is not active for the resolved runtime profile.",
        { runtimeProfileCode, serviceProductCode },
      );
    }
    return { ...policy };
  }

  getRuntimeServiceProductByType(serviceProductType: ServiceProductType) {
    const record =
      this.records.find(
        (candidate) => candidate.serviceProductType === serviceProductType,
      ) ??
      DEFAULT_RUNTIME_SERVICE_PRODUCTS.find(
        (candidate) => candidate.serviceProductType === serviceProductType,
      );

    return record ? this.cloneRecord(this.hydrateRecord(record)) : null;
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

    const serviceProductType =
      normalizedCommand.serviceProductType as ServiceProductType;
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
        (record) => record.serviceProductType === serviceProductType,
      )
    ) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "CONFLICT",
        "Service product type already exists.",
        { serviceProductType },
      );
    }

    const defaults = this.getDefaultRecord(serviceProductType);
    const now = new Date().toISOString();
    const record: ServiceProductRecord = {
      serviceProductId,
      serviceProductType,
      displayName: this.normalizeRequiredString(
        normalizedCommand.displayName,
        "displayName",
      ),
      description: this.normalizeOptionalString(normalizedCommand.description),
      timing: normalizedCommand.timing as ServiceTiming,
      active: normalizedCommand.active ?? true,
      allowedLicenseTypes: this.resolveAllowedLicenseTypes(
        serviceProductType,
        normalizedCommand.allowedLicenseTypes ?? defaults.allowedLicenseTypes,
      ),
      meterRequired: normalizedCommand.meterRequired ?? defaults.meterRequired,
      fixedFareAllowed:
        normalizedCommand.fixedFareAllowed ?? defaults.fixedFareAllowed,
      defaultBillingMode:
        normalizedCommand.defaultBillingMode as ServiceProductBillingMode,
      defaultProofRequirements: this.normalizeProofRequirements(
        normalizedCommand.defaultProofRequirements,
      ),
      createdAt: now,
      updatedAt: now,
    };

    const hydratedRecord = this.hydrateRecord(record);
    this.records = [hydratedRecord, ...this.records];
    this.persist({ records: [hydratedRecord] }, "create_service_product");
    const auditLog = this.recordAudit(
      {
        actorId: null,
        actorType: "platform_admin",
        tenantId: null,
        moduleName: "service-product",
        actionName: "create_service_product",
        resourceType: "service_product",
        resourceId: hydratedRecord.serviceProductId,
        newValuesSummary: {
          serviceProductType: hydratedRecord.serviceProductType,
          timing: hydratedRecord.timing,
          active: hydratedRecord.active,
          allowedLicenseTypes: [...hydratedRecord.allowedLicenseTypes],
          meterRequired: hydratedRecord.meterRequired,
          fixedFareAllowed: hydratedRecord.fixedFareAllowed,
          defaultBillingMode: hydratedRecord.defaultBillingMode,
          defaultProofRequirements: [
            ...hydratedRecord.defaultProofRequirements,
          ],
        },
      },
      requestId,
    );

    const snapshot = this.cloneRecord(hydratedRecord);
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

    const updated: ServiceProductRecord = this.hydrateRecord({
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
      timing:
        (normalizedCommand.timing as ServiceTiming | undefined) ??
        record.timing,
      active: normalizedCommand.active ?? record.active,
      allowedLicenseTypes:
        normalizedCommand.allowedLicenseTypes !== undefined
          ? this.resolveAllowedLicenseTypes(
              record.serviceProductType,
              normalizedCommand.allowedLicenseTypes,
            )
          : [...record.allowedLicenseTypes],
      meterRequired: normalizedCommand.meterRequired ?? record.meterRequired,
      fixedFareAllowed:
        normalizedCommand.fixedFareAllowed ?? record.fixedFareAllowed,
      defaultBillingMode:
        (normalizedCommand.defaultBillingMode as
          | ServiceProductBillingMode
          | undefined) ?? record.defaultBillingMode,
      defaultProofRequirements:
        normalizedCommand.defaultProofRequirements !== undefined
          ? this.normalizeProofRequirements(
              normalizedCommand.defaultProofRequirements,
            )
          : [...record.defaultProofRequirements],
      updatedAt: new Date().toISOString(),
    });

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
          allowedLicenseTypes: [...updated.allowedLicenseTypes],
          meterRequired: updated.meterRequired,
          fixedFareAllowed: updated.fixedFareAllowed,
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

  private getDefaultRecord(serviceProductType: ServiceProductType) {
    const record = DEFAULT_RUNTIME_SERVICE_PRODUCTS.find(
      (candidate) => candidate.serviceProductType === serviceProductType,
    );
    if (!record) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "Invalid service product type.",
        { serviceProductType },
      );
    }
    return record;
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
    changes: {
      records?: readonly ServiceProductRecord[];
      runtimePolicies?: readonly RuntimeProfileServiceProductPolicy[];
    },
    context: string,
  ) {
    if (!this.repository) {
      return;
    }

    const payload: {
      records?: ServiceProductRecord[];
      runtimePolicies?: RuntimeProfileServiceProductPolicy[];
    } = {};
    if (changes.records) {
      payload.records = changes.records.map((record) =>
        this.cloneRecord(record),
      );
    }
    if (changes.runtimePolicies) {
      payload.runtimePolicies = changes.runtimePolicies.map((policy) => ({
        ...policy,
      }));
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
      allowedLicenseTypes: [...record.allowedLicenseTypes],
      defaultProofRequirements: [...record.defaultProofRequirements],
    };
  }

  private requirePolicyTimestamp(value: string, field: string) {
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "RUNTIME_PROFILE_POLICY_TIMESTAMP_INVALID",
        `${field} must be an ISO-8601 timestamp.`,
        { field },
      );
    }
    return new Date(timestamp).toISOString();
  }

  private hydrateRecord(record: ServiceProductRecord): ServiceProductRecord {
    const defaults = this.getDefaultRecord(record.serviceProductType);

    return {
      ...record,
      allowedLicenseTypes: this.resolveAllowedLicenseTypes(
        record.serviceProductType,
        Array.isArray(record.allowedLicenseTypes)
          ? record.allowedLicenseTypes
          : defaults.allowedLicenseTypes,
      ),
      meterRequired:
        typeof record.meterRequired === "boolean"
          ? record.meterRequired
          : defaults.meterRequired,
      fixedFareAllowed:
        typeof record.fixedFareAllowed === "boolean"
          ? record.fixedFareAllowed
          : defaults.fixedFareAllowed,
      defaultProofRequirements: this.normalizeProofRequirements(
        record.defaultProofRequirements,
      ),
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

    const timing = this.readOptionalString(payload, "timing", "timing");
    if (timing !== undefined) {
      normalized.timing = timing;
    }

    const active = this.readOptionalBoolean(payload, "active", "active");
    if (active !== undefined) {
      normalized.active = active;
    }

    const allowedLicenseTypes = this.readOptionalVehicleLicenseTypeArray(
      payload,
      "allowedLicenseTypes",
      "allowedLicenseTypes",
    );
    if (allowedLicenseTypes !== undefined) {
      normalized.allowedLicenseTypes = allowedLicenseTypes;
    }

    const meterRequired = this.readOptionalBoolean(
      payload,
      "meterRequired",
      "meterRequired",
    );
    if (meterRequired !== undefined) {
      normalized.meterRequired = meterRequired;
    }

    const fixedFareAllowed = this.readOptionalBoolean(
      payload,
      "fixedFareAllowed",
      "fixedFareAllowed",
    );
    if (fixedFareAllowed !== undefined) {
      normalized.fixedFareAllowed = fixedFareAllowed;
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

    const allowedLicenseTypes = this.readOptionalVehicleLicenseTypeArray(
      payload,
      "allowedLicenseTypes",
      "allowedLicenseTypes",
    );
    if (allowedLicenseTypes !== undefined) {
      normalized.allowedLicenseTypes = allowedLicenseTypes;
    }

    const meterRequired = this.readOptionalBoolean(
      payload,
      "meterRequired",
      "meterRequired",
    );
    if (meterRequired !== undefined) {
      normalized.meterRequired = meterRequired;
    }

    const fixedFareAllowed = this.readOptionalBoolean(
      payload,
      "fixedFareAllowed",
      "fixedFareAllowed",
    );
    if (fixedFareAllowed !== undefined) {
      normalized.fixedFareAllowed = fixedFareAllowed;
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

  private resolveAllowedLicenseTypes(
    serviceProductType: ServiceProductType,
    values: readonly VehicleLicenseType[],
  ) {
    const unique = new Set<VehicleLicenseType>();

    for (const value of values) {
      if (!VEHICLE_LICENSE_TYPE_SET.has(value)) {
        throw new ApiRequestError(
          HttpStatus.BAD_REQUEST,
          "VALIDATION_ERROR",
          `Unsupported vehicle license type '${value}'.`,
          { field: "allowedLicenseTypes", vehicleLicenseType: value },
        );
      }
      unique.add(value);
    }

    if (unique.size === 0) {
      return [...this.getDefaultRecord(serviceProductType).allowedLicenseTypes];
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

  private readOptionalVehicleLicenseTypeArray(
    payload: Record<string, unknown>,
    key: string,
    field: string,
  ) {
    const value = this.readOptionalStringArray(payload, key, field);
    if (value === undefined) {
      return undefined;
    }

    return value.map((item) => {
      if (!VEHICLE_LICENSE_TYPE_SET.has(item)) {
        throw new ApiRequestError(
          HttpStatus.BAD_REQUEST,
          "VALIDATION_ERROR",
          `Unsupported vehicle license type '${item}'.`,
          { field, vehicleLicenseType: item },
        );
      }
      return item as VehicleLicenseType;
    });
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
