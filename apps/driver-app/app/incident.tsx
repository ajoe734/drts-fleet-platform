import { useEffect, useMemo, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  PLATFORM_CODE_REGISTRY,
  type DriverTaskRecord,
  type EmptyReason,
  type ResourceActionDescriptor,
  type UnifiedDriverTaskView,
} from "@drts/contracts";

import {
  Banner,
  Btn,
  Card,
  Field,
  PageHeader,
  Pill,
  driverCanvasTheme,
} from "@/components/canvas-primitives";
import {
  getDriverClient,
  getPendingDriverIncidentSubmission,
  replayPendingDriverIncidentSubmission,
  saveDriverSosAcknowledgement,
  submitDriverIncident,
} from "@/lib/api-client";
import {
  buildFallbackUnifiedDriverTaskView,
  isUnifiedTaskPlatformClosed,
  summarizeWorkspaceTasks,
} from "@/lib/driver-workspace-cockpit";
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

type IncidentEntry = "trip" | "cockpit" | "push";

type IncidentSearchParams = {
  emptyReason?: string | string[];
  entry?: string | string[];
};

const SOS_SITUATIONS = driverIncidentSituations;
const SOS_HOLD_DURATION_MS = 2000;
const HOLD_PROGRESS_INTERVAL_MS = 50;
const EMPTY_REASONS: EmptyReason[] = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "driver_not_eligible",
  "filtered_empty",
];

type SosSituationId = (typeof SOS_SITUATIONS)[number]["id"];

const EMPTY_REASON_COPY: Record<
  EmptyReason,
  {
    tone: "info" | "warn" | "danger";
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    body: string;
    actionLabel: string;
  }
