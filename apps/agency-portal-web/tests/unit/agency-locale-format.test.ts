import { beforeEach, describe, expect, it, vi } from "vitest";
import { AGENCY_LOCALE_COOKIE } from "@/lib/locale-config";
import {
  display,
  displayBoolean,
  displayDateTime,
  displayExpiryStatus,
  displayLegalHoldState,
  displayMinor,
  displayPaymentStatus,
  displayPercent,
  displayRoleCode,
  displayRouteSource,
  displayStatusCode,
  displayTollSource,
  errorMessage,
  notProvided,
} from "@/lib/format";
import { getAgencyNav } from "@/lib/navigation";
import {
  getServerLocale,
  resolveServerLocaleFromCookieValue,
} from "@/lib/server-locale";
import {
  type TranslationKey,
  isLocale,
  normalizeLocale,
  t,
  translations,
} from "@/lib/translations";

let mockedCookieValue: string | undefined;

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      name === AGENCY_LOCALE_COOKIE && mockedCookieValue !== undefined
        ? { name, value: mockedCookieValue }
        : undefined,
  })),
}));

describe("Agency portal locale catalog and formatters", () => {
  beforeEach(() => {
    mockedCookieValue = undefined;
  });

  it("maintains complete zh/en key parity, non-empty values, and matching interpolation tokens", () => {
    const zhKeys = Object.keys(translations.zh).sort();
    const enKeys = Object.keys(translations.en).sort();
    expect(zhKeys).toEqual(enKeys);
    expect(zhKeys.length).toBeGreaterThan(80);

    for (const key of zhKeys as TranslationKey[]) {
      const zhText = translations.zh[key];
      const enText = translations.en[key];
      expect(zhText.trim().length, `zh empty for ${key}`).toBeGreaterThan(0);
      expect(enText.trim().length, `en empty for ${key}`).toBeGreaterThan(0);
      expect(zhText).not.toBe(key);
      expect(enText).not.toBe(key);

      const zhTokens = [...zhText.matchAll(/\{(\w+)\}/g)]
        .map((m) => m[1])
        .sort();
      const enTokens = [...enText.matchAll(/\{(\w+)\}/g)]
        .map((m) => m[1])
        .sort();
      expect(zhTokens, `token mismatch on ${key}`).toEqual(enTokens);

      // English UI strings (other than intentional language toggle labels) must not leak Chinese characters
      if (key !== "shell.language.zh" && key !== "shell.language.icon") {
        expect(
          /[\u4e00-\u9fff]/u.test(enText),
          `Chinese character leaked in en translation for ${key}: ${enText}`,
        ).toBe(false);
      }
    }

    expect(
      t("common.pager.summary", { total: 42, page: 2, pages: 5 }, "zh"),
    ).toBe("共 42 筆 · 第 2 / 5 頁");
    expect(
      t("common.pager.summary", { total: 42, page: 2, pages: 5 }, "en"),
    ).toBe("Total 42 records · Page 2 of 5");
  });

  it("validates drts-locale-v2 cookie values and falls back to zh on missing or invalid cookies", async () => {
    expect(isLocale("zh")).toBe(true);
    expect(isLocale("en")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale("")).toBe(false);
    expect(isLocale(null)).toBe(false);

    expect(normalizeLocale("en")).toBe("en");
    expect(normalizeLocale("zh")).toBe("zh");
    expect(normalizeLocale("zh-TW")).toBe("zh");
    expect(normalizeLocale("invalid")).toBe("zh");
    expect(resolveServerLocaleFromCookieValue(undefined)).toBe("zh");
    expect(resolveServerLocaleFromCookieValue("bogus")).toBe("zh");
    expect(resolveServerLocaleFromCookieValue("en")).toBe("en");

    mockedCookieValue = undefined;
    expect(await getServerLocale()).toBe("zh");

    mockedCookieValue = "invalid-locale";
    expect(await getServerLocale()).toBe("zh");

    mockedCookieValue = "en";
    expect(await getServerLocale()).toBe("en");

    mockedCookieValue = "zh";
    expect(await getServerLocale()).toBe("zh");
  });

  it("formats timestamps in Asia/Taipei around UTC day and month boundaries in both locales", () => {
    // R12 UTC day boundary: 2026-10-24T17:00:00.000Z is 2026-10-25 01:00:00 in Asia/Taipei (+08:00)
    const r12ClockIso = "2026-10-24T17:00:00.000Z";
    const r12ZhFormatted = displayDateTime(r12ClockIso, "zh");
    const r12EnFormatted = displayDateTime(r12ClockIso, "en");

    expect(r12ZhFormatted).toContain("2026/10/25");
    expect(r12ZhFormatted).toContain("01:00:00");
    expect(r12ZhFormatted).not.toContain("10/24");

    expect(r12EnFormatted).toContain("10/25/2026");
    expect(r12EnFormatted).toContain("01:00:00");
    expect(r12EnFormatted).not.toContain("10/24");

    // 2026-10-31T16:30:00.000Z is 2026-11-01 00:30:00 in Asia/Taipei (+08:00)
    const boundaryIso = "2026-10-31T16:30:00.000Z";
    const zhFormatted = displayDateTime(boundaryIso, "zh");
    const enFormatted = displayDateTime(boundaryIso, "en");

    expect(zhFormatted).toContain("2026");
    expect(zhFormatted).toContain("11");
    expect(zhFormatted).toContain("01");
    expect(zhFormatted).toContain("00:30:00");
    expect(zhFormatted).not.toContain("10/31");

    expect(enFormatted).toContain("2026");
    expect(enFormatted).toContain("11/01/2026");
    expect(enFormatted).toContain("00:30:00");
    expect(enFormatted).not.toContain("10/31");

    expect(displayDateTime(null, "zh")).toBe("未提供");
    expect(displayDateTime(null, "en")).toBe("Not provided");
    expect(displayDateTime("not-a-date", "zh")).toBe("未提供");
    expect(displayDateTime("not-a-date", "en")).toBe("Not provided");
    expect(displayDateTime("invalid-iso", "zh")).toBe("未提供");
    expect(displayDateTime("invalid-iso", "en")).toBe("Not provided");
  });

  it("keeps unknown values as Not provided/未提供 while preserving numeric zero as 0", () => {
    expect(notProvided("zh")).toBe("未提供");
    expect(notProvided("en")).toBe("Not provided");

    expect(display(null, "zh")).toBe("未提供");
    expect(display(undefined, "en")).toBe("Not provided");
    expect(display("   ", "en")).toBe("Not provided");
    expect(display(Number.NaN, "en")).toBe("Not provided");

    // Numeric zero must never become Not provided
    expect(display(0, "zh")).toBe("0");
    expect(display(0, "en")).toBe("0");

    expect(displayMinor(null, "TWD", "zh")).toBe("未提供");
    expect(displayMinor(undefined, "TWD", "en")).toBe("Not provided");
    expect(displayMinor(0, "TWD", "zh")).toBe("0 TWD");
    expect(displayMinor(0, "TWD", "en")).toBe("0 TWD");
    expect(displayMinor(1250, "TWD", "en")).toBe("1,250 TWD");

    expect(displayPercent(null, "zh")).toBe("未提供");
    expect(displayPercent(undefined, "en")).toBe("Not provided");
    expect(displayPercent(0, "zh")).toBe("0.00%");
    expect(displayPercent(0, "en")).toBe("0.00%");
    expect(displayPercent(0.875, "en")).toBe("87.50%");

    expect(displayBoolean(null, "zh")).toBe("未提供");
    expect(displayBoolean(undefined, "en")).toBe("Not provided");
    expect(displayBoolean(true, "zh")).toBe("是");
    expect(displayBoolean(false, "zh")).toBe("否");
    expect(displayBoolean(true, "en")).toBe("Yes");
    expect(displayBoolean(false, "en")).toBe("No");
  });

  it("localizes known status, role, expiry, legalHold, navigation, and error labels without mutating code values", () => {
    const rawQuery = { status: "expired", legalHold: "active" };
    expect(displayExpiryStatus(rawQuery.status, "zh")).toBe("已過期");
    expect(displayExpiryStatus(rawQuery.status, "en")).toBe("Expired");
    expect(displayExpiryStatus("expiring", "en")).toBe("Expiring soon");
    expect(displayExpiryStatus("valid", "en")).toBe("Valid");
    expect(displayExpiryStatus("unavailable", "en")).toBe("Not provided");
    expect(rawQuery.status).toBe("expired");

    expect(displayLegalHoldState(rawQuery.legalHold, "zh")).toBe("保全中");
    expect(displayLegalHoldState(rawQuery.legalHold, "en")).toBe("Active hold");
    expect(displayLegalHoldState("none", "en")).toBe("None");
    expect(displayLegalHoldState("unavailable", "en")).toBe("Not provided");
    expect(rawQuery.legalHold).toBe("active");

    expect(displayRouteSource("driver_gps", "zh")).toBe("司機 GPS 軌跡");
    expect(displayRouteSource("driver_gps", "en")).toBe(
      "Driver GPS trajectory",
    );
    expect(displayRouteSource("mixed", "en")).toBe(
      "Mixed trajectory (partial GPS samples + pickup/dropoff summary)",
    );
    expect(displayRouteSource("pickup_dropoff_summary", "en")).toBe(
      "Pickup/dropoff & distance summary",
    );
    expect(displayRouteSource("provider_route", "en")).toBe(
      "Dispatch estimated route",
    );
    expect(displayRouteSource("unavailable", "en")).toBe("Not provided");
    expect(displayRouteSource(null, "en")).toBe("Not provided");

    expect(displayPaymentStatus("captured", "zh")).toBe("已請款實收");
    expect(displayPaymentStatus("captured", "en")).toBe("Captured (collected)");
    expect(displayPaymentStatus("refunded", "en")).toBe(
      "Refunded (collected 0)",
    );
    expect(displayPaymentStatus("authorized", "en")).toBe(
      "Authorized (pending capture)",
    );
    expect(displayPaymentStatus("unknown", "en")).toBe(
      "Payment status not provided",
    );

    expect(displayTollSource("driver_proof", "zh")).toBe(
      "司機完單證明（通行費憑證）",
    );
    expect(displayTollSource("driver_proof", "en")).toBe(
      "Driver completion proof (toll receipt)",
    );
    expect(displayTollSource("none", "en")).toBe("No toll (0)");
    expect(displayTollSource("unavailable", "en")).toBe(
      "Not recorded (historical)",
    );

    expect(displayRoleCode("agency_viewer", "zh")).toBe("唯讀查詢");
    expect(displayRoleCode("agency_viewer", "en")).toBe("Read-only viewer");
    expect(displayRoleCode("agency_exporter", "en")).toBe(
      "Read-only viewer & controlled exporter",
    );
    expect(displayRoleCode("custom_role_code", "en")).toBe("custom_role_code");

    expect(displayStatusCode("completed", "zh")).toBe("已完成");
    expect(displayStatusCode("completed", "en")).toBe("Completed");
    expect(displayStatusCode("cancelled", "en")).toBe("Cancelled");
    expect(displayStatusCode("active", "en")).toBe("Active");
    expect(displayStatusCode("CUSTOM_BACKEND_CODE", "en")).toBe(
      "CUSTOM_BACKEND_CODE",
    );

    expect(errorMessage(null, 403, "zh")).toContain("無權存取");
    expect(errorMessage(null, 403, "en")).toContain(
      "not authorized to access this data",
    );
    expect(errorMessage(null, 503, "en")).toContain(
      "Access audit logging is temporarily unavailable",
    );
    expect(errorMessage(null, 500, "en")).toBe("Query failed (HTTP 500)");

    const zhNav = getAgencyNav("zh");
    const enNav = getAgencyNav("en");
    expect(zhNav.map((item) => item.href)).toEqual(
      enNav.map((item) => item.href),
    );
    expect(enNav[0]).toMatchObject({ href: "/", label: "Home" });
    expect(enNav[7]).toMatchObject({
      href: "/qualifications/drivers",
      label: "R14 Driver Qualifications",
    });
  });
});
