"use client";

import type { ApiClient } from "@drts/api-client";
import type {
  AccidentCaseRecord,
  AccidentTimelineEntry,
  AccidentTimelineFactConfidence,
  CorrelatedTakeoverCase,
  EvidenceDiscrepancyCase,
  EvidenceManifestItem,
  RegulatoryReportFiling,
  SandboxControlledEvidenceExportRecord,
  SandboxEvidenceManifestView,
  SandboxLegalHoldRecord,
  SandboxRegulatorCaseAccessLogRecord,
  SandboxRegulatorCaseBundleState,
  SandboxRegulatorCaseNotificationState,
  SandboxRegulatorCaseSummary,
  SandboxRegulatorCaseView,
} from "@drts/contracts";
import type { CanvasTone } from "@drts/ui-web";

export type SandboxComplianceOverview = {
  investigations: AccidentCaseRecord[];
  takeoverReviews: CorrelatedTakeoverCase[];
  discrepancies: EvidenceDiscrepancyCase[];
  controlledExports: SandboxControlledEvidenceExportRecord[];
  legalHolds: SandboxLegalHoldRecord[];
  regulatoryReports: RegulatoryReportFiling[];
};

export async function loadSandboxComplianceOverview(
  client: ApiClient,
): Promise<SandboxComplianceOverview> {
  const [
    investigations,
    takeoverReviews,
    discrepancies,
    controlledExports,
    legalHolds,
    regulatoryReports,
  ] = await Promise.all([
    client.listSandboxInvestigations(),
    client.listSandboxTakeoverReviews(),
    client.listSandboxEvidenceDiscrepancies(),
    client.listSandboxControlledExports(),
    client.listSandboxLegalHolds(),
    client.listSandboxRegulatoryReports(),
  ]);

  return {
    investigations: investigations.items ?? [],
    takeoverReviews: takeoverReviews.items ?? [],
    discrepancies: discrepancies.items ?? [],
    controlledExports: controlledExports.items ?? [],
    legalHolds: legalHolds.items ?? [],
    regulatoryReports: regulatoryReports.items ?? [],
  };
}

export async function loadSandboxInvestigationDetail(
  client: ApiClient,
  caseId: string,
): Promise<{
  investigation: AccidentCaseRecord;
  timeline: AccidentTimelineEntry[];
  manifest: SandboxEvidenceManifestView | null;
}> {
  const [investigation, timeline] = await Promise.all([
    client.getSandboxInvestigation(caseId),
    client.getSandboxInvestigationTimeline(caseId),
  ]);

  const manifestId = investigation.item.evidenceManifestId;
  let manifest: SandboxEvidenceManifestView | null = null;
  if (manifestId) {
    try {
      const result = await client.getSandboxEvidenceManifest(manifestId);
      manifest = result.item;
    } catch {
      manifest = null;
    }
  }

  return {
    investigation: investigation.item,
    timeline: timeline.items ?? [],
    manifest,
  };
}

export async function loadSandboxRegulatorCases(
  client: ApiClient,
): Promise<SandboxRegulatorCaseSummary[]> {
  const result = await client.listSandboxRegulatorCases();
  return result.items ?? [];
}

export async function loadSandboxRegulatorCaseDetail(
  client: ApiClient,
  caseId: string,
): Promise<{
  detail: SandboxRegulatorCaseView;
  exports: SandboxControlledEvidenceExportRecord[];
  accessLogs: SandboxRegulatorCaseAccessLogRecord[];
}> {
  const [detail, controlledExports, accessLogs] = await Promise.all([
    client.getSandboxRegulatorCase(caseId),
    client.listSandboxRegulatorCaseExports(caseId),
    client.listSandboxRegulatorCaseAccessLogs(caseId),
  ]);

  return {
    detail: detail.item,
    exports: controlledExports.items ?? [],
    accessLogs: accessLogs.items ?? [],
  };
}

