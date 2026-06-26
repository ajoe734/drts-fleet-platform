import { afterEach, describe, expect, it } from "vitest";

import { EventEmitter2 } from "@nestjs/event-emitter";

import { buildMockRecorderFixture } from "../../../../packages/shared-test-fixtures/src";

import { ApiRequestError } from "../../src/common/api-envelope";
import { OpsDispatchEventsService } from "../../src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { CallcenterService } from "../../src/modules/callcenter/callcenter.service";
import { DriverProfileService } from "../../src/modules/driver-profile/driver-profile.service";
import { OwnedMobilityService } from "../../src/modules/owned-mobility/owned-mobility.service";
import { OwnedMobilityTaskEventsService } from "../../src/modules/owned-mobility/owned-mobility-task-events.service";
import { RegulatoryRegistryService } from "../../src/modules/regulatory-registry/regulatory-registry.service";
import { SandboxDispatchGateService } from "../../src/modules/sandbox-dispatch-gate/sandbox-dispatch-gate.service";
import { SandboxGovernanceService } from "../../src/modules/sandbox-governance/sandbox-governance.service";
import { ServiceProductService } from "../../src/modules/service-product/service-product.service";
import { VehicleEligibilityService } from "../../src/modules/vehicle-eligibility/vehicle-eligibility.service";
import { VehicleEvidenceService } from "../../src/modules/vehicle-evidence/vehicle-evidence.service";

function createHarness() {
  const eventEmitter = new EventEmitter2();
  const auditNotificationService = new AuditNotificationService();
  const opsDispatchEventsService = new OpsDispatchEventsService(eventEmitter);
  const driverProfileService = new DriverProfileService(
    auditNotificationService,
  );
  const regulatoryRegistryRepository = {
    isEnabled: () => true,
    upsertDriverLocation: async () => true,
  };
  const regulatoryRegistryService = new RegulatoryRegistryService(
    opsDispatchEventsService,
    auditNotificationService,
    driverProfileService,
    regulatoryRegistryRepository as never,
  );
  const callcenterService = new CallcenterService(auditNotificationService);
  const taskEventsService = new OwnedMobilityTaskEventsService(eventEmitter);
  const serviceProductService = new ServiceProductService(
    auditNotificationService,
    undefined,
  );
  const vehicleEligibilityService = new VehicleEligibilityService(
    regulatoryRegistryService,
    auditNotificationService,
    undefined,
    serviceProductService,
  );
  vehicleEligibilityService.assertDispatchAssignmentEligible = () => undefined;
  const sandboxGovernanceService = new SandboxGovernanceService(
    auditNotificationService,
    undefined,
  );
  const vehicleEvidenceService = new VehicleEvidenceService();
  vehicleEvidenceService.registerRecorder(
    buildMockRecorderFixture({
      recorderId: "rec-veh-av-demo-001",
      vehicleId: "veh-av-demo-001",
    }),
  );
  const sandboxDispatchGateService = new SandboxDispatchGateService(
    vehicleEvidenceService,
    sandboxGovernanceService,
  );
  (sandboxDispatchGateService as any).disclosurePolicies = [
    {
      policyId: "policy-test-av-001",
      policyVersion: "test-v1",
      tenantId: "tenant-demo-001",
      businessDispatchSubtype: "enterprise_dispatch",
      partnerEntrySlug: null,
      active: true,
      channelRules: [
        {
          channel: "tenant_portal",
          messageCode: "sandbox_passenger_disclosure.av_program_notice",
          requiresAcknowledgement: false,
          acknowledgementMode: "operator_confirmed_notice",
        },
        {
          channel: "partner_portal",
          messageCode: "sandbox_passenger_disclosure.av_program_notice",
          requiresAcknowledgement: false,
          acknowledgementMode: "operator_confirmed_notice",
        },
      ],
      createdAt: "2026-06-26T00:00:00.000Z",
      updatedAt: "2026-06-26T00:00:00.000Z",
    },
  ];
  (sandboxDispatchGateService as any).disclosureCacheLoaded = true;
  const ownedMobilityService = new OwnedMobilityService(
    regulatoryRegistryService,
    auditNotificationService,
    callcenterService,
    taskEventsService,
    opsDispatchEventsService,
    undefined,
    undefined,
    vehicleEligibilityService,
    serviceProductService,
    undefined,
    undefined,
    sandboxDispatchGateService,
  );

  return {
    ownedMobilityService,
    sandboxDispatchGateService,
    regulatoryRegistryService,
    cleanup: async () => {
      await taskEventsService.onModuleDestroy();
      await opsDispatchEventsService.onModuleDestroy();
    },
  };
}

