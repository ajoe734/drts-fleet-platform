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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type {
  SubmitSafetyOperatorPreTripChecklistCommand,
  SubmitSafetyOperatorTakeoverReportResult,
} from "@drts/contracts";

import { driverTheme } from "@/lib/theme";
import { KeyboardAvoidingContainer } from "@/components/ui/KeyboardAvoidingContainer";
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
  formatDriverError,
  getDriverClient,
  isDriverIdentityProvisioned,
  recoverDriverSessionFromApiError,
  registerProtectedCacheClearHandler,
} from "@/lib/api-client";
import { resetDriverAppToOnboarding } from "@/lib/driver-identity-routing";

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
  stageLabel: string;
}> = [
  { id: "provisioning", label: "資格", stageLabel: "資格與沙盒確認" },
  { id: "shiftStart", label: "開班", stageLabel: "開班準備" },
  { id: "vehicleAssign", label: "派車", stageLabel: "派車與裝置綁定" },
  { id: "pretrip", label: "行前", stageLabel: "行前檢查" },
  { id: "active", label: "監看", stageLabel: "行程監看" },
  { id: "takeover", label: "接管", stageLabel: "接管回報" },
  { id: "incident", label: "證據", stageLabel: "事故證據" },
  { id: "closeout", label: "結案", stageLabel: "行程結案" },
  { id: "handover", label: "交班", stageLabel: "交班" },
];

const SAFETY_OPERATOR_FIELD_LABELS: Record<string, string> = {
  safetyOperatorId: "安全員編號",
  sandboxProgramId: "沙盒計畫代號",
  deviceId: "裝置識別碼",
  activeAssignmentId: "目前任務代號",
  matchedQualificationIds: "符合的資格項目",
  shiftId: "班次代號",
  experimentWindow: "開放時段",
  coverageZone: "服務區域",
  vehicleId: "車輛代號",
  assignmentId: "任務代號",
  orderId: "訂單代號",
  vehicleAssignedAt: "派車時間",
  clientGeneratedReportId: "回報編號",
  serverReceivedAt: "伺服器接收時間",
  incidentId: "事故代號",
  bookmarkId: "標記代號",
  evidenceArtifactIds: "證據檔案代號",
  closeoutStatus: "結案狀態",
  closeoutAt: "結案時間",
  endLocation: "結束地點",
  shiftStartedAt: "開班時間",
};

function formatSafetyOperatorFieldLabel(key: string): string {
  return SAFETY_OPERATOR_FIELD_LABELS[key] ?? key.replace(/[_-]+/g, " ");
}

const CHECKLIST_ITEM_LABELS: Record<string, string> = {
  vehicle_exterior: "車輛外觀",
  cab_cleanliness: "車廂清潔",
  seatbelts: "安全帶",
  brakes: "煞車",
  lights: "燈光",
  tires: "輪胎",
  mirrors: "後視鏡",
  recorder_health: "行車記錄器",
  autonomy_stack: "自動駕駛系統",
  fallback_comms: "備援通訊設備",
};

function formatChecklistItemLabel(itemKey: string): string {
  return CHECKLIST_ITEM_LABELS[itemKey] ?? itemKey.replace(/_/g, " ");
}

const CHECKLIST_STATUS_LABELS: Record<string, string> = {
  pass: "通過",
  fail: "未通過",
  na: "不適用",
};

