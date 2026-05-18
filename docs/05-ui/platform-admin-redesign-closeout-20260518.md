# Platform Admin Redesign — Wave 3 Closeout (2026-05-18)

Owner: Claude2 · Reviewer of record (this closeout): Copilot
Task: `ADM-UI-RD-010`
Planning ref: [`docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`](./drts-ui-redesign-workbreakdown-20260510.md)
Branches of record: `origin/feat/claude2-ui-redesign-foundation` (Wave 3 baseline, rows `-001`..`-004` and `-007`..`-009`) plus `origin/dev` (rows `-005` and `-006` after the 2026-05-18 history repair recovery PRs landed there directly).

## Purpose

Wave 3 closeout for the platform-admin-web redesign. The nine implementation tasks `ADM-UI-RD-001`..`ADM-UI-RD-009` have all reached `done` in `ai-status.json`. This document binds each shipped surface to:

- the **reviewer of record** who recorded the final transition to `done` in the task entry,
- the UTC timestamp at which that transition was recorded (`last_update` on the task entry),
- the shipped task-scoped commit (`commit_hash` on the task entry),
- the push branch the commit landed on (`push_branch` on the task entry).

The Wave 3 platform-admin surface set mirrors the Wave 2 ops-console packet and the parallel Wave 3 tenant-console packet (`docs/05-ui/tenant-console-redesign-closeout-20260514.md`): shell adoption + CSS strip (`-001` / `-002`), then per-surface redesigns of the existing IA (`-003`..`-009`). There is no parity-fill phase for platform-admin in Wave 3; the nine rows are the full slice.

## Verification scope

This closeout does **not** rerun the per-task acceptance commands. Each surface row cites the `last_update` timestamp on the corresponding `ADM-UI-RD-00x` task entry in `ai-status.json`, which is the moment the owner finalized the task into `done` after the reviewer's approval. The reviewer for `ADM-UI-RD-010` is asked to confirm only that:

1. each row's `commit_hash` is present on its cited push branch,
2. the cited reviewer + `done` timestamp matches the `ai-status.json` entry for that task,
3. the cited push branch resolves to a real ref (`feat/claude2-ui-redesign-foundation` for the original Wave 3 ship, `dev` for the 2026-05-18 recovery commits).

The Wave 3 acceptance set per task is fixed by the planning ref:

- `pnpm --filter @drts/platform-admin-web typecheck`
- `pnpm --filter @drts/platform-admin-web build`
- `pnpm --filter @drts/platform-admin-web test`
- `pnpm --filter @drts/ui-web typecheck` (companion acceptance for shared ui-web edits)

The exact rerun set per surface is captured in each task entry's `next` field at `done` time. This packet does not re-execute any leg; it cites what was rerun at task closeout time.

## Surface signoff matrix

