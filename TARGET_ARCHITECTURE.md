# Target Architecture

Status: seed architecture draft for multi-LLM review. This file does not override the canonical Phase 1 specs.

## Summary

This is the current architecture proposal for discussion. Phase 1 is still expected to be implemented as a single monorepo with multiple client surfaces and a modular backend host, but the proposal must survive the multi-LLM consensus workflow before it becomes the basis for task execution.

## 1. Runtime Shape

- Monorepo: `pnpm` workspace + `turbo`
- Web surfaces: Next.js apps for tenant portal, platform admin, and ops console
- Mobile surface: Expo React Native driver app
- Backend host: NestJS API
- Data plane: PostgreSQL for OLTP, Redis for cache/ephemeral coordination, S3-compatible object storage for artifacts
- Collaboration plane: local supervisor, dashboard, and LLM status system

## 2. Backend Domain Boundaries

The backend should converge on the following bounded domains inside the current API host:

1. identity
2. tenant-partner
3. regulatory-registry
4. product-rule
5. order
6. dispatch
7. forwarder
8. driver-task
9. callcenter
10. complaint
11. billing-settlement
12. reporting-filing
13. audit-notification

Current implementation stance:

- one NestJS host
- one module boundary per domain
- shared contracts package for DTOs, API envelopes, and event envelopes
- no direct cross-domain database writes from UI surfaces

## 3. Repo Mapping

### Existing apps

- `apps/api`: backend host and module boundary home
- `apps/tenant-portal-web`: **RETIRED (SUNSET-001-tenant-portal-web, 2026-04-15)** — frozen reference shell, not a production target. The production tenant UI is `tenant-commute-hub` (external repo). See `docs/02-architecture/authority/fbp-007-tenant-portal-web-sunset.md`.
- `apps/platform-admin-web`: governance, pricing, regulatory, and filing UI
- `apps/ops-console-web`: dispatch, callcenter, incidents, complaints, and reports UI
- `apps/driver-app`: human-driver fulfillment UI

### Shared packages

- `packages/contracts`: canonical TypeScript contracts and envelopes
- `packages/shared-types`: low-risk cross-surface helper types only
- `packages/shared-test-fixtures`: stable fixtures and scenario helpers
- `packages/ui-web`: shared web shell components only
- `packages/eslint-config`, `packages/tsconfig`: repo tooling baselines

### Infra landing zones

- `infra/migrations`: reviewed SQL migrations that the repo adopts as its executable source of truth
- `infra/seeds`: reviewed seed packs and import templates
- `phase1_db_migration_extracted/`: imported reference bundle, not the final long-term canonical execution path

## 4. Contract and Data Rules

- SQL migration files are the schema source of truth
- `Prisma` remains a placeholder and must not become the schema authority
- all timestamps are stored in UTC and exposed as RFC3339
- API commands use explicit endpoints and idempotency keys
- audit, dispatch trace, complaint timeline, webhook delivery, and dispatch attempts stay append-only
- signed download URLs are short-lived and audited
- field masking happens in backend responses, not only in the UI

## 5. Product Hard Rules Preserved In Architecture

- `owned` and `forwarded` remain separate domains
- Phase 1 formal service buckets remain `standard_taxi` and `business_dispatch`
- `av_pilot` is preserved only as a future extension concept
- `business_dispatch` subtypes remain `credit_card_airport_transfer` and `enterprise_dispatch`
- forwarded orders never enter owned dispatch assignment flow

## 6. Activation Path

### Before consensus

- architecture, contracts, repo layout, landing zones, and work breakdown are built directly
- no implementation slice is delegated through supervisor yet

### After consensus

- work packages align to the bounded domains above
- supervisor tasks are created from `DEVELOPMENT_WORKBREAKDOWN.md`
- owner and reviewer assignment follows the collaboration guide
