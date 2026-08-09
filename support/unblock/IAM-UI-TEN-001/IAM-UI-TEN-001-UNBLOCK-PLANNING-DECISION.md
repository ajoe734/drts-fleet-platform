# IAM-UI-TEN-001 Unblock Planning Decision

## Scope

- Helper task: `IAM-UI-TEN-001-UNBLOCK-PLANNING-DECISION`
- Parent task: `IAM-UI-TEN-001`
- Owner: `Codex`
- Reviewer: `Claude`
- Decision date: `2026-08-09`

## Decision

The session, account, credential, and step-up semantics required by the parent
are already decided by canonical Stage 1.5 planning; this is **not** a new
product or API-shape decision.

The parent must not implement a Tenant Console session-management screen until
its missing canvas artboard and interaction states are supplied.  It also must
not assume that the session API is available from `origin/dev` merely because
the `IAM-SES-003` task record says `merged_to_dev`: the recorded session
delivery commit `7dc64affa7ef71d3c1c9d7b1efd2ab051896fda5` is not reachable
from `origin/dev` as checked on 2026-08-09.  The unmerged clean implementation
rail is `gemini/iam-ses-003` (including `1357379c248612cf68c091f2be489bbe746a21db`).

Accordingly, `IAM-UI-TEN-001` remains blocked only on the two concrete
delivery prerequisites below, not on a new semantic decision.

## Binding Contract Already Decided

1. A user can view their own active sessions, revoke one session, and log out
   all sessions.  An administrator may remote-revoke only within the tenant
   boundary, with the required scope and a reason.
2. Session rows may expose only masked device, IP, and activity summaries.
   They must not expose tokens, full IP addresses, or complete user-agent
   values.
3. Logout and revoke are CSRF-protected and audited; logout-all requires
   recent authentication.  The UI must surface server-owned step-up and
   authorization outcomes rather than deriving them locally.
4. The existing parent requirements for invitation lifecycle, role changes,
   last-admin protection, self-escalation denial, and plaintext-once
   credentials remain server-authoritative.  The UI displays stable server
   errors and does not invent client-side authorization outcomes.

These rules are fixed by:

- `docs/02-architecture/stage1-5-identity-access-account-security-hardening-plan-20260801.md`
  §§8.4, 9.1–9.3, 10.1–10.3, and 12.1;
- `docs/03-runbooks/stage1-5-identity-access-account-security-execution-tasks-20260801.md`
  §§5.2–5.5; and
- `support/unblock/IAM-SES-003/IAM-SES-003-UNBLOCK-PLANNING-DECISION.md`,
  already reachable from `origin/dev` at `60a369671`.

## Scope Cut

This helper deliberately does not:

1. add a raw-hex, default-styled, or otherwise invented Tenant Console UI;
2. add a `/sessions` route, navigation item, API-client method, OpenAPI path,
   or substitute session data with fixtures;
3. redefine `sid`, token-version, revocation, masking, step-up, CSRF, audit,
   or tenant-boundary semantics; or
4. treat the current `IAM-SES-003` task-state integration claim as source-code
   evidence while its stated closeout commit is absent from `origin/dev`.

The Tenant Console design canvas contains artboards for `users`, `apikeys`,
and `webhooks`, but none for session inventory or revocation.  Under the UI
design contract, a missing screen requires a screen-requirements note and a
stop, rather than a replacement design.

## Required Follow-up for the Parent

`Claude` must supply or route a Tenant Console canvas addition for the session
surface before the parent resumes UI work.  The artboard/requirements note
must specify, using tenant realm tokens and the existing canvas system:

1. information architecture and route/navigation placement for the session
   surface;
2. self-session inventory states: loading, empty, active, revoked/expired,
   single-session revoke, and logout-all;
3. tenant-admin remote-revoke states, including required reason, tenant-bound
   authorization denial, and masked device/IP/activity presentation;
4. mutation states for CSRF/concurrency failure and server-owned
   `AUTH_STEP_UP_REQUIRED` / `IAM_STEP_UP_REQUIRED`; and
5. accessible confirmation, focus return, and error-announcement behavior.

In parallel, the session API delivery must be integrated to `origin/dev` and
verified from the actual source tree.  The parent may then bind the canvas to
the already-decided session contract; it must not write a speculative contract
or UI before both prerequisites are true.

## Parent Next Step

Keep `IAM-UI-TEN-001` `blocked`, waiting for `Claude`, with this next action:

> Route or add the missing Tenant Console session inventory/revocation canvas
> artboard and interaction requirements, then verify the `IAM-SES-003`
> implementation is actually integrated on `origin/dev`.  Once both are
> evidenced, resume the parent against the binding Stage 1.5 session contract
> and the canvas; do not invent a replacement surface.

## Verification Basis

- `git merge-base --is-ancestor 7dc64affa7ef71d3c1c9d7b1efd2ab051896fda5 origin/dev`
  returned non-zero on 2026-08-09.
- `packages/contracts/src/iam-contracts.ts`,
  `openapi/iam-stage15-contracts-v1.yaml`, and
  `packages/api-client/src/index.ts` on `origin/dev` do not publish the
  required session-management consumer paths.
- `docs/05-ui/drts-design-canvas/Tenant Console.html` and
  `docs/05-ui/drts-design-canvas/tenant-screens.jsx` have no session,
  device, or security-session artboard.
