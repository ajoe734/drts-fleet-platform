-- Private-source sequence proposal; reconcile the number when adopting into Main.
-- The owned fare snapshot binds the optional normal Passenger service choice.
ALTER TABLE passenger.fare_quote_snapshots
  ADD COLUMN IF NOT EXISTS service_selection jsonb NULL;
