-- V0039 — Allow versioned sandbox governance records to coexist by logical ID.
--
-- Replaces single-column primary keys from V0038 with composite (logical_id, version)
-- keys so historical rows survive later updates.

ALTER TABLE av_sandbox.approved_operating_areas
  DROP CONSTRAINT IF EXISTS approved_operating_areas_pkey;

ALTER TABLE av_sandbox.approved_operating_areas
  ADD CONSTRAINT approved_operating_areas_pkey PRIMARY KEY (area_id, version);

ALTER TABLE av_sandbox.approved_routes
  DROP CONSTRAINT IF EXISTS approved_routes_pkey;

ALTER TABLE av_sandbox.approved_routes
  ADD CONSTRAINT approved_routes_pkey PRIMARY KEY (route_id, version);

ALTER TABLE av_sandbox.vehicle_enrollments
  DROP CONSTRAINT IF EXISTS vehicle_enrollments_pkey;

ALTER TABLE av_sandbox.vehicle_enrollments
  ADD CONSTRAINT vehicle_enrollments_pkey PRIMARY KEY (enrollment_id, version);

ALTER TABLE av_sandbox.safety_operator_qualifications
  DROP CONSTRAINT IF EXISTS safety_operator_qualifications_pkey;

ALTER TABLE av_sandbox.safety_operator_qualifications
  ADD CONSTRAINT safety_operator_qualifications_pkey PRIMARY KEY (qualification_id, version);
