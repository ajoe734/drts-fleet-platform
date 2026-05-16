import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, View } from "react-native";
import {
  PLATFORM_CODE_REGISTRY,
  PLATFORM_CODES,
  type PlatformCode,
  type PlatformPresenceRecord,
  type PlatformPresenceSummary,
} from "@drts/contracts";
import {
  PlatformStatusCard,
  assessPlatformHealth,
  getPlatformHealthSeverity,
  type PlatformStatusAction,
} from "@/components/platform-status-card";
import { ActionButton } from "@/components/ui/ActionButton";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { FormField } from "@/components/ui/FormField";
import { StatusChip } from "@/components/ui/StatusChip";
import { Tokens } from "@/components/ui/tokens";
import { getDriverClient } from "@/lib/api-client";

interface PlatformBindingProps {
  showSectionTitle?: boolean;
}

type BindForm =
  | {
      mode: "bind";
      platformCode: string;
      tokenExpiresAt: string;
    }
  | {
      mode: "reauth";
      platformCode: PlatformCode;
      tokenExpiresAt: string;
    };

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

export function PlatformBinding({
  showSectionTitle = true,
}: PlatformBindingProps) {
  const [presences, setPresences] = useState<PlatformPresenceRecord[]>([]);
  const [adapterStatuses, setAdapterStatuses] = useState<
    PlatformPresenceSummary["adapterStatuses"]
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
    } catch (loadError) {
      const message = toErrorMessage(loadError);
      setLoadError(`平台綁定資料同步失敗：${message}`);
      if (!silent) {
        Alert.alert("無法載入平台綁定", message);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPresences({ silent: true });
  }, []);

  const handleSubmitForm = async () => {
    if (!form) {
      return;
    }

    let platformCode: PlatformCode;
    if (form.mode === "bind") {
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
      platformCode = normalizedCode;
    } else {
      platformCode = form.platformCode;
    }

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
      Alert.alert(
        "平台綁定已更新",
        form.mode === "reauth"
          ? `「${platformName}」已重新送出驗證。`
          : `已完成「${platformName}」平台綁定。`,
      );
    } catch (submitError) {
      Alert.alert("無法更新平台綁定", toErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnbind = (platformCode: PlatformCode) => {
    const platformName = getPlatformDisplayName(platformCode);
    Alert.alert("解除平台綁定", `要解除「${platformName}」的帳號綁定嗎？`, [
      { text: "取消", style: "cancel" },
      {
        text: "確認解除",
        style: "destructive",
        onPress: async () => {
          setBusyPlatform(platformCode);
          try {
            const client = getDriverClient();
            await client.setPlatformOffline({ platformCode });
            await loadPresences({ silent: true });
          } catch (unbindError) {
            Alert.alert("無法解除綁定", toErrorMessage(unbindError));
          } finally {
            setBusyPlatform(null);
          }
        },
      },
    ]);
  };

  const handleOpenReauth = (platformCode: PlatformCode) => {
    setForm({ mode: "reauth", platformCode, tokenExpiresAt: "" });
  };

  const handleOpenBind = () => {
    setForm({ mode: "bind", platformCode: "", tokenExpiresAt: "" });
  };

  const buildActions = (
    record: PlatformPresenceRecord,
  ): PlatformStatusAction[] => {
    const actions: PlatformStatusAction[] = [];

    if (record.reauthRequired) {
      actions.push({
        key: "reauth",
        icon: "refresh",
        label: "重新驗證",
        onPress: () => handleOpenReauth(record.platformCode),
        tone: "warning",
        disabled: busyPlatform === record.platformCode,
      });
    }

    actions.push({
      key: "unbind",
      icon: "unlink",
      label: "解除綁定",
      onPress: () => handleUnbind(record.platformCode),
      tone: "danger",
      disabled: busyPlatform === record.platformCode,
    });

    return actions;
  };

  if (loading) {
    return (
      <View style={styles.loadingRow}>
        <ActivityIndicator size="small" />
        <Text style={styles.loadingText}>載入平台綁定中…</Text>
      </View>
    );
  }

  const adapterStatusMap = new Map(
    (adapterStatuses ?? []).map((item) => [item.platformCode, item]),
  );
  const enrichedPresences = [...presences]
    .map((record) => ({
      record,
      assessment: assessPlatformHealth(
        record,
        adapterStatusMap.get(record.platformCode),
      ),
    }))
    .sort((left, right) => {
      const severityDelta =
        getPlatformHealthSeverity(right.assessment) -
        getPlatformHealthSeverity(left.assessment);
      if (severityDelta !== 0) {
        return severityDelta;
      }
      return left.record.platformCode.localeCompare(right.record.platformCode);
    });
  const readyCount = enrichedPresences.filter(
    (item) => item.assessment.canReceiveOrders,
  ).length;
  const attentionCount = enrichedPresences.filter(
    (item) => item.assessment.statusTone === "warning",
  ).length;
  const blockedCount = enrichedPresences.filter(
    (item) => item.assessment.statusTone === "danger",
  ).length;

  return (
    <View>
      {showSectionTitle ? (
        <Text style={styles.sectionTitle}>平台帳號綁定</Text>
      ) : null}
      <Text style={styles.sectionDescription}>
        已綁定 {presences.length}{" "}
        個平台，可在此檢視綁定、重新驗證、平台憑證與接單資格狀態，與「平台健康中心」即時同步。
      </Text>

      {enrichedPresences.length > 0 ? (
        <View style={styles.summaryChips}>
          <StatusChip label={`可接單 ${readyCount}`} variant="success" />
          <StatusChip label={`需處理 ${attentionCount}`} variant="warning" />
          <StatusChip label={`已阻塞 ${blockedCount}`} variant="danger" />
        </View>
      ) : null}

      {loadError ? (
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

      {enrichedPresences.length === 0 ? (
        <Text style={styles.emptyText}>目前尚未綁定任何平台帳號。</Text>
      ) : (
        enrichedPresences.map(({ record }) => (
          <PlatformStatusCard
            key={record.platformCode}
            record={record}
            actions={buildActions(record)}
            adapterStatus={adapterStatusMap.get(record.platformCode)}
          />
        ))
      )}

      {form === null ? (
        <ActionButton
          title="新增平台綁定"
          icon="add-circle-outline"
          onPress={handleOpenBind}
          style={styles.addButton}
        />
      ) : (
        <View style={styles.form}>
          <Text style={styles.formTitle}>
            {form.mode === "reauth"
              ? `重新驗證 ${getPlatformDisplayName(form.platformCode)}`
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
            helpText="請使用完整時間格式；留白則代表暫不設定到期時間。"
          />

          <View style={styles.formActions}>
            <ActionButton
              title="取消"
              variant="secondary"
              onPress={() => setForm(null)}
              disabled={submitting}
              style={styles.formActionButton}
            />
            <ActionButton
              title={form.mode === "reauth" ? "送出驗證" : "完成綁定"}
              onPress={handleSubmitForm}
              loading={submitting}
              style={styles.formActionButton}
            />
          </View>
        </View>
      )}
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
  errorBanner: {
    marginBottom: Tokens.spacing.md,
  },
  loadingText: {
    ...Tokens.type.body,
    color: Tokens.colors.textMuted,
    marginLeft: Tokens.spacing.sm,
  },
  emptyText: {
    ...Tokens.type.body,
    color: Tokens.colors.textMuted,
    marginBottom: Tokens.spacing.md,
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
