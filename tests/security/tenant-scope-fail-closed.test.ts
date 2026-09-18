import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import {
  assertTenantVisibility,
  filterToTenantVisibility,
  resolveTenantVisibility,
} from "../../apps/api/src/common/tenant-scope";

function codeOf(call: () => unknown): string {
  try {
    call();
  } catch (error) {
    return (error as ApiRequestError).code;
  }
  throw new Error("expected the call to throw");
}

const RECORDS = [
  { id: "a", tenantId: "tenant-1" },
  { id: "b", tenantId: "tenant-2" },
  { id: "c", tenantId: null },
];

describe("tenant scope", () => {
  it("refuses a tenant caller that carries no tenant", () => {
    // This is the case the hand-written filters fell through on. Their
    // condition narrowed only when a tenantId was present, and its else branch
    // was every tenant's data.
    expect(codeOf(() => resolveTenantVisibility({ realm: "tenant" }))).toBe(
      "TENANT_SCOPE_REQUIRED",
    );
    expect(
      codeOf(() => resolveTenantVisibility({ realm: "tenant", tenantId: "" })),
    ).toBe("TENANT_SCOPE_REQUIRED");
    expect(
      codeOf(() => resolveTenantVisibility({ realm: "tenant", tenantId: " " })),
    ).toBe("TENANT_SCOPE_REQUIRED");
  });

  it("scopes a partner caller too", () => {
    // `partner` was an allowed realm on the invoice and settlement-matrix
    // routes and was never narrowed, so a partner could read every tenant.
    expect(codeOf(() => resolveTenantVisibility({ realm: "partner" }))).toBe(
      "TENANT_SCOPE_REQUIRED",
    );
    expect(
      resolveTenantVisibility({ realm: "partner", tenantId: "tenant-1" }),
    ).toEqual({ scope: "tenant", tenantId: "tenant-1" });
  });

  it("lets platform, ops and system see everything", () => {
    for (const realm of ["platform", "ops", "system"]) {
      expect(resolveTenantVisibility({ realm })).toEqual({ scope: "all" });
    }
  });

  it("keeps a platform-level record out of a tenant's view", () => {
    // The reconciliation guard tested `record.tenantId && record.tenantId !==
    // mine`, so a record with a null tenant was readable -- and resolvable, and
    // reopenable -- by any tenant.
    const visible = filterToTenantVisibility(RECORDS, {
      scope: "tenant",
      tenantId: "tenant-1",
    });

    expect(visible.map((record) => record.id)).toEqual(["a"]);
  });

  it("refuses to act on another tenant's record, and on an untenanted one", () => {
    const mine = { scope: "tenant", tenantId: "tenant-1" } as const;

    expect(() => assertTenantVisibility("tenant-1", mine)).not.toThrow();
    expect(codeOf(() => assertTenantVisibility("tenant-2", mine))).toBe(
      "NOT_FOUND",
    );
    expect(codeOf(() => assertTenantVisibility(null, mine))).toBe("NOT_FOUND");
    // Not found rather than forbidden: whether a record exists in another
    // tenant is itself something this caller should not learn.
    expect(() => assertTenantVisibility(null, { scope: "all" })).not.toThrow();
  });
});
