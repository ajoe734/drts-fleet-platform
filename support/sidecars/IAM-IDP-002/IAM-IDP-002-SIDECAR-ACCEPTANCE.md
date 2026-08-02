# IAM-IDP-002 Acceptance Packet

Task: **Resolve verified IAP workforce subjects to platform and ops memberships**  
Parent task: `IAM-IDP-002`  
Sidecar ID: `IAM-IDP-002-SIDECAR-ACCEPTANCE`  
Prepared by: `Codex`  
Reviewer: `Codex2`  
Date: `2026-08-02`

---

## 1. Snapshot

- Machine-truth status captured on `2026-08-02`: parent task `IAM-IDP-002` is `review`.
- Parent implementation under review: `origin/codex2/iam-idp-002` at `8f44cbc1bd23b8e16a2bb00e53422f2a53b310f1`.
- Parent PR: `#1253`.
- This packet is a support artifact only. It does not modify canonical truth, contracts, or runtime code.

---

## 2. Dependency Map

| Dependency | Machine status | Branch/dev ancestry on `2026-08-02` | Impact on `IAM-IDP-002` | Assessment |
| --- | --- | --- | --- | --- |
| `IAM-P0-002` | `done` | `origin/gemini/iam-p0-002` is **not** an ancestor of `origin/dev` and **not** an ancestor of `origin/codex2/iam-idp-002` | `IAM-IDP-002` exchanges a verified IAP assertion through `/auth/token`, so it relies on the private verified token-minting path and durable server-side actor resolution. | **Open integration risk.** Machine truth says the dependency is done, but the declared branch is not yet integrated into either `dev` or the parent review branch. Reviewer should confirm merge/rebase order before parent closeout. |
| `IAM-P0-004` | `done` | Commit `a0809cecc32c971a8bfdaf5ffe07fa3b79f86ee2` is in `origin/dev` and in `origin/codex2/iam-idp-002` | Workforce assertion verification depends on issuer/audience/key configuration failing closed in stage/prod. | Satisfied. |
| `IAM-ACC-001` | `done` | Commit `c1f02ae570e6c6ba19e460af75ddf7d71443dc20` is in `origin/dev` and in `origin/codex2/iam-idp-002` | Durable principal, membership, and role-binding persistence is the storage layer used by `syncWorkforceSubject(...)`. | Satisfied. |
| `IAM-CTR-001` | `done` | Commit `717a87195d59943a8601b5f4d3bc7d7e8317daad` is in `origin/dev` and in `origin/codex2/iam-idp-002` | Stable denial reasons and control-plane auth contract shape are required for the new fail-closed workforce exchange paths. | Satisfied. |

Dependency summary: three dependencies are present in `dev` and in the parent review branch. `IAM-P0-002` remains the only unresolved integration-order concern surfaced by this packet.

---

## 3. Acceptance Criteria Checklist

| Acceptance criterion | Evidence | Status |
| --- | --- | --- |
| Verified IAP subject resolves durable membership | `apps/api/src/modules/auth/workforce-identity.service.ts:105-272` verifies the assertion, derives grants, and resolves the active realm membership; `apps/api/src/modules/identity/identity.repository.ts:260-445` upserts the durable principal/membership/role-binding records; `apps/api/src/modules/auth/auth.controller.ts:84-132` mints the inner JWT from the resolved durable identity; positive coverage exists in `apps/api/tests/integration/iap-subject-adapter.integration.test.ts:112-148` and `apps/api/tests/unit/auth-bootstrap.test.ts:1684-1707`. | PASS on reviewed branch |
| Spoofed email and role headers are ignored | Email mismatch is denied in `apps/api/src/modules/auth/workforce-identity.service.ts:122-145`; control-plane request header blocklist includes `x-roles` in `packages/control-plane-auth/src/index.ts:12-23`; positive path proves spoofed role headers do not survive in `apps/api/tests/integration/iap-subject-adapter.integration.test.ts:112-148` and `apps/api/tests/unit/auth-bootstrap.test.ts:1684-1707`; explicit spoofed email rejection is covered in `apps/api/tests/unit/auth-bootstrap.test.ts:1709-1740`. | PASS on reviewed branch |
| Wrong audience and inactive workforce users fail | Wrong audience denial is implemented in `apps/api/src/modules/auth/workforce-identity.service.ts:281-304` and covered by `apps/api/tests/integration/iap-subject-adapter.integration.test.ts:195-222` plus `apps/api/tests/unit/auth-bootstrap.test.ts:1743-1773`; inactive workforce denial is implemented in `apps/api/src/modules/auth/workforce-identity.service.ts:147-165` and covered by `apps/api/tests/integration/iap-subject-adapter.integration.test.ts:224-253` plus `apps/api/tests/unit/auth-bootstrap.test.ts:1823-1856`. | PASS on reviewed branch |
| Group drift applies least privilege and alerts | Drift is detected and logged in `apps/api/src/modules/auth/workforce-identity.service.ts:199-255`, persisted/suspended in `apps/api/src/modules/identity/identity.repository.ts:296-343` and `:420-445`, and surfaced as `least_privilege_applied` from `apps/api/src/modules/auth/auth.controller.ts:98-131`; coverage exists in `apps/api/tests/integration/iap-subject-adapter.integration.test.ts:300-409` and `apps/api/tests/unit/auth-bootstrap.test.ts:1858-2006`, with additional orphaned-membership denials in `apps/api/tests/integration/iap-subject-adapter.integration.test.ts:564-649` and `apps/api/tests/unit/auth-bootstrap.test.ts:2239-2335`. | PASS on reviewed branch |
| IAP integration negative tests pass | Parent task machine truth records these owner-run commands: `pnpm exec vitest run apps/api/tests/integration/iap-subject-adapter.integration.test.ts`, `pnpm exec vitest run apps/api/tests/unit/auth-bootstrap.test.ts`, `pnpm exec vitest run tests/unit/control-plane-auth.test.ts`, and `pnpm exec vitest run tests/unit/auth-bootstrap.test.ts`. This sidecar task did not rerun the implementation suite. | OWNER-REPORTED PASS; reviewer should spot-check |

---

## 4. Reviewer Focus

1. Confirm the `IAM-P0-002` integration-order gap is acceptable for review, or require the parent branch to merge/rebase that dependency before final closeout.
2. Re-run the recorded workforce/IAP verification commands on `origin/codex2/iam-idp-002` or PR `#1253`.
3. Pay special attention to cross-realm orphaned membership cases:
   - ops denial when the ops grant disappears: `apps/api/tests/unit/auth-bootstrap.test.ts:1932-2006`
   - platform denial when only the ops binding survives: `apps/api/tests/unit/auth-bootstrap.test.ts:2239-2335`
   - corresponding integration coverage: `apps/api/tests/integration/iap-subject-adapter.integration.test.ts:361-409` and `:564-649`
4. Confirm browser/control-plane parity still holds after the new helper surface in `packages/control-plane-auth/src/index.ts:1-184` and `tests/unit/control-plane-auth.test.ts:15-150`.

---

## 5. Handoff Notes

- Parent branch delta versus `origin/dev` spans 17 files, centered on:
  - workforce identity resolution and durable sync
  - `/auth/token` control-plane exchange path
  - control-plane auth helper updates
  - unit and integration regression coverage
- This packet intentionally does not change machine truth. It documents one concrete dependency-integration concern (`IAM-P0-002`) and otherwise finds the acceptance evidence aligned with the parent task's five recorded criteria.
- Ready for reviewer: `Codex2`
