# Referral quote consumer binding: history audit and safe continuation

Task: `REFERRAL-PRODUCT-QUOTE-CONSUMER-BINDING-20261015-UNBLOCK-HISTORY-REPAIR`
Owner: Codex; reviewer: Claude. Audit date: 2026-10-17 UTC.

## Disposition

No divergent task commits, published parent branch, or parent PR were found.
Both parent worktrees contain intentionally untracked, noncanonical reports on
older `dev` bases. Their HEAD subjects refer to other tasks because those commits
are inherited trunk bases. Rebase, reset, cherry-pick, committing the reports,
or force-push would not resolve this parent.

The actual unresolved gate is the existing monetary-policy decision in approved
report §8.6. Preserve the parent as **blocked**, its approved report generation
`8319227035cd4000956d0b3a9d19ad56`, and existing Key 2 acceptance. Key 1 remains
unsatisfied. This helper supplies no pricing decision or product completion.
The parent update and helper disposition remain **pending Supervisor** because
the current dispatch fence prohibits both mutations; do not merge prematurely.

## Exact history and custody

Fetched `origin/dev`: `5797acd43d731b3a60325c09d52689f3711e134a`.
Paths below are relative to `/home/lupin/workspace/drts-fleet-platform`.

| Ref / worktree                                                                                                                                                  | HEAD                                                    | Comparison with fetched dev                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------- |
| `gemini/referral-product-quote-consumer-binding-20261015`; `.artifacts/worktrees/auto/gemini-referral-product-quote-consumer-binding-20261015`                  | `431966bdf2728a76f7b03907974a124ab4a48ae7`              | 38 behind, **0 ahead**; reflog only `branch: Created from origin/dev` |
| `codex/referral-product-quote-consumer-binding-20261015-report-r2-20261015`; `.artifacts/worktrees/auto/codex-referral-product-quote-consumer-binding-20261015` | `11ed91ba151b04519670d11316d5f30f1fdc0d74`              | 29 behind, **0 ahead**; reflog only `branch: Created from origin/dev` |
| This helper, `codex/referral-product-quote-consumer-binding-20261015-unblock-history-repair`                                                                    | Initial base `5797acd43d731b3a60325c09d52689f3711e134a` | Clean isolated task branch before this report                         |

Before this helper publication, `git ls-remote --heads origin '*referral*quote*'`
returned no rows and `gh pr list --state all --search
REFERRAL-PRODUCT-QUOTE-CONSUMER-BINDING-20261015` returned `[]`. Exact parent-ref
remote checks likewise returned no rows. Available reflogs and `git log --all`
contain no parent task-specific commits. These observations do not prove that
a deleted remote ref could never have existed; no invasive repair is warranted.

Both original worktrees are locked for report preservation. Each contains
exactly two untracked files under `docs/04-uat/system-remediation-20260906/`,
basename `REFERRAL-PRODUCT-QUOTE-CONSUMER-BINDING-20261015`, extensions `.md` and
`.json`, with no tracked diffs. The Gemini pair is historical input. The current
approved Codex pair matches the existing durable copies:

| Approved evidence                                                          | SHA-256                                                            |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Codex report MD; durable `approved-original-report.exact.md`               | `dc4ac05c5bd0d3b19eb22e8f76925a56992b6e55a82057da660ab36cf5470c27` |
| Codex report JSON; durable `approved-original-report.exact.json`           | `efd3677f71f1a8222e691b5c9911953418b4be1f79b0ff0ccb4aedeb561bd369` |
| `.local/referral-quote-codex-r4/acceptance-disposition-20261016T0021.json` | `d3901bac6392b743161817e95a74b9ae7f8886f3e51a25550ae0f123cfed606c` |

Durable directory:
`.local/goal-continuation-20261016T041003Z-original-Referral-unresolved-authority-no-delta-root/`.
Its `Original-Referral-approved-report-and-real-unresolved-authority-qualification.json`
retains the full Claude2 receipt `claude2-20261016T001224Z-579fe4eb`, approved
`2026-10-16T00:19:53Z`, for the same generation. Historical custody is not a new
review of changed content.

