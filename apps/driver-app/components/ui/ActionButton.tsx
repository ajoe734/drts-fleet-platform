import React from "react";
import {
  StyleSheet,
  TouchableOpacity,
  Text,
  ActivityIndicator,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
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
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
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
          iconColor: Tokens.colors.text,
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
          iconColor: Tokens.colors.brand,
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
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "transparent",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Tokens.spacing.lg,
    paddingVertical: Tokens.spacing.md,
    ...Tokens.shadows.sm,
  },
  baseText: {
    ...Tokens.type.label,
    fontWeight: "600",
  },
  primaryButton: {
    backgroundColor: Tokens.colors.brand,
  },
  primaryText: {
    color: Tokens.colors.textInverse,
  },
  secondaryButton: {
    backgroundColor: Tokens.colors.surfaceLo,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    shadowOpacity: 0,
    elevation: 0,
  },
  secondaryText: {
    color: Tokens.colors.text,
  },
  dangerButton: {
    backgroundColor: Tokens.colors.danger,
  },
  dangerText: {
    color: Tokens.colors.textInverse,
  },
  ghostButton: {
    backgroundColor: "transparent",
    borderColor: "transparent",
    shadowOpacity: 0,
    elevation: 0,
  },
  ghostText: {
    color: Tokens.colors.brand,
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
