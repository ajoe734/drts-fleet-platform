import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const i18nSource = readFileSync("apps/platform-admin-web/lib/i18n.tsx", "utf8");
const usersPageSource = readFileSync(
  "apps/platform-admin-web/app/users/page.tsx",
  "utf8",
);

describe("platform admin i18n callback stability", () => {
  it("keeps the translation API stable across same-locale renders", () => {
    expect(i18nSource).toContain("useCallback");
    expect(i18nSource).toContain("useMemo");
    expect(i18nSource).toMatch(/const\s+setLocale\s*=\s*useCallback\(/);
    expect(i18nSource).toMatch(/const\s+t\s*=\s*useCallback\(/);
    expect(i18nSource).toMatch(/return\s+useMemo\(/);
    expect(i18nSource).not.toMatch(/function\s+t\s*\(/);
  });

  it("loads platform admin users through one stable effect boundary", () => {
    expect(usersPageSource).toMatch(
      /const\s+loadUsers\s*=\s*useCallback\([\s\S]*?\},\s*\[client,\s*t\]\);/,
    );
    expect(usersPageSource).toMatch(
      /useEffect\(\(\)\s*=>\s*\{\s*void\s+loadUsers\(\);\s*\},\s*\[loadUsers\]\);/,
    );
  });
});
