import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";
import { finished } from "node:stream/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as tenant from "../../apps/tenant-console-web/app/api/auth/[...auth]/route";
import {
  TENANT_CSRF_COOKIE_NAME,
  TENANT_OIDC_STATE_COOKIE_NAME,
  TENANT_SESSION_COOKIE_NAME,
} from "../../apps/tenant-console-web/lib/auth/constants";
import { encodeStateEnvelope } from "../../apps/tenant-console-web/lib/auth/session";

// The Cloud Run web runtime puts runtime/web/control-plane-web-proxy.mjs in
// front of the Next child. The tenant OIDC callback answers with three
// Set-Cookie headers (session, CSRF, state clear); the wrapper used to copy
// them one by one with setHeader, so only the state clear reached the
// browser and every Google login landed back on /login without a session.

const runtime = vi.hoisted(() => ({
  handler: undefined as
    | ((req: IncomingMessage, res: ServerResponse) => Promise<void>)
    | undefined,
  listen: vi.fn(),
  spawn: vi.fn(),
}));
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

const host = "drts-dev-tenant-console-web-test.a.run.app";
const origin = `https://${host}`;
const context = (auth: string[]) => ({ params: Promise.resolve({ auth }) });

async function loadRuntime(entry: string, port: string) {
  runtime.spawn.mockReset();
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

/** Drives the wrapper with Node's setHeader semantics: a later call replaces. */
async function browserGet(path: string, cookie: string) {
  const headersIn = { host, cookie };
  const req = Object.assign(Readable.from([]), {
    method: "GET",
    url: path,
    headers: headersIn,
    rawHeaders: Object.entries(headersIn).flat(),
    socket: { encrypted: false },
  });
  const headers = new Map<string, string | string[]>();
  const res = Object.assign(
    new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    }),
    {
      statusCode: 200,
      headersSent: false,
      setHeader: (key: string, value: string | string[]) => {
        headers.set(key.toLowerCase(), value);
      },
    },
  );
  const complete = finished(res);
  await runtime.handler!(
    req as unknown as IncomingMessage,
    res as unknown as ServerResponse,
  );
  await complete;
  return { status: res.statusCode, headers };
}

beforeEach(async () => {
  vi.stubEnv("DRTS_API_URL", "https://api.test");
  vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "");
  vi.stubEnv("BFF_STATE_SECRET", "test-secret-for-bff-envelope-32-characters");
  vi.stubEnv("K_SERVICE", "tenant-console-cloud-run-test");
  // What the wrapper passes to its Next child for this entry.
  vi.stubEnv("DRTS_RUNTIME_ORIGIN_HEADER", "1");
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.stubGlobal(
    "fetch",
    async (input: string | URL | Request, init: RequestInit = {}) => {
      const url = new URL(input instanceof Request ? input.url : input);
      if (url.hostname === "127.0.0.1") {
        // The loopback Next child: run the real tenant auth route handler.
        const { signal, ...nextInit } = init;
        const request = new NextRequest(url, {
          ...nextInit,
          ...(signal ? { signal } : {}),
        });
        const auth = url.pathname.replace(/^\/api\/auth\//, "").split("/");
        return tenant.GET(request, context(auth));
      }
      if (url.pathname === "/api/auth/tenant/callback-session") {
        return Response.json({
          data: { access_token: "tenant-session-token" },
        });
      }
      return Response.json({ error: { code: "UNEXPECTED" } }, { status: 500 });
    },
  );
  await loadRuntime("apps/tenant-console-web/server.js", "3108");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("web runtime wrapper forwards every Set-Cookie", () => {
  it("delivers the tenant session and CSRF cookies from the OIDC callback", async () => {
    const state = encodeStateEnvelope({
      stateToken: "opaque-api-state",
      state: "oauth-state",
      returnUrl: "/",
    });
    const response = await browserGet(
      "/api/auth/tenant/callback?code=code&state=oauth-state",
      `${TENANT_OIDC_STATE_COOKIE_NAME}=${state}`,
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${origin}/`);
    const setCookie = response.headers.get("set-cookie");
    expect(Array.isArray(setCookie)).toBe(true);
    const cookies = setCookie as string[];
    const named = (name: string) =>
      cookies.find((value) => value.startsWith(`${name}=`));
    expect(named(TENANT_SESSION_COOKIE_NAME)).toMatch(
      new RegExp(`^${TENANT_SESSION_COOKIE_NAME}=tenant-session-token;`),
    );
    expect(named(TENANT_SESSION_COOKIE_NAME)).toMatch(/HttpOnly/i);
    expect(named(TENANT_CSRF_COOKIE_NAME)).toBeDefined();
    expect(named(TENANT_OIDC_STATE_COOKIE_NAME)).toMatch(/Max-Age=0/i);
    expect(cookies).toHaveLength(3);
  });

  it("adds no set-cookie header to a response that sets none", async () => {
    // The login start fails upstream here (UNEXPECTED) and sets no cookie.
    const response = await browserGet("/api/auth/tenant/login", "");
    expect(response.status).toBe(500);
    expect(response.headers.has("set-cookie")).toBe(false);
  });
});
