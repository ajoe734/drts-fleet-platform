# Tenant Contracts — source of truth

Status: directive-required thin stub
Canonical artifact: `packages/contracts/src/`

This file does not redefine product semantics. It points reviewers to the current source of truth.

## Do not restate

Do not copy or reinterpret the canonical artifact here. Tenant booking, dispatch, driver, partner, billing, reporting, and platform-adapter contracts — including `costCenterCode` / `approvalEvaluationId` / `quotaUsageDelta` / `platformEarningsRef` and the related governance-aware billing identifiers — are declared in TypeScript under `packages/contracts/src/`. Architectural decisions live in `docs/02-architecture/`; the governance-aware billing field set lives in `docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md`.

## Current source of truth

- `packages/contracts/src/` (runtime contract declarations)
- `packages/contracts/README.md` (orientation)
- `docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md` (governance-aware field set)
- `docs/02-architecture/partner-eligibility-airport-transfer-spec-20260519.md` (partner eligibility / airport-transfer extension)
