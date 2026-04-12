# Infra Migrations

This directory is now the repo-local canonical path for the adopted Phase 1 SQL migrations.

Current status:

- `V0001` through `V0010` are copied from the reviewed Phase 1 DB migration bundle.
- these files are the repo execution path used by `./scripts/db-apply.sh`
- the extracted bundle remains tracked as imported reference material and provenance, not the primary execution location

Rules:

- treat this directory as forward-only schema truth for local execution
- when a migration changes, add a new versioned file instead of rewriting already-adopted history
- keep `infra/seeds/` aligned with the schema revisions adopted here
