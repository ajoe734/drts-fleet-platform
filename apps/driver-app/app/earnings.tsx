import { useCallback, useEffect, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type {
  CrossAppResourceLink,
  DriverEarningsDashboard,
  DriverEarningsPeriod,
  DriverEarningsStatementListItem,
  DriverStatementRecord,
  EmptyReason,
  ResourceActionDescriptor,
  UiRefreshMetadata,
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
import { getDriverClient, isDriverIdentityProvisioned } from "@/lib/api-client";
import { openCrossAppLink } from "@/lib/cross-app-links";
import {
  formatAmountNumber,
  formatMoney,
  formatSignedAmountNumber,
  getCurrencyLabel,
} from "@/lib/money";
import { formatDriverPayoutStatusLabel } from "@/lib/operational-labels";
import { driverStrings } from "@/lib/strings";

const THEME = driverCanvasTheme;
const PERIOD_OPTIONS: Array<{ key: DriverEarningsPeriod; label: string }> = [
  { key: "today", label: "本日 · today" },
  { key: "week", label: "本週 · week" },
  { key: "month", label: "本月 · month" },
];

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return "資料載入失敗，請稍後再試。";
}

function findAction(
  actions: ResourceActionDescriptor[] | undefined,
  actionName: string,
) {
  return actions?.find((action) => action.action === actionName) ?? null;
}

function getHeaderSubtitle(period: DriverEarningsPeriod) {
  if (period === "today") {
    return "收入檢視 · 本日";
  }
  if (period === "week") {
    return "收入檢視 · 本週";
  }
  return "收入檢視 · 本月";
}

function getSummaryLabel(period: DriverEarningsPeriod) {
  if (period === "today") {
    return "淨收入 · 本日";
  }
  if (period === "week") {
    return "淨收入 · 本週";
  }
  return "淨收入 · 本月";
}

function getRefreshTone(refresh: UiRefreshMetadata) {
  switch (refresh.dataFreshness) {
    case "fresh":
      return "success" as const;
    case "stale":
      return "warn" as const;
    case "degraded":
      return "danger" as const;
    default:
      return "neutral" as const;
  }
}

function formatRefreshLabel(refresh: UiRefreshMetadata) {
  const stamp = new Date(refresh.generatedAt).toLocaleTimeString("zh-TW", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${refresh.dataFreshness} · ${stamp}`;
}

function getRefreshSourceLabel(refresh: UiRefreshMetadata) {
  switch (refresh.source) {
    case "live":
      return "live snapshot";
    case "cache":
      return "cache snapshot";
    case "sandbox":
      return "sandbox snapshot";
    case "static":
      return "static snapshot";
    default:
      return "snapshot";
  }
}

function getActionLabel(action: ResourceActionDescriptor | null | undefined) {
  switch (action?.action) {
    case "refresh_earnings":
      return "重新整理";
    case "view_statement_detail":
      return "查看明細";
    case "open_manager_review":
      return "前往派車台覆核";
    default:
      return "繼續";
  }
}

function getDisabledReasonMessage(code?: string) {
  switch (code) {
    case "feature_disabled":
      return "目前功能尚未開放。";
    case "permission_denied":
      return "你的帳號目前沒有這個操作權限。";
    case "external_unavailable":
      return "外部平台暫時無法提供這個操作。";
    case "statement_locked":
      return "月結尚未完成，暫時不能查看明細。";
    default:
      return "目前無法執行這個操作。";
  }
}

function getEmptyContent(
  reason: EmptyReason,
  detail?: string | null,
  nextAction?: ResourceActionDescriptor | null,
) {
  switch (reason) {
    case "not_provisioned":
      return {
        tone: "warn" as const,
        title: "裝置尚未綁定司機身份",
        body: "完成裝置註冊後，才能查看平台收益與月結報表。",
        icon: "card-outline" as const,
        actionLabel: nextAction ? getActionLabel(nextAction) : "前往設定",
      };
    case "permission_denied":
      return {
        tone: "info" as const,
        title: "目前無法查看收益頁",
        body: detail ?? "你的目前權限或功能旗標不允許開啟收益資料。",
        icon: "lock-closed-outline" as const,
        actionLabel: nextAction ? getActionLabel(nextAction) : null,
      };
    case "fetch_failed":
      return {
        tone: "danger" as const,
        title: "收益資料同步失敗",
        body: detail ?? "請稍後重試，或切回工作台確認網路與帳務服務狀態。",
        icon: "alert-circle-outline" as const,
        actionLabel: nextAction ? getActionLabel(nextAction) : "重新整理",
      };
    case "external_unavailable":
      return {
        tone: "warn" as const,
        title: "外部平台帳務暫時不可用",
        body: "目前只顯示 DRTS 可確認的資料；外部平台對帳需稍後再同步。",
        icon: "cloud-offline-outline" as const,
        actionLabel: nextAction ? getActionLabel(nextAction) : "重新整理",
      };
    case "driver_not_eligible":
      return {
        tone: "info" as const,
        title: "目前尚未符合收益顯示條件",
        body: "請先完成派車台要求的綁定或資格檢查，之後再重新整理。",
        icon: "shield-checkmark-outline" as const,
        actionLabel: nextAction ? getActionLabel(nextAction) : null,
      };
    case "filtered_empty":
      return {
        tone: "info" as const,
        title: "這個條件下沒有資料",
        body: "調整期間或篩選條件後，再查看其他帳務切片。",
        icon: "funnel-outline" as const,
        actionLabel: nextAction ? getActionLabel(nextAction) : null,
      };
    case "no_data":
    default:
      return {
        tone: "info" as const,
        title: "這段期間還沒有平台收益",
        body: "切換到其他期間，或稍後再查看最新對帳彙整。",
        icon: "wallet-outline" as const,
        actionLabel: nextAction ? getActionLabel(nextAction) : "重新整理",
      };
  }
}

function StatementDetailSheet({
  visible,
  statement,
  loading,
  onClose,
}: {
  visible: boolean;
  statement: DriverStatementRecord | null;
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.sheetBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.sheetCard,
            { backgroundColor: THEME.surface, borderColor: THEME.border },
          ]}
        >
          <View style={styles.sheetHandleWrap}>
            <View
              style={[
                styles.sheetHandle,
                { backgroundColor: THEME.borderStrong },
              ]}
            />
          </View>
          <View style={styles.sheetHeader}>
            <View style={styles.sheetHeaderCopy}>
              <Text
                style={[
                  styles.sheetTitle,
                  { color: THEME.text, fontFamily: THEME.fontFamily },
                ]}
              >
                月結明細
              </Text>
              <Text
                style={[
                  styles.sheetSubtitle,
                  { color: THEME.textMuted, fontFamily: THEME.fontFamily },
                ]}
              >
                receipt / fee plan / payout
              </Text>
            </View>
            <Btn theme={THEME} variant="ghost" size="xs" onPress={onClose}>
              關閉
            </Btn>
          </View>

          {loading ? (
            <View style={styles.sheetLoadingWrap}>
              <ActivityIndicator size="small" color={THEME.accent} />
              <Text
                style={[
                  styles.sheetLoadingText,
                  { color: THEME.textMuted, fontFamily: THEME.fontFamily },
                ]}
              >
                載入月結明細中…
              </Text>
            </View>
          ) : statement ? (
            <View style={styles.sheetBody}>
              <View style={styles.sheetMetricRow}>
                <DetailMetric
                  label="Receipt"
                  value={statement.receiptNo}
                  mono
                />
                <DetailMetric
                  label="Fee plan"
                  value={statement.feePlanVersion}
                  mono
                />
              </View>
              <View style={styles.sheetMetricRow}>
                <DetailMetric label="期間" value={statement.periodMonth} mono />
                <DetailMetric
                  label="趟次"
                  value={`${statement.lines.length}`}
                  mono
                />
              </View>
              <View style={styles.sheetStatusRow}>
                <Pill
                  theme={THEME}
                  tone={statement.payoutStatus === "paid" ? "success" : "warn"}
                >
                  {formatDriverPayoutStatusLabel(statement.payoutStatus)}
                </Pill>
                <Text
                  style={[
                    styles.sheetNetAmount,
                    { color: THEME.text, fontFamily: THEME.monoFamily },
                  ]}
                >
                  {formatMoney(statement.netAmount)}
                </Text>
              </View>
              <View
                style={[
                  styles.sheetAmountGrid,
                  { borderTopColor: THEME.border },
                ]}
              >
                <DetailMetric
                  label="毛收"
                  value={formatAmountNumber(statement.grossEarning)}
                  mono
                />
                <DetailMetric
                  label="抽成"
                  value={formatSignedAmountNumber({
                    ...statement.serviceFee,
                    amountMinor: -Math.abs(statement.serviceFee.amountMinor),
                  })}
                  mono
                />
                <DetailMetric
                  label="補助"
                  value={formatSignedAmountNumber(statement.subsidy)}
                  mono
                />
                <DetailMetric
                  label="淨額"
                  value={formatAmountNumber(statement.netAmount)}
                  mono
                />
              </View>
            </View>
          ) : (
            <Text
              style={[
                styles.sheetFallbackText,
                { color: THEME.textMuted, fontFamily: THEME.fontFamily },
              ]}
            >
              沒有可顯示的月結資料。
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

function DetailMetric({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <View style={styles.detailMetric}>
      <Text
        style={[
          styles.detailMetricLabel,
          { color: THEME.textMuted, fontFamily: THEME.fontFamily },
        ]}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.detailMetricValue,
          {
            color: THEME.text,
            fontFamily: mono ? THEME.monoFamily : THEME.fontFamily,
          },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

export default function EarningsScreen() {
  const router = useRouter();
  const [period, setPeriod] = useState<DriverEarningsPeriod>("today");
  const [dashboard, setDashboard] = useState<DriverEarningsDashboard | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [featureEnabled, setFeatureEnabled] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statementLoading, setStatementLoading] = useState(false);
  const [statementSheetVisible, setStatementSheetVisible] = useState(false);
  const [statementDetail, setStatementDetail] =
    useState<DriverStatementRecord | null>(null);

  const isProvisioned = isDriverIdentityProvisioned();

  const loadDashboard = useCallback(
    async (nextPeriod: DriverEarningsPeriod, silent = false) => {
      if (!isProvisioned) {
        setDashboard(null);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const client = getDriverClient();
      if (!silent) {
        setLoading(true);
      }

      try {
        const enabled = await client
          .isFeatureEnabled("driver-app.earnings")
          .catch(() => true);
        setFeatureEnabled(enabled);

        if (!enabled) {
          setDashboard(null);
          setError(null);
          return;
        }

        const nextDashboard =
          await client.getDriverEarningsDashboard(nextPeriod);
        setDashboard(nextDashboard);
        setError(null);
      } catch (nextError) {
        setError(toErrorMessage(nextError));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [isProvisioned],
  );

  useEffect(() => {
    void loadDashboard(period);
  }, [loadDashboard, period]);

  useFocusEffect(
    useCallback(() => {
      if (!isProvisioned || featureEnabled === false || dashboard === null) {
        return undefined;
      }
      void loadDashboard(period, true);
      return undefined;
    }, [dashboard, featureEnabled, isProvisioned, loadDashboard, period]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDashboard(period, true);
  };

  const openStatementDetail = async (
    statement: DriverEarningsStatementListItem,
  ) => {
    const action = findAction(
      statement.availableActions,
      "view_statement_detail",
    );
    if (!action?.enabled) {
      Alert.alert("目前無法查看", "這筆月結目前沒有可用的明細動作。");
      return;
    }

    setStatementSheetVisible(true);
    setStatementLoading(true);
    setStatementDetail(null);

    try {
      const detail = await getDriverClient().getDriverStatement(
        statement.statementId,
      );
      setStatementDetail(detail);
    } catch (detailError) {
      setStatementSheetVisible(false);
      Alert.alert("無法載入月結明細", toErrorMessage(detailError));
    } finally {
      setStatementLoading(false);
    }
  };

  const openManagerReview = async (link: CrossAppResourceLink) => {
    try {
      await openCrossAppLink(link);
    } catch (linkError) {
      Alert.alert("無法開啟覆核連結", toErrorMessage(linkError));
    }
  };

  const explainDisabledAction = (action: ResourceActionDescriptor | null) => {
    Alert.alert(
      "目前無法執行",
      getDisabledReasonMessage(action?.disabledReasonCode),
    );
  };

  const refreshAction = findAction(
    dashboard?.availableActions,
    "refresh_earnings",
  );
  const refreshEnabled = refreshAction?.enabled ?? true;
  const refreshStatus =
    dashboard !== null ? formatRefreshLabel(dashboard.refresh) : "manual";
  const refreshTone =
    dashboard !== null ? getRefreshTone(dashboard.refresh) : "neutral";
  const emptyAction = dashboard?.emptyState?.nextAction ?? null;

  if (loading && dashboard === null && error === null) {
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

  const emptyReason: EmptyReason | null = !isProvisioned
    ? "not_provisioned"
    : featureEnabled === false
      ? "permission_denied"
      : error && dashboard === null
        ? "fetch_failed"
        : (dashboard?.emptyState?.reason ?? null);

  if (emptyReason !== null) {
    const emptyContent = getEmptyContent(emptyReason, error, emptyAction);
    const hasRefreshEnvelope = dashboard !== null;
    const showRetry =
      emptyReason === "fetch_failed" || emptyReason === "external_unavailable";
    const showSettingsAction =
      emptyReason === "not_provisioned" && !emptyAction?.enabled;

    return (
      <Shell
        theme={THEME}
        contentContainerStyle={styles.screenContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={THEME.accent}
            colors={[THEME.accent]}
            progressBackgroundColor={THEME.surface}
          />
        }
      >
        <PageHeader
          theme={THEME}
          title={driverStrings.earnings.title}
          subtitle={getHeaderSubtitle(period)}
          actions={
            showRetry ? (
              <Btn
                theme={THEME}
                variant="secondary"
                size="sm"
                icon={<Ionicons name="refresh" size={13} color={THEME.text} />}
                onPress={() =>
                  refreshEnabled
                    ? void onRefresh()
                    : explainDisabledAction(refreshAction)
                }
              >
                {driverStrings.common.retry}
              </Btn>
            ) : undefined
          }
        />
        <Banner
          theme={THEME}
          tone={emptyContent.tone}
          title={emptyContent.title}
          body={emptyContent.body}
          icon={
            <Ionicons
              name={emptyContent.icon}
              size={16}
              color={
                emptyContent.tone === "danger"
                  ? THEME.danger
                  : emptyContent.tone === "warn"
                    ? THEME.warn
                    : THEME.info
              }
            />
          }
        />
        {hasRefreshEnvelope ? (
          <View style={styles.emptyMetaRow}>
            <Pill theme={THEME} tone={refreshTone}>
              {refreshStatus}
            </Pill>
            <Pill theme={THEME} tone="neutral">
              {getRefreshSourceLabel(dashboard.refresh)}
            </Pill>
            <Pill theme={THEME} tone="warn">
              refresh tier · {dashboard.refreshTier}
            </Pill>
          </View>
        ) : null}
        {emptyAction ? (
          <Btn
            theme={THEME}
            variant="primary"
            size="sm"
            disabled={!emptyAction.enabled}
            onPress={() => {
              if (!emptyAction.enabled) {
                explainDisabledAction(emptyAction);
                return;
              }
              if (emptyAction.action === "refresh_earnings") {
                void onRefresh();
                return;
              }
              if (emptyReason === "not_provisioned") {
                router.push("/settings");
              }
            }}
          >
            {emptyContent.actionLabel}
          </Btn>
        ) : null}
        {showSettingsAction ? (
          <Btn
            theme={THEME}
            variant="primary"
            size="sm"
            onPress={() => router.push("/settings")}
          >
            {emptyContent.actionLabel}
          </Btn>
        ) : null}
      </Shell>
    );
  }

  if (dashboard === null) {
    return null;
  }

  const reconciliationAction = dashboard.reconciliationIssue
    ? findAction(
        dashboard.reconciliationIssue.availableActions,
        "open_manager_review",
      )
    : null;

  return (
    <>
      <Shell
        theme={THEME}
        contentContainerStyle={styles.screenContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={THEME.accent}
            colors={[THEME.accent]}
            progressBackgroundColor={THEME.surface}
          />
        }
      >
        <PageHeader
          theme={THEME}
          title={driverStrings.earnings.title}
          subtitle={getHeaderSubtitle(period)}
          actions={
            <Btn
              theme={THEME}
              variant="secondary"
              size="sm"
              disabled={!refreshEnabled || refreshing}
              icon={<Ionicons name="refresh" size={13} color={THEME.text} />}
              onPress={() => void onRefresh()}
            >
              重新整理
            </Btn>
          }
        />

        <View style={styles.periodRow}>
          {PERIOD_OPTIONS.map((option) => {
            const active = option.key === period;
            return (
              <Pressable
                key={option.key}
                onPress={() => {
                  if (!refreshing && option.key !== period) {
                    setPeriod(option.key);
                  }
                }}
                style={[
                  styles.periodButton,
                  {
                    backgroundColor: active ? THEME.accent : THEME.surfaceLo,
                    borderColor: active ? THEME.accent : THEME.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.periodButtonLabel,
                    {
                      color: active ? "#FFFFFF" : THEME.textMuted,
                      fontFamily: THEME.fontFamily,
                    },
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Card theme={THEME} style={styles.summaryCard}>
          <View style={styles.summaryHeaderRow}>
            <View style={styles.summaryHeaderCopy}>
              <Text
                style={[
                  styles.summaryEyebrow,
                  { color: THEME.textDim, fontFamily: THEME.fontFamily },
                ]}
              >
                {getSummaryLabel(period)}
              </Text>
              <View style={styles.summaryHeadlineRow}>
                <Text
                  style={[
                    styles.summaryAmount,
                    { color: THEME.text, fontFamily: THEME.monoFamily },
                  ]}
                >
                  {formatAmountNumber(dashboard.summary.netAmount)}
                </Text>
                <Text
                  style={[
                    styles.summaryCurrency,
                    { color: THEME.textMuted, fontFamily: THEME.fontFamily },
                  ]}
                >
                  {getCurrencyLabel(dashboard.summary.netAmount.currency)}
                </Text>
              </View>
            </View>
            <View style={styles.summaryRightCol}>
              <Pill
                theme={THEME}
                tone={
                  dashboard.summary.pendingPayoutAmount.amountMinor > 0
                    ? "warn"
                    : "success"
                }
              >
                {dashboard.summary.pendingPayoutAmount.amountMinor > 0
                  ? "待撥款"
                  : "已入帳"}
              </Pill>
              <Text
                style={[
                  styles.summarySourceText,
                  { color: THEME.textMuted, fontFamily: THEME.fontFamily },
                ]}
              >
                {getRefreshSourceLabel(dashboard.refresh)}
              </Text>
            </View>
          </View>
          <View style={styles.summaryMetaRow}>
            <Pill theme={THEME} tone={refreshTone}>
              {refreshStatus}
            </Pill>
            <Pill theme={THEME} tone="warn">
              refresh tier · {dashboard.refreshTier}
            </Pill>
          </View>
          <View
            style={[styles.summaryMetricsRow, { borderTopColor: THEME.border }]}
          >
            <SummaryMetric
              label="毛收"
              value={formatAmountNumber(dashboard.summary.grossAmount)}
            />
            <SummaryMetric
              label="平台抽成"
              value={formatSignedAmountNumber({
                ...dashboard.summary.serviceFeeAmount,
                amountMinor: -Math.abs(
                  dashboard.summary.serviceFeeAmount.amountMinor,
                ),
              })}
              tone="danger"
            />
            <SummaryMetric
              label="待入帳"
              value={formatAmountNumber(dashboard.summary.pendingPayoutAmount)}
              tone="warn"
            />
            <SummaryMetric
              label="平台數"
              value={`${dashboard.summary.platformCount}`}
            />
          </View>
        </Card>

        {dashboard.notes?.length ? (
          <Card theme={THEME} style={styles.notesCard}>
            <Text
              style={[
                styles.notesTitle,
                { color: THEME.text, fontFamily: THEME.fontFamily },
              ]}
            >
              對帳說明
            </Text>
            <View style={styles.notesList}>
              {dashboard.notes.map((note) => (
                <View key={note} style={styles.noteRow}>
                  <View
                    style={[styles.noteDot, { backgroundColor: THEME.textDim }]}
                  />
                  <Text
                    style={[
                      styles.noteText,
                      { color: THEME.textMuted, fontFamily: THEME.fontFamily },
                    ]}
                  >
                    {note}
                  </Text>
                </View>
              ))}
            </View>
          </Card>
        ) : null}

        <Card
          theme={THEME}
          title={driverStrings.earnings.sections.platformBreakdown}
          subtitle="per_platform · authority labeled"
        >
          {dashboard.platformBreakdown.length === 0 ? (
            <Banner
              theme={THEME}
              tone="info"
              title="這段期間還沒有平台收益"
              body="切換到其他期間，或稍後再查看最新對帳彙整。"
              icon={
                <Ionicons name="wallet-outline" size={16} color={THEME.info} />
              }
            />
          ) : (
            <View style={styles.breakdownList}>
              {dashboard.platformBreakdown.map(
                (
                  item: DriverEarningsDashboard["platformBreakdown"][number],
                ) => (
                  <View
                    key={item.platformCode}
                    style={[
                      styles.breakdownCard,
                      {
                        backgroundColor: THEME.surface,
                        borderColor: THEME.border,
                        opacity:
                          item.netAmount.amountMinor === 0 &&
                          item.grossEarning.amountMinor === 0 &&
                          item.serviceFee.amountMinor === 0 &&
                          item.subsidy.amountMinor === 0
                            ? 0.6
                            : 1,
                      },
                    ]}
                  >
                    <View style={styles.breakdownTopRow}>
                      <Pill
                        theme={THEME}
                        tone={
                          item.authorityTone === "owned"
                            ? "accent"
                            : item.authorityTone === "reference_only"
                              ? "info"
                              : "warn"
                        }
                        dot
                      >
                        {item.platformName} · {item.platformCode}
                      </Pill>
                      <Text
                        style={[
                          styles.breakdownNetValue,
                          { color: THEME.text, fontFamily: THEME.monoFamily },
                        ]}
                      >
                        {item.netAmount.amountMinor === 0
                          ? "—"
                          : formatAmountNumber(item.netAmount)}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.breakdownDetailRow,
                        { borderTopColor: THEME.border },
                      ]}
                    >
                      <Text
                        style={[
                          styles.breakdownDetailText,
                          {
                            color: THEME.textMuted,
                            fontFamily: THEME.fontFamily,
                          },
                        ]}
                      >
                        毛{" "}
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
                          {
                            color: THEME.textMuted,
                            fontFamily: THEME.fontFamily,
                          },
                        ]}
                      >
                        抽{" "}
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
                                amountMinor: -Math.abs(
                                  item.serviceFee.amountMinor,
                                ),
                              })}
                        </Text>
                      </Text>
                      <Text
                        style={[
                          styles.breakdownDetailText,
                          {
                            color: THEME.textMuted,
                            fontFamily: THEME.fontFamily,
                          },
                        ]}
                      >
                        補{" "}
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
                              item.authorityTone === "owned"
                                ? THEME.accentHi
                                : item.authorityTone === "reference_only"
                                  ? THEME.info
                                  : THEME.warn,
                            fontFamily: THEME.fontFamily,
                          },
                        ]}
                      >
                        {item.authorityLabel}
                      </Text>
                    </View>
                    {item.availableActions.length > 0 ? (
                      <View style={styles.breakdownActionRow}>
                        {item.availableActions.map((action) => (
                          <Btn
                            key={action.action}
                            theme={THEME}
                            variant="ghost"
                            size="xs"
                            disabled={!action.enabled}
                            onPress={() => explainDisabledAction(action)}
                          >
                            {getActionLabel(action)}
                          </Btn>
                        ))}
                      </View>
                    ) : null}
                    {item.referenceOnly ? (
                      <Text
                        style={[
                          styles.referenceNote,
                          {
                            color: THEME.textMuted,
                            fontFamily: THEME.fontFamily,
                          },
                        ]}
                      >
                        reference-only · 不列入 DRTS 待撥款
                      </Text>
                    ) : null}
                  </View>
                ),
              )}
            </View>
          )}
        </Card>

        {dashboard.reconciliationIssue ? (
          <Card theme={THEME} style={styles.reconciliationCard}>
            <View style={styles.reconciliationPressable}>
              <Ionicons
                name="warning-outline"
                size={16}
                color={THEME.warn}
                style={styles.reconciliationIcon}
              />
              <View style={styles.reconciliationCopy}>
                <Text
                  style={[
                    styles.reconciliationTitle,
                    { color: THEME.text, fontFamily: THEME.fontFamily },
                  ]}
                >
                  {dashboard.reconciliationIssue.summary}
                </Text>
                <Text
                  style={[
                    styles.reconciliationDetail,
                    { color: THEME.textMuted, fontFamily: THEME.fontFamily },
                  ]}
                >
                  {dashboard.reconciliationIssue.detail}
                </Text>
                <Text
                  style={[
                    styles.reconciliationMeta,
                    { color: THEME.textDim, fontFamily: THEME.fontFamily },
                  ]}
                >
                  deep link ·{" "}
                  {dashboard.reconciliationIssue.managerReviewLink.targetApp}
                </Text>
              </View>
            </View>
            <Btn
              theme={THEME}
              variant="secondary"
              size="sm"
              disabled={!reconciliationAction?.enabled}
              onPress={() =>
                reconciliationAction?.enabled
                  ? void openManagerReview(
                      dashboard.reconciliationIssue!.managerReviewLink,
                    )
                  : explainDisabledAction(reconciliationAction)
              }
            >
              {getActionLabel(reconciliationAction)}
            </Btn>
          </Card>
        ) : null}

        <Card
          theme={THEME}
          title={driverStrings.earnings.sections.monthlyStatements}
          subtitle="receipt / payout / fee plan"
        >
          {dashboard.statements.length === 0 ? (
            <Text
              style={[
                styles.sectionEmptyText,
                { color: THEME.textMuted, fontFamily: THEME.fontFamily },
              ]}
            >
              目前沒有可顯示的月結報表。
            </Text>
          ) : (
            <View
              style={[
                styles.statementList,
                { borderColor: THEME.border, backgroundColor: THEME.surface },
              ]}
            >
              {dashboard.statements.map(
                (
                  statement: DriverEarningsDashboard["statements"][number],
                  index: number,
                ) => {
                  const canView = Boolean(
                    findAction(
                      statement.availableActions,
                      "view_statement_detail",
                    )?.enabled,
                  );

                  return (
                    <Pressable
                      key={statement.statementId}
                      disabled={!canView}
                      onPress={() => void openStatementDetail(statement)}
                      style={({ pressed }) => [
                        styles.statementRow,
                        index < dashboard.statements.length - 1
                          ? { borderBottomColor: THEME.border }
                          : null,
                        { opacity: canView ? (pressed ? 0.88 : 1) : 0.74 },
                      ]}
                    >
                      <View style={styles.statementCopy}>
                        <Text
                          style={[
                            styles.statementTitle,
                            {
                              color: THEME.text,
                              fontFamily: THEME.fontFamily,
                            },
                          ]}
                        >
                          {statement.periodMonth} 月結
                        </Text>
                        <Text
                          style={[
                            styles.statementSubtitle,
                            {
                              color: THEME.textMuted,
                              fontFamily: THEME.fontFamily,
                            },
                          ]}
                        >
                          {statement.receiptNo} · {statement.tripCount} 趟 · fee{" "}
                          {statement.feePlanVersion}
                        </Text>
                        {!canView ? (
                          <Text
                            style={[
                              styles.statementDisabledText,
                              {
                                color: THEME.warn,
                                fontFamily: THEME.fontFamily,
                              },
                            ]}
                          >
                            {getDisabledReasonMessage(
                              findAction(
                                statement.availableActions,
                                "view_statement_detail",
                              )?.disabledReasonCode,
                            )}
                          </Text>
                        ) : null}
                      </View>
                      <View style={styles.statementValueWrap}>
                        <Pill
                          theme={THEME}
                          tone={
                            statement.payoutStatus === "paid"
                              ? "success"
                              : "warn"
                          }
                        >
                          {formatDriverPayoutStatusLabel(
                            statement.payoutStatus,
                          )}
                        </Pill>
                        <View style={styles.statementAmountRow}>
                          <Text
                            style={[
                              styles.statementAmount,
                              {
                                color: THEME.textMuted,
                                fontFamily: THEME.monoFamily,
                              },
                            ]}
                          >
                            {formatMoney(statement.netAmount)}
                          </Text>
                          {canView ? (
                            <Ionicons
                              name="chevron-forward"
                              size={15}
                              color={THEME.textDim}
                            />
                          ) : null}
                        </View>
                      </View>
                    </Pressable>
                  );
                },
              )}
            </View>
          )}
        </Card>
      </Shell>

      <StatementDetailSheet
        visible={statementSheetVisible}
        statement={statementDetail}
        loading={statementLoading}
        onClose={() => {
          setStatementSheetVisible(false);
          setStatementDetail(null);
        }}
      />
    </>
  );
}

function SummaryMetric({
  label,
  value,
  tone = "text",
}: {
  label: string;
  value: string;
  tone?: "text" | "warn" | "danger";
}) {
  const color =
    tone === "warn"
      ? THEME.warn
      : tone === "danger"
        ? THEME.danger
        : THEME.text;

  return (
    <View style={styles.summaryMetric}>
      <Text
        style={[
          styles.summaryMetricLabel,
          { color: THEME.textMuted, fontFamily: THEME.fontFamily },
        ]}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.summaryMetricValue,
          { color, fontFamily: THEME.monoFamily },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    gap: 14,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 24,
  },
  loadingShellContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
    gap: 18,
  },
  loadingCard: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    minHeight: 220,
  },
  loadingLabel: {
    fontSize: 13,
  },
  periodRow: {
    flexDirection: "row",
    gap: 6,
  },
  periodButton: {
    flex: 1,
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
  },
  periodButtonLabel: {
    fontSize: 12.5,
    fontWeight: "600",
  },
  summaryCard: {
    gap: 12,
  },
  emptyMetaRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  summaryHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  summaryHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  summaryEyebrow: {
    fontSize: 10.5,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  summaryHeadlineRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
  },
  summaryAmount: {
    fontSize: 36,
    fontWeight: "700",
    letterSpacing: -1,
  },
  summaryCurrency: {
    fontSize: 14,
    marginBottom: 6,
  },
  summaryRightCol: {
    alignItems: "flex-end",
    gap: 6,
  },
  summarySourceText: {
    fontSize: 10.5,
  },
  summaryMetaRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  summaryMetricsRow: {
    flexDirection: "row",
    gap: 12,
    paddingTop: 14,
    borderTopWidth: 1,
    flexWrap: "wrap",
  },
  summaryMetric: {
    minWidth: "22%",
    flexGrow: 1,
    gap: 2,
  },
  summaryMetricLabel: {
    fontSize: 9.5,
  },
  summaryMetricValue: {
    fontSize: 15,
    fontWeight: "700",
  },
  notesCard: {
    gap: 10,
  },
  notesTitle: {
    fontSize: 12.5,
    fontWeight: "600",
  },
  notesList: {
    gap: 8,
  },
  noteRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  noteDot: {
    width: 4,
    height: 4,
    borderRadius: 999,
    marginTop: 7,
  },
  noteText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
  },
  breakdownList: {
    gap: 10,
  },
  breakdownCard: {
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 10,
  },
  breakdownTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  breakdownNetValue: {
    marginLeft: "auto",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  breakdownDetailRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  breakdownDetailText: {
    fontSize: 10.5,
  },
  breakdownDetailValue: {
    fontSize: 10.5,
    fontWeight: "600",
  },
  breakdownAuthority: {
    marginLeft: "auto",
    fontSize: 10.5,
    fontWeight: "600",
  },
  referenceNote: {
    fontSize: 11,
    lineHeight: 16,
  },
  breakdownActionRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  reconciliationCard: {
    gap: 12,
  },
  reconciliationPressable: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  reconciliationIcon: {
    marginTop: 2,
  },
  reconciliationCopy: {
    flex: 1,
    gap: 3,
  },
  reconciliationTitle: {
    fontSize: 13,
    fontWeight: "600",
  },
  reconciliationDetail: {
    fontSize: 11,
    lineHeight: 16,
  },
  reconciliationMeta: {
    fontSize: 10.5,
    marginTop: 4,
  },
  statementList: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: "hidden",
  },
  statementRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  statementCopy: {
    flex: 1,
    gap: 2,
  },
  statementTitle: {
    fontSize: 13,
    fontWeight: "600",
  },
  statementSubtitle: {
    fontSize: 11,
  },
  statementDisabledText: {
    fontSize: 10.5,
    marginTop: 4,
  },
  statementValueWrap: {
    alignItems: "flex-end",
    gap: 6,
  },
  statementAmountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statementAmount: {
    fontSize: 12.5,
  },
  sectionEmptyText: {
    fontSize: 12,
  },
  sheetBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(7, 10, 15, 0.65)",
  },
  sheetCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 18,
    paddingBottom: 28,
    paddingTop: 8,
    minHeight: 320,
  },
  sheetHandleWrap: {
    alignItems: "center",
    paddingVertical: 6,
  },
  sheetHandle: {
    width: 44,
    height: 4,
    borderRadius: 999,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 4,
  },
  sheetHeaderCopy: {
    flex: 1,
    gap: 2,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  sheetSubtitle: {
    fontSize: 11,
  },
  sheetLoadingWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 32,
  },
  sheetLoadingText: {
    fontSize: 12,
  },
  sheetBody: {
    gap: 14,
    marginTop: 18,
  },
  sheetMetricRow: {
    flexDirection: "row",
    gap: 12,
  },
  detailMetric: {
    flex: 1,
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: THEME.surfaceLo,
  },
  detailMetricLabel: {
    fontSize: 10.5,
  },
  detailMetricValue: {
    fontSize: 13,
    fontWeight: "600",
  },
  sheetStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sheetNetAmount: {
    fontSize: 18,
    fontWeight: "700",
  },
  sheetAmountGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    paddingTop: 14,
    borderTopWidth: 1,
  },
  sheetFallbackText: {
    marginTop: 18,
    fontSize: 12,
  },
});
