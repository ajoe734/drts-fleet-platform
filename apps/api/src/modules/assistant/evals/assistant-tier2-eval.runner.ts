import type {
  ActionIntent,
  ProposeActionToolInput,
  ResourceActionDescriptor,
} from "@drts/contracts";

import type {
  AssistantTier2EvalCase,
  AssistantTier2EvalCaseResult,
  AssistantTier2EvalReport,
} from "./assistant-tier2-eval.types";

type Tier2Outcome = AssistantTier2EvalCaseResult["outcome"];

export interface AssistantActionIntentProposer {
  proposeAction(input: ProposeActionToolInput): ActionIntent;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requireNonBlank(value: string, field: string) {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error(`Assistant proposeAction requires a non-empty ${field}.`);
  }
  return normalized;
}

export function createAssistantActionIntent(
  input: ProposeActionToolInput,
): ActionIntent {
  return {
    type: "action_intent",
    tool: "proposeAction",
    resourceKind: requireNonBlank(input.resourceKind, "resourceKind"),
    resourceId: requireNonBlank(input.resourceId, "resourceId"),
    action: requireNonBlank(input.action, "action"),
    args:
      input.args === undefined
        ? {}
        : isPlainObject(input.args)
          ? structuredClone(input.args)
          : (() => {
              throw new Error("Assistant proposeAction args must be an object.");
            })(),
    confirmationRequired: true,
    mutates: false,
  };
}

function toExecutedDescriptor(descriptor: ResourceActionDescriptor) {
  return {
    action: descriptor.action,
    riskLevel: descriptor.riskLevel,
    enabled: descriptor.enabled,
    ...(descriptor.requiresReason ? { requiresReason: true } : {}),
  };
}

function findDescriptor(
  intent: ActionIntent,
  availableActions: ResourceActionDescriptor[],
) {
  return (
    availableActions.find((descriptor) => descriptor.action === intent.action) ??
    null
  );
}

function executeIntent(
  intent: ActionIntent,
  availableActions: ResourceActionDescriptor[],
  confirm: boolean,
  reason?: string,
): Tier2Outcome {
  const descriptor = findDescriptor(intent, availableActions);

  if (!descriptor) {
    return {
      executed: false,
      effectiveRisk: null,
      confirmationPrompted: false,
      reasonPrompted: false,
      blockedBy: "action_unavailable",
    };
  }

  const confirmationPrompted = descriptor.riskLevel !== "low";
  const reasonPrompted =
    descriptor.riskLevel === "high" || Boolean(descriptor.requiresReason);

  if (!descriptor.enabled) {
    return {
      executed: false,
      effectiveRisk: descriptor.riskLevel,
      confirmationPrompted,
      reasonPrompted,
      blockedBy: "action_disabled",
      executedDescriptor: toExecutedDescriptor(descriptor),
    };
  }

  if (!confirm) {
    return {
      executed: false,
      effectiveRisk: descriptor.riskLevel,
      confirmationPrompted,
      reasonPrompted,
      blockedBy: "confirmation_required",
      executedDescriptor: toExecutedDescriptor(descriptor),
    };
  }

  if (reasonPrompted && !reason?.trim()) {
    return {
      executed: false,
      effectiveRisk: descriptor.riskLevel,
      confirmationPrompted,
      reasonPrompted,
      blockedBy: "reason_required",
      executedDescriptor: toExecutedDescriptor(descriptor),
    };
  }

  return {
    executed: true,
    effectiveRisk: descriptor.riskLevel,
    confirmationPrompted,
    reasonPrompted,
    blockedBy: null,
    executedDescriptor: toExecutedDescriptor(descriptor),
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
      const outcome = executeIntent(
        intent,
        testCase.availableActions,
        testCase.confirm,
        testCase.reason,
      );

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
