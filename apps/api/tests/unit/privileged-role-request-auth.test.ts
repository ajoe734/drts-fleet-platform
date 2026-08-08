import { describe, expect, it } from "vitest";

import { resolveRouteAuthPolicy } from "../../src/common/auth/auth.policy";

describe("privileged role request route authorization", () => {
  it("requires identity read access for request visibility", () => {
    expect(
      resolveRouteAuthPolicy("GET", "/api/identity/privileged-role-requests"),
    ).toMatchObject({
      requiredScopes: ["identity:read"],
      allowedRealms: ["system", "platform", "ops", "tenant"],
    });
  });

  it("requires identity write access for approval and removal mutations", () => {
    for (const path of [
      "/api/identity/privileged-role-requests/request-001/approve",
      "/api/identity/privileged-role-requests/request-001/reject",
      "/api/identity/privileged-role-requests/request-001/remove",
    ]) {
      expect(resolveRouteAuthPolicy("POST", path)).toMatchObject({
        requiredScopes: ["identity:write"],
        allowedRealms: ["system", "platform", "ops", "tenant"],
      });
    }
  });
});
