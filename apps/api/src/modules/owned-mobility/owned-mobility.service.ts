import { randomUUID } from "node:crypto";

import { HttpStatus, Injectable, OnModuleInit, Optional } from "@nestjs/common";

import type {
  AddressPayload,
  ApplyManualFareOverrideCommand,
  AuditLogRecord,
  CallRecordingState,
  ComplianceGateRecord,
  ComplianceGateState,
  CompletionProofBundle,
  AssignDispatchCommand,
  BookingRecord,
  CancelOwnedOrderCommand,
  CreateCallCenterOrderCommand,
  CreateOwnedOrderCommand,
  CreateTenantBookingCommand,
  DispatchAssignmentRecord,
  DispatchAttemptRecord,
  DispatchCandidate,
  DispatchQueueEntryReason,
  DispatchQueueFamily,
  DispatchJobRecord,
  DispatchOrderCommand,
  DispatchSemantics,
  DispatchTraceLogRecord,
  DriverAcceptTaskCommand,
  DriverArrivedPickupCommand,
  DriverCompleteTaskCommand,
  DriverDepartTaskCommand,
  DriverRejectTaskCommand,
  DriverStartTaskCommand,
  DriverTaskRecord,
  EtaSnapshot,
  ExceptionHoldRecord,
  ExceptionHoldReasonCode,
  MoneyAmount,
  NoSupplyEscalationAction,
  OwnedOrderRecord,
  PassengerProfile,
  QueueCheckInCommand,
  QueueCheckOutCommand,
  QueueEntryRecord,
  ReassignDispatchCommand,
  RedispatchOrderCommand,
  ReservationHoldStatus,
  ResolveExceptionHoldCommand,
  UpdateTenantBookingCommand,
} from "@drts/contracts";

