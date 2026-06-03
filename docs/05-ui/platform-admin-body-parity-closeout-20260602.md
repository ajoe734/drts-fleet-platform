# Platform Admin Body Parity — Supervisor Closeout

- Task: `UI-FE-ADM-PARITY-CLOSEOUT-20260602`
- Owner: `Claude`  ·  Reviewer: `Codex`
- Date: 2026-06-03
- Closeout type: supervisor QA + integration census for the whole Platform Admin
  body-parity batch (`platform-admin-body-parity-20260602`).
- Base machine truth: `origin/dev` at `12f918d2277ee10091560defabb7731138c20643`
  (`12f918d2 INT-CLOSEOUT-FLEET-20260603: integrate platform admin fleet closeout`).
- Authority: `docs/05-ui/drts-design-canvas/Platform Admin.html`,
  `docs/05-ui/platform-admin-body-parity-audit-20260602.md`,
  `docs/05-ui/platform-admin-design-handoff-packet-20260525.md`.

## 0. Headline (read this first)

**Branch-level work is complete; integration to `dev` is NOT.** All 19 dependency
tasks (18 routes + nav) are recorded `done` / archived in machine truth, and each
one's canvas rebuild exists on an identifiable, mostly-pushed task branch. But on
`origin/dev` **only 1 of the 18 routes — `/fleet` — has actually been integrated**
(via `12f918d2 INT-CLOSEOUT-FLEET-20260603`). The other 17 route bodies, the nav
update, and the 3 P0 "missing route" pages are **not merged to `dev`**.

Therefore the closeout's integration acceptance —
*"all 18 routes 200 on dev with canvas body parity; no legacy admin body CSS; remote
Playwright smoke + screenshot set; PRs merged to dev; dev deploy succeeds"* — is
**NOT met on the current dev tree.** This document records the true state, the
evidence trail for every route, and the remaining integration work. It does **not**
claim `dev_deployed`.

This task is therefore reported as a **blocker** (integration gap + missing
deploy/smoke infra in the worker env), not finalized as `done`.

## 1. Dependency completion (branch level)

All 19 dependency tasks resolve as archived (done) in canonical machine truth
(`ai-status.json` `archived_task_ids`):

`HOME, TENANTS, TENANT-DETAIL, TENANT-GOV, PARTNERS, PARTNER-DETAIL, USERS, FLEET,
SWITCHBOARD, PRICING, ADAPTERS, PAYMENTS, REIMB-QUEUE, REIMB-DETAIL, HEALTH,
NOTICES, AUDIT, FLAGS, NAV` — all `*-20260602`.

So the single required dependency merge point (this closeout) has had all upstream
owners report done. The gap below is purely **integration**, not owner work.

## 2. Integration census (route → dev)

Method: for each route I located the canonical finalized task branch holding the
canvas rebuild, and tested whether that work is reachable from `origin/dev`
(`git merge-base --is-ancestor <ref> origin/dev`) and whether the route page exists
on `origin/dev`. Census run on 2026-06-03 against `origin/dev @ 12f918d2`.

