"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import {
  confidenceTone,
  custodyStateTone,
  loadSandboxInvestigationDetail,
  manifestHref,
} from "@/lib/sandbox-compliance";
import type {
  AccidentCaseRecord,
  AccidentTimelineEntry,
  SandboxEvidenceManifestView,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasPageHeader,
  CanvasPill,
  buildCanvasTheme,
} from "@drts/ui-web";

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
  gridTemplateColumns: "minmax(0, 1.3fr) minmax(320px, 0.9fr)",
  alignItems: "start",
};

const timelineListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const timelineRowStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  paddingBottom: 12,
  borderBottom: `1px solid ${theme.border}`,
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

const emptyStateStyle: CSSProperties = {
  color: theme.textMuted,
  fontSize: 12.5,
  padding: "28px 16px",
  textAlign: "center",
};

export default function InvestigationDetailPage() {
  const client = usePlatformAdminClient();
  const params = useParams<{ caseId: string }>();
  const caseId = decodeURIComponent(
    Array.isArray(params.caseId) ? (params.caseId[0] ?? "") : (params.caseId ?? ""),
  );

  const [investigation, setInvestigation] = useState<AccidentCaseRecord | null>(null);
  const [timeline, setTimeline] = useState<AccidentTimelineEntry[]>([]);
  const [manifest, setManifest] = useState<SandboxEvidenceManifestView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!caseId) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await loadSandboxInvestigationDetail(client, caseId);
      setInvestigation(result.investigation);
      setTimeline(result.timeline);
      setManifest(result.manifest);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [caseId, client]);

  const recentTimeline = useMemo(
    () => [...timeline].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)).slice(0, 6),
    [timeline],
  );

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={investigation ? `${investigation.caseId} · Investigation` : caseId || "Investigation"}
        subtitle={
          investigation
            ? `${investigation.summary ?? "Accident case"} · ${investigation.vehicleId} · ${formatDateTime(investigation.reportedAt)}`
            : "Accident investigation detail"
        }
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <CanvasBtn theme={theme} variant="secondary" onClick={() => void load()}>
              Refresh
            </CanvasBtn>
            {caseId ? (
              <Link href={`/platform-admin/investigations/${encodeURIComponent(caseId)}/timeline`} style={linkStyle}>
                Timeline
              </Link>
            ) : null}
          </div>
        }
      />
      <div style={pageBodyStyle}>
        {error ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            icon="warn"
            title="Investigation detail unavailable"
            body={error}
          />
        ) : null}
        {!error && !manifest && investigation?.evidenceManifestId ? (
          <CanvasBanner
            theme={theme}
            tone="warn"
            icon="warn"
            title="Evidence manifest unresolved"
            body={`Manifest ${investigation.evidenceManifestId} is linked to this case but could not be loaded.`}
          />
        ) : null}

        <div style={heroGridStyle}>
          <CanvasCard
            theme={theme}
            title="Case timeline preview"
            subtitle="Recent cross-actor facts"
          >
            {recentTimeline.length > 0 ? (
              <div style={timelineListStyle}>
                {recentTimeline.map((item) => (
                  <div key={item.entryId} style={timelineRowStyle}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 600 }}>{item.label}</span>
                      <CanvasPill theme={theme} tone={confidenceTone(item.confidence)}>
                        {item.confidence}
                      </CanvasPill>
                    </div>
                    <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
                      {formatDateTime(item.occurredAt)} · {item.factKey}
                    </span>
                    <span style={monoStyle}>
                      {typeof item.value === "string" || typeof item.value === "number"
                        ? String(item.value)
                        : JSON.stringify(item.value)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={emptyStateStyle}>
                {loading ? "Loading case timeline..." : "No case timeline facts are recorded yet."}
              </div>
            )}
            {caseId ? (
              <div style={{ marginTop: 12 }}>
                <Link
                  href={`/platform-admin/investigations/${encodeURIComponent(caseId)}/timeline`}
                  style={linkStyle}
                >
                  Open synchronized timeline
                </Link>
              </div>
            ) : null}
          </CanvasCard>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <CanvasCard theme={theme} title="Case record">
              {investigation ? (
                <CanvasDL
                  theme={theme}
                  cols={1}
                  items={[
                    { k: "Case ID", v: investigation.caseId, mono: true },
                    { k: "Vehicle", v: investigation.vehicleId, mono: true },
                    { k: "Trip", v: investigation.orderId ?? "—", mono: true },
                    {
                      k: "Takeover correlation",
                      v: investigation.takeoverCorrelationId ?? "—",
                      mono: true,
                    },
                    {
                      k: "Regulatory report",
                      v: investigation.regulatoryReportId ?? "Pending",
                      mono: !investigation.regulatoryReportId,
                    },
                  ]}
                />
              ) : (
                <div style={emptyStateStyle}>
                  {loading ? "Loading case record..." : "No case record loaded."}
                </div>
              )}
            </CanvasCard>

            <CanvasCard theme={theme} title="Evidence custody">
              {manifest ? (
                <CanvasDL
                  theme={theme}
                  cols={1}
                  items={[
                    { k: "Manifest", v: manifest.manifestId, mono: true },
                    { k: "Items", v: String(manifest.itemCount), mono: true },
                    {
                      k: "Custody state",
                      v: (
                        <CanvasPill theme={theme} tone={custodyStateTone(manifest.custodyState)} dot>
                          {manifest.custodyState}
                        </CanvasPill>
                      ),
                      mono: false,
                    },
                    {
                      k: "Legal hold",
                      v: manifest.legalHoldActive ? (
                        <CanvasPill theme={theme} tone="warn" dot>
                          active
                        </CanvasPill>
                      ) : (
                        "None"
                      ),
                      mono: false,
                    },
                  ]}
                />
              ) : (
                <div style={emptyStateStyle}>No evidence manifest is linked to this case.</div>
              )}
              {manifest ? (
                <div style={{ marginTop: 12 }}>
                  <Link href={manifestHref(manifest.manifestId)} style={linkStyle}>
                    Open evidence manifest
                  </Link>
                </div>
              ) : null}
            </CanvasCard>
          </div>
        </div>
      </div>
    </>
  );
}
