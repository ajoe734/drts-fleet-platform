import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type {
  CrossAppResourceLink,
  EmptyReason,
  ResourceActionDescriptor,
  TenantIntegrationReadinessItem,
  TenantIntegrationReadinessSummary,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasCard,
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

const PLATFORM_ADMIN_URL = process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL;
const OPS_CONSOLE_URL = process.env.NEXT_PUBLIC_OPS_CONSOLE_URL;

const monoStyle: CSSProperties = {
  fontFamily: th.monoFamily,
};

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const boardStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 12,
};

const secondaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 12,
};

const emptyGalleryStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const mutedCopyStyle: CSSProperties = {
  margin: 0,
  color: th.textMuted,
  fontSize: 12.5,
  lineHeight: 1.55,
};

const subtleCopyStyle: CSSProperties = {
  color: th.textDim,
  fontSize: 10.5,
  lineHeight: 1.5,
};

const actionStripStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};

const tileHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
};

const tileFooterStyle: CSSProperties = {
  marginTop: 10,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
};

const pillToneByStatus: Record<
  TenantIntegrationReadinessItem["status"],
  CanvasTone
> = {
  ready: "success",
  partial: "warn",
  blocked: "danger",
  not_provisioned: "neutral",
};

const subsystemOrder: TenantIntegrationReadinessItem["subSystem"][] = [
  "api_keys",
  "webhooks",
  "notifications",
  "sla",
  "reports",
  "modules",
  "partner_entries",
];

type QuickActionDisplay = ResourceActionDescriptor & {
  href: string;
  source: string;
};

const subSystemMeta: Record<
  TenantIntegrationReadinessItem["subSystem"],
  {
    label: string;
    code: string;
    href: string;
    fallbackDetail: string;
    emptyReason?: EmptyReason;
    emptyBody?: string;
  }
> = {
  api_keys: {
    label: "API 金鑰",
    code: "api_keys",
    href: "/api-keys",
    fallbackDetail: "Active keys, expiring keys, and missing scope coverage.",
  },
  webhooks: {
    label: "Webhook",
    code: "webhooks",
    href: "/webhooks",
    fallbackDetail:
      "Endpoint count, delivery failure rate, and engine availability.",
  },
  notifications: {
    label: "通知路由",
    code: "notifications",
    href: "/settings#notifications",
    fallbackDetail: "Configured channels across inbox, email, and webhook.",
  },
  sla: {
    label: "SLA 設定檔",
    code: "sla_profile",
    href: "/settings#sla",
    fallbackDetail: "Wait, arrival, and completion thresholds are evaluated.",
  },
  reports: {
    label: "報表可用性",
    code: "reports",
    href: "/reports",
    fallbackDetail: "Runnable jobs and report artifact availability.",
  },
  modules: {
    label: "模組啟用",
    code: "modules",
    href: "/settings",
    fallbackDetail: "Tenant-facing module posture and visibility state.",
  },
  partner_entries: {
    label: "合作夥伴 entries",
    code: "partner_entries",
    href: "/partner",
    fallbackDetail: "Partner-linked ingress posture when entries exist.",
    emptyReason: "not_provisioned",
    emptyBody:
      "This tenant has no partner entry yet, so the lane stays distinct.",
  },
};

const emptyReasonMeta: Record<
  EmptyReason,
  {
    title: string;
    body: string;
    glyph: string;
    tone: CanvasTone;
    href: string;
    actionLabel: string;
  }
> = {
  no_data: {
    title: "No readiness data yet",
    body: "The tenant route is live, but no aggregated readiness snapshot has been published yet.",
    glyph: "00",
    tone: "neutral",
    href: "/api-keys",
    actionLabel: "Start with API keys",
  },
  not_provisioned: {
    title: "First-time setup required",
    body: "The tenant exists but one or more integration lanes still require first-time provisioning.",
    glyph: "NP",
    tone: "warn",
    href: "/webhooks",
    actionLabel: "Set up webhook",
  },
  fetch_failed: {
    title: "Snapshot fetch failed",
    body: "The aggregated readiness endpoint did not return a usable payload for this request.",
    glyph: "FF",
    tone: "danger",
    href: "/integration-governance",
    actionLabel: "Retry snapshot",
  },
  permission_denied: {
    title: "Access is read-restricted",
    body: "The current actor can land on the route shell but cannot read the readiness summary.",
    glyph: "PD",
    tone: "danger",
    href: "/users",
    actionLabel: "Review tenant roles",
  },
  external_unavailable: {
    title: "External dependency unavailable",
    body: "One or more upstream integrations that feed the aggregated view are degraded or offline.",
    glyph: "EX",
    tone: "warn",
    href: "/webhooks",
    actionLabel: "Inspect delivery posture",
  },
  filtered_empty: {
    title: "Current filter returns nothing",
    body: "The route is healthy, but the current filter leaves no subsystem cards in the result set.",
    glyph: "FX",
    tone: "info",
    href: "/integration-governance",
    actionLabel: "Clear filters",
  },
  driver_not_eligible: {
    title: "Driver-only empty reason",
    body: "This global empty reason should never be used to drive tenant integration governance.",
    glyph: "DN",
    tone: "neutral",
    href: "/integration-governance",
    actionLabel: "Back to readiness",
  },
};

