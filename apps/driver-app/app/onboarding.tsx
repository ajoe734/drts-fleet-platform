import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Redirect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type { EmptyReason, ResourceActionDescriptor } from "@drts/contracts";

import {
  ActionButton,
  AppScreen,
  ErrorBanner,
  FormField,
  StatusChip,
  tokens,
} from "@/components/ui";
import {
  getDriverIdentityIssue,
  hasDriverDevOverride,
  initializeDriverIdentity,
  isDriverIdentityProvisioned,
  registerDriverDevice,
} from "@/lib/api-client";
import { driverActivationSteps } from "@/lib/strings";

type OnboardingTone = "warning" | "danger" | "info";

type OnboardingEmptyState = {
  reason: EmptyReason;
  title: string;
  body: string;
  iconName: keyof typeof Ionicons.glyphMap;
  tone: OnboardingTone;
};

type StatusStripItem = {
  label: string;
  value: string;
  detail: string;
  variant: "success" | "warning" | "danger" | "info";
};

const DEFAULT_TEST_REGISTRATION_CODE =
  process.env.EXPO_PUBLIC_DRIVER_TEST_REGISTRATION_CODE ?? "driver-demo-001";
const DEFAULT_TEST_DEVICE_LABEL =
  process.env.EXPO_PUBLIC_DRIVER_TEST_DEVICE_LABEL ?? "Driver Pixel 01";

function BrandTile() {
  return (
    <View style={styles.brandTile}>
      <Text style={styles.brandTileLabel}>D</Text>
    </View>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <AppScreen scrollable={false}>
      <View style={styles.loadingState}>
        <BrandTile />
        <View style={styles.loadingPanel}>
          <ActivityIndicator color={tokens.colors.primary} size="large" />
          <Text style={styles.loadingLabel}>{label}</Text>
        </View>
      </View>
    </AppScreen>
  );
}

