import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type * as Formatters from "../../../apps/tenant-console-web/lib/formatters";
import { createUiModuleLoader } from "../system-remediation/sr-wire-001/ui-module-loader";

const appRoot = resolve(process.env.C121_APP_ROOT ?? "apps/tenant-console-web");
const load = createUiModuleLoader(appRoot);
const { formatDateTime, formatDateInput, formatMoney, formatRelativeTime } =
  load<typeof Formatters>(resolve(appRoot, "lib/formatters.ts"));

describe(`C121 canonical presentation (host TZ=${process.env.TZ})`, () => {
  it.each([
    ["2026-12-31T16:05:00Z", "2027-01-01", "Jan 1, 2027, 12:05 AM", "2027年1月1日 凌晨12:05"],
    ["2026-02-28T16:05:00Z", "2026-03-01", "Mar 1, 2026, 12:05 AM", "2026年3月1日 凌晨12:05"],
    ["2026-03-01T00:05:00+08:00", "2026-03-01", "Mar 1, 2026, 12:05 AM", "2026年3月1日 凌晨12:05"],
  ])("renders the canonical instant %s in the declared Taipei convention", (iso, day, en, zh) => {
    expect(formatDateTime(iso, "en")).toBe(en);
    expect(formatDateTime(iso, "zh")).toBe(zh);
    expect(formatDateInput(iso)).toBe(day);
  });

  it.each(["2026-01-01", "2026-03-01", "2026-12-31", "2026-01", "2026-12"])(
    "retains financial calendar literal/period %s without creating an instant",
    (literal) => expect(formatDateInput(literal)).toBe(literal),
  );

  it("retains empty, relative time and actual-currency minor-unit contracts", () => {
    expect(formatDateTime(null, "zh")).toBe("尚無資料");
    expect(formatDateTime(undefined, "en")).toBe("No data yet");
    expect(formatDateInput(null)).toBe("");
    expect(formatRelativeTime("invalid", "en")).toBeNull();
    for (const locale of ["en", "zh"] as const) {
      for (const currency of ["TWD", "USD", "JPY"]) {
        for (const amountMinor of [0, 123456, -105]) {
          const amount = Object.freeze({ currency, amountMinor });
          expect(formatMoney(amount, locale)).toBe(
            new Intl.NumberFormat(locale === "zh" ? "zh-TW" : "en", {
              style: "currency", currency,
            }).format(amountMinor / 100),
          );
        }
      }
    }
  });
});
