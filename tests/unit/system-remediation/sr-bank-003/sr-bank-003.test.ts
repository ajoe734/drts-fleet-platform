import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { generateKeyPairSync, verify, constants } from "node:crypto";
import { writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

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
import { runCli } from "../../../../apps/bank-console-web/app/artifacts/verify-artifact";

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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.BANK_ARTIFACT_SIGNING_PRIVATE_KEY;
    delete process.env.BANK_ARTIFACT_SIGNING_PUBLIC_KEY;
    delete process.env.BANK_ARTIFACT_SIGNING_KEY_ID;
    delete process.env.BANK_SIGNING_PRIVATE_KEY;
    delete process.env.BANK_SIGNING_PUBLIC_KEY;
    delete process.env.BANK_SIGNING_KEY_ID;
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
    it("produces an UNSIGNED artifact when no signing key is configured", () => {
      delete process.env.BANK_ARTIFACT_SIGNING_PRIVATE_KEY;
      delete process.env.BANK_SIGNING_PRIVATE_KEY;

      const statementPayload = [
        "================================================================================",
        "DRTS SETTLEMENT STATEMENT (NON-FIXTURE ARTIFACT)",
        "================================================================================",
        "Statement ID  : settlement-statement-tenant_ctbc-2026-08",
        "Period        : 2026-08",
        "Issuer Tenant : 中國信託商業銀行 (tenant_ctbc)",
        "Program       : ctbc-world-elite",
        "Status        : DUE",
        "Issued At     : 2026-08-06T00:00:00Z",
        "Due At        : 2026-08-31T23:59:59Z",
        "",
        "--------------------------------------------------------------------------------",
        "FINANCIAL SUMMARY (ISSUER PAYS DRTS)",
        "--------------------------------------------------------------------------------",
        "Total Trips                  : 1",
        "Total Fare Amount            : TWD 1,450",
        "Total Subsidised Amount      : TWD 1,200",
        "Total Cardholder Paid Amount : TWD 250",
        "Total Issuer Payable Amount  : TWD 1,200",
      ].join("\n");

      const text = buildArtifactText(statementPayload, {
        authDomain: "drts.settlement.issuer",
      });

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
    it("generates a genuine RSA digital signature when a private key is configured", () => {
      process.env.BANK_ARTIFACT_SIGNING_PRIVATE_KEY = testRsaKeyPair.privateKey;
      process.env.BANK_ARTIFACT_SIGNING_PUBLIC_KEY = testRsaKeyPair.publicKey;
      process.env.BANK_ARTIFACT_SIGNING_KEY_ID = "bank-ctbc-signer-2026-v1";

      const statementPayload = [
        "================================================================================",
        "DRTS SETTLEMENT STATEMENT (NON-FIXTURE ARTIFACT)",
        "================================================================================",
        "Statement ID  : settlement-statement-tenant_ctbc-2026-08",
        "Period        : 2026-08",
        "Issuer Tenant : 中國信託商業銀行 (tenant_ctbc)",
        "Program       : ctbc-world-elite",
        "Status        : DUE",
      ].join("\n");

      const text = buildArtifactText(statementPayload, {
        authDomain: "drts.settlement.issuer",
      });

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
        rmSync(payloadFile, { force: true });
        rmSync(sigBinFile, { force: true });
        rmSync(pubKeyFile, { force: true });
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
        rmSync(artifactFile, { force: true });
        rmSync(pubKeyFile, { force: true });
      }
    });
  });

  describe("6. Independent TypeScript / Node CLI Tool (runCli)", () => {
    it("verifies artifacts using the TypeScript/Node CLI verifier", () => {
      const payload = "INDEPENDENT TS NODE CLI TEST";
      const artifactText = buildArtifactText(payload, {
        signingConfig: {
          privateKeyPem: testRsaKeyPair.privateKey,
          keyId: "node-cli-test-key",
        },
      });

      const tempDir = tmpdir();
      const artifactFile = join(tempDir, `drts_node_cli_${Date.now()}.txt`);
      const pubKeyFile = join(tempDir, `drts_node_cli_pub_${Date.now()}.pem`);

      try {
        writeFileSync(artifactFile, artifactText, "utf-8");
        writeFileSync(pubKeyFile, testRsaKeyPair.publicKey, "utf-8");

        const exitCode = runCli([artifactFile, "--public-key", pubKeyFile]);
        expect(exitCode).toBe(0);
      } finally {
        rmSync(artifactFile, { force: true });
        rmSync(pubKeyFile, { force: true });
      }
    });
  });

  describe("7. Trip Artifact Format & Verification", () => {
    it("builds and verifies trip artifact with actual SHA-256 and audit manifest", () => {
      const tripPayload = [
        "================================================================================",
        "DRTS TRIP SETTLEMENT RECEIPT (NON-FIXTURE ARTIFACT)",
        "================================================================================",
        "Trip ID             : trip_ctbc_260601_001",
        "Order No            : ORD-202608-001",
        "Completed At        : 2026-08-05T03:00:00Z",
        "Route               : 台北車站 -> 桃園國際機場第二航廈",
        "Fare                : TWD 1450 | Subsidy: TWD 1200 | Paid: TWD 250",
        "Dispute Status      : NORMAL",
      ].join("\n");

      const text = buildArtifactText(tripPayload, {
        authDomain: "drts.settlement.issuer",
      });

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
