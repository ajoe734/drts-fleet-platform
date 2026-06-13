# TST-E2E-ENTERPRISE-DISPATCH-ROUND16 Evidence

**Date:** 2026-06-13  
**Owner:** Codex  
**Source revision:** `origin/dev@92641cefa22bbd28692d6a3e71f20d620ec11866`  
**Worktree:** `/tmp/drts-e2e-round13.6Cx5jT`  
**Status:** `PASS - external dev Enterprise Dispatch surface parity`

## Round Question

Before executing this round, the remaining verification questions were:

- Which Enterprise Dispatch routes were not reached by the first 3,000 selected
  dev-runtime matrix cases?
- Which realistic enterprise-user direct links can fail even when home,
  booking list, and new booking are green?
- Can the existing Enterprise Dispatch browser suite run against external dev
  without accidentally starting a local server?

The highest-risk gap selected for this round was Enterprise Dispatch, because
enterprise employees can enter through website booking routes, support-safe gate
states, receipts, trip links, or an embedded enterprise-app webview.

## Matrix Coverage Gap Addressed

Round 14 found the 3,000-case matrix selected only `3/13` Enterprise Dispatch
route keys:

- Covered by the matrix: `home`, `bookings`, `booking-new`
- Not reached by the matrix: `booking-review`, `booking-submitted`,
  `booking-detail`, `trip`, `receipt`, `help`, `auth-required`,
  `quota-blocked`, `embed`, `embed-unsupported`

This round proves the existing Enterprise Dispatch browser suite can run against
external dev and covers the missing deep website, gate, and embed states.

## External Dev Target

| App                 | URL                                                                |
| ------------------- | ------------------------------------------------------------------ |
| Enterprise Dispatch | `https://drts-dev-enterprise-dispatch-web-waji3fer3a-uc.a.run.app` |

## Findings And Fixes

### Finding 1 - existing suite was local-first even with an external base URL

`playwright.enterprise-dispatch.config.ts` already accepted
`ENTERPRISE_DISPATCH_BASE_URL`, but it still always declared a local
`webServer`. That made external-dev runs ambiguous because they could start a
local build/dev server even when the target pages were external.

Fix:

- Added `externalBaseUrl` handling in `playwright.enterprise-dispatch.config.ts`.
- When `ENTERPRISE_DISPATCH_BASE_URL` is set, Playwright now skips the local
  `webServer` and only targets the provided external dev URL.
- `tests/e2e/README.md` now documents the external-dev mode.

## Commands And Results

```bash
ENTERPRISE_DISPATCH_BASE_URL=https://drts-dev-enterprise-dispatch-web-waji3fer3a-uc.a.run.app pnpm test:e2e:enterprise-dispatch
```

Result after formatting and final rerun: `PASS - 3 passed (10.9s)`

Verified route groups:

- Website booking routes:
  `/`, `/bookings`, `/bookings/new`, `/bookings/review`,
  `/bookings/submitted`, `/bookings/EB-7K2E1D`, `/trip`,
  `/receipts/EB-7K28Z2`, `/help`
- Support-safe gate states:
  `/auth-required`, `/suspended`, `/approval-pending`, `/approval-rejected`,
  `/quota-blocked`, `/no-supply`, `/degraded`
- Embedded enterprise-app webview states:
  `/embed`, `/embed/reauth-required`, `/embed/unsupported-host`,
  `/embed/consent-required`, `/embed/fallback-to-web`

Verified invariants:

- Website routes render inside the enterprise shell and show `鴻碩科技`.
- Gate states include support-safe reason, impact, and next-step framing.
- Gate states do not leak protected trip detail markers such as `EB-7K2E1D`,
  `林宜君 · EB-`, or `金額 NT$`.
- Embed states stay compact, contain `embed identity` and `webview`, and do not
  render website banner chrome.
- Main enterprise pages do not expose management surfaces such as Platform
  Admin, Ops Console, Bank Console, or issuer card-order content.

## Files Added Or Updated

- `playwright.enterprise-dispatch.config.ts`
- `tests/e2e/README.md`
- `support/sidecars/TST-E2E-ENTERPRISE-DISPATCH-ROUND16/TST-E2E-ENTERPRISE-DISPATCH-ROUND16-EVIDENCE.md`

## Remaining Non-Claims

- This does not complete all 3,000 requested verification rounds.
- This does not close Fleet Partner Portal or Tenant Console deep-route gaps.
- This does not prove a live tenant backend booking mutation on external dev;
  the suite verifies rendered route surfaces and safety invariants.
- This is not live issuer eligibility proof for `E2E-007`.
- This is not pilot cutover evidence for `E2E-008`.
- This is not production launch proof for `E2E-009`.
- This does not uplift `E2E-010` strict verification-body blockers.
