import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";

/**
 * The operational wrapper gives all workers the same unique materialized
 * manifest path. A failed Playwright worker is discarded, so module memory
 * cannot be the authority for evidence collected before that failure.
 *
 * Persist events synchronously, before returning to the test. Keep the existing
 * aggregate JSON format for consumers; the journal also survives an interrupted
 * worker that never reaches afterAll. Neither file asserts journey success.
 * The operational config remains single-worker; independent restarted instances
 * use the same append-only journal instead of replacing each other's arrays.
 */
export function createOperationalEvidenceJournal(
  evidenceDir: string,
  candidateSha: string | undefined,
  manifestPath: string,
) {
  const journalId = createHash("sha256")
    .update(JSON.stringify([candidateSha, resolve(manifestPath)]))
    .update(readFileSync(manifestPath))
    .digest("hex");
  const journalPath = join(
    evidenceDir,
    `operational-browser-${journalId}.jsonl`,
  );

  function record(entry: Record<string, unknown>) {
    mkdirSync(evidenceDir, { recursive: true });
    appendFileSync(
      journalPath,
      `${JSON.stringify({
        ...entry,
        candidateSha,
        journalId,
        recordedAt: new Date().toISOString(),
      })}\n`,
      { mode: 0o600 },
    );
  }

  function flush() {
    const evidence: Array<Record<string, unknown>> = [];
    if (existsSync(journalPath)) {
      const content = readFileSync(journalPath, "utf8");
      if (content && !content.endsWith("\n")) {
        throw new Error(
          "Operational evidence journal has an incomplete record",
        );
      }
      for (const line of content.split("\n").filter(Boolean)) {
        const entry: unknown = JSON.parse(line);
        if (
          !entry ||
          typeof entry !== "object" ||
          Array.isArray(entry) ||
          (entry as Record<string, unknown>).candidateSha !== candidateSha ||
          (entry as Record<string, unknown>).journalId !== journalId
        ) {
          throw new Error("Operational evidence journal identity mismatch");
        }
        evidence.push(entry as Record<string, unknown>);
      }
    }
    mkdirSync(evidenceDir, { recursive: true });
    writeFileSync(
      join(evidenceDir, "operational-browser-evidence.json"),
      `${JSON.stringify(
        { candidateSha, manifest: basename(manifestPath), evidence },
        null,
        2,
      )}\n`,
      { mode: 0o600 },
    );
    return evidence;
  }

  return { record, flush, journalPath };
}
