import { afterEach, describe, expect, it, vi } from "vitest";
import type { PartnerChannelEntryRecord } from "@drts/contracts";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import {
  TenantPartnerRepository,
  type StoredWebhookEndpointRecord,
} from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.repository";
import { TenantPartnerService } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { PartnerNotificationDispatchFacade } from "../../../../apps/api/src/modules/tenant-partner/partner-notification-dispatch.facade";
import { computeEndpointFingerprint } from "../../../../apps/api/src/modules/tenant-partner/partner-notification-fingerprint";
import { WebhookDispatchService } from "../../../../apps/api/src/modules/tenant-partner/webhook-dispatch.service";
import { PartnerNotificationTransport } from "../../../../apps/api/src/modules/multi-taxi/partner-notification.transport";
import { PassengerPushAdapter } from "../../../../apps/api/src/modules/multi-taxi/passenger-push.adapter";
import { MultiTaxiService } from "../../../../apps/api/src/modules/multi-taxi/multi-taxi.service";
import { harness } from "./transport-harness";

// Two real services/repositories with separate startup snapshots. Only the SQL
// driver and receiver are doubles; governance writes go through service A's APIs.
function sharedDatabase() {
  const tables = new Map<string, Map<string, Record<string, unknown>>>();
  let failRead = false;
  const query = vi.fn(async (sql: string, values: readonly unknown[] = []) => {
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)) return { rows: [] };
    const table = sql.match(/(?:FROM|INTO)\s+(\w+\.\w+)/)?.[1];
    if (!table) throw new Error(`Unexpected SQL: ${sql}`);
    let rows = tables.get(table);
    if (!rows) tables.set(table, (rows = new Map()));
    if (sql.includes("INSERT INTO")) {
      rows.set(String(values[0]), JSON.parse(String(values.at(-1))));
      return { rows: [] };
    }
    if (failRead) throw new Error("durable governance unavailable");
    let records = [...rows.values()];
    if (sql.includes("WHERE tenant_id = $1 AND webhook_id = $2")) {
      records = records.filter(
        (r) => r.tenantId === values[0] && r.webhookId === values[1],
      );
    } else if (values.length) {
      records = rows.has(String(values[0]))
        ? [rows.get(String(values[0]))!]
        : [];
    }
    return { rows: structuredClone(records).map((record) => ({ record })) };
  });
  return {
    query,
    tables,
    failReads: () => {
      failRead = true;
    },
    isEnabled: () => true,
    connect: async () => ({ query, release: vi.fn() }),
  };
}

const services: TenantPartnerService[] = [];
afterEach(() => {
  services.splice(0).forEach((s) => s.onModuleDestroy());
  vi.restoreAllMocks();
});

