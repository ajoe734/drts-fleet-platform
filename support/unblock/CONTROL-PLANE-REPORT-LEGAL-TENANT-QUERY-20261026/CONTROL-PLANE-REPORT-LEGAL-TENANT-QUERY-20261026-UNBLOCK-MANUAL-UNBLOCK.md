# Report tenant query: remaining acceptance blocker

Task: `CONTROL-PLANE-REPORT-LEGAL-TENANT-QUERY-20261026-UNBLOCK-MANUAL-UNBLOCK`

Owner: Codex; reviewer: Claude. Inspected 2026-10-29 UTC using the dispatch's
active release CLI. This artifact documents the remaining blocker; it grants no
runtime acceptance and changes no product source.

Refreshed after the 13:24 UTC owner dispatch. The 07:05 coordination is already
persisted: `resolved_parent_status: blocked`, `resolved_parent_waiting_for: Pi`,
and the complete `resolved_parent_next` match the current parent next exactly.
Pi remains the parent owner; Codex owns only this helper. The old instruction
to apply the worker's proposed Codex disposition is superseded. No parent write
or metadata assignment was retried by this dispatch.

Accepted Hono remediation [PR #3141](https://github.com/ajoe734/drts-fleet-platform/pull/3141)
is incorporated through normal merge `164552d29d90d2c0e717b2871cab0122d517e78c`
of fetched `origin/dev=7796a2bebda614eb8e00f410b945532f5089d9d1`. The task diff
against that dev head remains only this support Markdown. Published helper
history is preserved; the new candidate needs its own exact-SHA Claude review
and complete CI/security results.

## Diagnosis and preserved identity

The parent has no dependencies, but its second acceptance key remains absent.
Being dependency-ready does not establish runtime acceptance. The frozen Source
delivery is already independently reviewed, CI-green and protected-merged:

| Field                         | Existing parent evidence                                                                                          |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Current owner / reviewer      | Pi / Claude; parent remains blocked                                                                               |
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

The original operator's current `SR-ACCEPT-001` record confirms later releases,
hosted FULL attempts and cleanup. Do not publish another batch merely because
this parent's retained next still mentions the already merged Fleet change.
The earlier `operator-parent.json` remains historical evidence, superseded for
current routing by `dispatch-1324/operator-before.json` below.

FULL40689200536 timed out after seven distinct booking ACKs; its original
missing aggregates and raw UNKNOWN records are preserved. The original sole
operator subsequently qualified the exact seven orders as terminal, the first
supply offline and its exact binding revoked, using real recovery readbacks.
The second normal supply producer was not reached under its original sequential
gate. That is a bounded operator inference, not global database/registry absence.
The raw second-supply qualification remains UNKNOWN. Recovery run 40843281913 /
job 123344583470 remains FAIL with
`exact-seven-second-supply-qualification-unknown`; no whole-run PASS is inferred.

The authoritative bounded disposition is
`Root-original-seven-firstbinding-custody-qualified-second-normal-producer-not-reached-bounded-operator-disposition-20261029.json`
in the frontier directory, SHA256
`1cd6292508bd7ca31499d5e34f797f948373426186720281fc7779f6a2bee218`.
This clears the earlier generic instruction to repeat seven-order recovery;
it does not establish this parent's tenant-filter/auth key. Current operator
next also reports the later FULL40873509600 as FAIL at C1 terminal UI, both ACKs
terminal and cleanup complete. Its original Source repair is still in progress.
Do not repeat recovery, deployment or FULL from this helper, or borrow its
successful main report/downloads as proof of all tenant/auth denials.

1. Finish this refreshed helper through original Codex/Claude exact-SHA review,
   its own complete CI/security and normal protected merge on PR #3126. Preserve
   the already persisted blocked/Pi/full-next disposition and parent identity.
   The historical worker write denials are not a pending coordination action.
2. Parent owner Pi and the original sole operator under `SR-ACCEPT-001` qualify
   retained same-release report/filter/auth evidence for the missing key first.
   Correlate verified deployed runtime S, compatible reviewed harness H, legal
   tenant-filter positives and applicable cross-tenant, role and spoof denials,
   exact run/job/artifact/hash. Existing report/download success alone does not
   grant the key. Keep the original operator's current C1 and no-new-writer
   boundary; no extra run is authorized by this document.
3. If retained evidence is insufficient, record the precise missing scenario
   under the original task/operator path. Any later necessary hosted check uses
   that existing authorized path and normal sessions after its current gates;
   never infer S from a branch, borrow CI as runtime evidence, fabricate sessions
   or dispatch a second writer. Report GET may update a read model, so it is not
   claimed to be strictly zero database writes.
4. Once this helper is done and actual evidence resolves the remaining blocker,
   Supervisor evaluates the active `resume-blocked` contract with
   `TASK_RESUME_BASIS=merged_runtime_acceptance_ready` and fresh exact identity,
   dependency and blocker snapshots. It must reject unfinished helpers and
   stale snapshots. The dispatch's active release still requires exactly one
   open blocker; any newer accepted zero-blocker Source is not proof that this
   release runs it. Recheck the active contract and record any actual refusal.
   Preserve the original merged candidate/generation. Never use
   fresh parent `start`/`handoff` or manufacture a new candidate. Original
   authorized roles then record the outstanding key; no direct `done`.

The original R12 ten cases/three download formats keep their own scope and
provenance requirements. They are not added as prerequisites for this narrower
filter/auth key. Prior positive evidence and all original full-goal/manual/
provider/production HOLD boundaries remain intact. No original preview failure
cause or data leak is inferred from the old query-loss Source counterexample.

## Persisted coordination and historical worker denials

In the earlier dispatch, the worker attempted CLI operations with its actual
Codex identity; both rejected before mutation:

- Parent `note`: exit 1, `Dispatched worker cannot mutate a different task`.
- Helper metadata `assign`: exit 1,
  `Dispatched workers must use their assigned task lifecycle commands`.

No fence or actor was changed. Those failures and the old prepared
`parent-next.txt` / `helper-disposition.json` are retained as history, not inputs
to apply now. The canonical 07:05:02Z `assign` event and fresh single-task CLI
readback establish the actually persisted disposition:

```json
{
  "resolved_parent_status": "blocked",
  "resolved_parent_waiting_for": "Pi"
}
```

The full `resolved_parent_next` equals the current 884-character parent next,
SHA256 `61041f82bd9a5f132404d34d453fe137f37ee190b1b7bdbd0af78e6120fea880`.
Both complete strings are retained in `dispatch-1324/{parent,helper}-before.json`;
they are not replaced with the earlier worker proposal. The stored next retains
historical Fleet/publish wording; the executable current action is the retained
evidence qualification above, subject to original operator gates. This helper
cannot change another task's next, and does not retry its denied `note`.

The metadata-absence merge hold is cleared. The parent still remains blocked
on the missing runtime key. Preserve all three disposition fields through
handoff and protected merge; do not interpret helper completion as runtime
acceptance or transfer the parent from Pi to the helper worker.

Current release CLI:
`/home/lupin/workspace/drts-fleet-platform/.artifacts/releases/orchestrator-dac6f0b56b88/tools/development-orchestrator/bin/ai-status.sh`.

## Published candidate and dependency history

Old helper candidate `f876fb95d78efe3b164f9294547a6293352d863d`, generation
`0ede41807bcc4d1183e9594cf6e8ad79` (earlier handoff generation
`8c1597e756284b38aa95fff083b15fcf`), stays in PR #3126's published ancestry.
Its artifact SHA256 was
`0bdc9ed630be252fd7605e1877454cf7d54b95d1637a99b5ea09ae558afcda6b`.
All four historical runs are now terminal and read back:

| Old-H run                                                                              | Conclusion | Job outcomes / limitation                                                                     |
| -------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------- |
| [40793606726](https://github.com/ajoe734/drts-fleet-platform/actions/runs/40793606726) | FAIL       | 18 success, 1 failure, 1 skip; Dependency security job 123184555667, advisory 1243661, exit 1 |
| [40793607544](https://github.com/ajoe734/drts-fleet-platform/actions/runs/40793607544) | SUCCESS    | 6 success, 22 skip; security skipped, not remediation proof                                   |
| [40795199896](https://github.com/ajoe734/drts-fleet-platform/actions/runs/40795199896) | SUCCESS    | 17 success, 3 skip; security skipped, not remediation proof                                   |
| [40795199743](https://github.com/ajoe734/drts-fleet-platform/actions/runs/40795199743) | FAIL       | 20 success, 2 failure, 9 skip; dependency-security 123190463138 and aggregate ci-integ failed |

Accepted peer `DEPENDENCY-HONO-NODE-SERVER-1243661-REMEDIATION-20261029`
is DONE: H `2bd86bc8a6cc438f84fbf6300f9afcfaaf1b2dc1`, generation
`80c7772e87eb44feb27025b6be180bbb`, matching Claude2 review and green CI,
protected M `8c74514a9b594aa1fac7940c4a070f0c61bc2c3e`, both original Source
keys recorded. Its actual package override and pnpm lock resolve the affected
adapter to `@hono/node-server@2.1.3`; all three peer leaves are incorporated
unchanged by this helper's normal dev merge. This helper adds no exception or
gate change. Peer CI is not this helper's CI. Do not rerun old H; final new
candidate SHA/generation are supplied by the active CLI handoff, with fresh
independent Claude review and own CI required before protected merge.

## Finding and acceptance evidence

Local evidence prefix:
`/home/lupin/workspace/drts-fleet-platform/.local/unblock-report-legal-tenant-query-20261029/`.
Only this specified support document is committed; local machine snapshots stay
under `.local/`.

Snapshot SHA256 pins:

- `context-check.json`: `fa757c2889a8507a1b82a3860ccbe74565647885ffc901f754c12b4c5d6cc8f4`.
- `operator-parent.json`: `561e3e4988c10bdb74aa232dcc1526b6fc6054ceeceecd530865dfa300b66d0d`.
- `guard-results.json`: `86e1bf5a653f7e04c55110fd97f620c43224df86d95cb5254d4aca8180839066`.

The refresh uses `dispatch-1324/` under the same local evidence prefix.
`readback-check.json` verifies retained Source/Fleet hashes, original Pi owner,
frozen parent candidate/generation and sole accepted key, complete next equality
and accepted peer status. `coordination-history.json` records 07:05 persistence
and the 13:24 dispatch. `helper-before.json` SHA256 is
`b78d4d3d3c1fc128959e4f53e5b4a1ab3b8f11fad3808b53cf5de48e1d80d14f`.
Historical CI snapshots are `dispatch-1324/ci-<run>.json`; old evidence is kept.

| Finding / acceptance                     | Formal basis and change                                                                                                                                                                  | Verification                                                                                                                                             | Remaining limitation                                                                                       |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Diagnose dependency-ready blocked parent | Active CLI single-task snapshots; original candidate, review, CI, merge and accepted key                                                                                                 | `context-check.json`: Python assertions exit 0; hashes, PR readbacks, exact five merge blobs, both ancestor checks verified                              | Runtime key remains absent                                                                                 |
| Document only necessary blocker          | Current original operator snapshot and bounded custody disposition; this document only                                                                                                   | Parent Source/Fleet and operator disposition hashes checked; stale Fleet/recovery instructions identified; original FAIL/UNKNOWN retained                | Same-release filter/auth key still unrecorded; no new runtime acceptance                                   |
| Preserve previous Source repairs         | `stripControlPlaneAuthQueryParams` in `packages/control-plane-auth/src/index.ts`, original three BFF `buildTargetUrl`/`forward`, latest F1 evidence in the parent's original `review.md` | Static inspection retains exact four-operation allowlist, invalid-filter 400, body precedence and spoof stripping; prior 157-test Source result retained | Product regression rerun not applicable to this documentation-only change; VM runtime/PG/browser not run   |
| Task-scoped commit/push/PR               | Only this artifact, expected isolated task branch                                                                                                                                        | Formatting, content/path/hash checks, diff check and normal commit/push; final candidate and PR supplied by CLI handoff                                  | Reviewer/CI/merge are separate lifecycle work                                                              |
| Parent next and blocked disposition      | Canonical 07:05 event, current parent/helper slices; historical worker proposals preserved                                                                                               | `dispatch-1324/readback-check.json`: blocked/Pi/full next equality PASS; historical denied writes remain in `guard-results.json`                         | Preserve current disposition and Pi ownership; current executable action above supplements historical next |
| Old H dependency-security failure        | Accepted Hono PR3141, actual package/lock/test leaves, normal dev merge 164552d29                                                                                                        | Current peer slice DONE; ancestry and exact peer leaf checks; old four terminal CI results retained in `dispatch-1324/ci-*.json`                         | New helper requires own whole CI/security and independent Claude exact-H review                            |

No new tests mirror prose or reimplement product logic. Existing parent
old-red/new-green details remain in its original evidence artifact; this helper
does not replace, weaken or claim to rerun them.

Refresh checks completed with exit 0: scoped Prettier, repository classification
(7,557 files), diff checks, commit trailers and scope classifier (`product`).
`dispatch-1324/refresh-checks.json` records commands and outputs;
`incorporation-check.json` verifies the five accepted parent leaves and three
Hono peer leaves have identical modes/types/blobs, published ancestry, artifact
scope and retained old hash. Product unit/runtime/PG/browser checks were not run
locally for this support-only change. New hosted results and final candidate
identity belong to the exact-SHA handoff and its linked local evidence; this
document does not grant them PASS in advance.
