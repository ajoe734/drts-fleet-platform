#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const artifactPath = path.join(
  repoRoot,
  "support/sidecars/MAP-REL-001/artifacts/dispatch-integrity.json",
);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function hasPlaceholder(text) {
  return /<[^>\n]+>|{{|}}|\bREPLACE_ME\b|\bTODO\b|\bTBD\b/i.test(text);
}

const task = JSON.parse(
  execFileSync("python3", ["scripts/ai_status.py", "show", "MAP-REL-001"], {
    cwd: repoRoot,
    encoding: "utf8",
  }),
);

const manifestPath = path.join(
  repoRoot,
  "support/sidecars/MAP-REL-001/MAP-FLEETS-EXECUTION-MANIFEST-20260701.json",
);
const finalEvidencePath = path.join(
  repoRoot,
  "support/sidecars/MAP-REL-001/MAP-REL-001-FINAL-EVIDENCE.md",
);
const blockerReportPath = path.join(
  repoRoot,
  "support/sidecars/MAP-REL-001/MAP-REL-001-READINESS-BLOCKER-REPORT.md",
);
const handoffNotesPath = path.join(
  repoRoot,
  "support/sidecars/MAP-REL-001/MAP-REL-001-BLOCKER-HANDOFF-NOTES.md",
);

const requiredPaths = [
  ...task.artifacts,
  "support/sidecars/MAP-REL-001/MAP-REL-001-FINAL-EVIDENCE.md",
  "support/sidecars/MAP-REL-001/MAP-REL-001-READINESS-BLOCKER-REPORT.md",
  "support/sidecars/MAP-REL-001/MAP-REL-001-BLOCKER-HANDOFF-NOTES.md",
];

const missingArtifacts = requiredPaths.filter(
  (relativePath) => !fs.existsSync(path.join(repoRoot, relativePath)),
);

const textChecks = [
  finalEvidencePath,
  blockerReportPath,
  handoffNotesPath,
  manifestPath,
].map((filePath) => ({
  path: path.relative(repoRoot, filePath),
  hasPlaceholder: hasPlaceholder(fs.readFileSync(filePath, "utf8")),
}));

const manifest = readJson(manifestPath);
const finalEvidenceText = fs.readFileSync(finalEvidencePath, "utf8");
const currentBranch = execFileSync("git", ["branch", "--show-current"], {
  cwd: repoRoot,
  encoding: "utf8",
}).trim();
const currentHead = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: repoRoot,
  encoding: "utf8",
}).trim();
const expectedBranchSha = `${currentBranch}@${currentHead}`;
const finalEvidenceBranchSha =
  finalEvidenceText.match(/\*\*Branch@SHA:\*\*\s*`([^`]+)`/)?.[1] ?? null;
const manifestPass =
  Array.isArray(manifest.productionEvidence) &&
  manifest.productionEvidence.length > 0 &&
  manifest.productionEvidence.every(
    (item) =>
      item.status === "PASS" &&
      Array.isArray(item.artifacts) &&
      item.artifacts.length > 0,
  );
const branchShaConsistent =
  manifest.branch === currentBranch &&
  manifest.branchSha === currentHead &&
  finalEvidenceBranchSha === expectedBranchSha;

const result = {
  taskId: task.id,
  verifier: "verify-map-geofence-dispatch-integrity",
  status:
    missingArtifacts.length === 0 &&
    textChecks.every((entry) => !entry.hasPlaceholder) &&
    manifestPass &&
    branchShaConsistent
      ? "PASS"
      : "FAIL",
  branch: currentBranch,
  head: currentHead,
  checks: {
    missingArtifacts,
    placeholderFiles: textChecks.filter((entry) => entry.hasPlaceholder),
    manifestPass,
    branchShaConsistent,
    expectedBranchSha,
    finalEvidenceBranchSha,
    manifestBranchSha: manifest.branchSha ?? null,
  },
};

fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
fs.writeFileSync(artifactPath, `${JSON.stringify(result, null, 2)}\n`);

if (result.status !== "PASS") {
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(result, null, 2));
