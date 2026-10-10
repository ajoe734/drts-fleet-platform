import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "vitest";
import { NextRequest } from "next/server";
import type {
  OAuthCallbackResponse,
  OAuthStartResponse,
  VerifyOtpResponse,
} from "@drts/contracts";
import { PassengerClient } from "../../../packages/passenger-client/src/client.js";
import {
  GET,
  POST,
} from "../../../apps/passenger-app-web/app/api/passenger-app/[...path]/route";
import { apiWireResponse, fares, me } from "./api-wire-fixtures";

describe("Passenger BFF Route", () => {
  let originalEnv: NodeJS.ProcessEnv;
  let originalFetch: typeof global.fetch;

  beforeAll(() => {
    originalEnv = process.env;
    originalFetch = global.fetch;
  });

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "production",
      DRTS_API_URL: "http://upstream.local",
      DRTS_API_AUTH_AUDIENCE: "test-audience",
    };
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("rejects path traversal, encoded delimiters, and unauthorized routes", async () => {
    // Original POST traversal with actual Next-decoded params
    const traversalReq = new NextRequest(
      "http://localhost/api/passenger-app/auth/otp/%252e%252e/%252e%252e/%252e%252e/admin",
      { method: "POST", headers: { Origin: "http://localhost" } },
    );
    const traversalRes = await POST(traversalReq, {
      params: Promise.resolve({
        path: ["auth", "otp", "%2e%2e", "%2e%2e", "%2e%2e", "admin"],
      }),
    }); // Next.js decoding gives %2e%2e for double encoded in params
    expect(traversalRes.status).toBe(404);
    expect(global.fetch).not.toHaveBeenCalled();

    // Allowed-shaped GET oauth encoded dot
    const oauthReq = new NextRequest(
      "http://localhost/api/passenger-app/auth/oauth/%252e%252e",
    );
    const oauthRes = await GET(oauthReq, {
      params: Promise.resolve({ path: ["auth", "oauth", "%2e%2e"] }),
    });
    expect(oauthRes.status).toBe(404);
    expect(global.fetch).not.toHaveBeenCalled();

    const maliciousPaths = [
      { method: "GET", path: ["auth", "..", "admin"] },
      { method: "POST", path: ["auth", "%2e%2e", "admin"] },
      { method: "POST", path: ["auth", "otp", "..%2f..%2fadmin"] },
      { method: "POST", path: ["auth", "otp%2f..%2fadmin"] },
      { method: "POST", path: ["auth", "otp%5c..%5cadmin"] },
      { method: "GET", path: ["admin", "users"] },
      { method: "POST", path: ["auth", "otp-extra", "something"] }, // prefix collision
      { method: "GET", path: ["auth", "oauth", "google", "extra"] }, // extra segments
    ];

    for (const { method, path } of maliciousPaths) {
      const req = new NextRequest(
        `http://localhost/api/passenger-app/${path.join("/")}`,
        { method, headers: { Origin: "http://localhost" } },
      );
      const handler = method === "POST" ? POST : GET;
      const res = await handler(req, { params: Promise.resolve({ path }) });
      expect(res.status).toBe(404);
      expect(global.fetch).not.toHaveBeenCalled();
    }
  });

  it("allows legitimate explicit paths and asserts forwarding", async () => {
    const valid = [
      {
        method: "GET",
        path: ["auth", "providers"],
        expectedStatus: 200,
        mockResponse: new Response("ok", { status: 200 }),
      },
      {
        method: "POST",
        path: ["auth", "otp", "verify"],
        expectedStatus: 503,
        mockResponse: new Response(JSON.stringify({ accessToken: "a" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      },
      {
        method: "POST",
        path: ["auth", "otp", "request"],
        expectedStatus: 200,
        mockResponse: new Response(JSON.stringify({ challengeId: "123" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      },
      {
        method: "POST",
        path: ["auth", "mfa", "verify"],
        expectedStatus: 503,
        mockResponse: new Response(JSON.stringify({ accessToken: "a" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      },
      {
        method: "POST",
        path: ["quotes"],
        expectedStatus: 200,
        mockResponse: new Response("ok", { status: 200 }),
      },
      {
        method: "POST",
        path: ["auth", "refresh"],
        expectedStatus: 401,
        mockResponse: new Response("ok", { status: 200 }),
      },
      {
        method: "POST",
        path: ["auth", "logout"],
        expectedStatus: 200,
        mockResponse: new Response("ok", { status: 200 }),
      },
      {
        method: "GET",
        path: ["me"],
        expectedStatus: 200,
        mockResponse: new Response("ok", { status: 200 }),
      },
      {
        method: "POST",
        path: ["rides"],
        expectedStatus: 200,
        mockResponse: new Response("ok", { status: 200 }),
      },
    ];
    for (const v of valid) {
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("metadata"))
          return new Response("trusted-identity", { status: 200 });
        return v.mockResponse;
      });
      const req = new NextRequest(
        `http://localhost/api/passenger-app/${v.path.join("/")}`,
        { method: v.method, headers: { Origin: "http://localhost" } },
      );
      const handler = v.method === "POST" ? POST : GET;
      const res = await handler(req, {
        params: Promise.resolve({ path: v.path }),
      });
      expect(res.status).toBe(v.expectedStatus);
      expect(res.status).not.toBe(404);
      // We expect fetch to be called (unless it fails early due to no refresh token)
      if (v.path.join("/") !== "auth/refresh") {
        expect(global.fetch).toHaveBeenCalled();
      }
    }
  });

  it.each([
    "auth/otp/unsupported/extra",
    "auth/otp/verify/extra",
    "auth/oauth/unknown/admin/extra",
    "auth/oauth/unknown/start",
    "auth/oauth/google/admin",
  ])(
    "R20: rejects unauthorized POST %s before any metadata or API fetch",
    async (fullPath) => {
      // A permissive historical handler must reach a successful HTTP boundary,
      // not fail because the fetch stub returns undefined.
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("metadata.google.internal"))
          return new Response("trusted-identity");
        return apiWireResponse({ success: true });
      });
      const req = new NextRequest(
        `https://ride.smarttransport.tw/api/passenger-app/${fullPath}`,
        {
          method: "POST",
          headers: { Origin: "https://ride.smarttransport.tw" },
          body: "{}",
        },
      );

      const res = await POST(req, {
        params: Promise.resolve({ path: fullPath.split("/") }),
      });

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({
        error: "PASSENGER_PROXY_PATH_NOT_ALLOWED",
      });
      expect(global.fetch).not.toHaveBeenCalled();
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.cookies.get("pax_session")).toBeUndefined();
      expect(res.cookies.get("pax_refresh")).toBeUndefined();
    },
  );

  it("R20: forwards public GET fares with trusted metadata identity", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    global.fetch = vi
      .fn()
      .mockImplementation(async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        if (url.includes("metadata.google.internal"))
          return new Response("trusted-identity");
        return apiWireResponse(fares);
      });
    const req = new NextRequest(
      "https://ride.smarttransport.tw/api/passenger-app/fares",
    );

    const res = await GET(req, {
      params: Promise.resolve({ path: ["fares"] }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      data: {
        current_version: {
          version: "test-v1",
          base_fare: 85,
          distance_increment_meters: 200,
        },
      },
      meta: { request_id: "pax-web-shell-regression" },
    });
    expect(calls).toHaveLength(2);
    const metadata = calls.find((call) =>
      call.url.includes("metadata.google.internal"),
    );
    expect(new URL(metadata!.url).searchParams.get("audience")).toBe(
      "test-audience",
    );
    expect(new Headers(metadata?.init?.headers).get("metadata-flavor")).toBe(
      "Google",
    );
    const upstream = calls.find(
      (call) => call.url === "http://upstream.local/api/passenger-app/fares",
    );
    expect(upstream?.init?.method).toBe("GET");
    expect(
      new Headers(upstream?.init?.headers).get("x-serverless-authorization"),
    ).toBe("Bearer trusted-identity");
    expect(
      new Headers(upstream?.init?.headers).get("authorization"),
    ).toBeNull();
  });

  it.each(["google", "facebook", "line"] as const)(
    "R20: forwards provider-specific %s start and cookie-bound callback using formal commands",
    async (provider) => {
      const transactionId = "11111111-1111-4111-8111-111111111111";
      const state = "oauth-state";
      const start: OAuthStartResponse = {
        authUrl: "https://provider.example.test/authorize?state=oauth-state",
        transactionId,
        state,
        expiresAt: new Date(Date.now() + 300000).toISOString(),
      };
      const callback: OAuthCallbackResponse = {
        result: "logged_in",
        drtsPassengerId: me.account.drtsPassengerId,
        accessToken: "oauth-access",
        refreshToken: "oauth-refresh",
      };
      const calls: Array<{ url: string; init?: RequestInit }> = [];
      global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        calls.push({ url, ...(init ? { init } : {}) });
        if (url.includes("metadata.google.internal"))
          return new Response("trusted-identity");
        return apiWireResponse(url.endsWith("/start") ? start : callback);
      });
      const origin = "https://ride.smarttransport.tw";
      const startCommand = {
        provider,
        redirectUri: `${origin}/auth/callback/${provider}`,
        purpose: "login",
      };
      const startRes = await POST(
        new NextRequest(
          `${origin}/api/passenger-app/auth/oauth/${provider}/start`,
          {
            method: "POST",
            headers: { Origin: origin, "Content-Type": "application/json" },
            body: JSON.stringify(startCommand),
          },
        ),
        {
          params: Promise.resolve({
            path: ["auth", "oauth", provider, "start"],
          }),
        },
      );
      expect(startRes.status).toBe(200);
      expect(await startRes.json()).toMatchObject({
        data: { auth_url: start.authUrl },
        meta: { request_id: "pax-web-shell-regression" },
      });
      const cookie = startRes.cookies.get("pax_oauth_txn")!;
      expect(cookie).toMatchObject({
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
      });
      const callbackRes = await POST(
        new NextRequest(
          `${origin}/api/passenger-app/auth/oauth/${provider}/callback`,
          {
            method: "POST",
            headers: {
              Origin: origin,
              "Content-Type": "application/json",
              Cookie: `pax_oauth_txn=${cookie.value}`,
            },
            body: JSON.stringify({ provider, code: "test-code", state }),
          },
        ),
        {
          params: Promise.resolve({
            path: ["auth", "oauth", provider, "callback"],
          }),
        },
      );
      expect(callbackRes.status).toBe(200);
      expect(await callbackRes.json()).toMatchObject({
        data: {
          result: "logged_in",
          drts_passenger_id: me.account.drtsPassengerId,
        },
      });
      expect(callbackRes.cookies.get("pax_oauth_txn")?.maxAge).toBe(0);
      expect(calls).toHaveLength(4);
      const upstreamCalls = calls.filter(
        (call) => !call.url.includes("metadata.google.internal"),
      );
      expect(
        JSON.parse(
          new TextDecoder().decode(upstreamCalls[0]!.init?.body as ArrayBuffer),
        ),
      ).toEqual(startCommand);
      expect(
        JSON.parse(
          new TextDecoder().decode(upstreamCalls[1]!.init?.body as ArrayBuffer),
        ),
      ).toEqual({ provider, code: "test-code", state, transactionId });
      for (const call of upstreamCalls) {
        expect(
          new Headers(call.init?.headers).get("x-serverless-authorization"),
        ).toBe("Bearer trusted-identity");
        expect(new Headers(call.init?.headers).get("authorization")).toBeNull();
      }
      for (const [name, value] of [
        ["pax_session", "oauth-access"],
        ["pax_refresh", "oauth-refresh"],
      ]) {
        expect(callbackRes.cookies.get(name!)).toMatchObject({
          value,
          httpOnly: true,
          secure: true,
          sameSite: "lax",
          path: "/",
        });
      }
    },
  );

  it("adds security headers on success and error", async () => {
    global.fetch = vi.fn().mockImplementation(async (url) => {
      if (typeof url === "string" && url.includes("metadata"))
        return new Response("trusted");
      return Response.json({ success: true }, { status: 200 });
    });
    const req = new NextRequest("http://localhost/api/passenger-app/quotes", {
      method: "POST",
      headers: { Origin: "http://localhost" },
    });
    const res = await POST(req, {
      params: Promise.resolve({ path: ["quotes"] }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("content-security-policy")).toBeDefined();
  });

  it("handles login and redacts tokens while setting cookies (Secure/SameSite)", async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("metadata")) return new Response("trusted-identity");
      return apiWireResponse<VerifyOtpResponse>({
        result: "logged_in",
        accessToken: "sec-acc",
        refreshToken: "sec-ref",
      });
    });
    const req = new NextRequest(
      "http://localhost/api/passenger-app/auth/otp/verify",
      {
        method: "POST",
        headers: { Origin: "http://localhost" },
        body: JSON.stringify({}),
      },
    );
    const res = await POST(req, {
      params: Promise.resolve({ path: ["auth", "otp", "verify"] }),
    });
    expect(res.status).toBe(200);

    const accCookie = res.cookies.get("pax_session");
    expect(accCookie?.value).toBe("sec-acc");
    expect(accCookie?.httpOnly).toBe(true);
    expect(accCookie?.secure).toBe(true);
    expect(accCookie?.sameSite).toBe("lax");

    const refCookie = res.cookies.get("pax_refresh");
    expect(refCookie?.value).toBe("sec-ref");
    expect(refCookie?.httpOnly).toBe(true);
    expect(refCookie?.secure).toBe(true);
    expect(refCookie?.sameSite).toBe("lax");

    const responseJson = await res.json();
    expect(responseJson.data.access_token).toBeUndefined();
    expect(responseJson.data.refresh_token).toBeUndefined();
    expect(responseJson.data).toEqual({ result: "logged_in" });
    expect(responseJson.data).not.toHaveProperty("accessToken");
    expect(responseJson.data).not.toHaveProperty("refreshToken");
    expect(JSON.stringify(responseJson)).not.toContain("sec-acc");
    expect(JSON.stringify(responseJson)).not.toContain("sec-ref");
  });

  it("R17: browser client logs in through the actual BFF and hydrates its account without reading tokens", async () => {
    const upstreamCalls: Array<{ url: string; init: RequestInit | undefined }> =
      [];
    global.fetch = vi
      .fn()
      .mockImplementation(async (url: string, init?: RequestInit) => {
        upstreamCalls.push({ url, init });
        if (url.includes("metadata.google.internal"))
          return new Response("trusted-identity");
        if (url.endsWith("/me")) return apiWireResponse(me);
        return apiWireResponse<VerifyOtpResponse>({
          result: "logged_in",
          accessToken: "browser-inaccessible-access",
          refreshToken: "browser-inaccessible-refresh",
        });
      });
    let browserCookies = "";
    const browserPayloads: unknown[] = [];
    const serverResponses: Array<Awaited<ReturnType<typeof POST>>> = [];
    const client = new PassengerClient({
      baseUrl: "https://ride.smarttransport.tw",
      fetchFn: async (url, options) => {
        const req = new NextRequest(url, {
          method: options?.method ?? "GET",
          headers: {
            ...options?.headers,
            Origin: "https://ride.smarttransport.tw",
            Cookie: browserCookies,
          },
          body: options?.body ?? null,
        });
        const path = new URL(url).pathname
          .slice("/api/passenger-app/".length)
          .split("/");
        const handler = req.method === "POST" ? POST : GET;
        const response = await handler(req, {
          params: Promise.resolve({ path }),
        });
        serverResponses.push(response);
        // Simulate the browser's cookie jar; the client receives only JSON.
        if (response.cookies.get("pax_session")) {
          browserCookies = response.cookies
            .getAll()
            .map((cookie) => `${cookie.name}=${cookie.value}`)
            .join("; ");
        }
        const payload = await response.json();
        browserPayloads.push(payload);
        return {
          ok: response.ok,
          status: response.status,
          json: async () => payload,
        };
      },
    });

    const result = await client.login({
      target: "passenger@example.test",
      code: "123456",
      provider: "email",
      challenge: "challenge-123",
    });

    expect(result).toEqual({ result: "logged_in" });
    expect(client.sessionStatus).toEqual({
      isActive: true,
      account: me.account,
    });
    expect(browserPayloads).toHaveLength(2);
    expect(browserPayloads[0]).toMatchObject({ data: { result: "logged_in" } });
    expect(JSON.stringify(browserPayloads)).not.toMatch(
      /access[_]?token|refresh[_]?token|browser-inaccessible/i,
    );
    expect(upstreamCalls).toHaveLength(4);
    const accountCall = upstreamCalls.find((call) => call.url.endsWith("/me"));
    expect(new Headers(accountCall?.init?.headers).get("authorization")).toBe(
      "Bearer browser-inaccessible-access",
    );
    expect(new Headers(accountCall?.init?.headers).get("cookie")).toBeNull();
    for (const name of ["pax_session", "pax_refresh"]) {
      expect(serverResponses[0]?.cookies.get(name)).toMatchObject({
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
      });
    }
  });

  it("fails closed on partial/invalid tokens during login", async () => {
    const invalidPayloads = [
      { accessToken: "sec-acc" }, // access-only
      { refreshToken: "sec-ref" }, // refresh-only
      { accessToken: 123, refreshToken: "sec-ref" }, // non-string (number)
      { accessToken: "", refreshToken: "" }, // empty string pair
      { data: { access_token: "sec-acc" } }, // snake_case access-only
      { data: { refresh_token: "sec-ref" } }, // snake_case refresh-only
    ];

    for (const payload of invalidPayloads) {
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("metadata")) return new Response("trusted-identity");
        return Response.json(payload, { status: 200 });
      });
      const req = new NextRequest(
        "http://localhost/api/passenger-app/auth/otp/verify",
        {
          method: "POST",
          headers: { Origin: "http://localhost" },
          body: JSON.stringify({}),
        },
      );
      const res = await POST(req, {
        params: Promise.resolve({ path: ["auth", "otp", "verify"] }),
      });
      expect(res.status).toBe(503);
      const data = await res.json();
      expect(data.error).toBe("INVALID_TOKEN_PAYLOAD");
      expect(res.cookies.get("pax_session")).toBeUndefined();
    }
  });

  it("handles OTP/OAuth initiation response correctly (R10 regression)", async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("metadata")) return new Response("trusted-identity");
      return Response.json(
        { challengeId: "c1", expiresIn: 300 },
        { status: 200 },
      );
    });
    const req = new NextRequest(
      "https://ride.smarttransport.tw/api/passenger-app/auth/otp/request",
      {
        method: "POST",
        headers: { Origin: "https://ride.smarttransport.tw" },
        body: JSON.stringify({}),
      },
    );
    const res = await POST(req, {
      params: Promise.resolve({ path: ["auth", "otp", "request"] }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.challengeId).toBe("c1");
    expect(res.cookies.get("pax_session")).toBeUndefined();
  });

  it("auto-refreshes on 401 using shared trusted auth routine and rejects spoofed headers", async () => {
    let callCount = 0;
    global.fetch = vi
      .fn()
      .mockImplementation(async (url: string, init: any) => {
        if (url.includes("metadata.google.internal")) {
          return new Response("trusted-identity-token", { status: 200 });
        }
        callCount++;
        if (callCount === 1) {
          // First request to /account
          if (init.headers.get("x-actor-id"))
            return new Response("Spoofed", { status: 400 });
          if (init.headers.get("authorization") !== "Bearer expired-access")
            return new Response("Bad Token", { status: 400 });
          return new Response("Unauthorized", { status: 401 });
        }
        if (callCount === 2) {
          // Refresh request
          if (
            init.headers.get("x-serverless-authorization") !==
            "Bearer trusted-identity-token"
          ) {
            return new Response("Forbidden", { status: 403 });
          }
          let body = { refreshToken: "" };
          try {
            body =
              typeof init.body === "string"
                ? JSON.parse(init.body)
                : JSON.parse(new TextDecoder().decode(init.body));
          } catch {
            /* ignore */
          }
          if (body.refreshToken !== "stored-ref")
            return new Response("Bad Request", { status: 400 });
          return Response.json(
            { accessToken: "new-access", refreshToken: "new-ref" },
            { status: 200 },
          );
        }
        if (callCount === 3) {
          // Retry request
          if (init.headers.get("authorization") !== "Bearer new-access")
            return new Response("Bad Token", { status: 400 });
          return Response.json({ account: true }, { status: 200 });
        }
      });

    const req = new NextRequest("http://localhost/api/passenger-app/me", {
      headers: {
        Cookie: "pax_session=expired-access; pax_refresh=stored-ref",
        "X-Serverless-Authorization": "spoofed-header",
        "X-Actor-Id": "spoofed",
      },
    });
    const res = await GET(req, { params: Promise.resolve({ path: ["me"] }) });
    expect(res.status).toBe(200);

    const accCookie = res.cookies.get("pax_session");
    expect(accCookie?.value).toBe("new-access");
  });

  it("clears both cookies on automatic failed-retry network/401", async () => {
    const scenarios = [
      { networkError: false, status: 401 },
      { networkError: true, status: 401 }, // status 401 will be from the original call before retry
    ];
    for (const sc of scenarios) {
      let callCount = 0;
      let retryAuthHeader: string | null = null;
      let refreshBody: unknown;
      let refreshIdentityHeader: string | null = null;
      global.fetch = vi
        .fn()
        .mockImplementation(async (url: string, init: any) => {
          if (url.includes("metadata.google.internal")) {
            return new Response("trusted", { status: 200 });
          }
          callCount++;
          if (callCount === 1) {
            // Normal request -> 401
            return new Response("Unauthorized", { status: 401 });
          }
          if (callCount === 2) {
            // Refresh request -> success
            let body: any = {};
            if (init && init.body) {
              body =
                typeof init.body === "string"
                  ? JSON.parse(init.body)
                  : JSON.parse(new TextDecoder().decode(init.body));
            }
            refreshBody = body;
            refreshIdentityHeader = init.headers.get(
              "x-serverless-authorization",
            );
            return Response.json(
              { accessToken: "rotated-acc", refreshToken: "rotated-ref" },
              { status: 200 },
            );
          }
          if (callCount === 3) {
            // Retry request
            retryAuthHeader = init.headers.get("authorization") || null;
            if (sc.networkError) throw new Error("Network exception");
            return new Response("Unauthorized", { status: 401 });
          }
        });

      const req = new NextRequest("http://localhost/api/passenger-app/me", {
        headers: {
          Cookie: "pax_session=expired-access; pax_refresh=stored-ref",
        },
      });
      const res = await GET(req, { params: Promise.resolve({ path: ["me"] }) });

      expect(callCount).toBe(3);
      expect(refreshBody).toEqual({ refreshToken: "stored-ref" });
      expect(refreshIdentityHeader).toBe("Bearer trusted");
      expect(retryAuthHeader).toBe("Bearer rotated-acc");
      expect(res.status).toBe(sc.status);
      expect(res.cookies.get("pax_session")?.value).toBe("");
      expect(res.cookies.get("pax_session")?.maxAge).toBe(0);
      expect(res.cookies.get("pax_refresh")?.value).toBe("");
      expect(res.cookies.get("pax_refresh")?.maxAge).toBe(0);
    }
  });

  it("handles explicit refresh success and sets cookies (Secure/SameSite)", async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("metadata")) return new Response("trusted-identity");
      return Response.json(
        {
          data: {
            access_token: "fresh-acc",
            refresh_token: "fresh-ref",
            user: "def",
          },
          meta: {},
        },
        { status: 200 },
      );
    });
    const req = new NextRequest(
      "http://localhost/api/passenger-app/auth/refresh",
      {
        method: "POST",
        headers: {
          Origin: "http://localhost",
          Cookie: "pax_refresh=stored-ref",
        },
      },
    );
    const res = await POST(req, {
      params: Promise.resolve({ path: ["auth", "refresh"] }),
    });
    expect(res.status).toBe(200);

    const accCookie = res.cookies.get("pax_session");
    expect(accCookie?.value).toBe("fresh-acc");
    expect(accCookie?.httpOnly).toBe(true);
    expect(accCookie?.secure).toBe(true);
    expect(accCookie?.sameSite).toBe("lax");

    const refCookie = res.cookies.get("pax_refresh");
    expect(refCookie?.value).toBe("fresh-ref");
    expect(refCookie?.httpOnly).toBe(true);
    expect(refCookie?.secure).toBe(true);
    expect(refCookie?.sameSite).toBe("lax");

    const responseJson = await res.json();
    expect(responseJson.data.access_token).toBeUndefined();
    expect(responseJson.data.refresh_token).toBeUndefined();
    expect(responseJson.data.user).toBe("def");
  });

  it("clears both cookies on explicit refresh failure (network, parsing, invalid tokens)", async () => {
    const scenarios = [
      { ok: false, status: 503 },
      { ok: true, status: 200, data: {} },
      { ok: true, status: 200, data: { accessToken: "missing_ref" } },
      null, // network error
    ];

    for (const sc of scenarios) {
      if (sc === null) {
        global.fetch = vi.fn().mockImplementation(async (url) => {
          if (url.includes("metadata"))
            return new Response("token", { status: 200 });
          throw new Error("Network Error");
        });
      } else {
        global.fetch = vi.fn().mockImplementation(async (url) => {
          if (url.includes("metadata"))
            return new Response("token", { status: 200 });
          return sc.data
            ? Response.json(sc.data, { status: sc.status })
            : new Response("", { status: sc.status });
        });
      }

      const req = new NextRequest(
        "http://localhost/api/passenger-app/auth/refresh",
        {
          method: "POST",
          headers: {
            Origin: "http://localhost",
            Cookie: "pax_session=acc; pax_refresh=stored-ref",
          },
        },
      );
      const res = await POST(req, {
        params: Promise.resolve({ path: ["auth", "refresh"] }),
      });

      const accCookie = res.cookies.get("pax_session");
      const refCookie = res.cookies.get("pax_refresh");

      expect(accCookie?.value).toBe("");
      expect(refCookie?.value).toBe("");

      expect(res.status).toBe(401);
    }
  });

  it("asserts authorized revocation on logout and propagates failure", async () => {
    let callCount = 0;
    global.fetch = vi
      .fn()
      .mockImplementation(async (url: string, init: any) => {
        if (url.includes("metadata"))
          return new Response("token", { status: 200 });
        callCount++;
        if (url.includes("auth/logout")) {
          let body;
          try {
            body =
              typeof init.body === "string"
                ? JSON.parse(init.body)
                : JSON.parse(new TextDecoder().decode(init.body));
          } catch {
            body = {};
          }
          if (callCount === 1) {
            if (body.refreshToken !== "stored-ref")
              return new Response("Error", { status: 500 });
            return new Response("Unauthorized", { status: 401 });
          }
          if (callCount === 3) {
            if (body.refreshToken !== "new-ref")
              return new Response("Bad Request", { status: 400 });
            return new Response("", { status: 200 });
          }
        }
        if (url.includes("auth/refresh")) {
          return Response.json(
            { accessToken: "new-acc", refreshToken: "new-ref" },
            { status: 200 },
          );
        }
      });

    const req = new NextRequest(
      "http://localhost/api/passenger-app/auth/logout",
      {
        method: "POST",
        headers: {
          Origin: "http://localhost",
          Cookie: "pax_session=expired-access; pax_refresh=stored-ref",
        },
        body: "{}",
      },
    );

    const res = await POST(req, {
      params: Promise.resolve({ path: ["auth", "logout"] }),
    });
    expect(res.status).toBe(200);

    const accCookie = res.cookies.get("pax_session");
    expect(accCookie?.value).toBe("");
    expect(accCookie?.maxAge).toBe(0);
    const refCookie = res.cookies.get("pax_refresh");
    expect(refCookie?.value).toBe("");
    expect(refCookie?.maxAge).toBe(0);
  });

  it("propagates upstream failure if logout fails after retries, but still clears cookies", async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("metadata"))
        return new Response("token", { status: 200 });
      return new Response("Bad Request", { status: 400 }); // Failed request
    });

    const req = new NextRequest(
      "http://localhost/api/passenger-app/auth/logout",
      {
        method: "POST",
        headers: {
          Origin: "http://localhost",
          Cookie: "pax_session=acc; pax_refresh=stored-ref",
        },
      },
    );

    const res = await POST(req, {
      params: Promise.resolve({ path: ["auth", "logout"] }),
    });
    expect(res.status).toBe(400); // Propagated error status
    const accCookie = res.cookies.get("pax_session");
    expect(accCookie?.value).toBe("");
    expect(accCookie?.maxAge).toBe(0);
    const refCookie = res.cookies.get("pax_refresh");
    expect(refCookie?.value).toBe("");
    expect(refCookie?.maxAge).toBe(0);
  });

  it("clears cookies on logout even if network exception occurs (R14)", async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("metadata"))
        return new Response("token", { status: 200 });
      throw new Error("Network disconnect");
    });

    const req = new NextRequest(
      "http://localhost/api/passenger-app/auth/logout",
      {
        method: "POST",
        headers: {
          Origin: "http://localhost",
          Cookie: "pax_session=acc; pax_refresh=stored-ref",
        },
        body: "{}",
      },
    );

    const res = await POST(req, {
      params: Promise.resolve({ path: ["auth", "logout"] }),
    });
    expect(res.status).toBe(503);
    const accCookie = res.cookies.get("pax_session");
    expect(accCookie?.value).toBe("");
    expect(accCookie?.maxAge).toBe(0);
    const refCookie = res.cookies.get("pax_refresh");
    expect(refCookie?.value).toBe("");
    expect(refCookie?.maxAge).toBe(0);
  });

  it("clears cookies on logout even if metadata minting fails", async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("metadata")) throw new Error("Metadata failure");
      return new Response("ok", { status: 200 });
    });

    const req = new NextRequest(
      "http://localhost/api/passenger-app/auth/logout",
      {
        method: "POST",
        headers: {
          Origin: "http://localhost",
          Cookie: "pax_session=acc; pax_refresh=stored-ref",
        },
        body: "{}",
      },
    );

    const res = await POST(req, {
      params: Promise.resolve({ path: ["auth", "logout"] }),
    });
    expect(res.status).toBe(503);
    const accCookie = res.cookies.get("pax_session");
    expect(accCookie?.value).toBe("");
    expect(accCookie?.maxAge).toBe(0);
    const refCookie = res.cookies.get("pax_refresh");
    expect(refCookie?.value).toBe("");
    expect(refCookie?.maxAge).toBe(0);
  });

  it("rejects CSRF if origin doesn't match", async () => {
    const req = new NextRequest(
      "http://localhost/api/passenger-app/auth/otp/verify",
      {
        method: "POST",
        headers: { Origin: "http://evil.com" },
      },
    );
    const res = await POST(req, {
      params: Promise.resolve({ path: ["auth", "otp", "verify"] }),
    });
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe("CSRF_CHECK_FAILED");
  });
});
