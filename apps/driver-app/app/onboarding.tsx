import { useEffect, useMemo, useState } from "react";
import { Redirect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type {
  EmptyReason,
  RefreshTier,
  ResourceActionDescriptor,
} from "@drts/contracts";
import type { CanvasTone } from "@drts/ui-web/canvas-tokens";

import {
  Banner,
  Btn,
  Card,
  Pill,
  Shell,
  driverCanvasTheme,
} from "@/components/canvas-primitives";
import {
  getDriverIdentityIssue,
  hasDriverDevOverride,
  initializeDriverIdentity,
  isDriverIdentityProvisioned,
  registerDriverDevice,
} from "@/lib/api-client";
import { driverActivationSteps, driverStrings } from "@/lib/strings";

type ProvisioningActionId =
  | "register_device"
  | "refresh_provisioning"
  | "reinitialize_identity";

type ActionModel = ResourceActionDescriptor & {
  id: ProvisioningActionId;
  title: string;
  description: string;
  iconName: keyof typeof Ionicons.glyphMap;
};

type OnboardingStateSpec = {
  reason: EmptyReason;
  tone: Exclude<CanvasTone, "neutral">;
  title: string;
  body: string;
  badge: string;
  iconName: keyof typeof Ionicons.glyphMap;
};

type StatusTile = {
  label: string;
  value: string;
  detail: string;
  tone: CanvasTone;
};

const THEME = driverCanvasTheme;
const REFRESH_TIER: RefreshTier = "manual";

const DEFAULT_TEST_REGISTRATION_CODE =
  process.env.EXPO_PUBLIC_DRIVER_TEST_REGISTRATION_CODE ?? "driver-demo-001";
const DEFAULT_TEST_DEVICE_LABEL =
  process.env.EXPO_PUBLIC_DRIVER_TEST_DEVICE_LABEL ?? "Driver Pixel 01";

function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return fallback;
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
    normalized.includes("證件") ||
    normalized.includes("revoke")
  ) {
    return "permission_denied";
  }

  if (normalized.includes("資格") || normalized.includes("eligible")) {
    return "driver_not_eligible";
  }

  if (
    normalized.includes("platform") ||
    normalized.includes("服務") ||
    normalized.includes("連線") ||
    normalized.includes("adapter")
  ) {
    return "external_unavailable";
  }

  if (
    normalized.includes("載入") ||
    normalized.includes("同步") ||
    normalized.includes("network") ||
    normalized.includes("timeout")
  ) {
    return "fetch_failed";
  }

  if (registered) {
    return "no_data";
  }

  return "not_provisioned";
}

function buildStateSpec(
  reason: EmptyReason,
  issue: string | null,
): OnboardingStateSpec {
  switch (reason) {
    case "permission_denied":
      return {
        reason,
        tone: "danger",
        title: "司機身份受限，裝置保持 blocked",
        body:
          issue ??
          "此裝置無法綁定目前身份。請由平台管理端確認停權、證件或退役狀態。",
        badge: "identity blocked",
        iconName: "ban-outline",
      };
    case "fetch_failed":
      return {
        reason,
        tone: "warn",
        title: "初始化失敗，尚未拿到配置快照",
        body:
          issue ??
          "裝置暫時無法同步身份與配置資料。請先重試同步，再決定是否重新綁定。",
        badge: "snapshot missing",
        iconName: "cloud-offline-outline",
      };
    case "external_unavailable":
      return {
        reason,
        tone: "warn",
        title: "外部平台暫時不可用",
        body:
          issue ??
          "平台或 adapter 降級，註冊可以完成，但工作台能力會維持受限直到同步恢復。",
        badge: "adapter degraded",
        iconName: "radio-outline",
      };
    case "driver_not_eligible":
      return {
        reason,
        tone: "danger",
        title: "目前不符合接單資格",
        body:
          issue ??
          "司機尚未進入可接單 bucket，裝置會持續保持 blocked，直到資格條件恢復。",
        badge: "eligibility blocked",
        iconName: "shield-outline",
      };
    case "no_data":
      return {
        reason,
        tone: "success",
        title: "裝置已註冊，正在載入工作台",
        body: "裝置綁定已寫入，下一步是完成身份同步後進入 workspace cockpit。",
        badge: "ready handoff",
        iconName: "checkmark-circle-outline",
      };
    case "not_provisioned":
    default:
      return {
        reason: "not_provisioned",
        tone: "accent",
        title: "新裝置尚未啟用，工作頁全部鎖定",
        body: "未綁定裝置不顯示 tab bar，也不允許進入工作台。請用車隊發放的註冊碼完成啟用。",
        badge: "tab lock active",
        iconName: "lock-closed-outline",
      };
  }
}

