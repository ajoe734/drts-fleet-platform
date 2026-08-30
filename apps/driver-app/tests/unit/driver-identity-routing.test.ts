import { describe, expect, it, vi } from "vitest";

import {
  allowUnprovisionedDriverRoute,
  isProtectedDriverRoute,
  PROTECTED_DRIVER_ROUTES,
  PUBLIC_DRIVER_ROUTES,
  resetDriverAppToOnboarding,
} from "../../lib/driver-identity-routing";

describe("resetDriverAppToOnboarding", () => {
  it("dismisses the existing stack before routing to onboarding", () => {
    const dismissAll = vi.fn();
    const replace = vi.fn();

    resetDriverAppToOnboarding({
      canDismiss: () => true,
      dismissAll,
      replace,
    });

    expect(dismissAll).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/onboarding");
  });

  it("still replaces to onboarding when there is no stack to dismiss", () => {
    const dismissAll = vi.fn();
    const replace = vi.fn();

    resetDriverAppToOnboarding({
      canDismiss: () => false,
      dismissAll,
      replace,
    });

    expect(dismissAll).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith("/onboarding");
  });
});

describe("allowUnprovisionedDriverRoute", () => {
  it("only allows the onboarding route before provisioning", () => {
    expect(allowUnprovisionedDriverRoute(["onboarding"])).toBe(true);
    expect(allowUnprovisionedDriverRoute(["/onboarding"])).toBe(true);
  });

  it("strictly rejects all protected routes and empty segments until provisioning is complete", () => {
    expect(allowUnprovisionedDriverRoute([])).toBe(false);
    expect(allowUnprovisionedDriverRoute(["index"])).toBe(false);
    expect(allowUnprovisionedDriverRoute(["jobs"])).toBe(false);
    expect(allowUnprovisionedDriverRoute(["trip"])).toBe(false);
    expect(allowUnprovisionedDriverRoute(["platform-presence"])).toBe(false);
    expect(allowUnprovisionedDriverRoute(["settings"])).toBe(false);
    expect(allowUnprovisionedDriverRoute(["earnings"])).toBe(false);
    expect(allowUnprovisionedDriverRoute(["shift"])).toBe(false);
    expect(allowUnprovisionedDriverRoute(["sos"])).toBe(false);
    expect(allowUnprovisionedDriverRoute(["incident"])).toBe(false);
    expect(allowUnprovisionedDriverRoute(["safety-operator"])).toBe(false);
  });
});

describe("route classification inventory", () => {
  it("defines public and protected route inventories correctly", () => {
    expect(PUBLIC_DRIVER_ROUTES).toContain("onboarding");
    for (const route of PROTECTED_DRIVER_ROUTES) {
      expect(isProtectedDriverRoute(route)).toBe(true);
      expect(isProtectedDriverRoute(`/${route}`)).toBe(true);
    }
    expect(isProtectedDriverRoute("onboarding")).toBe(false);
  });
});
