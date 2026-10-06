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

Crucially, the stale `candidate_generation` (`5c24dde8bab64e78b7f2a31f4acc49ca`) that caused the terminal loop remains on the parent task. The orchestrator or Chairman needs to reset `candidate_generation` to `null` to ensure `Codex` will stop diffing against the merged `-r2` candidate metadata.
