# Master System Closeout Checklist

## Purpose

This runbook turns the current repo state into one practical question:

> What still has to be true before we can honestly say the Phase 1 system is operationally complete?

It is intentionally broader than the current gap-fix execution wave.
Use it to separate:

- **current execution cleanup**
- **external blockers**
- **rollout / evidence closure**
- **full-system completeness gaps against the PRD and roadmap**

## Current Reality Snapshot

As of `2026-04-28`, the switchboard follow-up wave is closed, the protected
control-plane auth cutover is merged and staging-verified, and the P1PX
productization wave has landed partner channel and driver app baselines.
The current visible delta is now:

- external-gated integrations: real bank/issuer credentials, Grab Taiwan real adapter, mobile distribution inputs
- consciously deferred future-gated surfaces: passenger app/web, passenger receipt UI, call point/concierge, AV/ODD, live board (captured in `MSC-P1-001`)

This means:

- **gap-fix execution is complete enough to stop being the main story**
- **partner channel and driver app baselines are now landed; only external credentials block productization completion**
- **the repo-local closeout bar is met, while deferred and external-gated scope remains explicit**

Release wording should now cite workflow families from
`docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` instead of
reducing the closeout narrative to repo-local test green-ness.

## A. Gap-Fix Wave Closeout

These items close the currently active implementation wave.

### A-1. Finish active execution tasks

- [x] Close `GAP-SB-003` — delete draft public info version
- [x] Close `GAP-SB-005` — placard publish endpoint + UI
- [x] Close `GAP-SB-006` — retired source warning / disable behavior
- [x] Close `GAP-SB-007` — versionCode local uniqueness precheck

### A-2. Finish active support artifacts

- [x] Close `GAP-SB-001-SIDECAR-ACCEPTANCE`
- [x] Close `GAP-SB-002-SIDECAR-ACCEPTANCE`

### A-3. Remove execution drift

- [x] Reconcile any stale `dispatch_pauses`, handoff queue leftovers, or review routing drift after the active tasks are closed
- [x] Ensure `current-work.md` reflects the actual remaining wave instead of old Sprint 1 / Sprint 2 wording
- [x] Ensure the active narrative no longer lags behind `ai-status.json`

## B. Auth / GCP Blocker Closeout

This is the largest remaining product-critical blocker.

### B-1. Human GCP / Cloud IAP prerequisites

- [x] Complete the manual GCP Console / Cloud IAP / OAuth consent / IAM setup captured in `docs/03-runbooks/gap-p2s3-001-cloud-iap-checklist.md`
- [x] Record the audience / issuer / caller assumptions required by the repo implementation
- [x] Confirm the concrete Stage 1 / Stage 2 scope for the accepted staged topology: internal control-plane API first, internal web surfaces second, while tenant / driver / partner / webhook paths stay off the default IAP boundary

### B-2. Repo auth migration

- [x] Replace bootstrap-header trust as the claimed production auth path. _(Protected `platform-admin-web` / `ops-console-web` now use server-issued inner Bearer auth behind IAP; legacy bootstrap helpers remain only for local/direct-path fallback.)_
- [x] Implement verified Bearer token / OIDC handling in the API
- [x] update deploy / post-deploy verification to match the new auth model
- [x] update smoke / E2E / runbooks so they no longer describe bootstrap auth as the default production path

### B-3. Exit condition

- [x] Close `GAP-P2S3-001`. _(Protected staging deploy run `#24891433989` passed build, migration, deploy, and IAP-protected API verification after the merged inner-trust cleanup.)_
- [x] Remove the “manual GCP gate” from the current blocker list once human and repo work are both complete

## C. Rollout / Evidence Closure

Even when features exist, the system is not operationally complete until rollout evidence is closed.

### C-1. Staging / deploy evidence

- [x] Confirm the former staging / credential / GCP provisioning blocker is resolved in the accepted evidence family (`FBP-013A`, run `#24522301392`)
- [x] Confirm final evidence for deployment, migration, and health is already captured in the staging evidence pack (`E-11` / `E-12` / `E-13`)
- [x] Remove stale wording in closeout-planning docs that still describes the resolved staging credential issue as an active blocker

### C-2. Evidence consistency

- [x] Ensure the latest evidence references live in the correct evidence packets, not only in logs or handoff notes
- [x] Ensure current blockers and completion claims in `current-work.md` and `ai-status.json` do not contradict the evidence family

## D. Product Surface Completeness

This section compares the current repo shape against the broader Phase 1 PRD.

### D-1. Core surfaces already substantially present

These surfaces are already materially implemented in the current repo and mainly need closure / hardening:

- [x] API host
- [x] driver app
- [x] ops console web
- [x] platform admin web

### D-2. Cross-repo tenant surface closure

- [x] Confirm the production tenant surface contract with `tenant-commute-hub`
- [x] Verify tenant flows that depend on the external repo are fully supported by this repo’s APIs and authority boundaries
- [x] Confirm no critical Phase 1 tenant workflow is still blocked by the retired `apps/tenant-portal-web` shell

