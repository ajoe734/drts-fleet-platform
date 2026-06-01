import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type {
  CrossAppResourceLink,
  EmptyReason,
  RefreshTier,
  ResourceActionDescriptor,
  TenantIntegrationReadinessItem,
  TenantIntegrationReadinessSummary,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasIcon,
  CanvasPageHeader,
  CanvasPill,
  type CanvasTone,
  buildCanvasTheme,
} from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

// Icon names used on this page. A subset of `CanvasIconName` — kept as a local
// literal union so the presentation maps stay type-checked without importing the
// (non-re-exported) `CanvasIconName` type from the canvas primitives.
type IconName =
  | "apiKeys"
  | "webhooks"
  | "notifications"
  | "sla"
  | "reports"
  | "flags"
  | "partners"
  | "check"
  | "warn"
  | "plus"
  | "x";

// Q-X02 / packet §3.2 + §5.16: /integration-governance is the T5 "Tenant slow"
// tier (30s). The tier is declared from the contract enum so the cadence is not a
// magic number, and the page renders an explicit refresh affordance per §3.2.
const INTEGRATION_REFRESH_TIER: RefreshTier = "slow";
const REFRESH_TIER_CADENCE_MS: Partial<Record<RefreshTier, number>> = {
  urgent: 5000,
  fast: 3000,
  dispatch: 5000,
  medium: 15000,
  medium_slow: 30000,
  slow: 30000,
  manual: 0,
};

const PAGE_PATH = "/integration-governance";

const dateTimeFormatter = new Intl.DateTimeFormat("sv-SE", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
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

const cardGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 12,
};

const cardHeadStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const cardCodeStyle: CSSProperties = {
  fontSize: 10.5,
  color: th.textDim,
  fontFamily: th.monoFamily,
};

const cardDetailStyle: CSSProperties = {
  fontSize: 12,
  color: th.textMuted,
  marginTop: 8,
  lineHeight: 1.5,
};

const cardFooterStyle: CSSProperties = {
  marginTop: 10,
  display: "flex",
  justifyContent: "flex-end",
  gap: 6,
};

// ─────────────────────────────────────────────────────────────────────────────
// Sub-system presentation (packet §5.16): the 7 aggregated readiness sub-systems
// served by GET /api/tenant/integration-governance/readiness (Q-TEN10).
//
// `route` is an in-app drill target; `crossApp` is a Q-X03 cross-app deep link
// (platform-owned provisioning lives in platform-admin, opened in a new tab).
// ─────────────────────────────────────────────────────────────────────────────

type SubSystem = TenantIntegrationReadinessItem["subSystem"];
type ReadinessStatus = TenantIntegrationReadinessItem["status"];

type SubSystemPresentation = {
  label: string;
  icon: IconName;
  ctaLabel: string;
  route?: string;
  crossApp?: Omit<CrossAppResourceLink, "resourceId">;
};

// Canonical render order — matches the canvas artboard (Tenant Console.html §05).
const SUBSYSTEM_ORDER: SubSystem[] = [
  "api_keys",
  "webhooks",
  "notifications",
  "sla",
  "reports",
  "modules",
  "partner_entries",
];

