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

1. governed billing / quota lifecycle truth and audit-taxonomy drift
2. release-truth drift between docs, deploy workflows, GitHub variables, and live custom-domain behavior
3. acceptance ambiguity around regulatory dispatch recovery plus missing runtime verification for all shipped web surfaces

## High-Priority Gaps

### P1 — Governed billing / quota lifecycle truth remains internally inconsistent, and the current branch has not yet absorbed the known closure candidate

- Evidence:
  - GitHub issues `#72`, `#73`, `#74`
  - candidate commit `0cfe1e03` on branch `fix/stage1-repo-closure-20260731`
  - `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`
  - `tests/e2e/README.md`
  - `apps/api/src/modules/tenant-partner/tenant-quota-ledger.ts`
  - `apps/api/src/modules/owned-mobility/owned-mobility.service.ts`
- Current proof:
  - `#72` and `#74` are one quota-lifecycle root problem in current `origin/dev`: `tenant-quota-ledger.ts` still models a `consume` transition, but `completeDriverTask` does not currently close the reservation lifecycle in a way that makes completion-time quota consumption reviewable.
  - `#73` remains a separate adjacent audit-taxonomy drift: six historical governance action names were removed without aliasing, while downstream evidence/readers were softened instead of reconciled.
  - Candidate closure work exists in `0cfe1e03`, but `git merge-base --is-ancestor 0cfe1e03 origin/dev` returns `1`, so this is not current `origin/dev` truth yet.
  - The release-gates runbook still marks `WF-FIN-GOV-001` as `PASS (live staging evidence)`.
  - `tests/e2e/README.md` simultaneously says `E2E-010-governance-aware-billing-reporting.sh` is still a shell whose uplift remains blocked pending a governed staging rerun.
- Why it remains a controllable Stage 1 gap:
  - The quota-lifecycle defect and the audit-taxonomy defect are both repo/API semantics or contract/evidence-compatibility problems.
  - The repo currently overstates closure for this workflow family.
- Dispatchable slices:
  - `STAGE1-FIN-GOV-LIFECYCLE-001`: unify `#72` and `#74` as one completion-time quota lifecycle decision, then restore assertions/evidence so quota summary and ledger semantics agree.
  - `STAGE1-FIN-GOV-AUDIT-001`: restore legacy audit action aliases or update all downstream consumers and evidence packs atomically.
  - `STAGE1-FIN-GOV-DOC-001`: reconcile `WF-FIN-GOV-001` release language with the actual E2E/live evidence state.

### P1 — Regulatory dispatch recovery exists as an explicit operator action, but the intended policy is not stated consistently in tests, UAT wording, or runbooks

- Evidence:
  - GitHub issue `#71`
  - `docs/04-uat/phase1-uat-checklist.md` rows `OC-013` and `OC-014`
  - `apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts`
  - `apps/platform-admin-web/app/fleet/page.tsx`
- Current proof:
  - Current API/UI already expose an explicit recovery path: `updateVehicleCompliance(... { dispatchableFlag: true })` is allowed once contract/insurance/exclusivity blocks are cleared, and `platform-admin-web` wires a manual toggle for that action.
  - Current reconciler still preserves `manual_hold` until an operator performs that explicit step, so the real gap is no longer "missing recovery capability" but "unstated product policy and acceptance truth".
  - Issue `#71` correctly captures the semantic question: should restoration be automatic, or should explicit operator recovery remain the rule?
- Why it remains a controllable Stage 1 gap:
  - This is owned by repo product policy, acceptance wording, and operator evidence.
  - Without a stated rule, tests and audits can interpret the same behavior as either a defect or an intended safety gate.
- Dispatchable slice:
  - `STAGE1-REG-DSP-POLICY-001`: define whether post-restoration recovery is automatic or requires an explicit operator action, then align API tests, UI copy, UAT rows `OC-013`/`OC-014`, and the operator runbook to that choice.

## Release-Truth / Runtime Drift

### P1 — Official dev URLs have no automated truth gate, and the custom-domain runbook is materially stale

- Evidence:
  - `docs/03-runbooks/smarttransport-tw-custom-domains.md`
  - `.github/workflows/domain-mappings-dev.yml`
  - `.github/workflows/deploy-dev.yml`
  - live probes on `2026-07-31`
- Current proof:
  - `docs/03-runbooks/smarttransport-tw-custom-domains.md` still says the subdomains were not yet connected to Cloud Run and still names the older dev live set (`drts-dev-ray-tw-20260530` / hash `ne55h7sy3a`).
  - `Domain Mappings — Dev (smarttransport.tw)` has successful runs on `2026-07-27`, and `Deploy — Dev` has successful runs on `2026-07-31`, so the workflow rails exist.
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

- Driver SOS / incident routing is no longer a current Stage 1 gap:
  - `origin/dev` already routes the driver safety flow through `POST /api/driver/sos-events`, not `POST /api/incidents`.
  - `apps/api/tests/unit/driver-sos-incident.test.ts` proves driver-realm access to `/api/driver/sos-events` and explicitly proves the driver realm is still forbidden from `POST /api/incidents` and `GET /api/incidents`.
  - `tests/e2e/E2E-017-driver-sos-incident.sh` covers the dedicated driver SOS path end to end, including self-scoping and incident-list denial.

- CI/deploy foundation exists and is active:
  - `ci.yml`, `ci-integ.yml`, `deploy-dev.yml`, `nightly-publish.yml`, `hourly-promote.yml`, `deploy-prod.yml`
  - latest `Deploy — Dev` runs on `2026-07-31` completed successfully against current `HEAD`
- DB migration rail exists and is executable in workflow form:
  - dev/staging/prod rails all wire a Cloud Run job (`drts-dev-migrate` / `drts-migrate`)
  - CI integration correctly uses PostGIS for geometry migrations
- Referral entry path has stronger evidence than most web surfaces:
  - referral embed README, deploy health-check, live `refer.smarttransport.tw` redirect behavior, and `E2E-016` all align on `referral-demo-community`

## Recommended Execution Order

1. `STAGE1-FIN-GOV-LIFECYCLE-001`, `STAGE1-FIN-GOV-AUDIT-001`
2. `STAGE1-REG-DSP-POLICY-001`
3. `STAGE1-URL-TRUTH-001`, `STAGE1-URL-TRUTH-002`, `STAGE1-URL-TRUTH-003`
4. `STAGE1-TOPOLOGY-TRUTH-001`, `STAGE1-TOPOLOGY-TRUTH-002`, `STAGE1-TOPOLOGY-TRUTH-003`
5. `STAGE1-RUNTIME-MATRIX-001`
6. `STAGE1-FIN-GOV-DOC-001`, `STAGE1-RELEASE-TRUTH-001`
