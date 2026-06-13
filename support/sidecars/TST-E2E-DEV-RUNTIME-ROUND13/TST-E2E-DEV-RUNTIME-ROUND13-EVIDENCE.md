# TST-E2E-DEV-RUNTIME-ROUND13 Evidence

**Date:** 2026-06-13  
**Owner:** Codex  
**Source revision:** `origin/dev@92641cefa22bbd28692d6a3e71f20d620ec11866`  
**Worktree:** `/tmp/drts-e2e-round13.6Cx5jT`  
**Status:** `PASS - external dev runtime matrix and targeted browser suites`

## Round Question

Before executing this round, the remaining verification questions were:

- Which deployed dev surfaces are now included in the 3,000-case matrix, and are any still excluded?
- Which realistic combinations are easy to miss even when the matrix is green?
- Which browser interactions are not proven by HTTP marker checks alone?

The highest-value unverified combination for this round was the deployed-dev
surface mix that previously caused confusion: Bank Console, Partner Booking,
Enterprise Dispatch, and the existing platform/ops/fleet/tenant surfaces under
different actors, locales, devices, and query intents.

## External Dev URLs

| App                  | URL                                                                 |
| -------------------- | ------------------------------------------------------------------- |
| API                  | `https://drts-dev-api-waji3fer3a-uc.a.run.app`                      |
| Bank Console         | `https://drts-dev-bank-console-web-waji3fer3a-uc.a.run.app`         |
| Partner Booking      | `https://drts-dev-partner-booking-web-waji3fer3a-uc.a.run.app`      |
| Enterprise Dispatch  | `https://drts-dev-enterprise-dispatch-web-waji3fer3a-uc.a.run.app`  |
| Platform Admin       | `https://drts-dev-platform-admin-web-waji3fer3a-uc.a.run.app`       |
| Ops Console          | `https://drts-dev-ops-console-web-waji3fer3a-uc.a.run.app`          |
| Fleet Partner Portal | `https://drts-dev-fleet-partner-portal-web-waji3fer3a-uc.a.run.app` |
| Tenant Console       | `https://drts-dev-tenant-console-web-waji3fer3a-uc.a.run.app`       |

## Commands And Results

```bash
pnpm install --frozen-lockfile
```

Result: `PASS`

```bash
pnpm exec playwright test -c playwright.dev-runtime-matrix.config.ts --grep "matrix generation covers exactly 3000"
```

Result: `PASS - 1 passed`

```bash
pnpm exec playwright test -c playwright.dev-runtime-matrix.config.ts
```

Result: `PASS - 3001 passed (3.1m)`

Coverage notes:

- The 3,000 generated cases plus one generation guard included no excluded surfaces.
- The matrix exercised API, Bank Console, Partner Booking, Enterprise Dispatch, Platform Admin, Ops Console, Fleet Partner Portal, and Tenant Console.
- The run covered zh-TW/en-US, desktop/tablet/mobile user agents, multiple actor profiles, route depth beyond home pages, and query intents such as search, filtered open, review queue, billing period, export context, freshness, and deeplink return.

```bash
DRTS_DEV_BANK_CONSOLE_BASE_URL=https://drts-dev-bank-console-web-waji3fer3a-uc.a.run.app pnpm test:e2e:bank-console-auth
```

Result: `PASS - 1 passed`

Verified:

- CTBC bookings page exposes protected data only while signed in.
- Sign-out redirects direct management deep links to `/login`.
- Signed-out views do not expose protected booking/card/benefit data (`CH••••98`, `BK-240611-018`, `BE••••42`).
- Demo persona sign-in restores access.

```bash
DRTS_DEV_BANK_CONSOLE_BASE_URL=https://drts-dev-bank-console-web-waji3fer3a-uc.a.run.app pnpm test:e2e:bank-console-depth
```

Result: `PASS - 4 passed`

Verified:

- Fubon management pages stay scoped to selected bank, locale, and role.
- Cathay non-admin persona cannot use account-management actions.
- Signed-out Fubon statement deep links remain behind the auth boundary.
- CTBC to Fubon bank switching, zh/en locale switching, signed-out chrome, and account popover scoping are stable.

```bash
DRTS_DEV_PARTNER_BOOKING_BASE_URL=https://drts-dev-partner-booking-web-waji3fer3a-uc.a.run.app pnpm test:e2e:partner-booking-surfaces
```

Result: `PASS - 5 passed`

Verified:

- CTBC card website booking and bank-app embed identity states remain distinct.
- Embed consent and standalone fallback do not capture raw card data.
- Fubon insurance and Lion travel stay on site-only funnels.
- Insurance blocked states render as site-only eligibility states.
- Only the card program selector exposes the bank-app embed surface.

## Findings

- No runtime failures were found in this round.
- Documentation drift was found: `tests/e2e/README.md` did not mention the
  current browser/dev-runtime suites or the external dev URLs used by the 3,000-case matrix.
- This sidecar and README update close that evidence gap for this round.

## Remaining Non-Claims

- This is not live issuer eligibility proof for `E2E-007`.
- This is not pilot cutover evidence for `E2E-008`.
- This is not production launch proof for `E2E-009`.
- This does not uplift `E2E-010` strict verification-body blockers.
- This does not merge or replace the open `E2E-010` / `E2E-011` / `E2E-012` work in PR #679.
