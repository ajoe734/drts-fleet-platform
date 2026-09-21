# UAT: SR-PARTNER-NOTIFY-NAV-20260917

## Scope

Validate the partner notification navigation resolution API and embed BFF redirection logic.

## Delivery history (why this SHA exists)

This task went through 10+ owner/reviewer rounds (Gemini, Gemini2, Claude2 as owners;
Codex/Codex2 as reviewer) between 2026-09-19 and 2026-09-21. From `codex-20260920T081829Z`
onward, every reviewer rejection was a **delivery-gate failure**: the owner's candidate
commit existed only in a local worktree and was never reachable on `origin` (no matching
branch/PR head), so the reviewer could not perform product review at all. The last owner
(Gemini2) produced a locally-committed, properly-trailered candidate
`f0790ab1065e152422cd05ce5b44011fc0ff338c` (parent `8c61b5752`, current `dev` tip at the
time) that could not be pushed from its sandbox (`gh auth status` not logged in), and
yielded with an explicit blocker asking for this exact SHA to be published.

Claude2 (this owner) verified `f0790ab1...338c`'s diff against `dev` file-by-file with
`git show <sha>:<path>`, ported it into this worktree, found and fixed one additional
correctness regression in it (below), and is publishing the result as the candidate for
this handoff. **The published candidate SHA on this branch is therefore a new commit with
a different SHA than `f0790ab1...338c`** — see `git log` on this branch — because of that
additional fix; the file scope and every other change are identical to `f0790ab1...338c`.

## Additional fix made in this candidate (beyond f0790ab1...338c)

`f0790ab1...338c` fixed `apps/api/src/modules/owned-mobility/owned-mobility.service.ts`
`getReferralPassengerActiveTrip` / `listReferralPassengerHistory` (~line 13602, 13670) to
require `o.tenantId === identity.tenantId` in addition to the existing
partnerId/partnerProgramId/entrySlug/passengerId match, closing the cross-tenant/partner
read Codex2 flagged in `49b04f06...` finding #2.

