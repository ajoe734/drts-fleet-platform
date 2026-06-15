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
type PlatformAlert = NonNullable<
  OperationalObservabilitySnapshot["alerts"]
>[number];

type GovernanceQueueItem = {
  id: string;
  tone: HomeBannerTone;
  icon: ComponentProps<typeof CanvasIcon>["name"];
  title: string;
  description: string;
  href: string;
  actionLabel: string;
  actionVariant: "primary" | "secondary";
};

type AuditTableRow = AuditLogRecord & Record<string, unknown>;

type ShortcutRoute = {
  href: string;
  labelKey: string;
  icon: ComponentProps<typeof CanvasIcon>["name"];
};

const HOME_SHORTCUT_ROUTES: ShortcutRoute[] = [
  { href: "/tenants", labelKey: "home.shortcut.tenants", icon: "tenants" },
  { href: "/partners", labelKey: "home.shortcut.partners", icon: "partners" },
  { href: "/pricing", labelKey: "home.shortcut.pricing", icon: "pricing" },
  { href: "/payments", labelKey: "home.shortcut.payments", icon: "payments" },
  { href: "/fleet", labelKey: "home.shortcut.fleet", icon: "fleet" },
  { href: "/audit", labelKey: "home.shortcut.audit", icon: "audit" },
];

const th = buildCanvasTheme({
  dark: true,
  surface: "platform",
  density: "compact",
});

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
  width: "100%",
  maxWidth: 1280,
  margin: "0 auto",
};

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const sectionGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.6fr) minmax(320px, 1fr)",
  gap: 16,
  alignItems: "start",
};

const sectionMainStyle: CSSProperties = {
  minWidth: 0,
};

const sectionSideStyle: CSSProperties = {
  minWidth: 0,
};

const bannerStackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const quickLinkGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
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

