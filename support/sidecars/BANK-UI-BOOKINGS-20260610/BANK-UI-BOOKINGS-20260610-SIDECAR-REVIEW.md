# BANK-UI-BOOKINGS-20260610 Sidecar Review Packet

- Sidecar Task: `BANK-UI-BOOKINGS-20260610-SIDECAR-REVIEW`
- Sidecar Owner / Reviewer: `Codex` / `Claude2`
- Parent Task: `BANK-UI-BOOKINGS-20260610` — bank-console bookings list (`BK_Bookings`)
- Parent Owner / Reviewer: `Codex` / `Claude2`
- Helper Kind: `review_packet`
- Scope: support-only; no canonical-truth or runtime mutation
- Date: `2026-06-11`

## Purpose

This packet prepares reviewer handoff for the parent `/bookings` slice without
editing canonical truth or the parent implementation branch. It captures:

1. the parent task's live machine-truth state;
2. the exact parent implementation commit / worktree that must be reviewed;
3. the evidence already reproducible from that parent worktree; and
4. the review points that still require human judgment because the referenced
   `bank-screens-*.jsx` canvas files are absent from this repo snapshot.

## Scope Boundary

In scope:

- create only `support/sidecars/BANK-UI-BOOKINGS-20260610/BANK-UI-BOOKINGS-20260610-SIDECAR-REVIEW.md`
- summarize parent status, artifacts, and verification evidence
- hand off this packet to sidecar reviewer `Claude2`

Out of scope:

- editing `apps/bank-console-web/**`, `packages/**`, `docs/**`, or machine truth
- changing the parent task acceptance or `next` summary
- approving or rejecting the parent task itself

## Machine-Truth Anchors

### Sidecar task

`BANK-UI-BOOKINGS-20260610-SIDECAR-REVIEW` is recorded in machine truth as:

- owner=`Codex`
- reviewer=`Claude2`
- status=`review_approved`
- task_class=`sidecar`
- helper_parent=`BANK-UI-BOOKINGS-20260610`
- helper_kind=`review_packet`
- mutates_canonical=`false`
- depends_on=`CCAT-APP-SCAFFOLD-20260610`

### Parent task

`BANK-UI-BOOKINGS-20260610` is recorded in machine truth as:

- owner=`Codex`
- reviewer=`Claude2`
- status=`review_approved`
- depends_on=`CCAT-APP-SCAFFOLD-20260610`
- last_update=`2026-06-11T11:23:30Z`

Parent `next` currently claims:

- `/bookings` list implemented for `bank-console-web`
- zh-TW copy routed through central `t()`
- cardholder and benefit references masked
- program / direction / state / period / cardholder filters present
- issuer styling sourced from `@drts/ui-tokens`
- `pnpm --filter @drts/bank-console-web build` passed
- `pnpm --filter @drts/bank-console-web typecheck` passed after `.next/types`
  generation
- referenced `docs/05-ui/drts-design-canvas/bank-screens-*.jsx` files are absent
  in this worktree, so implementation followed
  `docs/05-ui/credit-card-airport-transfer-screen-requirements-20260610.md` §5.1
  plus existing bank shell / token rules

Implication:

- the parent is not closed out and has no `done`-level commit/push fields yet
- review should target the parent implementation branch, not this sidecar branch

## Parent Implementation Under Review

The parent implementation is not on this sidecar branch (`codex/bank-ui-bookings-20260610-sidecar-review`,
HEAD `ada56bea`, aligned with `origin/dev`). It lives in the separate local
worktree / branch:

- branch: `codex/bank-ui-bookings-20260610`
- worktree:
  `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-bank-ui-bookings-20260610`
- branch state: `ahead 1` of `origin/dev`
- implementation commit: `35051c815b9d4323d421cb067ac0f496af0760f5`
- subject: `BANK-UI-BOOKINGS-20260610: implement bank bookings screen`

`git show --stat 35051c81` reports four changed files:

- `apps/bank-console-web/app/bookings/page.tsx`
- `apps/bank-console-web/app/globals.css`
- `apps/bank-console-web/lib/bookings.ts`
- `apps/bank-console-web/lib/translations.ts`

No remote branch contains `35051c81` at packet time; `git branch -a --contains
35051c81` only reports local branch `codex/bank-ui-bookings-20260610`.

## Evidence Summary

### 1. Functional surface present in parent commit

`35051c81:apps/bank-console-web/app/bookings/page.tsx` replaces the placeholder
screen with a data table page that:

- reads `program`, `direction`, `state`, `period`, and `cardholder` from search
  params
- renders a read-only filter form for exactly those five filters
- shows list metrics for total / active / completed rows
- renders columns for order, cardholder, program, direction, flight/terminal,
  pickup-dropoff, time window, dispatch state, and masked benefit reference
- does not render a cost-centre column
- does not expose dispatch mutation controls

