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

As of `2026-04-19`, the accepted gap-fix Sprint 2 / Sprint 3 blueprint is almost fully implemented.
The current shared-truth gap is no longer “core backlog missing everywhere”; it is mostly:

- one major external auth blocker: `GAP-P2S3-001`
- a small set of switchboard follow-up tasks: `GAP-SB-003`, `005`, `006`, `007`
- two sidecar acceptance packets still in backlog
- one remaining rollout-evidence narrative consistency task outside the app code path

This means:

- **gap-fix execution is close to complete**
- **the full Phase 1 system is not yet complete**

## A. Gap-Fix Wave Closeout

These items close the currently active implementation wave.

### A-1. Finish active execution tasks

- [ ] Close `GAP-SB-003` — delete draft public info version
- [ ] Close `GAP-SB-005` — placard publish endpoint + UI
- [ ] Close `GAP-SB-006` — retired source warning / disable behavior
- [ ] Close `GAP-SB-007` — versionCode local uniqueness precheck

### A-2. Finish active support artifacts

- [ ] Close `GAP-SB-001-SIDECAR-ACCEPTANCE`
- [ ] Close `GAP-SB-002-SIDECAR-ACCEPTANCE`

### A-3. Remove execution drift

- [ ] Reconcile any stale `dispatch_pauses`, handoff queue leftovers, or review routing drift after the active tasks are closed
- [ ] Ensure `current-work.md` reflects the actual remaining wave instead of old Sprint 1 / Sprint 2 wording
- [ ] Ensure the active narrative no longer lags behind `ai-status.json`

## B. Auth / GCP Blocker Closeout

This is the largest remaining product-critical blocker.

### B-1. Human GCP / Cloud IAP prerequisites

- [ ] Complete the manual GCP Console / Cloud IAP / OAuth consent / IAM setup captured in `docs/03-runbooks/gap-p2s3-001-cloud-iap-checklist.md`
- [ ] Record the audience / issuer / caller assumptions required by the repo implementation
- [ ] Confirm whether only `drts-api` moves behind IAP first, or whether the web surfaces move in the same wave

### B-2. Repo auth migration

- [ ] Replace bootstrap-header trust as the claimed production auth path
- [ ] Implement verified Bearer token / OIDC handling in the API
- [ ] update deploy / post-deploy verification to match the new auth model
- [ ] update smoke / E2E / runbooks so they no longer describe bootstrap auth as the default production path

### B-3. Exit condition

- [ ] Close `GAP-P2S3-001`
- [ ] Remove the “manual GCP gate” from the current blocker list once human and repo work are both complete

## C. Rollout / Evidence Closure

Even when features exist, the system is not operationally complete until rollout evidence is closed.

### C-1. Staging / deploy evidence

- [x] Confirm the former staging / credential / GCP provisioning blocker is resolved in the accepted evidence family (`FBP-013A`, run `#24522301392`)
- [x] Confirm final evidence for deployment, migration, and health is already captured in the staging evidence pack (`E-11` / `E-12` / `E-13`)
- [x] Remove stale wording in closeout-planning docs that still describes the resolved staging credential issue as an active blocker

### C-2. Evidence consistency

- [ ] Ensure the latest evidence references live in the correct evidence packets, not only in logs or handoff notes
- [ ] Ensure current blockers and completion claims in `current-work.md` and `ai-status.json` do not contradict the evidence family

## D. Product Surface Completeness

This section compares the current repo shape against the broader Phase 1 PRD.

### D-1. Core surfaces already substantially present

These surfaces are already materially implemented in the current repo and mainly need closure / hardening:

- [ ] API host
- [ ] driver app
- [ ] ops console web
- [ ] platform admin web

### D-2. Cross-repo tenant surface closure

- [ ] Confirm the production tenant surface contract with `tenant-commute-hub`
- [ ] Verify tenant flows that depend on the external repo are fully supported by this repo’s APIs and authority boundaries
- [ ] Confirm no critical Phase 1 tenant workflow is still blocked by the retired `apps/tenant-portal-web` shell

### D-3. Missing or unresolved entry surfaces

The PRD still includes customer / call-entry surfaces that are not fully closed in the current monorepo execution wave.

- [ ] Decide whether passenger-facing booking / tracking surface is part of the Phase 1 completion bar or remains intentionally deferred
- [ ] Decide whether call point / concierge workflow lands in an existing surface or a separate frontend
- [ ] Confirm the complaint hotline / customer-service operator surface is complete enough for the PRD’s complaint scope

### D-4. Reporting / filing / finance closure

- [ ] Re-check receipts / invoices / driver statements / reimbursements against the PRD completion bar
- [ ] Re-check regulatory reporting and filing-package generation against the PRD completion bar
- [ ] Confirm these flows are not only backend-capable but operationally reviewable in the intended UI / workflow

## E. Integration and Operational Hardening

The roadmap’s Wave 7 standard is broader than “feature exists.”

### E-1. Surface integration

- [ ] Confirm web and mobile surfaces are connected to the accepted APIs and read models
- [ ] Confirm no critical operational flow still depends on placeholder shells, mock-only paths, or hidden manual edits

### E-2. Acceptance coverage

- [ ] Expand verification beyond narrow task-scoped tests where Phase 1 workflows require broader operational confidence
- [ ] Confirm cross-surface workflows still hold after the latest switchboard / auth / dispatch changes

### E-3. Supervisor / control-plane readiness

- [ ] Keep the orchestrator’s plane separation intact while closing the remaining tasks
- [ ] Confirm worker routing, evidence capture, runtime pause handling, and human summary views remain consistent through closeout

## F. Deferred Scope Decision Gate

The roadmap explicitly keeps some families visible but outside the current execution wave.
System completion cannot be claimed ambiguously here; these items need an explicit decision, not silent drift.

- [ ] Confirm whether Passenger App / Web remains deferred beyond the current Phase 1 execution wave
- [ ] Confirm whether Call Point / Concierge Portal remains deferred or is absorbed into an existing surface
- [ ] Confirm AV / ODD / Tesla / ROC live-board scope remains future-gated and is not part of the current completion claim

## G. Final Exit Criteria

We can honestly say the system is operationally complete only when all of the following are true:

- [ ] the current active execution backlog is closed
- [ ] `GAP-P2S3-001` is no longer blocked
- [ ] rollout / staging / evidence blockers are closed
- [ ] the intended Phase 1 surfaces have explicit completion or explicit defer decisions
- [ ] `current-work.md`, `ai-status.json`, evidence packets, and rollout docs tell the same story
- [ ] the remaining gap between “implemented slices” and “operationally complete system” is either closed or consciously deferred by decision

## Reference Anchors

- `docs/02-architecture/consensus/gap-phase2-planning-20260417/consensus-packet.md`
- `docs/03-runbooks/gap-p2s3-001-cloud-iap-checklist.md`
- `ROADMAP.md`
- `DEVELOPMENT_WORKBREAKDOWN.md`
- `phase1_prd_detailed_v1.md`
- `current-work.md`
- `ai-status.json`
