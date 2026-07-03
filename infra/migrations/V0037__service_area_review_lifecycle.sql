-- MAP-BE-006: add review lifecycle status for governed geometry publication.
-- Long-lived dev databases may contain pre-lifecycle status labels from older
-- prototypes. Normalize them before adding strict contract constraints.

UPDATE ops.service_area_boundaries
SET status = CASE
    WHEN status IN ('draft', 'review', 'active', 'retired') THEN status
    WHEN status IN ('pending_review', 'in_review', 'submitted', 'awaiting_review') THEN 'review'
    WHEN status IN ('published', 'enabled') THEN 'active'
    WHEN status IN ('archived', 'disabled', 'inactive') THEN 'retired'
    ELSE 'draft'
  END;

UPDATE ops.service_area_boundaries
SET record = jsonb_set(record, '{status}', to_jsonb(status), true)
WHERE jsonb_typeof(record) = 'object';

UPDATE ops.stop_policies
SET status = CASE
    WHEN status IN ('draft', 'review', 'active', 'retired') THEN status
    WHEN status IN ('pending_review', 'in_review', 'submitted', 'awaiting_review') THEN 'review'
    WHEN status IN ('published', 'enabled') THEN 'active'
    WHEN status IN ('archived', 'disabled', 'inactive') THEN 'retired'
    ELSE 'draft'
  END;

UPDATE ops.stop_policies
SET record = jsonb_set(record, '{status}', to_jsonb(status), true)
WHERE jsonb_typeof(record) = 'object';

ALTER TABLE ops.service_area_boundaries
  DROP CONSTRAINT IF EXISTS service_area_boundaries_status_check;

ALTER TABLE ops.service_area_boundaries
  ADD CONSTRAINT service_area_boundaries_status_check
  CHECK (status IN ('draft', 'review', 'active', 'retired'));

ALTER TABLE ops.stop_policies
  DROP CONSTRAINT IF EXISTS stop_policies_status_check;

ALTER TABLE ops.stop_policies
  ADD CONSTRAINT stop_policies_status_check
  CHECK (status IN ('draft', 'review', 'active', 'retired'));
