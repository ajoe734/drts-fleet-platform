import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type {
  OpsPendingApprovalRequestRecord,
  TenantBookingApprovalRequestStatus,
} from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { getServerLocale } from "@/lib/server-locale";
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
  slaBreached: boolean;
  actions: string[];
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
    slaBreached: record.slaBreached,
    actions: record.availableActions
      .filter((action) => action.enabled)
      .map((action) => action.action),
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
        <Pill theme={theme} tone="info" dot>
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
      h: "SLA",
      w: 130,
      r: (row) =>
        row.slaBreached ? (
          <Pill theme={theme} tone="danger" dot>
            {copy(locale, "breached", "已違規")}
          </Pill>
        ) : (
          <Pill theme={theme} tone="success" dot>
            {copy(locale, "on track", "正常")}
          </Pill>
        ),
    },
    {
      h: copy(locale, "AVAILABLE ACTIONS", "可用操作"),
      w: 200,
      r: (row) =>
        row.actions.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {row.actions.map((action) => (
              <Pill key={action} theme={theme} tone="neutral">
                {action}
              </Pill>
            ))}
          </div>
        ) : (
          "—"
        ),
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
          "Visible only to ops_approval_triage / ops_manager / ops_compliance (read-only view).",
          "僅 ops_approval_triage / ops_manager / ops_compliance 可見（唯讀檢視）。",
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
