-- V0098__sr_remittance_proof.sql
-- SR-PROOF-001: durable remittance-proof metadata/scan-lifecycle storage and
-- an idempotent payment receipt, replacing markReimbursementPaid's previous
-- bare, client-trusted remittanceProofId string.
--
-- Allocation authority: docs/04-uat/system-remediation-20260906/schema-allocation.json
-- (SR-RECOVERY-CONTRACTS-20260911, V0098 entry); table shape follows that
-- entry's invariants and packages/contracts/src/remittance-proof.ts.
--
-- Deviation from the allocation text: it describes batch_id as "uuid", but
-- the real billing.phase1_reimbursement_batches.batch_id column
-- (V0012__phase1_remaining_runtime_snapshots.sql) is varchar(100). Both
-- foreign keys below use varchar(100) to actually match the referenced
-- column's type.

CREATE TABLE IF NOT EXISTS billing.phase1_remittance_proofs (
  -- Server-generated only; no client-supplied identity column.
  proof_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Fixed at insert, never updated (no UPDATE ... SET batch_id path).
  batch_id varchar(100) NOT NULL
    REFERENCES billing.phase1_reimbursement_batches (batch_id),
  -- Denormalised from the batch at insert time for ownership checks
  -- without a join; the application layer must set this equal to the
  -- batch's driver_id, never to unvalidated client input.
  driver_id varchar(100) NOT NULL,
  uploaded_by_actor_id varchar(100) NULL,
  original_filename text NOT NULL,
  -- Immutable content identity, set once at insert; no UPDATE statement
  -- may target these three columns.
  content_hash text NOT NULL,
  content_type text NOT NULL,
  size_bytes bigint NOT NULL,
  -- The only columns a scan transition may write, alongside
  -- scan_completed_at/rejection_reason. UNIQUE (content_hash) is
  -- deliberately not applied -- the same physical file may legitimately be
  -- re-uploaded/re-referenced across distinct batches; dedupe is a future
  -- concern, not this migration's.
  scan_state text NOT NULL DEFAULT 'pending_scan'
    CHECK (scan_state IN ('pending_scan', 'clean', 'rejected')),
  scan_completed_at timestamptz NULL,
  rejection_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_remittance_proofs_batch_id
  ON billing.phase1_remittance_proofs (batch_id);

CREATE TABLE IF NOT EXISTS billing.phase1_remittance_proof_payment_receipts (
  receipt_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id varchar(100) NOT NULL
    REFERENCES billing.phase1_reimbursement_batches (batch_id),
  proof_id uuid NOT NULL
    REFERENCES billing.phase1_remittance_proofs (proof_id),
  idempotency_key text NOT NULL,
  driver_id varchar(100) NOT NULL,
  amount_minor bigint NOT NULL,
  currency varchar(10) NOT NULL,
  paid_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- The idempotency invariant: a retried mark-paid call with the same key
  -- on the same batch must read back this row instead of inserting a
  -- second one.
  CONSTRAINT uq_remittance_proof_payment_receipts_batch_key
    UNIQUE (batch_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_remittance_proof_payment_receipts_proof_id
  ON billing.phase1_remittance_proof_payment_receipts (proof_id);
