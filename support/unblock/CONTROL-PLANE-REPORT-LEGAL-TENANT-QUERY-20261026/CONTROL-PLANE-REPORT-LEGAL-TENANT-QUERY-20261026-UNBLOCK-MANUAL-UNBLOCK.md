# Report tenant query: remaining acceptance blocker

Task: `CONTROL-PLANE-REPORT-LEGAL-TENANT-QUERY-20261026-UNBLOCK-MANUAL-UNBLOCK`  
Owner: Codex; reviewer: Claude. Inspected 2026-10-29 UTC using the dispatch's
active release CLI. This artifact documents the remaining blocker; it grants no
runtime acceptance and changes no product source.

## Diagnosis and preserved identity

The parent has no dependencies, but its second acceptance key remains absent.
Being dependency-ready does not establish runtime acceptance. The frozen Source
delivery is already independently reviewed, CI-green and protected-merged:

| Field                         | Existing parent evidence                                                                                          |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Candidate / reviewed / CI SHA | `7ad143ff36ce9f6bc27e168d346595394e11e899`                                                                        |
| Generation                    | `4cedc28c373d4f2aa6453cd499d30b66`                                                                                |
| Merge                         | `76843690c0a1abe29b8d9e4a55cf9675a4b47d68`                                                                        |
| PR                            | [#3040](https://github.com/ajoe734/drts-fleet-platform/pull/3040), MERGED; head and merge read back this dispatch |
| Accepted key                  | `reviewed_existing_report_business_tenant_query_preservation`                                                     |
| Missing key                   | `same_release_actual_report_tenant_filter_and_auth_boundaries`                                                    |

The existing Source evidence file is
`/home/lupin/workspace/drts-fleet-platform/.local/goal-continuation-20261015T-current-frontier/Root-BFF-7ad-own-two-CI-success-protected768-and-Source-key-only-20261026.json`,
SHA256 `a53d5e38ef157aa6e618067e151bb09cbc1894b5cb652d40c425132a6f44b21f`.
Its bytes/hash were checked; the five task-owned leaf modes/types/blobs match
between candidate and merge. Both historical candidate CI runs are recorded
success (40269912217: 17 success/3 skip; 40269912239: 22 success/9 skip).
Those are retained historical checks, not new runtime tests.

The parent's next still says to wait for Fleet029 CI/merge. That wait is obsolete:
[PR #3042](https://github.com/ajoe734/drts-fleet-platform/pull/3042) is MERGED,
head `029380eac03e5d7cb121f30c1e4ad87cbfe8254b`, merge
`50387a6ad8d3f4f3186d590b02bde571d062c158`. Both accepted merges are ancestors
of the inspected `origin/dev`. Fleet evidence hash was independently checked:
`Root-Fleet029-own-two-CI-success-protected503-and-Source-key-only-20261026.json`,
SHA256 `1c3cf1b2a458c30ee51195a34711edb431c7c1fdf050f2d63053489b34411403`,
in the same frontier directory. No new author work or repeat Source review is
needed for the report-query fix.

## Current runtime boundary and next action

The original operator's `SR-ACCEPT-001` machine record and retained evidence show
that later releases and hosted FULL attempts already occurred. Do not replay the
old instruction to publish a new batch merely because this parent's next is old.
FULL40689200536 timed out after seven distinct booking ACKs. Its final journey
and custody aggregates are missing; terminal cleanup/session revocation remain
UNKNOWN in that operator record. No new writer or deployment is justified by
this helper. The existing recovery and timeout-finalizer Source tasks are now
DONE, but their Source acceptance does not prove those seven actual orders have
been recovered or cleaned.

The authoritative original operator record was saved as `operator-parent.json`
in the local evidence directory below. Its linked retained evidence is
`Root-original-FULL40689200536-three-low-cases-positive-seven-owned-custody-unknown-no-new-datawriter-handoff-20261028.json`
in the frontier directory. No hosted run, Cloud Run/auth probe, session read,
deployment, or private report download was initiated by this helper.

1. Supervisor updates this parent's next from the prepared `parent-next.txt` and
   preserves the blocked disposition below. Retain all existing Source identity
   and the accepted key. This is the immediate executable coordination step.
2. The sole original operator under `SR-ACCEPT-001` resolves the seven-ACK custody
   through the existing accepted recovery path and checks its durable actual
   readback/cleanup result. Join existing work; Source DONE is not runtime proof.
3. Reuse the original same-release report/filter/auth artifacts first. If they do
   not satisfy this key, after custody is proven use the existing hosted path
   with compatible reviewed harness H, verified deployed runtime S and normal
   authorized sessions. Record actual legal tenant-filter positives and the
   applicable cross-tenant, role and spoof denials, exact run/job/artifact/hash
   and runtime identity. Never infer S from a branch name, borrow CI as runtime
   evidence, fabricate sessions, or dispatch a second writer. Report GET may
   update a read model, so it is not claimed to be strictly zero database writes.
4. After the helper is done and the remaining blocker is actually resolved,
   Supervisor may restore the original merged candidate to `acceptance` through
   the active `resume-blocked` contract with
   `TASK_RESUME_BASIS=merged_runtime_acceptance_ready`, fresh exact identity,
   dependency and blocker snapshots. That transaction rejects an unfinished
   helper and requires exactly one open blocker. Recheck eligibility; never use
   fresh parent `start`/`handoff`, manufacture a new candidate, or use an old
   helper resolution as evidence. Original authorized roles then record the
   actual outstanding key; no direct `done`.

The original R12 ten cases/three download formats keep their own scope and
provenance requirements. They are not added as prerequisites for this narrower
filter/auth key. Prior positive evidence and all original full-goal/manual/
provider/production HOLD boundaries remain intact. No original preview failure
cause or data leak is inferred from the old query-loss Source counterexample.

## Required Supervisor state update before helper merge

The worker attempted the authorized CLI operations with its actual Codex
identity; both rejected before mutation:

- Parent `note`: exit 1, `Dispatched worker cannot mutate a different task`.
- Helper metadata `assign`: exit 1,
  `Dispatched workers must use their assigned task lifecycle commands`.

No fence or actor was changed. The parent next and helper disposition therefore
remain **pending Supervisor application**, not completed acceptance items. In
its authorized context, Supervisor must use this active release CLI:

`/home/lupin/workspace/drts-fleet-platform/.artifacts/releases/orchestrator-8295d1f33455/tools/development-orchestrator/bin/ai-status.sh`

Use `note <parent-id>` with the prepared `parent-next.txt`, then
`assign <helper-id> Codex Claude` with `TASK_METADATA_JSON` loaded from
`helper-disposition.json`. That metadata specifies:

```json
{
  "resolved_parent_status": "blocked",
  "resolved_parent_waiting_for": "Codex"
}
```

The prepared JSON also contains the complete `resolved_parent_next` (1,368
characters). `Codex` names the existing sole operator under `SR-ACCEPT-001`, not
permission for this dispatched helper to act as that operator. Re-read parent
identity/keys and all three helper disposition fields before merging. Otherwise
the helper completion code defaults to `todo` and would incorrectly imply the
runtime blocker was cleared. Do not merge this documentation candidate before
that state update; the draft PR and handoff carry this hold.

## Finding and acceptance evidence

Local evidence prefix:
`/home/lupin/workspace/drts-fleet-platform/.local/unblock-report-legal-tenant-query-20261029/`.
Only this specified support document is committed; local machine snapshots stay
under `.local/`.

Snapshot SHA256 pins:

- `context-check.json`: `fa757c2889a8507a1b82a3860ccbe74565647885ffc901f754c12b4c5d6cc8f4`.
- `operator-parent.json`: `561e3e4988c10bdb74aa232dcc1526b6fc6054ceeceecd530865dfa300b66d0d`.
- `guard-results.json`: `86e1bf5a653f7e04c55110fd97f620c43224df86d95cb5254d4aca8180839066`.

| Finding / acceptance                       | Formal basis and change                                                                                                                                                                  | Verification                                                                                                                                             | Remaining limitation                                                                                     |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Diagnose dependency-ready blocked parent   | Active CLI single-task snapshots; original candidate, review, CI, merge and accepted key                                                                                                 | `context-check.json`: Python assertions exit 0; hashes, PR readbacks, exact five merge blobs, both ancestor checks verified                              | Runtime key remains absent                                                                               |
| Document only necessary blocker            | Original operator snapshot and existing evidence; this document only                                                                                                                     | Parent Source and Fleet evidence hashes checked; stale Fleet wait identified; no product modification                                                    | Hosted filter/auth and seven-ACK cleanup are not proven by this helper                                   |
| Preserve previous Source repairs           | `stripControlPlaneAuthQueryParams` in `packages/control-plane-auth/src/index.ts`, original three BFF `buildTargetUrl`/`forward`, latest F1 evidence in the parent's original `review.md` | Static inspection retains exact four-operation allowlist, invalid-filter 400, body precedence and spoof stripping; prior 157-test Source result retained | Product regression rerun not applicable to this documentation-only change; VM runtime/PG/browser not run |
| Task-scoped commit/push/PR                 | Only this artifact, expected isolated task branch                                                                                                                                        | Formatting, content/path/hash checks, diff check and normal commit/push; final candidate and PR supplied by CLI handoff                                  | Reviewer/CI/merge are separate lifecycle work                                                            |
| Parent next update and blocked disposition | Active CLI `note` and metadata `assign`; prepared `parent-next.txt` / `helper-disposition.json`                                                                                          | `guard-results.json`: both exit 1 with the exact scope guards above; no false success                                                                    | Supervisor must apply and read back before helper merge                                                  |

No new tests mirror prose or reimplement product logic. Existing parent
old-red/new-green details remain in its original evidence artifact; this helper
does not replace, weaken or claim to rerun them.
