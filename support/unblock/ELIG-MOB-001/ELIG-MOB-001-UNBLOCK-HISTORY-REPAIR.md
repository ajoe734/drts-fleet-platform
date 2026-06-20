# ELIG-MOB-001 Unblock History Repair

## Scope

- Task: `ELIG-MOB-001-UNBLOCK-HISTORY-REPAIR`
- Parent: `ELIG-MOB-001`
- Owner: `Codex2`
- Reviewer: `Codex`
- Audit timestamp: `2026-06-20T06:00:00Z`

## Diagnosis

`ELIG-MOB-001` is blocked by two separate, concrete issues:

1. The parent owner branch `origin/codex2/elig-mob-001` contains the correct
   mobile diff, but its two commits use legacy subjects that fail the current
   trailer gate:
   - `17bbe3b6fe5f0d928953493c0e56f968bb9f2909`
     `feat(ELIG-MOB-001): show exact driver service product`
   - `ceea0bafc0c90f54aae702917d7291f8e21f9ca7`
     `closeout(ELIG-MOB-001): finalize exact product label`
2. Even if that branch is rebuilt non-destructively, current `origin/dev`
   still cannot typecheck the mobile diff because commit
   `eadba376d3e2a2c71bffea60150d6b0a8bd8939d`
   (`SUP-BE-002: add supply submission repository persistence (#793)`)
   removed `serviceProductCode` and related eligibility fields from
   `packages/contracts/src/index.ts`, so `OwnedOrderRecord` on trunk no longer
   matches the field usage introduced by `ELIG-MOB-001`.

This means the parent is blocked by:

- branch/commit history contamination on the mobile owner rail, and
- a dependency regression on `dev` that must be repaired before a clean mobile
  re-land can pass smoke acceptance.

## Evidence

### Parent branch / PR evidence

- `origin/dev @ eadba376d3e2a2c71bffea60150d6b0a8bd8939d`
- `origin/codex2/elig-mob-001 @ ceea0bafc0c90f54aae702917d7291f8e21f9ca7`
- PR `#794`
  <https://github.com/ajoe734/drts-fleet-platform/pull/794>
  targets `codex2/elig-mob-001 -> dev`
- `git log --oneline origin/dev..origin/codex2/elig-mob-001` shows exactly:
  - `ceea0bafc closeout(ELIG-MOB-001): finalize exact product label`
  - `17bbe3b6f feat(ELIG-MOB-001): show exact driver service product`
- `gh pr view 794 --json statusCheckRollup,commits` shows:
  - failed `Commit trailers`
  - failed `Smoke acceptance`

### Helper task branch / PR evidence

- current owner rail:
  `origin/codex2/elig-mob-001-unblock-history-repair @ d0c1b93cdf9a9e3c085dab5d56be0552112c3d55`
- helper PR `#796`
  <https://github.com/ajoe734/drts-fleet-platform/pull/796>
  targets `codex2/elig-mob-001-unblock-history-repair -> dev`
- this helper rail exists only to carry the unblock diagnosis and the
  non-destructive re-land plan; it does not mutate the parent task branch

### Trailer-gate failure evidence

- `scripts/git/check_commit_trailers.py` accepts only:
  - `<TASK-ID>: <summary>`
  - `wip(<TASK-ID>): <summary>`
- The CI log for Actions run `27861532302` reports:
  - commit `ceea0bafc0c9` rejected because subject was
    `closeout(ELIG-MOB-001): finalize exact product label`
  - commit `17bbe3b6fe5f` rejected because subject was
    `feat(ELIG-MOB-001): show exact driver service product`

### Dependency regression evidence

- `git show eadba376d -- packages/contracts/src/index.ts` removes:
  - `serviceProductId?: string | null;`
  - `serviceProductCode?: ServiceProductType | null;`
  - `serviceProductVersion?: string | null;`
  - `eligibilityPolicyVersion?: string | null;`
  from `OwnedOrderRecord`, `BookingRecord`, `DispatchCandidate`,
  `DispatchJobRecord`, `DispatchAssignmentRecord`, and `DriverTaskRecord`
- `git show 113180eb6:packages/contracts/src/index.ts` still contains those
  fields
- `git show origin/dev:packages/contracts/src/index.ts` no longer contains
  `OwnedOrderRecord.serviceProductCode`
- The failed `Smoke acceptance` log for run `27861532302` reports:
  - `apps/driver-app/app/jobs.tsx(621,32): error TS2339: Property 'serviceProductCode' does not exist on type 'OwnedOrderRecord'.`
  - `apps/driver-app/app/trip.tsx(1022,38): error TS2339: Property 'serviceProductCode' does not exist on type 'OwnedOrderRecord'.`

