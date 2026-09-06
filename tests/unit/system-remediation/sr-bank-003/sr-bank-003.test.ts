import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { generateKeyPairSync, createHash, verify, constants } from "node:crypto";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("../../../../apps/bank-console-web/lib/session", () => ({
  BANK_CONSOLE_ROLE_COOKIE: "drts_bank_console_role",
  BANK_CONSOLE_SESSION_COOKIE: "drts_bank_console_session",
  resolveServerSessionRole: vi.fn((cookie, roleParam) => {
    if (!cookie || cookie.includes("unsigned") || cookie.includes("invalid")) {
      return {
        role: "bank_ops_viewer",
        bankCode: "ctbc",
        isAuthorizedForExport: false,
        isForged: true,
        isTampered: false,
      };
    }
    return {
      role: "bank_finance",
      bankCode: "ctbc",
      isAuthorizedForExport: true,
      isForged: false,
      isTampered: false,
    };
  }),
  signSessionRole: vi.fn((role: string, bankCode: string = "ctbc") => {
    return `${role}:${bankCode}.mock_signature_for_test`;
  }),
}));

import {
  computePayloadDigest,
  signPayloadBytes,
  buildArtifactText,
  parseArtifact,
  verifyArtifact,
  UNSIGNED_MARKER,
  SIGNATURE_ALGORITHM,
  ARTIFACT_MANIFEST_HEADER,
} from "../../../../apps/bank-console-web/app/artifacts/artifact-crypto";

import { GET as getStatementArtifact } from "../../../../apps/bank-console-web/app/artifacts/statements/[id]/route";
import { GET as getTripArtifact } from "../../../../apps/bank-console-web/app/artifacts/trips/[id]/route";
import { signSessionRole } from "../../../../apps/bank-console-web/lib/session";

