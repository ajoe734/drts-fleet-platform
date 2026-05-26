/**
 * W8-001A: Client integration and feature-flag rollout tests
 *
 * Validates:
 * 1. Feature flags service (in-memory + DB repository pattern)
 * 2. Feature flags API controller (envelope, tenant scoping)
 * 3. Read model connectivity for tenant portal, ops console, driver app
 * 4. Smoke paths for all three client surfaces
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { FeatureFlagsService } from "../../apps/api/src/modules/feature-flags/feature-flags.service";
import { ApiClient } from "../../packages/api-client/src/index";
import type { FeatureFlagSummary } from "../../packages/contracts/src/index";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Feature Flags Service (in-memory fallback)
// ---------------------------------------------------------------------------

describe("W8-001A feature flags service (in-memory fallback)", () => {
  it("seeds all 14 default Phase 1 flags", async () => {
    const service = new FeatureFlagsService();
    const flags = await service.getAll();
    expect(flags).toHaveLength(14);
  });

  it("returns correct flag keys for tenant-portal surface", async () => {
    const service = new FeatureFlagsService();
    const flags = await service.getAll();
    const tenantPortalFlags = flags.filter((f) =>
      f.key.startsWith("tenant-portal."),
    );
    expect(tenantPortalFlags).toHaveLength(4);
    expect(tenantPortalFlags.map((f) => f.key)).toContain(
      "tenant-portal.booking",
    );
    expect(tenantPortalFlags.map((f) => f.key)).toContain(
      "tenant-portal.billing",
    );
    expect(tenantPortalFlags.map((f) => f.key)).toContain(
      "tenant-portal.reports",
    );
    expect(tenantPortalFlags.map((f) => f.key)).toContain(
      "tenant-portal.webhooks",
    );
  });

  it("returns correct flag keys for ops-console surface", async () => {
    const service = new FeatureFlagsService();
    const flags = await service.getAll();
    const opsConsoleFlags = flags.filter((f) =>
      f.key.startsWith("ops-console."),
    );
    expect(opsConsoleFlags).toHaveLength(4);
    expect(opsConsoleFlags.map((f) => f.key)).toContain("ops-console.dispatch");
    expect(opsConsoleFlags.map((f) => f.key)).toContain(
      "ops-console.complaint",
    );
    expect(opsConsoleFlags.map((f) => f.key)).toContain(
      "ops-console.callcenter",
    );
    expect(opsConsoleFlags.map((f) => f.key)).toContain("ops-console.reports");
  });

  it("returns correct flag keys for driver-app surface", async () => {
    const service = new FeatureFlagsService();
    const flags = await service.getAll();
    const driverAppFlags = flags.filter((f) => f.key.startsWith("driver-app."));
    expect(driverAppFlags).toHaveLength(4);
    expect(driverAppFlags.map((f) => f.key)).toContain("driver-app.tasks");
    expect(driverAppFlags.map((f) => f.key)).toContain("driver-app.earnings");
    expect(driverAppFlags.map((f) => f.key)).toContain("driver-app.incidents");
    expect(driverAppFlags.map((f) => f.key)).toContain("driver-app.shift");
  });

  it("driver-app.shift is disabled by default", async () => {
    const service = new FeatureFlagsService();
    const flag = await service.getByKey("driver-app.shift");
    expect(flag).toBeDefined();
    expect(flag!.enabled).toBe(false);
  });

  it("phase1.read-models and phase1.smoke-paths are enabled", async () => {
    const service = new FeatureFlagsService();
    const readModels = await service.getByKey("phase1.read-models");
    const smokePaths = await service.getByKey("phase1.smoke-paths");
    expect(readModels?.enabled).toBe(true);
    expect(smokePaths?.enabled).toBe(true);
  });

  it("toggles a flag enabled state", async () => {
    const service = new FeatureFlagsService();
    const before = await service.getByKey("driver-app.shift");
    expect(before!.enabled).toBe(false);

    const updated = await service.updateFlag("driver-app.shift", true);
    expect(updated).toBeDefined();
    expect(updated!.enabled).toBe(true);

    const after = await service.getByKey("driver-app.shift");
    expect(after!.enabled).toBe(true);
  });

  it("returns undefined for unknown flag", async () => {
    const service = new FeatureFlagsService();
    const flag = await service.getByKey("nonexistent.flag");
    expect(flag).toBeUndefined();
  });

  it("isEnabled returns false for unknown flag", async () => {
    const service = new FeatureFlagsService();
    const enabled = await service.isEnabled("nonexistent.flag");
    expect(enabled).toBe(false);
  });

  it("returns updatedAt as ISO string", async () => {
    const service = new FeatureFlagsService();
    const flag = await service.getByKey("tenant-portal.booking");
    expect(flag).toBeDefined();
    expect(flag!.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ---------------------------------------------------------------------------
// Feature Flag Summary shape (contract validation)
// ---------------------------------------------------------------------------

describe("W8-001A feature flag summary shape", () => {
  it("produces a valid FeatureFlagSummary shape", async () => {
    const service = new FeatureFlagsService();
    const flags = await service.getAll();
    const summary: FeatureFlagSummary = {
      flags,
      notes: ["Test note"],
    };

    expect(summary).toHaveProperty("flags");
    expect(summary).toHaveProperty("notes");
    expect(Array.isArray(summary.flags)).toBe(true);
    expect(Array.isArray(summary.notes)).toBe(true);
    expect(summary.flags[0]).toHaveProperty("key");
    expect(summary.flags[0]).toHaveProperty("enabled");
    expect(summary.flags[0]).toHaveProperty("description");
    expect(summary.flags[0]).toHaveProperty("updatedAt");
  });
});

// ---------------------------------------------------------------------------
// Read model connectivity smoke checks
// ---------------------------------------------------------------------------

describe("W8-001A read model connectivity expectations", () => {
  it("feature flag keys map to client surfaces", async () => {
    const service = new FeatureFlagsService();
    const flags = await service.getAll();
    const flagMap = new Map(flags.map((f) => [f.key, f.enabled]));

    // Tenant portal surface
    expect(flagMap.get("tenant-portal.booking")).toBe(true);
    expect(flagMap.get("tenant-portal.billing")).toBe(true);

    // Ops console surface
    expect(flagMap.get("ops-console.dispatch")).toBe(true);
    expect(flagMap.get("ops-console.complaint")).toBe(true);

    // Driver app surface
    expect(flagMap.get("driver-app.tasks")).toBe(true);
    expect(flagMap.get("driver-app.earnings")).toBe(true);

    // Cross-cutting
    expect(flagMap.get("phase1.read-models")).toBe(true);
    expect(flagMap.get("phase1.smoke-paths")).toBe(true);
  });

  it("supports tenant-scoped flag overrides via service API", async () => {
    const service = new FeatureFlagsService();
    const result = await service.upsertTenantOverride(
      "tenant-portal.booking",
      "tenant-test-001",
      false,
      "Tenant-specific override",
    );
    expect(result).toBeDefined();
    expect(result!.key).toBe("tenant-portal.booking");
    expect(result!.enabled).toBe(false);
    expect(result!.tenantId).toBe("tenant-test-001");
  });

  it("reads tenant-scoped overrides back through getAll, getByKey, and isEnabled", async () => {
    const service = new FeatureFlagsService();

    await service.upsertTenantOverride(
      "tenant-portal.booking",
      "tenant-test-001",
      false,
      "Tenant-specific override",
    );

    const tenantFlags = await service.getAll("tenant-test-001");
    expect(
      tenantFlags.find((flag) => flag.key === "tenant-portal.booking")?.enabled,
    ).toBe(false);

    const scopedFlag = await service.getByKey(
      "tenant-portal.booking",
      "tenant-test-001",
    );
    expect(scopedFlag?.enabled).toBe(false);
    expect(scopedFlag?.tenantId).toBe("tenant-test-001");

    expect(
      await service.isEnabled("tenant-portal.booking", "tenant-test-001"),
    ).toBe(false);
    expect(await service.isEnabled("tenant-portal.booking")).toBe(true);
  });
});

describe("W8-001A shared api client list handling", () => {
  it("unwraps `{ items }` list payloads for tenant, ops, and driver surfaces", async () => {
    const payloadByPath = new Map<string, unknown[]>([
      ["/api/orders", [{ orderId: "order-001" }]],
      ["/api/reports/jobs", [{ jobId: "job-001" }]],
      ["/api/driver-statements", [{ statementId: "stmt-001" }]],
      ["/api/driver-fee-plans", [{ feePlanId: "plan-001" }]],
      ["/api/reimbursements", [{ batchId: "batch-001" }]],
      ["/api/filing-packages", [{ packageId: "pkg-001" }]],
      [
        "/api/tenant/roles",
        [{ roleCode: "tenant_admin", displayName: "Tenant Admin" }],
      ],
    ]);

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const path = new URL(url).pathname;

      return {
        ok: true,
        json: async () => ({ data: { items: payloadByPath.get(path) ?? [] } }),
        text: async () => "",
      } as Response;
    });

    vi.stubGlobal("fetch", fetchMock);

    const client = new ApiClient({ baseUrl: "http://localhost:3001" });

    await expect(client.listOrders()).resolves.toEqual(
      payloadByPath.get("/api/orders"),
    );
    await expect(client.listReportJobs()).resolves.toEqual(
      payloadByPath.get("/api/reports/jobs"),
    );
    await expect(client.listDriverStatements()).resolves.toEqual(
      payloadByPath.get("/api/driver-statements"),
    );
    await expect(client.listDriverFeePlans()).resolves.toEqual(
      payloadByPath.get("/api/driver-fee-plans"),
    );
    await expect(client.listReimbursementBatches()).resolves.toEqual(
      payloadByPath.get("/api/reimbursements"),
    );
    await expect(client.listFilingPackages()).resolves.toEqual(
      payloadByPath.get("/api/filing-packages"),
    );
    await expect(client.listTenantRoles()).resolves.toEqual(
      payloadByPath.get("/api/tenant/roles"),
    );
  });

  it("targets realm search endpoints and flattens grouped search results", async () => {
    const groupedResultsByPath = new Map<string, unknown>([
      [
        "/api/ops/search?q=alice&types=orders%2Cdrivers",
        {
          groups: [
            {
              category: "orders",
              items: [
                {
                  category: "orders",
                  resource_type: "order",
                  resource_id: "order-001",
                  primary_label: "Order 001",
                  secondary_label: "Alice Rider",
                  link: {
                    target_app: "ops-console",
                    route: "/orders/order-001",
                    resource_type: "order",
                    resource_id: "order-001",
                    open_mode: "same_tab",
                    label: "Open order",
                  },
                  matched_fields: ["passenger_name"],
                },
              ],
            },
            {
              category: "drivers",
              items: [
                {
                  category: "drivers",
                  resource_type: "driver",
                  resource_id: "drv-001",
                  primary_label: "Alice Driver",
                  link: {
                    target_app: "ops-console",
                    route: "/drivers/drv-001",
                    resource_type: "driver",
                    resource_id: "drv-001",
                    open_mode: "same_tab",
                    label: "Open driver",
                  },
                },
              ],
            },
          ],
        },
      ],
      [
        "/api/platform/search?q=tenant-demo",
        {
          groups: [
            {
              category: "tenants",
              items: [
                {
                  category: "tenants",
                  resource_type: "tenant",
                  resource_id: "tenant-demo-001",
                  primary_label: "Tenant Demo",
                  link: {
                    target_app: "platform-admin",
                    route: "/tenants/tenant-demo-001",
                    resource_type: "tenant",
                    resource_id: "tenant-demo-001",
                    open_mode: "same_tab",
                    label: "Open tenant",
                  },
                },
              ],
            },
          ],
        },
      ],
      [
        "/api/tenant/search?q=invoice&types=invoices",
        {
          groups: [
            {
              category: "invoices",
              items: [
                {
                  category: "invoices",
                  resource_type: "invoice",
                  resource_id: "inv-001",
                  primary_label: "Invoice INV-001",
                  link: {
                    target_app: "tenant-console",
                    route: "/invoices/inv-001",
                    resource_type: "invoice",
                    resource_id: "inv-001",
                    open_mode: "same_tab",
                    label: "Open invoice",
                  },
                },
              ],
            },
          ],
        },
      ],
    ]);

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const pathWithQuery = `${new URL(url).pathname}${new URL(url).search}`;

      return {
        ok: true,
        json: async () => ({
          data: groupedResultsByPath.get(pathWithQuery) ?? { groups: [] },
        }),
        text: async () => "",
      } as Response;
    });

    vi.stubGlobal("fetch", fetchMock);

    const client = new ApiClient({ baseUrl: "http://localhost:3001" });

    await expect(
      client.searchOps({ q: "alice", types: ["orders", "drivers"] }),
    ).resolves.toEqual([
      {
        category: "orders",
        resourceType: "order",
        resourceId: "order-001",
        primaryLabel: "Order 001",
        secondaryLabel: "Alice Rider",
        link: {
          targetApp: "ops-console",
          route: "/orders/order-001",
          resourceType: "order",
          resourceId: "order-001",
          openMode: "same_tab",
          label: "Open order",
        },
        matchedFields: ["passenger_name"],
      },
      {
        category: "drivers",
        resourceType: "driver",
        resourceId: "drv-001",
        primaryLabel: "Alice Driver",
        link: {
          targetApp: "ops-console",
          route: "/drivers/drv-001",
          resourceType: "driver",
          resourceId: "drv-001",
          openMode: "same_tab",
          label: "Open driver",
        },
      },
    ]);
    await expect(client.searchPlatform({ q: "tenant-demo" })).resolves.toEqual(
      [
        {
          category: "tenants",
          resourceType: "tenant",
          resourceId: "tenant-demo-001",
          primaryLabel: "Tenant Demo",
          link: {
            targetApp: "platform-admin",
            route: "/tenants/tenant-demo-001",
            resourceType: "tenant",
            resourceId: "tenant-demo-001",
            openMode: "same_tab",
            label: "Open tenant",
          },
        },
      ],
    );
    await expect(
      client.searchTenant({ q: "invoice", types: ["invoices"] }),
    ).resolves.toEqual([
      {
        category: "invoices",
        resourceType: "invoice",
        resourceId: "inv-001",
        primaryLabel: "Invoice INV-001",
        link: {
          targetApp: "tenant-console",
          route: "/invoices/inv-001",
          resourceType: "invoice",
          resourceId: "inv-001",
          openMode: "same_tab",
          label: "Open invoice",
        },
      },
    ]);
  });

  it("uses the canonical /api/reports/jobs route for report creation", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          jobId: "job-accepted-001",
          status: "queued",
        },
      }),
      text: async () => "",
    } as Response);

    vi.stubGlobal("fetch", fetchMock);

    const client = new ApiClient({ baseUrl: "http://localhost:3001" });

    await client.createReportJob({
      jobType: "dispatch_recording_index",
      format: "csv",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/reports/jobs",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("targets the tenant bootstrap-session auth route for tenant portal login", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          access_token: "jwt-token-001",
          token_type: "Bearer",
          expires_in: "8h",
          profile: {
            id: "tenant-user-001",
            tenant_id: "tenant-demo-001",
            full_name: "Tenant User",
            email: "tenant.admin@example.com",
            role_code: "tenant_admin",
          },
          identity: {
            actor_type: "tenant_admin",
            actor_id: "tenant-user-001",
            realm: "tenant",
            auth_mode: "jwt_bearer",
            role_families: ["tenant"],
            roles: ["tenant_admin"],
            scopes: ["tenant:read", "tenant:write"],
            tenant_id: "tenant-demo-001",
            supported_execution_modes: [
              "discussion_planning",
              "supervisor_managed_execution",
            ],
          },
        },
      }),
      text: async () => "",
    } as Response);

    vi.stubGlobal("fetch", fetchMock);

    const client = new ApiClient({ baseUrl: "http://localhost:3001" });

    await expect(
      client.createTenantBootstrapSession({
        email: "tenant.admin@example.com",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        accessToken: "jwt-token-001",
        tokenType: "Bearer",
        expiresIn: "8h",
        profile: expect.objectContaining({
          tenantId: "tenant-demo-001",
          roleCode: "tenant_admin",
        }),
        identity: expect.objectContaining({
          authMode: "jwt_bearer",
          tenantId: "tenant-demo-001",
        }),
      }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/auth/tenant/bootstrap-session",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("targets the platform-admin delete draft public info route with DELETE", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        expect(new URL(url).pathname).toBe(
          "/api/platform-admin/public-info/public-info-draft-001",
        );
        expect(init?.method).toBe("DELETE");
        expect(init?.body).toBeUndefined();

        return {
          ok: true,
          json: async () => ({
            data: {
              versionId: "public-info-draft-001",
              title: "Draft version",
              status: "draft",
              callPhone: null,
              complaintPhone: null,
              callRateText: null,
              fareText: null,
              paymentMethodText: null,
              effectiveFrom: null,
              effectiveTo: null,
              publishedBy: null,
              publishedAt: null,
              createdAt: "2026-04-19T00:00:00.000Z",
              updatedAt: "2026-04-19T00:00:00.000Z",
            },
          }),
          text: async () => "",
        } as Response;
      },
    );

    vi.stubGlobal("fetch", fetchMock);

    const client = new ApiClient({ baseUrl: "http://localhost:3001" });

    await expect(
      client.deletePublicInfoVersion("public-info-draft-001"),
    ).resolves.toEqual(
      expect.objectContaining({
        versionId: "public-info-draft-001",
        status: "draft",
      }),
    );
  });

  it("targets canonical finance reimbursement routes for list/approve/pay", async () => {
    const seenPaths: string[] = [];
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        const pathWithQuery = `${new URL(url).pathname}${new URL(url).search}`;
        seenPaths.push(pathWithQuery);

        if (pathWithQuery.endsWith("/approve")) {
          expect(init?.method).toBe("POST");
          expect(JSON.parse(String(init?.body))).toEqual({
            statementId: "stmt-001",
          });
        }

        if (pathWithQuery.endsWith("/pay")) {
          expect(init?.method).toBe("POST");
          expect(JSON.parse(String(init?.body))).toEqual({
            remittanceProofId: "proof-001",
          });
        }

        return {
          ok: true,
          json: async () => ({
            data: {
              items: [],
            },
          }),
          text: async () => "",
        } as Response;
      },
    );

    vi.stubGlobal("fetch", fetchMock);

    const client = new ApiClient({ baseUrl: "http://localhost:3001" });

    await client.listReimbursementBatches({
      status: "pending",
      periodMonth: "2026-03",
    });
    await client.approveReimbursementBatch("batch-001", {
      statementId: "stmt-001",
    });
    await client.markReimbursementPaid("batch-001", {
      remittanceProofId: "proof-001",
    });

    expect(seenPaths).toEqual([
      "/api/reimbursements?status=pending&periodMonth=2026-03",
      "/api/reimbursements/batch-001/approve",
      "/api/reimbursements/batch-001/pay",
    ]);
  });

  it("posts webhook metadata updates to the tenant BFF command path", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        const path = new URL(url).pathname;

        expect(path).toBe("/api/tenant/webhooks/wh_demo_001");
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({
          url: "https://tenant.example.com/webhooks/v2",
          events: ["tenant.billing_profile.updated"],
          status: "active",
        });

        return {
          ok: true,
          json: async () => ({
            data: {
              webhookId: "wh_demo_001",
              tenantId: "tenant-demo-001",
              url: "https://tenant.example.com/webhooks/v2",
              events: ["tenant.billing_profile.updated"],
              status: "active",
              secretVersion: 2,
              secretPreview: "sha256:deadbeefcafe",
              createdAt: "2026-04-15T00:00:00Z",
              updatedAt: "2026-04-15T00:10:00Z",
            },
          }),
          text: async () => "",
        } as Response;
      },
    );

    vi.stubGlobal("fetch", fetchMock);

    const client = new ApiClient({ baseUrl: "http://localhost:3001" });

    await expect(
      client.updateWebhookEndpoint("wh_demo_001", {
        url: "https://tenant.example.com/webhooks/v2",
        events: ["tenant.billing_profile.updated"],
        status: "active",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        webhookId: "wh_demo_001",
        status: "active",
      }),
    );
  });

  it("targets canonical driver profile routes for self-service profile access", async () => {
    const seen: Array<{ path: string; method: string; body?: unknown }> = [];
    const profile = {
      driverId: "drv-demo-001",
      name: "Driver Demo One",
      phone: "+886-912-000-001",
      email: "driver.one@example.com",
      photoUrl: null,
      emergencyContact: null,
      bankAccount: null,
      updatedAt: "2026-04-17T00:00:00.000Z",
    };

    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        seen.push({
          path: new URL(url).pathname,
          method: init?.method ?? "GET",
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        });

        return {
          ok: true,
          json: async () => ({ data: profile }),
          text: async () => "",
        } as Response;
      },
    );

    vi.stubGlobal("fetch", fetchMock);

    const client = new ApiClient({ baseUrl: "http://localhost:3001" });

    await expect(client.getDriverProfile()).resolves.toEqual(profile);
    await expect(
      client.createDriverProfile({ name: "Driver Demo One" }),
    ).resolves.toEqual(profile);
    await expect(
      client.updateDriverProfile({ phone: "+886-912-000-001" }),
    ).resolves.toEqual(profile);

    expect(seen).toEqual([
      {
        path: "/api/driver/profile",
        method: "GET",
        body: undefined,
      },
      {
        path: "/api/driver/profile",
        method: "POST",
        body: { name: "Driver Demo One" },
      },
      {
        path: "/api/driver/profile",
        method: "PATCH",
        body: { phone: "+886-912-000-001" },
      },
    ]);
  });

  it("converts snake_case wire payloads into camelCase client records", async () => {
    const fetchMock = vi.fn(async () => {
      return {
        ok: true,
        json: async () => ({
          data: {
            items: [
              {
                booking_id: "booking-001",
                order_status: "created",
                business_dispatch_subtype: "enterprise_dispatch",
                reservation_window_start: "2026-04-23T00:00:00.000Z",
                passenger: {
                  name: "Smoke Passenger",
                },
                pickup: {
                  address: "1 Smoke Plaza",
                },
                dropoff: {
                  address: "99 Destination Ave",
                },
              },
            ],
          },
        }),
        text: async () => "",
      } as Response;
    });

    vi.stubGlobal("fetch", fetchMock);

    const client = new ApiClient({ baseUrl: "http://localhost:3001" });
    const bookings = await client.listTenantBookings();

    expect(bookings).toEqual([
      {
        bookingId: "booking-001",
        orderStatus: "created",
        businessDispatchSubtype: "enterprise_dispatch",
        reservationWindowStart: "2026-04-23T00:00:00.000Z",
        passenger: {
          name: "Smoke Passenger",
        },
        pickup: {
          address: "1 Smoke Plaza",
        },
        dropoff: {
          address: "99 Destination Ave",
        },
      },
    ]);
  });

  it("converts snake_case accepted command responses into camelCase fields", async () => {
    const fetchMock = vi.fn(async () => {
      return {
        ok: true,
        json: async () => ({
          data: {
            job_id: "JOB-001",
            status: "queued",
          },
        }),
        text: async () => "",
      } as Response;
    });

    vi.stubGlobal("fetch", fetchMock);

    const client = new ApiClient({ baseUrl: "http://localhost:3001" });
    const accepted = await client.createTenantReportJob({
      jobType: "trip_summary",
      format: "csv",
    });

    expect(accepted).toEqual({
      jobId: "JOB-001",
      status: "queued",
    });
  });

  it("supports partner entry lookup and eligibility verification flows", async () => {
    const seen: Array<{
      path: string;
      method: string;
      body?: unknown;
    }> = [];

    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        const path = new URL(url).pathname;
        seen.push({
          path,
          method: init?.method ?? "GET",
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        });

        if (path === "/api/partner/entries") {
          return {
            ok: true,
            json: async () => ({
              data: {
                items: [
                  {
                    entry_slug: "bank-demo-alpha-airport",
                    partner_id: "partner-bank-demo-001",
                    tenant_id: "tenant-demo-001",
                    business_dispatch_subtype: "credit_card_airport_transfer",
                    eligibility_mode: "bank_card_inline",
                  },
                ],
              },
            }),
            text: async () => "",
          } as Response;
        }

        if (path === "/api/partner/entries/bank-demo-alpha-airport") {
          return {
            ok: true,
            json: async () => ({
              data: {
                entry_slug: "bank-demo-alpha-airport",
                partner_id: "partner-bank-demo-001",
                tenant_id: "tenant-demo-001",
                business_dispatch_subtype: "credit_card_airport_transfer",
                eligibility_mode: "bank_card_inline",
              },
            }),
            text: async () => "",
          } as Response;
        }

        return {
          ok: true,
          json: async () => ({
            data: {
              eligibility_verification_id: "elig-001",
              tenant_id: "tenant-demo-001",
              partner_id: "partner-bank-demo-001",
              partner_program_id: "program-airport-alpha",
              partner_entry_slug: "bank-demo-alpha-airport",
              verification_status: "eligible",
              verification_reason_code: "CARD_PROGRAM_MATCHED",
            },
          }),
          text: async () => "",
        } as Response;
      },
    );

    vi.stubGlobal("fetch", fetchMock);

    const client = new ApiClient({ baseUrl: "http://localhost:3001" });

    await expect(client.listPartnerEntries()).resolves.toEqual([
      {
        entrySlug: "bank-demo-alpha-airport",
        partnerId: "partner-bank-demo-001",
        tenantId: "tenant-demo-001",
        businessDispatchSubtype: "credit_card_airport_transfer",
        eligibilityMode: "bank_card_inline",
      },
    ]);
    await expect(
      client.getPartnerEntry("bank-demo-alpha-airport"),
    ).resolves.toEqual({
      entrySlug: "bank-demo-alpha-airport",
      partnerId: "partner-bank-demo-001",
      tenantId: "tenant-demo-001",
      businessDispatchSubtype: "credit_card_airport_transfer",
      eligibilityMode: "bank_card_inline",
    });
    await expect(
      client.verifyPartnerEligibility({
        entrySlug: "bank-demo-alpha-airport",
        cardLast4: "2468",
      }),
    ).resolves.toEqual({
      eligibilityVerificationId: "elig-001",
      tenantId: "tenant-demo-001",
      partnerId: "partner-bank-demo-001",
      partnerProgramId: "program-airport-alpha",
      partnerEntrySlug: "bank-demo-alpha-airport",
      verificationStatus: "eligible",
      verificationReasonCode: "CARD_PROGRAM_MATCHED",
    });

    expect(seen).toEqual([
      {
        path: "/api/partner/entries",
        method: "GET",
        body: undefined,
      },
      {
        path: "/api/partner/entries/bank-demo-alpha-airport",
        method: "GET",
        body: undefined,
      },
      {
        path: "/api/partner/eligibility/verify",
        method: "POST",
        body: {
          entrySlug: "bank-demo-alpha-airport",
          cardLast4: "2468",
        },
      },
    ]);
  });

  it("lists and resolves partner eligibility review queue items", async () => {
    const seen: Array<{
      path: string;
      method: string;
      body?: unknown;
    }> = [];
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const path = url.replace("http://localhost:3001", "");
        const method = init?.method ?? "GET";
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        seen.push({ path, method, body });

        if (path === "/api/ops/partner/eligibility/reviews") {
          return {
            ok: true,
            json: async () => ({
              data: {
                items: [
                  {
                    eligibility_verification_id: "elig-review-001",
                    partner_entry_slug: "bank-demo-beta-airport",
                    verification_status: "manual_review",
                    verification_reason_code:
                      "ISSUER_RETRY_EXHAUSTED_REVIEW_REQUIRED",
                    decision_source: "manual_fallback",
                    attempt_count: 3,
                    latest_attempt_status: "error",
                    latest_attempt_reason_code: "ISSUER_UNAVAILABLE",
                    manual_fallback: {
                      required: true,
                      reason_code: "ISSUER_RETRY_EXHAUSTED_REVIEW_REQUIRED",
                      requested_at: "2026-04-30T15:00:00.000Z",
                      requested_by: "system:auto_fallback",
                      notes: null,
                    },
                    request_hints: {
                      card_last4: null,
                      flight_no: "BR102",
                    },
                    verified_at: "2026-04-30T15:00:00.000Z",
                    created_at: "2026-04-30T15:00:00.000Z",
                    updated_at: "2026-04-30T15:00:00.000Z",
                  },
                ],
              },
            }),
            text: async () => "",
          } as Response;
        }

        return {
          ok: true,
          json: async () => ({
            data: {
              eligibility_verification_id: "elig-review-001",
              previous_status: "manual_review",
              resolved_status: "eligible",
              decision: "approve",
              reason_code: "OFFLINE_ISSUER_CONFIRMATION_RECEIVED",
              notes: "Issuer confirmed offline.",
              resolved_at: "2026-04-30T15:05:00.000Z",
              resolved_by: "ops-reviewer-001",
            },
          }),
          text: async () => "",
        } as Response;
      },
    );

    vi.stubGlobal("fetch", fetchMock);

    const client = new ApiClient({ baseUrl: "http://localhost:3001" });

    await expect(client.listPartnerEligibilityReviewQueue()).resolves.toEqual([
      {
        eligibilityVerificationId: "elig-review-001",
        partnerEntrySlug: "bank-demo-beta-airport",
        verificationStatus: "manual_review",
        verificationReasonCode: "ISSUER_RETRY_EXHAUSTED_REVIEW_REQUIRED",
        decisionSource: "manual_fallback",
        attemptCount: 3,
        latestAttemptStatus: "error",
        latestAttemptReasonCode: "ISSUER_UNAVAILABLE",
        manualFallback: {
          required: true,
          reasonCode: "ISSUER_RETRY_EXHAUSTED_REVIEW_REQUIRED",
          requestedAt: "2026-04-30T15:00:00.000Z",
          requestedBy: "system:auto_fallback",
          notes: null,
        },
        requestHints: {
          cardLast4: null,
          flightNo: "BR102",
        },
        verifiedAt: "2026-04-30T15:00:00.000Z",
        createdAt: "2026-04-30T15:00:00.000Z",
        updatedAt: "2026-04-30T15:00:00.000Z",
      },
    ]);

    await expect(
      client.resolvePartnerEligibilityReview({
        eligibilityVerificationId: "elig-review-001",
        decision: "approve",
        reasonCode: "OFFLINE_ISSUER_CONFIRMATION_RECEIVED",
        notes: "Issuer confirmed offline.",
      }),
    ).resolves.toEqual({
      eligibilityVerificationId: "elig-review-001",
      previousStatus: "manual_review",
      resolvedStatus: "eligible",
      decision: "approve",
      reasonCode: "OFFLINE_ISSUER_CONFIRMATION_RECEIVED",
      notes: "Issuer confirmed offline.",
      resolvedAt: "2026-04-30T15:05:00.000Z",
      resolvedBy: "ops-reviewer-001",
    });

    expect(seen).toEqual([
      {
        path: "/api/ops/partner/eligibility/reviews",
        method: "GET",
        body: undefined,
      },
      {
        path: "/api/ops/partner/eligibility/reviews/resolve",
        method: "POST",
        body: {
          eligibilityVerificationId: "elig-review-001",
          decision: "approve",
          reasonCode: "OFFLINE_ISSUER_CONFIRMATION_RECEIVED",
          notes: "Issuer confirmed offline.",
        },
      },
    ]);
  });
});
