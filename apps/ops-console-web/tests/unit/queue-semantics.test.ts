import { describe, expect, it } from "vitest";
import {
  resolveQueueSemantics,
  isForbiddenStatutoryOverrideAction,
} from "../../lib/queue-semantics";
import { t } from "../../lib/translations";

describe("MTX-QUEUE-003 Queue Semantics & Statutory Refusal UI", () => {
  it("enforces queue mode as explicit text, never color-only (zh & en)", () => {
    const virtualOrder = resolveQueueSemantics(
      {
        runtimeProfileCode: "multi_taxi_direct",
        queueMode: "virtual_matching",
      },
      "zh",
    );
    expect(virtualOrder.queueModeText).toBe("虛擬媒合");
    expect(virtualOrder.serviceTypeText).toBe("多元化計程車（平台預約）");
    expect(virtualOrder.matchingModeText).toBe("平台媒合");

    const physicalRankOrder = resolveQueueSemantics(
      {
        runtimeProfileCode: "ordinary_taxi",
        queueMode: "physical_rank",
      },
      "zh",
    );
    expect(physicalRankOrder.queueModeText).toBe("實體排班");

    const taxiStandOrder = resolveQueueSemantics(
      {
        runtimeProfileCode: "ordinary_taxi",
        queueMode: "taxi_stand",
      },
      "en",
    );
    expect(taxiStandOrder.queueModeText).toBe("Taxi Stand");
  });

  it("handles blank siteId without masquerading physical rank as virtual", () => {
    const blankSitePhysicalOrder = resolveQueueSemantics(
      {
        runtimeProfileCode: "ordinary_taxi",
        queueMode: "physical_rank",
        siteId: null,
      },
      "zh",
    );

    expect(blankSitePhysicalOrder.isSiteBlank).toBe(true);
    expect(blankSitePhysicalOrder.siteDisplay).toBe("未指定站點");
    expect(blankSitePhysicalOrder.queueModeText).toBe("實體排班");
    expect(blankSitePhysicalOrder.queueModeText).not.toBe("虛擬媒合");
  });

  it("provides statutory refusal copy per doc08 §7.3 with no raw reason code primary", () => {
    const multiTaxiPhysicalAttempt = resolveQueueSemantics(
      {
        runtimeProfileCode: "multi_taxi_direct",
        queueMode: "physical_rank",
        siteId: "SITE-001",
        lastDispatchFailureReason: "QUEUE_MODE_NOT_ALLOWED",
      },
      "zh",
    );

    expect(multiTaxiPhysicalAttempt.isStatutoryRefusal).toBe(true);
    expect(multiTaxiPhysicalAttempt.refusalCopy).toBe(
      "此訂單為多元化計程車平台預約，不能進入實體排班或招呼站候客。",
    );
    expect(multiTaxiPhysicalAttempt.refusalCopy).not.toContain("QUEUE_MODE_NOT_ALLOWED");
  });

  it("identifies canonical and legacy override/fare-override actions as forbidden in statutory refusal", () => {
    const forbiddenActions = [
      "request_exception_override",
      "approve_exception_override",
      "reject_exception_override",
      "manual_fare_override",
      "request_fare_override",
      "request_override",
      "approve_override",
      "fare_override",
      "force_checkin",
      "force_checkin_rank",
      "force_check_in",
    ];

    for (const action of forbiddenActions) {
      expect(isForbiddenStatutoryOverrideAction(action)).toBe(true);
    }

    const allowedActions = [
      "contact_passenger",
      "assign_candidate",
      "release_driver",
      "redispatch",
      "cancel_order",
      "resolve_no_supply",
    ];

    for (const action of allowedActions) {
      expect(isForbiddenStatutoryOverrideAction(action)).toBe(false);
    }
  });

  it("ensures i18n keys resolve via t() without missing key fallbacks", () => {
    expect(t("dispatch.queue.overviewTitle", "zh")).toBe("佇列概覽與模式");
    expect(t("dispatch.queue.multiTaxiDirectService", "zh")).toBe(
      "多元化計程車（平台預約）",
    );
    expect(t("dispatch.denial.multiTaxiRefusalCopy", "zh")).toBe(
      "此訂單為多元化計程車平台預約，不能進入實體排班或招呼站候客。",
    );
    expect(t("dispatch.denial.statutoryRefusalTitle", "zh")).toBe(
      "多元化計程車法定拒絕態",
    );
    expect(t("opsCode.statutory_refusal", "zh")).toBe("法定拒絕態");
    expect(t("opsCode.statutory_refusal", "en")).toBe("Statutory Refusal");
  });
});

