"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import React, {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type {
  AccidentCaseRecord,
  ActionReceipt,
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
import { usePlatformAdminAuthority } from "@/lib/platform-admin-authority";
import {
  accidentSeverityTone,
  confidenceTone,
  custodyStateTone,
  exportStatusTone,
  findInvestigationForDiscrepancy,
  findTakeoverReview,
  investigationHref,
  investigationStatusTone,
  investigationTimelineHref,
  legalHoldStatusTone,
  loadSandboxComplianceOverview,
  loadSandboxInvestigationDetail,
  loadSandboxRegulatorCaseDetail,
  loadSandboxRegulatorCases,
  manifestHref,
  regulatorBundleTone,
  regulatorNotificationTone,
  reportStatusTone,
  sourceTone,
  tripDiscrepancies,
  tripHref,
  tripInvestigations,
  tripTakeoverReviews,
  truncateHash,
  uniqueManifestIds,
} from "@/lib/sandbox-compliance";
import { useTranslation } from "@/lib/i18n";

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

const SCOPE_CONTROLLED_EXPORT_REQUEST = "sandbox.evidence.export.request";
const SCOPE_CONTROLLED_EXPORT_APPROVE = "sandbox.evidence.export.approve";
const SCOPE_LEGAL_HOLD_PLACE = "sandbox.legal_hold.place";
const SCOPE_LEGAL_HOLD_RELEASE_REQUEST = "sandbox.legal_hold.release.request";
const SCOPE_LEGAL_HOLD_RELEASE_APPROVE = "sandbox.legal_hold.release.approve";
const SCOPE_REGULATORY_REPORT_SUBMIT = "sandbox.regulatory_report.submit";

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

const EMPTY_VALUE = "—";

type TranslationFn = (
  key: string,
  params?: Record<string, string | number>,
) => string;

const COMPLIANCE_CODE_KEYS: Record<string, string> = {
  accepted: "cmp.code.accepted",
  active: "cmp.code.active",
  accident_case: "cmp.code.accidentCase",
  approved: "cmp.code.approved",
  captured: "cmp.code.captured",
  clear: "cmp.code.clear",
  closed: "cmp.code.closed",
  completed: "cmp.code.completed",
  draft: "cmp.code.draft",
  evidence_frozen: "cmp.code.evidenceFrozen",
  fatal: "cmp.code.fatal",
  generated: "cmp.code.generated",
  initial_notification_sent: "cmp.code.initialNotificationSent",
  major: "cmp.code.major",
  minor: "cmp.code.minor",
  near_miss: "cmp.code.nearMiss",
  operator_reported: "cmp.code.operatorReported",
  pending: "cmp.code.pending",
  pending_approval: "cmp.code.pendingApproval",
  platform_recorded: "cmp.code.platformRecorded",
  provider_reported: "cmp.code.providerReported",
  provider_signed: "cmp.code.providerSigned",
  purged: "cmp.code.purged",
  rejected: "cmp.code.rejected",
  regulator_review: "cmp.code.regulatorReview",
  release_requested: "cmp.code.releaseRequested",
  released: "cmp.code.released",
  sealed: "cmp.code.sealed",
  submitted: "cmp.code.submitted",
  system_derived: "cmp.code.systemDerived",
  under_investigation: "cmp.code.underInvestigation",
  unknown: "cmp.code.unknown",
  uploaded: "cmp.code.uploaded",
  verified: "cmp.code.verified",
};

const COMPLIANCE_SOURCE_KEYS: Record<string, string> = {
  manual_entry: "cmp.source.manualEntry",
  onboard_recorder: "cmp.source.vehicleRecorded",
  regulatory_filing: "cmp.source.regulatoryFiling",
  roc_operator: "cmp.source.rocInput",
  sandbox_governance: "cmp.source.sandboxGovernance",
  tesla_fleet_api: "cmp.source.teslaProvided",
  tesla_public_telemetry: "cmp.source.teslaProvided",
};

const REGULATOR_BUNDLE_STATE_KEYS: Record<string, string> = {
  missing_manifest: "cmp.regulator.bundle.missingManifest",
  manifest_ready: "cmp.regulator.bundle.manifestReady",
  bundle_generated: "cmp.regulator.bundle.bundleGenerated",
  export_pending_approval: "cmp.regulator.bundle.exportPendingApproval",
  export_approved: "cmp.regulator.bundle.exportApproved",
  export_completed: "cmp.regulator.bundle.exportCompleted",
  export_rejected: "cmp.regulator.bundle.exportRejected",
};

const REGULATOR_NOTIFICATION_STATE_KEYS: Record<string, string> = {
  not_started: "cmp.regulator.notification.notStarted",
  draft: "cmp.regulator.notification.draft",
  review_pending: "cmp.regulator.notification.reviewPending",
  review_approved: "cmp.regulator.notification.reviewApproved",
  submitted: "cmp.regulator.notification.submitted",
  acknowledged: "cmp.regulator.notification.acknowledged",
};

