import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { MultiTaxiController } from "../../apps/api/src/modules/multi-taxi/multi-taxi.controller";
import { MultiTaxiService } from "../../apps/api/src/modules/multi-taxi/multi-taxi.service";
import { OwnedMobilityService } from "../../apps/api/src/modules/owned-mobility/owned-mobility.service";

const pageSource = readFileSync(
  join(
    process.cwd(),
    "apps/platform-admin-web/app/multi-taxi-authorizations/page.tsx",
  ),
  "utf8",
);

describe("MTX-AUTH-UI-001 Fleet B authorization admin UI contract", () => {
  it("implements all 6 sub-screens / views in multi-taxi-authorizations page", () => {
    // 1. Registry view
    expect(pageSource).toContain('t("multiTaxiAuth.registry.title")');
    expect(pageSource).toContain("CanvasTable");

    // 2. Detail view
    expect(pageSource).toContain('t("multiTaxiAuth.detail.title")');
    expect(pageSource).toContain("CanvasDL");
    expect(pageSource).toContain('t("multiTaxiAuth.detail.readOnly")');

    // 3. Draft Editor view
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

    // 6. Conflict & Permission Error states
    expect(pageSource).toContain("handleApiError");
    expect(pageSource).toContain('t("multiTaxiAuth.error.permissionDeniedTitle")');
    expect(pageSource).toContain('t("multiTaxiAuth.error.conflictTitle")');
    expect(pageSource).toContain('t("multiTaxiAuth.error.validationTitle")');
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

  it("wires listAuthorizedVehicles and lifecycle capabilities on service and controller", () => {
    const ownedMobilityService = {} as OwnedMobilityService;
    const service = new MultiTaxiService(ownedMobilityService);
    const controller = new MultiTaxiController(service);

    const now = new Date().toISOString();
    const created = service.createAuthorization({
      operatorId: "op-test-001",
      authorityCode: "AUTH-TAIPEI-001",
      businessPlanVersion: "v1.0",
      serviceAreaCodes: ["TPE", "NPT"],
      activeFareVersionId: "fare_2026_v1",
      effectiveFrom: now,
    });

    expect(created.status).toBe("draft");

    // Add authorized vehicle
    const vehicle = service.addAuthorizedVehicle(created.authorizationId, {
      vehicleId: "VEH-TPE-888",
      effectiveFrom: now,
    });
    expect(vehicle.vehicleId).toBe("VEH-TPE-888");

    // Query vehicles via service
    const vehiclesList = service.listAuthorizedVehicles(created.authorizationId);
    expect(vehiclesList).toHaveLength(1);
    expect(vehiclesList[0]?.vehicleId).toBe("VEH-TPE-888");

    // Query vehicles via controller envelope
    const controllerEnvelope = controller.listAuthorizedVehicles(
      created.authorizationId,
      "req-001",
    );
    expect(controllerEnvelope.data.items).toHaveLength(1);

    // Lifecycle activate
    const activated = service.activateAuthorization(created.authorizationId);
    expect(activated.status).toBe("approved");

    // Lifecycle suspend
    const suspended = service.suspendAuthorization(created.authorizationId);
    expect(suspended.status).toBe("suspended");

    // Re-activate
    const reActivated = service.activateAuthorization(created.authorizationId);
    expect(reActivated.status).toBe("approved");
  });
});
