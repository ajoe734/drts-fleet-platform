"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type {
  EmptyReason,
  ReportJobRecord,
  ReportJobStatus,
  ReportJobType,
  ReportOutputFormat,
  ResourceActionDescriptor,
} from "@drts/contracts";
import {
  OPERATIONAL_REPORT_JOB_TYPES,
  REPORT_OUTPUT_FORMATS,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasField,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
  type CanvasTone,
  buildCanvasTheme,
} from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";

type ReportsManagerProps = {
  jobs: ReportJobRecord[];
  errors: string[];
  emptyReason: EmptyReason | null;
  generatedAt: string;
  refreshTier: "manual";
  availableActions: ResourceActionDescriptor[];
};

type ReportDraft = {
  jobType: ReportJobType;
  format: ReportOutputFormat;
  period: string;
  costCenterCode: string;
  passengerUserId: string;
};

type ReportsFlash = {
  title: string;
  description: string;
  tone: "info" | "warning" | "success";
};

type ReportStatusFilter = ReportJobStatus | "all";

type DisplayReportStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "expired";

type ReportRow = {
  id: string;
  type: string;
  parameters: string;
  status: DisplayReportStatus;
  createdAt: string;
  completedAt: string;
  format: string;
  expiresAt: string;
  artifactLabel: string;
  artifactUrl: string | null;
  rerunDescriptor: ResourceActionDescriptor | null;
  downloadDescriptor: ResourceActionDescriptor | null;
  statusReason: string | null;
};

type CrossAppLink = {
  label: string;
  href: string;
};

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const MANUAL_EMPTY_REASONS: readonly EmptyReason[] = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
] as const;

const REPORT_TYPE_OPTIONS = OPERATIONAL_REPORT_JOB_TYPES.map(
  (jobType: ReportJobType) => ({
    value: jobType,
    label:
      jobType === "trip_summary"
        ? "Trip summary"
        : jobType === "monthly_trip_report"
          ? "Monthly usage"
          : jobType === "revenue_summary"
            ? "Cost-center split"
            : jobType === "incident_register"
              ? "Incident register"
              : "Maintenance overview",
  }),
);

const STATUS_FILTER_OPTIONS: readonly {
  value: ReportStatusFilter;
  label: string;
}[] = [
  { value: "all", label: "All statuses" },
  { value: "queued", label: "Queued" },
  { value: "running", label: "Running" },
  { value: "completed", label: "Done" },
  { value: "failed", label: "Failed" },
  { value: "expired", label: "Expired" },
] as const;

const pageBodyStyle = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
} as const;

const kpiGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
} as const;

const actionRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
} as const;

const cardGridStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.3fr) minmax(320px, 0.9fr)",
  gap: 16,
  alignItems: "start",
} as const;

const filterGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
} as const;

const filterInputStyle = {
  width: "100%",
  minHeight: 36,
  borderRadius: 7,
  border: `1px solid ${th.border}`,
  background: th.bgRaised,
  color: th.text,
  padding: "8px 10px",
  fontSize: 12.5,
  fontFamily: th.fontFamily,
} as const;

const monoInputStyle = {
  ...filterInputStyle,
  fontFamily: th.monoFamily,
} as const;

const buttonAnchorStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 28,
  padding: "5px 10px",
  borderRadius: 7,
  border: `1px solid ${th.border}`,
  background: th.surface,
  color: th.text,
  fontSize: 12,
  fontWeight: 500,
  lineHeight: 1,
  textDecoration: "none",
} as const;

const linkListStyle = {
  display: "grid",
  gap: 8,
} as const;

const linkItemStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "10px 12px",
  borderRadius: 8,
  border: `1px solid ${th.border}`,
  background: th.surfaceLo,
} as const;

const emptyStateStyle = {
  padding: 32,
  display: "grid",
  gap: 12,
  textAlign: "center",
} as const;

const emptyReasonRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
} as const;

const emptyReasonLinkStyle = {
  display: "inline-flex",
  alignItems: "center",
  padding: "4px 8px",
  borderRadius: 999,
  border: `1px solid ${th.border}`,
  color: th.textMuted,
  background: th.surfaceLo,
  fontSize: 11.5,
  textDecoration: "none",
} as const;

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";

  return new Intl.DateTimeFormat("zh-Hant", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}

