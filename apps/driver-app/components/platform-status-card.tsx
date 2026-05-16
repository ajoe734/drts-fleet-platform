import React, { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import {
  PLATFORM_CODE_REGISTRY,
  type PlatformPresenceAdapterStatusRecord,
  type PlatformPresenceRecord,
} from "@drts/contracts";
import {
  PlatformHealthCard,
  type PlatformHealthFact,
  PlatformBadge,
  StatusChip,
  Tokens,
} from "@/components/ui";

type TokenExpiryInfo = {
  label: string;
  urgency: "expired" | "urgent" | "warning" | "safe";
};

export interface PlatformStatusAction {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  tone?: "primary" | "warning" | "danger" | "neutral";
  disabled?: boolean;
}

export interface PlatformHealthAssessment {
  canReceiveOrders: boolean;
  blockers: string[];
  statusLabel: string;
  statusTone: "healthy" | "warning" | "danger" | "neutral";
  adapterLabel: string;
  adapterTone: "healthy" | "warning" | "danger" | "neutral";
  readinessLabel: string;
  tokenInfo: TokenExpiryInfo;
}

interface PlatformStatusCardProps {
  record: PlatformPresenceRecord;
  actions?: PlatformStatusAction[];
  adapterStatus?: PlatformPresenceAdapterStatusRecord | null;
}

function getTokenExpiryInfo(tokenExpiresAt: string | null): TokenExpiryInfo {
  if (!tokenExpiresAt) {
    return { label: "未設定到期時間", urgency: "safe" };
  }

  const now = new Date().getTime();
  const expiresAt = new Date(tokenExpiresAt).getTime();
  const remainingMs = expiresAt - now;

  if (remainingMs <= 0) {
    return { label: "已到期", urgency: "expired" };
  }

  const remainingMinutes = Math.max(0, Math.floor(remainingMs / 60000));
  const remainingHours = Math.floor(remainingMinutes / 60);

  if (remainingHours < 1) {
    return { label: `剩餘 ${remainingMinutes} 分鐘`, urgency: "urgent" };
  }

  if (remainingHours < 24) {
    return {
      label: `剩餘 ${remainingHours} 小時 ${remainingMinutes % 60} 分鐘`,
      urgency: "warning",
    };
  }

  const remainingDays = Math.floor(remainingHours / 24);
  return {
    label: `剩餘 ${remainingDays} 天 ${remainingHours % 24} 小時`,
    urgency: "safe",
  };
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "尚無資料";
  }
  return new Date(value).toLocaleString();
}

function getStatusText(status: PlatformPresenceRecord["status"]) {
  return status === "online" ? "已上線" : "未上線";
}

function getEligibilityText(
  eligibility: PlatformPresenceRecord["eligibility"],
) {
  switch (eligibility) {
    case "eligible":
      return "可接單";
    case "pending":
      return "審核中";
    default:
      return "不可用";
  }
}

function getAdapterLabel(
  adapterStatus?: PlatformPresenceAdapterStatusRecord | null,
) {
  if (!adapterStatus || adapterStatus.status === "unknown") {
    return "尚未取得健康狀態";
  }

  switch (adapterStatus.status) {
    case "healthy":
      return "連線正常";
    case "degraded":
      return adapterStatus.blockingReason ?? "平台連線異常";
    default:
      return adapterStatus.blockingReason ?? "平台轉接服務中斷";
  }
}

function getAdapterTone(
  adapterStatus?: PlatformPresenceAdapterStatusRecord | null,
): "healthy" | "warning" | "danger" | "neutral" {
  if (!adapterStatus || adapterStatus.status === "unknown") {
    return "neutral";
  }

  switch (adapterStatus.status) {
    case "healthy":
      return "healthy";
    case "degraded":
      return "warning";
    default:
      return "danger";
  }
}

