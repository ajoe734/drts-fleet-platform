import { vi } from "vitest";
import type {
  ConsumerNotificationOutboxRecord,
  OrderPartnerNotificationRoute,
  PartnerEntryNotificationBinding,
} from "@drts/contracts";
import { PARTNER_PASSENGER_EVENT_TO_EXTERNAL_NAME } from "@drts/contracts";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { MultiTaxiService } from "../../../../apps/api/src/modules/multi-taxi/multi-taxi.service";
import {
  MultiTaxiRepository,
  type RecordPushDeliveryOutcomeInput,
} from "../../../../apps/api/src/modules/multi-taxi/multi-taxi.repository";
import { PartnerNotificationTransport } from "../../../../apps/api/src/modules/multi-taxi/partner-notification.transport";
import type { StoredPartnerNotificationContext } from "../../../../apps/api/src/modules/multi-taxi/partner-notification.types";
import { PassengerPushAdapter } from "../../../../apps/api/src/modules/multi-taxi/passenger-push.adapter";
import { PartnerNotificationDispatchFacade } from "../../../../apps/api/src/modules/tenant-partner/partner-notification-dispatch.facade";
import { computeEndpointFingerprint } from "../../../../apps/api/src/modules/tenant-partner/partner-notification-fingerprint";
import { TenantPartnerService } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import {
  WebhookDispatchService,
  type WebhookFetchResponse,
} from "../../../../apps/api/src/modules/tenant-partner/webhook-dispatch.service";

