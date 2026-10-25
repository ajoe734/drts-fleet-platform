-- V0135__multi_taxi_trip_record_truth_retention.sql
-- BUREAU-R11-EXISTING-TRIP-RECORD-SOURCE-FOLLOWTHROUGH-20261025:
-- 1. Extend reporting.multi_taxi_trip_operational_records (V0056) with explicit
--    statutory truth & provenance columns (order_no, assignment_id, route_summary,
--    route_source, distance_meters, duration_seconds, collected_fare_minor,
--    payment_status, toll_minor, toll_source, fare_policy_version, charging_mode).
-- 2. Reconcile existing rows and backfill historical completed multi_taxi_direct
--    orders from committed ops/reporting/billing evidence without fabricating
--    missing timestamps, routes, tolls, or uncollected fares.
-- 3. Synchronize payment status and collected_fare_minor in the same transaction
--    whenever billing.multi_taxi_passenger_payments is inserted or updated.
-- 4. Enforce two-calendar-year (>= 2 calendar years in UTC and >= 730 days)
--    statutory retention floor, core-fact immutability, no-truncate, and
--    active legal-hold deletion protection at the PostgreSQL boundary.

CREATE OR REPLACE FUNCTION reporting.multi_taxi_two_calendar_year_retention_floor(
  p_generated_at timestamptz
)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$
  SELECT GREATEST(
    (
      (p_generated_at AT TIME ZONE 'UTC')
      + interval '2 years'
      + CASE
          WHEN EXTRACT(MONTH FROM (p_generated_at AT TIME ZONE 'UTC')) = 2
           AND EXTRACT(DAY FROM (p_generated_at AT TIME ZONE 'UTC')) = 29
           AND EXTRACT(DAY FROM ((p_generated_at AT TIME ZONE 'UTC') + interval '2 years')) = 28
          THEN interval '1 day'
          ELSE interval '0 days'
        END
    ) AT TIME ZONE 'UTC',
    p_generated_at + interval '730 days'
  );
$$;

ALTER TABLE reporting.multi_taxi_trip_operational_records
  ADD COLUMN IF NOT EXISTS order_no text NULL,
  ADD COLUMN IF NOT EXISTS assignment_id varchar(255) NULL,
  ADD COLUMN IF NOT EXISTS route_summary text NULL,
  ADD COLUMN IF NOT EXISTS route_source text NOT NULL DEFAULT 'unavailable',
  ADD COLUMN IF NOT EXISTS distance_meters integer NULL,
  ADD COLUMN IF NOT EXISTS duration_seconds integer NULL,
  ADD COLUMN IF NOT EXISTS collected_fare_minor bigint NULL,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS toll_minor bigint NULL,
  ADD COLUMN IF NOT EXISTS toll_source text NOT NULL DEFAULT 'unavailable',
  ADD COLUMN IF NOT EXISTS fare_policy_version text NOT NULL DEFAULT 'multi-taxi-v1',
  ADD COLUMN IF NOT EXISTS charging_mode text NOT NULL DEFAULT 'meter';

ALTER TABLE reporting.multi_taxi_trip_operational_records
  DROP CONSTRAINT IF EXISTS multi_taxi_record_route_source_chk,
  ADD CONSTRAINT multi_taxi_record_route_source_chk CHECK (
    route_source IN (
      'driver_gps',
      'provider_route',
      'mixed',
      'pickup_dropoff_summary',
      'unavailable'
    )
  ),
  DROP CONSTRAINT IF EXISTS multi_taxi_record_distance_chk,
  ADD CONSTRAINT multi_taxi_record_distance_chk CHECK (
    distance_meters IS NULL OR distance_meters >= 0
  ),
  DROP CONSTRAINT IF EXISTS multi_taxi_record_duration_chk,
  ADD CONSTRAINT multi_taxi_record_duration_chk CHECK (
    duration_seconds IS NULL OR duration_seconds >= 0
  ),
  DROP CONSTRAINT IF EXISTS multi_taxi_record_payment_status_chk,
  ADD CONSTRAINT multi_taxi_record_payment_status_chk CHECK (
    payment_status IN (
      'not_selected',
      'authorized',
      'captured',
      'failed',
      'refunded',
      'manual_recovery',
      'unknown'
    )
  ),
  DROP CONSTRAINT IF EXISTS multi_taxi_record_payment_collection_chk,
  ADD CONSTRAINT multi_taxi_record_payment_collection_chk CHECK (
    (payment_status = 'captured' AND collected_fare_minor IS NOT NULL AND collected_fare_minor >= 0)
    OR (payment_status = 'refunded' AND collected_fare_minor = 0)
    OR (
      payment_status IN ('not_selected', 'authorized', 'failed', 'manual_recovery', 'unknown')
      AND collected_fare_minor IS NULL
    )
  ),
  DROP CONSTRAINT IF EXISTS multi_taxi_record_toll_minor_chk,
  ADD CONSTRAINT multi_taxi_record_toll_minor_chk CHECK (
    toll_minor IS NULL OR toll_minor >= 0
  ),
  DROP CONSTRAINT IF EXISTS multi_taxi_record_toll_source_chk,
  ADD CONSTRAINT multi_taxi_record_toll_source_chk CHECK (
    toll_source IN ('driver_proof', 'electronic_receipt', 'none', 'unavailable')
  ),
  DROP CONSTRAINT IF EXISTS multi_taxi_record_charging_mode_chk,
  ADD CONSTRAINT multi_taxi_record_charging_mode_chk CHECK (
    charging_mode IN ('meter', 'platform_quote')
  );

