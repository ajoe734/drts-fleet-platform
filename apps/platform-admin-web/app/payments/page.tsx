"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { getRuntimeApiBaseUrl } from "@/lib/runtime-config";
import { useTranslation } from "@/lib/i18n";
import {
  formatPlatformCodeLabel,
  getPlatformLabel,
} from "@/lib/localized-labels";
import type { Locale } from "@/lib/translations";
import {
  RECONCILIATION_ISSUE_RESOLUTION_CODES,
  RECONCILIATION_ISSUE_TYPES,
} from "@drts/contracts";
import type {
  DriverStatementLineRecord,
  DriverStatementRecord,
  InvoiceLineRecord,
  ReconciliationIssueRecord,
  SettlementMatrixRecord,
  TenantInvoiceRecord,
} from "@drts/contracts";
import type {
  CrossAppResourceLink,
  EmptyReason,
  EmptyStateEnvelope,
  ResourceActionDescriptor,
  UiRefreshMetadata,
} from "@drts/contracts/ui-runtime";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasField,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasShell,
  CanvasTable,
  buildCanvasTheme,
} from "@drts/ui-web";
import type {
  CanvasShellNavItem,
  CanvasTableColumn,
  CanvasTheme,
  CanvasTone,
} from "@drts/ui-web";

const DEMO_TENANT_ID = "tenant-demo-001";
const DEFAULT_FINANCE_ACTOR_ID = "finance.console";
const T4_REFRESH_INTERVAL_MS = 30_000;
const T4_STALE_AFTER_MS = 45_000;
const REOPEN_WARN_THRESHOLD = 5;
const PLATFORM_THEME = buildCanvasTheme({
  surface: "platform",
  density: "compact",
});
const MATRIX_CHANNEL_ORDER = [
  "tenant_enterprise",
  "partner_airport",
  "phone_dispatch",
  "forwarded_shadow",
] as const;
const RECONCILIATION_CHANNEL_OPTIONS = [
  "partner_airport",
  "forwarded_shadow",
  "tenant_enterprise",
  "phone_dispatch",
] as const;
const APP_BASE_URLS = {
  "ops-console":
    process.env.NEXT_PUBLIC_OPS_CONSOLE_URL ?? "http://localhost:3003",
  "platform-admin": process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ?? "",
  "tenant-console":
    process.env.NEXT_PUBLIC_TENANT_CONSOLE_URL ?? "http://localhost:3002",
} as const;

type TabId = "reconciliation" | "matrix" | "invoices" | "statements";
type ActionAware<T> = T & {
  availableActions?: ResourceActionDescriptor[] | null;
  crossAppLinks?: CrossAppResourceLink[] | null;
};
type CollectionKey =
  | "reconciliation"
  | "matrix"
  | "invoices"
  | "statements"
  | "reimbursements";
type CollectionEnvelope<T> = {
  items?: T[] | null;
  emptyState?: EmptyStateEnvelope | null;
  refresh?: UiRefreshMetadata | null;
};

type MatrixIssueEvidence = ActionAware<ReconciliationIssueRecord>;

function rewriteControlPlaneProxyPath(baseUrl: string, path: string) {
  if (!baseUrl.startsWith("/control-plane-proxy")) {
    return path;
  }
  return path.replace(/^\/api(?=\/|$)/, "") || "/";
}

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getPreviousMonthDefaults() {
  const now = new Date();
  const firstDay = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
  );
  const lastDay = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0),
  );
  return {
    periodStart: toDateInputValue(firstDay),
    periodEnd: toDateInputValue(lastDay),
    periodMonth: `${firstDay.getUTCFullYear()}-${String(
      firstDay.getUTCMonth() + 1,
    ).padStart(2, "0")}`,
  };
}

function toPeriodStartIso(value: string) {
  return `${value}T00:00:00.000Z`;
}

function toPeriodEndIso(value: string) {
  return `${value}T23:59:59.000Z`;
}

function parseArtifactIds(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatMoney(
  amount?: { amountMinor: number; currency: string } | null,
) {
  if (!amount) return "—";
  return `${amount.amountMinor.toLocaleString()} ${amount.currency}`;
}

function formatMinorMoney(amountMinor: number, currency: string) {
  return `${amountMinor.toLocaleString()} ${currency}`;
}

function parsePaymentsTab(value: string | null): TabId | null {
  switch (value) {
    case "reconciliation":
    case "matrix":
    case "invoices":
    case "statements":
      return value;
    default:
      return null;
  }
}

function buildIssueQueueHref(issueId: string) {
  return `/payments?tab=reconciliation&issueId=${encodeURIComponent(issueId)}`;
}

function formatHours(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "—";
  }
  if (value < 1) {
    return `${Math.round(value * 60)}m`;
  }
  return `${value.toFixed(1)}h`;
}

function hoursBetween(start: string, end: string | null) {
  if (!end) return 0;
  return Math.max(0, (Date.parse(end) - Date.parse(start)) / 3_600_000);
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function withinDays(value: string, days: number) {
  return Date.now() - Date.parse(value) <= days * 24 * 3_600_000;
}

function sortSettlementMatrix(rows: SettlementMatrixRecord[]) {
  const priority = new Map(
    MATRIX_CHANNEL_ORDER.map((channelKey, index) => [channelKey, index]),
  );
  return [...rows].sort(
    (left, right) =>
      (priority.get(left.channelKey) ?? Number.MAX_SAFE_INTEGER) -
      (priority.get(right.channelKey) ?? Number.MAX_SAFE_INTEGER),
  );
}

function sortReconciliationIssues(rows: ReconciliationIssueRecord[]) {
  const priority: Record<ReconciliationIssueRecord["status"], number> = {
    reopened: 0,
    open: 1,
    assigned: 2,
    resolved: 3,
  };
  return [...rows].sort((left, right) => {
    const leftPriority = priority[left.status] ?? Number.MAX_SAFE_INTEGER;
    const rightPriority = priority[right.status] ?? Number.MAX_SAFE_INTEGER;
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }
    return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  });
}

