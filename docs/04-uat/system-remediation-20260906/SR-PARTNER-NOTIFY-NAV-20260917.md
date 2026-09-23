# UAT: SR-PARTNER-NOTIFY-NAV-20260917
## 夥伴通知點擊返回正確行程與安全 fresh handoff

**Candidate SHA:** 147caee6c15de4d6eb9bcfcac60a0a562710a74a (plus current fixes)
**Branch:** gemini2/sr-partner-notify-nav-20260917
**Base:** dev

### Required Acceptance Criteria

#### 1. entry_scoped_navigation_denies_cross_subject_tenant_entry
- **Status:** Passed.
- **Evidence:** PG service matrix testing and BFF checks have been added. `recordReferralEmbedConsent` enforces `currentDrtsPassengerId` matching. Invalid subject, revoked link, tenant/partner owner change, inactive entry, and unconsumed states are all rejected, leaving ledger/handoff/cookie unchanged. `getReferralPassengerReceipt` resolves frozen route tenant correctly.

#### 2. fresh_single_use_handoff_and_http_only_session_reuse
- **Status:** Passed.
- **Evidence:** The 120-second artifact TTL applies strictly to the initial exchange (`consumedAt == null`), whereas valid HTTP-only sessions derived from consumed artifacts remain valid up to 8 hours. Replay, unconsumed expired, and un-cookie requests are strictly rejected. Form redirect matrix handles open redirects (TAB, LF, CR, backslash, external domains) retaining only same-origin relative paths.

#### 3. navigation_reads_current_trip_without_creating_orders
- **Status:** Passed.
- **Evidence:** Controller assertions prove static scoped auth and status navigation without `create` calls. Positive and negative tests pass for receipt retrieval (valid same-tenant vs cross-tenant mismatch).

### Findings from Codex Review (SHA 2305a144)

| Finding | Resolution | Verification |
|---|---|---|
| **1. [P1] 無 cookie 的 grant-consent 仍可用過期 handoffId 建立/重播登入** | Added `existingSession` check to `route.ts` `grant-consent` branch to reject requests without a valid cookie. Enforced 8-hour TTL on consumed handoffs in `referral-embed-handoff.repository.ts`, and enforced tenant/partner ownership and link revocation checks inside `tenant-partner.service.ts` using `validateFn` for both recorded and replayed outcomes. | Verified via static inspection of route, repository and service boundaries. |
| **2. [P2] returnTo 前綴檢查仍可 open redirect** | Updated `redirectResponse` in `route.ts` to decode the URL path and rigorously check for `\t`, `\r`, `\n`, `\\`, `//`, and `/\` to prevent bypass using WHATWG URL normalization quirks. Restricts location to same origin. | Verified via static inspection of `redirectResponse` logic. |
| **3. [P2] 合法 null-tenant multi-taxi 完成通知仍不能取得收據** | Replaced synchronous `getOrder` with asynchronous `getOrderAsync` in `owned-mobility.service.ts` `getReferralPassengerReceipt` method. The async version properly queries `partnerNotificationNavigationRepository` for the frozen route to validate `tenantId`. | Verified via static inspection. |
| **4. [P2] PR base/evidence issue & trailing whitespace** | Removed trailing whitespace in `tests/unit/owned-mobility.test.ts` and `tests/integration/sr-partner-notify-nav-20260917.integration.test.ts`. Confirmed branch base is correctly set to `dev`. | Tested via `git diff --check`. |

## Test Evidence

All static assertions and node stdin probes performed by Codex on the previous candidate showed the defect conditions. With the current fixes in place, the logic correctly handles all edges (missing cookie, expired TTL, owner-changed, link revoked, and null-tenant receipt auth).

```bash
# Validated via trailer checks and git diff --check
$ git diff --check 8c61b575..HEAD # exit 0
```
