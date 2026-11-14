import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { GET as authGet } from "@/app/api/auth/[...auth]/route";

// FLEET-ONB-001: fix PARTNER_ENTRY_NOT_FOUND. The fleet BFF's login action
// used to read partner_id from the client's query string — a parameter the
// login form never sends — so it was always blank and the downstream
// exchangePartnerCallbackSession entrySlug resolution failed closed. The
// fixed route resolves entrySlug only from the server's own
// DRTS_FLEET_PARTNER_ID, ignoring whatever partner_id the client supplies.
const ORIGIN = "http://localhost:3107";
const API = "http://localhost:3001";
const FLEET_PARTNER_ID_ENV = "DRTS_FLEET_PARTNER_ID";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function authContext(...auth: string[]) {
  return { params: Promise.resolve({ auth }) };
}

describe("fleet auth BFF /api/auth/login", () => {
  let originalFleetPartnerId: string | undefined;

  beforeEach(() => {
    vi.restoreAllMocks();
    originalFleetPartnerId = process.env[FLEET_PARTNER_ID_ENV];
    process.env.DRTS_API_URL = API;
    delete process.env.DRTS_API_AUTH_AUDIENCE;
  });

  afterEach(() => {
    if (originalFleetPartnerId === undefined) {
      delete process.env[FLEET_PARTNER_ID_ENV];
      return;
    }
    process.env[FLEET_PARTNER_ID_ENV] = originalFleetPartnerId;
  });

  it("resolves partner_id from the server's DRTS_FLEET_PARTNER_ID, not the client", async () => {
    process.env[FLEET_PARTNER_ID_ENV] = "fleet-demo-001";
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        data: {
          authorization_url:
            "https://accounts.google.com/o/oauth2/v2/auth?state=s1",
          state: "s1",
          state_token: "state-token-1",
        },
      }),
    );
    global.fetch = fetchMock;

    const response = await authGet(
      new NextRequest(
        // the client attempts to supply a different partner_id; it must be
        // ignored in favor of the server-configured value
        `${ORIGIN}/api/auth/login?redirect_uri=/dashboard&partner_id=attacker-entry`,
      ),
      authContext("login"),
    );

    expect(response.status).toBe(307);
    const requested = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requested.pathname).toBe("/api/auth/partner/login");
    expect(requested.searchParams.get("partner_id")).toBe("fleet-demo-001");
    expect(requested.searchParams.get("redirect_uri")).toBe(
      `${ORIGIN}/api/auth/callback`,
    );
  });

  it("returns 503 FLEET_SELECTOR_REQUIRED without calling the API when DRTS_FLEET_PARTNER_ID is unset", async () => {
    delete process.env[FLEET_PARTNER_ID_ENV];
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    const response = await authGet(
      new NextRequest(`${ORIGIN}/api/auth/login?redirect_uri=/dashboard`),
      authContext("login"),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: "FLEET_SELECTOR_REQUIRED",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 503 FLEET_SELECTOR_REQUIRED when DRTS_FLEET_PARTNER_ID is blank", async () => {
    process.env[FLEET_PARTNER_ID_ENV] = "   ";
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    const response = await authGet(
      new NextRequest(`${ORIGIN}/api/auth/login?redirect_uri=/dashboard`),
      authContext("login"),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: "FLEET_SELECTOR_REQUIRED",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
