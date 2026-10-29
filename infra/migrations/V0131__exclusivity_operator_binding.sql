-- BUREAU-R02-EXCLUSIVE-OPERATOR-CHECK-20261024
-- Bind vehicle dispatch exclusivity records to a canonical dispatching operator ID
-- while preserving exclusiveProviderName as display text. Existing rows without
-- an operator ID remain NULL (unbound) and are blocked by runtime eligibility
-- until bound to an approved operator.

ALTER TABLE reg.dispatch_exclusivities
  ADD COLUMN IF NOT EXISTS exclusive_operator_id varchar(100) NULL;

ALTER TABLE reg.phase1_registry_exclusivities
  ADD COLUMN IF NOT EXISTS exclusive_operator_id varchar(100) NULL;

UPDATE reg.phase1_registry_exclusivities
SET exclusive_operator_id = NULLIF(btrim(record->>'exclusiveOperatorId'), '')
WHERE exclusive_operator_id IS NULL
  AND record ? 'exclusiveOperatorId';

CREATE INDEX IF NOT EXISTS idx_phase1_registry_exclusivities_operator_status
  ON reg.phase1_registry_exclusivities (exclusive_operator_id, review_status);
