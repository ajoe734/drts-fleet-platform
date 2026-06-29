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

type SyncChannelState = "offline" | "queued" | "syncing" | "failed" | "synced";

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

const VIEW_TABS: Array<{
  id: SafetyOperatorView;
  label: string;
  screenCode: string;
}> = [
  { id: "provisioning", label: "資格", screenCode: "SO_Provisioning" },
  { id: "shiftStart", label: "開班", screenCode: "SO_ShiftStart" },
  { id: "vehicleAssign", label: "派車", screenCode: "SO_VehicleAssign" },
  { id: "pretrip", label: "行前", screenCode: "SO_Pretrip" },
  { id: "active", label: "監看", screenCode: "SO_ActiveTrip" },
  { id: "takeover", label: "接管", screenCode: "SO_TakeoverReport" },
  { id: "incident", label: "證據", screenCode: "SO_IncidentUpload" },
  { id: "closeout", label: "結案", screenCode: "SO_TripCloseout" },
  { id: "handover", label: "交班", screenCode: "SO_ShiftHandover" },
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
      return "事故證據";
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
    case "shift_handover":
      return describeSafetyOperatorQueuedShiftHandover(entry.payload);
    default:
      return {
        summary: "待同步項目",
        detail: "等待處理。",
      };
  }
}

function resolveSyncChannelState(
  provisioned: boolean,
  browserOnline: boolean | null,
  queueSnapshot: SafetyOperatorQueueSnapshot,
): SyncChannelState {
  if (!provisioned || browserOnline === false) {
    return "offline";
  }
  if (queueSnapshot.failedCount > 0) {
    return "failed";
  }
  if (queueSnapshot.syncingCount > 0) {
    return "syncing";
  }
  if (queueSnapshot.queuedCount > 0) {
    return "queued";
  }
  return "synced";
}

function Panel({
  eyebrow,
  title,
  caption,
  children,
}: {
  eyebrow?: string;
  title: string;
  caption?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.panel}>
      {eyebrow ? <Text style={styles.panelEyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.panelTitle}>{title}</Text>
      {caption ? <Text style={styles.panelCaption}>{caption}</Text> : null}
      <View style={styles.panelBody}>{children}</View>
    </View>
  );
}

