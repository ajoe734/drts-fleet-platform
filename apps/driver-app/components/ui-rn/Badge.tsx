import React from "react";
import {
  StyleSheet,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import { AppText } from "./AppText";
import {
  driverTheme,
  resolveDriverTone,
  resolveForwardedStatusLabel,
  resolveForwardedStatusTone,
  type DriverLocale,
  type DriverThemeTone,
} from "./theme";
import type { ForwardedStatus } from "@drts/ui-tokens";

type LabeledBadgeProps = {
  label: string;
  tone?: DriverThemeTone;
  forwardedStatus?: never;
  locale?: never;
  strong?: boolean;
  dot?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

type ForwardedStatusBadgeProps = {
  forwardedStatus: ForwardedStatus;
  locale?: DriverLocale;
  label?: never;
  tone?: never;
  strong?: boolean;
  dot?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

export type BadgeProps = LabeledBadgeProps | ForwardedStatusBadgeProps;

export function Badge(props: BadgeProps) {
  const strong = props.strong ?? false;
  const dot = props.dot ?? false;
  const forwardedStatus =
    "forwardedStatus" in props ? props.forwardedStatus : undefined;
  const resolvedTone = forwardedStatus
    ? resolveForwardedStatusTone(forwardedStatus, driverTheme.mode)
    : props.tone
      ? resolveDriverTone(props.tone, driverTheme.mode)
      : undefined;
  const label = forwardedStatus
    ? resolveForwardedStatusLabel(forwardedStatus, props.locale ?? "zhTW")
    : props.label;

  const backgroundColor = strong
    ? (resolvedTone?.foregroundColor ?? driverTheme.colors.textStrong)
    : (resolvedTone?.backgroundColor ?? driverTheme.colors.surfaceMuted);
  const borderColor = strong
    ? (resolvedTone?.foregroundColor ?? driverTheme.colors.textStrong)
    : (resolvedTone?.borderColor ?? driverTheme.colors.border);
  const textColor = strong
    ? driverTheme.colors.inverse
    : (resolvedTone?.foregroundColor ?? driverTheme.colors.textMuted);
  const dotColor = strong ? driverTheme.colors.inverse : textColor;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor,
          borderColor,
        },
        props.style,
      ]}
    >
      {dot ? (
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
      ) : null}
      <AppText
        variant="micro"
        style={[styles.text, { color: textColor }, props.textStyle]}
      >
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: driverTheme.spacing.xs,
    minHeight: 22,
    paddingHorizontal: driverTheme.spacing.sm,
    paddingVertical: 4,
    borderRadius: driverTheme.radius.pill,
    borderWidth: 1,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: driverTheme.radius.full,
  },
  text: {
    color: driverTheme.colors.textMuted,
  },
});
