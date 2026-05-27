"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps, CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasIcon,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  buildCanvasTheme,
  type CanvasTableColumn,
} from "@drts/ui-web";

type HomeSnapshot = {
  tenants: PlatformAdminTenantRecord[];
  partners: PartnerChannelEntryRecord[];
  users: PlatformAdminUserRecord[];
  issues: ReconciliationIssueRecord[];
  audit: AuditLogRecord[];
  observability: OperationalObservabilitySnapshot | null;
};

type HomeBannerTone = "info" | "warn" | "danger";

type GovernanceQueueItem = {
  id: string;
  tone: HomeBannerTone;
  title: string;
  description: string;
  href: string;
};

type AuditTableRow = AuditLogRecord & Record<string, unknown>;

type ShortcutRoute = {
  href: string;
  label: string;
  note: string;
  icon: ComponentProps<typeof CanvasIcon>["name"];
};

const th = buildCanvasTheme({
  surface: "platform",
  density: "compact",
});

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const sectionSplitStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 16,
  alignItems: "start",
};

const sectionMainStyle: CSSProperties = {
  flex: "1.6 1 520px",
  minWidth: 0,
};

const sectionSideStyle: CSSProperties = {
  flex: "1 1 320px",
  minWidth: 280,
};

const bannerStackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const quickLinkGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 8,
};

const quickLinkStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 12px",
  borderRadius: 8,
  border: `1px solid ${th.border}`,
  background: th.surface,
  color: th.text,
  textDecoration: "none",
  minWidth: 0,
};

const quickLinkIconStyle: CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 7,
  background: th.accentBg,
  color: th.accent,
  border: `1px solid ${th.accentBorder}`,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const quickLinkTextStyle: CSSProperties = {
  display: "grid",
  gap: 2,
  minWidth: 0,
  flex: 1,
};

const sectionTitleStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
};

const emptyStateStyle: CSSProperties = {
  padding: 24,
  color: th.textMuted,
  fontSize: 12.5,
  textAlign: "center",
};

const actorCellStyle: CSSProperties = {
  display: "grid",
  gap: 2,
  minWidth: 0,
};

const actorPrimaryStyle: CSSProperties = {
  color: th.text,
  fontWeight: 600,
  fontFamily: th.monoFamily,
  fontSize: 11.5,
};

const actorMetaStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 11.5,
  lineHeight: 1.35,
};

function needsPartnerAttention(entry: PartnerChannelEntryRecord) {
  return entry.status !== "active" || partnerHasReadinessGaps(entry);
}

function alertTone(
  state: NonNullable<
    OperationalObservabilitySnapshot["alerts"]
  >[number]["state"],
): HomeBannerTone {
  switch (state) {
    case "critical":
      return "danger";
    case "warning":
      return "warn";
    case "healthy":
    default:
      return "info";
  }
}

function queueTone(items: GovernanceQueueItem[]): HomeBannerTone {
  if (items.some((item) => item.tone === "danger")) {
    return "danger";
  }
  if (items.some((item) => item.tone === "warn")) {
    return "warn";
  }
  return "info";
}

