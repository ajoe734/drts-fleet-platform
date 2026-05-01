# Phase 1 Blueprint Delta Closeout Execution Packet

Status: ready for supervisor-managed execution  
Date: 2026-05-01  
Source audit: `docs/02-architecture/phase1-implementation-blueprint-delta-audit-20260501.md`  
Scope: `drts-fleet-platform` plus sibling repo `tenant-commute-hub`

## 1. Purpose

This packet materializes the remaining delta from the 2026-05-01 implementation
vs blueprint audit into supervisor-dispatchable execution tasks.

The goal is not to reopen the ORX implementation wave. Root machine truth already
shows `249/249 done`. This wave closes the gap between:

- repo-local implementation completion;
- release / UAT / dashboard truth synchronization;
- cross-repo tenant surface closure;
- production persistence proof;
- external integration gate tracking.

## 2. Operating Rules

- Do not claim production completion from repo-local task completion alone.
- Do not mark external-gated items done by inventing missing credentials,
  partner contracts, live CTI callbacks, or mobile distribution accounts.
- If an external input is unavailable, create the gate tracker, document the
  exact blocker, and move the task to `blocked` with a named waiting owner.
- Keep `drts-fleet-platform` as business authority and `tenant-commute-hub` as
  the tenant / partner frontend consumer.
- Every task must finish with evidence links, commit hash, push confirmation,
  and a short release-language note.

## 3. Execution Summary

| Task ID        | Family        | Objective                                                             | Owner   | Reviewer | Depends On                                       |
| -------------- | ------------- | --------------------------------------------------------------------- | ------- | -------- | ------------------------------------------------ |
| `SYNC-001`     | Status Sync   | Regenerate root and docs-site status views from root machine truth    | Gemini2 | Codex    | -                                                |
| `SYNC-002`     | Release Gates | Reconcile workflow release gates after ORX completion                 | Gemini2 | Codex    | `SYNC-001`                                       |
| `SYNC-003`     | UAT Evidence  | Reclassify UAT checklist rows into inventory/static/live/sign-off     | Gemini2 | Codex    | `SYNC-002`                                       |
| `XREPO-001`    | Cross Repo    | Close `tenant-commute-hub` dirty diff and sync contract snapshot      | Gemini2 | Codex    | -                                                |
| `DEPLOY-001`   | Runtime Proof | Capture DB-enabled runtime persistence evidence                       | Gemini2 | Codex    | `SYNC-001`                                       |
| `EXT-001`      | External Gate | Materialize real bank / issuer eligibility gate                       | Gemini2 | Codex    | `SYNC-002`                                       |
| `EXT-002`      | External Gate | Materialize real forwarder adapter proof gate                         | Gemini2 | Codex    | `SYNC-002`                                       |
| `EXT-003`      | External Gate | Materialize mobile distribution gate                                  | Gemini2 | Codex    | `SYNC-002`                                       |
| `EXT-004`      | External Gate | Materialize live CTI / recording / filing activation gate             | Gemini2 | Codex    | `SYNC-002`                                       |
| `BDX-CLOSEOUT` | Governance    | Final closeout narrative after sync, repo, deploy, and external gates | Gemini2 | Codex    | all `SYNC-*`, `XREPO-001`, `DEPLOY-001`, `EXT-*` |

### Provider Health Override

The original lane split used Codex, Claude, Claude2, Copilot, Gemini, and
Gemini2. Runtime health on 2026-05-01 showed Codex / Claude / Claude2 / Codex2
auth-paused, Copilot / Gemini quota-paused, and only Gemini2 dispatch-capable.
The active machine-truth owner for this packet is therefore Gemini2 with Codex
review until the other lanes are explicitly restored.

## 4. Detailed Task Definitions

## `SYNC-001` — Status And Dashboard Truth Sync

### Objective

Make the generated status surfaces agree with root `ai-status.json`.

### Write Scope

- `ai-status.json`
- `current-work.md`
- `docs-site/ai-status.json`
- `docs-site/current-work.md`
- `docs-site/*.js`
- `docs-site/index.html`
- `docs/02-architecture/phase1-implementation-blueprint-delta-audit-20260501.md`

### Acceptance

- Root `ai-status.json` and docs-site status both report the same task counts.
- `current-work.md` no longer shows stale `ORX-GV-003 review_approved`.
- Dashboard does not show a stale active handoff when all root tasks are done.
- Any newly opened `SYNC-*`, `XREPO-*`, `DEPLOY-*`, or `EXT-*` tasks are shown as
  the active wave, not confused with ORX completion.

### Verification

- `python3 scripts/ai_status.py sync`
- `git diff --check`
- `git status --short --branch`

