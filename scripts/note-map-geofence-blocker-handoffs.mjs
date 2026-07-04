#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const sidecarDir = path.join(repoRoot, "support/sidecars/MAP-REL-001");
mkdirSync(sidecarDir, { recursive: true });

const manifest = JSON.parse(
  readFileSync(
    path.join(sidecarDir, "MAP-FLEETS-EXECUTION-MANIFEST-20260701.json"),
    "utf8",
  ),
);
const branch = git(["branch", "--show-current"]);
const sha = git(["rev-parse", "HEAD"]);

const blockerItems = manifest.productionEvidence.filter(
  (item) => item.status === "FAIL",
);

const notes = [
  "# MAP-REL-001 Blocker Handoff Notes",
  "",
  `Generated: \`${new Date().toISOString()}\``,
  `Branch@SHA: \`${branch}@${sha}\``,
  "",
  "## Handoff Decisions",
  "",
];

for (const item of blockerItems) {
  if (item.id === "FLEETS-MAP-GATE-B") {
    notes.push(
      `- \`${item.id}\`: skipped as duplicate of \`support/unblock/MAP-FE-ADM-001/MAP-FE-ADM-001-UNBLOCK-PLANNING-DECISION.md\` and \`support/sidecars/MAP-UI-002/MAP-UI-002-INTEGRATE-001-CLOSEOUT.md\`; no new handoff text was needed beyond linking the canonical blocker.`,
    );
    continue;
  }
  if (item.id === "FLEETS-MAP-GATE-D") {
    notes.push(
      `- \`${item.id}\`: skipped as duplicate of \`support/sidecars/MAP-MOB-DRV-001/MAP-MOB-DRV-001-FINAL-EVIDENCE.md\`, which already records the missing driver simulator/device UAT.`,
    );
    continue;
  }
  if (
    item.id === "FLEETS-MAP-GATE-A" ||
    item.id === "FLEETS-MAP-GATE-C" ||
    item.id === "FLEETS-MAP-GATE-E"
  ) {
    notes.push(
      `- \`${item.id}\`: skipped as duplicate of the shared provider-runtime blocker captured under \`FLEETS-MAP-PROVIDER-PREREQS\`; no separate handoff added.`,
    );
    continue;
  }
  if (item.id === "FLEETS-MAP-PROVIDER-PREREQS") {
    notes.push(
      `- \`${item.id}\`: posted in-place through \`support/sidecars/MAP-REL-001/MAP-READINESS-BLOCKER-REPORT.md\` because the blocker is release-owned: runtime \`MAP_PROVIDER_MODE=external\` remains fail-closed until a live adapter exists.`,
    );
    continue;
  }
  notes.push(`- \`${item.id}\`: ${item.blocker}`);
}

notes.push("");
notes.push("## Outcome");
notes.push("");
notes.push(
  blockerItems.length === 0
    ? "- No open blocker handoffs remained after this run."
    : "- Open blocker notes were either linked in-place or explicitly skipped as duplicates above.",
);

writeFileSync(
  path.join(sidecarDir, "MAP-READINESS-BLOCKER-HANDOFFS.md"),
  `${notes.join("\n")}\n`,
);

console.log(
  `MAP-REL blocker handoff notes written (${blockerItems.length} blockers reviewed).`,
);

function git(args) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
}
