"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { actionButtonStyle, emptyStateStyle } from "@/components/platform-ui";
import { partnerHasReadinessGaps } from "@/components/partner-governance-shared";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import type {
  AuditLogRecord,
  OperationalObservabilitySnapshot,
  PartnerChannelEntryRecord,
  PlatformAdminTenantRecord,
  PlatformAdminUserRecord,
  ReconciliationIssueRecord,
} from "@drts/contracts";
import {
  CalloutBanner,
  DataCellStack,
  DataTable,
  DataViewCard,
  KpiCard,
  KpiRow,
  PageHeader,
  Td,
  Tr,
  WorkflowPanel,
  WorkflowSplitLayout,
} from "@drts/ui-web";

type HomeSnapshot = {
  tenants: PlatformAdminTenantRecord[];
  partners: PartnerChannelEntryRecord[];
  users: PlatformAdminUserRecord[];
  issues: ReconciliationIssueRecord[];
  audit: AuditLogRecord[];
  observability: OperationalObservabilitySnapshot | null;
};

function needsPartnerAttention(entry: PartnerChannelEntryRecord) {
  return entry.status !== "active" || partnerHasReadinessGaps(entry);
}

function alertTone(
  state: NonNullable<
    OperationalObservabilitySnapshot["alerts"]
  >[number]["state"],
) {
  switch (state) {
    case "critical":
      return "danger";
    case "warning":
      return "warning";
    case "healthy":
    default:
      return "info";
  }
}

