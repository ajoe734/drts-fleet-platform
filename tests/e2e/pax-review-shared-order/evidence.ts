import { createRequire } from "node:module";
import type { Page, TestInfo } from "@playwright/test";
const requireApi = createRequire(
  new URL("../../../apps/api/package.json", import.meta.url),
);
const { Pool } = requireApi("pg") as typeof import("pg");

/** No headers, OTPs, session/refresh credentials, token envelopes or raw order
 * JSON are written. Facts come from the formal schema after actual UI commands.
 */
export async function recordOrderEvidence(
  orderId: string,
  stage: string,
  pages: Record<string, Page>,
  info: TestInfo,
) {
  if (process.env.PAX_REVIEW_SHARED_DEV_SMOKE === "true") {
    const response = await pages.pax!.request.get(
      `${process.env.PAX_REVIEW_PASSENGER_ORIGIN}/api/passenger-app/review-demo/rides/${orderId}/record`,
    );
    if (!response.ok())
      throw new Error(`Shared-dev owned record failed: ${response.status()}`);
    const payload = await response.json();
    const data = payload.data;
    const ride = data.ride;
    const row = {
      order_id: ride.order.order_id,
      payment_id: data.charge?.payment_id,
      payment_status: ride.payment?.status,
      attempt_count: data.charge?.attempt_count,
      rating_id: ride.rating?.rating_id,
      score: ride.rating?.score,
      requested_pickup_at: ride.order.requested_pickup_at,
      started_at: data.trip?.started_at,
      completed_at: data.trip?.completed_at,
      actual_distance_km: data.trip?.actual_distance_km,
      actual_duration_sec: data.trip?.actual_duration_sec,
      amount_minor: ride.payment?.amount?.amount_minor,
      contact_requested: data.consent?.contact_requested,
      complaint_case_no: data.consent?.complaint_case_no,
    };
    await info.attach(`${stage}-shared-dev-owned-API-facts`, {
      body: JSON.stringify({
        orderId,
        stage,
        source:
          "deployed production repository readback; formal PG joins checked in same-candidate CI",
        record: data,
      }),
      contentType: "application/json",
    });
    for (const [role, page] of Object.entries(pages))
      await info.attach(`${stage}-${role}`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: "image/png",
      });
    return [row];
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const facts = await pool.query(
      `
      SELECT o.order_id,o.status,h.drts_passenger_id,h.fare_snapshot_id,
        o.record->>'requestedPickupAt' AS requested_pickup_at,t.record->>'startedAt' AS started_at,t.record->>'completedAt' AS completed_at,
        j.dispatch_job_id,a.assignment_id,a.record->>'driverId' AS driver_id,a.record->>'vehicleId' AS vehicle_id,t.task_id,t.status AS task_status,
        t.record->>'actualDistanceKm' AS actual_distance_km,t.record->>'actualDurationSec' AS actual_duration_sec,
        c.payment_id,c.status AS charge_status,c.attempt_count,p.status AS payment_status,p.amount_minor,
        r.rating_id,r.score,rc.contact_requested,rc.complaint_case_no
      FROM ops.phase1_owned_orders o
      JOIN passenger.booking_histories h ON h.order_id::text=o.order_id
      LEFT JOIN ops.phase1_dispatch_jobs j ON j.order_id=o.order_id
      LEFT JOIN ops.phase1_dispatch_assignments a ON a.dispatch_job_id=j.dispatch_job_id
      LEFT JOIN ops.phase1_driver_tasks t ON t.assignment_id=a.assignment_id
      LEFT JOIN passenger.payment_charge_records c ON c.order_id::text=o.order_id
      LEFT JOIN billing.multi_taxi_passenger_payments p ON p.payment_id=c.payment_id
      LEFT JOIN ops.passenger_trip_ratings r ON r.order_id=o.order_id
      LEFT JOIN passenger.rating_consents rc ON rc.rating_id=r.rating_id
      WHERE o.order_id=$1 ORDER BY j.created_at,a.created_at,t.updated_at`,
      [orderId],
    );
    await info.attach(`${stage}-relational-facts`, {
      body: JSON.stringify(
        {
          orderId,
          stage,
          simulatedExternalPorts: [
            "SMS",
            "geo",
            "supply qualifications",
            "GPS",
            "PSP",
            "notification",
          ],
          rows: facts.rows,
        },
        null,
        2,
      ),
      contentType: "application/json",
    });
    for (const [role, page] of Object.entries(pages)) {
      await info.attach(`${stage}-${role}`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: "image/png",
      });
    }
    return facts.rows;
  } finally {
    await pool.end();
  }
}
