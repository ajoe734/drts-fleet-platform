import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  PLATFORM_CODE_REGISTRY,
  PLATFORM_CODES,
  type PlatformCode,
  type PlatformPresenceAdapterStatusRecord,
  type PlatformPresenceRecord,
} from "@drts/contracts";
import { ActionButton } from "@/components/ui/ActionButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { FormField } from "@/components/ui/FormField";
import { StatusChip } from "@/components/ui/StatusChip";
import { Tokens } from "@/components/ui/tokens";
import { getDriverClient } from "@/lib/api-client";
import {
  describeEmptyReason,
  describeReauthMechanism,
  findAction,
  getReauthMechanism,
  resolveBindingActions,
} from "@/lib/driver-ui-runtime";

interface PlatformBindingProps {
  showSectionTitle?: boolean;
  /** Bump to force a silent reload (manual refresh tier, packet §3.2). */
  refreshSignal?: number;
  /** Deep link to the live platform-presence screen. */
  onOpenPresence?: () => void;
}

type BindForm =
  | { mode: "bind"; platformCode: string; tokenExpiresAt: string }
  | { mode: "reauth"; platformCode: PlatformCode; tokenExpiresAt: string }
  | { mode: "unbind"; platformCode: PlatformCode; reason: string };

function isPlatformCode(value: string): value is PlatformCode {
  return PLATFORM_CODES.includes(value as PlatformCode);
}

function normalizePlatformCode(value: string): string {
  return value.trim().toLowerCase();
}

function getPlatformDisplayName(platformCode: PlatformCode): string {
  return PLATFORM_CODE_REGISTRY[platformCode].displayName;
}

function getPlatformOptionLabel(platformCode: PlatformCode): string {
  return `${getPlatformDisplayName(platformCode)}（${platformCode}）`;
}

const SUPPORTED_PLATFORM_HINT = PLATFORM_CODES.map(getPlatformOptionLabel).join(
  "、",
);

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return "要求失敗";
}

function isAdapterUnavailable(
  status: PlatformPresenceAdapterStatusRecord | undefined,
): boolean {
  return status?.status === "down" || status?.status === "degraded";
}

function bindingSeverity(record: PlatformPresenceRecord): number {
  if (record.reauthRequired) return 3;
  if (record.eligibility === "ineligible") return 2;
  if (record.eligibility === "pending") return 1;
  return 0;
}