describe("INT-P2-002 sandbox dispatch hook", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      await cleanups.pop()?.();
    }
  });

  it("fails closed before assignment when an AV candidate lacks sandbox evidence", async () => {
    const { ownedMobilityService, sandboxDispatchGateService, cleanup } =
      createHarness();
    cleanups.push(cleanup);

    const booking = await ownedMobilityService.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        reservationWindowStart: "2026-06-26T14:00:00.000Z",
        reservationWindowEnd: "2026-06-26T15:00:00.000Z",
        pickup: { address: "Taipei 101", lat: 25.0338, lng: 121.5646 },
        dropoff: { address: "Taipei Main Station", lat: 25.0478, lng: 121.517 },
        passenger: { name: "Rider One", phone: "0912000000" },
      },
      "tenant-demo-001",
    );
    const disclosure =
      await sandboxDispatchGateService.resolvePassengerDisclosureForBooking({
        tenantId: "tenant-demo-001",
        businessDispatchSubtype: "enterprise_dispatch",
        partnerEntrySlug: null,
        channel: "tenant_portal",
      });
    expect(disclosure).not.toBeNull();
    (ownedMobilityService as any).orders[0].passengerDisclosure = disclosure;
    const dispatchResult = ownedMobilityService.dispatchOrder(booking.orderId, {
      mode: "auto",
    });

    try {
      await ownedMobilityService.assignDispatch({
        dispatchJobId: dispatchResult.dispatchJobId,
        vehicleId: "veh-av-missing-001",
        driverId: "drv-demo-001",
      });
    } catch (error) {
      expect((error as ApiRequestError).getResponse()).toMatchObject({
        error: {
          code: "SANDBOX_REGULATORY_APPROVAL_MISSING",
        },
      });
    }
  });

  it("allows assignment when governance, operator, booking window, route, and recorder facts align", async () => {
    const { ownedMobilityService, sandboxDispatchGateService, cleanup } =
      createHarness();
    cleanups.push(cleanup);
    await sandboxDispatchGateService.upsertPassengerDisclosurePolicy({
      policyId: "policy-test-av-allow-001",
      policyVersion: "test-v1",
      tenantId: "tenant-demo-001",
      businessDispatchSubtype: "enterprise_dispatch",
      channelRules: [
        {
          channel: "tenant_portal",
          messageCode: "sandbox_passenger_disclosure.av_program_notice",
          requiresAcknowledgement: false,
          acknowledgementMode: "operator_confirmed_notice",
        },
      ],
    });

    const booking = await ownedMobilityService.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        reservationWindowStart: "2026-06-26T14:00:00.000Z",
        reservationWindowEnd: "2026-06-26T15:00:00.000Z",
        pickup: { address: "Route Start", lat: 25.044, lng: 121.522 },
        dropoff: { address: "Route End", lat: 25.054, lng: 121.533 },
        passenger: { name: "Rider Two", phone: "0912000001" },
      },
      "tenant-demo-001",
    );
    const disclosure =
      await sandboxDispatchGateService.resolvePassengerDisclosureForBooking({
        tenantId: "tenant-demo-001",
        businessDispatchSubtype: "enterprise_dispatch",
        partnerEntrySlug: null,
        channel: "tenant_portal",
      });
    expect(disclosure).not.toBeNull();
    (ownedMobilityService as any).orders[0].passengerDisclosure = disclosure;
    const dispatchResult = ownedMobilityService.dispatchOrder(booking.orderId, {
      mode: "auto",
    });

    const assignment = await ownedMobilityService.assignDispatch({
      dispatchJobId: dispatchResult.dispatchJobId,
      vehicleId: "veh-av-demo-001",
      driverId: "safety-op-001",
      sandboxDispatchSnapshot: {
        entitlement: {
          active: true,
        },
        candidateRoute: {
          type: "MultiLineString",
          coordinates: [
            [
              [121.522, 25.044],
              [121.526, 25.047],
              [121.529, 25.05],
              [121.533, 25.054],
            ],
          ],
        },
        providerCapabilities: {
          av_dispatch: true,
          telemetry_stream: true,
          regulatory_event_feed: true,
          evidence_recorder: true,
          odd_geofence: true,
          minimal_risk_condition: true,
        },
        telemetry: {
          stale: false,
          minimalRiskConditionActive: false,
          socPercent: 80,
          currentTripCount: 0,
          odometerKm: 25_000,
        },
        regulatory: {
          approvalFresh: true,
          vehicleCertified: true,
        },
        recorder: {
          healthy: true,
        },
      },
    });

    expect(assignment.status).toBe("assigned");
    expect(ownedMobilityService.getDriverTask(assignment.taskId)).toMatchObject(
      {
        vehicleId: "veh-av-demo-001",
        driverId: "safety-op-001",
      },
    );
  });

  it("requires a passenger acknowledgement before AV assignment when the configured policy demands it", async () => {
    const { ownedMobilityService, sandboxDispatchGateService, cleanup } =
      createHarness();
    cleanups.push(cleanup);
    await sandboxDispatchGateService.upsertPassengerDisclosurePolicy({
      policyId: "policy-test-av-ack-001",
      policyVersion: "test-v1",
      tenantId: "tenant-demo-001",
      businessDispatchSubtype: "enterprise_dispatch",
      channelRules: [
        {
          channel: "tenant_portal",
          messageCode: "sandbox_passenger_disclosure.av_program_notice",
          requiresAcknowledgement: true,
          acknowledgementMode: "per_booking_checkbox",
        },
      ],
    });

    const booking = await ownedMobilityService.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        reservationWindowStart: "2026-06-26T14:00:00.000Z",
        reservationWindowEnd: "2026-06-26T15:00:00.000Z",
        pickup: { address: "Route Start", lat: 25.044, lng: 121.522 },
        dropoff: { address: "Route End", lat: 25.054, lng: 121.533 },
        passenger: { name: "Rider Ack", phone: "0912000099" },
      },
      "tenant-demo-001",
    );
    const dispatchResult = ownedMobilityService.dispatchOrder(booking.orderId, {
      mode: "auto",
    });

    await expect(
      ownedMobilityService.assignDispatch({
        dispatchJobId: dispatchResult.dispatchJobId,
        vehicleId: "veh-av-demo-001",
        driverId: "safety-op-001",
        sandboxDispatchSnapshot: {
          entitlement: {
            active: true,
          },
          candidateRoute: {
            type: "MultiLineString",
            coordinates: [
              [
                [121.522, 25.044],
                [121.526, 25.047],
                [121.529, 25.05],
                [121.533, 25.054],
              ],
            ],
          },
          providerCapabilities: {
            av_dispatch: true,
            telemetry_stream: true,
            regulatory_event_feed: true,
            evidence_recorder: true,
            odd_geofence: true,
            minimal_risk_condition: true,
          },
          telemetry: {
            stale: false,
            minimalRiskConditionActive: false,
            socPercent: 80,
            currentTripCount: 0,
            odometerKm: 25_000,
          },
          regulatory: {
            approvalFresh: true,
            vehicleCertified: true,
          },
          recorder: {
            healthy: true,
          },
        },
      }),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: "SANDBOX_PASSENGER_ACKNOWLEDGEMENT_REQUIRED",
        },
      },
    });

    const updatedBooking =
      await ownedMobilityService.acknowledgePassengerDisclosure(
        "tenant-demo-001",
        booking.bookingId,
        { actorType: "passenger", actorRef: "rider-ack-001" },
      );
    expect(updatedBooking.passengerDisclosure?.acknowledgedAt).toBeTruthy();

    await expect(
      ownedMobilityService.assignDispatch({
        dispatchJobId: dispatchResult.dispatchJobId,
        vehicleId: "veh-av-demo-001",
        driverId: "safety-op-001",
        sandboxDispatchSnapshot: {
          entitlement: {
            active: true,
          },
          candidateRoute: {
            type: "MultiLineString",
            coordinates: [
              [
                [121.522, 25.044],
                [121.526, 25.047],
                [121.529, 25.05],
                [121.533, 25.054],
              ],
            ],
          },
          providerCapabilities: {
            av_dispatch: true,
            telemetry_stream: true,
            regulatory_event_feed: true,
            evidence_recorder: true,
            odd_geofence: true,
            minimal_risk_condition: true,
          },
          telemetry: {
            stale: false,
            minimalRiskConditionActive: false,
            socPercent: 80,
            currentTripCount: 0,
            odometerKm: 25_000,
          },
          regulatory: {
            approvalFresh: true,
            vehicleCertified: true,
          },
          recorder: {
            healthy: true,
          },
        },
      }),
    ).resolves.toMatchObject({
      status: "assigned",
    });
  });

  it("fails closed before assignment when entitlement snapshot is omitted", async () => {
    const { ownedMobilityService, cleanup } = createHarness();
    cleanups.push(cleanup);

    const booking = await ownedMobilityService.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        reservationWindowStart: "2026-06-26T14:00:00.000Z",
        reservationWindowEnd: "2026-06-26T15:00:00.000Z",
        pickup: { address: "Route Start", lat: 25.044, lng: 121.522 },
        dropoff: { address: "Route End", lat: 25.054, lng: 121.533 },
        passenger: { name: "Rider Three", phone: "0912000002" },
      },
      "tenant-demo-001",
    );
    const dispatchResult = ownedMobilityService.dispatchOrder(booking.orderId, {
      mode: "auto",
    });

    await expect(
      ownedMobilityService.assignDispatch({
        dispatchJobId: dispatchResult.dispatchJobId,
        vehicleId: "veh-av-demo-001",
        driverId: "safety-op-001",
        sandboxDispatchSnapshot: {
          candidateRoute: {
            type: "MultiLineString",
            coordinates: [
              [
                [121.522, 25.044],
                [121.526, 25.047],
                [121.529, 25.05],
                [121.533, 25.054],
              ],
            ],
          },
          providerCapabilities: {
            av_dispatch: true,
            telemetry_stream: true,
            regulatory_event_feed: true,
            evidence_recorder: true,
            odd_geofence: true,
            minimal_risk_condition: true,
          },
          telemetry: {
            stale: false,
            minimalRiskConditionActive: false,
            socPercent: 80,
            currentTripCount: 0,
            odometerKm: 25_000,
          },
          regulatory: {
            approvalFresh: true,
            vehicleCertified: true,
          },
          recorder: {
            healthy: true,
          },
        },
      }),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: "SANDBOX_REGULATORY_APPROVAL_MISSING",
        },
      },
    });
  });

  it("builds tenant and partner sandbox fulfillment projections without exposing internal reasons", async () => {
    const { ownedMobilityService, cleanup } = createHarness();
    cleanups.push(cleanup);

    const booking = await ownedMobilityService.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        reservationWindowStart: "2026-06-26T14:00:00.000Z",
        reservationWindowEnd: "2026-06-26T15:00:00.000Z",
        pickup: { address: "Route Start", lat: 25.044, lng: 121.522 },
        dropoff: { address: "Route End", lat: 25.054, lng: 121.533 },
        passenger: { name: "Rider Four", phone: "0912000003" },
      },
      "tenant-demo-001",
    );
    (ownedMobilityService as any).orders[0].partnerEntrySlug =
      "partner-entry-001";
    const dispatchResult = ownedMobilityService.dispatchOrder(booking.orderId, {
      mode: "auto",
    });

    await ownedMobilityService.assignDispatch({
      dispatchJobId: dispatchResult.dispatchJobId,
      vehicleId: "veh-av-demo-001",
      driverId: "safety-op-001",
      sandboxDispatchSnapshot: {
        entitlement: {
          active: true,
        },
        candidateRoute: {
          type: "MultiLineString",
          coordinates: [
            [
              [121.522, 25.044],
              [121.526, 25.047],
              [121.529, 25.05],
              [121.533, 25.054],
            ],
          ],
        },
        providerCapabilities: {
          av_dispatch: true,
          telemetry_stream: true,
          regulatory_event_feed: true,
          evidence_recorder: true,
          odd_geofence: true,
          minimal_risk_condition: true,
        },
        telemetry: {
          stale: false,
          minimalRiskConditionActive: false,
          socPercent: 80,
          currentTripCount: 0,
          odometerKm: 25_000,
        },
        regulatory: {
          approvalFresh: true,
          vehicleCertified: true,
        },
        recorder: {
          healthy: true,
        },
      },
    });

    const tenantProjection = ownedMobilityService.getTenantSandboxFulfillment(
      "tenant-demo-001",
      booking.bookingId,
    );
    const partnerProjection = ownedMobilityService.getPartnerSandboxFulfillment(
      "partner-entry-001",
      booking.bookingId,
    );

    expect(tenantProjection).toMatchObject({
      audience: "tenant",
      fulfillmentMode: "tesla_av",
      providerBrandDisclosed: false,
    });
    expect(partnerProjection).toMatchObject({
      audience: "partner",
      providerBrandDisclosed: true,
    });
    expect(tenantProjection).not.toHaveProperty("reasonCodes");
    expect(partnerProjection).not.toHaveProperty("reasonCodes");
  });

  it("returns sandbox fulfillment to pending_dispatch after a rejected AV assignment", async () => {
    const { ownedMobilityService, cleanup } = createHarness();
    cleanups.push(cleanup);

    const booking = await ownedMobilityService.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        reservationWindowStart: "2026-06-26T14:00:00.000Z",
        reservationWindowEnd: "2026-06-26T15:00:00.000Z",
        pickup: { address: "Route Start", lat: 25.044, lng: 121.522 },
        dropoff: { address: "Route End", lat: 25.054, lng: 121.533 },
        passenger: { name: "Rider Five", phone: "0912000004" },
      },
      "tenant-demo-001",
    );
    (ownedMobilityService as any).orders[0].partnerEntrySlug =
      "partner-entry-001";
    const dispatchResult = ownedMobilityService.dispatchOrder(booking.orderId, {
      mode: "auto",
    });

    const assignment = await ownedMobilityService.assignDispatch({
      dispatchJobId: dispatchResult.dispatchJobId,
      vehicleId: "veh-av-demo-001",
      driverId: "safety-op-001",
      sandboxDispatchSnapshot: {
        entitlement: {
          active: true,
        },
        candidateRoute: {
          type: "MultiLineString",
          coordinates: [
            [
              [121.522, 25.044],
              [121.526, 25.047],
              [121.529, 25.05],
              [121.533, 25.054],
            ],
          ],
        },
        providerCapabilities: {
          av_dispatch: true,
          telemetry_stream: true,
          regulatory_event_feed: true,
          evidence_recorder: true,
          odd_geofence: true,
          minimal_risk_condition: true,
        },
        telemetry: {
          stale: false,
          minimalRiskConditionActive: false,
          socPercent: 80,
          currentTripCount: 0,
          odometerKm: 25_000,
        },
        regulatory: {
          approvalFresh: true,
          vehicleCertified: true,
        },
        recorder: {
          healthy: true,
        },
      },
    });

    ownedMobilityService.rejectDriverTask(assignment.taskId, {
      reasonCode: "driver_rejected",
      reasonNote: "Operator requested reassignment",
    });

    expect(
      ownedMobilityService.getTenantSandboxFulfillment(
        "tenant-demo-001",
        booking.bookingId,
      ),
    ).toMatchObject({
      sandboxTripId: null,
      fulfillmentMode: "hidden",
      state: "pending_dispatch",
      statusCode: "redispatch_required",
      messages: [
        {
          messageCode: "sandbox_fulfillment.status_update_available",
          category: "info",
        },
      ],
      providerBrandDisclosed: false,
    });

    expect(
      ownedMobilityService.getPartnerSandboxFulfillment(
        "partner-entry-001",
        booking.bookingId,
      ),
    ).toMatchObject({
      sandboxTripId: null,
      fulfillmentMode: "hidden",
      state: "pending_dispatch",
      statusCode: "redispatch_required",
      messages: [
        {
          messageCode: "sandbox_fulfillment.status_update_available",
          category: "info",
        },
      ],
      providerBrandDisclosed: false,
    });
  });

  it("preserves completed AV visibility for partner sandbox fulfillment projections", async () => {
    const { ownedMobilityService, cleanup } = createHarness();
    cleanups.push(cleanup);

    const booking = await ownedMobilityService.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        reservationWindowStart: "2026-06-26T14:00:00.000Z",
        reservationWindowEnd: "2026-06-26T15:00:00.000Z",
        pickup: { address: "Route Start", lat: 25.044, lng: 121.522 },
        dropoff: { address: "Route End", lat: 25.054, lng: 121.533 },
        passenger: { name: "Rider Six", phone: "0912000005" },
      },
      "tenant-demo-001",
    );
    (ownedMobilityService as any).orders[0].partnerEntrySlug =
      "partner-entry-001";
    const dispatchResult = ownedMobilityService.dispatchOrder(booking.orderId, {
      mode: "auto",
    });

    const assignment = await ownedMobilityService.assignDispatch({
      dispatchJobId: dispatchResult.dispatchJobId,
      vehicleId: "veh-av-demo-001",
      driverId: "safety-op-001",
      sandboxDispatchSnapshot: {
        entitlement: {
          active: true,
        },
        candidateRoute: {
          type: "MultiLineString",
          coordinates: [
            [
              [121.522, 25.044],
              [121.526, 25.047],
              [121.529, 25.05],
              [121.533, 25.054],
            ],
          ],
        },
        providerCapabilities: {
          av_dispatch: true,
          telemetry_stream: true,
          regulatory_event_feed: true,
          evidence_recorder: true,
          odd_geofence: true,
          minimal_risk_condition: true,
        },
        telemetry: {
          stale: false,
          minimalRiskConditionActive: false,
          socPercent: 80,
          currentTripCount: 0,
          odometerKm: 25_000,
        },
        regulatory: {
          approvalFresh: true,
          vehicleCertified: true,
        },
        recorder: {
          healthy: true,
        },
      },
    });

    ownedMobilityService.acceptDriverTask(assignment.taskId, {
      acceptedAt: "2026-06-26T14:05:00.000Z",
    });
    ownedMobilityService.departDriverTask(assignment.taskId, {
      departedAt: "2026-06-26T14:08:00.000Z",
    });
    ownedMobilityService.arrivedPickup(assignment.taskId, {
      arrivedAt: "2026-06-26T14:12:00.000Z",
    });
    ownedMobilityService.startDriverTask(assignment.taskId, {
      startedAt: "2026-06-26T14:15:00.000Z",
    });
    ownedMobilityService.completeDriverTask(assignment.taskId, {
      completedAt: "2026-06-26T14:35:00.000Z",
      actualDistanceKm: 8.5,
      actualDurationSec: 1200,
      proof: {
        photos: ["cHJvb2YtcGhvdG8tMDAx"],
      },
    });

    expect(
      ownedMobilityService.getPartnerSandboxFulfillment(
        "partner-entry-001",
        booking.bookingId,
      ),
    ).toMatchObject({
      sandboxTripId: null,
      fulfillmentMode: "tesla_av",
      state: "completed",
      statusCode: "completed",
      providerBrandDisclosed: true,
      messages: [
        {
          messageCode: "sandbox_fulfillment.trip_completed",
          category: "info",
        },
      ],
    });
  });
});
