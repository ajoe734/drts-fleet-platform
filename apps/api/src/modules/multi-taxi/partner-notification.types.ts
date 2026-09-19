import type {
  PartnerNotificationDeliveryContext,
  PartnerNotificationFailureReason,
  PartnerNotificationTypedFailure,
  PassengerPushDeliveryOutcome,
  WebhookRetryPolicyRecord,
} from "@drts/contracts";
import { PARTNER_NOTIFICATION_FAILURE_REASON_RETRY_DISPOSITIONS } from "@drts/contracts";

export type StoredPartnerNotificationContext =
  PartnerNotificationDeliveryContext & {
    retryPolicySnapshot: WebhookRetryPolicyRecord;
  };

export type PartnerDeliveryMetadata = Pick<
  PartnerNotificationDeliveryContext,
  | "deliveryTarget"
  | "deliveryStage"
  | "retryDisposition"
  | "failureReason"
  | "receiptId"
  | "downstreamStatus"
  | "expiresAt"
>;

export type PartnerPushOutcome = PassengerPushDeliveryOutcome &
  PartnerDeliveryMetadata;

export class PartnerNotificationFailure extends Error {
  constructor(
    readonly failure: PartnerNotificationTypedFailure,
    readonly deliveryContext: StoredPartnerNotificationContext | null = null,
  ) {
    super(failure.failureReason);
    this.name = "PartnerNotificationFailure";
  }
}

export function partnerFailure(
  failureReason: PartnerNotificationFailureReason,
  deliveryContext: StoredPartnerNotificationContext | null = null,
): PartnerNotificationFailure {
  return new PartnerNotificationFailure(
    {
      failureReason,
      retryDisposition:
        PARTNER_NOTIFICATION_FAILURE_REASON_RETRY_DISPOSITIONS[failureReason],
      suggestedNextAttemptAt: null,
    },
    deliveryContext,
  );
}
