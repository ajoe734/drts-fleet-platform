"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import type {
  EmptyReason,
  OpsPendingApprovalRequestRecord,
  ResourceActionDescriptor,
  TenantBookingApprovalRequestStatus,
} from "@drts/contracts";
import { TENANT_BOOKING_APPROVAL_REQUEST_STATUSES } from "@drts/contracts";
import {
  CanvasBanner as Banner,
  CanvasBtn as Btn,
  CanvasCard as Card,
  CanvasField as Field,
  CanvasIcon,
  CanvasKPI as KPI,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
  WorkflowEmptyState,
  buildCanvasTheme,
  type CanvasTableColumn,
} from "@drts/ui-web";
import { getOpsClient } from "@/lib/api-client";
import { useTranslation } from "@/lib/i18n";
import { formatOpsCodeLabel } from "@/lib/localized-labels";

type ApprovalQueueRecord = OpsPendingApprovalRequestRecord & {
  availableActions?: ResourceActionDescriptor[];
  requestType?: string | null;
  justification?: string | null;
  requesterName?: string | null;
  requestedBy?: string | null;
  requestedByName?: string | null;
  requestedByLabel?: string | null;
};

type StatusFilter = TenantBookingApprovalRequestStatus | "all";
type ActionIntent =
  | "approve"
  | "reject"
  | "escalate"
  | "nudge"
  | "acknowledge_breach";

type QueueRow = Record<string, unknown> & {
  approvalRequestId: string;
  requestCell: ReactNode;
  typeCell: ReactNode;
  tenantCell: ReactNode;
  requesterCell: ReactNode;
  orderCell: ReactNode;
  justificationCell: ReactNode;
  ageCell: ReactNode;
  timeoutCell: ReactNode;
  actionsCell: ReactNode;
  _selected?: boolean;
};

type ActionDialogState = {
  row: ApprovalQueueRecord;
  descriptor: ResourceActionDescriptor;
  intent: ActionIntent;
} | null;

type FlashState = {
  tone: "success" | "danger" | "info" | "warn";
  title: string;
  body: string;
} | null;

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const STATUS_OPTIONS: StatusFilter[] = [
  "all",
  ...TENANT_BOOKING_APPROVAL_REQUEST_STATUSES,
];
const EMPTY_REASON_VALUES: EmptyReason[] = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
];
const REJECT_REASON_OPTIONS = [
  "policy_not_acceptable",
  "insufficient_justification",
  "tenant_scope_mismatch",
  "ops_triage_rejected",
] as const;

const pageStyle = {
  padding: 24,
  display: "flex",
  flexDirection: "column" as const,
  gap: 16,
};

const kpiGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 10,
};

const filterGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 12,
};

const inputStyle = {
  width: "100%",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: theme.bgRaised,
  color: theme.text,
  padding: "8px 10px",
  fontSize: 12.5,
  fontFamily: theme.fontFamily,
  outline: "none",
};

const textareaStyle = {
  ...inputStyle,
  minHeight: 96,
  resize: "vertical" as const,
};

const detailStackStyle = {
  display: "flex",
  flexDirection: "column" as const,
  gap: 12,
};

function formatDateTime(locale: "en" | "zh", value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  })
    .format(new Date(value))
    .replace(",", "");
}

