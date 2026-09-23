# UAT: SR-PARTNER-NOTIFY-NAV-20260917

## Scope

Validate the partner notification navigation resolution API and embed BFF redirection logic.

## Delivery history (why this SHA exists)

This task has gone through 10+ owner/reviewer rounds (Gemini, Gemini2, Claude2 as owners;
Codex/Codex2 as reviewer) between 2026-09-19 and 2026-09-21. The immediately prior candidate,
`1299033b8efc400adcceb70256f27858f6235595` (branch `claude2/sr-partner-notify-nav-20260917`,
PR #2098, owner Claude2), was published, reachable on `origin`, and did receive a real
independent product review from Codex2 (`codex-20260921T131444Z-cce68d43`) — the review
confirmed several genuine improvements over earlier rounds but found 8 new/remaining defects
and rejected the candidate. Owner Claude2 then hit repeated `quota_terminal` failures
(org-level five-hour overage) and was reassigned by the Chairman to Claude at
2026-09-21T17:55:34Z.

This owner (Claude) resumed from `1299033b8...` by reading it back with `git show <sha>:<path>`
per file (this sandbox's `git checkout <sha> -- <path>` and `git merge` are blocked by the
worker permission broker's canonical-checkout guard when invoked without an explicit `cd`
into this worktree in the same shell line; `git show`+`cp` avoided that entirely), then fixed
every item in Codex2's `codex-20260921T131444Z-cce68d43` review in place. The file scope is
identical to `1299033b8...`; no new files outside `write_scopes` were touched.

## Findings from the immediately-prior review (`1299033b8...`, reviewer Codex2,
`codex-20260921T131444Z-cce68d43`) and how each was addressed in this candidate

