import type { CSSProperties } from "react";
import type {
  FeatureFlagSummary,
  IdentityContext,
  TenantBillingProfile,
  TenantIntegrationGovernancePackage,
  TenantNotificationPreferences,
  TenantNotificationSubscription,
  TenantQuotaSummary,
  TenantSlaProfile,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasField,
  CanvasInput,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasSelect,
  buildCanvasTheme,
} from "@drts/ui-web";
import { DEMO_TENANT_ID, getTenantClient } from "@/lib/api-client";
import { TENANT_CONSOLE_ENV } from "@/lib/navigation";
import {
  SettingsNotificationTable,
  type SettingsNotificationRow,
} from "./settings-notification-table";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const topRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 16,
};

const generalGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const generalCardStyle: CSSProperties = {
  flex: "1.4 1 460px",
  minWidth: 0,
};

const statusCardStyle: CSSProperties = {
  flex: "1 1 320px",
  minWidth: 0,
};

const settingsLaneStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 12,
  marginBottom: 16,
};

const capabilityStackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

const sectionLabelStyle: CSSProperties = {
  marginBottom: 8,
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: 0.4,
  textTransform: "uppercase",
  color: th.textMuted,
};

const chipRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const mutedFootnoteStyle: CSSProperties = {
  fontSize: 11,
  color: th.textDim,
};

const checklistStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: "none",
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const checklistItemStyle: CSSProperties = {
  fontSize: 12,
  color: th.text,
  display: "flex",
  gap: 8,
  alignItems: "flex-start",
};

const checklistBulletStyle: CSSProperties = {
  color: th.accent,
  fontFamily: th.monoFamily,
  flexShrink: 0,
};

const emptyStateStyle: CSSProperties = {
  fontSize: 12,
  color: th.textMuted,
  textAlign: "center",
  padding: "20px 16px",
};

const numberFormatter = new Intl.NumberFormat("en");
const dateFormatter = new Intl.DateTimeFormat("zh-Hant", {
  dateStyle: "short",
});
const dateTimeFormatter = new Intl.DateTimeFormat("zh-Hant", {
  dateStyle: "short",
  timeStyle: "short",
});

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return dateFormatter.format(parsed);
}

