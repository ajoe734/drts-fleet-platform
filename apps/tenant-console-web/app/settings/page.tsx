import type { CSSProperties } from "react";
import type {
  FeatureFlagSummary,
  IdentityContext,
  TenantBillingProfile,
  TenantIntegrationGovernancePackage,
  TenantNotificationPreferences,
  TenantQuotaSummary,
  TenantSlaProfile,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasCard,
  CanvasDL,
  CanvasField,
  CanvasInput,
  CanvasPageHeader,
  CanvasSelect,
  buildCanvasTheme,
} from "@drts/ui-web";
import { DEMO_TENANT_ID, getTenantClient } from "@/lib/api-client";
import { TENANT_CONSOLE_ENV } from "@/lib/navigation";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const pageBodyStyle: CSSProperties = {
  padding: 24,
};

const settingsGridStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "stretch",
  gap: 16,
};

const generalCardStyle: CSSProperties = {
  flex: "1.4 1 480px",
  minWidth: 0,
};

const statusCardStyle: CSSProperties = {
  flex: "1 1 320px",
  minWidth: 0,
};

const generalGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 12,
};

const numberFormatter = new Intl.NumberFormat("en");
const dateFormatter = new Intl.DateTimeFormat("zh-Hant", {
  dateStyle: "short",
});

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return dateFormatter.format(parsed);
}

function formatCount(value: number) {
  return numberFormatter.format(value);
}

function formatQuotaLimit(summary: TenantQuotaSummary | null) {
  if (!summary) return "—";

  if (summary.limit.bookingCountLimit !== null) {
    return `${formatCount(summary.limit.bookingCountLimit)} 趟 / 月`;
  }

  if (summary.limit.amountMinorLimit !== null) {
    return `${summary.limit.currency} ${formatCount(summary.limit.amountMinorLimit / 100)} / 月`;
  }

  return "無上限";
}

function getConsentValue(preferences: TenantNotificationPreferences | null) {
  if (!preferences?.updatedAt) {
    return "尚未設定";
  }

  return `pp · ${formatDate(preferences.updatedAt)}`;
}

type SettingsData = {
  identity: IdentityContext | null;
  billingProfile: TenantBillingProfile | null;
  preferences: TenantNotificationPreferences | null;
  sla: TenantSlaProfile | null;
  governance: TenantIntegrationGovernancePackage | null;
  flags: FeatureFlagSummary | null;
  quotaSummary: TenantQuotaSummary | null;
  errors: string[];
};

async function loadSettingsData(): Promise<SettingsData> {
  const client = getTenantClient();
  const [
    identity,
    billingProfile,
    preferences,
    sla,
    governance,
    flags,
    quotaSummary,
  ] = await Promise.allSettled([
    client.getIdentityContext() as Promise<IdentityContext>,
    client.getBillingProfile() as Promise<TenantBillingProfile>,
    client.getNotificationPreferences() as Promise<TenantNotificationPreferences>,
    client.getSlaProfile() as Promise<TenantSlaProfile>,
    client.getTenantIntegrationGovernancePackage() as Promise<TenantIntegrationGovernancePackage>,
    client.getFeatureFlags({
      tenantId: DEMO_TENANT_ID,
    }) as Promise<FeatureFlagSummary>,
    client.getTenantQuotaSummary() as Promise<TenantQuotaSummary>,
  ]);

  const errors: string[] = [];
  const tag = (label: string, reason: unknown) =>
    `${label}: ${reason instanceof Error ? reason.message : "未知錯誤"}`;

  if (identity.status === "rejected")
    errors.push(tag("租戶身分", identity.reason));
  if (billingProfile.status === "rejected")
    errors.push(tag("計費設定", billingProfile.reason));
  if (preferences.status === "rejected")
    errors.push(tag("通知訂閱", preferences.reason));
  if (sla.status === "rejected") errors.push(tag("SLA 門檻", sla.reason));
  if (governance.status === "rejected")
    errors.push(tag("整合治理", governance.reason));
  if (flags.status === "rejected") errors.push(tag("功能旗標", flags.reason));
  if (quotaSummary.status === "rejected")
    errors.push(tag("租戶配額", quotaSummary.reason));

  return {
    identity: identity.status === "fulfilled" ? identity.value : null,
    billingProfile:
      billingProfile.status === "fulfilled" ? billingProfile.value : null,
    preferences: preferences.status === "fulfilled" ? preferences.value : null,
    sla: sla.status === "fulfilled" ? sla.value : null,
    governance: governance.status === "fulfilled" ? governance.value : null,
    flags: flags.status === "fulfilled" ? flags.value : null,
    quotaSummary:
      quotaSummary.status === "fulfilled" ? quotaSummary.value : null,
    errors,
  };
}

export default async function SettingsPage() {
  const data = await loadSettingsData();

  const tenantCode = data.identity?.tenantId ?? DEMO_TENANT_ID;
  const displayName = data.billingProfile?.invoiceTitle ?? "未設定";
  const taxId = data.billingProfile?.taxId ?? "未設定";
  const billingContact = data.billingProfile
    ? `${data.billingProfile.contactName ?? "未指派"} · ${data.billingProfile.email}`
    : "未設定";
  const enabledFlags =
    data.flags?.flags
      .filter((flag) => flag.enabled)
      .sort((left, right) => left.key.localeCompare(right.key, "en")) ?? [];
  const totalFlags = data.flags?.flags.length ?? 0;
  const consentValue = getConsentValue(data.preferences);

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="租戶設定"
        subtitle="一般 · 通知 · 隱私 · 整合"
        tabs={["一般", "通知", "隱私", "整合"]}
        activeTab="一般"
      />

      <div style={pageBodyStyle}>
        {data.errors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="部分設定資料無法載入"
            body={data.errors.join(" · ")}
          />
        ) : null}

        <div style={settingsGridStyle}>
          <CanvasCard theme={th} title="一般" style={generalCardStyle}>
            <div style={generalGridStyle}>
              <CanvasField theme={th} label="租戶代碼">
                <CanvasInput theme={th} value={tenantCode} mono />
              </CanvasField>
              <CanvasField theme={th} label="顯示名稱">
                <CanvasInput theme={th} value={displayName} />
              </CanvasField>
              <CanvasField theme={th} label="統一編號">
                <CanvasInput theme={th} value={taxId} mono />
              </CanvasField>
              <CanvasField theme={th} label="計費聯絡人">
                <CanvasInput theme={th} value={billingContact} />
              </CanvasField>
              <CanvasField theme={th} label="預設語系">
                <CanvasSelect theme={th} value="zh-Hant" />
              </CanvasField>
              <CanvasField theme={th} label="預設時區">
                <CanvasSelect theme={th} value="Asia/Taipei" />
              </CanvasField>
            </div>
          </CanvasCard>

          <CanvasCard theme={th} title="當期狀態" style={statusCardStyle}>
            <CanvasDL
              theme={th}
              cols={1}
              items={[
                { k: "階段", v: TENANT_CONSOLE_ENV, mono: true },
                {
                  k: "啟用模組",
                  v: `${enabledFlags.length} / ${totalFlags}`,
                },
                {
                  k: "配額",
                  v: formatQuotaLimit(data.quotaSummary),
                  mono: true,
                },
                {
                  k: "webhook 簽章",
                  v: "sha256-hmac",
                  mono: true,
                },
                { k: "隱私", v: "電話遮罩 · 中介轉接" },
                {
                  k: "同意書版本",
                  v: consentValue,
                  mono: true,
                },
              ]}
            />
          </CanvasCard>
        </div>
      </div>
    </div>
  );
}
