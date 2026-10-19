import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { Readable, Writable } from "node:stream";
import { finished } from "node:stream/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as proxy from "../../apps/fleet-partner-portal-web/app/control-plane-proxy/[...path]/route";
import { middleware } from "../../apps/fleet-partner-portal-web/middleware";
import { JwtAuthService } from "../../apps/api/src/common/auth/jwt-auth.service";
import { IdentityRepository } from "../../apps/api/src/modules/identity/identity.repository";
import { BootstrapAuthGuard } from "../../apps/api/src/common/auth/bootstrap-auth.guard";
import type { BootstrapRequestIdentity } from "../../apps/api/src/common/auth/auth.types";
import { createFixture } from "./fleet-portal-verified-principal-canonical-caller-flow-20261015/services";
import { createApiBoundary } from "./fleet-portal-verified-principal-canonical-caller-flow-20261015/http-boundary";
import { normalizeFleetWire } from "../../apps/fleet-partner-portal-web/lib/fleet-principal.server";
import type { SupplySubmissionDetail } from "../../apps/fleet-partner-portal-web/lib/fleet-portal-supply";
import type { FleetDocumentUploadIntent } from "../../apps/fleet-partner-portal-web/lib/fleet-document-upload";

const runtime = vi.hoisted(() => ({
  handler: undefined as
    | ((req: IncomingMessage, res: ServerResponse) => Promise<void>)
    | undefined,
  listen: vi.fn(),
  spawn: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("node:http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:http")>();
  return {
    ...actual,
    default: {
      ...actual,
      createServer: (handler: typeof runtime.handler) => {
        runtime.handler = handler;
        return { listen: runtime.listen };
      },
    },
  };
});
vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  spawn: (...args: unknown[]) => runtime.spawn(...args),
}));
const { Reflector } = createRequire(
  resolve(process.cwd(), "apps/api/package.json"),
)("@nestjs/core");
const externalOrigin = "https://fleet.example.test";
const driver = {
  name: "Wrapper Driver",
  mobile: "5550100",
  professionalDriverLicenseNo: "LICENSE-1",
  professionalDriverLicenseExpiry: "2027-12-31",
  taxiDriverRegistrationNo: "TAXI-1",
  taxiDriverRegistrationArea: "TPE",
  taxiDriverRegistrationExpiry: "2027-12-31",
  supportedServiceProductCodes: ["taxi_realtime"],
  preferredVehicleSubmissionId: null,
};
const identity: BootstrapRequestIdentity = {
  authMode: "jwt_bearer",
  actorType: "partner_user",
  actorId: "wrapper-verified-owner",
  partnerId: "fleet-1",
  realm: "partner",
  tenantId: null,
  roles: ["partner"],
  roleFamilies: ["partner"],
  scopes: ["billing:read", "partner:read", "partner:write"],
  requestId: null,
};
let bearer: string;
let jwt: JwtAuthService;
let sessionId: string;
let fixture: ReturnType<typeof createFixture>;
let calls: Array<{ path: string; headers: Headers; init: RequestInit }>;
let nextCalls: Array<{ url: URL; headers: Headers }>;
let customNextResponse: (() => Response) | undefined;

