import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DatabaseService } from "../../../apps/api/src/common/db";
import { OpsDispatchEventsService } from "../../../apps/api/src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { DriverProfileRepository } from "../../../apps/api/src/modules/driver-profile/driver-profile.repository";
import { DriverProfileService } from "../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { NotificationDeliveryService } from "../../../apps/api/src/modules/notification-delivery/notification-delivery.service";
import { MemoryMailOutbox } from "../system-remediation/sr-credential-expiry-20260913/test-helpers";
import { RegulatoryRegistryController } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.controller";
import {
  RegulatoryRegistryRepository,
  type RegistryExpiryDeliveryIntentRow,
  type RegistryExpiryEventRow,
} from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.repository";
import { RegulatoryRegistryService } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import type {
  DriverRegistryRecord,
  InsurancePolicyRecord,
  VehicleContractRecord,
} from "@drts/contracts";

function createInMemoryFixture(options?: {
  partnerContacts?: Record<string, string[]>;
  platformAlertEmail?: string;
}) {
  if (options?.platformAlertEmail !== undefined) {
    vi.stubEnv("REGULATORY_ALERT_RECIPIENT_EMAIL", options.platformAlertEmail);
  }
  const outbox = new MemoryMailOutbox();
  const sentDeliveries: Array<{
    recipientEmail: string;
    subject: string;
    body: string;
  }> = [];
  const notification = new NotificationDeliveryService(outbox, {
    provider: "controlled-r14",
    send: async (message) => {
      sentDeliveries.push({
        recipientEmail: message.recipientEmail,
        subject: message.subject,
        body: message.body,
      });
      return {
        provider: "controlled-r14",
        response: "250 OK",
        providerMessageId: `msg-${sentDeliveries.length}`,
        acceptedAt: new Date().toISOString(),
      };
    },
  });
  const repository = new RegulatoryRegistryRepository();
  const events = new OpsDispatchEventsService(new EventEmitter() as never);
  const audit = new AuditNotificationService();
  const profiles = new DriverProfileService(
    audit,
    new DriverProfileRepository(),
  );
  const service = new RegulatoryRegistryService(
    events,
    audit,
    profiles,
    repository,
    notification,
  );
  const controller = new RegulatoryRegistryController(service);

  for (const [partnerId, emails] of Object.entries(
    options?.partnerContacts ?? {},
  )) {
    service.registerFleetPartnerContacts(partnerId, emails);
  }

  return {
    outbox,
    sentDeliveries,
    notification,
    repository,
    service,
    controller,
  };
}

class R14SqlTransport {
  readonly drivers = new Map<string, DriverRegistryRecord>();
  readonly contracts = new Map<string, VehicleContractRecord>();
  readonly policies = new Map<string, InsurancePolicyRecord>();
  readonly events = new Map<string, RegistryExpiryEventRow>();
  readonly intents = new Map<string, RegistryExpiryDeliveryIntentRow>();
  readonly dbPartnerEmails = new Map<string, string[]>();

  isEnabled() {
    return true;
  }

  async connect() {
    return {
      query: (sql: string, values: readonly unknown[] = []) =>
        this.query(sql, values),
      release: () => undefined,
    };
  }