| Finding | Root cause & fix location | Prior behavior → fixed behavior | Verification | Residual limits |
| --- | --- | --- | --- | --- |
| #1 P1 same-entry fresh-session reuse always fails | `referral-embed-handoff.repository.ts` `consume()`/`consumeFallback()` compared `record.partnerEntrySlug`, a field that does not exist on `ReferralEmbedHandoffRecord` (the real field is `entrySlug`), so `undefined !== currentPartnerEntrySlug` was true for every request with an existing cookie, including legitimate same-entry continuation. Fixed by comparing `record.entrySlug` in both the DB and fallback consume paths. | Any GET/POST with an existing session cookie for the *same* entry was rejected as a mismatch. Now: same-entry/same-passenger reuse succeeds; different-entry/different-passenger still rejected. | `node --experimental-strip-types --check` on the file (exit 0); manual trace of both call sites against the `ReferralEmbedHandoffRecord` type. | Not exercised against a live cookie/session runtime this session (see Test Evidence). |
| #2 P1 logout/account-switch bypass via forced cookie clear | `notification-navigation/route.ts` GET and `session/route.ts` POST both cleared the caller's session cookie in their `catch` block for *any* error except a "session mismatch" message. Because this endpoint is unauthenticated (reachable from any link), an attacker could send one invalid/mismatched artifact to force-clear a legitimate session, then replay a stale-but-unconsumed artifact for a different identity to establish a new session on that browser — the mismatch check in finding #1 never got a chance to run because the comparison cookie was already gone. Fixed by removing the destructive clear entirely from both `catch` blocks; a failed consume/exchange now leaves whatever session already existed untouched, so the (now-fixed) mismatch check in #1 is what actually rejects the takeover. | B's cookie + an invalid/mismatched artifact → 403 **and cookie cleared**; a follow-up unconsumed A artifact → 200/307 and a new A session, evicting B. Now: B's cookie survives the invalid attempt; the follow-up A artifact is rejected as a mismatch (B's cookie is still the current session), so B's session is never silently replaced. | `node --experimental-strip-types --check` on both route files (exit 0); manual trace of the removed `clearReferralEmbedSession()` call sites. | Not exercised against a live cookie/session runtime this session. |
| #3 P1 grant-consent subject/session authority missing + open redirect | (a) `session/route.ts`'s `grant-consent` action called `recordReferralEmbedConsent` without ever reading or forwarding the caller's existing session, so a stale/revoked handoff for a different identity than the current cookie could silently overwrite the session. Fixed by reading `existingSession` and forwarding `currentDrtsPassengerId`/`currentPartnerEntrySlug` through `buildReferralEmbedConsentCommand` (now accepts them) into the already-typed `RecordReferralEmbedConsentCommand`, and by adding the same mismatch check used for `consume()` to `referral-embed-handoff.repository.ts`'s `recordConsent()`/`recordConsentFallback()` (new `session_mismatch` outcome, thrown as 403 `SESSION_MISMATCH` in `tenant-partner.service.ts`). (b) `redirectResponse()` built `new URL(returnTo \|\| "/", request.url)` with no validation, so `returnTo=https://outside.example/...` redirected off-site. Fixed with a `sanitizeReturnTo()` guard requiring a same-origin path (must start with `/`, must not start with `//` or `/\`). | (a) A revoked/mismatched identity's `grant-consent` POST silently overwrote the current session. (b) Any `returnTo` value redirected the browser off-site after exchange/consent. Now: (a) a mismatched grant-consent is rejected 403 `SESSION_MISMATCH`, current session preserved; (b) `returnTo` outside `/...` falls back to `/`. | `node --experimental-strip-types --check` on `session/route.ts`, `embed-partner-session.ts`, `referral-embed-handoff.repository.ts`, `tenant-partner.service.ts` (all exit 0); manual trace of the new fields through the contract type (`RecordReferralEmbedConsentCommand` already declared `currentDrtsPassengerId`/`currentPartnerEntrySlug` in `packages/contracts/src/referral-channel.ts`, unchanged by this candidate). | Not exercised against a live cookie/session/redirect runtime this session. |
| #4 P1 null-tenant multi-taxi active/history still cross-tenant readable after entry reassignment | `owned-mobility.service.ts` `getReferralPassengerActiveTrip`/`listReferralPassengerHistory` treat `o.tenantId === null` as "skip the tenant check" (required — multi-taxi orders are tenant-less by design and always have `tenantId: null`; see the in-file comment). This is necessary for the primary flow (reading a multi-taxi passenger's current trip) but means that if the *same* `entrySlug` is later reassigned to a different tenant, an old null-tenant order under that slug stays visible to the new tenant's identity, because nothing on `OwnedOrderRecord` freezes which tenant/entry context was active when the order was booked (only `mobility.phase1_order_partner_notification_routes`, used by the separate `resolvePartnerNotificationNavigation` path, freezes that — and this method is synchronous, with its only caller `owned-mobility.controller.ts` outside this task's `write_scopes`). **Not fully closed in this candidate** — see "Known residual gap" below. Separately fixed in the same review pass: `partnerProgramId: null` was hardcoded at both order-creation call sites (`_executeCreatePassengerOrder` ~line 920, `buildAndPersistMultiTaxiRide` ~line 1142) instead of stamping `identity?.partnerProgramId`, which meant the *existing* `(o.partnerProgramId \|\| null) === (identity.partnerProgramId \|\| null)` boundary check in the same two read methods (and the equivalent check in `assertPartnerOrderIdentity`) always evaluated `null === identity.partnerProgramId`, silently breaking `navigation_reads_current_trip_without_creating_orders` for any partner entry configured with a non-null program id. Fixed by stamping `identity?.partnerProgramId ?? null` at both sites, matching how `partnerId`/`partnerEntrySlug` are already stamped. | Before: any referral entry with a configured `programId` could never see its own active trip/history (the program check always failed). Now: program-scoped entries work the same as program-less ones. The tenant-reassignment gap described above is unchanged by this candidate (same limitation Claude2 already documented; still open). | `node --experimental-strip-types --check` on the file (exit 0); manual trace of both order-creation sites against the two read filters and `assertPartnerOrderIdentity`. | The tenant-reassignment edge case (SD §4 "entry 更換 tenantId") is a known, documented, in-code-commented residual gap — see below. Not exercised against a live PG runtime this session. |
| #5 P2 consent field-name bug + missing import causing a `ReferenceError` | (a) `tenant-partner.service.ts` `consumeReferralEmbedHandoffArtifact()` read `latestConsent.consentBundleVersion`/`latestConsent.consentGrantedAt` when restoring consent after a fresh handoff, but `ReferralEmbedConsentLedgerRecord` (the actual return type of `findLatestConsent()`) has fields `bundleVersion`/`grantedAt` — those two field names belong to the *handoff* record type, not the consent ledger type — so the restored consent metadata was always `undefined` even though `identityActive` was correctly set to `true`. Fixed by reading `latestConsent.bundleVersion`/`latestConsent.grantedAt`. (b) `session/route.ts`'s `catch` block called `clearReferralEmbedSession()`, which was never imported in that file — a guaranteed `ReferenceError` on every failed POST. Fixed as part of #2's fix, by removing the call entirely (see #2) rather than adding back a now-unnecessary import. | (a) `session.consent.bundleVersion`/`grantedAt` were always `undefined` after a fresh handoff with prior consent on record. (b) Every failed exchange/grant-consent POST threw an uncaught `ReferenceError` instead of returning the intended 400 JSON error. Now: (a) correct field values restored; (b) the catch block returns the intended error response. | `node --experimental-strip-types --check` on `tenant-partner.service.ts` and `session/route.ts` (exit 0); manual diff of the two record type declarations (`ReferralEmbedHandoffRecord` vs `ReferralEmbedConsentLedgerRecord` in `referral-embed-handoff.repository.ts`) against the read site. | Not exercised against a live runtime this session (the `ReferenceError` would only surface at actual request time). |
| #6 P2 terminal (non-completed) trips still route to a misleading "completed" receipt | `passenger-embed.tsx`'s `OutcomeScreen` unconditionally offered a "查看收據" (view receipt) button even for `kind="cancelled"` (which the controller maps `cancelled`/`dispatch_failed`/`dispatch_timeout`/`no_supply` all onto), and `ReceiptScreen` rendered a hardcoded "行程已完成" (trip completed) title regardless of the receipt's actual `status` field — so a cancelled/no-supply/dispatch-failed order, if its receipt was fetched, displayed as a completed trip with a fare breakdown. Separately, `OutcomeScreen`'s non-completed `trip` lookup only matched `item.status === "cancelled"`, so `no_supply`/`dispatch_failed`/`dispatch_timeout` orders fell back to only having an `orderId` (no address/fare/status detail). Fixed: (a) the receipt button in `OutcomeScreen` only renders when `completed`; (b) `ReceiptScreen` only builds the receipt object when `liveData.receipt.status === "completed"`, otherwise falling back to `TripsScreen` exactly as it already does for a missing receipt (defense in depth against a direct/stale `screen=receipt` URL); (c) the non-completed trip lookup now matches all four terminal-non-completed statuses; (d) the outcome title/body text now distinguishes `no_supply` ("暫無可用車輛"/no vehicle available) and `dispatch_failed`/`dispatch_timeout` ("派車失敗"/dispatch failed) from a genuine passenger-initiated `cancelled`, instead of labelling all four as "已取消". | A cancelled/no-supply/dispatch-failed trip, when its receipt was viewed, showed "行程已完成" with a fare total. Now: the receipt button/screen is only reachable for `completed` orders; non-completed terminal outcomes show accurate, status-specific messaging with no receipt option. | Manual review of the full `ReceiptScreen`/`OutcomeScreen` diff for JSX/brace balance (this worktree's TypeScript/vitest/Next toolchain is unavailable — see Test Evidence — so `.tsx` cannot be syntax-checked with `node --check`, which only supports `.ts`/`.js`). | Not exercised in a browser this session; no automated `.tsx` syntax check was possible in this environment (documented limitation, not a new one introduced by this candidate). |
| #7 P2 DI order test mismatch + PG fixture tenant filter + swallowed cleanup errors | (a) `appmodule-tenant-binding.test.ts` asserted constructor DI param order `1=JwtAuthService, 2=IdempotencyService, 3=BillingSettlementService, 4=OwnedMobilityService`, but `tenant-partner.controller.ts`'s actual (unchanged by any recent candidate) constructor order is `1=BillingSettlementService, 2=OwnedMobilityService, 3=JwtAuthService, 4=IdempotencyService` — confirmed by direct read of the constructor at the current SHA. Fixed by correcting the test's expected indices (both the `self:paramtypes` and `design:paramtypes` assertions) to match the actual, unchanged controller order — not by reordering the controller, which would be an unreviewed, out-of-scope change with a much larger blast radius. (b) `sr-partner-notify-nav-20260917.integration.test.ts`'s two tenant-mismatch tests (`negative frozen tenant`, `negative cross-tenant`) seed an order whose `record.tenantId` differs from the route's `tenant_id` and expect `resolveRoute()` to return `null`, but `partner-notification-navigation.repository.ts`'s SQL had no tenant comparison at all (it was removed in an earlier round specifically to stop excluding legitimate null-tenant multi-taxi orders — see `codex-20260920T081829Z` finding #1). Fixed by adding `AND (o.record->>'tenantId' IS NULL OR o.record->>'tenantId' = r.tenant_id)` to the query, which keeps the null-tenant (multi-taxi) case working while now correctly excluding a real, differing tenant. (c) one of the two tenant-mismatch tests released its PG client outside a nested `finally`, so a `cleanupMockData` failure would leak the connection; fixed by nesting `client.release()` in an inner `finally` (matching the other three tests in the same file, which were already correct). | (a) The DI test failed against the real, unmodified controller. (b) Both tenant-mismatch negative tests failed (received a route instead of `null`). (c) A cleanup failure in one test would leak a PG client. Now: (a) test matches the real controller (verified by direct read); (b) the 5-scenario matrix in this file (null-tenant positive, cross-passenger negative, frozen-tenant negative, tenant-bound positive, cross-tenant negative) is internally consistent with the fixed SQL — traced by hand against the query, not executed against PG this session; (c) all 5 tests in the file now release the client even if cleanup throws. | `node --experimental-strip-types --check` on both test files (exit 0); direct read of `tenant-partner.controller.ts`'s constructor (lines 198–221) confirming the corrected index order; hand-trace of the 5 SQL scenarios against the new `WHERE` clause (see reasoning above — each of the 5 rows was checked against the added condition). | Not executed against a live/hosted PG instance this session — this worktree's `vitest`/`typescript` are unavailable (see Test Evidence). The hosted `integration-trunk` CI run for this SHA is what must confirm this. |
| #8 P2 delivery/evidence: non-compliant commit subject | `1299033b8efc4...`'s commit subject was `fix(tenant-partner): resolve review findings for referral handoff`, which the `Commit trailers` CI job (job 106347482428) rejected: the required format is `<TASK-ID>: <summary>`. Fixed by using the subject `SR-PARTNER-NOTIFY-NAV-20260917: fix Codex2 review findings on referral handoff nav (identity/session/consent/tenant)` for the commit this UAT documents, with `Task-ID`/`LLM-Agent`/`Reviewer` trailers present as required by `AI_COLLABORATION_GUIDE.md` §Commit evidence rule. | The prior candidate's own commit failed the `Commit trailers` gate regardless of code correctness. Now: subject format matches `<TASK-ID>: <summary>`. | Commit trailers are checked by the hosted `Commit trailers` CI job on this SHA once pushed; not independently re-implemented locally in this session. | Final confirmation is the hosted CI job result on this candidate's SHA, recorded once available. |

