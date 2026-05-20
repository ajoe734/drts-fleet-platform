"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState, useTransition } from "react";
import type {
  CreateReportJobCommand,
  FilingPackageDetailRecord,
  FilingPackageListRecord,
  FilingPackageType,
  ReportJobDetailRecord,
  ReportJobRecord,
  ReportJobType,
  ReportOutputFormat,
} from "@drts/contracts";
import {
  FILING_PACKAGE_TYPES,
  REGULATORY_REPORT_JOB_TYPES,
  REPORT_JOB_TYPES,
  REPORT_OUTPUT_FORMATS,
} from "@drts/contracts";
import { getOpsClient } from "@/lib/api-client";
import { useTranslation } from "@/lib/i18n";
import type { Locale } from "@/lib/translations";
import { t as translate } from "@/lib/translations";
import { formatOpsCodeLabel, getOpsLabel } from "@/lib/localized-labels";
import {
  CanvasBanner as Banner,
  CanvasBtn as Btn,
  CanvasCard as Card,
  CanvasDL as DL,
  CanvasField as Field,
  CanvasKPI as KPI,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasShell as Shell,
  CanvasTable as Table,
  buildCanvasTheme,
  type CanvasShellNavItem,
  type CanvasTableColumn,
} from "@drts/ui-web";

type TabKey = "report_jobs" | "filing_packages" | "schedules";
type CanvasTone = "accent" | "danger" | "info" | "neutral" | "success" | "warn";

type JobPresetMetadata = {
  label: string;
  description: string;
};

type JobPreset = {
  value: ReportJobType;
  label: string;
  description: string;
  category: "Regulatory" | "Operational";
};

type JobTableRow = Record<string, unknown> & {
  jobId: string;
  kind: string;
  period: string;
  format: string;
  status: string;
  expires: string;
  created: string;
  _selected?: boolean;
};

type PackageTableRow = Record<string, unknown> & {
  packageId: string;
  kind: string;
  status: string;
  manifest: string;
  items: string;
  generated: string;
  artifacts: string;
  _selected?: boolean;
};

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const REGULATORY_JOB_TYPE_SET = new Set<ReportJobType>(
  REGULATORY_REPORT_JOB_TYPES,
);

const JOB_PRESET_METADATA: Record<ReportJobType, JobPresetMetadata> = {
  trip_summary: {
    label: "Trip summary",
    description: "Operational trip output for day-to-day service review.",
  },
  monthly_trip_report: {
    label: "Monthly trip report",
    description: "Month-end trip volume and service mix export.",
  },
  revenue_summary: {
    label: "Revenue summary",
    description: "Revenue, average trip, and payout-friendly export.",
  },
  incident_register: {
    label: "Incident register",
    description: "Operational incident summary for ROC review.",
  },
  maintenance_overview: {
    label: "Maintenance overview",
    description: "Vehicle maintenance backlog and completion export.",
  },
  vehicle_roster: {
    label: "Vehicle roster",
    description: "Regulatory vehicle roster with placard/version traceability.",
  },
  driver_roster: {
    label: "Driver roster",
    description: "Driver registry export for compliance submission.",
  },
  contract_roster: {
    label: "Contract roster",
    description: "Partner and dispatch contract filing extract.",
  },
  insurance_roster: {
    label: "Insurance roster",
    description: "Insurance evidence package for regulatory review.",
  },
  vehicle_monthly_delta: {
    label: "Vehicle monthly delta",
    description: "Month-over-month vehicle registry changes for filing.",
  },
  six_month_statistics: {
    label: "Six-month statistics",
    description: "Six-month compliance metrics bundle for regulators.",
  },
  fare_version_history: {
    label: "Fare version history",
    description: "Published fare and public-info version audit export.",
  },
  complaint_case_detail: {
    label: "Complaint case detail",
    description: "Detailed complaint case export for specialist review.",
  },
  dispatch_recording_index: {
    label: "Dispatch trace",
    description: "Dispatch and recording index export for audit follow-up.",
  },
};

const JOB_PRESETS: JobPreset[] = REPORT_JOB_TYPES.map(
  (value: ReportJobType) => ({
    value,
    ...JOB_PRESET_METADATA[value],
    category: REGULATORY_JOB_TYPE_SET.has(value) ? "Regulatory" : "Operational",
  }),
);

