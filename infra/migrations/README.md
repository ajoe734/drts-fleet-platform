# Infra Migrations Landing Zone

This directory is the long-term repo landing zone for reviewed SQL migrations.

Current rule:

- imported reference migrations live in `phase1_db_migration_extracted/migrations/`
- once a migration set is reviewed and adopted for repo execution, it should converge here
- do not keep two competing schema sources of truth indefinitely

Until adoption is complete, treat the extracted bundle as imported reference material and this directory as the intended canonical execution path.
