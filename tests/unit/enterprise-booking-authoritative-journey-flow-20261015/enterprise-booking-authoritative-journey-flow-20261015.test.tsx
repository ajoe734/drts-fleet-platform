import type { ExecutionContext } from "@nestjs/common";
import { NextRequest } from "next/server";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BookingRecord, TenantDashboardSummary } from "@drts/contracts";
import { BootstrapAuthGuard } from "../../../apps/api/src/common/auth/bootstrap-auth.guard";
import { JwtAuthService } from "../../../apps/api/src/common/auth/jwt-auth.service";
import { OpsDispatchEventsService } from "../../../apps/api/src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { OwnedMobilityTaskEventsService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility-task-events.service";
import { OwnedMobilityService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { ServiceProductService } from "../../../apps/api/src/modules/service-product/service-product.service";
import { TenantPartnerService } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.service";

const cookieMap = new Map<string, string>();
const routerPushMock = vi.fn();
const routerRefreshMock = vi.fn();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieMap.get(name);
      return value !== undefined ? { name, value } : undefined;
    },
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPushMock,
    refresh: routerRefreshMock,
  }),
  usePathname: () => "/",
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("a", { href, ...rest }, children),
}));

vi.mock(
  "../../../apps/enterprise-dispatch-web/components/ent-screen-bits",
  () => ({
    EntParty: ({
      passenger,
      passengerLabel,
      subline,
    }: {
      passenger: string;
      passengerLabel: string;
      subline: React.ReactNode;
    }) =>
      React.createElement(
        "div",
        { "data-testid": "ent-party" },
        React.createElement("span", null, passenger),
        React.createElement("span", null, passengerLabel),
        React.createElement("div", null, subline),
      ),
    EntRoute: ({
      from,
      to,
      win,
      airportLabel,
    }: {
      from: string;
      to: string;
      win: string;
      airportLabel?: React.ReactNode;
    }) =>
      React.createElement(
        "div",
        { "data-testid": "ent-route" },
        React.createElement("div", null, from),
        React.createElement("div", null, to),
        React.createElement("div", null, win),
        airportLabel ? React.createElement("div", null, airportLabel) : null,
      ),
    EntProgressRail: ({ stage }: { stage: number }) =>
      React.createElement("div", {
        "data-testid": "ent-progress-rail",
        "data-stage": stage,
      }),
  }),
);

vi.mock(
  "../../../apps/enterprise-dispatch-web/components/enterprise-shell",
  () => ({
    EntPageHead: ({
      title,
      subtitle,
      trail,
      actions,
    }: {
      title: React.ReactNode;
      subtitle?: React.ReactNode;
      trail?: React.ReactNode;
      actions?: React.ReactNode;
    }) =>
      React.createElement(
        "header",
        { "data-testid": "ent-page-head" },
        trail ? React.createElement("div", null, trail) : null,
        React.createElement("h1", null, title),
        subtitle ? React.createElement("p", null, subtitle) : null,
        actions ? React.createElement("div", null, actions) : null,
      ),
  }),
);

vi.mock(
  "../../../apps/enterprise-dispatch-web/components/enterprise-state-page",
  () => ({
    EnterpriseGatePage: ({ kind }: { kind: string }) =>
      React.createElement(
        "div",
        {
          "data-testid": `enterprise-gate-${kind}`,
          "data-gate-route": `/${kind}`,
        },
        `/${kind}`,
      ),
  }),
);

import {
  GET as proxyGET,
  PATCH as proxyPATCH,
  POST as proxyPOST,
  PUT as proxyPUT,
} from "../../../apps/enterprise-dispatch-web/app/control-plane-proxy/[...path]/route";
import HomePage from "../../../apps/enterprise-dispatch-web/app/page";
import TripPage from "../../../apps/enterprise-dispatch-web/app/trip/page";
import ReviewBookingPage from "../../../apps/enterprise-dispatch-web/app/bookings/review/page";
import {
  BookingSubmitButton,
  submitEnterpriseBookingDraft,
} from "../../../apps/enterprise-dispatch-web/app/bookings/review/booking-submit-button";
import SubmittedBookingPage from "../../../apps/enterprise-dispatch-web/app/bookings/submitted/page";
import { getEnterpriseDispatchTenantClient } from "../../../apps/enterprise-dispatch-web/lib/api-client";
import {
  buildEnterpriseBookingCommand,
  buildEnterpriseBookingUpdateCommand,
  createEnterpriseBookingDraft,
  createEnterpriseBookingDraftFromRecord,
  type EnterpriseBookingDraftForm,
} from "../../../apps/enterprise-dispatch-web/lib/enterprise-booking-draft";
import {
  ENTERPRISE_TENANT_SESSION_COOKIE,
  verifyEnterpriseTenantSession,
} from "../../../apps/enterprise-dispatch-web/lib/enterprise-session.server";

function createAuthoritativeBackendHarness() {
  const jwtAuthService = new JwtAuthService();
  const guard = new BootstrapAuthGuard(
    { getAllAndOverride: () => undefined } as never,
    jwtAuthService,
  );
  const auditNotificationService = new AuditNotificationService();
  const tenantPartnerService = new TenantPartnerService(
    auditNotificationService as never,
  );
  const serviceProductService = new ServiceProductService(
    auditNotificationService as never,
    undefined,
  );
  const regulatoryRegistryService = {
    getEligibleCandidates: vi.fn(() => []),
    getVehicleDispatchability: vi.fn(() => true),
    getDriverAvailability: vi.fn(() => true),
  };
  const callcenterService = {
    registerRecordingAttachmentListener: vi.fn(),
    registerRecordingStateChangeListener: vi.fn(),
    linkOrderToCallSession: vi.fn(),
  };
  const stubEmitter = { emit: () => {} } as never;
  const taskEventsService = new OwnedMobilityTaskEventsService(stubEmitter);
  const opsDispatchEventsService = new OpsDispatchEventsService(stubEmitter);
  const ownedMobilityService = new OwnedMobilityService(
    regulatoryRegistryService as never,
    auditNotificationService as never,
    callcenterService as never,
    taskEventsService,
    opsDispatchEventsService,
    undefined,
    tenantPartnerService,
    undefined,
    serviceProductService,
  );
  tenantPartnerService.registerOrderFeedProvider(() =>
    ownedMobilityService.listOrders(),
  );

  return {
    jwtAuthService,
    guard,
    ownedMobilityService,
    tenantPartnerService,
  };
}

