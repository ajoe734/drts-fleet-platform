import { StyleSheet, Text, View } from "react-native";
import {
  PLATFORM_CODE_REGISTRY,
  type PlatformEarningsItem,
} from "@drts/contracts";
import { formatAmountNumber, formatSignedAmountNumber } from "@/lib/money";
import { EmptyState } from "@/components/ui/EmptyState";
import { PlatformBadge } from "@/components/ui/PlatformBadge";
import { Tokens } from "@/components/ui/tokens";

const OWNED_PLATFORM_CODES = new Set(["owned", "direct", "drts"]);

const NUMERIC_FONT_FAMILY = Tokens.fonts.mono;

export interface EarningsByPlatformProps {
  items: PlatformEarningsItem[];
}

export function EarningsByPlatform({ items }: EarningsByPlatformProps) {
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
        <EarningsRow key={item.platformCode} item={item} />
      ))}
    </View>
  );
}

function EarningsRow({ item }: { item: PlatformEarningsItem }) {
  const platformLabel =
    PLATFORM_CODE_REGISTRY[item.platformCode]?.displayName ?? item.platformCode;
  const forwarded = !OWNED_PLATFORM_CODES.has(item.platformCode);
  const isEmpty =
    item.grossEarning.amountMinor === 0 &&
    item.serviceFee.amountMinor === 0 &&
    item.subsidy.amountMinor === 0 &&
    item.netAmount.amountMinor === 0;

  const authorityLabel = forwarded ? "平台結算" : "DRTS 結算";
  const authorityColor = forwarded
    ? Tokens.colors.forwarded
    : Tokens.colors.owned;

  return (
    <View
      style={[styles.row, isEmpty ? styles.rowEmpty : null]}
      accessibilityLabel={`${platformLabel} 收益`}
    >
      <View style={styles.rowHeader}>
        <PlatformBadge
          code={item.platformCode}
          name={platformLabel}
          forwarded={forwarded}
          size="sm"
        />
        <View style={styles.spacer} />
        <Text style={styles.netValue}>
          {isEmpty ? "—" : formatAmountNumber(item.netAmount)}
        </Text>
      </View>

      <View style={styles.detailRow}>
        <DetailEntry
          label="毛收"
          value={formatAmountNumber(item.grossEarning)}
        />
        <DetailEntry
          label="抽成"
          value={
            item.serviceFee.amountMinor === 0
              ? "0"
              : formatSignedAmountNumber({
                  ...item.serviceFee,
                  amountMinor: -Math.abs(item.serviceFee.amountMinor),
                })
          }
        />
        <DetailEntry
          label="補助"
          value={formatSignedAmountNumber(item.subsidy)}
        />
        <Text
          style={[styles.authorityLabel, { color: authorityColor }]}
          accessibilityLabel={`結算權威 ${authorityLabel}`}
        >
          {authorityLabel}
        </Text>
      </View>
    </View>
  );
}

function DetailEntry({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailEntry}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Tokens.spacing.sm,
  },
  row: {
    backgroundColor: Tokens.colors.surface,
    borderRadius: Tokens.radius.lg,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    paddingVertical: Tokens.spacing.md,
    paddingHorizontal: Tokens.spacing.md,
    gap: Tokens.spacing.sm,
  },
  rowEmpty: {
    opacity: 0.6,
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Tokens.spacing.sm,
  },
  spacer: {
    flex: 1,
  },
  netValue: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "700",
    fontFamily: NUMERIC_FONT_FAMILY,
    color: Tokens.colors.textStrong,
    letterSpacing: -0.3,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Tokens.spacing.md,
    paddingTop: Tokens.spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Tokens.colors.borderStrong,
    borderStyle: "dashed",
  },
  detailEntry: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  detailLabel: {
    fontSize: 11,
    lineHeight: 14,
    color: Tokens.colors.textMuted,
    fontWeight: "500",
  },
  detailValue: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    color: Tokens.colors.textStrong,
    fontFamily: NUMERIC_FONT_FAMILY,
  },
  authorityLabel: {
    flex: 1,
    textAlign: "right",
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  emptyState: {
    flex: 0,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    borderRadius: Tokens.radius.lg,
    backgroundColor: Tokens.colors.surface,
  },
});
