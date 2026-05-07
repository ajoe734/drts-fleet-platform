import React, { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import {
  PLATFORM_CODE_REGISTRY,
  type PlatformPresenceRecord,
} from "@drts/contracts";
import {
  PlatformHealthCard,
  type PlatformHealthFact,
  PlatformBadge,
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

interface PlatformStatusCardProps {
  record: PlatformPresenceRecord;
  actions?: PlatformStatusAction[];
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

  const remainingMinutes = Math.floor(remainingMs / 60000);
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

function getHealthTone(
  record: PlatformPresenceRecord,
  expiryInfo: TokenExpiryInfo,
): "healthy" | "warning" | "danger" | "neutral" {
  if (!record.accountId || record.eligibility === "ineligible") {
    return "danger";
  }

  if (
    record.reauthRequired ||
    expiryInfo.urgency === "expired" ||
    expiryInfo.urgency === "urgent"
  ) {
    return "warning";
  }

  if (record.status === "online" && record.eligibility === "eligible") {
    return "healthy";
  }

  return "neutral";
}

function getActionToneStyles(tone: PlatformStatusAction["tone"] = "neutral") {
  switch (tone) {
    case "primary":
      return {
        backgroundColor: "#E8F1FF",
        borderColor: "#B7D1F6",
        iconColor: Tokens.colors.primary,
      };
    case "warning":
      return {
        backgroundColor: Tokens.colors.surfaceWarning,
        borderColor: "#F5C26B",
        iconColor: Tokens.colors.warning,
      };
    case "danger":
      return {
        backgroundColor: Tokens.colors.surfaceDanger,
        borderColor: "#F0A7AF",
        iconColor: Tokens.colors.danger,
      };
    default:
      return {
        backgroundColor: Tokens.colors.surfaceMuted,
        borderColor: Tokens.colors.border,
        iconColor: Tokens.colors.textBody,
      };
  }
}

export function PlatformStatusCard({
  record,
  actions = [],
}: PlatformStatusCardProps) {
  const [expiryInfo, setExpiryInfo] = useState(() =>
    getTokenExpiryInfo(record.tokenExpiresAt),
  );
  const platformLabel =
    PLATFORM_CODE_REGISTRY[record.platformCode]?.displayName ??
    record.platformCode;
  const normalizedPlatformCode = String(record.platformCode).toLowerCase();

  useEffect(() => {
    setExpiryInfo(getTokenExpiryInfo(record.tokenExpiresAt));

    if (!record.tokenExpiresAt) {
      return;
    }

    const interval = setInterval(() => {
      setExpiryInfo(getTokenExpiryInfo(record.tokenExpiresAt));
    }, 60000);

    return () => clearInterval(interval);
  }, [record.tokenExpiresAt]);

  const statusColor =
    record.status === "online"
      ? Tokens.colors.success
      : Tokens.colors.borderStrong;
  const healthTone = getHealthTone(record, expiryInfo);
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
  ];

  if (record.tokenExpiresAt) {
    facts.push({
      label: "平台憑證",
      value: expiryInfo.label,
      tone:
        expiryInfo.urgency === "safe"
          ? "healthy"
          : expiryInfo.urgency === "warning" || expiryInfo.urgency === "urgent"
            ? "warning"
            : "danger",
    });
  }

  if (record.lastOnlineAt) {
    facts.push({
      label: "最近上線",
      value: new Date(record.lastOnlineAt).toLocaleString(),
    });
  }

  facts.push({
    label: "綁定帳號",
    value: record.accountId ?? "尚未綁定",
    tone: record.accountId ? "neutral" : "danger",
  });

  return (
    <PlatformHealthCard
      title={platformLabel}
      subtitle={getStatusText(record.status)}
      statusLabel={
        healthTone === "healthy"
          ? "可接單"
          : healthTone === "warning"
            ? "需要處理"
            : healthTone === "danger"
              ? "不可用"
              : "待確認"
      }
      statusTone={healthTone}
      facts={facts}
      actions={
        actions.length > 0 ? (
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
                    size={18}
                    color={toneStyles.iconColor}
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null
      }
      footer={
        <>
          <PlatformBadge
            code={record.platformCode}
            name={platformLabel}
            forwarded={
              normalizedPlatformCode !== "owned" &&
              normalizedPlatformCode !== "direct"
            }
            size="sm"
          />
          <View style={styles.platformRow}>
            <View
              style={[styles.statusDot, { backgroundColor: statusColor }]}
            />
            <Text style={styles.statusText}>
              目前狀態：{getStatusText(record.status)}
            </Text>
          </View>
          {record.reauthRequired ? (
            <View style={styles.noticeBanner}>
              <Ionicons
                name="alert-circle"
                size={16}
                color={Tokens.colors.warning}
              />
              <Text style={styles.noticeText}>平台憑證需要重新驗證</Text>
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
  actions: {
    flexDirection: "row",
    gap: Tokens.spacing.sm,
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
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
  },
  noticeBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Tokens.spacing.sm,
    paddingHorizontal: Tokens.spacing.sm,
    paddingVertical: Tokens.spacing.sm,
    backgroundColor: Tokens.colors.surfaceWarning,
    borderRadius: Tokens.radius.sm,
    borderWidth: 1,
    borderColor: "#F5C26B",
  },
  noticeText: {
    ...Tokens.type.label,
    color: Tokens.colors.warning,
    flex: 1,
  },
});

export default PlatformStatusCard;
