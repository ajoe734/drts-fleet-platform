import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../../middleware";

const authRequiredEnvironment = "DRTS_FLEET_PORTAL_AUTH_REQUIRED";
let originalAuthRequired: string | undefined;

describe("fleet partner portal middleware", () => {
  beforeEach(() => {
    originalAuthRequired = process.env[authRequiredEnvironment];
    delete process.env[authRequiredEnvironment];
  });

  afterEach(() => {
    if (originalAuthRequired === undefined) {
      delete process.env[authRequiredEnvironment];
      return;
    }
    process.env[authRequiredEnvironment] = originalAuthRequired;
  });

  it("allows stateless Dev BFF mutations before the login surface is enabled", () => {
    const response = middleware(
      new NextRequest(
        "http://localhost:3007/control-plane-proxy/fleet-partner/supply-submissions/drivers",
        { method: "POST" },
      ),
    );

    expect(response.status).toBe(200);
  });

  it("rejects a cookie-session mutation without a matching CSRF token", async () => {
    const response = middleware(
      new NextRequest(
        "http://localhost:3007/control-plane-proxy/fleet-partner",
        {
          method: "POST",
          headers: { cookie: "drts_session=session-token" },
        },
      ),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "CSRF_TOKEN_INVALID",
    });
  });

  describe("with DRTS_FLEET_PORTAL_AUTH_REQUIRED=true", () => {
    beforeEach(() => {
      process.env[authRequiredEnvironment] = "true";
    });
    const get = (path: string, headers: Record<string, string> = {}) =>
      middleware(new NextRequest(`http://localhost:3007${path}`, { headers }));

    it("sends a visitor without a session to /login with the original path", () => {
      const response = get("/supply/submissions?status=draft");
      expect(response.status).toBe(307);
      const location = new URL(response.headers.get("location")!);
      expect(location.pathname).toBe("/login");
      expect(location.searchParams.get("redirect_uri")).toBe(
        "/supply/submissions?status=draft",
      );
    });

    it("answers the BFF proxy with 401 JSON instead of a login page", async () => {
      const response = get("/control-plane-proxy/fleet-partner/profile");
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toMatchObject({
        error: "AUTHENTICATION_REQUIRED",
      });
    });

    it("keeps the sign-in page and auth routes public", () => {
      expect(get("/login?redirect_uri=%2F").status).toBe(200);
      expect(get("/api/auth/login").status).toBe(200);
    });

    it("lets a Google-login cookie or a session bearer through", () => {
      expect(get("/", { cookie: "drts_session=session-token" }).status).toBe(
        200,
      );
      expect(
        get("/supply/submissions", {
          "x-drts-authorization": "Bearer partner-session",
        }).status,
      ).toBe(200);
      expect(get("/", { "x-drts-authorization": "Bearer" }).status).toBe(307);
      expect(get("/", { authorization: "Bearer cloud-run-proof" }).status).toBe(
        307,
      );
    });
  });

  it("allows a cookie-session mutation with a matching CSRF token", () => {
    const response = middleware(
      new NextRequest(
        "http://localhost:3007/control-plane-proxy/fleet-partner",
        {
          method: "POST",
          headers: {
            cookie: "drts_session=session-token; drts_csrf=csrf-token",
            "x-csrf-token": "csrf-token",
          },
        },
      ),
    );

    expect(response.status).toBe(200);
  });
});
