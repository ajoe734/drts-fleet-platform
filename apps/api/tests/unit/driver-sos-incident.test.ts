import { describe, expect, it } from "vitest";

import { resolveRouteAuthPolicy } from "../../src/common/auth/auth.policy";
import { AUTH_SCOPE_PRESETS } from "../../src/common/auth/auth.constants";

describe("driver SOS auth policy", () => {
  it("allows the driver realm to POST /driver/sos-events with incident:write", () => {
    const policy = resolveRouteAuthPolicy("POST", "/api/driver/sos-events");
    expect(policy?.allowedRealms).toContain("driver");
    expect(policy?.requiredScopes).toContain("incident:write");
  });

  it("does NOT allow the driver realm to POST /incidents anymore", () => {
    const policy = resolveRouteAuthPolicy("POST", "/api/incidents");
    expect(policy?.allowedRealms ?? []).not.toContain("driver");
  });

  it("grants driver_user the incident:write scope", () => {
    expect(AUTH_SCOPE_PRESETS.driver_user).toContain("incident:write");
  });

  it("does NOT allow the driver realm on the incident list route", () => {
    const policy = resolveRouteAuthPolicy("GET", "/api/incidents");
    expect(policy?.allowedRealms ?? []).not.toContain("driver");
  });
});
