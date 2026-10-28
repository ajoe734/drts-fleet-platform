import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import type { OwnedOrderRecord } from "@drts/contracts";
import { ApiRequestError } from "../../../common/api-envelope";
import type { RequestIdentity } from "../../../common/auth/auth.types";
import { DatabaseService } from "../../../common/db/database.service";
import { DriverProfileService } from "../../driver-profile/driver-profile.service";
import { GeoService } from "../../geo/geo.service";
import { MultiTaxiRepository } from "../../multi-taxi/multi-taxi.repository";
import { DemoTripEngine } from "../../owned-mobility/demo-trip.engine";
import { OwnedMobilityService } from "../../owned-mobility/owned-mobility.service";
import { RegulatoryRegistryRepository } from "../../regulatory-registry/regulatory-registry.repository";
import { RegulatoryRegistryService } from "../../regulatory-registry/regulatory-registry.service";
import { VehicleEligibilityService } from "../../vehicle-eligibility/vehicle-eligibility.service";
import { PassengerAccountService } from "../account/passenger-account.service";
import type { FareQuoteSnapshot } from "../fare/fare.types";
import { PassengerFareRepository } from "../fare/passenger-fare.repository";
import { reviewDemoEnabled } from "./review-demo.config";
import {
  REVIEW_AUTHORIZATION_ID,
  REVIEW_OPERATOR_ID,
  ReviewSupplyService,
} from "./review-supply.service";

/** Taxi test pairs reserved for the self-serve trial. Never the pax-review-*
 * supply, which shared-dev acceptance suites assign, pause and restore. */
export const PASSENGER_TRIAL_SUPPLY = [
  "4f0d2b8e-6c1a-4e57-9b3d-0a6f1c2e7d41",
  "9b7e4c21-3f58-4a0d-8e62-5d1c9a7b3f08",
  "c2a95f63-8d14-4b7e-a0f9-6e3b2d58c917",
].map((authorizationVehicleId, index) => ({
  driverId: `pax-trial-driver-${index + 1}`,
  vehicleId: `pax-trial-vehicle-${index + 1}`,
  plateNo: `TST-000${index + 1}`,
  name: `測試司機 ${index + 1}`,
  authorizationVehicleId,
}));
// Existing registry records the trial pairs are cloned from, in preference order.
const TEMPLATE_VEHICLE_IDS = ["pax-review-vehicle-a", "veh-demo-001"];
const TRIAL_ACTOR = {
  actorId: "passenger-trial-trip",
  actorType: "system" as const,
  tenantId: null,
};

/**
 * The passenger app's self-serve trial: a signed-in passenger drives their own
 * taxi reservation with a synthetic taxi test pair (see DemoTripEngine), so a
 * reviewer can see dispatch, driver details, completion, the ride certificate,
 * rating and complaint without the Ops and Driver windows. Shares the review
 * demo's nonproduction gate.
 */
@Injectable()
export class PassengerTrialTripService extends DemoTripEngine<RequestIdentity | null> {
  protected readonly logger = new Logger(PassengerTrialTripService.name);
  protected readonly supply = PASSENGER_TRIAL_SUPPLY;
  protected readonly errorPrefix = "PASSENGER_TRIAL_TRIP";
  protected readonly label = "passenger-trial";
  /** Quotes of orders this instance has served, keyed by order id. */
  private readonly quotes = new Map<string, FareQuoteSnapshot>();

  constructor(
    orders: OwnedMobilityService,
    registry: RegulatoryRegistryService,
    registryRepository: RegulatoryRegistryRepository,
    eligibility: VehicleEligibilityService,
    fares: PassengerFareRepository,
    geo: GeoService,
    database: DatabaseService,
    private readonly accounts: PassengerAccountService,
    private readonly profiles: DriverProfileService,
    private readonly reviewSupply: ReviewSupplyService,
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
    if (!reviewDemoEnabled(process.env))
      throw new ApiRequestError(404, "not_found", "Not found.");
  }

