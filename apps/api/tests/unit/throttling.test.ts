import "reflect-metadata";

import {
  THROTTLER_BLOCK_DURATION,
  THROTTLER_LIMIT,
  THROTTLER_SKIP,
  THROTTLER_TTL,
} from "@nestjs/throttler/dist/throttler.constants";
import { minutes } from "@nestjs/throttler";
import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BootstrapAuthGuard } from "../../src/common/auth/bootstrap-auth.guard";
import { JwtAuthService } from "../../src/common/auth/jwt-auth.service";
import type { BootstrapRequestIdentity } from "../../src/common/auth/auth.types";
import { BootstrapThrottlerGuard } from "../../src/common/throttling/bootstrap-throttler.guard";
import { KeyScopedThrottlerStorage } from "../../src/common/throttling/key-scoped-throttler.storage";
import {
  BOOKING_INTAKE_RATE_LIMIT,
  DISPATCH_RATE_LIMIT,
  GLOBAL_RATE_LIMIT,
  OPEN_ROUTE_RATE_LIMIT,
  RATE_LIMIT_SKIP_DEFAULT,
  READ_HEAVY_RATE_LIMIT,
  REPORT_JOBS_RATE_LIMIT,
} from "../../src/common/throttling/rate-limit.constants";
import { HealthController } from "../../src/health/health.controller";
import { IdentityController } from "../../src/modules/identity/identity.controller";
import { OwnedMobilityController } from "../../src/modules/owned-mobility/owned-mobility.controller";
import { PlatformAdminController } from "../../src/modules/platform-admin/platform-admin.controller";
import { TenantsController } from "../../src/modules/platform-admin/tenants.controller";
import { PlatformTenantGovernanceController } from "../../src/modules/platform-admin/tenant-governance.controller";
import { ProductRuleController } from "../../src/modules/product-rule/product-rule.controller";
import { BillingSettlementController } from "../../src/modules/billing-settlement/billing-settlement.controller";
import { ReportingFilingController } from "../../src/modules/reporting-filing/reporting-filing.controller";
import { AuthController } from "../../src/modules/auth/auth.controller";
import { IdentityRepository } from "../../src/modules/identity/identity.repository";
import { TenantPartnerController } from "../../src/modules/tenant-partner/tenant-partner.controller";

class TestBootstrapThrottlerGuard extends BootstrapThrottlerGuard {
  async exposeTracker(req: Record<string, any>) {
    return this.getTracker(req);
  }
}

describe("bootstrap throttler tracker", () => {
  it("prefers authenticated actor identity over network address", async () => {
    const guard = new TestBootstrapThrottlerGuard(
      { throttlers: [] },
      {} as never,
      {} as never,
    );

    await expect(
      guard.exposeTracker({
        headers: {
          "x-forwarded-for": "198.51.100.10",
        },
        identity: {
          realm: "tenant",
          actorType: "tenant_admin",
          actorId: "tenant-admin-001",
        },
      }),
    ).resolves.toBe("actor:tenant:tenant_admin:tenant-admin-001");
  });

  it("falls back to a hashed internal key and tenant scope when no actor identity exists", async () => {
    const guard = new TestBootstrapThrottlerGuard(
      { throttlers: [] },
      {} as never,
      {} as never,
    );

    const tracker = await guard.exposeTracker({
      headers: {
        "x-drts-internal-key": "secret-key-value",
        "x-tenant-id": "tenant-acme-001",
      },
    });

    expect(tracker).toMatch(/^internal:tenant-acme-001:[a-f0-9]{16}$/);
  });

  it("uses the first forwarded IP address before req.ip", async () => {
    const guard = new TestBootstrapThrottlerGuard(
      { throttlers: [] },
      {} as never,
      {} as never,
    );

    await expect(
      guard.exposeTracker({
        headers: {
          "x-forwarded-for": "203.0.113.15, 10.0.0.2",
        },
        ip: "10.0.0.2",
      }),
    ).resolves.toBe("ip:203.0.113.15");
  });
});

