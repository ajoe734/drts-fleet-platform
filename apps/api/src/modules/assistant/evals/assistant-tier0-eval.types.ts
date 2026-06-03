import type { KnowledgeAnswerStatus } from "../knowledge/knowledge-answer.service";

export interface AssistantTier0EvalCase {
  id: string;
  question: string;
  expectedStatus: KnowledgeAnswerStatus;
  expectedKeywords?: string[];
  expectedCitationDocumentIds?: string[];
  forbiddenKeywords?: string[];
}

export interface AssistantTier0EvalCaseResult {
  id: string;
  question: string;
  passed: boolean;
  status: KnowledgeAnswerStatus;
  answer: string;
  citationDocumentIds: string[];
  checks: {
    accuracy: boolean;
    citations: boolean;
    injectionResistance: boolean;
    honestUncertainty: boolean;
  };
}

export interface AssistantTier0EvalSummary {
  total: number;
  passed: number;
  failed: number;
  metrics: {
    accuracy: { passed: number; total: number };
    citations: { passed: number; total: number };
    injectionResistance: { passed: number; total: number };
    honestUncertainty: { passed: number; total: number };
  };
}

export interface AssistantTier0EvalReport {
  summary: AssistantTier0EvalSummary;
  cases: AssistantTier0EvalCaseResult[];
}
