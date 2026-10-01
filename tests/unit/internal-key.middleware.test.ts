import { generateKeyPairSync } from "node:crypto";

import * as jwt from "jsonwebtoken";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import {
  InternalKeyMiddleware,
  validateInternalKey,
} from "../../apps/api/src/common/auth/internal-key.middleware";
import { GoogleWorkloadIdentityAdapter } from "../../apps/api/src/modules/auth/google-workload-identity.adapter";
import { IdentityRepository } from "../../apps/api/src/modules/identity/identity.repository";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
});

const GOOGLE_AUDIENCE = "https://api.dev.drts.internal";
const GOOGLE_SERVICE_ACCOUNT_EMAIL =
  "control-plane-proxy@dev-project.iam.gserviceaccount.com";
const GOOGLE_PRINCIPAL_ID = "svc-control-plane-proxy";

let keyCounter = 0;

function setUpGoogleWorkloadIdentity(overrides?: {
  registryEmail?: string;
  tokenEmail?: string;
}) {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const jwk = publicKey.export({ format: "jwk" }) as {
    kty: string;
    n: string;
    e: string;
  };
  // A unique kid per call: the adapter caches Google's JWKS for 10 minutes
  // keyed only by kid lookup, so reusing a kid across tests that mint
  // different keypairs would let a later test's verification silently use
  // an earlier test's still-cached, mismatched public key.
  const kid = `proxy-replay-test-key-${++keyCounter}`;
  process.env.WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS = JSON.stringify([
    {
      serviceAccountEmail: overrides?.registryEmail ?? GOOGLE_SERVICE_ACCOUNT_EMAIL,
      principalId: GOOGLE_PRINCIPAL_ID,
      allowedTokenAudiences: [GOOGLE_AUDIENCE],
      routeScopes: ["* *"],
    },
  ]);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(
        JSON.stringify({ keys: [{ kty: jwk.kty, kid, n: jwk.n, e: jwk.e }] }),
        { status: 200 },
      ),
    ),
  );
  const now = Math.floor(Date.now() / 1000);
  const token = jwt.sign(
    {
      iss: "https://accounts.google.com",
      sub: "1234567890",
      email: overrides?.tokenEmail ?? GOOGLE_SERVICE_ACCOUNT_EMAIL,
      email_verified: true,
      aud: GOOGLE_AUDIENCE,
      iat: now,
      exp: now + 300,
    },
    privateKey,
    { algorithm: "RS256", keyid: kid },
  );
  const adapter = new GoogleWorkloadIdentityAdapter(new IdentityRepository());
  return { adapter, token };
}

