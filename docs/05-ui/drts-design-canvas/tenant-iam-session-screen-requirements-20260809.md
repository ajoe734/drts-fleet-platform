# Tenant IAM Session Administration — Screen Requirements

**Date:** 2026-08-09
**Task:** `IAM-UI-TEN-001`
**Surface:** `apps/tenant-console-web/app/sessions/*` (not yet created)
**Status:** blocked pending a canonical Tenant Console canvas response
**Author lane:** Codex
**Visual authority checked:** `docs/05-ui/drts-design-canvas/Tenant Console.html`,
`tenant-screens.jsx`, `tenant-screens-1.jsx`, `tenant-screens-2.jsx`, and
`tenant-screens-3.jsx`
**Behaviour authority:**
`docs/02-architecture/stage1-5-identity-access-account-security-hardening-plan-20260801.md`
§§210–212, 228–233, 431, 440–446, 459, 466–469

## Canvas gap confirmed

The Tenant Console canvas includes `/users`, `/api-keys`, and `/webhooks`, but
does not provide an artboard, route, interaction state, or visual layout for
tenant session inventory or session revocation. A tenant-session UI must not be
invented from generic Canvas/shadcn patterns. Therefore no `/sessions` surface
or substitute dialog has been added by this task.

## Required design response

The canvas response needs to specify the following without revealing raw
tokens, cookie material, client IPs, user-agent values, or other sensitive
session details:

- Navigation placement and page title/breadcrumb for tenant session
  administration.
- Tenant-bounded inventory layout: member identity (masked where required),
  session status, authentication methods/assurance, issued time, idle expiry,
  absolute expiry, and a safe device/risk summary.
- Explicit visual states for `active`, `revoked`, `expired`, and `compromised`,
  plus empty, permission-denied, stale/degraded, and cross-tenant-denied
  outcomes.
- A high-risk revoke-one and revoke-all confirmation journey that visibly
  requires a current step-up proof, reason code/text, and shows the server
  outcome. It must render `STEP_UP_REQUIRED`, `LAST_ADMIN_PROTECTED`, and
  self-escalation/approval denials distinctly instead of treating client-side
  booleans as authority.
- The location of the audit receipt/deep link after a successful or rejected
  lifecycle action.

## Required API contract before UI implementation

`packages/api-client/src/index.ts` currently has no tenant-scoped session
inventory or session-revocation method, and `packages/contracts/src/iam-contracts.ts`
has no corresponding tenant session operation. The supporting backend contract
must expose tenant-bound read and mutation operations whose authority comes
from the authenticated membership, not a UI-supplied tenant or actor value.

The returned read model must use masked/safe summaries and must not expose raw
access tokens, refresh tokens, token hashes, secrets, full IP addresses, or
unbounded device metadata. Revoke commands need the server-enforced step-up,
reason, expected-version, audit, last-admin, and self-escalation error
semantics named in the behaviour authority above.

## Existing canvas-aligned coverage

- `/users` follows `tenant-screens-2.jsx` and renders tenant users, roles, and
  the backend-returned action descriptors.
- `/api-keys` follows `tenant-screens-2.jsx` and already implements masked
  credential inventory plus a plaintext-once reveal journey.
- `/webhooks` follows `tenant-screens-2.jsx` and already implements masked
  secret-reveal/rotation receipts.

This note is intentionally a requirements handoff, not a newly designed
screen. `IAM-UI-TEN-001` cannot claim complete tenant-session UI acceptance
until the canonical artboard and server contract above exist.
