# OPS-MP-002 SIDECAR ACCEPTANCE

Status: review (round 5 refresh handoff to `Codex` after the round-4 packet was reopened for stale round metadata and contradictory remote-evidence prose)
Owner: Claude2 (reassigned from Claude per availability-first reassignment at `2026-05-08T07:16:16Z`)
Reviewer: Codex
Last Update: 2026-05-08

> Snapshot note: this packet refresh runs under `OPS-MP-002-SIDECAR-ACCEPTANCE` round 5. Round 4 was reopened at `2026-05-08T07:30:59Z` because (a) line 14 still said the parent snapshot was from the round-3 refresh while the rest of the document was already labelled round 4, and (b) line 18 still claimed `git ls-remote` from the local environment resolved the parent OPS-MP-002 commit, contradicting line 143 which recorded that the same `ls-remote` had failed for lack of GitHub credentials. Reviewer additionally confirmed from their own environment that `git ls-remote origin codex/dev-deploy-backend-android` currently resolves to the moving branch tip `76dfbe0470e14b462254eaa50adaca3d44a0bdce`, not the parent OPS-MP-002 commit. Round 5 corrects that by giving the packet one internally consistent round-5 snapshot, separating "historical-at-handoff" facts (the `push_*` fields pinned in `ai-status.json` at parent closeout) from "current re-checkable" facts (the moving remote tip on the shared branch and per-environment `ls-remote` capability). Authoritative lifecycle state for both this sidecar and parent `OPS-MP-002` continues to live in `ai-status.json`; the packet does not redefine parent closeout, it mirrors the recorded commit / push evidence.

## 目的

為 `OPS-MP-002`（Adapter Health and Reconciliation Operations）準備非侵入式 acceptance 支援包。本檔只整理 acceptance checklist、dependency map、live parent snapshot 與 evidence anchors，不修改 canonical truth。

Parent task live snapshot at this round-5 packet refresh:

- `OPS-MP-002` status: `done` (reviewer `Claude2` previously approved; parent owner `Codex` finalized closeout — task-scoped commit and push evidence recorded in `ai-status.json`).
- Parent owner / reviewer: `Codex` / `Claude2`.
- Parent commit / push of record (`ai-status.json` `OPS-MP-002.commit_hash` / `commit_subject` / `push_remote` / `push_branch` / `push_recorded_at`): `a9227925d154fef6f2b2a2b892c4a2bbe44f547f` `feat(OPS-MP-002): surface adapter health and reconciliation ops` on `origin/codex/dev-deploy-backend-android`, recorded `2026-05-08T06:53:42Z`. This is the historical-at-handoff fact and is the canonical closeout evidence; it does not move when other tasks land on the same branch. The current remote tip on `origin/codex/dev-deploy-backend-android` is a different (later) commit — see the Live Parent Snapshot section for the per-environment `ls-remote` trace.
- Parent declared write scope: `apps/ops-console-web`, `apps/api/src/modules/operational-observability` (per execution packet); shared contracts touched purely additively.
- Parent reviewer approval evidence (`ai-status.json` `OPS-MP-002.review_notes_zh`): adapter health 卡片 / forwarder ops backlog 指標 (`sync_failed` / `accept_pending` / `manual_fallback` / reconciliation 含最老 lag) / `adapter_degradation` 警示與雙語文案皆對齊 spec；`pnpm --filter @drts/api typecheck`、`pnpm --filter @drts/ops-console-web typecheck`、`operational-observability.service.test.ts` 全部通過；contracts 為純加法擴充。
- Parent acceptance commands of record (`ai-status.json` `OPS-MP-002.acceptance`): `pnpm --filter @drts/ops-console-web typecheck`, `pnpm --filter @drts/api typecheck`. Reviewer additionally exercised `pnpm --filter @drts/api exec vitest run tests/unit/operational-observability.service.test.ts`; that is parent reviewer evidence and is not redefined by this sidecar. Verification trailers in commit `a9227925` mirror those three commands.

## Canonical 來源 (read-only references)

