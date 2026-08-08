# IAM-SES-003 Unblock Planning Decision

## Scope

- Helper task: `IAM-SES-003-UNBLOCK-PLANNING-DECISION`
- Parent task: `IAM-SES-003`
- Owner: `Codex`
- Reviewer: `Claude`
- Decision date: `2026-08-08`

## Diagnosis

The generated label, “missing product/contract decision”, is not supported by
the canonical planning record.  The required product and contract decisions
for `IAM-SES-003` have already been made; no alternative remains that needs a
new product owner decision.

The parent is currently waiting on the normal review and protected-branch
integration of replacement PR [#1344](https://github.com/ajoe734/drts-fleet-platform/pull/1344), not on a semantic or contract choice.  The clean rail is
`origin/codex/iam-ses-003-clean @ d0f1017e5653fec339fc20d832db24d7a3963a7f`.
It is not yet reachable from `origin/dev`.

## Canonical Planning Decision

`IAM-SES-003` is unblocked on product and contract planning.  The following
already-accepted rules are binding:

1. The task owns only the session-management surface: `POST /api/auth/logout`,
   `POST /api/auth/logout-all`, `GET /api/auth/sessions`,
   `POST /api/auth/sessions/:sid/revoke`, and the admin-scoped session
   inventory/revoke surface.  The architecture packet assigns this ownership
   explicitly in §6.2 and §12.1.
2. A user may view their active sessions, revoke an individual session, and
   logout all sessions.  An administrator may remote-revoke only with the
   required scope, within the tenant/resource boundary, and with a reason.
   These are explicit §10.1 requirements.
3. Session inventory returns only masked device, IP, and activity summaries;
   it must never expose tokens, full IP addresses, or full user-agent values.
4. Logout/revoke mutations require CSRF protection and canonical audit.  The
   accepted endpoint table also requires recent authentication for logout-all.
5. `IAM-SES-003` consumes the `sid`, token-version, revocation state, and
   masking semantics delivered by `IAM-SES-001` and `IAM-SES-002`.  It must not
   redefine the authority claim envelope.

The execution packet §5.2 repeats the same scope split.  Therefore the
planning decision is resolved by existing canonical truth rather than by
inventing a new contract variation.

## Scope Cut

This helper does not:

1. Change session claim names, `IdentityContext`, or request-identity
   projection; those are `IAM-SES-002` responsibilities.
2. Change durable session/token persistence, rotation, or token hashing; those
   are `IAM-SES-001` responsibilities.
3. Implement or amend the parent API behavior.  The parent behavior is already
   reconstructed in the clean replacement commit and awaits normal integration.
4. Bypass protected-branch checks, force-push the contaminated historical rail,
   or treat PR #1336 as the delivery rail.

## Parent Unblocked Next Step

Update `IAM-SES-003` to use this concrete next step:

1. `Claude` reviews replacement PR #1344 at
   `d0f1017e5653fec339fc20d832db24d7a3963a7f`, using the already accepted
   session-management scope above.
2. Complete the normal protected-branch checks and merge that replacement PR
   to `dev`; do not rewrite or reuse the contaminated PR #1336 branch.
3. After merge, record the parent’s merge/CI/deploy evidence through the normal
   integration closeout path.

Until that external review/integration step completes, the parent may remain
blocked on PR flow, but it is no longer blocked on product or contract
planning.

## Verification Basis

- `docs/02-architecture/stage1-5-identity-access-account-security-hardening-plan-20260801.md`
  §§6.2, 10.1, and 12.1.
- `docs/03-runbooks/stage1-5-identity-access-account-security-execution-tasks-20260801.md`
  §5.2.
- `support/unblock/IAM-SES-003/IAM-SES-003-UNBLOCK-HISTORY-REPAIR.md` at
  `b1120f22493410dc5fdc47893a5d3dc5f0fc93d9`, which records the clean-rail
  repair and PR #1344 routing.
- `git merge-base --is-ancestor d0f1017e5653fec339fc20d832db24d7a3963a7f
  origin/dev` returned non-zero on 2026-08-08, confirming that integration is
  still outstanding.
