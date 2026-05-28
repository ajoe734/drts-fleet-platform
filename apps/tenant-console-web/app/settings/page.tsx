import Link from "next/link";
import type { CSSProperties } from "react";
import type {
  CrossAppResourceLink,
  EmptyReason,
  FeatureFlagSummary,
  IdentityContext,
  ResourceActionDescriptor,
  TenantBillingProfile,
  TenantIntegrationGovernancePackage,
  TenantNotificationPreferences,
  TenantNotificationSubscription,
  TenantQuotaSummary,
  TenantSlaProfile,
  UiRefreshMetadata,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasCard,
  CanvasDL,
  CanvasField,
  CanvasInput,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  type CanvasTone,
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
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.45fr) minmax(320px, 1fr)",
  gap: 16,
};

const generalGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const twoColumnStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 16,
};

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 12,
};

const actionGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
  gap: 12,
};

const actionCardStyle: CSSProperties = {
  border: `1px solid ${th.border}`,
  borderRadius: 12,
  padding: 14,
  display: "flex",
  flexDirection: "column",
  gap: 10,
  background: th.surfaceHi,
};

const actionHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

const actionTitleStyle: CSSProperties = {
  color: th.text,
  fontSize: 13,
  fontWeight: 600,
};

const actionMetaStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
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

const checklistStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: "none",
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const checklistItemStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "auto 1fr",
  gap: 8,
  alignItems: "start",
  color: th.text,
  fontSize: 12.5,
};

const checklistBulletStyle: CSSProperties = {
  color: th.accent,
  fontFamily: th.monoFamily,
};

const emptyReasonGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const emptyReasonCardStyle: CSSProperties = {
  borderRadius: 12,
  padding: 14,
  border: `1px solid ${th.border}`,
  background: th.surfaceHi,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  minHeight: 146,
};

const linkListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const sitemapListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const sitemapRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 160px) minmax(0, 1fr) auto",
  gap: 12,
  alignItems: "center",
  borderRadius: 12,
  border: `1px solid ${th.border}`,
  background: th.surfaceHi,
  padding: "12px 14px",
};

const linkCardStyle: CSSProperties = {
  borderRadius: 12,
  border: `1px solid ${th.border}`,
  padding: 14,
  background: th.surfaceHi,
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
};

const inlineLinkStyle: CSSProperties = {
  color: th.accent,
  fontSize: 12.5,
  textDecoration: "none",
  fontWeight: 600,
};

const subtextStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 11.5,
  lineHeight: 1.55,
};

const paragraphStyle: CSSProperties = {
  color: th.text,
  fontSize: 12.5,
  lineHeight: 1.6,
  margin: 0,
};

const codeTextStyle: CSSProperties = {
  fontFamily: th.monoFamily,
  color: th.text,
  fontSize: 12,
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

type ActionView = {
  descriptor: ResourceActionDescriptor;
  title: string;
  detail: string;
  href: string;
  openInNewTab?: boolean;
};

type SettingsDeepLink = {
  title: string;
  description: string;
  link: CrossAppResourceLink;
};

type SettingsRoute = {
  route: string;
  label: string;
  owner: string;
  summary: string;
};

const SETTINGS_EMPTY_REASONS = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
] as const satisfies readonly EmptyReason[];

const EMPTY_REASON_COPY: Record<
  EmptyReason,
  { title: string; detail: string; tone: CanvasTone; nextStep: string }
> = {
  no_data: {
    title: "尚未建立資料",
    detail: "租戶還沒有覆寫任何設定，畫面應顯示基線與建立入口。",
    tone: "neutral",
    nextStep: "以治理基線作為 fallback，並提供建立設定的 CTA。",
  },
  not_provisioned: {
    title: "尚未開通模組",
    detail: "功能未佈建，不是資料空白；要明示 provisioning 缺口。",
    tone: "warn",
    nextStep: "導向整合治理或平台開通流程，不顯示誤導性的空表格。",
  },
  fetch_failed: {
    title: "讀取失敗",
    detail: "服務暫時失敗時要保留錯誤脈絡，不能偽裝成沒有設定。",
    tone: "danger",
    nextStep: "顯示 retry / refresh，並維持最後可用快照的 freshness 說明。",
  },
  permission_denied: {
    title: "權限不足",
    detail: "目前 actor 沒有讀取或變更特定設定的 scope。",
    tone: "danger",
    nextStep: "保留可見性說明並引導使用者找 tenant admin 協助。",
  },
  external_unavailable: {
    title: "外部依賴不可用",
    detail: "像 webhook delivery 或外部通知通道異常時，需要區分為依賴中斷。",
    tone: "warn",
    nextStep: "標記影響範圍，並提供 cross-app escalation link。",
  },
  filtered_empty: {
    title: "篩選後無結果",
    detail: "不是沒資料，而是目前檢視條件沒有匹配設定項目。",
    tone: "info",
    nextStep: "保留 filter 上下文並提供 clear filters affordance。",
  },
  driver_not_eligible: {
    title: "Driver-only state",
    detail: "此頁不使用 driver-app 專屬 empty reason。",
    tone: "neutral",
    nextStep: "Tenant settings 僅覆蓋六種 management-surface states。",
  },
};

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(value: string | null | undefined) {
  const parsed = parseDate(value);
  return parsed ? dateFormatter.format(parsed) : "—";
}

