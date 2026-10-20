import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { proxy } from "../../../apps/passenger-app-web/proxy";

afterEach(() => vi.unstubAllEnvs());

describe("public Passenger entry routing before filesystem assets", () => {
  it.each([
    "/review-driver",
    "/review-driver/",
    "/review-driver/tasks/assigned-task",
    "/review-driver/_expo/static/js/web/app.js",
    "/api/review-driver-api",
    "/api/review-driver-api/api/driver/tasks",
    "/api/%72eview-driver-api/api/driver/tasks",
    "/%72eview-driver/assets.js",
    "//review-driver/assets.js",
    "/review-driver%5cassets.js",
  ])(
    "closes %s regardless of browser-supplied auth/host headers",
    (pathname) => {
      vi.stubEnv("PAX_PUBLIC_PASSENGER_ONLY", "true");
      const response = proxy(
        new NextRequest(`https://passenger.example${pathname}`, {
          headers: {
            authorization: "Bearer browser-value",
            "x-forwarded-host": "private.example",
            "x-pax-public-passenger-only": "false",
          },
        }),
      );
      expect(response.status).toBe(404);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(response.headers.get("x-middleware-next")).toBeNull();
    },
  );

  it.each([
    "/login",
    "/review",
    "/bureau-review",
    "/api/passenger-app/me",
    "/_next/static/app.js",
  ])(
    "keeps the original Passenger application responsible for %s",
    (pathname) => {
      vi.stubEnv("PAX_PUBLIC_PASSENGER_ONLY", "true");
      expect(
        proxy(
          new NextRequest(`https://passenger.example${pathname}`),
        ).headers.get("x-middleware-next"),
      ).toBe("1");
    },
  );

  it("preserves the existing private hosted Driver routing when public mode is disabled", () => {
    vi.stubEnv("PAX_PUBLIC_PASSENGER_ONLY", "false");
    expect(
      proxy(
        new NextRequest("https://private.example/review-driver/tasks"),
      ).headers.get("x-middleware-next"),
    ).toBe("1");
  });
});
