"use client";

import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type CSSProperties,
} from "react";
import type {
  CreateReportJobCommand,
  DispatchRecordingIndexRowRecord,
  FilingPackageDetailRecord,
  FilingPackageManifestEntryRecord,
  FilingPackageListRecord,
  FilingPackageType,
  PartnerRevenueSummaryRowRecord,
  ReportJobDetailRecord,
  ReportJobRecord,
  ReportJobStatus,
  ReportJobType,
  ReportOutputFormat,
  ResourceActionDescriptor,
} from "@drts/contracts";
import {
  FILING_PACKAGE_TYPES,
  REGULATORY_REPORT_JOB_TYPES,
  REPORT_JOB_TYPES,
  REPORT_OUTPUT_FORMATS,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasField,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  buildCanvasTheme,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";
import { getOpsClient } from "@/lib/api-client";
import { useTranslation } from "@/lib/i18n";
import { formatOpsCodeLabel, getOpsLabel } from "@/lib/localized-labels";

type ReportsTab = "jobs" | "packages" | "schedules";

type JobRow = ReportJobRecord &
  Record<string, unknown> & {
    _selected?: boolean;
  };

type PackageRow = FilingPackageListRecord &
  Record<string, unknown> & {
    _selected?: boolean;
  };

type DispatchRow = DispatchRecordingIndexRowRecord & Record<string, unknown>;
type PartnerRevenueRow = PartnerRevenueSummaryRowRecord &
  Record<string, unknown>;
type ManifestEntryRow = FilingPackageManifestEntryRecord &
  Record<string, unknown>;

const th = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const REGULATORY_JOB_TYPE_SET = new Set<ReportJobType>(
  REGULATORY_REPORT_JOB_TYPES,
);

const pageStyle: CSSProperties = {
  minHeight: "100%",
  background: th.bg,
  color: th.text,
};

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const formGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const twoColumnGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 16,
};

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const formFooterStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  marginTop: 4,
};

const formNoteStyle: CSSProperties = {
  fontSize: 11,
  lineHeight: 1.45,
  color: th.textMuted,
};

const nativeInputStyle: CSSProperties = {
  width: "100%",
  background: th.bgRaised,
  border: `1px solid ${th.border}`,
  borderRadius: 7,
  padding: "8px 10px",
  fontSize: 12.5,
  color: th.text,
  fontFamily: th.fontFamily,
  outline: "none",
  boxSizing: "border-box",
};

const nativeMonoInputStyle: CSSProperties = {
  ...nativeInputStyle,
  fontFamily: th.monoFamily,
  fontSize: 11.5,
};

const nativeSelectStyle: CSSProperties = {
  ...nativeInputStyle,
  cursor: "pointer",
};

const rowButtonStyle: CSSProperties = {
  padding: 0,
  border: 0,
  background: "transparent",
  color: th.accent,
  fontFamily: th.monoFamily,
  fontSize: 11.5,
  fontWeight: 600,
  cursor: "pointer",
};

const tabButtonStyle: CSSProperties = {
  border: 0,
  padding: 0,
  margin: 0,
  background: "transparent",
  color: "inherit",
  font: "inherit",
  cursor: "pointer",
};

const rowStackStyle: CSSProperties = {
  display: "grid",
  gap: 3,
  minWidth: 0,
};

const rowTitleStyle: CSSProperties = {
  color: th.text,
  fontWeight: 600,
  minWidth: 0,
};

const rowMetaStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 11,
  lineHeight: 1.35,
  minWidth: 0,
};

const actionLinkStyle: CSSProperties = {
  color: th.accent,
  fontSize: 12,
  fontWeight: 600,
  textDecoration: "none",
};

const mutedLinkStyle: CSSProperties = {
  ...actionLinkStyle,
  color: th.textMuted,
  fontWeight: 500,
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const modalBackdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 70,
  background: "rgba(0, 0, 0, 0.6)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
};

const modalFrameStyle: CSSProperties = {
  width: "100%",
  maxWidth: 780,
};

const emptyStateStyle: CSSProperties = {
  padding: 24,
  textAlign: "center",
  color: th.textMuted,
  fontSize: 12.5,
};

const jsonBlockStyle: CSSProperties = {
  margin: 0,
  padding: "12px 14px",
  borderRadius: 8,
  border: `1px solid ${th.border}`,
  background: th.surfaceLo,
  color: th.text,
  fontSize: 11.5,
  lineHeight: 1.5,
  fontFamily: th.monoFamily,
  overflowX: "auto",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const sectionCopyStyle: CSSProperties = {
  fontSize: 12,
  lineHeight: 1.5,
  color: th.textMuted,
};

type TranslateFn = (
  key: string,
  params?: Record<string, string | number>,
) => string;

function copyText(
  t: TranslateFn,
  key: string,
  params?: Record<string, string | number>,
) {
  return t(`reports.${key}`, params);
}

function defaultClosedMonth() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const target = new Date(Date.UTC(year, month - 1, 1));
  return `${target.getUTCFullYear()}-${String(
    target.getUTCMonth() + 1,
  ).padStart(2, "0")}`;
}

function formatDateTime(
  locale: "en" | "zh",
  value: string | null | undefined,
  emptyLabel: string,
  variant: "short" | "long" = "short",
) {
  if (!value) {
    return emptyLabel;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return emptyLabel;
  }

  const formatted = new Intl.DateTimeFormat(
    locale === "zh" ? "zh-TW" : "en-US",
    variant === "long"
      ? {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          timeZone: "UTC",
        }
      : {
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          timeZone: "UTC",
        },
  ).format(parsed);

  return formatted.replace(",", "");
}

function shortHash(value: string | null | undefined, emptyLabel: string) {
  if (!value) {
    return emptyLabel;
  }
  return `${value.slice(0, 12)}...`;
}

function jobCategory(jobType: string) {
  return REGULATORY_JOB_TYPE_SET.has(jobType as ReportJobType)
    ? "regulatory"
    : "operational";
}

