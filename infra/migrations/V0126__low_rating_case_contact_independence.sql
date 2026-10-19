-- COMPLAINT-CANONICAL-LIFECYCLE-AND-ACK-20261015, USER all-low-rating policy.
-- Record the old case requirement without inventing consent or backfilling CRM.
-- No default: every new writer must explicitly capture its case requirement.
BEGIN;

-- Separate provenance is necessary for ratings predating the entire consent row.
-- Post-migration writes capture the new policy even when a consent row is missing.
ALTER TABLE ops.passenger_trip_ratings ADD COLUMN low_rating_case_policy_v2 boolean;
UPDATE ops.passenger_trip_ratings SET low_rating_case_policy_v2 = false;
ALTER TABLE ops.passenger_trip_ratings
  ALTER COLUMN low_rating_case_policy_v2 SET NOT NULL,
  ALTER COLUMN low_rating_case_policy_v2 SET DEFAULT true;

ALTER TABLE passenger.rating_consents ADD COLUMN case_required boolean;
UPDATE passenger.rating_consents
SET case_required = (complaint_case_no IS NOT NULL);
ALTER TABLE passenger.rating_consents
  ALTER COLUMN case_required SET NOT NULL,
  DROP CONSTRAINT rating_consents_check,
  ADD CONSTRAINT rating_consents_case_required_check
    CHECK (case_required = (complaint_case_no IS NOT NULL));

ALTER TABLE ops.passenger_ride_rating_consents ADD COLUMN case_required boolean;
UPDATE ops.passenger_ride_rating_consents
SET case_required = (complaint_case_no IS NOT NULL);
ALTER TABLE ops.passenger_ride_rating_consents
  ALTER COLUMN case_required SET NOT NULL,
  DROP CONSTRAINT passenger_ride_rating_consents_check,
  ADD CONSTRAINT passenger_ride_rating_consents_case_required_check
    CHECK (case_required = (complaint_case_no IS NOT NULL)),
  ADD CONSTRAINT passenger_ride_rating_consents_low_score_case_check
    CHECK (NOT case_required OR rating_score <= 2);

-- All original ownership, FK, uniqueness, score and request-hash checks remain.
COMMIT;
