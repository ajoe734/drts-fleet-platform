ALTER TABLE reporting.multi_taxi_electronic_receipts
  DROP CONSTRAINT IF EXISTS multi_taxi_electronic_receipts_order_id_key;

ALTER TABLE reporting.multi_taxi_electronic_receipts
  ADD COLUMN IF NOT EXISTS receipt_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_current boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS supersedes_receipt_id varchar(255) NULL,
  ADD COLUMN IF NOT EXISTS regeneration_idempotency_key varchar(255) NULL,
  ADD COLUMN IF NOT EXISTS regenerated_by_actor_id text NULL,
  ADD COLUMN IF NOT EXISTS regeneration_reason text NULL,
  ADD COLUMN IF NOT EXISTS regeneration_audit_id uuid NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'multi_taxi_receipt_supersedes_fk'
  ) THEN
    ALTER TABLE reporting.multi_taxi_electronic_receipts
      ADD CONSTRAINT multi_taxi_receipt_supersedes_fk
      FOREIGN KEY (supersedes_receipt_id)
      REFERENCES reporting.multi_taxi_electronic_receipts (receipt_id);
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS multi_taxi_receipt_current_order_uniq
  ON reporting.multi_taxi_electronic_receipts (order_id)
  WHERE is_current;

CREATE UNIQUE INDEX IF NOT EXISTS multi_taxi_receipt_order_version_uniq
  ON reporting.multi_taxi_electronic_receipts (order_id, receipt_version);

CREATE UNIQUE INDEX IF NOT EXISTS multi_taxi_receipt_regeneration_idem_uniq
  ON reporting.multi_taxi_electronic_receipts (regeneration_idempotency_key)
  WHERE regeneration_idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS multi_taxi_receipt_supersedes_idx
  ON reporting.multi_taxi_electronic_receipts (supersedes_receipt_id);
