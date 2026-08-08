# S1F-REF-001 Unblock History Repair

## Scope

- Helper task: `S1F-REF-001-UNBLOCK-HISTORY-REPAIR`
- Parent task: `S1F-REF-001`
- Helper owner: `Codex`
- Helper reviewer: `Claude`
- Parent owner: `Gemini2`
- Audit date: `2026-08-08`

## Diagnosis

The parent is blocked by publication evidence, not by an implementation or
history-content defect. The reviewed implementation commit already existed in
the local repository, but only as the local branch
`gemini2/s1f-ref-001`; the original owner could not publish it because its
environment had no GitHub credentials.

- Commit `57dcb4ed9da31d2b2bb6a324d551366669481634` is the complete parent
  delivery commit. Its subject is
  `feat(S1F-REF-001): wire formal Referral booking form with BFF submit`.
- It has parent `6a43f1a9afef7a41b38c24187727801c27fb2bdb`, which was the
  then-current `origin/dev` tip, and contains the required `LLM-Agent`,
  `Task-ID`, `Reviewer`, and `Verification` trailers. Its `feat(...)` subject
  is nevertheless rejected by the repository's stricter PR-range rule.
- Before repair, `git branch -r --contains 57dcb4ed` returned no remote branch.
  Thus machine truth correctly reported a push block even though the local
  commit and review evidence were sound.
- The assigned helper worktree is independently based on `origin/dev` and was
  clean apart from ignored `node_modules` directories. It did not contain or
  alter the parent implementation diff.

There is no shared-history contamination to rewrite: the missing remote ref was
the sole broken link between the approved local commit and a reviewable GitHub
delivery rail.

## Non-Destructive Repair Performed

On 2026-08-08, the helper owner used a normal, new-reference push:

```bash
git push origin 57dcb4ed9da31d2b2bb6a324d551366669481634:refs/heads/gemini2/s1f-ref-001
```

This created `origin/gemini2/s1f-ref-001` at the exact approved commit; it did
not force-push, reset, rebase, cherry-pick, or modify any existing shared ref.
The resulting delivery PR is [#1339](https://github.com/ajoe734/drts-fleet-platform/pull/1339), targeting `dev`.

## Evidence

- `git show -s 57dcb4ed` confirms the required trailers and recorded evidence:
  TypeScript typecheck, Vitest 9/9, Next production build, and Playwright
  11/11.
- `git merge-base --is-ancestor 57dcb4ed origin/dev` returned exit code `1` at
  audit time: the commit was not yet integrated, as expected for a new PR.
- `git ls-remote --heads origin gemini2/s1f-ref-001` now returns
  `57dcb4ed9da31d2b2bb6a324d551366669481634`.
- `gh pr list --head gemini2/s1f-ref-001 --base dev --state all` was empty
  before repair; PR #1339 was then created successfully from that exact branch.

## Concrete Parent Next Step

`S1F-REF-001` is unblocked from history repair, but is still blocked by
concrete CI failures on canonical rail `origin/gemini2/s1f-ref-001 @
57dcb4ed...` / PR #1339. Do not return to the obsolete local-only state.

1. The parent owner (or a newly assigned repair owner) should create a normal
   follow-up commit on `gemini2/s1f-ref-001`; do not amend or force-push
   `57dcb4ed`.
2. The follow-up must fix the three lint failures in
   `apps/referral-embed-web/components/passenger-embed.tsx` (unused
   `liveData` parameters at lines 1643, 1833, and 1953 in the CI checkout).
3. It must also carry a valid commit subject beginning
   `S1F-REF-001:` so the PR-range `Commit trailers` check can pass. Because
   the immutable original commit's subject is invalid, a clean replacement
   branch/PR may be required if the policy validates every ancestor; that
   replacement must be created by normal push without rewriting PR #1339.
4. Have the parent reviewer validate the corrected canonical PR and its
   acceptance evidence. Only after normal PR/CI/merge evidence is available
   may the parent close with the appropriate integration status.

### CI Evidence At Repair Time

PR #1339's CI run `31259951320` established that the original commit is
published but not merge-ready:

- `Commit trailers` rejects subject
  `feat(S1F-REF-001): wire formal Referral booking form with BFF submit`; the
  required form is `<TASK-ID>: <summary>`.
- `Smoke acceptance / Lint` reports three
  `@typescript-eslint/no-unused-vars` errors for `liveData` in
  `apps/referral-embed-web/components/passenger-embed.tsx`.

## Safety Statement

No existing ref was rewritten and no force-push was used. The original approved
commit is preserved byte-for-byte and is now reachable from its owner branch
and a single reviewable PR.