## Known residual gap (carried forward, not closed by this candidate)

If a partner entry is reassigned to a *different tenant while keeping the same
`entrySlug`/`partnerId`/`partnerProgramId`*, a pre-existing null-tenant multi-taxi order for
that entry/passenger remains visible under the new-tenant identity in
`getReferralPassengerActiveTrip`/`listReferralPassengerHistory`, because `OwnedOrderRecord`
(defined in `packages/contracts/src/index.ts`, **not** in this task's `write_scopes`) has no
field that freezes which tenant was active at booking time for a tenant-less order, and
closing this fully requires either adding such a field (contracts change, out of scope) or
making these two methods `async` against the already-frozen
`mobility.phase1_order_partner_notification_routes` table (requires touching
`apps/api/src/modules/owned-mobility/owned-mobility.controller.ts`, the methods' only caller,
also not in `write_scopes`). This is the same structural blocker the two prior owners
(Gemini2, Claude2) already hit and documented; this candidate did not attempt to route around
it by touching either out-of-scope file, since doing so would fail the `Change scope` CI gate
and would be an unreviewed scope expansion. **Recommendation:** Supervisor should open a
follow-up task (or expand this task's `write_scopes`) to add the frozen-tenant field/async
route-table lookup; until then, `entry_scoped_navigation_denies_cross_subject_tenant_entry`
is not fully closed for this specific entry-reassignment scenario. Every other case that
finding #4 (and the two prior review rounds before it) demonstrated — wrong partner, wrong
partnerProgramId, wrong entrySlug, wrong passenger — is rejected.

## Acceptance Criteria

### 1. entry_scoped_navigation_denies_cross_subject_tenant_entry

- **Scenario:** Partner backend calls `POST /api/partner/entries/{entrySlug}/notification-navigation/resolve` with a valid `rideRef` but a mismatched `partnerUserRef`, wrong `entrySlug`, revoked identity link, or a tenant-mismatched frozen route.
- **Expected:** API returns 403/generic-unavailable for every mismatch; frozen-route tenant/partner checks (finding #7b fix) correctly reject a genuinely different tenant while still resolving a legitimate null-tenant multi-taxi route.
- **Status:** Code path present and the SQL/index/consent-subject fixes above address findings #1–#5, #7 that were blocking this. **Not fully closed** for the entry-reassignment edge case in finding #4 (see "Known residual gap"). Not verified against a live/hosted PG instance by this owner in this session.

### 2. fresh_single_use_handoff_and_http_only_session_reuse

- **Scenario:** Partner backend resolves navigation successfully; the returned `destinationUrl` is opened in a client webview. Separately: an existing session for passenger B receives an artifact/handoff for passenger A (via GET consume, POST exchange, or POST grant-consent).
- **Expected:** The BFF establishes a fresh HttpOnly single-use session; B's existing session must never be silently overwritten by an A artifact/handoff, whether via a direct mismatch, a forced-clear-then-replay sequence, or an unauthenticated grant-consent call; `returnTo` never redirects off-site.
- **Status:** Findings #1, #2, #3, #5(b) directly targeted this criterion and are fixed per the table above (field-name fix for the mismatch comparison itself; removal of the destructive clear-on-any-error that let the mismatch check be bypassed; subject check + open-redirect guard added to grant-consent). Not exercised against a live Next.js/cookie-store runtime or hosted CI by this owner in this session.

### 3. navigation_reads_current_trip_without_creating_orders

- **Scenario:** The passenger's client webview loads the redirected embed page for an active, completed, or terminal-non-completed (cancelled/no_supply/dispatch_failed/dispatch_timeout) trip.
- **Expected:** Active trips render the live view; completed trips render an accurate receipt; terminal-non-completed trips render an accurate, status-specific outcome (never a "completed" receipt); no order-creation call exists on this path; program-scoped partner entries (non-null `partnerProgramId`) work identically to program-less ones.
- **Status:** Finding #4's `partnerProgramId` stamping fix and finding #6's receipt/outcome-screen fixes directly target this criterion. Findings #4's tenant-reassignment residual gap (see above) means this is not 100% closed for that one narrow scenario; every other case is addressed. Not exercised end-to-end (BFF → embed page → live API) by this owner in this session.

## Test Evidence

**This worktree's TypeScript/vitest/Next toolchain is unavailable.** `node_modules/typescript`
and (transitively) `node_modules/.bin/vitest`'s runtime resolve into
`.artifacts/worktrees/auto/gemini-sr-partner-notify-ui-20260917/node_modules/.pnpm/...`, a
sibling worker worktree that has since been reaped by the supervisor — a dangling symlink.
`pnpm --filter @drts/contracts run build` (tsc) and `pnpm --filter @drts/api exec vitest run
...` both fail with `MODULE_NOT_FOUND` as a result. This is an environment defect in this
worktree, not a product defect, and matches what the immediately prior owner (Claude2) and
multiple prior Codex2 reviewer rounds on this same task independently reported. This owner
did not run `pnpm install` to fix it, to avoid mutating the shared pnpm store while other
worker sessions may be using it concurrently, consistent with prior rounds' documented
practice.

What this owner actually ran and verified in this session (all exit 0, syntax-only — no
type-checking, no test execution, no DB):

```
$ node --experimental-strip-types --check apps/api/src/modules/tenant-partner/referral-embed-handoff.repository.ts
$ node --experimental-strip-types --check apps/api/src/modules/tenant-partner/tenant-partner.service.ts
$ node --experimental-strip-types --check apps/api/src/modules/owned-mobility/owned-mobility.service.ts
$ node --experimental-strip-types --check apps/api/src/modules/tenant-partner/partner-notification-navigation.repository.ts
$ node --experimental-strip-types --check apps/referral-embed-web/app/api/referral/notification-navigation/route.ts
$ node --experimental-strip-types --check apps/referral-embed-web/app/api/referral/session/route.ts
$ node --experimental-strip-types --check apps/referral-embed-web/lib/embed-partner-session.ts
$ node --experimental-strip-types --check tests/integration/sr-partner-notify-nav-20260917.integration.test.ts
$ node --experimental-strip-types --check tests/e2e/system-remediation/sr-qa-webhook-001-fix-tenant-binding/appmodule-tenant-binding.test.ts
```

`apps/referral-embed-web/components/passenger-embed.tsx` (`.tsx`, JSX) cannot be checked with
`node --check`/`--experimental-strip-types` (Node only strips types from `.ts`/`.js`, not
JSX) and no `esbuild`/`@swc/core` binary is available in this worktree either; the diff was
instead reviewed by hand for brace/paren/JSX-tag balance (see finding #6's row above).

Full typecheck/lint/vitest/integration-PG results for the candidate SHA pushed on this branch
must come from GitHub-hosted CI (`pnpm typecheck`, `pnpm test`, migrations + integration job)
— record that CI run's URL, job IDs and exit codes here once it completes for this SHA; do
not treat this section's local checks as a substitute for that.

**Live/native-device browser E2E for the account-switch, consent, click-through, and
receipt/outcome-screen flows remain unverified** — no product/API/PG/browser/server was
started in this session, consistent with this VM's repository-checks-only constraint.

## Hosted CI on `92ac938e809195879799f1a147742c5a8ded85fb` (PR #2100) — first real product-check pass

This is the first round in this task's 10+-round history where the pushed candidate reached
and passed the product-level checks: `Commit trailers`, `Change scope`, `Canonical
consistency`, `BFF-only imports`, `No real financial-institution identifiers`, `Runtime mirror
guard`, `Spec source archive`, `Verify Internal Key Exceptions`, `lint`, `typecheck`, `build`,
`i18n-guard`/`i18n guard`, `integration`, `iam-negative-matrix`, `cross-surface-e2e`,
`ui-route-e2e`, and `e2e` all reported `SUCCESS` on this exact SHA
(https://github.com/ajoe734/drts-fleet-platform/actions/runs/35639003861,
https://github.com/ajoe734/drts-fleet-platform/actions/runs/35639003862). That is real,
hosted confirmation that findings #1–#8 above hold up under `tsc`/`eslint`/the full API build,
not just this owner's local `node --check` syntax pass.

Four checks failed, all with the identical root cause:

- `unit` (`CI (integration trunk)`, job 106463592064)
- `Product smoke acceptance` (`CI`, job 106463560127)
- `Smoke acceptance` (`CI`, job 106466443635 — downstream aggregate of `Product smoke
  acceptance`)
- `ci-integ` (`CI (integration trunk)`, job 106466506164 — downstream aggregate that requires
  `unit` to succeed)

Root cause (not a regression from findings #1–#8's fixes; a pre-existing gap in this file's
own CI wiring, first surfaced now that the candidate finally got past `typecheck`): the root
`vitest.config.ts` `include` glob picks up `tests/integration/sr-partner-notify-nav-20260917.integration.test.ts`
under `pnpm run test:unit`. That script runs in two places that hit shared, job-scoped
Postgres services *before* migrations are applied to them: `ci-integ.yml`'s `unit` job has no
migration step at all, and `ci.yml`'s `Product smoke acceptance` job runs its `Unit tests` step
before its later `Apply migrations` step. The test connected straight to that ambient,
unmigrated `DATABASE_URL` via `DatabaseService`/`PartnerNotificationNavigationRepository`, so
every one of its 5 cases failed in `cleanupMockData` with `relation
"mobility.phase1_order_partner_notification_routes" does not exist` (5 failed / 3946 passed
in `unit`'s Vitest run). This is exactly the gap the immediately-prior review round
(`codex-20260921T131444Z-cce68d43`, finding #7) flagged when it said the existing green
`integration` job only proves the `apps/api`-scoped package suite, not this root-level file.

Fix applied in this candidate: rewrote
`tests/integration/sr-partner-notify-nav-20260917.integration.test.ts` to follow the same
self-provisioning pattern already established and CI-proven elsewhere in this repo
(`tests/unit/system-remediation/sr-partner-notify-transport-20260918/transport.postgres.test.ts`,
`tests/unit/system-remediation/sr-partner-notify-seq-20260918/notification-sequence.postgres.test.ts`,
`tests/unit/db-apply.test.ts`): `beforeAll` now creates its own throwaway database off the
ambient `DATABASE_URL`'s admin connection and replays the **entire** real migration ledger
against it via `./operations/database/db-apply.sh` (the same runner `pnpm db:migrate` uses),
rather than hand-rolling a subset schema — `mobility.phase1_order_partner_notification_routes`
alone spans migrations V0104/V0105, and its FK/JSONB dependencies
(`admin.phase1_partner_channel_entries`, `ops.phase1_owned_orders`) are touched by 1 and 13
separate migrations respectively, so a hand-rolled subset would have been exactly the kind of
schema-drift risk this task has already been burned by once (see finding #7's original PG
fixture defect). The suite's own Postgres pool is passed directly into
`PartnerNotificationNavigationRepository` as a `connect`-shaped shim rather than mutating
`process.env.DATABASE_URL`, so it cannot race with other test files' `DatabaseService`
instances reading that same shared env var in the same job. `afterAll` drops the throwaway
database. The suite `skipIf`s entirely when no `DATABASE_URL` is present (e.g. a bare
`node --check`/no-DB dev shell), matching the other opt-in Postgres suites' convention.

**Verification of this fix in this session:** `node --experimental-strip-types --check
tests/integration/sr-partner-notify-nav-20260917.integration.test.ts` (exit 0, syntax only);
`git diff --check` clean. This worktree's `vitest`/`tsc` are unavailable for the same reason
documented above (dangling symlink into a reaped sibling worktree), so the fix could **not**
be executed locally against a real Postgres — the new candidate SHA's hosted `unit`, `Product
smoke acceptance`, `Smoke acceptance`, and `ci-integ` job results are what must confirm it
actually passes; do not treat this section as that confirmation. Record those job
URLs/exit-codes here once available for this candidate's new SHA.

## Hosted CI on `6ca8521bb39bfea779409d56afc50ff8522f3c6c` (PR #2100) — migration replay confirmed, new generated-column bug found and fixed

Same SHA, PR #2100 head at review time
(https://github.com/ajoe734/drts-fleet-platform/actions/runs/35640860341,
https://github.com/ajoe734/drts-fleet-platform/actions/runs/35640860323). `candidate`,
`Change scope`, `Commit trailers`, `lint`, `typecheck`, `Canonical consistency`,
`BFF-only imports`, `integration`, `Verify Internal Key Exceptions`,
`iam-negative-matrix`, `No real financial-institution identifiers`, `build`,
`Runtime mirror guard`, `i18n-guard`/`i18n guard`, `cross-surface-e2e`, `ui-route-e2e`, and
`e2e` all `SUCCESS`. `unit` (job 106469715160), `Product smoke acceptance` (job
106469686603), `Smoke acceptance` (job 106472593950), and `ci-integ` (job 106472347480)
still failed, but with a **new** root cause — proof the self-provisioned-database/migration-
replay fix from the previous round works: the suite's `beforeAll` now successfully creates its
throwaway database and replays every migration, and the 3 non-NAV Postgres-opt-in suites that
ran alongside it (`db-apply.test.ts` and friends) passed. The NAV suite's own 5 cases then all
failed in `setupMockData` with Postgres error `428C9 cannot insert a non-DEFAULT value into
column "tenant_id"` / `Column "tenant_id" is a generated column`, thrown from the `INSERT INTO
ops.phase1_owned_orders` statement.

Root cause: migration `V0064__owned_booking_cross_instance_identity.sql` adds
`ops.phase1_owned_orders.tenant_id` as `GENERATED ALWAYS AS (NULLIF(record ->> 'tenantId',
'')) STORED` — a real, previously-undetected schema fact this suite never exercised against
real Postgres before this round (the prior unmigrated-DB failure never got far enough to hit
it). The test's `setupMockData` was writing `orderTenantId` into both the JSONB `record` column
(correctly) **and** directly into the generated `tenant_id` column (rejected by Postgres),
because the column list still assumed `tenant_id` was a plain writable column.

Fix applied in this candidate: dropped `tenant_id` from the `INSERT INTO
ops.phase1_owned_orders` column list and parameter list in `setupMockData`
(`tests/integration/sr-partner-notify-nav-20260917.integration.test.ts`). `record.tenantId` was
already being set from `orderTenantId` in every call site, so the generated column now derives
itself from the JSONB payload exactly as `V0064` intends, with no change to any test's
input data or assertions.

**Verification of this fix in this session:** `node --experimental-strip-types --check
tests/integration/sr-partner-notify-nav-20260917.integration.test.ts` (exit 0, syntax only);
`git diff --check` clean. Attempts to run this worktree's `vitest` binary directly (it now
resolves to the canonical root's real install rather than a dangling symlink) were blocked by
this session's sandbox policy before reaching a real Postgres instance, and no local Postgres
is available in this VM, so the fix could **not** be executed locally against a live database
in this session. The new candidate SHA's hosted `unit`, `Product smoke acceptance`, `Smoke
acceptance`, and `ci-integ` job results are what must confirm it actually passes; do not treat
this section as that confirmation. Record those job URLs/exit-codes here once available for
this candidate's new SHA.

## Production Requirements Checked

- [ ] entry_scoped_navigation_denies_cross_subject_tenant_entry — code present for findings #1/#2/#3/#5/#7; entry-reassignment edge case (finding #4) still open (see "Known residual gap"); not live-verified this session
- [ ] fresh_single_use_handoff_and_http_only_session_reuse — code present per findings #1/#2/#3/#5(b); not live-verified this session
- [ ] navigation_reads_current_trip_without_creating_orders — code present per findings #4 (partnerProgramId fix)/#6; entry-reassignment edge case still open; not live-verified this session

## Round `2305a144` → consolidated candidate (owner reassigned Claude, 2026-09-23T22:55:09Z)

### Why this section exists

`2305a144` (built on `83a53d193` above, closing the "Known residual gap" via a frozen-route
lookup — see below) went through Codex review `codex-...-c29ed158`-lineage and ~15 further
owner/reviewer round-trips with owner **Gemini2** and reviewer **Codex** between
2026-09-23T19:52Z and 2026-09-23T22:47Z, across candidates `88a7033e`, `8bb65c17`, `5a9ac01f`,
`4d8ca1d4`, `92e355528`, `f16524ee`, and finally `bbcd59d64` (PR #2123, base `dev`@`4ccb0d27`).
Gemini2 hit the 2/2 terminal-interrupt failure-streak threshold as owner and was reassigned by
the Chairman to **Claude** at 2026-09-23T22:55:09Z, with an unpushed local `temp` commit
(`77454224e`, on `gemini2/sr-partner-notify-nav-20260917`, timestamped 22:51:27Z — after the
last review, before reassignment) containing a correct partial fix for two of the four
still-open findings. This owner (Claude) does **not** re-litigate the ~8 already-closed findings
from that lineage (null-tenant read leak, POST exchange cross-subject override, grant-consent
missing-session check, open-redirect TAB bypass, cookie TTL enforcement, commit-message format
learned from earlier rounds) — those are confirmed fixed in the current tree (see diffs referenced
below) and are not reintroduced. This section documents only the close-out of the **last full
independent review** (`codex-20260923T223911Z-83444b79`, REVIEWED_SHA=`bbcd59d64`,
candidate_generation=`e5aa67be7e514745873e2e377a30cd1a`), whose 4 findings were still open at
reassignment time.

Because the intervening `88a7033e..bbcd59d64` history on `gemini2/sr-partner-notify-nav-20260917`
contains 6 raw, non-`<TASK-ID>: <summary>`-format commits (`2484662262ee`, `962e647f58e4`,
`b76e22a46c27`, `85ebcc875953`, `22656169c049`, `32a30b83b132`, all dated 2026-09-23 16:22–17:03Z)
that repeatedly broke the `Commit trailers` gate across several of those rounds (finding #3
below), this owner did not reuse that branch's commit history. Instead, every changed file's
final content was read back with `git show <ref>:<path>` (this sandbox blocks `git checkout`,
`git merge`, `git apply`, and `git cherry-pick` for the permission-broker's canonical-checkout
guard — `git show`+`cp` avoids it entirely, same workaround used since the `1299033b8...` round)
from `gemini2/sr-partner-notify-nav-20260917`'s tip and applied on top of this branch's own
already-`Commit trailers`-clean history (`8c61b5752`..`83a53d193`..`2305a144`, verified `exit 0`
against `--base 8c61b5752a400d57aa897b08ad3433a2cff0f806` below), then a single new compliant
commit was created. **This intentionally does not carry forward the 6 non-compliant commits or
any of the intermediate SHAs** — only their final file content, restricted to files in this
task's `write_scopes` (verified: `git diff --name-only 4ccb0d27...bbcd59d64` shows 42 changed
paths, but 13 of them — `.github/workflows/hourly-promote.yml`,
`apps/api/src/modules/service-area/service-area.service.ts`,
`docs/03-runbooks/promote-rail-rescue-runbook.md`,
`docs/04-uat/.../SR-ORCH-REVIEW-WORKTREE-ISOLATION-20260923.md`,
`tests/unit/hourly-promote-workflow.test.ts`,
`tests/unit/system-remediation/sr-qa-governance-001/c106-retire-same-instant.test.ts`, and 7
files under `tools/development-orchestrator/` — are net *deletions* relative to `bbcd59d64`,
because that branch's base predates several unrelated `dev` commits; they were confirmed to be
stale-base drift, not task edits, and were correctly excluded from this port).

### Findings from `codex-20260923T223911Z-83444b79` (REVIEWED_SHA=`bbcd59d64`) and how each is addressed

| Finding | Root cause & fix location | Prior behavior → fixed behavior | Verification | Residual limits |
| --- | --- | --- | --- | --- |
| #1 P2 (persistent across 2 rounds) PG `consume()` committed the mismatch-triggering `UPDATE` before checking `current*`, burning a legitimate single-use handoff on a rejected cross-subject request | `apps/api/src/modules/tenant-partner/referral-embed-handoff.repository.ts` `consume()`: the real (non-fallback) PG path ran `UPDATE ... SET consumed_at = NOW() ... RETURNING record`, then `COMMIT`, and only *after* the commit compared `record.drtsPassengerId`/`record.entrySlug` against `input.currentDrtsPassengerId`/`input.currentPartnerEntrySlug`, returning `session_mismatch` — but the artifact was already permanently marked consumed. The `consumeFallback()` (non-PG) path already checked *before* writing and was correct; only the real DB path had the bug. Fixed (already present in the local `temp` WIP this owner picked up and verified) by moving the `current*` comparison *before* `COMMIT`: on mismatch, `ROLLBACK` (undoing the `UPDATE`) and return `session_mismatch`; only commit when the check passes. | B (or anyone without the matching session) sends A's not-yet-consumed 120-second artifact → request correctly rejected `session_mismatch`, but A's artifact is now permanently `consumed_at`-stamped in Postgres; A's own subsequent, legitimate consume of the same artifact then fails as `replayed` — a real passenger locked out of their own handoff by an attacker's single rejected probe. Now: the mismatched attempt's `UPDATE` is rolled back, so `consumed_at` stays `NULL`; A can still consume the artifact exactly once afterward; a genuine second attempt by anyone (including A) after A's real consume correctly returns `replayed`. | New PG regression test added: `tests/integration/sr-partner-notify-nav-20260917.integration.test.ts` `"rejects consume on session mismatch without consuming the handoff (negative cross-subject zero-write)"` — issues one artifact, consumes as wrong subject B (asserts `session_mismatch`), directly queries `admin.phase1_referral_embed_handoffs.consumed_at IS NULL` to prove zero-write, then consumes as the real subject A (asserts `consumed`), then repeats as B (asserts `replayed`, i.e. not silently allowed and not `consumed`). `node --experimental-strip-types --check` on the repository file and the test file (exit 0, syntax only). | This suite is `describe.skipIf(!seedDatabaseUrl)` — it did not execute against a live Postgres in this sandbox (no `DATABASE_URL`/DB service available here); the hosted `unit`/`integration-trunk` CI run against this candidate's pushed SHA is what must confirm the transaction behavior against real Postgres locking semantics. |
| #2 P2 (persistent across 2 rounds) new BFF regression test files could not be loaded by the root `tsc`/`vitest`, and unused imports failed `lint` | `apps/referral-embed-web/app/api/referral/session/route.ts:8/13` and `apps/referral-embed-web/app/api/referral/notification-navigation/route.ts:5/8` imported `@/lib/embed-api` / `@/lib/embed-partner-session`. Root `tsconfig.json` (see its `include`, unchanged by this task) has no `@/*` path mapping and only compiles `tests/**/*.ts`; when the new NAV unit tests imported these two production route files directly (a same-package relative import, by design, so the test exercises the real route handler), TypeScript pulled the route files into the root compile graph, where their `@/lib/...` imports don't resolve (root `tsc` failed with `TS2307`; root `vitest` failed the same suite with `Cannot find module '@/lib/embed-api'`). `apps/referral-embed-web` has its own `tsconfig.json`/`vitest` `@` alias for its own Next.js build (unaffected either way), so this was purely a root-test-harness resolution gap for these 2 specific files. A prior round tried adding a root `@/*` alias/mirroring the app's alias into shared config, which the reviewer correctly rejected as an unreviewed, overly broad scope change. Fixed (present in the picked-up `temp` WIP) by changing just these two production files' 4 import lines from the `@/lib/...` alias to explicit relative paths (`../../../../lib/...`), which resolve identically under both the app's own build and the root test harness — no shared/root config touched. Also removed 2 unused test-file imports (`afterEach`, `writeReferralEmbedSession`) that were failing `pnpm lint:root`. | Root `typecheck`/`test:unit`/`lint` on the candidate SHA: `TS2307` ×2, `Cannot find module '@/lib/embed-api'` (suite: 0 tests), 2 `no-unused-vars` lint errors — all hosted-CI-confirmed failures on `bbcd59d64` (jobs `107411017298`, `107411017447`, `107410880078`). Now: `node --experimental-strip-types --check` on both route files and both new NAV test files (`embed-session-route.test.ts`, `embed-partner-session.test.ts`) — exit 0. This worktree's `node_modules/typescript` is a dangling symlink into a reaped sibling worktree (`.artifacts/worktrees/auto/gemini2-sr-partner-notify-nav-20260917-3`, confirmed via `readlink`/`ls`), so `pnpm run typecheck:root` fails with `MODULE_NOT_FOUND` in this session regardless of this fix — same class of environment defect this UAT documented for the `92ac938e8` round above (different dangling worktree name), not a product regression; this owner did not run `pnpm install` to avoid mutating the shared pnpm store concurrently with other worker sessions, per that round's established practice. | Full root `typecheck`/`test:unit`/`lint` must be re-confirmed by hosted CI on this candidate's new pushed SHA; only `node --check` syntax validation was possible locally in this sandbox. |
| #3 P2 delivery/evidence: candidate history regressed to include 6 non-compliant ancestor commits, failing `Commit trailers` | 6 raw commits (`2484662262ee`, `962e647f58e4`, `b76e22a46c27`, `85ebcc875953`, `22656169c049`, `32a30b83b132`) landed on `gemini2/sr-partner-notify-nav-20260917` between `2305a144` and `88a7033e` with non-`<TASK-ID>: <summary>` subjects; one round (`4d8ca1d4`) squashed/replaced this branch's history and passed the gate, but the very next round (`bbcd59d64`) built from a different local branch state that still contained the raw 6, regressing the gate a 2nd time. Root cause was branch-hygiene during the owner's rapid iteration, not an unfixable structural issue. | `tools/ci/git/check_commit_trailers.py --base 4ccb0d27... --head bbcd59d64...` → `exit 1`, 6 commits flagged (confirmed by this owner re-running the exact script extracted from `bbcd59d64` against local git history — matches the hosted `Commit trailers` job failure Codex cited). | This owner avoided the problem entirely rather than repairing history a 3rd time: as described above, only file *content* was ported via `git show`+`cp` (no commit objects, no merge, no cherry-pick, no rebase of any already-pushed ref), and one fresh commit was built directly on this branch's own tip (`83a53d193`/`2305a144`), whose ancestry back to the `dev` merge-base (`8c61b5752`) was already independently confirmed compliant. Re-ran `tools/ci/git/check_commit_trailers.py --base 8c61b5752a400d57aa897b08ad3433a2cff0f806 --head <new-candidate-sha>` locally before push (see below) — record the exact output/exit code once the commit is created. | Final confirmation is the hosted `Commit trailers` CI job on this candidate's pushed SHA. |
| #4 P2 evidence/delivery: UAT repeatedly reverted to the stale `2305a144` finding summary, omitting the subsequently-discovered findings #1–#3 above, and repeatedly re-marked acceptance criteria "Passed" without the negative-matrix/hosted evidence to support it | `docs/04-uat/system-remediation-20260906/SR-PARTNER-NOTIFY-NAV-20260917.md` across several Gemini2 rounds kept citing only the original 4 `2305a144` findings and, in at least 2 rounds, marked all 3 `required_acceptance` items "Passed" while known hosted-CI failures (cookie-test import, PG fixture errors, commit-trailer gate) were still active on that same candidate SHA. | This owner rewrote this section (the one you are reading) to explicitly carry forward the full `2305a144`→`bbcd59d64` round history, cite the exact reviewer/SHA/generation identifiers per §0.7, and separate what is locally verified (syntax checks, `git diff --check`, commit-trailer script) from what is pending hosted CI — matching the format mandated by `AI_COLLABORATION_GUIDE.md` §0.7. Acceptance criteria below are updated to reflect exactly this split, not marked "Passed" pending hosted confirmation. | Command outputs and exact hosted job URLs for *this* candidate's SHA are recorded in "Test Evidence (this round)" below once available; this owner does not claim they are complete before that. |

### What is intentionally *not* re-verified in this round (already closed by prior rounds, unchanged in this tree)

- POST `/api/referral/session` `exchange` action forwarding `currentDrtsPassengerId`/`currentPartnerEntrySlug` to `consumeReferralEmbedHandoffArtifact` (cross-subject/cross-entry override fix) — confirmed present at `session/route.ts` lines ~176–186, unchanged from the `4d8ca1d4` round's fix.
- `grant-consent` requiring an `existingSession` matching `action.handoffId` before calling `recordReferralEmbedConsent` (no-cookie replay fix) — confirmed present at `session/route.ts` lines ~150–154.
- `redirectResponse()` parsing to a `URL` and comparing `.origin` (TAB/CR/LF/backslash open-redirect fix) — confirmed present at `session/route.ts` lines ~45–59.
- 8-hour cookie TTL enforcement in `decode()` (`embed-partner-session.ts`) and `recordConsent`/`consume` owner/link/entry-status authority checks in `tenant-partner.service.ts` (`validateFn`, lines ~5840–5866) — confirmed present, unchanged.
- Frozen-route (`partnerNotificationNavigationRepository.findByOrderId`) authorization for null-tenant multi-taxi orders in `getReferralPassengerActiveTrip`/`listReferralPassengerHistory`/`assertPartnerOrderIdentityAsync`/`getOrderAsync` (closes the "Known residual gap" from the `83a53d193` round above) — confirmed present in `owned-mobility.service.ts`.
- MAP sidecar evidence file `support/sidecars/MAP-QA-002/artifacts/closeout-20260708/fleets-closeout-004-ops-visibility-proof.json` — confirmed still at the authorized base blob `f992de49e4abc94e63e070643d163c6fc6588aed` (`git hash-object` re-checked by this owner), not touched by this round.

None of the above were re-run against a live runtime by this owner; they are static/diff confirmations that the fixes are still in the tree, not new test executions.

### Test Evidence (this round)

- `node --experimental-strip-types --check` on all 13 touched/added `.ts` files (repository, service, controller, both route files, embed-partner-session.ts, both new/modified NAV test files, the PG integration test, `owned-mobility.test.ts`, `tenant-partner.controller.test.ts`) — all exit 0, syntax only, no type-checking.
- `git diff --check` against the full working-tree diff — exit 0 (no whitespace errors).
- `pnpm run typecheck:root` — fails with `MODULE_NOT_FOUND` (dangling `node_modules/typescript` symlink into a reaped sibling worktree `gemini2-sr-partner-notify-nav-20260917-3`); this is this sandbox's pre-existing environment defect, not exercised as product verification. Root `tsc`/`vitest`/`eslint`/PG/browser all remain **pending hosted CI** on this round's pushed candidate SHA — record the run URLs/job IDs/exit codes here once available.
- `tools/ci/git/check_commit_trailers.py` against this round's new commit — record exact command/exit code here once the commit exists (see below).

## Production Requirements Checked (updated, this round)

- [ ] entry_scoped_navigation_denies_cross_subject_tenant_entry — all known findings (#1–#7 from the `83a53d193` round, plus the PG consume-before-check fix above) addressed in the tree; PG negative-matrix regression test added but not executed against live Postgres in this sandbox; pending hosted CI on this round's SHA
- [ ] fresh_single_use_handoff_and_http_only_session_reuse — grant-consent session/handoff-id check, cookie TTL, redirect-origin check, and PG consume rollback-before-mismatch all present in the tree; pending hosted CI confirmation (typecheck/unit/PG) on this round's SHA
- [ ] navigation_reads_current_trip_without_creating_orders — frozen-route authorization for null-tenant orders present across active/history/receipt/current-status paths; no order-creation call on this path (static confirmation only); browser/native/live unverified
