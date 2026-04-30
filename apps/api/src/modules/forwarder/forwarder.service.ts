import { randomUUID } from "node:crypto";

import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  Optional,
} from "@nestjs/common";
import { FORWARDER_ROUTING_SERVICE_BUCKETS } from "@drts/contracts";

import type {
  AdapterHealthRecord,
  AuditLogRecord,
  BroadcastForwardedOrderCommand,
  CompleteForwarderReconciliationCommand,
  EngageForwarderManualFallbackCommand,
  ForwardedOrderRecord,
  ForwardedOrderFinanceContext,
  ForwarderSyncErrorRecord,
  IngestExternalOrderCommand,
  PlatformCode,
  ReconciliationJobRecord,
  ReportForwarderSyncFailureCommand,
  RelayDriverAcceptCommand,
  SyncForwardedOrderStatusCommand,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import { OwnedMobilityService } from "../owned-mobility/owned-mobility.service";
import { RegulatoryRegistryService } from "../regulatory-registry/regulatory-registry.service";
import {
  FORWARDER_ADAPTERS,
  type ForwarderAdapterInterface,
} from "./forwarder-adapter.interface";
import {
  ForwarderRepository,
  type PersistForwarderChanges,
} from "./forwarder.repository";
import { GRAB_TAIWAN_PLATFORM_CODE } from "./grab-taiwan.adapter";

type ForwarderSyncStatus =
  | "confirmed_by_platform"
  | "lost_race"
  | "cancelled_by_platform";

const FORWARDER_SYNC_STATUS_MAP: Record<
  ForwarderSyncStatus,
  ForwardedOrderRecord["status"]
> = {
  confirmed_by_platform: "confirmed_by_platform",
  lost_race: "lost_race",
  cancelled_by_platform: "cancelled_by_platform",
};

const DEFAULT_FORWARDED_ORDER_FINANCE_CONTEXT: ForwardedOrderFinanceContext = {
  fareAuthority: "external_platform",
  settlementAuthority: "external_platform",
  driverPayoutAuthority: "external_platform",
  localLedgerMode: "shadow_only",
};

@Injectable()
export class ForwarderService implements OnModuleInit {
  private readonly logger = new Logger(ForwarderService.name);

  private forwardedOrders: ForwardedOrderRecord[] = [];

  private adapterHealth: AdapterHealthRecord[] = [];

  constructor(
    private readonly regulatoryRegistryService: RegulatoryRegistryService,
    private readonly auditNotificationService: AuditNotificationService,
    @Optional()
    @Inject(FORWARDER_ADAPTERS)
    private readonly adapters: readonly ForwarderAdapterInterface[] = [],
    @Optional() private readonly forwarderRepository?: ForwarderRepository,
    @Optional() private readonly ownedMobilityService?: OwnedMobilityService,
  ) {}

  async onModuleInit() {
    if (!this.forwarderRepository) {
      this.seedRegisteredAdapters();
      return;
    }

    try {
      const persistedState = await this.forwarderRepository.loadState();
      this.forwardedOrders = persistedState.forwardedOrders.map((order) =>
        this.cloneOrder(order),
      );
      this.adapterHealth = persistedState.adapterHealth.map((adapter) => ({
        ...adapter,
      }));
    } catch (error) {
      this.forwarderRepository.reportPersistenceFailure(error, "module init");
    }

    this.seedRegisteredAdapters();
  }

  ingestExternalOrder(command: IngestExternalOrderCommand, requestId?: string) {
    this.assertNonBlank(command.platformCode, "platformCode");
    this.assertNonBlank(command.externalOrderId, "externalOrderId");

    const existing = this.forwardedOrders.find(
      (order) =>
        order.platformCode === command.platformCode &&
        order.externalOrderId === command.externalOrderId,
    );
    if (existing) {
      return this.cloneOrder(existing);
    }

    const now = new Date().toISOString();
    const forwardedOrder: ForwardedOrderRecord = {
      mirrorOrderId: `FWD-${randomUUID()}`,
      platformCode: command.platformCode,
      externalOrderId: command.externalOrderId,
      orderDomain: "forwarded",
      dispatchSemantics: "forwarder_broadcast",
      status: "received",
      candidateDriverIds: [],
      acceptedDriverId: null,
      lastNativeStatus: null,
      payload: { ...(command.payload ?? {}) },
      authoritativeSnapshot: {
        platformCode: command.platformCode,
        externalOrderId: command.externalOrderId,
        nativeStatus: "received",
        ...(command.payload ?? {}),
      },
      financeContext: this.buildFinanceContext(),
      lastSyncError: null,
      manualFallback: {
        required: false,
        reason: null,
        requestedAt: null,
        requestedBy: null,
        notes: null,
      },
      reconciliationJob: null,
      createdAt: now,
      updatedAt: now,
    };

    this.forwardedOrders = [
      this.cloneOrder(forwardedOrder),
      ...this.forwardedOrders,
    ];
    this.ownedMobilityService?.registerForwarderSource(
      forwardedOrder.mirrorOrderId,
      forwardedOrder.platformCode,
    );
    const adapterHealth = this.updateAdapterHealth(
      command.platformCode,
      "healthy",
      null,
    );
    this.persistChanges(
      {
        forwardedOrders: [this.cloneOrder(forwardedOrder)],
        adapterHealth: [{ ...adapterHealth }],
      },
      "ingest_external_order",
    );
    this.recordAudit(
      {
        actorId: null,
        actorType: "system",
        tenantId: null,
        moduleName: "forwarder",
        actionName: "ingest_external_order",
        resourceType: "forwarded_order",
        resourceId: forwardedOrder.mirrorOrderId,
        newValuesSummary: {
          platformCode: forwardedOrder.platformCode,
          externalOrderId: forwardedOrder.externalOrderId,
          status: forwardedOrder.status,
        },
      },
      requestId,
    );

    return this.cloneOrder(forwardedOrder);
  }

  ingestGrabTaiwanWebhook(
    payload: Record<string, unknown>,
    requestId?: string,
  ) {
    this.logger.log("Received stub Grab Taiwan webhook payload.");

    const adapter = this.findAdapter(GRAB_TAIWAN_PLATFORM_CODE);
    if (adapter) {
      this.updateAdapterHealth(adapter.platformCode, "healthy", null);
    }

    return this.ingestExternalOrder(
      {
        platformCode: GRAB_TAIWAN_PLATFORM_CODE,
        externalOrderId: this.resolveExternalOrderId(payload, requestId),
        payload,
      },
      requestId,
    );
  }

  listOrders() {
    return this.forwardedOrders.map((order) => this.cloneOrder(order));
  }

  broadcastOrder(
    orderId: string,
    command: BroadcastForwardedOrderCommand,
    requestId?: string,
  ) {
    const forwardedOrder = this.requireOrder(orderId);
    const serviceBucket = this.resolveServiceBucket(
      forwardedOrder.payload,
      forwardedOrder.authoritativeSnapshot,
    );
    const eligibleDrivers = new Set(
      this.regulatoryRegistryService
        .getEligibleCandidates(serviceBucket)
        .map((candidate) => candidate.driverId),
    );
    const requestedDrivers =
      command.candidateDriverIds.length > 0
        ? command.candidateDriverIds
        : [...eligibleDrivers];
    const candidateDriverIds = requestedDrivers.filter((driverId) =>
      eligibleDrivers.has(driverId),
    );
    if (candidateDriverIds.length === 0) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "NO_ELIGIBLE_FORWARDER_CANDIDATES",
        "Forwarded order broadcast requires at least one locally eligible driver.",
        {
          orderId,
        },
      );
    }

    forwardedOrder.status = "broadcasted";
    forwardedOrder.candidateDriverIds = [...candidateDriverIds];
    forwardedOrder.updatedAt = new Date().toISOString();
    const adapterHealth = this.updateAdapterHealth(
      forwardedOrder.platformCode,
      "healthy",
      null,
    );
    this.persistChanges(
      {
        forwardedOrders: [this.cloneOrder(forwardedOrder)],
        adapterHealth: [{ ...adapterHealth }],
      },
      "broadcast_forwarded_order",
    );
    this.recordAudit(
      {
        actorId: null,
        actorType: "system",
        tenantId: null,
        moduleName: "forwarder",
        actionName: "broadcast_forwarded_order",
        resourceType: "forwarded_order",
        resourceId: forwardedOrder.mirrorOrderId,
        newValuesSummary: {
          status: forwardedOrder.status,
          candidateDriverIds: forwardedOrder.candidateDriverIds,
        },
      },
      requestId,
    );

    return {
      mirrorOrderId: forwardedOrder.mirrorOrderId,
      status: forwardedOrder.status,
      candidateDriverIds: [...forwardedOrder.candidateDriverIds],
    };
  }

  async relayDriverAccept(
    orderId: string,
    command: RelayDriverAcceptCommand,
    requestId?: string,
  ) {
    const forwardedOrder = this.requireOrder(orderId);
    if (forwardedOrder.status !== "broadcasted") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "FORWARDED_ORDER_NOT_BROADCASTED",
        "Forwarded order must be broadcasted before local accept relay.",
        {
          orderId,
          status: forwardedOrder.status,
        },
      );
    }
    if (!forwardedOrder.candidateDriverIds.includes(command.driverId)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "FORWARDER_DRIVER_NOT_ELIGIBLE",
        "Driver is not part of the local forwarded candidate set.",
        {
          orderId,
          driverId: command.driverId,
        },
      );
    }

    const adapter = this.findAdapter(forwardedOrder.platformCode);
    if (!adapter) {
      this.markSyncFailed(
        forwardedOrder,
        {
          errorCode: "FORWARDER_ADAPTER_UNAVAILABLE",
          errorMessage:
            "No forwarder adapter is registered for the platform accept relay.",
          retryable: false,
          manualFallbackReason:
            "Dispatch must confirm the final platform state manually before re-offer.",
        },
        requestId,
        command.driverId,
      );
      throw new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "FORWARDER_ADAPTER_UNAVAILABLE",
        "Forwarder adapter is unavailable for local accept relay.",
        {
          orderId,
          platformCode: forwardedOrder.platformCode,
          reconciliationJobId:
            forwardedOrder.reconciliationJob?.reconciliationJobId ?? null,
        },
        true,
      );
    }

    try {
      const adapterResult = await adapter.accept({
        externalOrderId: forwardedOrder.externalOrderId,
        driverId: command.driverId,
        payload: {
          mirrorOrderId: forwardedOrder.mirrorOrderId,
          platformCode: forwardedOrder.platformCode,
        },
      });

      if (!adapterResult.acknowledged) {
        throw new Error(adapterResult.detail ?? "adapter did not acknowledge");
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.markSyncFailed(
        forwardedOrder,
        {
          errorCode: "FORWARDER_ACCEPT_RELAY_FAILED",
          errorMessage,
          retryable: true,
          manualFallbackReason:
            "Dispatch must confirm platform acceptance manually before continuing.",
        },
        requestId,
        command.driverId,
      );
      throw new ApiRequestError(
        HttpStatus.BAD_GATEWAY,
        "FORWARDER_ACCEPT_RELAY_FAILED",
        "Forwarder accept relay failed; reconciliation and manual fallback are required.",
        {
          orderId,
          platformCode: forwardedOrder.platformCode,
          reconciliationJobId:
            forwardedOrder.reconciliationJob?.reconciliationJobId ?? null,
        },
        true,
      );
    }

    forwardedOrder.status = "accept_pending";
    forwardedOrder.acceptedDriverId = command.driverId;
    forwardedOrder.lastSyncError = null;
    forwardedOrder.manualFallback = {
      ...forwardedOrder.manualFallback,
      required: false,
    };
    forwardedOrder.updatedAt = new Date().toISOString();
    const adapterHealth = this.updateAdapterHealth(
      forwardedOrder.platformCode,
      "healthy",
      null,
    );
    this.persistChanges(
      {
        forwardedOrders: [this.cloneOrder(forwardedOrder)],
        adapterHealth: [{ ...adapterHealth }],
      },
      "relay_driver_accept",
    );
    this.recordAudit(
      {
        actorId: command.driverId,
        actorType: "ops_user",
        tenantId: null,
        moduleName: "forwarder",
        actionName: "relay_driver_accept",
        resourceType: "forwarded_order",
        resourceId: forwardedOrder.mirrorOrderId,
        newValuesSummary: {
          status: forwardedOrder.status,
          acceptedDriverId: forwardedOrder.acceptedDriverId,
        },
      },
      requestId,
    );

    return {
      status: forwardedOrder.status,
      acceptedDriverId: forwardedOrder.acceptedDriverId,
    };
  }

  reportSyncFailure(
    orderId: string,
    command: ReportForwarderSyncFailureCommand,
    requestId?: string,
  ) {
    const forwardedOrder = this.requireOrder(orderId);
    this.markSyncFailed(forwardedOrder, command, requestId);
    return this.cloneOrder(forwardedOrder);
  }

  engageManualFallback(
    orderId: string,
    command: EngageForwarderManualFallbackCommand,
    requestId?: string,
  ) {
    const forwardedOrder = this.requireOrder(orderId);
    if (
      forwardedOrder.status === "confirmed_by_platform" ||
      forwardedOrder.status === "lost_race" ||
      forwardedOrder.status === "cancelled_by_platform"
    ) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "FORWARDED_ORDER_ALREADY_RESOLVED",
        "Manual fallback can only be engaged while the forwarded order is still unresolved.",
        {
          orderId,
          status: forwardedOrder.status,
        },
      );
    }

    const now = new Date().toISOString();
    forwardedOrder.manualFallback = {
      required: true,
      reason: command.reason,
      requestedAt: now,
      requestedBy: command.requestedBy?.trim() || null,
      notes: command.notes?.trim() || null,
    };
    if (!forwardedOrder.reconciliationJob) {
      forwardedOrder.reconciliationJob = this.createReconciliationJob(
        forwardedOrder,
        "manual_fallback",
        command.reason,
        now,
      );
    }
    forwardedOrder.updatedAt = now;
    this.persistChanges(
      {
        forwardedOrders: [this.cloneOrder(forwardedOrder)],
      },
      "engage_manual_fallback",
    );
    this.recordAudit(
      {
        actorId: command.requestedBy?.trim() || null,
        actorType: "ops_user",
        tenantId: null,
        moduleName: "forwarder",
        actionName: "engage_manual_fallback",
        resourceType: "forwarded_order",
        resourceId: forwardedOrder.mirrorOrderId,
        newValuesSummary: {
          status: forwardedOrder.status,
          manualFallbackRequired: true,
          reconciliationJobId:
            forwardedOrder.reconciliationJob?.reconciliationJobId ?? null,
        },
      },
      requestId,
    );

    return this.cloneOrder(forwardedOrder);
  }

  syncNativeStatus(
    orderId: string,
    command: SyncForwardedOrderStatusCommand,
    requestId?: string,
  ) {
    const forwardedOrder = this.requireOrder(orderId);
    const nextStatus = this.resolveNextStatus(command.nativeStatus);

    forwardedOrder.status = nextStatus;
    forwardedOrder.lastNativeStatus = command.nativeStatus;
    forwardedOrder.authoritativeSnapshot = {
      ...forwardedOrder.authoritativeSnapshot,
      nativeStatus: command.nativeStatus,
      ...(command.payload ?? {}),
    };
    forwardedOrder.updatedAt = new Date().toISOString();
    if (forwardedOrder.reconciliationJob?.status === "queued") {
      forwardedOrder.reconciliationJob = {
        ...forwardedOrder.reconciliationJob,
        status: "completed",
        mismatchCount: 0,
        notes: "Resolved by native status sync.",
        completedAt: forwardedOrder.updatedAt,
      };
      forwardedOrder.lastSyncError = null;
      forwardedOrder.manualFallback = {
        ...forwardedOrder.manualFallback,
        required: false,
      };
    }
    const adapterHealth = this.updateAdapterHealth(
      forwardedOrder.platformCode,
      "healthy",
      null,
    );
    this.persistChanges(
      {
        forwardedOrders: [this.cloneOrder(forwardedOrder)],
        adapterHealth: [{ ...adapterHealth }],
      },
      "sync_forwarded_order_status",
    );
    this.recordAudit(
      {
        actorId: null,
        actorType: "system",
        tenantId: null,
        moduleName: "forwarder",
        actionName: "sync_forwarded_order_status",
        resourceType: "forwarded_order",
        resourceId: forwardedOrder.mirrorOrderId,
        newValuesSummary: {
          status: forwardedOrder.status,
          nativeStatus: forwardedOrder.lastNativeStatus,
          acceptedDriverId: forwardedOrder.acceptedDriverId,
        },
      },
      requestId,
    );

    this.closeDriverTasksOnTerminalState(forwardedOrder, requestId);

    return {
      status: forwardedOrder.status,
      authoritativeSnapshot: { ...forwardedOrder.authoritativeSnapshot },
    };
  }

  completeReconciliation(
    orderId: string,
    command: CompleteForwarderReconciliationCommand,
    requestId?: string,
  ) {
    const forwardedOrder = this.requireOrder(orderId);
    if (!forwardedOrder.reconciliationJob) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "FORWARDER_RECONCILIATION_NOT_FOUND",
        "Reconciliation job was not found for the forwarded order.",
        {
          orderId,
        },
      );
    }

    const nextStatus = this.resolveNextStatus(command.nativeStatus);
    const completedAt = new Date().toISOString();
    forwardedOrder.status = nextStatus;
    forwardedOrder.lastNativeStatus = command.nativeStatus;
    forwardedOrder.authoritativeSnapshot = {
      ...forwardedOrder.authoritativeSnapshot,
      nativeStatus: command.nativeStatus,
      ...(command.payload ?? {}),
    };
    forwardedOrder.lastSyncError = null;
    forwardedOrder.manualFallback = {
      ...forwardedOrder.manualFallback,
      required: false,
      notes: command.notes?.trim() ?? forwardedOrder.manualFallback.notes,
    };
    forwardedOrder.reconciliationJob = {
      ...forwardedOrder.reconciliationJob,
      status: "completed",
      mismatchCount: command.mismatchCount,
      notes: command.notes?.trim() || null,
      completedAt,
    };
    forwardedOrder.updatedAt = completedAt;
    const adapterHealth = this.updateAdapterHealth(
      forwardedOrder.platformCode,
      "healthy",
      null,
    );
    this.persistChanges(
      {
        forwardedOrders: [this.cloneOrder(forwardedOrder)],
        adapterHealth: [{ ...adapterHealth }],
      },
      "complete_forwarder_reconciliation",
    );
    this.recordAudit(
      {
        actorId: null,
        actorType: "system",
        tenantId: null,
        moduleName: "forwarder",
        actionName: "complete_forwarder_reconciliation",
        resourceType: "forwarded_order",
        resourceId: forwardedOrder.mirrorOrderId,
        newValuesSummary: {
          status: forwardedOrder.status,
          nativeStatus: forwardedOrder.lastNativeStatus,
          reconciliationJobId:
            forwardedOrder.reconciliationJob.reconciliationJobId,
        },
      },
      requestId,
    );

    this.closeDriverTasksOnTerminalState(forwardedOrder, requestId);

    return this.cloneOrder(forwardedOrder);
  }

  listSyncErrors() {
    return this.forwardedOrders
      .filter((order) => order.lastSyncError != null)
      .map((order) => this.cloneOrder(order));
  }

  listReconciliationJobs() {
    return this.forwardedOrders
      .flatMap((order) =>
        order.reconciliationJob ? [{ ...order.reconciliationJob }] : [],
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  /**
   * Return open reconciliation issues with full order and finance context so
   * ops and finance can review sync-failed mirrors and distinguish operational
   * mirror failure from commercial settlement truth.
   */
  listReconciliationIssues() {
    return this.forwardedOrders
      .filter(
        (order) =>
          order.reconciliationJob != null &&
          order.reconciliationJob.status === "queued",
      )
      .map((order) => ({
        reconciliationJob: { ...order.reconciliationJob! },
        mirrorOrderId: order.mirrorOrderId,
        platformCode: order.platformCode,
        externalOrderId: order.externalOrderId,
        status: order.status,
        acceptedDriverId: order.acceptedDriverId,
        lastSyncError: order.lastSyncError ? { ...order.lastSyncError } : null,
        financeContext: { ...order.financeContext },
        manualFallback: { ...order.manualFallback },
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      }))
      .sort((left, right) =>
        right.reconciliationJob.createdAt.localeCompare(
          left.reconciliationJob.createdAt,
        ),
      );
  }

  listAdapterHealth() {
    return this.adapterHealth.map((adapter) => ({ ...adapter }));
  }

  hasAdapter(platformCode: PlatformCode) {
    return Boolean(this.findAdapter(platformCode));
  }

  private closeDriverTasksOnTerminalState(
    forwardedOrder: ForwardedOrderRecord,
    requestId?: string,
  ) {
    const isTerminal =
      forwardedOrder.status === "lost_race" ||
      forwardedOrder.status === "cancelled_by_platform";

    if (!isTerminal || !this.ownedMobilityService) {
      return;
    }

    try {
      this.ownedMobilityService.cancelForwarderTasks(
        forwardedOrder.mirrorOrderId,
        forwardedOrder.status,
        requestId,
      );
      this.logger.log(
        `Closed driver tasks for forwarder order ${forwardedOrder.mirrorOrderId} (${forwardedOrder.status})`,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to close driver tasks for forwarder order ${forwardedOrder.mirrorOrderId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private resolveNextStatus(nativeStatus: string) {
    if (nativeStatus in FORWARDER_SYNC_STATUS_MAP) {
      return FORWARDER_SYNC_STATUS_MAP[nativeStatus as ForwarderSyncStatus];
    }

    throw new ApiRequestError(
      HttpStatus.BAD_REQUEST,
      "UNSUPPORTED_FORWARDER_NATIVE_STATUS",
      "Forwarder native status is not supported by the local mirror.",
      {
        nativeStatus,
      },
    );
  }

  private resolveServiceBucket(
    payload: Record<string, unknown>,
    authoritativeSnapshot: Record<string, unknown>,
  ) {
    const requestedServiceBucket =
      payload.serviceBucket ?? authoritativeSnapshot.serviceBucket;
    if (
      typeof requestedServiceBucket === "string" &&
      !FORWARDER_ROUTING_SERVICE_BUCKETS.includes(
        requestedServiceBucket as (typeof FORWARDER_ROUTING_SERVICE_BUCKETS)[number],
      )
    ) {
      this.logger.warn(
        `Forwarder received unsupported serviceBucket "${requestedServiceBucket}", defaulting to standard_taxi.`,
      );
    }
    return requestedServiceBucket === "business_dispatch"
      ? "business_dispatch"
      : "standard_taxi";
  }

  private seedRegisteredAdapters() {
    const seededHealth = this.adapters
      .filter(
        (adapter) =>
          !this.adapterHealth.some(
            (record) => record.platformCode === adapter.platformCode,
          ),
      )
      .map((adapter) =>
        this.updateAdapterHealth(adapter.platformCode, "healthy", null),
      );

    if (seededHealth.length > 0) {
      this.persistChanges(
        {
          adapterHealth: seededHealth,
        },
        "seed_forwarder_adapters",
      );
    }
  }

  private findAdapter(platformCode: PlatformCode) {
    return this.adapters.find(
      (adapter) => adapter.platformCode === platformCode,
    );
  }

  private resolveExternalOrderId(
    payload: Record<string, unknown>,
    requestId?: string,
  ) {
    const candidateKeys = ["externalOrderId", "orderId", "bookingId", "id"];

    for (const key of candidateKeys) {
      const candidate = payload[key];
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate;
      }
    }

    return requestId?.trim()
      ? `grab-webhook-${requestId.trim()}`
      : `grab-webhook-${randomUUID()}`;
  }

  private buildFinanceContext(): ForwardedOrderFinanceContext {
    return { ...DEFAULT_FORWARDED_ORDER_FINANCE_CONTEXT };
  }

  private createReconciliationJob(
    order: ForwardedOrderRecord,
    reason: ReconciliationJobRecord["reason"],
    notes: string | null,
    createdAt = new Date().toISOString(),
  ): ReconciliationJobRecord {
    return {
      reconciliationJobId: `FWD-REC-${randomUUID()}`,
      mirrorOrderId: order.mirrorOrderId,
      platformCode: order.platformCode,
      externalOrderId: order.externalOrderId,
      reason,
      status: "queued",
      mismatchCount: 0,
      notes,
      createdAt,
      completedAt: null,
    };
  }

  private markSyncFailed(
    forwardedOrder: ForwardedOrderRecord,
    command: ReportForwarderSyncFailureCommand,
    requestId?: string,
    acceptedDriverId?: string,
  ) {
    const failedAt = new Date().toISOString();
    const lastSyncError: ForwarderSyncErrorRecord = {
      code: command.errorCode,
      message: command.errorMessage,
      retryable: command.retryable,
      failedAt,
      nativeStatus: command.nativeStatus?.trim() || null,
      payload: { ...(command.payload ?? {}) },
    };

    forwardedOrder.status = "sync_failed";
    forwardedOrder.acceptedDriverId =
      acceptedDriverId ?? forwardedOrder.acceptedDriverId;
    forwardedOrder.lastSyncError = lastSyncError;
    forwardedOrder.manualFallback = {
      required: true,
      reason: command.manualFallbackReason?.trim() || command.errorMessage,
      requestedAt: failedAt,
      requestedBy: null,
      notes: null,
    };
    forwardedOrder.reconciliationJob = this.createReconciliationJob(
      forwardedOrder,
      "sync_failed",
      command.errorMessage,
      failedAt,
    );
    forwardedOrder.updatedAt = failedAt;
    const adapterHealth = this.updateAdapterHealth(
      forwardedOrder.platformCode,
      command.retryable ? "degraded" : "down",
      `${command.errorCode}: ${command.errorMessage}`,
    );
    this.persistChanges(
      {
        forwardedOrders: [this.cloneOrder(forwardedOrder)],
        adapterHealth: [{ ...adapterHealth }],
      },
      "mark_forwarder_sync_failed",
    );
    this.recordAudit(
      {
        actorId: acceptedDriverId ?? null,
        actorType: acceptedDriverId ? "ops_user" : "system",
        tenantId: null,
        moduleName: "forwarder",
        actionName: "mark_forwarder_sync_failed",
        resourceType: "forwarded_order",
        resourceId: forwardedOrder.mirrorOrderId,
        newValuesSummary: {
          status: forwardedOrder.status,
          errorCode: lastSyncError.code,
          retryable: lastSyncError.retryable,
          reconciliationJobId:
            forwardedOrder.reconciliationJob?.reconciliationJobId ?? null,
        },
      },
      requestId,
    );
  }

  private updateAdapterHealth(
    platformCode: PlatformCode,
    status: AdapterHealthRecord["status"],
    lastError: string | null,
  ) {
    const existing = this.adapterHealth.find(
      (adapter) => adapter.platformCode === platformCode,
    );
    const next: AdapterHealthRecord = {
      platformCode,
      status,
      lastCheckedAt: new Date().toISOString(),
      lastError,
    };

    if (!existing) {
      this.adapterHealth = [next, ...this.adapterHealth];
      return next;
    }

    existing.status = next.status;
    existing.lastCheckedAt = next.lastCheckedAt;
    existing.lastError = next.lastError;
    return { ...existing };
  }

  private requireOrder(orderId: string) {
    const forwardedOrder = this.forwardedOrders.find(
      (candidateOrder) => candidateOrder.mirrorOrderId === orderId,
    );
    if (!forwardedOrder) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "FORWARDED_ORDER_NOT_FOUND",
        "Forwarded order was not found.",
        {
          orderId,
        },
      );
    }
    return forwardedOrder;
  }

  private cloneOrder(order: ForwardedOrderRecord) {
    const normalized = this.normalizeOrder(order);

    return {
      ...normalized,
      candidateDriverIds: [...normalized.candidateDriverIds],
      payload: { ...normalized.payload },
      authoritativeSnapshot: { ...normalized.authoritativeSnapshot },
      financeContext: { ...normalized.financeContext },
      lastSyncError: normalized.lastSyncError
        ? {
            ...normalized.lastSyncError,
            payload: { ...normalized.lastSyncError.payload },
          }
        : null,
      manualFallback: { ...normalized.manualFallback },
      reconciliationJob: normalized.reconciliationJob
        ? { ...normalized.reconciliationJob }
        : null,
    };
  }

  private normalizeOrder(order: ForwardedOrderRecord): ForwardedOrderRecord {
    return {
      ...order,
      orderDomain: "forwarded",
      dispatchSemantics: "forwarder_broadcast",
      financeContext: {
        ...DEFAULT_FORWARDED_ORDER_FINANCE_CONTEXT,
        ...(order.financeContext ?? {}),
      },
      lastSyncError: order.lastSyncError
        ? {
            ...order.lastSyncError,
            payload: { ...order.lastSyncError.payload },
          }
        : null,
      manualFallback: {
        required: order.manualFallback?.required ?? false,
        reason: order.manualFallback?.reason ?? null,
        requestedAt: order.manualFallback?.requestedAt ?? null,
        requestedBy: order.manualFallback?.requestedBy ?? null,
        notes: order.manualFallback?.notes ?? null,
      },
      reconciliationJob: order.reconciliationJob
        ? { ...order.reconciliationJob }
        : null,
    };
  }

  private assertNonBlank(value: string, field: string) {
    if (!value.trim()) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "FIELD_REQUIRED",
        `${field} is required.`,
        {
          field,
        },
      );
    }
  }

  private recordAudit(
    input: Omit<AuditLogRecord, "auditId" | "createdAt" | "requestId">,
    requestId?: string,
  ) {
    const auditLogInput: Omit<
      AuditLogRecord,
      "auditId" | "createdAt" | "requestId"
    > & {
      requestId?: string;
    } = {
      ...input,
    };
    if (requestId) {
      auditLogInput.requestId = requestId;
    }
    this.auditNotificationService.recordAuditLog(auditLogInput);
  }

  private persistChanges(changes: PersistForwarderChanges, context: string) {
    if (!this.forwarderRepository) {
      return;
    }

    void this.forwarderRepository
      .persistChanges(changes)
      .catch((error: unknown) => {
        this.forwarderRepository!.reportPersistenceFailure(error, context);
      });
  }
}
