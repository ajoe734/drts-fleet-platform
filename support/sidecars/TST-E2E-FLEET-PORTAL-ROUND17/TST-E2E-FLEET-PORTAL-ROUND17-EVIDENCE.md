# TST-E2E-FLEET-PORTAL-ROUND17 Evidence

**Date:** 2026-06-13  
**Owner:** Codex  
**Source revision:** `origin/dev@92641cefa22bbd28692d6a3e71f20d620ec11866`  
**Worktree:** `/tmp/drts-e2e-round13.6Cx5jT`  
**Status:** `PASS - external dev Fleet Partner Portal deep-route parity`

## Round Question

Before executing this round, the remaining verification questions were:

- Which Fleet Partner Portal routes were not reached by the first 3,000
  selected dev-runtime matrix cases?
- Which fleet-owner or fleet-dispatch direct links can fail even when the
  dashboard is green?
- Can the existing fleet portal browser parity suite run against external dev
  without starting the root Playwright local multi-server setup?

The highest-risk gap selected for this round was Fleet Partner Portal, because
fleet operators depend on driver/vehicle supply, trips, revenue share,
statements, document compliance, training, cases, and quality scorecards.

## Matrix Coverage Gap Addressed

Round 14 found the 3,000-case matrix selected only `2/11` Fleet Partner Portal
route keys:

- Covered by the matrix: `home`, `dashboard`
- Not reached by the matrix: `drivers`, `vehicles`, `trips`, `revenue`,
  `statements`, `documents`, `training`, `cases`, `quality`

This round adds a dedicated external-dev Fleet Partner Portal config that
reuses the existing deep parity spec without invoking the local root
multi-server Playwright setup.

## External Dev Target

| App                  | URL                                                                 |
| -------------------- | ------------------------------------------------------------------- |
| Fleet Partner Portal | `https://drts-dev-fleet-partner-portal-web-waji3fer3a-uc.a.run.app` |

## Findings And Fixes

### Finding 1 - deep fleet portal spec existed but lacked a dedicated external-dev command

`tests/e2e/fleet-partner-portal-parity.spec.ts` already covered the right
surface area, but it was tied to the root `fleet-partner-portal` project in
`playwright.config.ts`. Running through the root config can start several local
assistant/portal servers, which is not clean evidence for external dev.

Fix:

- Added `playwright.fleet-partner-portal-parity.config.ts`.
- Added `pnpm test:e2e:fleet-partner-portal-parity`.
- Documented the external-dev command in `tests/e2e/README.md`.

## Commands And Results

```bash
pnpm test:e2e:fleet-partner-portal-parity
```

Result after formatting and final rerun: `PASS - 3 passed (13.1s)`

Verified route group:

- `/dashboard`
- `/drivers`
- `/vehicles`
- `/trips`
- `/revenue`
- `/statements`
- `/documents`
- `/training`
- `/cases`
- `/quality`

Verified invariants:

- All 10 routes render inside one fleet partner portal shell.
- Revenue and statement actions expose a required-reason indicator.
- Locale switch from zh to English updates the shell and main content.
- API health lamp can render healthy state through the test route mock.
- Short pages such as `/revenue` and `/quality` do not create body or document
  overflow beyond the viewport.
- zh revenue labels do not leak bilingual English sublabels such as
  `Per-trip share`, `Recruitment bonus`, `Management fee`, or
  `Penalty / clawback`.

Screenshot artifacts produced under `test-results/fleet-partner-portal-parity/`:

- `fleet-dashboard.png`
- `fleet-drivers.png`
- `fleet-vehicles.png`
- `fleet-trips.png`
- `fleet-revenue.png`
- `fleet-statements.png`
- `fleet-documents.png`
- `fleet-training.png`
- `fleet-cases.png`
- `fleet-quality.png`

## Files Added Or Updated

- `playwright.fleet-partner-portal-parity.config.ts`
- `package.json`
- `tests/e2e/README.md`
- `support/sidecars/TST-E2E-FLEET-PORTAL-ROUND17/TST-E2E-FLEET-PORTAL-ROUND17-EVIDENCE.md`

## Remaining Non-Claims

- This does not complete all 3,000 requested verification rounds.
- This does not close Tenant Console deep-route gaps.
- This does not prove the full E2E-014 backend revenue-share creation chain;
  it proves the deployed fleet portal route surfaces and UI safety invariants.
- This is not live issuer eligibility proof for `E2E-007`.
- This is not pilot cutover evidence for `E2E-008`.
- This is not production launch proof for `E2E-009`.
- This does not uplift `E2E-010` strict verification-body blockers.