| Route | Page on dev | On dev (parity) | Canonical work branch (pushed unless noted) | Tip |
| --- | --- | --- | --- | --- |
| `/` (home) | yes (pre-parity) | **NO** | `origin/codex/ui-fe-adm-parity-home-20260602` | `6f478c23` refine home parity |
| `/tenants` | yes (pre-parity) | **NO** | `claude2/ui-fe-adm-parity-tenants-20260602` (pushed; local `codex/…` dup) | `32f68b68` rebuild /tenants PA_Tenants |
| `/tenants/[tenantId]` | **404 (absent)** | **NO** | `origin/codex/ui-fe-adm-parity-tenant-detail-20260602` | `012c5f87` finalize tenant detail |
| `/tenant-governance` | yes (pre-parity) | **NO** | `origin/codex/ui-fe-adm-parity-tenant-gov-20260602` | `ff374bd7` finalize tenant gov |
| `/partners` | yes (pre-parity) | **NO** | `origin/claude/ui-fe-adm-parity-partners-20260602` | `f471a825` rebuild /partners |
| `/partners/[entrySlug]` | yes (pre-parity) | **NO** | `origin/codex/ui-fe-adm-parity-partner-detail-20260602` | `055cbb34` finalize partner detail |
| `/users` | yes (pre-parity) | **NO** | `origin/claude/ui-fe-adm-parity-users-20260602` | `d0b71bcf` invite submit fix |
| `/fleet` | yes (**canvas**) | **YES** | integrated as `12f918d2 INT-CLOSEOUT-FLEET-20260603` (from `claude2/…-fleet` `eb2e11b0`) | on dev |
| `/switchboard` | yes (pre-parity) | **NO** | `origin/claude/ui-fe-adm-parity-switchboard-20260602` | `ce1fa317` synthesized action descriptors |
| `/pricing` | yes (pre-parity) | **NO** | `origin/codex/ui-fe-adm-parity-pricing-20260602` | `c7332c28` finalize pricing |
| `/adapter-registry` | yes (pre-parity) | **NO** | `origin/codex/ui-fe-adm-parity-adapters-20260602` (tip is `wip`) | `ceb6ec5a` anchor stale banner |
| `/payments` | yes (pre-parity) | **NO** | `claude/ui-fe-adm-parity-payments-20260602` (pushed `39c7743a`; local `codex` dup) | `258232ae` settlement+reconciliation |
| `/payments/reimbursements` | **404 (absent)** | **NO** | `origin/codex2/ui-fe-adm-parity-reimb-queue-20260602` | `cfac8e31` closeout queue |
| `/payments/reimbursements/[batchId]` | **404 (absent)** | **NO** | `origin/codex2/ui-fe-adm-parity-reimb-detail-20260602` | `6e5bcf46` closeout detail |
| `/health` | yes (pre-parity) | **NO** | `origin/codex/ui-fe-adm-parity-health-20260602` | `09ed0f35` finalize health |
| `/notices` | yes (pre-parity) | **NO** | `codex/ui-fe-adm-parity-notices-20260602` (**LOCAL-only**, tip is `wip`) | `9a02d02d` anchor notices |
| `/audit` | yes (pre-parity) | **NO** | `origin/claude/ui-fe-adm-parity-audit-20260602` | `e210ec68` lint cleanup |
| `/feature-flags` | yes (pre-parity) | **NO** | `origin/codex/ui-fe-adm-parity-flags-20260602` (tip is `wip`) | `d097110f` align flags body |
| nav (shell) | n/a | **NO** | `origin/codex/ui-fe-adm-parity-nav-20260602` | `f1e8c606` close out reimbursement nav |

Cross-check of last commit to touch each route page on `origin/dev` confirms the
"NO" rows: every existing route page's most recent dev commit predates the
2026-06-02 parity batch (e.g. `b5759c83 OPS: remove legacy platform admin route
shells (#483)`, `0db61c06 ADM-UI-RD-006 (#145)`, `9be6949f UI-HANDOFF-PA-PAGE-PRICING-001 (#218)`),
and the 3 P0 pages do not exist on `origin/dev` at all. `/fleet` is the only route
whose dev page was rewritten by a `*-20260602` integration commit.

### Branch-state caveats for the integrator

- **Local-only (must be pushed before integration):** the canonical tip chosen for
  `notices` (`9a02d02d`) exists only as a local branch; `tenants` and `payments`
  have local `codex/…` duplicates but pushed equivalents under `claude2/…` /
  `claude/…` respectively — integrate from the pushed ref.
- **Tip still `wip` (not a finalized closeout commit):** `adapters` (`ceb6ec5a`),
  `notices` (`9a02d02d`), `flags` (`d097110f`). These should be confirmed
  review-clean before they land.
- **Competing variants per route** (`claude/` vs `codex/` vs `claude2/` vs
  `codex2/`) exist for most routes; the table lists the finalized/owner tip. The
  integrator must pick the reviewer-approved tip per the route task's
  owner/reviewer of record, not blindly the first match.

## 3. Acceptance scorecard (against `origin/dev @ 12f918d2`)

