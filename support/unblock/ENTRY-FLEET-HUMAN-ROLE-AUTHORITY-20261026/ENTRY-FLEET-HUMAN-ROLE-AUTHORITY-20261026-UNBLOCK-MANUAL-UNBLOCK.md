# Fleet human-role authority: remaining runtime blocker

Date: 2026-10-29 UTC. Owner: Codex. Reviewer: Claude2.
Helper: `ENTRY-FLEET-HUMAN-ROLE-AUTHORITY-20261026-UNBLOCK-MANUAL-UNBLOCK`.
Parent: `ENTRY-FLEET-HUMAN-ROLE-AUTHORITY-20261026` (Pi / Claude2).

## Diagnosis

Dependency readiness does not satisfy the parent's remaining runtime acceptance.
Its source acceptance is already recorded. Preserve candidate
`ec46561ae6638e9a08725dfe41294f1580390990`, generation
`b8be08fb56df4b04bddd103dc26fac60`, protected merge
`f0a29170661ed9f29db733f67a1bf6e4c93d940e`, existing scope, findings and HOLDs.
There is no new source finding here and no reason to reopen product implementation.

The previous handoff's claim that no post-merge deployment exists is stale.
[Deploy run 40662565606](https://github.com/ajoe734/drts-fleet-platform/actions/runs/40662565606)
used `publish/v2026.10.28.0`, source
`1a3fbf8bca9e607085eb0c2e670b46763331f1da`, which contains the parent merge.
Migration, service deployment, health checks and retired-service cleanup succeeded.
The overall run failed: operational acceptance failed at
`Exercise three new shared-dev review orders` (terminal log: test ended during
`page.waitForResponse` / `locator.click`); quote-expiry acceptance failed with
`VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT`, reason `unclassified`.
These results neither prove three managed Fleet personas nor establish the
currently served release. They must not be converted into runtime credit.

The current board has only `reviewed_existing_fleet_managed_human_role_authority`
recorded. `same_release_managed_fleet_personas_and_business_isolation_verified`
remains **UNMET**. Deployment success alone does not prove real manager grants,
IdP sessions, durable role ownership, business isolation or role-owned cleanup.

## Verification and acceptance matrix

Machine-local receipts are under the absolute directory
`/home/lupin/workspace/drts-fleet-platform/.local/unblock/ENTRY-FLEET-HUMAN-ROLE-AUTHORITY-20261026/20261029T0225Z/`.
The original detailed implementation/rework history remains at
`/home/lupin/workspace/drts-fleet-platform/.local/goal-continuation-20261015T-current-frontier/ENTRY-FLEET-HUMAN-ROLE-AUTHORITY-20261026.evidence.md`.

| Finding / acceptance                           | Authority and command                                                                                                                                                                                                                                                                    | Result / receipt                                                                                                                 | Remaining limitation                                                                                                                                           |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Diagnose dependency-ready blocked parent       | Active release `ai-status.sh show <parent>`; current required keys and recorded evidence                                                                                                                                                                                                 | Exit 0; `parent-before.json`: blocked, Pi / Claude2, waiting for Codex; one of two keys recorded                                 | Runtime evidence is still required; dependencies cannot replace it                                                                                             |
| Preserve accepted source                       | `gh pr view 3076 --json headRefOid,mergeCommit,state,mergedAt,url`; `gh run view 40565100910` and `40565100941 --json headSha,status,conclusion,url`                                                                                                                                     | Exit 0; PR merged with exact candidate/merge; both same-SHA CI runs completed success; `parent-pr3076.json`, `source-ci-*.json`  | Source only; no new test run or source re-review claimed                                                                                                       |
| Correct stale deployment premise               | `git fetch origin`; `git merge-base --is-ancestor <parent merge> origin/dev` and `<parent merge> 1a3fbf8bca9e607085eb0c2e670b46763331f1da`; `gh run list --workflow deploy-dev.yml --limit 6`; `gh run view 40662565606 --json databaseId,status,conclusion,headSha,headBranch,url,jobs` | All exit 0; both ancestry checks pass; `deploy-40662565606.json` records successful deployment/health and failed acceptance jobs | Historical job success is not a current served-SHA readback or managed-role acceptance                                                                         |
| Confirm shared target                          | `gh variable list --json name,value`, retaining only `DEV_GCP_PROJECT_ID` and `DEV_GCP_REGION`                                                                                                                                                                                           | Exit 0; `live-target.json`: `drts-dev-devcc-20260825` / `us-central1`                                                            | Read-only metadata; no deployment, provider or role mutation                                                                                                   |
| Runtime key                                    | Parent acceptance evidence, original task contract and original evidence history                                                                                                                                                                                                         | **UNMET**, no key recorded                                                                                                       | Real IdP/PG, original legitimate manager, all three personas, same-release business/lifecycle and exact owned cleanup remain required                          |
| Task-scoped change and delivery                | This artifact only; original product, workflows and control plane unchanged                                                                                                                                                                                                              | Content/format/diff checks and commit/PR recorded in helper status; candidate review handoff awaits Supervisor disposition       | Old-red/new-green is not applicable to this documentation correction; no product tests started                                                                 |
| Update parent next / safe helper disposition   | Active release metadata update using `assign` with unchanged helper owner/reviewer                                                                                                                                                                                                       | **BLOCKED**, exit 1: `Dispatched workers must use their assigned task lifecycle commands`; `status-fence.txt`                    | Worker fence also rejects another task's mutation. Parent note did not execute. Supervisor must apply the metadata and note below before helper approval/merge |
| Preserve parent identity after rejected update | CLI readback compared all selected before/after fields, including next, required keys, evidence, roles, H/generation/handoff, review, CI and merge                                                                                                                                       | PASS; `parent-after.json`, `parent-preservation-check.txt`                                                                       | Parent is deliberately unchanged; this is not a claim that the requested parent update succeeded                                                               |

## Concrete next step and Supervisor transaction

The existing sole Codex hosted operator should first read back the currently
served API and Fleet portal SHA against the eligible immutable source above.
Using the original legitimate manager and real IdP/PG, produce admin/Ops/finance
assignment ACK and durable readback, fresh same-release sessions, intended
own-partner operations, cross-partner and other-role denials, role
change/disable/expiry/revoke, and exact role-owned cleanup. Preserve and report
the remaining original findings. If the served release differs, the existing
authorized operator chooses an eligible immutable release through the documented
workflow. This helper does not dispatch a deployment or grant roles.

Before approving or merging this helper, genuine Supervisor must use the active
release CLI to persist these helper metadata fields (same owner/reviewer):

```json
{
  "resolved_parent_status": "blocked",
  "resolved_parent_waiting_for": "Codex",
  "resolved_parent_next": "Runtime key remains UNMET. Existing sole Codex hosted operator: verify current served API/Fleet portal SHA against post-merge source 1a3fbf8bca9e607085eb0c2e670b46763331f1da (deploy 40662565606 deployment/health succeeded; operational/quote acceptance failed). Original legitimate manager must prove real IdP/PG admin/Ops/finance grants/readback, fresh same-release own/cross-partner and other-role business, change/disable/expiry/revoke and exact owned cleanup. Preserve candidate ec46561ae6638e9a08725dfe41294f1580390990, generation b8be08fb56df4b04bddd103dc26fac60, merge f0a29170661ed9f29db733f67a1bf6e4c93d940e, Source credit, Pi/Claude2, original scope/findings/HOLDs. With new actionable operator evidence and completed helper, genuine Supervisor restores original acceptance through current guarded resume/reconcile, readbacks frozen evidence unchanged, then routes Pi/Claude2. No fresh implementation/start/handoff or runtime key without evidence. See support/unblock/ENTRY-FLEET-HUMAN-ROLE-AUTHORITY-20261026/ENTRY-FLEET-HUMAN-ROLE-AUTHORITY-20261026-UNBLOCK-MANUAL-UNBLOCK.md."
}
```

Supervisor must also write that bounded next text to the parent using `note`,
and verify its status, owner/reviewer, candidate/generation, review, CI, merge and
accepted Source key are unchanged. Do not clear old acceptance-review request
metadata to force a resume. The current CLI's guarded direct acceptance route
has additional request/dependency/blocker checks; Supervisor must inspect the
actual snapshot and use the applicable existing route, preserving original
acceptance rather than starting implementation.

The [candidate lifecycle](../../../tools/development-orchestrator/skills/candidate-lifecycle.md)
requires this blocked disposition to be recorded before merge. Without it,
helper completion defaults to parent `todo`; that would incorrectly resume a
runtime-blocked product task. The worker's attempt to persist it was rejected
by `TaskBoardCommandExecutor._guard_worker_command` in the active release's
`control_plane/usecases/task_board_commands.py`; the fence was not bypassed.
Until Supervisor supplies readback, keep this helper blocked and its PR draft.
Then the owner can hand off the published candidate to Claude2 normally.

No VM product/browser/PG/Compose server or external workflow was started.
No runtime acceptance was recorded; neither parent nor helper is declared done.
