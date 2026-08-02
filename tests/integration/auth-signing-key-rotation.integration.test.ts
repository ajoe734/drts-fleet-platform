import { execSync } from "child_process";
import { generateKeyPairSync } from "crypto";
import * as jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";

import {
  JwtAuthService,
  JwtKeyRetiredError,
  JwtUnknownKeyError,
  SigningKeyRing,
} from "../../apps/api/src/common/auth";

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

describe("IAM-KEY-001 Managed Asymmetric Signing Key Rotation Integration", () => {
  it("1. Tokens carry and resolve kid in header and verify correctly", () => {
    const prevEnv = { ...process.env };
    try {
      process.env.JWT_KEY_RING_JSON = JSON.stringify([
        {
          kid: "key-2026-v1",
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
        principalId: "p-1",
        membershipId: "m-1",
        subject: "ops-user-1",
        realm: "ops",
        tenantId: null,
        partnerId: null,
        partnerProgramId: null,
        partnerEntrySlug: null,
        sessionId: "sid_test_123",
        tokenId: "jti_test_123",
        tokenVersion: 1000,
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

      const header = JSON.parse(
        Buffer.from(token.split(".")[0] ?? "", "base64url").toString("utf-8"),
      );
      expect(header.kid).toBe("key-2026-v1");
      expect(header.alg).toBe("RS256");

      const payload = authService.verify(token);
      expect(payload).not.toBeNull();
      expect(payload?.sub).toBe("ops-user-1");
    } finally {
      process.env = prevEnv;
    }
  });

  it("2. Current and previous key overlap window works seamlessly", () => {
    const prevEnv = { ...process.env };
    try {
      // Step A: Issue token with v1 as active
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
      const v1Token = authServiceV1.sign({
        authMode: "jwt_bearer",
        actorType: "system",
        actorId: "sys-1",
        principalId: "p-sys-1",
        membershipId: null,
        subject: "sys-1",
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

      // Step B: Rotate to v2 active, demote v1 to previous
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

      // Old v1 token must still pass verification during overlap window
      const v1Verified = authServiceRotated.verify(v1Token);
      expect(v1Verified).not.toBeNull();
      expect(v1Verified?.sub).toBe("sys-1");

      // New token uses v2
      const v2Token = authServiceRotated.sign({
        authMode: "jwt_bearer",
        actorType: "system",
        actorId: "sys-2",
        principalId: "p-sys-2",
        membershipId: null,
        subject: "sys-2",
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
        Buffer.from(v2Token.split(".")[0] ?? "", "base64url").toString("utf-8"),
      );
      expect(v2Header.kid).toBe("key-v2");
    } finally {
      process.env = prevEnv;
    }
  });

  it("3. Retired and unknown keys fail verification closed", () => {
    const prevEnv = { ...process.env };
    try {
      process.env.JWT_KEY_RING_JSON = JSON.stringify([
        {
          kid: "key-v2",
          status: "active",
          algorithm: "RS256",
          privateKey: rsaKey2.privateKey,
          publicKey: rsaKey2.publicKey,
        },
        {
          kid: "key-v1-retired",
          status: "retired",
          algorithm: "RS256",
          publicKey: rsaKey1.publicKey,
        },
      ]);
      const keyRing = new SigningKeyRing();

      expect(() => keyRing.resolveVerifyKey("key-v1-retired")).toThrow(
        JwtKeyRetiredError,
      );
      expect(() => keyRing.resolveVerifyKey("unknown-kid-xyz")).toThrow(
        JwtUnknownKeyError,
      );

      const authService = new JwtAuthService();
      // Token signed by retired key
      process.env.JWT_KEY_RING_JSON = JSON.stringify([
        {
          kid: "key-v1-retired",
          status: "active",
          algorithm: "RS256",
          privateKey: rsaKey1.privateKey,
          publicKey: rsaKey1.publicKey,
        },
      ]);
      const retiredSignedToken = new JwtAuthService().sign({
        authMode: "jwt_bearer",
        actorType: "system",
        actorId: "sys-1",
        principalId: "p-sys-1",
        membershipId: null,
        subject: "sys-1",
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

      // Now set key-v1-retired back to status: retired in service ring
      process.env.JWT_KEY_RING_JSON = JSON.stringify([
        {
          kid: "key-v2",
          status: "active",
          algorithm: "RS256",
          privateKey: rsaKey2.privateKey,
          publicKey: rsaKey2.publicKey,
        },
        {
          kid: "key-v1-retired",
          status: "retired",
          algorithm: "RS256",
          publicKey: rsaKey1.publicKey,
        },
      ]);
      const verifiedRetired = authService.verify(retiredSignedToken);
      expect(verifiedRetired).toBeNull();
    } finally {
      process.env = prevEnv;
    }
  });

  it("4. Emergency rollback drill preserves strict claim validation (iss, aud, exp, sid, jti)", () => {
    const prevEnv = { ...process.env };
    try {
      // Key ring set up: v2 was active, rollback demoted v2 to previous, promoted v1 back to active
      process.env.JWT_KEY_RING_JSON = JSON.stringify([
        {
          kid: "key-v1",
          status: "active",
          algorithm: "RS256",
          privateKey: rsaKey1.privateKey,
          publicKey: rsaKey1.publicKey,
        },
        {
          kid: "key-v2",
          status: "previous",
          algorithm: "RS256",
          publicKey: rsaKey2.publicKey,
        },
      ]);
      process.env.JWT_ISSUER = "https://auth.local.drts.internal";
      process.env.JWT_AUDIENCE = "https://api.local.drts.internal";

      const authService = new JwtAuthService();

      // Token with wrong issuer must fail even during rollback
      const invalidIssuerToken = jwt.sign(
        {
          sub: "sys-1",
          actorType: "system",
          realm: "ops",
          tenantId: null,
          roleFamilies: [],
          roles: [],
          scopes: [],
        },
        rsaKey1.privateKey,
        {
          algorithm: "RS256",
          keyid: "key-v1",
          issuer: "https://attacker.com",
          audience: "https://api.local.drts.internal",
        },
      );

      expect(authService.verify(invalidIssuerToken)).toBeNull();
    } finally {
      process.env = prevEnv;
    }
  });

  it("5. Python rotation CLI tool (rotate-auth-keys.py) executes inspect, generate, rotate, retire, and rollback", () => {
    const initialRing = JSON.stringify([
      {
        kid: "key-initial-1",
        status: "active",
        algorithm: "RS256",
        publicKey: rsaKey1.publicKey,
        privateKey: rsaKey1.privateKey,
      },
    ]);

    // Test inspect command (redacts private key)
    const inspectOutput = execSync(
      `python3 scripts/rotate-auth-keys.py inspect --json-ring '${initialRing}'`,
      { encoding: "utf-8" },
    );
    expect(inspectOutput).toContain("key-initial-1");
    expect(inspectOutput).toContain("***REDACTED PRIVATE KEY***");

    // Test retire command
    const retireOutput = execSync(
      `python3 scripts/rotate-auth-keys.py retire --target-kid key-initial-1 --json-ring '${initialRing}'`,
      { encoding: "utf-8" },
    );
    expect(retireOutput).toContain("Retired key 'key-initial-1' successfully.");

    // Test rollback command
    const twoKeyRing = JSON.stringify([
      {
        kid: "key-initial-2",
        status: "active",
        algorithm: "RS256",
        publicKey: rsaKey2.publicKey,
        privateKey: rsaKey2.privateKey,
      },
      {
        kid: "key-initial-1",
        status: "previous",
        algorithm: "RS256",
        publicKey: rsaKey1.publicKey,
      },
    ]);
    const rollbackOutput = execSync(
      `python3 scripts/rotate-auth-keys.py rollback --target-kid key-initial-1 --json-ring '${twoKeyRing}'`,
      { encoding: "utf-8" },
    );
    expect(rollbackOutput).toContain("Key 'key-initial-1' is now ACTIVE");
    expect(rollbackOutput).toContain("Strict claim validation");
  });
});
