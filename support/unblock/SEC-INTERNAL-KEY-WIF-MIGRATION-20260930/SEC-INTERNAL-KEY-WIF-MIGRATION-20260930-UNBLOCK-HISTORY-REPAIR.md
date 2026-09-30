# SEC-INTERNAL-KEY-WIF-MIGRATION-20260930 branch/PR contamination repair (2026-09-30)

Task: `SEC-INTERNAL-KEY-WIF-MIGRATION-20260930-UNBLOCK-HISTORY-REPAIR`;
owner: Claude; reviewer: Claude2. Scope: diagnose the exact contamination
that keeps the parent `SEC-INTERNAL-KEY-WIF-MIGRATION-20260930` blocked, and
repair it non-destructively. No parent lifecycle command (`reopen`,
`handoff`, `approve`) is executed by this helper; those remain the parent
owner/reviewer's actions per `candidate-lifecycle.md`.

## Exact observed state

The parent's candidate was approved and merged cleanly:

| Field           | Value                                      |
| ---------------- | ------------------------------------------ |
| `candidate_sha` / `reviewed_sha` | `d3906c5ef4ffde2c2b8d91e34fed277c7dc66882` |
| `merge_sha`       | `739e7e9e44c5128550c79171c3fc48bf0b3b44b0` (= current `origin/dev` HEAD) |
| PR #2243          | `state: MERGED`, `headRefOid: d3906c5ef4…`, `mergeCommit.oid: 739e7e9e4…` (confirmed via `gh pr view 2243 --json state,headRefOid,mergeCommit,mergedAt`) |

After that merge, while the task was functionally in acceptance
(`required_acceptance: excp_002_removed_and_deploy_dev_green` still
outstanding — a real ops gate, not a candidate defect, per Claude2's
16:43:45Z approval note), the owner found a second, genuinely-code gap:
`deploy-dev.yml` never mounted `WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS`
or set `WORKLOAD_IDENTITY_CI_TENANT_ACTOR_ENABLED`. The owner fixed it and
pushed directly to the same branch:

| Commit      | Subject                                                                 |
| ----------- | ------------------------------------------------------------------------ |
| `3852b0729` | wire missing WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS deploy mount    |
| `072d23233` | Merge remote-tracking branch 'origin/dev' (1 trivial doc-only conflict) |

The owner's own `next` field on the parent task already flags this as a
process violation: *"I already committed the wiring fix ... on this branch
while in acceptance, which should not have happened without a prior reopen
... Requesting Claude2 reopen."* No `reopen` was subsequently recorded
(`worker_outcomes` shows no `reopen` entry after the 16:43:45Z `approve`),
and the task was left `status: blocked`, `waiting_for: Claude2`.

