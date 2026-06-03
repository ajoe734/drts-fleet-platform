"use client";

import type { CSSProperties, ReactNode } from "react";
import { buildCanvasTheme } from "@drts/ui-web";

export const assistantTheme = buildCanvasTheme({
  surface: "platform",
  density: "compact",
});

export type AssistantViewState =
  | "idle"
  | "thinking"
  | "planning"
  | "awaiting_confirmation"
  | "executing"
  | "receipt"
  | "error";

export type AssistantMessageRole = "user" | "assistant" | "system";
export type AssistantRiskLevel = "low" | "medium" | "high";
export type AssistantStepStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "blocked";
export type AssistantReceiptStatus =
  | "accepted"
  | "completed"
  | "failed"
  | "queued";

export interface AssistantActionPlanStep {
  id: string;
  title: string;
  detail?: string | null;
  status: AssistantStepStatus;
}

export interface AssistantActionPlan {
  title: string;
  summary?: string | null;
  rationale?: string | null;
  resourceLabel?: string | null;
  riskLevel?: AssistantRiskLevel;
  steps: AssistantActionPlanStep[];
  warnings?: string[];
  footer?: ReactNode;
}

export interface AssistantConfirmationRequest {
  title: string;
  message: string;
  riskLevel: AssistantRiskLevel;
  resourceLabel?: string | null;
  confirmLabel?: string;
  cancelLabel?: string;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  reasonHint?: string | null;
  requiresReason?: boolean;
}

export interface AssistantReceipt {
  title?: string | null;
  message?: string | null;
  actionId?: string | null;
  requestId?: string | null;
  auditId?: string | null;
  resourceLabel?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  status: AssistantReceiptStatus;
  auditHref?: string | null;
}

export interface AssistantErrorState {
  title?: string | null;
  message: string;
  hint?: string | null;
}

export interface AssistantMessageRecord {
  id: string;
  role: AssistantMessageRole;
  content: string;
  createdAt?: string | null;
  state?: AssistantViewState;
  plan?: AssistantActionPlan | null;
  confirmation?: AssistantConfirmationRequest | null;
  receipt?: AssistantReceipt | null;
  error?: AssistantErrorState | null;
}

export function assistantStatusTone(state: AssistantViewState) {
  switch (state) {
    case "thinking":
    case "planning":
      return "info";
    case "awaiting_confirmation":
      return "warn";
    case "executing":
      return "accent";
    case "receipt":
      return "success";
    case "error":
      return "danger";
    case "idle":
    default:
      return "neutral";
  }
}

export function assistantRiskTone(risk: AssistantRiskLevel) {
  switch (risk) {
    case "high":
      return "danger";
    case "medium":
      return "warn";
    case "low":
    default:
      return "info";
  }
}

export function assistantReceiptTone(status: AssistantReceiptStatus) {
  switch (status) {
    case "completed":
      return "success";
    case "accepted":
    case "queued":
      return "info";
    case "failed":
    default:
      return "danger";
  }
}

export function assistantStepTone(status: AssistantStepStatus) {
  switch (status) {
    case "completed":
      return "success";
    case "in_progress":
      return "info";
    case "blocked":
      return "danger";
    case "pending":
    default:
      return "neutral";
  }
}

export const assistantCardStyle: CSSProperties = {
  borderRadius: 18,
  border: `1px solid ${assistantTheme.border}`,
  background: assistantTheme.surface,
  boxShadow: "0 18px 48px rgba(15, 23, 42, 0.08)",
};

export const assistantInsetStyle: CSSProperties = {
  borderRadius: 14,
  border: `1px solid ${assistantTheme.border}`,
  background: assistantTheme.surfaceLo,
};

export const assistantMutedTextStyle: CSSProperties = {
  color: assistantTheme.textMuted,
  fontSize: 12.5,
  lineHeight: 1.5,
};

export const assistantMonoTextStyle: CSSProperties = {
  fontFamily: assistantTheme.monoFamily,
  fontSize: 11.5,
};
