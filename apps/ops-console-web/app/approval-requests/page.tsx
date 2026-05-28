import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { CSSProperties } from "react";
import type {
  AuditLogRecord,
  TenantBookingApprovalRequestRecord,
  TenantBookingQuotaImpactResult,
  TenantPrincipalRef,
} from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import {
  normalizeApprovalQueueStatusFilter,
  type ApprovalQueueStatusFilter,
} from "./filter-contract";
import {
  CalloutBanner,
  KpiCard,
  KpiRow,
  PageHeader,
  StatusChip,
} from "@drts/ui-web";

type ApprovalRequestsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const pageLayoutStyle: CSSProperties = {
  display: "grid",
  gap: "20px",
};

const splitGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.3fr) minmax(320px, 0.95fr)",
  gap: "16px",
  alignItems: "start",
};

const cardStyle: CSSProperties = {
  display: "grid",
  gap: "14px",
  padding: "18px",
  border: "1px solid #dbe2ea",
  borderRadius: "18px",
  background: "#ffffff",
};

const mutedCardStyle: CSSProperties = {
  ...cardStyle,
  background: "#f8fafc",
};

const sectionTitleStyle: CSSProperties = {
  fontSize: "15px",
  fontWeight: 700,
  color: "#0f172a",
};

const filtersStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "12px",
  alignItems: "end",
};

const fieldStyle: CSSProperties = {
  display: "grid",
  gap: "6px",
};

const inputStyle: CSSProperties = {
  border: "1px solid #cbd5e1",
  borderRadius: "10px",
  padding: "10px 12px",
  fontSize: "14px",
  background: "#ffffff",
};

const buttonRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "10px",
};

const primaryButtonStyle: CSSProperties = {
  border: "none",
  borderRadius: "999px",
  background: "#dc2626",
  color: "#ffffff",
  padding: "10px 14px",
  fontWeight: 700,
  cursor: "pointer",
  textDecoration: "none",
};

const secondaryButtonStyle: CSSProperties = {
  ...primaryButtonStyle,
  background: "#0f172a",
};

const subtleButtonStyle: CSSProperties = {
  ...primaryButtonStyle,
  background: "#e2e8f0",
  color: "#0f172a",
};

const listStyle: CSSProperties = {
  display: "grid",
  gap: "10px",
};

const requestCardStyle: CSSProperties = {
  display: "grid",
  gap: "10px",
  border: "1px solid #dbe2ea",
  borderRadius: "16px",
  padding: "14px",
  background: "#ffffff",
  textDecoration: "none",
};

const selectedRequestCardStyle: CSSProperties = {
  ...requestCardStyle,
  borderColor: "#dc2626",
  boxShadow: "0 0 0 1px rgba(220, 38, 38, 0.08)",
};

const metaGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "10px",
};

const metaItemStyle: CSSProperties = {
  display: "grid",
  gap: "4px",
};

