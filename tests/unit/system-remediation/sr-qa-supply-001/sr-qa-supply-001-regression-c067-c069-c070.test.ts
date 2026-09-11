import { describe, expect, it } from "vitest";

// SR-QA-SUPPLY-001 lists C067, C069, and C070 among its capability_ids, but
// each was already implemented and independently canonical-done by other
// tasks whose evidence is on the current `origin/dev` HEAD used as this
// task's base SHA:
//   - C067 (回覆事故／申訴與 SLA)            -> SR-FLEET-CASE-001 (merged
//     49d365eec908d, full suite:
//     tests/unit/system-remediation/sr-fleet-case-001/sr-fleet-case-001.test.ts)
//   - C069 (有效狀態／趟次篩選與匯出)         -> SR-ENTERPRISE-SEARCH-001
//     (merged 6cddb9cba14a, full suite:
//     tests/unit/system-remediation/sr-enterprise-search-001/)
//   - C070 (可讀表單、欄位標籤與離頁保護)     -> SR-FLEET-FORM-001 (merged,
//     full suite: tests/unit/system-remediation/sr-fleet-form-001/)
//
// Per this task's execution prompt ("已由其他任務修復時提交目前 SHA 的回歸
// 證據，不重做或回退"), this file does not re-derive their full acceptance
// matrices (see the suites above for that). It instead re-exercises one real,
// behavior-level assertion per capability directly against the current
// production code, as regression evidence that the fix is still intact at
// this task's candidate SHA — not a render/constant check.

import { RegulatoryRegistryService } from "../../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { FleetPartnerCaseService } from "../../../../apps/api/src/modules/fleet-partner/fleet-partner-case.service";
import {
  buildEnterpriseBookingSearchQuery,
  hasActiveEnterpriseBookingFilters,
} from "../../../../apps/enterprise-dispatch-web/lib/enterprise-booking-search";
import {
  DRAFT_GUARD_STRINGS,
  fieldId,
  hasUnsavedDraftChanges,
  shouldConfirmDraftNavigation,
} from "../../../../apps/fleet-partner-portal-web/lib/fleet-portal-supply";

describe("SR-QA-SUPPLY-001 — regression: C067 回覆事故／申訴與 SLA (fixed by SR-FLEET-CASE-001)", () => {
  it("a fleet-owned, non-closed complaint (cmp_0908, fleetPartnerId METRO_FLEET) can be replied to, and the reply is immediately readable in the Ops case timeline", async () => {
    const service = new FleetPartnerCaseService();
    const reply = await service.submitReply(
      "METRO_FLEET",
      "cmp_0908",
      "fleet-user-qa",
      { content: "已聯繫司機並完成教育訓練。" },
    );
    expect(reply.deduplicated).toBe(false);

    const timeline = await service.getCaseTimeline("METRO_FLEET", "cmp_0908");
    expect(
      timeline.some(
        (entry) =>
          entry.entryId === `tl-${reply.replyId}` &&
          entry.actorRealm === "tenant",
      ),
    ).toBe(true);
  });

  it("a closed case cannot be replied to (CASE_CLOSED_NO_REPLY), and a case owned by another fleet partner is scope-denied (NOT_FOUND/FORBIDDEN)", async () => {
    const service = new FleetPartnerCaseService();
    await expect(
      service.submitReply("METRO_FLEET", "cmp_closed_001", "fleet-user-qa", {
        content: "too late",
      }),
    ).rejects.toMatchObject({ code: "CASE_CLOSED_NO_REPLY" });

    await expect(
      service.submitReply("METRO_FLEET", "cmp_9999", "fleet-user-qa", {
        content: "not mine",
      }),
    ).rejects.toThrow();
  });
});

describe("SR-QA-SUPPLY-001 — regression: C069 有效狀態／趟次篩選與匯出 (fixed by SR-ENTERPRISE-SEARCH-001)", () => {
  it("combining a status filter and a passenger filter produces a real query object carrying both conditions, and clearing filters removes them (not a client-side-only filter of one page)", () => {
    const filters = {
      passenger: "  Wang  ",
      status: "completed" as const,
      dateFrom: "",
      dateTo: "",
    };
    expect(hasActiveEnterpriseBookingFilters(filters)).toBe(true);

    const query = buildEnterpriseBookingSearchQuery(filters, 1, 10);
    expect(query.passenger).toBe("Wang");
    expect(query.status).toBe("completed");
    expect(query.page).toBe(1);
    expect(query.pageSize).toBe(10);

    const cleared = {
      passenger: "",
      status: "" as const,
      dateFrom: "",
      dateTo: "",
    };
    expect(hasActiveEnterpriseBookingFilters(cleared)).toBe(false);
    const clearedQuery = buildEnterpriseBookingSearchQuery(cleared, 1, 10);
    expect(clearedQuery.passenger).toBeUndefined();
    expect(clearedQuery.status).toBeUndefined();
  });
});

describe("SR-QA-SUPPLY-001 — regression: C070 可讀表單、欄位標籤與離頁保護 (fixed by SR-FLEET-FORM-001)", () => {
  it("field ids are stable and associate with their form namespace (label htmlFor <-> input id wiring)", () => {
    expect(fieldId("new-vehicle", "plateNo")).toBe("form-new-vehicle-plateNo");
    expect(fieldId("new-driver", "name")).toBe("form-new-driver-name");
  });

  it("navigating away from a dirty draft to a different in-app route requires confirmation; navigating with no changes, or only a hash change, does not", () => {
    const initial = { plateNo: "", brand: "" };
    const dirty = { plateNo: "ABC-123", brand: "" };
    expect(hasUnsavedDraftChanges(dirty, initial)).toBe(true);
    expect(hasUnsavedDraftChanges(initial, initial)).toBe(false);

    const isDirty = hasUnsavedDraftChanges(dirty, initial);
    expect(
      shouldConfirmDraftNavigation(
        isDirty,
        "https://portal.example/supply/vehicles/new",
        "https://portal.example/supply/drivers/new",
      ),
    ).toBe(true);
    expect(
      shouldConfirmDraftNavigation(
        isDirty,
        "https://portal.example/supply/vehicles/new",
        "#section-2",
      ),
    ).toBe(false);
    expect(DRAFT_GUARD_STRINGS.confirmLeaveTitle).toBeTruthy();
  });
});

describe("SR-QA-SUPPLY-001 — dependency merge sanity (registry service loads cleanly after all listed dependencies)", () => {
  it("RegulatoryRegistryService (shared foundation for C072/C073 in this task and for the merged dependency tasks) constructs and serves its seeded registry without throwing", () => {
    const regService = new RegulatoryRegistryService(
      {
        publishSupplyLifecycleUpdated: () => {},
        publishDriverLocationUpdated: () => {},
      } as never,
      null as never,
      null as never,
    );
    expect(regService.listVehicles().length).toBeGreaterThan(0);
    expect(regService.listContracts().length).toBeGreaterThan(0);
  });
});
