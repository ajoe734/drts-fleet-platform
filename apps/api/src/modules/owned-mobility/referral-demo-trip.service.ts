import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import type {
  ActualTripFareBreakdown,
  OwnedOrderRecord,
} from "@drts/contracts";
import { ApiRequestError } from "../../common/api-envelope";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { DatabaseService } from "../../common/db/database.service";
import { GeoService } from "../geo/geo.service";
import { estimateFare } from "../passenger-app/fare/fare.engine";
import { PassengerFareRepository } from "../passenger-app/fare/passenger-fare.repository";
import { RegulatoryRegistryRepository } from "../regulatory-registry/regulatory-registry.repository";
import { RegulatoryRegistryService } from "../regulatory-registry/regulatory-registry.service";
import { VehicleEligibilityService } from "../vehicle-eligibility/vehicle-eligibility.service";
import { DemoTripEngine, type DemoTripResult } from "./demo-trip.engine";
import { OwnedMobilityService } from "./owned-mobility.service";
import { referralDemoTripEnabled } from "./referral-demo-trip.config";

/** Business test pairs reserved for this demo. Never the pax-review-* supply,
 * which shared-dev acceptance suites assign, pause and restore. */
export const REFERRAL_DEMO_SUPPLY = [1, 2, 3].map((n) => ({
  driverId: `referral-demo-driver-${n}`,
  vehicleId: `referral-demo-vehicle-${n}`,
  plateNo: `TEST-B00${n}`,
  name: `商務測試司機 ${n}（虛構）`,
}));
// Existing registry records the demo pairs are cloned from, in preference order.
const TEMPLATE_VEHICLE_IDS = ["pax-review-vehicle-a", "veh-demo-001"];
const DEMO_ACTOR = {
  actorId: "referral-demo-trip",
  actorType: "system" as const,
  tenantId: null,
};

export type ReferralDemoTripResult = DemoTripResult;

/**
 * The referral embed's demo driver: a tester drives their own referral
 * business order with a synthetic business test pair (see DemoTripEngine).
 */
@Injectable()
export class ReferralDemoTripService extends DemoTripEngine {
  protected readonly logger = new Logger(ReferralDemoTripService.name);
  protected readonly supply = REFERRAL_DEMO_SUPPLY;
  protected readonly errorPrefix = "REFERRAL_DEMO_TRIP";
  protected readonly label = "referral-demo";

  constructor(
    orders: OwnedMobilityService,
    registry: RegulatoryRegistryService,
    registryRepository: RegulatoryRegistryRepository,
    eligibility: VehicleEligibilityService,
    fares: PassengerFareRepository,
    geo: GeoService,
    database: DatabaseService,
  ) {
    super(
      orders,
      registry,
      registryRepository,
      eligibility,
      fares,
      geo,
      database,
    );
  }

  protected requireEnabled() {
    if (!referralDemoTripEnabled(process.env))
      throw new ApiRequestError(404, "not_found", "Not found.");
  }

