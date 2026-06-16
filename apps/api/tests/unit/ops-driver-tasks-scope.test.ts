import { describe, expect, it } from "vitest";
import { AUTH_SCOPE_PRESETS } from "../../src/common/auth/auth.constants";
import { resolveRouteAuthPolicy } from "../../src/common/auth/auth.policy";

describe("ops can read driver tasks (dispatch board dependency)", () => {
  it("grants ops_user the driver:read scope", () => {
    expect(AUTH_SCOPE_PRESETS.ops_user).toContain("driver:read");
  });

  it("GET /api/driver/tasks allows the ops realm and requires driver:read", () => {
    const policy = resolveRouteAuthPolicy("GET", "/api/driver/tasks");
    expect(policy?.allowedRealms).toContain("ops");
    expect(policy?.requiredScopes).toContain("driver:read");
  });

  it("ops_user satisfies the /api/driver/tasks scope requirement", () => {
    const policy = resolveRouteAuthPolicy("GET", "/api/driver/tasks");
    const granted = new Set(AUTH_SCOPE_PRESETS.ops_user);
    for (const s of policy?.requiredScopes ?? []) {
      expect(granted.has(s)).toBe(true);
    }
  });
});
