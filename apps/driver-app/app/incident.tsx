import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  PLATFORM_CODE_REGISTRY,
  type DriverTaskRecord,
  type EmptyReason,
  type RefreshTier,
  type ResourceActionDescriptor,
  type UnifiedDriverTaskView,
} from "@drts/contracts";

import { ActionButton } from "@/components/ui/ActionButton";
import { AppScreen } from "@/components/ui/AppScreen";
import { BottomActionBar } from "@/components/ui/BottomActionBar";
import { confirmDangerAction } from "@/components/ui/confirm-danger-action";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { FormField } from "@/components/ui/FormField";
import { PageHeader } from "@/components/ui/PageHeader";
import { PlatformBadge } from "@/components/ui/PlatformBadge";
import { StatusChip } from "@/components/ui/StatusChip";
import { Tokens } from "@/components/ui/tokens";
import {
  buildFallbackUnifiedDriverTaskView,
  isUnifiedTaskPlatformClosed,
  summarizeWorkspaceTasks,
} from "@/lib/driver-workspace-cockpit";
import { getDriverClient } from "@/lib/api-client";
import {
  driverForwardedTaskStatusLabels,
  driverIncidentSituations,
  driverStrings,
} from "@/lib/strings";
import { formatDriverTaskStatusLabel } from "@/lib/operational-labels";

type IncidentPlatformContext = {
  platformCode: string;
  platformLabel: string;
  mirrorOrderId: string;
  externalOrderId: string | null;
  nativeStatus: string | null;
};

type IncidentRoute = "/" | "/trip";
type IncidentEntrySource = "trip" | "cockpit" | "push" | "unknown";

type EmptyStateConfig = {
  title: string;
  description: string;
  icon:
    | "search-outline"
    | "construct-outline"
    | "cloud-offline-outline"
    | "lock-closed-outline"
    | "alert-circle-outline"
    | "ban-outline"
    | "filter-outline";
};

const SOS_SITUATIONS = driverIncidentSituations;
type SosSituationId = (typeof SOS_SITUATIONS)[number]["id"];

const INCIDENT_REFRESH_TIER: RefreshTier = "manual";
const SOS_HOLD_DURATION_MS = 2_000;
const HOLD_PROGRESS_INTERVAL_MS = 50;
const SUPPORTED_EMPTY_REASONS: readonly EmptyReason[] = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "driver_not_eligible",
  "filtered_empty",
];

const EMPTY_STATE_COPY: Record<EmptyReason, EmptyStateConfig> = {
  no_data: {
    title: "目前沒有 SOS 情境資料",
    description: "找不到可帶入的行程脈絡，仍可返回行程或稍後重試。",
    icon: "search-outline",
  },
  not_provisioned: {
    title: "此裝置尚未啟用 SOS",
    description: "請先完成司機裝置啟用與功能下發，再建立安全事件。",
    icon: "construct-outline",
  },
  fetch_failed: {
    title: "SOS 情境載入失敗",
    description: "目前無法取得最新任務情境，請手動重整後再送出。",
    icon: "cloud-offline-outline",
  },
  permission_denied: {
    title: "目前沒有 SOS 權限",
    description: "您的帳號暫時沒有建立安全事件的權限，請聯絡派車台。",
    icon: "lock-closed-outline",
  },
  external_unavailable: {
    title: "外部平台資訊暫時無法讀取",
    description: "可先返回行程；若已發生安全事件，請直接聯絡派車台。",
    icon: "alert-circle-outline",
  },
  driver_not_eligible: {
    title: "目前狀態不可送出 SOS",
    description: "您的司機資格或班次狀態尚未達到送出條件，請先處理前置限制。",
    icon: "ban-outline",
  },
  filtered_empty: {
    title: "目前篩選下沒有可用情境",
    description: "請清除目前條件或返回工作台後重新開啟 SOS。",
    icon: "filter-outline",
  },
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return "SOS 送出失敗，請稍後再試。";
}

function getSituationLabel(situationId: SosSituationId | null): string | null {
  if (!situationId) {
    return null;
  }

  return (
    SOS_SITUATIONS.find((situation) => situation.id === situationId)?.label ??
    null
  );
}

