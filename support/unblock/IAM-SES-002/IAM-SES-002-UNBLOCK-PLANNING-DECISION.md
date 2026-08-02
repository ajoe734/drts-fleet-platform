# IAM-SES-002 Unblock Planning Decision

## Scope

- Task: `IAM-SES-002-UNBLOCK-PLANNING-DECISION`
- Parent: `IAM-SES-002`
- Owner: `Codex`
- Reviewer: `Codex2`
- Decision date: `2026-08-02`

## Diagnosis

`IAM-SES-002` was blocked under a generic "missing product/contract decision"
label, but the repo state showed a narrower planning gap:

1. The canonical hardening plan already defines the minimum authority envelope
   for every server-built request identity in
   `docs/02-architecture/stage1-5-identity-access-account-security-hardening-plan-20260801.md`
   §6.2:
   `subjectId`, `actorId`, realm/resource boundary, `roles`, `scopes`,
   `policyVersion`, `sid`, `jti`, `tokenVersion`, `authTime`, `amr`, `acr`,
   `mfaVerifiedAt`, `issuedAt`, `expiresAt`, `issuer`, and `audience`.
2. The execution packet already assigns the claim-issuance and revoke-enforcement
   work to `IAM-SES-002`, while `IAM-SES-003` owns session inventory, logout,
   logout-all, and remote revoke APIs.
3. The current canonical contract surface is behind that accepted planning:
   `packages/contracts/src/index.ts` `IdentityContext` still omits the minimum
   session/token claims, and `/api/identity/context` in
   `openapi/iam-stage15-contracts-v1.yaml` / `packages/contracts/src/iam-contracts.ts`
   is currently only a generic identity read surface.
4. Current auth implementation also reflects the older shape:
   `apps/api/src/common/auth/jwt-auth.service.ts` `JwtIdentityPayload` and
   `apps/api/src/modules/auth/auth.controller.ts` `buildIdentityContext()`
   project only actor/realm/role/scope/tenant basics and do not yet expose the
   accepted session authority envelope.

That left the parent without a clear answer on one specific question:

Should `IAM-SES-002` only add internal JWT claims and request-time revoke
checks, or is it also authorized to extend the canonical shared authority
surface (`IdentityContext`, `GET /api/identity/context`, and the request
identity projection) to carry those claims?

## Canonical Sources Consulted

Higher-precedence first per `AI_COLLABORATION_GUIDE.md` §2:

1. `docs/02-architecture/stage1-5-identity-access-account-security-hardening-plan-20260801.md`
2. `docs/03-runbooks/stage1-5-identity-access-account-security-execution-tasks-20260801.md`
3. `packages/contracts/src/index.ts`
4. `packages/contracts/src/iam-contracts.ts`
5. `openapi/iam-stage15-contracts-v1.yaml`
6. `apps/api/src/common/auth/jwt-auth.service.ts`
7. `apps/api/src/modules/auth/auth.controller.ts`
8. `AI_NAME=Codex scripts/ai-status.sh show IAM-SES-002`
9. `AI_NAME=Codex scripts/ai-status.sh show IAM-P0-006`

## Decision

`IAM-SES-002` is unblocked on the product/contract interpretation.

The binding decision is:

1. The minimum authority envelope already accepted in the hardening plan is the
   canonical product/contract truth. It does not need a new task or a new human
   decision.
2. `IAM-SES-002` owns projecting that accepted authority envelope into the
   shared session/identity contract surfaces:
   - issued bearer/session payloads
   - middleware request identity
   - canonical `IdentityContext`
   - `GET /api/identity/context`
3. `IAM-SES-003` does **not** own claim-shape design. It owns the
   session-management APIs and masked inventory/revoke read models that consume
   the `sid`, revoke state, and masking rules defined by `IAM-SES-001` /
   `IAM-SES-002`.
4. `IAM-CTR-001` remains a valid baseline publication task, but it does not
   freeze `IdentityContext` at the current reduced shape and does not block
   `IAM-SES-002` from extending the identity/session contracts to match the
   already accepted authority envelope.
5. For realms where a proof field is not applicable, the canonical field name
   still exists and the server projects a neutral `null` or empty value rather
   than omitting the field entirely.

## What Changed In Canonical Planning

The following canonical planning artifacts now record the scope split
explicitly:

