import { useEffect, useMemo, useState } from "react";
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
  CreateSafetyOperatorTripCloseoutCommand,
  SubmitSafetyOperatorPreTripChecklistCommand,
  SubmitSafetyOperatorTakeoverReportCommand,
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
  clearSafetyOperatorSyncedQueueEntries,
  enqueueSafetyOperatorItem,
  getSafetyOperatorQueueSnapshot,
  markSafetyOperatorQueueFailed,
  markSafetyOperatorQueueSynced,
  markSafetyOperatorQueueSyncing,
  type SafetyOperatorQueueSnapshot,
} from "@/lib/safety-operator-offline-queue";
import {
  getDriverClient,
  isDriverIdentityProvisioned,
  recoverDriverSessionFromApiError,
} from "@/lib/api-client";

type SafetyOperatorView =
  | "provisioning"
  | "pretrip"
  | "active"
  | "incident"
  | "handover";

const THEME = driverTheme;
const MODE = THEME.mode as TokenMode;
const SAFETY_ACCENT = SURFACE_ACCENTS.platform[MODE];
const SAFETY_REALM = REALM_COLORS.platform[MODE];

const VIEW_TABS: Array<{ id: SafetyOperatorView; label: string }> = [
  { id: "provisioning", label: "資格" },
  { id: "pretrip", label: "行前" },
  { id: "active", label: "監看" },
  { id: "incident", label: "證據" },
  { id: "handover", label: "交班" },
];