async function setup() {
  const h = harness();
  services.push(h.tenant);
  const database = sharedDatabase();
  const repoA = new TenantPartnerRepository(database as never);
  const repoB = new TenantPartnerRepository(database as never);
  const makeService = (repo: TenantPartnerRepository) => {
    const service = new TenantPartnerService(
      new AuditNotificationService(),
      repo,
      new WebhookDispatchService(h.fetch),
    );
    services.push(service);
    return service;
  };
  const a = makeService(repoA);
  const entry = a.createPlatformPartnerEntry({
    entrySlug: h.route.entrySlug,
    tenantId: h.route.tenantId,
    partnerCode: "governance-test",
    partnerType: "community",
    programId: "program-1",
    displayName: "Governance test",
    businessDispatchSubtype: "enterprise_dispatch",
    authMode: "partner_api_key",
    eligibilityMode: "none",
  });
  h.route.partnerId = entry.partnerId;
  h.binding.partnerId = entry.partnerId;
  const endpoint = a.createWebhookEndpoint(h.route.tenantId, {
    url: "https://partner.example.test/notification",
    secret: "shared-original-secret",
    events: ["passenger.assignment_disclosure_ready.v1"],
  });
  a.updateWebhookEndpoint(h.route.tenantId, endpoint.webhookId, {
    status: "active",
  });
  h.binding.webhookId = endpoint.webhookId;
  h.binding.validatedEndpointFingerprint = computeEndpointFingerprint(
    a.listWebhookEndpoints(h.route.tenantId)[0]!,
  );
  const b = makeService(repoB);
  await b.onModuleInit();
  const facade = new PartnerNotificationDispatchFacade(
    b,
    h.bindings as never,
    { find: async () => h.link } as never,
  );
  const transport = new PartnerNotificationTransport(
    h.repository as never,
    facade,
  );
  const adapter = new PassengerPushAdapter(
    { transportMode: "partner_webhook" },
    transport,
  );
  const service = new MultiTaxiService(
    {} as never,
    h.repository as never,
    undefined,
    undefined,
    undefined,
    adapter,
  );
  const durableEndpoint = () =>
    database.tables
      .get("admin.phase1_tenant_webhook_endpoints")!
      .get(endpoint.webhookId)! as unknown as StoredWebhookEndpointRecord;
  const durableEntry = () =>
    database.tables
      .get("admin.phase1_partner_channel_entries")!
      .get(entry.entrySlug)! as unknown as PartnerChannelEntryRecord;
  const disable = () =>
    a.updateWebhookEndpoint(h.route.tenantId, endpoint.webhookId, {
      status: "disabled",
      disableReason: "operator stop",
    });
  const rotate = () =>
    a.rotateWebhookSecret(h.route.tenantId, {
      webhookId: endpoint.webhookId,
      secret: "rotated-secret",
      rotationReason: "regression",
    });
  return {
    ...h,
    a,
    b,
    facade,
    transport,
    service,
    database,
    durableEndpoint,
    durableEntry,
    disable,
    rotate,
  };
}

type Fixture = Awaited<ReturnType<typeof setup>>;
const changes: [string, string, (h: Fixture) => unknown][] = [
  ["endpoint disabled", "endpoint_disabled", (h) => h.disable()],
  ["endpoint rotated", "configuration_blocked", (h) => h.rotate()],
  [
    "endpoint URL changed",
    "configuration_blocked",
    (h) =>
      h.a.updateWebhookEndpoint(h.route.tenantId, h.binding.webhookId, {
        url: "https://new.example.test/notification",
      }),
  ],
  [
    "entry tenant changed",
    "owner_changed",
    (h) =>
      h.a.updatePlatformPartnerEntry(h.route.entrySlug, {
        tenantId: "another-tenant",
      }),
  ],
  [
    "entry inactive",
    "endpoint_disabled",
    (h) => h.a.setPlatformPartnerEntryStatus(h.route.entrySlug, "inactive"),
  ],
  [
    "entry revoked",
    "endpoint_disabled",
    (h) => h.a.revokePlatformPartnerEntry(h.route.entrySlug),
  ],
];

