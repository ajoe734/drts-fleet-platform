# EXECUTION_MODE_GIT_RULES

Apply when the current mode in `ai-status.json` is `supervisor_managed_execution`. Discussion-mode lanes do not commit code.

Source of truth: `docs/ops/branch-strategy.md`, `.orchestrator/skills/task-closeout-finalization.md`, `AI_COLLABORATION_GUIDE.md §Commit Gate`. This file is the short briefing for any lane that is about to touch git.

## 1. Pick the right base branch (track-routed)

Task-IDs route automatically to one of two integration trunks:

| Track           | Task-ID prefixes                                                                                                        | Base branch                                  |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Backend         | `BE-*`, `API-*`, `SC-*`, `OBS-*`, `EVD-*`, `FWD-*`, `TCH-*`, `PRT-*`, `INFRA-*`, `BE-CC-*`, `BE-APR-*`, `BE-INTEG-*`    | `merge/backend-dev-into-main`                |
| Frontend        | `UI-*`, `*-UI-*`, `DRV-*`, `PA-*`, `PB-*`, `TEN-UI-*`, `OPS-UI-*`, `ADM-UI-*`, `DS-*`, `XS-*`, `TN-*`, `SBK-*`, `SYS-*` | `merge/frontend-dev-into-main`               |
| Docs/Postmortem | `DOC-*`, `DOCS-*`, `POST-*`                                                                                             | follows primary file change; default backend |

Query the canonical mapping when in doubt:

```bash
python3 .orchestrator/branch_routing.py <TASK-ID>
```

The supervisor also stamps the routed track / base branch into the worker
record on dispatch (`state.workers[run_id].routing`), so downstream tooling
(dashboard, promote-nightly, future PR opener) can read the routing
without re-deriving it.

## 2. Branch naming

Push to your lane branch named after the task-id (kebab-case):

```
<lane>/<task-id-kebab>
# examples
codex/be-cc-001
claude/ten-ui-rd-010
gemini2/doc-ten-gov-001
```

Lane is your `AI_NAME`, lowercased. Branches are short-lived; GitHub auto-deletes them 7 days after merge.

## 3. Commit format (enforced by `.husky/commit-msg`)

```
<TASK-ID>: <imperative summary, ≤80 chars>

<body, optional>

LLM-Agent: <your lane, e.g. Codex>
Task-ID: <TASK-ID>
Reviewer: <reviewer lane, must differ from LLM-Agent>
Verified: <commands you ran>      # required when you ran any verification
```

Exempt subjects (hook lets these through automatically): `Merge ...`, `Revert ...`, `fixup!`, `squash!`, `wave-merge:`, `wave-close:`, `promote:`, `hotfix:`, `Initial commit`, `OPS-GIT-WORKFLOW-*`, `OPS-DOC-*`, `OPS-REBASE-*`.

The hook checks: subject pattern, length ≤80, three required trailers present, and that the subject's task-id matches the `Task-ID:` trailer.

## 4. Staging (Shared-Index discipline)

Multiple lanes run in the same worktree. `git add .` or `-A` will sweep up other workers' files and corrupt your commit. Use the isolated-index tool:

```bash
python3 scripts/git/worker_commit.py \
  --task-id "$TASK_ID" \
  --message-file /tmp/$TASK_ID-msg.txt \
  --scope path/a path/b \
  --index-file /tmp/git-index-$$
```

This sets a private `GIT_INDEX_FILE`, clears stale staging, stages exactly `--scope`, rejects anything outside scope, then commits. The shared `.git/index` is only touched at the atomic commit step.

If you must use plain git (foreground human work), at minimum:

```bash
git restore --staged -- :/                    # clear residue from other workers
git add -- <explicit paths>                   # never `git add .` / `-A`
git diff --cached --name-only                 # eyeball it
git commit -F /tmp/$TASK_ID-msg.txt
```

## 5. Push policy

Only normal non-force push to your lane branch:

```bash
git push                                       # if upstream already set
git push -u origin HEAD:<lane>/<task-id-kebab> # first push
```

Forbidden flags: `--force`, `-f`, `--force-with-lease`, `--mirror`, `--delete`, `--all`, `--tags`, `--prune`. Branch protection rejects them on permanent branches and the supervisor's auto-approval refuses them across the board.

Forbidden operations on already-pushed commits: `git commit --amend`, `git rebase` that rewrites pushed history, `git push --no-verify`, `git push --no-gpg-sign`.

## 6. Pre-commit blocklist (`.husky/pre-commit`)

These paths cannot be staged (hook refuses commit):

- `docs-site/**` — read-only mirror; regenerate via `./scripts/sync-state.sh`
- `.orchestrator/runtime-logs/**`, `.orchestrator/logs/**` — runtime artifacts
- `.orchestrator/event-queue.jsonl` — ephemeral queue
- `**/*.bak-*` under `.orchestrator/` — timestamped backups
- `*.pid`, `dashboard-bundle.json`, `portable-orchestrator-bundle-*.tar.gz`

Emergency bypass (record in `progress` why): `ALLOW_GENERATED_FILES=1 git commit ...`

## 7. Closeout (`done`) requires

1. Task is already in `review_approved`.
2. Task-scoped commit created with the trailer format above.
3. Normal non-force push to `<lane>/<task-id-kebab>` succeeded.
4. Run with all four env present:

```bash
AI_NAME=<lane> \
  COMMIT_HASH=<sha> \
  COMMIT_SUBJECT="<subject>" \
  PUSH_REMOTE=origin \
  PUSH_BRANCH=<lane>/<task-id-kebab> \
  ./scripts/ai-status.sh done <TASK-ID> "<closeout note>"
```

If a safe normal push is not possible, record a `progress` or `blocker` note. Do not mark `done` partial.
