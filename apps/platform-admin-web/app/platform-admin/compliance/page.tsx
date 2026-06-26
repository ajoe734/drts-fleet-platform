"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import {
  accidentSeverityTone,
  buildTripComplianceChecks,
  findInvestigationForDiscrepancy,
  loadSandboxComplianceOverview,
  reportStatusTone,
  tripHref,
  uniqueManifestIds,
  type SandboxComplianceOverview,
} from "@/lib/sandbox-compliance";
import type {
  CorrelatedTakeoverCase,
  EvidenceDiscrepancyCase,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  buildCanvasTheme,
  type CanvasTableColumn,
} from "@drts/ui-web";

type DiscrepancyRow = EvidenceDiscrepancyCase & {
  linkedCaseId: string | null;
  tripId: string | null;
} & Record<string, unknown>;

type TakeoverRow = CorrelatedTakeoverCase & { tripId: string | null } & Record<string, unknown>;

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
  width: "100%",
  maxWidth: 1280,
  margin: "0 auto",
};

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 0.9fr)",
  alignItems: "start",
};

const secondaryGridStyle: CSSProperties = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "minmax(0, 1.2fr) minmax(320px, 0.8fr)",
  alignItems: "start",
};

const stackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const listStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const listRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "10px 12px",
  border: `1px solid ${theme.border}`,
  borderRadius: 10,
  background: theme.surface,
};

const linkStyle: CSSProperties = {
  color: theme.accent,
  textDecoration: "none",
  fontWeight: 600,
  fontSize: 12.5,
};

const monoStyle: CSSProperties = {
  fontFamily: theme.monoFamily,
  fontSize: 11.5,
};

const emptyStateStyle: CSSProperties = {
  color: theme.textMuted,
  fontSize: 12.5,
  padding: "28px 16px",
  textAlign: "center",
};

function discrepancyTone(discrepancy: EvidenceDiscrepancyCase) {
  return discrepancy.discrepancyTypes.length > 1 ? "danger" : "warn";
}