Current parent machine truth: `task_class=verification`, `mutates_canonical=false`;
candidate SHA/branch, reviewed SHA and merge SHA are all `not_applicable`.
The R2 same-task continuation task spec explicitly calls `report-r2` optional
custody metadata, not a Git materialization/commit/PR/Source-CI gate. This
canonical helper's PR must not replace the parent's noncanonical identity.

## Precise triage reproduction

Production `control_plane.usecases.chair_review_policy.blocked_task_triage_kind`
concatenates task ID, title, summary, next text and artifacts, then selects
`history_repair` if any substring contains `commit`, `branch`, `worktree`,
`task-scoped`, `history`, `head moved`, `pre-commit`, or `push`, before testing
contract/product markers. The parent's preservation narrative contains
`No ... commit/PR`, `history` and `worktree`, although its active hold is monetary
authority. Calling the **real production function** on the current single-task
`show` slice reproduces `history_repair`.

This establishes a false-positive classification route, not the precise
chairman action that created this helper: `supervisor_runtime` also accepts the
chairman's chosen kind when creating unblock tasks. No shared classifier or
runtime code changes are in scope. Such a fix requires normal separate scope
coordination; this task records the safe operational correction below.

## Safe continuation and required machine-truth update

1. Preserve both original refs, locks, worktrees and report pairs. Do not clean,
   move, commit or overwrite those untracked reports. Verified durable copies
   already exist. No branch synchronization is needed for this report.
2. **Before merging this helper**, Supervisor must record these fields on this
   helper using current-release `assign` with `TASK_METADATA_JSON`, retaining
   Codex/Claude and all other metadata, and read them back:

   ```json
   {
     "resolved_parent_status": "blocked",
     "resolved_parent_waiting_for": "Codex",
     "resolved_parent_next": "History audit finds no divergent/published task history. Preserve original noncanonical report generation 8319227035cd4000956d0b3a9d19ad56 and Key2; await the five original monetary-authority inputs in approved report section 8.6, then normal same-task continuation. No reset/rebase/force-push or unchanged-report re-handoff."
   }
   ```

   `ai_status.apply_unblock_parent_resolution` defaults to `todo` without an
   explicit disposition; helper merge must not erase the actual policy hold.
   `resolved_parent_waiting_for` must name a `KNOWN_AGENTS` lane: use the
   existing parent owner Codex. Supervisor coordinates the authority input but
   is a command actor, not a valid waiting-for lane in this release.

3. Supervisor must use current-release `note` on the original parent to reference
   this artifact and the next step above. Preserve blocked status, full criteria,
   generation and existing acceptance; do not re-handoff the unchanged report.
4. Obtain the five existing §8.6 inputs: approved referral
   `enterprise_dispatch/businessDispatchSubtype` policy citation or actual
   original-authority decision; lawful producer/rule/immutable version;
   service-area and pickup/dropoff coordinate plus identity/product/entry scope;
   amount/range/fixedPrice/currency/minor-unit/rounding; immediate/scheduled
   pricing time, TTL and version retention. An actual not-authorized disposition
   must remain explicit. Do not invent prices from 1500, UI 290, serviceFeeBps,
   fixedFareAllowed, or passenger-only PAX tariff.
5. Both original dependencies are archived DONE in
   `Original-SR-CONTRACT-and-RECOVERY-complete-archived-DONE-authority-records.json`
   in the durable directory above: `SR-CONTRACT-001` (Gemini/Codex2) and
   `AUDIT-RECOVERY-PROVIDERS-20261002` (Claude/Codex). These roles and DONE are
   provenance, not a new monetary-policy approval. Missing active `show` rows
   do not establish missing authority records.
6. Only genuine new authority input permits normal Supervisor same-parent
   resumption. Owner revises both original report artifacts within existing
   scope, validates changed content and, if materially changed, hands off a new
   noncanonical generation for independent review. Old Key 2 is historical
   credit and cannot approve changed monetary binding. No fabricated Key 1 pass
   or Source/C022 completion, new product/scope/dependency, or provider pause.

