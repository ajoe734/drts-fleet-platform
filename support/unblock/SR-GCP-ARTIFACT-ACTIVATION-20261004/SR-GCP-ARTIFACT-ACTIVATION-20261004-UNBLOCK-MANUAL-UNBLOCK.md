# SR-GCP-ARTIFACT-ACTIVATION-20261004 unblock audit (2026-10-07)

Task: `SR-GCP-ARTIFACT-ACTIVATION-20261004-UNBLOCK-MANUAL-UNBLOCK`; owner:
Claude; reviewer: Claude2. Scope: diagnose why the parent remains `blocked`
even though both declared dependencies are `done`, and either make the
task-scoped fix or document the exact remaining blocker. No parent source
file is touched by this helper; no parent candidate handoff is performed.

## Dependencies are not the blocker

- `AUDIT-GCP-ARTIFACT-PROVIDERS-20261004`: `status: done`, merged
  (`merge_sha c0f5d66c6b90d8c2e9bf2107e73fef999fc2d5ac`), reviewed by Codex.
- `AUDIT-GCP-ARTIFACT-INFRA-20261004`: `status: done`, reviewed by Codex.

Both are fully satisfied. The parent's `status: blocked` is unrelated to
`depends_on` and is instead a live review REOPEN waiting on two Supervisor
(or user) policy decisions, as the parent's own `next` field already states.

## The blocker is unchanged in substance from the 2026-10-06 history-repair
## audit, now independently reconfirmed on a new candidate, plus one new
## structural finding

The prior helper, `SR-GCP-ARTIFACT-ACTIVATION-20261004-UNBLOCK-HISTORY-REPAIR`
(commit `64ae06317`, 2026-10-06), already found that the parent was waiting on
a **write-scope decision**, not a git/history defect, for the same
`publishDriverFeePlan` fire-and-forget defect. The candidate has since been
rebuilt twice (commit-tree rebuilds per two separate Supervisor authorizations
dated 2026-10-05T23:40Z and 2026-10-07T00:30Z, both preserved in the parent's
`integration_notes`). This audit re-verifies the current state on the
*current* candidate rather than trusting the prior finding by name.

### Point 1 (confirmed unchanged): `billing-settlement.controller.ts` /
### `.service.ts` are outside `write_scopes`, and the defect is real

