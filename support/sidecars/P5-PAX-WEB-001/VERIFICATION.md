# P5-PAX-WEB-001 Verification

**Fleet:** E
**Branch:** `codex/p5-pax-web-001`
**Authoritative head:** `8f0a8cf3bfcfb11a6afece2ccf28bf592d56941f`
**Status:** Implemented and verified locally; not deployed or published
**Verified:** 2026-07-24

## Closed Acceptance Items

| Acceptance item         | Result                                                                                                                                                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pre-trip disclosure     | Vehicle make/model/plate/model year/door count, driver registration, rating, route, and fare now render from the immutable assignment authority.                                                                 |
| Rating state            | Passenger submission uses `canRate`; a successful response immediately becomes a non-repeatable rated state. A ready receipt no longer skips an unrated completed trip.                                          |
| Payment states          | All six canonical statuses have explicit Passenger copy and tone. No payment retry control is fabricated.                                                                                                        |
| Certificate states      | Pending, available, incomplete/error, and token-scoped retry-read states are implemented.                                                                                                                        |
| Certificate fields      | Available state requires vehicle number, pickup/dropoff time, duration, route, distance, fare, toll, customer-service phone, and authority complaint phone. Missing fields fail closed without fixture fallback. |
| Production fixture gate | Production forces live authority and rejects an explicit fixture build configuration.                                                                                                                            |
| Runtime load            | Added the missing Passenger-local `tailwindcss` dependency required by the existing global stylesheet.                                                                                                           |
| Ownership boundary      | No Platform Admin, Ops Console, canonical design, requirement packet, moderation, payment-exception, or certificate-support surface was changed.                                                                 |

## Verification

```text
pnpm --filter @drts/passenger-web typecheck
PASS

pnpm --filter @drts/passenger-web lint
PASS

pnpm --filter @drts/passenger-web test
PASS - 3 files, 21 tests

pnpm --filter @drts/api exec vitest run \
  tests/unit/multi-taxi.service.test.ts \
  -t "accepts one idempotent rating only after trip completion"
PASS - 1 test

NODE_ENV=production NEXT_PUBLIC_PASSENGER_RIDE_DATA_MODE=fixture \
  pnpm --filter @drts/passenger-web build
EXPECTED REJECTION - PASSENGER_PRODUCTION_FIXTURE_FORBIDDEN

NODE_ENV=production NEXT_PUBLIC_PASSENGER_RIDE_DATA_MODE=live \
  pnpm --filter @drts/passenger-web build
PASS - includes /ride/[token]/receipt

pnpm exec prettier --check apps/passenger-web \
  support/sidecars/P5-PAX-WEB-001 pnpm-lock.yaml
PASS

git diff --check
PASS
```

## Mobile Evidence

All captures use a 390-pixel mobile viewport against a local token-scoped mock
authority. They are evidence only and were not deployed.

- `screenshots/01-pretrip-disclosure.png`
- `screenshots/02-rating-payment-certificate-pending.png`
- `screenshots/03-certificate-available.png`
- `screenshots/04-certificate-fail-closed.png`

## Release State

This branch is ready for code review. No deployment, production publication, or
release promotion was performed.
