# Local Development

## Purpose

This runbook describes the bootstrap development workflow only.

## First-time Setup

1. Use Node.js 22 and pnpm 10.
2. Copy `.env.example` to `.env` if local overrides are needed.
3. Run `pnpm install`.
4. Run `./scripts/dev-up.sh` to start PostgreSQL, Redis, and Mailpit.
5. Run `pnpm db:init` to apply the adopted Phase 1 migrations and seeds.

## Common Commands

- `pnpm dev:api`
- `pnpm dev:tenant`
- `pnpm dev:platform-admin`
- `pnpm dev:ops`
- `pnpm dev:driver`
- `./scripts/check.sh`
- `pnpm phase1:verify:backfill`
- `pnpm phase1:verify:uat`
- `pnpm phase1:verify:pilot`
- `pnpm phase1:verify:production`
- `pnpm db:migrate`
- `pnpm db:seed:reference`
- `pnpm db:seed:demo`
- `pnpm db:verify`

## Current Boundaries

- API now contains executable Phase 1 baseline slices, but a large part of the runtime is still being hardened in Wave 7 and Wave 8.
- Web and mobile surfaces still contain significant placeholder UI and incomplete integrations.
- The adopted SQL migrations and seeds are available locally, but repository-backed persistence and rollout-grade runtime behavior are still in progress.