CREATE INDEX IF NOT EXISTS multi_taxi_operational_record_plate_idx
  ON reporting.multi_taxi_trip_operational_records (upper(plate_no), reserved_at DESC);

CREATE INDEX IF NOT EXISTS multi_taxi_operational_record_reserved_idx
  ON reporting.multi_taxi_trip_operational_records (reserved_at DESC);

CREATE INDEX IF NOT EXISTS multi_taxi_operational_record_order_no_idx
  ON reporting.multi_taxi_trip_operational_records (order_no)
  WHERE order_no IS NOT NULL;

CREATE INDEX IF NOT EXISTS multi_taxi_operational_record_trip_id_idx
  ON reporting.multi_taxi_trip_operational_records (trip_id);

-- Backfill / reconcile committed completed multi_taxi_direct trips from authoritative
-- completion outbox, electronic receipts, tasks, assignments, disclosures, and payments.
WITH completed_multi_taxi_orders AS (
  SELECT
    o.order_id,
    o.order_no,
    o.created_at AS order_created_at,
    o.updated_at AS order_updated_at,
    o.record AS order_record,
    t.task_id,
    t.assignment_id AS task_assignment_id,
    t.record AS task_record,
    a.assignment_id AS dispatch_assignment_id,
    a.record AS assignment_record,
    cert.payload->'event' AS cert_event,
    er.record AS receipt_record,
    disc.record AS disclosure_record,
    pay.status AS payment_row_status,
    pay.amount_minor AS payment_row_amount_minor
  FROM ops.phase1_owned_orders o
  LEFT JOIN LATERAL (
    SELECT dt.task_id, dt.assignment_id, dt.record
    FROM ops.phase1_driver_tasks dt
    WHERE dt.order_id = o.order_id
    ORDER BY
      CASE WHEN dt.status = 'completed' OR dt.record->>'status' = 'completed' THEN 0 ELSE 1 END,
      dt.updated_at DESC
    LIMIT 1
  ) t ON true
  LEFT JOIN LATERAL (
    SELECT da.assignment_id, da.record
    FROM ops.phase1_dispatch_assignments da
    WHERE da.order_id = o.order_id
    ORDER BY
      CASE WHEN da.assignment_id = t.assignment_id THEN 0 ELSE 1 END,
      da.updated_at DESC
    LIMIT 1
  ) a ON true
  LEFT JOIN LATERAL (
    SELECT dco.payload
    FROM ops.driver_completion_outbox dco
    WHERE dco.order_id = o.order_id
      AND dco.effect_type = 'multi_taxi_certificate'
    ORDER BY dco.created_at DESC
    LIMIT 1
  ) cert ON true
  LEFT JOIN reporting.multi_taxi_electronic_receipts er
    ON er.order_id = o.order_id
  LEFT JOIN LATERAL (
    SELECT pds.record
    FROM ops.passenger_dispatch_disclosure_snapshots pds
    WHERE pds.order_id = o.order_id
    ORDER BY pds.assignment_version DESC, pds.created_at DESC
    LIMIT 1
  ) disc ON true
  LEFT JOIN billing.multi_taxi_passenger_payments pay
    ON pay.order_id = o.order_id
  WHERE o.record->>'runtimeProfileCode' = 'multi_taxi_direct'
    AND (o.status = 'completed' OR o.record->>'lifecycleStatus' = 'completed')
),
resolved_trips AS (
  SELECT
    'mtr-' || c.order_id AS record_id,
    c.order_id,
    c.order_no,
    COALESCE(
      NULLIF(c.cert_event->>'tripId', ''),
      NULLIF(c.receipt_record->>'tripId', ''),
      NULLIF(c.task_id, ''),
      'trip-' || c.order_id
    ) AS trip_id,
    COALESCE(
      NULLIF(c.cert_event->>'assignmentId', ''),
      NULLIF(c.task_assignment_id, ''),
      NULLIF(c.dispatch_assignment_id, '')
    ) AS assignment_id,
    COALESCE(
      NULLIF(c.cert_event->>'vehicleId', ''),
      NULLIF(c.receipt_record->>'vehicleId', ''),
      NULLIF(c.task_record->>'vehicleId', ''),
      NULLIF(c.assignment_record->>'vehicleId', ''),
      NULLIF(c.disclosure_record->'vehicle'->>'vehicleId', ''),
      'veh-unknown-' || c.order_id
    ) AS vehicle_id,
    COALESCE(
      NULLIF(c.cert_event->>'plateNo', ''),
      NULLIF(c.receipt_record->>'plateNo', ''),
      NULLIF(c.disclosure_record->'vehicle'->>'plateNo', ''),
      NULLIF(c.assignment_record->>'plateNo', ''),
      'UNRECORDED'
    ) AS plate_no,
    COALESCE(
      NULLIF(c.cert_event->>'reservedAt', '')::timestamptz,
      NULLIF(c.order_record->>'reservationWindowStart', '')::timestamptz,
      NULLIF(c.order_record->>'createdAt', '')::timestamptz,
      c.order_created_at
    ) AS reserved_at,
    COALESCE(
      NULLIF(c.cert_event->>'pickupAt', '')::timestamptz,
      NULLIF(c.task_record->>'startedAt', '')::timestamptz
    ) AS pickup_at,
    COALESCE(
      NULLIF(c.cert_event->>'dropoffAt', '')::timestamptz,
      NULLIF(c.receipt_record->>'dropoffAt', '')::timestamptz,
      NULLIF(c.task_record->>'completedAt', '')::timestamptz
    ) AS dropoff_at,
    COALESCE(
      NULLIF(c.cert_event->>'routeSummary', ''),
      NULLIF(c.receipt_record->>'routeSummary', ''),
      CASE
        WHEN NULLIF(c.order_record->'pickup'->>'address', '') IS NOT NULL
         AND NULLIF(c.order_record->'dropoff'->>'address', '') IS NOT NULL
        THEN (c.order_record->'pickup'->>'address') || ' -> ' || (c.order_record->'dropoff'->>'address')
        ELSE NULL
      END
    ) AS route_summary,
    CASE
      WHEN COALESCE(gps.sample_count, 0) >= 2 AND COALESCE(gps.max_gap_seconds, 999999) <= 180
        THEN 'driver_gps'
      WHEN COALESCE(gps.sample_count, 0) >= 1
        THEN 'mixed'
      WHEN NULLIF(c.cert_event->>'distanceMeters', '') IS NOT NULL
        OR NULLIF(c.cert_event->>'routeSummary', '') IS NOT NULL
        OR NULLIF(c.receipt_record->>'routeSummary', '') IS NOT NULL
      THEN 'pickup_dropoff_summary'
      WHEN NULLIF(c.disclosure_record->'routeFare'->>'encodedPolyline', '') IS NOT NULL
        OR NULLIF(c.disclosure_record->'routeFare'->>'estimatedDistanceMeters', '') IS NOT NULL
      THEN 'provider_route'
      WHEN NULLIF(c.order_record->'pickup'->>'address', '') IS NOT NULL
       AND NULLIF(c.order_record->'dropoff'->>'address', '') IS NOT NULL
      THEN 'pickup_dropoff_summary'
      ELSE 'unavailable'
    END AS route_source,
    COALESCE(gps.sample_count, 0)::integer AS point_count,
    CASE
      WHEN COALESCE(gps.sample_count, 0) >= 2 THEN gps.sampled_polyline
      WHEN COALESCE(gps.sample_count, 0) = 1 THEN NULL
      WHEN NULLIF(c.cert_event->>'distanceMeters', '') IS NULL
       AND NULLIF(c.cert_event->>'routeSummary', '') IS NULL
       AND NULLIF(c.receipt_record->>'routeSummary', '') IS NULL
      THEN NULLIF(c.disclosure_record->'routeFare'->>'encodedPolyline', '')
      ELSE NULL
    END AS encoded_polyline,
    gps.telemetry_provenance,
    COALESCE(
      (NULLIF(c.cert_event->>'distanceMeters', ''))::integer,
      (NULLIF(c.receipt_record->>'distanceMeters', ''))::integer,
      (NULLIF(c.disclosure_record->'routeFare'->>'estimatedDistanceMeters', ''))::integer
    ) AS distance_meters,
    COALESCE(
      (NULLIF(c.cert_event->>'durationSeconds', ''))::integer,
      (NULLIF(c.receipt_record->>'durationSeconds', ''))::integer,
      CASE
        WHEN COALESCE(
          NULLIF(c.cert_event->>'pickupAt', '')::timestamptz,
          NULLIF(c.task_record->>'startedAt', '')::timestamptz
        ) IS NOT NULL
        AND COALESCE(
          NULLIF(c.cert_event->>'dropoffAt', '')::timestamptz,
          NULLIF(c.receipt_record->>'dropoffAt', '')::timestamptz,
          NULLIF(c.task_record->>'completedAt', '')::timestamptz
        ) IS NOT NULL
        THEN GREATEST(
          0,
          FLOOR(
            EXTRACT(
              EPOCH FROM (
                COALESCE(
                  NULLIF(c.cert_event->>'dropoffAt', '')::timestamptz,
                  NULLIF(c.receipt_record->>'dropoffAt', '')::timestamptz,
                  NULLIF(c.task_record->>'completedAt', '')::timestamptz
                ) - COALESCE(
                  NULLIF(c.cert_event->>'pickupAt', '')::timestamptz,
                  NULLIF(c.task_record->>'startedAt', '')::timestamptz
                )
              )
            )
          )::integer
        )
        ELSE (NULLIF(c.disclosure_record->'routeFare'->>'estimatedDurationSeconds', ''))::integer
      END
    ) AS duration_seconds,
    COALESCE(
      (NULLIF(c.cert_event->>'payableFareMinor', ''))::bigint,
      (NULLIF(c.receipt_record->>'payableFareMinor', ''))::bigint,
      (NULLIF(c.disclosure_record->'routeFare'->>'payableFareMinor', ''))::bigint,
      (NULLIF(c.order_record->'quotedPrice'->>'amountMinor', ''))::bigint,
      (NULLIF(c.receipt_record->>'amountMinor', ''))::bigint,
      0
    ) AS payable_fare_minor,
    COALESCE(
      (NULLIF(c.cert_event->>'actualFareMinor', ''))::bigint,
      (NULLIF(c.receipt_record->>'actualFareMinor', ''))::bigint,
      (NULLIF(c.receipt_record->>'amountMinor', ''))::bigint,
      CASE WHEN c.payment_row_status = 'captured' THEN c.payment_row_amount_minor ELSE NULL END,
      (NULLIF(c.disclosure_record->'routeFare'->>'payableFareMinor', ''))::bigint,
      (NULLIF(c.order_record->'quotedPrice'->>'amountMinor', ''))::bigint,
      0
    ) AS actual_fare_minor,
    CASE
      WHEN c.payment_row_status = 'captured' THEN COALESCE(
        c.payment_row_amount_minor,
        (NULLIF(c.cert_event->>'actualFareMinor', ''))::bigint,
        (NULLIF(c.receipt_record->>'amountMinor', ''))::bigint,
        0
      )
      WHEN c.payment_row_status = 'refunded' THEN 0
      ELSE NULL
    END AS collected_fare_minor,
    COALESCE(c.payment_row_status, 'unknown') AS payment_status,
    CASE
      WHEN NULLIF(c.cert_event->>'tollMinor', '') IS NOT NULL
        THEN (c.cert_event->>'tollMinor')::bigint
      WHEN NULLIF(c.receipt_record->>'tollMinor', '') IS NOT NULL
        THEN (c.receipt_record->>'tollMinor')::bigint
      ELSE NULL
    END AS toll_minor,
    CASE
      WHEN NULLIF(c.cert_event->>'tollMinor', '') IS NOT NULL THEN 'driver_proof'
      WHEN NULLIF(c.receipt_record->>'tollMinor', '') IS NOT NULL THEN 'electronic_receipt'
      ELSE 'unavailable'
    END AS toll_source,
    COALESCE(
      NULLIF(c.cert_event->>'farePolicyVersion', ''),
      NULLIF(c.receipt_record->>'farePolicyVersion', ''),
      NULLIF(c.disclosure_record->'routeFare'->>'farePolicyVersion', ''),
      'multi-taxi-v1'
    ) AS fare_policy_version,
    CASE
      WHEN COALESCE(
        NULLIF(c.cert_event->>'chargingMode', ''),
        NULLIF(c.receipt_record->>'chargingMode', ''),
        NULLIF(c.disclosure_record->'routeFare'->>'chargingMode', '')
      ) = 'platform_quote'
      THEN 'platform_quote'
      ELSE 'meter'
    END AS charging_mode,
    COALESCE(
      NULLIF(c.cert_event->>'dropoffAt', '')::timestamptz,
      NULLIF(c.receipt_record->>'dropoffAt', '')::timestamptz,
      NULLIF(c.task_record->>'completedAt', '')::timestamptz,
      c.order_updated_at
    ) AS generated_at
  FROM completed_multi_taxi_orders c
  LEFT JOIN LATERAL (
    WITH trip_bounds AS (
      SELECT
        c.task_id AS auth_task_id,
        NULLIF(c.task_record->>'driverId', '') AS auth_driver_id,
        COALESCE(
          NULLIF(c.cert_event->>'vehicleId', ''),
          NULLIF(c.receipt_record->>'vehicleId', ''),
          NULLIF(c.task_record->>'vehicleId', ''),
          NULLIF(c.assignment_record->>'vehicleId', ''),
          NULLIF(c.disclosure_record->'vehicle'->>'vehicleId', '')
        ) AS auth_vehicle_id,
        COALESCE(
          NULLIF(c.cert_event->>'pickupAt', '')::timestamptz,
          NULLIF(c.task_record->>'startedAt', '')::timestamptz
        ) AS window_start_at,
        COALESCE(
          NULLIF(c.cert_event->>'dropoffAt', '')::timestamptz,
          NULLIF(c.receipt_record->>'dropoffAt', '')::timestamptz,
          NULLIF(c.task_record->>'completedAt', '')::timestamptz
        ) AS window_end_at
    ),
    ordered_samples AS (
      SELECT
        e.event_id,
        e.sequence_no,
        e.lat,
        e.lng,
        e.recorded_at,
        e.received_at,
        (e.vehicle_id IS NULL) AS vehicle_was_null,
        tb.auth_task_id,
        tb.auth_driver_id,
        tb.auth_vehicle_id,
        tb.window_start_at,
        tb.window_end_at,
        LAG(e.recorded_at) OVER (
          ORDER BY e.recorded_at ASC, e.sequence_no ASC, e.received_at ASC, e.event_id ASC
        ) AS prev_recorded_at
      FROM trip_bounds tb
      JOIN telemetry.driver_location_events e
        ON tb.auth_task_id IS NOT NULL
       AND tb.auth_driver_id IS NOT NULL
       AND tb.auth_vehicle_id IS NOT NULL
       AND tb.window_start_at IS NOT NULL
       AND tb.window_end_at IS NOT NULL
       AND tb.window_end_at >= tb.window_start_at
       AND e.driver_id = tb.auth_driver_id
       AND e.task_id = tb.auth_task_id
       AND (e.vehicle_id IS NULL OR e.vehicle_id = tb.auth_vehicle_id)
       AND e.recorded_at >= tb.window_start_at
       AND e.recorded_at <= tb.window_end_at
       AND e.work_state = 'on_trip'
       AND e.out_of_order = false
       AND (e.accuracy_m IS NULL OR (e.accuracy_m >= 0 AND e.accuracy_m <= 100))
       AND e.lat BETWEEN -90 AND 90
       AND e.lng BETWEEN -180 AND 180
    ),
    agg AS (
      SELECT
        COUNT(*)::integer AS sample_count,
        COUNT(*) FILTER (WHERE os.vehicle_was_null)::integer AS null_vehicle_sample_count,
        MIN(os.recorded_at) AS first_sample_at,
        MAX(os.recorded_at) AS last_sample_at,
        MAX(os.auth_task_id) AS auth_task_id,
        MAX(os.auth_driver_id) AS auth_driver_id,
        MAX(os.auth_vehicle_id) AS auth_vehicle_id,
        MAX(os.window_start_at) AS window_start_at,
        MAX(os.window_end_at) AS window_end_at,
        COALESCE(
          MAX(
            CASE
              WHEN os.prev_recorded_at IS NOT NULL
                THEN GREATEST(0, ROUND(EXTRACT(EPOCH FROM (os.recorded_at - os.prev_recorded_at))))::integer
              ELSE 0
            END
          ),
          0
        ) AS max_internal_gap_seconds,
        STRING_AGG(
          ROUND(os.lat::numeric, 6)::text || ',' || ROUND(os.lng::numeric, 6)::text,
          ';'
          ORDER BY os.recorded_at ASC, os.sequence_no ASC, os.received_at ASC, os.event_id ASC
        ) AS sampled_polyline
      FROM ordered_samples os
    )
    SELECT
      agg.sample_count,
      CASE
        WHEN agg.sample_count >= 2 THEN agg.sampled_polyline
        ELSE NULL
      END AS sampled_polyline,
      CASE
        WHEN agg.sample_count >= 1 THEN GREATEST(
          agg.max_internal_gap_seconds,
          GREATEST(0, ROUND(EXTRACT(EPOCH FROM (agg.first_sample_at - agg.window_start_at))))::integer,
          GREATEST(0, ROUND(EXTRACT(EPOCH FROM (agg.window_end_at - agg.last_sample_at))))::integer
        )
        ELSE NULL
      END AS max_gap_seconds,
      CASE
        WHEN agg.sample_count >= 1 THEN jsonb_build_object(
          'sampleTable', 'telemetry.driver_location_events',
          'driverId', agg.auth_driver_id,
          'taskId', agg.auth_task_id,
          'vehicleId', agg.auth_vehicle_id,
          'windowStartAt', to_jsonb(agg.window_start_at),
          'windowEndAt', to_jsonb(agg.window_end_at),
          'validSampleCount', agg.sample_count,
          'nullVehicleSampleCount', agg.null_vehicle_sample_count,
          'firstSampleAt', to_jsonb(agg.first_sample_at),
          'lastSampleAt', to_jsonb(agg.last_sample_at),
          'maxGapSeconds', GREATEST(
            agg.max_internal_gap_seconds,
            GREATEST(0, ROUND(EXTRACT(EPOCH FROM (agg.first_sample_at - agg.window_start_at))))::integer,
            GREATEST(0, ROUND(EXTRACT(EPOCH FROM (agg.window_end_at - agg.last_sample_at))))::integer
          ),
          'coverage', CASE
            WHEN agg.sample_count = 1 THEN 'single_point'
            WHEN GREATEST(
              agg.max_internal_gap_seconds,
              GREATEST(0, ROUND(EXTRACT(EPOCH FROM (agg.first_sample_at - agg.window_start_at))))::integer,
              GREATEST(0, ROUND(EXTRACT(EPOCH FROM (agg.window_end_at - agg.last_sample_at))))::integer
            ) <= 180 THEN 'full_sampled'
            ELSE 'gapped_sampled'
          END
        )
        ELSE NULL
      END AS telemetry_provenance
    FROM agg
  ) gps ON true
)
INSERT INTO reporting.multi_taxi_trip_operational_records (
  record_id,
  order_id,
  order_no,
  trip_id,
  assignment_id,
  vehicle_id,
  plate_no,
  reserved_at,
  pickup_at,
  dropoff_at,
  route_summary,
  route_source,
  distance_meters,
  duration_seconds,
  payable_fare_minor,
  actual_fare_minor,
  collected_fare_minor,
  payment_status,
  toll_minor,
  toll_source,
  fare_policy_version,
  charging_mode,
  currency,
  record,
  generated_at,
  retain_until
)
SELECT
  r.record_id,
  r.order_id,
  r.order_no,
  r.trip_id,
  r.assignment_id,
  r.vehicle_id,
  r.plate_no,
  r.reserved_at,
  r.pickup_at,
  r.dropoff_at,
  r.route_summary,
  r.route_source,
  r.distance_meters,
  r.duration_seconds,
  r.payable_fare_minor,
  r.actual_fare_minor,
  r.collected_fare_minor,
  r.payment_status,
  r.toll_minor,
  r.toll_source,
  r.fare_policy_version,
  r.charging_mode,
  'TWD',
  jsonb_build_object(
    'recordId', r.record_id,
    'orderId', r.order_id,
    'orderNo', r.order_no,
    'tripId', r.trip_id,
    'assignmentId', r.assignment_id,
    'vehicleId', r.vehicle_id,
    'plateNo', r.plate_no,
    'reservedAt', to_jsonb(r.reserved_at),
    'pickupAt', to_jsonb(r.pickup_at),
    'dropoffAt', to_jsonb(r.dropoff_at),
    'route', jsonb_build_object(
      'encodedPolyline', r.encoded_polyline,
      'pointCount', r.point_count,
      'distanceMeters', r.distance_meters,
      'durationSeconds', r.duration_seconds,
      'source', r.route_source,
      'routeSummary', r.route_summary,
      'telemetryProvenance', r.telemetry_provenance
    ),
    'payableFareMinor', r.payable_fare_minor,
    'actualFareMinor', r.actual_fare_minor,
    'collectedFareMinor', r.collected_fare_minor,
    'paymentStatus', r.payment_status,
    'tollMinor', r.toll_minor,
    'tollSource', r.toll_source,
    'currency', 'TWD',
    'farePolicyVersion', r.fare_policy_version,
    'chargingMode', r.charging_mode,
    'generatedAt', to_jsonb(r.generated_at),
    'retainUntil', to_jsonb(reporting.multi_taxi_two_calendar_year_retention_floor(r.generated_at))
  ),
  r.generated_at,
  reporting.multi_taxi_two_calendar_year_retention_floor(r.generated_at)
