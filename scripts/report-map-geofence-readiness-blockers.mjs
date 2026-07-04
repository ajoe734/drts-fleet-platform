#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const finalEvidencePath = path.join(
  repoRoot,
  "support/sidecars/MAP-REL-001/MAP-REL-001-FINAL-EVIDENCE.md",
);
const manifestPath = path.join(
  repoRoot,
  "support/sidecars/MAP-REL-001/MAP-FLEETS-EXECUTION-MANIFEST-20260701.json",
);
const gapDocPath = path.join(
  repoRoot,
  "docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260701.md",
);
const outputJsonPath = path.join(
  repoRoot,
  "support/sidecars/MAP-REL-001/artifacts/readiness-blocker-report.json",
);
const outputMdPath = path.join(
  repoRoot,
  "support/sidecars/MAP-REL-001/MAP-REL-001-READINESS-BLOCKER-REPORT.md",
);

const finalEvidence = fs.readFileSync(finalEvidencePath, "utf8");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const gapDoc = fs.readFileSync(gapDocPath, "utf8");

function hasPlaceholder(text) {
  return /<[^>\n]+>|{{|}}|\bREPLACE_ME\b|\bTODO\b|\bTBD\b/i.test(text);
}

const blockers = [];
const checks = [];

for (const gate of ["Gate A", "Gate B", "Gate C", "Gate D", "Gate E"]) {
  const pass = new RegExp(`\\|\\s*\`${gate}\`\\s*\\|\\s*PASS\\s*\\|`).test(
    finalEvidence,
  );
  checks.push({ id: gate, pass });
  if (!pass) blockers.push(`${gate} is not marked PASS in final evidence.`);
}

for (const item of manifest.productionEvidence) {
  const rowPass =
    item.status === "PASS" &&
    new RegExp(`\\|\\s*\`${item.id}\`\\s*\\|\\s*PASS\\s*\\|`).test(finalEvidence);
  checks.push({ id: item.id, pass: rowPass });
  if (!rowPass) {
    blockers.push(`${item.id} is not closed with PASS in final evidence.`);
  }
  for (const artifact of item.artifacts) {
    if (!fs.existsSync(path.join(repoRoot, artifact))) {
      blockers.push(`${item.id} artifact missing: ${artifact}`);
    }
  }
}

const prereqChecks = [
  {
    id: "provider-prereqs",
    pass:
      finalEvidence.includes("Provider And PostGIS Prerequisites") &&
      finalEvidence.includes("MAP_PROVIDER_BACKEND=google"),
  },
  {
    id: "rollout-rollback",
    pass:
      finalEvidence.includes("Rollout And Rollback") &&
      finalEvidence.includes("Rollback path uses boundary/policy retire plus flag disable"),
  },
  {
    id: "gap-closeout",
    pass:
      gapDoc.includes("Release Closeout Status For `MAP-REL-001`") &&
      gapDoc.includes("No gap row remains") &&
      gapDoc.includes("unassigned in this release closeout view.") &&
      Array.from({ length: 13 }, (_, index) =>
        `MAP-GAP-${String(index + 1).padStart(3, "0")}`,
      ).every((id) => gapDoc.includes(id)),
  },
  {
    id: "placeholder-free",
    pass: !hasPlaceholder(finalEvidence) && !hasPlaceholder(gapDoc),
  },
];

for (const check of prereqChecks) {
  checks.push(check);
  if (!check.pass) {
    blockers.push(`${check.id} check failed.`);
  }
}

const report = {
  taskId: "MAP-REL-001",
  verifier: "report-map-geofence-readiness-blockers",
  status: blockers.length === 0 ? "PASS" : "FAIL",
  branch: execFileSync("git", ["branch", "--show-current"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim(),
  head: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim(),
  blockers,
  checks,
};

const lines = [
  "# MAP-REL-001 Readiness Blocker Report",
  "",
  `- Task: \`MAP-REL-001\``,
  `- Branch: \`${report.branch}\``,
  `- Head: \`${report.head}\``,
  `- Verifier: \`${report.verifier}\``,
  `- Verdict: \`${report.status}\``,
  "",
  "## Checks",
  "",
  "| Check | Result |",
  "| --- | --- |",
  ...checks.map((check) => `| \`${check.id}\` | ${check.pass ? "PASS" : "FAIL"} |`),
  "",
  "## Blockers",
  "",
  blockers.length === 0
    ? "No readiness blockers remain in the repo-backed release evidence set."
    : blockers.map((blocker) => `- ${blocker}`).join("\n"),
  "",
];

fs.mkdirSync(path.dirname(outputJsonPath), { recursive: true });
fs.writeFileSync(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(outputMdPath, `${lines.join("\n")}\n`);

if (report.status !== "PASS") {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(report, null, 2));