function LoadingState({ label }: { label: string }) {
  return (
    <Shell
      theme={THEME}
      contentContainerStyle={styles.loadingShellContent}
      footer={null}
    >
      <View style={styles.loadingState}>
        <View style={styles.loadingMark}>
          <Text style={styles.loadingMarkLabel}>D</Text>
        </View>
        <ActivityIndicator color={THEME.accent} size="large" />
        <Text style={styles.loadingLabel}>{label}</Text>
      </View>
    </Shell>
  );
}

function SectionEyebrow({ children }: { children: string }) {
  return <Text style={styles.sectionEyebrow}>{children}</Text>;
}

function StatusStrip({ items }: { items: ReadonlyArray<StatusTile> }) {
  return (
    <View style={styles.statusStrip}>
      {items.map((item) => (
        <View
          key={item.label}
          style={[
            styles.statusTile,
            {
              backgroundColor: THEME.surface,
              borderColor: THEME.border,
            },
          ]}
        >
          <View style={styles.statusTileTop}>
            <Text style={styles.statusLabel}>{item.label}</Text>
            <Pill theme={THEME} tone={item.tone}>
              {item.value}
            </Pill>
          </View>
          <Text style={styles.statusDetail}>{item.detail}</Text>
        </View>
      ))}
    </View>
  );
}

