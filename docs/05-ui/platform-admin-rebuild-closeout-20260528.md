# Platform Admin Rebuild Closeout (2026-05-28)

Owner: Codex2  
Reviewer: Claude2  
Task: `UI-FE-ADM-UMBRELLA`

## Scope

This closeout covers the Phase 1 Platform Admin rebuild umbrella after all 18 child tasks reached `done` in canonical machine truth.

The umbrella acceptance bar was:

- all 18 sub-tasks `done`
- closeout document recorded
- storybook parity checked
- smoke-ready verification clean

## Outcome

The umbrella is ready for reviewer handoff.

During umbrella audit, the branch initially lacked the shipped reimbursement routes even though `UI-FE-ADM-REIMB` and `UI-FE-ADM-REIMBID` were already `done` in machine truth. This closeout reconciles that integration gap by restoring:

- `apps/platform-admin-web/app/payments/reimbursements/page.tsx`
- `apps/platform-admin-web/app/payments/reimbursements/[batchId]/page.tsx`
- `packages/api-client/src/index.ts` method `getReimbursementBatch(...)`

After reconciliation, the Platform Admin route inventory includes all expected rebuild routes, including both reimbursement surfaces.

## Child Task Matrix

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

Commands executed in this umbrella branch after reconciliation:

```bash
pnpm --filter @drts/platform-admin-web typecheck
pnpm --filter @drts/platform-admin-web build
pnpm --filter @drts/platform-admin-web test
pnpm --filter @drts/ui-web build-storybook
```

Results:

- `typecheck`: pass
- `build`: pass
- `test`: pass (`vitest` reported no test files, exited 0)
- `build-storybook`: pass

The Next.js production build route table now includes:

- `/payments/reimbursements`
- `/payments/reimbursements/[batchId]`

Storybook parity evidence remains in `packages/ui-web/src/platform-operations.stories.tsx` and `packages/ui-web/src/platform-partners.stories.tsx`, and the static Storybook build completed successfully for the shared Platform Admin UI surface set.

## Reviewer Focus

Reviewer should confirm:

1. the umbrella branch now contains both reimbursement routes plus the shared client method needed by the detail page
2. the child-task matrix matches canonical `ai-status.json`
3. the verification commands above are sufficient to satisfy umbrella acceptance
