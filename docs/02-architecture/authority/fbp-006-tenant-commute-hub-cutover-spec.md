# FBP-006 `tenant-commute-hub` Cutover And Authority Deletion Spec

Status: execution artifact and verification record for `FBP-006`; read together with `RGX-010` for the historical split-state evidence trail
Owner: Codex  
Reviewer: Claude  
Updated: 2026-04-23

Primary citations:

- `docs/02-architecture/consensus/phase2-full-blueprint-planning-20260415/consensus-packet.md` §§3.2, 5
- `docs/02-architecture/consensus/phase2-full-blueprint-planning-20260415/backlog-proposal.md` §`FBP-006`
- `docs/02-architecture/authority/rgp-002-authority-map.md` §§2, 4, 5
- `docs/02-architecture/authority/rgx-010-tenant-commute-hub-authority-annex-audit-20260422.md`
- `docs/02-architecture/tenant-commute-hub-boundary.md` §§1–5
- `docs/02-architecture/authority/fbp-005-tenant-bff-parity-matrix.md` §§2, 5, 6
- `phase1_service_contracts_v1.md` §3.2
- `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/03_api_examples_and_error_contracts.md` §§3.2, 3.18, 3.19

## 1. Purpose

This spec records the executed cutover of the external tenant UI repo (`tenant-commute-hub`) to `drts-fleet-platform` BFF authority.

It does four things:

1. freezes the canonical page inventory to be migrated
2. maps each tenant page to its target `/api/tenant/*` endpoint(s), auth model, and envelope/error expectations
3. lists the exact authority-bearing behavior that must be deleted or disabled from repo B
4. defines the verification gate that proves repo B is a pure UI consumer

This workspace **does** contain a local checkout of `../tenant-commute-hub`, and `FBP-006` was executed there on 2026-04-15. The cutover and deletion checklist below is therefore both the contract and the local execution record.

Historical note on `2026-04-22`:

- the original annex audit captured a real split state: the local workspace was
  aligned with the BFF cutover direction recorded here, while clean GitHub
  `origin/main` was still Supabase-first
- `RGX-010` preserves that historical comparison and should be read as an audit
  snapshot, not as the current remote-baseline truth

Additional addendum on `2026-04-23`:

- the cutover has now been merged into `tenant-commute-hub` remote `main`
  through `ajoe734/tenant-commute-hub#1`
- the backend/client compatibility fixes needed by that landing are now merged
  into `drts-fleet-platform` remote `main` through
  `ajoe734/drts-fleet-platform#1`
- live cross-repo smoke now passes against the tenant landing branch plus a
  local `drts-api` server
- remote baseline truth for the cutover is now closed by merge, although the
  backend merge required explicit owner risk acceptance because GitHub CI still
  showed unrelated clean-branch debt outside the touched files

Additional addendum on `2026-04-24`:

- the remaining tenant identity-hardening slice is now merged into
  `tenant-commute-hub` remote `main` through `ajoe734/tenant-commute-hub#3`
- the companion backend auth alignment patch is now merged into
  `drts-fleet-platform` remote `main` through
  `ajoe734/drts-fleet-platform#12`
- remote baseline truth is now stronger than the original cutover landing:
  tenant bootstrap is email-only, the backend owns role/scopes resolution, and
  repo B no longer carries `localStorage` session restore or fallback role
  derivation on `main`

Additional addendum on `2026-04-25`:

- `tenant-commute-hub` standalone builds still prefer the live sibling
  `drts-fleet-platform` checkout when available, but the fallback
  `@drts/contracts` path is now a managed snapshot synced from the core repo
  instead of a hand-maintained drift-prone shim
- this closes the most visible remaining package-portability maintenance debt
  without reopening tenant authority ownership: repo B still consumes the core
  contract surface, and the fallback is refreshed from that source of truth

## 2. Core-Repo Gate Closed Before External Cutover

`FBP-005` left two core-repo BFF gaps that blocked clean repo B cutover. `FBP-006` closes them in `drts-fleet-platform` so repo B no longer needs local fallbacks:

