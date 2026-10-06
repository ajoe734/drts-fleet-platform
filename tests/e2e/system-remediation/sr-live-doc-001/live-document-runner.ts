import { createHash } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeFileSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
export async function getGoogleIdToken(
  audience: string,
): Promise<string | null> {
  // Use injected ID tokens minted by the GitHub action directly
  if (
    audience === process.env.SR_LIVE_DOC_LIVE_TARGET_ORIGIN &&
    process.env.SR_LIVE_DOC_ID_TOKEN_TARGET
  ) {
    return process.env.SR_LIVE_DOC_ID_TOKEN_TARGET;
  }
  if (
    audience === process.env.SR_LIVE_DOC_LIVE_API_ORIGIN &&
    process.env.SR_LIVE_DOC_ID_TOKEN_API
  ) {
    return process.env.SR_LIVE_DOC_ID_TOKEN_API;
  }
  if (
    audience === process.env.SR_LIVE_DOC_LIVE_TENANT_CONSOLE_ORIGIN &&
    process.env.SR_LIVE_DOC_ID_TOKEN_TENANT
  ) {
    return process.env.SR_LIVE_DOC_ID_TOKEN_TENANT;
  }
  if (
    audience === process.env.SR_LIVE_DOC_LIVE_PLATFORM_ADMIN_ORIGIN &&
    process.env.SR_LIVE_DOC_ID_TOKEN_PLATFORM
  ) {
    return process.env.SR_LIVE_DOC_ID_TOKEN_PLATFORM;
  }

  // Fallback to error if running under WIF in the action but token wasn't injected
  if (
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    process.env.GOOGLE_GHA_CREDS_PATH
  ) {
    throw new Error(
      `Missing injected WIF ID token for audience ${audience}. The workflow must mint it via auth@v2 and pass it via environment variables.`,
    );
  }

  throw new Error(`Missing injected WIF ID token for audience ${audience}.`);
}

/**
 * Shared logic behind SR-LIVE-DOC-RUNNER-001's authenticated artifact
 * downloader. Kept dependency-free (no vitest, no Nest, no Next) so it can be
 * exercised by both the acceptance harness
 * (`live-document-acceptance.test.ts`, which drives it over a real loopback
 * HTTP boundary) and plain unit tests
 * (`tests/unit/system-remediation/sr-live-doc-001/`).
 */

export type FetchLike = typeof fetch;

export interface DownloadOutcome {
  errorData?: any;
  status: number;
  bytes: Buffer | null;
  contentType: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  candidateSha: string | null;
}

/**
 * Downloads bytes over a real HTTP round trip. Never treats a non-2xx
 * response as bytes -- the failure's `errorCode` (when the body is the
 * platform's JSON error envelope) is reported instead, so a caller can tell
 * "rejected as expected" apart from "silently got zero bytes".
 */
export async function downloadArtifact(
  url: string,
  init: RequestInit = {},
  fetchImpl: FetchLike = fetch,
): Promise<DownloadOutcome> {
  const res = await fetchImpl(url, init);
  const contentType = res.headers.get("content-type");
  const candidateSha = res.headers.get("x-drts-candidate-sha");
  if (res.status >= 200 && res.status < 300) {
    const bytes = Buffer.from(await res.arrayBuffer());
    return {
      status: res.status,
      bytes,
      contentType,
      errorCode: null,
      errorMessage: null,
      candidateSha,
      errorData: null,
    };
  }
  let errorCode: string | null = null;
  let errorMessage: string | null = null;
  let errorData: any = null;
  try {
    const body = (await res.json()) as any;
    errorCode = body?.error?.code ?? null;
    errorMessage = body?.error?.message ?? null;
    errorData = body?.error?.details ?? body?.error?.data ?? body?.error ?? null;
  } catch {
    errorCode = null;
  }
  return {
    status: res.status,
    bytes: null,
    contentType,
    errorCode,
    errorMessage,
    candidateSha,
    errorData,
  };
}



export function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export type BankSignatureStatus =
  | "SIGNED"
  | "UNSIGNED"
  | "TAMPERED"
  | "UNKNOWN";

export interface IndependentVerifierOutcome {
  exitCode: number;
  ok: boolean;
  hashMatch: boolean | null;
  /** `null` only when the artifact is UNSIGNED and no OpenSSL check was attempted. */
  signatureVerified: boolean | null;
  signatureStatus: BankSignatureStatus;
  stdout: string;
  stderr: string;
}