1. `docs/02-architecture/stage1-5-identity-access-account-security-hardening-plan-20260801.md`
   now states that:
   - `IAM-SES-002` owns the canonical authority-claim projection
   - `IAM-SES-003` owns session-management endpoints and must not redefine the
     authority envelope
2. `docs/03-runbooks/stage1-5-identity-access-account-security-execution-tasks-20260801.md`
   now states that:
   - `IAM-SES-002` must extend `IdentityContext` and `/api/identity/context`
   - `IAM-SES-003` consumes the `IAM-SES-001` / `IAM-SES-002` session model
   - `IAM-CTR-001` is baseline publication, not a blocker on this later claim
     extension

## Scope Cut And Routing

This helper does **not** implement the parent task.

Out of scope here:

1. Adding the runtime DTO/code changes in `packages/contracts`, `openapi`, or
   `apps/api`.
2. Implementing logout, logout-all, self session inventory, admin session
   inventory, or remote revoke APIs.
3. Reworking signing-key rotation; that remains `IAM-KEY-001`.
4. Resolving auth-guard merge conflicts caused by the still-active
   `IAM-P0-006` work.

Remaining routed work for the parent:

1. Rebase once `IAM-P0-006`'s overlapping auth-guard/request-identity changes
   are available on `dev` or otherwise safely composable on the parent branch.
2. Extend the canonical request identity / token surfaces to include the
   accepted authority envelope.
3. Enforce durable revoke and stale-token rejection within the accepted
   60-second propagation window.
4. Leave session inventory/logout/revoke endpoint delivery to `IAM-SES-003`.

## Parent Unblocked Next Step

The parent should replace any vague "missing product / contract decision"
wording with this concrete next step:

1. Treat the product/contract question as resolved by the accepted hardening
   plan and the updated execution packet on `2026-08-02`.
2. Resume `IAM-SES-002` as session-claim and revoke-enforcement work:
   - extend `JwtIdentityPayload`
   - extend the canonical request identity / `IdentityContext` projection
   - extend `GET /api/identity/context`
   - add durable checks for `sid`, `jti`, `tokenVersion`, `auth_time`, `amr`,
     `acr`, issuer, audience, and policy version
3. Keep logout, logout-all, self session inventory, and admin remote revoke out
   of scope for the parent; those belong to `IAM-SES-003`.
4. Because `IAM-P0-006` is still `in_progress` as of `2026-08-02`, rebase the
   parent once its auth-guard/request-identity overlap is safe, then continue
   implementation on the rebased tree.

This means the parent is no longer blocked on product semantics. The remaining
work is dependency coordination plus implementation.

## Verification Basis

- `docs/02-architecture/stage1-5-identity-access-account-security-hardening-plan-20260801.md`
- `docs/03-runbooks/stage1-5-identity-access-account-security-execution-tasks-20260801.md`
- `packages/contracts/src/index.ts`
- `packages/contracts/src/iam-contracts.ts`
- `openapi/iam-stage15-contracts-v1.yaml`
- `apps/api/src/common/auth/jwt-auth.service.ts`
- `apps/api/src/modules/auth/auth.controller.ts`

## Owner Closeout Refresh

After reviewer approval, the owner rechecked this helper task for the formal
`review_approved -> done` closeout path:

- `AI_NAME=Codex scripts/ai-status.sh show IAM-SES-002-UNBLOCK-PLANNING-DECISION`
  still reports this helper task as `review_approved` with owner `Codex`,
  reviewer `Codex2`, and the approved `next` summary pointing at commit
  `c353843b15324abafde2efdf31d21027ed06055e` on branch
  `codex/iam-ses-002-unblock-planning-decision`.
- `AI_NAME=Codex scripts/ai-status.sh show IAM-SES-002` now reports the parent
  as `in_progress` on the clean implementation rail owned by `Codex2`, which
  confirms the missing planning decision is no longer a machine-truth blocker
  for the parent task.
- `git ls-remote --heads origin
  refs/heads/codex/iam-ses-002-unblock-planning-decision` confirms the helper
  branch exists on `origin`; this task closes out as pushed branch evidence
  only.
- The review-approved artifact remains commit `c353843b15324abafde2efdf31d21027ed06055e`;
  the final owner closeout commit exists only to satisfy the required
  `Verification:` trailer and machine-truth finalize step without rewriting
  shared history.

Integration status for this helper task is `branch_pushed`. It does not claim
merge to `dev` or deployment to a dev environment.
