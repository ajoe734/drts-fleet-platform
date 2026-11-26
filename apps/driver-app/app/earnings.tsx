import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Redirect } from "expo-router";
import {
  PLATFORM_CODE_REGISTRY,
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
import { DriverStatementRow } from "@/components/earnings/driver-statement-row";
import {
  isOwnedPlatformCode,
  isShadowOnlyPlatformCode,
} from "@/components/earnings-by-platform";
import {
  formatDriverError,
  getDriverClient,
  isDriverIdentityProvisioned,
  registerProtectedCacheClearHandler,
} from "@/lib/api-client";
import {
  formatAmountNumber,
  formatSignedAmountNumber,
  getCurrencyLabel,
  sumMoneyAmounts,
} from "@/lib/money";
import { driverEarningsPeriodOptions, driverStrings } from "@/lib/strings";
import { listDriverEarningsStatements } from "@/lib/driver-statement-actions";

type PeriodKey = "today" | "week" | "month";

const THEME = driverCanvasTheme;
const PERIOD_OPTIONS = driverEarningsPeriodOptions;
const DEFAULT_CURRENCY = "TWD";

function toErrorMessage(error: unknown): string {
  return formatDriverError(error, "資料載入失敗，請稍後再試。");
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

// Taiwan has a fixed UTC+8 offset (no daylight saving). The earnings API
// resolves today/week/month on the Asia/Taipei calendar, so the labels use the
// same calendar regardless of the device time zone.
const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;

function getTaipeiCalendarDate(now: number) {
  const shifted = new Date(now + TAIPEI_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
  };
}

function formatMonthDay(month: number, day: number) {
  return `${month}/${day}`;
}

function getEarningsPeriodSubtitle(period: PeriodKey) {
  const today = getTaipeiCalendarDate(Date.now());

  if (period === "today") {
    return `今日 ${formatMonthDay(today.month, today.day)}`;
  }

  if (period === "week") {
    // Monday through Sunday, matching the API's calendar week.
    const daysSinceMonday = (today.weekday + 6) % 7;
    const monday = new Date(
      Date.UTC(today.year, today.month - 1, today.day - daysSinceMonday),
    );
    const sunday = new Date(
      Date.UTC(today.year, today.month - 1, today.day - daysSinceMonday + 6),
    );
    return `本週 ${formatMonthDay(
      monday.getUTCMonth() + 1,
      monday.getUTCDate(),
    )}–${formatMonthDay(sunday.getUTCMonth() + 1, sunday.getUTCDate())}`;
  }

  return `本月 ${today.year}年${today.month}月`;
}

function getHeroLabel(period: PeriodKey) {
  if (period === "today") {
    return "淨收入 · 今日";
  }

  if (period === "week") {
    return "淨收入 · 本週";
  }

  return "淨收入 · 本月";
}

function getPeriodMetricLabel(period: PeriodKey) {
  return period === "month"
    ? driverStrings.earnings.metrics.pendingPayout
    : driverStrings.earnings.metrics.external;
}

function getPlatformDisplayName(platformCode: string) {
  // Codes outside the platform registry are the fleet's own dispatch (see
  // isOwnedPlatformCode), so never show the raw code to the driver.
  return (
    PLATFORM_CODE_REGISTRY[platformCode as keyof typeof PLATFORM_CODE_REGISTRY]
      ?.displayName ?? driverStrings.platformPresence.managedByDrts
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
    : driverStrings.platformPresence.external;
  const settlementLabel = owned
    ? driverStrings.earnings.sections.ownedSettlement
    : shadowOnly
      ? driverStrings.earnings.sections.referenceOnly
      : driverStrings.earnings.sections.platformSettlement;
  const typeTone = owned ? ("accent" as const) : ("warn" as const);
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
            {Array.from(displayName)[0]?.toUpperCase() ?? ""}
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
            <Pill theme={THEME} tone={typeTone}>
              {typeLabel}
            </Pill>
          </View>
          <Text
            style={[
              styles.breakdownSubline,
              { color: THEME.textMuted, fontFamily: THEME.fontFamily },
            ]}
          >
            {settlementLabel}
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
            {getCurrencyLabel(item.netAmount.currency)}
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
  const [statementError, setStatementError] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodKey>("today");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [earningsEnabled, setEarningsEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isProvisioned = isDriverIdentityProvisioned();

  useEffect(() => {
    const unregister = registerProtectedCacheClearHandler(() => {
      setSummary(null);
      setPlatformItems([]);
      setStatements([]);
      setStatementError(null);
    });
    return () => unregister();
  }, []);

  const loadDashboard = async (period: PeriodKey) => {
    if (!isDriverIdentityProvisioned()) {
      setSummary(null);
      setPlatformItems([]);
      setStatements([]);
      setStatementError(null);
      return;
    }

    const client = getDriverClient();

    try {
      const requests: [
        Promise<PlatformEarningsSummary>,
        Promise<PlatformEarningsByPlatformResponse>,
        Promise<{ rows: DriverStatementRecord[]; error: string | null }>,
      ] = [
        client.getPlatformEarningsSummary(),
        client.getPlatformEarningsByPlatform(period),
        // A statement read failure has its own retry state and does not hide
        // the independently available platform earnings.
        listDriverEarningsStatements(client).then(
          (rows) => ({ rows, error: null }),
          (readError: unknown) => ({
            rows: [] as DriverStatementRecord[],
            error: formatDriverError(
              readError,
              driverStrings.earnings.statement.listError,
            ),
          }),
        ),
      ];
      const [summaryResponse, byPlatformResponse, statementResult] =
        await Promise.all(requests);

      setSummary(summaryResponse);
      setPlatformItems(byPlatformResponse.items);
      setStatements(
        [...statementResult.rows].sort((left, right) =>
          right.updatedAt.localeCompare(left.updatedAt),
        ),
      );
      setStatementError(statementResult.error);
      setError(null);
    } catch (nextError) {
      setSummary(null);
      setPlatformItems([]);
      setStatements([]);
      setStatementError(null);
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
    return <Redirect href="/onboarding" />;
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
          icon={<Ionicons name="wallet-outline" size={16} color={THEME.info} />}
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
  const hasPeriodEarnings = platformItems.length > 0;
  const hasAnyData = hasPeriodEarnings || statements.length > 0;
  const hasOtherPlatforms = platformItems.some(
    (item) => !isOwnedPlatformCode(item.platformCode),
  );
  const metricAmount =
    selectedPeriod === "month" ? pendingPayoutAmount : forwardedPlatformAmount;

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
              icon={<Ionicons name="refresh" size={13} color={THEME.text} />}
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
          icon={<Ionicons name="alert-circle" size={16} color={THEME.danger} />}
        />
      </Shell>
    );
  }

  return (
    <Shell theme={THEME} contentContainerStyle={styles.shellContent}>
      <PageHeader
        theme={THEME}
        title={driverStrings.earnings.title}
        subtitle={getEarningsPeriodSubtitle(selectedPeriod)}
        actions={
          <Btn
            theme={THEME}
            variant="ghost"
            size="xs"
            icon={<Ionicons name="refresh" size={13} color={THEME.textMuted} />}
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
          icon={
            <Ionicons name="warning-outline" size={16} color={THEME.warn} />
          }
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

      {hasPeriodEarnings ? (
        <>
          <Card theme={THEME} padding={18} style={styles.heroCard}>
            <Text
              style={[
                styles.heroEyebrow,
                { color: THEME.textMuted, fontFamily: THEME.fontFamily },
              ]}
            >
              {getHeroLabel(selectedPeriod)}
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
            </View>

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

          <Card
            theme={THEME}
            title={driverStrings.earnings.sections.platformBreakdown}
            subtitle={
              hasOtherPlatforms
                ? driverStrings.earnings.sections.platformNote
                : undefined
            }
            padding={14}
          >
            <View style={styles.breakdownList}>
              {platformItems.map((item) => (
                <BreakdownRow key={item.platformCode} item={item} />
              ))}
            </View>
          </Card>
        </>
      ) : (
        <Card theme={THEME} padding={18}>
          <Text
            style={[
              styles.emptyPeriodText,
              { color: THEME.text, fontFamily: THEME.fontFamily },
            ]}
          >
            {driverStrings.earnings.emptyPeriod}
          </Text>
        </Card>
      )}

      {statements.length > 0 || statementError ? (
        <Card
          theme={THEME}
          title={driverStrings.earnings.sections.monthlyStatements}
          padding={0}
        >
          {statements.length > 0 ? (
            <View>
              {statements.map((statement, index) => (
                <DriverStatementRow
                  key={statement.statementId}
                  statement={statement}
                  last={index === statements.length - 1}
                  onLoaded={(record) =>
                    setStatements((rows) =>
                      rows.map((row) =>
                        row.statementId === record.statementId ? record : row,
                      ),
                    )
                  }
                />
              ))}
            </View>
          ) : (
            <View style={styles.statementEmpty}>
              <Banner
                theme={THEME}
                tone="warn"
                title={driverStrings.earnings.statement.errorTitle}
                body={statementError}
              />
              <Btn
                theme={THEME}
                disabled={refreshing}
                onPress={() => void onRefresh()}
              >
                {driverStrings.earnings.statement.listRetry}
              </Btn>
            </View>
          )}
        </Card>
      ) : null}
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
  statementEmpty: {
    paddingHorizontal: 14,
    paddingVertical: 18,
    gap: 6,
  },
  emptyPeriodText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
});
