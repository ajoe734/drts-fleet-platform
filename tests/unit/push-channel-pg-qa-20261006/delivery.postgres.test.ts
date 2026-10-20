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
import { MultiTaxiService } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.service";
import { FirstPartyNotificationTransport } from "../../../apps/api/src/modules/multi-taxi/first-party-notification.transport";
import { FcmFirstPartyPushProvider } from "../../../apps/api/src/modules/multi-taxi/fcm-push.provider";
import { PassengerPushDevicesService } from "../../../apps/api/src/modules/passenger-push-devices/passenger-push-devices.service";
import type { RecordPushDeliveryOutcomeInput } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.repository";
import { databaseUrl, PostgresHarness } from "./postgres-harness";

describe.skipIf(!databaseUrl)(
  "passenger channel and delivery PostgreSQL",
  () => {
    const h = new PostgresHarness();
    beforeAll(() => h.open(), 120_000);
    afterAll(() => h.close());
    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
    });
    beforeEach(async () => {
      await h.reset();
      await h.entry();
      vi.stubEnv("PASSENGER_PUSH_FIRST_PARTY_ENABLED", "true");
      vi.stubEnv("PASSENGER_PUSH_FCM_PROJECT_ID", "synthetic-project");
    });

    function deliveryHarness() {
      // Only the remote credential/provider boundaries are mocked. Every DB
      // query, claim, context, eligibility recheck and outcome is production code.
      const accessToken = vi.fn(async () => "synthetic-access-token");
      const network = vi.fn<typeof fetch>(
        async () =>
          new Response(JSON.stringify({ error: { status: "UNAVAILABLE" } }), {
            status: 503,
          }),
      );
      const provider = new FcmFirstPartyPushProvider(
        { accessToken, identityToken: vi.fn() },
        network,
      );
      const transport = new FirstPartyNotificationTransport(
        h.taxi,
        new PassengerPushDevicesService(h.devices),
        provider,
      );
      const partnerSend = vi.fn();
      const service = new MultiTaxiService(
        {} as never,
        h.taxi,
        undefined,
        undefined,
        undefined,
        { transportMode: "partner_webhook", send: partnerSend } as never,
        undefined,
        undefined,
        undefined,
        transport,
      );
      return { service, transport, network, accessToken, partnerSend };
    }

    async function firstParty() {
      await h.order();
      await h.devices.writeFirstPartyRoute(h.firstRoute());
      const device = await h.device("original-token");
      await h.devices.touchDevice(device.deviceId);
      const event = await h.event();
      return { event, device, ...deliveryHarness() };
    }
    async function due() {
      await h.pool.query(
        "UPDATE ops.consumer_notification_outbox SET next_attempt_at=now()-interval '1 second'",
      );
    }
    async function corruptDualRoute(orderId: string) {
      // Deliberately inject corrupt historical data; production writers must
      // prevent this. The router must still fail closed if it encounters it.
      await h.pool.query(
        `INSERT INTO mobility.phase1_order_partner_notification_routes
      (order_id,tenant_id,partner_id,entry_slug,partner_user_ref,drts_passenger_id,passenger_subject_ref,identity_linked_at,consent_bundle_version,ride_ref)
      VALUES ($1,'tenant-qa','partner-qa','entry-qa','opaque-qa','passenger-qa','passenger-qa',now(),'v1',$2)`,
        [orderId, `partner-${orderId}`],
      );
    }

    it("resolves all four outcomes from persisted order snapshots", async () => {
      await h.taxi.writeOrderPartnerNotificationRoute(
        h.partnerRoute("partner"),
      );
      await h.devices.writeFirstPartyRoute(h.firstRoute("first"));
      await h.devices.writeFirstPartyRoute(h.firstRoute("both"));
      await corruptDualRoute("both");
      for (const [order, channel] of [
        ["partner", "partner_webhook"],
        ["first", "first_party_app"],
        ["both", "ambiguous"],
        ["neither", "none"],
      ])
        expect(
          await h.taxi.resolvePassengerNotificationChannel(order!),
        ).toMatchObject({ channel });
    });

    it("seals no_notification_channel and never selects or reclaims it", async () => {
      const d = deliveryHarness();
      const event = await h.event();
      expect(await d.service.deliverPassengerNotification(event)).toMatchObject(
        {
          status: "failed",
          result: "provider_not_configured",
          failureReason: "no_notification_channel",
          retryDisposition: "none",
          deliveryTarget: null,
        },
      );
      await due();
      expect(await h.taxi.listDuePartnerNotifications()).toEqual([]);
      expect(
        await h.taxi.claimPartnerNotification(event.outboxId, "retry", 120),
      ).toBeNull();
      expect(d.network).not.toHaveBeenCalled();
      expect(d.partnerSend).not.toHaveBeenCalled();
    });

    it("ambiguous routes are manual-only and fan out to neither transport", async () => {
      await h.devices.writeFirstPartyRoute(h.firstRoute());
      await corruptDualRoute("order-qa");
      const d = deliveryHarness();
      expect(
        await d.service.deliverPassengerNotification(await h.event()),
      ).toMatchObject({
        failureReason: "route_ambiguous",
        retryDisposition: "manual_only",
      });
      await due();
      expect(await h.taxi.listDuePartnerNotifications()).toEqual([]);
      expect(d.partnerSend).not.toHaveBeenCalled();
      expect(d.network).not.toHaveBeenCalled();
    });

    it("two service workers contend for one outbox and commit only one attempt", async () => {
      const event = await h.event();
      const results = await Promise.allSettled([
        deliveryHarness().service.deliverPassengerNotification(event),
        deliveryHarness().service.deliverPassengerNotification(event),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
      expect(
        (
          await h.pool.query(
            "SELECT attempt_count FROM ops.consumer_notification_outbox",
          )
        ).rows[0].attempt_count,
      ).toBe(1);
      expect(
        (await h.pool.query("SELECT * FROM ops.phase1_push_delivery_receipts"))
          .rows,
      ).toHaveLength(1);
    });

    it("retries the frozen context, excluding rotated tokens and newly registered devices", async () => {
      const d = await firstParty();
      const survivor = await h.device("survivor-token");
      await h.devices.touchDevice(survivor.deviceId);
      expect(
        await d.service.deliverPassengerNotification(d.event),
      ).toMatchObject({
        retryDisposition: "automatic",
        failureReason: "provider_transient_error",
      });
      const original = (await h.taxi.findFirstPartyNotificationContextAndTokens(
        d.event.outboxId,
      ))!.context;
      expect(original.targetDevices).toHaveLength(2);
      expect(JSON.stringify(original)).not.toContain("original-token");
      await h.devices.registerDevice({
        drtsPassengerId: "passenger-qa",
        platform: "android",
        provider: "fcm_v1",
        appId: "app-qa",
        appVersion: "2",
        notificationConsentVersion: "v1",
        token: "rotated-token",
        previousDeviceId: d.device.deviceId,
      });
      const newDevice = await h.device("new-arrival");
      await h.devices.touchDevice(newDevice.deviceId);
      await due();
      d.network.mockClear();
      d.network.mockResolvedValue(
        new Response(
          JSON.stringify({
            name: "projects/synthetic-project/messages/accepted",
          }),
          { status: 200 },
        ),
      );
      expect(
        await d.service.deliverPassengerNotification(d.event),
      ).toMatchObject({
        status: "delivered",
        deliveryStage: "provider_accepted",
        receiptId: "projects/synthetic-project/messages/accepted",
      });
      expect(d.network).toHaveBeenCalledTimes(1);
      expect(
        JSON.parse(String(d.network.mock.calls[0]![1]!.body)).message.token,
      ).toBe("survivor-token");
      const current = (await h.taxi.findFirstPartyNotificationContextAndTokens(
        d.event.outboxId,
      ))!.context;
      expect(current.targetDevices).toEqual(original.targetDevices);
      expect(current.wireMessage).toEqual(original.wireMessage);
      expect(current.wireMessageHash).toBe(original.wireMessageHash);
      expect(await h.taxi.listDuePartnerNotifications()).toEqual([]);
      expect(
        (
          await h.pool.query(
            "SELECT device_delivery_state FROM ops.phase1_push_delivery_receipts WHERE provider_message_ref IS NOT NULL",
          )
        ).rows,
      ).toEqual([{ device_delivery_state: "unknown" }]);
    });

    it("rejects changes to every immutable context field while allowing delivery evidence", async () => {
      const d = await firstParty();
      await d.service.deliverPassengerNotification(d.event);
      const original = (await h.taxi.findFirstPartyNotificationContextAndTokens(
        d.event.outboxId,
      ))!.context;
      const mutations = [
        "outbox_id='other'",
        "order_id='other'",
        "tenant_id='other'",
        "route_snapshot='{}'",
        "target_devices='[]'",
        "retry_policy_snapshot='{}'",
        "wire_message='{}'",
        "wire_message_hash='other'",
        "event_sequence=2",
        "expires_at=expires_at+interval '1 second'",
        "delivery_target='partner_endpoint'",
        "created_at=created_at+interval '1 second'",
      ];
      for (const mutation of mutations)
        await expect(
          h.pool.query(
            `UPDATE mobility.phase1_first_party_notification_delivery_contexts SET ${mutation}`,
          ),
        ).rejects.toThrow("immutable");
      expect(
        (await h.taxi.findFirstPartyNotificationContextAndTokens(
          d.event.outboxId,
        ))!.context,
      ).toEqual(original);
      await due();
      const claim = (await h.taxi.claimPartnerNotification(
        d.event.outboxId,
        "retry",
        120,
      ))!;
      const replay = await h.taxi.prepareFirstPartyNotificationContext(
        { ...original, targetDevices: [], wireMessageHash: "changed" },
        claim.fenceToken,
      );
      expect(replay).toEqual(original);
    });

    it("fences expired context preparation, token resolution and outcome writes", async () => {
      const d = await firstParty();
      await d.service.deliverPassengerNotification(d.event);
      const context = (await h.taxi.findFirstPartyNotificationContextAndTokens(
        d.event.outboxId,
      ))!.context;
      await due();
      const claim = (await h.taxi.claimPartnerNotification(
        d.event.outboxId,
        "old",
        120,
      ))!;
      await h.pool.query(
        "UPDATE ops.phase1_push_delivery_claims SET lease_expires_at=now()-interval '1 second'",
      );
      await expect(
        h.taxi.prepareFirstPartyNotificationContext(context, claim.fenceToken),
      ).rejects.toThrow("fence lost");
      await expect(
        h.taxi.findFirstPartyNotificationDeviceToken(
          context,
          context.targetDevices[0]!,
          claim.fenceToken,
        ),
      ).rejects.toThrow("fence lost");
      const input = outcome(context, claim.fenceToken);
      expect(await h.taxi.recordPushDeliveryOutcome(input)).toEqual({
        recorded: false,
        reason: "fence_lost",
      });
      await due();
      const replacement = (await h.taxi.claimPartnerNotification(
        d.event.outboxId,
        "new",
        120,
      ))!;
      expect(replacement.fenceToken).toBeGreaterThan(claim.fenceToken);
      expect(await h.taxi.recordPushDeliveryOutcome(input)).toEqual({
        recorded: false,
        reason: "fence_lost",
      });
    });

    function outcome(
      context: NonNullable<
        Awaited<
          ReturnType<typeof h.taxi.findFirstPartyNotificationContextAndTokens>
        >
      >["context"],
      fenceToken: number,
    ): RecordPushDeliveryOutcomeInput {
      const now = new Date().toISOString();
      return {
        outboxId: context.outboxId,
        passengerSubjectRef: "passenger-qa",
        fenceToken,
        providerName: "first_party_app",
        providerAckState: "provider_acknowledged",
        providerMessageRef: "projects/synthetic-project/messages/accepted",
        firstPartyMetadata: {
          ...context,
          receiptId: "projects/synthetic-project/messages/accepted",
          deliveryStage: "provider_accepted",
          failureReason: null,
          retryDisposition: "none",
        },
        deliveryOutcome: {
          outboxId: context.outboxId,
          status: "delivered",
          result: "delivered",
          attemptCount: 2,
          nextAttemptAt: now,
          deliveredAt: now,
          providerName: "first_party_app",
        },
      };
    }

    it("rolls back first-party context, receipt and claim release when final outbox update fails", async () => {
      const d = await firstParty();
      await d.service.deliverPassengerNotification(d.event);
      const original = (await h.taxi.findFirstPartyNotificationContextAndTokens(
        d.event.outboxId,
      ))!.context;
      await due();
      const claim = (await h.taxi.claimPartnerNotification(
        d.event.outboxId,
        "retry",
        120,
      ))!;
      const input = outcome(original, claim.fenceToken);
      input.deliveryOutcome.status = "invalid" as never;
      await expect(
        h.taxi.recordPushDeliveryOutcome(input),
      ).rejects.toMatchObject({ code: "23514" });
      expect(
        (await h.taxi.findFirstPartyNotificationContextAndTokens(
          d.event.outboxId,
        ))!.context,
      ).toEqual(original);
      expect(
        (
          await h.pool.query(
            "SELECT * FROM ops.phase1_push_delivery_receipts WHERE fence_token=$1",
            [claim.fenceToken],
          )
        ).rows,
      ).toHaveLength(0);
      expect(
        (
          await h.pool.query(
            "SELECT claim_state FROM ops.phase1_push_delivery_claims",
          )
        ).rows[0].claim_state,
      ).toBe("claimed");
    });

    it("the unset feature flag persists configuration_blocked without metadata or FCM requests", async () => {
      const d = await firstParty();
      vi.stubEnv("PASSENGER_PUSH_FIRST_PARTY_ENABLED", undefined);
      expect(
        await d.service.deliverPassengerNotification(d.event),
      ).toMatchObject({
        result: "provider_not_configured",
        failureReason: "configuration_blocked",
      });
      expect(d.accessToken).not.toHaveBeenCalled();
      expect(d.network).not.toHaveBeenCalled();
      expect(
        await h.taxi.findFirstPartyNotificationContextAndTokens(
          d.event.outboxId,
        ),
      ).toBeNull();
      await due();
      expect(await h.taxi.listDuePartnerNotifications()).toEqual([]);
    });

    it("rechecks durable device revocation after metadata await and sends no FCM request", async () => {
      const d = await firstParty();
      d.accessToken.mockImplementation(async () => {
        await h.devices.revokeDevice(d.device.deviceId);
        return "synthetic-access-token";
      });
      expect(
        await d.service.deliverPassengerNotification(d.event),
      ).toMatchObject({
        failureReason: "no_active_device",
        retryDisposition: "terminal",
      });
      expect(d.accessToken).toHaveBeenCalledOnce();
      expect(d.network).not.toHaveBeenCalled();
    });
  },
);
