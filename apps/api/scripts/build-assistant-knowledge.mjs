import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptDir, "..");
const repoRoot = resolve(appRoot, "../..");
const outputPath = resolve(
  appRoot,
  "src/modules/assistant/knowledge/generated/knowledge-corpus.generated.ts",
);

const corpusVersion = "2026-06-02";
const manifest = [
  [
    "ops-console-handoff-20260525",
    "docs/05-ui/ops-console-design-handoff-packet-20260525.md",
    "Ops Console Design Handoff Packet",
    "markdown",
  ],
  [
    "ops-canvas-readme",
    "docs/05-ui/drts-design-canvas/README.md",
    "Design Canvas README",
    "markdown",
  ],
  [
    "ops-canvas-screen-1",
    "docs/05-ui/drts-design-canvas/ops-screens-1.jsx",
    "Ops Canvas Screens 1",
    "jsx",
  ],
  [
    "ops-canvas-screen-2",
    "docs/05-ui/drts-design-canvas/ops-screens-2.jsx",
    "Ops Canvas Screens 2",
    "jsx",
  ],
  [
    "ops-canvas-screen-3",
    "docs/05-ui/drts-design-canvas/ops-screens-3.jsx",
    "Ops Canvas Screens 3",
    "jsx",
  ],
  [
    "ops-canvas-shell",
    "docs/05-ui/drts-design-canvas/Ops Console.html",
    "Ops Canvas Shell",
    "html",
  ],
  [
    "operational-glossary-copy-audit",
    "docs/03-runbooks/operational-glossary-and-copy-audit.md",
    "Operational Glossary and Copy Audit",
    "markdown",
  ],
  [
    "phase1-operator-routing-runbook",
    "docs/03-runbooks/phase1-operator-routing-runbook.md",
    "Phase 1 Operator Routing Runbook",
    "markdown",
  ],
  [
    "incident-escalation-runbook",
    "docs/03-runbooks/incident-escalation-service-recovery-runbook.md",
    "Incident Escalation Service Recovery Runbook",
    "markdown",
  ],
  [
    "reconciliation-issue-runbook",
    "docs/03-runbooks/reconciliation-issue-workflow-runbook.md",
    "Reconciliation Issue Workflow Runbook",
    "markdown",
  ],
];

const markdownHeading = /^(#{1,6})\s+(.+?)\s*$/;
const jsxSection = /^\s*\/\/\s*(.+?)\s*$/;
const htmlTitle = /<title>(.+?)<\/title>/i;

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeKnowledgeText(value) {
  return normalizeWhitespace(value).toLowerCase();
}

function tokenizeKnowledgeText(value) {
  const matches = value.toLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? [];
  return [...new Set(matches.filter((term) => term.length > 1))];
}

function resolveKnowledgeGeneratedAt(corpusVersion) {
  const generatedAt = new Date(`${corpusVersion}T00:00:00.000Z`);
  return Number.isNaN(generatedAt.valueOf())
    ? "1970-01-01T00:00:00.000Z"
    : generatedAt.toISOString();
}

function createChunk(entry, section, lineStart, lineEnd, text) {
  const normalizedText = normalizeKnowledgeText(text);
  if (!normalizedText) {
    return null;
  }

  return {
    snippetId: `${entry.documentId}:${lineStart}-${lineEnd}`,
    documentId: entry.documentId,
    sourcePath: entry.sourcePath,
    title: entry.title,
    section,
    lineStart,
    lineEnd,
    text: normalizeWhitespace(text),
    normalizedText,
    terms: tokenizeKnowledgeText(text),
  };
}

function buildMarkdownChunks(entry, rawContent) {
  const chunks = [];
  const lines = rawContent.split(/\r?\n/);
  let headingStack = [];
  let buffer = [];
  let startLine = 1;

  const flush = (endLine) => {
    const chunk = createChunk(
      entry,
      headingStack.length > 0 ? headingStack.join(" > ") : null,
      startLine,
      endLine,
      buffer.join("\n"),
    );
    if (chunk) {
      chunks.push(chunk);
    }
    buffer = [];
  };

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const heading = line.match(markdownHeading);
    if (heading) {
      if (buffer.length > 0) {
        flush(lineNumber - 1);
      }
      const level = heading[1].length;
      headingStack = headingStack.slice(0, level - 1);
      headingStack[level - 1] = normalizeWhitespace(heading[2]);
      buffer = [line];
      startLine = lineNumber;
      return;
    }

    if (buffer.length === 0) {
      startLine = lineNumber;
    }
    buffer.push(line);
  });

  if (buffer.length > 0) {
    flush(lines.length);
  }

  return chunks;
}

function buildSourceChunks(entry, rawContent) {
  const lines = rawContent.split(/\r?\n/);
  const chunks = [];
  let section =
    entry.kind === "html"
      ? normalizeWhitespace(rawContent.match(htmlTitle)?.[1] ?? entry.title)
      : null;
  let buffer = [];
  let startLine = 1;

  const flush = (endLine) => {
    const chunk = createChunk(entry, section, startLine, endLine, buffer.join("\n"));
    if (chunk) {
      chunks.push(chunk);
    }
    buffer = [];
  };

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const sectionComment = entry.kind === "jsx" ? line.match(jsxSection) : null;
    if (sectionComment) {
      if (buffer.length > 0) {
        flush(lineNumber - 1);
      }
      section = normalizeWhitespace(sectionComment[1]);
      buffer = [line];
      startLine = lineNumber;
      return;
    }

    if (buffer.length === 0) {
      startLine = lineNumber;
    }
    buffer.push(line);
  });

  if (buffer.length > 0) {
    flush(lines.length);
  }

  return chunks;
}

const chunks = manifest.flatMap(([documentId, sourcePath, title, kind]) => {
  const entry = { documentId, sourcePath, title, kind };
  const rawContent = readFileSync(resolve(repoRoot, sourcePath), "utf8");
  return kind === "markdown"
    ? buildMarkdownChunks(entry, rawContent)
    : buildSourceChunks(entry, rawContent);
});

const corpus = {
  corpusVersion,
  generatedAt: resolveKnowledgeGeneratedAt(corpusVersion),
  chunks,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(
  outputPath,
  `import type { KnowledgeCorpusRecord } from "../knowledge-internal.types";

export const GENERATED_KNOWLEDGE_CORPUS: KnowledgeCorpusRecord = ${JSON.stringify(
    corpus,
    null,
    2,
  )} as const;
`,
  "utf8",
);

process.stdout.write(
  `Generated assistant knowledge corpus ${corpus.corpusVersion} with ${corpus.chunks.length} chunks.\n`,
);
