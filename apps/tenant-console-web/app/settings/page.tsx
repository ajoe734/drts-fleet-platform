import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type {
  EmptyReason,
  FeatureFlagSummary,
  IdentityContext,
  RefreshTier,
  ResourceActionDescriptor,
  TenantBillingProfile,
  TenantIntegrationGovernancePackage,
  TenantNotificationPreferences,
  TenantQuotaSummary,
  TenantSlaProfile,
  UiRefreshMetadata,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasField,
  CanvasInput,
  CanvasPageHeader,
  CanvasPill,
  CanvasSelect,
  type CanvasTone,
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

// Q-X02 / packet §3.2 + §5.20: /settings is the T5 "Tenant slow" tier (30s).
// The tier name comes from the contract enum so the cadence is not a magic
// number, and the page renders an explicit refresh affordance per §3.2.
const SETTINGS_REFRESH_TIER: RefreshTier = "slow";
const REFRESH_TIER_CADENCE_MS: Partial<Record<RefreshTier, number>> = {
  urgent: 5000,
  fast: 3000,
  dispatch: 5000,
  medium: 15000,
  medium_slow: 30000,
  slow: 30000,
  manual: 0,
};

// Cross-app deep-link base (packet §3.10): tenant-console can deep-link into
// the platform-admin app for read-scoped governance that does not live here
// (full feature-flag governance per Q-X16, integration escalation). These
// links open in a new tab and are never the canonical mutation surface.
const PLATFORM_ADMIN_BASE_URL =
  process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ?? "https://admin.drts.io";

// Icon names are drawn from the canvas icon set (CanvasBtn's CanvasIconName
// union); the literals below are all valid members of it.
type ModuleActionIcon =
  | "billing"
  | "notifications"
  | "sla"
  | "integrationGov"
  | "users"
  | "flags"
  | "apiKeys"
  | "ext";

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const contentGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.4fr) minmax(280px, 1fr)",
  gap: 16,
  alignItems: "start",
};

const generalGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 12,
};

const freshnessRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  fontSize: 12,
  color: th.textMuted,
};

const linkResetStyle: CSSProperties = {
  textDecoration: "none",
};

const moduleGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
  gap: 8,
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

function formatSlaThresholds(sla: TenantSlaProfile | null) {
  if (!sla) return "—";
  return `${sla.waitThresholdMin} / ${sla.arrivalThresholdMin} / ${sla.completionThresholdMin} 分`;
}

function countEnabledSubscriptions(
  preferences: TenantNotificationPreferences | null,
) {
  if (!preferences) return null;
  return preferences.subscriptions.filter((sub) => sub.enabled).length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Data loading
// ─────────────────────────────────────────────────────────────────────────────

type SettingsData = {
  identity: IdentityContext | null;
  billingProfile: TenantBillingProfile | null;
  preferences: TenantNotificationPreferences | null;
  sla: TenantSlaProfile | null;
  governance: TenantIntegrationGovernancePackage | null;
  flags: FeatureFlagSummary | null;
  quotaSummary: TenantQuotaSummary | null;
  // Identity is the page's required datum (it defines the tenant). When it
  // fails the whole settings body collapses into a distinct EmptyReason; the
  // six secondary reads degrade to a warn banner + "—" placeholders instead.
  loadError: { reason: EmptyReason; message: string } | null;
  errors: string[];
};

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知錯誤";
}

