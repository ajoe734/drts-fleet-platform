import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  PARTNER_NOTIFICATION_SCHEMA_VERSION,
  PARTNER_PASSENGER_EVENT_TO_EXTERNAL_NAME,
  PARTNER_PASSENGER_NOTIFICATION_EXTERNAL_EVENTS,
  PARTNER_NOTIFICATION_TEST_EXTERNAL_EVENT,
  PARTNER_ENTRY_NOTIFICATION_BINDING_STATES,
  PARTNER_ENTRY_NOTIFICATION_BINDING_PURPOSE,
  PARTNER_NOTIFICATION_ACKNOWLEDGEMENT_POLICY,
  ORDER_PARTNER_NOTIFICATION_ROUTE_POLICY_VERSION,
  PARTNER_PASSENGER_NAVIGATION_TYPES,
  PARTNER_NOTIFICATION_ACK_STATUSES,
  PARTNER_NOTIFICATION_DELIVERY_STAGES,
  PARTNER_NOTIFICATION_DELIVERY_TARGETS,
  PARTNER_NOTIFICATION_DOWNSTREAM_STATUSES,
  PARTNER_NOTIFICATION_RETRY_DISPOSITIONS,
  PARTNER_NOTIFICATION_FAILURE_REASONS,
  PARTNER_NOTIFICATION_FAILURE_REASON_RETRY_DISPOSITIONS,
  PARTNER_NOTIFICATION_ATTEMPT_TIMEOUT_MS,
  PARTNER_NOTIFICATION_MAX_ACK_BODY_BYTES,
  PASSENGER_PUSH_DELIVERY_RESULTS,
  type PartnerEntryNotificationBinding,
  type OrderPartnerNotificationRoute,
  type PartnerPassengerNotificationWirePayload,
  type PartnerPassengerNotificationTestWirePayload,
  type PartnerNotificationAcceptedAck,
  type PartnerNotificationTypedFailure,
  type PartnerNotificationDispatchOutcome,
  type PartnerNotificationDeliveryContext,
  type ConsumerNotificationOutboxRecord,
  type TenantWebhookEndpoint,
} from "@drts/contracts";

