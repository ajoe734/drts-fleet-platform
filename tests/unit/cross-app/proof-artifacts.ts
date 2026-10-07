import path from "node:path";
import { fileURLToPath } from "node:url";

// Replays must not overwrite the historical, committed acceptance artifacts.
// Anchor to this file so root and API-package test entrypoints use the same path.
export function proofArtifactPath(relativePath: string): string {
  return path.join(
    fileURLToPath(
      new URL("../../../.local/cross-app-proofs/", import.meta.url),
    ),
    relativePath,
  );
}
