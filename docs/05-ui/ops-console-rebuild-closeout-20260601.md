# Ops Console Rebuild — Umbrella Closeout (2026-06-01)

Owner: Claude · Reviewer: Codex2
Task: `UI-FE-OPS-UMBRELLA`
Spec packet: [`docs/05-ui/ops-console-design-handoff-packet-20260525.md`](./ops-console-design-handoff-packet-20260525.md) (per-page briefs are §5.1–§5.20)
Integration trunk audited: `origin/dev` @ `64cb4597`

## Purpose

`UI-FE-OPS-UMBRELLA` is the status / closeout gate for the Ops Console rebuild. Its acceptance is:

> All 20 sub-tasks done; closeout doc references each per spec packet §5; storybook parity stories pass; smoke test in dev VM clean.

This document binds each of the 20 per-page briefs in spec packet §5 to its implementing sub-task, records the machine-truth `done` evidence for that sub-task, and — critically — records whether the approved work is actually **integrated into `origin/dev`**, which is the tree a dev-VM smoke test runs against.

The headline finding is that **3 of the 20 §5 routes are not present on `origin/dev`** even though all 3 sub-tasks reached `done` in machine truth. Their approved code lives only on per-owner lane branches; one (`/approval-requests`) was actively deleted from `dev` by a stray auto-anchor commit. The umbrella therefore **cannot be closed as fully accepted**: a smoke test of current `dev` exercises 17 of 20 surfaces, and the shell nav contains a live 404. See [Integration gap](#integration-gap-3-of-20-routes-not-on-dev) and [Acceptance assessment](#acceptance-assessment).

## Verification scope

Each sub-task was independently reviewed and finalized to `done` under its own task lifecycle; this closeout does **not** re-run per-task acceptance. It cites the final `done` event recorded in `ai-activity-log.jsonl` (agent, commit, push branch) for each sub-task, all of which are archived in `ai-status.json` `archived_task_ids`.

What this closeout **did** execute, against `origin/dev @ 64cb4597` (this branch fast-forwarded to it; 0 ahead / 10 behind before the ff, and none of those 10 commits touch ops-console routes):

| Check                    | Command                                                          | Result        |
| ------------------------ | ---------------------------------------------------------------- | ------------- |
| Prereq build             | `pnpm --filter @drts/contracts build`                            | PASS          |
| Prereq build             | `pnpm --filter @drts/ui-tokens build`                            | PASS          |
| Typecheck                | `pnpm --filter @drts/ops-console-web typecheck` (`tsc --noEmit`) | PASS (exit 0) |
| Production build / smoke | `pnpm --filter @drts/ops-console-web build` (`next build`)       | PASS (exit 0) |

The `next build` route table is the integration ground truth. It emitted exactly these app routes:

```
/  /_not-found  /attendance  /callcenter  /complaints  /contracts
/control-plane-proxy/[...path]  /dashboard  /dispatch  /dispatch/[dispatchId]
/drivers  /drivers/[driverId]  /feature-flags  /incidents  /incidents/[incidentId]
/maintenance  /reports  /revenue  /vehicles  /vehicles/[vehicleId]
```

That is 17 of the 20 §5 surfaces. `/approval-requests` (§5.9), `/complaints/[caseNo]` (§5.6), and `/contracts/[contractId]` (§5.19) are **absent** from the build.

## §5 surface signoff matrix

Status legend: **OK** = page present in the `origin/dev` build route table; **GAP** = approved sub-task done but route absent from `dev`.

| §5   | Route (packet)            | Sub-task        | Final `done` agent | Done commit | Branch of record                | Done (UTC)           | On dev   |
| ---- | ------------------------- | --------------- | ------------------ | ----------- | ------------------------------- | -------------------- | -------- |
| 5.1  | `/dashboard`              | UI-FE-OPS-DSH   | Codex2             | `35ae4509`  | `origin/codex2/ui-fe-ops-dsh`   | 2026-05-26T14:33:44Z | OK       |
| 5.2  | `/dispatch`               | UI-FE-OPS-DSP   | Claude             | `3cad1681`  | `origin/claude/ui-fe-ops-dsp`   | 2026-06-01T01:39:52Z | OK       |
| 5.3  | `/dispatch/[workItemId]`¹ | UI-FE-OPS-DSPID | Claude             | `9679480b`  | `origin/claude/ui-fe-ops-dspid` | 2026-06-01T07:20:14Z | OK       |
| 5.4  | `/callcenter`             | UI-FE-OPS-CC    | Claude2            | `314daff9`  | `origin/claude2/ui-fe-ops-cc`   | 2026-06-01T03:12:04Z | OK       |
| 5.5  | `/complaints`             | UI-FE-OPS-CMP   | Claude2            | (on dev)    | `origin/dev`                    | 2026-06-01T07:22:17Z | OK       |
| 5.6  | `/complaints/[caseNo]`    | UI-FE-OPS-CMPID | Claude             | `6bcce14c`  | `origin/claude/ui-fe-ops-cmpid` | 2026-06-01T00:06:44Z | **GAP**² |
| 5.7  | `/incidents`              | UI-FE-OPS-INC   | Claude             | `d57c1c3c`  | `origin/claude/ui-fe-ops-inc`   | 2026-06-01T01:39:49Z | OK       |
| 5.8  | `/incidents/[incidentId]` | UI-FE-OPS-INCID | Claude             | `74488fcd`  | `origin/claude/ui-fe-ops-incid` | 2026-06-01T07:38:45Z | OK       |
| 5.9  | `/approval-requests`      | UI-FE-OPS-APR   | Codex2             | `26587e81`  | `origin/codex2/ui-fe-ops-apr`   | 2026-05-27T05:49:20Z | **GAP**³ |
| 5.10 | `/reports`                | UI-FE-OPS-RPT   | Claude             | (owner br.) | `origin/claude/ui-fe-ops-rpt`   | 2026-06-01T00:47:07Z | OK       |
| 5.11 | `/revenue`                | UI-FE-OPS-REV   | Codex              | `6ccce080`  | `origin/codex/ui-fe-ops-rev`    | 2026-05-29T04:14:51Z | OK       |
| 5.12 | `/attendance`             | UI-FE-OPS-ATT   | Claude             | `54a37cbe`  | `origin/claude/ui-fe-ops-att`   | 2026-06-01T07:23:15Z | OK       |
| 5.13 | `/maintenance`            | UI-FE-OPS-MNT   | Claude             | `5c60732e`  | `origin/claude/ui-fe-ops-mnt`   | 2026-06-01T03:02:16Z | OK       |
| 5.14 | `/drivers`                | UI-FE-OPS-DRV   | Claude             | `6adb27a6`  | `origin/claude/ui-fe-ops-drv`   | 2026-06-01T05:08:02Z | OK       |
| 5.15 | `/drivers/[driverId]`     | UI-FE-OPS-DRVID | Claude             | `0c01bb37`  | `origin/claude/ui-fe-ops-drvid` | 2026-06-01T06:44:18Z | OK       |
| 5.16 | `/vehicles`               | UI-FE-OPS-VEH   | Codex2             | `c42ac488`  | `origin/codex2/ui-fe-ops-veh`   | 2026-05-27T06:39:37Z | OK       |
| 5.17 | `/vehicles/[vehicleId]`   | UI-FE-OPS-VEHID | Codex2             | `b9fe9412`  | `origin/codex2/ui-fe-ops-vehid` | 2026-05-28T10:34:40Z | OK       |
| 5.18 | `/contracts`              | UI-FE-OPS-CON   | Claude2            | `45fd9bae`  | `origin/claude2/ui-fe-ops-con`  | 2026-06-01T07:21:18Z | OK       |
| 5.19 | `/contracts/[contractId]` | UI-FE-OPS-CONID | Claude             | `3b30f0a7`  | `origin/claude/ui-fe-ops-conid` | 2026-06-01T01:00:45Z | **GAP**⁴ |
| 5.20 | `/feature-flags`          | UI-FE-OPS-FF    | Claude             | `684d69f9`  | `origin/claude/ui-fe-ops-ff`    | 2026-06-01T02:36:00Z | OK       |

Foundation dependency: `UI-FE-TOKENS` — Codex, `4b8af668`, `origin/codex/ui-fe-tokens`, 2026-05-31T14:15:56Z. Consumed by the prereq `@drts/ui-tokens` build above (PASS).

¹ Spec packet names the param `[workItemId]`; the implemented route is `/dispatch/[dispatchId]`. Naming only — surface present and builds.
² Detail is reachable on `dev` **inline** via `/complaints?caseNo=…` (the list page reads `searchParams.caseNo`). The standalone packet §5.6 route is not on `dev`. Functional parity is partial; route parity is missing.
³ `/approval-requests` was **deleted** from `dev` by `21ee942e` (`UI-FE-OPS-APR: cleanup commit — auto-anchor pending work`, –236 lines). The shell nav (`apps/ops-console-web/lib/ops-shell-nav.ts:43`) still links `href: "/approval-requests"`, so the integrated console has a **live top-level nav 404**.
⁴ `/contracts/[contractId]` is absent **and** unlinked: `apps/ops-console-web/app/contracts/page.tsx` renders `contractId` as plain text with no detail `Link`. No entry point and no route.

## Integration gap: 3 of 20 routes not on dev

All three sub-tasks are `done` in machine truth, but their approved code never landed on the `dev` integration trunk. Root cause and recovery source per route:

| Route                     | Sub-task        | Approved source ref (page present)                                                           | Why it is not on dev                                                                                                                                                                            |
| ------------------------- | --------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/approval-requests`      | UI-FE-OPS-APR   | `origin/codex2/ui-fe-ops-apr` (`app/approval-requests/page.tsx`)                             | Existed on `dev`, then deleted by anchor commit `21ee942e`. A later `reconciled_from_git` event re-pointed APR status at `origin/dev@21ee942e` — i.e. at the very commit that removed the page. |
| `/complaints/[caseNo]`    | UI-FE-OPS-CMPID | `origin/claude/ui-fe-ops-cmpid` (`app/complaints/[caseNo]/page.tsx`, commit `6bcce14c`)      | Finalized on owner branch; never merged into `dev`.                                                                                                                                             |
| `/contracts/[contractId]` | UI-FE-OPS-CONID | `origin/claude/ui-fe-ops-conid` (`app/contracts/[contractId]/page.tsx`, closeout `3b30f0a7`) | Finalized on owner branch; never merged into `dev`.                                                                                                                                             |

**Recovery is additive but not a cherry-pick.** Each owner branch is a divergent stale base — e.g. `origin/codex2/ui-fe-ops-apr` also _deletes_ `app/vehicles/[vehicleId]/page.tsx` and several `lib/*` files that `dev` now has, and edits `apps/api`. Merging a whole branch would clobber `dev`. The correct path is to **reconstruct each route directory additively onto `dev`** (new `app/<route>/` files only), then re-resolve cross-package imports (each page imports `@drts/contracts` types/constants and app-local `lib/*` helpers) against current `dev`, and gate on `@drts/ops-console-web` typecheck + build. This is real per-route integration work and is **out of scope for this closeout doc**; it should be tracked as its own task(s).

## Storybook parity status

`packages/ui-web/.storybook` builds, but its story set covers tenant / platform / partner surfaces only (`tenant-*.stories.tsx`, `platform-*.stories.tsx`, `partner-booking.stories.tsx`). There are **no Ops Console parity stories** — no `ops-*`, dispatch, incident, complaint, etc. stories exist anywhere in the repo. The acceptance clause "storybook parity stories pass" cannot be satisfied for Ops Console because the parity stories were never authored.

## Acceptance assessment

| Acceptance clause                               | Verdict                                                                                                                                                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| All 20 sub-tasks done                           | **Met** (board/machine-truth): all 20 + `UI-FE-TOKENS` are `done`/archived.                                                                                                                            |
| Closeout doc references each per spec packet §5 | **Met**: this document, signoff matrix §5.1–§5.20.                                                                                                                                                     |
| Storybook parity stories pass                   | **Not met**: no Ops Console parity stories exist.                                                                                                                                                      |
| Smoke test in dev VM clean                      | **Partial**: `typecheck` + `next build` are clean (exit 0), but cover **17 of 20** §5 routes; `/approval-requests` is a live nav 404; `/complaints/[caseNo]` and `/contracts/[contractId]` are absent. |

Because two clauses are not fully met, the umbrella is **not** being finalized to `done` by this closeout. The doc is the durable artifact recording the gap; the gap itself requires upstream integration work the umbrella does not own.

## Recommended follow-ups

1. **OPS route re-integration** (blocks umbrella `done`): additively reconstruct `/approval-requests`, `/complaints/[caseNo]`, `/contracts/[contractId]` onto `dev` from the approved owner branches above, gate on ops-console typecheck + build. Until then, either restore the route or remove the `/approval-requests` nav entry to clear the 404.
2. **Anchor-commit regression guard**: `21ee942e` silently deleted a shipped, approved page via an "auto-anchor pending work" cleanup. Worth a check that auto-anchor cleanup commits cannot delete approved sub-task artifacts on `dev`.
3. **Ops Console parity stories**: author the missing `packages/ui-web/src/ops-*.stories.tsx` set if "storybook parity stories pass" is to remain an acceptance gate, or amend the acceptance if Ops Console is intentionally story-exempt.

## Files added by this closeout

```text
docs/05-ui/ops-console-rebuild-closeout-20260601.md
```
