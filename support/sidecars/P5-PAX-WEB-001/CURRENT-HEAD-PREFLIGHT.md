# P5-PAX-WEB-001 Current-Head Preflight

**Task:** `P5-PAX-WEB-001`
**Fleet:** E
**Authoritative head:** `8f0a8cf3bfcfb11a6afece2ccf28bf592d56941f`
**Execution baseline:** `origin/dev@2711c366f2e103ae9556d5afaf4558dfd9b0bb4c`
**Checked:** 2026-07-24

The authoritative head is two documentation/design commits ahead of, and zero
commits behind, the current `origin/dev`. Implementation starts from that head
in the isolated `codex/p5-pax-web-001` branch.

## Acceptance Classification

| Acceptance item                                              | Current-head classification | Evidence and required closure                                                                                                                                                                                                              |
| ------------------------------------------------------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pre-trip vehicle, driver, rating, route, and fare disclosure | `partial`                   | The Passenger route and authority snapshot are present, but the production card still hard-codes vehicle year, door count, rating average, and rating count instead of rendering the immutable assignment disclosure.                      |
| Rating submission and idempotent rated state                 | `partial`                   | The API accepts one rating and returns an identical replay, while rejecting a conflicting replay. The Passenger UI submits once but gates on the wrong action field and relies on a full reload instead of an explicit server-rated state. |
| Six payment status mappings                                  | `missing`                   | `PassengerPaymentStatus` defines `not_selected`, `authorized`, `captured`, `failed`, `refunded`, and `manual_recovery`; the Passenger live mapper currently ignores `view.payment`.                                                        |
| Certificate pending, available, error, and retry-read states | `partial`                   | Available receipt rendering exists. There is no pending state, dedicated read retry, or read-error recovery state.                                                                                                                         |
| Certificate legal fields                                     | `partial`                   | Fixture preview shows the expected fields, but the live mapper only exposes receipt number, amount, and issue time and does not safely read the legal record fields supplied by receipt authority.                                         |
| Production fixture prohibition                               | `verified`                  | Production forces live mode in runtime resolution and `next.config.ts` rejects an explicit production fixture configuration. Existing tests cover the runtime force-live rule; this task will add a build-config guard test.               |
| Passenger-only ownership boundary                            | `verified`                  | Work is limited to `apps/passenger-web/**`, Passenger tests, and this sidecar. Moderation, payment exception handling, and certificate support controls remain outside Passenger.                                                          |
| Mobile-first verification                                    | `partial`                   | The existing shell is constrained to a mobile viewport, but targeted state tests and final screenshot evidence still need to be recorded.                                                                                                  |

## Reuse Decision

- Reuse `GET /passenger-rides/:accessToken` as the ride authority.
- Reuse `POST /passenger-rides/:accessToken/ratings` for idempotent rating.
- Reuse `GET /passenger-rides/:accessToken/receipt` for certificate retry-read.
- Reuse the current control-plane proxy allowlist; it already permits the
  Passenger receipt read and forbids admin routes.
- Do not add Passenger moderation, payment exception, receipt regeneration, or
  certificate support commands.

## Planned Passenger-Owned Paths

```text
apps/passenger-web/components/passenger-ride-page.tsx
apps/passenger-web/lib/passenger-fixtures.ts
apps/passenger-web/lib/passenger-live.ts
apps/passenger-web/tests/unit/
support/sidecars/P5-PAX-WEB-001/
```
