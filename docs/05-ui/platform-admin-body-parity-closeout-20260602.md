# Platform Admin Body Parity — Supervisor Closeout

- Task: `UI-FE-ADM-PARITY-CLOSEOUT-20260602`
- Owner: `Claude2` (availability-first reassignment from `Claude`) · Reviewer: `Codex`
- Date: 2026-06-03
- Closeout type: supervisor QA + **executed batch integration** for the whole
  Platform Admin body-parity batch (`platform-admin-body-parity-20260602`).
- Base machine truth: `origin/dev @ 12f918d2277ee10091560defabb7731138c20643`
  (`12f918d2 INT-CLOSEOUT-FLEET-20260603`).
- Integration commit (this closeout branch): `8ae1f732`
  on `claude2/ui-fe-adm-parity-closeout-20260602`.
- Authority: `docs/05-ui/drts-design-canvas/Platform Admin.html`,
  `docs/05-ui/platform-admin-body-parity-audit-20260602.md`,
  and the branch-of-record manifest in
  `support/unblock/UI-FE-ADM-PARITY-CLOSEOUT-20260602/UI-FE-ADM-PARITY-CLOSEOUT-20260602-UNBLOCK-HISTORY-REPAIR.md`.

## 0. Headline (read this first)

**All 18 route bodies + nav are now integrated and gate-green on the closeout
branch; the remaining gap is purely the dev merge + deploy + remote smoke.**

At dispatch, only `/fleet` (1/18) was integrated to `dev`; the other 17 route
bodies, the nav update, and the 3 P0 "missing route" pages lived on scattered task
branches. This closeout owner (Claude2) had a build-capable worktree (unlike the
prior dead-lane closeout attempt, which had no `node_modules`), so the integration
was **executed, not just planned**:

- Every route was applied **surgically** — route-scoped checkout of the recorded
  canonical `commit_hash` from the history-repair manifest — onto current `dev`.
- Gates run green: `typecheck` (pass), `lint --max-warnings=0` (pass),
  `next build` (pass; all 18 routes compile, including the 3 previously-404 P0
  routes).
- Result lives as commit `8ae1f732` on `claude2/ui-fe-adm-parity-closeout-20260602`.

**What is still NOT done (and why this is reported as a blocker, not `done`):**

