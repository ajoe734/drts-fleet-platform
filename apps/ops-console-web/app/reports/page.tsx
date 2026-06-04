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
  variant: "short" | "long" = "short",
) {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
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

function shortHash(value: string | null | undefined) {
  if (!value) {
    return "—";
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

function summarizeJobPeriod(filters: Record<string, unknown>) {
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
    return `${from ?? "…"} → ${to ?? "…"}`;
  }

  const vehicleId = readFilterString(filters, "vehicleId");
  if (vehicleId) {
    return vehicleId;
  }

  return "—";
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
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  if (!descriptor.disabledReasonCode) {
    return null;
  }
  if (descriptor.disabledReasonCode === "still_running") {
    return t("reports.action.stillRunning");
  }
  if (descriptor.disabledReasonCode === "artifact_missing") {
    return t("reports.action.artifactPending");
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
          title={t("reports.form.createJob")}
          subtitle={t("reports.form.modalSubtitle")}
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
            title={t("reports.backgroundExport")}
            body={t("reports.form.modalSubtitle")}
          />
          <div style={{ height: 14 }} />
          <div style={formGridStyle}>
            <CanvasField
              theme={th}
              label={t("reports.form.type")}
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

            <CanvasField theme={th} label={t("reports.form.format")}>
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
              label={t("reports.form.periodTag")}
              hint={t("reports.form.periodHint")}
            >
              <input
                value={periodLabel}
                onChange={(event) => setPeriodLabel(event.target.value)}
                placeholder={t("reports.form.periodHint")}
                style={nativeMonoInputStyle}
              />
            </CanvasField>

            <CanvasField
              theme={th}
              label={t("reports.form.vehicleId")}
              hint={t("reports.form.vehicleHint")}
            >
              <input
                value={vehicleId}
                onChange={(event) => setVehicleId(event.target.value)}
                placeholder={t("reports.form.vehiclePlaceholder")}
                style={nativeMonoInputStyle}
              />
            </CanvasField>
          </div>

          <div style={formFooterStyle}>
            <div style={formNoteStyle}>{t("reports.form.modalNote")}</div>
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
                {pending ? t("reports.form.submitting") : t("reports.form.createJob")}
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
    label: t(`reports.type.${value}`),
  }));
  const selectedJobCategoryLabel = t(`reports.category.${jobCategory(jobType)}`);
  const selectedJobTypeHint = `${t(`reports.type.${jobType}.desc`)} ${t(
    "reports.categoryLabel",
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
      h: t("reports.col.job"),
      w: 156,
      mono: true,
      r: (row) => (
        <button
          type="button"
          style={rowButtonStyle}
          onClick={() => void inspectReportJob(row.jobId)}
          disabled={detailLoadingKey === `job:${row.jobId}`}
          aria-label={t("reports.inspect")}
        >
          {row.jobId}
        </button>
      ),
    },
    {
      h: t("reports.col.type"),
      w: 220,
      r: (row) => (
        <div style={rowStackStyle}>
          <span style={rowTitleStyle}>{t(`reports.type.${row.jobType}`)}</span>
          <span style={rowMetaStyle}>{t(`reports.category.${jobCategory(row.jobType)}`)}</span>
        </div>
      ),
    },
    {
      h: t("reports.form.periodTag"),
      w: 140,
      mono: true,
      r: (row) => summarizeJobPeriod(row.filters),
    },
    {
      h: t("reports.col.format"),
      w: 90,
      mono: true,
      r: (row) => row.format.toUpperCase(),
    },
    {
      h: t("reports.col.status"),
      w: 132,
      r: (row) => (
        <CanvasPill theme={th} tone={reportStatusTone(row.status)} dot>
          {formatOpsCodeLabel(locale, row.status)}
        </CanvasPill>
      ),
    },
    {
      h: t("reports.detail.expires"),
      w: 132,
      mono: true,
      r: (row) => (
        <div style={rowStackStyle}>
          <span style={rowTitleStyle}>
            {formatDateTime(locale, row.artifact?.expiresAt)}
          </span>
          {artifactExpired(row) ? (
            <span style={{ ...rowMetaStyle, color: th.warn }}>
              {t("reports.banner.artifactExpiredTitle")}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      h: t("reports.col.created"),
      mono: true,
      r: (row) => formatDateTime(locale, row.createdAt),
    },
    {
      h: t("reports.col.actions"),
      w: 260,
      r: (row) => (
        <div style={actionRowStyle}>
          <ActionButton
            descriptor={jobDownloadDescriptor(row)}
            locale={locale}
            busy={pending}
            label={t("reports.download")}
            icon="ext"
            onInvoke={() => void downloadReportJob(row.jobId)}
          />
          <ActionButton
            descriptor={jobRetryDescriptor(row)}
            locale={locale}
            busy={pending}
            label={t("reports.retry")}
            icon="arrow"
            onInvoke={() => retryReportJob(row)}
          />
        </div>
      ),
    },
  ];

  const packageColumns: CanvasTableColumn<PackageRow>[] = [
    {
      h: t("reports.col.package"),
      w: 164,
      mono: true,
      r: (row) => (
        <button
          type="button"
          style={rowButtonStyle}
          onClick={() => void inspectFilingPackage(row.packageId)}
          disabled={detailLoadingKey === `package:${row.packageId}`}
          aria-label={t("reports.inspect")}
        >
          {row.packageId}
        </button>
      ),
    },
    {
      h: t("reports.col.filingType"),
      w: 180,
      r: (row) => formatOpsCodeLabel(locale, row.packageType),
    },
    {
      h: t("reports.col.filingStatus"),
      w: 132,
      r: (row) => (
        <CanvasPill theme={th} tone={filingStatusTone(row.status)} dot>
          {formatOpsCodeLabel(locale, row.status)}
        </CanvasPill>
      ),
    },
    {
      h: t("reports.col.manifest"),
      w: 136,
      mono: true,
      r: (row) => shortHash(row.manifestHash),
    },
    {
      h: t("reports.col.items"),
      w: 90,
      mono: true,
      r: (row) => String(row.items.length),
    },
    {
      h: t("reports.col.generated"),
      w: 132,
      mono: true,
      r: (row) => formatDateTime(locale, row.generatedAt),
    },
    {
      h: t("reports.col.artifacts"),
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
                ZIP
              </a>
            ) : null}
            {row.artifactPdfUrl ? (
              <a
                href={row.artifactPdfUrl}
                rel="noreferrer"
                target="_blank"
                style={mutedLinkStyle}
              >
                PDF
              </a>
            ) : null}
          </div>
        ) : (
          "—"
        ),
    },
  ];

  const tabItems: Array<{ id: ReportsTab; label: string }> = [
    { id: "jobs", label: t("reports.tab.jobs") },
    { id: "packages", label: t("reports.tab.packages") },
    { id: "schedules", label: t("reports.tab.schedules") },
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
      .join(" · ") || "—";

  return (
    <div style={pageStyle}>
      <CanvasPageHeader
        theme={th}
        title={t("reports.title")}
        subtitle={t("reports.header.subtitle")}
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
              {t("reports.form.createJob")}
            </CanvasBtn>
          ) : activeTab === "packages" ? (
            <CanvasBtn
              theme={th}
              variant="primary"
              icon="plus"
              size="sm"
              onClick={() => setShowPackageComposer((value) => !value)}
            >
              {t("reports.form.generatePackage")}
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
            title={t("reports.immutableFiling")}
            subtitle={t("reports.generateFiling")}
            actions={
              <CanvasPill theme={th} tone="accent">
                {t("reports.complianceBundle")}
              </CanvasPill>
            }
          >
            <CanvasBanner
              theme={th}
              tone="accent"
              icon="reports"
              title={t("reports.form.generatePackage")}
              body={t("reports.banner.generatedBundle")}
            />
            <div style={{ height: 14 }} />
            <div style={formGridStyle}>
              <CanvasField theme={th} label={t("reports.form.packageType")}>
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
                label={t("reports.form.filingMonth")}
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
                label={t("reports.form.scopeChannel")}
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
              <div style={formNoteStyle}>{t("reports.banner.packageComposerNote")}</div>
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
                    ? t("reports.form.submitting")
                    : t("reports.form.generatePackage")}
                </CanvasBtn>
              </div>
            </div>
          </CanvasCard>
        ) : null}

        {activeTab === "jobs" ? (
          <>
            <CanvasCard theme={th} padding={0}>
              {loading ? (
                <div style={emptyStateStyle}>{t("reports.loadingJobs")}</div>
              ) : sortedJobRows.length > 0 ? (
                <CanvasTable<JobRow>
                  theme={th}
                  columns={jobColumns}
                  rows={sortedJobRows}
                />
              ) : (
                <div style={emptyStateStyle}>{t("reports.noJobs")}</div>
              )}
            </CanvasCard>

            {selectedJobId && detailLoadingKey === `job:${selectedJobId}` ? (
              <CanvasCard
                theme={th}
                title={t("reports.loadingReportDetail")}
                subtitle={selectedJobId}
              >
                <div style={emptyStateStyle}>{t("reports.loading")}</div>
              </CanvasCard>
            ) : null}

            {jobDetail ? (
              <div style={twoColumnGridStyle}>
                <CanvasCard
                  theme={th}
                  title={t(`reports.type.${jobDetail.jobType}`)}
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
                        title={t("reports.banner.jobFailedTitle")}
                        body={t("reports.banner.jobFailedBody")}
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
                        title={t("reports.banner.artifactExpiredTitle")}
                        body={t("reports.banner.artifactExpiredBody")}
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
                        title={t("reports.banner.signedUrlExpiringTitle")}
                        body={t("reports.banner.signedUrlExpiringBody")}
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
                        title={t("reports.detail.artifactPending")}
                        body={t("reports.banner.artifactPendingBody")}
                      />
                      <div style={{ height: 14 }} />
                    </>
                  ) : null}

                  <CanvasDL
                    theme={th}
                    cols={2}
                    items={[
                      {
                        label: t("reports.detail.format"),
                        value: jobDetail.format.toUpperCase(),
                        mono: true,
                      },
                      {
                        label: t("reports.detail.created"),
                        value: formatDateTime(
                          locale,
                          jobDetail.createdAt,
                          "long",
                        ),
                        mono: true,
                      },
                      {
                        label: t("reports.detail.updatedLabel"),
                        value: formatDateTime(
                          locale,
                          jobDetail.updatedAt,
                          "long",
                        ),
                        mono: true,
                      },
                      {
                        label: t("reports.form.periodTag"),
                        value: summarizeJobPeriod(jobDetail.filters),
                        mono: true,
                      },
                      {
                        label: t("reports.detail.manifest"),
                        value: shortHash(jobDetail.artifact?.manifestHash),
                        mono: true,
                      },
                      {
                        label: t("reports.detail.expires"),
                        value: formatDateTime(
                          locale,
                          jobDetail.artifact?.downloadMetadata.expiresAt ??
                            jobDetail.artifact?.expiresAt,
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
                      label={t("reports.detail.openSignedArtifact")}
                      icon="ext"
                      onInvoke={() =>
                        openDownload(artifactDownloadUrl(jobDetail.artifact))
                      }
                    />
                    <ActionButton
                      descriptor={jobRetryDescriptor(jobDetail)}
                      locale={locale}
                      busy={pending}
                      label={t("reports.retryJob")}
                      icon="arrow"
                      onInvoke={() => retryReportJob(jobDetail)}
                    />
                  </div>
                </CanvasCard>

                <CanvasCard
                  theme={th}
                  title={t("reports.detail.filters")}
                  subtitle={t("reports.banner.currentRequestPayload")}
                >
                  {Object.keys(jobDetail.filters).length > 0 ? (
                    <pre style={jsonBlockStyle}>
                      {JSON.stringify(jobDetail.filters, null, 2)}
                    </pre>
                  ) : (
                    <p style={sectionCopyStyle}>
                      {t("reports.detail.noFilters")}
                    </p>
                  )}
                </CanvasCard>
              </div>
            ) : null}

            {jobDetail?.rows && jobDetail.rows.length > 0 ? (
              <CanvasCard
                theme={th}
                title={t("reports.detail.dispatchRows")}
                padding={0}
              >
                <CanvasTable<DispatchRow>
                  theme={th}
                  columns={[
                    {
                      h: t("reports.col.order"),
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
                      h: t("reports.col.call"),
                      k: "callId",
                      w: 140,
                      mono: true,
                    },
                    {
                      h: t("reports.col.recording"),
                      k: "recordingId",
                      w: 160,
                      mono: true,
                    },
                    {
                      h: t("reports.col.missing"),
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
                title={t("reports.detail.partnerRevenueRows")}
                padding={0}
              >
                <CanvasTable<PartnerRevenueRow>
                  theme={th}
                  columns={[
                    {
                      h: t("reports.col.order"),
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
                      h: t("reports.col.partner"),
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
                      h: t("reports.col.eligibility"),
                      w: 164,
                      r: (row) => (
                        <div style={rowStackStyle}>
                          <span style={rowTitleStyle}>
                            {row.eligibilityVerificationId
                              ? String(row.eligibilityVerificationId)
                              : "—"}
                          </span>
                          <span style={rowMetaStyle}>
                            {row.issuerAuthorizationRef
                              ? String(row.issuerAuthorizationRef)
                              : "—"}
                          </span>
                        </div>
                      ),
                    },
                    {
                      h: t("reports.col.benefit"),
                      w: 168,
                      r: (row) => (
                        <div style={rowStackStyle}>
                          <span style={rowTitleStyle}>
                            {row.benefitReference
                              ? String(row.benefitReference)
                              : "—"}
                          </span>
                          <span style={rowMetaStyle}>
                            {row.partnerProgramId
                              ? String(row.partnerProgramId)
                              : "—"}
                          </span>
                        </div>
                      ),
                    },
                    {
                      h: t("reports.col.amount"),
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
                  {t("reports.loadingPackages")}
                </div>
              ) : sortedPackageRows.length > 0 ? (
                <CanvasTable<PackageRow>
                  theme={th}
                  columns={packageColumns}
                  rows={sortedPackageRows}
                />
              ) : (
                <div style={emptyStateStyle}>{t("reports.noPackages")}</div>
              )}
            </CanvasCard>

            {selectedPackageId &&
            detailLoadingKey === `package:${selectedPackageId}` ? (
              <CanvasCard
                theme={th}
                title={t("reports.loadingPackageDetail")}
                subtitle={selectedPackageId}
              >
                <div style={emptyStateStyle}>{t("reports.loading")}</div>
              </CanvasCard>
            ) : null}

            {packageDetail ? (
              <div style={twoColumnGridStyle}>
                <CanvasCard
                  theme={th}
                  title={t("reports.packageManifest", {
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
                        title={t("reports.detail.packagePending")}
                        body={t("reports.banner.packagePendingBody")}
                      />
                      <div style={{ height: 14 }} />
                    </>
                  ) : null}

                  <CanvasDL
                    theme={th}
                    cols={2}
                    items={[
                      {
                        label: t("reports.detail.generated"),
                        value: formatDateTime(
                          locale,
                          packageDetail.generatedAt,
                          "long",
                        ),
                        mono: true,
                      },
                      {
                        label: t("reports.detail.checksum"),
                        value: shortHash(packageDetail.manifest?.checksum),
                        mono: true,
                      },
                      {
                        label: t("reports.detail.packageItems", {
                          count: packageDetail.items.length,
                        }),
                        value: String(packageDetail.items.length),
                        mono: true,
                      },
                      {
                        label: t("reports.mutability"),
                        value: formatOpsCodeLabel(locale, "immutable"),
                      },
                      {
                        label: t("reports.detail.manifest"),
                        value: shortHash(packageDetail.manifestHash),
                        mono: true,
                      },
                      {
                        label: t("reports.detail.status"),
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
                        {t("reports.detail.openSignedZip")}
                      </a>
                      <a
                        href={packageDetail.downloadMetadata.pdf.downloadUrl}
                        rel="noreferrer"
                        target="_blank"
                        style={mutedLinkStyle}
                      >
                        {t("reports.detail.openSignedPdf")}
                      </a>
                    </div>
                  ) : null}
                </CanvasCard>

                <CanvasCard
                  theme={th}
                  title={t("reports.detail.signedDownloads")}
                  subtitle={t("reports.banner.currentPackageDelivery")}
                >
                  {packageDetail.downloadMetadata ? (
                    <CanvasDL
                      theme={th}
                      cols={1}
                      items={[
                        {
                          label: t("reports.detail.zipBundle"),
                          value: formatDateTime(
                            locale,
                            packageDetail.downloadMetadata.zip.expiresAt,
                            "long",
                          ),
                          mono: true,
                        },
                        {
                          label: t("reports.detail.pdfBundle"),
                          value: formatDateTime(
                            locale,
                            packageDetail.downloadMetadata.pdf.expiresAt,
                            "long",
                          ),
                          mono: true,
                        },
                      ]}
                    />
                  ) : (
                    <p style={sectionCopyStyle}>
                      {t("reports.detail.packagePending")}
                    </p>
                  )}
                </CanvasCard>
              </div>
            ) : null}

            {packageDetail?.manifest ? (
              <CanvasCard
                theme={th}
                title={t("reports.detail.manifestEntries")}
                subtitle={t("reports.detail.manifestId", {
                  id: packageDetail.manifest.manifestId,
                })}
                padding={0}
              >
                <CanvasTable<ManifestEntryRow>
                  theme={th}
                  columns={[
                    {
                      h: t("reports.col.item"),
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
                      h: t("reports.col.artifactCol"),
                      k: "artifactId",
                      w: 190,
                      mono: true,
                    },
                    {
                      h: t("reports.col.manifestHash"),
                      mono: true,
                      r: (row) => shortHash(String(row.manifestHash)),
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
              title={t("reports.banner.schedulesNotConfigured")}
              body={t("reports.banner.schedulesNotConfiguredBody")}
            />

            <div style={kpiGridStyle}>
              <CanvasKPI
                theme={th}
                label={t("reports.queuedJobs")}
                value={queuedReports}
                sub={t("reports.metrics.running", { count: runningReports })}
              />
              <CanvasKPI
                theme={th}
                label={t("reports.artifactsReady")}
                value={readyArtifacts}
                sub={t("reports.metrics.expiring", { count: expiringArtifacts })}
              />
              <CanvasKPI
                theme={th}
                label={t("reports.packagesGenerated", { count: completedPackages })}
                value={completedPackages}
                sub={t("reports.metrics.regulatoryJobs", { count: regulatoryJobs })}
              />
            </div>

            <CanvasCard theme={th} title={t("reports.currentReportingPosture")}>
              <CanvasDL
                theme={th}
                cols={2}
                items={[
                  {
                    label: t("reports.metrics.reportJobs"),
                    value: String(jobs.length),
                    mono: true,
                  },
                  {
                    label: t("reports.metrics.completedJobs"),
                    value: String(completedReports),
                    mono: true,
                  },
                  {
                    label: t("reports.metrics.packageTypes"),
                    value: packageTypeSummary,
                  },
                  {
                    label: t("reports.metrics.defaultScope"),
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
