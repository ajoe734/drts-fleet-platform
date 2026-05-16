import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
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
  PageHeader,
  SegmentedControl,
  StatusChip,
  Tokens,
} from "@/components/ui";
import { getDriverClient, isDriverIdentityProvisioned } from "@/lib/api-client";
import { driverEarningsPeriodOptions, driverStrings } from "@/lib/strings";
import { formatMoney, getCurrencyLabel, sumMoneyAmounts } from "@/lib/money";
import { formatDriverPayoutStatusLabel } from "@/lib/operational-labels";

type PeriodKey = "today" | "week" | "month";

const PERIOD_OPTIONS = driverEarningsPeriodOptions;

const DEFAULT_CURRENCY = "TWD";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return "資料載入失敗，請稍後再試。";
}

function sumPlatformAmounts(
  items: Array<{
    grossEarning: MoneyAmount;
    serviceFee: MoneyAmount;
    subsidy: MoneyAmount;
    netAmount: MoneyAmount;
    platformCode: string;
  }>,
  key: "grossEarning" | "serviceFee" | "subsidy" | "netAmount",
  predicate: (item: {
    grossEarning: MoneyAmount;
    serviceFee: MoneyAmount;
    subsidy: MoneyAmount;
    netAmount: MoneyAmount;
    platformCode: string;
  }) => boolean = () => true,
  currency = DEFAULT_CURRENCY,
): MoneyAmount {
  return sumMoneyAmounts(
    items.filter(predicate).map((item) => item[key]),
    currency,
  );
}

