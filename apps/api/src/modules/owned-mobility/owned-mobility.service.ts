import { randomUUID } from "node:crypto";

import { HttpStatus, Injectable, OnModuleInit, Optional } from "@nestjs/common";

import type {
  AuditLogRecord,
  AssignDispatchCommand,
  BookingRecord,
  CancelOwnedOrderCommand,
  CreateCallCenterOrderCommand,
  CreateOwnedOrderCommand,
  CreateTenantBookingCommand,
  DispatchAssignmentRecord,
  DispatchAttemptRecord,
  DispatchCandidate,
  DispatchJobRecord,
  DispatchOrderCommand,
  DispatchTraceLogRecord,
  DriverAcceptTaskCommand,
  DriverArrivedPickupCommand,
  DriverCompleteTaskCommand,
  DriverDepartTaskCommand,
  DriverRejectTaskCommand,
  DriverStartTaskCommand,
  DriverTaskRecord,
  EtaSnapshot,
  OwnedOrderRecord,
  QueueCheckInCommand,
  QueueCheckOutCommand,
  QueueEntryRecord,
  RedispatchOrderCommand,
  UpdateTenantBookingCommand,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import { CallcenterService } from "../callcenter/callcenter.service";
import { OwnedMobilityRepository } from "./owned-mobility.repository";
import { RegulatoryRegistryService } from "../regulatory-registry/regulatory-registry.service";

type TenantBookingResult = {
  orderId: string;
  bookingId: string;
  serviceBucket: "business_dispatch";
  businessDispatchSubtype: NonNullable<
    OwnedOrderRecord["businessDispatchSubtype"]
  >;
  dispatchSemantics: "reservation";
  status: OwnedOrderRecord["status"];
};

type CallRecordingAttachmentEvent = {
  callId: string;
  recordingId: string;
  providerRecordingRef: string | null;
  recordingUrl: string | null;
  startedAt: string | null;
  endedAt: string | null;
  agentId: string | null;
  requestId?: string;
};

const BOOKING_RULES: Record<
  NonNullable<OwnedOrderRecord["businessDispatchSubtype"]>,
  {
    modifiableMinutes: number;
    cancelableMinutes: number;
    confirmationWindowMinutes: number;
  }
> = {
  enterprise_dispatch: {
    modifiableMinutes: 30,
    cancelableMinutes: 30,
    confirmationWindowMinutes: 30,
  },
  credit_card_airport_transfer: {
    modifiableMinutes: 60,
    cancelableMinutes: 60,
    confirmationWindowMinutes: 60,
  },
};

@Injectable()
export class OwnedMobilityService implements OnModuleInit {
  private orderSequence = 1;

  private bookingSequence = 1;

  private orders: OwnedOrderRecord[] = [];

  private dispatchJobs: DispatchJobRecord[] = [];

  private dispatchAttempts: DispatchAttemptRecord[] = [];

  private dispatchAssignments: DispatchAssignmentRecord[] = [];

  private driverTasks: DriverTaskRecord[] = [];

  private dispatchTraceLogs: DispatchTraceLogRecord[] = [];

  private queueEntries: QueueEntryRecord[] = [];

  constructor(
    private readonly regulatoryRegistryService: RegulatoryRegistryService,
    private readonly auditNotificationService: AuditNotificationService,
    private readonly callcenterService: CallcenterService,
    @Optional()
    private readonly ownedMobilityRepository?: OwnedMobilityRepository,
  ) {
    this.callcenterService.registerRecordingAttachmentListener((event) =>
      this.handleCallRecordingAttached(event),
    );
  }

  async onModuleInit() {
    if (!this.ownedMobilityRepository) {
      return;
    }

    try {
      const persistedState = await this.ownedMobilityRepository.loadState();
      this.orders = persistedState.orders.map((order) =>
        this.cloneOrder(order),
      );
      this.dispatchJobs = persistedState.dispatchJobs.map((job) => ({
        ...job,
      }));
      this.dispatchAttempts = persistedState.dispatchAttempts.map(
        (attempt) => ({
          ...attempt,
        }),
      );
      this.dispatchAssignments = persistedState.dispatchAssignments.map(
        (assignment) => ({ ...assignment }),
      );
      this.driverTasks = persistedState.driverTasks.map((task) =>
        this.cloneTask(task),
      );
      this.dispatchTraceLogs = persistedState.dispatchTraceLogs.map(
        (traceLog) => this.cloneTraceLog(traceLog),
      );
      this.queueEntries = this.rebuildQueueEntriesFromTraceLogs(
        this.dispatchTraceLogs,
      );
      this.orderSequence = this.deriveNextOrderSequence(persistedState.orders);
      this.bookingSequence = this.deriveNextBookingSequence(
        persistedState.orders,
      );
    } catch (error) {
      this.ownedMobilityRepository.reportPersistenceFailure(
        error,
        "module init",
      );
    }
  }

  createPassengerOrder(command: CreateOwnedOrderCommand, requestId?: string) {
    this.assertAddress(command.pickup.address, "pickup.address");
    this.assertAddress(command.dropoff.address, "dropoff.address");

    const now = new Date().toISOString();
    const etaSnapshot: EtaSnapshot = {
      etaMinutes: 8,
      calculatedAt: now,
    };
    const order: OwnedOrderRecord = {
      orderId: randomUUID(),
      orderNo: this.nextOrderNo(),
      orderSource: "app",
      orderDomain: "owned",
      tenantId: null,
      serviceBucket: "standard_taxi",
      dispatchSemantics: "realtime",
      businessDispatchSubtype: null,
      status: "ready_for_dispatch",
      pickup: {
        ...command.pickup,
      },
      dropoff: {
        ...command.dropoff,
      },
      passenger: {
        ...command.passenger,
      },
      bookingId: null,
      bookingType: null,
      etaSnapshot,
      callId: null,
      recordingId: null,
      reservationWindowStart: null,
      reservationWindowEnd: null,
      recurrenceRule: null,
      modifiableUntil: null,
      cancelableUntil: null,
      bookedBy: null,
      onsiteContact: null,
      costCenter: null,
      vehiclePreference: null,
      benefitReference: null,
      direction: null,
      flightNo: null,
      terminal: null,
      luggageCount: null,
      notes: null,
      fixedPrice: false,
      quotedFare: null,
      proofRequirements: {
        minPhotoCount: 0,
        signoffRequired: false,
        expenseProofRequired: false,
      },
      complianceFlags: [],
      cancelledAt: null,
      cancelReason: null,
      reservationHoldStatus: "none",
      reservationHoldId: null,
      reservationHoldExpiresAt: null,
      createdAt: now,
      updatedAt: now,
    };

    this.orders = [order, ...this.orders];
    const traceLog = this.appendTrace(
      order.orderId,
      "order.ready_for_dispatch",
      {
        serviceBucket: order.serviceBucket,
        dispatchSemantics: order.dispatchSemantics,
      },
    );
    this.persistChanges(
      {
        orders: [order],
        dispatchTraceLogs: [traceLog],
      },
      "create_passenger_order",
    );
    this.recordAudit(
      {
        actorId: null,
        actorType: "system",
        tenantId: null,
        moduleName: "order",
        actionName: "create_owned_standard_taxi_order",
        resourceType: "order",
        resourceId: order.orderId,
        newValuesSummary: {
          orderSource: order.orderSource,
          status: order.status,
        },
      },
      requestId,
    );

    return this.cloneOrder(order);
  }

  createCallCenterOrder(
    command: CreateCallCenterOrderCommand,
    requestId?: string,
  ) {
    this.assertAddress(command.pickup.address, "pickup.address");
    this.assertAddress(command.dropoff.address, "dropoff.address");
    if (!command.callId.trim()) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "CALL_ID_REQUIRED",
        "Call center orders require call_id.",
      );
    }
    const recordingId = command.recordingId?.trim() || null;

    const now = new Date().toISOString();
    const order: OwnedOrderRecord = {
      orderId: randomUUID(),
      orderNo: this.nextOrderNo(),
      orderSource: "phone",
      orderDomain: "owned",
      tenantId: null,
      serviceBucket: "standard_taxi",
      dispatchSemantics: "realtime",
      businessDispatchSubtype: null,
      status: "ready_for_dispatch",
      pickup: {
        ...command.pickup,
      },
      dropoff: {
        ...command.dropoff,
      },
      passenger: {
        ...command.passenger,
      },
      bookingId: null,
      bookingType: null,
      etaSnapshot: {
        etaMinutes: 10,
        calculatedAt: now,
      },
      callId: command.callId,
      recordingId,
      reservationWindowStart: null,
      reservationWindowEnd: null,
      recurrenceRule: null,
      modifiableUntil: null,
      cancelableUntil: null,
      bookedBy: null,
      onsiteContact: null,
      costCenter: null,
      vehiclePreference: null,
      benefitReference: null,
      direction: null,
      flightNo: null,
      terminal: null,
      luggageCount: null,
      notes: command.notes?.trim() || null,
      fixedPrice: false,
      quotedFare: null,
      proofRequirements: {
        minPhotoCount: 0,
        signoffRequired: false,
        expenseProofRequired: false,
      },
      complianceFlags: recordingId
        ? ["recording_bound"]
        : ["recording_pending"],
      cancelledAt: null,
      cancelReason: null,
      reservationHoldStatus: "none",
      reservationHoldId: null,
      reservationHoldExpiresAt: null,
      createdAt: now,
      updatedAt: now,
    };

    this.orders = [order, ...this.orders];
    const session = this.callcenterService.linkOrderToCallSession({
      callId: command.callId,
      callType: "booking",
      callerPhone: command.passenger.phone,
      agentId: command.agentId,
      linkedOrderId: order.orderId,
      recordingId,
    });

    if (session.recordingId) {
      order.recordingId = session.recordingId;
      order.status = "ready_for_dispatch";
      order.complianceFlags = ["recording_bound"];
      order.updatedAt = now;
    } else {
      order.status = "recording_pending";
      order.updatedAt = now;
    }

    const traceLog = this.appendTrace(
      order.orderId,
      "callcenter.order_created",
      {
        callId: command.callId,
        recordingId: order.recordingId,
        recordingPending: order.status === "recording_pending",
      },
    );
    this.persistChanges(
      {
        orders: [order],
        dispatchTraceLogs: [traceLog],
      },
      "create_call_center_order",
    );
    this.recordAudit(
      {
        actorId: command.agentId,
        actorType: "ops_user",
        tenantId: null,
        moduleName: "callcenter",
        actionName: "create_phone_order",
        resourceType: "order",
        resourceId: order.orderId,
        newValuesSummary: {
          callId: command.callId,
          recordingId: order.recordingId,
          status: order.status,
        },
      },
      requestId,
    );

    return this.cloneOrder(order);
  }

  createTenantBooking(
    command: CreateTenantBookingCommand,
    tenantId: string,
    requestId?: string,
  ): TenantBookingResult {
    this.assertNonBlank(tenantId, "tenantId");
    this.assertAddress(command.pickup.address, "pickup.address");
    this.assertAddress(command.dropoff.address, "dropoff.address");
    this.assertBookingRules(
      command.businessDispatchSubtype,
      command.direction,
      command.flightNo,
    );

    const now = new Date().toISOString();
    const orderId = randomUUID();
    const bookingId = `booking-${String(this.bookingSequence++).padStart(6, "0")}`;
    const bookingWindow = this.computeBookingWindows(
      command.businessDispatchSubtype,
      command.reservationWindowStart,
    );
    const reservationHoldId = randomUUID();
    const order: OwnedOrderRecord = {
      orderId,
      orderNo: this.nextOrderNo(),
      orderSource: "portal",
      orderDomain: "owned",
      tenantId,
      serviceBucket: "business_dispatch",
      dispatchSemantics: "reservation",
      businessDispatchSubtype: command.businessDispatchSubtype,
      status: "created",
      pickup: {
        ...command.pickup,
      },
      dropoff: {
        ...command.dropoff,
      },
      passenger: {
        ...command.passenger,
      },
      bookingId,
      bookingType: "oneway",
      etaSnapshot: null,
      callId: null,
      recordingId: null,
      reservationWindowStart: command.reservationWindowStart,
      reservationWindowEnd: command.reservationWindowEnd,
      recurrenceRule: null,
      modifiableUntil: bookingWindow.modifiableUntil,
      cancelableUntil: bookingWindow.cancelableUntil,
      bookedBy: command.bookedBy
        ? {
            ...command.bookedBy,
          }
        : null,
      onsiteContact: command.onsiteContact
        ? {
            ...command.onsiteContact,
          }
        : null,
      costCenter: this.normalizeNullableText(command.costCenter),
      vehiclePreference: this.normalizeNullableText(command.vehiclePreference),
      benefitReference: this.normalizeNullableText(command.benefitReference),
      direction: command.direction ?? null,
      flightNo: this.normalizeNullableText(command.flightNo),
      terminal: this.normalizeNullableText(command.terminal),
      luggageCount: command.luggageCount ?? null,
      notes: this.normalizeNullableText(command.notes),
      fixedPrice: true,
      quotedFare: command.quotedFare ?? {
        currency: "NTD",
        amountMinor: 150000,
      },
      proofRequirements: {
        minPhotoCount: command.minPhotoCount ?? 1,
        signoffRequired: command.signoffRequired ?? false,
        expenseProofRequired: command.expenseProofRequired ?? false,
      },
      complianceFlags: [],
      cancelledAt: null,
      cancelReason: null,
      reservationHoldStatus: "requested",
      reservationHoldId,
      reservationHoldExpiresAt: command.reservationWindowStart,
      createdAt: now,
      updatedAt: now,
    };

    this.orders = [order, ...this.orders];
    const bookingTraceLog = this.appendTrace(
      order.orderId,
      "tenant.booking_created",
      {
        bookingId,
        businessDispatchSubtype: order.businessDispatchSubtype,
        dispatchSemantics: order.dispatchSemantics,
      },
    );
    const holdTraceLog = this.appendTrace(
      order.orderId,
      "reservation.hold.created",
      {
        bookingId,
        reservationHoldId,
        holdState: order.reservationHoldStatus,
        confirmationWindowMinutes: bookingWindow.confirmationWindowMinutes,
      },
    );
    this.persistChanges(
      {
        orders: [order],
        dispatchTraceLogs: [bookingTraceLog, holdTraceLog],
      },
      "create_tenant_booking",
    );
    this.recordAudit(
      {
        actorId: null,
        actorType: "tenant_admin",
        tenantId: order.tenantId,
        moduleName: "order",
        actionName: "create_tenant_booking",
        resourceType: "booking",
        resourceId: bookingId,
        newValuesSummary: {
          orderId,
          subtype: order.businessDispatchSubtype,
          status: order.status,
        },
      },
      requestId,
    );

    return {
      orderId,
      bookingId,
      serviceBucket: "business_dispatch",
      businessDispatchSubtype: order.businessDispatchSubtype!,
      dispatchSemantics: "reservation",
      status: order.status,
    };
  }

  handleCallRecordingAttached(event: CallRecordingAttachmentEvent) {
    const order = this.orders.find((candidateOrder) => {
      return candidateOrder.callId === event.callId;
    });
    if (!order) {
      return;
    }

    const now = new Date().toISOString();
    order.recordingId = event.recordingId;
    order.updatedAt = now;
    if (order.status === "recording_pending") {
      order.status = "ready_for_dispatch";
    }
    if (!order.complianceFlags.includes("recording_bound")) {
      order.complianceFlags = [
        ...order.complianceFlags.filter((flag) => flag !== "recording_pending"),
        "recording_bound",
      ];
    }

    const traceLog = this.appendTrace(
      order.orderId,
      "callcenter.recording_bound",
      {
        callId: event.callId,
        recordingId: event.recordingId,
        providerRecordingRef: event.providerRecordingRef,
        recordingUrl: event.recordingUrl,
        startedAt: event.startedAt,
        endedAt: event.endedAt,
      },
    );
    this.persistChanges(
      {
        orders: [order],
        dispatchTraceLogs: [traceLog],
      },
      "bind_call_recording",
    );
    this.recordAudit(
      {
        actorId: event.agentId,
        actorType: "ops_user",
        tenantId: null,
        moduleName: "callcenter",
        actionName: "bind_recording_to_phone_order",
        resourceType: "order",
        resourceId: order.orderId,
        newValuesSummary: {
          callId: event.callId,
          recordingId: event.recordingId,
          status: order.status,
        },
      },
      event.requestId,
    );
  }

  listOrders() {
    return this.orders.map((order) => this.cloneOrder(order));
  }

  getOrder(orderId: string) {
    return this.cloneOrder(this.requireOrder(orderId));
  }

  listTenantBookings(tenantId: string) {
    this.assertNonBlank(tenantId, "tenantId");
    const items = this.orders
      .filter((order) => order.bookingId && order.tenantId === tenantId)
      .map((order) => this.mapOrderToBooking(order));

    return {
      items,
      pagination: {
        page: 1,
        pageSize: items.length,
        totalItems: items.length,
        totalPages: items.length > 0 ? 1 : 0,
      },
    };
  }

  getTenantBooking(tenantId: string, bookingId: string) {
    this.assertNonBlank(tenantId, "tenantId");
    return this.mapOrderToBooking(
      this.requireBookingOrder(bookingId, tenantId),
    );
  }

  updateTenantBooking(
    tenantId: string,
    bookingId: string,
    command: UpdateTenantBookingCommand,
    requestId?: string,
  ) {
    this.assertNonBlank(tenantId, "tenantId");
    const order = this.requireBookingOrder(bookingId, tenantId);
    this.assertBookingModifiable(order);

    const businessDispatchSubtype =
      command.businessDispatchSubtype ?? order.businessDispatchSubtype;
    if (!businessDispatchSubtype) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "BOOKING_NOT_FOUND",
        "Booking was not found.",
        {
          bookingId,
        },
      );
    }

    const nextDirection = command.direction ?? order.direction ?? undefined;
    const nextFlightNo = command.flightNo ?? order.flightNo ?? undefined;
    this.assertBookingRules(
      businessDispatchSubtype,
      nextDirection,
      nextFlightNo,
    );

    if (command.pickup) {
      this.assertAddress(command.pickup.address, "pickup.address");
      order.pickup = {
        ...command.pickup,
      };
    }
    if (command.dropoff) {
      this.assertAddress(command.dropoff.address, "dropoff.address");
      order.dropoff = {
        ...command.dropoff,
      };
    }
    if (command.passenger) {
      order.passenger = {
        ...command.passenger,
      };
    }

    order.businessDispatchSubtype = businessDispatchSubtype;
    order.reservationWindowStart =
      command.reservationWindowStart ?? order.reservationWindowStart;
    order.reservationWindowEnd =
      command.reservationWindowEnd ?? order.reservationWindowEnd;
    order.bookedBy =
      command.bookedBy === undefined
        ? order.bookedBy
        : command.bookedBy
          ? { ...command.bookedBy }
          : null;
    order.onsiteContact =
      command.onsiteContact === undefined
        ? order.onsiteContact
        : command.onsiteContact
          ? { ...command.onsiteContact }
          : null;
    order.costCenter =
      command.costCenter === undefined
        ? order.costCenter
        : this.normalizeNullableText(command.costCenter);
    order.vehiclePreference =
      command.vehiclePreference === undefined
        ? order.vehiclePreference
        : this.normalizeNullableText(command.vehiclePreference);
    order.benefitReference =
      command.benefitReference === undefined
        ? order.benefitReference
        : this.normalizeNullableText(command.benefitReference);
    order.direction = command.direction ?? order.direction;
    order.flightNo =
      command.flightNo === undefined
        ? order.flightNo
        : this.normalizeNullableText(command.flightNo);
    order.terminal =
      command.terminal === undefined
        ? order.terminal
        : this.normalizeNullableText(command.terminal);
    order.luggageCount =
      command.luggageCount === undefined
        ? order.luggageCount
        : command.luggageCount;
    order.notes =
      command.notes === undefined
        ? order.notes
        : this.normalizeNullableText(command.notes);
    order.quotedFare =
      command.quotedFare === undefined ? order.quotedFare : command.quotedFare;
    order.proofRequirements = {
      minPhotoCount:
        command.minPhotoCount ?? order.proofRequirements.minPhotoCount,
      signoffRequired:
        command.signoffRequired ?? order.proofRequirements.signoffRequired,
      expenseProofRequired:
        command.expenseProofRequired ??
        order.proofRequirements.expenseProofRequired,
    };

    if (order.reservationWindowStart) {
      const bookingWindow = this.computeBookingWindows(
        businessDispatchSubtype,
        order.reservationWindowStart,
      );
      order.modifiableUntil = bookingWindow.modifiableUntil;
      order.cancelableUntil = bookingWindow.cancelableUntil;
    }

    order.updatedAt = new Date().toISOString();
    const traceLog = this.appendTrace(order.orderId, "booking.updated", {
      bookingId,
      businessDispatchSubtype,
      reservationWindowStart: order.reservationWindowStart,
      reservationWindowEnd: order.reservationWindowEnd,
    });
    this.persistChanges(
      {
        orders: [order],
        dispatchTraceLogs: [traceLog],
      },
      "update_tenant_booking",
    );
    this.recordAudit(
      {
        actorId: null,
        actorType: "tenant_admin",
        tenantId: order.tenantId,
        moduleName: "order",
        actionName: "update_booking",
        resourceType: "booking",
        resourceId: bookingId,
        newValuesSummary: {
          orderId: order.orderId,
          status: order.status,
          businessDispatchSubtype,
        },
      },
      requestId,
    );

    return this.mapOrderToBooking(order);
  }

  cancelTenantBooking(
    tenantId: string,
    bookingId: string,
    command: CancelOwnedOrderCommand,
    requestId?: string,
  ) {
    this.assertNonBlank(tenantId, "tenantId");
    const order = this.requireBookingOrder(bookingId, tenantId);
    this.cancelOwnedOrder(order.orderId, command, requestId);
    return this.mapOrderToBooking(order);
  }

  dispatchOrder(
    orderId: string,
    command: DispatchOrderCommand,
    requestId?: string,
  ) {
    const order = this.requireOrder(orderId);
    if (
      !["ready_for_dispatch", "created", "redispatch_required"].includes(
        order.status,
      )
    ) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "ORDER_NOT_READY_FOR_DISPATCH",
        "Order is not in a dispatchable state.",
        {
          orderId,
          status: order.status,
        },
      );
    }

    const candidates = this.regulatoryRegistryService.getEligibleCandidates(
      order.serviceBucket,
    );
    const now = new Date().toISOString();
    const isReservation = order.dispatchSemantics === "reservation";
    const shouldEscalateToExceptionHold =
      isReservation && this.isWithinConfirmationWindow(order, now);
    const dispatchJob: DispatchJobRecord = {
      dispatchJobId: randomUUID(),
      orderId,
      status:
        candidates.length > 0
          ? isReservation
            ? "reserved"
            : "matching"
          : shouldEscalateToExceptionHold
            ? "failed"
            : isReservation
              ? "queued"
              : "failed",
      mode: command.mode,
      latestEtaMinutes: candidates[0]?.etaMinutes ?? null,
      createdAt: now,
      updatedAt: now,
    };
    const dispatchAttempt: DispatchAttemptRecord = {
      attemptId: randomUUID(),
      dispatchJobId: dispatchJob.dispatchJobId,
      orderId,
      sequence: this.nextAttemptSequence(dispatchJob.dispatchJobId),
      outcome: candidates.length > 0 ? "candidate_found" : "failed",
      reasonCode: candidates.length > 0 ? null : "no_eligible_supply",
      createdAt: now,
    };
    this.dispatchJobs = [dispatchJob, ...this.dispatchJobs];
    this.dispatchAttempts = [dispatchAttempt, ...this.dispatchAttempts];

    const traceLogs: DispatchTraceLogRecord[] = [];
    let shouldPersistOrder = false;

    if (candidates.length === 0) {
      shouldPersistOrder = true;
      order.updatedAt = now;
      if (isReservation && !shouldEscalateToExceptionHold) {
        order.status = "redispatch_required";
        order.reservationHoldStatus = "redispatch_queue";
        traceLogs.push(
          this.appendTrace(orderId, "dispatch.failed", {
            dispatchJobId: dispatchJob.dispatchJobId,
            reasonCode: "no_eligible_supply",
          }),
        );
        traceLogs.push(
          this.appendTrace(orderId, "queue.entry.created", {
            dispatchJobId: dispatchJob.dispatchJobId,
            queueType: "redispatch",
            reasonCode: "no_eligible_supply",
          }),
        );
      } else if (isReservation) {
        order.status = "exception_hold";
        order.reservationHoldStatus = "exception_hold";
        traceLogs.push(
          this.appendTrace(orderId, "dispatch.failed", {
            dispatchJobId: dispatchJob.dispatchJobId,
            reasonCode: "no_eligible_supply",
          }),
        );
        traceLogs.push(
          this.appendTrace(orderId, "order.exception_hold", {
            dispatchJobId: dispatchJob.dispatchJobId,
            reasonCode: "no_eligible_supply",
          }),
        );
      } else {
        order.status = "dispatch_failed";
        traceLogs.push(
          this.appendTrace(orderId, "dispatch.failed", {
            dispatchJobId: dispatchJob.dispatchJobId,
            reasonCode: "no_eligible_supply",
          }),
        );
      }

      if (isReservation) {
        this.recordReservationEscalationNotifications(
          order,
          dispatchJob.dispatchJobId,
        );
      }
    } else if (isReservation) {
      shouldPersistOrder = true;
      order.status = "preassigned";
      order.updatedAt = now;
      traceLogs.push(
        this.appendTrace(orderId, "reservation.hold.created", {
          dispatchJobId: dispatchJob.dispatchJobId,
          reservationHoldId: order.reservationHoldId,
          candidateCount: candidates.length,
          latestEtaMinutes: dispatchJob.latestEtaMinutes,
        }),
      );
    } else {
      traceLogs.push(
        this.appendTrace(orderId, "dispatch.matching", {
          dispatchJobId: dispatchJob.dispatchJobId,
          candidateCount: candidates.length,
        }),
      );
    }

    this.recordAudit(
      {
        actorId: null,
        actorType: "system",
        tenantId: null,
        moduleName: "dispatch",
        actionName: "dispatch_order",
        resourceType: "dispatch_job",
        resourceId: dispatchJob.dispatchJobId,
        newValuesSummary: {
          orderId,
          status: dispatchJob.status,
          candidateCount: candidates.length,
        },
      },
      requestId,
    );
    this.persistChanges(
      {
        ...(shouldPersistOrder ? { orders: [order] } : {}),
        dispatchJobs: [dispatchJob],
        dispatchAttempts: [dispatchAttempt],
        dispatchTraceLogs: traceLogs,
      },
      "dispatch_order",
    );

    return {
      dispatchJobId: dispatchJob.dispatchJobId,
      status: dispatchJob.status,
    };
  }

  redispatchOrder(
    orderId: string,
    command: RedispatchOrderCommand,
    requestId?: string,
  ) {
    const order = this.requireOrder(orderId);
    order.status = "redispatch_required";
    order.updatedAt = new Date().toISOString();

    const latestAssignment = this.dispatchAssignments.find(
      (assignment) =>
        assignment.orderId === orderId &&
        ["assigned", "accepted"].includes(assignment.status),
    );
    if (latestAssignment) {
      latestAssignment.status = "cancelled";
      latestAssignment.updatedAt = new Date().toISOString();
    }

    const traceLog = this.appendTrace(orderId, "dispatch.redispatch_required", {
      reasonCode: command.reasonCode,
    });
    this.persistChanges(
      {
        orders: [order],
        ...(latestAssignment
          ? { dispatchAssignments: [latestAssignment] }
          : {}),
        dispatchTraceLogs: [traceLog],
      },
      "redispatch_order",
    );
    this.recordAudit(
      {
        actorId: null,
        actorType: "system",
        tenantId: null,
        moduleName: "dispatch",
        actionName: "redispatch_order",
        resourceType: "order",
        resourceId: orderId,
        newValuesSummary: {
          reasonCode: command.reasonCode,
          status: order.status,
        },
      },
      requestId,
    );

    return this.dispatchOrder(orderId, { mode: "auto" }, requestId);
  }

  listDispatchJobs() {
    return this.dispatchJobs.map((job) => ({ ...job }));
  }

  listDispatchTrace(orderId: string) {
    this.requireOrder(orderId);
    return this.dispatchTraceLogs
      .filter((traceLog) => traceLog.orderId === orderId)
      .map((traceLog) => this.cloneTraceLog(traceLog));
  }

  listDispatchCandidates(dispatchJobId: string): DispatchCandidate[] {
    const dispatchJob = this.requireDispatchJob(dispatchJobId);
    const order = this.requireOrder(dispatchJob.orderId);
    return this.regulatoryRegistryService
      .getEligibleCandidates(order.serviceBucket)
      .map((candidate) => ({ ...candidate }));
  }

  assignDispatch(command: AssignDispatchCommand, requestId?: string) {
    const dispatchJob = this.requireDispatchJob(command.dispatchJobId);
    const order = this.requireOrder(dispatchJob.orderId);

    if (
      !this.regulatoryRegistryService.getVehicleDispatchability(
        command.vehicleId,
        order.serviceBucket,
      )
    ) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VEHICLE_NOT_DISPATCHABLE",
        "Vehicle is not eligible for dispatch.",
        {
          vehicleId: command.vehicleId,
        },
      );
    }

    if (
      !this.regulatoryRegistryService.getDriverAvailability(
        command.driverId,
        order.serviceBucket,
      )
    ) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "DRIVER_NOT_AVAILABLE",
        "Driver is not eligible for dispatch.",
        {
          driverId: command.driverId,
        },
      );
    }

    const now = new Date().toISOString();
    const taskId = randomUUID();
    const assignment: DispatchAssignmentRecord = {
      assignmentId: randomUUID(),
      dispatchJobId: dispatchJob.dispatchJobId,
      orderId: order.orderId,
      taskId,
      vehicleId: command.vehicleId,
      driverId: command.driverId,
      assignmentType: order.fixedPrice ? "fixed_price" : "metered",
      status: "assigned",
      acceptedAt: null,
      rejectedAt: null,
      rejectReasonCode: null,
      createdAt: now,
      updatedAt: now,
    };
    const task: DriverTaskRecord = {
      taskId,
      orderId: order.orderId,
      dispatchJobId: dispatchJob.dispatchJobId,
      assignmentId: assignment.assignmentId,
      driverId: command.driverId,
      vehicleId: command.vehicleId,
      sourcePlatform: null,
      routeProvided: false,
      waypoints: [],
      status: "pending_acceptance",
      acceptedAt: null,
      departedAt: null,
      arrivedPickupAt: null,
      startedAt: null,
      completedAt: null,
      actualDistanceKm: null,
      actualDurationSec: null,
      fare: null,
      proof: null,
    };
    const dispatchAttempt: DispatchAttemptRecord = {
      attemptId: randomUUID(),
      dispatchJobId: dispatchJob.dispatchJobId,
      orderId: order.orderId,
      sequence: this.nextAttemptSequence(dispatchJob.dispatchJobId),
      outcome: "assigned",
      reasonCode: null,
      createdAt: now,
    };

    this.dispatchAssignments = [assignment, ...this.dispatchAssignments];
    this.driverTasks = [task, ...this.driverTasks];
    this.dispatchAttempts = [dispatchAttempt, ...this.dispatchAttempts];
    dispatchJob.status = "assigned";
    dispatchJob.updatedAt = now;
    order.status = "assigned";
    order.updatedAt = now;
    const traceLogs: DispatchTraceLogRecord[] = [];
    if (order.dispatchSemantics === "reservation") {
      order.reservationHoldStatus = "released";
      order.reservationHoldExpiresAt = now;
      traceLogs.push(
        this.appendTrace(order.orderId, "reservation.hold.released", {
          dispatchJobId: dispatchJob.dispatchJobId,
          reservationHoldId: order.reservationHoldId,
          reason: "assignment_confirmed",
        }),
      );
    }

    traceLogs.push(
      this.appendTrace(order.orderId, "dispatch.assigned", {
        dispatchJobId: dispatchJob.dispatchJobId,
        assignmentId: assignment.assignmentId,
        taskId,
        vehicleId: command.vehicleId,
        driverId: command.driverId,
      }),
    );
    this.auditNotificationService.recordNotification({
      tenantId: order.tenantId,
      channel: "driver_task",
      title: "Driver task assigned",
      message: `Driver ${command.driverId} received task ${taskId} for order ${order.orderNo}.`,
      status: "unread",
    });
    this.recordAudit(
      {
        actorId: null,
        actorType: "system",
        tenantId: null,
        moduleName: "dispatch",
        actionName: "assign_dispatch",
        resourceType: "dispatch_assignment",
        resourceId: assignment.assignmentId,
        newValuesSummary: {
          dispatchJobId: dispatchJob.dispatchJobId,
          vehicleId: command.vehicleId,
          driverId: command.driverId,
        },
      },
      requestId,
    );
    this.persistChanges(
      {
        orders: [order],
        dispatchJobs: [dispatchJob],
        dispatchAssignments: [assignment],
        driverTasks: [task],
        dispatchAttempts: [dispatchAttempt],
        dispatchTraceLogs: traceLogs,
      },
      "assign_dispatch",
    );

    return {
      assignmentId: assignment.assignmentId,
      status: assignment.status,
      taskId,
    };
  }

  cancelOwnedOrder(
    orderId: string,
    command: CancelOwnedOrderCommand,
    requestId?: string,
  ) {
    const order = this.requireOrder(orderId);
    this.assertOrderCancelable(order);

    const now = new Date().toISOString();
    order.status = "cancelled";
    order.cancelledAt = now;
    order.cancelReason = this.normalizeNullableText(command.reason);
    order.updatedAt = now;

    const dispatchJob = this.findLatestOpenDispatchJob(orderId);
    const assignment = this.findLatestActiveAssignment(orderId);
    const task = assignment
      ? this.findTaskByAssignmentId(assignment.assignmentId)
      : null;

    if (dispatchJob) {
      dispatchJob.status = "closed";
      dispatchJob.updatedAt = now;
    }
    if (assignment) {
      assignment.status = "cancelled";
      assignment.updatedAt = now;
    }
    if (task) {
      task.status = "cancelled";
    }

    const traceLogs: DispatchTraceLogRecord[] = [];
    if (
      order.dispatchSemantics === "reservation" &&
      order.reservationHoldStatus === "requested"
    ) {
      order.reservationHoldStatus = "released";
      order.reservationHoldExpiresAt = now;
      traceLogs.push(
        this.appendTrace(order.orderId, "reservation.hold.released", {
          reservationHoldId: order.reservationHoldId,
          reason: "order_cancelled",
        }),
      );
    }
    traceLogs.push(
      this.appendTrace(order.orderId, "order.cancelled", {
        reason: order.cancelReason,
      }),
    );

    this.persistChanges(
      {
        orders: [order],
        ...(dispatchJob ? { dispatchJobs: [dispatchJob] } : {}),
        ...(assignment ? { dispatchAssignments: [assignment] } : {}),
        ...(task ? { driverTasks: [task] } : {}),
        dispatchTraceLogs: traceLogs,
      },
      "cancel_owned_order",
    );
    this.recordAudit(
      {
        actorId: null,
        actorType: "tenant_admin",
        tenantId: order.tenantId,
        moduleName: "order",
        actionName: "cancel_owned_order",
        resourceType: "order",
        resourceId: orderId,
        newValuesSummary: {
          status: order.status,
          reason: order.cancelReason,
        },
      },
      requestId,
    );

    return this.cloneOrder(order);
  }

  queueCheckIn(command: QueueCheckInCommand, requestId?: string) {
    this.assertNonBlank(command.vehicleId, "vehicleId");
    this.assertNonBlank(command.siteId, "siteId");

    if (
      !this.regulatoryRegistryService.getVehicleDispatchability(
        command.vehicleId,
        "standard_taxi",
      )
    ) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VEHICLE_NOT_DISPATCHABLE",
        "Vehicle is not eligible for queue check-in.",
        {
          vehicleId: command.vehicleId,
        },
      );
    }

    const existingEntry = this.queueEntries.find(
      (entry) =>
        entry.vehicleId === command.vehicleId &&
        entry.siteId === command.siteId &&
        entry.status === "checked_in",
    );
    if (existingEntry) {
      return { ...existingEntry };
    }

    const checkedInAt = new Date().toISOString();
    const queueEntry: QueueEntryRecord = {
      queueEntryId: randomUUID(),
      vehicleId: command.vehicleId,
      siteId: command.siteId,
      status: "checked_in",
      position: this.nextQueuePosition(command.siteId),
      checkedInAt,
      checkedOutAt: null,
    };
    this.queueEntries = [queueEntry, ...this.queueEntries];

    const traceLog = this.appendTrace(
      this.queueTraceOrderId(command.siteId, command.vehicleId),
      "queue.entry.created",
      {
        queueEntryId: queueEntry.queueEntryId,
        siteId: command.siteId,
        vehicleId: command.vehicleId,
        position: queueEntry.position,
      },
    );
    this.persistChanges(
      {
        dispatchTraceLogs: [traceLog],
      },
      "queue_check_in",
    );
    this.recordAudit(
      {
        actorId: null,
        actorType: "ops_user",
        tenantId: null,
        moduleName: "dispatch",
        actionName: "queue_check_in",
        resourceType: "queue_entry",
        resourceId: queueEntry.queueEntryId,
        newValuesSummary: {
          siteId: command.siteId,
          vehicleId: command.vehicleId,
          position: queueEntry.position,
        },
      },
      requestId,
    );

    return { ...queueEntry };
  }

  queueCheckOut(command: QueueCheckOutCommand, requestId?: string) {
    this.assertNonBlank(command.vehicleId, "vehicleId");
    this.assertNonBlank(command.siteId, "siteId");

    const queueEntry = this.queueEntries.find(
      (entry) =>
        entry.vehicleId === command.vehicleId &&
        entry.siteId === command.siteId &&
        entry.status === "checked_in",
    );
    if (!queueEntry) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "QUEUE_ENTRY_NOT_FOUND",
        "Queue entry was not found.",
        {
          vehicleId: command.vehicleId,
          siteId: command.siteId,
        },
      );
    }

    const checkedOutAt = new Date().toISOString();
    queueEntry.status = "checked_out";
    queueEntry.checkedOutAt = checkedOutAt;

    const traceLog = this.appendTrace(
      this.queueTraceOrderId(command.siteId, command.vehicleId),
      "queue.entry.closed",
      {
        queueEntryId: queueEntry.queueEntryId,
        siteId: command.siteId,
        vehicleId: command.vehicleId,
      },
    );
    this.persistChanges(
      {
        dispatchTraceLogs: [traceLog],
      },
      "queue_check_out",
    );
    this.recordAudit(
      {
        actorId: null,
        actorType: "ops_user",
        tenantId: null,
        moduleName: "dispatch",
        actionName: "queue_check_out",
        resourceType: "queue_entry",
        resourceId: queueEntry.queueEntryId,
        newValuesSummary: {
          siteId: command.siteId,
          vehicleId: command.vehicleId,
          status: queueEntry.status,
        },
      },
      requestId,
    );

    return { ...queueEntry };
  }

  listDriverTasks() {
    return this.driverTasks.map((task) => this.cloneTask(task));
  }

  getDriverTask(taskId: string) {
    return this.cloneTask(this.requireTask(taskId));
  }

  acceptDriverTask(
    taskId: string,
    command: DriverAcceptTaskCommand,
    requestId?: string,
  ) {
    const task = this.requireTask(taskId);
    const assignment = this.requireAssignment(task.assignmentId);
    const order = this.requireOrder(task.orderId);
    task.status = "accepted";
    task.acceptedAt = command.acceptedAt;
    assignment.status = "accepted";
    assignment.acceptedAt = command.acceptedAt;
    assignment.updatedAt = new Date().toISOString();
    order.status = "driver_accepted";
    order.updatedAt = assignment.updatedAt;
    const traceLog = this.appendTrace(order.orderId, "driver.accepted", {
      taskId,
      assignmentId: assignment.assignmentId,
    });
    this.persistChanges(
      {
        orders: [order],
        dispatchAssignments: [assignment],
        driverTasks: [task],
        dispatchTraceLogs: [traceLog],
      },
      "accept_driver_task",
    );
    this.recordAudit(
      {
        actorId: task.driverId,
        actorType: "ops_user",
        tenantId: null,
        moduleName: "driver-task",
        actionName: "accept_task",
        resourceType: "driver_task",
        resourceId: taskId,
        newValuesSummary: {
          status: task.status,
        },
      },
      requestId,
    );
    return this.cloneTask(task);
  }

  rejectDriverTask(
    taskId: string,
    command: DriverRejectTaskCommand,
    requestId?: string,
  ) {
    if (!command.reasonCode.trim()) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "REJECT_REASON_REQUIRED",
        "Reject reason is required.",
      );
    }
    const task = this.requireTask(taskId);
    const assignment = this.requireAssignment(task.assignmentId);
    const order = this.requireOrder(task.orderId);
    const now = new Date().toISOString();
    task.status = "rejected";
    assignment.status = "rejected";
    assignment.rejectReasonCode = command.reasonCode;
    assignment.rejectedAt = now;
    assignment.updatedAt = now;
    order.status = "redispatch_required";
    order.updatedAt = now;
    const dispatchAttempt: DispatchAttemptRecord = {
      attemptId: randomUUID(),
      dispatchJobId: task.dispatchJobId,
      orderId: order.orderId,
      sequence: this.nextAttemptSequence(task.dispatchJobId),
      outcome: "rejected",
      reasonCode: command.reasonCode,
      createdAt: now,
    };
    this.dispatchAttempts = [dispatchAttempt, ...this.dispatchAttempts];
    const traceLog = this.appendTrace(order.orderId, "driver.rejected", {
      taskId,
      reasonCode: command.reasonCode,
      reasonNote: command.reasonNote ?? null,
    });
    this.persistChanges(
      {
        orders: [order],
        dispatchAssignments: [assignment],
        driverTasks: [task],
        dispatchAttempts: [dispatchAttempt],
        dispatchTraceLogs: [traceLog],
      },
      "reject_driver_task",
    );
    this.recordAudit(
      {
        actorId: task.driverId,
        actorType: "ops_user",
        tenantId: null,
        moduleName: "driver-task",
        actionName: "reject_task",
        resourceType: "driver_task",
        resourceId: taskId,
        newValuesSummary: {
          reasonCode: command.reasonCode,
          status: task.status,
        },
      },
      requestId,
    );
    return this.cloneTask(task);
  }

  departDriverTask(
    taskId: string,
    command: DriverDepartTaskCommand,
    requestId?: string,
  ) {
    const task = this.requireTask(taskId);
    const order = this.requireOrder(task.orderId);
    task.status = "enroute_pickup";
    task.departedAt = command.departedAt;
    order.status = "enroute_pickup";
    order.updatedAt = new Date().toISOString();
    const traceLog = this.appendTrace(order.orderId, "driver.departed_pickup", {
      taskId,
      currentLocation: command.currentLocation ?? null,
    });
    this.persistChanges(
      {
        orders: [order],
        driverTasks: [task],
        dispatchTraceLogs: [traceLog],
      },
      "depart_driver_task",
    );
    this.recordAudit(
      {
        actorId: task.driverId,
        actorType: "ops_user",
        tenantId: null,
        moduleName: "driver-task",
        actionName: "depart_task",
        resourceType: "driver_task",
        resourceId: taskId,
        newValuesSummary: {
          status: task.status,
        },
      },
      requestId,
    );
    return this.cloneTask(task);
  }

  arrivedPickup(
    taskId: string,
    command: DriverArrivedPickupCommand,
    requestId?: string,
  ) {
    const task = this.requireTask(taskId);
    const order = this.requireOrder(task.orderId);
    task.status = "arrived_pickup";
    task.arrivedPickupAt = command.arrivedAt;
    order.status = "arrived_pickup";
    order.updatedAt = new Date().toISOString();
    const traceLog = this.appendTrace(order.orderId, "driver.arrived_pickup", {
      taskId,
    });
    this.persistChanges(
      {
        orders: [order],
        driverTasks: [task],
        dispatchTraceLogs: [traceLog],
      },
      "arrived_pickup",
    );
    this.recordAudit(
      {
        actorId: task.driverId,
        actorType: "ops_user",
        tenantId: null,
        moduleName: "driver-task",
        actionName: "arrive_pickup",
        resourceType: "driver_task",
        resourceId: taskId,
        newValuesSummary: {
          status: task.status,
        },
      },
      requestId,
    );
    return this.cloneTask(task);
  }

  startDriverTask(
    taskId: string,
    command: DriverStartTaskCommand,
    requestId?: string,
  ) {
    const task = this.requireTask(taskId);
    if (task.status !== "arrived_pickup") {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "PICKUP_NOT_ARRIVED",
        "Cannot start trip before arriving at pickup.",
      );
    }
    const order = this.requireOrder(task.orderId);
    task.status = "on_trip";
    task.startedAt = command.startedAt;
    order.status = "on_trip";
    order.updatedAt = new Date().toISOString();
    const traceLog = this.appendTrace(order.orderId, "driver.started_trip", {
      taskId,
    });
    this.persistChanges(
      {
        orders: [order],
        driverTasks: [task],
        dispatchTraceLogs: [traceLog],
      },
      "start_driver_task",
    );
    this.recordAudit(
      {
        actorId: task.driverId,
        actorType: "ops_user",
        tenantId: null,
        moduleName: "driver-task",
        actionName: "start_trip",
        resourceType: "driver_task",
        resourceId: taskId,
        newValuesSummary: {
          status: task.status,
        },
      },
      requestId,
    );
    return this.cloneTask(task);
  }

  completeDriverTask(
    taskId: string,
    command: DriverCompleteTaskCommand,
    requestId?: string,
  ) {
    const task = this.requireTask(taskId);
    const assignment = this.requireAssignment(task.assignmentId);
    const order = this.requireOrder(task.orderId);
    const proof = {
      photoIds: [...(command.proof?.photoIds ?? [])],
      signatureId: command.proof?.signatureId ?? null,
      expenseItems: [...(command.proof?.expenseItems ?? [])],
    };

    if (
      order.fixedPrice &&
      command.fare &&
      order.quotedFare &&
      command.fare.amountMinor !== order.quotedFare.amountMinor
    ) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "FIXED_PRICE_IMMUTABLE",
        "Fare cannot be changed for a fixed-price job.",
        {
          assignmentType: assignment.assignmentType,
        },
      );
    }

    if (proof.photoIds.length < order.proofRequirements.minPhotoCount) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "MIN_PHOTO_COUNT_NOT_MET",
        "Completion proof does not satisfy minimum photo count.",
        {
          minPhotoCount: order.proofRequirements.minPhotoCount,
        },
      );
    }

    if (order.proofRequirements.signoffRequired && !proof.signatureId) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "PROOF_REQUIRED",
        "Signoff proof is required before completion.",
        {
          requirement: "signature",
        },
      );
    }

    if (
      order.proofRequirements.expenseProofRequired &&
      proof.expenseItems.length === 0
    ) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "PROOF_REQUIRED",
        "Expense proof is required before completion.",
        {
          requirement: "expense_items",
        },
      );
    }

    const now = new Date().toISOString();
    task.status = "completed";
    task.completedAt = command.completedAt;
    task.actualDistanceKm = command.actualDistanceKm;
    task.actualDurationSec = command.actualDurationSec;
    task.fare = order.fixedPrice ? order.quotedFare : (command.fare ?? null);
    task.proof = proof;
    assignment.status = "completed";
    assignment.updatedAt = now;
    order.status = "completed";
    order.updatedAt = now;

    const traceLog = this.appendTrace(order.orderId, "driver.completed_trip", {
      taskId,
      assignmentId: assignment.assignmentId,
      completedAt: command.completedAt,
    });
    this.persistChanges(
      {
        orders: [order],
        dispatchAssignments: [assignment],
        driverTasks: [task],
        dispatchTraceLogs: [traceLog],
      },
      "complete_driver_task",
    );
    this.recordAudit(
      {
        actorId: task.driverId,
        actorType: "ops_user",
        tenantId: null,
        moduleName: "driver-task",
        actionName: "complete_trip",
        resourceType: "driver_task",
        resourceId: taskId,
        newValuesSummary: {
          status: task.status,
          completedAt: command.completedAt,
        },
      },
      requestId,
    );

    return this.cloneTask(task);
  }

  private nextOrderNo() {
    const current = String(this.orderSequence++).padStart(6, "0");
    return `O-20260410-${current}`;
  }

  private deriveNextOrderSequence(orders: readonly OwnedOrderRecord[]) {
    const maxSequence = orders.reduce((currentMax, order) => {
      const rawSequence = order.orderNo.split("-").at(-1) ?? "0";
      const parsedSequence = Number.parseInt(rawSequence, 10);
      if (!Number.isInteger(parsedSequence)) {
        return currentMax;
      }
      return Math.max(currentMax, parsedSequence);
    }, 0);

    return maxSequence + 1;
  }

  private deriveNextBookingSequence(orders: readonly OwnedOrderRecord[]) {
    const existingBookings = orders.filter((order) => order.bookingId).length;
    return existingBookings + 1;
  }

  private nextAttemptSequence(dispatchJobId: string) {
    const count = this.dispatchAttempts.filter(
      (attempt) => attempt.dispatchJobId === dispatchJobId,
    ).length;
    return count + 1;
  }

  private assertAddress(address: string, field: string) {
    if (!address.trim()) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "ADDRESS_UNRESOLVABLE",
        "Pickup address cannot be resolved.",
        {
          field,
        },
      );
    }
  }

  private assertNonBlank(value: string, field: string) {
    if (!value.trim()) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        `${field} is required.`,
        {
          field,
        },
      );
    }
  }

  private assertBookingRules(
    businessDispatchSubtype: NonNullable<
      OwnedOrderRecord["businessDispatchSubtype"]
    >,
    direction?: "pickup" | "dropoff" | null,
    flightNo?: string | null,
  ) {
    if (
      businessDispatchSubtype === "credit_card_airport_transfer" &&
      direction === "pickup" &&
      !flightNo?.trim()
    ) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "FLIGHT_NO_REQUIRED",
        "Flight number is required for airport pickup bookings.",
        {
          businessDispatchSubtype,
          direction,
        },
      );
    }
  }

  private computeBookingWindows(
    businessDispatchSubtype: NonNullable<
      OwnedOrderRecord["businessDispatchSubtype"]
    >,
    reservationWindowStart: string,
  ) {
    const bookingRule = BOOKING_RULES[businessDispatchSubtype];
    const reservationStartMs = new Date(reservationWindowStart).getTime();

    return {
      modifiableUntil: new Date(
        reservationStartMs - bookingRule.modifiableMinutes * 60_000,
      ).toISOString(),
      cancelableUntil: new Date(
        reservationStartMs - bookingRule.cancelableMinutes * 60_000,
      ).toISOString(),
      confirmationWindowMinutes: bookingRule.confirmationWindowMinutes,
    };
  }

  private assertBookingModifiable(order: OwnedOrderRecord) {
    if (!order.modifiableUntil) {
      return;
    }
    if (new Date().getTime() <= new Date(order.modifiableUntil).getTime()) {
      return;
    }

    throw new ApiRequestError(
      HttpStatus.CONFLICT,
      "ORDER_NOT_MODIFIABLE",
      "The order can no longer be modified.",
      {
        orderId: order.orderId,
        modifiableUntil: order.modifiableUntil,
      },
    );
  }

  private assertOrderCancelable(order: OwnedOrderRecord) {
    if (order.status === "cancelled") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "ORDER_NOT_CANCELABLE",
        "The order can no longer be cancelled.",
        {
          orderId: order.orderId,
          status: order.status,
        },
      );
    }

    if (order.dispatchSemantics === "reservation") {
      if (
        order.cancelableUntil &&
        new Date().getTime() > new Date(order.cancelableUntil).getTime()
      ) {
        throw new ApiRequestError(
          HttpStatus.CONFLICT,
          "ORDER_NOT_CANCELABLE",
          "The order can no longer be cancelled.",
          {
            orderId: order.orderId,
            cancelableUntil: order.cancelableUntil,
          },
        );
      }
      return;
    }

    if (
      ![
        "created",
        "recording_pending",
        "ready_for_dispatch",
        "assigned",
        "driver_accepted",
        "dispatch_failed",
        "redispatch_required",
      ].includes(order.status)
    ) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "ORDER_NOT_CANCELABLE",
        "The order can no longer be cancelled.",
        {
          orderId: order.orderId,
          status: order.status,
        },
      );
    }
  }

  private isWithinConfirmationWindow(order: OwnedOrderRecord, now: string) {
    if (
      order.dispatchSemantics !== "reservation" ||
      !order.businessDispatchSubtype ||
      !order.reservationWindowStart
    ) {
      return false;
    }

    const confirmationWindowMinutes =
      BOOKING_RULES[order.businessDispatchSubtype].confirmationWindowMinutes;
    const reservationStartMs = new Date(order.reservationWindowStart).getTime();
    const thresholdMs = reservationStartMs - confirmationWindowMinutes * 60_000;
    return new Date(now).getTime() >= thresholdMs;
  }

  private nextQueuePosition(siteId: string) {
    const activeEntries = this.queueEntries.filter(
      (entry) => entry.siteId === siteId && entry.status === "checked_in",
    );
    const maxPosition = activeEntries.reduce(
      (currentMax, entry) => Math.max(currentMax, entry.position),
      0,
    );
    return maxPosition + 1;
  }

  private queueTraceOrderId(siteId: string, vehicleId: string) {
    return `queue:${siteId}:${vehicleId}`;
  }

  private rebuildQueueEntriesFromTraceLogs(
    traceLogs: readonly DispatchTraceLogRecord[],
  ) {
    const queueEntries = new Map<string, QueueEntryRecord>();
    const sortedTraceLogs = [...traceLogs].sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt),
    );

    for (const traceLog of sortedTraceLogs) {
      const queueEntryId =
        typeof traceLog.details?.queueEntryId === "string"
          ? traceLog.details.queueEntryId
          : null;
      const vehicleId =
        typeof traceLog.details?.vehicleId === "string"
          ? traceLog.details.vehicleId
          : null;
      const siteId =
        typeof traceLog.details?.siteId === "string"
          ? traceLog.details.siteId
          : null;
      if (!queueEntryId || !vehicleId || !siteId) {
        continue;
      }

      if (traceLog.eventType === "queue.entry.created") {
        queueEntries.set(queueEntryId, {
          queueEntryId,
          vehicleId,
          siteId,
          status: "checked_in",
          position:
            typeof traceLog.details?.position === "number"
              ? traceLog.details.position
              : 0,
          checkedInAt: traceLog.createdAt,
          checkedOutAt: null,
        });
        continue;
      }

      if (traceLog.eventType === "queue.entry.closed") {
        const existingEntry = queueEntries.get(queueEntryId);
        if (!existingEntry) {
          continue;
        }
        existingEntry.status = "checked_out";
        existingEntry.checkedOutAt = traceLog.createdAt;
      }
    }

    return [...queueEntries.values()].sort((left, right) =>
      right.checkedInAt.localeCompare(left.checkedInAt),
    );
  }

  private appendTrace(
    orderId: string,
    eventType: string,
    details?: Record<string, unknown>,
  ) {
    const traceLog: DispatchTraceLogRecord = {
      traceId: randomUUID(),
      orderId,
      eventType,
      message: eventType,
      createdAt: new Date().toISOString(),
    };
    if (details) {
      traceLog.details = details;
    }
    this.dispatchTraceLogs = [traceLog, ...this.dispatchTraceLogs];
    return traceLog;
  }

  private cloneTraceLog(
    traceLog: DispatchTraceLogRecord,
  ): DispatchTraceLogRecord {
    const clonedTraceLog: DispatchTraceLogRecord = {
      ...traceLog,
    };

    if (traceLog.details) {
      clonedTraceLog.details = { ...traceLog.details };
    }

    return clonedTraceLog;
  }

  private persistChanges(
    changes: {
      orders?: readonly OwnedOrderRecord[];
      dispatchJobs?: readonly DispatchJobRecord[];
      dispatchAttempts?: readonly DispatchAttemptRecord[];
      dispatchAssignments?: readonly DispatchAssignmentRecord[];
      driverTasks?: readonly DriverTaskRecord[];
      dispatchTraceLogs?: readonly DispatchTraceLogRecord[];
    },
    context: string,
  ) {
    if (!this.ownedMobilityRepository) {
      return;
    }

    const persistPayload: {
      orders?: OwnedOrderRecord[];
      dispatchJobs?: DispatchJobRecord[];
      dispatchAttempts?: DispatchAttemptRecord[];
      dispatchAssignments?: DispatchAssignmentRecord[];
      driverTasks?: DriverTaskRecord[];
      dispatchTraceLogs?: DispatchTraceLogRecord[];
    } = {};

    if (changes.orders) {
      persistPayload.orders = changes.orders.map((order) =>
        this.cloneOrder(order),
      );
    }
    if (changes.dispatchJobs) {
      persistPayload.dispatchJobs = changes.dispatchJobs.map((job) => ({
        ...job,
      }));
    }
    if (changes.dispatchAttempts) {
      persistPayload.dispatchAttempts = changes.dispatchAttempts.map(
        (attempt) => ({
          ...attempt,
        }),
      );
    }
    if (changes.dispatchAssignments) {
      persistPayload.dispatchAssignments = changes.dispatchAssignments.map(
        (assignment) => ({ ...assignment }),
      );
    }
    if (changes.driverTasks) {
      persistPayload.driverTasks = changes.driverTasks.map((task) =>
        this.cloneTask(task),
      );
    }
    if (changes.dispatchTraceLogs) {
      persistPayload.dispatchTraceLogs = changes.dispatchTraceLogs.map(
        (traceLog) => this.cloneTraceLog(traceLog),
      );
    }

    void this.ownedMobilityRepository
      .persistChanges(persistPayload)
      .catch((error: unknown) => {
        this.ownedMobilityRepository!.reportPersistenceFailure(error, context);
      });
  }

  private recordAudit(
    input: Omit<AuditLogRecord, "auditId" | "createdAt" | "requestId">,
    requestId?: string,
  ) {
    const auditInput: Omit<
      AuditLogRecord,
      "auditId" | "createdAt" | "requestId"
    > & {
      requestId?: string;
    } = {
      ...input,
    };
    if (requestId) {
      auditInput.requestId = requestId;
    }
    this.auditNotificationService.recordAuditLog(auditInput);
  }

  private recordReservationEscalationNotifications(
    order: OwnedOrderRecord,
    dispatchJobId: string,
  ) {
    this.auditNotificationService.recordNotification({
      tenantId: order.tenantId,
      channel: "ops_notice",
      title: "Reservation scheduler escalation",
      message: `Reservation order ${order.orderNo} escalated after ${dispatchJobId} exhausted eligible supply.`,
      status: "unread",
    });
    this.auditNotificationService.recordNotification({
      tenantId: order.tenantId,
      channel: "tenant_sla",
      title: "Reservation dispatch requires follow-up",
      message: `Booking ${order.bookingId ?? order.orderId} needs manual dispatch follow-up.`,
      status: "unread",
    });
  }

  private mapOrderToBooking(order: OwnedOrderRecord): BookingRecord {
    if (
      !order.bookingId ||
      !order.tenantId ||
      !order.bookingType ||
      !order.businessDispatchSubtype ||
      !order.reservationWindowStart ||
      !order.reservationWindowEnd
    ) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "BOOKING_NOT_FOUND",
        "Booking was not found.",
        {
          orderId: order.orderId,
        },
      );
    }

    return {
      bookingId: order.bookingId,
      orderId: order.orderId,
      tenantId: order.tenantId,
      status:
        order.status === "cancelled"
          ? "cancelled"
          : order.status === "completed"
            ? "completed"
            : "active",
      serviceBucket: "business_dispatch",
      businessDispatchSubtype: order.businessDispatchSubtype,
      bookingType: order.bookingType,
      reservationWindowStart: order.reservationWindowStart,
      reservationWindowEnd: order.reservationWindowEnd,
      recurrenceRule: order.recurrenceRule,
      modifiableUntil: order.modifiableUntil,
      cancelableUntil: order.cancelableUntil,
      pickup: { ...order.pickup },
      dropoff: { ...order.dropoff },
      passenger: { ...order.passenger },
      bookedBy: order.bookedBy ? { ...order.bookedBy } : null,
      onsiteContact: order.onsiteContact ? { ...order.onsiteContact } : null,
      costCenter: order.costCenter,
      vehiclePreference: order.vehiclePreference,
      benefitReference: order.benefitReference,
      direction: order.direction,
      flightNo: order.flightNo,
      terminal: order.terminal,
      luggageCount: order.luggageCount,
      notes: order.notes,
      orderStatus: order.status,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  private requireOrder(orderId: string) {
    const order = this.orders.find(
      (candidateOrder) => candidateOrder.orderId === orderId,
    );
    if (!order) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "ORDER_NOT_FOUND",
        "Order was not found.",
        {
          orderId,
        },
      );
    }
    return order;
  }

  private requireBookingOrder(bookingId: string, tenantId?: string) {
    const order = this.orders.find(
      (candidateOrder) =>
        candidateOrder.bookingId === bookingId &&
        (tenantId === undefined || candidateOrder.tenantId === tenantId),
    );
    if (!order) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "BOOKING_NOT_FOUND",
        "Booking was not found.",
        {
          bookingId,
          ...(tenantId ? { tenantId } : {}),
        },
      );
    }
    return order;
  }

  private requireDispatchJob(dispatchJobId: string) {
    const dispatchJob = this.dispatchJobs.find(
      (candidateJob) => candidateJob.dispatchJobId === dispatchJobId,
    );
    if (!dispatchJob) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "DISPATCH_JOB_NOT_FOUND",
        "Dispatch job was not found.",
        {
          dispatchJobId,
        },
      );
    }
    return dispatchJob;
  }

  private requireAssignment(assignmentId: string) {
    const assignment = this.dispatchAssignments.find(
      (candidateAssignment) =>
        candidateAssignment.assignmentId === assignmentId,
    );
    if (!assignment) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "ASSIGNMENT_NOT_FOUND",
        "Dispatch assignment was not found.",
        {
          assignmentId,
        },
      );
    }
    return assignment;
  }

  private requireTask(taskId: string) {
    const task = this.driverTasks.find(
      (candidateTask) => candidateTask.taskId === taskId,
    );
    if (!task) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "DRIVER_TASK_NOT_FOUND",
        "Driver task was not found.",
        {
          taskId,
        },
      );
    }
    return task;
  }

  private findLatestOpenDispatchJob(orderId: string) {
    return this.dispatchJobs.find(
      (dispatchJob) =>
        dispatchJob.orderId === orderId && dispatchJob.status !== "closed",
    );
  }

  private findLatestActiveAssignment(orderId: string) {
    return this.dispatchAssignments.find(
      (assignment) =>
        assignment.orderId === orderId &&
        ["assigned", "accepted"].includes(assignment.status),
    );
  }

  private findTaskByAssignmentId(assignmentId: string) {
    return (
      this.driverTasks.find((task) => task.assignmentId === assignmentId) ??
      null
    );
  }

  private normalizeNullableText(value: string | null | undefined) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private cloneOrder(order: OwnedOrderRecord): OwnedOrderRecord {
    return {
      ...order,
      pickup: { ...order.pickup },
      dropoff: { ...order.dropoff },
      passenger: { ...order.passenger },
      bookedBy: order.bookedBy ? { ...order.bookedBy } : null,
      onsiteContact: order.onsiteContact ? { ...order.onsiteContact } : null,
      etaSnapshot: order.etaSnapshot ? { ...order.etaSnapshot } : null,
      quotedFare: order.quotedFare ? { ...order.quotedFare } : null,
      proofRequirements: { ...order.proofRequirements },
      complianceFlags: [...order.complianceFlags],
    };
  }

  private cloneTask(task: DriverTaskRecord): DriverTaskRecord {
    return {
      ...task,
      fare: task.fare ? { ...task.fare } : null,
      proof: task.proof
        ? {
            photoIds: [...task.proof.photoIds],
            signatureId: task.proof.signatureId ?? null,
            expenseItems: [...(task.proof.expenseItems ?? [])],
          }
        : null,
    };
  }
}
