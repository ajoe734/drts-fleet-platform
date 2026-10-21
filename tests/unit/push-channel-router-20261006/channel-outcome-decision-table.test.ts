// PUSH-CHANNEL-ROUTER-20261006 — D3/D6 pure decision table.
import { describe, expect, it } from "vitest";
import { resolveNonPartnerChannelOutcome } from "../../../apps/api/src/modules/multi-taxi/passenger-notification-channel-router";

describe("resolveNonPartnerChannelOutcome", () => {
  it("ambiguous: both route snapshots exist -> manual_only, provider_error", () => {
    expect(resolveNonPartnerChannelOutcome("ambiguous")).toEqual({
      failureReason: "route_ambiguous",
      retryDisposition: "manual_only",
      result: "provider_error",
    });
  });

  it("none: neither route snapshot exists -> D3 no_notification_channel, retryDisposition none, provider_not_configured", () => {
    expect(resolveNonPartnerChannelOutcome("none")).toEqual({
      failureReason: "no_notification_channel",
      retryDisposition: "none",
      result: "provider_not_configured",
    });
  });

  it("first_party_app: dormant skeleton -> configuration_blocked, provider_not_configured", () => {
    expect(resolveNonPartnerChannelOutcome("first_party_app")).toEqual({
      failureReason: "configuration_blocked",
      retryDisposition: "configuration_blocked",
      result: "provider_not_configured",
    });
  });
});