- Product spec: `docs/01-product/driver-app-multi-platform-product-spec-20260507.md:940` (task table) and section 3 ops scope (`adapter health`, `reconciliation queue`) at lines 96-178
- Execution packet: `docs/03-runbooks/driver-app-multi-platform-execution-packet-20260507.md:383-402`
- Parent machine truth: `ai-status.json` entries for `OPS-MP-002`, `OPS-MP-002-SIDECAR-ACCEPTANCE`, and dependency `API-MP-003`
- Live parent implementation snapshot:
  - `apps/api/src/modules/operational-observability/operational-observability.service.ts`
  - `apps/api/tests/unit/operational-observability.service.test.ts`
  - `apps/ops-console-web/app/dashboard/page.tsx`
  - `packages/contracts/src/index.ts` (added `OperationalAdapterDetailRecord`, `OperationalForwarderOpsMetrics`, `OperationalAdapterMetrics`, `OperationalRoleView`, snapshot extensions)
- Contract anchors used by OPS-MP-002:
  - `packages/contracts/src/index.ts:3306-3320` — `AdapterHealthStatus` / `AdapterHealthReason`
  - `packages/contracts/src/index.ts:3507-3520` — `AdapterHealthRecord`
  - `packages/contracts/src/index.ts:4240-4302` — `OperationalAdapterMetrics`, `OperationalForwarderOpsMetrics`, `OperationalAdapterDetailRecord`, `OperationalRoleView`, `OperationalObservabilitySnapshot`

## Acceptance Checklist (sidecar deliverables)

- [x] Acceptance checklist (this file)
- [x] Dependency map scoped to `OPS-MP-002` and its declared prerequisites
- [x] Reviewer-facing notes mapped to the three product-spec acceptance bullets and the two recorded verification commands
- [x] Evidence anchors limited to live read-only file references and `ai-status.json` machine truth
- [x] Canonical truth left untouched outside sidecar lifecycle updates through `scripts/ai-status.sh`
- [x] Lifecycle history captured in the handoff log: round-1 reopen for stale `in_progress` claim, round-2 reopen after parent advanced to `done`, round-3 reopen after the round-2 packet text lagged behind the sidecar's `review` snapshot, round-4 reopen for stale local-HEAD snapshot plus availability-first owner reassignment to `Claude2`, round-5 reopen for stale round-3 metadata on line 14 and contradictory `ls-remote` prose between line 18 and line 143
- [x] Round-5 refresh handoff back to `Codex` executed via `AI_NAME=Claude2 scripts/ai-status.sh handoff OPS-MP-002-SIDECAR-ACCEPTANCE Codex "..."` (see Handoff log step 16)

### Parent verification steps (`Codex` → `Claude2`, completed and finalized)

The parent owner / reviewer own the canonical implementation; reviewer `Claude2` approved the parent and parent owner `Codex` finalized closeout (commit `a9227925d154fef6f2b2a2b892c4a2bbe44f547f`, pushed to `origin/codex/dev-deploy-backend-android`, recorded `2026-05-08T06:53:42Z`). This sidecar only restates the spec-derived checks that the reviewer evidence covers; it does not regenerate that evidence.

1. Canonical write scope was bounded to `apps/ops-console-web` and `apps/api/src/modules/operational-observability` (with additive shared-contract additions in `packages/contracts/src/index.ts`).
2. Ops can see `healthy` / `degraded` / `down` / `auth` / `rate-limit` / `webhook` states — surface lives in `apps/ops-console-web/app/dashboard/page.tsx` adapter cards via `observability.adapterDetails[]` and `ADAPTER_STATUS_STYLES`, fed by `OperationalAdapterDetailRecord` in `packages/contracts/src/index.ts:4258-4272`.
3. Sync error and reconciliation queues are actionable from the dashboard — `forwarderOps.syncFailedOrders`, `forwarderOps.reconciliationQueue` and their oldest-lag fields drive the `platformOpsCards` block at `apps/ops-console-web/app/dashboard/page.tsx:394-440`.
4. Stuck `accept-pending` and `manual fallback` backlog are visible — `forwarderOps.acceptPendingOrders`, `forwarderOps.manualFallbackQueue` and their lag fields are emitted alongside the same metric grid at `apps/ops-console-web/app/dashboard/page.tsx:415-431`.
5. The `adapter_degradation` operational alert is wired through `observability.alerts` and the ops-role view (`getAlertSummary` switch case at `apps/ops-console-web/app/dashboard/page.tsx:188-193`).
6. Parent acceptance commands of record:

