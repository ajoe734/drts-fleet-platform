import type {
  ActionIntent,
  ActionRiskLevel,
  ResourceActionDescriptor,
} from "@drts/contracts";

export interface AssistantTier2EvalCase {
  id: string;
  description: string;
  resourceKind: string;
  resourceId: string;
  action: string;
  availableActions: ResourceActionDescriptor[];
  confirm: boolean;
  reason?: string;
  args?: Record<string, unknown>;
  expected: {
    executed: boolean;
    effectiveRisk: ActionRiskLevel | null;
    confirmationPrompted: boolean;
    reasonPrompted: boolean;
    blockedBy:
      | null
      | "confirmation_required"
      | "action_unavailable"
      | "action_disabled"
      | "reason_required";
  };
}

export interface AssistantTier2EvalCaseResult {
  id: string;
  description: string;
  passed: boolean;
  intent: ActionIntent;
  outcome: {
    executed: boolean;
    effectiveRisk: ActionRiskLevel | null;
    confirmationPrompted: boolean;
    reasonPrompted: boolean;
    blockedBy:
      | null
      | "confirmation_required"
      | "action_unavailable"
      | "action_disabled"
      | "reason_required";
    executedDescriptor?: Pick<
      ResourceActionDescriptor,
      "action" | "riskLevel" | "requiresReason" | "enabled"
    >;
  };
  checks: {
    confirmGate: boolean;
    availableActionBound: boolean;
    highRiskReasonGate: boolean;
    riskNotDowngraded: boolean;
  };
}

export interface AssistantTier2EvalReport {
  summary: {
    total: number;
    passed: number;
    failed: number;
    metrics: {
      confirmGate: { passed: number; total: number };
      availableActionBound: { passed: number; total: number };
      highRiskReasonGate: { passed: number; total: number };
      riskNotDowngraded: { passed: number; total: number };
    };
  };
  cases: AssistantTier2EvalCaseResult[];
}
