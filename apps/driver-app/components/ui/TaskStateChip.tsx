import React from "react";
import { StatusChip, type StatusChipVariant } from "./StatusChip";

export type TaskStateTone =
  | "needs_action"
  | "in_progress"
  | "platform_pending"
  | "platform_closed"
  | "sync_issue"
  | "default";

interface TaskStateChipProps {
  label: string;
  tone?: TaskStateTone;
}

function toStatusVariant(tone: TaskStateTone = "default"): StatusChipVariant {
  switch (tone) {
    case "needs_action":
      return "warning";
    case "in_progress":
      return "success";
    case "platform_pending":
      return "forwarded";
    case "platform_closed":
      return "default";
    case "sync_issue":
      return "danger";
    default:
      return "default";
  }
}

export function TaskStateChip({ label, tone = "default" }: TaskStateChipProps) {
  return <StatusChip label={label} variant={toStatusVariant(tone)} />;
}