### Actual dispatch-fence results

The current release's `TaskBoardCommandExecutor._guard_worker_command` permits
this worker to mutate only its assigned helper through lifecycle commands.
Two actual CLI attempts on 2026-10-17 failed before writes:

| Attempt                                                                                                                                                                       | Result                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `AI_NAME=Codex .../ai-status.sh progress REFERRAL-PRODUCT-QUOTE-CONSUMER-BINDING-20261015 <diagnosis>`                                                                        | Exit 1: `Dispatched worker cannot mutate a different task`                   |
| `AI_NAME=Codex TASK_METADATA_JSON=<initial disposition payload> .../ai-status.sh assign REFERRAL-PRODUCT-QUOTE-CONSUMER-BINDING-20261015-UNBLOCK-HISTORY-REPAIR Codex Claude` | Exit 1: `Dispatched workers must use their assigned task lifecycle commands` |

The exact executable is
`/home/lupin/workspace/drts-fleet-platform/.artifacts/releases/orchestrator-4da15372d696/tools/development-orchestrator/bin/ai-status.sh`.
Do not clear dispatch variables, impersonate Supervisor or edit status files.
The rejected initial payload used waiting-for `Supervisor`; source validation
subsequently established that actor is absent from `KNOWN_AGENTS`. The required
payload above corrects it to Codex before any successful metadata transaction.
The helper's lifecycle message must retain this coordination request. Acceptance
item "Update the parent task" is **pending**, not passed. Keep PR draft and
helper in progress until Supervisor applies the disposition and parent note;
then hand off the frozen candidate normally to Claude without another push.

## Finding-level verification

| Finding / acceptance             | Basis and result                                                                                                                                     | Command / evidence                                                                                           | Remaining limit                                             |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Identify contamination           | 0 parent-only commits; inherited unrelated HEAD subjects; intentional noncanonical report custody; production triage returns history kind from prose | `rev-list --left-right --count`, exact `ls-remote`, reflogs, `gh pr list`, production callable probe; exit 0 | No deleted-history claim or runtime acceptance              |
| Safe repair path                 | Preserve refs/reports; route five-field authority decision; retain blocked disposition                                                               | R2 spec, R4 custody, current task slice and 23 probe assertions                                              | Monetary decision remains absent                            |
| Scoped canonical commit/push/PR  | Only this artifact staged; normal publication below                                                                                                  | Git diff/commit, ordinary push, PR head check                                                                | Review/CI/merge must match helper candidate                 |
| Update parent next step          | Exact next step and disposition specified; two writes rejected by dispatch guard                                                                     | Current-release CLI, exit 1 twice; real guard source                                                         | **Pending Supervisor metadata and parent note; merge held** |
| Preserve prior repeated findings | Seven-item R4 repair matrix and Claude2 review retained byte-for-byte                                                                                | Four report/copy hashes and Key 2 custody hash match                                                         | No new report, 55-check rerun or product regression claimed |

Machine-specific probe and evidence, intentionally under `.local`:

`/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-referral-product-quote-consumer-binding-20261015-unblock-history-repair/.local/referral-history-repair/{audit.py,audit.json}`

Re-run from this worktree: `python3 .local/referral-history-repair/audit.py`.
It invokes production triage, reads only the parent task slice, verifies custody
SHA-256, archived dependency status, refs/counts/reflogs, and parent PR absence.
All launched checks must finish before handoff. No product servers, browser/E2E,
Docker, deployment, DB changes, worker control or history rewrite were used.

## Publication receipt

- Published anchor: `20f109948237c01cf6b1e83a6c6486965fe2cee8`, ordinary
  `git push -u origin codex/referral-product-quote-consumer-binding-20261015-unblock-history-repair`, exit 0.