```bash
pnpm --filter @drts/ops-console-web typecheck
pnpm --filter @drts/api typecheck
```

Reviewer also ran `pnpm --filter @drts/api exec vitest run tests/unit/operational-observability.service.test.ts`. All three commands are recorded as green in the parent's `review_notes_zh`.

### Sidecar reviewer checklist (`Codex`)

- Confirm this packet matches the live machine-truth snapshot: parent `OPS-MP-002` is `done` under `Codex` / `Claude2` with commit `a9227925d154fef6f2b2a2b892c4a2bbe44f547f` on `origin/codex/dev-deploy-backend-android` recorded `2026-05-08T06:53:42Z`; sidecar `OPS-MP-002-SIDECAR-ACCEPTANCE` is in `review` under `Claude2` / `Codex` (owner reassigned from `Claude` at `2026-05-08T07:16:16Z`) after the round-5 refresh handoff captured in the Handoff log below.
- Confirm the dependency map only references prerequisites that already exist in `ai-status.json` and the product/execution docs, with no speculation.
- Confirm the packet only mirrors parent commit / push / `done` evidence taken from `ai-status.json` and remote ref resolution, and does not redefine parent closeout.
- Confirm this sidecar only writes under `support/sidecars/OPS-MP-002/`.
- Approve when satisfied:

```bash
AI_NAME=Codex scripts/ai-status.sh approve OPS-MP-002-SIDECAR-ACCEPTANCE \
  "Reviewed: OPS-MP-002 acceptance packet aligned to current parent snapshot (done; commit a9227925 pushed to origin/codex/dev-deploy-backend-android), dependency map, and reviewer evidence without mutating canonical truth."
```

If changes are required:

```bash
AI_NAME=Codex scripts/ai-status.sh reopen OPS-MP-002-SIDECAR-ACCEPTANCE "<reason>"
```

## Dependency Map

### Hard prerequisite (declared in execution packet)

| Source       | Status                                                                                                                                                                                     | Why it matters                                                                                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `API-MP-003` | `done` (owner `Codex2`, reviewer `Copilot`; commit / push commit `339168451c3feeea7396e8bbbdc197ad4d583363` on `origin/codex/dev-deploy-backend-android`, recorded `2026-05-08T03:29:48Z`) | Owns the production adapter hardening baseline that emits the auth / webhook / idempotency / health / rate-limit / credential-status signals consumed by OPS-MP-002 surfaces. |

### Practical / co-evolving anchors (verifiable, read-only)

| Anchor | Location                                                                                                   | Why it matters now                                                                                                                                                                                                                                                   |
| ------ | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-1    | `packages/contracts/src/index.ts:3306-3320`                                                                | `AdapterHealthStatus` (`healthy` / `degraded` / `down` etc.) and `AdapterHealthReason` enums are the canonical source of the dashboard status chips and reason copy.                                                                                                 |
| D-2    | `packages/contracts/src/index.ts:4258-4272`                                                                | `OperationalAdapterDetailRecord` carries per-platform credential / auth / webhook / rate-limit signals plus `lastError`, `lastWebhookReceivedAt`, `lastRateLimitAt`, `lastAuthFailureAt` — directly drives the adapter card grid.                                    |
| D-3    | `packages/contracts/src/index.ts:4240-4256`                                                                | `OperationalAdapterMetrics` (`totalAdapters` / `healthy` / `degraded` / `down`) and `OperationalForwarderOpsMetrics` (sync-failed, accept-pending, manual-fallback, reconciliation queues + oldest-lag minutes) are the metrics behind the `platformOpsCards` block. |
| D-4    | `packages/contracts/src/index.ts:4274-4302`                                                                | `OperationalRoleView` and `OperationalObservabilitySnapshot` formalize the `ops` route's `alertKeys` and the `adapters` / `forwarder_ops` focus areas.                                                                                                               |
| D-5    | `apps/api/src/modules/operational-observability/operational-observability.service.ts:1-46,129-170,442-490` | Service builds the snapshot, joins adapter health with forwarded order / reconciliation issue data, and emits the adapter-degradation alert input.                                                                                                                   |
| D-6    | `apps/ops-console-web/app/dashboard/page.tsx:166-246,380-440,691-773`                                      | Dashboard renders the `adapter_degradation` alert summary, builds `platformOpsCards` from `forwarderOps`, and maps `adapterDetails` into per-adapter cards with status chips and signal tiles.                                                                       |
| D-7    | `docs/01-product/driver-app-multi-platform-product-spec-20260507.md:96-178,940`                            | Product spec lists adapter health, sync errors, reconciliation issues / queues / completion as in-scope ops capabilities and pins OPS-MP-002 to that scope.                                                                                                          |
| D-8    | `docs/03-runbooks/driver-app-multi-platform-execution-packet-20260507.md:383-402`                          | Execution packet defines the three OPS-MP-002 acceptance bullets and the two recorded verification commands.                                                                                                                                                         |

