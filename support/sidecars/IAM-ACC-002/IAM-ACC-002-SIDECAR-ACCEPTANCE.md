# IAM-ACC-002 Sidecar Acceptance Packet

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `IAM-ACC-002` - Replace in-memory platform users with durable audited administration
**Parent Owner:** `Codex`
**Parent Reviewer:** `Gemini`
**Sidecar Owner:** `Codex`
**Sidecar Reviewer:** `Gemini`
**Generated:** `2026-08-03` (UTC)
**Snapshot anchor (parent `last_update`):** `2026-08-03T06:38:15Z`
**Status:** `REVIEW APPROVED SUPPORT ARTIFACT` - support-only; no canonical truth, runtime, or contract files modified.

This packet is a reviewer-facing companion to `IAM-ACC-002`. It snapshots the
sidecar task in `review_approved`, records the parent task's approved review
anchor, maps the four declared dependencies, and turns the parent acceptance
list into a concrete review checklist against the unmerged implementation
commit `45abc7b295d7d58f9a1e67a7ed8576b2bd0efcfe` on branch
`codex/iam-acc-002`.

Current lifecycle truth remains authoritative in `ai-status.json` and
`ai-activity-log.jsonl`. This packet is a convenience snapshot only.

---

## 1. Scope Boundary

In scope:

- summarize machine-truth status for `IAM-ACC-002-SIDECAR-ACCEPTANCE`
- map `IAM-ACC-002` to its declared dependencies:
  `IAM-ACC-001`, `IAM-IDP-002`, `IAM-SES-002`, `IAM-AUD-001`
- pin the parent review commit, changed surface, and recorded verification
- provide a reviewer checklist keyed to the parent acceptance criteria
- flag integration state: parent implementation is on branch `codex/iam-acc-002`
  and is not merged into `origin/dev` as of this packet

Out of scope:

- editing canonical implementation, product truth, or status records beyond the
  required sidecar lifecycle updates
- re-running the parent verification suite from this sidecar task
- changing the parent task's owner/reviewer contract or absorbing the parent
  implementation into `dev`

## 2. Machine-Truth Anchors

### 2.1 Sidecar task

- id=`IAM-ACC-002-SIDECAR-ACCEPTANCE`
- owner=`Codex`
- reviewer=`Gemini`
- status=`review_approved`
- helper_parent=`IAM-ACC-002`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- artifact=`support/sidecars/IAM-ACC-002/IAM-ACC-002-SIDECAR-ACCEPTANCE.md`

### 2.2 Parent task snapshot

- id=`IAM-ACC-002`
- status=`review`
- owner=`Codex`
- reviewer=`Gemini`
- priority=`P1`
- wave=`D`
- last_update=`2026-08-03T06:38:15Z`
- acceptance:
  - `Platform users survive restart`
  - `Every mutation has actor reason and before-after`
  - `Drift reconciliation is least-privilege`
  - `Status and role changes revoke sessions`
  - `CRUD isolation and migration tests pass`
- reviewer note snapshot:
  - durable platform admin CRUD, session revocation, and least-privilege IAP
    reconciliation were re-verified
  - recorded verification rerun passed with `46` tests

### 2.3 Parent implementation anchor

- branch=`codex/iam-acc-002`
- commit=`45abc7b295d7d58f9a1e67a7ed8576b2bd0efcfe`
- subject=`IAM-ACC-002: finalize approved durable platform admin persistence`
- branch containment check: commit is contained by local branch
  `codex/iam-acc-002`
- merge state: `git diff --name-only origin/dev...45abc7b` shows parent changes
  are not yet on `origin/dev`

Recorded verification on the parent commit:

```text
pnpm install --offline --frozen-lockfile
pnpm --filter @drts/contracts build
pnpm --filter @drts/control-plane-auth build
pnpm exec vitest run tests/unit/platform-admin.test.ts tests/unit/iap-subject-adapter.test.ts tests/integration/iap-subject-adapter.integration.test.ts --no-file-parallelism --maxConcurrency=1 --reporter=dot
```

Recorded result: `46 passed`

## 3. Dependency Map

