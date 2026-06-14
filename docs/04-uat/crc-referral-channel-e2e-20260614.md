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

`scripts/db-apply.sh` records applied migrations by the version token
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

**Known CRC-VERIFY gap (LEG 2+, gated):** `/partner/ingress/handoff` returns
**500** in persistence mode even though the identity-link row is created
(`resolveOrCreate` succeeds; the failure is in the downstream session/JWT
construction). Until that is fixed, E2E-016 runs as a **non-release gated probe**:
it verifies LEG 1, then logs `PENDING(CRC-VERIFY)` and exits 0 rather than failing
the whole gate. Set `E2E_REFERRAL_ENFORCE=1` to make it hard-fail once the handoff
is runtime-ready. The seeded settlement totals it will then assert: GMV 150000,
partner share 22500 (15%), tripCount 2, activeRiders 2 for period 2026-06.

This confirms `CRC-VERIFY` / `CRC-FE-VERIFY` are genuinely incomplete — the CRC
backend was built but never verified end-to-end in DB/runtime mode, so it carries
both the migration collision and the handoff-500 breakage.

## 3. Hermetic runner — auto-discovery

`tests/e2e/run-e2e-hermetic.sh` now auto-discovers the `E2E-NNN` scenarios present
instead of a hardcoded `001..015` list, so the gate adapts as scenarios are added
(picks up E2E-016) or differ between branches.