### D-3. Missing or unresolved entry surfaces

The PRD still includes customer / call-entry surfaces that are not fully closed in the current monorepo execution wave.

- [x] Decide whether passenger-facing booking / tracking surface is part of the Phase 1 completion bar or remains intentionally deferred
- [x] Decide whether call point / concierge workflow lands in an existing surface or a separate frontend
- [x] Confirm the complaint hotline / customer-service operator surface is complete enough for the PRD’s complaint scope
- [x] Partner-channel bank entry and eligibility verification baseline implemented (P1PX wave). Real bank/issuer credentials and branding remain external-gated.

### D-4a. Partner-channel and driver app productization (P1PX wave — 2026-04-28)

- [x] Partner registry and eligibility persistence (P1PX-BE-001) — durable schema, repository, service, unit tests
- [x] Partner-authenticated ingress (P1PX-BE-002) — API key / signed token guard, negative tests, audit events
- [x] Partner-only tenant UI shell and Traditional Chinese booking funnel (P1PX-FE-001) — `tenant-commute-hub`
- [x] Partner truth carry-through into audit, finance, reporting, operator review (P1PX-BE-003)
- [x] Driver app production identity and device-binding hardening (P1PX-DRV-001)
- [x] EAS internal build evidence and external credential blockers documented (P1PX-DRV-002)
- [x] Blueprint truth sync — gap matrix, task board, backlog, checklist updated (P1PX-DOC-001)
- [ ] Real bank/issuer API contract, sandbox credentials, allowed test cards — external-gated via
      `support/sidecars/EXT-001/EXT-001-EXTERNAL-GATE.md` blocker records `EXT-001-BLK-001` to
      `EXT-001-BLK-006`
- [ ] Real Grab Taiwan adapter (`EMC-X1-001`) — external-gated
- [ ] Mobile distribution: Expo account, Apple team, Android keystore, internal tester groups — external-gated

### D-4. Reporting / filing / finance closure

- [x] Re-check receipts / invoices / driver statements / reimbursements against the PRD completion bar
- [x] Re-check regulatory reporting and filing-package generation against the PRD completion bar
- [x] Confirm these flows are not only backend-capable but operationally reviewable in the intended UI / workflow. _(Backoffice/operator review path is confirmed; ops console now supports `Drivers -> select driver -> Earnings`; passenger receipt UI remains deferred with the passenger surface.)_

## E. Integration and Operational Hardening

The roadmap’s Wave 7 standard is broader than “feature exists.”

### E-1. Surface integration

- [x] Confirm web and mobile surfaces are connected to the accepted APIs and read models
- [x] Confirm no critical operational flow still depends on placeholder shells, mock-only paths, or hidden manual edits

### E-2. Acceptance coverage

- [x] Expand verification beyond narrow task-scoped tests where Phase 1 workflows require broader operational confidence
- [x] Confirm cross-surface workflows still hold after the latest switchboard / auth / dispatch changes

### E-3. Supervisor / control-plane readiness

- [x] Keep the orchestrator’s plane separation intact while closing the remaining tasks
- [x] Confirm worker routing, evidence capture, runtime pause handling, and human summary views remain consistent through closeout

## F. Deferred Scope Decision Gate

The roadmap explicitly keeps some families visible but outside the current execution wave.
System completion cannot be claimed ambiguously here; these items need an explicit decision, not silent drift.

- [x] Confirm whether Passenger App / Web remains deferred beyond the current Phase 1 execution wave
- [x] Confirm whether Call Point / Concierge Portal remains deferred or is absorbed into an existing surface
- [x] Confirm AV / ODD / Tesla / ROC live-board scope remains future-gated and is not part of the current completion claim

## G. Final Exit Criteria

We can honestly say the system is operationally complete only when all of the following are true:

- [x] the current active execution backlog is closed
- [x] `GAP-P2S3-001` is no longer blocked
- [x] rollout / staging / evidence blockers are closed
- [x] the intended Phase 1 surfaces have explicit completion or explicit defer decisions
- [x] partner channel and driver app baselines are implemented (P1PX wave done)
- [x] `current-work.md`, `ai-status.json`, evidence packets, and rollout docs tell the same story
- [x] the remaining gap between “implemented slices” and “operationally complete system” is either closed or consciously deferred by decision
- [ ] external-gated: real bank/issuer credentials, Grab adapter, mobile distribution (blocked on partner / external inputs)

## Reference Anchors

- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`
- `docs/02-architecture/consensus/gap-phase2-planning-20260417/consensus-packet.md`
- `docs/03-runbooks/gap-p2s3-001-cloud-iap-checklist.md`
- `ROADMAP.md`
- `DEVELOPMENT_WORKBREAKDOWN.md`
- `phase1_prd_detailed_v1.md`
- `current-work.md`
- `ai-status.json`
