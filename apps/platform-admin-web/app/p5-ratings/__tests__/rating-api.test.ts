import { describe, expect, it, vi } from "vitest";
import {
  buildRatingReviewQuery,
  classifyRatingReadFailure,
  getDriverRatingAuthority,
  getRatingReview,
  invalidateRating,
  listRatingReviews,
  RatingReadModelError,
  type RatingApiClient,
  type RatingReviewFilters,
} from "../rating-api";

const NOW = "2026-07-24T08:00:00.000Z";

const EMPTY_FILTERS: RatingReviewFilters = {
  status: "",
  score: "",
  tag: "",
  driverId: "",
  tripOrOrder: "",
  from: "",
  to: "",
};

function envelope(data: unknown) {
  return {
    success: true as const,
    data,
    meta: {
      timestamp: NOW,
      requestId: "req-rate-test",
    },
  };
}

function summary(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    driverId: "driver-001",
    displayState: "rated",
    averageRating: 4.25,
    ratingCount: 8,
    lastRatedAt: "2026-07-24T07:30:00.000Z",
    aggregateVersion: 4,
    calculatedAt: "2026-07-24T07:31:00.000Z",
    ...overrides,
  };
}

function rating() {
  return {
    ratingId: "rating-001",
    orderId: "order-001",
    tripId: "trip-001",
    driverId: "driver-001",
    score: 2,
    tags: ["service"],
    comment: "Needs review",
    status: "under_review",
    submittedAt: "2026-07-24T07:30:00.000Z",
    updatedAt: "2026-07-24T07:40:00.000Z",
  };
}

function readClient(data: unknown): RatingApiClient {
  return {
    getEnvelope: vi.fn().mockResolvedValue(envelope(data)),
    post: vi.fn(),
  };
}

describe("rating read model", () => {
  it("builds only populated review filters", () => {
    expect(
      buildRatingReviewQuery({
        ...EMPTY_FILTERS,
        status: "under_review",
        score: "2",
        tag: "  service issue ",
        driverId: " driver/001 ",
        tripOrOrder: " trip 9 ",
        from: "2026-07-01",
        to: "2026-07-24",
      }),
    ).toBe(
      "/api/platform-admin/multi-taxi-ratings?status=under_review&score=2&tag=service+issue&driverId=driver%2F001&tripOrOrder=trip+9&from=2026-07-01&to=2026-07-24",
    );
  });

  it("parses a canonical queue and honors server stale state", async () => {
    const client = readClient({
      items: [
        {
          ...rating(),
          driverDisplayName: "Driver Lin",
          commentExcerpt: "Needs review",
        },
      ],
      pageInfo: {
        page: 1,
        pageSize: 20,
        totalItems: 1,
        totalPages: 1,
      },
      refresh: {
        generatedAt: NOW,
        staleAfterMs: 300_000,
        stale: true,
      },
    });

    const result = await listRatingReviews(client, EMPTY_FILTERS);

    expect(result.items[0]?.ratingId).toBe("rating-001");
    expect(result.refresh.stale).toBe(true);
  });

  it("omits an unmasked passenger subject and disables unadvertised commands", async () => {
    const client = readClient({
      rating: rating(),
      orderNo: "M-001",
      driverDisplayName: "Driver Lin",
      passengerSubjectMasked: "passenger-raw-reference",
      driverRatingSummary: summary(),
      moderationHistory: [],
      refresh: {
        generatedAt: NOW,
        staleAfterMs: 300_000,
        stale: false,
      },
    });

    const result = await getRatingReview(client, "rating-001");

    expect(result.passengerSubjectMasked).toBeNull();
    expect(result.availableActions.invalidate).toEqual({
      enabled: false,
      disabledReason: "command_not_advertised",
    });
  });

  it.each([
    {
      displayState: "rated",
      averageRating: null,
      ratingCount: 1,
    },
    {
      displayState: "new_driver",
      averageRating: 5,
      ratingCount: 0,
    },
    {
      displayState: "unavailable",
      averageRating: 0,
      ratingCount: 0,
    },
  ])("rejects a non-canonical $displayState authority", async (invalid) => {
    const client = readClient({
      summary: summary(invalid),
      refresh: {
        generatedAt: NOW,
        staleAfterMs: 300_000,
        stale: false,
      },
      unavailableReason: null,
    });

    await expect(
      getDriverRatingAuthority(client, "driver-001"),
    ).rejects.toBeInstanceOf(RatingReadModelError);
  });

  it("preserves 401, 403, and 404 failure states", () => {
    expect(classifyRatingReadFailure({ statusCode: 401 })).toBe(
      "unauthenticated",
    );
    expect(classifyRatingReadFailure({ statusCode: 403 })).toBe("forbidden");
    expect(classifyRatingReadFailure({ statusCode: 404 })).toBe("not_found");
    expect(classifyRatingReadFailure(new Error("offline"))).toBe(
      "request_failed",
    );
  });
});

describe("rating invalidation command", () => {
  it("sends the required reason, confirmation, and idempotency semantics", async () => {
    const post = vi.fn().mockResolvedValue({ replayed: false });
    const client: RatingApiClient = {
      getEnvelope: vi.fn(),
      post,
    };

    await invalidateRating(
      client,
      "rating/001",
      "Confirmed duplicate",
      "idem-rate-001",
    );

    expect(post).toHaveBeenCalledWith(
      "/api/platform-admin/multi-taxi-ratings/rating%2F001/invalidate",
      {
        body: {
          reason: "Confirmed duplicate",
          idempotencyKey: "idem-rate-001",
          confirmation: {
            action: "invalidate_rating",
            ratingId: "rating/001",
          },
        },
        headers: {
          "Idempotency-Key": "idem-rate-001",
        },
      },
    );
  });
});
