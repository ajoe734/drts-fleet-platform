# SD-DP-20260930-001 — C114 live session prerequisites

- Date: 2026-09-30
- Owner: Codex; reviewer: Claude2
- Task: `SR-LIVE-MAP-C114-COVERAGE-20260930-UNBLOCK-PLANNING-DECISION`
- Parent: `SR-LIVE-MAP-C114-COVERAGE-20260930`
- Disposition: contract interpretation and implementation routing, pending
  same-candidate review. This does not grant credentials or live acceptance.
- Audited source: `09ba63dc4c6343a2ca5bd89e8165719ff1d5bb4f`, which contains
  parent candidate `e3c7ed02701c387d82786bcfd8877e2618851f3b` via PR #2235.

## Decision and authority

Preserve the accepted identity boundaries. Repair the C114 harness to consume
supported driver-device and workforce sessions after their proofs are provisioned;
do not make caller-supplied driver/ops headers into valid product identities.
The missing decision is **how to obtain legitimate acceptance sessions**, not
whether durable identity verification may be disabled for a map test.

This interpretation follows, in precedence order:

1. [PRD §13.4](../../phase1_prd_detailed_v1.md): Admin/Ops SSO and MFA;
   [SA §11.1](../../phase1_system_analysis_v1.md): least privilege and realm
   isolation.
2. [Service contracts §3.1](../../phase1_service_contracts_v1.md): Identity owns
   JWT issuance, session/device binding and canonical IAM exchange contracts.
3. [Accepted realm matrix](SD-DP-20260429-001-plane-separation-auth-matrix.md)
   and [IAM hardening plan §§6.1, 6.2, 10.1–10.2](../02-architecture/stage1-5-identity-access-account-security-hardening-plan-20260801.md):
   driver invitation/device binding; workforce subject/membership; server-owned
   authority and revocable sessions.

No L1 requirement, realm, scope, verifier rule, or live acceptance key changes.
The parent's instruction to reuse WIF and per-run issuance remains a transport
constraint: WIF access to Secret Manager does not prove a driver device or an
Ops workforce identity. A `POST auth/token` returning a signed token is not
proof that `GET auth/session` will accept it.

## Source diagnosis and supported boundaries

| Boundary                       | Current production path and finding                                                                                                                                                                                                                       | Required parent action                                                                                                                                                                                                                                                                                                |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header-only driver issuance    | `AuthController.issueToken` falls through to an 8h bootstrap session. `JwtAuthService.validateDurableState` requires `driverBindingId === session.sessionId`; the issued claim is null.                                                                   | Use `AuthController.issueDriverDeviceSession` → `DriverDeviceSessionService.register/refresh` with a valid, dedicated invitation/device binding. `issueSession` already uses the binding as `sid`, includes device claims and issues a 15m access token.                                                              |
| Header-only ops issuance       | The same fallback has no `membershipId`; durable verification requires an active principal, matching active membership and current role-derived token version.                                                                                            | Consume verified workforce proof through the existing IAP/inner-Bearer path. `IAPSubjectAdapter.resolveSubject` and the IAP branch of `AuthController.issueToken` resolve the membership and effective scopes server-side. No fabricated membership or assertion.                                                     |
| Harness identity assumptions   | `bootstrapMapSessions` requests exact `driver:read` / `regulatory:read` claims with headers. `runCoverage` also hardcodes observer actor `live-map-observer` and the one-scope array.                                                                     | Update both consumers together. Pin the operator-provisioned observer principal/realm and server-derived scope policy; do not accept arbitrary actors or replace identity checks with “token is nonempty.”                                                                                                            |
| Driver authority and isolation | `DriverHeartbeatController.recordHeartbeatBatch/getTrackingStatus` enforce self-driver identity. Device issuance currently grants `driver:read`, `driver:write`, `dispatch:read`; it is not the harness's synthetic one-scope session.                    | Retain the driver realm, configured driver ID, binding/device verification and existing offline/no-task/no-vehicle checks. Document actual server-issued scopes; narrow scopes only through supported product issuance, never by editing JWT claims.                                                                  |
| Service workload alternative   | `ServiceWorkloadIdentityAdapter` accepts an actual verified workload assertion, issuer/subject registry, audience and exchange nonce; `issueToken` then creates a 15m **system** session. Google Actions cloud authentication alone is not that exchange. | This is not an automatic fallback for either user identity. If Supervisor selects a separately provisioned, read-only service observer, record its exact registered principal/scope/audience and amend the parent's observer contract before implementation. Driver writes still require the isolated driver session. |

