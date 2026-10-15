import { createRequire } from "node:module";
import { Readable } from "node:stream";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ApiClientError } from "@drts/api-client";
import type {
  BootstrapRequestIdentity,
  AuthenticatedRequestLike,
} from "../../../apps/api/src/common/auth/auth.types";
import { BootstrapAuthGuard } from "../../../apps/api/src/common/auth/bootstrap-auth.guard";
import { JwtAuthService } from "../../../apps/api/src/common/auth/jwt-auth.service";
import { IdentityRepository } from "../../../apps/api/src/modules/identity/identity.repository";
import { AuthController } from "../../../apps/api/src/modules/auth/auth.controller";
import { FleetPartnerController } from "../../../apps/api/src/modules/fleet-partner/fleet-partner.controller";
import { deepToSnakeCase } from "../../../apps/api/src/common/snake-case.interceptor";
import { createFixture } from "./services";
import type { SupplySubmissionDetail as Detail } from "../../../apps/api/src/modules/fleet-partner/supply-submission.types";
import { getServerFleetPartnerClient } from "../../../apps/fleet-partner-portal-web/lib/api-client.server";
import * as proxy from "../../../apps/fleet-partner-portal-web/app/control-plane-proxy/[...path]/route";
import { normalizeFleetWire } from "../../../apps/fleet-partner-portal-web/lib/fleet-principal.server";

vi.mock("server-only", () => ({}));
const inbound = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => inbound.headers }));

const { Reflector } = createRequire(
  new URL("../../../apps/api/package.json", import.meta.url),
)("@nestjs/core");
const partner: BootstrapRequestIdentity = {
  authMode: "jwt_bearer",
  actorType: "partner_user",
  actorId: "original-fleet-owner",
  realm: "partner",
  tenantId: null,
  partnerId: "fleet-demo-001",
  roles: ["partner"],
  roleFamilies: ["partner"],
  scopes: ["billing:read", "partner:read", "partner:write"],
  requestId: null,
};
let fixture: ReturnType<typeof createFixture>;
let repository: IdentityRepository;
let jwt: JwtAuthService;
let guard: BootstrapAuthGuard;
let token: string;
let sessionId: string;
let calls: Array<{ path: string; headers: Headers; init: RequestInit }>;
let failPath: string | undefined;

