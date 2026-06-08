import { HttpStatus, Injectable, OnModuleInit, Optional } from "@nestjs/common";

import type {
  AuditLogRecord,
  DispatchCandidate,
  IdentityContext,
  OwnedOrderRecord,
  Phase1ServiceBucket,
  ServiceProductType,
  UpdateVehicleEligibilityMatrixCommand,
  VehicleEligibilityMatrixRecord,
  VehicleLicenseType,
} from "@drts/contracts";
import { SERVICE_PRODUCT_TYPES, VEHICLE_LICENSE_TYPES } from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import { RegulatoryRegistryService } from "../regulatory-registry/regulatory-registry.service";
import { ServiceProductService } from "../service-product/service-product.service";
import { VehicleEligibilityRepository } from "./vehicle-eligibility.repository";

type ServiceProductDefinition = {
  serviceProduct: ServiceProductType;
  displayName: string;
  timing: ServiceTiming;
  active: boolean;
  serviceBucket: "standard_taxi" | "business_dispatch";
  allowedLicenseTypes: VehicleLicenseType[];
  meterRequired: boolean;
  fixedFareAllowed: boolean;
  requiresBusinessDispatchEligible: boolean;
  requiresAirportPermit: boolean;
  requiresPlatformForwardingAllowed: boolean;
  defaultProofRequirements: string[];
};

type ResolvedVehicleCapability = VehicleEligibilityMatrixRecord & {
  vehicleId: string;
};

export type EligibleSupplyRecord = DispatchCandidate & {
  serviceProduct: ServiceProductType;
  serviceTiming: ServiceTiming;
};

export type DriverEligibleProductRecord = {
  serviceProduct: ServiceProductType;
  displayName: string;
  timing: ServiceTiming;
  defaultProofRequirements: string[];
  eligibleVehicleIds: string[];
};

type EligibleSupplyContext = {
  destination?: {
    lat: number;
    lng: number;
  } | null;
  serviceBucketOverride?: Phase1ServiceBucket;
};

type AuditActor = Pick<IdentityContext, "actorId" | "actorType" | "tenantId">;
type ServiceTiming = "realtime" | "reservation" | "external_defined";

const SERVICE_PRODUCT_TYPE_SET = new Set<string>(SERVICE_PRODUCT_TYPES);
const VEHICLE_LICENSE_TYPE_SET = new Set<string>(VEHICLE_LICENSE_TYPES);
const SEED_TIMESTAMP = "2026-06-01T00:00:00.000Z";

