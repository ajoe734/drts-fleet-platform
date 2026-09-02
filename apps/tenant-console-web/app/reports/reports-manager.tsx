"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type {
  EmptyReason,
  ReportJobRecord,
  ReportJobStatus,
  ReportJobType,
  ReportOutputFormat,
  ResourceActionDescriptor,
} from "@drts/contracts";
import {
  IMPLEMENTED_REPORT_JOB_TYPES,
  OPERATIONAL_REPORT_JOB_TYPES,
  IMPLEMENTED_REPORT_OUTPUT_FORMATS,
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
import { createBrowserApiClient } from "@/lib/browser-api-client";
import {
  getRuntimeCrossAppOrigin,
  type CrossAppTarget,
} from "@/lib/runtime-config";
import { createIdempotencyKey } from "@drts/api-client";
import { useTranslation } from "@/lib/i18n";

type Translate = (
  key: string,
  params?: Record<string, string | number>,
) => string;

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
  /** null when this deployment has no origin for the target app. */
  href: string | null;
};

type ReportTypeOption = { value: ReportJobType; label: string };
type StatusFilterOption = { value: ReportStatusFilter; label: string };

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

// Offering a report the API has no builder for produced a completed job with
// zero rows; it now produces a 501. Either way the option was never usable, so
// the picker shows only what IMPLEMENTED_REPORT_JOB_TYPES says exists.
const OFFERABLE_REPORT_JOB_TYPES = OPERATIONAL_REPORT_JOB_TYPES.filter(
  (jobType: ReportJobType) =>
    (IMPLEMENTED_REPORT_JOB_TYPES as readonly ReportJobType[]).includes(
      jobType,
    ),
);

function getReportTypeOptions(t: Translate): ReportTypeOption[] {
  return OFFERABLE_REPORT_JOB_TYPES.map((jobType: ReportJobType) => ({
    value: jobType,
    label:
      jobType === "trip_summary"
        ? t("reports.type.trip_summary")
        : jobType === "monthly_trip_report"
          ? t("reports.type.monthly_trip_report")
          : jobType === "revenue_summary"
            ? t("reports.type.revenue_summary")
            : jobType === "incident_register"
              ? t("reports.type.incident_register")
              : t("reports.type.operational_overview"),
  }));
}

function getStatusFilterOptions(t: Translate): readonly StatusFilterOption[] {
  return [
    { value: "all", label: t("reports.status.all") },
    { value: "queued", label: t("reports.status.queued") },
    { value: "running", label: t("reports.status.running") },
    { value: "completed", label: t("reports.status.completed") },
    { value: "failed", label: t("reports.status.failed") },
    { value: "expired", label: t("reports.status.expired") },
  ];
}

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
  })
    .format(parsed)
    .replace(/[\u00a0\u202f\u2009]/g, " ");
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

function getStatusLabel(status: DisplayReportStatus, t: Translate) {
  return t(`reports.status.${status}`);
}