### Out of scope for this sidecar

- Editing canonical contract surfaces (`packages/contracts/*`), API service code (`apps/api/*`), ops-console runtime code (`apps/ops-console-web/*`), L1/L2 spec files, or execution packet text.
- Re-issuing or rewriting parent task-scoped commit, push, or `done` closeout for `OPS-MP-002`. Closeout has already been recorded in `ai-status.json` (commit `a9227925`, push `origin/codex/dev-deploy-backend-android`); this sidecar only mirrors that evidence.
- Redefining acceptance bullets or verification commands; the packet defers to the spec and execution packet.

## Acceptance Mapping

| Spec acceptance bullet (`docs/03-runbooks/driver-app-multi-platform-execution-packet-20260507.md:391-396`) | Live implementation anchor                                                                                                                                                                                                                      | Reviewer focus                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ops can see `healthy` / `degraded` / `down` / `auth` / `rate-limit` / `webhook` states.                    | `apps/ops-console-web/app/dashboard/page.tsx:709-773` (adapter card grid + status chip), backed by `observability.adapterDetails[]` from `apps/api/src/modules/operational-observability/operational-observability.service.ts`.                 | Confirm every status emitted by `AdapterHealthStatus` is renderable via `ADAPTER_STATUS_STYLES`, and that credential / auth / webhook / rate-limit signals are individually visible per platform.    |
| Sync error and reconciliation queues are actionable.                                                       | `apps/ops-console-web/app/dashboard/page.tsx:405-440` (sync-failed and reconciliation cards in `platformOpsCards`), with backlog summaries from `OperationalForwarderOpsMetrics.oldestSyncFailedLagMinutes` / `oldestReconciliationLagMinutes`. | Confirm sync-failed and reconciliation queue counts plus oldest-lag are surfaced; verify the existing forwarded-dispatch CTA referenced in the parent handoff still routes to an actionable surface. |
| Stuck `accept-pending` and manual fallback backlog are visible.                                            | `apps/ops-console-web/app/dashboard/page.tsx:415-431` (accept-pending and manual-fallback cards), with lag values from `oldestAcceptPendingLagMinutes` / `oldestManualFallbackLagMinutes`.                                                      | Confirm both metrics render with backlog summaries and bilingual labels, and that null-lag falls back to the `noLag` copy.                                                                           |

## Live Parent Snapshot (verification trace at packet refresh)

This section deliberately distinguishes two things that were conflated in earlier rounds, and further separates **historical-at-handoff facts** (pinned, immutable) from **current re-checkable facts** (which may differ across environments and across time):

1. **Local branch tip** — the moving cursor at the head of the shared `codex/dev-deploy-backend-android` branch, which advances whenever any task on this branch lands a commit. This is a current re-checkable fact; it is not the parent's commit/push evidence.
2. **Parent OPS-MP-002 commit/push evidence** — the immutable, task-scoped record pinned in `ai-status.json` (`commit_hash`, `commit_subject`, `push_remote`, `push_branch`, `push_recorded_at`). This is the historical-at-handoff fact and the canonical closeout artefact; it does not move when other tasks land.

### Historical-at-handoff (pinned in machine truth)

