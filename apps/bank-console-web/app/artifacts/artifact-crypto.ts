import {
  createHash,
  sign,
  verify,
  constants,
} from "node:crypto";

export const ARTIFACT_MANIFEST_HEADER =
  "--------------------------------------------------------------------------------\n" +
  "DIGITAL SIGNATURE & AUDIT MANIFEST\n" +
  "--------------------------------------------------------------------------------";

export const DEFAULT_AUTH_DOMAIN = "drts.settlement.issuer";
export const SIGNATURE_ALGORITHM = "RSASSA-PKCS1-v1_5-SHA256";
export const UNSIGNED_MARKER = "(UNSIGNED - NO SIGNING KEY CONFIGURED)";

export type ArtifactManifest = {
  authDomain: string;
  signatureStatus: "SIGNED" | "UNSIGNED";
  signatureAlgorithm: string;
  keyId: string;
  manifestHash: string;
  digitalSignature: string;
  generatedAt: string;
};

export type ArtifactVerificationResult = {
  ok: boolean;
  status: "SIGNED" | "UNSIGNED" | "TAMPERED" | "CORRUPTED";
  errors: string[];
  manifestHashExpected: string;
  manifestHashCalculated: string;
  hashMatch: boolean;
  signatureVerified: boolean | null;
  keyId: string;
  algorithm: string;
  authDomain: string;
  generatedAt: string;
};

export type SigningConfig = {
  privateKeyPem: string | null;
  publicKeyPem: string | null;
  keyId: string;
};

/**
 * Normalizes PEM string by replacing escaped newlines ("\n") with real newlines.
 */
export function normalizePem(pem: string): string {
  if (!pem) return "";
  let trimmed = pem.trim();
  if (trimmed.includes("\\n")) {
    trimmed = trimmed.replace(/\\n/g, "\n");
  }
  return trimmed;
}

/**
 * Resolves signing keys and identifiers from environment variables.
 * Under no circumstances does this synthesize or hardcode a fake private key.
 * If no private key is configured, privateKeyPem is null.
 */
export function getSigningConfig(): SigningConfig {
  const rawPrivateKey =
    process.env.BANK_ARTIFACT_SIGNING_PRIVATE_KEY ||
    process.env.BANK_SIGNING_PRIVATE_KEY ||
    "";
  const rawPublicKey =
    process.env.BANK_ARTIFACT_SIGNING_PUBLIC_KEY ||
    process.env.BANK_SIGNING_PUBLIC_KEY ||
    "";
  const keyId =
    process.env.BANK_ARTIFACT_SIGNING_KEY_ID ||
    process.env.BANK_SIGNING_KEY_ID ||
    (rawPrivateKey ? "bank-signer-2026-v1" : "NONE");

  return {
    privateKeyPem: rawPrivateKey ? normalizePem(rawPrivateKey) : null,
    publicKeyPem: rawPublicKey ? normalizePem(rawPublicKey) : null,
    keyId: rawPrivateKey ? keyId : "NONE",
  };
}

/**
 * Computes the real SHA-256 cryptographic digest over the actual bytes of the payload.
 * Returns both the 64-character lowercase hexadecimal hash and the "sha256:<hex>" formatted string.
 */
export function computePayloadDigest(payload: string | Buffer): {
  algorithm: "sha256";
  hex: string;
  formatted: string;
} {
  const buf = typeof payload === "string" ? Buffer.from(payload, "utf-8") : payload;
  const hex = createHash("sha256").update(buf).digest("hex");
  return {
    algorithm: "sha256",
    hex,
    formatted: `sha256:${hex}`,
  };
}

/**
 * Signs the payload using RSASSA-PKCS1-v1_5 with SHA-256.
 * If privateKeyPem is not provided, returns an explicit UNSIGNED status without fake VALID markers.
 */
