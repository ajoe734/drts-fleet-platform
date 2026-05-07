import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View, ViewStyle } from "react-native";
import { StatusChip } from "./StatusChip";
import { Tokens } from "./tokens";

export type AuthorityTone = "owned" | "platform" | "warning" | "danger";

interface AuthorityBannerProps {
  title: string;
  description: string;
  authorityLabel: string;
  tone?: AuthorityTone;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: ViewStyle;
}

function getToneStyles(tone: AuthorityTone) {
  switch (tone) {
    case "platform":
      return {
        container: {
          backgroundColor: "#E8F5FB",
          borderColor: "#B7D8EA",
        },
        titleColor: "#0F4C81",
        descriptionColor: Tokens.colors.textBody,
        iconColor: "#0F4C81",
        chipVariant: "info" as const,
      };
    case "warning":
      return {
        container: {
          backgroundColor: Tokens.colors.surfaceWarning,
          borderColor: "#F3C66B",
        },
        titleColor: Tokens.colors.warning,
        descriptionColor: Tokens.colors.textBody,
        iconColor: Tokens.colors.warning,
        chipVariant: "warning" as const,
      };
    case "danger":
      return {
        container: {
          backgroundColor: Tokens.colors.surfaceDanger,
          borderColor: "#F1A1AA",
        },
        titleColor: Tokens.colors.danger,
        descriptionColor: Tokens.colors.textBody,
        iconColor: Tokens.colors.danger,
        chipVariant: "danger" as const,
      };
    default:
      return {
        container: {
          backgroundColor: "#EAF6EE",
          borderColor: "#B8DEC6",
        },
        titleColor: Tokens.colors.success,
        descriptionColor: Tokens.colors.textBody,
        iconColor: Tokens.colors.success,
        chipVariant: "success" as const,
      };
  }
}

export function AuthorityBanner({
  title,
  description,
  authorityLabel,
  tone = "owned",
  icon = "shield-checkmark",
  style,
}: AuthorityBannerProps) {
  const toneStyles = getToneStyles(tone);

  return (
    <View style={[styles.container, toneStyles.container, style]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Ionicons name={icon} size={18} color={toneStyles.iconColor} />
          <Text style={[styles.title, { color: toneStyles.titleColor }]}>
            {title}
          </Text>
        </View>
        <StatusChip label={authorityLabel} variant={toneStyles.chipVariant} />
      </View>
      <Text
        style={[styles.description, { color: toneStyles.descriptionColor }]}
      >
        {description}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: Tokens.radius.md,
    paddingHorizontal: Tokens.spacing.md,
    paddingVertical: Tokens.spacing.md,
    gap: Tokens.spacing.xs,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: Tokens.spacing.sm,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Tokens.spacing.sm,
    flex: 1,
  },
  title: {
    ...Tokens.type.label,
    fontWeight: "700",
    flex: 1,
  },
  description: {
    ...Tokens.type.micro,
  },
});