// Map the HTTP class onto the EmptyReason taxonomy (packet §3.6) so the empty
// state stays honest instead of collapsing every failure into "no data".
function classifyLoadFailure(error: unknown): {
  reason: EmptyReason;
  message: string;
} {
  const message = toErrorMessage(error);
  const statusMatch = message.match(/API error (\d{3})/);
  const status = statusMatch ? Number(statusMatch[1]) : null;

  if (status === 401 || status === 403) {
    return { reason: "permission_denied", message };
  }
  if (status === 404 || status === 501) {
    return { reason: "not_provisioned", message };
  }
  if (status !== null && status >= 502 && status <= 504) {
    return { reason: "external_unavailable", message };
  }
  return { reason: "fetch_failed", message };
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

  // Required datum: a failed identity read governs the empty state.
  if (identity.status === "rejected") {
    return {
      identity: null,
      billingProfile: null,
      preferences: null,
      sla: null,
      governance: null,
      flags: null,
      quotaSummary: null,
      loadError: classifyLoadFailure(identity.reason),
      errors: [],
    };
  }

  const errors: string[] = [];
  const tag = (label: string, reason: unknown) =>
    `${label}: ${toErrorMessage(reason)}`;

  if (billingProfile.status === "rejected") {
    errors.push(tag("計費設定", billingProfile.reason));
  }
  if (preferences.status === "rejected") {
    errors.push(tag("通知訂閱", preferences.reason));
  }
  if (sla.status === "rejected") {
    errors.push(tag("SLA 門檻", sla.reason));
  }
  if (governance.status === "rejected") {
    errors.push(tag("整合治理", governance.reason));
  }
  if (flags.status === "rejected") {
    errors.push(tag("功能旗標", flags.reason));
  }
  if (quotaSummary.status === "rejected") {
    errors.push(tag("租戶配額", quotaSummary.reason));
  }

  return {
    identity: identity.value,
    billingProfile:
      billingProfile.status === "fulfilled" ? billingProfile.value : null,
    preferences: preferences.status === "fulfilled" ? preferences.value : null,
    sla: sla.status === "fulfilled" ? sla.value : null,
    governance: governance.status === "fulfilled" ? governance.value : null,
    flags: flags.status === "fulfilled" ? flags.value : null,
    quotaSummary:
      quotaSummary.status === "fulfilled" ? quotaSummary.value : null,
    loadError: null,
    errors,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// availableActions (Q-X13 / ui-authority-actions-contract §8): CTAs are
// descriptor-driven. Per §8(4) the UI MUST consume the `availableActions[]`
// embedded on the response (here the governance envelope) and MUST NOT hard-code
// a role→action mapping. /settings folds into the owning modules (§7 + §4.2), so
// each descriptor surfaces as a deep link to its module.
//
// label / href / icon are pure PRESENTATION keyed by `descriptor.action`; the
// authority (which actions exist, enabled vs disabled, disabledReasonCode) comes
// from the descriptor. §6 lets the FE narrow display but never widen availability.
// ─────────────────────────────────────────────────────────────────────────────

type ModuleAction = {
  descriptor: ResourceActionDescriptor;
  label: string;
  href: string;
  icon: ModuleActionIcon;
  // Cross-app targets open in a new tab (packet §3.10).
  crossApp?: boolean;
  // True when the descriptor's internal target route is not yet built in this
  // app (the owning module lane has not merged); narrowed to a disabled CTA.
  routeUnavailable?: boolean;
};

type ModuleActionPresentation = {
  label: string;
  href: string;
  icon: ModuleActionIcon;
  crossApp?: boolean;
};

const MODULE_ACTION_PRESENTATION: Record<string, ModuleActionPresentation> = {
  manage_billing: { label: "計費設定", href: "/billing", icon: "billing" },
  manage_notifications: {
    label: "通知預設",
    href: "/notifications",
    icon: "notifications",
  },
  manage_sla: { label: "SLA 門檻", href: "/sla", icon: "sla" },
  manage_integration: {
    label: "整合治理",
    href: "/integration-governance",
    icon: "integrationGov",
  },
  manage_users: { label: "人員與角色", href: "/users", icon: "users" },
  view_feature_flags: {
    label: "功能旗標",
    href: "/feature-flags",
    icon: "flags",
  },
  rotate_signing_secret: {
    label: "輪替簽章金鑰",
    href: "/api-keys",
    icon: "apiKeys",
  },
  open_platform_governance: {
    label: "平台治理 (read-only)",
    href: `${PLATFORM_ADMIN_BASE_URL}/feature-flags`,
    icon: "ext",
    crossApp: true,
  },
};

const DISABLED_REASON_LABELS: Record<string, string> = {
  requires_platform_approval: "需平台核准",
  permission_denied: "權限不足",
  not_provisioned: "尚未開通",
};

// Internal tenant-console routes that exist in THIS app today. The packet §4
// sitemap also defines /billing, /notifications, /sla, /integration-governance
// and /feature-flags, but those module surfaces are still landing on their own
// lanes (UI-FE-TEN-BILL / -NTF / -SLA / -IG / -FF) and are not merged into this
// app yet. Until a module route exists here, a descriptor CTA (or the header
// billing CTA) that targets it is narrowed to a disabled, tooltipped affordance
// (§6: the FE may narrow display, never widen availability) instead of an
// enabled link that would 404. Add the route below once its lane merges and the
// canonical deep link lights up with no other change.
const EXISTING_TENANT_ROUTES = new Set<string>([
  "/",
  "/api-keys",
  "/audit",
  "/bookings",
  "/cost-centers",
  "/invoices",
  "/partner",
  "/passengers",
  "/rules",
  "/settings",
  "/users",
  "/webhooks",
]);

const ROUTE_UNAVAILABLE_LABEL = "模組尚未開通";

// A target is reachable when it is an external / cross-app URL, or when its
// first path segment maps to a route that exists in this app today.
function isRouteAvailable(href: string): boolean {
  if (!href.startsWith("/")) return true;
  const segment = href.slice(1).split(/[/?#]/)[0] ?? "";
  return EXISTING_TENANT_ROUTES.has(segment.length > 0 ? `/${segment}` : "/");
}

// Local fallback used ONLY when the governance response does not embed
// `availableActions` (older backend / governance read failed). Mirrors the
// `synthesizeRefreshMetadata` convention: the page prefers the embedded array
// and degrades to this conservative default so the demo still renders a hub.
// The rotate-signing-secret affordance stays visible but disabled when the
// governance package requires platform break-glass approval (Q-X13).
function synthesizeModuleActions(
  data: SettingsData,
): ResourceActionDescriptor[] {
  const breakGlassGated =
    data.governance?.apiKeyPolicy.breakGlassRequiresPlatformApproval ?? true;

  return [
    { action: "manage_billing", enabled: true, riskLevel: "medium" },
    { action: "manage_notifications", enabled: true, riskLevel: "medium" },
    { action: "manage_sla", enabled: true, riskLevel: "medium" },
    { action: "manage_integration", enabled: true, riskLevel: "medium" },
    { action: "manage_users", enabled: true, riskLevel: "medium" },
    { action: "view_feature_flags", enabled: true, riskLevel: "low" },
    {
      action: "rotate_signing_secret",
      enabled: !breakGlassGated,
      riskLevel: "high",
      requiresReason: true,
      ...(breakGlassGated
        ? { disabledReasonCode: "requires_platform_approval" }
        : {}),
    },
    { action: "open_platform_governance", enabled: true, riskLevel: "low" },
  ];
}

// §8(4): consume the embedded descriptors; fall back only when absent. Unknown
// action codes are skipped (no presentation = nothing to render), which keeps
// the FE from widening availability for actions it does not understand (§6).
function resolveModuleActions(data: SettingsData): ModuleAction[] {
  const descriptors =
    data.governance?.availableActions ?? synthesizeModuleActions(data);

  return descriptors.flatMap((descriptor) => {
    const presentation = MODULE_ACTION_PRESENTATION[descriptor.action];
    if (!presentation) return [];
    return [
      {
        descriptor,
        ...presentation,
        routeUnavailable:
          !presentation.crossApp && !isRouteAvailable(presentation.href),
      },
    ];
  });
}

function ModuleActionButton({ action }: { action: ModuleAction }) {
  const { descriptor } = action;
  // §6: a descriptor the backend marks enabled is still narrowed to disabled
  // when its target module route is not yet built here, so the CTA never deep
  // links into a 404. The authority reason (if any) wins over the route note.
  const routeUnavailable = action.routeUnavailable ?? false;
  const disabled = !descriptor.enabled || routeUnavailable;
  const reasonLabel = descriptor.disabledReasonCode
    ? (DISABLED_REASON_LABELS[descriptor.disabledReasonCode] ??
      descriptor.disabledReasonCode)
    : routeUnavailable
      ? ROUTE_UNAVAILABLE_LABEL
      : undefined;

  const button = (
    <CanvasBtn
      theme={th}
      size="sm"
      variant="secondary"
      danger={descriptor.riskLevel === "high"}
      disabled={disabled}
      icon={action.crossApp ? "ext" : action.icon}
    >
      {action.label}
    </CanvasBtn>
  );

  // Disabled affordances stay visible with a tooltip explaining why (Q-X13);
  // high-risk reason-required actions advertise that they collect a reason.
  const title =
    disabled && reasonLabel
      ? reasonLabel
      : descriptor.requiresReason
        ? "需填寫原因"
        : undefined;

  // Disabled actions render as a non-navigating, tooltipped affordance.
  if (disabled) {
    return <span title={title}>{button}</span>;
  }

  const wrapped = title ? <span title={title}>{button}</span> : button;

  if (action.crossApp) {
    // Cross-app deep links open in a new tab (packet §3.10).
    return (
      <a
        href={action.href}
        target="_blank"
        rel="noreferrer"
        style={linkResetStyle}
      >
        {wrapped}
      </a>
    );
  }

  return (
    <Link href={action.href} style={linkResetStyle}>
      {wrapped}
    </Link>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty / not-ready states (Q-X15) — all 6 tenant EmptyReason states distinctly
// ─────────────────────────────────────────────────────────────────────────────

type EmptyStatePresentation = {
  tone: CanvasTone;
  title: string;
  body: string;
  cta?: { label: string; href: string; primary?: boolean };
};

const EMPTY_STATE_PRESENTATION: Record<EmptyReason, EmptyStatePresentation> = {
  no_data: {
    tone: "info",
    title: "尚無租戶設定資料",
    body: "此租戶尚未產生任何設定資料，待初始化完成後即可在此檢視。",
  },
  not_provisioned: {
    tone: "warn",
    title: "租戶設定尚未開通",
    body: "此租戶的設定模組尚未開通，請聯絡平台管理員完成租戶初始化。",
  },
  fetch_failed: {
    tone: "danger",
    title: "無法載入租戶設定",
    body: "讀取租戶身分與設定時發生錯誤，請稍後重新整理再試一次。",
    cta: { label: "重新整理", href: "/settings" },
  },
  permission_denied: {
    tone: "warn",
    title: "沒有檢視權限",
    body: "您目前的角色無法檢視租戶設定，請洽租戶管理員 (tc_admin) 調整權限。",
  },
  external_unavailable: {
    tone: "warn",
    title: "服務暫時無法使用",
    body: "後端設定服務暫時無法回應，這是暫時性狀況，稍後會自動恢復。",
    cta: { label: "重新整理", href: "/settings" },
  },
  driver_not_eligible: {
    // Driver-app-only reason (Q-DRV01); never expected in tenant-console.
    tone: "neutral",
    title: "不適用",
    body: "此狀態不適用於租戶設定。",
  },
  filtered_empty: {
    // Settings has no filter surface; kept for taxonomy completeness.
    tone: "neutral",
    title: "沒有符合條件的設定",
    body: "目前的條件沒有命中任何設定項目。",
    cta: { label: "返回設定", href: "/settings" },
  },
};

function SettingsEmptyState({ reason }: { reason: EmptyReason }) {
  const presentation = EMPTY_STATE_PRESENTATION[reason];
  return (
    <div
      style={{
        padding: "40px 24px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        textAlign: "center",
      }}
    >
      <CanvasPill theme={th} tone={presentation.tone} dot>
        {reason}
      </CanvasPill>
      <div style={{ color: th.text, fontWeight: 600, fontSize: 14 }}>
        {presentation.title}
      </div>
      <div style={{ color: th.textMuted, fontSize: 12.5, maxWidth: 420 }}>
        {presentation.body}
      </div>
      {presentation.cta ? (
        <Link href={presentation.cta.href} style={linkResetStyle}>
          <CanvasBtn
            theme={th}
            size="sm"
            variant={presentation.cta.primary ? "primary" : "secondary"}
          >
            {presentation.cta.label}
          </CanvasBtn>
        </Link>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Refresh freshness (Q-X01): the page consumes the `UiRefreshMetadata` envelope
// embedded on the response and only synthesizes a fallback when it is absent.
// The RefreshTier enum supplies the polling cadence (a separate concern from
// snapshot freshness) so neither value is a bare magic number.
// ─────────────────────────────────────────────────────────────────────────────

function synthesizeRefreshMetadata(
  generatedAt: string,
  freshness: UiRefreshMetadata["dataFreshness"],
): UiRefreshMetadata {
  return {
    generatedAt,
    staleAfterMs: REFRESH_TIER_CADENCE_MS[SETTINGS_REFRESH_TIER] ?? 30000,
    dataFreshness: freshness,
    source: "live",
  };
}

const FRESHNESS_TONE: Record<UiRefreshMetadata["dataFreshness"], CanvasTone> = {
  fresh: "success",
  stale: "warn",
  degraded: "warn",
  unknown: "neutral",
};

const FRESHNESS_LABEL: Record<UiRefreshMetadata["dataFreshness"], string> = {
  fresh: "最新",
  stale: "已過期",
  degraded: "降級資料",
  unknown: "狀態未知",
};

const SOURCE_LABEL: Record<UiRefreshMetadata["source"], string> = {
  live: "即時",
  cache: "快取",
  sandbox: "沙箱",
  static: "靜態",
};

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default async function SettingsPage() {
  const data = await loadSettingsData();

  const cadenceMs = REFRESH_TIER_CADENCE_MS[SETTINGS_REFRESH_TIER] ?? 0;
  const cadenceLabel =
    cadenceMs > 0 ? `每 ${Math.round(cadenceMs / 1000)} 秒` : "手動";

  // Required-datum failure → distinct EmptyReason body (packet §3.6).
  if (data.loadError) {
    return (
      <div>
        <CanvasPageHeader
          theme={th}
          title="租戶設定"
          subtitle="一般 · 通知 · 隱私 · 整合"
          tabs={["一般", "通知", "隱私", "整合"] as ReactNode[]}
          activeTab="一般"
        />
        <div style={pageBodyStyle}>
          <CanvasBanner
            theme={th}
            tone={data.loadError.reason === "fetch_failed" ? "danger" : "warn"}
            icon="warn"
            title="無法載入租戶設定"
            body={data.loadError.message}
          />
          <CanvasCard theme={th} padding={0}>
            <SettingsEmptyState reason={data.loadError.reason} />
          </CanvasCard>
        </div>
      </div>
    );
  }

  const tenantCode = data.identity?.tenantId ?? DEMO_TENANT_ID;
  const displayName = data.billingProfile?.invoiceTitle ?? "未設定";
  const taxId = data.billingProfile?.taxId ?? "未設定";
  const billingContact = data.billingProfile
    ? `${data.billingProfile.contactName ?? "未指派"} · ${data.billingProfile.email}`
    : "未設定";
  const enabledFlags =
    data.flags?.flags.filter((flag) => flag.enabled).length ?? 0;
  const totalFlags = data.flags?.flags.length ?? 0;
  const consentValue = getConsentValue(data.preferences);
  const localeValue = "zh-Hant";
  const timezoneValue = "Asia/Taipei";
  const stageValue = TENANT_CONSOLE_ENV;
  const quotaValue = formatQuotaLimit(data.quotaSummary);
  const statusPrivacyValue = "電話遮罩 · 中介轉接";
  const webhookSignatureValue = data.governance ? "sha256-hmac" : "—";
  const slaValue = formatSlaThresholds(data.sla);
  const enabledSubscriptions = countEnabledSubscriptions(data.preferences);
  const notificationValue =
    enabledSubscriptions === null ? "—" : `${enabledSubscriptions} 條訂閱`;

  const moduleActions = resolveModuleActions(data);

  // §3.2 / Q-X01: prefer the freshness envelope embedded on the governance
  // response; synthesize a fallback only when it (or the read) is absent.
  const refresh =
    data.governance?.refresh ??
    synthesizeRefreshMetadata(
      data.governance?.generatedAt ?? new Date().toISOString(),
      data.governance ? "fresh" : "unknown",
    );
  const refreshTone = FRESHNESS_TONE[refresh.dataFreshness];
  const snapshotLabel = `${FRESHNESS_LABEL[refresh.dataFreshness]} · ${SOURCE_LABEL[refresh.source]} · ${formatDate(refresh.generatedAt)}`;

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="租戶設定"
        subtitle="一般 · 通知 · 隱私 · 整合"
        tabs={["一般", "通知", "隱私", "整合"] as ReactNode[]}
        activeTab="一般"
        actions={
          <>
            {isRouteAvailable("/billing") ? (
              <Link href="/billing" style={linkResetStyle}>
                <CanvasBtn
                  theme={th}
                  size="sm"
                  variant="secondary"
                  icon="billing"
                >
                  計費設定
                </CanvasBtn>
              </Link>
            ) : (
              <span title={ROUTE_UNAVAILABLE_LABEL}>
                <CanvasBtn
                  theme={th}
                  size="sm"
                  variant="secondary"
                  icon="billing"
                  disabled
                >
                  計費設定
                </CanvasBtn>
              </span>
            )}
            <a
              href={`${PLATFORM_ADMIN_BASE_URL}/feature-flags`}
              target="_blank"
              rel="noreferrer"
              style={linkResetStyle}
            >
              <CanvasBtn theme={th} size="sm" variant="ghost" icon="ext">
                平台治理
              </CanvasBtn>
            </a>
          </>
        }
      />

      <div style={pageBodyStyle}>
        {/* Refresh tier wired (packet §3.2): T5 Tenant slow cadence + the
            snapshot freshness consumed from the response envelope (Q-X01). */}
        <div style={freshnessRowStyle}>
          <CanvasPill theme={th} tone={refreshTone} dot>
            T5 · slow
          </CanvasPill>
          <span>{snapshotLabel}</span>
          <span>· 自動更新 {cadenceLabel}</span>
          <Link href="/settings" style={linkResetStyle}>
            <CanvasBtn theme={th} size="xs" variant="ghost" icon="ok">
              重新整理
            </CanvasBtn>
          </Link>
        </div>

        {data.errors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="部分設定資料無法載入"
            body={data.errors.join(" · ")}
          />
        ) : null}

        <div style={contentGridStyle}>
          <CanvasCard theme={th} title="一般">
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
                <CanvasSelect theme={th} value={localeValue} />
              </CanvasField>
              <CanvasField theme={th} label="預設時區">
                <CanvasSelect theme={th} value={timezoneValue} />
              </CanvasField>
            </div>
          </CanvasCard>

          <CanvasCard theme={th} title="當期狀態">
            <CanvasDL
              theme={th}
              cols={1}
              items={[
                { k: "階段", v: stageValue, mono: true },
                { k: "啟用模組", v: `${enabledFlags} / ${totalFlags}` },
                { k: "配額", v: quotaValue, mono: true },
                { k: "SLA 門檻", v: slaValue, mono: true },
                { k: "通知預設", v: notificationValue },
                {
                  k: "webhook 簽章",
                  v: webhookSignatureValue,
                  mono: true,
                },
                { k: "隱私", v: statusPrivacyValue },
                { k: "同意書版本", v: consentValue, mono: true },
              ]}
            />
          </CanvasCard>
        </div>

        {/* availableActions-driven module navigation (Q-X13 + §7 fold-in):
            /settings is the jump-off to the owning modules. CTAs come from
            descriptors, not hard-coded role checks; disabled ones stay visible
            with a tooltip, and the cross-app entry opens in a new tab (§3.10). */}
        <CanvasCard
          theme={th}
          title="設定模組導向"
          subtitle="可用動作由 availableActions 描述驅動 · 跨應用連結另開新分頁"
        >
          <div style={moduleGridStyle}>
            {moduleActions.map((action) => (
              <ModuleActionButton
                key={action.descriptor.action}
                action={action}
              />
            ))}
          </div>
        </CanvasCard>
      </div>
    </div>
  );
}
