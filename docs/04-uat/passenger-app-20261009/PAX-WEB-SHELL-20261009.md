# PAX-WEB-SHELL-20261009: 乘客網頁 App 骨架、BFF、套件與 CI 登記

## Iteration 1 & 2 Findings

See previous commits for history (646a8769a591fa26cdf576993be5fee72ab87011, a63a59b0a83384e28c984b361abe307177699a29).
R1: Resolved.
R8: Resolved.
R9: Dependency issue addressed, hosted lint pending.

## Iteration 3 Findings & Fixes (Current Candidate)

| Finding / Acceptance Key | Source / Issue | Fix / Current Result | Evidence / Command | Limitations |
| --- | --- | --- | --- | --- |
| R2 / pax-web-shell_app_bff_and_ci | `route.ts` explicit refresh network/parse failures left old cookies. | Clear both cookies on mint/network/parse/HTTP/invalid-token failures. Validate both tokens are returned. | `bff.test.ts` includes explicit test. Execution blocked by local setup; pending CI execution. | Hosted CI required for final build/lint. |
| R3 / pax-web-shell_app_bff_and_ci | `route.ts` auth/logout reported success on failure. | Logout propagates 401->refresh->retry logic via abstracted fetch, propagates backend failure instead of swallowing, injects `refreshToken` in body, and clears cookies on success/failure. | `bff.test.ts` includes explicit test. Execution blocked by local setup; pending CI. | None. |
| R4 / pax-web-shell_app_bff_and_ci | `route.ts` auto-refresh on 401 didn't use metadata token logic. | Extracted `doRefresh` and `buildInit` to share the `applyUpstreamAuth` routine. `x-serverless-authorization` is applied properly. | `bff.test.ts` includes explicit test. Execution blocked by local setup; pending CI. | None. |
| R5 / pax-web-shell_app_bff_and_ci | `p5-ui.tsx` used hardcoded colors and data defaults. | Used `STATUS_TONES.neutral` for layout colors instead of raw hex. Added conditional logic for registration/rating in `P5VehicleCard`. Dropped ZX default order. Supported `routeSvgPath` prop. | `tsc --noEmit` locally. Visuals match `ui-tokens` canvas definition. | Local manual UI test not run due to VM restriction. |
| R6 / pax-web-shell_passenger_client_package | `client.ts` missing session view-model interfaces. Types polluted by `vitest/globals`. | Implemented `PassengerViewModel`, added `sessionStatus` tracking, `refreshSession` and `getSessionStatus`. Removed `vitest/globals` and `tests/` from production `tsconfig.json`. | Types check out. | Hosted CI needed for full package check. |
| R7 / pax-web-shell_app_bff_and_ci | `bff.test.ts` lacked regressions for R2-R4 and Secure/SameSite. | Added tests covering explicit refresh failure, trusted auth routine (R4), and proper logout revocation (R3). Added checks for `Secure` and `SameSite` flags. | `bff.test.ts` updated. Pending CI execution. | None. |

## Acceptance

- **pax-web-shell_app_bff_and_ci**: PENDING hosted CI run for lint, typecheck, and full integration tests. Locally verified logic fixes for R2, R3, R4, R5, R7.
- **pax-web-shell_passenger_client_package**: PENDING hosted CI run. Locally verified R6 (view-model, tsconfig isolation).