import {
  QUEUE_ENTRY_POLICY_MAP,
  RESERVATION_HOLD_VALID_TRANSITIONS,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { OpsDispatchEventsService } from "../../common/ops-dispatch-events.service";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import { CallcenterService } from "../callcenter/callcenter.service";
import { OwnedMobilityRepository } from "./owned-mobility.repository";
import { RegulatoryRegistryService } from "../regulatory-registry/regulatory-registry.service";
import { TenantPartnerService } from "../tenant-partner/tenant-partner.service";
import { OwnedMobilityTaskEventsService } from "./owned-mobility-task-events.service";
import type { MessageEvent } from "@nestjs/common";
import { EMPTY, type Observable } from "rxjs";

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

type PartnerBookingContext = {
  partnerId: string;
  partnerProgramId: string;
  partnerEntrySlug: string;
  eligibilityMode: "none" | "bank_card_inline" | "reference_required";
  eligibilityVerificationId: string | null;
  issuerAuthorizationRef: string | null;
  benefitReference: string | null;
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

type CallRecordingStateChangeEvent = {
  callId: string;
  linkedOrderId: string;
  recordingState: CallRecordingState;
  recordingId: string | null;
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

const MAX_COMPLETION_PROOF_PHOTO_COUNT = 5;
const MAX_COMPLETION_PROOF_PHOTO_BYTES = 600 * 1024;
const BASE64_DATA_URL_PREFIX = /^data:[^;]+;base64,/i;
const BASE64_PAYLOAD_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const DEFAULT_PLATFORM_QUOTED_FARE: MoneyAmount = {
  currency: "NTD",
  amountMinor: 150000,
};
const DEFAULT_PLATFORM_PRICING_RULE_VERSION = "enterprise_dispatch.default.v1";

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

  /** Maps forwarded mirror order IDs to their source platform codes. */
  private forwarderSourceMap = new Map<string, string>();

  constructor(
    private readonly regulatoryRegistryService: RegulatoryRegistryService,
    private readonly auditNotificationService: AuditNotificationService,
    private readonly callcenterService: CallcenterService,
    private readonly ownedMobilityTaskEventsService: OwnedMobilityTaskEventsService,
    @Optional()
    private readonly opsDispatchEventsService?: OpsDispatchEventsService,
    @Optional()
    private readonly ownedMobilityRepository?: OwnedMobilityRepository,
    @Optional()
    private readonly tenantPartnerService?: TenantPartnerService,
  ) {
    this.callcenterService.registerRecordingAttachmentListener((event) =>
      this.handleCallRecordingAttached(event),
    );
    this.callcenterService.registerRecordingStateChangeListener((event) =>
      this.handleCallRecordingStateChanged(event),
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
      partnerId: null,
      partnerProgramId: null,
      partnerEntrySlug: null,
      eligibilityVerificationId: null,
      issuerAuthorizationRef: null,
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
      quotedFareSource: null,
      quotedFareRuleVersion: null,
      manualFareOverride: null,
      exceptionHold: null,
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
      dispatchAttemptCount: 0,
      lastDispatchFailureReason: null,
      noSupplyEscalation: null,
      dispatchTimeout: null,
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
    this.opsDispatchEventsService?.publishOrderCreated(
      this.cloneOrder(order),
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
      partnerId: null,
      partnerProgramId: null,
      partnerEntrySlug: null,
      eligibilityVerificationId: null,
      issuerAuthorizationRef: null,
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
      quotedFareSource: null,
      quotedFareRuleVersion: null,
      manualFareOverride: null,
      exceptionHold: null,
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
      dispatchAttemptCount: 0,
      lastDispatchFailureReason: null,
      noSupplyEscalation: null,
      dispatchTimeout: null,
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
    this.opsDispatchEventsService?.publishOrderCreated(
      this.cloneOrder(order),
      requestId,
    );

    return this.cloneOrder(order);
  }

  createTenantBooking(
    command: CreateTenantBookingCommand,
    tenantId: string,
    identity?: BootstrapRequestIdentity | null,
    requestId?: string,
  ): TenantBookingResult {
    this.assertNonBlank(tenantId, "tenantId");
    this.assertTenantChannelCannotSetQuotedFare(command, identity);
    this.assertBookingRules(
      command.businessDispatchSubtype,
      command.direction,
      command.flightNo,
    );
    const partnerContext = this.resolvePartnerBookingContext(command, tenantId);
    const pickup = this.resolveTenantAddressPayload(
      tenantId,
      command.pickupAddressId ?? null,
      command.pickup,
      "pickup",
    );
    const dropoff = this.resolveTenantAddressPayload(
      tenantId,
      command.dropoffAddressId ?? null,
      command.dropoff,
      "dropoff",
    );
    const passenger = this.resolveTenantPassengerProfile(
      tenantId,
      command.passengerId ?? null,
      command.passenger,
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
      partnerId: partnerContext?.partnerId ?? null,
      partnerProgramId: partnerContext?.partnerProgramId ?? null,
      partnerEntrySlug: partnerContext?.partnerEntrySlug ?? null,
      eligibilityVerificationId:
        partnerContext?.eligibilityVerificationId ?? null,
      issuerAuthorizationRef: partnerContext?.issuerAuthorizationRef ?? null,
      serviceBucket: "business_dispatch",
      dispatchSemantics: "reservation",
      businessDispatchSubtype: command.businessDispatchSubtype,
      status: "created",
      pickup,
      dropoff,
      passenger,
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
      benefitReference:
        this.normalizeNullableText(command.benefitReference) ??
        partnerContext?.benefitReference ??
        null,
      direction: command.direction ?? null,
      flightNo: this.normalizeNullableText(command.flightNo),
      terminal: this.normalizeNullableText(command.terminal),
      luggageCount: command.luggageCount ?? null,
      notes: this.normalizeNullableText(command.notes),
      fixedPrice: true,
      quotedFare: { ...DEFAULT_PLATFORM_QUOTED_FARE },
      quotedFareSource: "platform_pricing_rule",
      quotedFareRuleVersion: DEFAULT_PLATFORM_PRICING_RULE_VERSION,
      manualFareOverride: null,
      exceptionHold: null,
      proofRequirements: {
        // Enterprise dispatch keeps a photo proof requirement by default; unlike
        // the standard createOrder path, omitting minPhotoCount here must still
        // enforce at least one completion photo.
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
      dispatchAttemptCount: 0,
      lastDispatchFailureReason: null,
      noSupplyEscalation: null,
      dispatchTimeout: null,
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
          partnerId: order.partnerId,
          partnerProgramId: order.partnerProgramId,
          partnerEntrySlug: order.partnerEntrySlug,
          eligibilityVerificationId: order.eligibilityVerificationId,
          issuerAuthorizationRef: order.issuerAuthorizationRef,
          benefitReference: order.benefitReference,
        },
      },
      requestId,
    );
    this.publishTenantOrderWebhook(order, "order.created", order.createdAt);
    this.opsDispatchEventsService?.publishOrderCreated(
      this.cloneOrder(order),
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

  handleCallRecordingStateChanged(event: CallRecordingStateChangeEvent) {
    const order = this.orders.find((candidateOrder) => {
      return candidateOrder.orderId === event.linkedOrderId;
    });
    if (!order) {
      return;
    }

    const now = new Date().toISOString();
    order.updatedAt = now;

    if (event.recordingState === "ready") {
      return;
    }

    order.recordingId = null;
    order.status = "recording_pending";
    order.complianceFlags = [
      ...order.complianceFlags.filter(
        (flag) =>
          flag !== "recording_bound" &&
          flag !== "recording_pending" &&
          flag !== "recording_missing",
      ),
      event.recordingState === "missing"
        ? "recording_missing"
        : "recording_pending",
    ];

    const traceLog = this.appendTrace(
      order.orderId,
      "callcenter.recording_state_changed",
      {
        callId: event.callId,
        recordingState: event.recordingState,
        linkedOrderId: event.linkedOrderId,
      },
    );
    this.persistChanges(
      {
        orders: [order],
        dispatchTraceLogs: [traceLog],
      },
      "sync_call_recording_state",
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
    identity?: BootstrapRequestIdentity | null,
    requestId?: string,
  ) {
    this.assertNonBlank(tenantId, "tenantId");
    this.assertTenantChannelCannotSetQuotedFare(command, identity);
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

    if (
      order.partnerEntrySlug &&
      command.businessDispatchSubtype &&
      command.businessDispatchSubtype !== order.businessDispatchSubtype
    ) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "PARTNER_BOOKING_SUBTYPE_IMMUTABLE",
        "Partner-originated bookings cannot change business dispatch subtype after creation.",
        {
          bookingId,
          partnerEntrySlug: order.partnerEntrySlug,
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

    if (command.pickupAddressId !== undefined || command.pickup) {
      const nextPickupAddressId =
        command.pickupAddressId !== undefined
          ? command.pickupAddressId
          : command.pickup
            ? null
            : (order.pickup.addressId ?? null);
      order.pickup = this.resolveTenantAddressPayload(
        tenantId,
        nextPickupAddressId,
        command.pickup ?? order.pickup,
        "pickup",
      );
    }
    if (command.dropoffAddressId !== undefined || command.dropoff) {
      const nextDropoffAddressId =
        command.dropoffAddressId !== undefined
          ? command.dropoffAddressId
          : command.dropoff
            ? null
            : (order.dropoff.addressId ?? null);
      order.dropoff = this.resolveTenantAddressPayload(
        tenantId,
        nextDropoffAddressId,
        command.dropoff ?? order.dropoff,
        "dropoff",
      );
    }
    if (command.passengerId !== undefined || command.passenger) {
      const nextPassengerId =
        command.passengerId !== undefined
          ? command.passengerId
          : command.passenger
            ? null
            : (order.passenger.passengerId ?? null);
      order.passenger = this.resolveTenantPassengerProfile(
        tenantId,
        nextPassengerId,
        command.passenger ?? order.passenger,
      );
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

  applyManualFareOverride(
    orderId: string,
    command: ApplyManualFareOverrideCommand,
    identity?: BootstrapRequestIdentity | null,
    requestId?: string,
  ) {
    const actor = this.requireManualFareOverrideActor(identity);
    const order = this.requireOrder(orderId);
    if (!order.fixedPrice) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "MANUAL_FARE_OVERRIDE_NOT_SUPPORTED",
        "Manual fare override is only supported for fixed-price orders.",
        {
          orderId,
        },
      );
    }
    if (["completed", "cancelled"].includes(order.status)) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "MANUAL_FARE_OVERRIDE_CLOSED_ORDER",
        "Manual fare override is not allowed after the order is closed.",
        {
          orderId,
          status: order.status,
        },
      );
    }

    const reason = this.requireNonBlankText(command.reason, "reason");
    const traceId = this.requireNonBlankText(command.traceId, "traceId");
    const previousQuotedFare = order.quotedFare
      ? { ...order.quotedFare }
      : null;
    const previousQuotedFareSource =
      order.quotedFareSource ?? "platform_pricing_rule";
    const now = new Date().toISOString();

    order.quotedFare = { ...command.fare };
    order.quotedFareSource = "ops_manual_override";
    order.quotedFareRuleVersion =
      this.normalizeNullableText(command.quotedFareRuleVersion) ??
      order.quotedFareRuleVersion;
    order.manualFareOverride = {
      actorType: actor.actorType,
      actorId: actor.actorId,
      reason,
      traceId,
      previousQuotedFare,
      previousQuotedFareSource,
      overriddenAt: now,
    };
    order.updatedAt = now;

    const traceLog = this.appendTrace(
      order.orderId,
      "pricing.manual_override",
      {
        actorType: actor.actorType,
        actorId: actor.actorId,
        reason,
        traceId,
        quotedFare: order.quotedFare,
        quotedFareSource: order.quotedFareSource,
        quotedFareRuleVersion: order.quotedFareRuleVersion,
        previousQuotedFare,
        previousQuotedFareSource,
      },
    );
    this.persistChanges(
      {
        orders: [order],
        dispatchTraceLogs: [traceLog],
      },
      "apply_manual_fare_override",
    );
    this.recordAudit(
      {
        actorId: actor.actorId,
        actorType: actor.actorType,
        tenantId: order.tenantId,
        moduleName: "order",
        actionName: "manual_fare_override",
        resourceType: "order",
        resourceId: order.orderId,
        oldValuesSummary: {
          quotedFare: previousQuotedFare,
          quotedFareSource: previousQuotedFareSource,
        },
        newValuesSummary: {
          quotedFare: order.quotedFare,
          quotedFareSource: order.quotedFareSource,
          quotedFareRuleVersion: order.quotedFareRuleVersion,
          traceId,
          reason,
        },
      },
      requestId,
    );
    this.publishOrderUpdate(order, requestId);

    return this.cloneOrder(order);
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
      this.resolvePickupEtaDestination(order),
    );
    const now = new Date().toISOString();
    const isReservation = order.dispatchSemantics === "reservation";
    const initialReservationHoldStatus = order.reservationHoldStatus;
    const exceptionHoldEval = this.evaluateExceptionHoldCriteria(
      order,
      candidates.length > 0,
      now,
      initialReservationHoldStatus,
    );
    if (
      isReservation &&
      initialReservationHoldStatus === "redispatch_queue" &&
      !exceptionHoldEval.shouldHold
    ) {
      this.transitionReservationHold(order, "requested");
    }
    const dispatchJob: DispatchJobRecord = {
      dispatchJobId: randomUUID(),
      orderId,
      status:
        candidates.length > 0
          ? isReservation
            ? "reserved"
            : "matching"
          : exceptionHoldEval.shouldHold
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
      reasonCode: candidates.length > 0 ? null : exceptionHoldEval.reasonCode,
      createdAt: now,
    };
    this.dispatchJobs = [dispatchJob, ...this.dispatchJobs];
    this.dispatchAttempts = [dispatchAttempt, ...this.dispatchAttempts];

    const traceLogs: DispatchTraceLogRecord[] = [];
    let shouldPersistOrder = false;

    if (candidates.length === 0) {
      shouldPersistOrder = true;
      order.updatedAt = now;
      if (isReservation && !exceptionHoldEval.shouldHold) {
        order.status = "redispatch_required";
        this.transitionReservationHold(order, "redispatch_queue");
        traceLogs.push(
          this.appendTrace(orderId, "dispatch.failed", {
            dispatchJobId: dispatchJob.dispatchJobId,
            reasonCode: exceptionHoldEval.reasonCode,
          }),
        );
        traceLogs.push(
          this.appendTrace(orderId, "queue.entry.created", {
            dispatchJobId: dispatchJob.dispatchJobId,
            queueType: "redispatch",
            reasonCode: exceptionHoldEval.reasonCode,
          }),
        );
      } else if (isReservation) {
        order.status = "exception_hold";
        this.transitionReservationHold(order, "exception_hold");
        order.exceptionHold = this.createExceptionHoldRecord(
          exceptionHoldEval.reasonCode,
          dispatchJob.dispatchJobId,
          now,
          {
            isReservation: true,
            isWithinConfirmationWindow: true,
            hasEligibleSupply: false,
            reasonCode: exceptionHoldEval.reasonCode,
          },
        );
        traceLogs.push(
          this.appendTrace(orderId, "dispatch.failed", {
            dispatchJobId: dispatchJob.dispatchJobId,
            reasonCode: exceptionHoldEval.reasonCode,
          }),
        );
        traceLogs.push(
          this.appendTrace(orderId, "order.exception_hold", {
            dispatchJobId: dispatchJob.dispatchJobId,
            reasonCode: exceptionHoldEval.reasonCode,
            exceptionHoldCriteria: {
              isReservation: true,
              isWithinConfirmationWindow: true,
              hasEligibleSupply: false,
            },
          }),
        );
      } else {
        const escalationAction = this.resolveNoSupplyEscalation(order);
        if (escalationAction === "move_to_delayed_queue") {
          order.status = "delayed_queue";
          order.queueFamily = "delayed_retry_queue";
          order.queueEntryReason = "no_supply_delayed_retry";
          dispatchJob.status = "no_supply";
          order.noSupplyEscalation = {
            orderId,
            dispatchJobId: dispatchJob.dispatchJobId,
            attemptCount: order.dispatchAttemptCount + 1,
            lastAttemptAt: now,
            escalationAction,
            escalatedAt: now,
            resolvedAt: null,
          };
          traceLogs.push(
            this.appendTrace(orderId, "dispatch.no_supply_delayed", {
              dispatchJobId: dispatchJob.dispatchJobId,
              reasonCode: exceptionHoldEval.reasonCode,
              escalationAction,
              attemptCount: order.dispatchAttemptCount + 1,
            }),
          );
        } else if (escalationAction === "escalate_to_ops") {
          order.status = "no_supply";
          order.queueFamily = "manual_review_queue";
          order.queueEntryReason = "no_supply_escalated_to_ops";
          dispatchJob.status = "no_supply";
          order.noSupplyEscalation = {
            orderId,
            dispatchJobId: dispatchJob.dispatchJobId,
            attemptCount: order.dispatchAttemptCount + 1,
            lastAttemptAt: now,
            escalationAction,
            escalatedAt: now,
            resolvedAt: null,
          };
          traceLogs.push(
            this.appendTrace(orderId, "dispatch.no_supply_escalated", {
              dispatchJobId: dispatchJob.dispatchJobId,
              reasonCode: exceptionHoldEval.reasonCode,
              escalationAction,
              attemptCount: order.dispatchAttemptCount + 1,
            }),
          );
        } else {
          order.status = "dispatch_failed";
          traceLogs.push(
            this.appendTrace(orderId, "dispatch.failed", {
              dispatchJobId: dispatchJob.dispatchJobId,
              reasonCode: exceptionHoldEval.reasonCode,
            }),
          );
        }
        order.dispatchAttemptCount += 1;
        order.lastDispatchFailureReason = exceptionHoldEval.reasonCode;
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
    this.opsDispatchEventsService?.publishDispatchJobUpdated(
      orderId,
      dispatchJob,
      requestId,
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
    if (!command.reasonCode.trim()) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "REDISPATCH_REASON_REQUIRED",
        "Redispatch reason is required.",
      );
    }
    const order = this.requireOrder(orderId);
    if (
      order.status === "exception_hold" ||
      order.reservationHoldStatus === "exception_hold"
    ) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "EXCEPTION_HOLD_REQUIRES_RESOLUTION",
        "Exception-hold orders must be released or cancelled through resolveExceptionHold before redispatch.",
        {
          orderId,
          status: order.status,
          reservationHoldStatus: order.reservationHoldStatus,
        },
      );
    }
    const now = new Date().toISOString();
    order.status = "redispatch_required";
    order.dispatchAttemptCount += 1;
    order.lastDispatchFailureReason = command.reasonCode;
    order.updatedAt = now;

    const latestAssignment = this.dispatchAssignments.find(
      (assignment) =>
        assignment.orderId === orderId &&
        ["assigned", "accepted"].includes(assignment.status),
    );
    const latestTask = latestAssignment
      ? this.driverTasks.find(
          (task) =>
            task.assignmentId === latestAssignment.assignmentId &&
            !["completed", "cancelled", "rejected"].includes(task.status),
        )
      : null;
    if (latestAssignment) {
      latestAssignment.status = "cancelled";
      latestAssignment.updatedAt = now;
    }
    if (latestTask) {
      latestTask.status = "cancelled";
      latestTask.completedAt = now;
    }

    const traceLog = this.appendTrace(orderId, "dispatch.redispatch_required", {
      reasonCode: command.reasonCode,
      reasonNote: command.reasonNote ?? null,
      operatorId: command.operatorId ?? null,
      escalationTarget: command.escalationTarget ?? null,
      attemptCount: order.dispatchAttemptCount,
    });
    this.persistChanges(
      {
        orders: [order],
        ...(latestAssignment
          ? { dispatchAssignments: [latestAssignment] }
          : {}),
        ...(latestTask ? { driverTasks: [latestTask] } : {}),
        dispatchTraceLogs: [traceLog],
      },
      "redispatch_order",
    );
    this.recordAudit(
      {
        actorId: command.operatorId ?? null,
        actorType: command.operatorId ? "ops_user" : "system",
        tenantId: order.tenantId,
        moduleName: "dispatch",
        actionName: "redispatch_order",
        resourceType: "order",
        resourceId: orderId,
        newValuesSummary: {
          reasonCode: command.reasonCode,
          reasonNote: command.reasonNote ?? null,
          escalationTarget: command.escalationTarget ?? null,
          status: order.status,
          attemptCount: order.dispatchAttemptCount,
        },
      },
      requestId,
    );
    if (latestTask) {
      this.ownedMobilityTaskEventsService.publishTaskCancelled(
        latestTask,
        order,
        requestId,
      );
    }

    return this.dispatchOrder(orderId, { mode: "auto" }, requestId);
  }

  resolveExceptionHold(
    orderId: string,
    command: ResolveExceptionHoldCommand,
    identity?: BootstrapRequestIdentity | null,
    requestId?: string,
  ) {
    const order = this.requireOrder(orderId);
    const actor = this.requireExceptionHoldActor(identity, command.operatorId);
    const reason = this.requireNonBlankText(command.reason, "reason");
    const traceId = this.requireNonBlankText(command.traceId, "traceId");

    if (order.status !== "exception_hold") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "ORDER_NOT_IN_EXCEPTION_HOLD",
        "Order is not in exception hold state.",
        {
          orderId,
          status: order.status,
        },
      );
    }

    if (order.reservationHoldStatus !== "exception_hold") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "RESERVATION_HOLD_NOT_EXCEPTION",
        "Reservation hold is not in exception_hold state.",
        {
          orderId,
          reservationHoldStatus: order.reservationHoldStatus,
        },
      );
    }

    const now = new Date().toISOString();
    const downstreamReview = this.listDownstreamReviewDuties(order);
    const exceptionHoldRecord =
      order.exceptionHold ??
      this.createExceptionHoldRecord(
        "manual_escalation",
        this.findLatestOpenDispatchJob(orderId)?.dispatchJobId ?? null,
        now,
        {
          isReservation: true,
          isWithinConfirmationWindow: true,
          hasEligibleSupply: false,
          reasonCode: "manual_escalation",
        },
      );

    if (command.resolution === "cancel_order") {
      this.transitionReservationHold(order, "released");
      order.reservationHoldExpiresAt = now;
      exceptionHoldRecord.resolution = {
        resolution: "cancel_order",
        actorType: actor.actorType,
        actorId: actor.actorId,
        reason,
        traceId,
        resolvedAt: now,
        downstreamReviewerLabels: downstreamReview.labels,
        downstreamStages: downstreamReview.stages,
      };
      order.exceptionHold = exceptionHoldRecord;
      const traceLog = this.appendTrace(
        orderId,
        "exception_hold.resolved.cancel",
        {
          operatorId: actor.actorId,
          actorId: actor.actorId,
          actorType: actor.actorType,
          reason,
          resolution: "cancel_order",
          traceId,
          downstreamReviewerLabels: downstreamReview.labels,
          downstreamStages: downstreamReview.stages,
        },
      );
      const cancelReason = `Exception hold resolved: ${reason}`;
      order.status = "cancelled";
      order.cancelledAt = now;
      order.cancelReason = cancelReason;
      order.updatedAt = now;

      const dispatchJob = this.findLatestOpenDispatchJob(orderId);
      if (dispatchJob) {
        dispatchJob.status = "closed";
        dispatchJob.updatedAt = now;
      }

      const cancelTraceLog = this.appendTrace(orderId, "order.cancelled", {
        reason: cancelReason,
      });
      this.persistChanges(
        {
          orders: [order],
          ...(dispatchJob ? { dispatchJobs: [dispatchJob] } : {}),
          dispatchTraceLogs: [traceLog, cancelTraceLog],
        },
        "resolve_exception_hold_cancel",
      );
      this.recordAudit(
        {
          actorId: actor.actorId,
          actorType: actor.actorType,
          tenantId: order.tenantId,
          moduleName: "dispatch",
          actionName: "resolve_exception_hold",
          resourceType: "order",
          resourceId: orderId,
          newValuesSummary: {
            resolution: "cancel_order",
            reason,
            status: order.status,
            traceId,
            downstreamReviewerLabels: downstreamReview.labels,
            downstreamStages: downstreamReview.stages,
          },
        },
        requestId,
      );
      this.publishTenantOrderWebhook(order, "order.cancelled", now, {
        cancelledAt: order.cancelledAt,
        cancelReason: order.cancelReason,
      });
      this.publishLatestDispatchJobUpdate(orderId, requestId);

      return this.cloneOrder(order);
    }

    // resolution === "release_to_dispatch"
    this.transitionReservationHold(order, "requested");
    order.status = "ready_for_dispatch";
    order.reservationHoldExpiresAt = now;
    order.updatedAt = now;
    exceptionHoldRecord.resolution = {
      resolution: "release_to_dispatch",
      actorType: actor.actorType,
      actorId: actor.actorId,
      reason,
      traceId,
      resolvedAt: now,
      downstreamReviewerLabels: downstreamReview.labels,
      downstreamStages: downstreamReview.stages,
    };
    order.exceptionHold = exceptionHoldRecord;

    const traceLog = this.appendTrace(
      orderId,
      "exception_hold.resolved.release",
      {
        operatorId: actor.actorId,
        actorId: actor.actorId,
        actorType: actor.actorType,
        reason,
        resolution: "release_to_dispatch",
        traceId,
        downstreamReviewerLabels: downstreamReview.labels,
        downstreamStages: downstreamReview.stages,
      },
    );
    this.persistChanges(
      {
        orders: [order],
        dispatchTraceLogs: [traceLog],
      },
      "resolve_exception_hold_release",
    );
    this.recordAudit(
      {
        actorId: actor.actorId,
        actorType: actor.actorType,
        tenantId: order.tenantId,
        moduleName: "dispatch",
        actionName: "resolve_exception_hold",
        resourceType: "order",
        resourceId: orderId,
        newValuesSummary: {
          resolution: "release_to_dispatch",
          reason,
          status: order.status,
          traceId,
          downstreamReviewerLabels: downstreamReview.labels,
          downstreamStages: downstreamReview.stages,
        },
      },
      requestId,
    );
    this.publishOrderUpdate(order, requestId);

    return this.cloneOrder(order);
  }

  listDispatchJobs() {
    return this.dispatchJobs.map((job) => this.buildDispatchJobSnapshot(job));
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
      .getEligibleCandidates(
        order.serviceBucket,
        this.resolvePickupEtaDestination(order),
      )
      .map((candidate) => ({ ...candidate }));
  }

  private buildDispatchJobSnapshot(dispatchJob: DispatchJobRecord) {
    const order = this.orders.find(
      (candidateOrder) => candidateOrder.orderId === dispatchJob.orderId,
    );
    if (!order) {
      return { ...dispatchJob };
    }

    const liveCandidates = this.regulatoryRegistryService.getEligibleCandidates(
      order.serviceBucket,
      this.resolvePickupEtaDestination(order),
    );

    return {
      ...dispatchJob,
      latestEtaMinutes:
        liveCandidates[0]?.etaMinutes ?? dispatchJob.latestEtaMinutes,
    };
  }

  assignDispatch(command: AssignDispatchCommand, requestId?: string) {
    const dispatchJob = this.requireDispatchJob(command.dispatchJobId);
    const order = this.requireOrder(dispatchJob.orderId);

    return this.createDispatchAssignment(
      dispatchJob,
      order,
      command.vehicleId,
      command.driverId,
      requestId,
    );
  }

  reassignDispatch(command: ReassignDispatchCommand, requestId?: string) {
    if (!command.reasonCode.trim()) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "REASSIGN_REASON_REQUIRED",
        "Reassign reason is required.",
      );
    }

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

    const activeAssignment = this.dispatchAssignments.find(
      (assignment) =>
        assignment.dispatchJobId === dispatchJob.dispatchJobId &&
        ["assigned", "accepted"].includes(assignment.status),
    );

    if (!activeAssignment) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "ACTIVE_ASSIGNMENT_REQUIRED",
        "Reassign requires an active dispatch assignment.",
        {
          dispatchJobId: dispatchJob.dispatchJobId,
        },
      );
    }

    const activeTask = this.driverTasks.find(
      (task) =>
        task.assignmentId === activeAssignment.assignmentId &&
        !["completed", "cancelled", "rejected"].includes(task.status),
    );
    const now = new Date().toISOString();
    activeAssignment.status = "cancelled";
    activeAssignment.updatedAt = now;
    if (activeTask) {
      activeTask.status = "cancelled";
      activeTask.completedAt = now;
    }

    const dispatchAttempt: DispatchAttemptRecord = {
      attemptId: randomUUID(),
      dispatchJobId: dispatchJob.dispatchJobId,
      orderId: order.orderId,
      sequence: this.nextAttemptSequence(dispatchJob.dispatchJobId),
      outcome: "reassigned",
      reasonCode: command.reasonCode,
      createdAt: now,
    };
    this.dispatchAttempts = [dispatchAttempt, ...this.dispatchAttempts];

    const traceLog = this.appendTrace(order.orderId, "dispatch.reassigned", {
      dispatchJobId: dispatchJob.dispatchJobId,
      previousAssignmentId: activeAssignment.assignmentId,
      previousTaskId: activeTask?.taskId ?? null,
      previousVehicleId: activeAssignment.vehicleId,
      previousDriverId: activeAssignment.driverId,
      nextVehicleId: command.vehicleId,
      nextDriverId: command.driverId,
      reasonCode: command.reasonCode,
      reasonNote: command.reasonNote ?? null,
    });

    this.persistChanges(
      {
        dispatchAssignments: [activeAssignment],
        ...(activeTask ? { driverTasks: [activeTask] } : {}),
        dispatchAttempts: [dispatchAttempt],
        dispatchTraceLogs: [traceLog],
      },
      "reassign_dispatch",
    );
    this.recordAudit(
      {
        actorId: null,
        actorType: "ops_user",
        tenantId: order.tenantId,
        moduleName: "dispatch",
        actionName: "reassign_dispatch",
        resourceType: "dispatch_assignment",
        resourceId: activeAssignment.assignmentId,
        oldValuesSummary: {
          vehicleId: activeAssignment.vehicleId,
          driverId: activeAssignment.driverId,
        },
        newValuesSummary: {
          dispatchJobId: dispatchJob.dispatchJobId,
          vehicleId: command.vehicleId,
          driverId: command.driverId,
          reasonCode: command.reasonCode,
          reasonNote: command.reasonNote ?? null,
        },
      },
      requestId,
    );

    if (activeTask) {
      this.ownedMobilityTaskEventsService.publishTaskCancelled(
        activeTask,
        order,
        requestId,
      );
    }

    return this.createDispatchAssignment(
      dispatchJob,
      order,
      command.vehicleId,
      command.driverId,
      requestId,
    );
  }

  private createDispatchAssignment(
    dispatchJob: DispatchJobRecord,
    order: OwnedOrderRecord,
    vehicleId: string,
    driverId: string,
    requestId?: string,
  ) {
    if (
      !this.regulatoryRegistryService.getVehicleDispatchability(
        vehicleId,
        order.serviceBucket,
      )
    ) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VEHICLE_NOT_DISPATCHABLE",
        "Vehicle is not eligible for dispatch.",
        {
          vehicleId,
        },
      );
    }

    if (
      !this.regulatoryRegistryService.getDriverAvailability(
        driverId,
        order.serviceBucket,
      )
    ) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "DRIVER_NOT_AVAILABLE",
        "Driver is not eligible for dispatch.",
        {
          driverId,
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
      vehicleId,
      driverId,
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
      driverId,
      vehicleId,
      sourcePlatform: this.forwarderSourceMap.get(order.orderId) ?? null,
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
      this.transitionReservationHold(order, "released");
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
        vehicleId,
        driverId,
      }),
    );
    this.auditNotificationService.recordNotification({
      tenantId: order.tenantId,
      channel: "driver_task",
      title: "Driver task assigned",
      message: `Driver ${driverId} received task ${taskId} for order ${order.orderNo}.`,
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
          vehicleId,
          driverId,
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
    this.ownedMobilityTaskEventsService.publishTaskAssigned(
      task,
      order,
      requestId,
    );
    this.opsDispatchEventsService?.publishDispatchJobUpdated(
      order.orderId,
      dispatchJob,
      requestId,
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
      ["requested", "redispatch_queue"].includes(order.reservationHoldStatus)
    ) {
      this.transitionReservationHold(order, "released");
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
    this.publishTenantOrderWebhook(order, "order.cancelled", now, {
      cancelledAt: order.cancelledAt,
      cancelReason: order.cancelReason,
    });
    if (task) {
      this.ownedMobilityTaskEventsService.publishTaskCancelled(
        task,
        order,
        requestId,
      );
    }
    this.publishLatestDispatchJobUpdate(order.orderId, requestId);

    return this.cloneOrder(order);
  }

  /**
   * Register a forwarded mirror order so that driver tasks created for this
   * order will carry the correct sourcePlatform value.  Called by
   * ForwarderService when an external order is ingested.
   */
  registerForwarderSource(orderId: string, platformCode: string) {
    this.forwarderSourceMap.set(orderId, platformCode);
  }

  /**
   * Cancel driver tasks associated with a forwarder mirror order that reached
   * a terminal state (lost_race, cancelled_by_platform).  Called by
   * ForwarderService when the external platform resolves the race.
   */
  cancelForwarderTasks(
    mirrorOrderId: string,
    terminalStatus: string,
    requestId?: string,
  ) {
    const activeTasks = this.driverTasks.filter(
      (task) =>
        task.orderId === mirrorOrderId &&
        !["completed", "cancelled", "rejected"].includes(task.status),
    );
    if (activeTasks.length === 0) {
      return [];
    }

    const now = new Date().toISOString();
    const cancelledTasks: DriverTaskRecord[] = [];

    for (const task of activeTasks) {
      task.status = "cancelled";
      task.completedAt = now;

      const assignment = this.findTaskByAssignmentId(task.assignmentId)
        ? this.dispatchAssignments.find(
            (a) => a.assignmentId === task.assignmentId,
          )
        : null;
      if (assignment && ["assigned", "accepted"].includes(assignment.status)) {
        assignment.status = "cancelled";
        assignment.updatedAt = now;
      }

      this.appendTrace(mirrorOrderId, "forwarder.terminal_state", {
        terminalStatus,
        taskId: task.taskId,
        driverId: task.driverId,
      });

      cancelledTasks.push(task);
    }

    this.persistChanges(
      {
        driverTasks: cancelledTasks,
        dispatchTraceLogs: this.dispatchTraceLogs.slice(
          0,
          cancelledTasks.length,
        ),
      },
      "cancel_forwarder_tasks",
    );
    this.recordAudit(
      {
        actorId: null,
        actorType: "system",
        tenantId: null,
        moduleName: "forwarder",
        actionName: "cancel_forwarder_tasks",
        resourceType: "driver_task",
        resourceId: mirrorOrderId,
        newValuesSummary: {
          terminalStatus,
          cancelledTaskIds: cancelledTasks.map((t) => t.taskId),
        },
      },
      requestId,
    );

    // Notify each cancelled driver task through the event stream
    for (const task of cancelledTasks) {
      const order = this.orders.find((o) => o.orderId === mirrorOrderId);
      if (order) {
        this.ownedMobilityTaskEventsService.publishTaskCancelled(
          task,
          order,
          requestId,
        );
      }
    }

    return cancelledTasks.map((t) => this.cloneTask(t));
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
    return this.driverTasks.map((task) => {
      const clone = this.cloneTask(task);
      if (!clone.sourcePlatform) {
        clone.sourcePlatform =
          this.forwarderSourceMap.get(task.orderId) ?? null;
      }
      return clone;
    });
  }

  streamDriverTaskEvents(driverId: string): Observable<MessageEvent> {
    this.assertNonBlank(driverId, "driverId");
    return this.ownedMobilityTaskEventsService.streamDriverTaskEvents(driverId);
  }

  streamOpsDispatchEvents(): Observable<MessageEvent> {
    return this.opsDispatchEventsService?.streamEvents() ?? EMPTY;
  }

  private publishOrderUpdate(order: OwnedOrderRecord, requestId?: string) {
    this.opsDispatchEventsService?.publishOrderUpdated(
      this.cloneOrder(order),
      requestId,
    );
  }

  private publishLatestDispatchJobUpdate(orderId: string, requestId?: string) {
    const dispatchJob = this.dispatchJobs.find(
      (job) => job.orderId === orderId,
    );
    if (!dispatchJob) {
      return;
    }

    this.opsDispatchEventsService?.publishDispatchJobUpdated(
      orderId,
      dispatchJob,
      requestId,
    );
  }

  getDriverTask(taskId: string) {
    const task = this.requireTask(taskId);
    const clone = this.cloneTask(task);
    if (!clone.sourcePlatform) {
      clone.sourcePlatform = this.forwarderSourceMap.get(task.orderId) ?? null;
    }
    return clone;
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
    this.ownedMobilityTaskEventsService.publishTaskUpdated(
      task,
      order,
      requestId,
    );
    this.publishLatestDispatchJobUpdate(order.orderId, requestId);
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
    this.ownedMobilityTaskEventsService.publishTaskUpdated(
      task,
      order,
      requestId,
    );
    this.publishLatestDispatchJobUpdate(order.orderId, requestId);
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
    this.ownedMobilityTaskEventsService.publishTaskUpdated(
      task,
      order,
      requestId,
    );
    this.publishLatestDispatchJobUpdate(order.orderId, requestId);
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
    this.ownedMobilityTaskEventsService.publishTaskUpdated(
      task,
      order,
      requestId,
    );
    this.publishLatestDispatchJobUpdate(order.orderId, requestId);
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
    this.ownedMobilityTaskEventsService.publishTaskUpdated(
      task,
      order,
      requestId,
    );
    this.publishLatestDispatchJobUpdate(order.orderId, requestId);
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

    if (requestId) {
      const replayedTask = this.replayDriverCompletion(task, order, requestId);
      if (replayedTask) {
        return replayedTask;
      }
    }

    if (task.status === "completed") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "TASK_ALREADY_COMPLETED",
        "Driver task has already been completed.",
      );
    }

    if (task.status !== "on_trip" && task.status !== "proof_pending") {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "TASK_NOT_ACTIVE",
        "Driver task cannot be completed from the current status.",
        {
          status: task.status,
        },
      );
    }

    const proof = {
      photos: [...(command.proof?.photos ?? [])],
      signatureId: command.proof?.signatureId ?? null,
      expenseItems: [...(command.proof?.expenseItems ?? [])],
    };
    this.assertCompletionProofPhotos(proof.photos);
    const proofHasEvidence = this.hasCompletionProofEvidence(proof);

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

    if (proof.photos.length < order.proofRequirements.minPhotoCount) {
      this.markDriverTaskProofPending(
        task,
        assignment,
        order,
        proof,
        requestId,
      );
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "MIN_PHOTO_COUNT_NOT_MET",
        "Completion proof does not satisfy minimum photo count.",
        {
          minPhotoCount: order.proofRequirements.minPhotoCount,
        },
      );
    }

    if (order.proofRequirements.signoffRequired && !proof.signatureId) {
      this.markDriverTaskProofPending(
        task,
        assignment,
        order,
        proof,
        requestId,
      );
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
      this.markDriverTaskProofPending(
        task,
        assignment,
        order,
        proof,
        requestId,
      );
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "EXPENSE_PROOF_REQUIRED",
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
    task.proof = proofHasEvidence ? proof : null;
    assignment.status = "completed";
    assignment.updatedAt = now;
    order.status = "completed";
    order.updatedAt = now;

    const traceLog = this.appendTrace(order.orderId, "driver.completed_trip", {
      taskId,
      assignmentId: assignment.assignmentId,
      completedAt: command.completedAt,
      requestId: requestId ?? null,
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
    this.publishTenantOrderWebhook(order, "order.completed", now, {
      completedAt: command.completedAt,
      taskId,
      assignmentId: assignment.assignmentId,
    });
    this.ownedMobilityTaskEventsService.publishTaskUpdated(
      task,
      order,
      requestId,
    );
    this.publishLatestDispatchJobUpdate(order.orderId, requestId);

    return this.cloneTask(task);
  }

  private publishTenantOrderWebhook(
    order: OwnedOrderRecord,
    eventType: "order.created" | "order.cancelled" | "order.completed",
    occurredAt: string,
    extraData: Record<string, unknown> = {},
  ) {
    if (!order.tenantId || !this.tenantPartnerService) {
      return;
    }

    void this.tenantPartnerService
      .publishWebhookEvent(order.tenantId, {
        eventType,
        occurredAt,
        data: {
          orderId: order.orderId,
          orderNo: order.orderNo,
          bookingId: order.bookingId,
          bookingType: order.bookingType,
          orderStatus: order.status,
          serviceBucket: order.serviceBucket,
          dispatchSemantics: order.dispatchSemantics,
          businessDispatchSubtype: order.businessDispatchSubtype,
          reservationWindowStart: order.reservationWindowStart,
          reservationWindowEnd: order.reservationWindowEnd,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
          ...extraData,
        },
      })
      .catch(() => undefined);
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

  private requireNonBlankText(value: string, field: string) {
    const normalized = value.trim();
    if (!normalized) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        `${field} is required.`,
        {
          field,
        },
      );
    }

    return normalized;
  }

  private assertTenantChannelCannotSetQuotedFare(
    command:
      | Pick<CreateTenantBookingCommand, "quotedFare" | "quotedFareRuleVersion">
      | Pick<
          UpdateTenantBookingCommand,
          "quotedFare" | "quotedFareRuleVersion"
        >,
    identity?: BootstrapRequestIdentity | null,
  ) {
    if (
      command.quotedFare === undefined &&
      command.quotedFareRuleVersion === undefined
    ) {
      return;
    }

    throw new ApiRequestError(
      identity?.actorType === "partner_api_key"
        ? HttpStatus.FORBIDDEN
        : HttpStatus.BAD_REQUEST,
      "PRICING_AUTHORITY_FORBIDDEN",
      "Tenant and partner booking channels cannot set quoted fare directly.",
      {
        actorType: identity?.actorType ?? null,
        canonicalSource: "platform_pricing_rule",
      },
    );
  }

  private requireManualFareOverrideActor(
    identity?: BootstrapRequestIdentity | null,
  ) {
    if (
      identity?.actorId &&
      (identity.actorType === "platform_admin" ||
        identity.actorType === "ops_user")
    ) {
      return {
        actorId: identity.actorId,
        actorType: identity.actorType,
      } as const;
    }

    throw new ApiRequestError(
      HttpStatus.FORBIDDEN,
      "MANUAL_FARE_OVERRIDE_FORBIDDEN",
      "Manual fare override requires a platform_admin or ops_user identity.",
    );
  }

  private requireExceptionHoldActor(
    identity?: BootstrapRequestIdentity | null,
    operatorId?: string | null,
  ) {
    if (
      identity?.actorId &&
      (identity.actorType === "platform_admin" ||
        identity.actorType === "ops_user")
    ) {
      if (operatorId?.trim() && operatorId.trim() !== identity.actorId.trim()) {
        throw new ApiRequestError(
          HttpStatus.BAD_REQUEST,
          "EXCEPTION_HOLD_OPERATOR_MISMATCH",
          "operatorId must match the authenticated actor.",
          {
            operatorId,
            actorId: identity.actorId,
          },
        );
      }

      return {
        actorId: identity.actorId,
        actorType: identity.actorType,
      } as const;
    }

    throw new ApiRequestError(
      HttpStatus.FORBIDDEN,
      "EXCEPTION_HOLD_OVERRIDE_FORBIDDEN",
      "Exception hold release requires an ops_user or platform_admin identity.",
    );
  }

  private assertCompletionProofPhotos(photos: string[]) {
    if (photos.length > MAX_COMPLETION_PROOF_PHOTO_COUNT) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "PHOTO_LIMIT_EXCEEDED",
        "Completion proof exceeds the maximum allowed photo count.",
        {
          maxPhotoCount: MAX_COMPLETION_PROOF_PHOTO_COUNT,
        },
      );
    }

    photos.forEach((photo, index) => {
      const payload = this.parseProofPhotoPayload(photo, index);
      const photoSizeBytes = Buffer.from(payload, "base64").byteLength;

      if (photoSizeBytes > MAX_COMPLETION_PROOF_PHOTO_BYTES) {
        throw new ApiRequestError(
          HttpStatus.BAD_REQUEST,
          "PROOF_PHOTO_TOO_LARGE",
          "Completion proof photo exceeds the maximum allowed size.",
          {
            photoIndex: index,
            maxPhotoSizeBytes: MAX_COMPLETION_PROOF_PHOTO_BYTES,
          },
        );
      }
    });
  }

  private parseProofPhotoPayload(photo: string, index: number) {
    const trimmed = photo.trim();
    const payload = trimmed.replace(BASE64_DATA_URL_PREFIX, "");

    if (!payload || !BASE64_PAYLOAD_PATTERN.test(payload)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "INVALID_PROOF_PHOTO",
        "Completion proof photo must be a valid base64 string.",
        {
          photoIndex: index,
        },
      );
    }

    return payload;
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
        "dispatch_timeout",
        "no_supply",
        "delayed_queue",
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

  private transitionReservationHold(
    order: OwnedOrderRecord,
    targetStatus: ReservationHoldStatus,
  ) {
    const currentStatus = order.reservationHoldStatus;
    const allowedTargets = RESERVATION_HOLD_VALID_TRANSITIONS[currentStatus];
    if (!allowedTargets.includes(targetStatus)) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "INVALID_HOLD_TRANSITION",
        `Cannot transition reservation hold from '${currentStatus}' to '${targetStatus}'.`,
        {
          orderId: order.orderId,
          currentStatus,
          targetStatus,
          allowedTargets: [...allowedTargets],
        },
      );
    }
    order.reservationHoldStatus = targetStatus;
  }

  private resolveNoSupplyEscalation(
    order: OwnedOrderRecord,
  ): NoSupplyEscalationAction {
    // First attempt: move to delayed retry queue for automatic retry
    if (order.dispatchAttemptCount < 1) {
      return "move_to_delayed_queue";
    }
    // After first retry failure: escalate to ops for manual intervention
    return "escalate_to_ops";
  }

  handleDispatchTimeout(
    orderId: string,
    timeoutReasonCode: "acceptance_timeout" | "matching_timeout",
    requestId?: string,
  ) {
    const order = this.requireOrder(orderId);
    const now = new Date().toISOString();

    const activeJob = this.dispatchJobs.find(
      (job) =>
        job.orderId === orderId &&
        ["matching", "assigned"].includes(job.status),
    );

    const latestAssignment = activeJob
      ? this.dispatchAssignments.find(
          (assignment) =>
            assignment.dispatchJobId === activeJob.dispatchJobId &&
            ["assigned", "accepted"].includes(assignment.status),
        )
      : null;
    const latestTask = latestAssignment
      ? this.driverTasks.find(
          (task) =>
            task.assignmentId === latestAssignment.assignmentId &&
            !["completed", "cancelled", "rejected"].includes(task.status),
        )
      : null;

    if (latestAssignment) {
      latestAssignment.status = "cancelled";
      latestAssignment.updatedAt = now;
    }
    if (latestTask) {
      latestTask.status = "cancelled";
      latestTask.completedAt = now;
    }
    if (activeJob) {
      activeJob.status = "timed_out";
      activeJob.updatedAt = now;
    }

    order.status = "dispatch_timeout";
    order.dispatchAttemptCount += 1;
    order.lastDispatchFailureReason = timeoutReasonCode;
    order.queueFamily = "redispatch_priority_queue";
    order.queueEntryReason = "dispatch_timeout_retry";
    order.dispatchTimeout = {
      orderId,
      dispatchJobId: activeJob?.dispatchJobId ?? "",
      timeoutAt: now,
      timeoutReasonCode,
      previousAssignmentId: latestAssignment?.assignmentId ?? null,
      escalationAction: "retry_dispatch",
    };
    order.updatedAt = now;

    const dispatchAttempt: DispatchAttemptRecord = {
      attemptId: randomUUID(),
      dispatchJobId: activeJob?.dispatchJobId ?? "",
      orderId,
      sequence: this.nextAttemptSequence(activeJob?.dispatchJobId ?? ""),
      outcome: "timed_out",
      reasonCode: timeoutReasonCode,
      createdAt: now,
    };
    this.dispatchAttempts = [dispatchAttempt, ...this.dispatchAttempts];

    const traceLog = this.appendTrace(orderId, "dispatch.timeout", {
      dispatchJobId: activeJob?.dispatchJobId ?? null,
      timeoutReasonCode,
      previousAssignmentId: latestAssignment?.assignmentId ?? null,
      attemptCount: order.dispatchAttemptCount,
    });

    this.persistChanges(
      {
        orders: [order],
        ...(activeJob ? { dispatchJobs: [activeJob] } : {}),
        ...(latestAssignment
          ? { dispatchAssignments: [latestAssignment] }
          : {}),
        ...(latestTask ? { driverTasks: [latestTask] } : {}),
        dispatchAttempts: [dispatchAttempt],
        dispatchTraceLogs: [traceLog],
      },
      "dispatch_timeout",
    );

    this.recordAudit(
      {
        actorId: null,
        actorType: "system",
        tenantId: order.tenantId,
        moduleName: "dispatch",
        actionName: "dispatch_timeout",
        resourceType: "order",
        resourceId: orderId,
        newValuesSummary: {
          timeoutReasonCode,
          status: order.status,
          attemptCount: order.dispatchAttemptCount,
        },
      },
      requestId,
    );

    if (latestTask) {
      this.ownedMobilityTaskEventsService.publishTaskCancelled(
        latestTask,
        order,
        requestId,
      );
    }

    this.opsDispatchEventsService?.publishOrderUpdated(order, requestId);

    return {
      orderId,
      status: order.status,
      timeoutReasonCode,
      escalationAction: "retry_dispatch" as NoSupplyEscalationAction,
    };
  }

  resolveNoSupplyOrder(
    orderId: string,
    resolution: "retry_dispatch" | "cancel_with_notification",
    operatorId?: string,
    requestId?: string,
  ) {
    const order = this.requireOrder(orderId);
    const now = new Date().toISOString();

    if (order.status !== "no_supply" && order.status !== "delayed_queue") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "ORDER_NOT_IN_NO_SUPPLY",
        "Order is not in a no-supply or delayed queue state.",
        { orderId, status: order.status },
      );
    }

    if (resolution === "cancel_with_notification") {
      order.status = "cancelled";
      order.cancelledAt = now;
      order.cancelReason = "no_supply_cancelled";
      order.updatedAt = now;
      if (order.noSupplyEscalation) {
        order.noSupplyEscalation.resolvedAt = now;
      }
      order.queueFamily = null;
      order.queueEntryReason = null;

      const traceLog = this.appendTrace(orderId, "order.cancelled", {
        reason: "no_supply_cancelled",
        operatorId: operatorId ?? null,
      });

      this.persistChanges(
        { orders: [order], dispatchTraceLogs: [traceLog] },
        "cancel_no_supply",
      );
      this.recordAudit(
        {
          actorId: operatorId ?? null,
          actorType: operatorId ? "ops_user" : "system",
          tenantId: order.tenantId,
          moduleName: "dispatch",
          actionName: "cancel_no_supply",
          resourceType: "order",
          resourceId: orderId,
          newValuesSummary: { status: order.status },
        },
        requestId,
      );
      this.opsDispatchEventsService?.publishOrderUpdated(order, requestId);
      return { orderId, status: order.status };
    }

    // retry_dispatch
    order.status = "ready_for_dispatch";
    order.updatedAt = now;
    if (order.noSupplyEscalation) {
      order.noSupplyEscalation.resolvedAt = now;
    }
    order.queueFamily = null;
    order.queueEntryReason = null;

    const traceLog = this.appendTrace(orderId, "dispatch.no_supply_resolved", {
      resolution: "retry_dispatch",
      operatorId: operatorId ?? null,
    });
    this.persistChanges(
      { orders: [order], dispatchTraceLogs: [traceLog] },
      "resolve_no_supply",
    );
    this.recordAudit(
      {
        actorId: operatorId ?? null,
        actorType: operatorId ? "ops_user" : "system",
        tenantId: order.tenantId,
        moduleName: "dispatch",
        actionName: "resolve_no_supply",
        resourceType: "order",
        resourceId: orderId,
        newValuesSummary: { status: order.status },
      },
      requestId,
    );
    this.opsDispatchEventsService?.publishOrderUpdated(order, requestId);
    return this.dispatchOrder(orderId, { mode: "auto" }, requestId);
  }

  private evaluateExceptionHoldCriteria(
    order: OwnedOrderRecord,
    hasEligibleSupply: boolean,
    now: string,
    holdStatus: ReservationHoldStatus = order.reservationHoldStatus,
  ): { shouldHold: boolean; reasonCode: ExceptionHoldReasonCode } {
    const isReservation = order.dispatchSemantics === "reservation";
    const inWindow = this.isWithinConfirmationWindow(order, now);

    if (!isReservation) {
      return { shouldHold: false, reasonCode: "no_eligible_supply" };
    }

    if (inWindow && holdStatus === "redispatch_queue" && !hasEligibleSupply) {
      return {
        shouldHold: true,
        reasonCode: "confirmation_window_expired",
      };
    }

    if (inWindow && !hasEligibleSupply) {
      return { shouldHold: true, reasonCode: "no_eligible_supply" };
    }

    return { shouldHold: false, reasonCode: "no_eligible_supply" };
  }

  private assertQueueEntryPolicy(dispatchSemantics: DispatchSemantics) {
    const policy = QUEUE_ENTRY_POLICY_MAP[dispatchSemantics];
    if (!policy.allowsQueueEntry) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "QUEUE_ENTRY_NOT_ALLOWED",
        `Queue entry is not allowed for dispatch semantics '${dispatchSemantics}'.`,
        {
          dispatchSemantics,
        },
      );
    }
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

  private replayDriverCompletion(
    task: DriverTaskRecord,
    order: OwnedOrderRecord,
    requestId: string,
  ): DriverTaskRecord | null {
    if (
      task.status === "completed" &&
      this.hasDriverTaskTraceRequestId(
        order.orderId,
        task.taskId,
        "driver.completed_trip",
        requestId,
      )
    ) {
      return this.cloneTask(task);
    }

    if (
      task.status === "proof_pending" &&
      this.hasDriverTaskTraceRequestId(
        order.orderId,
        task.taskId,
        "driver.proof_pending",
        requestId,
      )
    ) {
      return this.cloneTask(task);
    }

    return null;
  }

  private hasDriverTaskTraceRequestId(
    orderId: string,
    taskId: string,
    eventType: string,
    requestId: string,
  ): boolean {
    return this.dispatchTraceLogs.some(
      (traceLog) =>
        traceLog.orderId === orderId &&
        traceLog.eventType === eventType &&
        traceLog.details?.taskId === taskId &&
        traceLog.details?.requestId === requestId,
    );
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

    const complianceGates = this.listComplianceGatesForOrder(order);
    return {
      bookingId: order.bookingId,
      orderId: order.orderId,
      tenantId: order.tenantId,
      partnerId: order.partnerId,
      partnerProgramId: order.partnerProgramId,
      partnerEntrySlug: order.partnerEntrySlug,
      eligibilityVerificationId: order.eligibilityVerificationId,
      issuerAuthorizationRef: order.issuerAuthorizationRef,
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
      quotedFare: order.quotedFare ? { ...order.quotedFare } : null,
      quotedFareSource: order.quotedFareSource,
      quotedFareRuleVersion: order.quotedFareRuleVersion,
      manualFareOverride: order.manualFareOverride
        ? { ...order.manualFareOverride }
        : null,
      complianceGates,
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

  private resolvePickupEtaDestination(order: Pick<OwnedOrderRecord, "pickup">) {
    if (
      Number.isFinite(order.pickup.lat) &&
      Number.isFinite(order.pickup.lng)
    ) {
      return {
        lat: order.pickup.lat as number,
        lng: order.pickup.lng as number,
      };
    }

    return null;
  }

  private findLatestTaskForOrder(orderId: string) {
    return (
      this.driverTasks.find(
        (candidateTask) => candidateTask.orderId === orderId,
      ) ?? null
    );
  }

  private listComplianceGatesForOrder(
    order: OwnedOrderRecord,
    task = this.findLatestTaskForOrder(order.orderId),
  ): ComplianceGateRecord[] {
    const gates: ComplianceGateRecord[] = [];
    const recordingGate = this.buildRecordingGate(order);
    if (recordingGate) {
      gates.push(recordingGate);
    }

    const proofGate = this.buildProofGate(order, task);
    if (proofGate) {
      gates.push(proofGate);
    }

    const eligibilityGate = this.buildEligibilityGate(order);
    if (eligibilityGate) {
      gates.push(eligibilityGate);
    }

    return gates;
  }

  private buildRecordingGate(
    order: OwnedOrderRecord,
  ): ComplianceGateRecord | null {
    if (order.orderSource !== "phone" && !order.callId) {
      return null;
    }

    const hasRecording = Boolean(order.recordingId);
    const recordingMissing =
      order.complianceFlags.includes("recording_missing");
    const state: ComplianceGateState = hasRecording ? "clear" : "blocked";
    return {
      gateType: "recording",
      title: "Call recording linkage",
      state,
      required: true,
      blocking: !hasRecording,
      evidenceState: hasRecording ? "verified" : "missing",
      evidenceRefs: order.recordingId ? [order.recordingId] : [],
      missingItems: hasRecording ? [] : ["recording_id"],
      nextAction: hasRecording
        ? "Recording has been bound to the phone order."
        : recordingMissing
          ? "Call ended without a linked recording. Investigate and attach the callback before dispatching this order."
          : "Attach the call recording callback before dispatching this order.",
      reviewerLabel: "callcenter / ops compliance",
      overrideAllowed: false,
      overrideActors: [],
      impacts: [
        {
          stage: "dispatch",
          effect: hasRecording ? "clear" : "blocked",
          reason: hasRecording
            ? "Dispatch may proceed because recording linkage is present."
            : "Phone orders stay blocked from dispatch until recording linkage is attached.",
        },
        {
          stage: "completion",
          effect: "clear",
          reason:
            "Recording linkage does not block driver completion once dispatch starts.",
        },
        {
          stage: "settlement",
          effect: hasRecording ? "clear" : "review_required",
          reason: hasRecording
            ? "Recording evidence is available for audit and revenue review."
            : "Audit and finance exports will require manual follow-up while recording linkage is missing.",
        },
      ],
    };
  }

  private buildProofGate(
    order: OwnedOrderRecord,
    task: DriverTaskRecord | null,
  ): ComplianceGateRecord | null {
    const { minPhotoCount, signoffRequired, expenseProofRequired } =
      order.proofRequirements;
    const required =
      minPhotoCount > 0 || signoffRequired || expenseProofRequired;
    const hasProof = this.hasCompletionProofEvidence(task?.proof);

    if (!required && !hasProof && order.status !== "proof_pending") {
      return null;
    }

    const missingItems: string[] = [];
    if (minPhotoCount > 0 && !hasProof) {
      missingItems.push(`photos>=${minPhotoCount}`);
    }
    if (signoffRequired && !task?.proof?.signatureId) {
      missingItems.push("signature");
    }
    if (expenseProofRequired && !task?.proof?.expenseItems?.length) {
      missingItems.push("expense_items");
    }

    const state: ComplianceGateState =
      missingItems.length === 0
        ? "clear"
        : order.status === "proof_pending" || task?.status === "proof_pending"
          ? "blocked"
          : "pending";

    return {
      gateType: "proof",
      title: "Completion proof bundle",
      state,
      required,
      blocking: state === "blocked",
      evidenceState:
        missingItems.length === 0
          ? "verified"
          : hasProof
            ? "submitted"
            : "missing",
      evidenceRefs: [
        ...(task?.proof?.photos?.length
          ? [`photos:${task.proof.photos.length}`]
          : []),
        ...(task?.proof?.signatureId ? [task.proof.signatureId] : []),
        ...(task?.proof?.expenseItems?.length
          ? [`expense_items:${task.proof.expenseItems.length}`]
          : []),
      ],
      missingItems,
      nextAction:
        missingItems.length === 0
          ? "Required completion proof has been captured."
          : "Driver must submit the required proof bundle before trip completion and settlement closeout.",
      reviewerLabel: "ops dispatch / finance review",
      overrideAllowed: false,
      overrideActors: [],
      impacts: [
        {
          stage: "dispatch",
          effect: "clear",
          reason: "Proof requirements do not block dispatch assignment.",
        },
        {
          stage: "completion",
          effect: missingItems.length === 0 ? "clear" : "blocked",
          reason:
            missingItems.length === 0
              ? "Completion may proceed because proof requirements are satisfied."
              : "Trip completion stays blocked until the required proof bundle is submitted.",
        },
        {
          stage: "settlement",
          effect: missingItems.length === 0 ? "clear" : "review_required",
          reason:
            missingItems.length === 0
              ? "Proof evidence is ready for downstream settlement and audit."
              : "Settlement review requires proof completion or manual finance follow-up.",
        },
      ],
    };
  }

  private hasCompletionProofEvidence(
    proof: CompletionProofBundle | null | undefined,
  ): boolean {
    return Boolean(
      proof?.photos.length || proof?.signatureId || proof?.expenseItems?.length,
    );
  }

  private markDriverTaskProofPending(
    task: DriverTaskRecord,
    assignment: DispatchAssignmentRecord,
    order: OwnedOrderRecord,
    proof: CompletionProofBundle,
    requestId?: string,
  ): void {
    const now = new Date().toISOString();

    task.status = "proof_pending";
    task.proof = this.hasCompletionProofEvidence(proof) ? proof : null;
    order.status = "proof_pending";
    order.updatedAt = now;
    assignment.updatedAt = now;

    const traceLog = this.appendTrace(order.orderId, "driver.proof_pending", {
      taskId: task.taskId,
      assignmentId: assignment.assignmentId,
      missingItems: this.describeMissingCompletionProof(order, proof),
      requestId: requestId ?? null,
    });
    this.persistChanges(
      {
        orders: [order],
        dispatchAssignments: [assignment],
        driverTasks: [task],
        dispatchTraceLogs: [traceLog],
      },
      "driver_task_proof_pending",
    );
    this.ownedMobilityTaskEventsService.publishTaskUpdated(
      task,
      order,
      requestId,
    );
    this.publishLatestDispatchJobUpdate(order.orderId, requestId);
  }

  private describeMissingCompletionProof(
    order: OwnedOrderRecord,
    proof: CompletionProofBundle,
  ): string[] {
    const missingItems: string[] = [];
    if (proof.photos.length < order.proofRequirements.minPhotoCount) {
      missingItems.push(`photos>=${order.proofRequirements.minPhotoCount}`);
    }
    if (order.proofRequirements.signoffRequired && !proof.signatureId) {
      missingItems.push("signature");
    }
    if (
      order.proofRequirements.expenseProofRequired &&
      (proof.expenseItems?.length ?? 0) === 0
    ) {
      missingItems.push("expense_items");
    }
    return missingItems;
  }

  private buildEligibilityGate(
    order: OwnedOrderRecord,
  ): ComplianceGateRecord | null {
    const verification = this.resolveEligibilityVerification(order);
    if (!order.partnerEntrySlug && !verification) {
      return null;
    }

    const required =
      Boolean(order.partnerEntrySlug) &&
      this.resolvePartnerEligibilityRequired(order.partnerEntrySlug ?? "");
    const hasVerification = Boolean(order.eligibilityVerificationId);
    const verificationExpired = Boolean(
      verification?.expiresAt &&
      Number.isFinite(Date.parse(verification.expiresAt)) &&
      Date.parse(verification.expiresAt) < Date.now(),
    );
    const isEligible =
      verification?.verificationStatus === "eligible" && !verificationExpired;
    const isManualReview = verification?.verificationStatus === "manual_review";

    const state: ComplianceGateState = !required
      ? "clear"
      : isEligible
        ? "clear"
        : isManualReview
          ? "review_required"
          : "blocked";

    return {
      gateType: "eligibility",
      title: "Partner eligibility verification",
      state,
      required,
      blocking: state === "blocked",
      evidenceState: !required
        ? "not_required"
        : hasVerification
          ? isEligible
            ? "verified"
            : "submitted"
          : "missing",
      evidenceRefs: order.eligibilityVerificationId
        ? [order.eligibilityVerificationId]
        : [],
      missingItems:
        !required || hasVerification ? [] : ["eligibility_verification"],
      nextAction: !required
        ? "This channel does not require partner eligibility verification."
        : isEligible
          ? "Eligibility verification is approved and within TTL."
          : isManualReview
            ? "Ops must complete the manual eligibility fallback review before release."
            : hasVerification
              ? verificationExpired
                ? "Re-run partner eligibility because the current verification expired."
                : "Resolve the partner eligibility failure before dispatch or settlement."
              : "Run partner eligibility verification before the booking can proceed.",
      reviewerLabel: "partner ops reviewer",
      overrideAllowed: true,
      overrideActors: ["ops_user", "platform_admin"],
      impacts: [
        {
          stage: "dispatch",
          effect:
            !required || isEligible
              ? "clear"
              : isManualReview
                ? "review_required"
                : "blocked",
          reason:
            !required || isEligible
              ? "Dispatch eligibility is satisfied for this booking channel."
              : "Dispatch remains gated on partner eligibility approval or manual review.",
        },
        {
          stage: "completion",
          effect: "clear",
          reason:
            "Eligibility is decided before dispatch and does not change driver completion steps.",
        },
        {
          stage: "settlement",
          effect:
            !required || isEligible
              ? "clear"
              : isManualReview
                ? "review_required"
                : "blocked",
          reason:
            !required || isEligible
              ? "Eligibility evidence is present for benefit reconciliation."
              : "Benefit settlement cannot close until eligibility review is resolved.",
        },
      ],
    };
  }

  private resolvePartnerEligibilityRequired(partnerEntrySlug: string) {
    if (!this.tenantPartnerService) {
      return true;
    }

    try {
      return (
        this.tenantPartnerService.getPartnerEntry(partnerEntrySlug)
          .eligibilityMode !== "none"
      );
    } catch {
      return true;
    }
  }

  private resolveEligibilityVerification(order: OwnedOrderRecord) {
    if (!this.tenantPartnerService || !order.eligibilityVerificationId) {
      return null;
    }

    try {
      return this.tenantPartnerService.getPartnerEligibilityVerification(
        order.eligibilityVerificationId,
      );
    } catch {
      return null;
    }
  }

  private normalizeNullableText(value: string | null | undefined) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private resolveTenantPassengerProfile(
    tenantId: string,
    passengerId: string | null,
    fallback: PassengerProfile,
  ): PassengerProfile {
    const normalizedPassengerId = this.normalizeNullableText(passengerId);
    if (!normalizedPassengerId) {
      this.assertNonBlank(fallback.name, "passenger.name");
      this.assertNonBlank(fallback.phone, "passenger.phone");
      return {
        ...fallback,
        passengerId: null,
      };
    }

    if (!this.tenantPartnerService) {
      throw new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "TENANT_MASTER_DATA_UNAVAILABLE",
        "Tenant passenger master data is unavailable for this booking flow.",
        {
          tenantId,
          passengerId: normalizedPassengerId,
        },
      );
    }

    const masterPassenger = this.tenantPartnerService.getPassengerMasterRecord(
      tenantId,
      normalizedPassengerId,
    );
    const phone =
      this.normalizeNullableText(masterPassenger.mobile) ??
      this.normalizeNullableText(fallback.phone);
    if (!phone) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "PASSENGER_CONTACT_REQUIRED",
        "Passenger master data must include a phone number or the booking payload must provide one.",
        {
          tenantId,
          passengerId: normalizedPassengerId,
        },
      );
    }

    return {
      passengerId: masterPassenger.passengerId,
      name: masterPassenger.fullName,
      phone,
      roles: [...(masterPassenger.roles ?? [])],
    };
  }

  private resolveTenantAddressPayload(
    tenantId: string,
    addressId: string | null,
    fallback: AddressPayload,
    fieldName: "pickup" | "dropoff",
  ): AddressPayload {
    const normalizedAddressId = this.normalizeNullableText(addressId);
    if (!normalizedAddressId) {
      this.assertAddress(fallback.address, `${fieldName}.address`);
      return { ...fallback, addressId: null };
    }

    if (!this.tenantPartnerService) {
      throw new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "TENANT_MASTER_DATA_UNAVAILABLE",
        "Tenant address master data is unavailable for this booking flow.",
        {
          tenantId,
          addressId: normalizedAddressId,
          fieldName,
        },
      );
    }

    const masterAddress = this.tenantPartnerService.getAddressMasterRecord(
      tenantId,
      normalizedAddressId,
    );
    this.assertAddress(masterAddress.addressText, `${fieldName}.address`);
    return {
      addressId: masterAddress.addressId,
      addressName: masterAddress.addressName,
      address: masterAddress.addressText,
      normalizedAddress: masterAddress.normalizedAddressText ?? null,
      maskedAddress: masterAddress.maskedAddressText ?? null,
      sensitive: masterAddress.sensitiveFlag ?? false,
      lat: masterAddress.lat,
      lng: masterAddress.lng,
    };
  }

  private resolvePartnerBookingContext(
    command: CreateTenantBookingCommand,
    tenantId: string,
  ): PartnerBookingContext | null {
    const entrySlug = this.normalizeNullableText(command.partnerEntrySlug);
    const eligibilityVerificationId = this.normalizeNullableText(
      command.eligibilityVerificationId,
    );

    if (!entrySlug && !eligibilityVerificationId) {
      return null;
    }

    if (!this.tenantPartnerService) {
      throw new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "PARTNER_ENTRY_UNAVAILABLE",
        "Partner entry services are unavailable for this booking flow.",
        {
          tenantId,
        },
      );
    }

    const verification = eligibilityVerificationId
      ? this.tenantPartnerService.getPartnerEligibilityVerification(
          eligibilityVerificationId,
        )
      : null;
    const entry = this.tenantPartnerService.getPartnerEntry(
      entrySlug ?? verification?.partnerEntrySlug ?? "",
    );

    if (entry.tenantId !== tenantId) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "PARTNER_ENTRY_TENANT_MISMATCH",
        "Partner entry does not belong to the current tenant.",
        {
          tenantId,
          entrySlug: entry.entrySlug,
        },
      );
    }

    if (entry.businessDispatchSubtype !== command.businessDispatchSubtype) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "PARTNER_ENTRY_SUBTYPE_MISMATCH",
        "Partner entry requires a different business dispatch subtype.",
        {
          entrySlug: entry.entrySlug,
          expectedBusinessDispatchSubtype: entry.businessDispatchSubtype,
          actualBusinessDispatchSubtype: command.businessDispatchSubtype,
        },
      );
    }

    if (verification) {
      if (
        verification.partnerEntrySlug !== entry.entrySlug ||
        verification.tenantId !== tenantId ||
        verification.partnerId !== entry.partnerId ||
        verification.partnerProgramId !== entry.programId
      ) {
        throw new ApiRequestError(
          HttpStatus.BAD_REQUEST,
          "ELIGIBILITY_VERIFICATION_MISMATCH",
          "Eligibility verification does not match the partner entry or tenant context.",
          {
            eligibilityVerificationId: verification.eligibilityVerificationId,
            entrySlug: entry.entrySlug,
            tenantId,
          },
        );
      }
    }

    if (entry.eligibilityMode !== "none") {
      if (!verification) {
        throw new ApiRequestError(
          HttpStatus.BAD_REQUEST,
          "ELIGIBILITY_VERIFICATION_REQUIRED",
          "This partner entry requires a prior eligibility verification.",
          {
            entrySlug: entry.entrySlug,
            eligibilityMode: entry.eligibilityMode,
          },
        );
      }

      if (verification.verificationStatus !== "eligible") {
        throw new ApiRequestError(
          HttpStatus.CONFLICT,
          "ELIGIBILITY_NOT_APPROVED",
          "Partner eligibility verification is not eligible for booking.",
          {
            eligibilityVerificationId: verification.eligibilityVerificationId,
            verificationStatus: verification.verificationStatus,
          },
        );
      }

      if (
        verification.expiresAt &&
        Number.isFinite(Date.parse(verification.expiresAt)) &&
        Date.parse(verification.expiresAt) < Date.now()
      ) {
        throw new ApiRequestError(
          HttpStatus.CONFLICT,
          "ELIGIBILITY_VERIFICATION_EXPIRED",
          "Partner eligibility verification has expired.",
          {
            eligibilityVerificationId: verification.eligibilityVerificationId,
            expiresAt: verification.expiresAt,
          },
        );
      }
    }

    return {
      partnerId: entry.partnerId,
      partnerProgramId: entry.programId,
      partnerEntrySlug: entry.entrySlug,
      eligibilityMode: entry.eligibilityMode,
      eligibilityVerificationId:
        verification?.eligibilityVerificationId ?? null,
      issuerAuthorizationRef: verification?.issuerAuthorizationRef ?? null,
      benefitReference: verification?.benefitReference ?? null,
    };
  }

  private cloneOrder(order: OwnedOrderRecord): OwnedOrderRecord {
    const complianceGates = this.listComplianceGatesForOrder(order);
    const queueState = this.resolveDispatchQueueState(order, complianceGates);
    return {
      ...order,
      pickup: { ...order.pickup },
      dropoff: { ...order.dropoff },
      passenger: { ...order.passenger },
      bookedBy: order.bookedBy ? { ...order.bookedBy } : null,
      onsiteContact: order.onsiteContact ? { ...order.onsiteContact } : null,
      etaSnapshot: order.etaSnapshot ? { ...order.etaSnapshot } : null,
      quotedFare: order.quotedFare ? { ...order.quotedFare } : null,
      quotedFareSource: order.quotedFareSource,
      quotedFareRuleVersion: order.quotedFareRuleVersion,
      manualFareOverride: order.manualFareOverride
        ? { ...order.manualFareOverride }
        : null,
      exceptionHold: order.exceptionHold
        ? this.cloneExceptionHoldRecord(order.exceptionHold)
        : null,
      proofRequirements: { ...order.proofRequirements },
      complianceGates,
      complianceFlags: [...order.complianceFlags],
      queueFamily: queueState.queueFamily,
      queueEntryReason: queueState.queueEntryReason,
      noSupplyEscalation: order.noSupplyEscalation
        ? { ...order.noSupplyEscalation }
        : null,
      dispatchTimeout: order.dispatchTimeout
        ? { ...order.dispatchTimeout }
        : null,
    };
  }

  private resolveDispatchQueueState(
    order: OwnedOrderRecord,
    complianceGates = this.listComplianceGatesForOrder(order),
  ): {
    queueFamily: DispatchQueueFamily | null;
    queueEntryReason: DispatchQueueEntryReason | null;
  } {
    const now = new Date().toISOString();
    const dispatchReviewRequired = complianceGates.some((gate) =>
      gate.impacts.some(
        (impact) =>
          impact.stage === "dispatch" && impact.effect === "review_required",
      ),
    );

    if (
      order.status === "exception_hold" ||
      order.reservationHoldStatus === "exception_hold"
    ) {
      return {
        queueFamily: "exception_hold_queue",
        queueEntryReason:
          order.exceptionHold?.reasonCode === "confirmation_window_expired"
            ? "exception_hold_confirmation_window_expired"
            : order.exceptionHold?.reasonCode === "driver_rejected_in_window"
              ? "exception_hold_driver_rejected_in_window"
              : order.exceptionHold?.reasonCode === "manual_escalation"
                ? "exception_hold_manual_escalation"
                : "exception_hold_no_eligible_supply",
      };
    }

    if (dispatchReviewRequired) {
      return {
        queueFamily: "manual_review_queue",
        queueEntryReason: "dispatch_manual_review_required",
      };
    }

    if (
      order.status === "recording_pending" ||
      order.complianceFlags.includes("recording_pending") ||
      order.complianceFlags.includes("recording_missing")
    ) {
      return {
        queueFamily: "recording_gate_queue",
        queueEntryReason: "recording_missing_for_dispatch",
      };
    }

    if (order.status === "dispatch_timeout") {
      return {
        queueFamily: "redispatch_priority_queue",
        queueEntryReason: "dispatch_timeout_retry",
      };
    }

    if (order.status === "delayed_queue") {
      return {
        queueFamily: "delayed_retry_queue",
        queueEntryReason: "no_supply_delayed_retry",
      };
    }

    if (order.status === "no_supply") {
      return {
        queueFamily: "manual_review_queue",
        queueEntryReason: "no_supply_escalated_to_ops",
      };
    }

    if (
      order.status === "redispatch_required" ||
      order.reservationHoldStatus === "redispatch_queue"
    ) {
      return {
        queueFamily: "redispatch_priority_queue",
        queueEntryReason: "redispatch_retry_required",
      };
    }

    if (
      order.dispatchSemantics === "reservation" &&
      order.status === "ready_for_dispatch" &&
      order.reservationHoldStatus === "requested" &&
      this.isWithinConfirmationWindow(order, now)
    ) {
      return {
        queueFamily: "reservation_confirmation_queue",
        queueEntryReason: "reservation_confirmation_window_open",
      };
    }

    if (order.status === "ready_for_dispatch") {
      return {
        queueFamily: "realtime_ready_queue",
        queueEntryReason: "realtime_ready_for_dispatch",
      };
    }

    return {
      queueFamily: null,
      queueEntryReason: null,
    };
  }

  private cloneTask(task: DriverTaskRecord): DriverTaskRecord {
    const order = this.orders.find(
      (candidateOrder) => candidateOrder.orderId === task.orderId,
    );
    return {
      ...task,
      fare: task.fare ? { ...task.fare } : null,
      proof: task.proof
        ? {
            photos: [...task.proof.photos],
            signatureId: task.proof.signatureId ?? null,
            expenseItems: [...(task.proof.expenseItems ?? [])],
          }
        : null,
      complianceGates: order
        ? this.listComplianceGatesForOrder(order, task)
        : [],
    };
  }

  private createExceptionHoldRecord(
    reasonCode: ExceptionHoldReasonCode,
    dispatchJobId: string | null,
    raisedAt: string,
    criteria: {
      isReservation: boolean;
      isWithinConfirmationWindow: boolean;
      hasEligibleSupply: boolean;
      reasonCode: ExceptionHoldReasonCode;
    },
  ): ExceptionHoldRecord {
    return {
      reasonCode,
      dispatchJobId,
      raisedAt,
      criteria: { ...criteria },
      overrideAllowed: true,
      overrideActors: ["ops_user", "platform_admin"],
      resolution: null,
    };
  }

  private cloneExceptionHoldRecord(
    record: ExceptionHoldRecord,
  ): ExceptionHoldRecord {
    return {
      ...record,
      criteria: { ...record.criteria },
      overrideActors: [...record.overrideActors],
      resolution: record.resolution
        ? {
            ...record.resolution,
            downstreamReviewerLabels: [
              ...record.resolution.downstreamReviewerLabels,
            ],
            downstreamStages: [...record.resolution.downstreamStages],
          }
        : null,
    };
  }

  private listDownstreamReviewDuties(order: OwnedOrderRecord) {
    const labels = new Set<string>();
    const stages = new Set<"dispatch" | "completion" | "settlement">();

    this.listComplianceGatesForOrder(order).forEach((gate) => {
      if (gate.state === "clear") {
        return;
      }
      if (gate.reviewerLabel) {
        labels.add(gate.reviewerLabel);
      }
      gate.impacts.forEach((impact) => {
        if (impact.effect !== "clear") {
          stages.add(impact.stage);
        }
      });
    });

    return {
      labels: [...labels],
      stages: [...stages],
    };
  }
}
