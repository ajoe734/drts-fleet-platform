import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(
  join(process.cwd(), "app/multi-taxi-authorizations/page.tsx"),
  "utf8",
);
const behaviorSource = readFileSync(
  join(process.cwd(), "app/multi-taxi-authorizations/authorization-ui.ts"),
  "utf8",
);

describe("MTX-AUTH-UI-001 Platform Admin Web Authorization UI", () => {
  it("maps all six screen IDs to production surfaces", () => {
    for (const id of [
      "MTX-AUTH-UI-01",
      "MTX-AUTH-UI-02",
      "MTX-AUTH-UI-03",
      "MTX-AUTH-UI-04",
      "MTX-AUTH-UI-05",
      "MTX-AUTH-UI-06",
    ]) {
      expect(pageSource).toContain(`data-screen-id="${id}"`);
    }
  });

  it("implements registry, detail, draft, lifecycle, vehicles, and typed state behavior", () => {
    expect(pageSource).toContain("selectAuthorizationRows");
    expect(pageSource).toContain("getEffectiveWindowState");
    expect(pageSource).toContain("validateAuthorizationDraft");
    expect(pageSource).toContain("openLifecycleConfirmation");
    expect(pageSource).toContain("selectAuthorizedVehicles");
    expect(pageSource).toContain("classifyAuthorizationError");
    expect(behaviorSource).toContain('"session"');
    expect(behaviorSource).toContain('"permission"');
    expect(behaviorSource).toContain('"stale"');
    expect(behaviorSource).toContain('"unavailable"');
  });

  it("refreshes lifecycle preview from canonical server APIs", () => {
    expect(pageSource).toContain("Promise.all");
    expect(pageSource).toContain(
      "client.get<MultiTaxiOperatingAuthorizationRecord>",
    );
    expect(pageSource).toContain("confirmModal.vehicleCount");
    expect(pageSource).toContain('"X-Action-Reason": confirmReason.trim()');
  });

  it("strictly excludes forbidden commands (revoke, restore, delete, vehicle suspend, legal hold, bulk import)", () => {
    expect(pageSource).not.toContain("revokeAuthorization");
    expect(pageSource).not.toContain("restoreAuthorization");
    expect(pageSource).not.toContain("deleteAuthorization");
    expect(pageSource).not.toContain("suspendVehicle");
    expect(pageSource).not.toContain("legalHold");
    expect(pageSource).not.toContain("bulkImport");
  });

  it("keeps unsupported commands visibly disabled and out of request paths", () => {
    expect(pageSource).toContain('t("multiTaxiAuth.action.revokePending")');
    expect(pageSource).toContain(
      't("multiTaxiAuth.action.vehicleRemovePending")',
    );
    expect(pageSource).not.toMatch(
      /client\.(post|put|delete)\([^)]*\/(revoke|restore|delete|remove)/s,
    );
  });
});
