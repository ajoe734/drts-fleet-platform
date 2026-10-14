import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { PoolClient } from "pg";
import { DatabaseService } from "../../../apps/api/src/common/db/database.service";
import type { CreatePassengerComplaintCommand } from "@drts/contracts";
import { CertificateSupportRepository } from "../../../apps/api/src/modules/certificate-support/certificate-support.repository";
import {
  hostedPaymentEnabled,
  PaymentPostgresHarness,
  DiagnosedDatabaseService,
  simulatedE04,
} from "./payment-postgres-harness";

describe("PAX QA instrumentation callback contract (server-free, no DB acceptance)", () => {
  it("preserves the native callback overload and restores query before returning a lease", async () => {
    // Only a PoolClient transport seam, without fabricated SQL rows or any
    // production business call. This reproduces the wrapper's pool callback fault.
    vi.stubEnv("DATABASE_URL", "");
    const callback = vi.fn();
    const nativeQuery = vi.fn((...args: unknown[]) => {
      const done = args.at(-1);
      if (typeof done === "function") {
        done();
        return;
      }
      return Promise.resolve();
    });
    const client = {
      query: nativeQuery,
      release: vi.fn(() => {
        expect(client.query).toBe(nativeQuery);
      }),
    };
    const nativeRelease = client.release;
    vi.spyOn(DatabaseService.prototype, "connect").mockResolvedValue(
      client as unknown as PoolClient,
    );
    try {
      const leased = await new DiagnosedDatabaseService().connect();
      leased.query("SELECT 1", [], callback);
      expect(callback).toHaveBeenCalledOnce();
      expect(nativeQuery.mock.calls[0]).toEqual(["SELECT 1", [], callback]);
      // The normal promise path also works without an active concurrency probe.
      await leased.query("SELECT 1");
      expect(nativeQuery.mock.calls[1]).toEqual(["SELECT 1", undefined]);
      leased.release();
      expect(client.query).toBe(nativeQuery);
      expect(nativeRelease).toHaveBeenCalledOnce();
    } finally {
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
    }
  });
});

