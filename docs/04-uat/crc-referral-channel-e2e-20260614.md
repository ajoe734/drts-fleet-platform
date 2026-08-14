# CRC Third-Party Referral Channel — E2E-016 + findings (2026-06-14)

Adds `tests/e2e/E2E-016-referral-channel.sh` for the community-app referral
channel (`drts_pays_partner`) and fixes a migration-version collision found while
wiring it up.

## 1. Migration version collision (regression fix)

`infra/migrations/` contained **two `V0030` migrations**:

- `V0030__partner_user_identity_link_persistence.sql` (creates
  `admin.phase1_partner_user_identity_links`) — pre-existing on `dev`.
- `V0030__feature_flags_tenant_override_constraint_fix.sql` — added by
  PR #701 (E2E-ALLLINE-VERIFY).

`operations/database/db-apply.sh` records applied migrations by the version token
(`V0030`) parsed from the filename and skips any version already recorded. The
feature-flags file sorts first, applies, records `V0030`, and the
partner-user-identity-link file is then **silently skipped** — so its table is
never created on a fresh migrate. That breaks the referral handoff
(`/partner/ingress/handoff`) in persistence mode.

**Fix:** rename the feature-flags migration to `V0031`, freeing `V0030` for the
identity-link migration. Verified on a fresh DB: both `V0030`
(`phase1_partner_user_identity_links`) and `V0031` (feature-flags partial unique
indexes) now apply; E2E-005/006/007 still pass.

> Note for already-migrated databases that recorded `V0030` from the
> feature-flags file before this rename: they have feature-flags applied but are
> missing the identity-link table. They need the identity-link DDL re-applied
> (it is `CREATE TABLE IF NOT EXISTS`, safe to run). Fresh environments and CI
> are fully fixed by the rename.

## 2. E2E-016 — referral channel scenario

Chain: Platform Admin (referral_channel entry + 15% revenue-share rule) →
Partner Ingress s2s handoff (durable partnerUserRef → drtsPassengerId) →
partner-scoped referral reads (statements/usage/revenue/dashboard) → referral
settlement (`partner_referral` / `drts_pays_partner`).

**Verified working today (LEG 1):** the seeded `referral-demo-community`
referral_channel entry resolves and exposes its active 15% percent revenue-share
rule settling `partner_referral` / `drts_pays_partner`.

**RESOLVED — handoff now runtime-verified.** The earlier `/partner/ingress/handoff`
500 was a SQL bug in `PartnerUserIdentityLinkRepository.touchLastSeen`: parameter
`$3` was used both as `timestamptz` (`last_seen_at = $3`) and as `text`
(`to_jsonb($3::text)`), so Postgres deduced inconsistent types for `$3` and
errored on every handoff. Fixed by casting the column assignments
`$3::timestamptz`. A second issue was test-side: the partner referral portal reads
require the **channel partner** identity (actorType=partner_api_key, realm=partner,
matching tenantId/partnerId/partnerProgramId/partnerEntrySlug), not the handoff
passenger bearer. E2E-016 LEG 3 now presents that identity.

E2E-016 is now a **hard scenario** (no longer gated): it verifies the full chain
end to end — referral entry + 15% rule, durable s2s handoff binding, and the
partner settlement reads asserting GMV 150000 / share 22500 / tripCount 2 /
activeRiders 2 for 2026-06.

## Separately discovered: E2E-008 is red on current dev (not fixed here)

While running the suite, `E2E-008-partner-booking-cutover` fails on current dev for
reasons unrelated to the referral channel: (a) `/auth/partner/bootstrap-session`
now returns `access_token` (snake_case) while the scenario reads `.data.accessToken`
(camelCase, no fallback); and (b) the partner-scope check was tightened to also
enforce tenant, but the bank entry's `tenant_id` is now `tenant-demo-001` while the
scenario sends the UUID `E2E_SEED_TENANT_ID`. This makes the ci-integ `e2e` gate red
on dev for E2E-008 and needs a separate fix (mirror the E2E-016 LEG 3 identity
pattern + tolerant casing).
This confirmed `CRC-VERIFY` was genuinely incomplete — the CRC backend was built
but never verified end-to-end in DB/runtime mode, so it carried
both the migration collision and the handoff-500 breakage.

## 3. Hermetic runner — auto-discovery

`tests/e2e/run-e2e-hermetic.sh` now auto-discovers the `E2E-NNN` scenarios present
instead of a hardcoded `001..015` list, so the gate adapts as scenarios are added
(picks up E2E-016) or differ between branches.