> = {
  no_data: {
    tone: "info",
    icon: "compass-outline",
    title: "目前沒有額外事件上下文",
    body: "你仍可送出一般安全事件；若稍後有行程或平台任務，系統會自動補上對應上下文。",
    actionLabel: "返回行程",
  },
  not_provisioned: {
    tone: "warn",
    icon: "phone-portrait-outline",
    title: "裝置尚未完成註冊",
    body: "此裝置還沒有完整的司機綁定，暫時無法建立 SOS 事件。",
    actionLabel: "回到註冊",
  },
  fetch_failed: {
    tone: "danger",
    icon: "cloud-offline-outline",
    title: "SOS 畫面初始化失敗",
    body: "目前無法讀取安全求援所需資料。請稍後重試，若持續失敗請通知派車台。",
    actionLabel: "稍後重試",
  },
  permission_denied: {
    tone: "warn",
    icon: "lock-closed-outline",
    title: "目前身分無法送出 SOS",
    body: "裝置已登入，但目前權限不足以建立安全事件；請聯絡管理員確認司機權限。",
    actionLabel: "返回工作台",
  },
  external_unavailable: {
    tone: "warn",
    icon: "warning-outline",
    title: "外部平台上下文暫時不可用",
    body: "外部平台狀態同步中斷，若需立即求援仍可送出一般 SOS，安全官稍後補查平台資訊。",
    actionLabel: "仍返回行程",
  },
  driver_not_eligible: {
    tone: "warn",
    icon: "ban-outline",
    title: "司機目前不在可接單資格內",
    body: "這代表你目前不會收到新任務；若此狀態不符合預期，請聯絡派車台確認資格或暫停原因。",
    actionLabel: "查看工作台",
  },
  filtered_empty: {
    tone: "info",
    icon: "filter-outline",
    title: "目前條件下沒有可附加資料",
    body: "既有條件沒有找到可綁定的行程或平台上下文，仍可建立不含訂單的安全事件。",
    actionLabel: "返回行程",
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

async function resolveIncidentPlatformContext(): Promise<{
  platformContext: IncidentPlatformContext | null;
  externalUnavailable: boolean;
}> {
  const client = getDriverClient();

  try {
    const unifiedTasks = await client.listUnifiedDriverTasks();
    return {
      platformContext: pickForwardedTaskContext(unifiedTasks),
      externalUnavailable: false,
    };
  } catch {
    try {
      const legacyTasks = await client.listDriverTasks();
      return {
        platformContext: pickForwardedTaskContext(
          legacyTasks.map((task: DriverTaskRecord) =>
            buildFallbackUnifiedDriverTaskView(task),
          ),
        ),
        externalUnavailable: true,
      };
    } catch {
      return {
        platformContext: null,
        externalUnavailable: true,
      };
    }
  }
}

function normalizeParam(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function parseEmptyReason(raw: string | undefined): EmptyReason | null {
  if (!raw) {
    return null;
  }

  return EMPTY_REASONS.includes(raw as EmptyReason)
    ? (raw as EmptyReason)
    : null;
}

function parseEntry(raw: string | undefined): IncidentEntry {
  if (raw === "cockpit" || raw === "push") {
    return raw;
  }

  return "trip";
}

function getExitRoute(entry: IncidentEntry): "/" | "/trip" | "/onboarding" {
  if (entry === "cockpit") {
    return "/";
  }

  return "/trip";
}

function getEmptyStateExitRoute(reason: EmptyReason, entry: IncidentEntry) {
  if (reason === "not_provisioned") {
    return "/onboarding" as const;
  }

  return getExitRoute(entry);
}

function buildAvailableActions(params: {
  submitting: boolean;
  readyToSubmit: boolean;
  replayQueued: boolean;
  entry: IncidentEntry;
  emptyReason: EmptyReason | null;
}): ResourceActionDescriptor[] {
  const primaryAction: ResourceActionDescriptor = {
    action: params.replayQueued ? "retry_submit" : "submit_sos",
    enabled: params.readyToSubmit,
    disabledReasonCode: params.emptyReason
      ? `empty_reason:${params.emptyReason}`
      : params.submitting
        ? "submit_in_progress"
        : undefined,
    riskLevel: "high",
  };

  const cancelAction: ResourceActionDescriptor = {
    action: params.entry === "cockpit" ? "return_cockpit" : "return_trip",
    enabled: !params.submitting,
    disabledReasonCode: params.submitting ? "submit_in_progress" : undefined,
    riskLevel: "low",
  };

  return [primaryAction, cancelAction];
}

export default function IncidentScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<IncidentSearchParams>();
  const entry = parseEntry(normalizeParam(params.entry));
  const forcedEmptyReason = parseEmptyReason(
    normalizeParam(params.emptyReason),
  );
  const [details, setDetails] = useState("");
  const [selectedSituation, setSelectedSituation] =
    useState<SosSituationId | null>(null);
  const [incidentsEnabled, setIncidentsEnabled] = useState<boolean | null>(
    null,
  );
  const [incidentContextPreview, setIncidentContextPreview] =
    useState<IncidentPlatformContext | null>(null);
  const [incidentContextReady, setIncidentContextReady] = useState(false);
  const [externalContextUnavailable, setExternalContextUnavailable] =
    useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [replayingPending, setReplayingPending] = useState(false);
  const [replayQueued, setReplayQueued] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [holdProgress, setHoldProgress] = useState(0);
  const [holdActive, setHoldActive] = useState(false);
  const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdStartedAtRef = useRef<number | null>(null);
  const holdTriggeredRef = useRef(false);

  const emptyReason =
    forcedEmptyReason ??
    (incidentsEnabled === false ? "permission_denied" : null);

  const availableActions = useMemo(
    () =>
      buildAvailableActions({
        submitting: submitting || replayingPending,
        readyToSubmit:
          incidentsEnabled === true &&
          !submitting &&
          !replayingPending &&
          emptyReason == null,
        replayQueued,
        entry,
        emptyReason,
      }),
    [
      emptyReason,
      entry,
      incidentsEnabled,
      replayQueued,
      replayingPending,
      submitting,
    ],
  );

  const primaryAction = availableActions[0];
  const cancelAction = availableActions[1];

  useEffect(() => {
    let active = true;

    async function load() {
      const client = getDriverClient();
      try {
        const enabled = await client.isFeatureEnabled("driver-app.incidents");
        if (!active) {
          return;
        }
        setIncidentsEnabled(enabled);
        if (!enabled) {
          setIncidentContextReady(true);
          return;
        }

        const pending = await getPendingDriverIncidentSubmission();
        if (!active) {
          return;
        }
        if (pending) {
          setReplayQueued(true);
          setReplayingPending(true);
          try {
            const replayedIncident =
              await replayPendingDriverIncidentSubmission();
            if (!active || !replayedIncident) {
              return;
            }
            await saveDriverSosAcknowledgement({
              incidentId: replayedIncident.incidentId,
              createdAt: new Date().toISOString(),
              relatedOrderId: replayedIncident.relatedOrderId,
              status: "submitted",
              message:
                "先前排入重送的 SOS 已成功送達，安全官與派車台已收到通知。",
              dismissedAt: null,
            });
            router.replace("/trip");
            return;
          } catch (error: unknown) {
            if (!active) {
              return;
            }
            setSubmissionError(
              `待重送 SOS 仍未送達：${getErrorMessage(error)}`,
            );
          } finally {
            if (active) {
              setReplayingPending(false);
            }
          }
        }

        const resolvedContext = await resolveIncidentPlatformContext();
        if (!active) {
          return;
        }
        setIncidentContextPreview(resolvedContext.platformContext);
        setExternalContextUnavailable(resolvedContext.externalUnavailable);
        setIncidentContextReady(true);
      } catch (error: unknown) {
        if (!active) {
          return;
        }
        setIncidentsEnabled(false);
        setSubmissionError(getErrorMessage(error));
        setIncidentContextReady(true);
      }
    }

    void load();

    return () => {
      active = false;
      if (holdIntervalRef.current) {
        clearInterval(holdIntervalRef.current);
      }
    };
  }, [router]);

  function stopHold(reset = true) {
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
    holdStartedAtRef.current = null;
    setHoldActive(false);
    if (reset) {
      setHoldProgress(0);
    }
  }

  const handleClose = () => {
    stopHold();
    router.replace(getExitRoute(entry));
  };

  const handleEmptyStateAction = () => {
    router.replace(getEmptyStateExitRoute(emptyReason!, entry));
  };

  const executeSubmit = async () => {
    if (submitting || replayingPending || incidentsEnabled !== true) {
      return;
    }

    stopHold(false);
    setSubmitting(true);
    setSubmissionError(null);
    try {
      const latestPlatformContext = await resolveIncidentPlatformContext();
      const platformContext =
        latestPlatformContext.platformContext ?? incidentContextPreview;
      setIncidentContextPreview(platformContext);
      setExternalContextUnavailable(latestPlatformContext.externalUnavailable);
      const created = await submitDriverIncident({
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
        occurredAt: new Date().toISOString(),
      });
      await saveDriverSosAcknowledgement({
        incidentId: created.incidentId,
        createdAt: new Date().toISOString(),
        relatedOrderId: created.relatedOrderId,
        status: "submitted",
        message: "SOS 已送出，安全官與派車台會收到持續顯示的處理提醒。",
        dismissedAt: null,
      });
      router.replace("/trip");
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      setReplayQueued(true);
      setSubmissionError(`SOS 未即時送達，已排入重送：${message}`);
      await saveDriverSosAcknowledgement({
        incidentId: `queued-${Date.now()}`,
        createdAt: new Date().toISOString(),
        relatedOrderId: incidentContextPreview?.mirrorOrderId ?? null,
        status: "queued",
        message:
          "SOS 已排入重送佇列。恢復連線後重新開啟此頁，系統會自動再送一次。",
        dismissedAt: null,
      });
    } finally {
      setSubmitting(false);
      stopHold();
    }
  };

  const handleHoldStart = () => {
    if (!primaryAction.enabled || submitting || replayingPending) {
      return;
    }

    stopHold(false);
    holdTriggeredRef.current = false;
    holdStartedAtRef.current = Date.now();
    setHoldActive(true);
    setHoldProgress(0);
    holdIntervalRef.current = setInterval(() => {
      if (holdStartedAtRef.current == null) {
        return;
      }

      const elapsed = Date.now() - holdStartedAtRef.current;
      const nextProgress = Math.min(elapsed / SOS_HOLD_DURATION_MS, 1);
      setHoldProgress(nextProgress);

      if (nextProgress >= 1 && !holdTriggeredRef.current) {
        holdTriggeredRef.current = true;
        void executeSubmit();
      }
    }, HOLD_PROGRESS_INTERVAL_MS);
  };

  const handleHoldEnd = () => {
    if (holdTriggeredRef.current || submitting) {
      return;
    }

    stopHold();
  };

  const holdProgressPercent = Math.round(holdProgress * 100);
  const selectedSituationLabel = getSituationLabel(selectedSituation);
  const contextSubtitle = incidentContextPreview
    ? "平台 code、mirror order、外部單號與 native status 會一併寫進 SOS 描述。"
    : "若目前不是外部平台任務，SOS 仍會建立成一般安全事件。";

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={handleClose} />
      <View style={styles.sheet}>
        <View style={styles.sheetHandleWrap}>
          <View style={styles.sheetHandle} />
        </View>

        <PageHeader
          theme={driverCanvasTheme}
          title={driverStrings.incident.title}
          subtitle="高風險流程：開啟 sheet 後需按住 2 秒才會送出"
          actions={
            <Btn
              theme={driverCanvasTheme}
              variant="ghost"
              size="sm"
              onPress={handleClose}
            >
              關閉
            </Btn>
          }
        />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Card theme={driverCanvasTheme} padding={18} style={styles.heroCard}>
            <View style={styles.heroRow}>
              <View style={styles.heroIconWrap}>
                <Ionicons name="warning-outline" size={22} color="#FFFFFF" />
              </View>
              <View style={styles.heroCopy}>
                <Text style={styles.heroTitle}>緊急求援</Text>
                <Text style={styles.heroBody}>
                  送出後將立即通知安全官與派車台，並在 `/trip` 與工作台保留 SOS
                  處理提醒，直到司機手動關閉或事件結案。
                </Text>
                <View style={styles.heroMetaRow}>
                  <Pill theme={driverCanvasTheme} tone="danger" dot>
                    press-and-hold 2s
                  </Pill>
                  <Pill theme={driverCanvasTheme} tone="accent">
                    entry:{entry}
                  </Pill>
                </View>
              </View>
            </View>
          </Card>

          {replayQueued ? (
            <Banner
              theme={driverCanvasTheme}
              tone="warn"
              icon={
                replayingPending ? (
                  <ActivityIndicator
                    color={driverCanvasTheme.warn}
                    size="small"
                  />
                ) : (
                  <Ionicons
                    name="cloud-offline-outline"
                    size={16}
                    color={driverCanvasTheme.warn}
                  />
                )
              }
              title="偵測到待重送 SOS"
              body={
                replayingPending
                  ? "系統正在用原始 request id 自動重送前一筆 SOS。"
                  : "上一筆 SOS 尚未確認送達。重新長按送出前，系統會優先嘗試重播待送命令。"
              }
            />
          ) : null}

          {submissionError ? (
            <Banner
              theme={driverCanvasTheme}
              tone="danger"
              icon={
                <Ionicons
                  name="alert-circle-outline"
                  size={16}
                  color={driverCanvasTheme.danger}
                />
              }
              title="SOS 狀態異常"
              body={submissionError}
            />
          ) : null}

          {externalContextUnavailable ? (
            <Banner
              theme={driverCanvasTheme}
              tone="warn"
              icon={
                <Ionicons
                  name="warning-outline"
                  size={16}
                  color={driverCanvasTheme.warn}
                />
              }
              title="外部平台上下文降級"
              body="目前改用本地可得資料建立 SOS；若平台原生狀態尚未同步，安全官會在派車台補查。"
            />
          ) : null}

          {incidentsEnabled === null || !incidentContextReady ? (
            <Card theme={driverCanvasTheme} title="初始化安全流程" padding={18}>
              <View style={styles.loadingRow}>
                <ActivityIndicator color={driverCanvasTheme.accent} />
                <Text style={styles.loadingText}>
                  正在檢查功能旗標、待重送佇列與訂單情境…
                </Text>
              </View>
            </Card>
          ) : emptyReason ? (
            <Card
              theme={driverCanvasTheme}
              title={EMPTY_REASON_COPY[emptyReason].title}
              subtitle={`emptyReason · ${emptyReason}`}
              padding={18}
            >
              <View style={styles.emptyStateBody}>
                <Ionicons
                  name={EMPTY_REASON_COPY[emptyReason].icon}
                  size={34}
                  color={
                    EMPTY_REASON_COPY[emptyReason].tone === "danger"
                      ? driverCanvasTheme.danger
                      : EMPTY_REASON_COPY[emptyReason].tone === "warn"
                        ? driverCanvasTheme.warn
                        : driverCanvasTheme.accent
                  }
                />
                <Text style={styles.emptyStateText}>
                  {EMPTY_REASON_COPY[emptyReason].body}
                </Text>
                <Btn
                  theme={driverCanvasTheme}
                  variant="secondary"
                  size="md"
                  onPress={handleEmptyStateAction}
                >
                  {EMPTY_REASON_COPY[emptyReason].actionLabel}
                </Btn>
              </View>
            </Card>
          ) : (
            <>
              <Card
                theme={driverCanvasTheme}
                title={driverStrings.incident.sections.situation}
                subtitle="讓安全官能先依 incident category 進行分流"
              >
                <View style={styles.situationGrid}>
                  {SOS_SITUATIONS.map((situation) => {
                    const selected = selectedSituation === situation.id;

                    return (
                      <Pressable
                        key={situation.id}
                        accessibilityRole="button"
                        disabled={submitting}
                        onPress={() => {
                          setSelectedSituation(situation.id);
                          setSubmissionError(null);
                        }}
                        style={[
                          styles.situationButton,
                          selected
                            ? styles.situationButtonSelected
                            : styles.situationButtonIdle,
                        ]}
                      >
                        <Text
                          style={[
                            styles.situationLabel,
                            selected ? styles.situationLabelSelected : null,
                          ]}
                        >
                          {situation.label}
                        </Text>
                        <Text style={styles.situationCode}>{situation.id}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Card>

              <Card
                theme={driverCanvasTheme}
                title={driverStrings.incident.sections.context}
                subtitle={contextSubtitle}
              >
                {incidentContextPreview ? (
                  <View style={styles.contextWrap}>
                    <View style={styles.contextPillRow}>
                      <Pill theme={driverCanvasTheme} tone="accent" dot>
                        {incidentContextPreview.platformLabel} · forwarded
                      </Pill>
                    </View>
                    <Text style={styles.contextCode}>
                      {incidentContextPreview.mirrorOrderId}
                    </Text>
                    <Text style={styles.contextBody}>
                      平台 order id、mirror order 與 native status
                      會隨這次求援一併寫入 incident。
                    </Text>
                    <View style={styles.metaRow}>
                      <Text style={styles.metaLabel}>platform code</Text>
                      <Text style={styles.metaValue}>
                        {incidentContextPreview.platformCode}
                      </Text>
                    </View>
                    <View style={styles.metaRow}>
                      <Text style={styles.metaLabel}>external order</Text>
                      <Text style={styles.metaValue}>
                        {incidentContextPreview.externalOrderId ?? "未提供"}
                      </Text>
                    </View>
                    <View style={styles.metaRow}>
                      <Text style={styles.metaLabel}>native status</Text>
                      <Text style={styles.metaValue}>
                        {formatPlatformStatusLabel(
                          incidentContextPreview.nativeStatus,
                        ) ?? "未提供"}
                      </Text>
                    </View>
                  </View>
                ) : (
                  <View style={styles.contextWrap}>
                    <View style={styles.contextPillRow}>
                      <Pill theme={driverCanvasTheme} tone="neutral" dot>
                        DRTS · owned
                      </Pill>
                    </View>
                    <Text style={styles.contextCode}>一般安全事件</Text>
                    <Text style={styles.contextBody}>
                      目前未偵測到需附加的外部平台訂單，送出後會建立不含跨平台
                      metadata 的 SOS。
                    </Text>
                  </View>
                )}
              </Card>

              <Card
                theme={driverCanvasTheme}
                title={driverStrings.incident.sections.details}
                subtitle="自由文字是選填，但可幫助派車台判斷是否需要警方、醫療或平台聯繫"
              >
                <Field
                  theme={driverCanvasTheme}
                  label="補充說明"
                  hint={
                    selectedSituationLabel
                      ? `已選情況：${selectedSituationLabel}`
                      : "未選情況也可直接送出 SOS"
                  }
                >
                  <TextInput
                    value={details}
                    onChangeText={(value) => {
                      setDetails(value);
                      setSubmissionError(null);
                    }}
                    editable={!submitting}
                    multiline
                    numberOfLines={5}
                    placeholder="例如：乘客衝突升高、車禍需要警消、有人受傷…"
                    placeholderTextColor={driverCanvasTheme.textDim}
                    style={styles.detailsInput}
                    textAlignVertical="top"
                  />
                </Field>
              </Card>

              <Card
                theme={driverCanvasTheme}
                title={driverStrings.trip.sections.availableActions}
                subtitle="CTA 以 availableActions contract shape 統一渲染；高風險 submit 永遠不會退化成單擊"
              >
                <View style={styles.actionSummaryList}>
                  {availableActions.map((action) => (
                    <View key={action.action} style={styles.actionSummaryRow}>
                      <View style={styles.actionSummaryCopy}>
                        <Text style={styles.actionSummaryName}>
                          {action.action}
                        </Text>
                        <Text style={styles.actionSummaryMeta}>
                          risk={action.riskLevel} ·{" "}
                          {action.enabled
                            ? "enabled"
                            : (action.disabledReasonCode ?? "disabled")}
                        </Text>
                      </View>
                      <Pill
                        theme={driverCanvasTheme}
                        tone={action.enabled ? "accent" : "neutral"}
                      >
                        {action.enabled ? "可執行" : "受限"}
                      </Pill>
                    </View>
                  ))}
                </View>
              </Card>
            </>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Text style={styles.footerHint}>
            {holdActive
              ? `保持按住直到 100% 以送出 SOS。現在進度 ${holdProgressPercent}%。`
              : "Q-DRV11: 開啟 sheet 後必須再按住 2 秒。中途放開不會送出。"}
          </Text>
          <View style={styles.footerActions}>
            <Btn
              theme={driverCanvasTheme}
              variant="secondary"
              size="md"
              disabled={!cancelAction.enabled}
              onPress={handleClose}
              style={styles.footerCancel}
            >
              {entry === "cockpit"
                ? "返回工作台"
                : driverStrings.incident.cancelAction}
            </Btn>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="按住 2 秒送出 SOS"
              disabled={!primaryAction.enabled}
              onPressIn={handleHoldStart}
              onPressOut={handleHoldEnd}
              style={[
                styles.holdButton,
                !primaryAction.enabled ? styles.holdButtonDisabled : null,
              ]}
            >
              <View
                style={[
                  styles.holdProgressFill,
                  { width: `${holdProgressPercent}%` },
                ]}
              />
              <View style={styles.holdButtonContent}>
                {submitting || replayingPending ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Text style={styles.holdEyebrow}>
                      {replayQueued ? "待重送佇列優先" : "press-and-hold 2s"}
                    </Text>
                    <Text style={styles.holdLabel}>
                      {holdActive
                        ? `持續按住 ${holdProgressPercent}%`
                        : "按住送出 SOS"}
                    </Text>
                  </>
                )}
              </View>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(4, 10, 18, 0.64)",
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    maxHeight: "92%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: driverCanvasTheme.bg,
    borderWidth: 1,
    borderColor: driverCanvasTheme.border,
    overflow: "hidden",
  },
  sheetHandleWrap: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 4,
  },
  sheetHandle: {
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: driverCanvasTheme.borderStrong,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
    gap: 12,
  },
  heroCard: {
    backgroundColor: driverCanvasTheme.dangerBg,
    borderColor: driverCanvasTheme.dangerBorder,
  },
  heroRow: {
    flexDirection: "row",
    gap: 12,
  },
  heroIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: driverCanvasTheme.danger,
  },
  heroCopy: {
    flex: 1,
    gap: 8,
  },
  heroTitle: {
    color: driverCanvasTheme.text,
    fontSize: 18,
    fontWeight: "700",
  },
  heroBody: {
    color: driverCanvasTheme.textMuted,
    fontSize: 12.5,
    lineHeight: 19,
  },
  heroMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  loadingText: {
    flex: 1,
    color: driverCanvasTheme.textMuted,
    fontSize: 12.5,
    lineHeight: 18,
  },
  emptyStateBody: {
    alignItems: "flex-start",
    gap: 14,
  },
  emptyStateText: {
    color: driverCanvasTheme.textMuted,
    fontSize: 12.5,
    lineHeight: 19,
  },
  situationGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  situationButton: {
    width: "48%",
    minHeight: 72,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    paddingVertical: 12,
    justifyContent: "space-between",
    backgroundColor: driverCanvasTheme.surface,
  },
  situationButtonIdle: {
    borderColor: driverCanvasTheme.border,
  },
  situationButtonSelected: {
    borderColor: driverCanvasTheme.danger,
    backgroundColor: driverCanvasTheme.dangerBg,
  },
  situationLabel: {
    color: driverCanvasTheme.text,
    fontSize: 13,
    fontWeight: "700",
  },
  situationLabelSelected: {
    color: driverCanvasTheme.danger,
  },
  situationCode: {
    color: driverCanvasTheme.textDim,
    fontSize: 10.5,
  },
  contextWrap: {
    gap: 8,
  },
  contextPillRow: {
    flexDirection: "row",
  },
  contextCode: {
    color: driverCanvasTheme.text,
    fontSize: 14,
    fontWeight: "700",
  },
  contextBody: {
    color: driverCanvasTheme.textMuted,
    fontSize: 12.5,
    lineHeight: 19,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  metaLabel: {
    color: driverCanvasTheme.textDim,
    fontSize: 11,
    textTransform: "uppercase",
  },
  metaValue: {
    flexShrink: 1,
    color: driverCanvasTheme.text,
    fontSize: 11.5,
    textAlign: "right",
  },
  detailsInput: {
    minHeight: 112,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: driverCanvasTheme.border,
    backgroundColor: driverCanvasTheme.bgRaised,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: driverCanvasTheme.text,
    fontSize: 13,
    lineHeight: 19,
  },
  actionSummaryList: {
    gap: 10,
  },
  actionSummaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  actionSummaryCopy: {
    flex: 1,
    gap: 3,
  },
  actionSummaryName: {
    color: driverCanvasTheme.text,
    fontSize: 12.5,
    fontWeight: "700",
  },
  actionSummaryMeta: {
    color: driverCanvasTheme.textDim,
    fontSize: 11,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: driverCanvasTheme.border,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 22,
    gap: 10,
    backgroundColor: driverCanvasTheme.bg,
  },
  footerHint: {
    color: driverCanvasTheme.textMuted,
    fontSize: 11.5,
    lineHeight: 17,
  },
  footerActions: {
    flexDirection: "row",
    gap: 10,
  },
  footerCancel: {
    minWidth: 110,
    justifyContent: "center",
  },
  holdButton: {
    flex: 1,
    minHeight: 62,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: driverCanvasTheme.danger,
    backgroundColor: "#7F1D1D",
    justifyContent: "center",
  },
  holdButtonDisabled: {
    opacity: 0.5,
  },
  holdProgressFill: {
    ...StyleSheet.absoluteFillObject,
    right: undefined,
    backgroundColor: "#DC2626",
  },
  holdButtonContent: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 4,
  },
  holdEyebrow: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 10.5,
    fontWeight: "600",
  },
  holdLabel: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
});
