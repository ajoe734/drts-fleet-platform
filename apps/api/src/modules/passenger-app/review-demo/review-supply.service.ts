import { Injectable } from "@nestjs/common";
import { ApiRequestError } from "../../../common/api-envelope";
import { DatabaseService } from "../../../common/db/database.service";
import { RegulatoryRegistryService } from "../../regulatory-registry/regulatory-registry.service";
import { RegulatoryRegistryRepository } from "../../regulatory-registry/regulatory-registry.repository";
import { MultiTaxiService } from "../../multi-taxi/multi-taxi.service";
import { MultiTaxiRepository } from "../../multi-taxi/multi-taxi.repository";
import { ServiceProductService } from "../../service-product/service-product.service";
import { VehicleEligibilityService } from "../../vehicle-eligibility/vehicle-eligibility.service";
import { FleetPartnerService } from "../../fleet-partner/fleet-partner.service";
import { DriverProfileService } from "../../driver-profile/driver-profile.service";
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
    private readonly eligibility: VehicleEligibilityService,
    private readonly fleets: FleetPartnerService,
    private readonly profiles: DriverProfileService,
  ) {}

  async prepare() {
    if (!reviewDemoEnabled(process.env))
      throw new ApiRequestError(404, "not_found", "Rehearsal is not enabled.");
    // Explicit nonproduction rehearsal configuration, not an inactive-product
    // bypass. Persist the existing reservation master and await its ACK before
    // reporting readiness. Keep the independent runtime policy guard intact.
    if (!this.database.isEnabled())
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
    const existing = this.products
      .listServiceProducts()
      .find((record) => record.serviceProductType === "taxi_reservation");
    if (!existing)
      await this.products.createServiceProduct({ ...product, active: true });
    else if (!existing.active)
      await this.products.updateServiceProduct(existing.serviceProductId, {
        active: true,
      });
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
    const now = new Date().toISOString();
    const start = "2026-01-01T00:00:00.000Z";
    const end = "2099-01-01T00:00:00.000Z";
    const operatorId = "review-synthetic-operator";
    let fleet =
      await this.fleets.findFleetPartnerForMultiTaxiOperator(operatorId);
    if (!fleet) {
      fleet = await this.fleets.createFleetPartner({
        legalName: "虛構演練派遣業者（合成・非正式）",
        displayName: "虛構演練車隊",
        businessRegistrationNo: "SIMULATED-NOT-A-REGISTRATION",
        contactName: "合成演練來源",
        contactPhone: "SIMULATED-NOT-A-PHONE",
        partnershipType: "business_dispatch_fleet",
      });
      // Preserve the actual writer-issued Fleet ID and await the mapping ACK.
      fleet = await this.fleets.updateFleetPartner(fleet.fleetPartnerId, {
        multiTaxiOperatorIds: [operatorId],
      });
    }
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
        // Durable registry refresh replaces bootstrap-only seed templates.
        // Existing rehearsal vehicles need no template to be prepared again.
        if (!template || !contract || !policy || !exclusivity)
          throw new ApiRequestError(
            503,
            "review_supply_unavailable",
            "Established rehearsal supply templates are unavailable.",
          );
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
              exclusiveOperatorId: operatorId,
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
        });
      }
      await this.profiles.prepareProfileAuthority(fixture.driverId);
      await this.profiles.updateProfile(fixture.driverId, {
        driverSurname: "演練",
      });
      // Refresh even existing rehearsal supply: older preparation used an
      // incomplete display. Both the raw value and public mask are synthetic.
      await repository.persistChanges({
        driverCredentials: [
          {
            driverId: fixture.driverId,
            registrationNo: `SIMULATED-NOT-REAL-${fixture.driverId.endsWith("a") ? "9001" : "9002"}`,
            registrationArea: "演練・非真實證照",
            effectiveFrom: start,
            effectiveUntil: end,
            status: "verified_active",
            maskedDisplay: fixture.driverId.endsWith("a")
              ? "••••9001"
              : "••••9002",
            verifiedByActorId: "review-synthetic-source",
            verifiedAt: now,
            sourceSubmissionId: null,
            version: 1,
            updatedAt: now,
          },
        ],
      });
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
    await this.eligibility.enableServiceProductForSupply(
      "taxi_reservation",
      REVIEW_SUPPLY.map((fixture) => fixture.vehicleId),
      {
        actorId: "review-synthetic-source",
        actorType: "system",
        tenantId: null,
      },
    );
    for (const fixture of REVIEW_SUPPLY)
      this.eligibility.assertDispatchAssignmentEligible(
        {
          serviceBucket: "standard_taxi",
          businessDispatchSubtype: null,
          serviceProductCode: "taxi_reservation",
        },
        fixture.vehicleId,
        fixture.driverId,
      );
    // This is an explicitly simulated external GPS source. Preparing another
    // rehearsal refreshes its ordinary persisted heartbeat, including after
    // a restart; an existing stale location must not masquerade as ready supply.
    for (const fixture of REVIEW_SUPPLY)
      await this.registry.recordDriverLocation({
        driverId: fixture.driverId,
        lat: 25.0142,
        lng: 121.4636,
        accuracyM: 5,
        recordedAt: now,
      });
    return {
      simulated: true,
      fleetPartnerId: fleet.fleetPartnerId,
      receiptSource: "合成演練資料・非正式憑證",
      authorizationId: AUTHORIZATION_ID,
      supply: REVIEW_SUPPLY,
    };
  }
}