beforeEach(async () => {
  vi.stubEnv("DRTS_ENV", "test");
  vi.stubEnv("JWT_SECRET", "wrapper-origin-socket-free-test-key");
  vi.stubEnv("DRTS_FLEET_PARTNER_ID", "fleet-1");
  vi.stubEnv("DRTS_API_URL", "https://api.test");
  vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "https://api.test");
  vi.stubEnv("DRTS_FLEET_PORTAL_AUTH_REQUIRED", "");
  vi.stubEnv("K_SERVICE", "fleet-cloud-run-test");
  fixture = createFixture();
  jwt = new JwtAuthService(new IdentityRepository());
  const issued = await jwt.issueSessionToken(identity);
  bearer = issued.token;
  sessionId = issued.sessionId;
  calls = [];
  nextCalls = [];
  customNextResponse = undefined;
  const api = createApiBoundary({
    fixture,
    jwt,
    guard: new BootstrapAuthGuard(new Reflector(), jwt),
    calls,
  });
  vi.stubGlobal(
    "fetch",
    async (input: string | URL | Request, init: RequestInit = {}) => {
      const url = new URL(input instanceof Request ? input.url : input);
      if (url.hostname !== "127.0.0.1") return api(input, init);
      nextCalls.push({ url, headers: new Headers(init.headers) });
      if (customNextResponse) return customNextResponse();
      // The real runtime invokes Next on fixed loopback HTTP. Run the actual
      // cookie/CSRF middleware and actual proxy, not an invented origin guard.
      const { signal, ...nextInit } = init;
      const request = new NextRequest(url, {
        ...nextInit,
        ...(signal ? { signal } : {}),
      });
      const guarded = middleware(request);
      if (guarded.status !== 200) return guarded;
      const method = (init.method ?? "GET") as "GET" | "POST" | "PUT";
      return proxy[method](request, {
        params: Promise.resolve({
          path: url.pathname.replace(/^\/control-plane-proxy\//, "").split("/"),
        }),
      });
    },
  );
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  await loadRuntime("apps/fleet-partner-portal-web/server.js", "3107");
  vi.stubEnv("DRTS_ENV", "staging");
});
async function loadRuntime(entry: string, port: string) {
  runtime.spawn.mockClear();
  runtime.listen.mockClear();
  runtime.spawn.mockReturnValue(
    Object.assign(new EventEmitter(), { kill: vi.fn() }),
  );
  const argv = process.argv;
  process.argv = [process.execPath, "wrapper", entry, port];
  const signals = vi.spyOn(process, "on").mockImplementation(function () {
    return process;
  });
  try {
    vi.resetModules();
    const wrapperPath = "../../runtime/web/control-plane-web-proxy.mjs";
    await import(wrapperPath);
  } finally {
    signals.mockRestore();
    process.argv = argv;
  }
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

async function throughWrapper(
  options: {
    origin?: string | null;
    host?: string | string[];
    rawHeaders?: string[];
    headers?: Record<string, string | undefined>;
    method?: string;
    path?: string;
    body?: Buffer;
    encrypted?: boolean;
  } = {},
) {
  const headersIn: Record<string, string | string[] | undefined> = {
    host: options.host ?? "fleet.example.test",
    origin:
      options.origin === null ? undefined : (options.origin ?? externalOrigin),
    cookie: `drts_session=${bearer}; drts_csrf=original-csrf`,
    "x-csrf-token": "original-csrf",
    "content-type": "application/json",
    ...options.headers,
  };
  const req = Object.assign(
    Readable.from([options.body ?? Buffer.from(JSON.stringify(driver))]),
    {
      method: options.method ?? "POST",
      url:
        options.path ??
        "/control-plane-proxy/fleet-partner/supply-submissions/drivers",
      headers: headersIn,
      rawHeaders:
        options.rawHeaders ??
        Object.entries(headersIn).flatMap(([key, value]) =>
          value === undefined
            ? []
            : [key, ...(Array.isArray(value) ? value : [value])],
        ),
      socket: { encrypted: options.encrypted ?? false },
    },
  );
  const chunks: Buffer[] = [];
  const headers = new Headers();
  const res = Object.assign(
    new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.from(chunk));
        callback();
      },
    }),
    {
      statusCode: 200,
      headersSent: false,
      setHeader: (key: string, value: string) => headers.set(key, value),
    },
  );
  const complete = finished(res);
  await runtime.handler!(
    req as unknown as IncomingMessage,
    res as unknown as ServerResponse,
  );
  await complete;
  return { status: res.statusCode, headers, body: Buffer.concat(chunks) };
}

