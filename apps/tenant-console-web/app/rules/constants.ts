import type { TenantApprovalEvaluationResult } from "@drts/contracts";

export type RulesFlashPayload = {
  tone: "default" | "warning";
  title: string;
  description: string;
  evaluation?: TenantApprovalEvaluationResult;
};
