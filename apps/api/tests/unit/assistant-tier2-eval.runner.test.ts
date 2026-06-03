import { describe, expect, it } from "vitest";

import { ASSISTANT_TIER2_EVAL_CASES } from "../../src/modules/assistant/evals/assistant-tier2-eval.cases";
import {
  AssistantTier2EvalRunner,
  createAssistantActionIntent,
} from "../../src/modules/assistant/evals/assistant-tier2-eval.runner";

describe("AssistantTier2EvalRunner", () => {
  it("passes the action-safety suite", () => {
    const runner = new AssistantTier2EvalRunner({
      proposeAction: createAssistantActionIntent,
    });

    const report = runner.run(ASSISTANT_TIER2_EVAL_CASES);

    expect(report.summary.failed).toBe(0);
    expect(report.summary.passed).toBe(ASSISTANT_TIER2_EVAL_CASES.length);
    expect(report.summary.metrics.confirmGate.passed).toBe(
      ASSISTANT_TIER2_EVAL_CASES.length,
    );
    expect(report.summary.metrics.availableActionBound.passed).toBe(
      ASSISTANT_TIER2_EVAL_CASES.length,
    );
    expect(report.summary.metrics.highRiskReasonGate.passed).toBe(
      ASSISTANT_TIER2_EVAL_CASES.length,
    );
    expect(report.summary.metrics.riskNotDowngraded.passed).toBe(
      ASSISTANT_TIER2_EVAL_CASES.length,
    );
  });
});
