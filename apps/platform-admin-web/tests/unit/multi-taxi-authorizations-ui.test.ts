import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(
  join(
    process.cwd(),
    "app/multi-taxi-authorizations/page.tsx",
  ),
  "utf8",
);

describe("MTX-AUTH-UI-001 Platform Admin Web Authorization UI", () => {
  it("implements all 6 sub-screens / views in multi-taxi-authorizations page", () => {
    // 1. Registry view
    expect(pageSource).toContain('t("multiTaxiAuth.registry.title")');
    expect(pageSource).toContain("CanvasTable");

    // 2. Detail view
    expect(pageSource).toContain('t("multiTaxiAuth.detail.title")');
    expect(pageSource).toContain("CanvasDL");
    expect(pageSource).toContain('t("multiTaxiAuth.detail.readOnly")');

    // 3. Draft Editor view (Create & Edit)
    expect(pageSource).toContain('t("multiTaxiAuth.create.title")');
    expect(pageSource).toContain('t("multiTaxiAuth.edit.title")');
    expect(pageSource).toContain('t("multiTaxiAuth.action.saveDraft")');

    // 4. Lifecycle Confirm dialog
    expect(pageSource).toContain("confirmModal");
    expect(pageSource).toContain('t("multiTaxiAuth.confirm.title")');
    expect(pageSource).toContain('t("multiTaxiAuth.confirm.confirm")');

    // 5. Authorized Vehicles section
    expect(pageSource).toContain('t("multiTaxiAuth.vehicles.title")');
    expect(pageSource).toContain('t("multiTaxiAuth.action.addVehicle")');
    expect(pageSource).toContain("canAddVehicle");

    // 6. Conflict & Permission Error states
    expect(pageSource).toContain("handleApiError");
    expect(pageSource).toContain('t("multiTaxiAuth.error.permissionDeniedTitle")');
    expect(pageSource).toContain('t("multiTaxiAuth.error.conflictTitle")');
    expect(pageSource).toContain('t("multiTaxiAuth.error.validationTitle")');
  });

  it("strictly excludes forbidden commands (revoke, restore, delete, vehicle suspend, legal hold, bulk import)", () => {
    expect(pageSource).not.toContain("revokeAuthorization");
    expect(pageSource).not.toContain("restoreAuthorization");
    expect(pageSource).not.toContain("deleteAuthorization");
    expect(pageSource).not.toContain("suspendVehicle");
    expect(pageSource).not.toContain("legalHold");
    expect(pageSource).not.toContain("bulkImport");
  });

  it("gates add-vehicle form and actions when authorization status is expired or revoked", () => {
    expect(pageSource).toContain("isReadOnly");
    expect(pageSource).toContain("canAddVehicle");
    expect(pageSource).toContain('!isReadOnly &&');
  });
});
