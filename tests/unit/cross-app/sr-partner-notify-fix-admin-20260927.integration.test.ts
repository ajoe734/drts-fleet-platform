import { createRequire } from "node:module";
import { expect, test, vi } from "vitest";
import { MultiTaxiRepository } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.repository";
import { deepToSnakeCase } from "../../../apps/api/src/common/snake-case.interceptor";
import * as React from "react";
import * as ReactDOMServer from "react-dom/server";

import { ApiClient } from "../../../packages/api-client/src";
import {
  toApiSuccessEnvelope,
  toApiListData,
} from "../../../apps/api/src/common/api-envelope";

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

import { BootstrapAuthGuard } from "../../../apps/api/src/common/auth/bootstrap-auth.guard";
import { StepUpProofService } from "../../../apps/api/src/common/auth/step-up-proof.service";
import { NextRequest } from "next/server";
import { GET } from "../../../apps/platform-admin-web/app/control-plane-proxy/[...path]/route";
import { JwtAuthService } from "../../../apps/api/src/common/auth/jwt-auth.service";
// Resolve API-owned dependencies from their workspace package.
const apiRequire = createRequire(
  new URL("../../../apps/api/package.json", import.meta.url),
);
const { Reflector } = apiRequire("@nestjs/core");
import { TenantPartnerController } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.controller";
import { TenantPartnerService } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { IAPSubjectAdapter } from "../../../apps/api/src/modules/auth/iap-subject.adapter";

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

  // Assert controller consumes the emitted header correctly
  const mockService = { listWebhookEndpoints: vi.fn().mockReturnValue([]) };
  const controller = new TenantPartnerController(
    mockService as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  controller.listWebhookEndpoints(
    mockRequest.identity,
    mockRequest.headers["x-tenant-id"],
    "req-1",
  );

  expect(mockService.listWebhookEndpoints).toHaveBeenCalledWith(
    "review-tenant-a",
    mockRequest.identity,
  );

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

  // Assert controller consumes the emitted header correctly
  const mockService = { listWebhookEndpoints: vi.fn().mockReturnValue([]) };
  const controller = new TenantPartnerController(
    mockService as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  controller.listWebhookEndpoints(
    mockRequest.identity,
    mockRequest.headers["x-tenant-id"],
    "req-1",
  );

  expect(mockService.listWebhookEndpoints).toHaveBeenCalledWith(
    "review-tenant-a",
    mockRequest.identity,
  );

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

  let upstreamRequest: Request | undefined;
  vi.spyOn(global, "fetch").mockImplementation(async (targetUrl, init) => {
    upstreamRequest = new Request(targetUrl, init);
    return new Response(JSON.stringify({}), { status: 200 });
  });

  const response = await GET(request, {
    params: Promise.resolve({ path: ["tenant", "webhooks"] }),
  } as any);

  expect(response.status).toBe(401);
  expect(upstreamRequest).toBeUndefined(); // assert zero upstream effects
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

  let upstreamRequest: Request | undefined;
  vi.spyOn(global, "fetch").mockImplementation(async (targetUrl, init) => {
    upstreamRequest = new Request(targetUrl, init);
    return new Response(JSON.stringify({}), { status: 200 });
  });

  const response = await GET(request, {
    params: Promise.resolve({ path: ["tenant", "webhooks"] }),
  } as any);

  expect(response.status).toBe(401);
  expect(upstreamRequest).toBeUndefined(); // assert zero upstream effects
  const data = await response.json();
  expect(data.error.code).toBe("IAP_ASSERTION_INVALID");
  expect(data.error.message).toMatch(/jwt malformed/);

  process.env = originalEnv;
});

import jwt from "jsonwebtoken";

