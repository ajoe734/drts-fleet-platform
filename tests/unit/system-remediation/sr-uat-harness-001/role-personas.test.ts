import { describe, it, expect } from "vitest";
import {
  BASELINE_PERSONAS,
  createTenantPersonas,
  generateAuthHeaders,
} from "../../../e2e/system-remediation/shared/role-personas";
import type { UatTenantContext } from "../../../e2e/system-remediation/shared/namespace-manager";

describe("SR-UAT-HARNESS-001: Role Personas and Auth Headers", () => {
  const mockTenant: UatTenantContext = {
    tenantId: "20000000-0000-0000-0000-000000000001",
    tenantCode: "TEN_UAT_CORP",
    tenantName: "UAT Corporate Tenant",
    tenantType: "enterprise",
    brandName: "UAT Corp",
    defaultAreaId: "00000000-0000-0000-0000-000000000101",
  };

  it("provides baseline canonical platform personas with valid scopes", () => {
    const admin = BASELINE_PERSONAS.platform_admin;
    expect(admin.actorType).toBe("platform_admin");
    expect(admin.realm).toBe("platform");
    expect(admin.scopes).toContain("identity:read");
    expect(admin.scopes).toContain("tenant:write");
    expect(admin.scopes).toContain("billing:read");

    const dispatcher = BASELINE_PERSONAS.ops_dispatcher;
    expect(dispatcher.actorType).toBe("ops_user");
    expect(dispatcher.realm).toBe("ops");
    expect(dispatcher.scopes).toContain("dispatch:write");

    const finance = BASELINE_PERSONAS.bank_finance;
    expect(finance.roles).toContain("bank_finance");
  });

  it("creates tenant-scoped personas bound to the tenant ID", () => {
    const personas = createTenantPersonas(mockTenant);

    expect(personas.admin.tenantId).toBe(mockTenant.tenantId);
    expect(personas.admin.actorType).toBe("tenant_admin");
    expect(personas.admin.realm).toBe("tenant");

    expect(personas.operator.tenantId).toBe(mockTenant.tenantId);
    expect(personas.operator.actorType).toBe("ops_user");

    expect(personas.driver.tenantId).toBe(mockTenant.tenantId);
    expect(personas.driver.driverId).toBeDefined();
    expect(personas.driver.actorType).toBe("driver_user");

    expect(personas.passenger.tenantId).toBe(mockTenant.tenantId);
    expect(personas.passenger.actorType).toBe("referral_passenger");
  });

  it("generates correct authentication headers in local and sandbox modes", () => {
    const personas = createTenantPersonas(mockTenant);

    const localHeaders = generateAuthHeaders(personas.admin, "local");
    expect(localHeaders["x-actor-type"]).toBe("tenant_admin");
    expect(localHeaders["x-actor-id"]).toBe(personas.admin.actorId);
    expect(localHeaders["x-realm"]).toBe("tenant");
    expect(localHeaders["x-tenant-id"]).toBe(mockTenant.tenantId);
    expect(localHeaders["x-scopes"]).toContain("tenant:read");

    const driverHeaders = generateAuthHeaders(personas.driver, "sandbox");
    expect(driverHeaders["x-actor-type"]).toBe("driver_user");
    expect(driverHeaders["x-driver-id"]).toBe(personas.driver.driverId);
  });

  it("enforces live mode guardrail by rejecting synthetic fakeheaders", () => {
    const personas = createTenantPersonas(mockTenant);

    expect(() => {
      generateAuthHeaders(personas.admin, "live");
    }).toThrow(
      /Live environment requires authentic credentials\/tokens and does not permit synthetic auth headers/,
    );
  });
});