### 2. Data and masking are task-local, not borrowed from corporate tenant flow

`35051c81:apps/bank-console-web/lib/bookings.ts` introduces a local mock dataset
and filter helpers:

- `BookingDirection` = `outbound | inbound`
- `BookingState` = `assigned | en_route | completed | cancelled`
- `maskRef()` rewrites cardholder / benefit references to masked tokens
- `filterBookings()` implements all five acceptance filters

The sample rows include airport-specific fields required by the screen
requirements: program, direction, flight number, terminal, pickup, dropoff,
scheduled time, dispatch state, and masked benefit reference.

### 3. zh-TW primary copy stays in central translations

`35051c81:apps/bank-console-web/lib/translations.ts` adds all `/bookings`
strings to the app's central translation map instead of introducing inline
locale ternaries. The page consumes `t(...)` exclusively.

### 4. Token usage is split correctly between realm chrome and issuer identity

The parent page imports `BRAND_TEMPLATES.CTBC` from `@drts/ui-tokens` and maps
issuer-specific accents through CSS variables:

- `--issuer-primary`
- `--issuer-primary-dark`
- `--issuer-accent`
- `--issuer-soft`

The surrounding shell remains the `tenant` realm scaffold from the bank-console
shell. `35051c81:apps/bank-console-web/app/globals.css` adds page-body styles
for the bookings screen and documents that the page uses existing tenant-realm
colors plus token-derived issuer variables rather than inventing a separate
issuer palette in component code.

### 5. Design-canvas limitation is real and already acknowledged by the parent

The parent acceptance references
`docs/05-ui/drts-design-canvas/bank-screens-*.jsx`, but this worktree does not
contain those files. A `find docs/05-ui/drts-design-canvas ... | grep -Ei
'bank|booking|bookings'` scan only finds the partner-booking canvas files, not
bank console screens. The available authority in-tree is therefore:

- `docs/05-ui/credit-card-airport-transfer-screen-requirements-20260610.md` §5.1
- `packages/ui-tokens/src/realms.ts`
- `packages/ui-tokens/src/brands.ts`

Reviewer consequence:

- acceptance points about columns, filters, read-only behavior, masking, i18n,
  and token sourcing can be checked directly
- exact visual parity with `BK_*` canvas screens cannot be fully proven from the
  current repo snapshot and must be judged against the parent note above

## Verification Notes

The following checks were rerun from the parent implementation worktree at
`/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-bank-ui-bookings-20260610`.

| Check | Result | Note |
| --- | --- | --- |
| `pnpm --filter @drts/bank-console-web build` | `PASS` | Produces route output including dynamic `/bookings` |
| `pnpm --filter @drts/bank-console-web typecheck` from a clean checkout | `FAILS first` | `.next/types/app/**/*.ts` missing before build |
| `pnpm --filter @drts/bank-console-web typecheck` after build | `PASS` | Matches the parent task's recorded note |

Important qualification on token guard:

- `python3 scripts/check_ui_realm_tokens.py --enforce` is a repo-wide check and
  currently fails because of pre-existing findings in unrelated apps
  (`concierge-portal-web`, `passenger-web`, `tenant-console-web`,
  `tenant-portal-web`)
- the script does not support scoping to only `apps/bank-console-web`, so it is
  not usable here as a task-local pass/fail gate
- reviewer should therefore inspect the parent diff's token usage directly
  rather than treating the repo-wide guard failure as a `/bookings` regression

## Reviewer Spot-Checks

Sidecar reviewer `Claude2` should verify:

1. parent `BANK-UI-BOOKINGS-20260610` is still `review`, not `done`
2. the branch under review is `codex/bank-ui-bookings-20260610` at
   `35051c81`, not this sidecar branch
3. `/bookings` on the parent branch is no longer the `PendingScreen`
   placeholder and now renders the filter/table surface described above
4. the list excludes any cost-centre column and remains read-only
5. cardholder and benefit references are masked in `lib/bookings.ts`
6. `/bookings` copy flows through `t()` in `lib/translations.ts`
7. issuer accents come from `@drts/ui-tokens` brand data in `page.tsx`
8. the parent note about missing `bank-screens-*.jsx` files is still accurate;
   if those canvases have since landed and the screen diverges from them, reopen
   the parent review rather than approving on stale assumptions

## Sidecar Acceptance Mapping

- `Create support artifacts only` — satisfied if only this markdown file is
  task-owned in the sidecar branch
- `Do not edit canonical truth` — satisfied; packet is descriptive only
- `Hand off the packet to the assigned reviewer` — satisfied; review approval is
  already recorded in machine truth

## File Added By This Sidecar

```text
support/sidecars/BANK-UI-BOOKINGS-20260610/BANK-UI-BOOKINGS-20260610-SIDECAR-REVIEW.md
```