## `SYNC-002` — Workflow Release Gate Reconciliation

### Objective

Update release-gate language so it reflects the finished ORX implementation wave
without overstating external or human sign-off.

### Write Scope

- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`
- `docs/03-runbooks/master-system-closeout-checklist.md`
- `docs/02-architecture/phase1-implementation-blueprint-delta-audit-20260501.md`
- `support/sidecars/*` where a release-gate evidence pointer is missing

### Acceptance

- `PENDING (ORX-GV-001 rows)` is either replaced with a current evidence-backed
  gate read or intentionally left pending with a current reason.
- External-gated families remain `EXTERNAL-GATED`.
- CTI / recording / filing remains `HOLD` unless live evidence exists.
- Closeout wording distinguishes repo-local, static evidence, live staging,
  pilot sign-off, and production sign-off.

### Verification

- `rg -n "PENDING \\(ORX-GV-001 rows\\)|HOLD|EXTERNAL-GATED" docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`
- `pnpm exec prettier --check docs/03-runbooks/phase1-workflow-acceptance-release-gates.md docs/03-runbooks/master-system-closeout-checklist.md`

## `SYNC-003` — UAT Checklist Evidence Reclassification

### Objective

Make the UAT checklist usable as a release artifact instead of a mixed inventory
with unchecked rows.

### Write Scope

- `docs/04-uat/phase1-uat-checklist.md`
- `docs/04-uat/phase1-uat-scenarios.md`
- `docs/04-uat/fbp-014a-e2e-matrix.md`
- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`

### Acceptance

- Each unchecked row is classified as one of: `inventory`, `static evidence`,
  `repo-local verified`, `live staging verified`, `human sign-off required`,
  `external-gated`, or `deferred`.
- P1 negative-path rows have evidence links or a named gap.
- UAT pass language no longer implies human sign-off when only static evidence
  exists.
- E2E-002 and E2E-003 clearly explain graceful-skip / CTI / filing limitations.

### Verification

- `rg -n "⬜|Deferred|external|sign-off|static evidence|live staging" docs/04-uat/phase1-uat-checklist.md`
- `pnpm exec prettier --check docs/04-uat/phase1-uat-checklist.md docs/04-uat/phase1-uat-scenarios.md docs/04-uat/fbp-014a-e2e-matrix.md`

## `XREPO-001` — Tenant Commute Hub Cross-Repo Closure

### Objective

Close the dirty working tree in `/home/edna/workspace/tenant-commute-hub` and
record the exact contract snapshot / UI sync status.

### Write Scope

- `/home/edna/workspace/tenant-commute-hub/README.md`
- `/home/edna/workspace/tenant-commute-hub/scripts/sync-drts-contract-snapshot.mjs`
- `/home/edna/workspace/tenant-commute-hub/src/lib/drts-shim/**`
- `/home/edna/workspace/tenant-commute-hub/src/pages/**`
- `docs/03-runbooks/cross-repo-gap-matrix-20260424.md`
- `docs/02-architecture/phase1-implementation-blueprint-delta-audit-20260501.md`

### Acceptance

- Tenant repo diff is reviewed and either committed/pushed or explicitly
  reverted only if proven generated noise.
- Tenant repo build/typecheck passes or failure is documented with exact error.
- Contract snapshot version and source core commit are recorded.
- `drts-fleet-platform` and `tenant-commute-hub` both end clean and synced to
  their remotes, unless an external blocker is explicitly documented.

### Verification

- `git -C /home/edna/workspace/tenant-commute-hub status --short --branch`
- tenant repo package test/build command from its `package.json`
- `git status --short --branch`

## `DEPLOY-001` — DB-Enabled Runtime Persistence Proof

### Objective

Prove that the operational runtime can run with `DATABASE_URL`, migrations, and
DB-backed persistence, not only in memory.

### Write Scope

- `docs/03-runbooks/phase1-rollout.md`
- `docs/03-runbooks/local-development.md`
- `docs/03-runbooks/local-development.local.example.md`
- `support/sidecars/`
- `apps/api/src/common/db/`
- persistence-related tests if evidence shows a gap

### Acceptance

- Runbook names the exact DB-enabled boot path and migration command.
- Evidence pack records at least one DB-backed lifecycle smoke path.
- Any service still relying on process memory for production-critical state is
  explicitly listed with mitigation or follow-up.
- Driver device binding durability is explicitly assessed.

### Verification

- `pnpm db:verify` or documented local equivalent
- targeted API persistence tests if DB is available
- if DB unavailable, mark blocked with exact environment requirement

## `EXT-001` — Real Bank / Issuer Eligibility Gate

### Objective

Turn real issuer integration from an implicit blocker into an auditable external
gate with evidence requirements and owner routing.

### Write Scope

- `docs/03-runbooks/partner-eligibility-manual-review-runbook.md`
- `docs/02-architecture/phase1-issuer-eligibility-integration-contract-20260429.md`
- `docs/03-runbooks/master-system-closeout-checklist.md`
- `support/sidecars/EXT-001/`

### Acceptance

- Required issuer contract fields, credential types, sandbox endpoints, allowed
  test cards, timeout behavior, and fallback behavior are named.
- Missing external inputs are listed as blockers with owner and evidence format.
- Repo-local fallback remains manual review and does not pretend real issuer
  approval exists.

### Verification

- If external inputs exist: run sandbox verification and attach evidence.
- If not: create blocker packet and mark task `blocked` waiting for partner /
  issuer input.

## `EXT-002` — Real Forwarder Adapter Proof Gate

### Objective

Define the proof required to graduate the forwarder path from stub/scaffold to
real external-platform operation.

### Write Scope

- `docs/03-runbooks/cross-repo-gap-matrix-20260424.md`
- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`
- `tests/e2e/E2E-002-forwarded-order.sh`
- `support/sidecars/EXT-002/`
- `apps/api/src/modules/forwarder/` only if evidence exposes a repo bug

### Acceptance

- Real adapter credential, webhook signature, callback, status sync, and
  lost-race proof requirements are named.
- E2E-002 graceful-skip behavior is preserved but no longer overclaimed as live
  adapter proof.
- Missing external inputs become explicit blocker records.

### Verification

- If external adapter is available: run E2E-002 without graceful skip.
- If not: create blocker packet and mark task `blocked` waiting for platform
  partner input.

## `EXT-003` — Mobile Distribution Gate

### Objective

Turn mobile release dependencies into a concrete distribution gate for the
driver app.

### Write Scope

- `docs/03-runbooks/driver-app-native-dev-runbook.md`
- `docs/03-runbooks/master-system-closeout-checklist.md`
- `support/sidecars/EXT-003/`
- `apps/driver-app/eas.json` or mobile release config only if required

### Acceptance

- Expo account, Apple team, Android keystore, internal tester groups, build
  profile, and release-channel requirements are named.
- Existing EAS/internal build evidence is linked.
- Missing credentials are blockers, not repo-local TODOs.

### Verification

- If credentials exist: run documented internal build or verify existing build
  evidence.
- If not: create blocker packet and mark task `blocked` waiting for mobile
  release credentials.

## `EXT-004` — Live CTI / Recording / Filing Activation Gate

### Objective

Turn phone-order, recording, and filing hold items into an executable activation
gate.

### Write Scope

- `docs/04-uat/phase1-uat-checklist.md`
- `docs/04-uat/phase1-uat-scenarios.md`
- `docs/03-runbooks/evidence-retention-and-evidentiary-access-policy.md`
- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`
- `support/sidecars/EXT-004/`
- `apps/api/src/modules/callcenter/` and `apps/api/src/modules/reporting-filing/`
  only if evidence exposes a repo bug

### Acceptance

- CTI screen-pop, callId metadata, recording callback, recording index export,
  filing package generation, and legal retention expectations are named.
- OC-022, OC-023, OC-024, and E2E-003 have exact gate status.
- Missing CTI/filing environment becomes a blocker with evidence format.

### Verification

- If CTI/filing environment exists: run callback and filing verification.
- If not: create blocker packet and mark task `blocked` waiting for CTI /
  compliance environment activation.

## `BDX-CLOSEOUT` — Final Blueprint Delta Closeout

### Objective

Produce the final release-language packet after all actionable sync, cross-repo,
deployment, and external-gate tasks are resolved or blocked with explicit owner.

### Write Scope

- `docs/02-architecture/phase1-implementation-blueprint-delta-audit-20260501.md`
- `docs/03-runbooks/master-system-closeout-checklist.md`
- `docs/03-runbooks/phase1-blueprint-delta-closeout-execution-packet-20260501.md`
- `current-work.md`
- `ai-status.json`

### Acceptance

- No stale ORX active-task narrative remains.
- Every open item is either done, blocked with named external owner, or explicitly
  deferred.
- Final statement distinguishes repo-local done, external-gated, pilot-gated,
  and production-gated status.
- Commit and push evidence is attached.

### Verification

- `python3 scripts/ai_status.py audit doc-sync`
- `git status --short --branch`
- `git rev-list --count origin/main..HEAD`
- `git rev-list --count HEAD..origin/main`
