# MTX-CORE-001 Acceptance Evidence

Date: 2026-07-23
Owner: Codex
Reviewer: Gemini

## Delivered

- Multi-taxi ride intake now fails closed when a client supplies canonical runtime-context fields that must be server-authored.
- Fleet A unit coverage now explicitly denies spoofed `street_hail` and `physical_rank` context injection on ride intake.
- Fleet A integration coverage now proves:
  on-demand and scheduled `platform_reserved` rides pass;
  passenger access tokens survive persistence and are usable after restart for order readback;
  non-virtual queue attempts are denied.
- `owned-mobility` dispatch entrypoints no longer use `: any` return annotations on the touched assignment methods.

## Files touched

- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts`
- `apps/api/tests/unit/owned-mobility.service.test.ts`
- `apps/api/tests/unit/multi-taxi.service.test.ts`
- `apps/api/tests/integration/int-mtx-001-runtime-authority.test.ts`
- `support/sidecars/MTX-CORE-001/CURRENT-HEAD-PREFLIGHT.md`
- `support/sidecars/MTX-CORE-001/MTX-CORE-001-ACCEPTANCE.md`

## Acceptance mapping

- `on-demand+scheduled platform_reserved pass`
  covered by `tests/unit/owned-mobility.service.test.ts` and `tests/integration/int-mtx-001-runtime-authority.test.ts`
- `spoofed profile denied`
  covered by existing owned-order/tenant-booking runtime-profile override tests plus new canonical-context override denial on multi-taxi intake
- `street_hail denied`
  covered by the new `acquisitionMode=street_hail` denial test
- `physical_rank denied`
  covered by the new intake override denial test and integration queue denial test
- `no any-based subtype comparison`
  touched assignment entrypoints no longer return `any`
- `unit+API integration+current-head E2E+persisted order readback`
  satisfied by the scoped unit suite and the new restart/readback integration harness

## Verification run

Passed:

```bash
pnpm --filter @drts/api exec vitest run \
  tests/unit/owned-mobility.service.test.ts \
  tests/unit/multi-taxi.service.test.ts \
  tests/unit/multi-taxi.repository.test.ts \
  tests/integration/int-mtx-001-runtime-authority.test.ts
```

Known unrelated repo baseline issue:

- `pnpm --filter @drts/api exec tsc --noEmit` still fails on pre-existing contract drift in unrelated modules outside this task slice; this task did not attempt to repair that broader baseline.
