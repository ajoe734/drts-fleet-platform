# Integration Closeout

Use this checklist whenever a worker is closing a canonical implementation task or an umbrella task that is meant to become testable on the shared dev environment.

This is the layer above `task-closeout-finalization.md`. A task branch can be committed and pushed without the development loop being closed.

If a task object sets `required_integration_status`, that task-level requirement overrides the looser default closeout floor. Example: a task with `required_integration_status=dev_deployed` cannot finalize with `not_applicable`, `merged_to_dev`, or git merge reconciliation alone.

## Completion Levels

Record one of these values as `INTEGRATION_STATUS` when finalizing a task:

- `branch_pushed`: the approved task commit was pushed to the task branch, but it is not merged to `dev`.
- `pr_open`: a PR to `dev` exists, but CI, review, conflict repair, or merge is still pending.
- `ci_pending`: PR/integration CI is still running.
- `ci_failed`: CI failed and the worker has recorded the failure as a blocker/progress note.
- `merged_to_dev`: the approved branch is merged and the delivered commit is reachable from `origin/dev`.
- `deploy_blocked`: merge reached `dev`, but `Deploy - Dev` could not be run or did not succeed.
- `dev_deployed`: the merged change is included in a successful `Deploy - Dev` workflow run.
- `not_applicable`: sidecar/support-only work that does not mutate canonical product code or require dev deploy.

Do not describe a task as "development complete", "ready on dev", or "published to dev" unless the evidence reaches `dev_deployed`.

## Required Flow

1. Finish branch closeout first: review approved, task-scoped commit, focused verification, normal non-force push.
2. Open or update the PR to `dev`; include the task id, acceptance evidence, and any reviewer notes.
3. Verify PR CI. Do not merge failing CI. If CI fails, record `INTEGRATION_STATUS=ci_failed` and a blocker/progress note with the failing check URL.
4. Merge to `dev` only after CI is green and the PR is review-safe. Never merge salvage branches or broad cleanup branches into `dev` without explicit scope.
5. Fetch `origin/dev` and verify the delivered commit is integrated:
   ```bash
   git fetch origin
   git merge-base --is-ancestor <commit-sha> origin/dev
   ```
6. Publish/deploy dev when the task or umbrella acceptance requires the dev test machine to reflect the change. In v4 this means a `publish/v*` snapshot and a successful `Deploy - Dev` run, or an explicit `workflow_dispatch` of `.github/workflows/deploy-dev.yml`.
7. Record evidence in machine truth. If any step cannot be completed, do not go silent; create a blocker/progress note or an explicit follow-up closeout task.

## Evidence Fields

Use these environment variables with `scripts/ai-status.sh done` or `python3 scripts/ai_status.py done`:

- `INTEGRATION_STATUS`: one of the values above.
- `PR_URL`: PR URL when a PR exists.
- `CI_STATUS`: summary such as `passed`, `pending`, `failed`.
- `CI_RUN_URL`: check suite or workflow run URL.
- `MERGED_REF`: usually `origin/dev`.
- `MERGE_COMMIT`: merge commit, squash commit, or delivered commit that is reachable from `origin/dev`.
- `DEV_DEPLOY_RUN_URL`: successful `Deploy - Dev` run URL.
- `DEV_DEPLOY_SHA`: SHA deployed by that run.
- `DEV_DEPLOY_SOURCE_REF`: `publish/v*`, release tag, branch, or SHA used by the deploy run.

For tasks with `required_integration_status=dev_deployed`, all of the following are mandatory at `done` time and must be recorded explicitly in machine truth:

- `PR_URL`
- `CI_STATUS`
- `CI_RUN_URL`
- `MERGED_REF`
- `MERGE_COMMIT`
- `DEV_DEPLOY_RUN_URL`
- `DEV_DEPLOY_SHA`
- `DEV_DEPLOY_SOURCE_REF`

Example for a branch-only closeout that still needs integration:

```bash
AI_NAME=<owner> \
COMMIT_HASH=<sha> COMMIT_SUBJECT="<subject>" PUSH_REMOTE=origin PUSH_BRANCH=<branch> \
INTEGRATION_STATUS=branch_pushed PR_URL=<pr-url> \
./scripts/ai-status.sh done <task-id> "Branch closeout complete; PR/CI/merge/dev deploy still pending and tracked in follow-up."
```

Example for a fully closed development loop:

```bash
AI_NAME=<owner> \
COMMIT_HASH=<sha> COMMIT_SUBJECT="<subject>" PUSH_REMOTE=origin PUSH_BRANCH=<branch> \
INTEGRATION_STATUS=dev_deployed PR_URL=<pr-url> CI_STATUS=passed CI_RUN_URL=<ci-url> \
MERGED_REF=origin/dev MERGE_COMMIT=<merge-or-squash-sha> \
DEV_DEPLOY_RUN_URL=<deploy-url> DEV_DEPLOY_SHA=<deployed-sha> DEV_DEPLOY_SOURCE_REF=<publish-or-ref> \
./scripts/ai-status.sh done <task-id> "Closed loop: approved, pushed, merged to dev, and deployed to dev."
```

## Handoff Rule

If a worker cannot complete PR, CI, merge, or dev deploy because of permissions, quota, conflict risk, or environment access, it must leave a machine-truth trail:

- keep the task open with `progress` or `blocker` when branch closeout is not finished
- or finalize with the exact `INTEGRATION_STATUS` and create/hand off an explicit integration closeout task
- never claim the whole development loop is complete from branch evidence alone
