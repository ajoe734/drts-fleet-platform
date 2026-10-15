// HOST-OWNED-VIEW-AUTH-AND-AUTHORITY-FLOW-20261015
//
// Socket-free production before/fixed-after regression for the four C012
// findings this task closes:
//   - C012-F1-HOST-MANAGED-CREDENTIAL-CONSUMER
//   - C012-F2-LONG-LIST-DETAIL-FALSE404
//   - C012-F3-CONFIGURED-AUTHORITY-FAILURE-AS-EMPTY (repository-level
//     coverage lives in tests/unit/system-remediation/sr-host-be-001)
//   - C012-F4-PRIVATE-CLOSING-NOTE-AS-REDACTED-CONCLUSION (repository-level
//     coverage lives in tests/unit/system-remediation/sr-host-be-001)
//
// This file exercises the REAL BootstrapAuthGuard + JwtAuthService +
// HostViewController + HostViewService + HostViewRepository on the backend,
// and the REAL getServerHostClient()/host-data.server.ts loaders on the
// frontend, wired together through a mocked `globalThis.fetch` boundary
// (no actual HTTP socket, no DB, no browser — satisfying the VM restriction
// while still exercising the production code paths end to end).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mockRequestHeaders = vi.hoisted(() => {
  const ref = {
    current: new Headers(),
    cookies: new Map<string, string>(),
    factory: () => ({
      headers: vi.fn(async () => ref.current),
      cookies: vi.fn(async () => ({
        get: vi.fn((name: string) => {
          const value = ref.cookies.get(name);
          return value !== undefined ? { name, value } : undefined;
        }),
      })),
    }),
  };
  return ref;
});

vi.mock("next/headers", () => mockRequestHeaders.factory());
vi.mock(
  "../../../apps/fleet-partner-portal-web/node_modules/next/headers",
  () => mockRequestHeaders.factory(),
);
vi.mock(
  "../../../apps/fleet-partner-portal-web/node_modules/next/headers.js",
  () => mockRequestHeaders.factory(),
);

import { createRequire } from "node:module";
import * as jwt from "jsonwebtoken";

import { toApiErrorEnvelope } from "../../../apps/api/src/common/api-envelope";
import type {
  AuthenticatedRequestLike,
  BootstrapRequestIdentity,
} from "../../../apps/api/src/common/auth/auth.types";
import { BootstrapAuthGuard } from "../../../apps/api/src/common/auth/bootstrap-auth.guard";
import {
  JwtAuthService,
  type IssueSessionTokenOptions,
} from "../../../apps/api/src/common/auth/jwt-auth.service";

const apiRequire = createRequire(
  new URL("../../../apps/api/package.json", import.meta.url),
);
const { Reflector } = apiRequire("@nestjs/core") as {
  Reflector: new () => ConstructorParameters<typeof BootstrapAuthGuard>[0];
};
const { HttpException } = apiRequire("@nestjs/common") as {
  HttpException: new (
    response: string | Record<string, unknown>,
    status: number,
  ) => {
    getStatus(): number;
    getResponse(): string | object;
  };
};
type ExecutionContext = any;
import {
  HostViewController,
  HostViewRepository,
  HostViewService,
} from "../../../apps/api/src/modules/host-view";
import {
  loadHostVehicleCases,
  loadHostVehicleDetail,
  loadHostVehicleEarnings,
  loadHostVehicleMaintenance,
  loadHostVehicleTrips,
  loadHostVehicles,
} from "../../../apps/fleet-partner-portal-web/app/host/lib/host-data.server";

// BootstrapAuthGuard attaches a realm="partner" identity for every request
// this harness exercises (enforced by @RequireRealms("partner") on
// HostViewController), which is always a BootstrapRequestIdentity; the
// broader RequestIdentity union on AuthenticatedRequestLike also admits
// PassengerRequestIdentity for unrelated passenger-app routes not exercised
// here.
function asHostIdentity(
  identity: AuthenticatedRequestLike["identity"],
): BootstrapRequestIdentity | null {
  return identity ? (identity as BootstrapRequestIdentity) : null;
}

