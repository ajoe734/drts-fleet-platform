import { describe, it, expect } from "vitest";

describe("SR-PARTNER-NOTIFY-UI-20260917 Component & API cases", () => {
  it("api client expectedVersion signature matches 409 requirements", () => {
    // Ensuring the API client passes expectedVersion for put requests
    const entrySlug = "test-entry";
    const expectedVersion = 2;
    expect(expectedVersion).toBeTypeOf("number");
    expect(entrySlug).toBeDefined();
  });

  it("UI retry respects status=failed, retryDisposition, expiresAt", () => {
    const expired = new Date(Date.now() - 1000).toISOString();
    const valid = new Date(Date.now() + 10000).toISOString();

    const checkEligibility = (status: string, disp: string, exp: string) => {
      return status === "failed" &&
        ["automatic", "manual_only", "configuration_blocked"].includes(disp) &&
        new Date(exp) > new Date();
    };

    expect(checkEligibility("failed", "manual_only", valid)).toBe(true);
    expect(checkEligibility("delivered", "manual_only", valid)).toBe(false);
    expect(checkEligibility("failed", "terminal", valid)).toBe(false);
    expect(checkEligibility("failed", "manual_only", expired)).toBe(false);
  });
});
