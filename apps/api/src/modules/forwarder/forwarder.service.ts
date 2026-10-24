import { randomUUID } from "node:crypto";

import {
  forwardRef,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  Optional,
} from "@nestjs/common";
import {
  FORWARDER_ROUTING_SERVICE_BUCKETS,
  PLATFORM_CODE_REGISTRY,
} from "@drts/contracts";

import type {
  AdapterHealthRecord,
  AuditLogRecord,
  BroadcastForwardedOrderCommand,
  DriverTaskAction,
  DriverTaskRecord,
  CompleteForwarderReconciliationCommand,
  EngageForwarderManualFallbackCommand,
  ForwardedDriverActionOutcome,
  ForwardedDriverActionResponse,
  ForwardedOrderRecord,
  ForwardedOrderFinanceContext,
  ForwarderSyncErrorRecord,
  IngestExternalOrderCommand,
  OwnedOrderRecord,
  PlatformCode,
  ReconciliationJobRecord,
  ReportForwarderSyncFailureCommand,
  RelayDriverAcceptCommand,
  SyncForwardedOrderStatusCommand,
  UnifiedDriverTaskView,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import { OwnedMobilityService } from "../owned-mobility/owned-mobility.service";
import { RegulatoryRegistryService } from "../regulatory-registry/regulatory-registry.service";
import { VehicleEligibilityService } from "../vehicle-eligibility/vehicle-eligibility.service";
import {
  FORWARDER_ADAPTERS,
  type ForwarderAdapterHealthSnapshot,
  type ForwarderAdapterInterface,
} from "./forwarder-adapter.interface";
import {
  ForwarderRepository,
  type PersistForwarderChanges,
} from "./forwarder.repository";
import { GRAB_TAIWAN_PLATFORM_CODE } from "./grab-taiwan.adapter";

type ForwarderSyncStatus =
  | "confirmed_by_platform"
  | "completed"
  | "lost_race"
  | "cancelled_by_platform";

const FORWARDER_SYNC_STATUS_MAP: Record<
  ForwarderSyncStatus,
  ForwardedOrderRecord["status"]
> = {
  confirmed_by_platform: "confirmed_by_platform",
  completed: "completed_synced",
  lost_race: "lost_race",
  cancelled_by_platform: "cancelled_by_platform",
};

const DEFAULT_FORWARDED_ORDER_FINANCE_CONTEXT: ForwardedOrderFinanceContext = {
  fareAuthority: "external_platform",
  settlementAuthority: "external_platform",
  driverPayoutAuthority: "external_platform",
  localLedgerMode: "shadow_only",
};

const DRTS_PLATFORM_DISPLAY_NAME = "DRTS";

const DRIVER_TASK_VIEW_PRIORITY: Record<
  UnifiedDriverTaskView["driverActionState"],
  number
> = {
  action_required: 0,
  blocked: 1,
  awaiting_platform: 2,
  in_progress: 3,
  read_only: 4,
  completed: 5,
};

@Injectable()
export class ForwarderService implements OnModuleInit {
  private readonly logger = new Logger(ForwarderService.name);

  private forwardedOrders: ForwardedOrderRecord[] = [];

  private adapterHealth: AdapterHealthRecord[] = [];

  // Per-mirror-identity mutation queue: guarantees the "read canonical,
  // build draft, await durable ACK, commit" critical section for any given
  // order (or pre-creation platformCode/externalOrderId identity) never
  // interleaves with another command's critical section for the same
  // identity. This is what makes a late-resolving command observe (and
  // defer to) a command that already committed while it was in flight,
  // instead of both mutating the same shared object out of order. Never
  // held across an external adapter call — only around the local
  // mutate+persist+commit section.
  private readonly orderLocks = new Map<string, Promise<void>>();

  constructor(
    private readonly regulatoryRegistryService: RegulatoryRegistryService,
    private readonly auditNotificationService: AuditNotificationService,
    @Optional()
    @Inject(FORWARDER_ADAPTERS)
    private readonly adapters: readonly ForwarderAdapterInterface[] = [],
    @Optional() private readonly forwarderRepository?: ForwarderRepository,
    @Optional()
    @Inject(forwardRef(() => OwnedMobilityService))
    private readonly ownedMobilityService?: OwnedMobilityService,
    // NOTE(integration 20260605): appended LAST (@Optional) to preserve the
    // original positional order for unit-test harnesses; e2e-svc-013 had
    // inserted it at position 2, shifting auditNotificationService/adapters.
    @Optional()
    private readonly vehicleEligibilityService?:
      | VehicleEligibilityService
      | undefined,
  ) {}

  async onModuleInit() {
    if (!this.forwarderRepository) {
      await this.seedRegisteredAdapters();
      return;
    }

    try {
      const persistedState = await this.forwarderRepository.loadState();
      this.forwardedOrders = persistedState.forwardedOrders.map((order) =>
        this.cloneOrder(order),
      );
      for (const order of this.forwardedOrders) {
        this.ownedMobilityService?.registerForwarderSource(
          order.mirrorOrderId,
          order.platformCode,
        );
      }
      this.adapterHealth = persistedState.adapterHealth.map((adapter) =>
        this.normalizeAdapterHealthRecord(adapter),
      );
    } catch (error) {
      this.forwarderRepository.reportPersistenceFailure(error, "module init");
    }

    await this.seedRegisteredAdapters();
  }

  async ingestExternalOrder(
    command: IngestExternalOrderCommand,
    requestId?: string,
  ) {
    this.assertNonBlank(command.platformCode, "platformCode");
    this.assertNonBlank(command.externalOrderId, "externalOrderId");

    const lockKey = this.ingressLockKey(
      command.platformCode,
      command.externalOrderId,
    );
    return this.withLock(lockKey, async () => {
      const existing = this.forwardedOrders.find(
        (order) =>
          order.platformCode === command.platformCode &&
          order.externalOrderId === command.externalOrderId,
      );
      if (existing) {
        return this.reconcileExistingIngest(existing, requestId);
      }
      return this.createNewForwardedOrder(command, requestId);
    });
  }

  private ingressLockKey(platformCode: PlatformCode, externalOrderId: string) {
    return `ingress:${platformCode}:${externalOrderId}`;
  }

  private async createNewForwardedOrder(
    command: IngestExternalOrderCommand,
    requestId?: string,
  ) {
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

    const adapterHealth = this.updateAdapterHealth(
      command.platformCode,
      this.buildHealthyAdapterHealthPatch(command.platformCode),
    );
    // Not yet committed into this.forwardedOrders: readers (list/getOrder/
    // driver task views) must not observe this order until the durable ACK
    // below actually lands (persistOrFail only commits on success).
    const committed = await this.persistOrFail(
      forwardedOrder,
      {
        adapterHealth: [{ ...adapterHealth }],
      },
      "ingest_external_order",
      requestId,
    );
    this.ownedMobilityService?.registerForwarderSource(
      committed.mirrorOrderId,
      committed.platformCode,
    );
    this.recordAudit(
      {
        actorId: null,
        actorType: "system",
        tenantId: null,
        moduleName: "forwarder",
        actionName: "ingest_external_order",
        resourceType: "forwarded_order",
        resourceId: committed.mirrorOrderId,
        newValuesSummary: {
          platformCode: committed.platformCode,
          externalOrderId: committed.externalOrderId,
          status: committed.status,
        },
      },
      requestId,
    );

    return this.cloneOrder(committed);
  }

  /**
   * Handles a repeat ingress for a platformCode/externalOrderId that already
   * has a cached mirror. A cached record whose last write was durably ACKed
   * is genuinely idempotent and can be returned as-is. But a record whose
   * last write is only an in-memory "uncertain" guess (the prior attempt's
   * own durable ACK never landed) is not confirmed canonical truth yet, so
   * this retry reads back the real persisted row first, and only falls back
   * to re-attempting the same write (same mirrorOrderId/platformCode/
   * externalOrderId/snapshots — never a new mirror identity) if nothing
   * durable exists for this identity yet.
   *
   * Once a mirrorOrderId exists, every other command (native sync, accept,
   * reconciliation, ...) serializes on that mirrorOrderId via `withLock`.
   * The ingress lock alone (keyed by platformCode/externalOrderId) does not
   * exclude those commands, so this reconcile step additionally takes the
   * same mirrorOrderId lock around its own readback-and-decide critical
   * section, and re-reads canonical state after acquiring it — a command
   * that already resolved this order while we were queued for the lock is
   * authoritative and must not be overwritten by a readback that started
   * before it landed.
   */
  private async reconcileExistingIngest(
    existing: ForwardedOrderRecord,
    requestId?: string,
  ) {
    const isUncertain =
      existing.lastSyncError?.code === "FORWARDER_PERSISTENCE_ACK_UNCERTAIN";
    if (!isUncertain || !this.forwarderRepository) {
      return this.cloneOrder(existing);
    }

    return this.withLock(existing.mirrorOrderId, async () => {
      const canonical = this.requireOrder(existing.mirrorOrderId);
      if (
        canonical.lastSyncError?.code !== "FORWARDER_PERSISTENCE_ACK_UNCERTAIN"
      ) {
        // Another command (native sync, a competing retry, reconciliation,
        // ...) already resolved this order while we waited for the lock;
        // that resolution is canonical now.
        return this.cloneOrder(canonical);
      }

      let readback: ForwardedOrderRecord | null = null;
      let readbackFailed = false;
      try {
        readback = await this.forwarderRepository!.findOrderByIdentity(
          canonical.platformCode,
          canonical.externalOrderId,
        );
      } catch (error) {
        readbackFailed = true;
        this.forwarderRepository!.reportPersistenceFailure(
          error,
          "ingest_external_order_readback",
        );
      }

      if (readback) {
        const committed = this.cloneOrder(readback);
        this.commitOrder(committed);
        return this.cloneOrder(committed);
      }

      if (readbackFailed) {
        // A failed readback query is not evidence of absence. Treating it as
        // "nothing durable exists yet" would let this retry overwrite a row
        // we simply failed to see; stay uncertain and let a later retry or
        // reconciliation resolve it instead. Returning the still-uncertain
        // order as a normal value here (instead of throwing) would let the
        // ingress command report a success envelope for a mirror whose last
        // write was never durably ACKed and whose current canonical state we
        // just failed to confirm, so this must propagate as an honest
        // failure — not just carry an uncertain field inside a 200 response.
        throw new ApiRequestError(
          HttpStatus.BAD_GATEWAY,
          "FORWARDER_PERSISTENCE_ACK_UNCERTAIN",
          "Forwarded order identity could not be read back from canonical storage; manual readback/reconciliation is required before retrying this ingress.",
          {
            orderId: canonical.mirrorOrderId,
            platformCode: canonical.platformCode,
            externalOrderId: canonical.externalOrderId,
            persisted: false,
          },
          true,
        );
      }

      const retryDraft = this.cloneOrder(canonical);
      retryDraft.status = "received";
      retryDraft.lastSyncError = null;
      retryDraft.manualFallback = {
        required: false,
        reason: null,
        requestedAt: null,
        requestedBy: null,
        notes: null,
      };
      retryDraft.reconciliationJob = null;
      retryDraft.updatedAt = new Date().toISOString();

      const adapterHealth = this.updateAdapterHealth(
        retryDraft.platformCode,
        this.buildHealthyAdapterHealthPatch(retryDraft.platformCode),
      );

      const committed = await this.persistOrFail(
        retryDraft,
        {
          adapterHealth: [{ ...adapterHealth }],
        },
        "ingest_external_order_retry",
        requestId,
      );
      this.ownedMobilityService?.registerForwarderSource(
        committed.mirrorOrderId,
        committed.platformCode,
      );
      this.recordAudit(
        {
          actorId: null,
          actorType: "system",
          tenantId: null,
          moduleName: "forwarder",
          actionName: "ingest_external_order_retry",
          resourceType: "forwarded_order",
          resourceId: committed.mirrorOrderId,
          newValuesSummary: {
            platformCode: committed.platformCode,
            externalOrderId: committed.externalOrderId,
            status: committed.status,
          },
        },
        requestId,
      );

      return this.cloneOrder(committed);
    });
  }

  async ingestGrabTaiwanWebhook(
    payload: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined> = {},
    requestId?: string,
  ) {
    this.logger.log("Received stub Grab Taiwan webhook payload.");

    const adapter = this.findAdapter(GRAB_TAIWAN_PLATFORM_CODE);
    if (adapter) {
      await this.verifyIncomingWebhook(adapter, payload, headers);
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

  getOrder(orderId: string) {
    return this.cloneOrder(this.requireOrder(orderId));
  }

  listDriverTaskViews(driverId: string) {
    this.assertNonBlank(driverId, "driverId");

    const ownedTasks = this.ownedMobilityService?.listDriverTasks() ?? [];
    const ownedOrders = new Map(
      (this.ownedMobilityService?.listOrders() ?? []).map((order) => [
        order.orderId,
        order,
      ]),
    );

    return this.buildDriverTaskViews(driverId, ownedTasks, ownedOrders);
  }

  async listDriverTaskViewsForRead(driverId: string) {
    this.assertNonBlank(driverId, "driverId");
    const ownedTasks = (
      (await this.ownedMobilityService?.listDriverTasksForRead()) ?? []
    ).filter((task) => task.driverId === driverId);
    const ownedOrders = new Map(
      (
        (await this.ownedMobilityService?.listOrdersForRead([
          ...new Set(ownedTasks.map((task) => task.orderId)),
        ])) ?? []
      ).map((order) => [order.orderId, order]),
    );
    return this.buildDriverTaskViews(driverId, ownedTasks, ownedOrders);
  }

  private buildDriverTaskViews(
    driverId: string,
    ownedTasks: DriverTaskRecord[],
    ownedOrders: Map<string, OwnedOrderRecord>,
  ) {
    const ownedViews = ownedTasks
      .filter((task) => task.driverId === driverId)
      .map((task) =>
        this.mapOwnedTaskToView(task, ownedOrders.get(task.orderId) ?? null),
      );

    const forwardedViews = this.forwardedOrders
      .filter((order) => this.isForwardedOrderVisibleToDriver(order, driverId))
      .map((order) => this.mapForwardedOrderToView(order));

    return [...ownedViews, ...forwardedViews].sort((left, right) =>
      this.compareDriverTaskViews(left, right),
    );
  }

  getDriverTaskView(driverId: string, taskId: string) {
    this.assertNonBlank(driverId, "driverId");

    const ownedTask = this.ownedMobilityService
      ?.listDriverTasks()
      .find((task) => task.taskId === taskId);
    if (ownedTask) {
      if (ownedTask.driverId !== driverId) {
        throw this.driverTaskViewNotFound(taskId);
      }
      const ownedOrder = this.ownedMobilityService
        ?.listOrders()
        .find((order) => order.orderId === ownedTask.orderId);
      return this.mapOwnedTaskToView(ownedTask, ownedOrder ?? null);
    }

    return this.getForwardedDriverTaskView(driverId, taskId);
  }

  async getDriverTaskViewForRead(driverId: string, taskId: string) {
    this.assertNonBlank(driverId, "driverId");
    const ownedTask =
      await this.ownedMobilityService?.findDriverTaskForRead(taskId);
    if (ownedTask) {
      if (ownedTask.driverId !== driverId)
        throw this.driverTaskViewNotFound(taskId);
      const orders = await this.ownedMobilityService!.listOrdersForRead([
        ownedTask.orderId,
      ]);
      return this.mapOwnedTaskToView(ownedTask, orders[0] ?? null);
    }
    return this.getForwardedDriverTaskView(driverId, taskId);
  }

  private getForwardedDriverTaskView(driverId: string, taskId: string) {
    const forwardedOrder = this.forwardedOrders.find(
      (order) => order.mirrorOrderId === taskId,
    );
    if (forwardedOrder) {
      if (!this.isForwardedOrderVisibleToDriver(forwardedOrder, driverId)) {
        throw this.driverTaskViewNotFound(taskId);
      }
      return this.mapForwardedOrderToView(forwardedOrder);
    }

    throw this.driverTaskViewNotFound(taskId);
  }

  private driverTaskViewNotFound(taskId: string) {
    return new ApiRequestError(
      HttpStatus.NOT_FOUND,
      "DRIVER_TASK_VIEW_NOT_FOUND",
      "Driver task view was not found.",
      { taskId },
    );
  }

  private isForwardedOrderVisibleToDriver(
    order: ForwardedOrderRecord,
    driverId: string,
  ): boolean {
    switch (order.status) {
      case "received":
        return false;
      case "broadcasted":
        return order.candidateDriverIds.includes(driverId);
      case "accept_pending":
      case "confirmed_by_platform":
      case "completed_synced":
      case "lost_race":
      case "cancelled_by_platform":
      case "sync_failed":
        return order.acceptedDriverId === driverId;
      default:
        return false;
    }
  }

  async acceptForwardedOrder(
    taskId: string,
    driverId: string,
    requestId?: string,
  ): Promise<ForwardedDriverActionResponse> {
    this.assertNonBlank(driverId, "driverId");

    let forwardedOrder = this.requireOrder(taskId);
    if (!this.isForwardedOrderVisibleToDriver(forwardedOrder, driverId)) {
      throw this.driverTaskViewNotFound(taskId);
    }

    if (forwardedOrder.status === "broadcasted") {
      try {
        await this.relayDriverAccept(taskId, { driverId }, requestId);
      } catch (error) {
        forwardedOrder = this.requireOrder(taskId);
        if (
          forwardedOrder.status === "sync_failed" &&
          forwardedOrder.acceptedDriverId === driverId &&
          !this.isPersistenceUncertainError(error)
        ) {
          return this.buildForwardedDriverActionResponse(
            "accept",
            "sync_failed",
            forwardedOrder,
          );
        }
        throw error;
      }

      // Re-read the canonical order instead of assuming our relay call won:
      // a newer native sync/reconciliation outcome, or a competing accept,
      // may have resolved this order to something other than accept_pending
      // while the relay call above was in flight.
      forwardedOrder = this.requireOrder(taskId);
    }

    if (forwardedOrder.acceptedDriverId !== driverId) {
      throw this.driverTaskViewNotFound(taskId);
    }

    // A cached status is not proof its own write landed (see
    // `isPersistenceUncertainError`'s doc comment): a *first* failed accept
    // is already caught above, but a *repeated* accept call for the same
    // still-uncertain order never goes through that catch at all (its
    // status is no longer "broadcasted"), so it must be checked again here
    // before this fall-through path reports success off the same
    // unconfirmed cache entry. This must use `isMirrorWriteAckUncertain`,
    // not a `lastSyncError.code` comparison: a confirmed degraded order
    // whose fallback write actually landed still carries that same code as
    // its recorded cause and must not be re-rejected on every repeat call.
    if (this.isMirrorWriteAckUncertain(forwardedOrder)) {
      throw new ApiRequestError(
        HttpStatus.BAD_GATEWAY,
        "FORWARDER_PERSISTENCE_ACK_UNCERTAIN",
        "Forwarded order mirror state has not been durably acknowledged; manual readback/reconciliation is required before treating this accept as complete.",
        {
          orderId: taskId,
          persisted: false,
        },
        true,
      );
    }

    return this.buildForwardedDriverActionResponse(
      "accept",
      this.resolveForwardedOutcomeFromStatus(forwardedOrder.status),
      forwardedOrder,
    );
  }

  async rejectForwardedOrder(
    taskId: string,
    driverId: string,
    reason?: string | null,
    requestId?: string,
  ): Promise<ForwardedDriverActionResponse> {
    this.assertNonBlank(driverId, "driverId");

    return this.withLock(taskId, async () => {
      const canonical = this.requireOrder(taskId);
      if (canonical.status !== "broadcasted") {
        if (!this.isForwardedOrderVisibleToDriver(canonical, driverId)) {
          throw this.driverTaskViewNotFound(taskId);
        }
        // Same honesty requirement as the equivalent repeated-accept check
        // in `acceptForwardedOrder`: a cached non-broadcasted status (e.g.
        // sync_failed) is not proof its own write landed. A driver command
        // that lands on this already-resolved order must not report success
        // off a mirror write that was never durably ACKed just because the
        // caller happened to send "reject" instead of "accept" this time.
        if (this.isMirrorWriteAckUncertain(canonical)) {
          throw new ApiRequestError(
            HttpStatus.BAD_GATEWAY,
            "FORWARDER_PERSISTENCE_ACK_UNCERTAIN",
            "Forwarded order mirror state has not been durably acknowledged; manual readback/reconciliation is required before treating this reject as complete.",
            {
              orderId: taskId,
              persisted: false,
            },
            true,
          );
        }
        return this.buildForwardedDriverActionResponse(
          "reject",
          this.resolveForwardedOutcomeFromStatus(canonical.status),
          canonical,
        );
      }

      if (!canonical.candidateDriverIds.includes(driverId)) {
        throw this.driverTaskViewNotFound(taskId);
      }

      const draft = this.cloneOrder(canonical);
      draft.candidateDriverIds = draft.candidateDriverIds.filter(
        (candidateDriverId) => candidateDriverId !== driverId,
      );
      draft.updatedAt = new Date().toISOString();
      const committed = await this.persistOrFail(
        draft,
        {},
        "reject_forwarded_order",
        requestId,
      );
      this.recordAudit(
        {
          actorId: driverId,
          actorType: "ops_user",
          tenantId: null,
          moduleName: "forwarder",
          actionName: "reject_forwarded_order",
          resourceType: "forwarded_order",
          resourceId: committed.mirrorOrderId,
          ...(reason?.trim()
            ? { oldValuesSummary: { reason: reason.trim() } }
            : {}),
          newValuesSummary: {
            status: committed.status,
            candidateDriverIds: committed.candidateDriverIds,
          },
        },
        requestId,
      );

      return this.buildForwardedDriverActionResponse(
        "reject",
        "rejected",
        committed,
      );
    });
  }

  async broadcastOrder(
    orderId: string,
    command: BroadcastForwardedOrderCommand,
    requestId?: string,
  ) {
    return this.withLock(orderId, async () => {
      const canonical = this.requireOrder(orderId);
      const serviceBucket = this.resolveServiceBucket(
        canonical.payload,
        canonical.authoritativeSnapshot,
      );
      const operatorContext = this.extractForwardedOperatorContext(canonical);
      if (operatorContext.operatingAuthorizationId) {
        await this.regulatoryRegistryService.prepareOperatingAuthorizationOperator?.(
          operatorContext.operatingAuthorizationId,
        );
      }
      const eligibleDrivers = new Set(
        (this.vehicleEligibilityService
          ? this.vehicleEligibilityService.listEligibleSupply(
              "third_party_forwarded_order",
              {
                serviceBucketOverride: serviceBucket,
                ...(operatorContext.hasOperatorContext
                  ? {
                      requestingOperatorId:
                        operatorContext.requestingOperatorId,
                      operatingAuthorizationId:
                        operatorContext.operatingAuthorizationId,
                      auditRefusal: true,
                      ...(requestId ? { requestId } : {}),
                    }
                  : {}),
              },
            )
          : operatorContext.hasOperatorContext
            ? this.regulatoryRegistryService.getEligibleCandidates(
                serviceBucket,
                null,
                {
                  requestingOperatorId: operatorContext.requestingOperatorId,
                  operatingAuthorizationId:
                    operatorContext.operatingAuthorizationId,
                  auditRefusal: true,
                  ...(requestId ? { requestId } : {}),
                },
              )
            : this.regulatoryRegistryService.getEligibleCandidates(
                serviceBucket,
              )
        ).map((candidate) => candidate.driverId),
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

      const draft = this.cloneOrder(canonical);
      draft.status = "broadcasted";
      draft.candidateDriverIds = [...candidateDriverIds];
      draft.updatedAt = new Date().toISOString();
      const adapterHealth = this.updateAdapterHealth(
        draft.platformCode,
        this.buildHealthyAdapterHealthPatch(draft.platformCode),
      );
      const committed = await this.persistOrFail(
        draft,
        {
          adapterHealth: [{ ...adapterHealth }],
        },
        "broadcast_forwarded_order",
        requestId,
      );
      this.recordAudit(
        {
          actorId: null,
          actorType: "system",
          tenantId: null,
          moduleName: "forwarder",
          actionName: "broadcast_forwarded_order",
          resourceType: "forwarded_order",
          resourceId: committed.mirrorOrderId,
          newValuesSummary: {
            status: committed.status,
            candidateDriverIds: committed.candidateDriverIds,
          },
        },
        requestId,
      );

      return {
        mirrorOrderId: committed.mirrorOrderId,
        status: committed.status,
        candidateDriverIds: [...committed.candidateDriverIds],
      };
    });
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
    const operatorContext =
      this.extractForwardedOperatorContext(forwardedOrder);
    if (
      operatorContext.hasOperatorContext &&
      typeof this.regulatoryRegistryService
        .evaluateVehicleOperatorExclusivity === "function"
    ) {
      if (operatorContext.operatingAuthorizationId) {
        await this.regulatoryRegistryService.prepareOperatingAuthorizationOperator?.(
          operatorContext.operatingAuthorizationId,
        );
      }
      const pairedVehicles =
        typeof this.regulatoryRegistryService.listSupplyPairs === "function"
          ? this.regulatoryRegistryService
              .listSupplyPairs()
              .filter((pair) => pair.driverId === command.driverId)
          : [];
      for (const pair of pairedVehicles) {
        const decision =
          this.regulatoryRegistryService.evaluateVehicleOperatorExclusivity(
            pair.vehicleId,
            {
              requestingOperatorId: operatorContext.requestingOperatorId,
              operatingAuthorizationId:
                operatorContext.operatingAuthorizationId,
              auditRefusal: true,
              ...(requestId ? { requestId } : {}),
            },
          );
        if (!decision.allowed) {
          throw new ApiRequestError(
            HttpStatus.CONFLICT,
            decision.reasonCode === "exclusivity_other_operator"
              ? "FORWARDER_VEHICLE_EXCLUSIVITY_OTHER_OPERATOR"
              : "FORWARDER_VEHICLE_EXCLUSIVITY_OPERATOR_UNBOUND",
            decision.reasonCode === "exclusivity_other_operator"
              ? "Driver paired vehicle is exclusively bound to another operator."
              : "Driver paired vehicle exclusivity declaration is not yet bound to an operator ID.",
            {
              orderId,
              driverId: command.driverId,
              vehicleId: pair.vehicleId,
              reasonCode: decision.reasonCode,
              reasonCodes: decision.reasonCode ? [decision.reasonCode] : [],
              requestingOperatorId: decision.requestingOperatorId,
              boundOperatorId: decision.boundOperatorId,
              evaluatedAt: decision.evaluatedAt,
            },
          );
        }
      }
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
      return this.withLock(orderId, async () => {
        const fresh = this.requireOrder(orderId);
        if (
          fresh.status !== "broadcasted" ||
          !fresh.candidateDriverIds.includes(command.driverId)
        ) {
          // A newer authoritative outcome, or a legitimate opt-out/
          // rebroadcast that already dropped this driver from the current
          // candidate set, landed before this relay command's own guard
          // check was re-evaluated. Either way that outcome is canonical
          // and must not be overwritten below.
          return {
            status: fresh.status,
            acceptedDriverId: fresh.acceptedDriverId,
          };
        }
        const draft = this.cloneOrder(fresh);
        const { order: failedOrder, persisted } = await this.markSyncFailed(
          draft,
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
            platformCode: failedOrder.platformCode,
            reconciliationJobId:
              failedOrder.reconciliationJob?.reconciliationJobId ?? null,
            persisted,
          },
          true,
        );
      });
    }

    // Deliberately outside the order lock: this is a potentially slow
    // external call and must never block other commands (in particular a
    // native authority sync) on this same order while it is in flight. Any
    // staleness this creates is re-checked immediately below, inside the
    // lock, right before this relay's own mutation would be committed.
    let adapterAcknowledged = true;
    let adapterError: unknown = null;
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
      adapterAcknowledged = false;
      adapterError = error;
    }

    if (!adapterAcknowledged) {
      return this.withLock(orderId, async () => {
        const fresh = this.requireOrder(orderId);
        if (
          fresh.status !== "broadcasted" ||
          !fresh.candidateDriverIds.includes(command.driverId)
        ) {
          // A newer authoritative outcome (native sync/reconciliation, or a
          // competing accept that already claimed the order), or a
          // legitimate opt-out/rebroadcast that already dropped this driver
          // from the current candidate set, landed while this relay call was
          // awaiting the adapter. That outcome is canonical; this local
          // relay failure is moot and must not reconstruct sync_failed over
          // it.
          return {
            status: fresh.status,
            acceptedDriverId: fresh.acceptedDriverId,
          };
        }

        const errorMessage =
          adapterError instanceof Error
            ? adapterError.message
            : String(adapterError);
        const draft = this.cloneOrder(fresh);
        const { order: failedOrder, persisted } = await this.markSyncFailed(
          draft,
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
            platformCode: failedOrder.platformCode,
            reconciliationJobId:
              failedOrder.reconciliationJob?.reconciliationJobId ?? null,
            persisted,
          },
          true,
        );
      });
    }

    return this.withLock(orderId, async () => {
      const fresh = this.requireOrder(orderId);
      if (
        fresh.status !== "broadcasted" ||
        !fresh.candidateDriverIds.includes(command.driverId)
      ) {
        // Same race as above, but the adapter call itself succeeded (late
        // success): a newer native/competing outcome, or a legitimate
        // opt-out/rebroadcast that already dropped this driver from the
        // current candidate set, already landed during the await and must
        // survive instead of being overwritten below.
        return {
          status: fresh.status,
          acceptedDriverId: fresh.acceptedDriverId,
        };
      }

      const draft = this.cloneOrder(fresh);
      draft.status = "accept_pending";
      draft.acceptedDriverId = command.driverId;
      draft.lastSyncError = null;
      draft.manualFallback = {
        ...draft.manualFallback,
        required: false,
      };
      draft.updatedAt = new Date().toISOString();
      const adapterHealth = this.updateAdapterHealth(
        draft.platformCode,
        this.buildHealthyAdapterHealthPatch(draft.platformCode, {
          credentialStatus: "valid",
          authStatus: "authenticated",
          rateLimitStatus: "ok",
        }),
      );
      const committed = await this.persistOrFail(
        draft,
        {
          adapterHealth: [{ ...adapterHealth }],
        },
        "relay_driver_accept",
        requestId,
        command.driverId,
      );
      this.recordAudit(
        {
          actorId: command.driverId,
          actorType: "ops_user",
          tenantId: null,
          moduleName: "forwarder",
          actionName: "relay_driver_accept",
          resourceType: "forwarded_order",
          resourceId: committed.mirrorOrderId,
          newValuesSummary: {
            status: committed.status,
            acceptedDriverId: committed.acceptedDriverId,
          },
        },
        requestId,
      );

      return {
        status: committed.status,
        acceptedDriverId: committed.acceptedDriverId,
      };
    });
  }

  async reportSyncFailure(
    orderId: string,
    command: ReportForwarderSyncFailureCommand,
    requestId?: string,
  ) {
    return this.withLock(orderId, async () => {
      const canonical = this.requireOrder(orderId);
      const draft = this.cloneOrder(canonical);
      const { order, persisted } = await this.markSyncFailed(
        draft,
        command,
        requestId,
      );
      if (!persisted) {
        // This command's whole job is to durably record the sync-failed
        // state. If that recording itself never landed, reporting success
        // would hide the uncertainty from the caller; surface the same
        // honest degraded-ACK contract persistOrFail uses elsewhere instead.
        throw new ApiRequestError(
          HttpStatus.BAD_GATEWAY,
          "FORWARDER_PERSISTENCE_ACK_UNCERTAIN",
          "Forwarded order sync-failure record was not durably acknowledged; manual readback/reconciliation is required before treating this as complete.",
          {
            orderId,
            context: "report_sync_failure",
          },
          true,
        );
      }
      return this.cloneOrder(order);
    });
  }

  async engageManualFallback(
    orderId: string,
    command: EngageForwarderManualFallbackCommand,
    requestId?: string,
  ) {
    return this.withLock(orderId, async () => {
      const canonical = this.requireOrder(orderId);
      if (
        canonical.status === "confirmed_by_platform" ||
        canonical.status === "completed_synced" ||
        canonical.status === "lost_race" ||
        canonical.status === "cancelled_by_platform"
      ) {
        throw new ApiRequestError(
          HttpStatus.CONFLICT,
          "FORWARDED_ORDER_ALREADY_RESOLVED",
          "Manual fallback can only be engaged while the forwarded order is still unresolved.",
          {
            orderId,
            status: canonical.status,
          },
        );
      }

      const now = new Date().toISOString();
      const draft = this.cloneOrder(canonical);
      draft.manualFallback = {
        required: true,
        reason: command.reason,
        requestedAt: now,
        requestedBy: command.requestedBy?.trim() || null,
        notes: command.notes?.trim() || null,
      };
      if (!draft.reconciliationJob) {
        draft.reconciliationJob = this.createReconciliationJob(
          draft,
          "manual_fallback",
          command.reason,
          now,
        );
      }
      draft.updatedAt = now;
      const committed = await this.persistOrFail(
        draft,
        {},
        "engage_manual_fallback",
        requestId,
      );
      this.recordAudit(
        {
          actorId: command.requestedBy?.trim() || null,
          actorType: "ops_user",
          tenantId: null,
          moduleName: "forwarder",
          actionName: "engage_manual_fallback",
          resourceType: "forwarded_order",
          resourceId: committed.mirrorOrderId,
          newValuesSummary: {
            status: committed.status,
            manualFallbackRequired: true,
            reconciliationJobId:
              committed.reconciliationJob?.reconciliationJobId ?? null,
          },
        },
        requestId,
      );

      return this.cloneOrder(committed);
    });
  }

  async syncNativeStatus(
    orderId: string,
    command: SyncForwardedOrderStatusCommand,
    requestId?: string,
  ) {
    return this.withLock(orderId, async () => {
      const canonical = this.requireOrder(orderId);
      const nextStatus = this.resolveNextStatus(command.nativeStatus);

      const draft = this.cloneOrder(canonical);
      draft.status = nextStatus;
      draft.lastNativeStatus = command.nativeStatus;
      draft.authoritativeSnapshot = {
        ...draft.authoritativeSnapshot,
        nativeStatus: command.nativeStatus,
        ...(command.payload ?? {}),
      };
      draft.updatedAt = new Date().toISOString();
      if (draft.reconciliationJob?.status === "queued") {
        draft.reconciliationJob = {
          ...draft.reconciliationJob,
          status: "completed",
          mismatchCount: 0,
          notes: "Resolved by native status sync.",
          completedAt: draft.updatedAt,
        };
        draft.lastSyncError = null;
        draft.manualFallback = {
          ...draft.manualFallback,
          required: false,
        };
      }
      const adapterHealth = this.updateAdapterHealth(
        draft.platformCode,
        this.buildHealthyAdapterHealthPatch(draft.platformCode),
      );
      const committed = await this.persistOrFail(
        draft,
        {
          adapterHealth: [{ ...adapterHealth }],
        },
        "sync_forwarded_order_status",
        requestId,
      );
      this.recordAudit(
        {
          actorId: null,
          actorType: "system",
          tenantId: null,
          moduleName: "forwarder",
          actionName: "sync_forwarded_order_status",
          resourceType: "forwarded_order",
          resourceId: committed.mirrorOrderId,
          newValuesSummary: {
            status: committed.status,
            nativeStatus: committed.lastNativeStatus,
            acceptedDriverId: committed.acceptedDriverId,
          },
        },
        requestId,
      );

      this.closeDriverTasksOnTerminalState(committed, requestId);

      return {
        status: committed.status,
        authoritativeSnapshot: { ...committed.authoritativeSnapshot },
      };
    });
  }

  async completeReconciliation(
    orderId: string,
    command: CompleteForwarderReconciliationCommand,
    requestId?: string,
  ) {
    return this.withLock(orderId, async () => {
      const canonical = this.requireOrder(orderId);
      if (!canonical.reconciliationJob) {
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
      const draft = this.cloneOrder(canonical);
      draft.status = nextStatus;
      draft.lastNativeStatus = command.nativeStatus;
      draft.authoritativeSnapshot = {
        ...draft.authoritativeSnapshot,
        nativeStatus: command.nativeStatus,
        ...(command.payload ?? {}),
      };
      draft.lastSyncError = null;
      draft.manualFallback = {
        ...draft.manualFallback,
        required: false,
        notes: command.notes?.trim() ?? draft.manualFallback.notes,
      };
      draft.reconciliationJob = {
        ...draft.reconciliationJob!,
        status: "completed",
        mismatchCount: command.mismatchCount,
        notes: command.notes?.trim() || null,
        completedAt,
      };
      draft.updatedAt = completedAt;
      const adapterHealth = this.updateAdapterHealth(
        draft.platformCode,
        this.buildHealthyAdapterHealthPatch(draft.platformCode),
      );
      const committed = await this.persistOrFail(
        draft,
        {
          adapterHealth: [{ ...adapterHealth }],
        },
        "complete_forwarder_reconciliation",
        requestId,
      );
      this.recordAudit(
        {
          actorId: null,
          actorType: "system",
          tenantId: null,
          moduleName: "forwarder",
          actionName: "complete_forwarder_reconciliation",
          resourceType: "forwarded_order",
          resourceId: committed.mirrorOrderId,
          newValuesSummary: {
            status: committed.status,
            nativeStatus: committed.lastNativeStatus,
            reconciliationJobId: committed.reconciliationJob!.reconciliationJobId,
          },
        },
        requestId,
      );

      this.closeDriverTasksOnTerminalState(committed, requestId);

      return this.cloneOrder(committed);
    });
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
    return this.adapterHealth.map((adapter) =>
      this.cloneAdapterHealth(adapter),
    );
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

  private async seedRegisteredAdapters() {
    const seededHealth: AdapterHealthRecord[] = [];

    for (const adapter of this.adapters) {
      const existing = this.adapterHealth.find(
        (record) => record.platformCode === adapter.platformCode,
      );
      const snapshot = await this.safeGetHealthSnapshot(adapter);

      if (existing) {
        if (snapshot) {
          seededHealth.push(
            this.updateAdapterHealth(
              adapter.platformCode,
              this.buildHealthSnapshotPatch(snapshot),
            ),
          );
        }
        continue;
      }

      seededHealth.push(
        this.updateAdapterHealth(adapter.platformCode, {
          ...this.buildAdapterHealthBaseline(adapter.platformCode, adapter),
          ...this.buildHealthSnapshotPatch(snapshot),
        }),
      );
    }

    if (seededHealth.length > 0) {
      try {
        await this.persistChanges(
          {
            adapterHealth: seededHealth,
          },
          "seed_forwarder_adapters",
        );
      } catch {
        // Already logged via reportPersistenceFailure inside persistChanges.
        // Adapter-health seeding is best-effort telemetry at boot, not part
        // of the mirror command lifecycle; it must not block module init.
      }
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

  /**
   * Mutates `draft` (a clone not yet visible to readers — never the live
   * array entry) into the honest degraded sync_failed state and commits it.
   * This is the terminal best-effort recording path: there is no further
   * fallback to escalate to without inventing a fake ACK, so when
   * persisting this degraded state ALSO fails, the lastSyncError/
   * manualFallback are overwritten to flag that double uncertainty instead
   * of silently keeping the original failure's wording as if it had been
   * durably recorded. Must always be called from within `withLock` for this
   * order so the commit below cannot interleave with another command's.
   * Callers that are themselves a top-level durable-ACK command (not
   * already inside another command's own failure handling, e.g.
   * `reportSyncFailure`) must check the returned `persisted` flag and must
   * not report success when it is false.
   */
  private async markSyncFailed(
    draft: ForwardedOrderRecord,
    command: ReportForwarderSyncFailureCommand,
    requestId?: string,
    acceptedDriverId?: string,
  ): Promise<{ order: ForwardedOrderRecord; persisted: boolean }> {
    const failedAt = new Date().toISOString();
    let lastSyncError: ForwarderSyncErrorRecord = {
      code: command.errorCode,
      message: command.errorMessage,
      retryable: command.retryable,
      failedAt,
      nativeStatus: command.nativeStatus?.trim() || null,
      payload: { ...(command.payload ?? {}) },
    };

    draft.status = "sync_failed";
    draft.acceptedDriverId = acceptedDriverId ?? draft.acceptedDriverId;
    draft.lastSyncError = lastSyncError;
    draft.manualFallback = {
      required: true,
      reason: command.manualFallbackReason?.trim() || command.errorMessage,
      requestedAt: failedAt,
      requestedBy: null,
      notes: null,
    };
    draft.reconciliationJob = this.createReconciliationJob(
      draft,
      "sync_failed",
      command.errorMessage,
      failedAt,
    );
    draft.updatedAt = failedAt;
    const adapterHealth = this.updateAdapterHealth(
      draft.platformCode,
      this.buildFailureAdapterHealthPatch(draft.platformCode, command, failedAt),
    );

    let persisted = true;
    try {
      await this.persistChanges(
        {
          forwardedOrders: [this.cloneOrder(draft)],
          adapterHealth: [{ ...adapterHealth }],
        },
        "mark_forwarder_sync_failed",
      );
    } catch (error) {
      persisted = false;
      const detail = error instanceof Error ? error.message : String(error);
      lastSyncError = {
        ...lastSyncError,
        code: "FORWARDER_PERSISTENCE_ACK_UNCERTAIN",
        message: `Durable persistence ACK was not received for mark_forwarder_sync_failed (original ${command.errorCode}: ${command.errorMessage}): ${detail}`,
        // `code` alone cannot distinguish this from a cause that merely
        // *describes itself* as ACK-uncertain (see `persistOrFail`, which
        // always passes that same code as the reason it is falling back to
        // sync_failed) but whose fallback write here actually landed. This
        // marker is set only when *this* write itself failed to durably
        // commit, so `isMirrorWriteAckUncertain` can tell the two apart.
        payload: { ...lastSyncError.payload, mirrorWriteAckUncertain: true },
      };
      draft.lastSyncError = lastSyncError;
      draft.manualFallback = {
        ...draft.manualFallback,
        reason:
          "Local mirror write was not durably confirmed; verify canonical state via readback/reconciliation before retrying.",
      };
    }

    this.commitOrder(draft);

    this.recordAudit(
      {
        actorId: acceptedDriverId ?? null,
        actorType: acceptedDriverId ? "ops_user" : "system",
        tenantId: null,
        moduleName: "forwarder",
        actionName: "mark_forwarder_sync_failed",
        resourceType: "forwarded_order",
        resourceId: draft.mirrorOrderId,
        newValuesSummary: {
          status: draft.status,
          errorCode: lastSyncError.code,
          retryable: lastSyncError.retryable,
          persisted,
          reconciliationJobId: draft.reconciliationJob?.reconciliationJobId ?? null,
        },
      },
      requestId,
    );

    return { order: draft, persisted };
  }

  private updateAdapterHealth(
    platformCode: PlatformCode,
    patch: Partial<AdapterHealthRecord> = {},
  ) {
    const adapter = this.findAdapter(platformCode);
    const existing = this.adapterHealth.find(
      (adapter) => adapter.platformCode === platformCode,
    );
    const baseline = existing
      ? this.normalizeAdapterHealthRecord(existing)
      : this.buildAdapterHealthBaseline(platformCode, adapter);
    const next: AdapterHealthRecord = {
      ...baseline,
      ...patch,
      platformCode,
      capabilitySummary: this.cloneCapabilitySummary(
        patch.capabilitySummary ?? baseline.capabilitySummary,
      ),
      lastCheckedAt: patch.lastCheckedAt ?? new Date().toISOString(),
    };

    if (!existing) {
      this.adapterHealth = [next, ...this.adapterHealth];
      return this.cloneAdapterHealth(next);
    }

    Object.assign(existing, next);
    return this.cloneAdapterHealth(existing);
  }

  private buildAdapterHealthBaseline(
    platformCode: PlatformCode,
    adapter?: ForwarderAdapterInterface,
  ): AdapterHealthRecord {
    const capabilitySummary = this.cloneCapabilitySummary(
      adapter?.capabilitySummary ??
        this.buildFallbackCapabilitySummary(platformCode),
    );
    const isStub = capabilitySummary.productionStatus === "stub";
    const configurationRequired =
      capabilitySummary.productionStatus === "configuration_required";
    const now = new Date().toISOString();

    return {
      platformCode,
      status: isStub
        ? "healthy"
        : configurationRequired
          ? "degraded"
          : "healthy",
      reason: isStub ? "stub" : configurationRequired ? "credential" : "none",
      capabilitySummary,
      credentialStatus: isStub
        ? "stub"
        : configurationRequired
          ? "not_configured"
          : "unknown",
      authStatus: isStub ? "stub" : "unknown",
      webhookStatus: isStub
        ? "stub"
        : capabilitySummary.supportsInboundWebhook
          ? "not_configured"
          : "not_applicable",
      rateLimitStatus: isStub ? "stub" : "unknown",
      lastCheckedAt: now,
      lastError: null,
      lastWebhookReceivedAt: null,
      lastRateLimitAt: null,
      lastAuthFailureAt: null,
    };
  }

  private buildFallbackCapabilitySummary(platformCode: PlatformCode) {
    const registryEntry = PLATFORM_CODE_REGISTRY[platformCode];
    if (registryEntry?.status === "forwarder_stub") {
      return {
        mode: "stub" as const,
        productionStatus: "stub" as const,
        supportsInboundWebhook: true,
        supportsOutboundActions: true,
        supportedWebhookEvents: [],
        notes: [
          `${registryEntry.displayName} is currently a stub-only forwarder adapter.`,
        ],
      };
    }

    return {
      mode: "api" as const,
      productionStatus: "configuration_required" as const,
      supportsInboundWebhook: false,
      supportsOutboundActions: false,
      supportedWebhookEvents: [],
      notes: [
        registryEntry
          ? `No runtime forwarder adapter is registered for ${registryEntry.displayName}.`
          : "No runtime forwarder adapter is registered for this platform.",
      ],
    };
  }

  private cloneCapabilitySummary(
    capabilitySummary: AdapterHealthRecord["capabilitySummary"],
  ) {
    return {
      ...capabilitySummary,
      supportedWebhookEvents: [...capabilitySummary.supportedWebhookEvents],
      notes: [...capabilitySummary.notes],
    };
  }

  private cloneAdapterHealth(
    adapter: AdapterHealthRecord,
  ): AdapterHealthRecord {
    return {
      ...adapter,
      capabilitySummary: this.cloneCapabilitySummary(adapter.capabilitySummary),
    };
  }

  private normalizeAdapterHealthRecord(record: Partial<AdapterHealthRecord>) {
    const adapter = this.findAdapter(record.platformCode as PlatformCode);
    const baseline = this.buildAdapterHealthBaseline(
      record.platformCode as PlatformCode,
      adapter,
    );

    if (baseline.status !== "healthy") {
      return {
        ...baseline,
        ...record,
        status: baseline.status,
        reason: baseline.reason,
        credentialStatus: baseline.credentialStatus,
        authStatus: baseline.authStatus,
        webhookStatus: baseline.webhookStatus,
        rateLimitStatus: baseline.rateLimitStatus,
        platformCode: record.platformCode ?? baseline.platformCode,
        capabilitySummary: this.cloneCapabilitySummary(
          adapter?.capabilitySummary ??
            record.capabilitySummary ??
            baseline.capabilitySummary,
        ),
        lastWebhookReceivedAt: record.lastWebhookReceivedAt ?? null,
        lastRateLimitAt: record.lastRateLimitAt ?? null,
        lastAuthFailureAt: record.lastAuthFailureAt ?? null,
      };
    }

    return {
      ...baseline,
      ...record,
      platformCode: record.platformCode ?? baseline.platformCode,
      capabilitySummary: this.cloneCapabilitySummary(
        adapter?.capabilitySummary ??
          record.capabilitySummary ??
          baseline.capabilitySummary,
      ),
      lastWebhookReceivedAt: record.lastWebhookReceivedAt ?? null,
      lastRateLimitAt: record.lastRateLimitAt ?? null,
      lastAuthFailureAt: record.lastAuthFailureAt ?? null,
    };
  }

  private async safeGetHealthSnapshot(adapter: ForwarderAdapterInterface) {
    if (!adapter.getHealthSnapshot) {
      return null;
    }

    try {
      return await adapter.getHealthSnapshot();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return {
        status: "degraded",
        reason: "platform",
        credentialStatus: "unknown",
        authStatus: "unknown",
        webhookStatus: adapter.capabilitySummary.supportsInboundWebhook
          ? "unknown"
          : "not_applicable",
        rateLimitStatus: "unknown",
        message: `health snapshot failed: ${detail}`,
      } satisfies ForwarderAdapterHealthSnapshot;
    }
  }

  private buildHealthSnapshotPatch(
    snapshot: ForwarderAdapterHealthSnapshot | null,
  ): Partial<AdapterHealthRecord> {
    if (!snapshot) {
      return {};
    }

    return {
      status: snapshot.status,
      reason: snapshot.reason,
      credentialStatus: snapshot.credentialStatus,
      authStatus: snapshot.authStatus,
      webhookStatus: snapshot.webhookStatus,
      rateLimitStatus: snapshot.rateLimitStatus,
      lastCheckedAt: snapshot.checkedAt ?? new Date().toISOString(),
      lastError: snapshot.message ?? null,
    };
  }

  private buildHealthyAdapterHealthPatch(
    platformCode: PlatformCode,
    patch: Partial<AdapterHealthRecord> = {},
  ): Partial<AdapterHealthRecord> {
    const baseline = this.buildAdapterHealthBaseline(
      platformCode,
      this.findAdapter(platformCode),
    );

    const existing = this.adapterHealth.find(
      (record) => record.platformCode === platformCode,
    );

    if (baseline.status !== "healthy") {
      return {
        status: baseline.status,
        reason: baseline.reason,
        credentialStatus: baseline.credentialStatus,
        authStatus: baseline.authStatus,
        webhookStatus: baseline.webhookStatus,
        rateLimitStatus: baseline.rateLimitStatus,
        lastCheckedAt: new Date().toISOString(),
        lastError: existing?.lastError ?? null,
        ...patch,
      };
    }

    return {
      status: "healthy",
      reason: baseline.reason,
      lastCheckedAt: new Date().toISOString(),
      lastError: null,
      ...patch,
    };
  }

  private buildFailureAdapterHealthPatch(
    platformCode: PlatformCode,
    command: ReportForwarderSyncFailureCommand,
    failedAt: string,
  ): Partial<AdapterHealthRecord> {
    const baseline = this.buildAdapterHealthBaseline(
      platformCode,
      this.findAdapter(platformCode),
    );
    const signals =
      `${command.errorCode} ${command.errorMessage} ${command.nativeStatus ?? ""}`.toLowerCase();

    if (baseline.status !== "healthy") {
      return {
        status: baseline.status,
        reason: baseline.reason,
        credentialStatus: baseline.credentialStatus,
        authStatus: baseline.authStatus,
        webhookStatus: baseline.webhookStatus,
        rateLimitStatus: baseline.rateLimitStatus,
        lastCheckedAt: failedAt,
        lastError: `${command.errorCode}: ${command.errorMessage}`,
      };
    }

    const patch: Partial<AdapterHealthRecord> = {
      status: command.retryable ? "degraded" : "down",
      reason: "platform",
      credentialStatus: baseline.credentialStatus,
      authStatus: baseline.authStatus,
      webhookStatus: baseline.webhookStatus,
      rateLimitStatus: baseline.rateLimitStatus,
      lastCheckedAt: failedAt,
      lastError: `${command.errorCode}: ${command.errorMessage}`,
    };

    if (signals.includes("429") || signals.includes("rate limit")) {
      patch.reason = "rate_limit";
      if (baseline.rateLimitStatus !== "stub") {
        patch.rateLimitStatus = "limited";
        patch.lastRateLimitAt = failedAt;
      }
      return patch;
    }

    if (signals.includes("webhook") || signals.includes("signature")) {
      patch.reason = "webhook";
      if (baseline.webhookStatus !== "stub") {
        patch.webhookStatus = "failing";
      }
      return patch;
    }

    if (signals.includes("credential") || signals.includes("secret")) {
      patch.reason = "credential";
      if (baseline.credentialStatus !== "stub") {
        patch.credentialStatus = signals.includes("expired")
          ? "expired"
          : "invalid";
      }
      if (baseline.authStatus !== "stub") {
        patch.authStatus = "invalid";
        patch.lastAuthFailureAt = failedAt;
      }
      return patch;
    }

    if (
      signals.includes("reauth") ||
      signals.includes("token expired") ||
      signals.includes("unauthor") ||
      signals.includes("forbidden") ||
      signals.includes("401") ||
      signals.includes("403")
    ) {
      patch.reason = "auth";
      if (baseline.authStatus !== "stub") {
        patch.authStatus =
          signals.includes("reauth") || signals.includes("expired")
            ? "reauth_required"
            : "invalid";
        patch.lastAuthFailureAt = failedAt;
      }
      if (signals.includes("expired") && baseline.credentialStatus !== "stub") {
        patch.credentialStatus = "expired";
      }
    }

    return patch;
  }

  private async verifyIncomingWebhook(
    adapter: ForwarderAdapterInterface,
    payload: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined>,
  ) {
    const verifiedAt = new Date().toISOString();

    if (!adapter.verifyWebhook) {
      const adapterHealth = this.updateAdapterHealth(
        adapter.platformCode,
        this.buildHealthyAdapterHealthPatch(adapter.platformCode, {
          webhookStatus: adapter.capabilitySummary.supportsInboundWebhook
            ? "healthy"
            : "not_applicable",
          lastWebhookReceivedAt: verifiedAt,
        }),
      );
      this.persistChanges(
        {
          adapterHealth: [adapterHealth],
        },
        "verify_forwarder_webhook",
      ).catch(() => {
        // Already logged via reportPersistenceFailure inside persistChanges.
        // Adapter-health telemetry is best-effort and must not block or
        // reshape the webhook verification outcome itself.
      });
      return;
    }

    try {
      const verification = await adapter.verifyWebhook({
        headers,
        payload,
      });
      if (!verification.accepted) {
        const baseline = this.buildAdapterHealthBaseline(
          adapter.platformCode,
          adapter,
        );
        const adapterHealth = this.updateAdapterHealth(adapter.platformCode, {
          status: baseline.status !== "healthy" ? baseline.status : "degraded",
          reason: baseline.status !== "healthy" ? baseline.reason : "webhook",
          credentialStatus:
            verification.credentialStatus ?? baseline.credentialStatus,
          authStatus: verification.authStatus ?? baseline.authStatus,
          webhookStatus:
            verification.webhookStatus ??
            (baseline.status !== "healthy"
              ? baseline.webhookStatus
              : "failing"),
          lastCheckedAt: verifiedAt,
          lastError:
            verification.detail ?? "Webhook signature verification failed.",
        });
        this.persistChanges(
          {
            adapterHealth: [adapterHealth],
          },
          "verify_forwarder_webhook",
        ).catch(() => {
          // Already logged via reportPersistenceFailure inside
          // persistChanges; this health telemetry write must not block or
          // reshape the (already decided) webhook rejection below.
        });
        throw new ApiRequestError(
          HttpStatus.UNAUTHORIZED,
          "FORWARDER_WEBHOOK_VERIFICATION_FAILED",
          "Forwarder webhook verification failed.",
          {
            platformCode: adapter.platformCode,
          },
        );
      }

      const verifiedHealthPatch: Partial<AdapterHealthRecord> = {
        webhookStatus: verification.webhookStatus ?? "healthy",
        lastWebhookReceivedAt: verifiedAt,
      };
      if (verification.credentialStatus) {
        verifiedHealthPatch.credentialStatus = verification.credentialStatus;
      }
      if (verification.authStatus) {
        verifiedHealthPatch.authStatus = verification.authStatus;
      }

      const adapterHealth = this.updateAdapterHealth(
        adapter.platformCode,
        this.buildHealthyAdapterHealthPatch(
          adapter.platformCode,
          verifiedHealthPatch,
        ),
      );
      this.persistChanges(
        {
          adapterHealth: [adapterHealth],
        },
        "verify_forwarder_webhook",
      ).catch(() => {
        // Already logged via reportPersistenceFailure inside persistChanges.
        // Adapter-health telemetry is best-effort and must not block or
        // reshape the already-accepted webhook verification outcome.
      });
    } catch (error) {
      if (error instanceof ApiRequestError) {
        throw error;
      }

      const detail = error instanceof Error ? error.message : String(error);
      const adapterHealth = this.updateAdapterHealth(adapter.platformCode, {
        status: "degraded",
        reason: "webhook",
        webhookStatus: "failing",
        lastCheckedAt: verifiedAt,
        lastError: detail,
      });
      this.persistChanges(
        {
          adapterHealth: [adapterHealth],
        },
        "verify_forwarder_webhook",
      ).catch(() => {
        // Already logged via reportPersistenceFailure inside persistChanges;
        // this health telemetry write must not mask the real verification
        // error being thrown below.
      });
      throw new ApiRequestError(
        HttpStatus.UNAUTHORIZED,
        "FORWARDER_WEBHOOK_VERIFICATION_FAILED",
        "Forwarder webhook verification failed.",
        {
          platformCode: adapter.platformCode,
        },
      );
    }
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

  private compareDriverTaskViews(
    left: UnifiedDriverTaskView,
    right: UnifiedDriverTaskView,
  ) {
    const priorityDiff =
      DRIVER_TASK_VIEW_PRIORITY[left.driverActionState] -
      DRIVER_TASK_VIEW_PRIORITY[right.driverActionState];
    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    return right.updatedAt.localeCompare(left.updatedAt);
  }

  private mapOwnedTaskToView(
    task: DriverTaskRecord,
    order: OwnedOrderRecord | null,
  ): UnifiedDriverTaskView {
    const blockingReason = this.resolveOwnedBlockingReason(task);

    return {
      taskId: task.taskId,
      orderId: task.orderId,
      orderDomain: "owned",
      sourcePlatform: "drts",
      platformDisplayName: DRTS_PLATFORM_DISPLAY_NAME,
      externalOrderId: null,
      nativeStatus: null,
      localStatus: task.status,
      driverActionState: this.resolveOwnedDriverActionState(task),
      allowedActions: this.resolveOwnedAllowedActions(task),
      routeLocked: false,
      fareAuthority: "drts",
      settlementAuthority: "drts",
      driverPayoutAuthority: "drts",
      requiresManualFallback: false,
      requiresReauth: false,
      syncIssueSummary: null,
      blockingReason,
      pickupSummary: order?.pickup.address ?? null,
      dropoffSummary: order?.dropoff.address ?? null,
      orderSummary: order
        ? {
            orderId: order.orderId,
            serviceBucket: order.serviceBucket,
            serviceProductCode: order.serviceProductCode ?? null,
            businessDispatchSubtype: order.businessDispatchSubtype,
            dispatchSemantics: order.dispatchSemantics,
            fixedPrice: order.fixedPrice,
            quotedFare: order.quotedFare,
          }
        : null,
      deadlineAt:
        order?.dispatchTimeout?.timeoutAt ??
        order?.reservationWindowStart ??
        null,
      updatedAt: order?.updatedAt ?? this.resolveOwnedTaskUpdatedAt(task),
    };
  }

  private mapForwardedOrderToView(
    order: ForwardedOrderRecord,
  ): UnifiedDriverTaskView {
    const syncIssueSummary = this.resolveForwardedSyncIssueSummary(order);
    const requiresReauth = this.resolveForwardedRequiresReauth(order);
    const blockingReason =
      this.resolveForwardedBlockingReason(order) ??
      (requiresReauth
        ? "Platform re-authentication is required before driver actions can resume."
        : null);

    return {
      taskId: order.mirrorOrderId,
      orderId: order.mirrorOrderId,
      orderDomain: "forwarded",
      sourcePlatform: order.platformCode,
      platformDisplayName: this.resolvePlatformDisplayName(order.platformCode),
      externalOrderId: order.externalOrderId,
      nativeStatus: order.lastNativeStatus,
      localStatus: order.status,
      driverActionState: this.resolveForwardedDriverActionState(order),
      allowedActions: this.resolveForwardedAllowedActions(order),
      routeLocked: true,
      fareAuthority: "external_platform",
      settlementAuthority: "external_platform",
      driverPayoutAuthority: "external_platform",
      requiresManualFallback: order.manualFallback.required,
      requiresReauth,
      syncIssueSummary,
      blockingReason,
      pickupSummary: this.extractForwardedSummary(order, [
        "pickupSummary",
        "pickupAddress",
        "pickup.address",
      ]),
      dropoffSummary: this.extractForwardedSummary(order, [
        "dropoffSummary",
        "dropoffAddress",
        "dropoff.address",
      ]),
      deadlineAt: order.reconciliationJob?.createdAt ?? null,
      updatedAt: order.updatedAt,
    };
  }

  private resolveOwnedDriverActionState(
    task: DriverTaskRecord,
  ): UnifiedDriverTaskView["driverActionState"] {
    switch (task.status) {
      case "pending_acceptance":
        return "action_required";
      case "accepted":
      case "enroute_pickup":
      case "arrived_pickup":
      case "on_trip":
        return "in_progress";
      case "proof_pending":
        return "blocked";
      case "completed":
        return "completed";
      case "rejected":
      case "cancelled":
        return "read_only";
    }
  }

  private resolveOwnedAllowedActions(
    task: DriverTaskRecord,
  ): DriverTaskAction[] {
    switch (task.status) {
      case "pending_acceptance":
        return ["accept", "reject"];
      case "accepted":
        return ["depart"];
      case "enroute_pickup":
        return ["arrived_pickup"];
      case "arrived_pickup":
        return ["start"];
      case "on_trip":
        return ["complete"];
      default:
        return [];
    }
  }

  private resolveOwnedBlockingReason(task: DriverTaskRecord) {
    const gate = task.complianceGates?.find(
      (candidate) => candidate.blocking || candidate.state !== "clear",
    );
    if (gate) {
      return gate.nextAction;
    }
    if (task.status === "proof_pending") {
      return "Completion proof must be submitted before the trip can close.";
    }
    return null;
  }

  private resolveOwnedTaskUpdatedAt(task: DriverTaskRecord) {
    return (
      task.completedAt ??
      task.startedAt ??
      task.arrivedPickupAt ??
      task.departedAt ??
      task.acceptedAt ??
      new Date(0).toISOString()
    );
  }

  private resolveForwardedDriverActionState(
    order: ForwardedOrderRecord,
  ): UnifiedDriverTaskView["driverActionState"] {
    if (order.manualFallback.required || order.status === "sync_failed") {
      return "blocked";
    }

    switch (order.status) {
      case "received":
      case "broadcasted":
        return "action_required";
      case "accept_pending":
        return "awaiting_platform";
      case "confirmed_by_platform":
        return "in_progress";
      case "lost_race":
      case "cancelled_by_platform":
        return "read_only";
      case "completed_synced":
        return "completed";
      default:
        return "completed";
    }
  }

  private resolveForwardedAllowedActions(
    order: ForwardedOrderRecord,
  ): DriverTaskAction[] {
    if (order.status === "broadcasted") {
      return ["accept", "reject"];
    }

    return [];
  }

  private resolveForwardedOutcomeFromStatus(
    status: ForwardedOrderRecord["status"],
  ): Exclude<ForwardedDriverActionOutcome, "rejected"> {
    switch (status) {
      case "accept_pending":
      case "confirmed_by_platform":
      case "completed_synced":
      case "lost_race":
      case "cancelled_by_platform":
      case "sync_failed":
        return status;
      case "broadcasted":
        return "accept_pending";
      case "received":
        return "sync_failed";
    }
  }

  private buildForwardedDriverActionResponse(
    action: Extract<DriverTaskAction, "accept" | "reject">,
    outcome: ForwardedDriverActionOutcome,
    order: ForwardedOrderRecord,
  ): ForwardedDriverActionResponse {
    return {
      action,
      outcome,
      driverMessage: this.resolveForwardedDriverActionMessage(outcome, order),
      taskView:
        outcome === "rejected" ? null : this.mapForwardedOrderToView(order),
      managementCorrelationIds: {
        mirrorOrderId: order.mirrorOrderId,
        reconciliationJobId:
          order.reconciliationJob?.reconciliationJobId ?? null,
      },
    };
  }

  private resolveForwardedDriverActionMessage(
    outcome: ForwardedDriverActionOutcome,
    order: ForwardedOrderRecord,
  ) {
    switch (outcome) {
      case "accept_pending":
        return "Waiting for platform confirmation.";
      case "confirmed_by_platform":
        return "Platform confirmed this order.";
      case "completed_synced":
        return "Platform marked this order completed.";
      case "lost_race":
        return "Another driver was confirmed by the platform.";
      case "cancelled_by_platform":
        return "The external platform cancelled this order.";
      case "sync_failed":
        return (
          order.manualFallback.reason ??
          "Dispatch is verifying the platform result before more driver actions."
        );
      case "rejected":
        return "Offer declined.";
    }
  }

  private resolveForwardedSyncIssueSummary(order: ForwardedOrderRecord) {
    if (order.manualFallback.required) {
      return order.manualFallback.reason ?? "Dispatch follow-up is required.";
    }
    if (order.lastSyncError) {
      return order.lastSyncError.retryable
        ? "Platform sync failed and is waiting for dispatch follow-up."
        : "Platform sync failed and requires manual dispatch resolution.";
    }
    if (order.reconciliationJob?.status === "queued") {
      return "Order is waiting for reconciliation with the platform.";
    }
    return null;
  }

  private resolveForwardedBlockingReason(order: ForwardedOrderRecord) {
    if (order.manualFallback.required) {
      return order.manualFallback.reason ?? "Manual fallback has been engaged.";
    }
    if (order.status === "lost_race") {
      return "Another driver was confirmed by the platform.";
    }
    if (order.status === "cancelled_by_platform") {
      return "The external platform cancelled this order.";
    }
    if (order.status === "sync_failed") {
      return "Dispatch must verify platform confirmation before continuing.";
    }
    return null;
  }

  private resolveForwardedRequiresReauth(order: ForwardedOrderRecord) {
    const authSignals = [
      order.lastSyncError?.code,
      order.lastSyncError?.message,
      order.manualFallback.reason,
      typeof order.authoritativeSnapshot.authStatus === "string"
        ? order.authoritativeSnapshot.authStatus
        : null,
    ]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.toLowerCase());

    return authSignals.some(
      (value) =>
        value.includes("reauth") ||
        value.includes("auth") ||
        value.includes("token expired"),
    );
  }

  private resolvePlatformDisplayName(platformCode: PlatformCode) {
    return PLATFORM_CODE_REGISTRY[platformCode]?.displayName ?? platformCode;
  }

  private extractForwardedOperatorContext(order: ForwardedOrderRecord): {
    requestingOperatorId: string | null;
    operatingAuthorizationId: string | null;
    hasOperatorContext: boolean;
  } {
    const requestingOperatorId = this.extractForwardedSummary(order, [
      "requestingOperatorId",
      "operatorId",
      "operator.operatorId",
    ]);
    const operatingAuthorizationId = this.extractForwardedSummary(order, [
      "operatingAuthorizationId",
      "authorizationId",
      "operatingAuthorization.authorizationId",
    ]);
    return {
      requestingOperatorId,
      operatingAuthorizationId,
      hasOperatorContext: Boolean(
        requestingOperatorId || operatingAuthorizationId,
      ),
    };
  }

  private extractForwardedSummary(
    order: ForwardedOrderRecord,
    keys: readonly string[],
  ) {
    for (const key of keys) {
      const value =
        this.readStringPath(order.authoritativeSnapshot, key) ??
        this.readStringPath(order.payload, key);
      if (value) {
        return value;
      }
    }
    return null;
  }

  private readStringPath(
    source: Record<string, unknown>,
    path: string,
  ): string | null {
    const parts = path.split(".");
    let cursor: unknown = source;

    for (const part of parts) {
      if (!cursor || typeof cursor !== "object" || !(part in cursor)) {
        return null;
      }
      cursor = (cursor as Record<string, unknown>)[part];
    }

    return typeof cursor === "string" && cursor.trim() ? cursor : null;
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

  /**
   * Awaits the repository's durable ACK (a confirmed DB round-trip, or an
   * immediate no-op in noDB mode) instead of firing persistence and moving on.
   * Rethrows after logging so lifecycle callers can tell an unconfirmed write
   * apart from a confirmed one and react honestly instead of publishing a
   * success audit/HTTP response for a change that never durably landed.
   */
  private async persistChanges(
    changes: PersistForwarderChanges,
    context: string,
  ): Promise<void> {
    if (!this.forwarderRepository) {
      return;
    }

    try {
      await this.forwarderRepository.persistChanges(changes);
    } catch (error) {
      this.forwarderRepository.reportPersistenceFailure(error, context);
      throw error;
    }
  }

  /**
   * Durable-ACK gate for the forwarded mirror command lifecycle: awaits the
   * canonical write for `draft` (a clone, not yet visible to any reader) and
   * only commits it into the live cache once that write actually lands —
   * readers (list/getOrder/driver task views) must never observe a draft
   * ahead of its ACK. If the write does not land, records the honest
   * degraded state (reusing the existing sync_failed/manual-fallback/
   * reconciliation vocabulary rather than inventing a new provider receipt)
   * and throws so the caller never publishes cache/audit/HTTP success for an
   * unconfirmed write. Retrying the same command re-targets the same
   * mirrorOrderId, so platformCode/externalOrderId/mirror identity and
   * snapshots survive. Must always be called from within `withLock` for
   * this order.
   *
   * `draft` may have been cloned from a canonical record whose
   * `lastSyncError` still carries a stale `mirrorWriteAckUncertain: true`
   * marker from an earlier, unrelated write that failed to durably commit
   * (see `isMirrorWriteAckUncertain`). This method builds the durable
   * `forwardedOrders` row from `draft` itself (callers must not pre-clone it
   * into `extraChanges`) specifically so that marker can be cleared here,
   * before the write happens, whenever it is stale: a write that is about to
   * durably land for `draft` right now makes any earlier "was this write
   * ACKed" uncertainty about that same cached content moot, and persisting
   * the marker unchanged would durably assert that this very write — the one
   * currently succeeding — was never ACKed. Leaving that until after
   * `persistChanges` resolves would be too late, since the row already
   * written to canonical storage (and reloaded verbatim on restart) would
   * still carry the stale marker.
   */
  private async persistOrFail(
    draft: ForwardedOrderRecord,
    extraChanges: Omit<PersistForwarderChanges, "forwardedOrders">,
    context: string,
    requestId?: string,
    acceptedDriverId?: string,
  ): Promise<ForwardedOrderRecord> {
    this.clearStaleMirrorWriteAckUncertainty(draft);
    const changes: PersistForwarderChanges = {
      ...extraChanges,
      forwardedOrders: [this.cloneOrder(draft)],
    };
    try {
      await this.persistChanges(changes, context);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const { persisted } = await this.markSyncFailed(
        draft,
        {
          errorCode: "FORWARDER_PERSISTENCE_ACK_UNCERTAIN",
          errorMessage: `Durable persistence ACK was not received for ${context}: ${detail}`,
          retryable: true,
          manualFallbackReason:
            "Local mirror write was not durably confirmed; verify canonical state via readback/reconciliation before retrying.",
        },
        requestId,
        acceptedDriverId,
      );
      throw new ApiRequestError(
        HttpStatus.BAD_GATEWAY,
        "FORWARDER_PERSISTENCE_ACK_UNCERTAIN",
        "Forwarded order mirror write was not durably acknowledged; manual readback/reconciliation is required before treating this as complete.",
        {
          orderId: draft.mirrorOrderId,
          context,
          persisted,
        },
        true,
      );
    }

    this.commitOrder(draft);
    return draft;
  }

  /**
   * `markSyncFailed` always commits its draft into the in-memory cache even
   * when the write recording that degraded state itself was not durably
   * ACKed (see its own doc comment) — the cache has to say *something*, and
   * silently keeping the pre-failure state would be worse. That means a
   * cache status of "sync_failed" alone is not proof the write landed; a
   * caller that is about to report success off the back of that status must
   * also check whether the specific failure it caught carries an explicit
   * `persisted: false` marker (attached by `relayDriverAccept`'s failure
   * branches) before treating it as confirmed.
   */
  private isPersistenceUncertainError(error: unknown): boolean {
    if (!(error instanceof ApiRequestError)) {
      return false;
    }
    const response = error.getResponse();
    if (!response || typeof response !== "object") {
      return false;
    }
    const details = (response as { error?: { details?: Record<string, unknown> } })
      .error?.details;
    return details?.persisted === false;
  }

  /**
   * Whether `order`'s cached `lastSyncError` reflects a write that itself
   * was never durably ACKed. This is deliberately *not* `lastSyncError?.code
   * === "FORWARDER_PERSISTENCE_ACK_UNCERTAIN"`: `persistOrFail`'s fallback
   * always records that same code as the *cause* it is falling back to
   * sync_failed for, even when that fallback write goes on to land
   * successfully. Reusing the code for both meanings would make an already
   * durably-confirmed sync_failed order look permanently uncertain on every
   * later read. The explicit `mirrorWriteAckUncertain` payload marker (set
   * only inside `markSyncFailed`'s own failure branch) tracks just the
   * write's own outcome, independent of why it was attempted.
   */
  private isMirrorWriteAckUncertain(order: ForwardedOrderRecord): boolean {
    return order.lastSyncError?.payload?.mirrorWriteAckUncertain === true;
  }

  /**
   * Clears a stale `mirrorWriteAckUncertain` marker (see
   * `isMirrorWriteAckUncertain`) on `draft` in place, if present. Only
   * `markSyncFailed`'s own failure branch may set this marker back to `true`
   * for its own write; every other command that carries a cloned
   * `lastSyncError` forward (e.g. `engageManualFallback`, which does not
   * otherwise touch `lastSyncError`) must not durably re-assert an old
   * write's uncertainty once a *different*, later write for this same draft
   * is itself about to be durably ACKed.
   */
  private clearStaleMirrorWriteAckUncertainty(draft: ForwardedOrderRecord) {
    if (draft.lastSyncError?.payload?.mirrorWriteAckUncertain === true) {
      draft.lastSyncError = {
        ...draft.lastSyncError,
        payload: {
          ...draft.lastSyncError.payload,
          mirrorWriteAckUncertain: false,
        },
      };
    }
  }

  /**
   * Per-identity mutation mutex (see `orderLocks`). Standard promise-chain
   * mutex: each waiter's gate resolves only when the previous holder's `fn`
   * has fully finished (including its own commit), so at most one critical
   * section per identity runs at a time, and a later-queued caller always
   * observes whatever the earlier one committed.
   */
  private async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.orderLocks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.orderLocks.set(
      key,
      previous.then(() => gate),
    );
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  /**
   * Publishes `order` as canonical: replaces its live array entry (or
   * inserts it, for a brand-new mirror) so subsequent reads observe it. Only
   * ever called after a durable ACK (or, for the terminal best-effort
   * sync_failed recording, after that write has been attempted) — never
   * before, per the cache/HTTP read publication gate.
   */
  private commitOrder(order: ForwardedOrderRecord) {
    const index = this.forwardedOrders.findIndex(
      (candidate) => candidate.mirrorOrderId === order.mirrorOrderId,
    );
    if (index === -1) {
      this.forwardedOrders = [order, ...this.forwardedOrders];
      return;
    }
    const next = [...this.forwardedOrders];
    next[index] = order;
    this.forwardedOrders = next;
  }
}
