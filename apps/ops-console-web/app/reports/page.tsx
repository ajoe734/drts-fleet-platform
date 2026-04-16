"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { AppShellCard } from "@drts/ui-web";
import type {
  CreateReportJobCommand,
  FilingPackageListRecord,
  FilingPackageType,
  ReportJobRecord,
  ReportOutputFormat,
} from "@drts/contracts";
import { FILING_PACKAGE_TYPES, REPORT_OUTPUT_FORMATS } from "@drts/contracts";
import { getOpsClient } from "@/lib/api-client";

const JOB_PRESETS: Array<{
  value: string;
  label: string;
  description: string;
}> = [
  {
    value: "revenue_summary",
    label: "Revenue summary",
    description: "Revenue, average trip, and payout-friendly export.",
  },
  {
    value: "dispatch_recording_index",
    label: "Dispatch trace",
    description: "Dispatch and recording index export for audit follow-up.",
  },
  {
    value: "incident_register",
    label: "Incident register",
    description: "Operational incident summary for ROC review.",
  },
  {
    value: "maintenance_overview",
    label: "Maintenance overview",
    description: "Vehicle maintenance backlog and completion export.",
  },
];

function defaultClosedMonth() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const target = new Date(Date.UTC(year, month - 1, 1));
  return `${target.getUTCFullYear()}-${String(
    target.getUTCMonth() + 1,
  ).padStart(2, "0")}`;
}

