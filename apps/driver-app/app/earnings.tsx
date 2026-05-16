import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type {
  DriverPayoutStatus,
  DriverStatementRecord,
  MoneyAmount,
  PlatformEarningsByPlatformResponse,
  PlatformEarningsSummary,
} from "@drts/contracts";
import {
  EarningsByPlatform,
  isOwnedPlatformCode,
  isShadowOnlyPlatformCode,
} from "@/components/earnings-by-platform";
import {
  ActionButton,
  AuthorityBanner,
  EmptyState,
  ErrorBanner,
  IconButton,
  InfoTile,
  ListCard,
  PageHeader,
  SegmentedControl,
  StatusChip,
  Tokens,
} from "@/components/ui";
import { getDriverClient, isDriverIdentityProvisioned } from "@/lib/api-client";
import { formatMoney, sumMoneyAmounts } from "@/lib/money";
import { formatDriverPayoutStatusLabel } from "@/lib/operational-labels";

type PeriodKey = "today" | "week" | "month";

const PERIOD_OPTIONS = [
  { label: "今日", value: "today" },
  { label: "本週", value: "week" },
  { label: "本月", value: "month" },
] as const;

const DEFAULT_CURRENCY = "TWD";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return "資料載入失敗，請稍後再試。";
}

function sumPlatformNet(
  items: Array<{ netAmount: MoneyAmount; platformCode: string }>,
  predicate: (item: {
    netAmount: MoneyAmount;
    platformCode: string;
  }) => boolean,
  currency = DEFAULT_CURRENCY,
): MoneyAmount {
  return sumMoneyAmounts(
    items.filter(predicate).map((item) => item.netAmount),
    currency,
  );
}

function sumStatementNet(
  statements: DriverStatementRecord[],
  predicate: (statement: DriverStatementRecord) => boolean,
): MoneyAmount {
  const currency =
    statements[0]?.netAmount.currency ??
    statements[0]?.grossEarning.currency ??
    DEFAULT_CURRENCY;
  return sumMoneyAmounts(
    statements.filter(predicate).map((statement) => statement.netAmount),
    currency,
  );
}

function getStatementStatusVariant(status: DriverPayoutStatus) {
  return status === "paid" ? ("success" as const) : ("warning" as const);
}

function getLatestStatementMonth(
  statements: DriverStatementRecord[],
): string | null {
  const months = Array.from(
    new Set(
      statements
        .map((statement) => statement.periodMonth.trim())
        .filter((periodMonth) => periodMonth.length > 0),
    ),
  ).sort((left, right) => right.localeCompare(left));

  return months[0] ?? null;
}

function filterStatementsForPeriod(
  statements: DriverStatementRecord[],
  period: PeriodKey,
): DriverStatementRecord[] {
  if (period !== "month") {
    return [];
  }

  const latestMonth = getLatestStatementMonth(statements);
  if (!latestMonth) {
    return [];
  }

  return statements.filter(
    (statement) => statement.periodMonth === latestMonth,
  );
}

function getPeriodDescription(
  period: PeriodKey,
  latestStatementMonth: string | null,
): string {
  if (period === "month") {
    return latestStatementMonth
      ? `顯示最新月結週期 ${latestStatementMonth} 的平台收益與對帳單。`
      : "顯示最近一次可用的月結收益與對帳資料。";
  }

  return "今日與本週會顯示平台收益彙整；對帳單仍以月結資料提供，請切換到本月查看最新結算明細。";
}

function getEmptyPeriodTitle(period: PeriodKey): string {
  if (period === "today") {
    return "今日尚無可用收益切片";
  }

  if (period === "week") {
    return "本週尚無可用收益切片";
  }

  return "這個月份還沒有收益資料";
}