  async query(sql: string, values: readonly unknown[] = []) {
    const q = sql.replace(/\s+/g, " ").trim();
    if (q === "BEGIN" || q === "COMMIT" || q === "ROLLBACK") {
      return { rows: [] };
    }
    if (q.startsWith("SELECT (SELECT MAX(driver_id)")) {
      return {
        rows: [
          {
            driver_id: [...this.drivers.keys()].sort().at(-1) ?? null,
            policy_id: [...this.policies.keys()].sort().at(-1) ?? null,
            preexpiry_policy_id:
              [...this.policies.keys()].sort().at(-1) ?? null,
            preexpiry_contract_id:
              [...this.contracts.keys()].sort().at(-1) ?? null,
          },
        ],
      };
    }
    if (q.includes("/* partner-contact-lookup */")) {
      expect(q).toContain(
        "(partner_id::text = ANY($1::text[]) OR partner_code = ANY($1::text[]))",
      );
      expect(q).not.toContain("WHERE partner_id = ANY($1::text[])");
      expect(q).toContain("COALESCE(p.email_normalized, p.record->>'email')");
      expect(q).toContain("p.account_status = 'active'");
      expect(q).not.toContain("p.email AS email");
      expect(q).not.toContain("p.status = 'active'");
      const partnerIds = (values[0] as string[]) ?? [];
      const rows: Array<{ email: string }> = [];
      for (const pid of partnerIds) {
        for (const email of this.dbPartnerEmails.get(pid) ?? []) {
          rows.push({ email });
        }
      }
      return { rows };
    }
    if (q.startsWith("SELECT d.record FROM reg.phase1_registry_drivers d")) {
      return { rows: [] };
    }
    if (
      q.startsWith("SELECT record FROM reg.phase1_registry_policies") &&
      !q.includes("FOR UPDATE")
    ) {
      const [asOf, limit, afterId, throughId] = values as [
        string,
        number,
        string | null,
        string | null,
      ];
      const rows = [...this.policies.values()]
        .filter((p) => {
          if (p.status === "cancelled") return false;
          if (afterId && p.policyId <= afterId) return false;
          if (throughId && p.policyId > throughId) return false;
          return Date.parse(p.endAt) < Date.parse(asOf);
        })
        .sort((a, b) => a.policyId.localeCompare(b.policyId))
        .slice(0, limit)
        .map((record) => ({ record: structuredClone(record) }));
      return { rows };
    }
    if (q.startsWith("/* preexpiry-source */")) {
      return { rows: [] };
    }
    if (q.startsWith("/* preexpiry-contract-source */")) {
      const [asOf, limit, afterId, throughId, cutoff] = values as [
        string,
        number,
        string | null,
        string | null,
        string,
      ];
      const asOfMs = Date.parse(asOf);
      const cutoffMs = Date.parse(cutoff);
      const rows = [...this.contracts.values()]
        .filter((c) => {
          if (afterId && c.contractId <= afterId) return false;
          if (throughId && c.contractId > throughId) return false;
          const endMs = Date.parse(c.endAt);
          const inWindow =
            c.status !== "terminated" && endMs > asOfMs && endMs <= cutoffMs;
          const hasActiveEvent = [...this.events.values()].some(
            (e) =>
              e.entity_type === "policy" &&
              e.entity_id === c.contractId &&
              e.credential_type.startsWith("preexpiry:vehicle_contract:") &&
              ["pending", "leased", "completed"].includes(e.status),
          );
          return inWindow || hasActiveEvent;
        })
        .sort((a, b) => a.contractId.localeCompare(b.contractId))
        .slice(0, limit)
        .map((record) => ({ record: structuredClone(record) }));
      return { rows };
    }
    if (q.startsWith("/* preexpiry-policy-source */")) {
      const [asOf, limit, afterId, throughId, cutoff] = values as [
        string,
        number,
        string | null,
        string | null,
        string,
      ];
      const asOfMs = Date.parse(asOf);
      const cutoffMs = Date.parse(cutoff);
      const rows = [...this.policies.values()]
        .filter((p) => {
          if (afterId && p.policyId <= afterId) return false;
          if (throughId && p.policyId > throughId) return false;
          const endMs = Date.parse(p.endAt);
          const inWindow =
            p.status !== "cancelled" && endMs > asOfMs && endMs <= cutoffMs;
          const hasActiveEvent = [...this.events.values()].some(
            (e) =>
              e.entity_type === "policy" &&
              e.entity_id === p.policyId &&
              e.credential_type.startsWith("preexpiry:insurance_policy:") &&
              ["pending", "leased", "completed"].includes(e.status),
          );
          return inWindow || hasActiveEvent;
        })
        .sort((a, b) => a.policyId.localeCompare(b.policyId))
        .slice(0, limit)
        .map((record) => ({ record: structuredClone(record) }));
      return { rows };
    }
    if (
      q.startsWith(
        "SELECT record FROM reg.phase1_registry_contracts WHERE contract_id = $1",
      )
    ) {
      const row = this.contracts.get(String(values[0]));
      return { rows: row ? [{ record: structuredClone(row) }] : [] };
    }
    if (
      q.startsWith(
        "SELECT record FROM reg.phase1_registry_policies WHERE policy_id = $1",
      )
    ) {
      const row = this.policies.get(String(values[0]));
      return { rows: row ? [{ record: structuredClone(row) }] : [] };
    }
    if (
      q.startsWith(
        "SELECT * FROM reg.phase1_registry_expiry_events WHERE entity_type = $1 AND entity_id = $2",
      )
    ) {
      const [entityType, entityId, credentialType] = values as [
        string,
        string,
        string | undefined,
      ];
      const rows = [...this.events.values()]
        .filter(
          (e) =>
            e.entity_type === entityType &&
            e.entity_id === entityId &&
            ["pending", "leased", "completed"].includes(e.status) &&
            (!credentialType || e.credential_type === credentialType),
        )
        .map((e) => structuredClone(e));
      return { rows };
    }
    if (
      q.startsWith(
        "SELECT * FROM reg.phase1_registry_expiry_events WHERE source_fingerprint = $1",
      )
    ) {
      const found = [...this.events.values()].find(
        (e) => e.source_fingerprint === values[0],
      );
      return { rows: found ? [structuredClone(found)] : [] };
    }
    if (q.startsWith("INSERT INTO reg.phase1_registry_expiry_events")) {
      const [
        eventId,
        scope,
        entityType,
        entityId,
        credentialType,
        fingerprint,
        sourceExpiryAt,
        status,
      ] = values as [
        string,
        string,
        "driver" | "policy",
        string,
        string,
        string,
        string | null,
        "pending",
      ];
      const existing = [...this.events.values()].find(
        (e) => e.source_fingerprint === fingerprint,
      );
      if (existing) {
        return { rows: [structuredClone(existing)] };
      }
      const now = new Date().toISOString();
      const row: RegistryExpiryEventRow = {
        event_id: eventId,
        scope,
        entity_type: entityType,
        entity_id: entityId,
        credential_type: credentialType,
        source_fingerprint: fingerprint,
        source_expiry_at: sourceExpiryAt,
        status,
        attempt: 0,
        run_after: now,
        lease_token: 0,
        leased_until: null,
        worker_id: null,
        last_error: null,
        superseded_by_event_id: null,
        superseded_at: null,
        created_at: now,
        updated_at: now,
      };
      this.events.set(eventId, row);
      return { rows: [structuredClone(row)] };
    }
    if (
      q.startsWith(
        "INSERT INTO reg.phase1_registry_expiry_delivery_intents",
      )
    ) {
      const [
        intentId,
        eventId,
        scope,
        idempotencyKey,
        tenantId,
        recipientEmail,
        fromEmail,
        subject,
        body,
      ] = values as [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ];
      const existing = [...this.intents.values()].find(
        (i) => i.idempotency_key === idempotencyKey,
      );
      if (existing) {
        return { rows: [structuredClone(existing)] };
      }
      const now = new Date().toISOString();
      const row: RegistryExpiryDeliveryIntentRow = {
        intent_id: intentId,
        event_id: eventId,
        scope,
        idempotency_key: idempotencyKey,
        tenant_id: tenantId,
        recipient_email: recipientEmail,
        from_email: fromEmail,
        subject,
        body,
        delivery_status: "pending",
        outbox_delivery_id: null,
        last_error: null,
        enqueued_at: null,
        created_at: now,
        updated_at: now,
      };
      this.intents.set(intentId, row);
      return { rows: [structuredClone(row)] };
    }
    if (
      q.startsWith(
        "SELECT * FROM reg.phase1_registry_expiry_delivery_intents WHERE delivery_status = 'pending'",
      )
    ) {
      const limit = Number(values[0] ?? 50);
      const rows = [...this.intents.values()]
        .filter((i) => i.delivery_status === "pending")
        .slice(0, limit)
        .map((i) => structuredClone(i));
      return { rows };
    }
    if (
      q.startsWith("SELECT e.*, i.intent_id") &&
      q.includes("WHERE e.event_id = $1")
    ) {
      const event = this.events.get(String(values[0]));
      if (!event) return { rows: [] };
      const matchingIntents = [...this.intents.values()].filter(
        (i) => i.event_id === event.event_id,
      );
      if (matchingIntents.length === 0) {
        return { rows: [{ ...structuredClone(event), intent_id: null }] };
      }
      return {
        rows: matchingIntents.map((i) => ({
          ...structuredClone(event),
          intent_id: i.intent_id,
          intent_scope: i.scope,
          idempotency_key: i.idempotency_key,
          tenant_id: i.tenant_id,
          recipient_email: i.recipient_email,
          from_email: i.from_email,
          subject: i.subject,
          body: i.body,
          delivery_status: i.delivery_status,
          outbox_delivery_id: i.outbox_delivery_id,
          intent_last_error: i.last_error,
          enqueued_at: i.enqueued_at,
          intent_created_at: i.created_at,
          intent_updated_at: i.updated_at,
        })),
      };
    }
    if (q.startsWith("SELECT e.*, i.intent_id")) {
      const rows: unknown[] = [];
      for (const event of this.events.values()) {
        const matchingIntents = [...this.intents.values()].filter(
          (i) => i.event_id === event.event_id,
        );
        if (matchingIntents.length === 0) {
          rows.push({ ...structuredClone(event), intent_id: null });
        } else {
          for (const i of matchingIntents) {
            rows.push({
              ...structuredClone(event),
              intent_id: i.intent_id,
              intent_scope: i.scope,
              idempotency_key: i.idempotency_key,
              tenant_id: i.tenant_id,
              recipient_email: i.recipient_email,
              from_email: i.from_email,
              subject: i.subject,
              body: i.body,
              delivery_status: i.delivery_status,
              outbox_delivery_id: i.outbox_delivery_id,
              intent_last_error: i.last_error,
              enqueued_at: i.enqueued_at,
              intent_created_at: i.created_at,
              intent_updated_at: i.updated_at,
            });
          }
        }
      }
      return { rows };
    }
    if (
      q.startsWith(
        "SELECT event_id FROM reg.phase1_registry_expiry_events WHERE event_id = $1::uuid FOR UPDATE",
      )
    ) {
      const event = this.events.get(String(values[0]));
      return { rows: event ? [{ event_id: event.event_id }] : [] };
    }
    if (
      q.startsWith(
        "UPDATE reg.phase1_registry_expiry_delivery_intents AS intent",
      )
    ) {
      const [status, outboxDeliveryId, lastError, intentId, hasError] =
        values as [
          RegistryExpiryDeliveryIntentRow["delivery_status"],
          string | null,
          string | null,
          string,
          boolean,
        ];
      const intent = this.intents.get(intentId);
      if (!intent) return { rows: [] };
      const parent = this.events.get(intent.event_id);
      intent.delivery_status =
        intent.delivery_status === "superseded" ||
        parent?.status === "superseded"
          ? "superseded"
          : status;
      intent.outbox_delivery_id ??= outboxDeliveryId;
      if (hasError) intent.last_error = lastError;
      if (status === "enqueued") {
        intent.enqueued_at ??= new Date().toISOString();
      }
      intent.updated_at = new Date().toISOString();
      return { rows: [structuredClone(intent)] };
    }
    if (
      q.startsWith("UPDATE reg.phase1_registry_expiry_events") &&
      q.includes("SET status = 'superseded'")
    ) {
      const ids = (values[0] as string[]) ?? [];
      const newEventId = (values[1] as string | null) ?? null;
      for (const id of ids) {
        const evt = this.events.get(id);
        if (evt) {
          evt.status = "superseded";
          evt.superseded_by_event_id = newEventId;
          evt.superseded_at = new Date().toISOString();
        }
        for (const intent of this.intents.values()) {
          if (intent.event_id === id && intent.delivery_status === "pending") {
            intent.delivery_status = "superseded";
          }
        }
      }
      return { rows: [] };
    }
    if (
      q.startsWith(
        "UPDATE reg.phase1_registry_expiry_delivery_intents SET delivery_status = 'superseded'",
      )
    ) {
      const ids = (values[0] as string[]) ?? [];
      for (const intent of this.intents.values()) {
        if (
          ids.includes(intent.event_id) &&
          intent.delivery_status === "pending"
        ) {
          intent.delivery_status = "superseded";
        }
      }
      return { rows: [] };
    }
    if (
      q.startsWith("UPDATE reg.phase1_registry_expiry_events SET status = $1")
    ) {
      const [status, eventId] = values as [
        RegistryExpiryEventRow["status"],
        string,
      ];
      const evt = this.events.get(eventId);
      if (evt && (evt.status !== "superseded" || status === "superseded")) {
        evt.status = status;
        evt.updated_at = new Date().toISOString();
      }
      return { rows: [] };
    }
    throw new Error(`Unexpected SQL in R14SqlTransport: ${q}`);
  }
}