| Dependency | Status | Commit / Integration anchor | Why IAM-ACC-002 needs it |
| --- | --- | --- | --- |
| `IAM-ACC-001` | `done` | `c1f02ae570e6` on `origin/dev` | Publishes durable principal, membership, invitation, and account-state persistence. `IAM-ACC-002` cannot replace in-memory platform users without this canonical identity substrate. |
| `IAM-IDP-002` | `done` | `d0d4cbd91d85` on `origin/dev` | Publishes verified IAP subject resolution and durable workforce membership mapping. `IAM-ACC-002` relies on that mapping for least-privilege workforce reconciliation and for rejecting spoofed header authority. |
| `IAM-SES-002` | `done` | `276a499d5940` merged to `origin/dev`; PR `#1277` | Publishes revocable session claims and request-time revocation enforcement. `IAM-ACC-002` depends on this to make status or role changes invalidate old access within the stated 60-second window. |
| `IAM-AUD-001` | `done` | `8713c34cde8b` on `origin/dev` | Publishes append-only masked security events and fail-closed audit persistence. `IAM-ACC-002` needs this to record actor-aware reasoned before/after evidence for privileged administration mutations. |

Dependency assessment:

- all four declared dependencies are `done`
- no upstream blocker remains in machine truth
- the parent task is waiting on review/closeout discipline, not missing
  dependencies

## 4. Parent Change Surface

Files changed between `origin/dev` and parent commit `45abc7b`:

- `apps/api/src/modules/auth/iap-subject.adapter.ts`
- `apps/api/src/modules/identity/identity.repository.ts`
- `apps/api/src/modules/platform-admin/platform-admin.controller.ts`
- `apps/api/src/modules/platform-admin/platform-admin.module.ts`
- `apps/api/src/modules/platform-admin/platform-admin.service.ts`
- `apps/platform-admin-web/app/users/page.tsx`
- `apps/platform-admin-web/tsconfig.json`
- `packages/contracts/src/index.ts`
- `tests/unit/platform-admin.test.ts`

Reviewer focus from that surface:

- `platform-admin.service.ts`: durable admin state bootstrap, persistence load,
  audited mutation flow, and identity-backed admin-user handling
- `platform-admin.controller.ts`: verified actor propagation into privileged
  publish/delete/mutation endpoints
- `iap-subject.adapter.ts` plus `identity.repository.ts`: least-privilege
  workforce membership reconciliation path consumed by control-plane users
- `packages/contracts/src/index.ts`: contract changes required by the durable
  admin/user state
- `tests/unit/platform-admin.test.ts` and
  `tests/integration/iap-subject-adapter.integration.test.ts`: regression
  coverage for actor binding, denial paths, and drift downgrades

## 5. Acceptance Checklist for Reviewer

| Parent acceptance criterion | Evidence to inspect | Review expectation |
| --- | --- | --- |
| `Platform users survive restart` | `platform-admin.service.ts` persistence bootstrap and repository load path; parent reviewer note already says durable CRUD was re-verified | Confirm platform-admin state no longer depends on process-local seed-only behavior for the governed admin-user surface. |
| `Every mutation has actor reason and before-after` | `platform-admin.controller.ts`, `platform-admin.service.ts`, `IAM-AUD-001` dependency, and `tests/unit/platform-admin.test.ts` | Confirm privileged mutations use verified actor identity rather than request-body spoofing and emit auditable before/after context with reason strings. |
| `Drift reconciliation is least-privilege` | `iap-subject.adapter.ts`, `identity.repository.ts`, and `tests/integration/iap-subject-adapter.integration.test.ts` | Confirm missing or downgraded trusted groups reduce authority instead of unioning grants, and spoofed role/email headers remain ignored. |
| `Status and role changes revoke sessions` | dependency `IAM-SES-002` is `done`; parent review note explicitly cites session revocation verification | Confirm parent code paths invoke the canonical session-claim/revocation substrate rather than a parallel local invalidation model. |
| `CRUD isolation and migration tests pass` | parent verification trailer plus targeted test files | Confirm the recorded verification is sufficient for the changed surface and no unverified migration-sensitive path remains in the diff. |

## 6. Reviewer Questions to Close

1. Does `45abc7b` contain all parent-owned files needed for durable platform
   admin persistence, or is any required migration/runtime change missing from
   the unmerged branch?
2. Do the actor-propagation tests prove the service trusts verified identity
   over request-body fields for privileged actions?
3. Does the IAP reconciliation path clearly preserve least privilege under
   group drift, inactive users, and spoofed-header attempts?
4. Is the parent ready for owner closeout after approval, or does reviewer want
   one more targeted rerun before `review_approved`?

## 7. Handoff Summary

This sidecar created the requested support artifact only. No canonical truth or
runtime files were edited in this task. The dependency chain for `IAM-ACC-002`
is satisfied, the parent implementation is anchored at `45abc7b`, and this
packet is ready for owner closeout on branch
`codex/iam-acc-002-sidecar-acceptance` with integration status
`branch_pushed`.
