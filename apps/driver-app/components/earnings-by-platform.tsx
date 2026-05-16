import { StyleSheet, Text, View } from "react-native";
import {
  FinanceAuthorityMode,
  PLATFORM_CODE_REGISTRY,
  type PlatformEarningsItem,
} from "@drts/contracts";
import { formatAmountNumber, formatSignedAmountNumber } from "@/lib/money";
import { EmptyState } from "@/components/ui/EmptyState";
import { PlatformBadge } from "@/components/ui/PlatformBadge";
import { Tokens } from "@/components/ui/tokens";

const NUMERIC_FONT_FAMILY = Tokens.fonts.mono;

export interface EarningsByPlatformProps {
  items: PlatformEarningsItem[];
}

export function getFinanceAuthorityModeForPlatformCode(
  platformCode: string,
): FinanceAuthorityMode {
  const registryEntry =
    PLATFORM_CODE_REGISTRY[platformCode as keyof typeof PLATFORM_CODE_REGISTRY];

  if (!registryEntry) {
    return FinanceAuthorityMode.OWNED;
  }

  if (registryEntry.status === "forwarder_stub") {
    return FinanceAuthorityMode.SHADOW;
  }

  return FinanceAuthorityMode.EXTERNAL;
}

export function isOwnedPlatformCode(platformCode: string): boolean {
  return (
    getFinanceAuthorityModeForPlatformCode(platformCode) ===
    FinanceAuthorityMode.OWNED
  );
}

export function isShadowOnlyPlatformCode(platformCode: string): boolean {
  return (
    getFinanceAuthorityModeForPlatformCode(platformCode) ===
    FinanceAuthorityMode.SHADOW
  );
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
  const authorityMode = getFinanceAuthorityModeForPlatformCode(
    item.platformCode,
  );
  const owned = authorityMode === FinanceAuthorityMode.OWNED;
  const shadowOnly = authorityMode === FinanceAuthorityMode.SHADOW;
  const forwarded = !owned;
  const isEmpty =
    item.grossEarning.amountMinor === 0 &&
    item.serviceFee.amountMinor === 0 &&
    item.subsidy.amountMinor === 0 &&
    item.netAmount.amountMinor === 0;

  const settlementLabel = owned ? "結算：DRTS" : "結算：外部平台";
  const payoutLabel = owned ? "撥款：DRTS" : "撥款：外部平台";
  const ledgerLabel = owned
    ? "列入 DRTS 對帳"
    : shadowOnly
      ? "Shadow-only 鏡像"
      : "外部平台結算";
  const authorityColor = forwarded
    ? Tokens.colors.forwarded
    : Tokens.colors.owned;
  const authorityNote = owned
    ? "會進入 DRTS 對帳單與待撥款計算。"
    : shadowOnly
      ? "僅供對帳檢視；不列入 DRTS 待撥款。"
      : "由外部平台結算與撥款，不列入 DRTS 待撥款。";
  const netAmountAccessibilityLabel = owned
    ? "DRTS 淨額"
    : shadowOnly
      ? "shadow-only 淨額"
      : "外部平台淨額";

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
        <Text
          style={[
            styles.ledgerPill,
            forwarded ? styles.ledgerPillForwarded : styles.ledgerPillOwned,
          ]}
        >
          {ledgerLabel}
        </Text>
        <View style={styles.spacer} />
        <Text
          style={styles.netValue}
          accessibilityLabel={netAmountAccessibilityLabel}
        >
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
      </View>

      <View style={styles.authorityRow}>
        <Text style={[styles.authorityLabel, { color: authorityColor }]}>
          {settlementLabel}
        </Text>
        <Text style={[styles.authorityLabel, { color: authorityColor }]}>
          {payoutLabel}
        </Text>
      </View>

      <Text
        style={styles.authorityNote}
        accessibilityLabel={`${platformLabel} 帳務說明 ${authorityNote}`}
      >
        {authorityNote}
      </Text>
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
    flexWrap: "wrap",
  },
  ledgerPill: {
    ...Tokens.type.micro,
    borderWidth: 1,
    borderRadius: Tokens.radius.pill,
    paddingHorizontal: Tokens.spacing.sm,
    paddingVertical: 2,
  },
  ledgerPillOwned: {
    color: Tokens.colors.owned,
    backgroundColor: Tokens.colors.ownedBg,
    borderColor: Tokens.colors.ownedBorder,
  },
  ledgerPillForwarded: {
    color: Tokens.colors.forwarded,
    backgroundColor: Tokens.colors.forwardedBg,
    borderColor: Tokens.colors.forwardedBorder,
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
    flexWrap: "wrap",
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
  authorityRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Tokens.spacing.sm,
  },
  authorityLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  authorityNote: {
    ...Tokens.type.small,
    color: Tokens.colors.textMuted,
  },
  emptyState: {
    flex: 0,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    borderRadius: Tokens.radius.lg,
    backgroundColor: Tokens.colors.surface,
  },
});
