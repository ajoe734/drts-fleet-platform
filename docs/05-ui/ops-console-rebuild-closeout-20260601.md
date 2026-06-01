# Ops Console Rebuild — Umbrella Closeout (2026-06-01)

Owner: Claude · Reviewer: Codex2
Task: `UI-FE-OPS-UMBRELLA`
Spec packet: [`docs/05-ui/ops-console-design-handoff-packet-20260525.md`](./ops-console-design-handoff-packet-20260525.md) (per-page briefs are §5.1–§5.20)
Integration trunk audited: `origin/dev` @ `64cb4597`; routes consolidated onto umbrella branch `claude/ui-fe-ops-umbrella` (base `dev`)

## Purpose

`UI-FE-OPS-UMBRELLA` is the status / closeout gate for the Ops Console rebuild. Its acceptance is:

> All 20 sub-tasks done; closeout doc references each per spec packet §5; storybook parity stories pass; smoke test in dev VM clean.

This document binds each of the 20 per-page briefs in spec packet §5 to its implementing sub-task, records the machine-truth `done` evidence for that sub-task, and — critically — records whether the approved work is actually **integrated into the trunk a dev-VM smoke test runs against**.

The earlier headline finding was that **3 of the 20 §5 routes were not present on `origin/dev`** even though all 3 sub-tasks reached `done` in machine truth — their approved code lived only on divergent per-owner lane branches, and one (`/approval-requests`) had been actively deleted from `dev` by a stray auto-anchor commit (`21ee942e`), leaving a live top-level nav 404.

