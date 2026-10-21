-- Normal onboarding establishes a structural pair before a pickup ETA exists.
-- Preserve every existing numeric estimate and all matching eligibility rules.
ALTER TABLE reg.phase1_registry_supply_pairs
  ALTER COLUMN eta_minutes DROP NOT NULL;