  protected async requireDemoOrder(
    orderId: string,
    identity: BootstrapRequestIdentity | null,
  ) {
    const order = await this.orders.requireOwnedReferralPassengerOrder(
      orderId,
      identity,
    );
    if (
      order.serviceBucket !== "business_dispatch" ||
      !order.referralPassengerLifecycle
    )
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "REFERRAL_DEMO_TRIP_UNSUPPORTED_ORDER",
        "Only referral business trips can use the demo driver.",
      );
    return order;
  }

  protected quotedRouteSeconds(order: OwnedOrderRecord) {
    const seconds = Number(
      order.referralPassengerLifecycle?.quote?.route?.durationSeconds,
    );
    return Number.isFinite(seconds) ? seconds : undefined;
  }

  /**
   * The simulated driver reports the quoted route at the quote's tariff: the
   * fare is the lower end of the estimate the passenger saw (no waiting time),
   * split into the tariff's start fare, its night fee when it applied, and the
   * remaining distance and fixed-fee part.
   */
  override async simulatedActuals(order: OwnedOrderRecord): Promise<{
    fare: { currency: "TWD"; amountMinor: number };
    breakdown: ActualTripFareBreakdown;
    distanceKm: number;
    durationSec: number;
  }> {
    const quote = order.referralPassengerLifecycle?.quote;
    const pricingAt = quote?.pricingAt ?? new Date().toISOString();
    const origin = this.point(order.pickup, "pickup");
    const destination = this.point(order.dropoff, "dropoff");
    const [tariff, route] = await Promise.all([
      this.fares.publishedTariff(pricingAt),
      this.geo.route({
        origin,
        destination,
        travelMode: "drive",
        requestedByActorId: DEMO_ACTOR.actorId,
      }),
    ]);
    const distanceMeters = Number(route?.distanceMeters);
    const durationSeconds = Number(route?.durationSeconds);
    if (
      !tariff ||
      !Number.isFinite(distanceMeters) ||
      !Number.isFinite(durationSeconds)
    )
      throw new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        this.code("FARE_UNAVAILABLE"),
        "The tariff or route for this trip is unavailable.",
      );
    const estimate = estimateFare(tariff, {
      distanceMeters,
      durationSeconds,
      scheduledAt: pricingAt,
    });
    const amountMinor = order.fixedPrice
      ? (order.quotedFare?.amountMinor ?? estimate.estimatedMin * 100)
      : estimate.estimatedMin * 100;
    const startMinor = Math.min(amountMinor, tariff.baseFare * 100);
    const nightMinor = Math.min(
      amountMinor - startMinor,
      estimate.breakdown.nightApplies ? tariff.nightSurchargeAmount * 100 : 0,
    );
    return {
      fare: { currency: "TWD", amountMinor },
      breakdown: {
        startMinor,
        distanceMinor: amountMinor - startMinor - nightMinor,
        delayMinor: 0,
        nightMinor,
      },
      distanceKm: Math.round(distanceMeters / 100) / 10,
      durationSec: Math.round(durationSeconds),
    };
  }

  /** Idempotently create the demo business pairs from an existing vehicle. */
  override async prepareSupply() {
    if (!this.database.isEnabled())
      throw new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        this.code("SUPPLY_UNAVAILABLE"),
        "Registry storage is unavailable.",
      );
    const state = await this.registryRepository.loadState();
    const missingVehicles = this.supply.filter(
      (pair) => !state.vehicles.some((v) => v.vehicleId === pair.vehicleId),
    );
    const now = new Date().toISOString();
    const start = "2026-01-01T00:00:00.000Z";
    const end = "2099-01-01T00:00:00.000Z";
    for (const pair of REFERRAL_DEMO_SUPPLY)
      if (!state.drivers.some((d) => d.driverId === pair.driverId))
        await this.registry.createDriver({
          driverId: pair.driverId,
          name: pair.name,
          lifecycleStatus: "active",
          licensesValid: true,
          licenseExpiry: end,
          professionalDriverLicenseExpiry: end,
          taxiDriverRegistrationExpiry: end,
          supportedServiceBuckets: ["business_dispatch"],
        });
    if (missingVehicles.length > 0) {
      const templateId = TEMPLATE_VEHICLE_IDS.find((id) =>
        this.registry.listVehicles().some((v) => v.vehicleId === id),
      );
      const template = this.registry
        .listVehicles()
        .find((v) => v.vehicleId === templateId);
      const contract = this.registry
        .listContracts()
        .find((c) => c.vehicleId === templateId);
      const policy = this.registry
        .listPolicies()
        .find((p) => p.vehicleId === templateId);
      const exclusivity = this.registry
        .listExclusivities()
        .find((e) => e.vehicleId === templateId);
      if (!template || !contract || !policy || !exclusivity)
        throw new ApiRequestError(
          HttpStatus.SERVICE_UNAVAILABLE,
          this.code("SUPPLY_UNAVAILABLE"),
          "No existing vehicle can serve as the test vehicle template.",
        );
      await this.registryRepository.persistChanges({
        vehicles: missingVehicles.map((pair) => ({
          ...structuredClone(template),
          vehicleId: pair.vehicleId,
          plateNo: pair.plateNo,
          operatingArea: "taipei",
          supportedServiceBuckets: ["business_dispatch"],
          dispatchableFlag: true,
          insuranceStatus: "valid",
          exclusivityApproved: true,
          createdAt: now,
          updatedAt: now,
        })),
        contracts: missingVehicles.map((pair) => ({
          ...contract,
          contractId: `referral-demo-contract-${pair.vehicleId}`,
          vehicleId: pair.vehicleId,
          operatingAreaId: "taipei",
          startAt: start,
          endAt: end,
          createdAt: now,
          updatedAt: now,
        })),
        policies: missingVehicles.map((pair) => ({
          ...policy,
          policyId: `referral-demo-policy-${pair.vehicleId}`,
          vehicleId: pair.vehicleId,
          policyNo: `SIMULATED-${pair.vehicleId}`,
          insurerName: "虛構測試保險來源",
          startAt: start,
          endAt: end,
          createdAt: now,
          updatedAt: now,
        })),
        exclusivities: missingVehicles.map((pair) => ({
          ...exclusivity,
          vehicleId: pair.vehicleId,
          declarationFileId: "referral-demo-simulated-document",
          exclusiveProviderName: "虛構測試車隊",
          effectiveStart: start,
          effectiveEnd: end,
          updatedAt: now,
        })),
        supplyPairs: missingVehicles.map((pair) => ({
          vehicleId: pair.vehicleId,
          driverId: pair.driverId,
          etaMinutes: 1,
        })),
        disclosureProfiles: missingVehicles.map((pair) => ({
          vehicleId: pair.vehicleId,
          make: "測試車廠",
          model: "虛構展示車",
          modelYear: 2026,
          doorCount: 4,
          color: "白",
          status: "complete" as const,
          missingFieldCodes: [],
          verifiedByActorId: DEMO_ACTOR.actorId,
          verifiedAt: now,
          sourceSubmissionId: null,
          version: 1,
          updatedAt: now,
        })),
      });
    }
    await this.registryRepository.persistChanges({
      driverCredentials: REFERRAL_DEMO_SUPPLY.map((pair, index) => ({
        driverId: pair.driverId,
        registrationNo: `SIMULATED-NOT-REAL-B${index + 1}`,
        registrationArea: "測試・非真實證照",
        effectiveFrom: start,
        effectiveUntil: end,
        status: "verified_active" as const,
        maskedDisplay: `••••B00${index + 1}`,
        verifiedByActorId: DEMO_ACTOR.actorId,
        verifiedAt: now,
        sourceSubmissionId: null,
        version: 1,
        updatedAt: now,
      })),
    });
    await this.registry.prepareDispatchSupply("business_dispatch");
    await this.eligibility.enableServiceProductForSupply(
      "enterprise_dispatch",
      REFERRAL_DEMO_SUPPLY.map((pair) => pair.vehicleId),
      DEMO_ACTOR,
    );
  }
}