function formatUpdated(value: string | null | undefined) {
  const parsed = parseDate(value);
  return parsed ? dateTimeFormatter.format(parsed) : "—";
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
  if (!summary || summary.usage.remainingPercent === null) {
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

  const channelRank: Record<TenantNotificationSubscription["channel"], number> =
    {
      ops_console: 0,
      webhook: 1,
      email: 2,
    };

  if (left.channel !== right.channel) {
    return channelRank[left.channel] - channelRank[right.channel];
  }

  return left.eventType.localeCompare(right.eventType, "en");
}

function getRefreshMetadata(data: SettingsData): UiRefreshMetadata {
  const candidates = [
    data.billingProfile?.updatedAt,
    data.preferences?.updatedAt,
    data.sla?.updatedAt,
    data.governance?.generatedAt,
    data.quotaSummary?.refreshedAt,
    data.flags?.flags[0]?.updatedAt,
  ]
    .map((value) => parseDate(value)?.getTime() ?? 0)
    .filter((value) => value > 0);

  const generatedAtMs =
    candidates.length > 0 ? Math.max(...candidates) : Date.now();
  const staleAfterMs = 30_000;
  const age = Date.now() - generatedAtMs;
  const degraded = data.errors.length > 0;

  return {
    generatedAt: new Date(generatedAtMs).toISOString(),
    staleAfterMs,
    dataFreshness: degraded
      ? "degraded"
      : age > staleAfterMs
        ? "stale"
        : "fresh",
    source: degraded ? "cache" : "live",
  };
}

function getRefreshTone(
  metadata: UiRefreshMetadata,
): "warn" | "info" | "success" {
  if (metadata.dataFreshness === "degraded") return "warn";
  if (metadata.dataFreshness === "stale") return "info";
  return "success";
}

function getRefreshLabel(metadata: UiRefreshMetadata) {
  if (metadata.dataFreshness === "degraded") return "degraded";
  if (metadata.dataFreshness === "stale") return "stale";
  return "fresh";
}

function getRiskTone(
  riskLevel: ResourceActionDescriptor["riskLevel"],
): CanvasTone {
  if (riskLevel === "high") return "danger";
  if (riskLevel === "medium") return "warn";
  return "accent";
}

function getActionLabel(action: string) {
  switch (action) {
    case "open_users":
      return "管理人員與角色";
    case "open_rules":
      return "檢查規則與配額";
    case "open_webhooks":
      return "檢查 Webhook";
    case "open_api_keys":
      return "檢查 API 金鑰";
    case "view_audit":
      return "查看稽核";
    case "refresh_snapshot":
      return "刷新快照";
    default:
      return action;
  }
}

function createActionDescriptor(
  action: string,
  enabled: boolean,
  riskLevel: ResourceActionDescriptor["riskLevel"],
  disabledReasonCode?: string,
): ResourceActionDescriptor {
  return disabledReasonCode
    ? { action, enabled, riskLevel, disabledReasonCode }
    : { action, enabled, riskLevel };
}

function buildSettingsActions(data: SettingsData): ActionView[] {
  const hasIntegrationConfig =
    (data.governance?.baselineWebhookEvents.length ?? 0) > 0 ||
    (data.preferences?.subscriptions.length ?? 0) > 0;
  const hasTenantAdminAccess =
    (data.identity?.roles.includes("tc_admin") ?? false) ||
    data.identity?.actorType === "tenant_admin";
  const hasAuditScope = data.identity?.scopes.includes("audit:read") ?? false;
  const tenantId = data.identity?.tenantId ?? DEMO_TENANT_ID;
  const platformAdminUrl =
    process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ?? "http://localhost:3004";

  return [
    {
      title: "人員與角色",
      detail: "租戶 admin 權限與 approval 路徑在現有 users surface 管理。",
      href: "/users",
      descriptor: createActionDescriptor(
        "open_users",
        hasTenantAdminAccess,
        "low",
        hasTenantAdminAccess ? undefined : "tenant_admin_scope_required",
      ),
    },
    {
      title: "規則與配額",
      detail: "SLA / quota / approval posture 透過現有 rules surface 收斂。",
      href: "/rules",
      descriptor: createActionDescriptor(
        "open_rules",
        hasIntegrationConfig,
        "medium",
        hasIntegrationConfig ? undefined : "rules_module_not_ready",
      ),
    },
    {
      title: "Webhook 健康",
      detail:
        "整合治理與 delivery engine 需一起檢查，避免把依賴中斷誤判成設定缺失。",
      href: "/webhooks",
      descriptor: createActionDescriptor(
        "open_webhooks",
        (data.governance?.baselineWebhookEvents.length ?? 0) > 0,
        "medium",
        (data.governance?.baselineWebhookEvents.length ?? 0) > 0
          ? undefined
          : "webhook_engine_not_provisioned",
      ),
    },
    {
      title: "API 金鑰政策",
      detail: "金鑰生命週期、break-glass 與 scope policy 皆由治理包決定。",
      href: "/api-keys",
      descriptor: createActionDescriptor(
        "open_api_keys",
        Boolean(data.governance?.apiKeyPolicy),
        "medium",
        data.governance?.apiKeyPolicy
          ? undefined
          : "api_key_policy_unavailable",
      ),
    },
    {
      title: "平台稽核",
      detail: "動作 receipt 應能 deep link 到跨 app 稽核檢視，預設開新分頁。",
      href: `${platformAdminUrl}/audit?tenantId=${encodeURIComponent(tenantId)}`,
      openInNewTab: true,
      descriptor: createActionDescriptor(
        "view_audit",
        hasAuditScope,
        "low",
        hasAuditScope ? undefined : "audit_scope_required",
      ),
    },
    {
      title: "更新快照",
      detail:
        "此頁為 T5 slow tier，30 秒 cadence；仍需保留手動 refresh affordance。",
      href: "/settings",
      descriptor: createActionDescriptor("refresh_snapshot", true, "low"),
    },
  ];
}

function buildCrossAppLinks(tenantId: string): SettingsDeepLink[] {
  const platformAdminUrl =
    process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ?? "http://localhost:3004";
  const opsConsoleUrl =
    process.env.NEXT_PUBLIC_OPS_CONSOLE_URL ?? "http://localhost:3003";

  const links: SettingsDeepLink[] = [
    {
      title: "平台稽核檢視",
      description: "檢查 tenant 設定異動是否由 platform 或 system actor 觸發。",
      link: {
        targetApp: "platform-admin",
        route: `/audit?tenantId=${encodeURIComponent(tenantId)}`,
        resourceType: "tenant_settings",
        resourceId: tenantId,
        openMode: "new_tab",
        label: "View platform audit",
      },
    },
    {
      title: "Ops 協調升級",
      description: "Webhook / 通知依賴異常時，直接切往 ops console 做 triage。",
      link: {
        targetApp: "ops-console",
        route: `/dispatch?tenantId=${encodeURIComponent(tenantId)}`,
        resourceType: "tenant",
        resourceId: tenantId,
        openMode: "new_tab",
        label: "Open ops triage",
      },
    },
    {
      title: "Tenant 內治理總覽",
      description: "回到租戶內可維護的規則與配額 surface，檢查治理姿態與限制。",
      link: {
        targetApp: "tenant-console",
        route: "/rules",
        resourceType: "tenant_rules",
        resourceId: tenantId,
        openMode: "same_tab",
        label: "Open rules",
      },
    },
    {
      title: "人員與角色",
      description:
        "權限不足或 approval flow 卡住時，回到 tenant-owned role 管理。",
      link: {
        targetApp: "tenant-console",
        route: "/users",
        resourceType: "tenant_users",
        resourceId: tenantId,
        openMode: "same_tab",
        label: "Open users",
      },
    },
  ];

  return links.map((item) => {
    if (item.link.targetApp === "platform-admin") {
      return {
        ...item,
        link: {
          ...item.link,
          route: `${platformAdminUrl}${item.link.route}`,
        },
      };
    }

    if (item.link.targetApp === "ops-console") {
      return {
        ...item,
        link: {
          ...item.link,
          route: `${opsConsoleUrl}${item.link.route}`,
        },
      };
    }

    return item;
  });
}

function buildSettingsRoutes(): SettingsRoute[] {
  return [
    {
      route: "/settings",
      label: "設定",
      owner: "此頁",
      summary: "保留 tenant-level defaults 與跨模組設定入口。",
    },
    {
      route: "/users",
      label: "人員與角色",
      owner: "Access",
      summary: "角色、核准路徑與權限不足處理落在 users。",
    },
    {
      route: "/integration-governance",
      label: "整合就緒度",
      owner: "Integration",
      summary: "檢查 API key / webhook / 通知基線是否已佈建。",
    },
    {
      route: "/sla",
      label: "SLA",
      owner: "Service level",
      summary: "門檻分鐘數與 recalculation 指令另有專屬 surface。",
    },
    {
      route: "/billing",
      label: "帳務概覽",
      owner: "Finance",
      summary: "發票抬頭、聯絡資訊與帳務姿態以 billing authority 為準。",
    },
    {
      route: "/rules",
      label: "審批規則",
      owner: "Governance",
      summary: "配額、成本中心與 approval posture 不在 settings 內重覆編輯。",
    },
  ];
}

function getLinkTarget(link: CrossAppResourceLink) {
  return link.openMode === "new_tab" ? "_blank" : undefined;
}

function getLinkRel(link: CrossAppResourceLink) {
  return link.openMode === "new_tab" ? "noreferrer" : undefined;
}

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

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const data = await loadSettingsData();
  const resolvedSearchParams = (await searchParams) ?? {};
  const selectedEmptyReason = Array.isArray(resolvedSearchParams.empty)
    ? resolvedSearchParams.empty[0]
    : resolvedSearchParams.empty;

  const tenantCode = data.identity?.tenantId ?? DEMO_TENANT_ID;
  const displayName = data.billingProfile?.invoiceTitle ?? "未設定";
  const taxId = data.billingProfile?.taxId ?? "未設定";
  const billingContact = data.billingProfile
    ? `${data.billingProfile.contactName ?? "未指派"} · ${data.billingProfile.email}`
    : "未設定";
  const defaultLocale = "zh-Hant";
  const defaultTimezone = "Asia/Taipei";
  const enabledFlags: FeatureFlagSummary["flags"] =
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
  const subscriptions: TenantNotificationSubscription[] =
    data.preferences?.subscriptions?.slice().sort(compareSubscriptions) ?? [];
  const baselineSubscriptions: TenantNotificationSubscription[] =
    data.governance?.baselineNotificationSubscriptions
      ?.slice()
      .sort(compareSubscriptions) ?? [];
  const checklist: string[] = data.governance?.onboardingChecklist ?? [];
  const baselineEvents: string[] = data.governance?.baselineWebhookEvents ?? [];
  const notificationSource: TenantNotificationSubscription[] =
    subscriptions.length > 0 ? subscriptions : baselineSubscriptions;
  const notificationRows: SettingsNotificationRow[] = notificationSource.map(
    (subscription) => ({
      ...subscription,
      updatedAt:
        subscriptions.length > 0
          ? (data.preferences?.updatedAt ?? null)
          : (data.governance?.generatedAt ?? null),
    }),
  );
  const notificationFootnote =
    subscriptions.length > 0
      ? `最後更新 ${formatUpdated(data.preferences?.updatedAt)}`
      : baselineSubscriptions.length > 0
        ? `尚未覆寫租戶訂閱，顯示治理基線 ${formatUpdated(data.governance?.generatedAt)}`
        : "尚未設定任何通知事件";
  const quotaSummary = data.quotaSummary;
  const currentStageValue = TENANT_CONSOLE_ENV;
  const consentValue = getConsentValue(data.preferences);
  const refresh = getRefreshMetadata(data);
  const actions = buildSettingsActions(data);
  const crossAppLinks = buildCrossAppLinks(tenantCode);
  const relatedRoutes = buildSettingsRoutes();
  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="租戶設定"
        subtitle="一般 · 通知預設 · 隱私 · 整合預設"
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

        <CanvasBanner
          theme={th}
          tone={getRefreshTone(refresh)}
          icon="time"
          title={`Refresh tier T5 · ${getRefreshLabel(refresh)}`}
          body={`Tenant settings 以 30 秒 cadence 讀取快照；目前快照產生於 ${formatUpdated(refresh.generatedAt)}，來源 ${refresh.source}。`}
        />

        <div style={topRowStyle}>
          <CanvasCard theme={th} title="一般">
            <div style={generalGridStyle}>
              <CanvasField theme={th} label="租戶代碼 · tenant_code">
                <CanvasInput theme={th} value={tenantCode} mono />
              </CanvasField>
              <CanvasField theme={th} label="顯示名稱 · display_name">
                <CanvasInput theme={th} value={displayName} />
              </CanvasField>
              <CanvasField theme={th} label="統一編號 · tax_id">
                <CanvasInput theme={th} value={taxId} mono />
              </CanvasField>
              <CanvasField theme={th} label="計費聯絡人">
                <CanvasInput theme={th} value={billingContact} />
              </CanvasField>
              <CanvasField theme={th} label="預設語系 · default_locale">
                <CanvasInput theme={th} value={defaultLocale} mono />
              </CanvasField>
              <CanvasField theme={th} label="預設時區 · timezone">
                <CanvasInput theme={th} value={defaultTimezone} mono />
              </CanvasField>
            </div>
          </CanvasCard>

          <CanvasCard theme={th} title="當期狀態">
            <CanvasDL
              theme={th}
              cols={1}
              items={[
                { k: "階段", v: currentStageValue, mono: true },
                {
                  k: "啟用模組",
                  v: `${enabledFlags.length} / ${totalFlags}`,
                  mono: true,
                },
                {
                  k: "配額",
                  v: formatQuotaLimit(quotaSummary),
                  mono: true,
                },
                {
                  k: "Webhook 簽章",
                  v: "sha256-hmac",
                  mono: true,
                },
                { k: "隱私", v: "電話遮罩 · 中介轉接" },
                {
                  k: "同意書版本",
                  v: consentValue,
                  mono: true,
                },
                {
                  k: "Realm",
                  v: data.identity?.realm ?? "tenant",
                  mono: true,
                },
                {
                  k: "Auth mode",
                  v: data.identity?.authMode ?? "bootstrap_headers",
                  mono: true,
                },
              ]}
            />
          </CanvasCard>
        </div>

        <CanvasCard
          theme={th}
          title="設定邊界與 sitemap"
          subtitle="依 packet §5.20，`/settings` 作為 tenant-level defaults 與跨模組入口，不重覆承接專屬設定 surface"
        >
          <div style={sitemapListStyle}>
            {relatedRoutes.map((item) => (
              <div key={item.route} style={sitemapRowStyle}>
                <div>
                  <div style={actionTitleStyle}>{item.label}</div>
                  <div style={subtextStyle}>{item.summary}</div>
                </div>
                <code style={codeTextStyle}>{item.route}</code>
                <CanvasPill theme={th} tone="info">
                  {item.owner}
                </CanvasPill>
              </div>
            ))}
          </div>
        </CanvasCard>

        <CanvasCard
          theme={th}
          title="可執行動作"
          subtitle="CTAs 由 availableActions descriptor 驅動，不在 UI 端硬編角色判斷"
        >
          <div style={actionGridStyle}>
            {actions.map((item) => (
              <div key={item.descriptor.action} style={actionCardStyle}>
                <div style={actionHeaderStyle}>
                  <div style={actionTitleStyle}>{item.title}</div>
                  <CanvasPill
                    theme={th}
                    tone={item.descriptor.enabled ? "success" : "neutral"}
                    dot
                  >
                    {item.descriptor.enabled ? "enabled" : "disabled"}
                  </CanvasPill>
                </div>
                <p style={paragraphStyle}>{item.detail}</p>
                <div style={actionMetaStyle}>
                  <CanvasPill
                    theme={th}
                    tone={getRiskTone(item.descriptor.riskLevel)}
                  >
                    {item.descriptor.riskLevel}
                  </CanvasPill>
                  <CanvasPill theme={th} tone="info">
                    {getActionLabel(item.descriptor.action)}
                  </CanvasPill>
                  {item.descriptor.requiresReason ? (
                    <CanvasPill theme={th} tone="warn">
                      requires reason
                    </CanvasPill>
                  ) : null}
                </div>
                {item.descriptor.enabled ? (
                  <Link
                    href={item.href}
                    target={item.openInNewTab ? "_blank" : undefined}
                    rel={item.openInNewTab ? "noreferrer" : undefined}
                    style={inlineLinkStyle}
                  >
                    開啟動作
                  </Link>
                ) : (
                  <div style={subtextStyle}>
                    disabledReasonCode:{" "}
                    <code style={{ fontFamily: th.monoFamily }}>
                      {item.descriptor.disabledReasonCode ?? "unknown"}
                    </code>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CanvasCard>

        <div style={twoColumnStyle}>
          <CanvasCard
            theme={th}
            title="通知訂閱"
            subtitle="事件代碼 · 路由 · 狀態"
            padding={0}
          >
            {notificationRows.length > 0 ? (
              <SettingsNotificationTable rows={notificationRows} />
            ) : (
              <div style={emptyStateStyle}>尚未訂閱任何事件通知</div>
            )}
            <div style={{ ...subtextStyle, padding: "10px 14px 14px" }}>
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
                { k: "API key 壽命", v: apiKeyLifetime, mono: true },
                { k: "Webhook 重送", v: webhookRetry, mono: true },
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
        </div>

        <div style={twoColumnStyle}>
          <CanvasCard
            theme={th}
            title="能力與整合預設"
            subtitle="功能旗標 · webhook 基線 · onboarding checklist"
          >
            <div style={sectionLabelStyle}>Enabled flags</div>
            <div style={chipRowStyle}>
              {enabledFlags.length > 0 ? (
                enabledFlags.map((flag) => (
                  <CanvasPill key={flag.key} theme={th} tone="accent">
                    {flag.key}
                  </CanvasPill>
                ))
              ) : (
                <CanvasPill theme={th} tone="neutral">
                  沒有啟用中的旗標
                </CanvasPill>
              )}
            </div>

            <div style={{ ...sectionLabelStyle, marginTop: 12 }}>
              Onboarding checklist
            </div>
            {checklist.length > 0 ? (
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
            ) : (
              <p style={paragraphStyle}>
                目前沒有待處理的 onboarding checklist。
              </p>
            )}
          </CanvasCard>

          <CanvasCard
            theme={th}
            title="跨 App deep links"
            subtitle="依 Q-X03 / Q-X10 使用 CrossAppResourceLink，預設 new-tab"
          >
            <div style={linkListStyle}>
              {crossAppLinks.map((item) => (
                <div key={item.title} style={linkCardStyle}>
                  <div>
                    <div style={actionTitleStyle}>{item.title}</div>
                    <p style={{ ...paragraphStyle, marginTop: 4 }}>
                      {item.description}
                    </p>
                    <div style={{ ...subtextStyle, marginTop: 8 }}>
                      <code style={{ fontFamily: th.monoFamily }}>
                        {item.link.targetApp}
                      </code>
                      {" · "}
                      <code style={{ fontFamily: th.monoFamily }}>
                        {item.link.resourceType}
                      </code>
                    </div>
                  </div>
                  <Link
                    href={item.link.route}
                    target={getLinkTarget(item.link)}
                    rel={getLinkRel(item.link)}
                    style={inlineLinkStyle}
                  >
                    {item.link.label}
                  </Link>
                </div>
              ))}
            </div>
          </CanvasCard>
        </div>

        <CanvasCard
          theme={th}
          title="EmptyReason treatments"
          subtitle="六種 management-surface empty states 必須 distinct；`?empty=` 可高亮單一狀態"
        >
          <div style={emptyReasonGridStyle}>
            {SETTINGS_EMPTY_REASONS.map((reason) => {
              const copy = EMPTY_REASON_COPY[reason];
              const highlighted = selectedEmptyReason === reason;
              return (
                <div
                  key={reason}
                  style={{
                    ...emptyReasonCardStyle,
                    borderColor: highlighted ? th.accent : th.border,
                    boxShadow: highlighted
                      ? `0 0 0 1px ${th.accentBorder}`
                      : undefined,
                  }}
                >
                  <div style={actionHeaderStyle}>
                    <CanvasPill theme={th} tone={copy.tone}>
                      {reason}
                    </CanvasPill>
                    {highlighted ? (
                      <CanvasPill theme={th} tone="accent">
                        active
                      </CanvasPill>
                    ) : null}
                  </div>
                  <div style={actionTitleStyle}>{copy.title}</div>
                  <p style={paragraphStyle}>{copy.detail}</p>
                  <div style={subtextStyle}>{copy.nextStep}</div>
                </div>
              );
            })}
          </div>
        </CanvasCard>
      </div>
    </div>
  );
}
