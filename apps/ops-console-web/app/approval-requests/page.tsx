"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@drts/ui-web";
import type {
  OpsPendingApprovalRequestRecord,
  TenantBookingApprovalRequestStatus,
} from "@drts/contracts";
import { TENANT_BOOKING_APPROVAL_REQUEST_STATUSES } from "@drts/contracts";
import { getOpsClient } from "@/lib/api-client";
import { useTranslation } from "@/lib/i18n";

const STATUS_OPTIONS = [...TENANT_BOOKING_APPROVAL_REQUEST_STATUSES];

const DATE_FMT = new Intl.DateTimeFormat("zh-Hant", {
  dateStyle: "short",
  timeStyle: "short",
});

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return DATE_FMT.format(parsed);
}

function getStatusToneClass(
  status: TenantBookingApprovalRequestStatus,
): string {
  switch (status) {
    case "pending":
      return "admin-badge--warning";
    case "approved":
      return "admin-badge--success";
    case "rejected":
      return "admin-badge--danger";
    case "timeout_escalated":
      return "admin-badge--danger";
    case "cancelled_by_re_evaluation":
      return "admin-badge--neutral";
    default:
      return "admin-badge--neutral";
  }
}

export default function ApprovalRequestsPage() {
  const { t, locale } = useTranslation();
  const client = getOpsClient();
  const [items, setItems] = useState<OpsPendingApprovalRequestRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState<
    TenantBookingApprovalRequestStatus | "all"
  >("pending");
  const [tenantFilter, setTenantFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const query: {
      status?: TenantBookingApprovalRequestStatus;
      tenantId?: string;
    } = {};
    if (statusFilter !== "all") {
      query.status = statusFilter;
    }
    if (tenantFilter.trim()) {
      query.tenantId = tenantFilter.trim();
    }
    client
      .listOpsPendingApprovalRequests(query)
      .then((rows) => {
        if (cancelled) return;
        setItems(rows);
        setLastRefreshedAt(new Date().toISOString());
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, statusFilter, tenantFilter]);

  const breachCount = useMemo(
    () => items.filter((row) => row.slaBreached).length,
    [items],
  );

  return (
    <div>
      <PageHeader
        title={t("nav.approvalRequests")}
        subtitle={
          locale === "en"
            ? `Booking approval queue across tenants — ${items.length} items${
                breachCount > 0 ? ` · ${breachCount} SLA breached` : ""
              }`
            : `跨租戶的訂單審批佇列 — ${items.length} 件${
                breachCount > 0 ? ` · ${breachCount} 件 SLA 逾時` : ""
              }`
        }
      />

      <div className="admin-toolbar">
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ fontSize: 12 }}>
            {locale === "en" ? "Status" : "狀態"}
            <select
              className="admin-select"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(
                  event.target.value as
                    | TenantBookingApprovalRequestStatus
                    | "all",
                )
              }
              style={{ marginLeft: 6 }}
            >
              <option value="all">{locale === "en" ? "All" : "全部"}</option>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 12 }}>
            {locale === "en" ? "Tenant" : "租戶"}
            <input
              className="admin-input"
              value={tenantFilter}
              placeholder="tenant-id"
              onChange={(event) => setTenantFilter(event.target.value)}
              style={{ marginLeft: 6 }}
            />
          </label>
        </div>
        <div style={{ marginLeft: "auto", fontSize: 11, opacity: 0.7 }}>
          {lastRefreshedAt
            ? `${locale === "en" ? "Last refreshed" : "最後更新"} ${formatDateTime(lastRefreshedAt)}`
            : ""}
        </div>
      </div>

      {error ? (
        <div
          className="admin-card"
          style={{ borderColor: "rgba(239,68,68,0.3)" }}
        >
          <p style={{ color: "#dc2626", margin: 0 }}>
            {locale === "en" ? "Error" : "錯誤"}: {error}
          </p>
        </div>
      ) : null}

      <div className="admin-card admin-table-wrap">
        {loading ? (
          <div className="admin-empty">
            {locale === "en" ? "Loading…" : "載入中…"}
          </div>
        ) : items.length === 0 ? (
          <div className="admin-empty">
            {locale === "en"
              ? "No pending approval requests in this scope."
              : "目前範圍內沒有待審批項目。"}
          </div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>{locale === "en" ? "Approval" : "審批"}</th>
                <th>{locale === "en" ? "Tenant" : "租戶"}</th>
                <th>{locale === "en" ? "Booking" : "訂單"}</th>
                <th>{locale === "en" ? "Status" : "狀態"}</th>
                <th>{locale === "en" ? "Timeout" : "逾時"}</th>
                <th>{locale === "en" ? "SLA" : "SLA"}</th>
                <th>{locale === "en" ? "Created" : "建立"}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.approvalRequestId}>
                  <td>
                    <code style={{ fontSize: 11 }}>
                      {row.approvalRequestId.slice(0, 12)}…
                    </code>
                  </td>
                  <td>{row.tenantId}</td>
                  <td>
                    <Link
                      href={`/dispatch?bookingId=${row.bookingId}`}
                      className="admin-link"
                    >
                      <code style={{ fontSize: 11 }}>
                        {row.bookingId.slice(0, 12)}…
                      </code>
                    </Link>
                  </td>
                  <td>
                    <span
                      className={`admin-badge ${getStatusToneClass(row.status)}`}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td>{formatDateTime(row.timeoutAt)}</td>
                  <td>
                    {row.slaBreached ? (
                      <span className="admin-badge admin-badge--danger">
                        {locale === "en" ? "Breached" : "逾時"}
                      </span>
                    ) : (
                      <span className="admin-badge admin-badge--success">
                        {locale === "en" ? "On track" : "正常"}
                      </span>
                    )}
                  </td>
                  <td>{formatDateTime(row.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
