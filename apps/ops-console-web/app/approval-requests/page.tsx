import Link from "next/link";
import type { CSSProperties } from "react";
import type {
  AuditLogRecord,
  OpsPendingApprovalRequestRecord,
  TenantApprovalMatchedRuleResult,
  TenantBookingApprovalRequestStatus,
  TenantBookingQuotaImpactResult,
  TenantPrincipalRef,
} from "@drts/contracts";
import { TENANT_BOOKING_APPROVAL_REQUEST_STATUSES } from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { formatOpsCodeLabel, formatOpsCodeList } from "@/lib/localized-labels";
import { formatMinorCurrency } from "@/lib/ops-analytics";
import { getServerLocale } from "@/lib/server-locale";
import {
  CalloutBanner,
  DataCellStack,
  DataTable,
  DataViewCard,
  KpiCard,
  KpiRow,
  PageHeader,
  StatusChip,
  Td,
  Tr,
} from "@drts/ui-web";
import {
  buildOpsApprovalQueueQuery,
  filterAndSortOpsApprovalRequests,
  filterRelevantTenantAuditRecords,
  resolveSelectedApprovalRequestId,
  type ApprovalQueueFilters,
} from "./approval-queue-model";
import {
  acknowledgeApprovalRequestBreach,
  nudgeApprovalRequest,
} from "./actions";

export const dynamic = "force-dynamic";

type ApprovalRequestsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const DEFAULT_STATUS: TenantBookingApprovalRequestStatus | "all" = "pending";
const EXPIRING_WINDOW_HOURS = 4;
const STATUS_VALUES = new Set<string>([
  "all",
  ...TENANT_BOOKING_APPROVAL_REQUEST_STATUSES,
]);

const pageLayoutStyle: CSSProperties = {
  display: "grid",
  gap: "20px",
};

const splitGridStyle: CSSProperties = {
  display: "grid",
  gap: "16px",
  gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
  alignItems: "start",
};

const detailStackStyle: CSSProperties = {
  display: "grid",
  gap: "16px",
};

const filterFormStyle: CSSProperties = {
  display: "grid",
  gap: "14px",
};

const filterGridStyle: CSSProperties = {
  display: "grid",
  gap: "12px",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
};

const fieldLabelStyle: CSSProperties = {
  display: "grid",
  gap: "6px",
  fontSize: "12px",
  fontWeight: 700,
  color: "#475569",
};

const inputStyle: CSSProperties = {
  width: "100%",
  border: "1px solid #cbd5e1",
  borderRadius: "10px",
  padding: "10px 12px",
  fontSize: "14px",
  color: "#0f172a",
  background: "#ffffff",
  boxSizing: "border-box",
};

const buttonRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "10px",
  alignItems: "center",
};

const primaryButtonStyle: CSSProperties = {
  appearance: "none",
  border: "none",
  borderRadius: "999px",
  background: "#b45309",
  color: "#ffffff",
  padding: "10px 16px",
  fontSize: "13px",
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryButtonStyle: CSSProperties = {
  ...primaryButtonStyle,
  background: "#0f172a",
};

const disabledButtonStyle: CSSProperties = {
  ...primaryButtonStyle,
  background: "#cbd5e1",
  cursor: "not-allowed",
};

const resetLinkStyle: CSSProperties = {
  color: "#b45309",
  fontWeight: 700,
  textDecoration: "none",
};

const detailLinkStyle: CSSProperties = {
  color: "#b45309",
  fontWeight: 700,
  textDecoration: "none",
};

const metadataGridStyle: CSSProperties = {
  display: "grid",
  gap: "10px 14px",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
};

const metadataTileStyle: CSSProperties = {
  display: "grid",
  gap: "4px",
  padding: "12px 14px",
  border: "1px solid #e2e8f0",
  borderRadius: "14px",
  background: "#f8fafc",
};

const metadataLabelStyle: CSSProperties = {
  fontSize: "11px",
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "#64748b",
};

const metadataValueStyle: CSSProperties = {
  fontSize: "13px",
  color: "#0f172a",
  wordBreak: "break-word",
};

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "14px",
  color: "#0f172a",
};

const sectionStackStyle: CSSProperties = {
  display: "grid",
  gap: "12px",
};

const ruleCardStyle: CSSProperties = {
  display: "grid",
  gap: "10px",
  padding: "14px 16px",
  border: "1px solid #e2e8f0",
  borderRadius: "14px",
  background: "#f8fafc",
};

const chipRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
};

const actionPanelStyle: CSSProperties = {
  display: "grid",
  gap: "14px",
  padding: "14px 16px",
  border: "1px solid #e2e8f0",
  borderRadius: "14px",
  background: "#fff7ed",
};

const formActionStyle: CSSProperties = {
  display: "grid",
  gap: "10px",
};

const smallTextStyle: CSSProperties = {
  color: "#64748b",
  fontSize: "12px",
  lineHeight: 1.5,
};