function formatChecklistStatusLabel(status: string): string {
  return CHECKLIST_STATUS_LABELS[status] ?? "待確認";
}

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
  return formatDriverError(error, fallback);
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
      return "其他項目";
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
      return "狀態未知";
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
        summary: `${payload.items?.length ?? 0} 項檢查 · 待處理 ${
          payload.blockerCodes?.length ?? 0
        } 項`,
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
          payload.incidentId ?? "尚未綁定事故"
        }`,
        detail: payload.bookmarkId
          ? `標記代號 ${payload.bookmarkId}`
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
      <Text
        style={[styles.detailValue, danger ? styles.detailDanger : null]}
        selectable
      >
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
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.screen,
        {
          paddingTop: Math.max(insets?.top ?? 0, 16),
          paddingBottom: Math.max(insets?.bottom ?? 0, 16),
        },
      ]}
    >
      <View style={styles.frameGlowTop} pointerEvents="none" />
      <View style={styles.frameGlowBottom} pointerEvents="none" />
      <View style={styles.frameHeader}>
        <Text style={styles.frameEyebrow}>安全員模式</Text>
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
              {tab.stageLabel}
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
          title: "離線暫存模式",
          body: `共 ${queueSnapshot.items.length} 筆 · 所有送出的資料會先保存在本機`,
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
                title: "已完成同步",
                body: `共 ${queueSnapshot.items.length} 筆 · 最近成功 ${formatAt(
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
      title="同步紀錄清單"
      caption="所有送出的資料都會先保存在本機，收到伺服器確認後才視為完成同步。"
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
          目前沒有待同步項目。下一次離線提交、同步失敗或重新送出都會在這裡保留明細。
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
                  重複送出的紀錄已與先前的結果合併
                </Text>
              ) : entry.receipt ? (
                <Text style={styles.queueReceiptText}>已收到伺服器確認並寫回本機記錄</Text>
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
    const unregister = registerProtectedCacheClearHandler(() => {
      setScreenError(null);
      void refreshQueueSnapshot();
    });
    return () => unregister();
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
          ? "伺服器已接受同一份接管回報；本機佇列已與既有結果合併。"
          : "接管回報已送出並取得伺服器確認。",
      );
    } catch (error) {
      if (await recoverDriverSessionFromApiError(error)) {
        resetDriverAppToOnboarding(router);
        return;
      }
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
      if (await recoverDriverSessionFromApiError(error)) {
        resetDriverAppToOnboarding(router);
        return;
      }
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
      if (await recoverDriverSessionFromApiError(error)) {
        resetDriverAppToOnboarding(router);
        return;
      }
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
          "證據同步服務尚未接線；這筆項目會繼續保留在安全員本機佇列。",
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
      "接管回報已存入本機待同步清單，保留原始系統時間與修正紀錄，正在嘗試同步。",
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
    setSubmissionState("行前檢查已存入本機待同步清單。");
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
      "事故 / 證據資料已暫存到本機待同步清單；待證據同步服務接線後可重新送出。",
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
    setSubmissionState("交班紀錄已存入本機待同步清單。");
    await refreshQueueSnapshot();
    await syncShiftHandover(queued.clientGeneratedId, queuedHandover);
  }

  async function clearSyncedQueueItems() {
    await clearSafetyOperatorSyncedQueueEntries();
    await refreshQueueSnapshot();
  }

  return (
    <SOFrame
      title="安全員專屬模式"
      subtitle="與一般駕駛模式分離，只保留資格、班次、接管、證據與交班流程。"
    >
      <View style={styles.topRail}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Text style={styles.backButtonText}>返回駕駛模式</Text>
        </Pressable>
        <View style={styles.realmPill}>
          <Text style={styles.realmPillText}>FSD 沙盒</Text>
        </View>
      </View>

      <View style={styles.heroCard}>
        <View style={styles.heroCopy}>
          <Text style={styles.heroEyebrow}>值班摘要</Text>
          <Text style={styles.heroTitle}>
            {SAFETY_OPERATOR_FIXTURE.operatorName} · {SAFETY_OPERATOR_FIXTURE.vehicleId}
          </Text>
          <Text style={styles.heroBody}>
            目前班次 {SAFETY_OPERATOR_FIXTURE.shiftId} · 任務代號{" "}
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

      <KeyboardAvoidingContainer
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {!isProvisioned ? (
          <View style={styles.noticeBanner}>
            <Text style={styles.noticeTitle}>裝置尚未完成正式綁定</Text>
            <Text style={styles.noticeBody}>
              目前以本機暫存進行離線重新送出；一般駕駛狀態與安全員狀態不會混用。
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
              code="資格與沙盒確認"
              title="資格與沙盒上下文"
              body="安全員資格、裝置綁定與任務歸屬會在這裡先確認，未通過檢查不得進入執行中的行程。"
              aside={
                <InlineMetric
                  label="資格狀態"
                  value={SAFETY_OPERATOR_FIXTURE.qualified ? "符合資格" : "未通過"}
                  tone={SAFETY_OPERATOR_FIXTURE.qualified ? "success" : "danger"}
                />
              }
            />
            <Panel title="身份與授權" eyebrow="資格">
              <DetailRow label="安全員" value={SAFETY_OPERATOR_FIXTURE.operatorName} />
              <DetailRow
                label={formatSafetyOperatorFieldLabel("safetyOperatorId")}
                value={SAFETY_OPERATOR_FIXTURE.safetyOperatorId}
              />
              <DetailRow label={formatSafetyOperatorFieldLabel("sandboxProgramId")} value={SAFETY_OPERATOR_FIXTURE.sandboxProgramId} />
              <DetailRow label={formatSafetyOperatorFieldLabel("deviceId")} value={SAFETY_OPERATOR_FIXTURE.deviceId} />
              <DetailRow
                label={formatSafetyOperatorFieldLabel("activeAssignmentId")}
                value={SAFETY_OPERATOR_FIXTURE.activeAssignmentId}
              />
            </Panel>
            <Panel
              title="資格對應"
              eyebrow="符合的資格項目"
              caption="這裡只顯示資格與任務對應資訊，不包含任何車輛控制或 FSD 控制項。"
            >
              <DetailRow
                label={formatSafetyOperatorFieldLabel("matchedQualificationIds")}
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
              code="開班準備"
              title="開班後只會進入安全員模式"
              body="班次啟動後，不會退回一般駕駛工作台；班次、任務與待同步佇列都會獨立保存。"
              aside={
                <InlineMetric
                  label={formatSafetyOperatorFieldLabel("shiftStartedAt")}
                  value={formatAt(SAFETY_OPERATOR_FIXTURE.shiftStartedAt)}
                />
              }
            />
            <Panel title="班次上下文" eyebrow="班次">
              <DetailRow label={formatSafetyOperatorFieldLabel("shiftId")} value={SAFETY_OPERATOR_FIXTURE.shiftId} />
              <DetailRow
                label={formatSafetyOperatorFieldLabel("activeAssignmentId")}
                value={SAFETY_OPERATOR_FIXTURE.activeAssignmentId}
              />
              <DetailRow
                label={formatSafetyOperatorFieldLabel("experimentWindow")}
                value={SAFETY_OPERATOR_FIXTURE.experimentWindow}
              />
              <DetailRow
                label={formatSafetyOperatorFieldLabel("coverageZone")}
                value={SAFETY_OPERATOR_FIXTURE.coverageZone}
              />
            </Panel>
          </>
        ) : null}

        {activeView === "vehicleAssign" ? (
          <>
            <ScreenLead
              code="派車與裝置綁定"
              title="裝置、車輛與訂單資訊"
              body="派車只會顯示任務與車輛的綁定資訊，後續的接管、證據與結案都會沿用這組資訊。"
              aside={<InlineMetric label={formatSafetyOperatorFieldLabel("vehicleId")} value={SAFETY_OPERATOR_FIXTURE.vehicleId} />}
            />
            <Panel title="車輛與任務綁定" eyebrow="車輛">
              <DetailRow label={formatSafetyOperatorFieldLabel("deviceId")} value={SAFETY_OPERATOR_FIXTURE.deviceId} />
              <DetailRow label={formatSafetyOperatorFieldLabel("vehicleId")} value={SAFETY_OPERATOR_FIXTURE.vehicleId} />
              <DetailRow label={formatSafetyOperatorFieldLabel("assignmentId")} value={SAFETY_OPERATOR_FIXTURE.assignmentId} />
              <DetailRow label={formatSafetyOperatorFieldLabel("orderId")} value={SAFETY_OPERATOR_FIXTURE.orderId} />
              <DetailRow
                label={formatSafetyOperatorFieldLabel("vehicleAssignedAt")}
                value={formatAt(SAFETY_OPERATOR_FIXTURE.vehicleAssignedAt)}
              />
            </Panel>
          </>
        ) : null}

        {activeView === "pretrip" ? (
          <>
            <ScreenLead
              code="行前檢查"
              title="行前檢查與待處理項目"
              body="提交時會一起送出檢查清單、待處理項目與備註，若送出失敗會保留在本機待同步清單中。"
              aside={
                <InlineMetric
                  label="待處理項目"
                  value={`${checklistBlockedCount}`}
                  tone={checklistBlockedCount > 0 ? "warn" : "success"}
                />
              }
            />
            <Panel title="檢查清單" eyebrow="行前">
              {SAFETY_OPERATOR_CHECKLIST_TEMPLATE.map((item) => (
                <View key={item.itemKey} style={styles.checklistRow}>
                  <View style={styles.checklistCopy}>
                    <Text style={styles.checklistItem}>{formatChecklistItemLabel(item.itemKey)}</Text>
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
                    <Text style={styles.checklistBadgeText}>{formatChecklistStatusLabel(item.status)}</Text>
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
              code="行程監看"
              title="監看畫面只呈現情境、待同步狀態與接管入口"
              body="執行中的行程會顯示班次、任務、車輛與訂單資訊、最近同步結果與未同步明細，不提供任何 Tesla FSD 控制項。"
              aside={
                <InlineMetric
                  label="最近同步"
                  value={formatAt(queueSnapshot.lastSyncedAt)}
                />
              }
            />
            <Panel title="目前行程資訊" eyebrow="即時">
              <DetailRow label={formatSafetyOperatorFieldLabel("shiftId")} value={SAFETY_OPERATOR_FIXTURE.shiftId} />
              <DetailRow label={formatSafetyOperatorFieldLabel("assignmentId")} value={SAFETY_OPERATOR_FIXTURE.assignmentId} />
              <DetailRow label={formatSafetyOperatorFieldLabel("vehicleId")} value={SAFETY_OPERATOR_FIXTURE.vehicleId} />
              <DetailRow label={formatSafetyOperatorFieldLabel("orderId")} value={SAFETY_OPERATOR_FIXTURE.orderId} />
              <DetailRow label="定位資料更新時間" value="2 秒" />
              <DetailRow label="監理事件鮮度" value="48 秒" danger />
            </Panel>
            <Panel title="未同步摘要" eyebrow="未同步">
              <View style={styles.metricGrid}>
                <InlineMetric label="行前檢查" value={`${unsyncedBreakdown.pretrip}`} />
                <InlineMetric label="接管回報" value={`${unsyncedBreakdown.takeover}`} />
                <InlineMetric label="事故證據" value={`${unsyncedBreakdown.incident}`} />
                <InlineMetric label="交班紀錄" value={`${unsyncedBreakdown.handover}`} />
              </View>
              <Text style={styles.supportText}>
                這個模式僅顯示任務、行程、接管、事故、結案與交班相關資訊；不會顯示遠端控制、重新啟動 FSD 或任何車輛控制項。
              </Text>
            </Panel>
          </>
        ) : null}

        {activeView === "takeover" ? (
          <>
            <ScreenLead
              code="接管回報"
              title="可編輯接管時間，修正紀錄先留在本機"
              body="送出前可以反覆修正接管時間；原始系統時間、修正歷程與回報編號都會保留在本機待同步清單中，直到伺服器第一次確認收到。"
              aside={
                <InlineMetric
                  label="修正次數"
                  value={`${takeoverDraftAudit.corrections.length}`}
                />
              }
            />
            <Panel title="接管草稿" eyebrow="接管">
              <DetailRow
                label="原始系統時間"
                value={formatAt(takeoverDraftAudit.originalSystemOccurredAt)}
              />
              <DetailRow
                label="目前送出時間"
                value={formatAt(takeoverDraftAudit.correctedOccurredAt)}
              />
              <Text style={styles.fieldLabel}>修正接管時間</Text>
              <TextInput
                autoCapitalize="none"
                onChangeText={setTakeoverEditValue}
                style={styles.input}
                value={takeoverEditValue}
              />
              <Text style={styles.fieldHint}>
                送出後，伺服器只會保存送出時間與伺服器接收時間；送出後無法再修改這筆紀錄。
              </Text>
              <Text style={styles.fieldLabel}>備註</Text>
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
            <Panel title="時間修正紀錄" eyebrow="歷程">
              {takeoverDraftAudit.corrections.length === 0 ? (
                <Text style={styles.emptyBody}>
                  目前尚未記錄時間修正；原始系統時間會在首次送出前持續保留於本機草稿。
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
            <Panel title="最近送出結果" eyebrow="防重複送出">
              <DetailRow
                label={formatSafetyOperatorFieldLabel("clientGeneratedReportId")}
                value={recentTakeover?.receipt.clientGeneratedReportId ?? "尚未提交"}
              />
              <DetailRow
                label="送出的接管時間"
                value={formatAt(submittedTakeoverAudit?.correctedOccurredAt ?? null)}
              />
              <DetailRow
                label={formatSafetyOperatorFieldLabel("serverReceivedAt")}
                value={formatAt(recentTakeover?.receipt.serverReceivedAt ?? null)}
              />
              <DetailRow
                label="重複送出"
                value={recentTakeover?.receipt.duplicate ? "是" : "否"}
                danger={Boolean(recentTakeover?.receipt.duplicate)}
              />
            </Panel>
          </>
        ) : null}

        {activeView === "incident" ? (
          <>
            <ScreenLead
              code="事故證據"
              title="事故與證據僅供關聯記錄，不涉及車輛控制"
              body="事故、時間標記與證據資料可以先排入本機待同步清單；證據同步服務尚未串接時，狀態會誠實顯示為等待中或失敗。"
              aside={
                <InlineMetric
                  label="證據數量"
                  value={`${SAFETY_OPERATOR_FIXTURE.evidenceArtifactIds.length}`}
                />
              }
            />
            <Panel title="事故關聯" eyebrow="證據">
              <DetailRow label={formatSafetyOperatorFieldLabel("incidentId")} value={SAFETY_OPERATOR_FIXTURE.incidentId} />
              <DetailRow label={formatSafetyOperatorFieldLabel("bookmarkId")} value={SAFETY_OPERATOR_FIXTURE.bookmarkId} />
              <DetailRow
                label={formatSafetyOperatorFieldLabel("evidenceArtifactIds")}
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
              code="行程結案"
              title="本趟結案資訊"
              body="這裡只整理結案所需的事故、接管與結束地點資訊；正式的交班紀錄需要在下一個步驟另外送出。"
              aside={<InlineMetric label="結案狀態" value="待交班" />}
            />
            <Panel title="行程結案" eyebrow="結案">
              <DetailRow label={formatSafetyOperatorFieldLabel("closeoutStatus")} value="待交班" />
              <DetailRow
                label={formatSafetyOperatorFieldLabel("closeoutAt")}
                value={formatAt(SAFETY_OPERATOR_FIXTURE.closeoutEndedAt)}
              />
              <DetailRow
                label={formatSafetyOperatorFieldLabel("endLocation")}
                value={SAFETY_OPERATOR_FIXTURE.endLocationLabel}
              />
              <DetailRow label="事故關聯" value={SAFETY_OPERATOR_FIXTURE.incidentId} />
              <DetailRow
                label="已接受接管"
                value={recentTakeover?.report.reportId ? "是" : "否"}
              />
            </Panel>
          </>
        ) : null}

        {activeView === "handover" ? (
          <>
            <ScreenLead
              code="交班"
              title="交班收尾與接管關聯"
              body="交班會檢查目前待同步清單中尚未完成的接管回報，等待回報編號送達後才會真正完成結案與交班同步。"
              aside={
                <InlineMetric
                  label="待同步交班數"
                  value={`${unsyncedBreakdown.handover}`}
                />
              }
            />
            <Panel title="交班送出" eyebrow="交班">
              <DetailRow label={formatSafetyOperatorFieldLabel("activeAssignmentId")} value={SAFETY_OPERATOR_FIXTURE.activeAssignmentId} />
              <DetailRow label="事故關聯" value={SAFETY_OPERATOR_FIXTURE.incidentId} />
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
      </KeyboardAvoidingContainer>
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
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.border,
    flexWrap: "wrap",
  },
  detailLabel: {
    flexShrink: 0,
    color: THEME.colors.textMuted,
    fontSize: 12,
    maxWidth: "45%",
  },
  detailValue: {
    flex: 1,
    minWidth: 160,
    color: THEME.colors.textStrong,
    fontSize: 13,
    fontWeight: "700",
    textAlign: "right",
    flexWrap: "wrap",
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
