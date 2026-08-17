import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

import {
  IDEMPOTENCY_KEY_REQUIRED,
  IDEMPOTENCY_KEY_REUSED,
  IDEMPOTENCY_KEY_TOO_LONG,
} from "@drts/contracts";
import type {
  AssignDispatchCommand,
  CreateOwnedOrderCommand,
  CreateReferralPassengerBookingCommand,
  CreateTenantBookingCommand,
  DispatchOrderCommand,
  ReassignDispatchCommand,
  RedispatchOrderCommand,
} from "@drts/contracts";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import type { BootstrapRequestIdentity } from "../../apps/api/src/common/auth";
import {
  IdempotencyRepository,
  IdempotencyService,
} from "../../apps/api/src/common/idempotency";
import { OpsDispatchEventsService } from "../../apps/api/src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { CallcenterService } from "../../apps/api/src/modules/callcenter/callcenter.service";
import { DriverProfileService } from "../../apps/api/src/modules/driver-profile/driver-profile.service";
import { OwnedMobilityController } from "../../apps/api/src/modules/owned-mobility/owned-mobility.controller";
import { OwnedMobilityTaskEventsService } from "../../apps/api/src/modules/owned-mobility/owned-mobility-task-events.service";
import { OwnedMobilityService } from "../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { RegulatoryRegistryService } from "../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { TenantPartnerService } from "../../apps/api/src/modules/tenant-partner/tenant-partner.service";

function createHarness() {
  const auditService = new AuditNotificationService();
  const callcenterService = new CallcenterService(auditService);
  const regulatoryRegistryService = new RegulatoryRegistryService(
    new OpsDispatchEventsService(new EventEmitter() as never),
    auditService,
    new DriverProfileService(auditService),
  );
  const idempotencyRepository = new IdempotencyRepository();
  const idempotencyService = new IdempotencyService(idempotencyRepository);

  const tenantPartnerService = new TenantPartnerService(auditService);

  const ownedMobilityService = new OwnedMobilityService(
    regulatoryRegistryService,
    auditService,
    callcenterService,
    new OwnedMobilityTaskEventsService(new EventEmitter() as never),
    new OpsDispatchEventsService(new EventEmitter() as never),
    undefined,
    tenantPartnerService,
    undefined,
    undefined,
    idempotencyService,
  );

  ownedMobilityService.registerCallRecordingListeners();

  const controller = new OwnedMobilityController(
    ownedMobilityService,
    idempotencyService,
    tenantPartnerService,
  );

  return {
    auditService,
    callcenterService,
    regulatoryRegistryService,
    idempotencyRepository,
    idempotencyService,
    tenantPartnerService,
    ownedMobilityService,
    controller,
  };
}