describe("route throttling metadata", () => {
  it("skips health checks from the global throttler", () => {
    expect(
      Reflect.getMetadata(THROTTLER_SKIP + "default", HealthController),
    ).toBe(RATE_LIMIT_SKIP_DEFAULT.default);
  });

  it("applies a stricter limit to the public identity context endpoint", () => {
    expect(
      Reflect.getMetadata(
        THROTTLER_LIMIT + "default",
        IdentityController.prototype.getContext,
      ),
    ).toBe(OPEN_ROUTE_RATE_LIMIT.default.limit);
    expect(
      Reflect.getMetadata(
        THROTTLER_TTL + "default",
        IdentityController.prototype.getContext,
      ),
    ).toBe(minutes(1));
  });

  it("raises the cap for read-heavy dispatch and order queries", () => {
    expect(
      Reflect.getMetadata(
        THROTTLER_LIMIT + "default",
        OwnedMobilityController.prototype.listDispatchJobs,
      ),
    ).toBe(READ_HEAVY_RATE_LIMIT.default.limit);
    expect(
      Reflect.getMetadata(
        THROTTLER_TTL + "default",
        OwnedMobilityController.prototype.listDispatchJobs,
      ),
    ).toBe(READ_HEAVY_RATE_LIMIT.default.ttl);
  });

  it("raises the cap for the read-heavy platform-admin console controllers", () => {
    // The admin console fans out many GETs per page through one shared
    // bootstrap-actor bucket; the global 60/min + 5-min block locked it out
    // with a 429. Class-level @Throttle(READ_HEAVY_RATE_LIMIT) lifts the cap to
    // 180/min. The unchanged global five-minute block is still inherited.
    for (const controller of [
      PlatformAdminController,
      TenantsController,
      PlatformTenantGovernanceController,
    ]) {
      expect(Reflect.getMetadata(THROTTLER_LIMIT + "default", controller)).toBe(
        READ_HEAVY_RATE_LIMIT.default.limit,
      );
      expect(Reflect.getMetadata(THROTTLER_TTL + "default", controller)).toBe(
        READ_HEAVY_RATE_LIMIT.default.ttl,
      );
    }
  });

  it("raises the cap for the other reads the pricing page loads", () => {
    // The pricing page also fans out to the product-rule catalog and the
    // driver-fee-plans read; both must escape the global 60/min + 5-min block.
    expect(
      Reflect.getMetadata(THROTTLER_LIMIT + "default", ProductRuleController),
    ).toBe(READ_HEAVY_RATE_LIMIT.default.limit);
    expect(
      Reflect.getMetadata(
        THROTTLER_LIMIT + "default",
        BillingSettlementController.prototype.listDriverFeePlans,
      ),
    ).toBe(READ_HEAVY_RATE_LIMIT.default.limit);
  });

  it("sets dedicated baseline throttle for POST tenant/bookings (60/min, no 5min block)", () => {
    expect(
      Reflect.getMetadata(
        THROTTLER_LIMIT + "default",
        OwnedMobilityController.prototype.createTenantBooking,
      ),
    ).toBe(BOOKING_INTAKE_RATE_LIMIT.default.limit);
    expect(
      Reflect.getMetadata(
        THROTTLER_TTL + "default",
        OwnedMobilityController.prototype.createTenantBooking,
      ),
    ).toBe(BOOKING_INTAKE_RATE_LIMIT.default.ttl);
    expect(
      Reflect.getMetadata(
        THROTTLER_BLOCK_DURATION + "default",
        OwnedMobilityController.prototype.createTenantBooking,
      ),
    ).toBe(BOOKING_INTAKE_RATE_LIMIT.default.blockDuration);
  });

  it("sets dedicated baseline throttle for POST orders/:orderId/dispatch (300/min, no 5min block)", () => {
    expect(
      Reflect.getMetadata(
        THROTTLER_LIMIT + "default",
        OwnedMobilityController.prototype.dispatchOrder,
      ),
    ).toBe(DISPATCH_RATE_LIMIT.default.limit);
    expect(
      Reflect.getMetadata(
        THROTTLER_TTL + "default",
        OwnedMobilityController.prototype.dispatchOrder,
      ),
    ).toBe(DISPATCH_RATE_LIMIT.default.ttl);
    expect(
      Reflect.getMetadata(
        THROTTLER_BLOCK_DURATION + "default",
        OwnedMobilityController.prototype.dispatchOrder,
      ),
    ).toBe(DISPATCH_RATE_LIMIT.default.blockDuration);
  });

  it("sets dedicated baseline throttle for POST reports/jobs (30/min, no 5min block)", () => {
    expect(
      Reflect.getMetadata(
        THROTTLER_LIMIT + "default",
        ReportingFilingController.prototype.createReportJob,
      ),
    ).toBe(REPORT_JOBS_RATE_LIMIT.default.limit);
    expect(
      Reflect.getMetadata(
        THROTTLER_TTL + "default",
        ReportingFilingController.prototype.createReportJob,
      ),
    ).toBe(REPORT_JOBS_RATE_LIMIT.default.ttl);
    expect(
      Reflect.getMetadata(
        THROTTLER_BLOCK_DURATION + "default",
        ReportingFilingController.prototype.createReportJob,
      ),
    ).toBe(REPORT_JOBS_RATE_LIMIT.default.blockDuration);
  });
});

