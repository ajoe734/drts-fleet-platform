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
const expectedPaths = {
  manifest: "support/sidecars/MAP-REL-001/MAP-FLEETS-EXECUTION-MANIFEST-20260701.json",
  finalEvidence: "support/sidecars/MAP-REL-001/MAP-REL-001-FINAL-EVIDENCE.md",
  blockerReport: "support/sidecars/MAP-REL-001/MAP-READINESS-BLOCKER-REPORT.md",
  closeoutBoard:
    "support/sidecars/MAP-REL-001/MAP-PRODUCTION-CLOSEOUT-FLEETS-TASK-BOARD-20260708.md",
};

const readCodeText = (relativePath) =>
  fs.readFileSync(path.join(codeRoot, relativePath), "utf8");
const readJson = (rootDir, relativePath) =>
  JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), "utf8"));
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const isAncestorOfHead = (commitHash) =>
  Boolean(commitHash) &&
  spawnSync("git", ["merge-base", "--is-ancestor", commitHash, "HEAD"], {
    cwd: codeRoot,
    stdio: "ignore",
  }).status === 0;
const hasPassingRow = (document, firstCell) =>
  new RegExp(
    `^\\|\\s*${escapeRegex(firstCell)}\\s*\\|\\s*PASS(?:\\s*\\([^|]+\\))?\\s*\\|`,
    "m",
  ).test(document);
const tableLineForCell = (document, cell) =>
  document
    .split("\n")
    .find((line) =>
      new RegExp(`^\\|\\s*${escapeRegex(cell)}\\s*\\|`, "m").test(line),
    ) ?? "";
const taskIntegrationMode = (task) => {
  if (!task) {
    return "missing";
  }
  if (task.integration_status === "not_applicable") {
    return "sidecar";
  }
  if (
    ["merged_to_dev", "deploy_blocked", "dev_deployed"].includes(
      task.integration_status,
    ) ||
    task.push_ref === "origin/dev" ||
    task.merged_ref === "origin/dev"
  ) {
    return "dev";
  }
  return "other";
};
const deliveredCommitIntegrated = (task) =>
  [task?.merge_commit, task?.commit_hash, task?.push_commit].some((value) =>
    isAncestorOfHead(value),
  );

const failures = [];
const manifest = readJson(codeRoot, expectedPaths.manifest);
const finalEvidence = readCodeText(expectedPaths.finalEvidence);
const blockerReport = readCodeText(expectedPaths.blockerReport);
const closeoutBoard = readCodeText(expectedPaths.closeoutBoard);
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
  !finalEvidence.includes("<PASS|FAIL") &&
    !finalEvidence.includes("<VERDICT>") &&
    !finalEvidence.includes("<path>"),
  "final evidence has no template markers",
  failures,
);
for (const gate of [
  "Gate A - Callcenter safe to dispatch",
  "Gate B - Governance safe to publish",
  "Gate C - Ops safe to operate",
  "Gate D - Driver safe to navigate",
  "Gate E - Degraded safe",
]) {
  assert(hasPassingRow(finalEvidence, gate), `gate row passes: ${gate}`, failures);
  const gateLine = tableLineForCell(finalEvidence, gate);
  assert(
    /support\/sidecars\/|apps\/|docs\/|tests\//.test(gateLine),
    `gate row cites artifact evidence: ${gate}`,
    failures,
  );
}

for (const item of manifest.productionEvidence || []) {
  assert(
    hasPassingRow(finalEvidence, `\`${item.id}\``),
    `production evidence row present for ${item.id}`,
    failures,
  );
  const evidenceLine = tableLineForCell(finalEvidence, `\`${item.id}\``);
  assert(
    (item.artifactPaths || []).some((artifactPath) =>
      evidenceLine.includes(artifactPath),
    ),
    `production evidence row for ${item.id} cites manifest artifact evidence`,
    failures,
  );
}

assert(
  finalEvidence.includes(expectedPaths.blockerReport) &&
    finalEvidence.includes(expectedPaths.closeoutBoard),
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
  const mode = taskIntegrationMode(task);
  assert(task?.status === "done", `${taskId} is done`, failures);
  if (mode === "dev") {
    assert(
      deliveredCommitIntegrated(task),
      `${taskId} delivered commit is integrated into verifier HEAD`,
      failures,
    );
  } else if (mode === "sidecar") {
    assert(
      task?.integration_status === "not_applicable" &&
        Boolean(task?.commit_hash) &&
        Boolean(task?.push_ref),
      `${taskId} is recorded as a completed sidecar-only closeout`,
      failures,
    );
  } else {
    assert(false, `${taskId} has recognized integration metadata`, failures);
  }
}

const ownerTask = tasks.get("FLEETS-CLOSEOUT-008");
assert(
  ["in_progress", "review", "review_approved", "done"].includes(
    ownerTask?.status,
  ),
  "FLEETS-CLOSEOUT-008 status is compatible with readiness verification",
  failures,
);

if (failures.length > 0) {
  console.error(`production_readiness=FAIL count=${failures.length}`);
  process.exitCode = 1;
} else {
  console.log("production_readiness=PASS");
}