| #             | Surface(s)                                              | Owner   | Reviewer | Approved (UTC)       | Shipped commit | Push branch                           |
| ------------- | ------------------------------------------------------- | ------- | -------- | -------------------- | -------------- | ------------------------------------- |
| ADM-UI-RD-001 | Shell adoption                                          | Codex   | Codex2   | 2026-05-10T18:53:13Z | `516321d7`     | `feat/claude2-ui-redesign-foundation` |
| ADM-UI-RD-002 | Ad-hoc CSS strip + ui-web primitive adopt               | Codex2  | Codex    | 2026-05-10T20:50:01Z | `edcf7e04`     | `feat/claude2-ui-redesign-foundation` |
| ADM-UI-RD-003 | PA_Home + PA_Health redesign                            | Codex2  | Claude2  | 2026-05-10T22:06:11Z | `cec9501e`     | `feat/claude2-ui-redesign-foundation` |
| ADM-UI-RD-004 | PA_Tenants list + PA_TenantDetail / Rollout redesign    | Codex2  | Codex    | 2026-05-10T23:25:44Z | `1940f1b6`     | `feat/claude2-ui-redesign-foundation` |
| ADM-UI-RD-005 | PA_Partners list + PA_PartnerDetail redesign            | Codex   | Codex2   | 2026-05-18T13:24:29Z | `67369562`     | `dev` (recovery via PR #146)          |
| ADM-UI-RD-006 | PA_Users + PA_Fleet + PA_Switchboard redesign           | Codex2  | Codex    | 2026-05-18T13:17:16Z | `0db61c06`     | `dev` (recovery via PR #145)          |
| ADM-UI-RD-007 | PA_Pricing redesign (含 publish flow)                    | Codex2  | Codex    | 2026-05-10T22:10:14Z | `60a8c7d6`     | `feat/claude2-ui-redesign-foundation` |
| ADM-UI-RD-008 | PA_Payments + PA_ReconciliationDetail redesign          | Codex2  | Codex    | 2026-05-11T00:53:53Z | `0812c990`     | `feat/claude2-ui-redesign-foundation` |
| ADM-UI-RD-009 | PA_Notices + PA_Audit + PA_Flags + PA_Adapters redesign | Codex2  | Codex    | 2026-05-11T01:29:09Z | `05a5e8b6`     | `feat/claude2-ui-redesign-foundation` |

All nine rows are recorded in machine truth in `ai-status.json` as `done` with `commit_hash`, `commit_subject`, `push_remote`, and `push_branch` fields populated. Seven rows ship on `origin/feat/claude2-ui-redesign-foundation` (the original Wave 3 shared trunk); the two rows that were recovered on 2026-05-18 (`-005` and `-006`) ship directly on `origin/dev` via squash-merged recovery PRs.

Reviewers can reproduce the redesign delta for any single surface row with:

```bash
git fetch origin
git diff $(git merge-base origin/dev <commit>)..<commit> -- apps/platform-admin-web packages/ui-web
```

## History repair note for `-005` and `-006`

Rows `ADM-UI-RD-005` and `ADM-UI-RD-006` originally produced a single mixed commit `f481c294` on the shared branch `feat/claude2-ui-redesign-foundation` that:

1. mixed both tasks' files into one subject (`feat(ADM-UI-RD-006): finalize users fleet switchboard redesign` contained partners files owned by `-005`),
2. was based on a stale `origin/dev` ancestor (`d82db884`), so a direct push / cherry-pick would have reintroduced outdated dev diffs.

The non-destructive recovery path is documented at `support/unblock/ADM-UI-RD-006/ADM-UI-RD-006-UNBLOCK-HISTORY-REPAIR.md`. Execution split the original mixed commit into two task-scoped recovery commits rooted at current `origin/dev`:

- `-006` recovery: PR #145, squash commit `0db61c06`, restores `app/users/page.tsx`, `app/fleet/page.tsx`, `app/switchboard/page.tsx`, `components/platform-ui.tsx`, and `packages/ui-web/src/platform-operations.stories.tsx`.
- `-005` recovery: PR #146, squash commit `67369562`, restores `app/partners/page.tsx`, `app/partners/[entrySlug]/page.tsx`, and `packages/ui-web/src/platform-partners.stories.tsx`.

No `feat/claude2-ui-redesign-foundation` history was force-rewritten. The shared branch keeps `f481c294` as an unmerged historical artifact; current `dev` contains only the two clean recovery commits.

## Outstanding items

- The reviewer of record listed for this closeout (`Copilot`) is paused in machine truth at the time of writing (`copilot: kind=quota`). A different available reviewer in `{Codex, Codex2, Gemini2}` may be assigned to confirm the matrix without invalidating the per-row reviewer-of-record citations above — those refer to the original per-task reviewer who signed off at `done` time, not to the Wave 3 closeout reviewer for this packet.
- This closeout does not enumerate canvas anchors per surface; the Wave 3 platform-admin canvas reference is `docs/05-ui/drts-design-canvas/Platform Admin.html` and the `PA_*` artboard set referenced by each task brief is the design source of truth for that surface.

## Files added by this closeout

```text
docs/05-ui/platform-admin-redesign-closeout-20260518.md
```