- Parent OPS-MP-002 commit of record (pinned, does not move): `a9227925d154fef6f2b2a2b892c4a2bbe44f547f` (short `a922792`), subject `feat(OPS-MP-002): surface adapter health and reconciliation ops`. `git log --oneline a9227925d154fef6f2b2a2b892c4a2bbe44f547f -1` confirms the commit is reachable from the local branch. Trailers on this commit (`LLM-Agent: Codex`, `Task-ID: OPS-MP-002`, `Reviewer: Claude2`) match the parent owner / reviewer recorded in `ai-status.json`, and the verification block lists `pnpm --filter @drts/ops-console-web typecheck`, `pnpm --filter @drts/api typecheck`, and `pnpm --filter @drts/api exec vitest run tests/unit/operational-observability.service.test.ts`.
- Parent push of record: `OPS-MP-002.push_commit` / `push_branch` / `push_remote` in `ai-status.json` record `a9227925d154fef6f2b2a2b892c4a2bbe44f547f` on `origin/codex/dev-deploy-backend-android` at `2026-05-08T06:53:42Z`. This is the canonical remote-alignment evidence captured at parent closeout. It is not invalidated by later commits landing on the same branch — the push event itself is immutable in machine truth.
- Parent state machine progression as of parent closeout: `OPS-MP-002` is `done`, `last_update` `2026-05-08T06:53:42Z`. Reviewer evidence remains in `OPS-MP-002.review_notes_zh`. This sidecar tracks that snapshot but does not progress the parent state machine.

### Current re-checkable (may vary by environment / move over time)

- Local branch tip at this refresh: `git log -1 --format=%H` resolves to `76dfbe0470e14b462254eaa50adaca3d44a0bdce`, subject `docs(ADM-UI-001-SIDECAR-ACCEPTANCE): add acceptance packet`. This is **not** the parent commit; it is the most recent commit on the shared branch as observed at the time of this round-5 refresh. Between the parent OPS-MP-002 commit and this local tip, two unrelated commits have landed (`d984936 docs(DRV-UI-010): file driver app verification packet`, `76dfbe0 docs(ADM-UI-001-SIDECAR-ACCEPTANCE): add acceptance packet`). They are sidecar/verification-packet artefacts for other tasks and do not modify OPS-MP-002 scope. This value will move whenever any task on this shared branch lands a new commit.
- Remote tip on `origin/codex/dev-deploy-backend-android`: per the reviewer's verification at the round-4 reopen (`2026-05-08T07:30:59Z`), `git ls-remote origin codex/dev-deploy-backend-android` from the reviewer's environment resolved to `76dfbe0470e14b462254eaa50adaca3d44a0bdce` — i.e., the moving branch tip, not the parent OPS-MP-002 commit. From this owner's (`Claude2`'s) environment at the round-5 refresh, the same command fails with `fatal: could not read Username for 'https://github.com'` because the owner environment lacks GitHub credentials. The owner-environment `ls-remote` failure does not affect the canonical remote-alignment evidence, which is the `push_*` fields recorded in `ai-status.json` at parent closeout. The reviewer-environment `ls-remote` confirmation shows the remote has accepted the parent push and at least the two later sidecar-packet commits, with no rewrite of the parent commit history.
- Worktree delta against `HEAD` for OPS-MP-002 surfaces (informational, not commit evidence):

```
git diff --stat HEAD -- \
  apps/api/src/modules/operational-observability/ \
  apps/api/tests/unit/operational-observability.service.test.ts \
  apps/ops-console-web/app/dashboard/page.tsx \
  packages/contracts/src/index.ts
```

produced (at this refresh): empty output — no remaining worktree delta against the local branch tip for the OPS-MP-002 surfaces. All of the changes the prior rounds summarized (operational-observability service + tests, ops-console dashboard, additive contract types) are folded into the parent's task-scoped commit `a9227925`, which sits in the branch history a few commits behind the moving local tip. (`apps/api/src/modules/platform-presence/platform-presence.service.ts` shows an unrelated localized-string change in the worktree; it is outside OPS-MP-002 write scope and belongs to a separate canonical task.)

## Evidence Inventory

