"use client";

import { useCallback, useState, type CSSProperties } from "react";
import Link from "next/link";
import { usePlatformAdminClient } from "@/lib/admin-client";
import type { DriverRatingSummary } from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasPageHeader,
  CanvasPill,
  buildCanvasTheme,
  type CanvasDLItem,
} from "@drts/ui-web";

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });

const pageStyle: CSSProperties = {
  padding: 24,
  display: "grid",
  gap: 16,
  maxWidth: 1000,
  margin: "0 auto",
};

const inputStyle: CSSProperties = {
  border: `1px solid ${theme.border}`,
  borderRadius: 8,
  padding: "8px 12px",
  background: theme.bgRaised,
  color: theme.text,
  fontSize: 13,
  minWidth: 260,
};

export default function DriverRatingAuthorityPage() {
  const client = usePlatformAdminClient();

  const [driverIdInput, setDriverIdInput] = useState("");
  const [summary, setSummary] = useState<DriverRatingSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAuthority = useCallback(
    async (driverId: string) => {
      if (!driverId.trim()) return;
      setLoading(true);
      setError(null);
      try {
        const envelope = await client.request<any>(
          `/api/v1/platform-admin/multi-taxi/drivers/${encodeURIComponent(
            driverId.trim(),
          )}/rating-authority`,
        );
        const data = envelope?.data;
        if (data) {
          setSummary(data);
        } else {
          setError("No rating authority record found for driver.");
        }
      } catch (err: any) {
        setError(err?.message || "Failed to fetch driver rating authority");
      } finally {
        setLoading(false);
      }
    },
    [client],
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchAuthority(driverIdInput);
  };

  const dlItems: CanvasDLItem[] = summary
    ? [
        { label: "Driver ID", value: summary.driverId },
        {
          label: "Display State",
          value: (
            <CanvasPill
              tone={
                summary.displayState === "rated"
                  ? "success"
                  : summary.displayState === "new_driver"
                    ? "info"
                    : "warn"
              }
            >
              {summary.displayState}
            </CanvasPill>
          ),
        },
        {
          label: "Average Rating",
          value:
            summary.averageRating !== null
              ? `★ ${summary.averageRating}`
              : "new_driver (No ratings)",
        },
        { label: "Active Rating Count", value: String(summary.ratingCount) },
        {
          label: "Last Rated At",
          value: summary.lastRatedAt
            ? new Date(summary.lastRatedAt).toLocaleString()
            : "—",
        },
        { label: "Aggregate Version", value: String(summary.aggregateVersion) },
        {
          label: "Calculated At",
          value: new Date(summary.calculatedAt).toLocaleString(),
        },
      ]
    : [];

  return (
    <div style={pageStyle} data-testid="p5-rate-ui-03">
      <CanvasPageHeader
        title="Driver Rating Authority Query"
        subtitle="Lookup authoritative driver rating summary, display state (rated / new_driver / unavailable), and aggregate version."
        actions={
          <Link href="/p5-ratings">
            <CanvasBtn variant="secondary">Back to Rating Queue</CanvasBtn>
          </Link>
        }
      />

      {error && (
        <CanvasBanner tone="danger" title="Authority Query Error">
          {error}
        </CanvasBanner>
      )}

      <CanvasCard title="Search Driver Authority">
        <form
          onSubmit={handleSearch}
          style={{ display: "flex", gap: 12, alignItems: "center" }}
        >
          <div>
            <label
              style={{
                display: "block",
                fontSize: 11,
                color: theme.textMuted,
                marginBottom: 4,
              }}
            >
              Driver ID
            </label>
            <input
              type="text"
              placeholder="e.g. driver-101"
              value={driverIdInput}
              onChange={(e) => setDriverIdInput(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div style={{ alignSelf: "flex-end" }}>
            <CanvasBtn
              variant="primary"
              disabled={loading || !driverIdInput.trim()}
            >
              {loading ? "Searching..." : "Lookup Authority"}
            </CanvasBtn>
          </div>
        </form>
      </CanvasCard>

      {summary && (
        <CanvasCard title={`Driver Rating Authority: ${summary.driverId}`}>
          <CanvasDL items={dlItems} />

          <div
            style={{
              marginTop: 16,
              padding: 12,
              borderRadius: 8,
              background: theme.bgRaised,
              border: `1px solid ${theme.border}`,
              fontSize: 12,
              color: theme.textMuted,
            }}
          >
            <strong>Rule Verification:</strong>
            <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
              <li>
                Drivers with 0 active ratings render <code>new_driver</code>{" "}
                with <code>averageRating: null</code> and{" "}
                <code>ratingCount: 0</code>.
              </li>
              <li>
                Invalidated ratings are excluded from aggregate calculations
                automatically.
              </li>
              <li>
                Aggregate editing is disabled on the frontend and backend.
              </li>
            </ul>
          </div>
        </CanvasCard>
      )}
    </div>
  );
}
