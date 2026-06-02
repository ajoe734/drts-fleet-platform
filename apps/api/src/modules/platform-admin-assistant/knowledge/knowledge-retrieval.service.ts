import { Injectable } from "@nestjs/common";

import {
  APPROVED_SOURCES,
  approvedSourcesByCategory,
  isApprovedSourcePath,
} from "./approved-sources";
import { indexDocuments } from "./knowledge-indexer";
import type {
  Citation,
  GroundedRetrieval,
  KnowledgeChunk,
  KnowledgeSourceCategory,
  KnowledgeSourceDocument,
  RetrievalHit,
  RetrievalQuery,
  RetrievalResult,
  UncertainRetrieval,
  UntrustedContextBlock,
} from "./knowledge.types";
import { wrapUntrustedContent } from "./prompt-injection";

export interface KnowledgeRetrievalOptions {
  /** Minimum query-term coverage (0..1) for an answer to be considered grounded. */
  readonly minConfidence?: number;
  /** Default number of hits returned. */
  readonly defaultLimit?: number;
}

const DEFAULT_MIN_CONFIDENCE = 0.34;
const DEFAULT_LIMIT = 5;

const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "of",
  "to",
  "in",
  "on",
  "for",
  "and",
  "or",
  "is",
  "are",
  "was",
  "were",
  "be",
  "with",
  "as",
  "at",
  "by",
  "it",
  "this",
  "that",
  "what",
  "which",
  "how",
  "do",
  "does",
  "can",
  "i",
  "we",
  "you",
  "from",
  "about",
]);

// CJK / Japanese / Korean scripts have no whitespace word boundaries, so an
// ASCII-only tokenizer dropped them entirely and any Chinese question or doc
// text scored zero (every zh query fell into `uncertain`). We keep Latin/digit
// words as-is and segment CJK runs into character bigrams — the standard
// segmenter-free IR technique: it needs no dictionary, and because both the
// query and the indexed text pass through the same bigram split, a zh term like
// "租戶治理" matches the same bigrams ("租戶", "戶治", "治理") in the corpus.
const CJK_RANGES =
  "\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff\\u3040-\\u30ff\\uac00-\\ud7af";
const TOKEN_PATTERN = new RegExp(
  `[a-z0-9]+(?:-[a-z0-9]+)*|[${CJK_RANGES}]+`,
  "g",
);

function tokenize(text: string): string[] {
  const tokens: string[] = [];
  for (const match of text.toLowerCase().matchAll(TOKEN_PATTERN)) {
    const run = match[0];
    if (/^[a-z0-9]/.test(run)) {
      // Latin / digit word run — preserve prior behaviour (min length, stopwords).
      if (run.length >= 2 && !STOP_WORDS.has(run)) {
        tokens.push(run);
      }
      continue;
    }
    // CJK run → overlapping character bigrams; a lone character falls back to a
    // unigram so a single-character run is still retrievable.
    const chars = [...run];
    if (chars.length === 1) {
      tokens.push(chars[0]!);
      continue;
    }
    for (let i = 0; i < chars.length - 1; i += 1) {
      tokens.push(`${chars[i]}${chars[i + 1]}`);
    }
  }
  return tokens;
}

/**
 * Knowledge retrieval service for the Platform Admin assistant.
 *
 * Responsibilities (PA-AI-BE-002):
 *  - index ONLY approved source paths (see {@link APPROVED_SOURCES});
 *  - retrieve grounding context for a question with `sourcePath`/`section`
 *    citations;
 *  - return an uncertainty / help-search response when no approved source
 *    supports the question, rather than fabricating;
 *  - treat all indexed/tool content as untrusted (prompt-injection safe).
 *
 * It deliberately does NOT call an LLM provider — generation belongs to the
 * provider abstraction (PA-AI-BE-001) / gateway (PA-AI-CONFIG-001). This layer
 * only decides what is grounded and hands back cited, untrusted context.
 */
@Injectable()
export class PlatformAdminAssistantKnowledgeService {
  private readonly minConfidence: number;
  private readonly defaultLimit: number;
  private chunks: KnowledgeChunk[] = [];

  constructor(options: KnowledgeRetrievalOptions = {}) {
    this.minConfidence = options.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
    this.defaultLimit = options.defaultLimit ?? DEFAULT_LIMIT;
  }

  /**
   * Replace the index with chunks built from the given documents. Non-approved
   * paths are skipped and returned for caller visibility.
   */
  loadDocuments(docs: KnowledgeSourceDocument[]): {
    indexed: number;
    skipped: string[];
  } {
    const { chunks, skipped } = indexDocuments(docs);
    this.chunks = chunks;
    return { indexed: chunks.length, skipped };
  }

  /** Number of indexed chunks currently retrievable. */
  get indexedChunkCount(): number {
    return this.chunks.length;
  }

