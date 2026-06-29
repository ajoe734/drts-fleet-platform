import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { REALM_COLORS, SURFACE_ACCENTS, type TokenMode } from "@drts/ui-tokens";
import type {
  SubmitSafetyOperatorPreTripChecklistCommand,
  SubmitSafetyOperatorTakeoverReportResult,
} from "@drts/contracts";

import { driverTheme } from "@/lib/theme";
import {
  buildShiftHandoverCommand,
  buildTakeoverCommand,
  SAFETY_OPERATOR_CHECKLIST_TEMPLATE,
  SAFETY_OPERATOR_FIXTURE,
  SAFETY_OPERATOR_INCIDENT_TAGS,
} from "@/lib/safety-operator-fixtures";
import {
  buildSafetyOperatorQueuedShiftHandover,
  describeSafetyOperatorQueuedShiftHandover,
  parseSafetyOperatorQueuedShiftHandover,
  resolveSafetyOperatorShiftHandoverCommand,
  selectSafetyOperatorHandoverTakeoverLinkage,
  type SafetyOperatorQueuedShiftHandover,
} from "@/lib/safety-operator-handover-draft";
import {
  clearSafetyOperatorSyncedQueueEntries,
  enqueueSafetyOperatorItem,
  getSafetyOperatorQueueSnapshot,
  markSafetyOperatorQueueFailed,
  markSafetyOperatorQueueSynced,
  markSafetyOperatorQueueSyncing,
  type SafetyOperatorQueueEntry,
  type SafetyOperatorQueueSnapshot,
  type SafetyOperatorQueueStatus,
} from "@/lib/safety-operator-offline-queue";
import {
  applySafetyOperatorTakeoverCorrection,
  buildSafetyOperatorQueuedTakeoverReport,
  createSafetyOperatorTakeoverDraftAudit,
  parseSafetyOperatorQueuedTakeoverReport,
  type SafetyOperatorQueuedTakeoverReport,
  type SafetyOperatorTakeoverDraftAudit,
} from "@/lib/safety-operator-takeover-draft";
import {
  getDriverClient,
  isDriverIdentityProvisioned,
  recoverDriverSessionFromApiError,
} from "@/lib/api-client";

type SafetyOperatorView =
  | "provisioning"
  | "shiftStart"
  | "vehicleAssign"
  | "pretrip"
  | "active"
  | "takeover"
  | "incident"
  | "closeout"
  | "handover";

const THEME = driverTheme;
const MODE = THEME.mode as TokenMode;
const SAFETY_ACCENT = SURFACE_ACCENTS.platform[MODE];
const SAFETY_REALM = REALM_COLORS.platform[MODE];

const INITIAL_QUEUE_SNAPSHOT: SafetyOperatorQueueSnapshot = {
  items: [],
  queuedCount: 0,
  failedCount: 0,
  syncingCount: 0,
  lastSyncedAt: null,
};

const VIEW_TABS: Array<{ id: SafetyOperatorView; label: string }> = [
  { id: "provisioning", label: "資格" },
  { id: "shiftStart", label: "開班" },
  { id: "vehicleAssign", label: "派車" },
  { id: "pretrip", label: "行前" },
  { id: "active", label: "監看" },
  { id: "takeover", label: "接管" },
  { id: "incident", label: "證據" },
  { id: "closeout", label: "結案" },
  { id: "handover", label: "交班" },
];

function formatAt(value: string | null) {
  if (!value) {
    return "尚無更新";
  }

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return value;
  }

  return new Date(timestamp).toLocaleString("zh-TW", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return fallback;
}

function formatQueueKindLabel(kind: SafetyOperatorQueueEntry["kind"]): string {
  switch (kind) {
    case "pretrip":
      return "行前檢查";
    case "takeover_report":
      return "接管回報";
    case "incident_upload":
      return "證據佇列";
    case "shift_handover":
      return "交班紀錄";
    default:
      return kind;
  }
}

function formatQueueStatusLabel(status: SafetyOperatorQueueStatus): string {
  switch (status) {
    case "queued":
      return "待同步";
    case "syncing":
      return "同步中";
    case "failed":
      return "同步失敗";
    case "synced":
      return "已同步";
    default:
      return status;
  }
}

function isRetryableQueueEntry(entry: SafetyOperatorQueueEntry): boolean {
  return (
    entry.kind !== "incident_upload" &&
    entry.status !== "syncing" &&
    entry.status !== "synced"
  );
}

function describeQueueEntry(entry: SafetyOperatorQueueEntry): {
  summary: string;
  detail: string;
} {
  switch (entry.kind) {
    case "pretrip": {
      const payload =
        entry.payload as Partial<SubmitSafetyOperatorPreTripChecklistCommand>;
      return {
        summary: `${payload.items?.length ?? 0} 項檢查 · blocker ${
          payload.blockerCodes?.length ?? 0
        }`,
        detail: payload.notes ?? "行前檢查等待同步。",
      };
    }
    case "takeover_report": {
      const payload = parseSafetyOperatorQueuedTakeoverReport(entry.payload);
      return {
        summary: `原始 ${formatAt(
          payload.draftAudit.originalSystemOccurredAt,
        )} -> 送出 ${formatAt(payload.command.occurredAt)}`,
        detail: `${payload.draftAudit.corrections.length} 次修正 · ${payload.command.clientGeneratedReportId}`,
      };
    }
    case "incident_upload": {
      const payload = entry.payload as {
        incidentId?: string;
        bookmarkId?: string;
        evidenceArtifactIds?: string[];
      };
      return {
        summary: `${payload.evidenceArtifactIds?.length ?? 0} 份證據 · ${
          payload.incidentId ?? "incident 未綁定"
        }`,
        detail: payload.bookmarkId
          ? `bookmark ${payload.bookmarkId}`
          : "等待證據同步服務接線。",
      };
    }
    case "shift_handover": {
      return describeSafetyOperatorQueuedShiftHandover(entry.payload);
    }
    default:
      return {
        summary: "待同步項目",
        detail: "等待處理。",
      };
  }
}