function normalizePeriod(value: string | undefined) {
  return value && value.trim().length > 0 ? value.trim() : "";
}

function getReportJobPeriod(job: ReportJobRecord) {
  const period = job.filters.period;
  return typeof period === "string" ? period : "—";
}

function getDisplayStatus(job: ReportJobRecord): DisplayReportStatus {
  if (
    job.status === "failed" ||
    job.status === "queued" ||
    job.status === "running"
  ) {
    return job.status;
  }

  const expiresAt = job.artifact?.expiresAt;
  if (job.status === "expired") {
    return "expired";
  }
  if (expiresAt) {
    const parsed = new Date(expiresAt);
    if (!Number.isNaN(parsed.getTime()) && parsed.getTime() <= Date.now()) {
      return "expired";
    }
  }
  return "completed";
}

function getStatusTone(status: DisplayReportStatus): CanvasTone {
  if (status === "completed") return "success";
  if (status === "running" || status === "queued") return "info";
  if (status === "expired") return "neutral";
  return "warn";
}

function getStatusLabel(status: DisplayReportStatus) {
  if (status === "completed") return "done";
  return status;
}

function toParameterSummary(job: ReportJobRecord) {
  const entries: string[] = [];
  const period = getReportJobPeriod(job);
  if (period !== "—") {
    entries.push(`period ${period}`);
  }

  const costCenterCode =
    typeof job.filters.costCenterCode === "string"
      ? job.filters.costCenterCode
      : null;
  if (costCenterCode) {
    entries.push(`cc ${costCenterCode}`);
  }

  const passengerUserId =
    typeof job.filters.passengerUserId === "string"
      ? job.filters.passengerUserId
      : null;
  if (passengerUserId) {
    entries.push(`pax ${passengerUserId}`);
  }

  const tenantId =
    typeof job.filters.tenantId === "string" ? job.filters.tenantId : null;
  if (tenantId) {
    entries.push(`tenant ${tenantId}`);
  }

  return entries.length > 0 ? entries.join(" · ") : "tenant scope default";
}

function findAction(
  availableActions: ResourceActionDescriptor[],
  action: string,
): ResourceActionDescriptor | null {
  return availableActions.find((item) => item.action === action) ?? null;
}

function getEmptyStateTone(reason: EmptyReason | null): CanvasTone {
  switch (reason) {
    case "fetch_failed":
    case "external_unavailable":
      return "warn";
    case "permission_denied":
      return "danger";
    case "filtered_empty":
      return "neutral";
    case "not_provisioned":
      return "accent";
    case "no_data":
    default:
      return "info";
  }
}

function getEmptyStateCopy(reason: EmptyReason | null) {
  switch (reason) {
    case "not_provisioned":
      return {
        title: "Reporting is not provisioned for this tenant yet",
        description:
          "The route is reachable, but no reporting capability has been provisioned. Use the cross-app governance links to confirm entitlement, artifact signing, and reporting readiness.",
      };
    case "fetch_failed":
      return {
        title: "Report jobs could not be loaded",
        description:
          "The page shell is healthy, but the report-job list failed to load. Retry the manual refresh once the dependency recovers.",
      };
    case "permission_denied":
      return {
        title: "This actor cannot operate tenant reports",
        description:
          "Reports stay visible in the sitemap, but the current actor does not have authority to list or create report jobs for this tenant.",
      };
    case "external_unavailable":
      return {
        title: "A reporting dependency is unavailable",
        description:
          "Backend reporting is currently degraded. Wait for the dependent service to recover, then refresh the job list manually.",
      };
    case "filtered_empty":
      return {
        title: "No jobs match the current filter",
        description:
          "The tenant has report history, but the active type, status, or period filter produced an empty register. Clear the filters to inspect the full queue.",
      };
    case "no_data":
    default:
      return {
        title: "No report jobs exist yet",
        description:
          "Create the first tenant report job from this route. The backend will own the job lifecycle and signed download URL once the artifact is ready.",
      };
  }
}

