import { randomUUID } from "node:crypto";

import { Injectable, MessageEvent } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import type {
  DriverTaskRecord,
  DriverTaskStreamEventEnvelope,
  DriverTaskStreamEventType,
  OwnedOrderRecord,
} from "@drts/contracts";
import { Observable, filter, fromEvent, map } from "rxjs";

const DRIVER_TASK_EVENT_CHANNEL = "owned-mobility.driver-task";
const DRIVER_TASK_EVENT_RETRY_MS = 10_000;

@Injectable()
export class OwnedMobilityTaskEventsService {
  constructor(private readonly eventEmitter: EventEmitter2) {}

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
    // Phase 2 runs as a single-instance in-memory stream; multi-instance fan-out
    // needs an external bus in the later Redis/pub-sub follow-up.
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

    this.eventEmitter.emit(DRIVER_TASK_EVENT_CHANNEL, envelope);
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
