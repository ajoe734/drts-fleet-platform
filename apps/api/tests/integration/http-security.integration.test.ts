import type { AddressInfo } from "node:net";

import { Controller, Get, Module, Post } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { applyApiBrowserSecurity } from "../../src/config/http-security";

@Controller("auth")
class HttpSecurityAuthController {
  @Post("token")
  issueToken() {
    return { token: "signed-token" };
  }
}

@Controller()
class HttpSecurityTestController {
  @Get("health")
  getHealth() {
    return { ok: true };
  }

  @Get("tenant/orders")
  listOrders() {
    return { items: [] };
  }
}

@Module({
  controllers: [HttpSecurityTestController, HttpSecurityAuthController],
})
class HttpSecurityTestModule {}

describe("api HTTP browser security", () => {
  let baseUrl: string;
  let closeApplication: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    const app = await NestFactory.create(HttpSecurityTestModule, {
      cors: false,
      logger: false,
    });

    applyApiBrowserSecurity(app, {
      APP_ENV: "staging",
      AUTH_ALLOWED_ORIGINS:
        "https://tenant.drts.internal,https://ops.drts.internal",
    });
    app.setGlobalPrefix("api", {
      exclude: ["health"],
    });
    await app.listen(0, "127.0.0.1");

    const address = app.getHttpServer().address() as AddressInfo | null;
    if (!address) {
      throw new Error("expected test server address");
    }

    baseUrl = `http://127.0.0.1:${address.port}`;
    closeApplication = async () => {
      await app.close();
    };
  });

  afterAll(async () => {
    await closeApplication?.();
  });

  it("allows preflight requests from allowlisted origins with credentials enabled", async () => {
    const response = await fetch(`${baseUrl}/api/auth/token`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://tenant.drts.internal",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type,x-request-id",
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://tenant.drts.internal",
    );
    expect(response.headers.get("access-control-allow-credentials")).toBe(
      "true",
    );
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
  });

  it("rejects preflight requests from unlisted origins", async () => {
    const response = await fetch(`${baseUrl}/api/auth/token`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://evil.example",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      },
    });

    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "CORS_ORIGIN_FORBIDDEN",
        message: "CORS preflight origin is not allowlisted.",
      },
    });
  });

  it("rejects credentialed browser requests from unlisted origins", async () => {
    const response = await fetch(`${baseUrl}/api/tenant/orders`, {
      method: "GET",
      headers: {
        Origin: "https://evil.example",
        Cookie: "drts_session=opaque",
      },
    });

    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'",
    );
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "CORS_ORIGIN_FORBIDDEN",
        message: "CORS origin is not allowlisted.",
      },
    });
  });

  it("adds no-store and browser security headers to auth responses", async () => {
    const response = await fetch(`${baseUrl}/api/auth/token`, {
      method: "POST",
      headers: {
        Origin: "https://ops.drts.internal",
      },
    });

    expect(response.status).toBe(201);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://ops.drts.internal",
    );
    expect(response.headers.get("access-control-allow-credentials")).toBe(
      "true",
    );
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(response.headers.get("strict-transport-security")).toBe(
      "max-age=31536000; includeSubDomains",
    );
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
  });
});
