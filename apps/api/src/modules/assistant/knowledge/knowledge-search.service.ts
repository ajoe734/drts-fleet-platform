import { Injectable } from "@nestjs/common";

import type {
  KnowledgeSearchResponse,
  KnowledgeSearchResultSnippet,
} from "@drts/contracts";

import {
  normalizeForSearch,
  type BuiltKnowledgeIndex,
  type KnowledgeChunk,
} from "./knowledge-index.builder";
import { GENERATED_KNOWLEDGE_INDEX } from "./knowledge-index.generated";

function isCjkCharacter(value: string): boolean {
  return /\p{Script=Han}/u.test(value);
}

function buildQueryTerms(query: string): string[] {
  const normalized = normalizeForSearch(query);
  const baseTerms = normalized
    .split(/[^\p{L}\p{N}]+/u)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2);

  const cjkTerms = Array.from(normalized)
    .filter((char) => isCjkCharacter(char))
    .map((_, index, chars) => chars.slice(index, index + 2).join(""))
    .filter((term) => term.length === 2);

  return Array.from(new Set([...baseTerms, ...cjkTerms]));
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) {
    return 0;
  }

  let count = 0;
  let start = 0;
  while (true) {
    const next = haystack.indexOf(needle, start);
    if (next === -1) {
      return count;
    }
    count += 1;
    start = next + needle.length;
  }
}

function buildExcerpt(
  text: string,
  query: string,
  matchedTerms: string[],
): string {
  const searchNeedles = [
    normalizeForSearch(query),
    ...matchedTerms.map((term) => normalizeForSearch(term)),
  ].filter(Boolean);
  const normalizedText = normalizeForSearch(text);

  let offset = 0;
  for (const needle of searchNeedles) {
    const index = normalizedText.indexOf(needle);
    if (index >= 0) {
      offset = index;
      break;
    }
  }

  const start = Math.max(0, offset - 90);
  const end = Math.min(text.length, offset + 210);
  const excerpt = text.slice(start, end).replaceAll("_", " ").trim();

  if (start === 0 && end === text.length) {
    return excerpt;
  }

  return `${start > 0 ? "..." : ""}${excerpt}${end < text.length ? "..." : ""}`;
}

function scoreChunk(
  chunk: KnowledgeChunk,
  normalizedQuery: string,
  queryTerms: string[],
): { score: number; matchedTerms: string[] } {
  if (!normalizedQuery) {
    return { score: 0, matchedTerms: [] };
  }

  const normalizedTitle = normalizeForSearch(chunk.title);
  const matchedTerms: string[] = [];
  let score = 0;

  if (normalizedTitle.includes(normalizedQuery)) {
    score += 20;
  }

  if (chunk.normalizedText.includes(normalizedQuery)) {
    score += 12;
  }

  for (const term of queryTerms) {
    let termScore = 0;
    const titleHits = countOccurrences(normalizedTitle, term);
    const textHits = countOccurrences(chunk.normalizedText, term);

    if (titleHits > 0) {
      termScore += 6 + titleHits;
    }

    if (textHits > 0) {
      termScore += Math.min(8, textHits * 2);
    }

    if (termScore > 0) {
      matchedTerms.push(term);
      score += termScore;
    }
  }

  return {
    score,
    matchedTerms,
  };
}

@Injectable()
export class KnowledgeSearchService {
  private readonly index: BuiltKnowledgeIndex = GENERATED_KNOWLEDGE_INDEX;

  search(query: string, limit = 5): KnowledgeSearchResponse {
    const trimmedQuery = query.trim();
    const normalizedQuery = normalizeForSearch(trimmedQuery);
    const queryTerms = buildQueryTerms(trimmedQuery);
    const cappedLimit = Math.max(1, Math.min(limit, 10));

    const ranked = this.index.chunks
      .map((chunk) => {
        const { score, matchedTerms } = scoreChunk(
          chunk,
          normalizedQuery,
          queryTerms,
        );

        return {
          chunk,
          score,
          matchedTerms,
        };
      })
      .filter((item) => item.score > 0)
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }

        const leftStart =
          left.chunk.citation.lineStart ?? Number.MAX_SAFE_INTEGER;
        const rightStart =
          right.chunk.citation.lineStart ?? Number.MAX_SAFE_INTEGER;

        return leftStart - rightStart;
      })
      .slice(0, cappedLimit);

    const items: KnowledgeSearchResultSnippet[] = ranked.map((item) => ({
      snippetId: item.chunk.snippetId,
      score: item.score,
      title: item.chunk.title,
      excerpt: buildExcerpt(item.chunk.text, trimmedQuery, item.matchedTerms),
      matchedTerms: item.matchedTerms,
      citation: item.chunk.citation,
    }));

    return {
      query: trimmedQuery,
      generatedAt: new Date().toISOString(),
      corpusVersion: this.index.corpusVersion,
      totalHits: items.length,
      items,
    };
  }

  getIndexStats() {
    return {
      corpusVersion: this.index.corpusVersion,
      chunkCount: this.index.chunkCount,
      documentCount: this.index.documentCount,
    };
  }
}
