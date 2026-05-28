import { useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { PLATFORM_CODE_REGISTRY } from "@drts/contracts";
import type { DriverTaskRecord, UnifiedDriverTaskView } from "@drts/contracts";

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

const SOS_SITUATIONS = driverIncidentSituations;

type SosSituationId = (typeof SOS_SITUATIONS)[number]["id"];

const SOS_LONG_PRESS_DELAY_MS = 2000;

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

  if (!incidentsEnabled) {
    return (
      <AppScreen scrollable={false} backgroundColor={Tokens.colors.appBg}>
        <PageHeader
          title={driverStrings.incident.title}
          subtitle={driverStrings.incident.subtitle}
          rightElement={
            <StatusChip
              label={driverStrings.incident.disabledTitle}
              variant="warning"
            />
          }
        />
        <EmptyState
          title="SOS 緊急通報暫停提供"
          description="此功能目前未啟用，請返回行程或稍後再試。"
          icon="warning-outline"
          actionTitle="返回行程"
          onAction={handleBackToTrip}
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
            <StatusChip
              label={driverStrings.incident.urgentTitle}
              variant="danger"
              strong
              dot
            />
          }
        />

        <View style={styles.content}>
          <View style={styles.heroCard}>
            <View style={styles.heroIconBadge}>
              <Text style={styles.heroIconLabel}>SOS</Text>
            </View>
            <View style={styles.heroCopy}>
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
                    onPress={() => handleSituationPress(situation.id)}
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
                    <StatusChip label="外部訂單" variant="forwarded" />
                  </View>
                  <Text style={styles.contextTitle}>
                    {incidentContextPreview.mirrorOrderId}
                  </Text>
                  <Text style={styles.contextBody}>
                    平台訂單上下文會隨 SOS
                    一起送出，安全官可直接對照鏡像與外部單號。
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
                    <StatusChip label="一般安全事件" variant="owned" />
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
              label="現場補充（選填）"
              value={details}
              onChangeText={(value) => {
                setDetails(value);
                if (submissionError) {
                  setSubmissionError(null);
                }
              }}
              placeholder="例如乘客情緒升高、車上有人受傷、需警方或醫療支援…"
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
            subtitle="SOS 不會因為單次點擊而直接送出。"
          >
            <Text style={styles.confirmationBody}>
              長按底部按鈕約 2
              秒後，系統仍會再要求一次確認；若情況已排除，可按取消返回行程。
            </Text>
            <View style={styles.confirmationChipRow}>
              <StatusChip label="兩階段確認" variant="danger" />
              <StatusChip label="可返回行程" variant="default" />
            </View>
          </SectionCard>
        </View>
      </AppScreen>

      <BottomActionBar
        style={styles.actionBar}
        notice={
          longPressHintVisible
            ? "請長按右側按鈕約 2 秒，接著再於確認視窗送出 SOS。"
            : "SOS 送出前仍會再確認一次，避免誤觸。"
        }
      >
        <ActionButton
          title={driverStrings.incident.cancelAction}
          onPress={handleBackToTrip}
          variant="secondary"
          disabled={submitting}
          style={styles.secondaryAction}
        />
        <TouchableOpacity
          accessibilityLabel="長按確認求援"
          accessibilityRole="button"
          activeOpacity={0.82}
          delayLongPress={SOS_LONG_PRESS_DELAY_MS}
          disabled={submitting}
          onLongPress={handleLongPressCtaConfirm}
          onPress={handleLongPressCtaPress}
          style={[
            styles.longPressAction,
            submitting ? styles.longPressActionDisabled : null,
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
  content: {
    paddingVertical: Tokens.spacing.lg,
    gap: Tokens.spacing.lg,
  },
  heroCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Tokens.colors.dangerBg,
    borderRadius: Tokens.radius.lg,
    padding: Tokens.spacing.xl,
    borderWidth: 1,
    borderColor: `${Tokens.colors.danger}33`,
    gap: Tokens.spacing.lg,
  },
  heroIconBadge: {
    width: 52,
    height: 52,
    borderRadius: 16,
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
  heroCopy: {
    flex: 1,
  },
  heroEyebrow: {
    ...Tokens.type.micro,
    color: Tokens.colors.danger,
    marginBottom: Tokens.spacing.xs,
  },
  heroTitle: {
    ...Tokens.type.sectionTitle,
    color: Tokens.colors.textStrong,
    marginBottom: Tokens.spacing.sm,
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
  sectionHeader: {
    marginBottom: Tokens.spacing.md,
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
  confirmationBody: {
    ...Tokens.type.body,
    color: Tokens.colors.textBody,
  },
  confirmationChipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Tokens.spacing.sm,
    flexWrap: "wrap",
    marginTop: Tokens.spacing.md,
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
    minHeight: 54,
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
});
