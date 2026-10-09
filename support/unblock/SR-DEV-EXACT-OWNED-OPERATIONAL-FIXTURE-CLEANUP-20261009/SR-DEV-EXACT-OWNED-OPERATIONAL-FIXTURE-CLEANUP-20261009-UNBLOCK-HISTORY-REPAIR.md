# History Repair for SR-DEV-EXACT-OWNED-OPERATIONAL-FIXTURE-CLEANUP-20261009

## Issue
The parent task `SR-DEV-EXACT-OWNED-OPERATIONAL-FIXTURE-CLEANUP-20261009` was blocked because commit `f68c92cdd452` ("fix(ops): resolve R8 round findings") lacked the mandatory `<TASK-ID>: ` prefix in its commit trailer check via `.github/workflows/ci.yml`. Since branch strategy §11.4 forbids force-pushing shared history or rebasing published commits, a non-destructive repair path was required to unblock the PR.

Subsequently, the helper task branch itself (`gemini2/sr-dev-exact-owned-operational-fixture-cleanup-20261009-unblock-history-repair`) also became contaminated with a non-compliant commit message (`b652ec34de7c`, "docs(unblock): repair history artifact per guide 0.7"). Therefore, both the parent task and the helper task required history replacement branches.

## Resolution
1. Created a replacement branch `gemini2/sr-dev-exact-owned-operational-fixture-cleanup-20261009-v2` from `dev` for the parent task.
2. Squashed the entire history of the parent contaminated branch (`origin/gemini2/sr-dev-exact-owned-operational-fixture-cleanup-20261009`) into a single commit.
3. Formatted the squashed parent commit with correct trailers (`Task-ID: SR-DEV-EXACT-OWNED-OPERATIONAL-FIXTURE-CLEANUP-20261009`).
4. Pushed the new parent branch and created a replacement PR: #2474.
5. Created a replacement branch `gemini2/sr-dev-exact-owned-operational-fixture-cleanup-20261009-unblock-history-repair-v2` from `dev` for this helper task, recovering the repaired artifact.
6. Pushed the new helper branch to create a clean PR.

## Evidence & Verification
*   **Old Contaminated Parent Branch:** `origin/gemini2/sr-dev-exact-owned-operational-fixture-cleanup-20261009`
    *   Head SHA: `3cf4ef7a253180451d151f76e331bdd3fb1182ff`
    *   PR: #2463 (CLOSED)
    *   Command: `python3 tools/ci/git/check_commit_trailers.py --base 4a166f3ed2a7000061acc737ee475ae3c47dca56 --head 3cf4ef7a253180451d151f76e331bdd3fb1182ff` exits 1 for `f68c92cdd452`.
*   **Immutable Replacement Parent Branch:** `gemini2/sr-dev-exact-owned-operational-fixture-cleanup-20261009-v2`
    *   Base SHA: `8ec22133a28f2fa19974ae0c0a3b3127cc5aa747`
    *   Head SHA: `6b7b2f42e28ca60339fd281a5d8d44bcc9ed992e`
    *   PR: #2474 (OPEN)
    *   Command: `python3 tools/ci/git/check_commit_trailers.py --base 8ec22133a28f2fa19974ae0c0a3b3127cc5aa747 --head 6b7b2f42e28ca60339fd281a5d8d44bcc9ed992e` exits 0 (1 commit).
*   **Old Contaminated Helper Branch:** `origin/gemini2/sr-dev-exact-owned-operational-fixture-cleanup-20261009-unblock-history-repair`
    *   Head SHA: `b652ec34de7c69b0971b69928a7ab87eb8e95676`
    *   PR: #2475 (OPEN)
    *   Command: `python3 tools/ci/git/check_commit_trailers.py --base 8ec22133a28f2fa19974ae0c0a3b3127cc5aa747 --head b652ec34de7c69b0971b69928a7ab87eb8e95676` exits 1 for `b652ec34de7c`.
*   **Immutable Replacement Helper Branch:** `gemini2/sr-dev-exact-owned-operational-fixture-cleanup-20261009-unblock-history-repair-v2`
    *   Base SHA: `8ec22133a28f2fa19974ae0c0a3b3127cc5aa747`

## Pending Constraints & Next Steps
*   **Helper Disposition:** Supervisor must use the gateway to persist `resolved_parent_status=blocked`, `resolved_parent_next` naming the replacement SHA `6b7b2f42e28ca60339fd281a5d8d44bcc9ed992e` and PR #2474, and `resolved_parent_waiting_for` targeting a fresh Gemini2-to-Codex handoff.
*   **Routing Execution:** Supervisor coordinates the routing to the replacement branch (`gemini2/sr-dev-exact-owned-operational-fixture-cleanup-20261009-v2`). Reviewer does not implement this.
*   **Review Process:** Parent review and CI must be fresh for the replacement SHA, and all parent required acceptances must be outstanding.
