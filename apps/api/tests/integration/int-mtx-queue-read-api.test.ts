import "reflect-metadata";

import { Module } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BootstrapAuthGuard } from "../../src/common/auth";
import { OpsDispatchEventsService } from "../../src/common/ops-dispatch-events.service";
import { OwnedMobilityController } from "../../src/modules/owned-mobility/owned-mobility.controller";
import { OwnedMobilityTaskEventsService } from "../../src/modules/owned-mobility/owned-mobility-task-events.service";
import { OwnedMobilityService } from "../../src/modules/owned-mobility/owned-mobility.service";

const runningApps: Array<{ close: () => Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(runningApps.splice(0).map((app) => app.close()));
});

function createQueueService() {
  const registry = {
    getEligibleCandidates: vi.fn(() => []),
    getVehicleDispatchability: vi.fn(() => true),
    getDriverAvailability: vi.fn(() => true),
    getVehicleLicenseType: vi.fn(() => "taxi"),
    getVehiclePassengerDisclosureProfile: vi.fn(() => null),
    getDriverPublicRegistrationCredential: vi.fn(() => null),
    listVehicles: vi.fn(() => [
      {
        vehicleId: "veh-mtx-001",
        plateNo: "MTX-001",
        operatingArea: "TPE",
      },
      {
        vehicleId: "veh-ordinary-001",
        plateNo: "TAXI-001",
        operatingArea: "TPE",
      },
    ]),
    listDrivers: vi.fn(() => [
      { driverId: "drv-mtx-001", name: "Multi Taxi Driver" },
      { driverId: "drv-ordinary-001", name: "Ordinary Taxi Driver" },
    ]),
    listSupplyPairs: vi.fn(() => [
      {
        vehicleId: "veh-mtx-001",
        driverId: "drv-mtx-001",
        etaMinutes: 4,
      },
      {
        vehicleId: "veh-ordinary-001",
        driverId: "drv-ordinary-001",
        etaMinutes: 6,
      },
    ]),
  };
  const persistedMultiTaxiDenial = {
    traceId: "trace-mtx-physical-001",
    orderId: "queue:rank-tpe:veh-mtx-001",
    eventType: "queue.entry.created",
    message: "queue.entry.created",
    createdAt: "2026-07-24T08:00:00.000Z",
    details: {
      queueEntryId: "queue-mtx-physical-001",
      siteId: "rank-tpe",
      vehicleId: "veh-mtx-001",
      position: 1,
      runtimeProfileCode: "multi_taxi_direct",
      queueMode: "physical_rank",
      operatingAuthorizationId: "auth-mtx-001",
    },
  };
  const repository = {
    loadState: vi.fn(async () => ({
      orders: [],
      dispatchJobs: [],
      dispatchAttempts: [],
      dispatchAssignments: [],
      driverTasks: [],
      dispatchTraceLogs: [persistedMultiTaxiDenial],
      passengerDisclosureSnapshots: [],
      consumerNotificationOutbox: [],
    })),
    persistChanges: vi.fn(async () => undefined),
    reportPersistenceFailure: vi.fn(),
  };
  const audit = {
    recordAuditLog: vi.fn(),
    recordNotification: vi.fn(),
  };
  const callcenter = {
    registerRecordingAttachmentListener: vi.fn(),
    registerRecordingStateChangeListener: vi.fn(),
    linkOrderToCallSession: vi.fn(),
  };
  return new OwnedMobilityService(
    registry as never,
    audit as never,
    callcenter as never,
    new OwnedMobilityTaskEventsService(new EventEmitter2()),
    new OpsDispatchEventsService(new EventEmitter2()),
    repository as never,
  );
}

