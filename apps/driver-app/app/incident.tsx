import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { ActionButton } from "@/components/ui/ActionButton";
import { AppScreen } from "@/components/ui/AppScreen";
import { BottomActionBar } from "@/components/ui/BottomActionBar";
import { confirmDangerAction } from "@/components/ui/confirm-danger-action";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { FormField } from "@/components/ui/FormField";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusChip } from "@/components/ui/StatusChip";
import { Tokens } from "@/components/ui/tokens";
import { getDriverClient } from "@/lib/api-client";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return "SOS 送出失敗，請稍後再試。";
}

export default function IncidentScreen() {
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [incidentsEnabled, setIncidentsEnabled] = useState<boolean | null>(
    null,
  );
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const client = getDriverClient();
    client
      .isFeatureEnabled("driver-app.incidents")
      .then((enabled) => setIncidentsEnabled(enabled))
      .catch(() => setIncidentsEnabled(true));
  }, []);

  const handleBackToTrip = () => {
    if (submitting) {
      return;
    }

    router.replace("/trip");
  };

  const submitIncident = async () => {
    if (submitting) {
      return;
    }

    setSubmitting(true);
    setSubmissionError(null);
    const client = getDriverClient();
    try {
      const created = await client.createIncident({
        title: "司機 SOS 緊急通報",
        description: details.trim() || "已由司機 App 送出 SOS 緊急通報。",
        category: "safety",
        severity: "critical",
        reportedBy: "driver",
      });
      if (created?.incidentId) {
        await client.updateIncident(created.incidentId, {
          escalationTarget: "safety_officer",
        });
      }
      setDetails("");
      setSubmissionError(null);
      router.replace("/trip");
    } catch (error: unknown) {
      setSubmissionError(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitPress = () => {
    if (submitting) {
      return;
    }

    setSubmissionError(null);
    confirmDangerAction({
      title: "確認送出 SOS",
      message:
        "送出後，營運與安全主管會立即收到重大安全警示。若尚未準備好，請先取消並補充現場資訊。",
      confirmLabel: "確認送出",
      cancelLabel: "取消",
      onConfirm: () => {
        void submitIncident();
      },
    });
  };

  if (incidentsEnabled === null) {
    return (
      <AppScreen
        scrollable={false}
        backgroundColor={Tokens.colors.surfaceDanger}
      >
        <PageHeader
          title="SOS 緊急通報"
          subtitle="重大安全事件會立即升級給營運"
          rightElement={<StatusChip label="準備中" variant="info" />}
        />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Tokens.colors.primary} />
          <Text style={styles.loadingLabel}>載入 SOS 流程中…</Text>
        </View>
      </AppScreen>
    );
  }

  if (!incidentsEnabled) {
    return (
      <AppScreen
        scrollable={false}
        backgroundColor={Tokens.colors.surfaceDanger}
      >
        <PageHeader
          title="SOS 緊急通報"
          subtitle="重大安全事件會立即升級給營運"
          rightElement={<StatusChip label="未啟用" variant="warning" />}
        />
        <EmptyState
          title="SOS 緊急通報暫停提供"
          description="此功能目前未啟用，請返回行程或稍後再試。"
          icon="warning-outline"
          actionTitle="返回行程"
          onAction={handleBackToTrip}
          style={styles.fillState}
        />
      </AppScreen>
    );
  }

  return (
    <View style={styles.screen}>
      <AppScreen backgroundColor={Tokens.colors.surfaceDanger}>
        <PageHeader
          title="SOS 緊急通報"
          subtitle="重大安全事件會立即升級給營運"
          rightElement={<StatusChip label="高風險" variant="danger" />}
        />

        <View style={styles.content}>
          <View style={styles.heroCard}>
            <Text style={styles.heroEyebrow}>司機安全</Text>
            <Text style={styles.heroTitle}>重大安全通報</Text>
            <Text style={styles.heroBody}>
              按下送出後，系統會建立安全類別、重大等級事件，並立刻升級給安全主管優先處理。
            </Text>
          </View>

          {submissionError ? (
            <ErrorBanner message={`送出失敗：${submissionError}`} />
          ) : null}

          <View style={styles.noticeCard}>
            <Text style={styles.sectionTitle}>處理說明</Text>
            <Text style={styles.sectionBody}>
              若需補充目前位置、乘客狀況或即時風險，可先填寫以下欄位。送出前會再要求一次確認，取消不會建立事件。
            </Text>
          </View>

          <FormField
            label="補充說明（選填）"
            value={details}
            onChangeText={(value) => {
              setDetails(value);
              if (submissionError) {
                setSubmissionError(null);
              }
            }}
            placeholder="可補充目前位置、乘客狀況或即時風險…"
            multiline
            numberOfLines={5}
            editable={!submitting}
            style={styles.detailsInput}
            helpText="若留白，系統會送出預設 SOS 說明。"
          />

          <View style={styles.confirmationCard}>
            <Text style={styles.sectionTitle}>確認步驟</Text>
            <Text style={styles.sectionBody}>
              按下「送出
              SOS」後仍需再次確認。若情況已排除，可在確認視窗按「取消」返回本頁。
            </Text>
          </View>
        </View>
      </AppScreen>

      <BottomActionBar style={styles.actionBar}>
        <ActionButton
          title="返回行程"
          onPress={handleBackToTrip}
          variant="secondary"
          disabled={submitting}
          style={styles.secondaryAction}
        />
        <ActionButton
          title="送出 SOS"
          onPress={handleSubmitPress}
          variant="danger"
          icon="warning-outline"
          loading={submitting}
          style={styles.primaryAction}
        />
      </BottomActionBar>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Tokens.colors.surfaceDanger,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Tokens.spacing.xl,
  },
  fillState: {
    flex: 1,
  },
  loadingLabel: {
    ...Tokens.type.body,
    color: Tokens.colors.textBody,
    marginTop: Tokens.spacing.md,
  },
  content: {
    paddingVertical: Tokens.spacing.lg,
  },
  heroCard: {
    backgroundColor: "#8A0F19",
    borderRadius: Tokens.radius.md,
    padding: Tokens.spacing.xl,
    marginBottom: Tokens.spacing.lg,
  },
  heroEyebrow: {
    ...Tokens.type.label,
    color: "#FFD7DC",
    letterSpacing: 1,
    marginBottom: Tokens.spacing.xs,
  },
  heroTitle: {
    ...Tokens.type.screenTitle,
    color: Tokens.colors.textInverse,
    marginBottom: Tokens.spacing.sm,
  },
  heroBody: {
    ...Tokens.type.body,
    color: "#FFE9EC",
  },
  noticeCard: {
    backgroundColor: Tokens.colors.surface,
    borderRadius: Tokens.radius.md,
    borderWidth: 1,
    borderColor: "#F2C2C8",
    padding: Tokens.spacing.lg,
    marginBottom: Tokens.spacing.lg,
  },
  confirmationCard: {
    backgroundColor: Tokens.colors.surface,
    borderRadius: Tokens.radius.md,
    borderWidth: 1,
    borderColor: Tokens.colors.border,
    padding: Tokens.spacing.lg,
  },
  sectionTitle: {
    ...Tokens.type.sectionTitle,
    color: Tokens.colors.textStrong,
    marginBottom: Tokens.spacing.xs,
  },
  sectionBody: {
    ...Tokens.type.body,
    color: Tokens.colors.textBody,
  },
  detailsInput: {
    height: 120,
    paddingTop: Tokens.spacing.md,
    paddingBottom: Tokens.spacing.md,
    textAlignVertical: "top",
  },
  actionBar: {
    justifyContent: "space-between",
  },
  secondaryAction: {
    flex: 1,
    marginRight: Tokens.spacing.sm,
  },
  primaryAction: {
    flex: 1,
  },
});
