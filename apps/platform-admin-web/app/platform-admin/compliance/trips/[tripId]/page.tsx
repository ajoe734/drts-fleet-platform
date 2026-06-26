"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import {
  buildTripComplianceChecks,
  loadSandboxComplianceOverview,
  manifestHref,
  tripDiscrepancies,
  tripInvestigations,
  tripTakeoverReviews,
  type SandboxComplianceOverview,
} from "@/lib/sandbox-compliance";
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

const heroGridStyle: CSSProperties = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "minmax(0, 1.25fr) minmax(320px, 0.85fr)",
  alignItems: "start",
};

const checkListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const checkRowStyle: CSSProperties = {
  display: "flex",
  gap: 12,
  alignItems: "flex-start",
  paddingBottom: 12,
  borderBottom: `1px solid ${theme.border}`,
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

export default function TripComplianceDetailPage() {
  const client = usePlatformAdminClient();
  const params = useParams<{ tripId: string }>();
  const tripId = decodeURIComponent(
    Array.isArray(params.tripId) ? (params.tripId[0] ?? "") : (params.tripId ?? ""),
  );
  const [snapshot, setSnapshot] = useState<SandboxComplianceOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!tripId) {
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const result = await loadSandboxComplianceOverview(client);
        if (!cancelled) {
          setSnapshot(result);
        }
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
  }, [client, tripId]);

  const investigations = useMemo(
    () => tripInvestigations(snapshot?.investigations ?? [], tripId),
    [snapshot, tripId],
  );
  const takeoverReviews = useMemo(
    () => tripTakeoverReviews(snapshot?.takeoverReviews ?? [], tripId),
    [snapshot, tripId],
  );
  const discrepancies = useMemo(
    () =>
      tripDiscrepancies(
        snapshot?.discrepancies ?? [],
        snapshot?.takeoverReviews ?? [],
        tripId,
      ),
    [snapshot, tripId],
  );

  const investigation = investigations[0] ?? null;
  const manifestId = investigation?.evidenceManifestId ?? null;
  const checks = snapshot
    ? buildTripComplianceChecks({
        tripId,
        investigations: snapshot.investigations,
        takeoverReviews: snapshot.takeoverReviews,
        discrepancies: snapshot.discrepancies,
        legalHolds: snapshot.legalHolds,
      })
    : [];

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={`行程合規 · ${tripId}`}
        subtitle="Trip compliance detail derived from investigation, takeover review, and evidence custody records"
        actions={
          investigation ? (
            <Link href={`/platform-admin/investigations/${investigation.caseId}`} style={linkStyle}>
              Open investigation
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
            title="Trip compliance detail unavailable"
            body={error}
          />
        ) : null}
        {!error && !takeoverReviews.length && !investigations.length ? (
          <CanvasBanner
            theme={theme}
            tone="warn"
            icon="warn"
            title="Trip review not yet correlated"
            body={`No takeover review or investigation is currently linked to trip ${tripId}.`}
          />
        ) : null}

        <div style={heroGridStyle}>
          <CanvasCard theme={theme} title="Compliance checks" subtitle="Route-level investigation readiness">
            {checks.length > 0 ? (
              <div style={checkListStyle}>
                {checks.map((item) => (
                  <div key={item.label} style={checkRowStyle}>
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
              <div style={emptyStateStyle}>
                {loading ? "Loading compliance checks..." : "No trip compliance checks are available."}
              </div>
            )}
          </CanvasCard>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <CanvasCard theme={theme} title="Trip summary">
              <CanvasDL
                theme={theme}
                cols={1}
                items={[
                  { k: "Trip", v: tripId, mono: true },
                  { k: "Takeover reviews", v: String(takeoverReviews.length), mono: true },
                  { k: "Discrepancies", v: String(discrepancies.length), mono: true },
                  { k: "Investigations", v: String(investigations.length), mono: true },
                ]}
              />
            </CanvasCard>

            <CanvasCard theme={theme} title="Evidence sources">
              {investigation ? (
                <CanvasDL
                  theme={theme}
                  cols={1}
                  items={[
                    { k: "Case", v: investigation.caseId, mono: true },
                    {
                      k: "Manifest",
                      v: manifestId ? (
                        <Link href={manifestHref(manifestId)} style={linkStyle}>
                          {manifestId}
                        </Link>
                      ) : (
                        "Pending"
                      ),
                      mono: !manifestId,
                    },
                    {
                      k: "Reported at",
                      v: formatDateTime(investigation.reportedAt),
                      mono: false,
                    },
                    {
                      k: "Correlation",
                      v: investigation.takeoverCorrelationId ?? "—",
                      mono: true,
                    },
                  ]}
                />
              ) : (
                <div style={emptyStateStyle}>No investigation case is linked to this trip yet.</div>
              )}
            </CanvasCard>

            {takeoverReviews[0] ? (
              <CanvasCard theme={theme} title="Latest correlated takeover">
                <div style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontWeight: 600 }}>
                    {takeoverReviews[0].correlatedTakeoverCaseId}
                  </span>
                  <span style={monoStyle}>{takeoverReviews[0].vehicleId}</span>
                  <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
                    Safety report at{" "}
                    {formatDateTime(
                      takeoverReviews[0].sourceTimestamps.safetyOccurredAt,
                    )}
                  </span>
                </div>
              </CanvasCard>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
