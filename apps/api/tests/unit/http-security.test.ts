import { describe, expect, it } from "vitest";

import {
  appendSecurityHeaders,
  isAuthenticationPath,
  isOriginAllowed,
  resolveApiBrowserSecurityConfig,
  resolveAllowedOrigins,
} from "../../src/config/http-security";

describe("api browser security config", () => {
  it("defaults local and test environments to explicit localhost browser origins", () => {
    expect(resolveAllowedOrigins({ APP_ENV: "local", AUTH_MODE: "local" })).toContain(
      "http://localhost:3000",
    );
    expect(resolveAllowedOrigins({ CI: "true", AUTH_MODE: "test" })).toContain(
      "http://localhost:5173",
    );
  });

  it("normalizes configured origins and rejects unlisted origins", () => {
    const config = resolveApiBrowserSecurityConfig({
      APP_ENV: "staging",
      AUTH_ALLOWED_ORIGINS:
        "https://TENANT.DRTS.INTERNAL, https://ops.drts.internal",
    });

    expect(config.allowedOrigins).toEqual([
      "https://tenant.drts.internal",
      "https://ops.drts.internal",
    ]);
    expect(isOriginAllowed("https://tenant.drts.internal", config)).toBe(true);
    expect(isOriginAllowed("https://evil.example", config)).toBe(false);
  });

  it("marks auth paths for no-store controls", () => {
    expect(isAuthenticationPath("/auth/token")).toBe(true);
    expect(isAuthenticationPath("/api/auth/tenant/bootstrap-session")).toBe(
      true,
    );
    expect(isAuthenticationPath("/api/health")).toBe(false);
  });

  it("adds no-store headers to auth responses and strict browser headers everywhere", () => {
    const config = resolveApiBrowserSecurityConfig({
      APP_ENV: "production",
      AUTH_ALLOWED_ORIGINS: "https://tenant.drts.internal",
    });
    const authHeaders = new Headers();
    const healthHeaders = new Headers();

    appendSecurityHeaders(authHeaders, config, "/api/auth/token");
    appendSecurityHeaders(healthHeaders, config, "/api/health");

    expect(authHeaders.get("Cache-Control")).toBe("no-store, max-age=0");
    expect(authHeaders.get("Pragma")).toBe("no-cache");
    expect(authHeaders.get("Expires")).toBe("0");
    expect(authHeaders.get("Strict-Transport-Security")).toBe(
      "max-age=31536000; includeSubDomains",
    );
    expect(authHeaders.get("Content-Security-Policy")).toContain(
      "frame-ancestors 'none'",
    );
    expect(authHeaders.get("X-Content-Type-Options")).toBe("nosniff");
    expect(authHeaders.get("Referrer-Policy")).toBe("no-referrer");
    expect(healthHeaders.get("Cache-Control")).toBeNull();
  });
});
