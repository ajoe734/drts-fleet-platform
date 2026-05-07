import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";
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
          backgroundColor: Tokens.colors.forwardedBg,
          borderColor: Tokens.colors.forwardedBorder,
          borderLeftColor: Tokens.colors.forwarded,
        },
        titleColor: Tokens.colors.forwarded,
        descriptionColor: Tokens.colors.textMuted,
        iconColor: Tokens.colors.forwarded,
      };
    case "warning":
      return {
        container: {
          backgroundColor: Tokens.colors.warningBg,
          borderColor: `${Tokens.colors.warning}33`,
          borderLeftColor: Tokens.colors.warning,
        },
        titleColor: Tokens.colors.warning,
        descriptionColor: Tokens.colors.textMuted,
        iconColor: Tokens.colors.warning,
      };
    case "danger":
      return {
        container: {
          backgroundColor: Tokens.colors.dangerBg,
          borderColor: `${Tokens.colors.danger}33`,
          borderLeftColor: Tokens.colors.danger,
        },
        titleColor: Tokens.colors.danger,
        descriptionColor: Tokens.colors.textMuted,
        iconColor: Tokens.colors.danger,
      };
    default:
      return {
        container: {
          backgroundColor: Tokens.colors.ownedBg,
          borderColor: Tokens.colors.ownedBorder,
          borderLeftColor: Tokens.colors.owned,
        },
        titleColor: Tokens.colors.owned,
        descriptionColor: Tokens.colors.textMuted,
        iconColor: Tokens.colors.owned,
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
          <View style={styles.textBlock}>
            <Text style={[styles.title, { color: toneStyles.titleColor }]}>
              {title}
            </Text>
            <Text style={styles.authorityLabel}>{authorityLabel}</Text>
          </View>
        </View>
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
    borderLeftWidth: 3,
    borderRadius: Tokens.radius.md,
    paddingHorizontal: Tokens.spacing.lg,
    paddingVertical: Tokens.spacing.md,
    gap: Tokens.spacing.xs,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Tokens.spacing.sm,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Tokens.spacing.sm,
    flex: 1,
  },
  textBlock: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...Tokens.type.label,
    fontWeight: "700",
  },
  authorityLabel: {
    ...Tokens.type.micro,
    color: Tokens.colors.textMuted,
  },
  description: {
    ...Tokens.type.small,
  },
});
