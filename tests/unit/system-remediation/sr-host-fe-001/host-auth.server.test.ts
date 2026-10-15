import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock server-only — host-auth.server.ts is a server-only module.
vi.mock("server-only", () => ({}));

// Mock next/headers — same pattern as
// apps/fleet-partner-portal-web/lib/api-client.server.test.ts, extended with
// `cookies()` since the real-session fix reads the `drts_session` HttpOnly
// cookie through the Next.js cookie store, not just raw request headers.
const mockCookieGet = vi.fn();
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({ get: mockCookieGet })),
}));

import { headers } from "next/headers";
import {
  getServerHostClient,
  HostAuthenticationRequiredError,
} from "../../../../apps/fleet-partner-portal-web/app/host/lib/host-auth.server";

// Minimal 3-part JWT with a given unverified payload — getServerHostClient
// only ever decodes this for a display-only `partnerId` hint; it never
// trusts it for authorization (the backend independently re-verifies the
// signature and derives the authoritative partnerId).
function fakeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "none" })).toString(
    "base64url",
  );
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.sig`;
}

describe("SR-HOST-FE-001 / C012-F1-HOST-MANAGED-CREDENTIAL-CONSUMER: getServerHostClient identity & scope resolution", () => {
  const originalEnv = process.env.DRTS_HOST_PARTNER_ID;

  beforeEach(() => {
    delete process.env.DRTS_HOST_PARTNER_ID;
    mockCookieGet.mockReset();
    mockCookieGet.mockReturnValue(undefined);
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.DRTS_HOST_PARTNER_ID = originalEnv;
    } else {
      delete process.env.DRTS_HOST_PARTNER_ID;
    }
  });

  it("throws HOST_UNAUTHORIZED when there is no session cookie, bootstrap signal, or offline-harness env override", async () => {
    vi.mocked(headers).mockResolvedValueOnce(new Headers());

    await expect(getServerHostClient()).rejects.toThrow(
      HostAuthenticationRequiredError,
    );
  });

  it("forwards the real drts_session cookie as a Bearer credential instead of manufacturing bootstrap headers", async () => {
    const token = fakeJwt({ partnerId: "host-partner-real-001", realm: "partner" });
    vi.mocked(headers).mockResolvedValueOnce(new Headers());
    mockCookieGet.mockImplementation((name: string) =>
      name === "drts_session" ? { value: token } : undefined,
    );

    const { client, partnerId } = await getServerHostClient();

    expect(partnerId).toBe("host-partner-real-001");
    const sentHeaders = (client as unknown as { defaultHeaders: Record<string, string> })
      .defaultHeaders;
    expect(sentHeaders.authorization).toBe(`Bearer ${token}`);
    // Never synthesizes a bootstrap identity alongside a real session.
    expect(sentHeaders["x-actor-type"]).toBeUndefined();
    expect(sentHeaders["x-partner-id"]).toBeUndefined();
  });

  it("prefers a raw inbound Authorization header over the cookie when both are present", async () => {
    const token = fakeJwt({ partnerId: "host-partner-header-001" });
    vi.mocked(headers).mockResolvedValueOnce(
      new Headers({ authorization: `Bearer ${token}` }),
    );
    mockCookieGet.mockImplementation((name: string) =>
      name === "drts_session" ? { value: fakeJwt({ partnerId: "other" }) } : undefined,
    );

    const { partnerId } = await getServerHostClient();
    expect(partnerId).toBe("host-partner-header-001");
  });

  it("prefers the control-plane inner bearer (x-drts-authorization) over a raw Authorization header", async () => {
    const innerToken = fakeJwt({ partnerId: "host-partner-inner-001" });
    vi.mocked(headers).mockResolvedValueOnce(
      new Headers({
        "x-drts-authorization": `Bearer ${innerToken}`,
        authorization: "Bearer some-other-outer-token",
      }),
    );

    const { client, partnerId } = await getServerHostClient();
    expect(partnerId).toBe("host-partner-inner-001");
    const sentHeaders = (client as unknown as { defaultHeaders: Record<string, string> })
      .defaultHeaders;
    expect(sentHeaders["x-drts-authorization"]).toBe(`Bearer ${innerToken}`);
  });

  it("never reuses the fleet-admin x-fleet-partner-id header as a Host selector (different actor, different scope)", async () => {
    vi.mocked(headers).mockResolvedValueOnce(
      new Headers({ "x-fleet-partner-id": "fleet-admin-001" }),
    );

    await expect(getServerHostClient()).rejects.toThrow(
      HostAuthenticationRequiredError,
    );
  });

  it("rejects a forged x-host-partner-id selector header: it is no longer read as an identity source at all", async () => {
    vi.mocked(headers).mockResolvedValueOnce(
      new Headers({ "x-host-partner-id": "forged-owner-id" }),
    );

    // With no real session and no full bootstrap signal, a bare selector
    // header (not part of BOOTSTRAP_IDENTITY_HEADER_KEYS) must not be enough
    // to authenticate as that owner.
    await expect(getServerHostClient()).rejects.toThrow(
      HostAuthenticationRequiredError,
    );
  });

  it("lawful non-strict/offline harness: forwards caller-supplied bootstrap headers verbatim, never synthesized", async () => {
    vi.mocked(headers).mockResolvedValueOnce(
      new Headers({
        "x-actor-type": "partner_user",
        "x-partner-id": "host-partner-harness-001",
        "x-realm": "partner",
        "x-scopes": "owned:read,reports:read,maintenance:read",
      }),
    );

    const { client, partnerId } = await getServerHostClient();
    expect(partnerId).toBe("host-partner-harness-001");
    const sentHeaders = (client as unknown as { defaultHeaders: Record<string, string> })
      .defaultHeaders;
    expect(sentHeaders["x-actor-type"]).toBe("partner_user");
    expect(sentHeaders["x-partner-id"]).toBe("host-partner-harness-001");
  });

  it("lawful offline-harness fallback: resolves from the operator-set DRTS_HOST_PARTNER_ID env var when nothing else is present", async () => {
    process.env.DRTS_HOST_PARTNER_ID = "host-partner-env-001";
    vi.mocked(headers).mockResolvedValueOnce(new Headers());

    const { partnerId } = await getServerHostClient();
    expect(partnerId).toBe("host-partner-env-001");
  });

  it("prefers a real session over the DRTS_HOST_PARTNER_ID offline-harness fallback when both are present", async () => {
    process.env.DRTS_HOST_PARTNER_ID = "host-partner-env-001";
    const token = fakeJwt({ partnerId: "host-partner-real-session" });
    vi.mocked(headers).mockResolvedValueOnce(new Headers());
    mockCookieGet.mockImplementation((name: string) =>
      name === "drts_session" ? { value: token } : undefined,
    );

    const { partnerId } = await getServerHostClient();
    expect(partnerId).toBe("host-partner-real-session");
  });
});
