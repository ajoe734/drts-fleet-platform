"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState, type CSSProperties } from "react";
import { usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import type {
  PlatformAdminTenantRecord,
  PlatformTenantGovernanceAlertFlag,
  PlatformTenantGovernanceSummaryResponse,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasCard,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  buildCanvasTheme,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";

const PAGE_SIZE = 8;

const theme = buildCanvasTheme({
  surface: "platform",
  dark: true,
  density: "compact",
});

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
  width: "100%",
};

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const emptyStateStyle: CSSProperties = {
  padding: 28,
  color: theme.textMuted,
  fontSize: 12.5,
  textAlign: "center",
};

const tenantCellStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  minWidth: 0,
};

const tenantLinkStyle: CSSProperties = {
  color: theme.text,
  fontWeight: 600,
  textDecoration: "none",
};

const tenantCodeStyle: CSSProperties = {
  color: theme.textDim,
  fontFamily: theme.monoFamily,
  fontSize: 11,
};

const drillLinkRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  marginTop: 4,
};

const drillLinkStyle: CSSProperties = {
  color: theme.accent,
  fontSize: 11,
  textDecoration: "none",
};

const filterRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const filterButtonStyle: CSSProperties = {
  appearance: "none",
  border: 0,
  background: "transparent",
  padding: 0,
  cursor: "pointer",
};

const usageBarTrackStyle: CSSProperties = {
  flex: 1,
  height: 6,
  background: theme.surfaceLo,
  borderRadius: 999,
  overflow: "hidden",
};

const usageBarValueStyle = (percent: number): CSSProperties => ({
  width: `${Math.max(0, Math.min(percent, 100))}%`,
  height: "100%",
  background:
    percent > 90 ? theme.danger : percent > 80 ? theme.warn : theme.success,
});

const usageCellStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  minWidth: 160,
};

const usagePercentStyle: CSSProperties = {
  minWidth: 40,
  textAlign: "right",
  fontFamily: theme.monoFamily,
  fontSize: 11.5,
};

type GovernanceRow = Record<string, unknown> &
  PlatformTenantGovernanceSummaryResponse["items"][number] & {
    quotaPlan: number;
    quotaUsed: number;
  };

type GovernanceRiskFilter =
  | "all"
  | "quota_warning"
  | "approval_backlog"
  | "cost_center_anomaly"
  | PlatformTenantGovernanceAlertFlag;

const RISK_FILTERS: GovernanceRiskFilter[] = [
  "all",
  "quota_warning",
  "approval_backlog",
  "cost_center_anomaly",
  "rollback_hold",
  "blocked_rollout_gate",
  "expired_credentials",
  "expiring_contract",
];

function formatCount(value: number) {
  return value.toLocaleString();
}

function formatPercent(value: number) {
  return `${value.toLocaleString(undefined, {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
    maximumFractionDigits: 1,
  })}%`;
}

function formatMonthlyPlan(value: number, locale: string) {
  return locale === "en"
    ? `${formatCount(value)}/mo`
    : `${formatCount(value)}/月`;
}

function getThresholdTone(value: number): CanvasTone {
  if (value > 90) {
    return "danger";
  }
  if (value > 80) {
    return "warn";
  }
  return "success";
}

function getThresholdLabelKey(value: number) {
  if (value > 90) {
    return "tenantGovernance.status.overThreshold";
  }
  if (value > 80) {
    return "tenantGovernance.status.warning";
  }
  return "tenantGovernance.status.ok";
}

function hasAlertFlag(
  row: GovernanceRow,
  flag: PlatformTenantGovernanceAlertFlag,
) {
  return row.alertFlags.includes(flag);
}

function matchesRiskFilter(row: GovernanceRow, filter: GovernanceRiskFilter) {
  switch (filter) {
    case "all":
      return true;
    case "quota_warning":
      return row.monthlyQuotaPercentUsed > 80;
    case "approval_backlog":
      return row.pendingApprovalCount > 0;
    case "cost_center_anomaly":
      return row.costCenterCount === 0 || row.activeRuleCount === 0;
    default:
      return hasAlertFlag(row, filter);
  }
}

function riskFilterTone(
  filter: GovernanceRiskFilter,
  active: boolean,
): CanvasTone {
  if (active) {
    return "accent";
  }
  if (
    filter === "rollback_hold" ||
    filter === "blocked_rollout_gate" ||
    filter === "expired_credentials"
  ) {
    return "danger";
  }
  if (
    filter === "quota_warning" ||
    filter === "approval_backlog" ||
    filter === "cost_center_anomaly" ||
    filter === "expiring_contract"
  ) {
    return "warn";
  }
  return "neutral";
}