| Gap from `FBP-005` freeze       | Core-repo target                       | `FBP-006` posture |
| ------------------------------- | -------------------------------------- | ----------------- |
| webhook metadata update missing | `POST /api/tenant/webhooks/:webhookId` | implemented       |
| tenant role catalog missing     | `GET /api/tenant/roles`                | implemented       |

Result: repo B no longer needs a local fixed role enum or any out-of-band webhook metadata mutation path.

## 3. Canonical Page Inventory For Repo B

The repo B page inventory below reflects the actual routed pages now present in `tenant-commute-hub`. Any extra page in repo B that is not listed below fails the release gate until it is annex-audited and mapped.

| Canonical tenant page            | Expected repo B route(s)                             | Target BFF endpoint(s)                                                                                                                                                                                                                                                          | Auth / headers                                                                          | Success / error contract                                                                                 | Forbidden local authority to delete                                                                                                                            |
| -------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant home / dashboard          | `/`                                                  | `GET /api/identity/context`, `GET /api/tenant/bookings`, `GET /api/tenant/passengers`, `GET /api/tenant/addresses`, `GET /api/tenant/reports/jobs`, `GET /api/tenant/api-keys`, `GET /api/tenant/webhooks`, `GET /api/tenant/invoices`, `GET /api/tenant/audit`                 | `X-Request-Id`; tenant identity headers via shared `@drts/api-client` bootstrap session | Standard `data/meta` envelope only                                                                       | Any direct Supabase profile read, local dashboard truth, or home-grown tenant summary tables                                                                   |
| Booking create                   | `/bookings/new`                                      | `POST /api/tenant/bookings`                                                                                                                                                                                                                                                     | `Authorization`; `X-Request-Id`; `Idempotency-Key`                                      | Success `data.booking_id/...`; errors via canonical error envelope                                       | Any direct insert into booking/order tables; any local state-machine mutation                                                                                  |
| Booking list                     | `/booking-list`                                      | `GET /api/tenant/bookings`                                                                                                                                                                                                                                                      | `Authorization`; `X-Request-Id`                                                         | List reads `data.items[] + data.page_info`; no custom unwrap                                             | Any Supabase list query, client-side status derivation, or owned-route fallback                                                                                |
| Booking detail / update / cancel | `/booking-list/[bookingId]`                          | `GET /api/tenant/bookings/:bookingId`, `PUT /api/tenant/bookings/:bookingId`, `POST /api/tenant/bookings/:bookingId/cancel`                                                                                                                                                     | `Authorization`; `X-Request-Id`; `Idempotency-Key` for commands                         | Command success/error must follow canonical envelopes; UI must not infer success from HTTP status alone  | Any direct status patch, local cancel rule, or client-derived booking lifecycle                                                                                |
| Passenger directory              | `/passengers`                                        | `GET /api/tenant/passengers`, `POST /api/tenant/passengers`                                                                                                                                                                                                                     | `Authorization`; `X-Request-Id`; `Idempotency-Key` for writes                           | List envelope + command envelope                                                                         | Any local passenger truth table, Supabase CRUD, or local dedupe rule treated as authority                                                                      |
| Address book                     | `/addresses`                                         | `GET /api/tenant/addresses`, `POST /api/tenant/addresses`                                                                                                                                                                                                                       | same as passengers                                                                      | same as passengers                                                                                       | Any direct address-book table writes or local geo truth                                                                                                        |
| Reports                          | `/reports`                                           | `GET /api/tenant/reports/jobs`, `POST /api/tenant/reports/jobs`, `GET /api/tenant/reports/:jobId`                                                                                                                                                                               | `Authorization`; `X-Request-Id`; `Idempotency-Key` for job creation                     | Job list/detail uses canonical envelope; artifact download uses backend-signed URL only                  | Any local report-runner, background job, CSV builder, or direct artifact bucket access                                                                         |
| API keys                         | `/api-keys`                                          | `GET /api/tenant/api-keys`, `POST /api/tenant/api-keys`, `POST /api/tenant/api-keys/:apiKeyId/rotate`, `POST /api/tenant/api-keys/:apiKeyId/revoke`                                                                                                                             | `Authorization`; `X-Request-Id`; `Idempotency-Key` for commands                         | Plaintext key shown only on issue/rotate response; list remains masked                                   | Any local secret generation, storage, or revoke/rotate logic                                                                                                   |
| Webhooks                         | `/webhooks`                                          | `GET /api/tenant/webhooks`, `POST /api/tenant/webhooks`, `POST /api/tenant/webhooks/:webhookId`, `POST /api/tenant/webhooks/:webhookId/rotate-secret`, `POST /api/tenant/webhooks/test`, `GET /api/tenant/webhooks/:webhookId/deliveries`, `GET /api/tenant/notifications/feed` | `Authorization`; `X-Request-Id`; `Idempotency-Key` for command calls                    | Endpoint lists use canonical list envelope; update path mutates metadata only; delivery log is read-only | Any Supabase webhook table, edge-function delivery code, local retry loop, local signing/verification secret store, or custom webhook event payload generation |
| Billing                          | `/billing`                                           | `GET /api/tenant/billing/profile`, `POST /api/tenant/billing/profile`, `GET /api/tenant/invoices`, `GET /api/tenant/invoices/:invoiceId`, `POST /api/tenant/invoices/generate`                                                                                                  | `Authorization`; `X-Request-Id`; `Idempotency-Key` for generate/update                  | Amounts and artifact URLs come from backend only                                                         | Any local amount calculation, invoice PDF generation, or status mutation                                                                                       |
| Notifications                    | `/notifications`                                     | `GET /api/tenant/notifications`, `POST /api/tenant/notifications`, `GET /api/tenant/notifications/feed`                                                                                                                                                                         | `Authorization`; `X-Request-Id`; `Idempotency-Key` for update                           | Canonical envelope; UI must submit canonical event/channel values; notification feed remains read-only   | Any local subscription truth or notification state not backed by API                                                                                           |
| SLA profile                      | `/sla`                                               | `GET /api/tenant/sla`, `POST /api/tenant/sla`                                                                                                                                                                                                                                   | `Authorization`; `X-Request-Id`; `Idempotency-Key` for update                           | Canonical envelope                                                                                       | Any local threshold truth or local breach rules treated as authoritative                                                                                       |
| Users                            | `/users`                                             | `GET /api/tenant/users`, `GET /api/tenant/roles`, `POST /api/tenant/users`, `POST /api/tenant/users/:userId/role`                                                                                                                                                               | `Authorization`; `X-Request-Id`; `Idempotency-Key` for invite/update                    | `GET /api/tenant/roles` is the only assignable role catalog; UI must not ship a fixed enum               | Any hard-coded role list, local role mutation rule, or cross-tenant user truth                                                                                 |
| Audit trail                      | `/audit`                                             | `GET /api/tenant/audit`                                                                                                                                                                                                                                                         | `Authorization`; `X-Request-Id`                                                         | List envelope only; read-only                                                                            | Any local audit writer, audit mutation, or using audit as control-plane truth                                                                                  |
| Legacy route redirects           | `/dashboard`, `/bookings`, `/admin`, `/cost-centers` | no direct data path; browser redirect only                                                                                                                                                                                                                                      | n/a                                                                                     | Redirects land on canonical routes only                                                                  | Any surviving page implementation behind those legacy paths                                                                                                    |

