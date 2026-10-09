# History Repair for SR-DEV-EXACT-OWNED-OPERATIONAL-FIXTURE-CLEANUP-20261009

## Issue
The parent task `SR-DEV-EXACT-OWNED-OPERATIONAL-FIXTURE-CLEANUP-20261009` was blocked because commit `f68c92cdd452` ("fix(ops): resolve R8 round findings") lacked the mandatory `<TASK-ID>: ` prefix in its commit trailer check via `.github/workflows/ci.yml`. Since branch strategy §11.4 forbids force-pushing shared history or rebasing published commits, a non-destructive repair path was required to unblock the PR.

## Resolution
1. Created a replacement branch `gemini2/sr-dev-exact-owned-operational-fixture-cleanup-20261009-v2` from `dev`.
2. Squashed the entire history of the contaminated branch (`origin/gemini2/sr-dev-exact-owned-operational-fixture-cleanup-20261009`) into a single commit.
3. Formatted the squashed commit with correct trailers (`Task-ID: SR-DEV-EXACT-OWNED-OPERATIONAL-FIXTURE-CLEANUP-20261009`).
4. Pushed the new branch and created a replacement PR: #2474.
5. Closed the old contaminated PR: #2463.

## Review Findings (Codex2)
*   **H1 BLOCKING:** The parent task was not explicitly blocked during helper unblock application. Without `resolved_parent_status=blocked`, `resolved_parent_next` explicitly stating the replacement SHA `6b7b2f42e28ca60339fd281a5d8d44bcc9ed992e` and PR #2474, and `resolved_parent_waiting_for` routing to the required fresh Gemini2-to-Codex handoff, the status defaulted to `todo` which can silently resume the contaminated branch/closed PR.
*   **H2 EVIDENCE:** The helper artifact lacked complete forensic records for old/new SHAs, bases, PR identities, and explicit command exit codes.

## Evidence & Verification
*   **Old Contaminated Branch:** `origin/gemini2/sr-dev-exact-owned-operational-fixture-cleanup-20261009`
    *   Head SHA: `3cf4ef7a253180451d151f76e331bdd3fb1182ff`
    *   PR: #2463 (CLOSED)
    *   Command: `python3 tools/ci/git/check_commit_trailers.py --base 4a166f3ed2a7000061acc737ee475ae3c47dca56 --head 3cf4ef7a253180451d151f76e331bdd3fb1182ff` exits 1 for `f68c92cdd452`.
*   **Immutable Replacement Branch:** `gemini2/sr-dev-exact-owned-operational-fixture-cleanup-20261009-v2`
    *   Base SHA: `8ec22133a28f2fa19974ae0c0a3b3127cc5aa747`
    *   Head SHA: `6b7b2f42e28ca60339fd281a5d8d44bcc9ed992e`
    *   PR: #2474 (OPEN)
    *   Command: `python3 tools/ci/git/check_commit_trailers.py --base 8ec22133a28f2fa19974ae0c0a3b3127cc5aa747 --head 6b7b2f42e28ca60339fd281a5d8d44bcc9ed992e` exits 0 (1 commit).
*   **Helper Task Branch:** `gemini2/sr-dev-exact-owned-operational-fixture-cleanup-20261009-unblock-history-repair`
    *   Base SHA: `8ec22133a28f2fa19974ae0c0a3b3127cc5aa747`
    *   Head SHA: `87156d5787130d4963baf455714f7df1d6dd48c2`
    *   PR: #2475 (OPEN)
    *   Command: `python3 tools/ci/git/check_commit_trailers.py --base 8ec22133a28f2fa19974ae0c0a3b3127cc5aa747 --head 87156d5787130d4963baf455714f7df1d6dd48c2` exits 0 (1 commit).
*   **Sanity Checks:**
    *   `git diff --exit-code 3cf4ef7a253180451d151f76e331bdd3fb1182ff 6b7b2f42e28ca60339fd281a5d8d44bcc9ed992e` (across 4 parent files) exits 0. Scope is correctly isolated.
    *   `git rev-parse replacement^` and `helper^` both return `8ec22133a28f2fa19974ae0c0a3b3127cc5aa747`.
    *   `git ls-remote --heads` confirms all SHAs are properly tracked remotely and no force-push altered them.

## Pending Constraints & Next Steps
*   **Helper Disposition:** Supervisor must use the gateway to persist `resolved_parent_status=blocked`, `resolved_parent_next` naming the replacement SHA `6b7b2f42e28ca60339fd281a5d8d44bcc9ed992e` and PR #2474, and `resolved_parent_waiting_for` targeting a fresh Gemini2-to-Codex handoff.
*   **Routing Execution:** Supervisor coordinates the routing to the replacement branch (`gemini2/sr-dev-exact-owned-operational-fixture-cleanup-20261009-v2`). Reviewer does not implement this.
*   **Review Process:** Parent review and CI must be fresh for the replacement SHA, and all parent required acceptances must be outstanding.