const SUBSYSTEM_PRESENTATION: Record<SubSystem, SubSystemPresentation> = {
  api_keys: {
    label: "API 金鑰",
    icon: "apiKeys",
    ctaLabel: "發放 API 金鑰",
    route: "/api-keys",
  },
  webhooks: {
    label: "Webhook 端點",
    icon: "webhooks",
    ctaLabel: "設定 Webhook",
    route: "/webhooks",
  },
  notifications: {
    label: "通知路由",
    icon: "notifications",
    ctaLabel: "設定通知路由",
    route: "/notifications",
  },
  sla: {
    label: "SLA 設定檔",
    icon: "sla",
    ctaLabel: "設定 SLA",
    route: "/sla",
  },
  reports: {
    label: "報表可用性",
    icon: "reports",
    ctaLabel: "前往報表",
    route: "/reports",
  },
  modules: {
    label: "模組啟用",
    icon: "flags",
    ctaLabel: "前往模組管理",
    // Module enablement is platform-controlled (tenant /feature-flags is
    // read-only per Q-X16) — drill cross-app to platform-admin in a new tab.
    crossApp: {
      targetApp: "platform-admin",
      route: "/feature-management",
      resourceType: "module_enablement",
      openMode: "new_tab",
      label: "前往平台模組管理",
    },
  },
  partner_entries: {
    label: "Partner 連結",
    icon: "partners",
    ctaLabel: "前往 Partner 管理",
    // Partner entries are provisioned platform-side — no tenant-owned route.
    crossApp: {
      targetApp: "platform-admin",
      route: "/partners",
      resourceType: "partner_entry",
      openMode: "new_tab",
      label: "前往平台 Partner 管理",
    },
  },
};

const STATUS_PRESENTATION: Record<
  ReadinessStatus,
  { tone: CanvasTone; glyph: IconName; label: string }
> = {
  ready: { tone: "success", glyph: "check", label: "就緒" },
  partial: { tone: "warn", glyph: "warn", label: "部分就緒" },
  not_provisioned: { tone: "neutral", glyph: "plus", label: "未開通" },
  blocked: { tone: "danger", glyph: "x", label: "阻擋中" },
};

// ─────────────────────────────────────────────────────────────────────────────
// Data loading — single aggregated endpoint (Q-TEN10), NOT 6+ parallel queries.
// ─────────────────────────────────────────────────────────────────────────────

type IntegrationGovernanceData = {
  summary: TenantIntegrationReadinessSummary | null;
  loadError: { reason: EmptyReason; message: string } | null;
};

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知錯誤";
}

// The tenant endpoints surface failures as `Error("API error <status>: …")`.
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

