import type { KnowledgeCitationRecord } from "@drts/contracts";

export interface KnowledgeChunkRecord {
  snippetId: string;
  documentId: string;
  sourcePath: string;
  title: string;
  section: string | null;
  lineStart: number;
  lineEnd: number;
  text: string;
  normalizedText: string;
  terms: string[];
}

export interface KnowledgeCorpusRecord {
  corpusVersion: string;
  generatedAt: string;
  chunks: KnowledgeChunkRecord[];
}

export type KnowledgeSourceKind = "markdown" | "jsx" | "html";

export interface KnowledgeSourceManifestEntry {
  documentId: string;
  sourcePath: string;
  title: string;
  kind: KnowledgeSourceKind;
}

export interface KnowledgeSourceRecord extends KnowledgeSourceManifestEntry {
  content: string;
}

export interface KnowledgeCorpusArtifactRecord extends KnowledgeCorpusRecord {
  generatedFrom: KnowledgeSourceManifestEntry[];
}

export function toKnowledgeCitation(
  chunk: Pick<
    KnowledgeChunkRecord,
    "documentId" | "sourcePath" | "title" | "section" | "lineStart" | "lineEnd"
  >,
): KnowledgeCitationRecord {
  return {
    documentId: chunk.documentId,
    sourcePath: chunk.sourcePath,
    title: chunk.title,
    section: chunk.section,
    lineStart: chunk.lineStart,
    lineEnd: chunk.lineEnd,
  };
}