describe("Owned Mobility Idempotency Integration (CONF-IDEM-002)", () => {
  describe("Command 1: Passenger Order Creation (createPassengerOrder / POST orders)", () => {
    const passengerIdentity: BootstrapRequestIdentity = {
      realm: "passenger",
      actorType: "passenger_user",
      actorId: "passenger-101",
      userId: "user-101",
      email: "passenger@example.com",
      roles: ["passenger"],
      claims: {},
    };

    const orderCommand: CreateOwnedOrderCommand = {
      pickup: {
        address: "Taipei 101, Section 5, Xinyi Rd",
        lat: 25.0339,
        lng: 121.5645,
      },
      dropoff: {
        address: "Taipei Main Station, Zhongzheng Dist",
        lat: 25.0478,
        lng: 121.517,
      },
      passenger: {
        passengerId: "passenger-101",
        name: "Test Passenger",
        phone: "0912345678",
      },
    };

    it("rejects missing idempotency key with 400 IDEMPOTENCY_KEY_REQUIRED", async () => {
      const { controller } = createHarness();

      await expect(
        controller.createOwnedOrder(
          orderCommand,
          passengerIdentity,
          undefined, // missing header
          "req-1",
        ),
      ).rejects.toMatchObject({
        status: 400,
        response: {
          error: {
            code: IDEMPOTENCY_KEY_REQUIRED,
          },
        },
      });
    });

    it("rejects idempotency key exceeding 255 characters with 400 IDEMPOTENCY_KEY_TOO_LONG", async () => {
      const { controller } = createHarness();
      const longKey = "k".repeat(256);

      await expect(
        controller.createOwnedOrder(
          orderCommand,
          passengerIdentity,
          longKey,
          "req-1",
        ),
      ).rejects.toMatchObject({
        status: 400,
        response: {
          error: {
            code: IDEMPOTENCY_KEY_TOO_LONG,
          },
        },
      });
    });

    it("creates order on first submission and replays exact response with identical payload without creating a duplicate record", async () => {
      const { controller, ownedMobilityService } = createHarness();
      const idempotencyKey = "order-create-key-001";

      const firstResponse = await controller.createOwnedOrder(
        orderCommand,
        passengerIdentity,
        idempotencyKey,
        "req-1",
      );

      expect(firstResponse.data.orderId).toBeDefined();
      expect(firstResponse.data.status).toBe("ready_for_dispatch");
      expect(ownedMobilityService.listOrders()).toHaveLength(1);

      // Replay identical command with identical key
      const replayResponse = await controller.createOwnedOrder(
        orderCommand,
        passengerIdentity,
        idempotencyKey,
        "req-2",
      );

      expect(replayResponse.data.orderId).toBe(firstResponse.data.orderId);
      expect(replayResponse.data.orderNo).toBe(firstResponse.data.orderNo);
      // Total orders in system must strictly remain 1 (no duplicate record)
      expect(ownedMobilityService.listOrders()).toHaveLength(1);
    });

    it("rejects repeated key with differing payload with 409 IDEMPOTENCY_KEY_REUSED", async () => {
      const { controller, ownedMobilityService } = createHarness();
      const idempotencyKey = "order-create-key-002";

      await controller.createOwnedOrder(
        orderCommand,
        passengerIdentity,
        idempotencyKey,
        "req-1",
      );

      const differingCommand: CreateOwnedOrderCommand = {
        ...orderCommand,
        dropoff: {
          address: "Different Dropoff Address, Da'an Dist",
          lat: 25.026,
          lng: 121.543,
        },
      };

      await expect(
        controller.createOwnedOrder(
          differingCommand,
          passengerIdentity,
          idempotencyKey,
          "req-2",
        ),
      ).rejects.toMatchObject({
        status: 409,
        response: {
          error: {
            code: IDEMPOTENCY_KEY_REUSED,
          },
        },
      });

      // No second order created on conflict
      expect(ownedMobilityService.listOrders()).toHaveLength(1);
    });

    it("respects HTTP header precedence over body-field idempotency key", async () => {
      const { controller, ownedMobilityService } = createHarness();
      const headerKey = "header-key-alpha";
      const bodyKey = "body-key-beta";

      const commandWithBodyKey: CreateOwnedOrderCommand = {
        ...orderCommand,
        idempotencyKey: bodyKey,
      };

      const res = await controller.createOwnedOrder(
        commandWithBodyKey,
        passengerIdentity,
        headerKey, // Header provided
        "req-1",
      );

      expect(res.data.orderId).toBeDefined();

      // Replay with headerKey succeeds
      const replayHeader = await controller.createOwnedOrder(
        commandWithBodyKey,
        passengerIdentity,
        headerKey,
        "req-2",
      );
      expect(replayHeader.data.orderId).toBe(res.data.orderId);
      expect(ownedMobilityService.listOrders()).toHaveLength(1);
    });
  });

  describe("Command 2: Tenant & Referral Booking Creation (createTenantBooking / POST tenant/bookings)", () => {
    const tenantAdminIdentity: BootstrapRequestIdentity = {
      realm: "tenant",
      actorType: "tenant_admin",
      actorId: "admin-alpha",
      userId: "user-admin-1",
      tenantId: "tenant-acme-001",
      roles: ["tenant_admin"],
      claims: {},
    };

    const bookingCommand: CreateTenantBookingCommand = {
      businessDispatchSubtype: "enterprise_dispatch",
      direction: "pickup",
      pickup: {
        address: "Nangang Software Park, Nangang Dist",
        lat: 25.059,
        lng: 121.616,
      },
      dropoff: {
        address: "Taipei 101, Xinyi Dist",
        lat: 25.0339,
        lng: 121.5645,
      },
      reservationWindowStart: new Date(Date.now() + 7200000).toISOString(),
      reservationWindowEnd: new Date(Date.now() + 10800000).toISOString(),
      passenger: {
        passengerId: "pax-corp-1",
        name: "Corporate VIP",
        phone: "0988776655",
      },
    };

    it("rejects missing idempotency key with 400 IDEMPOTENCY_KEY_REQUIRED", async () => {
      const { controller } = createHarness();

      await expect(
        controller.createTenantBooking(
          bookingCommand,
          tenantAdminIdentity,
          undefined, // missing header
          "tenant-acme-001",
          "req-1",
        ),
      ).rejects.toMatchObject({
        status: 400,
        response: {
          error: {
            code: IDEMPOTENCY_KEY_REQUIRED,
          },
        },
      });
    });

    it("creates tenant booking and replays stored response with replayed: true", async () => {
      const { controller, ownedMobilityService } = createHarness();
      const idempotencyKey = "tenant-booking-key-001";

      const firstResponse = await controller.createTenantBooking(
        bookingCommand,
        tenantAdminIdentity,
        idempotencyKey,
        "tenant-acme-001",
        "req-1",
      );

      expect(firstResponse.data.bookingId).toBeDefined();
      expect(firstResponse.data.orderId).toBeDefined();
      expect(firstResponse.data.replayed).toBe(false);
      expect(ownedMobilityService.listOrders()).toHaveLength(1);

      // Replay with matching payload
      const replayResponse = await controller.createTenantBooking(
        bookingCommand,
        tenantAdminIdentity,
        idempotencyKey,
        "tenant-acme-001",
        "req-2",
      );

      expect(replayResponse.data.bookingId).toBe(firstResponse.data.bookingId);
      expect(replayResponse.data.orderId).toBe(firstResponse.data.orderId);
      expect(replayResponse.data.replayed).toBe(true);
      // Total orders strictly remains 1
      expect(ownedMobilityService.listOrders()).toHaveLength(1);
    });

    it("rejects repeated key with differing payload with 409 IDEMPOTENCY_KEY_REUSED", async () => {
      const { controller, ownedMobilityService } = createHarness();
      const idempotencyKey = "tenant-booking-key-002";

      await controller.createTenantBooking(
        bookingCommand,
        tenantAdminIdentity,
        idempotencyKey,
        "tenant-acme-001",
        "req-1",
      );

      const modifiedCommand: CreateTenantBookingCommand = {
        ...bookingCommand,
        direction: "dropoff",
      };

      await expect(
        controller.createTenantBooking(
          modifiedCommand,
          tenantAdminIdentity,
          idempotencyKey,
          "tenant-acme-001",
          "req-2",
        ),
      ).rejects.toMatchObject({
        status: 409,
        response: {
          error: {
            code: IDEMPOTENCY_KEY_REUSED,
          },
        },
      });

      expect(ownedMobilityService.listOrders()).toHaveLength(1);
    });

    it("enforces tenant boundary isolation (same key in different tenants does not collide)", async () => {
      const { controller, ownedMobilityService } = createHarness();
      const sharedKey = "shared-tenant-intent-key";

      const tenantBetaAdminIdentity: BootstrapRequestIdentity = {
        ...tenantAdminIdentity,
        tenantId: "tenant-newco-001",
      };

      // Tenant Alpha creation
      const resAlpha = await controller.createTenantBooking(
        bookingCommand,
        tenantAdminIdentity,
        sharedKey,
        "tenant-acme-001",
        "req-alpha",
      );

      // Tenant Beta creation with identical key name
      const resBeta = await controller.createTenantBooking(
        bookingCommand,
        tenantBetaAdminIdentity,
        sharedKey,
        "tenant-newco-001",
        "req-beta",
      );

      expect(resAlpha.data.bookingId).not.toBe(resBeta.data.bookingId);
      expect(resAlpha.data.orderId).not.toBe(resBeta.data.orderId);
      expect(ownedMobilityService.listOrders()).toHaveLength(2);
    });

    it("reconciles referral passenger booking with header and body field precedence", async () => {
      const { controller, ownedMobilityService } = createHarness();
      const referralPassengerIdentity: BootstrapRequestIdentity = {
        authMode: "jwt_bearer",
        realm: "partner",
        actorType: "referral_passenger",
        actorId: "pax-ref-001",
        tenantId: "tenant-demo-001",
        partnerId: "partner_ead6bf3d-e858-47cc-bfe1-5a3742524118",
        partnerProgramId: "program-referral-community",
        partnerEntrySlug: "yuhe-residence",
        drtsPassengerId: "pax-ref-001",
        roles: ["passenger"],
        claims: {},
      };

      const referralCommand: CreateReferralPassengerBookingCommand = {
        entrySlug: "yuhe-residence",
        pickupAddress: "Hotel Grand, Xinyi Dist",
        dropoffAddress: "Taoyuan Airport Terminal 2",
        passengerName: "Referral VIP",
        passengerPhone: "0912345678",
        idempotencyKey: "body-referral-key-100",
      };

      // First call uses body idempotencyKey when header is omitted
      const firstRes = await controller.createReferralPassengerBooking(
        referralCommand,
        referralPassengerIdentity,
        undefined,
        "req-1",
      );

      expect(firstRes.data.orderId).toBeDefined();
      expect(firstRes.data.replayed).toBe(false);

      // Replay with identical body key
      const replayRes = await controller.createReferralPassengerBooking(
        referralCommand,
        referralPassengerIdentity,
        undefined,
        "req-2",
      );

      expect(replayRes.data.orderId).toBe(firstRes.data.orderId);
      expect(replayRes.data.replayed).toBe(true);
      expect(ownedMobilityService.listOrders()).toHaveLength(1);

      // Now pass explicit Header `Idempotency-Key`: header takes precedence
      const headerPrecedenceKey = "header-referral-key-200";
      const headerRes = await controller.createReferralPassengerBooking(
        referralCommand,
        referralPassengerIdentity,
        headerPrecedenceKey,
        "req-3",
      );

      expect(headerRes.data.orderId).not.toBe(firstRes.data.orderId);
      expect(ownedMobilityService.listOrders()).toHaveLength(2);
    });
  });

  describe("Command 3: Dispatch Assign and Redispatch (POST dispatch/assign, POST orders/:id/dispatch)", () => {
    const passengerIdentity: BootstrapRequestIdentity = {
      realm: "passenger",
      actorType: "passenger_user",
      actorId: "passenger-101",
      userId: "user-101",
      email: "passenger@example.com",
      roles: ["passenger"],
      claims: {},
    };

    const orderCommand: CreateOwnedOrderCommand = {
      pickup: {
        address: "台中市梧棲區中二路一段9號",
        lat: 24.256,
        lng: 120.525,
      },
      dropoff: {
        address: "台中市大安區興安路378號",
        lat: 24.341,
        lng: 120.584,
      },
      passenger: {
        passengerId: "passenger-101",
        name: "李先生",
        phone: "0911222333",
      },
    };

    it("rejects missing idempotency key on dispatch assignment with 400 IDEMPOTENCY_KEY_REQUIRED", async () => {
      const { controller, ownedMobilityService } = createHarness();

      const order = await ownedMobilityService.createPassengerOrder(
        orderCommand,
        passengerIdentity,
        "req-init",
        undefined,
        "init-key-1",
      );
      const dispatchJob = await ownedMobilityService.dispatchOrder(
        order.orderId,
        { mode: "auto" },
        "req-disp",
        "disp-key-1",
      );
      expect(dispatchJob.dispatchJobId).toBeDefined();

      const assignCommand: AssignDispatchCommand = {
        dispatchJobId: dispatchJob.dispatchJobId,
        vehicleId: "V-101",
        driverId: "D-101",
      };

      await expect(
        controller.assignDispatch(
          assignCommand,
          undefined, // missing header
          "req-assign",
        ),
      ).rejects.toMatchObject({
        status: 400,
        response: {
          error: {
            code: IDEMPOTENCY_KEY_REQUIRED,
          },
        },
      });
    });

    it("assigns dispatch on first call and replays stored assignment without creating duplicate task or attempt", async () => {
      const { controller, ownedMobilityService } = createHarness();

      const order = await ownedMobilityService.createPassengerOrder(
        {
          pickup: {
            address: "台中市梧棲區中二路一段9號",
          },
          dropoff: {
            address: "台中市大安區興安路378號",
          },
          passenger: {
            name: "李先生",
            phone: "0911222333",
          },
        },
        passengerIdentity,
        "req-init",
        undefined,
        "init-key-2",
      );
      const dispatchJob = await ownedMobilityService.dispatchOrder(
        order.orderId,
        { mode: "auto" },
        "req-disp",
        "disp-key-2",
      );
      expect(dispatchJob.dispatchJobId).toBeDefined();

      const candidates = await ownedMobilityService.listDispatchCandidates(
        dispatchJob.dispatchJobId,
      );
      expect(candidates.length).toBeGreaterThan(0);
      const candidate = candidates[0]!;

      const assignCommand: AssignDispatchCommand = {
        dispatchJobId: dispatchJob.dispatchJobId,
        vehicleId: candidate.vehicleId,
        driverId: candidate.driverId,
      };

      const assignKey = `dispatch-assign-${order.orderId}-001`;

      const firstAssign = await controller.assignDispatch(
        assignCommand,
        assignKey,
        "req-assign-1",
      );

      expect(firstAssign.data.assignmentId).toBeDefined();
      expect(firstAssign.data.taskId).toBeDefined();
      expect(firstAssign.data.status).toBe("assigned");

      const initialAssignments = ownedMobilityService.listDispatchJobs();

      // Replay assignment with matching key
      const replayAssign = await controller.assignDispatch(
        assignCommand,
        assignKey,
        "req-assign-2",
      );

      expect(replayAssign.data.assignmentId).toBe(
        firstAssign.data.assignmentId,
      );
      expect(replayAssign.data.taskId).toBe(firstAssign.data.taskId);

      // Verify no duplicate jobs/tasks
      expect(ownedMobilityService.listDispatchJobs()).toHaveLength(
        initialAssignments.length,
      );
    });

    it("rejects repeated assign key with differing vehicle or driver with 409 IDEMPOTENCY_KEY_REUSED", async () => {
      const { controller, ownedMobilityService, regulatoryRegistryService } =
        createHarness();

      const order = await ownedMobilityService.createPassengerOrder(
        {
          pickup: {
            address: "台中市梧棲區中二路一段9號",
          },
          dropoff: {
            address: "台中市大安區興安路378號",
          },
          passenger: {
            name: "李先生",
            phone: "0911222333",
          },
        },
        passengerIdentity,
        "req-init",
        undefined,
        "init-key-3",
      );
      const dispatchJob = await ownedMobilityService.dispatchOrder(
        order.orderId,
        { mode: "auto" },
        "req-disp",
        "disp-key-3",
      );
      expect(dispatchJob.dispatchJobId).toBeDefined();

      const candidates = await ownedMobilityService.listDispatchCandidates(
        dispatchJob.dispatchJobId,
      );
      expect(candidates.length).toBeGreaterThan(0);
      const candidate = candidates[0]!;

      const assignCommand: AssignDispatchCommand = {
        dispatchJobId: dispatchJob.dispatchJobId,
        vehicleId: candidate.vehicleId,
        driverId: candidate.driverId,
      };

      const assignKey = `dispatch-assign-${order.orderId}-002`;

      await controller.assignDispatch(assignCommand, assignKey, "req-assign-1");

      const allVehicles = regulatoryRegistryService.listVehicles();
      const altVehicle =
        allVehicles.find((v) => v.vehicleId !== candidate.vehicleId) ??
        allVehicles[0]!;

      const differingAssignCommand: AssignDispatchCommand = {
        dispatchJobId: dispatchJob.dispatchJobId,
        vehicleId: altVehicle.vehicleId,
        driverId: candidate.driverId,
      };

      await expect(
        controller.assignDispatch(
          differingAssignCommand,
          assignKey,
          "req-assign-2",
        ),
      ).rejects.toMatchObject({
        status: 409,
        response: {
          error: {
            code: IDEMPOTENCY_KEY_REUSED,
          },
        },
      });
    });

    it("enforces idempotency on dispatchOrder and redispatchOrder commands", async () => {
      const { controller, ownedMobilityService } = createHarness();

      const order = await ownedMobilityService.createPassengerOrder(
        orderCommand,
        passengerIdentity,
        "req-init",
        undefined,
        "init-key-4",
      );

      const dispatchCmd: DispatchOrderCommand = { mode: "auto" };
      const dispatchKey = `dispatch-order-${order.orderId}-key`;

      // 1. Missing key rejected on dispatchOrder
      await expect(
        controller.dispatchOrder(
          order.orderId,
          dispatchCmd,
          undefined,
          "req-disp-1",
        ),
      ).rejects.toMatchObject({
        status: 400,
        response: {
          error: {
            code: IDEMPOTENCY_KEY_REQUIRED,
          },
        },
      });

      // 2. Successful dispatchOrder with key
      const dispatchRes = await controller.dispatchOrder(
        order.orderId,
        dispatchCmd,
        dispatchKey,
        "req-disp-2",
      );
      expect(dispatchRes.data.dispatchJobId).toBeDefined();

      // 3. Replay dispatchOrder
      const replayDispatchRes = await controller.dispatchOrder(
        order.orderId,
        dispatchCmd,
        dispatchKey,
        "req-disp-3",
      );
      expect(replayDispatchRes.data.dispatchJobId).toBe(
        dispatchRes.data.dispatchJobId,
      );

      // 4. Redispatch missing key rejected
      const redispatchCmd: RedispatchOrderCommand = {
        reasonCode: "driver_no_show",
        reasonNote: "Driver did not show up in time",
      };
      await expect(
        controller.redispatchOrder(
          order.orderId,
          redispatchCmd,
          undefined,
          "req-redisp-1",
        ),
      ).rejects.toMatchObject({
        status: 400,
        response: {
          error: {
            code: IDEMPOTENCY_KEY_REQUIRED,
          },
        },
      });

      // 5. Redispatch with key
      const redispatchKey = `redispatch-${order.orderId}-key-1`;
      const redispatchRes = await controller.redispatchOrder(
        order.orderId,
        redispatchCmd,
        redispatchKey,
        "req-redisp-2",
      );
      expect(redispatchRes.data.dispatchJobId).toBeDefined();

      // 6. Replay redispatch
      const replayRedispatch = await controller.redispatchOrder(
        order.orderId,
        redispatchCmd,
        redispatchKey,
        "req-redisp-3",
      );
      expect(replayRedispatch.data.dispatchJobId).toBe(
        redispatchRes.data.dispatchJobId,
      );
    });
  });

  describe("Database Constraint & Concurrency Safety", () => {
    it("handles concurrent insert collision via UNIQUE constraint and safely replays winner response", async () => {
      const { idempotencyRepository, idempotencyService, controller } =
        createHarness();

      const passengerIdentity: BootstrapRequestIdentity = {
        realm: "passenger",
        actorType: "passenger_user",
        actorId: "passenger-concurrent",
        userId: "user-concurrent",
        email: "concurrent@example.com",
        roles: ["passenger"],
        claims: {},
      };

      const orderCommand: CreateOwnedOrderCommand = {
        pickup: {
          address: "Taipei 101, Section 5, Xinyi Rd",
          lat: 25.0339,
          lng: 121.5645,
        },
        dropoff: {
          address: "Taipei Main Station, Zhongzheng Dist",
          lat: 25.0478,
          lng: 121.517,
        },
        passenger: {
          passengerId: "passenger-concurrent",
          name: "Concurrent Passenger",
          phone: "0912345678",
        },
      };

      const key = "concurrent-race-key-001";

      // Execute first thread (winner)
      const winnerResult = await controller.createOwnedOrder(
        orderCommand,
        passengerIdentity,
        key,
        "req-thread-1",
      );

      expect(winnerResult.data.orderId).toBeDefined();

      // Simulate a concurrent second worker losing the atomic DB insert race:
      // createProcessing returns inserted: false with the winner's completed record
      const origCreateProcessing = idempotencyRepository.createProcessing.bind(
        idempotencyRepository,
      );
      vi.spyOn(idempotencyRepository, "createProcessing").mockImplementation(
        async (input) => {
          const res = await origCreateProcessing(input);
          return {
            record: res.record,
            inserted: false, // Simulates DB ON CONFLICT DO NOTHING losing race
          };
        },
      );

      const loserResult = await controller.createOwnedOrder(
        orderCommand,
        passengerIdentity,
        key,
        "req-thread-2",
      );

      expect(loserResult.data.orderId).toBe(winnerResult.data.orderId);
    });
  });
});