FROM resolved_trips r
ON CONFLICT (order_id) DO UPDATE
SET
  order_no = COALESCE(EXCLUDED.order_no, reporting.multi_taxi_trip_operational_records.order_no),
  assignment_id = COALESCE(EXCLUDED.assignment_id, reporting.multi_taxi_trip_operational_records.assignment_id),
  pickup_at = COALESCE(reporting.multi_taxi_trip_operational_records.pickup_at, EXCLUDED.pickup_at),
  dropoff_at = COALESCE(reporting.multi_taxi_trip_operational_records.dropoff_at, EXCLUDED.dropoff_at),
  route_summary = COALESCE(EXCLUDED.route_summary, reporting.multi_taxi_trip_operational_records.route_summary),
  route_source = CASE
    WHEN EXCLUDED.route_source IN ('driver_gps', 'mixed') THEN EXCLUDED.route_source
    WHEN reporting.multi_taxi_trip_operational_records.route_source = 'unavailable'
    THEN EXCLUDED.route_source
    ELSE reporting.multi_taxi_trip_operational_records.route_source
  END,
  distance_meters = COALESCE(EXCLUDED.distance_meters, reporting.multi_taxi_trip_operational_records.distance_meters),
  duration_seconds = COALESCE(EXCLUDED.duration_seconds, reporting.multi_taxi_trip_operational_records.duration_seconds),
  collected_fare_minor = EXCLUDED.collected_fare_minor,
  payment_status = EXCLUDED.payment_status,
  toll_minor = COALESCE(EXCLUDED.toll_minor, reporting.multi_taxi_trip_operational_records.toll_minor),
  toll_source = CASE
    WHEN reporting.multi_taxi_trip_operational_records.toll_source = 'unavailable'
    THEN EXCLUDED.toll_source
    ELSE reporting.multi_taxi_trip_operational_records.toll_source
  END,
  fare_policy_version = COALESCE(EXCLUDED.fare_policy_version, reporting.multi_taxi_trip_operational_records.fare_policy_version),
  charging_mode = COALESCE(EXCLUDED.charging_mode, reporting.multi_taxi_trip_operational_records.charging_mode),
  record = reporting.multi_taxi_trip_operational_records.record || EXCLUDED.record,
  retain_until = GREATEST(
    reporting.multi_taxi_trip_operational_records.retain_until,
    reporting.multi_taxi_two_calendar_year_retention_floor(
      reporting.multi_taxi_trip_operational_records.generated_at
    )
  );

