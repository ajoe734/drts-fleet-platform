import { useEffect, useState } from "react";
import { Redirect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import {
  Banner as CanvasBanner,
  Btn as CanvasBtn,
  Card as CanvasCard,
  DL as CanvasDL,
  Field as CanvasField,
  Input as CanvasInput,
  KPI as CanvasKpi,
  PageHeader as CanvasPageHeader,
  Pill as CanvasPill,
  Shell as CanvasShell,
  driverCanvasTheme,
} from "@/components/canvas-primitives";
import {
  getDriverClient,
  getDriverId,
  getDriverIdentityIssue,
  hasDriverDevOverride,
  initializeDriverIdentity,
  isDriverIdentityProvisioned,
  registerDriverDevice,
} from "@/lib/api-client";
import { driverActivationSteps, driverStrings } from "@/lib/strings";

type ActivationStep = (typeof driverActivationSteps)[number];

const ACTIVATION_STEPS: ReadonlyArray<ActivationStep> = driverActivationSteps;
const THEME = driverCanvasTheme;

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

function resolveWorkspaceIssue(flagsOk: boolean, identityOk: boolean): string {
  if (!identityOk && !flagsOk) {
    return "目前無法驗證司機身份，也無法取得工作台功能設定。請確認網路與登入狀態後重新檢查。";
  }

  if (!identityOk) {
    return (
      getDriverIdentityIssue() ??
      "目前無法驗證司機身份。請確認裝置綁定仍有效，或重新回到配置流程。"
    );
  }

  return "功能旗標服務暫時不可用。核心資料仍可能可讀，但部分入口會維持降級。";
}

function BrandMark() {
  return (
    <View style={[styles.brandMark, { backgroundColor: THEME.accent }]}>
      <Text style={styles.brandMarkLabel}>D</Text>
    </View>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <CanvasShell theme={THEME} contentContainerStyle={styles.loadingContent}>
      <View style={styles.loadingWrap}>
        <BrandMark />
        <CanvasCard theme={THEME} padding={20} style={styles.loadingCard}>
          <View style={styles.loadingCardBody}>
            <ActivityIndicator color={THEME.accent} size="large" />
            <Text
              style={[
                styles.loadingLabel,
                { color: THEME.textMuted, fontFamily: THEME.fontFamily },
              ]}
            >
              {label}
            </Text>
          </View>
        </CanvasCard>
      </View>
    </CanvasShell>
  );
}

function StepTimeline({ steps }: { steps: ReadonlyArray<ActivationStep> }) {
  return (
    <View style={styles.stepList}>
      {steps.map((step, index) => {
        const active = step.state === "active";
        const isLast = index === steps.length - 1;

        return (
          <View
            key={step.title}
            style={[styles.stepRow, isLast ? styles.stepRowLast : null]}
          >
            <View style={styles.stepIndicatorColumn}>
              <View
                style={[
                  styles.stepIndicator,
                  {
                    backgroundColor: active ? THEME.accent : THEME.surfaceLo,
                    borderColor: active ? THEME.accent : THEME.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.stepIndicatorText,
                    { color: active ? "#FFFFFF" : THEME.textDim },
                  ]}
                >
                  {index + 1}
                </Text>
              </View>
              {isLast ? null : (
                <View
                  style={[
                    styles.stepConnector,
                    { backgroundColor: THEME.border },
                  ]}
                />
              )}
            </View>
            <View style={styles.stepBody}>
              <Text
                style={[
                  styles.stepTitle,
                  {
                    color: active ? THEME.text : THEME.textMuted,
                    fontFamily: THEME.fontFamily,
                  },
                ]}
              >
                {step.title}
              </Text>
              <Text
                style={[
                  styles.stepDescription,
                  { color: THEME.textDim, fontFamily: THEME.fontFamily },
                ]}
              >
                {step.description}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function RecoveryState({
  flagsOk,
  identityOk,
  workspaceIssue,
  registrationCode,
  deviceLabel,
  onRefresh,
  onContinue,
  onReinitializeIdentity,
}: {
  flagsOk: boolean;
  identityOk: boolean;
  workspaceIssue: string | null;
  registrationCode: string;
  deviceLabel: string;
  onRefresh: () => void;
  onContinue: () => void;
  onReinitializeIdentity: () => void;
}) {
  return (
    <CanvasShell theme={THEME} contentContainerStyle={styles.shellContent}>
      <CanvasPageHeader
        theme={THEME}
        title="工作台暫時降級"
        subtitle="身份或功能設定尚未完成同步"
      />

      <View style={styles.recoveryPillRow}>
        <CanvasPill theme={THEME} tone={identityOk ? "success" : "danger"} dot>
          {identityOk ? "身份正常" : "身份失敗"}
        </CanvasPill>
        <CanvasPill theme={THEME} tone={flagsOk ? "success" : "warn"} dot>
          {flagsOk ? "旗標正常" : "旗標降級"}
        </CanvasPill>
      </View>

      {workspaceIssue ? (
        <CanvasBanner
          theme={THEME}
          tone={identityOk ? "warn" : "danger"}
          icon={
            <Ionicons
              color={identityOk ? THEME.warn : THEME.danger}
              name={identityOk ? "warning-outline" : "cloud-offline-outline"}
              size={16}
            />
          }
          body={workspaceIssue}
        />
      ) : null}

      <View style={styles.kpiRow}>
        <CanvasKpi
          theme={THEME}
          label="身份驗證"
          value={identityOk ? "正常" : "待修復"}
          sub="駕駛綁定"
        />
        <CanvasKpi
          theme={THEME}
          label="功能旗標"
          value={flagsOk ? "正常" : "降級"}
          sub="入口配置"
        />
      </View>

      <CanvasCard
        theme={THEME}
        title="裝置狀態"
        subtitle="保留既有初始化與驗證流程；完成後可回到工作台。"
      >
        <CanvasDL
          theme={THEME}
          cols={2}
          items={[
            {
              label: "司機編號",
              value: getDriverId(),
              mono: true,
            },
            {
              label: "註冊代碼",
              value: registrationCode.trim() || "待輸入",
              mono: true,
            },
            {
              label: "裝置名稱",
              value: deviceLabel.trim() || "未命名裝置",
            },
            {
              label: "身份狀態",
              value: identityOk ? "可重新進入工作台" : "需重新初始化",
            },
          ]}
        />
      </CanvasCard>

      <View style={styles.actionStack}>
        <CanvasBtn
          theme={THEME}
          variant="primary"
          size="md"
          icon={<Ionicons color="#FFFFFF" name="refresh-outline" size={16} />}
          onPress={onRefresh}
          style={styles.fullWidthButton}
        >
          重新檢查連線
        </CanvasBtn>
        <CanvasBtn
          theme={THEME}
          variant="secondary"
          size="md"
          icon={
            <Ionicons
              color={THEME.text}
              name={identityOk ? "grid-outline" : "person-circle-outline"}
              size={16}
            />
          }
          onPress={identityOk ? onContinue : onReinitializeIdentity}
          style={styles.fullWidthButton}
        >
          {identityOk ? "進入工作台" : "重新初始化身份"}
        </CanvasBtn>
      </View>
    </CanvasShell>
  );
}

export default function OnboardingScreen() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [flagsOk, setFlagsOk] = useState<boolean | null>(null);
  const [identityOk, setIdentityOk] = useState<boolean | null>(null);
  const [registrationCode, setRegistrationCode] = useState(
    DEFAULT_TEST_REGISTRATION_CODE,
  );
  const [deviceLabel, setDeviceLabel] = useState(DEFAULT_TEST_DEVICE_LABEL);
  const [provisioningError, setProvisioningError] = useState<string | null>(
    null,
  );
  const [workspaceIssue, setWorkspaceIssue] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [refreshSeed, setRefreshSeed] = useState(0);

  useEffect(() => {
    let cancelled = false;

    void initializeDriverIdentity()
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        setProvisioningError(
          toErrorMessage(error, "裝置初始化失敗，請稍後再試。"),
        );
      })
      .finally(() => {
        if (cancelled) {
          return;
        }

        const identityIssue = getDriverIdentityIssue();
        if (identityIssue) {
          setProvisioningError(identityIssue);
        }
        setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const provisioned = ready && isDriverIdentityProvisioned();

  useEffect(() => {
    if (!provisioned) {
      return;
    }

    let cancelled = false;
    const client = getDriverClient();

    setFlagsOk(null);
    setIdentityOk(null);
    setWorkspaceIssue(null);

    void Promise.allSettled([
      client.getFeatureFlags(),
      client.getIdentityContext(),
    ])
      .then(([flagsResult, identityResult]) => {
        if (cancelled) {
          return;
        }

        const nextFlagsOk = flagsResult.status === "fulfilled";
        const nextIdentityOk = identityResult.status === "fulfilled";

        setFlagsOk(nextFlagsOk);
        setIdentityOk(nextIdentityOk);

        if (!nextFlagsOk || !nextIdentityOk) {
          setWorkspaceIssue(resolveWorkspaceIssue(nextFlagsOk, nextIdentityOk));
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        console.error("Error during onboarding data fetch:", error);
        setFlagsOk(false);
        setIdentityOk(false);
        setWorkspaceIssue(
          toErrorMessage(error, resolveWorkspaceIssue(false, false)),
        );
      });

    return () => {
      cancelled = true;
    };
  }, [provisioned, refreshSeed]);

  const handleRegister = async () => {
    const normalizedCode = registrationCode.trim();
    if (!normalizedCode) {
      setProvisioningError("請輸入裝置註冊碼。");
      return;
    }

    setSubmitting(true);
    setProvisioningError(null);

    try {
      await registerDriverDevice(normalizedCode, deviceLabel);
      setFlagsOk(null);
      setIdentityOk(null);
      setWorkspaceIssue(null);
    } catch (error: unknown) {
      setProvisioningError(toErrorMessage(error, "裝置配置失敗，請稍後再試。"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReinitializeIdentity = () => {
    setReady(false);
    setProvisioningError(null);
    setWorkspaceIssue(null);

    setTimeout(() => {
      void initializeDriverIdentity()
        .catch((error: unknown) => {
          setProvisioningError(
            toErrorMessage(error, "無法重新初始化裝置身份。"),
          );
        })
        .finally(() => setReady(true));
    }, 0);
  };

  if (!ready) {
    return <LoadingState label="正在檢查裝置配置…" />;
  }

  if (!provisioned) {
    return (
      <CanvasShell theme={THEME} contentContainerStyle={styles.shellContent}>
        <View style={styles.heroPanel}>
          <View
            pointerEvents="none"
            style={[
              styles.heroGlow,
              { backgroundColor: THEME.accentBg, borderColor: THEME.accent },
            ]}
          />
          <CanvasPageHeader
            theme={THEME}
            title={
              <View style={styles.heroTitleBlock}>
                <BrandMark />
                <Text
                  style={[
                    styles.heroTitle,
                    { color: THEME.text, fontFamily: THEME.fontFamily },
                  ]}
                >
                  {driverStrings.onboarding.title}
                </Text>
              </View>
            }
            subtitle={driverStrings.onboarding.description}
            actions={
              hasDriverDevOverride() ? (
                <CanvasPill theme={THEME} tone="info">
                  開發覆寫
                </CanvasPill>
              ) : undefined
            }
          />
        </View>

        <View style={styles.stepsSection}>
          <StepTimeline steps={ACTIVATION_STEPS} />
        </View>

        <CanvasCard theme={THEME} padding={16}>
          {provisioningError ? (
            <View style={styles.formBanner}>
              <CanvasBanner
                theme={THEME}
                tone="danger"
                icon={
                  <Ionicons
                    color={THEME.danger}
                    name="alert-circle-outline"
                    size={16}
                  />
                }
                body={provisioningError}
              />
            </View>
          ) : null}

          <CanvasField
            theme={THEME}
            label={driverStrings.onboarding.registrationCodeLabel}
            required
          >
            <CanvasInput
              theme={THEME}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!submitting}
              mono
              onChangeText={setRegistrationCode}
              ph={driverStrings.onboarding.registrationCodePlaceholder}
              value={registrationCode}
            />
          </CanvasField>

          <CanvasField
            theme={THEME}
            label={driverStrings.onboarding.deviceNameLabel}
          >
            <CanvasInput
              theme={THEME}
              editable={!submitting}
              onChangeText={setDeviceLabel}
              ph={driverStrings.onboarding.deviceNamePlaceholder}
              value={deviceLabel}
            />
          </CanvasField>

          <CanvasBtn
            theme={THEME}
            variant="primary"
            size="md"
            disabled={submitting}
            icon={
              <Ionicons
                color="#FFFFFF"
                name="shield-checkmark-outline"
                size={16}
              />
            }
            onPress={() => {
              void handleRegister();
            }}
            style={styles.fullWidthButton}
          >
            {submitting
              ? driverStrings.onboarding.registerDeviceLoading
              : driverStrings.onboarding.registerDevice}
          </CanvasBtn>
        </CanvasCard>

        <CanvasBanner
          theme={THEME}
          tone="warn"
          icon={
            <Ionicons color={THEME.warn} name="lock-closed-outline" size={15} />
          }
          body={driverStrings.onboarding.provisioningWarning}
        />
      </CanvasShell>
    );
  }

  if (flagsOk === null || identityOk === null) {
    return <LoadingState label="正在初始化司機工作台…" />;
  }

  if (!flagsOk || !identityOk) {
    return (
      <RecoveryState
        deviceLabel={deviceLabel}
        flagsOk={flagsOk}
        identityOk={identityOk}
        onContinue={() => router.replace("/")}
        onRefresh={() => setRefreshSeed((current) => current + 1)}
        onReinitializeIdentity={handleReinitializeIdentity}
        registrationCode={registrationCode}
        workspaceIssue={workspaceIssue}
      />
    );
  }

  return <Redirect href="/" />;
}

const styles = StyleSheet.create({
  shellContent: {
    gap: 20,
    paddingBottom: 32,
  },
  heroPanel: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 20,
  },
  heroGlow: {
    position: "absolute",
    top: -64,
    right: -40,
    width: 188,
    height: 188,
    borderRadius: 94,
    opacity: 0.92,
    borderWidth: 1,
  },
  heroTitleBlock: {
    gap: 18,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.4,
    lineHeight: 28,
  },
  brandMark: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 4,
  },
  brandMarkLabel: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  stepsSection: {
    paddingTop: 4,
    paddingHorizontal: 2,
  },
  stepList: {
    gap: 0,
  },
  stepRow: {
    flexDirection: "row",
    gap: 14,
    paddingBottom: 16,
  },
  stepRowLast: {
    paddingBottom: 0,
  },
  stepIndicatorColumn: {
    width: 28,
    alignItems: "center",
  },
  stepIndicator: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  stepIndicatorText: {
    fontSize: 11,
    fontWeight: "700",
  },
  stepConnector: {
    width: 1.5,
    flex: 1,
    minHeight: 20,
    marginTop: 4,
  },
  stepBody: {
    flex: 1,
    paddingTop: 3,
  },
  stepTitle: {
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 18,
  },
  stepDescription: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 2,
  },
  formBanner: {
    marginBottom: 12,
  },
  fullWidthButton: {
    width: "100%",
    minHeight: 44,
    borderRadius: 10,
  },
  loadingContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingBottom: 80,
  },
  loadingWrap: {
    alignItems: "center",
    gap: 18,
  },
  loadingCard: {
    width: "100%",
  },
  loadingCardBody: {
    alignItems: "center",
    gap: 12,
  },
  loadingLabel: {
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: "center",
  },
  recoveryPillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  kpiRow: {
    flexDirection: "row",
    gap: 10,
  },
  actionStack: {
    gap: 10,
  },
});