  /** Lower-level ranked retrieval over the approved index. */
  retrieve(query: RetrievalQuery): RetrievalHit[] {
    const terms = tokenize(query.question);
    if (terms.length === 0) {
      return [];
    }
    const uniqueTerms = [...new Set(terms)];
    const limit = query.limit ?? this.defaultLimit;
    const categoryFilter = query.categories
      ? new Set(query.categories)
      : undefined;

    const hits: RetrievalHit[] = [];
    for (const chunk of this.chunks) {
      if (categoryFilter && !this.chunkMatchesCategory(chunk, categoryFilter)) {
        continue;
      }
      const hit = this.scoreChunk(chunk, uniqueTerms);
      if (hit.score > 0) {
        hits.push(hit);
      }
    }

    hits.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      if (a.chunk.sourcePath !== b.chunk.sourcePath) {
        return a.chunk.sourcePath.localeCompare(b.chunk.sourcePath);
      }
      return a.chunk.ordinal - b.chunk.ordinal;
    });

    return hits.slice(0, limit);
  }

  /**
   * Top-level entry point: returns either a grounded result with citations and
   * untrusted context, or an uncertainty / help-search response.
   */
  answer(query: RetrievalQuery): RetrievalResult {
    const terms = [...new Set(tokenize(query.question))];
    const hits = this.retrieve(query);

    const topHit = hits[0];
    if (!topHit) {
      return this.uncertain("no_match", terms, 0);
    }

    const confidence = this.confidenceOf(topHit, terms);
    if (confidence < this.minConfidence) {
      return this.uncertain("below_confidence", terms, confidence);
    }

    const citations = dedupeCitations(
      hits.map((hit) => ({
        sourcePath: hit.chunk.sourcePath,
        section: hit.chunk.section,
      })),
    );

    const untrustedContext: UntrustedContextBlock[] = hits.map((hit) => ({
      sourcePath: hit.chunk.sourcePath,
      section: hit.chunk.section,
      text: wrapUntrustedContent(hit.chunk.text, {
        sourcePath: hit.chunk.sourcePath,
        section: hit.chunk.section,
      }),
      hasInjectionRisk: hit.chunk.hasInjectionRisk,
    }));

    const grounded: GroundedRetrieval = {
      kind: "grounded",
      hits,
      citations,
      untrustedContext,
      confidence,
    };
    return grounded;
  }

  private chunkMatchesCategory(
    chunk: KnowledgeChunk,
    categories: Set<KnowledgeSourceCategory>,
  ): boolean {
    const source = APPROVED_SOURCES.find(
      (entry) => entry.sourcePath === chunk.sourcePath,
    );
    return source ? categories.has(source.category) : false;
  }

  private scoreChunk(
    chunk: KnowledgeChunk,
    uniqueTerms: string[],
  ): RetrievalHit {
    const bodyTokens = tokenize(chunk.text);
    const sectionTokens = chunk.section
      ? new Set(tokenize(chunk.section))
      : null;
    const bodyCounts = new Map<string, number>();
    for (const token of bodyTokens) {
      bodyCounts.set(token, (bodyCounts.get(token) ?? 0) + 1);
    }

    let score = 0;
    const matchedTerms: string[] = [];
    for (const term of uniqueTerms) {
      const count = bodyCounts.get(term) ?? 0;
      if (count > 0) {
        // Sub-linear term frequency so a single repeated term cannot dominate.
        score += 1 + Math.log(count);
        matchedTerms.push(term);
      }
      // A query term appearing in the heading is a strong relevance signal.
      if (sectionTokens?.has(term)) {
        score += 1.5;
        if (count === 0) {
          matchedTerms.push(term);
        }
      }
    }

    return { chunk, score, matchedTerms: [...new Set(matchedTerms)] };
  }

  /** Confidence = fraction of distinct query terms matched by the top hit. */
  private confidenceOf(hit: RetrievalHit, queryTerms: string[]): number {
    if (queryTerms.length === 0) {
      return 0;
    }
    return hit.matchedTerms.length / queryTerms.length;
  }

  private uncertain(
    reason: UncertainRetrieval["reason"],
    queryTerms: string[],
    confidence: number,
  ): UncertainRetrieval {
    // Suggest the nearest approved sources by category overlap with query terms,
    // so the user gets a "where to look" pointer — never a fabricated answer.
    const suggestedSources = this.suggestSources(queryTerms);
    const message =
      reason === "no_match"
        ? "I couldn't find anything in the approved Platform Admin sources that answers that. " +
          "Try rephrasing, or browse the related documents below."
        : "I'm not confident the approved Platform Admin sources fully answer that. " +
          "Here are the closest related documents to check.";

    return {
      kind: "uncertain",
      reason,
      message,
      suggestedSources,
      confidence,
    };
  }

  private suggestSources(queryTerms: string[]): Citation[] {
    const categoryHints: KnowledgeSourceCategory[] = [];
    const termSet = new Set(queryTerms);
    if (
      termSet.has("contract") ||
      termSet.has("contracts") ||
      termSet.has("action") ||
      termSet.has("authority")
    ) {
      categoryHints.push("ui_contract");
    }
    if (
      termSet.has("navigation") ||
      termSet.has("shell") ||
      termSet.has("topology") ||
      termSet.has("route")
    ) {
      categoryHints.push("topology");
    }
    if (termSet.has("handoff") || termSet.has("design")) {
      categoryHints.push("design_handoff");
    }

    const picks =
      categoryHints.length > 0
        ? categoryHints.flatMap((category) =>
            approvedSourcesByCategory(category),
          )
        : [...APPROVED_SOURCES];

    return dedupeCitations(
      picks.slice(0, 3).map((source) => ({
        sourcePath: source.sourcePath,
        section: null,
      })),
    );
  }
}

function dedupeCitations(citations: Citation[]): Citation[] {
  const seen = new Set<string>();
  const result: Citation[] = [];
  for (const citation of citations) {
    const key = `${citation.sourcePath}#${citation.section ?? ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(citation);
    }
  }
  return result;
}

export { isApprovedSourcePath };
