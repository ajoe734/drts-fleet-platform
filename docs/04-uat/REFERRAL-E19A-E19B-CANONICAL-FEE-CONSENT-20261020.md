# Referral E19a/E19b canonical fee consent

Task-ID: REFERRAL-E19A-E19B-CANONICAL-FEE-CONSENT-FULL-FLOW-20261020

Owner: Codex2 · Reviewer: Codex

This is the existing Referral embedded Web. The other Passenger APP UI, account and booking flows are not connected. Source checks below do not claim a deployed feature or replace the already delivered Phase1 Demo/manual.

## Fixed copy and versions

packages/contracts/src/passenger-fee-disclosure.ts owns the original eight fixed rows, four existing confirmation rows, cancellation notice and customer-service phone. packages/passenger-client/src/fares/disclosure.ts preserves its export names through compatibility re-exports. The fixed text is moved unchanged; controls use the Referral translation catalog. This does not claim a separately adopted complete legal travel contract.

Disclosure version: referral-e19-20261019-v1. Content SHA-256 is over UTF-8 JSON.stringify({feeRows: PASSENGER_FEE_ROWS, confirmationRows: PASSENGER_CONFIRMATION_ROWS}), in that key/row order. The actual quote quotedFareRuleVersion and tariffSnapshot retain tariff authority. A disclosure version is not a tariff version, guarantee or amount collected.

## Canonical first agreement

Normal GET/POST /api/partner/referral/passenger/fees, through /api/referral/fees, use the existing verified Referral session, partner realm and partner:book. The server derives the full tenant/partner/program/entry/passenger owner. Privacy consent, query strings, browser storage and a new session do not create fee agreement.

The first POST requires explicit acknowledged:true and the current disclosure version. V0129 uniquely stores owner/version, content hash and the DB server first timestamp. A retry reads the winner instead of overwriting its time. The UI reads that canonical acknowledgement back before continuing. The explicit first-use button says 我已閱讀並同意. A fixed 費用與優惠說明 reader on the homepage and booking page reopens the same complete eight rows without creating another agreement. Missing/disabled storage or an unknown commit response never becomes fabricated success. A later version requires another explicit agreement.

## Every order and original ACK recovery

Each fresh order shows the current route, timing, vehicle, real quote range and four shared rows. The 我已確認費用與優惠說明 checkbox starts unchecked and resets with changed quote or trip intent. Both the disabled button and handler enforce it; the API separately requires explicit feeConfirmed:true, version, current first agreement and owned quote.

The server stores a distinct immutable fee confirmation with owner/order/quote, disclosure/hash, real tariff version, original summary and feeConfirmedAt. It joins the existing quote/order/notification transaction and appears in normal ACK/history/active/receipt readback. History, current trip and receipt show the stored fee time or explicitly report absence.

Existing confirmedAt remains quote consumedAt. Neither it, creation time nor privacy consent is backfilled as fee agreement. The migration has no historical UPDATE.

Committed replay is resolved before fresh version/expiry checks. The exact previously committed legacy body/key returns its original order without adding fee fields to the original command or manufacturing fee records. New commands freeze the real UI body/key/quote and explicit fee fields before sending. For a committed older disclosure, the UI validates the original command version against the persisted quote version, the legal quote content hash against the same snapshot hash, and the known catalog hash for the current version only. It can recover before an unavailable current fee gate without another quote, key or agreement. Changed original intent is rejected. Unknown ACK retains the original private journal; no replacement key/order or unqualified cleanup claim is introduced.

## Storage and meaningful cases

V0129 adds ops.phase1_referral_passenger_fee_acknowledgements and ops.phase1_referral_order_fee_confirmations; no Passenger APP account FK. All prior allocation entries are unchanged. The normal repository lease handles BEGIN/COMMIT/ROLLBACK; per-order facts publish only after commit.

The socket-free SQL port runs production repository SQL and controls storage/clock/fault outcomes. It is not native PostgreSQL lock proof. New tests cover exact copy/hash, controller/SQL agreement, version/owner isolation, per-order confirmation, original intent conflict/recovery, rollback and actual React/BFF behavior.

