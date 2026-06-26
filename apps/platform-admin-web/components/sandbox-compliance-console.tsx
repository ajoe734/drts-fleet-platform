"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import React, {
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type {
  AccidentCaseRecord,
  AccidentTimelineEntry,
  CorrelatedTakeoverCase,
  EvidenceDiscrepancyCase,
  RegulatoryReportFiling,
  SandboxControlledEvidenceExportRecord,
  SandboxEvidenceManifestView,
  SandboxLegalHoldRecord,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  buildCanvasTheme,
  type CanvasTone,
} from "@drts/ui-web";

import {
  formatDateTime,
  useAsyncData,
  usePlatformAdminClient,
} from "@/lib/admin-client";
import {
  accidentSeverityTone,
  buildTripComplianceChecks,
  confidenceTone,
  custodyStateTone,
  exportStatusTone,
  findInvestigationForDiscrepancy,
  findTakeoverReview,
  focusBannerText,
  investigationHref,
  investigationStatusTone,
  investigationTimelineHref,
  legalHoldStatusTone,
  loadSandboxComplianceOverview,
  loadSandboxInvestigationDetail,
  manifestHref,
  reportStatusTone,
  sourceLabel,
  sourceTone,
  tripDiscrepancies,
  tripHref,
  tripInvestigations,
  tripTakeoverReviews,
  truncateHash,
  uniqueManifestIds,
} from "@/lib/sandbox-compliance";
import { PLATFORM_ADMIN_BOOTSTRAP_ACTOR_ID } from "@/lib/platform-admin-client-factory";

type ShellNavKey =
  | "dashboard"
  | "trips"
  | "takeover"
  | "accident"
  | "timeline"
  | "manifest"
  | "export"
  | "legalhold"
  | "reportjobs"
  | "regulator";

type ShellContext = {
  tripId?: string | null;
  caseId?: string | null;
  manifestId?: string | null;
};

type ScopeHint = {
  label: string;
  scope: string;
  blocked?: string;
};

type ExportFormState = {
  manifestId: string;
  recipientLabel: string;
  recipientScope: string;
  reason: string;
};

type HoldFormState = {
  caseId: string;
  scopeSummary: string;
  reason: string;
  expiresAt: string;
};

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });

const pageBodyStyle: CSSProperties = {
  padding: 24,
  minHeight: "100%",
  boxSizing: "border-box",
};

const shellWrapStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 16,
  alignItems: "flex-start",
};

const railStyle: CSSProperties = {
  flex: "0 0 248px",
  width: 248,
  position: "sticky",
  top: 24,
  alignSelf: "flex-start",
};

const contentStyle: CSSProperties = {
  flex: "1 1 760px",
  minWidth: 0,
  display: "grid",
  gap: 16,
};

const pageStackStyle: CSSProperties = {
  display: "grid",
  gap: 16,
};

const autoGridStyle = (minWidth: string): CSSProperties => ({
  display: "grid",
  gridTemplateColumns: `repeat(auto-fit, minmax(${minWidth}, 1fr))`,
  gap: 16,
  alignItems: "start",
});

const cardStackStyle: CSSProperties = {
  display: "grid",
  gap: 12,
};

const emptyStateStyle: CSSProperties = {
  padding: 32,
  borderRadius: 12,
  border: `1px dashed ${theme.border}`,
  background: theme.surfaceLo,
  color: theme.textMuted,
  textAlign: "center",
  fontSize: 12.5,
  lineHeight: 1.6,
};

const linkStyle: CSSProperties = {
  color: theme.accent,
  textDecoration: "none",
  fontWeight: 600,
};

const monoStyle: CSSProperties = {
  fontFamily: theme.monoFamily,
  fontSize: 11.5,
};

const mutedStyle: CSSProperties = {
  color: theme.textMuted,
  fontSize: 12,
  lineHeight: 1.5,
};

const fieldGridStyle: CSSProperties = {
  display: "grid",
  gap: 12,
};

const fieldLabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: theme.textMuted,
  textTransform: "uppercase",
  letterSpacing: 0.08,
};

const inputStyle: CSSProperties = {
  width: "100%",
  borderRadius: 10,
  border: `1px solid ${theme.border}`,
  background: theme.surface,
  color: theme.text,
  padding: "10px 12px",
  fontSize: 13,
  fontFamily: theme.fontFamily,
  boxSizing: "border-box",
};

const textareaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: 96,
  resize: "vertical",
};

const checkboxRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  fontSize: 12.5,
  color: theme.textMuted,
};

const scopeListStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const timelineListStyle: CSSProperties = {
  display: "grid",
  gap: 12,
};

const timelineEntryStyle: CSSProperties = {
  border: `1px solid ${theme.border}`,
  borderRadius: 12,
  background: theme.surface,
  padding: 14,
  display: "grid",
  gap: 10,
};

const evidenceChipRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

function humanizeToken(value: string | null | undefined) {
  if (!value) {
    return "—";
  }
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function compactDate(value: string | null | undefined) {
  return value ? formatDateTime(value) : "—";
}

function safeHref(value: string) {
  return encodeURI(value);
}

function statusPill(label: ReactNode, tone: CanvasTone, dot = true): ReactNode {
  return (
    <CanvasPill theme={theme} tone={tone} dot={dot}>
      {label}
    </CanvasPill>
  );
}

function timelineSourceLabel(entry: AccidentTimelineEntry) {
  switch (entry.sourceSystem) {
    case "system_derived":
      return "System derived";
    case "accident_case":
      return "Accident case";
    default:
      return sourceLabel(entry.sourceSystem);
  }
}

function timelineSourceTone(entry: AccidentTimelineEntry): CanvasTone {
  switch (entry.sourceSystem) {
    case "system_derived":
      return "info";
    case "accident_case":
      return "neutral";
    default:
      return sourceTone(entry.sourceSystem);
  }
}

function scopeCard(title: string, hints: ScopeHint[]) {
  return (
    <CanvasCard theme={theme} title={title} subtitle="required scopes">
      <div style={scopeListStyle}>
        {hints.map((hint) => (
          <div
            key={`${hint.label}-${hint.scope}`}
            style={{
              display: "grid",
              gap: 6,
              paddingBottom: 10,
              borderBottom: `1px solid ${theme.border}`,
            }}
          >
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                alignItems: "center",
              }}
            >
              <strong style={{ fontSize: 12.5 }}>{hint.label}</strong>
              <CanvasPill theme={theme} tone="neutral">
                {hint.scope}
              </CanvasPill>
            </div>
            {hint.blocked ? <div style={mutedStyle}>{hint.blocked}</div> : null}
          </div>
        ))}
      </div>
    </CanvasCard>
  );
}

function navLinkStyles(active: boolean, disabled: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 10,
    border: `1px solid ${active ? theme.accentBorder : theme.border}`,
    background: active ? theme.accentBg : theme.surface,
    color: disabled ? theme.textDim : active ? theme.accent : theme.text,
    textDecoration: "none",
    fontSize: 12.5,
    fontWeight: active ? 700 : 600,
    opacity: disabled ? 0.6 : 1,
  };
}

function InlineLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={safeHref(href)} style={linkStyle}>
      {children}
    </Link>
  );
}

function PageState({
  loading,
  error,
  empty,
  children,
}: {
  loading: boolean;
  error: string | null;
  empty?: string | null;
  children: ReactNode;
}) {
  if (loading) {
    return (
      <CanvasCard theme={theme}>
        <div style={emptyStateStyle}>Loading compliance data…</div>
      </CanvasCard>
    );
  }

  if (error) {
    return (
      <CanvasBanner
        theme={theme}
        tone="danger"
        icon="warn"
        title="Compliance data failed to load"
        body={error}
      />
    );
  }

  if (empty) {
    return (
      <CanvasCard theme={theme}>
        <div style={emptyStateStyle}>{empty}</div>
      </CanvasCard>
    );
  }

  return <>{children}</>;
}

