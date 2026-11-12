import { randomUUID } from "node:crypto";
import { EventEmitter2 } from "@nestjs/event-emitter";
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
      undefined,
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
});