export default function HomePage() {
  const { locale } = useTranslation();
  const client = usePlatformAdminClient();
  const [snapshot, setSnapshot] = useState<HomeSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const copy =
    locale === "en"
      ? {
          title: "Platform governance home",
          subtitle: (count: number) =>
            `DRTS control plane. ${count} governance item(s) currently need attention.`,
          refresh: "Refresh",
          openAll: "Open all",
          quickLinksTitle: "Governance shortcuts",
          quickLinksSubtitle: "Jump directly into the control surfaces.",
          todayTitle: "Today's governance queue",
          todaySubtitle:
            "Cross-module items where a platform operator or governance owner should intervene.",
          recentTitle: "Recent sensitive operations",
          recentSubtitle: "Audit trail for the last 24 hours.",
          kpiTenants: "Active tenants",
          kpiPartners: "Partner entries",
          kpiDrivers: "Dispatch-eligible drivers",
          kpiRecon: "Open reconciliation issues",
          noAudit: "No audit records found.",
          noTodos: "No platform-routed governance blockers at the moment.",
          auditTime: "Time",
          auditModule: "Module",
          auditAction: "Action",
          auditActor: "Actor",
          auditRequest: "Request",
          viewRoute: "Open",
          routes: [
            { href: "/tenants", label: "Tenants", note: "Lifecycle + rollout" },
            {
              href: "/partners",
              label: "Partner entry",
              note: "Readiness + credentials",
            },
            {
              href: "/users",
              label: "Platform staff",
              note: "RBAC + invite state",
            },
            {
              href: "/fleet",
              label: "Fleet & compliance",
              note: "Driver + vehicle governance",
            },
            {
              href: "/payments",
              label: "Settlement governance",
              note: "Finance exceptions",
            },
            {
              href: "/health",
              label: "Platform health",
              note: "Alerts + adapters",
            },
          ],
        }
      : {
          title: "平台治理工作首頁",
          subtitle: (count: number) =>
            `DRTS 平台控制平面，目前有 ${count} 件治理事項需要處理。`,
          refresh: "重新整理",
          openAll: "展開所有",
          quickLinksTitle: "治理捷徑",
          quickLinksSubtitle: "直接跳進各個治理工作面。",
          todayTitle: "今日治理待辦",
          todaySubtitle: "跨模組需要平台治理人介入的事項。",
          recentTitle: "近期高敏感操作",
          recentSubtitle: "最近 24 小時的平台層稽核足跡。",
          kpiTenants: "活躍租戶",
          kpiPartners: "合作夥伴 entry",
          kpiDrivers: "可派司機",
          kpiRecon: "待處理對帳",
          noAudit: "目前沒有稽核紀錄。",
          noTodos: "目前沒有路由到平台端的治理阻塞。",
          auditTime: "時間",
          auditModule: "模組",
          auditAction: "動作",
          auditActor: "操作者",
          auditRequest: "Request",
          viewRoute: "查看",
          routes: [
            { href: "/tenants", label: "租戶", note: "生命週期與 rollout" },
            {
              href: "/partners",
              label: "合作夥伴 entry",
              note: "readiness 與憑證",
            },
            { href: "/users", label: "平台人員", note: "RBAC 與邀請狀態" },
            { href: "/fleet", label: "車隊與合規", note: "司機與車輛治理" },
            { href: "/payments", label: "結算治理", note: "財務例外處理" },
            { href: "/health", label: "平台健康", note: "告警與 adapters" },
          ],
        };

  const loadSnapshot = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tenants, partners, users, issues, audit, observability] =
        await Promise.all([
          client.listPlatformTenants(),
          client.listPlatformPartnerEntries(),
          client.listPlatformAdminUsers(),
          client.listReconciliationIssues(),
          client.listAuditLogs() as Promise<AuditLogRecord[]>,
          client.getOperationalObservability(),
        ]);

      setSnapshot({
        tenants: tenants ?? [],
        partners: partners ?? [],
        users: users ?? [],
        issues: issues ?? [],
        audit: audit ?? [],
        observability,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  const metrics = useMemo(() => {
    const tenants = snapshot?.tenants ?? [];
    const partners = snapshot?.partners ?? [];
    const issues = snapshot?.issues ?? [];
    const observability = snapshot?.observability;

    return {
      activeTenants: tenants.filter((tenant) => tenant.status === "active")
        .length,
      sandboxTenants: tenants.filter(
        (tenant) => tenant.rollout.stage === "sandbox",
      ).length,
      pilotTenants: tenants.filter((tenant) => tenant.rollout.stage === "pilot")
        .length,
      rollbackTenants: tenants.filter(
        (tenant) => tenant.status === "rollback_hold",
      ).length,
      partnerEntries: partners.length,
      partnerAttention: partners.filter(needsPartnerAttention).length,
      openIssues: issues.filter((issue) => issue.status !== "resolved").length,
      driverEligible: observability?.driverState.dispatchEligibleDrivers ?? 0,
      staleDrivers: observability?.driverState.staleLocationDrivers ?? 0,
      criticalAlerts:
        observability?.alerts.filter(
          (alert) =>
            alert.routes.includes("platform") && alert.state === "critical",
        ).length ?? 0,
    };
  }, [snapshot]);

  const governanceQueue = useMemo(() => {
    if (!snapshot) {
      return [];
    }

    const alerts = snapshot.observability?.alerts.filter((alert) =>
      alert.routes.includes("platform"),
    );
    const rollbackTenant = snapshot.tenants.find(
      (tenant) => tenant.status === "rollback_hold",
    );
    const partnerEntry = snapshot.partners.find(needsPartnerAttention);
    const openIssue = snapshot.issues.find(
      (issue) => issue.status !== "resolved",
    );

    return [
      alerts?.[0]
        ? {
            id: `alert-${alerts[0].key}`,
            tone: alertTone(alerts[0].state),
            title:
              locale === "en"
                ? `Operational alert: ${alerts[0].key}`
                : `營運告警：${alerts[0].key}`,
            description:
              locale === "en"
                ? `Measured ${alerts[0].measuredValue} at ${formatDateTime(
                    alerts[0].observedAt,
                  )}. Review platform-routed observability before it spills into ops-only handling.`
                : `${formatDateTime(alerts[0].observedAt)} 量測值 ${alerts[0].measuredValue}。請先在平台端完成判讀，再決定是否交給 ops 處理。`,
            href: "/health",
          }
        : null,
      rollbackTenant
        ? {
            id: `tenant-${rollbackTenant.id}`,
            tone: "warning" as const,
            title:
              locale === "en"
                ? `${rollbackTenant.name} is in rollback hold`
                : `${rollbackTenant.name} 處於 rollback hold`,
            description:
              locale === "en"
                ? `Rollout stage ${rollbackTenant.rollout.stage}. Verify cutover owner, rollback owner, and onboarding notes before any new promotion.`
                : `目前 rollout 階段為 ${rollbackTenant.rollout.stage}。推進前請先確認 cutover / rollback owner 與 onboarding 備註。`,
            href: `/tenants/${rollbackTenant.id}`,
          }
        : null,
      partnerEntry
        ? {
            id: `partner-${partnerEntry.entrySlug}`,
            tone: "info" as const,
            title:
              locale === "en"
                ? `${partnerEntry.displayName} still has readiness gaps`
                : `${partnerEntry.displayName} 仍有 readiness 缺口`,
            description:
              locale === "en"
                ? "Branding, routing, or support metadata is incomplete. Finish the entry package before enabling production traffic."
                : "品牌、路由或支援資訊尚未補齊。正式導流前請先完成 entry package。",
            href: `/partners/${partnerEntry.entrySlug}`,
          }
        : null,
      openIssue
        ? {
            id: `issue-${openIssue.issueId}`,
            tone: "danger" as const,
            title:
              locale === "en"
                ? `${openIssue.issueId} remains open in settlement governance`
                : `${openIssue.issueId} 仍在結算治理佇列中`,
            description:
              locale === "en"
                ? `Channel ${openIssue.channelKey}. Review owner, evidence, and resolution notes before the next finance close.`
                : `渠道 ${openIssue.channelKey}。請在下一次財務 close 前確認 owner、證據與 resolution note。`,
            href: `/payments/reconciliation/${openIssue.issueId}`,
          }
        : null,
    ].filter(Boolean) as Array<{
      id: string;
      tone: "info" | "warning" | "danger";
      title: string;
      description: string;
      href: string;
    }>;
  }, [locale, snapshot]);

  const recentAudit = snapshot?.audit.slice(0, 5) ?? [];
  const governanceItemCount =
    governanceQueue.length + metrics.rollbackTenants + metrics.criticalAlerts;

  if (loading) {
    return (
      <div style={emptyStateStyle}>
        {locale === "en" ? "Loading..." : "載入中..."}
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <PageHeader
        eyebrow={locale === "en" ? "Platform Admin" : "Platform Admin"}
        title={copy.title}
        subtitle={copy.subtitle(governanceItemCount)}
        actions={
          <button
            type="button"
            style={actionButtonStyle({ tone: "secondary" })}
            onClick={() => void loadSnapshot()}
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
              ? "Unable to load governance snapshot"
              : "無法載入治理快照"
          }
          description={error}
        />
      ) : null}

      <KpiRow minWidth="220px">
        <KpiCard
          label={copy.kpiTenants}
          value={metrics.activeTenants}
          detail={
            locale === "en"
              ? `${metrics.pilotTenants} pilot · ${metrics.sandboxTenants} sandbox`
              : `${metrics.pilotTenants} pilot · ${metrics.sandboxTenants} sandbox`
          }
          trend={
            metrics.rollbackTenants > 0
              ? locale === "en"
                ? `${metrics.rollbackTenants} hold`
                : `${metrics.rollbackTenants} hold`
              : undefined
          }
          tone={metrics.rollbackTenants > 0 ? "warning" : "success"}
        />
        <KpiCard
          label={copy.kpiPartners}
          value={metrics.partnerEntries}
          detail={
            locale === "en"
              ? `${metrics.partnerAttention} needing readiness follow-up`
              : `${metrics.partnerAttention} 筆待補 readiness`
          }
          tone={metrics.partnerAttention > 0 ? "warning" : "info"}
        />
        <KpiCard
          label={copy.kpiDrivers}
          value={metrics.driverEligible}
          detail={
            locale === "en"
              ? `${metrics.staleDrivers} stale location record(s)`
              : `${metrics.staleDrivers} 筆 stale location`
          }
          tone={metrics.staleDrivers > 0 ? "warning" : "success"}
        />
        <KpiCard
          label={copy.kpiRecon}
          value={metrics.openIssues}
          detail={
            locale === "en"
              ? `${metrics.criticalAlerts} critical platform alert(s)`
              : `${metrics.criticalAlerts} 筆重大平台告警`
          }
          tone={metrics.openIssues > 0 ? "danger" : "neutral"}
        />
      </KpiRow>

      <WorkflowSplitLayout
        main={
          <>
            <WorkflowPanel
              title={copy.todayTitle}
              description={copy.todaySubtitle}
              actions={
                <Link
                  href="/health"
                  style={actionButtonStyle({ tone: "secondary", size: "sm" })}
                >
                  {copy.openAll}
                </Link>
              }
            >
              {governanceQueue.length > 0 ? (
                governanceQueue.map((item) => (
                  <CalloutBanner
                    key={item.id}
                    tone={item.tone}
                    title={item.title}
                    description={item.description}
                    actions={
                      <Link
                        href={item.href}
                        style={actionButtonStyle({
                          tone: "secondary",
                          size: "sm",
                        })}
                      >
                        {copy.viewRoute}
                      </Link>
                    }
                  />
                ))
              ) : (
                <div style={{ color: "#64748b", fontSize: 13.5 }}>
                  {copy.noTodos}
                </div>
              )}
            </WorkflowPanel>

            <DataViewCard
              title={copy.recentTitle}
              subtitle={copy.recentSubtitle}
              density="compact"
            >
              <DataTable
                columns={[
                  { label: copy.auditTime, width: "180px" },
                  { label: copy.auditModule, width: "140px" },
                  { label: copy.auditAction, width: "180px" },
                  { label: copy.auditActor },
                  { label: copy.auditRequest, width: "180px" },
                ]}
                density="compact"
                empty={copy.noAudit}
              >
                {recentAudit.map((record) => (
                  <Tr key={record.auditId}>
                    <Td mono density="compact">
                      {formatDateTime(record.createdAt)}
                    </Td>
                    <Td density="compact">{record.moduleName}</Td>
                    <Td mono density="compact">
                      {record.actionName}
                    </Td>
                    <Td density="compact">
                      <DataCellStack
                        primary={record.actorId ?? "system"}
                        secondary={record.actorType}
                        tertiary={record.tenantId ?? undefined}
                      />
                    </Td>
                    <Td mono density="compact">
                      {record.requestId}
                    </Td>
                  </Tr>
                ))}
              </DataTable>
            </DataViewCard>
          </>
        }
        side={
          <WorkflowPanel
            title={copy.quickLinksTitle}
            description={copy.quickLinksSubtitle}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 10,
              }}
            >
              {copy.routes.map((route) => (
                <Link
                  key={route.href}
                  href={route.href}
                  style={{
                    display: "grid",
                    gap: 4,
                    padding: "14px 16px",
                    borderRadius: 14,
                    border: "1px solid #dbe4ee",
                    background: "#f8fafc",
                    textDecoration: "none",
                  }}
                >
                  <strong style={{ color: "#0f172a", fontSize: 13.5 }}>
                    {route.label}
                  </strong>
                  <span style={{ color: "#64748b", fontSize: 12.5 }}>
                    {route.note}
                  </span>
                </Link>
              ))}
            </div>
          </WorkflowPanel>
        }
      />
    </div>
  );
}