- Draft PR: [#2763](https://github.com/ajoe734/drts-fleet-platform/pull/2763),
  base `dev`. Initial PR head equalled the published anchor. This final receipt
  is a subsequent ordinary task commit, preserving that published anchor.
- Read-only probe: **23/23 passed, exit 0**. Full-range whitespace check
  (`git diff --check origin/dev`) identified one Markdown hard-break trailing
  space in the anchor; removed in a subsequent ordinary commit, then rechecked.
  No parent report edits or new parent acceptance evidence.
- Candidate handoff is held pending Supervisor metadata and parent note above.
  The final local, remote and PR head must match; record that full SHA in the
  helper's progress, then use it unchanged for handoff after coordination.
- Hosted CI is tracked by the PR at its exact head; no CI pass is inferred from
  the earlier anchor or from this local probe. Review/CI/merge remain separate
  lifecycle gates. Keep draft until the parent disposition is safely recorded.

## 2026-10-19: delivery provenance and recorded parent disposition

The October 17 report and publication receipt above are retained in full as
historical evidence. At that time the worker's two coordination attempts were
rejected, so its report correctly described the Supervisor disposition as
pending. The current helper metadata now contains all three exact blocked
parent-disposition fields, and the parent note records the concrete five-input
next step. The parent remains blocked, generation
`8319227035cd4000956d0b3a9d19ad56`, with its existing Key 2; Key 1 and the five
original monetary-authority inputs remain outstanding. These completed
coordination steps do not supply a price decision or product acceptance.

Independent exact-candidate review identified that the original publication
ledger did not disclose the literal machine Git identities of its four
published commits:

| Published commit                           | Literal Git author and committer | Declared trailers                  |
| ------------------------------------------ | -------------------------------- | ---------------------------------- |
| `20f109948237c01cf6b1e83a6c6486965fe2cee8` | Gemini2 <gemini2@google.com>     | LLM-Agent: codex; Reviewer: Claude |
| `a0f2364e49d494c59c23b1e09ac8d9045d8855bd` | Gemini2 <gemini2@google.com>     | LLM-Agent: codex; Reviewer: Claude |
| `a641dac8a13d1afd57a15548ddd44e02fa088c6e` | Gemini2 <gemini2@google.com>     | LLM-Agent: codex; Reviewer: Claude |
| `9eafea74a5f136b42fba935da1cb5ada2dbcae6e` | Gemini2 <gemini2@google.com>     | LLM-Agent: codex; Reviewer: Claude |

The recorded native owner was Codex. The literal Git metadata differs from
that task/LLM attribution; it is preserved exactly, not relabeled or
retroactively approved. The actual original hosted commit-trailer checker
reported all four commits OK. That positive result remains valid within the
checker's implemented rules. No existing rule was established requiring a
Git author string to equal the LLM-Agent string, and this delivery creates
no such rule or identity mechanism. The finding concerns the completeness
of this helper's original publication evidence. The metadata discrepancy
alone does not establish who operated the earlier session.

The original branch and
[PR #2763](https://github.com/ajoe734/drts-fleet-platform/pull/2763), its four
commits, earlier independent report approval and own successful CI remain
historical evidence. The old helper review requested changes to original
acceptance item 3, then normally reopened this same helper. The current
independent reviewer is Codex2 after normal Supervisor routing from Pi;
the earlier Claude trailers describe their original publication, not a new
review by Claude or Codex2.

The original Codex author now delivers the same sole document from accepted
dev `607cf709dabbd115df77b491419506de8cfd61d9` on
`codex/referral-product-quote-consumer-binding-20261015-unblock-history-repair-r2-20261019`,
using explicit command-local Codex Git author and committer metadata. All
four original acceptance criteria, both original dependencies, the sole
artifact and every parent-disposition field remain unchanged. The new
candidate requires its own exact SHA, normal publication, actual hosted CI,
independent Codex2 review and protected merge. No old CI or report approval
approves changed content or supplies those new delivery results.

The normal continuation changes this document only. All parent refs, locked
worktrees, report pairs, history and existing acceptance are preserved. No
parent monetary key, product Source/C022 completion, broader scope, new
security policy, provider/account control, runtime, cloud deployment or
full-system completion is supplied by this helper.
