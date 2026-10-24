import { describe, expect, it, vi } from "vitest";

import type {
  ComplaintCaseRecord,
  ComplaintTimelineEntry,
  DriverFleetAffiliationRecord,
  FleetPartnerRecord,
} from "@drts/contracts";
import { ApiRequestError } from "../../../apps/api/src/common/api-envelope";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementService } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import {
  ComplaintCommitOutcomeUnknownError,
  ComplaintRepository,
  type ComplaintPendingCommitRecord,
} from "../../../apps/api/src/modules/complaint/complaint.repository";
import type { CallcenterService } from "../../../apps/api/src/modules/callcenter/callcenter.service";
import { ComplaintService } from "../../../apps/api/src/modules/complaint/complaint.service";
import { buildSettlementDisputeCase } from "../../../apps/api/src/modules/complaint/settlement-dispute";
import type { FleetPartnerRepository } from "../../../apps/api/src/modules/fleet-partner/fleet-partner.repository";
import { FleetPartnerCaseService } from "../../../apps/api/src/modules/fleet-partner/fleet-partner-case.service";
import { FleetPartnerService } from "../../../apps/api/src/modules/fleet-partner/fleet-partner.service";
import type { OwnedMobilityService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import type { RegulatoryRegistryService } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { byteStream, fleetStorageFixture } from "../helpers/fleet-document-fixture";

/**
 * Old defect reproduced here: FleetPartnerCaseService.mapComplaintToFleetCase
 * hardcoded driverId="drv-affiliated"/fleetPartnerId="METRO_FLEET" for every
 * ordinary complaint regardless of its real source order, and listCases()
 * never filtered ordinary complaints by requested fleet at all (only the
 * seed-case and settlement_dispute branches were scoped). Every test below
 * fails against the pre-fix mapper/list and passes against the fix, which
 * derives attribution from the real order -> driver -> driver-fleet
 * affiliation chain via the already-injected FleetPartnerService.
 */

type FakeTask = { driverId: string; status?: string; completedAt?: string };

/** `hydratedTasksByOrder` is only visible after `prepareOrderAction` runs —
 * standing in for an order/task that was only committed by a different
 * already-warm instance's OwnedMobilityRepository, so a real fix must call
 * it before reading task data instead of only ever consulting this
 * process's own cache. */
function fakeOwnedMobilityService(
  tasksByOrder: Record<string, FakeTask>,
  opts: {
    hydratedTasksByOrder?: Record<string, FakeTask>;
    // Orders the authoritative canonical source reports as genuinely
    // absent: prepareOrderAction throws ORDER_NOT_FOUND for these, same as
    // the real OwnedMobilityService does, without touching `tasksByOrder`
    // -- standing in for a stale local entry the real fix must not trust.
    absentOrderIds?: readonly string[];
  } = {},
): OwnedMobilityService & { prepareOrderActionCalls: string[] } {
  const hydrated = new Map<string, FakeTask>();
  const prepareOrderActionCalls: string[] = [];
  return {
    prepareOrderActionCalls,
    getDriverTasksForOrder: (orderId: string) => {
      const task = tasksByOrder[orderId] ?? hydrated.get(orderId);
      return task
        ? [
            {
              orderId,
              driverId: task.driverId,
              status: task.status ?? "completed",
              completedAt:
                task.completedAt ?? "2026-01-02T00:00:00.000Z",
            },
          ]
        : [];
    },
    getActiveDispatchAssignmentForOrder: () => null,
    getDispatchAssignmentsForOrder: () => [],
    prepareOrderAction: async ({ orderId }: { orderId: string }) => {
      prepareOrderActionCalls.push(orderId);
      if (opts.absentOrderIds?.includes(orderId)) {
        throw new ApiRequestError(404, "ORDER_NOT_FOUND", "Order was not found.");
      }
      const pending = opts.hydratedTasksByOrder?.[orderId];
      if (pending) hydrated.set(orderId, pending);
    },
  } as unknown as OwnedMobilityService & { prepareOrderActionCalls: string[] };
}

function fakeRegistryService(
  drivers: ReadonlyArray<{ driverId: string; name: string }>,
): RegulatoryRegistryService {
  return {
    listDrivers: () => drivers,
  } as unknown as RegulatoryRegistryService;
}

/** Stands in for the persisted Callcenter call session a complaint's
 * `relatedCallId` points to, carrying that call's own canonical
 * `linkedOrderId` -- independent of whatever `relatedOrderId` (if any) the
 * complaint itself was created with. */
function fakeCallcenterService(
  sessionsByCallId: Record<string, { linkedOrderId: string | null }>,
): CallcenterService {
  return {
    getCallSessionForRead: async (callId: string) => {
      const session = sessionsByCallId[callId];
      if (!session) {
        throw new ApiRequestError(
          404,
          "CALL_SESSION_NOT_FOUND",
          "Call session was not found.",
        );
      }
      return session;
    },
  } as unknown as CallcenterService;
}

/** Shared, in-memory stand-in for the durable `admin.phase1_fleet_partners`
 * / `admin.phase1_driver_fleet_affiliations` tables: a second
 * FleetPartnerService instance constructed against the same repository
 * object sees writes the first instance committed, without either instance
 * sharing any in-process cache. */
function sharedFleetPartnerRepository(): FleetPartnerRepository {
  const state: {
    fleetPartners: FleetPartnerRecord[];
    driverAffiliations: DriverFleetAffiliationRecord[];
  } = { fleetPartners: [], driverAffiliations: [] };
  return {
    isEnabled: () => true,
    loadState: async () => structuredClone(state),
    loadFleetPartners: async () => structuredClone(state.fleetPartners),
    loadDriverAffiliations: async () =>
      structuredClone(state.driverAffiliations),
    findFleetPartnerById: async (fleetPartnerId: string) =>
      structuredClone(
        state.fleetPartners.find(
          (partner) => partner.fleetPartnerId === fleetPartnerId,
        ) ?? null,
      ),
    persistChanges: async (changes: {
      fleetPartners?: readonly FleetPartnerRecord[];
      driverAffiliations?: readonly DriverFleetAffiliationRecord[];
    }) => {
      for (const partner of changes.fleetPartners ?? []) {
        state.fleetPartners = [
          ...state.fleetPartners.filter(
            (candidate) => candidate.fleetPartnerId !== partner.fleetPartnerId,
          ),
          structuredClone(partner),
        ];
      }
      for (const affiliation of changes.driverAffiliations ?? []) {
        state.driverAffiliations = [
          ...state.driverAffiliations.filter(
            (candidate) =>
              candidate.affiliationId !== affiliation.affiliationId,
          ),
          structuredClone(affiliation),
        ];
      }
    },
    reportPersistenceFailure: () => {},
  } as unknown as FleetPartnerRepository;
}

/** Shared, in-memory stand-in for the durable `crm.phase1_complaint_cases` /
 * `crm.phase1_complaint_timelines` tables: a second ComplaintService
 * instance constructed against the same repository object can commit and
 * read back a genuine create/reply the first instance made, with neither
 * instance sharing any in-process cache. */
function sharedComplaintRepository(): ComplaintRepository {
  const state: {
    complaintCases: ComplaintCaseRecord[];
    complaintTimelines: ComplaintTimelineEntry[];
  } = { complaintCases: [], complaintTimelines: [] };
  const snapshotFor = (predicate: (item: ComplaintCaseRecord) => boolean) => {
    const cases = state.complaintCases.filter(predicate);
    const caseNos = new Set(cases.map((item) => item.caseNo));
    return {
      complaintCases: structuredClone(cases),
      complaintTimelines: structuredClone(
        state.complaintTimelines.filter((entry) => caseNos.has(entry.caseNo)),
      ),
    };
  };
  return {
    isEnabled: () => true,
    loadState: async () => structuredClone(state),
    loadSettlementState: async () =>
      snapshotFor((item) => item.category === "settlement_dispute"),
    loadCaseState: async (caseNo: string) =>
      snapshotFor((item) => item.caseNo === caseNo),
    persistChanges: async (changes: {
      complaintCases?: readonly ComplaintCaseRecord[];
      complaintTimelines?: readonly ComplaintTimelineEntry[];
    }) => {
      for (const item of changes.complaintCases ?? []) {
        state.complaintCases = [
          ...state.complaintCases.filter(
            (candidate) => candidate.caseNo !== item.caseNo,
          ),
          structuredClone(item),
        ];
      }
      for (const entry of changes.complaintTimelines ?? []) {
        state.complaintTimelines = [
          ...state.complaintTimelines.filter(
            (candidate) => candidate.entryId !== entry.entryId,
          ),
          structuredClone(entry),
        ];
      }
    },
    reportPersistenceFailure: () => {},
  } as unknown as ComplaintRepository;
}

async function buildFleetPartnerService(opts: {
  tasksByOrder: Record<string, FakeTask>;
  hydratedTasksByOrder?: Record<string, FakeTask>;
  absentOrderIds?: readonly string[];
  drivers: ReadonlyArray<{ driverId: string; name: string }>;
  affiliations: ReadonlyArray<{
    driverId: string;
    fleetDisplayName: string;
    effectiveFrom: string;
    effectiveUntil?: string;
  }>;
  fleetPartnerRepository?: FleetPartnerRepository;
}) {
  const mobility = fakeOwnedMobilityService(opts.tasksByOrder, {
    ...(opts.hydratedTasksByOrder !== undefined
      ? { hydratedTasksByOrder: opts.hydratedTasksByOrder }
      : {}),
    ...(opts.absentOrderIds !== undefined
      ? { absentOrderIds: opts.absentOrderIds }
      : {}),
  });
  const service = new FleetPartnerService(
    new BillingSettlementService(new AuditNotificationService()),
    mobility,
    fakeRegistryService(opts.drivers),
    opts.fleetPartnerRepository,
  );

  const fleetIdByDisplayName = new Map<string, string>();
  for (const affiliation of opts.affiliations) {
    let fleetPartnerId = fleetIdByDisplayName.get(affiliation.fleetDisplayName);
    if (!fleetPartnerId) {
      const partner = await service.createFleetPartner({
        legalName: `${affiliation.fleetDisplayName} Co., Ltd.`,
        displayName: affiliation.fleetDisplayName,
        businessRegistrationNo: `REG-${affiliation.fleetDisplayName}`,
        contactName: "Fleet Ops Lead",
        contactPhone: "+886-2-5550-0002",
        partnershipType: "fleet_management",
      });
      fleetPartnerId = partner.fleetPartnerId;
      fleetIdByDisplayName.set(affiliation.fleetDisplayName, fleetPartnerId);
    }
    await service.createDriverFleetAffiliation(affiliation.driverId, {
      fleetPartnerId,
      affiliationType: "managed_by",
      effectiveFrom: affiliation.effectiveFrom,
      ...(affiliation.effectiveUntil
        ? { effectiveUntil: affiliation.effectiveUntil }
        : {}),
    });
  }

  return { service, fleetIdByDisplayName, mobility };
}

describe("FLEET-CASE-ATTRIBUTION-CANONICAL-READBACK-20261024", () => {
  describe("actual source-order attribution replaces the hardcoded fleet/driver", () => {
    it("projects an ordinary complaint to the fleet actually affiliated with its order's driver, isolated from other fleets", async () => {
      const { service: fleetPartnerService, fleetIdByDisplayName } =
        await buildFleetPartnerService({
          tasksByOrder: {
            "ord-fleet-a": { driverId: "drv-a" },
            "ord-fleet-b": { driverId: "drv-b" },
          },
          drivers: [
            { driverId: "drv-a", name: "司機甲" },
            { driverId: "drv-b", name: "司機乙" },
          ],
          affiliations: [
            {
              driverId: "drv-a",
              fleetDisplayName: "Fleet A",
              effectiveFrom: "2026-01-01T00:00:00.000Z",
            },
            {
              driverId: "drv-b",
              fleetDisplayName: "Fleet B",
              effectiveFrom: "2026-01-01T00:00:00.000Z",
            },
          ],
        });
      const fleetAId = fleetIdByDisplayName.get("Fleet A")!;
      const fleetBId = fleetIdByDisplayName.get("Fleet B")!;

      const complaints = new ComplaintService(new AuditNotificationService());
      const caseA = complaints.createComplaintCase({
        caseSource: "ops",
        relatedOrderId: "ord-fleet-a",
        category: "driver_service",
        severity: "normal",
        description: "Fleet A 司機服務申訴",
      }) as ComplaintCaseRecord;
      const caseB = complaints.createComplaintCase({
        caseSource: "ops",
        relatedOrderId: "ord-fleet-b",
        category: "driver_service",
        severity: "normal",
        description: "Fleet B 司機服務申訴",
      }) as ComplaintCaseRecord;

      const { storage } = fleetStorageFixture();
      const cases = new FleetPartnerCaseService(
        complaints,
        fleetPartnerService,
        undefined,
        storage,
      );

      const fleetAList = await cases.listCases(fleetAId);
      expect(fleetAList).toEqual([
        expect.objectContaining({
          caseNo: caseA.caseNo,
          driverId: "drv-a",
          driver: "司機甲",
          fleetPartnerId: fleetAId,
          responsibility: "fleet",
        }),
      ]);
      // A real fleet attribution says nothing about who is actually
      // assigned to work the case; neither case has an assigneeId, so
      // both must honestly show unassigned rather than a fabricated name.
      expect(fleetAList[0]!.assignee).toBe("—");
      // Old defect: both cases were hardcoded to "METRO_FLEET"/"drv-affiliated"
      // and the list never filtered ordinary complaints by fleet at all.
      expect(fleetAList.some((item) => item.caseNo === caseB.caseNo)).toBe(
        false,
      );
      expect(fleetAList[0]!.fleetPartnerId).not.toBe("METRO_FLEET");
      expect(fleetAList[0]!.driverId).not.toBe("drv-affiliated");

      const fleetBList = await cases.listCases(fleetBId);
      expect(fleetBList).toEqual([
        expect.objectContaining({
          caseNo: caseB.caseNo,
          driverId: "drv-b",
          driver: "司機乙",
          fleetPartnerId: fleetBId,
        }),
      ]);

      const detailA = await cases.getCaseDetail(fleetAId, caseA.caseNo);
      expect(detailA.caseDetail.fleetPartnerId).toBe(fleetAId);

      await expect(cases.getCaseDetail(fleetBId, caseA.caseNo)).rejects.toMatchObject(
        { code: "CASE_NOT_FLEET_SCOPED" },
      );
    });

    it("resolves a call-only complaint's fleet attribution through its persisted call's own canonical order linkage, when the complaint itself has no direct related order", async () => {
      const { service: fleetPartnerService, fleetIdByDisplayName } =
        await buildFleetPartnerService({
          tasksByOrder: { "ord-from-call": { driverId: "drv-call" } },
          drivers: [{ driverId: "drv-call", name: "司機庚" }],
          affiliations: [
            {
              driverId: "drv-call",
              fleetDisplayName: "Fleet Call",
              effectiveFrom: "2026-01-01T00:00:00.000Z",
            },
          ],
        });
      const fleetId = fleetIdByDisplayName.get("Fleet Call")!;

      const complaints = new ComplaintService(new AuditNotificationService());
      const callOnlyCase = complaints.createComplaintCase({
        caseSource: "phone",
        relatedCallId: "call-001",
        category: "driver_service",
        severity: "normal",
        description: "來電申訴，案件本身未直接記錄 order",
      }) as ComplaintCaseRecord;
      expect(callOnlyCase.relatedOrderId).toBeNull();

      const callcenterService = fakeCallcenterService({
        "call-001": { linkedOrderId: "ord-from-call" },
      });
      const { storage } = fleetStorageFixture();
      const cases = new FleetPartnerCaseService(
        complaints,
        fleetPartnerService,
        undefined,
        storage,
        callcenterService,
      );

      const list = await cases.listCases(fleetId);
      expect(list).toEqual([
        expect.objectContaining({
          caseNo: callOnlyCase.caseNo,
          driverId: "drv-call",
          fleetPartnerId: fleetId,
          responsibility: "fleet",
        }),
      ]);
    });

    it("leaves a call-only complaint unattributed when neither it nor its persisted call has any canonical order linkage", async () => {
      const { service: fleetPartnerService } = await buildFleetPartnerService({
        tasksByOrder: {},
        drivers: [],
        affiliations: [],
      });

      const complaints = new ComplaintService(new AuditNotificationService());
      const callOnlyCase = complaints.createComplaintCase({
        caseSource: "phone",
        relatedCallId: "call-missing",
        category: "driver_service",
        severity: "normal",
        description: "來電申訴，電話本身也沒有任何 order 關聯",
      }) as ComplaintCaseRecord;

      // No session at all for "call-missing": a genuinely missing call is
      // honest non-attribution, not a crash.
      const callcenterService = fakeCallcenterService({});
      const { storage } = fleetStorageFixture();
      const cases = new FleetPartnerCaseService(
        complaints,
        fleetPartnerService,
        undefined,
        storage,
        callcenterService,
      );

      const list = await cases.listCases("any-fleet");
      expect(
        list.some((item) => item.caseNo === callOnlyCase.caseNo),
      ).toBe(false);
      const detail = await complaints.getComplaintCase(callOnlyCase.caseNo);
      expect(detail.relatedOrderId).toBeNull();
    });

    it("propagates a genuine call-session read failure instead of disguising it as unattributed", async () => {
      const { service: fleetPartnerService } = await buildFleetPartnerService({
        tasksByOrder: {},
        drivers: [],
        affiliations: [],
      });

      const complaints = new ComplaintService(new AuditNotificationService());
      const callOnlyCase = complaints.createComplaintCase({
        caseSource: "phone",
        relatedCallId: "call-broken",
        category: "driver_service",
        severity: "normal",
        description: "來電申訴，callcenter 真正讀取失敗",
      }) as ComplaintCaseRecord;

      const callcenterService = {
        getCallSessionForRead: async () => {
          throw new ApiRequestError(
            503,
            "CALL_STORE_UNAVAILABLE",
            "Call store is down.",
          );
        },
      } as unknown as CallcenterService;
      const { storage } = fleetStorageFixture();
      const cases = new FleetPartnerCaseService(
        complaints,
        fleetPartnerService,
        undefined,
        storage,
        callcenterService,
      );

      await expect(
        cases.getCaseDetail("any-fleet", callOnlyCase.caseNo),
      ).rejects.toMatchObject({ code: "CALL_STORE_UNAVAILABLE" });
    });

    it("leaves a complaint truly unattributed (and invisible to every fleet) when its order has no resolvable driver affiliation, instead of guessing a fleet", async () => {
      const { service: fleetPartnerService, fleetIdByDisplayName } =
        await buildFleetPartnerService({
          tasksByOrder: {
            "ord-fleet-a": { driverId: "drv-a" },
            // "ord-no-driver" intentionally has no dispatch task/assignment.
          },
          drivers: [{ driverId: "drv-a", name: "司機甲" }],
          affiliations: [
            {
              driverId: "drv-a",
              fleetDisplayName: "Fleet A",
              effectiveFrom: "2026-01-01T00:00:00.000Z",
            },
          ],
        });
      const fleetAId = fleetIdByDisplayName.get("Fleet A")!;

      const complaints = new ComplaintService(new AuditNotificationService());
      const noDriverCase = complaints.createComplaintCase({
        caseSource: "ops",
        relatedOrderId: "ord-no-driver",
        category: "driver_service",
        severity: "normal",
        description: "找不到實際司機的案件",
      }) as ComplaintCaseRecord;
      const noOrderCase = complaints.createComplaintCase({
        caseSource: "ops",
        category: "driver_service",
        severity: "normal",
        description: "沒有來源訂單的案件",
      }) as ComplaintCaseRecord;

      const { storage } = fleetStorageFixture();
      const cases = new FleetPartnerCaseService(
        complaints,
        fleetPartnerService,
        undefined,
        storage,
      );

      const fleetAList = await cases.listCases(fleetAId);
      expect(fleetAList.some((item) => item.caseNo === noDriverCase.caseNo)).toBe(
        false,
      );
      expect(fleetAList.some((item) => item.caseNo === noOrderCase.caseNo)).toBe(
        false,
      );

      await expect(
        cases.getCaseDetail(fleetAId, noDriverCase.caseNo),
      ).rejects.toMatchObject({ code: "CASE_NOT_FLEET_SCOPED" });
      await expect(
        cases.getCaseDetail(fleetAId, noOrderCase.caseNo),
      ).rejects.toMatchObject({ code: "CASE_NOT_FLEET_SCOPED" });
    });
  });

  describe("FleetPartnerService.resolveOrderDriverFleetAttribution refreshes canonical order/driver data and rejects ambiguity", () => {
    it("hydrates the order's driver task from the canonical repository via prepareOrderAction before resolving, instead of only ever reading this process's own cache", async () => {
      const orderId = "ord-never-seen-locally";
      const { service, fleetIdByDisplayName, mobility } =
        await buildFleetPartnerService({
          // Empty: this instance never itself dispatched this order, so its
          // own in-memory task/assignment cache has nothing for it.
          tasksByOrder: {},
          hydratedTasksByOrder: {
            [orderId]: {
              driverId: "drv-warm-b",
              completedAt: "2026-02-01T00:00:00.000Z",
            },
          },
          drivers: [{ driverId: "drv-warm-b", name: "司機戊" }],
          affiliations: [
            {
              driverId: "drv-warm-b",
              fleetDisplayName: "Fleet Warm B",
              effectiveFrom: "2026-01-01T00:00:00.000Z",
            },
          ],
        });
      const fleetId = fleetIdByDisplayName.get("Fleet Warm B")!;

      // Without a canonical refresh call, this must be null: the order is
      // genuinely absent from this instance's own task/assignment cache.
      expect(mobility.getDriverTasksForOrder(orderId)).toEqual([]);

      const attribution =
        await service.resolveOrderDriverFleetAttribution(orderId);

      expect(mobility.prepareOrderActionCalls).toContain(orderId);
      expect(attribution).toEqual(
        expect.objectContaining({
          driverId: "drv-warm-b",
          driverName: "司機戊",
          fleetPartnerId: fleetId,
        }),
      );
    });

    it("stays unattributed when the authoritative canonical source reports the order genuinely absent, instead of falling back to a stale local task cache that still names a driver", async () => {
      const orderId = "ord-stale-locally-cached";
      const { service, mobility } = await buildFleetPartnerService({
        // A driver task still sits in this process's own local cache for
        // this order -- e.g. left over from before the canonical store was
        // wiped, or a mistaken-identity row that was never cleaned up.
        tasksByOrder: {
          [orderId]: {
            driverId: "drv-stale-cached",
            completedAt: "2026-02-01T00:00:00.000Z",
          },
        },
        // The authoritative repository reports this exact order as
        // genuinely not found when asked to refresh it.
        absentOrderIds: [orderId],
        drivers: [{ driverId: "drv-stale-cached", name: "司機己" }],
        affiliations: [
          {
            driverId: "drv-stale-cached",
            fleetDisplayName: "Fleet Stale",
            effectiveFrom: "2026-01-01T00:00:00.000Z",
          },
        ],
      });

      const attribution =
        await service.resolveOrderDriverFleetAttribution(orderId);

      expect(mobility.prepareOrderActionCalls).toContain(orderId);
      // The authoritative absence must win: this case stays unattributed
      // rather than trusting the stale local cache for a driver/fleet.
      expect(attribution).toBeNull();
    });

    it("resolves a driver-fleet affiliation a genuinely different FleetPartnerService instance committed, neither instance ever sharing an in-process cache", async () => {
      const orderId = "ord-affiliation-cross-instance";
      const asOf = "2026-04-01T00:00:00.000Z";
      const sharedRepository = sharedFleetPartnerRepository();

      // Instance A creates the fleet partner and the driver affiliation;
      // only the shared repository (standing in for the durable
      // admin.phase1_* tables) ever sees this write.
      const { service: instanceA } = await buildFleetPartnerService({
        tasksByOrder: {},
        drivers: [],
        affiliations: [],
        fleetPartnerRepository: sharedRepository,
      });
      const fleetPartner = await instanceA.createFleetPartner({
        legalName: "Fleet Cross Instance Co., Ltd.",
        displayName: "Fleet Cross Instance",
        businessRegistrationNo: "REG-Fleet-Cross-Instance",
        contactName: "Fleet Ops Lead",
        contactPhone: "+886-2-5550-0005",
        partnershipType: "fleet_management",
      });
      await instanceA.createDriverFleetAffiliation("drv-cross-instance", {
        fleetPartnerId: fleetPartner.fleetPartnerId,
        affiliationType: "managed_by",
        effectiveFrom: "2026-01-01T00:00:00.000Z",
      });

      // Instance B is a brand-new FleetPartnerService: its own in-memory
      // fleetPartners/driverAffiliations are seed-only. It only shares the
      // durable repository and has its own order/driver task source.
      const { service: instanceB } = await buildFleetPartnerService({
        tasksByOrder: {
          [orderId]: { driverId: "drv-cross-instance", completedAt: asOf },
        },
        drivers: [{ driverId: "drv-cross-instance", name: "司機甲乙" }],
        affiliations: [],
        fleetPartnerRepository: sharedRepository,
      });

      const attribution =
        await instanceB.resolveOrderDriverFleetAttribution(orderId);
      expect(attribution).toEqual(
        expect.objectContaining({
          driverId: "drv-cross-instance",
          driverName: "司機甲乙",
          fleetPartnerId: fleetPartner.fleetPartnerId,
        }),
      );
    });

    it("leaves a driver with two conflicting fleet affiliations effective at the same historical event time unattributed, instead of guessing between them", async () => {
      const orderId = "ord-ambiguous-affiliation";
      const asOf = "2026-03-01T00:00:00.000Z";
      const { service } = await buildFleetPartnerService({
        tasksByOrder: {
          [orderId]: { driverId: "drv-ambiguous", completedAt: asOf },
        },
        drivers: [{ driverId: "drv-ambiguous", name: "司機己" }],
        affiliations: [
          {
            driverId: "drv-ambiguous",
            fleetDisplayName: "Fleet X",
            effectiveFrom: "2026-01-01T00:00:00.000Z",
          },
        ],
      });
      // A second, overlapping affiliation to a *different* fleet, both
      // genuinely effective at `asOf` -- a real-world data-integrity gap,
      // not a normal supersession. The old code's "pick the latest
      // effectiveFrom" would have silently chosen one; the fix must not.
      const fleetY = await service.createFleetPartner({
        legalName: "Fleet Y Co., Ltd.",
        displayName: "Fleet Y",
        businessRegistrationNo: "REG-Fleet-Y",
        contactName: "Fleet Ops Lead",
        contactPhone: "+886-2-5550-0003",
        partnershipType: "fleet_management",
      });
      await service.createDriverFleetAffiliation("drv-ambiguous", {
        fleetPartnerId: fleetY.fleetPartnerId,
        affiliationType: "managed_by",
        effectiveFrom: "2026-01-01T00:00:00.000Z",
      });

      const attribution =
        await service.resolveOrderDriverFleetAttribution(orderId);
      expect(attribution).toBeNull();
    });
  });

  describe("legitimate Fleet reply, cross-fleet rejection, and closed regression on a correctly attributed case", () => {
    it("accepts a reply from the actually attributed fleet, rejects a foreign fleet, and rejects once closed", async () => {
      const { service: fleetPartnerService, fleetIdByDisplayName } =
        await buildFleetPartnerService({
          tasksByOrder: { "ord-fleet-a": { driverId: "drv-a" } },
          drivers: [{ driverId: "drv-a", name: "司機甲" }],
          affiliations: [
            {
              driverId: "drv-a",
              fleetDisplayName: "Fleet A",
              effectiveFrom: "2026-01-01T00:00:00.000Z",
            },
          ],
        });
      const fleetAId = fleetIdByDisplayName.get("Fleet A")!;

      const complaints = new ComplaintService(new AuditNotificationService());
      const caseA = complaints.createComplaintCase({
        caseSource: "ops",
        relatedOrderId: "ord-fleet-a",
        category: "driver_service",
        severity: "normal",
        description: "Fleet A 司機服務申訴",
      }) as ComplaintCaseRecord;

      const { storage } = fleetStorageFixture();
      const cases = new FleetPartnerCaseService(
        complaints,
        fleetPartnerService,
        undefined,
        storage,
      );

      const receipt = await cases.submitReply(
        fleetAId,
        caseA.caseNo,
        "fleet-manager-a",
        { content: "已完成司機教育訓練", idempotencyKey: "fleet-a-reply-1" },
      );
      expect(receipt.deduplicated).toBe(false);

      await expect(
        cases.submitReply("some-other-fleet-id", caseA.caseNo, "intruder", {
          content: "不應通過",
        }),
      ).rejects.toMatchObject({ code: "CASE_NOT_FLEET_SCOPED" });

      complaints.closeComplaintCase(caseA.caseNo, {
        resolutionCode: "resolved_with_apology",
        closingNote: "已完成處置",
      });

      await expect(
        cases.submitReply(fleetAId, caseA.caseNo, "fleet-manager-a", {
          content: "結案後仍嘗試回覆",
        }),
      ).rejects.toMatchObject({ code: "CASE_CLOSED_NO_REPLY" });
    });
  });

  /** Old defect reproduced here: splitAttachmentManifest/
   * stripFleetReplyAttachmentManifest used the *first* occurrence of the
   * literal marker string and trusted whatever followed it as a real
   * manifest purely by JSON shape. A legitimate human reply that happened
   * to contain that same literal substring (quoted, pasted, or
   * coincidentally typed) therefore lost real trailing text, and a human
   * typing a convincing-looking (but never-uploaded) manifest got a
   * fabricated attachment relation. The fix finds the *last* occurrence
   * (a real manifest is always appended last) and, for the Fleet-side
   * reconstruction, verifies every attachmentId against this case's actual
   * confirmed stored attachments before trusting it at all. */
  describe("attachment-manifest marker/plaintext/JSON collision", () => {
    const MARKER = "\n<<fleet-reply-attachments>>";

    /** `cases` (the writer) and `reader` (a second, cold FleetPartnerCaseService
     * sharing the same ComplaintService and the same backing document store)
     * are deliberately separate instances: `cases`'s own in-memory
     * `this.timelines` cache already holds the literal `content` it just
     * wrote, which would make assertions pass trivially without ever
     * exercising splitAttachmentManifest's marker/JSON parsing at all. The
     * `reader` has nothing in its own cache for this case, so its
     * getCaseTimeline must actually reconstruct the entry from the
     * canonical Complaint note -- the same real seam a different already-
     * warm API instance would use. */
    async function buildAttributedCase() {
      const { service: fleetPartnerService, fleetIdByDisplayName } =
        await buildFleetPartnerService({
          tasksByOrder: { "ord-marker-collision": { driverId: "drv-mc" } },
          drivers: [{ driverId: "drv-mc", name: "司機馬可" }],
          affiliations: [
            {
              driverId: "drv-mc",
              fleetDisplayName: "Fleet Marker Collision",
              effectiveFrom: "2026-01-01T00:00:00.000Z",
            },
          ],
        });
      const fleetId = fleetIdByDisplayName.get("Fleet Marker Collision")!;
      const complaints = new ComplaintService(new AuditNotificationService());
      const caseItem = complaints.createComplaintCase({
        caseSource: "ops",
        relatedOrderId: "ord-marker-collision",
        category: "driver_service",
        severity: "normal",
        description: "附件 marker 碰撞回歸測試案件",
      }) as ComplaintCaseRecord;
      const { store } = fleetStorageFixture();
      const cases = new FleetPartnerCaseService(
        complaints,
        fleetPartnerService,
        undefined,
        fleetStorageFixture("clean", store).storage,
      );
      const reader = new FleetPartnerCaseService(
        complaints,
        fleetPartnerService,
        undefined,
        fleetStorageFixture("clean", store).storage,
      );
      return { complaints, cases, reader, fleetId, caseItem };
    }

    it("keeps a legitimate reply body intact, with no fabricated attachment, when it merely contains the marker literal followed by plain non-JSON text and no attachment was ever submitted", async () => {
      const { cases, reader, fleetId, caseItem } = await buildAttributedCase();
      const legitBody = `客戶原文引用：${MARKER} 這不是附件清單，只是巧合出現的文字。`;

      await cases.submitReply(fleetId, caseItem.caseNo, "fleet-manager-mc", {
        content: legitBody,
        idempotencyKey: "marker-collision-plain-1",
      });

      const timeline = await reader.getCaseTimeline(fleetId, caseItem.caseNo);
      const replyEntry = timeline.find((entry) => entry.t === "車行回覆");
      expect(replyEntry).toBeDefined();
      expect(replyEntry!.body).toContain(legitBody);
      expect(replyEntry!.attachments ?? []).toEqual([]);
    });

    it("does not fabricate an attachment relation from reply text that merely looks like a manifest, since its attachmentId was never actually uploaded for this case", async () => {
      const { cases, reader, fleetId, caseItem } = await buildAttributedCase();
      const fakeManifest = JSON.stringify([
        { attachmentId: "att-never-uploaded", name: "fake-evidence.pdf" },
      ]);
      const legitBody = `補充說明：${MARKER}${fakeManifest}`;

      await cases.submitReply(fleetId, caseItem.caseNo, "fleet-manager-mc", {
        content: legitBody,
        idempotencyKey: "marker-collision-fake-json-1",
      });

      const timeline = await reader.getCaseTimeline(fleetId, caseItem.caseNo);
      const replyEntry = timeline.find((entry) => entry.t === "車行回覆");
      expect(replyEntry).toBeDefined();
      // The whole literal text is preserved: no truncation, and critically
      // no attachment relation was fabricated from the never-uploaded
      // "att-never-uploaded" id.
      expect(replyEntry!.body).toContain(legitBody);
      expect(replyEntry!.attachments ?? []).toEqual([]);
    });

    it("recovers the real appended attachment manifest and keeps the preceding legitimate text intact, even when that text itself contains the marker literal", async () => {
      const { cases, reader, fleetId, caseItem } = await buildAttributedCase();
      const attachmentBytes = Buffer.from("evidence bytes");
      const intent = await cases.createAttachmentUploadUrl(
        fleetId,
        caseItem.caseNo,
        "fleet-manager-mc",
        {
          fileName: "real-evidence.pdf",
          fileSize: attachmentBytes.length,
          contentType: "application/pdf",
        },
      );
      const uploaded = await cases.uploadAttachmentContent(
        fleetId,
        caseItem.caseNo,
        intent.objectKey,
        byteStream(attachmentBytes),
        "application/octet-stream",
      );
      const attachment = await cases.confirmAttachmentUpload(
        fleetId,
        caseItem.caseNo,
        "fleet-manager-mc",
        {
          attachmentId: intent.attachmentId,
          objectKey: intent.objectKey,
          fileName: "real-evidence.pdf",
          fileSize: attachmentBytes.length,
          contentType: "application/pdf",
          checksumSha256: uploaded.checksumSha256,
        },
      );

      const legitBody = `先前紀錄節錄：${MARKER} 這段純文字恰好也包含同樣字串，但後面沒有接 JSON。`;
      await cases.submitReply(fleetId, caseItem.caseNo, "fleet-manager-mc", {
        content: legitBody,
        idempotencyKey: "marker-collision-real-manifest-1",
        attachmentIds: [attachment.attachmentId],
      });

      const timeline = await reader.getCaseTimeline(fleetId, caseItem.caseNo);
      const replyEntry = timeline.find((entry) => entry.t === "車行回覆");
      expect(replyEntry).toBeDefined();
      // The legitimate literal-marker text ahead of the real appended
      // manifest survives untouched...
      expect(replyEntry!.body).toContain(legitBody);
      // ...and the real, actually-uploaded attachment is still recovered.
      expect(replyEntry!.attachments).toEqual([
        expect.objectContaining({
          attachmentId: attachment.attachmentId,
          name: "real-evidence.pdf",
        }),
      ]);
    });

    it("keeps a legitimate Ops note intact when it merely contains the marker literal with no real trailing manifest, while still hiding a real Fleet-appended manifest from the default Ops projection", async () => {
      const { complaints, cases, fleetId, caseItem } =
        await buildAttributedCase();

      // A plain Ops note that happens to contain the literal marker
      // substring, with no real manifest ever appended after it.
      const legitOpsNote = `內部備註：${MARKER} 純屬巧合的文字，不是附件。`;
      complaints.addComplaintCaseNote(caseItem.caseNo, {
        note: legitOpsNote,
      });
      const opsTimelineAfterNote = complaints.getComplaintTimeline(
        caseItem.caseNo,
      );
      const noteEntry = opsTimelineAfterNote.find(
        (entry) => entry.note === legitOpsNote,
      );
      expect(noteEntry).toBeDefined();

      // A genuine Fleet reply with a real attachment still has its raw
      // manifest hidden from the same default (Ops) projection.
      const attachmentBytes = Buffer.from("evidence bytes");
      const intent = await cases.createAttachmentUploadUrl(
        fleetId,
        caseItem.caseNo,
        "fleet-manager-mc",
        {
          fileName: "ops-hidden-evidence.pdf",
          fileSize: attachmentBytes.length,
          contentType: "application/pdf",
        },
      );
      const uploaded = await cases.uploadAttachmentContent(
        fleetId,
        caseItem.caseNo,
        intent.objectKey,
        byteStream(attachmentBytes),
        "application/octet-stream",
      );
      const attachment = await cases.confirmAttachmentUpload(
        fleetId,
        caseItem.caseNo,
        "fleet-manager-mc",
        {
          attachmentId: intent.attachmentId,
          objectKey: intent.objectKey,
          fileName: "ops-hidden-evidence.pdf",
          fileSize: attachmentBytes.length,
          contentType: "application/pdf",
          checksumSha256: uploaded.checksumSha256,
        },
      );
      await cases.submitReply(fleetId, caseItem.caseNo, "fleet-manager-mc", {
        content: "已附上真實附件",
        idempotencyKey: "marker-collision-ops-hide-1",
        attachmentIds: [attachment.attachmentId],
      });

      const opsTimelineAfterReply = complaints.getComplaintTimeline(
        caseItem.caseNo,
      );
      const replyNoteEntry = opsTimelineAfterReply.find((entry) =>
        entry.note.includes("已附上真實附件"),
      );
      expect(replyNoteEntry).toBeDefined();
      expect(replyNoteEntry!.note).not.toContain(MARKER);
      expect(replyNoteEntry!.note).not.toContain(attachment.attachmentId);
    });
  });

  describe("canonical readback across two already-warm API instances", () => {
    it("lets a service instance that never created the case read it back from the durable repository, with correct attribution and timeline", async () => {
      const caseNo = "C-20261024-900001";
      const orderId = "ord-cross-instance";
      const createdAt = "2026-10-24T08:00:00.000Z";

      const persistedCase: ComplaintCaseRecord = {
        caseNo,
        caseSource: "ops",
        relatedOrderId: orderId,
        relatedCallId: null,
        relatedIncidentId: null,
        category: "driver_service",
        severity: "normal",
        description: "已於另一個 API instance 建立並持久化的案件",
        assigneeId: null,
        status: "new",
        slaDueAt: "2026-10-26T08:00:00.000Z",
        slaBreach: false,
        reopenCount: 0,
        resolutionCode: null,
        closingNote: null,
        createdAt,
        updatedAt: createdAt,
      };
      const persistedTimeline: ComplaintTimelineEntry[] = [
        {
          entryId: "complaint-timeline-cross-instance-created",
          caseNo,
          action: "case_created",
          note: "Created driver_service complaint from ops.",
          createdAt,
        },
        {
          entryId: "complaint-timeline-cross-instance-note",
          caseNo,
          action: "case_note_added",
          note: "Ops 已初步確認案件歸屬。",
          createdAt: "2026-10-24T08:05:00.000Z",
        },
      ];

      const repository = {
        isEnabled: () => true,
        loadState: async () => ({
          complaintCases: [],
          complaintTimelines: [],
        }),
        // No settlement_dispute cases in this scenario; refreshSettlementCases
        // (always called first by both getCaseDetail and getCaseTimeline) must
        // still resolve cleanly.
        loadSettlementState: async () => ({
          complaintCases: [],
          complaintTimelines: [],
        }),
        loadCaseState: async (requestedCaseNo: string) => ({
          complaintCases: persistedCase.caseNo === requestedCaseNo
            ? [persistedCase]
            : [],
          complaintTimelines:
            persistedCase.caseNo === requestedCaseNo ? persistedTimeline : [],
        }),
        persistChanges: async () => {},
        reportPersistenceFailure: () => {},
      } as unknown as ComplaintRepository;

      // A fresh ComplaintService that never ran this case's create, standing
      // in for an already-warm second API instance.
      const warmInstanceB = new ComplaintService(
        new AuditNotificationService(),
        repository,
      );

      const { service: fleetPartnerService, fleetIdByDisplayName } =
        await buildFleetPartnerService({
          tasksByOrder: { [orderId]: { driverId: "drv-cross" } },
          drivers: [{ driverId: "drv-cross", name: "司機丙" }],
          affiliations: [
            {
              driverId: "drv-cross",
              fleetDisplayName: "Fleet Cross",
              effectiveFrom: "2026-01-01T00:00:00.000Z",
            },
          ],
        });
      const fleetCrossId = fleetIdByDisplayName.get("Fleet Cross")!;

      const { storage } = fleetStorageFixture();
      const casesOnInstanceB = new FleetPartnerCaseService(
        warmInstanceB,
        fleetPartnerService,
        undefined,
        storage,
      );

      const detail = await casesOnInstanceB.getCaseDetail(
        fleetCrossId,
        caseNo,
      );
      expect(detail.caseDetail).toEqual(
        expect.objectContaining({
          caseNo,
          status: "new",
          driverId: "drv-cross",
          fleetPartnerId: fleetCrossId,
        }),
      );

      const timeline = await casesOnInstanceB.getCaseTimeline(
        fleetCrossId,
        caseNo,
      );
      expect(timeline).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ body: "Ops 已初步確認案件歸屬。" }),
        ]),
      );
    });

    it("lists an ordinary case a different already-warm instance genuinely created, before this instance ever fetches its detail", async () => {
      const orderId = "ord-list-first";
      const { service: fleetPartnerService, fleetIdByDisplayName } =
        await buildFleetPartnerService({
          tasksByOrder: {
            [orderId]: { driverId: "drv-list-first" },
          },
          drivers: [{ driverId: "drv-list-first", name: "司機庚" }],
          affiliations: [
            {
              driverId: "drv-list-first",
              fleetDisplayName: "Fleet List First",
              effectiveFrom: "2026-01-01T00:00:00.000Z",
            },
          ],
        });
      const fleetId = fleetIdByDisplayName.get("Fleet List First")!;

      const repository = sharedComplaintRepository();
      const { storage } = fleetStorageFixture();

      // Instance A genuinely creates the case and its write durably commits.
      const complaintsA = new ComplaintService(
        new AuditNotificationService(),
        repository,
      );
      const created = complaintsA.createComplaintCase({
        caseSource: "ops",
        relatedOrderId: orderId,
        category: "driver_service",
        severity: "normal",
        description: "Instance A 建立的案件",
      }) as ComplaintCaseRecord;
      await complaintsA.awaitSettlementPersistence(created.caseNo);

      // Instance B never ran that create; its own in-memory cache has
      // nothing for this case at all.
      const complaintsB = new ComplaintService(
        new AuditNotificationService(),
        repository,
      );
      const casesOnInstanceB = new FleetPartnerCaseService(
        complaintsB,
        fleetPartnerService,
        undefined,
        storage,
      );

      // The list call itself -- not a detail/timeline fetch first -- is
      // what must already see it.
      const listOnB = await casesOnInstanceB.listCases(fleetId);
      expect(listOnB).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            caseNo: created.caseNo,
            fleetPartnerId: fleetId,
            driverId: "drv-list-first",
          }),
        ]),
      );
    });

    it("lets a fresh instance read back a reply's structured attachment relation, not just its note text, after a different warm instance genuinely created the case and submitted that reply", async () => {
      const orderId = "ord-cross-instance-attachment";
      const { service: fleetPartnerService, fleetIdByDisplayName } =
        await buildFleetPartnerService({
          tasksByOrder: {
            [orderId]: { driverId: "drv-cross-attachment" },
          },
          drivers: [{ driverId: "drv-cross-attachment", name: "司機辛" }],
          affiliations: [
            {
              driverId: "drv-cross-attachment",
              fleetDisplayName: "Fleet Cross Attachment",
              effectiveFrom: "2026-01-01T00:00:00.000Z",
            },
          ],
        });
      const fleetId = fleetIdByDisplayName.get("Fleet Cross Attachment")!;

      const repository = sharedComplaintRepository();
      // The SAME backing document-artifact store is shared across both
      // instances' FleetDocumentStorageService wrappers, exactly as two
      // warm API replicas would share one durable object store.
      const { store } = fleetStorageFixture();

      const complaintsA = new ComplaintService(
        new AuditNotificationService(),
        repository,
      );
      const casesOnInstanceA = new FleetPartnerCaseService(
        complaintsA,
        fleetPartnerService,
        undefined,
        fleetStorageFixture("clean", store).storage,
      );
      const created = complaintsA.createComplaintCase({
        caseSource: "ops",
        relatedOrderId: orderId,
        category: "driver_service",
        severity: "normal",
        description: "Instance A 建立並即將回覆附件的案件",
      }) as ComplaintCaseRecord;
      await complaintsA.awaitSettlementPersistence(created.caseNo);

      const attachmentBytes = Buffer.from("evidence bytes");
      const intent = await casesOnInstanceA.createAttachmentUploadUrl(
        fleetId,
        created.caseNo,
        "fleet-manager-a",
        {
          fileName: "evidence.pdf",
          fileSize: attachmentBytes.length,
          contentType: "application/pdf",
        },
      );
      const uploaded = await casesOnInstanceA.uploadAttachmentContent(
        fleetId,
        created.caseNo,
        intent.objectKey,
        byteStream(attachmentBytes),
        "application/octet-stream",
      );
      const attachment = await casesOnInstanceA.confirmAttachmentUpload(
        fleetId,
        created.caseNo,
        "fleet-manager-a",
        {
          attachmentId: intent.attachmentId,
          objectKey: intent.objectKey,
          fileName: "evidence.pdf",
          fileSize: attachmentBytes.length,
          contentType: "application/pdf",
          checksumSha256: uploaded.checksumSha256,
        },
      );

      await casesOnInstanceA.submitReply(
        fleetId,
        created.caseNo,
        "fleet-manager-a",
        {
          content: "已附上行車記錄器截圖",
          idempotencyKey: "cross-instance-attachment-reply-1",
          attachmentIds: [attachment.attachmentId],
        },
      );

      // Instance B never ran any of the above locally.
      const complaintsB = new ComplaintService(
        new AuditNotificationService(),
        repository,
      );
      const casesOnInstanceB = new FleetPartnerCaseService(
        complaintsB,
        fleetPartnerService,
        undefined,
        fleetStorageFixture("clean", store).storage,
      );

      const timelineOnB = await casesOnInstanceB.getCaseTimeline(
        fleetId,
        created.caseNo,
      );
      const replyEntry = timelineOnB.find((entry) => entry.t === "車行回覆");
      expect(replyEntry).toBeDefined();
      expect(replyEntry!.body).toContain("已附上行車記錄器截圖");
      // The old behavior only let the note's human-readable filename text
      // survive; the fix must carry the actual structured attachment
      // relation (attachmentId/name) across to this fresh instance too.
      expect(replyEntry!.attachments).toEqual([
        expect.objectContaining({
          attachmentId: attachment.attachmentId,
          name: "evidence.pdf",
        }),
      ]);

      // The same canonical note, read back through the public Ops timeline
      // (e.g. the Ops case detail page) on this same fresh instance, must
      // stay human-readable: the structured attachment manifest marker/
      // JSON that Fleet-side readback above just relied on must never leak
      // into what Ops sees as the note body.
      const opsTimelineOnB =
        await complaintsB.getComplaintTimelineForOps(created.caseNo);
      const opsReplyEntry = opsTimelineOnB.find(
        (entry) => entry.entryId === replyEntry!.entryId,
      );
      expect(opsReplyEntry).toBeDefined();
      expect(opsReplyEntry!.note).toContain("已附上行車記錄器截圖");
      expect(opsReplyEntry!.note).not.toContain("<<fleet-reply-attachments>>");
      expect(opsReplyEntry!.note).not.toContain(attachment.attachmentId);
    });

    /** Old defect reproduced here: listComplaintCasesForOps()/
     * getComplaintCaseForOps() already reject IDEMPOTENCY_IN_PROGRESS via
     * ensureComplaintReadbackAvailable() when this instance's pending-commit
     * reconciliation has marked a case's ordinary commit outcome as still
     * unconfirmed, but listComplaintCasesForFleetOps() (and therefore the
     * whole Fleet ordinary-case list) never called that same guard, so it
     * could resolve with an optimistic (and here, silently incomplete)
     * success while Ops honestly refuses to serve the same case. */
    it("rejects the Fleet ordinary-case list with the same pending-commit guard the Ops list/detail already use, instead of an optimistic success, when another already-warm instance's create COMMIT outcome is unknown", async () => {
      function deferred() {
        let resolve!: () => void;
        let reject!: (error: Error) => void;
        const promise = new Promise<void>((done, fail) => {
          resolve = done;
          reject = fail;
        });
        return { promise, resolve, reject };
      }

      // --- Instance A: the original create, whose COMMIT outcome is left
      // unknown (e.g. a dropped connection after issuing COMMIT). ---
      const writeGates: ReturnType<typeof deferred>[] = [];
      let recordedPendingRow: ComplaintPendingCommitRecord | undefined;
      const repositoryA = {
        isEnabled: () => true,
        persistChanges: vi.fn(async () => {
          const gate = writeGates.shift();
          if (gate) await gate.promise;
        }),
        reportPersistenceFailure: vi.fn(),
        loadSettlementState: vi.fn(async () => ({
          complaintCases: [],
          complaintTimelines: [],
        })),
        recordPendingCommit: vi.fn(
          async (record: ComplaintPendingCommitRecord) => {
            recordedPendingRow = record;
          },
        ),
        loadPendingCommits: vi.fn(async () => []),
        clearPendingCommit: vi.fn(async () => {}),
        markPendingCommitFailed: vi.fn(async () => {}),
      } as unknown as ComplaintRepository;

      const complaintsA = new ComplaintService(
        new AuditNotificationService(),
        repositoryA,
      );
      const gate = deferred();
      writeGates.push(gate);
      const created = complaintsA.createComplaintCase({
        caseSource: "ops",
        category: "driver_service",
        severity: "normal",
        description: "Uncertain-commit create, cross-instance list guard regression",
      }) as ComplaintCaseRecord;
      const outcomeA = complaintsA
        .awaitSettlementPersistence(created.caseNo)
        .catch((error: unknown) => error);
      await vi.waitFor(() =>
        expect(repositoryA.persistChanges).toHaveBeenCalledTimes(1),
      );
      const failure = new ComplaintCommitOutcomeUnknownError(
        new Error("create COMMIT outcome unknown"),
      );
      gate.reject(failure);
      expect(await outcomeA).toBe(failure);
      expect(recordedPendingRow).toBeDefined();

      // --- Instance B: a different already-warm replica that never ran A's
      // create locally. Its only knowledge of the durably-prepared identity
      // comes from loadPendingCommits; its own per-case canonical read for
      // that caseNo then genuinely faults (a real read error, not a
      // not-found), which is what actually marks the readback unavailable. ---
      const repositoryB = {
        isEnabled: () => true,
        loadSettlementState: vi.fn(async () => ({
          complaintCases: [],
          complaintTimelines: [],
        })),
        loadState: vi.fn(async () => ({
          complaintCases: [],
          complaintTimelines: [],
        })),
        loadPendingCommits: vi.fn(async () => [recordedPendingRow!]),
        loadCaseState: vi.fn(async (caseNo: string) => {
          if (caseNo === created.caseNo) {
            throw new Error("transient canonical read fault");
          }
          return { complaintCases: [], complaintTimelines: [] };
        }),
        recordPendingCommit: vi.fn(async () => {}),
        clearPendingCommit: vi.fn(async () => {}),
        markPendingCommitFailed: vi.fn(async () => {}),
        reportPersistenceFailure: vi.fn(),
      } as unknown as ComplaintRepository;

      const complaintsB = new ComplaintService(
        new AuditNotificationService(),
        repositoryB,
      );
      await complaintsB.onModuleInit();

      // Every real controller endpoint calls refreshSettlementCases() first;
      // this is where B's pending-commit guard actually gets armed.
      await complaintsB.refreshSettlementCases();

      // Control: the Ops list already honestly rejects.
      await expect(complaintsB.listComplaintCasesForOps()).rejects.toMatchObject(
        { code: "IDEMPOTENCY_IN_PROGRESS" },
      );

      // The fix: the Fleet ordinary-case readback seam applies the exact
      // same guard, not an optimistic success.
      await expect(
        complaintsB.listComplaintCasesForFleetOps(),
      ).rejects.toMatchObject({ code: "IDEMPOTENCY_IN_PROGRESS" });

      // And through the real Fleet stack a Fleet Ops list request actually
      // calls, the failure must propagate rather than silently resolve as a
      // seed-only (or otherwise incomplete) list.
      const { storage } = fleetStorageFixture();
      const casesOnInstanceB = new FleetPartnerCaseService(
        complaintsB,
        undefined,
        undefined,
        storage,
      );
      await expect(
        casesOnInstanceB.listCases("any-fleet-id"),
      ).rejects.toMatchObject({ code: "IDEMPOTENCY_IN_PROGRESS" });
    });
  });

  describe("settlement_dispute cases are untouched by the ordinary-case attribution fix", () => {
    it("still derives fleet/responsibility directly from the settlement dispute record, not from order/driver attribution", async () => {
      const dispute = buildSettlementDisputeCase({
        fleetPartnerId: "fleet-settlement-unaffected",
        statementId: "statement-unaffected-1",
        reason: "Two trips missing",
        actorId: "partner-user-1",
        at: "2026-10-24T12:00:00.000Z",
      });
      const complaints = {
        refreshSettlementCases: async () => {},
        listComplaintCases: () => dispute.complaintCases,
        getComplaintCase: (id: string) =>
          dispute.complaintCases.find((item) => item.caseNo === id),
        getComplaintTimeline: () => dispute.complaintTimelines,
      } as unknown as ComplaintService;
      // No FleetPartnerService at all: settlement_dispute attribution must
      // not depend on it, unlike the ordinary-case path fixed above.
      const cases = new FleetPartnerCaseService(complaints);

      const rows = await cases.listCases("fleet-settlement-unaffected");
      expect(rows).toEqual([
        expect.objectContaining({
          caseNo: dispute.complaintCases[0]!.caseNo,
          fleetPartnerId: "fleet-settlement-unaffected",
          cat: "settlement_dispute",
          responsibility: "shared",
        }),
      ]);
    });
  });
});
