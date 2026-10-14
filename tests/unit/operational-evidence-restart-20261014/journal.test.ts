import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createOperationalEvidenceJournal } from "../../e2e/operational-evidence-journal";

let directory: string;
let manifest: string;
const sha = "620bc67bf394d45281393391d7c7f14bf933794e";
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "operational-journal-"));
  manifest = join(directory, "invocation.json");
  writeFileSync(manifest, JSON.stringify({ candidateSha: sha }));
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));
function journal(candidateSha = sha, manifestPath = manifest) {
  return createOperationalEvidenceJournal(
    join(directory, "evidence"),
    candidateSha,
    manifestPath,
  );
}

it("persists each event immediately, even without a worker afterAll flush", () => {
  const first = journal();
  first.record({ kind: "setup", status: 201, journey: "failed-fleet-journey" });
  expect(existsSync(first.journalPath)).toBe(true);
  expect(JSON.parse(readFileSync(first.journalPath, "utf8")).status).toBe(201);
  const restarted = journal();
  expect(restarted.flush()).toHaveLength(1);
  expect(restarted.flush()).toHaveLength(1);
});

it("two independent writer instances retain all events in append order", () => {
  const first = journal();
  const second = journal();
  first.record({ kind: "setup", sequence: 1 });
  second.record({ kind: "route", sequence: 2 });
  first.record({ kind: "download", sequence: 3 });
  expect(second.flush().map((entry) => entry.sequence)).toEqual([1, 2, 3]);
  expect(first.flush().map((entry) => entry.sequence)).toEqual([1, 2, 3]);
});

it("retains evidence written by a separate exited Node process", () => {
  const moduleUrl = pathToFileURL(
    resolve("tests/e2e/operational-evidence-journal.ts"),
  ).href;
  const child = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--input-type=module",
      "-e",
      `const { createOperationalEvidenceJournal } = await import(${JSON.stringify(moduleUrl)});
       createOperationalEvidenceJournal(${JSON.stringify(join(directory, "evidence"))},
         ${JSON.stringify(sha)}, ${JSON.stringify(manifest)}).record({ kind: "before-process-exit" });`,
    ],
    { encoding: "utf8", timeout: 10_000 },
  );
  expect(child.error).toBeUndefined();
  expect(child.status, child.stderr).toBe(0);
  const restarted = journal();
  restarted.record({ kind: "after-process-exit" });
  expect(restarted.flush().map((entry) => entry.kind)).toEqual([
    "before-process-exit",
    "after-process-exit",
  ]);
});

it("isolates a different SHA in the same evidence directory", () => {
  const old = journal();
  old.record({ kind: "old-candidate" });
  const current = journal("a".repeat(40));
  current.record({ kind: "current-candidate" });
  expect(current.journalPath).not.toBe(old.journalPath);
  expect(current.flush().map((entry) => entry.kind)).toEqual([
    "current-candidate",
  ]);
});

it("isolates two materialized invocations with the same SHA and manifest content", () => {
  const nextManifest = join(directory, "next-invocation.json");
  writeFileSync(nextManifest, readFileSync(manifest));
  const old = journal();
  old.record({ kind: "old-run" });
  const next = journal(sha, nextManifest);
  next.record({ kind: "new-run" });
  expect(next.flush().map((entry) => entry.kind)).toEqual(["new-run"]);
  expect(old.flush().map((entry) => entry.kind)).toEqual(["old-run"]);
});

it("isolates changed manifest bytes even if a caller reuses the path", () => {
  const old = journal();
  old.record({ kind: "before-manifest-change" });
  writeFileSync(
    manifest,
    JSON.stringify({ candidateSha: sha, different: true }),
  );
  const next = journal();
  next.record({ kind: "after-manifest-change" });
  expect(next.flush().map((entry) => entry.kind)).toEqual([
    "after-manifest-change",
  ]);
});

it("the event cannot override candidate, journal identity or recording time", () => {
  const sink = journal();
  sink.record({
    kind: "setup",
    candidateSha: "forged",
    journalId: "forged",
    recordedAt: "forged",
  });
  const result = sink.flush();
  expect(result[0]?.candidateSha).toBe(sha);
  expect(result[0]?.journalId).not.toBe("forged");
  expect(result[0]?.recordedAt).not.toBe("forged");
});

it("keeps the existing public aggregate format and does not infer acceptance", () => {
  const sink = journal();
  sink.record({ kind: "setup", journey: "incomplete", status: 201 });
  sink.flush();
  const result = JSON.parse(
    readFileSync(
      join(directory, "evidence/operational-browser-evidence.json"),
      "utf8",
    ),
  );
  expect(Object.keys(result)).toEqual(["candidateSha", "manifest", "evidence"]);
  expect(result.candidateSha).toBe(sha);
  expect(result.manifest).toBe("invocation.json");
  expect(result.evidence).toHaveLength(1);
  expect(result).not.toHaveProperty("passed");
  expect(result.evidence[0]).not.toHaveProperty("passed");
});

it("an empty worker flush neither deletes prior records nor manufactures success", () => {
  const sink = journal();
  expect(sink.flush()).toEqual([]);
  sink.record({ kind: "before-restart" });
  expect(
    journal()
      .flush()
      .map((entry) => entry.kind),
  ).toEqual(["before-restart"]);
});

it("rejects an incomplete journal line rather than silently dropping evidence", () => {
  const sink = journal();
  sink.record({ kind: "setup" });
  appendFileSync(sink.journalPath, '{"kind":"interrupted"');
  expect(() => sink.flush()).toThrow("incomplete record");
});

it("rejects malformed JSON and a foreign candidate/journal identity", () => {
  const sink = journal();
  sink.record({ kind: "setup" });
  const valid = readFileSync(sink.journalPath, "utf8");
  appendFileSync(sink.journalPath, "invalid\n");
  expect(() => sink.flush()).toThrow();
  writeFileSync(
    sink.journalPath,
    valid +
      JSON.stringify({ candidateSha: "foreign", journalId: "foreign" }) +
      "\n",
  );
  expect(() => sink.flush()).toThrow("identity mismatch");
});