function resolveAppOrigin(targetApp: "ops-console" | "platform-admin") {
  const envCandidates =
    targetApp === "platform-admin"
      ? [
          process.env.NEXT_PUBLIC_PLATFORM_ADMIN_ORIGIN,
          process.env.PLATFORM_ADMIN_ORIGIN,
          process.env.DEV_PLATFORM_ADMIN_ORIGIN,
          process.env.STAGING_PLATFORM_ADMIN_ORIGIN,
          process.env.PROD_PLATFORM_ADMIN_ORIGIN,
        ]
      : [
          process.env.NEXT_PUBLIC_OPS_CONSOLE_ORIGIN,
          process.env.OPS_CONSOLE_ORIGIN,
          process.env.DEV_OPS_CONSOLE_ORIGIN,
          process.env.STAGING_OPS_CONSOLE_ORIGIN,
          process.env.PROD_OPS_CONSOLE_ORIGIN,
        ];
  const resolved = envCandidates.find(
    (candidate) => typeof candidate === "string" && candidate.trim().length > 0,
  );

  if (resolved) {
    return resolved.replace(/\/$/, "");
  }

  return targetApp === "platform-admin"
    ? "http://localhost:3002"
    : "http://localhost:3003";
}

function buildCrossAppHref(
  targetApp: "ops-console" | "platform-admin",
  route: string,
) {
  return `${resolveAppOrigin(targetApp)}${route.startsWith("/") ? route : `/${route}`}`;
}

function ActionButton({
  descriptor,
  label,
  icon,
  onClick,
  variant = "secondary",
  size = "sm",
}: {
  descriptor: ResourceActionDescriptor | null;
  label: string;
  icon?: "plus" | "arrow" | "ext";
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost";
  size?: "xs" | "sm" | "md";
}) {
  if (!descriptor) {
    return null;
  }

  return (
    <CanvasBtn
      theme={th}
      variant={variant}
      size={size}
      disabled={!descriptor.enabled}
      {...(icon ? { icon } : {})}
      {...(!descriptor.enabled
        ? { style: { cursor: "not-allowed" as const } }
        : {})}
      {...(descriptor.enabled && onClick ? { onClick } : {})}
    >
      {label}
    </CanvasBtn>
  );
}

