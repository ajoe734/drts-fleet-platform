# FWD-LIVE-001 Provider Proof

- Task: `PH1GC-FWD-001`
- Owner: `Codex`
- Reviewer: `Codex2`
- Date: `2026-05-22`
- Workflow family: `WF-FWD-001`
- Current gate read: `PASS (repo-local)`
- Provider target: `forwarder_sandbox`
- Provider classification: `repo-local harness`

## 1. Scope

This packet satisfies the directive-`§D` proof structure for `WF-FWD-001`
without re-labelling the repo-local `forwarder_sandbox` harness as a partner
sandbox. All proof items below are repo-local. None are claims about Grab
Taiwan or another live external provider.

## 2. Directive §D Proof Items

### 2.1 Platform name + classification

- Platform code: `forwarder_sandbox`
- Classification: `repo-local harness`
- Source anchors:
  `packages/contracts/src/platform-codes.ts`,
  `apps/api/src/modules/forwarder/sandbox.fixtures.ts`,
  `docs/02-architecture/forwarder-sandbox-provider.md`
- Important qualifier:
  the capability summary marks the provider `mode=stub` and
  `productionStatus=stub`, so this packet cannot be read as partner sandbox
  evidence.

### 2.2 Masked credential ref

- Credential reference: `N/A — no external credential class`
- Current auth state:
  `credentialStatus=stub`, `authStatus=stub`, `webhookStatus=stub`
- Source anchors:
  `apps/api/src/modules/forwarder/sandbox.adapter.ts`,
  `apps/api/src/modules/forwarder/sandbox.fixtures.ts`
- Important qualifier:
  because the provider is repo-local, there is no secret path, secret version,
  or masked partner token to disclose. This item is satisfied only as a
  repo-local stub-state record.

### 2.3 Inbound order sample

- Proof path:
  `tests/e2e/E2E-002-forwarded-order.sh` Leg 1 creates a deterministic inbound
  payload, posts it to `POST /forwarder/orders/inbound`, captures the returned
  `mirrorOrderId`, then confirms the mirror row is visible as `broadcasted`.
- Fixture anchors:
  `tests/e2e/E2E-002-forwarded-order.sh`,
  `apps/api/src/modules/forwarder/sandbox.fixtures.ts`

### 2.4 Accept sample

- Proof path:
  `tests/e2e/E2E-002-forwarded-order.sh` Leg 3 posts
  `POST /driver/forwarded-orders/:taskId/accept` and requires
  `outcome=accept_pending`.
- Companion unit coverage:
  `apps/api/tests/unit/forwarder.service.test.ts` verifies that
  `relayDriverAccept()` calls the adapter and preserves the order in
  `accept_pending`.

### 2.5 Lost-race sample

- Proof path:
  `apps/api/tests/unit/forwarder.service.test.ts` verifies that
  `syncNativeStatus(... nativeStatus="lost_race")` closes mirrored driver tasks
  and preserves the forwarded order in terminal `lost_race` state.
- Companion fixture:
  `apps/api/src/modules/forwarder/sandbox.fixtures.ts` exports
  `lostRaceSync`.

### 2.6 Cancel sample

- Proof path:
  `tests/e2e/E2E-002-forwarded-order.sh` Leg 4 creates a second forwarded
  mirror, accepts it, then syncs it to `cancelled_by_platform` and verifies the
  driver view reflects the cancelled terminal state.

### 2.7 Complete sample

- Proof path:
  `tests/e2e/E2E-002-forwarded-order.sh` Leg 3 syncs the primary mirror to
  `completed`, requires local status `completed_synced`, and verifies the
  driver task view reflects the completed terminal state.
- Companion unit coverage:
  `apps/api/tests/unit/forwarder.service.test.ts` maps the sandbox
  `completedSync` fixture into a `completed_synced` local status with the
  settlement reference preserved in the authoritative snapshot.

### 2.8 Settlement sample

- Proof path:
  `tests/e2e/E2E-002-forwarded-order.sh` Leg 5 verifies the settlement matrix
  exposes `channelKey=forwarded_shadow` with `localLedgerMode=shadow_only`.
- Fixture anchors:
  `apps/api/src/modules/forwarder/sandbox.fixtures.ts` exports the settlement
  sample payload and `SandboxAdapter.fetchEarnings()` returns it for local
  verification.
- Important qualifier:
  this is a repo-local settlement sample, not a partner settlement file or live
  payout statement.

### 2.9 No-owned-assignment proof

- Proof path:
  `tests/e2e/E2E-002-forwarded-order.sh` Leg 5 queries `GET /dispatch/tasks`
  and fails if either forwarded mirror order appears to have an owned
  `dispatchJobId`.
- Assertion outcome:
  the script records `ownedDispatchAssignmentCreated=false`.

### 2.10 Replay / idempotency proof

- Proof path:
  `apps/api/tests/unit/forwarder.service.test.ts` verifies inbound ingestion is
  idempotent by `(platformCode, externalOrderId)` and reuses the same
  `mirrorOrderId` instead of duplicating the forwarded order.
- Important qualifier:
  this is repo-local replay protection coverage, not a signed replay denial
  sample from an external provider.

### 2.11 Signature proof

- Failure-path coverage:
  `apps/api/tests/unit/forwarder.service.test.ts` verifies that webhook
  verification failures return
  `FORWARDER_WEBHOOK_VERIFICATION_FAILED`, create no mirror order, and degrade
  adapter health with `webhookStatus=failing`.
- Repo-local verification state:
  `apps/api/src/modules/forwarder/sandbox.adapter.ts` returns
  `accepted=true` with `credentialStatus=stub`, `authStatus=stub`, and
  `webhookStatus=stub`.
- Important qualifier:
  this is explicit stub verification behavior. It is not a real HMAC sample,
  timestamp-window proof, or partner-issued signature transcript.

## 3. Non-claim Summary

- This packet does not prove a real partner sandbox exists.
- This packet does not provide a masked real credential reference because the
  provider has no external credential class.
- This packet does not remove `EXT-002-BLK-001` through `EXT-002-BLK-007` for
  Grab Taiwan or any equivalent real adapter.
- The correct release language is `PASS (repo-local)` for `WF-FWD-001`, with
  live partner evidence still external-gated.