function sumStatementAmounts(
  statements: DriverStatementRecord[],
  key: "grossEarning" | "serviceFee" | "subsidy" | "netAmount",
  predicate: (statement: DriverStatementRecord) => boolean = () => true,
): MoneyAmount {
  const currency =
    statements[0]?.netAmount.currency ??
    statements[0]?.grossEarning.currency ??
    DEFAULT_CURRENCY;
  return sumMoneyAmounts(
    statements.filter(predicate).map((statement) => statement[key]),
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

  return "今日與本週顯示平台收益切片；月結對帳單仍以本月檢視提供。";
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

function getHeroLabel(period: PeriodKey, latestStatementMonth: string | null) {
  if (period === "today") {
    return "淨收入 · 今日";
  }

  if (period === "week") {
    return "淨收入 · 本週";
  }

  return latestStatementMonth
    ? `淨收入 · ${latestStatementMonth}`
    : "淨收入 · 本月";
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? (
          <Text style={styles.sectionSubtitle}>{subtitle}</Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function MetricColumn({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "danger" | "warning";
}) {
  return (
    <View style={styles.metricColumn}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text
        style={[
          styles.metricValue,
          tone === "danger"
            ? styles.metricValueDanger
            : tone === "warning"
              ? styles.metricValueWarning
              : null,
        ]}
      >
        {value}
      </Text>
    </View>
  );
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
      style={styles.inlineEmptyState}
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
        <PageHeader
          title={driverStrings.earnings.title}
          subtitle={driverStrings.earnings.loadingSubtitle}
        />
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
        <PageHeader
          title={driverStrings.earnings.title}
          subtitle="需要完成裝置綁定"
        />
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
        <PageHeader
          title={driverStrings.earnings.title}
          subtitle="收益功能未啟用"
        />
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
    platformItems[0]?.netAmount.currency ??
    statements[0]?.netAmount.currency ??
    summary?.totalNet.currency ??
    DEFAULT_CURRENCY;
  const currencyLabel = getCurrencyLabel(baseCurrency);
  const latestStatementMonth = getLatestStatementMonth(statements);
  const displayedStatements =
    selectedPeriod === "month"
      ? filterStatementsForPeriod(statements, "month")
      : [];
  const displayedPlatformItems = platformItems;
  const grossAmount = sumPlatformAmounts(
    displayedPlatformItems,
    "grossEarning",
    () => true,
    baseCurrency,
  );
  const feeAmount = sumPlatformAmounts(
    displayedPlatformItems,
    "serviceFee",
    () => true,
    baseCurrency,
  );
  const netAmount = sumPlatformAmounts(
    displayedPlatformItems,
    "netAmount",
    () => true,
    baseCurrency,
  );
  const drtsStatementAmount = sumStatementAmounts(
    displayedStatements,
    "netAmount",
  );
  const forwardedPlatformItems = displayedPlatformItems.filter(
    (item) => !isOwnedPlatformCode(item.platformCode),
  );
  const shadowOnlyPlatformItems = displayedPlatformItems.filter((item) =>
    isShadowOnlyPlatformCode(item.platformCode),
  );
  const externalPlatformAmount = sumPlatformAmounts(
    displayedPlatformItems,
    "netAmount",
    (item) =>
      !isOwnedPlatformCode(item.platformCode) &&
      !isShadowOnlyPlatformCode(item.platformCode),
    baseCurrency,
  );
  const pendingPayoutAmount = sumStatementAmounts(
    displayedStatements,
    "netAmount",
    (statement) => statement.payoutStatus !== "paid",
  );
  const paidPayoutAmount = sumStatementAmounts(
    displayedStatements,
    "netAmount",
    (statement) => statement.payoutStatus === "paid",
  );
  const summaryNotes = summary?.notes ?? [];
  const hasAnyData =
    displayedPlatformItems.length > 0 || displayedStatements.length > 0;

  if (error && !hasAnyData) {
    return (
      <View style={styles.screen}>
        <PageHeader
          title={driverStrings.earnings.title}
          subtitle="收益資料同步失敗"
        />
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
        title={driverStrings.earnings.title}
        subtitle={getPeriodDescription(selectedPeriod, latestStatementMonth)}
        rightElement={
          <IconButton
            icon="refresh"
            onPress={onRefresh}
            disabled={refreshing}
            accessibilityLabel="重新整理收益儀表板"
          />
        }
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Tokens.colors.primary}
          />
        }
      >
        {error ? <ErrorBanner message={`資料可能不是最新：${error}`} /> : null}

        <View style={styles.periodCard}>
          <Text style={styles.periodEyebrow}>
            {driverStrings.earnings.periodEyebrow}
          </Text>
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

        <View style={styles.heroCard}>
          <Text style={styles.heroEyebrow}>
            {getHeroLabel(selectedPeriod, latestStatementMonth)}
          </Text>
          <View style={styles.heroValueRow}>
            <Text style={styles.heroValue}>{formatMoney(netAmount)}</Text>
            <Text style={styles.heroUnit}>{currencyLabel}</Text>
          </View>
          <Text style={styles.heroNote}>
            {selectedPeriod === "month"
              ? "月結視圖會同時顯示 DRTS 對帳金額與外部平台參考收益。"
              : "此檢視顯示平台收益切片；實際月結請切換到本月查看。"}
          </Text>

          <View style={styles.heroMetricsRow}>
            <MetricColumn label="毛收" value={formatMoney(grossAmount)} />
            <MetricColumn
              label="平台抽成"
              value={formatMoney(feeAmount)}
              tone="danger"
            />
            <MetricColumn
              label={selectedPeriod === "month" ? "待撥款" : "外部平台"}
              value={
                selectedPeriod === "month"
                  ? formatMoney(pendingPayoutAmount)
                  : formatMoney(externalPlatformAmount)
              }
              tone="warning"
            />
          </View>
        </View>

        <View style={styles.bannerStack}>
          <AuthorityBanner
            title="DRTS 對帳與撥款"
            authorityLabel={
              displayedStatements.length > 0
                ? `${displayedStatements.length} 筆 DRTS 對帳單`
                : "本期尚無 DRTS 對帳單"
            }
            description="只有進入 DRTS 對帳單的金額，才會出現在待撥款與已撥款追蹤。"
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
            description="外部平台與 shadow-only 鏡像金額僅供比對；不會自動進入 DRTS 待撥款。"
            tone="platform"
            icon="swap-horizontal"
          />
        </View>

        <SectionCard
          title="平台分項"
          subtitle="不同平台有不同的結算權威；外部平台金額為參考值。"
        >
          <EarningsByPlatform items={displayedPlatformItems} />
        </SectionCard>

        <SectionCard
          title="月結報表"
          subtitle={
            selectedPeriod === "month"
              ? latestStatementMonth
                ? `最新週期 ${latestStatementMonth}`
                : "等待最新月結資料"
              : "切換到本月可查看最新 DRTS 對帳單"
          }
        >
          {displayedStatements.length > 0 ? (
            <View style={styles.statementList}>
              {displayedStatements.map((item) => (
                <View key={item.statementId} style={styles.statementCard}>
                  <View style={styles.statementHeader}>
                    <View style={styles.statementTextBlock}>
                      <Text style={styles.statementTitle}>
                        {item.periodMonth} 月結
                      </Text>
                      <Text style={styles.statementSubtitle}>
                        {item.lines.length} 筆行程 · {item.receiptNo}
                      </Text>
                    </View>
                    <StatusChip
                      label={formatDriverPayoutStatusLabel(item.payoutStatus)}
                      variant={getStatementStatusVariant(item.payoutStatus)}
                    />
                  </View>

                  <View style={styles.statementMetaRow}>
                    <Text style={styles.statementMeta}>
                      費率版本 {item.feePlanVersion}
                    </Text>
                    <Text style={styles.statementAmount}>
                      {formatMoney(item.netAmount)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <StatementSectionEmpty
              selectedPeriod={selectedPeriod}
              onResetPeriod={
                selectedPeriod === "month"
                  ? onRefresh
                  : () => setSelectedPeriod("month")
              }
            />
          )}
        </SectionCard>

        {!hasAnyData && !error ? (
          <EmptyState
            title={getEmptyPeriodTitle(selectedPeriod)}
            description="本期尚未生成收益或對帳資料，請稍後重新整理。"
            icon="cash-outline"
            actionTitle="重新整理"
            onAction={onRefresh}
            style={styles.fillEmptyState}
          />
        ) : null}

        {selectedPeriod === "month" ? (
          <View style={styles.footerSummaryCard}>
            <View style={styles.footerSummaryRow}>
              <Text style={styles.footerSummaryLabel}>DRTS 對帳金額</Text>
              <Text style={styles.footerSummaryValue}>
                {formatMoney(drtsStatementAmount)}
              </Text>
            </View>
            <View style={styles.footerSummaryRow}>
              <Text style={styles.footerSummaryLabel}>外部平台結算</Text>
              <Text style={styles.footerSummaryValue}>
                {formatMoney(externalPlatformAmount)}
              </Text>
            </View>
            <View style={styles.footerSummaryRow}>
              <Text style={styles.footerSummaryLabel}>已撥款</Text>
              <Text style={styles.footerSummaryValue}>
                {formatMoney(paidPayoutAmount)}
              </Text>
            </View>
          </View>
        ) : null}

        {summaryNotes.length > 0 ? (
          <View style={styles.notesCard}>
            {summaryNotes.map((note) => (
              <Text key={note} style={styles.noteText}>
                • {note}
              </Text>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Tokens.colors.appBg,
  },
  scrollContent: {
    padding: Tokens.layout.pagePadding,
    paddingBottom: Tokens.spacing["4xl"],
    gap: Tokens.spacing.md,
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
  fillEmptyState: {
    minHeight: 220,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    borderRadius: Tokens.radius.lg,
    backgroundColor: Tokens.colors.surface,
  },
  inlineEmptyState: {
    flex: 0,
    minHeight: 180,
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
  periodCard: {
    backgroundColor: Tokens.colors.surface,
    borderRadius: Tokens.radius.lg,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    padding: Tokens.spacing.lg,
    gap: Tokens.spacing.sm,
  },
  periodEyebrow: {
    ...Tokens.type.micro,
    color: Tokens.colors.textMuted,
  },
  periodDescription: {
    ...Tokens.type.small,
    color: Tokens.colors.textMuted,
  },
  heroCard: {
    backgroundColor: Tokens.colors.surface,
    borderRadius: Tokens.radius.xl,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    padding: Tokens.spacing.xl,
    gap: Tokens.spacing.sm,
    ...Tokens.shadows.md,
  },
  heroEyebrow: {
    ...Tokens.type.micro,
    color: Tokens.colors.textMuted,
  },
  heroValueRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: Tokens.spacing.sm,
  },
  heroValue: {
    fontSize: 34,
    lineHeight: 38,
    fontWeight: "700",
    color: Tokens.colors.textStrong,
    letterSpacing: -1,
    fontFamily: Tokens.fonts.mono,
  },
  heroUnit: {
    ...Tokens.type.label,
    color: Tokens.colors.textMuted,
    marginBottom: 5,
  },
  heroNote: {
    ...Tokens.type.small,
    color: Tokens.colors.textMuted,
  },
  heroMetricsRow: {
    flexDirection: "row",
    gap: Tokens.spacing.md,
    paddingTop: Tokens.spacing.md,
    marginTop: Tokens.spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Tokens.colors.border,
  },
  metricColumn: {
    flex: 1,
    gap: 2,
  },
  metricLabel: {
    ...Tokens.type.micro,
    color: Tokens.colors.textMuted,
  },
  metricValue: {
    ...Tokens.type.title,
    color: Tokens.colors.textStrong,
    fontFamily: Tokens.fonts.mono,
  },
  metricValueDanger: {
    color: Tokens.colors.danger,
  },
  metricValueWarning: {
    color: Tokens.colors.warning,
  },
  bannerStack: {
    gap: Tokens.spacing.sm,
  },
  sectionCard: {
    backgroundColor: Tokens.colors.bgRaised,
    borderRadius: Tokens.radius.xl,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    padding: Tokens.spacing.lg,
    gap: Tokens.spacing.md,
  },
  sectionHeader: {
    gap: 2,
  },
  sectionTitle: {
    ...Tokens.type.sectionTitle,
    color: Tokens.colors.textStrong,
  },
  sectionSubtitle: {
    ...Tokens.type.small,
    color: Tokens.colors.textMuted,
  },
  statementList: {
    gap: Tokens.spacing.sm,
  },
  statementCard: {
    backgroundColor: Tokens.colors.surface,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    borderRadius: Tokens.radius.lg,
    padding: Tokens.spacing.md,
    gap: Tokens.spacing.md,
  },
  statementHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: Tokens.spacing.sm,
  },
  statementTextBlock: {
    flex: 1,
    gap: 2,
  },
  statementTitle: {
    ...Tokens.type.title,
    color: Tokens.colors.textStrong,
  },
  statementSubtitle: {
    ...Tokens.type.small,
    color: Tokens.colors.textBody,
  },
  statementMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: Tokens.spacing.md,
    paddingTop: Tokens.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Tokens.colors.border,
  },
  statementMeta: {
    ...Tokens.type.micro,
    color: Tokens.colors.textMuted,
    flex: 1,
  },
  statementAmount: {
    ...Tokens.type.title,
    color: Tokens.colors.textStrong,
    fontFamily: Tokens.fonts.mono,
  },
  footerSummaryCard: {
    backgroundColor: Tokens.colors.surfaceLo,
    borderRadius: Tokens.radius.lg,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    padding: Tokens.spacing.lg,
    gap: Tokens.spacing.sm,
  },
  footerSummaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: Tokens.spacing.md,
  },
  footerSummaryLabel: {
    ...Tokens.type.small,
    color: Tokens.colors.textMuted,
  },
  footerSummaryValue: {
    ...Tokens.type.bodyStrong,
    color: Tokens.colors.textStrong,
    fontFamily: Tokens.fonts.mono,
  },
  notesCard: {
    backgroundColor: Tokens.colors.surfaceLo,
    borderRadius: Tokens.radius.lg,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    padding: Tokens.spacing.md,
    gap: Tokens.spacing.xs,
  },
  noteText: {
    ...Tokens.type.small,
    color: Tokens.colors.textMuted,
  },
});
