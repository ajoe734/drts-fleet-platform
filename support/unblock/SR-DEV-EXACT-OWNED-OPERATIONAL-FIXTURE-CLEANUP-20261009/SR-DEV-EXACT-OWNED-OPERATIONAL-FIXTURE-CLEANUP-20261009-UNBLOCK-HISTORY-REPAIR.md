# History Repair for SR-DEV-EXACT-OWNED-OPERATIONAL-FIXTURE-CLEANUP-20261009

## Issue
The parent task `SR-DEV-EXACT-OWNED-OPERATIONAL-FIXTURE-CLEANUP-20261009` was blocked because the canonical commit `f68c92cdd4525316a2fcb9e4a041413e668b3fa2` ("fix(ops): resolve R8 round findings") lacked the mandatory `<TASK-ID>: ` prefix in its subject, causing the official commit trailer check (`.github/workflows/ci.yml`) to fail. Since branch strategy §11.4 forbids force-pushing shared history or rebasing published commits, a non-destructive repair path was required to unblock the PR.

Subsequently, the previous helper task branch (`origin/gemini2/sr-dev-exact-owned-operational-fixture-cleanup-20261009-unblock-history-repair`) was also contaminated with a non-compliant commit message lacking the task ID.

## Resolution
1. Created a clean replacement branch `gemini2/sr-dev-exact-owned-operational-fixture-cleanup-20261009-v2` from immutable base `8ec22133a28f2fa19974ae0c0a3b3127cc5aa747` for the parent task.
2. Squashed the entire history of the parent contaminated branch into a single commit and formatted it with correct trailers (`Task-ID: SR-DEV-EXACT-OWNED-OPERATIONAL-FIXTURE-CLEANUP-20261009`).
3. Pushed the new parent branch and created a replacement PR: #2474. Old PR #2463 is CLOSED.
4. Created a clean replacement branch `gemini2/sr-dev-exact-owned-operational-fixture-cleanup-20261009-unblock-history-repair-v3` from immutable base `8ec22133a28f2fa19974ae0c0a3b3127cc5aa747` for this helper task to recover the repaired artifact, formatted with correct trailers.
5. Supervisor must persist helper disposition and parent routing metadata using the `TASK_METADATA_JSON` gateway.

## Evidence & Verification

