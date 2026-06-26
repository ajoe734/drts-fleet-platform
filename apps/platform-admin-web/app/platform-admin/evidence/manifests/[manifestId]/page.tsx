"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import {
  custodyStateTone,
  sourceLabel,
  sourceTone,
  truncateHash,
} from "@/lib/sandbox-compliance";
import type { SandboxEvidenceManifestView } from "@drts/contracts";
import {
  CanvasBanner,
  CanvasCard,
  CanvasDL,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  buildCanvasTheme,
  type CanvasTableColumn,
} from "@drts/ui-web";

type ManifestRow = SandboxEvidenceManifestView["items"][number];

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "grid",
  gap: 16,
  width: "100%",
  maxWidth: 1280,
  margin: "0 auto",
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "minmax(0, 1.2fr) minmax(320px, 0.8fr)",
  alignItems: "start",
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

export default function EvidenceManifestPage() {
  const client = usePlatformAdminClient();
  const params = useParams<{ manifestId: string }>();
  const manifestId = decodeURIComponent(
    Array.isArray(params.manifestId)
      ? (params.manifestId[0] ?? "")
      : (params.manifestId ?? ""),
  );
  const [manifest, setManifest] = useState<SandboxEvidenceManifestView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!manifestId) {
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const result = await client.getSandboxEvidenceManifest(manifestId);
        if (!cancelled) {
          setManifest(result.item);
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
  }, [client, manifestId]);

  const rows = useMemo(() => manifest?.items ?? [], [manifest]);

  const columns: CanvasTableColumn<ManifestRow>[] = [
    {
      h: "Artifact",
      r: (row) => (
        <div style={{ display: "grid", gap: 2 }}>
          <span style={{ fontWeight: 600 }}>{row.artifactType}</span>
          <span style={monoStyle}>{row.artifactId}</span>
        </div>
      ),
    },
    {
      h: "Source",
      w: 160,
      r: (row) => (
        <CanvasPill theme={theme} tone={sourceTone(row.source.sourceSystem)}>
          {sourceLabel(row.source.sourceSystem)}
        </CanvasPill>
      ),
    },
    {
      h: "SHA-256",
      w: 140,
      r: (row) => <span style={monoStyle}>{truncateHash(row.checksumSha256, 14)}</span>,
    },
    {
      h: "Captured",
      w: 170,
      r: (row) => formatDateTime(row.capturedAt),
    },
    {
      h: "Custody",
      w: 110,
      r: (row) => (
        <CanvasPill theme={theme} tone={custodyStateTone(row.custodyState)} dot>
          {row.custodyState}
        </CanvasPill>
      ),
    },
  ];

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={manifest ? `${manifest.manifestId} · Evidence Manifest` : manifestId}
        subtitle="Append-only custody view with backend-provided provenance"
      />
      <div style={pageBodyStyle}>
        {error ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            icon="warn"
            title="Evidence manifest unavailable"
            body={error}
          />
        ) : null}
        {!error && manifest?.knownGapCount ? (
          <CanvasBanner
            theme={theme}
            tone="warn"
            icon="warn"
            title="Provider coverage gap declared"
            body={`${manifest.knownGapCount} manifest item(s) were recorded with explicit gap handling. The UI does not infer missing provider evidence.`}
          />
        ) : null}

        <div style={summaryGridStyle}>
          <CanvasCard theme={theme} title="Manifest items" subtitle="Evidence bundle line items" padding={0}>
            {rows.length > 0 ? (
              <CanvasTable theme={theme} columns={columns} rows={rows} />
            ) : (
              <div style={emptyStateStyle}>
                {loading ? "Loading manifest items..." : "No evidence items are indexed for this manifest."}
              </div>
            )}
          </CanvasCard>

          <CanvasCard theme={theme} title="Custody summary">
            {manifest ? (
              <CanvasDL
                theme={theme}
                cols={1}
                items={[
                  { k: "Vehicle", v: manifest.vehicleId, mono: true },
                  { k: "Case", v: manifest.caseId ?? "—", mono: true },
                  { k: "Window start", v: formatDateTime(manifest.windowStart), mono: false },
                  { k: "Window end", v: formatDateTime(manifest.windowEnd), mono: false },
                  { k: "Item count", v: String(manifest.itemCount), mono: true },
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
              <div style={emptyStateStyle}>No manifest summary is loaded.</div>
            )}
          </CanvasCard>
        </div>
      </div>
    </>
  );
}