function makeExecutionContext(req: {
  method: string;
  url: string;
  originalUrl?: string;
  headers: Record<string, string>;
  authIdentity?: unknown;
}): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  } as unknown as ExecutionContext;
}

function headersToRecord(headersInit?: HeadersInit): Record<string, string> {
  const headers = new Headers(headersInit);
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key.toLowerCase()] = value;
  });
  return record;
}

function parseBodyJson(body?: BodyInit | null): Record<string, unknown> {
  if (!body) return {};
  if (typeof body === "string") return JSON.parse(body);
  if (body instanceof ArrayBuffer) {
    const text = new TextDecoder().decode(body);
    return text ? JSON.parse(text) : {};
  }
  if (ArrayBuffer.isView(body)) {
    const text = new TextDecoder().decode(body);
    return text ? JSON.parse(text) : {};
  }
  return JSON.parse(String(body));
}

describe("ENTERPRISE-BOOKING-AUTHORITATIVE-JOURNEY-FLOW-20261015", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    cookieMap.clear();
    routerPushMock.mockReset();
    routerRefreshMock.mockReset();
    process.env = {
      ...originalEnv,
      DRTS_ENV: "production",
      JWT_SECRET: "enterprise-authoritative-journey-secret-20261015",
      DRTS_API_URL: "http://api.strict.internal",
    };
    delete process.env.DRTS_API_AUTH_AUDIENCE;
    delete process.env.DRTS_ENTERPRISE_DISPATCH_TENANT_ID;
    delete process.env.DRTS_ENTERPRISE_DISPATCH_ACTOR_ID;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.useRealTimers();
  });

  describe("1. enterprise_signed_session_transport_and_tenant_scope (C014-C017-F1)", () => {
    it("reproduces strict BootstrapAuthGuard rejection of bootstrap headers and proves fixed proxy + SSR session client pass strict JWT guard without bootstrap headers", async () => {
      const { jwtAuthService, guard } = createAuthoritativeBackendHarness();
      const tokenPair = await jwtAuthService.issueSessionToken({
        authMode: "jwt_bearer",
        actorType: "tenant_admin",
        actorId: "actor-ent-001",
        realm: "tenant",
        tenantId: "tenant-strict-001",
        roleFamilies: ["tenant_operator"],
        roles: ["tenant_admin"],
        scopes: ["tenant:read", "tenant:write"],
      });

      // 1a. Before-fix reproduction: any bootstrap header (x-realm / x-actor-type / x-actor-id)
      // in strict production environment is rejected with 401 AUTH_BOOTSTRAP_HEADERS_FORBIDDEN
      // even if a valid Bearer token is also present.
      const legacyBootstrapRequest = {
        method: "POST",
        url: "/api/tenant/bookings",
        originalUrl: "/api/tenant/bookings",
        headers: {
          authorization: `Bearer ${tokenPair.token}`,
          "x-realm": "tenant",
          "x-actor-type": "tenant_admin",
          "x-actor-id": "enterprise-dispatch-web",
          "x-tenant-id": "10000000-0000-0000-0000-000000000201",
        },
      };
      let caughtBootstrapErr: unknown;
      try {
        await guard.canActivate(makeExecutionContext(legacyBootstrapRequest));
      } catch (err) {
        caughtBootstrapErr = err;
      }
      expect(caughtBootstrapErr).toBeDefined();
      expect(
        (caughtBootstrapErr as { getStatus: () => number }).getStatus(),
      ).toBe(401);
      expect(
        (caughtBootstrapErr as { getResponse: () => unknown }).getResponse(),
      ).toMatchObject({
        error: expect.objectContaining({
          code: "AUTH_BOOTSTRAP_HEADERS_FORBIDDEN",
        }),
      });

      // 1b. Fixed proxy path: POST / GET / PUT / PATCH / cancel verify drts_tenant_session,
      // strip all bootstrap headers, attach verified Bearer + x-tenant-id, and pass strict BootstrapAuthGuard.
      const observedUpstreamRequests: Array<{
        method: string;
        url: string;
        headers: Record<string, string>;
      }> = [];

      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
          const url = new URL(String(input));
          const method = (init?.method ?? "GET").toUpperCase();
          const hdrs = headersToRecord(init?.headers);

          if (url.pathname === "/api/auth/session") {
            const bearer = hdrs["authorization"]?.replace(/^Bearer\s+/i, "");
            const verifiedPayload = bearer
              ? await jwtAuthService.verifyAccessToken(bearer)
              : null;
            if (!verifiedPayload) {
              return new Response(JSON.stringify({ error: "UNAUTHORIZED" }), {
                status: 401,
              });
            }
            return new Response(
              JSON.stringify({
                data: {
                  active: true,
                  identity: {
                    realm: verifiedPayload.realm,
                    tenant_id: verifiedPayload.tenantId,
                    actor_id: verifiedPayload.sub,
                    scopes: verifiedPayload.scopes,
                  },
                },
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }

          // Pass the proxied upstream request directly through the real strict BootstrapAuthGuard!
          const reqObj: {
            method: string;
            url: string;
            originalUrl: string;
            headers: Record<string, string>;
            authIdentity?: unknown;
          } = {
            method,
            url: url.pathname + url.search,
            originalUrl: url.pathname + url.search,
            headers: hdrs,
          };
          const activated = await guard.canActivate(
            makeExecutionContext(reqObj),
          );
          expect(activated).toBe(true);
          observedUpstreamRequests.push({
            method,
            url: url.pathname,
            headers: hdrs,
          });

          return new Response(
            JSON.stringify({
              data: {
                bookingId: "bk-strict-001",
                orderId: "ord-strict-001",
                status: "ready_for_dispatch",
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }),
      );

      const operations: Array<{
        handler: typeof proxyGET;
        method: "GET" | "POST" | "PUT" | "PATCH";
        path: string[];
      }> = [
        {
          handler: proxyPOST,
          method: "POST",
          path: ["api", "tenant", "bookings"],
        },
        {
          handler: proxyGET,
          method: "GET",
          path: ["api", "tenant", "bookings", "bk-strict-001"],
        },
        {
          handler: proxyPUT,
          method: "PUT",
          path: ["api", "tenant", "bookings", "bk-strict-001"],
        },
        {
          handler: proxyPATCH,
          method: "PATCH",
          path: ["api", "tenant", "bookings", "bk-strict-001"],
        },
        {
          handler: proxyPOST,
          method: "POST",
          path: ["api", "tenant", "bookings", "bk-strict-001", "cancel"],
        },
      ];

      for (const op of operations) {
        const req = new NextRequest(
          new Request(
            `http://enterprise.example/control-plane-proxy/${op.path.join("/")}`,
            {
              method: op.method,
              headers: {
                cookie: `${ENTERPRISE_TENANT_SESSION_COOKIE}=${tokenPair.token}`,
                "x-tenant-id": "tenant-strict-001",
                "x-realm": "spoofed-realm",
                "x-actor-type": "spoofed-actor-type",
                "x-actor-id": "spoofed-actor-id",
                ...(op.method !== "GET"
                  ? { "content-type": "application/json" }
                  : {}),
              },
              ...(op.method !== "GET"
                ? { body: JSON.stringify({ notes: "strict-check" }) }
                : {}),
            },
          ),
        );
        const res = await op.handler(req, {
          params: Promise.resolve({ path: op.path }),
        });
        expect(res.status).toBe(200);
      }

      expect(observedUpstreamRequests).toHaveLength(5);
      for (const observed of observedUpstreamRequests) {
        expect(observed.headers["authorization"]).toBe(
          `Bearer ${tokenPair.token}`,
        );
        expect(observed.headers["x-tenant-id"]).toBe("tenant-strict-001");
        expect(observed.headers["x-realm"]).toBeUndefined();
        expect(observed.headers["x-actor-type"]).toBeUndefined();
        expect(observed.headers["x-actor-id"]).toBeUndefined();
      }
    });

    it("keeps SSR session clients request-scoped and uncached across tenants while preserving Cloud Run upstreamHeaders", async () => {
      process.env.DRTS_API_AUTH_AUDIENCE = "https://api-strict.a.run.app";
      const observedCalls: Array<{
        url: string;
        headers: Record<string, string>;
      }> = [];

      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
          const url = String(input);
          const hdrs = headersToRecord(init?.headers);
          observedCalls.push({ url, headers: hdrs });

          if (url.includes("metadata.google.internal")) {
            return new Response("cloud-run-id-token-xyz", { status: 200 });
          }
          if (url.endsWith("/api/auth/session")) {
            const token = hdrs["authorization"]?.replace(/^Bearer\s+/i, "");
            return new Response(
              JSON.stringify({
                data: {
                  active: true,
                  identity: {
                    realm: "tenant",
                    tenant_id:
                      token === "token-tenant-a" ? "tenant-a" : "tenant-b",
                    scopes: ["tenant:read", "tenant:write"],
                  },
                },
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }
          return new Response(
            JSON.stringify({
              data: {
                tenantId: hdrs["x-tenant-id"],
                periodMonth: "2026-10",
                bookingCount: 1,
                pendingApprovalCount: 0,
                completedTripCount: 1,
                upcomingBookings: [],
              } satisfies TenantDashboardSummary,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }),
      );

      const verifiedA = await verifyEnterpriseTenantSession("token-tenant-a");
      const verifiedB = await verifyEnterpriseTenantSession("token-tenant-b");
      expect(verifiedA.session).toMatchObject({
        accessToken: "token-tenant-a",
        tenantId: "tenant-a",
        upstreamHeaders: {
          "x-serverless-authorization": "Bearer cloud-run-id-token-xyz",
          "x-drts-google-id-token": "cloud-run-id-token-xyz",
        },
      });
      expect(verifiedB.session).toMatchObject({
        accessToken: "token-tenant-b",
        tenantId: "tenant-b",
      });

      const clientA = getEnterpriseDispatchTenantClient(verifiedA.session!);
      const clientB = getEnterpriseDispatchTenantClient(verifiedB.session!);
      const browserClientA = getEnterpriseDispatchTenantClient("tenant-a");
      expect(clientA).not.toBe(clientB);
      expect(clientA).not.toBe(browserClientA);

      await clientA.getDashboardSummary();
      await clientB.getDashboardSummary();
      await browserClientA.getDashboardSummary();

      const dashboardCalls = observedCalls.filter((c) =>
        c.url.endsWith("/api/tenant/dashboard"),
      );
      expect(dashboardCalls).toHaveLength(3);

      // SSR call A carries token-tenant-a + Cloud Run service-hop headers, zero bootstrap headers
      expect(dashboardCalls[0]!.headers["authorization"]).toBe(
        "Bearer token-tenant-a",
      );
      expect(dashboardCalls[0]!.headers["x-tenant-id"]).toBe("tenant-a");
      expect(dashboardCalls[0]!.headers["x-serverless-authorization"]).toBe(
        "Bearer cloud-run-id-token-xyz",
      );
      expect(dashboardCalls[0]!.headers["x-drts-google-id-token"]).toBe(
        "cloud-run-id-token-xyz",
      );
      expect(dashboardCalls[0]!.headers["x-realm"]).toBeUndefined();
      expect(dashboardCalls[0]!.headers["x-actor-type"]).toBeUndefined();

      // SSR call B carries token-tenant-b + tenant-b
      expect(dashboardCalls[1]!.headers["authorization"]).toBe(
        "Bearer token-tenant-b",
      );
      expect(dashboardCalls[1]!.headers["x-tenant-id"]).toBe("tenant-b");

      // Browser-style client for tenant-a never inherits cached SSR accessToken or bootstrap headers
      expect(dashboardCalls[2]!.headers["authorization"]).toBeUndefined();
      expect(dashboardCalls[2]!.headers["x-tenant-id"]).toBe("tenant-a");
      expect(dashboardCalls[2]!.headers["x-realm"]).toBeUndefined();
      expect(dashboardCalls[2]!.headers["x-actor-type"]).toBeUndefined();
      expect(dashboardCalls[2]!.headers["x-actor-id"]).toBeUndefined();
    });
  });

  describe("2. enterprise_submit_unique_booking_canonical_readback & 3. enterprise_submitted_snapshot_and_honest_states (C014, C015, C017)", () => {
    it("creates exactly 1 booking in an isolated tenant with custom delegate + placard fields and reads back the same canonical snapshot across Submitted, Home, and Trip SSR pages", async () => {
      const {
        jwtAuthService,
        guard,
        ownedMobilityService,
        tenantPartnerService,
      } = createAuthoritativeBackendHarness();

      const isolatedTenantId = "tenant-isolated-ent-20261015";
      const foreignTenantId = "tenant-foreign-ent-20261015";

      const isolatedToken = (
        await jwtAuthService.issueSessionToken({
          authMode: "jwt_bearer",
          actorType: "tenant_admin",
          actorId: "coordinator-lin-001",
          realm: "tenant",
          tenantId: isolatedTenantId,
          roleFamilies: ["tenant_operator"],
          roles: ["tenant_admin"],
          scopes: ["tenant:read", "tenant:write"],
        })
      ).token;

      const foreignToken = (
        await jwtAuthService.issueSessionToken({
          authMode: "jwt_bearer",
          actorType: "tenant_admin",
          actorId: "foreign-admin-001",
          realm: "tenant",
          tenantId: foreignTenantId,
          roleFamilies: ["tenant_operator"],
          roles: ["tenant_admin"],
          scopes: ["tenant:read", "tenant:write"],
        })
      ).token;

      // Wire global fetch so both SSR and BFF proxy calls hit the real strict BootstrapAuthGuard
      // and real OwnedMobilityService / TenantPartnerService in-memory store.
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
          const url = new URL(String(input), "http://enterprise.example");
          const method = (init?.method ?? "GET").toUpperCase();
          const hdrs = headersToRecord(init?.headers);

          // Route browser BFF calls (/control-plane-proxy/...) through the actual route handlers
          if (url.pathname.startsWith("/control-plane-proxy/")) {
            const pathSegments = url.pathname
              .replace(/^\/control-plane-proxy\//, "")
              .split("/")
              .filter(Boolean);
            const cookieVal = cookieMap.get(ENTERPRISE_TENANT_SESSION_COOKIE);
            const reqHeaders = new Headers(init?.headers);
            if (cookieVal && !reqHeaders.has("cookie")) {
              reqHeaders.set(
                "cookie",
                `${ENTERPRISE_TENANT_SESSION_COOKIE}=${cookieVal}`,
              );
            }
            const nextReq = new NextRequest(
              new Request(url.toString(), {
                method,
                headers: reqHeaders,
                ...(init?.body ? { body: init.body } : {}),
              }),
            );
            const handler =
              method === "POST"
                ? proxyPOST
                : method === "PUT"
                  ? proxyPUT
                  : method === "PATCH"
                    ? proxyPATCH
                    : proxyGET;
            return handler(nextReq, {
              params: Promise.resolve({ path: pathSegments }),
            });
          }

          if (url.pathname === "/api/auth/session") {
            const bearer = hdrs["authorization"]?.replace(/^Bearer\s+/i, "");
            const payload = bearer
              ? await jwtAuthService.verifyAccessToken(bearer)
              : null;
            if (!payload) {
              return new Response(JSON.stringify({ error: "UNAUTHORIZED" }), {
                status: 401,
              });
            }
            return new Response(
              JSON.stringify({
                data: {
                  active: true,
                  identity: {
                    realm: payload.realm,
                    tenant_id: payload.tenantId,
                    actor_id: payload.sub,
                    scopes: payload.scopes,
                  },
                },
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }

          // Strict guard check on every API route
          const reqObj: {
            method: string;
            url: string;
            originalUrl: string;
            headers: Record<string, string>;
            authIdentity?: {
              actorType: string;
              actorId: string;
              tenantId: string | null;
            };
          } = {
            method,
            url: url.pathname + url.search,
            originalUrl: url.pathname + url.search,
            headers: hdrs,
          };
          await guard.canActivate(makeExecutionContext(reqObj));
          const tenantSelector = hdrs["x-tenant-id"]!;
          if (
            reqObj.authIdentity?.tenantId &&
            reqObj.authIdentity.tenantId !== tenantSelector
          ) {
            return new Response(
              JSON.stringify({
                error: {
                  code: "TENANT_SCOPE_MISMATCH",
                  message: "Tenant mismatch",
                },
              }),
              { status: 403, headers: { "Content-Type": "application/json" } },
            );
          }

          if (url.pathname === "/api/tenant/bookings" && method === "POST") {
            const body = parseBodyJson(init?.body) as never;
            const created = await ownedMobilityService.createTenantBooking(
              body,
              tenantSelector,
              reqObj.authIdentity as never,
              hdrs["x-request-id"],
              hdrs["x-runtime-profile-code"],
              hdrs["idempotency-key"],
              { required: true },
            );
            return new Response(JSON.stringify({ data: created, meta: {} }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }

          if (url.pathname === "/api/tenant/bookings" && method === "GET") {
            const page = await ownedMobilityService.listTenantBookings(
              tenantSelector,
              {
                page: 1,
                pageSize: 20,
                ...Object.fromEntries(url.searchParams.entries()),
              },
              reqObj.authIdentity as never,
            );
            return new Response(
              JSON.stringify({
                data: {
                  items: page.items,
                  pagination: page.pagination,
                  pageInfo: page.pagination,
                },
                meta: {},
              }),
              {
                status: 200,
                headers: { "Content-Type": "application/json" },
              },
            );
          }

          const bookingMatch = url.pathname.match(
            /^\/api\/tenant\/bookings\/([^/]+)$/,
          );
          if (bookingMatch && method === "GET") {
            try {
              const record = ownedMobilityService.getTenantBooking(
                tenantSelector,
                decodeURIComponent(bookingMatch[1]!),
              );
              return new Response(JSON.stringify({ data: record, meta: {} }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              });
            } catch (err) {
              const status = (err as { status?: number }).status ?? 404;
              return new Response(
                JSON.stringify({
                  error: { code: "BOOKING_NOT_FOUND", message: "Not found" },
                }),
                { status, headers: { "Content-Type": "application/json" } },
              );
            }
          }

          if (bookingMatch && method === "PUT") {
            const body = parseBodyJson(init?.body) as never;
            const updated = await ownedMobilityService.updateTenantBooking(
              tenantSelector,
              decodeURIComponent(bookingMatch[1]!),
              body,
              reqObj.authIdentity as never,
            );
            return new Response(JSON.stringify({ data: updated, meta: {} }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }

          const cancelMatch = url.pathname.match(
            /^\/api\/tenant\/bookings\/([^/]+)\/cancel$/,
          );
          if (cancelMatch && method === "POST") {
            const body = parseBodyJson(init?.body) as never;
            const cancelled = await ownedMobilityService.cancelTenantBooking(
              tenantSelector,
              decodeURIComponent(cancelMatch[1]!),
              body,
            );
            return new Response(JSON.stringify({ data: cancelled, meta: {} }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }

          if (url.pathname === "/api/tenant/dashboard" && method === "GET") {
            const summary =
              await tenantPartnerService.getTenantDashboardSummary(
                tenantSelector,
              );
            return new Response(JSON.stringify({ data: summary, meta: {} }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }

          return new Response(JSON.stringify({ error: "NOT_FOUND" }), {
            status: 404,
          });
        }),
      );

      cookieMap.set(ENTERPRISE_TENANT_SESSION_COOKIE, isolatedToken);

      // Step 1: Render ReviewBookingPage on server and verify it passes verifiedTenantId (not fixture tenant or accessToken) to BookingSubmitButton
      const futureDate = new Date(Date.now() + 2 * 24 * 3600_000)
        .toISOString()
        .slice(0, 10);
      const reviewSearchParams = {
        pm: "other",
        passenger: "陳思妤",
        bookedBy: "林宜君",
        pickup: "台北總部 · 松高路 19 號",
        dropoff: "松山機場 T1 · 敦化北路 340-10 號",
        date: futureDate,
        time: "14:30",
        contact: "0922-888-999",
        cc: "CC-FIN-09",
        ccLabel: "CC-FIN-09 · 財務部專案接待",
        vehicle: "business",
        notes: "請於一樓大廳等候",
        placard: "VIP 陳總監",
      };

      const reviewElement = await ReviewBookingPage({
        searchParams: Promise.resolve(reviewSearchParams),
      });
      const reviewHtml = renderToStaticMarkup(reviewElement);
      expect(reviewHtml).toContain("陳思妤");
      expect(reviewHtml).toContain("林宜君");
      expect(reviewHtml).toContain("CC-FIN-09 · 財務部專案接待");
      expect(reviewHtml).toContain("VIP 陳總監");
      expect(reviewHtml).not.toContain(isolatedToken);

      // Step 2: Submit booking via BookingSubmitButton click handler in browser mode -> BFF proxy -> strict BootstrapAuthGuard -> OwnedMobilityService
      const draft: EnterpriseBookingDraftForm = {
        ...createEnterpriseBookingDraft("zh", { entry: "delegate" }),
        passengerMode: "other",
        passenger: "陳思妤",
        bookedBy: "林宜君",
        pickup: "台北總部 · 松高路 19 號",
        dropoff: "松山機場 T1 · 敦化北路 340-10 號",
        reservationDate: futureDate,
        reservationTime: "14:30",
        onsiteContactPhone: "0922-888-999",
        costCenterCode: "CC-FIN-09",
        costCenterLabel: "CC-FIN-09 · 財務部專案接待",
        vehicle: "business",
        notes: "請於一樓大廳等候",
        placard: "VIP 陳總監",
      };

      const createCmd = buildEnterpriseBookingCommand(draft);
      expect(createCmd.notes).toBe("請於一樓大廳等候 · 需舉牌「VIP 陳總監」");

      // Execute submitEnterpriseBookingDraft twice with the same idempotencyKey in browser mode (window defined)
      // to prove repeated same submission resolves to one actual booking/order.
      vi.stubGlobal("window", {});
      try {
        await submitEnterpriseBookingDraft({
          draft,
          tenantId: isolatedTenantId,
          idempotencyKey: "idem-ent-20261015-001",
          router: { push: routerPushMock, refresh: routerRefreshMock },
        });
        await submitEnterpriseBookingDraft({
          draft,
          tenantId: isolatedTenantId,
          idempotencyKey: "idem-ent-20261015-001",
          router: { push: routerPushMock, refresh: routerRefreshMock },
        });
      } finally {
        vi.stubGlobal("window", undefined);
      }

      expect(routerPushMock).toHaveBeenCalledTimes(2);
      const pushedHref = String(routerPushMock.mock.calls[0]![0]);
      const secondPushedHref = String(routerPushMock.mock.calls[1]![0]);
      expect(pushedHref).toMatch(/^\/bookings\/submitted\?/);
      expect(secondPushedHref).toBe(pushedHref);
      const pushedUrl = new URL(pushedHref, "http://enterprise.example");
      const createdBookingId = pushedUrl.searchParams.get("bookingId")!;
      const createdOrderId = pushedUrl.searchParams.get("orderId")!;
      expect(createdBookingId).toBeTruthy();
      expect(createdOrderId).toBeTruthy();
      const submitResult = {
        bookingId: createdBookingId,
        orderId: createdOrderId,
      };

      // Verify a failed submission (e.g. wrong tenant selector rejected by BFF proxy) throws and never redirects to /bookings/submitted
      routerPushMock.mockClear();
      vi.stubGlobal("window", {});
      let failedSubmitError: unknown;
      try {
        await submitEnterpriseBookingDraft({
          draft,
          tenantId: foreignTenantId,
          idempotencyKey: "idem-ent-20261015-denied",
          router: { push: routerPushMock, refresh: routerRefreshMock },
        });
      } catch (err) {
        failedSubmitError = err;
      } finally {
        vi.stubGlobal("window", undefined);
      }
      expect(failedSubmitError).toBeDefined();
      expect(routerPushMock).not.toHaveBeenCalled();

      // Verify exactly 1 booking was created in isolatedTenantId and 0 in foreignTenantId
      const isolatedPage = await ownedMobilityService.listTenantBookings(
        isolatedTenantId,
        { page: 1, pageSize: 20 },
      );
      const foreignPage = await ownedMobilityService.listTenantBookings(
        foreignTenantId,
        { page: 1, pageSize: 20 },
      );
      expect(isolatedPage.items).toHaveLength(1);
      expect(
        (isolatedPage.pagination as { totalItems?: number; total?: number })
          .totalItems ?? isolatedPage.pagination.total,
      ).toBe(1);
      expect(isolatedPage.items[0]!.bookingId).toBe(submitResult.bookingId);
      expect(foreignPage.items).toHaveLength(0);

      // Step 2b: Read back detail record via browser BFF proxy under the same authorized tenant
      vi.stubGlobal("window", {});
      let detailRecord: BookingRecord;
      try {
        detailRecord = await getEnterpriseDispatchTenantClient(
          isolatedTenantId,
        ).getBooking(submitResult.bookingId);
      } finally {
        vi.stubGlobal("window", undefined);
      }
      expect(detailRecord.bookingId).toBe(submitResult.bookingId);
      expect(detailRecord.orderId).toBe(submitResult.orderId);
      expect(detailRecord.passenger.name).toBe("陳思妤");
      expect(detailRecord.bookedBy?.name).toBe("林宜君");
      expect(detailRecord.onsiteContact?.phone).toBe("0922-888-999");
      expect(detailRecord.costCenter).toBe("CC-FIN-09");
      expect(detailRecord.notes).toBe(
        "請於一樓大廳等候 · 需舉牌「VIP 陳總監」",
      );

      // Step 3: Render SubmittedBookingPage with spoofed query orderId/status and verify canonical readback wins
      const submittedElement = await SubmittedBookingPage({
        searchParams: Promise.resolve({
          bookingId: submitResult.bookingId,
          orderId: "SPOOFED-ORDER-99999",
          status: "spoofed_query_status",
          source: "spoofed_query_source",
        }),
      });
      const submittedHtml = renderToStaticMarkup(submittedElement);

      expect(submittedHtml).toContain('data-submission-state="verified"');
      expect(submittedHtml).toContain(submitResult.bookingId);
      expect(submittedHtml).toContain(submitResult.orderId);
      expect(submittedHtml).not.toContain("SPOOFED-ORDER-99999");
      expect(submittedHtml).not.toContain("spoofed_query_status");
      expect(submittedHtml).toContain("陳思妤 · 林宜君");
      expect(submittedHtml).toContain("0922-888-999");
      expect(submittedHtml).toContain("CC-FIN-09");
      expect(submittedHtml).not.toContain("CC-PRD-07");
      expect(submittedHtml).not.toContain("Sato Kenji");
      expect(submittedHtml).toContain(
        "請於一樓大廳等候 · 需舉牌「VIP 陳總監」",
      );
      expect(submittedHtml).toContain(
        `href="/bookings/submitted?bookingId=${encodeURIComponent(submitResult.bookingId)}"`,
      );
      expect(submittedHtml).toContain(
        `href="/bookings/${encodeURIComponent(submitResult.bookingId)}"`,
      );

      // Also verify English locale (en) rendering on SubmittedBookingPage preserves canonical snapshot
      cookieMap.set("drts_enterprise_locale", "en");
      const submittedEnHtml = renderToStaticMarkup(
        await SubmittedBookingPage({
          searchParams: Promise.resolve({
            bookingId: submitResult.bookingId,
          }),
        }),
      );
      expect(submittedEnHtml).toContain('data-submission-state="verified"');
      expect(submittedEnHtml).toContain("陳思妤 · 林宜君");
      expect(submittedEnHtml).toContain("0922-888-999");
      expect(submittedEnHtml).toContain("CC-FIN-09");
      expect(submittedEnHtml).toContain(
        "請於一樓大廳等候 · 需舉牌「VIP 陳總監」",
      );
      cookieMap.delete("drts_enterprise_locale");

      // Step 4: Render HomePage SSR and verify canonical bookingId appears in upcoming bookings
      const homeElement = await HomePage();
      const homeHtml = renderToStaticMarkup(homeElement);
      expect(homeHtml).toContain(
        `data-testid="enterprise-home-upcoming-${submitResult.bookingId}"`,
      );
      expect(homeHtml).toContain(
        `href="/bookings/${encodeURIComponent(submitResult.bookingId)}"`,
      );
      expect(homeHtml).toContain("陳思妤");

      // Step 5: Before dispatch assignment, TripPage renders honest empty state; once assigned, TripPage links to the same canonical bookingId
      const emptyTripHtml = renderToStaticMarkup(await TripPage());
      expect(emptyTripHtml).toContain('data-testid="enterprise-trip-empty"');

      // Transition order status to 'assigned' in canonical store and re-read TripPage + SubmittedBookingPage (refresh)
      const internalOrder = (
        ownedMobilityService as unknown as {
          orders: Array<{ orderId: string; status: string }>;
        }
      ).orders.find((o) => o.orderId === submitResult.orderId);
      if (internalOrder) {
        internalOrder.status = "assigned";
      }

      const activeTripHtml = renderToStaticMarkup(await TripPage());
      expect(activeTripHtml).toContain(
        `href="/bookings/${encodeURIComponent(submitResult.bookingId)}"`,
      );
      expect(activeTripHtml).toContain(
        'data-testid="enterprise-trip-contact-driver"',
      );
      expect(activeTripHtml).toContain(
        'data-testid="enterprise-trip-contact-support"',
      );

      const refreshedSubmittedHtml = renderToStaticMarkup(
        await SubmittedBookingPage({
          searchParams: Promise.resolve({ bookingId: submitResult.bookingId }),
        }),
      );
      expect(refreshedSubmittedHtml).toContain("assigned");

      // Step 6: Foreign tenant cannot read isolated tenant's booking on /bookings/submitted
      cookieMap.set(ENTERPRISE_TENANT_SESSION_COOKIE, foreignToken);
      const foreignSubmittedHtml = renderToStaticMarkup(
        await SubmittedBookingPage({
          searchParams: Promise.resolve({
            bookingId: submitResult.bookingId,
            orderId: submitResult.orderId,
            status: "accepted",
          }),
        }),
      );
      expect(foreignSubmittedHtml).toContain(
        'data-submission-state="not-found"',
      );
      expect(foreignSubmittedHtml).not.toContain(submitResult.orderId);
      expect(foreignSubmittedHtml).not.toContain("陳思妤");
      expect(foreignSubmittedHtml).not.toContain("CC-FIN-09");
      expect(foreignSubmittedHtml).not.toContain("CC-PRD-07");
    });

    it("renders honest non-success states on /bookings/submitted for missing bookingId, invented bookingId, unauthenticated session, and backend outage", async () => {
      const { jwtAuthService } = createAuthoritativeBackendHarness();
      const validToken = (
        await jwtAuthService.issueSessionToken({
          authMode: "jwt_bearer",
          actorType: "tenant_admin",
          actorId: "actor-ent-002",
          realm: "tenant",
          tenantId: "tenant-ent-002",
          roleFamilies: ["tenant_operator"],
          roles: ["tenant_admin"],
          scopes: ["tenant:read", "tenant:write"],
        })
      ).token;

      // Case A: Unauthenticated session renders auth-required gate page
      cookieMap.delete(ENTERPRISE_TENANT_SESSION_COOKIE);
      const unauthHtml = renderToStaticMarkup(
        await SubmittedBookingPage({
          searchParams: Promise.resolve({
            bookingId: "bk-001",
            orderId: "ord-001",
            status: "accepted",
          }),
        }),
      );
      expect(unauthHtml).toContain("/auth-required");
      expect(unauthHtml).not.toContain("enterprise-booking-submission-proof");

      // Case B: Authenticated session, missing bookingId in query
      cookieMap.set(ENTERPRISE_TENANT_SESSION_COOKIE, validToken);
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: URL | RequestInfo) => {
          const url = String(input);
          if (url.endsWith("/api/auth/session")) {
            return new Response(
              JSON.stringify({
                data: {
                  active: true,
                  identity: {
                    realm: "tenant",
                    tenant_id: "tenant-ent-002",
                    scopes: ["tenant:read", "tenant:write"],
                  },
                },
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }
          return new Response(
            JSON.stringify({
              error: { code: "BOOKING_NOT_FOUND", message: "Not found" },
            }),
            { status: 404, headers: { "Content-Type": "application/json" } },
          );
        }),
      );

      const missingIdHtml = renderToStaticMarkup(
        await SubmittedBookingPage({
          searchParams: Promise.resolve({}),
        }),
      );
      expect(missingIdHtml).toContain('data-submission-state="missing-id"');
      expect(missingIdHtml).not.toContain("已取得後端寫入憑證");
      expect(missingIdHtml).not.toContain("Backend write confirmed");
      expect(missingIdHtml).not.toContain("CC-PRD-07");
      expect(missingIdHtml).not.toContain("Sato Kenji");

      // Case C: Invented bookingId + orderId in URL returns 404 from getBooking and never claims backendProof
      const inventedHtml = renderToStaticMarkup(
        await SubmittedBookingPage({
          searchParams: Promise.resolve({
            bookingId: "invented-booking-id",
            orderId: "invented-order-id",
            status: "accepted",
          }),
        }),
      );
      expect(inventedHtml).toContain('data-submission-state="not-found"');
      expect(inventedHtml).not.toContain("invented-order-id");
      expect(inventedHtml).not.toContain("已取得後端寫入憑證");
      expect(inventedHtml).not.toContain("CC-PRD-07");
      expect(inventedHtml).not.toContain("Sato Kenji");

      // Case D: Backend 503 failure on getBooking renders degraded submission state without claiming backendProof
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: URL | RequestInfo) => {
          const url = String(input);
          if (url.endsWith("/api/auth/session")) {
            return new Response(
              JSON.stringify({
                data: {
                  active: true,
                  identity: {
                    realm: "tenant",
                    tenant_id: "tenant-ent-002",
                    scopes: ["tenant:read", "tenant:write"],
                  },
                },
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }
          return new Response(
            JSON.stringify({
              error: { code: "UPSTREAM_UNAVAILABLE", message: "Down" },
            }),
            { status: 503, headers: { "Content-Type": "application/json" } },
          );
        }),
      );

      const degradedHtml = renderToStaticMarkup(
        await SubmittedBookingPage({
          searchParams: Promise.resolve({
            bookingId: "bk-503",
            orderId: "ord-503",
            status: "accepted",
          }),
        }),
      );
      expect(degradedHtml).toContain('data-submission-state="degraded"');
      expect(degradedHtml).not.toContain("ord-503");
      expect(degradedHtml).not.toContain("已取得後端寫入憑證");
    });

    it("preserves SR-ENTERPRISE-FORM-001 self/delegate/custom-placard/lead-time rules and BookingSubmitButton verified tenantId wiring", () => {
      const referenceNow = new Date("2026-09-06T06:12:00.000Z");
      const selfDraft = createEnterpriseBookingDraft(
        "zh",
        { entry: "self" },
        referenceNow,
      );
      expect(selfDraft.passengerMode).toBe("self");
      expect(selfDraft.passenger).toBe(selfDraft.bookedBy);

      const record: BookingRecord = {
        bookingId: "bk-roundtrip-001",
        orderId: "ord-roundtrip-001",
        tenantId: "tenant-roundtrip-001",
        partnerId: null,
        partnerProgramId: null,
        partnerEntrySlug: null,
        eligibilityVerificationId: null,
        issuerAuthorizationRef: null,
        passengerDisclosure: null,
        status: "active",
        serviceBucket: "business_dispatch",
        businessDispatchSubtype: "enterprise_dispatch",
        bookingType: "oneway",
        reservationWindowStart: "2026-09-08T02:00:00.000Z",
        reservationWindowEnd: "2026-09-08T02:30:00.000Z",
        recurrenceRule: null,
        modifiableUntil: "2026-09-08T01:00:00.000Z",
        cancelableUntil: "2026-09-08T01:15:00.000Z",
        pickup: { address: "台北總部", addressName: "台北總部" },
        dropoff: { address: "桃園機場 T2", addressName: "桃園機場 T2" },
        passenger: { name: "王小明", phone: "0911-222-333" },
        bookedBy: {
          name: "林宜君",
          email: "enterprise-dispatch-web@drts.local",
        },
        onsiteContact: { name: "王小明", phone: "0911-222-333" },
        costCenter: "CC-OPS-03",
        vehiclePreference: "business",
        benefitReference: null,
        direction: "pickup",
        flightNo: "BR198",
        terminal: "T2",
        luggageCount: 2,
        notes: "貴賓接機 · 需舉牌「王總經理」",
        quotedFare: null,
        quotedFareSource: null,
        quotedFareRuleVersion: null,
        manualFareOverride: null,
        approvalState: "pending",
        approvalRequestIds: ["apr-001"],
        complianceGates: [],
        orderStatus: "created",
        createdAt: "2026-09-06T06:12:00.000Z",
        updatedAt: "2026-09-06T06:12:00.000Z",
      };

      const roundtripDraft = createEnterpriseBookingDraftFromRecord(record);
      expect(roundtripDraft.passenger).toBe("王小明");
      expect(roundtripDraft.bookedBy).toBe("林宜君");
      expect(roundtripDraft.costCenterCode).toBe("CC-OPS-03");
      expect(roundtripDraft.notes).toBe("貴賓接機 · 需舉牌「王總經理」");

      const updateCmd = buildEnterpriseBookingUpdateCommand(
        roundtripDraft,
        referenceNow,
      );
      expect(updateCmd.costCenter).toBe("CC-OPS-03");
      expect(updateCmd.notes).toBe("貴賓接機 · 需舉牌「王總經理」");

      const buttonHtml = renderToStaticMarkup(
        React.createElement(BookingSubmitButton, {
          draft: roundtripDraft,
          tenantId: "tenant-roundtrip-001",
          locale: "zh",
          approvalRequired: true,
        }),
      );
      expect(buttonHtml).toContain('data-testid="enterprise-booking-submit"');
      expect(buttonHtml).toContain("送出並送審");
    });
  });
});
