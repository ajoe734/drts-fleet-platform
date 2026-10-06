# Task Brief: C125-REAL-UPLOAD-STORAGE-20261005-UNBLOCK-HISTORY-REPAIR

## Finding: Branch Contamination / Terminal Loop
The parent task `C125-REAL-UPLOAD-STORAGE-20261005` candidate branch `codex2/c125-real-upload-storage-20261005-r2` (candidate `dca08ecfd4680275eda1dd268a191e5429732294`) was successfully reviewed and **MERGED** into `dev` via PR #2347 (merge SHA `446228cbc771a4ced774126a7d4aaddea4db73e6`).

However, the parent task remained `open` because it still requires further real GCS/ClamAV/hosted auth verification and missing implementation (as tracked in the task status: `R5b.2 deterministic INSTREAM-only transport`, `real gateway pending-denial`, etc.).

Codex entered a terminal loop because:
1. It is prohibited from force-pushing to or rebasing a published/merged candidate branch (`-r2`).
2. Codex's fetch/sync logic incorrectly evaluated the old original branch `codex2/c125-real-upload-storage-20261005` (`c52c87a402`) instead of advancing from the merged state on `dev`.

## Repair Path
Since the previous candidate is already merged into `dev`, the non-destructive repair path without force-pushing shared history is:
1. Create a fresh recovery branch `codex2/c125-real-upload-storage-20261005-r3` from the current `origin/dev`.
2. Handoff this unblock task so the supervisor can re-dispatch the parent task.
3. The parent task (now owned by Codex2) will operate on the clean `-r3` branch, implementing the remaining `R5b.2` and hosted auth features, and submit a new PR without touching the merged `-r2` history.

## Evidence
- `PR #2347` (merged as `446228cbc771a4ced774126a7d4aaddea4db73e6`)
- `codex2/c125-real-upload-storage-20261005-r2` is merged.
- `c52c87a4020cb7710f41fed020734a5424ed01a1` was the original branch head Codex was incorrectly diffing against.

## Unblocked Next Step
The parent task owner (Codex2) should continue implementation on a new branch `codex2/c125-real-upload-storage-20261005-r3` branched from `dev`, focusing on the missing real GCS/ClamAV and identity prerequisites.