-- Also reconcile any pre-existing rows in reporting.multi_taxi_trip_operational_records
-- that were inserted without an ops.phase1_owned_orders match, extracting JSONB fields
-- into the new top-level columns honestly.
UPDATE reporting.multi_taxi_trip_operational_records r
SET
  order_no = COALESCE(r.order_no, NULLIF(r.record->>'orderNo', '')),
  assignment_id = COALESCE(r.assignment_id, NULLIF(r.record->>'assignmentId', '')),
  route_summary = COALESCE(r.route_summary, NULLIF(r.record->'route'->>'routeSummary', '')),
  route_source = CASE
    WHEN r.route_source <> 'unavailable' THEN r.route_source
    WHEN r.record->'route'->>'source' IN (
      'driver_gps', 'provider_route', 'mixed', 'pickup_dropoff_summary', 'unavailable'
    ) THEN r.record->'route'->>'source'
    ELSE 'unavailable'
  END,
  distance_meters = COALESCE(
    r.distance_meters,
    (NULLIF(r.record->'route'->>'distanceMeters', ''))::integer
  ),
  duration_seconds = COALESCE(
    r.duration_seconds,
    (NULLIF(r.record->'route'->>'durationSeconds', ''))::integer
  ),
  toll_minor = COALESCE(
    r.toll_minor,
    (NULLIF(r.record->>'tollMinor', ''))::bigint
  ),
  toll_source = CASE
    WHEN r.toll_source <> 'unavailable' THEN r.toll_source
    WHEN r.record->>'tollSource' IN ('driver_proof', 'electronic_receipt', 'none', 'unavailable')
      THEN r.record->>'tollSource'
    WHEN NULLIF(r.record->>'tollMinor', '') IS NOT NULL THEN 'driver_proof'
    ELSE 'unavailable'
  END,
  fare_policy_version = COALESCE(
    NULLIF(r.record->>'farePolicyVersion', ''),
    r.fare_policy_version,
    'multi-taxi-v1'
  ),
  charging_mode = CASE
    WHEN r.record->>'chargingMode' = 'platform_quote' THEN 'platform_quote'
    ELSE r.charging_mode
  END,
  payment_status = COALESCE(p.status, r.payment_status, 'unknown'),
  collected_fare_minor = CASE
    WHEN p.status = 'captured' THEN COALESCE(p.amount_minor, r.actual_fare_minor)
    WHEN p.status = 'refunded' THEN 0
    ELSE NULL
  END,
  retain_until = GREATEST(
    r.retain_until,
    reporting.multi_taxi_two_calendar_year_retention_floor(r.generated_at)
  ),
  record = jsonb_set(
    r.record,
    '{retainUntil}',
    to_jsonb(
      GREATEST(
        r.retain_until,
        reporting.multi_taxi_two_calendar_year_retention_floor(r.generated_at)
      )
    ),
    true
  )
