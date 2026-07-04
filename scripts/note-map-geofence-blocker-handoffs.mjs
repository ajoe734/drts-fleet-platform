#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const reportJsonPath = path.join(
  repoRoot,
  "support/sidecars/MAP-REL-001/artifacts/readiness-blocker-report.json",
);
const outputJsonPath = path.join(
  repoRoot,
  "support/sidecars/MAP-REL-001/artifacts/blocker-handoff-notes.json",
);
const outputMdPath = path.join(
  repoRoot,
  "support/sidecars/MAP-REL-001/MAP-REL-001-BLOCKER-HANDOFF-NOTES.md",
);

const report = JSON.parse(fs.readFileSync(reportJsonPath, "utf8"));
const notes =
  report.blockers.length === 0
    ? [
        {
          action: "skip",
          reason:
            "No unique MAP-REL-001 readiness blockers remain after consuming MAP-QA-002, MAP-OBS-001, MAP-FE-ADM-001, and MAP-MOB-DRV-001 evidence.",
        },
      ]
    : report.blockers.map((blocker) => ({
        action: "handoff",
        reason: blocker,
      }));

const payload = {
  taskId: "MAP-REL-001",
  status: report.blockers.length === 0 ? "PASS" : "FAIL",
  notes,
};

const lines = [
  "# MAP-REL-001 Blocker Handoff Notes",
  "",
  `- Task: \`MAP-REL-001\``,
  `- Source report: \`support/sidecars/MAP-REL-001/artifacts/readiness-blocker-report.json\``,
  `- Verdict: \`${payload.status}\``,
  "",
  "## Notes",
  "",
  ...notes.map((note) => `- ${note.action.toUpperCase()}: ${note.reason}`),
  "",
];

fs.mkdirSync(path.dirname(outputJsonPath), { recursive: true });
fs.writeFileSync(outputJsonPath, `${JSON.stringify(payload, null, 2)}\n`);
fs.writeFileSync(outputMdPath, `${lines.join("\n")}\n`);

console.log(JSON.stringify(payload, null, 2));
