import { PASSENGER_FEE_DISCLOSURE_VERSION } from "@drts/contracts";
import { randomUUID } from "node:crypto";
import { domainFixture } from "../referral-embed-verified-session-canonical-journey-20261015/domain-fixture";
import { ReferralEmbedHandoffRepository } from "../../../apps/api/src/modules/tenant-partner/referral-embed-handoff.repository";
import { PassengerFareRepository } from "../../../apps/api/src/modules/passenger-app/fare/passenger-fare.repository";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { BootstrapRequestIdentity } from "../../../apps/api/src/common/auth";
import type { DispatchJobRecord } from "@drts/contracts";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { OwnedMobilityService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { PartnerUserIdentityLinkRepository } from "../../../apps/api/src/modules/tenant-partner/partner-user-identity-link.repository";
import { PartnerNotificationTransport } from "../../../apps/api/src/modules/multi-taxi/partner-notification.transport";
import { databaseUrl, PostgresHarness } from "./postgres-harness";

describe.skipIf(!databaseUrl)(
  "referral booking and assignment PostgreSQL",
  () => {
    const h = new PostgresHarness();
    beforeAll(() => h.open(), 120_000);
    afterAll(() => h.close());
    afterEach(() => vi.restoreAllMocks());
    beforeEach(async () => {
      await h.reset();
      await h.entry();
    });

    async function bookingHarness() {
      const f = await domainFixture(),
        tenant = f.partner;
      const entry = tenant.getPartnerEntry("yuhe-residence");
      await h.pool.query(
        `INSERT INTO admin.phase1_partner_channel_entries
        (entry_slug,tenant_id,partner_id,program_id,status,created_at,updated_at,record)
        VALUES ($1,$2,$3,$4,'active',now(),now(),$5::jsonb) ON CONFLICT DO NOTHING`,
        [
          entry.entrySlug,
          entry.tenantId,
          entry.partnerId,
          entry.programId,
          JSON.stringify(entry),
        ],
      );
      const links = new PartnerUserIdentityLinkRepository(h.database);
      const handoffs = new ReferralEmbedHandoffRepository(h.database);
      Reflect.set(tenant, "partnerUserIdentityLinkRepository", links);
      Reflect.set(tenant, "referralEmbedHandoffRepository", handoffs);
      const link = await links.resolveOrCreate({
        entrySlug: entry.entrySlug,
        partnerUserRef: "opaque-referral",
      });
      const artifact = randomUUID();
      const issued = await handoffs.issue({
        artifact,
        entrySlug: entry.entrySlug,
        entryHost: entry.entryHost!,
        partnerUserRef: link.partnerUserRef,
        drtsPassengerId: link.drtsPassengerId,
        tenantId: entry.tenantId,
        partnerId: entry.partnerId,
        partnerProgramId: entry.programId,
        consentRequired: true,
        consentBundleVersion: null,
        consentGrantedAt: null,
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 120000).toISOString(),
      });
      await handoffs.consume({
        artifact,
        entrySlug: entry.entrySlug,
        entryHost: entry.entryHost!,
      });
      await tenant.recordReferralEmbedConsent({
        handoffId: issued.handoffId,
        entrySlug: entry.entrySlug,
        entryHost: entry.entryHost!,
        currentDrtsPassengerId: link.drtsPassengerId,
        currentPartnerEntrySlug: entry.entrySlug,
        consentBundle: {
          bundleVersion: "pg-referral-v1",
          grantedScopes: ["trip.manage", "pii.trip", "identity.bind"],
          grantedAt: new Date().toISOString(),
        },
      });
      const identity: BootstrapRequestIdentity = {
        authMode: "jwt_bearer",
        actorType: "referral_passenger",
        actorId: link.drtsPassengerId,
        realm: "partner",
        tenantId: entry.tenantId,
        partnerId: entry.partnerId,
        partnerProgramId: entry.programId,
        partnerEntrySlug: entry.entrySlug,
        drtsPassengerId: link.drtsPassengerId,
        roleFamilies: ["partner"],
        roles: ["referral_passenger"],
        scopes: ["partner:book"],
        requestId: null,
      };
      const service = f.service;
      Reflect.set(service, "ownedMobilityRepository", h.owned);
      Reflect.set(service, "partnerUserIdentityLinkRepository", links);
      Reflect.set(
        service,
        "referralFareRepository",
        new PassengerFareRepository(h.database),
      );
      const publish = vi.spyOn(
        Reflect.get(service, "opsDispatchEventsService"),
        "publishOrderCreated",
      );
      const input = {
        entrySlug: entry.entrySlug,
        pickupAddress: "Synthetic pickup",
        dropoffAddress: "Synthetic dropoff",
      };
      await service.acknowledgeReferralFees(
        {
          disclosureVersion: PASSENGER_FEE_DISCLOSURE_VERSION,
          acknowledged: true,
        },
        identity,
      );
      const quote = await service.quoteReferralPassengerFare(input, identity);
      const command = {
        ...input,
        quoteId: quote.quoteId,
        feeDisclosureVersion: PASSENGER_FEE_DISCLOSURE_VERSION,
        feeConfirmed: true,
        passengerName: "Synthetic PG rider",
        passengerPhone: "0912345678",
        idempotencyKey: "pg-referral",
      };
      return { service, identity, command, publish, link };
    }

    async function assignmentHarness() {
      const order = await h.order();
      await h.taxi.writeOrderPartnerNotificationRoute(h.partnerRoute());
      const job: DispatchJobRecord = {
        dispatchJobId: "job-qa",
        orderId: order.orderId,
        status: "matching",
        mode: "auto",
        latestEtaMinutes: null,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      };
      await h.owned.persistChanges({ dispatchJobs: [job] });
      const service = new OwnedMobilityService(
        {
          prepareMatchingSuppressions: () => undefined,
          assertCurrentMatchingSuppressionClear: () => undefined,

          getVehicleDispatchability: () => true,
          getDriverAvailability: () => true,
        } as never,
        new AuditNotificationService(),
        {} as never,
        {
          publishTaskAssigned: vi.fn(),
          publishTaskCancelled: vi.fn(),
          publishTaskUpdated: vi.fn(),
        } as never,
        undefined,
        h.owned,
      );
      return {
        service,
        assign: (previousAssignmentId?: string) =>
          service.createDispatchAssignment(
            job,
            order,
            "vehicle-qa",
            "driver-qa",
            undefined,
            undefined,
            previousAssignmentId ? { previousAssignmentId } : undefined,
          ),
      };
    }

    it("commits the trusted referral route and sequence with booking, preserving replay", async () => {
      const b = await bookingHarness();
      const write = h.owned.writeOrderPartnerNotificationRoute.bind(h.owned);
      let checked = false;
      vi.spyOn(
        h.owned,
        "writeOrderPartnerNotificationRoute",
      ).mockImplementation(async (route, tx) => {
        const stored = await write(route, tx);
        expect(tx).toBeDefined();
        expect(
          (
            await tx!.query(
              "SELECT order_id FROM ops.phase1_owned_orders WHERE order_id=$1",
              [route.orderId],
            )
          ).rows,
        ).toHaveLength(1);
        expect(
          (
            await h.pool.query(
              "SELECT order_id FROM mobility.phase1_order_partner_notification_routes WHERE order_id=$1",
              [route.orderId],
            )
          ).rows,
        ).toHaveLength(0);
        expect(
          (
            await h.pool.query(
              "SELECT order_id FROM ops.phase1_owned_orders WHERE order_id=$1",
              [route.orderId],
            )
          ).rows,
        ).toHaveLength(0);
        checked = true;
        return stored;
      });
      const first = await b.service.createReferralPassengerBooking(
        b.command,
        b.identity,
      );
      expect(checked).toBe(true);
      expect(
        await h.taxi.findOrderPartnerNotificationRoute(first.orderId),
      ).toMatchObject({
        drtsPassengerId: b.link.drtsPassengerId,
        partnerUserRef: "opaque-referral",
        tenantId: b.identity.tenantId,
      });
      await h.owned.persistChanges({
        consumerNotificationOutbox: [
          {
            ...(await h.event("another-order-event", "unrouted")),
            outboxId: "booked-event",
            orderId: first.orderId,
          },
        ],
      });
      const frozen = await h.taxi.findOrderPartnerNotificationRoute(
        first.orderId,
      );
      vi.restoreAllMocks();
      expect(frozen).not.toBeNull();
      for (const writer of [h.taxi, h.owned]) {
        expect(
          await writer.writeOrderPartnerNotificationRoute({
            ...frozen!,
            partnerUserRef: "attempted-recipient-replacement",
          }),
        ).toEqual(frozen);
      }
      const replay = await b.service.createReferralPassengerBooking(
        b.command,
        b.identity,
      );
      expect(replay).toMatchObject({ orderId: first.orderId, replayed: true });
      expect(
        await h.taxi.findOrderPartnerNotificationRoute(first.orderId),
      ).toEqual(frozen);
      expect(
        (
          await h.pool.query(
            "SELECT next_sequence FROM mobility.phase1_partner_notification_sequences WHERE order_id=$1",
            [first.orderId],
          )
        ).rows[0].next_sequence,
      ).toBe("2");
      expect(b.publish).toHaveBeenCalledTimes(1);
    });

    it.each(["missing", "revoked"])(
      "denies booking before writing when the durable identity link is %s",
      async (state) => {
        const b = await bookingHarness();
        if (state === "missing")
          await h.pool.query(
            "DELETE FROM admin.phase1_partner_user_identity_links",
          );
        else
          await h.pool.query(
            "UPDATE admin.phase1_partner_user_identity_links SET status='revoked',record=jsonb_set(record,'{status}','\"revoked\"')",
          );
        await expect(
          b.service.createReferralPassengerBooking(b.command, b.identity),
        ).rejects.toMatchObject({
          status: 403,
          code: "REFERRAL_HANDOFF_REVOKED",
        });
        expect(
          (await h.pool.query("SELECT order_id FROM ops.phase1_owned_orders"))
            .rows,
        ).toHaveLength(0);
        expect(
          (
            await h.pool.query(
              "SELECT * FROM mobility.phase1_order_partner_notification_routes",
            )
          ).rows,
        ).toHaveLength(0);
        expect(
          (
            await h.pool.query(
              "SELECT * FROM mobility.phase1_partner_notification_sequences",
            )
          ).rows,
        ).toHaveLength(0);
        expect(
          (
            await h.pool.query(
              "SELECT consumed_by_order_id FROM ops.phase1_referral_fare_quote_snapshots WHERE quote_id=$1",
              [b.command.quoteId],
            )
          ).rows[0].consumed_by_order_id,
        ).toBeNull();
        expect(b.publish).not.toHaveBeenCalled();
      },
    );

    it("rolls back quote claim, booking, route and sequence on a real SQL fault before COMMIT", async () => {
      const b = await bookingHarness();
      const report = vi.spyOn(h.owned, "reportPersistenceFailure");
      await h.pool
        .query(`CREATE FUNCTION mobility.qa_reject_sequence() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'qa sequence fault'; END $$;
      CREATE TRIGGER qa_reject_sequence BEFORE INSERT ON mobility.phase1_partner_notification_sequences FOR EACH ROW EXECUTE FUNCTION mobility.qa_reject_sequence()`);
      try {
        await expect(
          b.service.createReferralPassengerBooking(b.command, b.identity),
        ).rejects.toMatchObject({
          status: 503,
          code: "FARE_QUOTE_UNAVAILABLE",
        });
        expect(report).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining("qa sequence fault"),
          }),
          "write order partner notification route",
        );
        expect(
          (await h.pool.query("SELECT order_id FROM ops.phase1_owned_orders"))
            .rows,
        ).toHaveLength(0);
        expect(
          (
            await h.pool.query(
              "SELECT * FROM mobility.phase1_order_partner_notification_routes",
            )
          ).rows,
        ).toHaveLength(0);
        expect(
          (
            await h.pool.query(
              "SELECT * FROM mobility.phase1_partner_notification_sequences",
            )
          ).rows,
        ).toHaveLength(0);
        expect(
          (
            await h.pool.query(
              "SELECT consumed_by_order_id FROM ops.phase1_referral_fare_quote_snapshots WHERE quote_id=$1",
              [b.command.quoteId],
            )
          ).rows[0].consumed_by_order_id,
        ).toBeNull();
        expect(b.publish).not.toHaveBeenCalled();
      } finally {
        await h.pool.query(
          "DROP TRIGGER qa_reject_sequence ON mobility.phase1_partner_notification_sequences; DROP FUNCTION mobility.qa_reject_sequence()",
        );
      }
    });

    it("persists assignment/reassignment generations and supersedes the prior notification using PG relevance", async () => {
      const a = await assignmentHarness();
      const first = await a.assign();
      const second = await a.assign(first.assignmentId);
      const events = await h.taxi.listDuePartnerNotifications();
      expect(events).toHaveLength(2);
      expect(
        events.map((e) => [
          e.eventType,
          e.assignmentVersion,
          e.payload.eventSequence,
        ]),
      ).toEqual([
        ["assignment_disclosure_ready", 1, 1],
        ["assignment_replaced", 2, 2],
      ]);
      expect(await h.taxi.findPartnerNotificationRelevance("order-qa")).toEqual(
        { status: "assigned", assignmentVersion: 2 },
      );
      expect(
        (
          await h.pool.query(
            "SELECT status FROM ops.phase1_dispatch_assignments WHERE assignment_id=$1",
            [second.assignmentId],
          )
        ).rows[0].status,
      ).toBe("assigned");
      const dispatch = vi.fn();
      const transport = new PartnerNotificationTransport(h.taxi, {
        resolveNotificationRoute: async () => ({ ready: true }),
        dispatchNotificationAttemptByWebhookId: dispatch,
      } as never);
      await expect(
        transport.send({
          providerName: "partner_webhook",
          message: events[0]!,
          context: {},
        }),
      ).rejects.toMatchObject({
        failure: { failureReason: "notification_superseded" },
      });
      expect(dispatch).not.toHaveBeenCalled();
    });

    it("rolls back assignment, reservations, outbox and sequence on SQL failure", async () => {
      const a = await assignmentHarness();
      await h.pool
        .query(`CREATE FUNCTION ops.qa_reject_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'qa outbox fault'; END $$;
      CREATE TRIGGER qa_reject_outbox BEFORE INSERT ON ops.consumer_notification_outbox FOR EACH ROW EXECUTE FUNCTION ops.qa_reject_outbox()`);
      try {
        await expect(a.assign()).rejects.toThrow("qa outbox fault");
        for (const table of [
          "ops.phase1_dispatch_assignments",
          "ops.phase1_driver_tasks",
          "ops.dispatch_resource_reservations",
          "ops.consumer_notification_outbox",
        ])
          expect(
            (await h.pool.query(`SELECT * FROM ${table}`)).rows,
          ).toHaveLength(0);
        expect(
          (
            await h.pool.query(
              "SELECT next_sequence FROM mobility.phase1_partner_notification_sequences WHERE order_id='order-qa'",
            )
          ).rows[0].next_sequence,
        ).toBe("1");
        expect(
          await h.taxi.findPartnerNotificationRelevance("order-qa"),
        ).toEqual({ status: "ready_for_dispatch", assignmentVersion: 0 });
      } finally {
        await h.pool.query(
          "DROP TRIGGER qa_reject_outbox ON ops.consumer_notification_outbox; DROP FUNCTION ops.qa_reject_outbox()",
        );
      }
    });

    it("retains the original task generation on delayed ETA after reassignment", async () => {
      const a = await assignmentHarness();
      const first = await a.assign();
      await a.service.updateDriverTaskEta(first.taskId, 7);
      const eta = (await h.taxi.listDuePartnerNotifications()).find(
        (event) => event.eventType === "eta_changed",
      )!;
      expect(eta).toMatchObject({
        assignmentVersion: 1,
        payload: { eventSequence: 2, taskId: first.taskId },
      });
      await a.assign(first.assignmentId);
      await h.owned.withTransaction((tx) =>
        h.owned.persistOrderWorkflow(tx, {
          consumerNotificationOutbox: [
            { ...eta, outboxId: "delayed-eta", assignmentVersion: null },
          ],
        }),
      );
      expect(
        (await h.taxi.listDuePartnerNotifications()).find(
          (event) => event.outboxId === "delayed-eta",
        ),
      ).toMatchObject({ assignmentVersion: 1, payload: { eventSequence: 4 } });
      expect(await h.taxi.findPartnerNotificationRelevance("order-qa")).toEqual(
        { status: "assigned", assignmentVersion: 2 },
      );
    });

    it("gives disclosure MAX priority and limits the count fallback to business dispatch", async () => {
      const a = await assignmentHarness();
      const first = await a.assign();
      await a.assign(first.assignmentId);
      await h.pool.query(
        `INSERT INTO ops.passenger_dispatch_disclosure_snapshots
      (snapshot_id,order_id,dispatch_job_id,assignment_id,assignment_version,record,created_at)
      VALUES ('snapshot','order-qa','job-qa',$1,9,'{}',now())`,
        [first.assignmentId],
      );
      expect(await h.taxi.findPartnerNotificationRelevance("order-qa")).toEqual(
        { status: "assigned", assignmentVersion: 9 },
      );
      await h.pool.query(
        "DELETE FROM ops.passenger_dispatch_disclosure_snapshots",
      );
      expect(await h.taxi.findPartnerNotificationRelevance("order-qa")).toEqual(
        { status: "assigned", assignmentVersion: 2 },
      );
      await h.pool.query(
        "UPDATE ops.phase1_owned_orders SET runtime_profile_code='multi_taxi_direct' WHERE order_id='order-qa'",
      );
      expect(await h.taxi.findPartnerNotificationRelevance("order-qa")).toEqual(
        { status: "assigned", assignmentVersion: 0 },
      );
    });

    it("persists cancellation with its assignment generation and the next notification sequence", async () => {
      const a = await assignmentHarness();
      await a.assign();
      await a.service.cancelOwnedOrder("order-qa", {});
      expect(await h.taxi.findPartnerNotificationRelevance("order-qa")).toEqual(
        { status: "cancelled", assignmentVersion: 1 },
      );
      const cancelled = (await h.taxi.listDuePartnerNotifications()).find(
        (e) => e.eventType === "trip_cancelled",
      );
      expect(cancelled).toMatchObject({
        assignmentVersion: 1,
        payload: { eventSequence: 2 },
      });
    });
  },
);
