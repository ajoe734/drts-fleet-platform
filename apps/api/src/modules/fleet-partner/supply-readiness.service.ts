import { Injectable } from "@nestjs/common";

import type {
  DriverRegistryRecord,
  SupplyReadinessReasonCode,
  SupplyReadinessRecord,
  SupplyReadinessState,
  VehicleRegistryRecord,
} from "@drts/contracts";

import { RegulatoryRegistryService } from "../regulatory-registry/regulatory-registry.service";
import { FleetPartnerService } from "./fleet-partner.service";

@Injectable()
export class SupplyReadinessService {
  constructor(
    private readonly fleetPartnerService: FleetPartnerService,
    private readonly regulatoryRegistryService: RegulatoryRegistryService,
  ) {}

  listReadiness(fleetPartnerId: string) {
    const evaluatedAt = new Date().toISOString();
    const driversById = new Map(
      this.regulatoryRegistryService
        .listDrivers()
        .map((driver) => [driver.driverId, driver] as const),
    );
    const vehiclesById = new Map(
      this.regulatoryRegistryService
        .listVehicles()
        .map((vehicle) => [vehicle.vehicleId, vehicle] as const),
    );

    const driverReadiness = this.fleetPartnerService
      .listActiveFleetPartnerDriverIds(fleetPartnerId, evaluatedAt)
      .map((driverId) => driversById.get(driverId))
      .filter((driver): driver is DriverRegistryRecord => Boolean(driver))
      .map((driver) => this.evaluateDriver(driver, fleetPartnerId, evaluatedAt));

    const vehicleReadiness = this.fleetPartnerService
      .listActiveFleetPartnerVehicleIds(fleetPartnerId, evaluatedAt)
      .map((vehicleId) => vehiclesById.get(vehicleId))
      .filter((vehicle): vehicle is VehicleRegistryRecord => Boolean(vehicle))
      .map((vehicle) =>
        this.evaluateVehicle(vehicle, fleetPartnerId, evaluatedAt),
      );

    return [...driverReadiness, ...vehicleReadiness];
  }

  getDriverReadiness(fleetPartnerId: string, driverId: string) {
    const evaluatedAt = new Date().toISOString();
    const activeDriverIds = new Set(
      this.fleetPartnerService.listActiveFleetPartnerDriverIds(
        fleetPartnerId,
        evaluatedAt,
      ),
    );
    if (!activeDriverIds.has(driverId)) {
      return null;
    }
    const driver = this.regulatoryRegistryService
      .listDrivers()
      .find((candidate) => candidate.driverId === driverId);
    return driver
      ? this.evaluateDriver(driver, fleetPartnerId, evaluatedAt)
      : null;
  }

  getVehicleReadiness(fleetPartnerId: string, vehicleId: string) {
    const evaluatedAt = new Date().toISOString();
    const activeVehicleIds = new Set(
      this.fleetPartnerService.listActiveFleetPartnerVehicleIds(
        fleetPartnerId,
        evaluatedAt,
      ),
    );
    if (!activeVehicleIds.has(vehicleId)) {
      return null;
    }
    const vehicle = this.regulatoryRegistryService
      .listVehicles()
      .find((candidate) => candidate.vehicleId === vehicleId);
    return vehicle
      ? this.evaluateVehicle(vehicle, fleetPartnerId, evaluatedAt)
      : null;
  }

  private evaluateDriver(
    driver: DriverRegistryRecord,
    fleetPartnerId: string,
    evaluatedAt: string,
  ): SupplyReadinessRecord {
    const partner = this.fleetPartnerService.getFleetPartner(
      fleetPartnerId,
    );
    const reasonCodes: SupplyReadinessReasonCode[] = [];

    if (!partner.active) {
      reasonCodes.push("FLEET_PARTNER_INACTIVE");
    }
    if (!driver.licensesValid) {
      reasonCodes.push("DRIVER_LICENSE_EXPIRED", "DRIVER_REGISTRATION_EXPIRED");
    }
    if (driver.lifecycleStatus === "suspended") {
      reasonCodes.push("MANUALLY_SUSPENDED");
    }
    if (driver.supportedServiceBuckets.length === 0) {
      reasonCodes.push("SERVICE_PRODUCT_NOT_SUPPORTED");
    }

    return {
      subjectType: "driver",
      subjectId: driver.driverId,
      state: this.resolveState(reasonCodes),
      reasonCodes: this.uniqueReasonCodes(reasonCodes),
      evaluatedAt,
      policyVersion: "phase1-delta-supply-eligibility-20260619",
    };
  }

  private evaluateVehicle(
    vehicle: VehicleRegistryRecord,
    fleetPartnerId: string,
    evaluatedAt: string,
  ): SupplyReadinessRecord {
    const partner = this.fleetPartnerService.getFleetPartner(fleetPartnerId);
    const reasons: SupplyReadinessReasonCode[] = [];

    if (!partner.active) {
      reasons.push("FLEET_PARTNER_INACTIVE");
    }
    if (vehicle.supportedServiceBuckets.length === 0) {
      reasons.push("SERVICE_PRODUCT_NOT_SUPPORTED");
    }
    for (const blockedReason of vehicle.supplyLifecycle.dispatch.blockedReasons) {
      if (blockedReason.startsWith("contract_")) {
        reasons.push(
          blockedReason === "contract_missing"
            ? "CONTRACT_MISSING"
            : "CONTRACT_INACTIVE",
        );
        continue;
      }
      if (blockedReason.startsWith("insurance_")) {
        reasons.push(
          blockedReason === "insurance_missing" ||
            blockedReason === "insurance_pending"
            ? "INSURANCE_MISSING"
            : "INSURANCE_EXPIRED",
        );
        continue;
      }
      if (blockedReason.startsWith("exclusivity_")) {
        reasons.push("VEHICLE_AFFILIATION_MISSING");
        continue;
      }
      if (
        blockedReason === "manual_hold" ||
        blockedReason === "offboarding_pending_debranding"
      ) {
        reasons.push("MANUALLY_SUSPENDED");
      }
    }
    if (!vehicle.dispatchableFlag) {
      reasons.push("VEHICLE_DOCUMENT_MISSING");
    }

    return {
      subjectType: "vehicle",
      subjectId: vehicle.vehicleId,
      state: this.resolveState(reasons),
      reasonCodes: this.uniqueReasonCodes(reasons),
      evaluatedAt,
      policyVersion: "phase1-delta-supply-eligibility-20260619",
    };
  }

  private resolveState(
    reasonCodes: readonly SupplyReadinessReasonCode[],
  ): SupplyReadinessState {
    if (reasonCodes.length === 0) {
      return "ready";
    }
    return reasonCodes.includes("MANUALLY_SUSPENDED")
      ? "suspended"
      : "not_ready";
  }

  private uniqueReasonCodes(
    reasonCodes: readonly SupplyReadinessReasonCode[],
  ): SupplyReadinessReasonCode[] {
    return Array.from(new Set(reasonCodes));
  }
}