// Helpers for test mock responses
function envelope<T>(data: T) {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const mockStatements = [
  {
    statement_id: "settlement-statement-tenant_ctbc-2026-08",
    tenant_id: "tenant_ctbc",
    period: "2026-08",
    status: "due",
    lines: [
      {
        trip_id: "trip_ctbc_260601_001",
        completed_at: "2026-08-05T03:00:00Z",
        fare: { amount_minor: 145000, currency: "TWD" },
        subsidised_amount: { amount_minor: 120000, currency: "TWD" },
        paid_amount: { amount_minor: 25000, currency: "TWD" },
        benefit_reference: "BEN-CTBC-0003",
        issuer_authorization_ref: "AUTH-CTBC-003",
        cardholder_ref_masked: "CH••••33",
      },
    ],
    totals: {
      trip_count: 1,
      fare_total: { amount_minor: 145000, currency: "TWD" },
      subsidised_total: { amount_minor: 120000, currency: "TWD" },
      paid_total: { amount_minor: 25000, currency: "TWD" },
      issuer_payable: { amount_minor: 120000, currency: "TWD" },
    },
    artifact_ref: {
      artifact_id: "settlement-statement-tenant_ctbc-2026-08",
      kind: "settlement_statement",
      manifest_hash: "hash",
    },
    generated_at: "2026-08-06T00:00:00Z",
  },
];

describe("SR-BANK-003: Bank Evidence Artifact Digest & Cryptographic Signature Verification", () => {
  let testRsaKeyPair: { publicKey: string; privateKey: string };
  let secondRsaKeyPair: { publicKey: string; privateKey: string };

  beforeEach(() => {
    // Generate fresh RSA-2048 key pairs for testing
    testRsaKeyPair = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });

    secondRsaKeyPair = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });

    // Mock fetch for route handlers
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = new URL(
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url,
        );
        const path = `${url.pathname}${url.search}`;

        if (path === "/api/tenant/settlement-statements") {
          return envelope({ items: mockStatements });
        }
        if (path === "/api/tenant/service-programs") {
          return envelope({ items: [] });
        }
        if (path === "/api/tenant/program-usage") {
          return envelope({ items: [] });
        }
        if (path.startsWith("/api/tenant/orders")) {
          return envelope({ items: [] });
        }
        if (path === "/api/tenant/contracts") {
          return envelope({ items: [] });
        }
        if (path === "/api/tenant/users") {
          return envelope({ items: [] });
        }
        if (path === "/api/tenant/audit") {
          return envelope({ items: [] });
        }
        throw new Error(`Unhandled fetch URL: ${path}`);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.BANK_ARTIFACT_SIGNING_PRIVATE_KEY;
    delete process.env.BANK_ARTIFACT_SIGNING_PUBLIC_KEY;
    delete process.env.BANK_ARTIFACT_SIGNING_KEY_ID;
  });

  describe("1. Historical Defect Remediation (R14 & C083)", () => {
    it("stops using reversible hex encoding to pretend to be a SHA-256 hash", () => {
      // Prior defect: sha256: Buffer.from("statement:period:amount").toString("hex")
      const statementNo = "settlement-statement-tenant_ctbc-2026-08";
      const period = "2026-08";
      const payable = 1200;
      const fakeHashString = Buffer.from(
        `${statementNo}:${period}:${payable}`,
      ).toString("hex");

      // The historical fake hash was variable length (e.g. 106-112 hex chars) and trivially reversible:
      expect(fakeHashString.length).not.toBe(64);
      expect(fakeHashString.length).toBeGreaterThan(64);
      const decodedPlaintext = Buffer.from(fakeHashString, "hex").toString(
        "utf-8",
      );
      expect(decodedPlaintext).toBe(`${statementNo}:${period}:${payable}`);

      // The new implementation computes the REAL SHA-256 cryptographic digest of actual bytes:
      const payloadSample = "TEST STATEMENT CONTENT LINE 1\nLINE 2\n";
      const digest = computePayloadDigest(payloadSample);

      // SHA-256 produces exactly 64 hexadecimal characters (256 bits):
      expect(digest.hex.length).toBe(64);
      expect(digest.formatted).toMatch(/^sha256:[a-f0-9]{64}$/);

      // SHA-256 is an irreversible cryptographic one-way function
      expect(() => {
        const decoded = Buffer.from(digest.hex, "hex").toString("utf-8");
        expect(decoded).not.toBe(payloadSample);
      }).not.toThrow();
    });

    it("stops using fixed dummy SIG_DRTS_RSA2048 string to fake verification", () => {
      const payloadSample = "STATEMENT DATA PAYLOAD";
      // Without private key:
      const unsignedResult = signPayloadBytes(payloadSample, {
        privateKeyPem: null,
      });

      expect(unsignedResult.status).toBe("UNSIGNED");
      expect(unsignedResult.algorithm).toBe("NONE");
      expect(unsignedResult.signature).toBe(UNSIGNED_MARKER);
      expect(unsignedResult.signature).not.toContain("VALID");
      expect(unsignedResult.signature).not.toContain("SIG_DRTS_RSA2048");
    });
  });

  describe("2. Default Configuration: No Fake VALID & Explicit UNSIGNED", () => {
    it("produces an UNSIGNED artifact when no signing key is configured", async () => {
      delete process.env.BANK_ARTIFACT_SIGNING_PRIVATE_KEY;

      const signedFinance = signSessionRole("bank_finance", "ctbc");
      const req = new NextRequest(
        "http://localhost:3000/artifacts/statements/settlement-statement-tenant_ctbc-2026-08.pdf?bank=ctbc",
        { headers: { cookie: `drts_bank_console_session=${signedFinance}` } },
      );

      const res = await getStatementArtifact(req, {
        params: Promise.resolve({
          id: "settlement-statement-tenant_ctbc-2026-08.pdf",
        }),
      });

      expect(res.status).toBe(200);
      const text = await res.text();

      // Check explicit manifest fields
      expect(text).toContain("Signature Status   : UNSIGNED");
      expect(text).toContain("Signature Algorithm: NONE");
      expect(text).toContain("Key ID             : NONE");
      expect(text).toContain(
        `Digital Signature  : ${UNSIGNED_MARKER}`,
      );
      expect(text).not.toContain("_VALID");

      // Verify with independent verifier
      const verification = verifyArtifact(text);
      expect(verification.ok).toBe(true);
      expect(verification.status).toBe("UNSIGNED");
      expect(verification.hashMatch).toBe(true);
      expect(verification.signatureVerified).toBeNull();
      expect(verification.errors).toHaveLength(0);
    });

    it("rejects an unsigned artifact that improperly claims to have a VALID signature", () => {
      const payload = "Some settlement payload";
      const tamperedArtifact = [
        payload,
        "",
        ARTIFACT_MANIFEST_HEADER,
        "Issuer Auth Domain : drts.settlement.issuer",
        "Signature Status   : UNSIGNED",
        "Signature Algorithm: NONE",
        "Key ID             : NONE",
        `Manifest Hash      : ${computePayloadDigest(payload).formatted}`,
        "Digital Signature  : SIG_DRTS_RSA2048_FAKE_VALID",
        `Generated At       : ${new Date().toISOString()}`,
        "================================================================================",
      ].join("\n");

      const result = verifyArtifact(tamperedArtifact);
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes("Improper fake signature"))).toBe(
        true,
      );
    });
  });

  describe("3. Asymmetric Cryptographic Signing (RSASSA-PKCS1-v1_5-SHA256)", () => {
    it("generates a genuine RSA digital signature when a private key is configured", async () => {
      process.env.BANK_ARTIFACT_SIGNING_PRIVATE_KEY = testRsaKeyPair.privateKey;
      process.env.BANK_ARTIFACT_SIGNING_PUBLIC_KEY = testRsaKeyPair.publicKey;
      process.env.BANK_ARTIFACT_SIGNING_KEY_ID = "bank-ctbc-signer-2026-v1";

      const signedFinance = signSessionRole("bank_finance", "ctbc");
      const req = new NextRequest(
        "http://localhost:3000/artifacts/statements/settlement-statement-tenant_ctbc-2026-08.pdf?bank=ctbc",
        { headers: { cookie: `drts_bank_console_session=${signedFinance}` } },
      );

      const res = await getStatementArtifact(req, {
        params: Promise.resolve({
          id: "settlement-statement-tenant_ctbc-2026-08.pdf",
        }),
      });

      expect(res.status).toBe(200);
      const text = await res.text();

      expect(text).toContain("Signature Status   : SIGNED");
      expect(text).toContain(`Signature Algorithm: ${SIGNATURE_ALGORITHM}`);
      expect(text).toContain("Key ID             : bank-ctbc-signer-2026-v1");

      const parsed = parseArtifact(text);
      expect(parsed.manifest.signatureStatus).toBe("SIGNED");
      expect(parsed.manifest.digitalSignature.length).toBeGreaterThan(100);

      // Verify using verifyArtifact with public key
      const verification = verifyArtifact(text, {
        publicKeyPem: testRsaKeyPair.publicKey,
      });

      expect(verification.ok).toBe(true);
      expect(verification.status).toBe("SIGNED");
      expect(verification.hashMatch).toBe(true);
      expect(verification.signatureVerified).toBe(true);
      expect(verification.errors).toHaveLength(0);
    });

    it("verifies with native crypto.verify using RSA public key", () => {
      const payload = "DRTS SETTLEMENT STATEMENT\nStatement ID : STM-001\nTotal : TWD 1200";
      const artifactText = buildArtifactText(payload, {
        signingConfig: {
          privateKeyPem: testRsaKeyPair.privateKey,
          keyId: "rsa-key-test-1",
        },
      });

      const { payloadText, manifest } = parseArtifact(artifactText);
      const sigBuf = Buffer.from(manifest.digitalSignature, "base64");
      const payloadBuf = Buffer.from(payloadText, "utf-8");

      const isValid = verify(
        "sha256",
        payloadBuf,
        {
          key: testRsaKeyPair.publicKey,
          padding: constants.RSA_PKCS1_PADDING,
        },
        sigBuf,
      );

      expect(isValid).toBe(true);
    });

    it("rejects verification if wrong public key is used", () => {
      const payload = "CONFIDENTIAL BANK SETTLEMENT STATEMENT";
      const artifactText = buildArtifactText(payload, {
        signingConfig: {
          privateKeyPem: testRsaKeyPair.privateKey,
          keyId: "key-1",
        },
      });

      // Try to verify with a different public key
      const result = verifyArtifact(artifactText, {
        publicKeyPem: secondRsaKeyPair.publicKey,
      });

      expect(result.ok).toBe(false);
      expect(result.signatureVerified).toBe(false);
      expect(result.status).toBe("TAMPERED");
      expect(
        result.errors.some((e) =>
          e.includes("Cryptographic signature verification failed"),
        ),
      ).toBe(true);
    });
  });

  describe("4. 1-Byte Tamper Resistance (Acceptance Requirement)", () => {
    it("fails SHA256 and public key signature verification when 1 byte of the payload is modified", () => {
      const payload = "Statement: STM-202608 | Total Payable: TWD 1,200 | Status: DUE";
      const artifactText = buildArtifactText(payload, {
        signingConfig: {
          privateKeyPem: testRsaKeyPair.privateKey,
          keyId: "bank-rsa-key",
        },
      });

      // Tamper 1 byte in payload: change '1,200' to '1,201' (1 byte difference)
      const tamperedText = artifactText.replace("1,200", "1,201");

      const verification = verifyArtifact(tamperedText, {
        publicKeyPem: testRsaKeyPair.publicKey,
      });

      expect(verification.ok).toBe(false);
      expect(verification.hashMatch).toBe(false);
      expect(verification.signatureVerified).toBe(false);
      expect(verification.status).toBe("TAMPERED");
      expect(
        verification.errors.some((e) => e.includes("Manifest Hash mismatch")),
      ).toBe(true);
      expect(
        verification.errors.some((e) =>
          e.includes("Cryptographic signature verification failed"),
        ),
      ).toBe(true);
    });

    it("fails signature verification when 1 byte of the signature is modified", () => {
      const payload = "Statement payload with valid RSA signature";
      const artifactText = buildArtifactText(payload, {
        signingConfig: {
          privateKeyPem: testRsaKeyPair.privateKey,
          keyId: "bank-rsa-key",
        },
      });

      const parsed = parseArtifact(artifactText);
      const originalSig = parsed.manifest.digitalSignature;

      // Tamper the signature by flipping the first character:
      const tamperedSig =
        (originalSig[0] === "A" ? "B" : "A") + originalSig.slice(1);
      const tamperedText = artifactText.replace(originalSig, tamperedSig);

      const verification = verifyArtifact(tamperedText, {
        publicKeyPem: testRsaKeyPair.publicKey,
      });

      expect(verification.ok).toBe(false);
      expect(verification.hashMatch).toBe(true); // payload wasn't modified
      expect(verification.signatureVerified).toBe(false); // but signature was tampered!
      expect(verification.status).toBe("TAMPERED");
      expect(
        verification.errors.some((e) =>
          e.includes("Cryptographic signature verification failed"),
        ),
      ).toBe(true);
    });

    it("fails signature verification even if an attacker recomputes the Manifest Hash to match tampered payload", () => {
      const originalPayload = "Original statement total: TWD 1,000";
      const artifactText = buildArtifactText(originalPayload, {
        signingConfig: {
          privateKeyPem: testRsaKeyPair.privateKey,
          keyId: "bank-rsa-key",
        },
      });

      // Attacker changes 1,000 to 9,999 AND updates Manifest Hash to match
      const tamperedPayload = "Original statement total: TWD 9,999";
      const newDigest = computePayloadDigest(tamperedPayload);

      const parsed = parseArtifact(artifactText);
      const forgedArtifactText = artifactText
        .replace(originalPayload, tamperedPayload)
        .replace(parsed.manifest.manifestHash, newDigest.formatted);

      const verification = verifyArtifact(forgedArtifactText, {
        publicKeyPem: testRsaKeyPair.publicKey,
      });

      expect(verification.ok).toBe(false);
      expect(verification.hashMatch).toBe(true); // hash matches tampered payload
      expect(verification.signatureVerified).toBe(false); // BUT RSA signature fails because attacker lacks private key!
      expect(verification.status).toBe("TAMPERED");
    });
  });

  describe("5. Independent Tool Verification via External CLI (OpenSSL & sha256sum)", () => {
    it("verifies SHA-256 digest and RSA signature using openssl and sha256sum commands", () => {
      const payload = [
        "================================================================================",
        "DRTS INDEPENDENT TOOL AUDIT TEST",
        "================================================================================",
        "Statement ID : STM-OPENSSL-001",
        "Payable      : TWD 120,000",
      ].join("\n");

      const artifactText = buildArtifactText(payload, {
        signingConfig: {
          privateKeyPem: testRsaKeyPair.privateKey,
          keyId: "openssl-test-key",
        },
      });

      const parsed = parseArtifact(artifactText);

      // Write files to temporary directory for external CLI tool verification
      const tempDir = tmpdir();
      const payloadFile = join(tempDir, `drts_payload_${Date.now()}.txt`);
      const sigBinFile = join(tempDir, `drts_sig_${Date.now()}.bin`);
      const pubKeyFile = join(tempDir, `drts_pubkey_${Date.now()}.pem`);

      try {
        writeFileSync(payloadFile, parsed.payloadText, "utf-8");
        writeFileSync(
          sigBinFile,
          Buffer.from(parsed.manifest.digitalSignature, "base64"),
        );
        writeFileSync(pubKeyFile, testRsaKeyPair.publicKey, "utf-8");

        // 1. Independent sha256sum verification
        const sha256Output = execSync(`sha256sum "${payloadFile}"`, {
          encoding: "utf-8",
        });
        const calculatedSha256 = sha256Output.trim().split(/\s+/)[0];
        const manifestHashHex = parsed.manifest.manifestHash.replace(
          /^sha256:/i,
          "",
        );
        expect(calculatedSha256).toBe(manifestHashHex);

        // 2. Independent OpenSSL signature verification
        const opensslCommand = `openssl dgst -sha256 -verify "${pubKeyFile}" -signature "${sigBinFile}" "${payloadFile}"`;
        const opensslOutput = execSync(opensslCommand, { encoding: "utf-8" });
        expect(opensslOutput).toContain("Verified OK");

        // 3. Independent OpenSSL verification on 1-byte tampered payload must fail
        const tamperedPayload = parsed.payloadText.replace("120,000", "120,001");
        writeFileSync(payloadFile, tamperedPayload, "utf-8");

        expect(() => {
          execSync(opensslCommand, { encoding: "utf-8", stdio: "pipe" });
        }).toThrow();
      } finally {
        try {
          unlinkSync(payloadFile);
        } catch {}
        try {
          unlinkSync(sigBinFile);
        } catch {}
        try {
          unlinkSync(pubKeyFile);
        } catch {}
      }
    });

    it("verifies artifacts using the independent Python verification CLI tool", () => {
      const payload = "INDEPENDENT PYTHON VERIFICATION TEST";
      const artifactText = buildArtifactText(payload, {
        signingConfig: {
          privateKeyPem: testRsaKeyPair.privateKey,
          keyId: "python-test-key",
        },
      });

      const tempDir = tmpdir();
      const artifactFile = join(tempDir, `drts_artifact_${Date.now()}.txt`);
      const pubKeyFile = join(tempDir, `drts_pubkey_${Date.now()}.pem`);
      const scriptPath = join(__dirname, "verify_artifact.py");

      try {
        writeFileSync(artifactFile, artifactText, "utf-8");
        writeFileSync(pubKeyFile, testRsaKeyPair.publicKey, "utf-8");

        // 1. Success verification
        const output = execSync(
          `python3 "${scriptPath}" "${artifactFile}" --public-key "${pubKeyFile}"`,
          { encoding: "utf-8" },
        );
        expect(output).toContain("SHA-256 Match:    PASSED");
        expect(output).toContain("OpenSSL Cryptographic Signature Verification: PASSED");

        // 2. 1-byte tamper in payload causes failure
        const tamperedText = artifactText.replace("INDEPENDENT", "TAMPEREDDDD");
        writeFileSync(artifactFile, tamperedText, "utf-8");

        expect(() => {
          execSync(
            `python3 "${scriptPath}" "${artifactFile}" --public-key "${pubKeyFile}"`,
            { encoding: "utf-8", stdio: "pipe" },
          );
        }).toThrow();
      } finally {
        try {
          unlinkSync(artifactFile);
        } catch {}
        try {
          unlinkSync(pubKeyFile);
        } catch {}
      }
    });
  });

  describe("6. Trip Artifact Route Verification", () => {
    it("downloads and verifies trip artifact with actual SHA-256 and audit manifest", async () => {
      const signedFinance = signSessionRole("bank_finance", "ctbc");
      const req = new NextRequest(
        "http://localhost:3000/artifacts/trips/trip_ctbc_260601_001.pdf?bank=ctbc",
        { headers: { cookie: `drts_bank_console_session=${signedFinance}` } },
      );

      const res = await getTripArtifact(req, {
        params: Promise.resolve({ id: "trip_ctbc_260601_001.pdf" }),
      });

      expect(res.status).toBe(200);
      const text = await res.text();

      expect(text).toContain("DRTS TRIP SETTLEMENT RECEIPT (NON-FIXTURE ARTIFACT)");
      expect(text).toContain("DIGITAL SIGNATURE & AUDIT MANIFEST");
      expect(text).toContain("Issuer Auth Domain : drts.settlement.issuer");

      // Verify integrity
      const verification = verifyArtifact(text);
      expect(verification.ok).toBe(true);
      expect(verification.hashMatch).toBe(true);
      expect(verification.status).toBe("UNSIGNED");
    });
  });
});