| Acceptance criterion | Status | Evidence |
| --- | --- | --- |
| All 18 routes return HTTP 200 on dev | **FAIL** | 3 P0 routes absent (404); 14 others still pre-parity bodies; only `/fleet` integrated. |
| One shell only, sidebar 224px | PARTIAL/UNVERIFIED | Shell fixed earlier (PR #483/#485); not re-verified live this session (no deploy access). |
| Each route body matches `Platform Admin.html` (title/tabs/cards/tables/actions) | **FAIL on dev** | Only `/fleet` carries the canvas rebuild on dev; 17 rebuilds remain on branches. |
| No converted body uses legacy `admin-*` CSS | **FAIL on dev** | 5 dev files still use `admin-*`: `audit/page.tsx`, `notices/page.tsx`, `health/page.tsx`, `tenant-governance/page.tsx`, `adapter-registry/components/AdapterList.tsx`. The branch rebuilds remove these, but they are not merged. |
| Remote Playwright smoke + screenshot set (18 routes) | **NOT RUN** | No platform-admin smoke/e2e spec exists in the repo; no remote dev URL access from this worker. |
| PRs merged to dev | **FAIL** | 1/18 integrated (`/fleet`). |
| Dev deploy succeeds | **NOT RUN** | No `Deploy - Dev` trigger/credentials available to this worker. |
| Closeout doc links commits/PRs/CI/deploy/screenshots | This document | Branch+commit evidence captured here; PR/CI/deploy/screenshot links pending integration. |

## 4. Worker-environment limits (why integration was not executed here)

This closeout was produced in an isolated task worktree
(`…/auto/claude-ui-fe-adm-parity-closeout-20260602`) with the following hard limits:

- **No `node_modules`** at repo root or in `apps/platform-admin-web` → `tsc`/`next
  build`/`vitest` cannot run. Any branch merge would land **un-gated** on `dev`.
- **No deploy access** — the `Deploy - Dev` workflow and Cloud Run credentials are
  not reachable; `dev_deployed` cannot be produced or evidenced here.
- **No remote smoke harness** — there is no platform-admin Playwright/screenshot
  suite in the repo, and no live dev URL access, so the 18-route remote smoke +
  screenshot acceptance cannot be satisfied from this worker.

Merging 17 divergent-base branches + 3 new routes + nav **blind (no build gate)**
would risk breaking `dev` and contradicts the gates-green / machine-truth
discipline. The single established integration vehicle so far is **per-route
`INT-CLOSEOUT-*` commits with gates** (as done for `/fleet`), which is the correct
pattern to continue under a build-capable environment.

## 5. Remaining work to actually close the batch

1. **Per-route integration (17 routes + nav + 3 P0 pages).** For each row in §2
   marked "NO": in a build-capable environment, merge the reviewer-approved tip
   onto `dev` (rebase/3-way against current `dev`), run `pnpm -F platform-admin-web
   typecheck && build`, then land an `INT-CLOSEOUT-<ROUTE>-20260603` commit — same
   shape as `12f918d2`. Push `notices` first (local-only) and confirm the three
   `wip`-tip routes (`adapters`, `notices`, `flags`) are review-clean.
2. **Nav update** (`…-nav f1e8c606`): adds `代墊批次 / Reimbursements` item and
   routes `/payments` → `/payments/reimbursements`. Land after the reimbursement
   routes exist so the nav target resolves.
3. **Legacy CSS sweep:** after the rebuilds land, re-verify zero `admin-*` body
   classes across `apps/platform-admin-web/app/**` (currently 5 files).
4. **Full-batch verification:** route census (18× HTTP 200) against a fresh dev
   deploy; add/author the platform-admin Playwright smoke + screenshot set; run it
   remotely; attach screenshot evidence.
5. **Deploy:** merge gate green → `Deploy - Dev` → record run URL + SHA, then update
   this doc's §3 to PASS and set the closeout `INTEGRATION_STATUS=dev_deployed`.

## 6. Integration status

- **Current `INTEGRATION_STATUS` for the batch: `branch_pushed`** (17/18 routes +
  nav are committed and pushed on task branches but not merged), with **`/fleet`
  alone at `merged_to_dev`**.
- **Not `dev_deployed`.** No deploy run or remote smoke evidence exists. Do not
  describe this batch as "published to dev".

## 7. Evidence index

- Dev base: `origin/dev @ 12f918d2277ee10091560defabb7731138c20643`.
- Integrated route: `/fleet` via `12f918d2 INT-CLOSEOUT-FLEET-20260603`.
- Per-route branches + tips: §2 table above (run `git log -1 <ref>` to inspect).
- Audit baseline: `docs/05-ui/platform-admin-body-parity-audit-20260602.md`
  (census against `3996828a`, found 3 P0 404s + 15 partial bodies).
- Legacy `admin-*` residue on dev: 5 files listed in §3.
