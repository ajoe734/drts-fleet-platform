import { describe, expect, it } from "vitest";
import type { OpsQueueEntryRecord } from "../../lib/queue-operations";
import {
  filterQueueEntries,
  getQueueNavigationHref,
  getSafeQueueNavigationActions,
  hasUnresolvedMultiTaxiQueueConflict,
  isServerStatutoryQueueDenial,
  parseQueueFilters,
  readQueueEntry,
  readQueueEntries,
} from "../../lib/queue-operations";
import { t } from "../../lib/translations";

function queueEntry(
  overrides: Partial<OpsQueueEntryRecord> = {},
): OpsQueueEntryRecord {
  return {
    queueEntryId: "QE-MTX-VIRTUAL-001",
    vehicleId: "VEH-MTX-001",
    siteId: "VIRTUAL-TPE",
    runtimeProfileCode: "multi_taxi_direct",
    queueMode: "virtual_matching",
    operatingAuthorizationId: "MTX-TPE-2026-001",
    status: "checked_in",
    position: 1,
    checkedInAt: "2026-07-24T08:00:00.000Z",
    checkedOutAt: null,
    driverId: "DRV-MTX-001",
    driverName: "Queue Driver",
    vehiclePlateNo: "BKR-2208",
    serviceAreaCode: "TPE",
    lastUpdatedAt: "2026-07-24T08:05:00.000Z",
    eligibility: {
      decision: "eligible",
      evaluatedAt: "2026-07-24T08:05:00.000Z",
    },
    availableActions: [],
    ...overrides,
  };
}

describe("MTX-QUEUE-003 queue operations view model", () => {
  it("accepts only server queue records and never fabricates a local entry", () => {
    const valid = queueEntry();
    const entries = readQueueEntries({
      items: [valid, { vehicleId: "missing-entry-id" }, null, "not-a-record"],
    });

    expect(entries).toEqual([valid]);
    expect(readQueueEntries({ items: undefined })).toEqual([]);
    expect(readQueueEntries(null)).toEqual([]);
    expect(readQueueEntry(valid)).toEqual(valid);
    expect(readQueueEntry({ vehicleId: valid.vehicleId })).toBeNull();
  });

  it("filters queue entries without changing server eligibility decisions", () => {
    const ordinary = queueEntry({
      queueEntryId: "QE-ORDINARY-001",
      runtimeProfileCode: "ordinary_taxi",
      queueMode: "physical_rank",
      serviceAreaCode: "NWT",
      siteId: "STN-BANQIAO",
      driverId: "DRV-ORD-001",
      eligibility: { decision: "eligible" },
    });
    const denied = queueEntry({
      queueEntryId: "QE-MTX-DENIED-001",
      queueMode: "taxi_stand",
      siteId: "STD-TPE-001",
      eligibility: {
        decision: "denied",
        reasonCode: "MULTI_TAXI_QUEUE_MODE_FORBIDDEN",
      },
    });
    const filters = parseQueueFilters({
      profile: "multi_taxi_direct",
      eligibility: "denied",
      area: "tpe",
      q: "denied",
    });

    expect(filterQueueEntries([ordinary, denied], filters)).toEqual([denied]);
    expect(denied.eligibility?.decision).toBe("denied");
  });

  it("requires a server denied decision before rendering legal denial", () => {
    const serverDeniedPhysical = queueEntry({
      queueMode: "physical_rank",
      eligibility: {
        decision: "denied",
        reasonCode: "MULTI_TAXI_QUEUE_MODE_FORBIDDEN",
      },
    });
    const missingDecision = queueEntry({
      queueMode: "physical_rank",
      eligibility: { decision: "unknown" },
    });
    const ordinaryPhysical = queueEntry({
      runtimeProfileCode: "ordinary_taxi",
      queueMode: "physical_rank",
      eligibility: { decision: "eligible" },
    });

    expect(isServerStatutoryQueueDenial(serverDeniedPhysical)).toBe(true);
    expect(isServerStatutoryQueueDenial(missingDecision)).toBe(false);
    expect(hasUnresolvedMultiTaxiQueueConflict(missingDecision)).toBe(true);
    expect(isServerStatutoryQueueDenial(ordinaryPhysical)).toBe(false);
    expect(hasUnresolvedMultiTaxiQueueConflict(ordinaryPhysical)).toBe(false);
  });

  it("allows only enabled read-navigation actions supplied by the server", () => {
    const entry = queueEntry({
      availableActions: [
        {
          action: "open_driver",
          enabled: true,
          riskLevel: "low",
        },
        {
          action: "open_vehicle",
          enabled: false,
          riskLevel: "low",
        },
        {
          action: "force_checkin",
          enabled: true,
          riskLevel: "high",
        },
        {
          action: "request_exception_override",
          enabled: true,
          riskLevel: "high",
        },
        {
          action: "unknown_mutation",
          enabled: true,
          riskLevel: "high",
        },
      ],
    });

    expect(
      getSafeQueueNavigationActions(entry).map((action) => action.action),
    ).toEqual(["open_driver"]);
    expect(getQueueNavigationHref("open_driver", entry)).toBe(
      "/drivers/DRV-MTX-001",
    );
    expect(getQueueNavigationHref("open_authorization", entry)).toBeNull();
    expect(
      getQueueNavigationHref("open_authorization", entry, {
        platformAdminBaseUrl: "https://platform-admin.example.test/",
      }),
    ).toBe(
      "https://platform-admin.example.test/multi-taxi-authorizations/MTX-TPE-2026-001",
    );
    expect(getQueueNavigationHref("unknown_mutation", entry)).toBeNull();
  });

  it("provides complete queue operations copy in English and Traditional Chinese", () => {
    expect(t("dispatch.queue.operationsTitle", "en")).toBe("Queue Operations");
    expect(t("dispatch.queue.operationsTitle", "zh")).toBe("佇列營運");
    expect(t("dispatch.queue.eligibility.denied", "en")).toBe("Denied");
    expect(t("dispatch.queue.eligibility.denied", "zh")).toBe("拒絕");
    expect(t("dispatch.queue.denial.physicalRankBody", "zh")).not.toBe(
      "dispatch.queue.denial.physicalRankBody",
    );
    expect(t("dispatch.queue.denial.taxiStandBody", "en")).not.toBe(
      "dispatch.queue.denial.taxiStandBody",
    );
  });
});