export function PlatformBinding({
  showSectionTitle = true,
  refreshSignal = 0,
  onOpenPresence,
}: PlatformBindingProps) {
  const [presences, setPresences] = useState<PlatformPresenceRecord[]>([]);
  const [adapterStatuses, setAdapterStatuses] = useState<
    PlatformPresenceAdapterStatusRecord[]
  >([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<BindForm | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [busyPlatform, setBusyPlatform] = useState<string | null>(null);

  const loadPresences = async ({
    silent = false,
  }: { silent?: boolean } = {}) => {
    try {
      const client = getDriverClient();
      const summary = await client.getPlatformPresence();
      setPresences(summary.presences);
      setAdapterStatuses(summary.adapterStatuses ?? []);
      setNotes(summary.notes ?? []);
      setLoadError(null);
    } catch (error) {
      const message = toErrorMessage(error);
      setLoadError(`平台綁定資料同步失敗：${message}`);
      if (!silent) {
        Alert.alert("無法載入平台綁定", message);
      }
    } finally {
      setLoading(false);
    }
  };

  // refreshSignal drives the manual refresh tier from the parent screen.
  useEffect(() => {
    void loadPresences({ silent: true });
  }, [refreshSignal]);

  const handleSubmitBind = async () => {
    if (!form || form.mode !== "bind") {
      return;
    }
    const normalizedCode = normalizePlatformCode(form.platformCode);
    if (!normalizedCode) {
      Alert.alert("欄位未完成", "請先輸入平台代碼。");
      return;
    }
    if (!isPlatformCode(normalizedCode)) {
      Alert.alert(
        "平台代碼無效",
        `平台代碼必須是：${SUPPORTED_PLATFORM_HINT}。`,
      );
      return;
    }
    const platformCode = normalizedCode;
    const platformName = getPlatformDisplayName(platformCode);
    setSubmitting(true);
    try {
      const client = getDriverClient();
      await client.setPlatformOnline({
        platformCode,
        tokenExpiresAt: form.tokenExpiresAt.trim() || null,
      });
      setForm(null);
      await loadPresences({ silent: true });
      Alert.alert("平台綁定已更新", `已完成「${platformName}」平台綁定。`);
    } catch (error) {
      Alert.alert("無法更新平台綁定", toErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitManualReauth = async () => {
    if (!form || form.mode !== "reauth") {
      return;
    }
    const platformName = getPlatformDisplayName(form.platformCode);
    setSubmitting(true);
    try {
      const client = getDriverClient();
      await client.setPlatformOnline({
        platformCode: form.platformCode,
        tokenExpiresAt: form.tokenExpiresAt.trim() || null,
      });
      setForm(null);
      await loadPresences({ silent: true });
      Alert.alert("已重新驗證", `「${platformName}」已重新送出驗證。`);
    } catch (error) {
      Alert.alert("無法重新驗證", toErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitUnbind = async () => {
    if (!form || form.mode !== "unbind") {
      return;
    }
    if (!form.reason.trim()) {
      Alert.alert("需要解除原因", "解除平台綁定屬於高風險操作，請填寫原因。");
      return;
    }
    const platformName = getPlatformDisplayName(form.platformCode);
    setSubmitting(true);
    setBusyPlatform(form.platformCode);
    try {
      const client = getDriverClient();
      await client.setPlatformOffline({
        platformCode: form.platformCode,
        reason: form.reason.trim(),
      });
      setForm(null);
      await loadPresences({ silent: true });
      Alert.alert("已解除綁定", `已解除「${platformName}」的帳號綁定。`);
    } catch (error) {
      Alert.alert("無法解除綁定", toErrorMessage(error));
    } finally {
      setSubmitting(false);
      setBusyPlatform(null);
    }
  };

  const handleReauth = async (record: PlatformPresenceRecord) => {
    const mechanism = getReauthMechanism(record);
    const platformName = getPlatformDisplayName(record.platformCode);
    const descriptor = describeReauthMechanism(mechanism);

    if (mechanism === "ops_managed") {
      Alert.alert(
        "需由派車台處理",
        `「${platformName}」的重新驗證需由派車台協助，請聯絡您的派車台。`,
      );
      return;
    }

    if (mechanism === "manual_credential") {
      setForm({
        mode: "reauth",
        platformCode: record.platformCode,
        tokenExpiresAt: "",
      });
      return;
    }

    // external_browser_oauth / native_app_deeplink — must NOT use an in-app
    // webview (Q-DRV05). Confirm (medium risk), then open externally.
    const url = record.reauthUrl;
    if (!url) {
      Alert.alert(
        "缺少驗證連結",
        `「${platformName}」尚未提供${descriptor.label}的驗證連結，請改用手動帳密或聯絡派車台。`,
      );
      return;
    }
    Alert.alert(
      "重新驗證",
      `將開啟外部${descriptor.label}以重新驗證「${platformName}」。`,
      [
        { text: "取消", style: "cancel" },
        {
          text: descriptor.actionLabel,
          onPress: async () => {
            try {
              const supported = await Linking.canOpenURL(url);
              if (!supported) {
                throw new Error("此裝置無法開啟該連結");
              }
              await Linking.openURL(url);
            } catch (error) {
              Alert.alert("無法開啟驗證", toErrorMessage(error));
            }
          },
        },
      ],
    );
  };

  const handleOpenUnbind = (record: PlatformPresenceRecord) => {
    setForm({ mode: "unbind", platformCode: record.platformCode, reason: "" });
  };

  if (loading) {
    return (
      <View style={styles.loadingRow}>
        <ActivityIndicator size="small" color={Tokens.colors.primary} />
        <Text style={styles.loadingText}>載入平台綁定中…</Text>
      </View>
    );
  }

  const adapterStatusMap = new Map(
    adapterStatuses.map((item) => [item.platformCode, item]),
  );
  const sorted = [...presences].sort((left, right) => {
    const delta = bindingSeverity(right) - bindingSeverity(left);
    if (delta !== 0) return delta;
    return left.platformCode.localeCompare(right.platformCode);
  });

  const readyCount = sorted.filter(
    (record) =>
      record.status === "online" &&
      record.eligibility === "eligible" &&
      !record.reauthRequired,
  ).length;
  const attentionCount = sorted.filter(
    (record) => record.reauthRequired,
  ).length;
  const blockedCount = sorted.filter(
    (record) =>
      record.eligibility === "ineligible" ||
      isAdapterUnavailable(adapterStatusMap.get(record.platformCode)),
  ).length;

  const allAdaptersUnavailable =
    sorted.length > 0 &&
    sorted.every((record) =>
      isAdapterUnavailable(adapterStatusMap.get(record.platformCode)),
    );
  const noneEligible =
    sorted.length > 0 &&
    sorted.every((record) => record.eligibility === "ineligible");

  // EmptyReason-driven list state (Q-X15) — distinct treatments.
  let listEmptyReason:
    | "fetch_failed"
    | "not_provisioned"
    | "external_unavailable"
    | "driver_not_eligible"
    | null = null;
  if (sorted.length === 0) {
    listEmptyReason = loadError ? "fetch_failed" : "not_provisioned";
  } else if (allAdaptersUnavailable) {
    listEmptyReason = "external_unavailable";
  } else if (noneEligible) {
    listEmptyReason = "driver_not_eligible";
  }

  return (
    <View>
      {showSectionTitle ? (
        <Text style={styles.sectionTitle}>平台帳號綁定</Text>
      ) : null}
      <Text style={styles.sectionDescription}>
        已綁定 {presences.length}{" "}
        個平台，可在此檢視綁定、重新驗證、平台憑證與接單資格狀態，與「平台健康中心」即時同步。
      </Text>

      {sorted.length > 0 ? (
        <View style={styles.summaryChips}>
          <StatusChip label={`可接單 ${readyCount}`} variant="success" dot />
          <StatusChip
            label={`需處理 ${attentionCount}`}
            variant="warning"
            dot
          />
          <StatusChip label={`已阻塞 ${blockedCount}`} variant="danger" dot />
        </View>
      ) : null}

      {onOpenPresence ? (
        <Pressable
          onPress={onOpenPresence}
          style={styles.presenceLink}
          accessibilityRole="button"
        >
          <Ionicons
            name="pulse-outline"
            size={16}
            color={Tokens.colors.primary}
          />
          <Text style={styles.presenceLinkText}>
            前往平台健康中心查看即時狀態
          </Text>
          <Ionicons
            name="chevron-forward"
            size={14}
            color={Tokens.colors.primary}
          />
        </Pressable>
      ) : null}

      {loadError && sorted.length > 0 ? (
        <ErrorBanner message={loadError} style={styles.errorBanner} />
      ) : null}

      {notes.length > 0 ? (
        <View style={styles.notesCard}>
          <Text style={styles.notesTitle}>同步說明</Text>
          {notes.map((note) => (
            <Text key={note} style={styles.noteLine}>
              • {note}
            </Text>
          ))}
        </View>
      ) : null}

      {listEmptyReason ? (
        <PlatformBindingEmpty
          reason={listEmptyReason}
          onRetry={() => void loadPresences()}
          onBind={() =>
            setForm({ mode: "bind", platformCode: "", tokenExpiresAt: "" })
          }
        />
      ) : (
        <View style={styles.bindList}>
          {sorted.map((record) => (
            <PlatformBindRow
              key={record.platformCode}
              record={record}
              adapterStatus={adapterStatusMap.get(record.platformCode)}
              busy={busyPlatform === record.platformCode || submitting}
              onReauth={() => void handleReauth(record)}
              onUnbind={() => handleOpenUnbind(record)}
            />
          ))}
        </View>
      )}

      {form === null ? (
        <ActionButton
          title="新增平台綁定"
          icon="add-circle-outline"
          variant="secondary"
          onPress={() =>
            setForm({ mode: "bind", platformCode: "", tokenExpiresAt: "" })
          }
          style={styles.addButton}
        />
      ) : (
        <View style={styles.form}>
          <Text style={styles.formTitle}>
            {form.mode === "reauth"
              ? `重新驗證 ${getPlatformDisplayName(form.platformCode)}`
              : form.mode === "unbind"
                ? `解除綁定 ${getPlatformDisplayName(form.platformCode)}`
                : "新增平台綁定"}
          </Text>

          {form.mode === "bind" ? (
            <FormField
              label="平台代碼"
              placeholder="請輸入平台代碼"
              value={form.platformCode}
              onChangeText={(value) =>
                setForm({ ...form, platformCode: value })
              }
              autoCapitalize="none"
              autoCorrect={false}
              editable={!submitting}
              helpText={`可輸入：${SUPPORTED_PLATFORM_HINT}`}
            />
          ) : null}

          {form.mode === "unbind" ? (
            <FormField
              label="解除原因（必填）"
              placeholder="例如：不再使用此平台"
              value={form.reason}
              onChangeText={(value) => setForm({ ...form, reason: value })}
              editable={!submitting}
              helpText="解除綁定屬於高風險操作，原因會記錄於稽核軌跡。"
            />
          ) : null}

          {form.mode === "reauth" ? (
            <FormField
              label="平台憑證到期時間（選填）"
              placeholder="例如 2026-05-06T08:30:00Z"
              value={form.tokenExpiresAt}
              onChangeText={(value) =>
                setForm({ ...form, tokenExpiresAt: value })
              }
              autoCapitalize="none"
              autoCorrect={false}
              editable={!submitting}
              helpText="請使用完整時間格式；留白代表暫不設定到期時間。"
            />
          ) : null}

          <View style={styles.formActions}>
            <ActionButton
              title="取消"
              variant="secondary"
              onPress={() => setForm(null)}
              disabled={submitting}
              style={styles.formActionButton}
            />
            <ActionButton
              title={
                form.mode === "reauth"
                  ? "送出驗證"
                  : form.mode === "unbind"
                    ? "確認解除"
                    : "完成綁定"
              }
              onPress={
                form.mode === "reauth"
                  ? handleSubmitManualReauth
                  : form.mode === "unbind"
                    ? handleSubmitUnbind
                    : handleSubmitBind
              }
              loading={submitting}
              style={styles.formActionButton}
            />
          </View>
        </View>
      )}
    </View>
  );
}

interface PlatformBindRowProps {
  record: PlatformPresenceRecord;
  adapterStatus: PlatformPresenceAdapterStatusRecord | undefined;
  busy: boolean;
  onReauth: () => void;
  onUnbind: () => void;
}

function PlatformBindRow({
  record,
  adapterStatus,
  busy,
  onReauth,
  onUnbind,
}: PlatformBindRowProps) {
  const name = getPlatformDisplayName(record.platformCode);
  const mechanism = getReauthMechanism(record);
  const mechDescriptor = describeReauthMechanism(mechanism);
  const selfService = record.driverSelfServiceBinding ?? false;
  const actions = resolveBindingActions(record);
  const reauthAction = findAction(actions, "reauthenticate");
  const unbindAction = findAction(actions, "unbind");
  const accountId = record.accountIdMasked ?? record.accountId;
  const isForwarded =
    PLATFORM_CODE_REGISTRY[record.platformCode].status === "forwarder_stub";
  const statusLabel = record.reauthRequired
    ? "需重新授權 · reauth_required"
    : record.status === "online"
      ? "已綁定 · online"
      : "已綁定 · offline";
  const adapterUnavailable = isAdapterUnavailable(adapterStatus);

  return (
    <View style={styles.bindCard}>
      <View style={styles.bindHeader}>
        <View
          style={[
            styles.platformBadge,
            isForwarded ? styles.platformBadgeForwarded : null,
          ]}
        >
          <Text
            style={[
              styles.platformBadgeText,
              isForwarded ? styles.platformBadgeTextForwarded : null,
            ]}
          >
            {record.platformCode.slice(0, 3).toUpperCase()}
          </Text>
        </View>
        <View style={styles.bindIdentity}>
          <Text style={styles.bindName}>
            {name} <Text style={styles.bindCode}>· {record.platformCode}</Text>
          </Text>
          <Text
            style={[
              styles.bindStatus,
              record.reauthRequired ? styles.bindStatusWarn : null,
            ]}
          >
            {statusLabel}
            {accountId ? ` · ${accountId}` : ""}
          </Text>
        </View>
        {record.reauthRequired ? (
          <StatusChip label="需處理" variant="warning" />
        ) : record.eligibility === "eligible" ? (
          <StatusChip label="可接單" variant="success" />
        ) : null}
      </View>

      {/* Re-auth mechanism strip (Q-DRV05 · 4 mechanisms) */}
      <View style={styles.mechStrip}>
        <Ionicons
          name={mechDescriptor.icon}
          size={13}
          color={Tokens.colors.textMuted}
        />
        <Text style={styles.mechLabel}>{mechDescriptor.label}</Text>
        <Text style={styles.mechCode}>· {mechDescriptor.code}</Text>
        <View style={styles.mechSpacer} />
        <Text
          style={[
            styles.selfServiceTag,
            selfService ? styles.selfServiceTagOn : styles.selfServiceTagOff,
          ]}
        >
          {selfService ? "可自助綁定/解除" : "綁定由派車台管理"}
        </Text>
      </View>

      {/* Eligibility + relay capability flags (Q-DRV01 / Q-DRV07) */}
      {(record.eligibility !== "eligible" ||
        record.canRelayAccept !== undefined ||
        record.autoAcceptAllowed) && (
        <View style={styles.flagsRow}>
          {record.eligibility === "ineligible" ? (
            <StatusChip label="不符接單資格" variant="danger" dot />
          ) : record.eligibility === "pending" ? (
            <StatusChip label="資格審核中" variant="warning" dot />
          ) : null}
          {record.canRelayAccept !== undefined ? (
            <StatusChip
              label="可代接"
              variant={record.canRelayAccept ? "success" : "default"}
              dot
            />
          ) : null}
          {record.canRelayReject !== undefined ? (
            <StatusChip
              label="可代拒"
              variant={record.canRelayReject ? "success" : "default"}
              dot
            />
          ) : null}
          {record.relayUnavailableReasonCode ? (
            <StatusChip
              label={record.relayUnavailableReasonCode}
              variant="warning"
            />
          ) : null}
          {record.autoAcceptAllowed ? (
            <StatusChip
              label={
                record.autoAcceptEnabled ? "自動接單 開啟" : "可開啟自動接單"
              }
              variant={record.autoAcceptEnabled ? "brand" : "default"}
              dot
            />
          ) : null}
        </View>
      )}

      {adapterUnavailable ? (
        <Text style={styles.adapterNote}>
          平台介接{adapterStatus?.status === "down" ? "中斷" : "降級"}
          {adapterStatus?.blockingReason
            ? ` · ${adapterStatus.blockingReason}`
            : ""}
        </Text>
      ) : null}

      {/* CTAs driven by availableActions (Q-X13 / §3.5) */}
      {(reauthAction || unbindAction) && (
        <View style={styles.actionRow}>
          {reauthAction ? (
            <ActionButton
              title={
                reauthAction.enabled ? mechDescriptor.actionLabel : "聯絡派車台"
              }
              icon={reauthAction.enabled ? "refresh" : "call-outline"}
              variant="secondary"
              onPress={onReauth}
              disabled={busy || !reauthAction.enabled}
              style={styles.actionButton}
            />
          ) : null}
          {unbindAction ? (
            <ActionButton
              title="解除綁定"
              icon="unlink-outline"
              variant="danger"
              onPress={onUnbind}
              disabled={busy}
              style={styles.actionButton}
            />
          ) : null}
        </View>
      )}
      {!reauthAction && !unbindAction && !selfService ? (
        <Text style={styles.statusOnlyNote}>
          此平台綁定由派車台管理，僅供檢視。
        </Text>
      ) : null}
    </View>
  );
}

interface PlatformBindingEmptyProps {
  reason:
    | "fetch_failed"
    | "not_provisioned"
    | "external_unavailable"
    | "driver_not_eligible";
  onRetry: () => void;
  onBind: () => void;
}

function PlatformBindingEmpty({
  reason,
  onRetry,
  onBind,
}: PlatformBindingEmptyProps) {
  const overrides =
    reason === "not_provisioned"
      ? {
          title: "尚未綁定任何平台",
          description: "綁定外部平台帳號後即可接收該平台的派單。",
        }
      : reason === "external_unavailable"
        ? {
            title: "所有平台介接暫時無法連線",
            description: "外部平台介接目前全部中斷，恢復後會自動同步。",
          }
        : undefined;
  const descriptor = describeEmptyReason(reason, overrides);
  const actionTitle =
    reason === "fetch_failed"
      ? "重新整理"
      : reason === "not_provisioned"
        ? "新增平台綁定"
        : undefined;
  const onAction =
    reason === "fetch_failed"
      ? onRetry
      : reason === "not_provisioned"
        ? onBind
        : undefined;

  return (
    <View style={styles.emptyCard}>
      <EmptyState
        title={descriptor.title}
        description={descriptor.description}
        icon={descriptor.icon}
        tone={descriptor.tone}
        actionTitle={actionTitle}
        onAction={onAction}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    ...Tokens.type.sectionTitle,
    color: Tokens.colors.textStrong,
    marginBottom: Tokens.spacing.xs,
  },
  sectionDescription: {
    ...Tokens.type.micro,
    color: Tokens.colors.textMuted,
    marginBottom: Tokens.spacing.md,
  },
  summaryChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Tokens.spacing.sm,
    marginBottom: Tokens.spacing.md,
  },
  presenceLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: Tokens.spacing.xs,
    paddingVertical: Tokens.spacing.sm,
    paddingHorizontal: Tokens.spacing.md,
    borderRadius: Tokens.radius.md,
    backgroundColor: Tokens.colors.brandBg,
    borderWidth: 1,
    borderColor: Tokens.colors.ownedBorder,
    marginBottom: Tokens.spacing.md,
  },
  presenceLinkText: {
    ...Tokens.type.small,
    color: Tokens.colors.primary,
    fontWeight: "600",
    flex: 1,
  },
  errorBanner: {
    marginBottom: Tokens.spacing.md,
  },
  notesCard: {
    padding: Tokens.spacing.md,
    borderRadius: Tokens.radius.md,
    backgroundColor: Tokens.colors.bgRaised,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    gap: Tokens.spacing.xs,
    marginBottom: Tokens.spacing.md,
  },
  notesTitle: {
    ...Tokens.type.label,
    color: Tokens.colors.textStrong,
  },
  noteLine: {
    ...Tokens.type.small,
    color: Tokens.colors.textMuted,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Tokens.spacing.sm,
  },
  loadingText: {
    ...Tokens.type.body,
    color: Tokens.colors.textMuted,
    marginLeft: Tokens.spacing.sm,
  },
  emptyCard: {
    borderRadius: Tokens.radius.md,
    backgroundColor: Tokens.colors.surfaceLo,
    paddingVertical: Tokens.spacing.lg,
    marginBottom: Tokens.spacing.md,
  },
  bindList: {
    gap: Tokens.spacing.sm,
    marginBottom: Tokens.spacing.md,
  },
  bindCard: {
    borderRadius: Tokens.radius.md,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    backgroundColor: Tokens.colors.surface,
    padding: Tokens.spacing.md,
    gap: Tokens.spacing.sm,
  },
  bindHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Tokens.spacing.sm,
  },
  platformBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Tokens.colors.ownedBg,
  },
  platformBadgeForwarded: {
    backgroundColor: Tokens.colors.forwardedBg,
  },
  platformBadgeText: {
    ...Tokens.type.micro,
    color: Tokens.colors.owned,
    fontWeight: "800",
  },
  platformBadgeTextForwarded: {
    color: Tokens.colors.forwarded,
  },
  bindIdentity: {
    flex: 1,
    minWidth: 0,
  },
  bindName: {
    ...Tokens.type.label,
    color: Tokens.colors.textStrong,
    fontWeight: "600",
  },
  bindCode: {
    ...Tokens.type.micro,
    color: Tokens.colors.textDim,
    fontWeight: "400",
  },
  bindStatus: {
    ...Tokens.type.micro,
    color: Tokens.colors.textMuted,
    marginTop: 2,
  },
  bindStatusWarn: {
    color: Tokens.colors.warning,
  },
  mechStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Tokens.spacing.xs,
    paddingVertical: Tokens.spacing.xs,
    paddingHorizontal: Tokens.spacing.sm,
    borderRadius: Tokens.radius.sm,
    backgroundColor: Tokens.colors.surfaceLo,
  },
  mechLabel: {
    ...Tokens.type.micro,
    color: Tokens.colors.textMuted,
  },
  mechCode: {
    ...Tokens.type.micro,
    color: Tokens.colors.textDim,
  },
  mechSpacer: {
    flex: 1,
  },
  selfServiceTag: {
    ...Tokens.type.micro,
    fontWeight: "600",
  },
  selfServiceTagOn: {
    color: Tokens.colors.success,
  },
  selfServiceTagOff: {
    color: Tokens.colors.warning,
  },
  flagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Tokens.spacing.xs,
  },
  adapterNote: {
    ...Tokens.type.micro,
    color: Tokens.colors.warning,
  },
  actionRow: {
    flexDirection: "row",
    gap: Tokens.spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
  statusOnlyNote: {
    ...Tokens.type.micro,
    color: Tokens.colors.textDim,
  },
  addButton: {
    marginTop: Tokens.spacing.xs,
  },
  form: {
    marginTop: Tokens.spacing.md,
    padding: Tokens.spacing.lg,
    backgroundColor: Tokens.colors.surface,
    borderRadius: Tokens.radius.md,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
  },
  formTitle: {
    ...Tokens.type.body,
    color: Tokens.colors.textStrong,
    fontWeight: "700",
    marginBottom: Tokens.spacing.md,
  },
  formActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: Tokens.spacing.sm,
    marginTop: Tokens.spacing.sm,
  },
  formActionButton: { flex: 1 },
});