function ModeTab({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.modeTab, active ? styles.modeTabActive : null]}
    >
      <Text
        style={[styles.modeTabText, active ? styles.modeTabTextActive : null]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function StatPill({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "danger" | "success";
}) {
  return (
    <View
      style={[
        styles.statPill,
        tone === "danger"
          ? styles.statPillDanger
          : tone === "success"
            ? styles.statPillSuccess
            : null,
      ]}
    >
      <Text style={styles.statPillLabel}>{label}</Text>
      <Text style={styles.statPillValue}>{value}</Text>
    </View>
  );
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
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Row({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, danger ? styles.rowDanger : null]}>
        {value}
      </Text>
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  compact = false,
}: {
  label: string;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        compact ? styles.buttonCompact : null,
        variant === "secondary"
          ? styles.buttonSecondary
          : variant === "danger"
            ? styles.buttonDanger
            : styles.buttonPrimary,
        disabled ? styles.buttonDisabled : null,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          variant === "secondary" ? styles.buttonSecondaryText : null,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function QueueStatusBadge({ status }: { status: SafetyOperatorQueueStatus }) {
  return (
    <View
      style={[
        styles.queueStatusBadge,
        status === "failed"
          ? styles.queueStatusFailed
          : status === "syncing"
            ? styles.queueStatusSyncing
            : status === "synced"
              ? styles.queueStatusSynced
              : styles.queueStatusQueued,
      ]}
    >
      <Text style={styles.queueStatusText}>{formatQueueStatusLabel(status)}</Text>
    </View>
  );
}

function SOFrame({ children }: { children: ReactNode }) {
  return <View style={styles.screen}>{children}</View>;
}

function SOModeBar({
  activeView,
  onChangeView,
}: {
  activeView: SafetyOperatorView;
  onChangeView: (view: SafetyOperatorView) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.modeBarContent}
      style={styles.modeBar}
    >
      {VIEW_TABS.map((tab) => (
        <ModeTab
          key={tab.id}
          active={tab.id === activeView}
          label={tab.label}
          onPress={() => onChangeView(tab.id)}
        />
      ))}
    </ScrollView>
  );
}

function SOSyncStrip({
  queueSnapshot,
  onRetryOutstanding,
}: {
  queueSnapshot: SafetyOperatorQueueSnapshot;
  onRetryOutstanding: () => void;
}) {
  const syncBannerLabel = queueSnapshot.failedCount
    ? `${queueSnapshot.failedCount} 筆同步失敗`
    : queueSnapshot.syncingCount
      ? `${queueSnapshot.syncingCount} 筆同步中`
      : queueSnapshot.queuedCount
        ? `${queueSnapshot.queuedCount} 筆待同步`
        : "已同步";
  const syncBannerTone =
    queueSnapshot.failedCount > 0
      ? styles.syncStripDanger
      : queueSnapshot.queuedCount > 0 || queueSnapshot.syncingCount > 0
        ? styles.syncStripQueued
        : styles.syncStripSynced;
  const retryableCount = queueSnapshot.items.filter(isRetryableQueueEntry).length;

  return (
    <View style={[styles.syncStrip, syncBannerTone]}>
      <View style={styles.syncStripRow}>
        <View style={styles.syncStripBody}>
          <Text style={styles.syncStripTitle}>{syncBannerLabel}</Text>
          <Text style={styles.syncStripMeta}>
            queue {queueSnapshot.items.length} · 上次同步{" "}
            {formatAt(queueSnapshot.lastSyncedAt)}
          </Text>
        </View>
        <PrimaryButton
          compact
          disabled={retryableCount === 0}
          label="重試可同步項目"
          variant="secondary"
          onPress={onRetryOutstanding}
        />
      </View>
    </View>
  );
}

function SOQueueLedger({
  queueSnapshot,
  onRetryEntry,
  onRetryOutstanding,
  onClearSynced,
}: {
  queueSnapshot: SafetyOperatorQueueSnapshot;
  onRetryEntry: (entry: SafetyOperatorQueueEntry) => void;
  onRetryOutstanding: () => void;
  onClearSynced: () => void;
}) {
  const retryableCount = queueSnapshot.items.filter(isRetryableQueueEntry).length;
  const syncedCount = queueSnapshot.items.filter(
    (entry) => entry.status === "synced",
  ).length;

  return (
    <SectionCard
      title="離線佇列"
      subtitle="SOSyncStrip · queue depth / status / retry surface"
    >
      <View style={styles.queueToolbar}>
        <PrimaryButton
          compact
          disabled={retryableCount === 0}
          label="重試失敗 / 待同步"
          variant="secondary"
          onPress={onRetryOutstanding}
        />
        <PrimaryButton
          compact
          disabled={syncedCount === 0}
          label="清除已同步"
          variant="secondary"
          onPress={onClearSynced}
        />
      </View>

      {queueSnapshot.items.length === 0 ? (
        <Text style={styles.bodyText}>
          目前沒有本機 queue 項目；一旦進入離線或延遲同步，這裡會保留明細。
        </Text>
      ) : (
        queueSnapshot.items.map((entry) => {
          const detail = describeQueueEntry(entry);
          return (
            <View key={entry.id} style={styles.queueCard}>
              <View style={styles.queueCardHeader}>
                <View style={styles.queueCardTitleBlock}>
                  <Text style={styles.queueCardTitle}>
                    {formatQueueKindLabel(entry.kind)}
                  </Text>
                  <Text style={styles.queueCardMeta}>
                    更新於 {formatAt(entry.updatedAt)}
                  </Text>
                </View>
                <QueueStatusBadge status={entry.status} />
              </View>
              <Text style={styles.queueCardSummary}>{detail.summary}</Text>
              <Text style={styles.queueCardDetail}>{detail.detail}</Text>
              {entry.errorMessage ? (
                <Text style={styles.queueErrorText}>{entry.errorMessage}</Text>
              ) : null}
              {entry.receipt ? (
                <Text style={styles.queueReceiptText}>receipt 已寫回本機佇列</Text>
              ) : null}
              {isRetryableQueueEntry(entry) ? (
                <View style={styles.queueActionRow}>
                  <PrimaryButton
                    compact
                    label="重試"
                    variant="secondary"
                    onPress={() => onRetryEntry(entry)}
                  />
                </View>
              ) : null}
            </View>
          );
        })
      )}
    </SectionCard>
  );
}

export default function SafetyOperatorScreen() {
  const router = useRouter();
  const isProvisioned = isDriverIdentityProvisioned();

  const [activeView, setActiveView] =
    useState<SafetyOperatorView>("shiftStart");
  const [queueSnapshot, setQueueSnapshot] =
    useState<SafetyOperatorQueueSnapshot>(INITIAL_QUEUE_SNAPSHOT);
  const [takeoverDraftAudit, setTakeoverDraftAudit] =
    useState<SafetyOperatorTakeoverDraftAudit>(() =>
      createSafetyOperatorTakeoverDraftAudit(
        SAFETY_OPERATOR_FIXTURE.systemDetectedTakeoverAt,
      ),
    );
  const [takeoverEditValue, setTakeoverEditValue] = useState<string>(
    SAFETY_OPERATOR_FIXTURE.systemDetectedTakeoverAt,
  );
  const [takeoverNotes, setTakeoverNotes] = useState<string>(
    "前方施工車臨停，安全員人工接管通過施工窄口。",
  );
  const [incidentNotes, setIncidentNotes] = useState<string>(
    "已補上施工區段照片與車內語音片段。",
  );
  const [handoverNotes, setHandoverNotes] = useState<string>(
    "交班提醒：施工點位仍有臨停風險，注意右後方機車。",
  );
  const [submissionState, setSubmissionState] = useState<string | null>(null);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [recentTakeover, setRecentTakeover] =
    useState<SubmitSafetyOperatorTakeoverReportResult | null>(null);
  const [submittedTakeoverAudit, setSubmittedTakeoverAudit] =
    useState<SafetyOperatorTakeoverDraftAudit | null>(null);

  const checklistBlockedCount = useMemo(
    () =>
      SAFETY_OPERATOR_CHECKLIST_TEMPLATE.filter(
        (item) => item.status !== "pass",
      ).length,
    [],
  );
  const unsyncedBreakdown = useMemo(() => {
    return queueSnapshot.items.reduce(
      (summary, entry) => {
        if (entry.status !== "synced") {
          if (entry.kind === "pretrip") {
            summary.pretrip += 1;
          }
          if (entry.kind === "takeover_report") {
            summary.takeover += 1;
          }
          if (entry.kind === "incident_upload") {
            summary.incident += 1;
          }
          if (entry.kind === "shift_handover") {
            summary.handover += 1;
          }
        }
        return summary;
      },
      {
        pretrip: 0,
        takeover: 0,
        incident: 0,
        handover: 0,
      },
    );
  }, [queueSnapshot.items]);

  useEffect(() => {
    void refreshQueueSnapshot();
  }, []);

  async function refreshQueueSnapshot() {
    setQueueSnapshot(await getSafetyOperatorQueueSnapshot());
  }

  function setUiError(error: unknown, fallback: string) {
    setScreenError(getErrorMessage(error, fallback));
  }

  function syncTakeoverDraftFromInput(): SafetyOperatorTakeoverDraftAudit {
    const nextDraft = applySafetyOperatorTakeoverCorrection(
      takeoverDraftAudit,
      takeoverEditValue,
    );
    if (nextDraft !== takeoverDraftAudit) {
      setTakeoverDraftAudit(nextDraft);
      setTakeoverEditValue(nextDraft.correctedOccurredAt);
    }
    return nextDraft;
  }

  async function syncTakeoverReport(
    queuedReport: SafetyOperatorQueuedTakeoverReport,
  ) {
    await markSafetyOperatorQueueSyncing(
      queuedReport.command.clientGeneratedReportId,
    );
    try {
      const result = await getDriverClient().submitSafetyOperatorTakeoverReport(
        queuedReport.command,
        {
          headers: {
            "Idempotency-Key": queuedReport.command.clientGeneratedReportId,
            "X-Request-Id": queuedReport.command.clientGeneratedReportId,
          },
        },
      );
      await markSafetyOperatorQueueSynced(
        queuedReport.command.clientGeneratedReportId,
        result.receipt,
        result.receipt.duplicate,
      );
      setRecentTakeover(result);
      setSubmissionState(
        result.receipt.duplicate
          ? "伺服器已接受同一份接管回報；本機佇列已與既有 receipt 合併。"
          : "接管回報已送出並取得伺服器 receipt。",
      );
    } catch (error) {
      await recoverDriverSessionFromApiError(error);
      await markSafetyOperatorQueueFailed(
        queuedReport.command.clientGeneratedReportId,
        getErrorMessage(error, "接管回報同步失敗，已保留在離線佇列。"),
      );
      setUiError(error, "接管回報同步失敗。");
    } finally {
      await refreshQueueSnapshot();
    }
  }

  async function syncPreTripChecklist(
    clientGeneratedId: string,
    command: SubmitSafetyOperatorPreTripChecklistCommand,
  ) {
    await markSafetyOperatorQueueSyncing(clientGeneratedId);
    try {
      await getDriverClient().submitSafetyOperatorPreTripChecklist(command);
      await markSafetyOperatorQueueSynced(clientGeneratedId, {
        completedAt: new Date().toISOString(),
      });
      setSubmissionState("行前檢查已同步。");
    } catch (error) {
      await recoverDriverSessionFromApiError(error);
      await markSafetyOperatorQueueFailed(
        clientGeneratedId,
        getErrorMessage(error, "行前檢查同步失敗，已保留於佇列。"),
      );
      setUiError(error, "行前檢查同步失敗。");
    } finally {
      await refreshQueueSnapshot();
    }
  }

  async function syncShiftHandover(
    clientGeneratedId: string,
    queuedHandover: SafetyOperatorQueuedShiftHandover,
  ) {
    await markSafetyOperatorQueueSyncing(clientGeneratedId);
    try {
      const liveQueueSnapshot = await getSafetyOperatorQueueSnapshot();
      const resolvedHandover = resolveSafetyOperatorShiftHandoverCommand(
        queuedHandover,
        liveQueueSnapshot.items,
      );
      if (resolvedHandover.unresolvedPendingTakeoverIds.length > 0) {
        throw new Error(
          "待關聯的接管回報尚未取得 reportId；交班紀錄會保留在佇列，待接管同步完成後再重試。",
        );
      }

      await getDriverClient().createSafetyOperatorTripCloseout(
        resolvedHandover.command,
      );
      await markSafetyOperatorQueueSynced(clientGeneratedId, {
        closeoutAt: new Date().toISOString(),
      });
      setSubmissionState("交班紀錄已同步。");
    } catch (error) {
      await recoverDriverSessionFromApiError(error);
      await markSafetyOperatorQueueFailed(
        clientGeneratedId,
        getErrorMessage(error, "交班同步失敗，已保留於佇列。"),
      );
      setUiError(error, "交班同步失敗。");
    } finally {
      await refreshQueueSnapshot();
    }
  }

  async function retryQueueEntry(entry: SafetyOperatorQueueEntry) {
    setScreenError(null);

    switch (entry.kind) {
      case "pretrip":
        await syncPreTripChecklist(
          entry.clientGeneratedId,
          entry.payload as SubmitSafetyOperatorPreTripChecklistCommand,
        );
        return;
      case "takeover_report": {
        const queuedReport = parseSafetyOperatorQueuedTakeoverReport(
          entry.payload,
        );
        setSubmittedTakeoverAudit(queuedReport.draftAudit);
        await syncTakeoverReport(queuedReport);
        return;
      }
      case "shift_handover": {
        const queuedHandover = parseSafetyOperatorQueuedShiftHandover(
          entry.payload,
        );
        await syncShiftHandover(
          entry.clientGeneratedId,
          queuedHandover,
        );
        return;
      }
      case "incident_upload":
        setScreenError(
          "證據同步服務尚未接線；這筆項目會繼續保留在 Safety Operator 本機佇列。",
        );
        return;
      default:
        return;
    }
  }

  async function retryOutstandingQueueEntries() {
    const retryOrder: Record<SafetyOperatorQueueEntry["kind"], number> = {
      pretrip: 0,
      takeover_report: 1,
      incident_upload: 2,
      shift_handover: 3,
    };

    const retryableItems = [...queueSnapshot.items].sort(
      (left, right) => retryOrder[left.kind] - retryOrder[right.kind],
    );

    for (const entry of retryableItems) {
      if (!isRetryableQueueEntry(entry)) {
        continue;
      }
      await retryQueueEntry(entry);
    }
  }

  async function submitTakeover() {
    setScreenError(null);

    let nextDraft: SafetyOperatorTakeoverDraftAudit;
    try {
      nextDraft = syncTakeoverDraftFromInput();
    } catch (error) {
      setUiError(error, "請先填入有效的接管發生時間。");
      return;
    }

    const command = buildTakeoverCommand({
      occurredAt: nextDraft.correctedOccurredAt,
      notes: takeoverNotes.trim(),
    });
    const queuedReport = buildSafetyOperatorQueuedTakeoverReport(
      command,
      nextDraft,
    );

    setSubmittedTakeoverAudit(nextDraft);
    await enqueueSafetyOperatorItem(
      "takeover_report",
      queuedReport,
      command.clientGeneratedReportId,
    );
    setSubmissionState(
      "接管回報已寫入 durable queue，保留原始系統時間與修正 audit，正在嘗試同步。",
    );
    await refreshQueueSnapshot();

    try {
      await syncTakeoverReport(queuedReport);
    } catch {
      // syncTakeoverReport already records error state.
    }
  }

  async function recordTakeoverTimeCorrection() {
    setScreenError(null);
    try {
      const nextDraft = syncTakeoverDraftFromInput();
      if (nextDraft === takeoverDraftAudit) {
        setSubmissionState("目前輸入的時間與已記錄的送出時間相同。");
        return;
      }
      setSubmissionState(`已記錄第 ${nextDraft.corrections.length} 次時間修正。`);
    } catch (error) {
      setUiError(error, "請先填入有效的接管發生時間。");
    }
  }

  async function submitPreTripChecklist() {
    setScreenError(null);
    const command: SubmitSafetyOperatorPreTripChecklistCommand = {
      shiftId: SAFETY_OPERATOR_FIXTURE.shiftId,
      assignmentId: SAFETY_OPERATOR_FIXTURE.assignmentId,
      safetyOperatorId: SAFETY_OPERATOR_FIXTURE.safetyOperatorId,
      vehicleId: SAFETY_OPERATOR_FIXTURE.vehicleId,
      blockerCodes: ["fallback_comms_recheck"],
      items: [...SAFETY_OPERATOR_CHECKLIST_TEMPLATE],
      notes: "備援通訊器材已換電池，待下一輪確認。",
    };

    const queued = await enqueueSafetyOperatorItem("pretrip", command);
    setSubmissionState("行前檢查已寫入 durable queue。");
    await refreshQueueSnapshot();
    await syncPreTripChecklist(queued.clientGeneratedId, command);
  }

  async function queueIncidentEvidence() {
    setScreenError(null);
    await enqueueSafetyOperatorItem("incident_upload", {
      incidentId: SAFETY_OPERATOR_FIXTURE.incidentId,
      bookmarkId: SAFETY_OPERATOR_FIXTURE.bookmarkId,
      evidenceArtifactIds: SAFETY_OPERATOR_FIXTURE.evidenceArtifactIds,
      notes: incidentNotes.trim(),
      createdAt: new Date().toISOString(),
    });
    setSubmissionState(
      "事故 / 證據資料已暫存到 durable queue；待證據同步服務接線後可重放。",
    );
    await refreshQueueSnapshot();
  }

  async function submitShiftHandover() {
    setScreenError(null);
    const liveQueueSnapshot = await getSafetyOperatorQueueSnapshot();
    const takeoverLinkage = selectSafetyOperatorHandoverTakeoverLinkage(
      liveQueueSnapshot.items,
      recentTakeover?.report.reportId,
    );
    const command = buildShiftHandoverCommand({
      takeoverReportIds: takeoverLinkage.takeoverReportIds,
      notes: handoverNotes.trim(),
    });
    const queuedHandover = buildSafetyOperatorQueuedShiftHandover(
      command,
      takeoverLinkage.pendingTakeoverClientGeneratedIds,
    );
    const queued = await enqueueSafetyOperatorItem(
      "shift_handover",
      queuedHandover,
    );
    setSubmissionState("交班紀錄已寫入 durable queue。");
    await refreshQueueSnapshot();
    await syncShiftHandover(queued.clientGeneratedId, queuedHandover);
  }

  async function clearSyncedQueueItems() {
    await clearSafetyOperatorSyncedQueueEntries();
    await refreshQueueSnapshot();
  }

  return (
    <SOFrame>
      <View style={styles.modeBanner}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Text style={styles.backButtonText}>返回</Text>
        </Pressable>
        <View style={styles.modeBannerBody}>
          <Text style={styles.modeEyebrow}>安全員模式</Text>
          <Text style={styles.modeTitle}>Safety Operator</Text>
        </View>
        <Text style={styles.modeRealmTag}>FSD 沙盒</Text>
      </View>

      <SOSyncStrip
        queueSnapshot={queueSnapshot}
        onRetryOutstanding={() => void retryOutstandingQueueEntries()}
      />

      <SOModeBar activeView={activeView} onChangeView={setActiveView} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {!isProvisioned ? (
          <View style={styles.warningBanner}>
            <Text style={styles.warningTitle}>尚未綁定司機裝置</Text>
            <Text style={styles.warningBody}>
              目前以本機 durable queue 模式預覽 Safety Operator realm。
              後續綁定後仍可重放未同步紀錄，且不會混用一般 driver 模式狀態。
            </Text>
          </View>
        ) : null}

        <SectionCard
          title="Realm 摘要"
          subtitle="SOFrame · SOModeBar · SOSyncStrip"
        >
          <View style={styles.statGrid}>
            <StatPill label="車輛" value={SAFETY_OPERATOR_FIXTURE.vehicleId} />
            <StatPill label="待同步" value={`${queueSnapshot.queuedCount}`} />
            <StatPill
              label="同步中"
              value={`${queueSnapshot.syncingCount}`}
              tone={queueSnapshot.syncingCount ? "success" : "default"}
            />
            <StatPill
              label="失敗"
              value={`${queueSnapshot.failedCount}`}
              tone={queueSnapshot.failedCount ? "danger" : "success"}
            />
          </View>
        </SectionCard>

        {screenError ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{screenError}</Text>
          </View>
        ) : null}

        {submissionState ? (
          <View style={styles.infoBanner}>
            <Text style={styles.infoBannerText}>{submissionState}</Text>
          </View>
        ) : null}

        {activeView === "provisioning" ? (
          <>
            <SectionCard title="安全員資格" subtitle="SO_Provisioning">
              <Row label="安全員" value={SAFETY_OPERATOR_FIXTURE.operatorName} />
              <Row
                label="安全員 ID"
                value={SAFETY_OPERATOR_FIXTURE.safetyOperatorId}
              />
              <Row label="裝置" value={SAFETY_OPERATOR_FIXTURE.deviceId} />
              <Row
                label="實驗計畫"
                value={SAFETY_OPERATOR_FIXTURE.sandboxProgramId}
              />
              <Row
                label="資格狀態"
                value={SAFETY_OPERATOR_FIXTURE.qualified ? "qualified" : "blocked"}
                danger={!SAFETY_OPERATOR_FIXTURE.qualified}
              />
            </SectionCard>

            <SectionCard title="資格對應" subtitle="matchedQualificationIds / reasons">
              <Row
                label="matchedQualificationIds"
                value={SAFETY_OPERATOR_FIXTURE.matchedQualificationIds.join(", ")}
              />
              {SAFETY_OPERATOR_FIXTURE.qualificationReasons.map((reason) => (
                <Text key={reason} style={styles.bodyText}>
                  {reason}
                </Text>
              ))}
            </SectionCard>

            <SectionCard title="可見邊界" subtitle="No FSD control UI">
              <Text style={styles.bodyText}>
                此 realm 只顯示資格、開班、派車、行前、監看、接管回報、證據、結案與交班。
                Tesla / FSD 內部控制、遠端控制、恢復自駕按鈕均不顯示。
              </Text>
            </SectionCard>
          </>
        ) : null}

        {activeView === "shiftStart" ? (
          <>
            <SectionCard title="班次啟動" subtitle="SO_ShiftStart">
              <Row label="shiftId" value={SAFETY_OPERATOR_FIXTURE.shiftId} />
              <Row
                label="activeAssignmentId"
                value={SAFETY_OPERATOR_FIXTURE.activeAssignmentId}
              />
              <Row
                label="shiftStartedAt"
                value={formatAt(SAFETY_OPERATOR_FIXTURE.shiftStartedAt)}
              />
              <Row
                label="experimentWindow"
                value={SAFETY_OPERATOR_FIXTURE.experimentWindow}
              />
              <Row
                label="coverageZone"
                value={SAFETY_OPERATOR_FIXTURE.coverageZone}
              />
            </SectionCard>

            <SectionCard title="開班邊界">
              <Text style={styles.bodyText}>
                開班後只進入 Safety Operator 沙盒流程；一般 driver 工作台、平台接單與
                Safety Operator queue 分開保存，不共用班次狀態。
              </Text>
            </SectionCard>
          </>
        ) : null}

        {activeView === "vehicleAssign" ? (
          <>
            <SectionCard title="裝置與車輛綁定" subtitle="SO_VehicleAssign">
              <Row label="deviceId" value={SAFETY_OPERATOR_FIXTURE.deviceId} />
              <Row label="vehicleId" value={SAFETY_OPERATOR_FIXTURE.vehicleId} />
              <Row
                label="vehicleAssignedAt"
                value={formatAt(SAFETY_OPERATOR_FIXTURE.vehicleAssignedAt)}
              />
              <Row
                label="assignmentId"
                value={SAFETY_OPERATOR_FIXTURE.assignmentId}
              />
              <Row label="orderId" value={SAFETY_OPERATOR_FIXTURE.orderId} />
            </SectionCard>

            <SectionCard title="派車上下文">
              <Text style={styles.bodyText}>
                這裡只顯示安全員對當前車輛與任務的綁定情境，不暴露任何 Tesla / FSD
                內部車控指令。後續接管、證據與 closeout 都沿用這組 assignment context。
              </Text>
            </SectionCard>
          </>
        ) : null}

        {activeView === "pretrip" ? (
          <>
            <SectionCard title="行前檢查" subtitle="SO_Pretrip">
              {SAFETY_OPERATOR_CHECKLIST_TEMPLATE.map((item) => (
                <Row
                  key={item.itemKey}
                  label={item.itemKey}
                  value={
                    item.status === "pass"
                      ? "pass"
                      : `${item.status} · ${item.note ?? ""}`
                  }
                  danger={item.status !== "pass"}
                />
              ))}
            </SectionCard>

            <SectionCard title="檢查結論">
              <Text style={styles.bodyText}>
                {checklistBlockedCount === 0
                  ? "所有檢查項目已通過。"
                  : `${checklistBlockedCount} 個項目仍需複核；提交時會把 blockerCodes、notes 與 completedAt 一起寫入離線佇列。`}
              </Text>
              <View style={styles.buttonRow}>
                <PrimaryButton
                  label="送出行前檢查"
                  onPress={() => void submitPreTripChecklist()}
                />
              </View>
            </SectionCard>
          </>
        ) : null}

        {activeView === "active" ? (
          <>
            <SectionCard title="行程監看" subtitle="SO_ActiveTrip">
              <Row label="shiftId" value={SAFETY_OPERATOR_FIXTURE.shiftId} />
              <Row
                label="assignmentId"
                value={SAFETY_OPERATOR_FIXTURE.assignmentId}
              />
              <Row label="vehicleId" value={SAFETY_OPERATOR_FIXTURE.vehicleId} />
              <Row label="orderId" value={SAFETY_OPERATOR_FIXTURE.orderId} />
              <Row label="Telemetry 鮮度" value="2 秒" />
              <Row label="監理事件鮮度" value="48 秒" danger />
            </SectionCard>

            <SectionCard title="未同步摘要">
              <Row label="pretrip" value={`${unsyncedBreakdown.pretrip}`} />
              <Row label="takeover" value={`${unsyncedBreakdown.takeover}`} />
              <Row label="incident" value={`${unsyncedBreakdown.incident}`} />
              <Row label="handover" value={`${unsyncedBreakdown.handover}`} />
            </SectionCard>
          </>
        ) : null}

        {activeView === "takeover" ? (
          <>
            <SectionCard title="接管回報" subtitle="SO_TakeoverReport">
              <Row
                label="原始系統時間"
                value={formatAt(takeoverDraftAudit.originalSystemOccurredAt)}
              />
              <Row
                label="目前送出時間"
                value={formatAt(takeoverDraftAudit.correctedOccurredAt)}
              />
              <Text style={styles.fieldLabel}>修正輸入 occurredAt</Text>
              <TextInput
                autoCapitalize="none"
                onChangeText={setTakeoverEditValue}
                style={styles.input}
                value={takeoverEditValue}
              />
              <Text style={styles.fieldHint}>
                送出前可反覆修正；每次套用修正都會留下本地 audit。送出後只以提交的
                occurredAt 與 serverReceivedAt 顯示同步結果。
              </Text>
              <Text style={styles.fieldLabel}>備註 notes</Text>
              <TextInput
                multiline
                onChangeText={setTakeoverNotes}
                style={[styles.input, styles.multilineInput]}
                value={takeoverNotes}
              />
              <View style={styles.buttonRow}>
                <PrimaryButton
                  label="記錄時間修正"
                  variant="secondary"
                  onPress={() => void recordTakeoverTimeCorrection()}
                />
                <PrimaryButton
                  label="提交接管回報"
                  variant="danger"
                  onPress={() => void submitTakeover()}
                />
              </View>
            </SectionCard>

            <SectionCard title="時間修正 audit" subtitle="editable occurredAt with audit trail">
              {takeoverDraftAudit.corrections.length === 0 ? (
                <Text style={styles.bodyText}>
                  目前尚未記錄時間修正；原始系統時間會隨首次送出一起保留在本機佇列。
                </Text>
              ) : (
                takeoverDraftAudit.corrections.map((correction, index) => (
                  <View key={`${correction.editedAt}-${index}`} style={styles.auditCard}>
                    <Text style={styles.auditTitle}>
                      第 {index + 1} 次修正 · {formatAt(correction.editedAt)}
                    </Text>
                    <Text style={styles.auditBody}>
                      {formatAt(correction.previousOccurredAt)}
                      {" -> "}
                      {formatAt(correction.nextOccurredAt)}
                    </Text>
                  </View>
                ))
              )}
            </SectionCard>

            <SectionCard title="最近 receipt" subtitle="clientGeneratedReportId dedupe">
              <Row
                label="clientGeneratedReportId"
                value={
                  recentTakeover?.receipt.clientGeneratedReportId ?? "尚未提交"
                }
              />
              <Row
                label="submitted occurredAt"
                value={formatAt(
                  submittedTakeoverAudit?.correctedOccurredAt ?? null,
                )}
              />
              <Row
                label="original system time"
                value={formatAt(
                  submittedTakeoverAudit?.originalSystemOccurredAt ?? null,
                )}
              />
              <Row
                label="serverReceivedAt"
                value={formatAt(
                  recentTakeover?.receipt.serverReceivedAt ?? null,
                )}
              />
              <Row
                label="local corrections"
                value={`${submittedTakeoverAudit?.corrections.length ?? 0}`}
              />
              <Row
                label="duplicate replay"
                value={recentTakeover?.receipt.duplicate ? "yes" : "no"}
                danger={Boolean(recentTakeover?.receipt.duplicate)}
              />
            </SectionCard>
          </>
        ) : null}

        {activeView === "incident" ? (
          <>
            <SectionCard title="事故 / 證據上傳" subtitle="SO_IncidentUpload">
              <Row
                label="incidentId"
                value={SAFETY_OPERATOR_FIXTURE.incidentId}
              />
              <Row
                label="bookmarkId"
                value={SAFETY_OPERATOR_FIXTURE.bookmarkId}
              />
              <Row
                label="evidenceArtifactIds"
                value={SAFETY_OPERATOR_FIXTURE.evidenceArtifactIds.join(", ")}
              />
              <Text style={styles.fieldLabel}>標籤</Text>
              <View style={styles.tagWrap}>
                {SAFETY_OPERATOR_INCIDENT_TAGS.map((tag) => (
                  <View key={tag} style={styles.tag}>
                    <Text style={styles.tagText}>{tag}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.fieldLabel}>同步備註</Text>
              <TextInput
                multiline
                onChangeText={setIncidentNotes}
                style={[styles.input, styles.multilineInput]}
                value={incidentNotes}
              />
              <View style={styles.buttonRow}>
                <PrimaryButton
                  label="加入證據佇列"
                  onPress={() => void queueIncidentEvidence()}
                />
              </View>
            </SectionCard>
          </>
        ) : null}

        {activeView === "closeout" ? (
          <>
            <SectionCard title="Trip Closeout" subtitle="SO_TripCloseout">
              <Row label="closeoutStatus" value="handoff" />
              <Row
                label="closeoutAt"
                value={formatAt(SAFETY_OPERATOR_FIXTURE.closeoutEndedAt)}
              />
              <Row
                label="endLocation"
                value={SAFETY_OPERATOR_FIXTURE.endLocationLabel}
              />
              <Row
                label="incident linkage"
                value={SAFETY_OPERATOR_FIXTURE.incidentId}
              />
              <Row
                label="takeover accepted"
                value={recentTakeover?.report.reportId ? "1" : "0"}
              />
            </SectionCard>

            <SectionCard title="closeout / handover distinction">
              <Text style={styles.bodyText}>
                這個 view 聚焦單趟 closeout 所需的 incident、takeover 與 endLocation
                上下文；真正交班送出則放在下一個 `SO_ShiftHandover` view。
              </Text>
            </SectionCard>
          </>
        ) : null}

        {activeView === "handover" ? (
          <>
            <SectionCard title="交班 / Shift Handover" subtitle="SO_ShiftHandover">
              <Row label="closeoutStatus" value="handoff" />
              <Row label="activeAssignmentId" value={SAFETY_OPERATOR_FIXTURE.activeAssignmentId} />
              <Row
                label="incident linkage"
                value={SAFETY_OPERATOR_FIXTURE.incidentId}
              />
              <Text style={styles.fieldLabel}>交班備註</Text>
              <TextInput
                multiline
                onChangeText={setHandoverNotes}
                style={[styles.input, styles.multilineInput]}
                value={handoverNotes}
              />
              <View style={styles.buttonRow}>
                <PrimaryButton
                  label="送出交班"
                  onPress={() => void submitShiftHandover()}
                />
                <PrimaryButton
                  label="清除已同步項目"
                  variant="secondary"
                  onPress={() => void clearSyncedQueueItems()}
                />
              </View>
            </SectionCard>
          </>
        ) : null}

        <SOQueueLedger
          queueSnapshot={queueSnapshot}
          onRetryEntry={(entry) => void retryQueueEntry(entry)}
          onRetryOutstanding={() => void retryOutstandingQueueEntries()}
          onClearSynced={() => void clearSyncedQueueItems()}
        />
      </ScrollView>
    </SOFrame>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: THEME.colors.appBackground,
  },
  modeBanner: {
    backgroundColor: SAFETY_ACCENT.bg,
    borderBottomColor: SAFETY_ACCENT.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 14,
  },
  backButton: {
    borderColor: SAFETY_ACCENT.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  backButtonText: {
    color: SAFETY_ACCENT.fg,
    fontWeight: "600",
  },
  modeBannerBody: {
    flex: 1,
  },
  modeEyebrow: {
    color: SAFETY_REALM.fg,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  modeTitle: {
    color: THEME.colors.textStrong,
    fontSize: 20,
    fontWeight: "700",
    marginTop: 2,
  },
  modeRealmTag: {
    color: SAFETY_ACCENT.fg,
    fontSize: 12,
    fontWeight: "600",
  },
  syncStrip: {
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  syncStripQueued: {
    backgroundColor: SAFETY_ACCENT.bg,
    borderBottomColor: SAFETY_ACCENT.border,
  },
  syncStripDanger: {
    backgroundColor: THEME.colors.dangerBg,
    borderBottomColor: THEME.colors.danger,
  },
  syncStripSynced: {
    backgroundColor: THEME.colors.successBg,
    borderBottomColor: THEME.colors.success,
  },
  syncStripRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  syncStripBody: {
    flex: 1,
  },
  syncStripTitle: {
    color: THEME.colors.textStrong,
    fontSize: 13,
    fontWeight: "700",
  },
  syncStripMeta: {
    color: THEME.colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  modeBar: {
    maxHeight: 56,
  },
  modeBarContent: {
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  modeTab: {
    backgroundColor: THEME.colors.surfaceLo,
    borderColor: THEME.colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  modeTabActive: {
    backgroundColor: SAFETY_ACCENT.bg,
    borderColor: SAFETY_ACCENT.border,
  },
  modeTabText: {
    color: THEME.colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  modeTabTextActive: {
    color: SAFETY_ACCENT.fg,
  },
  content: {
    gap: 12,
    padding: 16,
    paddingBottom: 32,
  },
  sectionCard: {
    backgroundColor: THEME.colors.surface,
    borderColor: THEME.colors.border,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  sectionTitle: {
    color: THEME.colors.textStrong,
    fontSize: 17,
    fontWeight: "700",
  },
  sectionSubtitle: {
    color: THEME.colors.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  sectionBody: {
    gap: 10,
    marginTop: 14,
  },
  row: {
    alignItems: "center",
    borderBottomColor: THEME.colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 10,
  },
  rowLabel: {
    color: THEME.colors.textMuted,
    flex: 1,
    fontSize: 12,
    marginRight: 12,
  },
  rowValue: {
    color: THEME.colors.textStrong,
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "right",
  },
  rowDanger: {
    color: THEME.colors.danger,
  },
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  statPill: {
    backgroundColor: THEME.colors.surfaceLo,
    borderColor: THEME.colors.border,
    borderRadius: 14,
    borderWidth: 1,
    minWidth: 140,
    padding: 12,
  },
  statPillDanger: {
    backgroundColor: THEME.colors.dangerBg,
    borderColor: THEME.colors.danger,
  },
  statPillSuccess: {
    backgroundColor: THEME.colors.successBg,
    borderColor: THEME.colors.success,
  },
  statPillLabel: {
    color: THEME.colors.textMuted,
    fontSize: 11,
  },
  statPillValue: {
    color: THEME.colors.textStrong,
    fontSize: 16,
    fontWeight: "700",
    marginTop: 6,
  },
  bodyText: {
    color: THEME.colors.text,
    fontSize: 14,
    lineHeight: 21,
  },
  warningBanner: {
    backgroundColor: THEME.colors.warningBg,
    borderColor: THEME.colors.warning,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  warningTitle: {
    color: THEME.colors.textStrong,
    fontSize: 14,
    fontWeight: "700",
  },
  warningBody: {
    color: THEME.colors.text,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 6,
  },
  errorBanner: {
    backgroundColor: THEME.colors.dangerBg,
    borderColor: THEME.colors.danger,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
  },
  errorBannerText: {
    color: THEME.colors.danger,
    fontSize: 13,
    lineHeight: 19,
  },
  infoBanner: {
    backgroundColor: THEME.colors.infoBg,
    borderColor: THEME.colors.info,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
  },
  infoBannerText: {
    color: THEME.colors.textStrong,
    fontSize: 13,
    lineHeight: 19,
  },
  fieldLabel: {
    color: THEME.colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  fieldHint: {
    color: THEME.colors.textDim,
    fontSize: 11,
    lineHeight: 16,
    marginTop: -4,
  },
  input: {
    backgroundColor: THEME.colors.surfaceLo,
    borderColor: THEME.colors.border,
    borderRadius: 12,
    borderWidth: 1,
    color: THEME.colors.textStrong,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  multilineInput: {
    minHeight: 92,
    textAlignVertical: "top",
  },
  buttonRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  button: {
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: 12,
  },
  buttonCompact: {
    flex: 0,
    minHeight: 34,
    paddingHorizontal: 10,
  },
  buttonPrimary: {
    backgroundColor: SAFETY_ACCENT.fg,
    borderColor: SAFETY_ACCENT.fg,
  },
  buttonSecondary: {
    backgroundColor: THEME.colors.surfaceLo,
    borderColor: THEME.colors.border,
  },
  buttonDanger: {
    backgroundColor: THEME.colors.danger,
    borderColor: THEME.colors.danger,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonText: {
    color: THEME.colors.inverse,
    fontSize: 14,
    fontWeight: "700",
  },
  buttonSecondaryText: {
    color: THEME.colors.textStrong,
  },
  tagWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tag: {
    backgroundColor: THEME.colors.surfaceLo,
    borderColor: THEME.colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tagText: {
    color: THEME.colors.textStrong,
    fontSize: 12,
    fontWeight: "600",
  },
  auditCard: {
    backgroundColor: THEME.colors.surfaceLo,
    borderColor: THEME.colors.border,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  auditTitle: {
    color: THEME.colors.textStrong,
    fontSize: 13,
    fontWeight: "700",
  },
  auditBody: {
    color: THEME.colors.text,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  queueToolbar: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  queueCard: {
    backgroundColor: THEME.colors.surfaceLo,
    borderColor: THEME.colors.border,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
  },
  queueCardHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  queueCardTitleBlock: {
    flex: 1,
    gap: 4,
  },
  queueCardTitle: {
    color: THEME.colors.textStrong,
    fontSize: 14,
    fontWeight: "700",
  },
  queueCardMeta: {
    color: THEME.colors.textDim,
    fontSize: 11,
  },
  queueCardSummary: {
    color: THEME.colors.textStrong,
    fontSize: 13,
    fontWeight: "600",
    marginTop: 8,
  },
  queueCardDetail: {
    color: THEME.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  queueActionRow: {
    flexDirection: "row",
    marginTop: 10,
  },
  queueStatusBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  queueStatusQueued: {
    backgroundColor: SAFETY_ACCENT.bg,
    borderColor: SAFETY_ACCENT.border,
  },
  queueStatusSyncing: {
    backgroundColor: THEME.colors.infoBg,
    borderColor: THEME.colors.info,
  },
  queueStatusFailed: {
    backgroundColor: THEME.colors.dangerBg,
    borderColor: THEME.colors.danger,
  },
  queueStatusSynced: {
    backgroundColor: THEME.colors.successBg,
    borderColor: THEME.colors.success,
  },
  queueStatusText: {
    color: THEME.colors.textStrong,
    fontSize: 11,
    fontWeight: "700",
  },
  queueErrorText: {
    color: THEME.colors.danger,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
  queueReceiptText: {
    color: THEME.colors.success,
    fontSize: 12,
    marginTop: 8,
  },
});