function StepTimeline({ currentReason }: { currentReason: EmptyReason }) {
  return (
    <Card
      theme={THEME}
      title="啟用流程"
      subtitle="Activation, identity, platform"
    >
      <View style={styles.stepList}>
        {driverActivationSteps.map((step, index) => {
          const done = currentReason === "no_data" && index === 0;
          const active = currentReason !== "no_data" && index === 0;
          const tone: CanvasTone = done
            ? "success"
            : active
              ? "accent"
              : "neutral";

          return (
            <View key={step.title} style={styles.stepRow}>
              <View
                style={[
                  styles.stepDot,
                  {
                    backgroundColor:
                      tone === "success"
                        ? THEME.successBg
                        : tone === "accent"
                          ? THEME.accentBg
                          : THEME.neutralBg,
                    borderColor:
                      tone === "success"
                        ? THEME.successBorder
                        : tone === "accent"
                          ? THEME.accentBorder
                          : THEME.neutralBorder,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.stepDotLabel,
                    {
                      color:
                        tone === "success"
                          ? THEME.success
                          : tone === "accent"
                            ? THEME.accent
                            : THEME.textMuted,
                    },
                  ]}
                >
                  {done ? "✓" : index + 1}
                </Text>
              </View>
              <View style={styles.stepCopy}>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepDescription}>{step.description}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

function ProvisioningInput({
  label,
  value,
  onChangeText,
  placeholder,
  helpText,
  autoCapitalize,
  editable = true,
  mono = false,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  helpText: string;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  editable?: boolean;
  mono?: boolean;
}) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        autoCapitalize={autoCapitalize}
        editable={editable}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={THEME.textMuted}
        style={[styles.input, mono ? styles.inputMono : null]}
        value={value}
      />
      <Text style={styles.inputHelp}>{helpText}</Text>
    </View>
  );
}

function StateBanner({ spec }: { spec: OnboardingStateSpec }) {
  return (
    <Banner
      theme={THEME}
      tone={spec.tone}
      icon={<Ionicons color={THEME.text} name={spec.iconName} size={18} />}
      title={spec.title}
      body={spec.body}
      actions={
        <Pill theme={THEME} tone={spec.tone}>
          {spec.badge}
        </Pill>
      }
    />
  );
}

function AvailableActionsCard({
  actions,
}: {
  actions: ReadonlyArray<ActionModel>;
}) {
  return (
    <Card
      theme={THEME}
      title="Available actions"
      subtitle="Only what the current resource contract allows"
    >
      <View style={styles.actionList}>
        {actions.map((action) => {
          const reason = action.disabledReasonCode
            ? humanizeCode(action.disabledReasonCode)
            : null;
          const tone: CanvasTone = action.enabled ? "success" : "warn";

          return (
            <View
              key={action.id}
              style={[
                styles.actionRow,
                {
                  backgroundColor: THEME.surfaceLo,
                  borderColor: THEME.border,
                },
              ]}
            >
              <View style={styles.actionIconWrap}>
                <Ionicons
                  color={action.enabled ? THEME.accent : THEME.textMuted}
                  name={action.iconName}
                  size={16}
                />
              </View>
              <View style={styles.actionCopy}>
                <View style={styles.actionHeadline}>
                  <Text style={styles.actionTitle}>{action.title}</Text>
                  <Pill theme={THEME} tone={tone}>
                    {action.enabled ? "enabled" : "disabled"}
                  </Pill>
                </View>
                <Text style={styles.actionDescription}>
                  {action.description}
                </Text>
                <Text style={styles.actionMeta}>
                  risk {action.riskLevel}
                  {reason ? ` · ${reason}` : ""}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

export default function OnboardingScreen() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [registrationCode, setRegistrationCode] = useState(
    DEFAULT_TEST_REGISTRATION_CODE,
  );
  const [deviceLabel, setDeviceLabel] = useState(DEFAULT_TEST_DEVICE_LABEL);
  const [submitting, setSubmitting] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [justRegistered, setJustRegistered] = useState(false);
  const [provisioningError, setProvisioningError] = useState<string | null>(
    null,
  );
  const [refreshSeed, setRefreshSeed] = useState(0);

  useEffect(() => {
    let cancelled = false;

    setReady(false);
    initializeDriverIdentity()
      .catch((error: unknown) => {
        if (!cancelled) {
          setProvisioningError(
            toErrorMessage(error, "裝置初始化失敗，請稍後再試。"),
          );
        }
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

  useEffect(() => {
    if (!justRegistered || !isDriverIdentityProvisioned()) {
      return;
    }

    const timer = setTimeout(() => {
      router.replace("/");
    }, 900);

    return () => {
      clearTimeout(timer);
    };
  }, [justRegistered, refreshSeed, router]);

  const identityIssue = getDriverIdentityIssue();
  const provisioned = ready && isDriverIdentityProvisioned();
  const activeIssue = provisioningError ?? identityIssue;
  const emptyReason = useMemo(
    () => classifyProvisioningReason(activeIssue, registered),
    [activeIssue, registered],
  );
  const stateSpec = useMemo(
    () => buildStateSpec(emptyReason, activeIssue),
    [activeIssue, emptyReason],
  );

  const statusTiles = useMemo<ReadonlyArray<StatusTile>>(
    () => [
      {
        label: "Device",
        value: registered ? "registered" : "blocked",
        detail: registered
          ? "registration code 已提交，等待 identity snapshot 完成。"
          : "未註冊裝置不能進入任何工作頁或 tab bar。",
        tone: registered ? "success" : "warn",
      },
      {
        label: "Identity",
        value:
          emptyReason === "permission_denied" ||
          emptyReason === "driver_not_eligible"
            ? "attention"
            : activeIssue
              ? "sync issue"
              : "pending",
        detail: activeIssue
          ? activeIssue
          : "完成綁定後才會拿到司機身份與功能能力快照。",
        tone:
          emptyReason === "permission_denied" ||
          emptyReason === "driver_not_eligible"
            ? "danger"
            : activeIssue
              ? "warn"
              : "info",
      },
      {
        label: "Platform",
        value:
          emptyReason === "external_unavailable"
            ? "degraded"
            : provisioned
              ? "handoff"
              : "locked",
        detail:
          emptyReason === "external_unavailable"
            ? "外部平台同步異常，需由控制台處理恢復。"
            : "onboarding 未完成前不提供 cross-app work tabs。",
        tone:
          emptyReason === "external_unavailable"
            ? "warn"
            : provisioned
              ? "success"
              : "accent",
      },
    ],
    [activeIssue, emptyReason, provisioned, registered],
  );

  const handleRefresh = () => {
    setProvisioningError(null);
    setRegistered(false);
    setJustRegistered(false);
    setRefreshSeed((current) => current + 1);
  };

  const handleReinitializeIdentity = async () => {
    setProvisioningError(null);
    setReady(false);
    try {
      await initializeDriverIdentity();
    } catch (error: unknown) {
      setProvisioningError(
        toErrorMessage(error, "身份重新初始化失敗，請稍後再試。"),
      );
    } finally {
      setReady(true);
      setRefreshSeed((current) => current + 1);
    }
  };

  const availableActions = useMemo<ReadonlyArray<ActionModel>>(() => {
    const actions: ActionModel[] = [
      {
        id: "register_device",
        action: "register_device",
        title: "註冊此裝置",
        description:
          "寫入 fleet registration code，建立 device-bound session。",
        iconName: "key-outline",
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
      {
        id: "refresh_provisioning",
        action: "refresh_provisioning",
        title: "重新檢查連線",
        description: "手動 refresh 目前的 identity 與 provisioning snapshot。",
        iconName: "refresh-outline",
        enabled: !submitting,
        riskLevel: "low",
      },
    ];

    if (emptyReason !== "not_provisioned") {
      actions.push({
        id: "reinitialize_identity",
        action: "reinitialize_identity",
        title: "重新初始化身份",
        description: "重新載入 refresh session 與身份能力快照。",
        iconName: "sync-outline",
        enabled: !submitting,
        riskLevel: "medium",
      });
    }

    return actions;
  }, [emptyReason, registrationCode, submitting]);

  const primaryAction = availableActions.find(
    (action) => action.id === "register_device",
  );

  const handleRegister = async () => {
    if (!primaryAction?.enabled) {
      return;
    }

    setSubmitting(true);
    setProvisioningError(null);
    setJustRegistered(false);

    try {
      await registerDriverDevice(registrationCode.trim(), deviceLabel.trim());
      setRegistered(true);
      await initializeDriverIdentity();
      setJustRegistered(true);
      setRefreshSeed((current) => current + 1);
    } catch (error: unknown) {
      setRegistered(false);
      setProvisioningError(toErrorMessage(error, "裝置配置失敗，請稍後再試。"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleAction = (action: ActionModel) => {
    switch (action.id) {
      case "register_device":
        void handleRegister();
        return;
      case "refresh_provisioning":
        handleRefresh();
        return;
      case "reinitialize_identity":
        void handleReinitializeIdentity();
        return;
    }
  };

  if (!ready) {
    return <LoadingState label="正在檢查裝置配置…" />;
  }

  if (provisioned && !justRegistered) {
    return <Redirect href="/" />;
  }

  return (
    <Shell
      theme={THEME}
      footer={
        <View style={styles.footerBar}>
          <Text style={styles.footerNotice}>
            {driverStrings.onboarding.provisioningWarning}
          </Text>
          <View style={styles.footerActions}>
            <Btn
              theme={THEME}
              icon={
                <Ionicons
                  color={THEME.textMuted}
                  name="refresh-outline"
                  size={14}
                />
              }
              onPress={handleRefresh}
              variant="secondary"
            >
              重新檢查
            </Btn>
            <Btn
              theme={THEME}
              disabled={!primaryAction?.enabled}
              icon={<Ionicons color="#FFFFFF" name="key-outline" size={14} />}
              onPress={() => void handleRegister()}
              variant="primary"
            >
              {submitting ? "配置中…" : driverStrings.onboarding.registerDevice}
            </Btn>
          </View>
        </View>
      }
    >
      <View style={styles.heroCard}>
        <SectionEyebrow>Spec §5.2 · device provisioning</SectionEyebrow>
        <View style={styles.heroTitleRow}>
          <Text style={styles.heroTitle}>{driverStrings.onboarding.title}</Text>
          <Pill theme={THEME} tone={hasDriverDevOverride() ? "info" : "accent"}>
            {hasDriverDevOverride() ? "dev override" : "tab lock"}
          </Pill>
        </View>
        <Text style={styles.heroLead}>
          {driverStrings.onboarding.description}
        </Text>
        <Text style={styles.heroMeta}>
          activation flow first · workspace cockpit later · refresh tier{" "}
          {REFRESH_TIER}
        </Text>
        <Text style={styles.heroMetaMuted}>
          unlocks /, /jobs, /trip, /platform-presence, /settings, /shift,
          /earnings
        </Text>
      </View>

      {provisioningError ? (
        <Banner
          theme={THEME}
          tone="danger"
          icon={
            <Ionicons
              color={THEME.text}
              name="alert-circle-outline"
              size={18}
            />
          }
          title="註冊或同步失敗"
          body={provisioningError}
        />
      ) : null}

      {justRegistered && provisioned ? (
        <Banner
          theme={THEME}
          tone="success"
          icon={<ActivityIndicator color={THEME.text} size="small" />}
          title="已完成註冊，正在切換到工作台"
          body="brief transition to ready state，接著會導向 workspace cockpit。"
        />
      ) : null}

      <StatusStrip items={statusTiles} />
      <StateBanner spec={stateSpec} />
      <StepTimeline currentReason={emptyReason} />

      <Card theme={THEME} title="必要資料" subtitle="Required form fields">
        <ProvisioningInput
          autoCapitalize="none"
          editable={!submitting}
          helpText="車隊發放的 device registration code。"
          label={driverStrings.onboarding.registrationCodeLabel}
          mono
          onChangeText={setRegistrationCode}
          placeholder={driverStrings.onboarding.registrationCodePlaceholder}
          value={registrationCode}
        />
        <ProvisioningInput
          editable={!submitting}
          helpText="選填，方便平台與營運端辨識此裝置。"
          label={driverStrings.onboarding.deviceNameLabel}
          onChangeText={setDeviceLabel}
          placeholder={driverStrings.onboarding.deviceNamePlaceholder}
          value={deviceLabel}
        />
      </Card>

      <AvailableActionsCard actions={availableActions} />
      <View style={styles.inlineActionWrap}>
        {availableActions
          .filter((action) => action.id !== "register_device")
          .map((action) => (
            <Btn
              key={`run-${action.id}`}
              theme={THEME}
              disabled={!action.enabled}
              icon={
                <Ionicons
                  color={action.enabled ? THEME.text : THEME.textMuted}
                  name={action.iconName}
                  size={14}
                />
              }
              onPress={() => handleAction(action)}
              variant="secondary"
            >
              {action.title}
            </Btn>
          ))}
      </View>
    </Shell>
  );
}

const styles = StyleSheet.create({
  loadingShellContent: {
    flexGrow: 1,
    justifyContent: "center",
  },
  loadingState: {
    alignItems: "center",
    gap: 18,
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  loadingMark: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: THEME.accentBg,
    borderWidth: 1,
    borderColor: THEME.accentBorder,
  },
  loadingMarkLabel: {
    color: THEME.accentHi,
    fontSize: 24,
    fontWeight: "700",
  },
  loadingLabel: {
    color: THEME.textMuted,
    fontSize: 15,
  },
  heroCard: {
    gap: 10,
    paddingBottom: 4,
  },
  sectionEyebrow: {
    color: THEME.accent,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  heroTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  heroTitle: {
    flex: 1,
    color: THEME.text,
    fontSize: 28,
    fontWeight: "700",
  },
  heroLead: {
    color: THEME.textMuted,
    fontSize: 14,
    lineHeight: 22,
  },
  heroMeta: {
    color: THEME.textMuted,
    fontSize: 12,
    textTransform: "uppercase",
  },
  heroMetaMuted: {
    color: THEME.textMuted,
    fontSize: 11,
    fontFamily: THEME.monoFamily,
    lineHeight: 16,
  },
  statusStrip: {
    gap: 10,
  },
  statusTile: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    gap: 10,
  },
  statusTileTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  statusLabel: {
    color: THEME.textMuted,
    fontSize: 11,
    textTransform: "uppercase",
  },
  statusDetail: {
    color: THEME.text,
    fontSize: 13,
    lineHeight: 20,
  },
  stepList: {
    gap: 14,
  },
  stepRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  stepDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  stepDotLabel: {
    fontSize: 12,
    fontWeight: "700",
  },
  stepCopy: {
    flex: 1,
    gap: 2,
    paddingTop: 3,
  },
  stepTitle: {
    color: THEME.text,
    fontSize: 14,
    fontWeight: "600",
  },
  stepDescription: {
    color: THEME.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  inputGroup: {
    gap: 8,
    marginBottom: 16,
  },
  inputLabel: {
    color: THEME.text,
    fontSize: 13,
    fontWeight: "600",
  },
  input: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: THEME.border,
    backgroundColor: THEME.surfaceLo,
    color: THEME.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  inputMono: {
    fontFamily: THEME.monoFamily,
  },
  inputHelp: {
    color: THEME.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  actionList: {
    gap: 10,
  },
  actionRow: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    gap: 12,
  },
  actionIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: THEME.neutralBg,
  },
  actionCopy: {
    flex: 1,
    gap: 4,
  },
  actionHeadline: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  actionTitle: {
    flex: 1,
    color: THEME.text,
    fontSize: 13,
    fontWeight: "600",
  },
  actionDescription: {
    color: THEME.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  actionMeta: {
    color: THEME.textMuted,
    fontSize: 11,
    fontFamily: THEME.monoFamily,
  },
  inlineActionWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  footerBar: {
    gap: 10,
  },
  footerNotice: {
    color: THEME.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  footerActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
});
