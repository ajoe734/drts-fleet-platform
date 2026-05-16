import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { AppText } from "./AppText";
import { Inline } from "./Stack";
import { driverTheme, resolveDriverTone, type DriverThemeTone } from "./theme";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "accent";

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  accentTone?: Extract<
    DriverThemeTone,
    "platform" | "ops" | "tenant" | "partner"
  >;
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

function resolveButtonPalette(
  variant: ButtonVariant,
  accentTone: ButtonProps["accentTone"],
) {
  if (variant === "secondary") {
    return {
      backgroundColor: driverTheme.colors.surfaceMuted,
      borderColor: driverTheme.colors.border,
      textColor: driverTheme.colors.textStrong,
      iconColor: driverTheme.colors.textStrong,
    };
  }

  if (variant === "ghost") {
    return {
      backgroundColor: "transparent",
      borderColor: "transparent",
      textColor: driverTheme.colors.primary,
      iconColor: driverTheme.colors.primary,
    };
  }

  const tone = resolveDriverTone(
    variant === "danger"
      ? "danger"
      : variant === "accent"
        ? (accentTone ?? "platform")
        : (accentTone ?? "owned"),
    driverTheme.mode,
  );

  return {
    backgroundColor: tone.foregroundColor,
    borderColor: tone.foregroundColor,
    textColor: driverTheme.colors.inverse,
    iconColor: driverTheme.colors.inverse,
  };
}

export function Button({
  label,
  onPress,
  variant = "primary",
  accentTone,
  icon,
  loading = false,
  disabled = false,
  style,
  textStyle,
}: ButtonProps) {
  const palette = resolveButtonPalette(variant, accentTone);
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: palette.backgroundColor,
          borderColor: palette.borderColor,
          opacity: isDisabled ? 0.5 : pressed ? 0.88 : 1,
        },
        variant === "ghost" ? styles.ghost : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.textColor} size="small" />
      ) : (
        <Inline gap={driverTheme.spacing.sm} justify="center">
          {icon ? (
            <Ionicons name={icon} size={18} color={palette.iconColor} />
          ) : null}
          <AppText
            variant="label"
            tone="inverse"
            style={[styles.label, { color: palette.textColor }, textStyle]}
          >
            {label}
          </AppText>
        </Inline>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: driverTheme.layout.touchTarget,
    borderRadius: driverTheme.radius.md,
    borderWidth: 1,
    paddingHorizontal: driverTheme.spacing.lg,
    paddingVertical: driverTheme.spacing.md,
    alignItems: "center",
    justifyContent: "center",
    ...driverTheme.shadows.sm,
  },
  ghost: {
    elevation: 0,
    shadowOpacity: 0,
  },
  label: {
    fontWeight: "600",
  },
});
