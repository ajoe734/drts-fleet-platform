import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { EventEmitterModule } from "@nestjs/event-emitter";

import { OwnedMobilityService } from "../../src/modules/owned-mobility/owned-mobility.service";
import { RocOperationsModule } from "../../src/modules/roc-operations/roc-operations.module";
import { SandboxDispatchGateService } from "../../src/modules/sandbox-dispatch-gate/sandbox-dispatch-gate.service";

@Module({
  imports: [EventEmitterModule.forRoot(), RocOperationsModule],
})
class RocFallbackHttpTestModule {}

describe("INT-P2-008 HTTP routing / ROC fallback to human", () => {
  let baseUrl: string;
  let closeApplication: (() => Promise<void>) | undefined;
  let ownedMobilityService: OwnedMobilityService;
  let sandboxDispatchGateService: SandboxDispatchGateService;

  beforeAll(async () => {
    const app = await NestFactory.create(RocFallbackHttpTestModule, {
      logger: false,
    });
    app.setGlobalPrefix("api");
    await app.listen(0, "127.0.0.1");

    const address = app.getHttpServer().address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected an ephemeral HTTP server address.");
    }

    baseUrl = `http://127.0.0.1:${address.port}`;
    ownedMobilityService = app.get(OwnedMobilityService);
    sandboxDispatchGateService = app.get(SandboxDispatchGateService);
    closeApplication = async () => {
      await app.close();
    };
  });

  afterAll(async () => {
    await closeApplication?.();
  });

  it("exposes POST /api/roc/trips/:tripId/fallback-to-human through RocOperationsModule", async () => {
    const booking = await ownedMobilityService.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        reservationWindowStart: "2026-06-26T14:00:00.000Z",
        reservationWindowEnd: "2026-06-26T15:00:00.000Z",
        pickup: { address: "Taipei 101", lat: 25.0338, lng: 121.5646 },
        dropoff: { address: "Taipei Main Station", lat: 25.0478, lng: 121.517 },
        passenger: { name: "Rider Route", phone: "0912000014" },
      },
      "tenant-demo-001",
    );
    const dispatchResult = ownedMobilityService.dispatchOrder(booking.orderId, {
      mode: "auto",
    });
    const decision = await sandboxDispatchGateService.evaluateDispatch({
      orderId: booking.orderId,
      dispatchJobId: dispatchResult.dispatchJobId,
      vehicleId: "veh-av-missing-001",
      sandboxProgramId: "phase2-tesla-fsd-sandbox-202606",
      policyVersion: "sandbox-dispatch-gate.v1",
    });

    expect(decision.fallbackRequired).toBe(true);

    const response = await fetch(
      `${baseUrl}/api/roc/trips/${booking.orderId}/fallback-to-human`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": "req-p2-fallback-http-001",
        },
        body: JSON.stringify({
          dispatchJobId: dispatchResult.dispatchJobId,
          sandboxDecisionId: decision.decisionId,
          humanVehicleId: "veh-demo-001",
          humanDriverId: "drv-demo-001",
          revisedEtaMinutes: 19,
          reason: "Route-level regression guard for ROC human fallback",
          rocOperatorId: "ops-roc-http-001",
          trigger: "gate_fallback_required",
        }),
      },
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      data: expect.objectContaining({
        tripId: booking.orderId,
        orderId: booking.orderId,
        bookingId: booking.bookingId,
        dispatchJobId: dispatchResult.dispatchJobId,
        status: "assigned",
        assignmentId: expect.any(String),
        taskId: expect.any(String),
        etaSnapshot: expect.objectContaining({
          etaMinutes: 19,
        }),
        report: expect.objectContaining({
          tripId: booking.orderId,
          orderId: booking.orderId,
          bookingId: booking.bookingId,
          dispatchJobId: dispatchResult.dispatchJobId,
          sandboxDecisionId: decision.decisionId,
          humanVehicleId: "veh-demo-001",
          humanDriverId: "drv-demo-001",
          revisedEtaMinutes: 19,
        }),
      }),
      meta: {
        requestId: "req-p2-fallback-http-001",
        timestamp: expect.any(String),
      },
    });

    expect(ownedMobilityService.getOrder(booking.orderId)).toMatchObject({
      orderId: booking.orderId,
      bookingId: booking.bookingId,
      status: "assigned",
      etaSnapshot: expect.objectContaining({
        etaMinutes: 19,
      }),
      complianceFlags: expect.arrayContaining([
        "sandbox_human_fallback",
        "sandbox_exception_reported",
      ]),
    });
  });

  it("exposes ops-readable sandbox fulfillment and booking-scoped fallback reports for the same booking", async () => {
    const booking = await ownedMobilityService.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        reservationWindowStart: "2026-06-26T16:00:00.000Z",
        reservationWindowEnd: "2026-06-26T17:00:00.000Z",
        pickup: { address: "Taipei Arena", lat: 25.0504, lng: 121.5505 },
        dropoff: { address: "Songshan Airport", lat: 25.0697, lng: 121.5526 },
        passenger: { name: "Rider Projection", phone: "0912000015" },
      },
      "tenant-demo-001",
    );
    const dispatchResult = ownedMobilityService.dispatchOrder(booking.orderId, {
      mode: "auto",
    });
    const decision = await sandboxDispatchGateService.evaluateDispatch({
      orderId: booking.orderId,
      dispatchJobId: dispatchResult.dispatchJobId,
      vehicleId: "veh-av-missing-001",
      sandboxProgramId: "phase2-tesla-fsd-sandbox-202606",
      policyVersion: "sandbox-dispatch-gate.v1",
    });
    expect(decision.fallbackRequired).toBe(true);

    const fallbackResponse = await fetch(
      `${baseUrl}/api/roc/trips/${booking.orderId}/fallback-to-human`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": "req-p2-fallback-http-002",
        },
        body: JSON.stringify({
          dispatchJobId: dispatchResult.dispatchJobId,
          sandboxDecisionId: decision.decisionId,
          humanVehicleId: "veh-demo-004",
          humanDriverId: "drv-demo-004",
          revisedEtaMinutes: 11,
          reason: "Projection parity coverage for ops-console AV fallback",
          rocOperatorId: "ops-roc-http-002",
          trigger: "gate_fallback_required",
        }),
      },
    );
    expect(fallbackResponse.status).toBe(201);

    const projectionResponse = await fetch(
      `${baseUrl}/api/ops/bookings/${booking.bookingId}/sandbox-fulfillment?audience=passenger`,
      {
        headers: {
          "x-request-id": "req-p2-fallback-http-003",
        },
      },
    );

    expect(projectionResponse.status).toBe(200);
    await expect(projectionResponse.json()).resolves.toEqual({
      data: expect.objectContaining({
        bookingId: booking.bookingId,
        orderId: booking.orderId,
        audience: "passenger",
        fulfillmentMode: "mixed",
        etaMinutes: 11,
        extraChargeDisclosed: false,
        messages: [
          {
            messageCode: "sandbox_fulfillment.mixed_fulfillment_active",
            category: "warning",
          },
        ],
      }),
      meta: {
        requestId: "req-p2-fallback-http-003",
        timestamp: expect.any(String),
      },
    });

    const reportsResponse = await fetch(
      `${baseUrl}/api/roc/bookings/${booking.bookingId}/fallback-reports`,
      {
        headers: {
          "x-request-id": "req-p2-fallback-http-004",
        },
      },
    );

    expect(reportsResponse.status).toBe(200);
    await expect(reportsResponse.json()).resolves.toEqual({
      data: {
        items: [
          expect.objectContaining({
            bookingId: booking.bookingId,
            orderId: booking.orderId,
            dispatchJobId: dispatchResult.dispatchJobId,
            sandboxDecisionId: decision.decisionId,
            humanVehicleId: "veh-demo-004",
            humanDriverId: "drv-demo-004",
            revisedEtaMinutes: 11,
            reportArtifactId: expect.any(String),
          }),
        ],
      },
      meta: {
        requestId: "req-p2-fallback-http-004",
        timestamp: expect.any(String),
      },
    });
  });
});
