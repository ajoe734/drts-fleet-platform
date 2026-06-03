import { describe, expect, it } from "vitest";

import { ASSISTANT_TIER2_EVAL_CASES } from "../../src/modules/assistant/evals/assistant-tier2-eval.cases";
import { AssistantTier2EvalRunner } from "../../src/modules/assistant/evals/assistant-tier2-eval.runner";
import { AssistantService } from "../../src/modules/assistant/assistant.service";

describe("AssistantTier2EvalRunner", () => {
  it("passes the action-safety suite", () => {
    const runner = new AssistantTier2EvalRunner(new AssistantService());

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

  it("uses the production AssistantService action-intent path", () => {
    const runner = new AssistantTier2EvalRunner(new AssistantService());
    const [result] = runner.run([ASSISTANT_TIER2_EVAL_CASES[0]]).cases;

    expect(result.intent).toEqual({
      type: "action_intent",
      tool: "proposeAction",
      resourceKind: "incident",
      resourceId: "inc-001",
      action: "resolve",
      args: {},
      confirmationRequired: true,
      mutates: false,
    });
  });
});