type PageData = {
  summary: TenantIntegrationReadinessSummary | null;
  errors: string[];
};

function normalizeQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isEmptyReason(value: string | undefined): value is EmptyReason {
  return Boolean(
    value && value in emptyReasonMeta && value !== "driver_not_eligible",
  );
}

function toErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Unknown integration readiness error.";
}

async function loadPageData(): Promise<PageData> {
  const client = getTenantClient();

  try {
    return {
      summary:
        (await client.getTenantIntegrationReadinessSummary()) as TenantIntegrationReadinessSummary,
      errors: [],
    };
  } catch (error) {
    return {
      summary: null,
      errors: [toErrorMessage(error)],
    };
  }
}

function getSubSystemMeta(
  subSystem: TenantIntegrationReadinessItem["subSystem"],
) {
  return subSystemMeta[subSystem]!;
}

function getEmptyReasonMeta(reason: EmptyReason) {
  return emptyReasonMeta[reason]!;
}

function getStatusTone(
  status: TenantIntegrationReadinessItem["status"],
): CanvasTone {
  return pillToneByStatus[status] ?? "neutral";
}

function getStatusLabel(status: TenantIntegrationReadinessItem["status"]) {
  return status.replaceAll("_", " ");
}

function getStatusAccent(status: TenantIntegrationReadinessItem["status"]) {
  switch (status) {
    case "ready":
      return { glyph: "OK", background: th.successBg, color: th.success };
    case "partial":
      return { glyph: "!", background: th.warnBg, color: th.warn };
    case "blocked":
      return { glyph: "X", background: th.dangerBg, color: th.danger };
    case "not_provisioned":
    default:
      return { glyph: "?", background: th.surfaceLo, color: th.textMuted };
  }
}

function getActionHref(action: string, fallbackHref: string) {
  switch (action) {
    case "issue_api_key":
      return "/api-keys";
    case "create_webhook_endpoint":
      return "/webhooks";
    case "update_notifications":
      return "/settings#notifications";
    case "update_sla_profile":
      return "/settings#sla";
    case "create_report_job":
      return "/reports";
    default:
      return fallbackHref;
  }
}

function getActionLabel(action: string) {
  switch (action) {
    case "issue_api_key":
      return "核發 API 金鑰";
    case "create_webhook_endpoint":
      return "設定 Webhook";
    case "update_notifications":
      return "設定通知";
    case "update_sla_profile":
      return "設定 SLA";
    case "create_report_job":
      return "建立報表工作";
    default:
      return action.replaceAll("_", " ");
  }
}

function actionButtonStyle(enabled: boolean, emphasis = false): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 30,
    padding: "6px 12px",
    borderRadius: 999,
    border: `1px solid ${enabled ? (emphasis ? th.accentBorder : th.accent) : th.border}`,
    background: enabled ? (emphasis ? th.accent : "transparent") : th.surface,
    color: enabled ? (emphasis ? "#ffffff" : th.accentHi) : th.textMuted,
    textDecoration: "none",
    fontSize: 11.5,
    fontWeight: 600,
    pointerEvents: enabled ? "auto" : "none",
    opacity: enabled ? 1 : 0.72,
  };
}

function linkStyle(emphasis = false): CSSProperties {
  return {
    color: emphasis ? th.accentHi : th.accent,
    textDecoration: "none",
    fontSize: emphasis ? 12.5 : 12,
    fontWeight: emphasis ? 600 : 500,
  };
}

function getActionAssistiveCopy(action: ResourceActionDescriptor) {
  if (!action.enabled && action.disabledReasonCode) {
    return `Unavailable: ${action.disabledReasonCode}`;
  }
  if (!action.enabled) {
    return "無資料";
  }
  return undefined;
}

