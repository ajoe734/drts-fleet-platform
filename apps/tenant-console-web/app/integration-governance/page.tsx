import Link from "next/link";
import type { CSSProperties } from "react";
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
  CanvasIcon,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  buildCanvasTheme,
} from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";
import { IntegrationGovernanceRefreshControl } from "./refresh-control";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const PLATFORM_ADMIN_URL =
  process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ?? "http://localhost:3002";

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 12,
};

const overviewGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.7fr) minmax(260px, 0.9fr)",
  gap: 16,
  alignItems: "stretch",
};

const overviewPanelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  minHeight: 188,
  justifyContent: "space-between",
};

const readinessScoreStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-end",
  gap: 12,
  flexWrap: "wrap",
};

const readinessValueStyle: CSSProperties = {
  color: th.text,
  fontSize: 56,
  fontWeight: 700,
  lineHeight: 0.95,
};

const readinessMetaStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 12.5,
  lineHeight: 1.6,
  maxWidth: 440,
};

const readinessStripStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
  gap: 10,
};

const readinessStripItemStyle: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: `1px solid ${th.border}`,
  background: th.surface,
};

const readinessStripLabelStyle: CSSProperties = {
  color: th.textDim,
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: 0.28,
  textTransform: "uppercase",
};

const readinessStripValueStyle: CSSProperties = {
  marginTop: 6,
  color: th.text,
  fontSize: 20,
  fontWeight: 650,
};

const contentGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 2.2fr) minmax(280px, 1fr)",
  gap: 16,
  alignItems: "start",
};

const cardsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const sidebarStackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const filterRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};

const clusterStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};

const cardHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
};

const cardTitleStyle: CSSProperties = {
  color: th.text,
  fontWeight: 600,
  lineHeight: 1.25,
};

const cardCodeStyle: CSSProperties = {
  marginTop: 4,
  color: th.textDim,
  fontSize: 11,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
};

const cardDetailStyle: CSSProperties = {
  marginTop: 10,
  color: th.textMuted,
  fontSize: 12.5,
  lineHeight: 1.5,
  minHeight: 57,
};

const cardFooterStyle: CSSProperties = {
  marginTop: 12,
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};

const actionLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  minHeight: 28,
  padding: "5px 10px",
  borderRadius: 7,
  border: `1px solid ${th.border}`,
  background: th.surface,
  color: th.text,
  textDecoration: "none",
  fontSize: 12,
  fontWeight: 500,
};

const primaryActionLinkStyle: CSSProperties = {
  ...actionLinkStyle,
  background: th.accent,
  borderColor: th.accent,
  color: "#fff",
};

const disabledActionStyle: CSSProperties = {
  ...actionLinkStyle,
  opacity: 0.58,
  cursor: "not-allowed",
};

const noteListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const noteItemStyle: CSSProperties = {
  paddingBottom: 10,
  borderBottom: `1px solid ${th.border}`,
};

const emptyShellStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  alignItems: "flex-start",
  padding: 8,
};

