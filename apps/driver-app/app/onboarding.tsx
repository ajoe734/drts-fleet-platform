import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import {
  ActionButton,
  AppScreen,
  ErrorBanner,
  FormField,
  ListCard,
  PageHeader,
  StatusChip,
  tokens,
} from "@/components/ui";
import {
  getDriverClient,
  getDriverIdentityIssue,
  hasDriverDevOverride,
  initializeDriverIdentity,
  isDriverIdentityProvisioned,
  registerDriverDevice,
} from "@/lib/api-client";

type WorkspaceRoute =
  | "/jobs"
  | "/trip"
  | "/platform-presence"
  | "/earnings"
  | "/shift";

const WORKSPACE_ACTIONS: ReadonlyArray<{
  title: string;
  subtitle: string;
  route: WorkspaceRoute;
  tone: "success" | "info";
}> = [
  {
    title: "任務收件匣",
    subtitle: "查看已指派任務、平台來源與派單狀態",
    route: "/jobs",
    tone: "success",
  },
  {
    title: "行程作業",
    subtitle: "進入目前行程，處理接單、載客與完單流程",
    route: "/trip",
    tone: "info",
  },
  {
    title: "平台上線狀態",
    subtitle: "管理各平台上線、令牌到期與重新驗證",
    route: "/platform-presence",
    tone: "info",
  },
  {
    title: "收益儀表板",
    subtitle: "依平台檢視今日與累計收益摘要",
    route: "/earnings",
    tone: "info",
  },
  {
    title: "班次與出勤",
    subtitle: "追蹤排班、出勤與當前班次狀態",
    route: "/shift",
    tone: "info",
  },
] as const;

function LoadingState({ label }: { label: string }) {
  return (
    <AppScreen scrollable={false}>
      <View style={styles.loadingState}>
        <ActivityIndicator color={tokens.colors.primary} size="large" />
        <Text style={styles.loadingLabel}>{label}</Text>
      </View>
    </AppScreen>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {description ? (
        <Text style={styles.sectionDescription}>{description}</Text>
      ) : null}
      {children}
    </View>
  );
}