function renderActionLink(
  action: ResourceActionDescriptor,
  href: string,
  children: ReactNode,
  emphasis = false,
) {
  const assistiveCopy = getActionAssistiveCopy(action);

  if (!action.enabled) {
    return (
      <span
        aria-disabled="true"
        title={assistiveCopy}
        style={actionButtonStyle(false, emphasis)}
      >
        {children}
      </span>
    );
  }

  return (
    <Link
      href={href}
      aria-label={assistiveCopy}
      style={actionButtonStyle(true, emphasis)}
    >
      {children}
    </Link>
  );
}

function formatDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(parsed)
    .replace(",", "");
}

function buildDisplayItems(items: TenantIntegrationReadinessItem[]) {
  const itemMap = new Map(items.map((item) => [item.subSystem, item]));

  return subsystemOrder.map((subSystem) => {
    const item = itemMap.get(subSystem);
    if (item) {
      return item;
    }

    const meta = getSubSystemMeta(subSystem);
    return {
      subSystem,
      status:
        meta.emptyReason === "not_provisioned" ? "not_provisioned" : "blocked",
      detail:
        meta.emptyReason === "not_provisioned"
          ? (meta.emptyBody ??
            "This subsystem has not been provisioned for the tenant yet.")
          : "The aggregated payload did not return this subsystem. Verify upstream readiness evidence.",
    } satisfies TenantIntegrationReadinessItem;
  });
}

function dedupeActions(items: TenantIntegrationReadinessItem[]) {
  const actions = new Map<string, QuickActionDisplay>();

  for (const item of items) {
    if (!item.nextAction) {
      continue;
    }

    const meta = getSubSystemMeta(item.subSystem);
    const candidate = {
      ...item.nextAction,
      href: getActionHref(item.nextAction.action, meta.href),
      source: meta.label,
    };
    const existing = actions.get(candidate.action);

    if (!existing || (!existing.enabled && candidate.enabled)) {
      actions.set(candidate.action, candidate);
    }
  }

  return [...actions.values()].sort((left, right) => {
    if (left.enabled !== right.enabled) {
      return left.enabled ? -1 : 1;
    }
    return left.action.localeCompare(right.action, "en");
  });
}

function getStateVariant(items: TenantIntegrationReadinessItem[]) {
  if (items.every((item) => item.status === "ready")) {
    return {
      label: "完全就緒",
      tone: "success" as CanvasTone,
      body: "All seven integration lanes report green from the aggregated snapshot.",
    };
  }

  if (items.every((item) => item.status === "not_provisioned")) {
    return {
      label: "首次設定",
      tone: "warn" as CanvasTone,
      body: "The tenant exists, but every tracked lane still requires first-time setup.",
    };
  }

  return {
    label: "部分就緒",
    tone: "info" as CanvasTone,
    body: "Some subsystem lanes remain yellow or red, so follow-up actions stay visible.",
  };
}

function buildCrossAppHref(link: CrossAppResourceLink) {
  const baseUrl =
    link.targetApp === "platform-admin" ? PLATFORM_ADMIN_URL : OPS_CONSOLE_URL;
  if (!baseUrl) {
    return null;
  }
  return `${baseUrl.replace(/\/$/, "")}${link.route}`;
}

function buildCrossAppLinks(
  tenantId: string,
  items: TenantIntegrationReadinessItem[],
) {
  const links: CrossAppResourceLink[] = [
    {
      targetApp: "platform-admin",
      route: `/tenant-governance?tenantId=${encodeURIComponent(tenantId)}`,
      resourceType: "tenant",
      resourceId: tenantId,
      openMode: "new_tab",
      label: "Open tenant governance in Platform Admin",
    },
  ];

  const webhookItem = items.find((item) => item.subSystem === "webhooks");
  if (webhookItem && webhookItem.status !== "ready") {
    links.push({
      targetApp: "ops-console",
      route: `/audit?tenantId=${encodeURIComponent(tenantId)}&module=webhooks`,
      resourceType: "tenant_audit",
      resourceId: tenantId,
      openMode: "new_tab",
      label: "Open webhook-linked audit lane in Ops Console",
    });
  }

  const partnerItem = items.find(
    (item) => item.subSystem === "partner_entries",
  );
  if (partnerItem && partnerItem.status !== "ready") {
    links.push({
      targetApp: "platform-admin",
      route: `/partners?tenantId=${encodeURIComponent(tenantId)}`,
      resourceType: "tenant_partner_entry",
      resourceId: tenantId,
      openMode: "new_tab",
      label: "Inspect partner entry ownership in Platform Admin",
    });
  }

  return links;
}

