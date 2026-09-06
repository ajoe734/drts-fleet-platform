import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  generateKeyPairSync,
  createHash,
  createVerify,
  type KeyPairSyncResult,
} from "node:crypto";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import {
  buildSignedArtifactText,
  computeArtifactDigest,
  parseArtifact,
  verifyArtifact,
  extractArtifactCryptoMaterial,
} from "../../../../apps/bank-console-web/app/artifacts/artifact-crypto";

describe("SR-BANK-003: Bank Artifact Digest & Cryptographic Signature Verification", () => {
  let rsaKeys: KeyPairSyncResult<string, string>;
  let tempDir: string;

  beforeEach(() => {
    rsaKeys = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sr-bank-003-test-"));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors in test teardown
    }
  });

  const sampleStatementBody = [
    "================================================================================",
    "DRTS SETTLEMENT STATEMENT (NON-FIXTURE ARTIFACT)",
    "================================================================================",
    "Statement ID  : settlement-statement-tenant_ctbc-2026-08",
    "Period        : 2026-08",
    "Issuer Tenant : 中國信託商業銀行 (tenant_ctbc)",
    "Program       : 中信機場 World Elite",
    "Status        : DUE",
    "Issued At     : 2026-08-06T00:00:00.000Z",
    "Due At        : 2026-09-05T00:00:00.000Z",
    "",
    "--------------------------------------------------------------------------------",
    "FINANCIAL SUMMARY (ISSUER PAYS DRTS)",
    "--------------------------------------------------------------------------------",
    "Total Trips                  : 1",
    "Total Fare Amount            : TWD 1,450",
    "Total Subsidised Amount      : TWD 1,200",
    "Total Cardholder Paid Amount : TWD 250",
    "Total Issuer Payable Amount  : TWD 1,200",
    "",
    "--------------------------------------------------------------------------------",
    "TRIP LINE ITEMS",
    "--------------------------------------------------------------------------------",
    "[1] Trip ID: trip_ctbc_260601_001 | Order No: ORD-CTBC-001 | Date: 2026-08-05",
    "    Route       : TPE -> Downtown",
    "    Fare        : TWD 1450 | Subsidy: TWD 1200 | Paid: TWD 250",
    "    Benefit Ref : BEN-CTBC-0003",
    "    Cardholder  : CH••••33",
    "    Card Ref    : 4000••••1234",
    "    Disputed    : NO",
  ].join("\n");

  describe("1. R14 Defect Remediation: True SHA-256 Digest vs Old Hex-Encoding", () => {
    it("computes true 64-hex SHA-256 digest over actual payload bytes", () => {
      const { manifestHash, bodyBytes } = computeArtifactDigest(sampleStatementBody);

      expect(manifestHash).toHaveLength(64);
      expect(manifestHash).toMatch(/^[0-9a-f]{64}$/);

      // Independent SHA-256 recomputation must match exactly
      const independentHash = createHash("sha256").update(bodyBytes).digest("hex");
      expect(manifestHash).toBe(independentHash);
    });

    it("does NOT produce reversible hex-encoded plaintext strings (R14 audit defect)", () => {
      const { manifestHash } = computeArtifactDigest(sampleStatementBody);

      // The old defect hex-encoded "settlement-statement-tenant_ctbc-2026-08:2026-08:120000"
      // which decoded back to ASCII text and had 112 hex chars.
      const oldDefectHex = Buffer.from(
        "settlement-statement-tenant_ctbc-2026-08:2026-08:120000",
      ).toString("hex");

      expect(manifestHash).not.toBe(oldDefectHex);
      expect(manifestHash).toHaveLength(64);

      // Decoding the SHA-256 hex must NOT be valid ASCII statement text
      const decoded = Buffer.from(manifestHash, "hex").toString("utf-8");
      expect(decoded).not.toContain("settlement-statement");
      expect(decoded).not.toContain("2026-08");
    });

    it("fails digest verification immediately if even a single byte in payload is modified", () => {
      const artifact = buildSignedArtifactText(sampleStatementBody, {
        privateKey: rsaKeys.privateKey,
        keyId: "test-rsa-key-01",
      });

      // 1. Verify authentic artifact
      const initialVerification = verifyArtifact(artifact.fullText, rsaKeys.publicKey);
      expect(initialVerification.validDigest).toBe(true);
      expect(initialVerification.validSignature).toBe(true);

      // 2. Tamper with single byte in payload: change "TWD 1,450" to "TWD 1,451"
      const tamperedText = artifact.fullText.replace("TWD 1,450", "TWD 1,451");
      const tamperedVerification = verifyArtifact(tamperedText, rsaKeys.publicKey);

      expect(tamperedVerification.validDigest).toBe(false);
      expect(tamperedVerification.validSignature).toBe(false);
      expect(tamperedVerification.reason).toContain("Digest mismatch");
    });
  });

  describe("2. Unconfigured Key Behavior: Honest UNSIGNED without Fake VALID claims", () => {
    it("marks artifact as UNSIGNED when no signing key is configured", () => {
      // Build artifact without supplying privateKey and ensure env is unset
      const savedKey = process.env.BANK_ARTIFACT_SIGNING_PRIVATE_KEY;
      delete process.env.BANK_ARTIFACT_SIGNING_PRIVATE_KEY;
      delete process.env.BANK_SIGNING_PRIVATE_KEY;
      delete process.env.JWT_PRIVATE_KEY;

      try {
        const artifact = buildSignedArtifactText(sampleStatementBody);

        expect(artifact.signatureStatus).toBe("UNSIGNED");
        expect(artifact.digitalSignature).toBe("UNSIGNED");
        expect(artifact.keyId).toBe("NONE");

        // The text must NOT contain any fake _VALID token
        expect(artifact.fullText).not.toContain("_VALID");
        expect(artifact.fullText).not.toContain("SIG_DRTS_RSA2048");
        expect(artifact.fullText).toContain("Signature Status   : UNSIGNED");
        expect(artifact.fullText).toContain("Digital Signature  : UNSIGNED");

        // Verify with verifyArtifact
        const result = verifyArtifact(artifact.fullText);
        expect(result.validDigest).toBe(true);
        expect(result.signatureStatus).toBe("UNSIGNED");
        expect(result.validSignature).toBe(false);
        expect(result.reason).toContain("UNSIGNED");
      } finally {
        if (savedKey) process.env.BANK_ARTIFACT_SIGNING_PRIVATE_KEY = savedKey;
      }
    });

    it("rejects manufactured or forged signature string claiming VALID", () => {
      const artifact = buildSignedArtifactText(sampleStatementBody);
      // Attempt to forge a signature string like the old defect
      const forgedText = artifact.fullText
        .replace("Signature Status   : UNSIGNED", "Signature Status   : SIGNED")
        .replace(
          "Digital Signature  : UNSIGNED",
          "Digital Signature  : SIG_DRTS_RSA2048_settlement-statement-tenant_ctbc-2026-08_VALID",
        );

      const result = verifyArtifact(forgedText, rsaKeys.publicKey);
      expect(result.validSignature).toBe(false);
      expect(result.reason).toBeDefined();
    });
  });

  describe("3. Cryptographic RSA-SHA256 Signing & Public Key Verification", () => {
    it("successfully signs with real RSA private key and verifies with public key", () => {
      const artifact = buildSignedArtifactText(sampleStatementBody, {
        privateKey: rsaKeys.privateKey,
        keyId: "rsa-bank-key-2026",
      });

      expect(artifact.signatureStatus).toBe("SIGNED");
      expect(artifact.keyId).toBe("rsa-bank-key-2026");
      expect(artifact.digitalSignature).not.toBe("UNSIGNED");
      expect(artifact.digitalSignature).not.toContain("_VALID");

      // Verify that signature is base64
      const sigBuffer = Buffer.from(artifact.digitalSignature, "base64");
      expect(sigBuffer.length).toBe(256); // 2048-bit RSA key produces 256-byte signature

      // Verify using verifyArtifact function
      const verifyResult = verifyArtifact(artifact.fullText, rsaKeys.publicKey);
      expect(verifyResult.validDigest).toBe(true);
      expect(verifyResult.signatureStatus).toBe("SIGNED");
      expect(verifyResult.validSignature).toBe(true);
      expect(verifyResult.reason).toBeUndefined();

      // Verify independently using native node:crypto createVerify
      const parsed = parseArtifact(artifact.fullText)!;
      expect(parsed).not.toBeNull();
      const nativeVerifier = createVerify("SHA256");
      nativeVerifier.update(parsed.bodyBytes);
      nativeVerifier.end();
      const nativeOk = nativeVerifier.verify(
        rsaKeys.publicKey,
        parsed.manifest.digitalSignature!,
        "base64",
      );
      expect(nativeOk).toBe(true);
    });

    it("fails signature verification if public key belongs to a different key pair", () => {
      const anotherKeyPair = generateKeyPairSync("rsa", {
        modulusLength: 2048,
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
      });

      const artifact = buildSignedArtifactText(sampleStatementBody, {
        privateKey: rsaKeys.privateKey,
        keyId: "rsa-bank-key-2026",
      });

      // Verification with wrong public key must fail
      const result = verifyArtifact(artifact.fullText, anotherKeyPair.publicKey);
      expect(result.validDigest).toBe(true); // digest still matches payload
      expect(result.validSignature).toBe(false); // but cryptographic signature fails
      expect(result.reason).toContain("signature verification failed");
    });

    it("fails signature verification if signature bytes are tampered with", () => {
      const artifact = buildSignedArtifactText(sampleStatementBody, {
        privateKey: rsaKeys.privateKey,
        keyId: "rsa-bank-key-2026",
      });

      // Flip one character in the base64 signature
      const sig = artifact.digitalSignature;
      const flippedChar = sig[10] === "A" ? "B" : "A";
      const corruptedSig = sig.slice(0, 10) + flippedChar + sig.slice(11);

      const tamperedText = artifact.fullText.replace(sig, corruptedSig);
      const result = verifyArtifact(tamperedText, rsaKeys.publicKey);

      expect(result.validDigest).toBe(true);
      expect(result.validSignature).toBe(false);
    });
  });

  describe("4. Independent External Tools Verification (sha256sum and openssl)", () => {
    it("can be verified by standard sha256sum CLI utility", () => {
      const artifact = buildSignedArtifactText(sampleStatementBody, {
        privateKey: rsaKeys.privateKey,
        keyId: "rsa-bank-key-2026",
      });

      const cryptoMat = extractArtifactCryptoMaterial(artifact.fullText)!;
      expect(cryptoMat).not.toBeNull();

      const payloadPath = path.join(tempDir, "payload.txt");
      fs.writeFileSync(payloadPath, cryptoMat.bodyBytes);

      // Execute standard Linux sha256sum command
      const sha256Output = execFileSync("sha256sum", [payloadPath], {
        encoding: "utf-8",
      });
      const [cliHash] = sha256Output.trim().split(/\s+/);

      expect(cliHash.toLowerCase()).toBe(cryptoMat.manifestHash.toLowerCase());
    });

    it("can be verified by standard openssl CLI utility (and fails when tampered)", () => {
      const artifact = buildSignedArtifactText(sampleStatementBody, {
        privateKey: rsaKeys.privateKey,
        keyId: "rsa-bank-key-2026",
      });

      const cryptoMat = extractArtifactCryptoMaterial(artifact.fullText)!;
      expect(cryptoMat).not.toBeNull();
      expect(cryptoMat.signatureBuffer).not.toBeNull();

      const payloadPath = path.join(tempDir, "payload.txt");
      const pubKeyPath = path.join(tempDir, "pubkey.pem");
      const sigPath = path.join(tempDir, "signature.bin");

      fs.writeFileSync(payloadPath, cryptoMat.bodyBytes);
      fs.writeFileSync(pubKeyPath, rsaKeys.publicKey);
      fs.writeFileSync(sigPath, cryptoMat.signatureBuffer!);

      // 1. Run openssl dgst -sha256 -verify pubkey.pem -signature signature.bin payload.txt
      const opensslOutput = execFileSync(
        "openssl",
        [
          "dgst",
          "-sha256",
          "-verify",
          pubKeyPath,
          "-signature",
          sigPath,
          payloadPath,
        ],
        { encoding: "utf-8" },
      );
      expect(opensslOutput.trim()).toBe("Verified OK");

      // 2. Tamper payload by 1 byte: append single space
      fs.writeFileSync(
        payloadPath,
        Buffer.concat([cryptoMat.bodyBytes, Buffer.from(" ")]),
      );

      // Openssl verification MUST exit with non-zero code or Verification Failure
      let opensslFailed = false;
      try {
        const failOutput = execFileSync(
          "openssl",
          [
            "dgst",
            "-sha256",
            "-verify",
            pubKeyPath,
            "-signature",
            sigPath,
            payloadPath,
          ],
          { encoding: "utf-8" },
        );
        if (failOutput.includes("Verification Failure")) {
          opensslFailed = true;
        }
      } catch (err: unknown) {
        opensslFailed = true;
      }
      expect(opensslFailed).toBe(true);
    });
  });

  describe("5. Trip Settlement Receipt Artifact Verification", () => {
    const sampleTripReceiptBody = [
      "================================================================================",
      "DRTS TRIP SETTLEMENT RECEIPT (NON-FIXTURE ARTIFACT)",
      "================================================================================",
      "Trip ID            : trip_ctbc_260601_001",
      "Order No           : ORD-CTBC-001",
      "Statement Ref      : settlement-statement-tenant_ctbc-2026-08",
      "Trip Date          : 2026-08-05",
      "Issuer Tenant      : 中國信託商業銀行 (tenant_ctbc)",
      "Route              : TPE -> Downtown",
      "",
      "--------------------------------------------------------------------------------",
      "FARE & SUBSIDY BREAKDOWN",
      "--------------------------------------------------------------------------------",
      "Gross Fare Amount  : TWD 1,450",
      "Program Subsidy    : TWD 1,200",
      "Cardholder Paid    : TWD 250",
      "",
      "--------------------------------------------------------------------------------",
      "MASKED IDENTIFIERS",
      "--------------------------------------------------------------------------------",
      "Benefit Ref        : BEN-CTBC-0003",
      "Cardholder Ref     : CH••••33",
      "Card Ref           : 4000••••1234",
      "Dispute Status     : NORMAL",
    ].join("\n");

    it("verifies digest and signature for trip settlement receipt artifacts", () => {
      const artifact = buildSignedArtifactText(sampleTripReceiptBody, {
        privateKey: rsaKeys.privateKey,
        keyId: "trip-key-01",
      });

      expect(artifact.fullText).toContain(
        "DRTS TRIP SETTLEMENT RECEIPT (NON-FIXTURE ARTIFACT)",
      );
      expect(artifact.signatureStatus).toBe("SIGNED");

      const result = verifyArtifact(artifact.fullText, rsaKeys.publicKey);
      expect(result.validDigest).toBe(true);
      expect(result.validSignature).toBe(true);
    });

    it("fails verification when trip fare is tampered with by 1 byte", () => {
      const artifact = buildSignedArtifactText(sampleTripReceiptBody, {
        privateKey: rsaKeys.privateKey,
        keyId: "trip-key-01",
      });

      const tampered = artifact.fullText.replace("TWD 1,450", "TWD 1,459");
      const result = verifyArtifact(tampered, rsaKeys.publicKey);

      expect(result.validDigest).toBe(false);
      expect(result.validSignature).toBe(false);
    });
  });

  describe("6. Environment Variable Key Resolution & Priority (No Hardcoded Private Keys)", () => {
    it("resolves BANK_ARTIFACT_SIGNING_PRIVATE_KEY from environment", () => {
      process.env.BANK_ARTIFACT_SIGNING_PRIVATE_KEY = rsaKeys.privateKey;
      process.env.BANK_ARTIFACT_SIGNING_KEY_ID = "env-key-id-001";

      try {
        const artifact = buildSignedArtifactText(sampleStatementBody);
        expect(artifact.signatureStatus).toBe("SIGNED");
        expect(artifact.keyId).toBe("env-key-id-001");

        const verified = verifyArtifact(artifact.fullText, rsaKeys.publicKey);
        expect(verified.validDigest).toBe(true);
        expect(verified.validSignature).toBe(true);
      } finally {
        delete process.env.BANK_ARTIFACT_SIGNING_PRIVATE_KEY;
        delete process.env.BANK_ARTIFACT_SIGNING_KEY_ID;
      }
    });

    it("falls back to JWT_PRIVATE_KEY when BANK_ARTIFACT_SIGNING_PRIVATE_KEY is unset", () => {
      delete process.env.BANK_ARTIFACT_SIGNING_PRIVATE_KEY;
      process.env.JWT_PRIVATE_KEY = rsaKeys.privateKey;
      process.env.JWT_KID_CURRENT = "jwt-fallback-kid";

      try {
        const artifact = buildSignedArtifactText(sampleStatementBody);
        expect(artifact.signatureStatus).toBe("SIGNED");
        expect(artifact.keyId).toBe("jwt-fallback-kid");

        const verified = verifyArtifact(artifact.fullText, rsaKeys.publicKey);
        expect(verified.validDigest).toBe(true);
        expect(verified.validSignature).toBe(true);
      } finally {
        delete process.env.JWT_PRIVATE_KEY;
        delete process.env.JWT_KID_CURRENT;
      }
    });
  });

  describe("7. Malformed / Corrupted Artifact Structure Handling", () => {
    it("returns MALFORMED when manifest section header is missing entirely", () => {
      const corruptedText = "Just random text without manifest section";
      const result = verifyArtifact(corruptedText, rsaKeys.publicKey);

      expect(result.validDigest).toBe(false);
      expect(result.signatureStatus).toBe("MALFORMED");
      expect(result.reason).toContain("Missing or invalid manifest section");
    });

    it("parses empty or partial manifest fields gracefully", () => {
      const parsed = parseArtifact(sampleStatementBody);
      expect(parsed).toBeNull(); // Missing manifest section header
    });
  });
});