function formatAt(value: string | null) {
  if (!value) {
    return "尚無更新";
  }

  return new Date(value).toLocaleString("zh-TW", {
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
  children: React.ReactNode;
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
}: {
  label: string;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
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

export default function SafetyOperatorScreen() {
  const router = useRouter();
  const isProvisioned = isDriverIdentityProvisioned();

  const [activeView, setActiveView] = useState<SafetyOperatorView>("active");
  const [queueSnapshot, setQueueSnapshot] =
    useState<SafetyOperatorQueueSnapshot>({
      items: [],
      queuedCount: 0,
      failedCount: 0,
      syncingCount: 0,
      lastSyncedAt: null,
    });
  const [takeoverTime, setTakeoverTime] = useState(new Date().toISOString());
  const [takeoverNotes, setTakeoverNotes] = useState(
    "前方施工車臨停，安全員人工接管通過施工窄口。",
  );
  const [incidentNotes, setIncidentNotes] =
    useState("已補上施工區段照片與車內語音片段。");
  const [handoverNotes, setHandoverNotes] = useState(
    "交班提醒：施工點位仍有臨停風險，注意右後方機車。",
  );
  const [submissionState, setSubmissionState] = useState<string | null>(null);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [recentTakeover, setRecentTakeover] =
    useState<SubmitSafetyOperatorTakeoverReportResult | null>(null);

  const checklistBlockedCount = useMemo(
    () =>
      SAFETY_OPERATOR_CHECKLIST_TEMPLATE.filter(
        (item) => item.status !== "pass",
      ).length,
    [],
  );

  useEffect(() => {
    void refreshQueueSnapshot();
  }, []);

  async function refreshQueueSnapshot() {
    setQueueSnapshot(await getSafetyOperatorQueueSnapshot());
  }

  async function syncTakeoverReport(
    command: SubmitSafetyOperatorTakeoverReportCommand,
  ) {
    await markSafetyOperatorQueueSyncing(command.clientGeneratedReportId);
    try {
      const result = await getDriverClient().submitSafetyOperatorTakeoverReport(
        command,
        {
          headers: {
            "Idempotency-Key": command.clientGeneratedReportId,
            "X-Request-Id": command.clientGeneratedReportId,
          },
        },
      );
      await markSafetyOperatorQueueSynced(
        command.clientGeneratedReportId,
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
        command.clientGeneratedReportId,
        getErrorMessage(error, "接管回報同步失敗，已保留在離線佇列。"),
      );
      setScreenError(getErrorMessage(error, "接管回報同步失敗。"));
    } finally {
      await refreshQueueSnapshot();
    }
  }

  async function submitTakeover() {
    setScreenError(null);
    const command = buildTakeoverCommand({
      occurredAt: takeoverTime.trim(),
      notes: takeoverNotes.trim(),
    });
    await enqueueSafetyOperatorItem(
      "takeover_report",
      command,
      command.clientGeneratedReportId,
    );
    setSubmissionState("接管回報已寫入 durable queue，正在嘗試同步。");
    await refreshQueueSnapshot();

    try {
      await syncTakeoverReport(command);
    } catch {
      // syncTakeoverReport already records error state.
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

    try {
      await markSafetyOperatorQueueSyncing(queued.clientGeneratedId);
      await getDriverClient().submitSafetyOperatorPreTripChecklist(command);
      await markSafetyOperatorQueueSynced(queued.clientGeneratedId, {
        completedAt: new Date().toISOString(),
      });
      setSubmissionState("行前檢查已同步。");
    } catch (error) {
      await recoverDriverSessionFromApiError(error);
      await markSafetyOperatorQueueFailed(
        queued.clientGeneratedId,
        getErrorMessage(error, "行前檢查同步失敗，已保留於佇列。"),
      );
      setScreenError(getErrorMessage(error, "行前檢查同步失敗。"));
    } finally {
      await refreshQueueSnapshot();
    }
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
    setSubmissionState("事故 / 證據資料已暫存到 durable queue。");
    await refreshQueueSnapshot();
  }

  async function submitShiftHandover() {
    setScreenError(null);
    const takeoverIds = recentTakeover?.report.reportId
      ? [recentTakeover.report.reportId]
      : [];
    const command: CreateSafetyOperatorTripCloseoutCommand =
      buildShiftHandoverCommand({
        takeoverReportIds: takeoverIds,
        notes: handoverNotes.trim(),
      });
    const queued = await enqueueSafetyOperatorItem("shift_handover", command);
    setSubmissionState("交班紀錄已寫入 durable queue。");
    await refreshQueueSnapshot();

    try {
      await markSafetyOperatorQueueSyncing(queued.clientGeneratedId);
      await getDriverClient().createSafetyOperatorTripCloseout(command);
      await markSafetyOperatorQueueSynced(queued.clientGeneratedId, {
        closeoutAt: new Date().toISOString(),
      });
      setSubmissionState("交班紀錄已同步。");
    } catch (error) {
      await recoverDriverSessionFromApiError(error);
      await markSafetyOperatorQueueFailed(
        queued.clientGeneratedId,
        getErrorMessage(error, "交班同步失敗，已保留於佇列。"),
      );
      setScreenError(getErrorMessage(error, "交班同步失敗。"));
    } finally {
      await refreshQueueSnapshot();
    }
  }

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

  return (
    <View style={styles.screen}>
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

      <View style={[styles.syncStrip, syncBannerTone]}>
        <Text style={styles.syncStripTitle}>{syncBannerLabel}</Text>
        <Text style={styles.syncStripMeta}>
          上次同步 {formatAt(queueSnapshot.lastSyncedAt)}
        </Text>
      </View>

      <View style={styles.tabRow}>
        {VIEW_TABS.map((tab) => (
          <ModeTab
            key={tab.id}
            active={tab.id === activeView}
            label={tab.label}
            onPress={() => setActiveView(tab.id)}
          />
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {!isProvisioned ? (
          <View style={styles.warningBanner}>
            <Text style={styles.warningTitle}>尚未綁定司機裝置</Text>
            <Text style={styles.warningBody}>
              目前以本機 durable queue 模式預覽 Safety Operator realm。
              後續綁定後仍可重放未同步紀錄。
            </Text>
          </View>
        ) : null}

        <SectionCard
          title="狀態摘要"
          subtitle="realm separated from normal driver mode"
        >
          <View style={styles.statRow}>
            <StatPill label="車輛" value={SAFETY_OPERATOR_FIXTURE.vehicleId} />
            <StatPill label="待同步" value={`${queueSnapshot.queuedCount}`} />
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
              <Row
                label="安全員"
                value={SAFETY_OPERATOR_FIXTURE.operatorName}
              />
              <Row
                label="安全員 ID"
                value={SAFETY_OPERATOR_FIXTURE.safetyOperatorId}
              />
              <Row
                label="實驗計畫"
                value={SAFETY_OPERATOR_FIXTURE.sandboxProgramId}
              />
              <Row label="設備" value="SO Tablet 01" />
              <Row label="資格狀態" value="背景審查待補件" danger />
            </SectionCard>

            <SectionCard title="可見邊界" subtitle="No FSD control UI">
              <Text style={styles.bodyText}>
                此 realm 只顯示資格、監看、接管回報、證據與交班。Tesla / FSD
                內部控制、遠端控制、恢復自駕按鈕均不顯示。
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
                  : `${checklistBlockedCount} 個項目仍需複核；提交後會保留在離線佇列並持續顯示未同步狀態。`}
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
              <Row label="班次" value={SAFETY_OPERATOR_FIXTURE.shiftId} />
              <Row label="指派" value={SAFETY_OPERATOR_FIXTURE.assignmentId} />
              <Row label="訂單" value={SAFETY_OPERATOR_FIXTURE.orderId} />
              <Row label="Telemetry 鮮度" value="2 秒" />
              <Row label="監理事件鮮度" value="48 秒" danger />
            </SectionCard>

            <SectionCard
              title="接管回報"
              subtitle="takeover report · editable occurredAt before first submit"
            >
              <Text style={styles.fieldLabel}>發生時間 occurredAt</Text>
              <TextInput
                autoCapitalize="none"
                onChangeText={setTakeoverTime}
                style={styles.input}
                value={takeoverTime}
              />
              <Text style={styles.fieldHint}>
                初次送出前可調整，送出後只顯示 submitted occurredAt 與
                serverReceivedAt。
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
                  label="提交接管回報"
                  variant="danger"
                  onPress={() => void submitTakeover()}
                />
              </View>
            </SectionCard>

            <SectionCard
              title="最近 receipt"
              subtitle="clientGeneratedReportId dedupe"
            >
              <Row
                label="clientGeneratedReportId"
                value={
                  recentTakeover?.receipt.clientGeneratedReportId ?? "尚未提交"
                }
              />
              <Row
                label="serverReceivedAt"
                value={formatAt(
                  recentTakeover?.receipt.serverReceivedAt ?? null,
                )}
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

        {activeView === "handover" ? (
          <>
            <SectionCard title="交班 / Closeout" subtitle="SO_ShiftHandover">
              <Row label="closeoutStatus" value="handoff" />
              <Row label="接管回報數" value={`${recentTakeover ? 1 : 0}`} />
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
                  onPress={() =>
                    void clearSafetyOperatorSyncedQueueEntries().then(
                      refreshQueueSnapshot,
                    )
                  }
                />
              </View>
            </SectionCard>
          </>
        ) : null}
      </ScrollView>
    </View>
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
  tabRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
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
  statRow: {
    flexDirection: "row",
    gap: 8,
  },
  statPill: {
    backgroundColor: THEME.colors.surfaceLo,
    borderColor: THEME.colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
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
    color: "#FFFFFF",
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
});
