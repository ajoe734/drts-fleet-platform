import {
  enterpriseEmbedStateConfig,
  enterpriseGateConfig,
} from "@/lib/enterprise-route-config";

describe("enterprise route config", () => {
  it("defines every required gate state with support-safe details", () => {
    expect(Object.keys(enterpriseGateConfig)).toEqual([
      "auth-required",
      "suspended",
      "approval-pending",
      "approval-rejected",
      "quota-blocked",
      "no-supply",
      "degraded",
    ]);

    for (const gate of Object.values(enterpriseGateConfig)) {
      expect(gate.details.length).toBeGreaterThanOrEqual(3);
      expect(gate.actions.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("defines every required embed identity state", () => {
    expect(Object.keys(enterpriseEmbedStateConfig)).toEqual([
      "handoff-ok",
      "reauth-required",
      "unsupported-host",
      "consent-required",
      "fallback-to-web",
    ]);
  });
});
