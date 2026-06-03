import { Injectable } from "@nestjs/common";

import {
  KnowledgeSearchService,
  type KnowledgeCitation,
  type KnowledgeSearchResultSnippet,
} from "./knowledge-search.service";

export type KnowledgeAnswerStatus = "answered" | "unknown" | "refused";

export interface KnowledgeAnswerResponse {
  status: KnowledgeAnswerStatus;
  answer: string;
  citations: KnowledgeCitation[];
  matchedSnippetIds: string[];
  refusalReason: "prompt_injection" | null;
}

const MIN_CONFIDENT_SCORE = 18;
const UNKNOWN_MESSAGE =
  "我無法根據目前核准文件確認這個問題。請改用更具體的畫面、隊列、狀態碼或流程名稱再試一次。";
const INJECTION_PATTERNS = [
  /ignore (all|any|previous|prior) instructions/i,
  /reveal .*system prompt/i,
  /show .*system prompt/i,
  /api key/i,
  /token/i,
  /忽略.*指示/u,
  /透露.*(系統提示|system prompt|金鑰|密鑰|秘密)/u,
];

function uniqueCitations(
  snippets: KnowledgeSearchResultSnippet[],
): KnowledgeCitation[] {
  const seen = new Set<string>();
  const citations: KnowledgeCitation[] = [];

  for (const snippet of snippets) {
    const key = `${snippet.citation.documentId}:${snippet.citation.sectionTitle ?? ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    citations.push(snippet.citation);
  }

  return citations;
}

@Injectable()
export class KnowledgeAnswerService {
  constructor(
    private readonly knowledgeSearchService: KnowledgeSearchService,
  ) {}

  answer(question: string): KnowledgeAnswerResponse {
    const trimmedQuestion = question.trim();

    if (!trimmedQuestion) {
      return {
        status: "unknown",
        answer: UNKNOWN_MESSAGE,
        citations: [],
        matchedSnippetIds: [],
        refusalReason: null,
      };
    }

    if (INJECTION_PATTERNS.some((pattern) => pattern.test(trimmedQuestion))) {
      return {
        status: "refused",
        answer:
          "我不能回應要求忽略規則、揭露 system prompt 或憑證的指令。若要查 DRTS 營運知識，請直接描述業務問題。",
        citations: [],
        matchedSnippetIds: [],
        refusalReason: "prompt_injection",
      };
    }

    const result = this.knowledgeSearchService.search(trimmedQuestion, 3);
    const topHit = result.items[0];

    if (!topHit || topHit.score < MIN_CONFIDENT_SCORE) {
      return {
        status: "unknown",
        answer: UNKNOWN_MESSAGE,
        citations: [],
        matchedSnippetIds: [],
        refusalReason: null,
      };
    }

    const supportingHits = result.items.filter(
      (item, index) => index === 0 || item.score >= MIN_CONFIDENT_SCORE - 2,
    );
    const lead = topHit.excerpt.replace(/\s+/g, " ").trim();
    const supporting = supportingHits[1]
      ? ` 補充：${supportingHits[1].excerpt.replace(/\s+/g, " ").trim()}`
      : "";

    return {
      status: "answered",
      answer: `根據目前核准文件，${lead}${supporting}`,
      citations: uniqueCitations(supportingHits),
      matchedSnippetIds: supportingHits.map((item) => item.snippetId),
      refusalReason: null,
    };
  }
}
