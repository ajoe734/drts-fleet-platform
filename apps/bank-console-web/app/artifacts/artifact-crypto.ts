import { createHash, createSign, createVerify, type KeyLike } from "node:crypto";

export const ARTIFACT_MANIFEST_DIVIDER =
  "--------------------------------------------------------------------------------";
export const ARTIFACT_MANIFEST_TITLE = "DIGITAL SIGNATURE & AUDIT MANIFEST";
export const ARTIFACT_FOOTER_DIVIDER =
  "================================================================================";
export const ARTIFACT_MANIFEST_SECTION_HEADER = `${ARTIFACT_MANIFEST_DIVIDER}\n${ARTIFACT_MANIFEST_TITLE}\n${ARTIFACT_MANIFEST_DIVIDER}`;

export interface ArtifactManifest {
  issuerAuthDomain?: string | undefined;
  digestAlgorithm?: string | undefined;
  manifestHash?: string | undefined;
  signatureStatus?: "SIGNED" | "UNSIGNED" | undefined;
  signingKeyId?: string | undefined;
  signatureAlgorithm?: string | undefined;
  digitalSignature?: string | undefined;
  generatedAt?: string | undefined;
}

export interface ParsedArtifact {
  bodyText: string;
  bodyBytes: Buffer;
  manifestText: string;
  manifest: ArtifactManifest;
}

export interface ArtifactSigningOptions {
  privateKey?: string | KeyLike | undefined;
  keyId?: string | undefined;
  generatedAt?: string | undefined;
  issuerAuthDomain?: string | undefined;
}

export interface ArtifactBuildResult {
  fullText: string;
  bodyText: string;
  bodyBytes: Buffer;
  manifestHash: string;
  signatureStatus: "SIGNED" | "UNSIGNED";
  digitalSignature: string;
  keyId: string;
  generatedAt: string;
}

export interface ArtifactVerificationResult {
  validDigest: boolean;
  computedHash: string;
  expectedHash: string;
  signatureStatus: "SIGNED" | "UNSIGNED" | "MALFORMED";
  validSignature: boolean;
  reason?: string | undefined;
}

/**
 * Computes true SHA-256 digest of artifact body bytes.
 */
export function computeArtifactDigest(bodyText: string): {
  bodyBytes: Buffer;
  manifestHash: string;
} {
  const normalized = bodyText.replace(/\r\n/g, "\n").trimEnd();
  const bodyBytes = Buffer.from(normalized, "utf-8");
  const manifestHash = createHash("sha256").update(bodyBytes).digest("hex");
  return { bodyBytes, manifestHash };
}

/**
 * Builds signed or unsigned artifact with manifest block.
 * When private key is not provided or not configured, it honestly outputs UNSIGNED.
 * Never hardcodes private keys or emits fake _VALID strings.
 */
export function buildSignedArtifactText(
  bodyText: string,
  options?: ArtifactSigningOptions,
): ArtifactBuildResult {
  const normalizedBody = bodyText.replace(/\r\n/g, "\n").trimEnd();
  const { bodyBytes, manifestHash } = computeArtifactDigest(normalizedBody);

  const privateKey =
    options?.privateKey ||
    process.env.BANK_ARTIFACT_SIGNING_PRIVATE_KEY ||
    process.env.BANK_SIGNING_PRIVATE_KEY ||
    process.env.JWT_PRIVATE_KEY;

  const keyId =
    options?.keyId ||
    process.env.BANK_ARTIFACT_SIGNING_KEY_ID ||
    process.env.BANK_SIGNING_KEY_ID ||
    process.env.JWT_KID_CURRENT ||
    (privateKey ? "bank-settlement-rsa-2026" : "NONE");

  const generatedAt = options?.generatedAt || new Date().toISOString();
  const issuerAuthDomain =
    options?.issuerAuthDomain || "drts.settlement.issuer";

  let signatureStatus: "SIGNED" | "UNSIGNED" = "UNSIGNED";
  let signatureAlgorithm = "NONE";
  let digitalSignature = "UNSIGNED";

  if (privateKey) {
    try {
      const signer = createSign("SHA256");
      signer.update(bodyBytes);
      signer.end();
      digitalSignature = signer.sign(privateKey, "base64");
      signatureStatus = "SIGNED";
      signatureAlgorithm = "RSA-SHA256";
    } catch {
      signatureStatus = "UNSIGNED";
      signatureAlgorithm = "NONE";
      digitalSignature = "UNSIGNED";
    }
  }

  const manifestLines = [
    ARTIFACT_MANIFEST_DIVIDER,
    ARTIFACT_MANIFEST_TITLE,
    ARTIFACT_MANIFEST_DIVIDER,
    `Issuer Auth Domain : ${issuerAuthDomain}`,
    `Digest Algorithm   : SHA-256`,
    `Manifest Hash      : sha256:${manifestHash}`,
    `Signature Status   : ${signatureStatus}`,
    `Signing Key ID     : ${keyId}`,
    `Signature Algorithm: ${signatureAlgorithm}`,
    `Digital Signature  : ${digitalSignature}`,
    `Generated At       : ${generatedAt}`,
    ARTIFACT_FOOTER_DIVIDER,
  ];

  const fullText = `${normalizedBody}\n${manifestLines.join("\n")}\n`;

  return {
    fullText,
    bodyText: normalizedBody,
    bodyBytes,
    manifestHash,
    signatureStatus,
    digitalSignature,
    keyId,
    generatedAt,
  };
}

/**
 * Parses raw artifact text into canonical body and manifest section.
 */