The new fee.native-postgres.test.ts uses the existing GitHub-hosted PaymentPostgresHarness: native psql/pg, production migrations and filename/version/checksum verification, owned disposable databases and separate pools. Its nine cases cover first-ack races, same/different-key arbitration, fee/route rollback, post-COMMIT loss, restart readback and a historical pre-fee fixture without backfill. VM discovery skips these cases. Actual hosted PASS/FAIL/skip identity must come from this candidate original reports; no PG runs on this VM.

Original native six/old nine, quote/hydration, notification, lead-time, lifecycle and manual complaint assertions are preserved. Direct positive callers use real first agreement and explicit per-order fields. FP uses genuine browser first agreement/checkbox and captures actual submitted bytes; its protocol bounds the exact new boolean/version fields. C6 reads the same subject already explicit agreement and confirms each fresh synthetic order. Original held journals are never upgraded. The operational manifest preserves its original16 denominator and normal UI path, including canonical first-fee state handling.

## Author verification and limits

Machine evidence is in the owner worktree .local/e19-author-checks/. The final frozen handoff binds file hashes, commands, exits and reports. Overlapping runs must not be added as unique coverage.

- Initial canonical wire suite: 24 PASS, true exit0.
- Initial new UI/BFF/hosted-callers group: 62 PASS/1 FAIL. The failure was an adapter looking for the retry button before the transition settled. The same UI file passed5 after waiting for the actual button; no product change was made to satisfy it.
- Existing six-file Referral regression: 108 PASS/1 FAIL. One scheduled notification fixture lacked the new fee fields. Normal fixture adaptation preserved original route assertions; the following five-file route/owned/idempotency/BFF/manual group passed115.
- Allocation checks: 80 PASS; initial new native discovery skipped8. A ninth native historical-replay case was added afterward and still requires hosted execution.
- The modified full API service test file passed all118, zero skip. Earlier focused4/114-filtered remains historical, not another118.
- Expanded canonical/UI checking: canonical30 PASS and UI5 PASS/1 SSR string-adapter FAIL. React inserted normal text-boundary comments; the test now checks actual parsed DOM text with the same timestamp/legacy-absence assertions.
- Broad actual-import checking reported212 diagnostics. Three introduced exact-optional/constructor issues were repaired. The remaining209 are in the existing large API test fixture. An immutable96ed compiler-host Source overlay independently reproduces209 there. No unrelated fixture/strict/skip/product configuration was changed.
- Final new feature files: canonical30, BFF7 and real React6 all PASS; native9 are VM skips only. The original JSON report records43 PASS/0 FAIL/9 skip, true exit0. This overlaps earlier runs and is not added to them.
- API production actual-Source noEmit and the current Root/new-test actual-import noEmit separately returned0. Scoped lint, i18n guard and diff checks returned0. Exact commands/configs and source hashes are qualified in the handoff. The API test existing209 baseline is not called full type PASS.

Normal formatting/lint/canonical checks, independent full-six Source review and candidate mandatory CI remain separate from runtime demonstration. Root serially integrates accepted shared hunks and owns later immutable deployment. Original8 tasks/37 keys, cancellation permissions, tariff algorithm, CRM, formal PDF/payment and authority policy are unchanged.

## R2 review corrections and preserved evidence

The original 40-file freeze and its 43 PASS/9 VM skips remain historical. Root review identified an old-version ACK hash comparison and a missing fixed reread entry. The mounted before report recorded10 PASS/4 FAIL: old-version recovery blocked, a mismatched persisted quote version accepted, and homepage/returning-book readers absent. After the narrow correction, the same Fee UI14 cases and complete original quote UI23 passed37, true exit0/zero skip. Original six Fee UI cases and all original quote assertions remain; only new control labels and producer-accurate ACK metadata fixtures changed. Invalid quote/snapshot hash, invalid hash format, mismatched version and unknown current content retain the original command without navigation. No new quote or fee POST is used for recovery.

Cancellation clock/window/command code remains byte-identical to the accepted96ed core. The fee reader is confined to homepage/book views and does not wrap or rekey TripScreen. The original component keeps a monotonic floor only within its mounted windowKey; this does not prove persistence across an actual unmount with a stale server snapshot. Normal cancellation still reads the persisted order and rechecks the server policy. No cancellation Source or policy is changed here.