describe("validateInternalKey general proxy requests over Google workload identity", () => {
  it("accepts the same cached Google ID token for concurrent general proxy requests (no false replay rejection)", async () => {
    process.env.APP_ENV = "development";
    const { adapter, token } = setUpGoogleWorkloadIdentity();

    const makeRequest = () =>
      validateInternalKey(
        {
          method: "GET",
          originalUrl: "/api/tenant/passengers",
          headers: { "x-drts-google-id-token": token },
        },
        undefined,
        { googleWorkloadIdentityAdapter: adapter },
      );

    // A Cloud Run metadata server returns the identical token to every
    // caller within its validity window, so a page firing several parallel
    // API calls presents the same assertion more than once in the same
    // instant. All of them must succeed, not just the first.
    await expect(
      Promise.all([makeRequest(), makeRequest(), makeRequest()]),
    ).resolves.toBeDefined();
  });

  it("does not let an unregistered caller's Google assertion take the whole route down when a valid internal key is also present", async () => {
    process.env.APP_ENV = "development";
    process.env.DRTS_INTERNAL_KEY = "12345678901234567890123456789012";
    // Registry exists (ops has onboarded some callers) but not this one yet.
    const { adapter, token } = setUpGoogleWorkloadIdentity({
      tokenEmail: "not-yet-onboarded@dev-project.iam.gserviceaccount.com",
    });

    await expect(
      validateInternalKey(
        {
          method: "GET",
          originalUrl: "/api/tenant/passengers",
          headers: {
            "x-drts-google-id-token": token,
            "x-drts-internal-key": process.env.DRTS_INTERNAL_KEY,
          },
        },
        process.env.DRTS_INTERNAL_KEY,
        { googleWorkloadIdentityAdapter: adapter },
      ),
    ).resolves.not.toThrow();
  });

  it("still fails closed for a registered principal's genuinely invalid assertion (wrong audience) even with a valid internal key present", async () => {
    process.env.APP_ENV = "development";
    process.env.DRTS_INTERNAL_KEY = "12345678901234567890123456789012";
    const { publicKey, privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    const jwk = publicKey.export({ format: "jwk" }) as {
      kty: string;
      n: string;
      e: string;
    };
    const kid = "wrong-audience-test-key";
    process.env.WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS = JSON.stringify([
      {
        serviceAccountEmail: GOOGLE_SERVICE_ACCOUNT_EMAIL,
        principalId: GOOGLE_PRINCIPAL_ID,
        allowedTokenAudiences: [GOOGLE_AUDIENCE],
        routeScopes: ["* *"],
      },
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ keys: [{ kty: jwk.kty, kid, n: jwk.n, e: jwk.e }] }),
          { status: 200 },
        ),
      ),
    );
    const now = Math.floor(Date.now() / 1000);
    const token = jwt.sign(
      {
        iss: "https://accounts.google.com",
        sub: "1234567890",
        email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
        email_verified: true,
        aud: "https://attacker.example",
        iat: now,
        exp: now + 300,
      },
      privateKey,
      { algorithm: "RS256", keyid: kid },
    );
    const adapter = new GoogleWorkloadIdentityAdapter(new IdentityRepository());

    let error: ApiRequestError | null = null;
    try {
      await validateInternalKey(
        {
          method: "GET",
          originalUrl: "/api/tenant/passengers",
          headers: {
            "x-drts-google-id-token": token,
            "x-drts-internal-key": process.env.DRTS_INTERNAL_KEY,
          },
        },
        process.env.DRTS_INTERNAL_KEY,
        { googleWorkloadIdentityAdapter: adapter },
      );
    } catch (caught) {
      error = caught as ApiRequestError;
    }
    expect(error?.code).toBe("WORKLOAD_AUDIENCE_MISMATCH");
  });
});

