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
import { driverStrings } from "@/lib/strings";

type ProvisioningActionId =
  | "register_device"
  | "refresh_provisioning"
  | "reinitialize_identity";

type ActionModel = ResourceActionDescriptor & {
  id: ProvisioningActionId;
  title: string;
  description: string;
  helper: string;
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

type ActivationStep = {
  title: string;
  code: string;
  detail: string;
  tone: CanvasTone;
};

type RouteGate = {
  route: string;
  label: string;
  detail: string;
};

const THEME = driverCanvasTheme;
const REFRESH_TIER: RefreshTier = "manual";

const DEFAULT_TEST_REGISTRATION_CODE =
  process.env.EXPO_PUBLIC_DRIVER_TEST_REGISTRATION_CODE ?? "driver-demo-001";
const DEFAULT_TEST_DEVICE_LABEL =
  process.env.EXPO_PUBLIC_DRIVER_TEST_DEVICE_LABEL ?? "Driver Pixel 01";

const ROUTE_GATES: ReadonlyArray<RouteGate> = [
  { route: "/", label: "工作台", detail: "workspace cockpit / ready state" },
  { route: "/jobs", label: "任務", detail: "unified task inbox" },
  { route: "/trip", label: "行程", detail: "trip execution workspace" },
  {
    route: "/platform-presence",
    label: "平台",
    detail: "platform health and re-auth",
  },
  { route: "/settings", label: "設定", detail: "profile and binding settings" },
];

function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return fallback;
}

function humanizeCode(value?: string) {
  if (!value) {
    return null;
  }

  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function classifyProvisioningReason(
  issue: string | null,
  deviceRegistered: boolean,
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

  if (deviceRegistered) {
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
        badge: "permission_denied",
        iconName: "ban-outline",
      };
    case "fetch_failed":
      return {
        reason,
        tone: "warn",
        title: "初始化失敗，尚未拿到配置快照",
        body:
          issue ??
          "裝置暫時無法同步身份與配置資料。請先 refresh，再決定是否重新初始化身份。",
        badge: "fetch_failed",
        iconName: "cloud-offline-outline",
      };
    case "external_unavailable":
      return {
        reason,
        tone: "warn",
        title: "外部平台暫時不可用",
        body:
          issue ??
          "device 綁定已完成，但平台或 adapter 降級，工作台能力會受限直到同步恢復。",
        badge: "external_unavailable",
        iconName: "radio-outline",
      };
    case "driver_not_eligible":
      return {
        reason,
        tone: "danger",
        title: "目前不符合接單資格",
        body:
          issue ??
          "司機尚未進入可接單 bucket，工作頁會維持鎖定，直到資格條件恢復。",
        badge: "driver_not_eligible",
        iconName: "shield-outline",
      };
    case "no_data":
      return {
        reason,
        tone: "success",
        title: "裝置已註冊，正在接手工作台",
        body: "註冊資料已寫入，接下來完成身份與平台同步後就會進入 workspace cockpit。",
        badge: "handoff_pending",
        iconName: "checkmark-circle-outline",
      };
    case "not_provisioned":
    default:
      return {
        reason: "not_provisioned",
        tone: "accent",
        title: "新裝置尚未啟用，tab bar 仍完全隱藏",
        body: "未綁定裝置不能進入任何工作頁。請使用車隊發放的註冊碼完成啟用。",
        badge: "tab_lock_active",
        iconName: "lock-closed-outline",
      };
  }
}

function buildStatusTiles(
  reason: EmptyReason,
  issue: string | null,
  deviceRegistered: boolean,
  provisioned: boolean,
): ReadonlyArray<StatusTile> {
  return [
    {
      label: "Device",
      value: provisioned || deviceRegistered ? "registered" : "blocked",
      detail:
        provisioned || deviceRegistered
          ? "裝置綁定資料已建立，正在等待 workspace-ready handoff。"
          : "未註冊裝置不能進入 tab bar 或任何工作頁。",
      tone: provisioned || deviceRegistered ? "success" : "warn",
    },
    {
      label: "Identity",
      value:
        reason === "permission_denied" || reason === "driver_not_eligible"
          ? "blocked"
          : issue
            ? "sync issue"
            : provisioned
              ? "ready"
              : "pending",
      detail:
        issue ??
        (provisioned
          ? "司機身份快照已完成，後續由首頁 cockpit 接手。"
          : "完成綁定後才會取得司機身份與能力快照。"),
      tone:
        reason === "permission_denied" || reason === "driver_not_eligible"
          ? "danger"
          : issue
            ? "warn"
            : provisioned
              ? "success"
              : "info",
    },
    {
      label: "Platform",
      value:
        reason === "external_unavailable"
          ? "degraded"
          : provisioned
            ? "ready"
            : "locked",
      detail:
        reason === "external_unavailable"
          ? "adapter / platform sync degraded，需要稍後重試。"
          : "onboarding 完成前不顯示 `/jobs`、`/trip`、`/settings` 等 route。",
      tone:
        reason === "external_unavailable"
          ? "warn"
          : provisioned
            ? "success"
            : "accent",
    },
  ];
}

