# SR-PARTNER-NOTIFY-TRANSPORT-20260918 — owner verification

Owner: Codex2. Reviewer: Codex. Date: 2026-09-19.
Base: `b78bd431da92f042e52e21c99f5965eeadf2f664` (SEQ merged).
The review candidate is the final pushed SHA recorded by `ai-status.sh handoff`.

## Implementation

Design authority: `docs/02-architecture/partner-notification-20260917/01_system_sa_sd.md` §§7–9, 12, with routing/privacy/expiry rules from §§3–6.

- `MultiTaxiModule` explicitly configures `transportMode=partner_webhook`. Its transport is `PartnerNotificationTransport`; WebPushTransport and PassengerDeviceResolver are no longer bound in this module. Existing subscription storage APIs remain compatible.
- Adapter partner mode bypasses device lookup and the generic HTTP/synthetic-receipt path. Generic availability is false without a route; `isAvailableFor(message)` checks the durable route, binding, identity, endpoint readiness and current trip relevance.
- The narrow tenant façade resolves the original entry/tenant/partner/identity and exact binding endpoint. No tenant fanout, recipient guessing or retry retargeting. Missing routing, revoked identity, owner changes, endpoint rotation and disabled/unvalidated configuration retain typed reasons.
- Before IO, V0105 stores immutable delivery ID, original event sequence, allowlisted payload, stable serialized-byte hash, route/binding/endpoint identity, expiry and approved retry policy snapshot. The policy column implements §8 alongside the V0105 allocation. Content immutability is also enforced by a DB trigger. JSON key ordering remains stable after PostgreSQL jsonb readback.
- The consumer claim re-reads the durable outbox under lock, reserves the attempt before IO, and checks current status/due time/disposition. Selection excludes live claims and nonautomatic outcomes; expired contexts are prioritized for one terminal outcome, with expiry checked again before any HTTP send. A recovered unknown fifth attempt cannot reserve/send a sixth.
- Exactly one façade call/HTTP attempt per eligible `send`. Backoff/maxAttempts use the saved endpoint policy; no consumer fallback to the legacy 60-second rule. Tenant restart recovery, timers and manual retry cannot resend passenger events. No new retry timer was introduced.
- Both success and typed failure write receipt, delivery context, outbox outcome/metadata and claim release in the existing fence transaction. Partner writes require the current unexpired lease. A failed DB commit or stale fence throws persistence-unknown; retries reuse delivery ID/payload and can accept the partner's original duplicate receipt.
- Only validated 200/201/202 accepted/duplicate acknowledgements set `partner_accepted`. `providerMessageRef` is the actual partner receipt ID; `deliveredAt` is local validation time; downstream remains `unknown`. Invalid 2xx responses are also failed in the tenant delivery log.
- Partner HTTP uses HTTPS, socket-time public-address DNS validation, no redirects, a platform deadline capped at 10 seconds including body consumption, and a 4 KiB response limit. Ordinary webhook mode retains its status-only transport behavior.
- No order cancellation, dispatch rollback or SOS behavior changes. The original four outbox states and three delivery-result values remain unchanged.

Missing route/binding cannot satisfy the immutable context's non-null foreign keys. These early failures therefore keep companion metadata under `outbox.payload.partnerNotification` in the same fence transaction. Once a context exists, its outcome columns and that metadata update together. Exhausted retry budgets use `provider_transient_error` with `retryDisposition=terminal`; no new enum value is invented.

## Executed checks

- API typecheck: passed (`pnpm --filter @drts/api typecheck`), after building contracts and control-plane-auth.
- Root/test typecheck: passed (`pnpm exec tsc -p tsconfig.json --noEmit`).
- Scoped ESLint and Prettier: passed.
- Scoped Vitest: **240 passed, 14 skipped**, 19 suites passed and 2 skipped. The command covered these directories under `tests/unit/system-remediation/`:
  - `sr-partner-notify-{transport-20260918,ack-20260917,route-20260917,con-20260917,seq-20260918}`
  - `sr-push-{durability-20260911,001,webpush-20260915}`
  - `sr-webhook-transport-timeout-20260911`
  - `sr-qa-webhook-001/sr-qa-webhook-001.test.ts` (existing C111–C115 unit regression)
- New transport suites: **57 passed**. Cases include partner enqueue then timeout/duplicate ack, ack then DB failure, competing workers, lease expiry, exact five-attempt bound, policy changes, payload reuse/privacy, real receipt/time, expired/obsolete/superseded events, missing configuration, tenant ownership/revocation, invalid ack/HTTP failure classes, restart/manual retry exclusion, fence rollback and HTTPS/DNS/body/deadline restrictions.
- The CON allocation test was updated because its old “V0105 not written yet” assertion is superseded by this task's allocated migration; it now verifies the reserved filenames exist exactly once.

## PostgreSQL and external evidence still required

The 14 skips are seven existing SEQ and seven new TRANSPORT PostgreSQL cases. Neither external database URL was configured. No product server, PostgreSQL server or Docker infrastructure was started on the worker VM.

To run the new real transaction/catalog gate against an authorized **external test database** with CREATE DATABASE permission:

```bash
PARTNER_NOTIFY_TRANSPORT_TEST_DATABASE_URL='<external-test-database-url>' \
  pnpm exec vitest run tests/unit/system-remediation/sr-partner-notify-transport-20260918/transport.postgres.test.ts
```

The gate creates and removes only its own random test database, applies the actual V0056 outbox DDL and V0099/V0104/V0105 migrations, and checks concurrency, immutable context, atomic receipt/outcome/release, expired fences, rollback, final-attempt recovery, due selection and matching FK types.

V0105 has not been applied to a shared environment by this worker. Apply it before enabling this code there. Unit HTTP evidence uses an injected in-process receiver/socket double; it is not live partner HTTPS/device evidence. CI, independent review, merge, external PostgreSQL verification and the named acceptance gates remain candidate lifecycle responsibilities. No `done` or live/pilot delivery claim is made here.
