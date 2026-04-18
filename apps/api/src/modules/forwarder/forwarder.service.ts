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
  ForwardedOrderRecord,
  IngestExternalOrderCommand,
  PlatformCode,
  RelayDriverAcceptCommand,
  SyncForwardedOrderStatusCommand,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
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
      createdAt: now,
      updatedAt: now,
    };

    this.forwardedOrders = [
      this.cloneOrder(forwardedOrder),
      ...this.forwardedOrders,
    ];
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

  relayDriverAccept(
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

    forwardedOrder.status = "accept_pending";
    forwardedOrder.acceptedDriverId = command.driverId;
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

    return {
      status: forwardedOrder.status,
      authoritativeSnapshot: { ...forwardedOrder.authoritativeSnapshot },
    };
  }

  listAdapterHealth() {
    return this.adapterHealth.map((adapter) => ({ ...adapter }));
  }

  hasAdapter(platformCode: PlatformCode) {
    return Boolean(this.findAdapter(platformCode));
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
    return {
      ...order,
      candidateDriverIds: [...order.candidateDriverIds],
      payload: { ...order.payload },
      authoritativeSnapshot: { ...order.authoritativeSnapshot },
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
