import { randomUUID } from "node:crypto";
import { EventEmitter2 } from "@nestjs/event-emitter";
import type {
  CreateTenantBookingCommand,
  PartnerChannelEntryRecord,
} from "@drts/contracts";
import type { BootstrapRequestIdentity } from "../../src/common/auth/auth.types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DatabaseService } from "../../src/common/db";
import { IdempotencyRepository } from "../../src/common/idempotency/idempotency.repository";
import { IdempotencyService } from "../../src/common/idempotency/idempotency.service";
import { OpsDispatchEventsService } from "../../src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { CallcenterService } from "../../src/modules/callcenter/callcenter.service";
import { OwnedMobilityController } from "../../src/modules/owned-mobility/owned-mobility.controller";
import { OwnedMobilityRepository } from "../../src/modules/owned-mobility/owned-mobility.repository";
import { OwnedMobilityService } from "../../src/modules/owned-mobility/owned-mobility.service";
import { OwnedMobilityTaskEventsService } from "../../src/modules/owned-mobility/owned-mobility-task-events.service";
import { ServiceProductService } from "../../src/modules/service-product/service-product.service";
import { TenantPartnerService } from "../../src/modules/tenant-partner/tenant-partner.service";

const databaseUrl = process.env.DATABASE_URL;
// This existing API integration scope runs after formal migrations in hosted CI.
// It opens PG only when selected there. It does not run HTTP/Nest/browser servers
// and does not claim to verify the external partner identity/roster provider.
describe("C032 real JSONB booking persistence and cold replay", () => {
  const databases: DatabaseService[] = [];
  const resources: { tenantId: string }[] = [];
  const eventServices: {
    tasks: OwnedMobilityTaskEventsService;
    ops: OpsDispatchEventsService;
  }[] = [];
  afterEach(async () => {
    try {
      const database = databases[0];
      if (database)
        for (const resource of resources) {
          await database.query(
            "DELETE FROM ops.phase1_dispatch_trace_logs WHERE order_id IN (SELECT order_id FROM ops.phase1_owned_orders WHERE tenant_id = $1)",
            [resource.tenantId],
          );
          await database.query(
            "DELETE FROM ops.phase1_owned_orders WHERE tenant_id = $1",
            [resource.tenantId],
          );
          await database.query(
            "DELETE FROM ops.idempotency_records WHERE scope = $1",
            ["tenant:" + resource.tenantId + ":booking_create"],
          );
        }
    } finally {
      resources.length = 0;
      for (const events of eventServices.splice(0)) {
        await events.tasks.onModuleDestroy();
        await events.ops.onModuleDestroy();
      }
      for (const database of databases.splice(0))
        await database.onModuleDestroy();
    }
  });

  function instance(
    database: DatabaseService,
    subtype: "travel_agency_transfer" | "insurance_replacement_vehicle",
    partners?: TenantPartnerService,
  ) {
    const audit = new AuditNotificationService();
    const products = new ServiceProductService(audit);
    products.createServiceProduct({
      serviceProductType: subtype,
      displayName: "SIM C032 integration product",
      timing: "reservation",
      active: true,
      allowedLicenseTypes: ["business_vehicle"],
      defaultBillingMode: "partner_settlement",
      defaultProofRequirements: ["photo"],
      fixedFareAllowed: true,
      meterRequired: false,
    });
    const emitter = new EventEmitter2();
    const tasks = new OwnedMobilityTaskEventsService(emitter);
    const ops = new OpsDispatchEventsService(emitter);
    eventServices.push({ tasks, ops });
    const service = new OwnedMobilityService(
      {} as never,
      audit,
      new CallcenterService(audit),
      tasks,
      ops,
      new OwnedMobilityRepository(database),
      partners,
      undefined,
      products,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      new IdempotencyService(new IdempotencyRepository(database)),
    );
    return new OwnedMobilityController(service, {} as never);
  }

  it.runIf(Boolean(databaseUrl)).each([
    {
      subtype: "travel_agency_transfer" as const,
      details: {
        subtype: "travel_agency_transfer" as const,
        groupCode: "SIM-PG-GROUP",
        groupSize: 2,
        itineraryLink: "https://travel.example.test/SIM-PG-GROUP",
        rosterPassengers: ["SIM Tour Leader", "SIM Passenger"],
        meetingPoint: "SIM meeting point",
      },
    },
    {
      subtype: "insurance_replacement_vehicle" as const,
      details: {
        subtype: "insurance_replacement_vehicle" as const,
        claimNumber: "SIM-PG-CLAIM",
        policyNumber: "SIM-PG-POLICY",
        claimReference: "SIM-PG-REFERENCE",
        claimantName: "SIM Insured Passenger",
        replacementStart: "2099-06-05T02:00:00.000Z",
        replacementEnd: "2099-06-06T02:00:00.000Z",
        replacementVehicleClass: "business_vehicle",
        caseHandler: "SIM Handler",
      },
    },
  ])(
    "creates $subtype then replays the same receipt on a fresh actual service",
    async ({ subtype, details }) => {
      const database = new DatabaseService();
      databases.push(database);
      const tenantId = randomUUID();
      const resource = { tenantId };
      resources.push(resource);
      const key = "C032-PG-" + randomUUID();
      const command = {
        businessDispatchSubtype: subtype,
        idempotencyKey: key,
        reservationWindowStart: "2099-06-05T02:00:00.000Z",
        reservationWindowEnd: "2099-06-05T03:00:00.000Z",
        pickup: { address: "SIM PG Pickup" },
        dropoff: { address: "SIM PG Dropoff" },
        passenger: { name: "SIM PG Passenger", phone: "0912000000" },
        partnerBookingDetails: details,
      };
      const created = await instance(database, subtype).createPartnerBooking(
        command,
        null,
        tenantId,
      );
      const repository = new OwnedMobilityRepository(database);
      await vi.waitFor(async () =>
        expect(
          await repository.findOrderById(created.data.orderId),
        ).toMatchObject({
          orderId: created.data.orderId,
          bookingId: created.data.bookingId,
          partnerBookingDetails: details,
        }),
      );
      const cold = instance(database, subtype);
      const replayed = await cold.createPartnerBooking(command, null, tenantId);
      expect(replayed.data).toMatchObject({
        replayed: true,
        orderId: created.data.orderId,
        bookingId: created.data.bookingId,
        booking: {
          orderId: created.data.orderId,
          bookingId: created.data.bookingId,
          partnerBookingDetails: details,
        },
        order: {
          orderId: created.data.orderId,
          bookingId: created.data.bookingId,
          partnerBookingDetails: details,
        },
      });
      expect(
        (await cold.getPartnerBooking(created.data.bookingId, null, tenantId))
          .data,
      ).toMatchObject({
        orderId: created.data.orderId,
        partnerBookingDetails: details,
      });
      expect(
        (await cold.getPartnerOrder(created.data.orderId, null)).data,
      ).toMatchObject({
        bookingId: created.data.bookingId,
        partnerBookingDetails: details,
      });
      const stored = await database.query<{ record: unknown }>(
        "SELECT record FROM ops.phase1_owned_orders WHERE order_id = $1",
        [created.data.orderId],
      );
      expect(stored.rows).toHaveLength(1);
      expect(stored.rows[0]!.record).toMatchObject({
        partnerBookingDetails: details,
      });
    },
  );

  it.runIf(Boolean(databaseUrl))(
    "cold PG partner history filters owners before count and pagination while preserving legacy and entry-key access",
    async () => {
      const database = new DatabaseService();
      databases.push(database);
      const tenantId = randomUUID();
      const otherTenantId = randomUUID();
      resources.push({ tenantId }, { tenantId: otherTenantId });
      // Public master-data methods supply real create-command context. Orders,
      // count, filtering and pagination use the actual migrated PG repository.
      const partners = new TenantPartnerService(new AuditNotificationService());
      try {
        const resident = await partners.upsertPassenger(tenantId, {
          fullName: "SIM History Resident",
          mobile: "0912000032",
        });
        const anotherResident = await partners.upsertPassenger(tenantId, {
          fullName: "SIM Other History Resident",
          mobile: "0912000033",
        });
        const programId = randomUUID();
        const makeEntry = (entryTenantId: string) => {
          const marker = randomUUID();
          return partners.createPlatformPartnerEntry({
            tenantId: entryTenantId,
            partnerCode: "c032_history_" + marker.replaceAll("-", ""),
            partnerType: "travel_agency",
            programId,
            entrySlug: "c032-history-" + marker,
            displayName: "SIM PG history entry",
            businessDispatchSubtype: "travel_agency_transfer",
            authMode: "partner_api_key",
            eligibilityMode: "none",
            status: "active",
            activeFlag: true,
          });
        };
        const entry = await makeEntry(tenantId);
        const otherEntry = await makeEntry(tenantId);
        const otherTenantEntry = await makeEntry(otherTenantId);
        const entryIdentity = (
          source: PartnerChannelEntryRecord,
        ): BootstrapRequestIdentity => ({
          authMode: "jwt_bearer",
          actorType: "partner_api_key",
          actorId: "SIM-PG-entry-key",
          realm: "partner",
          tenantId: source.tenantId,
          partnerId: source.partnerId,
          partnerProgramId: source.programId,
          partnerEntrySlug: source.entrySlug,
          roleFamilies: ["partner"],
          roles: ["partner_api_key"],
          scopes: ["partner:book"],
          requestId: null,
        });
        const writer = instance(database, "travel_agency_transfer", partners);
        const create = async (
          source: PartnerChannelEntryRecord,
          day: number,
          passengerId?: string,
        ) => {
          const command: CreateTenantBookingCommand = {
            businessDispatchSubtype: "travel_agency_transfer",
            partnerEntrySlug: source.entrySlug,
            ...(passengerId ? { passengerId } : {}),
            idempotencyKey: "C032-history-" + randomUUID(),
            reservationWindowStart:
              "2099-06-" + String(day).padStart(2, "0") + "T02:00:00.000Z",
            reservationWindowEnd:
              "2099-06-" + String(day).padStart(2, "0") + "T03:00:00.000Z",
            pickup: { address: "SIM PG history pickup" },
            dropoff: { address: "SIM PG history dropoff" },
            passenger: { name: "SIM History Passenger", phone: "0912000032" },
            partnerBookingDetails: {
              subtype: "travel_agency_transfer",
              groupCode: "SIM-HISTORY-" + day,
              groupSize: 1,
              itineraryLink: "https://travel.example.test/history/" + day,
              rosterPassengers: ["SIM History Passenger"],
              meetingPoint: "SIM PG meeting point",
            },
          };
          const result = await writer.createPartnerBooking(
            command,
            entryIdentity(source),
            source.tenantId,
          );
          await vi.waitFor(async () => {
            expect(
              await new OwnedMobilityRepository(database).findOrderById(
                result.data.orderId,
              ),
            ).toMatchObject({
              orderId: result.data.orderId,
              bookingId: result.data.bookingId,
              tenantId: source.tenantId,
              partnerId: source.partnerId,
              partnerProgramId: source.programId,
              partnerEntrySlug: source.entrySlug,
              passenger: { passengerId: passengerId ?? null },
            });
          });
          return result.data;
        };
        const current = await create(entry, 5, resident.passengerId);
        const legacy = await create(entry, 6);
        const otherPassenger = await create(
          entry,
          7,
          anotherResident.passengerId,
        );
        // A genuine entry update permits a same-entry/same-partner old-program
        // record. Restore the current program before normal reads.
        const anotherProgramEntry = await partners.updatePlatformPartnerEntry(
          entry.entrySlug,
          { programId: randomUUID() },
        );
        const otherProgram = await create(anotherProgramEntry, 8);
        await partners.updatePlatformPartnerEntry(entry.entrySlug, {
          programId,
        });
        const otherChannel = await create(otherEntry, 9);
        const otherTenant = await create(otherTenantEntry, 10);
        const coldDatabase = new DatabaseService();
        databases.push(coldDatabase);
        // New service and connection: the writer's in-memory order feed cannot
        // supply either the page or its total.
        const cold = instance(coldDatabase, "travel_agency_transfer", partners);
        const identity: BootstrapRequestIdentity = {
          ...entryIdentity(entry),
          actorType: "referral_passenger",
          actorId: resident.passengerId,
          drtsPassengerId: resident.passengerId,
          roles: ["referral_passenger"],
        };
        const first = (
          await cold.listPartnerBookings({ page: 1, pageSize: 1 }, identity)
        ).data;
        expect(first.pagination).toEqual({
          page: 1,
          pageSize: 1,
          totalItems: 2,
          totalPages: 2,
        });
        expect(first.items.map((item) => item.orderId)).toEqual([
          legacy.orderId,
        ]);
        expect(first.items[0]).toMatchObject({
          bookingId: legacy.bookingId,
          partnerEntrySlug: entry.entrySlug,
        });
        const second = (
          await cold.listPartnerBookings({ page: 2, pageSize: 1 }, identity)
        ).data;
        expect(second.pagination).toEqual({
          page: 2,
          pageSize: 1,
          totalItems: 2,
          totalPages: 2,
        });
        expect(second.items.map((item) => item.orderId)).toEqual([
          current.orderId,
        ]);
        expect(second.items[0]).toMatchObject({
          bookingId: current.bookingId,
          passenger: { passengerId: resident.passengerId },
        });
        const pastEnd = (
          await cold.listPartnerBookings({ page: 3, pageSize: 1 }, identity)
        ).data;
        expect(pastEnd.items).toEqual([]);
        expect(pastEnd.pagination).toEqual({
          page: 3,
          pageSize: 1,
          totalItems: 2,
          totalPages: 2,
        });
        for (const wrongScope of [
          { partnerId: randomUUID() },
          { partnerProgramId: randomUUID() },
          { partnerEntrySlug: otherEntry.entrySlug },
          { tenantId: otherTenantId },
        ]) {
          const empty = (
            await cold.listPartnerBookings(
              { page: 1, pageSize: 1 },
              { ...identity, ...wrongScope },
            )
          ).data;
          expect(empty.items).toEqual([]);
          expect(empty.pagination).toMatchObject({
            totalItems: 0,
            totalPages: 0,
          });
        }
        const keyHistory = (
          await cold.listPartnerBookings(
            { page: 1, pageSize: 20 },
            entryIdentity(entry),
          )
        ).data;
        expect(keyHistory.pagination.totalItems).toBe(3);
        expect(keyHistory.items.map((item) => item.orderId)).toEqual([
          otherPassenger.orderId,
          legacy.orderId,
          current.orderId,
        ]);
        const ordinary = (
          await cold.listTenantBookings(
            { page: 1, pageSize: 20 },
            null,
            tenantId,
          )
        ).data;
        expect(ordinary.pagination.totalItems).toBe(5);
        expect(ordinary.items.map((item) => item.orderId).sort()).toEqual(
          [
            current.orderId,
            legacy.orderId,
            otherPassenger.orderId,
            otherProgram.orderId,
            otherChannel.orderId,
          ].sort(),
        );
        expect(ordinary.items.map((item) => item.orderId)).not.toContain(
          otherTenant.orderId,
        );
        expect(
          (await cold.getPartnerBooking(current.bookingId, identity, tenantId))
            .data.orderId,
        ).toBe(current.orderId);
        await expect(
          cold.getPartnerBooking(otherPassenger.bookingId, identity, tenantId),
        ).rejects.toMatchObject({ code: "PARTNER_SCOPE_MISMATCH" });
      } finally {
        partners.onModuleDestroy();
      }
    },
  );
});
