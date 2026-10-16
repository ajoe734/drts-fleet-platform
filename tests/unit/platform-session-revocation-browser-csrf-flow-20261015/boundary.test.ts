import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../../../apps/platform-admin-web/app/control-plane-proxy/[...path]/route";
import { GET as issue } from "../../../apps/platform-admin-web/app/api/identity-session-csrf/route";
import { ApiClient } from "../../../packages/api-client/src";
import { PlatformAdminIamClient } from "../../../apps/platform-admin-web/lib/platform-admin-iam-client";
import { IDENTITY_SESSION_CSRF_COOKIE as cookieName } from "../../../apps/platform-admin-web/lib/identity-session-csrf";

const origin = "https://platform.example";
const path = ["identity", "sessions", "test-own-session", "revoke"];
const context = { params: Promise.resolve({ path }) };

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("CONTROL_PLANE_IAP_ENABLED", "false");
  vi.stubEnv("DRTS_ENV", "local");
  vi.stubEnv("DRTS_API_URL", "http://upstream.invalid");
  vi.stubEnv("BFF_STATE_SECRET", "controlled-csrf-test-server-secret");
});

async function proof() {
  const response = await issue(
    new NextRequest(`${origin}/api/identity-session-csrf`, {
      headers: { referer: `${origin}/users` },
    }),
  );
  expect(response.status).toBe(200);
  const { token } = await response.json();
  const cookie = response.headers.get("set-cookie")!.split(";")[0]!;
  return { response, token: token as string, cookie };
}

