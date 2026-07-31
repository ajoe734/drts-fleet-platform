# Stage 1 Controllable Audit — 2026-07-31

## Scope

Read-only audit of `origin/dev` (`8a40248967bdc37a60a22e6d37c8ad5dca02bd41`), the current GitHub workflow/config surface, and the observable dev Cloud Run/custom-domain state for `drts-dev-ray-tw-20260730` in `us-central1`.

This report excludes all four external gates by design:

- real bank / issuer live credentials
- live forwarded-platform adapter proof
- mobile store / distribution
- live CTI / recording / filing activation

## Executive Read

The controllable gaps are no longer "missing broad Stage 1 scaffolding". The repo already has deep app/workflow/test coverage. The remaining gaps are concentrated in:

1. product-semantic regressions in governed billing / quota / audit and regulatory dispatchability
2. release-truth drift between docs, deploy workflows, and live custom-domain behavior
3. missing automated verification for official URLs and for the retired/passenger/concierge topology seam
4. one still-open safety-critical driver incident/SOS failure

## High-Priority Gaps

### P0 — Driver SOS / incident creation still fails for the driver realm

- Evidence:
  - `docs/04-uat/driver-app-verification-20260615/99-summary-and-findings.md`
  - `docs/04-uat/driver-app-verification-20260615/round-10-incident-heartbeat.md`
- Current proof:
  - Round 10 records `POST /api/incidents` returning `403` for driver incident/SOS submission.
  - The summary marks this as `HIGH — safety-critical`.
- Why it remains a controllable Stage 1 gap:
  - This is a repo/API auth or controller-policy defect, not an external provider gate.
  - It blocks a first-party driver safety path already claimed inside repo-local verification packs.
- Dispatchable slice:
  - `STAGE1-SAFETY-INCIDENT-001`: make driver-initiated incident/SOS creation succeed for the intended authenticated driver identity, add negative-path RBAC tests for non-driver callers, rerun the Round 10 verification.

### P1 — Governed billing / quota semantics remain internally inconsistent despite release docs claiming live readiness

- Evidence:
  - GitHub issues `#72`, `#73`, `#74`
  - `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`
  - `tests/e2e/README.md`
- Current proof:
  - `#72`: `completeDriverTask` does not flip quota summary `pending` -> `confirmed`.
  - `#73`: six historical governance audit action names disappeared without aliasing.
  - `#74`: no quota-ledger `consume` entry is written at task completion.
  - The release-gates runbook still marks `WF-FIN-GOV-001` as `PASS (live staging evidence)`.
  - `tests/e2e/README.md` simultaneously says `E2E-010-governance-aware-billing-reporting.sh` is still a shell whose uplift remains blocked pending a governed staging rerun.
- Why it remains a controllable Stage 1 gap:
  - All three defects are repo/API semantics or contract/audit-compatibility problems.
  - The repo currently overstates closure for this workflow family.
- Dispatchable slices:
  - `STAGE1-FIN-GOV-SEM-001`: decide and implement the intended quota lifecycle semantics at completion time, then restore assertions/evidence for `pending` -> `confirmed`.
  - `STAGE1-FIN-GOV-AUDIT-001`: restore legacy audit action aliases or update all downstream consumers and evidence packs atomically.
  - `STAGE1-FIN-GOV-LEDGER-001`: either emit `consume` entries on completion or remove the stale union member from contracts and dependent readers.
  - `STAGE1-FIN-GOV-DOC-001`: reconcile `WF-FIN-GOV-001` release language with the actual E2E/live evidence state.

### P1 — Regulatory dispatchability does not recover after compliance is restored

- Evidence:
  - GitHub issue `#71`
  - `docs/04-uat/phase1-uat-checklist.md` rows `OC-013` and `OC-014`
- Current proof:
  - After exclusivity/insurance/contract status returns to active, `vehicle.dispatchableFlag` stays `false` and the system continues reporting `manual_hold`.
