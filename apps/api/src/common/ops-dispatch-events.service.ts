import { randomUUID } from "node:crypto";

import { Injectable, type MessageEvent } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import type {
  DispatchJobRecord,
  DriverLocationSnapshot,
  OpsDispatchStreamEventEnvelope,
  OpsDispatchStreamEventType,
  OwnedOrderRecord,
} from "@drts/contracts";
import { fromEvent, map, type Observable } from "rxjs";

const OPS_DISPATCH_EVENT_CHANNEL = "ops.dispatch";
const OPS_DISPATCH_EVENT_RETRY_MS = 10_000;

@Injectable()
export class OpsDispatchEventsService {
  constructor(private readonly eventEmitter: EventEmitter2) {}

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

  publishOrderCreated(order: OwnedOrderRecord, requestId?: string) {
    this.publish("order_created", order.orderId, requestId, {
      order: this.cloneOrder(order),
    });
  }

  publishDispatchJobUpdated(
    orderId: string,
    dispatchJob: DispatchJobRecord,
    requestId?: string,
  ) {
    this.publish(
      "dispatch_job_updated",
      dispatchJob.dispatchJobId,
      requestId,
      {
        orderId,
        dispatchJob: { ...dispatchJob },
      },
      orderId,
    );
  }

  publishDriverLocationUpdated(
    location: DriverLocationSnapshot,
    requestId?: string,
  ) {
    this.publish(
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
    );
  }

  private publish(
    eventType: OpsDispatchStreamEventType,
    subjectId: string,
    requestId: string | undefined,
    data: OpsDispatchStreamEventEnvelope["data"],
    tenantId: string | null = null,
  ) {
    const envelope: OpsDispatchStreamEventEnvelope = {
      eventId: randomUUID(),
      eventType,
      eventVersion: 1,
      occurredAt: new Date().toISOString(),
      producer: "apps/api/ops-dispatch",
      tenantId,
      correlationId: requestId ?? randomUUID(),
      causationId: requestId ?? subjectId,
      subjectId,
      data,
    };

    this.eventEmitter.emit(OPS_DISPATCH_EVENT_CHANNEL, envelope);
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
      proofRequirements: { ...order.proofRequirements },
      complianceFlags: [...order.complianceFlags],
    };
  }
}
