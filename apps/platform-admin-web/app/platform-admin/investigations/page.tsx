"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import {
  accidentSeverityTone,
  findInvestigationForDiscrepancy,
  findTakeoverReview,
  focusBannerText,
  investigationStatusTone,
  loadSandboxComplianceOverview,
  manifestHref,
  tripHref,
  type SandboxComplianceOverview,
} from "@/lib/sandbox-compliance";
import type {
  AccidentCaseRecord,
  CorrelatedTakeoverCase,
  EvidenceDiscrepancyCase,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  buildCanvasTheme,
  type CanvasTableColumn,
} from "@drts/ui-web";

type InvestigationRow = AccidentCaseRecord;
type TakeoverRow = CorrelatedTakeoverCase;
type DiscrepancyRow = EvidenceDiscrepancyCase & {
  linkedCaseId: string | null;
};

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

const topGridStyle: CSSProperties = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "minmax(0, 1.2fr) minmax(320px, 0.8fr)",
  alignItems: "start",
};

const lowerGridStyle: CSSProperties = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  alignItems: "start",
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

const linkStyle: CSSProperties = {
  color: theme.accent,
  textDecoration: "none",
  fontWeight: 600,
  fontSize: 12.5,
};

function discrepancyTone(item: EvidenceDiscrepancyCase) {
  return item.discrepancyTypes.length > 1 ? "danger" : "warn";
}

