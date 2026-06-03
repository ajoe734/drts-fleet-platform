import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type {
  KnowledgeChunkRecord,
  KnowledgeCorpusRecord,
  KnowledgeSourceManifestEntry,
} from "./knowledge-internal.types";
import {
  KNOWLEDGE_CORPUS_VERSION,
  KNOWLEDGE_SOURCE_MANIFEST,
} from "./knowledge.manifest";

const MARKDOWN_HEADING = /^(#{1,6})\s+(.+?)\s*$/;
const JSX_SECTION = /^\s*\/\/\s*(.+?)\s*$/;
const HTML_TITLE = /<title>(.+?)<\/title>/i;

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeKnowledgeText(value: string): string {
  return normalizeWhitespace(value).toLowerCase();
}

export function tokenizeKnowledgeText(value: string): string[] {
  const matches = value.toLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? [];
  return [...new Set(matches.filter((term) => term.length > 1))];
}

export function resolveKnowledgeGeneratedAt(corpusVersion: string): string {
  const generatedAt = new Date(`${corpusVersion}T00:00:00.000Z`);
  return Number.isNaN(generatedAt.valueOf())
    ? "1970-01-01T00:00:00.000Z"
    : generatedAt.toISOString();
}

function createChunk(
  entry: KnowledgeSourceManifestEntry,
  section: string | null,
  lineStart: number,
  lineEnd: number,
  text: string,
): KnowledgeChunkRecord | null {
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

function buildMarkdownChunks(
  entry: KnowledgeSourceManifestEntry,
  rawContent: string,
): KnowledgeChunkRecord[] {
  const chunks: KnowledgeChunkRecord[] = [];
  const lines = rawContent.split(/\r?\n/);
  let headingStack: string[] = [];
  let buffer: string[] = [];
  let startLine = 1;

  const flush = (endLine: number) => {
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
    const heading = line.match(MARKDOWN_HEADING);
    if (heading) {
      const [, headingMarks, headingTitle] = heading;
      if (!headingMarks || !headingTitle) {
        return;
      }
      if (buffer.length > 0) {
        flush(lineNumber - 1);
      }
      const level = headingMarks.length;
      headingStack = headingStack.slice(0, level - 1);
      headingStack[level - 1] = normalizeWhitespace(headingTitle);
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

function buildSourceChunks(
  entry: KnowledgeSourceManifestEntry,
  rawContent: string,
): KnowledgeChunkRecord[] {
  const lines = rawContent.split(/\r?\n/);
  const chunks: KnowledgeChunkRecord[] = [];
  let section: string | null =
    entry.kind === "html"
      ? normalizeWhitespace(rawContent.match(HTML_TITLE)?.[1] ?? entry.title)
      : null;
  let buffer: string[] = [];
  let startLine = 1;

  const flush = (endLine: number) => {
    const chunk = createChunk(entry, section, startLine, endLine, buffer.join("\n"));
    if (chunk) {
      chunks.push(chunk);
    }
    buffer = [];
  };

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const jsxSection = line.match(JSX_SECTION);
    if (entry.kind === "jsx" && jsxSection) {
      const [, jsxSectionTitle] = jsxSection;
      if (!jsxSectionTitle) {
        return;
      }
      if (buffer.length > 0) {
        flush(lineNumber - 1);
      }
      section = normalizeWhitespace(jsxSectionTitle);
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

export function buildKnowledgeCorpus(
  repoRoot: string,
  manifest: KnowledgeSourceManifestEntry[] = KNOWLEDGE_SOURCE_MANIFEST,
  corpusVersion = KNOWLEDGE_CORPUS_VERSION,
): KnowledgeCorpusRecord {
  const chunks = manifest.flatMap((entry) => {
    const filePath = resolve(repoRoot, entry.sourcePath);
    const rawContent = readFileSync(filePath, "utf8");
    if (entry.kind === "markdown") {
      return buildMarkdownChunks(entry, rawContent);
    }
    return buildSourceChunks(entry, rawContent);
  });

  return {
    corpusVersion,
    generatedAt: resolveKnowledgeGeneratedAt(corpusVersion),
    chunks,
  };
}

export function serializeKnowledgeCorpus(
  corpus: KnowledgeCorpusRecord,
): string {
  return `import type { KnowledgeCorpusRecord } from "../knowledge-internal.types";

export const GENERATED_KNOWLEDGE_CORPUS: KnowledgeCorpusRecord = ${JSON.stringify(
    corpus,
    null,
    2,
  )} as const;
`;
}
