-- Fleet supply onboarding uses canonical fleet-partner IDs such as
-- `fleet-demo-001`, not UUIDs. The original V0034 skeleton declared those
-- foreign-reference columns as uuid, which causes create-driver/create-vehicle
-- persistence to fail with invalid input syntax for type uuid.

ALTER TABLE fleet.supply_submissions
  ALTER COLUMN fleet_partner_id TYPE text
  USING fleet_partner_id::text;

ALTER TABLE fleet.supply_documents
  ALTER COLUMN fleet_partner_id TYPE text
  USING fleet_partner_id::text;

ALTER TABLE fleet.vehicle_fleet_affiliations
  ALTER COLUMN fleet_partner_id TYPE text
  USING fleet_partner_id::text;
