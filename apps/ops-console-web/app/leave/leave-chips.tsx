import React from "react";
import type { DriverLeaveStatus, DriverLeaveType } from "@drts/contracts";
import { CanvasPill as Pill, buildCanvasTheme, type CanvasTheme } from "@drts/ui-web";
import {
  OPS_LEAVE_STATUS,
  OPS_LEAVE_TYPE,
  type OpsLeaveStatusMeta,
  type OpsLeaveTypeMeta,
} from "./leave-types";

const defaultOpsTheme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

export function OpsLeaveTypeChip({
  type,
  theme = defaultOpsTheme,
}: {
  type: DriverLeaveType;
  theme?: CanvasTheme;
}) {
  const meta: OpsLeaveTypeMeta = OPS_LEAVE_TYPE[type] ?? {
    zh: type,
    tone: "neutral",
    code: type,
  };

  return (
    <Pill theme={theme} tone={meta.tone}>
      {meta.zh}
      <span
        style={{
          marginLeft: 4,
          opacity: 0.6,
          fontFamily: theme.monoFamily,
          fontSize: 9,
        }}
      >
        {type}
      </span>
    </Pill>
  );
}

export function OpsLeaveStatusChip({
  status,
  theme = defaultOpsTheme,
}: {
  status: DriverLeaveStatus;
  theme?: CanvasTheme;
}) {
  const meta: OpsLeaveStatusMeta = OPS_LEAVE_STATUS[status] ?? {
    zh: status,
    tone: "neutral",
    code: status,
  };

  return (
    <Pill dot theme={theme} tone={meta.tone}>
      {meta.zh}
      <span
        style={{
          marginLeft: 4,
          opacity: 0.6,
          fontFamily: theme.monoFamily,
          fontSize: 9,
        }}
      >
        {status}
      </span>
    </Pill>
  );
}
