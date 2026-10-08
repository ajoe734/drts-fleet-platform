# PUSH-CHANNEL-PG-QA-20261006-UNBLOCK-HISTORY-REPAIR

Owner: Codex2. Reviewer: Codex. Audit date: 2026-10-08 UTC.

## Finding: the parent is blocked by PG-QA-F1, not divergent history

There is **no observed branch/commit contamination to repair**. The parent local
branch, freshly fetched remote-tracking branch, live remote ref and open draft
[PR #2433](https://github.com/ajoe734/drts-fleet-platform/pull/2433) all resolve to
`74f7f04440cdc1cd3ec9db26b218fa12f9c909fe`. The PR targets `dev` and GitHub reports
`MERGEABLE`. Local-versus-remote commit counts are **0 / 0**.

The dispatch classification is inaccurate: the activity event
`chair_unblock_task_created` at `2026-10-08T04:48:40Z` explicitly says
“PG-QA-F1 requires scope expansion or coordination”, but selected
`unblock_kind=history_repair`. The preceding parent blocker at `04:43:06Z`
already identifies the out-of-scope production writer and failing hosted probes.
This report corrects the diagnosis; it does not claim to repair that writer.

Parent canonical state at audit: `blocked`, owner Codex2, reviewer/waiting-for
Codex, no locked candidate. All five dependencies are recorded done in the
parent's existing evidence. Published QA commits are checkpoints, not an
approved candidate. Keep both original required acceptance keys unchanged.

## Exact ref and worktree evidence

Observed at `2026-10-08T04:52:33Z`, after `git fetch origin` (exit 0):

| Item                                    | Value                                                                                                                               |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Parent branch                           | `codex2/push-channel-pg-qa-20261006`                                                                                                |
| Local / remote / PR head                | `74f7f04440cdc1cd3ec9db26b218fa12f9c909fe`                                                                                          |
| Merge base with fetched dev             | `7785a1abd1cf1fffe06cfdef50df2956fc2eaf9f`                                                                                          |
| Fetched `origin/dev`                    | `f601cb2c3ef43c05fdad8e109370be4d814ea7e8`                                                                                          |
| `origin/dev...parent` left/right counts | 1 / 8; unrelated dev advancement, not local/remote divergence                                                                       |
| Helper branch/base                      | `codex2/push-channel-pg-qa-20261006-unblock-history-repair` / `7785a1abd1cf1fffe06cfdef50df2956fc2eaf9f`                            |
| Original parent worktree                | `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-push-channel-pg-qa-20261006` is absent and unregistered |
| Current helper worktree                 | Supervisor-assigned isolated directory ending in `codex2-push-channel-pg-qa-20261006-unblock-history-repair`; initially clean       |

The complete available parent reflog contains branch creation from
`7c06879337cc6deba6c50b168bdc8533884233c9`, a fast-forward to `7785a1abd…`, and
these eight append-only commits. No reset, rebase or amend appears in that
reflog. Every commit has the parent Task-ID, Codex2 agent and Codex reviewer
trailers; every changed path is within the parent's recorded write scopes.

| Commit                                     | Scoped change                                      |
| ------------------------------------------ | -------------------------------------------------- |
| `95863ff8692bf35681b4268b5ca406a3ca2f8440` | Migration harness and exclusion finding            |
| `d7f9bd0577d5ef31a690bbf472562f0bd099e6b0` | PostgreSQL suites and fail-closed CI gate          |
| `4403666b6bf73e211d84710fc9b1b3b463dc65d1` | SQL audit and local evidence                       |
| `7fc8e87f483c056eb22d83447686d996868daa7a` | ETA and relevance probes                           |
| `93f4908d5095e614b93eb6c6c8301ab399a79c2f` | Per-case database clones preserving audit triggers |
| `7cc2ba490e1bdff90dcb05a558fa96748ee4f683` | Optional clone cleanup typing                      |
| `08a032bc1222a0da098d3745ce3c3906b2cc69fe` | Both partner writer replay paths                   |
| `74f7f04440cdc1cd3ec9db26b218fa12f9c909fe` | Hosted failure and repair boundary                 |

The nine final changed paths are `.github/workflows/ci.yml`, the original parent
UAT artifact, five files under `tests/unit/push-channel-pg-qa-20261006/`,
`tools/ci/test_partner_notification_postgres_gate.py`, and
`tools/ci/verify_passenger_push_channel_postgres_gate.py`. The one newer dev
commit concerns scanner diagnostics and touches none of these paths. Trunk
movement alone does not justify changing the published QA head.

There is a separate **machine dependency-link failure**: this helper's
`node_modules` points at canonical-root `node_modules`, whose `prettier` and
`lint-staged` symlinks point into the absent parent worktree. Consequently,
`pnpm exec prettier --version` exits 1 (`MODULE_NOT_FOUND`). No shared symlink,
package manifest or lockfile was changed. An isolated Prettier 3.8.2 installation
under this worker's `.local/history-repair-audit/doc-tools/` supports this
document's checks. Supervisor should restore stable dependency ownership before
the parent runs local JS checks. This is not evidence of lost source commits;
the actor/reason that removed the worktree has not been established by this audit.

## Retained production defect and hosted evidence

Read the existing
[parent artifact at the preserved SHA](https://github.com/ajoe734/drts-fleet-platform/blob/74f7f04440cdc1cd3ec9db26b218fa12f9c909fe/docs/04-uat/passenger-push-channel-20261006/PUSH-CHANNEL-PG-QA-20261006.md).
Its finding ledger, SQL/migration audit, fixture repair and assertions remain
authoritative; this helper neither duplicates nor weakens the tests.

- `apps/api/src/modules/tenant-partner/order-partner-notification-route.ts`,
  `persistOrderPartnerNotificationRoute`, inserts the V0104 partner route and
  initial sequence without inspecting V0107 or taking the shared per-order lock.
- `apps/api/src/modules/passenger-push-devices/passenger-push-devices.repository.ts`,
  `writeFirstPartyRoute`, takes `pg_advisory_xact_lock(hashtextextended($1, 0))`
  with `passenger-push-first-party-route:<orderId>` and checks the partner table.
- Both `MultiTaxiRepository.writeOrderPartnerNotificationRoute` and
  `OwnedMobilityRepository.writeOrderPartnerNotificationRoute` call the shared
  partner writer. The original sequential reverse-write and concurrent
  opposite-writer probes resolve to `ambiguous`. Expected: one channel only,
  with no partner route or sequence after rejection. Preserve replay,
  transaction/savepoint and non-blocking notification setup semantics.
- The legacy sequence PG fixture will need the real V0107 dependency when the
  writer starts reading that table. Do not add a table-existence fallback or
  weaken its seven assertions.

Independently re-downloaded the report and read terminal job results/log failure
sections for [CI 37727675410](https://github.com/ajoe734/drts-fleet-platform/actions/runs/37727675410),
head `74f7f04440cdc1cd3ec9db26b218fa12f9c909fe`: **failure**. Artifact
`11527844488` (`test-results`), `unit-test-results.json` SHA-256
`1792b9b4734c7de9b8148fef7d2861f6adcd1efcca17ab2ea855a5f35c5c2121` matches
the parent's recorded evidence. New PG: referral 9 passed, registry 9 passed /
2 F1 failed, delivery 10 passed; zero skips. Dormant 3 passed. Root totals:
6122 passed / 2 failed / 49 unrelated opt-in skips. This audit starts no new PG,
product server or browser process on the VM.

[Integration run 37727675374](https://github.com/ajoe734/drts-fleet-platform/actions/runs/37727675374)
is terminal success for the same head, but its product jobs are skipped for the
draft checkpoint. It is not product acceptance. PG-QA-H1 (the earlier harness
TRUNCATE failure) is already repaired; PG-QA-F1 remains open. These are owner
checkpoints, not two independent review returns of a candidate.

## Non-destructive continuation

1. Codex reviews the existing F1 reproduction. Supervisor coordinates the
   original route-writer owner (also Codex2; route-write task currently done,
   reviewer Claude2) and the QA owner. Either route a scoped follow-up to that
   owner or explicitly expand the original QA write scope after conflict review.
   This helper does not reopen a completed dependency or grant itself product scope.
2. On the next **parent** dispatch, recreate its missing worktree using the
   preserved branch. First fetch and recheck live PR/candidate state. If another
   worker has recreated it, reuse that directory. If it remains absent and the
   local/remote heads still match, the non-destructive command is:

   ```bash
   git worktree add /home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-push-channel-pg-qa-20261006 codex2/push-channel-pg-qa-20261006
   ```

   If the local ref is missing, create it from the existing remote task branch,
   not `dev`. If heads diverge later, preserve both refs and re-audit. Restore
   dependencies in an isolated owner environment without retargeting shared
   root links to disposable worker storage.

3. After scope coordination, append the product/fixture repair and keep PR
   #2433's QA assertions. Merge `origin/dev` only if actually necessary before
   a candidate is locked; never rebase, reset, amend, force-push or stash-pop
   published work. This helper report stays on its own branch/PR.
4. Run existing authorized hosted CI: new PG 9/11/10, original PG 7/7/7,
   partner notification/cancellation and C111–C115 regressions, dormant proofs;
   require all relevant cases passed with zero skips. Read completed results.
   Then use the parent's exact new SHA for Codex review, CI/merge and its two
   original acceptance keys. No feature enablement or deployment is needed.

## Required parent disposition and CLI boundary

**Before this helper merges**, Supervisor must store these fields through the
current release CLI's `assign` metadata path, preserving owner/reviewer:

```json
{
  "resolved_parent_status": "blocked",
  "resolved_parent_waiting_for": "Codex",
  "resolved_parent_next": "No history contamination: preserve PR2433/head 74f7f04440cdc1cd3ec9db26b218fa12f9c909fe. Codex reviews PG-QA-F1; Supervisor coordinates original route-writer owner/scope and fixture repair. Recreate the missing parent worktree from its preserved branch, append the authorized fix, and rerun exact-SHA hosted PG/regression/dormant gates before handoff."
}
```

Use `AI_NAME=Supervisor TASK_METADATA_JSON='<above JSON>' <release-cli> assign
PUSH-CHANNEL-PG-QA-20261006-UNBLOCK-HISTORY-REPAIR Codex2 Codex`, followed by
`<release-cli> note PUSH-CHANNEL-PG-QA-20261006 '<concrete next step>'` as
Supervisor. Do not populate `resolved_parent_at` manually; the merge transaction
owns it. Do not use `resume-blocked` for the still-open F1 defect.

The dispatched helper attempted both operations as Codex2 using the mandated
release CLI. Each exited 1 without mutation:

- `assign` metadata: `Dispatched workers must use their assigned task lifecycle commands`.
- Parent `note`: `Dispatched worker cannot mutate a different task`.

These are dispatch authorization guards, not Git/network failures. No dispatch
environment was removed and no identity was impersonated. The helper's own
`progress` command succeeded and records the exact Supervisor coordination
request. Parent update / persisted disposition remains **pending Supervisor**;
prose or a `PARENT_STATUS` environment variable on `handoff` is not a substitute
for canonical metadata. Keep the delivery draft until that coordination occurs.

## Acceptance and verification ledger

| Finding / acceptance                          | Source / change                                            | Old result → current result                                                                                                | Command / evidence and exit                                                                                                                         | Remaining limit                                                        |
| --------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Identify branch/worktree/commit contamination | Refs, PR2433, parent reflog, scoped commit/path inspection | Generated history-repair premise → no divergent/foreign commits; missing worktree and dangling dependency links identified | `git fetch`, `rev-list --left-right --count`, `ls-remote`, `gh pr view`, per-commit scope assertions: 0; `.local/history-repair-audit/history.json` | Snapshot as of recorded time; cleanup attribution unknown              |
| Non-destructive repair path                   | This report's continuation, original QA artifact           | No source-history repair needed → preserve SHA/PR; documented worktree recreation and authorized F1 continuation           | Read-only source and history inspection: 0                                                                                                          | F1 remains out of scope and failing; no green product claim            |
| Scoped commit/push/PR                         | Only this report on the helper branch                      | New report delivery; published identity recorded in PR and task status                                                     | Commit/push/PR evidence appended after publication                                                                                                  | Reviewer/CI/merge lifecycle pending                                    |
| Update parent with concrete next step         | Release worker guard, helper `progress`                    | Parent note and helper metadata update attempted → rejected, coordination request persisted on helper                      | CLI `assign` and parent `note`: 1; own `progress`: 0; `status-guard-receipts.json`                                                                  | Supervisor must write blocked disposition and parent note before merge |
| Retain PG-QA-F1 / parent required acceptance  | Production writers and original hosted report              | Both F1 probes still fail → unchanged                                                                                      | CI37727675410 failure; downloaded JSON hash verified, exit 0                                                                                        | No repaired PG run, acceptance record or parent handoff                |

Raw machine-specific evidence is under this assigned worker's
`.local/history-repair-audit/`: `history.json`, `parent-reflog.txt`,
`parent-task.json`, `dispatch-events.json`, `status-guard-receipts.json`,
`supervisor-metadata.json`, `ci-summary.json`, downloaded JSON and CI log.
The tracked report contains the durable conclusions, SHAs, reproduction source
and external links even if ephemeral worker files are later removed.
