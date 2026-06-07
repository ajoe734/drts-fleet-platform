"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps, CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { partnerHasReadinessGaps } from "@/components/partner-governance-shared";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import {
  formatPlatformUiError,
  toPlatformErrorMessage,
} from "@/lib/error-copy";
import { useTranslation } from "@/lib/i18n";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";
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
  label: string;
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
            `DRTS control plane · ${count} governance item(s) need review today.`,
          openAll: "Open all",
          openAudit: "Go to audit",
          loading: "Loading governance snapshot...",
          noSnapshot: "No governance snapshot available yet.",
          loadErrorTitle: "Unable to load governance snapshot",
          quickLinksTitle: "Module shortcuts",
          todayTitle: "Today's governance queue",
          todaySubtitle:
            "Cross-module items where platform governance should intervene.",
          recentTitle:
            "Recent sensitive operations · platform-layer audit trail (24h)",
          kpiTenants: "Active tenants",
          kpiPartners: "Partner entries",
          kpiDrivers: "Active drivers",
          kpiRecon: "Pending reconciliation",
          partnerReadiness: (count: number) => `${count} pending readiness`,
          driverDelta: (count: number) => `${count} stale in dispatch feed`,
          driverSub: (eligible: number, total: number) =>
            `${eligible} dispatch-eligible · ${total} total`,
          reconDelta: (partner: number, forwarded: number) =>
            `${partner} partner · ${forwarded} forwarded`,
          reconSub: (count: number) => `${count} critical platform alert(s)`,
          noAudit: "No audit records found.",
          noTodos: "No platform-routed governance blockers at the moment.",
          auditTime: "Time",
          auditActorType: "Actor type",
          auditModule: "Module",
          auditAction: "Action",
          auditActor: "Actor",
          auditRequest: "Request ID",
          queueCount: (count: number) => `${count} items`,
          tenantKpiSub: (pilot: number, sandbox: number) =>
            `${formatCount(pilot)} pilot · ${formatCount(sandbox)} sandbox`,
          tenantRollback: (count: number) =>
            `${formatCount(count)} rollback hold`,
          partnerMix: (bank: number, other: number) =>
            `${formatCount(bank)} bank · ${formatCount(other)} hotel / enterprise`,
          driverHealthy: "Healthy",
          noOpenIssueIds: "no open issue IDs",
          routes: [
            {
              href: "/tenants",
              label: "Tenants",
              icon: "tenants",
            },
            {
              href: "/partners",
              label: "Partners",
              icon: "partners",
            },
            {
              href: "/pricing",
              label: "Pricing",
              icon: "pricing",
            },
            {
              href: "/payments",
              label: "Payments",
              icon: "payments",
            },
            {
              href: "/fleet",
              label: "Fleet",
              icon: "fleet",
            },
            {
              href: "/audit",
              label: "Audit",
              icon: "audit",
            },
          ] satisfies ShortcutRoute[],
        }
      : {
          title: "平台治理工作首頁",
          subtitle: (count: number) =>
            `平台治理控制台 · 您今日有 ${count} 件需治理事項`,
          openAll: "展開所有",
          openAudit: "前往稽核",
          loading: "載入治理快照中...",
          noSnapshot: "目前沒有可用的治理快照。",
          loadErrorTitle: "無法載入治理快照",
          quickLinksTitle: "模組捷徑",
          todayTitle: "今日治理待辦",
          todaySubtitle: "跨模組需要平台治理人介入",
          recentTitle: "近期高敏感操作 · 平台層稽核軌跡（24 小時）",
          kpiTenants: "活躍租戶",
          kpiPartners: "合作夥伴入口",
          kpiDrivers: "活躍司機",
          kpiRecon: "待結算對帳",
          partnerReadiness: (count: number) => `${count} 筆待補就緒度`,
          driverDelta: (count: number) => `${count} 筆定位過舊`,
          driverSub: (eligible: number, total: number) =>
            `${eligible} 可派 · ${total} 總數`,
          reconDelta: (partner: number, forwarded: number) =>
            `${partner} 合作夥伴 · ${forwarded} 轉發`,
          reconSub: (count: number) => `${count} 筆重大平台告警`,
          noAudit: "目前沒有稽核紀錄。",
          noTodos: "目前沒有路由到平台端的治理阻塞。",
          auditTime: "時間",
          auditActorType: "操作者類型",
          auditModule: "模組",
          auditAction: "動作",
          auditActor: "操作者",
          auditRequest: "請求編號",
          queueCount: (count: number) => `${count} 件`,
          tenantKpiSub: (pilot: number, sandbox: number) =>
            `${formatCount(pilot)} 試點 · ${formatCount(sandbox)} 沙箱`,
          tenantRollback: (count: number) => `${formatCount(count)} 筆回滾保留`,
          partnerMix: (bank: number, other: number) =>
            `${formatCount(bank)} 銀行 · ${formatCount(other)} 飯店／企業`,
          driverHealthy: "正常",
          noOpenIssueIds: "目前無待處理問題編號",
          routes: [
            {
              href: "/tenants",
              label: "租戶",
              icon: "tenants",
            },
            {
              href: "/partners",
              label: "合作夥伴",
              icon: "partners",
            },
            {
              href: "/pricing",
              label: "定價",
              icon: "pricing",
            },
            {
              href: "/payments",
              label: "結算",
              icon: "payments",
            },
            {
              href: "/fleet",
              label: "車隊",
              icon: "fleet",
            },
            {
              href: "/audit",
              label: "稽核",
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
        partners: partners ?? [],
        users: users ?? [],
        issues: issues ?? [],
        audit: audit ?? [],
        observability,
      });
    } catch (e: unknown) {
      setError(
        formatPlatformUiError(
          locale,
          toPlatformErrorMessage(e),
          locale === "en"
            ? "Platform overview unavailable"
            : "平台總覽資料暫時無法載入",
        ),
      );
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
            title:
              locale === "en"
                ? "BGMT dispatch reporting token expires in 6 days"
                : "派遣回報憑證將於 6 天內到期",
            description:
              locale === "en"
                ? `Measured ${tokenAlert.measuredValue} at ${formatDateTime(
                    tokenAlert.observedAt,
                  )}. Renew the client credential before reporting completion traffic stalls.`
                : `${formatDateTime(tokenAlert.observedAt)} 量測值 ${tokenAlert.measuredValue}。需先輪替用戶端憑證，否則今日完成單將無法回報。`,
            href: "/adapter-registry",
            actionLabel:
              locale === "en" ? "Open adapter registry" : "前往介接器註冊表",
            actionVariant: "primary",
          }
        : null,
      syncAlert
        ? {
            id: `alert-${syncAlert.key}`,
            tone: "warn" as const,
            icon: "warn",
            title:
              locale === "en"
                ? "GoCab forwarded · 24h sync_failed 4.2%"
                : "GoCab 轉發通道 · 24 小時同步失敗率 4.2%",
            description:
              locale === "en"
                ? `Above the 3% warning threshold. Inspect adapter health and watch manual fallback volume before finance close.`
                : "已超過 3% 警戒值。建議先檢查介接器健康狀態，並持續觀察人工補救量能。",
            href: "/adapter-registry",
            actionLabel: locale === "en" ? "Open adapter" : "查看介接器",
            actionVariant: "secondary",
          }
        : null,
      rollbackTenant
        ? {
            id: `tenant-${rollbackTenant.id}`,
            tone: "info" as const,
            icon: "info",
            title:
              locale === "en"
                ? `${rollbackTenant.code} is in rollback hold`
                : `${rollbackTenant.code} 處於回滾保留`,
            description:
              locale === "en"
                ? "Customer complaint cmp_0894 escalated into inc_0212. Rollout is paused until platform and ops agree on the next move."
                : "已有客訴升級為事故案件，推進已暫停。需由平台與營運共同確認下一步。",
            href: `/tenants/${rollbackTenant.id}`,
            actionLabel: locale === "en" ? "Open tenant" : "查看租戶",
            actionVariant: "secondary",
          }
        : null,
    ].filter(Boolean) as GovernanceQueueItem[];
  }, [locale, snapshot]);

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
  const formatAuditIdentity = (value?: string | null) =>
    value &&
    [
      "system",
      "platform-admin",
      "platform_admin",
      "platform-admin.preview",
    ].includes(value)
      ? formatPlatformCodeLabel(locale, value)
      : (value ?? "—");
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
          {formatPlatformCodeLabel(locale, row.actorType)}
        </CanvasPill>
      ),
    },
    {
      h: copy.auditModule,
      w: 136,
      r: (row) => (
        <span style={moduleCellStyle}>
          {formatPlatformCodeLabel(locale, row.moduleName)}
        </span>
      ),
    },
    {
      h: copy.auditAction,
      w: 184,
      r: (row) => (
        <span style={actionCellStyle}>
          {formatPlatformCodeLabel(locale, row.actionName)}
        </span>
      ),
    },
    {
      h: copy.auditActor,
      r: (row) => (
        <div style={actorCellStyle}>
          <span style={actorPrimaryStyle}>
            {formatAuditIdentity(row.actorId ?? "system")}
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
                sub={copy.tenantKpiSub(
                  metrics.pilotTenants,
                  metrics.sandboxTenants,
                )}
                delta={
                  metrics.rollbackTenants > 0
                    ? copy.tenantRollback(metrics.rollbackTenants)
                    : undefined
                }
                deltaTone={metrics.rollbackTenants > 0 ? "down" : "neutral"}
              />
              <CanvasKPI
                theme={th}
                label={copy.kpiPartners}
                value={formatCount(metrics.partnerEntries)}
                sub={copy.partnerMix(
                  metrics.bankPartners,
                  metrics.hotelPartners + metrics.enterprisePartners,
                )}
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
                    : copy.driverHealthy
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
                hint={unresolvedIssueHint ?? copy.noOpenIssueIds}
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
