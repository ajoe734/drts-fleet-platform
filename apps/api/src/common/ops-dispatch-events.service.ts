import { randomUUID } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";

import {
  Injectable,
  Logger,
  type MessageEvent,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import type {
  DispatchJobRecord,
  DriverLocationSnapshot,
  IncidentRecord,
  OpsDispatchStreamEventEnvelope,
  OpsDispatchStreamEventType,
  OwnedOrderRecord,
  VehicleRegistryRecord,
} from "@drts/contracts";
import type { Notification, PoolClient } from "pg";
import { fromEvent, map, type Observable } from "rxjs";

import { DatabaseService } from "./db/database.service";
import { generateDeterministicUuid } from "./durable-identity";

const OPS_DISPATCH_EVENT_CHANNEL = "ops.dispatch";
const OPS_DISPATCH_EVENT_NOTIFICATION_CHANNEL = "ops_dispatch_events";
const OPS_DISPATCH_EVENT_RETRY_MS = 10_000;
const OPS_DISPATCH_EVENT_RECONNECT_MS = 5_000;
const OPS_DISPATCH_EVENT_PAYLOAD_PREFIX = "gzip:";

@Injectable()
export class OpsDispatchEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OpsDispatchEventsService.name);
  private notificationClient: PoolClient | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  constructor(
    private readonly eventEmitter: EventEmitter2,
    @Optional() private readonly databaseService?: DatabaseService,
  ) {}

  async onModuleInit() {
    await this.ensureExternalBridge();
  }

  async onModuleDestroy() {
    this.destroyed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    if (this.notificationClient) {
      this.notificationClient.release();
    }
  }

  private async ensureExternalBridge() {
    if (this.destroyed || !this.databaseService?.isEnabled()) {
      return;
    }

    try {
      this.notificationClient = await this.databaseService.connect();
      this.notificationClient.on("notification", (msg: Notification) => {
        this.handleExternalNotification(msg);
      });
      this.notificationClient.on("error", (err: Error) => {
        this.logger.error("Postgres notification client error", err);
        this.scheduleReconnect();
      });

      await this.notificationClient.query(
        `LISTEN ${OPS_DISPATCH_EVENT_NOTIFICATION_CHANNEL}`,
      );
      this.logger.log(
        `Postgres LISTEN bridge active: ${OPS_DISPATCH_EVENT_NOTIFICATION_CHANNEL}`,
      );
    } catch (error) {
      this.logger.error("Failed to connect Postgres LISTEN bridge", error);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.destroyed || this.reconnectTimer) {
      return;
    }

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (this.notificationClient) {
        this.notificationClient.release();
        this.notificationClient = null;
      }
      await this.ensureExternalBridge();
    }, OPS_DISPATCH_EVENT_RECONNECT_MS);
  }

  private handleExternalNotification(msg: Notification) {
    if (
      msg.channel !== OPS_DISPATCH_EVENT_NOTIFICATION_CHANNEL ||
      !msg.payload
    ) {
      return;
    }

    try {
      let rawPayload = msg.payload;
      if (rawPayload.startsWith(OPS_DISPATCH_EVENT_PAYLOAD_PREFIX)) {
        const compressed = Buffer.from(
          rawPayload.slice(OPS_DISPATCH_EVENT_PAYLOAD_PREFIX.length),
          "base64",
        );
        rawPayload = gunzipSync(compressed).toString("utf-8");
      }

      const envelope = JSON.parse(
        rawPayload,
      ) as OpsDispatchStreamEventEnvelope & {
        publishedAt?: string;
      };

      // SLA Measurement: Delivery Lag
      if (envelope.publishedAt) {
        const deliveryLagMs = Date.now() - Date.parse(envelope.publishedAt);
        this.logger.debug(
          `Event delivery lag: ${deliveryLagMs}ms for ${envelope.eventType} (${envelope.eventId})`,
        );
      }

      this.eventEmitter.emit(OPS_DISPATCH_EVENT_CHANNEL, envelope);
    } catch (error) {
      this.logger.error("Failed to parse external notification payload", error);
    }
  }

  streamEvents(): Observable<MessageEvent> {
    return fromEvent<OpsDispatchStreamEventEnvelope>(
      this.eventEmitter,
      OPS_DISPATCH_EVENT_CHANNEL,
    ).pipe(
      map((event) => ({
        type: event.eventType,
        data: event,
        retry: OPS_DISPATCH_EVENT_RETRY_MS,
      })),
    );
  }

  async publishOrderCreated(
    order: OwnedOrderRecord,
    requestId?: string,
    options?: { eventId?: string; correlationId?: string },
  ) {
    await this.publish(
      "order_created",
      order.orderId,
      requestId,
      {
        order: this.cloneOrder(order),
      },
      order.tenantId,
      options?.eventId,
      options?.correlationId,
    );
  }

  async publishOrderUpdated(
    order: OwnedOrderRecord,
    requestId?: string,
    options?: { eventId?: string; correlationId?: string },
  ) {
    await this.publish(
      "order_updated",
      order.orderId,
      requestId,
      {
        order: this.cloneOrder(order),
      },
      order.tenantId,
      options?.eventId,
      options?.correlationId,
    );
  }

  async publishDispatchJobUpdated(
    orderId: string,
    dispatchJob: DispatchJobRecord,
    requestId?: string,
    options?: { eventId?: string; correlationId?: string },
  ) {
    await this.publish(
      "dispatch_job_updated",
      dispatchJob.dispatchJobId,
      requestId,
      {
        orderId,
        dispatchJob: { ...dispatchJob },
      },
      orderId,
      options?.eventId,
      options?.correlationId,
    );
  }

  async publishDriverLocationUpdated(
    location: DriverLocationSnapshot,
    requestId?: string,
    options?: { eventId?: string; correlationId?: string },
  ) {
    await this.publish(
      "driver_location_updated",
      location.driverId,
      requestId,
      {
        driverId: location.driverId,
        lat: location.lat,
        lng: location.lng,
        recordedAt: location.recordedAt,
      },
      null,
      options?.eventId,
      options?.correlationId,
    );
  }

  async publishSupplyLifecycleUpdated(
    vehicle: VehicleRegistryRecord,
    requestId?: string,
    options?: { eventId?: string; correlationId?: string },
  ) {
    await this.publish(
      "supply_lifecycle_updated",
      vehicle.vehicleId,
      requestId,
      {
        vehicleId: vehicle.vehicleId,
        dispatchableFlag: vehicle.dispatchableFlag,
        blockedReasons: [...vehicle.supplyLifecycle.dispatch.blockedReasons],
        lifecycle: this.cloneVehicle(vehicle).supplyLifecycle,
      },
      null,
      options?.eventId,
      options?.correlationId,
    );
  }

  async publishIncidentCreated(
    incident: IncidentRecord,
    requestId?: string,
    options?: { eventId?: string; correlationId?: string },
  ) {
    await this.publish(
      "incident_created",
      incident.incidentId,
      requestId,
      {
        incident: this.cloneIncident(incident),
      },
      null,
      options?.eventId,
      options?.correlationId,
    );
  }

  async publishIncidentUpdated(
    incident: IncidentRecord,
    requestId?: string,
    options?: { eventId?: string; correlationId?: string },
  ) {
    await this.publish(
      "incident_updated",
      incident.incidentId,
      requestId,
      {
        incident: this.cloneIncident(incident),
      },
      null,
      options?.eventId,
      options?.correlationId,
    );
  }

  private cloneIncident(incident: IncidentRecord): IncidentRecord {
    return {
      ...incident,
      serviceRecoveryActions: incident.serviceRecoveryActions.map((action) => ({
        ...action,
      })),
      matchingSuppression: incident.matchingSuppression
        ? { ...incident.matchingSuppression }
        : null,
      ...(incident.availableActions
        ? {
            availableActions: incident.availableActions.map((action) => ({
              ...action,
            })),
          }
        : {}),
    };
  }

  private async publish(
    eventType: OpsDispatchStreamEventType,
    subjectId: string,
    requestId: string | undefined,
    data: OpsDispatchStreamEventEnvelope["data"],
    tenantId: string | null = null,
    eventIdOverride?: string,
    correlationIdOverride?: string,
  ) {
    const occurredAt = new Date().toISOString();
    const publishedAt = new Date().toISOString();
    const eventId =
      eventIdOverride ??
      generateDeterministicUuid(
        "ops_dispatch_event",
        `${eventType}:${subjectId}:${tenantId ?? ""}:${requestId ?? ""}`,
      );

    const envelope: OpsDispatchStreamEventEnvelope & { publishedAt: string } = {
      eventId,
      eventType,
      eventVersion: 1,
      occurredAt,
      publishedAt,
      producer: "apps/api/ops-dispatch",
      tenantId,
      correlationId: correlationIdOverride ?? requestId ?? randomUUID(),
      causationId: requestId ?? subjectId,
      subjectId,
      data,
    };

    // SLA Measurement: Publication Lag
    const publicationLagMs = Date.now() - Date.parse(occurredAt);
    this.logger.debug(
      `Event publication lag: ${publicationLagMs}ms for ${eventType} (${envelope.eventId})`,
    );

    if (this.databaseService?.isEnabled()) {
      let payload = JSON.stringify(envelope);
      if (payload.length > 7500) {
        const compressed = gzipSync(Buffer.from(payload, "utf-8")).toString(
          "base64",
        );
        payload = `${OPS_DISPATCH_EVENT_PAYLOAD_PREFIX}${compressed}`;
      }

      if (payload.length > 7500) {
        throw new Error(
          `Payload too large for Postgres NOTIFY even after Gzip (${payload.length} bytes) for ${envelope.eventId}`,
        );
      }

      try {
        await this.databaseService.query(
          `SELECT pg_notify('${OPS_DISPATCH_EVENT_NOTIFICATION_CHANNEL}', $1)`,
          [payload],
        );
      } catch (err) {
        this.logger.error(
          `Postgres NOTIFY failed for ${envelope.eventId}`,
          err,
        );
        throw err;
      }
    } else {
      this.eventEmitter.emit(OPS_DISPATCH_EVENT_CHANNEL, envelope);
    }
  }

  private cloneOrder(order: OwnedOrderRecord): OwnedOrderRecord {
    return {
      ...order,
      pickup: { ...order.pickup },
      dropoff: { ...order.dropoff },
      passenger: { ...order.passenger },
      etaSnapshot: order.etaSnapshot ? { ...order.etaSnapshot } : null,
      bookedBy: order.bookedBy ? { ...order.bookedBy } : null,
      onsiteContact: order.onsiteContact ? { ...order.onsiteContact } : null,
      quotedFare: order.quotedFare ? { ...order.quotedFare } : null,
      manualFareOverride: order.manualFareOverride
        ? { ...order.manualFareOverride }
        : null,
      exceptionHold: order.exceptionHold
        ? {
            ...order.exceptionHold,
            criteria: { ...order.exceptionHold.criteria },
            overrideActors: [...order.exceptionHold.overrideActors],
            resolution: order.exceptionHold.resolution
              ? {
                  ...order.exceptionHold.resolution,
                  downstreamReviewerLabels: [
                    ...order.exceptionHold.resolution.downstreamReviewerLabels,
                  ],
                  downstreamStages: [
                    ...order.exceptionHold.resolution.downstreamStages,
                  ],
                }
              : null,
          }
        : null,
      proofRequirements: { ...order.proofRequirements },
      complianceFlags: [...order.complianceFlags],
    };
  }

  private cloneVehicle(vehicle: VehicleRegistryRecord): VehicleRegistryRecord {
    return {
      ...vehicle,
      supportedServiceBuckets: [...vehicle.supportedServiceBuckets],
      supplyLifecycle: {
        contract: { ...vehicle.supplyLifecycle.contract },
        insurance: { ...vehicle.supplyLifecycle.insurance },
        exclusivity: { ...vehicle.supplyLifecycle.exclusivity },
        dispatch: {
          ...vehicle.supplyLifecycle.dispatch,
          blockedReasons: [...vehicle.supplyLifecycle.dispatch.blockedReasons],
        },
        offboarding: { ...vehicle.supplyLifecycle.offboarding },
        lastTrace: vehicle.supplyLifecycle.lastTrace
          ? { ...vehicle.supplyLifecycle.lastTrace }
          : null,
      },
    };
  }
}