const pageStackStyle = {
  padding: 24,
  display: "flex",
  flexDirection: "column" as const,
  gap: 16,
};

const kpiGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const controlRowStyle = {
  display: "flex",
  flexWrap: "wrap" as const,
  gap: 8,
};

const splitGridStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.45fr) minmax(320px, 0.9fr)",
  gap: 16,
};

const panelGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const formGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
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

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  return new Date(value).toLocaleString();
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

function copyText(locale: Locale, en: string, zh: string) {
  return locale === "zh" ? zh : en;
}

function statusTone(status: string): CanvasTone {
  if (["completed", "ready", "immutable", "valid"].includes(status)) {
    return "success";
  }
  if (["failed", "error", "expired"].includes(status)) {
    return "danger";
  }
  if (["running", "processing", "active"].includes(status)) {
    return "info";
  }
  if (["queued", "pending", "mutable"].includes(status)) {
    return "warn";
  }
  return "neutral";
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
      label: translate("nav.dashboard", locale),
    },
    {
      divider: locale === "en" ? "Live Ops" : "即時派遣",
    },
    {
      key: "dispatch",
      href: "/dispatch",
      icon: "dispatch",
      label: translate("nav.dispatch", locale),
      matchPaths: ["/dispatch"],
    },
    {
      key: "callcenter",
      href: "/callcenter",
      icon: "callcenter",
      label: translate("nav.callcenter", locale),
    },
    {
      divider: locale === "en" ? "Casework" : "案件處理",
    },
    {
      key: "complaints",
      href: "/complaints",
      icon: "complaints",
      label: translate("nav.complaints", locale),
    },
    {
      key: "incidents",
      href: "/incidents",
      icon: "incidents",
      label: translate("nav.incidents", locale),
      matchPaths: ["/incidents"],
    },
    {
      divider: locale === "en" ? "Monitoring" : "營運監控",
    },
    {
      key: "reports",
      href: "/reports",
      icon: "reports",
      label: translate("nav.reports", locale),
    },
    {
      key: "revenue",
      href: "/revenue",
      icon: "revenue",
      label: translate("nav.revenue", locale),
    },
    {
      key: "attendance",
      href: "/attendance",
      icon: "attendance",
      label: translate("nav.attendance", locale),
    },
    {
      divider: locale === "en" ? "Registry" : "主資料",
    },
    {
      key: "drivers",
      href: "/drivers",
      icon: "fleet",
      label: translate("nav.drivers", locale),
    },
    {
      key: "vehicles",
      href: "/vehicles",
      icon: "vehicles",
      label: translate("nav.vehicles", locale),
    },
    {
      key: "contracts",
      href: "/contracts",
      icon: "contracts",
      label: translate("nav.contracts", locale),
    },
    {
      key: "feature-flags",
      href: "/feature-flags",
      icon: "flags",
      label: translate("nav.featureFlags", locale),
    },
  ];
}

