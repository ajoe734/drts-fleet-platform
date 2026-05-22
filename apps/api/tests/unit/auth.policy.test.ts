import { describe, expect, it } from "vitest";

import { resolveRouteAuthPolicy } from "../../src/common/auth/auth.policy";

describe("resolveRouteAuthPolicy", () => {
  it("protects admin feature flag routes for platform-only access", () => {
    expect(resolveRouteAuthPolicy("PATCH", "/api/admin/flags/driver-app.shift"))
      .toMatchObject({
        routeKey: "admin:flags:PATCH",
        requiredScopes: ["foundation:write"],
        allowedRealms: ["system", "platform"],
      });
  });

  it("protects admin tenant governance summary as a platform read route", () => {
    expect(
      resolveRouteAuthPolicy("GET", "/api/admin/tenant-governance/summary"),
    ).toMatchObject({
      routeKey: "admin:tenant-governance:GET",
      requiredScopes: ["foundation:read"],
      allowedRealms: ["system", "platform"],
    });
  });
});
