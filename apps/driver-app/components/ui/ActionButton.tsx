import React from "react";
import {
  StyleSheet,
  TouchableOpacity,
  Text,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Tokens } from "./tokens";

export type ActionButtonVariant = "primary" | "secondary" | "danger" | "ghost";

interface ActionButtonProps {
  onPress: () => void;
  title: string;
  variant?: ActionButtonVariant;
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export const ActionButton: React.FC<ActionButtonProps> = ({
  onPress,
  title,
  variant = "primary",
  icon,
  loading = false,
  disabled = false,
  style,
  textStyle,
}) => {
  const getVariantStyles = () => {
    switch (variant) {
      case "secondary":
        return {
          button: styles.secondaryButton,
          text: styles.secondaryText,
          iconColor: Tokens.colors.textBody,
        };
      case "danger":
        return {
          button: styles.dangerButton,
          text: styles.dangerText,
          iconColor: Tokens.colors.textInverse,
        };
      case "ghost":
        return {
          button: styles.ghostButton,
          text: styles.ghostText,
          iconColor: Tokens.colors.primary,
        };
      default:
        return {
          button: styles.primaryButton,
          text: styles.primaryText,
          iconColor: Tokens.colors.textInverse,
        };
    }
  };

  const variantStyles = getVariantStyles();
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.7}
      style={[
        styles.baseButton,
        variantStyles.button,
        isDisabled && styles.disabledButton,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variantStyles.text.color} size="small" />
      ) : (
        <>
          {icon && (
            <Ionicons
              name={icon}
              size={18}
              color={variantStyles.iconColor}
              style={styles.icon}
            />
          )}
          <Text
            style={[
              styles.baseText,
              variantStyles.text,
              isDisabled && styles.disabledText,
              textStyle,
            ]}
          >
            {title}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  baseButton: {
    height: 48,
    borderRadius: Tokens.radius.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Tokens.spacing.lg,
  },
  baseText: {
    ...Tokens.type.label,
    fontWeight: "600",
  },
  primaryButton: {
    backgroundColor: Tokens.colors.primary,
  },
  primaryText: {
    color: Tokens.colors.textInverse,
  },
  secondaryButton: {
    backgroundColor: Tokens.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
  },
  secondaryText: {
    color: Tokens.colors.textBody,
  },
  dangerButton: {
    backgroundColor: Tokens.colors.danger,
  },
  dangerText: {
    color: Tokens.colors.textInverse,
  },
  ghostButton: {
    backgroundColor: "transparent",
  },
  ghostText: {
    color: Tokens.colors.primary,
  },
  disabledButton: {
    opacity: 0.5,
  },
  disabledText: {
    opacity: 0.8,
  },
  icon: {
    marginRight: Tokens.spacing.sm,
  },
});
