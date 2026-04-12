-- V0001__bootstrap_extensions_and_schemas.sql
-- Phase 1 DB foundation bootstrap
-- Safe to rerun

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS reg;
CREATE SCHEMA IF NOT EXISTS ops;
CREATE SCHEMA IF NOT EXISTS crm;
CREATE SCHEMA IF NOT EXISTS billing;
CREATE SCHEMA IF NOT EXISTS admin;

CREATE TABLE IF NOT EXISTS admin.schema_migrations (
  version varchar(50) PRIMARY KEY,
  file_name varchar(255) NOT NULL,
  checksum varchar(128) NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin.seed_runs (
  seed_name varchar(100) PRIMARY KEY,
  file_name varchar(255) NOT NULL,
  checksum varchar(128) NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin.bootstrap_import_batches (
  batch_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_name varchar(100) NOT NULL,
  source_type varchar(50) NOT NULL,
  source_uri text,
  source_checksum varchar(128),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status varchar(30) NOT NULL DEFAULT 'draft',
  row_count integer NOT NULL DEFAULT 0,
  notes text
);

CREATE INDEX IF NOT EXISTS idx_bootstrap_import_batches_status
  ON admin.bootstrap_import_batches(status, started_at DESC);
