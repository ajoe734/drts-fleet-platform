-- MAP-BE-006: add review lifecycle status for governed geometry publication.

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
