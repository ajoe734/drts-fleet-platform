import { NextRequest } from "next/server";
import { describe, it, expect } from "vitest";

import { middleware } from "../../apps/referral-embed-web/middleware";
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
        " https://ride.acme.example,ride.acme.example booking.adventure-works.example ",
      ),
    ).toEqual(["ride.acme.example", "booking.adventure-works.example"]);
  });

  it("narrows frame ancestors and postMessage origins to the authorized entryHost", () => {
    const decision = buildEmbedSecurityDecision({
      allowedEntryHostsEnv:
        "ride.acme.example,booking.adventure-works.example,localhost:3005",
      headers: new Headers({
        referer: "https://ride.acme.example/app/referral",
      }),
      requestUrl: new URL(
        "https://passenger.drts.test/trip?entryHost=ride.acme.example",
      ),
    });

    expect(decision.block).toBe(false);
    expect(decision.allowedPostMessageOrigins).toEqual([
      "https://ride.acme.example",
    ]);
    expect(decision.contentSecurityPolicy).toContain(
      "frame-ancestors https://ride.acme.example",
    );
    expect(decision.xFrameOptions).toBeNull();
  });

  it("blocks requests when the requested entryHost is not on the allowlist", () => {
    const decision = buildEmbedSecurityDecision({
      allowedEntryHostsEnv: "ride.acme.example",
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
      allowedEntryHostsEnv: "ride.acme.example",
      headers: new Headers({
        origin: "https://evil.example",
      }),
      requestUrl: new URL(
        "https://passenger.drts.test/?entryHost=ride.acme.example",
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
      allowedEntryHostsEnv: "ride.acme.example",
      headers: new Headers({
        referer: "https://ride.acme.example/mobile",
      }),
      requestUrl: new URL(
        "https://passenger.drts.test/?entryHost=ride.acme.example",
      ),
    });
    const headers = new Headers({
      "X-Frame-Options": "DENY",
    });

    applyEmbedSecurityHeaders(headers, decision);

    expect(headers.get("Content-Security-Policy")).toContain(
      "frame-ancestors https://ride.acme.example",
    );
    expect(headers.get("X-Frame-Options")).toBeNull();
    expect(headers.get("X-DRTS-PostMessage-Allowed-Origins")).toBe(
      "https://ride.acme.example",
    );
    expect(headers.get("Vary")).toContain("Origin");
  });

  it("blocks cross-entry session reuse with a 403 before rendering", () => {
    process.env.REFERRAL_EMBED_ALLOWED_HOSTS = "app.fabrikam-living.example";
    const cookiePayload = Buffer.from(
      JSON.stringify({
        partnerEntrySlug: "yuhe-residence",
        entryHost: "app.fabrikam-living.example",
      }),
      "utf8",
    ).toString("base64url");
    const request = new NextRequest(
      "https://passenger.drts.test/embed/other-entry?entryHost=app.fabrikam-living.example",
      {
        headers: {
          cookie: `drts_referral_embed_session=${cookiePayload}.ignored`,
          referer: "https://app.fabrikam-living.example/mobile",
        },
      },
    );

    const response = middleware(request);

    expect(response.status).toBe(403);
    expect(response.headers.get("X-DRTS-Embed-Block-Reason")).toBe(
      "cross_entry_session_forbidden",
    );
  });
});