const preStyle: CSSProperties = {
  margin: 0,
  padding: "14px 16px",
  borderRadius: "14px",
  background: "#0f172a",
  color: "#e2e8f0",
  fontSize: "12px",
  lineHeight: 1.55,
  overflowX: "auto",
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseStatus(
  value: string | undefined,
): TenantBookingApprovalRequestStatus | "all" {
  if (value && STATUS_VALUES.has(value)) {
    return value as TenantBookingApprovalRequestStatus | "all";
  }
  return DEFAULT_STATUS;
}

function parseExpiresWithinHours(value: string | undefined) {
  return value === String(EXPIRING_WINDOW_HOURS) ? EXPIRING_WINDOW_HOURS : null;
}

function resolveFilters(
  params: Record<string, string | string[] | undefined>,
): ApprovalQueueFilters {
  return {
    tenantId: firstParam(params.tenantId)?.trim() ?? "",
    status: parseStatus(firstParam(params.status)),
    expiresWithinHours: parseExpiresWithinHours(
      firstParam(params.expiresWithinHours),
    ),
  };
}

function buildApprovalRequestHref(
  filters: ApprovalQueueFilters,
  approvalRequestId: string,
) {
  const searchParams = new URLSearchParams();

  if (filters.tenantId) {
    searchParams.set("tenantId", filters.tenantId);
  }
  if (filters.status) {
    searchParams.set("status", filters.status);
  }
  if (filters.expiresWithinHours !== null) {
    searchParams.set("expiresWithinHours", String(filters.expiresWithinHours));
  }
  searchParams.set("approvalRequestId", approvalRequestId);

  return `/approval-requests?${searchParams.toString()}`;
}

function formatDateTime(value: string | null | undefined, locale: "en" | "zh") {
  if (!value) {
    return locale === "en" ? "Not recorded" : "尚未記錄";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "zh-TW", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatRelativeDeadline(
  deadline: string,
  now: Date,
  locale: "en" | "zh",
) {
  const diffMs = Date.parse(deadline) - now.getTime();
  if (!Number.isFinite(diffMs)) {
    return locale === "en" ? "Unknown deadline" : "截止時間未知";
  }

  const hours = Math.round((Math.abs(diffMs) / (60 * 60 * 1000)) * 10) / 10;
  if (diffMs >= 0) {
    return locale === "en" ? `Due in ${hours}h` : `${hours} 小時後到期`;
  }
  return locale === "en" ? `${hours}h overdue` : `已逾時 ${hours} 小時`;
}

function formatPrincipal(locale: "en" | "zh", principal: TenantPrincipalRef) {
  const parts = [formatOpsCodeLabel(locale, principal.kind)];
  if (principal.displayName) {
    parts.push(principal.displayName);
  }
  if (principal.userId) {
    parts.push(principal.userId);
  }
  if (principal.roleCode) {
    parts.push(principal.roleCode);
  }
  if (principal.costCenterCode) {
    parts.push(principal.costCenterCode);
  }
  return parts.join(" · ");
}

function formatPrincipalList(
  locale: "en" | "zh",
  principals: readonly TenantPrincipalRef[],
) {
  if (principals.length === 0) {
    return locale === "en" ? "No approvers" : "沒有 approver";
  }
  return principals
    .map((principal) => formatPrincipal(locale, principal))
    .join(", ");
}

function formatConditionValue(value: unknown, locale: "en" | "zh"): string {
  if (Array.isArray(value)) {
    return value.map((item) => formatConditionValue(item, locale)).join(", ");
  }
  if (typeof value === "boolean") {
    return value
      ? locale === "en"
        ? "Yes"
        : "是"
      : locale === "en"
        ? "No"
        : "否";
  }
  if (value === null || value === undefined || value === "") {
    return locale === "en" ? "Empty" : "空值";
  }
  return String(value);
}

function approvalStatusTone(status: TenantBookingApprovalRequestStatus) {
  switch (status) {
    case "approved":
      return "success" as const;
    case "rejected":
      return "danger" as const;
    case "timeout_escalated":
      return "warning" as const;
    case "cancelled_by_re_evaluation":
      return "neutral" as const;
    default:
      return "ops" as const;
  }
}

function slaTone(request: OpsPendingApprovalRequestRecord) {
  if (!request.slaBreached) {
    return "success" as const;
  }
  return request.opsSlaAcknowledgedAt
    ? ("warning" as const)
    : ("danger" as const);
}

function renderMatchedRule(
  rule: TenantApprovalMatchedRuleResult,
  locale: "en" | "zh",
) {
  return (
    <article key={rule.ruleId} style={ruleCardStyle}>
      <div style={{ display: "grid", gap: "6px" }}>
        <strong>{rule.ruleName || rule.ruleId}</strong>
        <div style={chipRowStyle}>
          <StatusChip
            tone="ops"
            authorityLabel={locale === "en" ? "rule" : "規則"}
            label={rule.ruleId}
          />
          <StatusChip
            tone="warning"
            authorityLabel={locale === "en" ? "action" : "動作"}
            label={formatOpsCodeLabel(locale, rule.action)}
          />
          <StatusChip
            tone="info"
            authorityLabel={locale === "en" ? "mode" : "模式"}
            label={
              rule.approvalMode
                ? formatOpsCodeLabel(locale, rule.approvalMode)
                : locale === "en"
                  ? "Not set"
                  : "未設定"
            }
          />
        </div>
      </div>
      <div style={smallTextStyle}>
        {locale === "en" ? "Approvers: " : "Approvers："}
        {formatPrincipalList(locale, rule.approvers)}
      </div>
      <div style={{ display: "grid", gap: "8px" }}>
        {rule.matchedConditions.map((condition, index) => (
          <div
            key={`${rule.ruleId}-${condition.field}-${index}`}
            style={metadataTileStyle}
          >
            <span style={metadataLabelStyle}>
              {formatOpsCodeLabel(locale, condition.field)}
            </span>
            <span style={metadataValueStyle}>
              {formatOpsCodeLabel(
                locale,
                condition.op ?? condition.operator ?? "eq",
              )}{" "}
              {formatConditionValue(
                condition.values ?? condition.value ?? null,
                locale,
              )}
            </span>
          </div>
        ))}
      </div>
    </article>
  );
}

function renderQuotaImpact(
  impact: TenantBookingQuotaImpactResult,
  index: number,
  locale: "en" | "zh",
) {
  return (
    <Tr
      key={`${impact.scope}-${impact.costCenterCode ?? "tenant"}-${impact.periodKey}-${impact.dimension}-${index}`}
    >
      <Td density="compact">
        <DataCellStack
          primary={formatOpsCodeLabel(locale, impact.scope)}
          secondary={
            impact.costCenterCode ??
            (locale === "en" ? "Tenant-wide" : "租戶整體")
          }
        />
      </Td>
      <Td density="compact">{impact.periodKey}</Td>
      <Td density="compact">{formatOpsCodeLabel(locale, impact.dimension)}</Td>
      <Td density="compact">
        <DataCellStack
          primary={String(impact.delta)}
          secondary={
            impact.limitValue !== null
              ? `${locale === "en" ? "Limit" : "上限"} ${impact.limitValue}`
              : locale === "en"
                ? "No explicit limit"
                : "無明確上限"
          }
        />
      </Td>
      <Td density="compact">
        <DataCellStack
          primary={
            impact.remainingAfter !== null
              ? String(impact.remainingAfter)
              : locale === "en"
                ? "Unknown"
                : "未知"
          }
          secondary={
            impact.remainingPercentAfter !== null
              ? `${impact.remainingPercentAfter}%`
              : locale === "en"
                ? "No percent"
                : "無百分比"
          }
        />
      </Td>
      <Td density="compact">
        <StatusChip
          tone={
            impact.triggered === "block"
              ? "danger"
              : impact.triggered === "approval"
                ? "warning"
                : impact.triggered === "warn"
                  ? "info"
                  : "success"
          }
          authorityLabel={locale === "en" ? "quota" : "配額"}
          label={formatOpsCodeLabel(locale, impact.triggered)}
        />
      </Td>
    </Tr>
  );
}

function renderFlashBanner(
  locale: "en" | "zh",
  flashAction: string | undefined,
  flashResult: string | undefined,
  flashMessage: string | undefined,
) {
  if (!flashAction || !flashResult) {
    return null;
  }

  const successMessage =
    flashAction === "nudge"
      ? locale === "en"
        ? "Approver nudge recorded. P1 only emits audit evidence and does not send live notifications."
        : "已記錄 approver nudge。P1 只寫入 audit evidence，不發送即時通知。"
      : locale === "en"
        ? "SLA breach acknowledgement recorded so ops visibility is auditable."
        : "已記錄 SLA breach acknowledgement，ops 已查看可供稽核。";

  const failureTitle =
    flashAction === "nudge"
      ? locale === "en"
        ? "Unable to record approver nudge"
        : "無法記錄 approver nudge"
      : locale === "en"
        ? "Unable to acknowledge the SLA breach"
        : "無法標記 SLA breach 已查看";

  if (flashResult === "success") {
    return (
      <CalloutBanner
        tone="success"
        title={locale === "en" ? "Ops action recorded" : "已記錄 ops 動作"}
        description={successMessage}
      />
    );
  }

  return (
    <CalloutBanner
      tone="danger"
      title={failureTitle}
      description={
        flashMessage || (locale === "en" ? "Try again." : "請再試一次。")
      }
    />
  );
}

function HiddenActionFields({
  request,
  filters,
}: {
  request: OpsPendingApprovalRequestRecord;
  filters: ApprovalQueueFilters;
}) {
  return (
    <>
      <input
        type="hidden"
        name="approvalRequestId"
        value={request.approvalRequestId}
      />
      <input type="hidden" name="tenantId" value={filters.tenantId} />
      <input type="hidden" name="status" value={filters.status} />
      <input
        type="hidden"
        name="expiresWithinHours"
        value={
          filters.expiresWithinHours !== null
            ? String(filters.expiresWithinHours)
            : ""
        }
      />
    </>
  );
}

export default async function ApprovalRequestsPage({
  searchParams,
}: ApprovalRequestsPageProps) {
  const resolvedSearchParams = (searchParams ??
    Promise.resolve(
      {} as Record<string, string | string[] | undefined>,
    )) as Promise<Record<string, string | string[] | undefined>>;

  const [client, locale, params] = await Promise.all([
    getServerOpsClient(),
    getServerLocale(),
    resolvedSearchParams,
  ]);
  const now = new Date();
  const filters = resolveFilters(params);

  let listError: string | null = null;
  let visibleRequests: OpsPendingApprovalRequestRecord[] = [];

  try {
    const items = await client.listOpsPendingApprovalRequests(
      buildOpsApprovalQueueQuery(filters, now),
    );
    visibleRequests = filterAndSortOpsApprovalRequests(items, filters, now);
  } catch (error) {
    listError = error instanceof Error ? error.message : String(error);
  }

  const requestedApprovalRequestId =
    firstParam(params.approvalRequestId)?.trim() || null;
  const selectedApprovalRequestId = resolveSelectedApprovalRequestId(
    visibleRequests,
    requestedApprovalRequestId,
  );
  const selectedRequest =
    visibleRequests.find(
      (request) => request.approvalRequestId === selectedApprovalRequestId,
    ) ?? null;

  let relevantAuditRecords: AuditLogRecord[] = [];
  let auditError: string | null = null;

  if (selectedRequest) {
    try {
      const records = (await client.listAuditLogs()).filter(
        (record) => record.tenantId === selectedRequest.tenantId,
      );
      relevantAuditRecords = filterRelevantTenantAuditRecords(
        records,
        selectedRequest,
      ).slice(0, 12);
    } catch (error) {
      auditError = error instanceof Error ? error.message : String(error);
    }
  }

  const breachedCount = visibleRequests.filter(
    (request) => request.slaBreached,
  ).length;
  const acknowledgedBreachCount = visibleRequests.filter(
    (request) => request.opsSlaAcknowledgedAt,
  ).length;
  const expiringSoonCount = visibleRequests.filter(
    (request) =>
      Date.parse(request.timeoutAt) <=
      now.getTime() + EXPIRING_WINDOW_HOURS * 60 * 60 * 1000,
  ).length;
  const tenantCount = new Set(
    visibleRequests.map((request) => request.tenantId),
  ).size;
  const selectedQuotaImpacts =
    selectedRequest?.evaluationSnapshot.quotaImpacts ?? [];
  const selectedWarnings =
    selectedRequest?.evaluationSnapshot.outcome?.warnings ??
    selectedRequest?.evaluationSnapshot.warnings ??
    [];
  const flashAction = firstParam(params.flashAction);
  const flashResult = firstParam(params.flashResult);
  const flashMessage = firstParam(params.flashMessage);

  return (
    <div style={pageLayoutStyle}>
      <PageHeader
        eyebrow={locale === "en" ? "Governance" : "治理"}
        title={locale === "en" ? "Approval Queue" : "審批佇列"}
        subtitle={
          locale === "en"
            ? "Cross-tenant ops monitoring for pending approval requests, deadline pressure, audit context, and read-only follow-up actions."
            : "跨 tenant 的 approval request 監控頁，聚焦截止壓力、audit context 與唯讀 follow-up 動作。"
        }
        meta={[
          {
            label: locale === "en" ? "Visible requests" : "目前顯示",
            value: visibleRequests.length,
          },
          {
            label: locale === "en" ? "Breached" : "已 breach",
            value: breachedCount,
            tone: breachedCount > 0 ? "danger" : "success",
          },
          {
            label: locale === "en" ? "Tenants" : "Tenant 數",
            value: tenantCount,
          },
        ]}
        actions={
          <Link href="/approval-requests" style={resetLinkStyle}>
            {locale === "en" ? "Reset filters" : "重設篩選"}
          </Link>
        }
      />

      <CalloutBanner
        tone="warning"
        title={
          locale === "en"
            ? "P1 stays read-only from ops."
            : "P1 保持 ops 端唯讀。"
        }
        description={
          locale === "en"
            ? "Ops can inspect tenant audit, nudge approvers, and acknowledge SLA breaches. Approve/reject overrides stay out of scope for this slice."
            : "Ops 只能檢視 tenant audit、nudge approver 與標記 SLA breach 已查看；approve/reject override 不在這一版範圍內。"
        }
      />

      {renderFlashBanner(locale, flashAction, flashResult, flashMessage)}

      {listError ? (
        <CalloutBanner
          tone="danger"
          title={
            locale === "en"
              ? "Approval queue could not be loaded"
              : "無法載入 approval queue"
          }
          description={listError}
        />
      ) : null}

      <KpiRow minWidth="170px">
        <KpiCard
          label={locale === "en" ? "Pending in view" : "目前待處理"}
          value={visibleRequests.length}
          detail={
            locale === "en"
              ? `${tenantCount} tenant(s) currently visible`
              : `目前涵蓋 ${tenantCount} 個 tenant`
          }
          tone="ops"
        />
        <KpiCard
          label={locale === "en" ? "SLA breached" : "SLA breach"}
          value={breachedCount}
          detail={
            locale === "en"
              ? `${acknowledgedBreachCount} already acknowledged by ops`
              : `${acknowledgedBreachCount} 筆已由 ops acknowledge`
          }
          tone={breachedCount > 0 ? "danger" : "success"}
        />
        <KpiCard
          label={locale === "en" ? "Expires < 4h" : "4 小時內到期"}
          value={expiringSoonCount}
          detail={
            locale === "en"
              ? "Use the filter to isolate near-deadline requests"
              : "可用篩選只看接近 deadline 的請求"
          }
          tone={expiringSoonCount > 0 ? "warning" : "neutral"}
        />
        <KpiCard
          label={locale === "en" ? "Selected audit rows" : "選中 audit rows"}
          value={relevantAuditRecords.length}
          detail={
            locale === "en"
              ? "Reference-matched tenant audit evidence"
              : "依 reference 過濾出的 tenant audit evidence"
          }
          tone="info"
        />
      </KpiRow>

      <DataViewCard
        title={locale === "en" ? "Queue filters" : "佇列篩選"}
        subtitle={
          locale === "en"
            ? "Scope the queue by tenant, lifecycle status, and near-term timeout pressure."
            : "依 tenant、狀態與即將到期的 timeout 壓力縮小 approval queue。"
        }
        tone="ops"
        density="compact"
        summary={
          locale === "en"
            ? "Tenant/status filters are sent upstream; the view then sorts breached and unacknowledged items first."
            : "Tenant / status 篩選會先送到 API，再於前端把已 breach 且未 acknowledge 的項目排最前面。"
        }
      >
        <form method="get" style={filterFormStyle}>
          <div style={filterGridStyle}>
            <label style={fieldLabelStyle}>
              {locale === "en" ? "Tenant ID" : "Tenant ID"}
              <input
                type="search"
                name="tenantId"
                defaultValue={filters.tenantId}
                placeholder={locale === "en" ? "tenant_acme" : "tenant_acme"}
                style={inputStyle}
              />
            </label>
            <label style={fieldLabelStyle}>
              {locale === "en" ? "Status" : "狀態"}
              <select
                name="status"
                defaultValue={filters.status}
                style={inputStyle}
              >
                <option value="all">
                  {locale === "en" ? "All statuses" : "所有狀態"}
                </option>
                {TENANT_BOOKING_APPROVAL_REQUEST_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {formatOpsCodeLabel(locale, status)}
                  </option>
                ))}
              </select>
            </label>
            <label style={fieldLabelStyle}>
              {locale === "en" ? "Timeout window" : "Timeout 視窗"}
              <select
                name="expiresWithinHours"
                defaultValue={
                  filters.expiresWithinHours !== null
                    ? String(filters.expiresWithinHours)
                    : ""
                }
                style={inputStyle}
              >
                <option value="">
                  {locale === "en" ? "All deadlines" : "所有 deadline"}
                </option>
                <option value={String(EXPIRING_WINDOW_HOURS)}>
                  {locale === "en"
                    ? `Expires within ${EXPIRING_WINDOW_HOURS}h`
                    : `${EXPIRING_WINDOW_HOURS} 小時內到期`}
                </option>
              </select>
            </label>
          </div>
          <div style={buttonRowStyle}>
            <button type="submit" style={primaryButtonStyle}>
              {locale === "en" ? "Apply filters" : "套用篩選"}
            </button>
            <Link href="/approval-requests" style={resetLinkStyle}>
              {locale === "en" ? "Clear" : "清除"}
            </Link>
          </div>
        </form>
      </DataViewCard>

      <div style={splitGridStyle}>
        <DataViewCard
          title={
            locale === "en" ? "Pending approval requests" : "待處理審批請求"
          }
          subtitle={
            locale === "en"
              ? "Cross-tenant queue ordered by breach risk first."
              : "跨 tenant approval queue，優先顯示 breach 風險較高的項目。"
          }
          tone="warning"
          density="compact"
          summary={
            locale === "en"
              ? `${visibleRequests.length} request(s) visible after filtering.`
              : `篩選後共有 ${visibleRequests.length} 筆 request。`
          }
          footer={
            locale === "en"
              ? "Select any row to inspect tenant audit, the evaluation snapshot, and the limited P1 ops actions."
              : "選擇任一列即可查看 tenant audit、evaluation snapshot 與 P1 限定的 ops 動作。"
          }
        >
          <DataTable
            density="compact"
            tone="warning"
            columns={[
              {
                label: locale === "en" ? "Request" : "Request",
                width: "220px",
              },
              { label: locale === "en" ? "Tenant" : "Tenant", width: "130px" },
              { label: locale === "en" ? "Timeout" : "到期", width: "150px" },
              { label: locale === "en" ? "Approvers" : "Approvers" },
              { label: locale === "en" ? "SLA" : "SLA", width: "140px" },
              { label: locale === "en" ? "Detail" : "明細", width: "90px" },
            ]}
            empty={
              locale === "en"
                ? "No approval requests matched these filters."
                : "沒有符合篩選條件的 approval request。"
            }
          >
            {visibleRequests.map((request) => (
              <Tr
                key={request.approvalRequestId}
                highlighted={
                  request.approvalRequestId === selectedApprovalRequestId
                }
              >
                <Td density="compact">
                  <DataCellStack
                    primary={<strong>{request.bookingId}</strong>}
                    secondary={request.approvalRequestId}
                    tertiary={request.orderId}
                  />
                </Td>
                <Td density="compact" mono>
                  {request.tenantId}
                </Td>
                <Td density="compact">
                  <DataCellStack
                    primary={formatDateTime(request.timeoutAt, locale)}
                    secondary={formatRelativeDeadline(
                      request.timeoutAt,
                      now,
                      locale,
                    )}
                  />
                </Td>
                <Td density="compact">
                  <DataCellStack
                    primary={formatPrincipalList(locale, request.approvers)}
                    secondary={
                      locale === "en"
                        ? `${request.resolvedApproverUserIds.length} resolved user(s)`
                        : `${request.resolvedApproverUserIds.length} 位已解析使用者`
                    }
                  />
                </Td>
                <Td density="compact">
                  <div style={{ display: "grid", gap: "6px" }}>
                    <StatusChip
                      tone={approvalStatusTone(request.status)}
                      authorityLabel={locale === "en" ? "status" : "狀態"}
                      label={formatOpsCodeLabel(locale, request.status)}
                    />
                    <StatusChip
                      tone={slaTone(request)}
                      authorityLabel={locale === "en" ? "sla" : "SLA"}
                      label={
                        request.slaBreached
                          ? request.opsSlaAcknowledgedAt
                            ? locale === "en"
                              ? "Breached · seen"
                              : "已 breach · 已查看"
                            : locale === "en"
                              ? "Breached"
                              : "已 breach"
                          : locale === "en"
                            ? "On track"
                            : "未 breach"
                      }
                    />
                  </div>
                </Td>
                <Td density="compact">
                  <Link
                    href={buildApprovalRequestHref(
                      filters,
                      request.approvalRequestId,
                    )}
                    style={detailLinkStyle}
                  >
                    {locale === "en" ? "Inspect" : "查看"}
                  </Link>
                </Td>
              </Tr>
            ))}
          </DataTable>
        </DataViewCard>

        <div style={detailStackStyle}>
          {selectedRequest ? (
            <>
              <DataViewCard
                title={locale === "en" ? "Selected request" : "選中的 request"}
                subtitle={`${selectedRequest.bookingId} · ${selectedRequest.tenantId}`}
                tone="ops"
                density="compact"
                summary={
                  locale === "en"
                    ? `Evaluation ${selectedRequest.evaluationId} · ${selectedRequest.evaluationSnapshot.matchedRules.length} matched rule(s) · ${selectedQuotaImpacts.length} quota impact(s).`
                    : `Evaluation ${selectedRequest.evaluationId} · ${selectedRequest.evaluationSnapshot.matchedRules.length} 筆 matched rule · ${selectedQuotaImpacts.length} 筆 quota impact。`
                }
              >
                <div style={sectionStackStyle}>
                  <div style={metadataGridStyle}>
                    <div style={metadataTileStyle}>
                      <span style={metadataLabelStyle}>
                        {locale === "en" ? "Tenant" : "Tenant"}
                      </span>
                      <span style={metadataValueStyle}>
                        {selectedRequest.tenantId}
                      </span>
                    </div>
                    <div style={metadataTileStyle}>
                      <span style={metadataLabelStyle}>
                        {locale === "en" ? "Approval mode" : "Approval 模式"}
                      </span>
                      <span style={metadataValueStyle}>
                        {formatOpsCodeLabel(
                          locale,
                          selectedRequest.approvalMode,
                        )}
                      </span>
                    </div>
                    <div style={metadataTileStyle}>
                      <span style={metadataLabelStyle}>
                        {locale === "en" ? "Timeout" : "Timeout"}
                      </span>
                      <span style={metadataValueStyle}>
                        {formatDateTime(selectedRequest.timeoutAt, locale)}
                      </span>
                    </div>
                    <div style={metadataTileStyle}>
                      <span style={metadataLabelStyle}>
                        {locale === "en" ? "Created" : "建立時間"}
                      </span>
                      <span style={metadataValueStyle}>
                        {formatDateTime(selectedRequest.createdAt, locale)}
                      </span>
                    </div>
                    <div style={metadataTileStyle}>
                      <span style={metadataLabelStyle}>
                        {locale === "en" ? "Approvers" : "Approvers"}
                      </span>
                      <span style={metadataValueStyle}>
                        {formatPrincipalList(locale, selectedRequest.approvers)}
                      </span>
                    </div>
                    <div style={metadataTileStyle}>
                      <span style={metadataLabelStyle}>
                        {locale === "en" ? "Escalation target" : "升級目標"}
                      </span>
                      <span style={metadataValueStyle}>
                        {selectedRequest.escalationTarget
                          ? formatPrincipal(
                              locale,
                              selectedRequest.escalationTarget,
                            )
                          : locale === "en"
                            ? "None"
                            : "無"}
                      </span>
                    </div>
                    <div style={metadataTileStyle}>
                      <span style={metadataLabelStyle}>
                        {locale === "en" ? "Last nudge" : "最後 nudge"}
                      </span>
                      <span style={metadataValueStyle}>
                        {formatDateTime(selectedRequest.lastNudgedAt, locale)}
                      </span>
                    </div>
                    <div style={metadataTileStyle}>
                      <span style={metadataLabelStyle}>
                        {locale === "en"
                          ? "SLA acknowledgement"
                          : "SLA acknowledgement"}
                      </span>
                      <span style={metadataValueStyle}>
                        {formatDateTime(
                          selectedRequest.opsSlaAcknowledgedAt,
                          locale,
                        )}
                      </span>
                    </div>
                  </div>

                  <div style={actionPanelStyle}>
                    <div style={sectionStackStyle}>
                      <h3 style={sectionTitleStyle}>
                        {locale === "en" ? "Ops follow-up" : "Ops follow-up"}
                      </h3>
                      <p style={smallTextStyle}>
                        {locale === "en"
                          ? "These controls stay within the P1 boundary: view tenant audit, emit a nudge audit event, and record that ops saw an SLA breach. No approve/reject override is exposed here."
                          : "這些控制都留在 P1 邊界內：檢視 tenant audit、寫入 nudge audit event，以及記錄 ops 已查看 SLA breach；此處不提供 approve / reject override。"}
                      </p>
                    </div>

                    <div style={buttonRowStyle}>
                      <a href="#tenant-audit" style={detailLinkStyle}>
                        {locale === "en"
                          ? "View tenant audit"
                          : "查看 tenant audit"}
                      </a>
                    </div>

                    <form action={nudgeApprovalRequest} style={formActionStyle}>
                      <HiddenActionFields
                        request={selectedRequest}
                        filters={filters}
                      />
                      <label style={fieldLabelStyle}>
                        {locale === "en"
                          ? "Nudge note (optional)"
                          : "Nudge 備註（選填）"}
                        <input
                          type="text"
                          name="reasonNote"
                          placeholder={
                            locale === "en"
                              ? "Audit-only reminder for the current approvers"
                              : "寫入 audit 的提醒備註"
                          }
                          style={inputStyle}
                        />
                      </label>
                      <div style={buttonRowStyle}>
                        <button
                          type="submit"
                          style={
                            selectedRequest.status === "pending"
                              ? primaryButtonStyle
                              : disabledButtonStyle
                          }
                          disabled={selectedRequest.status !== "pending"}
                        >
                          {locale === "en"
                            ? "Nudge approver"
                            : "Nudge approver"}
                        </button>
                        <span style={smallTextStyle}>
                          {locale === "en"
                            ? "No live notification fan-out yet; this action only leaves audit evidence."
                            : "目前不會觸發即時通知；這個動作只會留下 audit evidence。"}
                        </span>
                      </div>
                    </form>

                    <form
                      action={acknowledgeApprovalRequestBreach}
                      style={formActionStyle}
                    >
                      <HiddenActionFields
                        request={selectedRequest}
                        filters={filters}
                      />
                      <label style={fieldLabelStyle}>
                        {locale === "en"
                          ? "Acknowledgement note (optional)"
                          : "Acknowledge 備註（選填）"}
                        <input
                          type="text"
                          name="reasonNote"
                          placeholder={
                            locale === "en"
                              ? "Why ops is accepting the current breach posture"
                              : "說明 ops 為何接受目前的 breach 狀態"
                          }
                          style={inputStyle}
                        />
                      </label>
                      <div style={buttonRowStyle}>
                        <button
                          type="submit"
                          style={
                            selectedRequest.status === "pending" &&
                            selectedRequest.slaBreached &&
                            !selectedRequest.opsSlaAcknowledgedAt
                              ? secondaryButtonStyle
                              : disabledButtonStyle
                          }
                          disabled={
                            selectedRequest.status !== "pending" ||
                            !selectedRequest.slaBreached ||
                            Boolean(selectedRequest.opsSlaAcknowledgedAt)
                          }
                        >
                          {locale === "en"
                            ? "Acknowledge SLA breach"
                            : "Acknowledge SLA breach"}
                        </button>
                        <span style={smallTextStyle}>
                          {selectedRequest.opsSlaAcknowledgedAt
                            ? locale === "en"
                              ? "Ops has already acknowledged this breach."
                              : "這筆 breach 已由 ops acknowledge。"
                            : selectedRequest.slaBreached
                              ? locale === "en"
                                ? "Use this once ops has seen the breach and taken ownership."
                                : "當 ops 已查看並接手這筆 breach 時，使用這個動作。"
                              : locale === "en"
                                ? "The request has not breached its SLA yet."
                                : "這筆 request 尚未 breach SLA。"}
                        </span>
                      </div>
                    </form>
                  </div>
                </div>
              </DataViewCard>

              <DataViewCard
                title={locale === "en" ? "Evaluation outcome" : "評估結果"}
                subtitle={
                  locale === "en"
                    ? "Matched rules, quota pressure, and outcome reason codes from the stored approval snapshot."
                    : "顯示已儲存 approval snapshot 內的 matched rules、quota 壓力與 outcome reason codes。"
                }
                tone="warning"
                density="compact"
                summary={
                  locale === "en"
                    ? `Decision: ${formatOpsCodeLabel(
                        locale,
                        selectedRequest.evaluationSnapshot.outcome?.decision ??
                          "require_approval",
                      )}`
                    : `Decision：${formatOpsCodeLabel(
                        locale,
                        selectedRequest.evaluationSnapshot.outcome?.decision ??
                          "require_approval",
                      )}`
                }
              >
                <div style={sectionStackStyle}>
                  <div style={chipRowStyle}>
                    <StatusChip
                      tone={approvalStatusTone(selectedRequest.status)}
                      authorityLabel={locale === "en" ? "queue" : "佇列"}
                      label={formatOpsCodeLabel(locale, selectedRequest.status)}
                    />
                    <StatusChip
                      tone="warning"
                      authorityLabel={locale === "en" ? "decision" : "決策"}
                      label={formatOpsCodeLabel(
                        locale,
                        selectedRequest.evaluationSnapshot.outcome?.decision ??
                          "require_approval",
                      )}
                    />
                    <StatusChip
                      tone={
                        selectedRequest.evaluationSnapshot.outcome
                          ?.approvalRequired
                          ? "danger"
                          : "success"
                      }
                      authorityLabel={locale === "en" ? "approval" : "審批需求"}
                      label={
                        selectedRequest.evaluationSnapshot.outcome
                          ?.approvalRequired
                          ? locale === "en"
                            ? "Required"
                            : "需要"
                          : locale === "en"
                            ? "Not required"
                            : "不需要"
                      }
                    />
                  </div>

                  {selectedWarnings.length > 0 ? (
                    <div style={sectionStackStyle}>
                      <h3 style={sectionTitleStyle}>
                        {locale === "en" ? "Warnings" : "警示"}
                      </h3>
                      <div style={{ display: "grid", gap: "8px" }}>
                        {selectedWarnings.map((warning, index) => (
                          <div
                            key={`${warning.code}-${warning.ruleId ?? "none"}-${index}`}
                            style={metadataTileStyle}
                          >
                            <span style={metadataLabelStyle}>
                              {warning.ruleId ??
                                formatOpsCodeLabel(locale, warning.source)}
                            </span>
                            <span style={metadataValueStyle}>
                              {warning.message}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div style={sectionStackStyle}>
                    <h3 style={sectionTitleStyle}>
                      {locale === "en" ? "Matched rules" : "Matched rules"}
                    </h3>
                    {selectedRequest.evaluationSnapshot.matchedRules.length >
                    0 ? (
                      selectedRequest.evaluationSnapshot.matchedRules.map(
                        (rule) => renderMatchedRule(rule, locale),
                      )
                    ) : (
                      <p style={smallTextStyle}>
                        {locale === "en"
                          ? "No matched rules are present on this snapshot."
                          : "這份 snapshot 沒有 matched rule。"}
                      </p>
                    )}
                  </div>

                  <div style={sectionStackStyle}>
                    <h3 style={sectionTitleStyle}>
                      {locale === "en" ? "Quota impacts" : "Quota impacts"}
                    </h3>
                    <DataTable
                      density="compact"
                      tone="warning"
                      columns={[
                        {
                          label: locale === "en" ? "Scope" : "範圍",
                          width: "150px",
                        },
                        {
                          label: locale === "en" ? "Period" : "期間",
                          width: "130px",
                        },
                        {
                          label: locale === "en" ? "Dimension" : "維度",
                          width: "150px",
                        },
                        {
                          label: locale === "en" ? "Delta" : "變化",
                          width: "160px",
                        },
                        {
                          label: locale === "en" ? "Remaining" : "剩餘",
                          width: "140px",
                        },
                        {
                          label: locale === "en" ? "Trigger" : "觸發",
                          width: "120px",
                        },
                      ]}
                      empty={
                        locale === "en"
                          ? "No quota impacts were stored on this request."
                          : "這筆 request 沒有儲存 quota impact。"
                      }
                    >
                      {selectedQuotaImpacts.map((impact, index) =>
                        renderQuotaImpact(impact, index, locale),
                      )}
                    </DataTable>
                  </div>

                  <div style={sectionStackStyle}>
                    <h3 style={sectionTitleStyle}>
                      {locale === "en" ? "Input snapshot" : "Input snapshot"}
                    </h3>
                    <div style={metadataGridStyle}>
                      <div style={metadataTileStyle}>
                        <span style={metadataLabelStyle}>
                          {locale === "en" ? "Cost center" : "成本中心"}
                        </span>
                        <span style={metadataValueStyle}>
                          {selectedRequest.evaluationSnapshot.inputSnapshot
                            ?.costCenterCode ??
                            (locale === "en" ? "None" : "無")}
                        </span>
                      </div>
                      <div style={metadataTileStyle}>
                        <span style={metadataLabelStyle}>
                          {locale === "en" ? "Amount" : "金額"}
                        </span>
                        <span style={metadataValueStyle}>
                          {selectedRequest.evaluationSnapshot.inputSnapshot
                            ?.amountMinor !== null &&
                          selectedRequest.evaluationSnapshot.inputSnapshot
                            ?.amountMinor !== undefined
                            ? formatMinorCurrency(
                                selectedRequest.evaluationSnapshot.inputSnapshot
                                  .amountMinor,
                                selectedRequest.evaluationSnapshot.inputSnapshot
                                  .currency ?? "TWD",
                              )
                            : locale === "en"
                              ? "Unknown"
                              : "未知"}
                        </span>
                      </div>
                      <div style={metadataTileStyle}>
                        <span style={metadataLabelStyle}>
                          {locale === "en" ? "Passenger role" : "乘客角色"}
                        </span>
                        <span style={metadataValueStyle}>
                          {selectedRequest.evaluationSnapshot.inputSnapshot
                            ?.passengerRole
                            ? formatOpsCodeLabel(
                                locale,
                                selectedRequest.evaluationSnapshot.inputSnapshot
                                  .passengerRole,
                              )
                            : locale === "en"
                              ? "None"
                              : "無"}
                        </span>
                      </div>
                      <div style={metadataTileStyle}>
                        <span style={metadataLabelStyle}>
                          {locale === "en" ? "Reason codes" : "Reason codes"}
                        </span>
                        <span style={metadataValueStyle}>
                          {formatOpsCodeList(
                            locale,
                            selectedRequest.evaluationSnapshot.outcome
                              ?.reasonCodes ?? [],
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </DataViewCard>

              <DataViewCard
                title={locale === "en" ? "Tenant audit" : "租戶稽核"}
                subtitle={
                  locale === "en"
                    ? "Rows correlated by tenant + approval request references."
                    : "依 tenant 與 approval request reference 關聯出的 audit rows。"
                }
                tone="info"
                density="compact"
                summary={
                  locale === "en"
                    ? `${relevantAuditRecords.length} row(s) reference this request, booking, order, or evaluation id.`
                    : `${relevantAuditRecords.length} 筆 row 關聯到此 request、booking、order 或 evaluation id。`
                }
              >
                <div id="tenant-audit" style={sectionStackStyle}>
                  {auditError ? (
                    <CalloutBanner
                      tone="warning"
                      title={
                        locale === "en"
                          ? "Tenant audit could not be loaded"
                          : "無法載入 tenant audit"
                      }
                      description={auditError}
                    />
                  ) : null}
                  <DataTable
                    density="compact"
                    tone="info"
                    columns={[
                      {
                        label: locale === "en" ? "When" : "時間",
                        width: "150px",
                      },
                      {
                        label: locale === "en" ? "Action" : "動作",
                        width: "200px",
                      },
                      {
                        label: locale === "en" ? "Actor" : "執行者",
                        width: "180px",
                      },
                      { label: locale === "en" ? "Resource" : "資源" },
                    ]}
                    empty={
                      locale === "en"
                        ? "No tenant audit rows matched this request."
                        : "沒有 audit row 與這筆 request 相符。"
                    }
                  >
                    {relevantAuditRecords.map((record) => (
                      <Tr key={record.auditId}>
                        <Td density="compact">
                          {formatDateTime(record.createdAt, locale)}
                        </Td>
                        <Td density="compact">
                          <DataCellStack
                            primary={record.actionName}
                            secondary={record.moduleName}
                          />
                        </Td>
                        <Td density="compact">
                          <DataCellStack
                            primary={formatOpsCodeLabel(
                              locale,
                              record.actorType,
                            )}
                            secondary={
                              record.actorId ??
                              (locale === "en" ? "System" : "系統")
                            }
                          />
                        </Td>
                        <Td density="compact">
                          <DataCellStack
                            primary={record.resourceType}
                            secondary={
                              record.resourceId ??
                              (locale === "en"
                                ? "No resource id"
                                : "無 resource id")
                            }
                            tertiary={record.requestId}
                          />
                        </Td>
                      </Tr>
                    ))}
                  </DataTable>
                </div>
              </DataViewCard>

              <DataViewCard
                title={
                  locale === "en" ? "Raw evaluation snapshot" : "原始評估快照"
                }
                subtitle={
                  locale === "en"
                    ? "Full stored TenantApprovalEvaluationResult payload for ops readback."
                    : "提供完整儲存的 TenantApprovalEvaluationResult payload，供 ops 回讀。"
                }
                tone="neutral"
                density="compact"
              >
                <pre style={preStyle}>
                  {JSON.stringify(selectedRequest.evaluationSnapshot, null, 2)}
                </pre>
              </DataViewCard>
            </>
          ) : (
            <DataViewCard
              title={locale === "en" ? "Detail view" : "明細檢視"}
              subtitle={
                locale === "en"
                  ? "Select a request to inspect the snapshot and tenant audit."
                  : "請選擇一筆 request，查看 snapshot 與 tenant audit。"
              }
              tone="neutral"
              density="compact"
            >
              <p style={smallTextStyle}>
                {locale === "en"
                  ? "No approval request is currently selected."
                  : "目前沒有選中的 approval request。"}
              </p>
            </DataViewCard>
          )}
        </div>
      </div>
    </div>
  );
}
