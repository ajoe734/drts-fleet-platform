import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { DatabaseService } from "../../../apps/api/src/common/db";
import type { OwnedMobilityService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { MultiTaxiController } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.controller";
import { MultiTaxiRepository } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.repository";
import { MultiTaxiService } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.service";

const ORDER = "11111111-1111-4111-8111-111111111111";
const SUBJECT = "legacy-subject-unit";
const TOKEN = "review-supported-token";

/**
 * SQL responses and completed order/assignment are the external fixtures.
 * Token digest/scope/expiry, controller, rating logic, SQL and row mappers are
 * production code. This is source reproduction, not PG/HTTP acceptance.
 */
function fixture() {
  const calls: { sql: string; values: readonly unknown[] }[] = [];
  let stored: Record<string, unknown> | undefined;
  const authority = {
    found: true,
    scopes: ["ride:rate"],
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    revokedAt: null as string | null,
    completed: true,
    assigned: true,
  };
  const query = async (sql: string, values: readonly unknown[] = []) => {
    const text = sql.trim().replace(/\s+/g, " ");
    calls.push({ sql: text, values });
    if (text.includes("FROM ops.passenger_ride_access_tokens")) {
      expect(values[0]).toBe(
        createHash("sha256")
          .update(
            `${process.env.PASSENGER_RIDE_TOKEN_PEPPER?.trim() ?? ""}\0${TOKEN}`,
          )
          .digest("hex"),
      );
      return {
        rows: authority.found
          ? [
              {
                token_id: "unit-token",
                order_id: ORDER,
                passenger_subject_ref: SUBJECT,
                scopes: authority.scopes,
                expires_at: authority.expiresAt,
                revoked_at: authority.revokedAt,
              },
            ]
          : [],
      };
    }
    if (text.startsWith("SELECT * FROM ops.passenger_trip_ratings"))
      return { rows: stored ? [stored] : [] };
    if (text.startsWith("INSERT INTO ops.passenger_trip_ratings")) {
      stored ??= Object.fromEntries(
        [
          "rating_id",
          "order_id",
          "trip_id",
          "driver_id",
          "passenger_subject_ref",
          "score",
          "tags",
          "comment",
          "status",
          "submitted_at",
          "updated_at",
        ].map((key, index) => [
          key,
          index === 6 ? JSON.parse(values[index] as string) : values[index],
        ]),
      );
      return { rows: [stored] };
    }
    if (text.startsWith("INSERT INTO ops.driver_rating_summaries"))
      return {
        rows: [
          {
            driver_id: values[0],
            display_state: "rated",
            average_rating: stored!.score,
            rating_count: 1,
            last_rated_at: stored!.submitted_at,
            aggregate_version: 1,
            calculated_at: values[1],
          },
        ],
      };
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(text)) return { rows: [] };
    throw new Error(`Unexpected production SQL: ${text}`);
  };
  const database = {
    isEnabled: () => true,
    query,
    connect: async () => ({ query, release: () => {} }),
  } as unknown as DatabaseService;
  const owned = {
    getOrder: (orderId: string) => {
      expect(orderId).toBe(ORDER);
      return {
        orderId: ORDER,
        runtimeProfileCode: "multi_taxi_direct",
        status: authority.completed ? "completed" : "on_trip",
        passenger: { passengerId: SUBJECT },
      };
    },
    findPassengerAssignmentDisclosure: () =>
      authority.assigned
        ? {
            assignmentId: "unit-assignment",
            driver: { driverId: "unit-driver" },
          }
        : null,
  } as unknown as OwnedMobilityService;
  const controller = new MultiTaxiController(
    new MultiTaxiService(owned, new MultiTaxiRepository(database)),
  );
  const command = { score: 2 as const, contactRequested: true };
  return {
    authority,
    calls,
    controller,
    command,
    submit: (body = command) => controller.submitPassengerRating(TOKEN, body),
  };
}

describe("F-TOKEN-LOW-RATING-CONTACT supported production operation", () => {
  it("score 2 with selected contact persists one canonical CRM case and its initial timeline", async () => {
    const f = fixture();
    const response = await f.submit();
    expect(response.data).toMatchObject({
      score: 2,
      passengerSubjectRef: SUBJECT,
    });
    expect(f.calls.some((call) => call.sql === "COMMIT")).toBe(true);
    expect(
      f.calls.filter((call) =>
        call.sql.startsWith("INSERT INTO crm.phase1_complaint_cases"),
      ),
    ).toHaveLength(1);
    expect(
      f.calls.filter((call) =>
        call.sql.startsWith("INSERT INTO crm.phase1_complaint_timelines"),
      ),
    ).toHaveLength(1);
  });

  it("exact replay keeps the original rating; changing contact choice must conflict", async () => {
    const f = fixture();
    const first = await f.submit();
    const replay = await f.submit();
    expect(replay.data.ratingId).toBe(first.data.ratingId);
    await expect(
      f.submit({ ...f.command, contactRequested: false }),
    ).rejects.toMatchObject({
      code: "PASSENGER_RATING_ALREADY_SUBMITTED",
    });
  });

  it.each([
    { score: 2 as const, contactRequested: false },
    { score: 5 as const, contactRequested: true },
    { score: 2 as const },
  ])("%j stores a rating without a complaint", async (command) => {
    const f = fixture();
    const response = await f.controller.submitPassengerRating(TOKEN, command);
    expect(response.data.score).toBe(command.score);
    expect(
      f.calls.filter((call) => call.sql.startsWith("INSERT INTO crm.")),
    ).toHaveLength(0);
  });

  it.each([
    "missing",
    "expired",
    "revoked",
    "scope",
    "incomplete",
    "unassigned",
  ] as const)("%s authority rejects before rating writes", async (reason) => {
    const f = fixture();
    if (reason === "missing") f.authority.found = false;
    if (reason === "expired") f.authority.expiresAt = new Date(0).toISOString();
    if (reason === "revoked") f.authority.revokedAt = new Date(0).toISOString();
    if (reason === "scope") f.authority.scopes = ["ride:read"];
    if (reason === "incomplete") f.authority.completed = false;
    if (reason === "unassigned") f.authority.assigned = false;
    await expect(f.submit()).rejects.toMatchObject({
      code:
        reason === "scope"
          ? "PASSENGER_RIDE_SCOPE_FORBIDDEN"
          : reason === "incomplete"
            ? "PASSENGER_RATING_TRIP_NOT_COMPLETED"
            : reason === "unassigned"
              ? "PASSENGER_RATING_ASSIGNMENT_MISSING"
              : "PASSENGER_RIDE_TOKEN_INVALID",
    });
    expect(
      f.calls.filter((call) => call.sql.startsWith("INSERT")),
    ).toHaveLength(0);
  });
});
