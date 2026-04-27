"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { PageHeader } from "@drts/ui-web";
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
import { formatOpsCodeLabel, getOpsLabel } from "@/lib/localized-labels";

type JobPresetMetadata = {
  label: string;
  description: string;
};

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

const JOB_PRESETS = REPORT_JOB_TYPES.map((value) => ({
  value,
  ...JOB_PRESET_METADATA[value],
  category: REGULATORY_JOB_TYPE_SET.has(value) ? "Regulatory" : "Operational",
}));

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

export default function ReportsPage() {
  const { t, locale } = useTranslation();
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
  const activePresetCategory = jobCategory(jobType);

  return (
    <>
      <PageHeader title={t("reports.title")} subtitle={t("reports.subtitle")} />
      <div>
        {error && (
          <div className="error-banner">
            <strong>{getOpsLabel(locale, "error")}:</strong> {error}
          </div>
        )}

        <section className="summary-grid">
          {[
            {
              label: t("reports.queuedJobs"),
              value: queuedReports,
              note: t("reports.queuedJobsSub"),
            },
            {
              label: t("reports.completedReports"),
              value: completedReports,
              note: t("reports.completedReportsSub"),
            },
            {
              label: t("reports.regulatoryJobs"),
              value: regulatoryJobs,
              note: t("reports.regulatoryJobsSub"),
            },
            {
              label: t("reports.artifactsReady"),
              value: readyArtifacts + completedPackages,
              note: t("reports.artifactsReadySub"),
            },
          ].map((card) => (
            <div key={card.label} className="summary-card">
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              <small>{card.note}</small>
            </div>
          ))}
        </section>

        <section className="form-stack">
          <form className="panel" onSubmit={handleReportSubmit}>
            <div className="panel-head">
              <div>
                <p className="eyebrow">{t("reports.createReportEyebrow")}</p>
                <h3>{t("reports.backgroundExport")}</h3>
              </div>
              <span className="pill">
                {t(`reports.category.${activePresetCategory.toLowerCase()}`)}
              </span>
            </div>
            <div className="form-grid">
              <label>
                {t("reports.form.type")}
                <select
                  value={jobType}
                  onChange={(event) =>
                    setJobType(event.target.value as ReportJobType)
                  }
                >
                  {JOB_PRESETS.map((preset) => (
                    <option key={preset.value} value={preset.value}>
                      {t(`reports.type.${preset.value}`)}
                    </option>
                  ))}
                </select>
                <small>
                  {t(`reports.type.${jobType}.desc`)}{" "}
                  {t("reports.categoryLabel", {
                    value: t(
                      `reports.category.${activePresetCategory.toLowerCase()}`,
                    ),
                  })}
                </small>
              </label>
              <label>
                {t("reports.form.format")}
                <select
                  value={format}
                  onChange={(event) =>
                    setFormat(event.target.value as ReportOutputFormat)
                  }
                >
                  {REPORT_OUTPUT_FORMATS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("reports.form.periodTag")}
                <input
                  value={periodLabel}
                  onChange={(event) => setPeriodLabel(event.target.value)}
                  placeholder={getOpsLabel(locale, "reportsPeriodExample")}
                />
              </label>
              <label>
                {t("reports.form.vehicleId")}
                <input
                  value={vehicleId}
                  onChange={(event) => setVehicleId(event.target.value)}
                  placeholder={t("reports.form.vehicleId")}
                />
              </label>
            </div>
            <div className="form-actions">
              <button
                className="btn btn-primary"
                type="submit"
                disabled={pending}
              >
                {pending
                  ? t("reports.form.submitting")
                  : t("reports.form.createJob")}
              </button>
              <button
                className="btn"
                type="button"
                onClick={() => void loadData()}
              >
                {t("common.refresh")}
              </button>
            </div>
          </form>

          <form className="panel" onSubmit={handlePackageSubmit}>
            <div className="panel-head">
              <div>
                <p className="eyebrow">{t("reports.generateFiling")}</p>
                <h3>{t("reports.immutableFiling")}</h3>
              </div>
              <span className="pill">{t("reports.complianceBundle")}</span>
            </div>
            <div className="form-grid">
              <label>
                {t("reports.form.packageType")}
                <select
                  value={packageType}
                  onChange={(event) =>
                    setPackageType(event.target.value as FilingPackageType)
                  }
                >
                  {FILING_PACKAGE_TYPES.map((value) => (
                    <option key={value} value={value}>
                      {formatOpsCodeLabel(locale, value)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("reports.form.filingMonth")}
                <input
                  value={packageMonth}
                  onChange={(event) => setPackageMonth(event.target.value)}
                  placeholder={getOpsLabel(locale, "reportsClosedMonthExample")}
                />
              </label>
              <label>
                {t("reports.form.scopeChannel")}
                <input
                  value={packageScope}
                  onChange={(event) => setPackageScope(event.target.value)}
                  placeholder={getOpsLabel(locale, "reportsRequestedByExample")}
                />
              </label>
            </div>
            <div className="form-actions">
              <button
                className="btn btn-primary"
                type="submit"
                disabled={pending}
              >
                {pending
                  ? t("reports.form.submitting")
                  : t("reports.form.generatePackage")}
              </button>
            </div>
          </form>
        </section>

        <section className="detail-grid">
          <div className="panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">{t("reports.reportDetailEyebrow")}</p>
                <h3>
                  {jobDetail
                    ? t(`reports.type.${jobDetail.jobType}`)
                    : t("reports.selectReportJob")}
                </h3>
              </div>
            </div>
            {selectedJobId && detailLoadingKey === `job:${selectedJobId}` ? (
              <p>{t("reports.loadingReportDetail")}</p>
            ) : jobDetail ? (
              <>
                <div className="detail-stats">
                  <div className="detail-stat">
                    <span>{t("reports.detail.status")}</span>
                    <strong>
                      {formatOpsCodeLabel(locale, jobDetail.status)}
                    </strong>
                    <small>
                      {t(
                        `reports.category.${jobCategory(jobDetail.jobType).toLowerCase()}`,
                      )}
                    </small>
                  </div>
                  <div className="detail-stat">
                    <span>{t("reports.detail.format")}</span>
                    <strong>{jobDetail.format}</strong>
                    <small>{jobDetail.jobId}</small>
                  </div>
                  <div className="detail-stat">
                    <span>{t("reports.detail.created")}</span>
                    <strong>{formatDateTime(jobDetail.createdAt)}</strong>
                    <small>
                      {t("reports.detail.updated", {
                        value: formatDateTime(jobDetail.updatedAt),
                      })}
                    </small>
                  </div>
                </div>

                <div className="detail-section">
                  <h4>{t("reports.detail.filters")}</h4>
                  {Object.keys(jobDetail.filters).length > 0 ? (
                    <pre className="filters-preview">
                      {JSON.stringify(jobDetail.filters, null, 2)}
                    </pre>
                  ) : (
                    <p className="cell-subcopy">
                      {t("reports.detail.noFilters")}
                    </p>
                  )}
                </div>

                <div className="detail-section">
                  <h4>{t("reports.detail.signedArtifact")}</h4>
                  {jobDetail.artifact ? (
                    <div className="detail-card-grid">
                      <div className="detail-card">
                        <span>{t("reports.detail.manifest")}</span>
                        <strong>
                          {shortHash(jobDetail.artifact.manifestHash)}
                        </strong>
                        <small>
                          {jobDetail.artifact.downloadMetadata.keyId}
                        </small>
                      </div>
                      <div className="detail-card">
                        <span>{t("reports.detail.expires")}</span>
                        <strong>
                          {formatDateTime(
                            jobDetail.artifact.downloadMetadata.expiresAt,
                          )}
                        </strong>
                        <small>{t("reports.detail.backendSignedUrl")}</small>
                      </div>
                      <div className="detail-card">
                        <span>{t("reports.download")}</span>
                        <a
                          className="inline-link"
                          href={jobDetail.artifact.downloadMetadata.downloadUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {t("reports.detail.openSignedArtifact")}
                        </a>
                        <small>
                          {formatOpsCodeLabel(
                            locale,
                            jobDetail.artifact.artifactType,
                          )}
                        </small>
                      </div>
                    </div>
                  ) : (
                    <p className="cell-subcopy">
                      {t("reports.detail.artifactPending")}
                    </p>
                  )}
                </div>

                {jobDetail.rows && jobDetail.rows.length > 0 ? (
                  <div className="detail-section">
                    <h4>{t("reports.detail.dispatchRows")}</h4>
                    <table className="table compact-table">
                      <thead>
                        <tr>
                          <th>{t("reports.col.order")}</th>
                          <th>{t("reports.col.call")}</th>
                          <th>{t("reports.col.recording")}</th>
                          <th>{t("reports.col.missing")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {jobDetail.rows.map((row) => (
                          <tr key={row.orderId}>
                            <td>
                              <div className="cell-title">{row.orderNo}</div>
                              <div className="cell-subcopy">{row.orderId}</div>
                            </td>
                            <td>{row.callId ?? "—"}</td>
                            <td>{row.recordingId ?? "—"}</td>
                            <td>
                              {row.missingRecording
                                ? t("common.yes")
                                : t("common.no")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="cell-subcopy">
                {t("reports.detail.selectReportDetail")}
              </p>
            )}
          </div>

          <div className="panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">{t("reports.packageDetailEyebrow")}</p>
                <h3>
                  {packageDetail
                    ? t("reports.packageManifest", {
                        type: formatOpsCodeLabel(
                          locale,
                          packageDetail.packageType,
                        ),
                      })
                    : t("reports.selectFilingPackage")}
                </h3>
              </div>
            </div>
            {selectedPackageId &&
            detailLoadingKey === `package:${selectedPackageId}` ? (
              <p>{t("reports.loadingPackageDetail")}</p>
            ) : packageDetail ? (
              <>
                <div className="detail-stats">
                  <div className="detail-stat">
                    <span>{t("reports.detail.status")}</span>
                    <strong>
                      {formatOpsCodeLabel(locale, packageDetail.status)}
                    </strong>
                    <small>
                      {formatOpsCodeLabel(
                        locale,
                        packageDetail.immutable ? "immutable" : "mutable",
                      )}
                    </small>
                  </div>
                  <div className="detail-stat">
                    <span>{t("reports.detail.generated")}</span>
                    <strong>{formatDateTime(packageDetail.generatedAt)}</strong>
                    <small>{packageDetail.packageId}</small>
                  </div>
                  <div className="detail-stat">
                    <span>{t("reports.detail.checksum")}</span>
                    <strong>
                      {shortHash(packageDetail.manifest?.checksum)}
                    </strong>
                    <small>
                      {t("reports.detail.packageItems", {
                        count: packageDetail.items.length,
                      })}
                    </small>
                  </div>
                </div>

                <div className="detail-section">
                  <h4>{t("reports.detail.signedDownloads")}</h4>
                  {packageDetail.downloadMetadata ? (
                    <div className="detail-card-grid">
                      <div className="detail-card">
                        <span>{t("reports.detail.zipBundle")}</span>
                        <a
                          className="inline-link"
                          href={packageDetail.downloadMetadata.zip.downloadUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {t("reports.detail.openSignedZip")}
                        </a>
                        <small>
                          {t("reports.detail.expiresAt", {
                            value: formatDateTime(
                              packageDetail.downloadMetadata.zip.expiresAt,
                            ),
                          })}
                        </small>
                      </div>
                      <div className="detail-card">
                        <span>{t("reports.detail.pdfBundle")}</span>
                        <a
                          className="inline-link"
                          href={packageDetail.downloadMetadata.pdf.downloadUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {t("reports.detail.openSignedPdf")}
                        </a>
                        <small>
                          {t("reports.detail.expiresAt", {
                            value: formatDateTime(
                              packageDetail.downloadMetadata.pdf.expiresAt,
                            ),
                          })}
                        </small>
                      </div>
                    </div>
                  ) : (
                    <p className="cell-subcopy">
                      {t("reports.detail.packagePending")}
                    </p>
                  )}
                </div>

                <div className="detail-section">
                  <h4>{t("reports.detail.manifestEntries")}</h4>
                  {packageDetail.manifest ? (
                    <>
                      <div className="manifest-summary">
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
                      <table className="table compact-table">
                        <thead>
                          <tr>
                            <th>{t("reports.col.item")}</th>
                            <th>{t("reports.col.artifactCol")}</th>
                            <th>{t("reports.col.manifestHash")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {packageDetail.manifest.entries.map((entry) => (
                            <tr key={entry.itemId}>
                              <td>
                                <div className="cell-title">
                                  {formatOpsCodeLabel(locale, entry.itemType)}
                                </div>
                                <div className="cell-subcopy">
                                  {entry.itemId}
                                </div>
                              </td>
                              <td>{entry.artifactId}</td>
                              <td>
                                <code>{shortHash(entry.manifestHash)}</code>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  ) : (
                    <p className="cell-subcopy">
                      {t("reports.detail.manifestPending")}
                    </p>
                  )}
                </div>
              </>
            ) : (
              <p className="cell-subcopy">
                {t("reports.detail.selectPackageDetail")}
              </p>
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">{t("reports.reportJobsEyebrow")}</p>
              <h3>{t("reports.recentJobs")}</h3>
            </div>
            <span className="panel-note">
              {t("reports.totalJobs", { count: jobs.length })}
            </span>
          </div>
          {loading ? (
            <p>{t("reports.loadingJobs")}</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>{t("reports.col.job")}</th>
                  <th>{t("reports.col.category")}</th>
                  <th>{t("reports.col.status")}</th>
                  <th>{t("reports.col.filters")}</th>
                  <th>{t("reports.col.artifact")}</th>
                  <th>{t("reports.col.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {jobs.length > 0 ? (
                  jobs.map((job) => (
                    <tr key={job.jobId}>
                      <td>
                        <div className="cell-title">
                          {t(`reports.type.${job.jobType}`)}
                        </div>
                        <div className="cell-subcopy">{job.jobId}</div>
                        <div className="cell-subcopy">
                          {formatDateTime(job.createdAt)} • {job.format}
                        </div>
                      </td>
                      <td>
                        {t(
                          `reports.category.${jobCategory(job.jobType).toLowerCase()}`,
                        )}
                      </td>
                      <td>
                        <div>{formatOpsCodeLabel(locale, job.status)}</div>
                        <div className="cell-subcopy">
                          {t("reports.detail.updated", {
                            value: formatDateTime(job.updatedAt),
                          })}
                        </div>
                      </td>
                      <td>
                        {Object.keys(job.filters).length > 0 ? (
                          <pre className="filters-preview">
                            {JSON.stringify(job.filters, null, 2)}
                          </pre>
                        ) : (
                          <span className="cell-subcopy">
                            {t("reports.detail.noFiltersShort")}
                          </span>
                        )}
                      </td>
                      <td>
                        {job.artifact ? (
                          <div className="package-links">
                            <a
                              className="inline-link"
                              href={job.artifact.downloadUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {t("reports.downloadArtifact", {
                                type: formatOpsCodeLabel(
                                  locale,
                                  job.artifact.artifactType,
                                ),
                              })}
                            </a>
                            <span className="cell-subcopy">
                              {shortHash(job.artifact.manifestHash)}
                            </span>
                          </div>
                        ) : (
                          <span className="cell-subcopy">
                            {t("reports.detail.pendingArtifact")}
                          </span>
                        )}
                      </td>
                      <td>
                        <button
                          className="btn"
                          type="button"
                          onClick={() => void inspectReportJob(job.jobId)}
                          disabled={detailLoadingKey === `job:${job.jobId}`}
                        >
                          {detailLoadingKey === `job:${job.jobId}`
                            ? t("reports.loading")
                            : t("reports.inspect")}
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6}>{t("reports.noJobs")}</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">{t("reports.filingPackagesEyebrow")}</p>
              <h3>{t("reports.packageHistory")}</h3>
            </div>
            <span className="panel-note">
              {t("reports.packagesGenerated", { count: packages.length })}
            </span>
          </div>
          {loading ? (
            <p>{t("reports.loadingPackages")}</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>{t("reports.col.package")}</th>
                  <th>{t("reports.col.status")}</th>
                  <th>{t("reports.col.manifest")}</th>
                  <th>{t("reports.col.items")}</th>
                  <th>{t("reports.col.generated")}</th>
                  <th>{t("reports.col.artifacts")}</th>
                  <th>{t("reports.col.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {packages.length > 0 ? (
                  packages.map((pkg) => (
                    <tr key={pkg.packageId}>
                      <td>
                        <div className="cell-title">
                          {formatOpsCodeLabel(locale, pkg.packageType)}
                        </div>
                        <div className="cell-subcopy">{pkg.packageId}</div>
                      </td>
                      <td>
                        <div>{formatOpsCodeLabel(locale, pkg.status)}</div>
                        <div className="cell-subcopy">
                          {formatOpsCodeLabel(
                            locale,
                            (pkg.immutable ?? true) ? "immutable" : "mutable",
                          )}
                        </div>
                      </td>
                      <td>
                        {pkg.manifestHash ? (
                          <code>{shortHash(pkg.manifestHash)}</code>
                        ) : (
                          <span className="cell-subcopy">
                            {t("reports.pendingManifest")}
                          </span>
                        )}
                      </td>
                      <td>{pkg.items.length}</td>
                      <td>{formatDateTime(pkg.generatedAt)}</td>
                      <td>
                        <div className="package-links">
                          {pkg.artifactZipUrl ? (
                            <a
                              className="inline-link"
                              href={pkg.artifactZipUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              ZIP
                            </a>
                          ) : null}
                          {pkg.artifactPdfUrl ? (
                            <a
                              className="inline-link"
                              href={pkg.artifactPdfUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              PDF
                            </a>
                          ) : null}
                          {!pkg.artifactZipUrl && !pkg.artifactPdfUrl ? (
                            <span className="cell-subcopy">
                              {t("reports.detail.pendingArtifact")}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        <button
                          className="btn"
                          type="button"
                          onClick={() =>
                            void inspectFilingPackage(pkg.packageId)
                          }
                          disabled={
                            detailLoadingKey === `package:${pkg.packageId}`
                          }
                        >
                          {detailLoadingKey === `package:${pkg.packageId}`
                            ? t("reports.loading")
                            : t("reports.inspect")}
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7}>{t("reports.noPackages")}</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </section>

        <div className="footer-links">
          <Link className="route-link" href="/revenue">
            <strong>{t("reports.revenueView")}</strong>{" "}
            {t("reports.revenueViewSub")}
          </Link>
          <Link className="route-link" href="/dashboard">
            <strong>{t("common.backToDashboard")}</strong>{" "}
            {t("reports.backToDashboardSub")}
          </Link>
        </div>

        <style jsx>{`
          .summary-grid,
          .form-grid,
          .form-actions,
          .footer-links,
          .form-stack,
          .detail-grid,
          .detail-stats,
          .detail-card-grid {
            display: grid;
            gap: 0.75rem;
          }
          .summary-grid {
            grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
            margin-bottom: 1rem;
          }
          .form-grid,
          .detail-stats,
          .detail-card-grid {
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          }
          .detail-grid {
            grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
            margin-bottom: 1rem;
          }
          .summary-card,
          .panel,
          .detail-stat,
          .detail-card {
            padding: 1rem;
            border-radius: 1rem;
            border: 1px solid #e2e8f0;
            background: #fff;
          }
          .summary-card,
          .detail-stat,
          .detail-card {
            background: #f8fafc;
          }
          .summary-card strong {
            font-size: 1.4rem;
          }
          .panel-head {
            display: flex;
            justify-content: space-between;
            gap: 1rem;
            align-items: flex-start;
            margin-bottom: 0.75rem;
          }
          .eyebrow,
          .panel-note,
          .cell-subcopy,
          .detail-stat span,
          .detail-card span {
            color: #64748b;
          }
          .eyebrow {
            margin: 0 0 0.25rem;
            font-size: 0.75rem;
            letter-spacing: 0.08em;
            text-transform: uppercase;
          }
          .pill {
            display: inline-flex;
            align-items: center;
            border-radius: 999px;
            border: 1px solid #cbd5e1;
            padding: 0.3rem 0.7rem;
            font-size: 0.75rem;
            color: #334155;
            background: #f8fafc;
          }
          label {
            display: grid;
            gap: 0.35rem;
            color: #0f172a;
          }
          small {
            color: #64748b;
          }
          input,
          select {
            width: 100%;
            padding: 0.75rem 0.85rem;
            border-radius: 0.8rem;
            border: 1px solid #cbd5e1;
          }
          .btn {
            padding: 0.65rem 0.85rem;
            border-radius: 0.75rem;
            border: 1px solid #cbd5e1;
            background: white;
            cursor: pointer;
          }
          .btn-primary {
            background: #0f172a;
            color: white;
            border-color: #0f172a;
          }
          .table {
            width: 100%;
            border-collapse: collapse;
          }
          .table th,
          .table td {
            padding: 0.75rem;
            border-top: 1px solid #e2e8f0;
            text-align: left;
            vertical-align: top;
          }
          .table th {
            font-size: 0.8rem;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            color: #475569;
          }
          .compact-table th,
          .compact-table td {
            padding: 0.6rem;
          }
          .cell-title {
            font-weight: 600;
          }
          .filters-preview {
            margin: 0;
            padding: 0.5rem;
            border-radius: 0.75rem;
            background: #f8fafc;
            font-size: 0.72rem;
            overflow: auto;
          }
          .inline-link {
            color: #2563eb;
            text-decoration: none;
          }
          .package-links {
            display: flex;
            gap: 0.75rem;
            flex-wrap: wrap;
            align-items: center;
          }
          .error-banner {
            margin-bottom: 1rem;
            border-radius: 0.9rem;
            padding: 0.85rem 1rem;
            background: #fef2f2;
            color: #b91c1c;
          }
          .detail-section {
            display: grid;
            gap: 0.75rem;
            margin-top: 1rem;
          }
          .detail-section h4 {
            margin: 0;
            font-size: 0.95rem;
            color: #0f172a;
          }
          .detail-stat,
          .detail-card {
            display: grid;
            gap: 0.3rem;
          }
          .detail-stat strong,
          .detail-card strong {
            font-size: 1rem;
            color: #0f172a;
          }
          .manifest-summary {
            display: flex;
            gap: 0.75rem;
            flex-wrap: wrap;
            font-size: 0.85rem;
            color: #475569;
          }
        `}</style>
      </div>
    </>
  );
}