// Socket-free HTTP boundary: discover actual Nest route and argument metadata,
// including CurrentIdentity's real factory. No controller, guard, session,
// Supply/Case service, document bytes or response normalization is mocked.
async function apiBoundary(
  input: string | URL | Request,
  init: RequestInit = {},
): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : input);
  if (url.hostname === "metadata.google.internal")
    return new Response("independent-invocation-token");
  calls.push({ path: url.pathname, headers: new Headers(init.headers), init });
  if (url.pathname === failPath) throw new Error("upstream unavailable");
  const isSession = url.pathname === "/api/auth/session";
  const klass = isSession ? AuthController : FleetPartnerController;
  const instance = isSession
    ? new AuthController(jwt, {} as never, {} as never)
    : fixture.controller;
  const routePath = url.pathname.replace(/^\/api\//, "");
  const methods = [
    "GET",
    "POST",
    "PUT",
    "DELETE",
    "PATCH",
    "ALL",
    "OPTIONS",
    "HEAD",
  ];
  for (const name of Object.getOwnPropertyNames(klass.prototype)) {
    const handler = Object.getOwnPropertyDescriptor(klass.prototype, name)
      ?.value as ((...args: unknown[]) => unknown) | undefined;
    if (typeof handler !== "function") continue;
    const path = Reflect.getMetadata("path", handler) as string | undefined;
    if (
      !path ||
      methods[Reflect.getMetadata("method", handler) as number] !==
        (init.method ?? "GET")
    )
      continue;
    const params: Record<string, string> = {};
    const mountedPath = [Reflect.getMetadata("path", klass), path]
      .filter(Boolean)
      .map((segment) => String(segment).replace(/^\/+|\/+$/g, ""))
      .filter(Boolean)
      .join("/");
    const pattern = mountedPath
      .split("/")
      .map((segment) => (segment.startsWith(":") ? "([^/]+)" : segment))
      .join("/");
    const match = new RegExp(`^${pattern}$`).exec(routePath);
    if (!match) continue;
    let capture = 1;
    for (const segment of mountedPath.split("/"))
      if (segment.startsWith(":"))
        params[segment.slice(1)] = decodeURIComponent(match[capture++]!);
    const headers = Object.fromEntries(new Headers(init.headers));
    const bytes =
      init.body instanceof ArrayBuffer
        ? Buffer.from(init.body)
        : Buffer.from(String(init.body ?? ""));
    const request = Object.assign(Readable.from([bytes]), {
      headers,
      method: init.method ?? "GET",
      url: url.pathname + url.search,
    }) as unknown as AuthenticatedRequestLike;
    const responseHeaders = new Headers();
    let responseBody: Buffer | string | undefined;
    const res = {
      setHeader: (key: string, value: string | number) =>
        responseHeaders.set(key, String(value)),
      send: (body: Buffer | string) => {
        responseBody = body;
      },
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => res,
      }),
      getHandler: () => handler,
      getClass: () => klass,
    };
    try {
      await guard.canActivate(context as never);
      const metadata = Reflect.getMetadata(
        "__routeArguments__",
        klass,
        name,
      ) as Record<
        string,
        {
          index: number;
          data?: string;
          factory?: (data: unknown, context: unknown) => unknown;
        }
      >;
      const args: unknown[] = [];
      for (const [key, arg] of Object.entries(metadata ?? {})) {
        const type = key.split(":")[0];
        if (arg.factory) args[arg.index] = arg.factory(arg.data, context);
        else if (type === "0") args[arg.index] = request;
        else if (type === "1") args[arg.index] = res;
        else if (type === "3")
          args[arg.index] = bytes.length ? JSON.parse(bytes.toString()) : {};
        else if (type === "4")
          args[arg.index] = arg.data
            ? (url.searchParams.get(arg.data) ?? undefined)
            : Object.fromEntries(url.searchParams);
        else if (type === "5")
          args[arg.index] = arg.data ? params[arg.data] : params;
        else if (type === "6")
          args[arg.index] = arg.data ? headers[arg.data] : headers;
        else throw new Error(`Unhandled Nest argument type: ${key}`);
      }
      const result = await handler.apply(instance, args);
      return responseBody !== undefined
        ? new Response(new Uint8Array(Buffer.from(responseBody)), {
            headers: responseHeaders,
          })
        : Response.json(deepToSnakeCase(result));
    } catch (e) {
      const error = e as {
        getStatus?: () => number;
        getResponse?: () => unknown;
      };
      if (!error.getStatus) throw e;
      return Response.json(error.getResponse!(), { status: error.getStatus() });
    }
  }
  throw new Error(
    `No production route matched ${init.method ?? "GET"} ${routePath}`,
  );
}
async function issue(
  overrides: Partial<BootstrapRequestIdentity> = {},
  expiresIn?: NonNullable<
    Parameters<JwtAuthService["issueSessionToken"]>[1]
  >["expiresIn"],
) {
  return jwt.issueSessionToken(
    { ...partner, ...overrides },
    expiresIn ? { expiresIn } : undefined,
  );
}
function setBearer(value = token) {
  inbound.headers = new Headers({ authorization: `Bearer ${value}` });
}
async function browser(
  path: string,
  method = "GET",
  body?: unknown,
  extra: Record<string, string> = {},
) {
  const binary = body instanceof Uint8Array;
  const request = new NextRequest(
    `https://portal.test/control-plane-proxy/${path}`,
    {
      method,
      headers: {
        cookie: `drts_session=${encodeURIComponent(token)}`,
        origin: "https://portal.test",
        "content-type": binary
          ? "application/octet-stream"
          : "application/json",
        ...extra,
      },
      ...(body !== undefined
        ? { body: binary ? (body as BodyInit) : JSON.stringify(body) }
        : {}),
    },
  );
  const forward = (proxy as unknown as Record<string, typeof proxy.GET>)[
    method
  ]!;
  return forward(request, {
    params: Promise.resolve({ path: path.split("?")[0]!.split("/") }),
  });
}
async function command<T>(
  path: string,
  method: string,
  body?: unknown,
): Promise<T> {
  const response = await browser(path, method, body);
  const value = normalizeFleetWire(await response.json()) as {
    data: T;
    error?: unknown;
  };
  expect(response.status, JSON.stringify(value)).toBe(200);
  return value.data;
}
beforeEach(async () => {
  vi.stubEnv("DRTS_ENV", "test");
  vi.stubEnv("JWT_SECRET", "mounted-real-fleet-session-test-secret");
  vi.stubEnv("DRTS_API_URL", "https://api.test");
  vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "https://api.test");
  vi.stubEnv("DRTS_FLEET_PARTNER_ID", partner.partnerId!);
  repository = new IdentityRepository();
  jwt = new JwtAuthService(repository);
  ({ token, sessionId } = await issue());
  guard = new BootstrapAuthGuard(new Reflector(), jwt);
  fixture = createFixture();
  calls = [];
  failPath = undefined;
  setBearer();
  vi.stubGlobal("fetch", vi.fn(apiBoundary));
  vi.stubEnv("DRTS_ENV", "staging");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("actual mounted dashboard, real lists, true empty data and errors preserve SDK wire fields and no-store", async () => {
  const { client } = await getServerFleetPartnerClient();
  const dashboard = await client.listFleetPortalDashboard("2026-03");
  expect(dashboard.fleetPartnerId).toBe(partner.partnerId);
  expect(dashboard.activeDriverCount).toBeGreaterThan(0);
  const drivers = await client.listFleetPortalDrivers();
  const vehicles = await client.listFleetPortalVehicles();
  expect(drivers.length).toBeGreaterThan(0);
  expect(vehicles.length).toBeGreaterThan(0);
  expect(dashboard.activeDriverCount).toBe(drivers.length);
  expect(dashboard.totalVehicleCount).toBe(vehicles.length);
  expect(await client.listFleetPortalSupplySubmissions()).toEqual([]);
  expect(calls.every((c) => c.init.cache === "no-store")).toBe(true);
  const missing = await client
    .getFleetPortalSupplySubmission("missing")
    .catch((error) => error);
  expect(missing).toBeInstanceOf(ApiClientError);
  expect(missing.statusCode).toBe(404);
  failPath = "/api/fleet-partner/drivers";
  expect((await browser("fleet-partner/drivers")).status).toBe(503);
  await expect(client.listFleetPortalDrivers()).rejects.toThrow(
    "upstream unavailable",
  );
});

it.each(["driver", "vehicle"])(
  "original %s create→draft/readback→document URL/content/confirm→submit→withdraw uses verified actor",
  async (kind) => {
    const driver = {
      name: "Original Driver",
      mobile: "5550100",
      professionalDriverLicenseNo: "LICENSE-1",
      professionalDriverLicenseExpiry: "2027-12-31",
      taxiDriverRegistrationNo: "TAXI-1",
      taxiDriverRegistrationArea: "TPE",
      taxiDriverRegistrationExpiry: "2027-12-31",
      supportedServiceProductCodes: ["taxi_realtime"],
    };
    const vehicle = {
      plateNo: "TEST-501",
      licenseType: "taxi",
      brand: "Toyota",
      model: "Sienta",
      modelYear: 2025,
      seatCount: 5,
      luggageCapacity: 2,
      businessArea: "TPE",
      supportedServiceProductCodes: ["taxi_realtime"],
      airportTransferEligible: false,
      fixedFareAllowed: false,
      doorCount: 4,
      color: "white",
    };

    const created = await command<Detail>(
      `fleet-partner/supply-submissions/${kind}s`,
      "POST",
      kind === "driver" ? driver : vehicle,
    );
    const id = created.submission.submissionId;
    const { client } = await getServerFleetPartnerClient();
    expect(
      (await client.getFleetPortalSupplySubmission(id)).submission.status,
    ).toBe("draft");
    const updated = await command<Detail>(
      `fleet-partner/supply-submissions/${id}/${kind}`,
      "PUT",
      { ...(kind === "driver" ? driver : vehicle), expectedRevisionNo: 1 },
    );
    expect(updated.submission.revisionNo).toBe(2);
    const documents =
      kind === "driver"
        ? ["professional_driver_license", "taxi_driver_registration"]
        : [
            "vehicle_registration",
            "insurance_policy",
            "fleet_participation_contract",
          ];
    let revision = updated.submission.revisionNo;
    for (const documentType of documents) {
      const bytes = Buffer.alloc(1024, documentType);
      const checksumSha256 = createHash("sha256").update(bytes).digest("hex");
      const originalFileName = `${documentType}.pdf`;
      const upload = await command<{ objectKey: string }>(
        `fleet-partner/supply-submissions/${id}/documents/upload-url`,
        "POST",
        {
          expectedRevisionNo: revision,
          documentType,
          originalFileName,
          contentType: "application/pdf",
        },
      );
      const content = await browser(
        `fleet-partner/supply-submissions/${id}/documents/content?objectKey=${encodeURIComponent(upload.objectKey)}`,
        "PUT",
        bytes,
      );
      expect(content.status).toBe(200);
      await command(
        `fleet-partner/supply-submissions/${id}/documents/confirm`,
        "POST",
        {
          expectedRevisionNo: revision,
          documentType,
          objectKey: upload.objectKey,
          originalFileName,
          contentType: "application/pdf",
          fileSize: bytes.length,
          checksumSha256,
          effectiveFrom: "2026-01-01",
          effectiveUntil: "2027-12-31",
        },
      );
      revision = (await client.getFleetPortalSupplySubmission(id)).submission
        .revisionNo;
    }
    const readback = await client.getFleetPortalSupplySubmission(id);
    expect(readback.documents).toHaveLength(documents.length);
    for (const doc of readback.documents) {
      expect(doc.uploadedBy).toBe(partner.actorId);
      const download = await browser(
        `fleet-partner/supply-submissions/${id}/documents/${doc.documentId}/download`,
      );
      expect(download.headers.get("content-type")).toBe("application/pdf");
      expect(Buffer.from(await download.arrayBuffer())).toEqual(
        Buffer.alloc(1024, doc.documentType),
      );
    }
    const submitted = await command<Detail>(
      `fleet-partner/supply-submissions/${id}/submit`,
      "POST",
      { expectedRevisionNo: revision },
    );
    expect(submitted.submission.status).toBe("submitted");
    expect(submitted.submission.submittedBy).toBe(partner.actorId);
    expect(
      (await client.getFleetPortalSupplySubmission(id)).submission.submittedBy,
    ).toBe(partner.actorId);
    const withdrawn = await command<Detail>(
      `fleet-partner/supply-submissions/${id}/withdraw`,
      "POST",
      { expectedRevisionNo: submitted.submission.revisionNo },
    );
    expect(withdrawn.submission.status).toBe("withdrawn");
  },
);

it("original case reply request/actor/readback follows the existing same-fleet service without claiming CRM persistence", async () => {
  vi.stubEnv("DRTS_FLEET_PARTNER_ID", "METRO_FLEET");
  token = (await issue({ partnerId: "METRO_FLEET" })).token;
  setBearer();
  const reply = await command<{ actorId: string; content: string }>(
    "fleet-partner/cases/cmp_0908/reply",
    "POST",
    { content: "Verified original response", idempotencyKey: "reply-1" },
  );
  expect(reply.actorId).toBe(partner.actorId);
  const { client } = await getServerFleetPartnerClient();
  const timeline = await client.get<{
    items: Array<{ actor: string; body: string }>;
  }>("/api/fleet-partner/cases/cmp_0908/timeline");
  expect(
    timeline.items.some(
      (entry) =>
        entry.actor === `${partner.actorId} (METRO_FLEET)` &&
        entry.body === reply.content,
    ),
  ).toBe(true);
});

it.each([
  "expired",
  "revoked",
  "realm",
  "scope",
  "binding",
  "fleet",
  "missing",
])("%s principal is rejected on both mounted entrypoints", async (scenario) => {
  if (scenario === "expired") token = (await issue({}, "0s")).token;
  if (scenario === "revoked")
    await repository.revokeSession(sessionId, "test revocation");
  if (scenario === "realm")
    token = (
      await issue({
        realm: "tenant",
        actorType: "tenant_admin",
        tenantId: partner.partnerId!,
        partnerId: null,
      })
    ).token;
  if (scenario === "scope")
    token = (await issue({ scopes: ["partner:read"] })).token;
  if (scenario === "binding") token = (await issue({ partnerId: null })).token;
  if (scenario === "fleet")
    token = (await issue({ partnerId: "other-fleet" })).token;
  setBearer(scenario === "missing" ? "" : token);
  if (scenario === "missing") inbound.headers = new Headers();
  await expect(getServerFleetPartnerClient()).rejects.toBeInstanceOf(
    ApiClientError,
  );
  const response = await browser(
    "fleet-partner/drivers",
    "GET",
    undefined,
    scenario === "missing" ? { cookie: "" } : {},
  );
  expect([401, 403]).toContain(response.status);
  expect(calls.filter((c) => c.path.startsWith("/api/fleet-partner/"))).toEqual(
    [],
  );
});

it("spoofed selector, cross-origin and malformed path reject; spoofed role/actor headers never acquire authority", async () => {
  expect(
    (
      await browser("fleet-partner/drivers", "GET", undefined, {
        "x-fleet-partner-id": "other-fleet",
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await browser("fleet-partner/drivers", "GET", undefined, {
        origin: "https://evil.test",
      })
    ).status,
  ).toBe(403);
  const response = await browser("fleet-partner/drivers", "GET", undefined, {
    "x-realm": "platform",
    "x-actor-id": "spoof",
    "x-scopes": "*",
    "x-drts-authorization": `Bearer ${token}`,
    "x-serverless-authorization": "Bearer spoof-infra",
  });
  expect(response.status).toBe(200);
  const sent = calls.at(-1)!;
  expect(sent.headers.get("authorization")).toBe(`Bearer ${token}`);
  expect(sent.headers.get("x-serverless-authorization")).toBe(
    "Bearer independent-invocation-token",
  );
  expect(sent.headers.has("x-actor-id")).toBe(false);
  expect(sent.headers.has("x-scopes")).toBe(false);
  inbound.headers.set("x-fleet-partner-id", "other-fleet");
  await expect(getServerFleetPartnerClient()).rejects.toMatchObject({
    code: "FLEET_SCOPE_DENIED",
  });
});

it("revocation remains enforced by the actual guard after a server client was resolved", async () => {
  const { client } = await getServerFleetPartnerClient();
  await repository.revokeSession(sessionId, "logout");
  await expect(client.listFleetPortalDrivers()).rejects.toMatchObject({
    statusCode: 401,
  });
});
it("proxy preserves streamed content/status/disposition and JSON error details without consuming the upstream body", async () => {
  let pulls = 0;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array([0, 255, 1]));
        controller.close();
      },
    },
    { highWaterMark: 0 },
  );
  const original = apiBoundary;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
      const url = new URL(input instanceof Request ? input.url : input);
      if (url.pathname === "/api/fleet-partner/stream")
        return new Response(stream, {
          status: 206,
          headers: {
            "content-type": "application/octet-stream",
            "content-disposition": "attachment; filename=proof.bin",
            etag: "proof-revision-1",
          },
        });
      if (url.pathname === "/api/fleet-partner/error")
        return Response.json(
          {
            error: {
              code: "ORIGINAL_REVISION_CONFLICT",
              message: "stale",
              details: { canonical_id: "submission-1" },
              retryable: false,
              trace_id: "trace-1",
            },
          },
          { status: 409 },
        );
      return original(input, init);
    }),
  );
  const response = await browser("fleet-partner/stream");
  expect(response.status).toBe(206);
  expect(pulls).toBe(0);
  expect(response.headers.get("content-disposition")).toBe(
    "attachment; filename=proof.bin",
  );
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(
    new Uint8Array([0, 255, 1]),
  );
  const errorResponse = await browser("fleet-partner/error");
  expect(errorResponse.status).toBe(409);
  expect((await errorResponse.json()).error.details).toEqual({
    canonical_id: "submission-1",
  });
  const { client } = await getServerFleetPartnerClient();
  await expect(client.get("/api/fleet-partner/error")).rejects.toMatchObject({
    code: "ORIGINAL_REVISION_CONFLICT",
    traceId: "trace-1",
    details: { canonical_id: "submission-1" },
  });
});
