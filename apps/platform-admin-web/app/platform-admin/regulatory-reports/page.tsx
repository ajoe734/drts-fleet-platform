"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { reportStatusTone } from "@/lib/sandbox-compliance";
import type { RegulatoryReportFiling } from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasField,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  buildCanvasTheme,
  type CanvasTableColumn,
} from "@drts/ui-web";

type ReportRow = RegulatoryReportFiling;

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "grid",
  gap: 16,
  width: "100%",
  maxWidth: 1280,
  margin: "0 auto",
};

const heroGridStyle: CSSProperties = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "minmax(0, 1.2fr) minmax(320px, 0.8fr)",
  alignItems: "start",
};

const controlStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: theme.surface,
  color: theme.text,
  padding: "10px 12px",
  font: "inherit",
};

const emptyStateStyle: CSSProperties = {
  color: theme.textMuted,
  fontSize: 12.5,
  padding: "28px 16px",
  textAlign: "center",
};

const monoStyle: CSSProperties = {
  fontFamily: theme.monoFamily,
  fontSize: 11.5,
};

const initialForm = {
  acknowledgementRef: "",
  note: "",
};

export default function RegulatoryReportsPage() {
  const client = usePlatformAdminClient();
  const [reports, setReports] = useState<RegulatoryReportFiling[]>([]);
  const [selectedReportId, setSelectedReportId] = useState("");
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const result = await client.listSandboxRegulatoryReports();
      setReports(result.items ?? []);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [client]);

  useEffect(() => {
    if (!reports.length || selectedReportId) {
      return;
    }
    setSelectedReportId(reports[0]?.reportId ?? "");
  }, [reports, selectedReportId]);

  async function handleSubmit() {
    if (!selectedReportId) {
      return;
    }
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      await client.submitSandboxRegulatoryReport(selectedReportId, {
        acknowledgementRef: form.acknowledgementRef || null,
        note: form.note || null,
      });
      setNotice(`Regulatory report ${selectedReportId} submitted.`);
      setForm(initialForm);
      await load();
    } catch (submitError: unknown) {
      setError(submitError instanceof Error ? submitError.message : String(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  const selectedReport =
    reports.find((item) => item.reportId === selectedReportId) ?? null;

  const columns: CanvasTableColumn<ReportRow>[] = [
    {
      h: "Report",
      r: (row) => (
        <div style={{ display: "grid", gap: 2 }}>
          <span style={{ fontWeight: 600 }}>{row.reportType}</span>
          <span style={monoStyle}>{row.reportId}</span>
        </div>
      ),
    },
    {
      h: "Period",
      w: 190,
      r: (row) => (
        <span style={monoStyle}>
          {formatDateTime(row.periodStart)} → {formatDateTime(row.periodEnd)}
        </span>
      ),
    },
    {
      h: "Jurisdiction",
      w: 150,
      r: (row) => row.jurisdiction,
    },
    {
      h: "Status",
      w: 140,
      r: (row) => (
        <CanvasPill theme={theme} tone={reportStatusTone(row.status)} dot>
          {row.status}
        </CanvasPill>
      ),
    },
    {
      h: "Submit",
      w: 120,
      r: (row) =>
        row.status === "generated" ? (
          <CanvasBtn
            theme={theme}
            size="xs"
            variant="secondary"
            onClick={() => {
              setSelectedReportId(row.reportId);
              void handleSubmit();
            }}
            disabled={submitting}
          >
            Submit
          </CanvasBtn>
        ) : (
          <span style={monoStyle}>{row.acknowledgementRef ?? "—"}</span>
        ),
    },
  ];

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title="監理報表作業 · Regulatory Reports"
        subtitle="Generated filings, acknowledgement references, and submission workflow"
      />
      <div style={pageBodyStyle}>
        {notice ? (
          <CanvasBanner
            theme={theme}
            tone="info"
            icon="info"
            title="Regulatory submission updated"
            body={notice}
          />
        ) : null}
        {error ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            icon="warn"
            title="Regulatory report workflow failed"
            body={error}
          />
        ) : null}

        <div style={heroGridStyle}>
          <CanvasCard theme={theme} title="Submission panel" subtitle="Submit generated report to regulator">
            <CanvasField theme={theme} label="Report">
              <select
                value={selectedReportId}
                onChange={(event) => setSelectedReportId(event.target.value)}
                style={controlStyle}
              >
                {reports.map((item) => (
                  <option key={item.reportId} value={item.reportId}>
                    {item.reportId}
                  </option>
                ))}
              </select>
            </CanvasField>
            <div style={{ marginTop: 14 }}>
              <CanvasField theme={theme} label="Acknowledgement reference">
                <input
                  value={form.acknowledgementRef}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      acknowledgementRef: event.target.value,
                    }))
                  }
                  style={controlStyle}
                />
              </CanvasField>
            </div>
            <div style={{ marginTop: 14 }}>
              <CanvasField theme={theme} label="Submission note">
                <textarea
                  value={form.note}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, note: event.target.value }))
                  }
                  style={{ ...controlStyle, minHeight: 96, resize: "vertical" }}
                />
              </CanvasField>
            </div>
            <div style={{ marginTop: 14 }}>
              <CanvasBtn
                theme={theme}
                variant="primary"
                onClick={() => void handleSubmit()}
                disabled={submitting || !selectedReportId}
              >
                {submitting ? "Submitting..." : "Submit report"}
              </CanvasBtn>
            </div>
          </CanvasCard>

          <CanvasCard theme={theme} title="Selected report">
            {selectedReport ? (
              <CanvasDL
                theme={theme}
                cols={1}
                items={[
                  { k: "Report ID", v: selectedReport.reportId, mono: true },
                  { k: "Type", v: selectedReport.reportType, mono: false },
                  { k: "Case", v: selectedReport.caseId ?? "—", mono: true },
                  {
                    k: "Evidence manifest",
                    v: selectedReport.evidenceManifestId ?? "—",
                    mono: true,
                  },
                  {
                    k: "Current status",
                    v: (
                      <CanvasPill theme={theme} tone={reportStatusTone(selectedReport.status)} dot>
                        {selectedReport.status}
                      </CanvasPill>
                    ),
                    mono: false,
                  },
                ]}
              />
            ) : (
              <div style={emptyStateStyle}>No regulatory report is selected.</div>
            )}
          </CanvasCard>
        </div>

        <CanvasCard theme={theme} title="Report queue" subtitle="Generated and submitted regulatory reports" padding={0}>
          {reports.length > 0 ? (
            <CanvasTable theme={theme} columns={columns} rows={reports} />
          ) : (
            <div style={emptyStateStyle}>
              {loading ? "Loading regulatory reports..." : "No regulatory report jobs are available."}
            </div>
          )}
        </CanvasCard>
      </div>
    </>
  );
}
