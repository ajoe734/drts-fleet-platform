import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { tokens } from "./tokens";

type ChipVariant = "primary" | "secondary" | "danger" | "warning" | "success";

interface ChipProps {
  label: string;
  variant?: ChipVariant;
  onPress?: () => void; // Optional onPress for interactive chips
  onClose?: () => void; // Optional close handler
  icon?: React.ReactNode; // Optional icon to display
}

export function Chip({
  label,
  variant = "primary",
  onPress,
  onClose,
  icon,
}: ChipProps) {
  const isInteractive = onPress || onClose;
  const content = (
    <>
      {icon && <View style={styles.iconContainer}>{icon}</View>}
      <Text style={[styles.label, labelStyles[variant]]}>{label}</Text>
      {onClose && (
        <Pressable
          accessibilityLabel={`移除 ${label}`}
          accessibilityRole="button"
          onPress={onClose}
          style={styles.closeButton}
        >
          <Text style={[styles.closeButtonText, closeTextStyles[variant]]}>
            X
          </Text>
        </Pressable>
      )}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={[styles.base, variantStyles[variant], styles.interactive]}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View
      style={[
        styles.base,
        variantStyles[variant],
        isInteractive && styles.interactive,
      ]}
    >
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: tokens.radius.full, // Chips usually have rounded corners
    paddingVertical: tokens.spacing[8],
    paddingHorizontal: tokens.spacing[12],
    marginHorizontal: tokens.spacing[4],
    marginVertical: tokens.spacing[4],
  },
  interactive: {
    cursor: "pointer", // For web, though this is React Native
  },
  iconContainer: {
    marginRight: tokens.spacing[8],
  },
  label: {
    ...tokens.type.label,
  },
  // Variants
  primary: {
    backgroundColor: tokens.colors.primary,
  },
  primaryLabel: {
    color: tokens.colors.textInverse,
  },
  secondary: {
    backgroundColor: tokens.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  secondaryLabel: {
    color: tokens.colors.textStrong,
  },
  danger: {
    backgroundColor: tokens.colors.danger,
  },
  dangerLabel: {
    color: tokens.colors.textInverse,
  },
  warning: {
    backgroundColor: tokens.colors.warning,
  },
  warningLabel: {
    color: tokens.colors.textStrong, // Assuming dark text on warning color
  },
  success: {
    backgroundColor: tokens.colors.success,
  },
  successLabel: {
    color: tokens.colors.textInverse,
  },
  // Close button styles
  closeButton: {
    marginLeft: tokens.spacing[8],
    padding: tokens.spacing[4], // Add padding for easier tapping
  },
  closeButtonText: {
    fontSize: 12,
    fontWeight: "bold",
  },
  primaryCloseButtonText: {
    color: tokens.colors.textInverse,
  },
  secondaryCloseButtonText: {
    color: tokens.colors.textStrong,
  },
  dangerCloseButtonText: {
    color: tokens.colors.textInverse,
  },
  warningCloseButtonText: {
    color: tokens.colors.textStrong,
  },
  successCloseButtonText: {
    color: tokens.colors.textInverse,
  },
});

const variantStyles = {
  primary: styles.primary,
  secondary: styles.secondary,
  danger: styles.danger,
  warning: styles.warning,
  success: styles.success,
};

const labelStyles = {
  primary: styles.primaryLabel,
  secondary: styles.secondaryLabel,
  danger: styles.dangerLabel,
  warning: styles.warningLabel,
  success: styles.successLabel,
};

const closeTextStyles = {
  primary: styles.primaryCloseButtonText,
  secondary: styles.secondaryCloseButtonText,
  danger: styles.dangerCloseButtonText,
  warning: styles.warningCloseButtonText,
  success: styles.successCloseButtonText,
};