describe("current durable notification governance", () => {
  it.each(changes)(
    "worker B observes %s committed by service A",
    async (_name, reason, mutate) => {
      const h = await setup();
      expect(await h.transport.isAvailableFor(h.row)).toBe(true);
      await mutate(h);
      expect(await h.transport.isAvailableFor(h.row)).toBe(false);
      expect(await h.service.deliverPassengerNotification(h.row)).toMatchObject(
        {
          status: "failed",
          failureReason: reason,
          retryDisposition:
            reason === "owner_changed"
              ? "manual_only"
              : "configuration_blocked",
          result:
            reason === "owner_changed"
              ? "provider_error"
              : "provider_not_configured",
        },
      );
      expect(h.fetch).not.toHaveBeenCalled();
    },
  );

  it.each(["inactive", "revoked"] as const)(
    "classifies a real %s public entry lookup as endpoint_disabled",
    async (status) => {
      const h = await setup();
      if (status === "inactive")
        h.a.setPlatformPartnerEntryStatus(h.route.entrySlug, status);
      else h.a.revokePlatformPartnerEntry(h.route.entrySlug);
      expect(() => h.a.getPartnerEntry(h.route.entrySlug)).toThrow();
      // B still has the original active public snapshot, which must not authorize dispatch.
      expect(h.b.getPartnerEntry(h.route.entrySlug).activeFlag).toBe(true);
      expect(
        await h.facade.resolveNotificationRoute(h.route, h.row.eventType),
      ).toMatchObject({
        ready: false,
        failure: {
          failureReason: "endpoint_disabled",
          retryDisposition: "configuration_blocked",
        },
      });
    },
  );

  it.each(changes)(
    "rechecks %s after the transport's last readiness check",
    async (_name, reason, mutate) => {
      const h = await setup();
      const dispatch = h.b.dispatchPartnerNotificationAttempt.bind(h.b);
      vi.spyOn(
        h.b,
        "dispatchPartnerNotificationAttempt",
      ).mockImplementationOnce(async (command) => {
        await mutate(h);
        return dispatch(command);
      });
      expect(await h.service.deliverPassengerNotification(h.row)).toMatchObject(
        { failureReason: reason },
      );
      expect(h.fetch).not.toHaveBeenCalled();
    },
  );

  it("rejects a rotated fingerprint even after the endpoint is active again", async () => {
    const h = await setup();
    h.rotate();
    h.a.updateWebhookEndpoint(h.route.tenantId, h.binding.webhookId, {
      status: "active",
    });
    expect(await h.service.deliverPassengerNotification(h.row)).toMatchObject({
      failureReason: "configuration_blocked",
    });
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it("uses the current credential after rotation and binding revalidation", async () => {
    const h = await setup();
    h.rotate();
    h.a.updateWebhookEndpoint(h.route.tenantId, h.binding.webhookId, {
      status: "active",
    });
    h.binding.validatedEndpointFingerprint = computeEndpointFingerprint(
      h.durableEndpoint(),
    );
    expect(await h.service.deliverPassengerNotification(h.row)).toMatchObject({
      result: "delivered",
    });
    const rows = h.database.tables.get(
      "admin.phase1_tenant_webhook_deliveries",
    )!;
    expect([...rows.values()][0]).toMatchObject({
      secretVersion: 2,
      status: "delivered",
    });
    expect(h.durableEndpoint().secretVersion).toBe(2);
    expect(h.durableEndpoint().secretLastUsedAt).not.toBeNull();
  });

  it.each(["disable", "rotate"] as const)(
    "preserves concurrent %s while recording an acknowledgement",
    async (change) => {
      const h = await setup();
      const receive = h.fetch.getMockImplementation()!;
      h.fetch.mockImplementationOnce(async (...args) => {
        h[change]();
        return receive(...args);
      });
      expect(await h.service.deliverPassengerNotification(h.row)).toMatchObject(
        { result: "delivered" },
      );
      const endpoint = h.durableEndpoint();
      if (change === "disable") {
        expect(endpoint).toMatchObject({
          status: "disabled",
          runtimeMetadata: {
            disableReason: "manual_disable",
            disableReasonNote: "operator stop",
            deliveryCount: 1,
          },
        });
      } else {
        expect(endpoint).toMatchObject({
          status: "test_pending",
          secretVersion: 2,
          secretValue: "rotated-secret",
        });
        expect(
          endpoint.secretCredentials?.find((s) => s.secretVersion === 1)
            ?.lastUsedAt,
        ).not.toBeNull();
        expect(
          endpoint.secretCredentials?.find((s) => s.secretVersion === 2)
            ?.lastUsedAt,
        ).toBeNull();
      }
      expect(await h.transport.isAvailableFor(h.row)).toBe(false);
      expect(
        h.database.query.mock.calls.some(([sql]) => sql.includes("FOR UPDATE")),
      ).toBe(true);
    },
  );

  it("fails closed on durable read failure instead of using the active startup snapshot", async () => {
    const h = await setup();
    h.database.failReads();
    expect(await h.transport.isAvailableFor(h.row)).toBe(false);
    await expect(
      h.facade.resolveNotificationRoute(h.route, h.row.eventType),
    ).rejects.toThrow("durable governance unavailable");
    expect(h.fetch).not.toHaveBeenCalled();
  });
});
