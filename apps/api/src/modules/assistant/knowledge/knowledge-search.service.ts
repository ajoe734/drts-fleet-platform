import { Injectable } from "@nestjs/common";

export interface KnowledgeCitation {
  documentId: string;
  sectionTitle?: string;
}

export interface KnowledgeSearchResultSnippet {
  snippetId: string;
  score: number;
  title: string;
  excerpt: string;
  matchedTerms: string[];
  citation: KnowledgeCitation;
}

export interface KnowledgeSearchResponse {
  query: string;
  generatedAt: string;
  corpusVersion: string;
  totalHits: number;
  items: KnowledgeSearchResultSnippet[];
}

type KnowledgeSnippetRecord = {
  snippetId: string;
  title: string;
  text: string;
  citation: KnowledgeCitation;
};

const KNOWLEDGE_SNIPPETS: KnowledgeSnippetRecord[] = [
  {
    snippetId: "operator-routing-runbook:exception-hold",
    title: "Exception hold handling",
    text: "Exception hold is the queue state used when an order is blocked by an active incident or manual compliance intervention. Dispatchers should review the linked incident, decide whether to cancel or release the order, and capture an audit trail before resuming matching.",
    citation: {
      documentId: "operator-routing-runbook",
      sectionTitle: "Exception hold",
    },
  },
  {
    snippetId: "ops-console-handoff-packet:approval-queue",
    title: "Approval queue visibility",
    text: "The approval queue lives in the Ops Console approval requests screen. It is visible to ops compliance, ops manager, and approval-triage roles. Other ops roles should not see approval-request mutation controls.",
    citation: {
      documentId: "ops-console-handoff-packet",
      sectionTitle: "Approval queue",
    },
  },
  {
    snippetId: "ops-console-handoff-packet:artifact-expired",
    title: "Artifact expired",
    text: "When an artifact expires or a screenshot deep link returns 404, the UI should show a visual fallback and direct the operator to refresh the evidence panel rather than pretending the artifact still exists.",
    citation: {
      documentId: "ops-console-handoff-packet",
      sectionTitle: "Evidence fallback",
    },
  },
];

function normalize(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, " ");
}

function buildTerms(query: string) {
  return normalize(query)
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2);
}

function scoreSnippet(
  snippet: KnowledgeSnippetRecord,
  query: string,
  terms: string[],
) {
  const normalizedTitle = normalize(snippet.title);
  const normalizedText = normalize(snippet.text);
  const normalizedQuery = normalize(query).trim();
  const matchedTerms = terms.filter(
    (term) =>
      normalizedTitle.includes(term) || normalizedText.includes(term),
  );

  let score = 0;
  if (normalizedQuery && normalizedText.includes(normalizedQuery)) {
    score += 18;
  }
  if (normalizedQuery && normalizedTitle.includes(normalizedQuery)) {
    score += 24;
  }
  score += matchedTerms.length * 6;

  return { score, matchedTerms };
}

@Injectable()
export class KnowledgeSearchService {
  search(query: string, limit = 5): KnowledgeSearchResponse {
    const trimmedQuery = query.trim();
    const terms = buildTerms(trimmedQuery);
    const items = KNOWLEDGE_SNIPPETS.map((snippet) => {
      const { score, matchedTerms } = scoreSnippet(snippet, trimmedQuery, terms);
      return {
        snippetId: snippet.snippetId,
        score,
        title: snippet.title,
        excerpt: snippet.text,
        matchedTerms,
        citation: snippet.citation,
      };
    })
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, Math.max(1, Math.min(limit, 10)));

    return {
      query: trimmedQuery,
      generatedAt: new Date().toISOString(),
      corpusVersion: "assistant-tier0-fixture-v1",
      totalHits: items.length,
      items,
    };
  }
}