- Why it remains a controllable Stage 1 gap:
  - This is owned by repo business logic in the regulatory lifecycle/reconciliation path.
  - It directly affects a named Stage 1 ops onboarding/eligibility workflow.
- Dispatchable slice:
  - `STAGE1-REG-DSP-001`: define whether post-restoration recovery is automatic or requires an explicit operator action; implement the chosen behavior plus UI/runbook/test evidence.

## Release-Truth / Runtime Drift

### P1 — Official dev URLs have no automated truth gate, and the custom-domain runbook is materially stale

- Evidence:
  - `docs/03-runbooks/smarttransport-tw-custom-domains.md`
  - `.github/workflows/domain-mappings-dev.yml`
  - `.github/workflows/deploy-dev.yml`
  - live probes on `2026-07-31`
- Current proof:
  - `docs/03-runbooks/smarttransport-tw-custom-domains.md` still says the subdomains were not yet connected to Cloud Run.
  - Live probe on `2026-07-31` shows `https://refer.smarttransport.tw/` returns `307` to `/embed/referral-demo-community`, and `https://refer.smarttransport.tw/embed/referral-demo-community` returns `200`.
  - The other official hosts (`ops`, `dispatch`, `tenant`, `bank`, `channel`, `book`, `partners`, `fleets`, `api`) all resolve in DNS to `ghs.googlehosted.com` but currently fail TLS/HTTPS probing from this environment.
  - `deploy-dev.yml` health-checks direct Cloud Run service URLs, not the official `smarttransport.tw` hosts.
  - `domain-mappings-dev.yml` exists, but it is manual and has no acceptance gate tying official-host readiness to release truth.
- Why it remains a controllable Stage 1 gap:
  - The repo and current GCP permissions already own the mapping workflow and the release wording.
  - The gap is in validation and truth-sync, not in an excluded external dependency category.
- Dispatchable slices:
  - `STAGE1-URL-TRUTH-001`: update the custom-domain runbook to reflect the actual July 31, 2026 state.
  - `STAGE1-URL-TRUTH-002`: add an executable verification path for official hosts, not just Cloud Run fallback URLs.
  - `STAGE1-URL-TRUTH-003`: decide whether partial-domain readiness is acceptable for Stage 1 dev acceptance; if not, fail the acceptance read until every official host passes HTTPS.

### P1 — Passenger / concierge / assisted-entry topology truth has drifted across docs, deploy config, and runtime inventory

- Evidence:
  - `docs/02-architecture/app-entry-url-index-20260616.md`
  - `apps/concierge-portal-web/README.md`
  - `apps/assisted-entry-web/README.md`
  - `.github/workflows/deploy-dev.yml`
  - `.github/workflows/domain-mappings-dev.yml`
  - GitHub repo variables on `2026-07-31`
- Current proof:
  - `app-entry-url-index` says dev ships 10 services and marks `passenger-web` as retired and `concierge-portal-web` as decommissioned.
  - `deploy-dev.yml` still builds, deploys, and health-checks `passenger-web`.
  - `domain-mappings-dev.yml` still maps `ride.smarttransport.tw` to `passenger-web`.
  - GitHub repo variables still include `DEV_GCP_PASSENGER_WEB_SERVICE=drts-passenger-web` and `DEV_GCP_CONCIERGE_PORTAL_SERVICE=drts-concierge-portal-web`.
  - `apps/concierge-portal-web/README.md` says the actual repo-local implementation lives in `apps/concierge-portal-web`, while `apps/assisted-entry-web/README.md` says it is only a naming bridge.
- Why it remains a controllable Stage 1 gap:
  - This is purely repo/config/documentation truth drift.
  - It makes official URL inventories, deployment surface counts, and retirement claims unreliable.
