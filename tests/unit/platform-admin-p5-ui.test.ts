import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const layoutSource = readFileSync(
  join(process.cwd(), "apps/platform-admin-web/app/layout.tsx"),
  "utf8",
);
const p5ConsoleSource = readFileSync(
  join(
    process.cwd(),
    "apps/platform-admin-web/app/platform-admin/p5/p5-admin-console.tsx",
  ),
  "utf8",
);

describe("platform admin P5 UI contract", () => {
  it("hydrates platform admin authority from the server layout", () => {
    expect(layoutSource).toContain("getServerPlatformAdminAuthority");
    expect(layoutSource).toContain(
      "<PlatformAdminAuthorityProvider authority={authority}>",
    );
  });

  it("keeps disclosure registration rendering masked-only", () => {
    expect(p5ConsoleSource).toContain("getMaskedRegistrationDisplay");
    expect(p5ConsoleSource).toContain('k: t("p5.field.registrationMasked")');
    expect(p5ConsoleSource).not.toMatch(
      /registrationNo(?:(?!maskedDisplay|getMaskedRegistrationDisplay)[\s\S])*k:\s*t\("p5\.field\.registrationMasked"\)/,
    );
    expect(p5ConsoleSource).toContain("registrationNo: null");
    expect(p5ConsoleSource).toContain('body={t("p5.disclosure.maskedNote")}');
  });

  it("keeps the correction queue actions and fare lifecycle states wired", () => {
    expect(p5ConsoleSource).toContain(
      'type P5View = "disclosure" | "queue" | "fares"',
    );
    expect(p5ConsoleSource).toContain('view === "disclosure"');
    expect(p5ConsoleSource).toContain('view === "queue"');
    expect(p5ConsoleSource).toContain('title={t("p5.fares.title")}');
    expect(p5ConsoleSource).toContain('t("p5.action.view")');
    expect(p5ConsoleSource).toContain('t("p5.action.return")');
    expect(p5ConsoleSource).toContain('t("p5.action.approve")');
    expect(p5ConsoleSource).toContain('status: "draft"');
    expect(p5ConsoleSource).toContain('status: "filed"');
    expect(p5ConsoleSource).toContain('status: "active"');
    expect(p5ConsoleSource).toContain('status: "retired"');
  });

  it("keeps rating moderation deferred and avoids aggregate editing controls", () => {
    expect(p5ConsoleSource).not.toContain("rating moderation");
    expect(p5ConsoleSource).not.toContain("aggregateVersion");
    expect(p5ConsoleSource).not.toContain("edit aggregate");
    expect(p5ConsoleSource).not.toContain("driver_rating_summaries");
  });
});
