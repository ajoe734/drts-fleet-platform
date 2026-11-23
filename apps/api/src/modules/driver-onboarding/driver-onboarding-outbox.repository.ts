import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type {
  DriverOnboardingDeliverySummary,
  DriverOnboardingStatus,
} from "@drts/contracts";
import type { PoolClient } from "pg";
import { DatabaseService } from "../../common/db";

export type DriverOnboardingChannel =
  DriverOnboardingDeliverySummary["channel"];

export interface DriverOnboardingDeliveryClaim {
  delivery_id: string;
  invitation_id: string;
  lease_id: string;
  channel: DriverOnboardingChannel;
  attempt_count: number;
  encrypted_payload: string;
}

interface PendingDelivery {
  deliveryId: string;
  submissionId: string;
  invitationId: string | null;
  channel: DriverOnboardingChannel;
  maskedRecipient: string | null;
  reasonCode: string | null;
  encryptedPayload: string | null;
  expiresAt: string | null;
}

@Injectable()
export class DriverOnboardingOutboxRepository {
  constructor(private readonly database: DatabaseService) {}

  isEnabled(): boolean {
    return this.database.isEnabled();
  }

  async enqueue(
    executor: PoolClient,
    delivery: PendingDelivery,
  ): Promise<void> {
    await executor.query(
      `
        INSERT INTO fleet.driver_onboarding_deliveries
          (delivery_id, submission_id, invitation_id, channel, status,
           masked_recipient, reason_code, encrypted_payload, expires_at, next_attempt_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
                CASE WHEN $8::text IS NOT NULL THEN now() END)
      `,
      [
        delivery.deliveryId,
        delivery.submissionId,
        delivery.invitationId,
        delivery.channel,
        delivery.encryptedPayload ? "queued" : "skipped",
        delivery.maskedRecipient,
        delivery.reasonCode,
        delivery.encryptedPayload,
        delivery.expiresAt,
      ],
    );
  }

  async getSummary(
    submissionId: string,
  ): Promise<DriverOnboardingDeliverySummary[]> {
    return this.database.withTransaction(async (client) => {
      const result = await client.query<DriverOnboardingDeliverySummary>(
        `
          SELECT channel, status, masked_recipient AS "maskedRecipient",
                 reason_code AS "reasonCode"
          FROM fleet.driver_onboarding_deliveries
          WHERE submission_id = $1
          ORDER BY channel
        `,
        [submissionId],
      );
      return result.rows;
    });
  }

  async claimDue(): Promise<DriverOnboardingDeliveryClaim[]> {
    return this.database.withTransaction(async (client) => {
      // A lost lease may mean the provider accepted the message before we
      // could persist its reply. Retain that outcome and never send it again.
      await client.query(
        `
          UPDATE fleet.driver_onboarding_deliveries
          SET status = 'uncertain', reason_code = 'acknowledgement_unknown',
              encrypted_payload = NULL, lease_id = NULL, lease_expires_at = NULL,
              updated_at = now()
          WHERE status = 'sending' AND lease_expires_at <= now()
        `,
      );
      await client.query(
        `
          UPDATE fleet.driver_onboarding_deliveries
          SET status = 'expired', reason_code = 'invitation_expired',
              encrypted_payload = NULL, next_attempt_at = NULL, updated_at = now()
          WHERE status = 'queued' AND expires_at <= now()
        `,
      );
      const result = await client.query<DriverOnboardingDeliveryClaim>(
        `
          WITH due AS (
            SELECT delivery_id
            FROM fleet.driver_onboarding_deliveries
            WHERE status = 'queued' AND next_attempt_at <= now() AND expires_at > now()
            ORDER BY next_attempt_at, delivery_id
            LIMIT 10
            FOR UPDATE SKIP LOCKED
          )
          UPDATE fleet.driver_onboarding_deliveries AS delivery
          SET status = 'sending', lease_id = $1, lease_expires_at = now() + interval '2 minutes',
              attempt_count = attempt_count + 1, next_attempt_at = NULL, updated_at = now()
          FROM due
          WHERE delivery.delivery_id = due.delivery_id
          RETURNING delivery.delivery_id, invitation_id, lease_id, channel,
                    attempt_count, encrypted_payload
        `,
        [randomUUID()],
      );
      return result.rows;
    });
  }

  async finish(
    claim: DriverOnboardingDeliveryClaim,
    status: Exclude<DriverOnboardingStatus, "sending">,
    reasonCode: string | null,
    retryDelaySeconds: number | null = null,
  ): Promise<boolean> {
    return this.database.withTransaction(async (client) => {
      const result = await client.query(
        `
          UPDATE fleet.driver_onboarding_deliveries
          SET status = $3, reason_code = $4,
              encrypted_payload = CASE WHEN $3 = 'queued' THEN encrypted_payload END,
              next_attempt_at = CASE WHEN $3 = 'queued'
                                THEN now() + $5::integer * interval '1 second' END,
              lease_id = NULL, lease_expires_at = NULL, updated_at = now()
          WHERE delivery_id = $1 AND status = 'sending' AND lease_id = $2
            AND lease_expires_at > now()
        `,
        [
          claim.delivery_id,
          claim.lease_id,
          status,
          reasonCode,
          retryDelaySeconds,
        ],
      );
      return result.rowCount === 1;
    });
  }
}