const SERVICE_PRODUCTS: ServiceProductDefinition[] = [
  {
    serviceProduct: "taxi_realtime",
    displayName: "Taxi Realtime",
    timing: "realtime",
    active: true,
    serviceBucket: "standard_taxi",
    allowedLicenseTypes: ["taxi", "multi_purpose_taxi"],
    meterRequired: true,
    fixedFareAllowed: false,
    requiresBusinessDispatchEligible: false,
    requiresAirportPermit: false,
    requiresPlatformForwardingAllowed: false,
    defaultProofRequirements: [],
  },
  {
    serviceProduct: "taxi_reservation",
    displayName: "Taxi Reservation",
    timing: "reservation",
    active: false,
    serviceBucket: "standard_taxi",
    allowedLicenseTypes: ["taxi", "multi_purpose_taxi"],
    meterRequired: true,
    fixedFareAllowed: false,
    requiresBusinessDispatchEligible: false,
    requiresAirportPermit: false,
    requiresPlatformForwardingAllowed: false,
    defaultProofRequirements: [],
  },
  {
    serviceProduct: "enterprise_dispatch",
    displayName: "Enterprise Dispatch",
    timing: "reservation",
    active: true,
    serviceBucket: "business_dispatch",
    allowedLicenseTypes: [
      "taxi",
      "multi_purpose_taxi",
      "rental_car",
      "business_vehicle",
    ],
    meterRequired: false,
    fixedFareAllowed: true,
    requiresBusinessDispatchEligible: true,
    requiresAirportPermit: false,
    requiresPlatformForwardingAllowed: false,
    defaultProofRequirements: ["photo"],
  },
  {
    serviceProduct: "credit_card_airport_transfer",
    displayName: "Credit Card Airport Transfer",
    timing: "reservation",
    active: true,
    serviceBucket: "business_dispatch",
    allowedLicenseTypes: [
      "multi_purpose_taxi",
      "rental_car",
      "business_vehicle",
      "airport_transfer_vehicle",
    ],
    meterRequired: false,
    fixedFareAllowed: true,
    requiresBusinessDispatchEligible: true,
    requiresAirportPermit: true,
    requiresPlatformForwardingAllowed: false,
    defaultProofRequirements: ["photo", "signoff"],
  },
  {
    serviceProduct: "insurance_replacement_vehicle",
    displayName: "Insurance Replacement Vehicle",
    timing: "reservation",
    active: false,
    serviceBucket: "business_dispatch",
    allowedLicenseTypes: ["rental_car", "business_vehicle"],
    meterRequired: false,
    fixedFareAllowed: true,
    requiresBusinessDispatchEligible: true,
    requiresAirportPermit: false,
    requiresPlatformForwardingAllowed: false,
    defaultProofRequirements: ["photo"],
  },
  {
    serviceProduct: "travel_agency_transfer",
    displayName: "Travel Agency Transfer",
    timing: "reservation",
    active: false,
    serviceBucket: "business_dispatch",
    allowedLicenseTypes: ["business_vehicle", "airport_transfer_vehicle"],
    meterRequired: false,
    fixedFareAllowed: true,
    requiresBusinessDispatchEligible: true,
    requiresAirportPermit: true,
    requiresPlatformForwardingAllowed: false,
    defaultProofRequirements: ["photo", "signoff"],
  },
  {
    serviceProduct: "third_party_forwarded_order",
    displayName: "Third-party Forwarded Order",
    timing: "external_defined",
    active: true,
    serviceBucket: "standard_taxi",
    allowedLicenseTypes: ["taxi", "multi_purpose_taxi"],
    meterRequired: false,
    fixedFareAllowed: false,
    requiresBusinessDispatchEligible: false,
    requiresAirportPermit: false,
    requiresPlatformForwardingAllowed: true,
    defaultProofRequirements: [],
  },
];

