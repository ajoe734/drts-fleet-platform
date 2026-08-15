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