export default function ReportsPage() {
  const { t, locale } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabKey>("report_jobs");
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
    setDetailLoadingKey(`job:${jobId}`);
    setError(null);
    try {
      const detail = await getOpsClient().getReportJob(jobId);
      setSelectedJobId(jobId);
      setJobDetail(detail);
      setActiveTab("report_jobs");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.unknown"));
    } finally {
      setDetailLoadingKey(null);
    }
  }

  async function inspectFilingPackage(packageId: string) {
    setDetailLoadingKey(`package:${packageId}`);
    setError(null);
    try {
      const detail = await getOpsClient().getFilingPackage(packageId);
      setSelectedPackageId(packageId);
      setPackageDetail(detail);
      setActiveTab("filing_packages");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.unknown"));
    } finally {
      setDetailLoadingKey(null);
    }
  }

  function handleReportSubmit(event: React.FormEvent) {
    event.preventDefault();
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
          await loadData();
          await inspectReportJob(accepted.jobId);
        } catch (e) {
          setError(e instanceof Error ? e.message : t("common.unknown"));
        }
      })();
    });
  }

  function handlePackageSubmit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(() => {
      void (async () => {
        try {
          const client = getOpsClient();
          const accepted = await client.generateFilingPackage({
            packageType,
            period: packageMonth.trim() ? { month: packageMonth.trim() } : {},
            scope: packageScope.trim() ? { channel: packageScope.trim() } : {},
          });
          await loadData();
          await inspectFilingPackage(accepted.packageId);
        } catch (e) {
          setError(e instanceof Error ? e.message : t("common.unknown"));
        }
      })();
    });
  }

  const queuedReports = jobs.filter((job) => job.status === "queued").length;
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
  const activePresetCategory = jobCategory(jobType);
  const activePreset = JOB_PRESET_METADATA[jobType];

  const tabs = ["Report jobs", "Filing packages", "Schedules"];
  const activeHeaderTab =
    activeTab === "report_jobs"
      ? tabs[0]
      : activeTab === "filing_packages"
        ? tabs[1]
        : tabs[2];

  const jobRows = useMemo<JobTableRow[]>(
    () =>
      jobs.map((job) => ({
        jobId: job.jobId,
        kind: t(`reports.type.${job.jobType}`),
        period:
          typeof job.filters.period === "string"
            ? job.filters.period
            : t("reports.detail.noFiltersShort"),
        format: job.format,
        status: formatOpsCodeLabel(locale, job.status),
        expires: job.artifact?.expiresAt
          ? formatDateTime(job.artifact.expiresAt)
          : "—",
        created: formatDateTime(job.createdAt),
        _selected: selectedJobId === job.jobId,
      })),
    [jobs, locale, selectedJobId, t],
  );

  const packageRows = useMemo<PackageTableRow[]>(
    () =>
      packages.map((pkg) => ({
        packageId: pkg.packageId,
        kind: formatOpsCodeLabel(locale, pkg.packageType),
        status: formatOpsCodeLabel(locale, pkg.status),
        manifest: pkg.manifestHash ? shortHash(pkg.manifestHash) : "—",
        items: String(pkg.items.length),
        generated: formatDateTime(pkg.generatedAt),
        artifacts:
          pkg.artifactZipUrl || pkg.artifactPdfUrl
            ? [
                pkg.artifactZipUrl ? "ZIP" : null,
                pkg.artifactPdfUrl ? "PDF" : null,
              ]
                .filter(Boolean)
                .join(" · ")
            : "—",
        _selected: selectedPackageId === pkg.packageId,
      })),
    [locale, packages, selectedPackageId],
  );

  const jobColumns: CanvasTableColumn<JobTableRow>[] = [
    {
      h: "JOB",
      w: 132,
      mono: true,
      r: (row, index) => {
        const job = jobs[index];
        return (
          <button
            type="button"
            onClick={() => void inspectReportJob(row.jobId)}
            style={linkButtonStyle}
          >
            <span style={{ fontWeight: 700 }}>{row.jobId}</span>
            <span style={subCopyStyle}>{t(`reports.type.${job.jobType}`)}</span>
          </button>
        );
      },
    },
    { h: "KIND", k: "kind", w: 210 },
    { h: "PERIOD", k: "period", w: 130, mono: true },
    { h: "FORMAT", k: "format", w: 90, mono: true },
    {
      h: "STATUS",
      w: 120,
      r: (_row, index) => (
        <Pill
          theme={theme}
          tone={statusTone(jobs[index]?.status ?? "pending")}
          dot
        >
          {formatOpsCodeLabel(locale, jobs[index]?.status ?? "pending")}
        </Pill>
      ),
    },
    { h: "EXPIRES", k: "expires", w: 150, mono: true },
    { h: "CREATED", k: "created", mono: true },
  ];

  const packageColumns: CanvasTableColumn<PackageTableRow>[] = [
    {
      h: "PACKAGE",
      w: 132,
      mono: true,
      r: (row) => (
        <button
          type="button"
          onClick={() => void inspectFilingPackage(row.packageId)}
          style={linkButtonStyle}
        >
          <span style={{ fontWeight: 700 }}>{row.packageId}</span>
          <span style={subCopyStyle}>{row.kind}</span>
        </button>
      ),
    },
    { h: "KIND", k: "kind", w: 180 },
    {
      h: "STATUS",
      w: 120,
      r: (_row, index) => (
        <Pill
          theme={theme}
          tone={statusTone(packages[index]?.status ?? "pending")}
          dot
        >
          {formatOpsCodeLabel(locale, packages[index]?.status ?? "pending")}
        </Pill>
      ),
    },
    { h: "MANIFEST", k: "manifest", w: 120, mono: true },
    { h: "ITEMS", k: "items", w: 80, mono: true, align: "right" },
    { h: "GENERATED", k: "generated", w: 180, mono: true },
    { h: "ARTIFACTS", k: "artifacts", w: 110, mono: true },
  ];

  const currentJob = selectedJobId
    ? (jobs.find((job) => job.jobId === selectedJobId) ?? null)
    : null;
  const currentPackage = selectedPackageId
    ? (packages.find((pkg) => pkg.packageId === selectedPackageId) ?? null)
    : null;

  return (
    <Shell
      theme={theme}
      nav={buildShellNav(locale)}
      active="reports"
      breadcrumb={[copyText(locale, "Reports", "報表")]}
    >
      <PageHeader
        theme={theme}
        title={copyText(locale, "Reports", "報表")}
        subtitle="report jobs · filing packages · signed artifact 短效 URL"
        tabs={tabs}
        activeTab={activeHeaderTab}
        actions={
          <>
            <Btn theme={theme} icon="reports" onClick={() => void loadData()}>
              {t("common.refresh")}
            </Btn>
            <Btn
              theme={theme}
              variant="primary"
              icon="plus"
              onClick={() =>
                setActiveTab(
                  activeTab === "filing_packages"
                    ? "filing_packages"
                    : "report_jobs",
                )
              }
            >
              {activeTab === "filing_packages"
                ? t("reports.generateFiling")
                : t("reports.form.createJob")}
            </Btn>
          </>
        }
      />
      <div style={pageStackStyle}>
        {error ? (
          <Banner
            theme={theme}
            tone="danger"
            icon="warn"
            title={copyText(locale, "Report center error", "報表中心錯誤")}
            body={error}
          />
        ) : null}

        {expiringArtifacts > 0 ? (
          <Banner
            theme={theme}
            tone="info"
            icon="reports"
            title={copyText(
              locale,
              "Signed artifact URLs need attention",
              "簽名產物網址需要留意",
            )}
            body={copyText(
              locale,
              `${expiringArtifacts} artifact URL(s) expire within 12 hours.`,
              `${expiringArtifacts} 個產物網址將在 12 小時內到期。`,
            )}
          />
        ) : null}

        <div style={kpiGridStyle}>
          <KPI
            theme={theme}
            label={t("reports.queuedJobs")}
            value={queuedReports}
            sub={t("reports.queuedJobsSub")}
          />
          <KPI
            theme={theme}
            label={t("reports.completedReports")}
            value={completedReports}
            sub={t("reports.completedReportsSub")}
          />
          <KPI
            theme={theme}
            label={t("reports.regulatoryJobs")}
            value={regulatoryJobs}
            sub={t("reports.regulatoryJobsSub")}
          />
          <KPI
            theme={theme}
            label={t("reports.artifactsReady")}
            value={readyArtifacts + completedPackages}
            sub={t("reports.artifactsReadySub")}
          />
        </div>

        <div style={controlRowStyle}>
          {[
            {
              key: "report_jobs" as const,
              label: `Report jobs ${jobs.length}`,
            },
            {
              key: "filing_packages" as const,
              label: `Filing packages ${packages.length}`,
            },
            {
              key: "schedules" as const,
              label: copyText(locale, "Schedules", "排程"),
            },
          ].map((tab) => (
            <Btn
              key={tab.key}
              theme={theme}
              variant={activeTab === tab.key ? "primary" : "secondary"}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </Btn>
          ))}
        </div>

        {activeTab === "report_jobs" ? (
          <div style={splitGridStyle}>
            <Card
              theme={theme}
              padding={0}
              title={copyText(locale, "Recent jobs", "近期工作")}
              subtitle={t("reports.totalJobs", { count: jobs.length })}
            >
              {loading ? (
                <div style={emptyStateStyle}>{t("reports.loadingJobs")}</div>
              ) : jobs.length > 0 ? (
                <Table theme={theme} columns={jobColumns} rows={jobRows} />
              ) : (
                <div style={emptyStateStyle}>{t("reports.noJobs")}</div>
              )}
            </Card>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Card
                theme={theme}
                title={t("reports.createReportEyebrow")}
                subtitle={t("reports.backgroundExport")}
                actions={
                  <Pill theme={theme} tone="accent">
                    {t(
                      `reports.category.${activePresetCategory.toLowerCase()}`,
                    )}
                  </Pill>
                }
              >
                <form onSubmit={handleReportSubmit}>
                  <div style={formGridStyle}>
                    <Field
                      theme={theme}
                      label={t("reports.form.type")}
                      hint={`${t(`reports.type.${jobType}.desc`)} ${t(
                        "reports.categoryLabel",
                        {
                          value: t(
                            `reports.category.${activePresetCategory.toLowerCase()}`,
                          ),
                        },
                      )}`}
                    >
                      <select
                        value={jobType}
                        onChange={(event) =>
                          setJobType(event.target.value as ReportJobType)
                        }
                        style={inputStyle}
                      >
                        {JOB_PRESETS.map((preset: JobPreset) => (
                          <option key={preset.value} value={preset.value}>
                            {t(`reports.type.${preset.value}`)}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field theme={theme} label={t("reports.form.format")}>
                      <select
                        value={format}
                        onChange={(event) =>
                          setFormat(event.target.value as ReportOutputFormat)
                        }
                        style={inputStyle}
                      >
                        {REPORT_OUTPUT_FORMATS.map(
                          (value: ReportOutputFormat) => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ),
                        )}
                      </select>
                    </Field>
                    <Field theme={theme} label={t("reports.form.periodTag")}>
                      <input
                        value={periodLabel}
                        onChange={(event) => setPeriodLabel(event.target.value)}
                        placeholder={getOpsLabel(
                          locale,
                          "reportsPeriodExample",
                        )}
                        style={inputStyle}
                      />
                    </Field>
                    <Field theme={theme} label={t("reports.form.vehicleId")}>
                      <input
                        value={vehicleId}
                        onChange={(event) => setVehicleId(event.target.value)}
                        placeholder={t("reports.form.vehicleId")}
                        style={inputStyle}
                      />
                    </Field>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
                    <button
                      type="submit"
                      style={primaryButtonStyle}
                      disabled={pending}
                    >
                      {pending
                        ? t("reports.form.submitting")
                        : t("reports.form.createJob")}
                    </button>
                  </div>
                </form>
              </Card>

              <Card
                theme={theme}
                title={t("reports.reportDetailEyebrow")}
                subtitle={
                  currentJob
                    ? t(`reports.type.${currentJob.jobType}`)
                    : t("reports.selectReportJob")
                }
              >
                {selectedJobId &&
                detailLoadingKey === `job:${selectedJobId}` ? (
                  <div style={emptyStateStyle}>
                    {t("reports.loadingReportDetail")}
                  </div>
                ) : jobDetail ? (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 14,
                    }}
                  >
                    <DL
                      theme={theme}
                      cols={2}
                      items={[
                        {
                          label: t("reports.detail.status"),
                          value: (
                            <Pill
                              theme={theme}
                              tone={statusTone(jobDetail.status)}
                              dot
                            >
                              {formatOpsCodeLabel(locale, jobDetail.status)}
                            </Pill>
                          ),
                        },
                        {
                          label: t("reports.detail.format"),
                          value: jobDetail.format,
                          mono: true,
                        },
                        {
                          label: t("reports.detail.created"),
                          value: formatDateTime(jobDetail.createdAt),
                          mono: true,
                        },
                        {
                          label: t("reports.detail.updated", {
                            value: "",
                          })
                            .replace(": ", "")
                            .trim(),
                          value: formatDateTime(jobDetail.updatedAt),
                          mono: true,
                        },
                      ]}
                    />
                    <div>
                      <div style={detailHeadingStyle}>
                        {t("reports.detail.filters")}
                      </div>
                      <pre style={jsonBlockStyle}>
                        {Object.keys(jobDetail.filters).length > 0
                          ? JSON.stringify(jobDetail.filters, null, 2)
                          : t("reports.detail.noFilters")}
                      </pre>
                    </div>
                    <div>
                      <div style={detailHeadingStyle}>
                        {t("reports.detail.signedArtifact")}
                      </div>
                      {jobDetail.artifact ? (
                        <div style={panelGridStyle}>
                          <InfoPanel
                            label={t("reports.detail.manifest")}
                            value={shortHash(jobDetail.artifact.manifestHash)}
                            sub={jobDetail.artifact.downloadMetadata.keyId}
                          />
                          <InfoPanel
                            label={t("reports.detail.expires")}
                            value={formatDateTime(
                              jobDetail.artifact.downloadMetadata.expiresAt,
                            )}
                            sub={t("reports.detail.backendSignedUrl")}
                          />
                          <InfoPanel
                            label={t("reports.download")}
                            value={
                              <a
                                href={
                                  jobDetail.artifact.downloadMetadata
                                    .downloadUrl
                                }
                                target="_blank"
                                rel="noreferrer"
                                style={anchorStyle}
                              >
                                {t("reports.detail.openSignedArtifact")}
                              </a>
                            }
                            sub={formatOpsCodeLabel(
                              locale,
                              jobDetail.artifact.artifactType,
                            )}
                          />
                        </div>
                      ) : (
                        <div style={emptyStateStyle}>
                          {t("reports.detail.artifactPending")}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div style={emptyStateStyle}>
                    {t("reports.detail.selectReportDetail")}
                  </div>
                )}
              </Card>
            </div>
          </div>
        ) : null}

        {activeTab === "filing_packages" ? (
          <div style={splitGridStyle}>
            <Card
              theme={theme}
              padding={0}
              title={t("reports.packageHistory")}
              subtitle={t("reports.packagesGenerated", {
                count: packages.length,
              })}
            >
              {loading ? (
                <div style={emptyStateStyle}>
                  {t("reports.loadingPackages")}
                </div>
              ) : packages.length > 0 ? (
                <Table
                  theme={theme}
                  columns={packageColumns}
                  rows={packageRows}
                />
              ) : (
                <div style={emptyStateStyle}>{t("reports.noPackages")}</div>
              )}
            </Card>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Card
                theme={theme}
                title={t("reports.generateFiling")}
                subtitle={t("reports.immutableFiling")}
                actions={
                  <Pill theme={theme} tone="accent">
                    {t("reports.complianceBundle")}
                  </Pill>
                }
              >
                <form onSubmit={handlePackageSubmit}>
                  <div style={formGridStyle}>
                    <Field theme={theme} label={t("reports.form.packageType")}>
                      <select
                        value={packageType}
                        onChange={(event) =>
                          setPackageType(
                            event.target.value as FilingPackageType,
                          )
                        }
                        style={inputStyle}
                      >
                        {FILING_PACKAGE_TYPES.map(
                          (value: FilingPackageType) => (
                            <option key={value} value={value}>
                              {formatOpsCodeLabel(locale, value)}
                            </option>
                          ),
                        )}
                      </select>
                    </Field>
                    <Field theme={theme} label={t("reports.form.filingMonth")}>
                      <input
                        value={packageMonth}
                        onChange={(event) =>
                          setPackageMonth(event.target.value)
                        }
                        placeholder={getOpsLabel(
                          locale,
                          "reportsClosedMonthExample",
                        )}
                        style={inputStyle}
                      />
                    </Field>
                    <Field theme={theme} label={t("reports.form.scopeChannel")}>
                      <input
                        value={packageScope}
                        onChange={(event) =>
                          setPackageScope(event.target.value)
                        }
                        placeholder={getOpsLabel(
                          locale,
                          "reportsRequestedByExample",
                        )}
                        style={inputStyle}
                      />
                    </Field>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
                    <button
                      type="submit"
                      style={primaryButtonStyle}
                      disabled={pending}
                    >
                      {pending
                        ? t("reports.form.submitting")
                        : t("reports.form.generatePackage")}
                    </button>
                  </div>
                </form>
              </Card>

              <Card
                theme={theme}
                title={t("reports.packageDetailEyebrow")}
                subtitle={
                  currentPackage
                    ? t("reports.packageManifest", {
                        type: formatOpsCodeLabel(
                          locale,
                          currentPackage.packageType,
                        ),
                      })
                    : t("reports.selectFilingPackage")
                }
              >
                {selectedPackageId &&
                detailLoadingKey === `package:${selectedPackageId}` ? (
                  <div style={emptyStateStyle}>
                    {t("reports.loadingPackageDetail")}
                  </div>
                ) : packageDetail ? (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 14,
                    }}
                  >
                    <DL
                      theme={theme}
                      cols={2}
                      items={[
                        {
                          label: t("reports.detail.status"),
                          value: (
                            <Pill
                              theme={theme}
                              tone={statusTone(packageDetail.status)}
                              dot
                            >
                              {formatOpsCodeLabel(locale, packageDetail.status)}
                            </Pill>
                          ),
                        },
                        {
                          label: t("reports.detail.generated"),
                          value: formatDateTime(packageDetail.generatedAt),
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
                          value: packageDetail.packageId,
                          mono: true,
                        },
                      ]}
                    />
                    <div>
                      <div style={detailHeadingStyle}>
                        {t("reports.detail.signedDownloads")}
                      </div>
                      {packageDetail.downloadMetadata ? (
                        <div style={panelGridStyle}>
                          <InfoPanel
                            label={t("reports.detail.zipBundle")}
                            value={
                              <a
                                href={
                                  packageDetail.downloadMetadata.zip.downloadUrl
                                }
                                target="_blank"
                                rel="noreferrer"
                                style={anchorStyle}
                              >
                                {t("reports.detail.openSignedZip")}
                              </a>
                            }
                            sub={t("reports.detail.expiresAt", {
                              value: formatDateTime(
                                packageDetail.downloadMetadata.zip.expiresAt,
                              ),
                            })}
                          />
                          <InfoPanel
                            label={t("reports.detail.pdfBundle")}
                            value={
                              <a
                                href={
                                  packageDetail.downloadMetadata.pdf.downloadUrl
                                }
                                target="_blank"
                                rel="noreferrer"
                                style={anchorStyle}
                              >
                                {t("reports.detail.openSignedPdf")}
                              </a>
                            }
                            sub={t("reports.detail.expiresAt", {
                              value: formatDateTime(
                                packageDetail.downloadMetadata.pdf.expiresAt,
                              ),
                            })}
                          />
                        </div>
                      ) : (
                        <div style={emptyStateStyle}>
                          {t("reports.detail.packagePending")}
                        </div>
                      )}
                    </div>
                    <div>
                      <div style={detailHeadingStyle}>
                        {t("reports.detail.manifestEntries")}
                      </div>
                      {packageDetail.manifest ? (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 10,
                          }}
                        >
                          <div style={manifestMetaStyle}>
                            <span>
                              {t("reports.detail.manifestId", {
                                id: packageDetail.manifest.manifestId,
                              })}
                            </span>
                            <span>
                              {t("reports.detail.immutableEntries", {
                                count: packageDetail.manifest.entryCount,
                                suffix:
                                  packageDetail.manifest.entryCount === 1
                                    ? "entry"
                                    : "entries",
                              })}
                            </span>
                            <span>
                              {t("reports.detail.manifestGenerated", {
                                value: formatDateTime(
                                  packageDetail.manifest.generatedAt,
                                ),
                              })}
                            </span>
                          </div>
                          <div style={manifestListStyle}>
                            {packageDetail.manifest.entries.map(
                              (
                                entry: NonNullable<
                                  FilingPackageDetailRecord["manifest"]
                                >["entries"][number],
                              ) => (
                                <div
                                  key={entry.itemId}
                                  style={manifestRowStyle}
                                >
                                  <div>
                                    <div style={{ fontWeight: 600 }}>
                                      {formatOpsCodeLabel(
                                        locale,
                                        entry.itemType,
                                      )}
                                    </div>
                                    <div style={subCopyStyle}>
                                      {entry.itemId}
                                    </div>
                                  </div>
                                  <div
                                    style={{
                                      fontFamily: theme.monoFamily,
                                      fontSize: 11.5,
                                    }}
                                  >
                                    {entry.artifactId}
                                  </div>
                                  <div
                                    style={{
                                      fontFamily: theme.monoFamily,
                                      fontSize: 11.5,
                                    }}
                                  >
                                    {shortHash(entry.manifestHash)}
                                  </div>
                                </div>
                              ),
                            )}
                          </div>
                        </div>
                      ) : (
                        <div style={emptyStateStyle}>
                          {t("reports.detail.manifestPending")}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div style={emptyStateStyle}>
                    {t("reports.detail.selectPackageDetail")}
                  </div>
                )}
              </Card>
            </div>
          </div>
        ) : null}

        {activeTab === "schedules" ? (
          <div style={splitGridStyle}>
            <Card
              theme={theme}
              title={copyText(locale, "Schedule posture", "排程狀態")}
              subtitle={copyText(
                locale,
                "Pre-flight controls for recurring report and filing runs.",
                "定期報表與申報工作前置控制。",
              )}
            >
              <div style={panelGridStyle}>
                <InfoPanel
                  label={t("reports.form.type")}
                  value={t(`reports.type.${jobType}`)}
                  sub={activePreset?.description ?? t("reports.adhocDesc")}
                />
                <InfoPanel
                  label={t("reports.form.packageType")}
                  value={formatOpsCodeLabel(locale, packageType)}
                  sub={copyText(
                    locale,
                    "Immutable compliance bundle target",
                    "不可變合規包目標",
                  )}
                />
                <InfoPanel
                  label={t("reports.form.filingMonth")}
                  value={packageMonth}
                  sub={copyText(locale, "Closed month", "結帳月份")}
                />
              </div>
            </Card>
            <Card
              theme={theme}
              title={copyText(locale, "Operator links", "操作捷徑")}
              subtitle={copyText(
                locale,
                "Adjacent ops surfaces for review and follow-up.",
                "相鄰營運頁面供檢視與後續處理。",
              )}
            >
              <div
                style={{ display: "flex", flexDirection: "column", gap: 10 }}
              >
                <Link href="/revenue" style={routeLinkStyle}>
                  <strong>{t("reports.revenueView")}</strong>
                  <span style={subCopyStyle}>
                    {t("reports.revenueViewSub")}
                  </span>
                </Link>
                <Link href="/dashboard" style={routeLinkStyle}>
                  <strong>{t("common.backToDashboard")}</strong>
                  <span style={subCopyStyle}>
                    {t("reports.backToDashboardSub")}
                  </span>
                </Link>
              </div>
            </Card>
          </div>
        ) : null}
      </div>
    </Shell>
  );
}