FROM (
  SELECT r2.record_id, pay.status, pay.amount_minor
  FROM reporting.multi_taxi_trip_operational_records r2
  LEFT JOIN billing.multi_taxi_passenger_payments pay
    ON pay.order_id = r2.order_id
) p
WHERE r.record_id = p.record_id;

-- Synchronize payment status and collected_fare_minor inside the same transaction
-- whenever billing.multi_taxi_passenger_payments is inserted or updated.
CREATE OR REPLACE FUNCTION reporting.sync_multi_taxi_trip_record_payment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_status text;
  v_collected bigint;
BEGIN
  v_status := COALESCE(NEW.status, 'unknown');
  v_collected := CASE
    WHEN v_status = 'captured' THEN COALESCE(NEW.amount_minor, 0)
    WHEN v_status = 'refunded' THEN 0
    ELSE NULL
  END;

  UPDATE reporting.multi_taxi_trip_operational_records r
  SET
    payment_status = v_status,
    collected_fare_minor = v_collected,
    record = jsonb_set(
      jsonb_set(
        r.record,
        '{paymentStatus}',
        to_jsonb(v_status),
        true
      ),
      '{collectedFareMinor}',
      COALESCE(to_jsonb(v_collected), 'null'::jsonb),
      true
    )
  WHERE r.order_id = NEW.order_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_multi_taxi_trip_record_payment
  ON billing.multi_taxi_passenger_payments;
