import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { tokens } from "./tokens";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

interface ActionButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: keyof typeof Ionicons.glyphMap;
  isLoading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
}

export function ActionButton({
  label,
  onPress,
  variant = "primary",
  icon,
  isLoading,
  disabled,
  fullWidth = true,
}: ActionButtonProps) {
  const iconColor =
    variant === "primary" || variant === "danger"
      ? tokens.colors.textInverse
      : tokens.colors.primary;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || isLoading}
      style={({ pressed }) => [
        styles.base,
        fullWidth && styles.fullWidth,
        variantStyles[variant],
        pressed && pressedStyles[variant],
        (disabled || isLoading) && styles.disabled,
      ]}
    >
      <View style={styles.content}>
        {isLoading ? (
          <ActivityIndicator size="small" color={iconColor} />
        ) : (
          <>
            {icon && (
              <Ionicons
                name={icon}
                size={18}
                color={iconColor}
                style={styles.icon}
              />
            )}
            <Text
              style={[
                styles.text,
                textStyles[variant],
                disabled && styles.disabledText,
              ]}
            >
              {label}
            </Text>
          </>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: tokens.radius.md,
    paddingVertical: tokens.spacing[12],
    paddingHorizontal: tokens.spacing[20],
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  fullWidth: {
    alignSelf: "stretch",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
  },
  icon: {
    marginRight: tokens.spacing[8],
  },
  text: {
    ...tokens.type.bodyBold,
  },
  primary: {
    backgroundColor: tokens.colors.primary,
  },
  primaryPressed: {
    backgroundColor: tokens.colors.primaryPressed,
  },
  primaryText: {
    color: tokens.colors.textInverse,
  },
  secondary: {
    backgroundColor: tokens.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  secondaryPressed: {
    backgroundColor: tokens.colors.border,
  },
  secondaryText: {
    color: tokens.colors.textStrong,
  },
  danger: {
    backgroundColor: tokens.colors.danger,
  },
  dangerPressed: {
    backgroundColor: tokens.colors.danger, // Could use a darker shade if available
    opacity: 0.8,
  },
  dangerText: {
    color: tokens.colors.textInverse,
  },
  ghost: {
    backgroundColor: "transparent",
  },
  ghostPressed: {
    backgroundColor: tokens.colors.surfaceMuted,
  },
  ghostText: {
    color: tokens.colors.primary,
  },
  disabled: {
    opacity: 0.5,
  },
  disabledText: {
    color: tokens.colors.textMuted,
  },
});

const variantStyles = {
  primary: styles.primary,
  secondary: styles.secondary,
  danger: styles.danger,
  ghost: styles.ghost,
};

const pressedStyles = {
  primary: styles.primaryPressed,
  secondary: styles.secondaryPressed,
  danger: styles.dangerPressed,
  ghost: styles.ghostPressed,
};

const textStyles = {
  primary: styles.primaryText,
  secondary: styles.secondaryText,
  danger: styles.dangerText,
  ghost: styles.ghostText,
};
