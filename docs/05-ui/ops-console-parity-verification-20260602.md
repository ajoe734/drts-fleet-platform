# Ops Console Parity Verification

- Date: 2026-06-03
- Verifier: Codex
- Task: `OPS-PARITY-VERIFY`
- Branch: `codex/ops-parity-verify`
- Local app: `apps/ops-console-web`
- Local smoke URL: `http://localhost:3003`

## 1. Scope

Verification target from the parity audit brief:

- 20 route Playwright smoke
- single Ops Console shell per route
- required title and body markers per route
- anti-mixing grep must be zero
- anti-legacy CSS markers must be absent
- screenshot set at `1440x950`
- remote dev smoke must run again after deploy

## 2. Local Verification Run

Command used:

```bash
pnpm dev:ops
pnpm playwright test tests/e2e/ops-console-parity.spec.ts --grep '20 routes render inside one ops shell'
```

Observed result on 2026-06-03:

- `1 passed (53.2s)`
- All 20 route screenshots were emitted under `test-results/ops-console-parity/`

Covered routes:

1. `/dashboard`
2. `/dispatch`
3. `/dispatch/OPS-SMOKE-DISPATCH`
4. `/callcenter`
5. `/complaints`
6. `/complaints/CMP-0908`
7. `/incidents`
8. `/incidents/OPS-SMOKE-INCIDENT`
9. `/approval-requests`
10. `/reports`
11. `/revenue`
12. `/attendance`
13. `/maintenance`
14. `/drivers`
15. `/drivers/DRV-001`
16. `/vehicles`
17. `/vehicles/VEH-001`
18. `/contracts`
19. `/contracts/CTR-310`
20. `/feature-flags`

## 3. Assertion Coverage

`tests/e2e/ops-console-parity.spec.ts` currently asserts per route:

- route is not a `404`
- body does not show `404` or `Application error`
- shared Ops Console shell is present
- route title text matches the expected route-specific marker
- route-specific required body markers are present
- screenshot is written for each route

## 4. Anti-Mixing / Styling Checks

Verified locally on 2026-06-03:

- `grep -RInE 'Stepper|Timeline|WorkflowEmptyState|Management[A-Za-z]+' apps/ops-console-web ...` => no matches
- `grep -RInE '\.admin-|\.ops-' apps/ops-console-web ...` => no matches

This confirms the current `ops-console-web` body layer is not mixing the banned management primitives or legacy `.admin-*` / `.ops-*` class names.

## 5. Screenshot Evidence

`test-results/ops-console-parity/` contains 20 images:

- `ops-dashboard.png`
- `ops-dispatch-list.png`
- `ops-dispatch-detail.png`
- `ops-callcenter.png`
- `ops-complaints-list.png`
- `ops-complaints-detail.png`
- `ops-incidents-list.png`
- `ops-incidents-detail.png`
- `ops-approval-requests.png`
- `ops-reports.png`
- `ops-revenue.png`
- `ops-attendance.png`
- `ops-maintenance.png`
- `ops-drivers-list.png`
- `ops-drivers-detail.png`
- `ops-vehicles-list.png`
- `ops-vehicles-detail.png`
- `ops-contracts-list.png`
- `ops-contracts-detail.png`
- `ops-feature-flags.png`

## 6. Current Gaps

Local parity smoke now passes, but acceptance is not fully closed yet.

Remaining closeout requirement:

- remote dev deploy smoke has not been re-run from this task branch yet

Local dev logs during the smoke also showed several `control-plane-proxy/*` fetch failures to `127.0.0.1:3001`; the route bodies still rendered because the page implementations now tolerate missing local API data and provide smoke-safe fallback states. That is acceptable for local parity verification, but remote dev must still be checked against a deployed environment before marking the task done.