export function assessPlatformHealth(
  record: PlatformPresenceRecord,
  adapterStatus?: PlatformPresenceAdapterStatusRecord | null,
): PlatformHealthAssessment {
  const tokenInfo = getTokenExpiryInfo(record.tokenExpiresAt);
  const blockers: string[] = [];

  if (!record.accountId) {
    blockers.push("尚未綁定帳號");
  }
  if (record.status !== "online") {
    blockers.push("目前為離線狀態");
  }
  if (tokenInfo.urgency === "expired") {
    blockers.push("平台憑證已到期");
  }
  if (record.reauthRequired) {
    blockers.push("需要重新驗證");
  }
  if (record.eligibility === "pending") {
    blockers.push("資格仍在審核");
  }
  if (record.eligibility === "ineligible") {
    blockers.push("資格已被限制");
  }
  if (adapterStatus?.status === "degraded") {
    blockers.push("平台轉接器降級");
  }
  if (adapterStatus?.status === "down") {
    blockers.push("平台轉接器中斷");
  }

  const canReceiveOrders = blockers.length === 0;
  const attentionOnly =
    !canReceiveOrders &&
    blockers.every((reason) =>
      ["需要重新驗證", "資格仍在審核", "平台轉接器降級"].includes(reason),
    );

  const statusTone = canReceiveOrders
    ? tokenInfo.urgency === "warning" || tokenInfo.urgency === "urgent"
      ? "warning"
      : "healthy"
    : attentionOnly
      ? "warning"
      : "danger";

  return {
    canReceiveOrders,
    blockers,
    statusLabel: canReceiveOrders
      ? "可接單"
      : attentionOnly
        ? "需要處理"
        : "不可接單",
    statusTone,
    adapterLabel: getAdapterLabel(adapterStatus),
    adapterTone: getAdapterTone(adapterStatus),
    readinessLabel: canReceiveOrders
      ? "目前可以接收該平台訂單"
      : `目前無法接單：${blockers.join("、")}`,
    tokenInfo,
  };
}

function getActionToneStyles(tone: PlatformStatusAction["tone"] = "neutral") {
  switch (tone) {
    case "primary":
      return {
        backgroundColor: "#E8F1FF",
        borderColor: "#B7D1F6",
        iconColor: Tokens.colors.primary,
        textColor: Tokens.colors.primary,
      };
    case "warning":
      return {
        backgroundColor: Tokens.colors.surfaceWarning,
        borderColor: "#F5C26B",
        iconColor: Tokens.colors.warning,
        textColor: Tokens.colors.warning,
      };
    case "danger":
      return {
        backgroundColor: Tokens.colors.surfaceDanger,
        borderColor: "#F0A7AF",
        iconColor: Tokens.colors.danger,
        textColor: Tokens.colors.danger,
      };
    default:
      return {
        backgroundColor: Tokens.colors.surfaceMuted,
        borderColor: Tokens.colors.border,
        iconColor: Tokens.colors.textBody,
        textColor: Tokens.colors.textBody,
      };
  }
}

export function getPlatformHealthSeverity(
  assessment: PlatformHealthAssessment,
): number {
  switch (assessment.statusTone) {
    case "danger":
      return 3;
    case "warning":
      return 2;
    case "healthy":
      return 1;
    default:
      return 0;
  }
}