export default function ComplianceDashboardPage() {
  const client = usePlatformAdminClient();
  const [snapshot, setSnapshot] = useState<SandboxComplianceOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const result = await loadSandboxComplianceOverview(client);
      setSnapshot(result);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [client]);

  const investigations = snapshot?.investigations ?? [];
  const takeoverReviews = snapshot?.takeoverReviews ?? [];
  const discrepancies = snapshot?.discrepancies ?? [];
  const legalHolds = snapshot?.legalHolds ?? [];
  const regulatoryReports = snapshot?.regulatoryReports ?? [];

  const discrepancyRows = useMemo<DiscrepancyRow[]>(
    () =>
      discrepancies.map((item) => ({
        ...item,
        linkedCaseId:
          findInvestigationForDiscrepancy(investigations, item.discrepancyCaseId)
            ?.caseId ?? null,
        tripId:
          takeoverReviews.find(
            (candidate) =>
              candidate.correlatedTakeoverCaseId === item.correlatedTakeoverCaseId,
          )?.orderId ?? null,
      })),
    [discrepancies, investigations, takeoverReviews],
  );

  const takeoverRows = useMemo<TakeoverRow[]>(
    () =>
      takeoverReviews.map((item) => ({
        ...item,
        tripId: item.orderId,
      })),
    [takeoverReviews],
  );

  const openInvestigations = investigations.filter((item) => item.status !== "closed");
  const activeHolds = legalHolds.filter((item) => item.status !== "released");
  const generatedReports = regulatoryReports.filter(
    (item) => item.status === "generated" || item.status === "submitted",
  );
  const manifestCount = uniqueManifestIds(investigations).length;

  const discrepancyColumns: CanvasTableColumn<DiscrepancyRow>[] = [
    {
      h: "Issue",
      r: (row) => (
        <div style={{ display: "grid", gap: 2 }}>
          <span style={{ fontWeight: 600 }}>{row.summary}</span>
          <span style={monoStyle}>{row.discrepancyCaseId}</span>
        </div>
      ),
    },
    {
      h: "Trip",
      w: 140,
      r: (row) =>
        row.tripId ? (
          <Link href={tripHref(row.tripId)} style={linkStyle}>
            {row.tripId}
          </Link>
        ) : (
          "—"
        ),
    },
    {
      h: "Severity",
      w: 120,
      r: (row) => (
        <CanvasPill theme={theme} tone={discrepancyTone(row)} dot>
          {row.discrepancyTypes.length > 1 ? "multi-source" : "review"}
        </CanvasPill>
      ),
    },
    {
      h: "Investigation",
      w: 140,
      r: (row) =>
        row.linkedCaseId ? (
          <Link href={`/platform-admin/investigations/${row.linkedCaseId}`} style={linkStyle}>
            {row.linkedCaseId}
          </Link>
        ) : (
          "Open in review queue"
        ),
    },
  ];

  const takeoverColumns: CanvasTableColumn<TakeoverRow>[] = [
    {
      h: "Review",
      r: (row) => (
        <div style={{ display: "grid", gap: 2 }}>
          <span style={{ fontWeight: 600 }}>{row.correlatedTakeoverCaseId}</span>
          <span style={monoStyle}>{row.vehicleId}</span>
        </div>
      ),
    },
    {
      h: "Match",
      w: 150,
      r: (row) => (
        <CanvasPill theme={theme} tone={row.matchedBy === "manual" ? "warn" : "accent"}>
          {row.matchedBy}
        </CanvasPill>
      ),
    },
    {
      h: "Trip",
      w: 140,
      r: (row) =>
        row.tripId ? (
          <Link href={tripHref(row.tripId)} style={linkStyle}>
            {row.tripId}
          </Link>
        ) : (
          "—"
        ),
    },
    {
      h: "Discrepancies",
      w: 120,
      r: (row) => (
        <CanvasPill
          theme={theme}
          tone={row.discrepancyCaseIds.length > 0 ? "warn" : "success"}
          dot
        >
          {row.discrepancyCaseIds.length}
        </CanvasPill>
      ),
    },
  ];

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title="實驗合規總覽 · Compliance Dashboard"
        subtitle="Compliance / investigation / evidence custody / regulatory reporting"
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <CanvasBtn theme={theme} variant="secondary" onClick={() => void load()}>
              Refresh
            </CanvasBtn>
            <Link href="/platform-admin/investigations" style={linkStyle}>
              Open investigations
            </Link>
          </div>
        }
      />
      <div style={pageBodyStyle}>
        {error ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            icon="warn"
            title="Compliance snapshot unavailable"
            body={error}
          />
        ) : null}

        <div style={kpiGridStyle}>
          <CanvasKPI
            theme={theme}
            label="Open investigations"
            value={String(openInvestigations.length)}
            sub="case routing"
          />
          <CanvasKPI
            theme={theme}
            label="Takeover reviews"
            value={String(takeoverReviews.length)}
            sub="correlated records"
          />
          <CanvasKPI
            theme={theme}
            label="Evidence manifests"
            value={String(manifestCount)}
            sub="sealed / linked"
          />
          <CanvasKPI
            theme={theme}
            label="Active holds"
            value={String(activeHolds.length)}
            sub="custody freeze"
          />
        </div>

        <div style={summaryGridStyle}>
          <CanvasCard
            theme={theme}
            title="合規違規旗標 · Open discrepancy queue"
            subtitle="Cross-source mismatch review"
            padding={0}
          >
            {discrepancyRows.length > 0 ? (
              <CanvasTable theme={theme} columns={discrepancyColumns} rows={discrepancyRows} />
            ) : (
              <div style={emptyStateStyle}>
                {loading ? "Loading discrepancy queue..." : "No open discrepancy cases."}
              </div>
            )}
          </CanvasCard>

          <CanvasCard
            theme={theme}
            title="調查中案件 · Open investigations"
            subtitle="Accident / regulator-facing cases"
          >
            {openInvestigations.length > 0 ? (
              <div style={listStyle}>
                {openInvestigations.slice(0, 6).map((item) => (
                  <div key={item.caseId} style={listRowStyle}>
                    <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 3 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 600 }}>{item.summary ?? item.caseId}</span>
                        <CanvasPill theme={theme} tone={accidentSeverityTone(item.severity)}>
                          {item.severity}
                        </CanvasPill>
                      </div>
                      <span style={monoStyle}>
                        {item.caseId} · {item.vehicleId} · reported {formatDateTime(item.reportedAt)}
                      </span>
                    </div>
                    <Link href={`/platform-admin/investigations/${item.caseId}`} style={linkStyle}>
                      Review
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <div style={emptyStateStyle}>
                {loading ? "Loading investigations..." : "No active investigation cases."}
              </div>
            )}
          </CanvasCard>
        </div>

        <div style={secondaryGridStyle}>
          <CanvasCard
            theme={theme}
            title="接管審查 · Takeover review"
            subtitle="Correlated Tesla / ROC / operator takeover stream"
            padding={0}
          >
            {takeoverRows.length > 0 ? (
              <CanvasTable theme={theme} columns={takeoverColumns} rows={takeoverRows} />
            ) : (
              <div style={emptyStateStyle}>
                {loading ? "Loading takeover reviews..." : "No takeover reviews are available."}
              </div>
            )}
          </CanvasCard>

          <div style={stackStyle}>
            <CanvasCard theme={theme} title="Evidence governance">
              <CanvasDL
                theme={theme}
                cols={1}
                items={[
                  {
                    k: "Active legal holds",
                    v:
                      activeHolds.length > 0 ? (
                        <CanvasPill theme={theme} tone="warn" dot>
                          {activeHolds.length} active
                        </CanvasPill>
                      ) : (
                        "0"
                      ),
                    mono: false,
                  },
                  {
                    k: "Pending controlled exports",
                    v: String(
                      snapshot?.controlledExports.filter(
                        (item) => item.status === "pending_approval",
                      ).length ?? 0,
                    ),
                    mono: true,
                  },
                  {
                    k: "Latest hold",
                    v: activeHolds[0]?.holdId ?? "—",
                    mono: true,
                  },
                ]}
              />
            </CanvasCard>

            <CanvasCard theme={theme} title="Regulatory jobs">
              {generatedReports.length > 0 ? (
                <div style={listStyle}>
                  {generatedReports.slice(0, 4).map((item) => (
                    <div key={item.reportId} style={listRowStyle}>
                      <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 3 }}>
                        <span style={{ fontWeight: 600 }}>{item.reportType}</span>
                        <span style={monoStyle}>
                          {item.reportId} · {formatDateTime(item.generatedAt ?? item.submittedAt ?? "")}
                        </span>
                      </div>
                      <CanvasPill theme={theme} tone={reportStatusTone(item.status)} dot>
                        {item.status}
                      </CanvasPill>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={emptyStateStyle}>
                  {loading ? "Loading report jobs..." : "No regulatory report jobs are queued."}
                </div>
              )}
            </CanvasCard>

            {snapshot ? (
              <CanvasCard theme={theme} title="Trip review focus">
                {takeoverRows[0]?.tripId ? (
                  <div style={listStyle}>
                    {buildTripComplianceChecks({
                      tripId: takeoverRows[0].tripId,
                      investigations,
                      takeoverReviews,
                      discrepancies,
                      legalHolds,
                    }).map((item) => (
                      <div key={item.label} style={listRowStyle}>
                        <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 3 }}>
                          <span style={{ fontWeight: 600 }}>{item.label}</span>
                          <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
                            {item.detail}
                          </span>
                        </div>
                        <CanvasPill theme={theme} tone={item.passed ? "success" : "warn"}>
                          {item.passed ? "pass" : "review"}
                        </CanvasPill>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={emptyStateStyle}>No trip-level review sample is available yet.</div>
                )}
              </CanvasCard>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