export function harness(productionHttps = false) {
  const now = new Date().toISOString();
  const row: ConsumerNotificationOutboxRecord = {
    outboxId: "outbox-1",
    orderId: "order-1",
    passengerSubjectRef: "subject-1",
    eventType: "assignment_disclosure_ready",
    assignmentVersion: 1,
    payload: {
      eventSequence: 7,
      driverId: "SECRET",
      phone: "SECRET",
      accessToken: "SECRET",
    },
    status: "pending",
    attemptCount: 0,
    nextAttemptAt: now,
    createdAt: now,
    deliveredAt: null,
  };
  const route: OrderPartnerNotificationRoute = {
    orderId: row.orderId,
    passengerSubjectRef: row.passengerSubjectRef,
    tenantId: "tenant-demo-001",
    partnerId: "partner-1",
    entrySlug: "entry-1",
    partnerUserRef: "opaque-user-1",
    drtsPassengerId: "passenger-1",
    identityLinkedAt: now,
    consentBundleVersion: "v1",
    notificationPolicyVersion: "partner_notification_v1",
    rideRef: "ride-1",
    createdAt: now,
  };
  const received = new Map<string, string>();
  const fetch = vi.fn(
    async (_url: string, init?: RequestInit): Promise<WebhookFetchResponse> => {
      const body = JSON.parse(String(init?.body));
      const duplicate = received.has(body.delivery_id);
      const receipt =
        received.get(body.delivery_id) ?? "real-partner-receipt-42";
      received.set(body.delivery_id, receipt);
      return {
        ok: true,
        status: 202,
        text: async () =>
          JSON.stringify({
            notification_id: body.data.notification_id,
            delivery_id: body.delivery_id,
            partner_entry_slug: body.data.partner_entry_slug,
            status: duplicate ? "duplicate" : "accepted",
            receipt_id: receipt,
          }),
      };
    },
  );
  const tenant = new TenantPartnerService(
    new AuditNotificationService(),
    undefined,
    new WebhookDispatchService(productionHttps ? undefined : fetch),
  );
  const endpoint = tenant.createWebhookEndpoint(route.tenantId, {
    url: "https://partner.example.test/notification",
    secret: "unit-test-secret",
    events: Object.values(PARTNER_PASSENGER_EVENT_TO_EXTERNAL_NAME),
  });
  tenant.updateWebhookEndpoint(route.tenantId, endpoint.webhookId, {
    status: "active",
  });
  const activeEndpoint = tenant.listWebhookEndpoints(route.tenantId)[0]!;
  const entry = {
    entrySlug: route.entrySlug,
    tenantId: route.tenantId,
    partnerId: route.partnerId,
    activeFlag: true,
    status: "active",
  };
  vi.spyOn(tenant, "findNotificationPartnerEntry").mockImplementation(
    async () => entry as never,
  );
  const binding: PartnerEntryNotificationBinding = {
    bindingId: "binding-1",
    entrySlug: route.entrySlug,
    tenantId: route.tenantId,
    partnerId: route.partnerId,
    webhookId: endpoint.webhookId,
    version: 1,
    state: "ready",
    purpose: "passenger_notification",
    eventTypes: Object.keys(
      PARTNER_PASSENGER_EVENT_TO_EXTERNAL_NAME,
    ) as PartnerEntryNotificationBinding["eventTypes"],
    schemaVersion: "1.0",
    acknowledgementPolicy: "durable_partner_acceptance_v1",
    validatedEndpointFingerprint: computeEndpointFingerprint(activeEndpoint),
    validatedAt: now,
    updatedAt: now,
  };
  const bindings = {
    findByEntrySlug: vi.fn(
      async () => binding as PartnerEntryNotificationBinding | null,
    ),
  };
  const link = { status: "active", drtsPassengerId: route.drtsPassengerId };
  const identities = { find: vi.fn(async () => link) };
  const facade = new PartnerNotificationDispatchFacade(
    tenant,
    bindings as never,
    identities as never,
  );
  const dispatch = vi.spyOn(facade, "dispatchNotificationAttemptByWebhookId");
  let stored: StoredPartnerNotificationContext | null = null;
  let fence = 0;
  let leasedUntil = 0;
  const relevance = { status: "assigned", assignmentVersion: 1 };
  const repository = {
    isEnabled: () => true,
    loadState: vi.fn(async () => ({ authorizations: [], vehicles: [] })),
    reportPersistenceFailure: vi.fn(),
    listDuePartnerNotifications: vi.fn(async () => {
      const disposition =
        stored?.retryDisposition ??
        (
          row.payload.partnerNotification as
            | { retryDisposition?: string }
            | undefined
        )?.retryDisposition ??
        "automatic";
      return row.status !== "delivered" &&
        disposition === "automatic" &&
        Date.parse(row.nextAttemptAt) <= Date.now() &&
        leasedUntil <= Date.now()
        ? [structuredClone(row)]
        : [];
    }),
    findOrderPartnerNotificationRoute: vi.fn(
      async () => route as OrderPartnerNotificationRoute | null,
    ),
    findPartnerNotificationContext: vi.fn(
      async () => stored && structuredClone(stored),
    ),
    findPartnerNotificationRelevance: vi.fn(async () => relevance),
    preparePartnerNotificationContext: vi.fn(
      async (context: StoredPartnerNotificationContext) => {
        stored ??= structuredClone(context);
        return structuredClone(stored);
      },
    ),
    claimPartnerNotification: vi.fn(async () => {
      const metadata = row.payload.partnerNotification as
        | { retryDisposition?: string }
        | undefined;
      if (
        leasedUntil > Date.now() ||
        row.status === "delivered" ||
        Date.parse(row.nextAttemptAt) > Date.now() ||
        (metadata?.retryDisposition &&
          metadata.retryDisposition !== "automatic")
      )
        return null;
      fence += 1;
      leasedUntil = Date.now() + 120_000;
      const attemptLimitReached =
        stored !== null &&
        row.attemptCount >= stored.retryPolicySnapshot.maxAttempts;
      if (!attemptLimitReached) row.attemptCount += 1;
      row.status = "sending";
      row.nextAttemptAt = new Date(leasedUntil).toISOString();
      return {
        record: structuredClone(row),
        fenceToken: fence,
        attemptLimitReached,
      };
    }),
    recordPushDeliveryOutcome: vi.fn(
      async (input: RecordPushDeliveryOutcomeInput) => {
        if (input.fenceToken !== fence || leasedUntil <= Date.now())
          return { recorded: false, reason: "fence_lost" };
        Object.assign(row, input.deliveryOutcome);
        row.payload.partnerNotification = input.partnerMetadata;
        if (stored)
          Object.assign(stored, input.partnerMetadata, {
            deliveredAt: input.deliveryOutcome.deliveredAt,
          });
        leasedUntil = 0;
        return { recorded: true, replayed: false };
      },
    ),
  };
  const transport = new PartnerNotificationTransport(
    repository as unknown as MultiTaxiRepository,
    facade,
  );
  const resolver = {
    resolveDevice: vi.fn(() => {
      throw new Error("device resolver must not run");
    }),
  };
  const adapter = new PassengerPushAdapter(
    { transportMode: "partner_webhook" },
    transport,
    resolver,
  );
  const createService = () =>
    new MultiTaxiService(
      {} as never,
      repository as never,
      undefined,
      undefined,
      undefined,
      adapter,
    );
  const service = createService();
  return {
    row,
    route,
    binding,
    bindings,
    link,
    entry,
    relevance,
    facade,
    dispatch,
    fetch,
    received,
    repository,
    resolver,
    adapter,
    service,
    createService,
    tenant,
    getContext: () => stored,
  };
}
