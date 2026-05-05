import React from "react";
import { StyleSheet, View, Text, ViewStyle } from "react-native";
import { Tokens } from "./tokens";

export type StatusChipVariant =
  | "default"
  | "success"
  | "warning"
  | "danger"
  | "info";

interface StatusChipProps {
  label: string;
  variant?: StatusChipVariant;
  style?: ViewStyle;
}

export const StatusChip: React.FC<StatusChipProps> = ({
  label,
  variant = "default",
  style,
}) => {
  const getVariantStyles = () => {
    switch (variant) {
      case "success":
        return {
          container: { backgroundColor: "#E6F4EA" },
          text: { color: Tokens.colors.success },
        };
      case "warning":
        return {
          container: { backgroundColor: Tokens.colors.surfaceWarning },
          text: { color: Tokens.colors.warning },
        };
      case "danger":
        return {
          container: { backgroundColor: Tokens.colors.surfaceDanger },
          text: { color: Tokens.colors.danger },
        };
      case "info":
        return {
          container: { backgroundColor: "#E8F0FE" },
          text: { color: Tokens.colors.primary },
        };
      default:
        return {
          container: { backgroundColor: Tokens.colors.surfaceMuted },
          text: { color: Tokens.colors.textBody },
        };
    }
  };

  const variantStyles = getVariantStyles();

  return (
    <View style={[styles.container, variantStyles.container, style]}>
      <Text style={[styles.text, variantStyles.text]}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Tokens.spacing.sm,
    paddingVertical: 2,
    borderRadius: Tokens.radius.xs,
    alignSelf: "flex-start",
  },
  text: {
    ...Tokens.type.micro,
    fontWeight: "600",
  },
});
