import { Injectable } from "@nestjs/common";

import type {
  KnowledgeSearchResponse,
  KnowledgeSearchSnippetRecord,
} from "@drts/contracts";

import { GENERATED_KNOWLEDGE_CORPUS } from "./generated/knowledge-corpus.generated";
import {
  normalizeKnowledgeText,
  tokenizeKnowledgeText,
} from "./knowledge-builder";
import { toKnowledgeCitation } from "./knowledge-internal.types";

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 10;

function sanitizeLimit(limit: number | undefined): number {
  if (limit === undefined || Number.isNaN(limit) || !Number.isFinite(limit)) {
    return DEFAULT_LIMIT;
  }

  return Math.max(1, Math.min(MAX_LIMIT, Math.trunc(limit)));
}

@Injectable()
export class KnowledgeSearchService {
  search(query: string, limit = DEFAULT_LIMIT): KnowledgeSearchResponse {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return {
        corpusVersion: GENERATED_KNOWLEDGE_CORPUS.corpusVersion,
        query: trimmedQuery,
        totalHits: 0,
        snippets: [],
      };
    }

    const queryTerms = tokenizeKnowledgeText(trimmedQuery);
    const normalizedQuery = normalizeKnowledgeText(trimmedQuery);
    const cappedLimit = sanitizeLimit(limit);

    const ranked = GENERATED_KNOWLEDGE_CORPUS.chunks
      .map((chunk) => {
        const matchedTerms = queryTerms.filter(
          (term) =>
            chunk.terms.includes(term) || chunk.normalizedText.includes(term),
        );
        const exactPhraseBoost = chunk.normalizedText.includes(normalizedQuery)
          ? 4
          : 0;
        const sectionBoost =
          chunk.section &&
          normalizeKnowledgeText(chunk.section).includes(normalizedQuery)
            ? 2
            : 0;
        const titleBoost = normalizeKnowledgeText(chunk.title).includes(
          normalizedQuery,
        )
          ? 2
          : 0;
        const score = matchedTerms.length * 3 + exactPhraseBoost + sectionBoost + titleBoost;

        return { chunk, matchedTerms, score };
      })
      .filter((item) => item.score > 0)
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }
        return left.chunk.snippetId.localeCompare(right.chunk.snippetId);
      });

    const snippets: KnowledgeSearchSnippetRecord[] = ranked
      .slice(0, cappedLimit)
      .map(({ chunk, matchedTerms, score }) => ({
        snippetId: chunk.snippetId,
        score,
        text: chunk.text,
        matchedTerms,
        citation: toKnowledgeCitation(chunk),
      }));

    return {
      corpusVersion: GENERATED_KNOWLEDGE_CORPUS.corpusVersion,
      query: trimmedQuery,
      totalHits: ranked.length,
      snippets,
    };
  }
}
