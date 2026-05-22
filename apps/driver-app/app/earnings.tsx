import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  PLATFORM_CODE_REGISTRY,
  type DriverPayoutStatus,
  type DriverStatementRecord,
  type MoneyAmount,
  type PlatformEarningsByPlatformResponse,
  type PlatformEarningsItem,
  type PlatformEarningsSummary,
} from "@drts/contracts";

import {
  Banner,
  Btn,
  Card,
  PageHeader,
  Pill,
  Shell,
  driverCanvasTheme,
} from "@/components/canvas-primitives";
import {
  isOwnedPlatformCode,
  isShadowOnlyPlatformCode,
} from "@/components/earnings-by-platform";
import { getDriverClient, isDriverIdentityProvisioned } from "@/lib/api-client";
import {
  formatAmountNumber,
  formatMoney,
  formatSignedAmountNumber,
  getCurrencyLabel,
  sumMoneyAmounts,
} from "@/lib/money";
import { formatDriverPayoutStatusLabel } from "@/lib/operational-labels";
import { driverEarningsPeriodOptions, driverStrings } from "@/lib/strings";

type PeriodKey = "today" | "week" | "month";

const THEME = driverCanvasTheme;
const PERIOD_OPTIONS = driverEarningsPeriodOptions;
const DEFAULT_CURRENCY = "TWD";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return "資料載入失敗，請稍後再試。";
}

