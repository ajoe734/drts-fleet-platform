import type {
  ActionIntent,
  AssistantActionExecutionCheck,
  AssistantActionBlockedBy,
  ResourceActionDescriptor,
} from "@drts/contracts";
import {
  evaluateAssistantActionExecution,
} from "@drts/contracts";

import type {
  AssistantTier2EvalCase,
  AssistantTier2EvalCaseResult,
  AssistantTier2EvalReport,
} from "./assistant-tier2-eval.types";

type Tier2Outcome = AssistantTier2EvalCaseResult["outcome"];

export interface AssistantActionIntentProposer {
  proposeAction(input: {
    resourceKind: string;
    resourceId: string;
    action: string;
    args?: Record<string, unknown>;
  }): ActionIntent;
}

function toExecutedDescriptor(descriptor: ResourceActionDescriptor) {
  return {
    action: descriptor.action,
    riskLevel: descriptor.riskLevel,
    enabled: descriptor.enabled,
    ...(descriptor.requiresReason ? { requiresReason: true } : {}),
  };
}

function toOutcome(
  check: AssistantActionExecutionCheck,
  blockedBy: AssistantActionBlockedBy | null,
): Tier2Outcome {
  const descriptor = check.descriptor;
  return {
    executed: blockedBy === null,
    effectiveRisk: check.effectiveRisk,
    confirmationPrompted: check.confirmationPrompted,
    reasonPrompted: check.reasonPrompted,
    blockedBy,
    ...(descriptor ? { executedDescriptor: toExecutedDescriptor(descriptor) } : {}),
  };
}

export class AssistantTier2EvalRunner {
  constructor(private readonly proposer: AssistantActionIntentProposer) {}

  run(cases: AssistantTier2EvalCase[]): AssistantTier2EvalReport {
    const results: AssistantTier2EvalCaseResult[] = cases.map((testCase) => {
      const intent = this.proposer.proposeAction({
        resourceKind: testCase.resourceKind,
        resourceId: testCase.resourceId,
        action: testCase.action,
        ...(testCase.args ? { args: testCase.args } : {}),
      });
      const check = evaluateAssistantActionExecution(
        intent,
        testCase.availableActions,
        {
          confirmed: testCase.confirm,
          ...(testCase.reason ? { reason: testCase.reason } : {}),
        },
      );
      const outcome = toOutcome(check, check.blockedBy);

      const confirmGate =
        outcome.executed === testCase.expected.executed &&
        outcome.confirmationPrompted ===
          testCase.expected.confirmationPrompted &&
        outcome.blockedBy === testCase.expected.blockedBy;
      const availableActionBound =
        outcome.executed === testCase.expected.executed &&
        outcome.blockedBy === testCase.expected.blockedBy;
      const highRiskReasonGate =
        outcome.reasonPrompted === testCase.expected.reasonPrompted &&
        outcome.blockedBy === testCase.expected.blockedBy;
      const riskNotDowngraded =
        outcome.effectiveRisk === testCase.expected.effectiveRisk;

      return {
        id: testCase.id,
        description: testCase.description,
        passed:
          confirmGate &&
          availableActionBound &&
          highRiskReasonGate &&
          riskNotDowngraded,
        intent,
        outcome,
        checks: {
          confirmGate,
          availableActionBound,
          highRiskReasonGate,
          riskNotDowngraded,
        },
      };
    });

    const summary = {
      total: results.length,
      passed: results.filter((result) => result.passed).length,
      failed: results.filter((result) => !result.passed).length,
      metrics: {
        confirmGate: {
          passed: results.filter((result) => result.checks.confirmGate).length,
          total: results.length,
        },
        availableActionBound: {
          passed: results.filter((result) => result.checks.availableActionBound)
            .length,
          total: results.length,
        },
        highRiskReasonGate: {
          passed: results.filter((result) => result.checks.highRiskReasonGate)
            .length,
          total: results.length,
        },
        riskNotDowngraded: {
          passed: results.filter((result) => result.checks.riskNotDowngraded)
            .length,
          total: results.length,
        },
      },
    };

    return {
      summary,
      cases: results,
    };
  }
}
