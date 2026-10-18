-- Keep an accepted callback action recoverable on its existing task row.
-- Legacy tasks retain null receipt fields; no past consent/command is invented.
ALTER TABLE voice.callback_task
  ADD COLUMN IF NOT EXISTS create_command_id uuid,
  ADD COLUMN IF NOT EXISTS create_action_key text,
  ADD COLUMN IF NOT EXISTS create_payload_hash varchar(64);

CREATE UNIQUE INDEX IF NOT EXISTS uq_voice_callback_create_action
  ON voice.callback_task (create_action_key)
  WHERE create_action_key IS NOT NULL;