That fix is correct for tenant-bound orders, but **multi-taxi orders always have
`tenantId: null`** (`buildAndPersistMultiTaxiRide`, ~line 1137: `tenantId: null,` — see
comment at `multi-taxi.service.ts:506-509`: "multi-taxi standard-taxi orders are
tenant-less by design"), while `identity.tenantId` for a referral-passenger session is
always a real tenant (`PartnerChannelEntryRecord.tenantId: string`, non-nullable —
`packages/contracts/src/index.ts:1152`). So `o.tenantId === identity.tenantId` is
`null === "<real-tenant>"`, which is **always false** for every multi-taxi order — this
candidate would have permanently broken the click-through-to-active-trip flow for the
multi-taxi case, which is the primary flow this task exists to fix
(`navigation_reads_current_trip_without_creating_orders` would fail for every multi-taxi
referral passenger).

Fix applied here: treat `o.tenantId === null` as "skip the tenant check, rely on the
already-present partnerId/partnerProgramId/entrySlug/passengerId match" instead of
requiring equality. This restores the legitimate multi-taxi read path while keeping every
demonstrated Codex2 PoC blocked (wrong partner, wrong partnerProgramId, wrong entrySlug,
wrong passenger all still rejected).

**Known residual gap, not closed by this fix or by `f0790ab1...338c`:** if a partner entry
is reassigned to a *different tenant while keeping the same partnerId*, a pre-existing
null-tenant multi-taxi order for that entry/passenger remains visible under the
new-tenant identity, because multi-taxi orders don't record the tenant that was active at
creation time — only `mobility.phase1_order_partner_notification_routes` (new in this
candidate, used by `resolvePartnerNotificationNavigation`) freezes that. Closing this
fully would require `getReferralPassengerActiveTrip`/`listReferralPassengerHistory` to
consult that frozen-route table, which requires making them `async` — out of scope here
because their only caller, `apps/api/src/modules/owned-mobility/owned-mobility.controller.ts`,
is **not** in this task's `write_scopes`. Flagging this explicitly rather than claiming it
is fail-closed; `docs/02-architecture/partner-notification-20260917/01_system_sa_sd.md:147`
documents that entry-tenant reassignment is supposed to pause/require review, which this
narrow case does not yet do.

## Acceptance Criteria

### 1. entry_scoped_navigation_denies_cross_subject_tenant_entry

- **Scenario:** Partner backend calls `POST /api/partner/entries/{entrySlug}/notification-navigation/resolve` with a valid `rideRef` but a mismatched `partnerUserRef` or wrong `entrySlug`.
- **Expected:** API returns 403 Forbidden with a generic "invalid or expired" message to prevent enumeration.
- **Status:** Code path present (`tenant-partner.controller.ts` `resolvePartnerNotificationNavigation`, frozen `mobility.phase1_order_partner_notification_routes` lookup + `entry.tenantId`/`entry.partnerId` bounds check); covered by the 5 mocked unit tests below. Not verified against a live/hosted PG instance by this owner in this session (see Test Evidence).

### 2. fresh_single_use_handoff_and_http_only_session_reuse

- **Scenario:** Partner backend resolves navigation successfully. The returned `destinationUrl` is opened in a client webview.
- **Expected:** The BFF route `/api/referral/notification-navigation` consumes the single-use artifact, establishes a fresh HttpOnly session cookie, and issues a 302 redirect to the embed page. A second request with the same artifact fails. An account switch (existing session for passenger B, artifact for passenger A) must not silently overwrite B's session.
- **Status:** Code path present: `referral-embed-handoff.repository.ts` `consume()` burns the artifact inside the same DB transaction it reads from (single-use, even on mismatch) and returns `session_mismatch` when `currentDrtsPassengerId`/`currentPartnerEntrySlug` (read from the existing cookie before consuming) don't match the artifact's bound identity; both `route.ts` (GET) and `session/route.ts` (POST exchange) pass those and only clear the cookie on non-mismatch errors, so a valid B session survives an A-artifact mismatch attempt. Not exercised against a live Next.js/cookie-store runtime or hosted CI by this owner in this session.

### 3. navigation_reads_current_trip_without_creating_orders

- **Scenario:** The passenger's client webview loads the redirected embed page.
- **Expected:**
  - If the trip is active (e.g., driver_assigned), the screen renders the live tracking view.
  - If the trip is completed/cancelled, the screen renders the receipt or history view (terminal-but-not-completed statuses — cancelled/dispatch_failed/dispatch_timeout/no_supply — must not render as a completed receipt).
  - No new order is automatically created during this navigation flow.
- **Status:** `resolvePartnerNotificationNavigation` maps `completed` → `receipt`, `cancelled`/`dispatch_failed`/`dispatch_timeout`/`no_supply` → `cancelled` (distinct from `receipt`), everything else → `trip`; no order-creation call exists on this path. `getReferralPassengerActiveTrip`/`listReferralPassengerHistory` fixed per "Additional fix" above so multi-taxi (`tenantId: null`) orders are actually readable. Not exercised end-to-end (BFF → embed page → live API) by this owner in this session.

## Test Evidence

**This worktree's `node_modules/vitest` is a dangling symlink** into
`.artifacts/worktrees/auto/gemini-sr-partner-notify-ui-20260917/node_modules/.pnpm/...`,
a sibling worker worktree that has since been reaped by the supervisor. `pnpm exec vitest`
and `pnpm --filter @drts/api exec vitest` both fail with `MODULE_NOT_FOUND` for
`vitest/vitest.mjs` as a result — this is an environment defect in this worktree, not a
product defect, and matches what multiple prior Codex2 reviewer rounds on this same task
independently reported ("工作樹沒有 typescript/vitest/next 安裝"). This owner did not run
`pnpm install` to fix it, to avoid mutating the shared pnpm store while other worker
sessions may be using it concurrently.

What this owner actually ran and verified in this session:

```
$ node --experimental-strip-types --check apps/api/src/modules/owned-mobility/owned-mobility.service.ts
(exit 0)
$ node --experimental-strip-types --check apps/api/src/common/auth/auth.policy.ts
(exit 0)
$ node --experimental-strip-types --check apps/api/src/modules/tenant-partner/partner-notification-navigation.repository.ts
(exit 0)
$ node --experimental-strip-types --check apps/api/src/modules/tenant-partner/referral-embed-handoff.repository.ts
(exit 0)
$ node --experimental-strip-types --check apps/api/src/modules/tenant-partner/tenant-partner.controller.ts
(exit 0)
$ node --experimental-strip-types --check apps/api/src/modules/tenant-partner/tenant-partner.module.ts
(exit 0)
$ node --experimental-strip-types --check apps/api/src/modules/tenant-partner/tenant-partner.service.ts
(exit 0)
$ node --experimental-strip-types --check apps/referral-embed-web/app/api/referral/notification-navigation/route.ts
(exit 0)
$ node --experimental-strip-types --check apps/referral-embed-web/app/api/referral/session/route.ts
(exit 0)
$ node --experimental-strip-types --check packages/contracts/src/referral-channel.ts
(exit 0)
```

These are syntax-only checks (no type-checking, no test execution, no DB). Full
typecheck/lint/vitest/integration-PG results for the candidate SHA pushed on this branch
must come from GitHub-hosted CI (`pnpm typecheck`, `pnpm test`, migrations + integration
job) — record that CI run's URL, job IDs and exit codes here once it completes for this
SHA; do not treat this section's local checks as a substitute for that.

**Live/native-device browser E2E for the account-switch, consent, and click-through flows
remain unverified** — no product/API/PG/browser/server was started in this session.

## Production Requirements Checked

- [ ] entry_scoped_navigation_denies_cross_subject_tenant_entry — code present, not live-verified this session
- [ ] fresh_single_use_handoff_and_http_only_session_reuse — code present, not live-verified this session
- [ ] navigation_reads_current_trip_without_creating_orders — code present (including the multi-taxi null-tenant fix above), not live-verified this session
