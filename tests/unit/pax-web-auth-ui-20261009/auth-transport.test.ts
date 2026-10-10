import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  GET,
  POST,
  PATCH,
  DELETE,
} from "../../../apps/passenger-app-web/app/api/passenger-app/[...path]/route";
import { installBoundary, uuid, secondUuid, sessionToken } from "./boundary";
import { PassengerAuthError } from "../../../packages/passenger-client/src/auth/index";

let boundary: ReturnType<typeof installBoundary>;
const origin = "https://ride.smarttransport.tw";
beforeEach(() => {
  boundary = installBoundary(origin, true);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
const oauthStart = (
  provider: "google" | "facebook" | "line",
  purpose: "login" | "link" = "login",
) =>
  boundary.client.oauthStart({
    provider,
    purpose,
    redirectUri: `${origin}/auth/callback/${provider}`,
  });

describe("Real auth client -> BFF account contract", () => {
  it("forwards account/consent/identity/delete/logout commands with cookie authority only", async () => {
    expect(await boundary.client.getAccount()).toMatchObject({
      displayName: "Tester",
    });
    expect(await boundary.client.getIdentities()).toMatchObject({
      identities: [{ identityId: uuid }],
    });
    expect(
      await boundary.client.updateAccount({
        displayName: "Updated",
        termsVersion: "terms-next",
        privacyVersion: "privacy-next",
      }),
    ).toMatchObject({
      account: { displayName: "Updated", termsVersion: "terms-next" },
    });
    await boundary.client.unlinkIdentity({ identityId: uuid });
    const deletion = await boundary.client.deleteAccount();
    expect(deletion.success).toBe(true);
    expect(boundary.state.cookies.has("pax_session")).toBe(false);
    for (const call of boundary.state.upstream)
      expect(call.headers.get("authorization")).toMatch(/^Bearer /);
    expect(
      boundary.state.upstream.find(
        (c) => c.method === "DELETE" && c.path === "me",
      )?.body,
    ).toBeUndefined();
  });
  it("preserves structured server failures without clearing account cookies on failed delete", async () => {
    boundary.state.deleteError = { code: "pending_payment_block", status: 409 };
    await expect(boundary.client.deleteAccount()).rejects.toMatchObject({
      status: 409,
      code: "pending_payment_block",
    });
    expect(boundary.state.cookies.has("pax_session")).toBe(true);
    boundary.state.unlinkError = { code: "last_identity_error", status: 409 };
    await expect(
      boundary.client.unlinkIdentity({ identityId: uuid }),
    ).rejects.toMatchObject({ code: "last_identity_error" });
  });
  it.each([
    ["GET", ["me", "identities", uuid]],
    ["POST", ["me"]],
    ["PATCH", ["me", "consent"]],
    ["DELETE", ["me", "identities", "not-a-uuid"]],
    ["DELETE", ["me", "identities", "%252fadmin"]],
    ["DELETE", ["me", "identities", "%2e%2e"]],
    ["DELETE", ["me", "identities", uuid, "extra"]],
    ["POST", ["auth", "oauth", "start"]],
    ["POST", ["auth", "oauth", "github", "start"]],
  ])("denies unlisted %s %j without upstream", async (method, path) => {
    const request = new NextRequest(
      `${origin}/api/passenger-app/${path.join("/")}`,
      { method, headers: { Origin: origin } },
    );
    const handler = { GET, POST, PATCH, DELETE }[
      method as "GET" | "POST" | "PATCH" | "DELETE"
    ];
    expect(
      (await handler(request, { params: Promise.resolve({ path }) })).status,
    ).toBe(404);
    expect(boundary.state.upstream).toHaveLength(0);
  });
  it.each(["PATCH", "DELETE"])(
    "denies cross-origin %s and strips forged caller credentials on legal requests",
    async (method) => {
      const context = { params: Promise.resolve({ path: ["me"] }) };
      const handler = method === "PATCH" ? PATCH : DELETE;
      expect(
        (
          await handler(
            new NextRequest(`${origin}/api/passenger-app/me`, {
              method,
              headers: { Origin: "https://evil.invalid" },
            }),
            context,
          )
        ).status,
      ).toBe(403);
      expect(boundary.state.upstream).toHaveLength(0);
      const response = await handler(
        new NextRequest(`${origin}/api/passenger-app/me`, {
          method,
          headers: {
            Origin: origin,
            Cookie: `pax_session=${sessionToken()}`,
            Authorization: "Bearer forged",
            "X-Actor-Id": "someone-else",
            "X-Drts-Internal-Key": "forged",
          },
          ...(method === "PATCH"
            ? { body: JSON.stringify({ displayName: "Updated" }) }
            : {}),
        }),
        context,
      );
      expect(response.status).toBe(200);
      expect(boundary.state.upstream[0]!.headers.get("authorization")).toBe(
        `Bearer ${sessionToken()}`,
      );
      expect(boundary.state.upstream[0]!.headers.get("x-actor-id")).toBeNull();
      expect(
        boundary.state.upstream[0]!.headers.get("x-drts-internal-key"),
      ).toBeNull();
    },
  );
});

describe.each(["google", "facebook", "line"] as const)(
  "%s BFF OAuth binding",
  (provider) => {
    it.each(["login", "link"] as const)(
      "handles %s then rejects browser replay",
      async (purpose) => {
        const response = await oauthStart(provider, purpose);
        expect(Object.keys(response)).toEqual(["authUrl"]);
        const cookie = boundary.state.cookies.get("pax_oauth_txn")!;
        const decoded = JSON.parse(Buffer.from(cookie, "base64url").toString());
        expect(decoded).toMatchObject({
          provider,
          purpose,
          transactionId: uuid,
          state: "test-state",
        });
        const result = await boundary.client.oauthCallback(provider, {
          code: "test-code",
          state: "test-state",
        });
        expect(result.result).toBe(
          purpose === "login" ? "logged_in" : "linked",
        );
        expect(result).not.toHaveProperty("accessToken");
        expect(result).not.toHaveProperty("refreshToken");
        await expect(
          boundary.client.oauthCallback(provider, {
            code: "test-code",
            state: "test-state",
          }),
        ).rejects.toMatchObject({ code: "invalid_grant" });
        // Restored stolen/old cookies still cannot replay the API's consumed proof.
        boundary.state.cookies.set("pax_oauth_txn", cookie);
        await expect(
          boundary.client.oauthCallback(provider, {
            code: "test-code",
            state: "test-state",
          }),
        ).rejects.toMatchObject({ code: "invalid_grant" });
      },
    );
    it.each([
      "missing",
      "expired",
      "state",
      "provider",
      "account-switch",
      "session-switch",
      "logout",
      "malformed",
    ])("rejects %s transaction before upstream", async (kind) => {
      await oauthStart(provider, "link");
      const cookie = boundary.state.cookies.get("pax_oauth_txn")!;
      const binding = JSON.parse(Buffer.from(cookie, "base64url").toString());
      let state = "test-state";
      if (kind === "missing") boundary.state.cookies.delete("pax_oauth_txn");
      if (kind === "expired") {
        binding.expiresAt = Date.now() - 1;
        boundary.state.cookies.set(
          "pax_oauth_txn",
          Buffer.from(JSON.stringify(binding)).toString("base64url"),
        );
      }
      if (kind === "state") state = "wrong-state";
      if (kind === "provider") {
        binding.provider = provider === "google" ? "line" : "google";
        boundary.state.cookies.set(
          "pax_oauth_txn",
          Buffer.from(JSON.stringify(binding)).toString("base64url"),
        );
      }
      if (kind === "account-switch")
        boundary.state.cookies.set(
          "pax_session",
          sessionToken(`drts_passenger_${secondUuid}`),
        );
      if (kind === "session-switch")
        boundary.state.cookies.set(
          "pax_session",
          sessionToken(undefined, secondUuid),
        );
      if (kind === "logout") await boundary.client.logout();
      if (kind === "malformed")
        boundary.state.cookies.set("pax_oauth_txn", "not-json");
      const before = boundary.state.upstream.length;
      await expect(
        boundary.client.oauthCallback(provider, { state, code: "test-code" }),
      ).rejects.toMatchObject({ code: "invalid_grant" });
      expect(boundary.state.upstream).toHaveLength(before);
    });
    it("accepts a rotated access token only for the same subject/family", async () => {
      await oauthStart(provider, "link");
      boundary.state.cookies.set(
        "pax_session",
        `${sessionToken().split(".").slice(0, 2).join(".")}.rotated-signature`,
      );
      await expect(
        boundary.client.oauthCallback(provider, {
          code: "test-code",
          state: "test-state",
        }),
      ).resolves.toEqual({ result: "linked" });
    });
    it("clears transaction on provider denial and upstream failure", async () => {
      await oauthStart(provider);
      await expect(
        boundary.client.oauthCallback(provider, {
          state: "test-state",
          error: "access_denied",
        }),
      ).rejects.toMatchObject({ code: "oauth_denied" });
      expect(boundary.state.cookies.has("pax_oauth_txn")).toBe(false);
      await oauthStart(provider);
      boundary.state.callbackError = { code: "conflict", status: 409 };
      await expect(
        boundary.client.oauthCallback(provider, {
          state: "test-state",
          code: "test-code",
        }),
      ).rejects.toBeInstanceOf(PassengerAuthError);
      expect(boundary.state.cookies.has("pax_oauth_txn")).toBe(false);
    });
    it("rejects unauthenticated link and noncanonical redirectURI", async () => {
      boundary.state.cookies.clear();
      const before = boundary.state.upstream.length;
      await expect(oauthStart(provider, "link")).rejects.toMatchObject({
        status: 401,
      });
      await expect(
        boundary.client.oauthStart({
          provider,
          purpose: "login",
          redirectUri: "https://evil.invalid/auth/callback/google",
        }),
      ).rejects.toMatchObject({ code: "validation_error" });
      expect(boundary.state.upstream).toHaveLength(before);
    });
  },
);