export default function HomePage() {
  const { locale } = useTranslation();
  const router = useRouter();
  const client = usePlatformAdminClient();
  const [snapshot, setSnapshot] = useState<HomeSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const copy =
    locale === "en"
      ? {
          title: "Platform governance home",
          subtitle: (count: number) =>
            `DRTS control plane. ${count} governance item(s) need review today.`,
          refresh: "Refresh",
          refreshing: "Refreshing...",
          openAll: "Open all",
          viewRoute: "Open",
          openAudit: "Go to audit",
          loading: "Loading governance snapshot...",
          noSnapshot: "No governance snapshot available yet.",
          loadErrorTitle: "Unable to load governance snapshot",
          quickLinksTitle: "Module shortcuts",
          quickLinksSubtitle: "Jump directly into the governance surfaces.",
          todayTitle: "Today's governance queue",
          todaySubtitle:
            "Cross-module items where a platform operator or governance owner should intervene.",
          recentTitle: "Recent sensitive operations",
          recentSubtitle: "Platform-layer audit trail · last 24 hours.",
          kpiTenants: "Active tenants",
          kpiPartners: "Partner entries",
          kpiDrivers: "Active drivers",
          kpiRecon: "Pending reconciliation",
          noAudit: "No audit records found.",
          noTodos: "No platform-routed governance blockers at the moment.",
          auditTime: "Time",
          auditModule: "Module",
          auditAction: "Action",
          auditActor: "Actor",
          auditRequest: "Request",
          queueCount: (count: number) => `${count} items`,
          routes: [
            {
              href: "/tenants",
              label: "Tenants",
              note: "Lifecycle + rollout",
              icon: "tenants",
            },
            {
              href: "/partners",
              label: "Partner entry",
              note: "Readiness + credentials",
              icon: "partners",
            },
            {
              href: "/pricing",
              label: "Pricing",
              note: "Rate cards + publish",
              icon: "pricing",
            },
            {
              href: "/payments",
              label: "Settlement governance",
              note: "Reconciliation + finance",
              icon: "payments",
            },
            {
              href: "/fleet",
              label: "Fleet & compliance",
              note: "Driver + vehicle governance",
              icon: "fleet",
            },
            {
              href: "/audit",
              label: "Audit & evidence",
              note: "Sensitive ops + logs",
              icon: "audit",
            },
          ] satisfies ShortcutRoute[],
        }
      : {
          title: "平台治理工作首頁",
          subtitle: (count: number) =>
            `DRTS 平台控制平面，今日有 ${count} 件治理事項需要審視。`,
          refresh: "重新整理",
          refreshing: "重新整理中...",
          openAll: "展開所有",
          viewRoute: "查看",
          openAudit: "前往稽核",
          loading: "載入治理快照中...",
          noSnapshot: "目前沒有可用的治理快照。",
          loadErrorTitle: "無法載入治理快照",
          quickLinksTitle: "模組捷徑",
          quickLinksSubtitle: "跳轉至各治理工作面。",
          todayTitle: "今日治理待辦",
          todaySubtitle: "跨模組需要平台治理人介入的事項。",
          recentTitle: "近期高敏感操作",
          recentSubtitle: "平台層審計足跡 · 最近 24 小時。",
          kpiTenants: "活躍租戶",
          kpiPartners: "合作夥伴 entry",
          kpiDrivers: "活躍司機",
          kpiRecon: "待結算對帳",
          noAudit: "目前沒有稽核紀錄。",
          noTodos: "目前沒有路由到平台端的治理阻塞。",
          auditTime: "時間",
          auditModule: "模組",
          auditAction: "動作",
          auditActor: "操作者",
          auditRequest: "Request",
          queueCount: (count: number) => `${count} 件`,
          routes: [
            {
              href: "/tenants",
              label: "租戶",
              note: "生命週期與 rollout",
              icon: "tenants",
            },
            {
              href: "/partners",
              label: "合作夥伴 entry",
              note: "readiness 與憑證",
              icon: "partners",
            },
            {
              href: "/pricing",
              label: "計價",
              note: "費率與發佈",
              icon: "pricing",
            },
            {
              href: "/payments",
              label: "結算治理",
              note: "對帳與財務",
              icon: "payments",
            },
            {
              href: "/fleet",
              label: "車隊與合規",
              note: "司機與車輛治理",
              icon: "fleet",
            },
            {
              href: "/audit",
              label: "稽核與證據",
              note: "高敏感操作與紀錄",
              icon: "audit",
            },
          ] satisfies ShortcutRoute[],
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
        partners: partners.items ?? [],
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
          (
            alert: NonNullable<
              OperationalObservabilitySnapshot["alerts"]
            >[number],
          ) => alert.routes.includes("platform") && alert.state === "critical",
        ).length ?? 0,
    };
  }, [snapshot]);

  const governanceQueue = useMemo(() => {
    if (!snapshot) {
      return [];
    }

    const alerts = snapshot.observability?.alerts.filter(
      (
        alert: NonNullable<OperationalObservabilitySnapshot["alerts"]>[number],
      ) => alert.routes.includes("platform"),
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
            tone: "warn" as const,
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
    ].filter(Boolean) as GovernanceQueueItem[];
  }, [locale, snapshot]);

  const recentAudit = snapshot?.audit.slice(0, 5) ?? [];
  const unresolvedIssueHint =
    snapshot?.issues
      .filter((issue) => issue.status !== "resolved")
      .slice(0, 3)
      .map((issue) => issue.issueId)
      .join(", ") || undefined;
  const governanceItemCount =
    governanceQueue.length + metrics.rollbackTenants + metrics.criticalAlerts;
  const showLoadingState = loading && !snapshot;
  const queueBadgeTone = queueTone(governanceQueue);

  const auditColumns: CanvasTableColumn<AuditTableRow>[] = [
    {
      h: copy.auditTime,
      w: 180,
      mono: true,
      r: (row) => formatDateTime(row.createdAt),
    },
    {
      h: copy.auditModule,
      w: 140,
      r: (row) => row.moduleName,
    },
    {
      h: copy.auditAction,
      w: 180,
      mono: true,
      r: (row) => row.actionName,
    },
    {
      h: copy.auditActor,
      r: (row) => (
        <div style={actorCellStyle}>
          <span style={actorPrimaryStyle}>{row.actorId ?? "system"}</span>
          <span style={actorMetaStyle}>{row.actorType}</span>
          {row.tenantId ? (
            <span style={actorMetaStyle}>{row.tenantId}</span>
          ) : null}
        </div>
      ),
    },
    {
      h: copy.auditRequest,
      w: 180,
      mono: true,
      r: (row) => row.requestId,
    },
  ];

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        sticky={false}
        title={copy.title}
        subtitle={copy.subtitle(governanceItemCount)}
        actions={
          <CanvasBtn
            theme={th}
            variant="secondary"
            size="sm"
            onClick={() => void loadSnapshot()}
          >
            {loading && snapshot ? copy.refreshing : copy.refresh}
          </CanvasBtn>
        }
      />

      <div style={pageBodyStyle}>
        {error ? (
          <CanvasBanner
            theme={th}
            tone="danger"
            icon="warn"
            title={copy.loadErrorTitle}
            body={error}
          />
        ) : null}

        {showLoadingState ? (
          <CanvasCard theme={th}>
            <div style={emptyStateStyle}>{copy.loading}</div>
          </CanvasCard>
        ) : snapshot ? (
          <>
            <div style={kpiGridStyle}>
              <CanvasKPI
                theme={th}
                label={copy.kpiTenants}
                value={metrics.activeTenants}
                sub={
                  locale === "en"
                    ? `${metrics.pilotTenants} in pilot · ${metrics.sandboxTenants} in sandbox`
                    : `${metrics.pilotTenants} 在 pilot · ${metrics.sandboxTenants} 在 sandbox`
                }
                delta={
                  metrics.rollbackTenants > 0
                    ? locale === "en"
                      ? `${metrics.rollbackTenants} hold`
                      : `${metrics.rollbackTenants} hold`
                    : undefined
                }
                deltaTone={metrics.rollbackTenants > 0 ? "down" : "neutral"}
              />
              <CanvasKPI
                theme={th}
                label={copy.kpiPartners}
                value={metrics.partnerEntries}
                sub={
                  locale === "en"
                    ? "Readiness and credential package coverage"
                    : "readiness 與憑證包覆蓋"
                }
                delta={
                  locale === "en"
                    ? `${metrics.partnerAttention} pending follow-up`
                    : `${metrics.partnerAttention} 筆待補`
                }
                deltaTone={metrics.partnerAttention > 0 ? "neutral" : "up"}
              />
              <CanvasKPI
                theme={th}
                label={copy.kpiDrivers}
                value={metrics.driverEligible}
                sub={
                  locale === "en"
                    ? "Dispatch-eligible drivers in current observability snapshot"
                    : "當前 observability 快照中的可派司機"
                }
                delta={
                  metrics.staleDrivers > 0
                    ? locale === "en"
                      ? `${metrics.staleDrivers} stale`
                      : `${metrics.staleDrivers} 筆 stale`
                    : locale === "en"
                      ? "healthy"
                      : "穩定"
                }
                deltaTone={metrics.staleDrivers > 0 ? "down" : "up"}
              />
              <CanvasKPI
                theme={th}
                label={copy.kpiRecon}
                value={metrics.openIssues}
                sub={
                  locale === "en"
                    ? `${metrics.criticalAlerts} critical platform alert(s)`
                    : `${metrics.criticalAlerts} 筆重大平台告警`
                }
                hint={
                  unresolvedIssueHint ??
                  (locale === "en" ? "no open issue ids" : "目前無待處理 issue")
                }
              />
            </div>

            <div style={sectionSplitStyle}>
              <div style={sectionMainStyle}>
                <CanvasCard
                  theme={th}
                  title={
                    <div style={sectionTitleStyle}>
                      <span>{copy.todayTitle}</span>
                      <CanvasPill theme={th} tone={queueBadgeTone}>
                        {copy.queueCount(governanceQueue.length)}
                      </CanvasPill>
                    </div>
                  }
                  subtitle={copy.todaySubtitle}
                  actions={
                    <CanvasBtn
                      theme={th}
                      variant="ghost"
                      size="sm"
                      icon="ext"
                      onClick={() => router.push("/health")}
                    >
                      {copy.openAll}
                    </CanvasBtn>
                  }
                >
                  <div style={bannerStackStyle}>
                    {governanceQueue.length > 0 ? (
                      governanceQueue.map((item, index) => (
                        <CanvasBanner
                          key={item.id}
                          theme={th}
                          tone={item.tone}
                          icon="warn"
                          title={item.title}
                          body={item.description}
                          actions={
                            <CanvasBtn
                              theme={th}
                              variant={index === 0 ? "primary" : "secondary"}
                              size="sm"
                              onClick={() => router.push(item.href)}
                            >
                              {copy.viewRoute}
                            </CanvasBtn>
                          }
                        />
                      ))
                    ) : (
                      <div style={emptyStateStyle}>{copy.noTodos}</div>
                    )}
                  </div>
                </CanvasCard>
              </div>

              <div style={sectionSideStyle}>
                <CanvasCard
                  theme={th}
                  title={copy.quickLinksTitle}
                  subtitle={copy.quickLinksSubtitle}
                >
                  <div style={quickLinkGridStyle}>
                    {copy.routes.map((route) => (
                      <Link
                        key={route.href}
                        href={route.href}
                        style={quickLinkStyle}
                      >
                        <span style={quickLinkIconStyle}>
                          <CanvasIcon name={route.icon} size={14} />
                        </span>
                        <span style={quickLinkTextStyle}>
                          <strong style={{ fontSize: 12.5 }}>
                            {route.label}
                          </strong>
                          <span style={{ color: th.textMuted, fontSize: 11.5 }}>
                            {route.note}
                          </span>
                        </span>
                        <CanvasIcon
                          name="chevR"
                          size={12}
                          style={{ color: th.textDim, flexShrink: 0 }}
                        />
                      </Link>
                    ))}
                  </div>
                </CanvasCard>
              </div>
            </div>

            <CanvasCard
              theme={th}
              title={
                <div style={sectionTitleStyle}>
                  <span>{copy.recentTitle}</span>
                  <CanvasPill theme={th} tone="accent">
                    24h
                  </CanvasPill>
                </div>
              }
              subtitle={copy.recentSubtitle}
              actions={
                <CanvasBtn
                  theme={th}
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push("/audit")}
                >
                  {copy.openAudit}
                </CanvasBtn>
              }
              padding={0}
            >
              {recentAudit.length > 0 ? (
                <CanvasTable<AuditTableRow>
                  theme={th}
                  columns={auditColumns}
                  rows={recentAudit as AuditTableRow[]}
                />
              ) : (
                <div style={emptyStateStyle}>{copy.noAudit}</div>
              )}
            </CanvasCard>
          </>
        ) : (
          <CanvasCard theme={th}>
            <div style={emptyStateStyle}>{copy.noSnapshot}</div>
          </CanvasCard>
        )}
      </div>
    </div>
  );
}
