-- Persist the callback attempt details already present in the application.
ALTER TABLE voice.callback_attempt
  ADD COLUMN IF NOT EXISTS dial_operation_key text,
  ADD COLUMN IF NOT EXISTS dial_status varchar(20),
  ADD COLUMN IF NOT EXISTS hangup_confirmed boolean,
  ADD COLUMN IF NOT EXISTS notes text;

UPDATE voice.callback_attempt
SET dial_status = CASE WHEN ended_at IS NULL THEN 'dialing' ELSE 'hung_up' END
WHERE dial_status IS NULL;

UPDATE voice.callback_attempt
SET hangup_confirmed = (ended_at IS NOT NULL)
WHERE hangup_confirmed IS NULL;

ALTER TABLE voice.callback_attempt
  ALTER COLUMN dial_status SET DEFAULT 'dialing',
  ALTER COLUMN dial_status SET NOT NULL,
  ALTER COLUMN hangup_confirmed SET DEFAULT false,
  ALTER COLUMN hangup_confirmed SET NOT NULL;

ALTER TABLE voice.callback_task
  ADD COLUMN IF NOT EXISTS cancellation_reason text;
