import { randomUUID } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";

import {
  Injectable,
  Logger,
  MessageEvent,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import type {
  DriverTaskRecord,
  DriverTaskStreamEventEnvelope,
  DriverTaskStreamEventType,
  OwnedOrderRecord,
} from "@drts/contracts";
import type { Notification, PoolClient } from "pg";
import { Observable, filter, fromEvent, map } from "rxjs";

import { DatabaseService } from "../../common/db";

const DRIVER_TASK_EVENT_CHANNEL = "owned-mobility.driver-task";
const DRIVER_TASK_EVENT_NOTIFICATION_CHANNEL =
  "owned_mobility_driver_task_events";
const DRIVER_TASK_EVENT_RETRY_MS = 10_000;
const DRIVER_TASK_EVENT_RECONNECT_MS = 5_000;
const DRIVER_TASK_EVENT_PAYLOAD_PREFIX = "gzip:";

@Injectable()
export class OwnedMobilityTaskEventsService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(OwnedMobilityTaskEventsService.name);
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
        `LISTEN ${DRIVER_TASK_EVENT_NOTIFICATION_CHANNEL}`,
      );
      this.logger.log(
        `Postgres LISTEN bridge active: ${DRIVER_TASK_EVENT_NOTIFICATION_CHANNEL}`,
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
    }, DRIVER_TASK_EVENT_RECONNECT_MS);
  }

  private handleExternalNotification(msg: Notification) {
    if (
      msg.channel !== DRIVER_TASK_EVENT_NOTIFICATION_CHANNEL ||
      !msg.payload
    ) {
      return;
    }

    try {
      let rawPayload = msg.payload;
      if (rawPayload.startsWith(DRIVER_TASK_EVENT_PAYLOAD_PREFIX)) {
        const compressed = Buffer.from(
          rawPayload.slice(DRIVER_TASK_EVENT_PAYLOAD_PREFIX.length),
          "base64",
        );
        rawPayload = gunzipSync(compressed).toString("utf-8");
      }

      const envelope = JSON.parse(
        rawPayload,
      ) as DriverTaskStreamEventEnvelope & {
        publishedAt?: string;
      };

      // SLA Measurement: Delivery Lag
      if (envelope.publishedAt) {
        const deliveryLagMs = Date.now() - Date.parse(envelope.publishedAt);
        this.logger.debug(
          `Event delivery lag: ${deliveryLagMs}ms for ${envelope.eventType} (${envelope.eventId})`,
        );
      }

      this.eventEmitter.emit(DRIVER_TASK_EVENT_CHANNEL, envelope);
    } catch (error) {
      this.logger.error("Failed to parse external notification payload", error);
    }
  }

  streamDriverTaskEvents(driverId: string): Observable<MessageEvent> {
    return fromEvent<DriverTaskStreamEventEnvelope>(
      this.eventEmitter,
      DRIVER_TASK_EVENT_CHANNEL,
    ).pipe(
      filter((event) => event.data.task.driverId === driverId),
      map((event) => ({
        type: event.eventType,
        data: event,
        retry: DRIVER_TASK_EVENT_RETRY_MS,
      })),
    );
  }

  publishTaskAssigned(
    task: DriverTaskRecord,
    order: OwnedOrderRecord,
    requestId?: string,
  ) {
    this.publish("task_assigned", task, order, requestId);
  }

  publishTaskUpdated(
    task: DriverTaskRecord,
    order: OwnedOrderRecord,
    requestId?: string,
  ) {
    this.publish("task_updated", task, order, requestId);
  }

  publishTaskCancelled(
    task: DriverTaskRecord,
    order: OwnedOrderRecord,
    requestId?: string,
  ) {
    this.publish("task_cancelled", task, order, requestId);
  }

  private publish(
    eventType: DriverTaskStreamEventType,
    task: DriverTaskRecord,
    order: OwnedOrderRecord,
    requestId?: string,
  ) {
    const occurredAt = new Date().toISOString();
    const publishedAt = new Date().toISOString();

    const envelope: DriverTaskStreamEventEnvelope & { publishedAt: string } = {
      eventId: randomUUID(),
      eventType,
      eventVersion: 1,
      occurredAt,
      publishedAt,
      producer: "apps/api/owned-mobility",
      tenantId: order.tenantId,
      correlationId: requestId ?? randomUUID(),
      causationId: requestId ?? task.taskId,
      subjectId: task.taskId,
      data: {
        task: this.cloneTask(task),
      },
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
        payload = `${DRIVER_TASK_EVENT_PAYLOAD_PREFIX}${compressed}`;
      }

      if (payload.length > 7500) {
        this.logger.warn(
          `Payload too large for Postgres NOTIFY even after Gzip (${payload.length} bytes), falling back to local-only for ${envelope.eventId}`,
        );
        this.eventEmitter.emit(DRIVER_TASK_EVENT_CHANNEL, envelope);
      } else {
        void this.databaseService
          .query(
            `SELECT pg_notify('${DRIVER_TASK_EVENT_NOTIFICATION_CHANNEL}', $1)`,
            [payload],
          )
          .catch((err) => {
            this.logger.error(
              `Postgres NOTIFY failed for ${envelope.eventId}`,
              err,
            );
            // Fallback to local
            this.eventEmitter.emit(DRIVER_TASK_EVENT_CHANNEL, envelope);
          });
      }
    } else {
      this.eventEmitter.emit(DRIVER_TASK_EVENT_CHANNEL, envelope);
    }
  }

  private cloneTask(task: DriverTaskRecord): DriverTaskRecord {
    return {
      ...task,
      waypoints: task.waypoints.map((waypoint) => ({ ...waypoint })),
      fare: task.fare ? { ...task.fare } : null,
      proof: task.proof
        ? {
            photos: [...task.proof.photos],
            signatureId: task.proof.signatureId ?? null,
            expenseItems: [...(task.proof.expenseItems ?? [])],
          }
        : null,
    };
  }
}