Current candidate: `60376bf155eb60c8e60d3bfa318629356d1d5533`, branch
`claude/sr-gcp-artifact-activation-20261004`, PR
[#2384](https://github.com/ajoe734/drts-fleet-platform/pull/2384).

Read directly from that exact candidate tree:

- `apps/api/src/modules/billing-settlement/billing-settlement.controller.ts:314-326`
  — `publishDriverFeePlan` is a plain (non-`async`) method that does
  `return toApiSuccessEnvelope(this.billingSettlementService.publishDriverFeePlan(command, requestId), requestId)`,
  passing the service call's `Promise` straight into the envelope helper
  without `await`.
- `apps/api/src/common/api-envelope.ts` `toApiSuccessEnvelope` stores whatever
  it is given verbatim; it does not detect or await a `Promise`.
- Net effect: the HTTP response is built and returned before the service's
  `await this.persistChanges(...)` (service.ts:2029) resolves. Any
  persistence failure becomes a detached, unobserved promise rejection; the
  client never sees it, and this task's own in-`write_scopes`
  `tests/support/signed-session-fixture.ts` fixture helper — which calls this
  exact endpoint to prepare fixtures — cannot distinguish a failed publish
  from a successful one.
- Confirmed via `ai-status.sh show SR-GCP-ARTIFACT-ACTIVATION-20261004`:
  `write_scopes` lists 14 paths; neither `billing-settlement.controller.ts`
  nor `billing-settlement.service.ts` is one of them.
- Confirmed no other open task (`blocked`/`in_progress`/`review`/`todo`/
  `backlog`) currently holds either file in its own `write_scopes` — the
  grant would not collide with any parallel task.

This matches Claude2's 2026-10-07T01:44:21Z REOPEN of this exact candidate
almost verbatim ("P1 REPEATED-DEFECT carried forward unchanged... Supervisor
must either grant write_scopes... or formally re-scope this requirement to a
task that already owns those files").

### Point 2 (confirmed unchanged): hosted GCS/ClamAV live evidence has never
### been executed for this task, ever

`required_acceptance` is `['immutable_hosted_workflow_review_ci',
'private_resources_iam_and_image_provenance',
'genuine_scan_storage_positive_negative',
'shared_dev_provider_activation_readback']`. Across this task's entire
history (32 recorded `worker_outcomes`, multiple candidate rebuilds since
2026-10-02), no reviewer has ever observed a real run of
`.github/workflows/provision-dev-artifact-backends.yml` against live GCP
resources. VM-restricted owner/reviewer sessions cannot dispatch it
themselves.

### New finding this round: the hosted-workflow requirement has a structural
### ordering problem, independent of authorization

`.github/workflows/provision-dev-artifact-backends.yml` is itself one of this
candidate's 14 `write_scopes` files — it does not yet exist on `origin/dev`
(`git show origin/dev:.github/workflows/provision-dev-artifact-backends.yml`
fails). GitHub only allows `workflow_dispatch` runs for workflow files that
already exist on the repository's default branch; a `workflow_dispatch`
workflow that only exists on a feature branch cannot be dispatched via the
Actions UI or API at all. This is the same constraint already recorded for
this repo under the publish→main promotion gate (new `workflow_dispatch`
workflows wait for the next green deploy-dev + soak before they are usable).

So items 2–4 of `required_acceptance` cannot be produced *before* this exact
candidate merges to `dev` — the workflow they depend on does not exist yet
anywhere dispatchable. This is a separate question from "who is allowed to
press the button": even a fully authorized human cannot press it yet.

The candidate lifecycle documented in `AI_COLLABORATION_GUIDE.md` §5 is
`review -> integrating -> acceptance -> done`, i.e. acceptance evidence is
normally collected *after* merge, not as a precondition for reviewer
approval. Reviewer's REOPEN is treating hosted-dispatch evidence as a
pre-merge gate for this activation task specifically (plausible, since
merging an unexercised provisioning workflow has its own risk), but that is a
policy choice, not something this helper can decide. Supervisor/user needs to
settle which model applies here:

- (a) keep hosted-dispatch evidence as a pre-merge gate, in which case someone
  with real GCP credentials must push this exact reviewed tree (or an
  equivalent) to `dev` far enough to register the workflow, dispatch it, and
  feed the result back into review before merge proper — a two-step/soft
  landing most other gated workflows in this repo do not need; or
- (b) treat `private_resources_iam_and_image_provenance`,
  `genuine_scan_storage_positive_negative`, and
  `shared_dev_provider_activation_readback` as **post-merge acceptance**
  items per the normal lifecycle: merge once same-SHA CI is green and the
  only remaining code defect (Point 1) is fixed, then dispatch and record the
  live GCP evidence against `dev` via `record-acceptance` before `done`.

## No other git/worktree/branch contamination found

`git worktree list --porcelain` shows only this helper's own assigned
worktree; no collision with the parent's candidate branch
`claude/sr-gcp-artifact-activation-20261004`. `gh pr view 2384` confirms
`headRefOid` matches `60376bf15` exactly and `state: OPEN`. `gh pr checks
2384` shows all 29 checks `pass` (one `orchestrator-tests` job skipping, not
failing).

## Concrete unblocked next step for the parent

Two decisions, both outside this helper's authority to make unilaterally
(one edits a different task's production billing code path; the other
authorizes real GCP cloud-resource provisioning):

1. **Scope**: grant `apps/api/src/modules/billing-settlement/billing-settlement.controller.ts`
   and `billing-settlement.service.ts` to this task's `write_scopes` so the
   current owner can make `publishDriverFeePlan` `async`/`await` the service
   call and propagate failures — recommended, since no parallel task holds
   these files and the fix is a small, well-understood correctness change; or
   redirect it to a new dedicated task.
2. **Hosted-dispatch ordering + authorization**: decide between pre-merge
   gating (option a above, needs a human with real GCP credentials to
   register and dispatch the workflow before merge) or post-merge acceptance
   (option b, resolves the chicken-and-egg problem cleanly and matches the
   documented candidate lifecycle). Either way, actually running
   `provision-dev-artifact-backends.yml` against live GCP resources requires
   a human with real credentials; this VM-restricted session must not and
   does not attempt it.

`resume-blocked` and any `write_scopes`/acceptance-model change is
Supervisor's/the user's call once these two decisions are made; this helper
does not make them or touch the parent's `status`/`waiting_for`.

## Checks performed in this helper

- `ai-status.sh show` on the unblock task, the parent, and both `depends_on`
  tasks.
- Read the parent's full `worker_outcomes` history (32 entries) and
  `integration_notes` to confirm the current candidate identity and every
  prior Supervisor decision still in force.
- `git show 60376bf15:apps/api/src/modules/billing-settlement/billing-settlement.service.ts`
  and `...controller.ts` — read the actual `publishDriverFeePlan` code at the
  exact candidate SHA (not the predecessor commit that claimed to fix it) to
  independently confirm the defect is real and still present.
- `ai-status.sh list --status {blocked,in_progress,review,todo,backlog}` for
  `billing-settlement` — confirmed no collision for a scope grant.
- `gh pr view 2384 --json state,mergeable,mergeStateStatus,headRefOid,headRefName`
  and `gh pr checks 2384` — confirmed candidate identity and all-green CI.
- `git show origin/dev:.github/workflows/provision-dev-artifact-backends.yml`
  — confirmed the workflow is not yet registered on the default branch,
  the basis for the new structural-ordering finding above.
- `git worktree list --porcelain` — confirmed no worktree collision.
- No product source file was touched; no test suite was run (nothing in this
  task's own scope changed product behavior).

## Delivery

This file is the only change in this helper task. Its task-scoped commit and
normal push are on
`claude/sr-gcp-artifact-activation-20261004-unblock-manual-unblock`; the
final SHA and PR URL are recorded by this helper's own `handoff` in machine
truth. The parent task receives a `note` via the status CLI summarizing this
finding and the two concrete pending decisions; the parent's
`status`/`waiting_for` are left untouched since those decisions, not this
helper, resolve the block.