function buildActivationSteps(
  reason: EmptyReason,
  deviceRegistered: boolean,
  provisioned: boolean,
  submitting: boolean,
): ReadonlyArray<ActivationStep> {
  return [
    {
      title: "裝置註冊",
      code: "device.register",
      detail:
        provisioned || deviceRegistered
          ? "registration code 已寫入並綁定至本機。"
          : submitting
            ? "正在提交註冊碼與裝置名稱。"
            : "用車隊發放的 registration code 產生 device-bound session。",
      tone: provisioned || deviceRegistered ? "success" : "accent",
    },
    {
      title: "駕駛身份驗證",
      code: "driver.verify",
      detail:
        reason === "permission_denied"
          ? "身份被停權、退役或證件無效。"
          : reason === "driver_not_eligible"
            ? "身份存在，但目前不符合接單資格。"
            : provisioned
              ? "司機身份與 capability snapshot 已可用。"
              : deviceRegistered
                ? "正在刷新身份與功能能力快照。"
                : "註冊後會綁定司機身份並驗證可接單資格。",
      tone:
        reason === "permission_denied" || reason === "driver_not_eligible"
          ? "danger"
          : provisioned
            ? "success"
            : deviceRegistered
              ? "accent"
              : "neutral",
    },
    {
      title: "平台帳號連線",
      code: "platform.bind",
      detail:
        reason === "external_unavailable"
          ? "平台授權或 adapter 目前降級，先維持受限狀態。"
          : provisioned
            ? "工作台會在 ready state 顯示每個平台的健康與 re-auth 狀態。"
            : "成功 handoff 後才會顯示平台健康與 re-auth 能力。",
      tone:
        reason === "external_unavailable"
          ? "warn"
          : provisioned
            ? "success"
            : "neutral",
    },
  ];
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

function StepTimeline({ steps }: { steps: ReadonlyArray<ActivationStep> }) {
  return (
    <Card
      theme={THEME}
      title="啟用流程"
      subtitle="Activation, identity, platform"
    >
      <View style={styles.stepList}>
        {steps.map((step, index) => {
          const toneSet =
            step.tone === "success"
              ? {
                  bg: THEME.successBg,
                  border: THEME.successBorder,
                  fg: THEME.success,
                }
              : step.tone === "accent"
                ? {
                    bg: THEME.accentBg,
                    border: THEME.accentBorder,
                    fg: THEME.accent,
                  }
                : step.tone === "danger"
                  ? {
                      bg: THEME.dangerBg,
                      border: THEME.dangerBorder,
                      fg: THEME.danger,
                    }
                  : step.tone === "warn"
                    ? {
                        bg: THEME.warnBg,
                        border: THEME.warnBorder,
                        fg: THEME.warn,
                      }
                    : {
                        bg: THEME.neutralBg,
                        border: THEME.neutralBorder,
                        fg: THEME.textMuted,
                      };

          return (
            <View key={step.code} style={styles.stepRow}>
              <View style={styles.stepRail}>
                <View
                  style={[
                    styles.stepDot,
                    {
                      backgroundColor: toneSet.bg,
                      borderColor: toneSet.border,
                    },
                  ]}
                >
                  <Text style={[styles.stepDotLabel, { color: toneSet.fg }]}>
                    {index + 1}
                  </Text>
                </View>
                {index < steps.length - 1 ? (
                  <View style={styles.stepConnector} />
                ) : null}
              </View>
              <View style={styles.stepCopy}>
                <View style={styles.stepHeadline}>
                  <Text style={styles.stepTitle}>{step.title}</Text>
                  <Text style={styles.stepCode}>{step.code}</Text>
                </View>
                <Text style={styles.stepDescription}>{step.detail}</Text>
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
      subtitle="CTAs are driven by availableActions, not route hard-code"
    >
      <View style={styles.actionList}>
        {actions.map((action) => {
          const reason = humanizeCode(action.disabledReasonCode);
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
                <Text style={styles.actionHelper}>{action.helper}</Text>
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

function RouteGateCard() {
  return (
    <Card
      theme={THEME}
      title="Sitemap gate"
      subtitle="Provisioning unlocks the ready-state routes below"
    >
      <View style={styles.routeGateList}>
        {ROUTE_GATES.map((item) => (
          <View
            key={item.route}
            style={[
              styles.routeGateRow,
              {
                backgroundColor: THEME.surfaceLo,
                borderColor: THEME.border,
              },
            ]}
          >
            <View style={styles.routeGateCopy}>
              <Text style={styles.routeGateLabel}>{item.label}</Text>
              <Text style={styles.routeGateDetail}>{item.detail}</Text>
            </View>
            <Text style={styles.routeGatePath}>{item.route}</Text>
          </View>
        ))}
      </View>
      <View
        style={[
          styles.contractNote,
          {
            backgroundColor: THEME.neutralBg,
            borderColor: THEME.neutralBorder,
          },
        ]}
      >
        <Text style={styles.contractTitle}>Cross-app deep links</Text>
        <Text style={styles.contractBody}>
          driver-app → none for now. Onboarding 只說明 app-internal route gate，
          不提供 web apps deep link。
        </Text>
      </View>
    </Card>
  );
}

function ContractCard() {
  return (
    <Card
      theme={THEME}
      title="Runtime contract"
      subtitle="Packet behaviour, canvas visual"
    >
      <View style={styles.contractStack}>
        <View
          style={[
            styles.contractNote,
            {
              backgroundColor: THEME.surfaceLo,
              borderColor: THEME.border,
            },
          ]}
        >
          <Text style={styles.contractTitle}>Refresh tier</Text>
          <Text style={styles.contractBody}>
            onboarding 是 form-first route；UI 仍提供 manual refresh 來重新抓取
            identity / provisioning snapshot。
          </Text>
          <Text style={styles.contractMeta}>tier {REFRESH_TIER}</Text>
        </View>
        <View
          style={[
            styles.contractNote,
            {
              backgroundColor: THEME.surfaceLo,
              borderColor: THEME.border,
            },
          ]}
        >
          <Text style={styles.contractTitle}>Safety boundary</Text>
          <Text style={styles.contractBody}>
            未啟用裝置一律隱藏 tab bar，不能直接進 `/jobs`、`/trip`、`/settings`
            等工作頁。
          </Text>
          <Text style={styles.contractMeta}>spec §5.2 / packet §5.1.A</Text>
        </View>
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
  const [deviceRegistered, setDeviceRegistered] = useState(false);
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
  }, [justRegistered, router]);

  const identityIssue = getDriverIdentityIssue();
  const provisioned = ready && isDriverIdentityProvisioned();
  const activeIssue = provisioningError ?? identityIssue;
  const emptyReason = useMemo(
    () => classifyProvisioningReason(activeIssue, deviceRegistered),
    [activeIssue, deviceRegistered],
  );
  const stateSpec = useMemo(
    () => buildStateSpec(emptyReason, activeIssue),
    [activeIssue, emptyReason],
  );
  const statusTiles = useMemo(
    () =>
      buildStatusTiles(emptyReason, activeIssue, deviceRegistered, provisioned),
    [activeIssue, deviceRegistered, emptyReason, provisioned],
  );
  const activationSteps = useMemo(
    () =>
      buildActivationSteps(
        emptyReason,
        deviceRegistered,
        provisioned,
        submitting,
      ),
    [deviceRegistered, emptyReason, provisioned, submitting],
  );

  const availableActions = useMemo<ReadonlyArray<ActionModel>>(() => {
    const alreadyRegistered = deviceRegistered || provisioned || justRegistered;

    const actions: ActionModel[] = [
      {
        id: "register_device",
        action: "register_device",
        title: "註冊此裝置",
        description:
          "寫入 fleet registration code，建立 device-bound session。",
        helper: "Primary CTA for `/onboarding` unprovisioned state.",
        iconName: "shield-checkmark-outline",
        enabled:
          registrationCode.trim().length > 0 &&
          !submitting &&
          !alreadyRegistered &&
          emptyReason !== "permission_denied" &&
          emptyReason !== "driver_not_eligible",
        disabledReasonCode:
          registrationCode.trim().length === 0
            ? "registration_code_required"
            : submitting
              ? "submission_in_progress"
              : alreadyRegistered
                ? "device_already_registered"
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
        helper: "Safe to retry when snapshot is stale, degraded, or missing.",
        iconName: "refresh-outline",
        enabled: !submitting,
        riskLevel: "low",
      },
    ];

    if (deviceRegistered || activeIssue) {
      actions.push({
        id: "reinitialize_identity",
        action: "reinitialize_identity",
        title: "重新初始化身份",
        description: "重新載入 refresh session 與身份能力快照。",
        helper:
          "Used when device binding exists but the identity snapshot is not healthy.",
        iconName: "sync-outline",
        enabled: !submitting,
        riskLevel: "medium",
      });
    }

    return actions;
  }, [
    activeIssue,
    deviceRegistered,
    emptyReason,
    justRegistered,
    provisioned,
    registrationCode,
    submitting,
  ]);

  const primaryAction = availableActions.find(
    (action) => action.id === "register_device",
  );

  const handleRefresh = () => {
    setProvisioningError(null);
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

  const handleRegister = async () => {
    if (!primaryAction?.enabled) {
      return;
    }

    setSubmitting(true);
    setProvisioningError(null);
    setJustRegistered(false);

    try {
      await registerDriverDevice(registrationCode.trim(), deviceLabel.trim());
      setDeviceRegistered(true);
      await initializeDriverIdentity();
      setJustRegistered(true);
      setRefreshSeed((current) => current + 1);
    } catch (error: unknown) {
      setDeviceRegistered(false);
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
          {primaryAction?.disabledReasonCode ? (
            <Text style={styles.footerReason}>
              {humanizeCode(primaryAction.disabledReasonCode)}
            </Text>
          ) : null}
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
              icon={
                <Ionicons
                  color="#FFFFFF"
                  name="shield-checkmark-outline"
                  size={14}
                />
              }
              onPress={() => void handleRegister()}
              variant="primary"
            >
              {submitting
                ? driverStrings.onboarding.registerDeviceLoading
                : driverStrings.onboarding.registerDevice}
            </Btn>
          </View>
        </View>
      }
    >
      <View style={styles.heroCard}>
        <View style={styles.heroMark}>
          <Text style={styles.heroMarkLabel}>D</Text>
        </View>
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
        <View style={styles.heroMetaRow}>
          <Text style={styles.heroMeta}>
            activation flow first · refresh tier {REFRESH_TIER}
          </Text>
          <Text style={styles.heroMeta}>driver-app → no cross-app links</Text>
        </View>
        <Text style={styles.heroMetaMuted}>
          status strip required: device / identity / platform · route gate
          remains locked until ready
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
          body="brief handoff to ready state，接著會導向 workspace cockpit。"
        />
      ) : null}

      <StatusStrip items={statusTiles} />
      <StateBanner spec={stateSpec} />
      <StepTimeline steps={activationSteps} />

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
      <RouteGateCard />
      <ContractCard />

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
  heroMark: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: THEME.accent,
  },
  heroMarkLabel: {
    color: "#08111C",
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.5,
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
  heroMetaRow: {
    gap: 4,
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
  stepRail: {
    alignItems: "center",
  },
  stepConnector: {
    width: 1.5,
    flex: 1,
    minHeight: 18,
    marginTop: 4,
    backgroundColor: THEME.border,
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
    gap: 4,
    paddingTop: 3,
  },
  stepHeadline: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  stepTitle: {
    color: THEME.text,
    fontSize: 14,
    fontWeight: "600",
  },
  stepCode: {
    color: THEME.textMuted,
    fontSize: 10,
    fontFamily: THEME.monoFamily,
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
  actionHelper: {
    color: THEME.text,
    fontSize: 12,
    lineHeight: 18,
  },
  actionMeta: {
    color: THEME.textMuted,
    fontSize: 11,
    fontFamily: THEME.monoFamily,
  },
  routeGateList: {
    gap: 10,
    marginBottom: 12,
  },
  routeGateRow: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  routeGateCopy: {
    flex: 1,
    gap: 2,
  },
  routeGateLabel: {
    color: THEME.text,
    fontSize: 13,
    fontWeight: "600",
  },
  routeGateDetail: {
    color: THEME.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  routeGatePath: {
    color: THEME.accent,
    fontSize: 11,
    fontFamily: THEME.monoFamily,
  },
  contractStack: {
    gap: 10,
  },
  contractNote: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 6,
  },
  contractTitle: {
    color: THEME.text,
    fontSize: 13,
    fontWeight: "600",
  },
  contractBody: {
    color: THEME.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  contractMeta: {
    color: THEME.accent,
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
  footerReason: {
    color: THEME.warn,
    fontSize: 11,
    fontFamily: THEME.monoFamily,
  },
  footerActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
});