function summarizeChannelMix(
  keys: readonly (string | null | undefined)[],
  labelForChannel: (channelKey: string) => string,
) {
  const counts = new Map<string, number>();
  for (const key of keys) {
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  if (counts.size === 0) return "—";
  return [...counts.entries()]
    .sort(
      ([left], [right]) =>
        MATRIX_CHANNEL_ORDER.indexOf(
          left as (typeof MATRIX_CHANNEL_ORDER)[number],
        ) -
        MATRIX_CHANNEL_ORDER.indexOf(
          right as (typeof MATRIX_CHANNEL_ORDER)[number],
        ),
    )
    .map(([channelKey, count]) => `${labelForChannel(channelKey)} × ${count}`)
    .join(", ");
}

function descriptorTooltip(descriptor?: ResourceActionDescriptor | null) {
  if (!descriptor) return undefined;
  if (!descriptor.enabled && descriptor.disabledReasonCode) {
    return descriptor.requiresReason
      ? `${descriptor.disabledReasonCode} · reason required`
      : descriptor.disabledReasonCode;
  }
  if (descriptor.requiresReason) {
    return "reason required";
  }
  return descriptor.riskLevel;
}

function actionVariant(
  descriptor?: ResourceActionDescriptor | null,
  preferred: "primary" | "secondary" = "secondary",
) {
  if (!descriptor) return preferred;
  return descriptor.riskLevel === "low" ? "secondary" : "primary";
}

function withActionHint(
  content: React.ReactNode,
  descriptor?: ResourceActionDescriptor | null,
) {
  const hint = descriptorTooltip(descriptor);
  if (!hint) return content;
  return (
    <span title={hint} style={{ display: "inline-flex", width: "fit-content" }}>
      {content}
    </span>
  );
}

function findActionDescriptor(
  descriptors: ResourceActionDescriptor[] | null | undefined,
  aliases: string[],
) {
  return descriptors?.find((descriptor) => aliases.includes(descriptor.action));
}

function aggregateActionDescriptor(
  descriptors: Array<ResourceActionDescriptor | null | undefined>,
  fallback: ResourceActionDescriptor,
) {
  return (
    descriptors.find((descriptor): descriptor is ResourceActionDescriptor =>
      Boolean(descriptor),
    ) ?? fallback
  );
}

function buildCrossAppHref(link: CrossAppResourceLink) {
  const base = APP_BASE_URLS[link.targetApp as keyof typeof APP_BASE_URLS];
  return base ? `${base}${link.route}` : link.route;
}

function openLinkProps(link: CrossAppResourceLink) {
  return link.openMode === "new_tab"
    ? { target: "_blank", rel: "noreferrer" }
    : {};
}

function buildPlatformUserHref(userId: string) {
  return `/users?query=${encodeURIComponent(userId)}`;
}

function renderOwnerLink(
  theme: CanvasTheme,
  ownerId: string | null,
  fallback?: React.ReactNode,
) {
  if (!ownerId) {
    return fallback ?? "—";
  }
  return (
    <a
      href={buildPlatformUserHref(ownerId)}
      style={{
        color: theme.accent,
        textDecoration: "none",
        fontFamily: theme.monoFamily,
        fontWeight: 600,
      }}
    >
      {ownerId}
    </a>
  );
}

function formatResolutionLabel(
  issue: ReconciliationIssueRecord,
  locale: Locale,
) {
  if (!issue.resolutionSummary) {
    return locale === "en" ? "Unresolved" : "未結案";
  }
  if (!issue.resolutionCode) {
    return issue.resolutionSummary;
  }
  return `${formatPlatformCodeLabel(locale, issue.resolutionCode)} · ${issue.resolutionSummary}`;
}

function formatArtifactList(artifactIds: string[]) {
  if (artifactIds.length === 0) {
    return "—";
  }
  return artifactIds.join(", ");
}

async function fetchPaymentCollection<T>(path: string): Promise<{
  items: T[];
  emptyState: EmptyStateEnvelope | null;
  refresh: UiRefreshMetadata | null;
}> {
  const apiBaseUrl = getRuntimeApiBaseUrl().replace(/\/$/, "");
  const response = await fetch(
    `${apiBaseUrl}${rewriteControlPlaneProxyPath(apiBaseUrl, path)}`,
    {
      headers: {
        "Content-Type": "application/json",
      },
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error ${response.status}: ${errorText}`);
  }

  const envelope = (await response.json()) as {
    data?: T[] | CollectionEnvelope<T> | null;
  };
  const data = envelope.data;

  if (Array.isArray(data)) {
    return {
      items: data,
      emptyState: null,
      refresh: null,
    };
  }

  return {
    items: data?.items ?? [],
    emptyState: data?.emptyState ?? null,
    refresh: data?.refresh ?? null,
  };
}

function formatFreshnessLabel(lastLoadedAt: string | null, locale: string) {
  if (!lastLoadedAt) {
    return locale === "en" ? "waiting for first refresh" : "等待首次刷新";
  }
  return `${locale === "en" ? "Last sync" : "最後同步"} · ${formatDateTime(lastLoadedAt)}`;
}

function emptyReasonAppearance(
  theme: CanvasTheme,
  locale: string,
  reason: EmptyReason,
) {
  switch (reason) {
    case "not_provisioned":
      return {
        tone: "info" as CanvasTone,
        title: locale === "en" ? "Not provisioned" : "尚未配置",
        body:
          locale === "en"
            ? "This surface is waiting on an upstream prerequisite or onboarding step."
            : "此區塊仍在等待上游前置設定或啟用流程完成。",
      };
    case "fetch_failed":
      return {
        tone: "danger" as CanvasTone,
        title: locale === "en" ? "Fetch failed" : "載入失敗",
        body:
          locale === "en"
            ? "The collection could not be loaded. Retry or inspect the blocking dependency."
            : "集合資料載入失敗。請重試或檢查阻塞依賴。",
      };
    case "permission_denied":
      return {
        tone: "warn" as CanvasTone,
        title: locale === "en" ? "Permission denied" : "權限不足",
        body:
          locale === "en"
            ? "The current actor can open the shell but cannot access this collection."
            : "目前 actor 可進入 shell，但不能讀取這個集合。",
      };
    case "external_unavailable":
      return {
        tone: "warn" as CanvasTone,
        title: locale === "en" ? "External unavailable" : "外部系統不可用",
        body:
          locale === "en"
            ? "A connected external system is unavailable, so this queue is temporarily blocked."
            : "外部整合系統目前不可用，因此此佇列暫時受阻。",
      };
    case "driver_not_eligible":
      return {
        tone: "neutral" as CanvasTone,
        title: locale === "en" ? "Driver not eligible" : "司機不符合條件",
        body:
          locale === "en"
            ? "The collection is empty because the underlying driver is not eligible for this flow."
            : "這個集合為空，原因是底層司機目前不符合該流程條件。",
      };
    case "filtered_empty":
      return {
        tone: "neutral" as CanvasTone,
        title: locale === "en" ? "Filtered empty" : "篩選後無資料",
        body:
          locale === "en"
            ? "The current filters removed every row. Adjust the filters or switch tabs."
            : "目前篩選條件讓所有列都被排除。請調整條件或切換分頁。",
      };
    case "no_data":
    default:
      return {
        tone: "neutral" as CanvasTone,
        title: locale === "en" ? "No data" : "尚無資料",
        body:
          locale === "en"
            ? "No records have been created for this collection yet."
            : "這個集合目前還沒有建立任何資料。",
      };
  }
}

function renderEmptyState(
  theme: CanvasTheme,
  locale: string,
  reason: EmptyReason,
  nextAction?: React.ReactNode,
) {
  const appearance = emptyReasonAppearance(theme, locale, reason);
  return (
    <div
      style={{
        padding: 18,
        display: "grid",
        gap: 12,
        borderTop: `1px solid ${theme.border}`,
        background: theme.surface,
      }}
    >
      <CanvasPill theme={theme} tone={appearance.tone} dot>
        {appearance.title}
      </CanvasPill>
      <div style={{ display: "grid", gap: 4 }}>
        <strong
          style={{ color: theme.text }}
        >{`EmptyReason · ${reason}`}</strong>
        <span style={{ color: theme.textMuted, fontSize: 12.5 }}>
          {appearance.body}
        </span>
      </div>
      {nextAction}
    </div>
  );
}

function nativeControlStyle(
  theme: CanvasTheme,
  options?: { mono?: boolean },
): React.CSSProperties {
  return {
    width: "100%",
    boxSizing: "border-box",
    padding: "8px 10px",
    borderRadius: 7,
    border: `1px solid ${theme.border}`,
    background: theme.bgRaised,
    color: theme.text,
    fontSize: 12.5,
    fontFamily: options?.mono ? theme.monoFamily : theme.fontFamily,
    lineHeight: 1.35,
  };
}

function nativeTextAreaStyle(theme: CanvasTheme): React.CSSProperties {
  return {
    ...nativeControlStyle(theme),
    minHeight: 88,
    resize: "vertical",
  };
}

function pageBodyStyle(theme: CanvasTheme): React.CSSProperties {
  return {
    padding: 24,
    display: "grid",
    gap: 16,
    background: theme.bg,
  };
}

function sectionGridStyle(columns: string): React.CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: columns,
    gap: 16,
    alignItems: "start",
  };
}

function cellStackStyle(
  theme: CanvasTheme,
  options?: {
    mono?: boolean;
    align?: "left" | "right";
  },
): React.CSSProperties {
  return {
    display: "grid",
    gap: 4,
    minWidth: 0,
    whiteSpace: "normal",
    textAlign: options?.align ?? "left",
    fontFamily: options?.mono ? theme.monoFamily : undefined,
  };
}

function toneForIssueStatus(status: ReconciliationIssueRecord["status"]) {
  switch (status) {
    case "resolved":
      return "success" as CanvasTone;
    case "reopened":
      return "danger" as CanvasTone;
    case "assigned":
      return "info" as CanvasTone;
    default:
      return "warn" as CanvasTone;
  }
}

function issueArtifactsLabel(issue: ReconciliationIssueRecord, locale: string) {
  if (issue.evidenceArtifactIds.length > 0) {
    return locale === "en"
      ? `${issue.evidenceArtifactIds.length} artifacts`
      : `${issue.evidenceArtifactIds.length} 個 artifacts`;
  }
  return locale === "en" ? "unresolved / no artifacts" : "未補 artifact";
}

export default function PaymentsPage() {
  const { t, locale } = useTranslation();
  const searchParams = useSearchParams();
  const client = usePlatformAdminClient();
  const defaults = getPreviousMonthDefaults();
  const theme = PLATFORM_THEME;
  const isEnglish = locale === "en";

  const copy = useMemo(
    () =>
      isEnglish
        ? {
            pageTitle: "Settlement governance",
            pageSubtitle:
              "invoice · driver statement · reconciliation · ops mirror remains read-only",
            breadcrumbParent: "Pricing & settlement",
            loading: "Loading settlement workspace…",
            queueSubtitle:
              "Review and mutate reconciliation issues; linked ops revenue views open in a new tab.",
            queueProfileTitle: "Queue profile",
            queueProfileSubtitle:
              "Authority, linked exposure, and refresh-critical counts.",
            linksTitle: "Cross-app links",
            linksSubtitle: "Per Q-X03 and packet §5.11 entry / exit rules.",
            issueWorkspaceTitle: "Issue workspace",
            issueWorkspaceSubtitle:
              "Assign, comment, resolve, or reopen from availableActions.",
            createIssueTitle: "Create reconciliation issue",
            createIssueSubtitle:
              "Preserve tenant / partner / sponsor / mirror / external references from spec §7.4.8.",
            invoiceControlsTitle: "Tenant invoice batch",
            invoiceControlsSubtitle:
              "Generate settlement-period invoices without leaving this route.",
            statementControlsTitle: "Driver statement batch",
            statementControlsSubtitle:
              "Generate a month of driver statements using the shared billing contract.",
            reimbursementsTitle: "Reimbursement queue",
            reimbursementsSubtitle:
              "Queue moved to a dedicated sub-route per Q-ADM12.",
            refreshCardTitle: "Refresh tier",
            refreshCardSubtitle:
              "T4 medium-slow · 30s polling + manual refresh wired from ui-runtime freshness metadata.",
            refreshLinkNote: "ops revenue mismatch links open in new tab",
            outstandingLabel: "outstanding",
            exposureLabel: "linked exposure",
            handlingLabel: "avg handling",
            reopenRateLabel: "reopen rate",
            reopenDeltaWarn: "warn threshold 5%",
            reopenDeltaOk: "within threshold",
            queueWindow: "30d window",
            linkedExposure: "linked docs",
            shadowIssues: "shadow-source issues",
            actorLabel: "Finance actor ID",
            issueDetailTitle: "Selected issue",
            issueDetailSubtitle:
              "Artifact references are mandatory evidence in the resolution trail.",
            reopenBannerTitle: "Reopen rate above threshold",
            openIssue: "Create issue",
            export: "Export",
            openReimbursementQueue: "Open reimbursement queue",
            missingRouteNote:
              "Use this deep link now; dedicated queue implementation may land separately.",
            switchToAll: "Show all",
            useGenerationControls: "Use generation controls",
          }
        : {
            pageTitle: "結算治理",
            pageSubtitle:
              "invoice · driver statement · reconciliation · ops 端維持 read-only mirror",
            breadcrumbParent: "計價與結算",
            loading: "載入結算工作台中…",
            queueSubtitle:
              "在此審查並變更 reconciliation issues；ops revenue 相關連結會以新分頁開啟。",
            queueProfileTitle: "佇列輪廓",
            queueProfileSubtitle: "權限、關聯曝險與刷新敏感指標。",
            linksTitle: "跨 app deep links",
            linksSubtitle:
              "依 Q-X03 與 packet §5.11 的 entry / exit 規則呈現。",
            issueWorkspaceTitle: "Issue 工作區",
            issueWorkspaceSubtitle:
              "依 availableActions 進行指派、評論、結案或 reopen。",
            createIssueTitle: "開立 reconciliation issue",
            createIssueSubtitle:
              "依 spec §7.4.8 保留 tenant / partner / sponsor / mirror / external references。",
            invoiceControlsTitle: "Tenant invoice 批次",
            invoiceControlsSubtitle:
              "不離開此 route 直接產出結算期間 invoice。",
            statementControlsTitle: "Driver statement 批次",
            statementControlsSubtitle:
              "用共用 billing contract 產出指定月份的 driver statements。",
            reimbursementsTitle: "Reimbursement queue",
            reimbursementsSubtitle: "依 Q-ADM12，queue 已移到專屬子路由。",
            refreshCardTitle: "Refresh tier",
            refreshCardSubtitle:
              "T4 medium-slow · 30 秒 polling + manual refresh，直接使用 ui-runtime freshness metadata。",
            refreshLinkNote: "ops revenue mismatch 連結以新分頁開啟",
            outstandingLabel: "outstanding",
            exposureLabel: "關聯曝險",
            handlingLabel: "平均處理",
            reopenRateLabel: "reopen 率",
            reopenDeltaWarn: "warn 閾值 5%",
            reopenDeltaOk: "低於閾值",
            queueWindow: "30 日視窗",
            linkedExposure: "關聯單據",
            shadowIssues: "shadow 來源 issues",
            actorLabel: "財務操作人 ID",
            issueDetailTitle: "目前 issue",
            issueDetailSubtitle:
              "artifact references 是 resolution trail 的必備證據。",
            reopenBannerTitle: "Reopen 率超過閾值",
            openIssue: "開立 issue",
            export: "匯出",
            openReimbursementQueue: "前往 reimbursement queue",
            missingRouteNote:
              "先使用這個 deep link；專屬 queue 可由後續任務補齊。",
            switchToAll: "顯示全部",
            useGenerationControls: "使用產生控制",
          },
    [isEnglish],
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("reconciliation");
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [financeActorId, setFinanceActorId] = useState(
    DEFAULT_FINANCE_ACTOR_ID,
  );

  const [invoices, setInvoices] = useState<ActionAware<TenantInvoiceRecord>[]>(
    [],
  );
  const [statements, setStatements] = useState<
    ActionAware<DriverStatementRecord>[]
  >([]);
  const [reconciliationIssues, setReconciliationIssues] = useState<
    ActionAware<ReconciliationIssueRecord>[]
  >([]);
  const [settlementMatrix, setSettlementMatrix] = useState<
    SettlementMatrixRecord[]
  >([]);
  const [reimbursementCount, setReimbursementCount] = useState(0);

  const [collectionState, setCollectionState] = useState<
    Record<
      CollectionKey,
      {
        emptyState: EmptyStateEnvelope | null;
        refresh: UiRefreshMetadata | null;
      }
    >
  >({
    reconciliation: { emptyState: null, refresh: null },
    matrix: { emptyState: null, refresh: null },
    invoices: { emptyState: null, refresh: null },
    statements: { emptyState: null, refresh: null },
    reimbursements: { emptyState: null, refresh: null },
  });

  const [invoicePending, setInvoicePending] = useState(false);
  const [statementPending, setStatementPending] = useState(false);
  const [issueDraftPending, setIssueDraftPending] = useState(false);
  const [issueActionId, setIssueActionId] = useState<string | null>(null);

  const [invoiceTenantId, setInvoiceTenantId] = useState(DEMO_TENANT_ID);
  const [invoicePeriodStart, setInvoicePeriodStart] = useState(
    defaults.periodStart,
  );
  const [invoicePeriodEnd, setInvoicePeriodEnd] = useState(defaults.periodEnd);
  const [statementPeriodMonth, setStatementPeriodMonth] = useState(
    defaults.periodMonth,
  );

  const [newIssue, setNewIssue] = useState({
    issueType:
      "partner_sponsor_mismatch" as ReconciliationIssueRecord["issueType"],
    assigneeId: "",
    channelKey: "partner_airport",
    summary: "",
    orderId: "",
    tenantId: DEMO_TENANT_ID,
    partnerId: "",
    partnerProgramId: "",
    sponsorReference: "",
    mirrorOrderId: "",
    externalOrderId: "",
    linkedReconciliationJobId: "",
    comment: "",
    artifactIds: "",
  });

  const [issueAssignments, setIssueAssignments] = useState<
    Record<string, string>
  >({});
  const [issueComments, setIssueComments] = useState<Record<string, string>>(
    {},
  );
  const [issueCommentArtifactIds, setIssueCommentArtifactIds] = useState<
    Record<string, string>
  >({});
  const [issueResolutionCodes, setIssueResolutionCodes] = useState<
    Record<string, string>
  >({});
  const [issueResolutionSummaries, setIssueResolutionSummaries] = useState<
    Record<string, string>
  >({});
  const [issueResolutionArtifactIds, setIssueResolutionArtifactIds] = useState<
    Record<string, string>
  >({});
  const [issueReopenReasons, setIssueReopenReasons] = useState<
    Record<string, string>
  >({});
  const [issueReopenArtifactIds, setIssueReopenArtifactIds] = useState<
    Record<string, string>
  >({});

  useEffect(() => {
    const requestedTab = parsePaymentsTab(searchParams.get("tab"));
    const requestedIssueId = searchParams.get("issueId");
    if (requestedTab) {
      setActiveTab(requestedTab);
    }
    if (requestedIssueId) {
      setSelectedIssueId(requestedIssueId);
    }
  }, [searchParams]);

  const loadPayments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        invoiceRecords,
        statementRecords,
        reimbursementRecords,
        issueRecords,
        settlementMatrixRecords,
      ] = await Promise.all([
        fetchPaymentCollection<ActionAware<TenantInvoiceRecord>>(
          "/api/settlement/invoices",
        ),
        fetchPaymentCollection<ActionAware<DriverStatementRecord>>(
          "/api/driver-statements",
        ),
        fetchPaymentCollection<{ batchId: string }>("/api/reimbursements"),
        fetchPaymentCollection<ActionAware<ReconciliationIssueRecord>>(
          "/api/settlement/reconciliation-issues",
        ),
        fetchPaymentCollection<SettlementMatrixRecord>(
          "/api/settlement/matrix",
        ),
      ]);

      setInvoices(invoiceRecords.items);
      setStatements(statementRecords.items);
      setReconciliationIssues(issueRecords.items);
      setSettlementMatrix(settlementMatrixRecords.items);
      setReimbursementCount(reimbursementRecords.items.length);
      setCollectionState({
        invoices: {
          emptyState: invoiceRecords.emptyState,
          refresh: invoiceRecords.refresh,
        },
        statements: {
          emptyState: statementRecords.emptyState,
          refresh: statementRecords.refresh,
        },
        reimbursements: {
          emptyState: reimbursementRecords.emptyState,
          refresh: reimbursementRecords.refresh,
        },
        reconciliation: {
          emptyState: issueRecords.emptyState,
          refresh: issueRecords.refresh,
        },
        matrix: {
          emptyState: settlementMatrixRecords.emptyState,
          refresh: settlementMatrixRecords.refresh,
        },
      });
      setLastLoadedAt(
        [
          invoiceRecords.refresh?.generatedAt,
          statementRecords.refresh?.generatedAt,
          reimbursementRecords.refresh?.generatedAt,
          issueRecords.refresh?.generatedAt,
          settlementMatrixRecords.refresh?.generatedAt,
        ].find(Boolean) ?? new Date().toISOString(),
      );
    } catch (loadError: unknown) {
      setError(
        loadError instanceof Error ? loadError.message : String(loadError),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPayments();
  }, [loadPayments]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadPayments();
    }, T4_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [loadPayments]);

  const sortedIssues = useMemo(
    () => sortReconciliationIssues(reconciliationIssues),
    [reconciliationIssues],
  );
  const sortedMatrix = useMemo(
    () => sortSettlementMatrix(settlementMatrix),
    [settlementMatrix],
  );

  useEffect(() => {
    if (sortedIssues.length === 0) {
      setSelectedIssueId(null);
      return;
    }
    if (
      !selectedIssueId ||
      !sortedIssues.some((issue) => issue.issueId === selectedIssueId)
    ) {
      setSelectedIssueId(sortedIssues[0].issueId);
    }
  }, [selectedIssueId, sortedIssues]);

  const openIssues = sortedIssues.filter(
    (issue) => issue.status !== "resolved",
  );
  const selectedIssue =
    sortedIssues.find((issue) => issue.issueId === selectedIssueId) ??
    sortedIssues[0] ??
    null;
  const recentIssues = sortedIssues.filter((issue) =>
    withinDays(issue.updatedAt || issue.createdAt, 30),
  );
  const issueWindow = recentIssues.length > 0 ? recentIssues : sortedIssues;
  const reopenedWindowCount = issueWindow.filter(
    (issue) => issue.reopenCount > 0 || issue.status === "reopened",
  ).length;
  const reopenRate =
    issueWindow.length > 0
      ? (reopenedWindowCount / issueWindow.length) * 100
      : 0;
  const reopenRateWarning = reopenRate >= REOPEN_WARN_THRESHOLD;
  const resolvedWindow = issueWindow.filter((issue) => issue.resolvedAt);
  const handlingWindow =
    resolvedWindow.length > 0 ? resolvedWindow : openIssues;
  const averageHandlingHours = average(
    handlingWindow.map((issue) =>
      hoursBetween(issue.createdAt, issue.resolvedAt ?? issue.updatedAt),
    ),
  );
  const describeMatrixChannel = useCallback(
    (channelKey: string) => {
      const key = `payments.matrix.channel.${channelKey}`;
      const value = t(key);
      return value === key ? channelKey : value;
    },
    [t],
  );
  const openIssueMix = summarizeChannelMix(
    openIssues.map((issue) => issue.channelKey),
    describeMatrixChannel,
  );
  const shadowIssueCount = sortedIssues.filter(
    (issue) =>
      issue.channelKey === "forwarded_shadow" ||
      issue.forwardedFinanceContext != null,
  ).length;
  const matrixEvidenceByChannel = useMemo(() => {
    const evidence = new Map<string, MatrixIssueEvidence>();
    for (const issue of sortedIssues) {
      if (!evidence.has(issue.channelKey)) {
        evidence.set(issue.channelKey, issue);
      }
    }
    return evidence;
  }, [sortedIssues]);

  const exposure = openIssues.reduce(
    (result, issue) => {
      const invoice = invoices.find(
        (item) => item.invoiceId === issue.linkedInvoiceId,
      );
      if (invoice?.amount) {
        result.amountMinor += invoice.amount.amountMinor;
        result.currency = invoice.amount.currency;
      }
      return result;
    },
    { amountMinor: 0, currency: "TWD" },
  );

  const pageActionDescriptors = {
    createIssue: aggregateActionDescriptor(
      [
        findActionDescriptor(
          sortedIssues.flatMap((issue) => issue.availableActions ?? []),
          ["create_issue", "create_reconciliation_issue"],
        ),
        collectionState.reconciliation.emptyState?.nextAction,
      ],
      { action: "create_issue", enabled: false, riskLevel: "medium" },
    ),
    generateInvoices: aggregateActionDescriptor(
      [
        findActionDescriptor(
          invoices.flatMap((invoice) => invoice.availableActions ?? []),
          ["generate_invoices", "generate_tenant_invoices"],
        ),
        collectionState.invoices.emptyState?.nextAction,
      ],
      { action: "generate_invoices", enabled: false, riskLevel: "medium" },
    ),
    generateStatements: aggregateActionDescriptor(
      [
        findActionDescriptor(
          statements.flatMap((statement) => statement.availableActions ?? []),
          ["generate_driver_statements", "generate_statements"],
        ),
        collectionState.statements.emptyState?.nextAction,
      ],
      {
        action: "generate_driver_statements",
        enabled: false,
        riskLevel: "medium",
      },
    ),
  };

  const activeCollectionRefresh =
    activeTab === "reconciliation"
      ? collectionState.reconciliation.refresh
      : activeTab === "matrix"
        ? collectionState.matrix.refresh
        : activeTab === "invoices"
          ? collectionState.invoices.refresh
          : collectionState.statements.refresh;
  const staleAfterMs =
    activeCollectionRefresh?.staleAfterMs ?? T4_STALE_AFTER_MS;
  const isStale =
    activeCollectionRefresh?.dataFreshness === "stale" ||
    activeCollectionRefresh?.dataFreshness === "degraded" ||
    (lastLoadedAt != null &&
      Date.now() - Date.parse(lastLoadedAt) > staleAfterMs);

  const invoiceEmptyReason =
    collectionState.invoices.emptyState?.reason ?? "no_data";
  const statementEmptyReason =
    collectionState.statements.emptyState?.reason ?? "no_data";
  const reconciliationEmptyReason =
    collectionState.reconciliation.emptyState?.reason ??
    (error ? "fetch_failed" : "no_data");
  const matrixEmptyReason =
    collectionState.matrix.emptyState?.reason ??
    (error ? "fetch_failed" : "no_data");

  const shellNav: CanvasShellNavItem[] = [
    {
      key: "home",
      href: "/",
      label: isEnglish ? "Home" : "首頁",
      icon: "dashboard",
    },
    {
      key: "health",
      href: "/health",
      label: isEnglish ? "Health & alerts" : "健康與告警",
      icon: "health",
    },
    { divider: isEnglish ? "Tenant governance" : "租戶治理" },
    {
      key: "tenants",
      href: "/tenants",
      label: isEnglish ? "Tenants" : "租戶",
      icon: "tenants",
    },
    {
      key: "partners",
      href: "/partners",
      label: isEnglish ? "Partners" : "合作夥伴",
      icon: "partners",
    },
    {
      key: "users",
      href: "/users",
      label: isEnglish ? "Users" : "使用者",
      icon: "users",
    },
    { divider: isEnglish ? "Fleet & compliance" : "車隊與合規" },
    {
      key: "fleet",
      href: "/fleet",
      label: isEnglish ? "Fleet" : "車隊",
      icon: "fleet",
    },
    {
      key: "switchboard",
      href: "/switchboard",
      label: isEnglish ? "Switchboard" : "Switchboard",
      icon: "switchboard",
    },
    { divider: isEnglish ? "Pricing & settlement" : "計價與結算" },
    {
      key: "pricing",
      href: "/pricing",
      label: isEnglish ? "Pricing" : "計價",
      icon: "pricing",
    },
    {
      key: "payments",
      href: "/payments",
      label: isEnglish ? "Payments" : "結算治理",
      icon: "payments",
      badge: openIssues.length > 0 ? String(openIssues.length) : undefined,
      badgeTone: openIssues.length > 0 ? "danger" : "neutral",
      matchPaths: ["/payments"],
    },
    { divider: isEnglish ? "Platform layer" : "平台層" },
    {
      key: "notices",
      href: "/notices",
      label: isEnglish ? "Notices" : "公告",
      icon: "notices",
    },
    {
      key: "audit",
      href: "/audit",
      label: isEnglish ? "Audit trail" : "稽核軌跡",
      icon: "audit",
    },
  ];

  const fallbackIssueLinks: CrossAppResourceLink[] = selectedIssue
    ? [
        {
          targetApp: "ops-console",
          route: `/revenue?drawer=mismatch&issueId=${encodeURIComponent(
            selectedIssue.issueId,
          )}`,
          resourceType: "reconciliation_issue",
          resourceId: selectedIssue.issueId,
          openMode: "new_tab",
          label: isEnglish
            ? "Open ops revenue mismatch drawer"
            : "開啟 ops revenue mismatch drawer",
        },
        {
          targetApp: "platform-admin",
          route: `/audit?resourceType=reconciliation_issue&resourceId=${encodeURIComponent(
            selectedIssue.issueId,
          )}`,
          resourceType: "audit",
          resourceId: selectedIssue.issueId,
          openMode: "same_tab",
          label: isEnglish ? "View related audit rows" : "查看相關 audit rows",
        },
      ]
    : [];
  const issueLinks =
    selectedIssue?.crossAppLinks && selectedIssue.crossAppLinks.length > 0
      ? selectedIssue.crossAppLinks
      : fallbackIssueLinks;

  async function handleGenerateInvoice(event: React.FormEvent) {
    event.preventDefault();
    setInvoicePending(true);
    setError(null);
    try {
      const tenantId = invoiceTenantId.trim() || DEMO_TENANT_ID;
      await client.post("/api/tenant/invoices/generate", {
        headers: { "x-tenant-id": tenantId },
        body: {
          tenantId,
          periodStart: toPeriodStartIso(invoicePeriodStart),
          periodEnd: toPeriodEndIso(invoicePeriodEnd),
        },
      });
      await loadPayments();
    } catch (actionError: unknown) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : String(actionError),
      );
    } finally {
      setInvoicePending(false);
    }
  }

  async function handleGenerateStatements(event: React.FormEvent) {
    event.preventDefault();
    setStatementPending(true);
    setError(null);
    try {
      await client.generateDriverStatements({
        periodMonth: statementPeriodMonth.trim() || defaults.periodMonth,
      });
      await loadPayments();
    } catch (actionError: unknown) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : String(actionError),
      );
    } finally {
      setStatementPending(false);
    }
  }

  async function handleCreateReconciliationIssue(event: React.FormEvent) {
    event.preventDefault();
    setIssueDraftPending(true);
    setError(null);
    try {
      await client.createReconciliationIssue({
        issueType: newIssue.issueType,
        summary: newIssue.summary.trim(),
        openedBy: financeActorId.trim() || DEFAULT_FINANCE_ACTOR_ID,
        assigneeId: newIssue.assigneeId.trim() || null,
        channelKey: newIssue.channelKey,
        orderId: newIssue.orderId.trim() || null,
        tenantId: newIssue.tenantId.trim() || null,
        partnerId: newIssue.partnerId.trim() || null,
        partnerProgramId: newIssue.partnerProgramId.trim() || null,
        sponsorReference: newIssue.sponsorReference.trim() || null,
        mirrorOrderId: newIssue.mirrorOrderId.trim() || null,
        externalOrderId: newIssue.externalOrderId.trim() || null,
        linkedReconciliationJobId:
          newIssue.linkedReconciliationJobId.trim() || null,
        comment: newIssue.comment.trim() || null,
        artifactIds: parseArtifactIds(newIssue.artifactIds),
      });
      setNewIssue((current) => ({
        ...current,
        assigneeId: "",
        summary: "",
        orderId: "",
        partnerId: "",
        partnerProgramId: "",
        sponsorReference: "",
        mirrorOrderId: "",
        externalOrderId: "",
        linkedReconciliationJobId: "",
        comment: "",
        artifactIds: "",
      }));
      await loadPayments();
      setActiveTab("reconciliation");
    } catch (actionError: unknown) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : String(actionError),
      );
    } finally {
      setIssueDraftPending(false);
    }
  }

  async function handleAssignIssue(issue: ReconciliationIssueRecord) {
    const assigneeId =
      issueAssignments[issue.issueId]?.trim() || issue.ownerId || "";
    if (!assigneeId) {
      setError(
        isEnglish
          ? "Assignee is required before assignment."
          : "指派前必須填寫 assignee。",
      );
      return;
    }
    setIssueActionId(issue.issueId);
    setError(null);
    try {
      await client.assignReconciliationIssue(issue.issueId, {
        assigneeId,
        actorId: financeActorId.trim() || DEFAULT_FINANCE_ACTOR_ID,
        note: issueComments[issue.issueId]?.trim() || null,
      });
      await loadPayments();
    } catch (actionError: unknown) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : String(actionError),
      );
    } finally {
      setIssueActionId(null);
    }
  }

  async function handleCommentIssue(issue: ReconciliationIssueRecord) {
    const message = issueComments[issue.issueId]?.trim() || "";
    if (!message) {
      setError(isEnglish ? "Comment is required." : "必須填寫 comment。");
      return;
    }
    setIssueActionId(issue.issueId);
    setError(null);
    try {
      await client.addReconciliationIssueComment(issue.issueId, {
        actorId: financeActorId.trim() || DEFAULT_FINANCE_ACTOR_ID,
        message,
        artifactIds: parseArtifactIds(
          issueCommentArtifactIds[issue.issueId] ?? "",
        ),
      });
      setIssueComments((current) => ({ ...current, [issue.issueId]: "" }));
      setIssueCommentArtifactIds((current) => ({
        ...current,
        [issue.issueId]: "",
      }));
      await loadPayments();
    } catch (actionError: unknown) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : String(actionError),
      );
    } finally {
      setIssueActionId(null);
    }
  }

  async function handleResolveIssue(issue: ReconciliationIssueRecord) {
    const resolutionSummary =
      issueResolutionSummaries[issue.issueId]?.trim() || "";
    if (!resolutionSummary) {
      setError(
        isEnglish
          ? "Resolution summary is required."
          : "必須填寫 resolution summary。",
      );
      return;
    }
    setIssueActionId(issue.issueId);
    setError(null);
    try {
      await client.resolveReconciliationIssue(issue.issueId, {
        actorId: financeActorId.trim() || DEFAULT_FINANCE_ACTOR_ID,
        resolutionCode:
          (issueResolutionCodes[issue.issueId] as NonNullable<
            ReconciliationIssueRecord["resolutionCode"]
          >) || "resolved_other",
        resolutionSummary,
        artifactIds: parseArtifactIds(
          issueResolutionArtifactIds[issue.issueId] ?? "",
        ),
      });
      setIssueResolutionSummaries((current) => ({
        ...current,
        [issue.issueId]: "",
      }));
      setIssueResolutionCodes((current) => ({
        ...current,
        [issue.issueId]: "",
      }));
      setIssueResolutionArtifactIds((current) => ({
        ...current,
        [issue.issueId]: "",
      }));
      await loadPayments();
    } catch (actionError: unknown) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : String(actionError),
      );
    } finally {
      setIssueActionId(null);
    }
  }

  async function handleReopenIssue(issue: ReconciliationIssueRecord) {
    const reason = issueReopenReasons[issue.issueId]?.trim() || "";
    if (!reason) {
      setError(
        isEnglish ? "Reopen reason is required." : "必須填寫 reopen reason。",
      );
      return;
    }
    setIssueActionId(issue.issueId);
    setError(null);
    try {
      await client.reopenReconciliationIssue(issue.issueId, {
        actorId: financeActorId.trim() || DEFAULT_FINANCE_ACTOR_ID,
        reason,
        artifactIds: parseArtifactIds(
          issueReopenArtifactIds[issue.issueId] ?? "",
        ),
      });
      setIssueReopenReasons((current) => ({ ...current, [issue.issueId]: "" }));
      setIssueReopenArtifactIds((current) => ({
        ...current,
        [issue.issueId]: "",
      }));
      await loadPayments();
    } catch (actionError: unknown) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : String(actionError),
      );
    } finally {
      setIssueActionId(null);
    }
  }

  const issueColumns: CanvasTableColumn<
    ActionAware<ReconciliationIssueRecord> & Record<string, unknown>
  >[] = [
    {
      h: "ISSUE",
      w: 118,
      r: (issue) => (
        <button
          type="button"
          onClick={() => setSelectedIssueId(issue.issueId)}
          style={{
            border: "none",
            background: "transparent",
            padding: 0,
            color: theme.accent,
            fontWeight: 700,
            fontFamily: theme.monoFamily,
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          {issue.issueId}
        </button>
      ),
    },
    {
      h: "SOURCE",
      w: 132,
      r: (issue) => (
        <div style={cellStackStyle(theme)}>
          <span>{formatPlatformCodeLabel(locale, issue.source)}</span>
          <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
            {describeMatrixChannel(issue.channelKey)}
          </span>
        </div>
      ),
    },
    {
      h: "TYPE",
      w: 220,
      r: (issue) => (
        <div style={cellStackStyle(theme, { mono: true })}>
          <span>{formatPlatformCodeLabel(locale, issue.issueType)}</span>
          <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
            {issue.summary}
          </span>
        </div>
      ),
    },
    {
      h: isEnglish ? "TENANT / PARTNER" : "TENANT / PARTNER",
      w: 170,
      r: (issue) => (
        <div style={cellStackStyle(theme, { mono: true })}>
          <span>{issue.tenantId ?? "—"}</span>
          <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
            {issue.partnerId ?? issue.partnerProgramId ?? "—"}
          </span>
        </div>
      ),
    },
    {
      h: isEnglish ? "MIRROR / EXTERNAL" : "MIRROR / EXTERNAL",
      w: 186,
      r: (issue) => (
        <div style={cellStackStyle(theme, { mono: true })}>
          <span>{issue.mirrorOrderId ?? "—"}</span>
          <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
            {issue.externalOrderId ?? "—"}
          </span>
        </div>
      ),
    },
    {
      h: isEnglish ? "OWNER" : "OWNER",
      w: 156,
      r: (issue) => (
        <div style={cellStackStyle(theme, { mono: true })}>
          <span>{renderOwnerLink(theme, issue.ownerId)}</span>
          <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
            {issue.linkedReconciliationJobId ?? "—"}
          </span>
        </div>
      ),
    },
    {
      h: "STATUS",
      w: 136,
      r: (issue) => (
        <div style={{ display: "grid", gap: 6 }}>
          <CanvasPill theme={theme} tone={toneForIssueStatus(issue.status)} dot>
            {issue.status}
          </CanvasPill>
          {issue.reopenCount > 0 ? (
            <CanvasPill theme={theme} tone="danger">
              {isEnglish
                ? `reopen × ${issue.reopenCount}`
                : `reopen × ${issue.reopenCount}`}
            </CanvasPill>
          ) : null}
        </div>
      ),
    },
    {
      h: isEnglish ? "RESOLUTION / EVIDENCE" : "RESOLUTION / EVIDENCE",
      w: 248,
      r: (issue) => (
        <div style={cellStackStyle(theme)}>
          <span
            style={{
              color: issue.resolutionSummary ? theme.text : theme.warn,
              fontWeight: issue.resolutionSummary ? 500 : 700,
            }}
          >
            {formatResolutionLabel(issue, locale)}
          </span>
          <span
            style={{
              color:
                issue.evidenceArtifactIds.length > 0
                  ? theme.textMuted
                  : theme.warn,
              fontSize: 11.5,
            }}
          >
            {issueArtifactsLabel(issue, locale)}
          </span>
          <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
            {formatDateTime(issue.updatedAt)}
          </span>
        </div>
      ),
    },
  ];

  const settlementColumns: CanvasTableColumn<
    SettlementMatrixRecord & Record<string, unknown>
  >[] = [
    {
      h: isEnglish ? "CHANNEL" : "CHANNEL",
      w: 166,
      r: (row) => (
        <div style={cellStackStyle(theme)}>
          <span>{describeMatrixChannel(row.channelKey)}</span>
          <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
            {row.orderDomain}
          </span>
        </div>
      ),
    },
    {
      h: isEnglish ? "TENANT / PARTNER" : "TENANT / PARTNER",
      w: 180,
      r: (row) => {
        const issue = matrixEvidenceByChannel.get(row.channelKey);
        return (
          <div style={cellStackStyle(theme, { mono: true })}>
            <span>{issue?.tenantId ?? "—"}</span>
            <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
              {issue?.partnerId ?? "—"}
            </span>
          </div>
        );
      },
    },
    {
      h: isEnglish ? "PROGRAM / SPONSOR" : "PROGRAM / SPONSOR",
      w: 204,
      r: (row) => {
        const issue = matrixEvidenceByChannel.get(row.channelKey);
        return (
          <div style={cellStackStyle(theme, { mono: true })}>
            <span>{issue?.partnerProgramId ?? "—"}</span>
            <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
              {issue?.sponsorReference ?? "—"}
            </span>
          </div>
        );
      },
    },
    {
      h: isEnglish ? "MIRROR / EXTERNAL" : "MIRROR / EXTERNAL",
      w: 204,
      r: (row) => {
        const issue = matrixEvidenceByChannel.get(row.channelKey);
        return (
          <div style={cellStackStyle(theme, { mono: true })}>
            <span>{issue?.mirrorOrderId ?? "—"}</span>
            <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
              {issue?.externalOrderId ?? "—"}
            </span>
          </div>
        );
      },
    },
    {
      h: isEnglish ? "JOB / LINKS" : "JOB / LINKS",
      w: 214,
      r: (row) => {
        const issue = matrixEvidenceByChannel.get(row.channelKey);
        const opsLink = issue?.crossAppLinks?.find(
          (link: CrossAppResourceLink) => link.targetApp === "ops-console",
        );
        return (
          <div style={cellStackStyle(theme, { mono: true })}>
            <span>{issue?.linkedReconciliationJobId ?? "—"}</span>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {issue ? (
                <a
                  href={buildIssueQueueHref(issue.issueId)}
                  style={{ color: theme.accent, textDecoration: "none" }}
                >
                  queue
                </a>
              ) : (
                <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
                  queue —
                </span>
              )}
              {opsLink ? (
                <a
                  href={buildCrossAppHref(opsLink)}
                  {...openLinkProps(opsLink)}
                  style={{ color: theme.accent, textDecoration: "none" }}
                >
                  ops
                </a>
              ) : (
                <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
                  ops —
                </span>
              )}
            </div>
          </div>
        );
      },
    },
    { h: isEnglish ? "PAYER" : "PAYER", w: 150, r: (row) => row.payerType },
    {
      h: isEnglish ? "SPONSOR" : "SPONSOR",
      w: 160,
      r: (row) => row.sponsorType,
    },
    {
      h: isEnglish ? "INVOICE OWNER" : "INVOICE OWNER",
      w: 172,
      r: (row) => row.invoiceOwner,
    },
    {
      h: isEnglish ? "INVOICE / PAYOUT" : "INVOICE / PAYOUT",
      w: 228,
      r: (row) => (
        <div style={cellStackStyle(theme)}>
          <span>{row.invoicePath}</span>
          <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
            {row.driverPayoutAuthority}
          </span>
        </div>
      ),
    },
    {
      h: isEnglish ? "REIMBURSE / RECON" : "REIMBURSE / RECON",
      w: 260,
      r: (row) => (
        <div style={cellStackStyle(theme)}>
          <span>{row.reimbursementRule}</span>
          <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
            {row.reconciliationPath}
          </span>
        </div>
      ),
    },
    {
      h: isEnglish ? "LEDGER" : "LEDGER",
      w: 132,
      r: (row) => (
        <CanvasPill
          theme={theme}
          tone={row.localLedgerMode === "shadow_only" ? "warn" : "success"}
        >
          {row.localLedgerMode}
        </CanvasPill>
      ),
    },
  ];

  const invoiceColumns: CanvasTableColumn<
    ActionAware<TenantInvoiceRecord> & Record<string, unknown>
  >[] = [
    {
      h: "INVOICE",
      w: 150,
      r: (invoice) => (
        <span style={{ fontFamily: theme.monoFamily }}>
          {invoice.invoiceId}
        </span>
      ),
    },
    {
      h: "TENANT",
      w: 140,
      r: (invoice) => (
        <span style={{ fontFamily: theme.monoFamily }}>{invoice.tenantId}</span>
      ),
    },
    {
      h: isEnglish ? "PERIOD" : "PERIOD",
      w: 184,
      r: (invoice) =>
        `${formatDateTime(invoice.periodStart)} → ${formatDateTime(invoice.periodEnd)}`,
    },
    {
      h: isEnglish ? "CHANNEL MIX" : "CHANNEL MIX",
      w: 220,
      r: (invoice) =>
        summarizeChannelMix(
          invoice.lines.map((line: InvoiceLineRecord) => line.channelKey),
          describeMatrixChannel,
        ),
    },
    { h: "AMOUNT", w: 140, r: (invoice) => formatMoney(invoice.amount) },
    {
      h: "STATUS",
      w: 120,
      r: (invoice) => (
        <CanvasPill
          theme={theme}
          tone={invoice.status === "paid" ? "success" : "info"}
        >
          {invoice.status}
        </CanvasPill>
      ),
    },
  ];

  const statementColumns: CanvasTableColumn<
    ActionAware<DriverStatementRecord> & Record<string, unknown>
  >[] = [
    {
      h: "STATEMENT",
      w: 160,
      r: (statement) => (
        <span style={{ fontFamily: theme.monoFamily }}>
          {statement.statementId}
        </span>
      ),
    },
    {
      h: "DRIVER",
      w: 140,
      r: (statement) => (
        <span style={{ fontFamily: theme.monoFamily }}>
          {statement.driverId}
        </span>
      ),
    },
    { h: "PERIOD", w: 110, r: (statement) => statement.periodMonth },
    {
      h: isEnglish ? "CHANNEL MIX" : "CHANNEL MIX",
      w: 220,
      r: (statement) =>
        summarizeChannelMix(
          statement.lines.map(
            (line: DriverStatementLineRecord) => line.channelKey,
          ),
          describeMatrixChannel,
        ),
    },
    {
      h: isEnglish ? "NET" : "NET",
      w: 140,
      r: (statement) => formatMoney(statement.netAmount),
    },
    {
      h: "STATUS",
      w: 120,
      r: (statement) => (
        <CanvasPill
          theme={theme}
          tone={statement.payoutStatus === "paid" ? "success" : "info"}
        >
          {statement.payoutStatus}
        </CanvasPill>
      ),
    },
  ];

  const selectedIssueActions = selectedIssue?.availableActions ?? [];
  const assignDescriptor = findActionDescriptor(selectedIssueActions, [
    "assign",
  ]);
  const commentDescriptor = findActionDescriptor(selectedIssueActions, [
    "comment",
    "add_comment",
  ]);
  const resolveDescriptor = findActionDescriptor(selectedIssueActions, [
    "resolve",
  ]);
  const reopenDescriptor = findActionDescriptor(selectedIssueActions, [
    "reopen",
  ]);

  return (
    <CanvasShell
      theme={theme}
      nav={shellNav}
      active="payments"
      brandLabel={t("app.name")}
      brandSubLabel={t("app.sub")}
      breadcrumb={[copy.breadcrumbParent, copy.pageTitle]}
      env="production"
      versionLabel="canvas"
      searchPlaceholder={getPlatformLabel(locale, "search")}
      avatarLabel={isEnglish ? "FA" : "財"}
      style={{ height: "100%" }}
    >
      <CanvasPageHeader
        theme={theme}
        title={copy.pageTitle}
        subtitle={copy.pageSubtitle}
        tabs={[
          "Settlement matrix",
          "Tenant invoices",
          "Driver statements",
          "Reimbursements →",
          "Reconciliation issues",
        ]}
        activeTab={
          activeTab === "matrix"
            ? "Settlement matrix"
            : activeTab === "invoices"
              ? "Tenant invoices"
              : activeTab === "statements"
                ? "Driver statements"
                : "Reconciliation issues"
        }
        actions={
          <>
            <CanvasBtn theme={theme} icon="reports" disabled>
              {copy.export}
            </CanvasBtn>
            <CanvasBtn
              theme={theme}
              variant={actionVariant(
                pageActionDescriptors.createIssue,
                "primary",
              )}
              icon="plus"
              disabled={!pageActionDescriptors.createIssue.enabled}
              onClick={() =>
                document
                  .getElementById("payments-create-issue")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
            >
              {withActionHint(
                copy.openIssue,
                pageActionDescriptors.createIssue,
              )}
            </CanvasBtn>
          </>
        }
      />

      <div style={pageBodyStyle(theme)}>
        {loading ? (
          <CanvasCard
            theme={theme}
            title={copy.pageTitle}
            subtitle={copy.loading}
          >
            <div style={{ color: theme.textMuted, fontSize: 12.5 }}>
              {copy.loading}
            </div>
          </CanvasCard>
        ) : (
          <>
            {error ? (
              <CanvasBanner
                theme={theme}
                tone="danger"
                title={`${getPlatformLabel(locale, "error")}: ${error}`}
                body={copy.queueSubtitle}
              />
            ) : null}

            {reopenRateWarning ? (
              <CanvasBanner
                theme={theme}
                tone="warn"
                title={copy.reopenBannerTitle}
                body={`${copy.reopenRateLabel} ${reopenRate.toFixed(1)}% · ${copy.queueWindow} ${issueWindow.length}`}
              />
            ) : null}

            <CanvasCard
              theme={theme}
              title={copy.refreshCardTitle}
              subtitle={copy.refreshCardSubtitle}
              actions={
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <CanvasPill
                    theme={theme}
                    tone={
                      activeCollectionRefresh?.dataFreshness === "degraded" ||
                      isStale
                        ? "warn"
                        : "success"
                    }
                    dot
                  >
                    {activeCollectionRefresh?.dataFreshness ??
                      (isStale ? "stale" : "fresh")}
                  </CanvasPill>
                  <CanvasBtn
                    theme={theme}
                    variant="secondary"
                    icon="refresh"
                    onClick={() => void loadPayments()}
                  >
                    {t("common.refresh")}
                  </CanvasBtn>
                </div>
              }
            >
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <span style={{ color: theme.textMuted, fontSize: 12.5 }}>
                  {formatFreshnessLabel(lastLoadedAt, locale)}
                </span>
                {activeCollectionRefresh?.generatedAt ? (
                  <CanvasPill theme={theme} tone="neutral">
                    {isEnglish
                      ? `snapshot ${formatDateTime(activeCollectionRefresh.generatedAt)}`
                      : `快照 ${formatDateTime(activeCollectionRefresh.generatedAt)}`}
                  </CanvasPill>
                ) : null}
                <CanvasPill theme={theme} tone="neutral">
                  {copy.refreshLinkNote}
                </CanvasPill>
              </div>
            </CanvasCard>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
                gap: 12,
              }}
            >
              <CanvasKPI
                theme={theme}
                label={copy.outstandingLabel}
                value={String(openIssues.length)}
                sub={openIssueMix}
              />
              <CanvasKPI
                theme={theme}
                label={copy.exposureLabel}
                value={formatMinorMoney(
                  exposure.amountMinor,
                  exposure.currency,
                )}
                sub={copy.linkedExposure}
              />
              <CanvasKPI
                theme={theme}
                label={copy.handlingLabel}
                value={formatHours(averageHandlingHours)}
                sub={`${resolvedWindow.length} resolved`}
              />
              <CanvasKPI
                theme={theme}
                label={copy.reopenRateLabel}
                value={`${reopenRate.toFixed(1)}%`}
                delta={
                  reopenRateWarning ? copy.reopenDeltaWarn : copy.reopenDeltaOk
                }
                deltaTone={reopenRateWarning ? "down" : "up"}
                sub={`${copy.queueWindow} · ${issueWindow.length}`}
              />
            </div>

            <CanvasCard theme={theme} padding={14}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <CanvasBtn
                  theme={theme}
                  size="xs"
                  variant={activeTab === "matrix" ? "primary" : "secondary"}
                  onClick={() => setActiveTab("matrix")}
                >
                  Settlement matrix
                </CanvasBtn>
                <CanvasBtn
                  theme={theme}
                  size="xs"
                  variant={activeTab === "invoices" ? "primary" : "secondary"}
                  onClick={() => setActiveTab("invoices")}
                >
                  Tenant invoices · {invoices.length}
                </CanvasBtn>
                <CanvasBtn
                  theme={theme}
                  size="xs"
                  variant={activeTab === "statements" ? "primary" : "secondary"}
                  onClick={() => setActiveTab("statements")}
                >
                  Driver statements · {statements.length}
                </CanvasBtn>
                <a
                  href="/payments/reimbursements"
                  style={{
                    textDecoration: "none",
                    display: "inline-flex",
                  }}
                >
                  <CanvasBtn theme={theme} size="xs" variant="secondary">
                    {`Reimbursements → · ${reimbursementCount}`}
                  </CanvasBtn>
                </a>
                <CanvasBtn
                  theme={theme}
                  size="xs"
                  variant={
                    activeTab === "reconciliation" ? "primary" : "secondary"
                  }
                  onClick={() => setActiveTab("reconciliation")}
                >
                  Reconciliation issues · {openIssues.length}
                </CanvasBtn>
              </div>
            </CanvasCard>

            {activeTab === "reconciliation" ? (
              <>
                <div
                  style={sectionGridStyle("minmax(0, 2fr) minmax(300px, 1fr)")}
                >
                  <CanvasCard
                    theme={theme}
                    title={t("payments.reconciliation.title")}
                    subtitle={copy.queueSubtitle}
                    padding={0}
                  >
                    {sortedIssues.length > 0 ? (
                      <CanvasTable
                        theme={theme}
                        columns={issueColumns}
                        rows={
                          sortedIssues as Array<
                            ActionAware<ReconciliationIssueRecord> &
                              Record<string, unknown>
                          >
                        }
                      />
                    ) : (
                      renderEmptyState(theme, locale, reconciliationEmptyReason)
                    )}
                  </CanvasCard>

                  <div style={{ display: "grid", gap: 16 }}>
                    <CanvasCard
                      theme={theme}
                      title={copy.queueProfileTitle}
                      subtitle={copy.queueProfileSubtitle}
                    >
                      <CanvasDL
                        theme={theme}
                        cols={1}
                        items={[
                          {
                            k: isEnglish ? "open issues" : "open issues",
                            v: String(openIssues.length),
                            mono: true,
                          },
                          {
                            k: copy.shadowIssues,
                            v: String(shadowIssueCount),
                            mono: true,
                          },
                          {
                            k: copy.queueWindow,
                            v: `${issueWindow.length} / ${reopenedWindowCount}`,
                            mono: true,
                          },
                          {
                            k: copy.linkedExposure,
                            v: formatMinorMoney(
                              exposure.amountMinor,
                              exposure.currency,
                            ),
                            mono: true,
                          },
                          {
                            k: isEnglish ? "open mix" : "open mix",
                            v: openIssueMix,
                          },
                          { k: copy.actorLabel, v: financeActorId, mono: true },
                        ]}
                      />
                    </CanvasCard>

                    <CanvasCard
                      theme={theme}
                      title={copy.linksTitle}
                      subtitle={copy.linksSubtitle}
                    >
                      {issueLinks.length > 0 ? (
                        <div style={{ display: "grid", gap: 10 }}>
                          {issueLinks.map(
                            (link: CrossAppResourceLink, index: number) => (
                              <a
                                key={`${link.targetApp}-${link.route}-${index}`}
                                href={buildCrossAppHref(link)}
                                {...openLinkProps(link)}
                                style={{
                                  color: theme.accent,
                                  textDecoration: "none",
                                  fontWeight: 600,
                                  display: "grid",
                                  gap: 4,
                                }}
                              >
                                <span>{link.label}</span>
                                <span
                                  style={{
                                    color: theme.textMuted,
                                    fontSize: 11.5,
                                    fontFamily: theme.monoFamily,
                                  }}
                                >
                                  {link.targetApp} · {link.route}
                                </span>
                              </a>
                            ),
                          )}
                        </div>
                      ) : (
                        <span
                          style={{ color: theme.textMuted, fontSize: 12.5 }}
                        >
                          —
                        </span>
                      )}
                    </CanvasCard>

                    <CanvasCard
                      theme={theme}
                      title={copy.reimbursementsTitle}
                      subtitle={copy.reimbursementsSubtitle}
                    >
                      <div style={{ display: "grid", gap: 10 }}>
                        <a
                          href="/payments/reimbursements"
                          style={{
                            color: theme.accent,
                            textDecoration: "none",
                            fontWeight: 600,
                          }}
                        >
                          {copy.openReimbursementQueue}
                        </a>
                        <span
                          style={{ color: theme.textMuted, fontSize: 12.5 }}
                        >
                          {copy.missingRouteNote}
                        </span>
                      </div>
                    </CanvasCard>
                  </div>
                </div>

                <div
                  style={sectionGridStyle("minmax(0, 1.15fr) minmax(0, 1fr)")}
                >
                  <CanvasCard
                    theme={theme}
                    title={copy.issueDetailTitle}
                    subtitle={copy.issueDetailSubtitle}
                  >
                    {selectedIssue ? (
                      <div style={{ display: "grid", gap: 16 }}>
                        <div
                          style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
                        >
                          <CanvasPill
                            theme={theme}
                            tone={toneForIssueStatus(selectedIssue.status)}
                            dot
                          >
                            {selectedIssue.status}
                          </CanvasPill>
                          {selectedIssue.reopenCount > 0 ? (
                            <CanvasPill theme={theme} tone="danger">
                              {`reopen × ${selectedIssue.reopenCount}`}
                            </CanvasPill>
                          ) : null}
                          {selectedIssue.evidenceArtifactIds.length === 0 ? (
                            <CanvasPill theme={theme} tone="warn">
                              {isEnglish
                                ? "missing artifacts"
                                : "缺少 artifacts"}
                            </CanvasPill>
                          ) : null}
                        </div>
                        <CanvasDL
                          theme={theme}
                          cols={2}
                          items={[
                            {
                              k: "ISSUE",
                              v: selectedIssue.issueId,
                              mono: true,
                            },
                            {
                              k: "TYPE",
                              v: formatPlatformCodeLabel(
                                locale,
                                selectedIssue.issueType,
                              ),
                              mono: true,
                            },
                            {
                              k: "OWNER",
                              v: renderOwnerLink(theme, selectedIssue.ownerId),
                              mono: true,
                            },
                            {
                              k: "OPENED BY",
                              v: selectedIssue.openedBy,
                              mono: true,
                            },
                            {
                              k: "TENANT ID",
                              v: selectedIssue.tenantId ?? "—",
                              mono: true,
                            },
                            {
                              k: "PARTNER ID",
                              v: selectedIssue.partnerId ?? "—",
                              mono: true,
                            },
                            {
                              k: "PARTNER PROGRAM",
                              v: selectedIssue.partnerProgramId ?? "—",
                              mono: true,
                            },
                            {
                              k: "SPONSOR REF",
                              v: selectedIssue.sponsorReference ?? "—",
                              mono: true,
                            },
                            {
                              k: "MIRROR ORDER",
                              v: selectedIssue.mirrorOrderId ?? "—",
                              mono: true,
                            },
                            {
                              k: "EXTERNAL ORDER",
                              v: selectedIssue.externalOrderId ?? "—",
                              mono: true,
                            },
                            {
                              k: "LINKED RECON JOB",
                              v: selectedIssue.linkedReconciliationJobId ?? "—",
                              mono: true,
                            },
                            {
                              k: "LINKED REIMBURSEMENT",
                              v: selectedIssue.linkedReimbursementBatchId ? (
                                <a
                                  href={`/payments/reimbursements/${encodeURIComponent(selectedIssue.linkedReimbursementBatchId)}`}
                                  style={{
                                    color: theme.accent,
                                    textDecoration: "none",
                                  }}
                                >
                                  {selectedIssue.linkedReimbursementBatchId}
                                </a>
                              ) : (
                                "—"
                              ),
                              mono: true,
                            },
                            {
                              k: "RESOLUTION",
                              v: formatResolutionLabel(selectedIssue, locale),
                            },
                            {
                              k: "ARTIFACT IDS",
                              v: formatArtifactList(
                                selectedIssue.evidenceArtifactIds,
                              ),
                              mono: true,
                            },
                            {
                              k: "UPDATED",
                              v: formatDateTime(selectedIssue.updatedAt),
                              mono: true,
                            },
                          ]}
                        />
                        <div style={{ color: theme.textMuted, fontSize: 12.5 }}>
                          {selectedIssue.summary}
                        </div>
                      </div>
                    ) : (
                      renderEmptyState(theme, locale, reconciliationEmptyReason)
                    )}
                  </CanvasCard>

                  <div
                    id="payments-create-issue"
                    style={{ display: "grid", gap: 16 }}
                  >
                    <CanvasCard
                      theme={theme}
                      title={copy.createIssueTitle}
                      subtitle={copy.createIssueSubtitle}
                    >
                      <form onSubmit={handleCreateReconciliationIssue}>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              "repeat(auto-fit, minmax(180px, 1fr))",
                            gap: 12,
                          }}
                        >
                          <CanvasField
                            theme={theme}
                            label="Issue type"
                            required
                          >
                            <select
                              value={newIssue.issueType}
                              onChange={(event) =>
                                setNewIssue((current) => ({
                                  ...current,
                                  issueType: event.target
                                    .value as ReconciliationIssueRecord["issueType"],
                                }))
                              }
                              style={nativeControlStyle(theme)}
                            >
                              {RECONCILIATION_ISSUE_TYPES.map(
                                (
                                  issueType: (typeof RECONCILIATION_ISSUE_TYPES)[number],
                                ) => (
                                  <option key={issueType} value={issueType}>
                                    {formatPlatformCodeLabel(locale, issueType)}
                                  </option>
                                ),
                              )}
                            </select>
                          </CanvasField>
                          <CanvasField theme={theme} label="Channel" required>
                            <select
                              value={newIssue.channelKey}
                              onChange={(event) =>
                                setNewIssue((current) => ({
                                  ...current,
                                  channelKey: event.target.value,
                                }))
                              }
                              style={nativeControlStyle(theme)}
                            >
                              {RECONCILIATION_CHANNEL_OPTIONS.map(
                                (channelKey) => (
                                  <option key={channelKey} value={channelKey}>
                                    {describeMatrixChannel(channelKey)}
                                  </option>
                                ),
                              )}
                            </select>
                          </CanvasField>
                          <CanvasField theme={theme} label="Assignee">
                            <input
                              value={newIssue.assigneeId}
                              onChange={(event) =>
                                setNewIssue((current) => ({
                                  ...current,
                                  assigneeId: event.target.value,
                                }))
                              }
                              style={nativeControlStyle(theme, { mono: true })}
                            />
                          </CanvasField>
                          <CanvasField theme={theme} label="Order ID">
                            <input
                              value={newIssue.orderId}
                              onChange={(event) =>
                                setNewIssue((current) => ({
                                  ...current,
                                  orderId: event.target.value,
                                }))
                              }
                              style={nativeControlStyle(theme, { mono: true })}
                            />
                          </CanvasField>
                          <CanvasField theme={theme} label="Tenant ID">
                            <input
                              value={newIssue.tenantId}
                              onChange={(event) =>
                                setNewIssue((current) => ({
                                  ...current,
                                  tenantId: event.target.value,
                                }))
                              }
                              style={nativeControlStyle(theme, { mono: true })}
                            />
                          </CanvasField>
                          <CanvasField theme={theme} label="Partner ID">
                            <input
                              value={newIssue.partnerId}
                              onChange={(event) =>
                                setNewIssue((current) => ({
                                  ...current,
                                  partnerId: event.target.value,
                                }))
                              }
                              style={nativeControlStyle(theme, { mono: true })}
                            />
                          </CanvasField>
                          <CanvasField theme={theme} label="Partner program ID">
                            <input
                              value={newIssue.partnerProgramId}
                              onChange={(event) =>
                                setNewIssue((current) => ({
                                  ...current,
                                  partnerProgramId: event.target.value,
                                }))
                              }
                              style={nativeControlStyle(theme, { mono: true })}
                            />
                          </CanvasField>
                          <CanvasField theme={theme} label="Sponsor reference">
                            <input
                              value={newIssue.sponsorReference}
                              onChange={(event) =>
                                setNewIssue((current) => ({
                                  ...current,
                                  sponsorReference: event.target.value,
                                }))
                              }
                              style={nativeControlStyle(theme, { mono: true })}
                            />
                          </CanvasField>
                          <CanvasField theme={theme} label="Mirror order ID">
                            <input
                              value={newIssue.mirrorOrderId}
                              onChange={(event) =>
                                setNewIssue((current) => ({
                                  ...current,
                                  mirrorOrderId: event.target.value,
                                }))
                              }
                              style={nativeControlStyle(theme, { mono: true })}
                            />
                          </CanvasField>
                          <CanvasField theme={theme} label="External order ID">
                            <input
                              value={newIssue.externalOrderId}
                              onChange={(event) =>
                                setNewIssue((current) => ({
                                  ...current,
                                  externalOrderId: event.target.value,
                                }))
                              }
                              style={nativeControlStyle(theme, { mono: true })}
                            />
                          </CanvasField>
                          <CanvasField
                            theme={theme}
                            label="Linked recon job ID"
                          >
                            <input
                              value={newIssue.linkedReconciliationJobId}
                              onChange={(event) =>
                                setNewIssue((current) => ({
                                  ...current,
                                  linkedReconciliationJobId: event.target.value,
                                }))
                              }
                              style={nativeControlStyle(theme, { mono: true })}
                            />
                          </CanvasField>
                          <div style={{ gridColumn: "1 / -1" }}>
                            <CanvasField theme={theme} label="Summary" required>
                              <textarea
                                value={newIssue.summary}
                                onChange={(event) =>
                                  setNewIssue((current) => ({
                                    ...current,
                                    summary: event.target.value,
                                  }))
                                }
                                style={nativeTextAreaStyle(theme)}
                              />
                            </CanvasField>
                          </div>
                          <div style={{ gridColumn: "1 / -1" }}>
                            <CanvasField theme={theme} label="Comment">
                              <textarea
                                value={newIssue.comment}
                                onChange={(event) =>
                                  setNewIssue((current) => ({
                                    ...current,
                                    comment: event.target.value,
                                  }))
                                }
                                style={nativeTextAreaStyle(theme)}
                              />
                            </CanvasField>
                          </div>
                          <div style={{ gridColumn: "1 / -1" }}>
                            <CanvasField theme={theme} label="Artifact IDs">
                              <input
                                value={newIssue.artifactIds}
                                onChange={(event) =>
                                  setNewIssue((current) => ({
                                    ...current,
                                    artifactIds: event.target.value,
                                  }))
                                }
                                placeholder="art_001, art_002"
                                style={nativeControlStyle(theme, {
                                  mono: true,
                                })}
                              />
                            </CanvasField>
                          </div>
                        </div>

                        <div style={{ marginTop: 14 }}>
                          <button
                            type="submit"
                            disabled={
                              issueDraftPending ||
                              !newIssue.summary.trim() ||
                              !pageActionDescriptors.createIssue.enabled
                            }
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 6,
                              padding: "8px 14px",
                              minHeight: 32,
                              borderRadius: 7,
                              border: `1px solid ${theme.accent}`,
                              background: theme.accent,
                              color: "#fff",
                              fontSize: 12.5,
                              fontWeight: 600,
                              fontFamily: theme.fontFamily,
                              cursor: "pointer",
                              opacity:
                                issueDraftPending ||
                                !newIssue.summary.trim() ||
                                !pageActionDescriptors.createIssue.enabled
                                  ? 0.55
                                  : 1,
                            }}
                            title={descriptorTooltip(
                              pageActionDescriptors.createIssue,
                            )}
                          >
                            {issueDraftPending
                              ? isEnglish
                                ? "Creating…"
                                : "建立中…"
                              : copy.openIssue}
                          </button>
                        </div>
                      </form>
                    </CanvasCard>

                    {selectedIssue ? (
                      <CanvasCard
                        theme={theme}
                        title={copy.issueWorkspaceTitle}
                        subtitle={copy.issueWorkspaceSubtitle}
                      >
                        <div style={{ display: "grid", gap: 12 }}>
                          <CanvasField theme={theme} label={copy.actorLabel}>
                            <input
                              value={financeActorId}
                              onChange={(event) =>
                                setFinanceActorId(event.target.value)
                              }
                              style={nativeControlStyle(theme, { mono: true })}
                            />
                          </CanvasField>

                          <CanvasField theme={theme} label="Assignee">
                            <input
                              value={
                                issueAssignments[selectedIssue.issueId] ??
                                selectedIssue.ownerId ??
                                ""
                              }
                              onChange={(event) =>
                                setIssueAssignments((current) => ({
                                  ...current,
                                  [selectedIssue.issueId]: event.target.value,
                                }))
                              }
                              style={nativeControlStyle(theme, { mono: true })}
                            />
                          </CanvasField>
                          <CanvasBtn
                            theme={theme}
                            variant={actionVariant(assignDescriptor)}
                            disabled={
                              !assignDescriptor?.enabled ||
                              issueActionId === selectedIssue.issueId
                            }
                            onClick={() =>
                              void handleAssignIssue(selectedIssue)
                            }
                          >
                            {withActionHint(
                              isEnglish ? "Assign issue" : "指派 issue",
                              assignDescriptor,
                            )}
                          </CanvasBtn>

                          <CanvasField theme={theme} label="Comment">
                            <textarea
                              value={issueComments[selectedIssue.issueId] ?? ""}
                              onChange={(event) =>
                                setIssueComments((current) => ({
                                  ...current,
                                  [selectedIssue.issueId]: event.target.value,
                                }))
                              }
                              style={nativeTextAreaStyle(theme)}
                            />
                          </CanvasField>
                          <CanvasField theme={theme} label="Artifact IDs">
                            <input
                              value={
                                issueCommentArtifactIds[
                                  selectedIssue.issueId
                                ] ?? ""
                              }
                              onChange={(event) =>
                                setIssueCommentArtifactIds((current) => ({
                                  ...current,
                                  [selectedIssue.issueId]: event.target.value,
                                }))
                              }
                              placeholder="art_001, art_002"
                              style={nativeControlStyle(theme, { mono: true })}
                            />
                          </CanvasField>
                          <CanvasBtn
                            theme={theme}
                            variant={actionVariant(commentDescriptor)}
                            disabled={
                              !commentDescriptor?.enabled ||
                              issueActionId === selectedIssue.issueId
                            }
                            onClick={() =>
                              void handleCommentIssue(selectedIssue)
                            }
                          >
                            {withActionHint(
                              isEnglish ? "Add comment" : "新增 comment",
                              commentDescriptor,
                            )}
                          </CanvasBtn>

                          <CanvasField theme={theme} label="Resolution code">
                            <select
                              value={
                                issueResolutionCodes[selectedIssue.issueId] ??
                                ""
                              }
                              onChange={(event) =>
                                setIssueResolutionCodes((current) => ({
                                  ...current,
                                  [selectedIssue.issueId]: event.target.value,
                                }))
                              }
                              style={nativeControlStyle(theme)}
                            >
                              <option value="">
                                {isEnglish ? "Select…" : "選擇…"}
                              </option>
                              {RECONCILIATION_ISSUE_RESOLUTION_CODES.map(
                                (
                                  code: (typeof RECONCILIATION_ISSUE_RESOLUTION_CODES)[number],
                                ) => (
                                  <option key={code} value={code}>
                                    {formatPlatformCodeLabel(locale, code)}
                                  </option>
                                ),
                              )}
                            </select>
                          </CanvasField>
                          <CanvasField theme={theme} label="Resolution summary">
                            <textarea
                              value={
                                issueResolutionSummaries[
                                  selectedIssue.issueId
                                ] ?? ""
                              }
                              onChange={(event) =>
                                setIssueResolutionSummaries((current) => ({
                                  ...current,
                                  [selectedIssue.issueId]: event.target.value,
                                }))
                              }
                              style={nativeTextAreaStyle(theme)}
                            />
                          </CanvasField>
                          <CanvasField
                            theme={theme}
                            label="Resolution artifacts"
                          >
                            <input
                              value={
                                issueResolutionArtifactIds[
                                  selectedIssue.issueId
                                ] ?? ""
                              }
                              onChange={(event) =>
                                setIssueResolutionArtifactIds((current) => ({
                                  ...current,
                                  [selectedIssue.issueId]: event.target.value,
                                }))
                              }
                              placeholder="art_101, art_102"
                              style={nativeControlStyle(theme, { mono: true })}
                            />
                          </CanvasField>
                          <CanvasBtn
                            theme={theme}
                            variant={actionVariant(
                              resolveDescriptor,
                              "primary",
                            )}
                            disabled={
                              !resolveDescriptor?.enabled ||
                              issueActionId === selectedIssue.issueId
                            }
                            onClick={() =>
                              void handleResolveIssue(selectedIssue)
                            }
                          >
                            {withActionHint(
                              isEnglish ? "Resolve issue" : "結案 issue",
                              resolveDescriptor,
                            )}
                          </CanvasBtn>

                          <CanvasField theme={theme} label="Reopen reason">
                            <textarea
                              value={
                                issueReopenReasons[selectedIssue.issueId] ?? ""
                              }
                              onChange={(event) =>
                                setIssueReopenReasons((current) => ({
                                  ...current,
                                  [selectedIssue.issueId]: event.target.value,
                                }))
                              }
                              style={nativeTextAreaStyle(theme)}
                            />
                          </CanvasField>
                          <CanvasField theme={theme} label="Reopen artifacts">
                            <input
                              value={
                                issueReopenArtifactIds[selectedIssue.issueId] ??
                                ""
                              }
                              onChange={(event) =>
                                setIssueReopenArtifactIds((current) => ({
                                  ...current,
                                  [selectedIssue.issueId]: event.target.value,
                                }))
                              }
                              placeholder="art_201, art_202"
                              style={nativeControlStyle(theme, { mono: true })}
                            />
                          </CanvasField>
                          <CanvasBtn
                            theme={theme}
                            variant={actionVariant(reopenDescriptor)}
                            disabled={
                              !reopenDescriptor?.enabled ||
                              issueActionId === selectedIssue.issueId
                            }
                            onClick={() =>
                              void handleReopenIssue(selectedIssue)
                            }
                          >
                            {withActionHint(
                              isEnglish ? "Reopen issue" : "重新開啟 issue",
                              reopenDescriptor,
                            )}
                          </CanvasBtn>
                        </div>
                      </CanvasCard>
                    ) : null}
                  </div>
                </div>
              </>
            ) : null}

            {activeTab === "matrix" ? (
              <CanvasCard
                theme={theme}
                title="Settlement matrix"
                subtitle="Canonical settlement paths with latest linked identifiers, queue routes, and ops evidence per channel."
                padding={0}
              >
                {sortedMatrix.length > 0 ? (
                  <CanvasTable
                    theme={theme}
                    columns={settlementColumns}
                    rows={
                      sortedMatrix as Array<
                        SettlementMatrixRecord & Record<string, unknown>
                      >
                    }
                  />
                ) : (
                  renderEmptyState(theme, locale, matrixEmptyReason)
                )}
              </CanvasCard>
            ) : null}

            {activeTab === "invoices" ? (
              <div
                style={sectionGridStyle("minmax(0, 1.7fr) minmax(320px, 1fr)")}
              >
                <CanvasCard
                  theme={theme}
                  title="Tenant invoices"
                  subtitle={`${invoices.length}`}
                  padding={0}
                >
                  {invoices.length > 0 ? (
                    <CanvasTable
                      theme={theme}
                      columns={invoiceColumns}
                      rows={
                        invoices as Array<
                          ActionAware<TenantInvoiceRecord> &
                            Record<string, unknown>
                        >
                      }
                    />
                  ) : (
                    renderEmptyState(
                      theme,
                      locale,
                      invoiceEmptyReason,
                      pageActionDescriptors.generateInvoices.enabled ? (
                        <CanvasBtn
                          theme={theme}
                          variant="primary"
                          onClick={() =>
                            document
                              .getElementById("payments-invoice-controls")
                              ?.scrollIntoView({
                                behavior: "smooth",
                                block: "start",
                              })
                          }
                        >
                          {copy.useGenerationControls}
                        </CanvasBtn>
                      ) : undefined,
                    )
                  )}
                </CanvasCard>

                <CanvasCard
                  theme={theme}
                  title={copy.invoiceControlsTitle}
                  subtitle={copy.invoiceControlsSubtitle}
                >
                  <form
                    id="payments-invoice-controls"
                    onSubmit={handleGenerateInvoice}
                  >
                    <div style={{ display: "grid", gap: 12 }}>
                      <CanvasField theme={theme} label="Tenant ID">
                        <input
                          value={invoiceTenantId}
                          onChange={(event) =>
                            setInvoiceTenantId(event.target.value)
                          }
                          style={nativeControlStyle(theme, { mono: true })}
                        />
                      </CanvasField>
                      <CanvasField theme={theme} label="Period start">
                        <input
                          type="date"
                          value={invoicePeriodStart}
                          onChange={(event) =>
                            setInvoicePeriodStart(event.target.value)
                          }
                          style={nativeControlStyle(theme)}
                        />
                      </CanvasField>
                      <CanvasField theme={theme} label="Period end">
                        <input
                          type="date"
                          value={invoicePeriodEnd}
                          onChange={(event) =>
                            setInvoicePeriodEnd(event.target.value)
                          }
                          style={nativeControlStyle(theme)}
                        />
                      </CanvasField>
                      <CanvasBtn
                        theme={theme}
                        variant={actionVariant(
                          pageActionDescriptors.generateInvoices,
                          "primary",
                        )}
                        disabled={
                          !pageActionDescriptors.generateInvoices.enabled ||
                          invoicePending
                        }
                      >
                        {withActionHint(
                          invoicePending
                            ? isEnglish
                              ? "Generating…"
                              : "產生中…"
                            : isEnglish
                              ? "Generate tenant invoices"
                              : "產生 tenant invoices",
                          pageActionDescriptors.generateInvoices,
                        )}
                      </CanvasBtn>
                    </div>
                  </form>
                </CanvasCard>
              </div>
            ) : null}

            {activeTab === "statements" ? (
              <div
                style={sectionGridStyle("minmax(0, 1.7fr) minmax(320px, 1fr)")}
              >
                <CanvasCard
                  theme={theme}
                  title="Driver statements"
                  subtitle={`${statements.length}`}
                  padding={0}
                >
                  {statements.length > 0 ? (
                    <CanvasTable
                      theme={theme}
                      columns={statementColumns}
                      rows={
                        statements as Array<
                          ActionAware<DriverStatementRecord> &
                            Record<string, unknown>
                        >
                      }
                    />
                  ) : (
                    renderEmptyState(
                      theme,
                      locale,
                      statementEmptyReason,
                      pageActionDescriptors.generateStatements.enabled ? (
                        <CanvasBtn
                          theme={theme}
                          variant="primary"
                          onClick={() =>
                            document
                              .getElementById("payments-statement-controls")
                              ?.scrollIntoView({
                                behavior: "smooth",
                                block: "start",
                              })
                          }
                        >
                          {copy.useGenerationControls}
                        </CanvasBtn>
                      ) : undefined,
                    )
                  )}
                </CanvasCard>

                <CanvasCard
                  theme={theme}
                  title={copy.statementControlsTitle}
                  subtitle={copy.statementControlsSubtitle}
                >
                  <form
                    id="payments-statement-controls"
                    onSubmit={handleGenerateStatements}
                  >
                    <div style={{ display: "grid", gap: 12 }}>
                      <CanvasField theme={theme} label="Period month">
                        <input
                          value={statementPeriodMonth}
                          onChange={(event) =>
                            setStatementPeriodMonth(event.target.value)
                          }
                          placeholder="2026-05"
                          style={nativeControlStyle(theme, { mono: true })}
                        />
                      </CanvasField>
                      <CanvasBtn
                        theme={theme}
                        variant={actionVariant(
                          pageActionDescriptors.generateStatements,
                          "primary",
                        )}
                        disabled={
                          !pageActionDescriptors.generateStatements.enabled ||
                          statementPending
                        }
                      >
                        {withActionHint(
                          statementPending
                            ? isEnglish
                              ? "Generating…"
                              : "產生中…"
                            : isEnglish
                              ? "Generate driver statements"
                              : "產生 driver statements",
                          pageActionDescriptors.generateStatements,
                        )}
                      </CanvasBtn>
                    </div>
                  </form>
                </CanvasCard>
              </div>
            ) : null}
          </>
        )}
      </div>
    </CanvasShell>
  );
}
