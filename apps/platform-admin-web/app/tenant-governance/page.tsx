"use client";

import React, { useEffect, useMemo, useState, type CSSProperties } from "react";
import { usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { t as translate, type Locale } from "@/lib/translations";
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

const tenantNameStyle: CSSProperties = {
  color: theme.text,
  fontWeight: 600,
};

const tenantCodeStyle: CSSProperties = {
  color: theme.textDim,
  fontFamily: theme.monoFamily,
  fontSize: 11,
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

function formatCount(value: number) {
  return value.toLocaleString();
}

function formatPercent(value: number) {
  return `${value.toLocaleString(undefined, {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
    maximumFractionDigits: 1,
  })}%`;
}

function formatMonthlyPlan(value: number, locale: Locale) {
  return translate("paMisc.monthlyPlan", locale, { count: formatCount(value) });
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

function hasNoApprovers(flag: PlatformTenantGovernanceAlertFlag) {
  return flag === "no_approvers_configured";
}

export default function TenantGovernancePage() {
  const { locale, t } = useTranslation();
  const client = usePlatformAdminClient();
  const [summary, setSummary] =
    useState<PlatformTenantGovernanceSummaryResponse | null>(null);
  const [tenants, setTenants] = useState<PlatformAdminTenantRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    const noApproverSignals = rows.filter((row) =>
      row.alertFlags.some(hasNoApprovers),
    ).length;
    const pendingSignals = rows.filter((row) =>
      row.alertFlags.includes("pending_approval_over_48h"),
    ).length;
    const quotaCriticalSignals = rows.filter((row) =>
      row.alertFlags.includes("quota_above_95_percent"),
    ).length;
    const averagePendingHours =
      rows.length > 0
        ? Math.round(
            (rows.reduce(
              (sum, row) => sum + (row.oldestPendingApprovalAgeHours ?? 0),
              0,
            ) /
              rows.length) *
              10,
          ) / 10
        : null;

    return {
      quotaWarning,
      approvalBacklog,
      costCenterAnomaly,
      riskSignals: noApproverSignals + pendingSignals + quotaCriticalSignals,
      noApproverSignals,
      pendingSignals,
      quotaCriticalSignals,
      averagePendingHours,
    };
  }, [rows]);

  const columns = useMemo<CanvasTableColumn<GovernanceRow>[]>(
    () => [
      {
        h: t("tenantGovernance.col.tenant"),
        w: 220,
        r: (row) => (
          <div style={tenantCellStyle}>
            <span style={tenantNameStyle}>{row.tenantName}</span>
            <span style={tenantCodeStyle}>{row.tenantCode}</span>
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
              noApproverSignals: metrics.noApproverSignals,
              quotaCriticalSignals: metrics.quotaCriticalSignals,
              pendingSignals: metrics.pendingSignals,
            })}
          />
        </div>

        <CanvasCard
          theme={theme}
          title={t("tenantGovernance.cardTitle")}
          padding={0}
        >
          {loading && !summary ? (
            <div style={emptyStateStyle}>{t("tenantGovernance.loading")}</div>
          ) : rows.length === 0 ? (
            <div style={emptyStateStyle}>{t("tenantGovernance.empty")}</div>
          ) : (
            <CanvasTable theme={theme} columns={columns} rows={rows} />
          )}
        </CanvasCard>
      </div>
    </>
  );
}