export function PlatformStatusCard({
  record,
  actions = [],
  adapterStatus,
}: PlatformStatusCardProps) {
  const [assessment, setAssessment] = useState(() =>
    assessPlatformHealth(record, adapterStatus),
  );
  const platformLabel =
    PLATFORM_CODE_REGISTRY[record.platformCode]?.displayName ??
    record.platformCode;

  useEffect(() => {
    setAssessment(assessPlatformHealth(record, adapterStatus));

    if (!record.tokenExpiresAt) {
      return;
    }

    const interval = setInterval(() => {
      setAssessment(assessPlatformHealth(record, adapterStatus));
    }, 60000);

    return () => clearInterval(interval);
  }, [adapterStatus, record]);

  const statusColor =
    record.status === "online"
      ? Tokens.colors.success
      : Tokens.colors.borderStrong;
  const facts: PlatformHealthFact[] = [
    {
      label: "接單資格",
      value: getEligibilityText(record.eligibility),
      tone:
        record.eligibility === "eligible"
          ? "healthy"
          : record.eligibility === "pending"
            ? "warning"
            : "danger",
    },
    {
      label: "可否接單",
      value: assessment.canReceiveOrders ? "可以" : "暫不可",
      tone: assessment.canReceiveOrders ? "healthy" : assessment.statusTone,
    },
    {
      label: "平台憑證",
      value: assessment.tokenInfo.label,
      tone:
        assessment.tokenInfo.urgency === "safe"
          ? "healthy"
          : assessment.tokenInfo.urgency === "warning" ||
              assessment.tokenInfo.urgency === "urgent"
            ? "warning"
            : "danger",
    },
    {
      label: "平台轉接器",
      value: assessment.adapterLabel,
      tone: assessment.adapterTone,
    },
    {
      label: "綁定帳號",
      value: record.accountId ?? "尚未綁定",
      tone: record.accountId ? "neutral" : "danger",
    },
    {
      label: "最近同步",
      value: formatTimestamp(adapterStatus?.lastSyncAt ?? null),
      tone: assessment.adapterTone,
    },
  ];

  if (record.lastOnlineAt || record.lastOfflineAt) {
    facts.push({
      label: record.status === "online" ? "最近上線" : "最近離線",
      value: formatTimestamp(
        record.status === "online" ? record.lastOnlineAt : record.lastOfflineAt,
      ),
    });
  }

  return (
    <PlatformHealthCard
      title={platformLabel}
      subtitle={`${getStatusText(record.status)} · ${record.platformCode}`}
      statusLabel={assessment.statusLabel}
      statusTone={assessment.statusTone}
      facts={facts}
      footer={
        <>
          <View style={styles.badgeRow}>
            <PlatformBadge
              code={record.platformCode}
              name={platformLabel}
              forwarded
              size="sm"
            />
            <StatusChip
              label={assessment.adapterLabel}
              variant={
                assessment.adapterTone === "healthy"
                  ? "success"
                  : assessment.adapterTone === "warning"
                    ? "warning"
                    : assessment.adapterTone === "danger"
                      ? "danger"
                      : "default"
              }
            />
          </View>

          <View style={styles.platformRow}>
            <View
              style={[styles.statusDot, { backgroundColor: statusColor }]}
            />
            <Text style={styles.statusText}>{assessment.readinessLabel}</Text>
          </View>

          {assessment.blockers.length > 0 ? (
            <View
              style={[
                styles.noticeBanner,
                assessment.statusTone === "danger"
                  ? styles.noticeBannerDanger
                  : styles.noticeBannerWarning,
              ]}
            >
              <Ionicons
                name={
                  assessment.statusTone === "danger"
                    ? "close-circle"
                    : "alert-circle"
                }
                size={16}
                color={
                  assessment.statusTone === "danger"
                    ? Tokens.colors.danger
                    : Tokens.colors.warning
                }
              />
              <Text
                style={[
                  styles.noticeText,
                  {
                    color:
                      assessment.statusTone === "danger"
                        ? Tokens.colors.danger
                        : Tokens.colors.warning,
                  },
                ]}
              >
                阻塞原因：{assessment.blockers.join("、")}
              </Text>
            </View>
          ) : null}

          {actions.length > 0 ? (
            <View style={styles.actions}>
              {actions.map((action) => {
                const toneStyles = getActionToneStyles(action.tone);
                return (
                  <TouchableOpacity
                    key={action.key}
                    style={[
                      styles.actionButton,
                      {
                        backgroundColor: toneStyles.backgroundColor,
                        borderColor: toneStyles.borderColor,
                      },
                      action.disabled && styles.actionButtonDisabled,
                    ]}
                    onPress={action.onPress}
                    disabled={action.disabled}
                    accessibilityRole="button"
                    accessibilityLabel={action.label}
                  >
                    <Ionicons
                      name={action.icon}
                      size={16}
                      color={toneStyles.iconColor}
                    />
                    <Text
                      style={[
                        styles.actionLabel,
                        { color: toneStyles.textColor },
                      ]}
                    >
                      {action.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}
        </>
      }
      style={styles.card}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: Tokens.spacing.md,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Tokens.spacing.sm,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Tokens.spacing.sm,
  },
  actionButton: {
    minHeight: 38,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    paddingHorizontal: Tokens.spacing.md,
    gap: Tokens.spacing.xs,
  },
  actionLabel: {
    ...Tokens.type.label,
  },
  actionButtonDisabled: {
    opacity: 0.45,
  },
  platformRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Tokens.spacing.sm,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: Tokens.radius.full,
  },
  statusText: {
    ...Tokens.type.small,
    color: Tokens.colors.textMuted,
    flex: 1,
  },
  noticeBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Tokens.spacing.sm,
    paddingHorizontal: Tokens.spacing.sm,
    paddingVertical: Tokens.spacing.sm,
    borderRadius: Tokens.radius.sm,
    borderWidth: 1,
  },
  noticeBannerWarning: {
    backgroundColor: Tokens.colors.surfaceWarning,
    borderColor: "#F5C26B",
  },
  noticeBannerDanger: {
    backgroundColor: Tokens.colors.surfaceDanger,
    borderColor: "#F0A7AF",
  },
  noticeText: {
    ...Tokens.type.label,
    flex: 1,
  },
});

export default PlatformStatusCard;
