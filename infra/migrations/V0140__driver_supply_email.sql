ALTER TABLE fleet.driver_supply_drafts
  ADD COLUMN IF NOT EXISTS email text;
