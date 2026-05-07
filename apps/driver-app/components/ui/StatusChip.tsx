import React from "react";
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Tokens } from "./tokens";

export type StatusChipVariant =
  | "default"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "owned"
  | "forwarded"
  | "brand";

interface StatusChipProps {
  label: string;
  variant?: StatusChipVariant;
  strong?: boolean;
  dot?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const StatusChip: React.FC<StatusChipProps> = ({
  label,
  variant = "default",
  strong = false,
  dot = false,
  style,
}) => {
  const tone = toneStyles[variant];
  const chipStyles = strong
    ? {
        container: {
          backgroundColor: tone.textColor,
          borderColor: tone.textColor,
        },
        text: { color: Tokens.colors.textInverse },
        dot: { backgroundColor: Tokens.colors.textInverse },
      }
    : {
        container: {
          backgroundColor: tone.backgroundColor,
          borderColor: tone.borderColor,
        },
        text: { color: tone.textColor },
        dot: { backgroundColor: tone.textColor },
      };

  return (
    <View style={[styles.container, chipStyles.container, style]}>
      {dot ? <View style={[styles.dot, chipStyles.dot]} /> : null}
      <Text style={[styles.text, chipStyles.text]}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: Tokens.spacing.xs,
    minHeight: 22,
    paddingHorizontal: Tokens.spacing.sm,
    paddingVertical: 4,
    borderRadius: Tokens.radius.pill,
    borderWidth: 1,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 999,
  },
  text: {
    ...Tokens.type.micro,
  },
});

const toneStyles = {
  default: {
    backgroundColor: Tokens.colors.neutralBg,
    borderColor: Tokens.colors.border,
    textColor: Tokens.colors.textMuted,
  },
  success: {
    backgroundColor: Tokens.colors.successBg,
    borderColor: `${Tokens.colors.success}33`,
    textColor: Tokens.colors.success,
  },
  warning: {
    backgroundColor: Tokens.colors.warningBg,
    borderColor: `${Tokens.colors.warning}33`,
    textColor: Tokens.colors.warning,
  },
  danger: {
    backgroundColor: Tokens.colors.dangerBg,
    borderColor: `${Tokens.colors.danger}33`,
    textColor: Tokens.colors.danger,
  },
  info: {
    backgroundColor: Tokens.colors.infoBg,
    borderColor: `${Tokens.colors.info}33`,
    textColor: Tokens.colors.info,
  },
  owned: {
    backgroundColor: Tokens.colors.ownedBg,
    borderColor: Tokens.colors.ownedBorder,
    textColor: Tokens.colors.owned,
  },
  forwarded: {
    backgroundColor: Tokens.colors.forwardedBg,
    borderColor: Tokens.colors.forwardedBorder,
    textColor: Tokens.colors.forwarded,
  },
  brand: {
    backgroundColor: Tokens.colors.brandBg,
    borderColor: `${Tokens.colors.brand}33`,
    textColor: Tokens.colors.brand,
  },
} satisfies Record<
  StatusChipVariant,
  { backgroundColor: string; borderColor: string; textColor: string }
>;
