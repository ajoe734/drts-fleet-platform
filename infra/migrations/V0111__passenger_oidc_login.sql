-- PAX-OIDC-LOGIN-20261009. Server-held OIDC/OAuth transaction state for the
-- passenger app's /auth/oauth/{provider}/start and .../callback exchange.
-- The client only ever carries the opaque transaction_id; state/nonce/PKCE
-- material never round-trips through the browser or BFF.
BEGIN;

CREATE TABLE passenger.oauth_transactions (
  transaction_id uuid PRIMARY KEY,
  provider varchar(10) NOT NULL CHECK (provider IN ('google', 'facebook', 'line')),
  purpose varchar(10) NOT NULL CHECK (purpose IN ('login', 'link')),
  -- Client echoes the plaintext state from the provider redirect; we only ever
  -- need equality, never the raw value back, so it is hashed at rest.
  state_hash varchar(64) NOT NULL CHECK (state_hash ~ '^[0-9a-f]{64}$'),
  nonce varchar(128) NOT NULL,
  -- Raw PKCE verifier: required to complete the real token exchange with the
  -- provider, which validates sha256(code_verifier) == code_challenge itself.
  code_verifier varchar(128) NOT NULL,
  code_challenge varchar(128) NOT NULL,
  redirect_uri varchar(2048) NOT NULL,
  -- Set only for purpose='link', captured from the caller's own passenger
  -- Bearer session at /start time so /callback never needs to trust a
  -- client-supplied account id.
  drts_passenger_id varchar(100) REFERENCES passenger.accounts(drts_passenger_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  CHECK (expires_at > created_at),
  CHECK ((purpose = 'link') = (drts_passenger_id IS NOT NULL))
);
CREATE UNIQUE INDEX passenger_oauth_transactions_state_hash_uq
  ON passenger.oauth_transactions(state_hash);
CREATE INDEX passenger_oauth_transactions_expires_idx
  ON passenger.oauth_transactions(expires_at);

COMMIT;
