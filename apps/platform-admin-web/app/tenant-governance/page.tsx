"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";
import {
  tenantStageTone,
  tenantStatusTone,
} from "@/components/tenant-governance-shared";
import type {
  PlatformTenantGovernanceAlertFlag,
  PlatformTenantGovernanceSummaryResponse,
} from "@drts/contracts";
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
  WorkflowPanel,
} from "@drts/ui-web";

const PAGE_SIZE = 12;

const detailMetricsStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
} satisfies React.CSSProperties;

const detailMetricCardStyle = {
  display: "grid",
  gap: 4,
  padding: "14px 16px",
  borderRadius: 16,
  border: "1px solid #dbe4ee",
  background: "#f8fafc",
} satisfies React.CSSProperties;

const detailLinksStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 10,
} satisfies React.CSSProperties;

const pagerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
  marginTop: 12,
  color: "#64748b",
  fontSize: 12.5,
} satisfies React.CSSProperties;

function alertTone(flag: PlatformTenantGovernanceAlertFlag) {
  switch (flag) {
    case "quota_above_95_percent":
      return "warning" as const;
    case "no_approvers_configured":
    case "pending_approval_over_48h":
    default:
      return "danger" as const;
  }
}

function alertLabel(
  locale: string,
  flag: PlatformTenantGovernanceAlertFlag,
): string {
  if (locale === "en") {
    switch (flag) {
      case "no_approvers_configured":
        return "No approvers configured";
      case "quota_above_95_percent":
        return "Quota above 95%";
      case "pending_approval_over_48h":
      default:
        return "Pending approval over 48h";
    }
  }

  switch (flag) {
    case "no_approvers_configured":
      return "尚未配置 approver";
    case "quota_above_95_percent":
      return "Quota 超過 95%";
    case "pending_approval_over_48h":
    default:
      return "待審超過 48 小時";
  }
}

function formatPercent(value: number) {
  return `${value.toLocaleString(undefined, {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
    maximumFractionDigits: 1,
  })}%`;
}

function formatAge(locale: string, value: number | null) {
  if (value === null) {
    return locale === "en" ? "No pending approvals" : "目前沒有待審";
  }
  return locale === "en" ? `${value} h` : `${value} 小時`;
}

function detailLinkHref(tenantId: string, anchor?: string) {
  return anchor ? `/tenants/${tenantId}#${anchor}` : `/tenants/${tenantId}`;
}

