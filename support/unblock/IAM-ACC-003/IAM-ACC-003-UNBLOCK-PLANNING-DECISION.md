# IAM-ACC-003 Unblock Planning Decision

## Scope

- Helper task: `IAM-ACC-003-UNBLOCK-PLANNING-DECISION`
- Parent task: `IAM-ACC-003`
- Owner: `Codex`
- Reviewer: `Gemini2`
- Decision date: `2026-08-11`

## Diagnosis

The generated `planning_decision` label describes a machine-truth
reconciliation gap, not an unresolved product or wire-contract choice.

The parent task's `next` field correctly identifies the current PR #1375 head
as `3912ff31084b`, while its legacy `commit_hash` and `push_commit` still name
`2a9a5c5c1bda`.  Those identifiers belong to an earlier delivery rail and must
not decide review or closeout of the current PR.  `3912ff31084b` is the head of
`origin/codex/iam-acc-003-secure-reintegration`; it has the required
`LLM-Agent`, `Task-ID`, and `Reviewer` trailers and is not yet merged into
`origin/dev`.

The product scope is already unambiguous.  The Stage 1.5 hardening plan §9
defines the human account state machine, invitation metadata and negative
cases, and §8.4 establishes self-escalation and last-admin invariants.  Its
§§12.2--12.3 specify the account/invitation endpoint families and stable
non-enumerating errors.  The execution packet §5.3 assigns that exact scope to
`IAM-ACC-003`.  No additional product-owner decision or contract variant is
required.

## Binding Decision

1. The canonical parent delivery rail is PR #1375 on
   `codex/iam-acc-003-secure-reintegration` at
   `3912ff31084b7966549e09d84e9752e2cd26b915`.
2. The stale machine-truth commit evidence
   `2a9a5c5c1bda8e3a226ca24c0ac7f872915254b0` is historical audit evidence,
   not the current review or integration candidate.
3. `IAM-ACC-003` remains bound to the accepted scope: hash-only, single-use,
   expiring invitation proof; invited-not-active login denial; tenant-bound
   membership; self-escalation and last-admin protection; audited account
   transitions; and session/credential revocation during offboarding.
4. The only remaining parent gate is ordinary PR #1375 CI/review/integration.
   It is not blocked on product semantics or an unchosen account contract.

## Scope Cut

This helper does not:

1. Change `docs/02-architecture/` or the canonical account/identity wire
   contracts, because the authoritative plan already resolves the scope.
2. Implement or alter invitation, membership, session, or account runtime
   behavior.
3. Rewrite remote history or amend the already replaced bad merge commit.
4. Claim that PR #1375 is merged, CI-approved, or deployed.

## Parent Unblocked Next Step

Update the parent to use this concrete path:

1. Treat `3912ff31084b` on PR #1375 as the sole current delivery candidate;
   do not use `2a9a5c5` to decide review or closeout.
2. Gemini2 reviews the current PR head against the already accepted lifecycle
   and negative-path scope.
3. Await the pending CI checks.  If they pass, reconcile machine truth to the
   reviewed PR-head evidence and continue the normal review-approved closeout
   path; if they fail, repair only the reported implementation/check failure on
   the reintegration rail.
4. Keep the integration status at `ci_pending` until CI evidence changes; do
   not mark the parent done or deployed from this support decision.

## Verification Basis

- `AI_NAME=Codex scripts/ai-status.sh show IAM-ACC-003`
- `git ls-remote origin refs/heads/codex/iam-acc-003-secure-reintegration`
- `git show --no-patch 3912ff31084b`
- `git merge-base --is-ancestor 3912ff31084b origin/dev` (non-zero: not merged)
- `docs/02-architecture/stage1-5-identity-access-account-security-hardening-plan-20260801.md`
  §§8.4, 9, and 12.2--12.3
- `docs/03-runbooks/stage1-5-identity-access-account-security-execution-tasks-20260801.md`
  §5.3
- `phase1_service_contracts_v1.md` §3.1, Stage 1.5 IAM Contract Supplement