describe("public runtime wrapper composed with real Fleet handler", () => {
  it("accepts the genuine external HTTPS browser POST with verified fleet and CSRF", async () => {
    const response = await throughWrapper();
    expect(response.status).toBe(200);
    const body = JSON.parse(response.body.toString());
    expect(body.data.submission.fleet_partner_id).toBe(identity.partnerId);
    expect(body.data.submission.status).toBe("draft");
    expect(calls.at(-1)?.headers.get("authorization")).toBe(`Bearer ${bearer}`);
    expect(calls.at(-1)?.headers.get("x-serverless-authorization")).toBe(
      "Bearer independent-invocation-token",
    );
  });
  it("continues rejecting a foreign browser Origin before any backend call", async () => {
    const response = await throughWrapper({
      origin: "https://foreign.example.test",
    });
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(JSON.parse(response.body.toString()).error.code).toBe(
      "FLEET_ORIGIN_DENIED",
    );
    expect(calls).toHaveLength(0);
  });
  it("rebuilds provenance even without Origin and never leaks it to the API", async () => {
    const response = await throughWrapper({
      origin: null,
      headers: { "x-drts-runtime-origin": "https://forged.test" },
    });
    expect(response.status).toBe(200);
    expect(nextCalls[0]?.headers.get("x-drts-runtime-origin")).toBe(
      externalOrigin,
    );
    expect(calls.length).toBeGreaterThan(0);
    expect(
      calls.every((call) => !call.headers.has("x-drts-runtime-origin")),
    ).toBe(true);
  });
  it.each([
    "",
    "null",
    "https://fleet.example.test.evil",
    "http://fleet.example.test",
    "https://fleet.example.test/path",
    "https://fleet.example.test, https://fleet.example.test",
    "https://user@fleet.example.test",
    "https://fleet.example.test:444",
  ])("rejects malformed or mismatched browser Origin %s", async (origin) => {
    const response = await throughWrapper({ origin });
    expect(response.status).toBe(403);
    expect(calls).toHaveLength(0);
  });
  it("replaces caller provenance and ignores all forged forwarding authorities", async () => {
    const response = await throughWrapper({
      origin: "https://foreign.example.test",
      headers: {
        "x-drts-runtime-origin": "https://foreign.example.test",
        "x-forwarded-host": "foreign.example.test",
        "x-forwarded-proto": "https",
        "x-forwarded-for": "127.0.0.1",
        "x-forwarded-port": "443",
        forwarded: "host=foreign.example.test;proto=https",
      },
    });
    expect(response.status).toBe(403);
    expect(nextCalls[0]?.headers.get("x-drts-runtime-origin")).toBe(
      externalOrigin,
    );
    for (const header of [
      "forwarded",
      "x-forwarded-host",
      "x-forwarded-for",
      "x-forwarded-port",
      "x-forwarded-proto",
    ])
      expect(nextCalls[0]?.headers.has(header)).toBe(false);
    expect(calls).toHaveLength(0);
  });
  it.each([
    "fleet.example.test,foreign.test",
    "fleet.example.test/",
    "user@fleet.example.test",
    "fleet.example.test:0",
    "fleet.example.test:65536",
    "fleet.example.test:abc",
    "fleet.example.test?x",
    "fleet.example.test#x",
    "fleet.example.test\\evil",
    " fleet.example.test",
    "fleet..example.test",
    "127.1",
    "[invalid]",
  ])("rejects invalid ingress authority %s before the child", async (host) => {
    const response = await throughWrapper({ host });
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(nextCalls).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });
  it.each([
    { host: ["fleet.example.test", "foreign.test"] },
    { headers: { host: undefined } },
    { rawHeaders: ["Host", "fleet.example.test", "HOST", "foreign.test"] },
    { path: "https://foreign.test/control-plane-proxy/fleet-partner/drivers" },
    { path: "//foreign.test/control-plane-proxy/fleet-partner/drivers" },
  ])(
    "rejects multivalued/duplicate Host or request-target authority override %#",
    async (options) => {
      expect((await throughWrapper(options)).status).toBe(400);
      expect(nextCalls).toHaveLength(0);
    },
  );
  it("keeps real cookie CSRF denial ahead of any session or command", async () => {
    const response = await throughWrapper({
      headers: { "x-csrf-token": undefined },
    });
    expect(response.status).toBe(403);
    expect(JSON.parse(response.body.toString()).error).toBe(
      "CSRF_TOKEN_INVALID",
    );
    expect(calls).toHaveLength(0);
  });
  it("does not make provenance or an invocation token into a missing application principal", async () => {
    const response = await throughWrapper({
      headers: {
        cookie: undefined,
        "x-serverless-authorization": "Bearer infrastructure-only",
      },
    });
    expect(response.status).toBe(401);
    expect(JSON.parse(response.body.toString()).error.code).toBe(
      "FLEET_PRINCIPAL_REQUIRED",
    );
    expect(calls).toHaveLength(0);
  });
  it("retains canonical fleet isolation despite generated caller metadata", async () => {
    const response = await throughWrapper({
      headers: {
        "x-fleet-partner-id": "foreign-fleet",
        "x-actor-id": "forged",
        "x-scopes": "*",
      },
    });
    expect(response.status).toBe(403);
    expect(JSON.parse(response.body.toString()).error.code).toBe(
      "FLEET_SCOPE_DENIED",
    );
    expect(calls.map((call) => call.path)).toEqual(["/api/auth/session"]);
  });
  it.each([
    "wrong-realm",
    "wrong-scope",
    "revoked",
    "expired",
    "invalid-signature",
  ])(
    "preserves the original %s principal rejection through the wrapper",
    async (kind) => {
      if (kind === "revoked") {
        const revoked = await jwt.revokeCurrentSession(sessionId);
        expect(revoked?.sessionId).toBe(sessionId);
      } else if (kind === "invalid-signature") {
        bearer = "not-a-valid-application-token";
      } else {
        vi.stubEnv("DRTS_ENV", "test");
        if (kind === "expired") {
          vi.useFakeTimers();
          vi.setSystemTime(Date.now() - 60000);
        }
        bearer = (
          await jwt.issueSessionToken(
            kind === "wrong-realm"
              ? {
                  ...identity,
                  realm: "tenant",
                  actorType: "tenant_admin",
                  tenantId: "tenant-1",
                  partnerId: null,
                }
              : kind === "wrong-scope"
                ? { ...identity, scopes: ["partner:read"] }
                : identity,
            kind === "expired" ? { expiresIn: "1s" } : undefined,
          )
        ).token;
        vi.useRealTimers();
        vi.stubEnv("DRTS_ENV", "staging");
      }
      const response = await throughWrapper();
      expect(response.status).toBe(
        kind === "wrong-realm" || kind === "wrong-scope" ? 403 : 401,
      );
      expect(calls.length).toBeGreaterThan(0);
      expect(calls.every((call) => call.path === "/api/auth/session")).toBe(
        true,
      );
    },
  );
  it("does not infer HTTPS from forged forwarding in a non-Cloud-Run HTTP runtime", async () => {
    vi.stubEnv("K_SERVICE", "");
    const response = await throughWrapper({
      headers: {
        "x-forwarded-proto": "https",
        "x-drts-runtime-origin": externalOrigin,
      },
    });
    expect(response.status).toBe(403);
    expect(nextCalls[0]?.headers.get("x-drts-runtime-origin")).toBe(
      "http://fleet.example.test",
    );
  });
  it.each([
    {
      host: "fleet.example.test:8443",
      origin: "https://fleet.example.test:8443",
    },
    { host: "fleet.example.test:443", origin: externalOrigin },
    { host: "[::1]:8443", origin: "https://[::1]:8443" },
  ])("preserves a valid canonical authority and port %#", async (options) => {
    expect((await throughWrapper(options)).status).toBe(200);
    expect(nextCalls[0]?.url.origin).toBe("http://127.0.0.1:3107");
  });
  it("keeps real TLS origin when outside Cloud Run", async () => {
    vi.stubEnv("K_SERVICE", "");
    expect((await throughWrapper({ encrypted: true })).status).toBe(200);
  });
  it("creates, uploads two real required documents, submits, withdraws and resubmits the same original draft", async () => {
    async function command<T>(
      path: string,
      method = "GET",
      body?: unknown,
    ): Promise<T> {
      const response = await throughWrapper({
        path: `/control-plane-proxy/fleet-partner/supply-submissions${path}`,
        method,
        ...(body === undefined
          ? {}
          : { body: Buffer.from(JSON.stringify(body)) }),
      });
      expect(response.status).toBe(200);
      return (
        normalizeFleetWire(JSON.parse(response.body.toString())) as { data: T }
      ).data;
    }
    const created = await command<SupplySubmissionDetail>(
      "/drivers",
      "POST",
      driver,
    );
    const id = created.submission.submissionId;
    let revision = created.submission.revisionNo;
    for (const documentType of [
      "professional_driver_license",
      "taxi_driver_registration",
    ]) {
      const bytes = Buffer.alloc(1024, documentType);
      const fileName = `${documentType}.pdf`;
      const intent = await command<
        FleetDocumentUploadIntent & { objectKey: string }
      >(`/${id}/documents/upload-url`, "POST", {
        expectedRevisionNo: revision,
        documentType,
        originalFileName: fileName,
        contentType: "application/pdf",
      });
      const upload = await throughWrapper({
        method: "PUT",
        path:
          new URL(intent.uploadUrl, externalOrigin).pathname.replace(
            /^\/api\//,
            "/control-plane-proxy/",
          ) + new URL(intent.uploadUrl, externalOrigin).search,
        body: bytes,
        headers: intent.headers,
      });
      expect(upload.status).toBe(200);
      expect(JSON.parse(upload.body.toString()).data.scan_state).toBe("clean");
      await command(`/${id}/documents/confirm`, "POST", {
        expectedRevisionNo: revision,
        documentType,
        objectKey: intent.objectKey,
        originalFileName: fileName,
        contentType: "application/pdf",
        fileSize: bytes.length,
        checksumSha256: createHash("sha256").update(bytes).digest("hex"),
        effectiveFrom: "2026-01-01",
        effectiveUntil: "2027-12-31",
      });
      const detail = await command<SupplySubmissionDetail>(`/${id}`);
      revision = detail.submission.revisionNo;
      const doc = detail.documents.find(
        (doc) => doc.documentType === documentType,
      )!;
      expect(doc.uploadedBy).toBe(identity.actorId);
      const downloaded = await throughWrapper({
        path: `/control-plane-proxy/fleet-partner/supply-submissions/${id}/documents/${doc.documentId}/download`,
        method: "GET",
      });
      expect(downloaded.status).toBe(200);
      expect(downloaded.body.equals(bytes)).toBe(true);
    }
    for (const [action, status] of [
      ["submit", "submitted"],
      ["withdraw", "withdrawn"],
      ["submit", "submitted"],
    ]) {
      const detail = await command<SupplySubmissionDetail>(
        `/${id}/${action}`,
        "POST",
        { expectedRevisionNo: revision },
      );
      expect(detail.submission.submissionId).toBe(id);
      expect(detail.submission.status).toBe(status);
      expect(detail.submission.submittedBy).toBe(identity.actorId);
      revision = detail.submission.revisionNo;
    }
    expect(
      calls
        .filter((call) => call.path.startsWith("/api/fleet-partner/"))
        .every(
          (call) =>
            !call.headers.has("x-drts-runtime-origin") &&
            !call.headers.has("x-actor-id") &&
            call.headers.get("authorization") === `Bearer ${bearer}` &&
            call.headers.get("x-serverless-authorization") ===
              "Bearer independent-invocation-token",
        ),
    ).toBe(true);
  });
  it.each([
    ["platform-admin-web", "3102"],
    ["ops-console-web", "3103"],
    ["tenant-console-web", "3104"],
    ["fleet-partner-portal-web", "3107"],
    ["channel-partner-portal-web", "3107"],
    ["roc-console-web", "3110"],
  ])(
    "keeps the actual %s Docker entry loopback-bound with cookie/token/stream/status preserved",
    async (app, port) => {
      const entry = `apps/${app}/server.js`;
      expect(readFileSync(`apps/${app}/Dockerfile`, "utf8")).toContain(
        `"${entry}", "${port}"`,
      );
      await loadRuntime(entry, port!);
      expect(runtime.spawn.mock.calls[0]?.[2].env.HOSTNAME).toBe("127.0.0.1");
      expect(runtime.spawn.mock.calls[0]?.[2].env.PORT).toBe(port);
      expect(runtime.spawn.mock.calls[0]?.[1]).toEqual([entry]);
      expect(runtime.listen.mock.calls[0]?.[1]).toBe("0.0.0.0");
      customNextResponse = () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array([0, 1, 255]));
              controller.enqueue(new Uint8Array([2, 3]));
              controller.close();
            },
          }),
          {
            status: 206,
            headers: {
              "set-cookie": "response_cookie=unchanged; HttpOnly",
              "content-type": "application/octet-stream",
              "cache-control": "private, no-store",
            },
          },
        );
      const response = await throughWrapper({
        path: "/arbitrary-page?original=1",
        headers: {
          authorization: "Bearer invocation-token",
          "x-drts-authorization": "Bearer application-token",
          "x-drts-runtime-origin": "https://forged.test",
          "x-forwarded-host": "forged.test",
        },
      });
      expect(response.status).toBe(206);
      expect([...response.body]).toEqual([0, 1, 255, 2, 3]);
      expect(response.headers.get("set-cookie")).toBe(
        "response_cookie=unchanged; HttpOnly",
      );
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(nextCalls[0]?.url.href).toBe(
        `http://127.0.0.1:${port}/arbitrary-page?original=1`,
      );
      const forwarded = nextCalls[0]!.headers;
      expect(forwarded.get("origin")).toBe(externalOrigin);
      expect(forwarded.get("authorization")).toBe("Bearer invocation-token");
      expect(forwarded.get("x-drts-authorization")).toBe(
        "Bearer application-token",
      );
      expect(
        forwarded.get("cookie") ===
          `drts_session=${bearer}; drts_csrf=original-csrf`,
      ).toBe(true);
      expect(forwarded.has("x-forwarded-host")).toBe(false);
      expect(forwarded.get("x-drts-runtime-origin")).toBe(
        app === "fleet-partner-portal-web" ? externalOrigin : null,
      );
    },
  );
  it("strips supplied provenance on originless requests and fails closed for an unrecognized child entry", async () => {
    await loadRuntime("custom-next-server.js", "3107");
    const response = await throughWrapper({
      origin: null,
      headers: { "x-drts-runtime-origin": externalOrigin },
    });
    expect(response.status).toBe(200);
    expect(nextCalls[0]?.headers.has("x-drts-runtime-origin")).toBe(false);
    expect((await throughWrapper()).status).toBe(403);
  });
});
