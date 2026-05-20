import Link from "next/link";
import { notFound } from "next/navigation";
import type {
  AuditLogRecord,
  IncidentRecord,
  IncidentTimelineEntry,
  OwnedOrderRecord,
  ServiceRecoveryActionRecord,
} from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { formatOpsCodeLabel, getOpsLabel } from "@/lib/localized-labels";
import { getServerLocale } from "@/lib/server-locale";
import { t, type Locale } from "@/lib/translations";
import {
  CanvasBanner as Banner,
  CanvasBtn as Btn,
  CanvasCard as Card,
  CanvasDL as DL,
  CanvasField as Field,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasShell as Shell,
  CanvasIcon,
  Timeline,
  buildCanvasTheme,
  type CanvasShellNavItem,
  type CanvasTheme,
  type CanvasTone,
} from "@drts/ui-web";
import type { ManagementTone, TimelineItem } from "@drts/ui-web";

type IncidentDetailPageProps = {
  params: Promise<{
    incidentId: string;
  }>;
};

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

async function resolveOrFallback<T>(
  loader: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await loader();
  } catch {
    return fallback;
  }
}

function formatDateTime(locale: Locale, value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "UTC",
  })
    .format(new Date(value))
    .replace(",", "");
}

function formatShortDateTime(locale: Locale, value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  })
    .format(new Date(value))
    .replace(",", "");
}

function formatIncidentAge(locale: Locale, value: string | null | undefined) {
  if (!value) {
    return locale === "en" ? "Time not recorded" : "尚未記錄時間";
  }

  const deltaMinutes = Math.max(
    0,
    Math.round((Date.now() - new Date(value).getTime()) / (1000 * 60)),
  );

  if (deltaMinutes < 60) {
    return locale === "en"
      ? `${deltaMinutes} min ago`
      : `${deltaMinutes} 分鐘前`;
  }

  const deltaHours = Math.round(deltaMinutes / 60);
  return locale === "en" ? `${deltaHours} hr ago` : `${deltaHours} 小時前`;
}

function actionLinkStyle(
  theme: CanvasTheme,
  variant: "primary" | "secondary" | "ghost" = "secondary",
) {
  if (variant === "primary") {
    return {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "6px",
      height: "28px",
      padding: "5px 10px",
      borderRadius: "7px",
      background: theme.accent,
      color: "#ffffff",
      border: `1px solid ${theme.accent}`,
      fontSize: "12px",
      fontWeight: 500,
      lineHeight: 1,
      textDecoration: "none",
    } as const;
  }

  if (variant === "ghost") {
    return {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "6px",
      height: "28px",
      padding: "5px 10px",
      borderRadius: "7px",
      background: "transparent",
      color: theme.textMuted,
      border: "1px solid transparent",
      fontSize: "12px",
      fontWeight: 500,
      lineHeight: 1,
      textDecoration: "none",
    } as const;
  }

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    height: "28px",
    padding: "5px 10px",
    borderRadius: "7px",
    background: theme.surface,
    color: theme.text,
    border: `1px solid ${theme.border}`,
    fontSize: "12px",
    fontWeight: 500,
    lineHeight: 1,
    textDecoration: "none",
  } as const;
}

function getStatusTone(status: IncidentRecord["status"]): CanvasTone {
  if (status === "resolved" || status === "closed") {
    return "success";
  }
  if (status === "open" || status === "investigating") {
    return "warn";
  }
  return "info";
}

function getSeverityTone(severity: IncidentRecord["severity"]): CanvasTone {
  if (severity === "critical" || severity === "high") {
    return "danger";
  }
  if (severity === "medium") {
    return "warn";
  }
  return "info";
}

function getTimelineTone(action: string): ManagementTone {
  if (action === "incident_closed" || action === "incident_resolved") {
    return "success";
  }
  if (
    action === "severity_escalated" ||
    action === "dispatch_exception_handoff" ||
    action === "incident_hold"
  ) {
    return "danger";
  }
  if (action === "escalation_target_set" || action === "complaint_linked") {
    return "warning";
  }
  if (action === "service_recovery_action") {
    return "info";
  }
  return "accent";
}

