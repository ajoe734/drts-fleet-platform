# Unblock Path: AUDIT-DEPENDENCY-GATES-20261002

## Contamination Identification
The parent task `AUDIT-DEPENDENCY-GATES-20261002` was blocked because the owner (Gemini) observed a CI failure on commit `ac03f8e3cf97` in the original branch `gemini/audit-dependency-gates-20261002`. This commit has an invalid subject `fix(security): strictly validate pnpm audit report schema and findings` that fails the commit trailer check.

However, the owner had *already* created and pushed a compliant successor branch (`gemini/audit-dependency-gates-20261002-v2`) in a previous handoff, and opened a new PR (#2287) that passed the commit trailer check. The contamination occurred when the owner woke up for the next review (Round 8), automatically checked out the *original* branch (`gemini/audit-dependency-gates-20261002`), pushed new commits to it, and evaluated the CI status of that original branch instead of the active `v2` branch. The latest (Ninth) review of the bad branch at `4e04fd073212194139edee4154e4db3f54342552` notes missing missing-critical/negative counter chronology and incorrect verification.

## Repair Path
We do not need to force-push or amend published history on the old branch. The repair path is to explicitly instruct the parent task owner to resume work on the `v2` branch where the commit trailer issue has already been resolved (`2022f28e225c37ff197c3b36140e1385e5ef5056`). The owner must also port the valid documentation fixes from the 9th review back to the `v2` branch.

1. **Close the old PR**: PR #2279 (associated with the old branch) is already CLOSED. PR #2287 remains OPEN for `v2`.
2. **Resume on `v2` branch**: The owner must explicitly checkout the `gemini/audit-dependency-gates-20261002-v2` branch using a worktree to handle the existing branch cleanly:
   ```bash
   git fetch origin
   git worktree add ../gemini-audit-dependency-gates-20261002-v2 origin/gemini/audit-dependency-gates-20261002-v2
   cd ../gemini-audit-dependency-gates-20261002-v2
   ```
   If the branch already exists locally, use `git switch gemini/audit-dependency-gates-20261002-v2`. Verify the exact v2 SHA is `2022f28e225c37ff197c3b36140e1385e5ef5056`.
3. **Port documentation fixes**: Apply the valid R9 corrections onto the `v2` branch (empty/missing-critical/negative counter chronology, distinct numeric outcomes, accurate current/prior SHA and CI provenance, and 61/7 probe provenance). Verify full-range commit-policy with:
   `PYTHONDONTWRITEBYTECODE=1 python3 tools/ci/git/check_commit_trailers.py --base 2b4b6b96aed1c41ae4b252681e0466ee808cbd0e --head HEAD`
4. **Handoff**: The owner must handoff using the explicit candidate branch and PR URL for the `v2` branch (`PR_URL=https://github.com/ajoe734/drts-fleet-platform/pull/2287`).

## Concrete Unblocked Next Step
The parent task `AUDIT-DEPENDENCY-GATES-20261002` has been unblocked. Gemini must:
1. `git fetch origin`
2. `git switch gemini/audit-dependency-gates-20261002-v2` or use `git worktree add` if not already checked out.
3. Verify HEAD is `2022f28e225c37ff197c3b36140e1385e5ef5056` or its successor.
4. Diff between `2022f28e225c37ff197c3b36140e1385e5ef5056` and `4e04fd073212194139edee4154e4db3f54342552` to extract the good R9 doc fixes from `docs/04-uat/audit-dependency-gates-20261002.md` and apply them, retaining the passing gate implementation on `v2`.
5. Commit, push, and handoff to Codex with `CANDIDATE_BRANCH=gemini/audit-dependency-gates-20261002-v2` and `PR_URL=https://github.com/ajoe734/drts-fleet-platform/pull/2287`.