function expiresSoon(value: string | null | undefined, hours = 12) {
  if (!value) return false;
  const expiresAt = new Date(value).getTime();
  if (Number.isNaN(expiresAt)) return false;
  return expiresAt - Date.now() <= hours * 60 * 60 * 1000;
}

function isExpired(value: string | null | undefined) {
  if (!value) return false;
  const expiresAt = new Date(value).getTime();
  if (Number.isNaN(expiresAt)) return false;
  return expiresAt <= Date.now();
}

function artifactExpired(job: Pick<ReportJobRecord, "status" | "artifact">) {
  return job.status === "expired" || isExpired(job.artifact?.expiresAt);
}

function artifactDownloadUrl(
  artifact: ReportJobRecord["artifact"] | null | undefined,
) {
  if (!artifact || typeof artifact !== "object") {
    return null;
  }

  const downloadMetadata = (
    artifact as { downloadMetadata?: { downloadUrl?: unknown } }
  ).downloadMetadata;
  return typeof downloadMetadata?.downloadUrl === "string"
    ? downloadMetadata.downloadUrl
    : null;
}

function jobDownloadDescriptor(
  job: Pick<ReportJobRecord, "status" | "artifact">,
): ResourceActionDescriptor | null {
  if (job.status === "failed") {
    return null;
  }

  const expired = artifactExpired(job);
  const enabled =
    job.status === "completed" &&
    Boolean(artifactDownloadUrl(job.artifact)) &&
    !expired;

  let disabledReasonCode: string | undefined;
  if (!enabled) {
    if (job.status === "queued" || job.status === "running") {
      disabledReasonCode = "still_running";
    } else if (expired) {
      disabledReasonCode = "expired";
    } else {
      disabledReasonCode = "artifact_missing";
    }
  }

  return {
    action: "download_artifact",
    enabled,
    riskLevel: "low",
    ...(disabledReasonCode ? { disabledReasonCode } : {}),
  };
}

function jobRetryDescriptor(
  job: Pick<ReportJobRecord, "status">,
): ResourceActionDescriptor | null {
  if (job.status !== "failed") {
    return null;
  }

  return {
    action: "retry_report_job",
    enabled: true,
    riskLevel: "medium",
  };
}

