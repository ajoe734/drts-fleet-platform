import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { tokens } from "./tokens";

export type StatusTone =
  | "neutral"
  | "primary"
  | "success"
  | "warning"
  | "danger";

interface StatusChipProps {
  label: string;
  tone?: StatusTone;
}

export function StatusChip({ label, tone = "neutral" }: StatusChipProps) {
  return (
    <View style={[styles.base, styles[tone]]}>
      <Text style={[styles.text, styles[`${tone}Text` as keyof typeof styles]]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: tokens.spacing[8],
    paddingVertical: tokens.spacing[2],
    borderRadius: tokens.radius.xs,
    alignSelf: "flex-start",
  },
  text: {
    ...tokens.type.micro,
    fontWeight: "600",
  },
  neutral: {
    backgroundColor: tokens.colors.surfaceMuted,
  },
  neutralText: {
    color: tokens.colors.textMuted,
  },
  primary: {
    backgroundColor: tokens.colors.surfaceMuted, // Using muted as bg for subtle chips
    borderWidth: 1,
    borderColor: tokens.colors.primary,
  },
  primaryText: {
    color: tokens.colors.primary,
  },
  success: {
    backgroundColor: "#DCFCE7", // subtle success bg
  },
  successText: {
    color: tokens.colors.success,
  },
  warning: {
    backgroundColor: tokens.colors.surfaceWarning,
  },
  warningText: {
    color: tokens.colors.warning,
  },
  danger: {
    backgroundColor: tokens.colors.surfaceDanger,
  },
  dangerText: {
    color: tokens.colors.danger,
  },
});
