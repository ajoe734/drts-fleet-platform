import { RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { describe, expect, it } from "vitest";

import type {
  DriverRatingAuthorityView,
  PassengerRatingReviewDetail,
  PassengerRatingReviewListData,
} from "@drts/contracts";

import {
  AUTH_ALLOWED_REALMS_KEY,
  AUTH_REQUIRED_SCOPES_KEY,
} from "../../src/common/auth";
import { MultiTaxiController } from "../../src/modules/multi-taxi/multi-taxi.controller";

describe("P5 rating governance GET contracts", () => {
  it.each([
    [
      MultiTaxiController.prototype.listPassengerRatingReviews,
      "platform-admin/multi-taxi-ratings",
    ],
    [
      MultiTaxiController.prototype.getPassengerRatingReview,
      "platform-admin/multi-taxi-ratings/:ratingId",
    ],
    [
      MultiTaxiController.prototype.getDriverRatingAuthority,
      "platform-admin/multi-taxi-rating-authorities/:driverId",
    ],
  ])(
    "publishes canonical GET route and read-only auth metadata",
    (handler, path) => {
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
        RequestMethod.GET,
      );
      expect(Reflect.getMetadata(AUTH_ALLOWED_REALMS_KEY, handler)).toEqual([
        "platform",
      ]);
      expect(Reflect.getMetadata(AUTH_REQUIRED_SCOPES_KEY, handler)).toEqual([
        "multi_taxi_ratings:read",
      ]);
    },
  );

  it("keeps passenger subject references outside every public read shape", () => {
    const list = {
      items: [],
      pageInfo: {
        page: 1,
        pageSize: 50,
        totalItems: 0,
        totalPages: 0,
      },
      refresh: {
        generatedAt: "2026-07-24T00:00:00.000Z",
        staleAfterMs: 300_000,
        stale: false,
      },
    } satisfies PassengerRatingReviewListData;
    const detail = {
      rating: {
        ratingId: "rating-001",
        orderId: "order-001",
        tripId: "trip-001",
        driverId: "driver-001",
        score: 5,
        tags: [],
        comment: null,
        status: "active",
        submittedAt: "2026-07-24T00:00:00.000Z",
        updatedAt: "2026-07-24T00:00:00.000Z",
      },
      orderNo: null,
      driverDisplayName: null,
      passengerSubjectMasked: "pas...001",
      driverRatingSummary: {
        driverId: "driver-001",
        displayState: "rated",
        averageRating: 5,
        ratingCount: 1,
        lastRatedAt: "2026-07-24T00:00:00.000Z",
        aggregateVersion: 1,
        calculatedAt: "2026-07-24T00:01:00.000Z",
      },
      moderationHistory: [],
      availableActions: {
        invalidate: { enabled: false, disabledReason: "missing_capability" },
      },
      refresh: {
        generatedAt: "2026-07-24T00:01:00.000Z",
        staleAfterMs: 300_000,
        stale: false,
      },
    } satisfies PassengerRatingReviewDetail;
    const authority = {
      summary: detail.driverRatingSummary,
      refresh: detail.refresh,
      unavailableReason: null,
    } satisfies DriverRatingAuthorityView;
    const serialized = JSON.stringify({ list, detail, authority });

    expect(serialized).not.toContain("passengerSubjectRef");
    expect(serialized).not.toContain("passenger-sensitive");
  });
});
