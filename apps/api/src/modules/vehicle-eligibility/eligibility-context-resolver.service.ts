import { Injectable, Optional } from "@nestjs/common";

import type {
  DispatchCandidate,
  DriverLocationSnapshot,
  DriverRegistryRecord,
  ExactServiceProductContext,
  OwnedOrderRecord,
  RuntimeEligibilityDecisionRecord,
  ServiceProductType,
  VehicleRegistryRecord,
} from "@drts/contracts";

import { RegulatoryRegistryService } from "../regulatory-registry/regulatory-registry.service";
import { ServiceProductService } from "../service-product/service-product.service";
import {
  VehicleEligibilityService,
  type ResolvedVehicleCapability,
  type ServiceProductDefinition,
} from "./vehicle-eligibility.service";

type RuntimeEligibilityLocationState =
  RuntimeEligibilityDecisionRecord["locationState"];

const DRIVER_PLATFORM_BINDINGS: Record<string, string[]> = {
  "drv-demo-001": ["drts", "partner-demo", "sandbox_partner"],
  "drv-demo-004": ["drts", "partner-demo"],
};

export type EligibilityCandidateContext = {
  orderId: string;
  dispatchJobId: string;
  driverId: string;
  vehicleId: string;
  sourcePlatform: string | null;
  serviceProduct: ServiceProductType;
};

export type EligibilityResolvedContext = {
  driver: DriverRegistryRecord;
  vehicle: VehicleRegistryRecord;
  location: DriverLocationSnapshot | null;
  locationState: RuntimeEligibilityLocationState;
  serviceProduct: ServiceProductDefinition;
  capability: ResolvedVehicleCapability;
  serviceProductContext: ExactServiceProductContext;
  driverPlatformBindings: string[];
};

@Injectable()
export class EligibilityContextResolver {
  constructor(
    private readonly regulatoryRegistryService: RegulatoryRegistryService,
    private readonly vehicleEligibilityService: VehicleEligibilityService,
    @Optional()
    private readonly serviceProductService?: ServiceProductService,
  ) {}

  resolveCandidateContext(
    input: EligibilityCandidateContext,
  ): EligibilityResolvedContext {
    const driver = this.requireDriver(input.driverId);
    const vehicle = this.requireVehicle(input.vehicleId);
    const location = this.findLocation(input.driverId);
    const runtimeProduct = this.serviceProductService?.getRuntimeServiceProductByType(
      input.serviceProduct,
    );

    return {
      driver,
      vehicle,
      location,
      locationState: this.classifyLocationState(location),
      serviceProduct:
        this.vehicleEligibilityService.getServiceProductRuntimeDefinition(
          input.serviceProduct,
        ),
      capability:
        this.vehicleEligibilityService.getVehicleCapabilitySnapshot(
          input.vehicleId,
        ),
      serviceProductContext: {
        serviceProductId:
          runtimeProduct?.serviceProductId ?? input.serviceProduct,
        serviceProductCode: input.serviceProduct,
        serviceProductVersion:
          runtimeProduct?.updatedAt ?? "2026-06-01T00:00:00.000Z",
        serviceBucket:
          input.serviceProduct === "taxi_realtime" ||
          input.serviceProduct === "taxi_reservation" ||
          input.serviceProduct === "third_party_forwarded_order"
            ? "standard_taxi"
            : "business_dispatch",
        resolvedBy: input.sourcePlatform ? "external_adapter" : "ops_selection",
        sourceProgramId: null,
        sourcePlatform: input.sourcePlatform,
      },
      driverPlatformBindings:
        DRIVER_PLATFORM_BINDINGS[input.driverId] ??
        (input.sourcePlatform ? ["drts"] : ["drts"]),
    };
  }

  resolveCandidateContextFromOrder(
    order: Pick<
      OwnedOrderRecord,
      | "orderId"
      | "serviceProductCode"
      | "serviceProductId"
      | "serviceProductVersion"
      | "serviceBucket"
      | "orderSource"
    >,
    dispatchJobId: string,
    candidate: Pick<DispatchCandidate, "driverId" | "vehicleId">,
    sourcePlatform?: string | null,
  ) {
    const serviceProduct = order.serviceProductCode ?? "taxi_realtime";
    const resolved = this.resolveCandidateContext({
      orderId: order.orderId,
      dispatchJobId,
      driverId: candidate.driverId,
      vehicleId: candidate.vehicleId,
      sourcePlatform: sourcePlatform ?? null,
      serviceProduct,
    });

    if (order.serviceProductId) {
      resolved.serviceProductContext.serviceProductId = order.serviceProductId;
    }
    if (order.serviceProductVersion) {
      resolved.serviceProductContext.serviceProductVersion =
        order.serviceProductVersion;
    }
    if (order.serviceBucket) {
      resolved.serviceProductContext.serviceBucket = order.serviceBucket;
    }

    return resolved;
  }

  private requireDriver(driverId: string) {
    const driver = this.regulatoryRegistryService
      .listDrivers()
      .find((candidate) => candidate.driverId === driverId);
    if (!driver) {
      throw new Error(`Driver ${driverId} not found for eligibility context`);
    }

    return driver;
  }

  private requireVehicle(vehicleId: string) {
    const vehicle = this.regulatoryRegistryService
      .listVehicles()
      .find((candidate) => candidate.vehicleId === vehicleId);
    if (!vehicle) {
      throw new Error(`Vehicle ${vehicleId} not found for eligibility context`);
    }

    return vehicle;
  }

  private findLocation(driverId: string) {
    return (
      this.regulatoryRegistryService
        .listLatestDriverLocations()
        .find((candidate) => candidate.driverId === driverId) ?? null
    );
  }

  private classifyLocationState(
    location: DriverLocationSnapshot | null,
  ): RuntimeEligibilityLocationState {
    if (!location) {
      return "missing";
    }

    if ((location.accuracyM ?? 0) > 100) {
      return "low_accuracy";
    }

    if (Date.now() - Date.parse(location.updatedAt) > 90_000) {
      return "stale";
    }

    return "fresh";
  }
}