export function signPayloadBytes(
  payload: string | Buffer,
  configOverride?: Partial<SigningConfig>,
): {
  status: "SIGNED" | "UNSIGNED";
  algorithm: string;
  keyId: string;
  signature: string;
} {
  const activeConfig = {
    ...getSigningConfig(),
    ...configOverride,
  };

  if (!activeConfig.privateKeyPem) {
    return {
      status: "UNSIGNED",
      algorithm: "NONE",
      keyId: "NONE",
      signature: UNSIGNED_MARKER,
    };
  }

  const buf = typeof payload === "string" ? Buffer.from(payload, "utf-8") : payload;

  try {
    const signatureBuffer = sign("sha256", buf, {
      key: activeConfig.privateKeyPem,
      padding: constants.RSA_PKCS1_PADDING,
    });

    return {
      status: "SIGNED",
      algorithm: SIGNATURE_ALGORITHM,
      keyId: activeConfig.keyId || "bank-signer-2026-v1",
      signature: signatureBuffer.toString("base64"),
    };
  } catch (error) {
    // If the configured key fails to sign, never pretend it is valid.
    const message = error instanceof Error ? error.message : "Signing failed";
    return {
      status: "UNSIGNED",
      algorithm: "NONE",
      keyId: activeConfig.keyId || "NONE",
      signature: `(SIGNING_FAILED: ${message})`,
    };
  }
}

/**
 * Assembles the full artifact string containing the payload and the standardized manifest block.
 */
export function buildArtifactText(
  payloadText: string,
  options?: {
    authDomain?: string;
    generatedAt?: string;
    signingConfig?: Partial<SigningConfig>;
  },
): string {
  const cleanPayload = payloadText.trimEnd();
  const digest = computePayloadDigest(cleanPayload);
  const sigResult = signPayloadBytes(cleanPayload, options?.signingConfig);

  const authDomain = options?.authDomain || DEFAULT_AUTH_DOMAIN;
  const generatedAt = options?.generatedAt || new Date().toISOString();

  const manifestLines = [
    ARTIFACT_MANIFEST_HEADER,
    `Issuer Auth Domain : ${authDomain}`,
    `Signature Status   : ${sigResult.status}`,
    `Signature Algorithm: ${sigResult.algorithm}`,
    `Key ID             : ${sigResult.keyId}`,
    `Manifest Hash      : ${digest.formatted}`,
    `Digital Signature  : ${sigResult.signature}`,
    `Generated At       : ${generatedAt}`,
    "================================================================================",
  ];

  return `${cleanPayload}\n\n${manifestLines.join("\n")}\n`;
}

/**
 * Parses an artifact text into its payload component and its audit manifest key-value pairs.
 */
export function parseArtifact(artifactText: string): {
  payloadText: string;
  manifest: ArtifactManifest;
} {
  const headerIndex = artifactText.indexOf(ARTIFACT_MANIFEST_HEADER);
  if (headerIndex === -1) {
    throw new Error(
      "Malformed artifact: missing DIGITAL SIGNATURE & AUDIT MANIFEST delimiter.",
    );
  }

  const payloadText = artifactText.slice(0, headerIndex).trimEnd();
  const manifestSection = artifactText.slice(
    headerIndex + ARTIFACT_MANIFEST_HEADER.length,
  );

  const fields: Record<string, string> = {};
  for (const line of manifestSection.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("=") || trimmed.startsWith("-")) continue;
    const colonIndex = trimmed.indexOf(":");
    if (colonIndex !== -1) {
      const key = trimmed.slice(0, colonIndex).trim();
      const value = trimmed.slice(colonIndex + 1).trim();
      fields[key] = value;
    }
  }

  const manifest: ArtifactManifest = {
    authDomain: fields["Issuer Auth Domain"] || "",
    signatureStatus:
      fields["Signature Status"] === "SIGNED" ? "SIGNED" : "UNSIGNED",
    signatureAlgorithm: fields["Signature Algorithm"] || "NONE",
    keyId: fields["Key ID"] || "NONE",
    manifestHash: fields["Manifest Hash"] || "",
    digitalSignature: fields["Digital Signature"] || "",
    generatedAt: fields["Generated At"] || "",
  };

  return { payloadText, manifest };
}

/**
 * Verifies an artifact's integrity and signature independently.
 * - Computes the SHA-256 digest of the actual payload bytes.
 * - Compares with Manifest Hash.
 * - If SIGNED, verifies the cryptographic signature with the provided or configured public key.
 * - If UNSIGNED, ensures no fake valid signature is claimed.
 */
