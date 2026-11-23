CREATE TABLE fleet.driver_onboarding_deliveries (
  delivery_id uuid PRIMARY KEY,
  submission_id uuid NOT NULL REFERENCES fleet.supply_submissions(submission_id) ON DELETE CASCADE,
  invitation_id varchar(100) REFERENCES iam.driver_device_invitations(invitation_id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email', 'sms')),
  status text NOT NULL CHECK (status IN ('queued', 'sending', 'accepted', 'delivered', 'failed', 'uncertain', 'skipped', 'expired')),
  masked_recipient text,
  reason_code text,
  encrypted_payload text,
  expires_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz,
  lease_id uuid,
  lease_expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (submission_id, channel),
  CHECK (
    (status IN ('queued', 'sending')) = (encrypted_payload IS NOT NULL)
  ),
  CHECK (
    status NOT IN ('queued', 'sending') OR (invitation_id IS NOT NULL AND expires_at IS NOT NULL)
  ),
  CHECK (
    (status = 'sending') = (lease_id IS NOT NULL AND lease_expires_at IS NOT NULL)
  )
);

CREATE INDEX driver_onboarding_deliveries_due_idx
  ON fleet.driver_onboarding_deliveries (next_attempt_at, delivery_id)
  WHERE status = 'queued';

CREATE INDEX driver_onboarding_deliveries_lease_idx
  ON fleet.driver_onboarding_deliveries (lease_expires_at)
  WHERE status = 'sending';
