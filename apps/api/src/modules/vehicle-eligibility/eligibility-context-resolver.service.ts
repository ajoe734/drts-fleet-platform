import { Inject, Injectable, forwardRef } from "@nestjs/common";

import type {
  DriverDeviceBindingSummary,
  DriverLocationSnapshot,
  DriverRegistryRecord,
  ServiceProductType,
  VehicleRegistryRecord,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { RegulatoryRegistryService } from "../regulatory-registry/regulatory-registry.service";
import { ServiceProductService } from "../service-product/service-product.service";
import type {
  RuntimeServiceProductDefinition,
  RuntimeVehicleCapability,
} from "./vehicle-eligibility.service";
import { VehicleEligibilityService } from "./vehicle-eligibility.service";

type ResolvedReadinessState = {
  ready: boolean;
  reasonCodes: string[];
};

export type ResolveRuntimeEligibilityContextCommand = {
  orderId: string;
  dispatchJobId: string;
  driverId: string;
  vehicleId: string;
  serviceProductCode: ServiceProductType;
  serviceProductId?: string;
  sourcePlatform?: string | null;
  policyVersion?: string;
  evaluatedAt?: string;
  currentLocation?: DriverLocationSnapshot | null;
  platformBindings?: string[];
  driver?: DriverRegistryRecord;
  vehicle?: VehicleRegistryRecord;
  vehicleCapability?: RuntimeVehicleCapability;
  driverReadiness?: ResolvedReadinessState;
  vehicleReadiness?: ResolvedReadinessState;
};

export type ResolvedRuntimeEligibilityContext = {
  orderId: string;
  dispatchJobId: string;
  driverId: string;
  vehicleId: string;
  serviceProductId: string;
  serviceProductCode: ServiceProductType;
  sourcePlatform: string | null;
  policyVersion: string;
  evaluatedAt: string;
  driver: DriverRegistryRecord;
  vehicle: VehicleRegistryRecord;
  vehicleCapability: RuntimeVehicleCapability;
  serviceProduct: RuntimeServiceProductDefinition;
  currentLocation: DriverLocationSnapshot | null;
  platformBindings: string[];
  driverReadiness: ResolvedReadinessState;
  vehicleReadiness: ResolvedReadinessState;
};

/**
 * Resolves the exact service product context, policy version, and driver /
 * vehicle facts a runtime eligibility evaluation needs.
 *
 * Scaffold only — wired into VehicleEligibilityModule by P1D-WP0. Context
 * assembly from registry, readiness, and location state is implemented by the
 * downstream eligibility execution wave.
 *
 * Source of truth:
 *   docs/02-architecture/phase1_delta_sd_supply_eligibility_mobile_reporting_20260619.md §1.3, §5.2
 */
@Injectable()
export class EligibilityContextResolver {
  constructor(
    @Inject(forwardRef(() => RegulatoryRegistryService))
    private readonly regulatoryRegistryService: RegulatoryRegistryService,
    private readonly serviceProductService: ServiceProductService,
    private readonly vehicleEligibilityService: VehicleEligibilityService,
  ) {}

  resolve(
    command: ResolveRuntimeEligibilityContextCommand,
  ): ResolvedRuntimeEligibilityContext {
    const driver =
      command.driver ??
      this.regulatoryRegistryService
        .listDrivers()
        .find((candidate) => candidate.driverId === command.driverId);
    if (!driver) {
      throw new ApiRequestError(404, "DRIVER_NOT_FOUND", "Driver not found.", {
        driverId: command.driverId,
      });
    }

    const vehicle =
      command.vehicle ??
      this.regulatoryRegistryService
        .listVehicles()
        .find((candidate) => candidate.vehicleId === command.vehicleId);
    if (!vehicle) {
      throw new ApiRequestError(
        404,
        "VEHICLE_NOT_FOUND",
        "Vehicle not found.",
        {
          vehicleId: command.vehicleId,
        },
      );
    }

    const runtimeServiceProduct =
      this.serviceProductService.getRuntimeServiceProductByType(
        command.serviceProductCode,
      );
    if (!runtimeServiceProduct || !runtimeServiceProduct.active) {
      throw new ApiRequestError(
        404,
        "SERVICE_PRODUCT_INACTIVE",
        "Service product is not active.",
        {
          serviceProductCode: command.serviceProductCode,
        },
      );
    }

    const serviceProduct =
      this.vehicleEligibilityService.getRuntimeServiceProductDefinition(
        command.serviceProductCode,
      );
    if (!serviceProduct) {
      throw new ApiRequestError(
        404,
        "SERVICE_PRODUCT_INACTIVE",
        "Service product is not active.",
        {
          serviceProductCode: command.serviceProductCode,
        },
      );
    }

    const vehicleCapability =
      command.vehicleCapability ??
      this.vehicleEligibilityService.resolveRuntimeVehicleCapability(
        command.vehicleId,
      );
    if (!vehicleCapability) {
      throw new ApiRequestError(
        404,
        "VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT",
        "Vehicle capability is not registered.",
        {
          vehicleId: command.vehicleId,
        },
      );
    }

    const currentLocation =
      command.currentLocation ??
      this.regulatoryRegistryService
        .listLatestDriverLocations()
        .find((location) => location.driverId === command.driverId) ??
      null;

    const platformBindings =
      command.platformBindings ??
      this.inferPlatformBindings(driver.deviceBindings ?? []);
    const evaluatedAt = command.evaluatedAt ?? new Date().toISOString();
    const policyVersion =
      command.policyVersion ??
      [
        `service:${runtimeServiceProduct.serviceProductId}@${runtimeServiceProduct.updatedAt}`,
        `capability:${vehicleCapability.capabilityId}@${vehicleCapability.updatedAt}`,
      ].join("|");

    return {
      orderId: command.orderId,
      dispatchJobId: command.dispatchJobId,
      driverId: command.driverId,
      vehicleId: command.vehicleId,
      serviceProductId:
        command.serviceProductId ?? runtimeServiceProduct.serviceProductId,
      serviceProductCode: command.serviceProductCode,
      sourcePlatform: command.sourcePlatform?.trim() || null,
      policyVersion,
      evaluatedAt,
      driver,
      vehicle,
      vehicleCapability,
      serviceProduct,
      currentLocation,
      platformBindings,
      driverReadiness:
        command.driverReadiness ?? this.resolveDriverReadiness(driver),
      vehicleReadiness:
        command.vehicleReadiness ?? this.resolveVehicleReadiness(vehicle),
    };
  }

  private resolveDriverReadiness(
    driver: DriverRegistryRecord,
  ): ResolvedReadinessState {
    return {
      ready: driver.dispatchEligible,
      reasonCodes: driver.dispatchEligible
        ? []
        : [
            ...new Set(
              driver.eligibilityBlockedReasons.map((reason) => reason.toUpperCase()),
            ),
          ],
    };
  }

  private resolveVehicleReadiness(
    vehicle: VehicleRegistryRecord,
  ): ResolvedReadinessState {
    const blockedReasons = vehicle.supplyLifecycle.dispatch.blockedReasons ?? [];
    const ready = vehicle.supplyLifecycle.dispatch.eligible;

    return {
      ready,
      reasonCodes: ready
        ? []
        : [...new Set(blockedReasons.map((reason) => reason.toUpperCase()))],
    };
  }

  private inferPlatformBindings(bindings: DriverDeviceBindingSummary[]) {
    return bindings.some((binding) => binding.status === "active")
      ? ["drts"]
      : [];
  }
}
