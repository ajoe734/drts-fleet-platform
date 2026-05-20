import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { PLATFORM_CODE_REGISTRY } from "@drts/contracts";
import type { DriverTaskRecord, UnifiedDriverTaskView } from "@drts/contracts";

import {
  Banner,
  Btn,
  Card,
  DL,
  Field,
  PageHeader,
  Pill,
  Shell,
  driverCanvasTheme,
  type DLItem,
} from "@/components/canvas-primitives";
import { PlatformBadge } from "@/components/ui/PlatformBadge";
import { confirmDangerAction } from "@/components/ui/confirm-danger-action";
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

const SOS_SITUATIONS = driverIncidentSituations;
const THEME = driverCanvasTheme;

type SosSituationId = (typeof SOS_SITUATIONS)[number]["id"];

const SOS_LONG_PRESS_DELAY_MS = 800;

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

export default function IncidentScreen() {
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
  const [longPressHintVisible, setLongPressHintVisible] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const client = getDriverClient();
    client
      .isFeatureEnabled("driver-app.incidents")
      .then((enabled) => setIncidentsEnabled(enabled))
      .catch(() => setIncidentsEnabled(true));
  }, []);

  useEffect(() => {
    if (incidentsEnabled !== true) {
      return;
    }

    let active = true;
    setIncidentContextReady(false);
    void resolveIncidentPlatformContext().then((platformContext) => {
      if (!active) {
        return;
      }

      setIncidentContextPreview(platformContext);
      setIncidentContextReady(true);
    });

    return () => {
      active = false;
    };
  }, [incidentsEnabled]);

  const handleBackToTrip = () => {
    if (submitting) {
      return;
    }

    router.replace("/trip");
  };

  const submitIncident = async () => {
    if (submitting) {
      return;
    }

    setSubmitting(true);
    setSubmissionError(null);
    setLongPressHintVisible(false);
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
      setSubmissionError(null);
      router.replace("/trip");
    } catch (error: unknown) {
      setSubmissionError(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitPress = () => {
    if (submitting) {
      return;
    }

    setSubmissionError(null);
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

  const handleSituationPress = (situationId: SosSituationId) => {
    if (submitting) {
      return;
    }

    setSelectedSituation(situationId);
    setLongPressHintVisible(false);
  };

  const handleLongPressCtaPress = () => {
    if (submitting) {
      return;
    }

    setLongPressHintVisible(true);
  };

  const handleLongPressCtaConfirm = () => {
    if (submitting) {
      return;
    }

    setLongPressHintVisible(false);
    handleSubmitPress();
  };

  const selectedSituationLabel = getSituationLabel(selectedSituation);
  const orderContextSubtitle = incidentContextPreview
    ? "平台與訂單資訊會跟著 SOS 一起送到安全事件。"
    : "若目前沒有外部平台任務，SOS 仍會以一般安全事件建立。";
  const contextDetailItems: DLItem[] = incidentContextPreview
    ? [
        {
          label: "外部訂單",
          value: incidentContextPreview.externalOrderId ?? "未提供",
          mono: true,
        },
        ...(incidentContextPreview.nativeStatus
          ? [
              {
                label: "平台狀態",
                value:
                  formatPlatformStatusLabel(incidentContextPreview.nativeStatus) ??
                  incidentContextPreview.nativeStatus,
              },
            ]
          : []),
      ]
    : [];

  if (incidentsEnabled === null) {
    return (
      <Shell theme={THEME} contentContainerStyle={styles.shellContent}>
        <PageHeader
          theme={THEME}
          title={driverStrings.incident.title}
          subtitle={driverStrings.incident.subtitle}
          actions={
            <Pill theme={THEME} tone="info" dot>
              {driverStrings.incident.loadingTitle}
            </Pill>
          }
        />
        <Card theme={THEME} padding={18}>
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color={THEME.accent} />
            <Text style={styles.loadingLabel}>載入 SOS 流程中…</Text>
          </View>
        </Card>
      </Shell>
    );
  }

  if (!incidentsEnabled) {
    return (
      <Shell theme={THEME} contentContainerStyle={styles.shellContent}>
        <PageHeader
          theme={THEME}
          title={driverStrings.incident.title}
          subtitle={driverStrings.incident.subtitle}
          actions={
            <Pill theme={THEME} tone="warn" dot>
              {driverStrings.incident.disabledTitle}
            </Pill>
          }
        />
        <Card theme={THEME} padding={18}>
          <View style={styles.emptyState}>
            <Ionicons
              name="warning-outline"
              size={28}
              color={THEME.warn}
              style={styles.emptyStateIcon}
            />
            <Text style={styles.emptyStateTitle}>SOS 緊急通報暫停提供</Text>
            <Text style={styles.emptyStateBody}>
              此功能目前未啟用，請返回行程或稍後再試。
            </Text>
            <Btn
              theme={THEME}
              variant="secondary"
              size="md"
              onPress={handleBackToTrip}
            >
              返回行程
            </Btn>
          </View>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell
      theme={THEME}
      contentContainerStyle={styles.shellContent}
      footer={
        <View
          style={[
            styles.footerBar,
            {
              backgroundColor: THEME.bgRaised,
              borderTopColor: THEME.border,
            },
          ]}
        >
          {longPressHintVisible ? (
            <Text style={styles.footerHint}>
              請長按按鈕約 0.8 秒，接著再於確認視窗送出 SOS。
            </Text>
          ) : null}
          <View style={styles.footerButtonRow}>
            <Btn
              theme={THEME}
              variant="secondary"
              size="md"
              onPress={handleBackToTrip}
              disabled={submitting}
              style={styles.footerCancelButton}
            >
              {driverStrings.incident.cancelAction}
            </Btn>
            <Pressable
              accessibilityLabel="長按確認求援"
              accessibilityRole="button"
              delayLongPress={SOS_LONG_PRESS_DELAY_MS}
              disabled={submitting}
              onLongPress={handleLongPressCtaConfirm}
              onPress={handleLongPressCtaPress}
              style={({ pressed }) => [
                styles.footerDangerButton,
                {
                  backgroundColor: THEME.danger,
                  borderColor: THEME.danger,
                  opacity: submitting ? 0.55 : pressed ? 0.88 : 1,
                },
              ]}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.footerDangerButtonLabel}>
                  {driverStrings.incident.confirmAction}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      }
    >
      <PageHeader
        theme={THEME}
        title={driverStrings.incident.title}
        subtitle={driverStrings.incident.subtitle}
        actions={
          <Pill theme={THEME} tone="danger" dot>
            {driverStrings.incident.urgentTitle}
          </Pill>
        }
      />

      <Card
        theme={THEME}
        padding={18}
        style={[
          styles.heroCard,
          {
            backgroundColor: THEME.dangerBg,
            borderColor: `${THEME.danger}66`,
          },
        ]}
      >
        <View style={styles.heroRow}>
          <View
            style={[
              styles.heroIconBox,
              { backgroundColor: THEME.danger, borderColor: THEME.danger },
            ]}
          >
            <Ionicons name="warning-outline" size={20} color="#FFFFFF" />
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroEyebrow}>
              {driverStrings.incident.heroEyebrow}
            </Text>
            <Text style={[styles.heroTitle, { color: THEME.danger }]}>
              {driverStrings.incident.heroTitle}
            </Text>
            <Text style={styles.heroBody}>
              送出後將立即通知安全官與派車台，並建立重大安全事件優先處理。
            </Text>
          </View>
        </View>
      </Card>

      {submissionError ? (
        <Banner
          theme={THEME}
          tone="danger"
          icon={
            <Ionicons
              name="alert-circle-outline"
              size={16}
              color={THEME.danger}
            />
          }
          title="SOS 送出失敗"
          body={submissionError}
        />
      ) : null}

      <View style={styles.sectionBlock}>
        <Text style={styles.sectionTitle}>
          {driverStrings.incident.sections.situation}
        </Text>
        <View style={styles.situationGrid}>
          {SOS_SITUATIONS.map((situation) => {
            const selected = selectedSituation === situation.id;

            return (
              <Pressable
                key={situation.id}
                accessibilityRole="button"
                disabled={submitting}
                onPress={() => handleSituationPress(situation.id)}
                style={({ pressed }) => [
                  styles.situationButton,
                  {
                    backgroundColor: selected ? THEME.dangerBg : THEME.surface,
                    borderColor: selected ? THEME.danger : THEME.border,
                    opacity: submitting ? 0.6 : pressed ? 0.88 : 1,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.situationButtonText,
                    { color: selected ? THEME.danger : THEME.text },
                  ]}
                >
                  {situation.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.sectionBlock}>
        <Text style={styles.sectionTitle}>
          {driverStrings.incident.sections.context}
        </Text>
        <Text style={styles.sectionSubtitle}>{orderContextSubtitle}</Text>
        {incidentContextReady ? (
          <Card theme={THEME} padding={14} style={styles.contextCard}>
            {incidentContextPreview ? (
              <View style={styles.contextStack}>
                <View style={styles.contextBadgeRow}>
                  <PlatformBadge
                    code={incidentContextPreview.platformCode}
                    name={incidentContextPreview.platformLabel}
                    forwarded
                    size="sm"
                  />
                  <Pill theme={THEME} tone="info">
                    {driverStrings.incident.orderContextForwarded}
                  </Pill>
                </View>
                <Text style={styles.contextTitle}>
                  {incidentContextPreview.mirrorOrderId}
                </Text>
                <Text style={styles.contextBody}>
                  平台訂單編號將隨求援一同送出，安全官可直接對照鏡像與外部單號。
                </Text>
                {contextDetailItems.length > 0 ? (
                  <DL
                    theme={THEME}
                    cols={contextDetailItems.length > 1 ? 2 : 1}
                    items={contextDetailItems}
                  />
                ) : null}
              </View>
            ) : (
              <View style={styles.contextStack}>
                <View style={styles.contextBadgeRow}>
                  <PlatformBadge code="DR" name="DRTS" size="sm" />
                  <Pill theme={THEME} tone="neutral">
                    {driverStrings.incident.orderContextOwned}
                  </Pill>
                </View>
                <Text style={styles.contextTitle}>目前未偵測到外部平台訂單</Text>
                <Text style={styles.contextBody}>
                  若此刻是自營任務或非訂單情境，SOS 仍會照常建立，並在成功後返回行程頁。
                </Text>
              </View>
            )}
          </Card>
        ) : (
          <Card theme={THEME} padding={14} style={styles.contextCard}>
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={THEME.accent} />
              <Text style={styles.loadingInlineLabel}>正在檢查目前訂單情境…</Text>
            </View>
          </Card>
        )}
      </View>

      <View style={styles.sectionBlock}>
        <Text style={styles.sectionTitle}>
          {driverStrings.incident.sections.details}
        </Text>
        <Text style={styles.sectionSubtitle}>
          可補充目前位置、乘客狀況或即時風險。
        </Text>
        <Card theme={THEME} padding={14}>
          <Field
            theme={THEME}
            label="現場補充（選填）"
            hint={
              selectedSituationLabel
                ? `已選情況：${selectedSituationLabel}。若留白，系統仍會送出預設 SOS 說明。`
                : "若留白，系統會送出預設 SOS 說明。"
            }
          >
            <TextInput
              autoCapitalize="sentences"
              autoCorrect
              editable={!submitting}
              multiline
              numberOfLines={4}
              onChangeText={(value) => {
                setDetails(value);
                if (submissionError) {
                  setSubmissionError(null);
                }
              }}
              placeholder="例如乘客情緒升高、車上有人受傷、需警方或醫療支援…"
              placeholderTextColor={THEME.textDim}
              selectionColor={THEME.accent}
              style={[
                styles.detailsInput,
                {
                  backgroundColor: THEME.bgRaised,
                  borderColor: THEME.border,
                  color: THEME.text,
                  fontFamily: THEME.fontFamily,
                },
              ]}
              textAlignVertical="top"
              value={details}
            />
          </Field>
        </Card>
      </View>
    </Shell>
  );
}

const styles = StyleSheet.create({
  shellContent: {
    paddingTop: 16,
    paddingBottom: 20,
    gap: 16,
  },
  loadingState: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    minHeight: 180,
  },
  loadingLabel: {
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 13.5,
    lineHeight: 20,
  },
  emptyState: {
    alignItems: "center",
    gap: 10,
  },
  emptyStateIcon: {
    marginBottom: 4,
  },
  emptyStateTitle: {
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 20,
  },
  emptyStateBody: {
    color: THEME.textMuted,
    fontFamily: THEME.fontFamily,
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: "center",
    marginBottom: 4,
  },
  heroCard: {
    borderRadius: 16,
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  heroIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  heroCopy: {
    flex: 1,
    gap: 2,
  },
  heroEyebrow: {
    color: THEME.textMuted,
    fontFamily: THEME.fontFamily,
    fontSize: 12.5,
    lineHeight: 16,
  },
  heroTitle: {
    fontFamily: THEME.fontFamily,
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 20,
  },
  heroBody: {
    color: THEME.textMuted,
    fontFamily: THEME.fontFamily,
    fontSize: 12,
    lineHeight: 17,
  },
  sectionBlock: {
    gap: 8,
  },
  sectionTitle: {
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 16,
  },
  sectionSubtitle: {
    color: THEME.textMuted,
    fontFamily: THEME.fontFamily,
    fontSize: 11.5,
    lineHeight: 16,
  },
  situationGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  situationButton: {
    width: "48.8%",
    minHeight: 50,
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderRadius: 12,
    justifyContent: "center",
  },
  situationButtonText: {
    fontFamily: THEME.fontFamily,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 17,
  },
  contextCard: {
    borderRadius: 14,
  },
  contextStack: {
    gap: 10,
  },
  contextBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  contextTitle: {
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 17,
  },
  contextBody: {
    color: THEME.textMuted,
    fontFamily: THEME.monoFamily,
    fontSize: 11,
    lineHeight: 16,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  loadingInlineLabel: {
    color: THEME.textMuted,
    fontFamily: THEME.fontFamily,
    fontSize: 12,
    lineHeight: 16,
  },
  detailsInput: {
    minHeight: 112,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 12.5,
    lineHeight: 18,
  },
  footerBar: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 8,
  },
  footerHint: {
    color: THEME.textMuted,
    fontFamily: THEME.fontFamily,
    fontSize: 11,
    lineHeight: 16,
  },
  footerButtonRow: {
    flexDirection: "row",
    gap: 8,
  },
  footerCancelButton: {
    flex: 1,
    minHeight: 44,
  },
  footerDangerButton: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  footerDangerButtonLabel: {
    color: "#FFFFFF",
    fontFamily: THEME.fontFamily,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 17,
  },
});