const labelStyle: CSSProperties = {
  fontSize: "12px",
  fontWeight: 700,
  color: "#475569",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const valueStyle: CSSProperties = {
  fontSize: "14px",
  color: "#0f172a",
};

const listItemStyle: CSSProperties = {
  display: "grid",
  gap: "6px",
  padding: "12px 14px",
  borderRadius: "14px",
  border: "1px solid #e2e8f0",
  background: "#ffffff",
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function formatDateTime(value: string | null | undefined, locale: "en" | "zh") {
  if (!value) {
    return t("common.dash", locale);
  }

  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatRelativeDeadline(
  value: string,
  locale: "en" | "zh",
  now = Date.now(),
) {
  const diffMinutes = Math.round((new Date(value).getTime() - now) / 60000);
  if (diffMinutes >= 0) {
    return locale === "en"
      ? `${diffMinutes} min left`
      : `剩餘 ${diffMinutes} 分鐘`;
  }

  return locale === "en"
    ? `${Math.abs(diffMinutes)} min overdue`
    : `逾期 ${Math.abs(diffMinutes)} 分鐘`;
}

function isOpsBreachAcknowledgable(
  request: TenantBookingApprovalRequestRecord,
  now = Date.now(),
) {
  const timeoutTimestamp = new Date(request.timeoutAt).getTime();
  const isOutstanding = isOpsApprovalRequestOutstanding(request);

  return (
    isOutstanding &&
    Number.isFinite(timeoutTimestamp) &&
    timeoutTimestamp <= now &&
    request.opsSlaAcknowledgedAt === null
  );
}

function isOpsApprovalRequestOutstanding(
  request: TenantBookingApprovalRequestRecord,
) {
  return request.status === "pending" || request.status === "timeout_escalated";
}

function approvalStatusTone(
  status: TenantBookingApprovalRequestRecord["status"],
) {
  if (status === "pending") return "warning" as const;
  if (status === "approved") return "success" as const;
  if (status === "rejected") return "danger" as const;
  if (status === "timeout_escalated") return "danger" as const;
  return "neutral" as const;
}

function describePrincipal(principal: TenantPrincipalRef, locale: "en" | "zh") {
  if (principal.displayName?.trim()) {
    return principal.displayName;
  }
  if (principal.userId) {
    return principal.userId;
  }
  if (principal.roleCode) {
    return principal.roleCode;
  }
  if (principal.costCenterCode) {
    return principal.costCenterCode;
  }
  return locale === "en"
    ? principal.kind
    : formatOpsCodeLabel(locale, principal.kind);
}

function summarizeCondition(
  condition: TenantBookingApprovalRequestRecord["evaluationSnapshot"]["matchedRules"][number]["matchedConditions"][number],
) {
  const rawValue = Array.isArray(condition.value)
    ? condition.value.join(", ")
    : Array.isArray(condition.values)
      ? condition.values.join(", ")
      : typeof condition.value !== "undefined"
        ? String(condition.value)
        : typeof condition.values !== "undefined"
          ? String(condition.values)
          : "-";
  return `${condition.field} ${condition.op} ${rawValue}`;
}

function formatQuotaImpact(
  impact: TenantBookingQuotaImpactResult,
  locale: "en" | "zh",
) {
  const scope =
    impact.scope === "tenant"
      ? locale === "en"
        ? "Tenant"
        : "租戶"
      : locale === "en"
        ? `Cost center ${impact.costCenterCode ?? "-"}`
        : `成本中心 ${impact.costCenterCode ?? "-"}`;
  const remaining =
    impact.remainingAfter === null
      ? t("common.dash", locale)
      : `${impact.remainingAfter}`;
  return `${scope} · ${impact.dimension} · ${impact.triggered} · remain ${remaining}`;
}

function buildReturnQuery(formData: FormData) {
  const params = new URLSearchParams();
  for (const key of ["tenantId", "status", "expiresWindow", "selected"]) {
    const value = formData.get(key);
    if (typeof value === "string" && value.trim()) {
      params.set(key, value.trim());
    }
  }
  return params;
}

async function nudgeApprovalRequestAction(formData: FormData) {
  "use server";
  const approvalRequestId = String(
    formData.get("approvalRequestId") ?? "",
  ).trim();
  if (!approvalRequestId) {
    redirect("/approval-requests?flash=missing_request");
  }
  const client = await getServerOpsClient();
  try {
    await client.nudgeOpsApprovalRequest(approvalRequestId, {
      note: "ops_console_manual_nudge",
    });
  } catch (error) {
    const params = buildReturnQuery(formData);
    if (
      error instanceof Error &&
      error.message.includes("OPS_APPROVAL_REQUEST_NOT_OUTSTANDING")
    ) {
      params.set("flash", "nudge_unavailable");
      redirect(`/approval-requests?${params.toString()}`);
    }
    throw error;
  }
  revalidatePath("/approval-requests");
  const params = buildReturnQuery(formData);
  params.set("flash", "nudged");
  redirect(`/approval-requests?${params.toString()}`);
}

async function acknowledgeBreachAction(formData: FormData) {
  "use server";
  const approvalRequestId = String(
    formData.get("approvalRequestId") ?? "",
  ).trim();
  if (!approvalRequestId) {
    redirect("/approval-requests?flash=missing_request");
  }
  const client = await getServerOpsClient();
  try {
    await client.acknowledgeOpsBreach(approvalRequestId, {
      note: "ops_console_sla_acknowledged",
    });
  } catch (error) {
    const params = buildReturnQuery(formData);
    if (
      error instanceof Error &&
      (error.message.includes("APPROVAL_SLA_NOT_BREACHED") ||
        error.message.includes("APPROVAL_SLA_ALREADY_ACKNOWLEDGED"))
    ) {
      params.set("flash", "ack_unavailable");
      redirect(`/approval-requests?${params.toString()}`);
    }
    throw error;
  }
  revalidatePath("/approval-requests");
  const params = buildReturnQuery(formData);
  params.set("flash", "acknowledged");
  redirect(`/approval-requests?${params.toString()}`);
}

function FlashBanner({
  flash,
  locale,
}: {
  flash: string | undefined;
  locale: "en" | "zh";
}) {
  if (flash === "nudged") {
    return (
      <CalloutBanner
        tone="info"
        title={t("approvalRequests.flash.nudgedTitle", locale)}
        description={t("approvalRequests.flash.nudgedBody", locale)}
      />
    );
  }
  if (flash === "acknowledged") {
    return (
      <CalloutBanner
        tone="success"
        title={t("approvalRequests.flash.ackTitle", locale)}
        description={t("approvalRequests.flash.ackBody", locale)}
      />
    );
  }
  if (flash === "missing_request") {
    return (
      <CalloutBanner
        tone="danger"
        title={t("approvalRequests.flash.errorTitle", locale)}
        description={t("approvalRequests.flash.errorBody", locale)}
      />
    );
  }
  if (flash === "ack_unavailable") {
    return (
      <CalloutBanner
        tone="warning"
        title={t("approvalRequests.flash.ackUnavailableTitle", locale)}
        description={t("approvalRequests.flash.ackUnavailableBody", locale)}
      />
    );
  }
  if (flash === "nudge_unavailable") {
    return (
      <CalloutBanner
        tone="warning"
        title={t("approvalRequests.flash.nudgeUnavailableTitle", locale)}
        description={t("approvalRequests.flash.nudgeUnavailableBody", locale)}
      />
    );
  }
  return null;
}

export default async function ApprovalRequestsPage({
  searchParams,
}: ApprovalRequestsPageProps) {
  const resolvedSearchParams =
    (await searchParams) ??
    ({} as Record<string, string | string[] | undefined>);
  const [client, locale] = await Promise.all([
    getServerOpsClient(),
    getServerLocale(),
  ]);
  const tenantId = firstParam(resolvedSearchParams.tenantId) ?? "";
  const status: ApprovalQueueStatusFilter = normalizeApprovalQueueStatusFilter(
    firstParam(resolvedSearchParams.status),
  );
  const expiresWindow = firstParam(resolvedSearchParams.expiresWindow) ?? "4h";
  const selected = firstParam(resolvedSearchParams.selected);
  const flash = firstParam(resolvedSearchParams.flash);

  let requests: TenantBookingApprovalRequestRecord[] = [];
  let auditLogs: AuditLogRecord[] = [];
  let error: string | null = null;
  const expiresBefore =
    expiresWindow === "4h"
      ? new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString()
      : undefined;

  try {
    [requests, auditLogs] = await Promise.all([
      client.listOpsPendingApprovalRequests({
        ...(tenantId ? { tenantId } : {}),
        ...(status !== "outstanding"
          ? { status: status as TenantBookingApprovalRequestRecord["status"] }
          : {}),
        ...(expiresBefore ? { expiresBefore } : {}),
      }),
      client.listAuditLogs() as Promise<AuditLogRecord[]>,
    ]);
  } catch (cause) {
    error =
      cause instanceof Error ? cause.message : t("common.unknown", locale);
  }

  const now = Date.now();
  const selectedRequest =
    requests.find((request) => request.approvalRequestId === selected) ??
    requests[0] ??
    null;
  const tenantOptions = [
    ...new Set(requests.map((request) => request.tenantId)),
  ].sort();
  const breachedCount = requests.filter(
    (request) => new Date(request.timeoutAt).getTime() < now,
  ).length;
  const acknowledgedCount = requests.filter(
    (request) => request.opsSlaAcknowledgedAt !== null,
  ).length;
  const expiringSoonCount = requests.filter(
    (request) =>
      new Date(request.timeoutAt).getTime() - now <= 4 * 60 * 60 * 1000,
  ).length;
  const tenantAudit = selectedRequest
    ? auditLogs
        .filter((entry) => entry.tenantId === selectedRequest.tenantId)
        .slice(0, 12)
    : [];
  const canAcknowledgeSelectedRequest = selectedRequest
    ? isOpsBreachAcknowledgable(selectedRequest, now)
    : false;
  const canNudgeSelectedRequest = selectedRequest
    ? isOpsApprovalRequestOutstanding(selectedRequest)
    : false;

  return (
    <div style={pageLayoutStyle}>
      <PageHeader
        eyebrow={locale === "en" ? "Operations monitoring" : "營運監控"}
        title={t("approvalRequests.title", locale)}
        subtitle={t("approvalRequests.subtitle", locale)}
        meta={[
          {
            label: locale === "en" ? "Queue" : "待處理數",
            value: requests.length,
          },
          {
            label: locale === "en" ? "SLA breach" : "SLA 逾期",
            value: breachedCount,
            tone: breachedCount > 0 ? "danger" : "success",
          },
          {
            label: locale === "en" ? "Acknowledged" : "已確認",
            value: acknowledgedCount,
            tone: acknowledgedCount > 0 ? "info" : "neutral",
          },
        ]}
      />

      <FlashBanner flash={flash} locale={locale} />

      {error ? (
        <CalloutBanner
          tone="danger"
          title={t("approvalRequests.title", locale)}
          description={error}
        />
      ) : null}

      <KpiRow minWidth="180px">
        <KpiCard
          label={t("approvalRequests.kpi.pending", locale)}
          value={requests.length}
          detail={t("approvalRequests.kpi.pendingSub", locale)}
          tone={requests.length > 0 ? "warning" : "success"}
        />
        <KpiCard
          label={t("approvalRequests.kpi.expiringSoon", locale)}
          value={expiringSoonCount}
          detail={t("approvalRequests.kpi.expiringSoonSub", locale)}
          tone={expiringSoonCount > 0 ? "warning" : "neutral"}
        />
        <KpiCard
          label={t("approvalRequests.kpi.breached", locale)}
          value={breachedCount}
          detail={t("approvalRequests.kpi.breachedSub", locale)}
          tone={breachedCount > 0 ? "danger" : "success"}
        />
        <KpiCard
          label={t("approvalRequests.kpi.acknowledged", locale)}
          value={acknowledgedCount}
          detail={t("approvalRequests.kpi.acknowledgedSub", locale)}
          tone={acknowledgedCount > 0 ? "info" : "neutral"}
        />
      </KpiRow>

      <section style={cardStyle}>
        <div style={sectionTitleStyle}>
          {t("approvalRequests.filters.title", locale)}
        </div>
        <form method="get" style={filtersStyle}>
          <label style={fieldStyle}>
            <span style={labelStyle}>
              {t("approvalRequests.filters.tenant", locale)}
            </span>
            <input
              type="text"
              name="tenantId"
              defaultValue={tenantId}
              list="approval-request-tenant-options"
              placeholder={t(
                "approvalRequests.filters.tenantPlaceholder",
                locale,
              )}
              style={inputStyle}
            />
          </label>
          <label style={fieldStyle}>
            <span style={labelStyle}>{t("common.status", locale)}</span>
            <select name="status" defaultValue={status} style={inputStyle}>
              <option value="outstanding">
                {t("approvalRequests.filters.statusOutstanding", locale)}
              </option>
              <option value="pending">
                {t("approvalRequests.status.pending", locale)}
              </option>
              <option value="timeout_escalated">
                {t("approvalRequests.status.timeout_escalated", locale)}
              </option>
            </select>
          </label>
          <label style={fieldStyle}>
            <span style={labelStyle}>
              {t("approvalRequests.filters.expires", locale)}
            </span>
            <select
              name="expiresWindow"
              defaultValue={expiresWindow}
              style={inputStyle}
            >
              <option value="4h">
                {t("approvalRequests.filters.expires4h", locale)}
              </option>
              <option value="all">
                {t("approvalRequests.filters.expiresAll", locale)}
              </option>
            </select>
          </label>
          <div style={fieldStyle}>
            <button type="submit" style={primaryButtonStyle}>
              {t("approvalRequests.filters.apply", locale)}
            </button>
          </div>
          <datalist id="approval-request-tenant-options">
            {tenantOptions.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </form>
      </section>

      <div style={splitGridStyle}>
        <section style={cardStyle}>
          <div style={sectionTitleStyle}>
            {t("approvalRequests.queue.title", locale)}
          </div>
          {requests.length === 0 ? (
            <div style={valueStyle}>
              {t("approvalRequests.queue.empty", locale)}
            </div>
          ) : (
            <div style={listStyle}>
              {requests.map((request) => {
                const isSelected =
                  selectedRequest?.approvalRequestId ===
                  request.approvalRequestId;
                const params = new URLSearchParams();
                if (tenantId) params.set("tenantId", tenantId);
                if (status) params.set("status", status);
                if (expiresWindow) params.set("expiresWindow", expiresWindow);
                params.set("selected", request.approvalRequestId);
                return (
                  <Link
                    key={request.approvalRequestId}
                    href={`/approval-requests?${params.toString()}`}
                    style={
                      isSelected ? selectedRequestCardStyle : requestCardStyle
                    }
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "12px",
                      }}
                    >
                      <div style={{ display: "grid", gap: "6px" }}>
                        <strong style={{ color: "#0f172a" }}>
                          {request.bookingId}
                        </strong>
                        <span style={{ color: "#475569", fontSize: "13px" }}>
                          {request.tenantId} · {request.orderId}
                        </span>
                      </div>
                      <StatusChip
                        tone={approvalStatusTone(request.status)}
                        label={t(
                          `approvalRequests.status.${request.status}`,
                          locale,
                        )}
                      />
                    </div>
                    <div style={metaGridStyle}>
                      <div style={metaItemStyle}>
                        <span style={labelStyle}>
                          {t("approvalRequests.queue.deadline", locale)}
                        </span>
                        <span style={valueStyle}>
                          {formatDateTime(request.timeoutAt, locale)} UTC
                        </span>
                      </div>
                      <div style={metaItemStyle}>
                        <span style={labelStyle}>
                          {t("approvalRequests.queue.sla", locale)}
                        </span>
                        <span style={valueStyle}>
                          {formatRelativeDeadline(
                            request.timeoutAt,
                            locale,
                            now,
                          )}
                        </span>
                      </div>
                      <div style={metaItemStyle}>
                        <span style={labelStyle}>
                          {t("approvalRequests.queue.approvers", locale)}
                        </span>
                        <span style={valueStyle}>
                          {request.resolvedApproverUserIds.join(", ") ||
                            t("common.dash", locale)}
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <section style={mutedCardStyle}>
          <div style={sectionTitleStyle}>
            {t("approvalRequests.detail.title", locale)}
          </div>
          {!selectedRequest ? (
            <div style={valueStyle}>
              {t("approvalRequests.detail.empty", locale)}
            </div>
          ) : (
            <>
              <div style={metaGridStyle}>
                <div style={metaItemStyle}>
                  <span style={labelStyle}>
                    {t("approvalRequests.detail.tenant", locale)}
                  </span>
                  <span style={valueStyle}>{selectedRequest.tenantId}</span>
                </div>
                <div style={metaItemStyle}>
                  <span style={labelStyle}>
                    {t("approvalRequests.detail.booking", locale)}
                  </span>
                  <span style={valueStyle}>{selectedRequest.bookingId}</span>
                </div>
                <div style={metaItemStyle}>
                  <span style={labelStyle}>
                    {t("approvalRequests.detail.order", locale)}
                  </span>
                  <span style={valueStyle}>{selectedRequest.orderId}</span>
                </div>
                <div style={metaItemStyle}>
                  <span style={labelStyle}>
                    {t("approvalRequests.detail.timeout", locale)}
                  </span>
                  <span style={valueStyle}>
                    {formatDateTime(selectedRequest.timeoutAt, locale)} UTC
                  </span>
                </div>
              </div>

              <div style={buttonRowStyle}>
                <Link href="#tenant-audit" style={subtleButtonStyle}>
                  {t("approvalRequests.actions.viewAudit", locale)}
                </Link>
                {canNudgeSelectedRequest ? (
                  <form action={nudgeApprovalRequestAction}>
                    <input
                      type="hidden"
                      name="approvalRequestId"
                      value={selectedRequest.approvalRequestId}
                    />
                    <input type="hidden" name="tenantId" value={tenantId} />
                    <input type="hidden" name="status" value={status} />
                    <input
                      type="hidden"
                      name="expiresWindow"
                      value={expiresWindow}
                    />
                    <input
                      type="hidden"
                      name="selected"
                      value={selectedRequest.approvalRequestId}
                    />
                    <button type="submit" style={secondaryButtonStyle}>
                      {t("approvalRequests.actions.nudge", locale)}
                    </button>
                  </form>
                ) : (
                  <span style={valueStyle}>
                    {t(
                      "approvalRequests.actions.nudgeUnavailableState",
                      locale,
                    )}
                  </span>
                )}
                {canAcknowledgeSelectedRequest ? (
                  <form action={acknowledgeBreachAction}>
                    <input
                      type="hidden"
                      name="approvalRequestId"
                      value={selectedRequest.approvalRequestId}
                    />
                    <input type="hidden" name="tenantId" value={tenantId} />
                    <input type="hidden" name="status" value={status} />
                    <input
                      type="hidden"
                      name="expiresWindow"
                      value={expiresWindow}
                    />
                    <input
                      type="hidden"
                      name="selected"
                      value={selectedRequest.approvalRequestId}
                    />
                    <button type="submit" style={primaryButtonStyle}>
                      {t("approvalRequests.actions.acknowledge", locale)}
                    </button>
                  </form>
                ) : (
                  <span style={valueStyle}>
                    {selectedRequest.opsSlaAcknowledgedAt
                      ? t("approvalRequests.actions.acknowledgedState", locale)
                      : t("approvalRequests.actions.awaitingBreach", locale)}
                  </span>
                )}
              </div>

              <div style={metaGridStyle}>
                <div style={metaItemStyle}>
                  <span style={labelStyle}>
                    {t("approvalRequests.detail.lastNudged", locale)}
                  </span>
                  <span style={valueStyle}>
                    {selectedRequest.opsLastNudgedAt
                      ? `${formatDateTime(selectedRequest.opsLastNudgedAt, locale)} UTC`
                      : t("common.dash", locale)}
                  </span>
                </div>
                <div style={metaItemStyle}>
                  <span style={labelStyle}>
                    {t("approvalRequests.detail.breachAcknowledged", locale)}
                  </span>
                  <span style={valueStyle}>
                    {selectedRequest.opsSlaAcknowledgedAt
                      ? `${formatDateTime(selectedRequest.opsSlaAcknowledgedAt, locale)} UTC`
                      : t("common.dash", locale)}
                  </span>
                </div>
              </div>

              <div style={cardStyle}>
                <div style={sectionTitleStyle}>
                  {t("approvalRequests.snapshot.outcome", locale)}
                </div>
                <div style={metaGridStyle}>
                  <div style={metaItemStyle}>
                    <span style={labelStyle}>
                      {t("approvalRequests.snapshot.decision", locale)}
                    </span>
                    <span style={valueStyle}>
                      {selectedRequest.evaluationSnapshot.outcome?.decision ??
                        t("common.dash", locale)}
                    </span>
                  </div>
                  <div style={metaItemStyle}>
                    <span style={labelStyle}>
                      {t("approvalRequests.snapshot.reasonCodes", locale)}
                    </span>
                    <span style={valueStyle}>
                      {selectedRequest.evaluationSnapshot.outcome?.reasonCodes.join(
                        ", ",
                      ) || t("common.dash", locale)}
                    </span>
                  </div>
                </div>
              </div>

              <div style={cardStyle}>
                <div style={sectionTitleStyle}>
                  {t("approvalRequests.snapshot.rules", locale)}
                </div>
                <div style={listStyle}>
                  {selectedRequest.evaluationSnapshot.matchedRules.map(
                    (rule) => (
                      <div key={rule.ruleId} style={listItemStyle}>
                        <strong>{rule.ruleName}</strong>
                        <span style={{ color: "#475569", fontSize: "13px" }}>
                          {rule.ruleId} · {rule.action} ·{" "}
                          {rule.approvalMode ?? "-"}
                        </span>
                        <span style={valueStyle}>
                          {rule.approvers
                            .map((approver) =>
                              describePrincipal(approver, locale),
                            )
                            .join(", ") || t("common.dash", locale)}
                        </span>
                        <span style={{ color: "#475569", fontSize: "13px" }}>
                          {rule.matchedConditions
                            .map((condition) => summarizeCondition(condition))
                            .join(" · ")}
                        </span>
                      </div>
                    ),
                  )}
                </div>
              </div>

              <div style={cardStyle}>
                <div style={sectionTitleStyle}>
                  {t("approvalRequests.snapshot.quota", locale)}
                </div>
                {selectedRequest.evaluationSnapshot.quotaImpacts?.length ? (
                  <div style={listStyle}>
                    {selectedRequest.evaluationSnapshot.quotaImpacts.map(
                      (impact) => (
                        <div
                          key={`${impact.scope}:${impact.costCenterCode ?? "tenant"}:${impact.dimension}:${impact.periodKey}`}
                          style={listItemStyle}
                        >
                          <strong>{impact.periodKey}</strong>
                          <span style={valueStyle}>
                            {formatQuotaImpact(impact, locale)}
                          </span>
                        </div>
                      ),
                    )}
                  </div>
                ) : (
                  <div style={valueStyle}>
                    {t("approvalRequests.snapshot.noQuota", locale)}
                  </div>
                )}
              </div>

              <div id="tenant-audit" style={cardStyle}>
                <div style={sectionTitleStyle}>
                  {t("approvalRequests.audit.title", locale)}
                </div>
                {tenantAudit.length === 0 ? (
                  <div style={valueStyle}>
                    {t("approvalRequests.audit.empty", locale)}
                  </div>
                ) : (
                  <div style={listStyle}>
                    {tenantAudit.map((entry) => (
                      <div key={entry.auditId} style={listItemStyle}>
                        <strong>{entry.actionName}</strong>
                        <span style={{ color: "#475569", fontSize: "13px" }}>
                          {entry.resourceType} ·{" "}
                          {entry.resourceId ?? t("common.dash", locale)}
                        </span>
                        <span style={valueStyle}>
                          {formatDateTime(entry.createdAt, locale)} UTC ·{" "}
                          {entry.actorId ?? entry.actorType}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