function sumPlatformAmounts(
  items: PlatformEarningsItem[],
  key: "grossEarning" | "serviceFee" | "subsidy" | "netAmount",
  predicate: (item: PlatformEarningsItem) => boolean = () => true,
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

function formatCurrentDateLabel() {
  return new Date().toLocaleDateString("zh-TW", {
    month: "numeric",
    day: "numeric",
  });
}

function getHeaderSubtitle(
  period: PeriodKey,
  latestStatementMonth: string | null,
) {
  if (period === "today") {
    return `本日 ${formatCurrentDateLabel()}`;
  }

  if (period === "week") {
    return `本週 ${formatCurrentDateLabel()}`;
  }

  return latestStatementMonth ? `月結 ${latestStatementMonth}` : "本月月結";
}

function getHeroLabel(period: PeriodKey, latestStatementMonth: string | null) {
  if (period === "today") {
    return "淨收入 · 本日";
  }

  if (period === "week") {
    return "淨收入 · 本週";
  }

  return latestStatementMonth
    ? `淨收入 · ${latestStatementMonth}`
    : "淨收入 · 本月";
}

function getHeroContext(period: PeriodKey, latestStatementMonth: string | null) {
  if (period === "month") {
    return latestStatementMonth ? `月結 ${latestStatementMonth}` : "本月月結";
  }

  return "即時切片";
}

function getHeroNote(period: PeriodKey) {
  if (period === "month") {
    return "月結視圖會同時顯示 DRTS 對帳金額與外部平台參考收益。";
  }

  return "此檢視顯示平台收益切片；月結報表仍列出最近對帳週期。";
}

function getPeriodMetricLabel(period: PeriodKey) {
  return period === "month"
    ? driverStrings.earnings.metrics.pendingPayout
    : driverStrings.earnings.metrics.external;
}

function getPlatformDisplayName(platformCode: string) {
  return (
    PLATFORM_CODE_REGISTRY[platformCode as keyof typeof PLATFORM_CODE_REGISTRY]
      ?.displayName ?? platformCode
  );
}

function isEmptyBreakdown(item: PlatformEarningsItem) {
  return (
    item.grossEarning.amountMinor === 0 &&
    item.serviceFee.amountMinor === 0 &&
    item.subsidy.amountMinor === 0 &&
    item.netAmount.amountMinor === 0
  );
}

function getStatementTone(status: DriverPayoutStatus) {
  return status === "paid" ? ("success" as const) : ("warn" as const);
}

function BreakdownRow({
  item,
}: {
  item: PlatformEarningsByPlatformResponse["items"][number];
}) {
  const owned = isOwnedPlatformCode(item.platformCode);
  const shadowOnly = isShadowOnlyPlatformCode(item.platformCode);
  const forwarded = !owned;
  const empty = isEmptyBreakdown(item);
  const typeLabel = owned
    ? driverStrings.platformPresence.owned
    : shadowOnly
      ? "鏡像"
      : driverStrings.platformPresence.external;
  const authorityLabel = owned
    ? "DRTS 結算"
    : shadowOnly
      ? "鏡像參考"
      : "平台結算";
  const authorityTone = owned
    ? ("accent" as const)
    : shadowOnly
      ? ("info" as const)
      : ("warn" as const);
  const markColor = forwarded ? THEME.warn : THEME.accentHi;
  const markBg = forwarded ? THEME.warnBg : THEME.accentBg;
  const displayName = getPlatformDisplayName(item.platformCode);

  return (
    <View
      style={[
        styles.breakdownRow,
        {
          backgroundColor: THEME.surface,
          borderColor: THEME.border,
        },
        empty ? styles.breakdownRowEmpty : null,
      ]}
    >
      <View style={styles.breakdownTopRow}>
        <View style={[styles.platformMark, { backgroundColor: markBg }]}>
          <Text
            style={[
              styles.platformMarkText,
              { color: markColor, fontFamily: THEME.monoFamily },
            ]}
          >
            {String(item.platformCode).slice(0, 4).toUpperCase()}
          </Text>
        </View>

        <View style={styles.breakdownMeta}>
          <View style={styles.breakdownNameRow}>
            <Text
              style={[
                styles.breakdownName,
                { color: THEME.text, fontFamily: THEME.fontFamily },
              ]}
            >
              {displayName}
            </Text>
            <Pill theme={THEME} tone={authorityTone}>
              {typeLabel}
            </Pill>
          </View>
          <Text
            style={[
              styles.breakdownSubline,
              { color: THEME.textMuted, fontFamily: THEME.fontFamily },
            ]}
          >
            {owned
              ? driverStrings.earnings.sections.drtsRecon
              : driverStrings.earnings.sections.financeAuthority}
          </Text>
        </View>

        <View style={styles.breakdownValueWrap}>
          <Text
            style={[
              styles.breakdownValue,
              { color: THEME.text, fontFamily: THEME.monoFamily },
            ]}
          >
            {formatAmountNumber(item.netAmount, { zeroPlaceholder: "—" })}
          </Text>
          <Text
            style={[
              styles.breakdownCurrency,
              { color: THEME.textDim, fontFamily: THEME.fontFamily },
            ]}
          >
            {item.netAmount.currency}
          </Text>
        </View>
      </View>

      <View
        style={[
          styles.breakdownDetailRow,
          {
            borderTopColor: THEME.border,
          },
        ]}
      >
        <Text
          style={[
            styles.breakdownDetailText,
            { color: THEME.textMuted, fontFamily: THEME.fontFamily },
          ]}
        >
          毛收{" "}
          <Text
            style={[
              styles.breakdownDetailValue,
              { color: THEME.text, fontFamily: THEME.monoFamily },
            ]}
          >
            {formatAmountNumber(item.grossEarning)}
          </Text>
        </Text>
        <Text
          style={[
            styles.breakdownDetailText,
            { color: THEME.textMuted, fontFamily: THEME.fontFamily },
          ]}
        >
          抽成{" "}
          <Text
            style={[
              styles.breakdownDetailValue,
              { color: THEME.text, fontFamily: THEME.monoFamily },
            ]}
          >
            {item.serviceFee.amountMinor === 0
              ? "0"
              : formatSignedAmountNumber({
                  ...item.serviceFee,
                  amountMinor: -Math.abs(item.serviceFee.amountMinor),
                })}
          </Text>
        </Text>
        <Text
          style={[
            styles.breakdownDetailText,
            { color: THEME.textMuted, fontFamily: THEME.fontFamily },
          ]}
        >
          補助{" "}
          <Text
            style={[
              styles.breakdownDetailValue,
              { color: THEME.text, fontFamily: THEME.monoFamily },
            ]}
          >
            {formatSignedAmountNumber(item.subsidy)}
          </Text>
        </Text>
        <Text
          style={[
            styles.breakdownAuthority,
            {
              color:
                authorityTone === "accent"
                  ? THEME.accentHi
                  : authorityTone === "info"
                    ? THEME.info
                    : THEME.warn,
              fontFamily: THEME.fontFamily,
            },
          ]}
        >
          {authorityLabel}
        </Text>
      </View>
    </View>
  );
}

function StatementRow({
  statement,
  last,
}: {
  statement: DriverStatementRecord;
  last: boolean;
}) {
  return (
    <View
      style={[
        styles.statementRow,
        {
          borderBottomColor: THEME.border,
        },
        last ? styles.statementRowLast : null,
      ]}
    >
      <View style={styles.statementCopy}>
        <Text
          style={[
            styles.statementTitle,
            { color: THEME.text, fontFamily: THEME.fontFamily },
          ]}
        >
          {statement.periodMonth} 月結
        </Text>
        <Text
          style={[
            styles.statementSubtitle,
            { color: THEME.textMuted, fontFamily: THEME.fontFamily },
          ]}
        >
          {statement.lines.length} 趟 · {formatDriverPayoutStatusLabel(statement.payoutStatus)}
        </Text>
      </View>

      <View style={styles.statementValueWrap}>
        <Pill theme={THEME} tone={getStatementTone(statement.payoutStatus)}>
          {formatDriverPayoutStatusLabel(statement.payoutStatus)}
        </Pill>
        <Text
          style={[
            styles.statementAmount,
            { color: THEME.text, fontFamily: THEME.monoFamily },
          ]}
        >
          {formatMoney(statement.netAmount)}
        </Text>
      </View>
    </View>
  );
}

export default function EarningsScreen() {
  const [summary, setSummary] = useState<PlatformEarningsSummary | null>(null);
  const [platformItems, setPlatformItems] = useState<
    PlatformEarningsByPlatformResponse["items"]
  >([]);
  const [statements, setStatements] = useState<DriverStatementRecord[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodKey>("today");
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
      setRefreshing(false);
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
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  }, [isProvisioned, selectedPeriod]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDashboard(selectedPeriod);
    setRefreshing(false);
  };

  const handleSelectPeriod = (period: PeriodKey) => {
    if (period === selectedPeriod || refreshing) {
      return;
    }

    setRefreshing(true);
    setSelectedPeriod(period);
  };

  if (!isProvisioned) {
    return (
      <Shell theme={THEME} contentContainerStyle={styles.shellContent}>
        <PageHeader
          theme={THEME}
          title={driverStrings.earnings.title}
          subtitle="需要完成裝置綁定"
        />
        <Banner
          theme={THEME}
          tone="warn"
          title="裝置尚未綁定司機身份"
          body="完成裝置註冊後，才能查看平台收益與月結報表。"
          icon={<Ionicons name="card-outline" size={16} color={THEME.warn} />}
        />
      </Shell>
    );
  }

  if (loading) {
    return (
      <Shell theme={THEME} contentContainerStyle={styles.loadingShellContent}>
        <PageHeader
          theme={THEME}
          title={driverStrings.earnings.title}
          subtitle={driverStrings.earnings.loadingSubtitle}
        />
        <View style={styles.loadingCard}>
          <ActivityIndicator size="large" color={THEME.accent} />
          <Text
            style={[
              styles.loadingLabel,
              { color: THEME.textMuted, fontFamily: THEME.fontFamily },
            ]}
          >
            載入收益資料中…
          </Text>
        </View>
      </Shell>
    );
  }

  if (!earningsEnabled) {
    return (
      <Shell theme={THEME} contentContainerStyle={styles.shellContent}>
        <PageHeader
          theme={THEME}
          title={driverStrings.earnings.title}
          subtitle="收益功能未啟用"
        />
        <Banner
          theme={THEME}
          tone="info"
          title="收益儀表板暫停提供"
          body="此功能目前未啟用，請稍後再試或改從設定頁確認帳務通知。"
          icon={
            <Ionicons name="wallet-outline" size={16} color={THEME.info} />
          }
        />
      </Shell>
    );
  }

  const baseCurrency =
    platformItems[0]?.netAmount.currency ??
    statements[0]?.netAmount.currency ??
    summary?.totalNet.currency ??
    DEFAULT_CURRENCY;
  const currencyLabel = getCurrencyLabel(baseCurrency);
  const latestStatementMonth = getLatestStatementMonth(statements);
  const grossAmount = sumPlatformAmounts(
    platformItems,
    "grossEarning",
    () => true,
    baseCurrency,
  );
  const feeAmount = sumPlatformAmounts(
    platformItems,
    "serviceFee",
    () => true,
    baseCurrency,
  );
  const netAmount = sumPlatformAmounts(
    platformItems,
    "netAmount",
    () => true,
    baseCurrency,
  );
  const forwardedPlatformAmount = sumPlatformAmounts(
    platformItems,
    "netAmount",
    (item) =>
      !isOwnedPlatformCode(item.platformCode) &&
      !isShadowOnlyPlatformCode(item.platformCode),
    baseCurrency,
  );
  const pendingPayoutAmount = sumStatementAmounts(
    statements,
    "netAmount",
    (statement) => statement.payoutStatus !== "paid",
  );
  const hasAnyData = platformItems.length > 0 || statements.length > 0;
  const metricAmount =
    selectedPeriod === "month" ? pendingPayoutAmount : forwardedPlatformAmount;
  const summaryNotes = summary?.notes ?? [];

  if (error && !hasAnyData) {
    return (
      <Shell theme={THEME} contentContainerStyle={styles.shellContent}>
        <PageHeader
          theme={THEME}
          title={driverStrings.earnings.title}
          subtitle="收益資料同步失敗"
          actions={
            <Btn
              theme={THEME}
              variant="secondary"
              size="sm"
              icon={
                <Ionicons name="refresh" size={13} color={THEME.text} />
              }
              onPress={() => void onRefresh()}
            >
              {driverStrings.common.retry}
            </Btn>
          }
        />
        <Banner
          theme={THEME}
          tone="danger"
          title="收益資料同步失敗"
          body={error}
          icon={
            <Ionicons name="alert-circle" size={16} color={THEME.danger} />
          }
        />
      </Shell>
    );
  }

  return (
    <Shell theme={THEME} contentContainerStyle={styles.shellContent}>
      <PageHeader
        theme={THEME}
        title={driverStrings.earnings.title}
        subtitle={getHeaderSubtitle(selectedPeriod, latestStatementMonth)}
        actions={
          <Btn
            theme={THEME}
            variant="ghost"
            size="xs"
            icon={
              <Ionicons name="refresh" size={13} color={THEME.textMuted} />
            }
            onPress={() => void onRefresh()}
            disabled={refreshing}
          >
            {refreshing ? "同步中" : driverStrings.common.refresh}
          </Btn>
        }
      />

      {error ? (
        <Banner
          theme={THEME}
          tone="warn"
          title="資料可能不是最新"
          body={error}
          icon={<Ionicons name="warning-outline" size={16} color={THEME.warn} />}
        />
      ) : null}

      <View style={styles.periodStrip}>
        <Text
          style={[
            styles.periodLabel,
            { color: THEME.textMuted, fontFamily: THEME.fontFamily },
          ]}
        >
          {driverStrings.earnings.periodEyebrow}
        </Text>
        <View style={styles.periodButtons}>
          {PERIOD_OPTIONS.map((option) => {
            const active = option.value === selectedPeriod;
            return (
              <Btn
                key={option.value}
                theme={THEME}
                variant={active ? "primary" : "secondary"}
                size="sm"
                disabled={refreshing && !active}
                onPress={() => handleSelectPeriod(option.value as PeriodKey)}
              >
                {option.label}
              </Btn>
            );
          })}
        </View>
      </View>

      <Card theme={THEME} padding={18} style={styles.heroCard}>
        <Text
          style={[
            styles.heroEyebrow,
            { color: THEME.textMuted, fontFamily: THEME.fontFamily },
          ]}
        >
          {getHeroLabel(selectedPeriod, latestStatementMonth)}
        </Text>

        <View style={styles.heroValueRow}>
          <Text
            style={[
              styles.heroValue,
              { color: THEME.text, fontFamily: THEME.monoFamily },
            ]}
          >
            {formatAmountNumber(netAmount)}
          </Text>
          <Text
            style={[
              styles.heroUnit,
              { color: THEME.textMuted, fontFamily: THEME.fontFamily },
            ]}
          >
            {currencyLabel}
          </Text>
          <Text
            style={[
              styles.heroContext,
              {
                color: selectedPeriod === "month" ? THEME.accentHi : THEME.success,
                fontFamily: THEME.fontFamily,
              },
            ]}
          >
            {getHeroContext(selectedPeriod, latestStatementMonth)}
          </Text>
        </View>

        <Text
          style={[
            styles.heroNote,
            { color: THEME.textMuted, fontFamily: THEME.fontFamily },
          ]}
        >
          {getHeroNote(selectedPeriod)}
        </Text>

        <View
          style={[
            styles.heroMetricRow,
            {
              borderTopColor: THEME.border,
            },
          ]}
        >
          <View style={styles.heroMetricItem}>
            <Text
              style={[
                styles.heroMetricLabel,
                { color: THEME.textMuted, fontFamily: THEME.fontFamily },
              ]}
            >
              {driverStrings.earnings.metrics.gross}
            </Text>
            <Text
              style={[
                styles.heroMetricValue,
                { color: THEME.text, fontFamily: THEME.monoFamily },
              ]}
            >
              {formatAmountNumber(grossAmount)}
            </Text>
          </View>
          <View style={styles.heroMetricItem}>
            <Text
              style={[
                styles.heroMetricLabel,
                { color: THEME.textMuted, fontFamily: THEME.fontFamily },
              ]}
            >
              {driverStrings.earnings.metrics.serviceFee}
            </Text>
            <Text
              style={[
                styles.heroMetricValue,
                { color: THEME.danger, fontFamily: THEME.monoFamily },
              ]}
            >
              {feeAmount.amountMinor === 0
                ? "0"
                : formatSignedAmountNumber({
                    ...feeAmount,
                    amountMinor: -Math.abs(feeAmount.amountMinor),
                  })}
            </Text>
          </View>
          <View style={styles.heroMetricItem}>
            <Text
              style={[
                styles.heroMetricLabel,
                { color: THEME.textMuted, fontFamily: THEME.fontFamily },
              ]}
            >
              {getPeriodMetricLabel(selectedPeriod)}
            </Text>
            <Text
              style={[
                styles.heroMetricValue,
                { color: THEME.warn, fontFamily: THEME.monoFamily },
              ]}
            >
              {formatAmountNumber(metricAmount)}
            </Text>
          </View>
        </View>
      </Card>

      <Banner
        theme={THEME}
        tone="info"
        title={driverStrings.earnings.sections.financeAuthority}
        body={
          <View style={styles.bannerBody}>
            <Text
              style={[
                styles.bannerText,
                { color: THEME.text, fontFamily: THEME.fontFamily },
              ]}
            >
              不同平台有不同的結算權威；外部平台金額為參考值。
            </Text>
            {summaryNotes.map((note) => (
              <View key={note} style={styles.bannerNoteRow}>
                <Ionicons name="sync-outline" size={12} color={THEME.info} />
                <Text
                  style={[
                    styles.bannerNoteText,
                    { color: THEME.text, fontFamily: THEME.fontFamily },
                  ]}
                >
                  {note}
                </Text>
              </View>
            ))}
          </View>
        }
        icon={<Ionicons name="wallet-outline" size={16} color={THEME.info} />}
      />

      <Card
        theme={THEME}
        title={driverStrings.earnings.sections.platformBreakdown}
        subtitle="不同平台有不同的結算權威；外部平台金額為參考值。"
        padding={14}
      >
        {platformItems.length > 0 ? (
          <View style={styles.breakdownList}>
            {platformItems.map((item) => (
              <BreakdownRow key={item.platformCode} item={item} />
            ))}
          </View>
        ) : (
          <Banner
            theme={THEME}
            tone="info"
            title="這段期間還沒有平台收益"
            body="切換到其他期間，或稍後再查看最新對帳彙整。"
            icon={
              <Ionicons name="cash-outline" size={16} color={THEME.info} />
            }
          />
        )}
      </Card>

      <Card
        theme={THEME}
        title={driverStrings.earnings.sections.monthlyStatements}
        subtitle={
          latestStatementMonth
            ? `依對帳週期排序，最新為 ${latestStatementMonth}`
            : "等待最新月結資料"
        }
        padding={0}
      >
        {statements.length > 0 ? (
          <View>
            {statements.map((statement, index) => (
              <StatementRow
                key={statement.statementId}
                statement={statement}
                last={index === statements.length - 1}
              />
            ))}
          </View>
        ) : (
          <View style={styles.statementEmpty}>
            <Text
              style={[
                styles.statementEmptyTitle,
                { color: THEME.text, fontFamily: THEME.fontFamily },
              ]}
            >
              尚無月結報表
            </Text>
            <Text
              style={[
                styles.statementEmptyBody,
                { color: THEME.textMuted, fontFamily: THEME.fontFamily },
              ]}
            >
              本月還沒有可顯示的對帳單，請稍後重新整理。
            </Text>
          </View>
        )}
      </Card>
    </Shell>
  );
}

