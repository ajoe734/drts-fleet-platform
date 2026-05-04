import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { tokens } from "./tokens";
import { ActionButton } from "./ActionButton";

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  title,
  description,
  icon = "information-circle-outline",
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <Ionicons
        name={icon}
        size={48}
        color={tokens.colors.textMuted}
        style={styles.icon}
      />
      <Text style={styles.title}>{title}</Text>
      {description ? (
        <Text style={styles.description}>{description}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <View style={styles.action}>
          <ActionButton
            label={actionLabel}
            onPress={onAction}
            variant="secondary"
            fullWidth={false}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: tokens.spacing[24],
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    marginBottom: tokens.spacing[16],
  },
  title: {
    ...tokens.type.sectionTitle,
    color: tokens.colors.textStrong,
    textAlign: "center",
  },
  description: {
    ...tokens.type.body,
    color: tokens.colors.textMuted,
    textAlign: "center",
    marginTop: tokens.spacing[8],
  },
  action: {
    marginTop: tokens.spacing[20],
  },
});
