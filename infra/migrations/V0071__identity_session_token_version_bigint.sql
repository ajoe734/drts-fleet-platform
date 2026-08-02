-- Converge pre-existing V0070 installations onto bigint-backed token versions.
-- V0070 stored token_version as integer, but session issuance persists
-- millisecond Date.parse values. bigint keeps existing semantics while
-- preventing overflow on every real session write.

ALTER TABLE iam.identity_sessions
  ALTER COLUMN token_version TYPE bigint
  USING token_version::bigint;
