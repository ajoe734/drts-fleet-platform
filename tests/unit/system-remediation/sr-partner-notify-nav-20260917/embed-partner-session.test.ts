import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

import { cookies } from "next/headers";
import { IdentityRepository } from "../../../../apps/api/src/modules/identity/identity.repository";
import { JwtAuthService } from "../../../../apps/api/src/common/auth/jwt-auth.service";
import {
  getReferralEmbedSession,
  writeReferralEmbedSession,
  type ServerReferralEmbedSession,
} from "../../../../apps/referral-embed-web/lib/embed-partner-session";

describe("embed-partner-session", () => {
  beforeEach(() => {
    vi.stubEnv("REFERRAL_EMBED_SESSION_SECRET", "test-secret");
    vi.stubEnv("JWT_SECRET", "canonical-cookie-unit-key");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("rejects cookies older than 8 hours", async () => {
    const storedCookies = new Map<string, string>();
    vi.mocked(cookies).mockReturnValue({
      set: (name: string, value: string) => {
        storedCookies.set(name, value);
      },
      get: (name: string) => {
        const value = storedCookies.get(name);
        return value === undefined ? undefined : { value };
      },
      delete: (name: string) => storedCookies.delete(name),
    } as any);

    // Mock Date.now to issue a cookie
    const now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const identities = new IdentityRepository();
    const issuer = new JwtAuthService(identities);
    const identity: ServerReferralEmbedSession["identity"] = {
      actorType: "referral_passenger",
      actorId: "pax1",
      drtsPassengerId: "pax1",
      realm: "partner",
      authMode: "jwt_bearer",
      roleFamilies: ["partner"],
      roles: ["referral_passenger"],
      scopes: ["partner:book"],
      tenantId: "tenant-cookie-unit",
      partnerId: "partner-cookie-unit",
      partnerProgramId: "program-cookie-unit",
      partnerEntrySlug: "yuhe",
    };
    // Isolate metadata's existing 8h limit: this controlled unit bearer stays
    // valid for 9h so token expiry cannot satisfy the age-rejection assertion.
    const issued = await issuer.issueSessionToken(identity, {
      expiresIn: "9h",
      principalId: identity.actorId,
      subject: identity.actorId,
      ensurePrincipal: true,
    });
    await writeReferralEmbedSession({
      identityActive: true,
      partnerEntrySlug: "yuhe",
      drtsPassengerId: "pax1",
      handoffId: "test",
      entryHost: "test.com",
      consent: {
        requiredScopes: [],
        bundleVersion: "cookie-unit-consent",
        grantedAt: new Date(now).toISOString(),
      },
      identity,
      accessToken: issued.token,
      tokenType: "Bearer",
      expiresAt: issued.expiresAt,
      sessionId: issued.sessionId,
    });

    // Advance by 8 hours - 1 second
    vi.setSystemTime(now + 8 * 60 * 60 * 1000 - 1000);
    let session = await getReferralEmbedSession();
    expect(session).not.toBeNull();
    expect(session?.drtsPassengerId).toBe("pax1");

    // Advance past 8 hours
    vi.setSystemTime(now + 8 * 60 * 60 * 1000 + 1000);
    session = await getReferralEmbedSession();
    expect(session).toBeNull();

    vi.useRealTimers();
  });
});