export function uniqueManifestIds(investigations: AccidentCaseRecord[]) {
  return [
    ...new Set(
      investigations
        .map((item) => item.evidenceManifestId)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
}

export function investigationStatusTone(
  status: AccidentCaseRecord["status"],
): CanvasTone {
  switch (status) {
    case "closed":
      return "success";
    case "regulator_review":
      return "accent";
    case "initial_notification_sent":
    case "under_investigation":
      return "warn";
    default:
      return "neutral";
  }
}

export function accidentSeverityTone(
  severity: AccidentCaseRecord["severity"],
): CanvasTone {
  switch (severity) {
    case "fatal":
      return "danger";
    case "major":
      return "warn";
    case "minor":
      return "accent";
    case "near_miss":
    default:
      return "info";
  }
}

export function exportStatusTone(
  status: SandboxControlledEvidenceExportRecord["status"],
): CanvasTone {
  switch (status) {
    case "completed":
      return "success";
    case "approved":
      return "accent";
    case "rejected":
      return "danger";
    case "pending_approval":
    default:
      return "warn";
  }
}

export function legalHoldStatusTone(
  status: SandboxLegalHoldRecord["status"],
): CanvasTone {
  switch (status) {
    case "released":
      return "success";
    case "release_requested":
      return "accent";
    case "active":
    default:
      return "warn";
  }
}

export function reportStatusTone(
  status: RegulatoryReportFiling["status"],
): CanvasTone {
  switch (status) {
    case "accepted":
      return "success";
    case "submitted":
      return "accent";
    case "rejected":
      return "danger";
    case "generated":
      return "warn";
    case "draft":
    default:
      return "neutral";
  }
}

export function regulatorBundleTone(
  state: SandboxRegulatorCaseBundleState,
): CanvasTone {
  switch (state) {
    case "export_completed":
      return "success";
    case "export_approved":
    case "bundle_generated":
      return "accent";
    case "export_pending_approval":
      return "warn";
    case "export_rejected":
    case "missing_manifest":
      return "danger";
    case "manifest_ready":
    default:
      return "info";
  }
}

export function regulatorNotificationTone(
  state: SandboxRegulatorCaseNotificationState,
  overdue: boolean,
): CanvasTone {
  if (overdue) {
    return "danger";
  }

  switch (state) {
    case "acknowledged":
      return "success";
    case "submitted":
      return "accent";
    case "review_approved":
      return "info";
    case "review_pending":
      return "warn";
    case "draft":
    case "not_started":
    default:
      return "neutral";
  }
}

export function custodyStateTone(
  state:
    | SandboxEvidenceManifestView["custodyState"]
    | EvidenceManifestItem["custodyState"],
): CanvasTone {
  switch (state) {
    case "sealed":
    case "verified":
      return "success";
    case "released":
      return "accent";
    case "purged":
      return "danger";
    case "uploaded":
      return "info";
    case "captured":
    default:
      return "neutral";
  }
}

export function confidenceTone(
  confidence: AccidentTimelineFactConfidence,
): CanvasTone {
  switch (confidence) {
    case "provider_signed":
      return "success";
    case "provider_reported":
      return "accent";
    case "operator_reported":
      return "warn";
    case "system_derived":
      return "info";
    case "platform_recorded":
    case "unknown":
    default:
      return "neutral";
  }
}

export function sourceTone(
  sourceSystem: EvidenceManifestItem["source"]["sourceSystem"],
): CanvasTone {
  switch (sourceSystem) {
    case "tesla_fleet_api":
    case "tesla_public_telemetry":
      return "info";
    case "manual_entry":
      return "warn";
    case "regulatory_filing":
      return "success";
    case "roc_operator":
      return "warn";
    case "sandbox_governance":
      return "accent";
    case "onboard_recorder":
    default:
      return "neutral";
  }
}

export function sourceLabel(
  sourceSystem: EvidenceManifestItem["source"]["sourceSystem"],
): string {
  switch (sourceSystem) {
    case "tesla_fleet_api":
    case "tesla_public_telemetry":
      return "Tesla provided";
    case "manual_entry":
      return "Manual entry";
    case "regulatory_filing":
      return "Regulatory filing";
    case "roc_operator":
      return "ROC input";
    case "sandbox_governance":
      return "Sandbox governance";
    case "onboard_recorder":
    default:
      return "Vehicle recorded";
  }
}

export function truncateHash(value: string | null | undefined, size = 10) {
  if (!value) {
    return "—";
  }
  if (value.length <= size) {
    return value;
  }
  const left = Math.max(4, Math.floor(size / 2));
  const right = Math.max(4, size - left);
  return `${value.slice(0, left)}…${value.slice(-right)}`;
}

export function tripHref(tripId: string) {
  return `/platform-admin/compliance/trips/${encodeURIComponent(tripId)}`;
}

export function investigationHref(caseId: string) {
  return `/platform-admin/investigations/${encodeURIComponent(caseId)}`;
}

export function investigationTimelineHref(caseId: string) {
  return `${investigationHref(caseId)}/timeline`;
}

export function manifestHref(manifestId: string) {
  return `/platform-admin/evidence/manifests/${encodeURIComponent(manifestId)}`;
}

export function findInvestigationForDiscrepancy(
  investigations: AccidentCaseRecord[],
  discrepancyCaseId: string,
) {
  return investigations.find((item) =>
    item.discrepancyCaseIds.includes(discrepancyCaseId),
  );
}

export function findTakeoverReview(
  takeoverReviews: CorrelatedTakeoverCase[],
  correlatedTakeoverCaseId: string,
) {
  return takeoverReviews.find(
    (item) => item.correlatedTakeoverCaseId === correlatedTakeoverCaseId,
  );
}

export function tripInvestigations(
  investigations: AccidentCaseRecord[],
  tripId: string,
) {
  return investigations.filter((item) => item.orderId === tripId);
}

export function tripTakeoverReviews(
  takeoverReviews: CorrelatedTakeoverCase[],
  tripId: string,
) {
  return takeoverReviews.filter((item) => item.orderId === tripId);
}

export function tripDiscrepancies(
  discrepancies: EvidenceDiscrepancyCase[],
  takeoverReviews: CorrelatedTakeoverCase[],
  tripId: string,
) {
  const relatedTakeoverIds = new Set(
    tripTakeoverReviews(takeoverReviews, tripId).map(
      (item) => item.correlatedTakeoverCaseId,
    ),
  );
  return discrepancies.filter((item) =>
    relatedTakeoverIds.has(item.correlatedTakeoverCaseId),
  );
}

export function buildTripComplianceChecks(input: {
  tripId: string;
  investigations: AccidentCaseRecord[];
  takeoverReviews: CorrelatedTakeoverCase[];
  discrepancies: EvidenceDiscrepancyCase[];
  legalHolds: SandboxLegalHoldRecord[];
}) {
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
      label: "Takeover review correlated",
      passed: takeoverReviews.length > 0,
      detail:
        takeoverReviews.length > 0
          ? `${takeoverReviews.length} correlated takeover record(s)`
          : "No correlated takeover review for this trip yet.",
    },
    {
      label: "Investigation case opened",
      passed: Boolean(investigation),
      detail: investigation
        ? `${investigation.caseId} · ${investigation.status}`
        : "No accident investigation case currently linked to this trip.",
    },
    {
      label: "Evidence manifest sealed",
      passed: Boolean(manifestId),
      detail: manifestId
        ? `${manifestId} linked to case evidence custody`
        : "No evidence manifest is linked to this trip yet.",
    },
    {
      label: "Discrepancy review clear",
      passed: discrepancies.length === 0,
      detail:
        discrepancies.length === 0
          ? "No open discrepancy case across Tesla / ROC / operator sources."
          : `${discrepancies.length} open discrepancy case(s) require review.`,
    },
    {
      label: "Legal hold resolved",
      passed: !hasLegalHold,
      detail: hasLegalHold
        ? "Evidence is currently preserved under an active legal hold."
        : "No active legal hold is freezing trip evidence.",
    },
  ];
}

export function focusBannerText(input: {
  takeoverCaseId: string | null;
  discrepancyCaseId: string | null;
  takeoverReview?: CorrelatedTakeoverCase | null;
  discrepancy?: EvidenceDiscrepancyCase | null;
}) {
  if (input.takeoverCaseId) {
    if (input.takeoverReview) {
      return `ROC deep-link opened correlated takeover ${input.takeoverReview.correlatedTakeoverCaseId}.`;
    }
    return `ROC deep-link referenced takeover case ${input.takeoverCaseId}, but no correlated review is loaded yet.`;
  }
  if (input.discrepancyCaseId) {
    if (input.discrepancy) {
      return `ROC deep-link opened discrepancy case ${input.discrepancy.discrepancyCaseId}.`;
    }
    return `ROC deep-link referenced discrepancy case ${input.discrepancyCaseId}, but no discrepancy review is loaded yet.`;
  }
  return null;
}