export function verifyArtifact(
  artifactText: string,
  options?: {
    publicKeyPem?: string | null | undefined;
    expectedAuthDomain?: string | undefined;
  },
): ArtifactVerificationResult {
  const errors: string[] = [];
  let payloadText = "";
  let manifest: ArtifactManifest = {
    authDomain: "",
    signatureStatus: "UNSIGNED",
    signatureAlgorithm: "NONE",
    keyId: "NONE",
    manifestHash: "",
    digitalSignature: "",
    generatedAt: "",
  };

  try {
    const parsed = parseArtifact(artifactText);
    payloadText = parsed.payloadText;
    manifest = parsed.manifest;
  } catch (err) {
    return {
      ok: false,
      status: "CORRUPTED",
      errors: [err instanceof Error ? err.message : "Artifact parse failed"],
      manifestHashExpected: "",
      manifestHashCalculated: "",
      hashMatch: false,
      signatureVerified: false,
      keyId: "NONE",
      algorithm: "NONE",
      authDomain: "",
      generatedAt: "",
    };
  }

  // 1. Verify actual bytes SHA-256
  const calculatedDigest = computePayloadDigest(payloadText);
  const expectedHash = manifest.manifestHash.replace(/^sha256:/i, "");
  const hashMatch =
    calculatedDigest.hex.toLowerCase() === expectedHash.toLowerCase();

  if (!hashMatch) {
    errors.push(
      `Manifest Hash mismatch: expected ${manifest.manifestHash}, calculated ${calculatedDigest.formatted}. Document content has been tampered with or corrupted.`,
    );
  }

  // 2. Check Auth Domain if specified
  if (
    options?.expectedAuthDomain &&
    manifest.authDomain !== options.expectedAuthDomain
  ) {
    errors.push(
      `Auth domain mismatch: expected ${options.expectedAuthDomain}, got ${manifest.authDomain}`,
    );
  }

  // 3. Signature verification
  let signatureVerified: boolean | null = null;

  if (manifest.signatureStatus === "SIGNED") {
    const resolvedPublicKey =
      options?.publicKeyPem ||
      getSigningConfig().publicKeyPem;

    if (!resolvedPublicKey) {
      errors.push(
        "Artifact is marked SIGNED but no public key was supplied to verify the signature.",
      );
      signatureVerified = false;
    } else {
      try {
        const sigBuffer = Buffer.from(manifest.digitalSignature, "base64");
        const payloadBuffer = Buffer.from(payloadText, "utf-8");

        const isValid = verify(
          "sha256",
          payloadBuffer,
          {
            key: normalizePem(resolvedPublicKey),
            padding: constants.RSA_PKCS1_PADDING,
          },
          sigBuffer,
        );

        signatureVerified = isValid;
        if (!isValid) {
          errors.push(
            "Cryptographic signature verification failed: signature does not match payload with the given public key.",
          );
        }
      } catch (err) {
        signatureVerified = false;
        errors.push(
          `Signature verification error: ${err instanceof Error ? err.message : "Unknown crypto error"}`,
        );
      }
    }
  } else {
    // UNSIGNED checks
    signatureVerified = null;
    if (
      manifest.digitalSignature.includes("VALID") ||
      manifest.digitalSignature.startsWith("SIG_")
    ) {
      errors.push(
        `Improper fake signature detected in UNSIGNED artifact: "${manifest.digitalSignature}" claims validity without real cryptographic signing.`,
      );
    }
  }

  const isTampered = !hashMatch || signatureVerified === false;
  const status: "SIGNED" | "UNSIGNED" | "TAMPERED" | "CORRUPTED" = isTampered
    ? "TAMPERED"
    : manifest.signatureStatus;

  const ok = errors.length === 0;

  return {
    ok,
    status,
    errors,
    manifestHashExpected: manifest.manifestHash,
    manifestHashCalculated: calculatedDigest.formatted,
    hashMatch,
    signatureVerified,
    keyId: manifest.keyId,
    algorithm: manifest.signatureAlgorithm,
    authDomain: manifest.authDomain,
    generatedAt: manifest.generatedAt,
  };
}
