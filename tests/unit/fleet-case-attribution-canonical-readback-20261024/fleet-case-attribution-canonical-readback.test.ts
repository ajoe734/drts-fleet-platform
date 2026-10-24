import { describe, expect, it } from "vitest";

import type {
  ComplaintCaseRecord,
  ComplaintTimelineEntry,
} from "@drts/contracts";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementService } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import { ComplaintRepository } from "../../../apps/api/src/modules/complaint/complaint.repository";
import { ComplaintService } from "../../../apps/api/src/modules/complaint/complaint.service";
import { buildSettlementDisputeCase } from "../../../apps/api/src/modules/complaint/settlement-dispute";
import { FleetPartnerCaseService } from "../../../apps/api/src/modules/fleet-partner/fleet-partner-case.service";
import { FleetPartnerService } from "../../../apps/api/src/modules/fleet-partner/fleet-partner.service";
import type { OwnedMobilityService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import type { RegulatoryRegistryService } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { fleetStorageFixture } from "../helpers/fleet-document-fixture";

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

function fakeOwnedMobilityService(
  tasksByOrder: Record<string, { driverId: string; status?: string }>,
): OwnedMobilityService {
  return {
    getDriverTasksForOrder: (orderId: string) => {
      const task = tasksByOrder[orderId];
      return task
        ? [{ orderId, driverId: task.driverId, status: task.status ?? "completed" }]
        : [];
    },
    getActiveDispatchAssignmentForOrder: () => null,
    getDispatchAssignmentsForOrder: () => [],
  } as unknown as OwnedMobilityService;
}

function fakeRegistryService(
  drivers: ReadonlyArray<{ driverId: string; name: string }>,
): RegulatoryRegistryService {
  return {
    listDrivers: () => drivers,
  } as unknown as RegulatoryRegistryService;
}

async function buildFleetPartnerService(opts: {
  tasksByOrder: Record<string, { driverId: string; status?: string }>;
  drivers: ReadonlyArray<{ driverId: string; name: string }>;
  affiliations: ReadonlyArray<{
    driverId: string;
    fleetDisplayName: string;
    effectiveFrom: string;
  }>;
}) {
  const service = new FleetPartnerService(
    new BillingSettlementService(new AuditNotificationService()),
    fakeOwnedMobilityService(opts.tasksByOrder),
    fakeRegistryService(opts.drivers),
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
    });
  }

  return { service, fleetIdByDisplayName };
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
