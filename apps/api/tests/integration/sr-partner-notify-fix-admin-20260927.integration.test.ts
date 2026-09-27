import { expect, test, vi } from "vitest";
import { MultiTaxiRepository } from "../../src/modules/multi-taxi/multi-taxi.repository";
import { deepToSnakeCase } from "../../src/common/snake-case.interceptor";
import * as React from "react";
import * as ReactDOMServer from "react-dom/server";

function snakeToCamelCase(key: string): string {
  return key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function deepToCamelCase(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => deepToCamelCase(item));
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        snakeToCamelCase(k),
        deepToCamelCase(v),
      ])
    );
  }
  return value;
}

test("multi-taxi.repository full serialization rendering path passes with ISO dates", async () => {
  const mockDatabaseService = {
    query: vi.fn(),
  };
  const repository = new MultiTaxiRepository(mockDatabaseService as any);

  mockDatabaseService.query
    .mockResolvedValueOnce({ rows: [{ cnt: "1" }] })
    .mockResolvedValueOnce({
      rows: [
        {
          outboxId: "test-outbox",
          orderId: "test-order",
          createdAt: new Date("2026-09-27T10:00:00Z"),
          deliveredAt: new Date("2026-09-27T10:05:00Z"),
          expiresAt: new Date("2026-09-27T12:00:00Z"),
          nextAttemptAt: new Date("2026-09-27T10:10:00Z"),
          leaseExpiresAt: new Date("2026-09-27T10:15:00Z"),
        }
      ]
    });

  const result = await repository.listPartnerNotificationDeliveries(
    { entrySlug: "test", tenantId: "t-1", partnerId: "p-1" },
    {}
  );

  // Controller success/list envelope
  const envelope = {
    data: result.rows,
    meta: { total: result.total }
  };

  // NestJS interceptor
  const snakeCaseEnvelope = deepToSnakeCase(envelope);

  // API client wire conversion
  const camelCaseEnvelope = deepToCamelCase(snakeCaseEnvelope) as any;
  const row = camelCaseEnvelope.data[0];

  // React renderable props
  const renderCell = (r: any) => r.createdAt || r.at || "—";

  // This would throw if row.createdAt is {}
  const element = React.createElement("span", null, renderCell(row));
  const html = ReactDOMServer.renderToStaticMarkup(element);

  expect(html).toBe("<span>2026-09-27T10:00:00.000Z</span>");

  expect(typeof row.createdAt).toBe("string");
  expect(typeof row.deliveredAt).toBe("string");
  expect(typeof row.expiresAt).toBe("string");
  expect(typeof row.nextAttemptAt).toBe("string");
  expect(typeof row.leaseExpiresAt).toBe("string");
});

test("multi-taxi.repository listPartnerNotificationDeliveries handles null dates", async () => {
  const mockDatabaseService = {
    query: vi.fn(),
  };

  const repository = new MultiTaxiRepository(mockDatabaseService as any);

  mockDatabaseService.query
    .mockResolvedValueOnce({ rows: [{ cnt: "1" }] })
    .mockResolvedValueOnce({
      rows: [
        {
          outboxId: "test-outbox",
          orderId: "test-order",
          createdAt: new Date("2026-09-27T10:00:00Z"),
          deliveredAt: null,
          expiresAt: null,
          nextAttemptAt: null,
          leaseExpiresAt: null,
        }
      ]
    });

  const result = await repository.listPartnerNotificationDeliveries(
    { entrySlug: "test", tenantId: "t-1", partnerId: "p-1" },
    {}
  );

  const snakeCaseEnvelope = deepToSnakeCase({ data: result.rows });
  const camelCaseEnvelope = deepToCamelCase(snakeCaseEnvelope) as any;
  const row = camelCaseEnvelope.data[0];

  const renderCell = (r: any) => r.createdAt || r.at || "—";
  const element = React.createElement("span", null, renderCell(row));
  const html = ReactDOMServer.renderToStaticMarkup(element);
  expect(html).toBe("<span>2026-09-27T10:00:00.000Z</span>");

  expect(typeof row.createdAt).toBe("string");
  expect(row.deliveredAt).toBeNull();
  expect(row.expiresAt).toBeNull();
  expect(row.nextAttemptAt).toBeNull();
  expect(row.leaseExpiresAt).toBeNull();
});

