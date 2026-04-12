-- V0002__enum_types.sql
-- Phase 1 enum types
-- Safe to rerun

DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'core'
          AND t.typname = 'partner_type_t'
      ) THEN
        CREATE TYPE core.partner_type_t AS ENUM (
  'individual_owner',
  'fleet_company_partner',
  'dispatch_partner',
  'credit_card_partner',
  'enterprise_partner',
  'site_partner'
);
      END IF;
    END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'core'
      AND t.typname = 'tenant_status_t'
  ) THEN
    CREATE TYPE core.tenant_status_t AS ENUM ('active', 'suspended', 'terminated');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'reg'
      AND t.typname = 'vehicle_form_t'
  ) THEN
    CREATE TYPE reg.vehicle_form_t AS ENUM ('sedan', 'wagon', 'mpv', 'accessible', 'other');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'reg'
      AND t.typname = 'license_class_t'
  ) THEN
    CREATE TYPE reg.license_class_t AS ENUM ('taxi', 'rental', 'multi_taxi', 'other');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'reg'
      AND t.typname = 'energy_type_t'
  ) THEN
    CREATE TYPE reg.energy_type_t AS ENUM ('fuel', 'ev', 'hybrid', 'other');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'reg'
      AND t.typname = 'vehicle_status_t'
  ) THEN
    CREATE TYPE reg.vehicle_status_t AS ENUM ('draft', 'active', 'suspended', 'maintenance', 'terminated');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'reg'
      AND t.typname = 'review_status_t'
  ) THEN
    CREATE TYPE reg.review_status_t AS ENUM ('draft', 'docs_pending', 'under_review', 'approved', 'rejected', 'debranding_pending', 'closed');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'reg'
      AND t.typname = 'insurance_status_t'
  ) THEN
    CREATE TYPE reg.insurance_status_t AS ENUM ('active', 'expired', 'cancelled', 'pending');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'reg'
      AND t.typname = 'driver_status_t'
  ) THEN
    CREATE TYPE reg.driver_status_t AS ENUM ('active', 'inactive', 'suspended', 'terminated');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'reg'
      AND t.typname = 'training_status_t'
  ) THEN
    CREATE TYPE reg.training_status_t AS ENUM ('pending', 'passed', 'expired', 'waived');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'ops'
      AND t.typname = 'service_bucket_t'
  ) THEN
    CREATE TYPE ops.service_bucket_t AS ENUM ('standard_taxi', 'business_dispatch', 'av_pilot');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'ops'
      AND t.typname = 'order_domain_t'
  ) THEN
    CREATE TYPE ops.order_domain_t AS ENUM ('owned', 'forwarded');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'ops'
      AND t.typname = 'order_source_t'
  ) THEN
    CREATE TYPE ops.order_source_t AS ENUM ('phone', 'web', 'app', 'api', 'concierge', 'external_platform');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'ops'
      AND t.typname = 'dispatch_semantics_t'
  ) THEN
    CREATE TYPE ops.dispatch_semantics_t AS ENUM ('realtime', 'reservation', 'queue', 'forwarder_broadcast');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'ops'
      AND t.typname = 'dispatch_mode_t'
  ) THEN
    CREATE TYPE ops.dispatch_mode_t AS ENUM ('realtime', 'reservation', 'queue', 'forwarder');
  END IF;
END$$;

DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'ops'
          AND t.typname = 'order_status_t'
      ) THEN
        CREATE TYPE ops.order_status_t AS ENUM (
  'draft', 'created', 'classified', 'ready_for_dispatch', 'preassigned',
  'assigned', 'driver_accepted', 'enroute_pickup', 'arrived_pickup',
  'trip_started', 'trip_in_progress', 'proof_pending', 'completed',
  'cancelled', 'no_show', 'redispatch_required', 'exception_hold'
);
      END IF;
    END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'ops'
      AND t.typname = 'dispatch_job_status_t'
  ) THEN
    CREATE TYPE ops.dispatch_job_status_t AS ENUM ('pending', 'matching', 'offered', 'reserved', 'queued', 'assigned', 'accepted', 'failed', 'redispatching', 'closed');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'ops'
      AND t.typname = 'dispatch_attempt_status_t'
  ) THEN
    CREATE TYPE ops.dispatch_attempt_status_t AS ENUM ('offered', 'accepted', 'rejected', 'expired', 'failed');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'ops'
      AND t.typname = 'trip_status_t'
  ) THEN
    CREATE TYPE ops.trip_status_t AS ENUM ('created', 'enroute_pickup', 'arrived_pickup', 'started', 'in_progress', 'proof_pending', 'completed', 'cancelled', 'aborted');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'ops'
      AND t.typname = 'occupancy_status_t'
  ) THEN
    CREATE TYPE ops.occupancy_status_t AS ENUM ('empty', 'to_pickup', 'with_passenger', 'unknown');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'crm'
      AND t.typname = 'call_type_t'
  ) THEN
    CREATE TYPE crm.call_type_t AS ENUM ('booking', 'complaint', 'callback', 'lost_and_found', 'general_inquiry');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'crm'
      AND t.typname = 'case_source_t'
  ) THEN
    CREATE TYPE crm.case_source_t AS ENUM ('phone', 'web', 'app', 'portal', 'internal');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'crm'
      AND t.typname = 'case_severity_t'
  ) THEN
    CREATE TYPE crm.case_severity_t AS ENUM ('low', 'medium', 'high', 'critical');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'crm'
      AND t.typname = 'case_status_t'
  ) THEN
    CREATE TYPE crm.case_status_t AS ENUM ('new', 'accepted', 'under_investigation', 'waiting_external_reply', 'proposed_resolution', 'resolved', 'closed', 'reopened');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'billing'
      AND t.typname = 'invoice_status_t'
  ) THEN
    CREATE TYPE billing.invoice_status_t AS ENUM ('draft', 'issued', 'paid', 'voided', 'overdue');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'billing'
      AND t.typname = 'statement_status_t'
  ) THEN
    CREATE TYPE billing.statement_status_t AS ENUM ('draft', 'generated', 'approved', 'paid');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'billing'
      AND t.typname = 'reimbursement_status_t'
  ) THEN
    CREATE TYPE billing.reimbursement_status_t AS ENUM ('draft', 'approved', 'paid', 'rejected');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'admin'
      AND t.typname = 'report_status_t'
  ) THEN
    CREATE TYPE admin.report_status_t AS ENUM ('queued', 'running', 'completed', 'failed', 'expired');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'admin'
      AND t.typname = 'package_type_t'
  ) THEN
    CREATE TYPE admin.package_type_t AS ENUM ('filing', 'monthly_report', 'audit_request');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'admin'
      AND t.typname = 'package_status_t'
  ) THEN
    CREATE TYPE admin.package_status_t AS ENUM ('queued', 'running', 'completed', 'failed');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'admin'
      AND t.typname = 'public_info_status_t'
  ) THEN
    CREATE TYPE admin.public_info_status_t AS ENUM ('draft', 'published', 'retired');
  END IF;
END$$;
