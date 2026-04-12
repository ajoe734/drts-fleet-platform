# Infra Seeds

This directory is now the repo-local canonical path for the adopted Phase 1 seeds and import templates.

Current status:

- `S0001__reference_seed.sql` and `S0002__demo_operational_seed.sql` are copied from the reviewed DB bundle
- `templates/` contains the CSV bootstrap templates used by the same seed/migration lineage
- `./scripts/db-seed.sh` loads these files and records seed runs

Rules:

- keep seeds aligned with the adopted migration set under `infra/migrations/`
- prefer additive seed revisions over silent edits when behavior meaningfully changes
- do not let copied templates drift from the accepted schema and import model without review
