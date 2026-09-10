#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { verifyArtifact } from "./artifact-crypto";

function printUsageAndExit() {
  console.error("Usage: verify-artifact <path-to-artifact.txt> [--public-key <path-to-public-key.pem>] [--auth-domain <domain>]");
  process.exit(2);
}

export function runCli(args: string[] = process.argv.slice(2)): number {
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printUsageAndExit();
  }

  let artifactPath: string | null = null;
  let publicKeyPath: string | null = null;
  let expectedAuthDomain: string | undefined = undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;
    if (arg === "--public-key" && i + 1 < args.length) {
      publicKeyPath = args[++i] ?? null;
    } else if (arg === "--auth-domain" && i + 1 < args.length) {
      expectedAuthDomain = args[++i];
    } else if (!arg.startsWith("-") && !artifactPath) {
      artifactPath = arg;
    }
  }

  if (!artifactPath) {
    printUsageAndExit();
  }

  const fullArtifactPath = resolve(process.cwd(), artifactPath!);
  const artifactContent = readFileSync(fullArtifactPath, "utf-8");

  let publicKeyPem: string | null = null;
  if (publicKeyPath) {
    publicKeyPem = readFileSync(resolve(process.cwd(), publicKeyPath), "utf-8");
  }

  const result = verifyArtifact(artifactContent, {
    publicKeyPem,
    expectedAuthDomain,
  });

  console.log("================================================================================");
  console.log("DRTS BANK ARTIFACT INDEPENDENT VERIFIER");
  console.log("================================================================================");
  console.log(`Artifact File      : ${artifactPath}`);
  console.log(`Overall Status     : ${result.status}`);
  console.log(`Hash Verification  : ${result.hashMatch ? "PASSED (SHA-256 matches actual payload bytes)" : "FAILED (Hash mismatch)"}`);
  console.log(`  Expected Hash    : ${result.manifestHashExpected}`);
  console.log(`  Calculated Hash  : ${result.manifestHashCalculated}`);
  console.log(`Signature Status   : ${result.status}`);
  console.log(`Algorithm          : ${result.algorithm}`);
  console.log(`Key ID             : ${result.keyId}`);
  if (result.signatureVerified !== null) {
    console.log(`Signature Verified : ${result.signatureVerified ? "PASSED (RSA public key verified)" : "FAILED (Invalid signature)"}`);
  } else {
    console.log(`Signature Verified : NOT_APPLICABLE (${result.status})`);
  }

  if (result.errors.length > 0) {
    console.log("--------------------------------------------------------------------------------");
    console.log("Verification Errors:");
    for (const err of result.errors) {
      console.log(`  [!] ${err}`);
    }
    console.log("================================================================================");
    return 1;
  }

  console.log("================================================================================");
  console.log("Verification result: OK");
  return 0;
}

// If invoked directly from CLI
if (
  process.argv[1] &&
  (process.argv[1].endsWith("verify-artifact.ts") || process.argv[1].endsWith("verify-artifact.js"))
) {
  try {
    const exitCode = runCli();
    process.exit(exitCode);
  } catch (err) {
    console.error(`Fatal error: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}
