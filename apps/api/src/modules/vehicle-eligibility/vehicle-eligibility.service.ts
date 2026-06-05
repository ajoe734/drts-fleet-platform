import { Injectable, OnModuleInit, Optional } from "@nestjs/common";

import type {
  AuditLogRecord,
  IdentityContext,
  UpdateVehicleEligibilityMatrixCommand,
  VehicleEligibilityMatrixRecord,
} from "@drts/contracts";
import { SERVICE_PRODUCT_TYPES, VEHICLE_LICENSE_TYPES } from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import { VehicleEligibilityRepository } from "./vehicle-eligibility.repository";

const SERVICE_PRODUCT_TYPE_SET = new Set<string>(SERVICE_PRODUCT_TYPES);
const VEHICLE_LICENSE_TYPE_SET = new Set<string>(VEHICLE_LICENSE_TYPES);

type AuditActor = Pick<IdentityContext, "actorId" | "actorType" | "tenantId">;

@Injectable()
export class VehicleEligibilityService implements OnModuleInit {
  private matrix: VehicleEligibilityMatrixRecord[] = [];

  constructor(
    private readonly auditNotificationService: AuditNotificationService,
    @Optional() private readonly repository?: VehicleEligibilityRepository,
  ) {}

  async onModuleInit() {
    if (!this.repository) {
      return;
    }

    try {
      const items = await this.repository.loadAll();
      if (items.length === 0) {
        return;
      }
      this.matrix = items.map((item) => this.clone(item));
      this.sortMatrix();
    } catch (error) {
      this.repository.reportPersistenceFailure(error, "module init");
    }
  }

  listMatrix() {
    return this.matrix.map((item) => this.clone(item));
  }

  updateMatrix(
    command: UpdateVehicleEligibilityMatrixCommand,
    actor: AuditActor,
    requestId?: string,
  ) {
    if (!command || !Array.isArray(command.items)) {
      throw new ApiRequestError(
        400,
        "INVALID_VEHICLE_ELIGIBILITY_MATRIX",
        "Vehicle eligibility matrix payload must provide an items array.",
      );
    }

    const existing = this.listMatrix();
    const now = new Date().toISOString();
    const seenCapabilityIds = new Set<string>();

    const updated = command.items.map((item) => {
      this.validateMatrixItem(item);

      if (seenCapabilityIds.has(item.capabilityId)) {
        throw new ApiRequestError(
          400,
          "DUPLICATE_VEHICLE_ELIGIBILITY_CAPABILITY",
          `Duplicate capabilityId '${item.capabilityId}' is not allowed.`,
        );
      }
      seenCapabilityIds.add(item.capabilityId);

      const previous = existing.find(
        (candidate) => candidate.capabilityId === item.capabilityId,
      );

      return this.clone({
        ...item,
        createdAt: previous?.createdAt ?? item.createdAt ?? now,
        updatedAt: now,
      });
    });

    this.matrix = updated;
    this.sortMatrix();
    this.persist(this.matrix);
    this.recordAudit(
      {
        actorId: actor.actorId ?? null,
        actorType: this.toAuditActorType(actor.actorType),
        tenantId: actor.tenantId ?? null,
        moduleName: "vehicle-eligibility",
        actionName: "vehicle_eligibility_matrix.updated",
        resourceType: "vehicle_eligibility_matrix",
        resourceId: null,
        oldValuesSummary: {
          itemCount: existing.length,
          capabilityIds: existing.map((item) => item.capabilityId),
        },
        newValuesSummary: {
          itemCount: this.matrix.length,
          capabilityIds: this.matrix.map((item) => item.capabilityId),
          licenseTypes: [
            ...new Set(this.matrix.map((item) => item.licenseType)),
          ],
        },
      },
      requestId,
    );

    return this.listMatrix();
  }