export default function TenantGovernancePage() {
  const { locale } = useTranslation();
  const client = usePlatformAdminClient();
  const [summary, setSummary] =
    useState<PlatformTenantGovernanceSummaryResponse | null>(null);
  const [page, setPage] = useState(1);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const copy =
    locale === "en"
      ? {
          title: "Tenant Governance",
          subtitle:
            "Monitor cost-center coverage, active rule posture, monthly quota burn, and approval backlog across every tenant in one platform-owned lane.",
          refresh: "Refresh",
          tableTitle: "Cross-tenant rollup",
          tableSubtitle:
            "This summary keeps quota pressure, approval backlog, and approver readiness visible before operators drill into a tenant detail route.",
          detailTitle: "Governance detail",
          detailSubtitle:
            "Open the current executable governance surfaces for the selected tenant.",
          noRows: "No tenant governance rows are available yet.",
          select: "Focus detail",
          openTenant: "Open tenant detail",
          openOnboarding: "Onboarding package",
          openRoles: "Roles and acknowledgements",
          openAudit: "Audit surface",
          detailNote:
            "The production tenant-admin portal lives outside this repo, so these links target the platform-governed tenant surfaces that currently exist here.",
          pageStatus: (current: number, total: number, items: number) =>
            `Page ${current} of ${total || 1} · ${items} row(s) on this page`,
          previous: "Previous",
          next: "Next",
          summary: (current: number, total: number, all: number) =>
            `${all} total tenant(s) across ${total || 1} page(s). Currently viewing page ${current}.`,
          columns: {
            tenant: "Tenant",
            posture: "Posture",
            costCenters: "Cost centers",
            activeRules: "Active rules",
            quotaUsed: "Quota used",
            approvals: "Pending approvals",
            alerts: "Alerts",
            actions: "Actions",
          },
          kpis: {
            pageTenants: "Tenants on page",
            flagged: "Flagged tenants",
            approvals: "Pending approvals",
            avgQuota: "Avg quota used",
          },
          healthy: "Healthy",
          oldestPending: "Oldest pending",
          stage: "Stage",
          status: "Status",
        }
      : {
          title: "租戶治理總覽",
          subtitle:
            "在同一個平台治理工作面監看各 tenant 的 cost center 覆蓋、active rule 姿態、月度 quota 燃燒率與 approval backlog。",
          refresh: "重新整理",
          tableTitle: "跨租戶彙總",
          tableSubtitle:
            "在治理人進入單一 tenant detail 之前，先把 quota 壓力、approval backlog 與 approver readiness 放在同一張總覽表。",
          detailTitle: "治理詳情",
          detailSubtitle: "開啟目前在此 repo 內可執行的 tenant 治理工作面。",
          noRows: "目前沒有 tenant governance 資料。",
          select: "聚焦詳情",
          openTenant: "租戶詳情",
          openOnboarding: "Onboarding package",
          openRoles: "角色與確認",
          openAudit: "Audit 面",
          detailNote:
            "正式 tenant-admin portal 已移到 repo 外部，因此這裡提供的是目前在本 repo 內存在的 platform-governed tenant surfaces。",
          pageStatus: (current: number, total: number, items: number) =>
            `第 ${current} / ${total || 1} 頁 · 本頁 ${items} 筆`,
          previous: "上一頁",
          next: "下一頁",
          summary: (current: number, total: number, all: number) =>
            `總計 ${all} 個 tenant，分成 ${total || 1} 頁；目前查看第 ${current} 頁。`,
          columns: {
            tenant: "租戶",
            posture: "姿態",
            costCenters: "Cost centers",
            activeRules: "Active rules",
            quotaUsed: "Quota 使用率",
            approvals: "待審批數",
            alerts: "警示",
            actions: "操作",
          },
          kpis: {
            pageTenants: "本頁租戶數",
            flagged: "本頁警示租戶",
            approvals: "待審批總數",
            avgQuota: "平均 quota 使用率",
          },
          healthy: "健康",
          oldestPending: "最舊待審",
          stage: "階段",
          status: "狀態",
        };

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.getPlatformTenantGovernanceSummary({
        page,
        pageSize: PAGE_SIZE,
      });
      setSummary(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [client, page]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    if (!summary?.items.length) {
      setSelectedTenantId(null);
      return;
    }

    if (
      !selectedTenantId ||
      !summary.items.some((item) => item.tenantId === selectedTenantId)
    ) {
      setSelectedTenantId(summary.items[0]!.tenantId);
    }
  }, [selectedTenantId, summary]);

  const items = summary?.items ?? [];
  const pageInfo = summary?.pageInfo ?? {
    page,
    pageSize: PAGE_SIZE,
    totalItems: 0,
    totalPages: 0,
  };
  const selectedTenant =
    items.find((item) => item.tenantId === selectedTenantId) ?? null;

  const metrics = useMemo(() => {
    const flagged = items.filter((item) => item.alertFlags.length > 0).length;
    const pendingApprovals = items.reduce(
      (sum, item) => sum + item.pendingApprovalCount,
      0,
    );
    const averageQuotaUsed =
      items.length > 0
        ? Math.round(
            (items.reduce(
              (sum, item) => sum + item.monthlyQuotaPercentUsed,
              0,
            ) /
              items.length) *
              10,
          ) / 10
        : 0;

    return {
      flagged,
      pendingApprovals,
      averageQuotaUsed,
    };
  }, [items]);

  if (loading && !summary) {
    return <div className="admin-empty">{copy.tableTitle}...</div>;
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <PageHeader
        eyebrow={locale === "en" ? "Platform Admin" : "平台治理"}
        title={copy.title}
        subtitle={copy.subtitle}
        actions={
          <button
            type="button"
            className="admin-btn admin-btn--secondary"
            disabled={loading}
            onClick={() => void loadSummary()}
          >
            {copy.refresh}
          </button>
        }
      />

      {error ? (
        <CalloutBanner
          tone="danger"
          title={
            locale === "en"
              ? "Unable to load tenant governance summary"
              : "無法載入租戶治理彙總"
          }
          description={error}
        />
      ) : null}

      <KpiRow minWidth="220px">
        <KpiCard
          label={copy.kpis.pageTenants}
          value={items.length}
          detail={copy.pageStatus(
            pageInfo.page,
            pageInfo.totalPages,
            items.length,
          )}
          tone="platform"
        />
        <KpiCard
          label={copy.kpis.flagged}
          value={metrics.flagged}
          detail={
            locale === "en"
              ? "Rows carrying at least one governance warning"
              : "至少帶有一個治理警示的租戶"
          }
          tone={metrics.flagged > 0 ? "warning" : "success"}
        />
        <KpiCard
          label={copy.kpis.approvals}
          value={metrics.pendingApprovals}
          detail={
            locale === "en"
              ? "Pending requests on the current page"
              : "本頁待審核 request 總數"
          }
          tone={metrics.pendingApprovals > 0 ? "warning" : "neutral"}
        />
        <KpiCard
          label={copy.kpis.avgQuota}
          value={formatPercent(metrics.averageQuotaUsed)}
          detail={
            locale === "en"
              ? "Average monthly quota burn on the current page"
              : "本頁月度 quota 平均燃燒率"
          }
          tone={
            metrics.averageQuotaUsed > 95
              ? "danger"
              : metrics.averageQuotaUsed > 75
                ? "warning"
                : "info"
          }
        />
      </KpiRow>

      <DataViewCard
        title={copy.tableTitle}
        subtitle={copy.tableSubtitle}
        tone="platform"
        summary={copy.summary(
          pageInfo.page,
          pageInfo.totalPages,
          pageInfo.totalItems,
        )}
      >
        <DataTable
          columns={[
            { label: copy.columns.tenant, width: "240px" },
            { label: copy.columns.posture, width: "170px" },
            { label: copy.columns.costCenters, width: "120px" },
            { label: copy.columns.activeRules, width: "120px" },
            { label: copy.columns.quotaUsed, width: "160px" },
            { label: copy.columns.approvals, width: "160px" },
            { label: copy.columns.alerts, width: "220px" },
            { label: copy.columns.actions, width: "220px" },
          ]}
          empty={copy.noRows}
        >
          {items.map((item) => (
            <Tr key={item.tenantId} highlighted={item.alertFlags.length > 0}>
              <Td>
                <DataCellStack
                  primary={<strong>{item.tenantName}</strong>}
                  secondary={`${item.tenantCode} · ${item.tenantId}`}
                  tertiary={
                    <Link
                      href={detailLinkHref(item.tenantId)}
                      className="admin-btn admin-btn--secondary admin-btn--sm"
                    >
                      {copy.openTenant}
                    </Link>
                  }
                />
              </Td>
              <Td>
                <div style={{ display: "grid", gap: 8 }}>
                  <StatusChip
                    label={`${copy.stage}: ${formatPlatformCodeLabel(locale, item.tenantRolloutStage)}`}
                    tone={tenantStageTone(item.tenantRolloutStage)}
                  />
                  <StatusChip
                    label={`${copy.status}: ${formatPlatformCodeLabel(locale, item.tenantStatus)}`}
                    tone={tenantStatusTone(item.tenantStatus)}
                  />
                </div>
              </Td>
              <Td>{item.costCenterCount}</Td>
              <Td>{item.activeRuleCount}</Td>
              <Td>
                <DataCellStack
                  primary={formatPercent(item.monthlyQuotaPercentUsed)}
                  secondary={
                    item.monthlyQuotaPercentUsed > 95
                      ? locale === "en"
                        ? "Threshold breached"
                        : "已超過警戒線"
                      : locale === "en"
                        ? "Within watch range"
                        : "仍在可接受範圍"
                  }
                />
              </Td>
              <Td>
                <DataCellStack
                  primary={item.pendingApprovalCount}
                  secondary={`${copy.oldestPending}: ${formatAge(
                    locale,
                    item.oldestPendingApprovalAgeHours,
                  )}`}
                />
              </Td>
              <Td>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {item.alertFlags.length > 0 ? (
                    item.alertFlags.map((flag) => (
                      <StatusChip
                        key={`${item.tenantId}-${flag}`}
                        label={alertLabel(locale, flag)}
                        tone={alertTone(flag)}
                      />
                    ))
                  ) : (
                    <StatusChip label={copy.healthy} tone="success" />
                  )}
                </div>
              </Td>
              <Td>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="admin-btn admin-btn--secondary admin-btn--sm"
                    onClick={() => setSelectedTenantId(item.tenantId)}
                  >
                    {copy.select}
                  </button>
                  <Link
                    href={detailLinkHref(item.tenantId)}
                    className="admin-btn admin-btn--secondary admin-btn--sm"
                  >
                    {copy.openTenant}
                  </Link>
                </div>
              </Td>
            </Tr>
          ))}
        </DataTable>

        <div style={pagerStyle}>
          <span>
            {copy.pageStatus(pageInfo.page, pageInfo.totalPages, items.length)}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="admin-btn admin-btn--secondary admin-btn--sm"
              disabled={loading || pageInfo.page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              {copy.previous}
            </button>
            <button
              type="button"
              className="admin-btn admin-btn--secondary admin-btn--sm"
              disabled={
                loading ||
                pageInfo.totalPages === 0 ||
                pageInfo.page >= pageInfo.totalPages
              }
              onClick={() => setPage((current) => current + 1)}
            >
              {copy.next}
            </button>
          </div>
        </div>
      </DataViewCard>

      {selectedTenant ? (
        <WorkflowPanel
          title={`${copy.detailTitle} · ${selectedTenant.tenantName}`}
          description={copy.detailSubtitle}
          tone="platform"
        >
          {selectedTenant.alertFlags.length > 0 ? (
            <CalloutBanner
              tone="warning"
              title={
                locale === "en"
                  ? "This tenant needs governance attention"
                  : "此 tenant 需要治理關注"
              }
              description={selectedTenant.alertFlags
                .map((flag) => alertLabel(locale, flag))
                .join(" · ")}
            />
          ) : null}

          <div style={detailMetricsStyle}>
            <div style={detailMetricCardStyle}>
              <span style={{ color: "#64748b", fontSize: 12 }}>
                {copy.columns.costCenters}
              </span>
              <strong style={{ fontSize: 22 }}>
                {selectedTenant.costCenterCount}
              </strong>
            </div>
            <div style={detailMetricCardStyle}>
              <span style={{ color: "#64748b", fontSize: 12 }}>
                {copy.columns.activeRules}
              </span>
              <strong style={{ fontSize: 22 }}>
                {selectedTenant.activeRuleCount}
              </strong>
            </div>
            <div style={detailMetricCardStyle}>
              <span style={{ color: "#64748b", fontSize: 12 }}>
                {copy.columns.quotaUsed}
              </span>
              <strong style={{ fontSize: 22 }}>
                {formatPercent(selectedTenant.monthlyQuotaPercentUsed)}
              </strong>
            </div>
            <div style={detailMetricCardStyle}>
              <span style={{ color: "#64748b", fontSize: 12 }}>
                {copy.columns.approvals}
              </span>
              <strong style={{ fontSize: 22 }}>
                {selectedTenant.pendingApprovalCount}
              </strong>
            </div>
          </div>

          <div style={detailLinksStyle}>
            <Link
              href={detailLinkHref(selectedTenant.tenantId)}
              className="admin-btn admin-btn--secondary"
            >
              {copy.openTenant}
            </Link>
            <Link
              href={detailLinkHref(selectedTenant.tenantId, "onboarding")}
              className="admin-btn admin-btn--secondary"
            >
              {copy.openOnboarding}
            </Link>
            <Link
              href={detailLinkHref(selectedTenant.tenantId, "roles")}
              className="admin-btn admin-btn--secondary"
            >
              {copy.openRoles}
            </Link>
            <Link
              href={detailLinkHref(selectedTenant.tenantId, "audit")}
              className="admin-btn admin-btn--secondary"
            >
              {copy.openAudit}
            </Link>
          </div>

          <div style={{ color: "#64748b", fontSize: 12.5, lineHeight: 1.6 }}>
            {copy.detailNote}
          </div>
        </WorkflowPanel>
      ) : null}
    </div>
  );
}