function revoke(headers: Record<string, string>, targetPath = path) {
  return POST(
    new NextRequest(`${origin}/control-plane-proxy/${targetPath.join("/")}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ reason: "admin_manual_revoke" }),
    }),
    { params: Promise.resolve({ path: targetPath }) },
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it("stops the accepted JSON browser revoke without proof before upstream authorization or fetch", async () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("IAP_ENABLED", "false");
  vi.stubEnv("DRTS_ENV", "local");
  vi.stubEnv("DRTS_API_URL", "http://upstream.invalid");
  const upstream = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(Response.json({ data: { revoked: true } }));
  const response = await POST(
    new NextRequest(
      "https://platform.example/control-plane-proxy/identity/sessions/test-own-session/revoke",
      {
        method: "POST",
        headers: {
          origin: "https://platform.example",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          reason: "admin_manual_revoke",
          isCompromised: true,
        }),
      },
    ),
    {
      params: Promise.resolve({
        path: ["identity", "sessions", "test-own-session", "revoke"],
      }),
    },
  );
  expect(response.status).toBe(403);
  expect(upstream).not.toHaveBeenCalled();
});

it("issues a random app-local no-store proof and reuses its signed host cookie", async () => {
  const { response, token, cookie } = await proof();
  expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  expect(response.headers.get("set-cookie")).toContain("Secure");
  expect(response.headers.get("set-cookie")).toContain("SameSite=lax");
  expect(response.headers.get("set-cookie")).toContain("Path=/");
  expect(response.headers.get("set-cookie")).not.toMatch(/Domain=|Max-Age=0/);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const repeat = await issue(
    new NextRequest(`${origin}/api/identity-session-csrf`, {
      headers: { origin, cookie },
    }),
  );
  expect(await repeat.json()).toEqual({ token });
  expect((await proof()).token).not.toBe(token);
});

it.each([
  {},
  { origin: "https://foreign.example" },
  { origin: "null" },
  { referer: "unvalidated" },
  { referer: "https://platform.example.foreign.example/users" },
  { origin: "https://foreign.example", referer: `${origin}/users` },
])("denies proof issuance with invalid origin evidence %j", async (headers) => {
  const response = await issue(
    new NextRequest(`${origin}/api/identity-session-csrf`, {
      headers: headers as Record<string, string>,
    }),
  );
  expect(response.status).toBe(403);
  expect(response.headers.get("set-cookie")).toBeNull();
});

it.each([
  "missing-header",
  "missing-cookie",
  "mismatch",
  "forged-pair",
  "tampered-mac",
  "duplicate-cookie",
  "wrong-origin",
  "missing-origin",
  "bad-referer",
  "foreign-form",
])("denies %s before any upstream fetch", async (scenario) => {
  const { token, cookie } = await proof();
  const headers: Record<string, string> = {
    origin,
    cookie,
    "x-csrf-token": token,
    "content-type": "application/json",
  };
  if (scenario === "missing-header") delete headers["x-csrf-token"];
  if (scenario === "missing-cookie") delete headers.cookie;
  if (scenario === "mismatch") headers["x-csrf-token"] = "b".repeat(43);
  if (scenario === "forged-pair") {
    headers.cookie = `${cookieName}=${"b".repeat(43)}.${"c".repeat(43)}`;
    headers["x-csrf-token"] = "b".repeat(43);
  }
  if (scenario === "tampered-mac") headers.cookie = `${cookie.slice(0, -2)}zz`;
  if (scenario === "duplicate-cookie") headers.cookie = `${cookie}; ${cookie}`;
  if (scenario === "wrong-origin") {
    headers.origin = "https://foreign.example";
    headers.referer = `${origin}/users`;
  }
  if (scenario === "missing-origin") delete headers.origin;
  if (scenario === "bad-referer") {
    delete headers.origin;
    headers.referer = "not-a-url";
  }
  if (scenario === "foreign-form") {
    headers.origin = "https://foreign.example";
    headers["content-type"] = "application/x-www-form-urlencoded";
    delete headers["x-csrf-token"];
  }
  const upstream = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("must not forward"));
  expect((await revoke(headers)).status).toBe(403);
  expect(upstream).not.toHaveBeenCalled();
});

it("accepts same-origin and validated Referer with reusable proof, stripping cookies and forged auth headers", async () => {
  const { token, cookie } = await proof();
  const upstream = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(Response.json({ data: {} }));
  for (const originEvidence of [{ origin }, { referer: `${origin}/users` }]) {
    expect(
      (
        await revoke({
          ...originEvidence,
          cookie,
          "x-csrf-token": token,
          "x-auth-mode": "cookie",
          "x-roles": "forged",
          "x-scopes": "forged",
        })
      ).status,
    ).toBe(200);
  }
  expect(upstream).toHaveBeenCalledTimes(2);
  const forwarded = new Headers(upstream.mock.calls[0]![1]?.headers);
  expect(forwarded.has("cookie")).toBe(false);
  expect(forwarded.get("x-scopes")).not.toBe("forged");
  expect(forwarded.get("x-roles")).not.toBe("forged");
  expect(forwarded.get("x-auth-mode")).not.toBe("cookie");
});

it.each([
  ["IDENTITY", "SESSIONS", "test-own-session", "REVOKE"],
  ["identity", "sessions", "test-own-session/revoke"],
  ["identity", "sessions", "test-own-session", "revoke", ""],
])("protects normalized upstream revoke path %j", async (...targetPath) => {
  const upstream = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(Response.json({}));
  expect((await revoke({ origin }, targetPath)).status).toBe(403);
  expect(upstream).not.toHaveBeenCalled();
});

it("does not impose the new check on other mutation families", async () => {
  const upstream = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(Response.json({}));
  const response = await POST(
    new NextRequest(`${origin}/control-plane-proxy/identity/step-up-proofs`, {
      method: "POST",
      body: "{}",
    }),
    { params: Promise.resolve({ path: ["identity", "step-up-proofs"] }) },
  );
  expect(response.status).toBe(200);
  expect(upstream).toHaveBeenCalledTimes(1);
});

it("fails closed when the existing server signing secret is unavailable", async () => {
  for (const key of [
    "BFF_STATE_SECRET",
    "AUTH_COOKIE_SECRET",
    "DRTS_INTERNAL_KEY",
    "JWT_SECRET",
  ])
    vi.stubEnv(key, "");
  const response = await issue(
    new NextRequest(`${origin}/api/identity-session-csrf`, {
      headers: { origin },
    }),
  );
  expect(response.status).toBe(503);
  expect(response.headers.get("set-cookie")).toBeNull();
});

it.each([403, 503, "malformed", "network"])(
  "does not mutate if proof supply fails: %s",
  async (failure) => {
    const transport = vi.spyOn(globalThis, "fetch");
    if (failure === "network")
      transport.mockRejectedValue(new Error("proof offline"));
    else
      transport.mockResolvedValue(
        Response.json(
          { token: "forged" },
          { status: typeof failure === "number" ? failure : 200 },
        ),
      );
    const iam = new PlatformAdminIamClient(
      new ApiClient({ baseUrl: "/control-plane-proxy" }),
    );
    await expect(iam.revokeSession("test-own-session")).rejects.toThrow();
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0]![0]).toBe("/api/identity-session-csrf");
  },
);

it("preserves direct bearer API clients without local proof acquisition", async () => {
  const transport = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({
      data: { revoked: true, sessionId: "own-api-session", session: null },
    }),
  );
  const iam = new PlatformAdminIamClient(
    new ApiClient({
      baseUrl: "https://api.example/api",
      defaultHeaders: { Authorization: "Bearer lawful-api-token" },
    }),
  );
  await iam.revokeSession("own-api-session");
  expect(transport).toHaveBeenCalledTimes(1);
  expect(transport.mock.calls[0]![0]).toBe(
    "https://api.example/api/identity/sessions/own-api-session/revoke",
  );
  expect(
    new Headers(transport.mock.calls[0]![1]?.headers).get("authorization"),
  ).toBe("Bearer lawful-api-token");
});
