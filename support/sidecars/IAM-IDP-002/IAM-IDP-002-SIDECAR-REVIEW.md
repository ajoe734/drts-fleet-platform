# IAM-IDP-002 Review Packet & Evidence Summary

**Sidecar Task:** `IAM-IDP-002-SIDECAR-REVIEW`  
**Parent Task:** `IAM-IDP-002`  
**Helper Kind:** `review_packet`  
**Prepared by:** `Codex2`  
**Assigned Reviewer:** `Gemini2`  
**Generated:** `2026-08-01` (UTC)  
**Status:** `REVIEW SUPPORT ARTIFACT`

This packet is support-only. It does not modify canonical truth, runtime behavior, contracts, or governance state.

## 1. Scope Boundary

- In scope:
  - summarize current machine truth for the sidecar and parent task
  - preserve the parent review instruction that future review must inspect the current owner tip, not the stale reviewer branch
  - point the reviewer at the highest-signal files, commits, and tests
- Out of scope:
  - editing parent implementation
  - changing any L1/L2 canonical truth
  - re-scoping the parent acceptance criteria

## 2. Current Machine Truth Snapshot

### Sidecar task

`AI_NAME=Codex2 scripts/ai-status.sh show IAM-IDP-002-SIDECAR-REVIEW`

- owner=`Codex2`
- reviewer=`Gemini2`
- status moved from `backlog` to active drafting during this session
- helper_parent=`IAM-IDP-002`
- helper_kind=`review_packet`
- mutates_canonical=`false`

### Parent task

`AI_NAME=Codex2 scripts/ai-status.sh show IAM-IDP-002`

- owner=`Gemini2`
- reviewer=`Codex`
- status=`review`
- dependencies already recorded:
  - `IAM-P0-002`=`done`
  - `IAM-P0-004`=`done`
  - `IAM-ACC-001`=`done`
  - `IAM-CTR-001`=`done`
- critical supervisor note in machine truth:
  - review at `2026-08-01T23:23` was reopened because a stale `codex/iam-idp-002` reviewer branch was inspected
  - future review must inspect the current owner branch `gemini2/iam-idp-002`
  - commit `37021304` added the exact zero-binding ops-membership 403 regression
  - any later owner commit must preserve that regression

Reviewer implication: this packet should be used to review the current owner branch tip, not to restate findings from `codex/iam-idp-002`.

## 3. Owner Branch Evidence

### Current owner tip

`git for-each-ref` in this worktree shows:

- branch `gemini2/iam-idp-002`
- current visible tip `de505399b242697b2d0685918f9deba074cb2b35`
- subject: `fix(IAM-IDP-002): scope group drift and role binding resolution to requested membership`

### Why `de505399` matters

`git log --all --grep='IAM-IDP-002\\|37021304'` shows the recent chain:

- `37021304` `fix(IAM-IDP-002): scope role binding resolution to requested realm membership`
- `de505399` `fix(IAM-IDP-002): scope group drift and role binding resolution to requested membership`

This means the current review target is not only the previously-called-out `37021304` regression fix; it also includes the follow-up drift-scoping correction at `de505399`.

### Delta introduced by `de505399`

`git show --stat de505399`

- modifies `apps/api/src/modules/auth/iap-subject.adapter.ts`
- modifies `tests/unit/iap-subject-adapter.test.ts`

Behavioral intent from the patch:

- when `requestedRealm` is present, missing-group drift is now scoped to the selected membership instead of aggregating unrelated missing groups from other memberships
- this avoids false-positive drift on an `ops` request when the principal still has a separate `platform` membership with a platform-admin group mismatch
- the patch keeps the fail-closed posture intact while narrowing drift evidence to the requested membership context

## 4. High-Signal Review Surface

Review the current owner branch tip with focus on these files:

- `apps/api/src/modules/auth/iap-subject.adapter.ts`
- `tests/unit/iap-subject-adapter.test.ts`
- `tests/integration/iap-subject-adapter.integration.test.ts`
- `packages/control-plane-auth/src/index.ts`
- `apps/api/src/common/auth/bootstrap-auth.guard.ts`
- `apps/api/src/modules/auth/auth.controller.ts`

Why these matter:

- `iap-subject.adapter.ts` contains the durable subject -> membership resolution, role binding filtering, requested-realm selection, and drift emission logic
- unit tests cover spoofed headers, wrong audience, inactive users, least-privilege downgrade, zero-binding denial, and the new requested-realm drift-scoping regression
- integration tests cover `/auth/token`, `BootstrapAuthGuard`, strict IAP mode, group drift downgrade, and the exact "requested ops surface but no durable ops membership" negative path

## 5. Evidence Summary Against Parent Acceptance

