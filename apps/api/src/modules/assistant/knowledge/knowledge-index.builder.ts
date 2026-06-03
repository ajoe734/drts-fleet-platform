import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { KnowledgeCitation } from "@drts/contracts";

import {
  KNOWLEDGE_CORPUS_MANIFEST,
  type KnowledgeCorpusDocumentManifest,
} from "./knowledge-corpus.manifest";

export interface KnowledgeChunk {
  snippetId: string;
  title: string;
  text: string;
  normalizedText: string;
  citation: KnowledgeCitation;
}

export interface BuiltKnowledgeIndex {
  corpusVersion: string;
  chunkCount: number;
  documentCount: number;
  chunks: KnowledgeChunk[];
}

export function serializeKnowledgeIndex(index: BuiltKnowledgeIndex): string {
  return JSON.stringify(index, null, 2);
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeForSearch(value: string): string {
  return normalizeWhitespace(value).toLowerCase();
}

function buildSnippetId(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 16);
}

function findRepositoryRoot(startDir: string): string {
  let current = path.resolve(startDir);

  while (true) {
    if (
      existsSync(path.join(current, "pnpm-workspace.yaml")) &&
      existsSync(path.join(current, "apps")) &&
      existsSync(path.join(current, "docs"))
    ) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error("Unable to locate repository root for assistant corpus.");
    }
    current = parent;
  }
}

function headingAllowed(
  manifest: KnowledgeCorpusDocumentManifest,
  heading: string,
): boolean {
  if (!manifest.headingPrefixes || manifest.headingPrefixes.length === 0) {
    return true;
  }

  return manifest.headingPrefixes.some((prefix) => heading.startsWith(prefix));
}

function createChunk(
  manifest: KnowledgeCorpusDocumentManifest,
  sectionTitle: string | null,
  text: string,
  lineStart: number | null,
  lineEnd: number | null,
): KnowledgeChunk | null {
  const normalizedBody = normalizeWhitespace(text);
  if (!normalizedBody) {
    return null;
  }

  const title = sectionTitle
    ? `${manifest.title} — ${sectionTitle}`
    : manifest.title;

  const snippetId = buildSnippetId(
    `${manifest.documentId}:${sectionTitle ?? "root"}:${lineStart ?? 0}:${normalizedBody}`,
  );

  return {
    snippetId,
    title,
    text: normalizedBody,
    normalizedText: normalizeForSearch(`${title} ${normalizedBody}`),
    citation: {
      documentId: manifest.documentId,
      documentTitle: manifest.title,
      documentPath: manifest.path,
      documentVersion: manifest.version,
      sectionTitle,
      lineStart,
      lineEnd,
    },
  };
}

function parseMarkdownChunks(
  content: string,
  manifest: KnowledgeCorpusDocumentManifest,
): KnowledgeChunk[] {
  const chunks: KnowledgeChunk[] = [];
  const lines = content.split(/\r?\n/);

  let currentHeading: string | null = null;
  let currentStart: number | null = 1;
  let buffer: string[] = [];

  const flush = (lineEnd: number | null) => {
    if (currentHeading && !headingAllowed(manifest, currentHeading)) {
      buffer = [];
      return;
    }

    const chunk = createChunk(
      manifest,
      currentHeading,
      buffer.join("\n"),
      currentStart,
      lineEnd,
    );

    if (chunk) {
      chunks.push(chunk);
    }
    buffer = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line);

    if (headingMatch) {
      flush(index);
      currentHeading = (headingMatch[2] ?? "").trim();
      currentStart = index + 1;
      continue;
    }

    buffer.push(line);
  }

  flush(lines.length);

  return chunks;
}

function extractLineNumber(content: string, offset: number): number {
  return content.slice(0, offset).split(/\r?\n/).length;
}

function parseOpsCanvasChunks(
  content: string,
  manifest: KnowledgeCorpusDocumentManifest,
): KnowledgeChunk[] {
  const chunks: KnowledgeChunk[] = [];
  const sectionPattern = /<DCSection\b([\s\S]*?)<\/DCSection>/g;

  for (const match of content.matchAll(sectionPattern)) {
    const block = match[0] ?? "";
    const attrs = match[1] ?? "";
    const titleMatch = /title="([^"]+)"/.exec(attrs);
    const subtitleMatch = /subtitle="([^"]+)"/.exec(attrs);
    const artboardLabels = Array.from(block.matchAll(/label="([^"]+)"/g)).map(
      (labelMatch) => (labelMatch[1] ?? "").trim(),
    );

    const sectionTitle = titleMatch?.[1]?.trim() ?? null;
    const body = [subtitleMatch?.[1]?.trim(), ...artboardLabels]
      .filter((value): value is string => Boolean(value))
      .join("\n");

    const lineStart =
      typeof match.index === "number"
        ? extractLineNumber(content, match.index)
        : null;
    const lineEnd =
      typeof match.index === "number"
        ? extractLineNumber(content, match.index + block.length)
        : null;

    const chunk = createChunk(manifest, sectionTitle, body, lineStart, lineEnd);

    if (chunk) {
      chunks.push(chunk);
    }
  }

  return chunks;
}

function buildChunksForDocument(
  rootDir: string,
  manifest: KnowledgeCorpusDocumentManifest,
): KnowledgeChunk[] {
  const absolutePath = path.join(rootDir, manifest.path);
  const content = readFileSync(absolutePath, "utf8");

  switch (manifest.strategy) {
    case "markdown_headings":
      return parseMarkdownChunks(content, manifest);
    case "ops_canvas":
      return parseOpsCanvasChunks(content, manifest);
    default:
      return [];
  }
}

export function buildKnowledgeIndex(
  rootDir = findRepositoryRoot(process.cwd()),
): BuiltKnowledgeIndex {
  const chunks = KNOWLEDGE_CORPUS_MANIFEST.flatMap((manifest) =>
    buildChunksForDocument(rootDir, manifest),
  );

  const corpusVersion = KNOWLEDGE_CORPUS_MANIFEST.map(
    (manifest) => `${manifest.documentId}@${manifest.version}`,
  ).join("|");

  return {
    corpusVersion,
    chunkCount: chunks.length,
    documentCount: KNOWLEDGE_CORPUS_MANIFEST.length,
    chunks,
  };
}
