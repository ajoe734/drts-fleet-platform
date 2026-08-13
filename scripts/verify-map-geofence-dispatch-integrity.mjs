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
const readStatusText = (relativePath) =>
  fs.readFileSync(path.join(statusRoot, relativePath), "utf8");
const readJson = (rootDir, relativePath) =>
  JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), "utf8"));
const exists = (relativePath) =>
  fs.existsSync(path.join(codeRoot, relativePath));
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hasPassingEvidenceRow = (document, id) =>
  new RegExp(`^\\|\\s*\`${escapeRegex(id)}\`\\s*\\|\\s*PASS\\s*\\|`, "m").test(
    document,
  );
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
const status = JSON.parse(readStatusText("ai-status.json"));
const tasks = new Map(
  (status.tasks || [])
    .filter((task) => task && task.id)
    .map((task) => [String(task.id), task]),
);

console.log("MAP dispatch integrity verification");
console.log(`code_root=${codeRoot}`);
console.log(`status_root=${statusRoot}`);

assert(exists(manifestPath), `${manifestPath} exists`, failures);
assert(exists(finalEvidencePath), `${finalEvidencePath} exists`, failures);
assert(exists(blockerReportPath), `${blockerReportPath} exists`, failures);
assert(exists(closeoutBoardPath), `${closeoutBoardPath} exists`, failures);
assert(
  manifest.finalEvidence === finalEvidencePath,
  "manifest finalEvidence path matches expected release evidence file",
  failures,
);
assert(
  manifest.blockerReport === blockerReportPath,
  "manifest blockerReport path matches expected blocker report",
  failures,
);
assert(
  manifest.closeoutBoard === closeoutBoardPath,
  "manifest closeoutBoard path matches expected closeout board",
  failures,
);
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

for (const item of manifest.productionEvidence || []) {
  assert(Boolean(item.id), `manifest row has id (${item.title})`, failures);
  assert(
    Array.isArray(item.artifactPaths) && item.artifactPaths.length > 0,
    `manifest row ${item.id} has artifact paths`,
    failures,
  );
  for (const artifactPath of item.artifactPaths || []) {
    assert(
      exists(artifactPath),
      `artifact exists for ${item.id}: ${artifactPath}`,
      failures,
    );
  }
  assert(
    hasPassingEvidenceRow(finalEvidence, item.id),
    `final evidence closes manifest row ${item.id} as PASS`,
    failures,
  );
  for (const sourceTask of item.sourceTasks || []) {
    assert(
      sourceTask === "FLEETS-CLOSEOUT-008" ||
        manifest.requiredTaskIds.includes(sourceTask),
      `manifest row ${item.id} uses a declared source task: ${sourceTask}`,
      failures,
    );
  }
}

for (const taskId of manifest.requiredTaskIds || []) {
  const task = tasks.get(taskId);
  assert(Boolean(task), `task ${taskId} exists in ai-status`, failures);
  assert(task?.status === "done", `task ${taskId} is done`, failures);
}

const ownerTask = tasks.get("FLEETS-CLOSEOUT-008");
assert(
  Boolean(ownerTask),
  "task FLEETS-CLOSEOUT-008 exists in ai-status",
  failures,
);
assert(
  ["in_progress", "review", "integrating", "acceptance", "done"].includes(
    ownerTask?.status,
  ),
  "task FLEETS-CLOSEOUT-008 is active or complete",
  failures,
);
assert(
  blockerReport.includes("duplicate-skipped"),
  "blocker report records posted or duplicate-skipped handoff note",
  failures,
);
assert(
  finalEvidence.includes(closeoutBoardPath) &&
    finalEvidence.includes(blockerReportPath),
  "final evidence links latest closeout board and blocker report",
  failures,
);

if (failures.length > 0) {
  console.error(`dispatch_integrity=FAIL count=${failures.length}`);
  process.exitCode = 1;
} else {
  console.log("dispatch_integrity=PASS");
}
