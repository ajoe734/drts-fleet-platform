import { createHash, randomUUID } from "node:crypto";

import { generateDeterministicUuid } from "../../common/durable-identity";

import {
  HttpStatus,
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  OnModuleDestroy,
  Logger,
  OnModuleInit,
  Optional,
  forwardRef,
} from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";

import type {
  DriverTaskStatus,
  AddressPayload,
  ApplyManualFareOverrideCommand,
  ApproveTenantBookingApprovalRequestCommand,
  AuditLogRecord,
  CallRecordingState,
  ComplianceGateRecord,
  ComplianceGateState,
  CompletionProofBundle,
  ConsumerNotificationOutboxRecord,
  AssignDispatchCommand,
  BookingRecord,
  CancelOwnedOrderCommand,
  CreateCallCenterOrderCommand,
  CreateMultiTaxiRideCommand,
  CreateOwnedOrderCommand,
  CreateTenantBookingCommand,
  DispatchAssignmentRecord,
  DispatchAttemptRecord,
  DispatchCandidate,
  DispatchQueueEligibilityReasonCode,
  DispatchQueueEntryReadRecord,
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
  DriverRatingSummary,
  DriverRejectTaskCommand,
  DriverStartTaskCommand,
  DriverTaskRecord,
  EtaSnapshot,
  EscalateTenantBookingApprovalRequestCommand,
  ApproveExceptionOverrideCommand,
  ExceptionHoldRecord,
  ExceptionHoldReasonCode,
  FareQuoteAnomaly,
  FareQuoteAnomalySnapshot,
  FulfillmentSegmentRecord,
  MoneyAmount,
  MultiTaxiOperatingAuthorizationRecord,
  OverrideRequestRecord,
  PassengerDisclosureChannel,
  PassengerDisclosureRequirementSnapshot,
  RejectExceptionOverrideCommand,
  RejectTenantBookingApprovalRequestCommand,
  RecordPassengerAcknowledgementCommand,
  RequestExceptionOverrideCommand,
  NoSupplyEscalationAction,
  OwnedOrderRecord,
  PartnerChannelEntryRecord,
  PassengerDispatchDisclosureSnapshot,
  PassengerProfile,
  QueueCheckInCommand,
  QueueCheckOutCommand,
  QueueEntryRecord,
  ReassignDispatchCommand,
  RedispatchOrderCommand,
  ReservationHoldStatus,
  ResolveExceptionHoldCommand,
  SandboxBillingTreatmentRecord,
  TenantApprovalEvaluationInputSnapshot,
  TenantApprovalEvaluationResult,
  TenantBookingApprovalRequestRecord,
  TenantBookingApprovalState,
  UpdateTenantBookingCommand,
  GeoPoint,
  GeoCoordinateProvenance,
  GeoResolutionSurface,
  OwnedOrderSpatialAuditSnapshot,
  OwnedOrderSpatialAuditStopSnapshot,
  ServiceAreaEvaluationResult,
  ServiceProductType,
  DispatchQueueMode,
  RuntimeProfileCode,
  RouteFareDisclosureSnapshot,
  CancelReferralPassengerTripCommand,
  CreateReferralPassengerBookingCommand,
  ReferralPassengerActiveTripResult,
  ReferralPassengerHistoryItem,
  ReferralPassengerReceipt,
  SubmitReferralPassengerRatingCommand,
} from "@drts/contracts";

import {
  PLATFORM_CURRENCY,
  normalisePlatformCurrency,
  QUEUE_ENTRY_POLICY_MAP,
  RESERVATION_HOLD_VALID_TRANSITIONS,
  hasAddressCoordinateProvenance,
  hasAddressCoordinates,
} from "@drts/contracts";

import { DRIVER_TASK_TRANSITIONS } from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import type { BootstrapRequestIdentity } from "../../common/auth";
import {
  IdempotencyRepository,
  IdempotencyService,
} from "../../common/idempotency";
import { OpsDispatchEventsService } from "../../common/ops-dispatch-events.service";
import { resolvePassengerSubjectRef } from "../../common/sensitive-data-policy";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import { CallcenterService } from "../callcenter/callcenter.service";
import { FareAnomalyService } from "../product-rule/fare-anomaly.service";
import {
  OwnedMobilityRepository,
  OwnedOrderDuplicateVoiceLinkError,
  OwnedOrderVersionConflictError,
  DispatchResourceReservationConflictError,
  type DriverCompletionOutboxClaimResult,
  type DriverCompletionOutboxEffectType,
  type DriverCompletionOutboxRecord,
  type DriverTaskCompletionBundleRecord,
  type OwnedMobilityQueryExecutor,
} from "./owned-mobility.repository";
import { RegulatoryRegistryService } from "../regulatory-registry/regulatory-registry.service";
import { SandboxDispatchGateService } from "../sandbox-dispatch-gate/sandbox-dispatch-gate.service";
import { VoiceBookingRepository } from "../voice-booking/voice-booking.repository";
import { resolveVoiceOrderFence } from "../voice-booking/voice-order-fence";
import {
  TenantPartnerService,
  type TenantQuotaConsumptionCommitResult,
} from "../tenant-partner/tenant-partner.service";
import { VehicleEligibilityService } from "../vehicle-eligibility/vehicle-eligibility.service";
import { SandboxFallbackCostPolicyResolverService } from "../billing-settlement/sandbox-fallback-cost-policy-resolver.service";
import { RuntimeEligibilityEvaluator } from "../vehicle-eligibility/runtime-eligibility-evaluator.service";
import { ServiceAreaService } from "../service-area/service-area.service";
import {
  OWNED_MOBILITY_MULTI_TAXI_TRIP_COMPLETED_EVENT,
  OWNED_MOBILITY_TRIP_COMPLETED_EVENT,
  type OwnedMobilityMultiTaxiTripCompletedEvent,
  type OwnedMobilityTripCompletedEvent,
} from "./owned-mobility-events";
import { OwnedMobilityTaskEventsService } from "./owned-mobility-task-events.service";
import { ServiceProductService } from "../service-product/service-product.service";
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
  replayed: boolean;
};

const REFERRAL_PASSENGER_CANCEL_WINDOW_MS = 2 * 60_000;

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

