import { Injectable } from "@nestjs/common";
import { ApiRequestError } from "../../../common/api-envelope";
import { DatabaseService } from "../../../common/db/database.service";
import { RegulatoryRegistryService } from "../../regulatory-registry/regulatory-registry.service";
import { RegulatoryRegistryRepository } from "../../regulatory-registry/regulatory-registry.repository";
import { MultiTaxiService } from "../../multi-taxi/multi-taxi.service";
import { MultiTaxiRepository } from "../../multi-taxi/multi-taxi.repository";
import { ServiceProductRepository } from "../../service-product/service-product.repository";
import { ServiceProductService } from "../../service-product/service-product.service";
import { reviewDemoEnabled } from "./review-demo.config";

const AUTHORIZATION_ID = "bc39e4f3-72d8-4383-bdc1-2426c1330dfa";
export const REVIEW_SUPPLY = ["a", "b"].map((suffix, index) => ({
  driverId: `pax-review-driver-${suffix}`,
  vehicleId: `pax-review-vehicle-${suffix}`,
  plateNo: `SIM-${index + 1}001`,
}));

/** External qualification/supply fixtures only. Existing registry/native
 * repositories persist them and the normal dispatch eligibility still runs.
 * No booking, assignment, task, payment or rating is seeded here.
 */
@Injectable()
export class ReviewSupplyService {
  constructor(
    private readonly database: DatabaseService,
    private readonly registry: RegulatoryRegistryService,
    private readonly multi: MultiTaxiService,
    private readonly products: ServiceProductService,
  ) {}

