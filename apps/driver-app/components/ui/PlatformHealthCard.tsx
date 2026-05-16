import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import { StatusChip } from "./StatusChip";
import { Tokens } from "./tokens";

export type PlatformHealthTone = "healthy" | "warning" | "danger" | "neutral";

export interface PlatformHealthFact {
  label: string;
  value: string;
  tone?: PlatformHealthTone;
}

interface PlatformHealthCardProps {
  title: string;
  subtitle?: string;
  statusLabel: string;
  statusTone?: PlatformHealthTone;
  facts?: PlatformHealthFact[];
  footer?: React.ReactNode;
  actions?: React.ReactNode;
  style?: ViewStyle;
}

function getToneColor(tone: PlatformHealthTone = "neutral") {
  switch (tone) {
    case "healthy":
      return Tokens.colors.success;
    case "warning":
      return Tokens.colors.warning;
    case "danger":
      return Tokens.colors.danger;
    default:
      return Tokens.colors.textBody;
  }
}

function getStatusVariant(tone: PlatformHealthTone = "neutral") {
  switch (tone) {
    case "healthy":
      return "success" as const;
    case "warning":
      return "warning" as const;
    case "danger":
      return "danger" as const;
    default:
      return "default" as const;
  }
}

export function PlatformHealthCard({
  title,
  subtitle,
  statusLabel,
  statusTone = "neutral",
  facts = [],
  footer,
  actions,
  style,
}: PlatformHealthCardProps) {
  return (
    <View style={[styles.card, style]}>
      <View style={styles.header}>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        <View style={styles.statusBlock}>
          {actions}
          <StatusChip
            label={statusLabel}
            variant={getStatusVariant(statusTone)}
            style={styles.statusChip}
            dot={statusTone !== "neutral"}
          />
        </View>
      </View>

      {facts.length > 0 ? (
        <View style={styles.facts}>
          {facts.map((fact) => (
            <View key={`${fact.label}:${fact.value}`} style={styles.factRow}>
              <Text style={styles.factLabel}>{fact.label}</Text>
              <View style={styles.factValueRow}>
                {fact.tone ? (
                  <Ionicons
                    name="ellipse"
                    size={10}
                    color={getToneColor(fact.tone)}
                  />
                ) : null}
                <Text
                  style={[
                    styles.factValue,
                    fact.tone ? { color: getToneColor(fact.tone) } : null,
                  ]}
                >
                  {fact.value}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Tokens.spacing.lg,
    backgroundColor: Tokens.colors.surface,
    borderRadius: Tokens.radius.lg,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    gap: Tokens.spacing.md,
    ...Tokens.shadows.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: Tokens.spacing.sm,
  },
  titleBlock: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...Tokens.type.title,
    color: Tokens.colors.text,
    fontWeight: "700",
  },
  subtitle: {
    ...Tokens.type.small,
    color: Tokens.colors.textMuted,
  },
  statusBlock: {
    alignItems: "flex-end",
    gap: Tokens.spacing.sm,
  },
  statusChip: {
    alignSelf: "flex-end",
  },
  facts: {
    gap: Tokens.spacing.sm,
  },
  factRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: Tokens.spacing.md,
    paddingVertical: 2,
  },
  factLabel: {
    ...Tokens.type.label,
    color: Tokens.colors.textMuted,
  },
  factValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Tokens.spacing.xs,
    flexShrink: 1,
  },
  factValue: {
    ...Tokens.type.label,
    color: Tokens.colors.textBody,
    flexShrink: 1,
    textAlign: "right",
  },
  footer: {
    gap: Tokens.spacing.sm,
    paddingTop: Tokens.spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Tokens.colors.border,
  },
});