CREATE TRIGGER trg_sync_multi_taxi_trip_record_payment
AFTER INSERT OR UPDATE ON billing.multi_taxi_passenger_payments
FOR EACH ROW EXECUTE FUNCTION reporting.sync_multi_taxi_trip_record_payment();

-- Enforce core-fact immutability and two-calendar-year retention floor on UPDATE.
CREATE OR REPLACE FUNCTION reporting.enforce_multi_taxi_trip_record_update_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_floor timestamptz;
BEGIN
  IF NEW.record_id IS DISTINCT FROM OLD.record_id
     OR NEW.order_id IS DISTINCT FROM OLD.order_id
     OR NEW.generated_at IS DISTINCT FROM OLD.generated_at
     OR (
       NULLIF(OLD.trip_id, '') IS NOT NULL
       AND OLD.trip_id <> 'trip-' || OLD.order_id
       AND NEW.trip_id IS DISTINCT FROM OLD.trip_id
     )
     OR (
       NULLIF(OLD.vehicle_id, '') IS NOT NULL
       AND OLD.vehicle_id NOT IN ('unassigned', 'veh-unknown-' || OLD.order_id)
       AND NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id
     )
     OR (
       NULLIF(OLD.plate_no, '') IS NOT NULL
       AND OLD.plate_no NOT IN ('UNRECORDED', '—')
       AND NEW.plate_no IS DISTINCT FROM OLD.plate_no
     )
     OR (
       OLD.reserved_at IS NOT NULL
       AND NEW.reserved_at IS DISTINCT FROM OLD.reserved_at
     )
     OR (
       OLD.pickup_at IS NOT NULL
       AND NEW.pickup_at IS DISTINCT FROM OLD.pickup_at
     )
     OR (
       OLD.dropoff_at IS NOT NULL
       AND NEW.dropoff_at IS DISTINCT FROM OLD.dropoff_at
     ) THEN
    RAISE EXCEPTION 'R11 trip operational record core trip facts (record_id, order_id, trip_id, vehicle_id, plate_no, reserved_at, pickup_at, dropoff_at, generated_at) are immutable once populated'
      USING ERRCODE = 'check_violation';
  END IF;

  v_floor := reporting.multi_taxi_two_calendar_year_retention_floor(NEW.generated_at);
  IF NEW.retain_until < OLD.retain_until
     OR NEW.retain_until < v_floor THEN
    RAISE EXCEPTION 'R11 trip operational record retain_until (%) cannot be shortened below existing (%) or two-calendar-year floor (%)',
      NEW.retain_until, OLD.retain_until, v_floor
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_multi_taxi_trip_record_update_guard
  ON reporting.multi_taxi_trip_operational_records;
