# IAM-IDP-002 Acceptance Packet

Task: **Resolve verified IAP workforce subjects to platform and ops memberships**
Parent task: `IAM-IDP-002`
Sidecar ID: `IAM-IDP-002-SIDECAR-ACCEPTANCE`
Prepared by: `Codex`
Reviewer: `Codex2`
Date: `2026-08-02`

---

## 1. Snapshot

- Machine-truth status captured at `2026-08-02T02:31:56Z`: parent task `IAM-IDP-002` is `done`.
- Canonical closeout evidence points to `origin/dev@d0d4cbd91d8503d975fd39488e22c14085274ca5`.
- Historical review branch remains `origin/codex2/iam-idp-002@8f44cbc1bd23b8e16a2bb00e53422f2a53b310f1`.
- This packet is a support artifact only. It does not modify canonical truth, contracts, or runtime code.

---

## 2. Dependency Map

| Dependency | Machine status | Git evidence on `2026-08-02` | Impact on `IAM-IDP-002` | Assessment |
| --- | --- | --- | --- | --- |
| `IAM-P0-002` | `done` | `origin/gemini/iam-p0-002` is not itself an ancestor of `origin/dev`, but its merge-base with both `origin/dev` and `origin/codex2/iam-idp-002` is `825c231aab4c`; older commit `624e60bda2d0` is a shared ancestor across all three refs. Branch-head divergence alone is therefore not proof that the dependency is absent. | `/auth/token` private verified exchange and durable server-side actor resolution are prerequisite behavior for IAP subject handling. | Record as lineage ambiguity, not an open acceptance blocker. Machine truth already marks the dependency `done`. |
| `IAM-P0-004` | `done` | Commit `a0809cecc32c971a8bfdaf5ffe07fa3b79f86ee2` is contained in `origin/dev`. | Strict issuer/audience/key validation under stage/prod keeps IAP exchange fail-closed. | Satisfied on canonical baseline. |
| `IAM-ACC-001` | `done` | Commit `c1f02ae570e6c6ba19e460af75ddf7d71443dc20` is contained in `origin/dev`. | Durable principal, membership, and role-binding persistence backs subject-to-membership resolution. | Satisfied on canonical baseline. |
| `IAM-CTR-001` | `done` | Commit `717a87195d59943a8601b5f4d3bc7d7e8317daad` is contained in `origin/dev`. | Stable auth helper contracts and denial semantics support the control-plane exchange path. | Satisfied on canonical baseline. |

Dependency summary: `IAM-P0-004`, `IAM-ACC-001`, and `IAM-CTR-001` are directly evidenced on `origin/dev`. `IAM-P0-002` should be described as a provenance note only; the previous packet overstated it as an integration failure by treating branch-head ancestry as canonical truth.

---

## 3. Acceptance Criteria Checklist

| Acceptance criterion | Evidence | Status |
| --- | --- | --- |
| Verified IAP subject resolves durable membership | `apps/api/src/modules/auth/iap-subject.adapter.ts:69-175` verifies the assertion and resolves by immutable subject; `apps/api/src/modules/auth/iap-subject.adapter.ts:220-299` auto-provisions only from verified workforce groups; `apps/api/src/modules/identity/identity.repository.ts:297-411` and `apps/api/src/modules/identity/identity.repository.ts:420-520` persist memberships and role bindings; `apps/api/src/modules/auth/auth.controller.ts:84-134` mints the inner JWT from the resolved durable identity; coverage exists in `tests/integration/iap-subject-adapter.integration.test.ts:31-62` and `tests/unit/iap-subject-adapter.test.ts:25-62`. | PASS on `origin/dev@d0d4cbd91d85` |
| Spoofed email and role headers are ignored | `apps/api/src/modules/auth/iap-subject.adapter.ts:81-115` rejects spoofed email/roles/scopes when no verified assertion is present; `packages/control-plane-auth/src/index.ts:33-44` strips caller-controlled auth headers, including `x-roles`; coverage exists in `tests/integration/iap-subject-adapter.integration.test.ts:64-100` and `tests/integration/iap-subject-adapter.integration.test.ts:318-376`, `tests/unit/iap-subject-adapter.test.ts:94-118`, and `tests/unit/control-plane-auth.test.ts:88-100`. | PASS on `origin/dev@d0d4cbd91d85` |
| Wrong audience and inactive workforce users fail | `apps/api/src/modules/auth/iap-subject.adapter.ts:117-145` converts verification failures into fail-closed auth errors, and `apps/api/src/modules/auth/iap-subject.adapter.ts:171-218` plus `apps/api/src/modules/auth/iap-subject.adapter.ts:443-505` deny inactive or unverified durable identities; coverage exists in `tests/integration/iap-subject-adapter.integration.test.ts:102-193`, `tests/unit/iap-subject-adapter.test.ts:120-151`, `tests/unit/iap-subject-adapter.test.ts:189-315`, `tests/unit/control-plane-auth.test.ts:156-188`, and `tests/unit/control-plane-auth.test.ts:240-261`. | PASS on `origin/dev@d0d4cbd91d85` |
| Group drift applies least privilege and alerts | `apps/api/src/modules/auth/iap-subject.adapter.ts:357-645` recalculates effective roles from verified groups, downgrades to least privilege, and emits drift events; `apps/api/src/common/auth/bootstrap-auth.guard.ts:174-239` activates request identity from the resolved durable membership; coverage exists in `tests/unit/iap-subject-adapter.test.ts:317-441`, `tests/integration/iap-subject-adapter.integration.test.ts:195-316`, `tests/integration/iap-subject-adapter.integration.test.ts:426-473`, and `tests/integration/iap-subject-adapter.integration.test.ts:565-714`. | PASS on `origin/dev@d0d4cbd91d85` |
| IAP integration negative tests pass | Re-ran `pnpm exec vitest run tests/integration/iap-subject-adapter.integration.test.ts tests/unit/iap-subject-adapter.test.ts tests/unit/control-plane-auth.test.ts` on `2026-08-02`; result: `3` files passed, `45` tests passed. | PASS; rerun by sidecar |

---

## 4. Reviewer Focus

1. Use `origin/dev@d0d4cbd91d85` as the canonical post-closeout baseline; the old review branch is historical context only.
2. If `IAM-P0-002` lineage needs follow-up, record it as provenance cleanup instead of treating branch-head divergence as proof the dependency is missing.
3. Spot-check the drift-to-ops path and platform-only denial path in `tests/integration/iap-subject-adapter.integration.test.ts:565-714`, since that is where least-privilege behavior is easiest to regress.
4. Confirm the packet no longer references removed paths (`workforce-identity.service.ts`, `apps/api/tests/...`) or stale parent status.

---

## 5. Handoff Notes

- Packet refreshed after fetching current refs and re-sampling machine truth on `2026-08-02`.
- Parent task state changed during this session: earlier samples showed `review` and then `in_progress`; the latest machine-truth sample at `2026-08-02T02:31:56Z` is `done`. This packet uses the latest sample.
- Stale path references and trailing whitespace from the prior packet have been removed.
- Ready for reviewer: `Codex2`
