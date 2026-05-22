# Forwarder Sandbox Provider

Last updated: 2026-05-19
Status: implementation note for the generic forwarder repo-local harness

## Purpose

`forwarder_sandbox` is a non-production provider harness for forwarder flows.
It exists so `FWD-E2E-001` can exercise the full local mirror lifecycle without
real partner credentials, webhook secrets, or settlement files.

Evidence classification: `repo-local`.

This provider must never be presented as partner sandbox, live, or production
evidence.

## Scope

The sandbox harness covers these forwarder steps:

1. inbound order ingest
2. local eligibility + broadcast
3. driver accept relay
4. external result sync: `confirmed_by_platform`
5. external result sync: `lost_race`
6. external result sync: `cancelled_by_platform`
7. external result sync: `completed`
8. settlement sample via adapter `fetchEarnings()`

## Runtime shape

- Platform code: `forwarder_sandbox`
- Adapter implementation: `apps/api/src/modules/forwarder/sandbox.adapter.ts`
- Fixture source: `apps/api/src/modules/forwarder/sandbox.fixtures.ts`
- Adapter capability summary:
  - `mode=stub`
  - `productionStatus=stub`
  - inbound webhook supported for local harnessing
  - outbound accept/reject/complete calls acknowledge locally only

## Flow mapping

The sandbox provider reuses the existing forwarder API surface instead of adding
one-off sandbox-only endpoints.

### Inbound order

Use `POST /forwarder/orders/inbound` with
`platformCode=forwarder_sandbox`.

### Broadcast

Use `POST /forwarder/orders/:orderId/broadcast`.

Broadcast remains a local Forwarder Service responsibility. The sandbox adapter
does not own candidate filtering.

### Accept

Use `POST /forwarder/orders/:orderId/accept`.

The adapter returns an acknowledged stub result so the mirror can move to
`accept_pending` without partner credentials.

### Lost race / cancel / complete

Use `POST /forwarder/orders/:orderId/sync-status` with these native statuses:

- `lost_race`
- `cancelled_by_platform`
- `completed`

`completed` maps to local forwarded status `completed_synced` so the mirror can
represent a partner-completed order while keeping the external platform
authoritative.

### Settlement sample

Use `SandboxAdapter.fetchEarnings()` or the exported fixture sample for local
verification only. The returned payload is a stub settlement snapshot, not a
billing truth source.

## Fixture contract

`FORWARDER_SANDBOX_FIXTURES` exports stable samples for:

- inbound order payload
- broadcast candidate driver IDs
- accept driver ID
- confirmed sync payload
- lost-race sync payload
- cancelled sync payload
- completed sync payload
- reconciliation completion payload
- settlement sample payload

The intent is deterministic E2E setup, not realism. If partner-specific fields
are needed later, add them under the payload body without changing the sandbox
non-production posture.