- Dispatchable slices:
  - `STAGE1-TOPOLOGY-TRUTH-001`: pick one authoritative truth for passenger-web status on dev, then align deploy workflows, URL inventory, and runbooks.
  - `STAGE1-TOPOLOGY-TRUTH-002`: pick one authoritative truth for concierge/assisted-entry naming and deployment status, then remove contradictory retirement/decommission wording.
  - `STAGE1-TOPOLOGY-TRUTH-003`: add a generated or checked inventory so doc counts cannot diverge from `deploy-dev.yml`.

### P2 — Runtime verification coverage still excludes some shipped/ref-counted web surfaces

- Evidence:
  - `tests/e2e/dev-runtime-matrix.spec.ts`
  - `docs/02-architecture/app-entry-url-index-20260616.md`
  - `.github/workflows/deploy-dev.yml`
- Current proof:
  - `dev-runtime-matrix.spec.ts` only models `api`, `bank-console-web`, `enterprise-dispatch-web`, `partner-booking-web`, `platform-admin-web`, `ops-console-web`, `fleet-partner-portal-web`, and `tenant-console-web`.
  - It does not cover `referral-embed-web`, `channel-partner-portal-web`, or `passenger-web`, even though deploy/config truth currently counts at least the first two as active dev surfaces and `deploy-dev.yml` still deploys the third.
- Why it remains a controllable Stage 1 gap:
  - This is a repo-owned acceptance coverage gap.
  - It is especially relevant because the live official-domain drift is currently concentrated in exactly these web surfaces.
- Dispatchable slice:
  - `STAGE1-RUNTIME-MATRIX-001`: expand runtime-matrix or equivalent deploy-time acceptance to every dev-shipped web surface, including official-host probes where applicable.

## Lower-Priority Acceptance / Documentation Drift

### P2 — Release language still over-compresses mixed evidence states

- Evidence:
  - `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`
  - `tests/e2e/README.md`
  - `docs/04-uat/phase1-business-flow-verification-dashboard-20260519.md`
- Current proof:
  - At least one workflow family (`WF-FIN-GOV-001`) is described as live-passing in one runbook while the executable suite description still treats the scenario as not yet uplifted.
  - The dashboard already carries wording like "staging ingress blocked" for some flows, which is closer to the executable truth than the release matrix.
- Dispatchable slice:
  - `STAGE1-RELEASE-TRUTH-001`: reconcile the release-gate matrix, dashboard, and executable E2E README so the same workflow family cannot be simultaneously "live pass" and "uplift blocked".

## Areas Audited With No New Controllable Gap Added

- CI/deploy foundation exists and is active:
  - `ci.yml`, `ci-integ.yml`, `deploy-dev.yml`, `nightly-publish.yml`, `hourly-promote.yml`, `deploy-prod.yml`
  - latest `Deploy — Dev` runs on `2026-07-31` completed successfully against current `HEAD`
- DB migration rail exists and is executable in workflow form:
  - dev/staging/prod rails all wire a Cloud Run job (`drts-dev-migrate` / `drts-migrate`)
  - CI integration correctly uses PostGIS for geometry migrations
- Referral entry path has stronger evidence than most web surfaces:
  - referral embed README, deploy health-check, live `refer.smarttransport.tw` redirect behavior, and `E2E-016` all align on `referral-demo-community`

## Recommended Execution Order

1. `STAGE1-SAFETY-INCIDENT-001`
2. `STAGE1-FIN-GOV-SEM-001`, `STAGE1-FIN-GOV-AUDIT-001`, `STAGE1-FIN-GOV-LEDGER-001`
3. `STAGE1-REG-DSP-001`
4. `STAGE1-URL-TRUTH-001`, `STAGE1-URL-TRUTH-002`, `STAGE1-URL-TRUTH-003`
5. `STAGE1-TOPOLOGY-TRUTH-001`, `STAGE1-TOPOLOGY-TRUTH-002`, `STAGE1-TOPOLOGY-TRUTH-003`
6. `STAGE1-RUNTIME-MATRIX-001`
7. `STAGE1-FIN-GOV-DOC-001`, `STAGE1-RELEASE-TRUTH-001`