async function loadIntegrationGovernanceData(): Promise<IntegrationGovernanceData> {
  const client = getTenantClient();
  try {
    // Q-TEN10: one aggregated read; the UI does not orchestrate per-sub-system
    // queries — the backend returns the readiness summary in a single call.
    const summary = await client.get<TenantIntegrationReadinessSummary>(
      "/api/tenant/integration-governance/readiness",
    );
    return { summary, loadError: null };
  } catch (error) {
    return { summary: null, loadError: classifyLoadFailure(error) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// availableActions (Q-X13): the CTA is descriptor-driven. The aggregated item
// carries an optional `nextAction` descriptor; when absent we fall back to a
// low-risk navigation action so the drill affordance is always present.
// ─────────────────────────────────────────────────────────────────────────────

const DISABLED_REASON_LABELS: Record<string, string> = {
  permission_denied: "權限不足",
  not_provisioned: "尚未開通",
  external_unavailable: "服務暫時無法使用",
};

function resolveActionDescriptor(
  item: TenantIntegrationReadinessItem,
): ResourceActionDescriptor {
  return (
    item.nextAction ?? {
      action: `configure_${item.subSystem}`,
      enabled: true,
      riskLevel: "low",
    }
  );
}

function ReadinessCta({
  item,
  presentation,
  tenantId,
}: {
  item: TenantIntegrationReadinessItem;
  presentation: SubSystemPresentation;
  tenantId: string;
}) {
  const descriptor = resolveActionDescriptor(item);
  const disabled = !descriptor.enabled;
  const reasonLabel = descriptor.disabledReasonCode
    ? (DISABLED_REASON_LABELS[descriptor.disabledReasonCode] ??
      descriptor.disabledReasonCode)
    : undefined;

  const crossAppLink: CrossAppResourceLink | undefined = presentation.crossApp
    ? { ...presentation.crossApp, resourceId: tenantId }
    : undefined;

  const button = (
    <CanvasBtn
      theme={th}
      size="xs"
      variant="secondary"
      disabled={disabled}
      icon={crossAppLink ? "ext" : "chevR"}
    >
      {presentation.ctaLabel}
    </CanvasBtn>
  );

  if (disabled) {
    // Disabled affordance stays visible with a tooltip explaining why (Q-X13).
    return <span title={reasonLabel}>{button}</span>;
  }

  // Q-X03 cross-app deep link — opens the owning app in a new tab.
  if (crossAppLink) {
    return (
      <a
        href={crossAppLink.route}
        target={crossAppLink.openMode === "new_tab" ? "_blank" : undefined}
        rel="noopener noreferrer"
        title={crossAppLink.label}
        style={linkResetStyle}
      >
        {button}
      </a>
    );
  }

  if (presentation.route) {
    return (
      <Link href={presentation.route} style={linkResetStyle}>
        {button}
      </Link>
    );
  }

  return button;
}

// ─────────────────────────────────────────────────────────────────────────────
// Readiness card
// ─────────────────────────────────────────────────────────────────────────────

function statusCircleStyle(tone: CanvasTone): CSSProperties {
  const background =
    tone === "success"
      ? th.successBg
      : tone === "warn"
        ? th.warnBg
        : tone === "danger"
          ? th.dangerBg
          : th.surfaceLo;
  const color =
    tone === "success"
      ? th.success
      : tone === "warn"
        ? th.warn
        : tone === "danger"
          ? th.danger
          : th.textMuted;
  return {
    width: 26,
    height: 26,
    borderRadius: 13,
    background,
    color,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  };
}

function ReadinessCard({
  item,
  tenantId,
}: {
  item: TenantIntegrationReadinessItem;
  tenantId: string;
}) {
  const presentation = SUBSYSTEM_PRESENTATION[item.subSystem];
  const status = STATUS_PRESENTATION[item.status];

  return (
    <CanvasCard theme={th}>
      <div style={cardHeadStyle}>
        <span style={statusCircleStyle(status.tone)}>
          <CanvasIcon name={status.glyph} size={13} stroke={2.2} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            {presentation.label}
          </div>
          <div style={cardCodeStyle}>{item.subSystem}</div>
        </div>
        <CanvasPill theme={th} tone={status.tone} dot>
          {status.label}
        </CanvasPill>
      </div>
      <div style={cardDetailStyle}>
        {item.detail ?? "後端未提供此子系統的細節描述。"}
      </div>
      <div style={cardFooterStyle}>
        <ReadinessCta
          item={item}
          presentation={presentation}
          tenantId={tenantId}
        />
      </div>
    </CanvasCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty / not-ready states (Q-X15) — all 6 tenant EmptyReason states distinctly.
// `driver_not_eligible` is a driver-app-only reason (Q-DRV01); it is mapped to a
// "not applicable" presentation so the union stays exhaustive.
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
    title: "尚未回報整合就緒度",
    body: "此租戶目前沒有任何整合子系統的就緒度資料，請先從 API 金鑰或 Webhook 開始設定。",
    cta: { label: "設定 Webhook", href: "/webhooks", primary: true },
  },
  not_provisioned: {
    tone: "warn",
    title: "整合治理尚未開通",
    body: "此租戶的整合治理聚合端點 (Q-TEN10) 尚未開通，請聯絡平台管理員完成設定。",
  },
  fetch_failed: {
    tone: "danger",
    title: "無法載入整合就緒度",
    body: "讀取 readiness 聚合端點時發生錯誤，請稍後重新整理再試一次。",
    cta: { label: "重新整理", href: PAGE_PATH },
  },
  permission_denied: {
    tone: "warn",
    title: "沒有檢視權限",
    body: "您目前的角色無法檢視此租戶的整合治理，請洽租戶管理員調整權限 (tc_admin / tc_integration_mgr)。",
  },
  external_unavailable: {
    tone: "warn",
    title: "服務暫時無法使用",
    body: "後端整合治理服務暫時無法回應，這是暫時性狀況，稍後會自動恢復。",
    cta: { label: "重新整理", href: PAGE_PATH },
  },
  driver_not_eligible: {
    // Driver-app-only reason (Q-DRV01); never expected in tenant-console.
    tone: "neutral",
    title: "不適用",
    body: "此狀態不適用於租戶整合治理。",
  },
  filtered_empty: {
    tone: "neutral",
    title: "沒有符合條件的子系統",
    body: "目前的篩選沒有命中任何整合子系統，請清除篩選後再檢視。",
    cta: { label: "清除篩選", href: PAGE_PATH },
  },
};

function IntegrationEmptyState({ reason }: { reason: EmptyReason }) {
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
      <div style={{ color: th.textMuted, fontSize: 12.5, maxWidth: 440 }}>
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
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return dateTimeFormatter.format(parsed).replace(",", "");
}

function orderItems(
  items: TenantIntegrationReadinessItem[],
): TenantIntegrationReadinessItem[] {
  return [...items].sort(
    (left, right) =>
      SUBSYSTEM_ORDER.indexOf(left.subSystem) -
      SUBSYSTEM_ORDER.indexOf(right.subSystem),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default async function IntegrationGovernancePage() {
  const { summary, loadError } = await loadIntegrationGovernanceData();

  const items = summary ? orderItems(summary.items) : [];

  // Resolve which EmptyReason (if any) governs the body.
  const emptyReason: EmptyReason | null = loadError
    ? loadError.reason
    : items.length === 0
      ? "no_data"
      : null;

  const readyCount = items.filter((item) => item.status === "ready").length;
  const totalCount = items.length;

  const cadenceMs = REFRESH_TIER_CADENCE_MS[INTEGRATION_REFRESH_TIER] ?? 0;
  const cadenceLabel =
    cadenceMs > 0 ? `每 ${Math.round(cadenceMs / 1000)} 秒` : "手動";

  const tenantId = summary?.tenantId ?? "—";

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="Integration Governance"
        subtitle="aggregated readiness · 來自 GET /api/tenant/integration-governance/readiness (Q-TEN10 · 單一聚合 endpoint，非 6+ 個並行查詢)"
        actions={
          totalCount > 0 ? (
            <CanvasPill
              theme={th}
              tone={readyCount === totalCount ? "success" : "warn"}
              dot
            >
              {readyCount} of {totalCount} ready
            </CanvasPill>
          ) : undefined
        }
      />

      <div style={pageBodyStyle}>
        <div style={freshnessRowStyle}>
          <CanvasPill theme={th} tone="neutral" dot>
            T5 · slow
          </CanvasPill>
          <span>自動更新 {cadenceLabel}</span>
          {summary ? <span>更新於 {formatDateTime(summary.computedAt)}</span> : null}
          <Link href={PAGE_PATH} style={linkResetStyle}>
            <CanvasBtn theme={th} size="xs" variant="ghost" icon="ok">
              重新整理
            </CanvasBtn>
          </Link>
        </div>

        <CanvasBanner
          theme={th}
          tone="info"
          icon="integrationGov"
          title="本頁透過 1 個 aggregated endpoint 拉資料 · 不是 6+ 個並行查詢"
          body="UI 不負責 orchestrate 多個無關 query — 後端統一回 readiness summary，前端只負責 render 與導流 (Q-TEN10)。"
        />

        {loadError ? (
          <CanvasBanner
            theme={th}
            tone={loadError.reason === "fetch_failed" ? "danger" : "warn"}
            icon="warn"
            title="無法載入整合就緒度"
            body={loadError.message}
          />
        ) : null}

        {emptyReason ? (
          <CanvasCard theme={th} padding={0}>
            <IntegrationEmptyState reason={emptyReason} />
          </CanvasCard>
        ) : (
          <div style={cardGridStyle}>
            {items.map((item) => (
              <ReadinessCard
                key={item.subSystem}
                item={item}
                tenantId={tenantId}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
