#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const servicePath = resolve(
  repoRoot,
  "apps/api/src/modules/tenant-partner/tenant-partner.service.ts",
);
const outputPath = resolve(repoRoot, "docs/04-api/audit-event-taxonomy.md");

const startMarker = "<!-- GENERATED:tenant-governance-audit-events:start -->";
const endMarker = "<!-- GENERATED:tenant-governance-audit-events:end -->";

const governanceEventMatchers = [
  /^tenant\.cost_center\./,
  /^tenant\.approval_rule\./,
  /^tenant\.quota_/,
  /^booking\.approval_rules\.evaluated$/,
  /^booking\.approval_request\./,
  /^approver_fallback_used$/,
];

const args = new Set(process.argv.slice(2));
const stdoutOnly = args.has("--stdout");
const checkOnly = args.has("--check");

if (stdoutOnly && checkOnly) {
  console.error("Use either --stdout or --check, not both.");
  process.exit(2);
}

const lines = readFileSync(servicePath, "utf8").split("\n");
const seen = new Set();
const events = [];

for (const [index, line] of lines.entries()) {
  if (!line.includes("actionName")) {
    continue;
  }

  for (
    let candidateLine = index;
    candidateLine < Math.min(lines.length, index + 5);
    candidateLine += 1
  ) {
    const matches = [...lines[candidateLine].matchAll(/"([^"]+)"/g)];
    for (const match of matches) {
      const actionName = match[1];
      if (
        !governanceEventMatchers.some((pattern) => pattern.test(actionName)) ||
        seen.has(actionName)
      ) {
        continue;
      }

      seen.add(actionName);
      events.push({
        actionName,
        lineNumber: candidateLine + 1,
      });
    }
  }
}

const snippet = [
  "_Source of truth: `apps/api/src/modules/tenant-partner/tenant-partner.service.ts`_",
  "",
  "| actionName | First seen at |",
  "| --- | --- |",
  ...events.map(
    (event) =>
      `| \`${event.actionName}\` | \`apps/api/src/modules/tenant-partner/tenant-partner.service.ts:${event.lineNumber}\` |`,
  ),
].join("\n");

if (stdoutOnly) {
  process.stdout.write(`${snippet}\n`);
  process.exit(0);
}

const originalDocument = readFileSync(outputPath, "utf8");
const markerPattern = new RegExp(
  `${escapeRegExp(startMarker)}[\\s\\S]*?${escapeRegExp(endMarker)}`,
);

if (!markerPattern.test(originalDocument)) {
  console.error(
    `Could not find generated-section markers in ${relativeToRepo(outputPath)}.`,
  );
  process.exit(1);
}

const replacement = `${startMarker}\n${snippet}\n${endMarker}`;
const nextDocument = originalDocument.replace(markerPattern, replacement);

if (checkOnly) {
  if (nextDocument !== originalDocument) {
    console.error(
      `Generated tenant governance audit snippet is stale in ${relativeToRepo(outputPath)}.`,
    );
    process.exit(1);
  }
  process.exit(0);
}

writeFileSync(outputPath, nextDocument);
process.stdout.write(
  `Updated ${relativeToRepo(outputPath)} from ${relativeToRepo(servicePath)}.\n`,
);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function relativeToRepo(path) {
  return path.replace(`${repoRoot}/`, "");
}