export default function ReportsPage() {
  const [jobs, setJobs] = useState<ReportJobRecord[]>([]);
  const [packages, setPackages] = useState<FilingPackageListRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();
  const [jobType, setJobType] = useState(JOB_PRESETS[0]!.value);
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  function handleReportSubmit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(() => {
      void (async () => {
        try {
          const client = getOpsClient();
          const filters: CreateReportJobCommand["filters"] = {};
          if (periodLabel.trim()) filters.period = periodLabel.trim();
          if (vehicleId.trim()) filters.vehicleId = vehicleId.trim();
          await client.createReportJob({
            jobType,
            format,
            ...(Object.keys(filters).length > 0 ? { filters } : {}),
          });
          await loadData();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Unknown error");
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
          await client.generateFilingPackage({
            packageType,
            period: packageMonth.trim() ? { month: packageMonth.trim() } : {},
            scope: packageScope.trim() ? { channel: packageScope.trim() } : {},
          });
          await loadData();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Unknown error");
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

  return (
    <main className="app-grid">
      <AppShellCard
        title="Reports & Filing Center"
        description="Create report jobs and immutable filing packages from the authoritative reporting service."
      >
        {error && (
          <div className="error-banner">
            <strong>Error:</strong> {error}
          </div>
        )}

        <section className="summary-grid">
          {[
            {
              label: "Queued jobs",
              value: queuedReports,
              note: "Background jobs waiting or running",
            },
            {
              label: "Completed reports",
              value: completedReports,
              note: "Ready for artifact download",
            },
            {
              label: "Filing packages",
              value: completedPackages,
              note: "Immutable package history",
            },
            {
              label: "Artifacts ready",
              value: readyArtifacts + completedPackages,
              note: "Report downloads plus filing packages",
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
                <p className="eyebrow">Create report</p>
                <h3>Background export request</h3>
              </div>
            </div>
            <div className="form-grid">
              <label>
                Report type
                <select
                  value={jobType}
                  onChange={(event) => setJobType(event.target.value)}
                >
                  {JOB_PRESETS.map((preset) => (
                    <option key={preset.value} value={preset.value}>
                      {preset.label}
                    </option>
                  ))}
                </select>
                <small>
                  {JOB_PRESETS.find((preset) => preset.value === jobType)
                    ?.description ?? ""}
                </small>
              </label>
              <label>
                Format
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
                Period / tag
                <input
                  value={periodLabel}
                  onChange={(event) => setPeriodLabel(event.target.value)}
                  placeholder="2026-04 or today"
                />
              </label>
              <label>
                Vehicle ID
                <input
                  value={vehicleId}
                  onChange={(event) => setVehicleId(event.target.value)}
                  placeholder="Optional vehicle scope"
                />
              </label>
            </div>
            <div className="form-actions">
              <button
                className="btn btn-primary"
                type="submit"
                disabled={pending}
              >
                {pending ? "Submitting..." : "Create report job"}
              </button>
              <button
                className="btn"
                type="button"
                onClick={() => void loadData()}
              >
                Refresh
              </button>
            </div>
          </form>

          <form className="panel" onSubmit={handlePackageSubmit}>
            <div className="panel-head">
              <div>
                <p className="eyebrow">Generate filing</p>
                <h3>Immutable filing package</h3>
              </div>
            </div>
            <div className="form-grid">
              <label>
                Package type
                <select
                  value={packageType}
                  onChange={(event) =>
                    setPackageType(event.target.value as FilingPackageType)
                  }
                >
                  {FILING_PACKAGE_TYPES.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Filing month
                <input
                  value={packageMonth}
                  onChange={(event) => setPackageMonth(event.target.value)}
                  placeholder="2026-03"
                />
              </label>
              <label>
                Scope channel
                <input
                  value={packageScope}
                  onChange={(event) => setPackageScope(event.target.value)}
                  placeholder="ops-console"
                />
              </label>
            </div>
            <div className="form-actions">
              <button
                className="btn btn-primary"
                type="submit"
                disabled={pending}
              >
                {pending ? "Submitting..." : "Generate filing package"}
              </button>
            </div>
          </form>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Report jobs</p>
              <h3>Recent jobs</h3>
            </div>
            <span className="panel-note">
              {jobs.length} total report job(s)
            </span>
          </div>
          {loading ? (
            <p>Loading report jobs...</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Status</th>
                  <th>Format</th>
                  <th>Filters</th>
                  <th>Artifact</th>
                </tr>
              </thead>
              <tbody>
                {jobs.length > 0 ? (
                  jobs.map((job) => (
                    <tr key={job.jobId}>
                      <td>
                        <div className="cell-title">{job.jobType}</div>
                        <div className="cell-subcopy">{job.jobId}</div>
                        <div className="cell-subcopy">
                          {new Date(job.createdAt).toLocaleString()}
                        </div>
                      </td>
                      <td>{job.status}</td>
                      <td>{job.format}</td>
                      <td>
                        {Object.keys(job.filters).length > 0 ? (
                          <pre className="filters-preview">
                            {JSON.stringify(job.filters, null, 2)}
                          </pre>
                        ) : (
                          <span className="cell-subcopy">No filters</span>
                        )}
                      </td>
                      <td>
                        {job.artifact ? (
                          <a
                            className="inline-link"
                            href={job.artifact.downloadUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Download {job.artifact.artifactType}
                          </a>
                        ) : (
                          <span className="cell-subcopy">Pending artifact</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5}>No report jobs yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Filing packages</p>
              <h3>Immutable package history</h3>
            </div>
            <span className="panel-note">
              {packages.length} package(s) generated
            </span>
          </div>
          {loading ? (
            <p>Loading filing packages...</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Package</th>
                  <th>Status</th>
                  <th>Manifest</th>
                  <th>Items</th>
                  <th>Generated</th>
                  <th>Artifacts</th>
                </tr>
              </thead>
              <tbody>
                {packages.length > 0 ? (
                  packages.map((pkg) => (
                    <tr key={pkg.packageId}>
                      <td>
                        <div className="cell-title">{pkg.packageType}</div>
                        <div className="cell-subcopy">{pkg.packageId}</div>
                      </td>
                      <td>
                        <div>{pkg.status}</div>
                        <div className="cell-subcopy">
                          {(pkg.immutable ?? true) ? "immutable" : "mutable"}
                        </div>
                      </td>
                      <td>
                        {pkg.manifestHash ? (
                          <code>{pkg.manifestHash.slice(0, 12)}...</code>
                        ) : (
                          <span className="cell-subcopy">Pending manifest</span>
                        )}
                      </td>
                      <td>{pkg.items.length}</td>
                      <td>
                        {pkg.generatedAt
                          ? new Date(pkg.generatedAt).toLocaleString()
                          : "Pending"}
                      </td>
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
                              Pending artifact
                            </span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6}>No filing packages generated yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </section>

        <div className="footer-links">
          <Link className="route-link" href="/revenue">
            <strong>Revenue view</strong> Return to live revenue analysis.
          </Link>
          <Link className="route-link" href="/dashboard">
            <strong>Dashboard</strong> Return to the operations overview.
          </Link>
        </div>

        <style jsx>{`
          .summary-grid,
          .form-grid,
          .form-actions,
          .footer-links,
          .form-stack {
            display: grid;
            gap: 0.75rem;
          }
          .summary-grid {
            grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
            margin-bottom: 1rem;
          }
          .summary-card,
          .panel {
            padding: 1rem;
            border-radius: 1rem;
            border: 1px solid #e2e8f0;
            background: #fff;
          }
          .summary-card {
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
          .cell-subcopy {
            color: #64748b;
          }
          .eyebrow {
            margin: 0 0 0.25rem;
            font-size: 0.75rem;
            letter-spacing: 0.08em;
            text-transform: uppercase;
          }
          .form-grid {
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          }
          label {
            display: grid;
            gap: 0.35rem;
            color: #0f172a;
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
          .cell-title {
            font-weight: 600;
          }
          .filters-preview {
            margin: 0;
            padding: 0.5rem;
            border-radius: 0.75rem;
            background: #f8fafc;
            font-size: 0.72rem;
            max-width: 220px;
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
          }
          .error-banner {
            margin-bottom: 1rem;
            border-radius: 0.9rem;
            padding: 0.85rem 1rem;
            background: #fef2f2;
            color: #b91c1c;
          }
        `}</style>
      </AppShellCard>
    </main>
  );
}
