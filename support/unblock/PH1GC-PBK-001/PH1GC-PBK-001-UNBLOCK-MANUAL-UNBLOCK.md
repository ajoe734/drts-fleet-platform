# PH1GC-PBK-001 Manual Unblock Note

Last updated: 2026-05-22
Task: `PH1GC-PBK-001-UNBLOCK-MANUAL-UNBLOCK`
Parent task: `PH1GC-PBK-001`
Owner: `Codex`
Reviewer: `Codex2`

## Summary

`PH1GC-PBK-001` is no longer blocked by `PH1GC-PARTNER-001`.
`PH1GC-PARTNER-001` is already `done`, and
`docs/02-architecture/partner-eligibility-airport-transfer-spec-20260519.md`
is present on `origin/dev` at `6607dea8b788ef2ab6f01a2ab14c6dbd8ab48e21`.

The remaining blocker is a split one:

1. repo-local `WF-PBK-001` artifacts are still missing on `origin/dev`
2. the actual pilot cutover proof still needs external partner-entry ownership,
   scheduling, and retention evidence

## What Is Already True

- `origin/dev` already contains the operational pilot runbook:
  `docs/03-runbooks/partner-booking-pilot-cutover-runbook-20260519.md`
- `origin/dev` already contains the dependency artifact from
  `PH1GC-PARTNER-001`:
  `docs/02-architecture/partner-eligibility-airport-transfer-spec-20260519.md`
- `origin/dev` does **not** contain:
  - `docs/03-runbooks/partner-booking-live-cutover-plan-20260519.md`
  - `docs/04-uat/partner-booking-pilot-uat-20260519.md`
  - `support/sidecars/PBK-PILOT-001/`

## Replayable Existing Work

The missing repo-local artifacts were already authored on pushed branches and
can be replayed without rewriting them from scratch:

- `origin/codex2/pbk-runbook-001` @
  `f9acf0603375ac335fbb42d375c521d411713f3f`
  provides `docs/03-runbooks/partner-booking-live-cutover-plan-20260519.md`
- fallback equivalent: `origin/codex/pbk-runbook-001` @
  `41f74331c7b36baf9f3808bb6689d283a89f1946`
- `origin/codex2/pbk-uat-001` @
  `50b517f1639f39a77f6f60ad12dc9234ebc977b3`
  provides `docs/04-uat/partner-booking-pilot-uat-20260519.md`

This means the parent task is not blocked because the plan/UAT have never been
designed. It is blocked because those artifacts were never replayed onto the
Phase 1 gap-closure delivery branch and therefore are still absent from
`origin/dev`.

## Actual Remaining External Gate

Even after replaying the repo-local plan/UAT artifacts, `PH1GC-PBK-001`
cannot close until one real partner entry supplies the pilot-evidence payload
required by directive section `3.4` and the accepted cutover topology:

- named `entrySlug` / partner entry
- named `cutoverOwner`
- named `rollbackOwner`
- scheduled pilot window / cohort
- rollback route
- monitoring dashboard or query anchor
- rollback retention window of at least `14` calendar days
- evidence pack under `support/sidecars/PBK-PILOT-001/` covering the workflow
  path and rollback-safe retention proof

Without those inputs, the matrix row for `WF-PBK-001` must remain below
`PASS (pilot evidence)`.

## Concrete Next Step For `PH1GC-PBK-001`

Parent owner `Codex2` should:

1. continue `codex2/ph1gc-pbk-001`
2. replay `f9acf0603375ac335fbb42d375c521d411713f3f` onto that branch to land
   `docs/03-runbooks/partner-booking-live-cutover-plan-20260519.md`
3. replay `50b517f1639f39a77f6f60ad12dc9234ebc977b3` (or the doc-creating
   commit on that branch) so
   `docs/04-uat/partner-booking-pilot-uat-20260519.md` lands with the plan
4. keep the parent blocked after the replay until the external pilot owner
   provides the named partner entry, cutover scheduling, and `PBK-PILOT-001`
   evidence needed for a real pilot proof

## Non-Claim

This unblock note does not claim that `WF-PBK-001` is already pilot-complete,
does not claim that `tenant-commute-hub` has been retired, and does not create
or backfill `PBK-PILOT-001` with repo-local-only evidence.
