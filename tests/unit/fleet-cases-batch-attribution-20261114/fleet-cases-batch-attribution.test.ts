import { describe, expect, it, vi } from "vitest";

import type {
  ComplaintCaseRecord,
  DriverFleetAffiliationRecord,
  FleetPartnerRecord,
} from "@drts/contracts";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementService } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import { ComplaintService } from "../../../apps/api/src/modules/complaint/complaint.service";
import type { FleetPartnerRepository } from "../../../apps/api/src/modules/fleet-partner/fleet-partner.repository";
import { FleetPartnerCaseService } from "../../../apps/api/src/modules/fleet-partner/fleet-partner-case.service";
import { FleetPartnerService } from "../../../apps/api/src/modules/fleet-partner/fleet-partner.service";
import { OwnedMobilityService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import type { RegulatoryRegistryService } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { fleetStorageFixture } from "../helpers/fleet-document-fixture";

/**
 * FLEET-CASES-BATCH-ATTRIBUTION-20261114.
 *
 * GET /api/fleet-partner/cases attributed every complaint and incident on its
 * own. Each one refreshed its order through prepareOrderAction, which also
 * prepares the dispatch supply of the order's service bucket (drivers,
 * vehicles, locations), and then reloaded every driver affiliation. On shared
 * dev that held one request for 8-18 s and starved concurrent Fleet portal
 * requests, so deploy-dev's fleet resubmit journey timed out. One list now
 * shares a batch. Each order is refreshed once, each bucket's supply is
 * prepared once, and affiliations are loaded once. The attribution results
 * are unchanged.
 */

function countingRepository() {
  const state: {
    fleetPartners: FleetPartnerRecord[];
    driverAffiliations: DriverFleetAffiliationRecord[];
  } = { fleetPartners: [], driverAffiliations: [] };
  const counters = { loadDriverAffiliations: 0 };
  const repository = {
    isEnabled: () => true,
    loadState: async () => structuredClone(state),
    loadFleetPartners: async () => structuredClone(state.fleetPartners),
    loadDriverAffiliations: async () => {
      counters.loadDriverAffiliations += 1;
      return structuredClone(state.driverAffiliations);
    },
    findFleetPartnerById: async (fleetPartnerId: string) =>
      structuredClone(
        state.fleetPartners.find((p) => p.fleetPartnerId === fleetPartnerId) ??
          null,
      ),
    persistChanges: async (changes: {
      fleetPartners?: readonly FleetPartnerRecord[];
      driverAffiliations?: readonly DriverFleetAffiliationRecord[];
    }) => {
      for (const partner of changes.fleetPartners ?? []) {
        state.fleetPartners = [
          ...state.fleetPartners.filter(
            (p) => p.fleetPartnerId !== partner.fleetPartnerId,
          ),
          structuredClone(partner),
        ];
      }
      for (const affiliation of changes.driverAffiliations ?? []) {
        state.driverAffiliations = [
          ...state.driverAffiliations.filter(
            (a) => a.affiliationId !== affiliation.affiliationId,
          ),
          structuredClone(affiliation),
        ];
      }
    },
    reportPersistenceFailure: () => {},
  } as unknown as FleetPartnerRepository;
  return { repository, counters };
}

function fakeMobility(driverByOrder: Record<string, string>) {
  const prepareCalls: Array<{ orderId: string; batched: boolean }> = [];
  const mobility = {
    getDriverTasksForOrder: (orderId: string) =>
      driverByOrder[orderId]
        ? [
            {
              orderId,
              driverId: driverByOrder[orderId],
              status: "completed",
              completedAt: "2026-11-02T00:00:00.000Z",
            },
          ]
        : [],
    getActiveDispatchAssignmentForOrder: () => null,
    getDispatchAssignmentsForOrder: () => [],
    prepareOrderAction: async (
      { orderId }: { orderId: string },
      options?: { preparedServiceBuckets?: Set<string> },
    ) => {
      prepareCalls.push({
        orderId,
        batched: options?.preparedServiceBuckets instanceof Set,
      });
    },
  } as unknown as OwnedMobilityService;
  return { mobility, prepareCalls };
}

describe("Fleet case list attributes cases in one batch", () => {
  it("refreshes each order once and loads affiliations once per list, with unchanged results", async () => {
    const { repository, counters } = countingRepository();
    const { mobility, prepareCalls } = fakeMobility({
      "ord-a": "drv-a",
      "ord-b": "drv-b",
    });
    const fleetPartnerService = new FleetPartnerService(
      new BillingSettlementService(new AuditNotificationService()),
      mobility,
      {
        listDrivers: () => [
          { driverId: "drv-a", name: "司機甲" },
          { driverId: "drv-b", name: "司機乙" },
        ],
      } as unknown as RegulatoryRegistryService,
      repository,
    );
    const fleet = await fleetPartnerService.createFleetPartner({
      legalName: "Batch Fleet Co., Ltd.",
      displayName: "Batch Fleet",
      businessRegistrationNo: "REG-BATCH",
      contactName: "Fleet Ops Lead",
      contactPhone: "+886-2-5550-0003",
      partnershipType: "fleet_management",
    });
    await fleetPartnerService.createDriverFleetAffiliation("drv-a", {
      fleetPartnerId: fleet.fleetPartnerId,
      affiliationType: "managed_by",
      effectiveFrom: "2026-01-01T00:00:00.000Z",
    });

    const complaints = new ComplaintService(new AuditNotificationService());
    const created = ["ord-a", "ord-a", "ord-b"].map(
      (relatedOrderId, index) =>
        complaints.createComplaintCase({
          caseSource: "ops",
          relatedOrderId,
          category: "driver_service",
          severity: "normal",
          description: `批次歸屬測試 ${index + 1}`,
        }) as ComplaintCaseRecord,
    );
    const cases = new FleetPartnerCaseService(
      complaints,
      fleetPartnerService,
      undefined,
      fleetStorageFixture().storage,
    );

    counters.loadDriverAffiliations = 0;
    prepareCalls.length = 0;
    const list = await cases.listCases(fleet.fleetPartnerId);

    // Both ord-a complaints belong to the fleet; ord-b's driver has no
    // affiliation, so it stays unattributed and out of this fleet's list.
    expect(list.map((item) => item.caseNo).sort()).toEqual(
      [created[0]!.caseNo, created[1]!.caseNo].sort(),
    );
    for (const item of list) {
      expect(item).toMatchObject({
        driverId: "drv-a",
        driver: "司機甲",
        fleetPartnerId: fleet.fleetPartnerId,
        responsibility: "fleet",
      });
    }
    expect(
      [...prepareCalls].sort((a, b) => a.orderId.localeCompare(b.orderId)),
    ).toEqual([
      { orderId: "ord-a", batched: true },
      { orderId: "ord-b", batched: true },
    ]);
    expect(counters.loadDriverAffiliations).toBe(1);

    // A second list is a new batch: it reads the current state again.
    await cases.listCases(fleet.fleetPartnerId);
    expect(counters.loadDriverAffiliations).toBe(2);
  });

  it("single attribution calls keep their original per-call refresh", async () => {
    const { repository, counters } = countingRepository();
    const { mobility, prepareCalls } = fakeMobility({ "ord-a": "drv-a" });
    const service = new FleetPartnerService(
      new BillingSettlementService(new AuditNotificationService()),
      mobility,
      { listDrivers: () => [] } as unknown as RegulatoryRegistryService,
      repository,
    );
    counters.loadDriverAffiliations = 0;
    await service.resolveOrderDriverFleetAttribution("ord-a");
    await service.resolveOrderDriverFleetAttribution("ord-a");
    expect(prepareCalls).toEqual([
      { orderId: "ord-a", batched: false },
      { orderId: "ord-a", batched: false },
    ]);
    expect(counters.loadDriverAffiliations).toBe(2);
  });
});

describe("prepareOrderAction prepares each service bucket's supply once per batch", () => {
  function fakeOwner(prepareDispatchSupply: ReturnType<typeof vi.fn>) {
    return {
      ownedMobilityRepository: {
        isEnabled: () => true,
        loadOrderActionContext: async ({ orderId }: { orderId: string }) => ({
          orders: [{ orderId, serviceBucket: "business_dispatch" }],
          dispatchJobs: [],
          dispatchAttempts: [],
          dispatchAssignments: [],
          driverTasks: [],
          dispatchTraceLogs: [],
          passengerDisclosureSnapshots: [],
        }),
      },
      regulatoryRegistryService: { prepareDispatchSupply },
      orders: [],
      dispatchJobs: [],
      dispatchAttempts: [],
      dispatchAssignments: [],
      driverTasks: [],
      dispatchTraceLogs: [],
      passengerDisclosureSnapshots: [],
    };
  }

  it("skips a bucket the batch already prepared, but commands without a batch always prepare", async () => {
    const prepareDispatchSupply = vi.fn(async () => undefined);
    const owner = fakeOwner(prepareDispatchSupply);
    const prepare = OwnedMobilityService.prototype.prepareOrderAction;
    const preparedServiceBuckets = new Set<string>();

    await prepare.call(owner, { orderId: "o-1" }, { preparedServiceBuckets });
    await prepare.call(owner, { orderId: "o-2" }, { preparedServiceBuckets });
    expect(prepareDispatchSupply).toHaveBeenCalledTimes(1);
    expect(prepareDispatchSupply).toHaveBeenCalledWith("business_dispatch");
    expect([...preparedServiceBuckets]).toEqual(["business_dispatch"]);

    await prepare.call(owner, { orderId: "o-3" });
    expect(prepareDispatchSupply).toHaveBeenCalledTimes(2);
    expect(
      (owner.orders as Array<{ orderId: string }>)
        .map((order) => order.orderId)
        .sort(),
    ).toEqual(["o-1", "o-2", "o-3"]);
  });
});