Parent acceptance requires:

1. verified IAP subject resolves durable membership
2. spoofed email and role headers are ignored
3. wrong audience and inactive workforce users fail
4. group drift applies least privilege and alerts
5. IAP integration negative tests pass

Current evidence anchors on the owner branch:

- durable resolution:
  - `tests/unit/iap-subject-adapter.test.ts`
    - `resolves a verified IAP subject to durable membership`
    - `deterministically selects active platform/ops control-plane membership for multi-membership principal`
- spoofed headers ignored:
  - `tests/unit/iap-subject-adapter.test.ts`
    - `ignores spoofed email and role headers without valid assertion token`
  - `tests/integration/iap-subject-adapter.integration.test.ts`
    - `verifies negative matrix: missing assertion with spoofed role headers fails`
    - `verifies AuthController /auth/token uses IAPSubjectAdapter runtime resolution and ignores spoofed headers`
- wrong audience / inactive users denied:
  - `tests/unit/iap-subject-adapter.test.ts`
    - `fails closed when IAP assertion audience is wrong`
    - `fails closed when workforce user or membership is inactive/suspended/disabled`
  - `tests/integration/iap-subject-adapter.integration.test.ts`
    - `verifies negative matrix: wrong audience fails closed with 403 IAP_AUDIENCE_MISMATCH`
    - `verifies negative matrix: inactive workforce user fails closed with 403 IAP_WORKFORCE_USER_INACTIVE`
- least-privilege drift behavior:
  - `tests/unit/iap-subject-adapter.test.ts`
    - `detects group drift, applies least privilege downgrade, and emits alert event`
    - `switches membership realm from platform to ops when assertion loses platform-admins group`
    - `resolves requested ops membership for principal with platform superadmin binding without falsely triggering group drift for missing platform admin group`
  - `tests/integration/iap-subject-adapter.integration.test.ts`
    - `verifies group drift: missing admin group downgrades role and logs security alert`
    - `verifies BootstrapAuthGuard denies platform-only route access when group drift downgrades identity to ops realm`
- exact stale-review regression to preserve:
  - `tests/unit/iap-subject-adapter.test.ts`
    - `fails closed with 403 when principal has platform superadmin binding plus ops membership with zero role bindings and requests ops realm`
  - `tests/integration/iap-subject-adapter.integration.test.ts`
    - `verifies BootstrapAuthGuard fails closed with 403 when ops surface is requested but user has no durable ops membership`

## 6. Reviewer Focus

The most important question for this review is narrow:

- does the current owner tip `de505399` preserve the zero-binding requested-ops 403 regression from `37021304` while preventing false drift events for unrelated memberships?

Suggested reviewer checks:

1. review `de505399` relative to `37021304` and confirm the drift change is scoped only to `requestedRealm`
2. confirm the new unit test at `tests/unit/iap-subject-adapter.test.ts` covers the intended non-drift case for an `ops` request with a separate platform binding
3. confirm the existing zero-binding requested-ops denial tests are still present and still describe the fail-closed behavior
4. run the targeted unit and integration suites on `gemini2/iam-idp-002`, not on `codex/iam-idp-002`

Suggested verification commands:

```bash
git switch gemini2/iam-idp-002
pnpm vitest run tests/unit/iap-subject-adapter.test.ts tests/unit/control-plane-auth.test.ts tests/integration/iap-subject-adapter.integration.test.ts
```

If the reviewer wants the exact follow-up diff only:

```bash
git show --stat --unified=40 de505399
```

## 7. Review Outcome Framing

Approve the sidecar if:

- the packet accurately points review to `gemini2/iam-idp-002`
- the stale-branch warning from machine truth is preserved
- the evidence summary stays support-only
- the requested-realm regression focus is clear enough for audit and review handoff

Reopen the sidecar if:

- the packet points at the wrong branch or stale commit chain
- the regression emphasis around `37021304` and `de505399` is missing or inaccurate
- the packet claims verification that is not actually evidenced

## 8. Reviewer Handoff Command

Approve:

```bash
AI_NAME=Codex2 scripts/ai-status.sh approve IAM-IDP-002-SIDECAR-REVIEW "Review packet recorded for IAM-IDP-002. The packet preserves the machine-truth warning that review must inspect gemini2/iam-idp-002 instead of the stale codex/iam-idp-002 branch, anchors the current owner tip at de505399, and identifies the zero-binding requested-ops regression plus the follow-up requested-realm drift-scoping fix as the primary review targets."
```

Reopen if needed:

```bash
AI_NAME=Codex2 scripts/ai-status.sh reopen IAM-IDP-002-SIDECAR-REVIEW "packet needs revision: [specify stale branch reference, evidence gap, or support-scope issue]"
```