  async prepare() {
    if (!reviewDemoEnabled(process.env))
      throw new ApiRequestError(404, "not_found", "Rehearsal is not enabled.");
    // Explicit nonproduction rehearsal configuration, not an inactive-product
    // bypass. Persist the existing reservation master and await its ACK before
    // reporting readiness. Keep the independent runtime policy guard intact.
    const products = new ServiceProductRepository(this.database);
    if (!products.isEnabled())
      throw new ApiRequestError(
        503,
        "review_supply_unavailable",
        "Rehearsal product storage is unavailable.",
      );
    await this.products.prepareRuntimeProfileServiceProduct(
      "multi_taxi_direct",
      "taxi_reservation",
    );
    const product =
      this.products.getRuntimeServiceProductByType("taxi_reservation");
    if (!product)
      throw new ApiRequestError(
        503,
        "review_supply_unavailable",
        "Reservation product is unavailable.",
      );
    if (!product.active)
      await products.persistChanges({
        records: [
          { ...product, active: true, updatedAt: new Date().toISOString() },
        ],
      });
    await this.products.prepareRuntimeProfileServiceProduct(
      "multi_taxi_direct",
      "taxi_reservation",
    );
    const repository = new RegulatoryRegistryRepository(this.database);
    const taxi = new MultiTaxiRepository(this.database);
    const state = await repository.loadState();
    // Use the established fixture shapes, not alternative tables/schema.
    const template = this.registry
      .listVehicles()
      .find((v) => v.vehicleId === "veh-demo-001");
    const contract = this.registry
      .listContracts()
      .find((v) => v.vehicleId === "veh-demo-001");
    const policy = this.registry
      .listPolicies()
      .find((v) => v.vehicleId === "veh-demo-001");
    const exclusivity = this.registry
      .listExclusivities()
      .find((v) => v.vehicleId === "veh-demo-001");
    if (!template || !contract || !policy || !exclusivity)
      throw new ApiRequestError(
        503,
        "review_supply_unavailable",
        "Established rehearsal supply templates are unavailable.",
      );
    const now = new Date().toISOString();
    const start = "2026-01-01T00:00:00.000Z";
    const end = "2099-01-01T00:00:00.000Z";
    for (const fixture of REVIEW_SUPPLY) {
      if (!state.drivers.some((d) => d.driverId === fixture.driverId)) {
        await this.registry.createDriver({
          driverId: fixture.driverId,
          name: `演練司機 ${fixture.driverId.slice(-1).toUpperCase()}（虛構）`,
          lifecycleStatus: "active",
          licensesValid: true,
          licenseExpiry: end,
          professionalDriverLicenseExpiry: end,
          taxiDriverRegistrationExpiry: end,
          supportedServiceBuckets: ["standard_taxi"],
        });
      }
      if (!state.vehicles.some((v) => v.vehicleId === fixture.vehicleId)) {
        await repository.persistChanges({
          vehicles: [
            {
              ...structuredClone(template),
              ...fixture,
              operatingArea: "taipei",
              supportedServiceBuckets: ["standard_taxi"],
              dispatchableFlag: true,
              insuranceStatus: "valid",
              exclusivityApproved: true,
              createdAt: now,
              updatedAt: now,
            },
          ],
          contracts: [
            {
              ...contract,
              contractId: `review-contract-${fixture.vehicleId}`,
              vehicleId: fixture.vehicleId,
              partnerId: "review-synthetic-operator",
              operatingAreaId: "taipei",
              startAt: start,
              endAt: end,
              createdAt: now,
              updatedAt: now,
            },
          ],
          policies: [
            {
              ...policy,
              policyId: `review-policy-${fixture.vehicleId}`,
              vehicleId: fixture.vehicleId,
              policyNo: `SIMULATED-${fixture.vehicleId}`,
              insurerName: "虛構演練保險來源",
              startAt: start,
              endAt: end,
              createdAt: now,
              updatedAt: now,
            },
          ],
          exclusivities: [
            {
              ...exclusivity,
              vehicleId: fixture.vehicleId,
              declarationFileId: "review-simulated-document",
              exclusiveProviderName: "虛構演練車隊",
              effectiveStart: start,
              effectiveEnd: end,
              updatedAt: now,
            },
          ],
          supplyPairs: [
            {
              vehicleId: fixture.vehicleId,
              driverId: fixture.driverId,
              etaMinutes: 1,
            },
          ],
          disclosureProfiles: [
            {
              vehicleId: fixture.vehicleId,
              make: "演練車廠",
              model: "虛構展示車",
              modelYear: 2026,
              doorCount: 4,
              color: "白",
              status: "complete",
              missingFieldCodes: [],
              verifiedByActorId: "review-synthetic-source",
              verifiedAt: now,
              sourceSubmissionId: null,
              version: 1,
              updatedAt: now,
            },
          ],
          driverCredentials: [
            {
              driverId: fixture.driverId,
              registrationNo: `SIMULATED-${fixture.driverId}`,
              registrationArea: "演練・非真實證照",
              effectiveFrom: start,
              effectiveUntil: end,
              status: "verified_active",
              maskedDisplay: "演練 SIM-***",
              verifiedByActorId: "review-synthetic-source",
              verifiedAt: now,
              sourceSubmissionId: null,
              version: 1,
              updatedAt: now,
            },
          ],
        });
      }
    }
    const authorizations = await taxi.loadState();
    if (
      !authorizations.authorizations.some(
        (a) => a.authorizationId === AUTHORIZATION_ID,
      )
    ) {
      await taxi.persistAuthorization({
        authorizationId: AUTHORIZATION_ID,
        operatorId: "review-synthetic-operator",
        authorityCode: "SIMULATED-REVIEW",
        businessPlanVersion: "review-v1",
        status: "approved",
        serviceAreaCodes: ["TAIPEI_CORE"],
        activeFareVersionId: "taipei-20230401",
        effectiveFrom: start,
        effectiveUntil: end,
        createdAt: now,
        updatedAt: now,
      });
    }
    for (const fixture of REVIEW_SUPPLY) {
      if (
        !authorizations.vehicles.some(
          (v) =>
            v.authorizationId === AUTHORIZATION_ID &&
            v.vehicleId === fixture.vehicleId,
        )
      )
        await taxi.persistVehicle({
          authorizationVehicleId: fixture.vehicleId.endsWith("a")
            ? "76d4f522-5323-4789-9df5-faf5202be039"
            : "d98f0102-1a99-4e3d-a753-66914883a195",
          authorizationId: AUTHORIZATION_ID,
          vehicleId: fixture.vehicleId,
          status: "active",
          effectiveFrom: start,
          effectiveUntil: end,
        });
    }
    // Read only this service bucket; never rerun bootstrap or replace unrelated
    // orders, authorization state or in-flight commands.
    await this.registry.prepareDispatchSupply("standard_taxi");
    for (const fixture of REVIEW_SUPPLY) {
      if (
        !this.registry
          .listLatestDriverLocations()
          .some((location) => location.driverId === fixture.driverId)
      )
        await this.registry.recordDriverLocation({
          driverId: fixture.driverId,
          lat: 25.0142,
          lng: 121.4636,
          accuracyM: 5,
          recordedAt: now,
        });
    }
    return {
      simulated: true,
      authorizationId: AUTHORIZATION_ID,
      supply: REVIEW_SUPPLY,
    };
  }
}
