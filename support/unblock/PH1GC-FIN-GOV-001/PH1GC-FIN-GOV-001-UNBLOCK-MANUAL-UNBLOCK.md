# PH1GC-FIN-GOV-001 Manual Unblock

## Scope

- Task: `PH1GC-FIN-GOV-001-UNBLOCK-MANUAL-UNBLOCK`
- Parent: `PH1GC-FIN-GOV-001`
- Owner: `Codex`
- Reviewer: `Codex2`
- Audit date: `2026-05-22`

## Diagnosis

`PH1GC-FIN-GOV-001` is not blocked by the spec/UAT documents anymore.
Those two artifacts are already visible on `origin/dev` via commit
`6607dea8b788ef2ab6f01a2ab14c6dbd8ab48e21`:

- `docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md`
- `docs/04-uat/governance-aware-billing-reporting-uat-20260519.md`

The remaining blocker is the acceptance chain after those docs:

1. `PH1GC-E2E-010` has not been materialized on a PH1GC delivery branch or on
   `origin/dev`.
   - `ai-status.json` still keeps `PH1GC-E2E-010` in `backlog`, owned by
     `Codex`, and formally dependent on `PH1GC-FIN-GOV-001`.
   - The reusable earlier-wave implementation already exists at
     `origin/claude2/wf-fin-gov-001-e2e` commit
     `ddc02c4e24ecf924e83d47f0cc86c1c21ce223f6`, but that branch has not been
     adopted into the PH1GC task chain.
2. `PH1GC-MATRIX-002` already has branch-scoped closeout evidence, but that
   does not satisfy the parent acceptance yet.
   - `ai-status.json` marks `PH1GC-MATRIX-002` as `done` with commit
     `07b3a245a87a93fbea09c806e8a7ea5c085d3df5` on
     `origin/codex2/ph1gc-matrix-002`.
   - That branch contains the `E2E-010` row in
     `docs/04-uat/fbp-014a-e2e-matrix.md`, but the file is not updated on
     `origin/dev`, and the task still formally depends on `PH1GC-E2E-010`.
3. Even after the repo-local E2E/matrix chain lands, the release-gate uplift is
   still short of the parent's current acceptance wording.
   - The candidate `WF-FIN-GOV-001` row on
     `origin/codex2/ph1gc-matrix-001` sets the gate read to
     `PASS (repo-local)`, not `PASS (live staging evidence)`.
   - That same row explicitly says the uplift to `PASS (live staging evidence)`
     requires a staging run against real `WF-TGV-001` data.
4. The current live-evidence anchor on `origin/dev` still records that the
   governance-aware finance uplift is blocked externally.
   - `support/sidecars/FIN-GOV-001/FIN-GOV-001-EVIDENCE-PACK.md` says the
     governance-aware sub-slice is "not yet elevated to PASS (live staging
     evidence)" and documents the concrete blocker as unavailable non-interactive
     IAP credentials / no usable direct Cloud Run fallback for the staging rerun.

## Remaining Blocker

The parent is therefore blocked on two distinct surfaces:

1. Repo-local delivery gap:
   `PH1GC-E2E-010` still needs a real PH1GC implementation branch that brings
   `tests/e2e/E2E-010-governance-aware-billing-reporting.sh` onto the current
   gap-closure chain, after which `PH1GC-MATRIX-002` must be replayed or
   re-verified on top so the E2E matrix update is truthful on `origin/dev`.
2. Live-staging evidence gap:
   the current matrix candidate and evidence pack only justify
   `PASS (repo-local)` plus a future live uplift, while the parent acceptance
   still expects `WF-FIN-GOV-001 = PASS (live staging evidence)`.

## Parent Resume Sequence

1. `Codex` should lift
   `origin/claude2/wf-fin-gov-001-e2e@ddc02c4e24ecf924e83d47f0cc86c1c21ce223f6`
   into the PH1GC chain for `PH1GC-E2E-010`, preserving the 13-field
   assertions and hard-fail-on-missing-seed behavior.
2. `Codex2` should then replay or re-verify
   `origin/codex2/ph1gc-matrix-002@07b3a245a87a93fbea09c806e8a7ea5c085d3df5`
   so `docs/04-uat/fbp-014a-e2e-matrix.md` lands with the `E2E-010` /
   `WF-FIN-GOV-001` row on the same delivery path.
3. After the repo-local chain is merged, `Codex2` should not close
   `PH1GC-FIN-GOV-001` by claiming `PASS (live staging evidence)` unless a
   fresh staging rerun exists; the current `WF-FIN-GOV-001` matrix candidate is
   only `PASS (repo-local)`.
4. If the parent acceptance keeps the live-staging requirement, the remaining
   work is a staging evidence pass that captures reviewer-readable proof for the
   governance-aware 13-field body and uplifts `WF-FIN-GOV-001` from
   `PASS (repo-local)` to `PASS (live staging evidence)`.

## Conclusion

This helper does not unblock the parent by changing product code. It narrows
the blocker to a specific resume path:

- first adopt the existing `WF-FIN-GOV-001-E2E` implementation into
  `PH1GC-E2E-010`
- then replay the `PH1GC-MATRIX-002` E2E matrix row on the same chain
- then either supply fresh live staging evidence for `WF-FIN-GOV-001` or keep
  the parent blocked on that external evidence gap

## Delivery Evidence

- Diagnosis artifact branch: `codex/ph1gc-fin-gov-001-unblock-manual-unblock`
- Diagnosis artifact PR: `#243` against `dev`
- Initial diagnosis commit already on the task branch:
  `a6578bf59338fe2eb2c1419782ed6a3a64b976e3`
- Canonical machine truth was updated so `PH1GC-FIN-GOV-001.next` points to the
  same resume sequence captured above: adopt
  `origin/claude2/wf-fin-gov-001-e2e@ddc02c4`, replay
  `origin/codex2/ph1gc-matrix-002@07b3a245`, then keep the parent blocked until
  fresh `WF-FIN-GOV-001` live-staging evidence exists
