ALTER TABLE iam.driver_device_invitations
  ADD COLUMN onboarding_contact_hash text,
  ADD COLUMN activation_token_hash text;

CREATE UNIQUE INDEX driver_device_invitation_activation_token_idx
  ON iam.driver_device_invitations (activation_token_hash)
  WHERE activation_token_hash IS NOT NULL;

CREATE INDEX driver_device_invitation_onboarding_contact_idx
  ON iam.driver_device_invitations (onboarding_contact_hash, created_at DESC, invitation_id DESC)
  WHERE onboarding_contact_hash IS NOT NULL;
