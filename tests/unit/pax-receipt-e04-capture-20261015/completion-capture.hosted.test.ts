import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { DriverProfileService } from "../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { DriverProfileRepository } from "../../../apps/api/src/modules/driver-profile/driver-profile.repository";
import { RegulatoryRegistryRepository } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.repository";
import { FleetPartnerRepository } from "../../../apps/api/src/modules/fleet-partner/fleet-partner.repository";
import { FleetPartnerService } from "../../../apps/api/src/modules/fleet-partner/fleet-partner.service";
import { CertificateSupportRepository } from "../../../apps/api/src/modules/certificate-support/certificate-support.repository";
import { CertificateSupportService } from "../../../apps/api/src/modules/certificate-support/certificate-support.service";
import { MultiTaxiService } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.service";
import { OWNED_MOBILITY_MULTI_TAXI_TRIP_COMPLETED_EVENT } from "../../../apps/api/src/modules/owned-mobility/owned-mobility-events";
import { mapNativePassengerCertificate } from "../../../packages/passenger-client/src/ride/native-presentation";
import {
  hostedPaymentEnabled,
  PaymentPostgresHarness,
} from "../pax-qa-20261009/payment-postgres-harness";
import { command, setup } from "./completion-fixture";

const requireApi = createRequire(
  new URL("../../../apps/api/package.json", import.meta.url),
);
const { EventEmitter2 } = requireApi("eventemitter2");

/** Formal migrations and production repositories only. Native in-memory
 * dispatch/start actions prepare a precompletion dependency fixture, which is
 * persisted by OwnedMobilityRepository. Booking/browser/legal/PSP acceptance
 * is not claimed here. All authority data and PSP responses are synthetic.
 * No worker VM database or server is opened: existing hosted CI only. */
