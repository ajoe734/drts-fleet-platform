# Ops Console Rebuild — Umbrella Closeout (2026-06-01)

Owner: Claude · Reviewer: Claude2
Task: `UI-FE-OPS-UMBRELLA`
Spec packet: [`docs/05-ui/ops-console-design-handoff-packet-20260525.md`](./ops-console-design-handoff-packet-20260525.md) (per-page briefs are §5.1–§5.20)
Umbrella branch: `claude/ui-fe-ops-umbrella` (base `origin/dev @ 64cb4597`), HEAD `9153760c`
Provenance regenerated from machine truth on 2026-06-01 (see [Regeneration note](#regeneration-note)).

## Purpose

`UI-FE-OPS-UMBRELLA` is the status / closeout gate for the Ops Console rebuild. Its acceptance is:

> All 20 sub-tasks done; closeout doc references each per spec packet §5; storybook parity stories pass; smoke test in dev VM clean.

This document binds each of the 20 per-page briefs in spec packet §5 to its implementing sub-task, records the machine-truth `done` evidence for that sub-task (agent, commit, branch of record), and — critically — records **whether the approved rebuild is actually integrated into the trunk a dev-VM smoke test runs against** (`origin/dev`), versus living only on a per-owner lane branch.

**Headline finding (corrected from the 2026-05-28 draft).** All 20 sub-tasks + `UI-FE-TOKENS` are `done`/archived in machine truth, and every approved artifact is present on a reachable remote branch. **But trunk integration is only partial.** Of the 20 §5 routes:

- **7** carry the approved rebuild on `origin/dev` today.
- **3** were absent from `origin/dev` as files and are **additively reconstructed onto the umbrella branch** by this closeout (`/approval-requests` §5.9, `/complaints/[caseNo]` §5.6, `/contracts/[contractId]` §5.19).
- **10** have their approved rebuild **only on the owner lane branch**: `origin/dev` still serves pre-rebuild content (7 list pages are **distinct** pre-rebuild blobs, each smaller than its owner-branch rebuild — only `/drivers` and `/contracts` still carry `[DRAFT/BLOCKED]` markers; the other 5 are substantial earlier implementations, not the 2026-05-16 draft; 3 detail pages are pre-rebuild snapshots from 2026-05-24/05-16).

So the umbrella-branch `next build` resolves and compiles all 20 §5 route paths (exit 0), but it serves the **approved rebuild for only 10 of 20** surfaces (7 from `dev` + 3 reconstructed here); the other 10 build from pre-rebuild content carried on `dev`. The `/approval-requests` nav 404 (caused by the stray deletion `21ee942e`) is cleared by the reconstruction. See [§5 surface signoff matrix](#5-surface-signoff-matrix), [Dev-trunk integration status](#dev-trunk-integration-status), and [Acceptance assessment](#acceptance-assessment).

## Verification scope

Each sub-task was independently reviewed and finalized to `done` under its own task lifecycle; this closeout does **not** re-run per-task acceptance. It cites the final `done` event recorded in `ai-activity-log.jsonl` (agent, commit, push branch) for each sub-task, all of which are archived in `ai-status.json` `archived_task_ids`.

What this closeout **did** execute, against the umbrella branch `claude/ui-fe-ops-umbrella` (HEAD `9153760c`, base `origin/dev @ 64cb4597`; this branch carries only the additive route reconstruction + this doc on top of `dev`), re-run fresh on **2026-06-01T09:09–09:10Z**:

| Check                    | Command                                                          | Result        |
| ------------------------ | ---------------------------------------------------------------- | ------------- |
| Install                  | `pnpm install --frozen-lockfile`                                 | PASS (exit 0) |
| Prereq build             | `pnpm --filter @drts/contracts build`                            | PASS (exit 0) |
| Prereq build             | `pnpm --filter @drts/ui-tokens build`                            | PASS (exit 0) |
| Prereq build             | `pnpm --filter @drts/ui-web build`                               | PASS (exit 0) |
| Typecheck                | `pnpm --filter @drts/ops-console-web typecheck` (`tsc --noEmit`) | PASS (exit 0) |
| Production build / smoke | `pnpm --filter @drts/ops-console-web build` (`next build`)       | PASS (exit 0) |
| Storybook build          | `pnpm --filter @drts/ui-web build-storybook`                     | PASS (exit 0)¹ |

¹ The storybook bundle **builds**, but its story set covers tenant / platform / partner surfaces only — there are **no Ops Console parity stories**. A green `build-storybook` does not satisfy the "storybook parity stories pass" clause; see [Storybook parity status](#storybook-parity-status).

The `next build` route table is the integration ground truth. After the route reconstruction it emits all 20 §5 surfaces:

```
/  /_not-found  /approval-requests  /attendance  /callcenter
/complaints  /complaints/[caseNo]  /contracts  /contracts/[contractId]
/control-plane-proxy/[...path]  /dashboard  /dispatch  /dispatch/[dispatchId]
/drivers  /drivers/[driverId]  /feature-flags  /incidents  /incidents/[incidentId]
/maintenance  /reports  /revenue  /vehicles  /vehicles/[vehicleId]
```

That is **20 of 20** §5 route paths present and compiling. Path presence is **not** the same as rebuilt-content integration — see the `Trunk serves` column below and [Dev-trunk integration status](#dev-trunk-integration-status).

## §5 surface signoff matrix

`Trunk serves` legend (for `origin/dev @ 64cb4597`, which the umbrella branch is based on):
**rebuilt** = `dev` carries a post-rebuild canvas page; **pre-rebuild** = `dev` still carries pre-rebuild content (the approved rebuild is on the owner branch only); **reconstructed** = route file was absent from `dev` and is additively reconstructed onto the umbrella branch by this closeout.

| §5   | Route (packet)            | Sub-task        | Done agent | Approved artifact (commit · branch of record)              | Done (UTC)           | Trunk serves          |
| ---- | ------------------------- | --------------- | ---------- | ---------------------------------------------------------- | -------------------- | --------------------- |
| 5.1  | `/dashboard`              | UI-FE-OPS-DSH   | Codex2     | `961d2b64` · `origin/dev`²                                 | 2026-05-26T14:33:44Z | rebuilt               |
| 5.2  | `/dispatch`               | UI-FE-OPS-DSP   | Claude     | `3cad1681` · `origin/claude/ui-fe-ops-dsp`                 | 2026-06-01T01:39:52Z | rebuilt³              |
| 5.3  | `/dispatch/[dispatchId]`⁴ | UI-FE-OPS-DSPID | Claude     | `9679480b` · `origin/claude/ui-fe-ops-dspid`               | 2026-06-01T07:20:14Z | pre-rebuild           |
| 5.4  | `/callcenter`             | UI-FE-OPS-CC    | Claude2    | `314daff9` · `origin/claude2/ui-fe-ops-cc`                 | 2026-06-01T03:12:04Z | pre-rebuild (draft)   |
| 5.5  | `/complaints`             | UI-FE-OPS-CMP   | Claude2    | `4777a5a9` · `origin/claude2/ui-fe-ops-cmp`                | 2026-06-01T07:22:17Z | pre-rebuild (draft)   |
| 5.6  | `/complaints/[caseNo]`    | UI-FE-OPS-CMPID | Claude     | `6bcce14c` · `origin/claude/ui-fe-ops-cmpid`               | 2026-06-01T00:06:44Z | reconstructed⁵        |
| 5.7  | `/incidents`              | UI-FE-OPS-INC   | Claude     | `d57c1c3c` · `origin/claude/ui-fe-ops-inc`                 | 2026-06-01T01:39:49Z | rebuilt³              |
| 5.8  | `/incidents/[incidentId]` | UI-FE-OPS-INCID | Claude     | `74488fcd` · `origin/claude/ui-fe-ops-incid`               | 2026-06-01T07:38:45Z | pre-rebuild           |
| 5.9  | `/approval-requests`      | UI-FE-OPS-APR   | Codex2     | `da75b550` · `origin/codex2/ui-fe-ops-apr`⁶                | 2026-05-27T05:49:20Z | reconstructed⁷        |
| 5.10 | `/reports`                | UI-FE-OPS-RPT   | Claude     | `06f51973` · `origin/claude/ui-fe-ops-rpt`                 | 2026-06-01T00:47:07Z | pre-rebuild (draft)   |
| 5.11 | `/revenue`                | UI-FE-OPS-REV   | Codex      | `64cb4597` · `origin/dev`⁸                                 | 2026-05-29T04:14:51Z | rebuilt               |
| 5.12 | `/attendance`             | UI-FE-OPS-ATT   | Claude     | `54a37cbe` · `origin/claude/ui-fe-ops-att`                 | 2026-06-01T07:23:15Z | rebuilt³              |
| 5.13 | `/maintenance`            | UI-FE-OPS-MNT   | Claude     | `5c60732e` · `origin/claude/ui-fe-ops-mnt`                 | 2026-06-01T03:02:16Z | pre-rebuild (draft)   |
| 5.14 | `/drivers`                | UI-FE-OPS-DRV   | Claude     | `43e33e1c` · `origin/claude/ui-fe-ops-drv`⁹                | 2026-06-01T05:08:02Z | pre-rebuild (draft)   |
| 5.15 | `/drivers/[driverId]`     | UI-FE-OPS-DRVID | Claude     | `0c01bb37` · `origin/claude/ui-fe-ops-drvid`               | 2026-06-01T06:44:18Z | pre-rebuild           |
| 5.16 | `/vehicles`               | UI-FE-OPS-VEH   | Codex2     | `c42ac488` · `origin/codex2/ui-fe-ops-veh`                 | 2026-05-27T06:39:37Z | rebuilt               |
| 5.17 | `/vehicles/[vehicleId]`   | UI-FE-OPS-VEHID | Codex2     | `b9fe9412` · `origin/codex2/ui-fe-ops-vehid`               | 2026-05-28T10:34:40Z | rebuilt               |
| 5.18 | `/contracts`              | UI-FE-OPS-CON   | Claude2    | `45fd9bae` · `origin/claude2/ui-fe-ops-con`                | 2026-06-01T07:21:18Z | pre-rebuild (draft)   |
| 5.19 | `/contracts/[contractId]` | UI-FE-OPS-CONID | Claude     | `3b30f0a7` · `origin/claude/ui-fe-ops-conid`¹⁰             | 2026-06-01T01:00:45Z | reconstructed¹¹       |
| 5.20 | `/feature-flags`          | UI-FE-OPS-FF    | Claude     | `684d69f9` · `origin/claude/ui-fe-ops-ff`                  | 2026-06-01T02:36:00Z | pre-rebuild (draft)   |

Foundation dependency: `UI-FE-TOKENS` — Codex, `4b8af668`, `origin/codex/ui-fe-tokens`, 2026-05-31T14:15:56Z. Consumed by the prereq `@drts/ui-tokens` build above (PASS).

Every commit hash above was verified reachable from a remote branch at regeneration time (`git branch -r --contains`).

² The owner closeout commit recorded in the `done` event (`35ae4509` on `origin/codex2/ui-fe-ops-dsh`) is now **orphaned** — reachable from no remote branch after the codex2 lane's history rewrite. The rebuilt dashboard is integrated on `origin/dev` at `961d2b64` (`UI-FE-OPS-DSH` auto-anchor, 2026-05-29). The current owner-branch tip carries the page at `3ee24149`.
³ `origin/dev` serves a post-rebuild canvas page integrated via the `UI-HANDOFF-OC-PAGE-*` lane (`/dispatch` `a7600cf1`, `/incidents` `854e45d0`, `/attendance` `a21e7304`, all 2026-05-29). That dev content is rebuilt (not the 2026-05-16 draft); whether it is byte-identical to the `UI-FE-OPS-*` owner-branch artifact above was not diffed here.
⁴ Spec packet names the param `[workItemId]`; the implemented route is `/dispatch/[dispatchId]`. Naming only — surface present and builds.
⁵ Reconstructed additively from `origin/claude/ui-fe-ops-cmpid` (`app/complaints/[caseNo]/page.tsx`). Absent from `origin/dev` as a file. The `dev` `/complaints` list page was **not** modified by this closeout (it remains the pre-rebuild draft).
⁶ The owner closeout commit in the `done` event (`26587e81` on `origin/codex2/ui-fe-ops-apr`) is now **orphaned**. The current owner branch carries the approval-requests page at `da75b550` (tip `b329aafd`).
⁷ Reconstructed additively from the reviewer-approved repair branch `origin/claude/ui-fe-ops-umbrella-unblock-history-repair` (`app/approval-requests/page.tsx`, byte-identical to the pre-deletion `dev` blob `21ee942e^` / reviewed PR#67 `60818b38`). The shell nav (`apps/ops-console-web/lib/ops-shell-nav.ts`) link to `/approval-requests` no longer 404s.
⁸ The owner closeout commit in the `done` event (`6ccce080` on `origin/codex/ui-fe-ops-rev`) is now **orphaned** (the reviewer's reopen note also cited this orphaned hash). The rebuilt revenue page is integrated on `origin/dev` at `64cb4597` (`UI-FE-OPS-REV` auto-anchor, 2026-06-01). The current owner-branch tip carries the page at `9685e838`.
⁹ `done` event records the artifact at `43e33e1c` on `origin/claude/ui-fe-ops-drv`; `6adb27a6` (cited in the prior draft of this matrix) is the `dev` merge-base tip the branch was freshened against, not the artifact commit.
¹⁰ `done` event records the closeout commit `3b30f0a7` on `origin/claude/ui-fe-ops-conid`; `17c59a22` (cited in the reviewer's reopen note) is the prior remote tip from the push log `17c59a22..3b30f0a7`, not the final commit.
¹¹ Reconstructed additively from `origin/claude/ui-fe-ops-conid` (`app/contracts/[contractId]/page.tsx` + `contract-detail-controls.tsx`). Absent from `origin/dev` as a file. The `dev` `/contracts` list page is itself pre-rebuild and has **no** detail `Link`; the reconstructed `[contractId]` route is reachable by direct URL only.

## Dev-trunk integration status

This is the umbrella's central question and the part the 2026-05-28 draft got wrong. Counting against `origin/dev @ 64cb4597`:

| Trunk state                                                                 | Count | Routes                                                                                                                  |
| --------------------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------- |
| Rebuild present on `origin/dev`                                             | 7     | `/dashboard`, `/dispatch`, `/incidents`, `/revenue`, `/attendance`, `/vehicles`, `/vehicles/[vehicleId]`               |
| Rebuild reconstructed onto umbrella branch (route absent from `dev`)        | 3     | `/approval-requests`, `/complaints/[caseNo]`, `/contracts/[contractId]`                                                |
| Rebuild on owner branch only — `dev` serves distinct pre-rebuild blobs¹²    | 7     | `/callcenter`, `/complaints`, `/reports`, `/maintenance`, `/drivers`, `/contracts`, `/feature-flags`                   |
| Rebuild on owner branch only — `dev` serves a pre-rebuild detail snapshot   | 3     | `/dispatch/[dispatchId]`, `/incidents/[incidentId]`, `/drivers/[driverId]`                                             |

¹² The 7 list pages on `origin/dev @ 64cb4597` are **7 distinct blobs**, not one shared `[DRAFT/BLOCKED]` draft (an earlier draft of this doc wrongly cited a single blob `9a387ebd`): `/callcenter` `c3db0a51` (1930 ln), `/complaints` `cd78e904` (1415 ln), `/reports` `17f12413` (1484 ln), `/maintenance` `7bb37be4` (1067 ln), `/drivers` `dc5cfff3` (273 ln), `/contracts` `aa00b31b` (312 ln), `/feature-flags` `5aa1d0d1` (133 ln). Only `/drivers` and `/contracts` contain `DRAFT`/`BLOCKED` markers; the other 5 are substantial earlier implementations. Each is smaller than its owner-branch rebuild (e.g. `/callcenter` dev 1930 vs owner 3373; `/drivers` dev 273 vs owner 1550; `/feature-flags` dev 133 vs owner 1275), so all 7 are pre-rebuild content the owner-lane rebuild supersedes.

**On the umbrella branch build, 10 of 20 §5 surfaces serve the approved rebuild** (7 inherited from `dev` + 3 reconstructed here). The remaining **10 build from pre-rebuild content** carried on `dev` — their approved rebuilds are `done` and pushed on the owner lane branches listed in the matrix, but were never merged into `dev`. Whole-merging those owner branches into `dev` is not safe as a closeout edit: several carry divergent stale bases that delete or rewrite unrelated `app/*`, `lib/*`, and `apps/api` files (the same hazard documented for the 3 reconstructed routes below). Trunk consolidation of these 10 owner-branch rebuilds is the primary follow-up (see follow-up #1).

## Route consolidation: 3 stragglers integrated additively

The three §5 routes that had reached `done` in machine truth but were **absent from `dev` as files** are reconstructed onto the umbrella branch. The work is strictly **additive** (new `app/<route>/` directories only); no sibling list page and no divergent owner branch was whole-merged.

| Route                     | Sub-task        | Source ref used                                           | Files added                                                                                      |
| ------------------------- | --------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `/approval-requests`      | UI-FE-OPS-APR   | `origin/claude/ui-fe-ops-umbrella-unblock-history-repair` | `app/approval-requests/page.tsx`                                                                 |
| `/complaints/[caseNo]`    | UI-FE-OPS-CMPID | `origin/claude/ui-fe-ops-cmpid`                           | `app/complaints/[caseNo]/page.tsx`                                                               |
| `/contracts/[contractId]` | UI-FE-OPS-CONID | `origin/claude/ui-fe-ops-conid`                           | `app/contracts/[contractId]/page.tsx`, `app/contracts/[contractId]/contract-detail-controls.tsx` |

**Why this is safe.** Each owner branch is a divergent stale base — e.g. `origin/codex2/ui-fe-ops-apr` also _deletes_ `app/vehicles/[vehicleId]/page.tsx` and several `lib/*` files that `dev` now has, and edits `apps/api`. Whole-merging any of them would clobber `dev`. Instead, only the new route directories were checked out; each page's cross-package imports (`@drts/contracts` types/constants, `@drts/ui-web` components, and app-local `@/lib/*` helpers) resolve against current `dev`, proven by `tsc --noEmit` (exit 0) and `next build` (exit 0). The earlier-anchored deletion `21ee942e` is left intact; no history was rewritten and no force-push was used.

## Storybook parity status

`packages/ui-web/.storybook` builds (`build-storybook` exit 0), but its story set covers tenant / platform / partner surfaces only (`tenant-*.stories.tsx`, `platform-*.stories.tsx`, `partner-booking.stories.tsx`). There are **no Ops Console parity stories** — no `ops-*`, dispatch, incident, complaint, etc. stories exist anywhere in the repo. The acceptance clause "storybook parity stories pass" cannot be satisfied for Ops Console because the parity stories were never authored. This is an unmet acceptance clause and is an authoring workstream outside closeout scope (see follow-up #2).

## Acceptance assessment

| Acceptance clause                               | Verdict                                                                                                                                                                                                                                                                       |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| All 20 sub-tasks done                           | **Met** (board/machine-truth): all 20 + `UI-FE-TOKENS` are `done`/archived; every approved artifact is on a reachable remote branch.                                                                                                                                          |
| Closeout doc references each per spec packet §5 | **Met**: this document, signoff matrix §5.1–§5.20, with reachable commit + branch of record per surface.                                                                                                                                                                      |
| Smoke test in dev VM clean                      | **Partially met.** Umbrella-branch `pnpm install`, prereq builds, `tsc --noEmit`, and `next build` all exit 0; all 20 §5 route paths resolve; the `/approval-requests` nav 404 is cleared. **But the build serves the approved rebuild for only 10 of 20 surfaces** — 10 build from pre-rebuild content on `dev` (see [Dev-trunk integration status](#dev-trunk-integration-status)). A dev-VM smoke test of the *rebuilt* Ops Console is therefore not yet possible end-to-end on the trunk. |
| Storybook parity stories pass                   | **Not met**: no Ops Console parity stories exist; never authored.                                                                                                                                                                                                            |

Two clauses are fully met. **"Smoke test clean" is only partially met** (build is green; rebuilt-content integration covers 10/20 of the trunk), and **"storybook parity stories" is not met**. Both remaining gaps require work beyond a doc closeout: a trunk-consolidation merge wave (follow-up #1) and a story-authoring workstream (follow-up #2). This closeout therefore **does not self-finalize to `done`**; it hands the regenerated provenance + honest integration status to reviewer `Claude2` for triage of the open clauses. The ship-target decision below is now resolved to (a) `origin/dev`, routing both open clauses to follow-up waves W1/W2 without weakening either gate.

## Ship-target decision — resolved to (a) `origin/dev`

The reviewer's reopen asked to confirm whether owner-branch-only artifacts match the intended ship target. The machine-truth answer is broader than first noted: **10 of 20 rebuilds live only on owner branches** (not just the 3 file-absent routes). The choice was: either (a) `origin/dev` is the ship target and a consolidation wave must merge the 10 owner-branch rebuilds into it before the umbrella can claim trunk integration, or (b) per-branch ship is intended and the umbrella's "smoke test in dev VM clean" clause should be amended to "approved + buildable per owner branch."

**Resolution (2026-06-01):** the decision was escalated above umbrella-owner scope; the human declined to hand-arbitrate. The owner therefore defaults to **(a) `origin/dev` as the ship target**, which is the conservative reading and is consistent with `AI_COLLABORATION_GUIDE.md` precedence — `origin/dev` is the canonical integration trunk and "smoke test in dev VM clean" is the literal acceptance clause. This default deliberately **does not amend or weaken either open acceptance clause**: clauses 3 ("smoke clean") and 4 ("storybook parity") remain real gates, now routed to the registered follow-up waves rather than retired. Consequently the umbrella **cannot self-finalize to `done`** until those waves land:

- **W1 `UI-FE-OPS-TRUNK-CONSOLIDATE`** (backlog, `depends_on UI-FE-OPS-UMBRELLA`) — closes clause 3 by merging the 10 owner-branch rebuilds onto `dev`.
- **W2 `UI-FE-OPS-STORYBOOK-PARITY`** (backlog, `depends_on UI-FE-OPS-UMBRELLA`) — closes clause 4 by authoring the missing `ops-*` parity stories.

The umbrella will finalize to `done` only after W1 + W2 complete and a true dev-VM smoke passes 20/20. Until then it remains owner-side open with this honest provenance handed to reviewer `Claude2`.

## Recommended follow-ups

1. **Trunk consolidation of 10 owner-branch rebuilds** (blocks true "smoke test clean"): merge the approved rebuilds for `/callcenter`, `/complaints`, `/reports`, `/maintenance`, `/drivers`, `/contracts`, `/feature-flags`, `/dispatch/[dispatchId]`, `/incidents/[incidentId]`, `/drivers/[driverId]` from their owner branches into `dev`. Each owner branch carries a divergent stale base, so this needs per-route additive integration (as done for the 3 stragglers), not whole-branch merges. Track as a dedicated wave.
2. **Ops Console parity stories** (blocks the last acceptance clause): author the missing `packages/ui-web/src/ops-*.stories.tsx` set if "storybook parity stories pass" is to remain an acceptance gate, or amend the acceptance if Ops Console is intentionally story-exempt.
3. **`/contracts` → `[contractId]` entry point** (cosmetic): the `dev` `/contracts` list page is itself pre-rebuild and has no detail `Link`; once it is rebuilt + integrated, add the detail link so the reconstructed `[contractId]` route is reachable in-app, not just by direct URL.
4. **Orphaned-commit / anchor-cleanup regression guard**: 5 recorded `done`-event commits (`35ae4509` DSH, `26587e81` APR, `6ccce080` REV, plus the reviewer-cited `ea233a00` CC and `f87e5362` MNT from earlier matrix revisions) are orphaned by lane history rewrites, and `21ee942e` silently deleted a shipped, approved page via an "auto-anchor pending work" cleanup. Worth a guard that closeout-cited commits stay reachable and that auto-anchor cleanup cannot delete approved sub-task artifacts on `dev`.

## Regeneration note

The prior provenance matrix (2026-05-28 draft, and the partial 2026-06-01 revision) was regenerated against current machine truth on 2026-06-01:

- Re-derived each surface's branch of record + commit from the latest `done` event in `ai-activity-log.jsonl`, then verified each hash reachable via `git branch -r --contains`.
- Replaced 3 orphaned `done`-event commits with their current reachable location (`35ae4509`→`961d2b64`/`dev` for DSH; `26587e81`→`da75b550`/owner branch for APR; `6ccce080`→`64cb4597`/`dev` for REV).
- Corrected `DRV` from the dev merge-base `6adb27a6` to the artifact commit `43e33e1c`; kept `DSP` (`3cad1681`) and `CONID` (`3b30f0a7`), which were correct in the prior matrix (the reviewer's alternate `b40953a6`/`17c59a22` were a superseded source blob and a prior push-log tip, respectively).
- Corrected the doc header `Reviewer` from `Codex2` to `Claude2`.
- Re-ran the full build + storybook evidence chain (2026-06-01T09:09–09:10Z) and added the `Trunk serves` column + [Dev-trunk integration status](#dev-trunk-integration-status), which corrects the prior "20 of 20 integrated / smoke clean" claim to the true 10-of-20 rebuilt-on-trunk state.

## Files added/changed by this closeout

```text
docs/05-ui/ops-console-rebuild-closeout-20260601.md                       (this doc)
apps/ops-console-web/app/approval-requests/page.tsx                       (reconstructed §5.9)
apps/ops-console-web/app/complaints/[caseNo]/page.tsx                     (reconstructed §5.6)
apps/ops-console-web/app/contracts/[contractId]/page.tsx                  (reconstructed §5.19)
apps/ops-console-web/app/contracts/[contractId]/contract-detail-controls.tsx (reconstructed §5.19)
```