describe.skipIf(!hostedPaymentEnabled)(
  "PAX QA Receipt CRM production PostgreSQL",
  () => {
    const h = new PaymentPostgresHarness();
    beforeAll(() => h.open(), 240000);
    beforeEach(() => h.reset(), 30000);
    afterAll(() => h.close(), 30000);

    async function fixture(paid = true) {
      const owner = await h.account();
      const event = await h.receiptTrip(owner, paid);
      const services = await h.receiptServices();
      const command: CreatePassengerComplaintCommand = {
        rideId: event.orderId,
        category: "service",
        content: "QA service complaint",
        contactConsent: true,
      };
      return { owner, event, command, ...services };
    }

    it.each(["service", "lost_item"] as const)(
      "%s intake is durable, replayable and visible to peer and restarted Ops",
      async (category) => {
        const f = await fixture();
        // Peer exists before submission, so refresh must observe another replica's commit.
        const peer = await h.receiptServices();
        const command = {
          ...f.command,
          category,
          ...(category === "lost_item"
            ? { lostItemDescription: "QA blue bag" }
            : {}),
        };
        const created = await f.passengerComplaints.create(
          f.owner,
          f.event.orderId,
          command,
          "qa-explicit-key",
        );
        expect(
          await peer.passengerComplaints.create(
            f.owner,
            f.event.orderId,
            command,
            "qa-explicit-key",
          ),
        ).toEqual(created);
        const before = await h.receiptState(f.event.orderId);
        expect(before.intakes).toHaveLength(1);
        expect(before.cases).toHaveLength(1);
        expect(before.timelines).toHaveLength(1);
        expect(before.intakes[0]).toMatchObject({
          case_no: created.complaintId,
          drts_passenger_id: f.owner,
          contact_consent: true,
          source: "passenger_app",
          category,
        });
        expect(before.intakes[0]!.idempotency_key_hash).toMatch(
          /^[a-f0-9]{64}$/,
        );
        expect(before.cases[0]!.record).toMatchObject({
          relatedOrderId: f.event.orderId,
          category:
            category === "lost_item" ? "lost_and_found" : "driver_service",
          status: "new",
        });
        expect(before.cases[0]!.record.description).toContain(command.content);
        if (category === "lost_item")
          expect(before.cases[0]!.record.description).toContain("QA blue bag");
        expect(before.timelines[0]!.action).toBe("case_created");
        await expect(
          peer.passengerComplaints.create(
            f.owner,
            f.event.orderId,
            { ...command, content: "changed" },
            "qa-explicit-key",
          ),
        ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
        expect(await h.receiptState(f.event.orderId)).toEqual(before);
        for (const ops of [
          peer.complaints,
          (await h.receiptServices()).complaints,
        ]) {
          expect(
            await ops.getComplaintCaseForOps(created.complaintId),
          ).toMatchObject({ caseNo: created.complaintId });
          expect(
            await ops.getComplaintTimelineForOps(created.complaintId),
          ).toHaveLength(1);
          expect(
            (await ops.listComplaintCasesForOps()).filter(
              (row) => row.caseNo === created.complaintId,
            ),
          ).toHaveLength(1);
        }
      },
    );

    it("low rating with contact opt-in creates one canonical case and immutable consent", async () => {
      const f = await fixture();
      const body = {
        rideId: f.event.orderId,
        rating: 2 as const,
        comments: "QA low rating",
        contactRequested: true,
      };
      expect(await f.booking.rateRide(f.owner, f.event.orderId, body)).toEqual({
        success: true,
      });
      const before = await h.receiptState(f.event.orderId);
      expect(before.ratings).toHaveLength(1);
      expect(before.consents).toHaveLength(1);
      expect(before.cases).toHaveLength(1);
      expect(before.timelines).toHaveLength(1);
      expect(before.intakes).toHaveLength(1);
      expect(before.summaries[0]).toMatchObject({
        driver_id: "qa-driver",
        rating_count: 1,
        average_rating: "2.00",
      });
      expect(before.consents[0]).toMatchObject({
        rating_id: before.ratings[0]!.rating_id,
        contact_requested: true,
        complaint_case_no: before.intakes[0]!.case_no,
      });
      const peer = await h.receiptServices();
      await peer.booking.rateRide(f.owner, f.event.orderId, body);
      for (const changed of [
        { ...body, rating: 1 as const },
        { ...body, contactRequested: false },
        { ...body, comments: "changed" },
      ]) {
        await expect(
          peer.booking.rateRide(f.owner, f.event.orderId, changed),
        ).rejects.toMatchObject({ code: "PASSENGER_RATING_ALREADY_SUBMITTED" });
      }
      const after = await h.receiptState(f.event.orderId);
      // Summary version can advance on a lawful replay; the rating/contact/case facts cannot.
      for (const name of [
        "ratings",
        "consents",
        "cases",
        "timelines",
        "intakes",
      ] as const)
        expect(after[name]).toEqual(before[name]);
      expect(after.summaries[0]!.rating_count).toBe(1);
    });

    it.each([
      { rating: 1 as const, contactRequested: false },
      { rating: 5 as const, contactRequested: true },
    ])(
      "rating $rating contact=$contactRequested preserves no-case behavior",
      async (body) => {
        const f = await fixture();
        await f.booking.rateRide(f.owner, f.event.orderId, {
          rideId: f.event.orderId,
          ...body,
        });
        const state = await h.receiptState(f.event.orderId);
        expect(state.ratings).toHaveLength(1);
        expect(state.consents[0]).toMatchObject({
          contact_requested: body.contactRequested,
          complaint_case_no: null,
        });
        for (const name of ["cases", "timelines", "intakes"] as const)
          expect(state[name]).toHaveLength(0);
        expect(state.summaries[0]!.rating_count).toBe(1);
      },
    );

    it.each([
      "crm.phase1_complaint_cases",
      "crm.phase1_complaint_timelines",
      "passenger.complaints",
      "passenger.rating_consents",
      "ops.driver_rating_summaries",
    ])(
      "real failing constraint on %s rolls back the entire rating transaction",
      async (table) => {
        const f = await fixture();
        const before = await h.receiptState(f.event.orderId);
        // Only this case-owned clone gains a fault constraint; no production DDL edit.
        await h.pool!.query(
          `ALTER TABLE ${table} ADD CONSTRAINT qa_receipt_failure CHECK (false) NOT VALID`,
        );
        await expect(
          f.booking.rateRide(f.owner, f.event.orderId, {
            rideId: f.event.orderId,
            rating: 1,
            contactRequested: true,
          }),
        ).rejects.toMatchObject({
          code: "23514",
          constraint: "qa_receipt_failure",
        });
        expect(await h.receiptState(f.event.orderId)).toEqual(before);
        await h.pool!.query(
          `ALTER TABLE ${table} DROP CONSTRAINT qa_receipt_failure`,
        );
        await f.booking.rateRide(f.owner, f.event.orderId, {
          rideId: f.event.orderId,
          rating: 1,
          contactRequested: true,
        });
        const after = await h.receiptState(f.event.orderId);
        for (const name of [
          "ratings",
          "consents",
          "cases",
          "timelines",
          "intakes",
          "summaries",
        ] as const)
          expect(after[name]).toHaveLength(1);
      },
    );

    it("explicit intake failure cannot publish an orphan CRM case or timeline", async () => {
      const f = await fixture();
      const before = await h.receiptState(f.event.orderId);
      await h.pool!.query(
        "ALTER TABLE passenger.complaints ADD CONSTRAINT qa_intake_failure CHECK(false) NOT VALID",
      );
      await expect(
        f.passengerComplaints.create(
          f.owner,
          f.event.orderId,
          f.command,
          "qa-rollback",
        ),
      ).rejects.toMatchObject({ code: "23514" });
      expect(await h.receiptState(f.event.orderId)).toEqual(before);
    });

    it.each(["complaint", "rating"] as const)(
      "concurrent %s submissions use two actual production executor sessions and converge",
      async (operation) => {
        const f = await fixture();
        const peer = await h.receiptServices();
        const { result, sessions, statements, contention, mutations } =
          await h.concurrentMutations(
            () =>
              Promise.all(
                [f, peer].map((service) =>
                  operation === "complaint"
                    ? service.passengerComplaints.create(
                        f.owner,
                        f.event.orderId,
                        f.command,
                        "qa-concurrent",
                      )
                    : service.booking.rateRide(f.owner, f.event.orderId, {
                        rideId: f.event.orderId,
                        rating: 2,
                        contactRequested: true,
                      }),
                ),
              ),
            true,
          );
        expect(result[0]).toEqual(result[1]);
        expect(new Set(sessions).size).toBe(2);
        expect(contention).toHaveLength(1);
        expect(contention[0]!.holder).not.toBe(contention[0]!.waiter);
        const locks = statements.filter(
          (row) => row.lockKeyHash === contention[0]!.key,
        );
        expect(new Set(locks.map((row) => row.pid)).size).toBe(2);
        for (const pid of sessions)
          expect(
            statements.filter((row) => row.pid === pid).map((row) => row.verb),
          ).toEqual(expect.arrayContaining(["BEGIN", "SELECT", "COMMIT"]));
        expect(mutations.every((row) => sessions.includes(row.pid))).toBe(true);
        // A complaint replay reads the original committed case without writing
        // again. Ratings use a real ON CONFLICT update on both executor leases.
        expect(new Set(mutations.map((row) => row.pid)).size).toBe(
          operation === "rating" ? 2 : 1,
        );
        const state = await h.receiptState(f.event.orderId);
        for (const name of ["cases", "timelines", "intakes"] as const)
          expect(state[name]).toHaveLength(1);
        expect(state.ratings).toHaveLength(operation === "rating" ? 1 : 0);
        expect(state.consents).toHaveLength(operation === "rating" ? 1 : 0);
        if (operation === "rating")
          expect(state.summaries[0]!.rating_count).toBe(1);
      },
    );

    it("legacy ride token opt-in persists canonical CRM without inventing an account and survives peer Ops/retry", async () => {
      const owner = await h.account();
      const event = await h.receiptTrip(owner);
      const grant = await h.receiptToken(
        event.orderId,
        "qa-legacy-token-subject",
      );
      const services = await h.receiptServices();
      const peer = await h.receiptServices();
      const body = {
        score: 2 as const,
        contactRequested: true,
        tags: ["comfort"],
        comment: "QA token contact",
      };
      const rating = await services.multi.submitPassengerRating(
        grant.raw,
        body,
      );
      const before = await h.receiptState(event.orderId);
      expect(before.ratings).toHaveLength(1);
      expect(before.rideConsents).toHaveLength(1);
      expect(before.rideConsents[0]).toMatchObject({
        original_token_id: grant.record.tokenId,
        passenger_subject_ref: "qa-legacy-token-subject",
        rating_id: rating.ratingId,
        rating_score: 2,
        contact_requested: true,
        source: "passenger_ride_token",
      });
      expect(before.rideConsents[0]!.request_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(before.consents).toHaveLength(0);
      expect(before.intakes).toHaveLength(0);
      expect(before.cases).toHaveLength(1);
      expect(before.timelines).toHaveLength(1);
      expect(
        (
          await h.pool!.query(
            "SELECT drts_passenger_id FROM passenger.accounts",
          )
        ).rows,
      ).toEqual([{ drts_passenger_id: owner }]);
      expect(await peer.multi.submitPassengerRating(grant.raw, body)).toEqual(
        rating,
      );
      await expect(
        peer.multi.submitPassengerRating(grant.raw, {
          ...body,
          contactRequested: false,
        }),
      ).rejects.toMatchObject({ code: "PASSENGER_RATING_ALREADY_SUBMITTED" });
      const after = await h.receiptState(event.orderId);
      for (const name of [
        "ratings",
        "rideConsents",
        "cases",
        "timelines",
      ] as const)
        expect(after[name]).toEqual(before[name]);
      const caseNo = before.rideConsents[0]!.complaint_case_no;
      for (const ops of [
        peer.complaints,
        (await h.receiptServices()).complaints,
      ]) {
        expect(await ops.getComplaintCaseForOps(caseNo)).toEqual(
          before.cases[0]!.record,
        );
        expect(await ops.getComplaintTimelineForOps(caseNo)).toHaveLength(1);
      }
    });

    it.each([
      { score: 2 as const, contactRequested: false },
      { score: 5 as const, contactRequested: true },
      { score: 2 as const },
    ])(
      "token choice %j is durable without a canonical complaint",
      async (body) => {
        const f = await fixture();
        const grant = await h.receiptToken(f.event.orderId);
        const rating = await f.multi.submitPassengerRating(grant.raw, body);
        expect(
          await (
            await h.receiptServices()
          ).multi.submitPassengerRating(grant.raw, body),
        ).toEqual(rating);
        const state = await h.receiptState(f.event.orderId);
        expect(state.rideConsents).toHaveLength(1);
        expect(state.rideConsents[0]).toMatchObject({
          contact_requested: body.contactRequested ?? false,
          complaint_case_no: null,
        });
        expect(state.ratings).toHaveLength(1);
        expect(state.summaries[0]!.rating_count).toBe(1);
        for (const name of [
          "consents",
          "intakes",
          "cases",
          "timelines",
        ] as const)
          expect(state[name]).toHaveLength(0);
      },
    );

    it.each([
      "ops.passenger_trip_ratings",
      "crm.phase1_complaint_cases",
      "crm.phase1_complaint_timelines",
      "ops.passenger_ride_rating_consents",
      "ops.driver_rating_summaries",
    ])(
      "token native failure on %s rolls back rating, choice, CRM and summary together",
      async (table) => {
        const f = await fixture();
        const grant = await h.receiptToken(f.event.orderId);
        await h.pool!.query(
          `ALTER TABLE ${table} ADD CONSTRAINT qa_token_write_failure CHECK(false) NOT VALID`,
        );
        const body = { score: 1 as const, contactRequested: true };
        await expect(
          f.multi.submitPassengerRating(grant.raw, body),
        ).rejects.toMatchObject({
          code: "23514",
          constraint: "qa_token_write_failure",
        });
        for (const rows of Object.values(await h.receiptState(f.event.orderId)))
          expect(rows).toHaveLength(0);
        await h.pool!.query(
          `ALTER TABLE ${table} DROP CONSTRAINT qa_token_write_failure`,
        );
        await f.multi.submitPassengerRating(grant.raw, body);
        const state = await h.receiptState(f.event.orderId);
        for (const name of [
          "ratings",
          "rideConsents",
          "cases",
          "timelines",
          "summaries",
        ] as const)
          expect(state[name]).toHaveLength(1);
      },
    );

    it("two real token mutation clients contend on the same lock and retain one immutable choice/case", async () => {
      const f = await fixture();
      const grant = await h.receiptToken(f.event.orderId);
      const peer = await h.receiptServices();
      const { result, sessions, contention, mutations } =
        await h.concurrentMutations(
          () =>
            Promise.all(
              [f.multi, peer.multi].map((service) =>
                service.submitPassengerRating(grant.raw, {
                  score: 2,
                  contactRequested: true,
                }),
              ),
            ),
          true,
        );
      expect(result[0]).toEqual(result[1]);
      expect(new Set(sessions).size).toBe(2);
      expect(contention).toHaveLength(1);
      expect(new Set(mutations.map((row) => row.pid)).size).toBe(2);
      expect(mutations.every((row) => sessions.includes(row.pid))).toBe(true);
      const state = await h.receiptState(f.event.orderId);
      for (const name of [
        "ratings",
        "rideConsents",
        "cases",
        "timelines",
        "summaries",
      ] as const)
        expect(state[name]).toHaveLength(1);
      expect(state.summaries[0]!.rating_count).toBe(1);
    });

    it.each([
      "revoked",
      "expired",
      "scope",
      "subject",
      "unpaid",
      "window",
    ] as const)(
      "token %s authority cannot leave partial rating or consent",
      async (reason) => {
        const f = await fixture(reason !== "unpaid");
        const grant = await h.receiptToken(f.event.orderId);
        if (reason === "revoked")
          await h.pool!.query(
            "UPDATE ops.passenger_ride_access_tokens SET revoked_at=now() WHERE token_id=$1",
            [grant.record.tokenId],
          );
        if (reason === "expired")
          await h.pool!.query(
            "UPDATE ops.passenger_ride_access_tokens SET expires_at=now()-interval '1 minute' WHERE token_id=$1",
            [grant.record.tokenId],
          );
        if (reason === "scope")
          await h.pool!.query(
            "UPDATE ops.passenger_ride_access_tokens SET scopes='[\"ride:read\"]'::jsonb WHERE token_id=$1",
            [grant.record.tokenId],
          );
        if (reason === "subject")
          await h.pool!.query(
            "UPDATE ops.phase1_owned_orders SET record=jsonb_set(record,'{passenger,passengerId}','\"other-subject\"'::jsonb) WHERE order_id=$1",
            [f.event.orderId],
          );
        if (reason === "window")
          await h.pool!.query(
            "UPDATE ops.phase1_driver_tasks SET record=jsonb_set(record,'{completedAt}',to_jsonb((now()-interval '49 hours')::text)) WHERE order_id=$1",
            [f.event.orderId],
          );
        await expect(
          f.multi.submitPassengerRating(grant.raw, {
            score: 1,
            contactRequested: true,
          }),
        ).rejects.toMatchObject({
          code:
            reason === "scope"
              ? "PASSENGER_RIDE_SCOPE_FORBIDDEN"
              : reason === "subject"
                ? "PASSENGER_RIDE_NOT_FOUND"
                : reason === "unpaid"
                  ? "PASSENGER_RATING_PAYMENT_REQUIRED"
                  : reason === "window"
                    ? "PASSENGER_RATING_WINDOW_CLOSED"
                    : "PASSENGER_RIDE_TOKEN_INVALID",
        });
        for (const rows of Object.values(await h.receiptState(f.event.orderId)))
          expect(rows).toHaveLength(0);
      },
    );

    it("unpaid and expired completion reject ratings without storing any partial data", async () => {
      const f = await fixture(false);
      const before = await h.receiptState(f.event.orderId);
      await expect(
        f.booking.rateRide(f.owner, f.event.orderId, {
          rideId: f.event.orderId,
          rating: 1,
          contactRequested: true,
        }),
      ).rejects.toMatchObject({ code: "PASSENGER_RATING_PAYMENT_REQUIRED" });
      expect(await h.receiptState(f.event.orderId)).toEqual(before);
      await h.pool!.query(
        "UPDATE ops.phase1_driver_tasks SET record=jsonb_set(record,'{completedAt}',to_jsonb((now()-interval '25 hours')::text)) WHERE order_id=$1",
        [f.event.orderId],
      );
      await expect(
        (await h.receiptServices()).booking.rateRide(f.owner, f.event.orderId, {
          rideId: f.event.orderId,
          rating: 1,
          contactRequested: true,
        }),
      ).rejects.toMatchObject({ code: "PASSENGER_RATING_WINDOW_CLOSED" });
      expect(await h.receiptState(f.event.orderId)).toEqual(before);
    });

    it("foreign, missing and deleted account mutations preserve ownership and historical records", async () => {
      const f = await fixture();
      const foreign = await h.account();
      for (const [owner, order] of [
        [foreign, f.event.orderId],
        [f.owner, randomUUID()],
      ] as const) {
        await expect(
          f.passengerComplaints.create(
            owner,
            order,
            { ...f.command, rideId: order },
            "qa-denied",
          ),
        ).rejects.toMatchObject({ code: "PASSENGER_RIDE_NOT_FOUND" });
      }
      const created = await f.passengerComplaints.create(
        f.owner,
        f.event.orderId,
        f.command,
        "qa-existing",
      );
      await h.accountStore.transaction((tx) =>
        tx.anonymize(f.owner, new Date().toISOString()),
      );
      const before = await h.receiptState(f.event.orderId);
      await expect(
        f.passengerComplaints.create(
          f.owner,
          f.event.orderId,
          f.command,
          "qa-after-deletion",
        ),
      ).rejects.toMatchObject({ code: "PASSENGER_RIDE_NOT_FOUND" });
      await expect(
        f.booking.rateRide(f.owner, f.event.orderId, {
          rideId: f.event.orderId,
          rating: 1,
          contactRequested: true,
        }),
      ).rejects.toMatchObject({ code: "PASSENGER_RIDE_NOT_FOUND" });
      expect(await h.receiptState(f.event.orderId)).toEqual(before);
      expect(
        await (
          await h.receiptServices()
        ).complaints.getComplaintCaseForOps(created.complaintId),
      ).toMatchObject({ relatedOrderId: f.event.orderId });
    });

    it("actual receipt writer and HTML/PDF rendering retain captured surname and fare through regeneration", async () => {
      const f = await fixture();
      const event = { ...f.event, e04Snapshot: structuredClone(simulatedE04) };
      const source = await f.certificates.writeCompletedTrip(event);
      const metadata = await f.multi.getTrustedPassengerReceiptDownloads(
        f.event.orderId,
        f.owner,
      );
      expect(metadata.certificateId).toBe(source.receiptId);
      const html = await f.multi.getTrustedPassengerReceiptArtifact(
        f.event.orderId,
        f.owner,
        "html",
      );
      expect(html.buffer.toString()).toContain(
        "QA simulated operator &lt;escaped&gt;",
      );
      expect(html.buffer.toString()).toContain("歐陽");
      expect(html.buffer.toString()).toContain("••••0042");
      expect(html.buffer.toString()).toContain("TWD 190.37");
      expect(html.buffer.toString()).toContain("TWD 85.01");
      expect(html.buffer.toString()).toContain("TWD 13.03");
      const pdf = await f.multi.getTrustedPassengerReceiptArtifact(
        f.event.orderId,
        f.owner,
        "pdf",
      );
      expect(pdf.buffer.subarray(0, 8).toString()).toBe("%PDF-1.7");
      // Boundary source changed after capture; regeneration must use the durable original.
      event.driverSurname = "changed";
      event.actualFareBreakdown!.startMinor = 99999;
      const input = {
        certificateId: source.receiptId,
        actorId: "qa-ops",
        reason: "QA regeneration",
        idempotencyKey: "qa-regenerate",
        issuedAt: new Date().toISOString(),
      };
      const repository = new CertificateSupportRepository(h.database);
      const regenerated = await repository.regenerate(input);
      expect((await repository.regenerate(input)).replayed).toBe(true);
      expect(regenerated.row.record).toMatchObject({
        driverSurname: "歐陽",
        actualFareBreakdown: simulatedE04.fareBreakdown,
        e04Snapshot: simulatedE04,
      });
      expect(regenerated.row.amountMinor).toBe(19037);
      expect(
        (
          await f.multi.getTrustedPassengerReceiptDownloads(
            f.event.orderId,
            f.owner,
          )
        ).certificateId,
      ).toBe(regenerated.row.receiptId);
      const rows = (
        await h.pool!.query(
          "SELECT * FROM reporting.multi_taxi_electronic_receipts WHERE order_id=$1 ORDER BY receipt_version",
          [f.event.orderId],
        )
      ).rows;
      expect(rows).toHaveLength(2);
      expect(rows.map((row) => row.is_current)).toEqual([false, true]);
      expect(rows[1]!.supersedes_receipt_id).toBe(source.receiptId);
      expect(
        (
          await f.multi.getTrustedPassengerReceiptArtifact(
            f.event.orderId,
            f.owner,
            "html",
          )
        ).buffer.toString(),
      ).toContain("歐陽");
      await expect(
        f.multi.getTrustedPassengerReceiptDownloads(
          f.event.orderId,
          await h.account(),
        ),
      ).rejects.toMatchObject({ code: "PASSENGER_RIDE_NOT_FOUND" });
    });

    it("absent receipt and absent issuer/provider source return genuine NOT_READY", async () => {
      const f = await fixture();
      await expect(
        f.multi.getTrustedPassengerReceiptDownloads(f.event.orderId, f.owner),
      ).rejects.toMatchObject({ code: "PASSENGER_RECEIPT_NOT_READY" });
      const source = await f.certificates.writeCompletedTrip(f.event);
      expect(source.record).not.toHaveProperty("e04Snapshot");
      await expect(
        f.multi.getTrustedPassengerReceiptDownloads(f.event.orderId, f.owner),
      ).rejects.toMatchObject({ code: "PASSENGER_E04_NOT_READY" });
      await expect(
        f.multi.getTrustedPassengerReceiptArtifact(
          f.event.orderId,
          f.owner,
          "html",
        ),
      ).rejects.toMatchObject({ code: "PASSENGER_E04_NOT_READY" });
    });
  },
);