export default function TenantGovernancePage() {
  const { locale, t } = useTranslation();
  const client = usePlatformAdminClient();
  const [summary, setSummary] =
    useState<PlatformTenantGovernanceSummaryResponse | null>(null);
  const [tenants, setTenants] = useState<PlatformAdminTenantRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [riskFilter, setRiskFilter] = useState<GovernanceRiskFilter>("all");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [summaryResult, tenantsResult] = await Promise.all([
          client.getPlatformTenantGovernanceSummary({
            page: 1,
            pageSize: PAGE_SIZE,
          }),
          client.listPlatformTenants(),
        ]);

        if (cancelled) {
          return;
        }

        setSummary(summaryResult);
        setTenants(tenantsResult ?? []);
      } catch (loadError: unknown) {
        if (cancelled) {
          return;
        }
        setError(
          loadError instanceof Error ? loadError.message : String(loadError),
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [client]);

  const tenantMap = useMemo(
    () => new Map(tenants.map((tenant) => [tenant.id, tenant])),
    [tenants],
  );

  const rows = useMemo<GovernanceRow[]>(() => {
    if (!summary) {
      return [];
    }

    return summary.items
      .map((item) => {
        const tenant = tenantMap.get(item.tenantId);
        const quotaPlan = tenant?.quotas.monthlyBookings ?? 0;
        const quotaUsed = Math.round(
          (quotaPlan * item.monthlyQuotaPercentUsed) / 100,
        );

        return {
          ...item,
          quotaPlan,
          quotaUsed,
        };
      })
      .sort(
        (left, right) =>
          right.monthlyQuotaPercentUsed - left.monthlyQuotaPercentUsed,
      );
  }, [summary, tenantMap]);

  const metrics = useMemo(() => {
    const quotaWarning = rows.filter(
      (row) => row.monthlyQuotaPercentUsed > 80,
    ).length;
    const approvalBacklog = rows.reduce(
      (sum, row) => sum + row.pendingApprovalCount,
      0,
    );
    const costCenterAnomaly = rows.filter(
      (row) => row.costCenterCount === 0 || row.activeRuleCount === 0,
    ).length;
    const rollbackHoldSignals = rows.filter((row) =>
      hasAlertFlag(row, "rollback_hold"),
    ).length;
    const blockedGateSignals = rows.filter((row) =>
      hasAlertFlag(row, "blocked_rollout_gate"),
    ).length;
    const expiredCredentialSignals = rows.filter((row) =>
      hasAlertFlag(row, "expired_credentials"),
    ).length;
    const expiringContractSignals = rows.filter((row) =>
      hasAlertFlag(row, "expiring_contract"),
    ).length;
    const rowsWithPendingAge = rows.filter(
      (row) => row.oldestPendingApprovalAgeHours !== null,
    );
    const averagePendingHours =
      rowsWithPendingAge.length > 0
        ? Math.round(
            (rowsWithPendingAge.reduce(
              (sum, row) => sum + (row.oldestPendingApprovalAgeHours ?? 0),
              0,
            ) /
              rowsWithPendingAge.length) *
              10,
          ) / 10
        : null;

    return {
      quotaWarning,
      approvalBacklog,
      costCenterAnomaly,
      rollbackHoldSignals,
      blockedGateSignals,
      expiredCredentialSignals,
      expiringContractSignals,
      riskSignals:
        rollbackHoldSignals +
        blockedGateSignals +
        expiredCredentialSignals +
        expiringContractSignals,
      averagePendingHours,
    };
  }, [rows]);

  const visibleRows = useMemo(
    () => rows.filter((row) => matchesRiskFilter(row, riskFilter)),
    [riskFilter, rows],
  );

  const filterOptions = useMemo(
    () =>
      RISK_FILTERS.map((filterValue) => ({
        value: filterValue,
        label: t(`tenantGovernance.filter.${filterValue}`),
        count: rows.filter((row) => matchesRiskFilter(row, filterValue)).length,
      })),
    [rows, t],
  );

  const columns = useMemo<CanvasTableColumn<GovernanceRow>[]>(
    () => [
      {
        h: t("tenantGovernance.col.tenant"),
        w: 220,
        r: (row) => (
          <div style={tenantCellStyle}>
            <Link href={`/tenants/${row.tenantId}`} style={tenantLinkStyle}>
              {row.tenantName}
            </Link>
            <span style={tenantCodeStyle}>{row.tenantCode}</span>
            <div style={drillLinkRowStyle}>
              <Link href={`/tenants/${row.tenantId}`} style={drillLinkStyle}>
                {t("tenantGovernance.drill.tenant")}
              </Link>
              <Link
                href={`/payments?tenantId=${encodeURIComponent(row.tenantId)}`}
                style={drillLinkStyle}
              >
                {t("tenantGovernance.drill.payments")}
              </Link>
              <Link
                href={`/audit?tenantId=${encodeURIComponent(row.tenantId)}`}
                style={drillLinkStyle}
              >
                {t("tenantGovernance.drill.audit")}
              </Link>
            </div>
          </div>
        ),
      },
      {
        h: t("tenantGovernance.col.plan"),
        w: 120,
        mono: true,
        r: (row) => formatMonthlyPlan(row.quotaPlan, locale),
      },
      {
        h: t("tenantGovernance.col.usage"),
        w: 120,
        mono: true,
        align: "right",
        r: (row) => formatCount(row.quotaUsed),
      },
      {
        h: t("tenantGovernance.col.percent"),
        w: 200,
        r: (row) => (
          <div style={usageCellStyle}>
            <div style={usageBarTrackStyle}>
              <div style={usageBarValueStyle(row.monthlyQuotaPercentUsed)} />
            </div>
            <span style={usagePercentStyle}>
              {formatPercent(row.monthlyQuotaPercentUsed)}
            </span>
          </div>
        ),
      },
      {
        h: t("tenantGovernance.col.status"),
        w: 130,
        r: (row) => (
          <CanvasPill
            theme={theme}
            tone={getThresholdTone(row.monthlyQuotaPercentUsed)}
            dot
          >
            {t(getThresholdLabelKey(row.monthlyQuotaPercentUsed))}
          </CanvasPill>
        ),
      },
    ],
    [locale, t],
  );

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={t("tenantGovernance.title")}
        subtitle={t("tenantGovernance.subtitle")}
      />

      <div style={pageBodyStyle}>
        {error ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            icon="warn"
            title={t("tenantGovernance.errorTitle")}
            body={error}
          />
        ) : null}

        <div style={kpiGridStyle}>
          <CanvasKPI
            theme={theme}
            label={t("tenantGovernance.kpi.quotaWarn")}
            value={metrics.quotaWarning}
            delta={
              metrics.quotaWarning > 0
                ? t("tenantGovernance.delta.thresholdWarning")
                : undefined
            }
            deltaTone={metrics.quotaWarning > 0 ? "down" : "neutral"}
            sub={t("tenantGovernance.kpi.quotaWarnSub", {
              count: metrics.quotaWarning,
            })}
          />
          <CanvasKPI
            theme={theme}
            label={t("tenantGovernance.kpi.approvalBacklog")}
            value={metrics.approvalBacklog}
            delta={
              metrics.approvalBacklog > 0
                ? t("tenantGovernance.delta.approvalTriage")
                : undefined
            }
            deltaTone={metrics.approvalBacklog > 0 ? "neutral" : "up"}
            sub={
              metrics.averagePendingHours === null
                ? t("tenantGovernance.kpi.approvalSub.none")
                : t("tenantGovernance.kpi.approvalSub.hours", {
                    hours: metrics.averagePendingHours,
                  })
            }
          />
          <CanvasKPI
            theme={theme}
            label={t("tenantGovernance.kpi.costCenterAnomaly")}
            value={metrics.costCenterAnomaly}
            delta={
              metrics.costCenterAnomaly > 0
                ? t("tenantGovernance.delta.followup")
                : undefined
            }
            deltaTone={metrics.costCenterAnomaly > 0 ? "down" : "up"}
            sub={t("tenantGovernance.kpi.costCenterSub")}
          />
          <CanvasKPI
            theme={theme}
            label={t("tenantGovernance.kpi.riskSignals")}
            value={metrics.riskSignals}
            delta={
              metrics.riskSignals > 0
                ? t("tenantGovernance.delta.triageOpen")
                : undefined
            }
            deltaTone={metrics.riskSignals > 0 ? "down" : "up"}
            sub={t("tenantGovernance.kpi.riskSignalsSub", {
              rollbackHoldSignals: metrics.rollbackHoldSignals,
              blockedGateSignals: metrics.blockedGateSignals,
              expiredCredentialSignals: metrics.expiredCredentialSignals,
              expiringContractSignals: metrics.expiringContractSignals,
            })}
          />
        </div>

        <div style={filterRowStyle}>
          {filterOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              style={filterButtonStyle}
              onClick={() => setRiskFilter(option.value)}
              aria-pressed={riskFilter === option.value}
            >
              <CanvasPill
                theme={theme}
                tone={riskFilterTone(option.value, riskFilter === option.value)}
                dot={riskFilter === option.value}
              >
                {option.label}: {option.count}
              </CanvasPill>
            </button>
          ))}
        </div>

        <CanvasCard
          theme={theme}
          title={t("tenantGovernance.cardTitle")}
          padding={0}
        >
          {loading && !summary ? (
            <div style={emptyStateStyle}>{t("tenantGovernance.loading")}</div>
          ) : visibleRows.length === 0 ? (
            <div style={emptyStateStyle}>{t("tenantGovernance.empty")}</div>
          ) : (
            <CanvasTable theme={theme} columns={columns} rows={visibleRows} />
          )}
        </CanvasCard>
      </div>
    </>
  );
}
