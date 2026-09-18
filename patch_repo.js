const fs = require("fs");
const file = "apps/api/src/modules/owned-mobility/owned-mobility.repository.ts";
let code = fs.readFileSync(file, "utf8");

const injection = `
    for (const route of changes.orderPartnerNotificationRoutes ?? []) {
      writes.push(() =>
        executor.query(
          \`
            INSERT INTO mobility.phase1_order_partner_notification_routes (
              order_id, tenant_id, partner_id, entry_slug, partner_user_ref,
              drts_passenger_id, passenger_subject_ref, identity_linked_at,
              consent_bundle_version, notification_policy_version, ride_ref,
              created_at, record
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb
            )
          \`,
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
            JSON.stringify(route),
          ]
        )
      );
    }

    for (const seq of changes.partnerNotificationSequences ?? []) {
      writes.push(() =>
        executor.query(
          \`
            INSERT INTO mobility.phase1_partner_notification_sequences (
              order_id, next_sequence
            ) VALUES ($1, $2)
          \`,
          [seq.orderId, seq.nextSequence]
        )
      );
    }
`;

code = code.replace(
  "for (const order of changes.orders ?? []) {",
  injection + "\n    for (const order of changes.orders ?? []) {",
);

fs.writeFileSync(file, code);