  protected async requireDemoOrder(
    orderId: string,
    identity: RequestIdentity | null,
  ) {
    const { account } = await this.accounts.getMe(identity);
    // Ownership check; also caches the quote the simulated driver reports.
    await this.loadQuote(orderId, account.drtsPassengerId);
    await this.orders.prepareOrderAction({ orderId });
    const order = await this.orders.getOrderForRead(orderId);
    if (
      order.serviceBucket !== "standard_taxi" ||
      order.runtimeProfileCode !== "multi_taxi_direct" ||
      order.passenger?.passengerId !== account.drtsPassengerId
    )
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        this.code("UNSUPPORTED_ORDER"),
        "Only the passenger's own taxi reservations can use the test driver.",
      );
    return order;
  }

  protected quotedRouteSeconds(order: OwnedOrderRecord) {
    const seconds = Number(
      this.quotes.get(order.orderId)?.route?.durationSeconds,
    );
    return Number.isFinite(seconds) ? seconds : undefined;
  }

  /**
   * The simulated driver reports the quoted route at the quoted tariff: the
   * lower end of the estimate the passenger confirmed (no waiting time), split
   * into the estimate's start fare, its night fee when it applied, and the
   * remaining distance part.
   */
  override async simulatedActuals(order: OwnedOrderRecord) {
    const quote =
      this.quotes.get(order.orderId) ??
      (await this.loadQuote(order.orderId, order.passenger?.passengerId ?? ""));
    const distanceMeters = Number(quote.route?.distanceMeters);
    const durationSeconds = Number(quote.route?.durationSeconds);
    const amountMinor = Math.round(quote.estimatedMin * 100);
    if (
      !Number.isFinite(distanceMeters) ||
      !Number.isFinite(durationSeconds) ||
      !Number.isFinite(amountMinor) ||
      amountMinor <= 0
    )
      throw new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        this.code("FARE_UNAVAILABLE"),
        "The quoted route or fare for this trip is unavailable.",
      );
    const startMinor = Math.min(amountMinor, quote.breakdown.baseFare * 100);
    const nightMinor = Math.min(
      amountMinor - startMinor,
      quote.breakdown.nightApplies
        ? quote.breakdown.nightSurchargeAmount * 100
        : 0,
    );
    return {
      fare: { currency: "TWD" as const, amountMinor },
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

  /**
   * Idempotently create the trial taxi pairs on the review operator's
   * authorization, which the shared-dev passenger app books against
   * (MULTI_TAXI_DEFAULT_AUTHORIZATION_ID).
   */
  override async prepareSupply() {
    if (!this.database.isEnabled())
      throw new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        this.code("SUPPLY_UNAVAILABLE"),
        "Registry storage is unavailable.",
      );
    const taxi = new MultiTaxiRepository(this.database);
    let authorizations = await taxi.loadState();
    if (
      !authorizations.authorizations.some(
        (a) => a.authorizationId === REVIEW_AUTHORIZATION_ID,
      )
    ) {
      // The review preparation owns the operator, fleet and authorization.
      await this.reviewSupply.prepare();
      authorizations = await taxi.loadState();
    }
    const state = await this.registryRepository.loadState();
    const now = new Date().toISOString();
    const start = "2026-01-01T00:00:00.000Z";
    const end = "2099-01-01T00:00:00.000Z";
    for (const pair of PASSENGER_TRIAL_SUPPLY)
      if (!state.drivers.some((d) => d.driverId === pair.driverId))
        await this.registry.createDriver({
          driverId: pair.driverId,
          name: pair.name,
          lifecycleStatus: "active",
          licensesValid: true,
          licenseExpiry: end,
          professionalDriverLicenseExpiry: end,
          taxiDriverRegistrationExpiry: end,
          supportedServiceBuckets: ["standard_taxi"],
        });
    const missingVehicles = PASSENGER_TRIAL_SUPPLY.filter(
      (pair) => !state.vehicles.some((v) => v.vehicleId === pair.vehicleId),
    );
    if (missingVehicles.length > 0) {
      // The first listed vehicle with the full tuple the clone below needs.
      const templateId = TEMPLATE_VEHICLE_IDS.find(
        (id) =>
          this.registry.listVehicles().some((v) => v.vehicleId === id) &&
          this.registry.listContracts().some((c) => c.vehicleId === id) &&
          this.registry.listPolicies().some((p) => p.vehicleId === id) &&
          this.registry.listExclusivities().some((e) => e.vehicleId === id),
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
          supportedServiceBuckets: ["standard_taxi"],
          dispatchableFlag: true,
          insuranceStatus: "valid",
          exclusivityApproved: true,
          createdAt: now,
          updatedAt: now,
        })),
        contracts: missingVehicles.map((pair) => ({
          ...contract,
          contractId: `passenger-trial-contract-${pair.vehicleId}`,
          vehicleId: pair.vehicleId,
          partnerId: REVIEW_OPERATOR_ID,
          operatingAreaId: "taipei",
          startAt: start,
          endAt: end,
          createdAt: now,
          updatedAt: now,
        })),
        policies: missingVehicles.map((pair) => ({
          ...policy,
          policyId: `passenger-trial-policy-${pair.vehicleId}`,
          vehicleId: pair.vehicleId,
          policyNo: `SIMULATED-${pair.vehicleId}`,
          insurerName: "測試保險（非真實保單）",
          startAt: start,
          endAt: end,
          createdAt: now,
          updatedAt: now,
        })),
        exclusivities: missingVehicles.map((pair) => ({
          ...exclusivity,
          vehicleId: pair.vehicleId,
          declarationFileId: "passenger-trial-simulated-document",
          exclusiveProviderName: "測試車隊",
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
          make: "Toyota",
          model: "Corolla Altis",
          modelYear: 2024,
          doorCount: 4,
          color: "黃",
          status: "complete" as const,
          missingFieldCodes: [],
          verifiedByActorId: TRIAL_ACTOR.actorId,
          verifiedAt: now,
          sourceSubmissionId: null,
          version: 1,
          updatedAt: now,
        })),
      });
    }
    for (const pair of PASSENGER_TRIAL_SUPPLY) {
      await this.profiles.prepareProfileAuthority(pair.driverId);
      await this.profiles.updateProfile(pair.driverId, {
        driverSurname: "測試",
      });
    }
    await this.registryRepository.persistChanges({
      driverCredentials: PASSENGER_TRIAL_SUPPLY.map((pair, index) => ({
        driverId: pair.driverId,
        registrationNo: `TEST-NOT-REAL-000${index + 1}`,
        registrationArea: "測試環境・非真實證照",
        effectiveFrom: start,
        effectiveUntil: end,
        status: "verified_active" as const,
        maskedDisplay: `••••000${index + 1}`,
        verifiedByActorId: TRIAL_ACTOR.actorId,
        verifiedAt: now,
        sourceSubmissionId: null,
        version: 1,
        updatedAt: now,
      })),
    });
    for (const pair of PASSENGER_TRIAL_SUPPLY)
      if (
        !authorizations.vehicles.some(
          (v) =>
            v.authorizationId === REVIEW_AUTHORIZATION_ID &&
            v.vehicleId === pair.vehicleId,
        )
      )
        await taxi.persistVehicle({
          authorizationVehicleId: pair.authorizationVehicleId,
          authorizationId: REVIEW_AUTHORIZATION_ID,
          vehicleId: pair.vehicleId,
          status: "active",
          effectiveFrom: start,
          effectiveUntil: end,
        });
    await this.registry.prepareDispatchSupply("standard_taxi");
    await this.eligibility.enableServiceProductForSupply(
      "taxi_reservation",
      PASSENGER_TRIAL_SUPPLY.map((pair) => pair.vehicleId),
      TRIAL_ACTOR,
    );
  }

  /** The confirmed quote of the passenger's own booking of this order. */
  private async loadQuote(orderId: string, passengerId: string) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        orderId,
      )
    )
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "PASSENGER_RIDE_NOT_FOUND",
        "Ride not found",
      );
    const booking = await this.database.query<{
      drts_passenger_id: string;
      fare_snapshot_id: string;
    }>(
      `SELECT drts_passenger_id, fare_snapshot_id FROM passenger.booking_histories WHERE order_id = $1`,
      [orderId],
    );
    const row = booking.rows[0];
    if (!row || !passengerId || row.drts_passenger_id !== passengerId)
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "PASSENGER_RIDE_NOT_FOUND",
        "Ride not found",
      );
    const quote = await this.fares.findOwnedSnapshot(
      row.fare_snapshot_id,
      passengerId,
    );
    if (!quote)
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        this.code("FARE_UNAVAILABLE"),
        "The confirmed quote for this trip is unavailable.",
      );
    this.quotes.set(orderId, quote);
    return quote;
  }
}
