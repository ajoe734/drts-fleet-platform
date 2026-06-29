import { describe, expect, it, vi } from "vitest";

import {
  allowUnprovisionedDriverRoute,
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
  it("keeps onboarding, index, and safety-operator routes accessible before provisioning", () => {
    expect(allowUnprovisionedDriverRoute([])).toBe(true);
    expect(allowUnprovisionedDriverRoute(["index"])).toBe(true);
    expect(allowUnprovisionedDriverRoute(["onboarding"])).toBe(true);
    expect(allowUnprovisionedDriverRoute(["safety-operator"])).toBe(true);
  });

  it("rejects other driver routes until provisioning is complete", () => {
    expect(allowUnprovisionedDriverRoute(["trip"])).toBe(false);
    expect(allowUnprovisionedDriverRoute(["jobs"])).toBe(false);
  });
});