- Sidecar artifact: `support/sidecars/OPS-MP-002/OPS-MP-002-SIDECAR-ACCEPTANCE.md`
- Parent machine truth: `ai-status.json` entry for `OPS-MP-002` — status `done`, owner `Codex`, reviewer `Claude2`, `commit_hash` `a9227925d154fef6f2b2a2b892c4a2bbe44f547f`, `commit_subject` `feat(OPS-MP-002): surface adapter health and reconciliation ops`, `push_remote` `origin`, `push_branch` `codex/dev-deploy-backend-android`, `push_recorded_at` `2026-05-08T06:53:42Z`
- Sidecar machine truth: `ai-status.json` entry for `OPS-MP-002-SIDECAR-ACCEPTANCE` — status `review` after the round-5 refresh handoff captured below; owner `Claude2` (reassigned from `Claude` at `2026-05-08T07:16:16Z`), reviewer `Codex`. The `last_update` field on this entry tracks each lifecycle transition (`progress`, `handoff`) recorded via `scripts/ai-status.sh` and is the authoritative timestamp source — this packet does not duplicate that timestamp inline to avoid drift.
- Dependency closure: `API-MP-003` `done` with commit / push commit `339168451c3feeea7396e8bbbdc197ad4d583363` on `origin/codex/dev-deploy-backend-android`, recorded `2026-05-08T03:29:48Z`
- Spec / runbook anchors: `docs/01-product/driver-app-multi-platform-product-spec-20260507.md:96-178,940`; `docs/03-runbooks/driver-app-multi-platform-execution-packet-20260507.md:383-402`
- Live implementation anchors (now folded into commit `a9227925`): `apps/api/src/modules/operational-observability/operational-observability.service.ts`, `apps/api/tests/unit/operational-observability.service.test.ts`, `apps/ops-console-web/app/dashboard/page.tsx`, `packages/contracts/src/index.ts`

## Handoff / Evidence

Owner action log for this sidecar:

1. `AI_NAME=Claude scripts/ai-status.sh start OPS-MP-002-SIDECAR-ACCEPTANCE "Drafting OPS-MP-002 acceptance packet, dependency map, and reviewer evidence under support/sidecars/OPS-MP-002/."`
2. Initial draft handoff to `Codex` for review (sidecar moved to `review`).
3. Reviewer reopened the sidecar (round 1) because the packet still asserted parent `OPS-MP-002` was `in_progress` and that the sidecar handoff had not yet executed; sidecar returned to `in_progress`.
4. `AI_NAME=Claude scripts/ai-status.sh progress OPS-MP-002-SIDECAR-ACCEPTANCE "Refreshing sidecar packet to match current machine truth: parent OPS-MP-002 is review_approved under Codex/Claude2, sidecar was reopened to in_progress; updating snapshot, mapping, and handoff sections."`
5. Refreshed packet (round 1) and re-handed off to `Codex`; sidecar moved back to `review`.
6. Reviewer reopened the sidecar (round 2) because parent `OPS-MP-002` had advanced from `review_approved` to `done` (commit `a9227925`, push `origin/codex/dev-deploy-backend-android`, recorded `2026-05-08T06:53:42Z`) before the prior handoff was approved, leaving the snapshot stale again. Sidecar returned to `in_progress`.
7. `AI_NAME=Claude scripts/ai-status.sh progress OPS-MP-002-SIDECAR-ACCEPTANCE "Refreshing sidecar packet against current machine truth: parent OPS-MP-002 is now done (commit a9227925, pushed to origin/codex/dev-deploy-backend-android at 2026-05-08T06:53:42Z); refreshing header, snapshot, acceptance checklist, evidence inventory, and handoff log."`
8. Round-2 refresh of the sidecar packet and re-handoff to `Codex`; sidecar moved to `review` at `2026-05-08T07:01:18Z`.
9. Reviewer reopened the sidecar (round 3) because the round-2 packet text still described the pre-handoff lifecycle (`in_progress`, "round-2 refresh handoff pending", "sidecar machine truth in_progress / will advance later"), even though `ai-status.json` had already moved the sidecar to `review` after the round-2 handoff. Sidecar returned to `in_progress` for prose-only correction.
10. `AI_NAME=Claude scripts/ai-status.sh progress OPS-MP-002-SIDECAR-ACCEPTANCE "Round-3 refresh: rewriting sidecar header / acceptance checklist / evidence inventory / handoff log so the packet describes the round-3 review snapshot at handoff time, eliminating 'will advance later' future-tense lifecycle language."`
11. Round-3 refresh of this support artifact in place under `support/sidecars/OPS-MP-002/OPS-MP-002-SIDECAR-ACCEPTANCE.md`. No canonical-truth edits; only the sidecar markdown changed and lifecycle updates flow through `scripts/ai-status.sh`. Re-handoff to `Codex` at `2026-05-08T07:10:55Z`.
12. Reviewer reopened the sidecar (round 4) at `2026-05-08T07:14:39Z` because the round-3 packet's Live Parent Snapshot still claimed `HEAD = a922792` and equated `HEAD commit at this refresh` with the parent OPS-MP-002 commit, even though the local branch tip had advanced past `a922792` to `d984936e10e3942871668afa3225763e522af76f` at `2026-05-08T07:09:30Z` before the round-3 file was written at `2026-05-08T07:10:48Z`. Reviewer asked for the HEAD/worktree trace to distinguish the local branch tip from parent OPS-MP-002 commit/push evidence.
13. Owner reassigned from `Claude` to `Claude2` at `2026-05-08T07:16:16Z` per availability-first reassignment (Claude was unavailable or occupied). Reviewer remains `Codex`. `AI_NAME=Claude2 scripts/ai-status.sh progress OPS-MP-002-SIDECAR-ACCEPTANCE "Round-4 refresh under new owner Claude2 (reassigned from Claude per availability-first reassignment). Fixing Live Parent Snapshot HEAD trace: local HEAD is 76dfbe0 (docs(ADM-UI-001-SIDECAR-ACCEPTANCE)), parent OPS-MP-002 commit a9227925/a922792 sits two commits back in history. Distinguishing local branch tip from parent commit/push evidence and updating handoff log."`
14. Round-4 refresh of this support artifact in place under `support/sidecars/OPS-MP-002/OPS-MP-002-SIDECAR-ACCEPTANCE.md`: header status / owner field updated to round-4 / `Claude2`, acceptance checklist gained the round-4 line, sidecar reviewer checklist now reflects the `Claude2 / Codex` owner-reviewer pair, Live Parent Snapshot section split into "local branch tip" vs. "parent OPS-MP-002 commit/push evidence" with the local tip pinned to `76dfbe0` and the parent commit pinned to `a9227925`, evidence inventory updated for the new owner, and remote ref alignment notes the local environment lacks GitHub credentials so canonical remote-alignment evidence stays the `push_*` fields recorded in `ai-status.json` at parent closeout. No canonical-truth edits; only the sidecar markdown changed and lifecycle updates flow through `scripts/ai-status.sh`. Re-handoff to `Codex`:

