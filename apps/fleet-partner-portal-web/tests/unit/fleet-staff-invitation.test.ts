import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import {
  GET as authGet,
  POST as authPost,
} from "@/app/api/auth/[...auth]/route";
import { t, type Locale } from "@/lib/translations";

// FLEET-ONB-008: Fleet staff invitation acceptance (Google bind / password),
// SA/SD §2/§9. The invite page itself (app/invite/page.tsx) reuses the
// already-tested @drts/ui-web/client PortalInvitationPasswordForm and the
// fleet BFF exercised here; it is not re-rendered in this file.
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

describe("fleet auth BFF /api/auth/login?token= (FLEET-ONB-008 invitation branch)", () => {
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

  it("resolves an invitation login via partner/invitation-login, not the ordinary partner/login", async () => {
    delete process.env[FLEET_PARTNER_ID_ENV];
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        data: {
          authorization_url:
            "https://accounts.google.com/o/oauth2/v2/auth?state=inv-s1",
          state: "inv-s1",
          state_token: "invitation-state-token-1",
        },
      }),
    );
    global.fetch = fetchMock;

    const response = await authGet(
      new NextRequest(
        `${ORIGIN}/api/auth/login?token=inv-token-1&redirect_uri=/dashboard`,
      ),
      authContext("login"),
    );

    expect(response.status).toBe(307);
    const [requestedUrl, requestedInit] = fetchMock.mock.calls[0]!;
    expect(String(requestedUrl)).toBe(
      `${API}/api/auth/partner/invitation-login`,
    );
    expect(requestedInit.method).toBe("POST");
    const body = JSON.parse(String(requestedInit.body));
    expect(body.invitationToken).toBe("inv-token-1");
    expect(body.redirectUri).toBe(`${ORIGIN}/api/auth/callback`);
    expect(body.partnerId).toBeUndefined();
    expect(response.cookies.get("drts_oidc_state")?.value).toContain(
      "invitation-state-token-1",
    );
  });

  it("does not require DRTS_FLEET_PARTNER_ID for an invitation login, unlike the ordinary login path", async () => {
    delete process.env[FLEET_PARTNER_ID_ENV];
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        data: {
          authorization_url: "https://accounts.google.com/o/oauth2/v2/auth",
          state: "s",
          state_token: "t",
        },
      }),
    );
    global.fetch = fetchMock;

    const response = await authGet(
      new NextRequest(`${ORIGIN}/api/auth/login?token=inv-token-2`),
      authContext("login"),
    );

    expect(response.status).toBe(307);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("passes a configured DRTS_FLEET_PARTNER_ID through only as an optional hint", async () => {
    process.env[FLEET_PARTNER_ID_ENV] = "fleet-demo-001";
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        data: {
          authorization_url: "https://accounts.google.com/o/oauth2/v2/auth",
          state: "s",
          state_token: "t",
        },
      }),
    );
    global.fetch = fetchMock;

    await authGet(
      new NextRequest(`${ORIGIN}/api/auth/login?token=inv-token-3`),
      authContext("login"),
    );

    const [, requestedInit] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(String(requestedInit.body));
    expect(body.partnerId).toBe("fleet-demo-001");
  });

  it("surfaces the real upstream error code/message when invitation-login fails", async () => {
    delete process.env[FLEET_PARTNER_ID_ENV];
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(
        {
          error: {
            code: "INVITATION_INVALID",
            message: "This invitation has expired.",
          },
        },
        400,
      ),
    );
    global.fetch = fetchMock;

    const response = await authGet(
      new NextRequest(`${ORIGIN}/api/auth/login?token=inv-expired`),
      authContext("login"),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "INVITATION_INVALID",
      message: "This invitation has expired.",
    });
  });

  it("still returns 503 FLEET_SELECTOR_REQUIRED for the ordinary (no-token) login path when unset", async () => {
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
});

describe("fleet auth BFF POST /api/auth/invitation/accept-with-password", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.DRTS_API_URL = API;
    delete process.env.DRTS_API_AUTH_AUDIENCE;
  });

  function acceptRequest(body: unknown) {
    return new NextRequest(
      `${ORIGIN}/api/auth/invitation/accept-with-password`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
  }

  it("forwards invitationToken/password to the real upstream endpoint and relays the ack", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: { accepted: true } }));
    global.fetch = fetchMock;

    const response = await authPost(
      acceptRequest({
        invitationToken: "inv-token-9",
        password: "a-very-long-password-1",
      }),
      authContext("invitation", "accept-with-password"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { accepted: true },
    });
    const [requestedUrl, requestedInit] = fetchMock.mock.calls[0]!;
    expect(String(requestedUrl)).toBe(
      `${API}/api/auth/partner/invitation/accept-with-password`,
    );
    expect(requestedInit.method).toBe("POST");
    expect(JSON.parse(String(requestedInit.body))).toEqual({
      invitationToken: "inv-token-9",
      password: "a-very-long-password-1",
    });
  });

  it("rejects without calling the API when the invitation token is missing", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    const response = await authPost(
      acceptRequest({ password: "a-very-long-password-1" }),
      authContext("invitation", "accept-with-password"),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "AUTH_INVITATION_ACCEPT_INVALID",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects without calling the API when the password is missing", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    const response = await authPost(
      acceptRequest({ invitationToken: "inv-token-9" }),
      authContext("invitation", "accept-with-password"),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "AUTH_INVITATION_ACCEPT_INVALID",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("relays an upstream rejection (e.g. already-accepted invitation) unchanged", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(
        {
          error: {
            code: "FLEET_INVITATION_ACCEPTANCE_DENIED",
            message: "This invitation was already accepted or revoked.",
          },
        },
        409,
      ),
    );
    global.fetch = fetchMock;

    const response = await authPost(
      acceptRequest({
        invitationToken: "inv-token-used",
        password: "a-very-long-password-1",
      }),
      authContext("invitation", "accept-with-password"),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "FLEET_INVITATION_ACCEPTANCE_DENIED" },
    });
  });

  it("returns 503 AUTH_INVITATION_ACCEPT_UNAVAILABLE when the upstream call throws", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("network down"));
    global.fetch = fetchMock;

    const response = await authPost(
      acceptRequest({
        invitationToken: "inv-token-9",
        password: "a-very-long-password-1",
      }),
      authContext("invitation", "accept-with-password"),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: "AUTH_INVITATION_ACCEPT_UNAVAILABLE",
    });
  });
});

describe("fleet invite page translations (FLEET-ONB-008)", () => {
  it("resolves zh/en copy for every invite.* key with no leftover key fallback", () => {
    const keys = [
      "invite.title",
      "invite.description",
      "invite.cta",
      "invite.invalidLink",
      "invite.passwordSectionTitle",
    ];
    for (const key of keys) {
      const locales: Locale[] = ["en", "zh"];
      const values = locales.map((locale) => t(key, locale));
      for (const value of values) {
        expect(value).not.toBe(key);
        expect(value.length).toBeGreaterThan(0);
      }
      expect(values[0]).not.toBe(values[1]);
    }
  });
});
