import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
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
  UiSeverity,
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
import { openCrossAppLink, resolveCrossAppUrl } from "@/lib/cross-app-links";
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

function getEmptyReasonBadge(reason: EmptyReason) {
  switch (reason) {
    case "not_provisioned":
      return "identity required";
    case "permission_denied":
      return "flag gated";
    case "fetch_failed":
      return "sync failed";
    case "external_unavailable":
      return "external delayed";
    case "driver_not_eligible":
      return "eligibility required";
    case "filtered_empty":
      return "filtered empty";
    case "no_data":
    default:
      return "no earnings";
  }
}

function getEmptyReasonTone(reason: EmptyReason) {
  switch (reason) {
    case "fetch_failed":
      return "danger" as const;
    case "not_provisioned":
    case "external_unavailable":
      return "warn" as const;
    default:
      return "info" as const;
  }
}

function getSeverityTone(severity: UiSeverity) {
  switch (severity) {
    case "critical":
      return "danger" as const;
    case "warning":
      return "warn" as const;
    case "info":
    default:
      return "info" as const;
  }
}

function getCrossAppTargetLabel(link: CrossAppResourceLink) {
  switch (link.targetApp) {
    case "platform-admin":
      return "Platform Admin";
    case "ops-console":
      return "Ops Console";
    case "tenant-console":
      return "Tenant Console";
    default:
      return link.targetApp;
  }
}