```bash
AI_NAME=Claude2 scripts/ai-status.sh handoff OPS-MP-002-SIDECAR-ACCEPTANCE Codex \
  "Round-4 refresh under new owner Claude2 (reassigned from Claude at 2026-05-08T07:16:16Z per availability-first reassignment). Live Parent Snapshot HEAD trace fixed: local branch tip pinned to 76dfbe0470e14b462254eaa50adaca3d44a0bdce (docs(ADM-UI-001-SIDECAR-ACCEPTANCE)) and explicitly distinguished from parent OPS-MP-002 commit/push evidence (a9227925d154fef6f2b2a2b892c4a2bbe44f547f on origin/codex/dev-deploy-backend-android, recorded 2026-05-08T06:53:42Z in ai-status.json). Header / owner field / acceptance checklist / reviewer checklist / evidence inventory all updated. ls-remote check from local env failed for lack of GitHub credentials; canonical remote-alignment evidence remains ai-status.json push_* fields. No canonical truth modified outside support/sidecars/OPS-MP-002/."
```

15. Reviewer reopened the sidecar (round 5) at `2026-05-08T07:30:59Z` because the round-4 packet still contained stale round metadata and contradictory remote-evidence prose. Specifically: line 14 still said "Parent task live snapshot at this round-3 packet refresh" while the rest of the document was already round 4, and the "Parent commit / push of record" bullet still claimed local `git ls-remote` resolved to the parent commit at this refresh, which contradicted the Live Parent Snapshot section that recorded the same `ls-remote` had failed for lack of GitHub credentials. Reviewer also confirmed from their own environment that `git ls-remote origin codex/dev-deploy-backend-android` succeeds and resolves to `76dfbe0470e14b462254eaa50adaca3d44a0bdce` (the moving branch tip), not the parent OPS-MP-002 commit. Reviewer asked the packet to land one internally consistent round-5 snapshot that distinguishes historical-at-handoff facts (the `push_*` fields pinned in `ai-status.json` at parent closeout) from current re-checkable facts (the moving remote tip on the shared branch and per-environment `ls-remote` capability).
16. `AI_NAME=Claude2 scripts/ai-status.sh progress OPS-MP-002-SIDECAR-ACCEPTANCE "Round-5 refresh after Codex round-4 reopen: fixing line 14 stale 'round-3 packet refresh' label, removing line 18 contradiction with line 143 about ls-remote, and clearly separating historical-at-handoff facts (push_* fields recorded in ai-status.json at 2026-05-08T06:53:42Z; round-4 owner environment ls-remote failure) from current re-checkable facts (reviewer environment ls-remote resolves remote tip 76dfbe0; this owner environment still lacks GitHub credentials so ls-remote still fails for credentials)."` recorded at `2026-05-08T07:34:35Z`.
17. Round-5 refresh of this support artifact in place under `support/sidecars/OPS-MP-002/OPS-MP-002-SIDECAR-ACCEPTANCE.md`. Concrete edits in this round: (a) header `Status` line bumped to "round 5 refresh handoff to `Codex` after the round-4 packet was reopened for stale round metadata and contradictory remote-evidence prose"; (b) snapshot note rewritten to describe the round-4→round-5 transition and the two reasons for reopen; (c) `## 目的` block's "Parent task live snapshot at this round-3 packet refresh" relabelled to "this round-5 packet refresh" — the previous round-3 label was the specific staleness called out by the reviewer; (d) the "Parent commit / push of record" bullet no longer claims local `ls-remote` resolves to the parent commit; instead it now says the parent push is the historical-at-handoff fact and explicitly notes the current remote tip is a different (later) commit, with the per-environment `ls-remote` trace deferred to the Live Parent Snapshot section; (e) acceptance checklist gained the round-5 reopen / refresh entries; (f) sidecar reviewer checklist updated to reference the round-5 refresh handoff; (g) Live Parent Snapshot section split into explicit "Historical-at-handoff (pinned in machine truth)" and "Current re-checkable (may vary by environment / move over time)" subsections, with the parent commit, parent push, and parent state machine all under "historical" and the local branch tip, remote tip, and worktree delta all under "current re-checkable"; (h) evidence inventory entry for the sidecar machine truth updated to reflect "after the round-5 refresh handoff captured below"; (i) handoff log gained steps 15-17. No canonical-truth edits; only the sidecar markdown changed and lifecycle updates flow through `scripts/ai-status.sh`. Re-handoff to `Codex`:

