import { describe, expect, it } from "vitest";

import { SearchService } from "../../src/modules/search/search.service";

function createService() {
  return new SearchService(
    {
      list: () => [
        {
          id: "tenant-acme",
          code: "acme",
          name: "Acme Mobility",
          status: "active",
        },
      ],
    } as never,
    {
      listPlatformAdminUsers: () => [
        {
          userId: "pa-admin-001",
          email: "admin@platform.drts",
          displayName: "Platform Superadmin",
          roleCode: "superadmin",
          status: "active",
        },
      ],
    } as never,
    {
      listPlatformPartnerEntries: () => [
        {
          entrySlug: "acme-corp-card",
          displayName: "Acme Corporate Card",
          partnerCode: "acme_bank",
          partnerType: "issuer",
          programId: "acme_program",
          programCode: "ACME-CARD",
          tenantId: "tenant-acme",
          status: "active",
        },
      ],
      listTenantUsers: (tenantId: string) => [
        {
          tenantId,
          userId: `${tenantId}-ops`,
          email: "ops@acme.example",
          displayName: "Acme Ops Lead",
          roleCode: "tenant_ops_admin",
          status: "active",
        },
      ],
    } as never,
    {
      getAuditLogsSnapshot: () => [
        {
          auditId: "audit-001",
          actorId: "pa-admin-001",
          actorType: "platform_admin",
          tenantId: null,
          moduleName: "platform-admin",
          actionName: "create_platform_tenant",
          resourceType: "platform_tenant",
          resourceId: "tenant-acme",
          requestId: "req-001",
          createdAt: "2026-05-25T00:00:00.000Z",
        },
      ],
    } as never,
  );
}

describe("SearchService", () => {
  it("returns category-grouped cross-entity search results", () => {
    const service = createService();

    const result = service.search("acme");

    expect(result.tenants).toEqual([
      expect.objectContaining({
        category: "tenants",
        resourceId: "tenant-acme",
        primaryLabel: "Acme Mobility",
        matchedFields: expect.arrayContaining(["code", "name"]),
      }),
    ]);
    expect(result.partners).toEqual([
      expect.objectContaining({
        category: "partners",
        resourceId: "acme-corp-card",
        matchedFields: expect.arrayContaining([
          "entry_slug",
          "display_name",
          "program_id",
          "program_code",
        ]),
      }),
    ]);
    expect(result.users).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          resourceType: "tenant_user",
          resourceId: "tenant-acme-ops",
          matchedFields: expect.arrayContaining(["email", "display_name"]),
        }),
      ]),
    );
    expect(result.audit).toEqual([
      expect.objectContaining({
        category: "audit",
        resourceId: "audit-001",
        matchedFields: expect.arrayContaining(["resource_id"]),
      }),
    ]);
  });

  it("matches adapter registry entries case-insensitively", () => {
    const service = createService();

    const result = service.search("GRAB");

    expect(result.adapter_registry).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "adapter_registry",
          resourceId: "grab",
          primaryLabel: "Grab",
        }),
      ]),
    );
  });

  it("filters grouped results by the documented types query", () => {
    const service = createService();

    const result = service.search("acme", "tenants,users");

    expect(result.tenants).toHaveLength(1);
    expect(result.users).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          resourceId: "tenant-acme-ops",
        }),
      ]),
    );
    expect(result.partners).toEqual([]);
    expect(result.adapter_registry).toEqual([]);
    expect(result.audit).toEqual([]);
  });

  it("supports repeated types params and ignores unknown filter values", () => {
    const service = createService();

    const result = service.search("acme", ["partners", "unknown,audit"]);

    expect(result.tenants).toEqual([]);
    expect(result.users).toEqual([]);
    expect(result.partners).toHaveLength(1);
    expect(result.audit).toHaveLength(1);
  });

  it("returns empty grouped buckets for blank queries", () => {
    const service = createService();

    expect(service.search("   ")).toEqual({
      tenants: [],
      partners: [],
      users: [],
      adapter_registry: [],
      audit: [],
    });
  });
});
