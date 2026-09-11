import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

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
  status: number;
  bytes: Buffer | null;
  contentType: string | null;
  errorCode: string | null;
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
  if (res.status >= 200 && res.status < 300) {
    const bytes = Buffer.from(await res.arrayBuffer());
    return { status: res.status, bytes, contentType, errorCode: null };
  }
  let errorCode: string | null = null;
  try {
    const body = (await res.json()) as { error?: { code?: string } };
    errorCode = body?.error?.code ?? null;
  } catch {
    errorCode = null;
  }
  return { status: res.status, bytes: null, contentType, errorCode };
}

export function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export type BankSignatureStatus = "SIGNED" | "UNSIGNED" | "TAMPERED" | "UNKNOWN";

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
 * Shells out to the existing independent Python/OpenSSL verifier
 * (`tests/unit/system-remediation/sr-bank-003/verify_artifact.py`) as a
 * genuinely separate process -- this runner never re-implements or imports
 * its parsing/crypto logic, so a defect in this task's own code cannot also
 * hide from the verification it is supposed to be independent of.
 */
export function runIndependentBankVerifier(
  options: RunIndependentBankVerifierOptions,
): IndependentVerifierOutcome {
  const dir = mkdtempSync(join(tmpdir(), "sr-live-doc-001-"));
  try {
    const artifactPath = join(dir, "artifact.txt");
    writeFileSync(artifactPath, options.artifactBytes);
    const args = [options.verifierScriptPath, artifactPath];
    if (options.publicKeyPem) {
      const pubKeyPath = join(dir, "public-key.pem");
      writeFileSync(pubKeyPath, options.publicKeyPem);
      args.push("--public-key", pubKeyPath);
    }

    const result = spawnSync(options.pythonBin ?? "python3", args, {
      encoding: "utf-8",
    });
    const stdout = result.stdout ?? "";
    const stderr = result.stderr ?? "";

    const hashMatchToken = stdout.match(/SHA-256 Match:\s+(PASSED|FAILED)/);
    const hashMatch = hashMatchToken ? hashMatchToken[1] === "PASSED" : null;

    // The two verifier messages differ in wording on purpose (see
    // verify_artifact.py): the pass line says "Cryptographic Signature
    // Verification", the fail line says only "Signature Verification". Both
    // must be matched independently rather than as prefixes of one another.
    let signatureVerified: boolean | null = null;
    if (/OpenSSL Cryptographic Signature Verification: PASSED/.test(stdout)) {
      signatureVerified = true;
    } else if (/OpenSSL Signature Verification: FAILED/.test(stdout)) {
      signatureVerified = false;
    }

    const declaredStatusToken = stdout.match(/Signature Status:\s+(\w+)/);
    const declaredStatus = declaredStatusToken?.[1];

    let signatureStatus: BankSignatureStatus = "UNKNOWN";
    if (hashMatch === false) {
      signatureStatus = "TAMPERED";
    } else if (signatureVerified === false) {
      signatureStatus = "TAMPERED";
    } else if (declaredStatus === "SIGNED" || declaredStatus === "UNSIGNED") {
      signatureStatus = declaredStatus;
    }

    return {
      exitCode: result.status ?? 1,
      ok: result.status === 0,
      hashMatch,
      signatureVerified,
      signatureStatus,
      stdout,
      stderr,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * The live signing gate this task's acceptance requires: an explicit
 * UNSIGNED artifact is a valid, useful state (SR-BANK-003's default), but it
 * is not live signing success. Only a hash-matched, SIGNED, OpenSSL-verified
 * artifact clears the gate.
 */
export function liveSigningGatePassed(outcome: IndependentVerifierOutcome): boolean {
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