function StepTimeline() {
  return (
    <View style={styles.stepList}>
      {driverActivationSteps.map((step, index) => {
        const isLast = index === driverActivationSteps.length - 1;
        const isActive = step.state === "active";
        return (
          <View key={step.title} style={styles.stepRow}>
            <View style={styles.stepIndicatorColumn}>
              <View
                style={[
                  styles.stepIndicator,
                  isActive
                    ? styles.stepIndicatorActive
                    : styles.stepIndicatorPending,
                ]}
              >
                <Text
                  style={
                    isActive
                      ? styles.stepIndicatorTextActive
                      : styles.stepIndicatorTextPending
                  }
                >
                  {index + 1}
                </Text>
              </View>
              {isLast ? null : <View style={styles.stepConnector} />}
            </View>
            <View style={styles.stepBody}>
              <Text
                style={[
                  styles.stepTitle,
                  isActive ? null : styles.stepTitlePending,
                ]}
              >
                {step.title}
              </Text>
              <Text style={styles.stepDescription}>{step.description}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function humanizeCode(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function classifyProvisioningReason(
  issue: string | null,
  registered: boolean,
): EmptyReason {
  const normalized = issue?.toLowerCase() ?? "";

  if (
    normalized.includes("停權") ||
    normalized.includes("退役") ||
    normalized.includes("permission") ||
    normalized.includes("證件")
  ) {
    return "permission_denied";
  }

  if (normalized.includes("資格") || normalized.includes("eligible")) {
    return "driver_not_eligible";
  }

  if (
    normalized.includes("platform") ||
    normalized.includes("服務") ||
    normalized.includes("連線")
  ) {
    return "external_unavailable";
  }

  if (normalized.includes("載入") || normalized.includes("同步")) {
    return "fetch_failed";
  }

  if (registered) {
    return "no_data";
  }

  return "not_provisioned";
}

function buildEmptyState(
  reason: EmptyReason,
  issue: string | null,
): OnboardingEmptyState {
  switch (reason) {
    case "permission_denied":
      return {
        reason,
        title: "司機身份受限",
        body:
          issue ??
          "目前的司機身份無法在此裝置啟用，請由營運端確認證件、停權或裝置退役狀態。",
        iconName: "ban-outline",
        tone: "danger",
      };
    case "fetch_failed":
      return {
        reason,
        title: "初始化尚未完成",
        body: issue ?? "裝置狀態暫時無法同步，請重新檢查配置連線。",
        iconName: "cloud-offline-outline",
        tone: "warning",
      };
    case "external_unavailable":
      return {
        reason,
        title: "平台服務暫時不可用",
        body:
          issue ?? "外部平台或設定服務無法連線，啟用流程會暫時停在等待狀態。",
        iconName: "globe-outline",
        tone: "danger",
      };
    case "driver_not_eligible":
      return {
        reason,
        title: "目前不符合啟用資格",
        body:
          issue ??
          "司機資格或服務桶尚未就緒，完成處理前此裝置仍會維持 blocked。",
        iconName: "shield-outline",
        tone: "warning",
      };
    case "no_data":
      return {
        reason,
        title: "已完成註冊，正在進入工作台",
        body: "裝置資料已寫入，正在等待身份與工作台狀態完成同步。",
        iconName: "checkmark-circle-outline",
        tone: "info",
      };
    case "not_provisioned":
    default:
      return {
        reason: "not_provisioned",
        title: "尚未進入工作台",
        body: "未啟用裝置會阻擋所有工作頁與 tab bar。請使用車隊發放的註冊代碼完成綁定。",
        iconName: "lock-closed-outline",
        tone: "warning",
      };
  }
}

function EmptyStateCard({ state }: { state: OnboardingEmptyState }) {
  const palette =
    state.tone === "danger"
      ? {
          icon: tokens.colors.danger,
          background: tokens.colors.dangerBg,
        }
      : state.tone === "info"
        ? {
            icon: tokens.colors.brand,
            background: tokens.colors.brandBg,
          }
        : {
            icon: tokens.colors.warning,
            background: tokens.colors.warningBg,
          };

  return (
    <View style={styles.emptyStateCard}>
      <View
        style={[
          styles.emptyStateIconWrap,
          { backgroundColor: palette.background },
        ]}
      >
        <Ionicons color={palette.icon} name={state.iconName} size={18} />
      </View>
      <View style={styles.emptyStateBody}>
        <Text style={styles.emptyStateTitle}>{state.title}</Text>
        <Text style={styles.emptyStateDescription}>{state.body}</Text>
      </View>
      <Text style={styles.emptyStateMeta}>{state.reason}</Text>
    </View>
  );
}

function StatusStrip({ items }: { items: ReadonlyArray<StatusStripItem> }) {
  return (
    <View style={styles.statusStrip}>
      {items.map((item) => (
        <View key={item.label} style={styles.statusTile}>
          <View style={styles.statusTileHeader}>
            <Text style={styles.statusTileLabel}>{item.label}</Text>
            <StatusChip label={item.value} variant={item.variant} />
          </View>
          <Text style={styles.statusTileDetail}>{item.detail}</Text>
        </View>
      ))}
    </View>
  );
}

function AvailableActionsCard({
  actions,
  onPrimaryPress,
}: {
  actions: ReadonlyArray<ResourceActionDescriptor>;
  onPrimaryPress: () => void;
}) {
  return (
    <View style={styles.actionsCard}>
      <View style={styles.actionsHeader}>
        <Text style={styles.actionsEyebrow}>Available actions</Text>
        <Text style={styles.actionsTitle}>依合約權限顯示</Text>
      </View>
      {actions.map((action) => {
        const disabledLabel = action.disabledReasonCode
          ? humanizeCode(action.disabledReasonCode)
          : null;
        return (
          <View key={action.action} style={styles.actionRow}>
            <View style={styles.actionRowIcon}>
              <Ionicons
                color={
                  action.enabled ? tokens.colors.brand : tokens.colors.textMuted
                }
                name="shield-checkmark-outline"
                size={16}
              />
            </View>
            <View style={styles.actionRowBody}>
              <View style={styles.actionRowTitle}>
                <Text style={styles.actionLabel}>
                  {humanizeCode(action.action)}
                </Text>
                <StatusChip
                  label={action.enabled ? "可執行" : "受限"}
                  variant={action.enabled ? "success" : "warning"}
                />
              </View>
              <Text style={styles.actionDescription}>
                medium risk confirmation · primary CTA only
              </Text>
              {disabledLabel ? (
                <Text style={styles.actionReason}>{disabledLabel}</Text>
              ) : null}
            </View>
          </View>
        );
      })}
      <ActionButton
        disabled={!actions.some((action) => action.enabled)}
        icon="shield-checkmark-outline"
        onPress={onPrimaryPress}
        title="註冊此裝置"
      />
    </View>
  );
}

export default function OnboardingScreen() {
  const [ready, setReady] = useState(false);
  const [registrationCode, setRegistrationCode] = useState(
    DEFAULT_TEST_REGISTRATION_CODE,
  );
  const [deviceLabel, setDeviceLabel] = useState(DEFAULT_TEST_DEVICE_LABEL);
  const [submitting, setSubmitting] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [provisioningError, setProvisioningError] = useState<string | null>(
    null,
  );
  const [refreshSeed, setRefreshSeed] = useState(0);

  useEffect(() => {
    let cancelled = false;

    setReady(false);
    initializeDriverIdentity()
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        setProvisioningError(
          error instanceof Error
            ? error.message
            : "裝置初始化失敗，請稍後再試。",
        );
      })
      .finally(() => {
        if (!cancelled) {
          setReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [refreshSeed]);

  const identityIssue = getDriverIdentityIssue();
  const provisioned = ready && isDriverIdentityProvisioned();

  const activeIssue = provisioningError ?? identityIssue;
  const emptyReason = useMemo(
    () => classifyProvisioningReason(activeIssue, registered),
    [activeIssue, registered],
  );
  const emptyState = useMemo(
    () => buildEmptyState(emptyReason, activeIssue),
    [activeIssue, emptyReason],
  );

  const statusStripItems = useMemo<ReadonlyArray<StatusStripItem>>(
    () => [
      {
        label: "裝置",
        value: registered ? "已註冊" : "待啟用",
        detail: registered
          ? "註冊碼已送出，等待身份同步完成。"
          : "新裝置必須先寫入 fleet registration code。",
        variant: registered ? "success" : "warning",
      },
      {
        label: "身份",
        value: activeIssue ? "需處理" : "待驗證",
        detail: activeIssue
          ? activeIssue
          : "完成註冊後會綁定司機身份，才能進入工作頁。",
        variant: activeIssue ? "danger" : "info",
      },
      {
        label: "平台",
        value: "Blocked",
        detail: "未配置狀態不提供 cross-app deep link，也不允許進入工作 tab。",
        variant: "warning",
      },
    ],
    [activeIssue, registered],
  );

  const availableActions = useMemo<ReadonlyArray<ResourceActionDescriptor>>(
    () => [
      {
        action: "register_device",
        enabled:
          registrationCode.trim().length > 0 &&
          !submitting &&
          emptyReason !== "permission_denied" &&
          emptyReason !== "driver_not_eligible",
        disabledReasonCode:
          registrationCode.trim().length === 0
            ? "registration_code_required"
            : submitting
              ? "submission_in_progress"
              : emptyReason === "permission_denied"
                ? "identity_restricted"
                : emptyReason === "driver_not_eligible"
                  ? "driver_not_eligible"
                  : undefined,
        riskLevel: "medium",
      },
    ],
    [emptyReason, registrationCode, submitting],
  );

  const handleRefresh = () => {
    setProvisioningError(null);
    setRegistered(false);
    setRefreshSeed((current) => current + 1);
  };

  const handleRegister = async () => {
    if (!availableActions[0]?.enabled) {
      return;
    }

    setSubmitting(true);
    setProvisioningError(null);

    try {
      await registerDriverDevice(registrationCode.trim(), deviceLabel.trim());
      setRegistered(true);
      await initializeDriverIdentity();
      setRefreshSeed((current) => current + 1);
    } catch (error: unknown) {
      setRegistered(false);
      setProvisioningError(
        error instanceof Error ? error.message : "裝置配置失敗，請稍後再試。",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!ready) {
    return <LoadingState label="正在檢查裝置配置…" />;
  }

  if (provisioned) {
    return <Redirect href="/" />;
  }

  return (
    <AppScreen contentContainerStyle={styles.content}>
      <View style={styles.heroCard}>
        <View pointerEvents="none" style={styles.heroGlow} />
        <BrandTile />
        <Text style={styles.heroTitle}>裝置啟用</Text>
        <Text style={styles.heroMeta}>
          device provisioning · refresh tier manual
        </Text>
        <Text style={styles.heroLead}>
          連線車隊管理系統，啟用後此裝置可接收派單與平台訂單。
        </Text>
        {hasDriverDevOverride() ? (
          <View style={styles.devOverrideTag}>
            <StatusChip label="開發覆寫" variant="info" />
          </View>
        ) : null}
      </View>

      <View style={styles.panel}>
        <StepTimeline />
      </View>

      <StatusStrip items={statusStripItems} />

      <EmptyStateCard state={emptyState} />

      <View style={styles.formCard}>
        {provisioningError ? <ErrorBanner message={provisioningError} /> : null}
        <FormField
          autoCapitalize="none"
          autoCorrect={false}
          editable={!submitting}
          helpText="車隊發放的 device registration code。"
          label="註冊代碼"
          onChangeText={setRegistrationCode}
          placeholder="請輸入註冊代碼"
          style={styles.monoInput}
          value={registrationCode}
        />
        <FormField
          editable={!submitting}
          helpText="選填，方便平台與營運端辨識此裝置。"
          label="裝置名稱"
          onChangeText={setDeviceLabel}
          placeholder="例如：Driver Pixel 01"
          value={deviceLabel}
        />
      </View>

      <AvailableActionsCard
        actions={availableActions}
        onPrimaryPress={() => {
          void handleRegister();
        }}
      />

      <View style={styles.footerNotice}>
        <Ionicons
          color={tokens.colors.warning}
          name="lock-closed-outline"
          size={14}
        />
        <Text style={styles.footerNoticeText}>
          未啟用裝置無法接收派單。請使用車隊發放的代碼，避免使用個人帳號註冊。
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={handleRefresh}
        style={({ pressed }) => [
          styles.refreshLink,
          pressed ? styles.refreshLinkPressed : null,
        ]}
      >
        <Ionicons
          color={tokens.colors.textMuted}
          name="refresh-outline"
          size={14}
        />
        <Text style={styles.refreshLinkText}>重新檢查裝置狀態</Text>
      </Pressable>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  loadingState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: tokens.spacing[24],
  },
  loadingPanel: {
    marginTop: tokens.spacing[20],
    alignItems: "center",
    gap: tokens.spacing[12],
  },
  loadingLabel: {
    ...tokens.type.body,
    color: tokens.colors.textMuted,
  },
  content: {
    paddingBottom: tokens.spacing[32],
    gap: tokens.spacing[16],
  },
  heroCard: {
    position: "relative",
    overflow: "hidden",
    borderRadius: tokens.radius.xl,
    padding: tokens.spacing.xxl,
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    gap: tokens.spacing.md,
  },
  heroGlow: {
    position: "absolute",
    top: -36,
    right: -24,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: `${tokens.colors.brand}15`,
  },
  brandTile: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: tokens.colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  brandTileLabel: {
    ...tokens.type.title,
    color: tokens.colors.textInverse,
    fontWeight: "700",
  },
  heroTitle: {
    ...tokens.type.display,
    color: tokens.colors.text,
  },
  heroMeta: {
    ...tokens.type.small,
    color: tokens.colors.textMuted,
    textTransform: "uppercase",
  },
  heroLead: {
    ...tokens.type.body,
    color: tokens.colors.textMuted,
    lineHeight: 22,
  },
  devOverrideTag: {
    marginTop: tokens.spacing.sm,
    alignSelf: "flex-start",
  },
  panel: {
    borderRadius: tokens.radius.xl,
    padding: tokens.spacing.xl,
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  stepList: {
    gap: tokens.spacing[12],
  },
  stepRow: {
    flexDirection: "row",
    gap: tokens.spacing.lg,
  },
  stepIndicatorColumn: {
    alignItems: "center",
  },
  stepIndicator: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  stepIndicatorActive: {
    backgroundColor: tokens.colors.brand,
    borderColor: tokens.colors.brand,
  },
  stepIndicatorPending: {
    backgroundColor: tokens.colors.surfaceLo,
    borderColor: tokens.colors.border,
  },
  stepIndicatorTextActive: {
    ...tokens.type.label,
    color: tokens.colors.textInverse,
  },
  stepIndicatorTextPending: {
    ...tokens.type.label,
    color: tokens.colors.textMuted,
  },
  stepConnector: {
    marginTop: 4,
    flex: 1,
    width: 2,
    backgroundColor: tokens.colors.border,
  },
  stepBody: {
    flex: 1,
    paddingTop: 3,
  },
  stepTitle: {
    ...tokens.type.label,
    color: tokens.colors.text,
  },
  stepTitlePending: {
    color: tokens.colors.textMuted,
  },
  stepDescription: {
    ...tokens.type.small,
    color: tokens.colors.textMuted,
    marginTop: 2,
  },
  statusStrip: {
    gap: tokens.spacing.md,
  },
  statusTile: {
    borderRadius: tokens.radius[18],
    padding: tokens.spacing[16],
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    gap: tokens.spacing.md,
  },
  statusTileHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: tokens.spacing[12],
  },
  statusTileLabel: {
    ...tokens.type.small,
    color: tokens.colors.textMuted,
    textTransform: "uppercase",
  },
  statusTileDetail: {
    ...tokens.type.body,
    color: tokens.colors.text,
    lineHeight: 20,
  },
  emptyStateCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: tokens.spacing.lg,
    borderRadius: tokens.radius.xl,
    padding: tokens.spacing.xl,
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  emptyStateIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyStateBody: {
    flex: 1,
    gap: tokens.spacing[4],
  },
  emptyStateTitle: {
    ...tokens.type.sectionTitle,
    color: tokens.colors.text,
  },
  emptyStateDescription: {
    ...tokens.type.body,
    color: tokens.colors.textMuted,
    lineHeight: 21,
  },
  emptyStateMeta: {
    ...tokens.type.micro,
    color: tokens.colors.textMuted,
    textTransform: "uppercase",
  },
  formCard: {
    borderRadius: tokens.radius.xl,
    padding: tokens.spacing.xl,
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  monoInput: {
    fontFamily: tokens.type.code.fontFamily,
  },
  actionsCard: {
    borderRadius: tokens.radius.xl,
    padding: tokens.spacing.xl,
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    gap: tokens.spacing[16],
  },
  actionsHeader: {
    gap: tokens.spacing[4],
  },
  actionsEyebrow: {
    ...tokens.type.small,
    color: tokens.colors.textMuted,
    textTransform: "uppercase",
  },
  actionsTitle: {
    ...tokens.type.sectionTitle,
    color: tokens.colors.text,
  },
  actionRow: {
    flexDirection: "row",
    gap: tokens.spacing[12],
  },
  actionRowIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: tokens.colors.brandBg,
    alignItems: "center",
    justifyContent: "center",
  },
  actionRowBody: {
    flex: 1,
    gap: tokens.spacing[4],
  },
  actionRowTitle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: tokens.spacing[12],
  },
  actionLabel: {
    ...tokens.type.label,
    color: tokens.colors.text,
  },
  actionDescription: {
    ...tokens.type.small,
    color: tokens.colors.textMuted,
  },
  actionReason: {
    ...tokens.type.small,
    color: tokens.colors.warning,
  },
  footerNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: tokens.spacing[8],
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.lg,
    backgroundColor: tokens.colors.warningBg,
    borderWidth: 1,
    borderColor: `${tokens.colors.warning}35`,
  },
  footerNoticeText: {
    flex: 1,
    ...tokens.type.small,
    color: tokens.colors.warning,
    lineHeight: 18,
  },
  refreshLink: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing.sm,
    paddingVertical: tokens.spacing[8],
  },
  refreshLinkPressed: {
    opacity: 0.7,
  },
  refreshLinkText: {
    ...tokens.type.small,
    color: tokens.colors.textMuted,
  },
});