CREATE TRIGGER trg_multi_taxi_trip_record_update_guard
BEFORE UPDATE ON reporting.multi_taxi_trip_operational_records
FOR EACH ROW EXECUTE FUNCTION reporting.enforce_multi_taxi_trip_record_update_guard();

-- Enforce two-calendar-year statutory retention floor and active legal-hold gate on DELETE / TRUNCATE.
CREATE OR REPLACE FUNCTION reporting.enforce_multi_taxi_trip_record_delete_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_effective_retain_until timestamptz;
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'reporting.multi_taxi_trip_operational_records cannot be truncated (R11 two-calendar-year statutory retention)'
      USING ERRCODE = 'check_violation';
  END IF;

  v_effective_retain_until := GREATEST(
    OLD.retain_until,
    reporting.multi_taxi_two_calendar_year_retention_floor(OLD.generated_at)
  );
  IF v_effective_retain_until > clock_timestamp() THEN
    RAISE EXCEPTION 'R11 trip operational record % cannot be deleted before two-calendar-year retention expiry (%)',
      OLD.record_id, v_effective_retain_until
      USING ERRCODE = 'check_violation';
  END IF;

  IF current_setting('reporting.allow_trip_record_retention_purge', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'R11 trip operational record % deletion after expiry requires reporting.allow_trip_record_retention_purge = on',
      OLD.record_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM voice.legal_hold lh
    WHERE lh.status = 'active'
      AND lh.evidence_family IN ('proof_bundle', 'multi_taxi_trip_record')
      AND lh.subject_ref IN (OLD.order_id, OLD.record_id, OLD.trip_id)
  ) THEN
    RAISE EXCEPTION 'R11 trip operational record % is under active legal hold and cannot be deleted',
      OLD.record_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_multi_taxi_trip_record_delete_guard
  ON reporting.multi_taxi_trip_operational_records;
CREATE TRIGGER trg_multi_taxi_trip_record_delete_guard
BEFORE DELETE ON reporting.multi_taxi_trip_operational_records
FOR EACH ROW EXECUTE FUNCTION reporting.enforce_multi_taxi_trip_record_delete_guard();

DROP TRIGGER IF EXISTS trg_multi_taxi_trip_record_no_truncate
  ON reporting.multi_taxi_trip_operational_records;
CREATE TRIGGER trg_multi_taxi_trip_record_no_truncate
BEFORE TRUNCATE ON reporting.multi_taxi_trip_operational_records
FOR EACH STATEMENT EXECUTE FUNCTION reporting.enforce_multi_taxi_trip_record_delete_guard();