function InlineMetric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "danger" | "success" | "warn";
}) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text
        style={[
          styles.metricValue,
          tone === "danger"
            ? styles.metricValueDanger
            : tone === "success"
              ? styles.metricValueSuccess
              : tone === "warn"
                ? styles.metricValueWarn
                : null,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function DetailRow({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, danger ? styles.detailDanger : null]}>
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

function SOFrame({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.screen}>
      <View style={styles.frameGlowTop} />
      <View style={styles.frameGlowBottom} />
      <View style={styles.frameHeader}>
        <Text style={styles.frameEyebrow}>安全員模式 · Safety Operator</Text>
        <Text style={styles.frameTitle}>{title}</Text>
        <Text style={styles.frameSubtitle}>{subtitle}</Text>
      </View>
      {children}
    </View>
  );
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
      style={styles.modeBar}
      contentContainerStyle={styles.modeBarContent}
    >
      {VIEW_TABS.map((tab) => {
        const active = tab.id === activeView;
        return (
          <Pressable
            key={tab.id}
            accessibilityRole="button"
            onPress={() => onChangeView(tab.id)}
            style={[styles.modeChip, active ? styles.modeChipActive : null]}
          >
            <Text
              style={[styles.modeChipLabel, active ? styles.modeChipLabelActive : null]}
            >
              {tab.label}
            </Text>
            <Text
              style={[styles.modeChipCode, active ? styles.modeChipCodeActive : null]}
            >
              {tab.screenCode}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function SOSyncStrip({
  syncState,
  queueSnapshot,
  onRetryOutstanding,
}: {
  syncState: SyncChannelState;
  queueSnapshot: SafetyOperatorQueueSnapshot;
  onRetryOutstanding: () => void;
}) {
  const retryableCount = queueSnapshot.items.filter(isRetryableQueueEntry).length;
  const stripCopy =
    syncState === "offline"
      ? {
          title: "離線 replay 模式",
          body: `queue ${queueSnapshot.items.length} · 所有寫入先留在本機 durable queue`,
          tone: styles.syncStripOffline,
        }
      : syncState === "failed"
        ? {
            title: `${queueSnapshot.failedCount} 筆同步失敗`,
            body: `最近成功 ${formatAt(queueSnapshot.lastSyncedAt)} · 可重試失敗項目`,
            tone: styles.syncStripFailed,
          }
        : syncState === "syncing"
          ? {
              title: `${queueSnapshot.syncingCount} 筆同步中`,
              body: `待同步 ${queueSnapshot.queuedCount} · 最近成功 ${formatAt(
                queueSnapshot.lastSyncedAt,
              )}`,
              tone: styles.syncStripSyncing,
            }
          : syncState === "queued"
            ? {
                title: `${queueSnapshot.queuedCount} 筆待同步`,
                body: `最近成功 ${formatAt(queueSnapshot.lastSyncedAt)} · 尚未送達伺服器`,
                tone: styles.syncStripQueued,
              }
            : {
                title: "Safety Operator 已同步",
                body: `queue ${queueSnapshot.items.length} · 最近成功 ${formatAt(
                  queueSnapshot.lastSyncedAt,
                )}`,
                tone: styles.syncStripSynced,
              };

  return (
    <View style={[styles.syncStrip, stripCopy.tone]}>
      <View style={styles.syncStripLeading}>
        <View style={styles.syncStripDot} />
        <View style={styles.syncStripCopy}>
          <Text style={styles.syncStripTitle}>{stripCopy.title}</Text>
          <Text style={styles.syncStripBody}>{stripCopy.body}</Text>
        </View>
      </View>
      <PrimaryButton
        compact
        disabled={retryableCount === 0}
        label="重試同步"
        variant="secondary"
        onPress={onRetryOutstanding}
      />
    </View>
  );
}

function ScreenLead({
  code,
  title,
  body,
  aside,
}: {
  code: string;
  title: string;
  body: string;
  aside?: ReactNode;
}) {
  return (
    <View style={styles.screenLead}>
      <View style={styles.screenLeadCopy}>
        <Text style={styles.screenLeadCode}>{code}</Text>
        <Text style={styles.screenLeadTitle}>{title}</Text>
        <Text style={styles.screenLeadBody}>{body}</Text>
      </View>
      {aside ? <View style={styles.screenLeadAside}>{aside}</View> : null}
    </View>
  );
}

function QueueLedger({
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
    <Panel
      eyebrow="離線佇列"
      title="SOSyncStrip ledger"
      caption="Safety Operator writes stay local-first until a sync receipt lands."
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
        <Text style={styles.emptyBody}>
          目前沒有 Safety Operator queue 項目。下一次離線提交、同步失敗或重放都會在這裡保留明細。
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
              {entry.duplicateAccepted ? (
                <Text style={styles.queueReceiptText}>
                  duplicate replay 已合併到既有 receipt
                </Text>
              ) : entry.receipt ? (
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
    </Panel>
  );
}

export default function SafetyOperatorScreen() {
  const router = useRouter();
  const isProvisioned = isDriverIdentityProvisioned();

  const [activeView, setActiveView] =
    useState<SafetyOperatorView>("shiftStart");
  const [queueSnapshot, setQueueSnapshot] =
    useState<SafetyOperatorQueueSnapshot>(INITIAL_QUEUE_SNAPSHOT);
  const [browserOnline, setBrowserOnline] = useState<boolean | null>(() => {
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.onLine === "boolean"
    ) {
      return navigator.onLine;
    }

    return null;
  });
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

  const syncChannelState = useMemo(
    () =>
      resolveSyncChannelState(isProvisioned, browserOnline, queueSnapshot),
    [browserOnline, isProvisioned, queueSnapshot],
  );

  useEffect(() => {
    void refreshQueueSnapshot();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleOnline = () => setBrowserOnline(true);
    const handleOffline = () => setBrowserOnline(false);

    setBrowserOnline(typeof navigator.onLine === "boolean" ? navigator.onLine : null);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
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
        await syncShiftHandover(entry.clientGeneratedId, queuedHandover);
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
    const baseCommand = buildShiftHandoverCommand({
      notes: handoverNotes.trim(),
    });
    const takeoverLinkage = selectSafetyOperatorHandoverTakeoverLinkage(
      liveQueueSnapshot.items,
      recentTakeover?.report.reportId,
      baseCommand,
    );
    const command = {
      ...baseCommand,
      takeoverReportIds: takeoverLinkage.takeoverReportIds,
    };
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
    <SOFrame
      title="Safety Operator Realm"
      subtitle="與一般 driver mode 分離，只保留資格、班次、接管、證據與交班流程。"
    >
      <View style={styles.topRail}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Text style={styles.backButtonText}>返回 Driver</Text>
        </Pressable>
        <View style={styles.realmPill}>
          <Text style={styles.realmPillText}>FSD 沙盒</Text>
        </View>
      </View>

      <View style={styles.heroCard}>
        <View style={styles.heroCopy}>
          <Text style={styles.heroEyebrow}>SOFrame</Text>
          <Text style={styles.heroTitle}>
            {SAFETY_OPERATOR_FIXTURE.operatorName} · {SAFETY_OPERATOR_FIXTURE.vehicleId}
          </Text>
          <Text style={styles.heroBody}>
            current shift {SAFETY_OPERATOR_FIXTURE.shiftId} · assignment{" "}
            {SAFETY_OPERATOR_FIXTURE.assignmentId}
          </Text>
        </View>
        <View style={styles.heroStats}>
          <InlineMetric label="待同步" value={`${queueSnapshot.queuedCount}`} />
          <InlineMetric
            label="同步失敗"
            value={`${queueSnapshot.failedCount}`}
            tone={queueSnapshot.failedCount > 0 ? "danger" : "success"}
          />
        </View>
      </View>

      <SOSyncStrip
        syncState={syncChannelState}
        queueSnapshot={queueSnapshot}
        onRetryOutstanding={() => void retryOutstandingQueueEntries()}
      />

      <SOModeBar activeView={activeView} onChangeView={setActiveView} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {!isProvisioned ? (
          <View style={styles.noticeBanner}>
            <Text style={styles.noticeTitle}>裝置尚未完成正式綁定</Text>
            <Text style={styles.noticeBody}>
              目前以本機 durable queue 進行離線 replay；一般 driver 狀態與 Safety Operator 狀態不會混用。
            </Text>
          </View>
        ) : null}

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
            <ScreenLead
              code="SO_Provisioning"
              title="資格與沙盒上下文"
              body="安全員資格、裝置綁定與 assignment ownership 在這裡先確認，未通過不得進入 active trip。"
              aside={
                <InlineMetric
                  label="資格狀態"
                  value={SAFETY_OPERATOR_FIXTURE.qualified ? "qualified" : "blocked"}
                  tone={SAFETY_OPERATOR_FIXTURE.qualified ? "success" : "danger"}
                />
              }
            />
            <Panel title="身份與授權" eyebrow="資格">
              <DetailRow label="安全員" value={SAFETY_OPERATOR_FIXTURE.operatorName} />
              <DetailRow
                label="safetyOperatorId"
                value={SAFETY_OPERATOR_FIXTURE.safetyOperatorId}
              />
              <DetailRow label="sandboxProgramId" value={SAFETY_OPERATOR_FIXTURE.sandboxProgramId} />
              <DetailRow label="deviceId" value={SAFETY_OPERATOR_FIXTURE.deviceId} />
              <DetailRow
                label="activeAssignmentId"
                value={SAFETY_OPERATOR_FIXTURE.activeAssignmentId}
              />
            </Panel>
            <Panel
              title="資格對應"
              eyebrow="matchedQualificationIds"
              caption="這裡只揭露 qualification / assignment context，不包含任何車控或 FSD 控制項。"
            >
              <DetailRow
                label="matchedQualificationIds"
                value={SAFETY_OPERATOR_FIXTURE.matchedQualificationIds.join(", ")}
              />
              {SAFETY_OPERATOR_FIXTURE.qualificationReasons.map((reason) => (
                <Text key={reason} style={styles.supportText}>
                  {reason}
                </Text>
              ))}
            </Panel>
          </>
        ) : null}

        {activeView === "shiftStart" ? (
          <>
            <ScreenLead
              code="SO_ShiftStart"
              title="開班只進入 Safety Operator realm"
              body="班次啟動後，不回落到一般 driver cockpit；班次、assignment 與 queue 都是獨立保存。"
              aside={
                <InlineMetric
                  label="shiftStartedAt"
                  value={formatAt(SAFETY_OPERATOR_FIXTURE.shiftStartedAt)}
                />
              }
            />
            <Panel title="班次上下文" eyebrow="Shift">
              <DetailRow label="shiftId" value={SAFETY_OPERATOR_FIXTURE.shiftId} />
              <DetailRow
                label="activeAssignmentId"
                value={SAFETY_OPERATOR_FIXTURE.activeAssignmentId}
              />
              <DetailRow
                label="experimentWindow"
                value={SAFETY_OPERATOR_FIXTURE.experimentWindow}
              />
              <DetailRow
                label="coverageZone"
                value={SAFETY_OPERATOR_FIXTURE.coverageZone}
              />
            </Panel>
          </>
        ) : null}

        {activeView === "vehicleAssign" ? (
          <>
            <ScreenLead
              code="SO_VehicleAssign"
              title="裝置、車輛、order context"
              body="派車只揭露 assignment / vehicle 綁定，後續接管、證據與 closeout 都沿用這組上下文。"
              aside={<InlineMetric label="vehicleId" value={SAFETY_OPERATOR_FIXTURE.vehicleId} />}
            />
            <Panel title="車輛與任務綁定" eyebrow="Vehicle">
              <DetailRow label="deviceId" value={SAFETY_OPERATOR_FIXTURE.deviceId} />
              <DetailRow label="vehicleId" value={SAFETY_OPERATOR_FIXTURE.vehicleId} />
              <DetailRow label="assignmentId" value={SAFETY_OPERATOR_FIXTURE.assignmentId} />
              <DetailRow label="orderId" value={SAFETY_OPERATOR_FIXTURE.orderId} />
              <DetailRow
                label="vehicleAssignedAt"
                value={formatAt(SAFETY_OPERATOR_FIXTURE.vehicleAssignedAt)}
              />
            </Panel>
          </>
        ) : null}

        {activeView === "pretrip" ? (
          <>
            <ScreenLead
              code="SO_Pretrip"
              title="行前檢查與 blocker codes"
              body="提交時會一起帶入 checklist、blockerCodes、notes 與 completedAt，失敗時保留在 durable queue。"
              aside={
                <InlineMetric
                  label="blocker"
                  value={`${checklistBlockedCount}`}
                  tone={checklistBlockedCount > 0 ? "warn" : "success"}
                />
              }
            />
            <Panel title="Checklist" eyebrow="Pretrip">
              {SAFETY_OPERATOR_CHECKLIST_TEMPLATE.map((item) => (
                <View key={item.itemKey} style={styles.checklistRow}>
                  <View style={styles.checklistCopy}>
                    <Text style={styles.checklistItem}>{item.itemKey}</Text>
                    {item.note ? (
                      <Text style={styles.checklistNote}>{item.note}</Text>
                    ) : null}
                  </View>
                  <View
                    style={[
                      styles.checklistBadge,
                      item.status === "pass"
                        ? styles.checklistBadgePass
                        : item.status === "na"
                          ? styles.checklistBadgeNa
                          : styles.checklistBadgeFail,
                    ]}
                  >
                    <Text style={styles.checklistBadgeText}>{item.status}</Text>
                  </View>
                </View>
              ))}
              <View style={styles.buttonRow}>
                <PrimaryButton
                  label="送出行前檢查"
                  onPress={() => void submitPreTripChecklist()}
                />
              </View>
            </Panel>
          </>
        ) : null}

        {activeView === "active" ? (
          <>
            <ScreenLead
              code="SO_ActiveTrip"
              title="主監看面只做情境、queue 與接管入口"
              body="active trip 提供 shift / assignment / vehicle / order context、最近同步結果與 unsynced breakdown，不提供任何 Tesla/FSD control UI。"
              aside={
                <InlineMetric
                  label="最近同步"
                  value={formatAt(queueSnapshot.lastSyncedAt)}
                />
              }
            />
            <Panel title="Active trip context" eyebrow="Live">
              <DetailRow label="shiftId" value={SAFETY_OPERATOR_FIXTURE.shiftId} />
              <DetailRow label="assignmentId" value={SAFETY_OPERATOR_FIXTURE.assignmentId} />
              <DetailRow label="vehicleId" value={SAFETY_OPERATOR_FIXTURE.vehicleId} />
              <DetailRow label="orderId" value={SAFETY_OPERATOR_FIXTURE.orderId} />
              <DetailRow label="Telemetry 鮮度" value="2 秒" />
              <DetailRow label="監理事件鮮度" value="48 秒" danger />
            </Panel>
            <Panel title="未同步摘要" eyebrow="Unsynced">
              <View style={styles.metricGrid}>
                <InlineMetric label="pretrip" value={`${unsyncedBreakdown.pretrip}`} />
                <InlineMetric label="takeover" value={`${unsyncedBreakdown.takeover}`} />
                <InlineMetric label="incident" value={`${unsyncedBreakdown.incident}`} />
                <InlineMetric label="handover" value={`${unsyncedBreakdown.handover}`} />
              </View>
              <Text style={styles.supportText}>
                此 realm 僅顯示 assignment、trip、takeover、incident、closeout、handover 上下文；不顯示遠端控制、resume FSD 或任何內部車控。
              </Text>
            </Panel>
          </>
        ) : null}

        {activeView === "takeover" ? (
          <>
            <ScreenLead
              code="SO_TakeoverReport"
              title="可編輯 occurredAt，但 audit 先留本機"
              body="送出前可反覆修正 takeover time；原始系統時間、修正歷程與 clientGeneratedReportId 都會保留在本地 queue，直到第一次 acceptance。"
              aside={
                <InlineMetric
                  label="修正次數"
                  value={`${takeoverDraftAudit.corrections.length}`}
                />
              }
            />
            <Panel title="接管草稿" eyebrow="Takeover">
              <DetailRow
                label="原始系統時間"
                value={formatAt(takeoverDraftAudit.originalSystemOccurredAt)}
              />
              <DetailRow
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
                submit 後伺服器只保存送出的 `occurredAt` 與 `serverReceivedAt`；本輪沒有 post-submit patch。
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
            </Panel>
            <Panel title="時間修正 audit" eyebrow="Audit trail">
              {takeoverDraftAudit.corrections.length === 0 ? (
                <Text style={styles.emptyBody}>
                  目前尚未記錄時間修正；原始系統時間會在首次送出前持續保留於本地 draft。
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
            </Panel>
            <Panel title="最近 receipt" eyebrow="Idempotency">
              <DetailRow
                label="clientGeneratedReportId"
                value={recentTakeover?.receipt.clientGeneratedReportId ?? "尚未提交"}
              />
              <DetailRow
                label="submitted occurredAt"
                value={formatAt(submittedTakeoverAudit?.correctedOccurredAt ?? null)}
              />
              <DetailRow
                label="serverReceivedAt"
                value={formatAt(recentTakeover?.receipt.serverReceivedAt ?? null)}
              />
              <DetailRow
                label="duplicate replay"
                value={recentTakeover?.receipt.duplicate ? "yes" : "no"}
                danger={Boolean(recentTakeover?.receipt.duplicate)}
              />
            </Panel>
          </>
        ) : null}

        {activeView === "incident" ? (
          <>
            <ScreenLead
              code="SO_IncidentUpload"
              title="事故與證據只做 linkage，不做車控"
              body="incident、bookmark、evidence metadata 可先排入本地 queue；同步服務未接線時，狀態會如實停留在 pending / failed。"
              aside={
                <InlineMetric
                  label="evidence"
                  value={`${SAFETY_OPERATOR_FIXTURE.evidenceArtifactIds.length}`}
                />
              }
            />
            <Panel title="Incident linkage" eyebrow="Evidence">
              <DetailRow label="incidentId" value={SAFETY_OPERATOR_FIXTURE.incidentId} />
              <DetailRow label="bookmarkId" value={SAFETY_OPERATOR_FIXTURE.bookmarkId} />
              <DetailRow
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
            </Panel>
          </>
        ) : null}

        {activeView === "closeout" ? (
          <>
            <ScreenLead
              code="SO_TripCloseout"
              title="單趟 closeout context"
              body="這一段只收斂 trip closeout 所需 incident、takeover 與 end location 上下文；正式 shift handover 仍在下一段單獨送出。"
              aside={<InlineMetric label="closeoutStatus" value="handoff" />}
            />
            <Panel title="Trip closeout" eyebrow="Closeout">
              <DetailRow label="closeoutStatus" value="handoff" />
              <DetailRow
                label="closeoutAt"
                value={formatAt(SAFETY_OPERATOR_FIXTURE.closeoutEndedAt)}
              />
              <DetailRow
                label="endLocation"
                value={SAFETY_OPERATOR_FIXTURE.endLocationLabel}
              />
              <DetailRow label="incident linkage" value={SAFETY_OPERATOR_FIXTURE.incidentId} />
              <DetailRow
                label="takeover accepted"
                value={recentTakeover?.report.reportId ? "1" : "0"}
              />
            </Panel>
          </>
        ) : null}

        {activeView === "handover" ? (
          <>
            <ScreenLead
              code="SO_ShiftHandover"
              title="交班收尾與 takeover linkage"
              body="handover 會解析目前 queue 中的 pending takeover，等待 reportId 可用後才真正完成 closeout / handover 同步。"
              aside={
                <InlineMetric
                  label="handover queue"
                  value={`${unsyncedBreakdown.handover}`}
                />
              }
            />
            <Panel title="交班送出" eyebrow="Handover">
              <DetailRow label="activeAssignmentId" value={SAFETY_OPERATOR_FIXTURE.activeAssignmentId} />
              <DetailRow label="incident linkage" value={SAFETY_OPERATOR_FIXTURE.incidentId} />
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
            </Panel>
          </>
        ) : null}

        <QueueLedger
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
  frameGlowTop: {
    position: "absolute",
    top: -120,
    right: -40,
    width: 260,
    height: 260,
    borderRadius: 999,
    backgroundColor: SAFETY_ACCENT.bg,
    opacity: 0.35,
  },
  frameGlowBottom: {
    position: "absolute",
    bottom: 90,
    left: -80,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: SAFETY_REALM.border,
    opacity: 0.12,
  },
  frameHeader: {
    paddingHorizontal: 18,
    paddingTop: 18,
    gap: 4,
  },
  frameEyebrow: {
    color: SAFETY_REALM.fg,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  frameTitle: {
    color: THEME.colors.textStrong,
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  frameSubtitle: {
    color: THEME.colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  topRail: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 14,
  },
  backButton: {
    borderColor: SAFETY_ACCENT.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: THEME.colors.surface,
  },
  backButtonText: {
    color: THEME.colors.textStrong,
    fontSize: 13,
    fontWeight: "700",
  },
  realmPill: {
    backgroundColor: SAFETY_ACCENT.bg,
    borderColor: SAFETY_ACCENT.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  realmPillText: {
    color: SAFETY_ACCENT.fg,
    fontSize: 12,
    fontWeight: "700",
  },
  heroCard: {
    marginHorizontal: 18,
    marginTop: 14,
    padding: 18,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: SAFETY_ACCENT.border,
    backgroundColor: THEME.colors.surface,
    gap: 16,
  },
  heroCopy: {
    gap: 3,
  },
  heroEyebrow: {
    color: THEME.colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  heroTitle: {
    color: THEME.colors.textStrong,
    fontSize: 21,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  heroBody: {
    color: THEME.colors.textMuted,
    fontSize: 13,
  },
  heroStats: {
    flexDirection: "row",
    gap: 10,
  },
  syncStrip: {
    marginHorizontal: 18,
    marginTop: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
  },
  syncStripOffline: {
    backgroundColor: THEME.colors.warningBg,
    borderColor: THEME.colors.warning,
  },
  syncStripQueued: {
    backgroundColor: SAFETY_ACCENT.bg,
    borderColor: SAFETY_ACCENT.border,
  },
  syncStripSyncing: {
    backgroundColor: THEME.colors.infoBg,
    borderColor: THEME.colors.info,
  },
  syncStripFailed: {
    backgroundColor: THEME.colors.dangerBg,
    borderColor: THEME.colors.danger,
  },
  syncStripSynced: {
    backgroundColor: THEME.colors.successBg,
    borderColor: THEME.colors.success,
  },
  syncStripLeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  syncStripDot: {
    width: 11,
    height: 11,
    borderRadius: 999,
    backgroundColor: THEME.colors.textStrong,
  },
  syncStripCopy: {
    flex: 1,
    gap: 3,
  },
  syncStripTitle: {
    color: THEME.colors.textStrong,
    fontSize: 14,
    fontWeight: "800",
  },
  syncStripBody: {
    color: THEME.colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  modeBar: {
    marginTop: 12,
    maxHeight: 74,
  },
  modeBarContent: {
    gap: 10,
    paddingHorizontal: 18,
    paddingBottom: 4,
  },
  modeChip: {
    minWidth: 104,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    backgroundColor: THEME.colors.surface,
    gap: 4,
  },
  modeChipActive: {
    backgroundColor: SAFETY_ACCENT.bg,
    borderColor: SAFETY_ACCENT.border,
  },
  modeChipLabel: {
    color: THEME.colors.textStrong,
    fontSize: 13,
    fontWeight: "700",
  },
  modeChipLabelActive: {
    color: SAFETY_ACCENT.fg,
  },
  modeChipCode: {
    color: THEME.colors.textDim,
    fontSize: 10,
    fontWeight: "600",
  },
  modeChipCodeActive: {
    color: SAFETY_ACCENT.fg,
  },
  content: {
    padding: 18,
    paddingTop: 14,
    paddingBottom: 32,
    gap: 14,
  },
  noticeBanner: {
    backgroundColor: THEME.colors.warningBg,
    borderColor: THEME.colors.warning,
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
  },
  noticeTitle: {
    color: THEME.colors.textStrong,
    fontSize: 14,
    fontWeight: "800",
  },
  noticeBody: {
    color: THEME.colors.text,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  errorBanner: {
    backgroundColor: THEME.colors.dangerBg,
    borderColor: THEME.colors.danger,
    borderRadius: 18,
    borderWidth: 1,
    padding: 13,
  },
  errorBannerText: {
    color: THEME.colors.danger,
    fontSize: 13,
    lineHeight: 19,
  },
  infoBanner: {
    backgroundColor: THEME.colors.infoBg,
    borderColor: THEME.colors.info,
    borderRadius: 18,
    borderWidth: 1,
    padding: 13,
  },
  infoBannerText: {
    color: THEME.colors.textStrong,
    fontSize: 13,
    lineHeight: 19,
  },
  screenLead: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  screenLeadCopy: {
    flex: 1,
    gap: 4,
  },
  screenLeadAside: {
    width: 120,
  },
  screenLeadCode: {
    color: THEME.colors.textDim,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  screenLeadTitle: {
    color: THEME.colors.textStrong,
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  screenLeadBody: {
    color: THEME.colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  panel: {
    backgroundColor: THEME.colors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    padding: 16,
    gap: 6,
  },
  panelEyebrow: {
    color: SAFETY_REALM.fg,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  panelTitle: {
    color: THEME.colors.textStrong,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  panelCaption: {
    color: THEME.colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  panelBody: {
    gap: 10,
    marginTop: 4,
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  metricCard: {
    flex: 1,
    minWidth: 94,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    backgroundColor: THEME.colors.surfaceLo,
    padding: 12,
    gap: 6,
  },
  metricLabel: {
    color: THEME.colors.textMuted,
    fontSize: 11,
    fontWeight: "600",
  },
  metricValue: {
    color: THEME.colors.textStrong,
    fontSize: 17,
    fontWeight: "800",
  },
  metricValueDanger: {
    color: THEME.colors.danger,
  },
  metricValueSuccess: {
    color: THEME.colors.success,
  },
  metricValueWarn: {
    color: THEME.colors.warning,
  },
  detailRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.border,
  },
  detailLabel: {
    flex: 1,
    color: THEME.colors.textMuted,
    fontSize: 12,
  },
  detailValue: {
    flex: 1,
    color: THEME.colors.textStrong,
    fontSize: 13,
    fontWeight: "700",
    textAlign: "right",
  },
  detailDanger: {
    color: THEME.colors.danger,
  },
  supportText: {
    color: THEME.colors.text,
    fontSize: 13,
    lineHeight: 19,
  },
  emptyBody: {
    color: THEME.colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  checklistRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.border,
  },
  checklistCopy: {
    flex: 1,
    gap: 3,
  },
  checklistItem: {
    color: THEME.colors.textStrong,
    fontSize: 13,
    fontWeight: "700",
  },
  checklistNote: {
    color: THEME.colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  checklistBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
  },
  checklistBadgePass: {
    backgroundColor: THEME.colors.successBg,
    borderColor: THEME.colors.success,
  },
  checklistBadgeFail: {
    backgroundColor: THEME.colors.dangerBg,
    borderColor: THEME.colors.danger,
  },
  checklistBadgeNa: {
    backgroundColor: THEME.colors.surfaceLo,
    borderColor: THEME.colors.border,
  },
  checklistBadgeText: {
    color: THEME.colors.textStrong,
    fontSize: 11,
    fontWeight: "700",
  },
  fieldLabel: {
    color: THEME.colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  fieldHint: {
    color: THEME.colors.textDim,
    fontSize: 11,
    lineHeight: 16,
    marginTop: -3,
  },
  input: {
    backgroundColor: THEME.colors.surfaceLo,
    borderColor: THEME.colors.border,
    borderRadius: 14,
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
    marginTop: 2,
  },
  button: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 46,
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
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
    fontWeight: "800",
  },
  buttonSecondaryText: {
    color: THEME.colors.textStrong,
  },
  auditCard: {
    backgroundColor: THEME.colors.surfaceLo,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    padding: 12,
    gap: 4,
  },
  auditTitle: {
    color: THEME.colors.textStrong,
    fontSize: 13,
    fontWeight: "800",
  },
  auditBody: {
    color: THEME.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  tagWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tag: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    backgroundColor: THEME.colors.surfaceLo,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tagText: {
    color: THEME.colors.textStrong,
    fontSize: 12,
    fontWeight: "700",
  },
  queueToolbar: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  queueCard: {
    backgroundColor: THEME.colors.surfaceLo,
    borderColor: THEME.colors.border,
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
  },
  queueCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  queueCardTitleBlock: {
    flex: 1,
    gap: 4,
  },
  queueCardTitle: {
    color: THEME.colors.textStrong,
    fontSize: 14,
    fontWeight: "800",
  },
  queueCardMeta: {
    color: THEME.colors.textDim,
    fontSize: 11,
  },
  queueCardSummary: {
    color: THEME.colors.textStrong,
    fontSize: 13,
    fontWeight: "700",
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
    fontWeight: "800",
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
