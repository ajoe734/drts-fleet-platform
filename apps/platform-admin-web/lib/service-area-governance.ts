/**
 * Helpers for the Platform Admin `/service-area-governance` route.
 *
 * Normal taxi service-area governance only. Phase 2 sandbox ODD/operating-area
 * governance is a separate authority (see `lib/sandbox-governance.ts`) and must
 * not be conflated here.
 */

import type {
  ServiceAreaGeometry,
  ServiceAreaRecordStatus,
  StopPolicyDirection,
  StopPolicyEffect,
  ServiceAreaEvaluationDecision,
} from "@drts/contracts";

export type StatusTone = "neutral" | "info" | "success" | "warn" | "danger";

export function statusToneOf(status: ServiceAreaRecordStatus): StatusTone {
  switch (status) {
    case "active":
      return "success";
    case "review":
      return "info";
    case "retired":
      return "neutral";
    case "draft":
    default:
      return "warn";
  }
}

export function statusLabelKey(status: ServiceAreaRecordStatus): string {
  return `serviceAreaGov.status.${status}`;
}

export function directionLabelKey(direction: StopPolicyDirection): string {
  return `serviceAreaGov.direction.${direction}`;
}

export function effectLabelKey(effect: StopPolicyEffect): string {
  return `serviceAreaGov.effect.${effect}`;
}

export function effectTone(effect: StopPolicyEffect): StatusTone {
  switch (effect) {
    case "allow":
      return "success";
    case "deny":
      return "danger";
    case "manual_review":
    default:
      return "warn";
  }
}

export function decisionTone(
  decision: ServiceAreaEvaluationDecision,
): StatusTone {
  switch (decision) {
    case "serviceable":
      return "success";
    case "not_serviceable":
      return "danger";
    case "manual_review":
    default:
      return "warn";
  }
}

export function decisionLabelKey(
  decision: ServiceAreaEvaluationDecision,
): string {
  return `serviceAreaGov.decision.${decision}`;
}

/** Short human summary of a geometry payload for list/version rows. */
export function geometrySummary(geometry: ServiceAreaGeometry): string {
  if (geometry.type === "circle") {
    return `circle · r=${Math.round(geometry.radiusMeters)}m`;
  }
  return `polygon · ${geometry.coordinates.length} pts`;
}

/** "YYYY-MM-DD" from an ISO string, or an open-ended marker. */
export function formatEffective(
  effectiveFrom: string,
  effectiveUntil: string | null,
  openEndedLabel: string,
): string {
  const from = effectiveFrom.slice(0, 10);
  const to = effectiveUntil ? effectiveUntil.slice(0, 10) : openEndedLabel;
  return `${from} → ${to}`;
}

export function isMutableStatus(status: ServiceAreaRecordStatus): boolean {
  // Only draft/review records accept content updates; active/retired do not.
  return status === "draft" || status === "review";
}