function toParameterSummary(job: ReportJobRecord, t: Translate) {
  const entries: string[] = [];
  const period = getReportJobPeriod(job);
  if (period !== "—") {
    entries.push(t("reports.param.period", { value: period }));
  }

  const costCenterCode =
    typeof job.filters.costCenterCode === "string"
      ? job.filters.costCenterCode
      : null;
  if (costCenterCode) {
    entries.push(t("reports.param.costCenter", { value: costCenterCode }));
  }

  const passengerUserId =
    typeof job.filters.passengerUserId === "string"
      ? job.filters.passengerUserId
      : null;
  if (passengerUserId) {
    entries.push(t("reports.param.passenger", { value: passengerUserId }));
  }

  const tenantId =
    typeof job.filters.tenantId === "string" ? job.filters.tenantId : null;
  if (tenantId) {
    entries.push(t("reports.param.tenant", { value: tenantId }));
  }

  return entries.length > 0
    ? entries.join(" · ")
    : t("reports.param.defaultScope");
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

function getEmptyStateCopy(reason: EmptyReason | null, t: Translate) {
  switch (reason) {
    case "not_provisioned":
      return {
        title: t("reports.empty.not_provisioned.title"),
        description: t("reports.empty.not_provisioned.description"),
      };
    case "fetch_failed":
      return {
        title: t("reports.empty.fetch_failed.title"),
        description: t("reports.empty.fetch_failed.description"),
      };
    case "permission_denied":
      return {
        title: t("reports.empty.permission_denied.title"),
        description: t("reports.empty.permission_denied.description"),
      };
    case "external_unavailable":
      return {
        title: t("reports.empty.external_unavailable.title"),
        description: t("reports.empty.external_unavailable.description"),
      };
    case "filtered_empty":
      return {
        title: t("reports.empty.filtered_empty.title"),
        description: t("reports.empty.filtered_empty.description"),
      };
    case "no_data":
    default:
      return {
        title: t("reports.empty.no_data.title"),
        description: t("reports.empty.no_data.description"),
      };
  }
}

/**
 * Absolute href for a deep link into another app, or null when this deployment
 * has no origin configured for it.
 *
 * This used to read `process.env` from inside a client component and fall back
 * to `http://localhost:3002`. Only `NEXT_PUBLIC_` vars reach the browser at
 * all, and those are inlined at image build time -- before the deployed URLs
 * exist -- so every deployed tenant console linked its operators to localhost.
 * The origin now comes from the runtime config, resolved on the server per
 * request; when it is absent the caller renders a disabled affordance instead
 * of a link that goes nowhere.
 */
function buildCrossAppHref(
  targetApp: CrossAppTarget,
  route: string,
): string | null {
  const origin = getRuntimeCrossAppOrigin(targetApp);
  if (!origin) {
    return null;
  }
  return `${origin}${route.startsWith("/") ? route : `/${route}`}`;
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
  const { t } = useTranslation();
  const client = useMemo(() => createBrowserApiClient(), []);
  const [pending, startTransition] = useTransition();
  const [flash, setFlash] = useState<ReportsFlash | null>(null);
  const [statusFilter, setStatusFilter] = useState<ReportStatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [periodFilter, setPeriodFilter] = useState("");
  const [createJobIntentKey, setCreateJobIntentKey] = useState(() =>
    createIdempotencyKey("tenant-report"),
  );
  const [rerunIntentKeys, setRerunIntentKeys] = useState<
    Record<string, string>
  >({});
  const [draft, setDraft] = useState<ReportDraft>({
    jobType: "monthly_trip_report",
    format: "xlsx",
    period: "2026-05",
    costCenterCode: "",
    passengerUserId: "",
  });

  const reportTypeOptions = getReportTypeOptions(t);
  const statusFilterOptions = getStatusFilterOptions(t);

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
      parameters: toParameterSummary(job, t),
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
          ? t("reports.artifact.signed")
          : displayStatus === "expired"
            ? t("reports.artifact.expired")
            : t("reports.artifact.notReady"),
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
          ? t("reports.statusReason.failed")
          : displayStatus === "expired"
            ? t("reports.statusReason.expired")
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
  const emptyStateCopy = getEmptyStateCopy(effectiveEmptyReason, t);

  const opsReportingLink: CrossAppLink = {
    label: t("reports.crossApp.opsReporting"),
    href: buildCrossAppHref("ops-console", "/reports"),
  };
  const platformAuditLink: CrossAppLink = {
    label: t("reports.crossApp.platformAudit"),
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
          title: t("reports.flash.actionFailed.title"),
          description:
            error instanceof Error
              ? error.message
              : t("reports.flash.unknownError"),
          tone: "warning",
        });
      }
    });
  }

  function handleRefresh() {
    runTransition(async () => {
      router.refresh();
      setFlash({
        title: t("reports.flash.refreshSent.title"),
        description: t("reports.flash.refreshSent.description"),
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

      const result = await client.createTenantReportJob(
        {
          jobType: draft.jobType,
          format: draft.format,
          filters,
        },
        {
          idempotencyKey: createJobIntentKey,
        },
      );

      setCreateJobIntentKey(createIdempotencyKey("tenant-report"));
      setFlash({
        title: t("reports.flash.jobQueued.title"),
        description: t("reports.flash.jobQueued.description", {
          jobId: result.jobId,
        }),
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

    if (!window.confirm(t("reports.confirm.rerun", { jobId: job.jobId }))) {
      return;
    }

    const rerunKey =
      rerunIntentKeys[job.jobId] ?? createIdempotencyKey("tenant-report-rerun");
    if (!rerunIntentKeys[job.jobId]) {
      setRerunIntentKeys((prev) => ({
        ...prev,
        [job.jobId]: rerunKey,
      }));
    }

    runTransition(async () => {
      const result = await client.createTenantReportJob(
        {
          jobType: job.jobType,
          format: job.format,
          filters: job.filters,
        },
        {
          idempotencyKey: rerunKey,
        },
      );

      setRerunIntentKeys((prev) => {
        const next = { ...prev };
        delete next[job.jobId];
        return next;
      });

      setFlash({
        title: t("reports.flash.rerunQueued.title"),
        description: t("reports.flash.rerunQueued.description", {
          jobId: result.jobId,
        }),
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
    { h: t("reports.col.job"), k: "id", w: 180, mono: true },
    { h: t("reports.col.type"), k: "type", w: 170, mono: true },
    { h: t("reports.col.parameters"), k: "parameters", w: 220, mono: true },
    {
      h: t("reports.col.status"),
      w: 118,
      r: (row) => (
        <CanvasPill theme={th} tone={getStatusTone(row.status)} dot>
          {getStatusLabel(row.status, t)}
        </CanvasPill>
      ),
    },
    { h: t("reports.col.created"), k: "createdAt", w: 150, mono: true },
    { h: t("reports.col.completed"), k: "completedAt", w: 150, mono: true },
    { h: t("reports.col.format"), k: "format", w: 82, mono: true },
    { h: t("reports.col.expires"), k: "expiresAt", w: 150, mono: true },
    {
      h: t("reports.col.file"),
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
      h: t("reports.col.actions"),
      w: 180,
      r: (row) => (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <ActionButton
            descriptor={row.downloadDescriptor}
            label={t("reports.rowAction.download")}
            icon="ext"
            size="xs"
            onClick={() => handleDownload(row.artifactUrl)}
          />
          <ActionButton
            descriptor={row.rerunDescriptor}
            label={t("reports.rowAction.rerun")}
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
        title={t("reports.title")}
        subtitle={t("reports.subtitle")}
        actions={
          <div style={actionRowStyle}>
            <ActionButton
              descriptor={refreshAction}
              label={t("reports.action.refresh")}
              icon="arrow"
              onClick={handleRefresh}
            />
            <ActionButton
              descriptor={createAction}
              label={t("reports.action.createJob")}
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
            title={t("reports.errorsBanner.title")}
            body={t("reports.errorsBanner.body")}
            actions={
              <div style={{ color: th.text, fontSize: 11.5 }}>
                {t("reports.errorsBanner.count", { count: errors.length })}
              </div>
            }
          />
        ) : null}

        <CanvasBanner
          theme={th}
          tone="info"
          title={t("reports.t6.title")}
          body={t("reports.t6.body", {
            time: formatDateTime(generatedAt),
            tier: t(`reports.tier.${refreshTier}`),
          })}
        />

        <CanvasBanner
          theme={th}
          tone="accent"
          title={t("reports.crossAppBanner.title")}
          body={t("reports.crossAppBanner.body")}
          actions={
            <>
              {opsReportingAction && opsReportingLink.href ? (
                <a
                  href={opsReportingLink.href}
                  target="_blank"
                  rel="noreferrer"
                  style={buttonAnchorStyle}
                >
                  {t("reports.crossAppBanner.openOps")}
                </a>
              ) : null}
              {platformAuditAction && platformAuditLink.href ? (
                <a
                  href={platformAuditLink.href}
                  target="_blank"
                  rel="noreferrer"
                  style={buttonAnchorStyle}
                >
                  {t("reports.crossAppBanner.openPlatformAudit")}
                </a>
              ) : null}
              <Link href="/audit" style={buttonAnchorStyle}>
                {t("reports.crossAppBanner.tenantAudit")}
              </Link>
            </>
          }
        />

        <div style={kpiGridStyle}>
          <CanvasKPI
            theme={th}
            label={t("reports.kpi.jobs")}
            value={String(totalJobs)}
            sub={t("reports.kpi.jobsSub")}
          />
          <CanvasKPI
            theme={th}
            label={t("reports.kpi.active")}
            value={String(activeJobs)}
            sub={t("reports.kpi.activeSub")}
          />
          <CanvasKPI
            theme={th}
            label={t("reports.kpi.ready")}
            value={String(readyJobs)}
            sub={t("reports.kpi.readySub")}
          />
          <CanvasKPI
            theme={th}
            label={t("reports.kpi.failedExpired")}
            value={`${failedJobs} / ${expiredJobs}`}
            sub={t("reports.kpi.failedExpiredSub")}
          />
        </div>

        <div style={cardGridStyle}>
          <CanvasCard
            theme={th}
            title={t("reports.queue.title")}
            subtitle={t("reports.queue.subtitle")}
            padding={16}
          >
            <div style={filterGridStyle}>
              <CanvasField theme={th} label={t("reports.filter.type")}>
                <select
                  value={typeFilter}
                  onChange={(event) => setTypeFilter(event.target.value)}
                  style={filterInputStyle}
                >
                  <option value="all">{t("reports.filter.allTypes")}</option>
                  {reportTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </CanvasField>

              <CanvasField theme={th} label={t("reports.filter.status")}>
                <select
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(event.target.value as ReportStatusFilter)
                  }
                  style={filterInputStyle}
                >
                  {statusFilterOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </CanvasField>

              <CanvasField
                theme={th}
                label={t("reports.filter.period")}
                hint={t("reports.filter.periodHint")}
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
                {t("reports.filter.clear")}
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
                      {t("reports.filter.clear")}
                    </CanvasBtn>
                  ) : (
                    <ActionButton
                      descriptor={createAction}
                      label={t("reports.action.createJob")}
                      icon="plus"
                      variant="primary"
                      onClick={handleCreateJob}
                    />
                  )}
                  <ActionButton
                    descriptor={refreshAction}
                    label={t("reports.action.refresh")}
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
              title={t("reports.create.title")}
              subtitle={t("reports.create.subtitle")}
              padding={16}
            >
              <CanvasField
                theme={th}
                label={t("reports.create.jobType")}
                required
              >
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
                  {reportTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </CanvasField>

              <CanvasField
                theme={th}
                label={t("reports.create.format")}
                required
              >
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
                  {IMPLEMENTED_REPORT_OUTPUT_FORMATS.map(
                    (format: ReportOutputFormat) => (
                      <option key={format} value={format}>
                        {format}
                      </option>
                    ),
                  )}
                </select>
              </CanvasField>

              <CanvasField
                theme={th}
                label={t("reports.create.period")}
                hint={t("reports.create.periodHint")}
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
                label={t("reports.create.costCenter")}
                hint={t("reports.create.costCenterHint")}
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
                label={t("reports.create.passenger")}
                hint={t("reports.create.passengerHint")}
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
                  label={
                    pending
                      ? t("reports.create.submitting")
                      : t("reports.create.submit")
                  }
                  icon="plus"
                  variant="primary"
                  onClick={handleCreateJob}
                />
                <ActionButton
                  descriptor={refreshAction}
                  label={t("reports.create.refreshList")}
                  icon="arrow"
                  onClick={handleRefresh}
                />
              </div>
            </CanvasCard>

            <CanvasCard
              theme={th}
              title={t("reports.override.title")}
              subtitle={t("reports.override.subtitle")}
              padding={16}
            >
              <div style={emptyReasonRowStyle}>
                <Link href="/reports" style={emptyReasonLinkStyle}>
                  {t("reports.override.liveData")}
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
              title={t("reports.deepLinks.title")}
              subtitle={t("reports.deepLinks.subtitle")}
              padding={16}
            >
              <div style={linkListStyle}>
                {crossAppLinks.map((link) => (
                  <div key={link.label} style={linkItemStyle}>
                    <span style={{ color: th.text, fontSize: 12.5 }}>
                      {link.label}
                    </span>
                    {link.href ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                        style={buttonAnchorStyle}
                      >
                        {t("reports.deepLinks.open")}
                      </a>
                    ) : (
                      <span
                        title={t("reports.deepLinks.originUnavailable")}
                        style={{ ...buttonAnchorStyle, opacity: 0.5 }}
                      >
                        {t("reports.deepLinks.open")}
                      </span>
                    )}
                  </div>
                ))}
                <div style={linkItemStyle}>
                  <span style={{ color: th.text, fontSize: 12.5 }}>
                    {t("reports.deepLinks.auditReceipt")}
                  </span>
                  <Link href="/audit" style={buttonAnchorStyle}>
                    {t("reports.deepLinks.open")}
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