function formatAge(locale: "en" | "zh", value: string) {
  const diffMinutes = Math.max(
    0,
    Math.round((Date.now() - Date.parse(value)) / (1000 * 60)),
  );
  if (diffMinutes < 60) {
    return locale === "en" ? `${diffMinutes} min` : `${diffMinutes} 分`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  const remMinutes = diffMinutes % 60;
  return locale === "en"
    ? `${diffHours}h ${remMinutes}m`
    : `${diffHours} 小時 ${remMinutes} 分`;
}

function formatTimeToTimeout(
  locale: "en" | "zh",
  timeoutAt: string,
  acknowledgedAt: string | null,
) {
  const remainingMs = Date.parse(timeoutAt) - Date.now();
  if (remainingMs <= 0) {
    return acknowledgedAt
      ? locale === "en"
        ? "breach acknowledged"
        : "已確認逾時"
      : locale === "en"
        ? "breached"
        : "已逾時";
  }
  const remainingMinutes = Math.ceil(remainingMs / (1000 * 60));
  return locale === "en"
    ? `< ${remainingMinutes} min`
    : `< ${remainingMinutes} 分`;
}

function getTimeoutTone(row: ApprovalQueueRecord) {
  const remainingMs = Date.parse(row.timeoutAt) - Date.now();
  if (remainingMs <= 0) {
    return row.opsSlaAcknowledgedAt ? "info" : "danger";
  }
  if (remainingMs <= 5 * 60 * 1000) {
    return "danger";
  }
  if (remainingMs <= 15 * 60 * 1000) {
    return "warn";
  }
  return "success";
}

function parseEmptyReason(
  override: string | null,
  error: string | null,
  filteredEmpty: boolean,
  hasRows: boolean,
): EmptyReason | null {
  if (override && EMPTY_REASON_VALUES.includes(override as EmptyReason)) {
    return override as EmptyReason;
  }
  if (error) {
    if (error.includes("401") || error.includes("403")) {
      return "permission_denied";
    }
    if (
      error.includes("404") ||
      error.includes("501") ||
      error.includes("NOT_IMPLEMENTED") ||
      error.includes("APPROVAL_WORKFLOW_NOT_AVAILABLE")
    ) {
      return "not_provisioned";
    }
    if (
      error.includes("502") ||
      error.includes("503") ||
      error.includes("504") ||
      error.toLowerCase().includes("abort")
    ) {
      return "external_unavailable";
    }
    return "fetch_failed";
  }
  if (filteredEmpty && hasRows) {
    return "filtered_empty";
  }
  if (!hasRows) {
    return "no_data";
  }
  return null;
}

function pickActionIntent(action: string): ActionIntent | null {
  if (action === "approve") return "approve";
  if (action === "reject") return "reject";
  if (action === "escalate") return "escalate";
  if (action === "nudge") return "nudge";
  if (action === "acknowledge_breach" || action === "acknowledge_sla_breach") {
    return "acknowledge_breach";
  }
  return null;
}

function getActionLabel(intent: ActionIntent, locale: "en" | "zh") {
  switch (intent) {
    case "approve":
      return locale === "en" ? "Approve" : "核准";
    case "reject":
      return locale === "en" ? "Reject" : "退回";
    case "escalate":
      return locale === "en" ? "Escalate" : "升級";
    case "nudge":
      return locale === "en" ? "Nudge" : "催辦";
    case "acknowledge_breach":
      return locale === "en" ? "Acknowledge" : "確認逾時";
    default:
      return intent;
  }
}

function getRequestType(row: ApprovalQueueRecord) {
  const explicitType =
    row.requestType ?? (row as { type?: string | null }).type;
  if (explicitType) {
    return explicitType;
  }
  const actionCode = row.evaluationSnapshot.finalAction;
  if (actionCode) {
    return actionCode;
  }
  const matchedRule = row.evaluationSnapshot.matchedRules[0];
  if (matchedRule?.action) {
    return matchedRule.action;
  }
  return "manual_review";
}

function getRequesterLabel(row: ApprovalQueueRecord, locale: "en" | "zh") {
  const direct =
    row.requesterName ??
    row.requestedByName ??
    row.requestedByLabel ??
    row.requestedBy;
  if (direct) {
    return direct;
  }
  const passengerId = row.evaluationSnapshot.inputSnapshot?.passengerId;
  if (passengerId) {
    return locale === "en"
      ? `booking flow · ${passengerId}`
      : `訂單流程 · ${passengerId}`;
  }
  return locale === "en" ? "workflow-generated" : "系統產生";
}

function getJustification(row: ApprovalQueueRecord, locale: "en" | "zh") {
  const direct = row.justification;
  if (direct) {
    return direct;
  }
  const warning = row.evaluationSnapshot.warnings?.[0]?.message;
  if (warning) {
    return warning;
  }
  const reasonCodes = row.evaluationSnapshot.outcome?.reasonCodes ?? [];
  if (reasonCodes.length > 0) {
    return reasonCodes
      .map((code: string) => formatOpsCodeLabel(locale, code))
      .join(" / ");
  }
  const matchedRule = row.evaluationSnapshot.matchedRules[0];
  if (matchedRule?.ruleName) {
    return matchedRule.ruleName;
  }
  return locale === "en"
    ? "Awaiting approval packet details from tenant workflow."
    : "等待租戶流程補齊審批說明。";
}

function getAvailableActions(row: ApprovalQueueRecord) {
  return row.availableActions ?? [];
}

function getActionTone(
  descriptor: ResourceActionDescriptor,
): "primary" | "secondary" {
  if (descriptor.action === "approve") return "primary";
  return "secondary";
}

function describeDisabledReason(code: string | undefined, locale: "en" | "zh") {
  switch (code) {
    case "request_closed":
      return locale === "en" ? "Request already closed" : "請求已結束";
    case "already_acknowledged":
      return locale === "en" ? "Breach already acknowledged" : "逾時已確認";
    case "not_authorized":
      return locale === "en"
        ? "Current actor is not authorized"
        : "目前身分無權操作";
    default:
      return locale === "en"
        ? "Unavailable in current scope"
        : "目前範圍不可用";
  }
}

function getStatusTone(
  status: TenantBookingApprovalRequestStatus,
): "warn" | "success" | "danger" | "neutral" {
  switch (status) {
    case "pending":
      return "warn";
    case "approved":
      return "success";
    case "rejected":
      return "danger";
    case "cancelled_by_re_evaluation":
    case "timeout_escalated":
    default:
      return "neutral";
  }
}

function hasQueueFilters(
  statusFilter: StatusFilter,
  tenantFilter: string,
  typeFilter: string,
  searchValue: string,
) {
  return (
    Boolean(searchValue.trim()) ||
    Boolean(tenantFilter.trim()) ||
    typeFilter !== "all" ||
    statusFilter !== "all"
  );
}

function getDeepLinkHref(
  target: "dispatch" | "tenant_booking" | "platform_audit",
  row: ApprovalQueueRecord,
  auditId?: string,
) {
  switch (target) {
    case "dispatch":
      return `/dispatch/${encodeURIComponent(row.orderId)}`;
    case "tenant_booking":
      return `/bookings/${encodeURIComponent(row.bookingId)}?tenantId=${encodeURIComponent(row.tenantId)}&approvalRequestId=${encodeURIComponent(row.approvalRequestId)}`;
    case "platform_audit":
      return `/audit?auditId=${encodeURIComponent(auditId ?? row.approvalRequestId)}`;
    default:
      return "/";
  }
}

export default function ApprovalRequestsPage() {
  const { locale } = useTranslation();
  const searchParams = useSearchParams();
  const emptyReasonOverride = searchParams.get("emptyReason");
  const client = getOpsClient();
  const [items, setItems] = useState<ApprovalQueueRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    (searchParams.get("status") as StatusFilter) || "pending",
  );
  const [tenantFilter, setTenantFilter] = useState(
    searchParams.get("tenantId") ?? "",
  );
  const [typeFilter, setTypeFilter] = useState(
    searchParams.get("type") ?? "all",
  );
  const [searchValue, setSearchValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, startRefreshing] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const [dialog, setDialog] = useState<ActionDialogState>(null);
  const [reasonNote, setReasonNote] = useState("");
  const [reasonCode, setReasonCode] = useState<string>(
    REJECT_REASON_OPTIONS[0],
  );
  const [flash, setFlash] = useState<FlashState>(null);
  const selectedRow = useMemo(
    () => items.find((row) => row.approvalRequestId === selectedId) ?? null,
    [items, selectedId],
  );

  const loadRows = useEffectEvent(async (background: boolean) => {
    if (background) {
      startRefreshing(() => undefined);
    } else {
      setLoading(true);
    }

    setError(null);
    try {
      const query: {
        tenantId?: string;
        status?: TenantBookingApprovalRequestStatus;
      } = {};
      if (tenantFilter.trim()) {
        query.tenantId = tenantFilter.trim();
      }
      if (statusFilter !== "all") {
        query.status = statusFilter;
      }
      const rows = (await client.listOpsPendingApprovalRequests(
        query,
      )) as ApprovalQueueRecord[];
      setItems(rows);
      setSelectedId((current) =>
        current && rows.some((row) => row.approvalRequestId === current)
          ? current
          : (rows[0]?.approvalRequestId ?? null),
      );
      setLastRefreshedAt(new Date().toISOString());
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : String(loadError),
      );
    } finally {
      setLoading(false);
    }
  });

  useEffect(() => {
    void loadRows(false);
  }, [loadRows, statusFilter, tenantFilter]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadRows(true);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [loadRows]);

  const typeOptions = useMemo(() => {
    const values = new Set<string>();
    for (const row of items) {
      values.add(getRequestType(row));
    }
    return ["all", ...Array.from(values)];
  }, [items]);

  const filteredItems = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    return items
      .filter((row) => {
        if (typeFilter !== "all" && getRequestType(row) !== typeFilter) {
          return false;
        }
        if (!query) {
          return true;
        }
        const text = [
          row.approvalRequestId,
          row.tenantId,
          row.bookingId,
          row.orderId,
          getRequestType(row),
          getRequesterLabel(row, locale),
          getJustification(row, locale),
        ]
          .join(" ")
          .toLowerCase();
        return text.includes(query);
      })
      .sort((left, right) => {
        if (left.slaBreached !== right.slaBreached) {
          return left.slaBreached ? -1 : 1;
        }
        return left.timeoutAt.localeCompare(right.timeoutAt);
      });
  }, [items, locale, searchValue, typeFilter]);

  const emptyReason = parseEmptyReason(
    emptyReasonOverride,
    error,
    filteredItems.length === 0,
    items.length > 0,
  );

  const pendingCount = items.filter((row) => row.status === "pending").length;
  const breachedCount = items.filter((row) => row.slaBreached).length;
  const warningCount = items.filter((row) => {
    const remainingMs = Date.parse(row.timeoutAt) - Date.now();
    return remainingMs > 0 && remainingMs <= 15 * 60 * 1000;
  }).length;
  const tenantCount = new Set(items.map((row) => row.tenantId)).size;

  async function submitAction() {
    if (!dialog) return;

    const note = reasonNote.trim();
    if (
      (dialog.descriptor.requiresReason || dialog.intent === "reject") &&
      !note
    ) {
      setFlash({
        tone: "danger",
        title: locale === "en" ? "Reason required" : "需要原因",
        body:
          locale === "en"
            ? "This action requires a non-empty reason note."
            : "此操作需要填寫原因說明。",
      });
      return;
    }

    try {
      switch (dialog.intent) {
        case "approve":
          await client.post(
            `/api/tenant/approval-requests/${encodeURIComponent(dialog.row.approvalRequestId)}/approve`,
            {
              headers: { "x-tenant-id": dialog.row.tenantId },
              body: { reasonNote: note || null },
            },
          );
          break;
        case "reject":
          await client.post(
            `/api/tenant/approval-requests/${encodeURIComponent(dialog.row.approvalRequestId)}/reject`,
            {
              headers: { "x-tenant-id": dialog.row.tenantId },
              body: { reasonCode, reasonNote: note || null },
            },
          );
          break;
        case "escalate":
          await client.post(
            `/api/tenant/approval-requests/${encodeURIComponent(dialog.row.approvalRequestId)}/escalate`,
            {
              headers: { "x-tenant-id": dialog.row.tenantId },
              body: { reasonNote: note || null },
            },
          );
          break;
        case "nudge":
          await client.nudgeOpsApprovalRequest(dialog.row.approvalRequestId, {
            reasonNote: note || null,
          });
          break;
        case "acknowledge_breach":
          await client.acknowledgeOpsBreach(dialog.row.approvalRequestId, {
            reasonNote: note || null,
          });
          break;
      }

      setFlash({
        tone: "success",
        title: `${getActionLabel(dialog.intent, locale)} ${locale === "en" ? "submitted" : "已送出"}`,
        body:
          locale === "en"
            ? `${dialog.row.approvalRequestId} refreshed from the approval queue.`
            : `${dialog.row.approvalRequestId} 已從審批佇列重新整理。`,
      });
      setDialog(null);
      setReasonNote("");
      setReasonCode(REJECT_REASON_OPTIONS[0]);
      await loadRows(true);
    } catch (submitError) {
      setFlash({
        tone: "danger",
        title: locale === "en" ? "Action failed" : "操作失敗",
        body:
          submitError instanceof Error
            ? submitError.message
            : String(submitError),
      });
    }
  }

  const columns: CanvasTableColumn<QueueRow>[] = [
    { h: locale === "en" ? "Request" : "審批單", k: "requestCell", w: 120 },
    { h: locale === "en" ? "Type" : "類型", k: "typeCell", w: 150 },
    { h: locale === "en" ? "Tenant" : "租戶", k: "tenantCell", w: 130 },
    { h: locale === "en" ? "Requester" : "提出者", k: "requesterCell", w: 150 },
    {
      h: locale === "en" ? "Requested" : "提出時間",
      k: "requestedCell",
      w: 120,
    },
    { h: locale === "en" ? "Order" : "關聯訂單", k: "orderCell", w: 120 },
    {
      h: locale === "en" ? "Justification" : "理由",
      k: "justificationCell",
      w: 250,
    },
    { h: locale === "en" ? "Age" : "等待", k: "ageCell", w: 80 },
    { h: locale === "en" ? "Timeout" : "逾時", k: "timeoutCell", w: 120 },
    { h: locale === "en" ? "Status" : "狀態", k: "statusCell", w: 120 },
    { h: locale === "en" ? "Actions" : "操作", k: "actionsCell", w: 220 },
  ];

  const rows: QueueRow[] = filteredItems.map((row) => {
    const requestType = getRequestType(row);
    const justification = getJustification(row, locale);
    const actionButtons = getAvailableActions(row)
      .map((descriptor: ResourceActionDescriptor) => {
        const intent = pickActionIntent(descriptor.action);
        if (!intent) {
          return null;
        }
        const disabled = !descriptor.enabled;
        return (
          <Btn
            key={`${row.approvalRequestId}-${descriptor.action}`}
            theme={theme}
            size="xs"
            variant={getActionTone(descriptor)}
            danger={descriptor.action === "reject"}
            disabled={disabled}
            onClick={() => {
              if (disabled) {
                setFlash({
                  tone: "warn",
                  title:
                    locale === "en" ? "Action unavailable" : "操作目前不可用",
                  body: describeDisabledReason(
                    descriptor.disabledReasonCode,
                    locale,
                  ),
                });
                return;
              }
              setDialog({ row, descriptor, intent });
              setReasonNote("");
              setReasonCode(REJECT_REASON_OPTIONS[0]);
            }}
          >
            {getActionLabel(intent, locale)}
          </Btn>
        );
      })
      .filter(Boolean);

    return {
      approvalRequestId: row.approvalRequestId,
      requestCell: (
        <button
          type="button"
          onClick={() => setSelectedId(row.approvalRequestId)}
          style={{
            background: "transparent",
            border: "none",
            padding: 0,
            color: theme.accent,
            cursor: "pointer",
            fontFamily: theme.monoFamily,
            fontSize: 11.5,
            fontWeight: 700,
          }}
        >
          {row.approvalRequestId.slice(0, 10)}
        </button>
      ),
      typeCell: (
        <Pill theme={theme} tone={row.slaBreached ? "warn" : "info"} dot>
          {formatOpsCodeLabel(locale, requestType)}
        </Pill>
      ),
      tenantCell: (
        <Pill theme={theme} tone="accent" dot>
          {row.tenantId}
        </Pill>
      ),
      requesterCell: getRequesterLabel(row, locale),
      requestedCell: (
        <span style={{ fontFamily: theme.monoFamily }}>
          {formatDateTime(locale, row.createdAt)}
        </span>
      ),
      orderCell: (
        <Link
          href={getDeepLinkHref("dispatch", row)}
          style={{
            color: theme.accent,
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          {row.orderId.slice(0, 10)} →
        </Link>
      ),
      justificationCell: (
        <span
          style={{
            display: "inline-block",
            maxWidth: 280,
            whiteSpace: "normal",
            lineHeight: 1.35,
          }}
        >
          {justification}
        </span>
      ),
      ageCell: (
        <span style={{ fontFamily: theme.monoFamily }}>
          {formatAge(locale, row.createdAt)}
        </span>
      ),
      timeoutCell: (
        <Pill theme={theme} tone={getTimeoutTone(row)} dot>
          {formatTimeToTimeout(locale, row.timeoutAt, row.opsSlaAcknowledgedAt)}
        </Pill>
      ),
      actionsCell: (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 4,
            alignItems: "center",
          }}
        >
          {actionButtons.length > 0 ? (
            actionButtons
          ) : (
            <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
              {locale === "en" ? "Read-only" : "唯讀"}
            </span>
          )}
        </div>
      ),
      statusCell: (
        <Pill theme={theme} tone={getStatusTone(row.status)} dot>
          {formatOpsCodeLabel(locale, row.status)}
        </Pill>
      ),
      _selected: row.approvalRequestId === selectedId,
    };
  });

  return (
    <>
      <PageHeader
        theme={theme}
        title={
          locale === "en"
            ? "Approval Queue · Cross-tenant"
            : "審批佇列 · 跨租戶"
        }
        subtitle={
          locale === "en"
            ? "T2 refresh every 5s. Queue visibility is limited to ops_approval_triage, ops_manager, and ops_compliance."
            : "T2 每 5 秒更新。此佇列只對 ops_approval_triage、ops_manager、ops_compliance 顯示。"
        }
        tabs={STATUS_OPTIONS.map((status) =>
          status === "all"
            ? locale === "en"
              ? "All"
              : "全部"
            : formatOpsCodeLabel(locale, status),
        )}
        activeTab={
          statusFilter === "all"
            ? locale === "en"
              ? "All"
              : "全部"
            : formatOpsCodeLabel(locale, statusFilter)
        }
        actions={
          <Btn
            theme={theme}
            variant="secondary"
            icon="arrow"
            onClick={() => void loadRows(true)}
          >
            {refreshing
              ? locale === "en"
                ? "Refreshing"
                : "更新中"
              : locale === "en"
                ? "Refresh"
                : "重新整理"}
          </Btn>
        }
      />

      <div style={pageStyle}>
        <div style={kpiGridStyle}>
          <KPI
            theme={theme}
            label={locale === "en" ? "Pending" : "待處理"}
            value={pendingCount}
            sub={locale === "en" ? "live queue" : "即時佇列"}
          />
          <KPI
            theme={theme}
            label={locale === "en" ? "Breached" : "SLA 逾時"}
            value={breachedCount}
            delta={
              breachedCount > 0
                ? locale === "en"
                  ? "needs triage"
                  : "需處理"
                : undefined
            }
            deltaTone={breachedCount > 0 ? "down" : "neutral"}
          />
          <KPI
            theme={theme}
            label={locale === "en" ? "Warning window" : "預警中"}
            value={warningCount}
            sub={locale === "en" ? "< 15 min to timeout" : "15 分內將逾時"}
          />
          <KPI
            theme={theme}
            label={locale === "en" ? "Tenants" : "租戶數"}
            value={tenantCount}
            hint={
              lastRefreshedAt
                ? `${formatDateTime(locale, lastRefreshedAt)} UTC`
                : undefined
            }
          />
        </div>

        <Banner
          theme={theme}
          tone={
            tenantFilter.trim() ? "accent" : breachedCount > 0 ? "warn" : "info"
          }
          icon={
            tenantFilter.trim() ? "search" : breachedCount > 0 ? "warn" : "info"
          }
          title={
            locale === "en"
              ? tenantFilter.trim()
                ? `Scoped to tenant ${tenantFilter.trim()}`
                : "Cross-tenant approval queue"
              : tenantFilter.trim()
                ? `目前限定租戶 ${tenantFilter.trim()}`
                : "跨租戶審批佇列"
          }
          body={
            locale === "en"
              ? tenantFilter.trim()
                ? "Filter-dependent single-tenant mode keeps the same queue semantics while narrowing the review scope."
                : "T2 refresh runs every 5 seconds. CTAs render from each row's availableActions, and timeout warnings track the approval_request.timeout_warning window."
              : tenantFilter.trim()
                ? "依篩選切成單一租戶檢視時，仍沿用相同的跨租戶審批語意。"
                : "T2 每 5 秒更新。按鈕依每列 availableActions 呈現，逾時計算對應 approval_request.timeout_warning 規格。"
          }
        />

        {flash ? (
          <Banner
            theme={theme}
            tone={flash.tone}
            icon={
              flash.tone === "success"
                ? "check"
                : flash.tone === "danger"
                  ? "warn"
                  : "info"
            }
            title={flash.title}
            body={flash.body}
          />
        ) : null}

        <Card theme={theme} title={locale === "en" ? "Filters" : "篩選條件"}>
          <div style={filterGridStyle}>
            <Field theme={theme} label={locale === "en" ? "Status" : "狀態"}>
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as StatusFilter)
                }
                style={inputStyle}
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status === "all"
                      ? locale === "en"
                        ? "All"
                        : "全部"
                      : formatOpsCodeLabel(locale, status)}
                  </option>
                ))}
              </select>
            </Field>
            <Field theme={theme} label={locale === "en" ? "Tenant" : "租戶"}>
              <input
                value={tenantFilter}
                onChange={(event) => setTenantFilter(event.target.value)}
                placeholder="tenant-id"
                style={inputStyle}
              />
            </Field>
            <Field theme={theme} label={locale === "en" ? "Type" : "類型"}>
              <select
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value)}
                style={inputStyle}
              >
                {typeOptions.map((type) => (
                  <option key={type} value={type}>
                    {type === "all"
                      ? locale === "en"
                        ? "All types"
                        : "全部類型"
                      : formatOpsCodeLabel(locale, type)}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              theme={theme}
              label={locale === "en" ? "Search" : "搜尋"}
              hint={
                locale === "en"
                  ? "request / tenant / booking / justification"
                  : "搜尋審批單、租戶、訂單或理由"
              }
            >
              <input
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder={locale === "en" ? "queue search" : "佇列搜尋"}
                style={inputStyle}
              />
            </Field>
          </div>
        </Card>

        <Card
          theme={theme}
          title={locale === "en" ? "Pending list" : "審批清單"}
          subtitle={
            lastRefreshedAt
              ? locale === "en"
                ? `Last refresh ${formatDateTime(locale, lastRefreshedAt)} UTC`
                : `最後更新 ${formatDateTime(locale, lastRefreshedAt)} UTC`
              : undefined
          }
          padding={0}
        >
          {loading ? (
            <div style={{ padding: 20 }}>
              <WorkflowEmptyState
                title={
                  locale === "en" ? "Loading approval queue" : "載入審批佇列"
                }
                description={
                  locale === "en"
                    ? "T2 refresh connects every 5 seconds and preserves the current queue scope."
                    : "T2 每 5 秒更新，並保留目前的篩選範圍。"
                }
                tone="neutral"
                density="compact"
                icon={<CanvasIcon name="arrow" size={18} />}
              />
            </div>
          ) : emptyReason ? (
            <div style={{ padding: 20 }}>
              <ApprovalEmptyState
                locale={locale}
                reason={emptyReason}
                onRefresh={() => void loadRows(true)}
                hasFilters={hasQueueFilters(
                  statusFilter,
                  tenantFilter,
                  typeFilter,
                  searchValue,
                )}
              />
            </div>
          ) : (
            <Table theme={theme} columns={columns} rows={rows} />
          )}
        </Card>

        <Card
          theme={theme}
          title={locale === "en" ? "Request detail" : "審批詳情"}
          subtitle={
            selectedRow
              ? selectedRow.approvalRequestId
              : locale === "en"
                ? "Select a queue row"
                : "選擇一筆佇列項目"
          }
        >
          {selectedRow ? (
            <div style={detailStackStyle}>
              <Banner
                theme={theme}
                tone={selectedRow.slaBreached ? "warn" : "info"}
                icon={selectedRow.slaBreached ? "warn" : "info"}
                title={
                  selectedRow.slaBreached
                    ? locale === "en"
                      ? "Timeout warning is active on this request."
                      : "這筆審批已進入逾時預警 / 逾時處理。"
                    : locale === "en"
                      ? "Queue row is still within SLA."
                      : "這筆審批仍在 SLA 內。"
                }
                body={
                  locale === "en"
                    ? `Status ${formatOpsCodeLabel(locale, selectedRow.status)} · timeout ${formatDateTime(locale, selectedRow.timeoutAt)} UTC`
                    : `狀態 ${formatOpsCodeLabel(locale, selectedRow.status)} · 截止 ${formatDateTime(locale, selectedRow.timeoutAt)} UTC`
                }
              />

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                  gap: 10,
                  fontSize: 12.5,
                }}
              >
                <DetailItem
                  label={locale === "en" ? "Type" : "類型"}
                  value={formatOpsCodeLabel(
                    locale,
                    getRequestType(selectedRow),
                  )}
                />
                <DetailItem
                  label={locale === "en" ? "Tenant" : "租戶"}
                  value={selectedRow.tenantId}
                  mono
                />
                <DetailItem
                  label={locale === "en" ? "Requester" : "提出者"}
                  value={getRequesterLabel(selectedRow, locale)}
                />
                <DetailItem
                  label={locale === "en" ? "Requested at" : "提出時間"}
                  value={`${formatDateTime(locale, selectedRow.createdAt)} UTC`}
                  mono
                />
                <DetailItem
                  label={locale === "en" ? "Order" : "訂單"}
                  value={selectedRow.orderId}
                  mono
                />
                <DetailItem
                  label={locale === "en" ? "Booking" : "Booking"}
                  value={selectedRow.bookingId}
                  mono
                />
                <DetailItem
                  label={locale === "en" ? "Status" : "狀態"}
                  value={formatOpsCodeLabel(locale, selectedRow.status)}
                />
                <DetailItem
                  label={locale === "en" ? "Visible actions" : "可用操作"}
                  value={
                    getAvailableActions(selectedRow)
                      .map((descriptor: ResourceActionDescriptor) =>
                        formatOpsCodeLabel(locale, descriptor.action),
                      )
                      .join(" / ") || (locale === "en" ? "Read-only" : "唯讀")
                  }
                />
              </div>

              <Card
                theme={theme}
                title={locale === "en" ? "Justification" : "申請理由"}
                subtitle={
                  locale === "en"
                    ? "Derived from evaluation warnings / rules when explicit packet text is absent."
                    : "若 contract 沒有直接提供文字，會退回 evaluation warning / 規則摘要。"
                }
              >
                <p
                  style={{
                    margin: 0,
                    color: theme.text,
                    fontSize: 12.5,
                    lineHeight: 1.5,
                  }}
                >
                  {getJustification(selectedRow, locale)}
                </p>
              </Card>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <Link
                  href={getDeepLinkHref("dispatch", selectedRow)}
                  style={{ color: theme.accent, textDecoration: "none" }}
                >
                  {locale === "en"
                    ? "Open dispatch context"
                    : "回到 dispatch 情境"}{" "}
                  →
                </Link>
                <Link
                  href={getDeepLinkHref("tenant_booking", selectedRow)}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: theme.accent, textDecoration: "none" }}
                >
                  {locale === "en" ? "Open tenant booking" : "開啟租戶 booking"}{" "}
                  <CanvasIcon name="ext" size={12} />
                </Link>
                <Link
                  href={getDeepLinkHref("platform_audit", selectedRow)}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: theme.accent, textDecoration: "none" }}
                >
                  {locale === "en" ? "View audit trail" : "檢視稽核軌跡"}{" "}
                  <CanvasIcon name="ext" size={12} />
                </Link>
              </div>
            </div>
          ) : (
            <WorkflowEmptyState
              title={locale === "en" ? "No row selected" : "尚未選擇項目"}
              description={
                locale === "en"
                  ? "Pick a request from the queue to inspect timeout state, justification, and cross-app exits."
                  : "從清單選一筆審批，即可查看逾時狀態、理由與跨 app 出口。"
              }
              tone="neutral"
              density="compact"
              icon={<CanvasIcon name="audit" size={18} />}
            />
          )}
        </Card>
      </div>

      {dialog ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.7)",
            display: "grid",
            placeItems: "center",
            padding: 24,
            zIndex: 50,
          }}
        >
          <div
            style={{
              width: "min(560px, 100%)",
              borderRadius: 14,
              background: theme.bg,
              border: `1px solid ${theme.border}`,
              boxShadow: "0 20px 48px rgba(0,0,0,0.35)",
              padding: 20,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 14,
              }}
            >
              <Pill theme={theme} tone="warn" dot>
                {getActionLabel(dialog.intent, locale)}
              </Pill>
              <strong style={{ color: theme.text }}>
                {dialog.row.approvalRequestId}
              </strong>
            </div>

            <Field
              theme={theme}
              label={locale === "en" ? "Tenant scope" : "租戶範圍"}
            >
              <div style={inputStyle}>{dialog.row.tenantId}</div>
            </Field>

            {dialog.intent === "reject" ? (
              <Field
                theme={theme}
                label={locale === "en" ? "Reason code" : "原因代碼"}
                required
              >
                <select
                  value={reasonCode}
                  onChange={(event) => setReasonCode(event.target.value)}
                  style={inputStyle}
                >
                  {REJECT_REASON_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {formatOpsCodeLabel(locale, option)}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}

            <Field
              theme={theme}
              label={locale === "en" ? "Reason note" : "補充說明"}
              required={Boolean(
                dialog.descriptor.requiresReason || dialog.intent === "reject",
              )}
              hint={
                locale === "en"
                  ? "High-risk actions require a written reason before submission."
                  : "高風險操作需要填寫書面原因。"
              }
            >
              <textarea
                value={reasonNote}
                onChange={(event) => setReasonNote(event.target.value)}
                style={textareaStyle}
                placeholder={
                  locale === "en"
                    ? "Explain the decision or escalation path"
                    : "說明這次核准、退回或升級的原因"
                }
              />
            </Field>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
                marginTop: 16,
              }}
            >
              <Btn
                theme={theme}
                variant="ghost"
                onClick={() => setDialog(null)}
              >
                {locale === "en" ? "Cancel" : "取消"}
              </Btn>
              <Btn
                theme={theme}
                variant={dialog.intent === "approve" ? "primary" : "secondary"}
                danger={dialog.intent === "reject"}
                onClick={() => void submitAction()}
              >
                {getActionLabel(dialog.intent, locale)}
              </Btn>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function DetailItem({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div
      style={{
        border: `1px solid ${theme.border}`,
        borderRadius: 10,
        background: theme.surface,
        padding: "10px 12px",
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          color: theme.textMuted,
          textTransform: "uppercase",
          letterSpacing: 0.4,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          color: theme.text,
          fontSize: mono ? 11.5 : 12.5,
          fontFamily: mono ? theme.monoFamily : theme.fontFamily,
          overflowWrap: "anywhere",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function ApprovalEmptyState({
  locale,
  reason,
  onRefresh,
  hasFilters,
}: {
  locale: "en" | "zh";
  reason: EmptyReason;
  onRefresh: () => void;
  hasFilters: boolean;
}) {
  switch (reason) {
    case "not_provisioned":
      return (
        <WorkflowEmptyState
          title={
            locale === "en"
              ? "Approval queue not provisioned"
              : "審批佇列尚未佈建"
          }
          description={
            locale === "en"
              ? "This environment has not enabled the cross-tenant approval queue contract yet."
              : "此環境尚未開啟跨租戶審批佇列 contract。"
          }
          tone="warning"
          density="compact"
          icon={<CanvasIcon name="flags" size={18} />}
          actions={
            <Btn theme={theme} variant="secondary" onClick={onRefresh}>
              {locale === "en" ? "Retry" : "重試"}
            </Btn>
          }
        />
      );
    case "fetch_failed":
      return (
        <WorkflowEmptyState
          title={locale === "en" ? "Queue fetch failed" : "審批佇列讀取失敗"}
          description={
            locale === "en"
              ? "The request returned an unexpected error. Retry, then inspect API logs if it persists."
              : "讀取時發生未預期錯誤。可先重試，持續失敗再檢查 API log。"
          }
          tone="danger"
          density="compact"
          icon={<CanvasIcon name="warn" size={18} />}
          actions={
            <Btn theme={theme} danger onClick={onRefresh}>
              {locale === "en" ? "Retry fetch" : "重新讀取"}
            </Btn>
          }
        />
      );
    case "permission_denied":
      return (
        <WorkflowEmptyState
          title={locale === "en" ? "Permission denied" : "沒有權限"}
          description={
            locale === "en"
              ? "Only ops_approval_triage, ops_manager, and ops_compliance can view this queue."
              : "只有 ops_approval_triage、ops_manager、ops_compliance 可以看到此佇列。"
          }
          tone="warning"
          density="compact"
          icon={<CanvasIcon name="audit" size={18} />}
        />
      );
    case "external_unavailable":
      return (
        <WorkflowEmptyState
          title={
            locale === "en"
              ? "External dependency unavailable"
              : "外部依賴暫時不可用"
          }
          description={
            locale === "en"
              ? "The queue backend or proxy did not respond within the refresh window."
              : "queue backend 或 proxy 未在 refresh window 內回應。"
          }
          tone="warning"
          density="compact"
          icon={<CanvasIcon name="health" size={18} />}
          actions={
            <Btn theme={theme} variant="secondary" onClick={onRefresh}>
              {locale === "en" ? "Retry now" : "立即重試"}
            </Btn>
          }
        />
      );
    case "filtered_empty":
      return (
        <WorkflowEmptyState
          title={
            locale === "en"
              ? "No rows in current scope"
              : "目前篩選範圍沒有資料"
          }
          description={
            hasFilters
              ? locale === "en"
                ? "Adjust status, tenant, type, or search terms to widen the queue scope."
                : "請調整狀態、租戶、類型或搜尋條件，放寬目前的佇列範圍。"
              : locale === "en"
                ? "Current scope has no visible rows."
                : "目前範圍沒有可見資料。"
          }
          tone="neutral"
          density="compact"
          icon={<CanvasIcon name="search" size={18} />}
        />
      );
    case "no_data":
    default:
      return (
        <WorkflowEmptyState
          title={
            locale === "en"
              ? "No pending approval requests"
              : "目前範圍內沒有待審批項目"
          }
          description={
            locale === "en"
              ? "This is the live empty state for a healthy queue with no pending cross-tenant approval work."
              : "這是健康佇列下的 live empty state，代表目前沒有跨租戶待審批工作。"
          }
          tone="neutral"
          density="compact"
          icon={<CanvasIcon name="check" size={18} />}
          actions={
            <Btn theme={theme} variant="secondary" onClick={onRefresh}>
              {locale === "en" ? "Refresh queue" : "重新整理佇列"}
            </Btn>
          }
        />
      );
  }
}
