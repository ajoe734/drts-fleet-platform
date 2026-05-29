import React from "react";
import { StyleSheet, View, Text, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Tokens } from "./tokens";
import { ActionButton } from "./ActionButton";

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  tone?: "default" | "warning" | "danger";
  actionTitle?: string;
  onAction?: () => void;
  style?: ViewStyle;
}

const TONE_ICON_COLOR: Record<NonNullable<EmptyStateProps["tone"]>, string> = {
  default: Tokens.colors.borderStrong,
  warning: Tokens.colors.warning,
  danger: Tokens.colors.danger,
};

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon = "information-circle-outline",
  tone = "default",
  actionTitle,
  onAction,
  style,
}) => {
  return (
    <View style={[styles.container, style]}>
      <Ionicons name={icon} size={48} color={TONE_ICON_COLOR[tone]} />
      <Text style={styles.title}>{title}</Text>
      {description ? (
        <Text style={styles.description}>{description}</Text>
      ) : null}
      {actionTitle && onAction ? (
        <ActionButton
          title={actionTitle}
          onPress={onAction}
          variant="secondary"
          style={styles.action}
        />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Tokens.spacing["3xl"],
  },
  title: {
    ...Tokens.type.sectionTitle,
    color: Tokens.colors.text,
    marginTop: Tokens.spacing.md,
    textAlign: "center",
  },
  description: {
    ...Tokens.type.body,
    color: Tokens.colors.textMuted,
    marginTop: Tokens.spacing.sm,
    textAlign: "center",
  },
  action: {
    marginTop: Tokens.spacing.xl,
    minWidth: 120,
  },
});