  private validateMatrixItem(item: VehicleEligibilityMatrixRecord) {
    if (!item || typeof item !== "object") {
      throw new ApiRequestError(
        400,
        "INVALID_VEHICLE_ELIGIBILITY_ITEM",
        "Each vehicle eligibility matrix item must be an object.",
      );
    }

    if (!item.capabilityId?.trim()) {
      throw new ApiRequestError(
        400,
        "INVALID_VEHICLE_ELIGIBILITY_CAPABILITY",
        "capabilityId is required.",
      );
    }

    if (!VEHICLE_LICENSE_TYPE_SET.has(item.licenseType)) {
      throw new ApiRequestError(
        400,
        "INVALID_VEHICLE_LICENSE_TYPE",
        `Unsupported vehicle license type '${String(item.licenseType)}'.`,
      );
    }

    if (!Array.isArray(item.supportedProducts)) {
      throw new ApiRequestError(
        400,
        "INVALID_SUPPORTED_PRODUCTS",
        "supportedProducts must be an array.",
      );
    }

    const invalidProduct = item.supportedProducts.find(
      (product) => !SERVICE_PRODUCT_TYPE_SET.has(product),
    );
    if (invalidProduct) {
      throw new ApiRequestError(
        400,
        "INVALID_SERVICE_PRODUCT_TYPE",
        `Unsupported service product type '${invalidProduct}'.`,
      );
    }

    if (!Number.isInteger(item.seatCount) || item.seatCount <= 0) {
      throw new ApiRequestError(
        400,
        "INVALID_SEAT_COUNT",
        "seatCount must be a positive integer.",
      );
    }

    if (!Number.isInteger(item.luggageCapacity) || item.luggageCapacity < 0) {
      throw new ApiRequestError(
        400,
        "INVALID_LUGGAGE_CAPACITY",
        "luggageCapacity must be a non-negative integer.",
      );
    }

    this.assertIsoTimestamp(item.effectiveFrom, "effectiveFrom");
    if (item.effectiveUntil !== null) {
      this.assertIsoTimestamp(item.effectiveUntil, "effectiveUntil");
      if (Date.parse(item.effectiveUntil) <= Date.parse(item.effectiveFrom)) {
        throw new ApiRequestError(
          400,
          "INVALID_EFFECTIVE_RANGE",
          "effectiveUntil must be later than effectiveFrom.",
        );
      }
    }
  }

  private assertIsoTimestamp(value: string, field: string) {
    if (!value || Number.isNaN(Date.parse(value))) {
      throw new ApiRequestError(
        400,
        "INVALID_EFFECTIVE_TIMESTAMP",
        `${field} must be a valid ISO-8601 timestamp.`,
      );
    }
  }

  private sortMatrix() {
    this.matrix.sort((left, right) => {
      const licenseCompare = left.licenseType.localeCompare(right.licenseType);
      if (licenseCompare !== 0) {
        return licenseCompare;
      }

      return right.effectiveFrom.localeCompare(left.effectiveFrom);
    });
  }

  private clone(
    item: VehicleEligibilityMatrixRecord,
  ): VehicleEligibilityMatrixRecord {
    return {
      ...item,
      supportedProducts: [...item.supportedProducts],
    };
  }

  private persist(items: readonly VehicleEligibilityMatrixRecord[]) {
    if (!this.repository) {
      return;
    }

    void this.repository.replaceAll(items).catch((error: unknown) => {
      this.repository!.reportPersistenceFailure(error, "update_matrix");
    });
  }

  private recordAudit(
    input: Omit<AuditLogRecord, "auditId" | "createdAt" | "requestId">,
    requestId?: string,
  ) {
    const log = { ...input };
    if (requestId) {
      (log as AuditLogRecord & { requestId?: string }).requestId = requestId;
    }
    this.auditNotificationService.recordAuditLog(log);
  }

  private toAuditActorType(
    actorType: IdentityContext["actorType"] | null | undefined,
  ): AuditLogRecord["actorType"] {
    switch (actorType) {
      case "platform_admin":
      case "tenant_admin":
      case "ops_user":
      case "partner_api_key":
        return actorType;
      default:
        return "system";
    }
  }
}