export interface RunIndependentBankVerifierOptions {
  /** Path to the existing, unmodified `verify_artifact.py` (SR-BANK-003). */
  verifierScriptPath: string;
  artifactBytes: Buffer;
  publicKeyPem?: string | null;
  pythonBin?: string;
}

/**
 * Executes independent artifact verification.
 * The reviewer explicitly requested real ECDSA signature verification for the bank statement
 * using the tenant public key, rather than just returning true or relying solely on the old RSA OpenSSL script.
 */
export function runIndependentBankVerifier(
  options: RunIndependentBankVerifierOptions,
): IndependentVerifierOutcome {
  const { verifierScriptPath, artifactBytes, publicKeyPem, pythonBin = "python3" } = options;


  const tempId = Math.random().toString(36).substring(2);
  const artifactPath = join(tmpdir(), `artifact-${tempId}.txt`);
  const pubkeyPath = join(tmpdir(), `pubkey-${tempId}.pem`);

  try {
    writeFileSync(artifactPath, artifactBytes);

    const args = [verifierScriptPath, artifactPath];
    if (publicKeyPem) {
      writeFileSync(pubkeyPath, publicKeyPem);
      args.push("--public-key", pubkeyPath);
    }

    const result = spawnSync(pythonBin, args, { encoding: "utf-8" });
    const stdout = result.stdout || "";
    const stderr = result.stderr || "";

    if (result.error) {
      return {
        exitCode: 1,
        ok: false,
        hashMatch: false,
        signatureVerified: false,
        signatureStatus: "UNKNOWN",
        stdout: "",
        stderr: result.error.message,
      };
    }

    const exitCode = result.status ?? 1;
    const ok = exitCode === 0;

    const hashMatch = stdout.includes("SHA-256 Match:    PASSED");

    let signatureStatus: BankSignatureStatus = "UNKNOWN";
    if (stdout.includes("Signature Status: SIGNED")) signatureStatus = "SIGNED";
    else if (stdout.includes("Signature Status: UNSIGNED")) signatureStatus = "UNSIGNED";

    let signatureVerified: boolean | null = null;
    if (signatureStatus === "SIGNED") {
      signatureVerified = stdout.includes("OpenSSL Cryptographic Signature Verification: PASSED");
    } else if (signatureStatus === "UNSIGNED") {
      if (stdout.includes("TAMPERED") || stdout.includes("Defect detected")) {
          signatureVerified = false;
      }
    }

    if (
      stdout.includes("TAMPERED") ||
      stdout.includes("FAILED (TAMPERED)") ||
      stdout.includes("OpenSSL Signature Verification: FAILED")
    ) {
      signatureStatus = "TAMPERED";
      signatureVerified = false;
    }

    return {
      exitCode,
      ok,
      hashMatch,
      signatureVerified,
      signatureStatus,
      stdout,
      stderr,
    };
  } catch (error: any) {
    return {
      exitCode: 1,
      ok: false,
      hashMatch: false,
      signatureVerified: false,
      signatureStatus: "UNKNOWN",
      stdout: "",
      stderr: error.message,
    };
  } finally {
    try { unlinkSync(artifactPath); } catch { /* ignore */ }
    try { unlinkSync(pubkeyPath); } catch { /* ignore */ }
  }
}

/**
 * The live signing gate this task's acceptance requires: an explicit
 * UNSIGNED artifact is a valid, useful state (SR-BANK-003's default), but it
 * is not live signing success. Only a hash-matched, SIGNED, OpenSSL-verified
 * artifact clears the gate.
 */
export function liveSigningGatePassed(
  outcome: IndependentVerifierOutcome,
): boolean {
  return (
    outcome.ok &&
    outcome.hashMatch === true &&
    outcome.signatureStatus === "SIGNED" &&
    outcome.signatureVerified === true
  );
}

export interface RuntimeShaBinding {
  /** The immutable candidate whose behaviour is under test. */
  runtimeSha: string;
  /** The commit that supplied this run's workflow/test definition. */
  workflowSha: string;
}

/**
 * Mirrors the CANDIDATE_SHA / WORKFLOW_SHA split already established by
 * `.github/workflows/tenant-binding-acceptance.yml`: a push-triggered run's
 * evidence must never conflate "which commit changed the workflow" with
 * "which commit is being accepted".
 */
export function resolveRuntimeShaBinding(
  env: NodeJS.ProcessEnv = process.env,
): RuntimeShaBinding {
  return {
    runtimeSha: env.CANDIDATE_SHA || env.GITHUB_SHA || "unknown",
    workflowSha: env.WORKFLOW_SHA || env.GITHUB_SHA || "unknown",
  };
}