function StatusStrip({
  items,
}: {
  items: ReadonlyArray<{
    label: string;
    value: string;
    variant: "default" | "success" | "warning" | "danger" | "info";
  }>;
}) {
  return (
    <View style={styles.statusStrip}>
      {items.map((item) => (
        <View key={item.label} style={styles.statusTile}>
          <Text style={styles.statusTileLabel}>{item.label}</Text>
          <StatusChip label={item.value} variant={item.variant} />
        </View>
      ))}
    </View>
  );
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

export default function OnboardingScreen() {
  const [ready, setReady] = useState(false);
  const [flagsOk, setFlagsOk] = useState<boolean | null>(null);
  const [identityOk, setIdentityOk] = useState<boolean | null>(null);
  const [registrationCode, setRegistrationCode] = useState("");
  const [deviceLabel, setDeviceLabel] = useState("");
  const [provisioningError, setProvisioningError] = useState<string | null>(
    null,
  );
  const [workspaceIssue, setWorkspaceIssue] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [refreshSeed, setRefreshSeed] = useState(0);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

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

    Promise.allSettled([client.getFeatureFlags(), client.getIdentityContext()])
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
      .catch(() => {
        if (cancelled) {
          return;
        }

        setFlagsOk(false);
        setIdentityOk(false);
        setWorkspaceIssue(resolveWorkspaceIssue(false, false));
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
    } catch (error) {
      setProvisioningError(
        error instanceof Error ? error.message : "裝置配置失敗，請稍後再試。",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleReinitializeIdentity = () => {
    setReady(false);
    setProvisioningError(null);

    setTimeout(() => {
      void initializeDriverIdentity()
        .catch((error: unknown) => {
          setProvisioningError(
            error instanceof Error ? error.message : "無法重新初始化裝置身份。",
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
      <AppScreen contentContainerStyle={styles.screenContent}>
        <PageHeader
          title="裝置配置"
          subtitle="完成註冊後才會載入正式工作台"
          rightElement={<StatusChip label="待配置" variant="warning" />}
        />

        <StatusStrip
          items={[
            { label: "裝置", value: "待綁定", variant: "warning" },
            {
              label: "身份",
              value: hasDriverDevOverride() ? "開發覆寫" : "未就緒",
              variant: hasDriverDevOverride() ? "info" : "danger",
            },
            { label: "平台", value: "未開放", variant: "default" },
          ]}
        />

        <Section
          title="輸入註冊資料"
          description="請使用管理人員提供的註冊碼綁定此裝置。完成後會自動進入多平台工作站。"
        >
          {provisioningError ? (
            <ErrorBanner message={provisioningError} />
          ) : null}
          <FormField
            autoCapitalize="none"
            autoCorrect={false}
            editable={!submitting}
            label="註冊碼"
            onChangeText={setRegistrationCode}
            placeholder="請輸入註冊碼"
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
          <ActionButton
            icon="shield-checkmark-outline"
            loading={submitting}
            onPress={() => {
              void handleRegister();
            }}
            title={submitting ? "配置中…" : "註冊此裝置"}
          />
        </Section>

        <Section
          title="安全說明"
          description="未配置的裝置不會直接進入任務與行程頁，避免把 demo 入口誤當正式工作流程。"
        >
          <ListCard
            meta="正式環境應由後端裝置綁定流程提供會話。"
            subtitle="開發環境可用 EXPO_PUBLIC_DRIVER_ID 明確覆寫司機身份。"
            title={
              hasDriverDevOverride() ? "已偵測到開發覆寫" : "目前未使用開發覆寫"
            }
            statusElement={
              <StatusChip
                label={hasDriverDevOverride() ? "DEV OVERRIDE" : "正式流程"}
                variant={hasDriverDevOverride() ? "info" : "default"}
              />
            }
          />
        </Section>
      </AppScreen>
    );
  }

  if (flagsOk === null || identityOk === null) {
    return <LoadingState label="正在初始化司機工作台…" />;
  }

  if (!flagsOk || !identityOk) {
    return (
      <AppScreen contentContainerStyle={styles.screenContent}>
        <PageHeader
          title="工作台暫時降級"
          subtitle="身份或功能設定尚未完成同步"
          rightElement={<StatusChip label="需要恢復" variant="danger" />}
        />

        <StatusStrip
          items={[
            {
              label: "裝置",
              value: "已綁定",
              variant: "success",
            },
            {
              label: "身份",
              value: identityOk ? "正常" : "失敗",
              variant: identityOk ? "success" : "danger",
            },
            {
              label: "平台",
              value: flagsOk ? "已啟用" : "降級",
              variant: flagsOk ? "success" : "warning",
            },
          ]}
        />

        <Section
          title="恢復建議"
          description="這不是正常首頁；在核心設定同步前，不應把此狀態當成可交付工作站。"
        >
          {workspaceIssue ? <ErrorBanner message={workspaceIssue} /> : null}
          <ActionButton
            icon="refresh-outline"
            onPress={() => setRefreshSeed((current) => current + 1)}
            title="重新檢查連線"
          />
          <ActionButton
            icon={identityOk ? "list-outline" : "person-circle-outline"}
            onPress={() => {
              if (identityOk) {
                router.push("/jobs");
                return;
              }

              handleReinitializeIdentity();
            }}
            style={styles.secondaryAction}
            title={identityOk ? "先查看任務收件匣" : "重新初始化身份"}
            variant="secondary"
          />
        </Section>

        <Section title="檢查項目">
          <ListCard
            meta="失敗時會清除失效 session 並要求重新綁定。"
            title="司機身份驗證"
            statusElement={
              <StatusChip
                label={identityOk ? "正常" : "失敗"}
                variant={identityOk ? "success" : "danger"}
              />
            }
          />
          <ListCard
            meta="旗標服務暫時不可用時，部分入口需維持降級。"
            title="功能旗標服務"
            statusElement={
              <StatusChip
                label={flagsOk ? "正常" : "降級"}
                variant={flagsOk ? "success" : "warning"}
              />
            }
          />
        </Section>
      </AppScreen>
    );
  }

  return (
    <AppScreen contentContainerStyle={styles.screenContent}>
      <PageHeader
        title="工作台"
        subtitle="正式多平台作業入口"
        rightElement={<StatusChip label="已就緒" variant="success" />}
      />

      <StatusStrip
        items={[
          { label: "裝置", value: "已綁定", variant: "success" },
          { label: "身份", value: "已驗證", variant: "success" },
          { label: "平台", value: "已啟用", variant: "success" },
        ]}
      />

      <Section
        title="快速進入工作"
        description="從單一入口切換任務、行程、平台、收益與班次，不再依賴藍色文字連結或原始 route header。"
      >
        {WORKSPACE_ACTIONS.map((action) => (
          <ListCard
            key={action.route}
            meta="點擊後進入對應工作區"
            onPress={() => router.push(action.route)}
            statusElement={
              <StatusChip
                label={action.tone === "success" ? "主要入口" : "工作區"}
                variant={action.tone}
              />
            }
            subtitle={action.subtitle}
            title={action.title}
          />
        ))}
      </Section>

      <Section title="下一步與狀態">
        <ListCard
          meta="班前檢查完成後，優先確認是否有待接受或進行中的任務。"
          subtitle="如有指派任務，直接進入任務收件匣或行程作業。"
          title="建議先確認今日任務與平台連線"
          statusElement={<StatusChip label="建議動作" variant="info" />}
        />
        <ActionButton
          icon="briefcase-outline"
          onPress={() => router.push("/jobs")}
          title="開啟任務收件匣"
        />
      </Section>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    paddingTop: tokens.spacing[16],
    gap: tokens.spacing[16],
  },
  loadingState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: tokens.spacing[24],
  },
  loadingLabel: {
    ...tokens.type.body,
    color: tokens.colors.textBody,
    marginTop: tokens.spacing[12],
    textAlign: "center",
  },
  statusStrip: {
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing[16],
    gap: tokens.spacing[12],
  },
  statusTile: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: tokens.spacing[12],
  },
  statusTileLabel: {
    ...tokens.type.label,
    color: tokens.colors.textBody,
    flex: 1,
  },
  section: {
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing[16],
  },
  sectionTitle: {
    ...tokens.type.sectionTitle,
    color: tokens.colors.textStrong,
  },
  sectionDescription: {
    ...tokens.type.body,
    color: tokens.colors.textBody,
    marginTop: tokens.spacing[8],
    marginBottom: tokens.spacing[16],
  },
  secondaryAction: {
    marginTop: tokens.spacing[12],
  },
});