## 4. Repo B Deletion / Disable Checklist

The following artifacts must be removed or explicitly disabled in `tenant-commute-hub` before calling cutover complete:

1. Supabase direct reads/writes for tenant users, bookings, passengers, addresses, webhooks, billing, reports, or audit.
2. Edge functions or serverless handlers that create tenant-facing truth outside `drts-fleet-platform`.
3. Any local webhook secret storage, signature generation, retry scheduler, or webhook payload publisher.
4. Any local API key minting, revoke, rotate, or plaintext secret persistence.
5. Any fixed tenant role enum used for writes; role pickers must bind to `GET /api/tenant/roles`.
6. Any client-side billing, invoice, statement, or fee computation treated as canonical.
7. Any client-side booking / dispatch lifecycle mutation that bypasses the BFF command path.
8. Any local report generation or direct artifact-bucket access not mediated by backend signed URLs.
9. Any repo B environment variables or secrets that imply repo-owned backend authority for the above surfaces.

If a repo B module still needs one of those capabilities for local development, it must be feature-disabled and unreachable in production builds.

Local execution status on 2026-04-15:

- deleted `src/integrations/supabase/*`
- deleted repo B `supabase/functions/*` and `supabase/migrations/*`
- deleted the unused `src/pages/CostCenterManagement.tsx` authority page
- removed `@supabase/supabase-js` from repo B dependencies
- rewired `/api-keys`, `/webhooks`, `/billing`, `/notifications`, `/sla`, and `/users` to shared `@drts/api-client` BFF calls only

