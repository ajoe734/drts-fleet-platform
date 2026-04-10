export type OrderDomain = "owned" | "forwarded";

export type ServiceBucket = "standard_taxi" | "business_dispatch" | "av_pilot";

export type DispatchSemantics =
  | "realtime"
  | "reservation"
  | "queue"
  | "forwarder_broadcast";

export type BusinessDispatchSubtype =
  | "credit_card_airport_transfer"
  | "enterprise_dispatch";

export interface ApiSuccessEnvelope<T> {
  data: T;
  meta: {
    requestId: string;
    timestamp: string;
  };
}

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    retryable: boolean;
    traceId: string;
  };
}

export interface DomainEventEnvelope<T = Record<string, unknown>> {
  eventId: string;
  eventType: string;
  eventVersion: number;
  occurredAt: string;
  producer: string;
  tenantId: string | null;
  correlationId: string;
  causationId: string;
  subjectId: string;
  data: T;
}
