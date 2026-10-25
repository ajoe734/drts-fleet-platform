import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";
import type { MultiTaxiOperatingAuthorizationRecord } from "@drts/contracts";

import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { CallcenterService } from "../../../apps/api/src/modules/callcenter/callcenter.service";
import { DriverProfileService } from "../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { ForwarderService } from "../../../apps/api/src/modules/forwarder/forwarder.service";
import { OpsDispatchEventsService } from "../../../apps/api/src/common/ops-dispatch-events.service";
import { OwnedMobilityTaskEventsService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility-task-events.service";
import { OwnedMobilityService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { RegulatoryRegistryService } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { VehicleEligibilityService } from "../../../apps/api/src/modules/vehicle-eligibility/vehicle-eligibility.service";
import { describeExclusivityOperatorBinding } from "../../../apps/platform-admin-web/app/fleet/fleet-governance";

const ROOT = resolve(__dirname, "../../..");

function buildAuthorization(
  authorizationId: string,
  operatorId: string,
): MultiTaxiOperatingAuthorizationRecord {
  return {
    authorizationId,
    authorityCode: "AUTH-TPE-R02",
    operatorId,
    businessPlanVersion: "2026.1",
    serviceAreaCodes: ["TPE"],
    activeFareVersionId: "fare-v1",
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveUntil: "2027-12-31T23:59:59.000Z",
    status: "approved",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function createServices() {
  const opsEvents = new OpsDispatchEventsService(new EventEmitter() as never);
  const auditService = new AuditNotificationService();
  const recordAuditSpy = vi.spyOn(auditService, "recordAuditLog");
  const driverProfile = new DriverProfileService(auditService);
  const registry = new RegulatoryRegistryService(
    opsEvents,
    auditService,
    driverProfile,
  );
  const vehicleEligibility = new VehicleEligibilityService(
    registry,
    auditService,
  );
  const callcenter = new CallcenterService(auditService);
  const taskEvents = new OwnedMobilityTaskEventsService(
    new EventEmitter() as never,
  );
  const ownedMobility = new OwnedMobilityService(
    registry,
    auditService,
    callcenter,
    taskEvents,
    opsEvents,
  );
  const forwarder = new ForwarderService(
    registry,
    auditService,
    [],
    undefined,
    ownedMobility,
    vehicleEligibility,
  );
  return {
    auditService,
    recordAuditSpy,
    registry,
    vehicleEligibility,
    ownedMobility,
    forwarder,
  };
}

describe("BUREAU-R02: single-operator vehicle exclusivity binding & cross-operator dispatch refusal", () => {
  it("treats active exclusivity rows without exclusiveOperatorId as unbound (exclusivity_operator_unbound) instead of silently allowing dispatch", async () => {
    const { registry } = createServices();

    await registry.submitExclusivityReview("veh-demo-001", {
      exclusiveOperatorId: null,
      exclusiveProviderName: "DRTS Metro Fleet Co.",
      declarationFileId: "file-excl-unbound-001",
      effectiveStart: "2026-01-01",
      effectiveEnd: "2027-12-31",
    });
    await registry.approveExclusivity("veh-demo-001", {
      reviewerId: "ops-reviewer-001",
    });

    const vehicle = registry
      .listVehicles()
      .find((entry) => entry.vehicleId === "veh-demo-001")!;
    expect(vehicle.exclusivityApproved).toBe(false);
    expect(vehicle.dispatchableFlag).toBe(false);
    expect(vehicle.supplyLifecycle.exclusivity.operatorId).toBeNull();
    expect(vehicle.supplyLifecycle.dispatch.blockedReasons).toContain(
      "exclusivity_operator_unbound",
    );

    const decision = registry.evaluateVehicleOperatorExclusivity(
      "veh-demo-001",
      {
        requestingOperatorId: "partner-demo-001",
        auditRefusal: true,
      },
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe("exclusivity_operator_unbound");
    expect(decision.boundOperatorId).toBeNull();
  });

  it("allows dispatch for the bound operator and refuses cross-operator dispatch with exclusivity_other_operator and decision audit", () => {
    const { recordAuditSpy, registry } = createServices();

    // Seed binds veh-demo-001 to partner-demo-001 and veh-demo-004 to partner-demo-004
    const vehicle1 = registry
      .listVehicles()
      .find((entry) => entry.vehicleId === "veh-demo-001")!;
    expect(vehicle1.supplyLifecycle.exclusivity.operatorId).toBe(
      "partner-demo-001",
    );
    expect(vehicle1.exclusivityApproved).toBe(true);

    // Bound operator (partner-demo-001) is allowed
    const allowedDecision = registry.evaluateVehicleOperatorExclusivity(
      "veh-demo-001",
      {
        requestingOperatorId: "partner-demo-001",
        auditRefusal: true,
      },
    );
    expect(allowedDecision.allowed).toBe(true);
    expect(allowedDecision.reasonCode).toBeNull();
    expect(
      registry.getVehicleDispatchability("veh-demo-001", "standard_taxi", {
        requestingOperatorId: "partner-demo-001",
      }),
    ).toBe(true);

    // Cross operator (partner-demo-004) is refused and audited
    const refusedDecision = registry.evaluateVehicleOperatorExclusivity(
      "veh-demo-001",
      {
        requestingOperatorId: "partner-demo-004",
        auditRefusal: true,
        requestId: "req-r02-audit-001",
      },
    );
    expect(refusedDecision.allowed).toBe(false);
    expect(refusedDecision.reasonCode).toBe("exclusivity_other_operator");
    expect(refusedDecision.vehicleId).toBe("veh-demo-001");
    expect(refusedDecision.requestingOperatorId).toBe("partner-demo-004");
    expect(refusedDecision.boundOperatorId).toBe("partner-demo-001");
    expect(typeof refusedDecision.evaluatedAt).toBe("string");

    expect(
      registry.getVehicleDispatchability("veh-demo-001", "standard_taxi", {
        requestingOperatorId: "partner-demo-004",
      }),
    ).toBe(false);

    const candidatesForPartner4 = registry.getEligibleCandidates(
      "standard_taxi",
      null,
      {
        requestingOperatorId: "partner-demo-004",
      },
    );
    expect(
      candidatesForPartner4.map((candidate) => candidate.vehicleId),
    ).not.toContain("veh-demo-001");

    const refusalAuditCall = recordAuditSpy.mock.calls.find(
      ([entry]) =>
        entry.moduleName === "regulatory-registry" &&
        entry.actionName === "refuse_cross_operator_dispatch" &&
        entry.resourceId === "veh-demo-001",
    );
    expect(refusalAuditCall).toBeDefined();
    expect(refusalAuditCall?.[0].newValuesSummary).toMatchObject({
      vehicleId: "veh-demo-001",
      reasonCode: "exclusivity_other_operator",
      requestingOperatorId: "partner-demo-004",
      boundOperatorId: "partner-demo-001",
    });
    expect(typeof refusalAuditCall?.[0].newValuesSummary?.evaluatedAt).toBe(
      "string",
    );
  });

  it("enforces operator exclusivity in VehicleEligibilityService, OwnedMobilityService (multi-taxi dispatch & queue), and ForwarderService", async () => {
    const { registry, vehicleEligibility, ownedMobility, forwarder } =
      createServices();

    const authPartner1 = buildAuthorization(
      "auth-partner-001",
      "partner-demo-001",
    );
    const authPartner4 = buildAuthorization(
      "auth-partner-004",
      "partner-demo-004",
    );

    // 0. VehicleEligibilityService: listEligibleSupply & assertDispatchAssignmentEligible
    const eligibleForPartner1 = vehicleEligibility.listEligibleSupply(
      "taxi_realtime",
      {
        requestingOperatorId: "partner-demo-001",
      },
    );
    expect(
      eligibleForPartner1.map((candidate) => candidate.vehicleId),
    ).toContain("veh-demo-001");

    const eligibleForPartner4 = vehicleEligibility.listEligibleSupply(
      "taxi_realtime",
      {
        requestingOperatorId: "partner-demo-004",
      },
    );
    expect(
      eligibleForPartner4.map((candidate) => candidate.vehicleId),
    ).not.toContain("veh-demo-001");

    expect(() =>
      vehicleEligibility.assertDispatchAssignmentEligible(
        {
          serviceBucket: "standard_taxi",
          businessDispatchSubtype: null,
          serviceProductCode: "taxi_realtime",
          requestingOperatorId: "partner-demo-004",
        },
        "veh-demo-001",
        "drv-demo-001",
      ),
    ).toThrowError();

    // 1. OwnedMobilityService: positive path for bound operator (partner-demo-001) with veh-demo-001
    const orderPartner1 = await ownedMobility.createMultiTaxiRide(
      {
        pickup: {
          address: "Taipei Main Station",
        },
        dropoff: {
          address: "Taipei 101",
        },
        passenger: {
          name: "Allowed Passenger",
          phone: "0912000111",
        },
        timingMode: "on_demand",
        requestedPickupAt: new Date(Date.now() + 60_000).toISOString(),
        paymentMethodTokenRef: null,
      },
      authPartner1,
    );
    const jobPartner1 = await ownedMobility.dispatchOrder(
      orderPartner1.orderId,
      { mode: "auto" },
    );
    const candidatesPartner1 = await ownedMobility.listDispatchCandidates(
      jobPartner1.dispatchJobId,
    );
    expect(
      candidatesPartner1.map((candidate) => candidate.vehicleId),
    ).toContain("veh-demo-001");
    expect(
      candidatesPartner1.map((candidate) => candidate.vehicleId),
    ).not.toContain("veh-demo-004");

    // 2. OwnedMobilityService: cross-operator refusal for partner-demo-004 vs veh-demo-001 (bound to partner-demo-001)
    const orderPartner4 = await ownedMobility.createMultiTaxiRide(
      {
        pickup: {
          address: "Taipei Main Station",
        },
        dropoff: {
          address: "Taipei 101",
        },
        passenger: {
          name: "Test Passenger",
          phone: "0912345678",
        },
        timingMode: "on_demand",
        requestedPickupAt: new Date(Date.now() + 60_000).toISOString(),
        paymentMethodTokenRef: null,
      },
      authPartner4,
    );

    const jobPartner4 = await ownedMobility.dispatchOrder(
      orderPartner4.orderId,
      { mode: "auto" },
    );

    // Candidate list for partner-demo-004 excludes veh-demo-001 (bound to partner-demo-001)
    const candidatesPartner4 = await ownedMobility.listDispatchCandidates(
      jobPartner4.dispatchJobId,
    );
    expect(
      candidatesPartner4.map((candidate) => candidate.vehicleId),
    ).not.toContain("veh-demo-001");

    // Attempting to assign veh-demo-001 to partner-demo-004's order is refused with VEHICLE_EXCLUSIVITY_OTHER_OPERATOR
    let assignError: unknown = null;
    try {
      await ownedMobility.createDispatchAssignment(
        jobPartner4,
        orderPartner4,
        "veh-demo-001",
        "drv-demo-001",
      );
    } catch (error) {
      assignError = error;
    }
    expect(assignError).toBeDefined();
    const assignResponse = (
      assignError as { getResponse: () => { error?: Record<string, unknown> } }
    ).getResponse();
    expect(assignResponse.error?.code).toBe(
      "VEHICLE_EXCLUSIVITY_OTHER_OPERATOR",
    );
    expect(assignResponse.error?.details).toMatchObject({
      vehicleId: "veh-demo-001",
      driverId: "drv-demo-001",
      reasonCode: "exclusivity_other_operator",
      requestingOperatorId: "partner-demo-004",
      boundOperatorId: "partner-demo-001",
    });

    // Queue check-in under partner-demo-004's authorization for veh-demo-001 is also refused
    let queueError: unknown = null;
    try {
      await ownedMobility.queueCheckInMultiTaxi(
        {
          siteId: "site-taipei-main",
          vehicleId: "veh-demo-001",
          queueMode: "virtual_matching",
        },
        authPartner4,
      );
    } catch (error) {
      queueError = error;
    }
    expect(queueError).toBeDefined();
    const queueResponse = (
      queueError as { getResponse: () => { error?: Record<string, unknown> } }
    ).getResponse();
    expect(queueResponse.error?.code).toBe(
      "QUEUE_VEHICLE_EXCLUSIVITY_OTHER_OPERATOR",
    );
    expect(queueResponse.error?.details).toMatchObject({
      vehicleId: "veh-demo-001",
      reasonCode: "exclusivity_other_operator",
      requestingOperatorId: "partner-demo-004",
      boundOperatorId: "partner-demo-001",
    });

    // Meanwhile, queue check-in under partner-demo-001's authorization for veh-demo-001 succeeds!
    const checkedInEntry = await ownedMobility.queueCheckInMultiTaxi(
      {
        siteId: "site-taipei-main",
        vehicleId: "veh-demo-001",
        queueMode: "virtual_matching",
      },
      authPartner1,
    );
    expect(checkedInEntry.status).toBe("checked_in");
    expect(checkedInEntry.vehicleId).toBe("veh-demo-001");

    // 2. ForwarderService: broadcastOrder and relayDriverAccept enforce operator exclusivity
    const forwarded = await forwarder.ingestExternalOrder({
      platformCode: "uber",
      externalOrderId: "ext-r02-001",
      payload: {
        serviceBucket: "standard_taxi",
        requestingOperatorId: "partner-demo-004",
        pickupAddress: "Songshan Airport",
        dropoffAddress: "Xinyi District",
      },
    });

    // Broadcasting for partner-demo-004 refuses drv-demo-001 (paired with veh-demo-001, bound to partner-demo-001)
    let broadcastError: unknown = null;
    try {
      await forwarder.broadcastOrder(forwarded.mirrorOrderId, {
        candidateDriverIds: ["drv-demo-001"],
      });
    } catch (error) {
      broadcastError = error;
    }
    expect(broadcastError).toBeDefined();
    const broadcastResponse = (
      broadcastError as {
        getResponse: () => { error?: Record<string, unknown> };
      }
    ).getResponse();
    expect(broadcastResponse.error?.code).toBe(
      "NO_ELIGIBLE_FORWARDER_CANDIDATES",
    );

    // Broadcasting for bound operator (partner-demo-001) succeeds, and subsequent rebind causes acceptForwardedOrder/relayDriverAccept to refuse
    const forwardedPartner1 = await forwarder.ingestExternalOrder({
      platformCode: "uber",
      externalOrderId: "ext-r02-002",
      payload: {
        serviceBucket: "standard_taxi",
        requestingOperatorId: "partner-demo-001",
        pickupAddress: "Songshan Airport",
        dropoffAddress: "Xinyi District",
      },
    });
    const broadcasted = await forwarder.broadcastOrder(
      forwardedPartner1.mirrorOrderId,
      {
        candidateDriverIds: ["drv-demo-001"],
      },
    );
    expect(broadcasted.candidateDriverIds).toContain("drv-demo-001");

    // Rebind veh-demo-001 to partner-demo-004 before driver accepts the precomputed broadcast
    await registry.approveExclusivity("veh-demo-001", {
      reviewerId: "ops-reviewer-001",
      exclusiveOperatorId: "partner-demo-004",
    });

    let acceptError: unknown = null;
    try {
      await forwarder.acceptForwardedOrder(
        forwardedPartner1.mirrorOrderId,
        "drv-demo-001",
      );
    } catch (error) {
      acceptError = error;
    }
    expect(acceptError).toBeDefined();
    const acceptResponse = (
      acceptError as {
        getResponse: () => { error?: Record<string, unknown> };
      }
    ).getResponse();
    expect(acceptResponse.error?.code).toBe(
      "FORWARDER_VEHICLE_EXCLUSIVITY_OTHER_OPERATOR",
    );
    expect(acceptResponse.error?.details).toMatchObject({
      orderId: forwardedPartner1.mirrorOrderId,
      driverId: "drv-demo-001",
      vehicleId: "veh-demo-001",
      reasonCode: "exclusivity_other_operator",
      requestingOperatorId: "partner-demo-001",
      boundOperatorId: "partner-demo-004",
    });
  });

  it("verifies V0131 migration and platform-admin fleet exclusivity operator binding helper", () => {
    const migrationSql = readFileSync(
      resolve(ROOT, "infra/migrations/V0131__exclusivity_operator_binding.sql"),
      "utf8",
    );
    expect(migrationSql).toContain("ALTER TABLE reg.dispatch_exclusivities");
    expect(migrationSql).toContain(
      "ALTER TABLE reg.phase1_registry_exclusivities",
    );
    expect(migrationSql).toContain("exclusive_operator_id");

    const boundSummary = describeExclusivityOperatorBinding({
      exclusiveOperatorId: "partner-demo-001",
      exclusiveProviderName: "DRTS Metro Fleet Co.",
    });
    expect(boundSummary).toEqual({
      operatorId: "partner-demo-001",
      providerName: "DRTS Metro Fleet Co.",
      bound: true,
      displayLabel: "DRTS Metro Fleet Co. (partner-demo-001)",
    });

    const unboundSummary = describeExclusivityOperatorBinding({
      exclusiveOperatorId: null,
      exclusiveProviderName: "Legacy Unbound Fleet",
    });
    expect(unboundSummary).toEqual({
      operatorId: null,
      providerName: "Legacy Unbound Fleet",
      bound: false,
      displayLabel: "Legacy Unbound Fleet (exclusivity_operator_unbound)",
    });
  });

  it("preserves NULL exclusiveOperatorId and exclusivity_operator_unbound on legacy pre-V0131 persisted rows without auto-binding to contract.partnerId", async () => {
    const persistChanges = vi.fn(async () => undefined);
    const repository = {
      isEnabled: vi.fn(() => true),
      loadState: vi.fn(async () => ({
        vehicles: [
          {
            vehicleId: "veh-legacy-r02",
            plateNo: "TPE-8899",
            operatingArea: "taichung-port",
            supportedServiceBuckets: ["standard_taxi"],
            dispatchableFlag: true,
            exclusivityApproved: true,
            insuranceStatus: "valid",
          },
        ],
        drivers: [
          {
            driverId: "drv-legacy-r02",
            name: "Legacy Driver",
            supportedServiceBuckets: ["standard_taxi"],
            workState: "available",
            licensesValid: true,
          },
        ],
        supplyPairs: [
          {
            vehicleId: "veh-legacy-r02",
            driverId: "drv-legacy-r02",
            etaMinutes: 5,
          },
        ],
        contracts: [
          {
            contractId: "contract-legacy-r02",
            vehicleId: "veh-legacy-r02",
            partnerId: "fp-legacy-001",
            partnerType: "fleet_partner",
            contractType: "service_fleet_contract",
            operatingAreaId: "taichung-port",
            serviceScope: "standard_taxi",
            startAt: "2026-01-01T00:00:00Z",
            endAt: "2027-12-31T23:59:59Z",
            status: "active",
            approvedBy: "platform-admin-001",
            approvedAt: "2026-01-01T00:00:00Z",
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-01T00:00:00Z",
          },
        ],
        policies: [
          {
            policyId: "policy-legacy-r02",
            vehicleId: "veh-legacy-r02",
            policyNo: "POL-LEGACY-R02",
            insuranceType: "passenger_liability",
            insurerName: "Legacy Insurance",
            coverageAmount: 3000000,
            startAt: "2026-01-01T00:00:00Z",
            endAt: "2027-12-31T23:59:59Z",
            status: "active",
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-01T00:00:00Z",
          },
        ],
        // Legacy pre-V0131 row without exclusiveOperatorId field
        exclusivities: [
          {
            vehicleId: "veh-legacy-r02",
            declarationStatus: "submitted",
            declarationFileId: "file-legacy-r02",
            reviewStatus: "approved",
            reviewerId: "platform-admin-001",
            reviewedAt: "2026-01-01T00:00:00Z",
            exclusiveProviderName: "Legacy Fleet Name Only",
            effectiveStart: "2026-01-01T00:00:00Z",
            effectiveEnd: "2027-12-31T23:59:59Z",
            terminationReason: null,
            updatedAt: "2026-01-01T00:00:00Z",
          },
        ],
        disclosureProfiles: [],
        driverCredentials: [],
      })),
      persistChanges,
      reportPersistenceFailure: vi.fn(),
    };

    const opsEvents = new OpsDispatchEventsService(new EventEmitter() as never);
    const auditService = new AuditNotificationService();
    const driverProfile = new DriverProfileService(auditService);
    const registry = new RegulatoryRegistryService(
      opsEvents,
      auditService,
      driverProfile,
      repository as never,
    );

    await registry.onModuleInit();

    const exclusivity = registry
      .listExclusivities()
      .find((entry) => entry.vehicleId === "veh-legacy-r02")!;
    expect(exclusivity.exclusiveOperatorId).toBeNull();

    const vehicle = registry
      .listVehicles()
      .find((entry) => entry.vehicleId === "veh-legacy-r02")!;
    expect(vehicle.supplyLifecycle.exclusivity.operatorId).toBeNull();
    expect(vehicle.supplyLifecycle.dispatch.blockedReasons).toContain(
      "exclusivity_operator_unbound",
    );
    expect(vehicle.exclusivityApproved).toBe(false);
    expect(vehicle.dispatchableFlag).toBe(false);

    const decision = registry.evaluateVehicleOperatorExclusivity(
      "veh-legacy-r02",
      {
        requestingOperatorId: "fp-legacy-001",
        auditRefusal: true,
      },
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe("exclusivity_operator_unbound");
    expect(decision.boundOperatorId).toBeNull();
  });

  it("aligns FleetPartner.fleetPartnerId with MultiTaxiOperatingAuthorization.operatorId via multiTaxiOperatorIds so a fleet can dispatch its own bound vehicle", async () => {
    const { registry, ownedMobility } = createServices();

    // Simulate a fleet partner fp-X that maps to MultiTaxiOperatingAuthorization.operatorId = "op-X"
    registry.registerFleetPartnerOperatorMapping("fp-X", ["op-X"]);

    // Bind veh-demo-001 exclusivity to fp-X (e.g. from contract.partnerId = fp-X)
    await registry.submitExclusivityReview("veh-demo-001", {
      exclusiveOperatorId: "fp-X",
      exclusiveProviderName: "Fleet X",
      declarationFileId: "file-fp-x-001",
      effectiveStart: "2026-01-01",
      effectiveEnd: "2027-12-31",
    });
    await registry.approveExclusivity("veh-demo-001", {
      reviewerId: "ops-reviewer-001",
    });

    const authOpX = buildAuthorization("auth-op-x", "op-X");
    const authOpY = buildAuthorization("auth-op-y", "op-Y");

    // Dispatching with op-X's operating authorization succeeds because fp-X maps to multiTaxiOperatorIds: ["op-X"]
    const decisionOpX = registry.evaluateVehicleOperatorExclusivity(
      "veh-demo-001",
      {
        requestingOperatorId: "op-X",
        operatingAuthorizationId: authOpX.authorizationId,
        auditRefusal: true,
      },
    );
    expect(decisionOpX.allowed).toBe(true);
    expect(decisionOpX.reasonCode).toBeNull();

    const checkedInOpX = await ownedMobility.queueCheckInMultiTaxi(
      {
        siteId: "site-taipei-main",
        vehicleId: "veh-demo-001",
        queueMode: "virtual_matching",
      },
      authOpX,
    );
    expect(checkedInOpX.status).toBe("checked_in");

    // Meanwhile op-Y is still refused with exclusivity_other_operator
    const decisionOpY = registry.evaluateVehicleOperatorExclusivity(
      "veh-demo-001",
      {
        requestingOperatorId: "op-Y",
        operatingAuthorizationId: authOpY.authorizationId,
        auditRefusal: true,
      },
    );
    expect(decisionOpY.allowed).toBe(false);
    expect(decisionOpY.reasonCode).toBe("exclusivity_other_operator");
    expect(decisionOpY.boundOperatorId).toBe("fp-X");
    expect(decisionOpY.requestingOperatorId).toBe("op-Y");
  });

  it("refuses sibling operator op-Y when a fleet partner lists multiple multiTaxiOperatorIds (op-X, op-Y) and exclusivity explicitly binds op-X", async () => {
    const { registry, recordAuditSpy, ownedMobility } = createServices();

    // Fleet partner fp-X lists two distinct operating-authority operator IDs
    registry.registerFleetPartnerOperatorMapping("fp-X", ["op-X", "op-Y"]);

    await registry.submitExclusivityReview("veh-demo-001", {
      exclusiveOperatorId: "op-X",
      exclusiveProviderName: "Operator X",
      declarationFileId: "file-op-x-explicit",
      effectiveStart: "2026-01-01",
      effectiveEnd: "2027-12-31",
    });
    await registry.approveExclusivity("veh-demo-001", {
      reviewerId: "ops-reviewer-001",
    });

    const authOpX = buildAuthorization("auth-op-x", "op-X");
    const authOpY = buildAuthorization("auth-op-y", "op-Y");

    // Bound operator op-X is allowed
    const decisionOpX = registry.evaluateVehicleOperatorExclusivity(
      "veh-demo-001",
      {
        requestingOperatorId: "op-X",
        operatingAuthorizationId: authOpX.authorizationId,
        auditRefusal: true,
      },
    );
    expect(decisionOpX.allowed).toBe(true);
    expect(decisionOpX.reasonCode).toBeNull();

    // Sibling operator op-Y under the same fleet partner MUST be refused and audited
    const decisionOpY = registry.evaluateVehicleOperatorExclusivity(
      "veh-demo-001",
      {
        requestingOperatorId: "op-Y",
        operatingAuthorizationId: authOpY.authorizationId,
        auditRefusal: true,
      },
    );
    expect(decisionOpY.allowed).toBe(false);
    expect(decisionOpY.reasonCode).toBe("exclusivity_other_operator");
    expect(decisionOpY.boundOperatorId).toBe("op-X");
    expect(decisionOpY.requestingOperatorId).toBe("op-Y");

    await expect(
      ownedMobility.queueCheckInMultiTaxi(
        {
          siteId: "site-taipei-main",
          vehicleId: "veh-demo-001",
          queueMode: "virtual_matching",
        },
        authOpY,
      ),
    ).rejects.toMatchObject({
      code: "QUEUE_VEHICLE_EXCLUSIVITY_OTHER_OPERATOR",
    });

    const refusalEvents = recordAuditSpy.mock.calls.filter(
      ([entry]) =>
        entry.moduleName === "regulatory-registry" &&
        entry.actionName === "refuse_cross_operator_dispatch" &&
        entry.resourceId === "veh-demo-001" &&
        entry.newValuesSummary?.requestingOperatorId === "op-Y" &&
        entry.newValuesSummary?.boundOperatorId === "op-X",
    );
    expect(refusalEvents.length).toBeGreaterThanOrEqual(2);
  });
});
