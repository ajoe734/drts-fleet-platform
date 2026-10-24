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
      exclusiveOperatorId: null,
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
});
