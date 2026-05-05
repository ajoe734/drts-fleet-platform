import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  PLATFORM_CODES,
  type PlatformCode,
  type PlatformPresenceRecord,
} from "@drts/contracts";
import {
  PlatformStatusCard,
  type PlatformStatusAction,
} from "@/components/platform-status-card";
import { Tokens } from "@/components/ui/tokens";
import { getDriverClient } from "@/lib/api-client";

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

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return "要求失敗";
}

export function PlatformBinding() {
  const [presences, setPresences] = useState<PlatformPresenceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<BindForm | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [busyPlatform, setBusyPlatform] = useState<string | null>(null);

  const loadPresences = async () => {
    try {
      const client = getDriverClient();
      const summary = await client.getPlatformPresence();
      setPresences(summary.presences);
    } catch (loadError) {
      Alert.alert("無法載入平台綁定", toErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPresences();
  }, []);

  const handleSubmitForm = async () => {
    if (!form) return;

    if (form.mode === "bind" && !form.platformCode.trim()) {
      Alert.alert("欄位未完成", "請先輸入平台代碼。");
      return;
    }

    let platformCode: PlatformCode;
    if (form.mode === "bind") {
      if (!isPlatformCode(form.platformCode)) {
        Alert.alert(
          "平台代碼無效",
          `平台代碼必須是：${PLATFORM_CODES.join("、")}。`,
        );
        return;
      }
      platformCode = form.platformCode;
    } else {
      platformCode = form.platformCode;
    }

    setSubmitting(true);
    try {
      const client = getDriverClient();
      await client.setPlatformOnline({
        platformCode,
        tokenExpiresAt: form.tokenExpiresAt.trim() || null,
      });
      setForm(null);
      await loadPresences();
      Alert.alert(
        "平台綁定已更新",
        form.mode === "reauth"
          ? `「${form.platformCode}」已重新送出驗證。`
          : `已完成「${form.platformCode}」平台綁定。`,
      );
    } catch (submitError) {
      Alert.alert("無法更新平台綁定", toErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnbind = (platformCode: PlatformCode) => {
    Alert.alert("解除平台綁定", `要解除「${platformCode}」的帳號綁定嗎？`, [
      { text: "取消", style: "cancel" },
      {
        text: "確認解除",
        style: "destructive",
        onPress: async () => {
          setBusyPlatform(platformCode);
          try {
            const client = getDriverClient();
            await client.setPlatformOffline({ platformCode });
            await loadPresences();
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
        label: `重新驗證 ${record.platformCode}`,
        onPress: () => handleOpenReauth(record.platformCode),
        tone: "warning",
        disabled: busyPlatform === record.platformCode,
      });
    }

    actions.push({
      key: "unbind",
      icon: "unlink",
      label: `解除 ${record.platformCode} 綁定`,
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

  return (
    <View>
      <Text style={styles.sectionTitle}>平台帳號綁定</Text>

      {presences.length === 0 ? (
        <Text style={styles.emptyText}>目前尚未綁定任何平台帳號。</Text>
      ) : (
        presences.map((record) => (
          <PlatformStatusCard
            key={record.platformCode}
            record={record}
            actions={buildActions(record)}
          />
        ))
      )}

      {form === null ? (
        <TouchableOpacity
          style={[styles.primaryButton, styles.addButton]}
          onPress={handleOpenBind}
        >
          <Text style={styles.primaryButtonText}>新增平台綁定</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.form}>
          <Text style={styles.formTitle}>
            {form.mode === "reauth"
              ? `重新驗證 ${form.platformCode}`
              : "新增平台綁定"}
          </Text>

          {form.mode === "bind" ? (
            <TextInput
              style={styles.input}
              placeholder="平台代碼，例如 grab 或 gojek"
              placeholderTextColor={Tokens.colors.textMuted}
              value={form.platformCode}
              onChangeText={(value) =>
                setForm({ ...form, platformCode: value })
              }
              autoCapitalize="none"
              autoCorrect={false}
            />
          ) : null}

          <TextInput
            style={styles.input}
            placeholder="平台憑證到期時間，可留空"
            placeholderTextColor={Tokens.colors.textMuted}
            value={form.tokenExpiresAt}
            onChangeText={(value) =>
              setForm({ ...form, tokenExpiresAt: value })
            }
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.formHint}>
            到期時間請使用完整時間格式，例如 `2026-05-06T08:30:00Z`。
          </Text>

          <View style={styles.formActions}>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => setForm(null)}
              disabled={submitting}
            >
              <Text style={styles.secondaryButtonText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.primaryButton,
                submitting && styles.buttonDisabled,
              ]}
              onPress={handleSubmitForm}
              disabled={submitting}
            >
              <Text style={styles.primaryButtonText}>
                {submitting
                  ? "處理中…"
                  : form.mode === "reauth"
                    ? "送出驗證"
                    : "完成綁定"}
              </Text>
            </TouchableOpacity>
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
    marginBottom: Tokens.spacing.md,
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
  emptyText: {
    ...Tokens.type.body,
    color: Tokens.colors.textMuted,
    marginBottom: Tokens.spacing.md,
  },
  addButton: {
    marginTop: Tokens.spacing.xs,
  },
  primaryButton: {
    height: 44,
    borderRadius: Tokens.radius.md,
    backgroundColor: Tokens.colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Tokens.spacing.lg,
  },
  primaryButtonText: {
    ...Tokens.type.label,
    color: Tokens.colors.textInverse,
    fontWeight: "600",
  },
  secondaryButton: {
    height: 44,
    borderRadius: Tokens.radius.md,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    backgroundColor: Tokens.colors.surface,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Tokens.spacing.lg,
  },
  secondaryButtonText: {
    ...Tokens.type.label,
    color: Tokens.colors.textBody,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.5,
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
  input: {
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    borderRadius: Tokens.radius.md,
    paddingHorizontal: Tokens.spacing.md,
    paddingVertical: Tokens.spacing.sm,
    backgroundColor: Tokens.colors.surface,
    color: Tokens.colors.textStrong,
    marginBottom: Tokens.spacing.sm,
  },
  formHint: {
    ...Tokens.type.micro,
    color: Tokens.colors.textMuted,
  },
  formActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: Tokens.spacing.sm,
    marginTop: Tokens.spacing.md,
  },
});