function humanizeCode(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function isOwnedPlatformCode(platformCode: string | null | undefined) {
  const normalized = platformCode?.trim().toLowerCase() ?? "drts";
  return (
    normalized === "drts" || normalized === "owned" || normalized === "direct"
  );
}

function getPlatformDisplayLabel(platformCode: string | null | undefined) {
  const normalized = platformCode?.trim().toLowerCase();
  if (!normalized || isOwnedPlatformCode(normalized)) {
    return "DRTS";
  }

  if (normalized in PLATFORM_CODE_REGISTRY) {
    return PLATFORM_CODE_REGISTRY[
      normalized as keyof typeof PLATFORM_CODE_REGISTRY
    ].displayName;
  }

  return humanizeCode(normalized);
}

function formatPlatformStatusLabel(status: string | null): string | null {
  if (!status) {
    return null;
  }

  const normalized = status.trim().toLowerCase();
  return (
    driverForwardedTaskStatusLabels[
      normalized as keyof typeof driverForwardedTaskStatusLabels
    ] ?? formatDriverTaskStatusLabel(status)
  );
}

function buildIncidentDescription(
  details: string,
  platformContext: IncidentPlatformContext | null,
  situationId: SosSituationId | null,
) {
  const lines: string[] = [];
  const situationLabel = getSituationLabel(situationId);
  if (situationLabel) {
    lines.push(`事件情況：${situationLabel}`);
  }

  const baseDescription = details.trim() || "已由司機 App 送出 SOS 緊急通報。";
  if (!platformContext) {
    lines.push(baseDescription);
    return lines.join("\n");
  }

  lines.push(
    baseDescription,
    "",
    "[SOS 平台任務上下文]",
    `來源平台：${platformContext.platformLabel}（${platformContext.platformCode}）`,
    `本地鏡像訂單：${platformContext.mirrorOrderId}`,
  );

  if (platformContext.externalOrderId) {
    lines.push(`外部訂單：${platformContext.externalOrderId}`);
  }

  const nativeStatusLabel = formatPlatformStatusLabel(
    platformContext.nativeStatus,
  );
  if (nativeStatusLabel) {
    lines.push(`目前平台狀態：${nativeStatusLabel}`);
  }

  return lines.join("\n");
}

function buildIncidentPlatformContext(
  task: UnifiedDriverTaskView | null,
): IncidentPlatformContext | null {
  if (!task || isOwnedPlatformCode(task.sourcePlatform)) {
    return null;
  }

  return {
    platformCode: task.sourcePlatform,
    platformLabel:
      task.platformDisplayName || getPlatformDisplayLabel(task.sourcePlatform),
    mirrorOrderId: task.orderId,
    externalOrderId: task.externalOrderId,
    nativeStatus: task.nativeStatus,
  };
}

function pickForwardedTaskContext(
  tasks: ReadonlyArray<UnifiedDriverTaskView>,
): IncidentPlatformContext | null {
  if (tasks.length === 0) {
    return null;
  }

  const summary = summarizeWorkspaceTasks(tasks);
  const prioritizedTasks = [
    summary.activeTripTask,
    summary.actionRequiredTask,
    summary.awaitingPlatformTask,
    ...summary.orderedTasks,
  ].filter(
    (task, index, list): task is UnifiedDriverTaskView =>
      task != null && list.indexOf(task) === index,
  );

  const preferredForwardedTask =
    prioritizedTasks.find(
      (task) =>
        !isOwnedPlatformCode(task.sourcePlatform) &&
        !isUnifiedTaskPlatformClosed(task),
    ) ??
    prioritizedTasks.find(
      (task) => !isOwnedPlatformCode(task.sourcePlatform),
    ) ??
    null;

  return buildIncidentPlatformContext(preferredForwardedTask);
}

async function resolveIncidentPlatformContext(): Promise<IncidentPlatformContext | null> {
  const client = getDriverClient();

  try {
    const unifiedTasks = await client.listUnifiedDriverTasks();
    return pickForwardedTaskContext(unifiedTasks);
  } catch {
    try {
      const legacyTasks = await client.listDriverTasks();
      return pickForwardedTaskContext(
        legacyTasks.map((task: DriverTaskRecord) =>
          buildFallbackUnifiedDriverTaskView(task),
        ),
      );
    } catch {
      return null;
    }
  }
}

function parseEmptyReason(
  value: string | string[] | undefined,
): EmptyReason | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate) {
    return null;
  }

  return SUPPORTED_EMPTY_REASONS.includes(candidate as EmptyReason)
    ? (candidate as EmptyReason)
    : null;
}