const quickLinkLabelStyle: CSSProperties = {
  fontSize: 12.5,
  fontWeight: 500,
  lineHeight: 1.35,
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

const moduleCellStyle: CSSProperties = {
  fontFamily: th.monoFamily,
  fontSize: 11.5,
};

const actionCellStyle: CSSProperties = {
  fontFamily: th.monoFamily,
  fontSize: 11.5,
};

const ALERT_STATE_PRIORITY = {
  critical: 0,
  warning: 1,
  healthy: 2,
} as const;

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

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function actorTypeTone(
  actorType: AuditLogRecord["actorType"],
): "accent" | "info" | "neutral" | "warn" {
  switch (actorType) {
    case "platform_admin":
      return "accent";
    case "tenant_admin":
      return "info";
    case "partner_api_key":
    case "ops_user":
      return "warn";
    case "system":
      return "neutral";
    default:
      return "info";
  }
}

export default function HomePage() {
  const { t } = useTranslation();
  const router = useRouter();
  const client = usePlatformAdminClient();
  const [snapshot, setSnapshot] = useState<HomeSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const copy = {
    title: t("home.page.title"),
    subtitle: (count: number) => t("home.page.subtitle", { count }),
    openAll: t("home.page.openAll"),
    openAudit: t("home.page.openAudit"),
    loading: t("home.page.loading"),
    noSnapshot: t("home.page.noSnapshot"),
    loadErrorTitle: t("home.page.loadErrorTitle"),
    quickLinksTitle: t("home.page.quickLinksTitle"),
    todayTitle: t("home.page.todayTitle"),
    todaySubtitle: t("home.page.todaySubtitle"),
    recentTitle: t("home.page.recentTitle"),
    kpiTenants: t("home.tenants.title"),
    kpiPartners: t("home.partners.title"),
    kpiDrivers: t("home.fleet.title"),
    kpiRecon: t("home.payments.title"),
    partnerReadiness: (count: number) =>
      t("home.kpi.partnerReadiness", { count }),
    driverDelta: (count: number) => t("home.kpi.driverDelta", { count }),
    driverSub: (eligible: number, total: number) =>
      t("home.kpi.driverSub", { eligible, total }),
    reconDelta: (partner: number, forwarded: number) =>
      t("home.kpi.reconDelta", { partner, forwarded }),
    reconSub: (count: number) => t("home.kpi.reconSub", { count }),
    noAudit: t("home.page.noAudit"),
    noTodos: t("home.page.noTodos"),
    auditTime: t("home.audit.time"),
    auditActorType: t("home.audit.actorType"),
    auditModule: t("home.audit.module"),
    auditAction: t("home.audit.action"),
    auditActor: t("home.audit.actor"),
    auditRequest: t("home.audit.request"),
    routes: HOME_SHORTCUT_ROUTES.map((route) => ({
      ...route,
      label: t(route.labelKey),
    })),
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
    const platformAlerts =
      observability?.alerts.filter(
        (
          alert: NonNullable<
            OperationalObservabilitySnapshot["alerts"]
          >[number],
        ) => alert.routes.includes("platform"),
      ) ?? [];
    const unresolvedIssues = issues.filter(
      (issue) => issue.status !== "resolved",
    );
    const bankPartners = partners.filter(
      (partner) =>
        Boolean(partner.bankCode) ||
        partner.businessDispatchSubtype.startsWith("credit_card"),
    ).length;
    const hotelPartners = partners.filter((partner) =>
      partner.businessDispatchSubtype.includes("hotel"),
    ).length;
    const enterprisePartners = partners.filter((partner) =>
      partner.businessDispatchSubtype.includes("enterprise"),
    ).length;

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
      bankPartners,
      hotelPartners,
      enterprisePartners,
      openIssues: unresolvedIssues.length,
      partnerIssues: unresolvedIssues.filter(
        (issue) => issue.source === "finance_manual",
      ).length,
      forwardedIssues: unresolvedIssues.filter(
        (issue) => issue.source === "forwarder_auto",
      ).length,
      activeDrivers: observability?.driverState.availableDrivers ?? 0,
      driverEligible: observability?.driverState.dispatchEligibleDrivers ?? 0,
      totalDrivers: observability?.driverState.totalDrivers ?? 0,
      staleDrivers: observability?.driverState.staleLocationDrivers ?? 0,
      criticalAlerts: platformAlerts.filter(
        (alert: PlatformAlert) => alert.state === "critical",
      ).length,
    };
  }, [snapshot]);

  const governanceQueue = useMemo(() => {
    if (!snapshot) {
      return [];
    }

    const alerts: PlatformAlert[] =
      snapshot.observability?.alerts
        .filter((alert: PlatformAlert) => alert.routes.includes("platform"))
        .sort(
          (left: PlatformAlert, right: PlatformAlert) =>
            ALERT_STATE_PRIORITY[
              left.state as keyof typeof ALERT_STATE_PRIORITY
            ] -
            ALERT_STATE_PRIORITY[
              right.state as keyof typeof ALERT_STATE_PRIORITY
            ],
        ) ?? [];
    const tokenAlert =
      alerts.find((alert: PlatformAlert) =>
        alert.key.toLowerCase().includes("bgmt"),
      ) ??
      alerts.find((alert: PlatformAlert) =>
        alert.key.toLowerCase().includes("token"),
      ) ??
      alerts[0];
    const syncAlert =
      alerts.find((alert: PlatformAlert) =>
        alert.key.toLowerCase().includes("gocab"),
      ) ??
      alerts.find((alert: PlatformAlert) =>
        alert.key.toLowerCase().includes("sync"),
      ) ??
      alerts[1];
    const rollbackTenant =
      snapshot.tenants.find((tenant) => tenant.code === "NTU_HOSP") ??
      snapshot.tenants.find((tenant) => tenant.status === "rollback_hold");

    return [
      tokenAlert
        ? {
            id: `alert-${tokenAlert.key}`,
            tone: alertTone(tokenAlert.state),
            icon: "warn",
            title: t("home.banner.tokenExpiry.title"),
            description: t("home.banner.tokenExpiry.desc", {
              value: String(tokenAlert.measuredValue),
              observedAt: formatDateTime(tokenAlert.observedAt),
            }),
            href: "/adapter-registry",
            actionLabel: t("home.banner.tokenExpiry.action"),
            actionVariant: "primary",
          }
        : null,
      syncAlert
        ? {
            id: `alert-${syncAlert.key}`,
            tone: "warn" as const,
            icon: "warn",
            title: t("home.banner.syncFailed.title"),
            description: t("home.banner.syncFailed.desc"),
            href: "/adapter-registry",
            actionLabel: t("home.banner.syncFailed.action"),
            actionVariant: "secondary",
          }
        : null,
      rollbackTenant
        ? {
            id: `tenant-${rollbackTenant.id}`,
            tone: "info" as const,
            icon: "info",
            title: t("home.banner.rollback.title", {
              tenantCode: rollbackTenant.code,
            }),
            description: t("home.banner.rollback.desc"),
            href: `/tenants/${rollbackTenant.id}`,
            actionLabel: t("home.banner.rollback.action"),
            actionVariant: "secondary",
          }
        : null,
    ].filter(Boolean) as GovernanceQueueItem[];
  }, [snapshot, t]);

  const recentAudit =
    snapshot?.audit
      .slice()
      .sort(
        (left, right) =>
          new Date(right.createdAt).getTime() -
          new Date(left.createdAt).getTime(),
      )
      .slice(0, 5) ?? [];
  const unresolvedIssueHint =
    snapshot?.issues
      .filter((issue) => issue.status !== "resolved")
      .slice(0, 3)
      .map((issue) => issue.issueId)
      .join(", ") || undefined;
  const governanceItemCount = governanceQueue.length;
  const showLoadingState = loading && !snapshot;
  const auditColumns: CanvasTableColumn<AuditTableRow>[] = [
    {
      h: copy.auditTime,
      w: 180,
      mono: true,
      r: (row) => formatDateTime(row.createdAt),
    },
    {
      h: copy.auditActorType,
      w: 148,
      r: (row) => (
        <CanvasPill theme={th} tone={actorTypeTone(row.actorType)} dot>
          {row.actorType}
        </CanvasPill>
      ),
    },
    {
      h: copy.auditModule,
      w: 136,
      r: (row) => <span style={moduleCellStyle}>{row.moduleName}</span>,
    },
    {
      h: copy.auditAction,
      w: 184,
      r: (row) => <span style={actionCellStyle}>{row.actionName}</span>,
    },
    {
      h: copy.auditActor,
      r: (row) => (
        <div style={actorCellStyle}>
          <span style={actorPrimaryStyle}>
            {row.actorId ?? t("home.audit.systemActor")}
          </span>
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
                value={formatCount(metrics.activeTenants)}
                sub={t("home.kpi.tenantsSub", {
                  pilot: formatCount(metrics.pilotTenants),
                  sandbox: formatCount(metrics.sandboxTenants),
                })}
                delta={
                  metrics.rollbackTenants > 0
                    ? t("home.kpi.tenantsDelta", {
                        count: formatCount(metrics.rollbackTenants),
                      })
                    : undefined
                }
                deltaTone={metrics.rollbackTenants > 0 ? "down" : "neutral"}
              />
              <CanvasKPI
                theme={th}
                label={copy.kpiPartners}
                value={formatCount(metrics.partnerEntries)}
                sub={t("home.kpi.partnersSub", {
                  bank: formatCount(metrics.bankPartners),
                  hotelEnterprise: formatCount(
                    metrics.hotelPartners + metrics.enterprisePartners,
                  ),
                })}
                delta={copy.partnerReadiness(metrics.partnerAttention)}
                deltaTone={metrics.partnerAttention > 0 ? "neutral" : "up"}
              />
              <CanvasKPI
                theme={th}
                label={copy.kpiDrivers}
                value={formatCount(metrics.activeDrivers)}
                sub={copy.driverSub(
                  metrics.driverEligible,
                  metrics.totalDrivers,
                )}
                delta={
                  metrics.staleDrivers > 0
                    ? copy.driverDelta(metrics.staleDrivers)
                    : t("home.kpi.driversStable")
                }
                deltaTone={metrics.staleDrivers > 0 ? "down" : "up"}
              />
              <CanvasKPI
                theme={th}
                label={copy.kpiRecon}
                value={formatCount(metrics.openIssues)}
                delta={
                  metrics.openIssues > 0
                    ? copy.reconDelta(
                        metrics.partnerIssues,
                        metrics.forwardedIssues,
                      )
                    : undefined
                }
                deltaTone={metrics.openIssues > 0 ? "neutral" : "up"}
                sub={copy.reconSub(metrics.criticalAlerts)}
                hint={unresolvedIssueHint ?? t("home.kpi.reconHintEmpty")}
              />
            </div>

            <div style={sectionGridStyle}>
              <div style={sectionMainStyle}>
                <CanvasCard
                  theme={th}
                  title={copy.todayTitle}
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
                      governanceQueue.map((item) => (
                        <CanvasBanner
                          key={item.id}
                          theme={th}
                          tone={item.tone}
                          icon={item.icon}
                          title={item.title}
                          body={item.description}
                          actions={
                            <CanvasBtn
                              theme={th}
                              variant={item.actionVariant}
                              size="sm"
                              onClick={() => router.push(item.href)}
                            >
                              {item.actionLabel}
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
                <CanvasCard theme={th} title={copy.quickLinksTitle}>
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
                          <strong style={quickLinkLabelStyle}>
                            {route.label}
                          </strong>
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
              title={copy.recentTitle}
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