1. **Merge to `origin/dev`.** The proven vehicle is a PR → CI → human-authored
   merge (as `/fleet` did via PR #493). This worker cannot merge to `dev`.
2. **`Deploy - Dev`.** No Cloud Run credentials / deploy trigger in this worker.
3. **Remote 18-route Playwright smoke + screenshot set.** No platform-admin smoke
   suite exists in the repo, and there is no live dev URL access from this worker.

Therefore `INTEGRATION_STATUS=branch_pushed` for the batch (integration committed +
pushed on the closeout branch, ready for PR/CI/merge), **not `dev_deployed`.** Do
not describe this batch as "published to dev".

## 1. Why surgical (route-scoped) integration, not a branch merge

Every route's canonical tip **predates** the `/fleet` integration (`12f918d2`).
A naive 3-way merge / rebase of a recorded `commit_hash` onto `dev` (as the
history-repair step-1 literally suggests) would **revert** `fleet/page.tsx` and the
api-client additions that `12f918d2` added. Verified for `home`, `audit`,
`tenant-detail`, `reimb-queue`: each pinned tip's full tree-diff vs `dev` carries a
`fleet/page.tsx` (~3.3k line) revert and `packages/api-client/src/index.ts -12`.

So integration took **only each route's own file(s)** from its canonical commit
(`git checkout <hash> -- <route-path>`), never the whole commit. The committed diff
touches exactly the 17 route bodies + `components/admin-shell.tsx`; `fleet/page.tsx`
and `api-client` are untouched (guard-checked).

## 2. Integration census (route → closeout branch `8ae1f732`)

Canonical `commit_hash` per route is from the history-repair branch-of-record
manifest (which supersedes the earlier census's `wip` picks for adapters / flags /
nav / notices).

| Route | Canonical source `commit_hash` | Owner | On `8ae1f732` | Note |
| --- | --- | --- | --- | --- |
| `/` (home) | `6f478c23` | Codex | yes | |
| `/tenants` | `32f68b68` | Claude2 | yes | file-scoped (sibling `[tenantId]` is a different commit) |
| `/tenants/[tenantId]` (P0) | `012c5f87` | Codex | **yes (new)** | was 404 on dev |
| `/tenant-governance` | `ff374bd7` | Codex | yes | |
| `/partners` | `f471a825` | Claude | yes | |
| `/partners/[entrySlug]` | `055cbb34` | Codex | yes | |
| `/users` | `d0b71bcf` | Claude | yes | |
| `/fleet` | `eb2e11b0` → `12f918d2` | Claude2 | already on dev | skipped |
| `/switchboard` | `ce1fa317` | Claude | yes | |
| `/pricing` | `c7332c28` | Codex | yes | |
| `/adapter-registry` | `709875c3` | Codex2 | yes | finalized codex2 tip (not census `wip`) |
| `/payments` | `39c7743a` | Claude | yes | recorded pushed tip |
| `/payments/reimbursements` (P0) | `cfac8e31` | Codex2 | **yes (new)** | was 404 on dev |
| `/payments/reimbursements/[batchId]` (P0) | `6e5bcf46` | Codex2 | **yes (new)** | was 404 on dev |
| `/health` | `09ed0f35` | Codex | yes | + drift fix (§4) |
| `/notices` | `810696c7` | Codex2 | yes | finalized & pushed codex2 tip |
| `/audit` | `e210ec68` | Claude | yes | |
| `/feature-flags` | `05ca7efc` | Codex2 | yes | finalized codex2 tip |
| nav (`components/admin-shell.tsx`) | `ca20e3ce` | Codex2 | yes | adds Reimbursements item; `/payments` → `/payments/reimbursements` |

## 3. Acceptance scorecard

| Acceptance criterion | On closeout branch `8ae1f732` | On `origin/dev` | Evidence |
| --- | --- | --- | --- |
| All 18 routes compile / would return 200 | **PASS (build)** | partial (1/18) | `next build` lists all 18 routes incl. 3 P0; HTTP-200-on-dev pending merge+deploy |
| One shell only, sidebar 224px | **PASS** | n/a | `admin-shell.tsx` `gridTemplateColumns: "224px minmax(0,1fr)"`, single shell |
| Each route body matches `Platform Admin.html` | **PASS (canonical blobs)** | 1/18 | each body is the reviewer-approved canonical commit per §2 |
| No converted (rendered) body uses legacy `admin-*` CSS | **PASS** w/ 1 dead-code caveat | FAIL (5 files) | only orphaned `adapter-registry/components/AdapterList.tsx` retains `admin-*`, and it is not imported/rendered (§5) |
| Remote Playwright smoke + screenshots (18 routes) | **NOT RUN** | NOT RUN | no smoke suite in repo; no live dev URL from worker |
| PRs merged to dev | **NO** | 1/18 | needs PR → CI → human merge (the `/fleet`/#493 vehicle) |
| Dev deploy succeeds | **NO** | NO | no `Deploy - Dev` access from worker |
| Closeout doc links commits/PRs/CI/deploy/screenshots | this doc | — | commits captured; PR/CI/deploy/screenshot links pending |

## 4. Integration-drift remediation

- `app/health/page.tsx` — `alertTone()` had `case "unknown":` in a switch over
  `OperationalAlertRecord["state"] | AdapterHealthRecord["status"]`. On current
  `dev` that union is `healthy | degraded | down | warning | critical` (no
  `"unknown"`), so `tsc` failed (TS2678). Removed the dead case; `default:` already
  returns `"neutral"`, so behavior is preserved. No other route needed remediation.

## 5. Residuals / known gaps

1. **Orphaned legacy-CSS dead code:**
   `apps/platform-admin-web/app/adapter-registry/components/AdapterList.tsx`
   (and `EditAdapterModal.tsx`) still carry `admin-*` classes. They are **retained
   by the canonical adapters commit `709875c3` itself** and the rebuilt
   `adapter-registry/page.tsx` no longer imports `AdapterList`, so no rendered body
   uses legacy classes. Recommend a small follow-up cleanup task to delete the dead
   components (out of scope for body-parity integration).
2. **`app/globals.css`** still *defines* `admin-*` classes (stylesheet definitions,
   not body usage). Harmless; separate cleanup.
3. **No build of the rest of the monorepo** was run; only `@drts/platform-admin-web`
   and its upstream deps were gated. The change is route-page + shell only, so
   blast radius is contained to this app.

## 6. Remaining work to fully close the batch

1. **Open a PR** from `claude2/ui-fe-adm-parity-closeout-20260602` (or supervisor
   re-splits into per-route `INT-CLOSEOUT-<ROUTE>-20260603` PRs, mirroring `/fleet`
   → #493) and let CI run.
2. **Merge to `dev`** (human-authored merge, as PR #493 was).
3. **`Deploy - Dev`** → record run URL + SHA.
4. **Author + run** the platform-admin Playwright smoke + screenshot set against the
   fresh dev deploy (18 routes); attach screenshot evidence.
5. **Dead-code cleanup** (§5.1), then re-verify zero `admin-*` in any rendered body.
6. Flip the closeout `INTEGRATION_STATUS=dev_deployed` and mark §3 PASS once the
   deploy run + smoke evidence exist.

## 7. Integration status

- **Current `INTEGRATION_STATUS` for the batch: `branch_pushed`.** The full 18-route
  + nav integration is committed (`8ae1f732`) and pushed on the closeout branch,
  gate-green (typecheck + lint + build), ready for PR/CI/merge. `/fleet` alone is at
  `merged_to_dev`.
- **Not `dev_deployed`.** No deploy run or remote smoke/screenshot evidence exists.

## 8. Evidence index

- Dev base: `origin/dev @ 12f918d2`.
- Integration commit: `8ae1f732` (this branch); `git show --stat 8ae1f732`.
- Gates (this worktree, deps built via `turbo run build --filter=@drts/platform-admin-web^...`):
  - `pnpm --filter @drts/platform-admin-web typecheck` → exit 0
  - `pnpm --filter @drts/platform-admin-web lint` (`eslint . --max-warnings=0`) → exit 0
  - `pnpm --filter @drts/platform-admin-web build` (`next build`) → exit 0, 18 routes
- Branch-of-record manifest: history-repair doc cited in the header.
- Prior census (superseded by §2 here): dead-lane branch
  `origin/claude/ui-fe-adm-parity-closeout-20260602 @ a4c8c81d`.