function parseEntrySource(
  value: string | string[] | undefined,
): IncidentEntrySource {
  const candidate = Array.isArray(value) ? value[0] : value;
  switch (candidate) {
    case "trip":
    case "cockpit":
    case "push":
      return candidate;
    default:
      return "unknown";
  }
}

function parseReturnRoute(value: string | string[] | undefined): IncidentRoute {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate === "/" ? "/" : "/trip";
}

function parseAvailableActions(
  value: string | string[] | undefined,
): ResourceActionDescriptor[] | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate) {
    return null;
  }

  try {
    const parsed = JSON.parse(candidate) as ResourceActionDescriptor[];
    if (!Array.isArray(parsed)) {
      return null;
    }

    return parsed.filter(
      (item): item is ResourceActionDescriptor =>
        Boolean(item) &&
        typeof item.action === "string" &&
        typeof item.enabled === "boolean" &&
        typeof item.riskLevel === "string",
    );
  } catch {
    return null;
  }
}

function getEmptyStateActionTitle(reason: EmptyReason) {
  if (reason === "fetch_failed" || reason === "external_unavailable") {
    return driverStrings.common.retry;
  }

  return "返回行程";
}

function getEntrySourceLabel(source: IncidentEntrySource) {
  switch (source) {
    case "push":
      return "推播喚起";
    case "cockpit":
      return "工作台快捷";
    case "trip":
      return "行程快捷";
    default:
      return "直接開啟";
  }
}

function getActionLabel(action: string) {
  switch (action) {
    case "submit_sos":
      return "送出 SOS";
    case "cancel":
      return "返回行程";
    default:
      return humanizeCode(action);
  }
}

function getDisabledReasonLabel(reason: string | undefined) {
  switch (reason) {
    case "hold_required":
      return "需完整長按 2 秒後才能送出。";
    case "permission_denied":
      return "目前帳號沒有建立 SOS 事件的權限。";
    case "driver_not_eligible":
      return "目前司機狀態不可建立 SOS 事件。";
    case "external_unavailable":
      return "外部平台情境暫時無法確認。";
    default:
      return reason ? `目前無法操作：${humanizeCode(reason)}` : null;
  }
}

function SectionCard({
  title,
  subtitle,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeaderRow}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {subtitle ? (
            <Text style={styles.sectionSubtitle}>{subtitle}</Text>
          ) : null}
        </View>
        {action ? <View style={styles.sectionAction}>{action}</View> : null}
      </View>
      {children}
    </View>
  );
}