function getTenantLabel(order: OwnedOrderRecord | null) {
  if (!order) {
    return null;
  }

  return (
    order.tenantId ??
    order.partnerEntrySlug ??
    order.partnerId ??
    order.orderSource
  );
}

function buildShellNav(locale: Locale): CanvasShellNavItem[] {
  return [
    {
      divider: locale === "en" ? "Workspaces" : "工作面",
    },
    {
      key: "dashboard",
      href: "/dashboard",
      icon: "dashboard",
      label: t("nav.dashboard", locale),
    },
    {
      divider: locale === "en" ? "Live Ops" : "即時派遣",
    },
    {
      key: "dispatch",
      href: "/dispatch",
      icon: "dispatch",
      label: t("nav.dispatch", locale),
      matchPaths: ["/dispatch"],
    },
    {
      key: "callcenter",
      href: "/callcenter",
      icon: "callcenter",
      label: t("nav.callcenter", locale),
    },
    {
      divider: locale === "en" ? "Casework" : "案件處理",
    },
    {
      key: "complaints",
      href: "/complaints",
      icon: "complaints",
      label: t("nav.complaints", locale),
    },
    {
      key: "incidents",
      href: "/incidents",
      icon: "incidents",
      label: t("nav.incidents", locale),
      matchPaths: ["/incidents"],
    },
    {
      divider: locale === "en" ? "Monitoring" : "營運監控",
    },
    {
      key: "reports",
      href: "/reports",
      icon: "reports",
      label: t("nav.reports", locale),
    },
    {
      key: "revenue",
      href: "/revenue",
      icon: "revenue",
      label: t("nav.revenue", locale),
    },
    {
      key: "attendance",
      href: "/attendance",
      icon: "attendance",
      label: t("nav.attendance", locale),
    },
    {
      divider: locale === "en" ? "Registry" : "主資料",
    },
    {
      key: "drivers",
      href: "/drivers",
      icon: "fleet",
      label: t("nav.drivers", locale),
    },
    {
      key: "vehicles",
      href: "/vehicles",
      icon: "vehicles",
      label: t("nav.vehicles", locale),
    },
    {
      key: "contracts",
      href: "/contracts",
      icon: "contracts",
      label: t("nav.contracts", locale),
    },
    {
      key: "feature-flags",
      href: "/feature-flags",
      icon: "flags",
      label: t("nav.featureFlags", locale),
    },
  ];
}

function buildRelatedLink(
  href: string,
  label: string,
  value: string,
  variant: "primary" | "secondary" | "ghost" = "secondary",
) {
  return (
    <Link href={href} style={actionLinkStyle(theme, variant)}>
      <CanvasIcon name="ext" size={12} />
      <span>
        {label} {value}
      </span>
    </Link>
  );
}

