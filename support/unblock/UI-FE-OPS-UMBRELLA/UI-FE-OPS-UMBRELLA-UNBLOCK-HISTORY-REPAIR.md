# UI-FE-OPS-UMBRELLA — Unblock / History Repair

- **Task:** `UI-FE-OPS-UMBRELLA-UNBLOCK-HISTORY-REPAIR`
- **Parent (blocked):** `UI-FE-OPS-UMBRELLA` — *Ops Console rebuild — umbrella status / closeout*
- **Owner:** `Claude` · **Reviewer:** `Claude2`
- **Date:** 2026-06-01
- **Constraint honoured:** no force-push to shared history; all repair is **additive** on `dev`.

---

## 1. Summary

The parent umbrella is `blocked` because **3 of the 20 packet §5 Ops Console routes are absent from `origin/dev`** even though all 20 sub-tasks are `done`/archived. This task performs the forensic root-cause analysis, classifies each missing route, **repairs the one clean regression in-place** (the `approval-requests` route — a live 404), and documents a **non-destructive, no-force-push** integration path for the remaining two (which were never merged to `dev`).

Baseline at investigation time: `origin/dev` tip `64cb4597`; `ops-console-web` typecheck + `next build` already PASS on that tip; 18 `page.tsx` files present (17 of them packet §5 routes + the root `app/page.tsx`).

---

## 2. The contamination — exact commit identified

```
commit 21ee942e0533dadd3cea31a9e97975efa6b43de8
    UI-FE-OPS-APR: cleanup commit — auto-anchor pending work
    LLM-Agent: codex
    Task-ID: UI-FE-OPS-APR
    Reviewer: Claude
    Source: auto-cleanup sweep 2026-05-28 (uncommitted worktree state)

 .../tenant-partner/tenant-partner.controller.ts    |  57 +++++
 .../tenant-partner/tenant-partner.service.ts       | 175 ++++++++++++++-
 .../ops-console-web/app/approval-requests/page.tsx | 236 ---------------------   <-- destructive
 packages/api-client/src/index.ts                   |  36 ++++
 packages/contracts/src/index.ts                    |   2 +
 5 files changed, 269 insertions(+), 237 deletions(-)
```

**Root cause.** Commit `21ee942e` is an *auto-cleanup sweep of uncommitted worktree state* (2026-05-28). It bundled legitimate, wanted backend/contract work (`tenant-partner` controller/service, `api-client`, `contracts`) **together with a destructive deletion** of `apps/ops-console-web/app/approval-requests/page.tsx`. That page had already been **reviewed and merged to `dev`** via PR #67 (`60818b38 — feat(OPS-UI-APR-001-MANUAL): ops approval-requests route + sidebar entry`). The sweep captured a contaminated worktree in which the file happened to be deleted, and that deletion rode into `dev` inside an otherwise-legit commit. This is the textbook failure that the §11 anchor-commit protocol exists to prevent: a "cleanup/auto-anchor" commit must never delete a peer lane's finished, merged work.

Net effect on `dev`:
- The contract symbols the page depends on (`TENANT_BOOKING_APPROVAL_REQUEST_STATUSES`, the api-client method) **are present** — they were *added* by the same commit.
- Only the **frontend page** was removed, leaving `lib/ops-shell-nav.ts` linking `/approval-requests` → **live 404**.

---

## 3. The three missing routes — classified

