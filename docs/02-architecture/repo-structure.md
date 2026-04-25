# Repo Structure

This repository uses a `pnpm` workspace with `turborepo`.

## Top-level Layout

- `apps/`: product-facing applications
- `packages/`: shared configuration, types, and UI
- `docs/`: project context, architecture notes, and runbooks
- `docs/02-architecture/consensus/phase1/`: multi-LLM readouts, review rounds, and consensus packet drafts
- `docs/02-architecture/consensus/phase1/starter-draft.md`: the single shared working draft owned by the current baton holder
- `docs/02-architecture/consensus/phase1/baton-log.md`: append-only ownership and round history
- `docs/02-architecture/consensus/phase1/supervisor-queue.md`: the current supervisor routing plan
- `infra/`: development infrastructure and GitHub-oriented placeholders
- `scripts/`: local automation entrypoints
- root Phase 1 reference files: SA, PRD, service contracts, migration plan, OpenAPI
- root collaboration and consensus docs: collaboration guide, canonical map, workflow, assignments, templates
- root seed design docs: target architecture, roadmap, work breakdown, decision ledger, open questions
- extracted Phase 1 reference bundles: `phase1_db_migration_extracted/`, `phase1_llm_dev_pack_extracted/`

## Applications

- `apps/api`: NestJS API bootstrap with a health endpoint placeholder
- `apps/tenant-portal-web`: Next.js legacy tenant portal reference shell retained under sunset; not a production tenant UI
- `apps/platform-admin-web`: Next.js platform administration placeholder shell
- `apps/ops-console-web`: Next.js operations console placeholder shell
- `apps/driver-app`: Expo Router native mobile driver app baseline

## Shared Packages

- `packages/contracts`: canonical TypeScript envelopes, enums, and DTO placeholders
- `packages/shared-types`: cross-surface placeholder types
- `packages/shared-test-fixtures`: stable acceptance and scenario fixture helpers
- `packages/eslint-config`: shared flat-config ESLint presets
- `packages/tsconfig`: shared TypeScript baselines
- `packages/ui-web`: minimal shared web UI placeholders

## API Structure Notes

- `apps/api/src/modules/README.md` documents the intended backend domain boundaries before feature modules are built out
- `infra/migrations/` and `infra/seeds/` are the repo landing zones for reviewed schema artifacts

When a new app or package is added, this document must be updated in the same change.