function EmptyReasonPreviewCard({
  reason,
  selected,
}: {
  reason: EmptyReason;
  selected: boolean;
}) {
  const meta = getEmptyReasonMeta(reason);

  return (
    <CanvasCard
      theme={th}
      style={{
        borderColor: selected ? th.accentBorder : th.border,
        background: selected ? "rgba(15, 118, 110, 0.12)" : th.surface,
      }}
    >
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background:
                meta.tone === "danger"
                  ? th.dangerBg
                  : meta.tone === "warn"
                    ? th.warnBg
                    : meta.tone === "info"
                      ? "rgba(56, 189, 248, 0.12)"
                      : th.surfaceLo,
              color:
                meta.tone === "danger"
                  ? th.danger
                  : meta.tone === "warn"
                    ? th.warn
                    : meta.tone === "info"
                      ? "#38bdf8"
                      : th.textMuted,
              ...monoStyle,
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {meta.glyph}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{meta.title}</div>
            <div style={{ ...monoStyle, ...subtleCopyStyle }}>{reason}</div>
          </div>
        </div>
        <p style={mutedCopyStyle}>{meta.body}</p>
        <Link href={`?emptyReason=${reason}`} style={linkStyle(true)}>
          {selected ? "Current variant" : "Preview this empty state"}
        </Link>
      </div>
    </CanvasCard>
  );
}

function ReadinessTile({ item }: { item: TenantIntegrationReadinessItem }) {
  const meta = getSubSystemMeta(item.subSystem);
  const accent = getStatusAccent(item.status);
  const action = item.nextAction;
  const actionHref = action
    ? getActionHref(action.action, meta.href)
    : meta.href;

  return (
    <CanvasCard theme={th}>
      <div style={{ display: "grid", gap: 10 }}>
        <div style={tileHeaderStyle}>
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 13,
              background: accent.background,
              color: accent.color,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              ...monoStyle,
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {accent.glyph}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{meta.label}</div>
            <div style={{ ...monoStyle, ...subtleCopyStyle }}>{meta.code}</div>
          </div>
          <CanvasPill theme={th} tone={getStatusTone(item.status)} dot>
            {getStatusLabel(item.status)}
          </CanvasPill>
        </div>

        <p style={mutedCopyStyle}>{item.detail ?? meta.fallbackDetail}</p>

        {!action && item.status === "not_provisioned" ? (
          <div style={subtleCopyStyle}>
            Distinct from `no_data`: this lane is intentionally present but not
            provisioned yet.
          </div>
        ) : null}

        {!action && item.subSystem === "partner_entries" ? (
          <div style={subtleCopyStyle}>
            Partner-linked investigations remain cross-app and hand off to
            Platform Admin.
          </div>
        ) : null}

        <div style={tileFooterStyle}>
          <Link href={meta.href} style={linkStyle()}>
            Open module
          </Link>
          {action ? (
            renderActionLink(
              action,
              actionHref,
              `${getActionLabel(action.action)} ->`,
              true,
            )
          ) : (
            <span style={actionButtonStyle(true, false)}>{"Inspect ->"}</span>
          )}
        </div>

        {action && !action.enabled ? (
          <div style={subtleCopyStyle}>{getActionAssistiveCopy(action)}</div>
        ) : null}
      </div>
    </CanvasCard>
  );
}