export default async function IncidentDetailPage({
  params,
}: IncidentDetailPageProps) {
  const [{ incidentId }, locale, client] = await Promise.all([
    params,
    getServerLocale(),
    getServerOpsClient(),
  ]);

  const incident = await resolveOrFallback(
    () => client.getIncident(incidentId),
    null as IncidentRecord | null,
  );

  if (!incident) {
    notFound();
  }

  const [timelineEntries, recoveryEntries, relatedOrder, auditLogs] =
    await Promise.all([
      resolveOrFallback(
        () => client.getIncidentTimeline(incidentId),
        [] as IncidentTimelineEntry[],
      ),
      resolveOrFallback(
        () => client.getServiceRecoveryActions(incidentId),
        incident.serviceRecoveryActions ??
          ([] as ServiceRecoveryActionRecord[]),
      ),
      incident.relatedOrderId
        ? resolveOrFallback(
            () => client.getOrder(incident.relatedOrderId as string),
            null as OwnedOrderRecord | null,
          )
        : Promise.resolve(null as OwnedOrderRecord | null),
      resolveOrFallback(() => client.listAuditLogs(), [] as AuditLogRecord[]),
    ]);

  const tenantLabel = getTenantLabel(relatedOrder);
  const latestAudit =
    [...auditLogs]
      .filter(
        (entry) =>
          entry.resourceType === "incident" &&
          entry.resourceId === incident.incidentId,
      )
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )[0] ?? null;

  const timelineItems: TimelineItem[] = [...timelineEntries]
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    )
    .map((entry) => ({
      id: entry.entryId,
      title: formatOpsCodeLabel(locale, entry.action),
      detail: entry.note,
      timestamp: formatShortDateTime(locale, entry.createdAt),
      tone: getTimelineTone(entry.action),
      eyebrow: entry.actor,
      supportingContent:
        latestAudit?.requestId && latestAudit.createdAt === entry.createdAt ? (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              color: "#94a3b8",
              fontSize: "12px",
            }}
          >
            <CanvasIcon name="audit" size={12} />
            {latestAudit.requestId}
          </span>
        ) : null,
    }));

  const recoveryItems =
    recoveryEntries.length > 0
      ? [...recoveryEntries]
          .sort(
            (a, b) =>
              new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
          )
          .map((action) => ({
            k: `${formatShortDateTime(locale, action.createdAt)} · ${t(
              `incidents.serviceRecovery.${action.actionType}` as never,
              locale,
            )}`,
            v: (
              <div
                style={{
                  display: "grid",
                  gap: "6px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    flexWrap: "wrap",
                  }}
                >
                  <Pill theme={theme} tone="success" dot>
                    {locale === "en" ? "Recorded" : "已記錄"}
                  </Pill>
                  <span>{action.note}</span>
                </div>
                <span style={{ color: theme.textMuted, fontSize: "12px" }}>
                  {action.actor}
                </span>
              </div>
            ),
          }))
      : [
          {
            k: locale === "en" ? "Recovery" : "恢復",
            v: t("incidents.serviceRecovery.empty", locale),
          },
        ];

  const relatedItems = [
    {
      k: locale === "en" ? "Complaint" : "客訴",
      v: incident.relatedComplaintCaseNo
        ? buildRelatedLink(
            `/complaints?caseNo=${encodeURIComponent(
              incident.relatedComplaintCaseNo,
            )}`,
            getOpsLabel(locale, "complaint"),
            incident.relatedComplaintCaseNo,
          )
        : "—",
    },
    {
      k: locale === "en" ? "Order" : "訂單",
      v: incident.relatedOrderId
        ? buildRelatedLink(
            `/dispatch?orderId=${encodeURIComponent(incident.relatedOrderId)}`,
            getOpsLabel(locale, "order"),
            incident.relatedOrderId,
          )
        : "—",
      mono: !incident.relatedOrderId,
    },
    {
      k: locale === "en" ? "Tenant" : "租戶",
      v: tenantLabel ?? "—",
      mono: Boolean(tenantLabel),
    },
    {
      k: locale === "en" ? "Audit" : "稽核",
      v: latestAudit ? (
        <div style={{ display: "grid", gap: "4px" }}>
          <span
            style={{
              fontFamily: theme.monoFamily,
              fontSize: "11.5px",
              color: theme.text,
            }}
          >
            {latestAudit.requestId}
          </span>
          <span style={{ color: theme.textMuted, fontSize: "12px" }}>
            {formatShortDateTime(locale, latestAudit.createdAt)}
          </span>
        </div>
      ) : (
        "—"
      ),
    },
  ];

  const summaryItems = [
    {
      k: locale === "en" ? "Occurred" : "發生時間",
      v: formatDateTime(locale, incident.occurredAt ?? incident.createdAt),
      mono: true,
    },
    {
      k: locale === "en" ? "Location" : "地點",
      v: incident.location ?? "—",
    },
    {
      k: locale === "en" ? "Driver" : "司機",
      v: incident.relatedDriverId ?? "—",
      mono: Boolean(incident.relatedDriverId),
    },
    {
      k: locale === "en" ? "Vehicle" : "車輛",
      v: incident.relatedVehicleId ?? "—",
      mono: Boolean(incident.relatedVehicleId),
    },
    {
      k: locale === "en" ? "Order" : "訂單",
      v: incident.relatedOrderId ?? "—",
      mono: Boolean(incident.relatedOrderId),
    },
    {
      k: locale === "en" ? "Tenant" : "租戶",
      v: tenantLabel ?? "—",
      mono: Boolean(tenantLabel),
    },
    {
      k: locale === "en" ? "Reported by" : "回報來源",
      v: incident.reportedBy,
    },
    {
      k: locale === "en" ? "Complaint" : "客訴",
      v: incident.relatedComplaintCaseNo ?? "—",
      mono: Boolean(incident.relatedComplaintCaseNo),
    },
    {
      k: locale === "en" ? "Severity" : "嚴重程度",
      v: (
        <Pill theme={theme} tone={getSeverityTone(incident.severity)} dot>
          {formatOpsCodeLabel(locale, incident.severity)}
        </Pill>
      ),
    },
    {
      k: locale === "en" ? "Status" : "狀態",
      v: (
        <Pill theme={theme} tone={getStatusTone(incident.status)} dot>
          {formatOpsCodeLabel(locale, incident.status)}
        </Pill>
      ),
    },
    {
      k: locale === "en" ? "Escalation" : "升級對象",
      v: incident.escalationTarget
        ? t(
            `incidents.escalationBadge.${incident.escalationTarget}` as never,
            locale,
          )
        : t("incidents.form.escalationNone", locale),
    },
    {
      k: locale === "en" ? "Assignee" : "負責人",
      v: incident.assignedTo ?? "—",
      mono: Boolean(incident.assignedTo),
    },
  ];

  const bannerTone =
    incident.severity === "critical"
      ? "danger"
      : incident.status === "open" || incident.status === "investigating"
        ? "warn"
        : "info";

  const bannerTitle =
    locale === "en"
      ? `${formatOpsCodeLabel(locale, incident.severity)} incident coordination is active`
      : `${formatOpsCodeLabel(locale, incident.severity)}事故協調進行中`;
  const bannerBody = [
    incident.sourceDispatchExceptionOrderId
      ? locale === "en"
        ? `Dispatch exception source ${incident.sourceDispatchExceptionOrderId}`
        : `來自派遣異常 ${incident.sourceDispatchExceptionOrderId}`
      : null,
    incident.location,
    incident.assignedTo
      ? locale === "en"
        ? `Assigned to ${incident.assignedTo}`
        : `目前由 ${incident.assignedTo} 處理`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 40,
        background: theme.bg,
      }}
    >
      <Shell
        theme={theme}
        nav={buildShellNav(locale)}
        active="incidents"
        currentPath={`/incidents/${incident.incidentId}`}
        breadcrumb={[t("nav.incidents", locale), incident.incidentId]}
        searchPlaceholder={
          locale === "en"
            ? "Search order, tenant, or driver..."
            : "搜尋訂單、租戶或司機..."
        }
        brandLabel={t("app.name", locale)}
        brandSubLabel={t("app.sub", locale)}
        env={locale === "en" ? "staging" : "測試"}
        versionLabel="OC"
        avatarLabel="OC"
      >
        <PageHeader
          theme={theme}
          title={`${incident.incidentId} · ${incident.title}`}
          subtitle={[
            formatOpsCodeLabel(locale, incident.category),
            formatOpsCodeLabel(locale, incident.severity),
            formatOpsCodeLabel(locale, incident.status),
            formatDateTime(locale, incident.createdAt),
            formatIncidentAge(
              locale,
              incident.occurredAt ?? incident.createdAt,
            ),
          ].join(" · ")}
          actions={
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                flexWrap: "wrap",
                justifyContent: "flex-end",
              }}
            >
              <Btn theme={theme} icon="phone">
                {locale === "en" ? "Notify police" : "通知警方"}
              </Btn>
              <Btn theme={theme} icon="copy">
                {locale === "en" ? "Notify tenant" : "通報租戶"}
              </Btn>
              <Btn theme={theme} variant="primary" icon="check">
                {locale === "en" ? "Mark contained" : "標記受控"}
              </Btn>
            </div>
          }
        />

        <div
          style={{
            padding: 24,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
              gap: 16,
            }}
          >
            <div
              style={{
                display: "grid",
                gap: 16,
                alignContent: "start",
              }}
            >
              <Banner
                theme={theme}
                tone={bannerTone}
                icon="warn"
                title={bannerTitle}
                body={bannerBody || incident.description}
              />

              <Card
                theme={theme}
                title={locale === "en" ? "Event Summary" : "事件摘要"}
              >
                <DL theme={theme} cols={3} items={summaryItems} />
                <div style={{ height: 14 }} />
                <Field
                  theme={theme}
                  label={t("incidents.form.description", locale)}
                >
                  <div
                    style={{
                      color: theme.text,
                      fontSize: "12.5px",
                      lineHeight: 1.55,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {incident.description}
                  </div>
                </Field>
                {incident.resolutionNote ? (
                  <>
                    <div style={{ height: 12 }} />
                    <Field
                      theme={theme}
                      label={t("incidents.form.resolutionNote", locale)}
                    >
                      <div
                        style={{
                          color: theme.text,
                          fontSize: "12.5px",
                          lineHeight: 1.55,
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {incident.resolutionNote}
                      </div>
                    </Field>
                  </>
                ) : null}
              </Card>

              <Card theme={theme} title={t("incidents.timeline", locale)}>
                <Timeline
                  density="compact"
                  items={timelineItems}
                  emptyState={t("incidents.timelineEmpty", locale)}
                />
              </Card>
            </div>

            <div
              style={{
                display: "grid",
                gap: 16,
                alignContent: "start",
              }}
            >
              <Card
                theme={theme}
                title={t("incidents.serviceRecovery.title", locale)}
                actions={
                  <Link
                    href={`/incidents?incidentId=${encodeURIComponent(incident.incidentId)}`}
                    style={actionLinkStyle(theme, "primary")}
                  >
                    <CanvasIcon name="plus" size={12} />
                    <span>{t("incidents.serviceRecovery.add", locale)}</span>
                  </Link>
                }
              >
                <DL theme={theme} cols={1} items={recoveryItems} />
              </Card>

              <Card theme={theme} title={locale === "en" ? "Related" : "關聯"}>
                <DL theme={theme} cols={1} items={relatedItems} />
              </Card>

              <Card
                theme={theme}
                title={locale === "en" ? "Navigation" : "導覽"}
                padding={14}
              >
                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    flexWrap: "wrap",
                  }}
                >
                  <Link href="/incidents" style={actionLinkStyle(theme)}>
                    <CanvasIcon name="arrow" size={12} />
                    <span>{t("nav.incidents", locale)}</span>
                  </Link>
                  {incident.relatedOrderId
                    ? buildRelatedLink(
                        `/dispatch?orderId=${encodeURIComponent(
                          incident.relatedOrderId,
                        )}`,
                        getOpsLabel(locale, "order"),
                        incident.relatedOrderId,
                        "ghost",
                      )
                    : null}
                  {incident.relatedComplaintCaseNo
                    ? buildRelatedLink(
                        `/complaints?caseNo=${encodeURIComponent(
                          incident.relatedComplaintCaseNo,
                        )}`,
                        getOpsLabel(locale, "complaint"),
                        incident.relatedComplaintCaseNo,
                        "ghost",
                      )
                    : null}
                </div>
              </Card>
            </div>
          </div>
        </div>
      </Shell>
    </div>
  );
}
