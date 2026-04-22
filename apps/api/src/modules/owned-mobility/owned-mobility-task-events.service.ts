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
const DRIVER_TASK_EVENT_MAX_PAYLOAD_BYTES = 7_900;

@Injectable()
export class OwnedMobilityTaskEventsService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(OwnedMobilityTaskEventsService.name);
  private notificationClient: PoolClient | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private bridgeConnecting = false;
  private destroyed = false;

  constructor(
    private readonly eventEmitter: EventEmitter2,
    @Optional() private readonly databaseService?: DatabaseService,
  ) {}

  async onModuleInit() {
    await this.ensureExternalBridge("module init");
  }

  async onModuleDestroy() {
    this.destroyed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    await this.teardownExternalBridge();
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
    const envelope: DriverTaskStreamEventEnvelope = {
      eventId: randomUUID(),
      eventType,
      eventVersion: 1,
      occurredAt: new Date().toISOString(),
      producer: "apps/api/owned-mobility",
      tenantId: order.tenantId,
      correlationId: requestId ?? randomUUID(),
      causationId: requestId ?? task.taskId,
      subjectId: task.taskId,
      data: {
        task: this.cloneTask(task),
      },
    };

    if (!this.hasExternalBus()) {
      this.emitEnvelope(envelope);
      return;
    }

    if (!this.isExternalBridgeActive()) {
      this.emitEnvelope(envelope);
    }

    void this.publishToExternalBus(envelope);
  }

  private hasExternalBus() {
    return this.databaseService?.isEnabled() ?? false;
  }

  private isExternalBridgeActive() {
    return this.notificationClient !== null;
  }

  private readonly handleDatabaseNotification = (message: Notification) => {
    if (
      message.channel !== DRIVER_TASK_EVENT_NOTIFICATION_CHANNEL ||
      !message.payload
    ) {
      return;
    }

    try {
      this.emitEnvelope(this.deserializeEnvelope(message.payload));
    } catch (error) {
      this.logger.warn(
        `Ignoring malformed driver-task notification payload: ${this.describeError(error)}`,
      );
    }
  };

  private readonly handleNotificationClientError = (error: Error) => {
    this.logger.warn(
      `Driver-task event bridge lost its Postgres listener: ${error.message}`,
    );
    void this.resetExternalBridge("listener error");
  };

  private readonly handleNotificationClientEnd = () => {
    this.logger.warn("Driver-task event bridge listener ended.");
    void this.resetExternalBridge("listener ended");
  };

  private async ensureExternalBridge(context: string) {
    if (
      !this.hasExternalBus() ||
      this.destroyed ||
      this.notificationClient ||
      this.bridgeConnecting
    ) {
      return;
    }

    this.bridgeConnecting = true;
    let client: PoolClient | null = null;

    try {
      client = await this.databaseService!.connect();
      client.on("notification", this.handleDatabaseNotification);
      client.on("error", this.handleNotificationClientError);
      client.on("end", this.handleNotificationClientEnd);
      await client.query(`LISTEN ${DRIVER_TASK_EVENT_NOTIFICATION_CHANNEL}`);
      this.notificationClient = client;
      this.logger.debug(
        `Driver-task event bridge subscribed to ${DRIVER_TASK_EVENT_NOTIFICATION_CHANNEL} during ${context}.`,
      );
    } catch (error) {
      if (client) {
        client.off("notification", this.handleDatabaseNotification);
        client.off("error", this.handleNotificationClientError);
        client.off("end", this.handleNotificationClientEnd);
        try {
          client.release();
        } catch {
          // ignore release failures on half-open listener setup
        }
      }
      this.logger.warn(
        `Driver-task event bridge could not subscribe during ${context}: ${this.describeError(error)}`,
      );
      this.scheduleReconnect(context);
    } finally {
      this.bridgeConnecting = false;
    }
  }

  private scheduleReconnect(context: string) {
    if (
      !this.hasExternalBus() ||
      this.destroyed ||
      this.reconnectTimer !== null
    ) {
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.ensureExternalBridge(`reconnect after ${context}`);
    }, DRIVER_TASK_EVENT_RECONNECT_MS);
  }

  private async resetExternalBridge(context: string) {
    await this.teardownExternalBridge();
    this.scheduleReconnect(context);
  }

  private async teardownExternalBridge() {
    const client = this.notificationClient;
    this.notificationClient = null;

    if (!client) {
      return;
    }

    client.off("notification", this.handleDatabaseNotification);
    client.off("error", this.handleNotificationClientError);
    client.off("end", this.handleNotificationClientEnd);
    try {
      await client.query(`UNLISTEN ${DRIVER_TASK_EVENT_NOTIFICATION_CHANNEL}`);
    } catch (error) {
      if (!this.destroyed) {
        this.logger.warn(
          `Driver-task event bridge could not unlisten cleanly: ${this.describeError(error)}`,
        );
      }
    }

    try {
      client.release();
    } catch {
      // ignore release failures on already-closed clients
    }
  }

  private async publishToExternalBus(envelope: DriverTaskStreamEventEnvelope) {
    try {
      await this.databaseService!.query("SELECT pg_notify($1, $2)", [
        DRIVER_TASK_EVENT_NOTIFICATION_CHANNEL,
        this.serializeEnvelope(envelope),
      ]);
    } catch (error) {
      this.logger.warn(
        `Driver-task event bridge publish failed; using local-only fallback: ${this.describeError(error)}`,
      );
      if (this.isExternalBridgeActive()) {
        this.emitEnvelope(envelope);
      }
      void this.ensureExternalBridge("publish fallback");
    }
  }

  private emitEnvelope(envelope: DriverTaskStreamEventEnvelope) {
    this.eventEmitter.emit(
      DRIVER_TASK_EVENT_CHANNEL,
      this.cloneEnvelope(envelope),
    );
  }

  private cloneEnvelope(
    envelope: DriverTaskStreamEventEnvelope,
  ): DriverTaskStreamEventEnvelope {
    return {
      ...envelope,
      data: {
        task: this.cloneTask(envelope.data.task),
      },
    };
  }

  private serializeEnvelope(envelope: DriverTaskStreamEventEnvelope) {
    const payload =
      DRIVER_TASK_EVENT_PAYLOAD_PREFIX +
      gzipSync(JSON.stringify(envelope)).toString("base64");
    const payloadSize = Buffer.byteLength(payload, "utf8");

    if (payloadSize > DRIVER_TASK_EVENT_MAX_PAYLOAD_BYTES) {
      throw new Error(
        `driver-task event payload is ${payloadSize} bytes after compression and exceeds the Postgres NOTIFY limit`,
      );
    }

    return payload;
  }

  private deserializeEnvelope(payload: string): DriverTaskStreamEventEnvelope {
    if (!payload.startsWith(DRIVER_TASK_EVENT_PAYLOAD_PREFIX)) {
      return JSON.parse(payload) as DriverTaskStreamEventEnvelope;
    }

    const decodedPayload = payload.slice(
      DRIVER_TASK_EVENT_PAYLOAD_PREFIX.length,
    );
    const json = gunzipSync(Buffer.from(decodedPayload, "base64")).toString(
      "utf8",
    );
    return JSON.parse(json) as DriverTaskStreamEventEnvelope;
  }

  private describeError(error: unknown) {
    return error instanceof Error ? error.message : String(error);
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
