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
  // Cost-center actions still use internal verbs in the live service.
  /^list_cost_center_coverage$/,
  /^upsert_cost_center$/,
  /^disable_cost_center$/,
  /^tenant\.cost_center\./,
  /^tenant\.approval_rule\./,
  /^tenant\.quota_/,
  /^booking\.approval_rules\.evaluated$/,
  /^booking\.approval_request\./,
  /^booking\.cost_center\./,
  /^booking\.governance\./,
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
const actionNameConstants = collectActionNameConstants(lines);
const seen = new Set();
const events = [];

for (const [index, line] of lines.entries()) {
  if (!line.includes("actionName:")) {
    continue;
  }

  const candidateLines = [];
  for (
    let candidateLine = index;
    candidateLine < Math.min(lines.length, index + 6);
    candidateLine += 1
  ) {
    candidateLines.push({
      text: lines[candidateLine],
      lineNumber: candidateLine + 1,
    });
  }

  for (const event of extractGovernanceEvents(
    candidateLines,
    actionNameConstants,
  )) {
    if (seen.has(event.actionName)) {
      continue;
    }

    seen.add(event.actionName);
    events.push(event);
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
  `${escapeRegExp(startMarker)}\\n?([\\s\\S]*?)\\n?${escapeRegExp(endMarker)}`,
);

const markerMatch = originalDocument.match(markerPattern);

if (!markerMatch) {
  console.error(
    `Could not find generated-section markers in ${relativeToRepo(outputPath)}.`,
  );
  process.exit(1);
}

const replacement = `${startMarker}\n${snippet}\n${endMarker}`;
const nextDocument = originalDocument.replace(markerPattern, replacement);

if (checkOnly) {
  const currentSnippet = markerMatch[1] ?? "";
  if (
    normalizeGeneratedBlock(currentSnippet) !== normalizeGeneratedBlock(snippet)
  ) {
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

function collectActionNameConstants(sourceLines) {
  const constants = new Map();

  for (const [index, line] of sourceLines.entries()) {
    const inlineMatch = line.match(/const\s+([A-Z][A-Z0-9_]+)\s*=\s*"([^"]+)"/);
    if (inlineMatch) {
      constants.set(inlineMatch[1], {
        value: inlineMatch[2],
        lineNumber: index + 1,
      });
      continue;
    }

    const multilineMatch = line.match(/const\s+([A-Z][A-Z0-9_]+)\s*=\s*$/);
    if (!multilineMatch) {
      continue;
    }

    const nextLine = sourceLines[index + 1] ?? "";
    const nextLineMatch = nextLine.match(/"([^"]+)"/);
    if (!nextLineMatch) {
      continue;
    }

    constants.set(multilineMatch[1], {
      value: nextLineMatch[1],
      lineNumber: index + 2,
    });
  }

  return constants;
}

function extractGovernanceEvents(candidateLines, actionNameConstants) {
  const extracted = [];
  const localSeen = new Set();

  for (const candidateLine of candidateLines) {
    for (const match of candidateLine.text.matchAll(/"([^"]+)"/g)) {
      addEvent(match[1], candidateLine.lineNumber);
    }

    for (const match of candidateLine.text.matchAll(/\b[A-Z][A-Z0-9_]+\b/g)) {
      const constant = actionNameConstants.get(match[0]);
      if (!constant) {
        continue;
      }
      addEvent(constant.value, constant.lineNumber);
    }
  }

  return extracted;

  function addEvent(actionName, lineNumber) {
    if (
      !governanceEventMatchers.some((pattern) => pattern.test(actionName)) ||
      localSeen.has(actionName)
    ) {
      return;
    }

    localSeen.add(actionName);
    extracted.push({ actionName, lineNumber });
  }
}

function normalizeGeneratedBlock(value) {
  const normalizedLines = [];

  for (const rawLine of value.split("\n")) {
    const line = rawLine.trim();

    if (!line) {
      if (normalizedLines.at(-1) !== "") {
        normalizedLines.push("");
      }
      continue;
    }

    if (line.startsWith("|") && line.endsWith("|")) {
      const cells = line
        .slice(1, -1)
        .split("|")
        .map((cell) => normalizeTableCell(cell.trim()));
      normalizedLines.push(`| ${cells.join(" | ")} |`);
      continue;
    }

    normalizedLines.push(line);
  }

  while (normalizedLines[0] === "") {
    normalizedLines.shift();
  }
  while (normalizedLines.at(-1) === "") {
    normalizedLines.pop();
  }

  return normalizedLines.join("\n");
}

function normalizeTableCell(value) {
  if (!/^:?-+:?$/.test(value)) {
    return value;
  }

  const left = value.startsWith(":") ? ":" : "";
  const right = value.endsWith(":") ? ":" : "";
  return `${left}---${right}`;
}

function relativeToRepo(path) {
  return path.replace(`${repoRoot}/`, "");
}
