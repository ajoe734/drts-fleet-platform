import { describe, expect, it, vi } from "vitest";

import type {
  DriverRatingAuthorityView,
  PassengerRatingReviewDetail,
  PassengerRatingReviewListData,
} from "@drts/contracts";

import {
  getDriverRatingAuthority,
  getRatingReview,
  listRatingReviews,
  type RatingApiClient,
} from "../../../platform-admin-web/app/p5-ratings/rating-api";
import { ApiRequestError } from "../../src/common/api-envelope";
import { MultiTaxiController } from "../../src/modules/multi-taxi/multi-taxi.controller";
import { MultiTaxiRepository } from "../../src/modules/multi-taxi/multi-taxi.repository";
import { MultiTaxiService } from "../../src/modules/multi-taxi/multi-taxi.service";

const ratingRow = {
  rating_id: "rating-001",
  order_id: "order-001",
  trip_id: "trip-001",
  driver_id: "driver-001",
  passenger_subject_ref: "passenger-sensitive-001",
  score: 5,
  tags: ["safe"],
  comment: "Great ride",
  status: "active",
  submitted_at: "2026-07-24T00:00:00.000Z",
  updated_at: "2026-07-24T00:00:00.000Z",
};

const summaryRow = {
  driver_id: "driver-001",
  display_state: "rated",
  average_rating: "5.00",
  rating_count: 1,
  last_rated_at: "2026-07-24T00:00:00.000Z",
  aggregate_version: 1,
  calculated_at: "2026-07-24T00:01:00.000Z",
};

function createHarness(options?: { summaryMissing?: boolean }) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("count(*)::integer AS total_items")) {
      return { rows: [{ total_items: 1 }] };
    }
    if (sql.includes("AS comment_excerpt")) {
      return {
        rows: [
          {
            rating_id: ratingRow.rating_id,
            order_id: ratingRow.order_id,
            trip_id: ratingRow.trip_id,
            driver_id: ratingRow.driver_id,
            driver_display_name: "Driver One",
            score: ratingRow.score,
            tags: ratingRow.tags,
            comment_excerpt: ratingRow.comment,
            status: ratingRow.status,
            submitted_at: ratingRow.submitted_at,
            updated_at: ratingRow.updated_at,
          },
        ],
      };
    }
    if (
      sql.includes("FROM ops.passenger_trip_ratings r") &&
      sql.includes("r.*")
    ) {
      return {
        rows: [
          {
            ...ratingRow,
            order_no: "MTX-001",
            driver_display_name: "Driver One",
          },
        ],
      };
    }
    if (sql.includes("FROM ops.driver_rating_summaries")) {
      return { rows: options?.summaryMissing ? [] : [summaryRow] };
    }
    if (sql.includes("FROM ops.passenger_rating_moderation_audits")) {
      return { rows: [] };
    }
    return { rows: [] };
  });
  const repository = new MultiTaxiRepository({
    isEnabled: () => true,
    query,
  } as never);
  const service = new MultiTaxiService(
    {
      listOrders: vi.fn(() => []),
    } as never,
    repository,
  );
  return {
    controller: new MultiTaxiController(service),
    query,
  };
}

function readClient(envelope: unknown): RatingApiClient {
  return {
    getEnvelope: vi.fn().mockResolvedValue(envelope),
    post: vi.fn(),
  };
}

describe("P5-RATE-UI-001 canonical read integration", () => {
  it("flows repository authority through all three controllers into the production UI contract", async () => {
    const { controller, query } = createHarness();
    const listEnvelope = await controller.listPassengerRatingReviews(
      { status: "active", score: "5" },
      "req-rating-list-integration",
    );
    const detailEnvelope = await controller.getPassengerRatingReview(
      "rating-001",
      {
        authMode: "bootstrap_headers",
        actorType: "platform_admin",
        actorId: "platform-admin-001",
        realm: "platform",
        tenantId: null,
        roleFamilies: ["platform"],
        roles: ["platform_admin"],
        scopes: [
          "foundation:read",
          "multi_taxi_ratings:read",
          "multi_taxi_ratings:moderate",
        ],
        requestId: "req-rating-detail-integration",
      },
      "req-rating-detail-integration",
    );
    const authorityEnvelope = await controller.getDriverRatingAuthority(
      "driver-001",
      "req-rating-authority-integration",
    );

    const listContract: PassengerRatingReviewListData = listEnvelope.data;
    const detailContract: PassengerRatingReviewDetail = detailEnvelope.data;
    const authorityContract: DriverRatingAuthorityView = authorityEnvelope.data;
    const list = await listRatingReviews(readClient(listEnvelope), {
      status: "active",
      score: "5",
      tag: "",
      driverId: "",
      tripOrOrder: "",
      from: "",
      to: "",
    });
    const detail = await getRatingReview(
      readClient(detailEnvelope),
      "rating-001",
    );
    const authority = await getDriverRatingAuthority(
      readClient(authorityEnvelope),
      "driver-001",
    );
    const serialized = JSON.stringify({
      listContract,
      detailContract,
      authorityContract,
    });

    expect(list.items[0]).toMatchObject({
      ratingId: "rating-001",
      status: "active",
      driverDisplayName: "Driver One",
    });
    expect(detail).toMatchObject({
      rating: {
        ratingId: "rating-001",
        driverId: "driver-001",
      },
      orderNo: "MTX-001",
      passengerSubjectMasked: "pas...001",
      availableActions: {
        invalidate: { enabled: true, disabledReason: null },
      },
    });
    expect(authority.summary).toMatchObject({
      displayState: "rated",
      averageRating: 5,
      ratingCount: 1,
    });
    expect(serialized).not.toContain("passenger-sensitive-001");
    expect(serialized).not.toContain("passengerSubjectRef");
    expect(list.items[0]).not.toHaveProperty("comment");
    expect(query.mock.calls.map(([sql]) => sql).join("\n")).toContain(
      "ops.driver_rating_summaries",
    );
  });

  it("returns 503 when a rating exists without persisted aggregate authority", async () => {
    const { controller } = createHarness({ summaryMissing: true });

    const error = await controller
      .getPassengerRatingReview(
        "rating-001",
        {
          authMode: "bootstrap_headers",
          actorType: "platform_admin",
          actorId: "platform-admin-001",
          realm: "platform",
          tenantId: null,
          roleFamilies: ["platform"],
          roles: ["platform_admin"],
          scopes: ["foundation:read", "multi_taxi_ratings:read"],
          requestId: "req-rating-missing-summary",
        },
        "req-rating-missing-summary",
      )
      .catch((caught: unknown) => caught as ApiRequestError);

    expect(error.getStatus()).toBe(503);
    expect(error).toMatchObject({
      response: {
        error: { code: "DRIVER_RATING_AUTHORITY_UNAVAILABLE" },
      },
    });
  });
});
