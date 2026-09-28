import { expect, test, vi } from "vitest";
import { MultiTaxiRepository } from "../../src/modules/multi-taxi/multi-taxi.repository";
import { deepToSnakeCase } from "../../src/common/snake-case.interceptor";
import * as React from "react";
import * as ReactDOMServer from "react-dom/server";

import { ApiClient } from "../../../../packages/api-client/src";
import {
  toApiSuccessEnvelope,
  toApiListData,
} from "../../src/common/api-envelope";

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
        },
      ],
    });

  const result = await repository.listPartnerNotificationDeliveries(
    { entrySlug: "test", tenantId: "t-1", partnerId: "p-1" },
    {},
  );

  // Controller success/list envelope
  const envelope = toApiSuccessEnvelope(
    toApiListData(result.rows, {
      page: 1,
      pageSize: 50,
      totalItems: result.total,
      totalPages: 1,
    }),
    "test-req-id",
  );

  // NestJS interceptor
  const snakeCaseEnvelope = deepToSnakeCase(envelope);

  // API client wire conversion
  vi.spyOn(global, "fetch").mockResolvedValueOnce(
    new Response(JSON.stringify(snakeCaseEnvelope), { status: 200 }),
  );
  const client = new ApiClient({ baseUrl: "http://localhost" });
  const clientResult = await client.listPartnerNotificationDeliveries("test");
  const row = clientResult.items[0] as any;

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
        },
      ],
    });

  const result = await repository.listPartnerNotificationDeliveries(
    { entrySlug: "test", tenantId: "t-1", partnerId: "p-1" },
    {},
  );

  const envelope = toApiSuccessEnvelope(
    toApiListData(result.rows, {
      page: 1,
      pageSize: 50,
      totalItems: result.total,
      totalPages: 1,
    }),
    "test-req-id",
  );
  const snakeCaseEnvelope = deepToSnakeCase(envelope);

  vi.spyOn(global, "fetch").mockResolvedValueOnce(
    new Response(JSON.stringify(snakeCaseEnvelope), { status: 200 }),
  );
  const client = new ApiClient({ baseUrl: "http://localhost" });
  const clientResult = await client.listPartnerNotificationDeliveries("test");
  const row = clientResult.items[0] as any;

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
import { Reflector } from "@nestjs/core";
import { TenantPartnerController } from "../../src/modules/tenant-partner/tenant-partner.controller";

test("Next GET -> issueControlPlaneRequestAuth -> BootstrapAuthGuard -> authority proxy path (bootstrap mode)", async () => {
  const originalEnv = process.env;
  process.env = {
    ...originalEnv,
    NODE_ENV: "development",
    DRTS_API_URL: "http://localhost:3001",
  };

  let upstreamRequest: Request | undefined;
  vi.spyOn(global, "fetch").mockImplementation(async (targetUrl, init) => {
    upstreamRequest = new Request(targetUrl, init);
    return new Response(JSON.stringify({}), { status: 200 });
  });

  const request = new NextRequest(
    "http://localhost:3000/api/tenant/webhooks?page=1",
    {
      headers: {
        "x-goog-authenticated-user-email":
          "accounts.google.com:admin@platform.drts",
        "x-tenant-id": "review-tenant-a",
      },
    },
  );

  await GET(request, {
    params: Promise.resolve({ path: ["tenant", "webhooks"] }),
  } as any);
  expect(upstreamRequest).toBeDefined();

  const guard = new BootstrapAuthGuard(
    new Reflector(),
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
  );

  const mockRequest = {
    headers: Object.fromEntries(upstreamRequest!.headers.entries()),
    route: { path: "/tenant/webhooks" },
    url: "/tenant/webhooks?page=1",
    originalUrl: "/tenant/webhooks?page=1",
    method: "GET",
  } as any;

  const mockContext = {
    switchToHttp: () => ({ getRequest: () => mockRequest }),
    getHandler: () => TenantPartnerController.prototype.listWebhookEndpoints,
    getClass: () => TenantPartnerController,
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
    JWT_SECRET: "test-secret-123",
  };

  let upstreamRequest: Request | undefined;
  vi.spyOn(global, "fetch").mockImplementation(async (targetUrl, init) => {
    upstreamRequest = new Request(targetUrl, init);
    return new Response(JSON.stringify({}), { status: 200 });
  });

  const request = new NextRequest(
    "http://localhost:3000/api/tenant/webhooks?page=1",
    {
      headers: {
        "x-goog-authenticated-user-email":
          "accounts.google.com:admin@platform.drts",
        "x-tenant-id": "review-tenant-a",
      },
    },
  );

  await GET(request, {
    params: Promise.resolve({ path: ["tenant", "webhooks"] }),
  } as any);
  expect(upstreamRequest).toBeDefined();

  const configService = {
    get: (key: string) => {
      if (key === "JWT_SECRET") return "test-secret-123";
      return null;
    },
  } as any;

  const jwtAuthService = new JwtAuthService(configService, {
    query: vi.fn(),
  } as any);

  const guard = new BootstrapAuthGuard(
    new Reflector(),
    jwtAuthService,
    undefined,
    undefined,
    undefined,
    undefined,
  );

  const mockRequest = {
    headers: Object.fromEntries(upstreamRequest!.headers.entries()),
    route: { path: "/tenant/webhooks" },
    url: "/tenant/webhooks?page=1",
    originalUrl: "/tenant/webhooks?page=1",
    method: "GET",
  } as any;

  const mockContext = {
    switchToHttp: () => ({ getRequest: () => mockRequest }),
    getHandler: () => TenantPartnerController.prototype.listWebhookEndpoints,
    getClass: () => TenantPartnerController,
  } as any;

  const canActivate = await guard.canActivate(mockContext);
  expect(canActivate).toBe(true);
  expect(mockRequest.identity.tenantId).toBe("review-tenant-a");

  process.env = originalEnv;
});