export type OwnedMobilityReportingSnapshot = {
  orders: OwnedOrderRecord[];
  dispatchJobs: DispatchJobRecord[];
  dispatchAssignments: DispatchAssignmentRecord[];
  driverTasks: DriverTaskRecord[];
  dispatchTraceLogs: DispatchTraceLogRecord[];
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

type MaybePromise<T> = T | Promise<T>;

type DispatchAssignmentBundle = {
  order: OwnedOrderRecord;
  dispatchJob: DispatchJobRecord;
  assignment: DispatchAssignmentRecord;
  task: DriverTaskRecord;
  dispatchAttempt: DispatchAttemptRecord;
  traceLogs: DispatchTraceLogRecord[];
  passengerDisclosureSnapshot: PassengerDispatchDisclosureSnapshot | null;
  consumerNotificationOutbox: ConsumerNotificationOutboxRecord | null;
};

type DispatchAssignmentResult = {
  assignmentId: string;
  status: DispatchAssignmentRecord["status"];
  taskId: string;
};

type DriverTaskCompletionCommitResult = {
  order: OwnedOrderRecord;
  assignment: DispatchAssignmentRecord;
  task: DriverTaskRecord;
  traceLog: DispatchTraceLogRecord;
  quotaConsumption: TenantQuotaConsumptionCommitResult | null;
  outcome: "completed" | "proof_pending";
  errorToThrow: ApiRequestError | null;
  certificateEvent?: OwnedMobilityMultiTaxiTripCompletedEvent | null;
};

type DriverTaskCompletionTransactionResult =
  | {
      outcome: "replayed";
      bundle: DriverTaskCompletionBundleRecord;
    }
  | {
      outcome: "committed";
      committed: DriverTaskCompletionCommitResult;
    };

type AuditEntryInput = Omit<
  AuditLogRecord,
  "auditId" | "createdAt" | "requestId"
> & { auditId?: string };

type DriverCompletionOutboxPayload =
  | {
      effectType: "tenant_order_completed_webhook";
      tenantId: string;
      payload: {
        eventType: "order.created" | "order.cancelled" | "order.completed";
        occurredAt: string;
        data: Record<string, unknown>;
      };
    }
  | {
      effectType: "owned_mobility_trip_completed";
      event: OwnedMobilityTripCompletedEvent;
    }
  | {
      effectType: "multi_taxi_certificate";
      event: OwnedMobilityMultiTaxiTripCompletedEvent;
    }
  | {
      effectType: "completion_audit_bundle";
      audits: AuditEntryInput[];
      requestId: string | null;
    }
  | {
      effectType: "driver_task_updated";
      task: DriverTaskRecord;
      order: OwnedOrderRecord;
      requestId: string | null;
      eventId: string;
      correlationId: string;
    }
  | {
      effectType: "ops_dispatch_job_updated";
      orderId: string;
      dispatchJob: DispatchJobRecord;
      requestId: string | null;
      eventId: string;
      correlationId: string;
    };

type CreateDispatchAssignmentOptions = {
  dispatchAttemptSequence?: number;
  /**
   * SD §7.6: when a reassign supersedes an existing assignment, its shared
   * driver+vehicle reservation must be released in the same transaction
   * that reserves the new driver/vehicle -- otherwise the old reservation's
   * unique-occupation row can block the new one, or a moment exists where
   * neither the old nor the new assignment holds the resource.
   */
  previousAssignmentId?: string;
};

type MultiTaxiCallContext = {
  callId: string;
  recordingId: string | null;
  notes: string | null;
};

type QueueRuntimeContext = {
  runtimeProfileCode: RuntimeProfileCode;
  queueMode: DispatchQueueMode;
  operatingAuthorizationId: string | null;
};

type QueueRegistryProjection = {
  authorityAvailable: boolean;
  driversById: Map<string, { driverId: string; name: string }>;
  pairsByVehicleId: Map<string, { vehicleId: string; driverId: string }>;
  vehiclesById: Map<
    string,
    {
      vehicleId: string;
      plateNo: string;
      operatingArea: string;
    }
  >;
};

type ServiceAreaGateResolution = {
  serviceProductType: ServiceProductType | null;
  pickup: GeoPoint | null;
  dropoff: GeoPoint | null;
  missingItems: string[];
  evaluation: ServiceAreaEvaluationResult | null;
};

type SpatialAuditContext = {
  actorId: string | null;
  actorType: AuditLogRecord["actorType"];
  surface: GeoResolutionSurface;
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
  insurance_replacement_vehicle: {
    modifiableMinutes: 120,
    cancelableMinutes: 120,
    confirmationWindowMinutes: 120,
  },
  travel_agency_transfer: {
    modifiableMinutes: 90,
    cancelableMinutes: 90,
    confirmationWindowMinutes: 90,
  },
};

const MAX_COMPLETION_PROOF_PHOTO_COUNT = 5;
const MAX_COMPLETION_PROOF_PHOTO_BYTES = 600 * 1024;
const BASE64_DATA_URL_PREFIX = /^data:[^;]+;base64,/i;
const BASE64_PAYLOAD_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const DEFAULT_PLATFORM_QUOTED_FARE: MoneyAmount = {
  currency: PLATFORM_CURRENCY,
  amountMinor: 150000,
};
const DEFAULT_PLATFORM_PRICING_RULE_VERSION = "enterprise_dispatch.default.v1";
const DEFAULT_TENANT_SERVICE_PROGRAM_ID = "tenant-program-enterprise-dispatch";
const DEFAULT_CERTIFICATE_SERVICE_PHONE = "0800-090-000";
const DEFAULT_AUTHORITY_COMPLAINT_PHONE = "1999";
const DRIVER_COMPLETION_OUTBOX_MAX_ATTEMPTS = 5;
const DRIVER_COMPLETION_OUTBOX_LEASE_MS = 60_000;
const DRIVER_COMPLETION_OUTBOX_RETRY_MS = 5_000;
const DRIVER_COMPLETION_OUTBOX_RECOVERY_POLL_MS = 15_000;
const DRIVER_COMPLETION_OUTBOX_RECOVERY_BATCH_SIZE = 25;

// Hard eligibility reasons that must NEVER be re-admitted by the scarcity
// fallback below. Dispatching a vehicle that failed the airport-permit gate to an
// airport-transfer order is a compliance violation, not a graceful degradation:
// a broad business_dispatch candidate must not satisfy an airport-transfer order
// just because no airport-eligible supply is currently available. Other hard
// reasons keep the existing anti-stranding fallback behaviour.
const NON_BYPASSABLE_HARD_REASON_CODES: ReadonlySet<string> = new Set([
  "MISSING_AIRPORT_ELIGIBILITY",
]);

@Injectable()
export class OwnedMobilityService
  implements
    OnModuleInit,
    OnApplicationBootstrap,
    OnModuleDestroy,
    OnApplicationShutdown
{
  private readonly logger = new Logger(OwnedMobilityService.name);

  private orders: OwnedOrderRecord[] = [];

  private dispatchJobs: DispatchJobRecord[] = [];

  private dispatchAttempts: DispatchAttemptRecord[] = [];

  private dispatchAssignments: DispatchAssignmentRecord[] = [];

  private driverTasks: DriverTaskRecord[] = [];

  private dispatchTraceLogs: DispatchTraceLogRecord[] = [];

  private passengerDisclosureSnapshots: PassengerDispatchDisclosureSnapshot[] =
    [];

  private consumerNotificationOutbox: ConsumerNotificationOutboxRecord[] = [];

  private queueEntries: QueueEntryRecord[] = [];

  private profileQueuePolicies: Map<
    RuntimeProfileCode,
    Set<DispatchQueueMode>
  > = new Map([
    ["multi_taxi_direct", new Set(["virtual_matching"])],
    [
      "ordinary_taxi",
      new Set(["virtual_matching", "physical_rank", "taxi_stand"]),
    ],
    [
      "business_dispatch",
      new Set(["virtual_matching", "physical_rank", "taxi_stand"]),
    ],
  ]);

  /** Maps forwarded mirror order IDs to their source platform codes. */
  private forwarderSourceMap = new Map<string, string>();

  private driverCompletionRecoveryTimer: ReturnType<typeof setInterval> | null =
    null;

  private driverCompletionOutboxDrainPromise: Promise<void> | null = null;
  private driverCompletionOutboxDrainRequested = false;
  private driverCompletionOutboxStopping = false;

  private minLeadTimeMinutes = 15;

  getMinLeadTimeMinutes(): number {
    const envVal =
      process.env.SCHEDULED_BOOKING_MIN_LEAD_TIME_MINUTES ??
      process.env.MULTI_TAXI_MIN_LEAD_TIME_MINUTES;
    if (envVal !== undefined && envVal !== "") {
      const parsed = Number(envVal);
      if (!Number.isNaN(parsed) && parsed >= 0) {
        return parsed;
      }
    }
    return this.minLeadTimeMinutes;
  }

  setMinLeadTimeMinutes(minutes: number) {
    this.minLeadTimeMinutes = Math.max(0, minutes);
  }

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
    // NOTE(integration 20260605): the two SVC params below are appended LAST
    // (both @Optional) so the original 7-param positional order is preserved for
    // unit-test harnesses. e2e-svc-013 had inserted vehicleEligibilityService at
    // position 2, which silently shifted every positional arg in ~16 harnesses.
    @Optional()
    private readonly vehicleEligibilityService?: VehicleEligibilityService,
    @Optional()
    private readonly serviceProductService?: ServiceProductService,
    @Optional()
    private readonly eventEmitter?: EventEmitter2,
    @Optional()
    private readonly runtimeEligibilityEvaluator?: RuntimeEligibilityEvaluator,
    @Optional()
    private readonly sandboxFallbackCostPolicyResolver: SandboxFallbackCostPolicyResolverService = new SandboxFallbackCostPolicyResolverService(),
    @Optional()
    @Inject(forwardRef(() => SandboxDispatchGateService))
    private readonly sandboxDispatchGateService?: SandboxDispatchGateService,
    private readonly serviceAreaService?: ServiceAreaService,
    @Optional()
    private readonly fareAnomalyService?: FareAnomalyService,
    @Optional()
    private readonly idempotencyService?: IdempotencyService,
    // Appended LAST (@Optional) for the same reason as the SVC params above:
    // preserves every existing positional-arg unit-test harness.
    @Optional()
    private readonly voiceBookingRepository?: VoiceBookingRepository,
  ) {}

  private _fallbackIdempotencyService?: IdempotencyService;

  getIdempotencyService(): IdempotencyService {
    if (this.idempotencyService) {
      return this.idempotencyService;
    }
    if (!this._fallbackIdempotencyService) {
      this._fallbackIdempotencyService = new IdempotencyService(
        new IdempotencyRepository(),
      );
    }
    return this._fallbackIdempotencyService;
  }

  getDispatchJob(dispatchJobId: string): DispatchJobRecord | null {
    return (
      this.dispatchJobs.find(
        (candidateJob) => candidateJob.dispatchJobId === dispatchJobId,
      ) ?? null
    );
  }

  private callRecordingListenersRegistered = false;

  // Register call-recording listeners here (not in the constructor): with the
  // forwardRef circular dependency on SandboxDispatchGateService, registering
  // cross-service callbacks during construction can bind them to a partially
  // resolved CallcenterService reference whose events never reach the
  // fully-resolved singleton. onModuleInit runs once on the resolved instance.
  // Idempotent so unit tests (which construct directly and may invoke it more
  // than once) do not double-register.
  registerCallRecordingListeners() {
    if (this.callRecordingListenersRegistered) {
      return;
    }
    this.callRecordingListenersRegistered = true;
    this.callcenterService.registerRecordingAttachmentListener((event) =>
      this.handleCallRecordingAttached(event),
    );
    this.callcenterService.registerRecordingStateChangeListener((event) =>
      this.handleCallRecordingStateChanged(event),
    );
  }

  async onModuleInit() {
    this.registerCallRecordingListeners();

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
      this.passengerDisclosureSnapshots =
        persistedState.passengerDisclosureSnapshots.map((snapshot) =>
          this.clonePassengerDisclosureSnapshot(snapshot),
        );
      this.consumerNotificationOutbox =
        persistedState.consumerNotificationOutbox.map((outbox) => ({
          ...outbox,
          payload: { ...outbox.payload },
        }));
      this.queueEntries = this.rebuildQueueEntriesFromTraceLogs(
        this.dispatchTraceLogs,
      );
    } catch (error) {
      this.ownedMobilityRepository.reportPersistenceFailure(
        error,
        "module init",
      );
    }
  }

  async onApplicationBootstrap() {
    this.driverCompletionOutboxStopping = false;
    if (!this.ownedMobilityRepository?.isEnabled()) {
      return;
    }
    this.startDriverCompletionOutboxRecoveryPolling();
    this.triggerDriverCompletionOutboxDispatch();
  }

  async onModuleDestroy() {
    await this.shutdownDrain();
  }

  async onApplicationShutdown() {
    await this.shutdownDrain();
  }

  private async shutdownDrain() {
    this.driverCompletionOutboxStopping = true;
    this.driverCompletionOutboxDrainRequested = false;
    if (this.driverCompletionRecoveryTimer) {
      clearInterval(this.driverCompletionRecoveryTimer);
      this.driverCompletionRecoveryTimer = null;
    }
    const activeDrain = this.driverCompletionOutboxDrainPromise;
    if (activeDrain) {
      await activeDrain;
    }
  }

  createPassengerOrder(
    command: CreateOwnedOrderCommand,
    identity?: BootstrapRequestIdentity | null,
    requestId?: string,
    runtimeProfileCodeHeader?: string,
  ): OwnedOrderRecord;
  createPassengerOrder(
    command: CreateOwnedOrderCommand,
    identity: BootstrapRequestIdentity | null | undefined,
    requestId: string | undefined,
    runtimeProfileCodeHeader: string | undefined,
    idempotencyKeyHeader: string | undefined,
    options?: { required?: boolean },
  ): Promise<OwnedOrderRecord>;
  createPassengerOrder(
    command: CreateOwnedOrderCommand,
    identity?: BootstrapRequestIdentity | null,
    requestId?: string,
    runtimeProfileCodeHeader?: string,
    idempotencyKeyHeader?: string,
    options?: { required?: boolean },
  ): MaybePromise<OwnedOrderRecord>;
  createPassengerOrder(
    command: CreateOwnedOrderCommand,
    identity?: BootstrapRequestIdentity | null,
    requestId?: string,
    runtimeProfileCodeHeader?: string,
    idempotencyKeyHeader?: string,
    options?: { required?: boolean },
  ): MaybePromise<OwnedOrderRecord> {
    const resolvedKey =
      idempotencyKeyHeader?.trim() ||
      command.idempotencyKey?.trim() ||
      undefined;

    if (resolvedKey || options?.required) {
      return this._executePassengerOrderIdempotent(
        command,
        resolvedKey,
        identity,
        requestId,
        runtimeProfileCodeHeader,
        options,
      );
    }

    return this._executeCreatePassengerOrder(
      command,
      identity,
      requestId,
      runtimeProfileCodeHeader,
    );
  }

  private async _executePassengerOrderIdempotent(
    command: CreateOwnedOrderCommand,
    resolvedKey?: string,
    identity?: BootstrapRequestIdentity | null,
    requestId?: string,
    runtimeProfileCodeHeader?: string,
    options?: { required?: boolean },
  ): Promise<OwnedOrderRecord> {
    const scope = "orders:passenger_create";
    const idempotencyService = this.getIdempotencyService();

    const result = await idempotencyService.execute<OwnedOrderRecord>({
      scope,
      idempotencyKey: resolvedKey,
      tenantId: null,
      actorId: identity?.actorId ?? command.passenger?.passengerId ?? null,
      requestPath: "/owned-mobility/orders",
      required: options?.required ?? false,
      payload: {
        ...command,
        ...(command.idempotencyKey ? { idempotencyKey: resolvedKey } : {}),
      },
      execute: async () => {
        const order = this._executeCreatePassengerOrder(
          command,
          identity,
          requestId,
          runtimeProfileCodeHeader,
        );
        return {
          data: order,
          statusCode: 201,
        };
      },
    });

    return result.data;
  }

  private _executeCreatePassengerOrder(
    command: CreateOwnedOrderCommand,
    identity?: BootstrapRequestIdentity | null,
    requestId?: string,
    runtimeProfileCodeHeader?: string,
  ) {
    this.assertRuntimeProfileAllowances(command, runtimeProfileCodeHeader);
    this.assertAddress(command.pickup?.address, "pickup.address");
    this.assertAddress(command.dropoff?.address, "dropoff.address");

    const now = new Date().toISOString();
    const etaSnapshot: EtaSnapshot = {
      etaMinutes: 8,
      calculatedAt: now,
    };
    // CRC-BE-003: attribute referral-channel passenger rides. The handoff
    // session (CRC-BE-002) carries partnerEntrySlug on the identity; stamp it
    // onto the order so owned-mobility → billing-settlement referral settlement
    // (CRC-BE-005) can attribute + revenue-share the ride. Non-referral rides
    // (no partnerEntrySlug on the identity) stay null.
    const partnerEntrySlug = identity?.partnerEntrySlug?.trim() || null;
    const order: OwnedOrderRecord = {
      orderId: randomUUID(),
      orderNo: this.nextOrderNo(),
      orderSource: "app",
      orderDomain: "owned",
      tenantId: null,
      partnerId: identity?.partnerId ?? null,
      partnerProgramId: null,
      partnerEntrySlug,
      eligibilityVerificationId: null,
      issuerAuthorizationRef: null,
      passengerDisclosure: null,
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
      approvalState: "not_required",
      approvalRequestIds: [],
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

    this.applyServiceAreaCreationPolicy(
      order,
      {
        actorId: null,
        actorType: "referral_passenger",
        surface: "passenger_entry",
      },
      requestId,
    );
    this.orders = [this.stampServiceProductCode(order), ...this.orders];
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

  createMultiTaxiRide(
    command: CreateMultiTaxiRideCommand,
    authorization: MultiTaxiOperatingAuthorizationRecord,
    identity?: BootstrapRequestIdentity | null,
    requestId?: string,
    callContext?: MultiTaxiCallContext,
  ): MaybePromise<OwnedOrderRecord> {
    this.assertNoCanonicalMultiTaxiContextOverrides(command);
    this.assertAddress(command.pickup?.address, "pickup.address");
    this.assertAddress(command.dropoff?.address, "dropoff.address");
    const requestedPickupAt = this.requireIsoTimestamp(
      command.requestedPickupAt,
      "requestedPickupAt",
    );
    if (!["on_demand", "scheduled"].includes(command.timingMode)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "MULTI_TAXI_TIMING_MODE_INVALID",
        "timingMode must be on_demand or scheduled.",
      );
    }
    if (command.timingMode === "scheduled") {
      const minLeadTimeMinutes = this.getMinLeadTimeMinutes();
      const minAllowedPickupMs = Date.now() + minLeadTimeMinutes * 60 * 1000;
      const requestedPickupMs = Date.parse(requestedPickupAt);
      if (requestedPickupMs < minAllowedPickupMs) {
        throw new ApiRequestError(
          HttpStatus.BAD_REQUEST,
          "TOO_SOON_TO_BOOK",
          `A scheduled multi-taxi ride requires at least ${minLeadTimeMinutes} minutes advance notice.`,
          {
            requestedPickupAt,
            minLeadTimeMinutes,
            minimumAllowedPickupAt: new Date(minAllowedPickupMs).toISOString(),
          },
        );
      }
    }
    if (callContext && !callContext.callId?.trim()) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "CALL_ID_REQUIRED",
        "Call-center multi-taxi rides require callId.",
      );
    }

    // SD §7.4: "`/call-center/multi-taxi/rides`...同樣依 callId 套用 §7.4
    // fence,不能換入口繞過" -- the callcenter/multi-taxi entry point must not
    // be usable to create a second order for a call a voice intent already
    // owns (or has a pending AI command for).
    if (callContext?.callId && this.voiceBookingRepository?.isEnabled()) {
      return this.assertNoConflictingVoiceIntentForCall(
        callContext.callId,
        "create_multi_taxi_ride",
      ).then(() =>
        this.buildAndPersistMultiTaxiRide(
          command,
          authorization,
          requestedPickupAt,
          identity,
          requestId,
          callContext,
        ),
      );
    }

    return this.buildAndPersistMultiTaxiRide(
      command,
      authorization,
      requestedPickupAt,
      identity,
      requestId,
      callContext,
    );
  }

  private buildAndPersistMultiTaxiRide(
    command: CreateMultiTaxiRideCommand,
    authorization: MultiTaxiOperatingAuthorizationRecord,
    requestedPickupAt: string,
    identity: BootstrapRequestIdentity | null | undefined,
    requestId: string | undefined,
    callContext: MultiTaxiCallContext | undefined,
  ): OwnedOrderRecord {
    const serviceProduct =
      this.serviceProductService?.getRuntimeServiceProductByType(
        "taxi_reservation",
      ) ?? null;
    if (serviceProduct && !serviceProduct.active) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "SERVICE_PRODUCT_INACTIVE",
        "The taxi_reservation service product is not active.",
      );
    }

    const now = new Date().toISOString();
    const scheduled = command.timingMode === "scheduled";
    const reservationWindowEnd = scheduled
      ? new Date(Date.parse(requestedPickupAt) + 30 * 60 * 1000).toISOString()
      : null;
    const order: OwnedOrderRecord = {
      orderId: randomUUID(),
      orderNo: this.nextOrderNo(),
      orderSource: callContext ? "phone" : "app",
      orderDomain: "owned",
      tenantId: null,
      partnerId: identity?.partnerId ?? null,
      partnerProgramId: null,
      partnerEntrySlug: identity?.partnerEntrySlug?.trim() || null,
      eligibilityVerificationId: null,
      issuerAuthorizationRef: null,
      passengerDisclosure: null,
      serviceBucket: "standard_taxi",
      dispatchSemantics: scheduled ? "reservation" : "realtime",
      businessDispatchSubtype: null,
      serviceProductCode: "taxi_reservation",
      runtimeProfileCode: "multi_taxi_direct",
      acquisitionMode: "platform_reserved",
      timingMode: command.timingMode,
      operatingAuthorizationId: authorization.authorizationId,
      queueMode: "virtual_matching",
      paymentMethodTokenRef: command.paymentMethodTokenRef?.trim() || null,
      status: "ready_for_dispatch",
      pickup: { ...command.pickup },
      dropoff: { ...command.dropoff },
      passenger: { ...command.passenger },
      bookingId: scheduled ? `booking-${randomUUID()}` : null,
      bookingType: scheduled ? "oneway" : null,
      etaSnapshot: {
        etaMinutes: scheduled ? 30 : 8,
        calculatedAt: now,
      },
      callId: callContext?.callId.trim() ?? null,
      recordingId: callContext?.recordingId?.trim() || null,
      reservationWindowStart: scheduled ? requestedPickupAt : null,
      reservationWindowEnd,
      recurrenceRule: null,
      modifiableUntil: scheduled
        ? new Date(Date.parse(requestedPickupAt) - 30 * 60 * 1000).toISOString()
        : null,
      cancelableUntil: scheduled
        ? new Date(Date.parse(requestedPickupAt) - 30 * 60 * 1000).toISOString()
        : null,
      bookedBy: null,
      onsiteContact: null,
      costCenter: null,
      vehiclePreference: null,
      benefitReference: null,
      direction: null,
      flightNo: null,
      terminal: null,
      luggageCount: null,
      notes: callContext?.notes?.trim() || null,
      fixedPrice: false,
      quotedFare: null,
      quotedFareSource: null,
      quotedFareRuleVersion: authorization.activeFareVersionId.trim() || null,
      manualFareOverride: null,
      exceptionHold: null,
      proofRequirements: {
        minPhotoCount: 0,
        signoffRequired: false,
        expenseProofRequired: false,
      },
      approvalState: "not_required",
      approvalRequestIds: [],
      complianceFlags: [
        "multi_taxi_operating_authorization_verified",
        "platform_reserved",
      ],
      cancelledAt: null,
      cancelReason: null,
      reservationHoldStatus: scheduled ? "requested" : "none",
      reservationHoldId: scheduled ? randomUUID() : null,
      reservationHoldExpiresAt: scheduled ? reservationWindowEnd : null,
      dispatchAttemptCount: 0,
      lastDispatchFailureReason: null,
      noSupplyEscalation: null,
      dispatchTimeout: null,
      createdAt: now,
      updatedAt: now,
    };

    this.applyServiceAreaCreationPolicy(
      order,
      {
        actorId: identity?.actorId ?? null,
        actorType: callContext ? "ops_user" : "referral_passenger",
        surface: callContext ? "callcenter" : "passenger_entry",
      },
      requestId,
    );
    this.orders = [order, ...this.orders];
    const traceLog = this.appendTrace(
      order.orderId,
      "multi_taxi.order.ready_for_dispatch",
      {
        runtimeProfileCode: order.runtimeProfileCode,
        serviceProductCode: order.serviceProductCode,
        acquisitionMode: order.acquisitionMode,
        timingMode: order.timingMode,
        operatingAuthorizationId: order.operatingAuthorizationId,
      },
    );
    this.persistChanges(
      { orders: [order], dispatchTraceLogs: [traceLog] },
      "create_multi_taxi_ride",
    );
    this.recordAudit(
      {
        actorId: identity?.actorId ?? null,
        actorType: callContext ? "ops_user" : "system",
        tenantId: null,
        moduleName: "order",
        actionName: "create_multi_taxi_direct_order",
        resourceType: "order",
        resourceId: order.orderId,
        newValuesSummary: {
          runtimeProfileCode: order.runtimeProfileCode,
          timingMode: order.timingMode,
          operatingAuthorizationId: order.operatingAuthorizationId,
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

  /**
   * SD §7.4: the "另一電話建單入口" -- must apply the same fence as the voice
   * commit path before creating a brand-new phone order for `command.callId`.
   * Returns synchronously (legacy behavior, relied on by many unit-test
   * harnesses that construct this service without a DB) when
   * `voiceBookingRepository` is absent/disabled; only becomes a `Promise`
   * when durable voice state actually needs to be consulted.
   */
  createCallCenterOrder(
    command: CreateCallCenterOrderCommand,
    requestId?: string,
    runtimeProfileCodeHeader?: string,
    identity?: BootstrapRequestIdentity | null,
  ): MaybePromise<OwnedOrderRecord> {
    this.assertRuntimeProfileAllowances(command, runtimeProfileCodeHeader);
    this.assertAddress(command.pickup?.address, "pickup.address");
    this.assertAddress(command.dropoff?.address, "dropoff.address");
    if (!command.callId?.trim()) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "CALL_ID_REQUIRED",
        "Call center orders require call_id.",
      );
    }

    if (this.voiceBookingRepository?.isEnabled()) {
      return this.assertNoConflictingVoiceIntentForCall(
        command.callId,
        "create_call_center_order",
      ).then(() =>
        this.buildAndPersistCallCenterOrder(command, requestId, identity),
      );
    }

    return this.buildAndPersistCallCenterOrder(command, requestId, identity);
  }

  /**
   * SD §7.4/§7.5: shared fence for every legacy entry point that can create
   * or rebind an order for a `callId` that a voice session may already own.
   * A `bound` outcome means a succeeded AI command already produced an
   * order for this call -- creating another one here would be the exact
   * "第二筆有效 intent order" the SD forbids. A `pending` outcome means an AI
   * command is still being reconciled and must not be raced by a manual
   * create. `none` (no voice session, no intent, or a rejected intent with
   * no order) falls through to existing legacy behavior unchanged.
   */
  private async assertNoConflictingVoiceIntentForCall(
    callId: string,
    context: string,
  ) {
    const outcome = await resolveVoiceOrderFence(
      this.voiceBookingRepository,
      callId,
    );
    if (outcome.kind === "bound") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "VOICE_ORDER_ALREADY_LINKED",
        `Call ${callId} is already linked to an AI-originated order; use the existing order instead of creating a new one.`,
        { callId, orderId: outcome.orderId, context },
      );
    }
    if (outcome.kind === "pending") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "VOICE_ACTION_PENDING",
        `An AI booking command for call ${callId} is still pending reconciliation; wait for it to resolve before creating a manual order.`,
        { callId, intentId: outcome.intentId, context },
      );
    }
  }

  private buildAndPersistCallCenterOrder(
    command: CreateCallCenterOrderCommand,
    requestId: string | undefined,
    identity: BootstrapRequestIdentity | null | undefined,
  ): OwnedOrderRecord {
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
      passengerDisclosure: null,
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
      approvalState: "not_required",
      approvalRequestIds: [],
      complianceFlags: recordingId
        ? ["recording_bound"]
        : ["recording_pending"],
      cancelledAt: null,
      cancelReason: null,
      mapFallbackReview: command.mapFallbackReview?.reasonCode
        ? {
            reasonCode: command.mapFallbackReview.reasonCode,
            providerAvailable: command.mapFallbackReview.providerAvailable,
            providerDegraded: command.mapFallbackReview.providerDegraded,
            providerReasonCode:
              command.mapFallbackReview.providerReasonCode ?? null,
          }
        : null,
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

    this.applyServiceAreaCreationPolicy(
      order,
      {
        actorId: command.agentId,
        actorType: "ops_user",
        surface: "callcenter",
      },
      requestId,
    );
    this.orders = [this.stampServiceProductCode(order), ...this.orders];
    const session = this.callcenterService.linkOrderToCallSession({
      callId: command.callId,
      callType: "booking",
      callerPhone: command.passenger?.phone,
      agentId: command.agentId,
      linkedOrderId: order.orderId,
      recordingId,
    });

    if (session.recordingId) {
      order.recordingId = session.recordingId;
      order.status = "ready_for_dispatch";
      order.complianceFlags = order.complianceFlags.filter(
        (flag) => flag !== "recording_pending",
      );
      this.addComplianceFlag(order, "recording_bound");
      order.updatedAt = now;
    } else {
      order.status = "recording_pending";
      this.addComplianceFlag(order, "recording_pending");
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
        // SD §7.5: "actor 從 authenticated identity 注入,不能採 body.agentId" --
        // command.agentId is retained only as descriptive call-session
        // metadata (who staffed the call, used for spatial-audit/trace
        // attribution above); the actor of record for this mutation is the
        // authenticated caller when one is available.
        actorId: identity?.actorId?.trim() || command.agentId,
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
    void this.opsDispatchEventsService?.publishOrderCreated(
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
    runtimeProfileCodeHeader?: string,
    idempotencyKeyHeader?: string,
    options?: { required?: boolean },
  ): MaybePromise<TenantBookingResult> {
    const resolvedKey =
      idempotencyKeyHeader?.trim() ||
      command.idempotencyKey?.trim() ||
      undefined;

    if (resolvedKey || options?.required) {
      return this._executeTenantBookingIdempotent(
        command,
        tenantId,
        resolvedKey,
        identity,
        requestId,
        runtimeProfileCodeHeader,
        options,
      );
    }

    return this._executeCreateTenantBooking(
      command,
      tenantId,
      identity,
      requestId,
      runtimeProfileCodeHeader,
    );
  }

  private async _executeTenantBookingIdempotent(
    command: CreateTenantBookingCommand,
    tenantId: string,
    resolvedKey?: string,
    identity?: BootstrapRequestIdentity | null,
    requestId?: string,
    runtimeProfileCodeHeader?: string,
    options?: { required?: boolean },
  ): Promise<TenantBookingResult> {
    const scope = `tenant:${tenantId}:booking_create`;
    const idempotencyService = this.getIdempotencyService();

    const result = await idempotencyService.execute<TenantBookingResult>({
      scope,
      idempotencyKey: resolvedKey,
      tenantId,
      actorId:
        identity?.actorId ??
        command.passengerId ??
        command.passenger?.passengerId ??
        null,
      requestPath: "/owned-mobility/tenant/bookings",
      required: options?.required ?? false,
      payload: {
        ...command,
        ...(command.idempotencyKey ? { idempotencyKey: resolvedKey } : {}),
      },
      execute: async () => {
        const bookingResult = await this._executeCreateTenantBooking(
          command,
          tenantId,
          identity,
          requestId,
          runtimeProfileCodeHeader,
        );
        return {
          data: {
            ...bookingResult,
            replayed: false,
          },
          statusCode: 201,
        };
      },
    });

    return {
      ...result.data,
      replayed: result.isReplay,
    };
  }

  private _executeCreateTenantBooking(
    command: CreateTenantBookingCommand,
    tenantId: string,
    identity?: BootstrapRequestIdentity | null,
    requestId?: string,
    runtimeProfileCodeHeader?: string,
  ): MaybePromise<TenantBookingResult> {
    this.assertRuntimeProfileAllowances(command, runtimeProfileCodeHeader);
    this.assertNonBlank(tenantId, "tenantId");
    this.assertTenantChannelCannotSetQuotedFare(command, identity);
    this.assertBookingRules(
      command.businessDispatchSubtype,
      command.direction,
      command.flightNo,
    );
    this.requireActiveBookingServiceProduct(command.businessDispatchSubtype);
    const partnerContext = this.resolvePartnerBookingContext(
      command,
      tenantId,
      identity,
    );
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
    const bookingId = `booking-${randomUUID()}`;
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
      passengerDisclosure: null,
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
      costCenter: this.resolveTenantBookingCostCenter(
        tenantId,
        command.costCenter,
      ),
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
        minPhotoCount: command.minPhotoCount ?? 1,
        signoffRequired: command.signoffRequired ?? false,
        expenseProofRequired: command.expenseProofRequired ?? false,
      },
      approvalState: "not_required",
      approvalRequestIds: [],
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

    this.applyServiceAreaCreationPolicy(
      order,
      this.resolveBookingSpatialAuditContext(order, identity),
      requestId,
    );
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
    const finalizeCreation = (
      previousApprovalState: TenantBookingApprovalState,
      approvalRequest: TenantBookingApprovalRequestRecord | null,
      persistOrderWrite = true,
    ): MaybePromise<TenantBookingResult> => {
      order.approvalRequestIds = approvalRequest
        ? [approvalRequest.approvalRequestId]
        : [];
      this.orders = [this.stampServiceProductCode(order), ...this.orders];
      if (persistOrderWrite) {
        this.persistChanges(
          {
            orders: [order],
            dispatchTraceLogs: [bookingTraceLog, holdTraceLog],
          },
          "create_tenant_booking",
        );
      }
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
            approvalState: order.approvalState,
            approvalRequestIds: order.approvalRequestIds,
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
      this.recordBookingApprovalStateChanged(
        order,
        previousApprovalState,
        requestId,
      );
      void this.publishTenantOrderWebhook(
        order,
        "order.created",
        order.createdAt,
      );
      void this.opsDispatchEventsService?.publishOrderCreated(
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
        replayed: false,
      };
    };

    const previousApprovalState = order.approvalState;
    const governanceSnapshot = this.captureTenantGovernanceSnapshot();
    const applyPassengerDisclosure = () =>
      this.refreshPassengerDisclosureSnapshot(order, false, {
        channel: this.resolvePassengerDisclosureChannel(order, identity),
      });
    const applyGovernance = (tx?: OwnedMobilityQueryExecutor | null) =>
      this.afterMaybePromise(
        this.evaluateTenantBookingGovernance({
          tx: tx ?? null,
          order,
          operation: "create",
          ...(requestId ? { requestId } : {}),
        }),
        (evaluation) => {
          order.approvalState =
            this.resolveApprovalStateFromEvaluation(evaluation);
          return this.createApprovalRequestForOrder({
            tx: tx ?? null,
            order,
            evaluation,
            ...(requestId ? { requestId } : {}),
          });
        },
      );

    if (
      this.ownedMobilityRepository?.isEnabled() &&
      this.tenantPartnerService?.isPersistenceEnabled()
    ) {
      return this.ownedMobilityRepository
        .withTransaction(async (tx) => {
          await applyPassengerDisclosure();
          const approvalRequest = await applyGovernance(tx);
          await this.ownedMobilityRepository!.persistOrderWorkflow(tx, {
            orders: [this.cloneOrder(order)],
            dispatchTraceLogs: [bookingTraceLog, holdTraceLog],
          });
          if (command.passengerDisclosureAcknowledgement) {
            await this.acknowledgePassengerDisclosure(
              tenantId,
              bookingId,
              command.passengerDisclosureAcknowledgement,
              identity,
              requestId,
              {
                order,
                tx,
                refreshDisclosure: false,
              },
            );
          }
          return finalizeCreation(
            previousApprovalState,
            approvalRequest,
            false,
          );
        })
        .catch((error) => {
          // The DB transaction rolls back persisted rows, but the in-memory
          // governance state (quota ledger / approval requests) is mutated
          // eagerly during reservation. Restore the pre-booking snapshot so a
          // rejected booking (e.g. APPROVAL_NO_RESOLVABLE_APPROVERS or a quota
          // hard block) leaves no residue in the in-memory read models.
          this.restoreTenantGovernanceSnapshot(governanceSnapshot);
          throw error;
        });
    }

    return this.withRollback(
      () =>
        this.afterMaybePromise(applyPassengerDisclosure(), () =>
          this.afterMaybePromise(applyGovernance(null), (approvalRequest) => {
            return command.passengerDisclosureAcknowledgement
              ? this.afterMaybePromise(
                  this.acknowledgePassengerDisclosure(
                    tenantId,
                    bookingId,
                    command.passengerDisclosureAcknowledgement,
                    identity,
                    requestId,
                    {
                      order,
                      refreshDisclosure: false,
                    },
                  ),
                  () =>
                    finalizeCreation(previousApprovalState, approvalRequest),
                )
              : finalizeCreation(previousApprovalState, approvalRequest);
          }),
        ),
      () => this.restoreTenantGovernanceSnapshot(governanceSnapshot),
    );
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

  /**
   * SD §8.4: the legacy recording-state callback cannot be applied blindly
   * to a voice-originated order (`order.voiceIntentId` set) -- it must not
   * clear a newer, already-bound recording index, and must never regress a
   * dispatch-committed order back to `recording_pending` (only pre-dispatch
   * demotion is meaningful; a mid-trip recording failure is an evidence
   * exception, not an order-lifecycle rollback). Non-voice orders keep the
   * exact original synchronous behavior (SD §7.4: "非 voice call 保留既有人工
   * 行為").
   */
  handleCallRecordingStateChanged(
    event: CallRecordingStateChangeEvent,
  ): void | Promise<void> {
    const order = this.orders.find((candidateOrder) => {
      return candidateOrder.orderId === event.linkedOrderId;
    });
    if (!order) {
      return;
    }

    if (order.voiceIntentId && this.ownedMobilityRepository?.isEnabled()) {
      // Returned (not just fired) so callers that care -- e.g. tests -- can
      // await completion; existing fire-and-forget callers (the
      // synchronous callcenter listener wiring) simply ignore the return
      // value, and the internal .catch means this never rejects.
      return this.handleVoiceCallRecordingStateChanged(order, event).catch(
        (error) => {
          this.logger.warn(
            `Voice-aware recording state sync failed for order ${order.orderId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        },
      );
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

  private static readonly PRE_DISPATCH_RECORDING_GATE_STATUSES = new Set<
    OwnedOrderRecord["status"]
  >(["created", "recording_pending", "ready_for_dispatch"]);

  /**
   * Voice-aware counterpart of the branch above, CAS-protected through
   * `commitVoiceOrderMutation` (SD §7.5 UoW requirement). A cheap read of
   * the in-memory snapshot decides whether this event can possibly apply
   * before paying for a transaction; the authoritative decision is made
   * again inside `prepare` against the row locked `FOR UPDATE`, so a
   * concurrent writer between the two checks cannot cause an incorrect
   * apply.
   */
  private async handleVoiceCallRecordingStateChanged(
    order: OwnedOrderRecord,
    event: CallRecordingStateChangeEvent,
  ): Promise<void> {
    if (event.recordingState === "ready") {
      return;
    }

    const alreadyHasNewerIndex = (candidate: OwnedOrderRecord) =>
      Boolean(candidate.recordingId) &&
      candidate.complianceFlags.includes("recording_bound");
    const isPastPreDispatch = (candidate: OwnedOrderRecord) =>
      !OwnedMobilityService.PRE_DISPATCH_RECORDING_GATE_STATUSES.has(
        candidate.status,
      );

    if (isPastPreDispatch(order) || alreadyHasNewerIndex(order)) {
      const traceLog = this.appendTrace(
        order.orderId,
        "voice.recording_evidence_exception",
        {
          callId: event.callId,
          recordingState: event.recordingState,
          linkedOrderId: event.linkedOrderId,
          reason: isPastPreDispatch(order)
            ? "order_progressed"
            : "newer_recording_bound",
        },
      );
      this.persistChanges(
        { dispatchTraceLogs: [traceLog] },
        "sync_call_recording_state_voice_exception",
      );
      return;
    }

    const outcome = await this.commitVoiceOrderMutation<
      "applied" | "order_progressed" | "newer_recording_bound"
    >(order.orderId, "callcenter.recording_state_changed", (current) => {
      if (isPastPreDispatch(current)) {
        return { order: current, result: "order_progressed" };
      }
      if (alreadyHasNewerIndex(current)) {
        return { order: current, result: "newer_recording_bound" };
      }
      const next: OwnedOrderRecord = {
        ...current,
        recordingId: null,
        status: "recording_pending",
        complianceFlags: [
          ...current.complianceFlags.filter(
            (flag) =>
              flag !== "recording_bound" &&
              flag !== "recording_pending" &&
              flag !== "recording_missing",
          ),
          event.recordingState === "missing"
            ? "recording_missing"
            : "recording_pending",
        ],
        updatedAt: new Date().toISOString(),
      };
      return { order: next, result: "applied" };
    });

    const traceLog = this.appendTrace(
      order.orderId,
      outcome === "applied"
        ? "callcenter.recording_state_changed"
        : "voice.recording_evidence_exception",
      {
        callId: event.callId,
        recordingState: event.recordingState,
        linkedOrderId: event.linkedOrderId,
        ...(outcome === "applied" ? {} : { reason: outcome }),
      },
    );
    this.persistChanges(
      { dispatchTraceLogs: [traceLog] },
      "sync_call_recording_state_voice",
    );
  }

  listOrders() {
    return this.orders.map((order) => this.cloneOrder(order));
  }

  getOrder(orderId: string, identity?: BootstrapRequestIdentity | null) {
    const order = this.requireOrder(orderId);
    this.assertPartnerOrderIdentity(identity, order);
    return this.cloneOrder(order);
  }

  async resolvePersistedOrder(
    orderId: string,
    identity?: BootstrapRequestIdentity | null,
  ) {
    let order = this.orders.find(
      (candidateOrder) => candidateOrder.orderId === orderId,
    );
    if (this.ownedMobilityRepository?.isEnabled()) {
      const persistedOrder =
        (await this.ownedMobilityRepository.findOrderById(orderId)) ??
        undefined;
      order = this.resolveAuthoritativeOrder(order, persistedOrder);
    }
    if (order) {
      const resolvedOrderId = order.orderId;
      this.orders = [
        this.cloneOrder(order),
        ...this.orders.filter(
          (candidateOrder) => candidateOrder.orderId !== resolvedOrderId,
        ),
      ];
    }
    if (!order) {
      order = this.requireOrder(orderId);
    }
    this.assertPartnerOrderIdentity(identity, order);
    return this.cloneOrder(order);
  }

  getPassengerAssignmentDisclosure(orderId: string) {
    const snapshot = this.findPassengerAssignmentDisclosure(orderId);
    if (!snapshot) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "PASSENGER_DISCLOSURE_NOT_READY",
        "Passenger assignment disclosure is not ready.",
        { orderId },
      );
    }
    return snapshot;
  }

  findPassengerAssignmentDisclosure(orderId: string) {
    const snapshot = this.passengerDisclosureSnapshots.find(
      (candidate) =>
        candidate.orderId === orderId && candidate.supersededAt === null,
    );
    return snapshot ? this.clonePassengerDisclosureSnapshot(snapshot) : null;
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

  getTenantBooking(
    tenantId: string,
    bookingId: string,
    identity?: BootstrapRequestIdentity | null,
  ) {
    this.assertNonBlank(tenantId, "tenantId");
    const order = this.requireBookingOrder(bookingId, tenantId);
    this.assertPartnerOrderIdentity(identity, order);
    return this.mapOrderToBooking(order);
  }

  async resolvePersistedTenantBooking(
    tenantId: string,
    bookingId: string,
    identity?: BootstrapRequestIdentity | null,
  ) {
    this.assertNonBlank(tenantId, "tenantId");
    let order = this.orders.find(
      (candidateOrder) =>
        candidateOrder.bookingId === bookingId &&
        candidateOrder.tenantId === tenantId,
    );
    if (this.ownedMobilityRepository?.isEnabled()) {
      const persistedOrder =
        (await this.ownedMobilityRepository.findOrderByBookingId(
          bookingId,
          tenantId,
        )) ?? undefined;
      order = this.resolveAuthoritativeOrder(order, persistedOrder);
    }
    if (order) {
      const resolvedOrderId = order.orderId;
      this.orders = [
        this.cloneOrder(order),
        ...this.orders.filter(
          (candidateOrder) => candidateOrder.orderId !== resolvedOrderId,
        ),
      ];
    }
    if (!order) {
      order = this.requireBookingOrder(bookingId, tenantId);
    }
    this.assertPartnerOrderIdentity(identity, order);
    return this.mapOrderToBooking(order);
  }

  /**
   * SD §7.5: "不得以 updatedAt 從 DB 與記憶體挑較新者，因為記憶體可能是未持久化
   * 狀態" -- a persisted DB row is always authoritative over the in-memory
   * copy once persistence is enabled, because the in-memory copy may reflect
   * a mutation whose transaction never committed (it can carry a strictly
   * newer `updatedAt` than the last durable write). Only fall back to the
   * in-memory copy when the DB genuinely has no row yet.
   */
  private resolveAuthoritativeOrder(
    localOrder: OwnedOrderRecord | undefined,
    persistedOrder: OwnedOrderRecord | undefined,
  ) {
    return persistedOrder ?? localOrder;
  }

  /**
   * Replaces the in-memory projection for `orderId` with a row that is
   * already durably committed. Only ever called after a transaction commits
   * (SD §7.5: "commit 後再投影...不在交易中呼叫會先改共享 arrays...的舊建單方
   * 法") -- never before, and never on a failed/rolled-back attempt.
   */
  private applyAuthoritativeOrder(order: OwnedOrderRecord) {
    const resolvedOrderId = order.orderId;
    this.orders = [
      this.cloneOrder(order),
      ...this.orders.filter(
        (candidateOrder) => candidateOrder.orderId !== resolvedOrderId,
      ),
    ];
  }

  /**
   * Creates a brand-new voice-linked order through the shared PoolClient
   * UoW (SD §7.1/§7.5). Fails closed when durable storage is not
   * configured -- a voice mutation with no DB must be rejected, not
   * silently accepted into memory only, unlike the legacy
   * `persistChanges`/`persistChangesRequired` fallback used by non-voice
   * writers. A collision on `order_id`, or on the partial unique
   * `voice_intent_id`/`call_id` indexes (V0088), surfaces as
   * `VOICE_ORDER_DUPLICATE_LINK` so the caller can replay/look up the
   * existing order instead of creating a second one for the same intent.
   */
  async createVoiceOrder(
    order: OwnedOrderRecord,
    context: string,
  ): Promise<OwnedOrderRecord> {
    const repository = this.requireVoiceCapableRepository(context);
    const aggregateVersion = await repository
      .withTransaction((client) => repository.insertVoiceOrder(client, order))
      .catch((error) => {
        if (error instanceof OwnedOrderDuplicateVoiceLinkError) {
          throw new ApiRequestError(
            HttpStatus.CONFLICT,
            "VOICE_ORDER_DUPLICATE_LINK",
            error.message,
            { orderId: order.orderId },
          );
        }
        throw error;
      });
    const committed: OwnedOrderRecord = { ...order, aggregateVersion };
    this.applyAuthoritativeOrder(committed);
    return this.cloneOrder(committed);
  }

  /**
   * Pure-prepare + CAS transaction for mutating an existing voice-linked
   * order (SD §7.1/§7.5). `prepare` receives the DB-authoritative current
   * order and version, locked `FOR UPDATE` for the lifetime of the
   * transaction, and must be pure: it only computes and returns the next
   * order (and an arbitrary `result`), never mutating `this.orders`,
   * `this.dispatchTraceLogs`, an event emitter, or the audit sink.
   *
   * Those side effects belong in the caller, applied only after this method
   * resolves -- i.e. only after the CAS write has durably committed. A
   * transaction that fails for any reason (stale `aggregateVersion`, a
   * rejected precondition thrown by `prepare`, a dropped DB connection)
   * leaves the in-memory cache, every event, and the audit sink exactly as
   * they were: nothing here mutates shared state ahead of commit.
   *
   * Fails closed when durable storage is not configured, and translates a
   * version conflict into `409 VOICE_ORDER_VERSION_CONFLICT` so two
   * instances racing on the same stale snapshot cannot both "win".
   */
  async commitVoiceOrderMutation<TResult>(
    orderId: string,
    context: string,
    prepare: (
      current: OwnedOrderRecord,
      currentVersion: number,
    ) => { order: OwnedOrderRecord; result: TResult },
  ): Promise<TResult> {
    const repository = this.requireVoiceCapableRepository(context);
    const { order, result } = await repository
      .withTransaction(async (client) => {
        const current = await repository.findOrderForUpdate(client, orderId);
        if (!current) {
          throw new ApiRequestError(
            HttpStatus.NOT_FOUND,
            "OWNED_ORDER_NOT_FOUND",
            `Order ${orderId} was not found.`,
            { orderId, context },
          );
        }
        const prepared = prepare(current.order, current.aggregateVersion);
        const aggregateVersion = await repository.updateOrderWithCas(
          client,
          prepared.order,
          current.aggregateVersion,
        );
        return {
          ...prepared,
          order: { ...prepared.order, aggregateVersion },
        };
      })
      .catch((error) => {
        if (error instanceof OwnedOrderVersionConflictError) {
          throw new ApiRequestError(
            HttpStatus.CONFLICT,
            "VOICE_ORDER_VERSION_CONFLICT",
            error.message,
            { orderId, context },
          );
        }
        throw error;
      });
    this.applyAuthoritativeOrder(order);
    return result;
  }

  private requireVoiceCapableRepository(context: string) {
    if (!this.ownedMobilityRepository?.isEnabled()) {
      throw new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "OWNED_MOBILITY_DB_REQUIRED",
        `Voice order mutation "${context}" requires durable storage; DATABASE_URL is not configured.`,
        { context },
      );
    }
    return this.ownedMobilityRepository;
  }

  async approveTenantBookingApprovalRequest(
    tenantId: string,
    approvalRequestId: string,
    actorUserId: string,
    actorRoleCode: string | null,
    command: ApproveTenantBookingApprovalRequestCommand,
    requestId?: string,
  ) {
    if (!this.tenantPartnerService) {
      throw new ApiRequestError(
        HttpStatus.NOT_IMPLEMENTED,
        "APPROVAL_WORKFLOW_NOT_AVAILABLE",
        "Tenant approval workflow is not available.",
      );
    }

    const request = await this.tenantPartnerService.approveApprovalRequest({
      tenantId,
      approvalRequestId,
      actorUserId,
      actorRoleCode,
      command,
      ...(requestId ? { requestId } : {}),
    });
    this.applyApprovalRequestResolutionToOrder(request, requestId);
    return request;
  }

  async rejectTenantBookingApprovalRequest(
    tenantId: string,
    approvalRequestId: string,
    actorUserId: string,
    actorRoleCode: string | null,
    command: RejectTenantBookingApprovalRequestCommand,
    requestId?: string,
  ) {
    if (!this.tenantPartnerService) {
      throw new ApiRequestError(
        HttpStatus.NOT_IMPLEMENTED,
        "APPROVAL_WORKFLOW_NOT_AVAILABLE",
        "Tenant approval workflow is not available.",
      );
    }

    const request = await this.tenantPartnerService.rejectApprovalRequest({
      tenantId,
      approvalRequestId,
      actorUserId,
      actorRoleCode,
      command,
      ...(requestId ? { requestId } : {}),
    });
    this.applyApprovalRequestResolutionToOrder(request, requestId);
    return request;
  }

  async escalateTenantBookingApprovalRequest(
    tenantId: string,
    approvalRequestId: string,
    actorUserId: string,
    actorRoleCode: string | null,
    command: EscalateTenantBookingApprovalRequestCommand,
    requestId?: string,
  ) {
    if (!this.tenantPartnerService) {
      throw new ApiRequestError(
        HttpStatus.NOT_IMPLEMENTED,
        "APPROVAL_WORKFLOW_NOT_AVAILABLE",
        "Tenant approval workflow is not available.",
      );
    }

    const request = await this.tenantPartnerService.escalateApprovalRequest({
      tenantId,
      approvalRequestId,
      actorUserId,
      actorRoleCode,
      command,
      ...(requestId ? { requestId } : {}),
    });
    this.applyApprovalRequestResolutionToOrder(request, requestId);
    return request;
  }

  async acknowledgePassengerDisclosure(
    tenantId: string,
    bookingId: string,
    command: RecordPassengerAcknowledgementCommand,
    identity?: BootstrapRequestIdentity | null,
    requestId?: string,
    options?: {
      order?: OwnedOrderRecord;
      tx?: OwnedMobilityQueryExecutor | null;
      refreshDisclosure?: boolean;
    },
  ) {
    this.assertNonBlank(tenantId, "tenantId");
    const order =
      options?.order ?? this.requireBookingOrder(bookingId, tenantId);
    const shouldRefreshDisclosure = options?.refreshDisclosure !== false;
    if (shouldRefreshDisclosure) {
      await this.refreshPassengerDisclosureSnapshot(order, true, {
        channel: this.resolvePassengerDisclosureChannel(order, identity),
      });
    }

    if (!order.passengerDisclosure) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "PASSENGER_DISCLOSURE_POLICY_NOT_CONFIGURED",
        "Passenger disclosure is not configured for this booking.",
        { bookingId, orderId: order.orderId },
      );
    }

    const record =
      await this.sandboxDispatchGateService?.recordPassengerAcknowledgement({
        bookingId,
        orderId: order.orderId,
        disclosure: order.passengerDisclosure,
        command,
        actor: this.resolvePassengerDisclosureAcknowledgementActor(identity),
        ...(options?.tx ? { executor: options.tx } : {}),
      });
    if (!record) {
      throw new ApiRequestError(
        HttpStatus.NOT_IMPLEMENTED,
        "PASSENGER_DISCLOSURE_SERVICE_UNAVAILABLE",
        "Passenger disclosure acknowledgement service is unavailable.",
        { bookingId, orderId: order.orderId },
      );
    }

    order.passengerDisclosure = {
      ...order.passengerDisclosure,
      acknowledgedAt: record.acknowledgedAt,
      acknowledgementRecordId: record.acknowledgementId,
    };
    order.updatedAt = new Date().toISOString();
    const traceLog = this.appendTrace(
      order.orderId,
      "booking.passenger_disclosure_acknowledged",
      {
        bookingId,
        policyId: order.passengerDisclosure.policyId,
        messageCode: order.passengerDisclosure.messageCode,
        acknowledgementRecordId: record.acknowledgementId,
        actorType:
          record.actorType === "passenger"
            ? "referral_passenger"
            : record.actorType,
        actorRef: record.actorRef,
      },
    );
    if (options?.tx && this.ownedMobilityRepository?.isEnabled()) {
      await this.ownedMobilityRepository.persistOrderWorkflow(options.tx, {
        orders: [this.cloneOrder(order)],
        dispatchTraceLogs: [this.cloneTraceLog(traceLog)],
      });
    } else {
      this.persistChanges(
        {
          orders: [order],
          dispatchTraceLogs: [traceLog],
        },
        "acknowledge_passenger_disclosure",
      );
    }
    const auditActorType: AuditLogRecord["actorType"] =
      record.actorType === "passenger"
        ? "referral_passenger"
        : record.actorType;
    this.recordAudit(
      {
        actorId: record.actorRef,
        actorType: auditActorType,
        tenantId: order.tenantId,
        moduleName: "order",
        actionName: "acknowledge_passenger_disclosure",
        resourceType: "booking",
        resourceId: bookingId,
        newValuesSummary: {
          orderId: order.orderId,
          policyId: order.passengerDisclosure.policyId,
          messageCode: order.passengerDisclosure.messageCode,
          acknowledgementRecordId: record.acknowledgementId,
        },
      },
      requestId,
    );
    return this.mapOrderToBooking(order);
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
    const originalOrder = this.cloneOrder(order);
    const governanceSnapshot = this.captureTenantGovernanceSnapshot();
    this.assertBookingModifiable(order);
    const previousApprovalState = order.approvalState;
    const previousApprovalSnapshot =
      this.buildTenantBookingApprovalInputSnapshot(order);

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
    this.requireActiveBookingServiceProduct(businessDispatchSubtype);

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
        : this.resolveTenantBookingCostCenter(tenantId, command.costCenter);
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

    const nextApprovalSnapshot =
      this.buildTenantBookingApprovalInputSnapshot(order);
    const needsApprovalReevaluation =
      this.tenantPartnerService?.needsApprovalReevaluation(
        previousApprovalSnapshot,
        nextApprovalSnapshot,
      ) ?? false;

    order.updatedAt = new Date().toISOString();
    const traceLog = this.appendTrace(order.orderId, "booking.updated", {
      bookingId,
      businessDispatchSubtype,
      reservationWindowStart: order.reservationWindowStart,
      reservationWindowEnd: order.reservationWindowEnd,
    });
    const finalizeUpdate = (persistOrderWrite = true) => {
      if (persistOrderWrite) {
        this.persistChanges(
          {
            orders: [order],
            dispatchTraceLogs: [traceLog],
          },
          "update_tenant_booking",
        );
      }
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
            approvalState: order.approvalState,
            approvalRequestIds: order.approvalRequestIds,
          },
        },
        requestId,
      );
      this.recordBookingApprovalStateChanged(
        order,
        previousApprovalState,
        requestId,
      );
      return this.mapOrderToBooking(order);
    };

    if (!needsApprovalReevaluation) {
      return finalizeUpdate();
    }

    const applyReevaluation = (tx?: OwnedMobilityQueryExecutor | null) =>
      this.afterMaybePromise(
        this.evaluateTenantBookingGovernance({
          tx: tx ?? null,
          order,
          operation: "update",
          ...(requestId ? { requestId } : {}),
        }),
        (evaluation) => {
          order.approvalState =
            this.resolveApprovalStateFromEvaluation(evaluation);
          return this.afterMaybePromise(
            this.cancelApprovalRequestsForReevaluation({
              tx: tx ?? null,
              order,
              ...(requestId ? { requestId } : {}),
            }),
            () =>
              this.afterMaybePromise(
                this.createApprovalRequestForOrder({
                  tx: tx ?? null,
                  order,
                  evaluation,
                  ...(requestId ? { requestId } : {}),
                }),
                (approvalRequest) => {
                  order.approvalRequestIds = approvalRequest
                    ? [approvalRequest.approvalRequestId]
                    : [];
                  return approvalRequest;
                },
              ),
          );
        },
      );

    if (
      this.ownedMobilityRepository?.isEnabled() &&
      this.tenantPartnerService?.isPersistenceEnabled()
    ) {
      return this.withRollback(
        () =>
          this.ownedMobilityRepository!.withTransaction(async (tx) => {
            await applyReevaluation(tx);
            await this.ownedMobilityRepository!.persistOrderWorkflow(tx, {
              orders: [this.cloneOrder(order)],
              dispatchTraceLogs: [traceLog],
            });
            return finalizeUpdate(false);
          }),
        () => {
          this.restoreTenantGovernanceSnapshot(governanceSnapshot);
          this.restoreOrderSnapshot(originalOrder);
        },
      );
    }

    return this.withRollback(
      () =>
        this.afterMaybePromise(applyReevaluation(null), () => finalizeUpdate()),
      () => {
        this.restoreTenantGovernanceSnapshot(governanceSnapshot);
        this.restoreOrderSnapshot(originalOrder);
      },
    );
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
    idempotencyKeyHeader?: string,
    options?: { required?: boolean },
  ): MaybePromise<any> {
    const resolvedKey =
      idempotencyKeyHeader?.trim() ||
      command.idempotencyKey?.trim() ||
      undefined;

    if (resolvedKey || options?.required) {
      return this._executeDispatchOrderIdempotent(
        orderId,
        command,
        resolvedKey,
        requestId,
        options,
      );
    }

    return this._executeDispatchOrder(orderId, command, requestId);
  }

  private async _executeDispatchOrderIdempotent(
    orderId: string,
    command: DispatchOrderCommand,
    resolvedKey?: string,
    requestId?: string,
    options?: { required?: boolean },
  ): Promise<any> {
    const order = this.requireOrder(orderId);
    const scope = `dispatch:order:${orderId}:assign`;
    const idempotencyService = this.getIdempotencyService();

    const result = await idempotencyService.execute<any>({
      scope,
      idempotencyKey: resolvedKey,
      tenantId: order.tenantId,
      actorId: null,
      requestPath: `/owned-mobility/orders/${orderId}/dispatch`,
      required: options?.required ?? false,
      payload: {
        ...command,
        ...(command.idempotencyKey ? { idempotencyKey: resolvedKey } : {}),
      },
      execute: async () => {
        const res = this._executeDispatchOrder(orderId, command, requestId);
        return {
          data: res,
          statusCode: 200,
        };
      },
    });

    return result.data;
  }

  private _executeDispatchOrder(
    orderId: string,
    command: DispatchOrderCommand,
    requestId?: string,
  ) {
    const order = this.requireOrder(orderId);
    if (
      order.bookingId &&
      ["pending", "blocked", "rejected"].includes(order.approvalState)
    ) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "BOOKING_APPROVAL_PENDING",
        "Booking cannot dispatch until tenant approval is resolved.",
        {
          orderId,
          bookingId: order.bookingId,
          approvalState: order.approvalState,
        },
      );
    }
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
    this.assertDispatchComplianceGatesClear(order);
    const candidates = this.listEligibleDispatchCandidates(order);
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
    idempotencyKeyHeader?: string,
    options?: { required?: boolean },
  ): MaybePromise<any> {
    const resolvedKey =
      idempotencyKeyHeader?.trim() ||
      command.idempotencyKey?.trim() ||
      undefined;

    if (resolvedKey || options?.required) {
      return this._executeRedispatchOrderIdempotent(
        orderId,
        command,
        resolvedKey,
        requestId,
        options,
      );
    }

    return this._executeRedispatchOrder(orderId, command, requestId);
  }

  private async _executeRedispatchOrderIdempotent(
    orderId: string,
    command: RedispatchOrderCommand,
    resolvedKey?: string,
    requestId?: string,
    options?: { required?: boolean },
  ): Promise<any> {
    const order = this.requireOrder(orderId);
    const scope = `dispatch:order:${orderId}:assign`;
    const idempotencyService = this.getIdempotencyService();

    const result = await idempotencyService.execute<any>({
      scope,
      idempotencyKey: resolvedKey,
      tenantId: order.tenantId,
      actorId: null,
      requestPath: `/owned-mobility/orders/${orderId}/redispatch`,
      required: options?.required ?? false,
      payload: {
        ...command,
        ...(command.idempotencyKey ? { idempotencyKey: resolvedKey } : {}),
      },
      execute: async () => {
        const res = await this._executeRedispatchOrder(
          orderId,
          command,
          requestId,
        );
        return {
          data: res,
          statusCode: 200,
        };
      },
    });

    return result.data;
  }

  private _executeRedispatchOrder(
    orderId: string,
    command: RedispatchOrderCommand,
    requestId?: string,
  ): MaybePromise<any> {
    if (!command.reasonCode?.trim()) {
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
    const latestAssignment = this.dispatchAssignments.find(
      (assignment) =>
        assignment.orderId === orderId &&
        ["assigned", "accepted"].includes(assignment.status),
    );

    // Version-safe redispatch. The guard runs before any mutation below so a
    // rejected stale event leaves the order completely untouched.
    const currentAssignmentVersion = this.currentAssignmentVersion(orderId);
    if (
      command.expectedAssignmentVersion !== undefined &&
      command.expectedAssignmentVersion !== null &&
      currentAssignmentVersion > command.expectedAssignmentVersion
    ) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "STALE_REDISPATCH_EVENT",
        "The redispatch request is stale and cannot replace a newer assignment.",
        {
          orderId,
          currentAssignmentVersion,
          expectedAssignmentVersion: command.expectedAssignmentVersion,
        },
      );
    }

    const now = new Date().toISOString();

    const proceed = (
      closedPrevious: {
        assignment: DispatchAssignmentRecord;
        task: DriverTaskRecord | null;
      } | null,
    ): MaybePromise<any> => {
      order.status = "redispatch_required";
      order.dispatchAttemptCount += 1;
      order.lastDispatchFailureReason = command.reasonCode;
      order.updatedAt = now;

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

      const traceLog = this.appendTrace(
        orderId,
        "dispatch.redispatch_required",
        {
          reasonCode: command.reasonCode,
          reasonNote: command.reasonNote ?? null,
          operatorId: command.operatorId ?? null,
          escalationTarget: command.escalationTarget ?? null,
          attemptCount: order.dispatchAttemptCount,
        },
      );
      this.persistChanges(
        {
          orders: [order],
          // Already durably persisted atomically by closeSupersededDispatchAssignment
          // above when closedPrevious is set; re-including it here would just be a
          // redundant (harmless, but pointless) re-upsert of identical values.
          ...(latestAssignment && !closedPrevious
            ? { dispatchAssignments: [latestAssignment] }
            : {}),
          ...(latestTask && !closedPrevious
            ? { driverTasks: [latestTask] }
            : {}),
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
    };

    if (latestAssignment && this.ownedMobilityRepository?.isEnabled()) {
      // SD §7.6: close the current assignment (and release its reservation)
      // atomically in one transaction, before mutating any in-memory state
      // or reading it into the audit/event payloads below -- redispatch
      // closes the current assignment before the subsequent `dispatchOrder`
      // call tries to reserve a (possibly identical) driver/vehicle for the
      // next attempt, and a crash between closing and releasing can never
      // leave the old assignment still active with its reservation already
      // gone. A `null` result means the row was already closed by something
      // else (accept, reject/cancel, a confirmed timeout) since this
      // in-memory snapshot was read, so the redispatch must not proceed as
      // if it still owned that offer.
      return this.afterMaybePromise(
        this.ownedMobilityRepository.withTransaction((tx) =>
          this.closeSupersededDispatchAssignment(
            tx,
            latestAssignment.assignmentId,
            now,
          ),
        ),
        (closedPrevious) => {
          if (!closedPrevious) {
            throw new ApiRequestError(
              HttpStatus.CONFLICT,
              "REDISPATCH_ASSIGNMENT_ALREADY_CLOSED",
              "The assignment being redispatched was already closed by another operation.",
              {
                orderId,
                assignmentId: latestAssignment.assignmentId,
              },
            );
          }
          return proceed(closedPrevious);
        },
      );
    }

    return proceed(null);
  }

  resolveExceptionHold(
    orderId: string,
    command: ResolveExceptionHoldCommand,
    identity?: BootstrapRequestIdentity | null,
    requestId?: string,
  ): MaybePromise<OwnedOrderRecord> {
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
      void this.publishTenantOrderWebhook(order, "order.cancelled", now, {
        cancelledAt: order.cancelledAt,
        cancelReason: order.cancelReason,
      });
      void this.publishLatestDispatchJobUpdate(orderId, requestId);
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

  requestExceptionOverride(
    orderId: string,
    command: RequestExceptionOverrideCommand,
    identity?: BootstrapRequestIdentity | null,
    requestId?: string,
  ) {
    const order = this.requireOrder(orderId);
    const actor = this.requireExceptionHoldActor(identity, command.operatorId);
    const reason = this.requireNonBlankText(command.reason, "reason");

    if (order.status !== "exception_hold") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "ORDER_NOT_IN_EXCEPTION_HOLD",
        "Order is not in exception hold state.",
        { orderId, status: order.status },
      );
    }

    if (!order.exceptionHold) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "EXCEPTION_HOLD_RECORD_MISSING",
        "Exception hold record is missing.",
        { orderId },
      );
    }

    const existingRequest = order.exceptionHold.overrideRequest;
    if (existingRequest && existingRequest.status === "pending_approval") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "OVERRIDE_REQUEST_ALREADY_PENDING",
        "An override request is already pending approval for this order.",
        { orderId, overrideRequestId: existingRequest.overrideRequestId },
      );
    }

    const now = new Date().toISOString();
    const expiresInMinutes = command.expiresInMinutes ?? 30;
    const expiresAt = new Date(
      Date.now() + expiresInMinutes * 60_000,
    ).toISOString();

    const overrideRequest: OverrideRequestRecord = {
      overrideRequestId: `ovr-${randomUUID()}`,
      orderId,
      overrideType: command.overrideType,
      status: "pending_approval",
      requestedBy: {
        actorType: actor.actorType,
        actorId: actor.actorId,
      },
      reason,
      requestedAt: now,
      expiresAt,
      approval: null,
      rejection: null,
      expiredAt: null,
    };

    order.exceptionHold.overrideRequest = overrideRequest;
    order.updatedAt = now;

    const traceLog = this.appendTrace(
      orderId,
      "exception_hold.override_requested",
      {
        overrideRequestId: overrideRequest.overrideRequestId,
        overrideType: command.overrideType,
        actorId: actor.actorId,
        actorType: actor.actorType,
        reason,
        expiresAt,
      },
    );
    this.persistChanges(
      { orders: [order], dispatchTraceLogs: [traceLog] },
      "request_exception_override",
    );
    this.recordAudit(
      {
        actorId: actor.actorId,
        actorType: actor.actorType,
        tenantId: order.tenantId,
        moduleName: "dispatch",
        actionName: "request_exception_override",
        resourceType: "order",
        resourceId: orderId,
        newValuesSummary: {
          overrideRequestId: overrideRequest.overrideRequestId,
          overrideType: command.overrideType,
          reason,
          expiresAt,
        },
      },
      requestId,
    );
    this.publishOrderUpdate(order, requestId);

    return this.cloneOrder(order);
  }

  approveExceptionOverride(
    orderId: string,
    command: ApproveExceptionOverrideCommand,
    identity?: BootstrapRequestIdentity | null,
    requestId?: string,
  ) {
    const order = this.requireOrder(orderId);
    const actor = this.requireExceptionHoldActor(identity, command.operatorId);
    const approvalNote = this.requireNonBlankText(
      command.approvalNote,
      "approvalNote",
    );

    if (order.status !== "exception_hold") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "ORDER_NOT_IN_EXCEPTION_HOLD",
        "Order is not in exception hold state.",
        { orderId, status: order.status },
      );
    }

    if (!order.exceptionHold?.overrideRequest) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "NO_OVERRIDE_REQUEST_PENDING",
        "No override request is pending for this order.",
        { orderId },
      );
    }

    const overrideRequest = order.exceptionHold.overrideRequest;
    if (overrideRequest.status !== "pending_approval") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "OVERRIDE_REQUEST_NOT_PENDING",
        "Override request is not in pending_approval state.",
        { orderId, status: overrideRequest.status },
      );
    }

    const now = new Date().toISOString();

    if (now > overrideRequest.expiresAt) {
      overrideRequest.status = "expired";
      overrideRequest.expiredAt = now;
      order.updatedAt = now;
      const expireTrace = this.appendTrace(
        orderId,
        "exception_hold.override_expired",
        {
          overrideRequestId: overrideRequest.overrideRequestId,
        },
      );
      this.persistChanges(
        { orders: [order], dispatchTraceLogs: [expireTrace] },
        "expire_exception_override",
      );
      this.recordAudit(
        {
          actorId: actor.actorId,
          actorType: actor.actorType,
          tenantId: order.tenantId,
          moduleName: "dispatch",
          actionName: "expire_exception_override",
          resourceType: "order",
          resourceId: orderId,
          newValuesSummary: {
            overrideRequestId: overrideRequest.overrideRequestId,
            overrideType: overrideRequest.overrideType,
            expiresAt: overrideRequest.expiresAt,
            requestedBy: overrideRequest.requestedBy.actorId,
          },
        },
        requestId,
      );
      this.publishOrderUpdate(order, requestId);
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "OVERRIDE_REQUEST_EXPIRED",
        "Override request has expired and can no longer be approved.",
        {
          orderId,
          overrideRequestId: overrideRequest.overrideRequestId,
          expiresAt: overrideRequest.expiresAt,
        },
      );
    }

    if (overrideRequest.requestedBy.actorId === actor.actorId) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "OVERRIDE_SELF_APPROVAL_FORBIDDEN",
        "The same actor who requested the override cannot approve it.",
        { orderId, actorId: actor.actorId },
      );
    }

    overrideRequest.status = "approved";
    overrideRequest.approval = {
      actorType: actor.actorType,
      actorId: actor.actorId,
      approvalNote,
      approvedAt: now,
    };
    order.updatedAt = now;

    const traceLog = this.appendTrace(
      orderId,
      "exception_hold.override_approved",
      {
        overrideRequestId: overrideRequest.overrideRequestId,
        overrideType: overrideRequest.overrideType,
        approverActorId: actor.actorId,
        approverActorType: actor.actorType,
        approvalNote,
      },
    );

    const resolveCommand: ResolveExceptionHoldCommand = {
      resolution: overrideRequest.overrideType,
      reason: `Override approved: ${overrideRequest.reason} — ${approvalNote}`,
      traceId: overrideRequest.overrideRequestId,
    };

    this.persistChanges(
      { orders: [order], dispatchTraceLogs: [traceLog] },
      "approve_exception_override",
    );
    this.recordAudit(
      {
        actorId: actor.actorId,
        actorType: actor.actorType,
        tenantId: order.tenantId,
        moduleName: "dispatch",
        actionName: "approve_exception_override",
        resourceType: "order",
        resourceId: orderId,
        newValuesSummary: {
          overrideRequestId: overrideRequest.overrideRequestId,
          overrideType: overrideRequest.overrideType,
          approvalNote,
          requestedBy: overrideRequest.requestedBy.actorId,
        },
      },
      requestId,
    );

    return this.resolveExceptionHold(
      orderId,
      resolveCommand,
      identity,
      requestId,
    );
  }

  rejectExceptionOverride(
    orderId: string,
    command: RejectExceptionOverrideCommand,
    identity?: BootstrapRequestIdentity | null,
    requestId?: string,
  ) {
    const order = this.requireOrder(orderId);
    const actor = this.requireExceptionHoldActor(identity, command.operatorId);
    const rejectionReason = this.requireNonBlankText(
      command.rejectionReason,
      "rejectionReason",
    );

    if (order.status !== "exception_hold") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "ORDER_NOT_IN_EXCEPTION_HOLD",
        "Order is not in exception hold state.",
        { orderId, status: order.status },
      );
    }

    if (!order.exceptionHold?.overrideRequest) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "NO_OVERRIDE_REQUEST_PENDING",
        "No override request is pending for this order.",
        { orderId },
      );
    }

    const overrideRequest = order.exceptionHold.overrideRequest;
    if (overrideRequest.status !== "pending_approval") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "OVERRIDE_REQUEST_NOT_PENDING",
        "Override request is not in pending_approval state.",
        { orderId, status: overrideRequest.status },
      );
    }

    const now = new Date().toISOString();
    overrideRequest.status = "rejected";
    overrideRequest.rejection = {
      actorType: actor.actorType,
      actorId: actor.actorId,
      rejectionReason,
      rejectedAt: now,
    };
    order.updatedAt = now;

    const traceLog = this.appendTrace(
      orderId,
      "exception_hold.override_rejected",
      {
        overrideRequestId: overrideRequest.overrideRequestId,
        overrideType: overrideRequest.overrideType,
        rejectorActorId: actor.actorId,
        rejectorActorType: actor.actorType,
        rejectionReason,
      },
    );
    this.persistChanges(
      { orders: [order], dispatchTraceLogs: [traceLog] },
      "reject_exception_override",
    );
    this.recordAudit(
      {
        actorId: actor.actorId,
        actorType: actor.actorType,
        tenantId: order.tenantId,
        moduleName: "dispatch",
        actionName: "reject_exception_override",
        resourceType: "order",
        resourceId: orderId,
        newValuesSummary: {
          overrideRequestId: overrideRequest.overrideRequestId,
          overrideType: overrideRequest.overrideType,
          rejectionReason,
          requestedBy: overrideRequest.requestedBy.actorId,
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

  async listDispatchCandidates(
    dispatchJobId: string,
    includeIneligible = false,
  ): Promise<DispatchCandidate[]> {
    const dispatchJob = this.requireDispatchJob(dispatchJobId);
    const order = this.requireOrder(dispatchJob.orderId);
    const candidates = await this.listDispatchCandidatesWithEligibility(
      dispatchJob,
      order,
      includeIneligible,
    );
    return candidates.map((candidate) => ({ ...candidate }));
  }

  private buildDispatchJobSnapshot(dispatchJob: DispatchJobRecord) {
    const order = this.orders.find(
      (candidateOrder) => candidateOrder.orderId === dispatchJob.orderId,
    );
    if (!order) {
      return { ...dispatchJob };
    }

    const liveCandidates = this.listEligibleDispatchCandidates(order);

    return {
      ...dispatchJob,
      latestEtaMinutes:
        liveCandidates[0]?.etaMinutes ?? dispatchJob.latestEtaMinutes,
    };
  }

  assignDispatch(
    command: AssignDispatchCommand,
    requestId?: string,
    idempotencyKeyHeader?: string,
    options?: { required?: boolean },
  ): MaybePromise<DispatchAssignmentResult> {
    const resolvedKey =
      idempotencyKeyHeader?.trim() ||
      command.idempotencyKey?.trim() ||
      undefined;

    if (resolvedKey || options?.required) {
      return this._executeAssignDispatchIdempotent(
        command,
        resolvedKey,
        requestId,
        options,
      );
    }

    const dispatchJob = this.requireDispatchJob(command.dispatchJobId);
    const order = this.requireOrder(dispatchJob.orderId);

    return this.createDispatchAssignment(
      dispatchJob,
      order,
      command.vehicleId,
      command.driverId,
      command.sandboxDispatchSnapshot ?? null,
      requestId,
    );
  }

  private async _executeAssignDispatchIdempotent(
    command: AssignDispatchCommand,
    resolvedKey?: string,
    requestId?: string,
    options?: { required?: boolean },
  ): Promise<DispatchAssignmentResult> {
    const dispatchJob = this.requireDispatchJob(command.dispatchJobId);
    const order = this.requireOrder(dispatchJob.orderId);
    const scope = `dispatch:order:${order.orderId}:assign`;
    const idempotencyService = this.getIdempotencyService();

    const result = await idempotencyService.execute<DispatchAssignmentResult>({
      scope,
      idempotencyKey: resolvedKey,
      tenantId: order.tenantId,
      actorId: null,
      requestPath: "/owned-mobility/dispatch/assign",
      required: options?.required ?? false,
      payload: {
        ...command,
        ...(command.idempotencyKey ? { idempotencyKey: resolvedKey } : {}),
      },
      execute: async () => {
        const res = await this.createDispatchAssignment(
          dispatchJob,
          order,
          command.vehicleId,
          command.driverId,
          command.sandboxDispatchSnapshot ?? null,
          requestId,
        );
        return {
          data: res,
          statusCode: 200,
        };
      },
    });

    return result.data;
  }

  reassignDispatch(
    command: ReassignDispatchCommand,
    requestId?: string,
    idempotencyKeyHeader?: string,
    options?: { required?: boolean },
  ): MaybePromise<DispatchAssignmentResult> {
    const resolvedKey =
      idempotencyKeyHeader?.trim() ||
      command.idempotencyKey?.trim() ||
      undefined;

    if (resolvedKey || options?.required) {
      return this._executeReassignDispatchIdempotent(
        command,
        resolvedKey,
        requestId,
        options,
      );
    }

    const dispatchJob = this.requireDispatchJob(command.dispatchJobId);
    const order = this.requireOrder(dispatchJob.orderId);

    return this._executeReassignDispatch(
      dispatchJob,
      order,
      command,
      requestId,
    );
  }

  private async _executeReassignDispatchIdempotent(
    command: ReassignDispatchCommand,
    resolvedKey?: string,
    requestId?: string,
    options?: { required?: boolean },
  ): Promise<DispatchAssignmentResult> {
    const dispatchJob = this.requireDispatchJob(command.dispatchJobId);
    const order = this.requireOrder(dispatchJob.orderId);
    const scope = `dispatch:order:${order.orderId}:assign`;
    const idempotencyService = this.getIdempotencyService();

    const result = await idempotencyService.execute<DispatchAssignmentResult>({
      scope,
      idempotencyKey: resolvedKey,
      tenantId: order.tenantId,
      actorId: null,
      requestPath: "/owned-mobility/dispatch/reassign",
      required: options?.required ?? false,
      payload: {
        ...command,
        ...(command.idempotencyKey ? { idempotencyKey: resolvedKey } : {}),
      },
      execute: async () => {
        const res = await this._executeReassignDispatch(
          dispatchJob,
          order,
          command,
          requestId,
        );
        return {
          data: res,
          statusCode: 200,
        };
      },
    });

    return result.data;
  }

  private _executeReassignDispatch(
    dispatchJob: DispatchJobRecord,
    order: OwnedOrderRecord,
    command: ReassignDispatchCommand,
    requestId?: string,
  ): MaybePromise<DispatchAssignmentResult> {
    if (!command.reasonCode?.trim()) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "REASSIGN_REASON_REQUIRED",
        "Reassign reason is required.",
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
    const reassignAttemptSequence = this.nextAttemptSequence(
      dispatchJob.dispatchJobId,
    );
    const dispatchAttempt: DispatchAttemptRecord = {
      attemptId: randomUUID(),
      dispatchJobId: dispatchJob.dispatchJobId,
      orderId: order.orderId,
      sequence: reassignAttemptSequence,
      outcome: "reassigned",
      reasonCode: command.reasonCode,
      createdAt: now,
    };
    const traceLog = this.buildTraceLog(order.orderId, "dispatch.reassigned", {
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

    return this.afterMaybePromise(
      this.createDispatchAssignment(
        dispatchJob,
        order,
        command.vehicleId,
        command.driverId,
        null,
        requestId,
        {
          dispatchAttemptSequence: reassignAttemptSequence + 1,
          previousAssignmentId: activeAssignment.assignmentId,
        },
      ),
      (result) => {
        activeAssignment.status = "cancelled";
        activeAssignment.updatedAt = now;
        if (activeTask) {
          activeTask.status = "cancelled";
          activeTask.completedAt = now;
        }

        this.dispatchAttempts = [dispatchAttempt, ...this.dispatchAttempts];
        this.dispatchTraceLogs = [traceLog, ...this.dispatchTraceLogs];

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

        return result;
      },
    );
  }

  /**
   * SD §7.6: atomically close one dispatch assignment (and its driver task,
   * if still open) that a reassign/redispatch is superseding -- lock, verify
   * it is still in an open (`assigned`/`accepted`) state, persist the
   * cancellation, and release its shared reservation, all inside the
   * caller's transaction. Returns `null` if the assignment was already
   * terminal by the time this ran (raced closed by an accept, a driver
   * reject/cancel, or a confirmed timeout); callers must treat that as a
   * stale-state conflict rather than silently proceeding, since it means
   * whatever in-memory snapshot triggered this close no longer matches the
   * authoritative row.
   */
  private async closeSupersededDispatchAssignment(
    tx: OwnedMobilityQueryExecutor,
    assignmentId: string,
    now: string,
  ): Promise<{
    assignment: DispatchAssignmentRecord;
    task: DriverTaskRecord | null;
  } | null> {
    const locked =
      await this.ownedMobilityRepository!.lockDispatchAssignmentForUpdate(
        tx,
        assignmentId,
      );
    if (!locked || !["assigned", "accepted"].includes(locked.status)) {
      return null;
    }
    const closedAssignment: DispatchAssignmentRecord = {
      ...locked,
      status: "cancelled",
      updatedAt: now,
    };
    let closedTask: DriverTaskRecord | null = null;
    if (locked.taskId) {
      const lockedTask =
        await this.ownedMobilityRepository!.lockDriverTaskForUpdate(
          tx,
          locked.taskId,
        );
      if (
        lockedTask &&
        !["completed", "cancelled", "rejected"].includes(lockedTask.status)
      ) {
        closedTask = { ...lockedTask, status: "cancelled", completedAt: now };
      }
    }
    await this.ownedMobilityRepository!.persistOrderWorkflow(tx, {
      dispatchAssignments: [closedAssignment],
      ...(closedTask ? { driverTasks: [closedTask] } : {}),
    });
    await this.ownedMobilityRepository!.releaseDispatchResourceReservations(
      assignmentId,
      tx,
    );
    return { assignment: closedAssignment, task: closedTask };
  }

  private createDispatchAssignment(
    dispatchJob: DispatchJobRecord,
    order: OwnedOrderRecord,
    vehicleId: string,
    driverId: string,
    sandboxDispatchSnapshot?: AssignDispatchCommand["sandboxDispatchSnapshot"],
    requestId?: string,
    options?: CreateDispatchAssignmentOptions,
  ): MaybePromise<DispatchAssignmentResult> {
    if (this.ownedMobilityRepository?.isEnabled()) {
      return this.ownedMobilityRepository
        .withTransaction(async (tx) => {
          if (
            order.runtimeProfileCode === "multi_taxi_direct" &&
            order.operatingAuthorizationId
          ) {
            const authorized =
              await this.ownedMobilityRepository!.isActiveMultiTaxiAuthorizedVehicle(
                tx,
                order.operatingAuthorizationId,
                vehicleId,
              );
            if (!authorized) {
              throw new ApiRequestError(
                HttpStatus.CONFLICT,
                "MULTI_TAXI_VEHICLE_NOT_AUTHORIZED",
                "The vehicle is not active on the order operating authorization.",
                {
                  authorizationId: order.operatingAuthorizationId,
                  vehicleId,
                },
              );
            }
          }
          const ratingSummary =
            order.runtimeProfileCode === "multi_taxi_direct"
              ? await this.ownedMobilityRepository!.getOrInitializeDriverRatingSummary(
                  tx,
                  driverId,
                  new Date().toISOString(),
                )
              : null;
          const bundle = await this.buildDispatchAssignmentBundle(
            dispatchJob,
            order,
            vehicleId,
            driverId,
            sandboxDispatchSnapshot,
            options,
            ratingSummary,
          );
          this.assertAssignmentEligibilityRecheck(
            bundle.order,
            dispatchJob.dispatchJobId,
            vehicleId,
            driverId,
          );
          await this.assertSandboxDispatchGate(
            bundle.order,
            dispatchJob.dispatchJobId,
            vehicleId,
            driverId,
            sandboxDispatchSnapshot,
            requestId,
          );
          // SD §7.6: the new assignment row must exist before it can be
          // referenced by `dispatch_resource_reservations.assignment_id`,
          // which is an immediate (non-deferrable) FK against
          // `phase1_dispatch_assignments` (V0087) -- reserving with the new,
          // not-yet-inserted assignment id first would always roll back with
          // a 23503. Insert first, then reserve, in the same transaction.
          await this.ownedMobilityRepository!.persistOrderWorkflow(tx, {
            orders: [this.cloneOrder(bundle.order)],
            dispatchJobs: [{ ...bundle.dispatchJob }],
            dispatchAssignments: [{ ...bundle.assignment }],
            driverTasks: [this.cloneTask(bundle.task)],
            dispatchAttempts: [{ ...bundle.dispatchAttempt }],
            dispatchTraceLogs: bundle.traceLogs.map((traceLog) =>
              this.cloneTraceLog(traceLog),
            ),
            ...(bundle.passengerDisclosureSnapshot
              ? {
                  passengerDisclosureSnapshots: [
                    this.clonePassengerDisclosureSnapshot(
                      bundle.passengerDisclosureSnapshot,
                    ),
                  ],
                }
              : {}),
            ...(bundle.consumerNotificationOutbox
              ? {
                  consumerNotificationOutbox: [
                    {
                      ...bundle.consumerNotificationOutbox,
                      payload: {
                        ...bundle.consumerNotificationOutbox.payload,
                      },
                    },
                  ],
                }
              : {}),
          });
          if (options?.previousAssignmentId) {
            // SD §7.6: atomically close the superseded assignment (and its
            // driver task) and release its reservation in the same
            // transaction that takes the new one, so the old occupation
            // never overlaps or gaps with the new one, and a crash between
            // the two writes can never happen. A `null` result means the
            // old assignment was already closed by something else (accept,
            // reject/cancel, or a confirmed timeout) since the caller last
            // observed it -- that snapshot is stale, so this reassign must
            // not proceed as if it still owned that offer.
            const closedPrevious = await this.closeSupersededDispatchAssignment(
              tx,
              options.previousAssignmentId,
              new Date().toISOString(),
            );
            if (!closedPrevious) {
              throw new ApiRequestError(
                HttpStatus.CONFLICT,
                "SUPERSEDED_ASSIGNMENT_ALREADY_CLOSED",
                "The assignment being replaced was already closed by another operation.",
                {
                  assignmentId: options.previousAssignmentId,
                },
              );
            }
          }
          try {
            await this.ownedMobilityRepository!.reserveDispatchResources(tx, {
              orderId: bundle.order.orderId,
              assignmentId: bundle.assignment.assignmentId,
              driverId,
              vehicleId,
              expiresAt: null,
            });
          } catch (error) {
            if (error instanceof DispatchResourceReservationConflictError) {
              throw new ApiRequestError(
                HttpStatus.CONFLICT,
                "DISPATCH_RESOURCE_RESERVATION_CONFLICT",
                `The ${error.resourceType} is already held or occupied by another dispatch assignment.`,
                {
                  resourceType: error.resourceType,
                  resourceId: error.resourceId,
                },
              );
            }
            throw error;
          }
          return bundle;
        })
        .then(async (bundle) => {
          await this.resolveSuccessfulFareQuoteAnomalies(bundle);
          return this.applyDispatchAssignmentBundle(bundle, requestId, false);
        });
    }

    this.assertAssignmentEligibilityRecheck(
      order,
      dispatchJob.dispatchJobId,
      vehicleId,
      driverId,
    );
    const sandboxGateResult = this.assertSandboxDispatchGate(
      order,
      dispatchJob.dispatchJobId,
      vehicleId,
      driverId,
      sandboxDispatchSnapshot,
      requestId,
    );
    return this.afterMaybePromise(sandboxGateResult, () =>
      this.afterMaybePromise(
        this.buildDispatchAssignmentBundle(
          dispatchJob,
          order,
          vehicleId,
          driverId,
          sandboxDispatchSnapshot,
          options,
        ),
        (bundle) =>
          this.afterMaybePromise(
            this.resolveSuccessfulFareQuoteAnomalies(bundle),
            () => this.applyDispatchAssignmentBundle(bundle, requestId),
          ),
      ),
    );
  }

  async cancelOwnedOrder(
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
        ...(task ? { driverTasks: [task] } : {}),
        dispatchTraceLogs: traceLogs,
      },
      "cancel_owned_order",
    );
    if (assignment) {
      if (this.ownedMobilityRepository?.isEnabled()) {
        // SD §7.6: persist the cancelled assignment and release its shared
        // reservation in the same transaction -- a crash between two
        // separately-committed writes would otherwise strand a
        // held/occupied reservation with no expiry and no path back to
        // "released".
        await this.ownedMobilityRepository.withTransaction(async (tx) => {
          await this.ownedMobilityRepository!.persistOrderWorkflow(tx, {
            dispatchAssignments: [assignment],
          });
          await this.ownedMobilityRepository!.releaseDispatchResourceReservations(
            assignment.assignmentId,
            tx,
          );
        });
      } else {
        this.persistChanges(
          { dispatchAssignments: [assignment] },
          "cancel_owned_order_assignment",
        );
      }
    }
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
    void this.publishTenantOrderWebhook(order, "order.cancelled", now, {
      cancelledAt: order.cancelledAt,
      cancelReason: order.cancelReason,
    });
    if (task) {
      void this.ownedMobilityTaskEventsService.publishTaskCancelled(
        task,
        order,
        requestId,
      );
    }
    void this.publishLatestDispatchJobUpdate(order.orderId, requestId);
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

  setProfileQueuePolicy(
    runtimeProfileCode: RuntimeProfileCode,
    allowedQueueModes: DispatchQueueMode[],
  ) {
    if (runtimeProfileCode === "multi_taxi_direct") {
      const isOnlyVirtual =
        allowedQueueModes.length === 1 &&
        allowedQueueModes[0] === "virtual_matching";
      if (!isOnlyVirtual) {
        throw new ApiRequestError(
          HttpStatus.CONFLICT,
          "MULTI_TAXI_QUEUE_MODE_FORBIDDEN",
          "Multi-taxi direct may use virtual matching but may not use physical-rank or taxi-stand queues.",
          {
            runtimeProfileCode,
            allowedQueueModes,
          },
        );
      }
    }
    this.profileQueuePolicies.set(
      runtimeProfileCode,
      new Set(allowedQueueModes),
    );
  }

  getProfileQueuePolicy(
    runtimeProfileCode: RuntimeProfileCode,
  ): DispatchQueueMode[] {
    const policy = this.profileQueuePolicies.get(runtimeProfileCode);
    return policy ? Array.from(policy) : [];
  }

  listQueueEntries(): DispatchQueueEntryReadRecord[] {
    const registryProjection = this.buildQueueRegistryProjection();
    return this.queueEntries.map((entry) =>
      this.buildQueueEntryReadRecord(entry, registryProjection),
    );
  }

  getQueueEntry(queueEntryId: string): DispatchQueueEntryReadRecord {
    const normalizedQueueEntryId = queueEntryId.trim();
    const queueEntry = this.queueEntries.find(
      (entry) => entry.queueEntryId === normalizedQueueEntryId,
    );
    if (!queueEntry) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "QUEUE_ENTRY_NOT_FOUND",
        "Queue entry was not found.",
        { queueEntryId: normalizedQueueEntryId },
      );
    }

    return this.buildQueueEntryReadRecord(
      queueEntry,
      this.buildQueueRegistryProjection(),
    );
  }

  queueCheckIn(
    command: QueueCheckInCommand,
    requestId?: string,
    runtimeContext?: QueueRuntimeContext,
  ) {
    const context: QueueRuntimeContext = runtimeContext ?? {
      runtimeProfileCode: "ordinary_taxi",
      queueMode: command.queueMode ?? "physical_rank",
      operatingAuthorizationId: null,
    };
    this.assertNonBlank(command.vehicleId, "vehicleId");
    this.assertNonBlank(command.siteId, "siteId");
    this.assertQueueEligibility(command.vehicleId, context);

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
      runtimeProfileCode: context.runtimeProfileCode,
      queueMode: context.queueMode,
      operatingAuthorizationId: context.operatingAuthorizationId,
      status: "checked_in",
      position: this.nextQueuePosition(
        command.siteId,
        context.runtimeProfileCode,
        context.queueMode,
      ),
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
        runtimeProfileCode: queueEntry.runtimeProfileCode,
        queueMode: queueEntry.queueMode,
        operatingAuthorizationId: queueEntry.operatingAuthorizationId,
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

  queueCheckOut(
    command: QueueCheckOutCommand,
    requestId?: string,
    runtimeContext?: QueueRuntimeContext,
  ) {
    const context: QueueRuntimeContext = runtimeContext ?? {
      runtimeProfileCode: "ordinary_taxi",
      queueMode: command.queueMode ?? "physical_rank",
      operatingAuthorizationId: null,
    };
    this.assertNonBlank(command.vehicleId, "vehicleId");
    this.assertNonBlank(command.siteId, "siteId");

    const queueEntry = this.queueEntries.find(
      (entry) =>
        entry.vehicleId === command.vehicleId &&
        entry.siteId === command.siteId &&
        (entry.runtimeProfileCode ?? "ordinary_taxi") ===
          context.runtimeProfileCode &&
        (entry.queueMode ?? "physical_rank") === context.queueMode &&
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

  queueCheckInMultiTaxi(
    command: QueueCheckInCommand,
    authorization: MultiTaxiOperatingAuthorizationRecord,
    requestId?: string,
  ) {
    return this.queueCheckIn(command, requestId, {
      runtimeProfileCode: "multi_taxi_direct",
      queueMode: command.queueMode ?? "virtual_matching",
      operatingAuthorizationId: authorization.authorizationId,
    });
  }

  queueCheckOutMultiTaxi(
    command: QueueCheckOutCommand,
    authorization: MultiTaxiOperatingAuthorizationRecord,
    requestId?: string,
  ) {
    return this.queueCheckOut(command, requestId, {
      runtimeProfileCode: "multi_taxi_direct",
      queueMode: command.queueMode ?? "virtual_matching",
      operatingAuthorizationId: authorization.authorizationId,
    });
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

  getReportingSnapshot(): OwnedMobilityReportingSnapshot {
    return {
      orders: this.listOrders(),
      dispatchJobs: this.dispatchJobs.map((job) => ({ ...job })),
      dispatchAssignments: this.dispatchAssignments.map((assignment) => ({
        ...assignment,
      })),
      driverTasks: this.listDriverTasks(),
      dispatchTraceLogs: this.dispatchTraceLogs.map((traceLog) =>
        this.cloneTraceLog(traceLog),
      ),
    };
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

  private async publishLatestDispatchJobUpdate(
    orderId: string,
    requestId?: string,
  ): Promise<void> {
    const dispatchJob = this.dispatchJobs.find(
      (job) => job.orderId === orderId,
    );
    if (!dispatchJob) {
      return;
    }

    await this.opsDispatchEventsService?.publishDispatchJobUpdated(
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

  /**
   * Refuses a task transition the lifecycle does not allow.
   *
   * Five of the eleven places that set `task.status` checked first and six did
   * not, so the same rule held or did not depending on which endpoint the
   * driver's phone happened to call.
   */
  private assertDriverTaskTransition(
    task: { taskId: string; status: DriverTaskStatus },
    next: DriverTaskStatus,
  ) {
    if (task.status === next) {
      return;
    }
    if (!DRIVER_TASK_TRANSITIONS[task.status].includes(next)) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "DRIVER_TASK_TRANSITION_INVALID",
        `A task that is ${task.status} cannot become ${next}.`,
        {
          taskId: task.taskId,
          from: task.status,
          to: next,
          allowed: [...DRIVER_TASK_TRANSITIONS[task.status]],
        },
      );
    }
  }

  async acceptDriverTask(
    taskId: string,
    command: DriverAcceptTaskCommand,
    requestId?: string,
  ) {
    const task = this.requireTask(taskId);
    const assignment = this.requireAssignment(task.assignmentId);
    const order = this.requireOrder(task.orderId);
    const now = new Date().toISOString();

    if (this.ownedMobilityRepository?.isEnabled()) {
      // SD §7.6: accept must not blind-upsert the in-memory snapshot -- a
      // concurrent timeout/reassign can have already closed this exact
      // assignment (under `closeSupersededDispatchAssignment`'s lock) since
      // this process last read it. Lock assignment then task, in the same
      // fixed order `closeSupersededDispatchAssignment` uses, and re-check
      // both against the authoritative DB row before committing the accept
      // and occupying the reservation, all in one transaction.
      const committed = await this.ownedMobilityRepository.withTransaction(
        async (tx) => {
          const lockedAssignment =
            await this.ownedMobilityRepository!.lockDispatchAssignmentForUpdate(
              tx,
              assignment.assignmentId,
            );
          if (!lockedAssignment || lockedAssignment.status !== "assigned") {
            throw new ApiRequestError(
              HttpStatus.CONFLICT,
              "ASSIGNMENT_NOT_AWAITING_ACCEPTANCE",
              "This offer is no longer awaiting driver acceptance.",
              {
                assignmentId: assignment.assignmentId,
                status: lockedAssignment?.status ?? null,
              },
            );
          }
          const lockedTask =
            await this.ownedMobilityRepository!.lockDriverTaskForUpdate(
              tx,
              taskId,
            );
          if (!lockedTask) {
            throw new ApiRequestError(
              HttpStatus.NOT_FOUND,
              "DRIVER_TASK_NOT_FOUND",
              `Driver task ${taskId} was not found.`,
              { taskId },
            );
          }
          this.assertDriverTaskTransition(lockedTask, "accepted");

          const updatedTask: DriverTaskRecord = {
            ...lockedTask,
            status: "accepted",
            acceptedAt: command.acceptedAt,
          };
          const updatedAssignment: DispatchAssignmentRecord = {
            ...lockedAssignment,
            status: "accepted",
            acceptedAt: command.acceptedAt,
            updatedAt: now,
          };
          const updatedOrder: OwnedOrderRecord = {
            ...order,
            status: "driver_accepted",
            updatedAt: now,
          };
          const traceLog = this.appendTrace(order.orderId, "driver.accepted", {
            taskId,
            assignmentId: assignment.assignmentId,
          });

          await this.ownedMobilityRepository!.persistOrderWorkflow(tx, {
            orders: [updatedOrder],
            dispatchAssignments: [updatedAssignment],
            driverTasks: [updatedTask],
            dispatchTraceLogs: [traceLog],
          });
          // SD §7.6: "accepted 轉 occupied" -- the reservation stops being a
          // soft hold once the driver actually accepts, atomically with the
          // accept write.
          await this.ownedMobilityRepository!.occupyDispatchResourceReservations(
            assignment.assignmentId,
            tx,
          );

          return { updatedTask, updatedAssignment, updatedOrder };
        },
      );

      Object.assign(task, committed.updatedTask);
      Object.assign(assignment, committed.updatedAssignment);
      Object.assign(order, committed.updatedOrder);
    } else {
      this.assertDriverTaskTransition(task, "accepted");
      task.status = "accepted";
      task.acceptedAt = command.acceptedAt;
      assignment.status = "accepted";
      assignment.acceptedAt = command.acceptedAt;
      assignment.updatedAt = now;
      order.status = "driver_accepted";
      order.updatedAt = now;
      const traceLog = this.appendTrace(order.orderId, "driver.accepted", {
        taskId,
        assignmentId: assignment.assignmentId,
      });
      await this.persistChangesRequired(
        {
          orders: [order],
          dispatchAssignments: [assignment],
          driverTasks: [task],
          dispatchTraceLogs: [traceLog],
        },
        "accept_driver_task",
      );
    }
    await this.recordAudit(
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
    await this.ownedMobilityTaskEventsService.publishTaskUpdated(
      task,
      order,
      requestId,
    );
    await this.publishLatestDispatchJobUpdate(order.orderId, requestId);
    return this.cloneTask(task);
  }

  async rejectDriverTask(
    taskId: string,
    command: DriverRejectTaskCommand,
    requestId?: string,
  ) {
    if (!command.reasonCode?.trim()) {
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
    // Built once so the same attempt row is both persisted and pushed into
    // the in-memory cache -- but only after the lock (below) confirms this
    // reject is actually legal, so a stale/superseded reject never leaves a
    // phantom attempt behind in memory that was never durably persisted.
    const buildDispatchAttempt = (): DispatchAttemptRecord => ({
      attemptId: randomUUID(),
      dispatchJobId: task.dispatchJobId,
      orderId: order.orderId,
      sequence: this.nextAttemptSequence(task.dispatchJobId),
      outcome: "rejected",
      reasonCode: command.reasonCode,
      createdAt: now,
    });

    if (this.ownedMobilityRepository?.isEnabled()) {
      // SD §7.6: same authoritative-lock requirement as accept, plus the
      // reject and its reservation release must land in the same
      // transaction -- a crash between a separately-committed reject and a
      // separately-committed release would strand a held/occupied
      // reservation with no expiry and no path back to "released".
      const committed = await this.ownedMobilityRepository.withTransaction(
        async (tx) => {
          const lockedAssignment =
            await this.ownedMobilityRepository!.lockDispatchAssignmentForUpdate(
              tx,
              assignment.assignmentId,
            );
          if (!lockedAssignment || lockedAssignment.status !== "assigned") {
            throw new ApiRequestError(
              HttpStatus.CONFLICT,
              "ASSIGNMENT_NOT_AWAITING_ACCEPTANCE",
              "This offer is no longer awaiting driver acceptance.",
              {
                assignmentId: assignment.assignmentId,
                status: lockedAssignment?.status ?? null,
              },
            );
          }
          const lockedTask =
            await this.ownedMobilityRepository!.lockDriverTaskForUpdate(
              tx,
              taskId,
            );
          if (!lockedTask) {
            throw new ApiRequestError(
              HttpStatus.NOT_FOUND,
              "DRIVER_TASK_NOT_FOUND",
              `Driver task ${taskId} was not found.`,
              { taskId },
            );
          }
          this.assertDriverTaskTransition(lockedTask, "rejected");

          const updatedTask: DriverTaskRecord = {
            ...lockedTask,
            status: "rejected",
          };
          const updatedAssignment: DispatchAssignmentRecord = {
            ...lockedAssignment,
            status: "rejected",
            rejectReasonCode: command.reasonCode,
            rejectedAt: now,
            updatedAt: now,
          };
          const updatedOrder: OwnedOrderRecord = {
            ...order,
            status: "redispatch_required",
            updatedAt: now,
          };
          const dispatchAttempt = buildDispatchAttempt();
          const traceLog = this.appendTrace(order.orderId, "driver.rejected", {
            taskId,
            reasonCode: command.reasonCode,
            reasonNote: command.reasonNote ?? null,
          });

          await this.ownedMobilityRepository!.persistOrderWorkflow(tx, {
            orders: [updatedOrder],
            dispatchAssignments: [updatedAssignment],
            driverTasks: [updatedTask],
            dispatchAttempts: [dispatchAttempt],
            dispatchTraceLogs: [traceLog],
          });
          // SD §7.6: a valid reject releases the shared reservation so
          // another dispatch attempt can pick up the same driver/vehicle,
          // atomically with the reject write.
          await this.ownedMobilityRepository!.releaseDispatchResourceReservations(
            assignment.assignmentId,
            tx,
          );

          return { updatedTask, updatedAssignment, updatedOrder, dispatchAttempt };
        },
      );

      this.dispatchAttempts = [committed.dispatchAttempt, ...this.dispatchAttempts];
      Object.assign(task, committed.updatedTask);
      Object.assign(assignment, committed.updatedAssignment);
      Object.assign(order, committed.updatedOrder);
    } else {
      this.assertDriverTaskTransition(task, "rejected");
      const dispatchAttempt = buildDispatchAttempt();
      this.dispatchAttempts = [dispatchAttempt, ...this.dispatchAttempts];
      task.status = "rejected";
      assignment.status = "rejected";
      assignment.rejectReasonCode = command.reasonCode;
      assignment.rejectedAt = now;
      assignment.updatedAt = now;
      order.status = "redispatch_required";
      order.updatedAt = now;
      const traceLog = this.appendTrace(order.orderId, "driver.rejected", {
        taskId,
        reasonCode: command.reasonCode,
        reasonNote: command.reasonNote ?? null,
      });
      await this.persistChangesRequired(
        {
          orders: [order],
          dispatchAssignments: [assignment],
          driverTasks: [task],
          dispatchAttempts: [dispatchAttempt],
          dispatchTraceLogs: [traceLog],
        },
        "reject_driver_task",
      );
    }
    await this.recordAudit(
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
    await this.ownedMobilityTaskEventsService.publishTaskUpdated(
      task,
      order,
      requestId,
    );
    await this.publishLatestDispatchJobUpdate(order.orderId, requestId);
    return this.cloneTask(task);
  }

  async departDriverTask(
    taskId: string,
    command: DriverDepartTaskCommand,
    requestId?: string,
  ) {
    const task = this.requireTask(taskId);
    const order = this.requireOrder(task.orderId);
    this.assertDriverTaskTransition(task, "enroute_pickup");
    task.status = "enroute_pickup";
    task.departedAt = command.departedAt;
    order.status = "enroute_pickup";
    order.updatedAt = new Date().toISOString();
    const traceLog = this.appendTrace(order.orderId, "driver.departed_pickup", {
      taskId,
      currentLocation: command.currentLocation ?? null,
    });
    await this.persistChangesRequired(
      {
        orders: [order],
        driverTasks: [task],
        dispatchTraceLogs: [traceLog],
      },
      "depart_driver_task",
    );
    await this.recordAudit(
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
    await this.ownedMobilityTaskEventsService.publishTaskUpdated(
      task,
      order,
      requestId,
    );
    await this.publishLatestDispatchJobUpdate(order.orderId, requestId);
    return this.cloneTask(task);
  }

  async arrivedPickup(
    taskId: string,
    command: DriverArrivedPickupCommand,
    requestId?: string,
  ) {
    const task = this.requireTask(taskId);
    const order = this.requireOrder(task.orderId);
    this.assertDriverTaskTransition(task, "arrived_pickup");
    task.status = "arrived_pickup";
    task.arrivedPickupAt = command.arrivedAt;
    order.status = "arrived_pickup";
    order.updatedAt = new Date().toISOString();
    const traceLog = this.appendTrace(order.orderId, "driver.arrived_pickup", {
      taskId,
    });
    await this.persistChangesRequired(
      {
        orders: [order],
        driverTasks: [task],
        dispatchTraceLogs: [traceLog],
      },
      "arrived_pickup",
    );
    await this.recordAudit(
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
    await this.ownedMobilityTaskEventsService.publishTaskUpdated(
      task,
      order,
      requestId,
    );
    await this.publishLatestDispatchJobUpdate(order.orderId, requestId);
    return this.cloneTask(task);
  }

  async startDriverTask(
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
    await this.persistChangesRequired(
      {
        orders: [order],
        driverTasks: [task],
        dispatchTraceLogs: [traceLog],
      },
      "start_driver_task",
    );
    await this.recordAudit(
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
    await this.ownedMobilityTaskEventsService.publishTaskUpdated(
      task,
      order,
      requestId,
    );
    await this.publishLatestDispatchJobUpdate(order.orderId, requestId);
    return this.cloneTask(task);
  }

  async completeDriverTask(
    taskId: string,
    command: DriverCompleteTaskCommand,
    requestId?: string,
  ) {
    const proof = {
      photos: [...(command.proof?.photos ?? [])],
      signatureId: command.proof?.signatureId ?? null,
      expenseItems: [...(command.proof?.expenseItems ?? [])],
    };
    this.assertCompletionProofPhotos(proof.photos);
    const proofHasEvidence = this.hasCompletionProofEvidence(proof);

    if (this.ownedMobilityRepository?.isEnabled()) {
      return this.completeDriverTaskWithDatabase(
        taskId,
        command,
        requestId,
        proof,
        proofHasEvidence,
      );
    }

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
      await this.markDriverTaskProofPending(
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
      await this.markDriverTaskProofPending(
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
      (proof.expenseItems?.length ?? 0) === 0
    ) {
      await this.markDriverTaskProofPending(
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

    const certificateEvent =
      order.runtimeProfileCode === "multi_taxi_direct"
        ? this.buildMultiTaxiCertificateEvent(order, task, command, proof)
        : null;

    const finalizeCompletion = async () => {
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

      const traceLog = this.appendTrace(
        order.orderId,
        "driver.completed_trip",
        {
          taskId,
          assignmentId: assignment.assignmentId,
          completedAt: command.completedAt,
          requestId: requestId ?? null,
        },
      );
      this.persistChanges(
        {
          orders: [order],
          dispatchAssignments: [assignment],
          driverTasks: [task],
          dispatchTraceLogs: [traceLog],
        },
        "complete_driver_task",
      );
      await this.recordAudit(
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
      await this.publishTenantOrderWebhook(order, "order.completed", now, {
        completedAt: command.completedAt,
        taskId,
        assignmentId: assignment.assignmentId,
      });
      await this.publishCompletedTripSettlementEvent(order, task);
      if (certificateEvent) {
        await this.publishMultiTaxiCertificateEvent(certificateEvent);
      }
      await this.ownedMobilityTaskEventsService.publishTaskUpdated(
        task,
        order,
        requestId,
      );
      await this.publishLatestDispatchJobUpdate(order.orderId, requestId);

      return this.cloneTask(task);
    };

    if (
      this.tenantPartnerService &&
      typeof this.tenantPartnerService.consumeTenantQuota === "function" &&
      order.tenantId &&
      order.bookingId
    ) {
      return this.afterMaybePromise(
        this.tenantPartnerService.consumeTenantQuota({
          tenantId: order.tenantId,
          bookingId: order.bookingId,
        }),
        finalizeCompletion,
      );
    }

    return finalizeCompletion();
  }

  private async completeDriverTaskWithDatabase(
    taskId: string,
    command: DriverCompleteTaskCommand,
    requestId: string | undefined,
    proof: Required<Pick<CompletionProofBundle, "photos" | "expenseItems">> & {
      signatureId: string | null;
    },
    proofHasEvidence: boolean,
  ) {
    const result = await this.ownedMobilityRepository!.withTransaction(
      async (tx) => {
        const bundle =
          await this.ownedMobilityRepository!.loadDriverTaskCompletionBundleForUpdate(
            tx,
            taskId,
          );
        if (!bundle) {
          throw new ApiRequestError(
            HttpStatus.NOT_FOUND,
            "DRIVER_TASK_NOT_FOUND",
            "Driver task was not found.",
            { taskId },
          );
        }

        return this.finalizeDriverTaskCompletionInTransaction(tx, {
          bundle,
          command,
          ...(requestId ? { requestId } : {}),
          proof,
          proofHasEvidence,
        });
      },
    );

    if (result.outcome === "replayed") {
      this.applyReplayedDriverTaskCompletionBundle(result.bundle);
      return this.cloneTask(result.bundle.task);
    }

    const committed = result.committed;
    await this.applyCommittedDriverTaskCompletion(committed, requestId);
    this.triggerDriverCompletionOutboxDispatch();
    if (committed.errorToThrow) {
      throw committed.errorToThrow;
    }
    return this.cloneTask(committed.task);
  }

  private async finalizeDriverTaskCompletionInTransaction(
    tx: OwnedMobilityQueryExecutor,
    params: {
      bundle: DriverTaskCompletionBundleRecord;
      command: DriverCompleteTaskCommand;
      requestId?: string;
      proof: Required<
        Pick<CompletionProofBundle, "photos" | "expenseItems">
      > & {
        signatureId: string | null;
      };
      proofHasEvidence: boolean;
    },
  ): Promise<DriverTaskCompletionTransactionResult> {
    const order = this.cloneOrder(params.bundle.order);
    const dispatchJob = { ...params.bundle.dispatchJob };
    const assignment = { ...params.bundle.assignment };
    const task = this.cloneTask(params.bundle.task);

    if (params.requestId) {
      const replayedTask = await this.replayDriverCompletionFromRepository(
        tx,
        task,
        order,
        params.requestId,
      );
      if (replayedTask) {
        return {
          outcome: "replayed",
          bundle: {
            order,
            dispatchJob,
            assignment,
            task: replayedTask,
          },
        };
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

    if (
      order.fixedPrice &&
      params.command.fare &&
      order.quotedFare &&
      params.command.fare.amountMinor !== order.quotedFare.amountMinor
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

    const proofPendingError = this.buildDriverTaskProofPendingError(
      order,
      params.proof,
    );

    if (proofPendingError) {
      const now = new Date().toISOString();
      task.status = "proof_pending";
      task.proof = params.proofHasEvidence ? params.proof : null;
      order.status = "proof_pending";
      order.updatedAt = now;
      assignment.updatedAt = now;

      const traceLog = this.buildTraceLog(
        order.orderId,
        "driver.proof_pending",
        {
          taskId: task.taskId,
          assignmentId: assignment.assignmentId,
          missingItems: this.describeMissingCompletionProof(
            order,
            params.proof,
          ),
          requestId: params.requestId ?? null,
        },
      );

      await this.ownedMobilityRepository!.persistOrderWorkflow(tx, {
        orders: [this.cloneOrder(order)],
        dispatchAssignments: [{ ...assignment }],
        driverTasks: [this.cloneTask(task)],
        dispatchTraceLogs: [this.cloneTraceLog(traceLog)],
      });

      return {
        outcome: "committed",
        committed: {
          order,
          assignment,
          task,
          traceLog,
          quotaConsumption: null,
          outcome: "proof_pending",
          errorToThrow: proofPendingError,
        },
      };
    }

    let quotaConsumption: TenantQuotaConsumptionCommitResult | null = null;

    if (
      this.tenantPartnerService &&
      typeof this.tenantPartnerService.prepareTenantQuotaConsumption ===
        "function" &&
      order.tenantId &&
      order.bookingId
    ) {
      quotaConsumption =
        await this.tenantPartnerService.prepareTenantQuotaConsumption(tx, {
          tenantId: order.tenantId,
          bookingId: order.bookingId,
        });
    }

    const certificateEvent =
      order.runtimeProfileCode === "multi_taxi_direct"
        ? this.buildMultiTaxiCertificateEvent(
            order,
            task,
            params.command,
            params.proof,
          )
        : null;

    const now = new Date().toISOString();
    task.status = "completed";
    task.completedAt = params.command.completedAt;
    task.actualDistanceKm = params.command.actualDistanceKm;
    task.actualDurationSec = params.command.actualDurationSec;
    task.fare = order.fixedPrice
      ? order.quotedFare
      : (params.command.fare ?? null);
    task.proof = params.proofHasEvidence ? params.proof : null;
    assignment.status = "completed";
    assignment.updatedAt = now;
    order.status = "completed";
    order.updatedAt = now;

    const traceLog = this.buildTraceLog(
      order.orderId,
      "driver.completed_trip",
      {
        taskId: task.taskId,
        assignmentId: assignment.assignmentId,
        completedAt: params.command.completedAt,
        requestId: params.requestId ?? null,
      },
    );

    await this.ownedMobilityRepository!.persistOrderWorkflow(tx, {
      orders: [this.cloneOrder(order)],
      dispatchAssignments: [{ ...assignment }],
      driverTasks: [this.cloneTask(task)],
      dispatchTraceLogs: [this.cloneTraceLog(traceLog)],
    });
    // SD §7.6: a valid completion releases the shared reservation, in the
    // same transaction as the completion write.
    await this.ownedMobilityRepository!.releaseDispatchResourceReservations(
      assignment.assignmentId,
      tx,
    );
    await this.persistDriverCompletionOutbox(tx, {
      order,
      dispatchJob,
      assignment,
      task,
      requestId: params.requestId ?? null,
      certificateEvent,
      quotaConsumption,
    });

    return {
      outcome: "committed",
      committed: {
        order,
        assignment,
        task,
        traceLog,
        quotaConsumption,
        outcome: "completed",
        errorToThrow: null,
        certificateEvent,
      },
    };
  }

  private async applyCommittedDriverTaskCompletion(
    committed: DriverTaskCompletionCommitResult,
    requestId?: string,
  ) {
    if (
      committed.quotaConsumption &&
      this.tenantPartnerService &&
      typeof this.tenantPartnerService.applyCommittedQuotaConsumption ===
        "function"
    ) {
      this.tenantPartnerService.applyCommittedQuotaConsumption(
        committed.quotaConsumption,
      );
    }

    this.orders = [
      this.cloneOrder(committed.order),
      ...this.orders.filter(
        (order) => order.orderId !== committed.order.orderId,
      ),
    ];
    this.dispatchAssignments = [
      { ...committed.assignment },
      ...this.dispatchAssignments.filter(
        (assignment) =>
          assignment.assignmentId !== committed.assignment.assignmentId,
      ),
    ];
    this.driverTasks = [
      this.cloneTask(committed.task),
      ...this.driverTasks.filter(
        (task) => task.taskId !== committed.task.taskId,
      ),
    ];
    this.dispatchTraceLogs = [
      this.cloneTraceLog(committed.traceLog),
      ...this.dispatchTraceLogs.filter(
        (traceLog) => traceLog.traceId !== committed.traceLog.traceId,
      ),
    ];

    const now = new Date().toISOString();
    if (
      !this.ownedMobilityRepository ||
      !this.ownedMobilityRepository.isEnabled() ||
      !(
        "claimNextRecoverableDriverCompletionOutbox" in
        this.ownedMobilityRepository
      )
    ) {
      if (committed.outcome === "completed") {
        await this.recordAudit(
          {
            actorId: committed.task.driverId,
            actorType: "ops_user",
            tenantId: null,
            moduleName: "driver-task",
            actionName: "complete_trip",
            resourceType: "driver_task",
            resourceId: committed.task.taskId,
            newValuesSummary: {
              status: committed.task.status,
              completedAt: committed.task.completedAt,
            },
          },
          requestId,
        );
        await this.publishTenantOrderWebhook(
          committed.order,
          "order.completed",
          now,
          {
            completedAt: committed.task.completedAt,
            taskId: committed.task.taskId,
            assignmentId: committed.assignment.assignmentId,
          },
        );
        await this.publishCompletedTripSettlementEvent(
          committed.order,
          committed.task,
        );
        if (committed.certificateEvent) {
          await this.publishMultiTaxiCertificateEvent(
            committed.certificateEvent,
          );
        }
      }
      await this.ownedMobilityTaskEventsService.publishTaskUpdated(
        committed.task,
        committed.order,
        requestId,
      );
      await this.publishLatestDispatchJobUpdate(
        committed.order.orderId,
        requestId,
      );
    }
  }

  private applyReplayedDriverTaskCompletionBundle(
    bundle: DriverTaskCompletionBundleRecord,
  ) {
    this.orders = [
      this.cloneOrder(bundle.order),
      ...this.orders.filter((order) => order.orderId !== bundle.order.orderId),
    ];
    this.dispatchAssignments = [
      { ...bundle.assignment },
      ...this.dispatchAssignments.filter(
        (assignment) =>
          assignment.assignmentId !== bundle.assignment.assignmentId,
      ),
    ];
    this.driverTasks = [
      this.cloneTask(bundle.task),
      ...this.driverTasks.filter((task) => task.taskId !== bundle.task.taskId),
    ];
  }

  private buildMultiTaxiCertificateEvent(
    order: OwnedOrderRecord,
    task: DriverTaskRecord,
    command: DriverCompleteTaskCommand,
    proof: Required<Pick<CompletionProofBundle, "photos" | "expenseItems">> & {
      signatureId: string | null;
    },
  ): OwnedMobilityMultiTaxiTripCompletedEvent {
    const fare = order.fixedPrice ? order.quotedFare : command.fare;
    const plateNo =
      this.regulatoryRegistryService
        .listVehicles()
        .find((vehicle) => vehicle.vehicleId === task.vehicleId)?.plateNo ??
      null;
    if (
      !task.startedAt ||
      !plateNo ||
      !fare ||
      normalisePlatformCurrency(fare.currency) !== PLATFORM_CURRENCY ||
      !Number.isFinite(fare.amountMinor) ||
      fare.amountMinor < 0 ||
      !Number.isFinite(command.actualDistanceKm) ||
      command.actualDistanceKm < 0 ||
      !Number.isFinite(command.actualDurationSec) ||
      command.actualDurationSec < 0
    ) {
      throw new ApiRequestError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "MULTI_TAXI_CERTIFICATE_FIELDS_REQUIRED",
        "A completed multi-taxi trip requires canonical timing, vehicle, distance, duration, and NTD fare fields.",
        {
          orderId: order.orderId,
          taskId: task.taskId,
        },
      );
    }
    const tollMinor = proof.expenseItems
      .filter((item) => item.type.trim().toLowerCase() === "toll")
      .reduce((sum, item) => sum + item.amountMinor, 0);
    return {
      runtimeProfileCode: "multi_taxi_direct",
      orderId: order.orderId,
      tripId: task.taskId,
      plateNo,
      pickupAt: task.startedAt,
      dropoffAt: command.completedAt,
      travelDurationSeconds: command.actualDurationSec,
      routeSummary: `${order.pickup.address} → ${order.dropoff.address}`,
      distanceMeters: Math.round(command.actualDistanceKm * 1000),
      fareMinor: fare.amountMinor,
      tollMinor,
      currency: PLATFORM_CURRENCY,
      consumerServicePhone:
        process.env.MULTI_TAXI_CERTIFICATE_SERVICE_PHONE ??
        DEFAULT_CERTIFICATE_SERVICE_PHONE,
      authorityComplaintPhone:
        process.env.MULTI_TAXI_AUTHORITY_COMPLAINT_PHONE ??
        DEFAULT_AUTHORITY_COMPLAINT_PHONE,
      completedAt: command.completedAt,
    };
  }

  private async publishCompletedTripSettlementEvent(
    order: OwnedOrderRecord,
    task: DriverTaskRecord,
  ): Promise<void> {
    const payload = this.buildCompletedTripSettlementEvent(order, task);
    if (!payload || !this.eventEmitter) {
      return;
    }

    await this.eventEmitter.emitAsync(
      OWNED_MOBILITY_TRIP_COMPLETED_EVENT,
      payload,
    );
  }

  private buildCompletedTripSettlementEvent(
    order: OwnedOrderRecord,
    task: DriverTaskRecord,
    dispatchAssignments: readonly DispatchAssignmentRecord[] = this
      .dispatchAssignments,
    driverTasks: readonly DriverTaskRecord[] = this.driverTasks,
  ): OwnedMobilityTripCompletedEvent | null {
    if (
      !order.tenantId ||
      order.serviceBucket !== "business_dispatch" ||
      !order.businessDispatchSubtype ||
      !task.completedAt
    ) {
      return null;
    }

    const grossEarning = task.fare ??
      order.quotedFare ?? {
        currency: PLATFORM_CURRENCY,
        amountMinor: 0,
      };
    const sandboxFulfillmentSegments = this.buildSandboxFulfillmentSegments(
      order,
      task,
      grossEarning,
      dispatchAssignments,
      driverTasks,
    );
    const sandboxBillingTreatment = this.buildSandboxBillingTreatment(
      order,
      task,
      grossEarning,
      sandboxFulfillmentSegments,
    );
    return {
      tenantId: order.tenantId,
      driverId: task.driverId,
      orderId: order.orderId,
      bookingId: order.bookingId,
      completedAt: task.completedAt,
      grossEarning: { ...grossEarning },
      orderSource: order.orderSource,
      serviceBucket: "business_dispatch",
      businessDispatchSubtype: order.businessDispatchSubtype,
      costCenterCode: order.costCenter,
      riderId: order.passenger.passengerId ?? null,
      partnerId: order.partnerId,
      partnerProgramId: order.partnerProgramId,
      partnerEntrySlug: order.partnerEntrySlug,
      eligibilityVerificationId: order.eligibilityVerificationId,
      issuerAuthorizationRef: order.issuerAuthorizationRef,
      benefitReference: order.benefitReference,
      serviceProduct: order.businessDispatchSubtype,
      tenantServiceProgramId: this.resolveTenantServiceProgramId(order),
      sourcePlatform:
        this.forwarderSourceMap.get(order.orderId) ?? order.orderSource,
      ...(sandboxFulfillmentSegments.length > 0
        ? { sandboxFulfillmentSegments }
        : {}),
      ...(sandboxBillingTreatment ? { sandboxBillingTreatment } : {}),
    };
  }

  private buildSandboxFulfillmentSegments(
    order: OwnedOrderRecord,
    completedTask: DriverTaskRecord,
    grossEarning: MoneyAmount,
    dispatchAssignments: readonly DispatchAssignmentRecord[] = this
      .dispatchAssignments,
    driverTasks: readonly DriverTaskRecord[] = this.driverTasks,
  ): FulfillmentSegmentRecord[] {
    const orderAssignments = dispatchAssignments
      .filter((assignment) => assignment.orderId === order.orderId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    const bookingId = order.bookingId ?? order.orderId;
    const sandboxTripId = order.orderId;

    return orderAssignments.flatMap((assignment, index) => {
      const task = driverTasks.find(
        (candidate) => candidate.assignmentId === assignment.assignmentId,
      );
      const isAvVehicle = this.isSandboxAvVehicle(assignment.vehicleId);
      const taskIsCompleted = task?.taskId === completedTask.taskId;

      if (
        !isAvVehicle &&
        !taskIsCompleted &&
        assignment.status === "cancelled" &&
        task?.status !== "completed"
      ) {
        return [];
      }

      const segmentType = isAvVehicle ? "tesla_av" : "human_taxi";
      const segmentReason = isAvVehicle
        ? taskIsCompleted
          ? "sandbox_av_completed"
          : "sandbox_av_attempt"
        : order.complianceFlags.includes("sandbox_human_fallback")
          ? "roc_human_fallback"
          : "phase1_human_dispatch";
      const segmentCost =
        !isAvVehicle || taskIsCompleted ? { ...grossEarning } : null;

      return [
        {
          fulfillmentSegmentId: `segment-${order.orderId}-${index + 1}`,
          bookingId,
          orderId: order.orderId,
          sandboxTripId,
          segmentType,
          segmentReason,
          startedAt:
            task?.startedAt ??
            task?.acceptedAt ??
            assignment.acceptedAt ??
            assignment.createdAt,
          endedAt:
            task?.completedAt ??
            (assignment.status === "cancelled" ? assignment.updatedAt : null),
          vehicleId: assignment.vehicleId,
          vin: null,
          driverId: assignment.driverId,
          safetyOperatorId: isAvVehicle ? assignment.driverId : null,
          sourcePlatform:
            this.forwarderSourceMap.get(order.orderId) ?? order.orderSource,
          distanceKm: task?.actualDistanceKm ?? null,
          durationSeconds: task?.actualDurationSec ?? null,
          cost: segmentCost,
          evidenceReference: null,
          createdAt: assignment.createdAt,
        },
      ];
    });
  }

  private buildSandboxBillingTreatment(
    order: OwnedOrderRecord,
    completedTask: DriverTaskRecord,
    grossEarning: MoneyAmount,
    fulfillmentSegments: FulfillmentSegmentRecord[],
  ): SandboxBillingTreatmentRecord | null {
    const bookingId = order.bookingId ?? order.orderId;
    const currentTaskIsAv = this.isSandboxAvVehicle(completedTask.vehicleId);
    const previousAvSegment = fulfillmentSegments.find(
      (segment) =>
        segment.segmentType === "tesla_av" &&
        segment.vehicleId !== completedTask.vehicleId,
    );
    const humanFallbackApplied =
      order.complianceFlags.includes("sandbox_human_fallback") ||
      (!currentTaskIsAv && Boolean(previousAvSegment));

    if (!currentTaskIsAv && !humanFallbackApplied) {
      return null;
    }

    const fallbackPolicyResolution = humanFallbackApplied
      ? this.sandboxFallbackCostPolicyResolver.resolveHumanFallbackPolicy(
          order,
          completedTask.completedAt ?? null,
        )
      : null;
    const fallbackCostAbsorber =
      fallbackPolicyResolution?.fallbackCostAbsorber ?? null;
    const fallbackPolicyId = fallbackPolicyResolution?.fallbackPolicyId ?? null;
    const policyResolution =
      fallbackPolicyResolution?.policyResolution ?? "normal_av_no_fallback";
    const treatmentType = humanFallbackApplied
      ? fallbackCostAbsorber === "partner"
        ? "partner_program_adjusted"
        : fallbackCostAbsorber === "tenant_contract"
          ? "tenant_contract_adjusted"
          : "fallback_human"
      : "normal_av";
    const partnerCharge =
      humanFallbackApplied && fallbackCostAbsorber === "partner"
        ? { ...grossEarning }
        : null;
    const tenantCharge =
      humanFallbackApplied && fallbackCostAbsorber === "tenant_contract"
        ? { ...grossEarning }
        : null;
    const platformAbsorbed =
      humanFallbackApplied && fallbackCostAbsorber === "platform"
        ? { ...grossEarning }
        : null;

    return {
      sandboxBillingTreatmentId: `sandbox-billing-${order.orderId}`,
      bookingId,
      orderId: order.orderId,
      sandboxTripId: order.orderId,
      treatmentType,
      fallbackCostAbsorber,
      fallbackPolicyId,
      policyResolution,
      passengerExtraChargeAllowed: false,
      passengerExtraCharge: { currency: PLATFORM_CURRENCY, amountMinor: 0 },
      internalAvCost: currentTaskIsAv ? { ...grossEarning } : null,
      internalHumanFallbackCost: humanFallbackApplied
        ? { ...grossEarning }
        : null,
      partnerCharge,
      tenantCharge,
      platformAbsorbed,
      fallbackSurchargeApplied: false,
      treatmentSnapshot: {
        bookingId,
        orderId: order.orderId,
        fallbackCostAbsorber,
        fallbackPolicyId,
        policyResolution,
        fulfillmentMode: humanFallbackApplied
          ? previousAvSegment
            ? "mixed"
            : "human_fallback"
          : "tesla_av",
        customerFareMinor: grossEarning.amountMinor,
        customerFareCurrency: grossEarning.currency,
      },
      createdAt: completedTask.completedAt ?? new Date().toISOString(),
    };
  }

  private isSandboxAvVehicle(vehicleId: string | null | undefined) {
    return vehicleId?.startsWith("veh-av") ?? false;
  }

  private resolveTenantServiceProgramId(order: OwnedOrderRecord) {
    return order.partnerProgramId ?? DEFAULT_TENANT_SERVICE_PROGRAM_ID;
  }

  private async persistDriverCompletionOutbox(
    tx: OwnedMobilityQueryExecutor,
    input: {
      order: OwnedOrderRecord;
      dispatchJob: DispatchJobRecord;
      assignment: DispatchAssignmentRecord;
      task: DriverTaskRecord;
      requestId: string | null;
      certificateEvent: OwnedMobilityMultiTaxiTripCompletedEvent | null;
      quotaConsumption: TenantQuotaConsumptionCommitResult | null;
    },
  ) {
    const payloads = this.buildDriverCompletionOutboxPayloads(input);
    if (payloads.length === 0) {
      return;
    }
    const createdAt = input.order.updatedAt;
    const records: DriverCompletionOutboxRecord[] = payloads.map((payload) => ({
      outboxId: this.buildDriverCompletionOutboxId(
        input.task.taskId,
        payload.effectType,
      ),
      taskId: input.task.taskId,
      orderId: input.order.orderId,
      effectType: payload.effectType,
      requestId: input.requestId,
      payload: payload as unknown as Record<string, unknown>,
      status: "pending",
      attemptCount: 0,
      nextAttemptAt: createdAt,
      leaseToken: null,
      leasedUntil: null,
      lastError: null,
      createdAt,
      deliveredAt: null,
    }));
    if (this.ownedMobilityRepository?.persistDriverCompletionOutbox) {
      await this.ownedMobilityRepository.persistDriverCompletionOutbox(
        tx,
        records,
      );
    }
  }

  private buildDriverCompletionOutboxPayloads(input: {
    order: OwnedOrderRecord;
    dispatchJob: DispatchJobRecord;
    assignment: DispatchAssignmentRecord;
    task: DriverTaskRecord;
    requestId: string | null;
    certificateEvent: OwnedMobilityMultiTaxiTripCompletedEvent | null;
    quotaConsumption: TenantQuotaConsumptionCommitResult | null;
  }): DriverCompletionOutboxPayload[] {
    const payloads: DriverCompletionOutboxPayload[] = [];
    if (input.order.tenantId) {
      payloads.push({
        effectType: "tenant_order_completed_webhook",
        tenantId: input.order.tenantId,
        payload: this.buildTenantOrderWebhookPayload(
          input.order,
          "order.completed",
          input.order.updatedAt,
          {
            completedAt: input.task.completedAt,
            taskId: input.task.taskId,
            assignmentId: input.assignment.assignmentId,
          },
        ),
      });
    }

    const dispatchAssignments = [
      ...this.dispatchAssignments.filter(
        (assignment) =>
          assignment.assignmentId !== input.assignment.assignmentId,
      ),
      { ...input.assignment },
    ];
    const driverTasks = [
      ...this.driverTasks.filter((task) => task.taskId !== input.task.taskId),
      this.cloneTask(input.task),
    ];
    const tripCompletedEvent = this.buildCompletedTripSettlementEvent(
      input.order,
      input.task,
      dispatchAssignments,
      driverTasks,
    );
    if (tripCompletedEvent) {
      payloads.push({
        effectType: "owned_mobility_trip_completed",
        event: tripCompletedEvent,
      });
    }

    if (input.certificateEvent) {
      payloads.push({
        effectType: "multi_taxi_certificate",
        event: input.certificateEvent,
      });
    }

    const completionAuditOutboxId = this.buildDriverCompletionOutboxId(
      input.task.taskId,
      "completion_audit_bundle",
    );
    const completionAudit: AuditEntryInput = {
      actorId: input.task.driverId,
      actorType: "ops_user",
      tenantId: null,
      moduleName: "driver-task",
      actionName: "complete_trip",
      resourceType: "driver_task",
      resourceId: input.task.taskId,
      newValuesSummary: {
        status: input.task.status,
        completedAt: input.task.completedAt,
      },
    };
    const completionAudits: AuditEntryInput[] = [
      completionAudit,
      ...((input.quotaConsumption?.auditEntries ?? []).map((entry) =>
        structuredClone(entry),
      ) as AuditEntryInput[]),
    ].map((entry, index) => ({
      ...structuredClone(entry),
      auditId: generateDeterministicUuid(
        "driver_completion_outbox_audit",
        `${completionAuditOutboxId}:${index}`,
      ),
    }));

    payloads.push({
      effectType: "completion_audit_bundle",
      audits: completionAudits,
      requestId: input.requestId,
    });

    const driverTaskUpdatedOutboxId = this.buildDriverCompletionOutboxId(
      input.task.taskId,
      "driver_task_updated",
    );
    payloads.push({
      effectType: "driver_task_updated",
      task: this.cloneTask(input.task),
      order: this.cloneOrder(input.order),
      requestId: input.requestId,
      eventId: generateDeterministicUuid(
        "driver_completion_outbox_event",
        `${driverTaskUpdatedOutboxId}:driver_task_updated`,
      ),
      correlationId: generateDeterministicUuid(
        "driver_completion_outbox_correlation",
        driverTaskUpdatedOutboxId,
      ),
    });

    const opsDispatchJobUpdatedOutboxId = this.buildDriverCompletionOutboxId(
      input.task.taskId,
      "ops_dispatch_job_updated",
    );
    payloads.push({
      effectType: "ops_dispatch_job_updated",
      orderId: input.order.orderId,
      dispatchJob: structuredClone(input.dispatchJob),
      requestId: input.requestId,
      eventId: generateDeterministicUuid(
        "driver_completion_outbox_event",
        `${opsDispatchJobUpdatedOutboxId}:ops_dispatch_job_updated`,
      ),
      correlationId: generateDeterministicUuid(
        "driver_completion_outbox_correlation",
        opsDispatchJobUpdatedOutboxId,
      ),
    });

    return payloads;
  }

  private buildDriverCompletionOutboxId(
    taskId: string,
    effectType: DriverCompletionOutboxEffectType,
  ) {
    const digest = createHash("sha256")
      .update(`driver-completion-outbox:${taskId}:${effectType}`)
      .digest("hex")
      .slice(0, 32)
      .split("");
    digest[12] = "5";
    digest[16] = ((parseInt(digest[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
    return [
      digest.slice(0, 8).join(""),
      digest.slice(8, 12).join(""),
      digest.slice(12, 16).join(""),
      digest.slice(16, 20).join(""),
      digest.slice(20, 32).join(""),
    ].join("-");
  }

  private startDriverCompletionOutboxRecoveryPolling() {
    if (
      this.driverCompletionRecoveryTimer ||
      !this.ownedMobilityRepository?.isEnabled() ||
      !(
        "claimNextRecoverableDriverCompletionOutbox" in
        this.ownedMobilityRepository
      )
    ) {
      return;
    }

    this.driverCompletionRecoveryTimer = setInterval(() => {
      this.triggerDriverCompletionOutboxDispatch();
    }, DRIVER_COMPLETION_OUTBOX_RECOVERY_POLL_MS);
    this.driverCompletionRecoveryTimer.unref?.();
  }

  private triggerDriverCompletionOutboxDispatch() {
    if (
      this.driverCompletionOutboxStopping ||
      !this.ownedMobilityRepository?.isEnabled() ||
      !(
        "claimNextRecoverableDriverCompletionOutbox" in
        this.ownedMobilityRepository
      )
    ) {
      return;
    }

    this.driverCompletionOutboxDrainRequested = true;
    if (this.driverCompletionOutboxDrainPromise) {
      return;
    }

    const drain = this.drainDriverCompletionOutbox();
    this.driverCompletionOutboxDrainPromise = drain;
    void drain.finally(() => {
      if (this.driverCompletionOutboxDrainPromise !== drain) {
        return;
      }
      this.driverCompletionOutboxDrainPromise = null;
      if (
        this.driverCompletionOutboxDrainRequested &&
        !this.driverCompletionOutboxStopping
      ) {
        this.triggerDriverCompletionOutboxDispatch();
      }
    });
  }

  private async drainDriverCompletionOutbox() {
    try {
      while (!this.driverCompletionOutboxStopping) {
        this.driverCompletionOutboxDrainRequested = false;
        let claimedCount = 0;
        while (
          claimedCount < DRIVER_COMPLETION_OUTBOX_RECOVERY_BATCH_SIZE &&
          !this.driverCompletionOutboxStopping
        ) {
          const now = new Date();
          const leaseToken = randomUUID();
          const leasedUntil = new Date(
            now.getTime() + DRIVER_COMPLETION_OUTBOX_LEASE_MS,
          ).toISOString();
          const claimed = await this.ownedMobilityRepository!.withTransaction(
            (tx) =>
              this.ownedMobilityRepository!.claimNextRecoverableDriverCompletionOutbox(
                tx,
                leaseToken,
                leasedUntil,
                now.toISOString(),
                DRIVER_COMPLETION_OUTBOX_MAX_ATTEMPTS,
              ),
          );
          if (!claimed) {
            break;
          }
          claimedCount += 1;
          await this.handleClaimedDriverCompletionOutbox(claimed, leaseToken);
        }

        if (this.driverCompletionOutboxStopping) {
          return;
        }
        if (claimedCount === DRIVER_COMPLETION_OUTBOX_RECOVERY_BATCH_SIZE) {
          this.driverCompletionOutboxDrainRequested = true;
          await Promise.resolve();
        }
        if (!this.driverCompletionOutboxDrainRequested) {
          return;
        }
      }
    } catch (error) {
      this.logger.warn(
        `Driver completion outbox drain failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async handleClaimedDriverCompletionOutbox(
    claimed: DriverCompletionOutboxClaimResult,
    leaseToken: string,
  ) {
    if (claimed.action === "dead_letter") {
      // A dead letter is a trip-completion effect that has permanently failed.
      // This used to be a log line and nothing else: no audit record, no
      // operator surface, no endpoint that lists them. A failure recorded
      // somewhere nobody reads is operationally the same as one never recorded,
      // and the thing that failed here is the completion of a real trip.
      //
      // The audit log is the surface that already exists for this: immutable at
      // the database level since V0080, retained 730 days, and queryable by
      // platform and ops through `GET audit-logs`.
      this.logger.warn(
        `Driver completion outbox dead-lettered after lease recovery for ${claimed.record.effectType} on task ${claimed.record.taskId}.`,
      );
      await this.recordAudit({
        actorId: null,
        actorType: "system",
        tenantId: null,
        moduleName: "owned-mobility",
        actionName: "driver_completion_outbox_dead_lettered",
        resourceType: "driver_completion_outbox",
        resourceId: claimed.record.outboxId ?? claimed.record.taskId,
        newValuesSummary: {
          taskId: claimed.record.taskId,
          effectType: claimed.record.effectType,
          attemptCount: claimed.record.attemptCount ?? null,
          status: "dead_letter",
        },
      });
      return;
    }

    await this.dispatchClaimedDriverCompletionOutbox(
      claimed.record,
      leaseToken,
    );
  }

  private async dispatchClaimedDriverCompletionOutbox(
    claimed: DriverCompletionOutboxRecord,
    leaseToken: string,
  ) {
    try {
      await this.executeDriverCompletionOutboxEffect(claimed);
      const delivered = await this.ownedMobilityRepository!.withTransaction(
        (tx) =>
          this.ownedMobilityRepository!.markDriverCompletionOutboxDelivered(
            tx,
            claimed.outboxId,
            leaseToken,
            new Date().toISOString(),
          ),
      );
      if (!delivered) {
        this.logger.warn(
          `Driver completion outbox acknowledgement lost its lease for ${claimed.effectType} on task ${claimed.taskId}.`,
        );
      }
    } catch (error) {
      const retryAt = new Date(
        Date.now() + DRIVER_COMPLETION_OUTBOX_RETRY_MS,
      ).toISOString();
      const detail = error instanceof Error ? error.message : String(error);
      const released = await this.ownedMobilityRepository!.withTransaction(
        (tx) =>
          this.ownedMobilityRepository!.releaseDriverCompletionOutbox(
            tx,
            claimed.outboxId,
            leaseToken,
            retryAt,
            DRIVER_COMPLETION_OUTBOX_MAX_ATTEMPTS,
            detail,
          ),
      );
      if (!released) {
        this.logger.warn(
          `Driver completion outbox retry release lost its lease for ${claimed.effectType} on task ${claimed.taskId}: ${detail}`,
        );
        return;
      }
      this.logger.warn(
        `Driver completion outbox delivery failed for ${claimed.effectType} on task ${claimed.taskId}: ${detail}`,
      );
    }
  }

  private async executeDriverCompletionOutboxEffect(
    outbox: DriverCompletionOutboxRecord,
  ) {
    switch (outbox.effectType as DriverCompletionOutboxEffectType) {
      case "tenant_order_completed_webhook": {
        const payload = outbox.payload as Extract<
          DriverCompletionOutboxPayload,
          { effectType: "tenant_order_completed_webhook" }
        >;
        if (!this.tenantPartnerService) {
          throw new Error("Tenant partner webhook service unavailable.");
        }
        await this.tenantPartnerService.publishWebhookEvent(payload.tenantId, {
          ...payload.payload,
          outboxKey: outbox.outboxId,
        });
        return;
      }
      case "owned_mobility_trip_completed": {
        const payload = outbox.payload as Extract<
          DriverCompletionOutboxPayload,
          { effectType: "owned_mobility_trip_completed" }
        >;
        if (!this.eventEmitter) {
          throw new Error(
            "Owned mobility completion event emitter unavailable.",
          );
        }
        if (
          this.eventEmitter.listenerCount(
            OWNED_MOBILITY_TRIP_COMPLETED_EVENT,
          ) === 0
        ) {
          throw new Error(
            "Owned mobility trip completion listener is missing or unavailable.",
          );
        }
        const results = await this.eventEmitter.emitAsync(
          OWNED_MOBILITY_TRIP_COMPLETED_EVENT,
          payload.event,
        );
        if (!results || results.length === 0) {
          throw new Error(
            "Owned mobility trip completion emission yielded no listener execution.",
          );
        }
        return;
      }
      case "multi_taxi_certificate": {
        const payload = outbox.payload as Extract<
          DriverCompletionOutboxPayload,
          { effectType: "multi_taxi_certificate" }
        >;
        await this.publishMultiTaxiCertificateEvent(payload.event);
        return;
      }
      case "completion_audit_bundle": {
        const payload = outbox.payload as unknown as Extract<
          DriverCompletionOutboxPayload,
          { effectType: "completion_audit_bundle" }
        >;
        if (
          !this.auditNotificationService ||
          (typeof this.auditNotificationService.recordAuditLogAsync !==
            "function" &&
            typeof this.auditNotificationService.recordAuditLog !== "function")
        ) {
          throw new Error("Completion audit publisher unavailable.");
        }
        if (!Array.isArray(payload.audits) || payload.audits.length === 0) {
          throw new Error("Completion audit bundle is empty or invalid.");
        }
        for (const [index, audit] of payload.audits.entries()) {
          if (!audit.auditId) {
            throw new Error(
              `Completion audit ${index} is missing its durable auditId.`,
            );
          }
          await this.recordAudit(
            structuredClone(audit),
            payload.requestId ?? outbox.requestId ?? outbox.outboxId,
          );
        }
        return;
      }
      case "driver_task_updated": {
        const payload = outbox.payload as unknown as Extract<
          DriverCompletionOutboxPayload,
          { effectType: "driver_task_updated" }
        >;
        if (
          !this.ownedMobilityTaskEventsService ||
          typeof this.ownedMobilityTaskEventsService.publishTaskUpdated !==
            "function"
        ) {
          throw new Error("Driver task event publisher unavailable.");
        }
        if (!payload.eventId || !payload.correlationId) {
          throw new Error("Driver task event identity is missing.");
        }
        await this.ownedMobilityTaskEventsService.publishTaskUpdated(
          this.cloneTask(payload.task),
          this.cloneOrder(payload.order),
          payload.requestId ?? outbox.requestId ?? undefined,
          {
            eventId: payload.eventId,
            correlationId: payload.correlationId,
          },
        );
        return;
      }
      case "ops_dispatch_job_updated": {
        const payload = outbox.payload as unknown as Extract<
          DriverCompletionOutboxPayload,
          { effectType: "ops_dispatch_job_updated" }
        >;
        if (
          !this.opsDispatchEventsService ||
          typeof this.opsDispatchEventsService.publishDispatchJobUpdated !==
            "function"
        ) {
          throw new Error("Ops dispatch event publisher unavailable.");
        }
        if (!payload.dispatchJob) {
          throw new Error("Ops dispatch job snapshot is missing.");
        }
        if (!payload.eventId || !payload.correlationId) {
          throw new Error("Ops dispatch event identity is missing.");
        }
        await this.opsDispatchEventsService.publishDispatchJobUpdated(
          payload.orderId,
          structuredClone(payload.dispatchJob),
          payload.requestId ?? outbox.requestId ?? undefined,
          {
            eventId: payload.eventId,
            correlationId: payload.correlationId,
          },
        );
        return;
      }
      default:
        throw new Error(`Unsupported driver completion outbox effect.`);
    }
  }

  private async publishMultiTaxiCertificateEvent(
    certificateEvent: OwnedMobilityMultiTaxiTripCompletedEvent,
  ): Promise<void> {
    if (!this.eventEmitter) {
      throw new Error("Multi-taxi certificate event emitter unavailable.");
    }
    if (
      this.eventEmitter.listenerCount(
        OWNED_MOBILITY_MULTI_TAXI_TRIP_COMPLETED_EVENT,
      ) === 0
    ) {
      throw new Error(
        "Multi-taxi certificate listener is missing or unavailable.",
      );
    }
    const results = await this.eventEmitter.emitAsync(
      OWNED_MOBILITY_MULTI_TAXI_TRIP_COMPLETED_EVENT,
      certificateEvent,
    );
    if (!results || results.length === 0) {
      throw new Error(
        "Multi-taxi certificate emission yielded no listener execution.",
      );
    }
  }

  private async publishTenantOrderWebhook(
    order: OwnedOrderRecord,
    eventType: "order.created" | "order.cancelled" | "order.completed",
    occurredAt: string,
    extraData: Record<string, unknown> = {},
    outboxKey?: string,
  ): Promise<void> {
    if (!order.tenantId || !this.tenantPartnerService) {
      return;
    }

    await this.tenantPartnerService.publishWebhookEvent(order.tenantId, {
      ...this.buildTenantOrderWebhookPayload(
        order,
        eventType,
        occurredAt,
        extraData,
      ),
      outboxKey: outboxKey ?? `order_${order.orderId}_${eventType}`,
    });
  }

  private buildTenantOrderWebhookPayload(
    order: OwnedOrderRecord,
    eventType: "order.created" | "order.cancelled" | "order.completed",
    occurredAt: string,
    extraData: Record<string, unknown> = {},
  ) {
    return {
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
    };
  }

  private nextOrderNo() {
    return `O-${randomUUID()}`;
  }

  private nextAttemptSequence(dispatchJobId: string) {
    const count = this.dispatchAttempts.filter(
      (attempt) => attempt.dispatchJobId === dispatchJobId,
    ).length;
    return count + 1;
  }

  private assertAddress(address: string, field: string) {
    if (!(address ?? "").trim()) {
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
    if (!(value ?? "").trim()) {
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
    // Guard against a missing field: value.trim() on undefined threw a
    // TypeError -> 500. Normalize so the blank check returns a clean 400.
    const normalized = (value ?? "").trim();
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

  private assertRuntimeProfileAllowances(
    command: object,
    runtimeProfileCodeHeader?: string,
  ) {
    const commandProfile =
      "runtimeProfileCode" in command &&
      typeof command.runtimeProfileCode === "string"
        ? command.runtimeProfileCode
        : null;
    if (commandProfile || runtimeProfileCodeHeader?.trim()) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "PUBLIC_RUNTIME_PROFILE_OVERRIDE_FORBIDDEN",
        "Runtime profile is resolved by the server route and cannot be supplied by a public request.",
      );
    }
  }

  private assertNoCanonicalMultiTaxiContextOverrides(command: object) {
    const forbiddenFields = [
      "runtimeProfileCode",
      "serviceProductCode",
      "acquisitionMode",
      "operatingAuthorizationId",
      "queueMode",
    ] as const;

    for (const field of forbiddenFields) {
      if (field in command) {
        throw new ApiRequestError(
          HttpStatus.FORBIDDEN,
          "MULTI_TAXI_CANONICAL_CONTEXT_OVERRIDE_FORBIDDEN",
          "Multi-taxi canonical runtime context is resolved by the server and may not be supplied by the client.",
          { field },
        );
      }
    }
  }

  private requireIsoTimestamp(value: string, field: string) {
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "INVALID_TIMESTAMP",
        `${field} must be an ISO-8601 timestamp.`,
        { field },
      );
    }
    return new Date(timestamp).toISOString();
  }

  private assertQueuePolicy(context: QueueRuntimeContext) {
    if (
      context.runtimeProfileCode === "multi_taxi_direct" &&
      context.queueMode !== "virtual_matching"
    ) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "MULTI_TAXI_QUEUE_MODE_FORBIDDEN",
        "Multi-taxi direct may use virtual matching but may not use physical-rank or taxi-stand queues.",
        {
          runtimeProfileCode: context.runtimeProfileCode,
          queueMode: context.queueMode,
        },
      );
    }

    const allowedModes = this.profileQueuePolicies.get(
      context.runtimeProfileCode,
    );
    if (allowedModes && !allowedModes.has(context.queueMode)) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "QUEUE_MODE_NOT_ALLOWED",
        `Queue mode ${context.queueMode} is not allowed for profile ${context.runtimeProfileCode}.`,
        {
          runtimeProfileCode: context.runtimeProfileCode,
          queueMode: context.queueMode,
          allowedQueueModes: Array.from(allowedModes),
        },
      );
    }
  }

  private assertQueueEligibility(
    vehicleId: string,
    context: QueueRuntimeContext,
  ) {
    this.assertQueuePolicy(context);
    if (
      context.runtimeProfileCode === "multi_taxi_direct" &&
      !context.operatingAuthorizationId
    ) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "MULTI_TAXI_AUTHORIZATION_REQUIRED",
        "Multi-taxi queue eligibility requires a server-resolved operating authorization.",
        { vehicleId },
      );
    }

    if (
      !this.regulatoryRegistryService.getVehicleDispatchability(
        vehicleId,
        "standard_taxi",
      )
    ) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VEHICLE_NOT_DISPATCHABLE",
        "Vehicle is not eligible for queue check-in.",
        { vehicleId },
      );
    }
  }

  private buildQueueRegistryProjection(): QueueRegistryProjection {
    try {
      const vehicles = this.regulatoryRegistryService.listVehicles();
      const drivers = this.regulatoryRegistryService.listDrivers();
      const supplyPairs = this.regulatoryRegistryService.listSupplyPairs();
      return {
        authorityAvailable: true,
        vehiclesById: new Map(
          vehicles.map((vehicle) => [
            vehicle.vehicleId,
            {
              vehicleId: vehicle.vehicleId,
              plateNo: vehicle.plateNo,
              operatingArea: vehicle.operatingArea,
            },
          ]),
        ),
        driversById: new Map(
          drivers.map((driver) => [
            driver.driverId,
            {
              driverId: driver.driverId,
              name: driver.name,
            },
          ]),
        ),
        pairsByVehicleId: new Map(
          supplyPairs.map((pair) => [
            pair.vehicleId,
            {
              vehicleId: pair.vehicleId,
              driverId: pair.driverId,
            },
          ]),
        ),
      };
    } catch {
      return {
        authorityAvailable: false,
        vehiclesById: new Map(),
        driversById: new Map(),
        pairsByVehicleId: new Map(),
      };
    }
  }

  private buildQueueEntryReadRecord(
    entry: QueueEntryRecord,
    registryProjection: QueueRegistryProjection,
  ): DispatchQueueEntryReadRecord {
    const runtimeProfileCode = entry.runtimeProfileCode ?? null;
    const queueMode = entry.queueMode ?? null;
    const vehicle =
      registryProjection.vehiclesById.get(entry.vehicleId) ?? null;
    const supplyPair =
      registryProjection.pairsByVehicleId.get(entry.vehicleId) ?? null;
    const driver = supplyPair
      ? (registryProjection.driversById.get(supplyPair.driverId) ?? null)
      : null;

    return {
      ...entry,
      runtimeProfileCode,
      queueMode,
      driverId: driver?.driverId ?? null,
      driverName: driver?.name ?? null,
      vehiclePlateNo: vehicle?.plateNo ?? null,
      serviceAreaCode: vehicle?.operatingArea ?? null,
      lastUpdatedAt: entry.checkedOutAt ?? entry.checkedInAt,
      eligibility: this.evaluateQueueEntryEligibility(
        entry,
        registryProjection.authorityAvailable,
        Boolean(vehicle),
      ),
      availableActions: [
        {
          action: "back_to_queue_overview",
          enabled: true,
          riskLevel: "low",
        },
        ...(vehicle
          ? [
              {
                action: "open_vehicle",
                enabled: true,
                riskLevel: "low" as const,
              },
            ]
          : []),
        ...(driver
          ? [
              {
                action: "open_driver",
                enabled: true,
                riskLevel: "low" as const,
              },
            ]
          : []),
        ...(entry.operatingAuthorizationId
          ? [
              {
                action: "open_authorization",
                enabled: true,
                riskLevel: "low" as const,
              },
            ]
          : []),
      ],
    };
  }

  private evaluateQueueEntryEligibility(
    entry: QueueEntryRecord,
    authorityAvailable: boolean,
    vehicleExists: boolean,
  ): DispatchQueueEntryReadRecord["eligibility"] {
    const evaluatedAt = new Date().toISOString();
    if (!entry.runtimeProfileCode || !entry.queueMode) {
      return {
        decision: "denied",
        reasonCode: "QUEUE_CONTEXT_INCOMPLETE",
        evaluatedAt,
      };
    }
    if (!authorityAvailable) {
      return {
        decision: "denied",
        reasonCode: "QUEUE_ELIGIBILITY_AUTHORITY_UNAVAILABLE",
        evaluatedAt,
      };
    }
    if (!vehicleExists) {
      return {
        decision: "denied",
        reasonCode: "VEHICLE_NOT_FOUND",
        evaluatedAt,
      };
    }

    try {
      this.assertQueueEligibility(entry.vehicleId, {
        runtimeProfileCode: entry.runtimeProfileCode,
        queueMode: entry.queueMode,
        operatingAuthorizationId: entry.operatingAuthorizationId ?? null,
      });
      return {
        decision: "eligible",
        reasonCode: null,
        evaluatedAt,
      };
    } catch (error) {
      return {
        decision: "denied",
        reasonCode: this.resolveQueueEligibilityReasonCode(error),
        evaluatedAt,
      };
    }
  }

  private resolveQueueEligibilityReasonCode(
    error: unknown,
  ): DispatchQueueEligibilityReasonCode {
    if (error instanceof ApiRequestError) {
      const response = error.getResponse();
      if (
        response &&
        typeof response === "object" &&
        "error" in response &&
        response.error &&
        typeof response.error === "object" &&
        "code" in response.error &&
        typeof response.error.code === "string"
      ) {
        const reasonCode = response.error.code;
        if (
          reasonCode === "MULTI_TAXI_AUTHORIZATION_REQUIRED" ||
          reasonCode === "MULTI_TAXI_QUEUE_MODE_FORBIDDEN" ||
          reasonCode === "QUEUE_MODE_NOT_ALLOWED" ||
          reasonCode === "VEHICLE_NOT_DISPATCHABLE"
        ) {
          return reasonCode;
        }
      }
    }
    return "QUEUE_ELIGIBILITY_AUTHORITY_UNAVAILABLE";
  }

  private requireActiveBookingServiceProduct(
    businessDispatchSubtype: NonNullable<
      OwnedOrderRecord["businessDispatchSubtype"]
    >,
  ) {
    const serviceProduct =
      this.serviceProductService?.getRuntimeServiceProductByType(
        businessDispatchSubtype,
      ) ?? null;

    if (serviceProduct) {
      if (!serviceProduct.active) {
        throw new ApiRequestError(
          HttpStatus.CONFLICT,
          "SERVICE_PRODUCT_INACTIVE",
          "The requested service product is not active.",
          {
            serviceProduct: businessDispatchSubtype,
          },
        );
      }

      if (serviceProduct.timing !== "reservation") {
        throw new ApiRequestError(
          HttpStatus.CONFLICT,
          "INVALID_SERVICE_PRODUCT_TIMING",
          "Tenant bookings require a reservation service product.",
          {
            serviceProduct: businessDispatchSubtype,
            timing: serviceProduct.timing,
          },
        );
      }

      return serviceProduct;
    }

    if (!BOOKING_RULES[businessDispatchSubtype]) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "SERVICE_PRODUCT_INACTIVE",
        "The requested service product is not active.",
        {
          serviceProduct: businessDispatchSubtype,
        },
      );
    }

    return {
      defaultProofRequirements:
        businessDispatchSubtype === "credit_card_airport_transfer"
          ? ["photo", "signoff"]
          : ["photo"],
    };
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

    const createdAtMs = new Date(order.createdAt).getTime();
    if (
      order.partnerEntrySlug &&
      order.status === "created" &&
      Number.isFinite(createdAtMs) &&
      Date.now() <= createdAtMs + REFERRAL_PASSENGER_CANCEL_WINDOW_MS
    ) {
      return;
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

  async handleDispatchTimeout(
    orderId: string,
    timeoutReasonCode: "acceptance_timeout" | "matching_timeout",
    requestId?: string,
    options?: { targetAssignmentId?: string },
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

    // SD §7.6: an acceptance timeout is armed for one specific offer and
    // must be able to name it -- without a target, there is nothing to fence
    // the timer to "whatever assignment happens to be latest" (see below),
    // which is exactly the unfenced case this guard exists to reject.
    if (
      timeoutReasonCode === "acceptance_timeout" &&
      !options?.targetAssignmentId
    ) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "ACCEPTANCE_TIMEOUT_TARGET_REQUIRED",
        "An acceptance timeout must name the assignment its timer was armed for.",
        { orderId },
      );
    }

    // SD §7.6: "不能直接沿用 handleDispatchTimeout(orderId) 再尋找最新
    // assignment 取消" -- a timer set for one specific offer must not cancel
    // whatever assignment happens to be latest by the time it fires (a
    // reassign or a fresh dispatch attempt may have already replaced it),
    // nor an offer that already left the "pending acceptance" state since
    // the timer was armed -- an accepted offer is no longer waiting on this
    // timeout, and cancelling it here would undo a driver's acceptance out
    // from under them. Both cases are indistinguishable "this timer no
    // longer applies" outcomes and resolve the same way: leave state and
    // reservations untouched instead of closing a different, or no longer
    // pending, assignment.
    if (
      options?.targetAssignmentId &&
      (latestAssignment?.assignmentId !== options.targetAssignmentId ||
        latestAssignment.status !== "assigned")
    ) {
      return {
        orderId,
        status: order.status,
        timeoutReasonCode,
        escalationAction: "superseded" as const,
      };
    }

    // SD §7.6: a `matching_timeout` armed while the order had no assignment
    // yet is allowed to omit a target (there is nothing to name). But if an
    // assignment now exists, this timer predates it and is exactly as stale
    // as an untargeted `acceptance_timeout` would be -- without this guard
    // it would fall through to closing whatever offer is latest, including
    // one made after this timer was armed. Treat it as superseded instead of
    // resolving it against an assignment it was never armed for.
    if (
      timeoutReasonCode === "matching_timeout" &&
      !options?.targetAssignmentId &&
      latestAssignment
    ) {
      return {
        orderId,
        status: order.status,
        timeoutReasonCode,
        escalationAction: "superseded" as const,
      };
    }

    let closedPrevious: {
      assignment: DispatchAssignmentRecord;
      task: DriverTaskRecord | null;
    } | null = null;
    if (latestAssignment && this.ownedMobilityRepository?.isEnabled()) {
      // SD §7.6: re-verify under a row lock, shared with accept's own write
      // path, immediately before acting -- the in-memory check above can be
      // stale (e.g. this process's cache lagging another pod's accept), and
      // this is the authoritative fence against a timeout racing an accept.
      // A `null` result means the row already left "assigned" (accepted, or
      // already closed by something else) since the in-memory check above;
      // treat it exactly like the superseded case.
      closedPrevious = await this.ownedMobilityRepository.withTransaction(
        (tx) =>
          this.closeSupersededDispatchAssignment(
            tx,
            latestAssignment.assignmentId,
            now,
          ),
      );
      if (!closedPrevious) {
        return {
          orderId,
          status: order.status,
          timeoutReasonCode,
          escalationAction: "superseded" as const,
        };
      }
    }

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
        // Already durably persisted atomically by closeSupersededDispatchAssignment
        // above when closedPrevious is set; re-including it here would just be a
        // redundant (harmless, but pointless) re-upsert of identical values.
        ...(latestAssignment && !closedPrevious
          ? { dispatchAssignments: [latestAssignment] }
          : {}),
        ...(latestTask && !closedPrevious ? { driverTasks: [latestTask] } : {}),
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

  private nextQueuePosition(
    siteId: string,
    runtimeProfileCode: RuntimeProfileCode = "ordinary_taxi",
    queueMode: DispatchQueueMode = "physical_rank",
  ) {
    const activeEntries = this.queueEntries.filter(
      (entry) =>
        entry.siteId === siteId &&
        entry.status === "checked_in" &&
        (entry.runtimeProfileCode ?? "ordinary_taxi") === runtimeProfileCode &&
        (entry.queueMode ?? "physical_rank") === queueMode,
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
          runtimeProfileCode:
            traceLog.details?.runtimeProfileCode === "multi_taxi_direct" ||
            traceLog.details?.runtimeProfileCode === "business_dispatch"
              ? traceLog.details.runtimeProfileCode
              : "ordinary_taxi",
          queueMode:
            traceLog.details?.queueMode === "virtual_matching" ||
            traceLog.details?.queueMode === "taxi_stand"
              ? traceLog.details.queueMode
              : "physical_rank",
          operatingAuthorizationId:
            typeof traceLog.details?.operatingAuthorizationId === "string"
              ? traceLog.details.operatingAuthorizationId
              : null,
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

  private buildTraceLog(
    orderId: string,
    eventType: string,
    details?: Record<string, unknown>,
  ): DispatchTraceLogRecord {
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
    return traceLog;
  }

  private assertAssignmentEligibilityRecheck(
    order: Pick<
      OwnedOrderRecord,
      "orderId" | "serviceBucket" | "businessDispatchSubtype"
    >,
    dispatchJobId: string,
    vehicleId: string,
    driverId: string,
  ) {
    try {
      if (this.vehicleEligibilityService) {
        this.vehicleEligibilityService.assertDispatchAssignmentEligible(
          order,
          vehicleId,
          driverId,
        );
        return;
      }

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
          { vehicleId },
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
          { driverId },
        );
      }
    } catch (error) {
      if (!(error instanceof ApiRequestError)) {
        throw error;
      }

      const response = error.getResponse() as {
        error?: {
          code?: string;
          details?: Record<string, unknown>;
        };
      };
      const reasonCode = this.normalizeAssignmentEligibilityReasonCode(
        response.error?.code,
      );
      if (!reasonCode) {
        throw error;
      }

      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "ELIGIBILITY_CHANGED_BEFORE_ASSIGNMENT",
        "Eligibility changed before assignment. Refresh candidates and retry.",
        {
          dispatchJobId,
          orderId: order.orderId,
          vehicleId,
          driverId,
          serviceProductCode: this.resolveServiceProductCodeForOrder(order),
          reasonCodes: [reasonCode],
          latestEligibility: response.error?.details ?? null,
        },
      );
    }
  }

  private normalizeAssignmentEligibilityReasonCode(code?: string) {
    switch (code) {
      case "SERVICE_PRODUCT_INACTIVE":
        return "SERVICE_PRODUCT_INACTIVE";
      case "VEHICLE_NOT_DISPATCHABLE":
      case "VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT":
      case "TAXI_METER_REQUIRED":
      case "AIRPORT_PERMIT_REQUIRED":
      case "FIXED_FARE_NOT_ALLOWED":
        return "VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT";
      case "DRIVER_NOT_AVAILABLE":
      case "DRIVER_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT":
        return "DRIVER_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT";
      default:
        return null;
    }
  }

  private resolveServiceProductCodeForOrder(
    order: Pick<
      OwnedOrderRecord,
      "serviceBucket" | "businessDispatchSubtype" | "serviceProductCode"
    >,
  ): ServiceProductType | null {
    // Booking-origin value wins; derivation is only a legacy fallback.
    if (order.serviceProductCode) {
      return order.serviceProductCode;
    }

    if (this.vehicleEligibilityService) {
      return this.vehicleEligibilityService.resolveServiceProductForOwnedOrder(
        order,
      );
    }

    return order.serviceBucket === "standard_taxi"
      ? "taxi_realtime"
      : (order.businessDispatchSubtype ?? null);
  }

  private assertSandboxDispatchGate(
    order: OwnedOrderRecord,
    dispatchJobId: string,
    vehicleId: string,
    driverId: string,
    sandboxDispatchSnapshot?: AssignDispatchCommand["sandboxDispatchSnapshot"],
    requestId?: string,
  ) {
    if (
      !this.sandboxDispatchGateService?.shouldEvaluateSandboxAssignment(
        vehicleId,
      )
    ) {
      return;
    }

    return this.afterMaybePromise(
      this.refreshPassengerDisclosureSnapshot(order),
      (hydratedOrder) =>
        this.afterMaybePromise(
          this.sandboxDispatchGateService!.buildAssignmentGateInput({
            orderId: hydratedOrder.orderId,
            dispatchJobId,
            vehicleId,
            driverId,
            bookingWindow: {
              start: hydratedOrder.reservationWindowStart,
              end: hydratedOrder.reservationWindowEnd,
            },
            pickup: hydratedOrder.pickup,
            dropoff: hydratedOrder.dropoff,
            entitlement: sandboxDispatchSnapshot?.entitlement ?? null,
            candidateRoute: sandboxDispatchSnapshot?.candidateRoute ?? null,
            providerCapabilities:
              sandboxDispatchSnapshot?.providerCapabilities ?? null,
            telemetry: sandboxDispatchSnapshot?.telemetry ?? null,
            regulatory: sandboxDispatchSnapshot?.regulatory ?? null,
            recorder: sandboxDispatchSnapshot?.recorder ?? null,
            holdState: sandboxDispatchSnapshot?.holdState ?? null,
            limits: sandboxDispatchSnapshot?.limits ?? null,
            passengerDisclosure: hydratedOrder.passengerDisclosure
              ? {
                  channel: hydratedOrder.passengerDisclosure.channel,
                  policyId: hydratedOrder.passengerDisclosure.policyId,
                  policyVersion:
                    hydratedOrder.passengerDisclosure.policyVersion,
                  messageCode: hydratedOrder.passengerDisclosure.messageCode,
                  requiresAcknowledgement:
                    hydratedOrder.passengerDisclosure.requiresAcknowledgement,
                  acknowledgementMode:
                    hydratedOrder.passengerDisclosure.acknowledgementMode,
                  acknowledgedAt:
                    hydratedOrder.passengerDisclosure.acknowledgedAt,
                  acknowledgementRecordId:
                    hydratedOrder.passengerDisclosure.acknowledgementRecordId,
                }
              : null,
          }),
          (gateInput) =>
            this.sandboxDispatchGateService!.assertAssignmentEligible(
              gateInput,
              requestId,
            ),
        ),
    );
  }

  // Stamp the precise service-product code onto a freshly-built order so it
  // originates at booking intake and flows unchanged downstream. Idempotent: an
  // order that already carries the code is returned untouched.
  private stampServiceProductCode<T extends OwnedOrderRecord>(order: T): T {
    if (order.serviceProductCode) {
      return order;
    }
    return {
      ...order,
      serviceProductCode: this.resolveServiceProductCodeForOrder(order),
    };
  }

  private buildDispatchAssignmentBundle(
    dispatchJob: DispatchJobRecord,
    order: OwnedOrderRecord,
    vehicleId: string,
    driverId: string,
    _sandboxDispatchSnapshot?: AssignDispatchCommand["sandboxDispatchSnapshot"],
    options?: CreateDispatchAssignmentOptions,
    ratingSummary?: DriverRatingSummary | null,
  ): MaybePromise<DispatchAssignmentBundle> {
    const now = new Date().toISOString();
    const nextOrder = this.cloneOrder(order);
    const nextDispatchJob = { ...dispatchJob };
    const taskId = randomUUID();
    const serviceProductCode = this.resolveServiceProductCodeForOrder(order);
    const assignment: DispatchAssignmentRecord = {
      assignmentId: randomUUID(),
      dispatchJobId: dispatchJob.dispatchJobId,
      orderId: order.orderId,
      taskId,
      serviceProductCode,
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
      serviceProductCode,
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
      sequence:
        options?.dispatchAttemptSequence ??
        this.nextAttemptSequence(dispatchJob.dispatchJobId),
      outcome: "assigned",
      reasonCode: null,
      createdAt: now,
    };

    nextDispatchJob.status = "assigned";
    nextDispatchJob.updatedAt = now;
    nextOrder.status = "assigned";
    nextOrder.updatedAt = now;

    const traceLogs: DispatchTraceLogRecord[] = [];
    if (
      nextOrder.dispatchSemantics === "reservation" &&
      nextOrder.reservationHoldStatus !== "released"
    ) {
      this.transitionReservationHold(nextOrder, "released");
      nextOrder.reservationHoldExpiresAt = now;
      traceLogs.push(
        this.buildTraceLog(nextOrder.orderId, "reservation.hold.released", {
          dispatchJobId: dispatchJob.dispatchJobId,
          reservationHoldId: nextOrder.reservationHoldId,
          reason: "assignment_confirmed",
        }),
      );
    }

    traceLogs.push(
      this.buildTraceLog(nextOrder.orderId, "dispatch.assigned", {
        dispatchJobId: dispatchJob.dispatchJobId,
        assignmentId: assignment.assignmentId,
        taskId,
        vehicleId,
        driverId,
      }),
    );

    return this.afterMaybePromise(
      this.buildPassengerAssignmentAuthority(
        nextOrder,
        nextDispatchJob,
        assignment,
        vehicleId,
        driverId,
        now,
        ratingSummary ?? this.createNewDriverRatingSummary(driverId, now),
      ),
      (passengerAuthority) => ({
        order: nextOrder,
        dispatchJob: nextDispatchJob,
        assignment,
        task,
        dispatchAttempt,
        traceLogs,
        passengerDisclosureSnapshot:
          passengerAuthority.passengerDisclosureSnapshot,
        consumerNotificationOutbox:
          passengerAuthority.consumerNotificationOutbox,
      }),
    );
  }

  private buildPassengerAssignmentAuthority(
    order: OwnedOrderRecord,
    dispatchJob: DispatchJobRecord,
    assignment: DispatchAssignmentRecord,
    vehicleId: string,
    driverId: string,
    now: string,
    ratingSummary: DriverRatingSummary,
  ):
    | {
        passengerDisclosureSnapshot: PassengerDispatchDisclosureSnapshot | null;
        consumerNotificationOutbox: ConsumerNotificationOutboxRecord | null;
      }
    | Promise<{
        passengerDisclosureSnapshot: PassengerDispatchDisclosureSnapshot | null;
        consumerNotificationOutbox: ConsumerNotificationOutboxRecord | null;
      }> {
    if (order.runtimeProfileCode !== "multi_taxi_direct") {
      return {
        passengerDisclosureSnapshot: null,
        consumerNotificationOutbox: null,
      };
    }
    if (
      ratingSummary.displayState === "unavailable" ||
      (ratingSummary.displayState === "rated" &&
        (ratingSummary.averageRating === null ||
          ratingSummary.ratingCount < 1)) ||
      (ratingSummary.displayState === "new_driver" &&
        (ratingSummary.averageRating !== null ||
          ratingSummary.ratingCount !== 0))
    ) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "P5_RATING_STATE_UNINITIALIZED",
        "A canonical driver rating state is required before assignment.",
        {
          driverId,
          displayState: ratingSummary.displayState,
          ratingCount: ratingSummary.ratingCount,
        },
      );
    }

    const disclosure =
      this.regulatoryRegistryService.getVehiclePassengerDisclosureProfile(
        vehicleId,
      );
    if (!disclosure || disclosure.status !== "complete") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "P5_VEHICLE_DISCLOSURE_INCOMPLETE",
        "A complete vehicle passenger disclosure profile is required before assignment.",
        { vehicleId, missingFieldCodes: disclosure?.missingFieldCodes ?? [] },
      );
    }

    const credential =
      this.regulatoryRegistryService.getDriverPublicRegistrationCredential(
        driverId,
      );
    if (
      !credential ||
      credential.status !== "verified_active" ||
      !credential.effectiveUntil ||
      Date.parse(credential.effectiveUntil) <= Date.parse(now)
    ) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "P5_DRIVER_REGISTRATION_NOT_ACTIVE",
        "A verified and effective public driver registration is required before assignment.",
        { driverId, status: credential?.status ?? "missing" },
      );
    }

    const vehicle = this.regulatoryRegistryService
      .listVehicles()
      .find((record) => record.vehicleId === vehicleId);
    const driver = this.regulatoryRegistryService
      .listDrivers()
      .find((record) => record.driverId === driverId);
    if (!vehicle) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "P5_VEHICLE_REGISTRY_MISSING",
        "The assigned vehicle is missing from the canonical registry.",
        { vehicleId },
      );
    }
    const assignmentVersion =
      this.passengerDisclosureSnapshots.filter(
        (snapshot) => snapshot.orderId === order.orderId,
      ).length + 1;
    const routeSnapshotId = randomUUID();
    const quoteSnapshotId = randomUUID();
    const routeFare = this.buildFareQuoteSnapshot(
      order,
      routeSnapshotId,
      quoteSnapshotId,
      now,
    );
    if (!this.isResolvedRouteFareSnapshot(routeFare)) {
      return this.recordFareQuoteAnomalyAndFail("route_unresolved", routeFare);
    }
    const anomalyReason = this.resolveFareQuoteAnomalyReason(order);
    if (anomalyReason) {
      return this.recordFareQuoteAnomalyAndFail(anomalyReason, routeFare);
    }
    const snapshot: PassengerDispatchDisclosureSnapshot = {
      snapshotId: randomUUID(),
      runtimeProfileCode: "multi_taxi_direct",
      orderId: order.orderId,
      bookingId: order.bookingId,
      dispatchJobId: dispatchJob.dispatchJobId,
      assignmentId: assignment.assignmentId,
      assignmentVersion,
      vehicle: {
        vehicleId,
        make: disclosure.make,
        model: disclosure.model,
        plateNo: vehicle.plateNo,
        modelYear: disclosure.modelYear,
        doorCount: disclosure.doorCount,
        color: disclosure.color,
        profileVersion: disclosure.version,
      },
      driver: {
        driverId,
        displayName: driver?.name ?? null,
        registrationMaskedDisplay: credential.maskedDisplay,
        registrationStatus: "verified_active",
        registrationEffectiveUntil: credential.effectiveUntil,
        credentialVersion: credential.version,
      },
      rating: {
        displayState: ratingSummary.displayState,
        averageRating: ratingSummary.averageRating,
        ratingCount: ratingSummary.ratingCount,
        aggregateVersion: ratingSummary.aggregateVersion,
      },
      eta: {
        minutes: order.etaSnapshot?.etaMinutes ?? null,
        calculatedAt: order.etaSnapshot?.calculatedAt ?? null,
        locationFreshness: "missing",
      },
      routeFare,
      createdAt: now,
      supersededAt: null,
    };
    // Must match the passenger-authority derivation: a phone-only passenger is
    // peppered and hashed, never stored as a raw number on an outbox row.
    const passengerSubjectRef = resolvePassengerSubjectRef(order.passenger);
    const outbox: ConsumerNotificationOutboxRecord = {
      outboxId: randomUUID(),
      orderId: order.orderId,
      passengerSubjectRef,
      eventType:
        assignmentVersion > 1
          ? "assignment_replaced"
          : "assignment_disclosure_ready",
      assignmentVersion,
      payload: {
        snapshotId: snapshot.snapshotId,
        assignmentId: assignment.assignmentId,
      },
      status: "pending",
      attemptCount: 0,
      nextAttemptAt: now,
      createdAt: now,
      deliveredAt: null,
    };
    const authority = {
      passengerDisclosureSnapshot: snapshot,
      consumerNotificationOutbox: outbox,
    };
    return authority;
  }

  private buildFareQuoteSnapshot(
    order: OwnedOrderRecord,
    routeSnapshotId: string,
    quoteSnapshotId: string,
    generatedAt: string,
  ): FareQuoteAnomalySnapshot {
    const fareMinor = order.quotedFare?.amountMinor ?? null;
    const buildAddress = (
      address: OwnedOrderRecord["pickup"],
    ): FareQuoteAnomalySnapshot["pickup"] => {
      const lat = Number.isFinite(address.lat) ? address.lat! : null;
      const lng = Number.isFinite(address.lng) ? address.lng! : null;
      return {
        ...address,
        lat,
        lng,
        coordinateSource:
          address.coordinateProvenance?.coordinateSource ??
          address.coordinateSource ??
          "legacy_text",
        geocodeConfidence:
          address.coordinateProvenance?.geocodeConfidence ??
          address.geocodeConfidence ??
          "unknown",
        resolvedAt: lat !== null && lng !== null ? generatedAt : null,
      };
    };

    return {
      routeSnapshotId,
      quoteSnapshotId,
      orderId: order.orderId,
      pickup: buildAddress(order.pickup),
      dropoff: buildAddress(order.dropoff),
      estimatedDistanceMeters: null,
      estimatedDurationSeconds: null,
      encodedPolyline: null,
      chargingMode: order.fixedPrice ? "fixed_quote" : "meter_estimate",
      estimatedFareMinor: fareMinor,
      payableFareMinor: fareMinor,
      currency: PLATFORM_CURRENCY,
      farePolicyId: order.operatingAuthorizationId?.trim() ?? "",
      farePolicyVersion: order.quotedFareRuleVersion?.trim() ?? "",
      fareChangeRuleId: "multi_taxi_passenger_confirmation",
      fareChangeRuleVersion: "1",
      fareChangeRuleDisplayText:
        "Fare changes require passenger disclosure and confirmation.",
      passengerConfirmedAt: null,
      generatedAt,
    };
  }

  private isResolvedRouteFareSnapshot(
    snapshot: FareQuoteAnomalySnapshot,
  ): snapshot is RouteFareDisclosureSnapshot {
    return (
      Number.isFinite(snapshot.pickup.lat) &&
      Number.isFinite(snapshot.pickup.lng) &&
      snapshot.pickup.resolvedAt !== null &&
      Number.isFinite(snapshot.dropoff.lat) &&
      Number.isFinite(snapshot.dropoff.lng) &&
      snapshot.dropoff.resolvedAt !== null
    );
  }

  private resolveFareQuoteAnomalyReason(
    order: OwnedOrderRecord,
  ): FareQuoteAnomaly | null {
    if (
      !order.operatingAuthorizationId?.trim() ||
      !order.quotedFareRuleVersion?.trim()
    ) {
      return "fare_policy_missing";
    }
    if (
      order.fixedPrice &&
      (!order.quotedFare || !order.quotedFareSource?.trim())
    ) {
      return "quote_provider_unavailable";
    }
    if (
      order.quotedFare &&
      (!Number.isSafeInteger(order.quotedFare.amountMinor) ||
        order.quotedFare.amountMinor <= 0)
    ) {
      return "quote_out_of_range";
    }
    if (
      order.quotedFare &&
      normalisePlatformCurrency(order.quotedFare.currency) !== PLATFORM_CURRENCY
    ) {
      return "calculation_mismatch";
    }
    return null;
  }

  private recordFareQuoteAnomalyAndFail(
    reason: FareQuoteAnomaly,
    snapshot: FareQuoteAnomalySnapshot,
  ): Promise<never> | never {
    const failClosed = (): never => {
      const errors: Record<
        FareQuoteAnomaly,
        { code: string; message: string }
      > = {
        quote_provider_unavailable: {
          code: "P5_QUOTE_PROVIDER_UNAVAILABLE",
          message:
            "A fare quote provider result is required before multi-taxi assignment.",
        },
        quote_out_of_range: {
          code: "P5_QUOTE_OUT_OF_RANGE",
          message:
            "The fare quote is outside the canonical range for assignment.",
        },
        route_unresolved: {
          code: "P5_ROUTE_SNAPSHOT_UNRESOLVED",
          message:
            "Resolved pickup and dropoff coordinates are required before multi-taxi assignment.",
        },
        fare_policy_missing: {
          code: "P5_FARE_POLICY_MISSING",
          message:
            "An active fare policy is required before multi-taxi assignment.",
        },
        calculation_mismatch: {
          code: "P5_FARE_CALCULATION_MISMATCH",
          message:
            "The fare quote does not match the canonical multi-taxi calculation.",
        },
      };
      const error = errors[reason];
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        error.code,
        error.message,
        {
          orderId: snapshot.orderId,
          quoteSnapshotId: snapshot.quoteSnapshotId,
          reason,
        },
      );
    };

    if (!this.fareAnomalyService) {
      return failClosed();
    }
    return this.fareAnomalyService
      .recordQuoteAnomaly({ reason, snapshot })
      .then(failClosed);
  }

  private resolveSuccessfulFareQuoteAnomalies(
    bundle: DispatchAssignmentBundle,
  ): void | Promise<void> {
    if (
      !this.fareAnomalyService ||
      !bundle.passengerDisclosureSnapshot ||
      bundle.order.runtimeProfileCode !== "multi_taxi_direct"
    ) {
      return;
    }
    return this.fareAnomalyService
      .resolveOrderAnomalies(
        bundle.order.orderId,
        bundle.passengerDisclosureSnapshot.createdAt,
      )
      .catch((error: unknown) => {
        // Assignment is already canonical at this point. Do not make callers
        // retry a committed dispatch because stale anomaly cleanup failed.
        this.logger.error(
          `Fare anomaly cleanup failed after assigning order ${bundle.order.orderId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
  }

  private createNewDriverRatingSummary(
    driverId: string,
    calculatedAt: string,
  ): DriverRatingSummary {
    return {
      driverId,
      displayState: "new_driver",
      averageRating: null,
      ratingCount: 0,
      lastRatedAt: null,
      aggregateVersion: 1,
      calculatedAt,
    };
  }

  private clonePassengerDisclosureSnapshot(
    snapshot: PassengerDispatchDisclosureSnapshot,
  ): PassengerDispatchDisclosureSnapshot {
    return structuredClone(snapshot);
  }

  // How many assignments this order has ever had. This is the same quantity the
  // passenger sees as `assignmentVersion` on the disclosure snapshot and the
  // notification outbox: `buildPassengerAssignmentAuthority` derives that from
  // the snapshot count *before* the new assignment is applied, and every
  // multi_taxi_direct assignment produces exactly one snapshot, so the two stay
  // in step. Deriving it here — rather than reading a field off
  // `DispatchAssignmentRecord`, which has none — keeps the guard working for
  // non-multi-taxi orders (no snapshots) and for assignments hydrated from
  // persistence, and needs no schema change. Cancelled assignments stay in the
  // array, so the counter is monotonic per order.
  private currentAssignmentVersion(orderId: string): number {
    return this.dispatchAssignments.filter(
      (assignment) => assignment.orderId === orderId,
    ).length;
  }

  private applyDispatchAssignmentBundle(
    bundle: DispatchAssignmentBundle,
    requestId?: string,
    persistChanges = true,
  ): DispatchAssignmentResult {
    this.orders = [
      bundle.order,
      ...this.orders.filter((order) => order.orderId !== bundle.order.orderId),
    ];
    this.dispatchJobs = [
      bundle.dispatchJob,
      ...this.dispatchJobs.filter(
        (dispatchJob) =>
          dispatchJob.dispatchJobId !== bundle.dispatchJob.dispatchJobId,
      ),
    ];
    this.dispatchAssignments = [bundle.assignment, ...this.dispatchAssignments];
    this.driverTasks = [bundle.task, ...this.driverTasks];
    this.dispatchAttempts = [bundle.dispatchAttempt, ...this.dispatchAttempts];
    for (const traceLog of bundle.traceLogs) {
      this.dispatchTraceLogs = [traceLog, ...this.dispatchTraceLogs];
    }
    if (bundle.passengerDisclosureSnapshot) {
      this.passengerDisclosureSnapshots = [
        bundle.passengerDisclosureSnapshot,
        ...this.passengerDisclosureSnapshots.map((snapshot) =>
          snapshot.orderId === bundle.order.orderId &&
          snapshot.supersededAt === null
            ? {
                ...snapshot,
                supersededAt: bundle.passengerDisclosureSnapshot!.createdAt,
              }
            : snapshot,
        ),
      ];
    }
    if (bundle.consumerNotificationOutbox) {
      this.consumerNotificationOutbox = [
        bundle.consumerNotificationOutbox,
        ...this.consumerNotificationOutbox,
      ];
    }

    this.auditNotificationService.recordNotification({
      tenantId: bundle.order.tenantId,
      channel: "driver_task",
      title: "Driver task assigned",
      message: `Driver ${bundle.task.driverId} received task ${bundle.task.taskId} for order ${bundle.order.orderNo}.`,
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
        resourceId: bundle.assignment.assignmentId,
        newValuesSummary: {
          dispatchJobId: bundle.dispatchJob.dispatchJobId,
          vehicleId: bundle.assignment.vehicleId,
          driverId: bundle.assignment.driverId,
        },
      },
      requestId,
    );
    if (persistChanges) {
      this.persistChanges(
        {
          orders: [bundle.order],
          dispatchJobs: [bundle.dispatchJob],
          dispatchAssignments: [bundle.assignment],
          driverTasks: [bundle.task],
          dispatchAttempts: [bundle.dispatchAttempt],
          dispatchTraceLogs: bundle.traceLogs,
          ...(bundle.passengerDisclosureSnapshot
            ? {
                passengerDisclosureSnapshots: [
                  bundle.passengerDisclosureSnapshot,
                ],
              }
            : {}),
          ...(bundle.consumerNotificationOutbox
            ? {
                consumerNotificationOutbox: [bundle.consumerNotificationOutbox],
              }
            : {}),
        },
        "assign_dispatch",
      );
    }
    this.ownedMobilityTaskEventsService.publishTaskAssigned(
      bundle.task,
      bundle.order,
      requestId,
    );
    this.opsDispatchEventsService?.publishDispatchJobUpdated(
      bundle.order.orderId,
      bundle.dispatchJob,
      requestId,
    );

    return {
      assignmentId: bundle.assignment.assignmentId,
      status: bundle.assignment.status,
      taskId: bundle.task.taskId,
    };
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

  private async replayDriverCompletionFromRepository(
    tx: OwnedMobilityQueryExecutor,
    task: DriverTaskRecord,
    order: OwnedOrderRecord,
    requestId: string,
  ): Promise<DriverTaskRecord | null> {
    if (task.status === "completed") {
      const matched =
        await this.ownedMobilityRepository!.hasDriverTaskTraceRequestId(
          tx,
          order.orderId,
          task.taskId,
          "driver.completed_trip",
          requestId,
        );
      if (matched) {
        return this.cloneTask(task);
      }
    }

    if (task.status === "proof_pending") {
      const matched =
        await this.ownedMobilityRepository!.hasDriverTaskTraceRequestId(
          tx,
          order.orderId,
          task.taskId,
          "driver.proof_pending",
          requestId,
        );
      if (matched) {
        return this.cloneTask(task);
      }
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

  private async persistChangesRequired(
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

    try {
      await this.ownedMobilityRepository.persistChanges(persistPayload);
    } catch (error) {
      this.ownedMobilityRepository.reportPersistenceFailure(error, context);
      throw error;
    }
  }

  private async recordAudit(
    input: Omit<AuditLogRecord, "auditId" | "createdAt" | "requestId"> & {
      auditId?: string;
    },
    requestId?: string,
  ): Promise<AuditLogRecord | undefined> {
    const requestIdValue = requestId ?? randomUUID();
    const auditId =
      input.auditId ??
      generateDeterministicUuid(
        "owned_mobility_audit",
        `${input.actionName}:${input.resourceType}:${input.resourceId ?? ""}:${requestIdValue}`,
      );
    const auditInput = {
      ...input,
      auditId,
      requestId: requestIdValue,
    };
    if (this.auditNotificationService) {
      if (
        typeof this.auditNotificationService.recordAuditLogAsync === "function"
      ) {
        return await this.auditNotificationService.recordAuditLogAsync(
          auditInput,
        );
      }
      return this.auditNotificationService.recordAuditLog(auditInput);
    }
    return undefined;
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

  private applyApprovalRequestResolutionToOrder(
    request: TenantBookingApprovalRequestRecord,
    requestId?: string,
  ) {
    const order = this.requireBookingOrder(request.bookingId, request.tenantId);
    const previousApprovalState = order.approvalState;
    const now = new Date().toISOString();

    if (request.status === "approved") {
      order.approvalState = "approved";
      order.approvalRequestIds = [];
    } else if (request.status === "rejected") {
      order.approvalState = "rejected";
      order.approvalRequestIds = [];
      order.status = "cancelled";
      order.cancelledAt = order.cancelledAt ?? now;
      order.cancelReason = order.cancelReason ?? "booking_approval_rejected";
    } else {
      // pending (incl. P1 manual escalation that rotates approvers but keeps the
      // request actionable) and any other non-terminal status keep the booking
      // referencing the live approval request so the rotated approvers can act.
      order.approvalState = "pending";
      order.approvalRequestIds = [request.approvalRequestId];
    }

    order.updatedAt = now;
    this.persistChanges(
      {
        orders: [order],
      },
      "apply approval request resolution",
    );
    this.recordBookingApprovalStateChanged(
      order,
      previousApprovalState,
      requestId,
    );
  }

  private evaluateTenantBookingGovernance(params: {
    tx?: OwnedMobilityQueryExecutor | null;
    order: OwnedOrderRecord;
    operation: "create" | "update";
    requestId?: string;
  }): MaybePromise<TenantApprovalEvaluationResult | null> {
    if (
      !this.tenantPartnerService ||
      !params.order.tenantId ||
      !params.order.bookingId ||
      !params.order.reservationWindowStart
    ) {
      return null;
    }

    const inputSnapshot = this.buildTenantBookingApprovalInputSnapshot(
      params.order,
    );
    const quotaPreview = this.tenantPartnerService.previewBookingQuotaImpact(
      params.order.tenantId,
      {
        bookingId: params.order.bookingId,
        costCenterCode: params.order.costCenter,
        estimatedAmountMinor: params.order.quotedFare?.amountMinor ?? null,
        ...(params.order.quotedFare?.currency
          ? { currency: params.order.quotedFare.currency }
          : {}),
        reservationWindowStart: params.order.reservationWindowStart,
      },
    );
    const evaluation = this.tenantPartnerService.evaluateApprovalRules(
      params.order.tenantId,
      {
        subject: {
          subjectType: "booking",
          bookingId: params.order.bookingId,
          draftId: null,
          operation: params.operation,
        },
        inputSnapshot,
        quotaImpacts: quotaPreview.impacts,
      },
      params.requestId,
    );
    const matchedRules = evaluation.matchedRules ?? [];
    const blockedByRule = matchedRules.some((rule) => rule.action === "block");

    if (evaluation.outcome?.blocked && blockedByRule) {
      return evaluation;
    }

    return this.afterMaybePromise(
      this.tenantPartnerService.reserveTenantQuota(params.tx ?? null, {
        tenantId: params.order.tenantId,
        bookingId: params.order.bookingId,
        evaluationId:
          evaluation.evaluationId ?? `approval-eval-${randomUUID()}`,
        reservationWindowStart: params.order.reservationWindowStart,
        costCenterCode: params.order.costCenter,
        estimatedAmountMinor: params.order.quotedFare?.amountMinor ?? null,
        ...(params.order.quotedFare?.currency
          ? { currency: params.order.quotedFare.currency }
          : {}),
      }),
      () => evaluation,
    );
  }

  private createApprovalRequestForOrder(params: {
    tx?: OwnedMobilityQueryExecutor | null;
    order: OwnedOrderRecord;
    evaluation: TenantApprovalEvaluationResult | null;
    requestId?: string;
  }): MaybePromise<TenantBookingApprovalRequestRecord | null> {
    if (
      !this.tenantPartnerService ||
      !params.order.tenantId ||
      !params.order.bookingId ||
      !params.evaluation?.outcome?.approvalRequired
    ) {
      return null;
    }

    return this.tenantPartnerService.createBookingApprovalRequest({
      tx: params.tx ?? null,
      tenantId: params.order.tenantId,
      bookingId: params.order.bookingId,
      orderId: params.order.orderId,
      evaluationSnapshot: params.evaluation,
      ...(params.requestId ? { requestId: params.requestId } : {}),
    });
  }

  private cancelApprovalRequestsForReevaluation(params: {
    tx?: OwnedMobilityQueryExecutor | null;
    order: OwnedOrderRecord;
    requestId?: string;
  }): MaybePromise<TenantBookingApprovalRequestRecord[]> {
    if (
      !this.tenantPartnerService ||
      !params.order.tenantId ||
      !params.order.bookingId
    ) {
      return [];
    }

    return this.tenantPartnerService.cancelApprovalRequestsForReevaluation({
      tx: params.tx ?? null,
      tenantId: params.order.tenantId,
      bookingId: params.order.bookingId,
      ...(params.requestId ? { requestId: params.requestId } : {}),
    });
  }

  private buildTenantBookingApprovalInputSnapshot(
    order: OwnedOrderRecord,
  ): TenantApprovalEvaluationInputSnapshot {
    return {
      costCenterCode: order.costCenter,
      businessDispatchSubtype: order.businessDispatchSubtype,
      reservationWindowStart: order.reservationWindowStart,
      reservationWindowEnd: order.reservationWindowEnd,
      passengerId: order.passenger.passengerId ?? null,
      passengerRole: order.passenger.roles?.[0] ?? null,
      amountMinor: order.quotedFare?.amountMinor ?? null,
      currency: order.quotedFare?.currency ?? null,
      vehiclePreference: order.vehiclePreference,
      partnerEntrySlug: order.partnerEntrySlug,
      eligibilityVerificationId: order.eligibilityVerificationId,
      signoffRequired: order.proofRequirements.signoffRequired,
      expenseProofRequired: order.proofRequirements.expenseProofRequired,
    };
  }

  private resolveApprovalStateFromEvaluation(
    evaluation: TenantApprovalEvaluationResult | null,
  ): TenantBookingApprovalState {
    if (!evaluation) {
      return "not_required";
    }
    if (evaluation.outcome?.blocked) {
      return "blocked";
    }
    if (evaluation.outcome?.approvalRequired) {
      return "pending";
    }
    return "not_required";
  }

  private recordBookingApprovalStateChanged(
    order: OwnedOrderRecord,
    previousState: TenantBookingApprovalState,
    requestId?: string,
  ) {
    if (order.approvalState === previousState) {
      return;
    }

    this.recordAudit(
      {
        actorId: null,
        actorType: "tenant_admin",
        tenantId: order.tenantId,
        moduleName: "order",
        actionName: "booking.approval_state.changed",
        resourceType: "booking",
        resourceId: order.bookingId ?? order.orderId,
        newValuesSummary: {
          orderId: order.orderId,
          previousState,
          approvalState: order.approvalState,
          approvalRequestIds: order.approvalRequestIds,
        },
      },
      requestId,
    );
  }

  private refreshPassengerDisclosureSnapshot(
    order: OwnedOrderRecord,
    persistChanges = true,
    options?: {
      channel?: PassengerDisclosureChannel;
    },
  ): MaybePromise<OwnedOrderRecord> {
    if (
      !this.sandboxDispatchGateService ||
      !order.bookingId ||
      !order.businessDispatchSubtype
    ) {
      return order;
    }

    return this.afterMaybePromise(
      this.sandboxDispatchGateService.resolvePassengerDisclosureForBooking({
        tenantId: order.tenantId,
        businessDispatchSubtype: order.businessDispatchSubtype,
        partnerEntrySlug: order.partnerEntrySlug,
        channel: this.resolvePassengerDisclosureChannel(
          order,
          undefined,
          options?.channel,
        ),
      }),
      (resolvedDisclosure) => {
        const previous = order.passengerDisclosure;
        const canReuseAcknowledgement =
          resolvedDisclosure !== null &&
          this.canReusePassengerDisclosureAcknowledgement(
            previous,
            resolvedDisclosure,
          );
        const nextDisclosure =
          resolvedDisclosure === null
            ? null
            : {
                ...resolvedDisclosure,
                acknowledgedAt:
                  canReuseAcknowledgement && previous
                    ? previous.acknowledgedAt
                    : null,
                acknowledgementRecordId: canReuseAcknowledgement
                  ? (previous?.acknowledgementRecordId ?? null)
                  : null,
              };

        if (this.samePassengerDisclosure(previous, nextDisclosure)) {
          return order;
        }

        order.passengerDisclosure = nextDisclosure;
        order.updatedAt = new Date().toISOString();
        if (persistChanges) {
          this.persistChanges(
            {
              orders: [order],
            },
            "refresh_passenger_disclosure",
          );
        }
        return order;
      },
    );
  }

  private samePassengerDisclosure(
    left: PassengerDisclosureRequirementSnapshot | null,
    right: PassengerDisclosureRequirementSnapshot | null,
  ) {
    if (left === right) {
      return true;
    }
    if (!left || !right) {
      return false;
    }
    return (
      left.channel === right.channel &&
      left.policyId === right.policyId &&
      left.policyVersion === right.policyVersion &&
      left.messageCode === right.messageCode &&
      left.requiresAcknowledgement === right.requiresAcknowledgement &&
      left.acknowledgementMode === right.acknowledgementMode &&
      left.acknowledgedAt === right.acknowledgedAt &&
      left.acknowledgementRecordId === right.acknowledgementRecordId
    );
  }

  private canReusePassengerDisclosureAcknowledgement(
    previous: PassengerDisclosureRequirementSnapshot | null | undefined,
    next: PassengerDisclosureRequirementSnapshot,
  ) {
    if (!previous) {
      return false;
    }
    return (
      previous.channel === next.channel &&
      previous.policyId === next.policyId &&
      previous.policyVersion === next.policyVersion &&
      previous.messageCode === next.messageCode &&
      previous.requiresAcknowledgement === next.requiresAcknowledgement &&
      previous.acknowledgementMode === next.acknowledgementMode
    );
  }

  private resolvePassengerDisclosureChannel(
    order: Pick<
      OwnedOrderRecord,
      "partnerEntrySlug" | "orderSource" | "passengerDisclosure"
    >,
    identity?: BootstrapRequestIdentity | null,
    explicitChannel?: PassengerDisclosureChannel,
  ): PassengerDisclosureChannel {
    if (explicitChannel) {
      return explicitChannel;
    }
    if (
      identity?.actorType === "ops_user" ||
      identity?.actorType === "platform_admin"
    ) {
      return "ops_console";
    }
    if (order.orderSource === "phone") {
      return "call_center";
    }
    if (order.partnerEntrySlug) {
      return "partner_portal";
    }
    if (order.passengerDisclosure?.channel === "ops_console") {
      return "ops_console";
    }
    return "tenant_portal";
  }

  private resolvePassengerDisclosureAcknowledgementActor(
    identity?: BootstrapRequestIdentity | null,
  ) {
    if (identity?.actorType === "tenant_admin" && identity.actorId) {
      return {
        actorType: "tenant_admin" as const,
        actorRef: identity.actorId,
      };
    }
    if (identity?.actorType === "ops_user" && identity.actorId) {
      return {
        actorType: "ops_user" as const,
        actorRef: identity.actorId,
      };
    }

    return {
      actorType: "passenger" as const,
      actorRef: null,
    };
  }

  private captureTenantGovernanceSnapshot() {
    return (
      this.tenantPartnerService?.createGovernanceMutationSnapshot?.() ?? null
    );
  }

  private restoreTenantGovernanceSnapshot(
    snapshot: ReturnType<
      TenantPartnerService["createGovernanceMutationSnapshot"]
    > | null,
  ) {
    if (snapshot && this.tenantPartnerService) {
      this.tenantPartnerService.restoreGovernanceMutationSnapshot?.(snapshot);
    }
  }

  private restoreOrderSnapshot(snapshot: OwnedOrderRecord) {
    this.orders = [
      this.cloneOrder(snapshot),
      ...this.orders.filter(
        (candidate) => candidate.orderId !== snapshot.orderId,
      ),
    ];
  }

  private withRollback<T>(
    run: () => MaybePromise<T>,
    rollback: () => void,
  ): MaybePromise<T> {
    try {
      const result = run();
      if (result instanceof Promise) {
        return result.catch((error) => {
          rollback();
          throw error;
        });
      }
      return result;
    } catch (error) {
      rollback();
      throw error;
    }
  }

  private afterMaybePromise<T, TResult>(
    value: MaybePromise<T>,
    next: (value: T) => MaybePromise<TResult>,
  ): MaybePromise<TResult> {
    if (value instanceof Promise) {
      return value.then((resolved) => next(resolved));
    }
    return next(value);
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
      passengerDisclosure: order.passengerDisclosure,
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
      approvalState: order.approvalState,
      approvalRequestIds: [...order.approvalRequestIds],
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

  private listEligibleDispatchCandidates(order: OwnedOrderRecord) {
    const destination = this.resolvePickupEtaDestination(order);
    return this.vehicleEligibilityService
      ? this.vehicleEligibilityService.listEligibleSupply(
          this.vehicleEligibilityService.resolveServiceProductForOwnedOrder(
            order,
          ),
          { destination },
        )
      : this.regulatoryRegistryService.getEligibleCandidates(
          order.serviceBucket,
          destination,
        );
  }

  private async listDispatchCandidatesWithEligibility(
    dispatchJob: DispatchJobRecord,
    order: OwnedOrderRecord,
    includeIneligible: boolean,
  ): Promise<DispatchCandidate[]> {
    if (!this.vehicleEligibilityService || !this.runtimeEligibilityEvaluator) {
      return this.listEligibleDispatchCandidates(order);
    }

    const destination = this.resolvePickupEtaDestination(order);
    const serviceProduct =
      this.vehicleEligibilityService.resolveServiceProductForOwnedOrder(order);
    const candidates = this.regulatoryRegistryService.getEligibleCandidates(
      order.serviceBucket,
      destination,
    );
    const sourcePlatform = this.forwarderSourceMap.get(order.orderId) ?? null;

    const evaluatedCandidates = await Promise.all(
      candidates.map(async (candidate) => {
        const decision = await this.runtimeEligibilityEvaluator!.evaluate({
          orderId: order.orderId,
          dispatchJobId: dispatchJob.dispatchJobId,
          driverId: candidate.driverId,
          vehicleId: candidate.vehicleId,
          serviceProductCode: serviceProduct,
          sourcePlatform,
          currentLocation: candidate.currentLocation ?? null,
        });

        return {
          ...candidate,
          serviceProductContext: {
            serviceProductId: decision.serviceProductId,
            serviceProductCode: decision.serviceProductCode,
            policyVersion: decision.policyVersion,
            evaluatedAt: decision.evaluatedAt,
          },
          eligibilityDecision: decision.decision,
          hardReasonCodes: [...decision.hardReasonCodes],
          softReasonCodes: [...decision.softReasonCodes],
          missingRequirements: [...decision.missingRequirements],
          locationState: decision.locationState,
        } satisfies DispatchCandidate;
      }),
    );

    if (includeIneligible) {
      return evaluatedCandidates;
    }

    const visibleCandidates = evaluatedCandidates.filter(
      (candidate) => candidate.eligibilityDecision !== "ineligible",
    );
    if (visibleCandidates.length > 0) {
      return visibleCandidates;
    }

    // Scarcity fallback: surface decorated ineligible rows so dispatch is not a
    // bare empty list -- EXCEPT candidates that hard-failed a non-bypassable gate
    // (e.g. the airport-permit requirement), which must never be offered for the
    // exact service product even when no eligible supply exists.
    return evaluatedCandidates.filter(
      (candidate) =>
        !candidate.hardReasonCodes.some((code) =>
          NON_BYPASSABLE_HARD_REASON_CODES.has(code),
        ),
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

  private applyServiceAreaCreationPolicy(
    order: OwnedOrderRecord,
    context: SpatialAuditContext,
    requestId?: string,
  ): void {
    const resolution = this.resolveServiceAreaGate(order);
    if (!resolution) {
      return;
    }

    order.spatialAudit = this.buildSpatialAuditSnapshot(
      order,
      resolution,
      context,
    );
    this.recordSpatialAuditSnapshot(order, context, requestId);

    const { evaluation, missingItems } = resolution;
    if (missingItems.length > 0) {
      this.addComplianceFlag(order, "service_area_legacy_text_manual_review");
    }
    if (!evaluation) {
      return;
    }
    if (evaluation.decision === "not_serviceable") {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        this.resolveServiceAreaBlockCode(evaluation),
        this.resolveServiceAreaMessage(
          evaluation,
          "This booking is outside the service area or violates a stop policy.",
        ),
        this.serviceAreaErrorDetails(order, evaluation, missingItems),
      );
    }
    if (evaluation.decision === "manual_review") {
      this.addComplianceFlag(order, "service_area_manual_review");
      return;
    }
    if (missingItems.length === 0) {
      this.addComplianceFlag(order, "service_area_serviceable");
    }
  }

  private assertDispatchComplianceGatesClear(order: OwnedOrderRecord): void {
    const gates = this.listComplianceGatesForOrder(order);
    const dispatchBlocking = gates.filter((gate) =>
      gate.impacts.some(
        (impact) => impact.stage === "dispatch" && impact.effect === "blocked",
      ),
    );
    if (dispatchBlocking.length > 0) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "DISPATCH_COMPLIANCE_BLOCKED",
        "Order cannot dispatch until blocking compliance gates are cleared.",
        {
          orderId: order.orderId,
          gateTypes: dispatchBlocking.map((gate) => gate.gateType),
          reasonCodes: dispatchBlocking.flatMap((gate) => gate.evidenceRefs),
          missingItems: dispatchBlocking.flatMap((gate) => gate.missingItems),
        },
      );
    }

    const dispatchReviewRequired = gates.filter((gate) =>
      gate.impacts.some(
        (impact) =>
          impact.stage === "dispatch" && impact.effect === "review_required",
      ),
    );
    if (dispatchReviewRequired.length > 0) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "DISPATCH_REQUIRES_MANUAL_REVIEW",
        "Order requires manual review before dispatch.",
        {
          orderId: order.orderId,
          gateTypes: dispatchReviewRequired.map((gate) => gate.gateType),
          reasonCodes: dispatchReviewRequired.flatMap(
            (gate) => gate.evidenceRefs,
          ),
          missingItems: dispatchReviewRequired.flatMap(
            (gate) => gate.missingItems,
          ),
        },
      );
    }
  }

  private resolveServiceAreaGate(
    order: OwnedOrderRecord,
  ): ServiceAreaGateResolution | null {
    if (order.spatialAudit) {
      return this.resolveServiceAreaGateFromSnapshot(order.spatialAudit);
    }

    if (!this.serviceAreaService) {
      return null;
    }

    const serviceProductType = this.resolveServiceProductCodeForOrder(order);
    const pickup = this.toServiceAreaPoint(order.pickup);
    const dropoff = this.toServiceAreaPoint(order.dropoff);
    const missingItems = [
      ...(pickup ? [] : ["pickup_coordinates"]),
      ...(dropoff ? [] : ["dropoff_coordinates"]),
    ];

    if (!serviceProductType) {
      return {
        serviceProductType,
        pickup,
        dropoff,
        missingItems: ["service_product_type", ...missingItems],
        evaluation: null,
      };
    }

    if (!pickup) {
      return {
        serviceProductType,
        pickup,
        dropoff,
        missingItems,
        evaluation: null,
      };
    }

    const evaluation = this.serviceAreaService.evaluate({
      serviceProductType,
      pickup,
      ...(dropoff ? { dropoff } : {}),
      requestedAt: order.createdAt,
    });

    return {
      serviceProductType,
      pickup,
      dropoff,
      missingItems,
      evaluation,
    };
  }

  private resolveServiceAreaGateFromSnapshot(
    snapshot: OwnedOrderSpatialAuditSnapshot,
  ): ServiceAreaGateResolution {
    const pickup =
      snapshot.stops.find((stop) => stop.kind === "pickup")?.location ?? null;
    const dropoff =
      snapshot.stops.find((stop) => stop.kind === "dropoff")?.location ?? null;

    return {
      serviceProductType: snapshot.serviceProductType,
      pickup,
      dropoff,
      missingItems: [...snapshot.missingItems],
      evaluation: snapshot.serviceAreaEvaluation
        ? this.cloneServiceAreaEvaluation(snapshot.serviceAreaEvaluation)
        : null,
    };
  }

  private buildSpatialAuditSnapshot(
    order: OwnedOrderRecord,
    resolution: ServiceAreaGateResolution,
    context: SpatialAuditContext,
  ): OwnedOrderSpatialAuditSnapshot {
    const evaluation = resolution.evaluation
      ? this.cloneServiceAreaEvaluation(resolution.evaluation)
      : null;
    const decision = evaluation?.decision ?? "manual_review";

    return {
      snapshotId: randomUUID(),
      snapshotVersion: 1,
      capturedAt: new Date().toISOString(),
      capturedReason: "booking_creation",
      actorId: context.actorId,
      actorType: context.actorType,
      surface: context.surface,
      serviceProductType: resolution.serviceProductType,
      decision,
      stops: [
        this.buildSpatialAuditStopSnapshot("pickup", order.pickup, context),
        this.buildSpatialAuditStopSnapshot("dropoff", order.dropoff, context),
      ],
      serviceAreaEvaluation: evaluation,
      serviceAreaCodes: [...(evaluation?.serviceAreaCodes ?? [])],
      geometryVersionRefs: [...(evaluation?.geometryVersionRefs ?? [])],
      reasonCodes: [...(evaluation?.reasonCodes ?? [])],
      reasonMessages: [...(evaluation?.reasonMessages ?? [])],
      missingItems: [...resolution.missingItems],
      auditEvents: [],
    };
  }

  private buildSpatialAuditStopSnapshot(
    kind: "pickup" | "dropoff",
    address: AddressPayload,
    context: SpatialAuditContext,
  ): OwnedOrderSpatialAuditStopSnapshot {
    const location = this.toServiceAreaPoint(address);
    const missingItems = location ? [] : [`${kind}_coordinates`];

    return {
      kind,
      addressText: address.address,
      location,
      coordinateProvenance: this.buildCoordinateProvenance(address, context),
      provenanceComplete: hasAddressCoordinateProvenance(address),
      missingItems,
    };
  }

  private buildCoordinateProvenance(
    address: AddressPayload,
    context: SpatialAuditContext,
  ): GeoCoordinateProvenance | null {
    if (address.coordinateProvenance) {
      return this.cloneCoordinateProvenance(address.coordinateProvenance);
    }

    const hasTopLevelProvenance = Boolean(
      address.coordinateSource ||
      address.geocodeProvider ||
      address.geocodeConfidence ||
      address.providerCandidateId ||
      address.placeId ||
      address.selectedByActorId ||
      address.selectedAt ||
      address.pinnedByActorId ||
      address.pinnedAt ||
      address.manualOverrideReason,
    );
    if (!hasTopLevelProvenance && hasAddressCoordinates(address)) {
      return null;
    }

    return {
      coordinateSource:
        address.coordinateSource ??
        (hasAddressCoordinates(address) ? "manual_pin" : "legacy_text"),
      geocodeProvider: address.geocodeProvider ?? null,
      geocodeConfidence: address.geocodeConfidence ?? null,
      providerCandidateId: address.providerCandidateId ?? null,
      placeId: address.placeId ?? null,
      coordinateAccuracyM: address.coordinateAccuracyM ?? null,
      selectedByActorId:
        address.selectedByActorId ?? address.pinnedByActorId ?? context.actorId,
      selectedAt: address.selectedAt ?? address.pinnedAt ?? null,
      pinnedByActorId: address.pinnedByActorId ?? null,
      pinnedAt: address.pinnedAt ?? null,
      manualOverrideReason: address.manualOverrideReason ?? null,
      surface: address.surface ?? context.surface,
    };
  }

  private cloneCoordinateProvenance(
    provenance: GeoCoordinateProvenance,
  ): GeoCoordinateProvenance {
    return {
      ...provenance,
    };
  }

  private async recordSpatialAuditSnapshot(
    order: OwnedOrderRecord,
    context: SpatialAuditContext,
    requestId?: string,
  ): Promise<void> {
    if (!order.spatialAudit) {
      return;
    }

    const auditLog = await this.recordAudit(
      {
        actorId: context.actorId,
        actorType: context.actorType,
        tenantId: order.tenantId,
        moduleName: "order",
        actionName: "order.spatial_audit.snapshot_created",
        resourceType: "order",
        resourceId: order.orderId,
        newValuesSummary: {
          snapshotId: order.spatialAudit.snapshotId,
          decision: order.spatialAudit.decision,
          surface: order.spatialAudit.surface,
          serviceProductType: order.spatialAudit.serviceProductType,
          serviceAreaCodes: order.spatialAudit.serviceAreaCodes,
          geometryVersionRefs: order.spatialAudit.geometryVersionRefs,
          reasonCodes: order.spatialAudit.reasonCodes,
          missingItems: order.spatialAudit.missingItems,
          provenanceComplete: order.spatialAudit.stops.every(
            (stop) => stop.provenanceComplete,
          ),
        },
      },
      requestId,
    );
    if (!auditLog) {
      return;
    }

    order.spatialAudit.auditEvents = [
      ...order.spatialAudit.auditEvents,
      {
        auditId: auditLog.auditId,
        actionName: auditLog.actionName,
        actorId: auditLog.actorId,
        actorType: auditLog.actorType,
        createdAt: auditLog.createdAt,
      },
    ];
  }

  private buildServiceAreaGate(
    order: OwnedOrderRecord,
  ): ComplianceGateRecord | null {
    const resolution = this.resolveServiceAreaGate(order);
    if (!resolution) {
      return null;
    }

    const { evaluation, missingItems, serviceProductType } = resolution;
    const missingCoordinates = missingItems.length > 0;
    const decision = evaluation?.decision ?? "manual_review";
    const blocked = decision === "not_serviceable";
    const reviewRequired =
      !blocked && (missingCoordinates || decision === "manual_review");
    const state: ComplianceGateState = blocked
      ? "blocked"
      : reviewRequired
        ? "review_required"
        : "clear";
    const reasonCodes =
      evaluation?.reasonCodes.length === 0
        ? []
        : (evaluation?.reasonCodes ?? []);
    const evidenceRefs = [
      ...(evaluation?.geometryVersionRefs ?? []),
      ...reasonCodes,
    ];

    return {
      gateType: "service_area",
      title: "Service-area and stop-policy authority",
      state,
      required: true,
      blocking: blocked,
      evidenceState:
        state === "clear"
          ? "verified"
          : missingCoordinates
            ? "missing"
            : "submitted",
      evidenceRefs,
      missingItems,
      nextAction:
        state === "clear"
          ? "Pickup and dropoff coordinates are serviceable for the selected service product."
          : blocked
            ? this.resolveServiceAreaMessage(
                evaluation,
                "Booking violates service-area or stop-policy rules and cannot dispatch.",
              )
            : missingCoordinates
              ? "Confirm pickup and dropoff map pins before dispatch, or keep this booking in manual review."
              : this.resolveServiceAreaMessage(
                  evaluation,
                  "Ops must review this stop policy before dispatch.",
                ),
      reviewerLabel: state === "clear" ? null : "ops dispatch / service area",
      overrideAllowed: state !== "clear",
      overrideActors: state === "clear" ? [] : ["ops_user", "platform_admin"],
      impacts: [
        {
          stage: "dispatch",
          effect: blocked
            ? "blocked"
            : reviewRequired
              ? "review_required"
              : "clear",
          reason:
            state === "clear"
              ? `Service-area evaluation is clear for ${serviceProductType ?? "unknown service product"}.`
              : blocked
                ? "Dispatch is blocked by service-area or stop-policy authority."
                : "Dispatch requires manual review before release.",
        },
        {
          stage: "completion",
          effect: "clear",
          reason:
            "Service-area checks are enforced before dispatch and do not block driver completion once released.",
        },
        {
          stage: "settlement",
          effect: state === "clear" ? "clear" : "review_required",
          reason:
            state === "clear"
              ? "Service-area evaluation evidence is available for audit."
              : "Spatial review outcome must be retained for compliance follow-up.",
        },
      ],
    };
  }

  private toServiceAreaPoint(address: AddressPayload): GeoPoint | null {
    if (!hasAddressCoordinates(address)) {
      return null;
    }
    return {
      lat: address.lat as number,
      lng: address.lng as number,
    };
  }

  private addComplianceFlag(order: OwnedOrderRecord, flag: string): void {
    if (!order.complianceFlags.includes(flag)) {
      order.complianceFlags = [...order.complianceFlags, flag];
    }
  }

  private resolveServiceAreaBlockCode(
    evaluation: ServiceAreaEvaluationResult,
  ): string {
    if (evaluation.reasonCodes.includes("PICKUP_NOT_ALLOWED")) {
      return "PICKUP_NOT_ALLOWED";
    }
    if (
      evaluation.reasonCodes.some((reasonCode) =>
        reasonCode.endsWith("_AREA_NOT_SERVICEABLE"),
      )
    ) {
      return "SERVICE_AREA_NOT_SERVICEABLE";
    }
    return evaluation.reasonCodes[0] ?? "SERVICE_AREA_NOT_SERVICEABLE";
  }

  private resolveServiceAreaMessage(
    evaluation: ServiceAreaEvaluationResult | null,
    fallback: string,
  ): string {
    return evaluation?.reasonMessages[0] ?? fallback;
  }

  private serviceAreaErrorDetails(
    order: OwnedOrderRecord,
    evaluation: ServiceAreaEvaluationResult,
    missingItems: string[],
  ) {
    return {
      orderSource: order.orderSource,
      tenantId: order.tenantId,
      serviceProductType: evaluation.serviceProductType,
      decision: evaluation.decision,
      serviceAreaCodes: evaluation.serviceAreaCodes,
      geometryVersionRefs: evaluation.geometryVersionRefs,
      reasonCodes: evaluation.reasonCodes,
      reasonMessages: evaluation.reasonMessages,
      missingItems,
      spatialAuditSnapshotId: order.spatialAudit?.snapshotId ?? null,
    };
  }

  private cloneServiceAreaEvaluation(
    evaluation: ServiceAreaEvaluationResult,
  ): ServiceAreaEvaluationResult {
    return {
      ...evaluation,
      stops: evaluation.stops.map((stop) => ({
        ...stop,
        location: { ...stop.location },
        serviceAreaCodes: [...stop.serviceAreaCodes],
        policyCodes: [...stop.policyCodes],
        geometryVersionRefs: [...stop.geometryVersionRefs],
        reasonCodes: [...stop.reasonCodes],
        reasonMessages: [...stop.reasonMessages],
      })),
      serviceAreaCodes: [...evaluation.serviceAreaCodes],
      geometryVersionRefs: [...evaluation.geometryVersionRefs],
      reasonCodes: [...evaluation.reasonCodes],
      reasonMessages: [...evaluation.reasonMessages],
    };
  }

  private cloneSpatialAuditSnapshot(
    snapshot: OwnedOrderSpatialAuditSnapshot,
  ): OwnedOrderSpatialAuditSnapshot {
    return {
      ...snapshot,
      stops: snapshot.stops.map((stop) => ({
        ...stop,
        location: stop.location ? { ...stop.location } : null,
        coordinateProvenance: stop.coordinateProvenance
          ? this.cloneCoordinateProvenance(stop.coordinateProvenance)
          : null,
        missingItems: [...stop.missingItems],
      })),
      serviceAreaEvaluation: snapshot.serviceAreaEvaluation
        ? this.cloneServiceAreaEvaluation(snapshot.serviceAreaEvaluation)
        : null,
      serviceAreaCodes: [...snapshot.serviceAreaCodes],
      geometryVersionRefs: [...snapshot.geometryVersionRefs],
      reasonCodes: [...snapshot.reasonCodes],
      reasonMessages: [...snapshot.reasonMessages],
      missingItems: [...snapshot.missingItems],
      auditEvents: snapshot.auditEvents.map((event) => ({ ...event })),
    };
  }

  private resolveBookingSpatialAuditContext(
    order: OwnedOrderRecord,
    identity?: BootstrapRequestIdentity | null,
  ): SpatialAuditContext {
    const isPartnerBooking = Boolean(order.partnerId || order.partnerEntrySlug);
    return {
      actorId: identity?.actorId ?? null,
      actorType: identity
        ? this.coerceAuditActorType(identity.actorType)
        : isPartnerBooking
          ? "partner_api_key"
          : "tenant_admin",
      surface: isPartnerBooking ? "partner_booking" : "tenant_console",
    };
  }

  private coerceAuditActorType(
    actorType: BootstrapRequestIdentity["actorType"] | null | undefined,
  ): AuditLogRecord["actorType"] {
    switch (actorType) {
      case "platform_admin":
      case "tenant_admin":
      case "ops_user":
      case "partner_api_key":
      case "referral_passenger":
        return actorType;
      default:
        return "system";
    }
  }

  private listComplianceGatesForOrder(
    order: OwnedOrderRecord,
    task = this.findLatestTaskForOrder(order.orderId),
  ): ComplianceGateRecord[] {
    const gates: ComplianceGateRecord[] = [];
    const serviceAreaGate = this.buildServiceAreaGate(order);
    if (serviceAreaGate) {
      gates.push(serviceAreaGate);
    }

    const addressCaptureGate = this.buildAddressCaptureGate(order);
    if (addressCaptureGate) {
      gates.push(addressCaptureGate);
    }

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

  private buildAddressCaptureGate(
    order: OwnedOrderRecord,
  ): ComplianceGateRecord | null {
    const fallbackReview = order.mapFallbackReview;
    if (!fallbackReview?.reasonCode?.trim()) {
      return null;
    }

    return {
      gateType: "address_capture",
      title: "Address capture fallback review",
      state: "review_required",
      required: true,
      blocking: false,
      evidenceState: "submitted",
      evidenceRefs: [
        fallbackReview.reasonCode,
        ...(fallbackReview.providerReasonCode
          ? [fallbackReview.providerReasonCode]
          : []),
      ],
      missingItems: [],
      nextAction:
        "Dispatch requires manual review because address capture continued while the map provider was unavailable or degraded.",
      reviewerLabel: "callcenter / dispatch mapping",
      overrideAllowed: true,
      overrideActors: ["ops_user", "platform_admin"],
      impacts: [
        {
          stage: "dispatch",
          effect: "review_required",
          reason:
            "Dispatch stays in manual review until an operator confirms the fallback map capture.",
        },
        {
          stage: "completion",
          effect: "clear",
          reason:
            "Address capture fallback does not block completion after dispatch is explicitly released.",
        },
        {
          stage: "settlement",
          effect: "review_required",
          reason:
            "Audit should retain why dispatch proceeded from a degraded map-capture path.",
        },
      ],
    };
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

  private buildDriverTaskProofPendingError(
    order: OwnedOrderRecord,
    proof: CompletionProofBundle,
  ): ApiRequestError | null {
    if (proof.photos.length < order.proofRequirements.minPhotoCount) {
      return new ApiRequestError(
        HttpStatus.CONFLICT,
        "MIN_PHOTO_COUNT_NOT_MET",
        "Completion proof does not satisfy minimum photo count.",
        {
          minPhotoCount: order.proofRequirements.minPhotoCount,
        },
      );
    }

    if (order.proofRequirements.signoffRequired && !proof.signatureId) {
      return new ApiRequestError(
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
      (proof.expenseItems?.length ?? 0) === 0
    ) {
      return new ApiRequestError(
        HttpStatus.CONFLICT,
        "EXPENSE_PROOF_REQUIRED",
        "Expense proof is required before completion.",
        {
          requirement: "expense_items",
        },
      );
    }

    return null;
  }

  private async markDriverTaskProofPending(
    task: DriverTaskRecord,
    assignment: DispatchAssignmentRecord,
    order: OwnedOrderRecord,
    proof: CompletionProofBundle,
    requestId?: string,
  ): Promise<void> {
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
    await this.persistChangesRequired(
      {
        orders: [order],
        dispatchAssignments: [assignment],
        driverTasks: [task],
        dispatchTraceLogs: [traceLog],
      },
      "driver_task_proof_pending",
    );
    await this.ownedMobilityTaskEventsService.publishTaskUpdated(
      task,
      order,
      requestId,
    );
    await this.publishLatestDispatchJobUpdate(order.orderId, requestId);
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

  private resolveTenantBookingCostCenter(
    tenantId: string,
    rawCode: string | null | undefined,
  ): string | null {
    // Partial test mocks of TenantPartnerService may omit the validator; fall
    // through to text normalization when it is absent so unrelated tests do
    // not have to stub it. Production wiring always exposes the method.
    if (
      this.tenantPartnerService &&
      typeof this.tenantPartnerService.validateBookingCostCenter === "function"
    ) {
      return this.tenantPartnerService.validateBookingCostCenter(
        tenantId,
        rawCode,
      ).value;
    }
    return this.normalizeNullableText(rawCode);
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
    identity?: BootstrapRequestIdentity | null,
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

    this.assertPartnerEntryIdentity(identity, entry);

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

  private assertPartnerEntryIdentity(
    identity: BootstrapRequestIdentity | null | undefined,
    entry: PartnerChannelEntryRecord,
  ) {
    if (!identity || identity.realm !== "partner") {
      return;
    }

    const mismatch =
      identity.actorType === "referral_passenger"
        ? identity.tenantId !== entry.tenantId ||
          identity.partnerId !== entry.partnerId ||
          identity.partnerProgramId !== entry.programId ||
          identity.partnerEntrySlug !== entry.entrySlug
        : identity.actorType !== "partner_api_key" ||
          (identity.tenantId !== null &&
            identity.tenantId !== undefined &&
            identity.tenantId !== entry.tenantId) ||
          (identity.partnerId !== null &&
            identity.partnerId !== undefined &&
            identity.partnerId !== entry.partnerId) ||
          (identity.partnerProgramId !== null &&
            identity.partnerProgramId !== undefined &&
            identity.partnerProgramId !== entry.programId) ||
          (identity.partnerEntrySlug !== null &&
            identity.partnerEntrySlug !== undefined &&
            identity.partnerEntrySlug !== entry.entrySlug);

    if (mismatch) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "PARTNER_SCOPE_MISMATCH",
        "Authenticated partner identity cannot book through another partner entry.",
        {
          entrySlug: entry.entrySlug,
          tenantId: entry.tenantId,
        },
      );
    }
  }

  private normalizeReferralRatingTags(value: string[] | undefined) {
    if (value === undefined) {
      return [];
    }
    if (!Array.isArray(value) || value.length > 10) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "PASSENGER_RATING_TAGS_INVALID",
        "tags must contain at most 10 values.",
      );
    }
    return [
      ...new Set(
        value.map((item) => item?.trim()).filter((item) => item.length > 0),
      ),
    ].sort();
  }

  private assertIdempotentReferralRating(
    existing: {
      orderId: string;
      score: 1 | 2 | 3 | 4 | 5;
      comment?: string;
      tags: string[];
      submittedAt: string;
    },
    score: 1 | 2 | 3 | 4 | 5,
    tags: string[],
    comment: string | null,
  ) {
    if (
      existing.score !== score ||
      (existing.comment ?? null) !== comment ||
      JSON.stringify([...existing.tags].sort()) !== JSON.stringify(tags)
    ) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "PASSENGER_RATING_ALREADY_SUBMITTED",
        "A different rating has already been submitted for this trip.",
        { orderId: existing.orderId },
      );
    }
  }

  private getReferralLifecycle(order: OwnedOrderRecord) {
    return order.referralPassengerLifecycle ?? null;
  }

  private updateReferralLifecycle(
    order: OwnedOrderRecord,
    patch: NonNullable<OwnedOrderRecord["referralPassengerLifecycle"]>,
  ) {
    const nextOrder: OwnedOrderRecord = {
      ...order,
      referralPassengerLifecycle: {
        ...(this.getReferralLifecycle(order) ?? {}),
        ...patch,
      },
      updatedAt: new Date().toISOString(),
    };

    this.orders = this.orders.map((candidate) =>
      candidate.orderId === order.orderId ? nextOrder : candidate,
    );

    return nextOrder;
  }

  private assertPartnerOrderIdentity(
    identity: BootstrapRequestIdentity | null | undefined,
    order: OwnedOrderRecord,
  ) {
    if (!identity || identity.realm !== "partner") {
      return;
    }

    const passengerId = identity.drtsPassengerId ?? identity.actorId;

    const mismatch =
      (identity.actorType !== "partner_api_key" &&
        identity.actorType !== "referral_passenger") ||
      !order.partnerEntrySlug ||
      (identity.tenantId && identity.tenantId !== order.tenantId) ||
      (identity.partnerId && identity.partnerId !== order.partnerId) ||
      (identity.partnerProgramId &&
        identity.partnerProgramId !== order.partnerProgramId) ||
      identity.partnerEntrySlug !== order.partnerEntrySlug ||
      (identity.actorType === "referral_passenger" &&
        passengerId &&
        order.passenger?.passengerId &&
        passengerId !== order.passenger.passengerId);

    if (mismatch) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "PARTNER_SCOPE_MISMATCH",
        "Authenticated partner identity cannot access another partner/passenger booking.",
        {
          orderId: order.orderId,
          tenantId: order.tenantId,
        },
      );
    }
  }

  async createReferralPassengerBooking(
    command: CreateReferralPassengerBookingCommand,
    identity?: BootstrapRequestIdentity | null,
    requestId?: string,
    runtimeProfileCodeHeader?: string,
    idempotencyKeyHeader?: string,
  ): Promise<TenantBookingResult> {
    if (
      !identity ||
      identity.realm !== "partner" ||
      identity.actorType !== "referral_passenger"
    ) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "REFERRAL_PASSENGER_IDENTITY_REQUIRED",
        "Creating a referral passenger booking requires an active referral_passenger identity.",
      );
    }

    if (identity.partnerEntrySlug !== command.entrySlug) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "PARTNER_SCOPE_MISMATCH",
        "Referral passenger identity cannot book for a different entrySlug.",
      );
    }

    const tenantId = identity.tenantId;
    if (!tenantId) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "TENANT_ID_REQUIRED",
        "Referral passenger identity missing tenantId.",
      );
    }

    const passengerId =
      identity.drtsPassengerId ?? identity.actorId ?? "pax-ref-anon";

    if (!this.tenantPartnerService) {
      throw new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "PARTNER_ENTRY_UNAVAILABLE",
        "Partner entry services are unavailable for this booking flow.",
        { tenantId, entrySlug: command.entrySlug },
      );
    }
    const partnerEntry = this.tenantPartnerService.getPartnerEntry(
      command.entrySlug,
    );

    try {
      this.tenantPartnerService.getPassengerMasterRecord(tenantId, passengerId);
    } catch {
      this.tenantPartnerService.upsertPassenger(tenantId, {
        passengerId,
        fullName: command.passengerName || "Referral Passenger",
        mobile: command.passengerPhone || "0912345678",
      });
    }

    // Reconcile header and body idempotency key with documented precedence:
    // HTTP Header `Idempotency-Key` takes precedence over body field `idempotencyKey`.
    const resolvedIdempotencyKey =
      idempotencyKeyHeader?.trim() ||
      command.idempotencyKey?.trim() ||
      undefined;

    if (resolvedIdempotencyKey) {
      const existing = Array.from(this.orders.values()).find(
        (o) =>
          o.tenantId === tenantId &&
          o.partnerEntrySlug === identity.partnerEntrySlug &&
          o.passenger?.passengerId === passengerId &&
          this.getReferralLifecycle(o)?.bookingIdempotencyKey ===
            resolvedIdempotencyKey,
      );
      if (existing) {
        return {
          orderId: existing.orderId,
          bookingId: existing.bookingId ?? existing.orderId,
          serviceBucket: "business_dispatch",
          businessDispatchSubtype:
            existing.businessDispatchSubtype ?? "enterprise_dispatch",
          dispatchSemantics: "reservation",
          status: existing.status,
          replayed: true,
        };
      }

      const scope = `tenant:${tenantId}:booking_create`;
      const idempotencyService = this.getIdempotencyService();

      const result = await idempotencyService.execute<TenantBookingResult>({
        scope,
        idempotencyKey: resolvedIdempotencyKey,
        tenantId,
        actorId: passengerId,
        requestPath: "/partner/referral/passenger/bookings",
        required: false,
        payload: {
          ...command,
          ...(command.idempotencyKey
            ? { idempotencyKey: resolvedIdempotencyKey }
            : {}),
        },
        execute: async () => {
          const reservationWindowStart =
            command.scheduledAt ?? new Date().toISOString();
          const tenantBookingCommand: CreateTenantBookingCommand = {
            businessDispatchSubtype: partnerEntry.businessDispatchSubtype,
            direction: "pickup",
            pickup: {
              address: command.pickupAddress,
              lat: 25.033,
              lng: 121.565,
            },
            dropoff: {
              address: command.dropoffAddress,
              lat: 25.048,
              lng: 121.517,
            },
            reservationWindowStart,
            reservationWindowEnd: new Date(
              new Date(reservationWindowStart).getTime() + 3600000,
            ).toISOString(),
            passengerId,
            passenger: {
              passengerId,
              name: command.passengerName || "Referral Passenger",
              phone: command.passengerPhone || "0912345678",
            },
            ...(identity.partnerEntrySlug
              ? { partnerEntrySlug: identity.partnerEntrySlug }
              : {}),
          };

          const bookingResult = await this.createTenantBooking(
            tenantBookingCommand,
            tenantId,
            identity,
            requestId,
            runtimeProfileCodeHeader,
          );

          if (
            typeof bookingResult === "object" &&
            bookingResult &&
            "orderId" in bookingResult
          ) {
            const order = this.orders.find(
              (o) => o.orderId === bookingResult.orderId,
            );
            if (order) {
              const nextOrder = this.updateReferralLifecycle(order, {
                bookingIdempotencyKey: resolvedIdempotencyKey,
              });
              await this.persistChangesRequired(
                { orders: [nextOrder] },
                "referral.booking.idempotency",
              );
            }
          }

          return {
            data: {
              ...bookingResult,
              replayed: false,
            },
            statusCode: 201,
          };
        },
      });

      return {
        ...result.data,
        replayed: result.isReplay,
      };
    }

    const reservationWindowStart =
      command.scheduledAt ?? new Date().toISOString();
    const tenantBookingCommand: CreateTenantBookingCommand = {
      // The partner entry owns the service product. VehicleType is a passenger
      // display preference, not an authorization to select a product.
      businessDispatchSubtype: partnerEntry.businessDispatchSubtype,
      direction: "pickup",
      pickup: {
        address: command.pickupAddress,
        lat: 25.033,
        lng: 121.565,
      },
      dropoff: {
        address: command.dropoffAddress,
        lat: 25.048,
        lng: 121.517,
      },
      reservationWindowStart,
      reservationWindowEnd: new Date(
        new Date(reservationWindowStart).getTime() + 3600000,
      ).toISOString(),
      passengerId,
      passenger: {
        passengerId,
        name: command.passengerName || "Referral Passenger",
        phone: command.passengerPhone || "0912345678",
      },
      ...(identity.partnerEntrySlug
        ? { partnerEntrySlug: identity.partnerEntrySlug }
        : {}),
    };

    const result = await this.createTenantBooking(
      tenantBookingCommand,
      tenantId,
      identity,
      requestId,
      runtimeProfileCodeHeader,
    );

    return result;
  }

  private resolveReferralTripDetails(order: OwnedOrderRecord) {
    const assignment = this.dispatchAssignments.find(
      (a) =>
        a.orderId === order.orderId &&
        ["assigned", "accepted"].includes(a.status),
    );
    const task = this.driverTasks.find(
      (t) =>
        t.orderId === order.orderId &&
        !["cancelled", "rejected"].includes(t.status),
    );

    const candidate = (order as unknown as Record<string, unknown>)
      .dispatchCandidate as
      | {
          driverName?: string;
          plateNumber?: string;
          driverPhoneMasked?: string;
        }
      | undefined;

    let driverName: string | null = candidate?.driverName ?? null;
    let plateNumber: string | null = candidate?.plateNumber ?? null;
    let driverPhoneMasked: string | null = candidate?.driverPhoneMasked ?? null;

    const driverId = task?.driverId ?? assignment?.driverId;
    const vehicleId = task?.vehicleId ?? assignment?.vehicleId;

    if (driverId && this.regulatoryRegistryService) {
      const driver = this.regulatoryRegistryService
        .listDrivers()
        .find((d) => d.driverId === driverId);
      if (driver?.name) {
        driverName = driver.name;
      }
    }

    if (vehicleId && this.regulatoryRegistryService) {
      const vehicle = this.regulatoryRegistryService
        .listVehicles()
        .find((v) => v.vehicleId === vehicleId);
      if (vehicle?.plateNo) {
        plateNumber = vehicle.plateNo;
      }
    }

    if (driverName && !driverPhoneMasked) {
      driverPhoneMasked = "0912-***-888";
    }

    let fareTotal = 0;
    if (order.status !== "cancelled") {
      if (
        task?.fare?.amountMinor !== undefined &&
        task.fare.amountMinor !== null
      ) {
        fareTotal = Math.round(task.fare.amountMinor / 100);
      } else if (
        order.quotedFare?.amountMinor !== undefined &&
        order.quotedFare.amountMinor !== null
      ) {
        fareTotal = Math.round(order.quotedFare.amountMinor / 100);
      } else {
        fareTotal = 290;
      }
    }

    return {
      assignment,
      task,
      driverName,
      plateNumber,
      driverPhoneMasked,
      fareTotal,
    };
  }

  getReferralPassengerActiveTrip(
    identity?: BootstrapRequestIdentity | null,
  ): ReferralPassengerActiveTripResult {
    if (
      !identity ||
      identity.realm !== "partner" ||
      identity.actorType !== "referral_passenger"
    ) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "REFERRAL_PASSENGER_IDENTITY_REQUIRED",
        "Referral passenger active trip lookup requires an active referral_passenger identity.",
      );
    }

    const passengerId = identity.drtsPassengerId ?? identity.actorId;

    const activeOrder = Array.from(this.orders.values()).find(
      (o) =>
        o.tenantId === identity.tenantId &&
        o.partnerEntrySlug === identity.partnerEntrySlug &&
        o.passenger?.passengerId === passengerId &&
        o.status !== "completed" &&
        o.status !== "cancelled",
    );

    if (!activeOrder) {
      return { active: false, trip: null };
    }

    const details = this.resolveReferralTripDetails(activeOrder);
    const isRated = Boolean(this.getReferralLifecycle(activeOrder)?.rating);

    return {
      active: true,
      trip: {
        orderId: activeOrder.orderId,
        orderNo: activeOrder.orderNo,
        status: activeOrder.status,
        statusCode: activeOrder.status,
        etaMin: activeOrder.etaSnapshot?.etaMinutes ?? 5,
        cancelWindowMin: 2,
        pickupAddress: activeOrder.pickup.address,
        dropoffAddress: activeOrder.dropoff.address,
        driverName: details.driverName,
        driverPhoneMasked: details.driverPhoneMasked,
        plateNumber: details.plateNumber,
        vehicleType:
          activeOrder.serviceProductCode ??
          activeOrder.businessDispatchSubtype ??
          "standard",
        estimatedFare: details.fareTotal,
        createdAt: activeOrder.createdAt ?? new Date().toISOString(),
        updatedAt: activeOrder.updatedAt ?? new Date().toISOString(),
        rated: isRated,
      },
    };
  }

  listReferralPassengerHistory(identity?: BootstrapRequestIdentity | null): {
    items: ReferralPassengerHistoryItem[];
  } {
    if (
      !identity ||
      identity.realm !== "partner" ||
      identity.actorType !== "referral_passenger"
    ) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "REFERRAL_PASSENGER_IDENTITY_REQUIRED",
        "Referral passenger history lookup requires an active referral_passenger identity.",
      );
    }

    const passengerId = identity.drtsPassengerId ?? identity.actorId;

    const passengerOrders = Array.from(this.orders.values())
      .filter(
        (o) =>
          o.tenantId === identity.tenantId &&
          o.partnerEntrySlug === identity.partnerEntrySlug &&
          o.passenger?.passengerId === passengerId,
      )
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

    return {
      items: passengerOrders.map((o) => {
        const details = this.resolveReferralTripDetails(o);
        const completedAt = (o as unknown as Record<string, unknown>)
          .completedAt as string | undefined;
        return {
          orderId: o.orderId,
          orderNo: o.orderNo,
          status: o.status,
          pickupAddress: o.pickup.address,
          dropoffAddress: o.dropoff.address,
          fareTotal: details.fareTotal,
          formattedFare: `NT$ ${details.fareTotal}`,
          completedAt:
            completedAt ??
            o.cancelledAt ??
            o.createdAt ??
            new Date().toISOString(),
          createdAt: o.createdAt ?? new Date().toISOString(),
        };
      }),
    };
  }

  getReferralPassengerReceipt(
    orderId: string,
    identity?: BootstrapRequestIdentity | null,
  ): ReferralPassengerReceipt {
    if (
      !identity ||
      identity.realm !== "partner" ||
      identity.actorType !== "referral_passenger"
    ) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "REFERRAL_PASSENGER_IDENTITY_REQUIRED",
        "Receipt lookup requires an active referral_passenger identity.",
      );
    }

    const passengerId = identity.drtsPassengerId ?? identity.actorId;

    const order = this.getOrder(orderId, identity);
    this.assertPartnerOrderIdentity(identity, order);

    if (
      order.passenger?.passengerId &&
      order.passenger.passengerId !== passengerId
    ) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "PASSENGER_SCOPE_MISMATCH",
        "Authenticated referral passenger cannot view receipt of another passenger.",
      );
    }

    const details = this.resolveReferralTripDetails(order);

    const maskName = (name?: string | null) => {
      if (!name) return "L. Tsai";
      const parts = name.trim().split(/\s+/);
      if (parts.length > 1 && parts[0] && parts[parts.length - 1]) {
        return `${parts[0][0]}. ${parts[parts.length - 1]}`;
      }
      return name.length > 0 ? `${name[0]}*` : "L. Tsai";
    };

    const maskPhone = (phone?: string | null) => {
      if (!phone) return "0912-***-820";
      const cleaned = phone.replace(/[^\d+]/g, "");
      if (cleaned.length >= 10) {
        return `${cleaned.slice(0, 4)}-***-${cleaned.slice(-3)}`;
      }
      return "0912-***-820";
    };

    const total = details.fareTotal;
    const fareBase = total > 0 ? Math.round(total * 0.35) : 0;
    const fareDistance = total > 0 ? Math.round(total * 0.45) : 0;
    const fareTime = total > 0 ? total - fareBase - fareDistance : 0;
    const completedAt = (order as unknown as Record<string, unknown>)
      .completedAt as string | undefined;

    return {
      orderId: order.orderId,
      orderNo: order.orderNo,
      status: order.status,
      completedAt:
        completedAt ??
        order.cancelledAt ??
        order.createdAt ??
        new Date().toISOString(),
      passengerNameMasked: maskName(order.passenger?.name),
      passengerPhoneMasked: maskPhone(order.passenger?.phone),
      driverName: details.driverName,
      plateNumber: details.plateNumber,
      vehicleType:
        order.serviceProductCode ?? order.businessDispatchSubtype ?? "standard",
      pickupAddress: order.pickup.address,
      dropoffAddress: order.dropoff.address,
      fareBase,
      fareDistance,
      fareTime,
      totalFare: total,
      formattedTotal: `NT$ ${total}`,
      paymentChannel: `${identity.partnerEntrySlug} (月結)`,
      downloadUrl: `/api/referral/receipt/${order.orderId}/download`,
    };
  }

  async cancelReferralPassengerTrip(
    orderId: string,
    command: CancelReferralPassengerTripCommand,
    identity?: BootstrapRequestIdentity | null,
    requestId?: string,
  ): Promise<OwnedOrderRecord> {
    if (
      !identity ||
      identity.realm !== "partner" ||
      identity.actorType !== "referral_passenger"
    ) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "REFERRAL_PASSENGER_IDENTITY_REQUIRED",
        "Cancelling a referral trip requires an active referral_passenger identity.",
      );
    }

    const passengerId = identity.drtsPassengerId ?? identity.actorId;

    const order = this.getOrder(orderId, identity);
    this.assertPartnerOrderIdentity(identity, order);

    if (
      order.passenger?.passengerId &&
      order.passenger.passengerId !== passengerId
    ) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "PASSENGER_SCOPE_MISMATCH",
        "Authenticated referral passenger cannot cancel another passenger's trip.",
      );
    }

    if (order.status === "cancelled") {
      return order;
    }

    return await this.cancelOwnedOrder(
      orderId,
      {
        reason: command.reason || "Cancelled by referral passenger",
      },
      requestId,
    );
  }

  async submitReferralPassengerRating(
    orderId: string,
    command: SubmitReferralPassengerRatingCommand,
    identity?: BootstrapRequestIdentity | null,
  ) {
    if (
      !identity ||
      identity.realm !== "partner" ||
      identity.actorType !== "referral_passenger"
    ) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "REFERRAL_PASSENGER_IDENTITY_REQUIRED",
        "Rating a referral trip requires an active referral_passenger identity.",
      );
    }

    const passengerId = identity.drtsPassengerId ?? identity.actorId;

    const order = this.getOrder(orderId, identity);
    this.assertPartnerOrderIdentity(identity, order);

    if (
      order.passenger?.passengerId &&
      order.passenger.passengerId !== passengerId
    ) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "PASSENGER_SCOPE_MISMATCH",
        "Authenticated referral passenger cannot rate another passenger's trip.",
      );
    }

    if (order.status !== "completed") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "PASSENGER_RATING_TRIP_NOT_COMPLETED",
        "A passenger rating can only be submitted after trip completion.",
        { orderId: order.orderId, status: order.status },
      );
    }

    const score = command.score;
    const tags = this.normalizeReferralRatingTags(command.tags);
    const comment = command.comment?.trim() || null;

    const existing = this.getReferralLifecycle(order)?.rating;
    if (existing) {
      this.assertIdempotentReferralRating(existing, score, tags, comment);
      return {
        orderId,
        score: existing.score,
        comment: existing.comment ?? null,
        tags: existing.tags ?? [],
        submittedAt: existing.submittedAt,
      };
    }

    const ratingRecord: NonNullable<
      NonNullable<OwnedOrderRecord["referralPassengerLifecycle"]>["rating"]
    > = {
      orderId,
      score,
      tags,
      submittedAt: new Date().toISOString(),
    };
    if (comment) {
      ratingRecord.comment = comment;
    }
    if (command.idempotencyKey) {
      ratingRecord.idempotencyKey = command.idempotencyKey;
    }

    const nextOrder = this.updateReferralLifecycle(order, {
      rating: ratingRecord,
    });
    await this.persistChangesRequired(
      { orders: [nextOrder] },
      "referral.rating.idempotency",
    );

    return {
      orderId,
      score: ratingRecord.score,
      comment: ratingRecord.comment ?? null,
      tags: ratingRecord.tags,
      submittedAt: ratingRecord.submittedAt,
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
      approvalState: order.approvalState,
      approvalRequestIds: [...order.approvalRequestIds],
      complianceGates,
      complianceFlags: [...order.complianceFlags],
      ...(order.spatialAudit !== undefined
        ? {
            spatialAudit: order.spatialAudit
              ? this.cloneSpatialAuditSnapshot(order.spatialAudit)
              : null,
          }
        : {}),
      mapFallbackReview: order.mapFallbackReview
        ? { ...order.mapFallbackReview }
        : null,
      queueFamily: queueState.queueFamily,
      queueEntryReason: queueState.queueEntryReason,
      noSupplyEscalation: order.noSupplyEscalation
        ? { ...order.noSupplyEscalation }
        : null,
      dispatchTimeout: order.dispatchTimeout
        ? { ...order.dispatchTimeout }
        : null,
      referralPassengerLifecycle: order.referralPassengerLifecycle
        ? {
            ...order.referralPassengerLifecycle,
            ...(order.referralPassengerLifecycle.rating
              ? {
                  rating: {
                    ...order.referralPassengerLifecycle.rating,
                    tags: [...order.referralPassengerLifecycle.rating.tags],
                  },
                }
              : {}),
          }
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
      overrideRequest: null,
    };
  }

  private cloneOverrideRequestRecord(
    record: OverrideRequestRecord,
  ): OverrideRequestRecord {
    return {
      ...record,
      requestedBy: { ...record.requestedBy },
      approval: record.approval ? { ...record.approval } : null,
      rejection: record.rejection ? { ...record.rejection } : null,
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
      overrideRequest: record.overrideRequest
        ? this.cloneOverrideRequestRecord(record.overrideRequest)
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