describe.skipIf(!hostedPaymentEnabled)(
  "E04 production completion and readback on formal PostgreSQL",
  () => {
    const h = new PaymentPostgresHarness();
    beforeAll(() => h.open(), 240000);
    beforeEach(() => h.reset(), 30000);
    afterAll(() => h.close(), 30000);

    async function fixture() {
      const ctx = await setup(false);
      const owner = await h.account();
      const method = await h.method(owner);
      const audit = new AuditNotificationService();
      const profiles = new DriverProfileService(
        audit,
        new DriverProfileRepository(h.database),
      );
      const registry = new RegulatoryRegistryRepository(h.database);
      Reflect.set(ctx.registry, "driverProfileService", profiles);
      Reflect.set(ctx.registry, "regulatoryRegistryRepository", registry);
      await profiles.upsertAdminProfile(ctx.driverId, {
        name: "Synthetic full name",
        driverSurname: "歐陽",
      });
      await registry.persistChanges({
        vehicles: ctx.registry.listVehicles(),
        driverCredentials: [
          {
            driverId: ctx.driverId,
            registrationNo: "SIMULATED-NOT-REAL-9001",
            registrationArea: "合成・非正式",
            effectiveFrom: "2026-01-01T00:00:00Z",
            effectiveUntil: "2099-01-01T00:00:00Z",
            status: "verified_active",
            maskedDisplay: "••••9001",
            verifiedByActorId: "synthetic",
            verifiedAt: new Date().toISOString(),
            sourceSubmissionId: null,
            version: 1,
            updatedAt: new Date().toISOString(),
          },
        ],
      });
      const authorizationId = randomUUID();
      const now = new Date().toISOString();
      await h.taxi.persistAuthorization({
        authorizationId,
        operatorId: "pg-synthetic-operator",
        authorityCode: "SIMULATED",
        businessPlanVersion: "synthetic",
        status: "approved",
        serviceAreaCodes: ["TPE"],
        activeFareVersionId: "taipei-20230401",
        effectiveFrom: "2026-01-01T00:00:00Z",
        effectiveUntil: null,
        createdAt: now,
        updatedAt: now,
      });
      const fleets = new FleetPartnerService(
        {} as never,
        ctx.service,
        ctx.registry,
        new FleetPartnerRepository(h.database),
      );
      const fleet = await fleets.createFleetPartner({
        legalName: "PG 合成演練業者（非正式）",
        displayName: "Not the legal name",
        businessRegistrationNo: "SIMULATED",
        contactName: "Synthetic",
        contactPhone: "Synthetic",
        partnershipType: "business_dispatch_fleet",
        multiTaxiOperatorIds: ["pg-synthetic-operator"],
      });
      Object.assign(ctx.storedOrder, {
        passenger: {
          name: "Synthetic passenger",
          phone: "0900000000",
          passengerId: owner,
        },
        operatingAuthorizationId: authorizationId,
        paymentMethodTokenRef: method.paymentMethodId,
      });
      const report = ctx.service.getReportingSnapshot();
      // V0091 requires both resources to be reserved when a live assignment
      // commits. Use the production transaction/writers, including the same
      // insert-before-reserve ordering as native dispatch; do not bypass the
      // deferred constraint while preparing this precompletion fixture.
      await h.owned.withTransaction(async (tx) => {
        await h.owned.persistOrderWorkflow(tx, {
          orders: [ctx.service.getOrder(ctx.storedOrder.orderId as string)],
          dispatchJobs: report.dispatchJobs,
          dispatchAssignments: report.dispatchAssignments,
          driverTasks: [ctx.service.getDriverTask(ctx.taskId)],
        });
        for (const assignment of report.dispatchAssignments) {
          await h.owned.reserveDispatchResources(tx, {
            orderId: assignment.orderId,
            assignmentId: assignment.assignmentId,
            driverId: assignment.driverId,
            vehicleId: assignment.vehicleId,
            expiresAt: null,
          });
          await h.owned.occupyDispatchResourceReservations(
            assignment.assignmentId,
            tx,
          );
        }
      });
      const capacity = await h.pool!.query(
        "SELECT resource_type,status,reservation_group_id FROM ops.dispatch_resource_reservations WHERE order_id=$1 ORDER BY resource_type",
        [ctx.storedOrder.orderId],
      );
      expect(capacity.rows).toEqual([
        {
          resource_type: "driver",
          status: "occupied",
          reservation_group_id: expect.any(String),
        },
        {
          resource_type: "vehicle",
          status: "occupied",
          reservation_group_id: capacity.rows[0]?.reservation_group_id,
        },
      ]);
      Reflect.set(ctx.service, "ownedMobilityRepository", h.owned);
      Reflect.set(
        ctx.service,
        "receiptFleetRepository",
        new FleetPartnerRepository(h.database),
      );
      Reflect.set(ctx.service, "receiptRegistryRepository", registry);
      Reflect.set(ctx.service, "receiptPaymentMethods", h.methodService);
      const certificates = new CertificateSupportService(
        new CertificateSupportRepository(h.database),
      );
      const emitter = new EventEmitter2();
      emitter.on(
        OWNED_MOBILITY_MULTI_TAXI_TRIP_COMPLETED_EVENT,
        (
          event: Parameters<CertificateSupportService["writeCompletedTrip"]>[0],
        ) => certificates.writeCompletedTrip(event),
      );
      Reflect.set(ctx.service, "eventEmitter", emitter);
      const multi = new MultiTaxiService(
        ctx.service,
        h.taxi,
        undefined,
        audit,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        certificates,
      );
      return {
        ...ctx,
        owner,
        method,
        profiles,
        fleets,
        fleet,
        certificates,
        multi,
      };
    }

    it("completion outbox delivers captured E04 to the real writer; peer/master updates, same-request replay and duplicate delivery retain the original passenger receipt", async () => {
      const f = await fixture();
      try {
        const completed = await f.service.completeDriverTask(
          f.taskId,
          command,
          "pg-e04-completion",
        );
        await Reflect.get(f.service, "driverCompletionOutboxDrainPromise");
        const released = await h.pool!.query(
          "SELECT resource_type,status FROM ops.dispatch_resource_reservations WHERE order_id=$1 ORDER BY resource_type",
          [f.storedOrder.orderId],
        );
        expect(released.rows).toEqual([
          { resource_type: "driver", status: "released" },
          { resource_type: "vehicle", status: "released" },
        ]);
        const outbox = await h.pool!.query(
          "SELECT status,payload FROM ops.driver_completion_outbox WHERE task_id=$1 AND effect_type='multi_taxi_certificate'",
          [f.taskId],
        );
        expect(outbox.rows).toHaveLength(1);
        expect(outbox.rows[0].status).toBe("delivered");
        const event = outbox.rows[0].payload.event;
        expect(event.e04Snapshot).toEqual({
          fleetOperatorName: "PG 合成演練業者（非正式）",
          driverSurname: "歐陽",
          driverRegistrationMasked: "••••9001",
          paymentMethodDisplay: "SYNTHETIC ••••0042",
          fareBreakdown: command.actualFareBreakdown,
        });
        const raw = await h.taxi.findElectronicReceipt(event.orderId);
        expect(raw?.record.e04Snapshot).toEqual(event.e04Snapshot);
        expect(mapNativePassengerCertificate(raw, true).state).toBe(
          "available",
        );
        const downloads = await f.multi.getTrustedPassengerReceiptDownloads(
          event.orderId,
          f.owner,
        );
        expect(downloads.orderId).toBe(event.orderId);
        const html = await f.multi.getTrustedPassengerReceiptArtifact(
          event.orderId,
          f.owner,
          "html",
        );
        expect(html.buffer.toString()).toContain("PG 合成演練業者（非正式）");
        expect(html.buffer.toString()).toContain("歐陽");
        const pdf = await f.multi.getTrustedPassengerReceiptArtifact(
          event.orderId,
          f.owner,
          "pdf",
        );
        expect(pdf.buffer.subarray(0, 8).toString()).toBe("%PDF-1.7");
        // Separate DB peer writes the current master; immutable receipt is reread.
        const peer = h.peerDatabase();
        const peerProfiles = new DriverProfileService(
          new AuditNotificationService(),
          new DriverProfileRepository(peer),
        );
        await peerProfiles.prepareProfileAuthority(f.driverId);
        await peerProfiles.updateProfile(f.driverId, { driverSurname: "司馬" });
        const peerFleets = new FleetPartnerService(
          {} as never,
          f.service,
          f.registry,
          new FleetPartnerRepository(peer),
        );
        const mapped = await peerFleets.findFleetPartnerForMultiTaxiOperator(
          "pg-synthetic-operator",
        );
        await peerFleets.updateFleetPartner(mapped!.fleetPartnerId, {
          legalName: "Later master",
        });
        await h.methodService.remove(f.owner, f.method.paymentMethodId);
        expect(
          await f.service.completeDriverTask(
            f.taskId,
            command,
            "pg-e04-completion",
          ),
        ).toEqual(completed);
        await f.certificates.writeCompletedTrip(event);
        expect(await h.taxi.findElectronicReceipt(event.orderId)).toEqual(raw);
        expect(
          (
            await f.multi.getTrustedPassengerReceiptArtifact(
              event.orderId,
              f.owner,
              "html",
            )
          ).buffer,
        ).toEqual(html.buffer);
        await expect(
          f.multi.getTrustedPassengerReceiptDownloads(
            event.orderId,
            await h.account(),
          ),
        ).rejects.toMatchObject({ code: "PASSENGER_RIDE_NOT_FOUND" });
      } finally {
        await f.service.onModuleDestroy();
      }
    });

    it("absent explicit Fleet mapping retains the formal missing-fields response on the actual persisted receipt", async () => {
      const f = await fixture();
      try {
        await f.fleets.updateFleetPartner(f.fleet.fleetPartnerId, {
          multiTaxiOperatorIds: [],
        });
        await f.service.completeDriverTask(f.taskId, command, "pg-e04-missing");
        await Reflect.get(f.service, "driverCompletionOutboxDrainPromise");
        const raw = await h.taxi.findElectronicReceipt(
          f.storedOrder.orderId as string,
        );
        expect(raw).not.toBeNull();
        expect(raw!.record).not.toHaveProperty("e04Snapshot");
        expect(mapNativePassengerCertificate(raw, true)).toMatchObject({
          state: "error",
          errorCode: "PASSENGER_RECEIPT_LEGAL_FIELDS_MISSING",
        });
        await expect(
          f.multi.getTrustedPassengerReceiptDownloads(raw!.orderId, f.owner),
        ).rejects.toMatchObject({ code: "PASSENGER_E04_NOT_READY" });
      } finally {
        await f.service.onModuleDestroy();
      }
    });
  },
);