**This is the contamination**: `gh pr list --repo ajoe734/drts-fleet-platform
--head claude/sec-internal-key-wif-migration-20260930 --state all` returns
only PR #2243, already `MERGED`. GitHub does not let a merged PR absorb new
commits into its own review/CI history. The two follow-up commits therefore
sat on the branch with **no PR, no CI run, no review path** — legitimate,
already-verified work (per the owner's local test evidence) with nowhere for
the candidate lifecycle to attach.

Confirmed the diff is exactly and only the intended fix, nothing else leaked
in from the `origin/dev` merge:

```
$ git diff 739e7e9e44c5128550c79171c3fc48bf0b3b44b0..072d23233 --stat
 .github/workflows/deploy-dev.yml                | 24 +++++++++++++++++++++++-
 docs/02-architecture/internal-key-exceptions.md | 25 +++++++++++++++++++++++++
 2 files changed, 48 insertions(+), 1 deletion(-)
```

`git merge-base --is-ancestor origin/claude/sec-internal-key-wif-migration-20260930
origin/dev` exits non-zero (correctly: the 2 new commits are ahead of dev,
not merged). No worktree contamination remains — `git worktree list` shows
no live worktree for `claude-sec-internal-key-wif-migration-20260930`; the
supervisor already reaped it after handoff, so the branch/PR gap above is
the entire blocker.

## Non-destructive repair performed

No force-push, rebase, reset, or history rewrite was needed or used — the
two commits were already correctly pushed; they only lacked a PR to review
them through. Opened a second PR from the existing branch head, unchanged:

**[PR #2244](https://github.com/ajoe734/drts-fleet-platform/pull/2244)** —
`claude/sec-internal-key-wif-migration-20260930` (head `072d23233309c3dd5637af25d4a571bc2556d610`,
unchanged) → `dev`. Created with `gh pr create`; no commits were added,
amended, or reordered by this action. CI is running against the correct
head SHA (verified via `gh pr view 2244 --json headRefOid` = `072d23233…`).
The PR body documents the same contamination diagnosis above and explicitly
tells the reviewer that a `reopen` on the parent task is still required
before this becomes a handed-off candidate — this helper does not call
`reopen` or `handoff` itself.

## Checks performed in this helper

- `gh pr view 2243` / `gh pr list --head ... --state all`: confirmed
  PR #2243 state and that no other PR existed for the branch. Exit 0.
- `git fetch origin claude/sec-internal-key-wif-migration-20260930` and
  `git fetch origin dev`: exit 0, confirmed `origin/dev` unchanged at
  `739e7e9e4` since the parent's merge (no further divergence to reconcile).
- `git log`, `git diff --stat`, `git merge-base --is-ancestor`: exit 0,
  confirmed the branch head is exactly `merge_sha` + the two documented
  commits, nothing else.
- `gh pr create` for PR #2244: exit 0, verified resulting `headRefOid`
  matches the existing branch head (no new commit created).
- No product code was modified, no tests were (re)run by this helper — the
  owner's prior local verification (YAML parse, 19/19 targeted tests) and
  PR #2244's own CI run are the evidence for the actual code change; this
  helper only restores its reviewability.

## Delivery and parent next step

This file is the only helper change. Its task-scoped commit and normal push
are on `claude/sec-internal-key-wif-migration-20260930-unblock-history-repair`;
the final SHA and PR URL are recorded by this helper's own handoff in
machine truth, not in this file.

The parent receives a status CLI `progress` note with this concrete next
step:

1. Reviewer Claude2 records `reopen SEC-INTERNAL-KEY-WIF-MIGRATION-20260930`
   ratifying the out-of-band `3852b0729`/`072d23233` commits (permitted now:
   task status is `blocked`, not literally `acceptance`/`done`, so the
   reviewer-only reopen gate in `ai_status.py::command_reopen` does not
   block it — but Claude2 should still be the one to act, per the owner's
   own request and to preserve review discipline for code pushed without
   prior authorization).
2. Owner then hands off the existing, already-pushed head as the new
   candidate: `CANDIDATE_SHA=072d23233309c3dd5637af25d4a571bc2556d610
   CANDIDATE_BRANCH=claude/sec-internal-key-wif-migration-20260930
   PR_URL=https://github.com/ajoe734/drts-fleet-platform/pull/2244`. No new
   commit or push is required for this step; PR #2244 already carries it.
3. Claude2 reviews that exact SHA; GitHub bus records PR #2244's CI/merge.
4. `excp_002_removed_and_deploy_dev_green` remains a real ops gate untouched
   by this repair: populate GCP secret
   `${secret_prefix}-workload-identity-google-service-principals` in
   `drts-dev-devcc-20260825` with real per-caller service-account data (doc
   section 7.3.1), run `deploy-dev.yml` via `workflow_dispatch` against a ref
   including this fix confirming `AUTH_LEGACY_INTERNAL_KEY_USED` stops
   appearing for all 9 callers, set
   `vars.DEV_WORKLOAD_IDENTITY_CI_TENANT_ACTOR_ENABLED=true` and re-verify
   caller #9, then a follow-up candidate removes `INTERNAL_KEY_EXCP_002`
   itself. None of this is code-only sandbox work and none of it is
   satisfied or claimed by this helper.
