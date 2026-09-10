import type { ReactNode } from "react";
import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import type { DriverLeaveStatus, DriverLeaveType } from "@drts/contracts";
import {
  DRV_LEAVE_STATUS,
  DRV_LEAVE_TYPE,
  type LeaveStatusMeta,
  type LeaveTypeMeta,
} from "./leave-tokens";
import {
  Pill,
  driverCanvasTheme,
  type DriverCanvasTheme,
} from "../canvas-primitives";

export interface LeaveTypeChipProps {
  type: DriverLeaveType;
  theme?: DriverCanvasTheme;
  style?: StyleProp<ViewStyle>;
}

export function LeaveTypeChip({
  type,
  theme = driverCanvasTheme,
  style,
}: LeaveTypeChipProps) {
  const meta: LeaveTypeMeta = DRV_LEAVE_TYPE[type] ?? {
    zh: type,
    tone: "neutral",
    code: type,
  };

  return (
    <Pill theme={theme} tone={meta.tone} style={style}>
      <Text style={[styles.text, { color: theme.text, fontFamily: theme.fontFamily }]}>
        {meta.zh}
        <Text
          style={[
            styles.code,
            {
              fontFamily: theme.monoFamily,
              color: theme.textDim,
            },
          ]}
        >
          {" "}{type}
        </Text>
      </Text>
    </Pill>
  );
}

export interface LeaveStatusChipProps {
  status: DriverLeaveStatus;
  theme?: DriverCanvasTheme;
  style?: StyleProp<ViewStyle>;
}

export function LeaveStatusChip({
  status,
  theme = driverCanvasTheme,
  style,
}: LeaveStatusChipProps) {
  const meta: LeaveStatusMeta = DRV_LEAVE_STATUS[status] ?? {
    zh: status,
    tone: "neutral",
    code: status,
  };

  return (
    <Pill theme={theme} tone={meta.tone} dot style={style}>
      <Text style={[styles.text, { color: theme.text, fontFamily: theme.fontFamily }]}>
        {meta.zh}
        <Text
          style={[
            styles.code,
            {
              fontFamily: theme.monoFamily,
              color: theme.textDim,
            },
          ]}
        >
          {" "}{status}
        </Text>
      </Text>
    </Pill>
  );
}

const styles = StyleSheet.create({
  text: {
    fontSize: 11.5,
    fontWeight: "600",
  },
  code: {
    fontSize: 9.5,
  },
});
