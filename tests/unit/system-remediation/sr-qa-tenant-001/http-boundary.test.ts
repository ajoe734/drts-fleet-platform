import { describe, expect, it } from "vitest";
import { deepToSnakeCase } from "../../../../apps/api/src/common/snake-case.interceptor";
import {
  decodeTenantWire,
  requiresTenantStepUp,
} from "../../../e2e/system-remediation/sr-qa-tenant-001/http-boundary";

describe("tenant acceptance real HTTP boundary", () => {
  it("projects actual canonical wire keys without manufacturing domain state", () => {
    const domain = {
      data: {
        passengerId: "received-id",
        tenantId: "received-tenant",
        quotas: { monthlyBookings: 37 },
        items: [{ activeFlag: false, disabledAt: null }],
      },
    };
    expect(decodeTenantWire(deepToSnakeCase(domain))).toEqual(domain);
    expect(decodeTenantWire({ data: {} })).toEqual({ data: {} });
  });
  it("rejects a noncanonical camelCase HTTP payload", () => {
    expect(() =>
      decodeTenantWire({ data: { passengerId: "invalid-wire" } }),
    ).toThrow("Noncanonical HTTP key");
  });
  it("requires real proof for privileged user and approval mutations only", () => {
    expect(requiresTenantStepUp("POST", "tenant/users")).toBe(true);
    expect(requiresTenantStepUp("POST", "tenant/users/user-id/role")).toBe(
      true,
    );
    expect(
      requiresTenantStepUp(
        "POST",
        "tenant/approval-requests/request-id/approve",
      ),
    ).toBe(true);
    expect(requiresTenantStepUp("GET", "tenant/users")).toBe(false);
    expect(requiresTenantStepUp("POST", "tenant/addresses")).toBe(false);
  });
});
