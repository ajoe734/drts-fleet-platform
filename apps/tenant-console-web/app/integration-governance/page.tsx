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
import {
  formatTenantErrorSummary,
  toTenantErrorMessage,
} from "@/lib/error-copy";
import { formatTenantCodeLabel } from "@/lib/localized-labels";

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
    fallbackDetail: "啟用中的金鑰、即將到期的金鑰，以及缺漏的權限範圍覆蓋。",
  },
  webhooks: {
    label: "回呼",
    code: "webhooks",
    href: "/webhooks",
    fallbackDetail: "端點數量、投遞失敗率與引擎可用性。",
  },
  notifications: {
    label: "通知路由",
    code: "notifications",
    href: "/settings#notifications",
    fallbackDetail: "站內通知、電子郵件與回呼的已設定通道。",
  },
  sla: {
    label: "服務時限設定",
    code: "sla_profile",
    href: "/settings#sla",
    fallbackDetail: "等待、到達與完成門檻的評估狀態。",
  },
  reports: {
    label: "報表可用性",
    code: "reports",
    href: "/reports",
    fallbackDetail: "可執行工作與報表產物的可用性。",
  },
  modules: {
    label: "模組啟用狀態",
    code: "modules",
    href: "/settings",
    fallbackDetail: "租戶可見模組的姿態與可視狀態。",
  },
  partner_entries: {
    label: "合作夥伴入口",
    code: "partner_entries",
    href: "/partner",
    fallbackDetail: "存在入口時的合作夥伴接入姿態。",
    emptyReason: "not_provisioned",
    emptyBody: "這個租戶目前尚未建立合作夥伴入口，因此此接入路徑仍維持獨立。",
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
    title: "尚未提供就緒度資料",
    body: "租戶路由已可使用，但整體就緒度快照尚未發布。",
    glyph: "00",
    tone: "neutral",
    href: "/api-keys",
    actionLabel: "先查看 API 金鑰",
  },
  not_provisioned: {
    title: "需要首次設定",
    body: "租戶已建立，但仍有一個或多個整合路徑尚未完成首次開通。",
    glyph: "NP",
    tone: "warn",
    href: "/webhooks",
    actionLabel: "設定回呼",
  },
  fetch_failed: {
    title: "快照讀取失敗",
    body: "整體就緒度端點沒有回傳此請求可用的資料內容。",
    glyph: "FF",
    tone: "danger",
    href: "/integration-governance",
    actionLabel: "重新讀取快照",
  },
  permission_denied: {
    title: "目前身分無法讀取",
    body: "目前使用者可以進入頁面外框，但沒有讀取就緒度摘要的權限。",
    glyph: "PD",
    tone: "danger",
    href: "/users",
    actionLabel: "檢查租戶角色",
  },
  external_unavailable: {
    title: "外部依賴暫時不可用",
    body: "提供整體檢視的一個或多個上游整合目前已降級或離線。",
    glyph: "EX",
    tone: "warn",
    href: "/webhooks",
    actionLabel: "檢查投遞姿態",
  },
  filtered_empty: {
    title: "目前篩選沒有結果",
    body: "此路由本身正常，但目前的篩選條件沒有留下任何子系統卡片。",
    glyph: "FX",
    tone: "info",
    href: "/integration-governance",
    actionLabel: "清除篩選",
  },
  driver_not_eligible: {
    title: "司機專用空狀態原因",
    body: "這個全域空狀態原因不應用於租戶整合治理頁面。",
    glyph: "DN",
    tone: "neutral",
    href: "/integration-governance",
    actionLabel: "返回就緒度",
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
      errors: [
        formatTenantErrorSummary(
          "整合就緒度快照",
          toTenantErrorMessage(error, "整合就緒度讀取失敗"),
        ),
      ],
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
  switch (status) {
    case "ready":
      return "就緒";
    case "partial":
      return "部分就緒";
    case "blocked":
      return "已阻擋";
    case "not_provisioned":
      return "尚未開通";
    default:
      return formatTenantCodeLabel(status, "未知狀態");
  }
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
      return "簽發 API 金鑰";
    case "create_webhook_endpoint":
      return "設定回呼";
    case "update_notifications":
      return "設定通知";
    case "update_sla_profile":
      return "設定服務時限";
    case "create_report_job":
      return "建立報表工作";
    default:
      return formatTenantCodeLabel(action, "未知動作");
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
    return `目前不可用：${formatTenantCodeLabel(action.disabledReasonCode, "已停用")}`;
  }
  if (!action.enabled) {
    return "目前不可用";
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
          ? (meta.emptyBody ?? "這個子系統尚未為此租戶完成開通。")
          : "整體聚合資料沒有回傳這個子系統，請檢查上游就緒度證據。",
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
      label: "全部就緒",
      tone: "success" as CanvasTone,
      body: "七個整合路徑都在聚合快照中顯示正常。",
    };
  }

  if (items.every((item) => item.status === "not_provisioned")) {
    return {
      label: "首次設定",
      tone: "warn" as CanvasTone,
      body: "租戶已存在，但所有追蹤中的整合路徑都仍需完成首次設定。",
    };
  }

  return {
    label: "部分就緒",
    tone: "info" as CanvasTone,
    body: "仍有部分子系統路徑尚未完全就緒，因此後續操作仍會保留顯示。",
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
      label: "在平台管理後台開啟租戶治理",
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
      label: "在營運控制台開啟回呼稽核路徑",
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
      label: "在平台管理後台檢查合作夥伴入口歸屬",
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
            <div style={{ ...monoStyle, ...subtleCopyStyle }}>
              {formatTenantCodeLabel(reason, reason)}
            </div>
          </div>
        </div>
        <p style={mutedCopyStyle}>{meta.body}</p>
        <Link href={`?emptyReason=${reason}`} style={linkStyle(true)}>
          {selected ? "目前變體" : "預覽此空狀態"}
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
            這與「無資料」不同：此路徑是刻意保留顯示，但尚未完成開通。
          </div>
        ) : null}

        {!action && item.subSystem === "partner_entries" ? (
          <div style={subtleCopyStyle}>
            與合作夥伴相關的調查仍維持跨應用處理，並會交由平台管理後台接手。
          </div>
        ) : null}

        <div style={tileFooterStyle}>
          <Link href={meta.href} style={linkStyle()}>
            開啟模組
          </Link>
          {action ? (
            renderActionLink(
              action,
              actionHref,
              `${getActionLabel(action.action)} ->`,
              true,
            )
          ) : (
            <span style={actionButtonStyle(true, false)}>{"檢查 ->"}</span>
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
        title="整合治理"
        subtitle="整體聚合就緒度，資料來自單一租戶整合就緒度端點。"
        actions={
          <>
            <CanvasPill theme={th} tone="success" dot>
              T5 慢速
            </CanvasPill>
            <CanvasPill
              theme={th}
              tone={hasSnapshot ? stateVariant.tone : "neutral"}
              dot={hasSnapshot}
            >
              {hasSnapshot
                ? `${readyCount} / ${items.length} 已就緒`
                : "尚無快照"}
            </CanvasPill>
          </>
        }
      />

      <div style={pageBodyStyle}>
        <CanvasBanner
          theme={th}
          tone="info"
          title="本頁透過單一聚合端點拉資料，不會拆成多個並行查詢"
          body="此頁不應自行編排多個無關查詢；可操作按鈕全部依後端回傳的動作描述符顯示，刷新層級固定為租戶 T5 慢速。"
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
                    返回即時快照
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
                    空狀態覆蓋範圍
                  </div>
                  <p style={mutedCopyStyle}>
                    可在此路由預覽六種與租戶相關的空狀態，用於驗收與覆蓋檢查。
                  </p>
                  <div style={subtleCopyStyle}>
                    支援：無資料、尚未開通、載入失敗、權限不足、外部依賴不可用與篩選後無結果。
                  </div>
                </div>
              </CanvasCard>

              <CanvasCard theme={th}>
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>刷新層級</div>
                  <p style={mutedCopyStyle}>
                    即使目前頁面正在顯示空狀態變體，這個畫面仍維持租戶 T5
                    慢速節奏。
                  </p>
                  <div style={{ ...monoStyle, ...subtleCopyStyle }}>
                    節奏：T5 / 租戶慢速
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
              ).map((reason, index) => (
                <EmptyReasonPreviewCard
                  key={`${reason}-${index}`}
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
                      聚合就緒度看板
                    </div>
                    <p style={{ marginTop: 6, ...mutedCopyStyle }}>
                      七個子系統路徑都從同一份就緒度資料渲染。深入入口維持模組邊界，快速操作只會在後端有回傳動作描述符時顯示。
                    </p>
                  </div>
                  <div style={actionStripStyle}>
                    <CanvasPill theme={th} tone={stateVariant.tone} dot>
                      {stateVariant.label}
                    </CanvasPill>
                    <CanvasPill theme={th} tone="neutral">
                      7 個子系統路徑
                    </CanvasPill>
                    <CanvasPill theme={th} tone="neutral">
                      快照 {formatDateTime(summary!.computedAt)}
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
                      目前沒有後續操作
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
                  <div style={{ fontSize: 13, fontWeight: 600 }}>刷新層級</div>
                  <p style={mutedCopyStyle}>
                    規格將此路由放在
                    T5。頁面會明確標示這個節奏，而不是假裝摘要是即時資料。
                  </p>
                  <div style={{ ...monoStyle, ...subtleCopyStyle }}>
                    節奏：T5 / 租戶慢速
                  </div>
                  <div style={{ ...monoStyle, ...subtleCopyStyle }}>
                    計算時間：{formatDateTime(summary!.computedAt)}
                  </div>
                </div>
              </CanvasCard>

              <CanvasCard theme={th}>
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    跨應用深入入口
                  </div>
                  <p style={mutedCopyStyle}>
                    當下一步調查屬於其他應用時，這裡會直接以新分頁深連結出去，而不會在本地再造一份鏡像頁。
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
                            請設定
                            <span style={monoStyle}>
                              {" "}
                              NEXT_PUBLIC_
                              {link.targetApp === "platform-admin"
                                ? "PLATFORM_ADMIN"
                                : "OPS_CONSOLE"}
                              _URL
                            </span>
                            ，即可啟用此深連結。
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CanvasCard>

              <CanvasCard theme={th}>
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>測試變體</div>
                  <p style={mutedCopyStyle}>
                    這個路由仍保留六種與租戶相關的空狀態預覽，供驗收與覆蓋檢查使用。
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
                    ).map((reason, index) => (
                      <Link
                        key={`${reason}-${index}`}
                        href={`?emptyReason=${reason}`}
                        style={linkStyle()}
                      >
                        {formatTenantCodeLabel(reason, reason)}
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