Production sources: [AuthController](../../apps/api/src/modules/auth/auth.controller.ts),
[JwtAuthService](../../apps/api/src/common/auth/jwt-auth.service.ts),
[DriverDeviceSessionService](../../apps/api/src/modules/auth/driver-device-session.service.ts),
[IAPSubjectAdapter](../../apps/api/src/modules/auth/iap-subject.adapter.ts),
[ServiceWorkloadIdentityAdapter](../../apps/api/src/modules/auth/service-workload-identity.adapter.ts),
[DriverHeartbeatController](../../apps/api/src/modules/regulatory-registry/driver-heartbeat.controller.ts),
[session bootstrap](../../tests/e2e/system-remediation/sr-live-map-001/session-bootstrap.ts),
[coverage runner](../../tests/e2e/system-remediation/sr-live-map-001/coverage-runner.ts).

## Scope cut and executable follow-up

1. **Claude2:** explicitly disposition/reopen the parent for the harness change.
   Preserve the merged candidate, its approval and CI as historical evidence;
   the changed harness needs a new candidate and independent review.
2. **Supervisor:** reserve `drv-demo-002` only after checking persisted offline,
   non-dispatchable state, no current task/vehicle and no concurrent client.
   Arrange a valid invitation/device proof and a dedicated least-privilege
   workforce observer with a verified subject and active membership. Specify the
   actual principal, allowed server-issued scopes, expiry, per-run delivery and
   cleanup method in the parent. Do not request long-lived session secrets.
3. **Provisioning gap stays explicit:** `issueRegistrationInvitation` exists as
   a service method; the inspected auth controller has register/refresh/revoke,
   not a general invitation-issuance endpoint. Neither a provisioned invitation
   nor an unattended workforce-proof source has been demonstrated. Supervisor
   must resolve that delivery under the parent or register a scoped prerequisite
   in machine truth before new product work. Do not assume an internal method is
   a callable hosted API, reuse a demo registration code, or invent a secret name
   as evidence that a credential exists.
4. **Codex, after reopen and provisioning contract:** update session bootstrap,
   coverage consumers and their tests within the parent's existing harness and
   workflow scopes. Verify both sessions before exporting either token. Use the
   real device binding throughout the run, mask credentials, and revoke/clean up
   only the run-owned session/binding through supported paths; a failed cleanup
   must remain visible. No mutation of another driver's bindings.
5. **Product-source changes remain gated by scope coordination:** if supported
   issuance cannot supply the agreed proof/lifetime/scope or needs a new hosted
   provisioning adapter, Supervisor checks overlapping IAM work and updates the
   parent `write_scopes` before Codex changes auth, repositories, contracts or
   migrations. This planning helper grants no such write expansion.
6. **Supervisor/operator, then owner:** provision the exact driver/Google origins
   in the [existing coverage ledger](../../tests/e2e/system-remediation/sr-live-map-001/C114-COVERAGE.md),
   deploy the resulting full candidate SHA using the authorized shared Cloud Run
   workflow, then run hosted C114 at that same SHA. Read all evidence before
   recording any acceptance. VM runtime/browser execution remains prohibited.

`INTERNAL_KEY_EXCP_002` expires at `2026-09-30T23:59:59Z` in the
[exception inventory](../02-architecture/internal-key-exceptions.md).
This decision does not renew it, change the clock, or authorize fallback after
expiry. The inspected IAP token branch also calls `validateInternalKey`; therefore
an IAP proof alone does not resolve that branch's transport dependency after
expiry. Supervisor must coordinate the documented supported transport or a
separately scoped repair. Missing proof/transport must fail closed.

## Parent disposition and acceptance

The planning interpretation is settled; the parent remains **blocked** awaiting
Claude2's disposition and Supervisor's proof/provisioning contract. Do not resume
the same acceptance-only run merely because this document merges.

Before helper merge, canonical helper metadata must contain:

```json
{
  "resolved_parent_status": "blocked",
  "resolved_parent_waiting_for": "Claude2",
  "resolved_parent_next": "Claude2 disposition/reopen F-SESSION-CONTRACT; Supervisor specify supported driver-device and observer proof delivery, scope and isolation; Codex then repair both harness session consumers on a new candidate. Keep all four live acceptance keys pending until same-SHA hosted evidence passes."
}
```

Supervisor must also write that concrete next step to the parent through the
active status CLI. The dispatched helper cannot write another task or `assign`
metadata; rejected attempts and exact operator commands are recorded in the
[helper artifact](../../support/unblock/SR-LIVE-MAP-C114-COVERAGE-20260930/SR-LIVE-MAP-C114-COVERAGE-20260930-UNBLOCK-PLANNING-DECISION.md).
Keep the PR draft while those machine-truth writes are pending.

The parent retains all four gates: real Taiwan service-area decisions, real
fresh/stale/low-accuracy location observations, hosted browser map rendering,
and authorization/allowed-target enforcement. Provisioning, static source
review, successful negative tests, or this planning PR satisfy none of them.
New implementation validation must include valid supported issuance and
rejection of missing/revoked/mismatched bindings, inactive/mismatched workforce
membership, expired proofs and foreign driver identities. Persistence/restart
claims require the production repositories/schema on the authorized hosted
runner; a memory adapter cannot prove them.