describe("SR-PARTNER-NOTIFY-CON-20260917: Partner Passenger Notification Contract & Migration Allocation", () => {
  const repoRoot = path.resolve(__dirname, "../../../..");

  // ==========================================================================
  // 1. Compatibility guard — the outbox / result enums this task must not touch
  // ==========================================================================
  describe("Existing outbox and result enums are unchanged", () => {
    it("ConsumerNotificationOutboxRecord.status keeps exactly its four values", () => {
      const record: ConsumerNotificationOutboxRecord = {
        outboxId: "outbox-001",
        orderId: "order-001",
        passengerSubjectRef: "subj-001",
        eventType: "assignment_disclosure_ready",
        assignmentVersion: 1,
        payload: {},
        status: "pending",
        attemptCount: 0,
        nextAttemptAt: "2026-09-18T00:00:00.000Z",
        createdAt: "2026-09-18T00:00:00.000Z",
        deliveredAt: null,
      };
      const allowed: ConsumerNotificationOutboxRecord["status"][] = [
        "pending",
        "sending",
        "delivered",
        "failed",
      ];
      expect(allowed).toContain(record.status);
      expect(allowed).toHaveLength(4);
    });

    it("PASSENGER_PUSH_DELIVERY_RESULTS keeps exactly its three values", () => {
      expect(PASSENGER_PUSH_DELIVERY_RESULTS).toEqual([
        "delivered",
        "provider_not_configured",
        "provider_error",
      ]);
    });

    it("TenantWebhookEndpoint keeps its existing required fields (no partner-binding fields added to it)", () => {
      const endpoint: TenantWebhookEndpoint = {
        webhookId: "wh-001",
        tenantId: "tenant-001",
        url: "https://partner.example.test/webhooks/drts",
        events: ["passenger.assignment_disclosure_ready.v1"],
        status: "active",
        secretVersion: 1,
        secretPreview: "sk_live_****",
        createdAt: "2026-09-18T00:00:00.000Z",
        updatedAt: "2026-09-18T00:00:00.000Z",
      };
      expect(endpoint.webhookId).toBe("wh-001");
      // The new binding references a webhook by id; it does not add fields here.
      expect((endpoint as any).bindingId).toBeUndefined();
    });
  });

  // ==========================================================================
  // 2. Event catalog — internal names unchanged; external names/version fixed
  // ==========================================================================
  describe("Event catalog (design §5)", () => {
    it("fixes schema_version at 1.0", () => {
      expect(PARTNER_NOTIFICATION_SCHEMA_VERSION).toBe("1.0");
    });

    it("maps each of the five internal event types to passenger.<name>.v1, unchanged internal names", () => {
      expect(PARTNER_PASSENGER_EVENT_TO_EXTERNAL_NAME).toEqual({
        assignment_disclosure_ready: "passenger.assignment_disclosure_ready.v1",
        assignment_replaced: "passenger.assignment_replaced.v1",
        eta_changed: "passenger.eta_changed.v1",
        driver_arrived: "passenger.driver_arrived.v1",
        receipt_ready: "passenger.receipt_ready.v1",
      });
      expect(PARTNER_PASSENGER_NOTIFICATION_EXTERNAL_EVENTS).toHaveLength(5);
      for (const name of Object.values(
        PARTNER_PASSENGER_EVENT_TO_EXTERNAL_NAME,
      )) {
        expect(PARTNER_PASSENGER_NOTIFICATION_EXTERNAL_EVENTS).toContain(name);
      }
    });

    it("keeps the binding-test event distinct and not part of the five real events", () => {
      expect(PARTNER_NOTIFICATION_TEST_EXTERNAL_EVENT).toBe(
        "passenger.notification.test.v1",
      );
      expect(
        PARTNER_PASSENGER_NOTIFICATION_EXTERNAL_EVENTS as readonly string[],
      ).not.toContain(PARTNER_NOTIFICATION_TEST_EXTERNAL_EVENT);
    });
  });

  // ==========================================================================
  // 3. Binding, route, wire payload and ack shapes
  // ==========================================================================
  describe("PartnerEntryNotificationBinding (design §3.1)", () => {
    it("exposes the fixed purpose/ack-policy literals and the three lifecycle states", () => {
      expect(PARTNER_ENTRY_NOTIFICATION_BINDING_PURPOSE).toBe(
        "passenger_notification",
      );
      expect(PARTNER_NOTIFICATION_ACKNOWLEDGEMENT_POLICY).toBe(
        "durable_partner_acceptance_v1",
      );
      expect(PARTNER_ENTRY_NOTIFICATION_BINDING_STATES).toEqual([
        "test_pending",
        "ready",
        "disabled",
      ]);
    });

    it("validates the structural shape of a ready binding", () => {
      const binding: PartnerEntryNotificationBinding = {
        bindingId: "bind-001",
        entrySlug: "yuhe-residence",
        tenantId: "tenant-001",
        partnerId: "partner-001",
        webhookId: "wh-001",
        version: 2,
        state: "ready",
        purpose: "passenger_notification",
        eventTypes: ["assignment_disclosure_ready", "eta_changed"],
        schemaVersion: "1.0",
        acknowledgementPolicy: "durable_partner_acceptance_v1",
        validatedEndpointFingerprint: "sha256:abc123",
        validatedAt: "2026-09-18T00:00:00.000Z",
        updatedAt: "2026-09-18T00:00:00.000Z",
      };
      expect(binding.state).toBe("ready");
      expect(binding.eventTypes).toContain("eta_changed");
    });
  });

  describe("OrderPartnerNotificationRoute (design §4)", () => {
    it("validates the frozen-route shape and keeps internal refs out of the type's own purpose fields", () => {
      const route: OrderPartnerNotificationRoute = {
        orderId: "order-001",
        tenantId: "tenant-001",
        partnerId: "partner-001",
        entrySlug: "yuhe-residence",
        partnerUserRef: "partner-user-ref-001",
        drtsPassengerId: "passenger-001",
        passengerSubjectRef: "subj-pseudo-001",
        identityLinkedAt: "2026-09-18T00:00:00.000Z",
        consentBundleVersion: "v3",
        notificationPolicyVersion: "partner_notification_v1",
        rideRef: "ride-ref-001",
        createdAt: "2026-09-18T00:00:00.000Z",
      };
      expect(route.notificationPolicyVersion).toBe(
        ORDER_PARTNER_NOTIFICATION_ROUTE_POLICY_VERSION,
      );
      // drtsPassengerId / passengerSubjectRef exist for reconciliation only;
      // callers building the wire payload must not source recipient from them.
      expect(route.drtsPassengerId).not.toBe(route.partnerUserRef);
    });
  });

  describe("Wire payload (design §6) and navigation (design §10)", () => {
    it("keeps navigation to type=ride + rideRef only, no deep-link token", () => {
      expect(PARTNER_PASSENGER_NAVIGATION_TYPES).toEqual(["ride"]);
    });

    it("validates a full real-event wire payload allowlist shape", () => {
      const payload: PartnerPassengerNotificationWirePayload = {
        event: "passenger.eta_changed.v1",
        deliveryId: "delivery-001",
        occurredAt: "2026-09-18T00:00:00.000Z",
        tenantId: "tenant-001",
        data: {
          schemaVersion: "1.0",
          notificationId: "outbox-001",
          partnerEntrySlug: "yuhe-residence",
          recipient: { partnerUserRef: "partner-user-ref-001" },
          rideRef: "ride-ref-001",
          eventSequence: 4,
          assignmentVersion: 2,
          expiresAt: "2026-09-18T00:02:00.000Z",
          message: "ETA updated",
          navigation: { type: "ride", rideRef: "ride-ref-001" },
          eta: { minutes: 6, asOf: "2026-09-18T00:00:00.000Z" },
        },
      };
      expect(payload.data.schemaVersion).toBe("1.0");
      expect(payload.data.eta?.minutes).toBe(6);
      // Prohibited-field guard: nothing on this allowlisted shape carries PII
      // such as phone/address/GPS/driverId/payment data (design §6).
      const forbiddenKeys = [
        "phone",
        "address",
        "gps",
        "driverId",
        "licenseNo",
        "paymentToken",
        "accessToken",
      ];
      for (const key of forbiddenKeys) {
        expect(Object.keys(payload.data)).not.toContain(key);
      }
    });

    it("validates the binding-test wire payload has no ride/recipient fields", () => {
      const testPayload: PartnerPassengerNotificationTestWirePayload = {
        event: "passenger.notification.test.v1",
        deliveryId: "delivery-test-001",
        occurredAt: "2026-09-18T00:00:00.000Z",
        tenantId: "tenant-001",
        data: {
          schemaVersion: "1.0",
          notificationId: "outbox-test-001",
          partnerEntrySlug: "yuhe-residence",
          message: "Binding test notification",
        },
      };
      expect(Object.keys(testPayload.data)).not.toContain("rideRef");
      expect(Object.keys(testPayload.data)).not.toContain("navigation");
    });
  });

  describe("Accepted/duplicate ack (design §7)", () => {
    it("keeps exactly accepted/duplicate as the two success statuses", () => {
      expect(PARTNER_NOTIFICATION_ACK_STATUSES).toEqual([
        "accepted",
        "duplicate",
      ]);
    });

    it("validates an accepted ack requires a non-synthetic receiptId", () => {
      const ack: PartnerNotificationAcceptedAck = {
        notificationId: "outbox-001",
        deliveryId: "delivery-001",
        partnerEntrySlug: "yuhe-residence",
        status: "accepted",
        receiptId: "partner-receipt-xyz",
      };
      expect(ack.receiptId).not.toBe(`receipt-${ack.notificationId}`);
      expect(ack.receiptId.length).toBeGreaterThan(0);
    });

    it("keeps the evidence ladder ordered outbox_persisted..opened and the v1-only delivery target", () => {
      expect(PARTNER_NOTIFICATION_DELIVERY_STAGES).toEqual([
        "outbox_persisted",
        "partner_accepted",
        "provider_accepted",
        "device_received",
        "opened",
      ]);
      expect(PARTNER_NOTIFICATION_DELIVERY_TARGETS).toEqual([
        "partner_endpoint",
      ]);
      // First version has no device callback: only "unknown" is a valid value.
      expect(PARTNER_NOTIFICATION_DOWNSTREAM_STATUSES).toEqual(["unknown"]);
    });
  });

  // ==========================================================================
  // 4. Typed failure & retryDisposition (design §9)
  // ==========================================================================
  describe("Typed failure & retryDisposition (design §9)", () => {
    it("keeps the five retry dispositions from the design table", () => {
      expect(PARTNER_NOTIFICATION_RETRY_DISPOSITIONS).toEqual([
        "automatic",
        "configuration_blocked",
        "manual_only",
        "terminal",
        "none",
      ]);
    });

    it("maps every failure reason to exactly the §9 table's retry disposition", () => {
      expect(PARTNER_NOTIFICATION_FAILURE_REASON_RETRY_DISPOSITIONS).toEqual({
        configuration_blocked: "configuration_blocked",
        endpoint_disabled: "configuration_blocked",
        route_missing: "manual_only",
        route_ambiguous: "manual_only",
        owner_changed: "manual_only",
        recipient_revoked: "terminal",
        provider_transient_error: "automatic",
        credential_rejected: "configuration_blocked",
        endpoint_unavailable: "configuration_blocked",
        partner_ack_invalid: "manual_only",
        notification_expired: "terminal",
        notification_obsolete: "terminal",
        notification_superseded: "terminal",
      });
      // Every declared failure reason has a mapped disposition; no gaps.
      for (const reason of PARTNER_NOTIFICATION_FAILURE_REASONS) {
        expect(
          PARTNER_NOTIFICATION_FAILURE_REASON_RETRY_DISPOSITIONS[reason],
        ).toBeDefined();
      }
    });

    it("validates a typed-failure dispatch outcome carries suggestedNextAttemptAt, never a bare boolean", () => {
      const failure: PartnerNotificationTypedFailure = {
        failureReason: "credential_rejected",
        retryDisposition: "configuration_blocked",
        suggestedNextAttemptAt: null,
      };
      const outcome: PartnerNotificationDispatchOutcome = {
        kind: "failed",
        failure,
      };
      expect(outcome.kind).toBe("failed");
      if (outcome.kind === "failed") {
        expect(outcome.failure.retryDisposition).toBe("configuration_blocked");
      }
    });

    it("recipient_revoked and notification_expired/obsolete/superseded are terminal, never automatic", () => {
      const terminalReasons: (typeof PARTNER_NOTIFICATION_FAILURE_REASONS)[number][] =
        [
          "recipient_revoked",
          "notification_expired",
          "notification_obsolete",
          "notification_superseded",
        ];
      for (const reason of terminalReasons) {
        expect(
          PARTNER_NOTIFICATION_FAILURE_REASON_RETRY_DISPOSITIONS[reason],
        ).toBe("terminal");
      }
    });
  });

  // ==========================================================================
  // 5. Delivery context and platform-fixed limits (design §4, §8, §11)
  // ==========================================================================
  describe("Delivery context and platform-fixed dispatch limits", () => {
    it("validates a fresh (not-yet-attempted) delivery context has null outcome fields", () => {
      const context: PartnerNotificationDeliveryContext = {
        outboxId: "outbox-001",
        deliveryId: "delivery-001",
        orderId: "order-001",
        entrySlug: "yuhe-residence",
        tenantId: "tenant-001",
        partnerId: "partner-001",
        bindingId: "bind-001",
        bindingVersion: 2,
        webhookId: "wh-001",
        endpointFingerprint: "sha256:abc123",
        wirePayload: {
          event: "passenger.eta_changed.v1",
          deliveryId: "delivery-001",
          occurredAt: "2026-09-18T00:00:00.000Z",
          tenantId: "tenant-001",
          data: {
            schemaVersion: "1.0",
            notificationId: "outbox-001",
            partnerEntrySlug: "yuhe-residence",
            recipient: { partnerUserRef: "partner-user-ref-001" },
            rideRef: "ride-ref-001",
            eventSequence: 4,
            assignmentVersion: 2,
            expiresAt: "2026-09-18T00:02:00.000Z",
            message: "ETA updated",
            navigation: { type: "ride", rideRef: "ride-ref-001" },
          },
        },
        wirePayloadHash: "sha256:payloadhash",
        eventSequence: 4,
        expiresAt: "2026-09-18T00:02:00.000Z",
        deliveryTarget: "partner_endpoint",
        deliveryStage: null,
        retryDisposition: null,
        failureReason: null,
        receiptId: null,
        downstreamStatus: "unknown",
        createdAt: "2026-09-18T00:00:00.000Z",
        deliveredAt: null,
      };
      expect(context.deliveryStage).toBeNull();
      expect(context.receiptId).toBeNull();
      expect(context.deliveredAt).toBeNull();
    });

    it("fixes the platform timeout and ack-body limits (design §8)", () => {
      expect(PARTNER_NOTIFICATION_ATTEMPT_TIMEOUT_MS).toBe(10_000);
      expect(PARTNER_NOTIFICATION_MAX_ACK_BODY_BYTES).toBe(4096);
    });
  });

  // ==========================================================================
  // 6. Migration allocation (schema-allocation.json, design §11)
  // ==========================================================================
  describe("Migration allocation (schema-allocation.json)", () => {
    const allocationPath = path.join(
      repoRoot,
      "docs/04-uat/system-remediation-20260906/schema-allocation.json",
    );

    function readAllocation() {
      return JSON.parse(fs.readFileSync(allocationPath, "utf8"));
    }

    it("allocates V0104 and V0105 without renaming any prior allocation", () => {
      const content = readAllocation();
      expect(content.allocations).toHaveLength(3);
      expect(content.additional_allocations).toHaveLength(3);
      expect(content.launch_allocations).toHaveLength(3);

      const partnerAllocs = content.partner_notification_allocations;
      expect(partnerAllocs).toHaveLength(2);

      const bindingAlloc = partnerAllocs.find(
        (a: any) => a.domain === "partner_notification_binding_and_routing",
      );
      expect(bindingAlloc.version).toBe("V0104");
      expect(bindingAlloc.migration_filename).toBe(
        "V0104__sr_partner_notification_binding_and_routing.sql",
      );
      expect(bindingAlloc.primary_tables).toEqual([
        "admin.phase1_partner_notification_bindings",
        "mobility.phase1_order_partner_notification_routes",
        "mobility.phase1_partner_notification_sequences",
      ]);

      const contextAlloc = partnerAllocs.find(
        (a: any) => a.domain === "partner_notification_delivery_context",
      );
      expect(contextAlloc.version).toBe("V0105");
      expect(contextAlloc.migration_filename).toBe(
        "V0105__sr_partner_notification_delivery_context.sql",
      );
      expect(contextAlloc.primary_tables).toEqual([
        "mobility.phase1_partner_notification_delivery_contexts",
      ]);
    });

    it("does not collide with any version in allocations/additional_allocations/launch_allocations", () => {
      const content = readAllocation();
      const allVersions = [
        ...content.allocations.map((a: any) => a.version),
        ...content.additional_allocations.map((a: any) => a.version),
        ...content.launch_allocations.map((a: any) => a.version),
        ...content.partner_notification_allocations.map((a: any) => a.version),
      ];
      expect(new Set(allVersions).size).toBe(allVersions.length);
    });

    it("records concrete table invariants for each new allocation, not just filenames", () => {
      const content = readAllocation();
      for (const alloc of content.partner_notification_allocations) {
        if (alloc.version === "V0104") continue; // ROUTE task creates V0104
        expect(Array.isArray(alloc.table_invariants)).toBe(true);
        expect(alloc.table_invariants.length).toBeGreaterThan(0);
      }
    });

    it("has not written the reserved infra/migrations files (allocation-only; no DDL executed by this task)", () => {
      const migrationsDir = path.join(repoRoot, "infra/migrations");
      const content = readAllocation();
      const diskFiles = fs.existsSync(migrationsDir)
        ? fs.readdirSync(migrationsDir)
        : [];
      for (const alloc of content.partner_notification_allocations) {
        const prefix = `${alloc.version}_`;
        const matchingFiles = diskFiles.filter((f: string) =>
          f.startsWith(prefix),
        );
        if (alloc.version !== "V0104") expect(matchingFiles).toHaveLength(0);
      }
    });

    it("keeps the highest migration on disk within the reserved allocation range (no unreserved version beyond any allocation, including this task's)", () => {
      const migrationsDir = path.join(repoRoot, "infra/migrations");
      const content = readAllocation();
      const allAllocations = [
        ...(content.allocations || []),
        ...(content.additional_allocations || []),
        ...(content.launch_allocations || []),
        ...(content.partner_notification_allocations || []),
      ];
      const maxAllocated = Math.max(
        100,
        ...allAllocations.map((a: any) =>
          parseInt(String(a.version).replace(/^V0*/, ""), 10),
        ),
      );
      const files = fs
        .readdirSync(migrationsDir)
        .filter((f) => /^V\d{4}__/.test(f));
      const versions = files.map((f) => parseInt(f.slice(1, 5), 10));
      const highest = Math.max(...versions);
      expect(highest).toBeLessThanOrEqual(maxAllocated);
      // This task's allocation itself must be strictly above the highest
      // migration that was already on disk when it allocated (V0103).
      expect(
        Math.min(
          ...content.partner_notification_allocations.map((a: any) =>
            parseInt(String(a.version).replace(/^V0*/, ""), 10),
          ),
        ),
      ).toBeGreaterThan(103);
    });
  });
});