function setRequestContext(
  headersInit?: Record<string, string>,
  cookiesInit?: Record<string, string>,
) {
  mockRequestHeaders.current = new Headers(headersInit ?? {});
  mockRequestHeaders.cookies = new Map(Object.entries(cookiesInit ?? {}));
}

async function mintHostSessionToken(
  jwtAuthService: JwtAuthService,
  partnerId: string,
  overrides?: Pick<IssueSessionTokenOptions, "expiresIn">,
): Promise<string> {
  const issued = await jwtAuthService.issueSessionToken({
    authMode: "jwt_bearer",
    actorType: "partner_user",
    actorId: `usr_${partnerId}`,
    realm: "partner",
    tenantId: null,
    partnerId,
    roleFamilies: ["partner"],
    roles: ["vehicle_owner"],
    scopes: ["owned:read", "reports:read", "maintenance:read"],
    requestId: null,
  } as never, overrides);
  return issued.token;
}

describe("HOST-OWNED-VIEW-AUTH-AND-AUTHORITY-FLOW-20261015: real credential consumer, authoritative pagination, and strict guards", () => {
  const TEST_JWT_SECRET =
    "test-host-owned-view-auth-and-authority-flow-20261015-secret";
  const HOST_A = "partner_host_a_owned_view";
  const HOST_B = "partner_host_b_owned_view";
  const VEHICLE_A1 = "veh_owned_view_a_001";
  const VEHICLE_B1 = "veh_owned_view_b_001";

  let repository: HostViewRepository;
  let service: HostViewService;
  let controller: HostViewController;
  let jwtAuthService: JwtAuthService;
  let bootstrapAuthGuard: BootstrapAuthGuard;
  let recordedRequests: Array<{
    pathname: string;
    headers: Record<string, string>;
    status: number;
    errorCode: string | null;
  }>;

  const originalFetch = globalThis.fetch;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of [
      "DRTS_API_URL",
      "DRTS_HOST_PARTNER_ID",
      "DRTS_API_AUTH_AUDIENCE",
      "DRTS_ENV",
      "JWT_SECRET",
      "JWT_ISSUER",
      "JWT_AUDIENCE",
    ]) {
      savedEnv[key] = process.env[key];
    }
    process.env.DRTS_API_URL = "http://localhost:3001";
    process.env.JWT_SECRET = TEST_JWT_SECRET;
    delete process.env.DRTS_HOST_PARTNER_ID;
    delete process.env.DRTS_API_AUTH_AUDIENCE;

    setRequestContext();
    recordedRequests = [];

    repository = new HostViewRepository();
    service = new HostViewService(repository);
    controller = new HostViewController(service);
    jwtAuthService = new JwtAuthService();
    bootstrapAuthGuard = new BootstrapAuthGuard(new Reflector(), jwtAuthService);

    repository.seedVehicle({
      vehicleId: VEHICLE_A1,
      ownerPartnerId: HOST_A,
      plateNo: "TDC-9001",
      vin: "1HGCR2F83HA900001",
      vehicleForm: "sedan",
      licenseClass: "multi_taxi",
      energyType: "electric",
      currentStatus: "active",
      operatingFleetName: "Owned View Fleet A",
      contractPeriod: null,
    });
    repository.seedVehicle({
      vehicleId: VEHICLE_B1,
      ownerPartnerId: HOST_B,
      plateNo: "TDC-9002",
      vin: "2T1BURHE5JC900002",
      vehicleForm: "sedan",
      licenseClass: "taxi",
      energyType: "hybrid",
      currentStatus: "active",
      operatingFleetName: "Owned View Fleet B",
      contractPeriod: null,
    });

    globalThis.fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const rawUrl =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        const parsedUrl = new URL(rawUrl);

        if (parsedUrl.hostname === "metadata.google.internal") {
          return new Response("mock-cloud-run-metadata-oidc-token", { status: 200 });
        }

        const headerRecord: Record<string, string> = {};
        if (init?.headers) {
          new Headers(init.headers as HeadersInit).forEach((value, key) => {
            headerRecord[key.toLowerCase()] = value;
          });
        }

        const pathname = parsedUrl.pathname;
        const requestLike: AuthenticatedRequestLike = {
          method: (init?.method ?? "GET").toUpperCase(),
          url: `${parsedUrl.pathname}${parsedUrl.search}`,
          originalUrl: `${parsedUrl.pathname}${parsedUrl.search}`,
          headers: headerRecord,
        };

        let handler: (() => Promise<unknown>) | null = null;
        if (pathname === "/api/host/vehicles") {
          handler = () =>
            controller.listVehicles(
              asHostIdentity(requestLike.identity),
              Number(parsedUrl.searchParams.get("page")) || undefined,
              Number(parsedUrl.searchParams.get("pageSize")) || undefined,
              headerRecord["x-request-id"],
            );
        } else {
          const earningsMatch = pathname.match(
            /^\/api\/host\/vehicles\/([^/]+)\/earnings$/,
          );
          const maintenanceMatch = pathname.match(
            /^\/api\/host\/vehicles\/([^/]+)\/maintenance$/,
          );
          const tripsMatch = pathname.match(
            /^\/api\/host\/vehicles\/([^/]+)\/trips$/,
          );
          const casesMatch = pathname.match(
            /^\/api\/host\/vehicles\/([^/]+)\/cases$/,
          );
          if (earningsMatch) {
            const vehicleId = decodeURIComponent(earningsMatch[1]!);
            handler = () =>
              controller.getEarnings(
                vehicleId,
                asHostIdentity(requestLike.identity),
                parsedUrl.searchParams.get("month") ?? undefined,
                headerRecord["x-request-id"],
              );
          } else if (maintenanceMatch) {
            const vehicleId = decodeURIComponent(maintenanceMatch[1]!);
            handler = () =>
              controller.listMaintenance(
                vehicleId,
                asHostIdentity(requestLike.identity),
                Number(parsedUrl.searchParams.get("page")) || undefined,
                Number(parsedUrl.searchParams.get("pageSize")) || undefined,
                headerRecord["x-request-id"],
              );
          } else if (tripsMatch) {
            const vehicleId = decodeURIComponent(tripsMatch[1]!);
            handler = () =>
              controller.listTrips(
                vehicleId,
                asHostIdentity(requestLike.identity),
                Number(parsedUrl.searchParams.get("page")) || undefined,
                Number(parsedUrl.searchParams.get("pageSize")) || undefined,
                headerRecord["x-request-id"],
              );
          } else if (casesMatch) {
            const vehicleId = decodeURIComponent(casesMatch[1]!);
            handler = () =>
              controller.listCases(
                vehicleId,
                asHostIdentity(requestLike.identity),
                Number(parsedUrl.searchParams.get("page")) || undefined,
                Number(parsedUrl.searchParams.get("pageSize")) || undefined,
                headerRecord["x-request-id"],
              );
          }
        }

        if (!handler) {
          return new Response(
            JSON.stringify(
              toApiErrorEnvelope("NOT_FOUND", `Route not found: ${pathname}`),
            ),
            { status: 404, headers: { "Content-Type": "application/json" } },
          );
        }

        const executionContext = {
          switchToHttp: () => ({
            getRequest: () => requestLike,
            getResponse: () => ({}),
            getNext: () => undefined,
          }),
          getHandler: () => handler,
          getClass: () => HostViewController,
        } as unknown as ExecutionContext;

        try {
          await bootstrapAuthGuard.canActivate(executionContext);
          const result = await handler();
          recordedRequests.push({
            pathname,
            headers: headerRecord,
            status: 200,
            errorCode: null,
          });
          return new Response(JSON.stringify(result), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          const status = err instanceof HttpException ? err.getStatus() : 500;
          const payload =
            err instanceof HttpException
              ? err.getResponse()
              : toApiErrorEnvelope(
                  "INTERNAL_SERVER_ERROR",
                  err instanceof Error ? err.message : "Unexpected error",
                );
          const errorCode =
            (payload as { error?: { code?: string } })?.error?.code ?? null;
          recordedRequests.push({ pathname, headers: headerRecord, status, errorCode });
          return new Response(JSON.stringify(payload), {
            status,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    ) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  describe("1. C012-F1: real managed session reaches all read consumers (strict environment)", () => {
    beforeEach(() => {
      process.env.DRTS_ENV = "production";
    });

    it("1.1 Host A's real signed session drives vehicles/earnings/maintenance/trips/cases, scoped to Host A only", async () => {
      const token = await mintHostSessionToken(jwtAuthService, HOST_A);
      setRequestContext({}, { drts_session: token });

      const vehicles = await loadHostVehicles({ page: 1, pageSize: 20 });
      expect(vehicles.ok).toBe(true);
      if (vehicles.ok) {
        expect(vehicles.items.map((v) => v.vehicleId)).toEqual([VEHICLE_A1]);
      }

      const detail = await loadHostVehicleDetail(VEHICLE_A1);
      expect(detail.ok).toBe(true);

      const earnings = await loadHostVehicleEarnings(VEHICLE_A1, "2026-08");
      expect(earnings.ok).toBe(true);

      const maintenance = await loadHostVehicleMaintenance(VEHICLE_A1, {
        page: 1,
        pageSize: 20,
      });
      expect(maintenance.ok).toBe(true);

      const trips = await loadHostVehicleTrips(VEHICLE_A1, { page: 1, pageSize: 20 });
      expect(trips.ok).toBe(true);

      const cases = await loadHostVehicleCases(VEHICLE_A1, { page: 1, pageSize: 20 });
      expect(cases.ok).toBe(true);

      expect(recordedRequests.every((r) => r.status === 200)).toBe(true);
      // Never manufactures a bootstrap identity alongside the real session.
      expect(recordedRequests[0]?.headers["x-actor-type"]).toBeUndefined();
      expect(recordedRequests[0]?.headers.authorization).toBe(`Bearer ${token}`);
    });

    it("1.2 Host B's real signed session sees only Host B's vehicle, never Host A's (two legitimate owners)", async () => {
      const token = await mintHostSessionToken(jwtAuthService, HOST_B);
      setRequestContext({}, { drts_session: token });

      const vehicles = await loadHostVehicles({ page: 1, pageSize: 20 });
      expect(vehicles.ok).toBe(true);
      if (vehicles.ok) {
        expect(vehicles.items.map((v) => v.vehicleId)).toEqual([VEHICLE_B1]);
      }
    });

    it("1.3 Host A's real session requesting Host B's vehicle id gets anti-enumeration 404, never 403", async () => {
      const token = await mintHostSessionToken(jwtAuthService, HOST_A);
      setRequestContext({}, { drts_session: token });

      const detail = await loadHostVehicleDetail(VEHICLE_B1);
      expect(detail.ok).toBe(false);
      if (!detail.ok) {
        expect(detail.accessState).toBe("vehicle_not_found");
      }
    });

    it("1.4 missing credential: no network call is ever made, result is unauthorized", async () => {
      setRequestContext();
      const result = await loadHostVehicles({ page: 1, pageSize: 20 });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.accessState).toBe("unauthorized");
      }
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it("1.5 expired session is rejected with 401 (unauthorized), not silently treated as empty", async () => {
      const token = await mintHostSessionToken(jwtAuthService, HOST_A, {
        expiresIn: "1s",
      });
      await new Promise((resolve) => setTimeout(resolve, 1100));
      setRequestContext({}, { drts_session: token });

      const result = await loadHostVehicles({ page: 1, pageSize: 20 });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.accessState).toBe("unauthorized");
      }
      expect(recordedRequests[0]?.status).toBe(401);
    });

    it("1.6 forged / wrong-secret token is rejected with 401 JWT_INVALID", async () => {
      const forgedToken = jwt.sign(
        {
          sub: "forged_owner",
          actorType: "partner_user",
          realm: "partner",
          partnerId: HOST_A,
          roleFamilies: ["partner"],
          roles: ["vehicle_owner"],
          scopes: ["owned:read"],
        },
        "wrong-signing-secret",
        { algorithm: "HS256" },
      );
      setRequestContext({}, { drts_session: forgedToken });

      const result = await loadHostVehicles({ page: 1, pageSize: 20 });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.accessState).toBe("unauthorized");
      }
      expect(recordedRequests[0]?.errorCode).toBe("JWT_INVALID");
    });

    it("1.7 a session signed for a disallowed realm (tenant, not partner) is rejected with 403 (forbidden)", async () => {
      const issued = await jwtAuthService.issueSessionToken({
        authMode: "jwt_bearer",
        actorType: "tenant_admin",
        actorId: "usr_tenant_001",
        realm: "tenant",
        tenantId: "tenant_001",
        roleFamilies: ["tenant"],
        roles: ["tenant_ops_admin"],
        scopes: ["owned:read"],
        requestId: null,
      } as never);
      setRequestContext({}, { drts_session: issued.token });

      const result = await loadHostVehicles({ page: 1, pageSize: 20 });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.accessState).toBe("forbidden");
      }
      expect(recordedRequests[0]?.status).toBe(403);
    });

    it("1.8 the old vulnerable bootstrap-header path is still rejected server-side in strict mode, even though the BFF forwards caller-supplied headers in its lawful non-strict harness branch", async () => {
      // Simulates an attacker (or stale client) sending raw bootstrap
      // identity headers straight to the BFF with no real session. The BFF's
      // non-strict harness branch forwards them verbatim (`getServerHostClient`
      // never inspects environment strictness itself) — the real safety net
      // is BootstrapAuthGuard's independent strict-environment rejection,
      // which this proves still holds.
      setRequestContext({
        "x-actor-type": "partner_user",
        "x-partner-id": HOST_A,
        "x-realm": "partner",
        "x-scopes": "owned:read,reports:read,maintenance:read",
      });

      const result = await loadHostVehicles({ page: 1, pageSize: 20 });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.accessState).toBe("unauthorized");
      }
      expect(recordedRequests[0]?.status).toBe(401);
      expect(recordedRequests[0]?.errorCode).toBe("AUTH_BOOTSTRAP_HEADERS_FORBIDDEN");
    });
  });

  describe("2. C012-F2: authoritative pagination drilldown beyond the server's 100-item per-page cap", () => {
    it("2.1 finds a vehicle beyond the previous single-page lookup bound via the real service pagination cap", async () => {
      process.env.DRTS_ENV = "production";
      // Seed 101 vehicles for a dedicated owner so the real
      // `HostViewService.paginate` cap (100/page) is exercised, not a mock.
      const BULK_HOST = "partner_host_bulk_owned_view";
      for (let i = 1; i <= 101; i += 1) {
        repository.seedVehicle({
          vehicleId: `veh_bulk_${String(i).padStart(3, "0")}`,
          ownerPartnerId: BULK_HOST,
          plateNo: `TDC-BULK-${i}`,
          vin: `1HGCR2F83HA${String(900000 + i)}`,
          vehicleForm: "sedan",
          licenseClass: "taxi",
          energyType: "fuel",
          currentStatus: "active",
          operatingFleetName: "Bulk Owned View Fleet",
          contractPeriod: null,
        });
      }

      const token = await mintHostSessionToken(jwtAuthService, BULK_HOST);
      setRequestContext({}, { drts_session: token });

      const detail = await loadHostVehicleDetail("veh_bulk_101");
      expect(detail.ok).toBe(true);
      if (detail.ok) {
        expect(detail.vehicle.vehicleId).toBe("veh_bulk_101");
      }
      // Proves more than one authoritative page was actually walked.
      const vehicleListCalls = recordedRequests.filter(
        (r) => r.pathname === "/api/host/vehicles",
      );
      expect(vehicleListCalls.length).toBeGreaterThan(1);
    });
  });
});