function StatementSectionEmpty({
  selectedPeriod,
  onResetPeriod,
}: {
  selectedPeriod: PeriodKey;
  onResetPeriod: () => void;
}) {
  const isMonth = selectedPeriod === "month";

  return (
    <EmptyState
      title={isMonth ? "尚無對帳單" : "此檢視尚無月結對帳單"}
      description={
        isMonth
          ? "本月還沒有可顯示的對帳單，請稍後重新整理。"
          : "對帳單目前只提供月結資料，切換到本月即可查看最新對帳彙整。"
      }
      icon="document-text-outline"
      actionTitle={isMonth ? "重新整理" : "切換到本月"}
      onAction={onResetPeriod}
      style={styles.sectionEmptyState}
    />
  );
}

export default function EarningsScreen() {
  const [summary, setSummary] = useState<PlatformEarningsSummary | null>(null);
  const [platformItems, setPlatformItems] = useState<
    PlatformEarningsByPlatformResponse["items"]
  >([]);
  const [statements, setStatements] = useState<DriverStatementRecord[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodKey>("month");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [earningsEnabled, setEarningsEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isProvisioned = isDriverIdentityProvisioned();

  const loadDashboard = async (period: PeriodKey) => {
    const client = getDriverClient();

    try {
      const requests: [
        Promise<PlatformEarningsSummary>,
        Promise<PlatformEarningsByPlatformResponse>,
        Promise<DriverStatementRecord[]>,
      ] = [
        client.getPlatformEarningsSummary(),
        client.getPlatformEarningsByPlatform(period),
        client.listDriverStatements(),
      ];
      const [summaryResponse, byPlatformResponse, statementRows] =
        await Promise.all(requests);

      setSummary(summaryResponse);
      setPlatformItems(byPlatformResponse.items);
      setStatements(
        [...statementRows].sort((left, right) =>
          right.updatedAt.localeCompare(left.updatedAt),
        ),
      );
      setError(null);
    } catch (nextError) {
      setError(toErrorMessage(nextError));
    }
  };

  useEffect(() => {
    if (!isProvisioned) {
      setLoading(false);
      return;
    }

    const client = getDriverClient();

    client
      .isFeatureEnabled("driver-app.earnings")
      .then((enabled) => {
        setEarningsEnabled(enabled);
        if (enabled) {
          return loadDashboard(selectedPeriod);
        }
        return undefined;
      })
      .catch(() => loadDashboard(selectedPeriod))
      .finally(() => setLoading(false));
  }, [isProvisioned, selectedPeriod]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDashboard(selectedPeriod);
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={styles.screen}>
        <PageHeader title="收益儀表板" />
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={Tokens.colors.primary} />
          <Text style={styles.loadingLabel}>載入收益資料中…</Text>
        </View>
      </View>
    );
  }

  if (!isProvisioned) {
    return (
      <View style={styles.screen}>
        <PageHeader title="收益儀表板" />
        <EmptyState
          title="裝置尚未綁定司機身份"
          description="完成裝置註冊後，才能查看平台收益與對帳資料。"
          icon="card-outline"
          style={styles.fillState}
        />
      </View>
    );
  }

  if (!earningsEnabled) {
    return (
      <View style={styles.screen}>
        <PageHeader title="收益儀表板" />
        <EmptyState
          title="收益儀表板暫停提供"
          description="此功能目前未啟用，請稍後再試或改從設定頁確認帳務通知。"
          icon="wallet-outline"
          style={styles.fillState}
        />
      </View>
    );
  }

  const baseCurrency =
    summary?.totalNet.currency ??
    platformItems[0]?.netAmount.currency ??
    statements[0]?.netAmount.currency ??
    DEFAULT_CURRENCY;
  const latestStatementMonth = getLatestStatementMonth(statements);
  const monthlyStatements = filterStatementsForPeriod(statements, "month");
  const displayedStatements =
    selectedPeriod === "month" ? monthlyStatements : [];
  const displayedPlatformItems = platformItems;
  const drtsStatementAmount = sumStatementNet(displayedStatements, () => true);
  const forwardedPlatformItems = displayedPlatformItems.filter(
    (item) => !isOwnedPlatformCode(item.platformCode),
  );
  const shadowOnlyPlatformItems = displayedPlatformItems.filter((item) =>
    isShadowOnlyPlatformCode(item.platformCode),
  );
  const externalPlatformAmount = sumPlatformNet(
    displayedPlatformItems,
    (item) =>
      !isOwnedPlatformCode(item.platformCode) &&
      !isShadowOnlyPlatformCode(item.platformCode),
    baseCurrency,
  );
  const shadowOnlyAmount = sumPlatformNet(
    displayedPlatformItems,
    (item) => isShadowOnlyPlatformCode(item.platformCode),
    baseCurrency,
  );
  const paidPayoutAmount = sumStatementNet(
    displayedStatements,
    (statement) => statement.payoutStatus === "paid",
  );
  const pendingPayoutAmount = sumStatementNet(
    displayedStatements,
    (statement) => statement.payoutStatus !== "paid",
  );
  const hasAnyData =
    displayedPlatformItems.length > 0 || displayedStatements.length > 0;

  if (error && !hasAnyData) {
    return (
      <View style={styles.screen}>
        <PageHeader title="收益儀表板" />
        <View style={styles.errorState}>
          <ErrorBanner message={`收益資料同步失敗：${error}`} />
          <ActionButton
            title="重新整理"
            icon="refresh"
            onPress={onRefresh}
            style={styles.retryButton}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <PageHeader
        title="收益儀表板"
        subtitle={
          latestStatementMonth
            ? `最新月結週期 ${latestStatementMonth}`
            : "查看平台收益與對帳單彙整"
        }
        rightElement={
          <IconButton
            icon="refresh"
            onPress={onRefresh}
            disabled={refreshing}
            accessibilityLabel="重新整理收益儀表板"
          />
        }
      />

      <FlatList
        data={displayedStatements}
        keyExtractor={(item) => item.statementId}
        renderItem={({ item }) => (
          <ListCard
            title={item.receiptNo}
            subtitle={`${item.periodMonth} · ${item.feePlanVersion}`}
            meta={`${item.lines.length} 筆行程 · 實拿 ${formatMoney(item.netAmount)}`}
            statusElement={
              <StatusChip
                label={formatDriverPayoutStatusLabel(item.payoutStatus)}
                variant={getStatementStatusVariant(item.payoutStatus)}
              />
            }
            style={styles.statementCard}
          />
        )}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            {error ? (
              <ErrorBanner message={`資料可能不是最新：${error}`} />
            ) : null}

            <View style={styles.periodCard}>
              <Text style={styles.sectionEyebrow}>結算期間</Text>
              <SegmentedControl
                options={PERIOD_OPTIONS.map((option) => ({
                  label: option.label,
                  value: option.value,
                }))}
                selectedValue={selectedPeriod}
                onValueChange={(value) => setSelectedPeriod(value as PeriodKey)}
              />
              <Text style={styles.periodDescription}>
                {getPeriodDescription(selectedPeriod, latestStatementMonth)}
              </Text>
            </View>

            <View style={styles.summaryGrid}>
              <View style={styles.summaryRow}>
                <InfoTile
                  label="DRTS 對帳金額"
                  value={formatMoney(drtsStatementAmount)}
                />
                <InfoTile
                  label="外部平台結算"
                  value={formatMoney(externalPlatformAmount)}
                />
              </View>
              <View style={styles.summaryRow}>
                <InfoTile
                  label="Shadow-only 鏡像"
                  value={formatMoney(shadowOnlyAmount)}
                />
                <InfoTile
                  label="已撥款"
                  value={formatMoney(paidPayoutAmount)}
                />
              </View>
              <View style={styles.summaryRow}>
                <InfoTile
                  label="待撥款"
                  value={formatMoney(pendingPayoutAmount)}
                />
              </View>
            </View>

            <View style={styles.authorityStack}>
              <AuthorityBanner
                title="DRTS 對帳與撥款"
                authorityLabel={
                  displayedStatements.length > 0
                    ? `${displayedStatements.length} 筆 DRTS 對帳單`
                    : "本期尚無 DRTS 對帳單"
                }
                description="只有進入 DRTS 對帳單的金額才會出現在待撥款與已撥款狀態追蹤。"
                tone="owned"
                icon="wallet"
              />
              <AuthorityBanner
                title="外部平台 finance authority"
                authorityLabel={
                  shadowOnlyPlatformItems.length > 0
                    ? `${shadowOnlyPlatformItems.length} 個 shadow-only 平台 / ${forwardedPlatformItems.length} 個 external-platform 平台`
                    : `${forwardedPlatformItems.length} 個 external-platform 平台`
                }
                description="Platform earnings contract 內的已登錄平台項目視為 external-platform finance authority；其中 shadow-only 鏡像只供對帳檢視，不列入 DRTS 待撥款。"
                tone="platform"
                icon="swap-horizontal"
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>平台收益</Text>
              <EarningsByPlatform items={displayedPlatformItems} />
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>對帳單</Text>
              <Text style={styles.sectionMeta}>
                {displayedStatements.length} 筆
              </Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          selectedPeriod === "month" &&
          displayedPlatformItems.length === 0 &&
          !error ? (
            <EmptyState
              title={getEmptyPeriodTitle(selectedPeriod)}
              description="本期尚未生成收益或對帳資料，請稍後重新整理。"
              icon="cash-outline"
              actionTitle="重新整理"
              onAction={onRefresh}
              style={styles.fillEmptyState}
            />
          ) : (
            <StatementSectionEmpty
              selectedPeriod={selectedPeriod}
              onResetPeriod={
                selectedPeriod === "month"
                  ? onRefresh
                  : () => setSelectedPeriod("month")
              }
            />
          )
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Tokens.colors.primary}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Tokens.colors.appBg,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Tokens.spacing.xl,
  },
  fillState: {
    flex: 1,
  },
  loadingLabel: {
    ...Tokens.type.label,
    color: Tokens.colors.textMuted,
    marginTop: Tokens.spacing.md,
  },
  errorState: {
    gap: Tokens.spacing.md,
    padding: Tokens.layout.pagePadding,
  },
  retryButton: {
    alignSelf: "flex-start",
  },
  listContent: {
    paddingHorizontal: Tokens.layout.pagePadding,
    paddingTop: Tokens.spacing.md,
    paddingBottom: Tokens.spacing.lg,
    flexGrow: 1,
  },
  listHeader: {
    gap: Tokens.spacing.md,
    marginBottom: Tokens.spacing.sm,
  },
  periodCard: {
    backgroundColor: Tokens.colors.surface,
    borderRadius: Tokens.radius.md,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    padding: Tokens.spacing.md,
    gap: Tokens.spacing.sm,
  },
  sectionEyebrow: {
    ...Tokens.type.micro,
    color: Tokens.colors.textMuted,
  },
  periodDescription: {
    ...Tokens.type.micro,
    color: Tokens.colors.textMuted,
  },
  summaryGrid: {
    gap: Tokens.spacing.sm,
  },
  summaryRow: {
    flexDirection: "row",
    gap: Tokens.spacing.sm,
  },
  authorityStack: {
    gap: Tokens.spacing.sm,
  },
  section: {
    gap: Tokens.spacing.sm,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Tokens.spacing.xs,
  },
  sectionTitle: {
    ...Tokens.type.sectionTitle,
    color: Tokens.colors.textStrong,
  },
  sectionMeta: {
    ...Tokens.type.micro,
    color: Tokens.colors.textMuted,
  },
  statementCard: {
    marginBottom: 0,
  },
  sectionEmptyState: {
    flex: 0,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    borderRadius: Tokens.radius.md,
    backgroundColor: Tokens.colors.surface,
  },
  fillEmptyState: {
    flex: 1,
  },
});
