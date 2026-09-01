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
  it("keeps onboarding and index routes accessible before provisioning", () => {
    expect(allowUnprovisionedDriverRoute([])).toBe(true);
    expect(allowUnprovisionedDriverRoute(["index"])).toBe(true);
    expect(allowUnprovisionedDriverRoute(["onboarding"])).toBe(true);
  });

  it("rejects other driver routes until provisioning is complete", () => {
    expect(allowUnprovisionedDriverRoute(["trip"])).toBe(false);
    expect(allowUnprovisionedDriverRoute(["jobs"])).toBe(false);
  });

  // useSegments() reports the router group as its own segment. Without
  // stripping it, every route looked unauthorised and an unprovisioned driver
  // was bounced back to onboarding on launch, on foreground and every 10
  // minutes -- interrupting the very registration they were completing.
  it("strips router group segments before matching", () => {
    expect(allowUnprovisionedDriverRoute(["(tabs)"])).toBe(true);
    expect(allowUnprovisionedDriverRoute(["(tabs)", "index"])).toBe(true);
    expect(allowUnprovisionedDriverRoute(["(tabs)", "index", "index"])).toBe(
      true,
    );
    expect(
      allowUnprovisionedDriverRoute(["(tabs)", "index", "onboarding"]),
    ).toBe(true);
  });

  it("still blocks the other tabs and the workspace sub-screens", () => {
    expect(allowUnprovisionedDriverRoute(["(tabs)", "jobs"])).toBe(false);
    expect(allowUnprovisionedDriverRoute(["(tabs)", "jobs", "index"])).toBe(
      false,
    );
    expect(allowUnprovisionedDriverRoute(["(tabs)", "trip"])).toBe(false);
    expect(allowUnprovisionedDriverRoute(["(tabs)", "settings"])).toBe(false);
    expect(allowUnprovisionedDriverRoute(["(tabs)", "platform-presence"])).toBe(
      false,
    );
    expect(allowUnprovisionedDriverRoute(["(tabs)", "index", "sos"])).toBe(
      false,
    );
    expect(allowUnprovisionedDriverRoute(["(tabs)", "index", "shift"])).toBe(
      false,
    );
    expect(allowUnprovisionedDriverRoute(["(tabs)", "index", "earnings"])).toBe(
      false,
    );
  });
});