describe("validateInternalKey strict environment behavior", () => {
  it("fails closed for bootstrap-header direct paths in staging", async () => {
    process.env.APP_ENV = "staging";
    process.env.DRTS_INTERNAL_KEY = "12345678901234567890123456789012";

    let error: ApiRequestError | null = null;
    try {
      await validateInternalKey(
        {
          method: "GET",
          originalUrl: "/api/platform-admin/tenants",
          headers: {
            "x-actor-type": "platform_admin",
            "x-actor-id": "spoofed-admin",
            "x-realm": "platform",
          },
        },
        process.env.DRTS_INTERNAL_KEY,
      );
    } catch (caught) {
      error = caught as ApiRequestError;
    }

    expect(error?.code).toBe("INTERNAL_KEY_REQUIRED");
  });

  it("continues to allow bearer-authenticated requests without internal key", async () => {
    process.env.APP_ENV = "staging";
    process.env.DRTS_INTERNAL_KEY = "12345678901234567890123456789012";

    await expect(
      validateInternalKey(
        {
          method: "GET",
          originalUrl: "/api/platform-admin/tenants",
          headers: {
            authorization: "Bearer verified.jwt.token",
          },
        },
        process.env.DRTS_INTERNAL_KEY,
      ),
    ).resolves.not.toThrow();
  });

  it("does not treat a workload assertion header as a direct internal-key bypass", async () => {
    process.env.APP_ENV = "staging";
    delete process.env.DRTS_INTERNAL_KEY;

    let error: ApiRequestError | null = null;
    try {
      await validateInternalKey(
        {
          method: "POST",
          originalUrl: "/api/auth/token",
          headers: {
            "x-drts-workload-assertion": "signed.workload.assertion",
          },
        },
        process.env.DRTS_INTERNAL_KEY,
      );
    } catch (caught) {
      error = caught as ApiRequestError;
    }

    expect(error?.code).toBe("INTERNAL_KEY_NOT_CONFIGURED");
  });

  it("does not bypass internal key enforcement for non-token routes that carry a workload assertion header", async () => {
    process.env.APP_ENV = "staging";
    process.env.DRTS_INTERNAL_KEY = "12345678901234567890123456789012";

    let error: ApiRequestError | null = null;
    try {
      await validateInternalKey(
        {
          method: "GET",
          originalUrl: "/api/platform-admin/tenants",
          headers: {
            "x-drts-workload-assertion": "signed.workload.assertion",
          },
        },
        process.env.DRTS_INTERNAL_KEY,
      );
    } catch (caught) {
      error = caught as ApiRequestError;
    }

    expect(error?.code).toBe("INTERNAL_KEY_REQUIRED");
  });

  it("middleware still fails closed in staging even when enforcement flag is false", async () => {
    process.env.APP_ENV = "staging";
    process.env.DRTS_INTERNAL_KEY_ENFORCED = "false";
    process.env.DRTS_INTERNAL_KEY = "12345678901234567890123456789012";

    const middleware = new InternalKeyMiddleware();
    const next = vi.fn();

    await expect(
      middleware.use(
        {
          method: "GET",
          originalUrl: "/api/platform-admin/tenants",
          headers: {
            "x-actor-type": "platform_admin",
            "x-actor-id": "spoofed-admin",
            "x-realm": "platform",
          },
        },
        {},
        next,
      ),
    ).rejects.toThrowError(ApiRequestError);
    expect(next).not.toHaveBeenCalled();
  });

  it("middleware allows local requests when DRTS_ENV=development disables enforcement", async () => {
    process.env.NODE_ENV = "production";
    process.env.DRTS_ENV = "development";
    process.env.DRTS_INTERNAL_KEY_ENFORCED = "false";
    delete process.env.DRTS_INTERNAL_KEY;

    const middleware = new InternalKeyMiddleware();
    const next = vi.fn();

    await expect(
      middleware.use(
        {
          method: "GET",
          originalUrl: "/api/platform-admin/tenants",
          headers: {
            "x-actor-type": "platform_admin",
            "x-actor-id": "local-admin",
            "x-realm": "platform",
          },
        },
        {},
        next,
      ),
    ).resolves.not.toThrow();
    expect(next).toHaveBeenCalledOnce();
  });

  it("middleware bypasses local enforcement when DRTS_ENV=development sets flag false even with mounted key", async () => {
    process.env.NODE_ENV = "production";
    process.env.DRTS_ENV = "development";
    process.env.DRTS_INTERNAL_KEY_ENFORCED = "false";
    process.env.DRTS_INTERNAL_KEY = "12345678901234567890123456789012";

    const middleware = new InternalKeyMiddleware();
    const next = vi.fn();

    await expect(
      middleware.use(
        {
          method: "GET",
          originalUrl: "/api/platform-admin/tenants",
          headers: {
            "x-actor-type": "platform_admin",
            "x-actor-id": "local-admin",
            "x-realm": "platform",
          },
        },
        {},
        next,
      ),
    ).resolves.not.toThrow();
    expect(next).toHaveBeenCalledOnce();
  });

  it("still requires an internal key for token exchange when Dev middleware enforcement is disabled", async () => {
    process.env.NODE_ENV = "production";
    process.env.DRTS_ENV = "development";
    process.env.DRTS_INTERNAL_KEY_ENFORCED = "false";
    process.env.DRTS_INTERNAL_KEY = "12345678901234567890123456789012";

    await expect(
      validateInternalKey(
        {
          method: "POST",
          originalUrl: "/api/auth/token",
          headers: {
            "x-actor-type": "tenant_admin",
            "x-actor-id": "release-acceptance",
            "x-realm": "tenant",
          },
        },
        process.env.DRTS_INTERNAL_KEY,
      ),
    ).rejects.toThrowError(ApiRequestError);
  });
});
