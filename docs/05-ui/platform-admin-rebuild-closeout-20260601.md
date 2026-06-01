# Platform Admin Rebuild Closeout (2026-06-01)

Owner: Claude
Reviewer: Codex2
Task: `UI-FE-ADM-UMBRELLA`

> This document supersedes the earlier draft closeouts (`platform-admin-rebuild-closeout-20260528.md`,
> `…-20260601.md` on the prior owner branch). The chairman reassigned the umbrella owner from
> `Codex` to `Claude` after the prior owner lane hit the 2/2 terminal-failure threshold on this
> coordination-heavy closeout. Owner/reviewer separation is preserved (`owner=Claude`,
> `reviewer=Codex2`).

## Scope

This closeout covers the Phase 1 Platform Admin rebuild umbrella after all 18 child tasks reached
`done` in canonical machine truth (`ai-status.json` → `archived_task_ids`).

The umbrella acceptance bar was:

- all 18 sub-tasks `done`
- closeout document recorded
- storybook parity checked
- smoke test clean

## Dependency Gate (machine truth)

All 18 dependency IDs are present in canonical `ai-status.json` `archived_task_ids` (i.e. finalized
`done` and removed from the active board). Confirmed 2026-06-01 against the canonical machine-truth
root, not the active-board slice. An earlier audit pass reported "only 2 of 18 done" — that was a
stale-active-board misread: archived/done tasks do not appear on the active task board, so reading the
active list alone undercounts completion. The authoritative source for completion of an archived task
is `archived_task_ids`.

| #  | Task                | In `archived_task_ids` |
| -- | ------------------- | ---------------------- |
| 1  | `UI-FE-ADM-HOME`    | yes |
| 2  | `UI-FE-ADM-TEN`     | yes |
| 3  | `UI-FE-ADM-TENID`   | yes |
| 4  | `UI-FE-ADM-TENGOV`  | yes |
| 5  | `UI-FE-ADM-PRT`     | yes |
| 6  | `UI-FE-ADM-PRTID`   | yes |
| 7  | `UI-FE-ADM-USR`     | yes |
| 8  | `UI-FE-ADM-FLT`     | yes |
| 9  | `UI-FE-ADM-SWB`     | yes |
| 10 | `UI-FE-ADM-PRC`     | yes |
| 11 | `UI-FE-ADM-PAY`     | yes |
| 12 | `UI-FE-ADM-REIMB`   | yes |
| 13 | `UI-FE-ADM-REIMBID` | yes |
| 14 | `UI-FE-ADM-HLT`     | yes |
| 15 | `UI-FE-ADM-NTC`     | yes |
| 16 | `UI-FE-ADM-AUD`     | yes |
| 17 | `UI-FE-ADM-FF`      | yes |
| 18 | `UI-FE-ADM-ADP`     | yes |

## Reimbursement Route Reconciliation

During umbrella audit, current `origin/dev` was found to be missing the shipped reimbursement routes
even though `UI-FE-ADM-REIMB` and `UI-FE-ADM-REIMBID` were already `done` in machine truth. This
closeout reconciles that integration gap by restoring, on top of current `origin/dev`:

- `apps/platform-admin-web/app/payments/reimbursements/page.tsx` (batch queue)
- `apps/platform-admin-web/app/payments/reimbursements/[batchId]/page.tsx` (batch detail)
- `packages/api-client/src/index.ts` — `ApiClient.getReimbursementBatch(batchId)` used by the detail page

The restore was taken from the prior owner's verified closeout commit `0b226f5c` and cherry-picked
onto a branch based on current `origin/dev` (`f0f32531`); the `api-client` change auto-merged against
the moved trunk with no conflict. After reconciliation the Platform Admin route inventory includes all
expected rebuild routes, including both reimbursement surfaces.

### Route inventory (apps/platform-admin-web/app/**/page.tsx) after reconciliation

`/` · `/adapter-registry` · `/audit` · `/feature-flags` · `/fleet` · `/health` · `/notices` ·
`/partners` · `/partners/[entrySlug]` · `/payments` · `/payments/reimbursements` ·
`/payments/reimbursements/[batchId]` · `/pricing` · `/switchboard` · `/tenant-governance` ·
`/tenants` · `/users`

## Child Task Matrix

Sourced from canonical machine truth via the prior closeout audit; commit/branch columns are the
per-child finalize evidence recorded at each child's `done`.

