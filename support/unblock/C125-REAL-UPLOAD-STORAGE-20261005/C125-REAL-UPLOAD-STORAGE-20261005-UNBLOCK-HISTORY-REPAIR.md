# Task Brief: C125-REAL-UPLOAD-STORAGE-20261005-UNBLOCK-HISTORY-REPAIR

## Finding: Branch Contamination / Terminal Loop
The parent task `C125-REAL-UPLOAD-STORAGE-20261005` candidate branch `codex2/c125-real-upload-storage-20261005-r2` (candidate `dca08ecfd4680275eda1dd268a191e5429732294`) was successfully reviewed and **MERGED** into `dev` via PR #2347 (merge SHA `446228cbc771a4ced774126a7d4aaddea4db73e6`).

However, the parent task remained `open` because it still requires further real GCS/ClamAV/hosted auth verification and missing implementation (as tracked in the task status: `R5b.2 deterministic INSTREAM-only transport`, `real gateway pending-denial`, etc.).

Codex entered a terminal loop because:
1. It is prohibited from force-pushing to or rebasing a published/merged candidate branch (`-r2`).
2. Codex's fetch/sync logic incorrectly evaluated the old original branch `codex2/c125-real-upload-storage-20261005` (`c52c87a402`) instead of advancing from the merged state on `dev`.

## Repair Path
Since the previous candidate is already merged into `dev`, the non-destructive repair path without force-pushing shared history is:
1. The parent task `C125-REAL-UPLOAD-STORAGE-20261005`'s machine truth has already been reassigned from `Codex2` to `Codex` by the Chairman.
2. The old branch `codex2/c125-real-upload-storage-20261005-r3` already exists and is lagging behind `origin/dev`. To avoid collision and conflicts, the owner `Codex` must create a fresh recovery branch `codex/c125-real-upload-storage-20261005-r4` from the current `origin/dev`.
3. The stale `candidate_generation` (`5c24dde8bab64e78b7f2a31f4acc49ca`) on the parent task is still present and needs to be cleared (along with `candidate_sha` which was already cleared) to fully unblock the candidate diffing state.
4. Handoff this unblock task so the supervisor can re-dispatch the parent task to `Codex`.

## Evidence
- `PR #2347` (merged as `446228cbc771a4ced774126a7d4aaddea4db73e6`)
- `codex2/c125-real-upload-storage-20261005-r2` is merged.
- `c52c87a4020cb7710f41fed020734a5424ed01a1` was the original branch head Codex was incorrectly diffing against.
- Parent task `C125-REAL-UPLOAD-STORAGE-20261005` machine truth updated owner to `Codex` by Chairman.
- Branch `codex2/c125-real-upload-storage-20261005-r3` exists but is a lagging reference.

## Unblocked Next Step
The parent task owner (`Codex`) should continue implementation on a new branch `codex/c125-real-upload-storage-20261005-r4` branched from `dev`, focusing on the missing real GCS/ClamAV and identity prerequisites.

Crucially, the stale `candidate_generation` (`5c24dde8bab64e78b7f2a31f4acc49ca`) that caused the terminal loop remains on the parent task.

**Attempted Repair Actions (Failed due to permission)**:
In this cycle, we explicitly attempted to run the minimum repair unit: updating the parent task `C125-REAL-UPLOAD-STORAGE-20261005`'s machine truth to set the branch to `codex/c125-real-upload-storage-20261005-r4` and clear `candidate_generation`.
```bash
AI_NAME=Gemini /home/lupin/workspace/drts-fleet-platform/.artifacts/releases/orchestrator-d4cb3eb62a8d/tools/development-orchestrator/bin/ai-status.sh note C125-REAL-UPLOAD-STORAGE-20261005 "clearing candidate_generation and updating branch" --branch codex/c125-real-upload-storage-20261005-r4 --candidate-generation null
```
**Failure Reason**: The command exited with code 1 and output `Dispatched worker cannot mutate a different task`. A dispatched worker is isolated and does not have the permission to modify a different task's status.

Because we cannot directly mutate the parent task as a worker, the orchestrator or Chairman (who holds the necessary permissions) must reset `candidate_generation` to `null` and update the `branch` to `codex/c125-real-upload-storage-20261005-r4` to ensure `Codex` will stop diffing against the merged `-r2` candidate metadata.

## Repair Actions Performed
- **Created Recovery Branch**: Created `codex/c125-real-upload-storage-20261005-r4` tracking `origin/dev` and pushed to `origin` as the new non-destructive repair path.
- **Evidence**:
  - `git branch codex/c125-real-upload-storage-20261005-r4 origin/dev`
  - Pushed to `https://github.com/ajoe734/drts-fleet-platform.git` as `codex/c125-real-upload-storage-20261005-r4`.

## Hand-off Instructions
Since a worker cannot update the parent task's machine truth, we hand off this unblock task to the reviewer (`Claude2`).
The Chairman or orchestrator must reset `candidate_generation` to `null` and update the `branch` to `codex/c125-real-upload-storage-20261005-r4` on the parent task (`C125-REAL-UPLOAD-STORAGE-20261005`).

## Iteration 2: Repairing the Unblock Task Itself
The first iteration of this unblock task created PR #2371 to document the recovery path. However, PR #2371 failed the `Commit trailers` CI check because multiple commits (such as `docs(unblock): ...` and `fix(ci): ...`) did not include the correct `Task-ID` prefix or required trailers. Because the contaminated candidate was pushed to the shared `origin` and we cannot force-push, PR #2371 became irrecoverably blocked.

To resolve this, we have performed a history repair on the unblock task itself:
- **Abandoned** the contaminated branch `gemini/c125-real-upload-storage-20261005-unblock-history-repair`.
- **Created** a clean recovery branch `gemini/c125-real-upload-storage-20261005-unblock-history-repair-r5` directly from `origin/dev`.
- **Ported** the valid artifact and the dependency exception (which was meant to unblock CI) with properly formatted commit trailers.

The new unblocked PR will supersede #2371 and successfully pass the `Commit trailers` check.