function InfoPanel({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div style={infoPanelStyle}>
      <div style={infoPanelLabelStyle}>{label}</div>
      <div style={infoPanelValueStyle}>{value}</div>
      {sub ? <div style={subCopyStyle}>{sub}</div> : null}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: 7,
  border: `1px solid ${theme.border}`,
  background: theme.bgRaised,
  color: theme.text,
  padding: "8px 10px",
  fontSize: 12.5,
  fontFamily: theme.fontFamily,
  outline: "none",
};

const primaryButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "8px 14px",
  height: 34,
  fontSize: 13,
  fontWeight: 500,
  background: theme.accent,
  color: "#fff",
  border: `1px solid ${theme.accent}`,
  borderRadius: 7,
  cursor: "pointer",
  fontFamily: theme.fontFamily,
};

const emptyStateStyle: React.CSSProperties = {
  padding: "14px 16px",
  color: theme.textMuted,
  fontSize: 12.5,
  lineHeight: 1.5,
};

const detailHeadingStyle: React.CSSProperties = {
  marginBottom: 8,
  fontSize: 11,
  fontWeight: 700,
  color: theme.textMuted,
  textTransform: "uppercase",
  letterSpacing: 0.5,
};

const jsonBlockStyle: React.CSSProperties = {
  margin: 0,
  padding: "10px 12px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: theme.surfaceLo,
  color: theme.text,
  fontSize: 11.5,
  lineHeight: 1.5,
  overflowX: "auto",
  fontFamily: theme.monoFamily,
};

const infoPanelStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: theme.surfaceLo,
  display: "grid",
  gap: 4,
};

const infoPanelLabelStyle: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 700,
  color: theme.textMuted,
  textTransform: "uppercase",
  letterSpacing: 0.45,
};

const infoPanelValueStyle: React.CSSProperties = {
  color: theme.text,
  fontSize: 12.5,
  lineHeight: 1.4,
};

const subCopyStyle: React.CSSProperties = {
  color: theme.textMuted,
  fontSize: 11,
  lineHeight: 1.4,
};

const linkButtonStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: 2,
  padding: 0,
  border: "none",
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
  font: "inherit",
};

const anchorStyle: React.CSSProperties = {
  color: theme.accent,
  textDecoration: "none",
};

const manifestMetaStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "6px 12px",
  color: theme.textMuted,
  fontSize: 11.5,
};

const manifestListStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  border: `1px solid ${theme.border}`,
  borderRadius: 8,
  overflow: "hidden",
};

const manifestRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns:
    "minmax(0, 1.2fr) minmax(120px, 0.8fr) minmax(120px, 0.8fr)",
  gap: 12,
  padding: "10px 12px",
  borderTop: `1px solid ${theme.border}`,
  background: theme.surfaceLo,
  alignItems: "center",
};

const routeLinkStyle: React.CSSProperties = {
  display: "grid",
  gap: 4,
  padding: "12px 14px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: theme.surfaceLo,
  color: theme.text,
  textDecoration: "none",
};
