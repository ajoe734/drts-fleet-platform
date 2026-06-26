"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import {
  confidenceTone,
  custodyStateTone,
  loadSandboxInvestigationDetail,
  sourceLabel,
  sourceTone,
} from "@/lib/sandbox-compliance";
import type {
  AccidentCaseRecord,
  AccidentTimelineEntry,
  SandboxEvidenceManifestView,
} from "@drts/contracts";
import {
  CanvasBanner,
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

const shellGridStyle: CSSProperties = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "minmax(0, 1.45fr) minmax(320px, 0.85fr)",
  alignItems: "start",
};

const videoGridStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
};

const videoPaneStyle: CSSProperties = {
  minHeight: 180,
  borderRadius: 10,
  border: `1px solid ${theme.border}`,
  background: theme.surfaceLo,
  display: "grid",
  placeItems: "center",
  color: theme.textMuted,
  fontSize: 12.5,
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

const trackRowStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  paddingBottom: 10,
  borderBottom: `1px solid ${theme.border}`,
};

const trackBarStyle = (filled: boolean): CSSProperties => ({
  height: 14,
  borderRadius: 7,
  border: `1px solid ${filled ? theme.accentBorder : theme.warnBorder}`,
  background: filled ? theme.accentBg : theme.warnBg,
});

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

export default function InvestigationTimelinePage() {
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

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!caseId) {
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const result = await loadSandboxInvestigationDetail(client, caseId);
        if (cancelled) {
          return;
        }
        setInvestigation(result.investigation);
        setTimeline(
          [...result.timeline].sort((left, right) =>
            left.occurredAt.localeCompare(right.occurredAt),
          ),
        );
        setManifest(result.manifest);
      } catch (loadError: unknown) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [caseId, client]);

  const trackItems = useMemo(() => manifest?.items ?? [], [manifest]);

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={investigation ? `${investigation.caseId} · Synchronized Timeline` : caseId}
        subtitle="Aligned investigation facts, evidence tracks, and manifest provenance"
        actions={
          caseId ? (
            <Link href={`/platform-admin/investigations/${encodeURIComponent(caseId)}`} style={{ color: theme.accent, textDecoration: "none", fontWeight: 600, fontSize: 12.5 }}>
              Back to case
            </Link>
          ) : undefined
        }
      />
      <div style={pageBodyStyle}>
        {error ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            icon="warn"
            title="Timeline unavailable"
            body={error}
          />
        ) : null}
        {!error && !manifest ? (
          <CanvasBanner
            theme={theme}
            tone="warn"
            icon="warn"
            title="Evidence track coverage incomplete"
            body="No evidence manifest is linked yet, so the synchronized track panel only shows timeline facts."
          />
        ) : null}

        <div style={shellGridStyle}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <CanvasCard
              theme={theme}
              title="Aligned panes"
              subtitle="Two capture panes plus manifest-backed evidence tracks"
            >
              <div style={videoGridStyle}>
                <div style={videoPaneStyle}>Front capture pane</div>
                <div style={videoPaneStyle}>Cabin capture pane</div>
              </div>
              {trackItems.length > 0 ? (
                <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                  {trackItems.map((item) => (
                    <div key={item.artifactId} style={trackRowStyle}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 600 }}>{item.artifactType}</span>
                        <CanvasPill theme={theme} tone={sourceTone(item.source.sourceSystem)}>
                          {sourceLabel(item.source.sourceSystem)}
                        </CanvasPill>
                        <CanvasPill theme={theme} tone={custodyStateTone(item.custodyState)} dot>
                          {item.custodyState}
                        </CanvasPill>
                      </div>
                      <div style={trackBarStyle(item.custodyState !== "captured")} />
                      <span style={monoStyle}>
                        {item.artifactId} · captured {formatDateTime(item.capturedAt)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={emptyStateStyle}>
                  {loading ? "Loading evidence tracks..." : "No evidence tracks are sealed for this case yet."}
                </div>
              )}
            </CanvasCard>

            <CanvasCard theme={theme} title="Event stream" subtitle="Cross-actor timeline facts">
              {timeline.length > 0 ? (
                <div style={timelineListStyle}>
                  {timeline.map((item) => (
                    <div key={item.entryId} style={timelineRowStyle}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 600 }}>{item.label}</span>
                        <CanvasPill theme={theme} tone={confidenceTone(item.confidence)}>
                          {item.confidence}
                        </CanvasPill>
                      </div>
                      <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
                        {formatDateTime(item.occurredAt)} · {item.sourceSystem}
                      </span>
                      <span style={monoStyle}>{item.factKey}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={emptyStateStyle}>
                  {loading ? "Loading event stream..." : "No timeline facts are recorded yet."}
                </div>
              )}
            </CanvasCard>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <CanvasCard theme={theme} title="Investigation summary">
              {investigation ? (
                <CanvasDL
                  theme={theme}
                  cols={1}
                  items={[
                    { k: "Case", v: investigation.caseId, mono: true },
                    { k: "Vehicle", v: investigation.vehicleId, mono: true },
                    { k: "Trip", v: investigation.orderId ?? "—", mono: true },
                    {
                      k: "Discrepancies",
                      v: String(investigation.discrepancyCaseIds.length),
                      mono: true,
                    },
                    {
                      k: "External documents",
                      v: String(investigation.externalDocumentIds.length),
                      mono: true,
                    },
                  ]}
                />
              ) : (
                <div style={emptyStateStyle}>No investigation record loaded.</div>
              )}
            </CanvasCard>

            <CanvasCard theme={theme} title="Evidence manifest">
              {manifest ? (
                <CanvasDL
                  theme={theme}
                  cols={1}
                  items={[
                    { k: "Manifest", v: manifest.manifestId, mono: true },
                    { k: "Window start", v: formatDateTime(manifest.windowStart), mono: false },
                    { k: "Window end", v: formatDateTime(manifest.windowEnd), mono: false },
                    {
                      k: "Known gaps",
                      v: String(manifest.knownGapCount),
                      mono: true,
                    },
                  ]}
                />
              ) : (
                <div style={emptyStateStyle}>No manifest is attached to this timeline yet.</div>
              )}
            </CanvasCard>
          </div>
        </div>
      </div>
    </>
  );
}