function getOpenModeLabel(link: CrossAppResourceLink) {
  return link.openMode === "same_tab" ? "same tab" : "new tab";
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

function EarningsTopBar({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.topBar}>
      <Btn
        theme={THEME}
        variant="ghost"
        size="xs"
        icon={<Ionicons name="chevron-back" size={14} color={THEME.text} />}
        onPress={onBack}
      >
        返回
      </Btn>
      <Pill theme={THEME} tone="warn">
        refresh tier · manual
      </Pill>
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
  const activeDashboardRequestIdRef = useRef(0);

  const isProvisioned = isDriverIdentityProvisioned();

  const loadDashboard = useCallback(
    async (nextPeriod: DriverEarningsPeriod, silent = false) => {
      const requestId = activeDashboardRequestIdRef.current + 1;
      activeDashboardRequestIdRef.current = requestId;

      if (!isProvisioned) {
        setDashboard(null);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const client = getDriverClient();
      if (!silent) {
        setLoading(true);
        setDashboard((currentDashboard) =>
          currentDashboard?.period === nextPeriod ? currentDashboard : null,
        );
      }
      setError(null);

      try {
        const enabled = await client
          .isFeatureEnabled("driver-app.earnings")
          .catch(() => true);
        if (activeDashboardRequestIdRef.current !== requestId) {
          return;
        }
        setFeatureEnabled(enabled);

        if (!enabled) {
          setDashboard(null);
          setError(null);
          return;
        }

        const nextDashboard =
          await client.getDriverEarningsDashboard(nextPeriod);
        if (activeDashboardRequestIdRef.current !== requestId) {
          return;
        }
        setDashboard(nextDashboard);
        setError(null);
      } catch (nextError) {
        if (activeDashboardRequestIdRef.current !== requestId) {
          return;
        }
        setDashboard((currentDashboard) =>
          currentDashboard?.period === nextPeriod ? currentDashboard : null,
        );
        setError(toErrorMessage(nextError));
      } finally {
        if (activeDashboardRequestIdRef.current === requestId) {
          setLoading(false);
          setRefreshing(false);
        }
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

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/");
  };

  const runDashboardAction = async (
    action: ResourceActionDescriptor | null,
    options?: {
      statement?: DriverEarningsStatementListItem;
      managerLink?: CrossAppResourceLink;
    },
  ) => {
    if (!action) {
      return;
    }

    if (!action.enabled) {
      explainDisabledAction(action);
      return;
    }

    switch (action.action) {
      case "refresh_earnings":
        await onRefresh();
        return;
      case "view_statement_detail":
        if (options?.statement) {
          await openStatementDetail(options.statement);
          return;
        }
        break;
      case "open_manager_review":
        if (options?.managerLink) {
          await openManagerReview(options.managerLink);
          return;
        }
        break;
      default:
        break;
    }

    Alert.alert("動作尚未連線", "這個收益頁操作目前沒有對應的執行流程。");
  };

  const refreshAction = findAction(
    dashboard?.availableActions,
    "refresh_earnings",
  );
  const refreshEnabled = refreshAction?.enabled ?? false;
  const refreshStatus =
    dashboard !== null ? formatRefreshLabel(dashboard.refresh) : "manual";
  const refreshTone =
    dashboard !== null ? getRefreshTone(dashboard.refresh) : "neutral";
  const emptyAction = dashboard?.emptyState?.nextAction ?? null;
  const reconciliationAction = dashboard?.reconciliationIssue
    ? findAction(
        dashboard.reconciliationIssue.availableActions,
        "open_manager_review",
      )
    : null;
  const reconciliationUrl = dashboard?.reconciliationIssue
    ? resolveCrossAppUrl(dashboard.reconciliationIssue.managerReviewLink)
    : null;

  if (loading && dashboard === null && error === null) {
    return (
      <Shell theme={THEME} contentContainerStyle={styles.loadingShellContent}>
        <EarningsTopBar onBack={goBack} />
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
        <EarningsTopBar onBack={goBack} />
        <PageHeader
          theme={THEME}
          title={driverStrings.earnings.title}
          subtitle={getHeaderSubtitle(period)}
          actions={
            showRetry && refreshAction ? (
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
        <Card
          theme={THEME}
          style={[
            styles.emptyStateCard,
            emptyReason === "fetch_failed"
              ? styles.emptyStateCardDanger
              : emptyReason === "not_provisioned" ||
                  emptyReason === "external_unavailable"
                ? styles.emptyStateCardWarn
                : styles.emptyStateCardInfo,
          ]}
        >
          <View style={styles.emptyStateHeroRow}>
            <View
              style={[
                styles.emptyStateIconWrap,
                {
                  backgroundColor:
                    emptyContent.tone === "danger"
                      ? THEME.dangerBg
                      : emptyContent.tone === "warn"
                        ? THEME.warnBg
                        : THEME.infoBg,
                  borderColor:
                    emptyContent.tone === "danger"
                      ? THEME.dangerBorder
                      : emptyContent.tone === "warn"
                        ? THEME.warnBorder
                        : THEME.infoBorder,
                },
              ]}
            >
              <Ionicons
                name={emptyContent.icon}
                size={18}
                color={
                  emptyContent.tone === "danger"
                    ? THEME.danger
                    : emptyContent.tone === "warn"
                      ? THEME.warn
                      : THEME.info
                }
              />
            </View>
            <View style={styles.emptyStateCopy}>
              <Pill theme={THEME} tone={getEmptyReasonTone(emptyReason)}>
                {getEmptyReasonBadge(emptyReason)}
              </Pill>
              <Text
                style={[
                  styles.emptyStateTitle,
                  { color: THEME.text, fontFamily: THEME.fontFamily },
                ]}
              >
                {emptyContent.title}
              </Text>
              <Text
                style={[
                  styles.emptyStateBody,
                  { color: THEME.textMuted, fontFamily: THEME.fontFamily },
                ]}
              >
                {emptyContent.body}
              </Text>
            </View>
          </View>
          <Banner
            theme={THEME}
            tone={emptyContent.tone}
            title="EmptyReason"
            body={emptyReason}
          />
        </Card>
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
              if (emptyReason === "not_provisioned") {
                router.push("/settings");
                return;
              }
              void runDashboardAction(emptyAction);
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
        <EarningsTopBar onBack={goBack} />
        <PageHeader
          theme={THEME}
          title={driverStrings.earnings.title}
          subtitle={getHeaderSubtitle(period)}
          actions={
            refreshAction ? (
              <Btn
                theme={THEME}
                variant="secondary"
                size="sm"
                disabled={!refreshEnabled || refreshing}
                icon={<Ionicons name="refresh" size={13} color={THEME.text} />}
                onPress={() => void runDashboardAction(refreshAction)}
              >
                重新整理
              </Btn>
            ) : undefined
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
          <Text
            style={[
              styles.summaryFootnote,
              { color: THEME.textDim, fontFamily: THEME.fontFamily },
            ]}
          >
            net first · pending payout distinct · authority labeled
          </Text>
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
                      <View style={styles.breakdownBadgeGroup}>
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
                        <Pill
                          theme={THEME}
                          tone={
                            item.authorityTone === "owned"
                              ? "success"
                              : item.authorityTone === "reference_only"
                                ? "info"
                                : "warn"
                          }
                        >
                          {item.authorityLabel}
                        </Pill>
                      </View>
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
                            color: item.referenceOnly
                              ? THEME.info
                              : THEME.textDim,
                            fontFamily: THEME.fontFamily,
                          },
                        ]}
                      >
                        {item.referenceOnly
                          ? "shadow ledger · reference only"
                          : "payable by platform authority"}
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
                            onPress={() => void runDashboardAction(action)}
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
            <View style={styles.reconciliationMetaRow}>
              <Pill
                theme={THEME}
                tone={getSeverityTone(dashboard.reconciliationIssue.severity)}
              >
                {dashboard.reconciliationIssue.severity}
              </Pill>
              <Pill theme={THEME} tone="neutral">
                {getCrossAppTargetLabel(
                  dashboard.reconciliationIssue.managerReviewLink,
                )}
              </Pill>
              <Pill theme={THEME} tone="warn">
                {getOpenModeLabel(
                  dashboard.reconciliationIssue.managerReviewLink,
                )}
              </Pill>
            </View>
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
                  {dashboard.reconciliationIssue.managerReviewLink.label} ·{" "}
                  {dashboard.reconciliationIssue.managerReviewLink.resourceType}
                  #{dashboard.reconciliationIssue.managerReviewLink.resourceId}
                </Text>
                {reconciliationUrl ? (
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.reconciliationUrl,
                      {
                        color: THEME.textMuted,
                        fontFamily:
                          Platform.OS === "web"
                            ? THEME.monoFamily
                            : THEME.fontFamily,
                      },
                    ]}
                  >
                    {reconciliationUrl}
                  </Text>
                ) : null}
              </View>
            </View>
            <Btn
              theme={THEME}
              variant="secondary"
              size="sm"
              disabled={!reconciliationAction?.enabled}
              onPress={() =>
                void runDashboardAction(reconciliationAction, {
                  managerLink: dashboard.reconciliationIssue!.managerReviewLink,
                })
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
                      onPress={() =>
                        void runDashboardAction(
                          findAction(
                            statement.availableActions,
                            "view_statement_detail",
                          ),
                          { statement },
                        )
                      }
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
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
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
  summaryFootnote: {
    fontSize: 10.5,
    lineHeight: 15,
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
  breakdownBadgeGroup: {
    flexShrink: 1,
    gap: 6,
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
  reconciliationMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
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
  reconciliationUrl: {
    fontSize: 10,
    marginTop: 4,
  },
  emptyStateCard: {
    gap: 12,
  },
  emptyStateCardInfo: {
    borderWidth: 1,
    borderColor: "#274764",
  },
  emptyStateCardWarn: {
    borderWidth: 1,
    borderColor: "#6A5430",
  },
  emptyStateCardDanger: {
    borderWidth: 1,
    borderColor: "#6A2A2A",
  },
  emptyStateHeroRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  emptyStateIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyStateCopy: {
    flex: 1,
    gap: 8,
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  emptyStateBody: {
    fontSize: 12,
    lineHeight: 18,
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
