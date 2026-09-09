# SR-QA-WEBHOOK-001-UNBLOCK-HISTORY-REPAIR

## Finding (2026-09-08 UTC)

This is a history-recovery plan, not product acceptance. No UI or product files changed.
Inspected base: `e97653b7ffb962a6c4d688e8706711d860fa3604` (`origin/dev`).
The assigned helper worktree was clean on its expected branch. No parent worktree
was registered in `git worktree list --porcelain`; no current dirty-tree
contamination was observed. Canonical root was left untouched.

Parent local and remote `codex/sr-qa-webhook-001` both resolve to
`fdc6fde4471404d490858eb571b10f11666ebd55`, head of open PR
[1729](https://github.com/ajoe734/drts-fleet-platform/pull/1729).
The reconstructed task's `75138b3cbadbaf4e6508cc5c5b6513fddea5a640`
is an older Gemini-authored commit, not the latest Codex evidence or a locked candidate.
Other open parent PRs are #1720 (Claude head `6e311d8de4994f2e5261a873309238cbc9f7b9b5`)
and #1696 (Gemini head `f6a864105bfaf20b30408d26f92cbd085d6f5183`).
These are divergent deliveries, not interchangeable candidate identities.

The Codex ancestry contains original/rebased copies (`3be3d5f8d` / `a119ec0bb`,
`cdd8556cd` / `4f88c6c34`, `fdb853a08` / `cdb537345`) joined by
`57613f394f9ed79c0cb89a26965e22baf916907a`; another preservation merge
`124152022044824e7a01602731e75d7838854afb` joins `574daf39d` and `7a413094d`.
The parent's evidence records repeated add/add failures replaying `a119ec0bb`,
followed by rebase abort and non-force preservation merges, latest `55334bae5`.
Its merge base with current dev is `3b82fba0fabba3328e3443de3d602780f852d724`.
Net diff is only 13 parent-scoped files, 2573 insertions; no unrelated product
diff was found. The contamination is ancestry/candidate ambiguity, not evidence
that unrelated product edits need reverting.

The precise reproducible history gate is two invalid subjects:

- `92fa573c49ee`: `test(SR-QA-WEBHOOK-001): record cross-tenant metadata exposure blocker`
- `36272a5c45c7`: `test(SR-QA-WEBHOOK-001): record HTTP lifecycle regression evidence`

Both must use `<TASK-ID>: <summary>` under the current validator.
Appending a valid commit cannot repair these ancestor subjects. Confirmed locally
with `python3 tools/ci/git/check_commit_trailers.py --base origin/dev --head origin/codex/sr-qa-webhook-001`
(validation failure), matching [CI job](https://github.com/ajoe734/drts-fleet-platform/actions/runs/34264757717/job/102191216003).
Other PR checks also failed; fixing history alone does not imply green CI.

## Non-destructive recovery procedure

Keep all existing remote branches/PRs intact as evidence. Supervisor should route
the parent to a fresh isolated recovery branch, for example
`codex/sr-qa-webhook-001-recovery-v2`, with parent reviewer Gemini. Do not replay
the contaminated commits or force-push any published ref. Do not reuse an existing
recovery branch without checking its owner/head/worktree first.

From that fresh branch based on freshly fetched `origin/dev`:

```bash
git diff --binary 3b82fba0fabba3328e3443de3d602780f852d724 fdc6fde4471404d490858eb571b10f11666ebd55 -- docs/04-uat/system-remediation-20260906/SR-QA-WEBHOOK-001.md tests/unit/system-remediation/sr-qa-webhook-001 tests/e2e/system-remediation/sr-qa-webhook-001 > /tmp/sr-webhook-recovery.patch
git apply --check /tmp/sr-webhook-recovery.patch
git apply --index /tmp/sr-webhook-recovery.patch
git diff --cached --check
git diff --cached --stat
git commit -m "SR-QA-WEBHOOK-001: recover scoped acceptance harness and historical evidence" -m "LLM-Agent: Codex" -m "Task-ID: SR-QA-WEBHOOK-001" -m "Reviewer: Gemini"
python3 tools/ci/git/check_commit_trailers.py --base origin/dev --head HEAD
git push -u origin codex/sr-qa-webhook-001-recovery-v2
```

The diff extraction and `git apply --check` were executed against the inspected
clean dev base: exit 0. Actual parent recovery application/commit is intentionally
left for the supervisor-routed parent workspace; this helper only documents the
validated path. If dev advances and patch checking fails, reconcile only the three
parent scopes; do not overwrite new trunk content. The JSON records remain
historical evidence until rerun, not acceptance for the new SHA.

Open a replacement parent PR to dev, record its identity through candidate lifecycle
only after executable acceptance is ready, and let supervisor designate obsolete
PRs as superseded. Do not merge multiple competing parent deliveries.

## Concrete parent next step and remaining blockers

Supervisor can now dispatch the clean recovery procedure without any shared-history
rewrite. Parent remains blocked for product/acceptance reasons: the latest parent
evidence reports cross-tenant API-key metadata GET returning 200 instead of 403.
`SR-QA-WEBHOOK-001-FIX-TENANT-BINDING` is still blocked with empty write_scopes;
Supervisor/Claude must authorize minimal product/test scopes, order IAM/tenant
dependencies, and add the repair to parent dependencies before implementation.
C112 deadline decision, C111 usage, and C113–C115 external evidence also remain.
After these gates, rerun the parent Playwright command and HTTP/DB acceptance on
the new execution SHA; preserve failures and missing external evidence explicitly.
No product tests were rerun for this documentation-only helper.

Helper commit, ordinary push, PR and exact candidate SHA are recorded through
the helper handoff. Approval/CI/merge remain candidate lifecycle responsibilities.
