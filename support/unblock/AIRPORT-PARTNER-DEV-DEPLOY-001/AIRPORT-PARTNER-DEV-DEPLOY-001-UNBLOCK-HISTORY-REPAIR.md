# AIRPORT-PARTNER-DEV-DEPLOY-001 History Repair

Last updated: 2026-07-28
Task: `AIRPORT-PARTNER-DEV-DEPLOY-001-UNBLOCK-HISTORY-REPAIR`
Owner: `Codex`
Reviewer: `Codex2`

## Problem Summary

`AIRPORT-PARTNER-DEV-DEPLOY-001` is blocked partly because its working branch history is no longer a clean representation of the remaining deploy fix.

The shared branch `codex/airport-partner-dev-deploy-001` currently diverges from `origin/dev` as:

- merge-base: `ff304139a401685e8901cf27ee1b419cebefd929`
- `origin/dev` ahead by 2 commits:
  - `9e795f2963e5b48ec2f4881e49b565c89df66dae` `AIRPORT-PARTNER-UI-SMOKE-FIX-001: reconcile issuer credentials (#1175)`
  - `7586fe1e995341439b5351243069e3f7b99ca5a8` `AIRPORT-PARTNER-UI-SMOKE-FIX-001: retry Cloud Run CPU quota (#1176)`
- `codex/airport-partner-dev-deploy-001` ahead by 3 commits:
  - `0e1115da770b1ea2ba13bef9bac1f0c4330a685b` `wip(AIRPORT-PARTNER-DEV-DEPLOY-001): defer partner tracking fetch`
  - `dcb7fd8a4610407c0fd583fbdf5e29d1891cd226` `wip(AIRPORT-PARTNER-DEV-DEPLOY-001): forward partner embed api key`
  - `afc18031d1ae7450babd17571e4caf7de5cd90a8` `wip(AIRPORT-PARTNER-DEV-DEPLOY-001): record failed dev deploy evidence` (local only; remote head remains `dcb7fd8a4`)

Because the branch was shared and `origin/dev` has already moved, rebasing and force-pushing this branch would rewrite published history and is not acceptable.

## Exact Contamination

The blockage is not a single bad commit. It is the combination below.

### 1. Old base contamination

The branch still starts from `ff304139a`, while `dev` already contains `#1175` and `#1176`.

That means any new deploy attempt from `codex/airport-partner-dev-deploy-001` would carry:

- stale pre-merge history
- duplicate semantic changes already merged through other branches
- extra diff noise unrelated to the remaining unblock delta

### 2. Duplicate fix contamination

`git range-diff origin/dev...codex/airport-partner-dev-deploy-001 origin/dev...origin/codex/airport-partner-ui-smoke-fix-001` shows:

- `dcb7fd8a4` is functionally superseded by later commits on `codex/airport-partner-ui-smoke-fix-001`
- the equivalent merged path on `dev` is `ae82806a1` -> `e31eeb177` -> `406d95bde` -> `f35ddbf2f` and final merge `9e795f296`

So the parent branch contains a patch that should no longer be treated as canonical source for the fix.

### 3. Evidence/code mixing contamination

`afc18031d` adds only:

- `support/sidecars/AIRPORT-PARTNER-DEV-DEPLOY-001/AIRPORT-PARTNER-DEV-DEPLOY-001-EVIDENCE.md`

This evidence commit lives on the same execution branch as code changes. It is also local-only, so the local branch head differs from the published remote branch head. That makes the branch an unreliable source of truth for follow-up work or review.

### 4. Remaining unique delta is trapped in the contaminated branch

The only remaining functional change that is not already represented on `origin/dev` is `0e1115da7`.

That commit modifies only the embed-flow tracking repair surface:

- `apps/partner-booking-web/app/[tenantSlug]/program/embed/page.tsx`
- `apps/partner-booking-web/components/airport-transfer-site.tsx`
- `apps/partner-booking-web/lib/embed-airport-booking.ts`
- `apps/partner-booking-web/tests/integration/embed-airport-booking.test.ts`
- `apps/partner-booking-web/tests/integration/translations.test.ts`

Its purpose is to defer receipt/tracking fetch until the user enters tracking, instead of forcing immediate receipt fetch during booking submit.

## Non-Destructive Repair Path

Do not repair `codex/airport-partner-dev-deploy-001` in place.

Use this branch as historical evidence only, then continue from a fresh branch based on current `origin/dev`.

### Canonical next step

1. Create a fresh repair branch from `origin/dev`.
2. Cherry-pick only `0e1115da770b1ea2ba13bef9bac1f0c4330a685b`.
3. Resolve conflicts against the already-merged `#1175` / `#1176` state.
4. Keep evidence in sidecar/docs commits separate from the code fix branch head.
5. Open review from the fresh branch instead of trying to sanitize the old shared branch.

Suggested commands:

```bash
git fetch origin
git switch -c codex/airport-partner-dev-deploy-001-repair origin/dev
git cherry-pick 0e1115da770b1ea2ba13bef9bac1f0c4330a685b
```

If the evidence file from `afc18031d` is still needed on a branch, replay it as a separate commit after the code repair is settled, or leave it only in the sidecar history if already captured elsewhere.

## Why This Unblocks The Parent

This path avoids all destructive operations:

- no force-push
- no rebasing of a published shared branch
- no need to untangle merged duplicate commits in place

It narrows the parent task to one concrete action:

- re-home the still-useful `0e1115da7` patch onto current `origin/dev`, then rerun the dev deploy path from that fresh branch

## Evidence

- `git rev-list --left-right --count origin/dev...codex/airport-partner-dev-deploy-001` -> `2 3`
- merge-base `origin/dev` / `codex/airport-partner-dev-deploy-001` -> `ff304139a401685e8901cf27ee1b419cebefd929`
- remote head for shared branch -> `dcb7fd8a4610407c0fd583fbdf5e29d1891cd226`
- local-only evidence head -> `afc18031d1ae7450babd17571e4caf7de5cd90a8`
- `git range-diff` confirms `dcb7fd8a4` is superseded by the later UI smoke fix branch
