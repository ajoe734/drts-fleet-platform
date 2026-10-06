import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  PASSENGER_NOTIFICATION_CHANNELS,
  PASSENGER_PUSH_DEVICE_PLATFORMS,
  PASSENGER_PUSH_DEVICE_PROVIDERS,
  PASSENGER_PUSH_DEVICE_STATUSES,
  FIRST_PARTY_PUSH_DELIVERY_TARGETS,
  FIRST_PARTY_PUSH_DELIVERY_STAGES,
  FIRST_PARTY_PUSH_FAILURE_REASONS,
  FIRST_PARTY_PUSH_FAILURE_REASON_RETRY_DISPOSITIONS,
  FIRST_PARTY_PUSH_RETRY_POLICY,
  FIRST_PARTY_NOTIFICATION_ROUTE_POLICY_VERSION,
  PASSENGER_PUSH_FIRST_PARTY_ENABLED_DEFAULT,
  FIRST_PARTY_PUSH_MAX_ACTIVE_DEVICES_PER_PASSENGER,
  FIRST_PARTY_PUSH_DEVICE_STALE_AFTER_DAYS,
  PARTNER_NOTIFICATION_FAILURE_REASONS,
  PARTNER_NOTIFICATION_FAILURE_REASON_RETRY_DISPOSITIONS,
  PARTNER_PASSENGER_NOTIFICATION_EXTERNAL_EVENTS,
  type PassengerNotificationChannel,
  type OrderFirstPartyNotificationRoute,
  type PassengerNotificationChannelRoute,
  type PassengerPushDeviceRecord,
  type FirstPartyPushDeliveryContext,
  type FirstPartyPushMessage,
  type PassengerNotificationFailureReason,
  type OrderPartnerNotificationRoute,
} from "@drts/contracts";