export default async function IntegrationGovernancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const forcedEmptyReason = normalizeQueryValue(
    resolvedSearchParams.emptyReason,
  );
  const previewEmptyReason = isEmptyReason(forcedEmptyReason)
    ? forcedEmptyReason
    : null;
  const data = previewEmptyReason
    ? { summary: null, errors: [] }
    : await loadPageData();

  const summary = data.summary;
  const hasSnapshot = Boolean(summary && summary.items.length > 0);
  const items = buildDisplayItems(summary?.items ?? []);
  const readyCount = items.filter((item) => item.status === "ready").length;
  const quickActions = dedupeActions(items);
  const crossAppLinks = summary
    ? buildCrossAppLinks(summary.tenantId, items)
    : [];
  const stateVariant = getStateVariant(items);
  const selectedEmptyReason =
    previewEmptyReason ??
    (data.errors.length > 0 ? "fetch_failed" : hasSnapshot ? null : "no_data");
  const selectedEmptyMeta = selectedEmptyReason
    ? getEmptyReasonMeta(selectedEmptyReason)
    : null;

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="整合就緒度"
        subtitle="aggregated readiness · 來自 GET /api/tenant/integration-governance/readiness (Q-TEN10 · 單一聚合 endpoint，非 6+ 個查詢)"
        actions={
          <>
            <CanvasPill theme={th} tone="success" dot>
              T5 slow
            </CanvasPill>
            <CanvasPill
              theme={th}
              tone={hasSnapshot ? stateVariant.tone : "neutral"}
              dot={hasSnapshot}
            >
              {hasSnapshot
                ? `${readyCount} of ${items.length} ready`
                : "No snapshot"}
            </CanvasPill>
          </>
        }
      />

      <div style={pageBodyStyle}>
        <CanvasBanner
          theme={th}
          tone="info"
          title="本頁透過 1 個 aggregated endpoint 拉資料 · 不是 6+ 個並行查詢"
          body="UI 不應 orchestrate 多個無關 query。可操作 CTA 來自 backend 回傳的 action descriptor，refresh tier 固定為 tenant slow (T5)。"
        />

        {selectedEmptyReason && selectedEmptyMeta ? (
          <>
            <CanvasCard theme={th}>
              <div style={{ display: "grid", gap: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 16,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background:
                        selectedEmptyMeta.tone === "danger"
                          ? th.dangerBg
                          : selectedEmptyMeta.tone === "warn"
                            ? th.warnBg
                            : selectedEmptyMeta.tone === "info"
                              ? "rgba(56, 189, 248, 0.12)"
                              : th.surfaceLo,
                      color:
                        selectedEmptyMeta.tone === "danger"
                          ? th.danger
                          : selectedEmptyMeta.tone === "warn"
                            ? th.warn
                            : selectedEmptyMeta.tone === "info"
                              ? "#38bdf8"
                              : th.textMuted,
                      ...monoStyle,
                      fontWeight: 700,
                    }}
                  >
                    {selectedEmptyMeta.glyph}
                  </div>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
                      {selectedEmptyMeta.title}
                    </h2>
                    <p style={{ margin: "6px 0 0", ...mutedCopyStyle }}>
                      {selectedEmptyMeta.body}
                    </p>
                  </div>
                </div>

                <div style={actionStripStyle}>
                  <Link
                    href={selectedEmptyMeta.href}
                    style={actionButtonStyle(true, true)}
                  >
                    {selectedEmptyMeta.actionLabel}
                  </Link>
                  <Link href="/integration-governance" style={linkStyle()}>
                    Return to live snapshot
                  </Link>
                </div>

                {data.errors.length > 0 ? (
                  <div
                    style={{
                      padding: "12px 14px",
                      borderRadius: 12,
                      border: `1px solid ${th.border}`,
                      background: th.surfaceLo,
                      display: "grid",
                      gap: 6,
                    }}
                  >
                    {data.errors.map((error) => (
                      <div
                        key={error}
                        style={{ ...monoStyle, ...mutedCopyStyle }}
                      >
                        {error}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </CanvasCard>

            <div style={secondaryGridStyle}>
              <CanvasCard theme={th}>
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    EmptyReason coverage
                  </div>
                  <p style={mutedCopyStyle}>
                    Reviewer can preview all six tenant-relevant empty states
                    from this route with
                    <span style={monoStyle}> ?emptyReason=&lt;reason&gt;</span>.
                  </p>
                  <div style={{ ...monoStyle, ...subtleCopyStyle }}>
                    supported · no_data / not_provisioned / fetch_failed /
                    permission_denied / external_unavailable / filtered_empty
                  </div>
                </div>
              </CanvasCard>

              <CanvasCard theme={th}>
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    Refresh tier
                  </div>
                  <p style={mutedCopyStyle}>
                    This screen remains on T5 tenant-slow cadence even when the
                    current route is rendering an empty variant.
                  </p>
                  <div style={{ ...monoStyle, ...subtleCopyStyle }}>
                    cadence · T5 / tenant slow
                  </div>
                </div>
              </CanvasCard>
            </div>

            <div style={emptyGalleryStyle}>
              {(
                [
                  "no_data",
                  "not_provisioned",
                  "fetch_failed",
                  "permission_denied",
                  "external_unavailable",
                  "filtered_empty",
                ] as EmptyReason[]
              ).map((reason) => (
                <EmptyReasonPreviewCard
                  key={reason}
                  reason={reason}
                  selected={reason === selectedEmptyReason}
                />
              ))}
            </div>
          </>
        ) : (
          <>
            <CanvasCard theme={th}>
              <div style={{ display: "grid", gap: 14 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                    alignItems: "flex-start",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      Aggregated readiness board
                    </div>
                    <p style={{ marginTop: 6, ...mutedCopyStyle }}>
                      Seven subsystem lanes render from one readiness payload.
                      Drill targets stay module-specific, and quick CTAs only
                      appear when the backend returns an action descriptor.
                    </p>
                  </div>
                  <div style={actionStripStyle}>
                    <CanvasPill theme={th} tone={stateVariant.tone} dot>
                      {stateVariant.label}
                    </CanvasPill>
                    <CanvasPill theme={th} tone="neutral">
                      7 subsystem lanes
                    </CanvasPill>
                    <CanvasPill theme={th} tone="neutral">
                      snapshot {formatDateTime(summary!.computedAt)}
                    </CanvasPill>
                  </div>
                </div>

                <div style={actionStripStyle}>
                  {quickActions.length > 0 ? (
                    quickActions.map((action) => (
                      <div
                        key={action.action}
                        style={{ display: "grid", gap: 4 }}
                      >
                        {renderActionLink(
                          action,
                          action.href,
                          getActionLabel(action.action),
                          true,
                        )}
                        <span style={subtleCopyStyle}>{action.source}</span>
                      </div>
                    ))
                  ) : (
                    <CanvasPill theme={th} tone="success" dot>
                      No follow-up action
                    </CanvasPill>
                  )}
                </div>

                <div style={boardStyle}>
                  {items.map((item) => (
                    <ReadinessTile key={item.subSystem} item={item} />
                  ))}
                </div>
              </div>
            </CanvasCard>

            <div style={secondaryGridStyle}>
              <CanvasCard theme={th}>
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    Refresh tier
                  </div>
                  <p style={mutedCopyStyle}>
                    Packet §5.16 puts this route on T5. The page keeps that
                    cadence explicit instead of pretending the summary is
                    real-time.
                  </p>
                  <div style={{ ...monoStyle, ...subtleCopyStyle }}>
                    cadence · T5 / tenant slow
                  </div>
                  <div style={{ ...monoStyle, ...subtleCopyStyle }}>
                    computedAt · {formatDateTime(summary!.computedAt)}
                  </div>
                </div>
              </CanvasCard>

              <CanvasCard theme={th}>
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    Cross-app drill targets
                  </div>
                  <p style={mutedCopyStyle}>
                    When the next investigation step belongs to another app, the
                    route deep-links out in a new tab instead of inventing a
                    local mirror.
                  </p>
                  <div style={{ display: "grid", gap: 8 }}>
                    {crossAppLinks.map((link) => {
                      const href = buildCrossAppHref(link);
                      return href ? (
                        <a
                          key={`${link.targetApp}-${link.route}`}
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          style={linkStyle(true)}
                        >
                          {link.label}
                        </a>
                      ) : (
                        <div
                          key={`${link.targetApp}-${link.route}`}
                          style={{ display: "grid", gap: 4 }}
                        >
                          <span style={linkStyle(true)}>{link.label}</span>
                          <span style={subtleCopyStyle}>
                            Configure
                            <span style={monoStyle}>
                              {" "}
                              NEXT_PUBLIC_
                              {link.targetApp === "platform-admin"
                                ? "PLATFORM_ADMIN"
                                : "OPS_CONSOLE"}
                              _URL
                            </span>{" "}
                            to activate this deep link.
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CanvasCard>

              <CanvasCard theme={th}>
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    QA variants
                  </div>
                  <p style={mutedCopyStyle}>
                    This route still exposes the six tenant-relevant
                    `EmptyReason` previews for review coverage.
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {(
                      [
                        "no_data",
                        "not_provisioned",
                        "fetch_failed",
                        "permission_denied",
                        "external_unavailable",
                        "filtered_empty",
                      ] as EmptyReason[]
                    ).map((reason) => (
                      <Link
                        key={reason}
                        href={`?emptyReason=${reason}`}
                        style={linkStyle()}
                      >
                        {reason}
                      </Link>
                    ))}
                  </div>
                </div>
              </CanvasCard>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
