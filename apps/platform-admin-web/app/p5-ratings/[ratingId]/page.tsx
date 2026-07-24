"use client";

import {
  useCallback,
  useEffect,
  useState,
  use,
  type CSSProperties,
} from "react";
import Link from "next/link";
import { usePlatformAdminClient } from "@/lib/admin-client";
import type {
  DriverRatingSummary,
  PassengerRatingModerationRecord,
} from "@drts/contracts";
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
  maxWidth: 1100,
  margin: "0 auto",
};

const cardGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 16,
  alignItems: "start",
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: `1px solid ${theme.border}`,
  borderRadius: 8,
  padding: "9px 10px",
  background: theme.bgRaised,
  color: theme.text,
  fontSize: 13,
};

export default function RatingReviewDetailPage({
  params,
}: {
  params: Promise<{ ratingId: string }>;
}) {
  const { ratingId } = use(params);
  const client = usePlatformAdminClient();

  const [rating, setRating] = useState<PassengerRatingModerationRecord | null>(
    null,
  );
  const [driverSummary, setDriverSummary] =
    useState<DriverRatingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showInvalidateModal, setShowInvalidateModal] = useState(false);
  const [invalidateReason, setInvalidateReason] = useState("");
  const [invalidating, setInvalidating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const envelope = await client.request<any>(
        `/api/v1/platform-admin/p5-ratings/${encodeURIComponent(ratingId)}`,
      );
      const data = envelope?.data;
      if (data?.rating) {
        setRating(data.rating);
        setDriverSummary(data.driverSummary ?? null);
      } else {
        setError("Rating record not found");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load rating detail");
    } finally {
      setLoading(false);
    }
  }, [client, ratingId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const handleInvalidate = async () => {
    if (!invalidateReason.trim()) {
      setActionError("A reason is mandatory for rating invalidation.");
      return;
    }

    setInvalidating(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const envelope = await client.request<any>(
        `/api/v1/platform-admin/p5-ratings/${encodeURIComponent(ratingId)}/invalidate`,
        {
          method: "POST",
          body: JSON.stringify({
            reason: invalidateReason.trim(),
          }),
        },
      );
      const data = envelope?.data;
      if (data?.rating) {
        setRating(data.rating);
        setDriverSummary(data.driverSummary ?? null);
        setActionSuccess(
          "Rating has been successfully invalidated and driver aggregate rebuilt.",
        );
        setShowInvalidateModal(false);
      }
    } catch (err: any) {
      setActionError(err?.message || "Failed to invalidate rating.");
    } finally {
      setInvalidating(false);
    }
  };

  if (loading) {
    return (
      <div style={pageStyle} data-testid="p5-rate-ui-02">
        <CanvasPageHeader
          title="Rating Detail"
          subtitle="Loading rating moderation record..."
        />
        <div
          style={{ padding: 24, textAlign: "center", color: theme.textMuted }}
        >
          Loading...
        </div>
      </div>
    );
  }

  if (error || !rating) {
    return (
      <div style={pageStyle} data-testid="p5-rate-ui-02">
        <CanvasPageHeader
          title="Rating Detail"
          subtitle="Error loading rating"
        />
        <CanvasBanner tone="danger" title="Error">
          {error || "Rating record not found."}
        </CanvasBanner>
        <Link href="/p5-ratings">
          <CanvasBtn variant="secondary">Back to Queue</CanvasBtn>
        </Link>
      </div>
    );
  }

  const ratingDlItems: CanvasDLItem[] = [
    { label: "Rating ID", value: rating.ratingId },
    { label: "Trip ID", value: rating.tripId || "—" },
    { label: "Order ID", value: rating.orderId || "—" },
    { label: "Driver ID", value: rating.driverId },
    {
      label: "Score",
      value: (
        <CanvasPill
          tone={
            rating.score >= 4
              ? "success"
              : rating.score <= 2
                ? "danger"
                : "warn"
          }
        >
          {"★".repeat(rating.score)} ({rating.score} / 5)
        </CanvasPill>
      ),
    },
    {
      label: "Tags",
      value:
        rating.tags && rating.tags.length > 0 ? rating.tags.join(", ") : "None",
    },
    { label: "Comment", value: rating.comment || "No comment provided" },
    {
      label: "Passenger Reference",
      value: rating.maskedPassengerSubjectRef || "Masked",
    },
    {
      label: "Status",
      value: (
        <CanvasPill
          tone={
            rating.status === "active"
              ? "success"
              : rating.status === "invalidated"
                ? "danger"
                : "warn"
          }
        >
          {rating.status}
        </CanvasPill>
      ),
    },
    {
      label: "Submitted At",
      value: new Date(rating.submittedAt).toLocaleString(),
    },
    {
      label: "Last Updated",
      value: new Date(rating.updatedAt).toLocaleString(),
    },
  ];

  if (rating.status === "invalidated") {
    ratingDlItems.push(
      { label: "Invalidation Reason", value: rating.invalidationReason || "—" },
      {
        label: "Invalidated At",
        value: rating.invalidatedAt
          ? new Date(rating.invalidatedAt).toLocaleString()
          : "—",
      },
      {
        label: "Invalidated By",
        value: rating.invalidatedByOperatorId || "System",
      },
    );
  }

  const driverDlItems: CanvasDLItem[] = driverSummary
    ? [
        { label: "Driver ID", value: driverSummary.driverId },
        {
          label: "Display State",
          value: (
            <CanvasPill
              tone={driverSummary.displayState === "rated" ? "info" : "neutral"}
            >
              {driverSummary.displayState}
            </CanvasPill>
          ),
        },
        {
          label: "Average Rating",
          value:
            driverSummary.averageRating !== null
              ? `★ ${driverSummary.averageRating}`
              : "new_driver (No ratings)",
        },
        {
          label: "Active Rating Count",
          value: String(driverSummary.ratingCount),
        },
        {
          label: "Aggregate Version",
          value: String(driverSummary.aggregateVersion),
        },
        {
          label: "Calculated At",
          value: new Date(driverSummary.calculatedAt).toLocaleString(),
        },
      ]
    : [{ label: "Status", value: "Summary unavailable" }];

  return (
    <div style={pageStyle} data-testid="p5-rate-ui-02">
      <CanvasPageHeader
        title={`Rating Moderation: ${rating.ratingId.slice(0, 8)}`}
        subtitle={`Order: ${rating.orderId} • Driver: ${rating.driverId}`}
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <Link href="/p5-ratings">
              <CanvasBtn variant="secondary">Back to Queue</CanvasBtn>
            </Link>
            {rating.status === "active" && (
              <CanvasBtn
                variant="primary"
                onClick={() => setShowInvalidateModal(true)}
              >
                Invalidate Rating
              </CanvasBtn>
            )}
            <CanvasBtn
              variant="secondary"
              disabled
              title="Restore command pending approval per doc08 §8"
            >
              Restore (Command Pending)
            </CanvasBtn>
          </div>
        }
      />

      {actionSuccess && (
        <CanvasBanner tone="info" title="Moderation Action Successful">
          {actionSuccess}
        </CanvasBanner>
      )}

      {actionError && (
        <CanvasBanner tone="danger" title="Moderation Error">
          {actionError}
        </CanvasBanner>
      )}

      <div style={cardGridStyle}>
        <CanvasCard title="Passenger Rating Record">
          <CanvasDL items={ratingDlItems} />
        </CanvasCard>

        <CanvasCard title="Driver Rating Authority Summary">
          <CanvasDL items={driverDlItems} />
          <div style={{ marginTop: 12, fontSize: 11, color: theme.textMuted }}>
            Note: Direct aggregate editing (overwriting score, average, or
            count) is forbidden per doc08 §8. Driver authority aggregates are
            automatically rebuilt upon invalidation.
          </div>
        </CanvasCard>
      </div>

      {showInvalidateModal && (
        <CanvasCard title="Confirm Rating Invalidation">
          <div style={{ display: "grid", gap: 12 }}>
            <p style={{ margin: 0, fontSize: 13, color: theme.text }}>
              Invalidating this rating will exclude it from the driver rating
              calculation and automatically trigger an aggregate rebuild. A
              mandatory reason must be provided.
            </p>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 500,
                  marginBottom: 4,
                }}
              >
                Invalidation Reason (Mandatory)
              </label>
              <input
                type="text"
                placeholder="e.g. Abusive language, confirmed fraudulent review, duplicate submission"
                value={invalidateReason}
                onChange={(e) => setInvalidateReason(e.target.value)}
                style={inputStyle}
              />
            </div>

            <div
              style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}
            >
              <CanvasBtn
                variant="secondary"
                onClick={() => setShowInvalidateModal(false)}
              >
                Cancel
              </CanvasBtn>
              <CanvasBtn
                variant="primary"
                onClick={handleInvalidate}
                disabled={invalidating || !invalidateReason.trim()}
              >
                {invalidating ? "Invalidating..." : "Confirm Invalidation"}
              </CanvasBtn>
            </div>
          </div>
        </CanvasCard>
      )}
    </div>
  );
}