export function ReportsManager({
  jobs,
  errors,
  emptyReason,
  generatedAt,
  refreshTier,
  availableActions,
}: ReportsManagerProps) {
  const router = useRouter();
  const client = getTenantClient();
  const [pending, startTransition] = useTransition();
  const [flash, setFlash] = useState<ReportsFlash | null>(null);
  const [statusFilter, setStatusFilter] = useState<ReportStatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [periodFilter, setPeriodFilter] = useState("");
  const [draft, setDraft] = useState<ReportDraft>({
    jobType: "monthly_trip_report",
    format: "xlsx",
    period: "2026-05",
    costCenterCode: "",
    passengerUserId: "",
  });

  const createAction = findAction(availableActions, "create_report_job");
  const refreshAction = findAction(availableActions, "refresh_report_jobs");
  const opsReportingAction = findAction(availableActions, "open_ops_reporting");
  const platformAuditAction = findAction(
    availableActions,
    "open_platform_audit",
  );
  const normalizedPeriodFilter = normalizePeriod(periodFilter);

  const rows: ReportRow[] = jobs.map((job) => {
    const displayStatus = getDisplayStatus(job);
    const downloadDisabledReasonCode =
      displayStatus === "running" || displayStatus === "queued"
        ? "still_running"
        : displayStatus === "expired"
          ? "artifact_expired"
          : displayStatus === "failed"
            ? "job_failed"
            : null;

    return {
      id: job.jobId,
      type: job.jobType,
      parameters: toParameterSummary(job),
      status: displayStatus,
      createdAt: formatDateTime(job.createdAt),
      completedAt:
        displayStatus === "queued" || displayStatus === "running"
          ? "—"
          : formatDateTime(job.updatedAt),
      format: job.format,
      expiresAt: formatDateTime(job.artifact?.expiresAt),
      artifactLabel:
        displayStatus === "completed"
          ? "signed artifact"
          : displayStatus === "expired"
            ? "artifact expired"
            : "not ready",
      artifactUrl:
        displayStatus === "completed"
          ? (job.artifact?.downloadUrl ?? null)
          : null,
      rerunDescriptor:
        displayStatus === "failed"
          ? {
              action: "rerun_failed_job",
              enabled: true,
              riskLevel: "medium",
            }
          : null,
      downloadDescriptor: {
        action: "download_artifact",
        enabled:
          displayStatus === "completed" && Boolean(job.artifact?.downloadUrl),
        riskLevel: "low",
        ...(downloadDisabledReasonCode
          ? { disabledReasonCode: downloadDisabledReasonCode }
          : {}),
      },
      statusReason:
        displayStatus === "failed"
          ? "The backend recorded this job as failed. Re-run with the same parameters."
          : displayStatus === "expired"
            ? "The signed URL expired. Create a new job to issue a fresh artifact."
            : null,
    };
  });

  const filteredRows = rows.filter((row) => {
    if (statusFilter !== "all" && row.status !== statusFilter) {
      return false;
    }
    if (typeFilter !== "all" && row.type !== typeFilter) {
      return false;
    }
    if (
      normalizedPeriodFilter &&
      !row.parameters
        .toLowerCase()
        .includes(normalizedPeriodFilter.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  const effectiveEmptyReason =
    emptyReason ??
    (rows.length > 0 && filteredRows.length === 0 ? "filtered_empty" : null);
  const emptyStateCopy = getEmptyStateCopy(effectiveEmptyReason);

  const opsReportingLink: CrossAppLink = {
    label: "Open ops-console reporting for filing / revenue trace",
    href: buildCrossAppHref("ops-console", "/reports"),
  };
  const platformAuditLink: CrossAppLink = {
    label: "Open platform-admin audit for artifact governance",
    href: buildCrossAppHref("platform-admin", "/audit?module=reporting-filing"),
  };
  const crossAppLinks: CrossAppLink[] = [opsReportingLink, platformAuditLink];

  const totalJobs = rows.length;
  const activeJobs = rows.filter(
    (row) => row.status === "queued" || row.status === "running",
  ).length;
  const readyJobs = rows.filter((row) => row.status === "completed").length;
  const failedJobs = rows.filter((row) => row.status === "failed").length;
  const expiredJobs = rows.filter((row) => row.status === "expired").length;

  function setDraftField<K extends keyof ReportDraft>(
    field: K,
    value: ReportDraft[K],
  ) {
    setDraft((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function runTransition(work: () => Promise<void>) {
    startTransition(async () => {
      try {
        await work();
      } catch (error) {
        setFlash({
          title: "Report action failed",
          description:
            error instanceof Error ? error.message : "Unknown reporting error.",
          tone: "warning",
        });
      }
    });
  }

  function handleRefresh() {
    runTransition(async () => {
      router.refresh();
      setFlash({
        title: "Report list refresh requested",
        description:
          "This route is tier T6 manual. The page has been asked to reload the latest report-job snapshot.",
        tone: "info",
      });
    });
  }

  function handleCreateJob() {
    if (!createAction?.enabled) {
      return;
    }

    runTransition(async () => {
      const filters: Record<string, string> = {};
      const period = normalizePeriod(draft.period);
      const costCenterCode = normalizePeriod(draft.costCenterCode);
      const passengerUserId = normalizePeriod(draft.passengerUserId);

      if (period) filters.period = period;
      if (costCenterCode) filters.costCenterCode = costCenterCode;
      if (passengerUserId) filters.passengerUserId = passengerUserId;

      const result = await client.createTenantReportJob({
        jobType: draft.jobType,
        format: draft.format,
        filters,
      });

      setFlash({
        title: "Report job queued",
        description: `Job ${result.jobId} was accepted. Refresh or wait for the backend to produce the signed artifact.`,
        tone: "success",
      });
      router.refresh();
    });
  }

  function handleRerun(jobId: string) {
    const job = jobs.find((item) => item.jobId === jobId);
    if (!job) {
      return;
    }

    if (
      !window.confirm(
        `Re-run report job ${job.jobId} with the same parameters?`,
      )
    ) {
      return;
    }

    runTransition(async () => {
      const result = await client.createTenantReportJob({
        jobType: job.jobType,
        format: job.format,
        filters: job.filters,
      });

      setFlash({
        title: "Failed report queued again",
        description: `Replacement job ${result.jobId} was accepted with the original type and scope.`,
        tone: "success",
      });
      router.refresh();
    });
  }

  function handleDownload(url: string | null) {
    if (!url) {
      return;
    }

    window.open(url, "_blank", "noopener,noreferrer");
  }

  const columns: CanvasTableColumn<ReportRow>[] = [
    { h: "JOB", k: "id", w: 180, mono: true },
    { h: "TYPE", k: "type", w: 170, mono: true },
    { h: "PARAMETERS", k: "parameters", w: 220, mono: true },
    {
      h: "STATUS",
      w: 118,
      r: (row) => (
        <CanvasPill theme={th} tone={getStatusTone(row.status)} dot>
          {getStatusLabel(row.status)}
        </CanvasPill>
      ),
    },
    { h: "CREATED", k: "createdAt", w: 150, mono: true },
    { h: "COMPLETED", k: "completedAt", w: 150, mono: true },
    { h: "FORMAT", k: "format", w: 82, mono: true },
    { h: "EXPIRES", k: "expiresAt", w: 150, mono: true },
    {
      h: "ARTIFACT",
      w: 150,
      r: (row) => (
        <div style={{ display: "grid", gap: 4 }}>
          <span style={{ color: th.text, fontSize: 12 }}>
            {row.artifactLabel}
          </span>
          {row.statusReason ? (
            <span style={{ color: th.textMuted, fontSize: 11.5 }}>
              {row.statusReason}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      h: "ACTIONS",
      w: 180,
      r: (row) => (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <ActionButton
            descriptor={row.downloadDescriptor}
            label="Download"
            icon="ext"
            size="xs"
            onClick={() => handleDownload(row.artifactUrl)}
          />
          <ActionButton
            descriptor={row.rerunDescriptor}
            label="Re-run"
            icon="arrow"
            size="xs"
            onClick={() => handleRerun(row.id)}
          />
        </div>
      ),
    },
  ];

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="報表 · Reports"
        subtitle="月用量 · cost center 拆分 · SLA 摘要 · 簽名 artifact 短效"
        actions={
          <div style={actionRowStyle}>
            <ActionButton
              descriptor={refreshAction}
              label="Refresh"
              icon="arrow"
              onClick={handleRefresh}
            />
            <ActionButton
              descriptor={createAction}
              label="Create job"
              icon="plus"
              variant="primary"
              onClick={handleCreateJob}
            />
          </div>
        }
      />

      <div style={pageBodyStyle}>
        {flash ? (
          <CanvasBanner
            theme={th}
            tone={
              flash.tone === "warning"
                ? "warn"
                : flash.tone === "success"
                  ? "success"
                  : "info"
            }
            title={flash.title}
            body={flash.description}
          />
        ) : null}

        {errors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            title="Report data could not be fully loaded"
            body="The route stays available, but one or more reporting reads failed."
            actions={
              <div style={{ color: th.text, fontSize: 11.5 }}>
                {errors.length} issue{errors.length === 1 ? "" : "s"}
              </div>
            }
          />
        ) : null}

        <CanvasBanner
          theme={th}
          tone="info"
          title="Refresh tier T6: manual"
          body={`This route does not auto-poll. Snapshot loaded ${formatDateTime(generatedAt)} and refresh tier remains ${refreshTier}.`}
        />

        <CanvasBanner
          theme={th}
          tone="accent"
          title="Cross-app reporting trace stays explicit"
          body="Tenant reports can escalate into ops reporting or platform governance. Deep links open in a new tab per Q-X03."
          actions={
            <>
              {opsReportingAction ? (
                <a
                  href={opsReportingLink.href}
                  target="_blank"
                  rel="noreferrer"
                  style={buttonAnchorStyle}
                >
                  Ops reporting
                </a>
              ) : null}
              {platformAuditAction ? (
                <a
                  href={platformAuditLink.href}
                  target="_blank"
                  rel="noreferrer"
                  style={buttonAnchorStyle}
                >
                  Platform audit
                </a>
              ) : null}
              <Link href="/audit" style={buttonAnchorStyle}>
                Tenant audit
              </Link>
            </>
          }
        />

        <div style={kpiGridStyle}>
          <CanvasKPI
            theme={th}
            label="Jobs"
            value={String(totalJobs)}
            sub="Report job history"
          />
          <CanvasKPI
            theme={th}
            label="Queued / Running"
            value={String(activeJobs)}
            sub="Backend still producing artifacts"
          />
          <CanvasKPI
            theme={th}
            label="Ready"
            value={String(readyJobs)}
            sub="Signed downloads currently valid"
          />
          <CanvasKPI
            theme={th}
            label="Failed / Expired"
            value={`${failedJobs} / ${expiredJobs}`}
            sub="Needs re-run or fresh artifact"
          />
        </div>

        <div style={cardGridStyle}>
          <CanvasCard
            theme={th}
            title="Report queue"
            subtitle="Type, status, period, artifact TTL, and manual retry all stay contract-backed."
            padding={16}
          >
            <div style={filterGridStyle}>
              <CanvasField theme={th} label="Type filter">
                <select
                  value={typeFilter}
                  onChange={(event) => setTypeFilter(event.target.value)}
                  style={filterInputStyle}
                >
                  <option value="all">All types</option>
                  {REPORT_TYPE_OPTIONS.map(
                    (option: (typeof REPORT_TYPE_OPTIONS)[number]) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ),
                  )}
                </select>
              </CanvasField>

              <CanvasField theme={th} label="Status filter">
                <select
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(event.target.value as ReportStatusFilter)
                  }
                  style={filterInputStyle}
                >
                  {STATUS_FILTER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </CanvasField>

              <CanvasField
                theme={th}
                label="Period filter"
                hint="Match the period embedded in job parameters."
              >
                <input
                  value={periodFilter}
                  onChange={(event) => setPeriodFilter(event.target.value)}
                  placeholder="2026-05"
                  style={monoInputStyle}
                />
              </CanvasField>
            </div>

            <div style={{ ...actionRowStyle, marginBottom: 14 }}>
              <CanvasBtn
                theme={th}
                size="xs"
                variant="ghost"
                onClick={() => {
                  setTypeFilter("all");
                  setStatusFilter("all");
                  setPeriodFilter("");
                }}
              >
                Clear filters
              </CanvasBtn>
            </div>

            {effectiveEmptyReason ? (
              <div style={emptyStateStyle}>
                <CanvasPill
                  theme={th}
                  tone={getEmptyStateTone(effectiveEmptyReason)}
                >
                  {effectiveEmptyReason}
                </CanvasPill>
                <div>
                  <div
                    style={{ color: th.text, fontWeight: 600, marginBottom: 6 }}
                  >
                    {emptyStateCopy.title}
                  </div>
                  <div style={{ color: th.textMuted, fontSize: 12.5 }}>
                    {emptyStateCopy.description}
                  </div>
                </div>
                <div style={actionRowStyle}>
                  {effectiveEmptyReason === "filtered_empty" ? (
                    <CanvasBtn
                      theme={th}
                      size="sm"
                      onClick={() => {
                        setTypeFilter("all");
                        setStatusFilter("all");
                        setPeriodFilter("");
                      }}
                    >
                      Clear filters
                    </CanvasBtn>
                  ) : (
                    <ActionButton
                      descriptor={createAction}
                      label="Create job"
                      icon="plus"
                      variant="primary"
                      onClick={handleCreateJob}
                    />
                  )}
                  <ActionButton
                    descriptor={refreshAction}
                    label="Refresh"
                    icon="arrow"
                    onClick={handleRefresh}
                  />
                </div>
              </div>
            ) : (
              <CanvasTable<ReportRow>
                theme={th}
                columns={columns}
                rows={filteredRows}
              />
            )}
          </CanvasCard>

          <div style={{ display: "grid", gap: 16 }}>
            <CanvasCard
              theme={th}
              title="Create report job"
              subtitle="Type, period, and scope parameters feed the backend queue directly."
              padding={16}
            >
              <CanvasField theme={th} label="Job type" required>
                <select
                  value={draft.jobType}
                  onChange={(event) =>
                    setDraftField(
                      "jobType",
                      event.target.value as ReportJobType,
                    )
                  }
                  style={filterInputStyle}
                >
                  {REPORT_TYPE_OPTIONS.map(
                    (option: (typeof REPORT_TYPE_OPTIONS)[number]) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ),
                  )}
                </select>
              </CanvasField>

              <CanvasField theme={th} label="Format" required>
                <select
                  value={draft.format}
                  onChange={(event) =>
                    setDraftField(
                      "format",
                      event.target.value as ReportOutputFormat,
                    )
                  }
                  style={filterInputStyle}
                >
                  {REPORT_OUTPUT_FORMATS.map((format: ReportOutputFormat) => (
                    <option key={format} value={format}>
                      {format}
                    </option>
                  ))}
                </select>
              </CanvasField>

              <CanvasField
                theme={th}
                label="Period"
                hint="Monthly reporting normally uses YYYY-MM."
              >
                <input
                  value={draft.period}
                  onChange={(event) =>
                    setDraftField("period", event.target.value)
                  }
                  placeholder="2026-05"
                  style={monoInputStyle}
                />
              </CanvasField>

              <CanvasField
                theme={th}
                label="Cost center"
                hint="Optional scope refinement, for example CC-FIN-001."
              >
                <input
                  value={draft.costCenterCode}
                  onChange={(event) =>
                    setDraftField("costCenterCode", event.target.value)
                  }
                  placeholder="CC-FIN-001"
                  style={monoInputStyle}
                />
              </CanvasField>

              <CanvasField
                theme={th}
                label="Passenger"
                hint="Optional passenger drill-down for a scoped export."
              >
                <input
                  value={draft.passengerUserId}
                  onChange={(event) =>
                    setDraftField("passengerUserId", event.target.value)
                  }
                  placeholder="usr_passenger_102"
                  style={monoInputStyle}
                />
              </CanvasField>

              <div style={actionRowStyle}>
                <ActionButton
                  descriptor={createAction}
                  label={pending ? "Submitting…" : "Queue report"}
                  icon="plus"
                  variant="primary"
                  onClick={handleCreateJob}
                />
                <ActionButton
                  descriptor={refreshAction}
                  label="Refresh list"
                  icon="arrow"
                  onClick={handleRefresh}
                />
              </div>
            </CanvasCard>

            <CanvasCard
              theme={th}
              title="State coverage"
              subtitle="Manual QA shortcuts for the six shared EmptyReason variants."
              padding={16}
            >
              <div style={emptyReasonRowStyle}>
                <Link href="/reports" style={emptyReasonLinkStyle}>
                  live data
                </Link>
                {MANUAL_EMPTY_REASONS.map((reason) => (
                  <Link
                    key={reason}
                    href={`/reports?emptyReason=${reason}`}
                    style={emptyReasonLinkStyle}
                  >
                    {reason}
                  </Link>
                ))}
              </div>
            </CanvasCard>

            <CanvasCard
              theme={th}
              title="Cross-app deep links"
              subtitle="Reports can exit to artifact download, tenant audit, or external operational follow-up."
              padding={16}
            >
              <div style={linkListStyle}>
                {crossAppLinks.map((link) => (
                  <div key={link.label} style={linkItemStyle}>
                    <span style={{ color: th.text, fontSize: 12.5 }}>
                      {link.label}
                    </span>
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noreferrer"
                      style={buttonAnchorStyle}
                    >
                      Open
                    </a>
                  </div>
                ))}
                <div style={linkItemStyle}>
                  <span style={{ color: th.text, fontSize: 12.5 }}>
                    Review tenant-side audit receipts for reporting actions
                  </span>
                  <Link href="/audit" style={buttonAnchorStyle}>
                    Open
                  </Link>
                </div>
              </div>
            </CanvasCard>
          </div>
        </div>
      </div>
    </div>
  );
}
