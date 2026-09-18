import { generateKeyPairSync } from "crypto";
import { describe, expect, it } from "vitest";
import {
  JwtAuthService,
  JwtKeyRetiredError,
  JwtUnknownKeyError,
  SigningKeyRing,
} from "../../apps/api/src/common/auth";

// Generate RSA key pair for testing
const rsaKey1 = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const rsaKey2 = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

describe("SigningKeyRing & Managed Asymmetric Key Rotation", () => {
  it("synthesizes active key ring from legacy single secret environment", () => {
    const keyRing = new SigningKeyRing({
      JWT_SECRET: "integration_jwt_secret_key_32chars_minimum!",
      JWT_KID_CURRENT: "key-hs256-v1",
    });

    const active = keyRing.getActiveSigningKey();
    expect(active.kid).toBe("key-hs256-v1");
    expect(active.algorithm).toBe("HS256");

    const resolved = keyRing.resolveVerifyKey("key-hs256-v1");
    expect(resolved.kid).toBe("key-hs256-v1");
    expect(resolved.status).toBe("active");
  });

  it("loads key ring from JSON with active, previous, and retired keys", () => {
    const keyRingJson = JSON.stringify([
      {
        kid: "key-rsa-v2",
        status: "active",
        algorithm: "RS256",
        privateKey: rsaKey2.privateKey,
        publicKey: rsaKey2.publicKey,
      },
      {
        kid: "key-rsa-v1",
        status: "previous",
        algorithm: "RS256",
        publicKey: rsaKey1.publicKey,
      },
      {
        kid: "key-rsa-v0",
        status: "retired",
        algorithm: "RS256",
        publicKey: rsaKey1.publicKey,
      },
    ]);

    const keyRing = new SigningKeyRing({
      JWT_KEY_RING_JSON: keyRingJson,
    });

    const active = keyRing.getActiveSigningKey();
    expect(active.kid).toBe("key-rsa-v2");
    expect(active.algorithm).toBe("RS256");

    // Verify resolving previous key
    const previousResolved = keyRing.resolveVerifyKey("key-rsa-v1");
    expect(previousResolved.kid).toBe("key-rsa-v1");
    expect(previousResolved.status).toBe("previous");

    // Verify resolving retired key throws JwtKeyRetiredError
    expect(() => keyRing.resolveVerifyKey("key-rsa-v0")).toThrow(
      JwtKeyRetiredError,
    );

    // Verify resolving unknown key throws JwtUnknownKeyError
    expect(() => keyRing.resolveVerifyKey("key-rsa-unknown")).toThrow(
      JwtUnknownKeyError,
    );
  });

  it("issues JWT tokens carrying kid and verifies them successfully", () => {
    const prevEnv = { ...process.env };
    try {
      process.env.JWT_KEY_RING_JSON = JSON.stringify([
        {
          kid: "key-rsa-2026",
          status: "active",
          algorithm: "RS256",
          privateKey: rsaKey1.privateKey,
          publicKey: rsaKey1.publicKey,
        },
      ]);
      delete process.env.JWT_SECRET;
      delete process.env.JWT_PRIVATE_KEY;

      const authService = new JwtAuthService();
      const token = authService.sign({
        authMode: "jwt_bearer",
        actorType: "ops_user",
        actorId: "ops-user-1",
        principalId: "principal-1",
        membershipId: "member-1",
        subject: "ops-user-1",
        realm: "ops",
        tenantId: null,
        partnerId: null,
        partnerProgramId: null,
        partnerEntrySlug: null,
        sessionId: "sid_1234567890",
        tokenId: "jti_1234567890",
        tokenVersion: Date.now(),
        authTime: new Date().toISOString(),
        amr: ["verified_iap_workforce"],
        acr: "aal2",
        policyVersion: "auth.jwt-session.v1",
        issuer: "https://auth.local.drts.internal",
        audience: ["https://api.local.drts.internal"],
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        roleFamilies: ["ops"],
        roles: ["ops_admin"],
        scopes: ["ops:read"],
        requestId: "req-1",
      });

      expect(token).toBeTruthy();

      // Verify token carries kid in header
      const parts = token.split(".");
      const header = JSON.parse(
        Buffer.from(parts[0] ?? "", "base64url").toString("utf-8"),
      );
      expect(header.kid).toBe("key-rsa-2026");
      expect(header.alg).toBe("RS256");

      // Verify token succeeds
      const payload = authService.verify(token);
      expect(payload).not.toBeNull();
      expect(payload?.sub).toBe("ops-user-1");
    } finally {
      process.env = prevEnv;
    }
  });

  it("supports active/previous overlap and rejects retired/unknown keys", () => {
    const prevEnv = { ...process.env };
    try {
      // 1. Initial key set: v1 active
      process.env.JWT_KEY_RING_JSON = JSON.stringify([
        {
          kid: "key-v1",
          status: "active",
          algorithm: "RS256",
          privateKey: rsaKey1.privateKey,
          publicKey: rsaKey1.publicKey,
        },
      ]);
      const authServiceV1 = new JwtAuthService();
      const tokenSignedByV1 = authServiceV1.sign({
        authMode: "jwt_bearer",
        actorType: "system",
        actorId: "service-1",
        principalId: "service-1",
        membershipId: null,
        subject: "service-1",
        realm: "ops",
        tenantId: null,
        partnerId: null,
        partnerProgramId: null,
        partnerEntrySlug: null,
        sessionId: null,
        tokenId: null,
        tokenVersion: null,
        authTime: null,
        amr: ["internal_key"],
        acr: "aal1",
        policyVersion: "auth.jwt-session.v1",
        issuer: "https://auth.local.drts.internal",
        audience: ["https://api.local.drts.internal"],
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        roleFamilies: [],
        roles: [],
        scopes: [],
        requestId: null,
      });

      // 2. Rotate keys: v2 active, v1 previous
      process.env.JWT_KEY_RING_JSON = JSON.stringify([
        {
          kid: "key-v2",
          status: "active",
          algorithm: "RS256",
          privateKey: rsaKey2.privateKey,
          publicKey: rsaKey2.publicKey,
        },
        {
          kid: "key-v1",
          status: "previous",
          algorithm: "RS256",
          publicKey: rsaKey1.publicKey,
        },
      ]);
      const authServiceRotated = new JwtAuthService();

      // v1 token should still verify during overlap
      const verifiedOldToken = authServiceRotated.verify(tokenSignedByV1);
      expect(verifiedOldToken).not.toBeNull();

      // New tokens carry key-v2
      const tokenSignedByV2 = authServiceRotated.sign({
        authMode: "jwt_bearer",
        actorType: "system",
        actorId: "service-1",
        principalId: "service-1",
        membershipId: null,
        subject: "service-1",
        realm: "ops",
        tenantId: null,
        partnerId: null,
        partnerProgramId: null,
        partnerEntrySlug: null,
        sessionId: null,
        tokenId: null,
        tokenVersion: null,
        authTime: null,
        amr: ["internal_key"],
        acr: "aal1",
        policyVersion: "auth.jwt-session.v1",
        issuer: "https://auth.local.drts.internal",
        audience: ["https://api.local.drts.internal"],
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        roleFamilies: [],
        roles: [],
        scopes: [],
        requestId: null,
      });
      const v2Header = JSON.parse(
        Buffer.from(tokenSignedByV2.split(".")[0] ?? "", "base64url").toString(
          "utf-8",
        ),
      );
      expect(v2Header.kid).toBe("key-v2");

      // 3. Retire v1
      process.env.JWT_KEY_RING_JSON = JSON.stringify([
        {
          kid: "key-v2",
          status: "active",
          algorithm: "RS256",
          privateKey: rsaKey2.privateKey,
          publicKey: rsaKey2.publicKey,
        },
        {
          kid: "key-v1",
          status: "retired",
          algorithm: "RS256",
          publicKey: rsaKey1.publicKey,
        },
      ]);
      const authServiceRetired = new JwtAuthService();

      // v1 token must now fail verification
      const verifiedRetiredToken = authServiceRetired.verify(tokenSignedByV1);
      expect(verifiedRetiredToken).toBeNull();
    } finally {
      process.env = prevEnv;
    }
  });

  it("does not leak private keys in summary view or errors", () => {
    const keyRing = new SigningKeyRing({
      JWT_KEY_RING_JSON: JSON.stringify([
        {
          kid: "key-secret-test",
          status: "active",
          algorithm: "RS256",
          privateKey: rsaKey1.privateKey,
          publicKey: rsaKey1.publicKey,
        },
      ]),
    });

    const summary = keyRing.getKeyRingSummary();
    const jsonText = JSON.stringify(summary);

    expect(jsonText).toContain("key-secret-test");
    expect(jsonText).toContain("RS256");
    expect(jsonText).not.toContain("BEGIN PRIVATE KEY");
  });
});
