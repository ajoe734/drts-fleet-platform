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
  callcenterMapEvidence:
    "support/sidecars/MAP-REL-001/FLEETS-CLOSEOUT-009-CALLCENTER-MAP-EVIDENCE.md",
};

const readCodeText = (relativePath) =>
  fs.readFileSync(path.join(codeRoot, relativePath), "utf8");
const readJson = (rootDir, relativePath) =>
  JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), "utf8"));
const exists = (relativePath) => fs.existsSync(path.join(codeRoot, relativePath));
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const currentBranch = () =>
  spawnSync("git", ["branch", "--show-current"], {
    cwd: codeRoot,
    encoding: "utf8",
  }).stdout.trim();
const isAncestorOfHead = (commitHash) =>
  Boolean(commitHash) &&
  spawnSync("git", ["merge-base", "--is-ancestor", commitHash, "HEAD"], {
    cwd: codeRoot,
    stdio: "ignore",
  }).status === 0;
const hasPassingEvidenceRow = (document, id) =>
  new RegExp(`^\\|\\s*\`${escapeRegex(id)}\`\\s*\\|\\s*PASS\\s*\\|`, "m").test(
    document,
  );
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
const status = readJson(statusRoot, "ai-status.json");
const tasks = new Map(
  (status.tasks || [])
    .filter((task) => task && task.id)
    .map((task) => [String(task.id), task]),
);

console.log("MAP dispatch integrity verification");
console.log(`code_root=${codeRoot}`);
console.log(`status_root=${statusRoot}`);

for (const relativePath of Object.values(expectedPaths)) {
  assert(exists(relativePath), `${relativePath} exists`, failures);
}

assert(
  manifest.releaseCloseoutBranch === "codex/fleets-closeout-008",
  "manifest releaseCloseoutBranch matches task branch",
  failures,
);
assert(
  manifest.releaseCloseoutBranch === currentBranch(),
  "manifest releaseCloseoutBranch matches current git branch",
  failures,
);
assert(
  manifest.finalEvidence === expectedPaths.finalEvidence,
  "manifest finalEvidence path matches expected release evidence file",
  failures,
);
assert(
  manifest.blockerReport === expectedPaths.blockerReport,
  "manifest blockerReport path matches expected blocker report",
  failures,
);
assert(
  manifest.closeoutBoard === expectedPaths.closeoutBoard,
  "manifest closeoutBoard path matches expected closeout board",
  failures,
);
assert(
  Array.isArray(manifest.requiredTaskIds) && manifest.requiredTaskIds.length > 0,
  "manifest declares required closeout tasks",
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
  const evidenceLine = tableLineForCell(finalEvidence, `\`${item.id}\``);
  assert(
    (item.artifactPaths || []).some((artifactPath) =>
      evidenceLine.includes(artifactPath),
    ),
    `final evidence row for ${item.id} cites artifact path evidence`,
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
  const mode = taskIntegrationMode(task);
  assert(Boolean(task), `task ${taskId} exists in ai-status`, failures);
  assert(task?.status === "done", `task ${taskId} is done`, failures);
  if (mode === "dev") {
    assert(
      deliveredCommitIntegrated(task),
      `task ${taskId} is integrated into verifier HEAD`,
      failures,
    );
  } else if (mode === "sidecar") {
    assert(
      Boolean(task?.commit_hash) &&
        Boolean(task?.push_remote) &&
        Boolean(task?.push_branch),
      `task ${taskId} records sidecar closeout provenance`,
      failures,
    );
  } else {
    assert(false, `task ${taskId} has recognized integration metadata`, failures);
  }
}

const ownerTask = tasks.get("FLEETS-CLOSEOUT-008");
assert(Boolean(ownerTask), "task FLEETS-CLOSEOUT-008 exists in ai-status", failures);
assert(
  ["in_progress", "review", "review_approved", "done"].includes(
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
  finalEvidence.includes(expectedPaths.closeoutBoard) &&
    finalEvidence.includes(expectedPaths.blockerReport),
  "final evidence links latest closeout board and blocker report",
  failures,
);
assert(
  finalEvidence.includes(expectedPaths.callcenterMapEvidence),
  "final evidence links integrated Callcenter map evidence",
  failures,
);

if (failures.length > 0) {
  console.error(`dispatch_integrity=FAIL count=${failures.length}`);
  process.exitCode = 1;
} else {
  console.log("dispatch_integrity=PASS");
}