function ComplianceConsoleFrame({
  active,
  title,
  subtitle,
  actions,
  context,
  scopeHints,
  children,
}: {
  active: ShellNavKey;
  title: ReactNode;
  subtitle: ReactNode;
  actions?: ReactNode;
  context?: ShellContext;
  scopeHints?: ScopeHint[];
  children: ReactNode;
}) {
  const tripId = context?.tripId ?? null;
  const caseId = context?.caseId ?? null;
  const manifestId = context?.manifestId ?? null;

  const sections = [
    {
      label: "調查 · Investigation",
      items: [
        {
          key: "dashboard" as const,
          label: "合規總覽 · Dashboard",
          href: "/platform-admin/compliance",
        },
        {
          key: "trips" as const,
          label: "行程合規 · Trip Compliance",
          href: tripId ? tripHref(tripId) : null,
        },
        {
          key: "takeover" as const,
          label: "接管審查 · Takeover Review",
          href: "/platform-admin/investigations?view=takeover",
        },
        {
          key: "accident" as const,
          label: "事故案件 · Accident Cases",
          href: caseId
            ? investigationHref(caseId)
            : "/platform-admin/investigations",
        },
      ],
    },
    {
      label: "證據 · Evidence",
      items: [
        {
          key: "timeline" as const,
          label: "同步時間軸 · Timeline",
          href: caseId ? investigationTimelineHref(caseId) : null,
        },
        {
          key: "manifest" as const,
          label: "證據清單 · Manifest",
          href: manifestId ? manifestHref(manifestId) : null,
        },
        {
          key: "export" as const,
          label: "受控匯出 · Controlled Export",
          href: "/platform-admin/evidence/exports",
        },
        {
          key: "legalhold" as const,
          label: "法律保留 · Legal Hold",
          href: "/platform-admin/evidence/legal-holds",
        },
      ],
    },
    {
      label: "監理 · Regulatory",
      items: [
        {
          key: "reportjobs" as const,
          label: "報表作業 · Report Jobs",
          href: "/platform-admin/regulatory-reports",
        },
        {
          key: "regulator" as const,
          label: "主管機關檢視 · Regulator",
          href: "/platform-admin/regulatory-reports?view=regulator",
        },
      ],
    },
  ];

  return (
    <div style={pageBodyStyle}>
      <div style={shellWrapStyle}>
        <aside style={railStyle}>
          <CanvasCard
            theme={theme}
            title="Sandbox Compliance Console"
            subtitle="platform-admin route group"
          >
            <div style={cardStackStyle}>
              <div style={mutedStyle}>
                Historical `compliance-screens.jsx` restored to HEAD and used as
                the visual source for this inner console.
              </div>
              {sections.map((section) => (
                <div key={section.label} style={cardStackStyle}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: theme.textDim,
                      textTransform: "uppercase",
                      letterSpacing: 0.1,
                    }}
                  >
                    {section.label}
                  </div>
                  <div style={cardStackStyle}>
                    {section.items.map((item) => {
                      const isActive = active === item.key;
                      const disabled = !item.href;
                      const content = (
                        <span style={navLinkStyles(isActive, disabled)}>
                          <span>{item.label}</span>
                          {isActive ? (
                            <CanvasPill theme={theme} tone="accent">
                              Live
                            </CanvasPill>
                          ) : null}
                        </span>
                      );

                      if (!item.href) {
                        return (
                          <span
                            key={item.key}
                            style={{ cursor: "not-allowed" }}
                          >
                            {content}
                          </span>
                        );
                      }

                      return (
                        <Link
                          key={item.key}
                          href={safeHref(item.href)}
                          style={{ textDecoration: "none" }}
                        >
                          {content}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
              <CanvasBanner
                theme={theme}
                tone="info"
                icon="info"
                title="Scope-driven actions"
                body="Mutation buttons remain tied to backend authority, workflow state, and four-eyes guards."
              />
            </div>
          </CanvasCard>
        </aside>
        <section style={contentStyle}>
          <CanvasPageHeader
            theme={theme}
            title={title}
            subtitle={subtitle}
            actions={actions}
            sticky={false}
          />
          <div style={pageStackStyle}>
            {scopeHints && scopeHints.length > 0
              ? scopeCard("Authority posture", scopeHints)
              : null}
            {children}
          </div>
        </section>
      </div>
    </div>
  );
}

function useOverviewState() {
  return useAsyncData(
    async (client) => loadSandboxComplianceOverview(client),
    [],
  );
}

function useInvestigationState(caseId: string) {
  return useAsyncData(
    async (client) => {
      const [detail, reports] = await Promise.all([
        loadSandboxInvestigationDetail(client, caseId),
        client.listSandboxRegulatoryReports(),
      ]);
      return {
        ...detail,
        reports: reports.items ?? [],
      };
    },
    [caseId],
  );
}

function useManifestState(manifestId: string) {
  return useAsyncData(
    async (client) => {
      const result = await client.getSandboxEvidenceManifest(manifestId);
      return result.item;
    },
    [manifestId],
  );
}

function reportForCase(
  reports: RegulatoryReportFiling[],
  caseId: string | null,
) {
  return reports.find((item) => item.caseId === caseId) ?? null;
}

function holdForManifest(
  holds: SandboxLegalHoldRecord[],
  manifestId: string | null,
) {
  return holds.find(
    (item) => item.manifestId === manifestId && item.status !== "released",
  );
}

function exportRows(
  rows: SandboxControlledEvidenceExportRecord[],
): Array<SandboxControlledEvidenceExportRecord & Record<string, unknown>> {
  return rows.map((row) => ({ ...row }));
}

function holdRows(
  rows: SandboxLegalHoldRecord[],
): Array<SandboxLegalHoldRecord & Record<string, unknown>> {
  return rows.map((row) => ({ ...row }));
}

function reportRows(
  rows: RegulatoryReportFiling[],
): Array<RegulatoryReportFiling & Record<string, unknown>> {
  return rows.map((row) => ({ ...row }));
}

function investigationRows(
  rows: AccidentCaseRecord[],
): Array<AccidentCaseRecord & Record<string, unknown>> {
  return rows.map((row) => ({ ...row }));
}

function takeoverRows(
  rows: CorrelatedTakeoverCase[],
): Array<CorrelatedTakeoverCase & Record<string, unknown>> {
  return rows.map((row) => ({ ...row }));
}

function discrepancyRows(
  rows: EvidenceDiscrepancyCase[],
): Array<EvidenceDiscrepancyCase & Record<string, unknown>> {
  return rows.map((row) => ({ ...row }));
}

function useCurrentParam(name: string) {
  const params = useParams<Record<string, string | string[]>>();
  const raw = params?.[name];
  if (Array.isArray(raw)) {
    return raw[0] ?? "";
  }
  return raw ?? "";
}

export function SandboxComplianceDashboardPage() {
  const { data, loading, error, refresh } = useOverviewState();

  const openInvestigations =
    data?.investigations.filter((item) => item.status !== "closed") ?? [];
  const activeHolds =
    data?.legalHolds.filter((item) => item.status !== "released") ?? [];
  const pendingExports =
    data?.controlledExports.filter(
      (item) => item.status === "pending_approval",
    ) ?? [];
  const evidenceCoverage = data
    ? Math.round(
        (data.investigations.filter((item) => item.evidenceManifestId).length /
          Math.max(data.investigations.length, 1)) *
          100,
      )
    : 0;

  return (
    <ComplianceConsoleFrame
      active="dashboard"
      title="實驗合規總覽 · Compliance Dashboard"
      subtitle="Investigation backlog, takeover review, evidence governance, and regulator-facing filing posture."
      actions={
        <CanvasBtn
          theme={theme}
          variant="secondary"
          onClick={() => void refresh()}
        >
          Refresh
        </CanvasBtn>
      }
      scopeHints={[
        {
          label: "Read compliance snapshot",
          scope: "sandbox.compliance.read",
        },
        {
          label: "Read investigations",
          scope: "sandbox.investigation.read",
        },
        {
          label: "Preview evidence posture",
          scope: "sandbox.evidence.preview",
        },
      ]}
    >
      <PageState
        loading={loading}
        error={error}
        empty={
          data && data.investigations.length === 0
            ? "No sandbox investigations are available yet."
            : null
        }
      >
        <div style={autoGridStyle("180px")}>
          <CanvasCard theme={theme} title="Open investigations">
            <div style={{ fontSize: 28, fontWeight: 700 }}>
              {openInvestigations.length}
            </div>
            <div style={mutedStyle}>Cases not yet closed.</div>
          </CanvasCard>
          <CanvasCard theme={theme} title="Takeover review">
            <div style={{ fontSize: 28, fontWeight: 700 }}>
              {data?.takeoverReviews.length ?? 0}
            </div>
            <div style={mutedStyle}>Correlated takeover records.</div>
          </CanvasCard>
          <CanvasCard theme={theme} title="Evidence coverage">
            <div style={{ fontSize: 28, fontWeight: 700 }}>
              {evidenceCoverage}%
            </div>
            <div style={mutedStyle}>Investigations with linked manifests.</div>
          </CanvasCard>
          <CanvasCard theme={theme} title="Active legal holds">
            <div style={{ fontSize: 28, fontWeight: 700 }}>
              {activeHolds.length}
            </div>
            <div style={mutedStyle}>Released holds excluded.</div>
          </CanvasCard>
        </div>

        <div style={autoGridStyle("360px")}>
          <CanvasCard
            theme={theme}
            title="事故案件 · Accident cases"
            subtitle="Open and recently updated investigations"
            padding={0}
          >
            <CanvasTable
              theme={theme}
              columns={[
                {
                  h: "Case",
                  w: 150,
                  r: (row: AccidentCaseRecord) => (
                    <div style={cardStackStyle}>
                      <InlineLink href={investigationHref(row.caseId)}>
                        <span style={monoStyle}>{row.caseId}</span>
                      </InlineLink>
                      <span style={mutedStyle}>{row.summary ?? "—"}</span>
                    </div>
                  ),
                },
                {
                  h: "Severity",
                  w: 120,
                  r: (row: AccidentCaseRecord) =>
                    statusPill(
                      humanizeToken(row.severity),
                      accidentSeverityTone(row.severity),
                    ),
                },
                {
                  h: "Status",
                  w: 140,
                  r: (row: AccidentCaseRecord) =>
                    statusPill(
                      humanizeToken(row.status),
                      investigationStatusTone(row.status),
                    ),
                },
                {
                  h: "Trip",
                  w: 140,
                  r: (row: AccidentCaseRecord) =>
                    row.orderId ? (
                      <InlineLink href={tripHref(row.orderId)}>
                        {row.orderId}
                      </InlineLink>
                    ) : (
                      "—"
                    ),
                },
              ]}
              rows={investigationRows(openInvestigations.slice(0, 6))}
            />
          </CanvasCard>

          <CanvasCard
            theme={theme}
            title="接管審查 · Takeover review"
            subtitle="Linked takeover records plus discrepancy signals"
            padding={0}
          >
            <CanvasTable
              theme={theme}
              columns={[
                {
                  h: "Takeover",
                  w: 150,
                  r: (row: CorrelatedTakeoverCase) => (
                    <div style={cardStackStyle}>
                      <span style={monoStyle}>
                        {row.correlatedTakeoverCaseId}
                      </span>
                      <span style={mutedStyle}>
                        {row.sourceRecordIds.safetyOperatorTakeoverReportId}
                      </span>
                    </div>
                  ),
                },
                {
                  h: "Trip",
                  w: 130,
                  r: (row: CorrelatedTakeoverCase) =>
                    row.orderId ? (
                      <InlineLink href={tripHref(row.orderId)}>
                        {row.orderId}
                      </InlineLink>
                    ) : (
                      "—"
                    ),
                },
                {
                  h: "Match",
                  w: 120,
                  r: (row: CorrelatedTakeoverCase) =>
                    statusPill(humanizeToken(row.matchedBy), "accent"),
                },
                {
                  h: "Investigation",
                  w: 140,
                  r: (row: CorrelatedTakeoverCase) =>
                    row.investigationLink ? (
                      <InlineLink href={row.investigationLink.route}>
                        {row.investigationLink.resourceId}
                      </InlineLink>
                    ) : (
                      <span style={mutedStyle}>Not linked</span>
                    ),
                },
              ]}
              rows={takeoverRows((data?.takeoverReviews ?? []).slice(0, 6))}
            />
          </CanvasCard>
        </div>

        <div style={autoGridStyle("360px")}>
          <CanvasCard
            theme={theme}
            title="證據治理 · Evidence posture"
            subtitle="Controlled export and legal-hold workflow state"
            padding={0}
          >
            <CanvasTable
              theme={theme}
              columns={[
                {
                  h: "Hold / Export",
                  w: 150,
                  r: (row: Record<string, unknown>) => row.kind as ReactNode,
                },
                {
                  h: "Subject",
                  w: 180,
                  r: (row: Record<string, unknown>) => row.subject as ReactNode,
                },
                {
                  h: "Status",
                  w: 150,
                  r: (row: Record<string, unknown>) => row.status as ReactNode,
                },
              ]}
              rows={[
                ...activeHolds.slice(0, 3).map((item) => ({
                  kind: (
                    <InlineLink href="/platform-admin/evidence/legal-holds">
                      {item.holdId}
                    </InlineLink>
                  ),
                  subject: <span style={monoStyle}>{item.caseId}</span>,
                  status: statusPill(
                    humanizeToken(item.status),
                    legalHoldStatusTone(item.status),
                  ),
                })),
                ...pendingExports.slice(0, 3).map((item) => ({
                  kind: (
                    <InlineLink href="/platform-admin/evidence/exports">
                      {item.exportRequestId}
                    </InlineLink>
                  ),
                  subject: <span style={monoStyle}>{item.manifestId}</span>,
                  status: statusPill(
                    humanizeToken(item.status),
                    exportStatusTone(item.status),
                  ),
                })),
              ]}
            />
          </CanvasCard>

          <CanvasCard
            theme={theme}
            title="監理報表 · Filing queue"
            subtitle="Generated and submitted reports"
            padding={0}
          >
            <CanvasTable
              theme={theme}
              columns={[
                {
                  h: "Report",
                  w: 180,
                  r: (row: RegulatoryReportFiling) => (
                    <span style={monoStyle}>{row.reportId}</span>
                  ),
                },
                {
                  h: "Jurisdiction",
                  w: 120,
                  r: (row: RegulatoryReportFiling) =>
                    humanizeToken(row.jurisdiction),
                },
                {
                  h: "Status",
                  w: 140,
                  r: (row: RegulatoryReportFiling) =>
                    statusPill(
                      humanizeToken(row.status),
                      reportStatusTone(row.status),
                    ),
                },
                {
                  h: "Case",
                  w: 140,
                  r: (row: RegulatoryReportFiling) =>
                    row.caseId ? (
                      <InlineLink href={investigationHref(row.caseId)}>
                        {row.caseId}
                      </InlineLink>
                    ) : (
                      "—"
                    ),
                },
              ]}
              rows={reportRows((data?.regulatoryReports ?? []).slice(0, 6))}
            />
          </CanvasCard>
        </div>
      </PageState>
    </ComplianceConsoleFrame>
  );
}

export function SandboxTripComplianceDetailPage() {
  const tripId = useCurrentParam("tripId");
  const { data, loading, error, refresh } = useOverviewState();

  const investigations = data
    ? tripInvestigations(data.investigations, tripId)
    : [];
  const takeovers = data
    ? tripTakeoverReviews(data.takeoverReviews, tripId)
    : [];
  const discrepancies = data
    ? tripDiscrepancies(data.discrepancies, data.takeoverReviews, tripId)
    : [];
  const investigation = investigations[0] ?? null;
  const manifestId = investigation?.evidenceManifestId ?? null;
  const report = data
    ? reportForCase(data.regulatoryReports, investigation?.caseId ?? null)
    : null;
  const hold = data ? holdForManifest(data.legalHolds, manifestId) : null;
  const relatedExports =
    data?.controlledExports.filter(
      (item) =>
        item.manifestId === manifestId || item.caseId === investigation?.caseId,
    ) ?? [];
  const checks = data
    ? buildTripComplianceChecks({
        tripId,
        investigations: data.investigations,
        takeoverReviews: data.takeoverReviews,
        discrepancies: data.discrepancies,
        legalHolds: data.legalHolds,
      })
    : [];

  return (
    <ComplianceConsoleFrame
      active="trips"
      title={`行程合規 · ${tripId || "Trip compliance"}`}
      subtitle="Trip-centric read model across investigation, takeover correlation, discrepancy treatment, manifest custody, and regulator reporting."
      actions={
        <CanvasBtn
          theme={theme}
          variant="secondary"
          onClick={() => void refresh()}
        >
          Refresh
        </CanvasBtn>
      }
      context={{
        tripId,
        caseId: investigation?.caseId ?? null,
        manifestId,
      }}
      scopeHints={[
        { label: "Read trip compliance", scope: "sandbox.compliance.read" },
        {
          label: "Read linked investigation",
          scope: "sandbox.investigation.read",
        },
        { label: "Preview linked evidence", scope: "sandbox.evidence.preview" },
      ]}
    >
      <PageState
        loading={loading}
        error={error}
        empty={
          data && investigations.length === 0 && takeovers.length === 0
            ? `No compliance-linked trip records were found for ${tripId}.`
            : null
        }
      >
        <div style={autoGridStyle("320px")}>
          <CanvasCard
            theme={theme}
            title="Compliance checks"
            subtitle="derived pass / fail"
          >
            <div style={cardStackStyle}>
              {checks.map((check) => (
                <div
                  key={check.label}
                  style={{
                    display: "grid",
                    gap: 4,
                    paddingBottom: 10,
                    borderBottom: `1px solid ${theme.border}`,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 8,
                      justifyContent: "space-between",
                    }}
                  >
                    <strong style={{ fontSize: 12.5 }}>{check.label}</strong>
                    {statusPill(
                      check.passed ? "Pass" : "Needs review",
                      check.passed ? "success" : "warn",
                    )}
                  </div>
                  <div style={mutedStyle}>{check.detail}</div>
                </div>
              ))}
            </div>
          </CanvasCard>

          <CanvasCard
            theme={theme}
            title="Trip posture"
            subtitle="linked resources"
          >
            <CanvasDL
              theme={theme}
              cols={2}
              items={[
                {
                  k: "Investigation",
                  v: investigation?.caseId ?? "—",
                  mono: true,
                },
                { k: "Manifest", v: manifestId ?? "—", mono: true },
                { k: "Takeovers", v: String(takeovers.length), mono: true },
                {
                  k: "Discrepancies",
                  v: String(discrepancies.length),
                  mono: true,
                },
                {
                  k: "Legal hold",
                  v: hold
                    ? statusPill(
                        humanizeToken(hold.status),
                        legalHoldStatusTone(hold.status),
                      )
                    : "None",
                },
                {
                  k: "Report",
                  v: report
                    ? statusPill(
                        humanizeToken(report.status),
                        reportStatusTone(report.status),
                      )
                    : "None",
                },
              ]}
            />
          </CanvasCard>
        </div>

        <div style={autoGridStyle("320px")}>
          <CanvasCard
            theme={theme}
            title="Linked investigation"
            subtitle="case summary"
          >
            <CanvasDL
              theme={theme}
              cols={2}
              items={[
                {
                  k: "Case",
                  v: investigation?.caseId ? (
                    <InlineLink href={investigationHref(investigation.caseId)}>
                      {investigation.caseId}
                    </InlineLink>
                  ) : (
                    "—"
                  ),
                },
                {
                  k: "Status",
                  v: investigation
                    ? statusPill(
                        humanizeToken(investigation.status),
                        investigationStatusTone(investigation.status),
                      )
                    : "—",
                },
                {
                  k: "Severity",
                  v: investigation
                    ? statusPill(
                        humanizeToken(investigation.severity),
                        accidentSeverityTone(investigation.severity),
                      )
                    : "—",
                },
                { k: "Occurred", v: compactDate(investigation?.occurredAt) },
                {
                  k: "Timeline",
                  v: investigation?.caseId ? (
                    <InlineLink
                      href={investigationTimelineHref(investigation.caseId)}
                    >
                      Open synchronized facts
                    </InlineLink>
                  ) : (
                    "—"
                  ),
                },
                {
                  k: "Manifest",
                  v: manifestId ? (
                    <InlineLink href={manifestHref(manifestId)}>
                      {manifestId}
                    </InlineLink>
                  ) : (
                    "—"
                  ),
                },
              ]}
            />
          </CanvasCard>

          <CanvasCard
            theme={theme}
            title="Takeover & discrepancy detail"
            subtitle="trip-linked correlation signals"
            padding={0}
          >
            <CanvasTable
              theme={theme}
              columns={[
                {
                  h: "Record",
                  w: 150,
                  r: (row: Record<string, unknown>) => row.record as ReactNode,
                },
                {
                  h: "Status",
                  w: 160,
                  r: (row: Record<string, unknown>) => row.status as ReactNode,
                },
                {
                  h: "Notes",
                  w: 260,
                  r: (row: Record<string, unknown>) => row.notes as ReactNode,
                },
              ]}
              rows={[
                ...takeovers.map((item) => ({
                  record: (
                    <span style={monoStyle}>
                      {item.correlatedTakeoverCaseId}
                    </span>
                  ),
                  status: statusPill(humanizeToken(item.matchedBy), "accent"),
                  notes: (
                    <span style={mutedStyle}>
                      safety{" "}
                      {compactDate(item.sourceTimestamps.safetyOccurredAt)}
                    </span>
                  ),
                })),
                ...discrepancies.map((item) => ({
                  record: (
                    <span style={monoStyle}>{item.discrepancyCaseId}</span>
                  ),
                  status: statusPill(
                    `${item.discrepancyTypes.length} discrepancy`,
                    "warn",
                  ),
                  notes: <span style={mutedStyle}>{item.summary}</span>,
                })),
              ]}
            />
          </CanvasCard>
        </div>

        {relatedExports.length > 0 ? (
          <CanvasCard
            theme={theme}
            title="Controlled export posture"
            subtitle="linked queue items"
          >
            <div style={cardStackStyle}>
              {relatedExports.map((item) => (
                <div
                  key={item.exportRequestId}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    paddingBottom: 10,
                    borderBottom: `1px solid ${theme.border}`,
                  }}
                >
                  <div style={cardStackStyle}>
                    <strong style={monoStyle}>{item.exportRequestId}</strong>
                    <span style={mutedStyle}>{item.recipientLabel}</span>
                  </div>
                  {statusPill(
                    humanizeToken(item.status),
                    exportStatusTone(item.status),
                  )}
                </div>
              ))}
            </div>
          </CanvasCard>
        ) : null}
      </PageState>
    </ComplianceConsoleFrame>
  );
}

export function SandboxInvestigationsPage() {
  const searchParams = useSearchParams();
  const takeoverCaseId = searchParams.get("takeoverCaseId");
  const discrepancyCaseId = searchParams.get("discrepancyCaseId");
  const view =
    searchParams.get("view") === "takeover" ? "takeover" : "accident";
  const { data, loading, error, refresh } = useOverviewState();

  const bannerText = data
    ? focusBannerText({
        takeoverCaseId,
        discrepancyCaseId,
        takeoverReview: takeoverCaseId
          ? (findTakeoverReview(data.takeoverReviews, takeoverCaseId) ?? null)
          : null,
        discrepancy: discrepancyCaseId
          ? (data.discrepancies.find(
              (item) => item.discrepancyCaseId === discrepancyCaseId,
            ) ?? null)
          : null,
      })
    : null;

  return (
    <ComplianceConsoleFrame
      active={view === "takeover" ? "takeover" : "accident"}
      title={
        view === "takeover"
          ? "接管審查 · Takeover Review"
          : "事故案件 · Accident Investigation Queue"
      }
      subtitle={
        view === "takeover"
          ? "Three-source takeover correlation, discrepancy detection, and investigation deep-links emitted by backend authority."
          : "Operational case queue with linked trip, manifest, discrepancy, and timeline entry points."
      }
      actions={
        <CanvasBtn
          theme={theme}
          variant="secondary"
          onClick={() => void refresh()}
        >
          Refresh
        </CanvasBtn>
      }
      scopeHints={[
        { label: "Read investigations", scope: "sandbox.investigation.read" },
        { label: "Read takeover triage", scope: "sandbox.compliance.read" },
      ]}
    >
      {bannerText ? (
        <CanvasBanner
          theme={theme}
          tone="accent"
          icon="info"
          title="Resolved ROC deep-link"
          body={bannerText}
        />
      ) : null}

      <PageState
        loading={loading}
        error={error}
        empty={
          data &&
          data.investigations.length === 0 &&
          data.takeoverReviews.length === 0
            ? "No investigation or takeover records are currently available."
            : null
        }
      >
        {view === "takeover" ? (
          <div style={pageStackStyle}>
            <CanvasCard
              theme={theme}
              title="Takeover review queue"
              subtitle="backend-linked investigation targets"
              padding={0}
            >
              <CanvasTable
                theme={theme}
                columns={[
                  {
                    h: "Takeover",
                    w: 160,
                    r: (row: CorrelatedTakeoverCase) => (
                      <div style={cardStackStyle}>
                        <span style={monoStyle}>
                          {row.correlatedTakeoverCaseId}
                        </span>
                        <span style={mutedStyle}>
                          {row.sourceRecordIds.safetyOperatorTakeoverReportId}
                        </span>
                      </div>
                    ),
                  },
                  {
                    h: "Vehicle / trip",
                    w: 150,
                    r: (row: CorrelatedTakeoverCase) => (
                      <div style={cardStackStyle}>
                        <span style={monoStyle}>{row.vehicleId}</span>
                        <span style={mutedStyle}>
                          {row.orderId ?? "No trip linked"}
                        </span>
                      </div>
                    ),
                  },
                  {
                    h: "Match mode",
                    w: 120,
                    r: (row: CorrelatedTakeoverCase) =>
                      statusPill(humanizeToken(row.matchedBy), "accent"),
                  },
                  {
                    h: "Discrepancies",
                    w: 120,
                    r: (row: CorrelatedTakeoverCase) =>
                      row.discrepancyCaseIds.length > 0
                        ? statusPill(
                            `${row.discrepancyCaseIds.length} open`,
                            "warn",
                          )
                        : statusPill("Clear", "success"),
                  },
                  {
                    h: "Investigation",
                    w: 160,
                    r: (row: CorrelatedTakeoverCase) =>
                      row.investigationLink ? (
                        <InlineLink href={row.investigationLink.route}>
                          {row.investigationLink.resourceId}
                        </InlineLink>
                      ) : (
                        <span style={mutedStyle}>Unlinked</span>
                      ),
                  },
                ]}
                rows={takeoverRows(data?.takeoverReviews ?? [])}
              />
            </CanvasCard>

            <CanvasCard
              theme={theme}
              title="Discrepancy queue"
              subtitle="timestamp, trip, and correlation mismatches"
              padding={0}
            >
              <CanvasTable
                theme={theme}
                columns={[
                  {
                    h: "Case",
                    w: 160,
                    r: (row: EvidenceDiscrepancyCase) => (
                      <div style={cardStackStyle}>
                        <span style={monoStyle}>{row.discrepancyCaseId}</span>
                        <span style={mutedStyle}>{row.summary}</span>
                      </div>
                    ),
                  },
                  {
                    h: "Types",
                    w: 180,
                    r: (row: EvidenceDiscrepancyCase) => (
                      <div style={evidenceChipRowStyle}>
                        {row.discrepancyTypes.map((item) =>
                          statusPill(humanizeToken(item), "warn", false),
                        )}
                      </div>
                    ),
                  },
                  {
                    h: "Takeover",
                    w: 160,
                    r: (row: EvidenceDiscrepancyCase) =>
                      findTakeoverReview(
                        data?.takeoverReviews ?? [],
                        row.correlatedTakeoverCaseId,
                      ) ? (
                        <span style={monoStyle}>
                          {row.correlatedTakeoverCaseId}
                        </span>
                      ) : (
                        <span style={mutedStyle}>Missing review</span>
                      ),
                  },
                  {
                    h: "Investigation",
                    w: 160,
                    r: (row: EvidenceDiscrepancyCase) =>
                      row.investigationLink ? (
                        <InlineLink href={row.investigationLink.route}>
                          {row.investigationLink.resourceId}
                        </InlineLink>
                      ) : (
                        <span style={mutedStyle}>Unlinked</span>
                      ),
                  },
                ]}
                rows={discrepancyRows(data?.discrepancies ?? [])}
              />
            </CanvasCard>
          </div>
        ) : (
          <div style={pageStackStyle}>
            <CanvasCard
              theme={theme}
              title="Investigation queue"
              subtitle="case detail, timeline, trip, and manifest entry points"
              padding={0}
            >
              <CanvasTable
                theme={theme}
                columns={[
                  {
                    h: "Case",
                    w: 170,
                    r: (row: AccidentCaseRecord) => (
                      <div style={cardStackStyle}>
                        <InlineLink href={investigationHref(row.caseId)}>
                          <span style={monoStyle}>{row.caseId}</span>
                        </InlineLink>
                        <span style={mutedStyle}>{row.summary ?? "—"}</span>
                      </div>
                    ),
                  },
                  {
                    h: "Severity",
                    w: 110,
                    r: (row: AccidentCaseRecord) =>
                      statusPill(
                        humanizeToken(row.severity),
                        accidentSeverityTone(row.severity),
                      ),
                  },
                  {
                    h: "Status",
                    w: 140,
                    r: (row: AccidentCaseRecord) =>
                      statusPill(
                        humanizeToken(row.status),
                        investigationStatusTone(row.status),
                      ),
                  },
                  {
                    h: "Trip / manifest",
                    w: 180,
                    r: (row: AccidentCaseRecord) => (
                      <div style={cardStackStyle}>
                        {row.orderId ? (
                          <InlineLink href={tripHref(row.orderId)}>
                            {row.orderId}
                          </InlineLink>
                        ) : (
                          <span style={mutedStyle}>No trip linked</span>
                        )}
                        {row.evidenceManifestId ? (
                          <InlineLink
                            href={manifestHref(row.evidenceManifestId)}
                          >
                            {row.evidenceManifestId}
                          </InlineLink>
                        ) : (
                          <span style={mutedStyle}>No manifest linked</span>
                        )}
                      </div>
                    ),
                  },
                  {
                    h: "Timeline",
                    w: 140,
                    r: (row: AccidentCaseRecord) => (
                      <InlineLink href={investigationTimelineHref(row.caseId)}>
                        Open facts
                      </InlineLink>
                    ),
                  },
                ]}
                rows={investigationRows(data?.investigations ?? [])}
              />
            </CanvasCard>

            <div style={autoGridStyle("360px")}>
              <CanvasCard
                theme={theme}
                title="Discrepancy-linked cases"
                subtitle="open evidence mismatch signals"
                padding={0}
              >
                <CanvasTable
                  theme={theme}
                  columns={[
                    {
                      h: "Discrepancy",
                      w: 160,
                      r: (row: EvidenceDiscrepancyCase) => (
                        <span style={monoStyle}>{row.discrepancyCaseId}</span>
                      ),
                    },
                    {
                      h: "Summary",
                      w: 280,
                      r: (row: EvidenceDiscrepancyCase) => (
                        <span style={mutedStyle}>{row.summary}</span>
                      ),
                    },
                    {
                      h: "Investigation",
                      w: 160,
                      r: (row: EvidenceDiscrepancyCase) => {
                        const linked = row.investigationLink
                          ? row.investigationLink.resourceId
                          : findInvestigationForDiscrepancy(
                              data?.investigations ?? [],
                              row.discrepancyCaseId,
                            )?.caseId;
                        return linked ? (
                          <InlineLink
                            href={
                              row.investigationLink?.route ??
                              investigationHref(linked)
                            }
                          >
                            {linked}
                          </InlineLink>
                        ) : (
                          <span style={mutedStyle}>Unlinked</span>
                        );
                      },
                    },
                  ]}
                  rows={discrepancyRows(
                    (data?.discrepancies ?? []).slice(0, 6),
                  )}
                />
              </CanvasCard>

              <CanvasCard
                theme={theme}
                title="Queue health"
                subtitle="what needs human attention first"
              >
                <div style={cardStackStyle}>
                  <div style={mutedStyle}>
                    Open investigations:{" "}
                    {data?.investigations.filter(
                      (item) => item.status !== "closed",
                    ).length ?? 0}
                  </div>
                  <div style={mutedStyle}>
                    Takeovers with discrepancies:{" "}
                    {data?.takeoverReviews.filter(
                      (item) => item.discrepancyCaseIds.length > 0,
                    ).length ?? 0}
                  </div>
                  <div style={mutedStyle}>
                    Cases awaiting initial notification:{" "}
                    {data?.investigations.filter(
                      (item) => item.status === "evidence_frozen",
                    ).length ?? 0}
                  </div>
                </div>
              </CanvasCard>
            </div>
          </div>
        )}
      </PageState>
    </ComplianceConsoleFrame>
  );
}

export function SandboxInvestigationDetailPage() {
  const caseId = useCurrentParam("caseId");
  const { data, loading, error, refresh } = useInvestigationState(caseId);

  return (
    <ComplianceConsoleFrame
      active="accident"
      title={`事故案件 · ${caseId || "Investigation detail"}`}
      subtitle="Backend case record is the source of truth for linked manifest, report, discrepancy, and takeover context."
      actions={
        <CanvasBtn
          theme={theme}
          variant="secondary"
          onClick={() => void refresh()}
        >
          Refresh
        </CanvasBtn>
      }
      context={{
        tripId: data?.investigation.orderId ?? null,
        caseId: data?.investigation.caseId ?? caseId,
        manifestId:
          data?.manifest?.manifestId ??
          data?.investigation.evidenceManifestId ??
          null,
      }}
      scopeHints={[
        {
          label: "Read investigation detail",
          scope: "sandbox.investigation.read",
        },
        { label: "Preview linked evidence", scope: "sandbox.evidence.preview" },
        {
          label: "Review regulator filing state",
          scope: "sandbox.regulatory_report.review",
        },
      ]}
    >
      <PageState loading={loading} error={error}>
        {data ? (
          <>
            <div style={autoGridStyle("320px")}>
              <CanvasCard theme={theme} title="Case summary">
                <CanvasDL
                  theme={theme}
                  cols={2}
                  items={[
                    { k: "Case", v: data.investigation.caseId, mono: true },
                    {
                      k: "Status",
                      v: statusPill(
                        humanizeToken(data.investigation.status),
                        investigationStatusTone(data.investigation.status),
                      ),
                    },
                    {
                      k: "Severity",
                      v: statusPill(
                        humanizeToken(data.investigation.severity),
                        accidentSeverityTone(data.investigation.severity),
                      ),
                    },
                    {
                      k: "Occurred",
                      v: compactDate(data.investigation.occurredAt),
                    },
                    {
                      k: "Reported",
                      v: compactDate(data.investigation.reportedAt),
                    },
                    { k: "Reported by", v: data.investigation.reportedBy },
                    {
                      k: "Trip",
                      v: data.investigation.orderId ?? "—",
                      mono: true,
                    },
                    {
                      k: "Manifest",
                      v: data.investigation.evidenceManifestId ?? "—",
                      mono: true,
                    },
                    {
                      k: "Report",
                      v:
                        data.reports.find(
                          (item) =>
                            item.reportId ===
                            data.investigation.regulatoryReportId,
                        )?.reportId ??
                        data.investigation.regulatoryReportId ??
                        "—",
                      mono: true,
                    },
                    {
                      k: "Linked discrepancy IDs",
                      v:
                        data.investigation.discrepancyCaseIds.length > 0
                          ? data.investigation.discrepancyCaseIds.join(", ")
                          : "None",
                    },
                  ]}
                />
              </CanvasCard>

              <CanvasCard
                theme={theme}
                title="Linked actions"
                subtitle="same-app navigation"
              >
                <div style={cardStackStyle}>
                  <InlineLink
                    href={investigationTimelineHref(data.investigation.caseId)}
                  >
                    Open synchronized timeline
                  </InlineLink>
                  {data.manifest ? (
                    <InlineLink href={manifestHref(data.manifest.manifestId)}>
                      Open evidence manifest
                    </InlineLink>
                  ) : (
                    <span style={mutedStyle}>Manifest not available</span>
                  )}
                  {data.investigation.orderId ? (
                    <InlineLink href={tripHref(data.investigation.orderId)}>
                      Open trip compliance detail
                    </InlineLink>
                  ) : (
                    <span style={mutedStyle}>Trip deep-link unavailable</span>
                  )}
                  <InlineLink href="/platform-admin/regulatory-reports">
                    Open regulatory reports queue
                  </InlineLink>
                </div>
              </CanvasCard>
            </div>

            {data.investigation.summary ? (
              <CanvasBanner
                theme={theme}
                tone="accent"
                icon="info"
                title="Case summary note"
                body={data.investigation.summary}
              />
            ) : null}

            <div style={autoGridStyle("360px")}>
              <CanvasCard
                theme={theme}
                title="Timeline preview"
                subtitle="most recent synchronized facts"
              >
                <div style={cardStackStyle}>
                  {data.timeline.slice(0, 5).map((entry) => (
                    <div
                      key={entry.entryId}
                      style={{
                        display: "grid",
                        gap: 6,
                        paddingBottom: 10,
                        borderBottom: `1px solid ${theme.border}`,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 8,
                          justifyContent: "space-between",
                        }}
                      >
                        <strong style={{ fontSize: 12.5 }}>
                          {entry.label}
                        </strong>
                        <span style={{ ...monoStyle, color: theme.textMuted }}>
                          {compactDate(entry.occurredAt)}
                        </span>
                      </div>
                      <div style={evidenceChipRowStyle}>
                        {statusPill(
                          humanizeToken(entry.confidence),
                          confidenceTone(entry.confidence),
                          false,
                        )}
                        {statusPill(
                          timelineSourceLabel(entry),
                          timelineSourceTone(entry),
                          false,
                        )}
                      </div>
                      <div style={mutedStyle}>
                        {entry.value === null
                          ? "No value recorded"
                          : String(entry.value)}
                      </div>
                    </div>
                  ))}
                </div>
              </CanvasCard>

              <CanvasCard
                theme={theme}
                title="Linked evidence posture"
                subtitle="manifest and filing state"
              >
                <CanvasDL
                  theme={theme}
                  cols={1}
                  items={[
                    {
                      k: "Manifest custody",
                      v: data.manifest
                        ? statusPill(
                            humanizeToken(data.manifest.custodyState),
                            custodyStateTone(data.manifest.custodyState),
                          )
                        : "No manifest linked",
                    },
                    {
                      k: "Legal hold",
                      v: data.manifest?.legalHoldActive
                        ? statusPill("Active", "warn")
                        : "No active hold",
                    },
                    {
                      k: "Known gaps",
                      v: data.manifest
                        ? String(data.manifest.knownGapCount)
                        : "—",
                      mono: true,
                    },
                    {
                      k: "Regulatory report",
                      v: reportForCase(data.reports, data.investigation.caseId)
                        ? statusPill(
                            humanizeToken(
                              reportForCase(
                                data.reports,
                                data.investigation.caseId,
                              )?.status,
                            ),
                            reportStatusTone(
                              reportForCase(
                                data.reports,
                                data.investigation.caseId,
                              )?.status ?? "draft",
                            ),
                          )
                        : "None",
                    },
                  ]}
                />
              </CanvasCard>
            </div>
          </>
        ) : null}
      </PageState>
    </ComplianceConsoleFrame>
  );
}

export function SandboxInvestigationTimelinePage() {
  const caseId = useCurrentParam("caseId");
  const { data, loading, error, refresh } = useInvestigationState(caseId);

  const sortedTimeline = useMemo(
    () =>
      [...(data?.timeline ?? [])].sort((left, right) =>
        left.occurredAt.localeCompare(right.occurredAt),
      ),
    [data?.timeline],
  );

  return (
    <ComplianceConsoleFrame
      active="timeline"
      title={`同步時間軸 · ${caseId || "Timeline"}`}
      subtitle="Fact-by-fact synchronized evidence timeline with explicit confidence, source, derivation, and discrepancy tags."
      actions={
        <CanvasBtn
          theme={theme}
          variant="secondary"
          onClick={() => void refresh()}
        >
          Refresh
        </CanvasBtn>
      }
      context={{
        tripId: data?.investigation.orderId ?? null,
        caseId: data?.investigation.caseId ?? caseId,
        manifestId:
          data?.manifest?.manifestId ??
          data?.investigation.evidenceManifestId ??
          null,
      }}
      scopeHints={[
        { label: "Read timeline facts", scope: "sandbox.investigation.read" },
        {
          label: "Inspect evidence lineage",
          scope: "sandbox.evidence.preview",
        },
      ]}
    >
      <PageState
        loading={loading}
        error={error}
        empty={
          data && sortedTimeline.length === 0
            ? `No synchronized timeline facts were found for ${caseId}.`
            : null
        }
      >
        {data ? (
          <>
            <div style={autoGridStyle("180px")}>
              <CanvasCard theme={theme} title="Facts">
                <div style={{ fontSize: 28, fontWeight: 700 }}>
                  {sortedTimeline.length}
                </div>
                <div style={mutedStyle}>Synchronized entries in order.</div>
              </CanvasCard>
              <CanvasCard theme={theme} title="Discrepancy tags">
                <div style={{ fontSize: 28, fontWeight: 700 }}>
                  {sortedTimeline.reduce(
                    (sum, item) => sum + item.discrepancyCaseIds.length,
                    0,
                  )}
                </div>
                <div style={mutedStyle}>Cross-source mismatch references.</div>
              </CanvasCard>
              <CanvasCard theme={theme} title="External docs">
                <div style={{ fontSize: 28, fontWeight: 700 }}>
                  {sortedTimeline.reduce(
                    (sum, item) => sum + item.externalDocumentIds.length,
                    0,
                  )}
                </div>
                <div style={mutedStyle}>Linked document references.</div>
              </CanvasCard>
            </div>

            <div style={timelineListStyle}>
              {sortedTimeline.map((entry) => (
                <div key={entry.entryId} style={timelineEntryStyle}>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 10,
                      justifyContent: "space-between",
                    }}
                  >
                    <div style={cardStackStyle}>
                      <strong style={{ fontSize: 13.5 }}>{entry.label}</strong>
                      <span style={{ ...monoStyle, color: theme.textMuted }}>
                        {compactDate(entry.occurredAt)}
                      </span>
                    </div>
                    <div style={evidenceChipRowStyle}>
                      {statusPill(
                        humanizeToken(entry.confidence),
                        confidenceTone(entry.confidence),
                      )}
                      {statusPill(
                        timelineSourceLabel(entry),
                        timelineSourceTone(entry),
                      )}
                    </div>
                  </div>

                  <div style={{ fontSize: 13, color: theme.text }}>
                    {entry.value === null
                      ? "No value recorded"
                      : String(entry.value)}
                  </div>

                  <div style={autoGridStyle("220px")}>
                    <CanvasCard
                      theme={theme}
                      title="Lineage"
                      subtitle="fact derivation"
                    >
                      <CanvasDL
                        theme={theme}
                        cols={1}
                        items={[
                          {
                            k: "Source ref",
                            v: entry.sourceRef ?? "—",
                            mono: true,
                          },
                          {
                            k: "Derivation",
                            v: entry.derivationRule ?? "Direct source fact",
                          },
                          {
                            k: "Fact count",
                            v: String(entry.facts.length),
                            mono: true,
                          },
                        ]}
                      />
                    </CanvasCard>

                    <CanvasCard
                      theme={theme}
                      title="Discrepancies & docs"
                      subtitle="linked references"
                    >
                      <div style={cardStackStyle}>
                        <div style={evidenceChipRowStyle}>
                          {entry.discrepancyCaseIds.length > 0
                            ? entry.discrepancyCaseIds.map((item) =>
                                statusPill(item, "warn", false),
                              )
                            : [
                                <span key="clear" style={mutedStyle}>
                                  No discrepancy tags
                                </span>,
                              ]}
                        </div>
                        <div style={evidenceChipRowStyle}>
                          {entry.externalDocumentIds.length > 0
                            ? entry.externalDocumentIds.map((item) =>
                                statusPill(item, "neutral", false),
                              )
                            : [
                                <span key="docs" style={mutedStyle}>
                                  No external documents
                                </span>,
                              ]}
                        </div>
                      </div>
                    </CanvasCard>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </PageState>
    </ComplianceConsoleFrame>
  );
}

export function SandboxEvidenceManifestPage() {
  const manifestId = useCurrentParam("manifestId");
  const { data, loading, error, refresh } = useManifestState(manifestId);

  return (
    <ComplianceConsoleFrame
      active="manifest"
      title={`證據清單 · ${manifestId || "Evidence manifest"}`}
      subtitle="Append-only manifest view with source provenance, checksum references, custody state, legal-hold posture, and known gaps."
      actions={
        <CanvasBtn
          theme={theme}
          variant="secondary"
          onClick={() => void refresh()}
        >
          Refresh
        </CanvasBtn>
      }
      context={{
        tripId: null,
        caseId: data?.caseId ?? null,
        manifestId: data?.manifestId ?? manifestId,
      }}
      scopeHints={[
        { label: "Read evidence manifest", scope: "sandbox.evidence.preview" },
        {
          label: "Request export from this manifest",
          scope: "sandbox.evidence.export.request",
        },
      ]}
    >
      <PageState loading={loading} error={error}>
        {data ? (
          <>
            {data.legalHoldActive ? (
              <CanvasBanner
                theme={theme}
                tone="warn"
                icon="lock"
                title="Legal hold active"
                body="This manifest is currently frozen under legal hold. Retention deletion does not apply while the hold is active."
              />
            ) : null}
            {data.knownGapCount > 0 ? (
              <CanvasBanner
                theme={theme}
                tone="info"
                icon="info"
                title="Known evidence gaps"
                body={`${data.knownGapCount} item(s) were captured through manual-entry fallbacks and should be treated as explicit upstream gaps.`}
              />
            ) : null}

            <div style={autoGridStyle("320px")}>
              <CanvasCard theme={theme} title="Manifest posture">
                <CanvasDL
                  theme={theme}
                  cols={2}
                  items={[
                    { k: "Manifest", v: data.manifestId, mono: true },
                    { k: "Vehicle", v: data.vehicleId, mono: true },
                    { k: "Case", v: data.caseId ?? "—", mono: true },
                    {
                      k: "Custody",
                      v: statusPill(
                        humanizeToken(data.custodyState),
                        custodyStateTone(data.custodyState),
                      ),
                    },
                    { k: "Window start", v: compactDate(data.windowStart) },
                    { k: "Window end", v: compactDate(data.windowEnd) },
                    { k: "Items", v: String(data.itemCount), mono: true },
                    { k: "Created", v: compactDate(data.createdAt) },
                  ]}
                />
              </CanvasCard>

              <CanvasCard
                theme={theme}
                title="Linked navigation"
                subtitle="same-app routes"
              >
                <div style={cardStackStyle}>
                  {data.caseId ? (
                    <InlineLink href={investigationHref(data.caseId)}>
                      Open linked investigation
                    </InlineLink>
                  ) : (
                    <span style={mutedStyle}>No linked case</span>
                  )}
                  <InlineLink href="/platform-admin/evidence/legal-holds">
                    Open legal-hold queue
                  </InlineLink>
                  <InlineLink href="/platform-admin/evidence/exports">
                    Open controlled export queue
                  </InlineLink>
                </div>
              </CanvasCard>
            </div>

            <CanvasCard
              theme={theme}
              title="Manifest items"
              subtitle="source, checksum, and custody per artifact"
              padding={0}
            >
              <CanvasTable
                theme={theme}
                columns={[
                  {
                    h: "Artifact",
                    w: 220,
                    r: (row: SandboxEvidenceManifestView["items"][number]) => (
                      <div style={cardStackStyle}>
                        <span style={monoStyle}>{row.artifactId}</span>
                        <span style={mutedStyle}>{row.objectKey}</span>
                      </div>
                    ),
                  },
                  {
                    h: "Source",
                    w: 180,
                    r: (row: SandboxEvidenceManifestView["items"][number]) =>
                      statusPill(
                        sourceLabel(row.source.sourceSystem),
                        sourceTone(row.source.sourceSystem),
                      ),
                  },
                  {
                    h: "Custody",
                    w: 120,
                    r: (row: SandboxEvidenceManifestView["items"][number]) =>
                      statusPill(
                        humanizeToken(row.custodyState),
                        custodyStateTone(row.custodyState),
                      ),
                  },
                  {
                    h: "Captured",
                    w: 170,
                    r: (row: SandboxEvidenceManifestView["items"][number]) =>
                      compactDate(row.capturedAt),
                  },
                  {
                    h: "Checksum",
                    w: 120,
                    mono: true,
                    r: (row: SandboxEvidenceManifestView["items"][number]) =>
                      truncateHash(row.checksumSha256),
                  },
                  {
                    h: "Retention",
                    w: 170,
                    r: (row: SandboxEvidenceManifestView["items"][number]) =>
                      compactDate(row.retentionUntil),
                  },
                ]}
                rows={data.items}
              />
            </CanvasCard>
          </>
        ) : null}
      </PageState>
    </ComplianceConsoleFrame>
  );
}

export function SandboxEvidenceExportsPage() {
  const client = usePlatformAdminClient();
  const { data, loading, error, refresh } = useOverviewState();
  const [form, setForm] = useState<ExportFormState>({
    manifestId: "",
    recipientLabel: "Taipei City Transportation Department",
    recipientScope: "regulator.viewer.taipei_city",
    reason: "",
  });
  const [stepUpConfirmed, setStepUpConfirmed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const manifestOptions = useMemo(() => {
    if (!data) {
      return [];
    }
    return uniqueManifestIds(data.investigations).map((id) => {
      const linkedCase =
        data.investigations.find((item) => item.evidenceManifestId === id) ??
        null;
      const linkedReport = reportForCase(
        data.regulatoryReports,
        linkedCase?.caseId ?? null,
      );
      return {
        manifestId: id,
        caseId: linkedCase?.caseId ?? null,
        reportId: linkedReport?.reportId ?? null,
      };
    });
  }, [data]);

  const selectedManifestId =
    form.manifestId || manifestOptions[0]?.manifestId || "";
  const selectedManifestOption =
    manifestOptions.find((item) => item.manifestId === selectedManifestId) ??
    null;

  async function handleRequestExport() {
    if (!selectedManifestId) {
      return;
    }

    setBusyId("request");
    setActionError(null);
    setMessage(null);
    try {
      await client.requestSandboxControlledExport({
        caseId: selectedManifestOption?.caseId ?? null,
        manifestId: selectedManifestId,
        reportId: selectedManifestOption?.reportId ?? null,
        recipientLabel: form.recipientLabel.trim(),
        recipientScope: form.recipientScope.trim(),
        reason: form.reason.trim(),
      });
      setMessage(
        `Controlled export request created for ${selectedManifestId}.`,
      );
      setForm((current) => ({ ...current, reason: "" }));
      setStepUpConfirmed(false);
      await refresh();
    } catch (requestError: unknown) {
      setActionError(
        requestError instanceof Error
          ? requestError.message
          : String(requestError),
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleApproveExport(exportRequestId: string) {
    setBusyId(exportRequestId);
    setActionError(null);
    setMessage(null);
    try {
      await client.approveSandboxControlledExport(exportRequestId, {
        approvalNote: "Approved through platform-admin compliance console.",
      });
      setMessage(`Controlled export ${exportRequestId} approved.`);
      await refresh();
    } catch (approveError: unknown) {
      setActionError(
        approveError instanceof Error
          ? approveError.message
          : String(approveError),
      );
    } finally {
      setBusyId(null);
    }
  }

  const canRequest =
    selectedManifestId.length > 0 &&
    form.recipientLabel.trim().length > 0 &&
    form.recipientScope.trim().length > 0 &&
    form.reason.trim().length > 0 &&
    stepUpConfirmed;

  return (
    <ComplianceConsoleFrame
      active="export"
      title="受控匯出 · Controlled Export"
      subtitle="Controlled evidence bundle request and approval queue with reason capture, step-up confirmation, and self-approval blocking."
      actions={
        <CanvasBtn
          theme={theme}
          variant="secondary"
          onClick={() => void refresh()}
        >
          Refresh
        </CanvasBtn>
      }
      scopeHints={[
        {
          label: "Request controlled export",
          scope: "sandbox.evidence.export.request",
        },
        {
          label: "Approve controlled export",
          scope: "sandbox.evidence.export.approve",
          blocked: "Requester and approver must be different actors.",
        },
      ]}
    >
      <PageState loading={loading} error={error}>
        {data ? (
          <>
            <CanvasBanner
              theme={theme}
              tone="warn"
              icon="lock"
              title="Step-up required before export request"
              body="Controlled export requires a non-empty reason, explicit recipient scope, and an additional operator confirmation before the request can be submitted."
            />
            {message ? (
              <CanvasBanner
                theme={theme}
                tone="success"
                icon="check"
                title="Export workflow updated"
                body={message}
              />
            ) : null}
            {actionError ? (
              <CanvasBanner
                theme={theme}
                tone="danger"
                icon="warn"
                title="Export action failed"
                body={actionError}
              />
            ) : null}

            <div style={autoGridStyle("360px")}>
              <CanvasCard
                theme={theme}
                title="Request controlled export"
                subtitle="reason + step-up gate"
              >
                <div style={fieldGridStyle}>
                  <div style={fieldGridStyle}>
                    <label style={fieldLabelStyle} htmlFor="export-manifest">
                      Manifest
                    </label>
                    <select
                      id="export-manifest"
                      style={inputStyle}
                      value={selectedManifestId}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          manifestId: event.target.value,
                        }))
                      }
                    >
                      {manifestOptions.length === 0 ? (
                        <option value="">No manifests available</option>
                      ) : null}
                      {manifestOptions.map((item) => (
                        <option key={item.manifestId} value={item.manifestId}>
                          {item.manifestId}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={fieldGridStyle}>
                    <label style={fieldLabelStyle} htmlFor="export-recipient">
                      Recipient label
                    </label>
                    <input
                      id="export-recipient"
                      style={inputStyle}
                      value={form.recipientLabel}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          recipientLabel: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div style={fieldGridStyle}>
                    <label style={fieldLabelStyle} htmlFor="export-scope">
                      Recipient scope
                    </label>
                    <input
                      id="export-scope"
                      style={inputStyle}
                      value={form.recipientScope}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          recipientScope: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div style={fieldGridStyle}>
                    <label style={fieldLabelStyle} htmlFor="export-reason">
                      Reason
                    </label>
                    <textarea
                      id="export-reason"
                      style={textareaStyle}
                      value={form.reason}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          reason: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <label style={checkboxRowStyle}>
                    <input
                      type="checkbox"
                      checked={stepUpConfirmed}
                      onChange={(event) =>
                        setStepUpConfirmed(event.target.checked)
                      }
                    />
                    <span>
                      I confirm the recipient scope, evidentiary need, and that
                      a second compliance actor must approve this export before
                      it leaves the platform.
                    </span>
                  </label>
                  <CanvasBtn
                    theme={theme}
                    variant="primary"
                    disabled={!canRequest || busyId === "request"}
                    onClick={() => void handleRequestExport()}
                  >
                    {busyId === "request"
                      ? "Requesting…"
                      : "Submit export request"}
                  </CanvasBtn>
                </div>
              </CanvasCard>

              <CanvasCard
                theme={theme}
                title="Selected evidence posture"
                subtitle="linked authority data"
              >
                <CanvasDL
                  theme={theme}
                  cols={1}
                  items={[
                    {
                      k: "Manifest",
                      v: selectedManifestId || "—",
                      mono: true,
                    },
                    {
                      k: "Case",
                      v: selectedManifestOption?.caseId ?? "—",
                      mono: true,
                    },
                    {
                      k: "Report",
                      v: selectedManifestOption?.reportId ?? "—",
                      mono: true,
                    },
                    {
                      k: "Approval rule",
                      v: "Four-eyes approval enforced by backend",
                    },
                  ]}
                />
              </CanvasCard>
            </div>

            <CanvasCard
              theme={theme}
              title="Export queue"
              subtitle="request / approval separation"
              padding={0}
            >
              <CanvasTable
                theme={theme}
                columns={[
                  {
                    h: "Request",
                    w: 170,
                    r: (row: SandboxControlledEvidenceExportRecord) => (
                      <div style={cardStackStyle}>
                        <span style={monoStyle}>{row.exportRequestId}</span>
                        <span style={mutedStyle}>
                          {compactDate(row.requestedAt)}
                        </span>
                      </div>
                    ),
                  },
                  {
                    h: "Manifest / case",
                    w: 170,
                    r: (row: SandboxControlledEvidenceExportRecord) => (
                      <div style={cardStackStyle}>
                        <span style={monoStyle}>{row.manifestId}</span>
                        <span style={mutedStyle}>
                          {row.caseId ?? "No case linked"}
                        </span>
                      </div>
                    ),
                  },
                  {
                    h: "Recipient",
                    w: 220,
                    r: (row: SandboxControlledEvidenceExportRecord) => (
                      <div style={cardStackStyle}>
                        <span>{row.recipientLabel}</span>
                        <span style={mutedStyle}>{row.recipientScope}</span>
                      </div>
                    ),
                  },
                  {
                    h: "Status",
                    w: 140,
                    r: (row: SandboxControlledEvidenceExportRecord) =>
                      statusPill(
                        humanizeToken(row.status),
                        exportStatusTone(row.status),
                      ),
                  },
                  {
                    h: "Actors",
                    w: 220,
                    r: (row: SandboxControlledEvidenceExportRecord) => (
                      <div style={cardStackStyle}>
                        <span style={mutedStyle}>
                          requester: {row.requestedByActorId}
                        </span>
                        <span style={mutedStyle}>
                          approver: {row.approvedByActorId ?? "pending"}
                        </span>
                      </div>
                    ),
                  },
                  {
                    h: "Action",
                    w: 180,
                    r: (row: SandboxControlledEvidenceExportRecord) => {
                      const selfApprovalBlocked =
                        row.requestedByActorId ===
                        PLATFORM_ADMIN_BOOTSTRAP_ACTOR_ID;
                      const canApprove =
                        row.status === "pending_approval" &&
                        !selfApprovalBlocked;

                      return canApprove ? (
                        <CanvasBtn
                          theme={theme}
                          variant="primary"
                          disabled={busyId === row.exportRequestId}
                          onClick={() =>
                            void handleApproveExport(row.exportRequestId)
                          }
                        >
                          {busyId === row.exportRequestId
                            ? "Approving…"
                            : "Approve"}
                        </CanvasBtn>
                      ) : selfApprovalBlocked ? (
                        <span style={mutedStyle}>Self-approval blocked</span>
                      ) : (
                        <span style={mutedStyle}>No pending approval</span>
                      );
                    },
                  },
                ]}
                rows={exportRows(data.controlledExports)}
              />
            </CanvasCard>
          </>
        ) : null}
      </PageState>
    </ComplianceConsoleFrame>
  );
}

export function SandboxLegalHoldsPage() {
  const client = usePlatformAdminClient();
  const { data, loading, error, refresh } = useOverviewState();
  const [form, setForm] = useState<HoldFormState>({
    caseId: "",
    scopeSummary: "",
    reason: "",
    expiresAt: "",
  });
  const [releaseHoldId, setReleaseHoldId] = useState<string | null>(null);
  const [releaseReason, setReleaseReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const caseOptions = useMemo(
    () => data?.investigations.filter((item) => item.evidenceManifestId) ?? [],
    [data?.investigations],
  );
  const selectedCaseId = form.caseId || caseOptions[0]?.caseId || "";
  const selectedCase =
    caseOptions.find((item) => item.caseId === selectedCaseId) ?? null;

  async function handlePlaceHold() {
    if (!selectedCase?.evidenceManifestId) {
      return;
    }

    setBusyId("place");
    setActionError(null);
    setMessage(null);
    try {
      await client.placeSandboxLegalHold({
        caseId: selectedCase.caseId,
        manifestId: selectedCase.evidenceManifestId,
        scopeSummary: form.scopeSummary.trim(),
        reason: form.reason.trim(),
        expiresAt: form.expiresAt
          ? new Date(form.expiresAt).toISOString()
          : null,
      });
      setMessage(`Legal hold placed for ${selectedCase.caseId}.`);
      setForm({
        caseId: selectedCase.caseId,
        scopeSummary: "",
        reason: "",
        expiresAt: "",
      });
      await refresh();
    } catch (placeError: unknown) {
      setActionError(
        placeError instanceof Error ? placeError.message : String(placeError),
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleRequestRelease() {
    if (!releaseHoldId || releaseReason.trim().length === 0) {
      return;
    }

    setBusyId(releaseHoldId);
    setActionError(null);
    setMessage(null);
    try {
      await client.requestSandboxLegalHoldRelease(releaseHoldId, {
        releaseReason: releaseReason.trim(),
      });
      setMessage(`Release request recorded for ${releaseHoldId}.`);
      setReleaseHoldId(null);
      setReleaseReason("");
      await refresh();
    } catch (releaseError: unknown) {
      setActionError(
        releaseError instanceof Error
          ? releaseError.message
          : String(releaseError),
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleApproveRelease(holdId: string) {
    setBusyId(holdId);
    setActionError(null);
    setMessage(null);
    try {
      await client.approveSandboxLegalHoldRelease(holdId, {
        approvalNote: "Approved through platform-admin compliance console.",
      });
      setMessage(`Legal hold ${holdId} released.`);
      await refresh();
    } catch (approveError: unknown) {
      setActionError(
        approveError instanceof Error
          ? approveError.message
          : String(approveError),
      );
    } finally {
      setBusyId(null);
    }
  }

  const canPlaceHold =
    selectedCase?.evidenceManifestId &&
    form.scopeSummary.trim().length > 0 &&
    form.reason.trim().length > 0;

  return (
    <ComplianceConsoleFrame
      active="legalhold"
      title="法律保留 · Legal Hold"
      subtitle="Preserve evidence, request release, and approve release through explicit four-eyes separation."
      actions={
        <CanvasBtn
          theme={theme}
          variant="secondary"
          onClick={() => void refresh()}
        >
          Refresh
        </CanvasBtn>
      }
      scopeHints={[
        { label: "Place legal hold", scope: "sandbox.legal_hold.place" },
        {
          label: "Request hold release",
          scope: "sandbox.legal_hold.release.request",
        },
        {
          label: "Approve hold release",
          scope: "sandbox.legal_hold.release.approve",
          blocked: "Release requester cannot approve their own hold release.",
        },
      ]}
    >
      <PageState loading={loading} error={error}>
        {data ? (
          <>
            <CanvasBanner
              theme={theme}
              tone="warn"
              icon="lock"
              title="Four-eyes release rule"
              body="Legal-hold release remains a two-step workflow. A requester records the release reason; a different actor must approve the release."
            />
            {message ? (
              <CanvasBanner
                theme={theme}
                tone="success"
                icon="check"
                title="Legal-hold workflow updated"
                body={message}
              />
            ) : null}
            {actionError ? (
              <CanvasBanner
                theme={theme}
                tone="danger"
                icon="warn"
                title="Legal-hold action failed"
                body={actionError}
              />
            ) : null}

            <div style={autoGridStyle("360px")}>
              <CanvasCard
                theme={theme}
                title="Place legal hold"
                subtitle="case + manifest authority"
              >
                <div style={fieldGridStyle}>
                  <div style={fieldGridStyle}>
                    <label style={fieldLabelStyle} htmlFor="hold-case">
                      Investigation case
                    </label>
                    <select
                      id="hold-case"
                      style={inputStyle}
                      value={selectedCaseId}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          caseId: event.target.value,
                        }))
                      }
                    >
                      {caseOptions.length === 0 ? (
                        <option value="">
                          No manifest-backed cases available
                        </option>
                      ) : null}
                      {caseOptions.map((item) => (
                        <option key={item.caseId} value={item.caseId}>
                          {item.caseId}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={fieldGridStyle}>
                    <label style={fieldLabelStyle} htmlFor="hold-scope">
                      Scope summary
                    </label>
                    <input
                      id="hold-scope"
                      style={inputStyle}
                      value={form.scopeSummary}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          scopeSummary: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div style={fieldGridStyle}>
                    <label style={fieldLabelStyle} htmlFor="hold-reason">
                      Hold reason
                    </label>
                    <textarea
                      id="hold-reason"
                      style={textareaStyle}
                      value={form.reason}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          reason: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div style={fieldGridStyle}>
                    <label style={fieldLabelStyle} htmlFor="hold-expiry">
                      Expiration (optional)
                    </label>
                    <input
                      id="hold-expiry"
                      style={inputStyle}
                      type="datetime-local"
                      value={form.expiresAt}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          expiresAt: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <CanvasBtn
                    theme={theme}
                    variant="primary"
                    disabled={!canPlaceHold || busyId === "place"}
                    onClick={() => void handlePlaceHold()}
                  >
                    {busyId === "place" ? "Placing…" : "Place hold"}
                  </CanvasBtn>
                </div>
              </CanvasCard>

              <CanvasCard
                theme={theme}
                title="Selected case posture"
                subtitle="linked manifest + status"
              >
                <CanvasDL
                  theme={theme}
                  cols={1}
                  items={[
                    { k: "Case", v: selectedCase?.caseId ?? "—", mono: true },
                    {
                      k: "Manifest",
                      v: selectedCase?.evidenceManifestId ?? "—",
                      mono: true,
                    },
                    {
                      k: "Status",
                      v: selectedCase
                        ? statusPill(
                            humanizeToken(selectedCase.status),
                            investigationStatusTone(selectedCase.status),
                          )
                        : "—",
                    },
                  ]}
                />
              </CanvasCard>
            </div>

            <CanvasCard
              theme={theme}
              title="Legal-hold queue"
              subtitle="place / release-request / release-approve"
              padding={0}
            >
              <CanvasTable
                theme={theme}
                columns={[
                  {
                    h: "Hold",
                    w: 170,
                    r: (row: SandboxLegalHoldRecord) => (
                      <div style={cardStackStyle}>
                        <span style={monoStyle}>{row.holdId}</span>
                        <span style={mutedStyle}>
                          {compactDate(row.placedAt)}
                        </span>
                      </div>
                    ),
                  },
                  {
                    h: "Case / manifest",
                    w: 190,
                    r: (row: SandboxLegalHoldRecord) => (
                      <div style={cardStackStyle}>
                        <span style={monoStyle}>{row.caseId}</span>
                        <span style={mutedStyle}>{row.manifestId}</span>
                      </div>
                    ),
                  },
                  {
                    h: "Scope",
                    w: 240,
                    r: (row: SandboxLegalHoldRecord) => (
                      <div style={cardStackStyle}>
                        <span>{row.scopeSummary}</span>
                        <span style={mutedStyle}>{row.reason}</span>
                      </div>
                    ),
                  },
                  {
                    h: "Status",
                    w: 160,
                    r: (row: SandboxLegalHoldRecord) =>
                      statusPill(
                        humanizeToken(row.status),
                        legalHoldStatusTone(row.status),
                      ),
                  },
                  {
                    h: "Release actors",
                    w: 220,
                    r: (row: SandboxLegalHoldRecord) => (
                      <div style={cardStackStyle}>
                        <span style={mutedStyle}>
                          requester:{" "}
                          {row.releaseRequestedByActorId ?? "pending"}
                        </span>
                        <span style={mutedStyle}>
                          approver: {row.releasedByActorId ?? "pending"}
                        </span>
                      </div>
                    ),
                  },
                  {
                    h: "Action",
                    w: 190,
                    r: (row: SandboxLegalHoldRecord) => {
                      const selfApprovalBlocked =
                        row.releaseRequestedByActorId ===
                        PLATFORM_ADMIN_BOOTSTRAP_ACTOR_ID;

                      if (row.status === "active") {
                        return (
                          <CanvasBtn
                            theme={theme}
                            variant="secondary"
                            onClick={() => setReleaseHoldId(row.holdId)}
                          >
                            Request release
                          </CanvasBtn>
                        );
                      }

                      if (
                        row.status === "release_requested" &&
                        !selfApprovalBlocked
                      ) {
                        return (
                          <CanvasBtn
                            theme={theme}
                            variant="primary"
                            disabled={busyId === row.holdId}
                            onClick={() =>
                              void handleApproveRelease(row.holdId)
                            }
                          >
                            {busyId === row.holdId
                              ? "Approving…"
                              : "Approve release"}
                          </CanvasBtn>
                        );
                      }

                      if (
                        row.status === "release_requested" &&
                        selfApprovalBlocked
                      ) {
                        return (
                          <span style={mutedStyle}>Self-approval blocked</span>
                        );
                      }

                      return <span style={mutedStyle}>Released</span>;
                    },
                  },
                ]}
                rows={holdRows(data.legalHolds)}
              />
            </CanvasCard>

            {releaseHoldId ? (
              <CanvasCard
                theme={theme}
                title="Request hold release"
                subtitle={releaseHoldId}
              >
                <div style={fieldGridStyle}>
                  <div style={fieldGridStyle}>
                    <label style={fieldLabelStyle} htmlFor="release-reason">
                      Release reason
                    </label>
                    <textarea
                      id="release-reason"
                      style={textareaStyle}
                      value={releaseReason}
                      onChange={(event) => setReleaseReason(event.target.value)}
                    />
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <CanvasBtn
                      theme={theme}
                      variant="primary"
                      disabled={
                        releaseReason.trim().length === 0 ||
                        busyId === releaseHoldId
                      }
                      onClick={() => void handleRequestRelease()}
                    >
                      {busyId === releaseHoldId
                        ? "Requesting…"
                        : "Submit release request"}
                    </CanvasBtn>
                    <CanvasBtn
                      theme={theme}
                      variant="ghost"
                      onClick={() => {
                        setReleaseHoldId(null);
                        setReleaseReason("");
                      }}
                    >
                      Cancel
                    </CanvasBtn>
                  </div>
                </div>
              </CanvasCard>
            ) : null}
          </>
        ) : null}
      </PageState>
    </ComplianceConsoleFrame>
  );
}

export function SandboxRegulatoryReportsPage() {
  const client = usePlatformAdminClient();
  const searchParams = useSearchParams();
  const view =
    searchParams.get("view") === "regulator" ? "regulator" : "reportjobs";
  const { data, loading, error, refresh } = useOverviewState();
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleSubmitReport(reportId: string) {
    setBusyId(reportId);
    setActionError(null);
    setMessage(null);
    try {
      await client.submitSandboxRegulatoryReport(reportId);
      setMessage(`Regulatory report ${reportId} submitted.`);
      await refresh();
    } catch (submitError: unknown) {
      setActionError(
        submitError instanceof Error
          ? submitError.message
          : String(submitError),
      );
    } finally {
      setBusyId(null);
    }
  }

  const generatedCount =
    data?.regulatoryReports.filter((item) => item.status === "generated")
      .length ?? 0;
  const submittedCount =
    data?.regulatoryReports.filter((item) => item.status === "submitted")
      .length ?? 0;
  const acceptedCount =
    data?.regulatoryReports.filter((item) => item.status === "accepted")
      .length ?? 0;
  const exportReadyCount =
    data?.controlledExports.filter((item) =>
      ["approved", "completed"].includes(item.status),
    ).length ?? 0;

  return (
    <ComplianceConsoleFrame
      active={view === "regulator" ? "regulator" : "reportjobs"}
      title={
        view === "regulator"
          ? "主管機關檢視 · Regulator Viewer"
          : "監理報表作業 · Report Jobs"
      }
      subtitle={
        view === "regulator"
          ? "Scoped read-only regulator posture with masked operational context and evidence bundle request routing."
          : "Filing queue, report lifecycle, and submit / re-submit actions driven by backend filing status."
      }
      actions={
        <CanvasBtn
          theme={theme}
          variant="secondary"
          onClick={() => void refresh()}
        >
          Refresh
        </CanvasBtn>
      }
      scopeHints={[
        {
          label: "Review filing queue",
          scope: "sandbox.regulatory_report.review",
        },
        {
          label: "Submit filing",
          scope: "sandbox.regulatory_report.submit",
        },
      ]}
    >
      <PageState loading={loading} error={error}>
        {data ? (
          <>
            {message ? (
              <CanvasBanner
                theme={theme}
                tone="success"
                icon="check"
                title="Regulatory filing updated"
                body={message}
              />
            ) : null}
            {actionError ? (
              <CanvasBanner
                theme={theme}
                tone="danger"
                icon="warn"
                title="Regulatory filing action failed"
                body={actionError}
              />
            ) : null}

            {view === "regulator" ? (
              <>
                <CanvasBanner
                  theme={theme}
                  tone="info"
                  icon="lock"
                  title="Read-only regulator scope"
                  body="This view is intended for masked regulator-facing posture only. It references filings, cases, and evidence bundle request state without exposing passenger or commercial PII."
                />
                <div style={autoGridStyle("180px")}>
                  <CanvasCard theme={theme} title="Generated filings">
                    <div style={{ fontSize: 28, fontWeight: 700 }}>
                      {generatedCount}
                    </div>
                    <div style={mutedStyle}>Awaiting submit.</div>
                  </CanvasCard>
                  <CanvasCard theme={theme} title="Submitted filings">
                    <div style={{ fontSize: 28, fontWeight: 700 }}>
                      {submittedCount}
                    </div>
                    <div style={mutedStyle}>Sent to regulator.</div>
                  </CanvasCard>
                  <CanvasCard theme={theme} title="Accepted filings">
                    <div style={{ fontSize: 28, fontWeight: 700 }}>
                      {acceptedCount}
                    </div>
                    <div style={mutedStyle}>Acknowledged or accepted.</div>
                  </CanvasCard>
                  <CanvasCard theme={theme} title="Evidence bundles ready">
                    <div style={{ fontSize: 28, fontWeight: 700 }}>
                      {exportReadyCount}
                    </div>
                    <div style={mutedStyle}>Approved or completed exports.</div>
                  </CanvasCard>
                </div>

                <div style={autoGridStyle("360px")}>
                  <CanvasCard
                    theme={theme}
                    title="Regulator filing queue"
                    subtitle="masked operational context"
                    padding={0}
                  >
                    <CanvasTable
                      theme={theme}
                      columns={[
                        {
                          h: "Report",
                          w: 190,
                          r: (row: RegulatoryReportFiling) => (
                            <span style={monoStyle}>{row.reportId}</span>
                          ),
                        },
                        {
                          h: "Jurisdiction",
                          w: 140,
                          r: (row: RegulatoryReportFiling) =>
                            humanizeToken(row.jurisdiction),
                        },
                        {
                          h: "Status",
                          w: 140,
                          r: (row: RegulatoryReportFiling) =>
                            statusPill(
                              humanizeToken(row.status),
                              reportStatusTone(row.status),
                            ),
                        },
                        {
                          h: "Linked case",
                          w: 160,
                          r: (row: RegulatoryReportFiling) =>
                            row.caseId ? (
                              <span style={monoStyle}>{row.caseId}</span>
                            ) : (
                              <span style={mutedStyle}>
                                Program-level filing
                              </span>
                            ),
                        },
                      ]}
                      rows={reportRows(data.regulatoryReports)}
                    />
                  </CanvasCard>

                  <CanvasCard
                    theme={theme}
                    title="Evidence package request posture"
                    subtitle="bundle request routing"
                  >
                    <div style={cardStackStyle}>
                      <div style={mutedStyle}>
                        Approved / completed controlled exports:{" "}
                        {exportReadyCount}
                      </div>
                      <div style={mutedStyle}>
                        Active legal holds:{" "}
                        {
                          data.legalHolds.filter(
                            (item) => item.status !== "released",
                          ).length
                        }
                      </div>
                      <div style={mutedStyle}>
                        Evidence bundle requests remain routed through the
                        controlled export queue and inherit four-eyes approval.
                      </div>
                    </div>
                  </CanvasCard>
                </div>
              </>
            ) : (
              <>
                <div style={autoGridStyle("180px")}>
                  <CanvasCard theme={theme} title="Generated">
                    <div style={{ fontSize: 28, fontWeight: 700 }}>
                      {generatedCount}
                    </div>
                    <div style={mutedStyle}>Ready for submit.</div>
                  </CanvasCard>
                  <CanvasCard theme={theme} title="Submitted">
                    <div style={{ fontSize: 28, fontWeight: 700 }}>
                      {submittedCount}
                    </div>
                    <div style={mutedStyle}>Awaiting regulator response.</div>
                  </CanvasCard>
                  <CanvasCard theme={theme} title="Accepted">
                    <div style={{ fontSize: 28, fontWeight: 700 }}>
                      {acceptedCount}
                    </div>
                    <div style={mutedStyle}>Accepted filings.</div>
                  </CanvasCard>
                </div>

                <CanvasCard
                  theme={theme}
                  title="Report jobs queue"
                  subtitle="filing lifecycle and linked case state"
                  padding={0}
                >
                  <CanvasTable
                    theme={theme}
                    columns={[
                      {
                        h: "Report",
                        w: 200,
                        r: (row: RegulatoryReportFiling) => (
                          <div style={cardStackStyle}>
                            <span style={monoStyle}>{row.reportId}</span>
                            <span style={mutedStyle}>
                              {humanizeToken(row.reportType)}
                            </span>
                          </div>
                        ),
                      },
                      {
                        h: "Window",
                        w: 180,
                        r: (row: RegulatoryReportFiling) => (
                          <div style={cardStackStyle}>
                            <span style={mutedStyle}>
                              {compactDate(row.periodStart)}
                            </span>
                            <span style={mutedStyle}>
                              {compactDate(row.periodEnd)}
                            </span>
                          </div>
                        ),
                      },
                      {
                        h: "Status",
                        w: 140,
                        r: (row: RegulatoryReportFiling) =>
                          statusPill(
                            humanizeToken(row.status),
                            reportStatusTone(row.status),
                          ),
                      },
                      {
                        h: "Case / manifest",
                        w: 200,
                        r: (row: RegulatoryReportFiling) => (
                          <div style={cardStackStyle}>
                            <span style={monoStyle}>
                              {row.caseId ?? "Program-level"}
                            </span>
                            <span style={mutedStyle}>
                              {row.evidenceManifestId ?? "No manifest"}
                            </span>
                          </div>
                        ),
                      },
                      {
                        h: "Action",
                        w: 170,
                        r: (row: RegulatoryReportFiling) => {
                          const canSubmit =
                            row.status === "draft" ||
                            row.status === "generated" ||
                            row.status === "rejected";
                          return canSubmit ? (
                            <CanvasBtn
                              theme={theme}
                              variant="primary"
                              disabled={busyId === row.reportId}
                              onClick={() =>
                                void handleSubmitReport(row.reportId)
                              }
                            >
                              {busyId === row.reportId
                                ? "Submitting…"
                                : row.status === "rejected"
                                  ? "Re-submit"
                                  : "Submit"}
                            </CanvasBtn>
                          ) : (
                            <span style={mutedStyle}>No submit action</span>
                          );
                        },
                      },
                    ]}
                    rows={reportRows(data.regulatoryReports)}
                  />
                </CanvasCard>
              </>
            )}
          </>
        ) : null}
      </PageState>
    </ComplianceConsoleFrame>
  );
}