const DEFAULT_MATRIX: VehicleEligibilityMatrixRecord[] = [
  {
    capabilityId: "seed-multi-purpose-taxi",
    licenseType: "multi_purpose_taxi",
    supportedProducts: [
      "taxi_realtime",
      "enterprise_dispatch",
      "credit_card_airport_transfer",
      "third_party_forwarded_order",
    ],
    seatCount: 4,
    luggageCapacity: 3,
    airportPermit: true,
    businessDispatchEligible: true,
    taxiMeterRequired: true,
    fixedFareAllowed: true,
    conditionallyAllowed: false,
    requiredDocuments: [],
    trainingRequired: false,
    permitRequired: false,
    platformForwardingAllowed: true,
    active: true,
    effectiveFrom: SEED_TIMESTAMP,
    effectiveUntil: null,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    capabilityId: "seed-taxi",
    licenseType: "taxi",
    supportedProducts: ["taxi_realtime", "third_party_forwarded_order"],
    seatCount: 4,
    luggageCapacity: 2,
    airportPermit: false,
    businessDispatchEligible: false,
    taxiMeterRequired: true,
    fixedFareAllowed: false,
    conditionallyAllowed: false,
    requiredDocuments: [],
    trainingRequired: false,
    permitRequired: false,
    platformForwardingAllowed: true,
    active: true,
    effectiveFrom: SEED_TIMESTAMP,
    effectiveUntil: null,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    capabilityId: "seed-business-vehicle",
    licenseType: "business_vehicle",
    supportedProducts: [
      "enterprise_dispatch",
      "credit_card_airport_transfer",
      "travel_agency_transfer",
      "insurance_replacement_vehicle",
    ],
    seatCount: 5,
    luggageCapacity: 4,
    airportPermit: true,
    businessDispatchEligible: true,
    taxiMeterRequired: false,
    fixedFareAllowed: true,
    conditionallyAllowed: false,
    requiredDocuments: [],
    trainingRequired: false,
    permitRequired: false,
    platformForwardingAllowed: false,
    active: true,
    effectiveFrom: SEED_TIMESTAMP,
    effectiveUntil: null,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
];

const VEHICLE_LICENSE_BY_ID: Record<string, VehicleLicenseType> = {
  "veh-demo-001": "multi_purpose_taxi",
  "veh-demo-002": "taxi",
  "veh-demo-003": "taxi",
};

@Injectable()
export class VehicleEligibilityService implements OnModuleInit {
  private matrix: VehicleEligibilityMatrixRecord[] = [];
  private readonly serviceProducts = new Map(
    SERVICE_PRODUCTS.map((entry) => [entry.serviceProduct, entry]),
  );

  constructor(
    private readonly regulatoryRegistryService: RegulatoryRegistryService,
    @Optional()
    private readonly auditNotificationService?: AuditNotificationService,
    @Optional() private readonly repository?: VehicleEligibilityRepository,
    @Optional()
    private readonly serviceProductService?: ServiceProductService,
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

      this.matrix = items.map((item) => this.hydrateMatrixItem(item));
      this.sortMatrix(this.matrix);
    } catch (error) {
      this.repository.reportPersistenceFailure(error, "module init");
    }
  }

  listMatrix() {
    return this.getEffectiveMatrix().map((item) => this.clone(item));
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

      return this.hydrateMatrixItem({
        ...item,
        createdAt: previous?.createdAt ?? item.createdAt ?? now,
        updatedAt: now,
      });
    });

    this.matrix = updated;
    this.sortMatrix(this.matrix);
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

  listEligibleSupply(
    serviceProduct: ServiceProductType,
    context?: EligibleSupplyContext,
  ): EligibleSupplyRecord[] {
    const definition = this.requireActiveServiceProduct(serviceProduct);
    const serviceBucket =
      context?.serviceBucketOverride ?? definition.serviceBucket;

    return this.regulatoryRegistryService
      .getEligibleCandidates(serviceBucket, context?.destination ?? null)
      .filter((candidate) =>
        this.isVehicleEligibleForServiceProduct(
          candidate.vehicleId,
          definition.serviceProduct,
        ),
      )
      .map((candidate) => ({
        ...candidate,
        serviceProduct: definition.serviceProduct,
        serviceTiming: definition.timing,
      }));
  }

  listDriverEligibleProducts(driverId: string): DriverEligibleProductRecord[] {
    return this.listKnownServiceProducts()
      .filter((entry) => entry.active)
      .map((entry) => {
        const vehicleIds = this.listEligibleSupply(entry.serviceProduct)
          .filter((candidate) => candidate.driverId === driverId)
          .map((candidate) => candidate.vehicleId);

        return {
          serviceProduct: entry.serviceProduct,
          displayName: entry.displayName,
          timing: entry.timing,
          defaultProofRequirements: [...entry.defaultProofRequirements],
          eligibleVehicleIds: [...new Set(vehicleIds)],
        };
      })
      .filter((entry) => entry.eligibleVehicleIds.length > 0);
  }

  resolveServiceProductForOwnedOrder(
    order: Pick<OwnedOrderRecord, "serviceBucket" | "businessDispatchSubtype">,
  ): ServiceProductType {
    if (order.serviceBucket === "standard_taxi") {
      return "taxi_realtime";
    }

    if (order.businessDispatchSubtype === "enterprise_dispatch") {
      return "enterprise_dispatch";
    }

    if (order.businessDispatchSubtype === "credit_card_airport_transfer") {
      return "credit_card_airport_transfer";
    }

    throw new ApiRequestError(
      HttpStatus.CONFLICT,
      "SERVICE_PRODUCT_INACTIVE",
      "The order does not map to an active service product.",
    );
  }

  assertDispatchAssignmentEligible(
    order: Pick<OwnedOrderRecord, "serviceBucket" | "businessDispatchSubtype">,
    vehicleId: string,
    driverId: string,
  ) {
    const serviceProduct = this.resolveServiceProductForOwnedOrder(order);
    const definition = this.requireActiveServiceProduct(serviceProduct);
    const capability = this.requireVehicleCapability(vehicleId);

    if (
      !this.regulatoryRegistryService.getVehicleDispatchability(
        vehicleId,
        definition.serviceBucket,
      )
    ) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT",
        "Vehicle is not eligible for the requested service product.",
        {
          vehicleId,
          serviceProduct,
        },
      );
    }

    if (
      !this.regulatoryRegistryService.getDriverAvailability(
        driverId,
        definition.serviceBucket,
      )
    ) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "DRIVER_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT",
        "Driver is not eligible for the requested service product.",
        {
          driverId,
          serviceProduct,
        },
      );
    }

    if (!capability.active) {
      this.throwVehicleNotEligible(vehicleId, serviceProduct, "inactive");
    }

    if (!capability.supportedProducts.includes(serviceProduct)) {
      this.throwVehicleNotEligible(
        vehicleId,
        serviceProduct,
        "unsupported_product",
      );
    }

    if (!definition.allowedLicenseTypes.includes(capability.licenseType)) {
      this.throwVehicleNotEligible(vehicleId, serviceProduct, "license_type");
    }

    if (
      definition.requiresBusinessDispatchEligible &&
      !capability.businessDispatchEligible
    ) {
      this.throwVehicleNotEligible(
        vehicleId,
        serviceProduct,
        "business_dispatch_eligibility",
      );
    }

    if (definition.meterRequired && !capability.taxiMeterRequired) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "TAXI_METER_REQUIRED",
        "Taxi meter is required for the requested service product.",
        {
          vehicleId,
          serviceProduct,
        },
      );
    }

    if (definition.requiresAirportPermit && !capability.airportPermit) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "AIRPORT_PERMIT_REQUIRED",
        "Airport permit is required for the requested service product.",
        {
          vehicleId,
          serviceProduct,
        },
      );
    }

    if (definition.fixedFareAllowed && !capability.fixedFareAllowed) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "FIXED_FARE_NOT_ALLOWED",
        "Vehicle cannot take fixed-fare service products.",
        {
          vehicleId,
          serviceProduct,
        },
      );
    }

    if (
      definition.requiresPlatformForwardingAllowed &&
      !capability.platformForwardingAllowed
    ) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT",
        "Vehicle cannot serve platform-forwarded service products.",
        {
          vehicleId,
          serviceProduct,
          reason: "platform_forwarding_not_allowed",
        },
      );
    }
  }

  private isVehicleEligibleForServiceProduct(
    vehicleId: string,
    serviceProduct: ServiceProductType,
  ) {
    try {
      const definition = this.requireActiveServiceProduct(serviceProduct);
      const capability = this.requireVehicleCapability(vehicleId);

      if (!capability.active) {
        return false;
      }

      return (
        capability.supportedProducts.includes(serviceProduct) &&
        definition.allowedLicenseTypes.includes(capability.licenseType) &&
        (!definition.requiresBusinessDispatchEligible ||
          capability.businessDispatchEligible) &&
        (!definition.meterRequired || capability.taxiMeterRequired) &&
        (!definition.requiresAirportPermit || capability.airportPermit) &&
        (!definition.fixedFareAllowed || capability.fixedFareAllowed) &&
        (!definition.requiresPlatformForwardingAllowed ||
          capability.platformForwardingAllowed)
      );
    } catch {
      return false;
    }
  }

  private requireActiveServiceProduct(serviceProduct: ServiceProductType) {
    const definition = this.resolveServiceProductDefinition(serviceProduct);
    if (!definition || !definition.active) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "SERVICE_PRODUCT_INACTIVE",
        "Service product is not active.",
        { serviceProduct },
      );
    }

    return definition;
  }

  private requireVehicleCapability(
    vehicleId: string,
  ): ResolvedVehicleCapability {
    const licenseType = VEHICLE_LICENSE_BY_ID[vehicleId];
    if (!licenseType) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT",
        "Vehicle capability is not registered.",
        { vehicleId },
      );
    }

    const capability = this.resolveCapabilityByLicenseType(licenseType);
    if (!capability) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT",
        "Vehicle license type has no active eligibility capability.",
        { vehicleId, licenseType },
      );
    }

    return {
      ...capability,
      vehicleId,
    };
  }

  private resolveCapabilityByLicenseType(licenseType: VehicleLicenseType) {
    const effectiveMatrix = this.getEffectiveMatrix();
    return (
      effectiveMatrix.find((item) => {
        return (
          item.licenseType === licenseType &&
          item.active &&
          (item.effectiveUntil === null ||
            Date.parse(item.effectiveUntil) > Date.now())
        );
      }) ?? null
    );
  }

  private getEffectiveMatrix() {
    const source = this.matrix.length > 0 ? this.matrix : DEFAULT_MATRIX;
    return [...source].sort((left, right) => {
      const licenseCompare = left.licenseType.localeCompare(right.licenseType);
      if (licenseCompare !== 0) {
        return licenseCompare;
      }

      return right.effectiveFrom.localeCompare(left.effectiveFrom);
    });
  }

  private listKnownServiceProducts(): ServiceProductDefinition[] {
    return SERVICE_PRODUCTS.map(
      (entry) =>
        this.resolveServiceProductDefinition(entry.serviceProduct) ?? entry,
    );
  }

  private resolveServiceProductDefinition(
    serviceProduct: ServiceProductType,
  ): ServiceProductDefinition | null {
    const definition = this.serviceProducts.get(serviceProduct);
    if (!definition) {
      return null;
    }

    const runtimeProduct =
      this.serviceProductService?.getRuntimeServiceProductByType(
        serviceProduct,
      ) ?? null;
    if (!runtimeProduct) {
      return definition;
    }

    return {
      ...definition,
      displayName: runtimeProduct.displayName,
      timing: runtimeProduct.timing,
      active: runtimeProduct.active,
      allowedLicenseTypes: [...runtimeProduct.allowedLicenseTypes],
      meterRequired: runtimeProduct.meterRequired,
      fixedFareAllowed: runtimeProduct.fixedFareAllowed,
      defaultProofRequirements: [...runtimeProduct.defaultProofRequirements],
    };
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

    if (typeof item.conditionallyAllowed !== "boolean") {
      throw new ApiRequestError(
        400,
        "INVALID_CONDITIONALLY_ALLOWED",
        "conditionallyAllowed must be boolean.",
      );
    }

    if (!Array.isArray(item.requiredDocuments)) {
      throw new ApiRequestError(
        400,
        "INVALID_REQUIRED_DOCUMENTS",
        "requiredDocuments must be an array.",
      );
    }

    if (
      item.requiredDocuments.some((document) => typeof document !== "string")
    ) {
      throw new ApiRequestError(
        400,
        "INVALID_REQUIRED_DOCUMENTS",
        "requiredDocuments must contain only strings.",
      );
    }

    if (typeof item.trainingRequired !== "boolean") {
      throw new ApiRequestError(
        400,
        "INVALID_TRAINING_REQUIRED",
        "trainingRequired must be boolean.",
      );
    }

    if (typeof item.permitRequired !== "boolean") {
      throw new ApiRequestError(
        400,
        "INVALID_PERMIT_REQUIRED",
        "permitRequired must be boolean.",
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

  private throwVehicleNotEligible(
    vehicleId: string,
    serviceProduct: ServiceProductType,
    reason: string,
  ): never {
    throw new ApiRequestError(
      HttpStatus.BAD_REQUEST,
      "VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT",
      "Vehicle is not eligible for the requested service product.",
      {
        vehicleId,
        serviceProduct,
        reason,
      },
    );
  }

  private sortMatrix(items: VehicleEligibilityMatrixRecord[]) {
    items.sort((left, right) => {
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
      requiredDocuments: [...item.requiredDocuments],
    };
  }

  private hydrateMatrixItem(
    item: VehicleEligibilityMatrixRecord,
  ): VehicleEligibilityMatrixRecord {
    const requiredDocuments = Array.isArray(item.requiredDocuments)
      ? [
          ...new Set(
            item.requiredDocuments
              .map((document) => document.trim())
              .filter(Boolean),
          ),
        ]
      : [];

    return {
      ...item,
      conditionallyAllowed: item.conditionallyAllowed ?? false,
      requiredDocuments,
      trainingRequired: item.trainingRequired ?? false,
      permitRequired: item.permitRequired ?? false,
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
    if (!this.auditNotificationService) {
      return;
    }

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