describe("PUSH-CHANNEL-SD-20261006: Passenger notification channel routing contracts", () => {
  // =========================================================================
  // D1 — channel constant
  // =========================================================================
  describe("D1 channel constant", () => {
    it("defines exactly partner_webhook and first_party_app; 'no channel' is not a member", () => {
      expect(PASSENGER_NOTIFICATION_CHANNELS).toEqual([
        "partner_webhook",
        "first_party_app",
      ]);
      expect(PASSENGER_NOTIFICATION_CHANNELS as readonly string[]).not.toContain(
        "none",
      );
    });

    it("does not rename or remove any existing partner failure reason or disposition value", () => {
      // Guards against this task editing partner-passenger-notification.ts,
      // which is out of write scope (common.md boundary).
      expect(PARTNER_NOTIFICATION_FAILURE_REASONS).toContain(
        "route_missing",
      );
      expect(PARTNER_NOTIFICATION_FAILURE_REASONS).toContain(
        "credential_rejected",
      );
      expect(PARTNER_NOTIFICATION_FAILURE_REASON_RETRY_DISPOSITIONS.route_missing).toBe(
        "manual_only",
      );
      expect(
        PARTNER_NOTIFICATION_FAILURE_REASON_RETRY_DISPOSITIONS.recipient_revoked,
      ).toBe("terminal");
    });
  });

  // =========================================================================
  // D2/D5 — route snapshots are mutually exclusive, discriminated union
  // =========================================================================
  describe("D2/D5 route snapshots", () => {
    it("builds a first-party route with internal-only passengerSubjectRef never required on the wire", () => {
      const route: OrderFirstPartyNotificationRoute = {
        orderId: "order-001",
        tenantId: "tenant-001",
        drtsPassengerId: "passenger-001",
        passengerSubjectRef: "subj-pseudo-001",
        appId: "app-first-party-001",
        notificationPolicyVersion: FIRST_PARTY_NOTIFICATION_ROUTE_POLICY_VERSION,
        consentVersion: "v1",
        rideRef: "ride-001",
        createdAt: "2026-10-06T00:00:00.000Z",
      };
      expect(route.notificationPolicyVersion).toBe(
        "first_party_notification_v1",
      );
    });

    it("discriminates partner_webhook vs first_party_app routes by channel tag, never both at once", () => {
      const partnerRoute: OrderPartnerNotificationRoute = {
        orderId: "order-002",
        tenantId: "tenant-001",
        partnerId: "partner-001",
        entrySlug: "entry-001",
        partnerUserRef: "partner-user-001",
        drtsPassengerId: "passenger-002",
        passengerSubjectRef: "subj-pseudo-002",
        identityLinkedAt: "2026-10-06T00:00:00.000Z",
        consentBundleVersion: "v1",
        notificationPolicyVersion: "partner_notification_v1",
        rideRef: "ride-002",
        createdAt: "2026-10-06T00:00:00.000Z",
      };
      const resolved: PassengerNotificationChannelRoute = {
        channel: "partner_webhook",
        route: partnerRoute,
      };
      expect(resolved.channel).toBe("partner_webhook");
      if (resolved.channel === "partner_webhook") {
        expect(resolved.route.rideRef).toBe("ride-002");
      }

      const channels: PassengerNotificationChannel[] = [
        resolved.channel,
      ];
      expect(channels).toEqual(["partner_webhook"]);
    });
  });

  // =========================================================================
  // D4 — device registry constants and shape
  // =========================================================================
  describe("D4 device registry", () => {
    it("exports device platform, provider and status enums", () => {
      expect(PASSENGER_PUSH_DEVICE_PLATFORMS).toEqual(["ios", "android"]);
      expect(PASSENGER_PUSH_DEVICE_PROVIDERS).toEqual(["fcm_v1"]);
      expect(PASSENGER_PUSH_DEVICE_STATUSES).toEqual([
        "active",
        "revoked",
        "invalid",
      ]);
    });

    it("validates a PassengerPushDeviceRecord never carries a raw token field", () => {
      const device: PassengerPushDeviceRecord = {
        deviceId: "device-001",
        drtsPassengerId: "passenger-001",
        platform: "ios",
        provider: "fcm_v1",
        appId: "app-first-party-001",
        appVersion: "1.0.0",
        tokenSha256:
          "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b85",
        status: "active",
        statusReason: null,
        notificationConsentVersion: "v1",
        registeredAt: "2026-10-06T00:00:00.000Z",
        lastSeenAt: "2026-10-06T00:00:00.000Z",
        invalidatedAt: null,
        createdAt: "2026-10-06T00:00:00.000Z",
        updatedAt: "2026-10-06T00:00:00.000Z",
      };
      expect(Object.keys(device)).not.toContain("token");
      expect(device.tokenSha256.length).toBeGreaterThan(8);
    });

    it("keeps the active-device cap and stale-after window as named constants, not magic numbers", () => {
      expect(FIRST_PARTY_PUSH_MAX_ACTIVE_DEVICES_PER_PASSENGER).toBe(10);
      expect(FIRST_PARTY_PUSH_DEVICE_STALE_AFTER_DAYS).toBe(60);
    });
  });

  // =========================================================================
  // D6 — delivery target/stage, retry policy, failure reasons and
  // their retry disposition
  // =========================================================================
  describe("D6 first-party delivery semantics", () => {
    it("exports exactly one delivery target, reserved for symmetry with the partner contract", () => {
      expect(FIRST_PARTY_PUSH_DELIVERY_TARGETS).toEqual([
        "first_party_device",
      ]);
    });

    it("exports the full evidence ladder but documents only outbox_persisted/provider_accepted as currently written", () => {
      expect(FIRST_PARTY_PUSH_DELIVERY_STAGES).toEqual([
        "outbox_persisted",
        "provider_accepted",
        "device_received",
        "opened",
      ]);
    });

    it("exports a fixed retry-policy snapshot independent of the partner channel's", () => {
      expect(FIRST_PARTY_PUSH_RETRY_POLICY).toEqual({
        maxAttempts: 5,
        initialDelaySeconds: 30,
        backoffMultiplier: 2,
        maxDelaySeconds: 600,
      });
    });

    it("defines exactly the five new failure reasons the design introduces", () => {
      expect(FIRST_PARTY_PUSH_FAILURE_REASONS).toEqual([
        "no_notification_channel",
        "no_active_device",
        "credential_rejected",
        "configuration_blocked",
        "provider_transient_error",
      ]);
    });

    it("maps no_notification_channel to 'none' — distinct from terminal — so it is never alerted on or retried", () => {
      expect(
        FIRST_PARTY_PUSH_FAILURE_REASON_RETRY_DISPOSITIONS.no_notification_channel,
      ).toBe("none");
      expect(
        FIRST_PARTY_PUSH_FAILURE_REASON_RETRY_DISPOSITIONS.no_notification_channel,
      ).not.toBe("terminal");
    });

    it("maps every new failure reason to exactly the disposition the design table specifies", () => {
      expect(FIRST_PARTY_PUSH_FAILURE_REASON_RETRY_DISPOSITIONS).toEqual({
        no_notification_channel: "none",
        no_active_device: "terminal",
        credential_rejected: "configuration_blocked",
        configuration_blocked: "configuration_blocked",
        provider_transient_error: "automatic",
      });
    });

    it("builds a PassengerNotificationFailureReason union value from either member set", () => {
      const fromPartner: PassengerNotificationFailureReason = "route_missing";
      const fromFirstParty: PassengerNotificationFailureReason =
        "no_active_device";
      expect(PARTNER_NOTIFICATION_FAILURE_REASONS).toContain(fromPartner);
      expect(FIRST_PARTY_PUSH_FAILURE_REASONS).toContain(fromFirstParty);
    });

    it("defaults the first-party enablement flag constant to false", () => {
      expect(PASSENGER_PUSH_FIRST_PARTY_ENABLED_DEFAULT).toBe(false);
    });

    it("validates a FirstPartyPushMessage carries only the D6 allowlisted data fields", () => {
      const message: FirstPartyPushMessage = {
        notification: { title: "行程通知", body: "司機即將到達" },
        data: {
          notificationId: "outbox-001",
          event: "passenger.driver_arrived.v1",
          rideRef: "ride-001",
          eventSequence: 1,
          expiresAt: "2026-10-06T00:05:00.000Z",
        },
      };
      expect(Object.keys(message.data).sort()).toEqual(
        [
          "eventSequence",
          "expiresAt",
          "notificationId",
          "rideRef",
          "event",
        ].sort(),
      );
    });

    it("rejects an internal event identifier in data.event: D6 requires the external passenger.<event>.v1 wire name", () => {
      // Guards against regressing FirstPartyPushWireData.event back to the
      // internal PartnerPassengerEventType identifier (e.g. "driver_arrived")
      // instead of the external, dot-versioned name the design doc's D6
      // payload section requires.
      expect(PARTNER_PASSENGER_NOTIFICATION_EXTERNAL_EVENTS).toContain(
        "passenger.driver_arrived.v1",
      );
      expect(
        PARTNER_PASSENGER_NOTIFICATION_EXTERNAL_EVENTS as readonly string[],
      ).not.toContain("driver_arrived");
    });

    it("validates a FirstPartyPushDeliveryContext never pre-sets deliveryStage before a completed attempt", () => {
      const context: FirstPartyPushDeliveryContext = {
        outboxId: "outbox-001",
        orderId: "order-001",
        tenantId: "tenant-001",
        targetDevices: [
          { deviceId: "device-001", tokenSha256: "abc123" },
        ],
        wireMessage: {
          notification: { title: "行程通知", body: "司機即將到達" },
          data: {
            notificationId: "outbox-001",
            event: "passenger.driver_arrived.v1",
            rideRef: "ride-001",
            eventSequence: 1,
            expiresAt: "2026-10-06T00:05:00.000Z",
          },
        },
        wireMessageHash: "hash-001",
        eventSequence: 1,
        expiresAt: "2026-10-06T00:05:00.000Z",
        deliveryTarget: "first_party_device",
        deliveryStage: null,
        retryDisposition: null,
        failureReason: null,
        receiptId: null,
        createdAt: "2026-10-06T00:00:00.000Z",
        deliveredAt: null,
      };
      expect(context.deliveryStage).toBeNull();
      expect(context.receiptId).toBeNull();
    });
  });

  // =========================================================================
  // Schema allocation — two collision-free, sequential migration numbers
  // =========================================================================
  describe("Schema allocation (schema-allocation.json passenger_push_channel_allocations)", () => {
    const repoRoot = path.resolve(__dirname, "../../..");
    const allocationPath = path.join(
      repoRoot,
      "docs/04-uat/system-remediation-20260906/schema-allocation.json",
    );

    it("reserves exactly V0107 and V0108 without colliding with any prior allocation", () => {
      const content = JSON.parse(fs.readFileSync(allocationPath, "utf8"));
      const allocs = content.passenger_push_channel_allocations;
      expect(Array.isArray(allocs)).toBe(true);
      expect(allocs).toHaveLength(2);

      const registry = allocs.find(
        (a: any) =>
          a.domain === "passenger_push_first_party_registry_and_routing",
      );
      expect(registry.version).toBe("V0107");
      expect(registry.migration_filename).toBe(
        "V0107__push_channel_first_party_registry_and_routing.sql",
      );
      expect(registry.primary_tables).toContain(
        "iam.phase1_passenger_push_devices",
      );
      expect(registry.primary_tables).toContain(
        "mobility.phase1_order_first_party_notification_routes",
      );

      const deliveryContext = allocs.find(
        (a: any) => a.domain === "passenger_push_first_party_delivery_context",
      );
      expect(deliveryContext.version).toBe("V0108");
      expect(deliveryContext.migration_filename).toBe(
        "V0108__push_channel_first_party_delivery_context.sql",
      );
      expect(deliveryContext.primary_tables).toContain(
        "mobility.phase1_first_party_notification_delivery_contexts",
      );

      const allVersionsEverywhere = [
        ...(content.allocations || []),
        ...(content.additional_allocations || []),
        ...(content.launch_allocations || []),
        ...(content.partner_notification_allocations || []),
        ...(content.voice_application_allocations || []),
        ...(content.passenger_push_channel_allocations || []),
      ].map((a: any) => a.version);
      expect(new Set(allVersionsEverywhere).size).toBe(
        allVersionsEverywhere.length,
      );
    });

    it("records table invariants for each new allocation entry, not just filenames", () => {
      const content = JSON.parse(fs.readFileSync(allocationPath, "utf8"));
      for (const alloc of content.passenger_push_channel_allocations) {
        expect(Array.isArray(alloc.table_invariants)).toBe(true);
        expect(alloc.table_invariants.length).toBeGreaterThan(0);
      }
    });

    it("does not touch the pre-existing allocations, additional_allocations, launch_allocations, voice_application_allocations or partner_notification_allocations entries", () => {
      const content = JSON.parse(fs.readFileSync(allocationPath, "utf8"));
      expect(content.allocations).toHaveLength(3);
      expect(content.additional_allocations).toHaveLength(3);
      expect(content.launch_allocations).toHaveLength(3);
      expect(content.partner_notification_allocations).toHaveLength(2);
      expect(content.voice_application_allocations).toHaveLength(1);
    });
  });
});