export default function InvestigationsPage() {
  const client = usePlatformAdminClient();
  const searchParams = useSearchParams();
  const [snapshot, setSnapshot] = useState<SandboxComplianceOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const takeoverCaseId = searchParams.get("takeoverCaseId");
  const discrepancyCaseId = searchParams.get("discrepancyCaseId");

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

  const selectedTakeover = useMemo(
    () =>
      takeoverCaseId
        ? findTakeoverReview(takeoverReviews, takeoverCaseId) ?? null
        : null,
    [takeoverCaseId, takeoverReviews],
  );
  const selectedDiscrepancy = useMemo(
    () =>
      discrepancyCaseId
        ? discrepancies.find((item) => item.discrepancyCaseId === discrepancyCaseId) ??
          null
        : null,
    [discrepancyCaseId, discrepancies],
  );
  const selectedInvestigation = useMemo(() => {
    if (selectedDiscrepancy) {
      return (
        findInvestigationForDiscrepancy(
          investigations,
          selectedDiscrepancy.discrepancyCaseId,
        ) ?? null
      );
    }
    if (selectedTakeover?.orderId) {
      return (
        investigations.find((item) => item.orderId === selectedTakeover.orderId) ??
        null
      );
    }
    return null;
  }, [investigations, selectedDiscrepancy, selectedTakeover]);

  const bannerText = focusBannerText({
    takeoverCaseId,
    discrepancyCaseId,
    takeoverReview: selectedTakeover,
    discrepancy: selectedDiscrepancy,
  });

  const investigationColumns: CanvasTableColumn<InvestigationRow>[] = [
    {
      h: "Case",
      r: (row) => (
        <div style={{ display: "grid", gap: 2 }}>
          <span style={{ fontWeight: 600 }}>{row.summary ?? row.caseId}</span>
          <span style={monoStyle}>{row.caseId}</span>
        </div>
      ),
    },
    {
      h: "Trip",
      w: 140,
      r: (row) =>
        row.orderId ? (
          <Link href={tripHref(row.orderId)} style={linkStyle}>
            {row.orderId}
          </Link>
        ) : (
          "—"
        ),
    },
    {
      h: "Status",
      w: 140,
      r: (row) => (
        <CanvasPill theme={theme} tone={investigationStatusTone(row.status)} dot>
          {row.status}
        </CanvasPill>
      ),
    },
    {
      h: "Severity",
      w: 110,
      r: (row) => (
        <CanvasPill theme={theme} tone={accidentSeverityTone(row.severity)}>
          {row.severity}
        </CanvasPill>
      ),
    },
    {
      h: "Evidence",
      w: 140,
      r: (row) =>
        row.evidenceManifestId ? (
          <Link href={manifestHref(row.evidenceManifestId)} style={linkStyle}>
            {row.evidenceManifestId}
          </Link>
        ) : (
          "Pending"
        ),
    },
    {
      h: "",
      w: 120,
      r: (row) => (
        <Link href={`/platform-admin/investigations/${row.caseId}`} style={linkStyle}>
          Open case
        </Link>
      ),
    },
  ];

  const takeoverColumns: CanvasTableColumn<TakeoverRow>[] = [
    {
      h: "Correlated takeover",
      r: (row) => (
        <div style={{ display: "grid", gap: 2 }}>
          <span style={{ fontWeight: 600 }}>{row.correlatedTakeoverCaseId}</span>
          <span style={monoStyle}>{row.vehicleId}</span>
        </div>
      ),
    },
    {
      h: "Trip",
      w: 140,
      r: (row) =>
        row.orderId ? (
          <Link href={tripHref(row.orderId)} style={linkStyle}>
            {row.orderId}
          </Link>
        ) : (
          "—"
        ),
    },
    {
      h: "Match",
      w: 160,
      r: (row) => (
        <CanvasPill theme={theme} tone={row.matchedBy === "manual" ? "warn" : "accent"}>
          {row.matchedBy}
        </CanvasPill>
      ),
    },
    {
      h: "Investigation",
      w: 120,
      r: (row) =>
        row.orderId && investigations.find((item) => item.orderId === row.orderId) ? (
          <CanvasPill theme={theme} tone="success" dot>
            linked
          </CanvasPill>
        ) : (
          <CanvasPill theme={theme} tone="neutral">
            queue
          </CanvasPill>
        ),
    },
  ];

  const discrepancyColumns: CanvasTableColumn<DiscrepancyRow>[] = [
    {
      h: "Discrepancy",
      r: (row) => (
        <div style={{ display: "grid", gap: 2 }}>
          <span style={{ fontWeight: 600 }}>{row.summary}</span>
          <span style={monoStyle}>{row.discrepancyCaseId}</span>
        </div>
      ),
    },
    {
      h: "Opened",
      w: 150,
      r: (row) => formatDateTime(row.openedAt),
    },
    {
      h: "Types",
      w: 160,
      r: (row) => (
        <CanvasPill theme={theme} tone={discrepancyTone(row)} dot>
          {row.discrepancyTypes.join(", ")}
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
          "Pending case"
        ),
    },
  ];

  const discrepancyRows = discrepancies.map((item) => ({
    ...item,
    linkedCaseId:
      findInvestigationForDiscrepancy(investigations, item.discrepancyCaseId)?.caseId ??
      null,
  }));

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title="調查工作台 · Investigations"
        subtitle="ROC deep-links land here with backend-provided takeover or discrepancy identifiers"
        actions={
          <CanvasBtn theme={theme} variant="secondary" onClick={() => void load()}>
            Refresh
          </CanvasBtn>
        }
      />
      <div style={pageBodyStyle}>
        {bannerText ? (
          <CanvasBanner
            theme={theme}
            tone={selectedTakeover || selectedDiscrepancy ? "info" : "warn"}
            icon={selectedTakeover || selectedDiscrepancy ? "info" : "warn"}
            title="ROC investigation deep-link"
            body={bannerText}
          />
        ) : null}
        {error ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            icon="warn"
            title="Investigation workspace unavailable"
            body={error}
          />
        ) : null}

        <div style={topGridStyle}>
          <CanvasCard
            theme={theme}
            title="Investigation queue"
            subtitle="Accident / compliance cases"
            padding={0}
          >
            {investigations.length > 0 ? (
              <CanvasTable
                theme={theme}
                columns={investigationColumns}
                rows={investigations}
              />
            ) : (
              <div style={emptyStateStyle}>
                {loading ? "Loading investigations..." : "No investigation cases are open."}
              </div>
            )}
          </CanvasCard>

          <CanvasCard
            theme={theme}
            title="Deep-link focus"
            subtitle="Selected takeover / discrepancy context"
          >
            {selectedTakeover || selectedDiscrepancy ? (
              <CanvasDL
                theme={theme}
                cols={1}
                items={[
                  {
                    k: "Takeover",
                    v: selectedTakeover?.correlatedTakeoverCaseId ?? "—",
                    mono: true,
                  },
                  {
                    k: "Discrepancy",
                    v: selectedDiscrepancy?.discrepancyCaseId ?? "—",
                    mono: true,
                  },
                  {
                    k: "Trip",
                    v:
                      selectedTakeover?.orderId ??
                      selectedInvestigation?.orderId ??
                      "—",
                    mono: true,
                  },
                  {
                    k: "Linked investigation",
                    v: selectedInvestigation?.caseId ?? "Not opened yet",
                    mono: !selectedInvestigation,
                  },
                ]}
              />
            ) : (
              <div style={emptyStateStyle}>
                Open this route from ROC with `takeoverCaseId` or `discrepancyCaseId`
                to pin a specific review.
              </div>
            )}
            {selectedInvestigation ? (
              <div style={{ marginTop: 12 }}>
                <Link
                  href={`/platform-admin/investigations/${selectedInvestigation.caseId}`}
                  style={linkStyle}
                >
                  Open linked investigation
                </Link>
              </div>
            ) : null}
          </CanvasCard>
        </div>

        <div style={lowerGridStyle}>
          <CanvasCard
            theme={theme}
            title="Takeover review stream"
            subtitle="Backend-correlated ROC / Tesla / operator records"
            padding={0}
          >
            {takeoverReviews.length > 0 ? (
              <CanvasTable theme={theme} columns={takeoverColumns} rows={takeoverReviews} />
            ) : (
              <div style={emptyStateStyle}>
                {loading ? "Loading takeover correlations..." : "No takeover reviews found."}
              </div>
            )}
          </CanvasCard>

          <CanvasCard
            theme={theme}
            title="Evidence discrepancies"
            subtitle="Mismatch queue driving investigation review"
            padding={0}
          >
            {discrepancyRows.length > 0 ? (
              <CanvasTable
                theme={theme}
                columns={discrepancyColumns}
                rows={discrepancyRows}
              />
            ) : (
              <div style={emptyStateStyle}>
                {loading ? "Loading discrepancy queue..." : "No discrepancy review is pending."}
              </div>
            )}
          </CanvasCard>
        </div>
      </div>
    </>
  );
}
