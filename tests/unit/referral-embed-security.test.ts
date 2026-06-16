import { describe, it, expect } from "vitest";

import {
  applyEmbedSecurityHeaders,
  buildEmbedSecurityDecision,
  hostToOrigins,
  parseAllowedEntryHosts,
} from "../../apps/referral-embed-web/lib/embed-security";

describe("referral-embed embed security", () => {
  it("normalizes and deduplicates allowed entry hosts", () => {
    expect(
      parseAllowedEntryHosts(
        " https://ride.ctbc.com.tw,ride.ctbc.com.tw booking.lion-travel.com.tw ",
      ),
    ).toEqual(["ride.ctbc.com.tw", "booking.lion-travel.com.tw"]);
  });

  it("narrows frame ancestors and postMessage origins to the authorized entryHost", () => {
    const decision = buildEmbedSecurityDecision({
      allowedEntryHostsEnv:
        "ride.ctbc.com.tw,booking.lion-travel.com.tw,localhost:3005",
      headers: new Headers({
        referer: "https://ride.ctbc.com.tw/app/referral",
      }),
      requestUrl: new URL(
        "https://passenger.drts.test/trip?entryHost=ride.ctbc.com.tw",
      ),
    });

    expect(decision.block).toBe(false);
    expect(decision.allowedPostMessageOrigins).toEqual([
      "https://ride.ctbc.com.tw",
    ]);
    expect(decision.contentSecurityPolicy).toContain(
      "frame-ancestors https://ride.ctbc.com.tw",
    );
    expect(decision.xFrameOptions).toBeNull();
  });

  it("blocks requests when the requested entryHost is not on the allowlist", () => {
    const decision = buildEmbedSecurityDecision({
      allowedEntryHostsEnv: "ride.ctbc.com.tw",
      headers: new Headers(),
      requestUrl: new URL(
        "https://passenger.drts.test/?entryHost=unknown-host.example",
      ),
    });

    expect(decision.block).toBe(true);
    expect(decision.blockReason).toBe("entry_host_not_authorized");
    expect(decision.contentSecurityPolicy).toContain("frame-ancestors 'none'");
    expect(decision.xFrameOptions).toBe("DENY");
  });

  it("blocks requests when the embedding origin is not authorized", () => {
    const decision = buildEmbedSecurityDecision({
      allowedEntryHostsEnv: "ride.ctbc.com.tw",
      headers: new Headers({
        origin: "https://evil.example",
      }),
      requestUrl: new URL(
        "https://passenger.drts.test/?entryHost=ride.ctbc.com.tw",
      ),
    });

    expect(decision.block).toBe(true);
    expect(decision.blockReason).toBe("origin_not_authorized");
  });

  it("allows localhost entry hosts over both http and https for local embed verification", () => {
    expect(hostToOrigins("localhost:3005")).toEqual([
      "http://localhost:3005",
      "https://localhost:3005",
    ]);
  });

  it("writes the final response headers for an authorized embed", () => {
    const decision = buildEmbedSecurityDecision({
      allowedEntryHostsEnv: "ride.ctbc.com.tw",
      headers: new Headers({
        referer: "https://ride.ctbc.com.tw/mobile",
      }),
      requestUrl: new URL(
        "https://passenger.drts.test/?entryHost=ride.ctbc.com.tw",
      ),
    });
    const headers = new Headers({
      "X-Frame-Options": "DENY",
    });

    applyEmbedSecurityHeaders(headers, decision);

    expect(headers.get("Content-Security-Policy")).toContain(
      "frame-ancestors https://ride.ctbc.com.tw",
    );
    expect(headers.get("X-Frame-Options")).toBeNull();
    expect(headers.get("X-DRTS-PostMessage-Allowed-Origins")).toBe(
      "https://ride.ctbc.com.tw",
    );
    expect(headers.get("Vary")).toContain("Origin");
  });
});
