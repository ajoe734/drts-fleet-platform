import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";

import { OpsDispatchEventsService } from "../../../../apps/api/src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { CallcenterService } from "../../../../apps/api/src/modules/callcenter/callcenter.service";
import { DriverProfileService } from "../../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { OwnedMobilityTaskEventsService } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility-task-events.service";
import { OwnedMobilityService } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { RegulatoryRegistryService } from "../../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { TenantPartnerService } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.service";

import {
  isForbiddenStatutoryOverrideAction,
  resolveQueueSemantics,
} from "../../../../apps/ops-console-web/lib/queue-semantics";

function createQueueTestHarness() {
  const auditService = new AuditNotificationService();
  const callcenterService = new CallcenterService(auditService);
  const taskEventsService = new OwnedMobilityTaskEventsService(
    new EventEmitter() as never,
  );
  const opsDispatchEvents = new OpsDispatchEventsService(
    new EventEmitter() as never,
  );
  const driverProfileService = new DriverProfileService(auditService);
  const regulatoryRegistryService = new RegulatoryRegistryService(
    opsDispatchEvents,
    auditService,
    driverProfileService,
  );
  const tenantPartnerService = new TenantPartnerService(auditService);

  const reg = regulatoryRegistryService as unknown as {
    vehicles: Record<string, unknown>[];
    drivers: Record<string, unknown>[];
    contracts: Record<string, unknown>[];
    policies: Record<string, unknown>[];
    exclusivities: Record<string, unknown>[];
    supplyPairs: Record<string, unknown>[];
  };

  reg.vehicles.length = 0;
  reg.drivers.length = 0;
  reg.contracts.length = 0;
  reg.policies.length = 0;
  reg.exclusivities.length = 0;
  reg.supplyPairs.length = 0;

  const startAt = "2026-01-01T00:00:00.000Z";
  const endAt = "2026-12-31T23:59:59.000Z";

  // Register 3 queueable test vehicles
  for (let i = 1; i <= 3; i++) {
    const vId = `veh-queue-00${i}`;
    const dId = `drv-queue-00${i}`;
    reg.vehicles.push({
      vehicleId: vId,
      plateNo: `ABC-900${i}`,
      licenseType: "ordinary_taxi",
      operatingArea: "taichung-port",
      supportedServiceBuckets: ["standard_taxi"],
      dispatchableFlag: true,
      exclusivityApproved: true,
      insuranceStatus: "valid",
      createdAt: startAt,
      updatedAt: startAt,
      supplyLifecycle: {
        status: "active",
        dispatch: { eligible: true, blockedReasons: [], evaluatedAt: startAt },
        offboarding: { status: "none" },
        lastTrace: null,
        contract: { lifecycleStatus: "active", contractId: `contract-${vId}` },
        insurance: { lifecycleStatus: "active", policyId: `policy-${vId}` },
        exclusivity: { lifecycleStatus: "active" },
      },
    });

    reg.contracts.push({
      contractId: `contract-${vId}`,
      vehicleId: vId,
      partnerId: "partner-demo-001",
      partnerType: "enterprise_partner",
      contractType: "service_fleet_contract",
      operatingAreaId: "taichung-port",
      serviceScope: "standard_taxi",
      startAt,
      endAt,
      status: "active",
      lifecycleStatus: "active",
      approvedBy: "admin",
      approvedAt: startAt,
      createdAt: startAt,
      updatedAt: startAt,
    });

    reg.policies.push({
      policyId: `policy-${vId}`,
      vehicleId: vId,
      policyNo: `POL-${vId}`,
      insuranceType: "passenger_liability",
      insurerName: "Demo Insurance",
      coverageAmount: 3000000,
      startAt,
      endAt,
      status: "active",
      lifecycleStatus: "active",
      createdAt: startAt,
      updatedAt: startAt,
    });

    reg.exclusivities.push({
      vehicleId: vId,
      declarationStatus: "submitted",
      declarationFileId: `file-${vId}`,
      reviewStatus: "approved",
      lifecycleStatus: "active",
      reviewerId: "admin",
      reviewedAt: startAt,
      exclusiveProviderName: "Acme Dispatch",
      effectiveStart: startAt,
      effectiveEnd: endAt,
      terminationReason: null,
      updatedAt: startAt,
    });

    reg.drivers.push({
      driverId: dId,
      name: `排班司機${i}號`,
      supportedServiceBuckets: ["standard_taxi"],
      workState: "available",
      licensesValid: true,
      lifecycleStatus: "active",
      activatedAt: startAt,
      suspendedAt: null,
      retiredAt: null,
      dispatchEligible: true,
      eligibilityBlockedReasons: [],
      createdAt: startAt,
      updatedAt: startAt,
    });

    reg.supplyPairs.push({
      vehicleId: vId,
      driverId: dId,
      etaMinutes: 3 * i,
    });
  }

  const ownedMobilityService = new OwnedMobilityService(
    regulatoryRegistryService,
    auditService,
    callcenterService,
    taskEventsService,
    opsDispatchEvents,
    undefined,
    tenantPartnerService,
  );

  return {
    ownedMobilityService,
    regulatoryRegistryService,
  };
}

