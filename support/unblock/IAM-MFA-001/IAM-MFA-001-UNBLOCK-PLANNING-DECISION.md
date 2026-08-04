# IAM-MFA-001 Unblock Planning Decision

## Scope

- Task: `IAM-MFA-001-UNBLOCK-PLANNING-DECISION`
- Parent: `IAM-MFA-001`
- Owner: `Codex`
- Reviewer: `Gemini`
- Decision date: `2026-08-04`

## Diagnosis

`IAM-MFA-001` was blocked by a generic "missing product/contract decision"
label, but the narrower planning gap was an ownership question that the
existing docs had not stated explicitly enough:

1. The canonical hardening plan already defines the MFA policy inputs and
   outcomes:
   - trusted proof comes from IdP/session claims such as `amr`, `acr`,
     `auth_time`, and `mfaVerifiedAt`, or from server-owned device proof
   - every named high-risk action must enforce a freshness window
   - public failures use stable `MFA_REQUIRED` / `STEP_UP_REQUIRED` errors
2. The execution packet already places `IAM-MFA-001` in Wave D as the task that
   enforces step-up policy, after `IAM-IDP-001`, `IAM-IDP-002`, and
   `IAM-SES-002` establish trusted identity/session proof.
3. The shared contract surface already contains `stepUpReference` on mutation
   metadata, but the canonical planning set did not say whether that field
   implied a new DRTS-managed challenge/ticket issuance API, or whether
   `IAM-MFA-001` could unblock by enforcing server-side deny/allow policy
   against proof already present on the current session.

That left the parent without a concrete answer on this question:

Does `IAM-MFA-001` need to design and ship a first-party MFA challenge product
or step-up ticket contract, or is it authorized to enforce named-action policy
using the trusted proof already projected by existing IdP/session tasks and
return stable denial codes when freshness is insufficient?

## Canonical Sources Consulted

Higher-precedence first per `AI_COLLABORATION_GUIDE.md` §2:

1. `docs/02-architecture/stage1-5-identity-access-account-security-hardening-plan-20260801.md`
2. `docs/03-runbooks/stage1-5-identity-access-account-security-execution-tasks-20260801.md`
3. `packages/contracts/src/index.ts`
4. `packages/contracts/src/iam-contracts.ts`
5. `openapi/iam-stage15-contracts-v1.yaml`
6. `apps/api/src/common/auth/jwt-auth.service.ts`
7. `apps/api/src/common/auth/auth.types.ts`
8. `AI_NAME=Codex scripts/ai-status.sh show IAM-MFA-001`
9. `AI_NAME=Codex scripts/ai-status.sh show IAM-IDP-001`
10. `AI_NAME=Codex scripts/ai-status.sh show IAM-IDP-002`
11. `AI_NAME=Codex scripts/ai-status.sh show IAM-SES-002`

## Decision

`IAM-MFA-001` is unblocked on the product/contract interpretation.

The binding decision is:

1. `IAM-MFA-001` owns the server-side step-up policy registry and enforcement
   for every named high-risk action. Its scope is to evaluate trusted proof
   already present on the current identity/session and decide whether the
   action is allowed, denied with `MFA_REQUIRED`, or denied with
   `STEP_UP_REQUIRED`.
2. `IAM-MFA-001` does not need to invent or publish a new first-party MFA
   enrollment, challenge, or ticket issuance product to satisfy Stage 1.5.
3. Human step-up proof is reacquired through the approved managed IdP / BFF
   flows owned by `IAM-IDP-001`, `IAM-IDP-002`, and `IAM-SES-002`; driver
   device-proof refresh and rebind remain owned by `IAM-DRV-001`.
4. `stepUpReference` remains a mutation/audit correlation field. It is not, by
   itself, evidence that a separate challenge lifecycle API must ship inside
   `IAM-MFA-001`.
5. If product later requires a dedicated DRTS-managed step-up challenge or
   ticket issuance API, that is an explicit follow-up task, not hidden scope
   inside `IAM-MFA-001`.

## What Changed In Canonical Planning

The following canonical planning artifacts now record the scope split
explicitly:

1. `docs/02-architecture/stage1-5-identity-access-account-security-hardening-plan-20260801.md`
   now states that:
   - `IAM-MFA-001` owns policy evaluation and deny behavior
   - existing IdP/session tasks own trusted MFA proof acquisition/projection
   - a dedicated first-party challenge API is not implied by current scope
2. `docs/03-runbooks/stage1-5-identity-access-account-security-execution-tasks-20260801.md`
   now states that:
   - `IAM-MFA-001` enforces named-action step-up rules using current-session
     proof
   - UI tasks consume stable deny codes and hints but do not own authority
   - a DRTS-managed step-up challenge API would require a separate follow-up
     task

## Scope Cut And Routing

This helper does **not** implement the parent task.

Out of scope here:

1. Adding the runtime enforcement code in `apps/api/src/common/auth/`,
   privileged mutation services, or E2E tests.
2. Building a dedicated MFA challenge acquisition endpoint, step-up ticket
   issuance API, or enrollment UI/product.
3. Reworking managed IdP login/BFF flows already owned by `IAM-IDP-001` /
   `IAM-IDP-002`.
4. Reworking driver device binding or device-proof refresh flows owned by
   `IAM-DRV-001`.

Remaining routed work for the parent:

1. Build the named high-risk action policy map from the accepted architecture
   table and mutation surfaces.
2. Enforce freshness and proof-type checks against the trusted current-session
   identity projected by `IAM-SES-002`.
3. Return stable `MFA_REQUIRED` / `STEP_UP_REQUIRED` denials and audit context
   without trusting client booleans.
4. Leave any dedicated challenge/ticket issuance API out of scope unless a new
   follow-up task is explicitly registered.

## Parent Unblocked Next Step

The parent should replace any vague "missing product / contract decision"
wording with this concrete next step:

1. Treat the planning question as resolved by the updated architecture and
   execution packet on `2026-08-04`.
2. Resume `IAM-MFA-001` as server-side policy enforcement work:
   - register the named high-risk actions and freshness windows
   - read trusted proof from the current identity/session
   - reject stale, missing, wrong-session, or wrong-proof attempts with stable
     `MFA_REQUIRED` / `STEP_UP_REQUIRED` errors
   - emit audit evidence for deny/allow outcomes
3. Keep first-party challenge issuance, enrollment UX, or new ticket lifecycle
   design out of scope; those require a separate follow-up task if later needed.

This means the parent is no longer blocked on product semantics. The remaining
work is implementation and reviewer follow-through.

## Verification Basis

- `docs/02-architecture/stage1-5-identity-access-account-security-hardening-plan-20260801.md`
- `docs/03-runbooks/stage1-5-identity-access-account-security-execution-tasks-20260801.md`
- `packages/contracts/src/index.ts`
- `packages/contracts/src/iam-contracts.ts`
- `openapi/iam-stage15-contracts-v1.yaml`
- `apps/api/src/common/auth/jwt-auth.service.ts`
- `apps/api/src/common/auth/auth.types.ts`
