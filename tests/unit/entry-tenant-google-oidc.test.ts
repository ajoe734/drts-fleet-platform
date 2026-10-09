import { generateKeyPairSync } from "node:crypto";
import * as jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OidcPkceService } from "../../apps/api/src/modules/auth/oidc-pkce.service";
import { JwtAuthService } from "../../apps/api/src/common/auth/jwt-auth.service";
import { TenantPartnerService } from "../../apps/api/src/modules/tenant-partner/tenant-partner.service";

const issuer = "https://accounts.google.com";
const audience = "tenant-test.apps.googleusercontent.com";
const first = generateKeyPairSync("rsa", { modulusLength: 2048 });
const second = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = (pair: typeof first, kid: string) => ({
  ...pair.publicKey.export({ format: "jwk" }),
  kid,
  alg: "RS256",
  use: "sig",
});
const token = (kid = "first", pair = first, claims = {}) =>
  jwt.sign(
    {
      iss: issuer,
      aud: audience,
      sub: "google-sub",
      email: "external@example.org",
      email_verified: true,
      nonce: "expected-nonce",
      ...claims,
    },
    pair.privateKey,
    { algorithm: "RS256", keyid: kid, expiresIn: "5m" },
  );

describe("Google OIDC verification through the production PKCE service", () => {
  let service: OidcPkceService;
  beforeEach(() => {
    vi.stubEnv("DRTS_ENV", "development");
    vi.stubEnv("OIDC_ISSUER", issuer);
    vi.stubEnv("OIDC_CLIENT_ID", audience);
    vi.stubEnv("OIDC_JWKS_URI", "https://www.googleapis.com/oauth2/v3/certs");
    vi.stubEnv("OIDC_JWKS_JSON", "");
    service = new OidcPkceService(
      {} as JwtAuthService,
      {} as TenantPartnerService,
    );
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("refreshes once on a new kid within the cache lifetime", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ keys: [jwk(first, "first")] }))
      .mockResolvedValueOnce(Response.json({ keys: [jwk(second, "second")] }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      service.verifyAndDecodeIdToken(token()),
    ).resolves.toMatchObject({ sub: "google-sub" });
    await expect(
      service.verifyAndDecodeIdToken(token("second", second)),
    ).resolves.toMatchObject({ sub: "google-sub" });
    await expect(
      service.verifyAndDecodeIdToken(token("second", second)),
    ).resolves.toMatchObject({ sub: "google-sub" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never uses the first JWKS key for an unknown kid", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ keys: [jwk(first, "first")] })),
    );
    await expect(
      service.verifyAndDecodeIdToken(token("unknown")),
    ).rejects.toThrow();
  });

  it("rejects Google HMAC tokens even if a local client secret is configured", async () => {
    vi.stubEnv("OIDC_CLIENT_SECRET", "test-secret");
    const forged = jwt.sign(
      { sub: "google-sub", iss: issuer, aud: audience },
      "test-secret",
      { expiresIn: "5m" },
    );
    await expect(service.verifyAndDecodeIdToken(forged)).rejects.toThrow();
  });

  it.each([
    { iss: "https://untrusted.example" },
    { aud: "other-client" },
    { exp: 1 },
    { azp: "other-client" },
  ])(
    "rejects invalid issuer/audience/expiry/authorized party: %j",
    async (claims) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => Response.json({ keys: [jwk(first, "first")] })),
      );
      const signed = jwt.sign(
        {
          iss: issuer,
          aud: audience,
          sub: "google-sub",
          exp: Math.floor(Date.now() / 1000) + 60,
          ...claims,
        },
        first.privateKey,
        { algorithm: "RS256", keyid: "first" },
      );
      await expect(service.verifyAndDecodeIdToken(signed)).rejects.toThrow();
    },
  );

  it("requires exp and sub", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ keys: [jwk(first, "first")] })),
    );
    const signed = jwt.sign({ iss: issuer, aud: audience }, first.privateKey, {
      algorithm: "RS256",
      keyid: "first",
    });
    await expect(service.verifyAndDecodeIdToken(signed)).rejects.toThrow();
  });

  it("keeps missing MFA claims absent even when userinfo asserts MFA", async () => {
    vi.stubEnv(
      "OIDC_USERINFO_ENDPOINT",
      "https://openidconnect.googleapis.com/v1/userinfo",
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/token"))
          return Response.json({
            id_token: token(),
            access_token: "access-token",
          });
        if (url.includes("userinfo"))
          return Response.json({
            sub: "google-sub",
            amr: ["mfa"],
            acr: "aal2",
          });
        return Response.json({ keys: [jwk(first, "first")] });
      }),
    );
    const claims = await service.exchangeRealOidcTokenEndpoint(
      {
        provider: "oidc",
        code: "code",
        state: "state",
        callbackUrl: "https://tenant.example/callback",
        pkceVerifier: "a".repeat(43),
      },
      undefined,
      "https://oauth2.googleapis.com/token",
    );
    expect(claims.amr ?? []).toEqual([]);
    expect(claims.acr).toBeUndefined();
  });
});
