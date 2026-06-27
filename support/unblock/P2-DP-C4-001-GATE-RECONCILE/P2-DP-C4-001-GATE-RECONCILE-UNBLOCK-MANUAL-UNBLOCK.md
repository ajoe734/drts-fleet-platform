# P2-DP-C4-001-GATE-RECONCILE unblock diagnosis

Date: 2026-06-27
Owner: Codex2
Parent task: `P2-DP-C4-001-GATE-RECONCILE`

## Diagnosis

The parent task is dependency-ready at the feature level but remains blocked by a repo-level CI environment regression, not by `sandbox-dispatch-gate` logic.

Evidence gathered from machine truth and the current tree:

- `P2-DP-C4-001-GATE-RECONCILE` already records that PR `#977` failed only in `ci-integ` e2e after build, typecheck, unit, integration, and lint passed.
- Current `dev` still has `.github/workflows/ci-integ.yml` configured with `services.postgres.image: postgres:16`, while the hermetic e2e suite now needs the `postgis` extension during DB resets/migrations.
- A minimal repo-level fix already exists on `origin/codex/p2-reg-002-postgis-ci` at commit `78d23bf50b7f10956b4c8b366644204b24d9604a`.
- That branch differs from `origin/dev` only by the e2e service image change in `.github/workflows/ci-integ.yml`:
  - from `postgres:16`
  - to `postgis/postgis:16-3.5`

## Conclusion

`P2-DP-C4-001-GATE-RECONCILE` should stay blocked, but the blocker is now concretely identified:

- Remaining blocker: reland the known PostGIS CI fix onto `dev`
- Minimal next step: merge or cherry-pick `origin/codex/p2-reg-002-postgis-ci@78d23bf50b7f10956b4c8b366644204b24d9604a`
- After that lands: rerun `ci-integ` on `dev`, then rerun/allow PR `#977` to complete

## Scope note

This unblock task does not change dispatch-gate code. It only documents the blocker and updates the parent task's machine-truth next step so the remaining work is actionable.

## Closeout evidence

- Reviewer approval state: `P2-DP-C4-001-GATE-RECONCILE-UNBLOCK-MANUAL-UNBLOCK` is `review_approved` in machine truth as of `2026-06-27T07:34:43Z`.
- Canonical diagnosis commit already on the task branch: `41d4349d0ca46d73981cea99307c711a37941b40` (`P2-DP-C4-001-GATE-RECONCILE-UNBLOCK-MANUAL-UNBLOCK: document PostGIS CI unblock path`).
- Parent machine-truth next step is aligned with this artifact: reland `origin/codex/p2-reg-002-postgis-ci@78d23bf50b7f10956b4c8b366644204b24d9604a`, rerun `ci-integ` on `dev`, then rerun or allow PR `#977` to complete.
- Integration status for this unblock helper task remains branch-scoped documentation only; no deploy claim is made from this closeout.