function formatUpdated(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return dateTimeFormatter.format(parsed);
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

function formatQuotaRemaining(summary: TenantQuotaSummary | null) {
  if (!summary) return "—";

  if (summary.usage.bookingCountRemaining !== null) {
    return `${formatCount(summary.usage.bookingCountRemaining)} 趟剩餘`;
  }

  if (summary.usage.amountMinorRemaining !== null) {
    return `${summary.limit.currency} ${formatCount(summary.usage.amountMinorRemaining / 100)} 剩餘`;
  }

  return "無上限";
}

function formatRemainingPercent(summary: TenantQuotaSummary | null) {
  if (summary?.usage.remainingPercent === null || !summary) {
    return "—";
  }

  return `${summary.usage.remainingPercent}%`;
}

function getConsentValue(preferences: TenantNotificationPreferences | null) {
  if (!preferences?.updatedAt) {
    return "尚未設定";
  }

  return `pp · ${formatDate(preferences.updatedAt)}`;
}

function compareSubscriptions(
  left: TenantNotificationSubscription,
  right: TenantNotificationSubscription,
) {
  if (left.enabled !== right.enabled) {
    return left.enabled ? -1 : 1;
  }

  const channelRank = {
    ops_console: 0,
    webhook: 1,
    email: 2,
  } as const;

  if (left.channel !== right.channel) {
    return channelRank[left.channel] - channelRank[right.channel];
  }

  return left.eventType.localeCompare(right.eventType, "en");
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
  const apiKeyLifetime = data.governance
    ? `${data.governance.apiKeyPolicy.defaultLifetimeDays} 天 (最長 ${data.governance.apiKeyPolicy.maxLifetimeDays} 天)`
    : "—";
  const webhookRetry = data.governance
    ? `${data.governance.webhookPolicy.retryPolicy.maxAttempts} 次重送`
    : "—";
  const subscriptions =
    data.preferences?.subscriptions?.slice().sort(compareSubscriptions) ?? [];
  const baselineSubscriptions =
    data.governance?.baselineNotificationSubscriptions
      ?.slice()
      .sort(compareSubscriptions) ?? [];
  const checklist = data.governance?.onboardingChecklist ?? [];
  const baselineEvents = data.governance?.baselineWebhookEvents ?? [];
  const notificationRows: SettingsNotificationRow[] = (
    subscriptions.length > 0 ? subscriptions : baselineSubscriptions
  ).map((subscription) => ({
    ...subscription,
    updatedAt:
      subscriptions.length > 0
        ? (data.preferences?.updatedAt ?? null)
        : (data.governance?.generatedAt ?? null),
  }));
  const notificationFootnote =
    subscriptions.length > 0
      ? `最後更新 ${formatUpdated(data.preferences?.updatedAt)}`
      : baselineSubscriptions.length > 0
        ? `尚未覆寫租戶訂閱，顯示治理基線 ${formatUpdated(data.governance?.generatedAt)}`
        : "尚未設定任何通知事件";
  const quotaSummary = data.quotaSummary;
  const currentStageValue = TENANT_CONSOLE_ENV;
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

        <div style={topRowStyle}>
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
                { k: "階段", v: currentStageValue, mono: true },
                {
                  k: "啟用模組",
                  v: `${enabledFlags.length} / ${totalFlags}`,
                },
                {
                  k: "配額",
                  v: formatQuotaLimit(quotaSummary),
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

        <div style={settingsLaneStyle}>
          <CanvasCard
            theme={th}
            title="通知訂閱"
            subtitle="事件代碼 · 路由 · 狀態"
            actions={
              <CanvasBtn theme={th} icon="export" size="sm">
                匯出路由
              </CanvasBtn>
            }
            padding={0}
          >
            {notificationRows.length > 0 ? (
              <SettingsNotificationTable rows={notificationRows} />
            ) : (
              <div style={emptyStateStyle}>尚未訂閱任何事件通知</div>
            )}
            <div style={{ ...mutedFootnoteStyle, padding: "10px 14px 14px" }}>
              {notificationFootnote}
            </div>
          </CanvasCard>

          <CanvasCard
            theme={th}
            title="SLA 與配額姿態"
            subtitle="等候 / 抵達 / 完成門檻 · 月配額姿態"
          >
            <div style={kpiGridStyle}>
              <CanvasKPI
                theme={th}
                label="等候"
                value={data.sla ? `${data.sla.waitThresholdMin}m` : "—"}
                sub="等候門檻"
              />
              <CanvasKPI
                theme={th}
                label="抵達"
                value={data.sla ? `${data.sla.arrivalThresholdMin}m` : "—"}
                sub="抵達門檻"
              />
              <CanvasKPI
                theme={th}
                label="完成"
                value={data.sla ? `${data.sla.completionThresholdMin}m` : "—"}
                sub="完成門檻"
              />
              <CanvasKPI
                theme={th}
                label="剩餘配額"
                value={formatRemainingPercent(quotaSummary)}
                sub={formatQuotaRemaining(quotaSummary)}
              />
            </div>

            <CanvasDL
              theme={th}
              cols={2}
              items={[
                {
                  k: "API key 壽命",
                  v: apiKeyLifetime,
                  mono: true,
                },
                {
                  k: "webhook 重送",
                  v: webhookRetry,
                  mono: true,
                },
                {
                  k: "Webhook 基線",
                  v: `${baselineEvents.length} 項`,
                  mono: true,
                },
                {
                  k: "強制模式",
                  v: quotaSummary?.limit.enforcementMode ?? "—",
                  mono: true,
                },
                {
                  k: "已確認趟次",
                  v: quotaSummary
                    ? formatCount(quotaSummary.usage.confirmedBookingCount)
                    : "—",
                  mono: true,
                },
                {
                  k: "更新時間",
                  v: formatUpdated(
                    quotaSummary?.refreshedAt ?? data.sla?.updatedAt,
                  ),
                  mono: true,
                },
              ]}
            />
          </CanvasCard>

          <CanvasCard
            theme={th}
            title="能力與整合準備"
            subtitle="功能旗標 · webhook 基線 · 切換清單"
          >
            <div style={capabilityStackStyle}>
              <div>
                <div style={sectionLabelStyle}>已啟用旗標</div>
                {enabledFlags.length > 0 ? (
                  <div style={chipRowStyle}>
                    {enabledFlags.slice(0, 12).map((flag) => (
                      <CanvasPill key={flag.key} theme={th} tone="accent">
                        {flag.key}
                      </CanvasPill>
                    ))}
                  </div>
                ) : (
                  <div style={emptyStateStyle}>目前沒有已啟用的旗標</div>
                )}
              </div>

              <div>
                <div style={sectionLabelStyle}>Webhook 基線事件</div>
                {baselineEvents.length > 0 ? (
                  <div style={chipRowStyle}>
                    {baselineEvents.slice(0, 8).map((eventType) => (
                      <CanvasPill key={eventType} theme={th} tone="info">
                        {eventType}
                      </CanvasPill>
                    ))}
                  </div>
                ) : (
                  <div style={emptyStateStyle}>尚未發佈事件基線</div>
                )}
              </div>

              {checklist.length > 0 ? (
                <>
                  <CanvasBanner
                    theme={th}
                    tone="info"
                    icon="warn"
                    title="整合準備仍有待辦"
                    body={`${checklist.length} 項檢查仍需確認，以下保留切換前的 capability framing。`}
                  />
                  <ul style={checklistStyle}>
                    {checklist.map((item, index) => (
                      <li key={item} style={checklistItemStyle}>
                        <span style={checklistBulletStyle}>
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <div style={mutedFootnoteStyle}>暫無待辦整合事項</div>
              )}
            </div>
          </CanvasCard>
        </div>
      </div>
    </div>
  );
}