```bash
AI_NAME=Claude2 scripts/ai-status.sh handoff OPS-MP-002-SIDECAR-ACCEPTANCE Codex \
  "Round-5 refresh fixes stale round metadata and contradictory ls-remote prose called out in the round-4 reopen. Single internally consistent round-5 snapshot: line 14 'Parent task live snapshot at this round-3 packet refresh' relabelled to round-5; the 'Parent commit / push of record' bullet no longer claims local ls-remote resolves to a9227925 — it now identifies the parent push as the historical-at-handoff fact and points at the Live Parent Snapshot section for the per-environment ls-remote trace. Live Parent Snapshot section split into 'Historical-at-handoff (pinned in machine truth)' (parent commit a9227925, parent push origin/codex/dev-deploy-backend-android at 2026-05-08T06:53:42Z, parent state) vs 'Current re-checkable (may vary by environment / move over time)' (local branch tip 76dfbe0; reviewer-environment ls-remote resolves 76dfbe0 per the round-4 reopen at 2026-05-08T07:30:59Z; this owner-environment ls-remote still fails for lack of GitHub credentials at the round-5 refresh; worktree delta against HEAD for OPS-MP-002 surfaces is empty). No canonical truth modified outside support/sidecars/OPS-MP-002/."
```

---

Support artifact prepared by `Claude` (rounds 1-3) and `Claude2` (rounds 4-5). No canonical files modified outside the sidecar path and `ai-status.json` lifecycle updates handled by `scripts/ai-status.sh`.
