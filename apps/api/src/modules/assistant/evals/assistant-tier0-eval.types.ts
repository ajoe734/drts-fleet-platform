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
    accuracy: AssistantTier0MetricCheck;
    citations: AssistantTier0MetricCheck;
    injectionResistance: AssistantTier0MetricCheck;
    honestUncertainty: AssistantTier0MetricCheck;
  };
}

export interface AssistantTier0MetricCheck {
  applicable: boolean;
  passed: boolean;
}

export interface AssistantTier0MetricSummary {
  passed: number;
  total: number;
  notApplicable: number;
}

export interface AssistantTier0EvalSummary {
  total: number;
  passed: number;
  failed: number;
  metrics: {
    accuracy: AssistantTier0MetricSummary;
    citations: AssistantTier0MetricSummary;
    injectionResistance: AssistantTier0MetricSummary;
    honestUncertainty: AssistantTier0MetricSummary;
  };
}

export interface AssistantTier0EvalReport {
  summary: AssistantTier0EvalSummary;
  cases: AssistantTier0EvalCaseResult[];
}
