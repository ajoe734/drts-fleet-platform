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
