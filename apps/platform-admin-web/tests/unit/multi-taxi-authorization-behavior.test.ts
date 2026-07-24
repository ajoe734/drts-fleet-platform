import { describe, expect, it } from "vitest";
import type {
  MultiTaxiAuthorizedVehicleRecord,
  MultiTaxiOperatingAuthorizationRecord,
} from "@drts/contracts";
import {
  classifyAuthorizationError,
  getAuthorizationActionState,
  getEffectiveWindowState,
  selectAuthorizationRows,
  selectAuthorizedVehicles,
  validateAuthorizationDraft,
  validateAuthorizedVehicle,
} from "../../app/multi-taxi-authorizations/authorization-ui";

const now = new Date("2026-07-24T00:00:00.000Z");

function authorization(
  input: Partial<MultiTaxiOperatingAuthorizationRecord> = {},
): MultiTaxiOperatingAuthorizationRecord {
  return {
    authorizationId: "auth-1",
    operatorId: "operator-1",
    authorityCode: "MTX-TPE-001",
    businessPlanVersion: "BP-2026.07",
    status: "approved",
    serviceAreaCodes: ["TPE"],
    activeFareVersionId: "FARE-2026.07",
    effectiveFrom: "2026-07-01T00:00:00.000Z",
    effectiveUntil: null,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-07-20T00:00:00.000Z",
    ...input,
  };
}

function vehicle(
  input: Partial<MultiTaxiAuthorizedVehicleRecord> = {},
): MultiTaxiAuthorizedVehicleRecord {
  return {
    authorizationVehicleId: "membership-1",
    authorizationId: "auth-1",
    vehicleId: "VEH-001",
    status: "active",
    effectiveFrom: "2026-07-01T00:00:00.000Z",
    effectiveUntil: null,
    ...input,
  };
}

describe("MTX-AUTH-UI-001 authorization behavior", () => {
  it("searches all canonical registry identifiers and applies canonical ordering", () => {
    const rows = [
      authorization({
        authorizationId: "draft-1",
        authorityCode: "MTX-NWT-002",
        status: "draft",
      }),
      authorization({
        authorizationId: "approved-1",
        authorityCode: "MTX-TPE-001",
        status: "approved",
      }),
      authorization({
        authorizationId: "suspended-1",
        authorityCode: "MTX-TYC-003",
        status: "suspended",
        serviceAreaCodes: ["TYC"],
      }),
    ];

    expect(
      selectAuthorizationRows(
        rows,
        { search: "", status: "all", sort: "canonical" },
        now,
      ).map((row) => row.status),
    ).toEqual(["approved", "draft", "suspended"]);
    expect(
      selectAuthorizationRows(
        rows,
        { search: "tyc", status: "all", sort: "canonical" },
        now,
      ).map((row) => row.authorizationId),
    ).toEqual(["suspended-1"]);

    const openWindows = [
      authorization({
        authorizationId: "older",
        updatedAt: "2026-07-10T00:00:00.000Z",
      }),
      authorization({
        authorizationId: "newer",
        updatedAt: "2026-07-20T00:00:00.000Z",
      }),
    ];
    expect(
      selectAuthorizationRows(
        openWindows,
        { search: "", status: "all", sort: "canonical" },
        now,
      ).map((row) => row.authorizationId),
    ).toEqual(["newer", "older"]);
  });

  it("warns only for a future effective-window boundary within 30 days", () => {
    expect(
      getEffectiveWindowState(
        authorization({ effectiveUntil: "2026-08-10T00:00:00.000Z" }),
        now,
      ),
    ).toBe("expiring");
    expect(
      getEffectiveWindowState(
        authorization({ effectiveUntil: "2026-09-10T00:00:00.000Z" }),
        now,
      ),
    ).toBe("active");
    expect(getEffectiveWindowState(authorization(), now)).toBe("open");
  });

  it("uses the server status as the only lifecycle action authority", () => {
    expect(getAuthorizationActionState("draft")).toEqual({
      editDraft: true,
      activate: true,
      suspend: false,
      addVehicle: true,
    });
    expect(getAuthorizationActionState("approved")).toEqual({
      editDraft: false,
      activate: false,
      suspend: true,
      addVehicle: true,
    });
    expect(getAuthorizationActionState("revoked")).toEqual({
      editDraft: false,
      activate: false,
      suspend: false,
      addVehicle: false,
    });
  });

  it("validates required draft fields and rejects an inverted effective window", () => {
    const issues = validateAuthorizationDraft({
      operatorId: "",
      authorityCode: "",
      businessPlanVersion: "BP-2026.07",
      serviceAreaCodes: "",
      activeFareVersionId: "FARE-2026.07",
      effectiveFrom: "2026-08-10T00:00",
      effectiveUntil: "2026-08-01T00:00",
    });

    expect(issues).toEqual(
      expect.arrayContaining([
        { field: "operatorId", code: "required" },
        { field: "authorityCode", code: "required" },
        { field: "serviceAreaCodes", code: "required" },
        { field: "effectiveUntil", code: "invalid_window" },
      ]),
    );
  });

  it("separates current vehicle memberships from history and validates add flow", () => {
    const rows = [
      vehicle(),
      vehicle({
        authorizationVehicleId: "membership-2",
        vehicleId: "VEH-OLD",
        status: "removed",
        effectiveUntil: "2026-06-30T00:00:00.000Z",
      }),
    ];
    expect(selectAuthorizedVehicles(rows, "", "current", now)).toHaveLength(1);
    expect(selectAuthorizedVehicles(rows, "old", "history", now)).toHaveLength(
      1,
    );
    expect(
      validateAuthorizedVehicle({
        vehicleId: "VEH-NEW",
        effectiveFrom: "2026-08-10T00:00",
        effectiveUntil: "2026-08-01T00:00",
      }),
    ).toContainEqual({
      field: "effectiveUntil",
      code: "invalid_window",
    });
  });

  it("classifies session, permission, stale conflict, and unavailable API states", () => {
    expect(
      classifyAuthorizationError({ statusCode: 401, code: "SESSION_EXPIRED" })
        .kind,
    ).toBe("session");
    expect(
      classifyAuthorizationError({ statusCode: 403, code: "FORBIDDEN" }).kind,
    ).toBe("permission");
    expect(
      classifyAuthorizationError({
        statusCode: 409,
        code: "AUTHORIZATION_VERSION_CONFLICT",
      }).kind,
    ).toBe("stale");
    expect(
      classifyAuthorizationError({
        statusCode: 404,
        code: "AUTHORIZATION_NOT_FOUND",
      }).kind,
    ).toBe("unavailable");
  });
});