const styles = StyleSheet.create({
  shellContent: {
    paddingBottom: 28,
    gap: 14,
  },
  loadingShellContent: {
    flexGrow: 1,
    justifyContent: "center",
    gap: 16,
  },
  loadingCard: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    minHeight: 180,
  },
  loadingLabel: {
    fontSize: 14,
  },
  periodStrip: {
    gap: 8,
  },
  periodLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  periodButtons: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  heroCard: {
    borderRadius: 14,
  },
  heroEyebrow: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  heroValueRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
    flexWrap: "wrap",
    marginTop: 4,
  },
  heroValue: {
    fontSize: 38,
    lineHeight: 40,
    fontWeight: "700",
    letterSpacing: -1,
  },
  heroUnit: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 5,
  },
  heroContext: {
    marginLeft: "auto",
    marginBottom: 6,
    fontSize: 12,
    fontWeight: "700",
  },
  heroNote: {
    marginTop: 10,
    fontSize: 12.5,
    lineHeight: 18,
  },
  heroMetricRow: {
    flexDirection: "row",
    gap: 14,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
  },
  heroMetricItem: {
    flex: 1,
    gap: 4,
  },
  heroMetricLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  heroMetricValue: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  bannerBody: {
    gap: 8,
  },
  bannerText: {
    fontSize: 12.5,
    lineHeight: 18,
  },
  bannerNoteRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  bannerNoteText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  breakdownList: {
    gap: 10,
  },
  breakdownRow: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  breakdownRowEmpty: {
    opacity: 0.65,
  },
  breakdownTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  platformMark: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  platformMarkText: {
    fontSize: 12.5,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  breakdownMeta: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  breakdownNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  breakdownName: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: "700",
  },
  breakdownSubline: {
    fontSize: 11.5,
    lineHeight: 16,
  },
  breakdownValueWrap: {
    alignItems: "flex-end",
    gap: 2,
  },
  breakdownValue: {
    fontSize: 18,
    lineHeight: 21,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  breakdownCurrency: {
    fontSize: 10.5,
    lineHeight: 12,
    fontWeight: "600",
  },
  breakdownDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderStyle: "dashed",
    flexWrap: "wrap",
  },
  breakdownDetailText: {
    fontSize: 11,
    lineHeight: 15,
  },
  breakdownDetailValue: {
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: "700",
  },
  breakdownAuthority: {
    marginLeft: "auto",
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: "700",
  },
  statementRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  statementRowLast: {
    borderBottomWidth: 0,
  },
  statementCopy: {
    flex: 1,
    gap: 4,
  },
  statementTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
  },
  statementSubtitle: {
    fontSize: 11.5,
    lineHeight: 16,
  },
  statementValueWrap: {
    alignItems: "flex-end",
    gap: 6,
  },
  statementAmount: {
    fontSize: 15.5,
    lineHeight: 18,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  statementEmpty: {
    paddingHorizontal: 14,
    paddingVertical: 18,
    gap: 6,
  },
  statementEmptyTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
  },
  statementEmptyBody: {
    fontSize: 12,
    lineHeight: 17,
  },
});