describe("SR-QA-DISPATCH-001: C039 Queue Operations, Semantics & Statutory Denial Verification", () => {
  it("C039: assigns deterministic FIFO positions 1, 2, 3 and handles duplicate check-in idempotently", async () => {
    const { ownedMobilityService } = createQueueTestHarness();
    const siteId = "site-taichung-port-01";

    // Step 1: Vehicle 1 checks in -> position 1
    const entry1 = ownedMobilityService.queueCheckIn({
      vehicleId: "veh-queue-001",
      siteId,
      queueMode: "physical_rank",
    });
    expect(entry1.status).toBe("checked_in");
    expect(entry1.position).toBe(1);

    // Step 2: Vehicle 2 checks in -> position 2
    const entry2 = ownedMobilityService.queueCheckIn({
      vehicleId: "veh-queue-002",
      siteId,
      queueMode: "physical_rank",
    });
    expect(entry2.status).toBe("checked_in");
    expect(entry2.position).toBe(2);

    // Step 3: Vehicle 3 checks in -> position 3
    const entry3 = ownedMobilityService.queueCheckIn({
      vehicleId: "veh-queue-003",
      siteId,
      queueMode: "physical_rank",
    });
    expect(entry3.status).toBe("checked_in");
    expect(entry3.position).toBe(3);

    // Step 4: Duplicate check-in for Vehicle 1 is idempotent, returns existing entry with unchanged position 1
    const dupEntry1 = ownedMobilityService.queueCheckIn({
      vehicleId: "veh-queue-001",
      siteId,
      queueMode: "physical_rank",
    });
    expect(dupEntry1.queueEntryId).toBe(entry1.queueEntryId);
    expect(dupEntry1.position).toBe(1);

    // List all queue entries
    const allEntries = ownedMobilityService.listQueueEntries();
    expect(allEntries.length).toBe(3);

    // Step 5: Vehicle 1 checks out
    const checkoutResult = ownedMobilityService.queueCheckOut({
      vehicleId: "veh-queue-001",
      siteId,
      queueMode: "physical_rank",
    });
    expect(checkoutResult.status).toBe("checked_out");
    expect(checkoutResult.checkedOutAt).toBeDefined();
  });

  it("C039: statutory denial rejects non-virtual queue modes for multi-taxi direct", () => {
    const { ownedMobilityService } = createQueueTestHarness();

    // multi_taxi_direct with physical_rank must be strictly denied
    try {
      ownedMobilityService.setProfileQueuePolicy("multi_taxi_direct", [
        "physical_rank",
      ]);
      expect.fail("Should have thrown MULTI_TAXI_QUEUE_MODE_FORBIDDEN");
    } catch (err: unknown) {
      expect((err as { code?: string }).code).toBe(
        "MULTI_TAXI_QUEUE_MODE_FORBIDDEN",
      );
    }

    try {
      ownedMobilityService.setProfileQueuePolicy("multi_taxi_direct", [
        "taxi_stand",
      ]);
      expect.fail("Should have thrown MULTI_TAXI_QUEUE_MODE_FORBIDDEN");
    } catch (err: unknown) {
      expect((err as { code?: string }).code).toBe(
        "MULTI_TAXI_QUEUE_MODE_FORBIDDEN",
      );
    }

    // multi_taxi_direct with only virtual_matching is permitted
    expect(() =>
      ownedMobilityService.setProfileQueuePolicy("multi_taxi_direct", [
        "virtual_matching",
      ]),
    ).not.toThrow();

    expect(
      ownedMobilityService.getProfileQueuePolicy("multi_taxi_direct"),
    ).toEqual(["virtual_matching"]);
  });

  it("C039: resolveQueueSemantics detects statutory refusal and displays clear human-readable denial copy", () => {
    // 1. Multi-taxi attempting physical rank queue
    const multiTaxiPhysical = resolveQueueSemantics(
      {
        runtimeProfileCode: "multi_taxi_direct",
        queueMode: "physical_rank",
      },
      "zh",
    );
    expect(multiTaxiPhysical.isMultiTaxi).toBe(true);
    expect(multiTaxiPhysical.isStatutoryRefusal).toBe(true);
    expect(multiTaxiPhysical.refusalCopy).toBeDefined();
    expect(typeof multiTaxiPhysical.refusalCopy).toBe("string");
    expect(multiTaxiPhysical.refusalCopy!.length).toBeGreaterThan(0);

    // 2. Blank siteId is reported explicitly as unassigned without masquerading as virtual
    const blankSiteOrder = resolveQueueSemantics(
      {
        runtimeProfileCode: "ordinary_taxi",
        queueMode: "physical_rank",
        siteId: null,
      },
      "zh",
    );
    expect(blankSiteOrder.isSiteBlank).toBe(true);
    expect(blankSiteOrder.siteDisplay).toBe("未指定站點");
    expect(blankSiteOrder.queueModeText).toBe("實體排班");
    expect(blankSiteOrder.queueModeText).not.toBe("虛擬媒合");

    // 3. Valid multi-taxi virtual matching has no statutory refusal
    const validMultiTaxi = resolveQueueSemantics(
      {
        runtimeProfileCode: "multi_taxi_direct",
        queueMode: "virtual_matching",
      },
      "zh",
    );
    expect(validMultiTaxi.isMultiTaxi).toBe(true);
    expect(validMultiTaxi.isStatutoryRefusal).toBe(false);
    expect(validMultiTaxi.refusalCopy).toBeNull();
    expect(validMultiTaxi.queueModeText).toBe("虛擬媒合");
  });

  it("C039: isForbiddenStatutoryOverrideAction blocks statutory override / force-checkin actions", () => {
    // Prohibited override and bypass actions
    const forbiddenActions = [
      "request_exception_override",
      "request_override",
      "approve_exception_override",
      "approve_override",
      "reject_exception_override",
      "reject_override",
      "manual_fare_override",
      "fare_override",
      "force_checkin",
      "force_check_in",
      "force_checkin_rank",
      "approval_request",
      "jump_approval",
    ];

    for (const action of forbiddenActions) {
      expect(
        isForbiddenStatutoryOverrideAction(action),
        `Action ${action} must be identified as forbidden statutory override`,
      ).toBe(true);
    }

    // Permitted operational actions
    const allowedActions = [
      "view_details",
      "refresh_status",
      "export_logs",
      "assign_candidate",
      "cancel_order",
      "inspect_audit_trail",
    ];

    for (const action of allowedActions) {
      expect(
        isForbiddenStatutoryOverrideAction(action),
        `Action ${action} must be allowed as standard operation`,
      ).toBe(false);
    }
  });
});