test("Next GET valid signed IAP assertion -> Guard -> Controller delegates x-tenant-id", async () => {
  const originalEnv = process.env;
  process.env = {
    ...originalEnv,
    NODE_ENV: "production",
    JWT_SECRET: "test-secret-123",
    IAP_JWT_SECRET_OR_PUBLIC_KEY: "test-secret",
    IAP_EXPECTED_AUDIENCE: "test-aud",
    DRTS_API_URL: "http://localhost:3001",
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

  // Guard execution
  const mockIdentityRepo = {
    findPrincipalBySubject: vi.fn().mockResolvedValue({
      principalId: "user-1",
      subject: "accounts.google.com:admin@platform.drts",
      status: "active",
      updatedAt: new Date().toISOString(),
    }),
    findMembershipsByPrincipalId: vi.fn().mockResolvedValue([
      {
        membershipId: "mem-1",
        realm: "platform",
        status: "active",
        updatedAt: new Date().toISOString(),
      },
    ]),
    findRoleBindingsByMembershipId: vi.fn().mockResolvedValue([
      {
        roleCode: "platform_admin",
        updatedAt: new Date().toISOString(),
        validFrom: null,
        validTo: null,
      },
    ]),
  } as any;
  const iapAdapter = new IAPSubjectAdapter(mockIdentityRepo);

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
    undefined, // driverDeviceSessionService
    undefined, // auditNotificationService
    iapAdapter,
    undefined, // securityEventsService
    undefined, // stepUpProofService
  );

  const mockRequest = {
    headers: Object.fromEntries(upstreamRequest!.headers.entries()),
    route: { path: "tenant/webhooks" },
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

  // IAP adapter deliberately sets tenantId to null for the identity
  expect(mockRequest.identity.tenantId).toBeNull();

  // The controller must rely on the x-tenant-id header instead
  const mockService = { listWebhookEndpoints: vi.fn().mockReturnValue([]) };
  const controller = new TenantPartnerController(
    mockService as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  controller.listWebhookEndpoints(
    mockRequest.identity,
    mockRequest.headers["x-tenant-id"],
    "req-3",
  );

  expect(mockService.listWebhookEndpoints).toHaveBeenCalledWith(
    "review-tenant-a",
    mockRequest.identity,
  );

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

  let upstreamRequest: Request | undefined;
  vi.spyOn(global, "fetch").mockImplementation(async (targetUrl, init) => {
    upstreamRequest = new Request(targetUrl, init);
    return new Response(JSON.stringify({}), { status: 200 });
  });

  const response = await GET(request, {
    params: Promise.resolve({ path: ["tenant", "webhooks"] }),
  } as any);

  expect(response.status).toBe(403);
  expect(upstreamRequest).toBeUndefined(); // assert zero upstream effects
  const data = await response.json();
  expect(data.error.code).toBe("IAP_SUBJECT_FORBIDDEN");

  process.env = originalEnv;
});

import { POST } from "../../../apps/platform-admin-web/app/control-plane-proxy/[...path]/route";

test("Next POST valid IAP assertion -> Guard -> Controller mutation allowed with step-up proof", async () => {
  const originalEnv = process.env;
  process.env = {
    ...originalEnv,
    NODE_ENV: "production",
    JWT_SECRET: "test-secret-123",
    IAP_JWT_SECRET_OR_PUBLIC_KEY: "test-secret",
    IAP_EXPECTED_AUDIENCE: "test-aud",
    DRTS_API_URL: "http://localhost:3001",
  };

  const authTime = Math.floor(Date.now() / 1000);
  const token = jwt.sign(
    {
      iss: "https://cloud.google.com/iap",
      aud: "test-aud",
      sub: "accounts.google.com:admin@platform.drts",
      email: "admin@platform.drts",
      gcp_ia_groups: ["platform-admins@platform.drts"],
      acr: "aal2", // gives verified_iap_workforce AMR for step up
      auth_time: authTime,
    },
    "test-secret",
    { algorithm: "HS256" },
  );

  const realStepUpProofService = new StepUpProofService({
    recordEvent: vi.fn(),
  } as any);
  const proof = realStepUpProofService.createProof(
    {
      actorId: "user-1",
      principalId: "user-1",
      realm: "platform",
      sessionId: "iap:mem-1", // corresponds to membershipId
      authTime: new Date(authTime * 1000).toISOString(),
      amr: ["verified_iap_workforce"],
      acr: "aal2",
    } as any,
    { actionId: "tenant:webhooks:create" } as any,
  );

  const commandFixture = {
    url: "https://example.com/webhook",
    secret: "whsec_12345",
    events: ["delivery.status.changed"],
  };

  const request = new NextRequest("http://localhost:3000/api/tenant/webhooks", {
    method: "POST",
    headers: {
      "x-tenant-id": "review-tenant-a",
      "x-goog-iap-jwt-assertion": token,
      "x-drts-step-up-reference": proof.stepUpReference!,
      "content-type": "application/json",
    },
    body: JSON.stringify(commandFixture),
  });

  let upstreamRequest: Request | undefined;
  const fetchSpy = vi
    .spyOn(global, "fetch")
    .mockImplementation(async (targetUrl, init) => {
      upstreamRequest = new Request(targetUrl, init);
      return new Response(JSON.stringify({}), { status: 200 });
    });

  try {
    const response = await POST(request, {
      params: Promise.resolve({ path: ["tenant", "webhooks"] }),
    } as any);

    expect(response.status).toBe(200);
    expect(upstreamRequest).toBeDefined();

    // Guard execution
    const mockIdentityRepo = {
      findPrincipalBySubject: vi.fn().mockResolvedValue({
        principalId: "user-1",
        subject: "accounts.google.com:admin@platform.drts",
        status: "active",
        updatedAt: new Date().toISOString(),
      }),
      findMembershipsByPrincipalId: vi.fn().mockResolvedValue([
        {
          membershipId: "mem-1",
          realm: "platform",
          status: "active",
          updatedAt: new Date().toISOString(),
        },
      ]),
      findRoleBindingsByMembershipId: vi.fn().mockResolvedValue([
        {
          roleCode: "platform_admin",
          updatedAt: new Date().toISOString(),
          validFrom: null,
          validTo: null,
        },
      ]),
    } as any;
    const iapAdapter = new IAPSubjectAdapter(mockIdentityRepo);

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
      { recordEvent: vi.fn() } as any,
      iapAdapter,
      undefined,
      realStepUpProofService,
    );

    const upstreamBodyStr = await upstreamRequest!.text();
    const upstreamParsedBody = JSON.parse(upstreamBodyStr);

    const mockRequest = {
      headers: Object.fromEntries(upstreamRequest!.headers.entries()),
      route: { path: "tenant/webhooks" },
      url: "/tenant/webhooks",
      originalUrl: "/tenant/webhooks",
      method: "POST",
      body: upstreamParsedBody,
    } as any;

    const mockContext = {
      switchToHttp: () => ({ getRequest: () => mockRequest }),
      getHandler: () => TenantPartnerController.prototype.createWebhookEndpoint,
      getClass: () => TenantPartnerController,
    } as any;

    const mockService = { createWebhookEndpoint: vi.fn().mockReturnValue({}) };
    const controller = new TenantPartnerController(
      mockService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const canActivate = await guard.canActivate(mockContext);
    expect(canActivate).toBe(true);

    controller.createWebhookEndpoint(
      mockRequest.body as any,
      mockRequest.headers["x-tenant-id"],
      "req-5",
    );
    expect(mockService.createWebhookEndpoint).toHaveBeenCalledWith(
      "review-tenant-a",
      commandFixture,
      "req-5",
    );
  } finally {
    process.env = originalEnv;
    fetchSpy.mockRestore();
  }
});

test("Next POST valid IAP assertion without step-up proof -> Guard -> Controller mutation denied, zero effects", async () => {
  const originalEnv = process.env;
  process.env = {
    ...originalEnv,
    NODE_ENV: "production",
    JWT_SECRET: "test-secret-123",
    IAP_JWT_SECRET_OR_PUBLIC_KEY: "test-secret",
    IAP_EXPECTED_AUDIENCE: "test-aud",
    DRTS_API_URL: "http://localhost:3001",
  };

  // Missing acr and auth_time claim means no step up proof
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

  const request = new NextRequest("http://localhost:3000/api/tenant/webhooks", {
    method: "POST",
    headers: {
      "x-tenant-id": "review-tenant-a",
      "x-goog-iap-jwt-assertion": token,
    },
  });

  let upstreamRequest: Request | undefined;
  const fetchSpy = vi
    .spyOn(global, "fetch")
    .mockImplementation(async (targetUrl, init) => {
      upstreamRequest = new Request(targetUrl, init);
      return new Response(JSON.stringify({}), { status: 200 });
    });

  try {
    const response = await POST(request, {
      params: Promise.resolve({ path: ["tenant", "webhooks"] }),
    } as any);

    expect(response.status).toBe(200);

    const mockIdentityRepo = {
      findPrincipalBySubject: vi.fn().mockResolvedValue({
        principalId: "user-1",
        subject: "accounts.google.com:admin@platform.drts",
        status: "active",
        updatedAt: new Date().toISOString(),
      }),
      findMembershipsByPrincipalId: vi.fn().mockResolvedValue([
        {
          membershipId: "mem-1",
          realm: "platform",
          status: "active",
          updatedAt: new Date().toISOString(),
        },
      ]),
      findRoleBindingsByMembershipId: vi.fn().mockResolvedValue([
        {
          roleCode: "platform_admin",
          updatedAt: new Date().toISOString(),
          validFrom: null,
          validTo: null,
        },
      ]),
    } as any;
    const iapAdapter = new IAPSubjectAdapter(mockIdentityRepo);

    const configService = {
      get: (key: string) => {
        if (key === "JWT_SECRET") return "test-secret-123";
        return null;
      },
    } as any;
    const jwtAuthService = new JwtAuthService(configService, {
      query: vi.fn(),
    } as any);

    const realStepUpProofService = new StepUpProofService({
      recordEvent: vi.fn(),
    } as any);

    const guard = new BootstrapAuthGuard(
      new Reflector(),
      jwtAuthService,
      undefined,
      { recordEvent: vi.fn() } as any,
      iapAdapter,
      undefined,
      realStepUpProofService,
    );

    const mockRequest = {
      headers: Object.fromEntries(upstreamRequest!.headers.entries()),
      route: { path: "tenant/webhooks" },
      url: "/tenant/webhooks",
      originalUrl: "/tenant/webhooks",
      method: "POST",
    } as any;

    const mockContext = {
      switchToHttp: () => ({ getRequest: () => mockRequest }),
      getHandler: () => TenantPartnerController.prototype.createWebhookEndpoint,
      getClass: () => TenantPartnerController,
    } as any;

    const mockService = { createWebhookEndpoint: vi.fn().mockReturnValue({}) };
    const controller = new TenantPartnerController(
      mockService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    let err: any;
    try {
      if (await guard.canActivate(mockContext)) {
        controller.createWebhookEndpoint(
          {
            url: "https://example.com/webhook",
            secret: "whsec_1",
            events: [],
          } as any,
          mockRequest.headers["x-tenant-id"],
          "req-x",
        );
      }
    } catch (e: any) {
      err = e;
    }

    expect(err).toBeDefined();
    expect(err.code).toBe("STEP_UP_REQUIRED");

    expect(mockService.createWebhookEndpoint).not.toHaveBeenCalled(); // assert zero mutation effects when denied
  } finally {
    process.env = originalEnv;
    fetchSpy.mockRestore();
  }
});

// R2b: Missing tenant flow
test("Next GET missing tenant -> Guard -> Controller delegates missing tenant", async () => {
  const originalEnv = process.env;
  process.env = {
    ...originalEnv,
    NODE_ENV: "production",
    JWT_SECRET: "test-secret-123",
    IAP_JWT_SECRET_OR_PUBLIC_KEY: "test-secret",
    IAP_EXPECTED_AUDIENCE: "test-aud",
    DRTS_API_URL: "http://localhost:3001",
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

  const request = new NextRequest("http://localhost:3000/api/tenant/webhooks", {
    headers: {
      "x-goog-iap-jwt-assertion": token,
      // no x-tenant-id
    },
  });

  let upstreamRequest: Request | undefined;
  const fetchSpy = vi
    .spyOn(global, "fetch")
    .mockImplementation(async (targetUrl, init) => {
      upstreamRequest = new Request(targetUrl, init);
      return new Response(JSON.stringify({}), { status: 200 });
    });

  try {
    await GET(request, {
      params: Promise.resolve({ path: ["tenant", "webhooks"] }),
    } as any);

    const mockIdentityRepo = {
      findPrincipalBySubject: vi.fn().mockResolvedValue({
        principalId: "user-1",
        subject: "accounts.google.com:admin@platform.drts",
        status: "active",
      }),
      findMembershipsByPrincipalId: vi.fn().mockResolvedValue([
        {
          membershipId: "mem-1",
          realm: "platform",
          status: "active",
        },
      ]),
      findRoleBindingsByMembershipId: vi.fn().mockResolvedValue([
        {
          roleCode: "platform_admin",
        },
      ]),
    } as any;

    const iapAdapter = new IAPSubjectAdapter(mockIdentityRepo);
    const jwtAuthService = new JwtAuthService(
      { get: () => "test-secret-123" } as any,
      { query: vi.fn() } as any,
    );
    const guard = new BootstrapAuthGuard(
      new Reflector(),
      jwtAuthService,
      undefined,
      { recordAuditLog: vi.fn() } as any,
      iapAdapter,
    );

    const mockRequest = {
      headers: Object.fromEntries(upstreamRequest!.headers.entries()),
      route: { path: "tenant/webhooks" },
      url: "/tenant/webhooks",
      originalUrl: "/tenant/webhooks",
      method: "GET",
    } as any;

    const mockContext = {
      switchToHttp: () => ({ getRequest: () => mockRequest }),
      getHandler: () => TenantPartnerController.prototype.listWebhookEndpoints,
      getClass: () => TenantPartnerController,
    } as any;

    const canActivate = await guard.canActivate(mockContext);
    expect(canActivate).toBe(true);

    const mockService = { listWebhookEndpoints: vi.fn().mockReturnValue([]) };
    const controller = new TenantPartnerController(
      mockService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    // Controller delegates undefined tenantId because it was missing
    try {
      controller.listWebhookEndpoints(
        mockRequest.identity,
        mockRequest.headers["x-tenant-id"],
        "req-9",
      );
      expect.fail();
    } catch (e: any) {
      expect(e.code).toBe("TENANT_ID_REQUIRED");
      expect(mockService.listWebhookEndpoints).not.toHaveBeenCalled();
    }
  } finally {
    process.env = originalEnv;
    fetchSpy.mockRestore();
  }
});

// R2b: Forged headers dropped, and unauthorized identity rejected
test("Next GET forged headers and unauthorized identity -> Guard drops forged server authority -> Controller not called", async () => {
  const originalEnv = process.env;
  process.env = {
    ...originalEnv,
    NODE_ENV: "production",
    JWT_SECRET: "test-secret-123",
    IAP_JWT_SECRET_OR_PUBLIC_KEY: "test-secret",
    IAP_EXPECTED_AUDIENCE: "test-aud",
    DRTS_API_URL: "http://localhost:3001",
  };

  const token = jwt.sign(
    {
      iss: "https://cloud.google.com/iap",
      aud: "test-aud",
      sub: "accounts.google.com:unauthorized@tenant-b.drts", // Unauthorized user
      email: "unauthorized@tenant-b.drts",
      gcp_ia_groups: ["platform-admins@platform.drts"],
    },
    "test-secret",
    { algorithm: "HS256" },
  );

  const request = new NextRequest("http://localhost:3000/api/tenant/webhooks", {
    headers: {
      "x-goog-iap-jwt-assertion": token,
      "x-tenant-id": "review-tenant-a",
      "x-actor-id": "forged-id", // Forged
      "x-actor-type": "forged-type", // Forged
      "x-realm": "platform", // Forged
      "x-scopes": "superuser", // Forged
      "x-drts-authorization": "Bearer forged-token", // Forged inner bearer
    },
  });

  let upstreamRequest: Request | undefined;
  const fetchSpy = vi
    .spyOn(global, "fetch")
    .mockImplementation(async (targetUrl, init) => {
      upstreamRequest = new Request(targetUrl, init);
      return new Response(JSON.stringify({}), { status: 200 });
    });

  try {
    await GET(request, {
      params: Promise.resolve({ path: ["tenant", "webhooks"] }),
    } as any);

    // Assert proxy did not forward forged x-actor-id, x-realm, x-scopes directly in a way that overrides server authority
    // The upstreamRequest will have a x-drts-authorization header from issueControlPlaneRequestAuth, NOT the forged one
    expect(upstreamRequest!.headers.get("x-drts-authorization")).not.toBe(
      "Bearer forged-token",
    );

    const mockIdentityRepo = {
      findPrincipalBySubject: vi.fn().mockResolvedValue(null), // User not in DB with platform realm
      findPrincipalsByEmail: vi.fn().mockResolvedValue([]),
    } as any;

    const iapAdapter = new IAPSubjectAdapter(mockIdentityRepo);
    const jwtAuthService = new JwtAuthService(
      { get: () => "test-secret-123" } as any,
      { query: vi.fn() } as any,
    );
    const guard = new BootstrapAuthGuard(
      new Reflector(),
      jwtAuthService,
      undefined,
      { recordAuditLog: vi.fn() } as any,
      iapAdapter,
    );

    const mockRequest = {
      headers: Object.fromEntries(upstreamRequest!.headers.entries()),
      route: { path: "tenant/webhooks" },
      url: "/tenant/webhooks",
      originalUrl: "/tenant/webhooks",
      method: "GET",
    } as any;

    const mockContext = {
      switchToHttp: () => ({ getRequest: () => mockRequest }),
      getHandler: () => TenantPartnerController.prototype.listWebhookEndpoints,
      getClass: () => TenantPartnerController,
    } as any;

    const mockService = { listWebhookEndpoints: vi.fn() };
    const controller = new TenantPartnerController(
      mockService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    let err: any;
    try {
      if (await guard.canActivate(mockContext)) {
        controller.listWebhookEndpoints(
          mockRequest.identity,
          mockRequest.headers["x-tenant-id"],
          "req-forged",
        );
      }
    } catch (e: any) {
      err = e;
    }

    expect(err).toBeDefined();
    expect(err.status).toBe(403);
    expect(err.code).toBe("IAP_WORKFORCE_USER_INACTIVE");

    expect(mockService.listWebhookEndpoints).not.toHaveBeenCalled();
  } finally {
    process.env = originalEnv;
    fetchSpy.mockRestore();
  }
});

// R2b: Selecting A never returns B's data
test("Next GET cross-tenant selection boundary -> selecting A isolates from B", async () => {
  const originalEnv = process.env;
  process.env = {
    ...originalEnv,
    NODE_ENV: "production",
    JWT_SECRET: "test-secret-123",
    IAP_JWT_SECRET_OR_PUBLIC_KEY: "test-secret",
    IAP_EXPECTED_AUDIENCE: "test-aud",
    DRTS_API_URL: "http://localhost:3001",
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

  const request = new NextRequest("http://localhost:3000/api/tenant/webhooks", {
    headers: {
      "x-goog-iap-jwt-assertion": token,
      "x-tenant-id": "review-tenant-a",
    },
  });

  let upstreamRequest: Request | undefined;
  const fetchSpy = vi
    .spyOn(global, "fetch")
    .mockImplementation(async (targetUrl, init) => {
      upstreamRequest = new Request(targetUrl, init);
      return new Response(JSON.stringify({}), { status: 200 });
    });

  try {
    await GET(request, {
      params: Promise.resolve({ path: ["tenant", "webhooks"] }),
    } as any);

    const mockIdentityRepo = {
      findPrincipalBySubject: vi.fn().mockResolvedValue({
        principalId: "user-1",
        subject: "accounts.google.com:admin@platform.drts",
        status: "active",
      }),
      findMembershipsByPrincipalId: vi.fn().mockResolvedValue([
        {
          membershipId: "mem-1",
          realm: "platform",
          status: "active",
        },
      ]),
      findRoleBindingsByMembershipId: vi.fn().mockResolvedValue([
        {
          roleCode: "platform_admin",
        },
      ]),
    } as any;

    const iapAdapter = new IAPSubjectAdapter(mockIdentityRepo);
    const jwtAuthService = new JwtAuthService(
      { get: () => "test-secret-123" } as any,
      { query: vi.fn() } as any,
    );
    const guard = new BootstrapAuthGuard(
      new Reflector(),
      jwtAuthService,
      undefined,
      { recordAuditLog: vi.fn() } as any,
      iapAdapter,
    );

    const mockRequest = {
      headers: Object.fromEntries(upstreamRequest!.headers.entries()),
      route: { path: "tenant/webhooks" },
      url: "/tenant/webhooks",
      originalUrl: "/tenant/webhooks",
      method: "GET",
    } as any;

    const mockContext = {
      switchToHttp: () => ({ getRequest: () => mockRequest }),
      getHandler: () => TenantPartnerController.prototype.listWebhookEndpoints,
      getClass: () => TenantPartnerController,
    } as any;

    await guard.canActivate(mockContext);

    const realService = new TenantPartnerService({
      recordAuditLog: vi.fn(),
      recordSecurityEvent: vi.fn(),
    } as any);
    realService.createWebhookEndpoint(
      "review-tenant-a",
      {
        url: "https://a.com/webhook",
        secret: "whsec_a",
        events: ["delivery.status.changed"],
      },
      "req-1",
    );
    realService.createWebhookEndpoint(
      "review-tenant-b",
      {
        url: "https://b.com/webhook",
        secret: "whsec_b",
        events: ["delivery.status.changed"],
      },
      "req-2",
    );

    const controller = new TenantPartnerController(
      realService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const result = controller.listWebhookEndpoints(
      mockRequest.identity,
      mockRequest.headers["x-tenant-id"],
      "req-10",
    );

    // Assert boundary: B's data is never returned because tenantId is strictly "review-tenant-a"
    expect(result.data).toBeDefined();
    expect(result.data.items).toHaveLength(1);
    expect(result.data.items[0]?.url).toBe("https://a.com/webhook");
    expect(
      result.data.items.some((i: any) => i.url === "https://b.com/webhook"),
    ).toBe(false);

    // legitimate selection of B through the same proxy/guard/controller chain
    const requestB = new NextRequest(
      "http://localhost:3000/api/tenant/webhooks",
      {
        headers: {
          "x-goog-iap-jwt-assertion": token,
          "x-tenant-id": "review-tenant-b",
        },
      },
    );

    await GET(requestB, {
      params: Promise.resolve({ path: ["tenant", "webhooks"] }),
    } as any);

    const mockRequestB = {
      headers: Object.fromEntries(upstreamRequest!.headers.entries()),
      route: { path: "tenant/webhooks" },
      url: "/tenant/webhooks",
      originalUrl: "/tenant/webhooks",
      method: "GET",
    } as any;

    const mockContextB = {
      switchToHttp: () => ({ getRequest: () => mockRequestB }),
      getHandler: () => TenantPartnerController.prototype.listWebhookEndpoints,
      getClass: () => TenantPartnerController,
    } as any;

    await guard.canActivate(mockContextB);

    const resultB = controller.listWebhookEndpoints(
      mockRequestB.identity,
      mockRequestB.headers["x-tenant-id"],
      "req-11",
    );

    // Assert boundary: only B's data is returned
    expect(resultB.data).toBeDefined();
    expect(resultB.data.items).toHaveLength(1);
    expect(resultB.data.items[0]?.url).toBe("https://b.com/webhook");
    expect(
      resultB.data.items.some((i: any) => i.url === "https://a.com/webhook"),
    ).toBe(false);
  } finally {
    process.env = originalEnv;
    fetchSpy.mockRestore();
  }
});