### Historical Checks (Contaminated Parent)
*   **Branch:** `origin/gemini2/sr-dev-exact-owned-operational-fixture-cleanup-20261009`
*   **Head SHA:** `3cf4ef7a253180451d151f76e331bdd3fb1182ff` (PR #2463 CLOSED)
*   **Offending SHA:** `f68c92cdd4525316a2fcb9e4a041413e668b3fa2`
*   **Checker result:** `python3 tools/ci/git/check_commit_trailers.py --base 4a166f3ed2a7000061acc737ee475ae3c47dca56 --head 3cf4ef7a253180451d151f76e331bdd3fb1182ff` exits 1.

### New Verification (Replacement Parent)
*   **Branch:** `gemini2/sr-dev-exact-owned-operational-fixture-cleanup-20261009-v2`
*   **Base SHA:** `8ec22133a28f2fa19974ae0c0a3b3127cc5aa747`
*   **Head SHA:** `6b7b2f42e28ca60339fd281a5d8d44bcc9ed992e` (PR #2474 OPEN)
*   **Checker result:** `python3 tools/ci/git/check_commit_trailers.py --base 8ec22133a28f2fa19974ae0c0a3b3127cc5aa747 --head 6b7b2f42e28ca60339fd281a5d8d44bcc9ed992e` exits 0 (1 commit).
*   **Scope Isolation:** `git diff --exit-code 3cf4ef7a253180451d151f76e331bdd3fb1182ff 6b7b2f42e28ca60339fd281a5d8d44bcc9ed992e -- .github/workflows/dev-owned-operational-fixture-cleanup.yml operations/verification/cleanup-owned-operational-fixtures.py tests/unit/gcp-artifact-activation-20261004/test_owned_operational_fixture_cleanup.py docs/04-uat/dev-owned-operational-fixture-cleanup-20261009.md` exits 0.

### Historical Checks (Contaminated Helper Candidates)
*   **Generation `87156d5787130d4963baf455714f7df1d6dd48c2`:** Lacked parent disposition metadata.
*   **Generation `b652ec34de7c69b0971b69928a7ab87eb8e95676`:** Failed trailer checks. `python3 tools/ci/git/check_commit_trailers.py --base 8ec22133a28f2fa19974ae0c0a3b3127cc5aa747 --head b652ec34de7c69b0971b69928a7ab87eb8e95676` exits 1.
*   **Generation `3552c75f6b57b50f3efbe49ee565aba26a344d4d`:** Did not persist `resolved_parent_status` disposition via Supervisor metadata.

### Acceptance Mappings
1.  **Identify exact contamination:** Done. `f68c92cdd4525316a2fcb9e4a041413e668b3fa2` lacks trailer prefix. Checked via official CI script.
2.  **Repair without force-push:** Done. Squashed and recreated as `gemini2/sr-dev-exact-owned-operational-fixture-cleanup-20261009-v2` (`6b7b2f42e28ca60339fd281a5d8d44bcc9ed992e`). No force-pushes used.
3.  **Produce evidence:** Done. Parent PR #2474 OPEN, Helper PR will be opened via matching remote/PR metadata in handoff.
4.  **Update parent task:** Pending Supervisor `TASK_METADATA_JSON` gateway commands below.

## Reviewer Codex2 Findings Ledger (2026-10-09)
*   **H1 BLOCKING:** Repeated unresolved parent merge disposition/routing. Parent remains `blocked`/`waiting_for` Codex with old metadata. Both live CLI show slices confirm helper `resolved_parent_status`/`next`/`waiting_for` are absent. The documented Supervisor routing must execute to persist `blocked`/`Gemini2` and avoid defaulting to `todo`.
*   **H4 HIGH:** Documented repair command mixed candidate identities. The payload injected `candidate` rather than `candidate_sha` and manually rewrites PR URLs, which bypasses the lifecycle gateway and leaves `candidate_sha` and generation ID stale.
*   **H3 FIXED:** v3 helper has exactly one task-scoped commit. Required task-ID subject and trailers pass official checker.
*   **Acceptance Disposition:** 1 contamination identified PASS; 2 non-destructive history repair/content preservation PASS; 3 helper task commit/published branch/OPEN PR identity PASS; 4 canonical safe parent routing/disposition FAIL (Pending Supervisor routing).

## Pending Constraints & Next Steps (Supervisor Action Required)

The original owner cannot impersonate the Supervisor. The Supervisor must execute the following `assign` commands with `TASK_METADATA_JSON` payloads to persist the exact routing disposition:

**1. Persist helper disposition (so parent defaults to blocked, not todo, upon merge):**
```bash
TASK_METADATA_JSON='{"resolved_parent_status": "blocked", "resolved_parent_next": "6b7b2f42e28ca60339fd281a5d8d44bcc9ed992e / https://github.com/ajoe734/drts-fleet-platform/pull/2474", "resolved_parent_waiting_for": "Gemini2"}' \
AI_NAME=Supervisor /home/lupin/workspace/drts-fleet-platform/.artifacts/releases/orchestrator-0fb44e9576d3/tools/development-orchestrator/bin/ai-status.sh assign SR-DEV-EXACT-OWNED-OPERATIONAL-FIXTURE-CLEANUP-20261009-UNBLOCK-HISTORY-REPAIR Gemini2 Codex2 "Repair history artifact"
```

**2. Coordinate parent execution branch:**
```bash
TASK_METADATA_JSON='{"execution_branch": "gemini2/sr-dev-exact-owned-operational-fixture-cleanup-20261009-v2", "status": "blocked", "waiting_for": "Gemini2"}' \
AI_NAME=Supervisor /home/lupin/workspace/drts-fleet-platform/.artifacts/releases/orchestrator-0fb44e9576d3/tools/development-orchestrator/bin/ai-status.sh assign SR-DEV-EXACT-OWNED-OPERATIONAL-FIXTURE-CLEANUP-20261009 Gemini2 Codex "Cleanup owned operational fixtures"
```

**3. Parent Handoff (Original Owner Action):**
After Supervisor metadata update, Gemini2 must perform a fresh handoff to clear stale evidence and create a new generation:
```bash
CANDIDATE_SHA="6b7b2f42e28ca60339fd281a5d8d44bcc9ed992e" CANDIDATE_BRANCH="gemini2/sr-dev-exact-owned-operational-fixture-cleanup-20261009-v2" PR_URL="https://github.com/ajoe734/drts-fleet-platform/pull/2474" \
AI_NAME=Gemini2 /home/lupin/workspace/drts-fleet-platform/.artifacts/releases/orchestrator-0fb44e9576d3/tools/development-orchestrator/bin/ai-status.sh handoff SR-DEV-EXACT-OWNED-OPERATIONAL-FIXTURE-CLEANUP-20261009 Codex
```

**4. Show regression (Sanity verification):**
```bash
AI_NAME=Supervisor /home/lupin/workspace/drts-fleet-platform/.artifacts/releases/orchestrator-0fb44e9576d3/tools/development-orchestrator/bin/ai-status.sh show SR-DEV-EXACT-OWNED-OPERATIONAL-FIXTURE-CLEANUP-20261009-UNBLOCK-HISTORY-REPAIR
AI_NAME=Supervisor /home/lupin/workspace/drts-fleet-platform/.artifacts/releases/orchestrator-0fb44e9576d3/tools/development-orchestrator/bin/ai-status.sh show SR-DEV-EXACT-OWNED-OPERATIONAL-FIXTURE-CLEANUP-20261009
```
*Verify that `resolved_parent_status` is `blocked`, the parent execution branch is `gemini2/sr-dev-exact-owned-operational-fixture-cleanup-20261009-v2`, AND `candidate_sha` is `6b7b2f42e28ca60339fd281a5d8d44bcc9ed992e` with a fresh generation ID.*
