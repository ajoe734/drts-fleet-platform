import { createHash, createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  JourneyFailure,
  readOwnedReferralCookies,
} from "../../e2e/owned-referral-business-journey/protocol";

type Cookie = Parameters<typeof readOwnedReferralCookies>[0][number];
const ENTRY = "synthetic-owned-entry";
const NOW = Date.parse("2026-10-20T04:00:00.000Z");
const TOKEN = "synthetic-owned-referral-bearer-not-a-real-jwt";
const SESSION_ID = "synthetic-owned-session";
const PASSENGER_ID = "synthetic-owned-passenger";
const METADATA_NAME = "drts_referral_embed_session";
const BEARER_NAME = "drts_referral_embed_bearer";

// Synthetic wire data only. This parser does not verify the signing MAC or
// authorize a session; the hosted caller must still verify /api/auth/session.
function signedMetadata(payload: unknown): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  const signature = createHmac("sha256", "synthetic-test-only-signing-secret")
    .update(body)
    .digest("base64url");
  return `${body}.${signature}`;
}

function pair(patch: Record<string, unknown> = {}): Cookie[] {
  const metadata = {
    identityActive: true,
    partnerEntrySlug: ENTRY,
    tokenType: "Bearer",
    expiresAt: new Date(NOW + 60_000).toISOString(),
    bearerDigest: createHash("sha256").update(TOKEN, "utf8").digest("hex"),
    sessionId: SESSION_ID,
    drtsPassengerId: PASSENGER_ID,
    ...patch,
  };
  return [
    {
      name: METADATA_NAME,
      value: signedMetadata(metadata),
      httpOnly: true,
      secure: true,
    },
    { name: BEARER_NAME, value: TOKEN, httpOnly: true, secure: true },
  ];
}

function replaceMetadata(value: string): Cookie[] {
  return pair().map((cookie) =>
    cookie.name === METADATA_NAME ? { ...cookie, value } : cookie,
  );
}

describe("own server-issued Referral cookie pair parsing", () => {
  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    // Do not emit workflow masking commands for synthetic test values.
    vi.stubEnv("GITHUB_ACTIONS", "false");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("returns the exact digest-bound bearer, SID and passenger ID for the same active entry", () => {
    expect(readOwnedReferralCookies(pair(), ENTRY)).toEqual({
      accessToken: TOKEN,
      sessionId: SESSION_ID,
      passengerId: PASSENGER_ID,
    });
  });

  it("finds the named pair independently of cookie order and unrelated cookies", () => {
    const cookies = [
      { name: "unrelated", value: "synthetic", httpOnly: false, secure: false },
      ...pair().reverse(),
    ];
    expect(readOwnedReferralCookies(cookies, ENTRY)).toEqual({
      accessToken: TOKEN,
      sessionId: SESSION_ID,
      passengerId: PASSENGER_ID,
    });
  });

  it.each([METADATA_NAME, BEARER_NAME])(
    "rejects a missing %s cookie",
    (name) => {
      expect(() =>
        readOwnedReferralCookies(
          pair().filter((cookie) => cookie.name !== name),
          ENTRY,
        ),
      ).toThrow("active own Referral HttpOnly cookie pair required");
    },
  );

  it.each([
    [METADATA_NAME, "secure"],
    [METADATA_NAME, "httpOnly"],
    [BEARER_NAME, "secure"],
    [BEARER_NAME, "httpOnly"],
  ] as const)("rejects %s with %s disabled", (name, flag) => {
    const cookies = pair().map((cookie) =>
      cookie.name === name ? { ...cookie, [flag]: false } : cookie,
    );
    expect(() => readOwnedReferralCookies(cookies, ENTRY)).toThrow(
      "active own Referral HttpOnly cookie pair required",
    );
  });

  it("rejects a cookie pair issued for a foreign entry", () => {
    expect(() =>
      readOwnedReferralCookies(
        pair({ partnerEntrySlug: "synthetic-foreign" }),
        ENTRY,
      ),
    ).toThrow("active same-entry Referral metadata required");
  });

  it.each([
    ["expired", new Date(NOW - 1).toISOString()],
    ["expiry boundary", new Date(NOW).toISOString()],
    ["invalid expiry", "not-a-date"],
    ["missing expiry", undefined],
  ])("rejects %s metadata", (_label, expiresAt) => {
    expect(() => readOwnedReferralCookies(pair({ expiresAt }), ENTRY)).toThrow(
      "active same-entry Referral metadata required",
    );
  });

  it.each([
    ["inactive identity", { identityActive: false }],
    ["missing active identity", { identityActive: undefined }],
    ["non-boolean active identity", { identityActive: "true" }],
    ["wrong token type", { tokenType: "Basic" }],
    ["missing token type", { tokenType: undefined }],
  ])("rejects %s", (_label, patch) => {
    expect(() => readOwnedReferralCookies(pair(patch), ENTRY)).toThrow(
      "active same-entry Referral metadata required",
    );
  });

  it("rejects a different bearer even when its cookies retain the expected protections", () => {
    const cookies = pair().map((cookie) =>
      cookie.name === BEARER_NAME
        ? { ...cookie, value: "synthetic-replacement-bearer" }
        : cookie,
    );
    expect(() => readOwnedReferralCookies(cookies, ENTRY)).toThrow(
      "own Referral cookie bearer binding",
    );
  });

  it.each(["0".repeat(64), undefined])(
    "rejects a mismatched or missing bearer digest (%s)",
    (bearerDigest) => {
      expect(() =>
        readOwnedReferralCookies(pair({ bearerDigest }), ENTRY),
      ).toThrow("own Referral cookie bearer binding");
    },
  );

  it.each([
    ["sessionId", undefined],
    ["sessionId", ""],
    ["sessionId", "   "],
    ["drtsPassengerId", undefined],
    ["drtsPassengerId", ""],
    ["drtsPassengerId", "   "],
  ])("rejects a missing or blank identity field %s (%s)", (field, value) => {
    expect(() =>
      readOwnedReferralCookies(pair({ [field]: value }), ENTRY),
    ).toThrow("nonempty identifier required");
  });

  it.each(["", "body-only", ".signature", "body.", "body.signature.extra"])(
    "rejects invalid signed metadata framing (%s)",
    (value) => {
      expect(() =>
        readOwnedReferralCookies(replaceMetadata(value), ENTRY),
      ).toThrow("signed Referral metadata shape required");
    },
  );

  it("rejects a signed-shaped payload whose body is not JSON", () => {
    const invalidBody = Buffer.from("not-json", "utf8").toString("base64url");
    expect(() =>
      readOwnedReferralCookies(
        replaceMetadata(`${invalidBody}.synthetic-signature`),
        ENTRY,
      ),
    ).toThrow("Referral metadata JSON required");
  });

  it.each([null, [], "synthetic-primitive", 42])(
    "rejects signed metadata without an object payload (%j)",
    (payload) => {
      expect(() =>
        readOwnedReferralCookies(
          replaceMetadata(signedMetadata(payload)),
          ENTRY,
        ),
      ).toThrow(JourneyFailure);
    },
  );
});