describe("BUREAU-R14: Vehicle Contract & Insurance Policy Pre-Expiry Reminders and Lifecycle Regression", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("generates T-30 and T-7 reminders for vehicle contracts and insurance policies with idempotency per record+threshold", async () => {
    const f = createInMemoryFixture({
      partnerContacts: {
        "partner-demo-001": ["partner1-ops@fleet.tw"],
      },
      platformAlertEmail: "reg-alerts@platform.tw",
    });

    // Narrow down to veh-demo-001 (contract-demo-001, policy-demo-001, partner-tw-001)
    const state = f.service as unknown as {
      drivers: DriverRegistryRecord[];
      contracts: VehicleContractRecord[];
      policies: InsurancePolicyRecord[];
    };
    state.drivers = [];
    state.contracts = state.contracts.filter(
      (c) => c.contractId === "contract-demo-001",
    );
    state.policies = state.policies.filter(
      (p) => p.policyId === "policy-demo-001",
    );
    state.contracts[0]!.endAt = "2026-12-31T00:00:00.000Z";
    state.policies[0]!.endAt = "2026-12-31T00:00:00.000Z";

    // 1. At T-30 (2026-12-01T00:00:00.000Z): creates T-30 reminders for contract and policy
    const t30 = "2026-12-01T00:00:00.000Z";
    const firstRun = await f.controller.reconcileExpiry({ asOf: t30 });
    expect(firstRun.data.preexpiry).toEqual({
      eventsCreated: 2, // preexpiry:vehicle_contract:30 + preexpiry:insurance_policy:30
      intentsCreated: 4, // 2 recipients (partner + platform) x 2 events
      recipientStatus: "configured",
      deliveryStatus: "available",
    });
    expect(f.sentDeliveries).toHaveLength(4);

    const contractT30Fingerprint = createHash("sha256")
      .update(
        JSON.stringify([
          "credential-preexpiry/v1",
          "default",
          "policy",
          "contract-demo-001",
          "endAt",
          Date.parse("2026-12-31T00:00:00.000Z"),
          30,
        ]),
      )
      .digest("hex");
    const policyT30Fingerprint = createHash("sha256")
      .update(
        JSON.stringify([
          "credential-preexpiry/v1",
          "default",
          "policy",
          "policy-demo-001",
          "endAt",
          Date.parse("2026-12-31T00:00:00.000Z"),
          30,
        ]),
      )
      .digest("hex");

    const backlogAfterT30 = await f.service.getExpiryBacklog();
    expect(backlogAfterT30).toHaveLength(2);
    expect(
      backlogAfterT30.find(
        (e) => e.credential_type === "preexpiry:vehicle_contract:30",
      ),
    ).toMatchObject({
      entity_type: "policy",
      entity_id: "contract-demo-001",
      source_fingerprint: contractT30Fingerprint,
      status: "completed",
    });
    expect(
      backlogAfterT30.find(
        (e) => e.credential_type === "preexpiry:insurance_policy:30",
      ),
    ).toMatchObject({
      entity_type: "policy",
      entity_id: "policy-demo-001",
      source_fingerprint: policyT30Fingerprint,
      status: "completed",
    });

    // 2. Re-running at T-30 and T-20 is idempotent (0 new events, 0 new intents, 0 duplicate deliveries)
    const repeatT30 = await f.controller.reconcileExpiry({ asOf: t30 });
    expect(repeatT30.data.preexpiry).toMatchObject({
      eventsCreated: 0,
      intentsCreated: 0,
    });
    const repeatT20 = await f.controller.reconcileExpiry({
      asOf: "2026-12-11T00:00:00.000Z",
    });
    expect(repeatT20.data.preexpiry).toMatchObject({
      eventsCreated: 0,
      intentsCreated: 0,
    });
    expect(f.sentDeliveries).toHaveLength(4);

    // 3. Advancing to T-7 (2026-12-24T00:00:00.000Z) creates only T-7 reminders
    const t7 = "2026-12-24T00:00:00.000Z";
    const t7Run = await f.controller.reconcileExpiry({ asOf: t7 });
    expect(t7Run.data.preexpiry).toEqual({
      eventsCreated: 2, // preexpiry:vehicle_contract:7 + preexpiry:insurance_policy:7
      intentsCreated: 4, // 2 recipients x 2 events
      recipientStatus: "configured",
      deliveryStatus: "available",
    });
    expect(f.sentDeliveries).toHaveLength(8);

    const backlogAfterT7 = await f.service.getExpiryBacklog();
    expect(
      backlogAfterT7.map((e) => e.credential_type).sort(),
    ).toEqual([
      "preexpiry:insurance_policy:30",
      "preexpiry:insurance_policy:7",
      "preexpiry:vehicle_contract:30",
      "preexpiry:vehicle_contract:7",
    ]);
  });

  it("delivers reminders to all registered fleet partner contacts PLUS the platform regulatory alert address (never only a single hard-coded inbox)", async () => {
    const f = createInMemoryFixture({
      partnerContacts: {
        "partner-demo-001": [
          "fleet-manager@partner1.tw",
          "compliance-desk@partner1.tw",
        ],
      },
      platformAlertEmail: "bureau-alerts@platform.tw",
    });

    const state = f.service as unknown as {
      drivers: DriverRegistryRecord[];
      contracts: VehicleContractRecord[];
      policies: InsurancePolicyRecord[];
    };
    state.drivers = [];
    state.contracts = state.contracts.filter(
      (c) => c.contractId === "contract-demo-001",
    );
    state.policies = state.policies.filter(
      (p) => p.policyId === "policy-demo-001",
    );
    state.contracts[0]!.endAt = "2026-12-31T00:00:00.000Z";
    state.policies[0]!.endAt = "2026-12-31T00:00:00.000Z";

    // Also verify controller endpoints for fleet partner contact registration & expiring queries
    const registeredViaController = f.controller.registerFleetPartnerContacts(
      "partner-demo-001",
      {
        emails: [
          "fleet-manager@partner1.tw",
          "compliance-desk@partner1.tw",
        ],
      },
    );
    expect(registeredViaController.data.emails).toEqual([
      "fleet-manager@partner1.tw",
      "compliance-desk@partner1.tw",
    ]);

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-10T00:00:00.000Z"));

    await f.controller.reconcileExpiry({
      asOf: "2026-12-10T00:00:00.000Z", // T-21 (within T-30 window)
    });

    const expiringContracts = f.controller.listExpiringContracts("30");
    expect(expiringContracts.data.items.map((c) => c.contractId)).toEqual([
      "contract-demo-001",
    ]);
    const expiringPolicies = f.controller.listExpiringPolicies("30");
    expect(expiringPolicies.data.items.map((p) => p.policyId)).toEqual([
      "policy-demo-001",
    ]);

    // 3 recipients per reminder event x 2 events (contract + policy) = 6 intents & 6 deliveries
    const receipts = await f.service.getExpiryReceipts();
    expect(receipts).toHaveLength(6);

    const contractRecipients = receipts
      .filter((r) => r.subject.includes("Vehicle Contract T-30"))
      .map((r) => r.recipient_email)
      .sort();
    expect(contractRecipients).toEqual([
      "bureau-alerts@platform.tw",
      "compliance-desk@partner1.tw",
      "fleet-manager@partner1.tw",
    ]);

    const policyRecipients = receipts
      .filter((r) => r.subject.includes("Insurance Policy T-30"))
      .map((r) => r.recipient_email)
      .sort();
    expect(policyRecipients).toEqual([
      "bureau-alerts@platform.tw",
      "compliance-desk@partner1.tw",
      "fleet-manager@partner1.tw",
    ]);
  });

  it("enforces full lifecycle regression: before expiry -> reminder; after expiry -> dispatch blocked with reason; renewal -> unblocked and prior events superseded", async () => {
    const f = createInMemoryFixture({
      partnerContacts: {
        "partner-demo-001": ["partner1@fleet.tw"],
      },
      platformAlertEmail: "reg-alerts@platform.tw",
    });

    const state = f.service as unknown as {
      drivers: DriverRegistryRecord[];
      contracts: VehicleContractRecord[];
      policies: InsurancePolicyRecord[];
      exclusivities: Array<{ vehicleId: string; effectiveEnd: string | null }>;
    };
    state.drivers = state.drivers.filter((d) => d.driverId === "drv-demo-001");
    state.contracts = state.contracts.filter(
      (c) => c.contractId === "contract-demo-001",
    );
    state.policies = state.policies.filter(
      (p) => p.policyId === "policy-demo-001",
    );
    state.contracts[0]!.endAt = "2026-12-31T00:00:00.000Z";
    state.policies[0]!.endAt = "2026-12-31T00:00:00.000Z";
    for (const excl of state.exclusivities) {
      if (excl.vehicleId === "veh-demo-001") {
        excl.effectiveEnd = "2028-12-31T23:59:59.000Z";
      }
    }

    vi.useFakeTimers({ toFake: ["Date"] });

    // Phase 1: Before expiry (T-25 and T-5) -> reminders sent, vehicle remains dispatchable
    vi.setSystemTime(new Date("2026-12-06T00:00:00.000Z"));
    await f.controller.reconcileExpiry({
      asOf: "2026-12-06T00:00:00.000Z", // T-25
    });
    expect(f.service.getVehicleDispatchability("veh-demo-001")).toBe(true);
    const vehicleAtT25 = f.service
      .listVehicles()
      .find((v) => v.vehicleId === "veh-demo-001")!;
    expect(vehicleAtT25.supplyLifecycle.dispatch.eligible).toBe(true);
    expect(vehicleAtT25.supplyLifecycle.dispatch.blockedReasons).toEqual([]);
    expect(f.sentDeliveries).toHaveLength(4); // T-30 for contract & policy to 2 recipients

    vi.setSystemTime(new Date("2026-12-26T00:00:00.000Z"));
    await f.controller.reconcileExpiry({
      asOf: "2026-12-26T00:00:00.000Z", // T-5
    });
    expect(f.service.getVehicleDispatchability("veh-demo-001")).toBe(true);
    expect(f.sentDeliveries).toHaveLength(8); // + T-7 for contract & policy to 2 recipients

    // Phase 2: After expiry (2027-01-02T00:00:00.000Z) -> dispatch blocked with contract_expired and insurance_expired
    vi.setSystemTime(new Date("2027-01-02T00:00:00.000Z"));
    await f.controller.reconcileExpiry({
      asOf: "2027-01-02T00:00:00.000Z",
    });
    expect(f.service.getVehicleDispatchability("veh-demo-001")).toBe(false);
    expect(
      f.service
        .getEligibleCandidates("standard_taxi")
        .some((c) => c.vehicleId === "veh-demo-001"),
    ).toBe(false);

    const vehicleAfterExpiry = f.service
      .listVehicles()
      .find((v) => v.vehicleId === "veh-demo-001")!;
    expect(vehicleAfterExpiry.dispatchableFlag).toBe(false);
    expect(vehicleAfterExpiry.supplyLifecycle.dispatch.eligible).toBe(false);
    expect(vehicleAfterExpiry.supplyLifecycle.contract.lifecycleStatus).toBe(
      "expired",
    );
    expect(vehicleAfterExpiry.supplyLifecycle.insurance.lifecycleStatus).toBe(
      "expired",
    );
    expect(vehicleAfterExpiry.supplyLifecycle.dispatch.blockedReasons).toEqual(
      expect.arrayContaining(["contract_expired", "insurance_expired"]),
    );

    // Phase 3: Renew contract first -> contract_expired cleared, still blocked by insurance_expired
    vi.setSystemTime(new Date("2027-01-02T01:00:00.000Z"));
    await f.controller.activateContract("contract-demo-001", {
      approvedBy: "ops-reviewer-01",
      approvedAt: "2027-01-02T01:00:00.000Z",
      startAt: "2027-01-01T00:00:00.000Z",
      endAt: "2027-12-31T23:59:59.000Z",
    } as never);

    const vehicleAfterContractRenewal = f.service
      .listVehicles()
      .find((v) => v.vehicleId === "veh-demo-001")!;
    expect(
      vehicleAfterContractRenewal.supplyLifecycle.contract.lifecycleStatus,
    ).toBe("active");
    expect(
      vehicleAfterContractRenewal.supplyLifecycle.dispatch.blockedReasons,
    ).not.toContain("contract_expired");
    expect(
      vehicleAfterContractRenewal.supplyLifecycle.dispatch.blockedReasons,
    ).toContain("insurance_expired");
    expect(f.service.getVehicleDispatchability("veh-demo-001")).toBe(false);

    // Phase 4: Renew insurance policy -> insurance_expired cleared, vehicle is dispatchable again!
    vi.setSystemTime(new Date("2027-01-02T01:05:00.000Z"));
    await f.controller.activateInsurancePolicy("policy-demo-001", {
      activatedAt: "2027-01-02T01:05:00.000Z",
      startAt: "2027-01-01T00:00:00.000Z",
      endAt: "2027-12-31T23:59:59.000Z",
    } as never);

    const vehicleAfterFullRenewal = f.service
      .listVehicles()
      .find((v) => v.vehicleId === "veh-demo-001")!;
    expect(vehicleAfterFullRenewal.dispatchableFlag).toBe(true);
    expect(vehicleAfterFullRenewal.supplyLifecycle.dispatch.eligible).toBe(
      true,
    );
    expect(
      vehicleAfterFullRenewal.supplyLifecycle.dispatch.blockedReasons,
    ).toEqual([]);
    expect(f.service.getVehicleDispatchability("veh-demo-001")).toBe(true);
    expect(
      f.service
        .getEligibleCandidates("standard_taxi")
        .some((c) => c.vehicleId === "veh-demo-001"),
    ).toBe(true);

    // Verify all prior expiry and pre-expiry events for contract-demo-001 and policy-demo-001 are superseded
    const backlogAfterRenewal = await f.service.getExpiryBacklog({
      limit: 100,
    });
    const contractAndPolicyEvents = backlogAfterRenewal.filter(
      (e) =>
        e.entity_id === "contract-demo-001" ||
        e.entity_id === "policy-demo-001",
    );
    expect(contractAndPolicyEvents.length).toBeGreaterThanOrEqual(5);
    expect(
      contractAndPolicyEvents.every((e) => e.status === "superseded"),
    ).toBe(true);
  });

  it("scans contracts and policies via SQL keyset pagination and resolves DB + registered partner contacts", async () => {
    vi.stubEnv("REGULATORY_ALERT_RECIPIENT_EMAIL", "reg-sql@platform.tw");
    const sqlDb = new R14SqlTransport();
    sqlDb.dbPartnerEmails.set("partner-sql-001", ["db-contact@partner-sql.tw"]);
    sqlDb.contracts.set("contract-sql-001", {
      contractId: "contract-sql-001",
      vehicleId: "veh-demo-001",
      partnerId: "partner-sql-001",
      partnerType: "fleet_partner",
      contractType: "fleet_participation_contract",
      operatingAreaId: "taipei-keelung",
      serviceScope: "standard_taxi",
      startAt: "2026-01-01T00:00:00.000Z",
      endAt: "2026-06-10T00:00:00.000Z",
      status: "active",
      lifecycleStatus: "active",
      approvedBy: "ops-01",
      approvedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    sqlDb.policies.set("policy-sql-001", {
      policyId: "policy-sql-001",
      vehicleId: "veh-demo-001",
      policyNo: "POL-SQL-001",
      insuranceType: "commercial_liability",
      insurerName: "Cathay Century",
      coverageAmount: 5000000,
      startAt: "2026-01-01T00:00:00.000Z",
      endAt: "2026-06-10T00:00:00.000Z",
      status: "active",
      lifecycleStatus: "active",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const outbox = new MemoryMailOutbox();
    const notification = new NotificationDeliveryService(outbox);
    const repository = new RegulatoryRegistryRepository(
      sqlDb as unknown as DatabaseService,
    );
    const service = new RegulatoryRegistryService(
      new OpsDispatchEventsService(new EventEmitter() as never),
      new AuditNotificationService(),
      new DriverProfileService(
        new AuditNotificationService(),
        new DriverProfileRepository(),
      ),
      repository,
      notification,
    );

    // At 2026-06-05 (T-5): both T-30 and T-7 thresholds are crossed for contract & policy
    const res = await service.reconcileExpiredCredentials({
      asOf: "2026-06-05T00:00:00.000Z",
      limit: 10,
    });
    expect(res.preexpiry).toEqual({
      eventsCreated: 4, // contract T-30 & T-7 + policy T-30 & T-7
      intentsCreated: 8, // 2 recipients (db-contact@partner-sql.tw + reg-sql@platform.tw) x 4 events
      recipientStatus: "configured",
      deliveryStatus: "unavailable",
    });
    expect(sqlDb.events.size).toBe(4);
    expect(sqlDb.intents.size).toBe(8);
    expect(
      [...sqlDb.events.values()].every((e) => e.status === "completed"),
    ).toBe(true);
  });

  it("F2 regression: findFleetPartnerContactEmails queries canonical iam.identity_principals.email_normalized/account_status and core.partners partner_id::text/partner_code without swallowing SQL errors", async () => {
    const sqlDb = new R14SqlTransport();
    sqlDb.dbPartnerEmails.set("partner-demo-001", [
      "db-partner1@fleet.tw",
      "iam-member@fleet.tw",
    ]);
    const repository = new RegulatoryRegistryRepository(
      sqlDb as unknown as DatabaseService,
    );
    repository.setFleetPartnerContacts("partner-demo-001", [
      "in-mem@fleet.tw",
    ]);

    const emails = await repository.findFleetPartnerContactEmails([
      "partner-demo-001",
    ]);
    expect(emails.sort()).toEqual([
      "db-partner1@fleet.tw",
      "iam-member@fleet.tw",
      "in-mem@fleet.tw",
    ]);

    // Verify SQL errors are not swallowed by catch {}
    const failingDb = {
      isEnabled: () => true,
      query: async () => {
        throw new Error(
          'column p.email does not exist / operator does not exist: uuid = text',
        );
      },
    } as unknown as DatabaseService;
    const failingRepo = new RegulatoryRegistryRepository(failingDb);
    await expect(
      failingRepo.findFleetPartnerContactEmails(["partner-demo-001"]),
    ).rejects.toThrow("column p.email does not exist");
  });

  it("F3 regression: reconcileExpiredCredentials with past or custom asOf does not leave sticky reconciledEvaluationTime or mutate policy-demo-002 from expired to pending", async () => {
    const f = createInMemoryFixture();

    // Baseline: policy-demo-002 (startAt: 2025-01-01, endAt: 2026-03-31) is expired, veh-demo-003 is blocked by insurance_expired
    const beforePolicy2 = f.service
      .listPolicies()
      .find((p) => p.policyId === "policy-demo-002")!;
    expect(beforePolicy2.lifecycleStatus).toBe("expired");
    expect(f.service.getVehicleDispatchability("veh-demo-003")).toBe(false);

    // Run reconcileExpiredCredentials with a past asOf before policy-demo-002's startAt (2024-06-01)
    await f.service.reconcileExpiredCredentials({
      asOf: "2024-06-01T00:00:00.000Z",
    });

    const after2024Policy2 = f.service
      .listPolicies()
      .find((p) => p.policyId === "policy-demo-002")!;
    expect(after2024Policy2.lifecycleStatus).toBe("expired");
    expect(f.service.getVehicleDispatchability("veh-demo-003")).toBe(false);
    const veh3After2024 = f.service
      .listVehicles()
      .find((v) => v.vehicleId === "veh-demo-003")!;
    expect(veh3After2024.supplyLifecycle.insurance.lifecycleStatus).toBe(
      "expired",
    );
    expect(veh3After2024.supplyLifecycle.dispatch.blockedReasons).toContain(
      "insurance_expired",
    );

    // Run reconcileExpiredCredentials with an asOf during policy-demo-002's window (2025-06-01)
    await f.service.reconcileExpiredCredentials({
      asOf: "2025-06-01T00:00:00.000Z",
    });

    const after2025Policy2 = f.service
      .listPolicies()
      .find((p) => p.policyId === "policy-demo-002")!;
    expect(after2025Policy2.lifecycleStatus).toBe("expired");
    expect(f.service.getVehicleDispatchability("veh-demo-003")).toBe(false);
    const veh3After2025 = f.service
      .listVehicles()
      .find((v) => v.vehicleId === "veh-demo-003")!;
    expect(veh3After2025.supplyLifecycle.insurance.lifecycleStatus).toBe(
      "expired",
    );
    expect(veh3After2025.supplyLifecycle.dispatch.blockedReasons).toContain(
      "insurance_expired",
    );
  });
});
