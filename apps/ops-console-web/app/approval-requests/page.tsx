import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type {
  OpsPendingApprovalRequestRecord,
  ResourceActionDescriptor,
  TenantBookingApprovalRequestStatus,
} from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
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
      h: t("approvalRequests.col.request", locale),
      w: 130,
      r: (row) => (
        <span style={{ color: theme.accent, fontWeight: 600 }}>
          {row.request}
        </span>
      ),
    },
    {
      h: t("approvalRequests.col.tenant", locale),
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
      h: t("approvalRequests.col.status", locale),
      w: 130,
      r: (row) => (
        <Pill theme={theme} tone={statusTone(row.status)} dot>
          {row.status}
        </Pill>
      ),
    },
    {
      h: t("approvalRequests.col.mode", locale),
      w: 130,
      r: (row) => row.mode,
    },
    {
      h: t("approvalRequests.col.order", locale),
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
      h: t("approvalRequests.col.approvers", locale),
      w: 100,
      r: (row) => String(row.approvers),
    },
    {
      h: t("approvalRequests.col.created", locale),
      w: 150,
      r: (row) => formatStamp(row.created),
    },
    {
      h: t("approvalRequests.col.timeout", locale),
      w: 130,
      r: (row) =>
        row.slaBreached ? (
          <Pill theme={theme} tone="danger" dot>
            {t("approvalRequests.timeout.breached", locale)}
          </Pill>
        ) : row.timeoutWarning ? (
          <Pill theme={theme} tone="danger" dot>
            {t("approvalRequests.timeout.warning", locale)} ·{" "}
            {formatRemaining(row.timeoutAt)}
          </Pill>
        ) : (
          <Pill theme={theme} tone="success" dot>
            {t("approvalRequests.timeout.onTrack", locale)}
          </Pill>
        ),
    },
    {
      h: t("approvalRequests.col.actions", locale),
      w: 240,
      r: (row) => {
        const canNudge = row.status === "pending";
        const canAcknowledge = row.slaBreached;
        if (row.actions.length === 0 && !canNudge && !canAcknowledge) {
          return t("common.dash", locale);
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
        ? t("approvalRequests.tab.pending", locale)
        : tab === "approved"
          ? t("approvalRequests.tab.approved", locale)
          : t("approvalRequests.tab.rejected", locale);
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
        title={t("approvalRequests.title", locale)}
        subtitle={t("approvalRequests.subtitle", locale)}
        tabs={tabNodes}
        activeTab={activeTabNode}
      />

      <div style={{ padding: 24, display: "grid", gap: 16 }}>
        {loadFailed ? (
          <Banner
            theme={theme}
            tone="danger"
            icon="warn"
            title={t("approvalRequests.banner.loadFailed.title", locale)}
            body={t("approvalRequests.banner.loadFailed.body", locale)}
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
                ? t("approvalRequests.empty.loadFailed", locale)
                : t("approvalRequests.empty.noResults", locale)}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
