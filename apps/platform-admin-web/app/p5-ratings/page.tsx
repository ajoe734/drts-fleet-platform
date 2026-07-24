"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { usePlatformAdminClient } from "@/lib/admin-client";
import type { PassengerRatingModerationRecord } from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  buildCanvasTheme,
  type CanvasTableColumn,
} from "@drts/ui-web";

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });

const pageStyle: CSSProperties = {
  padding: 24,
  display: "grid",
  gap: 16,
  maxWidth: 1400,
  margin: "0 auto",
};

const filterRowStyle: CSSProperties = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
  alignItems: "center",
};

const inputStyle: CSSProperties = {
  border: `1px solid ${theme.border}`,
  borderRadius: 8,
  padding: "8px 12px",
  background: theme.bgRaised,
  color: theme.text,
  fontSize: 13,
  minWidth: 160,
};

type RatingRow = PassengerRatingModerationRecord & Record<string, unknown>;

export default function RatingReviewQueuePage() {
  const client = usePlatformAdminClient();

  const [ratings, setRatings] = useState<PassengerRatingModerationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [scoreFilter, setScoreFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("");
  const [driverFilter, setDriverFilter] = useState<string>("");
  const [orderFilter, setOrderFilter] = useState<string>("");

  const loadRatings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (scoreFilter !== "all") params.set("score", scoreFilter);
      if (tagFilter.trim()) params.set("tag", tagFilter.trim());
      if (driverFilter.trim()) params.set("driverId", driverFilter.trim());
      if (orderFilter.trim()) params.set("orderId", orderFilter.trim());

      const queryStr = params.toString() ? `?${params.toString()}` : "";
      const envelope = await client.request<any>(
        `/api/v1/platform-admin/p5-ratings${queryStr}`,
      );
      const data = envelope?.data?.items ?? envelope?.data ?? [];
      setRatings(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err?.message || "Failed to load rating review queue");
    } finally {
      setLoading(false);
    }
  }, [client, statusFilter, scoreFilter, tagFilter, driverFilter, orderFilter]);

  useEffect(() => {
    loadRatings();
  }, [loadRatings]);

  const columns: CanvasTableColumn<RatingRow>[] = [
    {
      key: "ratingId",
      header: "Rating ID",
      render: (row) => (
        <Link
          href={`/p5-ratings/${row.ratingId}`}
          style={{
            color: theme.primary,
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          {row.ratingId.slice(0, 8)}...
        </Link>
      ),
    },
    {
      key: "orderId",
      header: "Trip / Order ID",
      render: (row) => (
        <span style={{ fontFamily: "monospace", fontSize: 12 }}>
          {row.orderId.slice(0, 8)}...
        </span>
      ),
    },
    {
      key: "driverId",
      header: "Driver ID",
      render: (row) => <span style={{ fontWeight: 500 }}>{row.driverId}</span>,
    },
    {
      key: "score",
      header: "Score",
      render: (row) => (
        <CanvasPill
          tone={row.score >= 4 ? "success" : row.score <= 2 ? "danger" : "warn"}
        >
          {"★".repeat(row.score)} ({row.score})
        </CanvasPill>
      ),
    },
    {
      key: "tags",
      header: "Tags",
      render: (row) => (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {row.tags && row.tags.length > 0 ? (
            row.tags.map((tag) => (
              <CanvasPill key={tag} tone="neutral">
                {tag}
              </CanvasPill>
            ))
          ) : (
            <span style={{ color: theme.textMuted }}>—</span>
          )}
        </div>
      ),
    },
    {
      key: "maskedPassengerSubjectRef",
      header: "Passenger",
      render: (row) => (
        <span style={{ color: theme.textMuted, fontSize: 12 }}>
          {row.maskedPassengerSubjectRef || "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <CanvasPill
          tone={
            row.status === "active"
              ? "success"
              : row.status === "invalidated"
                ? "danger"
                : "warn"
          }
        >
          {row.status}
        </CanvasPill>
      ),
    },
    {
      key: "submittedAt",
      header: "Submitted At",
      render: (row) => (
        <span style={{ fontSize: 12, color: theme.textMuted }}>
          {row.submittedAt ? new Date(row.submittedAt).toLocaleString() : "—"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Action",
      render: (row) => (
        <Link href={`/p5-ratings/${row.ratingId}`}>
          <CanvasBtn size="small" variant="secondary">
            View / Moderation
          </CanvasBtn>
        </Link>
      ),
    },
  ];

  return (
    <div style={pageStyle} data-testid="p5-rate-ui-01">
      <CanvasPageHeader
        title="P-5 Rating Governance & Moderation Queue"
        subtitle="Review passenger trip ratings, invalidate inappropriate reviews, and monitor driver rating authority states."
        actions={
          <Link href="/p5-ratings/driver-authority">
            <CanvasBtn variant="secondary">Driver Rating Authority</CanvasBtn>
          </Link>
        }
      />

      {error && (
        <CanvasBanner tone="danger" title="Error Loading Queue">
          {error}
        </CanvasBanner>
      )}

      <CanvasCard title="Filter & Search">
        <div style={filterRowStyle}>
          <div>
            <label
              style={{
                display: "block",
                fontSize: 11,
                color: theme.textMuted,
                marginBottom: 4,
              }}
            >
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={inputStyle}
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="invalidated">Invalidated</option>
              <option value="under_review">Under Review</option>
            </select>
          </div>

          <div>
            <label
              style={{
                display: "block",
                fontSize: 11,
                color: theme.textMuted,
                marginBottom: 4,
              }}
            >
              Score
            </label>
            <select
              value={scoreFilter}
              onChange={(e) => setScoreFilter(e.target.value)}
              style={inputStyle}
            >
              <option value="all">All Scores</option>
              <option value="5">5 Stars</option>
              <option value="4">4 Stars</option>
              <option value="3">3 Stars</option>
              <option value="2">2 Stars</option>
              <option value="1">1 Star</option>
            </select>
          </div>

          <div>
            <label
              style={{
                display: "block",
                fontSize: 11,
                color: theme.textMuted,
                marginBottom: 4,
              }}
            >
              Tag
            </label>
            <input
              type="text"
              placeholder="e.g. clean, polite"
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              style={inputStyle}
            />
          </div>

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
              placeholder="Search driver ID"
              value={driverFilter}
              onChange={(e) => setDriverFilter(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <label
              style={{
                display: "block",
                fontSize: 11,
                color: theme.textMuted,
                marginBottom: 4,
              }}
            >
              Trip / Order ID
            </label>
            <input
              type="text"
              placeholder="Search order ID"
              value={orderFilter}
              onChange={(e) => setOrderFilter(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={{ alignSelf: "flex-end" }}>
            <CanvasBtn size="small" variant="secondary" onClick={loadRatings}>
              Apply Filters
            </CanvasBtn>
          </div>
        </div>
      </CanvasCard>

      <CanvasCard title={`Ratings Queue (${ratings.length})`}>
        {loading ? (
          <div
            style={{ padding: 24, textAlign: "center", color: theme.textMuted }}
          >
            Loading passenger rating records...
          </div>
        ) : ratings.length === 0 ? (
          <div
            style={{ padding: 24, textAlign: "center", color: theme.textMuted }}
          >
            No rating records match the current filter.
          </div>
        ) : (
          <CanvasTable columns={columns} data={ratings as RatingRow[]} />
        )}
      </CanvasCard>
    </div>
  );
}
