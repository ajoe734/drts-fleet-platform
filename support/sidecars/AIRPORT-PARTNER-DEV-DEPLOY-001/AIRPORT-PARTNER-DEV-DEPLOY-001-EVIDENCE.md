# AIRPORT-PARTNER-DEV-DEPLOY-001 Evidence

Last updated: 2026-07-28T14:32:00Z
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

`gh run view 30353618827 --repo ajoe734/drts-fleet-platform --log-failed` confirms the failing step was `Run UI smoke against deployed dev`, and the failing assertion remained:

- `tests/e2e/partner-booking-surfaces.spec.ts:140`
- `await expect(page.getByText("預約已建立")).toBeVisible();`

## Later workflow runs on 2026-07-28

Additional `Deploy — Dev` runs after `30353618827` show the task is still blocked, and the blocker is now split between a functional smoke failure and an infra quota failure:

- `30357846786` on branch `codex2/airport-partner-dev-deploy-001-unblock-manual-unblock` at SHA `ff304139a401685e8901cf27ee1b419cebefd929`
  - completed `failure`
  - `Prepare dev deploy`, `Build & push images`, `DB migration`, `Deploy services`, and `Dev health check` all passed
  - `Dev UI smoke (playwright vs deployed)` failed again at job `90272425215`
- `30362221809` on branch `dev` at SHA `7586fe1e995341439b5351243069e3f7b99ca5a8`
  - completed `failure`
  - `Prepare dev deploy`, `Build & push images`, `DB migration`, `Deploy services`, and `Dev health check` all passed
  - `Dev UI smoke (playwright vs deployed)` failed again at job `90286715008`
- `30364460014` on branch `publish/v2026.07.28.0` at SHA `e2ab10022d8bee6004d9bdc7747d04b169089da2`
  - completed `failure`
  - `Prepare dev deploy`, `Build & push images`, `DB migration`, `Deploy services`, and `Dev health check` all passed
  - `Dev UI smoke (playwright vs deployed)` failed again at job `90295299672`
- `30359910655` on branch `dev` at SHA `9e795f2963e5b48ec2f4881e49b565c89df66dae`
  - completed `failure`
  - `Deploy services` failed before health/smoke at job `90279892827`
  - the failing step was `Deploy — api`
  - failed log message: Cloud Run `Quota exceeded for total allowable CPU per project per region.`

The most recent run that actually reached public dev (`30364460014`) still failed on the same partner-booking UI smoke as `30353618827`, so acceptance remains blocked even when build, migration, deploy, and health are green.

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

`gh run view 30364460014 --repo ajoe734/drts-fleet-platform --log-failed` shows the same failure signature on the later public-dev deploy:

- test file `tests/e2e/partner-booking-surfaces.spec.ts`
- case `creates a real booking from the airport embed flow`
- line `140`
- expectation `getByText('預約已建立')`
- both the primary run and retry timed out after submit without finding the success title

## Public dev entry probes

Re-checked from this task worktree on `2026-07-28` with `curl -L -s -o /dev/null -w '%{http_code}'`:

- `https://drts-dev-api-ne55h7sy3a-uc.a.run.app/health` -> `200`
- `https://drts-dev-platform-admin-web-ne55h7sy3a-uc.a.run.app` -> `200`
- `https://drts-dev-ops-console-web-ne55h7sy3a-uc.a.run.app` -> `200`
- `https://drts-dev-fleet-partner-portal-web-ne55h7sy3a-uc.a.run.app` -> `200`
- `https://drts-dev-tenant-console-web-ne55h7sy3a-uc.a.run.app` -> `200`
- `https://drts-dev-bank-console-web-ne55h7sy3a-uc.a.run.app` -> `200`
- `https://drts-dev-referral-embed-web-ne55h7sy3a-uc.a.run.app` -> `200`
- `https://drts-dev-partner-booking-web-ne55h7sy3a-uc.a.run.app/ctbc/program/embed` -> `200`
- `https://drts-dev-partner-booking-web-ne55h7sy3a-uc.a.run.app/cathay/program/embed` -> `200`
- `https://drts-dev-partner-booking-web-ne55h7sy3a-uc.a.run.app/taishin/program/embed` -> `200`
- `https://drts-dev-partner-booking-web-ne55h7sy3a-uc.a.run.app/dbs/program/embed` -> `200`
- `https://drts-dev-concierge-portal-web-ne55h7sy3a-uc.a.run.app` -> `200`
- `https://drts-dev-passenger-web-ne55h7sy3a-uc.a.run.app` -> `404`
- `https://drts-dev-enterprise-dispatch-web-ne55h7sy3a-uc.a.run.app` -> `200`
- `https://drts-dev-enterprise-dispatch-web-ne55h7sy3a-uc.a.run.app/bookings/new` -> `200`
- `https://drts-dev-enterprise-dispatch-web-ne55h7sy3a-uc.a.run.app/embed/unsupported-host` -> `200`
- `https://drts-channel-partner-portal-web-ne55h7sy3a-uc.a.run.app` -> `200`

Spot-check re-run at `2026-07-28T14:30Z` still matches the public-dev state:

- `https://drts-dev-api-ne55h7sy3a-uc.a.run.app/health` -> `200`
- `https://drts-dev-partner-booking-web-ne55h7sy3a-uc.a.run.app/ctbc/program/embed` -> `200`
- `https://drts-dev-passenger-web-ne55h7sy3a-uc.a.run.app` -> `404`

These probes support the same conclusion as the workflow health job: the deploy is broadly reachable and not blocked by 5xx at the entry-origin level. The release remains blocked by the real airport booking create smoke.

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

Acceptance is blocked pending:

- a GitHub `Deploy — Dev` run that completes without the Cloud Run CPU quota failure seen in `30359910655`
- a public dev deploy whose `Dev UI smoke (playwright vs deployed)` no longer fails the real airport embed booking create assertion seen in `30353618827`, `30357846786`, `30362221809`, and `30364460014`
- a deploy source SHA that actually includes the task branch fixes rather than the older SHAs already observed failing on public dev
