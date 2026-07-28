# AIRPORT-PARTNER-DEV-DEPLOY-001 Evidence

Last updated: 2026-07-28T13:30:00Z
Owner: Codex
Reviewer: Codex2

## Scope

- GitHub Actions run: `30353618827`
- Workflow: `Deploy — Dev`
- Workflow source SHA: `ff304139a401685e8901cf27ee1b419cebefd929`
- Public dev partner booking origin: `https://drts-dev-partner-booking-web-ne55h7sy3a-uc.a.run.app`

## Workflow verdict

- Run status: `completed`
- Run conclusion: `failure`
- Started: `2026-07-28T11:08:58Z`
- Completed: `2026-07-28T11:30:09Z`

Job results from `gh run view 30353618827 --repo ajoe734/drts-fleet-platform --json ...`:

- `Prepare dev deploy`: `success`
- `Build & push images`: `success`
- `DB migration`: `success`
- `Deploy services`: `success`
- `Dev health check`: `success`
- `Dev UI smoke (playwright vs deployed)`: `failure`

## Failing acceptance point

The deploy did reach public dev and passed health checks, but the workflow did not satisfy acceptance because the UI smoke failed on the real airport embed booking create path.

Failing Playwright case from GitHub job `90259587243`:

- File: `tests/e2e/partner-booking-surfaces.spec.ts`
- Test: `partner booking program surfaces › creates a real booking from the airport embed flow`
- Failure point: after clicking `確認送出預約`, the test waited 5 seconds for `預約已建立` and never found it.

## Deployed repro evidence

Local repro against the deployed dev URL used the same test path as the workflow:

- Command:
  `DRTS_DEV_PARTNER_BOOKING_BASE_URL='https://drts-dev-partner-booking-web-ne55h7sy3a-uc.a.run.app' PARTNER_BOOKING_SKIP_WEBSERVER=1 pnpm exec playwright test tests/e2e/partner-booking-surfaces.spec.ts -g 'creates a real booking from the airport embed flow' --config playwright.partner-booking-surfaces.config.ts`
- Result: `1 failed`

Observed deployed path:

- `GET /ctbc/program/embed?apiKey=pk_live_embed&partnerUserRef=user-001&referenceToken=token-001&cardLast4=1234&cardholderName=王小明&benefitReference=benefit-001&flightNo=CI100` -> `200`
- `GET /control-plane-proxy/health` -> `200`
- `POST /ctbc/program/embed?...same query...` -> `200`

Observed post-submit page state on deployed dev:

- The page stayed on the embed flow URL.
- The success title `預約已建立` never rendered.
- The page rendered the user-visible error copy `預約送出失敗。`

This means the current public dev deploy is not failing with an outer HTTP 5xx on submit; it is failing inside the booking submit action and returning an error state to the page.

## Commit relationship

The deploy source SHA is behind the current task branch fixes:

- deployed SHA: `ff304139a401685e8901cf27ee1b419cebefd929`
- task branch HEAD: `dcb7fd8a4`
- task-owned commits not included in the failed deploy:
  - `0e1115da7` `wip(AIRPORT-PARTNER-DEV-DEPLOY-001): defer partner tracking fetch`
  - `dcb7fd8a4` `wip(AIRPORT-PARTNER-DEV-DEPLOY-001): forward partner embed api key`

So the failed workflow validates the older deployed SHA, not the latest branch head containing the embed api key forwarding patch.

## Current verdict

- `workflow run 30353618827 completes successfully`: no
- `all build migration deploy and health jobs pass`: no, UI smoke failed
- `all configured dev entry origins return expected non-5xx responses`: partially yes for the checked HTTP surfaces, but the real airport booking create flow still fails functionally
- `CTBC Cathay Taishin DBS airport entries pass`: entry pages load, but CTBC real create flow fails
- `Fubon and Lion partner entries pass`: not yet re-validated as final acceptance because deploy already failed
- `real airport booking create and tracking smoke passes`: no
- `deployment verdict and evidence are recorded`: yes, in this file

## Blocker

Acceptance is blocked pending a new GitHub dev deploy that includes the branch-head fixes and passes the same real airport embed booking create smoke on public dev.
