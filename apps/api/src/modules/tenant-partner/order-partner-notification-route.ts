import type {
  OrderPartnerNotificationRoute,
  OwnedOrderRecord,
} from "@drts/contracts";
import type { QueryResult, QueryResultRow } from "pg";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { resolvePassengerSubjectRef } from "../../common/sensitive-data-policy";
import type { PartnerUserIdentityLinkRepository } from "./partner-user-identity-link.repository";
import type { TenantPartnerService } from "./tenant-partner.service";

/** Shared trusted-source resolution; no body fields or recipient guessing. */
export async function resolveOrderPartnerNotificationRoute(
  order: OwnedOrderRecord,
  identity: BootstrapRequestIdentity | null | undefined,
  links?: PartnerUserIdentityLinkRepository,
  registry?: TenantPartnerService,
): Promise<OrderPartnerNotificationRoute | null> {
  const entrySlug = identity?.partnerEntrySlug?.trim();
  const drtsPassengerId = identity?.drtsPassengerId?.trim();
  if (!entrySlug || !drtsPassengerId || !links) return null;
  const link = await links
    .findByDrtsPassengerId(entrySlug, drtsPassengerId)
    .catch(() => null);
  if (!link || link.status !== "active") return null;
  let entry: { tenantId: string; partnerId: string } | null;
  try {
    entry = registry?.getPartnerEntry(entrySlug) ?? null;
  } catch {
    return null;
  }
  if (!entry) return null;
  return {
    orderId: order.orderId,
    tenantId: entry.tenantId,
    partnerId: entry.partnerId,
    entrySlug,
    partnerUserRef: link.partnerUserRef,
    drtsPassengerId: link.drtsPassengerId,
    passengerSubjectRef: resolvePassengerSubjectRef(order.passenger),
    identityLinkedAt: link.linkedAt,
    // Preserve the existing consent provenance until a versioned notice store exists.
    consentBundleVersion: link.consentScope,
    notificationPolicyVersion: "partner_notification_v1",
    rideRef: order.orderId,
    createdAt: new Date().toISOString(),
  };
}

export type PartnerRouteQueryExecutor = {
  query<T extends QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<T>>;
};

export type OrderPartnerNotificationRouteRow = QueryResultRow & {
  order_id: string;
  tenant_id: string;
  partner_id: string;
  entry_slug: string;
  partner_user_ref: string;
  drts_passenger_id: string;
  passenger_subject_ref: string;
  identity_linked_at: Date | string;
  consent_bundle_version: string;
  notification_policy_version: string;
  ride_ref: string;
  created_at: Date | string;
};

/** Caller owns the transaction. V0104 route + initial sequence are one unit.
 * Replays read the frozen route and never reset its event sequence.
 */
export async function persistOrderPartnerNotificationRoute(
  executor: PartnerRouteQueryExecutor,
  route: OrderPartnerNotificationRoute,
): Promise<OrderPartnerNotificationRoute | null> {
  // Serialize both channel writers on the same order lock used by
  // PassengerPushDevicesRepository.writeFirstPartyRoute. A row lock alone
  // cannot exclude concurrent first inserts into the two separate tables.
  await executor.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
    [`passenger-push-first-party-route:${route.orderId}`],
  );
  const firstPartyRoute = await executor.query(
    `SELECT order_id FROM mobility.phase1_order_first_party_notification_routes WHERE order_id = $1`,
    [route.orderId],
  );
  // Reject before either partner write, preserving the caller's transaction
  // and non-blocking notification setup contract (including booking savepoints).
  if (firstPartyRoute.rows[0]) return null;

  const insertResult = await executor.query<OrderPartnerNotificationRouteRow>(
    `
          INSERT INTO mobility.phase1_order_partner_notification_routes (
            order_id, tenant_id, partner_id, entry_slug, partner_user_ref,
            drts_passenger_id, passenger_subject_ref, identity_linked_at,
            consent_bundle_version, notification_policy_version, ride_ref,
            created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (order_id) DO NOTHING
          RETURNING order_id, tenant_id, partner_id, entry_slug,
            partner_user_ref, drts_passenger_id, passenger_subject_ref,
            identity_linked_at, consent_bundle_version,
            notification_policy_version, ride_ref, created_at
        `,
    [
      route.orderId,
      route.tenantId,
      route.partnerId,
      route.entrySlug,
      route.partnerUserRef,
      route.drtsPassengerId,
      route.passengerSubjectRef,
      route.identityLinkedAt,
      route.consentBundleVersion,
      route.notificationPolicyVersion,
      route.rideRef,
      route.createdAt,
    ],
  );

  let insertedRow = insertResult.rows[0];
  if (!insertedRow) {
    const existing = await executor.query<OrderPartnerNotificationRouteRow>(
      `
            SELECT order_id, tenant_id, partner_id, entry_slug,
              partner_user_ref, drts_passenger_id, passenger_subject_ref,
              identity_linked_at, consent_bundle_version,
              notification_policy_version, ride_ref, created_at
            FROM mobility.phase1_order_partner_notification_routes
            WHERE order_id = $1
          `,
      [route.orderId],
    );
    insertedRow = existing.rows[0];
  } else {
    await executor.query(
      `
            INSERT INTO mobility.phase1_partner_notification_sequences (
              order_id, next_sequence
            ) VALUES ($1, 1)
            ON CONFLICT (order_id) DO NOTHING
          `,
      [route.orderId],
    );
  }

  return insertedRow ? mapOrderPartnerNotificationRoute(insertedRow) : null;
}

export function mapOrderPartnerNotificationRoute(
  row: OrderPartnerNotificationRouteRow,
): OrderPartnerNotificationRoute {
  return {
    orderId: row.order_id,
    tenantId: row.tenant_id,
    partnerId: row.partner_id,
    entrySlug: row.entry_slug,
    partnerUserRef: row.partner_user_ref,
    drtsPassengerId: row.drts_passenger_id,
    passengerSubjectRef: row.passenger_subject_ref,
    identityLinkedAt: new Date(row.identity_linked_at).toISOString(),
    consentBundleVersion: row.consent_bundle_version,
    notificationPolicyVersion:
      row.notification_policy_version as OrderPartnerNotificationRoute["notificationPolicyVersion"],
    rideRef: row.ride_ref,
    createdAt: new Date(row.created_at).toISOString(),
  };
}
