#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const finalEvidencePath = path.join(
  repoRoot,
  "support/sidecars/MAP-REL-001/MAP-REL-001-FINAL-EVIDENCE.md",
);
const manifestPath = path.join(
  repoRoot,
  "support/sidecars/MAP-REL-001/MAP-FLEETS-EXECUTION-MANIFEST-20260701.json",
);
const reportPath = path.join(
  repoRoot,
  "support/sidecars/MAP-REL-001/MAP-READINESS-BLOCKER-REPORT.md",
);
const handoffNotesPath = path.join(
  repoRoot,
  "support/sidecars/MAP-REL-001/MAP-READINESS-BLOCKER-HANDOFFS.md",
);
const gapDocPath = path.join(
  repoRoot,
  "docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260701.md",
);

const requiredPaths = [
  "docs/03-runbooks/map-geofence-fleets-execution-tasks-20260701.md",
  "docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260701.md",
  "docs/03-runbooks/map-provider-operational-runbook-20260630.md",
  "scripts/verify-map-geofence-dispatch-integrity.mjs",
  "scripts/report-map-geofence-readiness-blockers.mjs",
  "scripts/note-map-geofence-blocker-handoffs.mjs",
  "support/sidecars/MAP-REL-001/MAP-FLEETS-EXECUTION-MANIFEST-20260701.json",
  "support/sidecars/MAP-REL-001/MAP-REL-001-FINAL-EVIDENCE.md",
  "support/sidecars/MAP-REL-001/MAP-READINESS-BLOCKER-REPORT.md",
  "support/sidecars/MAP-REL-001/MAP-READINESS-BLOCKER-HANDOFFS.md",
];

const failures = [];

for (const relativePath of requiredPaths) {
  if (!existsSync(path.join(repoRoot, relativePath))) {
    failures.push(`missing required artifact: ${relativePath}`);
  }
}

const placeholderPatterns = [
  /<[^>\n]+>/,
  /\bTODO\b/,
  /\bTBD\b/,
  /REPLACE_ME/,
  /\{\{[^}]+\}\}/,
];

function inspectTextFile(filePath, label) {
  if (!existsSync(filePath)) {
    return;
  }

  const content = readFileSync(filePath, "utf8");
  for (const pattern of placeholderPatterns) {
    if (pattern.test(content)) {
      failures.push(
        `${label} still contains placeholder-like content (${pattern})`,
      );
      break;
    }
  }
  return content;
}

const finalEvidence = inspectTextFile(
  finalEvidencePath,
  "MAP-REL final evidence",
);
const report = inspectTextFile(reportPath, "MAP-REL blocker report");
inspectTextFile(handoffNotesPath, "MAP-REL blocker handoff notes");

let manifest;
if (existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    failures.push(`manifest JSON parse failed: ${error.message}`);
  }
}

if (manifest) {
  if (manifest.taskId !== "MAP-REL-001") {
    failures.push("manifest.taskId must be MAP-REL-001");
  }
  if (
    !Array.isArray(manifest.productionEvidence) ||
    manifest.productionEvidence.length === 0
  ) {
    failures.push("manifest.productionEvidence must contain at least one item");
  } else {
    for (const item of manifest.productionEvidence) {
      if (!item.id?.startsWith("FLEETS-MAP-")) {
        failures.push(
          `manifest item is missing a FLEETS-MAP id: ${JSON.stringify(item)}`,
        );
        continue;
      }
      if (!Array.isArray(item.artifacts) || item.artifacts.length === 0) {
        failures.push(`manifest item ${item.id} is missing artifact links`);
        continue;
      }
      for (const artifact of item.artifacts) {
        if (!existsSync(path.join(repoRoot, artifact))) {
          failures.push(
            `manifest item ${item.id} points at missing artifact: ${artifact}`,
          );
        }
      }
    }
  }
}

if (
  finalEvidence &&
  !/Branch@SHA:\**\s*`[^`]+@[\da-f]{7,40}`/u.test(finalEvidence)
) {
  failures.push("MAP-REL final evidence is missing a concrete Branch@SHA line");
}

if (report && !/Readiness verdict:\s*`(PASS|FAIL)`/u.test(report)) {
  failures.push(
    "MAP-REL blocker report is missing the readiness verdict marker",
  );
}

if (existsSync(gapDocPath)) {
  const gapDoc = readFileSync(gapDocPath, "utf8");
  if (!gapDoc.includes("## 2026-07-04 Release Closeout Snapshot")) {
    failures.push(
      "gap inventory delta is missing the 2026-07-04 release closeout snapshot",
    );
  }
}

if (failures.length > 0) {
  console.error("MAP-REL dispatch integrity: FAIL");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("MAP-REL dispatch integrity: PASS");
