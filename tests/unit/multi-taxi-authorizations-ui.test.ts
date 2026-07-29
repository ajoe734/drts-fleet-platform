import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(
  join(
    process.cwd(),
    "apps/platform-admin-web/app/multi-taxi-authorizations/page.tsx",
  ),
  "utf8",
);
const behaviorSource = readFileSync(
  join(
    process.cwd(),
    "apps/platform-admin-web/app/multi-taxi-authorizations/authorization-ui.ts",
  ),
  "utf8",
);

describe("MTX-AUTH-UI-001 Fleet B authorization admin UI contract", () => {
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

  it("wires each production behavior to a tested authorization helper", () => {
    expect(pageSource).toContain("selectAuthorizationRows");
    expect(pageSource).toContain("getEffectiveWindowState");
    expect(pageSource).toContain("validateAuthorizationDraft");
    expect(pageSource).toContain("openLifecycleConfirmation");
    expect(pageSource).toContain("selectAuthorizedVehicles");
    expect(pageSource).toContain("classifyAuthorizationError");
    expect(behaviorSource).toContain("getAuthorizationActionState");
  });

  it("strictly excludes forbidden commands (revoke, restore, delete, vehicle suspend, legal hold, bulk import)", () => {
    // Forbidden mutation actions must not be present in UI page buttons/commands
    expect(pageSource).not.toContain("revokeAuthorization");
    expect(pageSource).not.toContain("restoreAuthorization");
    expect(pageSource).not.toContain("deleteAuthorization");
    expect(pageSource).not.toContain("suspendVehicle");
    expect(pageSource).not.toContain("legalHold");
    expect(pageSource).not.toContain("bulkImport");
  });

  it("gates add-vehicle and lifecycle actions from the server status matrix", () => {
    expect(pageSource).toContain("isReadOnly");
    expect(pageSource).toContain("canAddVehicle");
    expect(pageSource).toContain("getAuthorizationActionState");
    expect(pageSource).toContain(
      't("multiTaxiAuth.action.vehicleRemovePending")',
    );
  });

  it("formats timestamps with explicit timezone and uses localized tokens", () => {
    expect(pageSource).toContain('timeZoneName: "short"');
    expect(pageSource).toContain("t(`multiTaxiAuth.status.${st}`)");
    expect(pageSource).toContain(
      'placeholder={t("multiTaxiAuth.placeholder.operatorId")}',
    );
    expect(pageSource).toContain(
      "color: statusFilter === st ? theme.invert : theme.text",
    );
    expect(pageSource).not.toContain(
      'color: statusFilter === st ? "#fff" : theme.text',
    );
  });

  it("refreshes confirmation values from canonical APIs before lifecycle submission", () => {
    expect(pageSource).toContain("Promise.all");
    expect(pageSource).toContain(
      "client.get<MultiTaxiOperatingAuthorizationRecord>",
    );
    expect(pageSource).toContain('"X-Action-Reason": confirmReason.trim()');
  });
});