async function startQueueApi() {
  const service = createQueueService();

  @Module({
    controllers: [OwnedMobilityController],
    providers: [
      { provide: OwnedMobilityService, useValue: service },
      { provide: APP_GUARD, useClass: BootstrapAuthGuard },
    ],
  })
  class QueueReadApiTestModule {}

  const app = await NestFactory.create(QueueReadApiTestModule, {
    logger: false,
  });
  app.setGlobalPrefix("api");
  await app.listen(0, "127.0.0.1");
  runningApps.push(app);
  const ordinaryEntry = service.queueCheckIn({
    vehicleId: "veh-ordinary-001",
    siteId: "rank-tpe",
    queueMode: "physical_rank",
  });
  const address = app.getHttpServer().address() as {
    address: string;
    port: number;
  };
  return {
    ordinaryEntry,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

const opsHeaders = {
  "x-actor-type": "ops_user",
  "x-actor-id": "ops-queue-001",
  "x-realm": "ops",
  "x-scopes": "dispatch:read",
};

describe("MTX-QUEUE-003 authenticated queue read API", () => {
  it("denies anonymous and tenant callers while allowing scoped Ops reads", async () => {
    const { baseUrl } = await startQueueApi();

    const anonymous = await fetch(`${baseUrl}/api/dispatch/queue`);
    expect(anonymous.status).toBe(401);

    const tenant = await fetch(`${baseUrl}/api/dispatch/queue`, {
      headers: {
        "x-actor-type": "tenant_admin",
        "x-actor-id": "tenant-admin-001",
        "x-realm": "tenant",
        "x-tenant-id": "tenant-001",
        "x-scopes": "dispatch:read",
      },
    });
    expect(tenant.status).toBe(403);
    await expect(tenant.json()).resolves.toMatchObject({
      error: { code: "AUTH_REALM_DENIED" },
    });

    const ops = await fetch(`${baseUrl}/api/dispatch/queue`, {
      headers: opsHeaders,
    });
    expect(ops.status).toBe(200);
  });

  it("returns server-authoritative list/detail eligibility with ordinary taxi isolation", async () => {
    const { baseUrl, ordinaryEntry } = await startQueueApi();
    const listResponse = await fetch(`${baseUrl}/api/dispatch/queue`, {
      headers: opsHeaders,
    });
    const listEnvelope = (await listResponse.json()) as {
      data: { items: Array<Record<string, any>> };
    };
    const deniedMultiTaxi = listEnvelope.data.items.find(
      (entry) => entry.queueEntryId === "queue-mtx-physical-001",
    );
    const eligibleOrdinary = listEnvelope.data.items.find(
      (entry) => entry.queueEntryId === ordinaryEntry.queueEntryId,
    );

    expect(deniedMultiTaxi).toMatchObject({
      runtimeProfileCode: "multi_taxi_direct",
      queueMode: "physical_rank",
      operatingAuthorizationId: "auth-mtx-001",
      driverId: "drv-mtx-001",
      vehiclePlateNo: "MTX-001",
      serviceAreaCode: "TPE",
      eligibility: {
        decision: "denied",
        reasonCode: "MULTI_TAXI_QUEUE_MODE_FORBIDDEN",
      },
    });
    expect(eligibleOrdinary).toMatchObject({
      runtimeProfileCode: "ordinary_taxi",
      queueMode: "physical_rank",
      eligibility: {
        decision: "eligible",
        reasonCode: null,
      },
    });
    expect(
      JSON.stringify(
        listEnvelope.data.items.map((entry) => entry.availableActions),
      ),
    ).not.toMatch(/override|approval|force/i);

    const detailResponse = await fetch(
      `${baseUrl}/api/dispatch/queue/${ordinaryEntry.queueEntryId}`,
      { headers: opsHeaders },
    );
    expect(detailResponse.status).toBe(200);
    await expect(detailResponse.json()).resolves.toMatchObject({
      data: {
        queueEntryId: ordinaryEntry.queueEntryId,
        eligibility: { decision: "eligible" },
      },
    });

    const missingResponse = await fetch(
      `${baseUrl}/api/dispatch/queue/missing-entry`,
      { headers: opsHeaders },
    );
    expect(missingResponse.status).toBe(404);
    await expect(missingResponse.json()).resolves.toMatchObject({
      error: { code: "QUEUE_ENTRY_NOT_FOUND" },
    });
  });
});
