# SD-DP-20261006-001 Passenger Notification Channel Routing and Dormant First-Party Receiver

## Decision Record

- `decision_id`: `SD-DP-20261006-001`
- `title`: `Per-order frozen notification channel routing (partner webhook vs. first-party device push), plus a default-disabled first-party receiver backend`
- `owner`: `Human / system-design via accepted 2026-10-06 review`
- `date`: `2026-10-06`
- `status`: `accepted`
- `affected_docs`:
  - `docs/02-architecture/passenger-notification-channel-routing-20261006.md`
  - `docs/02-architecture/partner-notification-20260917/README.md`
  - `docs/02-architecture/partner-notification-20260917/01_system_sa_sd.md`
  - `docs/04-uat/system-remediation-20260906/schema-allocation.json`
- `old_wording_or_conflicting_anchor`:
  - `docs/02-architecture/partner-notification-20260917/01_system_sa_sd.md` line 24 ("`multi-taxi.module.ts` 仍綁 `WebPushTransport`") — superseded as a _current-state_ fact (the module now binds `PartnerNotificationTransport`); the decision text around it is not reopened.
  - `docs/02-architecture/partner-notification-20260917/01_system_sa_sd.md` §2 ("首版不新增第一方乘客 App") — **stays in force**; this decision does not reopen it.
- `superseding_decision`:
  - Every order's notification channel is frozen at order-creation time from a server-trusted source signal, never re-derived from a later session or device list. Partner-app-originated orders route to the partner webhook transport (`docs/02-architecture/partner-notification-20260917/01_system_sa_sd.md`, unchanged). A future first-party passenger app's orders would route to first-party device push (FCM). Orders with no app-identified source (phone, unattended voice, enterprise dispatch, partner-staff booking, inbound platform forwarding) are explicitly `no_notification_channel` — a designed non-delivery, not a fault, and not retried.
  - A dormant first-party push receiver (device registry, a parallel order-route snapshot table, FCM HTTP v1 transport) is specified at the data/service layer only, gated by `PASSENGER_PUSH_FIRST_PARTY_ENABLED` defaulting to `false`. No Firebase project, no APNs key, no secret, and no `deploy-dev.yml` change are introduced by this decision; no device ever receives a real push under this decision alone.
  - `SD-DP-20260422-001`'s bar — no first-party passenger login, booking, or receipt center — **is not reopened**. This decision only approves a default-off backend seam so that _if_ product strategy later ships a first-party app, the push-delivery half of that work does not start from zero. Opening the first-party passenger identity, login, and booking surface is a separate, future decision.
  - `01_system_sa_sd.md` §2's "不讓 DRTS 持有夥伴 APNs/FCM 憑證與 device token" refers to **the partner's own** APNs/FCM credentials and device tokens (DRTS must never hold the partner app's push credentials) — it does not conflict with DRTS holding _its own_ FCM credentials and _its own_ first-party device tokens once a first-party app actually exists. This decision clarifies that scope rather than changing it.
- `scope`:
  - notification-channel routing contracts (`packages/contracts/src/passenger-notification-channel.ts`)
  - two reserved migration numbers for first-party device registry, first-party order routing, and first-party delivery context tables
  - an annotation (not a rewrite) on the 2026-09-17 partner-notification SA/SD noting that its "current state" facts have moved on
- `out_of_scope`:
  - any first-party passenger identity, login, booking, or receipt UI
  - writing the `infra/migrations/*.sql` files for the two reserved numbers
  - implementing the channel router, the device registry service, or the FCM transport (separate downstream tasks: `PUSH-FIRST-PARTY-REGISTRY-20261006`, `PUSH-CHANNEL-ROUTER-20261006`, `PUSH-FIRST-PARTY-FCM-20261006`, `PUSH-CHANNEL-PG-QA-20261006`)
  - any change to the existing partner-webhook transport, its binding, endpoint governance, or retry policy (`01_system_sa_sd.md` is unchanged and remains authoritative there)
  - creating a Firebase project, requesting APNs keys, or touching `deploy-dev.yml`
  - SMS, CTI, or marketing push for `no_notification_channel` orders (a separate future product decision)
- `implementation_implications`:
  - downstream backend tasks must treat `mobility.phase1_order_partner_notification_routes` and the new `mobility.phase1_order_first_party_notification_routes` as mutually exclusive per `order_id`; finding both is `route_ambiguous` (manual_only), never a fanout
  - the existing outbox status enum (`pending/sending/delivered/failed`) and result enum (`delivered/provider_not_configured/provider_error`) are not extended; new semantics ride on `failureReason`/`retryDisposition`/`deliveryTarget`/`deliveryStage` exactly as `partner-passenger-notification.ts` already does, mirrored for the first-party case in the new contract
  - `PARTNER_NOTIFICATION_FAILURE_REASONS` and its retry-disposition map in `packages/contracts/src/partner-passenger-notification.ts` are not renamed, not extended with new values, and not edited by this decision's implementation
  - outbox remains the sole automatic-retry owner (`01_system_sa_sd.md` §8); the first-party transport must not run its own retry timer outside the outbox fence
  - the first-party device registry stores only `token_sha256` for lookups and logging; raw tokens are never logged or returned by any API
- `migration_tasks`:
  - reserve two sequential migration numbers in `docs/04-uat/system-remediation-20260906/schema-allocation.json` (`passenger_push_channel_allocations`), grouped by downstream owner, mirroring the `partner_notification_allocations` precedent from `SR-PARTNER-NOTIFY-CON-20260917`
  - leave the `infra/migrations/*.sql` files themselves to the downstream backend tasks that own each table's write path
- `completion_bar`:
  - the SD and this decision record cover D1–D8 of the channel-routing design, with an explicit statement that the first-party passenger app product decision is not reopened
  - `packages/contracts/src/passenger-notification-channel.ts` defines the channel constant, both route-snapshot shapes, the device record shape, new failure reasons and their retry dispositions, and the first-party delivery target/stage, without editing any existing partner contract file or enum value
  - the schema-allocation ledger reserves two collision-free, sequential migration numbers and the allocation guard test passes
- `rollback_or_revisit_conditions`:
  - product strategy explicitly decides to ship a first-party passenger app (identity, login, booking) — at that point `PUSH-FIRST-PARTY-REGISTRY-20261006`'s HTTP registration API, a first-party booking path, Firebase/APNs provisioning, and real-device acceptance all need their own follow-on work and sign-off; this decision does not pre-approve any of that
  - if a future design finds `no_notification_channel` orders should get SMS or another channel, that is a new decision, not an amendment to this one
- `approval`:
  - accepted for implementation-blueprint use after the 2026-10-06 human instruction to plan per-origin push routing and first-party app readiness and hand it to the supervisor/auto workers for execution

## References

- Source synthesis:
  - `docs/02-architecture/passenger-notification-channel-routing-20261006.md`
  - `/home/lupin/workspace/drts-fleet-platform/.local/passenger-push-channel-20261006/PUSH-CHANNEL-SD-20261006.md`
  - `/home/lupin/workspace/drts-fleet-platform/.local/passenger-push-channel-20261006/common.md`
- Related prior decisions:
  - `docs/01-decisions/SD-DP-20260422-001-phase1-entry-and-receipt-topology.md` (first-party passenger surface stays out of scope; this decision does not reopen it)
  - `docs/02-architecture/partner-notification-20260917/01_system_sa_sd.md` (authoritative for the partner-webhook transport this decision routes alongside, not over)
