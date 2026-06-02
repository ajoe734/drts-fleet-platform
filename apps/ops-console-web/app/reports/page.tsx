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

function copyText(locale: "en" | "zh", en: string, zh: string) {
  return locale === "zh" ? zh : en;
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
    ? "Regulatory"
    : "Operational";
}

function expiresSoon(value: string | null | undefined, hours = 12) {
  if (!value) return false;
  const expiresAt = new Date(value).getTime();
  if (Number.isNaN(expiresAt)) return false;
  return expiresAt - Date.now() <= hours * 60 * 60 * 1000;
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
      h: "JOB",
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
      h: "KIND",
      w: 220,
      r: (row) => (
        <div style={rowStackStyle}>
          <span style={rowTitleStyle}>{t(`reports.type.${row.jobType}`)}</span>
          <span style={rowMetaStyle}>
            {t(`reports.category.${jobCategory(row.jobType).toLowerCase()}`)}
          </span>
        </div>
      ),
    },
    {
      h: "PERIOD",
      w: 140,
      mono: true,
      r: (row) => summarizeJobPeriod(row.filters),
    },
    {
      h: "FORMAT",
      w: 90,
      mono: true,
      r: (row) => row.format.toUpperCase(),
    },
    {
      h: "STATUS",
      w: 132,
      r: (row) => (
        <CanvasPill theme={th} tone={reportStatusTone(row.status)} dot>
          {formatOpsCodeLabel(locale, row.status)}
        </CanvasPill>
      ),
    },
    {
      h: "EXPIRES",
      w: 132,
      mono: true,
      r: (row) => formatDateTime(locale, row.artifact?.expiresAt),
    },
    {
      h: "CREATED",
      mono: true,
      r: (row) => formatDateTime(locale, row.createdAt),
    },
  ];

  const packageColumns: CanvasTableColumn<PackageRow>[] = [
    {
      h: "PACKAGE",
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
      h: "TYPE",
      w: 180,
      r: (row) => formatOpsCodeLabel(locale, row.packageType),
    },
    {
      h: "STATUS",
      w: 132,
      r: (row) => (
        <CanvasPill theme={th} tone={filingStatusTone(row.status)} dot>
          {formatOpsCodeLabel(locale, row.status)}
        </CanvasPill>
      ),
    },
    {
      h: "MANIFEST",
      w: 136,
      mono: true,
      r: (row) => shortHash(row.manifestHash),
    },
    {
      h: "ITEMS",
      w: 90,
      mono: true,
      r: (row) => String(row.items.length),
    },
    {
      h: "GENERATED",
      w: 132,
      mono: true,
      r: (row) => formatDateTime(locale, row.generatedAt),
    },
    {
      h: "ARTIFACTS",
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
    { id: "jobs", label: "Report jobs" },
    { id: "packages", label: "Filing packages" },
    { id: "schedules", label: "Schedules" },
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
        subtitle={copyText(
          locale,
          "report jobs · filing packages · signed artifact short-lived URLs",
          "report jobs · filing packages · signed artifact 短效 URL",
        )}
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
          <CanvasCard
            theme={th}
            title={t("reports.backgroundExport")}
            subtitle={t("reports.createReportEyebrow")}
            actions={
              <CanvasPill theme={th} tone="info">
                {t(`reports.category.${jobCategory(jobType).toLowerCase()}`)}
              </CanvasPill>
            }
          >
            <CanvasBanner
              theme={th}
              tone="info"
              icon="reports"
              title={t("reports.form.createJob")}
              body={copyText(
                locale,
                "Jobs run in the background and expose signed artifact downloads after completion.",
                "工作會在背景執行，完成後提供簽名產物下載。",
              )}
            />
            <div style={{ height: 14 }} />
            <div style={formGridStyle}>
              <CanvasField
                theme={th}
                label={t("reports.form.type")}
                hint={`${t(`reports.type.${jobType}.desc`)} ${t(
                  "reports.categoryLabel",
                  {
                    value: t(
                      `reports.category.${jobCategory(jobType).toLowerCase()}`,
                    ),
                  },
                )}`}
              >
                <select
                  value={jobType}
                  onChange={(event) =>
                    setJobType(event.target.value as ReportJobType)
                  }
                  style={nativeSelectStyle}
                >
                  {REPORT_JOB_TYPES.map((value) => (
                    <option key={value} value={value}>
                      {t(`reports.type.${value}`)}
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
                hint={getOpsLabel(locale, "reportsPeriodExample")}
              >
                <input
                  value={periodLabel}
                  onChange={(event) => setPeriodLabel(event.target.value)}
                  placeholder={getOpsLabel(locale, "reportsPeriodExample")}
                  style={nativeMonoInputStyle}
                />
              </CanvasField>

              <CanvasField
                theme={th}
                label={t("reports.form.vehicleId")}
                hint={copyText(
                  locale,
                  "Optional filter for vehicle-scoped output.",
                  "可選，用於限定單一車輛的輸出。",
                )}
              >
                <input
                  value={vehicleId}
                  onChange={(event) => setVehicleId(event.target.value)}
                  placeholder={t("reports.form.vehicleId")}
                  style={nativeMonoInputStyle}
                />
              </CanvasField>
            </div>

            <div style={formFooterStyle}>
              <div style={formNoteStyle}>
                {copyText(
                  locale,
                  "Existing report-job contract and i18n keys are preserved; this only changes the surface layout.",
                  "保留既有 report-job contract 與 i18n key；這次僅調整畫面結構。",
                )}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <CanvasBtn
                  theme={th}
                  size="sm"
                  onClick={() => setShowJobComposer(false)}
                  disabled={pending}
                >
                  {copyText(locale, "Cancel", "取消")}
                </CanvasBtn>
                <CanvasBtn
                  theme={th}
                  variant="primary"
                  icon="plus"
                  size="sm"
                  onClick={submitReportJob}
                  disabled={pending}
                >
                  {pending
                    ? t("reports.form.submitting")
                    : t("reports.form.createJob")}
                </CanvasBtn>
              </div>
            </div>
          </CanvasCard>
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
              body={copyText(
                locale,
                "Generated filing bundles stay immutable and surface short-lived signed ZIP/PDF downloads.",
                "產生後的申報包保持不可變，並以短時效 ZIP / PDF 簽名下載提供。",
              )}
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
              <div style={formNoteStyle}>
                {copyText(
                  locale,
                  "Filing package generation still uses the same backend flow; only the visual treatment changed.",
                  "申報包生成仍走相同 backend 流程；變更僅限畫面呈現。",
                )}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <CanvasBtn
                  theme={th}
                  size="sm"
                  onClick={() => setShowPackageComposer(false)}
                  disabled={pending}
                >
                  {copyText(locale, "Cancel", "取消")}
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
                        title={copyText(
                          locale,
                          "Report job failed",
                          "報表工作失敗",
                        )}
                        body={copyText(
                          locale,
                          "Inspect inputs and re-run the export if an updated artifact is still required.",
                          "請檢查輸入條件，若仍需最新產物請重新執行。",
                        )}
                      />
                      <div style={{ height: 14 }} />
                    </>
                  ) : null}

                  {jobDetail.artifact &&
                  expiresSoon(jobDetail.artifact.expiresAt) ? (
                    <>
                      <CanvasBanner
                        theme={th}
                        tone="warn"
                        icon="clock"
                        title={copyText(
                          locale,
                          "Signed URL expiring soon",
                          "簽名網址即將過期",
                        )}
                        body={copyText(
                          locale,
                          "Download or refresh the artifact before handoff to downstream operators.",
                          "交付下游人員前，請先下載或重新整理產物連結。",
                        )}
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
                        body={copyText(
                          locale,
                          "This job is still waiting for a signed artifact payload.",
                          "此工作仍在等待簽名產物可供下載。",
                        )}
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
                        label: copyText(locale, "Updated", "更新"),
                        value: formatDateTime(
                          locale,
                          jobDetail.updatedAt,
                          "long",
                        ),
                        mono: true,
                      },
                      {
                        label: copyText(locale, "Period", "期別"),
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

                  {jobDetail.artifact ? (
                    <div style={{ marginTop: 14 }}>
                      <a
                        href={jobDetail.artifact.downloadMetadata.downloadUrl}
                        rel="noreferrer"
                        target="_blank"
                        style={actionLinkStyle}
                      >
                        {t("reports.detail.openSignedArtifact")}
                      </a>
                    </div>
                  ) : null}
                </CanvasCard>

                <CanvasCard
                  theme={th}
                  title={t("reports.detail.filters")}
                  subtitle={copyText(
                    locale,
                    "Current request payload",
                    "本次請求 payload",
                  )}
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
                        body={copyText(
                          locale,
                          "Signed ZIP/PDF package artifacts are not ready yet.",
                          "ZIP / PDF 簽名申報包尚未完成。",
                        )}
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
                        label: copyText(locale, "Mutability", "可變性"),
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
                  subtitle={copyText(
                    locale,
                    "Current package delivery posture",
                    "目前申報包交付狀態",
                  )}
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
              title={copyText(
                locale,
                "Schedules are not configured yet",
                "目前尚未設定排程",
              )}
              body={copyText(
                locale,
                "This handoff keeps report jobs and filing packages intact; automated scheduling remains a follow-up workflow.",
                "本次 handoff 保留 report job 與 filing package 流程；自動排程仍屬後續工作。",
              )}
            />

            <div style={kpiGridStyle}>
              <CanvasKPI
                theme={th}
                label={copyText(locale, "Queued jobs", "排隊中工作")}
                value={queuedReports}
                sub={copyText(
                  locale,
                  `${runningReports} running`,
                  `${runningReports} 筆執行中`,
                )}
              />
              <CanvasKPI
                theme={th}
                label={copyText(locale, "Ready artifacts", "可下載產物")}
                value={readyArtifacts}
                sub={copyText(
                  locale,
                  `${expiringArtifacts} expiring`,
                  `${expiringArtifacts} 筆即將過期`,
                )}
              />
              <CanvasKPI
                theme={th}
                label={copyText(locale, "Completed packages", "已完成申報包")}
                value={completedPackages}
                sub={copyText(
                  locale,
                  `${regulatoryJobs} regulatory jobs`,
                  `${regulatoryJobs} 筆監管類工作`,
                )}
              />
            </div>

            <CanvasCard
              theme={th}
              title={copyText(
                locale,
                "Current reporting posture",
                "目前報表狀態",
              )}
            >
              <CanvasDL
                theme={th}
                cols={2}
                items={[
                  {
                    label: copyText(locale, "Report jobs", "報表工作"),
                    value: String(jobs.length),
                    mono: true,
                  },
                  {
                    label: copyText(locale, "Completed jobs", "已完成工作"),
                    value: String(completedReports),
                    mono: true,
                  },
                  {
                    label: copyText(locale, "Package types", "申報包類型"),
                    value: packageTypeSummary,
                  },
                  {
                    label: copyText(locale, "Default scope", "預設 scope"),
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
