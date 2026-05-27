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
  ActionReceipt,
  CrossAppResourceLink,
  EmptyStateEnvelope,
  EmptyReason,
  OpsPendingApprovalRequestRecord,
  OpsPendingApprovalRequestQueueView,
  RefreshTier,
  ResourceActionDescriptor,
  TenantBookingApprovalRequestStatus,
  UiRefreshMetadata,
} from "@drts/contracts";
import { TENANT_BOOKING_APPROVAL_REQUEST_STATUSES } from "@drts/contracts";
import {
  CanvasBanner as Banner,
  CanvasBtn as Btn,
  CanvasCard as Card,
  CanvasDL as DL,
  CanvasField as Field,
  CanvasIcon,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
  WorkflowDetailDrawer,
  WorkflowEmptyState,
  WorkflowSplitLayout,
  buildCanvasTheme,
  type CanvasTableColumn,
} from "@drts/ui-web";
import { getOpsClient } from "@/lib/api-client";
import { useTranslation } from "@/lib/i18n";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import { getRuntimePlatformAdminBaseUrl } from "@/lib/runtime-config";

type ApprovalQueueRecord = OpsPendingApprovalRequestRecord & {
  availableActions?: ResourceActionDescriptor[];
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
  requestedCell: ReactNode;
  orderCell: ReactNode;
  justificationCell: ReactNode;
  ageCell: ReactNode;
  timeoutCell: ReactNode;
  statusCell: ReactNode;
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
  link?: CrossAppResourceLink | null;
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
const PRIMARY_STATUS_TABS: TenantBookingApprovalRequestStatus[] = [
  "pending",
  "approved",
  "rejected",
];
const REJECT_REASON_OPTIONS = [
  "policy_not_acceptable",
  "insufficient_justification",
  "tenant_scope_mismatch",
  "ops_triage_rejected",
] as const;
const DEFAULT_REFRESH_TIER: RefreshTier = "dispatch";

const pageStyle = {
  padding: 24,
  display: "flex",
  flexDirection: "column" as const,
  gap: 16,
};

const filterGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 12,
  padding: "14px 16px 16px",
  borderBottom: `1px solid ${theme.border}`,
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

const railMetaStyle = {
  display: "flex",
  flexWrap: "wrap" as const,
  gap: 8,
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

function mapErrorToEmptyReason(error: string | null): EmptyReason | null {
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
  return null;
}

function getRefreshIntervalMs(tier: RefreshTier) {
  switch (tier) {
    case "urgent":
    case "dispatch":
      return 5000;
    case "fast":
      return 3000;
    case "medium":
      return 15000;
    case "medium_slow":
    case "slow":
      return 30000;
    case "manual":
    default:
      return null;
  }
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
  const explicitType = (row as { type?: string | null }).type;
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
  const matchedApproverName =
    row.approvers.find((approver) => approver.displayName)?.displayName ?? null;
  if (matchedApproverName) {
    return locale === "en"
      ? `Requested for ${matchedApproverName}`
      : `送交 ${matchedApproverName}`;
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

function getDispatchHref(row: ApprovalQueueRecord) {
  return `/dispatch/${encodeURIComponent(row.orderId)}`;
}

function normalizeActionReceipt(value: unknown): ActionReceipt | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<ActionReceipt>;
  if (
    typeof candidate.actionId !== "string" ||
    typeof candidate.auditId !== "string" ||
    typeof candidate.resourceType !== "string" ||
    typeof candidate.resourceId !== "string" ||
    typeof candidate.status !== "string" ||
    typeof candidate.message !== "string"
  ) {
    return null;
  }

  return candidate as ActionReceipt;
}

function buildAuditLink(
  auditId: string,
  locale: "en" | "zh",
): CrossAppResourceLink | null {
  const platformAdminBaseUrl = getRuntimePlatformAdminBaseUrl();
  if (!platformAdminBaseUrl) {
    return null;
  }

  return {
    targetApp: "platform-admin",
    route: `${platformAdminBaseUrl.replace(/\/$/, "")}/audit?auditId=${encodeURIComponent(auditId)}`,
    resourceType: "audit_log",
    resourceId: auditId,
    openMode: "new_tab",
    label: locale === "en" ? "View audit" : "查看稽核",
  };
}

export default function ApprovalRequestsPage() {
  const { locale } = useTranslation();
  const searchParams = useSearchParams();
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
  const [refreshMetadata, setRefreshMetadata] =
    useState<UiRefreshMetadata | null>(null);
  const [refreshTier, setRefreshTier] =
    useState<RefreshTier>(DEFAULT_REFRESH_TIER);
  const [serverEmptyState, setServerEmptyState] =
    useState<EmptyStateEnvelope | null>(null);
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
      const view = (await client.getOpsPendingApprovalRequestQueueView(
        query,
      )) as OpsPendingApprovalRequestQueueView;
      const rows = view.items as ApprovalQueueRecord[];
      setItems(rows);
      setSelectedId((current) =>
        current && rows.some((row) => row.approvalRequestId === current)
          ? current
          : (rows[0]?.approvalRequestId ?? null),
      );
      setRefreshMetadata(view.refreshMetadata);
      setRefreshTier(view.refreshTier);
      setServerEmptyState(view.emptyState);
    } catch (loadError) {
      setRefreshMetadata(null);
      setServerEmptyState(null);
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
    const intervalMs = getRefreshIntervalMs(refreshTier);
    if (intervalMs === null) {
      return;
    }
    const timer = window.setInterval(() => {
      void loadRows(true);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [loadRows, refreshTier]);

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

  const transportEmptyReason = mapErrorToEmptyReason(error);
  const emptyReason =
    transportEmptyReason ??
    (filteredItems.length === 0 && items.length > 0
      ? "filtered_empty"
      : (serverEmptyState?.reason ?? null));
  const isStale = useMemo(() => {
    if (!refreshMetadata) {
      return false;
    }
    if (refreshMetadata.dataFreshness === "stale") {
      return true;
    }
    return (
      Date.now() - Date.parse(refreshMetadata.generatedAt) >
      refreshMetadata.staleAfterMs
    );
  }, [refreshMetadata]);

  const pendingCount = items.filter((row) => row.status === "pending").length;
  const breachedCount = items.filter((row) => row.slaBreached).length;
  const warningCount = items.filter((row) => {
    const remainingMs = Date.parse(row.timeoutAt) - Date.now();
    return remainingMs > 0 && remainingMs <= 15 * 60 * 1000;
  }).length;
  const tenantCount = new Set(items.map((row) => row.tenantId)).size;
  const primaryActiveStatus = PRIMARY_STATUS_TABS.includes(
    statusFilter as TenantBookingApprovalRequestStatus,
  )
    ? (statusFilter as TenantBookingApprovalRequestStatus)
    : "pending";
  const activeTabLabel = `${formatOpsCodeLabel(
    locale,
    primaryActiveStatus,
  )} · ${items.filter((row) => row.status === primaryActiveStatus).length}`;

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
      let response: unknown = null;
      switch (dialog.intent) {
        case "approve":
          response = await client.post(
            `/api/tenant/approval-requests/${encodeURIComponent(dialog.row.approvalRequestId)}/approve`,
            {
              headers: { "x-tenant-id": dialog.row.tenantId },
              body: { reasonNote: note || null },
            },
          );
          break;
        case "reject":
          response = await client.post(
            `/api/tenant/approval-requests/${encodeURIComponent(dialog.row.approvalRequestId)}/reject`,
            {
              headers: { "x-tenant-id": dialog.row.tenantId },
              body: { reasonCode, reasonNote: note || null },
            },
          );
          break;
        case "escalate":
          response = await client.post(
            `/api/tenant/approval-requests/${encodeURIComponent(dialog.row.approvalRequestId)}/escalate`,
            {
              headers: { "x-tenant-id": dialog.row.tenantId },
              body: { reasonNote: note || null },
            },
          );
          break;
        case "nudge":
          response = await client.nudgeOpsApprovalRequest(
            dialog.row.approvalRequestId,
            {
              reasonNote: note || null,
            },
          );
          break;
        case "acknowledge_breach":
          response = await client.acknowledgeOpsBreach(
            dialog.row.approvalRequestId,
            {
              reasonNote: note || null,
            },
          );
          break;
      }

      const receipt = normalizeActionReceipt(response);
      setFlash({
        tone: "success",
        title: `${getActionLabel(dialog.intent, locale)} ${locale === "en" ? "submitted" : "已送出"}`,
        body: receipt
          ? locale === "en"
            ? `${receipt.message} Audit ${receipt.auditId}.`
            : `${receipt.message} 稽核編號 ${receipt.auditId}。`
          : locale === "en"
            ? `${dialog.row.approvalRequestId} refreshed from the approval queue.`
            : `${dialog.row.approvalRequestId} 已從審批佇列重新整理。`,
        link: receipt ? buildAuditLink(receipt.auditId, locale) : null,
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

  function clearFilters() {
    setStatusFilter("pending");
    setTenantFilter("");
    setTypeFilter("all");
    setSearchValue("");
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
        const disabledReason = disabled
          ? describeDisabledReason(descriptor.disabledReasonCode, locale)
          : null;
        return (
          <div
            key={`${row.approvalRequestId}-${descriptor.action}`}
            style={{ display: "grid", gap: 3 }}
            title={disabledReason ?? undefined}
          >
            <Btn
              theme={theme}
              size="xs"
              variant={getActionTone(descriptor)}
              danger={descriptor.action === "reject"}
              disabled={disabled}
              onClick={() => {
                if (disabled) {
                  return;
                }
                setDialog({ row, descriptor, intent });
                setReasonNote("");
                setReasonCode(REJECT_REASON_OPTIONS[0]);
              }}
            >
              {getActionLabel(intent, locale)}
            </Btn>
            {disabledReason ? (
              <span
                style={{
                  color: theme.textMuted,
                  fontSize: 10.5,
                  lineHeight: 1.2,
                  maxWidth: 92,
                }}
              >
                {disabledReason}
              </span>
            ) : null}
          </div>
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
          href={getDispatchHref(row)}
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
            ? "Visible only to ops_approval_triage / ops_manager / ops_compliance. Sidebar hides the queue for other roles."
            : "只有 ops_approval_triage / ops_manager / ops_compliance 看得到，sidebar 對其他角色隱藏。"
        }
        tabs={PRIMARY_STATUS_TABS.map((status) => {
          const count = items.filter((row) => row.status === status).length;
          const label = formatOpsCodeLabel(locale, status);
          return `${label} · ${count}`;
        })}
        activeTab={activeTabLabel}
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
                ? "Single-tenant scope keeps the same queue semantics while narrowing review to one tenant."
                : `Refresh tier ${refreshTier}. ${pendingCount} pending, ${warningCount} inside timeout warning, ${breachedCount} breached across ${tenantCount} tenants.`
              : tenantFilter.trim()
                ? "切成單一租戶檢視時，仍沿用同一套跨租戶審批語意，只是把 review 範圍收窄。"
                : `更新層級 ${refreshTier}。目前 ${pendingCount} 筆待處理、${warningCount} 筆進入 timeout warning、${breachedCount} 筆已 breach，分布在 ${tenantCount} 個租戶。`
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
            body={
              <div style={{ display: "grid", gap: 6 }}>
                <span>{flash.body}</span>
                {flash.link ? (
                  <a
                    href={flash.link.route}
                    target={
                      flash.link.openMode === "new_tab" ? "_blank" : "_self"
                    }
                    rel="noreferrer"
                    style={{ color: theme.accent, textDecoration: "none" }}
                  >
                    {flash.link.label} →
                  </a>
                ) : null}
              </div>
            }
          />
        ) : null}

        {isStale ? (
          <Banner
            theme={theme}
            tone="warn"
            icon="warn"
            title={
              locale === "en" ? "Queue snapshot is stale" : "佇列快照已過舊"
            }
            body={
              locale === "en"
                ? `This surface is stale against refresh tier ${refreshTier}. Trigger a manual refresh before acting on borderline timeout cases.`
                : `此頁相對於 refresh tier ${refreshTier} 已轉 stale。遇到接近逾時的案件前，請先手動重新整理。`
            }
          />
        ) : null}

        <WorkflowSplitLayout
          density="compact"
          ariaLabel={
            locale === "en" ? "Approval queue workspace" : "審批佇列工作區"
          }
          main={
            <Card
              theme={theme}
              title={locale === "en" ? "Approval queue" : "審批佇列"}
              subtitle={
                refreshMetadata?.generatedAt
                  ? locale === "en"
                    ? `Last refresh ${formatDateTime(locale, refreshMetadata.generatedAt)} UTC`
                    : `最後更新 ${formatDateTime(locale, refreshMetadata.generatedAt)} UTC`
                  : undefined
              }
              padding={0}
            >
              <div style={filterGridStyle}>
                <Field
                  theme={theme}
                  label={locale === "en" ? "Status" : "狀態"}
                >
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
                <Field
                  theme={theme}
                  label={locale === "en" ? "Tenant" : "租戶"}
                >
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

              {loading ? (
                <div style={{ padding: 20 }}>
                  <WorkflowEmptyState
                    title={
                      locale === "en"
                        ? "Loading approval queue"
                        : "載入審批佇列"
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
                    onResetFilters={clearFilters}
                  />
                </div>
              ) : (
                <Table theme={theme} columns={columns} rows={rows} />
              )}
            </Card>
          }
          side={
            selectedRow ? (
              <WorkflowDetailDrawer
                title={selectedRow.approvalRequestId}
                eyebrow={locale === "en" ? "Selected Request" : "目前選取"}
                description={
                  locale === "en"
                    ? "Timeout state, approval packet summary, and exit links for the selected queue row."
                    : "顯示該審批單的 timeout 狀態、申請摘要與離開此頁的 deep links。"
                }
                tone={selectedRow.slaBreached ? "warning" : "neutral"}
                density="compact"
                meta={
                  <div style={railMetaStyle}>
                    <Pill
                      theme={theme}
                      tone={selectedRow.slaBreached ? "warn" : "info"}
                      dot
                    >
                      {formatTimeToTimeout(
                        locale,
                        selectedRow.timeoutAt,
                        selectedRow.opsSlaAcknowledgedAt,
                      )}
                    </Pill>
                    <Pill
                      theme={theme}
                      tone={getStatusTone(selectedRow.status)}
                      dot
                    >
                      {formatOpsCodeLabel(locale, selectedRow.status)}
                    </Pill>
                    <Pill theme={theme} tone="accent" dot>
                      {selectedRow.tenantId}
                    </Pill>
                  </div>
                }
                footer={
                  <Link
                    href={getDispatchHref(selectedRow)}
                    style={{
                      color: theme.accent,
                      textDecoration: "none",
                      fontWeight: 700,
                    }}
                  >
                    {locale === "en"
                      ? "Open dispatch context →"
                      : "前往 dispatch 情境 →"}
                  </Link>
                }
              >
                <Banner
                  theme={theme}
                  tone={selectedRow.slaBreached ? "warn" : "info"}
                  icon={selectedRow.slaBreached ? "warn" : "info"}
                  title={
                    selectedRow.slaBreached
                      ? locale === "en"
                        ? "Timeout warning is active on this request."
                        : "這筆審批已進入 timeout warning / breach 狀態。"
                      : locale === "en"
                        ? "Queue row is still within SLA."
                        : "這筆審批仍在 SLA 內。"
                  }
                  body={
                    locale === "en"
                      ? `Requested ${formatDateTime(locale, selectedRow.createdAt)} UTC · timeout ${formatDateTime(locale, selectedRow.timeoutAt)} UTC`
                      : `提出時間 ${formatDateTime(locale, selectedRow.createdAt)} UTC · 截止 ${formatDateTime(locale, selectedRow.timeoutAt)} UTC`
                  }
                />

                <DL
                  theme={theme}
                  cols={1}
                  items={[
                    {
                      k: locale === "en" ? "TYPE" : "類型",
                      v: formatOpsCodeLabel(
                        locale,
                        getRequestType(selectedRow),
                      ),
                    },
                    {
                      k: locale === "en" ? "REQUESTER" : "提出者",
                      v: getRequesterLabel(selectedRow, locale),
                    },
                    {
                      k: locale === "en" ? "ORDER" : "訂單",
                      v: selectedRow.orderId,
                      mono: true,
                    },
                    {
                      k: locale === "en" ? "BOOKING" : "Booking",
                      v: selectedRow.bookingId,
                      mono: true,
                    },
                    {
                      k: locale === "en" ? "VISIBLE ACTIONS" : "可用操作",
                      v:
                        getAvailableActions(selectedRow)
                          .map((descriptor: ResourceActionDescriptor) =>
                            formatOpsCodeLabel(locale, descriptor.action),
                          )
                          .join(" / ") ||
                        (locale === "en" ? "Read-only" : "唯讀"),
                    },
                  ]}
                />

                <Card
                  theme={theme}
                  title={locale === "en" ? "Justification" : "申請理由"}
                  subtitle={
                    locale === "en"
                      ? "Sourced from evaluation warnings, outcome reason codes, and matched-rule summaries."
                      : "內容來自 evaluation warning、outcome reason code 與命中規則摘要。"
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

                <Card
                  theme={theme}
                  title={locale === "en" ? "Cross-app exits" : "跨 App 出口"}
                >
                  <div style={detailStackStyle}>
                    <span style={{ color: theme.textMuted, fontSize: 12.5 }}>
                      {locale === "en"
                        ? "Action receipts surface a new-tab audit deep link when the backend returns an audit id."
                        : "當後端回傳 audit id 時，action receipt 會提供新分頁 audit deep link。"}
                    </span>
                    {flash?.link ? (
                      <a
                        href={flash.link.route}
                        target={
                          flash.link.openMode === "new_tab" ? "_blank" : "_self"
                        }
                        rel="noreferrer"
                        style={{
                          color: theme.accent,
                          textDecoration: "none",
                          fontWeight: 700,
                        }}
                      >
                        {flash.link.label} →
                      </a>
                    ) : (
                      <span style={{ color: theme.textMuted, fontSize: 12 }}>
                        {locale === "en"
                          ? "No audit receipt link yet."
                          : "目前尚無 audit receipt link。"}
                      </span>
                    )}
                  </div>
                </Card>
              </WorkflowDetailDrawer>
            ) : (
              <WorkflowDetailDrawer
                title={locale === "en" ? "Request detail" : "審批詳情"}
                eyebrow={locale === "en" ? "No Selection" : "尚未選取"}
                description={
                  locale === "en"
                    ? "Pick a queue row to inspect timeout state, justification, and dispatch / audit exits."
                    : "從清單選一筆審批，即可查看 timeout 狀態、理由與 dispatch / audit 出口。"
                }
                tone="neutral"
                density="compact"
              >
                <WorkflowEmptyState
                  title={locale === "en" ? "No row selected" : "尚未選擇項目"}
                  description={
                    locale === "en"
                      ? "The canvas keeps the queue table primary and uses this rail for the active request."
                      : "此畫面以佇列表格為主，右側 rail 顯示目前選取的審批單。"
                  }
                  tone="neutral"
                  density="compact"
                  icon={<CanvasIcon name="audit" size={18} />}
                />
              </WorkflowDetailDrawer>
            )
          }
        />
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

function ApprovalEmptyState({
  locale,
  reason,
  onRefresh,
  hasFilters,
  onResetFilters,
}: {
  locale: "en" | "zh";
  reason: EmptyReason;
  onRefresh: () => void;
  hasFilters: boolean;
  onResetFilters: () => void;
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
          actions={
            hasFilters ? (
              <Btn theme={theme} variant="secondary" onClick={onResetFilters}>
                {locale === "en" ? "Reset filters" : "重設篩選"}
              </Btn>
            ) : undefined
          }
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