**This closeout resolves that gap.** All 3 stragglers (`/approval-requests` §5.9, `/complaints/[caseNo]` §5.6, `/contracts/[contractId]` §5.19) have been **additively reconstructed onto the umbrella branch** `claude/ui-fe-ops-umbrella` (new route directories only — no sibling list page was modified, no divergent owner branch was whole-merged). The umbrella branch now builds all **20 of 20** §5 routes with `tsc --noEmit` and `next build` both exit 0, and the `/approval-requests` nav 404 is cleared. The single remaining unmet acceptance clause is **storybook parity stories**, which were never authored for Ops Console and are out of closeout scope. See [Route consolidation](#route-consolidation-3-stragglers-integrated-additively) and [Acceptance assessment](#acceptance-assessment).

## Verification scope

Each sub-task was independently reviewed and finalized to `done` under its own task lifecycle; this closeout does **not** re-run per-task acceptance. It cites the final `done` event recorded in `ai-activity-log.jsonl` (agent, commit, push branch) for each sub-task, all of which are archived in `ai-status.json` `archived_task_ids`.

What this closeout **did** execute, against the umbrella branch `claude/ui-fe-ops-umbrella` (base `origin/dev @ 64cb4597`; this branch carries only the additive route reconstruction + this doc on top of `dev`, and none of the underlying `dev` commits touch ops-console routes):

| Check                    | Command                                                          | Result        |
| ------------------------ | ---------------------------------------------------------------- | ------------- |
| Install                  | `pnpm install --frozen-lockfile`                                 | PASS (exit 0) |
| Prereq build             | `pnpm --filter @drts/contracts build`                            | PASS (exit 0) |
| Prereq build             | `pnpm --filter @drts/ui-tokens build`                            | PASS (exit 0) |
| Prereq build             | `pnpm --filter @drts/ui-web build`                               | PASS (exit 0) |
| Typecheck                | `pnpm --filter @drts/ops-console-web typecheck` (`tsc --noEmit`) | PASS (exit 0) |
| Production build / smoke | `pnpm --filter @drts/ops-console-web build` (`next build`)       | PASS (exit 0) |

The `next build` route table is the integration ground truth. After the route reconstruction it emits all 20 §5 surfaces:

```
/  /_not-found  /approval-requests  /attendance  /callcenter
/complaints  /complaints/[caseNo]  /contracts  /contracts/[contractId]
/control-plane-proxy/[...path]  /dashboard  /dispatch  /dispatch/[dispatchId]
/drivers  /drivers/[driverId]  /feature-flags  /incidents  /incidents/[incidentId]
/maintenance  /reports  /revenue  /vehicles  /vehicles/[vehicleId]
```

That is **20 of 20** §5 surfaces. `/approval-requests` (§5.9), `/complaints/[caseNo]` (§5.6), and `/contracts/[contractId]` (§5.19) — absent from the prior `origin/dev` build — are now present.

## §5 surface signoff matrix

Status legend: **OK** = page present in the umbrella-branch build route table; **(reconstructed)** = route was absent from `origin/dev` and is now additively reconstructed onto the umbrella branch by this closeout.

| §5   | Route (packet)            | Sub-task        | Final `done` agent | Done commit | Branch of record                | Done (UTC)           | On branch           |
| ---- | ------------------------- | --------------- | ------------------ | ----------- | ------------------------------- | -------------------- | ------------------- |
| 5.1  | `/dashboard`              | UI-FE-OPS-DSH   | Codex2             | `35ae4509`  | `origin/codex2/ui-fe-ops-dsh`   | 2026-05-26T14:33:44Z | OK                  |
| 5.2  | `/dispatch`               | UI-FE-OPS-DSP   | Claude             | `3cad1681`  | `origin/claude/ui-fe-ops-dsp`   | 2026-06-01T01:39:52Z | OK                  |
| 5.3  | `/dispatch/[workItemId]`¹ | UI-FE-OPS-DSPID | Claude             | `9679480b`  | `origin/claude/ui-fe-ops-dspid` | 2026-06-01T07:20:14Z | OK                  |
| 5.4  | `/callcenter`             | UI-FE-OPS-CC    | Claude2            | `314daff9`  | `origin/claude2/ui-fe-ops-cc`   | 2026-06-01T03:12:04Z | OK                  |
| 5.5  | `/complaints`             | UI-FE-OPS-CMP   | Claude2            | (on dev)    | `origin/dev`                    | 2026-06-01T07:22:17Z | OK                  |
| 5.6  | `/complaints/[caseNo]`    | UI-FE-OPS-CMPID | Claude             | `6bcce14c`  | `origin/claude/ui-fe-ops-cmpid` | 2026-06-01T00:06:44Z | OK (reconstructed)² |
| 5.7  | `/incidents`              | UI-FE-OPS-INC   | Claude             | `d57c1c3c`  | `origin/claude/ui-fe-ops-inc`   | 2026-06-01T01:39:49Z | OK                  |
| 5.8  | `/incidents/[incidentId]` | UI-FE-OPS-INCID | Claude             | `74488fcd`  | `origin/claude/ui-fe-ops-incid` | 2026-06-01T07:38:45Z | OK                  |
| 5.9  | `/approval-requests`      | UI-FE-OPS-APR   | Codex2             | `26587e81`  | `origin/codex2/ui-fe-ops-apr`   | 2026-05-27T05:49:20Z | OK (reconstructed)³ |
| 5.10 | `/reports`                | UI-FE-OPS-RPT   | Claude             | (owner br.) | `origin/claude/ui-fe-ops-rpt`   | 2026-06-01T00:47:07Z | OK                  |
| 5.11 | `/revenue`                | UI-FE-OPS-REV   | Codex              | `6ccce080`  | `origin/codex/ui-fe-ops-rev`    | 2026-05-29T04:14:51Z | OK                  |
| 5.12 | `/attendance`             | UI-FE-OPS-ATT   | Claude             | `54a37cbe`  | `origin/claude/ui-fe-ops-att`   | 2026-06-01T07:23:15Z | OK                  |
| 5.13 | `/maintenance`            | UI-FE-OPS-MNT   | Claude             | `5c60732e`  | `origin/claude/ui-fe-ops-mnt`   | 2026-06-01T03:02:16Z | OK                  |
| 5.14 | `/drivers`                | UI-FE-OPS-DRV   | Claude             | `6adb27a6`  | `origin/claude/ui-fe-ops-drv`   | 2026-06-01T05:08:02Z | OK                  |
| 5.15 | `/drivers/[driverId]`     | UI-FE-OPS-DRVID | Claude             | `0c01bb37`  | `origin/claude/ui-fe-ops-drvid` | 2026-06-01T06:44:18Z | OK                  |
| 5.16 | `/vehicles`               | UI-FE-OPS-VEH   | Codex2             | `c42ac488`  | `origin/codex2/ui-fe-ops-veh`   | 2026-05-27T06:39:37Z | OK                  |
| 5.17 | `/vehicles/[vehicleId]`   | UI-FE-OPS-VEHID | Codex2             | `b9fe9412`  | `origin/codex2/ui-fe-ops-vehid` | 2026-05-28T10:34:40Z | OK                  |
| 5.18 | `/contracts`              | UI-FE-OPS-CON   | Claude2            | `45fd9bae`  | `origin/claude2/ui-fe-ops-con`  | 2026-06-01T07:21:18Z | OK                  |
| 5.19 | `/contracts/[contractId]` | UI-FE-OPS-CONID | Claude             | `3b30f0a7`  | `origin/claude/ui-fe-ops-conid` | 2026-06-01T01:00:45Z | OK (reconstructed)⁴ |
| 5.20 | `/feature-flags`          | UI-FE-OPS-FF    | Claude             | `684d69f9`  | `origin/claude/ui-fe-ops-ff`    | 2026-06-01T02:36:00Z | OK                  |

Foundation dependency: `UI-FE-TOKENS` — Codex, `4b8af668`, `origin/codex/ui-fe-tokens`, 2026-05-31T14:15:56Z. Consumed by the prereq `@drts/ui-tokens` build above (PASS).

¹ Spec packet names the param `[workItemId]`; the implemented route is `/dispatch/[dispatchId]`. Naming only — surface present and builds.
² Reconstructed additively from `origin/claude/ui-fe-ops-cmpid` (`app/complaints/[caseNo]/page.tsx`). Detail is also reachable inline via `/complaints?caseNo=…` (the list page reads `searchParams.caseNo`); the standalone §5.6 route now builds as well. The `dev` list page was **not** modified by this closeout.
³ Reconstructed additively from the reviewer-approved repair branch `origin/claude/ui-fe-ops-umbrella-unblock-history-repair` (`app/approval-requests/page.tsx`, byte-identical to the pre-deletion `dev` blob `21ee942e^` / reviewed PR#67 `60818b38`). The shell nav (`apps/ops-console-web/lib/ops-shell-nav.ts`) link to `/approval-requests` no longer 404s. The umbrella branch supersedes that standalone repair branch (same vetted content).
⁴ Reconstructed additively from `origin/claude/ui-fe-ops-conid` (`app/contracts/[contractId]/page.tsx` + `contract-detail-controls.tsx`). The route now exists and builds, but the `dev` `contracts/page.tsx` list page still renders `contractId` as plain text with **no detail `Link`** — there is no in-app entry point yet (reachable by direct URL only). Adding that link touches the done `UI-FE-OPS-CON` list page and is left as a small parity follow-up rather than modified here.

## Route consolidation: 3 stragglers integrated additively

The three §5 routes that had reached `done` in machine truth but never landed on `dev` are now reconstructed onto the umbrella branch. The work is strictly **additive** (new `app/<route>/` directories only); no sibling list page and no divergent owner branch was whole-merged.

| Route                     | Sub-task        | Source ref used                                           | Files added                                                                                      |
| ------------------------- | --------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `/approval-requests`      | UI-FE-OPS-APR   | `origin/claude/ui-fe-ops-umbrella-unblock-history-repair` | `app/approval-requests/page.tsx`                                                                 |
| `/complaints/[caseNo]`    | UI-FE-OPS-CMPID | `origin/claude/ui-fe-ops-cmpid`                           | `app/complaints/[caseNo]/page.tsx`                                                               |
| `/contracts/[contractId]` | UI-FE-OPS-CONID | `origin/claude/ui-fe-ops-conid`                           | `app/contracts/[contractId]/page.tsx`, `app/contracts/[contractId]/contract-detail-controls.tsx` |

**Why this is safe.** Each owner branch is a divergent stale base — e.g. `origin/codex2/ui-fe-ops-apr` also _deletes_ `app/vehicles/[vehicleId]/page.tsx` and several `lib/*` files that `dev` now has, and edits `apps/api`. Whole-merging any of them would clobber `dev`. Instead, only the new route directories were checked out; each page's cross-package imports (`@drts/contracts` types/constants, `@drts/ui-web` components, and app-local `@/lib/*` helpers) resolve against current `dev`, proven by `tsc --noEmit` (exit 0) and `next build` (exit 0). The earlier-anchored deletion `21ee942e` is left intact; no history was rewritten and no force-push was used.

## Storybook parity status

`packages/ui-web/.storybook` builds, but its story set covers tenant / platform / partner surfaces only (`tenant-*.stories.tsx`, `platform-*.stories.tsx`, `partner-booking.stories.tsx`). There are **no Ops Console parity stories** — no `ops-*`, dispatch, incident, complaint, etc. stories exist anywhere in the repo. The acceptance clause "storybook parity stories pass" cannot be satisfied for Ops Console because the parity stories were never authored. This is the **single remaining unmet acceptance clause** and is an authoring workstream outside closeout scope (see follow-up #2).

## Acceptance assessment

| Acceptance clause                               | Verdict                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| All 20 sub-tasks done                           | **Met** (board/machine-truth): all 20 + `UI-FE-TOKENS` are `done`/archived.                                                                                                                                                                                                                                                                              |
| Closeout doc references each per spec packet §5 | **Met**: this document, signoff matrix §5.1–§5.20.                                                                                                                                                                                                                                                                                                       |
| Smoke test in dev VM clean                      | **Met (on umbrella branch)**: `pnpm install --frozen-lockfile`, prereq builds, `tsc --noEmit`, and `next build` all exit 0; the route table emits **20 of 20** §5 surfaces; the `/approval-requests` nav 404 is cleared. One cosmetic parity follow-up remains (the `/contracts` list page has no `Link` to `[contractId]` — direct-URL reachable only). |
| Storybook parity stories pass                   | **Not met**: no Ops Console parity stories exist; never authored.                                                                                                                                                                                                                                                                                        |

Three of four clauses are met on the umbrella branch. The **one** remaining gap is storybook parity, which requires either authoring the Ops Console story set or an explicit acceptance amendment — a decision above the umbrella owner's scope. This closeout therefore hands the umbrella branch (route-complete, smoke-clean) and this doc to the reviewer; it does **not** self-finalize to `done` while the storybook clause is open.

## Recommended follow-ups

1. **`/contracts` → `[contractId]` entry point** (cosmetic): add a detail `Link` in `apps/ops-console-web/app/contracts/page.tsx` so the now-present `/contracts/[contractId]` route is reachable in-app, not just by direct URL. Touches the done `UI-FE-OPS-CON` list page, so tracked separately rather than folded into this additive closeout.
2. **Ops Console parity stories** (blocks the last acceptance clause): author the missing `packages/ui-web/src/ops-*.stories.tsx` set if "storybook parity stories pass" is to remain an acceptance gate, or amend the acceptance if Ops Console is intentionally story-exempt.
3. **Anchor-commit regression guard**: `21ee942e` silently deleted a shipped, approved page via an "auto-anchor pending work" cleanup. Worth a check that auto-anchor cleanup commits cannot delete approved sub-task artifacts on `dev`.

## Files added/changed by this closeout

```text
docs/05-ui/ops-console-rebuild-closeout-20260601.md                       (this doc)
apps/ops-console-web/app/approval-requests/page.tsx                       (reconstructed §5.9)
apps/ops-console-web/app/complaints/[caseNo]/page.tsx                     (reconstructed §5.6)
apps/ops-console-web/app/contracts/[contractId]/page.tsx                  (reconstructed §5.19)
apps/ops-console-web/app/contracts/[contractId]/contract-detail-controls.tsx (reconstructed §5.19)
```
