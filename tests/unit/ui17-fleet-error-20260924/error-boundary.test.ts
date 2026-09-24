import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, it, expect } from "vitest";

describe("UI17-FLEET-ERROR-20260924 error boundary", () => {
  it("uses current locale and translations for strings", () => {
    const sourcePath = resolve(
      __dirname,
      "../../../apps/fleet-partner-portal-web/app/error.tsx",
    );
    const source = readFileSync(sourcePath, "utf8");

    // Check fallback logic
    expect(source).toContain("useTranslation()");
    expect(source).toContain('t("error.scope.badge")');
    expect(source).toContain('t("error.generic.badge")');

    // Check fonts
    expect(source).not.toContain("SHELL_MONO");
    expect(source).toContain("theme.monoFamily");
  });

  it("handles CSRF correctly in logout fetch", () => {
    const sourcePath = resolve(
      __dirname,
      "../../../apps/fleet-partner-portal-web/app/error.tsx",
    );
    const source = readFileSync(sourcePath, "utf8");

    expect(source).toContain("document.cookie");
    expect(source).toContain("drts_csrf=");
    expect(source).toContain('"x-csrf-token"');
  });

  it("handles fetch errors robustly", () => {
    const sourcePath = resolve(
      __dirname,
      "../../../apps/fleet-partner-portal-web/app/error.tsx",
    );
    const source = readFileSync(sourcePath, "utf8");

    expect(source).toContain("setLogoutError(true)");
    expect(source).toContain("catch (e)");
  });
});
