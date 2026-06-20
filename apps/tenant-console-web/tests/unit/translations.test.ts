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
});