## 5. Consumer Rules That Repo B Must Preserve

These are the non-negotiable runtime rules during and after cutover:

- All JSON wire payloads remain `snake_case`.
- All success responses are parsed as `data/meta`; lists are parsed as `items[] + page_info`.
- All canonical enum values are passed through exactly; display labels stay display-only.
- All POST command calls carry `Idempotency-Key`.
- Signed downloads are consumed as returned; repo B must not cache or regenerate them.
- Repo B must treat `drts-fleet-platform` error codes as authoritative instead of replacing them with local business outcomes.

## 6. Verification Gate For `FBP-006`

`FBP-006` verification status in the local `../tenant-commute-hub` checkout:

1. Passed: every production tenant page listed in §3 is now routed through shared `@drts/api-client` calls to `drts-fleet-platform`.
2. Passed: `rg -n "integrations/supabase|supabase\\." src package.json supabase` returns no matches.
3. Passed: repo B authority-bearing Supabase client code, functions, migrations, and cost-center page were deleted per §4.
4. Passed: `npm run build` succeeds in `../tenant-commute-hub`.
5. Passed with warnings: `npm run lint` succeeds; only pre-existing non-blocking warnings remain (`MapPicker` hook deps and several `react-refresh/only-export-components` notices in shared UI helpers).
6. Passed: `pnpm test:unit` and `pnpm exec vitest run tests/unit/client-integration.test.ts tests/unit/tenant-partner-foundation.test.ts` succeed in `drts-fleet-platform`.
7. Known script caveat: `pnpm test -- --runTestsByPath ...` is **not** a valid targeted invocation in this monorepo because Turbo forwards the Jest-style flag into workspace `vitest` commands.
8. Historical clean remote-main gap from the `2026-04-22` `RGX-010` snapshot:
   at audit time GitHub `origin/main` still carried Supabase auth and
   authority-bearing flows, so this `FBP-006` state had not yet landed as
   remote baseline truth.
9. Historical identity note from `RGX-010`: even in the original cutover
   workspace, repo B still carried local bootstrap session / role derivation
   behavior, so the stricter "pure consumer" posture was not yet true at that
   earlier snapshot.
10. Passed locally on `2026-04-23`: targeted live cross-repo smoke through the
    tenant landing branch and local `drts-api` completed for identity, users,
    passengers, addresses, bookings, API keys, notifications, webhooks, SLA,
    billing, audit, and reports.
11. Completed delivery path on `2026-04-23`: PR
    `ajoe734/tenant-commute-hub#1` merged the tenant cutover landing set to
    remote `main`.
12. Completed compatibility path on `2026-04-23`: PR
    `ajoe734/drts-fleet-platform#1` merged the shared-client response
    normalization and webhook-test route-order fix required by the live smoke
    to remote `main`.
13. Merge-risk note: the core-repo merge happened with explicit owner risk
    acceptance because GitHub CI on the clean branch still failed in unrelated
    files outside this cutover patch.
14. Completed follow-on on `2026-04-24`: PR
    `ajoe734/tenant-commute-hub#3` removed local bootstrap session persistence,
    local role derivation, and fallback role selection from remote `main`,
    while PR `ajoe734/drts-fleet-platform#12` aligned the backend-issued tenant
    bootstrap session truth to that posture.

## 7. Handoff Notes

- This doc is the canonical external-repo handoff for `FBP-006A` through `FBP-006D`.
- `FBP-007` verification gate is already passed on remote `main`; any remaining
  action around `apps/tenant-portal-web` is now legacy-shell cleanup, not a
  tenant cutover blocker.
- If repo B implementation discovers a missing tenant BFF surface beyond the two gaps closed here, reopen the issue as a new core-repo authority task instead of inventing local repo B authority.