function readFilterString(
  filters: Record<string, unknown>,
  key: string,
): string | null {
  const value = filters[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function summarizeJobPeriod(
  filters: Record<string, unknown>,
  t: TranslateFn,
) {
  const period = readFilterString(filters, "period");
  if (period) {
    return period;
  }

  const month = readFilterString(filters, "month");
  if (month) {
    return month;
  }

  const from = readFilterString(filters, "from");
  const to = readFilterString(filters, "to");
  if (from || to) {
    return copyText(t, "periodRange", {
      from: from ?? copyText(t, "rangeOpen"),
      to: to ?? copyText(t, "rangeOpen"),
    });
  }

  const vehicleId = readFilterString(filters, "vehicleId");
  if (vehicleId) {
    return vehicleId;
  }

  return t("common.dash");
}

function reportStatusTone(status: ReportJobStatus): CanvasTone {
  switch (status) {
    case "completed":
      return "success";
    case "running":
      return "info";
    case "failed":
      return "danger";
    case "expired":
      return "warn";
    case "queued":
    default:
      return "neutral";
  }
}

function filingStatusTone(
  status: FilingPackageListRecord["status"],
): CanvasTone {
  switch (status) {
    case "completed":
      return "success";
    case "running":
      return "info";
    case "failed":
      return "danger";
    case "queued":
    default:
      return "neutral";
  }
}

function actionDisabledReasonLabel(
  locale: "en" | "zh",
  descriptor: ResourceActionDescriptor,
  t: TranslateFn,
) {
  if (!descriptor.disabledReasonCode) {
    return null;
  }
  if (descriptor.disabledReasonCode === "still_running") {
    return copyText(t, "action.stillRunning");
  }
  if (descriptor.disabledReasonCode === "artifact_missing") {
    return copyText(t, "action.artifactPending");
  }
  return formatOpsCodeLabel(locale, descriptor.disabledReasonCode);
}

function ActionButton({
  descriptor,
  locale,
  busy,
  label,
  icon,
  variant = "secondary",
  onInvoke,
}: {
  descriptor: ResourceActionDescriptor | null;
  locale: "en" | "zh";
  busy: boolean;
  label: string;
  icon?: "plus" | "arrow" | "ext";
  variant?: "primary" | "secondary" | "ghost";
  onInvoke: () => void;
}) {
  const { t } = useTranslation();
  if (!descriptor) {
    return null;
  }

  const disabledReason = actionDisabledReasonLabel(locale, descriptor, t);
  const interactiveProps =
    descriptor.enabled && !busy ? { onClick: onInvoke } : {};

  return (
    <CanvasBtn
      theme={th}
      size="sm"
      variant={variant}
      disabled={!descriptor.enabled || busy}
      {...(icon ? { icon } : {})}
      {...interactiveProps}
    >
      {label}
      {!descriptor.enabled && disabledReason ? ` (${disabledReason})` : ""}
    </CanvasBtn>
  );
}

function ReportJobComposerModal({
  pending,
  jobType,
  setJobType,
  format,
  setFormat,
  periodLabel,
  setPeriodLabel,
  vehicleId,
  setVehicleId,
  jobCategoryLabel,
  typeHint,
  reportTypeOptions,
  onCancel,
  onSubmit,
}: {
  pending: boolean;
  jobType: ReportJobType;
  setJobType: (value: ReportJobType) => void;
  format: ReportOutputFormat;
  setFormat: (value: ReportOutputFormat) => void;
  periodLabel: string;
  setPeriodLabel: (value: string) => void;
  vehicleId: string;
  setVehicleId: (value: string) => void;
  jobCategoryLabel: string;
  typeHint: string;
  reportTypeOptions: Array<{ value: ReportJobType; label: string }>;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div style={modalBackdropStyle} onClick={onCancel}>
      <div style={modalFrameStyle} onClick={(event) => event.stopPropagation()}>
        <CanvasCard
          theme={th}
          title={copyText(t, "form.createJob")}
          subtitle={copyText(t, "form.modalSubtitle")}
          actions={
            <CanvasPill theme={th} tone="info">
              {jobCategoryLabel}
            </CanvasPill>
          }
        >
          <CanvasBanner
            theme={th}
            tone="info"
            icon="reports"
            title={copyText(t, "backgroundExport")}
            body={copyText(t, "form.modalSubtitle")}
          />
          <div style={{ height: 14 }} />
          <div style={formGridStyle}>
            <CanvasField
              theme={th}
              label={copyText(t, "form.type")}
              hint={typeHint}
            >
              <select
                value={jobType}
                onChange={(event) =>
                  setJobType(event.target.value as ReportJobType)
                }
                style={nativeSelectStyle}
              >
                {reportTypeOptions.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </CanvasField>

            <CanvasField theme={th} label={copyText(t, "form.format")}>
              <select
                value={format}
                onChange={(event) =>
                  setFormat(event.target.value as ReportOutputFormat)
                }
                style={nativeSelectStyle}
              >
                {REPORT_OUTPUT_FORMATS.map((value) => (
                  <option key={value} value={value}>
                    {value.toUpperCase()}
                  </option>
                ))}
              </select>
            </CanvasField>

            <CanvasField
              theme={th}
              label={copyText(t, "form.periodTag")}
              hint={copyText(t, "form.periodHint")}
            >
              <input
                value={periodLabel}
                onChange={(event) => setPeriodLabel(event.target.value)}
                placeholder={copyText(t, "form.periodHint")}
                style={nativeMonoInputStyle}
              />
            </CanvasField>

            <CanvasField
              theme={th}
              label={copyText(t, "form.vehicleId")}
              hint={copyText(t, "form.vehicleHint")}
            >
              <input
                value={vehicleId}
                onChange={(event) => setVehicleId(event.target.value)}
                placeholder={copyText(t, "form.vehiclePlaceholder")}
                style={nativeMonoInputStyle}
              />
            </CanvasField>
          </div>

          <div style={formFooterStyle}>
            <div style={formNoteStyle}>{copyText(t, "form.modalNote")}</div>
            <div style={actionRowStyle}>
              <CanvasBtn
                theme={th}
                size="sm"
                onClick={onCancel}
                disabled={pending}
              >
                {t("common.cancel")}
              </CanvasBtn>
              <CanvasBtn
                theme={th}
                variant="primary"
                icon="plus"
                size="sm"
                onClick={onSubmit}
                disabled={pending}
              >
                {pending
                  ? copyText(t, "form.submitting")
                  : copyText(t, "form.createJob")}
              </CanvasBtn>
            </div>
          </div>
        </CanvasCard>
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const { t, locale } = useTranslation();
  const [activeTab, setActiveTab] = useState<ReportsTab>("jobs");
  const [jobs, setJobs] = useState<ReportJobRecord[]>([]);
  const [packages, setPackages] = useState<FilingPackageListRecord[]>([]);
  const [jobDetail, setJobDetail] = useState<ReportJobDetailRecord | null>(
    null,
  );
  const [packageDetail, setPackageDetail] =
    useState<FilingPackageDetailRecord | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(
    null,
  );
  const [detailLoadingKey, setDetailLoadingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();
  const [showJobComposer, setShowJobComposer] = useState(false);
  const [showPackageComposer, setShowPackageComposer] = useState(false);
  const [jobType, setJobType] = useState<ReportJobType>(REPORT_JOB_TYPES[0]!);
  const [format, setFormat] = useState<ReportOutputFormat>("xlsx");
  const [periodLabel, setPeriodLabel] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [packageType, setPackageType] =
    useState<FilingPackageType>("monthly_report");
  const [packageMonth, setPackageMonth] = useState(defaultClosedMonth());
  const [packageScope, setPackageScope] = useState("ops-console");

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const client = getOpsClient();
      const [reportJobs, filingPackages] = await Promise.all([
        client.listReportJobs(),
        client.listFilingPackages(),
      ]);
      setJobs(reportJobs);
      setPackages(filingPackages);
      setError(null);

      if (
        selectedJobId &&
        !reportJobs.some((job) => job.jobId === selectedJobId)
      ) {
        setSelectedJobId(null);
        setJobDetail(null);
      }
      if (
        selectedPackageId &&
        !filingPackages.some((pkg) => pkg.packageId === selectedPackageId)
      ) {
        setSelectedPackageId(null);
        setPackageDetail(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.unknown"));
    } finally {
      setLoading(false);
    }
  }

  async function inspectReportJob(jobId: string) {
    setSelectedJobId(jobId);
    setDetailLoadingKey(`job:${jobId}`);
    setError(null);
    try {
      const detail = await getOpsClient().getReportJob(jobId);
      setJobDetail(detail);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.unknown"));
    } finally {
      setDetailLoadingKey(null);
    }
  }

  async function downloadReportJob(jobId: string) {
    setDetailLoadingKey(`job:${jobId}`);
    setError(null);
    try {
      const detail = await getOpsClient().getReportJob(jobId);
      setSelectedJobId(jobId);
      setJobDetail(detail);
      openDownload(artifactDownloadUrl(detail.artifact));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.unknown"));
    } finally {
      setDetailLoadingKey(null);
    }
  }

  async function inspectFilingPackage(packageId: string) {
    setSelectedPackageId(packageId);
    setDetailLoadingKey(`package:${packageId}`);
    setError(null);
    try {
      const detail = await getOpsClient().getFilingPackage(packageId);
      setPackageDetail(detail);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.unknown"));
    } finally {
      setDetailLoadingKey(null);
    }
  }

  function submitReportJob() {
    startTransition(() => {
      void (async () => {
        try {
          const client = getOpsClient();
          const filters: CreateReportJobCommand["filters"] = {};
          if (periodLabel.trim()) {
            filters.period = periodLabel.trim();
          }
          if (vehicleId.trim()) {
            filters.vehicleId = vehicleId.trim();
          }
          const accepted = await client.createReportJob({
            jobType,
            format,
            ...(Object.keys(filters).length > 0 ? { filters } : {}),
          });
          setShowJobComposer(false);
          await loadData();
          await inspectReportJob(accepted.jobId);
        } catch (e) {
          setError(e instanceof Error ? e.message : t("common.unknown"));
        }
      })();
    });
  }

  function submitFilingPackage() {
    startTransition(() => {
      void (async () => {
        try {
          const client = getOpsClient();
          const accepted = await client.generateFilingPackage({
            packageType,
            period: packageMonth.trim() ? { month: packageMonth.trim() } : {},
            scope: packageScope.trim() ? { channel: packageScope.trim() } : {},
          });
          setShowPackageComposer(false);
          await loadData();
          await inspectFilingPackage(accepted.packageId);
        } catch (e) {
          setError(e instanceof Error ? e.message : t("common.unknown"));
        }
      })();
    });
  }

  function retryReportJob(job: ReportJobRecord) {
    startTransition(() => {
      void (async () => {
        try {
          const accepted = await getOpsClient().createReportJob({
            jobType: job.jobType as ReportJobType,
            format: job.format,
            filters: job.filters,
          });
          await loadData();
          await inspectReportJob(accepted.jobId);
        } catch (e) {
          setError(e instanceof Error ? e.message : t("common.unknown"));
        }
      })();
    });
  }

  function openDownload(url: string | null | undefined) {
    if (!url) {
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  const queuedReports = jobs.filter((job) => job.status === "queued").length;
  const runningReports = jobs.filter((job) => job.status === "running").length;
  const completedReports = jobs.filter(
    (job) => job.status === "completed",
  ).length;
  const readyArtifacts = jobs.filter((job) => job.artifact).length;
  const completedPackages = packages.filter(
    (pkg) => pkg.status === "completed",
  ).length;
  const regulatoryJobs = jobs.filter((job) =>
    REGULATORY_JOB_TYPE_SET.has(job.jobType as ReportJobType),
  ).length;
  const expiringArtifacts = jobs.filter((job) =>
    expiresSoon(job.artifact?.expiresAt),
  ).length;
  const reportTypeOptions = REPORT_JOB_TYPES.map((value) => ({
    value,
    label: copyText(t, `type.${value}`),
  }));
  const selectedJobCategoryLabel = copyText(
    t,
    `category.${jobCategory(jobType)}`,
  );
  const selectedJobTypeHint = `${copyText(t, `type.${jobType}.desc`)} ${copyText(
    t,
    "categoryLabel",
    {
      value: selectedJobCategoryLabel,
    },
  )}`;

  const packageTypeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    packages.forEach((pkg) => {
      counts[pkg.packageType] = (counts[pkg.packageType] || 0) + 1;
    });
    return counts;
  }, [packages]);

  const sortedJobRows = useMemo<JobRow[]>(
    () =>
      [...jobs]
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .map((job) => ({
          ...job,
          _selected: job.jobId === selectedJobId,
        })),
    [jobs, selectedJobId],
  );

  const sortedPackageRows = useMemo<PackageRow[]>(
    () =>
      [...packages]
        .sort((left, right) =>
          (right.generatedAt ?? right.createdAt).localeCompare(
            left.generatedAt ?? left.createdAt,
          ),
        )
        .map((pkg) => ({
          ...pkg,
          _selected: pkg.packageId === selectedPackageId,
        })),
    [packages, selectedPackageId],
  );

  const jobColumns: CanvasTableColumn<JobRow>[] = [
    {
      h: copyText(t, "col.job"),
      w: 156,
      mono: true,
      r: (row) => (
        <button
          type="button"
          style={rowButtonStyle}
          onClick={() => void inspectReportJob(row.jobId)}
          disabled={detailLoadingKey === `job:${row.jobId}`}
          aria-label={copyText(t, "inspect")}
        >
          {row.jobId}
        </button>
      ),
    },
    {
      h: copyText(t, "col.type"),
      w: 220,
      r: (row) => (
        <div style={rowStackStyle}>
          <span style={rowTitleStyle}>{copyText(t, `type.${row.jobType}`)}</span>
          <span style={rowMetaStyle}>
            {copyText(t, `category.${jobCategory(row.jobType)}`)}
          </span>
        </div>
      ),
    },
    {
      h: copyText(t, "form.periodTag"),
      w: 140,
      mono: true,
      r: (row) => summarizeJobPeriod(row.filters, t),
    },
    {
      h: copyText(t, "col.format"),
      w: 90,
      mono: true,
      r: (row) => row.format.toUpperCase(),
    },
    {
      h: copyText(t, "col.status"),
      w: 132,
      r: (row) => (
        <CanvasPill theme={th} tone={reportStatusTone(row.status)} dot>
          {formatOpsCodeLabel(locale, row.status)}
        </CanvasPill>
      ),
    },
    {
      h: copyText(t, "detail.expires"),
      w: 132,
      mono: true,
      r: (row) => (
        <div style={rowStackStyle}>
          <span style={rowTitleStyle}>
            {formatDateTime(locale, row.artifact?.expiresAt, t("common.dash"))}
          </span>
          {artifactExpired(row) ? (
            <span style={{ ...rowMetaStyle, color: th.warn }}>
              {copyText(t, "banner.artifactExpiredTitle")}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      h: copyText(t, "col.created"),
      mono: true,
      r: (row) => formatDateTime(locale, row.createdAt, t("common.dash")),
    },
    {
      h: copyText(t, "col.actions"),
      w: 260,
      r: (row) => (
        <div style={actionRowStyle}>
          <ActionButton
            descriptor={jobDownloadDescriptor(row)}
            locale={locale}
            busy={pending}
            label={copyText(t, "download")}
            icon="ext"
            onInvoke={() => void downloadReportJob(row.jobId)}
          />
          <ActionButton
            descriptor={jobRetryDescriptor(row)}
            locale={locale}
            busy={pending}
            label={copyText(t, "retry")}
            icon="arrow"
            onInvoke={() => retryReportJob(row)}
          />
        </div>
      ),
    },
  ];

  const packageColumns: CanvasTableColumn<PackageRow>[] = [
    {
      h: copyText(t, "col.package"),
      w: 164,
      mono: true,
      r: (row) => (
        <button
          type="button"
          style={rowButtonStyle}
          onClick={() => void inspectFilingPackage(row.packageId)}
          disabled={detailLoadingKey === `package:${row.packageId}`}
          aria-label={copyText(t, "inspect")}
        >
          {row.packageId}
        </button>
      ),
    },
    {
      h: copyText(t, "col.filingType"),
      w: 180,
      r: (row) => formatOpsCodeLabel(locale, row.packageType),
    },
    {
      h: copyText(t, "col.filingStatus"),
      w: 132,
      r: (row) => (
        <CanvasPill theme={th} tone={filingStatusTone(row.status)} dot>
          {formatOpsCodeLabel(locale, row.status)}
        </CanvasPill>
      ),
    },
    {
      h: copyText(t, "col.manifest"),
      w: 136,
      mono: true,
      r: (row) => shortHash(row.manifestHash, t("common.dash")),
    },
    {
      h: copyText(t, "col.items"),
      w: 90,
      mono: true,
      r: (row) => String(row.items.length),
    },
    {
      h: copyText(t, "col.generated"),
      w: 132,
      mono: true,
      r: (row) => formatDateTime(locale, row.generatedAt, t("common.dash")),
    },
    {
      h: copyText(t, "col.artifacts"),
      r: (row) =>
        row.artifactZipUrl || row.artifactPdfUrl ? (
          <div style={rowStackStyle}>
            {row.artifactZipUrl ? (
              <a
                href={row.artifactZipUrl}
                rel="noreferrer"
                target="_blank"
                style={actionLinkStyle}
              >
                {copyText(t, "short.zip")}
              </a>
            ) : null}
            {row.artifactPdfUrl ? (
              <a
                href={row.artifactPdfUrl}
                rel="noreferrer"
                target="_blank"
                style={mutedLinkStyle}
              >
                {copyText(t, "short.pdf")}
              </a>
            ) : null}
          </div>
        ) : (
          t("common.dash")
        ),
    },
  ];

  const tabItems: Array<{ id: ReportsTab; label: string }> = [
    { id: "jobs", label: copyText(t, "tab.jobs") },
    { id: "packages", label: copyText(t, "tab.packages") },
    { id: "schedules", label: copyText(t, "tab.schedules") },
  ];
  const renderedTabs = tabItems.map((tab) => (
    <button
      key={tab.id}
      type="button"
      onClick={() => setActiveTab(tab.id)}
      style={tabButtonStyle}
    >
      {tab.label}
    </button>
  ));
  const activeTabNode =
    renderedTabs[tabItems.findIndex((tab) => tab.id === activeTab)] ??
    renderedTabs[0];

  const packageTypeSummary =
    Object.entries(packageTypeCounts)
      .map(([type, count]) => `${formatOpsCodeLabel(locale, type)} × ${count}`)
      .join(" · ") || t("common.dash");

  return (
    <div style={pageStyle}>
      <CanvasPageHeader
        theme={th}
        title={copyText(t, "title")}
        subtitle={copyText(t, "header.subtitle")}
        tabs={renderedTabs}
        activeTab={activeTabNode}
        actions={
          activeTab === "jobs" ? (
            <CanvasBtn
              theme={th}
              variant="primary"
              icon="plus"
              size="sm"
              onClick={() => setShowJobComposer((value) => !value)}
            >
              {copyText(t, "form.createJob")}
            </CanvasBtn>
          ) : activeTab === "packages" ? (
            <CanvasBtn
              theme={th}
              variant="primary"
              icon="plus"
              size="sm"
              onClick={() => setShowPackageComposer((value) => !value)}
            >
              {copyText(t, "form.generatePackage")}
            </CanvasBtn>
          ) : undefined
        }
      />

      <div style={pageBodyStyle}>
        {error ? (
          <CanvasBanner
            theme={th}
            tone="danger"
            icon="warn"
            title={getOpsLabel(locale, "error")}
            body={error}
          />
        ) : null}

        {showJobComposer && activeTab === "jobs" ? (
          <ReportJobComposerModal
            pending={pending}
            jobType={jobType}
            setJobType={setJobType}
            format={format}
            setFormat={setFormat}
            periodLabel={periodLabel}
            setPeriodLabel={setPeriodLabel}
            vehicleId={vehicleId}
            setVehicleId={setVehicleId}
            jobCategoryLabel={selectedJobCategoryLabel}
            typeHint={selectedJobTypeHint}
            reportTypeOptions={reportTypeOptions}
            onCancel={() => setShowJobComposer(false)}
            onSubmit={submitReportJob}
          />
        ) : null}

        {showPackageComposer && activeTab === "packages" ? (
          <CanvasCard
            theme={th}
            title={copyText(t, "immutableFiling")}
            subtitle={copyText(t, "generateFiling")}
            actions={
              <CanvasPill theme={th} tone="accent">
                {copyText(t, "complianceBundle")}
              </CanvasPill>
            }
          >
            <CanvasBanner
              theme={th}
              tone="accent"
              icon="reports"
              title={copyText(t, "form.generatePackage")}
              body={copyText(t, "banner.generatedBundle")}
            />
            <div style={{ height: 14 }} />
            <div style={formGridStyle}>
              <CanvasField theme={th} label={copyText(t, "form.packageType")}>
                <select
                  value={packageType}
                  onChange={(event) =>
                    setPackageType(event.target.value as FilingPackageType)
                  }
                  style={nativeSelectStyle}
                >
                  {FILING_PACKAGE_TYPES.map((value) => (
                    <option key={value} value={value}>
                      {formatOpsCodeLabel(locale, value)}
                    </option>
                  ))}
                </select>
              </CanvasField>

              <CanvasField
                theme={th}
                label={copyText(t, "form.filingMonth")}
                hint={getOpsLabel(locale, "reportsClosedMonthExample")}
              >
                <input
                  value={packageMonth}
                  onChange={(event) => setPackageMonth(event.target.value)}
                  placeholder={getOpsLabel(locale, "reportsClosedMonthExample")}
                  style={nativeMonoInputStyle}
                />
              </CanvasField>

              <CanvasField
                theme={th}
                label={copyText(t, "form.scopeChannel")}
                hint={getOpsLabel(locale, "reportsRequestedByExample")}
              >
                <input
                  value={packageScope}
                  onChange={(event) => setPackageScope(event.target.value)}
                  placeholder={getOpsLabel(locale, "reportsRequestedByExample")}
                  style={nativeMonoInputStyle}
                />
              </CanvasField>
            </div>

            <div style={formFooterStyle}>
              <div style={formNoteStyle}>
                {copyText(t, "banner.packageComposerNote")}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <CanvasBtn
                  theme={th}
                  size="sm"
                  onClick={() => setShowPackageComposer(false)}
                  disabled={pending}
                >
                  {t("common.cancel")}
                </CanvasBtn>
                <CanvasBtn
                  theme={th}
                  variant="primary"
                  icon="plus"
                  size="sm"
                  onClick={submitFilingPackage}
                  disabled={pending}
                >
                  {pending
                    ? copyText(t, "form.submitting")
                    : copyText(t, "form.generatePackage")}
                </CanvasBtn>
              </div>
            </div>
          </CanvasCard>
        ) : null}

        {activeTab === "jobs" ? (
          <>
            <CanvasCard theme={th} padding={0}>
              {loading ? (
                <div style={emptyStateStyle}>{copyText(t, "loadingJobs")}</div>
              ) : sortedJobRows.length > 0 ? (
                <CanvasTable<JobRow>
                  theme={th}
                  columns={jobColumns}
                  rows={sortedJobRows}
                />
              ) : (
                <div style={emptyStateStyle}>{copyText(t, "noJobs")}</div>
              )}
            </CanvasCard>

            {selectedJobId && detailLoadingKey === `job:${selectedJobId}` ? (
              <CanvasCard
                theme={th}
                title={copyText(t, "loadingReportDetail")}
                subtitle={selectedJobId}
              >
                <div style={emptyStateStyle}>{copyText(t, "loading")}</div>
              </CanvasCard>
            ) : null}

            {jobDetail ? (
              <div style={twoColumnGridStyle}>
                <CanvasCard
                  theme={th}
                  title={copyText(t, `type.${jobDetail.jobType}`)}
                  subtitle={jobDetail.jobId}
                  actions={
                    <CanvasPill
                      theme={th}
                      tone={reportStatusTone(jobDetail.status)}
                      dot
                    >
                      {formatOpsCodeLabel(locale, jobDetail.status)}
                    </CanvasPill>
                  }
                >
                  {jobDetail.status === "failed" ? (
                    <>
                      <CanvasBanner
                        theme={th}
                        tone="danger"
                        icon="warn"
                        title={copyText(t, "banner.jobFailedTitle")}
                        body={copyText(t, "banner.jobFailedBody")}
                      />
                      <div style={{ height: 14 }} />
                    </>
                  ) : null}

                  {artifactExpired(jobDetail) ? (
                    <>
                      <CanvasBanner
                        theme={th}
                        tone="warn"
                        icon="warn"
                        title={copyText(t, "banner.artifactExpiredTitle")}
                        body={copyText(t, "banner.artifactExpiredBody")}
                      />
                      <div style={{ height: 14 }} />
                    </>
                  ) : null}

                  {jobDetail.artifact &&
                  !artifactExpired(jobDetail) &&
                  expiresSoon(jobDetail.artifact.expiresAt) ? (
                    <>
                      <CanvasBanner
                        theme={th}
                        tone="warn"
                        icon="clock"
                        title={copyText(t, "banner.signedUrlExpiringTitle")}
                        body={copyText(t, "banner.signedUrlExpiringBody")}
                      />
                      <div style={{ height: 14 }} />
                    </>
                  ) : null}

                  {!jobDetail.artifact ? (
                    <>
                      <CanvasBanner
                        theme={th}
                        tone="info"
                        icon="reports"
                        title={copyText(t, "detail.artifactPending")}
                        body={copyText(t, "banner.artifactPendingBody")}
                      />
                      <div style={{ height: 14 }} />
                    </>
                  ) : null}

                  <CanvasDL
                    theme={th}
                    cols={2}
                    items={[
                      {
                        label: copyText(t, "detail.format"),
                        value: jobDetail.format.toUpperCase(),
                        mono: true,
                      },
                      {
                        label: copyText(t, "detail.created"),
                        value: formatDateTime(
                          locale,
                          jobDetail.createdAt,
                          t("common.dash"),
                          "long",
                        ),
                        mono: true,
                      },
                      {
                        label: copyText(t, "detail.updatedLabel"),
                        value: formatDateTime(
                          locale,
                          jobDetail.updatedAt,
                          t("common.dash"),
                          "long",
                        ),
                        mono: true,
                      },
                      {
                        label: copyText(t, "form.periodTag"),
                        value: summarizeJobPeriod(jobDetail.filters, t),
                        mono: true,
                      },
                      {
                        label: copyText(t, "detail.manifest"),
                        value: shortHash(
                          jobDetail.artifact?.manifestHash,
                          t("common.dash"),
                        ),
                        mono: true,
                      },
                      {
                        label: copyText(t, "detail.expires"),
                        value: formatDateTime(
                          locale,
                          jobDetail.artifact?.downloadMetadata.expiresAt ??
                            jobDetail.artifact?.expiresAt,
                          t("common.dash"),
                          "long",
                        ),
                        mono: true,
                      },
                    ]}
                  />

                  <div style={{ ...actionRowStyle, marginTop: 14 }}>
                    <ActionButton
                      descriptor={jobDownloadDescriptor(jobDetail)}
                      locale={locale}
                      busy={pending}
                      label={copyText(t, "detail.openSignedArtifact")}
                      icon="ext"
                      onInvoke={() =>
                        openDownload(artifactDownloadUrl(jobDetail.artifact))
                      }
                    />
                    <ActionButton
                      descriptor={jobRetryDescriptor(jobDetail)}
                      locale={locale}
                      busy={pending}
                      label={copyText(t, "retryJob")}
                      icon="arrow"
                      onInvoke={() => retryReportJob(jobDetail)}
                    />
                  </div>
                </CanvasCard>

                <CanvasCard
                  theme={th}
                  title={copyText(t, "detail.filters")}
                  subtitle={copyText(t, "banner.currentRequestPayload")}
                >
                  {Object.keys(jobDetail.filters).length > 0 ? (
                    <pre style={jsonBlockStyle}>
                      {JSON.stringify(jobDetail.filters, null, 2)}
                    </pre>
                  ) : (
                    <p style={sectionCopyStyle}>
                      {copyText(t, "detail.noFilters")}
                    </p>
                  )}
                </CanvasCard>
              </div>
            ) : null}

            {jobDetail?.rows && jobDetail.rows.length > 0 ? (
              <CanvasCard
                theme={th}
                title={copyText(t, "detail.dispatchRows")}
                padding={0}
              >
                <CanvasTable<DispatchRow>
                  theme={th}
                  columns={[
                    {
                      h: copyText(t, "col.order"),
                      w: 184,
                      r: (row) => (
                        <div style={rowStackStyle}>
                          <span style={rowTitleStyle}>
                            {String(row.orderNo)}
                          </span>
                          <span style={rowMetaStyle}>
                            {String(row.orderId)}
                          </span>
                        </div>
                      ),
                    },
                    {
                      h: copyText(t, "col.call"),
                      k: "callId",
                      w: 140,
                      mono: true,
                    },
                    {
                      h: copyText(t, "col.recording"),
                      k: "recordingId",
                      w: 160,
                      mono: true,
                    },
                    {
                      h: copyText(t, "col.missing"),
                      w: 110,
                      r: (row) => (
                        <CanvasPill
                          theme={th}
                          tone={row.missingRecording ? "warn" : "success"}
                          dot
                        >
                          {row.missingRecording
                            ? t("common.yes")
                            : t("common.no")}
                        </CanvasPill>
                      ),
                    },
                  ]}
                  rows={jobDetail.rows.map((row) => ({ ...row }))}
                />
              </CanvasCard>
            ) : null}

            {jobDetail?.partnerRevenueRows &&
            jobDetail.partnerRevenueRows.length > 0 ? (
              <CanvasCard
                theme={th}
                title={copyText(t, "detail.partnerRevenueRows")}
                padding={0}
              >
                <CanvasTable<PartnerRevenueRow>
                  theme={th}
                  columns={[
                    {
                      h: copyText(t, "col.order"),
                      w: 188,
                      r: (row) => (
                        <div style={rowStackStyle}>
                          <span style={rowTitleStyle}>
                            {String(row.orderNo)}
                          </span>
                          <span style={rowMetaStyle}>
                            {String(row.businessDispatchSubtype)}
                          </span>
                        </div>
                      ),
                    },
                    {
                      h: copyText(t, "col.partner"),
                      w: 180,
                      r: (row) => (
                        <div style={rowStackStyle}>
                          <span style={rowTitleStyle}>
                            {String(row.partnerId)}
                          </span>
                          <span style={rowMetaStyle}>
                            {String(row.partnerEntrySlug)}
                          </span>
                        </div>
                      ),
                    },
                    {
                      h: copyText(t, "col.eligibility"),
                      w: 164,
                      r: (row) => (
                        <div style={rowStackStyle}>
                          <span style={rowTitleStyle}>
                            {row.eligibilityVerificationId
                              ? String(row.eligibilityVerificationId)
                              : t("common.dash")}
                          </span>
                          <span style={rowMetaStyle}>
                            {row.issuerAuthorizationRef
                              ? String(row.issuerAuthorizationRef)
                              : t("common.dash")}
                          </span>
                        </div>
                      ),
                    },
                    {
                      h: copyText(t, "col.benefit"),
                      w: 168,
                      r: (row) => (
                        <div style={rowStackStyle}>
                          <span style={rowTitleStyle}>
                            {row.benefitReference
                              ? String(row.benefitReference)
                              : t("common.dash")}
                          </span>
                          <span style={rowMetaStyle}>
                            {row.partnerProgramId
                              ? String(row.partnerProgramId)
                              : t("common.dash")}
                          </span>
                        </div>
                      ),
                    },
                    {
                      h: copyText(t, "col.amount"),
                      align: "right",
                      mono: true,
                      r: (row) =>
                        `${row.amount.currency} ${(row.amount.amountMinor / 100).toFixed(0)}`,
                    },
                  ]}
                  rows={jobDetail.partnerRevenueRows.map((row) => ({ ...row }))}
                />
              </CanvasCard>
            ) : null}
          </>
        ) : null}

        {activeTab === "packages" ? (
          <>
            <CanvasCard theme={th} padding={0}>
              {loading ? (
                <div style={emptyStateStyle}>
                  {copyText(t, "loadingPackages")}
                </div>
              ) : sortedPackageRows.length > 0 ? (
                <CanvasTable<PackageRow>
                  theme={th}
                  columns={packageColumns}
                  rows={sortedPackageRows}
                />
              ) : (
                <div style={emptyStateStyle}>{copyText(t, "noPackages")}</div>
              )}
            </CanvasCard>

            {selectedPackageId &&
            detailLoadingKey === `package:${selectedPackageId}` ? (
              <CanvasCard
                theme={th}
                title={copyText(t, "loadingPackageDetail")}
                subtitle={selectedPackageId}
              >
                <div style={emptyStateStyle}>{copyText(t, "loading")}</div>
              </CanvasCard>
            ) : null}

            {packageDetail ? (
              <div style={twoColumnGridStyle}>
                <CanvasCard
                  theme={th}
                  title={copyText(t, "packageManifest", {
                    type: formatOpsCodeLabel(locale, packageDetail.packageType),
                  })}
                  subtitle={packageDetail.packageId}
                  actions={
                    <CanvasPill
                      theme={th}
                      tone={filingStatusTone(packageDetail.status)}
                      dot
                    >
                      {formatOpsCodeLabel(locale, packageDetail.status)}
                    </CanvasPill>
                  }
                >
                  {!packageDetail.downloadMetadata ? (
                    <>
                      <CanvasBanner
                      theme={th}
                      tone="info"
                      icon="reports"
                        title={copyText(t, "detail.packagePending")}
                        body={copyText(t, "banner.packagePendingBody")}
                      />
                      <div style={{ height: 14 }} />
                    </>
                  ) : null}

                  <CanvasDL
                    theme={th}
                    cols={2}
                    items={[
                      {
                        label: copyText(t, "detail.generated"),
                        value: formatDateTime(
                          locale,
                          packageDetail.generatedAt,
                          t("common.dash"),
                          "long",
                        ),
                        mono: true,
                      },
                      {
                        label: copyText(t, "detail.checksum"),
                        value: shortHash(
                          packageDetail.manifest?.checksum,
                          t("common.dash"),
                        ),
                        mono: true,
                      },
                      {
                        label: copyText(t, "detail.packageItems", {
                          count: packageDetail.items.length,
                        }),
                        value: String(packageDetail.items.length),
                        mono: true,
                      },
                      {
                        label: copyText(t, "mutability"),
                        value: formatOpsCodeLabel(locale, "immutable"),
                      },
                      {
                        label: copyText(t, "detail.manifest"),
                        value: shortHash(
                          packageDetail.manifestHash,
                          t("common.dash"),
                        ),
                        mono: true,
                      },
                      {
                        label: copyText(t, "detail.status"),
                        value: formatOpsCodeLabel(locale, packageDetail.status),
                      },
                    ]}
                  />

                  {packageDetail.downloadMetadata ? (
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 12,
                        marginTop: 14,
                      }}
                    >
                      <a
                        href={packageDetail.downloadMetadata.zip.downloadUrl}
                        rel="noreferrer"
                        target="_blank"
                        style={actionLinkStyle}
                      >
                        {copyText(t, "detail.openSignedZip")}
                      </a>
                      <a
                        href={packageDetail.downloadMetadata.pdf.downloadUrl}
                        rel="noreferrer"
                        target="_blank"
                        style={mutedLinkStyle}
                      >
                        {copyText(t, "detail.openSignedPdf")}
                      </a>
                    </div>
                  ) : null}
                </CanvasCard>

                <CanvasCard
                  theme={th}
                  title={copyText(t, "detail.signedDownloads")}
                  subtitle={copyText(t, "banner.currentPackageDelivery")}
                >
                  {packageDetail.downloadMetadata ? (
                    <CanvasDL
                      theme={th}
                      cols={1}
                      items={[
                        {
                          label: copyText(t, "detail.zipBundle"),
                          value: formatDateTime(
                            locale,
                            packageDetail.downloadMetadata.zip.expiresAt,
                            t("common.dash"),
                            "long",
                          ),
                          mono: true,
                        },
                        {
                          label: copyText(t, "detail.pdfBundle"),
                          value: formatDateTime(
                            locale,
                            packageDetail.downloadMetadata.pdf.expiresAt,
                            t("common.dash"),
                            "long",
                          ),
                          mono: true,
                        },
                      ]}
                    />
                  ) : (
                    <p style={sectionCopyStyle}>
                      {copyText(t, "detail.packagePending")}
                    </p>
                  )}
                </CanvasCard>
              </div>
            ) : null}

            {packageDetail?.manifest ? (
              <CanvasCard
                theme={th}
                title={copyText(t, "detail.manifestEntries")}
                subtitle={copyText(t, "detail.manifestId", {
                  id: packageDetail.manifest.manifestId,
                })}
                padding={0}
              >
                <CanvasTable<ManifestEntryRow>
                  theme={th}
                  columns={[
                    {
                      h: copyText(t, "col.item"),
                      w: 188,
                      r: (row) => (
                        <div style={rowStackStyle}>
                          <span style={rowTitleStyle}>
                            {formatOpsCodeLabel(locale, String(row.itemType))}
                          </span>
                          <span style={rowMetaStyle}>{String(row.itemId)}</span>
                        </div>
                      ),
                    },
                    {
                      h: copyText(t, "col.artifactCol"),
                      k: "artifactId",
                      w: 190,
                      mono: true,
                    },
                    {
                      h: copyText(t, "col.manifestHash"),
                      mono: true,
                      r: (row) =>
                        shortHash(String(row.manifestHash), t("common.dash")),
                    },
                  ]}
                  rows={packageDetail.manifest.entries.map((row) => ({
                    ...row,
                  }))}
                />
              </CanvasCard>
            ) : null}
          </>
        ) : null}

        {activeTab === "schedules" ? (
          <>
            <CanvasBanner
              theme={th}
              tone="info"
              icon="clock"
              title={copyText(t, "banner.schedulesNotConfigured")}
              body={copyText(t, "banner.schedulesNotConfiguredBody")}
            />

            <div style={kpiGridStyle}>
              <CanvasKPI
                theme={th}
                label={copyText(t, "queuedJobs")}
                value={queuedReports}
                sub={copyText(t, "metrics.running", { count: runningReports })}
              />
              <CanvasKPI
                theme={th}
                label={copyText(t, "artifactsReady")}
                value={readyArtifacts}
                sub={copyText(t, "metrics.expiring", { count: expiringArtifacts })}
              />
              <CanvasKPI
                theme={th}
                label={copyText(t, "packagesGenerated", {
                  count: completedPackages,
                })}
                value={completedPackages}
                sub={copyText(t, "metrics.regulatoryJobs", {
                  count: regulatoryJobs,
                })}
              />
            </div>

            <CanvasCard theme={th} title={copyText(t, "currentReportingPosture")}>
              <CanvasDL
                theme={th}
                cols={2}
                items={[
                  {
                    label: copyText(t, "metrics.reportJobs"),
                    value: String(jobs.length),
                    mono: true,
                  },
                  {
                    label: copyText(t, "metrics.completedJobs"),
                    value: String(completedReports),
                    mono: true,
                  },
                  {
                    label: copyText(t, "metrics.packageTypes"),
                    value: packageTypeSummary,
                  },
                  {
                    label: copyText(t, "metrics.defaultScope"),
                    value: packageScope,
                    mono: true,
                  },
                ]}
              />
            </CanvasCard>
          </>
        ) : null}
      </div>
    </div>
  );
}