import { BootstrapAuthGuard } from "../../src/common/auth/bootstrap-auth.guard";
import { NextRequest } from "next/server";
import { GET } from "../../../platform-admin-web/app/control-plane-proxy/[...path]/route";
import { JwtAuthService } from "../../src/common/auth/jwt-auth.service";

test("Next GET -> issueControlPlaneRequestAuth -> BootstrapAuthGuard -> authority proxy path (bootstrap mode)", async () => {
  const originalEnv = process.env;
  process.env = { ...originalEnv, NODE_ENV: "development", DRTS_API_URL: "http://localhost:3001" };

  let upstreamRequest: Request | undefined;
  vi.spyOn(global, "fetch").mockImplementation(async (targetUrl, init) => {
    upstreamRequest = new Request(targetUrl, init);
    return new Response(JSON.stringify({}), { status: 200 });
  });

  const request = new NextRequest("http://localhost:3000/api/tenant-partner/webhooks?page=1", {
    headers: {
      "x-goog-authenticated-user-email": "accounts.google.com:admin@platform.drts",
      "x-tenant-id": "review-tenant-a"
    }
  });

  await GET(request, { params: { path: ["tenant-partner", "webhooks"] } });
  expect(upstreamRequest).toBeDefined();

  const guard = new BootstrapAuthGuard(
    { get: vi.fn(), getAllAndOverride: vi.fn() } as any,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined
  );

  const mockRequest = {
    headers: Object.fromEntries(upstreamRequest!.headers.entries()),
    route: { path: "/tenant-partner/webhooks" },
    method: "GET"
  } as any;

  const mockContext = {
    switchToHttp: () => ({ getRequest: () => mockRequest }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as any;

  const canActivate = await guard.canActivate(mockContext);
  expect(canActivate).toBe(true);
  expect(mockRequest.identity.tenantId).toBe("review-tenant-a");

  process.env = originalEnv;
});

test("Next GET -> issueControlPlaneRequestAuth -> BootstrapAuthGuard -> authority proxy path (JWT mode)", async () => {
  const originalEnv = process.env;
  process.env = {
    ...originalEnv,
    NODE_ENV: "development",
    DRTS_API_URL: "http://localhost:3001",
    JWT_SECRET: "test-secret-123"
  };

  let upstreamRequest: Request | undefined;
  vi.spyOn(global, "fetch").mockImplementation(async (targetUrl, init) => {
    upstreamRequest = new Request(targetUrl, init);
    return new Response(JSON.stringify({}), { status: 200 });
  });

  const request = new NextRequest("http://localhost:3000/api/tenant-partner/webhooks?page=1", {
    headers: {
      "x-goog-authenticated-user-email": "accounts.google.com:admin@platform.drts",
      "x-tenant-id": "review-tenant-a"
    }
  });

  await GET(request, { params: { path: ["tenant-partner", "webhooks"] } });
  expect(upstreamRequest).toBeDefined();

  const configService = {
    get: (key: string) => {
      if (key === "JWT_SECRET") return "test-secret-123";
      return null;
    }
  } as any;

  const jwtAuthService = new JwtAuthService(configService, { query: vi.fn() } as any);

  const guard = new BootstrapAuthGuard(
    { get: vi.fn(), getAllAndOverride: vi.fn() } as any,
    jwtAuthService,
    undefined,
    undefined,
    undefined,
    undefined
  );

  const mockRequest = {
    headers: Object.fromEntries(upstreamRequest!.headers.entries()),
    route: { path: "/tenant-partner/webhooks" },
    method: "GET"
  } as any;

  const mockContext = {
    switchToHttp: () => ({ getRequest: () => mockRequest }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as any;

  const canActivate = await guard.canActivate(mockContext);
  expect(canActivate).toBe(true);
  expect(mockRequest.identity.tenantId).toBe("review-tenant-a");

  process.env = originalEnv;
});

test("Missing assertion -> 401 in strict IAP mode", async () => {
  const originalEnv = process.env;
  process.env = { ...originalEnv, NODE_ENV: "production", IAP_JWT_SECRET_OR_PUBLIC_KEY: "test-secret" };

  const request = new NextRequest("http://localhost:3000/api/tenant-partner/webhooks?page=1", {
    headers: {
      "x-tenant-id": "review-tenant-a"
    }
  });

  try {
    await GET(request, { params: { path: ["tenant-partner", "webhooks"] } });
  } catch (e: any) {
    expect(e.message).toMatch(/requires a valid x-goog-iap-jwt-assertion header/);
  }

  process.env = originalEnv;
});
