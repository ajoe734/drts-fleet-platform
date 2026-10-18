# PAX-BUREAU-JOURNEY-COVERAGE-20261018

Backfills real browser/BFF evidence for gaps the bureau review
(`.local/passenger-transport-bureau-review-20261015/parallel-work-routing-20261018/bureau-sixteen-case-source-review/review.md`)
flagged across the original 16 passenger review-drill use cases (UC01-16).
This is an incremental, multi-session task; this document is updated as each
slice lands, not rewritten from scratch per slice. See that review.md for the
full per-UC source audit this task continues from.

## Finding/acceptance table (§0.7 format)

| Finding／驗收項 | 原始碼依據與修改位置 | 舊版重現 → 修正版結果 | 命令、退出碼、執行版本與證據位置 | 未驗項與具體限制 |
| --- | --- | --- | --- | --- |
| B — stale "等待行程付款狀態更新" message after a real retry-payment capture (UC11 adjacent; `actual-Root-current-B-retry-feedback-original-finding.json`) | `apps/passenger-app-web/components/review-demo/ride-controls.tsx` now reads `payment.status` from the real `POST /api/passenger-app/review-demo/rides/:orderId/retry-payment` response body via `passengerPaymentDisplay` (`packages/passenger-client/src/payment/state.ts`); `apps/passenger-app-web/components/review-demo/translations.ts` static `retryQueued` string removed | Same-order `d9c8050d-...` had `captured`/`authorized`/`manual_recovery`/fetch-failure outcomes all previously rendered the same stale queued text; now each renders its own authoritative message | `pnpm exec vitest run tests/unit/pax-bureau-journey-coverage-20261018/ride-controls-payment-feedback.test.tsx` → 4/4 passed, re-run this session, commit `ae0d2192a` | Mocks only the `review-context`/`fetch` boundary, not the status-mapping logic under test; no hosted-browser run of this specific retry click yet |
| UC01 — consent checkbox does not gate `繼續`, and refusal does not revoke the session | `apps/passenger-app-web/components/auth/consent-gate.tsx:164-219` (existing); new `tests/e2e/pax-bureau-acceptance.spec.ts` test `"consent gate blocks continue until checked, and refusal revokes the session"` | No prior browser-level proof the checkbox actually disables `繼續`, or that `不同意並登出` really calls `/auth/logout` and leaves `/me` returning 401 for a genuinely never-consented synthetic phone (`0900000010`) | New test, not yet run (VM forbids `playwright`/browser servers; hosted-only per `playwright.pax-review-shared-order.config.ts`'s `GITHUB_ACTIONS` guard); wired into `.github/workflows/ci-integ.yml` job `ui-bureau-acceptance-e2e` | Pending first hosted CI run against this candidate's SHA |
| UC01 — wrong OTP code attempts and five-attempt lockout | `apps/api/src/modules/passenger-app/otp/passenger-otp.service.ts::verify` (existing `attempts`/`invalidatedAt` logic); new test `"wrong OTP codes count down remaining attempts and lock after five"` (phone `0900000011`) | No prior browser-level proof of the real per-attempt countdown copy or that the real fifth attempt's `400 invalid_code` disables `驗證` | Same hosted job as above; not yet run | Pending first hosted CI run |
| UC01 — resend issues a new challenge; the superseded one is rejected server-side | `passenger-otp.service.ts::request`'s `invalidateTarget` (existing); new test `"resend issues a new code..."` (phone `0900000012`), using a real 60s cooldown wait, not a fake clock | No prior browser-level proof that resend actually invalidates the first challenge server-side (vs. only hiding it client-side) | Same hosted job; not yet run | Pending first hosted CI run |
| UC01 — the real five-minute code expiry (explicitly flagged as still missing in review.md) | `passenger-otp.service.ts::request`'s hard-coded `expiresAt: now+300_000` (not env-tunable); `apps/passenger-app-web/components/auth/otp-flow.tsx`'s client-side `expired`/`verify()` guard; new test `"the real five-minute code expiry locks the UI and the server rejects the stale code"` (phone `0900000014`), real `page.waitForTimeout(301_000)`, no fake clock | Previously only unit-level/short-window evidence existed; this is the first real elapsed-five-minute proof that (a) the UI disables `驗證` and the 6 code inputs, (b) the server independently rejects the stale code/challenge pair via `directOtpVerify` with `400 invalid_code`, and (c) the account recovers via a real resend + full login | Same hosted job; `playwright.pax-bureau-acceptance.config.ts` keeps the file's default 5-minute test timeout for the other cases but this test calls `test.setTimeout(8*60_000)` itself; `ci-integ.yml`'s `ui-bureau-acceptance-e2e` job timeout raised 15→25 minutes to fit the real wait plus install/build/browser-install; not yet run | Pending first hosted CI run; this is the single most expensive case in the file (~5.5 real minutes) |
| UC01 — a returning session with already-current consent skips the consent gate (explicitly flagged as still missing in review.md) | `consent-gate.tsx::load`'s `termsVersion`/`privacyVersion` match → immediate `onAccepted()` (existing); new helpers `acceptConsent`/`logoutFromAccount` in `tests/e2e/pax-bureau-acceptance/otp-consent-journey.ts`; new test `"a returning session with current consent skips the consent gate on the next login"` (phone `0900000015`) | Previously only inferred from source reading (review.md UC01 note: "原「僅回訪登入」文字已落後"); this is the first real browser proof — login, accept consent, real `/account` → `登出` → `登出` (confirm) → `/auth/logout` → `/login`, log back in with the same phone, and assert the consent heading never renders and the page lands on `/` | Same hosted job; not yet run | Pending first hosted CI run; does not yet cover a second *device* (separate browser context) sharing the same account — see outstanding UC02 below |

## What this slice covers vs. what remains

This task spec (`.local/passenger-bureau-gap-correction-20261018/PAX-BUREAU-JOURNEY-COVERAGE-20261018.md`)
scopes five numbered work items plus the original UC01-16 backlog. Current
state, honestly:

- Item 1 (new-user OTP/consent, §UC01): now has real browser/BFF evidence for
  consent-gate check/uncheck/refusal, wrong-code/lockout, resend, the real
  five-minute expiry, and returning-session consent-skip — six of the
  UC01 branches review.md listed as outstanding. **Not yet run against
  hosted CI** (see table above); this file's `write_scopes` forbid starting
  a browser/product server on this VM, so these cases are unverified beyond
  `tsc --noEmit` (clean, no new errors attributable to these files) and
  `eslint --max-warnings=0` (clean) until the hosted `ui-bureau-acceptance-e2e`
  job runs against this candidate's SHA.
- Items 2-5 (cancellation no-charge/no-overcharge proof, 60s-vs-90s timeout
  applicability, driver-data-gap/map-failure/reconnect/cross-device, and the
  E04/fare/complaint backfill) and UC02-UC16 generally: **not started in this
  slice**. review.md already has a per-UC source/evidence audit (file/symbol
  references, which product seam owns each gap, and which UUIDs/artifacts are
  already credited) — continue from there rather than re-auditing. In
  particular:
  - UC02 (payment-method UI changes, cross-device/session recovery) needs
    product-surface write access this task's `write_scopes` does not grant
    (`apps/passenger-app-web/components/payment/*`,
    `apps/api/src/modules/passenger-app/account/*`); route through
    Supervisor for a `write_scopes` update if this task is meant to carry it,
    or leave it to the owning product seam per review.md's 歸屬 line.
  - UC06's real 90-second matching-job timeout and UC04's real 15-minute
    quote-TTL wait are each their own multi-minute real-time hosted case,
    same shape as the five-minute OTP expiry above; not attempted this slice.
  - UC09 (map-provider failure/recovery), UC10 (mid-request offline/lost-ACK
    idempotency), UC05 (post-arrival/`proof_pending` cancellation UI
    rejection), UC07 (reassignment disclosure), UC08 (contact-unavailable UI)
    and UC11-16 (payment dunning, welfare/wheelchair eligibility, document
    retry, rating/complaint) are each still open per review.md's 仍需內部工作
    sections; none attempted this slice.

## Verification performed on this VM (repo-level only; no product/browser server started)

- `pnpm exec tsc --noEmit -p tsconfig.json`: pre-existing unrelated errors in
  this worktree (stale `tenant-console-web`/`api-client` symlink/dist state —
  e.g. `TENANT_SESSION_COOKIE_NAME` export errors, `ApiClient.baseUrl`
  private-property conflicts) are present on files this task does not touch;
  zero errors reference `pax-bureau-acceptance` or `otp-consent-journey`.
- `pnpm exec eslint --max-warnings=0` on every file this task modified this
  slice (`tests/e2e/pax-bureau-acceptance.spec.ts`,
  `tests/e2e/pax-bureau-acceptance/otp-consent-journey.ts`,
  `playwright.pax-bureau-acceptance.config.ts`,
  `tests/unit/pax-bureau-journey-coverage-20261018/ride-controls-payment-feedback.test.tsx`):
  clean.
- `pnpm exec vitest run tests/unit/pax-bureau-journey-coverage-20261018/ride-controls-payment-feedback.test.tsx`:
  4/4 passed.
- `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci-integ.yml'))"`:
  valid YAML after the `ui-bureau-acceptance-e2e` job edits.
- Not run on this VM (forbidden — no product/browser/Postgres servers here):
  the `playwright.pax-bureau-acceptance.config.ts` suite itself. All five
  OTP/consent-gate browser cases above are pending the hosted
  `ui-bureau-acceptance-e2e` CI job triggered by this candidate's push.

## Outstanding acceptance items requiring shared/hosted verification

Both `required_acceptance` keys
(`pax-bureau-coverage_each-finding-real-evidence-and-applicability`,
`pax-bureau-coverage_same-release-hosted-journeys`) need the hosted CI run of
`ui-bureau-acceptance-e2e` against this candidate's SHA, and — per the task
spec's second acceptance item — a same-release pass against the Root's
unified shared deployment once merged. Neither is satisfiable from this VM.
The finding/acceptance table above records what is claimed vs. pending per
case so reviewer/CI can confirm each independently rather than accepting a
single "all green" summary.
