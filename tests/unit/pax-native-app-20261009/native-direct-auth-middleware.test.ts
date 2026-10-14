import { generateKeyPairSync, randomUUID } from "node:crypto";
import * as jwt from "jsonwebtoken";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  validateInternalKey,
  verifyGoogleAssertionOrInternalKey,
} from "../../../apps/api/src/common/auth/internal-key.middleware";
import { GoogleWorkloadIdentityAdapter } from "../../../apps/api/src/modules/auth/google-workload-identity.adapter";
import { IdentityRepository } from "../../../apps/api/src/modules/identity/identity.repository";

beforeEach(() => {
  vi.stubEnv("APP_ENV", "production");
  vi.stubEnv("DRTS_ENV", undefined);
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("DRTS_INTERNAL_KEY_ENFORCED", "true");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const suppliedKey = "unit-only-transport-credential";
const entries = [
  ["GET", "/api/passenger-app/auth/providers"],
  ["POST", "/api/passenger-app/auth/otp/request"],
  ["POST", "/api/passenger-app/auth/otp/verify"],
  ...["google", "facebook", "line"].flatMap((provider) =>
    ["start", "callback"].map((action) => [
      "POST",
      `/api/passenger-app/auth/oauth/${provider}/${action}`,
    ]),
  ),
  ["POST", "/api/passenger-app/auth/refresh"],
  ["POST", "/api/passenger-app/auth/logout"],
] as Array<[string, string]>;
function request(
  method: string,
  path: string,
  headers: Record<string, string | string[] | undefined> = {},
) {
  return { method, originalUrl: path, headers };
}
const checks = [
  validateInternalKey,
  verifyGoogleAssertionOrInternalKey,
] as const;
function googleFixture() {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const jwk = publicKey.export({ format: "jwk" });
  const kid = `native-platform-${randomUUID()}`;
  const audience = "https://api.unit.invalid",
    email = "bff@unit-project.iam.gserviceaccount.com";
  vi.stubEnv(
    "WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS",
    JSON.stringify([
      {
        principalId: "unit-bff",
        serviceAccountEmail: email,
        allowedTokenAudiences: [audience],
        routeScopes: ["POST /api/passenger-app/auth/otp/request"],
      },
    ]),
  );
  const network = vi.fn(
    async (_url: string) =>
      new Response(JSON.stringify({ keys: [{ ...jwk, kid }] }), {
        status: 200,
      }),
  );
  vi.stubGlobal("fetch", network);
  const now = Math.floor(Date.now() / 1000);
  const token = jwt.sign(
    {
      iss: "https://accounts.google.com",
      sub: "unit-subject",
      email,
      email_verified: true,
      aud: audience,
      iat: now,
      exp: now + 300,
    },
    privateKey,
    { algorithm: "RS256", keyid: kid },
  );
  return {
    network,
    token,
    adapter: new GoogleWorkloadIdentityAdapter(new IdentityRepository()),
  };
}
describe("original Native exact direct API entry wiring", () => {
  it.each(entries)(
    "lets raw Native %s %s reach existing controllers in both layers without a server credential",
    async (method, path) => {
      // An unconfigured strict transport key formerly returned503 before the actual controller.
      const r = request(method, path);
      for (const check of checks)
        await expect(check(r, undefined)).resolves.toBeUndefined();
    },
  );
  it("uses existing path/query normalization without introducing a separate URL parser", async () => {
    const r = {
      method: "post",
      url: "/api/passenger-app/auth/otp/request/?locale=zh-TW",
      headers: {},
    };
    for (const check of checks)
      await expect(check(r, suppliedKey)).resolves.toBeUndefined();
  });
  it("supports staging as well as production for existing raw refresh command", async () => {
    vi.stubEnv("APP_ENV", "staging");
    for (const check of checks)
      await expect(
        check(request("POST", "/api/passenger-app/auth/refresh"), undefined),
      ).resolves.toBeUndefined();
  });
  it("does not inspect the refresh token or invent downstream identity at the transport layer", async () => {
    const r = request("POST", "/api/passenger-app/auth/refresh");
    Object.defineProperty(r, "body", {
      get() {
        throw Error("middleware must not inspect token body");
      },
    });
    for (const check of checks)
      await expect(check(r, undefined)).resolves.toBeUndefined();
    expect(r).not.toHaveProperty("identity");
  });
  it("respects existing deliberate requireCredential callers at both entry functions", async () => {
    for (const check of checks)
      await expect(
        check(request("POST", "/api/passenger-app/auth/refresh"), suppliedKey, {
          requireCredential: true,
        }),
      ).rejects.toMatchObject({ code: "INTERNAL_KEY_REQUIRED" });
  });
  it.each([
    ["POST", "/api/passenger-app/auth/providers"],
    ["GET", "/api/passenger-app/auth/otp/request"],
    ["POST", "/api/passenger-app/auth/oauth/apple/start"],
    ["POST", "/api/passenger-app/auth/oauth/google/callback/child"],
    ["GET", "/api/passenger-app/auth/refresh"],
    ["GET", "/api/passenger-app/me"],
    ["POST", "/api/passenger-app/fare-quotes"],
    ["POST", "/api/geo/route"],
    ["GET", "/api/passenger-rides/shared-token"],
    ["POST", "/api/auth/token"],
  ] as Array<[string, string]>)(
    "retains existing transport behavior for unrelated %s %s",
    async (method, path) => {
      for (const check of checks)
        await expect(
          check(request(method, path), suppliedKey),
        ).rejects.toMatchObject({ code: "INTERNAL_KEY_REQUIRED" });
    },
  );
  it.each(["authorization", "x-drts-authorization"])(
    "keeps supplied non-Bearer %s on the existing verifier path",
    async (header) => {
      for (const check of checks)
        await expect(
          check(
            request("POST", "/api/passenger-app/auth/refresh", {
              [header]: "Basic supplied",
            }),
            suppliedKey,
          ),
        ).rejects.toMatchObject({ code: "INTERNAL_KEY_REQUIRED" });
    },
  );
  it("retains the existing Bearer deferral in middleware and absence of that bypass in the shared core", async () => {
    const r = request("POST", "/api/passenger-app/auth/refresh", {
      authorization: "Bearer supplied",
    });
    await expect(validateInternalKey(r, suppliedKey)).resolves.toBeUndefined();
    await expect(
      verifyGoogleAssertionOrInternalKey(r, suppliedKey),
    ).rejects.toMatchObject({ code: "INTERNAL_KEY_REQUIRED" });
  });
  it("verifies a supplied BFF Google assertion through the actual adapter in both layers", async () => {
    const { adapter, token, network } = googleFixture();
    const r = request("POST", "/api/passenger-app/auth/otp/request", {
      "x-drts-google-id-token": token,
    });
    for (const check of checks)
      await expect(
        check(r, suppliedKey, { googleWorkloadIdentityAdapter: adapter }),
      ).resolves.toBeUndefined();
    expect(network).toHaveBeenCalled();
    expect(
      network.mock.calls.every((c) =>
        String(c[0]).startsWith("https://www.googleapis.com/oauth2/v3/certs"),
      ),
    ).toBe(true);
  });
  it("preserves actual Google verification failure rather than ignoring a supplied assertion", async () => {
    const { adapter } = googleFixture();
    for (const check of checks)
      await expect(
        check(
          request("POST", "/api/passenger-app/auth/otp/request", {
            "x-drts-google-id-token": "not-a-jwt",
          }),
          suppliedKey,
          { googleWorkloadIdentityAdapter: adapter },
        ),
      ).rejects.toMatchObject({ code: "WORKLOAD_ASSERTION_INVALID" });
  });
  it("retains real internal-key exception verification instead of admitting a supplied key", async () => {
    for (const check of checks)
      await expect(
        check(
          request("POST", "/api/passenger-app/auth/logout", {
            "x-drts-internal-key": suppliedKey,
          }),
          suppliedKey,
        ),
      ).rejects.toMatchObject({ code: "INTERNAL_KEY_INVALID" });
  });
  it("preserves existing legacy middleware bypasses while the shared deliberate gate stays credentialed", async () => {
    for (const [method, path] of [
      ["GET", "/api/health"],
      ["OPTIONS", "/api/unrelated"],
      ["POST", "/api/auth/tenant/bootstrap-session"],
    ]) {
      await expect(
        validateInternalKey(request(method!, path!), suppliedKey),
      ).resolves.toBeUndefined();
      await expect(
        verifyGoogleAssertionOrInternalKey(
          request(method!, path!),
          suppliedKey,
          { requireCredential: true },
        ),
      ).rejects.toMatchObject({ code: "INTERNAL_KEY_REQUIRED" });
    }
  });
});
