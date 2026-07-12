import { describe, expect, it } from "vitest";
import { createTenantNavEntries } from "../../lib/navigation";
import { t, translations } from "../../lib/translations";

describe("tenant console i18n dictionary", () => {
  it("keeps English and zh-TW translation keys in lockstep", () => {
    expect(Object.keys(translations.zh).sort()).toEqual(
      Object.keys(translations.en).sort(),
    );
  });

  it("localizes shell navigation from the shared dictionary", () => {
    const enEntries = createTenantNavEntries((key) => t(key, "en"));
    const zhEntries = createTenantNavEntries((key) => t(key, "zh"));

    expect(
      enEntries.find((entry) => "key" in entry && entry.key === "home"),
    ).toMatchObject({ label: "Home" });
    expect(
      zhEntries.find((entry) => "key" in entry && entry.key === "home"),
    ).toMatchObject({ label: "首頁" });
  });
  it("localizes webhook status, filters, and booking detail labels", () => {
    expect(t("webhooks.status.active", "en")).toBe("Active");
    expect(t("webhooks.status.testPending", "en")).toBe("Test pending");
    expect(t("webhooks.status.failureCluster", "en")).toBe("Failure cluster");
    expect(t("webhooks.status.delivered", "en")).toBe("Delivered");
    expect(t("webhooks.status.queued", "en")).toBe("Queued");
    expect(t("webhooks.status.failed", "en")).toBe("Failed");
    expect(t("webhooks.status.active", "zh")).toBe("啟用中");
    expect(t("webhooks.status.testPending", "zh")).toBe("待測試");
    expect(t("webhooks.status.failureCluster", "zh")).toBe("失敗群集");
    expect(t("webhooks.status.delivered", "zh")).toBe("已投遞");
    expect(t("webhooks.status.queued", "zh")).toBe("排隊中");
    expect(t("webhooks.status.failed", "zh")).toBe("失敗");
    expect(t("webhooks.filter.status.all", "en")).toBe("All");
    expect(t("webhooks.filter.status.active", "zh")).toBe("啟用中");
    expect(t("webhooks.filter.status.testPending", "zh")).toBe("待測試");
    expect(t("webhooks.filter.status.disabled", "zh")).toBe("已停用");
    expect(t("bookingDetail.label.editableUntil", "en")).toBe("Editable until");
    expect(t("bookingDetail.label.readOnlyReason", "zh")).toBe("唯讀原因");
    expect(t("bookingDetail.status.description", "en")).not.toMatch(
      new RegExp("editableUntil|readOnlyReasonCode"),
    );
    expect(t("bookingDetail.status.description", "zh")).not.toMatch(
      new RegExp("editableUntil|readOnlyReasonCode|booking action descriptors"),
    );
    expect(t("bookingDetail.loading.statusDescription", "zh")).not.toMatch(
      new RegExp("availableActions|editableUntil"),
    );
    expect(t("bookingCommand.panel.description", "zh")).not.toContain(
      "booking action descriptors",
    );
  });
});
