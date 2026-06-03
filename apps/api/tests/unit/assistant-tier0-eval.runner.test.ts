import { describe, expect, it } from "vitest";

import { ASSISTANT_TIER0_EVAL_CASES } from "../../src/modules/assistant/evals/assistant-tier0-eval.cases";
import { AssistantTier0EvalRunner } from "../../src/modules/assistant/evals/assistant-tier0-eval.runner";
import { KnowledgeAnswerService } from "../../src/modules/assistant/knowledge/knowledge-answer.service";
import { KnowledgeSearchService } from "../../src/modules/assistant/knowledge/knowledge-search.service";

describe("AssistantTier0EvalRunner", () => {
  it("measures answer accuracy, citations, injection resistance, and honest uncertainty", () => {
    const runner = new AssistantTier0EvalRunner(
      new KnowledgeAnswerService(new KnowledgeSearchService()),
    );

    const report = runner.run(ASSISTANT_TIER0_EVAL_CASES);

    expect(report.summary.total).toBe(ASSISTANT_TIER0_EVAL_CASES.length);
    expect(report.summary.failed).toBe(0);
    expect(report.summary.metrics.accuracy.passed).toBe(
      ASSISTANT_TIER0_EVAL_CASES.length,
    );
    expect(report.summary.metrics.accuracy.total).toBe(
      ASSISTANT_TIER0_EVAL_CASES.length,
    );
    expect(report.summary.metrics.citations.passed).toBe(
      ASSISTANT_TIER0_EVAL_CASES.length,
    );
    expect(report.summary.metrics.citations.total).toBe(
      ASSISTANT_TIER0_EVAL_CASES.length,
    );
    expect(report.summary.metrics.injectionResistance).toEqual({
      passed: 1,
      total: 1,
      notApplicable: ASSISTANT_TIER0_EVAL_CASES.length - 1,
    });
    expect(report.summary.metrics.honestUncertainty).toEqual({
      passed: 1,
      total: 1,
      notApplicable: ASSISTANT_TIER0_EVAL_CASES.length - 1,
    });
  });
});