| Task                | Owner   | Reviewer | Status | Recorded at (UTC)    | Commit                                     | Push branch                |
| ------------------- | ------- | -------- | ------ | -------------------- | ------------------------------------------ | -------------------------- |
| `UI-FE-ADM-HOME`    | Codex2  | Claude   | `done` | 2026-05-27T05:14:34Z | `03ff08b0337bc5e7cf1c6a74fb2781ba65867d9b` | `codex2/ui-fe-adm-home`    |
| `UI-FE-ADM-TEN`     | Claude2 | Codex2   | `done` | 2026-05-28T12:47:44Z | `71dae584f6d49f55a0209d1c4d1968ec82a433b2` | `claude2/ui-fe-adm-ten`    |
| `UI-FE-ADM-TENID`   | Codex2  | Claude   | `done` | 2026-05-27T09:22:16Z | `a954feb1`                                 | `codex2/ui-fe-adm-tenid`   |
| `UI-FE-ADM-TENGOV`  | Codex   | Claude2  | `done` | 2026-05-26T17:51:54Z | `4ff2ea8fb81944850c3a53fb5212ff051a7995b5` | `codex/ui-fe-adm-tengov`   |
| `UI-FE-ADM-PRT`     | Codex   | Claude   | `done` | 2026-05-27T09:26:09Z | `dcc4b6a599b6dd20bbf49373673dc9ae7445142c` | `codex/ui-fe-adm-prt`      |
| `UI-FE-ADM-PRTID`   | Codex2  | Claude2  | `done` | 2026-05-28T03:35:48Z | `acaea208a95e567513551c568480f9de7eeec38c` | `codex2/ui-fe-adm-prtid`   |
| `UI-FE-ADM-USR`     | Codex   | Claude2  | `done` | 2026-05-28T03:56:45Z | `88392d8f54387f2afaf0de02d688c62e1f2a5a18` | `codex/ui-fe-adm-usr`      |
| `UI-FE-ADM-FLT`     | Codex   | Claude   | `done` | 2026-05-28T04:51:59Z | `a779f31f5d05acb5a9ee565dbd7e73085d754e50` | `codex/ui-fe-adm-flt`      |
| `UI-FE-ADM-SWB`     | Codex2  | Claude2  | `done` | 2026-05-28T04:00:14Z | `9185826b2bb28b0f5cb93e00ef7421299e7386a6` | `codex2/ui-fe-adm-swb`     |
| `UI-FE-ADM-PRC`     | Codex   | Claude   | `done` | 2026-05-27T09:41:46Z | `f3cc7432b5bf46224ef544122be37fe71a360fbc` | `codex/ui-fe-adm-prc`      |
| `UI-FE-ADM-PAY`     | Codex2  | Claude2  | `done` | 2026-05-28T04:15:17Z | `5330106731998281bb8dbe86d0b27a6701909737` | `codex2/ui-fe-adm-pay`     |
| `UI-FE-ADM-REIMB`   | Codex2  | Claude2  | `done` | 2026-05-28T04:34:43Z | `0a1f5617a04b324aa979e9c11e6da6b508da1edc` | `codex2/ui-fe-adm-reimb`   |
| `UI-FE-ADM-REIMBID` | Codex2  | Claude   | `done` | 2026-05-28T08:21:49Z | `7df176ff8c576e254e0e9f95db9daa83de68dda8` | `codex2/ui-fe-adm-reimbid` |
| `UI-FE-ADM-HLT`     | Codex2  | Claude2  | `done` | 2026-05-28T04:28:17Z | `936f426630706693bf880b7d79674a310db8e5b1` | `codex2/ui-fe-adm-hlt`     |
| `UI-FE-ADM-NTC`     | Codex   | Claude2  | `done` | 2026-05-28T06:51:05Z | `63787e76fb7ebf7d275729b1357e4d8187503120` | `codex/ui-fe-adm-ntc`      |
| `UI-FE-ADM-AUD`     | Codex2  | Claude2  | `done` | 2026-05-28T12:09:38Z | `7d8b86121d49867f16d47ebdef9e433f54465503` | `codex2/ui-fe-adm-aud`     |
| `UI-FE-ADM-FF`      | Codex   | Claude2  | `done` | 2026-05-28T06:30:53Z | `9414b22f375ef3cf3a38f38acd52db72550d6ac5` | `codex/ui-fe-adm-ff`       |
| `UI-FE-ADM-ADP`     | Codex   | Claude2  | `done` | 2026-05-28T07:01:47Z | `3a6b89b8183a5ac77dd8c5cf4c495c6865573149` | `codex/ui-fe-adm-adp`      |

## Verification

Commands executed in this umbrella worktree after reconciliation (results recorded in the closeout
commit body):

```bash
pnpm --filter @drts/platform-admin-web typecheck
pnpm --filter @drts/platform-admin-web build
pnpm --filter @drts/platform-admin-web test
pnpm --filter @drts/ui-web build-storybook
```

The Next.js production build route table includes the restored reimbursement surfaces:

- `/payments/reimbursements`
- `/payments/reimbursements/[batchId]`

Storybook parity evidence for the shared Platform Admin UI surface lives in
`packages/ui-web/src/platform-operations.stories.tsx` and
`packages/ui-web/src/platform-partners.stories.tsx`; the static Storybook build completes for that
surface set.

## Smoke Test — Planning Decision

The acceptance line "smoke test clean" is interpreted here as **smoke-ready**: the production build
succeeds and the full route table (including both reimbursement surfaces) is emitted. A *live* HTTP
smoke against a running Platform Admin instance is **not executable in the worker environment** —
there is no API target listening on `http://localhost:3001` in the isolated worktree, and the worker
has no way to stand up the backend. This was the same unsatisfiable-bar gap that contributed to the
prior owner's terminal token-exhaustion loop.

Decision: satisfy the umbrella acceptance via the build-time smoke-ready evidence above (build green +
route table complete + typecheck/test/storybook green). A live `localhost:3001` end-to-end smoke is
deferred to an environment that provisions the API (e.g. CI compose or a staging target) and is out of
scope for this offline closeout. Reviewer should treat build-time smoke-readiness as the acceptance
signal for this umbrella unless a live-smoke environment is made available.

## Reviewer Focus (Codex2)

Reviewer should confirm:

1. all 18 child IDs are present in canonical `ai-status.json` `archived_task_ids`
2. the umbrella branch is based on current `origin/dev` and contains both reimbursement routes plus the
   shared `getReimbursementBatch` client method needed by the detail page
3. typecheck / build / test / build-storybook pass on the umbrella branch
4. the smoke-test planning decision above is an acceptable interpretation of the acceptance line, or
   a live-smoke environment is supplied