describe("authenticated session read through the real guards and storage", () => {
  const stores = new Set<KeyScopedThrottlerStorage>();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T12:00:00.000Z"));
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DRTS_ENV", "development");
    vi.stubEnv("STRICT_IAP_MODE", "false");
    vi.stubEnv("CONTROL_PLANE_IAP_ENABLED", "false");
    vi.stubEnv("JWT_KEY_RING_JSON", "");
    vi.stubEnv("JWT_SECRET", "session-read-throttle-unit-only-signing-key");
    vi.stubEnv("JWT_ISSUER", "session-read-unit-issuer");
    vi.stubEnv("JWT_AUDIENCE", "session-read-unit-audience");
  });

  afterEach(() => {
    stores.forEach((store) => store.onApplicationShutdown());
    stores.clear();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  async function fixture(
    suffix = "",
    storage = new KeyScopedThrottlerStorage(),
  ) {
    // Exercise the production repository's explicit noDB unit adapter and
    // normal issuer. No verifier, guard, counter, or authorization decision is
    // mocked; the only synthetic boundaries are the clock and HTTP context.
    const repository = new IdentityRepository();
    await repository.onModuleInit();
    let { principal, membership } =
      await repository.ensureDefaultPlatformAccount();
    let [binding] = await repository.findRoleBindingsByMembershipId(
      membership.membershipId,
    );
    if (!binding) throw new Error("Canonical test role binding is missing");
    if (suffix) {
      principal = await repository.ensurePrincipalRecord({
        ...principal,
        principalId: `${principal.principalId}:${suffix}`,
        sourceRef: `${principal.sourceRef}:${suffix}`,
        subject: `${principal.subject}:${suffix}`,
        email: `${suffix}@session-read.example`,
      });
      membership = await repository.ensureMembershipRecord({
        ...membership,
        membershipId: `${membership.membershipId}:${suffix}`,
        sourceRef: `${membership.sourceRef}:${suffix}`,
        principalId: principal.principalId,
      });
      binding = await repository.ensureRoleBindingRecord({
        ...binding,
        roleBindingId: `${binding.roleBindingId}:${suffix}`,
        sourceRef: `${binding.sourceRef}:${suffix}`,
        membershipId: membership.membershipId,
      });
    }
    const jwt = new JwtAuthService(repository);
    const issued = await jwt.issueSessionToken(
      {
        authMode: "jwt_bearer",
        actorType: "platform_admin",
        actorId: principal.principalId,
        principalId: principal.principalId,
        membershipId: membership.membershipId,
        realm: "platform",
        tenantId: null,
        roles: [binding.roleCode],
        roleFamilies: ["platform"],
        scopes: ["identity:read"],
      },
      {
        ensurePrincipal: false,
        tokenVersion: Math.max(
          ...[principal, membership, binding].map((row) =>
            Date.parse(row.updatedAt),
          ),
        ),
        expiresIn: "8h",
        amr: [],
        acr: "aal1",
      },
    );
    expect((await repository.getSession(issued.sessionId))?.status).toBe(
      "active",
    );
    const controller = new AuthController(jwt, {} as never, {} as never);
    const auth = new BootstrapAuthGuard(new Reflector(), jwt);
    const throttle = new BootstrapThrottlerGuard(
      [...GLOBAL_RATE_LIMIT],
      storage,
      new Reflector(),
    );
    stores.add(storage);
    await throttle.onModuleInit();
    const sessionReads = vi.spyOn(repository, "getSession");
    const controllerCalls = vi.spyOn(controller, "getAuthSession");
    const call = async (
      options: {
        token?: string | null;
        path?: string;
        headers?: Record<string, string>;
      } = {},
    ) => {
      const token = options.token === undefined ? issued.token : options.token;
      const request: {
        method: string;
        originalUrl: string;
        ip: string;
        headers: Record<string, string>;
        identity?: BootstrapRequestIdentity;
      } = {
        method: "GET",
        originalUrl: options.path ?? "/api/auth/session",
        ip: "192.0.2.10",
        headers: {
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...options.headers,
        },
      };
      const headers: Record<string, number> = {};
      const protectedRead = request.originalUrl.startsWith(
        "/api/platform-admin/partner-entries",
      );
      const context = {
        getClass: () =>
          protectedRead ? TenantPartnerController : AuthController,
        getHandler: () =>
          protectedRead
            ? TenantPartnerController.prototype.listPlatformPartnerEntries
            : AuthController.prototype.getAuthSession,
        switchToHttp: () => ({
          getRequest: () => request,
          getResponse: () => ({
            header: (name: string, value: number) => {
              headers[name] = value;
            },
          }),
        }),
      } as unknown as ExecutionContext;
      try {
        // Match AppModule's production guard order; never prefill identity.
        await auth.canActivate(context);
        await throttle.canActivate(context);
        if (protectedRead)
          throw new Error("Missing-scope request unexpectedly passed auth");
        const response = controller.getAuthSession(request.identity ?? null);
        return { status: 200, headers, data: response.data };
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !("getStatus" in error) ||
          typeof error.getStatus !== "function"
        )
          throw error;
        return { status: error.getStatus() as number, headers, data: null };
      }
    };
    return {
      repository,
      principal,
      jwt,
      issued,
      storage,
      call,
      sessionReads,
      controllerCalls,
    };
  }

  it("admits 180 fresh same-bearer reads, then preserves the five-minute block", async () => {
    const f = await fixture();
    for (let n = 1; n <= 180; n++) {
      const response = await f.call();
      expect(response.status, `lawful session-read request ${n}`).toBe(200);
      expect(response.data?.identity.sessionId).toBe(f.issued.sessionId);
    }
    expect(f.sessionReads).toHaveBeenCalledTimes(180);
    expect(f.controllerCalls).toHaveBeenCalledTimes(180);
    expect(await f.call()).toMatchObject({
      status: 429,
      headers: { "Retry-After": 300 },
    });
    expect(f.sessionReads).toHaveBeenCalledTimes(181);
    expect(f.controllerCalls).toHaveBeenCalledTimes(180);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await f.call()).toMatchObject({ status: 429 });
    await vi.advanceTimersByTimeAsync(239_999);
    expect(await f.call()).toMatchObject({ status: 429 });
    await vi.advanceTimersByTimeAsync(1);
    expect(await f.call()).toMatchObject({
      status: 200,
      headers: { "X-RateLimit-Limit": 180 },
    });
  });

  it("rechecks a real revoked session immediately before throttling or the controller", async () => {
    const f = await fixture();
    expect((await f.call()).status).toBe(200);
    await f.jwt.revokeCurrentSession(
      f.issued.sessionId,
      "session-read-unit-revocation",
    );
    expect((await f.call()).status).toBe(401);
    expect(f.sessionReads).toHaveBeenCalledTimes(2);
    expect(f.controllerCalls).toHaveBeenCalledTimes(1);
    expect([...f.storage.storage.values()][0]?.totalHits.get("default")).toBe(
      1,
    );
  });

  it.each(["missing", "invalid-signature", "expired"] as const)(
    "denies %s bearer without reaching the read controller",
    async (kind) => {
      const f = await fixture();
      if (kind === "expired")
        await vi.advanceTimersByTimeAsync(8 * 60 * 60 * 1000 + 1);
      const token =
        kind === "missing"
          ? null
          : kind === "invalid-signature"
            ? f.issued.token.replace(/\.[^.]+$/, ".invalid-signature")
            : f.issued.token;
      expect((await f.call({ token })).status).toBe(401);
      expect(f.controllerCalls).not.toHaveBeenCalled();
      expect(f.storage.storage.size).toBe(0);
    },
  );

  it("keeps foreign selectors and claimed headers from changing the signed caller", async () => {
    const f = await fixture();
    const response = await f.call({
      path: "/api/auth/session?principalId=foreign&partnerEntrySlug=foreign",
      headers: { "x-actor-id": "foreign", "x-principal-id": "foreign" },
    });
    expect(response.status).toBe(200);
    expect(response.data?.identity.principalId).toBe(f.principal.principalId);
    expect(response.data?.identity.sessionId).toBe(f.issued.sessionId);
    expect(f.sessionReads).toHaveBeenCalledTimes(1);
  });

  it("still denies an actual protected read when the signed caller lacks its scope", async () => {
    const f = await fixture();
    expect((await f.call()).status).toBe(200);
    expect(
      (
        await f.call({
          path: "/api/platform-admin/partner-entries",
          headers: { "x-scopes": "foundation:read" },
        })
      ).status,
    ).toBe(403);
    expect(f.controllerCalls).toHaveBeenCalledTimes(1);
  });

  it("isolates genuine callers at one IP and cannot rotate the tracker with forged headers", async () => {
    const first = await fixture();
    for (let n = 0; n < 180; n++) expect((await first.call()).status).toBe(200);
    expect(
      (
        await first.call({
          headers: {
            "x-actor-id": "another-actor",
            "x-forwarded-for": "192.0.2.99",
          },
        })
      ).status,
    ).toBe(429);
    const second = await fixture("second", first.storage);
    const response = await second.call();
    expect(response.status).toBe(200);
    expect(response.data?.identity.principalId).toBe(
      second.principal.principalId,
    );
  });
});
