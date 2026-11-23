import { describe, expect, it, vi } from "vitest";

import { MultiTaxiRepository } from "../../src/modules/multi-taxi/multi-taxi.repository";

describe("MultiTaxiRepository passenger access tokens", () => {
  it("persists only the token digest and never the raw bearer token", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const repository = new MultiTaxiRepository({
      isEnabled: () => true,
      query,
    } as never);
    const rawToken = "raw-passenger-bearer-token-must-not-be-stored";

    await repository.persistRideAccessToken(
      {
        tokenId: "token-001",
        orderId: "order-001",
        passengerSubjectRef: "passenger-001",
        scopes: ["ride:read", "ride:cancel"],
        expiresAt: "2026-08-22T00:00:00.000Z",
        revokedAt: null,
        accessToken: rawToken,
      },
      "sha256-token-digest",
    );

    const [sql, parameters] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("token_digest");
    expect(sql).not.toMatch(/^\s*access_token\s*,?$/m);
    expect(parameters).toContain("sha256-token-digest");
    expect(parameters).not.toContain(rawToken);
  });
});

const activeRatingRow = {
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

const invalidatedRatingRow = {
  ...activeRatingRow,
  status: "invalidated",
  updated_at: "2026-07-24T01:00:00.000Z",
};

const rebuiltSummaryRow = {
  driver_id: "driver-001",
  display_state: "new_driver",
  average_rating: null,
  rating_count: 0,
  last_rated_at: null,
  aggregate_version: 2,
  calculated_at: "2026-07-24T01:00:00.000Z",
};

const invalidationAuditRow = {
  audit_id: "audit-001",
  rating_id: "rating-001",
  action: "invalidate",
  reason: "Passenger confirmed submission error.",
  actor_id: "platform-admin-001",
  idempotency_key: "rating-invalidate-001",
  previous_status: "active",
  resulting_status: "invalidated",
  aggregate_version: 2,
  request_id: "req-rating-invalidate-001",
  created_at: "2026-07-24T01:00:00.000Z",
};

const ratedSummaryRow = {
  driver_id: "driver-001",
  display_state: "rated",
  average_rating: "4.50",
  rating_count: 2,
  last_rated_at: "2026-07-24T00:00:00.000Z",
  aggregate_version: 3,
  calculated_at: "2026-07-24T00:05:00.000Z",
};

function createInvalidationInput() {
  return {
    auditId: "audit-001",
    ratingId: "rating-001",
    reason: "Passenger confirmed submission error.",
    actorId: "platform-admin-001",
    idempotencyKey: "rating-invalidate-001",
    requestId: "req-rating-invalidate-001",
    invalidatedAt: "2026-07-24T01:00:00.000Z",
  };
}

describe("MultiTaxiRepository rating invalidation", () => {
  it("atomically invalidates, rebuilds from active ratings, and appends audit evidence", async () => {
    const query = vi.fn(async (sql: string) => {
      if (
        sql.includes("FROM ops.passenger_trip_ratings") &&
        sql.includes("FOR UPDATE")
      ) {
        return { rows: [activeRatingRow] };
      }
      if (sql.includes("FROM ops.passenger_rating_moderation_audits")) {
        return { rows: [] };
      }
      if (sql.includes("UPDATE ops.passenger_trip_ratings")) {
        return { rows: [invalidatedRatingRow] };
      }
      if (sql.includes("INSERT INTO ops.driver_rating_summaries")) {
        return { rows: [rebuiltSummaryRow] };
      }
      if (sql.includes("INSERT INTO ops.passenger_rating_moderation_audits")) {
        return { rows: [invalidationAuditRow] };
      }
      return { rows: [] };
    });
    const release = vi.fn();
    const repository = new MultiTaxiRepository({
      isEnabled: () => true,
      connect: vi.fn().mockResolvedValue({ query, release }),
    } as never);

    const result = await repository.invalidatePassengerRating(
      createInvalidationInput(),
    );
    const sql = query.mock.calls.map(([statement]) => statement).join("\n");

    expect(result).toMatchObject({
      outcome: "invalidated",
      rating: { ratingId: "rating-001", status: "invalidated", score: 5 },
      summary: {
        displayState: "new_driver",
        averageRating: null,
        ratingCount: 0,
        aggregateVersion: 2,
      },
      audit: {
        auditId: "audit-001",
        actorId: "platform-admin-001",
        reason: "Passenger confirmed submission error.",
      },
    });
    expect(sql).toContain("SET status = 'invalidated'");
    expect(sql).toContain("AND status = 'active'");
    expect(sql).toContain("INSERT INTO ops.passenger_rating_moderation_audits");
    expect(sql).not.toMatch(/SET\s+score\s*=/);
    expect(query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
    expect(release).toHaveBeenCalledOnce();
  });

  it("returns an idempotent replay without a second mutation or aggregate rebuild", async () => {
    const query = vi.fn(async (sql: string) => {
      if (
        sql.includes("FROM ops.passenger_trip_ratings") &&
        sql.includes("FOR UPDATE")
      ) {
        return { rows: [invalidatedRatingRow] };
      }
      if (sql.includes("FROM ops.passenger_rating_moderation_audits")) {
        return { rows: [invalidationAuditRow] };
      }
      if (
        sql.includes("FROM ops.driver_rating_summaries") &&
        !sql.includes("INSERT INTO")
      ) {
        return { rows: [rebuiltSummaryRow] };
      }
      return { rows: [] };
    });
    const release = vi.fn();
    const repository = new MultiTaxiRepository({
      isEnabled: () => true,
      connect: vi.fn().mockResolvedValue({ query, release }),
    } as never);

    const result = await repository.invalidatePassengerRating(
      createInvalidationInput(),
    );
    const sql = query.mock.calls.map(([statement]) => statement).join("\n");

    expect(result).toMatchObject({
      outcome: "replayed",
      rating: { status: "invalidated" },
      summary: { aggregateVersion: 2 },
      audit: { auditId: "audit-001" },
    });
    expect(sql).not.toContain("UPDATE ops.passenger_trip_ratings");
    expect(sql).not.toContain("INSERT INTO ops.driver_rating_summaries");
    expect(sql).not.toContain(
      "INSERT INTO ops.passenger_rating_moderation_audits",
    );
    expect(query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
    expect(release).toHaveBeenCalledOnce();
  });

  it("rolls back when aggregate rebuild or audit persistence fails", async () => {
    const query = vi.fn(async (sql: string) => {
      if (
        sql.includes("FROM ops.passenger_trip_ratings") &&
        sql.includes("FOR UPDATE")
      ) {
        return { rows: [activeRatingRow] };
      }
      if (sql.includes("FROM ops.passenger_rating_moderation_audits")) {
        return { rows: [] };
      }
      if (sql.includes("UPDATE ops.passenger_trip_ratings")) {
        return { rows: [invalidatedRatingRow] };
      }
      if (sql.includes("INSERT INTO ops.driver_rating_summaries")) {
        throw new Error("aggregate rebuild failed");
      }
      return { rows: [] };
    });
    const release = vi.fn();
    const repository = new MultiTaxiRepository({
      isEnabled: () => true,
      connect: vi.fn().mockResolvedValue({ query, release }),
    } as never);

    await expect(
      repository.invalidatePassengerRating(createInvalidationInput()),
    ).rejects.toThrow("aggregate rebuild failed");

    expect(query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    expect(release).toHaveBeenCalledOnce();
  });
});

describe("MultiTaxiRepository rating governance reads", () => {
  it("lists canonical rating rows with server-side filters and no passenger subject", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ total_items: 1 }] })
      .mockResolvedValueOnce({
        rows: [
          {
            rating_id: "rating-001",
            order_id: "order-001",
            trip_id: "trip-001",
            driver_id: "driver-001",
            driver_display_name: "Driver One",
            score: 5,
            tags: ["safe"],
            comment_excerpt: "Great ride",
            status: "active",
            submitted_at: "2026-07-24T00:00:00.000Z",
            updated_at: "2026-07-24T00:00:00.000Z",
          },
        ],
      });
    const repository = new MultiTaxiRepository({
      isEnabled: () => true,
      query,
    } as never);

    const result = await repository.listPassengerRatingReviews({
      status: "active",
      score: 5,
      tag: "safe",
      driverId: "driver-001",
      tripOrOrder: "trip_001%",
      from: "2026-07-01",
      to: "2026-07-31",
      page: 2,
      pageSize: 20,
    });
    const sql = query.mock.calls.map(([statement]) => statement).join("\n");
    const listParameters = query.mock.calls[1]?.[1] as unknown[];

    expect(result).toEqual({
      items: [
        {
          ratingId: "rating-001",
          orderId: "order-001",
          tripId: "trip-001",
          driverId: "driver-001",
          driverDisplayName: "Driver One",
          score: 5,
          tags: ["safe"],
          commentExcerpt: "Great ride",
          status: "active",
          submittedAt: "2026-07-24T00:00:00.000Z",
          updatedAt: "2026-07-24T00:00:00.000Z",
        },
      ],
      totalItems: 1,
    });
    expect(result.items[0]).not.toHaveProperty("passengerSubjectRef");
    expect(result.items[0]).not.toHaveProperty("comment");
    expect(sql).toContain("FROM ops.passenger_trip_ratings r");
    expect(sql).toContain("r.tags @>");
    expect(sql).toContain("AT TIME ZONE 'Asia/Taipei'");
    expect(sql).toContain("LIMIT");
    expect(listParameters).toContain("%trip\\_001\\%%");
    expect(listParameters.slice(-2)).toEqual([20, 20]);
  });

  it("reads detail, aggregate, and ordered audit history from canonical tables", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM ops.passenger_trip_ratings r")) {
        return {
          rows: [
            {
              ...activeRatingRow,
              order_no: "MTX-001",
              driver_display_name: "Driver One",
            },
          ],
        };
      }
      if (sql.includes("FROM ops.driver_rating_summaries")) {
        return { rows: [ratedSummaryRow] };
      }
      if (sql.includes("FROM ops.passenger_rating_moderation_audits")) {
        return { rows: [invalidationAuditRow] };
      }
      return { rows: [] };
    });
    const repository = new MultiTaxiRepository({
      isEnabled: () => true,
      query,
    } as never);

    const result = await repository.findPassengerRatingReview("rating-001");
    const sql = query.mock.calls.map(([statement]) => statement).join("\n");

    expect(result).toMatchObject({
      rating: {
        ratingId: "rating-001",
        passengerSubjectRef: "passenger-sensitive-001",
      },
      orderNo: "MTX-001",
      driverDisplayName: "Driver One",
      summary: {
        displayState: "rated",
        averageRating: 4.5,
        ratingCount: 2,
      },
      moderationHistory: [{ auditId: "audit-001" }],
    });
    expect(sql).toContain("ORDER BY created_at DESC, audit_id ASC");
  });

  it("returns only the persisted driver summary authority", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [ratedSummaryRow] });
    const repository = new MultiTaxiRepository({
      isEnabled: () => true,
      query,
    } as never);

    await expect(
      repository.findDriverRatingSummary("driver-001"),
    ).resolves.toMatchObject({
      driverId: "driver-001",
      displayState: "rated",
      averageRating: 4.5,
      ratingCount: 2,
      aggregateVersion: 3,
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("FROM ops.driver_rating_summaries"),
      ["driver-001"],
    );
  });

  it("matches completed driver task_id and operational record trip_id in listPassengerRatingReviews and resolves canonical_trip_id in findPassengerRatingReview", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("count(*)::integer AS total_items")) {
        return { rows: [{ total_items: 1 }] };
      }
      if (sql.includes("AS comment_excerpt")) {
        return {
          rows: [
            {
              rating_id: "ca5e20c7-470c-4a62-b107-654aa581d626",
              order_id: "580e0ebf-c1e6-41c4-93dc-449bd92a010f",
              trip_id: "85f7a59f-ee43-4734-869a-42f2aa1031ae",
              driver_id: "2ef2301a-6a1f-44a4-b865-2fd7a035e2b5",
              driver_display_name: "Driver One",
              score: 5,
              tags: ["safe"],
              comment_excerpt: "Canonical trip match",
              status: "active",
              submitted_at: "2026-11-19T12:24:10.000Z",
              updated_at: "2026-11-19T12:24:10.000Z",
            },
          ],
        };
      }
      if (sql.includes("FROM ops.passenger_trip_ratings r")) {
        return {
          rows: [
            {
              ...activeRatingRow,
              rating_id: "ca5e20c7-470c-4a62-b107-654aa581d626",
              order_id: "580e0ebf-c1e6-41c4-93dc-449bd92a010f",
              trip_id: "6c7e412a-2ae4-4fd6-946b-a55f9563c35b",
              canonical_trip_id: "85f7a59f-ee43-4734-869a-42f2aa1031ae",
              order_no: "DRTS-PAX-20261119-001",
              driver_display_name: "Driver One",
            },
          ],
        };
      }
      if (sql.includes("FROM ops.driver_rating_summaries")) {
        return { rows: [ratedSummaryRow] };
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

    const listResult = await repository.listPassengerRatingReviews({
      status: null,
      score: null,
      tag: null,
      driverId: null,
      tripOrOrder: "85f7a59f-ee43-4734-869a-42f2aa1031ae",
      from: null,
      to: null,
      page: 1,
      pageSize: 20,
    });
    expect(listResult.totalItems).toBe(1);
    expect(listResult.items[0]?.tripId).toBe(
      "85f7a59f-ee43-4734-869a-42f2aa1031ae",
    );
    const listSql = query.mock.calls.map(([s]) => String(s)).join("\n");
    expect(listSql).toContain("FROM ops.phase1_driver_tasks dt");
    expect(listSql).toContain(
      "FROM reporting.multi_taxi_trip_operational_records mtr",
    );

    const detailResult = await repository.findPassengerRatingReview(
      "ca5e20c7-470c-4a62-b107-654aa581d626",
    );
    expect(detailResult?.rating.tripId).toBe(
      "85f7a59f-ee43-4734-869a-42f2aa1031ae",
    );
  });
});