function humanizeToken(value: string | null | undefined) {
  if (!value) {
    return EMPTY_VALUE;
  }
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function compactDate(value: string | null | undefined) {
  return value ? formatDateTime(value) : EMPTY_VALUE;
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

function formatComplianceCode(
  t: TranslationFn,
  value: string | null | undefined,
) {
  if (!value) {
    return EMPTY_VALUE;
  }

  const key = COMPLIANCE_CODE_KEYS[value];
  return key ? t(key) : humanizeToken(value);
}

function formatComplianceSource(t: TranslationFn, sourceSystem: string) {
  const key = COMPLIANCE_SOURCE_KEYS[sourceSystem];
  return key ? t(key) : humanizeToken(sourceSystem);
}

function formatRegulatorBundleState(t: TranslationFn, value: string) {
  const key = REGULATOR_BUNDLE_STATE_KEYS[value];
  return key ? t(key) : humanizeToken(value);
}

function formatRegulatorNotificationState(t: TranslationFn, value: string) {
  const key = REGULATOR_NOTIFICATION_STATE_KEYS[value];
  return key ? t(key) : humanizeToken(value);
}

function timelineSourceLabel(t: TranslationFn, entry: AccidentTimelineEntry) {
  switch (entry.sourceSystem) {
    case "system_derived":
      return t("cmp.code.systemDerived");
    case "accident_case":
      return t("cmp.code.accidentCase");
    default:
      return formatComplianceSource(t, entry.sourceSystem);
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

function hasScope(scopeSet: ReadonlySet<string>, scope: string) {
  return scopeSet.has(scope);
}

function missingScopeMessage(t: TranslationFn, scope: string) {
  return t("cmp.scope.requires", { scope });
}

function actionStatusText(message: string) {
  return <span style={mutedStyle}>{message}</span>;
}

function scopeCard(
  t: TranslationFn,
  title: string,
  hints: ScopeHint[],
  actorId: string,
  scopeSet: ReadonlySet<string>,
) {
  return (
    <CanvasCard
      theme={theme}
      title={title}
      subtitle={t("cmp.scope.currentActor", { actorId })}
    >
      <div style={scopeListStyle}>
        {hints.map((hint) => {
          const granted = hasScope(scopeSet, hint.scope);

          return (
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
                <CanvasPill theme={theme} tone={granted ? "success" : "warn"}>
                  {hint.scope}
                </CanvasPill>
                <CanvasPill
                  theme={theme}
                  tone={granted ? "success" : "neutral"}
                >
                  {granted ? t("cmp.scope.granted") : t("cmp.scope.missing")}
                </CanvasPill>
              </div>
              {!granted ? (
                <div style={mutedStyle}>
                  {missingScopeMessage(t, hint.scope)}
                </div>
              ) : null}
              {hint.blocked ? (
                <div style={mutedStyle}>{hint.blocked}</div>
              ) : null}
            </div>
          );
        })}
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
  const { t } = useTranslation();

  if (loading) {
    return (
      <CanvasCard theme={theme}>
        <div style={emptyStateStyle}>{t("cmp.pageState.loading")}</div>
      </CanvasCard>
    );
  }

  if (error) {
    return (
      <CanvasBanner
        theme={theme}
        tone="danger"
        icon="warn"
        title={t("cmp.pageState.loadErrorTitle")}
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
  const { t } = useTranslation();
  const authority = usePlatformAdminAuthority();
  const scopeSet = useMemo(() => new Set(authority.scopes), [authority.scopes]);
  const tripId = context?.tripId ?? null;
  const caseId = context?.caseId ?? null;
  const manifestId = context?.manifestId ?? null;

  const sections = [
    {
      label: t("cmp.shell.section.investigation"),
      items: [
        {
          key: "dashboard" as const,
          label: t("cmp.shell.nav.dashboard"),
          href: "/platform-admin/compliance",
        },
        {
          key: "trips" as const,
          label: t("cmp.shell.nav.trips"),
          href: tripId ? tripHref(tripId) : null,
        },
        {
          key: "takeover" as const,
          label: t("cmp.shell.nav.takeover"),
          href: "/platform-admin/investigations?view=takeover",
        },
        {
          key: "accident" as const,
          label: t("cmp.shell.nav.accident"),
          href: caseId
            ? investigationHref(caseId)
            : "/platform-admin/investigations",
        },
      ],
    },
    {
      label: t("cmp.shell.section.evidence"),
      items: [
        {
          key: "timeline" as const,
          label: t("cmp.shell.nav.timeline"),
          href: caseId ? investigationTimelineHref(caseId) : null,
        },
        {
          key: "manifest" as const,
          label: t("cmp.shell.nav.manifest"),
          href: manifestId ? manifestHref(manifestId) : null,
        },
        {
          key: "export" as const,
          label: t("cmp.shell.nav.export"),
          href: "/platform-admin/evidence/exports",
        },
        {
          key: "legalhold" as const,
          label: t("cmp.shell.nav.legalHold"),
          href: "/platform-admin/evidence/legal-holds",
        },
      ],
    },
    {
      label: t("cmp.shell.section.regulatory"),
      items: [
        {
          key: "reportjobs" as const,
          label: t("cmp.shell.nav.reportJobs"),
          href: "/platform-admin/regulatory-reports",
        },
        {
          key: "regulator" as const,
          label: t("cmp.shell.nav.regulator"),
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
            title={t("cmp.shell.title")}
            subtitle={t("cmp.shell.subtitle")}
          >
            <div style={cardStackStyle}>
              <div style={mutedStyle}>{t("cmp.shell.note")}</div>
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
                              {t("cmp.shell.live")}
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
                title={t("cmp.shell.scopeBannerTitle")}
                body={t("cmp.shell.scopeBannerBody")}
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
              ? scopeCard(
                  t,
                  t("cmp.scope.authorityPosture"),
                  scopeHints,
                  authority.actorId,
                  scopeSet,
                )
              : null}
            {children}
          </div>
        </section>
      </div>
    </div>
  );
}

function buildLocalizedTripComplianceChecks(
  t: TranslationFn,
  input: {
    tripId: string;
    investigations: AccidentCaseRecord[];
    takeoverReviews: CorrelatedTakeoverCase[];
    discrepancies: EvidenceDiscrepancyCase[];
    legalHolds: SandboxLegalHoldRecord[];
  },
) {
  const investigations = tripInvestigations(input.investigations, input.tripId);
  const takeoverReviews = tripTakeoverReviews(
    input.takeoverReviews,
    input.tripId,
  );
  const discrepancies = tripDiscrepancies(
    input.discrepancies,
    input.takeoverReviews,
    input.tripId,
  );
  const investigation = investigations[0] ?? null;
  const manifestId = investigation?.evidenceManifestId ?? null;
  const hasLegalHold = manifestId
    ? input.legalHolds.some(
        (item) => item.manifestId === manifestId && item.status !== "released",
      )
    : false;

  return [
    {
      label: t("cmp.trip.check.takeover.label"),
      passed: takeoverReviews.length > 0,
      detail:
        takeoverReviews.length > 0
          ? t("cmp.trip.check.takeover.passDetail", {
              count: takeoverReviews.length,
            })
          : t("cmp.trip.check.takeover.failDetail"),
    },
    {
      label: t("cmp.trip.check.investigation.label"),
      passed: Boolean(investigation),
      detail: investigation
        ? t("cmp.trip.check.investigation.passDetail", {
            caseId: investigation.caseId,
            status: formatComplianceCode(t, investigation.status),
          })
        : t("cmp.trip.check.investigation.failDetail"),
    },
    {
      label: t("cmp.trip.check.manifest.label"),
      passed: Boolean(manifestId),
      detail: manifestId
        ? t("cmp.trip.check.manifest.passDetail", { manifestId })
        : t("cmp.trip.check.manifest.failDetail"),
    },
    {
      label: t("cmp.trip.check.discrepancy.label"),
      passed: discrepancies.length === 0,
      detail:
        discrepancies.length === 0
          ? t("cmp.trip.check.discrepancy.passDetail")
          : t("cmp.trip.check.discrepancy.failDetail", {
              count: discrepancies.length,
            }),
    },
    {
      label: t("cmp.trip.check.hold.label"),
      passed: !hasLegalHold,
      detail: hasLegalHold
        ? t("cmp.trip.check.hold.failDetail")
        : t("cmp.trip.check.hold.passDetail"),
    },
  ];
}

function resolveFocusBannerText(
  t: TranslationFn,
  input: {
    takeoverCaseId: string | null;
    discrepancyCaseId: string | null;
    takeoverReview?: CorrelatedTakeoverCase | null;
    discrepancy?: EvidenceDiscrepancyCase | null;
  },
) {
  if (input.takeoverCaseId) {
    if (input.takeoverReview) {
      return t("cmp.investigations.banner.takeoverLoaded", {
        takeoverId: input.takeoverReview.correlatedTakeoverCaseId,
      });
    }
    return t("cmp.investigations.banner.takeoverMissing", {
      takeoverId: input.takeoverCaseId,
    });
  }
  if (input.discrepancyCaseId) {
    if (input.discrepancy) {
      return t("cmp.investigations.banner.discrepancyLoaded", {
        discrepancyId: input.discrepancy.discrepancyCaseId,
      });
    }
    return t("cmp.investigations.banner.discrepancyMissing", {
      discrepancyId: input.discrepancyCaseId,
    });
  }
  return null;
}

function useOverviewState() {
  return useAsyncData(
    async (client) => loadSandboxComplianceOverview(client),
    [],
  );
}

function useRegulatorCasesState() {
  return useAsyncData(async (client) => loadSandboxRegulatorCases(client), []);
}

function useRegulatorCaseState(caseId: string) {
  return useAsyncData(
    async (client) => {
      if (!caseId) {
        return null;
      }
      return loadSandboxRegulatorCaseDetail(client, caseId);
    },
    [caseId],
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
  const { t } = useTranslation();
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
      title={t("cmp.dashboard.title")}
      subtitle={t("cmp.dashboard.subtitle")}
      actions={
        <CanvasBtn
          theme={theme}
          variant="secondary"
          onClick={() => void refresh()}
        >
          {t("common.refresh")}
        </CanvasBtn>
      }
      scopeHints={[
        {
          label: t("cmp.dashboard.scope.readSnapshot"),
          scope: "sandbox.compliance.read",
        },
        {
          label: t("cmp.dashboard.scope.readInvestigations"),
          scope: "sandbox.investigation.read",
        },
        {
          label: t("cmp.dashboard.scope.previewEvidence"),
          scope: "sandbox.evidence.preview",
        },
      ]}
    >
      <PageState
        loading={loading}
        error={error}
        empty={
          data && data.investigations.length === 0
            ? t("cmp.dashboard.empty")
            : null
        }
      >
        <div style={autoGridStyle("180px")}>
          <CanvasCard theme={theme} title={t("cmp.dashboard.card.open.title")}>
            <div style={{ fontSize: 28, fontWeight: 700 }}>
              {openInvestigations.length}
            </div>
            <div style={mutedStyle}>{t("cmp.dashboard.card.open.body")}</div>
          </CanvasCard>
          <CanvasCard
            theme={theme}
            title={t("cmp.dashboard.card.takeover.title")}
          >
            <div style={{ fontSize: 28, fontWeight: 700 }}>
              {data?.takeoverReviews.length ?? 0}
            </div>
            <div style={mutedStyle}>
              {t("cmp.dashboard.card.takeover.body")}
            </div>
          </CanvasCard>
          <CanvasCard
            theme={theme}
            title={t("cmp.dashboard.card.coverage.title")}
          >
            <div style={{ fontSize: 28, fontWeight: 700 }}>
              {evidenceCoverage}%
            </div>
            <div style={mutedStyle}>
              {t("cmp.dashboard.card.coverage.body")}
            </div>
          </CanvasCard>
          <CanvasCard theme={theme} title={t("cmp.dashboard.card.holds.title")}>
            <div style={{ fontSize: 28, fontWeight: 700 }}>
              {activeHolds.length}
            </div>
            <div style={mutedStyle}>{t("cmp.dashboard.card.holds.body")}</div>
          </CanvasCard>
        </div>

        <div style={autoGridStyle("360px")}>
          <CanvasCard
            theme={theme}
            title={t("cmp.dashboard.investigations.title")}
            subtitle={t("cmp.dashboard.investigations.subtitle")}
            padding={0}
          >
            <CanvasTable
              theme={theme}
              columns={[
                {
                  h: t("cmp.label.case"),
                  w: 150,
                  r: (row: AccidentCaseRecord) => (
                    <div style={cardStackStyle}>
                      <InlineLink href={investigationHref(row.caseId)}>
                        <span style={monoStyle}>{row.caseId}</span>
                      </InlineLink>
                      <span style={mutedStyle}>
                        {row.summary ?? EMPTY_VALUE}
                      </span>
                    </div>
                  ),
                },
                {
                  h: t("cmp.label.severity"),
                  w: 120,
                  r: (row: AccidentCaseRecord) =>
                    statusPill(
                      formatComplianceCode(t, row.severity),
                      accidentSeverityTone(row.severity),
                    ),
                },
                {
                  h: t("common.status"),
                  w: 140,
                  r: (row: AccidentCaseRecord) =>
                    statusPill(
                      formatComplianceCode(t, row.status),
                      investigationStatusTone(row.status),
                    ),
                },
                {
                  h: t("cmp.label.trip"),
                  w: 140,
                  r: (row: AccidentCaseRecord) =>
                    row.orderId ? (
                      <InlineLink href={tripHref(row.orderId)}>
                        {row.orderId}
                      </InlineLink>
                    ) : (
                      EMPTY_VALUE
                    ),
                },
              ]}
              rows={investigationRows(openInvestigations.slice(0, 6))}
            />
          </CanvasCard>

          <CanvasCard
            theme={theme}
            title={t("cmp.dashboard.takeoverTable.title")}
            subtitle={t("cmp.dashboard.takeoverTable.subtitle")}
            padding={0}
          >
            <CanvasTable
              theme={theme}
              columns={[
                {
                  h: t("cmp.label.takeover"),
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
                  h: t("cmp.label.trip"),
                  w: 130,
                  r: (row: CorrelatedTakeoverCase) =>
                    row.orderId ? (
                      <InlineLink href={tripHref(row.orderId)}>
                        {row.orderId}
                      </InlineLink>
                    ) : (
                      EMPTY_VALUE
                    ),
                },
                {
                  h: t("cmp.label.match"),
                  w: 120,
                  r: (row: CorrelatedTakeoverCase) =>
                    statusPill(
                      formatComplianceCode(t, row.matchedBy),
                      "accent",
                    ),
                },
                {
                  h: t("cmp.label.investigation"),
                  w: 140,
                  r: (row: CorrelatedTakeoverCase) =>
                    row.investigationLink ? (
                      <InlineLink href={row.investigationLink.route}>
                        {row.investigationLink.resourceId}
                      </InlineLink>
                    ) : (
                      <span style={mutedStyle}>
                        {t("cmp.common.notLinked")}
                      </span>
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
            title={t("cmp.dashboard.evidence.title")}
            subtitle={t("cmp.dashboard.evidence.subtitle")}
            padding={0}
          >
            <CanvasTable
              theme={theme}
              columns={[
                {
                  h: t("cmp.dashboard.evidence.kind"),
                  w: 150,
                  r: (row: Record<string, unknown>) => row.kind as ReactNode,
                },
                {
                  h: t("cmp.dashboard.evidence.subject"),
                  w: 180,
                  r: (row: Record<string, unknown>) => row.subject as ReactNode,
                },
                {
                  h: t("common.status"),
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
                    formatComplianceCode(t, item.status),
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
                    formatComplianceCode(t, item.status),
                    exportStatusTone(item.status),
                  ),
                })),
              ]}
            />
          </CanvasCard>

          <CanvasCard
            theme={theme}
            title={t("cmp.dashboard.reports.title")}
            subtitle={t("cmp.dashboard.reports.subtitle")}
            padding={0}
          >
            <CanvasTable
              theme={theme}
              columns={[
                {
                  h: t("cmp.label.report"),
                  w: 180,
                  r: (row: RegulatoryReportFiling) => (
                    <span style={monoStyle}>{row.reportId}</span>
                  ),
                },
                {
                  h: t("cmp.label.jurisdiction"),
                  w: 120,
                  r: (row: RegulatoryReportFiling) =>
                    humanizeToken(row.jurisdiction),
                },
                {
                  h: t("common.status"),
                  w: 140,
                  r: (row: RegulatoryReportFiling) =>
                    statusPill(
                      formatComplianceCode(t, row.status),
                      reportStatusTone(row.status),
                    ),
                },
                {
                  h: t("cmp.label.case"),
                  w: 140,
                  r: (row: RegulatoryReportFiling) =>
                    row.caseId ? (
                      <InlineLink href={investigationHref(row.caseId)}>
                        {row.caseId}
                      </InlineLink>
                    ) : (
                      EMPTY_VALUE
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
  const { t } = useTranslation();
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
    ? buildLocalizedTripComplianceChecks(t, {
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
      title={
        tripId
          ? t("cmp.trip.titleWithId", { tripId })
          : t("cmp.trip.titleFallback")
      }
      subtitle={t("cmp.trip.subtitle")}
      actions={
        <CanvasBtn
          theme={theme}
          variant="secondary"
          onClick={() => void refresh()}
        >
          {t("common.refresh")}
        </CanvasBtn>
      }
      context={{
        tripId,
        caseId: investigation?.caseId ?? null,
        manifestId,
      }}
      scopeHints={[
        {
          label: t("cmp.trip.scope.readTrip"),
          scope: "sandbox.compliance.read",
        },
        {
          label: t("cmp.trip.scope.readInvestigation"),
          scope: "sandbox.investigation.read",
        },
        {
          label: t("cmp.trip.scope.previewEvidence"),
          scope: "sandbox.evidence.preview",
        },
      ]}
    >
      <PageState
        loading={loading}
        error={error}
        empty={
          data && investigations.length === 0 && takeovers.length === 0
            ? t("cmp.trip.empty", { tripId })
            : null
        }
      >
        <div style={autoGridStyle("320px")}>
          <CanvasCard
            theme={theme}
            title={t("cmp.trip.checksTitle")}
            subtitle={t("cmp.trip.checksSubtitle")}
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
                      check.passed
                        ? t("cmp.common.pass")
                        : t("cmp.common.needsReview"),
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
            title={t("cmp.trip.postureTitle")}
            subtitle={t("cmp.trip.postureSubtitle")}
          >
            <CanvasDL
              theme={theme}
              cols={2}
              items={[
                {
                  k: t("cmp.label.investigation"),
                  v: investigation?.caseId ?? EMPTY_VALUE,
                  mono: true,
                },
                {
                  k: t("cmp.label.manifest"),
                  v: manifestId ?? EMPTY_VALUE,
                  mono: true,
                },
                {
                  k: t("cmp.label.takeovers"),
                  v: String(takeovers.length),
                  mono: true,
                },
                {
                  k: t("cmp.label.discrepancies"),
                  v: String(discrepancies.length),
                  mono: true,
                },
                {
                  k: t("cmp.label.legalHold"),
                  v: hold
                    ? statusPill(
                        formatComplianceCode(t, hold.status),
                        legalHoldStatusTone(hold.status),
                      )
                    : t("cmp.common.none"),
                },
                {
                  k: t("cmp.label.report"),
                  v: report
                    ? statusPill(
                        formatComplianceCode(t, report.status),
                        reportStatusTone(report.status),
                      )
                    : t("cmp.common.none"),
                },
              ]}
            />
          </CanvasCard>
        </div>

        <div style={autoGridStyle("320px")}>
          <CanvasCard
            theme={theme}
            title={t("cmp.trip.linkedInvestigationTitle")}
            subtitle={t("cmp.trip.linkedInvestigationSubtitle")}
          >
            <CanvasDL
              theme={theme}
              cols={2}
              items={[
                {
                  k: t("cmp.label.case"),
                  v: investigation?.caseId ? (
                    <InlineLink href={investigationHref(investigation.caseId)}>
                      {investigation.caseId}
                    </InlineLink>
                  ) : (
                    EMPTY_VALUE
                  ),
                },
                {
                  k: t("common.status"),
                  v: investigation
                    ? statusPill(
                        formatComplianceCode(t, investigation.status),
                        investigationStatusTone(investigation.status),
                      )
                    : EMPTY_VALUE,
                },
                {
                  k: t("cmp.label.severity"),
                  v: investigation
                    ? statusPill(
                        formatComplianceCode(t, investigation.severity),
                        accidentSeverityTone(investigation.severity),
                      )
                    : EMPTY_VALUE,
                },
                {
                  k: t("cmp.label.occurred"),
                  v: compactDate(investigation?.occurredAt),
                },
                {
                  k: t("cmp.label.timeline"),
                  v: investigation?.caseId ? (
                    <InlineLink
                      href={investigationTimelineHref(investigation.caseId)}
                    >
                      {t("cmp.trip.openTimeline")}
                    </InlineLink>
                  ) : (
                    EMPTY_VALUE
                  ),
                },
                {
                  k: t("cmp.label.manifest"),
                  v: manifestId ? (
                    <InlineLink href={manifestHref(manifestId)}>
                      {manifestId}
                    </InlineLink>
                  ) : (
                    EMPTY_VALUE
                  ),
                },
              ]}
            />
          </CanvasCard>

          <CanvasCard
            theme={theme}
            title={t("cmp.trip.correlationTitle")}
            subtitle={t("cmp.trip.correlationSubtitle")}
            padding={0}
          >
            <CanvasTable
              theme={theme}
              columns={[
                {
                  h: t("cmp.label.record"),
                  w: 150,
                  r: (row: Record<string, unknown>) => row.record as ReactNode,
                },
                {
                  h: t("common.status"),
                  w: 160,
                  r: (row: Record<string, unknown>) => row.status as ReactNode,
                },
                {
                  h: t("cmp.label.notes"),
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
                  status: statusPill(
                    formatComplianceCode(t, item.matchedBy),
                    "accent",
                  ),
                  notes: (
                    <span style={mutedStyle}>
                      {t("cmp.trip.safetyTimestamp")}{" "}
                      {compactDate(item.sourceTimestamps.safetyOccurredAt)}
                    </span>
                  ),
                })),
                ...discrepancies.map((item) => ({
                  record: (
                    <span style={monoStyle}>{item.discrepancyCaseId}</span>
                  ),
                  status: statusPill(
                    t("cmp.trip.discrepancyCount", {
                      count: item.discrepancyTypes.length,
                    }),
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
            title={t("cmp.trip.exportsTitle")}
            subtitle={t("cmp.trip.exportsSubtitle")}
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
                    formatComplianceCode(t, item.status),
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
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const takeoverCaseId = searchParams.get("takeoverCaseId");
  const discrepancyCaseId = searchParams.get("discrepancyCaseId");
  const view =
    searchParams.get("view") === "takeover" ? "takeover" : "accident";
  const { data, loading, error, refresh } = useOverviewState();

  const bannerText = data
    ? resolveFocusBannerText(t, {
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
          ? t("cmp.investigations.takeoverTitle")
          : t("cmp.investigations.accidentTitle")
      }
      subtitle={
        view === "takeover"
          ? t("cmp.investigations.takeoverSubtitle")
          : t("cmp.investigations.accidentSubtitle")
      }
      actions={
        <CanvasBtn
          theme={theme}
          variant="secondary"
          onClick={() => void refresh()}
        >
          {t("common.refresh")}
        </CanvasBtn>
      }
      scopeHints={[
        {
          label: t("cmp.investigations.scope.readInvestigations"),
          scope: "sandbox.investigation.read",
        },
        {
          label: t("cmp.investigations.scope.readTakeover"),
          scope: "sandbox.compliance.read",
        },
      ]}
    >
      {bannerText ? (
        <CanvasBanner
          theme={theme}
          tone="accent"
          icon="info"
          title={t("cmp.investigations.banner.title")}
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
            ? t("cmp.investigations.empty")
            : null
        }
      >
        {view === "takeover" ? (
          <div style={pageStackStyle}>
            <CanvasCard
              theme={theme}
              title={t("cmp.investigations.takeoverQueueTitle")}
              subtitle={t("cmp.investigations.takeoverQueueSubtitle")}
              padding={0}
            >
              <CanvasTable
                theme={theme}
                columns={[
                  {
                    h: t("cmp.label.takeover"),
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
                    h: t("cmp.label.vehicleTrip"),
                    w: 150,
                    r: (row: CorrelatedTakeoverCase) => (
                      <div style={cardStackStyle}>
                        <span style={monoStyle}>{row.vehicleId}</span>
                        <span style={mutedStyle}>
                          {row.orderId ?? t("cmp.common.noTripLinked")}
                        </span>
                      </div>
                    ),
                  },
                  {
                    h: t("cmp.label.matchMode"),
                    w: 120,
                    r: (row: CorrelatedTakeoverCase) =>
                      statusPill(
                        formatComplianceCode(t, row.matchedBy),
                        "accent",
                      ),
                  },
                  {
                    h: t("cmp.label.discrepancies"),
                    w: 120,
                    r: (row: CorrelatedTakeoverCase) =>
                      row.discrepancyCaseIds.length > 0
                        ? statusPill(
                            t("cmp.investigations.openCount", {
                              count: row.discrepancyCaseIds.length,
                            }),
                            "warn",
                          )
                        : statusPill(t("cmp.code.clear"), "success"),
                  },
                  {
                    h: t("cmp.label.investigation"),
                    w: 160,
                    r: (row: CorrelatedTakeoverCase) =>
                      row.investigationLink ? (
                        <InlineLink href={row.investigationLink.route}>
                          {row.investigationLink.resourceId}
                        </InlineLink>
                      ) : (
                        <span style={mutedStyle}>
                          {t("cmp.common.unlinked")}
                        </span>
                      ),
                  },
                ]}
                rows={takeoverRows(data?.takeoverReviews ?? [])}
              />
            </CanvasCard>

            <CanvasCard
              theme={theme}
              title={t("cmp.investigations.discrepancyQueueTitle")}
              subtitle={t("cmp.investigations.discrepancyQueueSubtitle")}
              padding={0}
            >
              <CanvasTable
                theme={theme}
                columns={[
                  {
                    h: t("cmp.label.case"),
                    w: 160,
                    r: (row: EvidenceDiscrepancyCase) => (
                      <div style={cardStackStyle}>
                        <span style={monoStyle}>{row.discrepancyCaseId}</span>
                        <span style={mutedStyle}>{row.summary}</span>
                      </div>
                    ),
                  },
                  {
                    h: t("cmp.label.types"),
                    w: 180,
                    r: (row: EvidenceDiscrepancyCase) => (
                      <div style={evidenceChipRowStyle}>
                        {row.discrepancyTypes.map((item) =>
                          statusPill(
                            formatComplianceCode(t, item),
                            "warn",
                            false,
                          ),
                        )}
                      </div>
                    ),
                  },
                  {
                    h: t("cmp.label.takeover"),
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
                        <span style={mutedStyle}>
                          {t("cmp.common.missingReview")}
                        </span>
                      ),
                  },
                  {
                    h: t("cmp.label.investigation"),
                    w: 160,
                    r: (row: EvidenceDiscrepancyCase) =>
                      row.investigationLink ? (
                        <InlineLink href={row.investigationLink.route}>
                          {row.investigationLink.resourceId}
                        </InlineLink>
                      ) : (
                        <span style={mutedStyle}>
                          {t("cmp.common.unlinked")}
                        </span>
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
              title={t("cmp.investigations.queueTitle")}
              subtitle={t("cmp.investigations.queueSubtitle")}
              padding={0}
            >
              <CanvasTable
                theme={theme}
                columns={[
                  {
                    h: t("cmp.label.case"),
                    w: 170,
                    r: (row: AccidentCaseRecord) => (
                      <div style={cardStackStyle}>
                        <InlineLink href={investigationHref(row.caseId)}>
                          <span style={monoStyle}>{row.caseId}</span>
                        </InlineLink>
                        <span style={mutedStyle}>
                          {row.summary ?? EMPTY_VALUE}
                        </span>
                      </div>
                    ),
                  },
                  {
                    h: t("cmp.label.severity"),
                    w: 110,
                    r: (row: AccidentCaseRecord) =>
                      statusPill(
                        formatComplianceCode(t, row.severity),
                        accidentSeverityTone(row.severity),
                      ),
                  },
                  {
                    h: t("common.status"),
                    w: 140,
                    r: (row: AccidentCaseRecord) =>
                      statusPill(
                        formatComplianceCode(t, row.status),
                        investigationStatusTone(row.status),
                      ),
                  },
                  {
                    h: t("cmp.label.tripManifest"),
                    w: 180,
                    r: (row: AccidentCaseRecord) => (
                      <div style={cardStackStyle}>
                        {row.orderId ? (
                          <InlineLink href={tripHref(row.orderId)}>
                            {row.orderId}
                          </InlineLink>
                        ) : (
                          <span style={mutedStyle}>
                            {t("cmp.common.noTripLinked")}
                          </span>
                        )}
                        {row.evidenceManifestId ? (
                          <InlineLink
                            href={manifestHref(row.evidenceManifestId)}
                          >
                            {row.evidenceManifestId}
                          </InlineLink>
                        ) : (
                          <span style={mutedStyle}>
                            {t("cmp.common.noManifestLinked")}
                          </span>
                        )}
                      </div>
                    ),
                  },
                  {
                    h: t("cmp.label.timeline"),
                    w: 140,
                    r: (row: AccidentCaseRecord) => (
                      <InlineLink href={investigationTimelineHref(row.caseId)}>
                        {t("cmp.investigations.openFacts")}
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
                title={t("cmp.investigations.linkedCasesTitle")}
                subtitle={t("cmp.investigations.linkedCasesSubtitle")}
                padding={0}
              >
                <CanvasTable
                  theme={theme}
                  columns={[
                    {
                      h: t("cmp.label.discrepancy"),
                      w: 160,
                      r: (row: EvidenceDiscrepancyCase) => (
                        <span style={monoStyle}>{row.discrepancyCaseId}</span>
                      ),
                    },
                    {
                      h: t("cmp.label.summary"),
                      w: 280,
                      r: (row: EvidenceDiscrepancyCase) => (
                        <span style={mutedStyle}>{row.summary}</span>
                      ),
                    },
                    {
                      h: t("cmp.label.investigation"),
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
                          <span style={mutedStyle}>
                            {t("cmp.common.unlinked")}
                          </span>
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
                title={t("cmp.investigations.healthTitle")}
                subtitle={t("cmp.investigations.healthSubtitle")}
              >
                <div style={cardStackStyle}>
                  <div style={mutedStyle}>
                    {t("cmp.investigations.health.openInvestigations")}{" "}
                    {data?.investigations.filter(
                      (item) => item.status !== "closed",
                    ).length ?? 0}
                  </div>
                  <div style={mutedStyle}>
                    {t("cmp.investigations.health.takeoversWithDiscrepancies")}{" "}
                    {data?.takeoverReviews.filter(
                      (item) => item.discrepancyCaseIds.length > 0,
                    ).length ?? 0}
                  </div>
                  <div style={mutedStyle}>
                    {t("cmp.investigations.health.awaitingNotification")}{" "}
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
  const { t } = useTranslation();
  const caseId = useCurrentParam("caseId");
  const { data, loading, error, refresh } = useInvestigationState(caseId);

  return (
    <ComplianceConsoleFrame
      active="accident"
      title={
        caseId
          ? t("cmp.caseDetail.titleWithId", { caseId })
          : t("cmp.caseDetail.titleFallback")
      }
      subtitle={t("cmp.caseDetail.subtitle")}
      actions={
        <CanvasBtn
          theme={theme}
          variant="secondary"
          onClick={() => void refresh()}
        >
          {t("common.refresh")}
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
          label: t("cmp.caseDetail.scope.readDetail"),
          scope: "sandbox.investigation.read",
        },
        {
          label: t("cmp.caseDetail.scope.previewEvidence"),
          scope: "sandbox.evidence.preview",
        },
        {
          label: t("cmp.caseDetail.scope.reviewFiling"),
          scope: "sandbox.regulatory_report.review",
        },
      ]}
    >
      <PageState loading={loading} error={error}>
        {data ? (
          <>
            <div style={autoGridStyle("320px")}>
              <CanvasCard
                theme={theme}
                title={t("cmp.caseDetail.summaryTitle")}
              >
                <CanvasDL
                  theme={theme}
                  cols={2}
                  items={[
                    {
                      k: t("cmp.label.case"),
                      v: data.investigation.caseId,
                      mono: true,
                    },
                    {
                      k: t("common.status"),
                      v: statusPill(
                        formatComplianceCode(t, data.investigation.status),
                        investigationStatusTone(data.investigation.status),
                      ),
                    },
                    {
                      k: t("cmp.label.severity"),
                      v: statusPill(
                        formatComplianceCode(t, data.investigation.severity),
                        accidentSeverityTone(data.investigation.severity),
                      ),
                    },
                    {
                      k: t("cmp.label.occurred"),
                      v: compactDate(data.investigation.occurredAt),
                    },
                    {
                      k: t("cmp.caseDetail.reported"),
                      v: compactDate(data.investigation.reportedAt),
                    },
                    {
                      k: t("cmp.caseDetail.reportedBy"),
                      v: data.investigation.reportedBy,
                    },
                    {
                      k: t("cmp.label.trip"),
                      v: data.investigation.orderId ?? EMPTY_VALUE,
                      mono: true,
                    },
                    {
                      k: t("cmp.label.manifest"),
                      v: data.investigation.evidenceManifestId ?? EMPTY_VALUE,
                      mono: true,
                    },
                    {
                      k: t("cmp.label.report"),
                      v:
                        data.reports.find(
                          (item) =>
                            item.reportId ===
                            data.investigation.regulatoryReportId,
                        )?.reportId ??
                        data.investigation.regulatoryReportId ??
                        EMPTY_VALUE,
                      mono: true,
                    },
                    {
                      k: t("cmp.caseDetail.discrepancyIds"),
                      v:
                        data.investigation.discrepancyCaseIds.length > 0
                          ? data.investigation.discrepancyCaseIds.join(", ")
                          : t("cmp.common.none"),
                    },
                  ]}
                />
              </CanvasCard>

              <CanvasCard
                theme={theme}
                title={t("cmp.caseDetail.actionsTitle")}
                subtitle={t("cmp.caseDetail.actionsSubtitle")}
              >
                <div style={cardStackStyle}>
                  <InlineLink
                    href={investigationTimelineHref(data.investigation.caseId)}
                  >
                    {t("cmp.caseDetail.openTimeline")}
                  </InlineLink>
                  {data.manifest ? (
                    <InlineLink href={manifestHref(data.manifest.manifestId)}>
                      {t("cmp.caseDetail.openManifest")}
                    </InlineLink>
                  ) : (
                    <span style={mutedStyle}>
                      {t("cmp.caseDetail.manifestUnavailable")}
                    </span>
                  )}
                  {data.investigation.orderId ? (
                    <InlineLink href={tripHref(data.investigation.orderId)}>
                      {t("cmp.caseDetail.openTrip")}
                    </InlineLink>
                  ) : (
                    <span style={mutedStyle}>
                      {t("cmp.caseDetail.tripUnavailable")}
                    </span>
                  )}
                  <InlineLink href="/platform-admin/regulatory-reports">
                    {t("cmp.caseDetail.openReports")}
                  </InlineLink>
                </div>
              </CanvasCard>
            </div>

            {data.investigation.summary ? (
              <CanvasBanner
                theme={theme}
                tone="accent"
                icon="info"
                title={t("cmp.caseDetail.summaryNoteTitle")}
                body={data.investigation.summary}
              />
            ) : null}

            <div style={autoGridStyle("360px")}>
              <CanvasCard
                theme={theme}
                title={t("cmp.caseDetail.timelineTitle")}
                subtitle={t("cmp.caseDetail.timelineSubtitle")}
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
                          formatComplianceCode(t, entry.confidence),
                          confidenceTone(entry.confidence),
                          false,
                        )}
                        {statusPill(
                          timelineSourceLabel(t, entry),
                          timelineSourceTone(entry),
                          false,
                        )}
                      </div>
                      <div style={mutedStyle}>
                        {entry.value === null
                          ? t("cmp.common.noValueRecorded")
                          : String(entry.value)}
                      </div>
                    </div>
                  ))}
                </div>
              </CanvasCard>

              <CanvasCard
                theme={theme}
                title={t("cmp.caseDetail.evidenceTitle")}
                subtitle={t("cmp.caseDetail.evidenceSubtitle")}
              >
                <CanvasDL
                  theme={theme}
                  cols={1}
                  items={[
                    {
                      k: t("cmp.caseDetail.manifestCustody"),
                      v: data.manifest
                        ? statusPill(
                            formatComplianceCode(t, data.manifest.custodyState),
                            custodyStateTone(data.manifest.custodyState),
                          )
                        : t("cmp.common.noManifestLinked"),
                    },
                    {
                      k: t("cmp.label.legalHold"),
                      v: data.manifest?.legalHoldActive
                        ? statusPill(t("cmp.code.active"), "warn")
                        : t("cmp.caseDetail.noActiveHold"),
                    },
                    {
                      k: t("cmp.caseDetail.knownGaps"),
                      v: data.manifest
                        ? String(data.manifest.knownGapCount)
                        : EMPTY_VALUE,
                      mono: true,
                    },
                    {
                      k: t("cmp.caseDetail.regulatoryReport"),
                      v: reportForCase(data.reports, data.investigation.caseId)
                        ? statusPill(
                            formatComplianceCode(
                              t,
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
                        : t("cmp.common.none"),
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
  const { t } = useTranslation();
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
      title={
        caseId
          ? t("cmp.timeline.titleWithId", { caseId })
          : t("cmp.timeline.titleFallback")
      }
      subtitle={t("cmp.timeline.subtitle")}
      actions={
        <CanvasBtn
          theme={theme}
          variant="secondary"
          onClick={() => void refresh()}
        >
          {t("common.refresh")}
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
          label: t("cmp.timeline.scope.readFacts"),
          scope: "sandbox.investigation.read",
        },
        {
          label: t("cmp.timeline.scope.inspectLineage"),
          scope: "sandbox.evidence.preview",
        },
      ]}
    >
      <PageState
        loading={loading}
        error={error}
        empty={
          data && sortedTimeline.length === 0
            ? t("cmp.timeline.empty", { caseId })
            : null
        }
      >
        {data ? (
          <>
            <div style={autoGridStyle("180px")}>
              <CanvasCard
                theme={theme}
                title={t("cmp.timeline.card.factsTitle")}
              >
                <div style={{ fontSize: 28, fontWeight: 700 }}>
                  {sortedTimeline.length}
                </div>
                <div style={mutedStyle}>{t("cmp.timeline.card.factsBody")}</div>
              </CanvasCard>
              <CanvasCard
                theme={theme}
                title={t("cmp.timeline.card.discrepanciesTitle")}
              >
                <div style={{ fontSize: 28, fontWeight: 700 }}>
                  {sortedTimeline.reduce(
                    (sum, item) => sum + item.discrepancyCaseIds.length,
                    0,
                  )}
                </div>
                <div style={mutedStyle}>
                  {t("cmp.timeline.card.discrepanciesBody")}
                </div>
              </CanvasCard>
              <CanvasCard
                theme={theme}
                title={t("cmp.timeline.card.docsTitle")}
              >
                <div style={{ fontSize: 28, fontWeight: 700 }}>
                  {sortedTimeline.reduce(
                    (sum, item) => sum + item.externalDocumentIds.length,
                    0,
                  )}
                </div>
                <div style={mutedStyle}>{t("cmp.timeline.card.docsBody")}</div>
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
                        formatComplianceCode(t, entry.confidence),
                        confidenceTone(entry.confidence),
                      )}
                      {statusPill(
                        timelineSourceLabel(t, entry),
                        timelineSourceTone(entry),
                      )}
                    </div>
                  </div>

                  <div style={{ fontSize: 13, color: theme.text }}>
                    {entry.value === null
                      ? t("cmp.common.noValueRecorded")
                      : String(entry.value)}
                  </div>

                  <div style={autoGridStyle("220px")}>
                    <CanvasCard
                      theme={theme}
                      title={t("cmp.timeline.lineageTitle")}
                      subtitle={t("cmp.timeline.lineageSubtitle")}
                    >
                      <CanvasDL
                        theme={theme}
                        cols={1}
                        items={[
                          {
                            k: t("cmp.timeline.sourceRef"),
                            v: entry.sourceRef ?? EMPTY_VALUE,
                            mono: true,
                          },
                          {
                            k: t("cmp.timeline.derivation"),
                            v:
                              entry.derivationRule ??
                              t("cmp.timeline.directFact"),
                          },
                          {
                            k: t("cmp.timeline.factCount"),
                            v: String(entry.facts.length),
                            mono: true,
                          },
                        ]}
                      />
                    </CanvasCard>

                    <CanvasCard
                      theme={theme}
                      title={t("cmp.timeline.linksTitle")}
                      subtitle={t("cmp.timeline.linksSubtitle")}
                    >
                      <div style={cardStackStyle}>
                        <div style={evidenceChipRowStyle}>
                          {entry.discrepancyCaseIds.length > 0
                            ? entry.discrepancyCaseIds.map((item) =>
                                statusPill(item, "warn", false),
                              )
                            : [
                                <span key="clear" style={mutedStyle}>
                                  {t("cmp.timeline.noDiscrepancyTags")}
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
                                  {t("cmp.timeline.noExternalDocuments")}
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
  const { t } = useTranslation();
  const manifestId = useCurrentParam("manifestId");
  const { data, loading, error, refresh } = useManifestState(manifestId);

  return (
    <ComplianceConsoleFrame
      active="manifest"
      title={
        manifestId
          ? t("cmp.manifest.titleWithId", { manifestId })
          : t("cmp.manifest.titleFallback")
      }
      subtitle={t("cmp.manifest.subtitle")}
      actions={
        <CanvasBtn
          theme={theme}
          variant="secondary"
          onClick={() => void refresh()}
        >
          {t("common.refresh")}
        </CanvasBtn>
      }
      context={{
        tripId: null,
        caseId: data?.caseId ?? null,
        manifestId: data?.manifestId ?? manifestId,
      }}
      scopeHints={[
        {
          label: t("cmp.manifest.scope.readManifest"),
          scope: "sandbox.evidence.preview",
        },
        {
          label: t("cmp.manifest.scope.requestExport"),
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
                title={t("cmp.manifest.holdBannerTitle")}
                body={t("cmp.manifest.holdBannerBody")}
              />
            ) : null}
            {data.knownGapCount > 0 ? (
              <CanvasBanner
                theme={theme}
                tone="info"
                icon="info"
                title={t("cmp.manifest.gapBannerTitle")}
                body={t("cmp.manifest.gapBannerBody", {
                  count: data.knownGapCount,
                })}
              />
            ) : null}

            <div style={autoGridStyle("320px")}>
              <CanvasCard theme={theme} title={t("cmp.manifest.postureTitle")}>
                <CanvasDL
                  theme={theme}
                  cols={2}
                  items={[
                    {
                      k: t("cmp.label.manifest"),
                      v: data.manifestId,
                      mono: true,
                    },
                    {
                      k: t("cmp.label.vehicle"),
                      v: data.vehicleId,
                      mono: true,
                    },
                    {
                      k: t("cmp.label.case"),
                      v: data.caseId ?? EMPTY_VALUE,
                      mono: true,
                    },
                    {
                      k: t("cmp.label.custody"),
                      v: statusPill(
                        formatComplianceCode(t, data.custodyState),
                        custodyStateTone(data.custodyState),
                      ),
                    },
                    {
                      k: t("cmp.manifest.windowStart"),
                      v: compactDate(data.windowStart),
                    },
                    {
                      k: t("cmp.manifest.windowEnd"),
                      v: compactDate(data.windowEnd),
                    },
                    {
                      k: t("cmp.label.items"),
                      v: String(data.itemCount),
                      mono: true,
                    },
                    {
                      k: t("cmp.manifest.created"),
                      v: compactDate(data.createdAt),
                    },
                  ]}
                />
              </CanvasCard>

              <CanvasCard
                theme={theme}
                title={t("cmp.manifest.navTitle")}
                subtitle={t("cmp.manifest.navSubtitle")}
              >
                <div style={cardStackStyle}>
                  {data.caseId ? (
                    <InlineLink href={investigationHref(data.caseId)}>
                      {t("cmp.manifest.openInvestigation")}
                    </InlineLink>
                  ) : (
                    <span style={mutedStyle}>
                      {t("cmp.manifest.noLinkedCase")}
                    </span>
                  )}
                  <InlineLink href="/platform-admin/evidence/legal-holds">
                    {t("cmp.manifest.openLegalHolds")}
                  </InlineLink>
                  <InlineLink href="/platform-admin/evidence/exports">
                    {t("cmp.manifest.openExports")}
                  </InlineLink>
                </div>
              </CanvasCard>
            </div>

            <CanvasCard
              theme={theme}
              title={t("cmp.manifest.itemsTitle")}
              subtitle={t("cmp.manifest.itemsSubtitle")}
              padding={0}
            >
              <CanvasTable
                theme={theme}
                columns={[
                  {
                    h: t("cmp.label.artifact"),
                    w: 220,
                    r: (row: SandboxEvidenceManifestView["items"][number]) => (
                      <div style={cardStackStyle}>
                        <span style={monoStyle}>{row.artifactId}</span>
                        <span style={mutedStyle}>{row.objectKey}</span>
                      </div>
                    ),
                  },
                  {
                    h: t("cmp.label.source"),
                    w: 180,
                    r: (row: SandboxEvidenceManifestView["items"][number]) =>
                      statusPill(
                        formatComplianceSource(t, row.source.sourceSystem),
                        sourceTone(row.source.sourceSystem),
                      ),
                  },
                  {
                    h: t("cmp.label.custody"),
                    w: 120,
                    r: (row: SandboxEvidenceManifestView["items"][number]) =>
                      statusPill(
                        formatComplianceCode(t, row.custodyState),
                        custodyStateTone(row.custodyState),
                      ),
                  },
                  {
                    h: t("cmp.manifest.captured"),
                    w: 170,
                    r: (row: SandboxEvidenceManifestView["items"][number]) =>
                      compactDate(row.capturedAt),
                  },
                  {
                    h: t("cmp.manifest.checksum"),
                    w: 120,
                    mono: true,
                    r: (row: SandboxEvidenceManifestView["items"][number]) =>
                      truncateHash(row.checksumSha256),
                  },
                  {
                    h: t("cmp.manifest.retention"),
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
  const { t } = useTranslation();
  const client = usePlatformAdminClient();
  const authority = usePlatformAdminAuthority();
  const scopeSet = useMemo(() => new Set(authority.scopes), [authority.scopes]);
  const { data, loading, error, refresh } = useOverviewState();
  const [form, setForm] = useState<ExportFormState>({
    manifestId: "",
    recipientLabel: t("cmp.exports.defaultRecipient"),
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
  const canRequestExportScope = hasScope(
    scopeSet,
    SCOPE_CONTROLLED_EXPORT_REQUEST,
  );
  const canApproveExportScope = hasScope(
    scopeSet,
    SCOPE_CONTROLLED_EXPORT_APPROVE,
  );

  async function handleRequestExport() {
    if (!canRequestExportScope) {
      setActionError(missingScopeMessage(t, SCOPE_CONTROLLED_EXPORT_REQUEST));
      return;
    }

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
        t("cmp.exports.requestSuccess", { manifestId: selectedManifestId }),
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
    if (!canApproveExportScope) {
      setActionError(missingScopeMessage(t, SCOPE_CONTROLLED_EXPORT_APPROVE));
      return;
    }

    setBusyId(exportRequestId);
    setActionError(null);
    setMessage(null);
    try {
      await client.approveSandboxControlledExport(exportRequestId, {
        approvalNote: "Approved through platform-admin compliance console.",
      });
      setMessage(t("cmp.exports.approveSuccess", { exportRequestId }));
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
      title={t("cmp.exports.title")}
      subtitle={t("cmp.exports.subtitle")}
      actions={
        <CanvasBtn
          theme={theme}
          variant="secondary"
          onClick={() => void refresh()}
        >
          {t("common.refresh")}
        </CanvasBtn>
      }
      scopeHints={[
        {
          label: t("cmp.exports.scope.request"),
          scope: SCOPE_CONTROLLED_EXPORT_REQUEST,
        },
        {
          label: t("cmp.exports.scope.approve"),
          scope: SCOPE_CONTROLLED_EXPORT_APPROVE,
          blocked: t("cmp.exports.scope.approveBlocked"),
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
              title={t("cmp.exports.stepUpTitle")}
              body={t("cmp.exports.stepUpBody")}
            />
            {message ? (
              <CanvasBanner
                theme={theme}
                tone="success"
                icon="check"
                title={t("cmp.exports.updatedTitle")}
                body={message}
              />
            ) : null}
            {actionError ? (
              <CanvasBanner
                theme={theme}
                tone="danger"
                icon="warn"
                title={t("cmp.exports.failedTitle")}
                body={actionError}
              />
            ) : null}

            <div style={autoGridStyle("360px")}>
              {canRequestExportScope ? (
                <CanvasCard
                  theme={theme}
                  title={t("cmp.exports.requestCardTitle")}
                  subtitle={t("cmp.exports.requestCardSubtitle")}
                >
                  <div style={fieldGridStyle}>
                    <div style={fieldGridStyle}>
                      <label style={fieldLabelStyle} htmlFor="export-manifest">
                        {t("cmp.label.manifest")}
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
                          <option value="">
                            {t("cmp.exports.noManifests")}
                          </option>
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
                        {t("cmp.exports.recipientLabel")}
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
                        {t("cmp.exports.recipientScope")}
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
                        {t("cmp.exports.reason")}
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
                      <span>{t("cmp.exports.stepUpConfirm")}</span>
                    </label>
                    <CanvasBtn
                      theme={theme}
                      variant="primary"
                      disabled={!canRequest || busyId === "request"}
                      onClick={() => void handleRequestExport()}
                    >
                      {busyId === "request"
                        ? t("cmp.exports.requesting")
                        : t("cmp.exports.submitRequest")}
                    </CanvasBtn>
                  </div>
                </CanvasCard>
              ) : (
                <CanvasCard
                  theme={theme}
                  title={t("cmp.exports.requestCardTitle")}
                  subtitle={t("cmp.scope.scopeRequired")}
                >
                  <div style={mutedStyle}>
                    {missingScopeMessage(t, SCOPE_CONTROLLED_EXPORT_REQUEST)}
                  </div>
                </CanvasCard>
              )}

              <CanvasCard
                theme={theme}
                title={t("cmp.exports.selectedTitle")}
                subtitle={t("cmp.exports.selectedSubtitle")}
              >
                <CanvasDL
                  theme={theme}
                  cols={1}
                  items={[
                    {
                      k: t("cmp.label.manifest"),
                      v: selectedManifestId || EMPTY_VALUE,
                      mono: true,
                    },
                    {
                      k: t("cmp.label.case"),
                      v: selectedManifestOption?.caseId ?? EMPTY_VALUE,
                      mono: true,
                    },
                    {
                      k: t("cmp.label.report"),
                      v: selectedManifestOption?.reportId ?? EMPTY_VALUE,
                      mono: true,
                    },
                    {
                      k: t("cmp.exports.approvalRule"),
                      v: t("cmp.exports.approvalRuleValue"),
                    },
                    {
                      k: t("cmp.scope.actor"),
                      v: authority.actorId,
                      mono: true,
                    },
                  ]}
                />
              </CanvasCard>
            </div>

            <CanvasCard
              theme={theme}
              title={t("cmp.exports.queueTitle")}
              subtitle={t("cmp.exports.queueSubtitle")}
              padding={0}
            >
              <CanvasTable
                theme={theme}
                columns={[
                  {
                    h: t("cmp.exports.requestColumn"),
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
                    h: t("cmp.exports.manifestCaseColumn"),
                    w: 170,
                    r: (row: SandboxControlledEvidenceExportRecord) => (
                      <div style={cardStackStyle}>
                        <span style={monoStyle}>{row.manifestId}</span>
                        <span style={mutedStyle}>
                          {row.caseId ?? t("cmp.manifest.noLinkedCase")}
                        </span>
                      </div>
                    ),
                  },
                  {
                    h: t("cmp.exports.recipientColumn"),
                    w: 220,
                    r: (row: SandboxControlledEvidenceExportRecord) => (
                      <div style={cardStackStyle}>
                        <span>{row.recipientLabel}</span>
                        <span style={mutedStyle}>{row.recipientScope}</span>
                      </div>
                    ),
                  },
                  {
                    h: t("common.status"),
                    w: 140,
                    r: (row: SandboxControlledEvidenceExportRecord) =>
                      statusPill(
                        formatComplianceCode(t, row.status),
                        exportStatusTone(row.status),
                      ),
                  },
                  {
                    h: t("cmp.exports.actorsColumn"),
                    w: 220,
                    r: (row: SandboxControlledEvidenceExportRecord) => (
                      <div style={cardStackStyle}>
                        <span style={mutedStyle}>
                          {t("cmp.exports.requester")} {row.requestedByActorId}
                        </span>
                        <span style={mutedStyle}>
                          {t("cmp.exports.approver")}{" "}
                          {row.approvedByActorId ?? t("cmp.code.pending")}
                        </span>
                      </div>
                    ),
                  },
                  {
                    h: t("common.actions"),
                    w: 180,
                    r: (row: SandboxControlledEvidenceExportRecord) => {
                      const selfApprovalBlocked =
                        row.requestedByActorId === authority.actorId;
                      const canApprove =
                        row.status === "pending_approval" &&
                        canApproveExportScope &&
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
                            ? t("cmp.exports.approving")
                            : t("common.approve")}
                        </CanvasBtn>
                      ) : row.status !== "pending_approval" ? (
                        actionStatusText(t("cmp.exports.noPendingApproval"))
                      ) : !canApproveExportScope ? (
                        actionStatusText(
                          missingScopeMessage(
                            t,
                            SCOPE_CONTROLLED_EXPORT_APPROVE,
                          ),
                        )
                      ) : selfApprovalBlocked ? (
                        actionStatusText(t("cmp.exports.selfApprovalBlocked"))
                      ) : (
                        actionStatusText(t("cmp.exports.approvalUnavailable"))
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
  const { t } = useTranslation();
  const client = usePlatformAdminClient();
  const authority = usePlatformAdminAuthority();
  const scopeSet = useMemo(() => new Set(authority.scopes), [authority.scopes]);
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
  const canPlaceHoldScope = hasScope(scopeSet, SCOPE_LEGAL_HOLD_PLACE);
  const canRequestReleaseScope = hasScope(
    scopeSet,
    SCOPE_LEGAL_HOLD_RELEASE_REQUEST,
  );
  const canApproveReleaseScope = hasScope(
    scopeSet,
    SCOPE_LEGAL_HOLD_RELEASE_APPROVE,
  );

  async function handlePlaceHold() {
    if (!canPlaceHoldScope) {
      setActionError(missingScopeMessage(t, SCOPE_LEGAL_HOLD_PLACE));
      return;
    }

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
      setMessage(
        t("cmp.legalHold.placeSuccess", { caseId: selectedCase.caseId }),
      );
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
    if (!canRequestReleaseScope) {
      setActionError(missingScopeMessage(t, SCOPE_LEGAL_HOLD_RELEASE_REQUEST));
      return;
    }

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
      setMessage(
        t("cmp.legalHold.releaseRequestSuccess", { holdId: releaseHoldId }),
      );
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
    if (!canApproveReleaseScope) {
      setActionError(missingScopeMessage(t, SCOPE_LEGAL_HOLD_RELEASE_APPROVE));
      return;
    }

    setBusyId(holdId);
    setActionError(null);
    setMessage(null);
    try {
      await client.approveSandboxLegalHoldRelease(holdId, {
        approvalNote: "Approved through platform-admin compliance console.",
      });
      setMessage(t("cmp.legalHold.releaseSuccess", { holdId }));
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
      title={t("cmp.legalHold.title")}
      subtitle={t("cmp.legalHold.subtitle")}
      actions={
        <CanvasBtn
          theme={theme}
          variant="secondary"
          onClick={() => void refresh()}
        >
          {t("common.refresh")}
        </CanvasBtn>
      }
      scopeHints={[
        {
          label: t("cmp.legalHold.scope.place"),
          scope: SCOPE_LEGAL_HOLD_PLACE,
        },
        {
          label: t("cmp.legalHold.scope.requestRelease"),
          scope: SCOPE_LEGAL_HOLD_RELEASE_REQUEST,
        },
        {
          label: t("cmp.legalHold.scope.approveRelease"),
          scope: SCOPE_LEGAL_HOLD_RELEASE_APPROVE,
          blocked: t("cmp.legalHold.scope.releaseBlocked"),
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
              title={t("cmp.legalHold.ruleTitle")}
              body={t("cmp.legalHold.ruleBody")}
            />
            {message ? (
              <CanvasBanner
                theme={theme}
                tone="success"
                icon="check"
                title={t("cmp.legalHold.updatedTitle")}
                body={message}
              />
            ) : null}
            {actionError ? (
              <CanvasBanner
                theme={theme}
                tone="danger"
                icon="warn"
                title={t("cmp.legalHold.failedTitle")}
                body={actionError}
              />
            ) : null}

            <div style={autoGridStyle("360px")}>
              {canPlaceHoldScope ? (
                <CanvasCard
                  theme={theme}
                  title={t("cmp.legalHold.placeCardTitle")}
                  subtitle={t("cmp.legalHold.placeCardSubtitle")}
                >
                  <div style={fieldGridStyle}>
                    <div style={fieldGridStyle}>
                      <label style={fieldLabelStyle} htmlFor="hold-case">
                        {t("cmp.legalHold.investigationCase")}
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
                          <option value="">{t("cmp.legalHold.noCases")}</option>
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
                        {t("cmp.legalHold.scopeSummary")}
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
                        {t("cmp.legalHold.holdReason")}
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
                        {t("cmp.legalHold.expiration")}
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
                      {busyId === "place"
                        ? t("cmp.legalHold.placing")
                        : t("cmp.legalHold.placeAction")}
                    </CanvasBtn>
                  </div>
                </CanvasCard>
              ) : (
                <CanvasCard
                  theme={theme}
                  title={t("cmp.legalHold.placeCardTitle")}
                  subtitle={t("cmp.scope.scopeRequired")}
                >
                  <div style={mutedStyle}>
                    {missingScopeMessage(t, SCOPE_LEGAL_HOLD_PLACE)}
                  </div>
                </CanvasCard>
              )}

              <CanvasCard
                theme={theme}
                title={t("cmp.legalHold.selectedTitle")}
                subtitle={t("cmp.legalHold.selectedSubtitle")}
              >
                <CanvasDL
                  theme={theme}
                  cols={1}
                  items={[
                    {
                      k: t("cmp.label.case"),
                      v: selectedCase?.caseId ?? EMPTY_VALUE,
                      mono: true,
                    },
                    {
                      k: t("cmp.label.manifest"),
                      v: selectedCase?.evidenceManifestId ?? EMPTY_VALUE,
                      mono: true,
                    },
                    {
                      k: t("common.status"),
                      v: selectedCase
                        ? statusPill(
                            formatComplianceCode(t, selectedCase.status),
                            investigationStatusTone(selectedCase.status),
                          )
                        : EMPTY_VALUE,
                    },
                    {
                      k: t("cmp.scope.actor"),
                      v: authority.actorId,
                      mono: true,
                    },
                  ]}
                />
              </CanvasCard>
            </div>

            <CanvasCard
              theme={theme}
              title={t("cmp.legalHold.queueTitle")}
              subtitle={t("cmp.legalHold.queueSubtitle")}
              padding={0}
            >
              <CanvasTable
                theme={theme}
                columns={[
                  {
                    h: t("cmp.legalHold.holdColumn"),
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
                    h: t("cmp.legalHold.caseManifestColumn"),
                    w: 190,
                    r: (row: SandboxLegalHoldRecord) => (
                      <div style={cardStackStyle}>
                        <span style={monoStyle}>{row.caseId}</span>
                        <span style={mutedStyle}>{row.manifestId}</span>
                      </div>
                    ),
                  },
                  {
                    h: t("cmp.legalHold.scopeColumn"),
                    w: 240,
                    r: (row: SandboxLegalHoldRecord) => (
                      <div style={cardStackStyle}>
                        <span>{row.scopeSummary}</span>
                        <span style={mutedStyle}>{row.reason}</span>
                      </div>
                    ),
                  },
                  {
                    h: t("common.status"),
                    w: 160,
                    r: (row: SandboxLegalHoldRecord) =>
                      statusPill(
                        formatComplianceCode(t, row.status),
                        legalHoldStatusTone(row.status),
                      ),
                  },
                  {
                    h: t("cmp.legalHold.releaseActorsColumn"),
                    w: 220,
                    r: (row: SandboxLegalHoldRecord) => (
                      <div style={cardStackStyle}>
                        <span style={mutedStyle}>
                          {t("cmp.exports.requester")}{" "}
                          {row.releaseRequestedByActorId ??
                            t("cmp.code.pending")}
                        </span>
                        <span style={mutedStyle}>
                          {t("cmp.exports.approver")}{" "}
                          {row.releasedByActorId ?? t("cmp.code.pending")}
                        </span>
                      </div>
                    ),
                  },
                  {
                    h: t("common.actions"),
                    w: 190,
                    r: (row: SandboxLegalHoldRecord) => {
                      const selfApprovalBlocked =
                        row.releaseRequestedByActorId === authority.actorId;

                      if (row.status === "active") {
                        return canRequestReleaseScope ? (
                          <CanvasBtn
                            theme={theme}
                            variant="secondary"
                            onClick={() => setReleaseHoldId(row.holdId)}
                          >
                            {t("cmp.legalHold.requestReleaseAction")}
                          </CanvasBtn>
                        ) : (
                          actionStatusText(
                            missingScopeMessage(
                              t,
                              SCOPE_LEGAL_HOLD_RELEASE_REQUEST,
                            ),
                          )
                        );
                      }

                      if (
                        row.status === "release_requested" &&
                        canApproveReleaseScope &&
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
                              ? t("cmp.legalHold.approving")
                              : t("cmp.legalHold.approveReleaseAction")}
                          </CanvasBtn>
                        );
                      }

                      if (
                        row.status === "release_requested" &&
                        !canApproveReleaseScope
                      ) {
                        return actionStatusText(
                          missingScopeMessage(
                            t,
                            SCOPE_LEGAL_HOLD_RELEASE_APPROVE,
                          ),
                        );
                      }

                      if (
                        row.status === "release_requested" &&
                        selfApprovalBlocked
                      ) {
                        return actionStatusText(
                          t("cmp.exports.selfApprovalBlocked"),
                        );
                      }

                      return actionStatusText(t("cmp.code.released"));
                    },
                  },
                ]}
                rows={holdRows(data.legalHolds)}
              />
            </CanvasCard>

            {releaseHoldId && canRequestReleaseScope ? (
              <CanvasCard
                theme={theme}
                title={t("cmp.legalHold.releaseCardTitle")}
                subtitle={releaseHoldId}
              >
                <div style={fieldGridStyle}>
                  <div style={fieldGridStyle}>
                    <label style={fieldLabelStyle} htmlFor="release-reason">
                      {t("cmp.legalHold.releaseReason")}
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
                        ? t("cmp.exports.requesting")
                        : t("cmp.legalHold.submitReleaseRequest")}
                    </CanvasBtn>
                    <CanvasBtn
                      theme={theme}
                      variant="ghost"
                      onClick={() => {
                        setReleaseHoldId(null);
                        setReleaseReason("");
                      }}
                    >
                      {t("common.cancel")}
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

function SandboxRegulatorCasePanel() {
  const { t } = useTranslation();
  const client = usePlatformAdminClient();
  const authority = usePlatformAdminAuthority();
  const searchParams = useSearchParams();
  const scopeSet = useMemo(() => new Set(authority.scopes), [authority.scopes]);
  const {
    data: regulatorCases,
    loading,
    error,
    refresh: refreshCases,
  } = useRegulatorCasesState();
  const [selectedExperimentId, setSelectedExperimentId] = useState(
    searchParams.get("experimentId") ?? "",
  );
  const [selectedCaseId, setSelectedCaseId] = useState(
    searchParams.get("caseId") ?? "",
  );
  const [exportReason, setExportReason] = useState("");
  const [recipientLabel, setRecipientLabel] = useState("");
  const [recipientScope, setRecipientScope] = useState("");
  const [receipt, setReceipt] = useState<ActionReceipt | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canRequestExportScope = hasScope(
    scopeSet,
    SCOPE_CONTROLLED_EXPORT_REQUEST,
  );

  const experimentOptions = useMemo(() => {
    const labels = new Map<string, string>();
    for (const item of regulatorCases ?? []) {
      labels.set(
        item.experimentId ?? "program_unassigned",
        item.experimentLabel,
      );
    }
    return [...labels.entries()].map(([experimentId, label]) => ({
      experimentId,
      label,
    }));
  }, [regulatorCases]);

  useEffect(() => {
    if (!regulatorCases || regulatorCases.length === 0) {
      setSelectedExperimentId("");
      setSelectedCaseId("");
      return;
    }

    if (
      !selectedExperimentId ||
      !experimentOptions.some(
        (option) => option.experimentId === selectedExperimentId,
      )
    ) {
      setSelectedExperimentId(experimentOptions[0]?.experimentId ?? "");
    }
  }, [experimentOptions, regulatorCases, selectedExperimentId]);

  const visibleCases = useMemo(() => {
    if (!regulatorCases) {
      return [];
    }
    return regulatorCases.filter(
      (item) =>
        (item.experimentId ?? "program_unassigned") === selectedExperimentId,
    );
  }, [regulatorCases, selectedExperimentId]);

  useEffect(() => {
    if (visibleCases.length === 0) {
      setSelectedCaseId("");
      return;
    }
    if (!visibleCases.some((item) => item.caseId === selectedCaseId)) {
      setSelectedCaseId(visibleCases[0]?.caseId ?? "");
    }
  }, [selectedCaseId, visibleCases]);

  useEffect(() => {
    setActionError(null);
    setReceipt(null);
  }, [selectedCaseId]);

  const selectedSummary = useMemo(
    () =>
      visibleCases.find((item) => item.caseId === selectedCaseId) ??
      regulatorCases?.find((item) => item.caseId === selectedCaseId) ??
      null,
    [regulatorCases, selectedCaseId, visibleCases],
  );

  const {
    data: regulatorCaseData,
    loading: caseLoading,
    error: caseError,
    refresh: refreshCase,
  } = useRegulatorCaseState(selectedCaseId);
  const detail = regulatorCaseData?.detail ?? null;
  const exports = regulatorCaseData?.exports ?? [];
  const accessLogs = regulatorCaseData?.accessLogs ?? [];

  useEffect(() => {
    if (!detail?.jurisdiction || recipientScope.trim().length > 0) {
      return;
    }
    setRecipientScope(`regulator.viewer.${detail.jurisdiction}`);
  }, [detail?.jurisdiction, recipientScope]);

  useEffect(() => {
    if (
      recipientLabel.trim().length > 0 ||
      detail?.jurisdiction !== "taipei_city"
    ) {
      return;
    }
    setRecipientLabel("Taipei City Transportation Department");
  }, [detail?.jurisdiction, recipientLabel]);

  async function handleRequestExport() {
    if (!selectedCaseId) {
      return;
    }
    if (!canRequestExportScope) {
      setActionError(missingScopeMessage(t, SCOPE_CONTROLLED_EXPORT_REQUEST));
      return;
    }

    setBusy(true);
    setActionError(null);
    try {
      const exportReceipt = await client.requestSandboxRegulatorCaseExport(
        selectedCaseId,
        {
          reason: exportReason,
          recipientLabel,
          recipientScope,
        },
      );
      setReceipt(exportReceipt);
      setExportReason("");
      await Promise.all([refreshCases(), refreshCase()]);
    } catch (requestError: unknown) {
      setActionError(
        requestError instanceof Error
          ? requestError.message
          : String(requestError),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageState
      loading={loading}
      error={error}
      empty={
        regulatorCases && regulatorCases.length === 0
          ? t("cmp.regulator.empty")
          : null
      }
    >
      {receipt ? (
        <CanvasBanner
          theme={theme}
          tone="success"
          icon="check"
          title={t("cmp.regulator.exportRequestedTitle")}
          body={receipt.message}
        />
      ) : null}
      {actionError ? (
        <CanvasBanner
          theme={theme}
          tone="danger"
          icon="warn"
          title={t("cmp.reports.failedTitle")}
          body={actionError}
        />
      ) : null}
      <CanvasBanner
        theme={theme}
        tone="info"
        icon="lock"
        title={t("cmp.reports.readonlyTitle")}
        body={t("cmp.reports.readonlyBody")}
      />

      <div style={autoGridStyle("320px")}>
        <CanvasCard
          theme={theme}
          title={t("cmp.regulator.selectorTitle")}
          subtitle={t("cmp.regulator.selectorSubtitle")}
        >
          <div style={fieldGridStyle}>
            <div style={fieldGridStyle}>
              <label style={fieldLabelStyle} htmlFor="regulator-experiment">
                {t("cmp.regulator.selectExperiment")}
              </label>
              <select
                id="regulator-experiment"
                style={inputStyle}
                value={selectedExperimentId}
                onChange={(event) => {
                  setSelectedExperimentId(event.target.value);
                  setSelectedCaseId("");
                }}
              >
                {experimentOptions.map((option) => (
                  <option key={option.experimentId} value={option.experimentId}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={fieldGridStyle}>
              <label style={fieldLabelStyle} htmlFor="regulator-case">
                {t("cmp.regulator.selectCase")}
              </label>
              <select
                id="regulator-case"
                style={inputStyle}
                value={selectedCaseId}
                onChange={(event) => setSelectedCaseId(event.target.value)}
              >
                {visibleCases.map((item) => (
                  <option key={item.caseId} value={item.caseId}>
                    {item.caseLabel}
                  </option>
                ))}
              </select>
            </div>

            {selectedSummary ? (
              <div style={cardStackStyle}>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                    alignItems: "center",
                  }}
                >
                  {statusPill(
                    formatComplianceCode(t, selectedSummary.status),
                    investigationStatusTone(selectedSummary.status),
                  )}
                  {statusPill(
                    formatComplianceCode(t, selectedSummary.severity),
                    accidentSeverityTone(selectedSummary.severity),
                  )}
                </div>
                <div style={mutedStyle}>
                  {selectedSummary.caseLabel}
                  {" · "}
                  {compactDate(selectedSummary.occurredAt)}
                </div>
              </div>
            ) : null}
          </div>
        </CanvasCard>

        <CanvasCard
          theme={theme}
          title={t("cmp.regulator.postureTitle")}
          subtitle={t("cmp.regulator.postureSubtitle")}
        >
          <div style={cardStackStyle}>
            <div style={evidenceChipRowStyle}>
              {detail
                ? statusPill(
                    detail.legalHold.active
                      ? t("cmp.regulator.legalHoldActive")
                      : t("cmp.regulator.legalHoldClear"),
                    detail.legalHold.active ? "warn" : "success",
                  )
                : null}
              {detail?.masking.applied
                ? statusPill(t("cmp.regulator.maskingApplied"), "neutral")
                : null}
            </div>
            {detail ? (
              <CanvasDL
                theme={theme}
                cols={1}
                items={[
                  {
                    k: t("cmp.regulator.caseLink"),
                    v: (
                      <InlineLink href={investigationHref(detail.caseId)}>
                        {detail.caseId}
                      </InlineLink>
                    ),
                  },
                  {
                    k: t("cmp.regulator.policy"),
                    v: detail.masking.policyLabel,
                  },
                  {
                    k: t("cmp.regulator.maskedFields"),
                    v: detail.masking.maskedFields.join(", "),
                  },
                ]}
              />
            ) : (
              <div style={mutedStyle}>{t("cmp.regulator.selectCase")}</div>
            )}
          </div>
        </CanvasCard>
      </div>

      {caseLoading ? (
        <CanvasCard theme={theme}>
          <div style={emptyStateStyle}>{t("cmp.pageState.loading")}</div>
        </CanvasCard>
      ) : caseError ? (
        <CanvasBanner
          theme={theme}
          tone="danger"
          icon="warn"
          title={t("cmp.pageState.loadErrorTitle")}
          body={caseError}
        />
      ) : detail ? (
        <>
          <div style={autoGridStyle("240px")}>
            <CanvasCard
              theme={theme}
              title={t("cmp.regulator.manifestTitle")}
              subtitle={t("cmp.regulator.manifestSubtitle")}
            >
              <CanvasDL
                theme={theme}
                cols={1}
                items={[
                  {
                    k: t("cmp.label.manifest"),
                    v: detail.manifestSummary.manifestId ? (
                      <InlineLink
                        href={manifestHref(detail.manifestSummary.manifestId)}
                      >
                        {detail.manifestSummary.manifestId}
                      </InlineLink>
                    ) : (
                      EMPTY_VALUE
                    ),
                    mono: Boolean(detail.manifestSummary.manifestId),
                  },
                  {
                    k: t("cmp.regulator.manifestItems"),
                    v: String(detail.manifestSummary.itemCount),
                    mono: true,
                  },
                  {
                    k: t("cmp.regulator.manifestWindow"),
                    v:
                      detail.manifestSummary.windowStart &&
                      detail.manifestSummary.windowEnd
                        ? `${compactDate(detail.manifestSummary.windowStart)} → ${compactDate(detail.manifestSummary.windowEnd)}`
                        : EMPTY_VALUE,
                  },
                  {
                    k: t("cmp.regulator.knownGaps"),
                    v: String(detail.manifestSummary.knownGapCount),
                    mono: true,
                  },
                ]}
              />
            </CanvasCard>

            <CanvasCard
              theme={theme}
              title={t("cmp.regulator.bundleTitle")}
              subtitle={t("cmp.regulator.bundleSubtitle")}
            >
              <div style={cardStackStyle}>
                {statusPill(
                  formatRegulatorBundleState(t, detail.bundleStatus.state),
                  regulatorBundleTone(detail.bundleStatus.state),
                )}
                <CanvasDL
                  theme={theme}
                  cols={1}
                  items={[
                    {
                      k: t("cmp.regulator.bundleId"),
                      v: detail.bundleStatus.bundleId ?? EMPTY_VALUE,
                      mono: Boolean(detail.bundleStatus.bundleId),
                    },
                    {
                      k: t("cmp.regulator.generatedAt"),
                      v: compactDate(detail.bundleStatus.generatedAt),
                    },
                    {
                      k: t("cmp.regulator.latestExport"),
                      v:
                        detail.bundleStatus.latestExportRequestId ??
                        EMPTY_VALUE,
                      mono: Boolean(detail.bundleStatus.latestExportRequestId),
                    },
                  ]}
                />
              </div>
            </CanvasCard>

            <CanvasCard
              theme={theme}
              title={t("cmp.regulator.notificationTitle")}
              subtitle={t("cmp.regulator.notificationSubtitle")}
            >
              <div style={cardStackStyle}>
                {statusPill(
                  formatRegulatorNotificationState(
                    t,
                    detail.notificationStatus.state,
                  ),
                  regulatorNotificationTone(
                    detail.notificationStatus.state,
                    detail.notificationStatus.overdue,
                  ),
                )}
                <CanvasDL
                  theme={theme}
                  cols={1}
                  items={[
                    {
                      k: t("cmp.regulator.reportId"),
                      v: detail.report.reportId ?? EMPTY_VALUE,
                      mono: Boolean(detail.report.reportId),
                    },
                    {
                      k: t("cmp.regulator.reportState"),
                      v: detail.report.status
                        ? formatComplianceCode(t, detail.report.status)
                        : EMPTY_VALUE,
                    },
                    {
                      k: t("cmp.regulator.deadlineAt"),
                      v: compactDate(detail.notificationStatus.deadlineAt),
                    },
                    {
                      k: t("cmp.regulator.acknowledgedAt"),
                      v: compactDate(detail.notificationStatus.acknowledgedAt),
                    },
                  ]}
                />
              </div>
            </CanvasCard>
          </div>

          <div style={autoGridStyle("360px")}>
            <CanvasCard
              theme={theme}
              title={t("cmp.regulator.exportTitle")}
              subtitle={t("cmp.regulator.exportSubtitle")}
            >
              <div style={fieldGridStyle}>
                <div style={fieldGridStyle}>
                  <label
                    style={fieldLabelStyle}
                    htmlFor="regulator-export-reason"
                  >
                    {t("cmp.regulator.exportReason")}
                  </label>
                  <textarea
                    id="regulator-export-reason"
                    style={textareaStyle}
                    value={exportReason}
                    onChange={(event) => setExportReason(event.target.value)}
                  />
                </div>

                <div style={fieldGridStyle}>
                  <label
                    style={fieldLabelStyle}
                    htmlFor="regulator-export-recipient"
                  >
                    {t("cmp.regulator.exportRecipientLabel")}
                  </label>
                  <input
                    id="regulator-export-recipient"
                    style={inputStyle}
                    value={recipientLabel}
                    onChange={(event) => setRecipientLabel(event.target.value)}
                  />
                </div>

                <div style={fieldGridStyle}>
                  <label
                    style={fieldLabelStyle}
                    htmlFor="regulator-export-scope"
                  >
                    {t("cmp.regulator.exportRecipientScope")}
                  </label>
                  <input
                    id="regulator-export-scope"
                    style={inputStyle}
                    value={recipientScope}
                    onChange={(event) => setRecipientScope(event.target.value)}
                  />
                </div>

                <div style={mutedStyle}>
                  {t("cmp.regulator.exportRoutingNote")}
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <CanvasBtn
                    theme={theme}
                    variant="primary"
                    disabled={
                      exportReason.trim().length === 0 ||
                      !detail.manifestSummary.manifestId ||
                      busy
                    }
                    onClick={() => void handleRequestExport()}
                  >
                    {busy
                      ? t("cmp.regulator.exporting")
                      : t("cmp.regulator.exportAction")}
                  </CanvasBtn>
                  {!canRequestExportScope ? (
                    <div style={mutedStyle}>
                      {missingScopeMessage(t, SCOPE_CONTROLLED_EXPORT_REQUEST)}
                    </div>
                  ) : null}
                </div>
              </div>
            </CanvasCard>

            <CanvasCard
              theme={theme}
              title={t("cmp.regulator.latestReceiptTitle")}
              subtitle={t("cmp.regulator.exportReceiptSubtitle")}
            >
              <div style={cardStackStyle}>
                {receipt ? (
                  <CanvasDL
                    theme={theme}
                    cols={1}
                    items={[
                      {
                        k: t("assistant.receipt.actionId"),
                        v: receipt.actionId,
                        mono: true,
                      },
                      {
                        k: t("assistant.receipt.auditId"),
                        v: receipt.auditId,
                        mono: true,
                      },
                      {
                        k: t("assistant.receipt.status"),
                        v: receipt.status,
                      },
                    ]}
                  />
                ) : (
                  <div style={mutedStyle}>
                    {t("cmp.regulator.latestReceiptEmpty")}
                  </div>
                )}

                <CanvasTable
                  theme={theme}
                  columns={[
                    {
                      h: t("cmp.exports.requestColumn"),
                      w: 170,
                      r: (row: SandboxControlledEvidenceExportRecord) => (
                        <span style={monoStyle}>{row.exportRequestId}</span>
                      ),
                    },
                    {
                      h: t("common.status"),
                      w: 140,
                      r: (row: SandboxControlledEvidenceExportRecord) =>
                        statusPill(
                          formatComplianceCode(t, row.status),
                          exportStatusTone(row.status),
                        ),
                    },
                    {
                      h: t("cmp.regulator.generatedAt"),
                      w: 180,
                      r: (row: SandboxControlledEvidenceExportRecord) =>
                        compactDate(row.requestedAt),
                    },
                  ]}
                  rows={exportRows(exports.slice(0, 5))}
                />
              </div>
            </CanvasCard>
          </div>

          <CanvasCard
            theme={theme}
            title={t("cmp.regulator.accessLogTitle")}
            subtitle={t("cmp.regulator.accessLogSubtitle")}
            padding={0}
          >
            <CanvasTable
              theme={theme}
              columns={[
                {
                  h: t("cmp.regulator.accessLogTime"),
                  w: 180,
                  r: (row: Record<string, unknown>) =>
                    compactDate(String(row.createdAt ?? "")),
                },
                {
                  h: t("cmp.regulator.accessLogActor"),
                  w: 170,
                  r: (row: Record<string, unknown>) => (
                    <span style={monoStyle}>
                      {[row.actorId, row.actorType]
                        .filter(Boolean)
                        .join(" · ") || EMPTY_VALUE}
                    </span>
                  ),
                },
                {
                  h: t("cmp.regulator.accessLogAction"),
                  w: 220,
                  r: (row: Record<string, unknown>) =>
                    humanizeToken(String(row.actionName ?? "")),
                },
                {
                  h: t("cmp.regulator.accessLogResource"),
                  w: 220,
                  r: (row: Record<string, unknown>) => (
                    <span style={monoStyle}>
                      {[row.resourceType, row.resourceId]
                        .filter(Boolean)
                        .join(" · ") || EMPTY_VALUE}
                    </span>
                  ),
                },
              ]}
              rows={accessLogs.map((row) => ({ ...row }))}
            />
          </CanvasCard>
        </>
      ) : null}
    </PageState>
  );
}

export function SandboxRegulatoryReportsPage() {
  const { t } = useTranslation();
  const client = usePlatformAdminClient();
  const authority = usePlatformAdminAuthority();
  const scopeSet = useMemo(() => new Set(authority.scopes), [authority.scopes]);
  const searchParams = useSearchParams();
  const view =
    searchParams.get("view") === "regulator" ? "regulator" : "reportjobs";
  const { data, loading, error, refresh } = useOverviewState();
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const canSubmitReportScope = hasScope(
    scopeSet,
    SCOPE_REGULATORY_REPORT_SUBMIT,
  );

  async function handleSubmitReport(reportId: string) {
    if (!canSubmitReportScope) {
      setActionError(missingScopeMessage(t, SCOPE_REGULATORY_REPORT_SUBMIT));
      return;
    }

    setBusyId(reportId);
    setActionError(null);
    setMessage(null);
    try {
      await client.submitSandboxRegulatoryReport(reportId);
      setMessage(t("cmp.reports.submitSuccess", { reportId }));
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
  return (
    <ComplianceConsoleFrame
      active={view === "regulator" ? "regulator" : "reportjobs"}
      title={
        view === "regulator"
          ? t("cmp.reports.regulatorTitle")
          : t("cmp.reports.jobsTitle")
      }
      subtitle={
        view === "regulator"
          ? t("cmp.reports.regulatorSubtitle")
          : t("cmp.reports.jobsSubtitle")
      }
      actions={
        <CanvasBtn
          theme={theme}
          variant="secondary"
          onClick={() => void refresh()}
        >
          {t("common.refresh")}
        </CanvasBtn>
      }
      scopeHints={[
        {
          label: t("cmp.reports.scope.reviewQueue"),
          scope: "sandbox.regulatory_report.review",
        },
        ...(view === "regulator"
          ? [
              {
                label: t("cmp.exports.scope.request"),
                scope: SCOPE_CONTROLLED_EXPORT_REQUEST,
              },
            ]
          : [
              {
                label: t("cmp.reports.scope.submit"),
                scope: SCOPE_REGULATORY_REPORT_SUBMIT,
              },
            ]),
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
                title={t("cmp.reports.updatedTitle")}
                body={message}
              />
            ) : null}
            {actionError ? (
              <CanvasBanner
                theme={theme}
                tone="danger"
                icon="warn"
                title={t("cmp.reports.failedTitle")}
                body={actionError}
              />
            ) : null}

            {view === "regulator" ? (
              <SandboxRegulatorCasePanel />
            ) : (
              <>
                <div style={autoGridStyle("180px")}>
                  <CanvasCard
                    theme={theme}
                    title={t("cmp.reports.jobsCard.generatedTitle")}
                  >
                    <div style={{ fontSize: 28, fontWeight: 700 }}>
                      {generatedCount}
                    </div>
                    <div style={mutedStyle}>
                      {t("cmp.reports.jobsCard.generatedBody")}
                    </div>
                  </CanvasCard>
                  <CanvasCard
                    theme={theme}
                    title={t("cmp.reports.jobsCard.submittedTitle")}
                  >
                    <div style={{ fontSize: 28, fontWeight: 700 }}>
                      {submittedCount}
                    </div>
                    <div style={mutedStyle}>
                      {t("cmp.reports.jobsCard.submittedBody")}
                    </div>
                  </CanvasCard>
                  <CanvasCard
                    theme={theme}
                    title={t("cmp.reports.jobsCard.acceptedTitle")}
                  >
                    <div style={{ fontSize: 28, fontWeight: 700 }}>
                      {acceptedCount}
                    </div>
                    <div style={mutedStyle}>
                      {t("cmp.reports.jobsCard.acceptedBody")}
                    </div>
                  </CanvasCard>
                </div>

                <CanvasCard
                  theme={theme}
                  title={t("cmp.reports.jobsQueueTitle")}
                  subtitle={t("cmp.reports.jobsQueueSubtitle")}
                  padding={0}
                >
                  <CanvasTable
                    theme={theme}
                    columns={[
                      {
                        h: t("cmp.label.report"),
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
                        h: t("cmp.reports.window"),
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
                        h: t("common.status"),
                        w: 140,
                        r: (row: RegulatoryReportFiling) =>
                          statusPill(
                            formatComplianceCode(t, row.status),
                            reportStatusTone(row.status),
                          ),
                      },
                      {
                        h: t("cmp.reports.caseManifest"),
                        w: 200,
                        r: (row: RegulatoryReportFiling) => (
                          <div style={cardStackStyle}>
                            <span style={monoStyle}>
                              {row.caseId ?? t("cmp.reports.programLevel")}
                            </span>
                            <span style={mutedStyle}>
                              {row.evidenceManifestId ??
                                t("cmp.common.noManifestLinked")}
                            </span>
                          </div>
                        ),
                      },
                      {
                        h: t("common.actions"),
                        w: 170,
                        r: (row: RegulatoryReportFiling) => {
                          const canSubmit =
                            row.status === "draft" ||
                            row.status === "generated" ||
                            row.status === "rejected";
                          return canSubmit && canSubmitReportScope ? (
                            <CanvasBtn
                              theme={theme}
                              variant="primary"
                              disabled={busyId === row.reportId}
                              onClick={() =>
                                void handleSubmitReport(row.reportId)
                              }
                            >
                              {busyId === row.reportId
                                ? t("cmp.reports.submitting")
                                : row.status === "rejected"
                                  ? t("cmp.reports.resubmit")
                                  : t("cmp.reports.submit")}
                            </CanvasBtn>
                          ) : canSubmit ? (
                            actionStatusText(
                              missingScopeMessage(
                                t,
                                SCOPE_REGULATORY_REPORT_SUBMIT,
                              ),
                            )
                          ) : (
                            actionStatusText(t("cmp.reports.noSubmitAction"))
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