const emptySymbolStyle: CSSProperties = {
  width: 42,
  height: 42,
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const readinessLabel: Record<
  TenantIntegrationReadinessItem["subSystem"],
  string
> = {
  api_keys: "API keys",
  webhooks: "Webhooks",
  notifications: "Notifications routing",
  sla: "SLA profile",
  reports: "Reports availability",
  modules: "Module enablement",
  partner_entries: "Partner entries",
};

const readinessHref: Record<
  TenantIntegrationReadinessItem["subSystem"],
  string
> = {
  api_keys: "/api-keys",
  webhooks: "/webhooks",
  notifications: "/notifications",
  sla: "/sla",
  reports: "/reports",
  modules: "/feature-flags",
  partner_entries: "/settings",
};

const statusTone: Record<
  TenantIntegrationReadinessItem["status"],
  "success" | "warn" | "neutral" | "danger"
> = {
  ready: "success",
  partial: "warn",
  not_provisioned: "neutral",
  blocked: "danger",
};

const statusCopy: Record<TenantIntegrationReadinessItem["status"], string> = {
  ready: "ready",
  partial: "partial",
  not_provisioned: "not provisioned",
  blocked: "blocked",
};

type SearchParams = Record<string, string | string[] | undefined>;
type TenantEmptyReason = Exclude<EmptyReason, "driver_not_eligible">;

type Filters = {
  status: TenantIntegrationReadinessItem["status"] | "all";
  demoReason: TenantEmptyReason | null;
};

type PageData = {
  summary: TenantIntegrationReadinessSummary | null;
  emptyReason: TenantEmptyReason | null;
  loadError: string | null;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseFilters(searchParams: SearchParams): Filters {
  const requestedStatus = firstParam(searchParams.status);
  const requestedReason = firstParam(searchParams.emptyReason);

  const statusValues = [
    "ready",
    "partial",
    "not_provisioned",
    "blocked",
  ] as const;
  const reasonValues = [
    "no_data",
    "not_provisioned",
    "fetch_failed",
    "permission_denied",
    "external_unavailable",
    "filtered_empty",
  ] as const;

  return {
    status:
      requestedStatus &&
      statusValues.includes(
        requestedStatus as TenantIntegrationReadinessItem["status"],
      )
        ? (requestedStatus as TenantIntegrationReadinessItem["status"])
        : "all",
    demoReason:
      requestedReason &&
      reasonValues.includes(requestedReason as TenantEmptyReason)
        ? (requestedReason as TenantEmptyReason)
        : null,
  };
}

function buildQueryString(filters: Partial<Filters>) {
  const params = new URLSearchParams();

  if (filters.status && filters.status !== "all") {
    params.set("status", filters.status);
  }
  if (filters.demoReason) {
    params.set("emptyReason", filters.demoReason);
  }

  const query = params.toString();
  return query.length > 0 ? `?${query}` : "";
}

function describeError(error: unknown) {
  return error instanceof Error ? error.message : "未知錯誤";
}

function classifyLoadFailure(message: string): TenantEmptyReason {
  if (message.includes("403") || message.toLowerCase().includes("forbidden")) {
    return "permission_denied";
  }
  if (
    message.includes("502") ||
    message.includes("503") ||
    message.includes("504") ||
    message.toLowerCase().includes("timeout") ||
    message.toLowerCase().includes("unavailable")
  ) {
    return "external_unavailable";
  }
  return "fetch_failed";
}

async function loadPageData(): Promise<PageData> {
  const client = getTenantClient();

  try {
    const summary = await client.getTenantIntegrationReadiness();
    if (summary.items.length === 0) {
      return {
        summary,
        emptyReason: "no_data",
        loadError: null,
      };
    }

    const allNotProvisioned = summary.items.every(
      (item) => item.status === "not_provisioned",
    );

    return {
      summary,
      emptyReason: allNotProvisioned ? "not_provisioned" : null,
      loadError: null,
    };
  } catch (error) {
    const message = describeError(error);
    return {
      summary: null,
      emptyReason: classifyLoadFailure(message),
      loadError: message,
    };
  }
}

function countByStatus(
  items: TenantIntegrationReadinessItem[],
  status: TenantIntegrationReadinessItem["status"],
) {
  return items.filter((item) => item.status === status).length;
}

function buildActionLabel(item: TenantIntegrationReadinessItem) {
  if (item.nextAction?.action === "issue_api_key") {
    return "Issue API key";
  }
  if (item.subSystem === "webhooks") {
    return "Set up webhook";
  }
  if (item.subSystem === "notifications") {
    return "Configure notifications";
  }
  if (item.subSystem === "sla") {
    return "Configure SLA";
  }
  if (item.subSystem === "reports") {
    return "Open reports";
  }
  if (item.subSystem === "modules") {
    return "Review modules";
  }
  if (item.subSystem === "partner_entries") {
    return "Review partner settings";
  }
  return "Open module";
}

function getReadinessHref(
  subSystem: TenantIntegrationReadinessItem["subSystem"],
) {
  return readinessHref[subSystem] ?? "/integration-governance";
}

function getStatusTone(status: TenantIntegrationReadinessItem["status"]) {
  return statusTone[status] ?? "neutral";
}

function getStatusCopy(status: TenantIntegrationReadinessItem["status"]) {
  return statusCopy[status] ?? status;
}

function getStatusLead(item: TenantIntegrationReadinessItem): string {
  if (item.status === "ready") {
    return "可直接運作";
  }
  if (item.status === "partial") {
    return "仍需租戶補齊";
  }
  if (item.status === "blocked") {
    return "需跨系統追蹤";
  }
  return "尚未完成首次配置";
}

function buildCrossAppLinks(
  tenantId: string,
  item: TenantIntegrationReadinessItem,
): CrossAppResourceLink[] {
  if (item.status !== "blocked") {
    return [];
  }

  return [
    {
      targetApp: "platform-admin",
      route: `/tenants/${tenantId}`,
      resourceType: "tenant",
      resourceId: tenantId,
      openMode: "new_tab",
      label: `Open platform owner lane for ${readinessLabel[item.subSystem]}`,
    },
  ];
}

function toExternalHref(link: CrossAppResourceLink) {
  const base =
    link.targetApp === "platform-admin" ? PLATFORM_ADMIN_URL : undefined;
  return base ? `${base}${link.route}` : link.route;
}

function renderAction(
  item: TenantIntegrationReadinessItem,
  action: ResourceActionDescriptor | undefined,
) {
  if (!action) {
    return null;
  }

  const label = buildActionLabel(item);
  if (!action.enabled) {
    return (
      <span style={disabledActionStyle} title={action.disabledReasonCode ?? ""}>
        <CanvasIcon name="warn" size={13} />
        {label}
      </span>
    );
  }

  return (
    <Link
      href={getReadinessHref(item.subSystem)}
      style={primaryActionLinkStyle}
    >
      <CanvasIcon name="chevR" size={13} />
      {label}
    </Link>
  );
}

function renderEmptyState(
  reason: TenantEmptyReason,
  loadError: string | null,
  tenantId: string,
) {
  const emptyStates: Record<
    TenantEmptyReason,
    {
      tone: "info" | "warn" | "danger" | "neutral";
      icon: "clock" | "warn" | "x" | "filter";
      title: string;
      body: string;
      actionHref?: string;
      actionLabel?: string;
      resetHref?: string;
    }
  > = {
    no_data: {
      tone: "info",
      icon: "clock",
      title: "目前還沒有 readiness 資料",
      body: "Aggregated endpoint 回傳成功，但這個 tenant 尚未產生任何 integration readiness 記錄。",
      actionHref: "/settings",
      actionLabel: "Open tenant settings",
    },
    not_provisioned: {
      tone: "neutral",
      icon: "clock",
      title: "首次導入尚未配置完成",
      body: "此 tenant 的 readiness summary 全數落在 not_provisioned。先從 API keys、webhooks、SLA 與 notifications 開始補齊。",
      actionHref: "/api-keys",
      actionLabel: "Start with API keys",
    },
    fetch_failed: {
      tone: "warn",
      icon: "warn",
      title: "整合就緒度暫時無法載入",
      body: "請稍後重新整理；目前失敗屬於一般資料讀取失敗，並非權限拒絕或外部服務停擺。",
      actionHref: "/integration-governance",
      actionLabel: "Retry clean load",
    },
    permission_denied: {
      tone: "danger",
      icon: "x",
      title: "目前角色沒有讀取這個 readiness 視圖的權限",
      body: "此空態與一般 fetch_failed 分開處理，避免把 authority 問題誤導成系統錯誤。",
      actionHref: "/users",
      actionLabel: "Review tenant roles",
    },
    external_unavailable: {
      tone: "warn",
      icon: "warn",
      title: "外部依賴暫時不可用",
      body: "Aggregated endpoint 成功辨識到上游不可用或 timeout；請改走平台 owner lane 追蹤基礎設施狀態。",
      resetHref: `${PLATFORM_ADMIN_URL}/tenants/${tenantId}`,
      actionLabel: "Open platform tenant detail",
    },
    filtered_empty: {
      tone: "info",
      icon: "filter",
      title: "目前篩選條件沒有任何子系統符合",
      body: "Readiness summary 本身有資料，但目前 status filter 把所有卡片都排除了。",
      actionHref: "/integration-governance",
      actionLabel: "Clear filters",
    },
  };

  const state = emptyStates[reason];
  if (!state) {
    return null;
  }
  const accentStyle =
    state.tone === "danger"
      ? {
          background: th.dangerBg,
          color: th.danger,
        }
      : state.tone === "warn"
        ? {
            background: th.warnBg,
            color: th.warn,
          }
        : state.tone === "info"
          ? {
              background: th.infoBg,
              color: th.info,
            }
          : {
              background: th.neutralBg,
              color: th.textMuted,
            };

  return (
    <CanvasCard
      theme={th}
      title="Empty state treatment"
      subtitle={reason}
      style={{ minHeight: 320 }}
    >
      <div style={emptyShellStyle}>
        <span style={{ ...emptySymbolStyle, ...accentStyle }}>
          <CanvasIcon name={state.icon} size={18} stroke={2} />
        </span>
        <div style={{ color: th.text, fontSize: 18, fontWeight: 600 }}>
          {state.title}
        </div>
        <div style={{ color: th.textMuted, fontSize: 12.5, lineHeight: 1.6 }}>
          {state.body}
          {loadError ? ` 原始錯誤: ${loadError}` : ""}
        </div>
        <div style={clusterStyle}>
          {state.actionHref ? (
            <Link href={state.actionHref} style={primaryActionLinkStyle}>
              <CanvasIcon name="chevR" size={13} />
              {state.actionLabel ?? "Open module"}
            </Link>
          ) : null}
          {state.resetHref ? (
            <a
              href={state.resetHref}
              rel="noreferrer"
              style={actionLinkStyle}
              target="_blank"
            >
              <CanvasIcon name="ext" size={13} />
              {state.actionLabel ?? "Open owner lane"}
            </a>
          ) : null}
        </div>
      </div>
    </CanvasCard>
  );
}

function buildReadinessSummary(items: TenantIntegrationReadinessItem[]) {
  if (items.length === 0) {
    return {
      score: 0,
      headline: "尚未取得整合就緒度快照",
      body: "Aggregated readiness endpoint 目前沒有可呈現的子系統資料。",
    };
  }

  const readyWeight = items.filter((item) => item.status === "ready").length;
  const partialWeight =
    items.filter((item) => item.status === "partial").length * 0.55;
  const score = Math.round(
    ((readyWeight + partialWeight) / items.length) * 100,
  );
  const blockedCount = items.filter((item) => item.status === "blocked").length;
  const partialCount = items.filter((item) => item.status === "partial").length;
  const notProvisionedCount = items.filter(
    (item) => item.status === "not_provisioned",
  ).length;

  if (blockedCount > 0) {
    return {
      score,
      headline: `${blockedCount} 個子系統被上游或平台條件阻塞`,
      body: "先處理 blocked lane，再回頭補齊 partial 與首次配置項目；跨 app deep links 會把你帶到 owner lane。",
    };
  }

  if (partialCount > 0) {
    return {
      score,
      headline: `${partialCount} 個子系統仍待租戶完成設定`,
      body: "這些項目已具備基礎能力，但還差設定完整性或啟用步驟；優先使用 quick actions 逐一補齊。",
    };
  }

  if (notProvisionedCount === items.length) {
    return {
      score,
      headline: "目前是首次導入階段",
      body: "整體 readiness 都還沒 provision，先從 API keys、webhooks、notifications 與 SLA 開始。",
    };
  }

  return {
    score,
    headline: "主要整合能力已就緒",
    body: "目前沒有 blocked lane；可將焦點放在日常檢查、報表與後續治理。",
  };
}

export default async function IntegrationGovernancePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const filters = parseFilters(await searchParams);
  const data = await loadPageData();
  const allItems = data.summary?.items ?? [];
  const visibleItems =
    filters.status === "all"
      ? allItems
      : allItems.filter((item) => item.status === filters.status);
  const effectiveEmptyReason =
    filters.demoReason ??
    (visibleItems.length === 0 && allItems.length > 0
      ? "filtered_empty"
      : data.emptyReason);

  const tenantId = data.summary?.tenantId ?? "tenant-demo-001";
  const readyCount = countByStatus(allItems, "ready");
  const partialCount = countByStatus(allItems, "partial");
  const blockedCount = countByStatus(allItems, "blocked");
  const notProvisionedCount = countByStatus(allItems, "not_provisioned");
  const quickActions = visibleItems
    .filter((item) => item.nextAction)
    .slice(0, 4);
  const blockedLinks = visibleItems.flatMap((item) =>
    buildCrossAppLinks(tenantId, item).map((link) => ({
      link,
      subSystem: item.subSystem,
    })),
  );
  const readinessSummary = buildReadinessSummary(allItems);

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="整合就緒度"
        subtitle="Aggregated readiness dashboard · /api/tenant/integration-governance/readiness · Q-TEN10"
        actions={
          <IntegrationGovernanceRefreshControl
            computedAt={data.summary?.computedAt ?? null}
          />
        }
      />

      <div style={pageBodyStyle}>
        <CanvasBanner
          theme={th}
          tone="info"
          icon="info"
          title="單一 aggregated endpoint"
          body="本頁只吃 1 個 readiness summary，不在前端 orchestrate 6+ 個 module query；refresh tier 固定為 T5 slow / 30s。"
        />

        {filters.demoReason ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="EmptyReason demo mode"
            body={`目前透過 ?emptyReason=${filters.demoReason} 強制渲染指定空態，用於驗證 6 種 distinct treatment。`}
          />
        ) : null}

        <div style={overviewGridStyle}>
          <CanvasCard
            theme={th}
            title="Readiness overview"
            subtitle="Cross-module summary"
          >
            <div style={overviewPanelStyle}>
              <div>
                <div style={readinessScoreStyle}>
                  <div style={readinessValueStyle}>
                    {readinessSummary.score}
                  </div>
                  <div style={{ paddingBottom: 8 }}>
                    <CanvasPill
                      theme={th}
                      tone={
                        blockedCount > 0
                          ? "danger"
                          : partialCount > 0
                            ? "warn"
                            : "success"
                      }
                      dot
                    >
                      {blockedCount > 0
                        ? "needs owner follow-up"
                        : partialCount > 0
                          ? "tenant action pending"
                          : "ready baseline"}
                    </CanvasPill>
                  </div>
                </div>
                <div style={{ color: th.text, fontSize: 22, fontWeight: 650 }}>
                  {readinessSummary.headline}
                </div>
                <div style={readinessMetaStyle}>{readinessSummary.body}</div>
              </div>

              <div style={readinessStripStyle}>
                <div style={readinessStripItemStyle}>
                  <div style={readinessStripLabelStyle}>Tenant</div>
                  <div style={readinessStripValueStyle}>{tenantId}</div>
                </div>
                <div style={readinessStripItemStyle}>
                  <div style={readinessStripLabelStyle}>Subsystems</div>
                  <div style={readinessStripValueStyle}>{allItems.length}</div>
                </div>
                <div style={readinessStripItemStyle}>
                  <div style={readinessStripLabelStyle}>Quick CTAs</div>
                  <div style={readinessStripValueStyle}>
                    {quickActions.length}
                  </div>
                </div>
              </div>
            </div>
          </CanvasCard>

          <CanvasCard
            theme={th}
            title="Expected drill paths"
            subtitle="Tenant sitemap"
          >
            <div style={noteListStyle}>
              {[
                ["/api-keys", "API key issuance and scope review"],
                ["/webhooks", "Delivery engine and failure visibility"],
                ["/notifications", "Channel routing and escalation rules"],
                ["/sla", "Threshold completeness and response targets"],
                ["/reports", "Runnable jobs and downloadable artifacts"],
              ].map(([href, description]) => (
                <div key={href} style={noteItemStyle}>
                  <div style={{ ...cardTitleStyle, fontSize: 13 }}>{href}</div>
                  <div
                    style={{
                      color: th.textMuted,
                      fontSize: 12.5,
                      lineHeight: 1.5,
                    }}
                  >
                    {description}
                  </div>
                </div>
              ))}
            </div>
          </CanvasCard>
        </div>

        <div style={kpiGridStyle}>
          <CanvasKPI
            theme={th}
            label="Ready"
            value={String(readyCount)}
            sub="green subsystems"
          />
          <CanvasKPI
            theme={th}
            label="Partial"
            value={String(partialCount)}
            sub="needs tenant action"
          />
          <CanvasKPI
            theme={th}
            label="Blocked"
            value={String(blockedCount)}
            sub="platform follow-up"
          />
          <CanvasKPI
            theme={th}
            label="Not provisioned"
            value={String(notProvisionedCount)}
            sub="first-time setup"
          />
        </div>

        <div style={filterRowStyle}>
          <span style={{ color: th.textMuted, fontSize: 12 }}>Status view</span>
          {(
            ["all", "ready", "partial", "blocked", "not_provisioned"] as const
          ).map((status) => {
            const active = filters.status === status;
            return (
              <Link
                key={status}
                href={buildQueryString({
                  status,
                  demoReason: filters.demoReason,
                })}
                style={active ? primaryActionLinkStyle : actionLinkStyle}
              >
                {status}
              </Link>
            );
          })}
          {filters.status !== "all" || filters.demoReason ? (
            <Link href="/integration-governance" style={actionLinkStyle}>
              <CanvasIcon name="x" size={13} />
              Reset
            </Link>
          ) : null}
        </div>

        {effectiveEmptyReason ? (
          renderEmptyState(effectiveEmptyReason, data.loadError, tenantId)
        ) : (
          <div style={contentGridStyle}>
            <div style={cardsGridStyle}>
              {visibleItems.map((item) => {
                const action = item.nextAction;
                const crossLinks = buildCrossAppLinks(tenantId, item);

                return (
                  <CanvasCard
                    key={item.subSystem}
                    theme={th}
                    style={{
                      minHeight: 218,
                      background:
                        item.status === "ready"
                          ? "linear-gradient(180deg, rgba(17, 107, 81, 0.18), rgba(7, 16, 27, 0.98))"
                          : item.status === "partial"
                            ? "linear-gradient(180deg, rgba(162, 94, 18, 0.2), rgba(7, 16, 27, 0.98))"
                            : item.status === "blocked"
                              ? "linear-gradient(180deg, rgba(132, 39, 52, 0.22), rgba(7, 16, 27, 0.98))"
                              : "linear-gradient(180deg, rgba(106, 120, 142, 0.16), rgba(7, 16, 27, 0.98))",
                    }}
                  >
                    <div style={cardHeaderStyle}>
                      <div>
                        <div style={cardTitleStyle}>
                          {readinessLabel[item.subSystem]}
                        </div>
                        <div style={cardCodeStyle}>{item.subSystem}</div>
                      </div>
                      <CanvasPill
                        theme={th}
                        tone={getStatusTone(item.status)}
                        dot
                      >
                        {getStatusCopy(item.status)}
                      </CanvasPill>
                    </div>

                    <div style={cardDetailStyle}>
                      <div
                        style={{
                          color: th.text,
                          fontWeight: 600,
                          marginBottom: 8,
                        }}
                      >
                        {getStatusLead(item)}
                      </div>
                      {item.detail?.trim() ||
                        "Aggregated readiness endpoint 沒有提供額外 detail。"}
                    </div>

                    <div style={cardFooterStyle}>
                      <Link
                        href={getReadinessHref(item.subSystem)}
                        style={actionLinkStyle}
                      >
                        <CanvasIcon name="chevR" size={13} />
                        Open module
                      </Link>
                      {renderAction(item, action)}
                      {action &&
                      !action.enabled &&
                      action.disabledReasonCode ? (
                        <CanvasPill theme={th} tone="neutral">
                          {action.disabledReasonCode}
                        </CanvasPill>
                      ) : null}
                      {crossLinks.map((link) => (
                        <a
                          key={link.route}
                          href={toExternalHref(link)}
                          rel="noreferrer"
                          style={actionLinkStyle}
                          target="_blank"
                        >
                          <CanvasIcon name="ext" size={13} />
                          Owner lane
                        </a>
                      ))}
                    </div>
                  </CanvasCard>
                );
              })}
            </div>

            <div style={sidebarStackStyle}>
              <CanvasCard
                theme={th}
                title="Quick actions"
                subtitle="availableActions / nextAction driven"
              >
                <div style={noteListStyle}>
                  {quickActions.length > 0 ? (
                    quickActions.map((item) => (
                      <div key={item.subSystem} style={noteItemStyle}>
                        <div style={{ ...cardTitleStyle, fontSize: 13 }}>
                          {readinessLabel[item.subSystem]}
                        </div>
                        <div style={cardDetailStyle}>
                          {item.detail ?? "No detail returned."}
                        </div>
                        <div style={{ marginTop: 10 }}>
                          {renderAction(item, item.nextAction)}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ color: th.textMuted, fontSize: 12.5 }}>
                      No follow-up CTAs were exposed for the current actor.
                      Hidden actions remain hidden instead of role-hard-coded.
                    </div>
                  )}
                </div>
              </CanvasCard>

              <CanvasCard
                theme={th}
                title="Drill targets"
                subtitle="tenant sitemap"
              >
                <div style={noteListStyle}>
                  {(
                    [
                      "api_keys",
                      "webhooks",
                      "notifications",
                      "sla",
                      "reports",
                      "modules",
                      "partner_entries",
                    ] as const
                  ).map((subSystem) => (
                    <div key={subSystem} style={noteItemStyle}>
                      <div style={{ ...cardTitleStyle, fontSize: 13 }}>
                        {readinessLabel[subSystem]}
                      </div>
                      <div style={{ marginTop: 8 }}>
                        <Link
                          href={getReadinessHref(subSystem)}
                          style={actionLinkStyle}
                        >
                          <CanvasIcon name="chevR" size={13} />
                          {getReadinessHref(subSystem)}
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </CanvasCard>

              <CanvasCard
                theme={th}
                title="Cross-app follow-up"
                subtitle="Q-X03 new-tab deep links"
              >
                <div style={noteListStyle}>
                  {blockedLinks.length > 0 ? (
                    blockedLinks.map(({ link, subSystem }) => (
                      <div
                        key={`${subSystem}-${link.route}`}
                        style={noteItemStyle}
                      >
                        <div style={{ ...cardTitleStyle, fontSize: 13 }}>
                          {readinessLabel[subSystem]}
                        </div>
                        <div style={cardDetailStyle}>
                          Blocked subsystems escalate to the platform owner lane
                          in a new tab instead of pretending the tenant app owns
                          the fix.
                        </div>
                        <a
                          href={toExternalHref(link)}
                          rel="noreferrer"
                          style={actionLinkStyle}
                          target="_blank"
                        >
                          <CanvasIcon name="ext" size={13} />
                          {link.label}
                        </a>
                      </div>
                    ))
                  ) : (
                    <div style={{ color: th.textMuted, fontSize: 12.5 }}>
                      No blocked subsystem currently requires a cross-app owner
                      handoff.
                    </div>
                  )}
                </div>
              </CanvasCard>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