export function parseArtifact(rawContent: string): ParsedArtifact | null {
  const normalized = rawContent.replace(/\r\n/g, "\n");
  const headerIdx = normalized.indexOf(ARTIFACT_MANIFEST_SECTION_HEADER);
  if (headerIdx === -1) {
    return null;
  }

  const bodyText = normalized.slice(0, headerIdx).trimEnd();
  const bodyBytes = Buffer.from(bodyText, "utf-8");
  const manifestSection = normalized.slice(
    headerIdx + ARTIFACT_MANIFEST_SECTION_HEADER.length,
  );

  const manifest: ArtifactManifest = {};
  const lines = manifestSection.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === ARTIFACT_FOOTER_DIVIDER || !trimmed) {
      continue;
    }
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;
    const key = trimmed.slice(0, colonIdx).trim().toLowerCase();
    const val = trimmed.slice(colonIdx + 1).trim();

    switch (key) {
      case "issuer auth domain":
        manifest.issuerAuthDomain = val;
        break;
      case "digest algorithm":
        manifest.digestAlgorithm = val;
        break;
      case "manifest hash":
        manifest.manifestHash = val;
        break;
      case "signature status":
        if (val === "SIGNED" || val === "UNSIGNED") {
          manifest.signatureStatus = val;
        }
        break;
      case "signing key id":
        manifest.signingKeyId = val;
        break;
      case "signature algorithm":
        manifest.signatureAlgorithm = val;
        break;
      case "digital signature":
        manifest.digitalSignature = val;
        break;
      case "generated at":
        manifest.generatedAt = val;
        break;
    }
  }

  return {
    bodyText,
    bodyBytes,
    manifestText: manifestSection,
    manifest,
  };
}

/**
 * Verifies digest and signature of artifact.
 * Fails if hash does not match or if signature does not verify with publicKey.
 */
export function verifyArtifact(
  rawContent: string,
  publicKey?: string | KeyLike,
): ArtifactVerificationResult {
  const parsed = parseArtifact(rawContent);
  if (!parsed) {
    return {
      validDigest: false,
      computedHash: "",
      expectedHash: "",
      signatureStatus: "MALFORMED",
      validSignature: false,
      reason: "Missing or invalid manifest section header",
    };
  }

  const { manifestHash } = computeArtifactDigest(parsed.bodyText);
  const expectedHash = (parsed.manifest.manifestHash || "")
    .replace(/^sha256:/i, "")
    .toLowerCase()
    .trim();

  const validDigest = manifestHash.toLowerCase() === expectedHash;
  if (!validDigest) {
    return {
      validDigest: false,
      computedHash: manifestHash,
      expectedHash,
      signatureStatus: parsed.manifest.signatureStatus || "MALFORMED",
      validSignature: false,
      reason: `Digest mismatch: expected ${expectedHash}, computed ${manifestHash}`,
    };
  }

  const status = parsed.manifest.signatureStatus;
  if (status === "UNSIGNED") {
    return {
      validDigest: true,
      computedHash: manifestHash,
      expectedHash,
      signatureStatus: "UNSIGNED",
      validSignature: false,
      reason: "Artifact is honestly marked as UNSIGNED (no key configured)",
    };
  }

  if (status === "SIGNED") {
    if (!publicKey) {
      return {
        validDigest: true,
        computedHash: manifestHash,
        expectedHash,
        signatureStatus: "SIGNED",
        validSignature: false,
        reason: "Public key required to verify signed artifact",
      };
    }

    const sig = parsed.manifest.digitalSignature;
    if (!sig || sig === "UNSIGNED") {
      return {
        validDigest: true,
        computedHash: manifestHash,
        expectedHash,
        signatureStatus: "MALFORMED",
        validSignature: false,
        reason: "Artifact claims SIGNED status but digital signature is missing or marked UNSIGNED",
      };
    }

    try {
      const verifier = createVerify("SHA256");
      verifier.update(parsed.bodyBytes);
      verifier.end();
      const validSignature = verifier.verify(publicKey, sig, "base64");
      return {
        validDigest: true,
        computedHash: manifestHash,
        expectedHash,
        signatureStatus: "SIGNED",
        validSignature,
        reason: validSignature
          ? undefined
          : "Cryptographic signature verification failed",
      };
    } catch (err) {
      return {
        validDigest: true,
        computedHash: manifestHash,
        expectedHash,
        signatureStatus: "SIGNED",
        validSignature: false,
        reason: `Cryptographic error during verification: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  return {
    validDigest: true,
    computedHash: manifestHash,
    expectedHash,
    signatureStatus: "MALFORMED",
    validSignature: false,
    reason: `Unknown signature status: ${status}`,
  };
}

/**
 * Extracts raw crypto material for external tooling (such as openssl and sha256sum).
 */
export function extractArtifactCryptoMaterial(rawContent: string): {
  bodyBytes: Buffer;
  manifestHash: string;
  signatureBuffer: Buffer | null;
  signatureStatus: string;
  keyId: string;
} | null {
  const parsed = parseArtifact(rawContent);
  if (!parsed) return null;
  const sig = parsed.manifest.digitalSignature;
  let signatureBuffer: Buffer | null = null;
  if (
    parsed.manifest.signatureStatus === "SIGNED" &&
    sig &&
    sig !== "UNSIGNED"
  ) {
    try {
      signatureBuffer = Buffer.from(sig, "base64");
    } catch {
      signatureBuffer = null;
    }
  }
  return {
    bodyBytes: parsed.bodyBytes,
    manifestHash: (parsed.manifest.manifestHash || "").replace(/^sha256:/i, ""),
    signatureBuffer,
    signatureStatus: parsed.manifest.signatureStatus || "UNKNOWN",
    keyId: parsed.manifest.signingKeyId || "NONE",
  };
}
