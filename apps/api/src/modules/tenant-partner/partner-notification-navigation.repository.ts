import { Injectable, Inject } from "@nestjs/common";
import { DatabaseService } from "../../common/db/database.service";

export interface NavigationRouteSnapshot {
  orderId: string;
  tenantId: string;
  partnerId: string;
  entrySlug: string;
  partnerUserRef: string;
  drtsPassengerId: string;
  rideRef: string;
  status: string;
  consentBundleVersion: string | null;
}

@Injectable()
export class PartnerNotificationNavigationRepository {
  constructor(
    @Inject(DatabaseService)
    private readonly databaseService: DatabaseService,
  ) {}

  async resolveRoute(
    entrySlug: string,
    rideRef: string,
    partnerUserRef: string,
  ): Promise<NavigationRouteSnapshot | null> {
    const client = await this.databaseService.connect();
    try {
      const result = await client.query(
        `
        SELECT
          r.order_id, r.tenant_id, r.partner_id, r.entry_slug,
          r.partner_user_ref, r.drts_passenger_id, r.ride_ref,
          r.consent_bundle_version,
          o.status
        FROM mobility.phase1_order_partner_notification_routes r
        JOIN ops.phase1_owned_orders o ON r.order_id = o.order_id
        WHERE r.entry_slug = $1
          AND r.ride_ref = $2
          AND r.partner_user_ref = $3
        `,
        [entrySlug, rideRef, partnerUserRef],
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        orderId: row.order_id,
        tenantId: row.tenant_id,
        partnerId: row.partner_id,
        entrySlug: row.entry_slug,
        partnerUserRef: row.partner_user_ref,
        drtsPassengerId: row.drts_passenger_id,
        rideRef: row.ride_ref,
        status: row.status,
        consentBundleVersion: row.consent_bundle_version,
      };
    } finally {
      client.release();
    }
  }
}