test("Next GET missing assertion -> 401 in strict IAP mode", async () => {
  const originalEnv = process.env;
  process.env = {
    ...originalEnv,
    NODE_ENV: "production",
    IAP_JWT_SECRET_OR_PUBLIC_KEY: "test-secret",
  };

  const request = new NextRequest(
    "http://localhost:3000/api/tenant/webhooks?page=1",
    {
      headers: {
        "x-tenant-id": "review-tenant-a",
      },
    },
  );

  const response = await GET(request, {
    params: Promise.resolve({ path: ["tenant", "webhooks"] }),
  } as any);

  expect(response.status).toBe(401);
  const data = await response.json();
  expect(data.error.code).toBe("IAP_ASSERTION_INVALID");
  expect(data.error.message).toMatch(
    /requires a valid x-goog-iap-jwt-assertion header/,
  );

  process.env = originalEnv;
});

test("Next GET forged assertion -> 401 in strict IAP mode", async () => {
  const originalEnv = process.env;
  process.env = {
    ...originalEnv,
    NODE_ENV: "production",
    IAP_JWT_SECRET_OR_PUBLIC_KEY: "test-secret",
  };

  const request = new NextRequest(
    "http://localhost:3000/api/tenant/webhooks?page=1",
    {
      headers: {
        "x-tenant-id": "review-tenant-a",
        "x-goog-iap-jwt-assertion": "forged-token",
      },
    },
  );

  const response = await GET(request, {
    params: Promise.resolve({ path: ["tenant", "webhooks"] }),
  } as any);

  expect(response.status).toBe(401);
  const data = await response.json();
  expect(data.error.code).toBe("IAP_ASSERTION_INVALID");
  expect(data.error.message).toMatch(/jwt malformed/);

  process.env = originalEnv;
});

import jwt from "jsonwebtoken";

test("Next GET valid signed IAP assertion -> 200", async () => {
  const originalEnv = process.env;
  process.env = {
    ...originalEnv,
    NODE_ENV: "production",
    IAP_JWT_SECRET_OR_PUBLIC_KEY: "test-secret",
    IAP_EXPECTED_AUDIENCE: "test-aud",
  };

  const token = jwt.sign(
    {
      iss: "https://cloud.google.com/iap",
      aud: "test-aud",
      sub: "accounts.google.com:admin@platform.drts",
      email: "admin@platform.drts",
      gcp_ia_groups: ["platform-admins@platform.drts"],
    },
    "test-secret",
    { algorithm: "HS256" },
  );

  const request = new NextRequest(
    "http://localhost:3000/api/tenant/webhooks?page=1",
    {
      headers: {
        "x-tenant-id": "review-tenant-a",
        "x-goog-iap-jwt-assertion": token,
      },
    },
  );

  let upstreamRequest: Request | undefined;
  vi.spyOn(global, "fetch").mockImplementation(async (targetUrl, init) => {
    upstreamRequest = new Request(targetUrl, init);
    return new Response(JSON.stringify({}), { status: 200 });
  });

  const response = await GET(request, {
    params: Promise.resolve({ path: ["tenant", "webhooks"] }),
  } as any);

  expect(response.status).toBe(200);
  expect(upstreamRequest).toBeDefined();

  process.env = originalEnv;
});

test("Next GET unauthorized group -> 403 in strict IAP mode", async () => {
  const originalEnv = process.env;
  process.env = {
    ...originalEnv,
    NODE_ENV: "production",
    IAP_JWT_SECRET_OR_PUBLIC_KEY: "test-secret",
    IAP_EXPECTED_AUDIENCE: "test-aud",
  };

  const token = jwt.sign(
    {
      iss: "https://cloud.google.com/iap",
      aud: "test-aud",
      sub: "accounts.google.com:hacker@platform.drts",
      email: "hacker@platform.drts",
      gcp_ia_groups: ["some-random-group@drts"],
    },
    "test-secret",
    { algorithm: "HS256" },
  );

  const request = new NextRequest(
    "http://localhost:3000/api/tenant/webhooks?page=1",
    {
      headers: {
        "x-tenant-id": "review-tenant-a",
        "x-goog-iap-jwt-assertion": token,
      },
    },
  );

  const response = await GET(request, {
    params: Promise.resolve({ path: ["tenant", "webhooks"] }),
  } as any);

  expect(response.status).toBe(403);
  const data = await response.json();
  expect(data.error.code).toBe("IAP_SUBJECT_FORBIDDEN");

  process.env = originalEnv;
});

test("TenantPartnerController listWebhookEndpoints rejects missing tenant", async () => {
  const controller = new TenantPartnerController(
    { listWebhookEndpoints: vi.fn() } as any,
    {} as any,
  );
  try {
    controller.listWebhookEndpoints(null as any, undefined, "req-1");
    expect.fail("Should throw");
  } catch (e: any) {
    expect(e.code).toBe("TENANT_ID_REQUIRED");
  }
});

test("TenantPartnerController updateTenantNotifications mutation governance regression", async () => {
  const mockService = { updateTenantNotifications: vi.fn() };
  const controller = new TenantPartnerController(mockService as any, {} as any);
  try {
    controller.updateTenantNotifications(
      { enabled: true } as any,
      undefined, // missing tenant
      "req-1",
    );
    expect.fail("Should throw");
  } catch (e: any) {
    expect(e.code).toBe("TENANT_ID_REQUIRED");
  }
});