| Route (packet §5) | Sub-task | Path | Status on `dev` | Class | Recovery source |
|---|---|---|---|---|---|
| Approval Requests | `UI-FE-OPS-APR` | `app/approval-requests/page.tsx` | **deleted** (added `60818b38`, deleted `21ee942e`) | **Regression** — clean revert of erroneous deletion | `21ee942e^:apps/ops-console-web/app/approval-requests/page.tsx` (blob `16854db2`, 236 lines = the reviewed #67 version) |
| Complaint detail | `UI-FE-OPS-CMPID` | `app/complaints/[caseNo]/page.tsx` | **never merged** | **Additive integration** — new §5.6 route; dev list uses in-page `?caseNo=` master-detail instead | `origin/claude/ui-fe-ops-cmpid` tip `6bcce14c` (1449 lines) |
| Contract detail | `UI-FE-OPS-CONID` | `app/contracts/[contractId]/page.tsx` | **never merged** | **Additive integration** — new §5 route; linked (live 404) from `vehicles/[vehicleId]` lines 853/1413 | `origin/claude/ui-fe-ops-conid` tip `3b30f0a7` (703 lines) |

> **Correction to the parent `next` note:** it stated the approved APR code "lives only on owner branches (origin/codex2/ui-fe-ops-apr)". In fact the **authoritative reviewed APR version was merged to `dev` via #67** and only later deleted; the owner branch `codex2/ui-fe-ops-apr` (`b329aafd`, a "wip cleanup auto-anchor" tip, blob `f3dd5b3d`) is a *divergent* copy. The cleanest, lowest-risk recovery is therefore the pre-deletion `dev` blob (`21ee942e^`), **not** the owner branch. This is what was restored (§4).

---

## 4. Repair performed in this task (APR — clean regression revert)

The `approval-requests` route is the only one of the three that is a **pure regression** (it was on `dev`, then erroneously deleted), so it is repaired here directly — additive, no force-push:

```bash
git checkout 21ee942e^ -- apps/ops-console-web/app/approval-requests/page.tsx
```

**Safety verification (all imported symbols confirmed present on `origin/dev`):**

| Import | Source on dev |
|---|---|
| `PageHeader` | `@drts/ui-web` → `packages/ui-web/src/canvas-primitives/index.tsx` |
| `OpsPendingApprovalRequestRecord`, `TenantBookingApprovalRequestStatus` (types) | `@drts/contracts` → `packages/contracts/src/index.ts:1401`, `:1365` |
| `TENANT_BOOKING_APPROVAL_REQUEST_STATUSES` | `@drts/contracts` → `packages/contracts/src/index.ts:2` |
| `getOpsClient` | `@/lib/api-client` → `apps/ops-console-web/lib/api-client.ts` |
| `useTranslation` | `@/lib/i18n` → `apps/ops-console-web/lib/i18n.tsx:59` |

Because the contract/api-client dependencies were added by `21ee942e` itself and are already on `dev`, re-adding the page restores it to a state that previously typechecked and built under #67. Verification evidence is recorded in §6.

---

## 5. Documented non-destructive path for CMPID + CONID (follow-up tasks)

These two routes were **never merged** to `dev`; their approved code lives only on divergent owner branches. They must **not** be cherry-picked or merged wholesale (those branches sit on stale bases and would clobber `dev`). The correct path is **per-route additive re-integration onto a fresh `dev` base, with symbol verification + typecheck/build gating**, identical in shape to the APR safety check above:

```bash
# per route, from a fresh branch on origin/dev:
git switch -c claude/<route>-reintegrate origin/dev
git checkout <owner-branch-tip> -- <route page.tsx>     # additive add only
# verify every @drts/* and @/lib import resolves on dev (grep packages/contracts, ui-web, api-client)
# pnpm install && pnpm --filter ops-console-web typecheck && pnpm --filter ops-console-web build
git add <route page.tsx> && git commit ... && git push -u origin <branch>
gh pr create --base dev ...
```

Sources: CMPID ← `origin/claude/ui-fe-ops-cmpid@6bcce14c`; CONID ← `origin/claude/ui-fe-ops-conid@3b30f0a7`.

A parity-story task (Ops Console storybook stories — none currently exist) is also required by the umbrella acceptance and is independent of this history repair.

**No force-push anywhere.** Every step above is an additive file add on a fresh branch + normal PR. The contaminating commit `21ee942e` is **left in history untouched** — its legit backend half stays; we re-add the frontend it wrongly removed.

---

## 6. Verification evidence

Repair commit: `45e8ae97` on branch `claude/ui-fe-ops-umbrella-unblock-history-repair` (base `origin/dev@64cb4597`).

- **Restore:** `apps/ops-console-web/app/approval-requests/page.tsx` re-added (236 lines) from blob `21ee942e^`.
- **Imported-symbol resolution against `origin/dev`:** all present (table §4).
- **`pnpm install --frozen-lockfile`:** exit 0.
- **Workspace dep build** (`@drts/contracts`, `@drts/ui-tokens`, `@drts/ui-web`, `@drts/api-client`): exit 0.
- **`pnpm --filter ops-console-web typecheck`** (`tsc --noEmit`): **exit 0** — clean.
- **`pnpm --filter ops-console-web build`** (`next build`): **exit 0** — "Compiled successfully", TypeScript pass. Route table now lists **`ƒ /approval-requests`** alongside the other 20 routes, confirming the live 404 is cleared and the restored route compiles into the production tree.

---

## 7. Concrete unblocked next step for the parent (`UI-FE-OPS-UMBRELLA`)

1. **APR — DONE here:** `approval-requests` route restored on branch `claude/ui-fe-ops-umbrella-unblock-history-repair` → PR to `dev`. Clears the `/approval-requests` live 404. (1 of 3 routes closed.)
2. **CMPID + CONID — create 2 follow-up additive-integration tasks** using §5 (sources + non-force flow). Each re-adds one new route from its owner-branch tip onto a fresh `dev` base with typecheck/build gating.
3. **Parity stories — create 1 follow-up task** to author the missing Ops Console storybook parity stories.
4. Once routes (2) land and stories (3) exist, the umbrella's "17/20 → 20/20 §5 routes + storybook parity" acceptance is met and `UI-FE-OPS-UMBRELLA` can move `blocked → review`.

The umbrella was blocked on a *destructive deletion + two never-merged routes*, none of which require rewriting shared history. This task removes the destructive-deletion blocker outright and converts the remaining gap into three well-scoped, additive follow-up tasks.