## Exact Contamination

The parent branch itself is not mixed with unrelated file churn. Its net diff
against `origin/dev` is limited to four driver-app files:

- `apps/driver-app/app/jobs.tsx`
- `apps/driver-app/app/trip.tsx`
- `apps/driver-app/lib/operational-labels.ts`
- `apps/driver-app/tests/unit/operational-labels.test.ts`

The contamination is specifically in branch history and integration context:

1. The branch carries two non-canonical commit subjects, so the existing PR can
   never satisfy the trailer gate without rewriting shared history.
2. The branch was validated against a dependency shape that no longer exists on
   current `dev`, because `SUP-BE-002` removed the exported contract fields the
   mobile diff relies on.

## Non-Destructive Repair Path

Do not force-push, rebase-in-place, or mutate `origin/codex2/elig-mob-001`.
Treat PR `#794` as audit evidence only.

1. Preserve `origin/codex2/elig-mob-001` and PR `#794` as the contaminated
   audit rail.
2. Repair the dependency regression first by reopening `ELIG-BE-002` or
   creating a focused follow-up branch from `origin/dev` that restores the
   removed `serviceProduct*` / `eligibilityPolicyVersion` fields in
   `packages/contracts/src/index.ts`.
3. After the dependency fix lands on `dev`, create a fresh branch from the new
   `origin/dev` tip, for example `codex2/elig-mob-001-reland`.
4. Reapply only the net mobile diff from
   `origin/dev..origin/codex2/elig-mob-001` onto that fresh branch, but squash
   it into one canonical closeout commit:

   `ELIG-MOB-001: exact service product label on driver task/trip cards`

   with trailers:
   - `LLM-Agent: codex2`
   - `Task-ID: ELIG-MOB-001`
   - `Reviewer: Codex`
   - `Verification: <commands>`
5. Push the new branch normally and open a replacement PR against `dev`.
6. Leave PR `#794` open only until the replacement PR exists, then close `#794`
   with a note pointing at the clean re-land PR.

## Current Unblocked Next Step

The concrete next step for parent `ELIG-MOB-001` is:

1. Restore the removed contract fields on `dev` first, because the parent
   cannot pass smoke acceptance until `OwnedOrderRecord.serviceProductCode`
   exists again on trunk.
2. Then re-land the mobile-only driver-app diff on a new clean branch with a
   canonical single-commit subject, instead of reusing PR `#794`.

## Why This Is Safe

- No existing shared branch is rewritten.
- No force-push is required.
- PR `#794` remains available as audit evidence for the original work.
- The dependency regression is repaired explicitly on trunk instead of hidden
  behind a mobile branch rewrite.
- The eventual mobile re-land branch can carry only the accepted task diff and
  a canonical commit message that satisfies CI.

## Verification Performed

- Read `AI_COLLABORATION_GUIDE.md`
- Read `.orchestrator/skills/worker-anchor-commit.md`
- Compared refs:
  - `git rev-parse HEAD`
  - `git rev-parse codex2/elig-mob-001`
  - `git rev-parse origin/dev`
  - `git rev-parse origin/codex2/elig-mob-001`
- Inspected ancestry and diff shape:
  - `git log --oneline HEAD..codex2/elig-mob-001`
  - `git diff --stat origin/dev..codex2/elig-mob-001`
  - `git diff --name-only a4ab66bad89cffbeecf7406f7505a75726421ef6..ceea0bafc0c90f54aae702917d7291f8e21f9ca7`
- Inspected commit subjects and trailers:
  - `git show --format=fuller --summary 17bbe3b6f`
  - `git show --format=fuller --summary ceea0bafc`
  - `sed -n '1,260p' scripts/git/check_commit_trailers.py`
- Inspected dependency regression:
  - `git show 113180eb6:packages/contracts/src/index.ts`
  - `git show eadba376d:packages/contracts/src/index.ts`
  - `git diff 113180eb6..eadba376d -- packages/contracts/src/index.ts`
  - `git blame -L 2348,2354 origin/dev -- packages/contracts/src/index.ts`
- Inspected GitHub evidence:
- `gh pr view 794 --json number,title,state,headRefName,baseRefName,url,commits,statusCheckRollup`
- `gh run view 27861532302 --log-failed`
- `git push -u origin codex2/elig-mob-001-unblock-history-repair`
- `gh pr create --base dev --head codex2/elig-mob-001-unblock-history-repair`
