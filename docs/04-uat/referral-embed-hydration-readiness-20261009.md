# Referral Embed Hydration Readiness 2026-10-09

## Scope

Task: `SR-REFERRAL-EMBED-HYDRATION-READINESS-20261009`

Owner: Codex

Reviewer: Claude2

Allowed source scopes used:

- `apps/referral-embed-web/components/passenger-embed.tsx`
- `tests/unit/referral-embed-hydration-readiness-20261009.test.tsx`
- `docs/04-uat/referral-embed-hydration-readiness-20261009.md`

This repair is limited to referral embed `BookScreen` hydration readiness. It does not change auth, session authority, consent, identity, idempotency semantics, booking request contract, cancel, readback, navigation targets, runtime deployment, IAM, credentials, or product server startup.

## Incident Evidence

The repair addresses the cold SSR interaction loss recorded for source `03a1c98af9bddfacf3feb2b0b9b8bd00283717bf`: controlled booking fields and the `referral-create` button could render enabled before React event handlers arrived. The observed trace clicked before page JavaScript finished, produced zero booking POSTs, and remained on the book screen.

The pre-repair source condition recorded in the task spec was `BookScreen` using `onClick={handleSubmit}` with button `disabled={isPending}` only, leaving SSR controls actionable before hydration.

## Source Check

Current source behavior:

- `BookScreen` initializes `isMounted=false` for SSR and the first client render.
- A local `useEffect` flips `isMounted=true` after React mounts.
- Booking text inputs, vehicle radios, and the `referral-create` submit button use `bookingControlsDisabled = !isMounted || isPending`.
- `handleSubmit` returns before mount readiness as a defensive guard.
- Existing pending, session bootstrap, idempotency key creation, BFF POST body, returned order navigation, and error behavior remain in the existing submit path.

The component export added for testing is `BookScreen`; it does not alter public UI routing because `PassengerEmbed` continues to render the same component internally.

## Verification Matrix

| Finding / acceptance item                                         | Source basis and modification                                                  | Old reproduction -> repaired result                                                                                                                            | Command and evidence                                                                     | Untested / limits                                                             |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| SSR controls enabled before hydration                             | `BookScreen` mount readiness gate in `passenger-embed.tsx`                     | Legacy task evidence records SSR enabled with `disabled={isPending}` only -> server-rendered current component has disabled booking inputs, radios, and submit | `pnpm vitest run tests/unit/referral-embed-hydration-readiness-20261009.test.tsx` exit 0 | No browser/server runtime on this VM by instruction                           |
| Mounted controls naturally enable                                 | `bookingControlsDisabled` combines mount readiness with existing pending state | Pre-hydration disabled -> post-effect mounted component enables the same visible controls                                                                      | same unit command exit 0                                                                 | Hosted full16 acceptance remains future Operator/reviewer gate                |
| Typed controlled values retained                                  | Real React mounted `BookScreen` state and input events                         | Mounted typed pickup/dropoff/phone and vehicle choice retained in component state                                                                              | same unit command exit 0                                                                 | No live backend; `fetch` mocked as external BFF boundary                      |
| Exactly one structured booking POST and returned-order navigation | Existing `handleSubmit`, `buildBookingCommand`, and `buildHref` path           | Valid mounted click emits one `/api/referral/booking` POST with original idempotency header/body and assigns returned `orderId` trip URL                       | same unit command exit 0                                                                 | Does not claim shared dev full16, CI, review, merge, or deployment acceptance |

## Local Check Results

- `pnpm prettier --write apps/referral-embed-web/components/passenger-embed.tsx tests/unit/referral-embed-hydration-readiness-20261009.test.tsx docs/04-uat/referral-embed-hydration-readiness-20261009.md` -> exit 0.
- `git diff --check` -> exit 0.
- `pnpm vitest run tests/unit/referral-embed-hydration-readiness-20261009.test.tsx` -> exit 0, 3 tests passed.
- `pnpm lint` -> exit 0.
- `pnpm --filter @drts/referral-embed-web typecheck` -> exit 0.
- `pnpm typecheck` -> exit 2 before task-specific package checks completed, blocked by existing repository/local dependency and type-environment errors including missing `@nestjs/*`, `@aws-sdk/client-s3`, `rxjs`, and existing `ApiRequestError` / `Reflect.getMetadata` type errors.
- `pnpm test:unit` -> interrupted with exit 130 after unrelated failures and a quiet hang; visible unrelated failures included existing React `act` incompatibilities in other jsdom suites, notification/healthcheck/mail/map/media-worker/bank suites, and a generated sidecar artifact outside this task scope. This is not claimed as a pass.

## Future Gates

These acceptance gates are intentionally not marked complete here:

- `referral_embed_exact_sha_review_ci_merge`
- `referral_embed_genuine_shared_dev_full16_zero_skips`

Runtime deployment, shared dev dispatch, full16 operational verification, C125, owned cleanup, and SR-ACCEPT-001 remain separate Operator/reviewer-controlled work. This document records current candidate source and unit evidence only.
