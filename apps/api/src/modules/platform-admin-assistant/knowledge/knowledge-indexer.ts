import {
  getApprovedSource,
  isApprovedSourcePath,
  normalizeSourcePath,
} from "./approved-sources";
import type {
  KnowledgeChunk,
  KnowledgeSourceDocument,
} from "./knowledge.types";
import { detectInjectionSignals } from "./prompt-injection";

/** Maximum characters per chunk before a long section is further split. */
const MAX_CHUNK_CHARS = 1_200;

const MARKDOWN_HEADING = /^(#{1,6})\s+(.*\S)\s*$/;
const HTML_HEADING = /<h[1-6][^>]*>(.*?)<\/h[1-6]>/i;

interface RawSection {
  section: string | null;
  lines: string[];
}

/**
 * Split a document into heading-delimited sections. Markdown ATX headings
 * (`#`..`######`) start new sections; for non-markdown content (e.g. the design
 * canvas HTML) the whole document falls into a single `null` section unless an
 * `<hN>` heading is found per line.
 */
function splitIntoSections(content: string): RawSection[] {
  const sections: RawSection[] = [];
  let current: RawSection = { section: null, lines: [] };

  const pushCurrent = () => {
    if (
      current.section !== null ||
      current.lines.some((l) => l.trim() !== "")
    ) {
      sections.push(current);
    }
  };

  for (const line of content.split(/\r?\n/)) {
    const md = MARKDOWN_HEADING.exec(line);
    const html = md ? null : HTML_HEADING.exec(line);
    if (md) {
      pushCurrent();
      current = { section: (md[2] ?? "").trim() || null, lines: [] };
    } else if (html) {
      pushCurrent();
      current = { section: stripHtml(html[1] ?? "").trim() || null, lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  pushCurrent();

  return sections.length > 0 ? sections : [{ section: null, lines: [] }];
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, "").replace(/&[a-z]+;/gi, " ");
}

/** Further split an oversized section body into <= MAX_CHUNK_CHARS pieces on paragraph boundaries. */
function splitLongText(text: string): string[] {
  if (text.length <= MAX_CHUNK_CHARS) {
    return [text];
  }
  const pieces: string[] = [];
  let buffer = "";
  for (const paragraph of text.split(/\n{2,}/)) {
    const candidate = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
    if (candidate.length > MAX_CHUNK_CHARS && buffer) {
      pieces.push(buffer);
      buffer = paragraph;
    } else {
      buffer = candidate;
    }
  }
  if (buffer.trim() !== "") {
    pieces.push(buffer);
  }
  return pieces.length > 0 ? pieces : [text];
}

/**
 * Build retrievable chunks for a single approved document.
 * @throws if the document's path is not on the approved allowlist.
 */
export function indexDocument(doc: KnowledgeSourceDocument): KnowledgeChunk[] {
  if (!isApprovedSourcePath(doc.sourcePath)) {
    throw new Error(
      `Refusing to index non-approved source path: ${doc.sourcePath}`,
    );
  }

  const canonicalPath =
    getApprovedSource(doc.sourcePath)?.sourcePath ??
    normalizeSourcePath(doc.sourcePath);

  const chunks: KnowledgeChunk[] = [];
  let ordinal = 0;

  for (const rawSection of splitIntoSections(doc.content)) {
    const body = rawSection.lines.join("\n").trim();
    if (body === "" && rawSection.section === null) {
      continue;
    }
    for (const piece of splitLongText(body)) {
      const text = piece.trim();
      if (text === "" && rawSection.section === null) {
        continue;
      }
      chunks.push({
        sourcePath: canonicalPath,
        section: rawSection.section,
        ordinal: ordinal++,
        text,
        hasInjectionRisk: detectInjectionSignals(text).hasInjectionRisk,
      });
    }
  }

  return chunks;
}

/**
 * Index a batch of documents. Non-approved paths are skipped (not indexed) and
 * reported via the `skipped` array rather than throwing, so a single bad path
 * cannot abort indexing of the rest of the approved corpus.
 */
export function indexDocuments(docs: KnowledgeSourceDocument[]): {
  chunks: KnowledgeChunk[];
  skipped: string[];
} {
  const chunks: KnowledgeChunk[] = [];
  const skipped: string[] = [];

  for (const doc of docs) {
    if (!isApprovedSourcePath(doc.sourcePath)) {
      skipped.push(doc.sourcePath);
      continue;
    }
    chunks.push(...indexDocument(doc));
  }

  return { chunks, skipped };
}
