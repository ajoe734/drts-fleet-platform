import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
} from "react-native";
import {
  PLATFORM_CODE_REGISTRY,
  type PlatformEarningsItem,
} from "@drts/contracts";
import { formatMoney } from "@/lib/money";
import { Tokens } from "@/components/ui/tokens";
import { EmptyState } from "@/components/ui/EmptyState";

if (Platform.OS === "android") {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

function DetailRow({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "positive" | "muted";
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text
        style={[
          styles.detailValue,
          tone === "positive" && styles.detailValuePositive,
          tone === "muted" && styles.detailValueMuted,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function PlatformCard({ item }: { item: PlatformEarningsItem }) {
  const [expanded, setExpanded] = useState(false);
  const platformLabel =
    PLATFORM_CODE_REGISTRY[item.platformCode]?.displayName ?? item.platformCode;

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => !prev);
  };

  return (
    <Pressable
      onPress={toggle}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${platformLabel} 收益明細`}
      accessibilityHint={expanded ? "收合收益明細" : "展開收益明細"}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleBlock}>
          <Text style={styles.platformName}>{platformLabel}</Text>
          <Text style={styles.platformCode}>{item.platformCode}</Text>
        </View>

        <View style={styles.summaryBlock}>
          <Text style={styles.summaryLabel}>本期實拿</Text>
          <Text style={styles.summaryValue}>{formatMoney(item.netAmount)}</Text>
        </View>

        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={18}
          color={Tokens.colors.textMuted}
        />
      </View>

      <View style={styles.metricsRow}>
        <View style={styles.metricChip}>
          <Text style={styles.metricChipLabel}>總收入</Text>
          <Text style={styles.metricChipValue}>
            {formatMoney(item.grossEarning)}
          </Text>
        </View>
        <View style={styles.metricChip}>
          <Text style={styles.metricChipLabel}>服務費</Text>
          <Text style={[styles.metricChipValue, styles.metricChipValueMuted]}>
            {formatMoney(item.serviceFee)}
          </Text>
        </View>
        <View style={styles.metricChip}>
          <Text style={styles.metricChipLabel}>補貼</Text>
          <Text style={styles.metricChipValue}>
            {formatMoney(item.subsidy)}
          </Text>
        </View>
      </View>

      {expanded ? (
        <View style={styles.detailPanel}>
          <DetailRow label="總收入" value={formatMoney(item.grossEarning)} />
          <DetailRow
            label="平台服務費"
            value={formatMoney(item.serviceFee)}
            tone="muted"
          />
          <DetailRow label="補貼" value={formatMoney(item.subsidy)} />
          <DetailRow
            label="實際入帳"
            value={formatMoney(item.netAmount)}
            tone="positive"
          />
        </View>
      ) : null}
    </Pressable>
  );
}

export function EarningsByPlatform({
  items,
}: {
  items: PlatformEarningsItem[];
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="這段期間還沒有平台收益"
        description="切換到其他期間，或稍後再查看最新對帳彙整。"
        icon="cash-outline"
        style={styles.emptyState}
      />
    );
  }

  return (
    <View style={styles.list}>
      {items.map((item) => (
        <PlatformCard key={item.platformCode} item={item} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Tokens.spacing.sm,
  },
  card: {
    backgroundColor: Tokens.colors.surface,
    borderRadius: Tokens.radius.md,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    padding: Tokens.spacing.md,
    gap: Tokens.spacing.md,
  },
  cardPressed: {
    opacity: 0.92,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Tokens.spacing.sm,
  },
  cardTitleBlock: {
    flex: 1,
    gap: 2,
  },
  platformName: {
    ...Tokens.type.label,
    color: Tokens.colors.textStrong,
    fontWeight: "700",
  },
  platformCode: {
    ...Tokens.type.micro,
    color: Tokens.colors.textMuted,
    textTransform: "uppercase",
  },
  summaryBlock: {
    alignItems: "flex-end",
    marginRight: Tokens.spacing.xs,
  },
  summaryLabel: {
    ...Tokens.type.micro,
    color: Tokens.colors.textMuted,
  },
  summaryValue: {
    ...Tokens.type.label,
    color: Tokens.colors.success,
    fontWeight: "700",
  },
  metricsRow: {
    flexDirection: "row",
    gap: Tokens.spacing.sm,
  },
  metricChip: {
    flex: 1,
    backgroundColor: Tokens.colors.surfaceMuted,
    borderRadius: Tokens.radius.sm,
    paddingVertical: Tokens.spacing.sm,
    paddingHorizontal: Tokens.spacing.sm,
    gap: 2,
  },
  metricChipLabel: {
    ...Tokens.type.micro,
    color: Tokens.colors.textMuted,
  },
  metricChipValue: {
    ...Tokens.type.label,
    color: Tokens.colors.textStrong,
    fontWeight: "600",
  },
  metricChipValueMuted: {
    color: Tokens.colors.warning,
  },
  detailPanel: {
    paddingTop: Tokens.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Tokens.colors.border,
    gap: Tokens.spacing.sm,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: Tokens.spacing.md,
  },
  detailLabel: {
    ...Tokens.type.body,
    color: Tokens.colors.textBody,
  },
  detailValue: {
    ...Tokens.type.label,
    color: Tokens.colors.textStrong,
    fontWeight: "600",
  },
  detailValuePositive: {
    color: Tokens.colors.success,
  },
  detailValueMuted: {
    color: Tokens.colors.warning,
  },
  emptyState: {
    flex: 0,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    borderRadius: Tokens.radius.md,
    backgroundColor: Tokens.colors.surface,
  },
});