export default function IncidentScreen() {
  const params = useLocalSearchParams<{
    availableActions?: string;
    emptyReason?: string;
    entry?: string;
    returnTo?: string;
  }>();
  const router = useRouter();
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const holdStartedAtRef = useRef<number | null>(null);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [incidentsEnabled, setIncidentsEnabled] = useState<boolean | null>(
    null,
  );
  const [selectedSituation, setSelectedSituation] =
    useState<SosSituationId | null>(null);
  const [incidentContextPreview, setIncidentContextPreview] =
    useState<IncidentPlatformContext | null>(null);
  const [incidentContextReady, setIncidentContextReady] = useState(false);
  const [refreshingContext, setRefreshingContext] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const [holdHintVisible, setHoldHintVisible] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  const emptyReasonOverride = parseEmptyReason(params.emptyReason);
  const returnRoute = parseReturnRoute(params.returnTo);
  const entrySource = parseEntrySource(params.entry);
  const routeActions = parseAvailableActions(params.availableActions);

  useEffect(() => {
    const client = getDriverClient();
    client
      .isFeatureEnabled("driver-app.incidents")
      .then((enabled) => setIncidentsEnabled(enabled))
      .catch(() => setIncidentsEnabled(true));
  }, []);

  const loadIncidentContext = async (manual = false) => {
    if (manual) {
      setRefreshingContext(true);
    }
    setIncidentContextReady(false);
    setSubmissionError(null);

    try {
      const platformContext = await resolveIncidentPlatformContext();
      setIncidentContextPreview(platformContext);
    } catch (error) {
      setSubmissionError(getErrorMessage(error));
    } finally {
      setIncidentContextReady(true);
      setRefreshingContext(false);
    }
  };

  useEffect(() => {
    if (incidentsEnabled !== true || emptyReasonOverride) {
      return;
    }

    void loadIncidentContext();
  }, [emptyReasonOverride, incidentsEnabled]);

  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, []);

  const resetHoldProgress = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    holdStartedAtRef.current = null;
    setHoldProgress(0);
  };

  const handleBackToTrip = () => {
    if (submitting) {
      return;
    }

    router.replace(returnRoute);
  };

  const submitIncident = async () => {
    if (submitting) {
      return;
    }

    setSubmitting(true);
    setSubmissionError(null);
    setHoldHintVisible(false);
    const client = getDriverClient();
    try {
      const latestPlatformContext = await resolveIncidentPlatformContext();
      const platformContext = latestPlatformContext ?? incidentContextPreview;
      setIncidentContextPreview(platformContext);
      setIncidentContextReady(true);

      const created = await client.createIncident({
        title: "司機 SOS 緊急通報",
        description: buildIncidentDescription(
          details,
          platformContext,
          selectedSituation,
        ),
        category: "safety",
        severity: "critical",
        ...(platformContext
          ? { relatedOrderId: platformContext.mirrorOrderId }
          : {}),
        reportedBy: "driver",
      });

      if (created?.incidentId) {
        await client.updateIncident(created.incidentId, {
          escalationTarget: "safety_officer",
        });
      }

      setDetails("");
      setSelectedSituation(null);
      router.replace(returnRoute);
    } catch (error: unknown) {
      setSubmissionError(getErrorMessage(error));
    } finally {
      setSubmitting(false);
      resetHoldProgress();
    }
  };

  const openConfirmDialog = () => {
    confirmDangerAction({
      title: "確認送出 SOS",
      message:
        "送出後，營運與安全主管會立即收到重大安全警示。若尚未準備好，請先取消並補充現場資訊。",
      confirmLabel: "確認送出",
      cancelLabel: "取消",
      onConfirm: () => {
        void submitIncident();
      },
    });
  };

  const defaultActions = useMemo<ResourceActionDescriptor[]>(
    () => [
      {
        action: "cancel",
        enabled: true,
        riskLevel: "low",
      },
      {
        action: "submit_sos",
        enabled: !emptyReasonOverride,
        disabledReasonCode: emptyReasonOverride ?? "hold_required",
        riskLevel: "high",
      },
    ],
    [emptyReasonOverride],
  );

  // Backward-compatible bridge until `/incident` receives runtime-native
  // `availableActions[]` from a dedicated read model.
  const availableActions = routeActions ?? defaultActions;
  const cancelAction =
    availableActions.find((action) => action.action === "cancel") ??
    defaultActions[0];
  const submitAction =
    availableActions.find((action) => action.action === "submit_sos") ??
    defaultActions[1];

  const holdNotice =
    getDisabledReasonLabel(submitAction.disabledReasonCode) ??
    "請先長按右側按鈕滿 2 秒，系統才會開啟最終確認。";

  const activeEmptyReason =
    incidentsEnabled === false ? "not_provisioned" : emptyReasonOverride;
  const emptyStateConfig = activeEmptyReason
    ? EMPTY_STATE_COPY[activeEmptyReason]
    : null;

  const selectedSituationLabel = getSituationLabel(selectedSituation);
  const orderContextSubtitle = incidentContextPreview
    ? "平台與訂單資訊會跟著 SOS 一起送到安全事件。"
    : "若目前沒有外部平台任務，SOS 仍會以一般安全事件建立。";

  const refreshTierLabel =
    INCIDENT_REFRESH_TIER === "manual" ? "手動刷新" : INCIDENT_REFRESH_TIER;
  const holdProgressPercent = Math.round(holdProgress * 100);

  const startHoldProgress = () => {
    if (submitting || !submitAction.enabled) {
      setHoldHintVisible(true);
      return;
    }

    resetHoldProgress();
    holdStartedAtRef.current = Date.now();
    setHoldHintVisible(true);
    progressIntervalRef.current = setInterval(() => {
      if (!holdStartedAtRef.current) {
        return;
      }

      const elapsedMs = Date.now() - holdStartedAtRef.current;
      const nextProgress = Math.min(1, elapsedMs / SOS_HOLD_DURATION_MS);
      setHoldProgress(nextProgress);
    }, HOLD_PROGRESS_INTERVAL_MS);
  };

  const releaseHoldProgress = () => {
    if (submitting) {
      return;
    }

    resetHoldProgress();
  };

  const confirmHoldAction = () => {
    if (submitting || !submitAction.enabled) {
      return;
    }

    resetHoldProgress();
    openConfirmDialog();
  };

  if (incidentsEnabled === null) {
    return (
      <AppScreen scrollable={false} backgroundColor={Tokens.colors.appBg}>
        <PageHeader
          title={driverStrings.incident.title}
          subtitle={driverStrings.incident.subtitle}
          rightElement={
            <StatusChip
              label={driverStrings.incident.loadingTitle}
              variant="info"
            />
          }
        />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Tokens.colors.primary} />
          <Text style={styles.loadingLabel}>載入 SOS 流程中…</Text>
        </View>
      </AppScreen>
    );
  }

  if (emptyStateConfig) {
    const emptyReason = activeEmptyReason as EmptyReason;

    return (
      <AppScreen scrollable={false} backgroundColor={Tokens.colors.appBg}>
        <PageHeader
          title={driverStrings.incident.title}
          subtitle={driverStrings.incident.subtitle}
          rightElement={
            <View style={styles.headerChips}>
              <StatusChip label={refreshTierLabel} variant="brand" />
              <StatusChip
                label={driverStrings.incident.urgentTitle}
                variant="danger"
              />
            </View>
          }
        />
        <EmptyState
          title={emptyStateConfig.title}
          description={emptyStateConfig.description}
          icon={emptyStateConfig.icon}
          actionTitle={getEmptyStateActionTitle(emptyReason)}
          onAction={
            emptyReason === "fetch_failed" ||
            emptyReason === "external_unavailable"
              ? () => void loadIncidentContext(true)
              : handleBackToTrip
          }
          style={styles.fillState}
        />
      </AppScreen>
    );
  }

  return (
    <View style={styles.screen}>
      <AppScreen backgroundColor={Tokens.colors.appBg}>
        <PageHeader
          title={driverStrings.incident.title}
          subtitle={driverStrings.incident.subtitle}
          rightElement={
            <View style={styles.headerChips}>
              <StatusChip label={refreshTierLabel} variant="brand" />
              <StatusChip
                label={driverStrings.incident.urgentTitle}
                variant="danger"
              />
            </View>
          }
        />

        <View style={styles.content}>
          <View style={styles.heroCard}>
            <View style={styles.heroTopRow}>
              <StatusChip
                label={getEntrySourceLabel(entrySource)}
                variant="info"
              />
              <StatusChip label="兩階段確認" variant="danger" />
            </View>
            <View style={styles.heroIconBadge}>
              <Text style={styles.heroIconLabel}>SOS</Text>
            </View>
            <Text style={styles.heroEyebrow}>
              {driverStrings.incident.heroEyebrow}
            </Text>
            <Text style={styles.heroTitle}>
              {driverStrings.incident.heroTitle}
            </Text>
            <Text style={styles.heroBody}>
              送出後會建立重大安全事件，並立刻升級給派車台與安全主管優先處理。
            </Text>
          </View>

          {submissionError ? (
            <ErrorBanner message={`送出失敗：${submissionError}`} />
          ) : null}

          <SectionCard
            title={driverStrings.incident.sections.situation}
            subtitle="先標記事件類型，安全官收到後可更快分流。"
          >
            <View style={styles.situationGrid}>
              {SOS_SITUATIONS.map((situation) => {
                const selected = selectedSituation === situation.id;

                return (
                  <ActionButton
                    key={situation.id}
                    title={situation.label}
                    onPress={() => {
                      if (submitting) {
                        return;
                      }
                      setSelectedSituation(situation.id);
                      setHoldHintVisible(false);
                    }}
                    variant="secondary"
                    disabled={submitting}
                    style={[
                      styles.situationButton,
                      selected
                        ? styles.situationButtonSelected
                        : styles.situationButtonIdle,
                    ]}
                    textStyle={[
                      styles.situationButtonText,
                      selected ? styles.situationButtonTextSelected : null,
                    ]}
                  />
                );
              })}
            </View>
          </SectionCard>

          <SectionCard
            title={driverStrings.incident.sections.context}
            subtitle={orderContextSubtitle}
            action={
              <ActionButton
                title={
                  refreshingContext ? "刷新中…" : driverStrings.common.refresh
                }
                onPress={() => void loadIncidentContext(true)}
                variant="ghost"
                disabled={submitting || refreshingContext}
              />
            }
          >
            {incidentContextReady ? (
              incidentContextPreview ? (
                <View style={styles.contextCard}>
                  <View style={styles.contextBadgeRow}>
                    <PlatformBadge
                      code={incidentContextPreview.platformCode}
                      name={incidentContextPreview.platformLabel}
                      forwarded
                      size="sm"
                    />
                    <StatusChip
                      label={driverStrings.incident.orderContextForwarded}
                      variant="forwarded"
                    />
                  </View>
                  <Text style={styles.contextTitle}>
                    {incidentContextPreview.mirrorOrderId}
                  </Text>
                  <Text style={styles.contextBody}>
                    平台訂單上下文會隨 SOS
                    一起送出，營運與安全官可直接對照鏡像與外部單號。
                  </Text>
                  <View style={styles.contextMetaRow}>
                    <Text style={styles.contextMetaLabel}>外部訂單</Text>
                    <Text style={styles.contextMetaValue}>
                      {incidentContextPreview.externalOrderId ?? "未提供"}
                    </Text>
                  </View>
                  {incidentContextPreview.nativeStatus ? (
                    <View style={styles.contextMetaRow}>
                      <Text style={styles.contextMetaLabel}>平台狀態</Text>
                      <Text style={styles.contextMetaValue}>
                        {formatPlatformStatusLabel(
                          incidentContextPreview.nativeStatus,
                        ) ?? incidentContextPreview.nativeStatus}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : (
                <View style={styles.contextCard}>
                  <View style={styles.contextBadgeRow}>
                    <PlatformBadge code="DR" name="DRTS" size="sm" />
                    <StatusChip
                      label={driverStrings.incident.orderContextOwned}
                      variant="owned"
                    />
                  </View>
                  <Text style={styles.contextTitle}>
                    目前未偵測到外部平台訂單
                  </Text>
                  <Text style={styles.contextBody}>
                    若此刻是自營任務或非訂單情境，SOS
                    仍會照常建立，並在成功後返回行程頁。
                  </Text>
                </View>
              )
            ) : (
              <View style={styles.contextLoadingRow}>
                <ActivityIndicator size="small" color={Tokens.colors.primary} />
                <Text style={styles.contextLoadingLabel}>
                  正在檢查目前訂單情境…
                </Text>
              </View>
            )}
          </SectionCard>

          <SectionCard
            title={driverStrings.incident.sections.details}
            subtitle="可補充目前位置、乘客狀況或即時風險。"
          >
            <FormField
              label="補充說明（選填）"
              value={details}
              onChangeText={(value) => {
                setDetails(value);
                if (submissionError) {
                  setSubmissionError(null);
                }
              }}
              placeholder="可補充目前位置、乘客狀況或即時風險…"
              multiline
              numberOfLines={5}
              editable={!submitting}
              containerStyle={styles.detailsField}
              style={styles.detailsInput}
              helpText={
                selectedSituationLabel
                  ? `已選情況：${selectedSituationLabel}。若留白，系統仍會送出預設 SOS 說明。`
                  : "若留白，系統會送出預設 SOS 說明。"
              }
            />
          </SectionCard>

          <SectionCard
            title={driverStrings.incident.sections.review}
            subtitle="功能行為以 high-risk action 規格為準。"
          >
            <View style={styles.actionPolicyRow}>
              <StatusChip
                label={`刷新層級：${refreshTierLabel}`}
                variant="brand"
              />
              <StatusChip
                label={`可用操作：${availableActions.length}`}
                variant="default"
              />
            </View>
            <Text style={styles.confirmationBody}>
              長按底部按鈕滿 2
              秒後，系統仍會再要求一次確認；若情況已排除，可按取消返回上一頁。
            </Text>
            <Text style={styles.availableActionLabel}>
              目前主要操作：{getActionLabel(submitAction.action)}
            </Text>
            {submitAction.enabled ? null : (
              <Text style={styles.actionBlockedLabel}>{holdNotice}</Text>
            )}
          </SectionCard>
        </View>
      </AppScreen>

      <BottomActionBar
        style={styles.actionBar}
        notice={
          holdHintVisible ? holdNotice : "SOS 送出前仍會再確認一次，避免誤觸。"
        }
      >
        <ActionButton
          title={getActionLabel(cancelAction.action)}
          onPress={handleBackToTrip}
          variant="secondary"
          disabled={submitting || !cancelAction.enabled}
          style={styles.secondaryAction}
        />
        <TouchableOpacity
          accessibilityLabel="長按確認求援"
          accessibilityRole="button"
          activeOpacity={0.82}
          delayLongPress={SOS_HOLD_DURATION_MS}
          disabled={submitting || !submitAction.enabled}
          onPress={() => setHoldHintVisible(true)}
          onPressIn={startHoldProgress}
          onPressOut={releaseHoldProgress}
          onLongPress={confirmHoldAction}
          style={[
            styles.longPressAction,
            submitting || !submitAction.enabled
              ? styles.longPressActionDisabled
              : null,
          ]}
        >
          {submitting ? (
            <ActivityIndicator color={Tokens.colors.textInverse} size="small" />
          ) : (
            <>
              <Text style={styles.longPressActionEyebrow}>需長按 2 秒</Text>
              <Text style={styles.longPressActionLabel}>
                {driverStrings.incident.confirmAction}
              </Text>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${holdProgressPercent}%` },
                  ]}
                />
              </View>
              <Text style={styles.progressLabel}>
                {holdProgressPercent > 0
                  ? `已按住 ${holdProgressPercent}%`
                  : getActionLabel(submitAction.action)}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </BottomActionBar>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Tokens.colors.appBg,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Tokens.spacing.xl,
  },
  fillState: {
    flex: 1,
  },
  loadingLabel: {
    ...Tokens.type.body,
    color: Tokens.colors.textBody,
    marginTop: Tokens.spacing.md,
  },
  headerChips: {
    flexDirection: "row",
    gap: Tokens.spacing.xs,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  content: {
    paddingVertical: Tokens.spacing.lg,
    gap: Tokens.spacing.lg,
  },
  heroCard: {
    backgroundColor: Tokens.colors.dangerBg,
    borderRadius: Tokens.radius.lg,
    padding: Tokens.spacing.xl,
    borderWidth: 1,
    borderColor: `${Tokens.colors.danger}33`,
    gap: Tokens.spacing.sm,
  },
  heroTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: Tokens.spacing.xs,
    marginBottom: Tokens.spacing.sm,
  },
  heroIconBadge: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: Tokens.colors.danger,
    alignItems: "center",
    justifyContent: "center",
    ...Tokens.shadows.sm,
  },
  heroIconLabel: {
    ...Tokens.type.label,
    color: Tokens.colors.textInverse,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  heroEyebrow: {
    ...Tokens.type.micro,
    color: Tokens.colors.danger,
    marginTop: Tokens.spacing.sm,
  },
  heroTitle: {
    ...Tokens.type.sectionTitle,
    color: Tokens.colors.textStrong,
  },
  heroBody: {
    ...Tokens.type.body,
    color: Tokens.colors.textBody,
  },
  sectionCard: {
    backgroundColor: Tokens.colors.surface,
    borderRadius: Tokens.radius.lg,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    padding: Tokens.spacing.lg,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    gap: Tokens.spacing.md,
    marginBottom: Tokens.spacing.md,
    alignItems: "flex-start",
  },
  sectionHeader: {
    flex: 1,
  },
  sectionAction: {
    alignSelf: "center",
  },
  sectionTitle: {
    ...Tokens.type.sectionTitle,
    color: Tokens.colors.textStrong,
  },
  sectionSubtitle: {
    ...Tokens.type.small,
    color: Tokens.colors.textMuted,
    marginTop: Tokens.spacing.xs,
  },
  situationGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Tokens.spacing.sm,
  },
  situationButton: {
    flexBasis: "48%",
    minHeight: 52,
    justifyContent: "flex-start",
    paddingHorizontal: Tokens.spacing.md,
    shadowOpacity: 0,
    elevation: 0,
  },
  situationButtonIdle: {
    backgroundColor: Tokens.colors.surface,
    borderColor: Tokens.colors.border,
  },
  situationButtonSelected: {
    backgroundColor: Tokens.colors.dangerBg,
    borderColor: Tokens.colors.danger,
  },
  situationButtonText: {
    color: Tokens.colors.textStrong,
    textAlign: "left",
  },
  situationButtonTextSelected: {
    color: Tokens.colors.danger,
  },
  contextCard: {
    borderRadius: Tokens.radius.md,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    backgroundColor: Tokens.colors.surfaceLo,
    padding: Tokens.spacing.lg,
  },
  contextBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Tokens.spacing.sm,
    marginBottom: Tokens.spacing.sm,
    flexWrap: "wrap",
  },
  contextTitle: {
    ...Tokens.type.title,
    color: Tokens.colors.textStrong,
    marginBottom: Tokens.spacing.xs,
  },
  contextBody: {
    ...Tokens.type.small,
    color: Tokens.colors.textBody,
  },
  contextMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: Tokens.spacing.md,
    gap: Tokens.spacing.md,
  },
  contextMetaLabel: {
    ...Tokens.type.micro,
    color: Tokens.colors.textMuted,
  },
  contextMetaValue: {
    ...Tokens.type.code,
    color: Tokens.colors.textStrong,
    flexShrink: 1,
    textAlign: "right",
  },
  contextLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Tokens.spacing.sm,
  },
  contextLoadingLabel: {
    ...Tokens.type.small,
    color: Tokens.colors.textMuted,
  },
  detailsField: {
    marginBottom: 0,
  },
  detailsInput: {
    minHeight: 120,
    paddingTop: Tokens.spacing.md,
    paddingBottom: Tokens.spacing.md,
    textAlignVertical: "top",
  },
  actionPolicyRow: {
    flexDirection: "row",
    gap: Tokens.spacing.sm,
    flexWrap: "wrap",
    marginBottom: Tokens.spacing.md,
  },
  confirmationBody: {
    ...Tokens.type.body,
    color: Tokens.colors.textBody,
  },
  availableActionLabel: {
    ...Tokens.type.small,
    color: Tokens.colors.textStrong,
    marginTop: Tokens.spacing.md,
  },
  actionBlockedLabel: {
    ...Tokens.type.small,
    color: Tokens.colors.warning,
    marginTop: Tokens.spacing.xs,
  },
  actionBar: {
    justifyContent: "space-between",
  },
  secondaryAction: {
    flex: 1,
    marginRight: Tokens.spacing.sm,
  },
  longPressAction: {
    flex: 1,
    minHeight: 68,
    borderRadius: Tokens.radius.lg,
    backgroundColor: Tokens.colors.danger,
    borderWidth: 1,
    borderColor: Tokens.colors.danger,
    paddingHorizontal: Tokens.spacing.lg,
    paddingVertical: Tokens.spacing.sm,
    justifyContent: "center",
    alignItems: "center",
    ...Tokens.shadows.sm,
  },
  longPressActionDisabled: {
    opacity: 0.7,
  },
  longPressActionEyebrow: {
    ...Tokens.type.micro,
    color: "#FFD5D0",
    marginBottom: 2,
  },
  longPressActionLabel: {
    ...Tokens.type.bodyStrong,
    color: Tokens.colors.textInverse,
  },
  progressTrack: {
    width: "100%",
    height: 6,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.18)",
    marginTop: Tokens.spacing.sm,
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#FFD9D4",
  },
  progressLabel: {
    ...Tokens.type.small,
    color: Tokens.colors.textInverse,
    marginTop: 4,
  },
});
