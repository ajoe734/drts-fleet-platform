import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type {
  OpsPendingApprovalRequestRecord,
  ResourceActionDescriptor,
  TenantBookingApprovalRequestStatus,
} from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { getServerLocale } from "@/lib/server-locale";
import { ApprovalActions } from "./approval-actions";
import {
  CanvasBanner as Banner,
  CanvasCard as Card,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
  buildCanvasTheme,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";

export const dynamic = "force-dynamic";

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const tenantChipTheme = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

type Locale = "en" | "zh";

type TabStatus = "pending" | "approved" | "rejected";

type ApprovalRow = Record<string, unknown> & {
  request: string;
  tenant: string;
  status: TenantBookingApprovalRequestStatus;
  mode: string;
  orderId: string;
  approvers: number;
  created: string;
  timeoutAt: string;
  timeoutWarning: boolean;
  slaBreached: boolean;
  actions: ResourceActionDescriptor[];
};

type ApprovalRequestsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const TAB_ORDER: TabStatus[] = ["pending", "approved", "rejected"];

const tabLinkStyle: CSSProperties = {
  display: "inline-flex",
  textDecoration: "none",
  color: "inherit",
  font: "inherit",
};

function copy(locale: Locale, en: string, zh: string): string {
  return locale === "en" ? en : zh;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function formatStamp(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  return value.slice(0, 16).replace("T", " ");
}

function isApproachingTimeout(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }
  const timeoutAt = Date.parse(value);
  if (!Number.isFinite(timeoutAt)) {
    return false;
  }
  const remainingMs = timeoutAt - Date.now();
  return remainingMs > 0 && remainingMs <= 12 * 60 * 60 * 1000;
}

function formatRemaining(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  const timeoutAt = Date.parse(value);
  if (!Number.isFinite(timeoutAt)) {
    return "—";
  }
  const remainingMs = timeoutAt - Date.now();
  if (remainingMs <= 0) {
    return "breached";
  }
  const totalMinutes = Math.ceil(remainingMs / 60000);
  if (totalMinutes < 60) {
    return `< ${totalMinutes}m`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `< ${hours}h` : `< ${hours}h ${minutes}m`;
}

function statusTone(status: TenantBookingApprovalRequestStatus): CanvasTone {
  switch (status) {
    case "approved":
      return "success";
    case "rejected":
    case "timeout_escalated":
      return "danger";
    case "pending":
      return "warn";
    default:
      return "neutral";
  }
}

export default async function ApprovalRequestsPage({
  searchParams,
}: ApprovalRequestsPageProps) {
  const [client, locale, resolvedSearchParams] = await Promise.all([
    getServerOpsClient(),
    getServerLocale(),
    (searchParams ??
      Promise.resolve(
        {} as Record<string, string | string[] | undefined>,
      )) as Promise<Record<string, string | string[] | undefined>>,
  ]);

  const statusParam = firstParam(resolvedSearchParams?.status);
  const activeStatus: TabStatus =
    statusParam === "approved"
      ? "approved"
      : statusParam === "rejected"
        ? "rejected"
        : "pending";

  let records: OpsPendingApprovalRequestRecord[] = [];
  let loadFailed = false;
  try {
    records = await client.listOpsPendingApprovalRequests({
      status: activeStatus,
    });
  } catch {
    loadFailed = true;
  }

  const rows: ApprovalRow[] = records.map((record) => ({
    request: record.approvalRequestId,
    tenant: record.tenantId,
    status: record.status,
    mode: record.approvalMode,
    orderId: record.orderId,
    approvers: record.approvers.length,
    created: record.createdAt,
    timeoutAt: record.timeoutAt,
    timeoutWarning: isApproachingTimeout(record.timeoutAt),
    slaBreached: record.slaBreached,
    actions: record.availableActions.filter((action) => action.enabled),
  }));

  const columns: CanvasTableColumn<ApprovalRow>[] = [
    {
      h: copy(locale, "REQUEST", "請求"),
      w: 130,
      r: (row) => (
        <span style={{ color: theme.accent, fontWeight: 600 }}>
          {row.request}
        </span>
      ),
    },
    {
      h: copy(locale, "TENANT", "租戶"),
      w: 140,
      r: (row) => (
        <Pill
          theme={theme}
          tone="neutral"
          dot
          style={{
            color: tenantChipTheme.accent,
            background: tenantChipTheme.accentBg,
            borderColor: tenantChipTheme.accentBorder,
          }}
        >
          {row.tenant}
        </Pill>
      ),
    },
    {
      h: copy(locale, "STATUS", "狀態"),
      w: 130,
      r: (row) => (
        <Pill theme={theme} tone={statusTone(row.status)} dot>
          {row.status}
        </Pill>
      ),
    },
    {
      h: copy(locale, "MODE", "模式"),
      w: 130,
      r: (row) => row.mode,
    },
    {
      h: copy(locale, "ORDER", "訂單"),
      w: 130,
      r: (row) =>
        row.orderId ? (
          <Link
            href={`/dispatch/${encodeURIComponent(row.orderId)}`}
            style={{ color: theme.accent }}
          >
            {row.orderId} →
          </Link>
        ) : (
          "—"
        ),
    },
    {
      h: copy(locale, "APPROVERS", "審批人"),
      w: 100,
      r: (row) => String(row.approvers),
    },
    {
      h: copy(locale, "CREATED", "建立時間"),
      w: 150,
      r: (row) => formatStamp(row.created),
    },
    {
      h: copy(locale, "TIMEOUT", "逾時"),
      w: 130,
      r: (row) =>
        row.slaBreached ? (
          <Pill theme={theme} tone="danger" dot>
            {copy(locale, "breached", "已逾時")}
          </Pill>
        ) : row.timeoutWarning ? (
          <Pill theme={theme} tone="danger" dot>
            {copy(locale, "warning", "即將逾時")} ·{" "}
            {formatRemaining(row.timeoutAt)}
          </Pill>
        ) : (
          <Pill theme={theme} tone="success" dot>
            {copy(locale, "on track", "正常")}
          </Pill>
        ),
    },
    {
      h: copy(locale, "ACTIONS", "操作"),
      w: 240,
      r: (row) => {
        const canNudge = row.status === "pending";
        const canAcknowledge = row.slaBreached;
        if (row.actions.length === 0 && !canNudge && !canAcknowledge) {
          return "—";
        }
        return (
          <ApprovalActions
            requestId={row.request}
            actions={row.actions}
            canNudge={canNudge}
            canAcknowledge={canAcknowledge}
            locale={locale}
          />
        );
      },
    },
  ];

  const tabNodes: ReactNode[] = TAB_ORDER.map((tab) => {
    const label =
      tab === "pending"
        ? "Pending"
        : tab === "approved"
          ? "Approved"
          : "Rejected";
    return (
      <Link
        key={tab}
        href={`/approval-requests?status=${tab}`}
        style={tabLinkStyle}
      >
        {label}
      </Link>
    );
  });
  const activeTabNode =
    tabNodes[TAB_ORDER.indexOf(activeStatus)] ?? tabNodes[0];

  return (
    <>
      <PageHeader
        theme={theme}
        title={copy(
          locale,
          "Approval Requests · cross-tenant",
          "審批佇列 · 跨租戶",
        )}
        subtitle={copy(
          locale,
          "Visible only to ops_approval_triage / ops_manager / ops_compliance. Approve, reject, or escalate each request with an audit reason.",
          "僅 ops_approval_triage / ops_manager / ops_compliance 可見。可逐筆核准、退回或升級，並留下稽核理由。",
        )}
        tabs={tabNodes}
        activeTab={activeTabNode}
      />

      <div style={{ padding: 24, display: "grid", gap: 16 }}>
        {loadFailed ? (
          <Banner
            theme={theme}
            tone="danger"
            icon="warn"
            title={copy(
              locale,
              "Could not load approval requests",
              "無法載入審批請求",
            )}
            body={copy(
              locale,
              "You may lack scope, or the service is unavailable.",
              "可能是權限不足，或服務暫時無法使用。",
            )}
          />
        ) : null}

        <Card theme={theme} padding={0}>
          {rows.length > 0 ? (
            <Table theme={theme} columns={columns} rows={rows} />
          ) : (
            <div
              style={{
                padding: 32,
                textAlign: "center",
                color: theme.textMuted,
                fontSize: 13,
              }}
            >
              {loadFailed
                ? copy(locale, "No data to display.", "沒有可顯示的資料。")
                : copy(
                    locale,
                    "No approval requests in this view.",
                    "此檢視目前沒有審批請求。",
                  )}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
