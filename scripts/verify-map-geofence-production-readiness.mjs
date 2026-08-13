#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

function assert(condition, message, failures) {
  if (condition) {
    console.log(`PASS ${message}`);
    return;
  }
  console.log(`FAIL ${message}`);
  failures.push(message);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const codeRoot = path.resolve(scriptDir, "..");
const statusRoot =
  process.env.AI_STATUS_ROOT || process.env.ORCH_STATUS_ROOT || codeRoot;
const readCodeText = (relativePath) =>
  fs.readFileSync(path.join(codeRoot, relativePath), "utf8");
const readJson = (rootDir, relativePath) =>
  JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), "utf8"));
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hasPassingRow = (document, firstCell) =>
  new RegExp(
    `^\\|\\s*${escapeRegex(firstCell)}\\s*\\|\\s*PASS(?:\\s*\\([^|]+\\))?\\s*\\|`,
    "m",
  ).test(document);
const isAncestorOfHead = (commitHash) =>
  Boolean(commitHash) &&
  spawnSync("git", ["merge-base", "--is-ancestor", commitHash, "HEAD"], {
    cwd: codeRoot,
    stdio: "ignore",
  }).status === 0;

const failures = [];
const manifestPath =
  "support/sidecars/MAP-REL-001/MAP-FLEETS-EXECUTION-MANIFEST-20260701.json";
const finalEvidencePath =
  "support/sidecars/MAP-REL-001/MAP-REL-001-FINAL-EVIDENCE.md";
const blockerReportPath =
  "support/sidecars/MAP-REL-001/MAP-READINESS-BLOCKER-REPORT.md";
const closeoutBoardPath =
  "support/sidecars/MAP-REL-001/MAP-PRODUCTION-CLOSEOUT-FLEETS-TASK-BOARD-20260708.md";

const manifest = readJson(codeRoot, manifestPath);
const finalEvidence = readCodeText(finalEvidencePath);
const blockerReport = readCodeText(blockerReportPath);
const closeoutBoard = readCodeText(closeoutBoardPath);
const status = readJson(statusRoot, "ai-status.json");
const tasks = new Map(
  (status.tasks || [])
    .filter((task) => task && task.id)
    .map((task) => [String(task.id), task]),
);

console.log("MAP production readiness verification");
console.log(`code_root=${codeRoot}`);
console.log(`status_root=${statusRoot}`);

assert(
  Array.isArray(manifest.requiredTaskIds) &&
    manifest.requiredTaskIds.length > 0,
  "manifest declares required closeout tasks",
  failures,
);
assert(
  manifest.productionIntegration?.status === "merged_to_dev",
  "manifest records merged_to_dev production integration",
  failures,
);
assert(
  manifest.productionIntegration?.strategy === "squash",
  "manifest records the repository squash integration strategy",
  failures,
);
assert(
  manifest.productionIntegration?.pullRequest === 1095,
  "manifest records production integration PR #1095",
  failures,
);
assert(
  JSON.stringify(manifest.productionIntegration?.requiredTaskIds) ===
    JSON.stringify(manifest.requiredTaskIds),
  "integration receipt covers every required closeout task",
  failures,
);
assert(
  isAncestorOfHead(manifest.productionIntegration?.devCommit),
  "recorded production integration commit is in verifier HEAD",
  failures,
);

assert(
  finalEvidence.includes("# MAP-REL-001 Final Evidence"),
  "final evidence heading exists",
  failures,
);
assert(
  finalEvidence.includes("release evidence is `PASS`"),
  "overall release evidence verdict is PASS",
  failures,
);
assert(
  !finalEvidence.includes("<PASS|FAIL") && !finalEvidence.includes("<VERDICT>"),
  "final evidence has no template verdict markers",
  failures,
);
for (const gate of [
  "Gate A - Callcenter safe to dispatch",
  "Gate B - Governance safe to publish",
  "Gate C - Ops safe to operate",
  "Gate D - Driver safe to navigate",
  "Gate E - Degraded safe",
]) {
  assert(
    hasPassingRow(finalEvidence, gate),
    `gate row passes: ${gate}`,
    failures,
  );
}

for (const item of manifest.productionEvidence || []) {
  assert(
    hasPassingRow(finalEvidence, `\`${item.id}\``),
    `production evidence row present for ${item.id}`,
    failures,
  );
}

assert(
  finalEvidence.includes(blockerReportPath) &&
    finalEvidence.includes(closeoutBoardPath),
  "final evidence links blocker report and closeout board",
  failures,
);
assert(
  blockerReport.includes("does **not** claim live production publish") &&
    finalEvidence.includes(
      "does **not** claim `dev_deployed`, live production publication",
    ),
  "closeout artifacts explicitly avoid unsupported production-ready claims",
  failures,
);
assert(
  closeoutBoard.includes("It does not claim") &&
    closeoutBoard.includes("production readiness or `dev` deployment"),
  "closeout board preserves non-claim wording",
  failures,
);

for (const taskId of manifest.requiredTaskIds || []) {
  const task = tasks.get(taskId);
  assert(task?.status === "done", `${taskId} is done`, failures);
}

const ownerTask = tasks.get("FLEETS-CLOSEOUT-008");
assert(
    ownerTask?.status === "in_progress" ||
    ownerTask?.status === "review" ||
    ownerTask?.status === "integrating" ||
    ownerTask?.status === "acceptance" ||
    ownerTask?.status === "done",
  "FLEETS-CLOSEOUT-008 status is compatible with readiness verification",
  failures,
);

if (failures.length > 0) {
  console.error(`production_readiness=FAIL count=${failures.length}`);
  process.exitCode = 1;
} else {
  console.log("production_readiness=PASS");
}
