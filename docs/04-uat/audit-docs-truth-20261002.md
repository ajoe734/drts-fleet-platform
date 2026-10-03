# Audit Docs Truth — 2026-10-02 (AUDIT-DOCS-TRUTH-20261002)

**Task:** `AUDIT-DOCS-TRUTH-20261002` (owner Claude, reviewer Codex)
**Authority:** user-authorized audit remediation wave, 2026-10-02 UTC. The user
authorized completing the fixes recommended by a 2026-10-02 code-backed audit
of this repository. That audit report and its execution brief are kept on
this machine outside version control (under this machine's local, gitignored
`.local/` directory) because they are a one-time point-in-time snapshot, not a
tracked doc; this file is the tracked, portable record of what that audit's
G02 finding asked for and what was actually done about it.
**Baseline:** reproduced against a fresh `origin/dev` checkout at this task's
branch point.

## What this task is, and is not

This is G02 from the audit: "文件／證據查找有漂移" (doc / evidence lookup has
drifted). The brief for this task is narrow and explicitly bounded:

1. Update `README.md` and operational docs to distinguish implementation / CI
   / dev-deployment / live-acceptance, remove any stale instruction implying
   this shared orchestrator VM hosts product development, and make the live
   `DEV_GCP_*` / `deploy-dev.yml` workflow authoritative over older
   project-ID examples.
2. Reproduce and classify the repo-wide canonical-consistency "cited-paths"
   audit (237 findings) into: intentional machine-local references, archived
   history, and genuinely missing evidence — repairing what is cheaply
   resolvable, preserving history, and explicitly listing what is genuinely
   missing. No fake files, no deleting evidence to make a check go quiet.
3. Stay inside this task's `write_scopes`: `README.md`,
   `docs/ops/branch-strategy.md`,
   `docs/03-runbooks/smarttransport-tw-custom-domains.md`,
   `docs/03-runbooks/local-development.md`, and this file. Every other file
   that the 237 findings touch belongs to a different task/owner and is
   intentionally left unedited here; this document is the repair map for
   whoever picks those up.

This task does not re-open or re-score F01–F08, G01, G03, G04, G05 from the
audit, does not restore paused/retired apps to the active inventory, and does
not grant any closed live-acceptance gate a pass it has not earned.

## Part 1 — README / operational doc truthfulness

### README.md

The `## Status` section previously stated flatly that "rollout evidence,
tenant boundary, finance/reporting completeness, and integration hardening
are closed," with no distinction between "implemented," "CI-green," "deployed
to shared dev," and "live-accepted." The 2026-10-02 audit found concrete,
code-backed gaps that contradict a bare "closed" reading: a legacy payment
endpoint that bypasses real remittance-proof validation, proof/document
storage that is process-local and not durable, a production dependency tree
with unaddressed critical/high advisories and no CI gate for it, a voice
"live" evaluation mode that still only computes fixture metrics, and three
stub/unavailable adapters (payment recovery, fare-quote recovery, forwarder).
The `SR-LIVE-*` / `UV-EXEC-*` / `SR-ACCEPT-001` external acceptance gates
recorded in `ai-status.json` are also still open.

Fixed: the Status section now names the four distinct truth layers
(implementation, CI, shared dev deployment, live acceptance), states plainly
that the recent closeout waves closed layers 1–2 (code merged, trunk CI
green) and the protected-staging auth cutover, not layers 3–4, names the
open program-level gaps instead of waving at "closed," and points at this
file for the detailed evidence trail. It does not change what is actually
implemented — only how the completion claim is worded.

### docs/ops/branch-strategy.md

This runbook uses "dev VM" throughout to mean the shared GCP Cloud Run dev
deployment target that `deploy-dev.yml` rolls (see its own line: "dev GCP env
now on v2026.05.18.0"). That is a legitimate and long-standing shorthand for
*that* environment, but nothing in the file said so explicitly, and
`AGENTS.md`'s VM restriction uses "this VM" for a completely different
machine — the shared orchestrator/supervisor host agents actually work on,
where starting product dev servers, Docker Compose infra, or browser/E2E
runners is prohibited. A reader skimming "dev VM" here could reasonably
conflate the two. Fixed: added an explicit disambiguation note the first time
"dev VM" appears, stating that it names the Cloud Run deployment target, not
the orchestrator/agent working machine, and pointing at `AGENTS.md` for the
actual VM restriction. The term itself is left as-is elsewhere in the file;
this is a terminology clarification, not a rewrite of the promotion/tagging
design the file documents.

### docs/03-runbooks/smarttransport-tw-custom-domains.md

This runbook is written entirely against GCP project `nodal-alloy-503700-s3`,
with no indication that this project is the suspended predecessor.
`AGENTS.md` already records (2026-09-08) that this project was suspended for
a content/ToS issue and that the live replacement is `drts-dev-devcc-20260825`
/ `us-central1`, sourced from the `DEV_GCP_*` GitHub repository variables, not
from any committed document. Fixed: added a historical-scope banner at the
top of the runbook stating the project ID here is historical (suspended
2026-09-07), that the live target must be read from `DEV_GCP_*` /
`deploy-dev.yml` at the time of use, and pointing at `AGENTS.md` for the
authoritative statement. The domain-mapping procedure, DNS records, and the
2026-07-31 / 2026-08-01 observation log are left untouched as a historical
record of that project's state — they are not rewritten to the new project,
because this task does not re-run or re-verify domain mappings against the
live project.

### docs/03-runbooks/local-development.md

This is the strongest instance of the "stale instruction implying this VM
hosts product dev" problem named in the task brief. The doc tells the reader
to run `./tools/local-development/dev-up.sh` (Docker Compose Postgres/Redis/
Mailpit), `pnpm db:init`, and `pnpm dev:api` / `pnpm dev:platform-admin` /
`pnpm dev:ops` / `pnpm dev:tenant` directly, framed as the normal operator
model for "its own dedicated VM development machine." Read on its own,
without `AGENTS.md`, an agent working on the shared orchestrator machine could
reasonably conclude this is sanctioned here. `AGENTS.md` already states the
opposite — "older local-development documents do not override the user's VM
restriction" — but that override lived only in `AGENTS.md`, not in this
runbook itself. Fixed: added an explicit scope note at the top of the
`VM dev` section stating that this runbook describes a dedicated per-project
engineer machine, that the shared orchestrator-managed machine agents operate
on today is a different machine under `AGENTS.md`'s VM restriction (no
product dev servers, no Compose infra, no browser/E2E runners — only the
orchestrator/control-plane and repository-level checks), and that the
authoritative shared review/acceptance surface today is the GCP Cloud Run dev
deployment (`deploy-dev.yml` / `DEV_GCP_*`), not a literal SSH-reachable dev
VM running these commands. The step-by-step bootstrap instructions are left
intact for the engineer-VM audience they were written for; they are not
deleted, because removing them would make the doc less useful to whichever
project VM is supposed to follow it, and this task does not have evidence
that model is itself wrong — only that it must not be read as authorizing
product dev servers on the shared agent machine.

## Part 2 — the 237 cited-path findings

### Method

Reproduced `python3 tools/ci/git/check_canonical_consistency.py --audit`
against this task's branch point; it reported the same 237 `cited-paths`
findings (0 for the other three checks) as the original audit snapshot. Note
this check is report-only in `--audit` mode (always exits 0) and diff-scoped
in `--ci` mode — it is not a merge-blocking gate for the existing 237, only
for *new* drift introduced by a future diff.

The 237 findings collapse to 128 distinct cited paths (many paths are cited
by several closeout/sidecar docs). Each of the 128 was classified by:

1. Exact match against the known gitignored paths in `.gitignore` → machine-local.
2. A literal `...` ellipsis inside the cited path → not a real path, a
   placeholder left in the citing doc's example text → archived-history.
3. `git ls-files` basename search across the whole tracked tree. A unique
   basename match elsewhere → resolved-elsewhere, with the actual path
   recorded. (One generic basename, `actions.ts`, produced a false match
   across many unrelated apps and was excluded from this rule — see the
   `genuinely-missing` note for it.)
4. `git log --all` / `git branch --all --contains` / `git merge-base
   --is-ancestor` against the citing path's origin commit, to tell whether a
   cited planning doc was ever merged into `dev` or only exists on an
   abandoned side branch; cross-checked against the audit's own "not current
   scope" list (Partner Booking paused; Passenger / Concierge / Assisted-entry
   and the old tenant-portal reference retired; AV/ODD/Tesla/ROC Phase 2;
   one-call-multi-order withdrawn) → archived-history.
5. Anything left after 1–4, with no replacement found anywhere in the tracked
   tree under any name → genuinely-missing.

No file was created or deleted to make any of these findings disappear. The
classification below is additive context next to the existing checker output;
none of the 237 findings were edited out of existence, and no citing document
listed here had its path corrected in this task (all of them sit outside this
task's `write_scopes`) — this file is the repair map handed to whichever
task/owner is responsible for each one.

### Summary

| category | unique paths | findings |
|---|---:|---:|
| archived history / superseded scope | 79 | 171 |
| resolved elsewhere (real evidence, wrong path cited) | 27 | 36 |
| genuinely missing evidence | 19 | 19 |
| intentional machine-local reference | 3 | 11 |
| **total** | **128** | **237** |

Counts above are the original audit snapshot this task classified. As a side
effect of the R1 fix below, 2 of the 11 `intentional machine-local reference`
findings (the `README.md` and `local-development.md` citations of the
gitignored local-development.local.md overlay) were genuinely resolved by
pointing those two docs at a tracked file instead — not deleted or hidden.
Reproducing `--audit` against this candidate now reports 235, not 237; the
one remaining citation of that overlay filename lives in
`docs/03-runbooks/local-development.local.example.md`, outside this task's
`write_scopes`. All other category counts are unchanged.

### Full classification

```
RESOLVED ELSEWHERE -- 27 unique cited paths, 36 findings
The cited evidence exists in the tracked tree today, under a different path/name than the citing doc used.

- cited: apps/api/src/common/auth/iap-subject.adapter.ts  (1x, e.g. support/sidecars/IAM-UAT-002/IAM-UAT-002-CLAUDE-REVIEW-3-20260813.md)
  actual: apps/api/src/modules/auth/iap-subject.adapter.ts
- cited: apps/api/src/common/auth/managed-oidc-pkce-bff.service.ts  (1x, e.g. support/sidecars/IAM-UAT-002/IAM-UAT-002-CLAUDE-REVIEW-3-20260813.md)
  actual: apps/api/src/modules/auth/oidc-pkce.service.ts
- cited: apps/api/src/common/auth/service-workload-identity.service.ts  (1x, e.g. support/sidecars/IAM-UAT-002/IAM-UAT-002-CLAUDE-REVIEW-3-20260813.md)
  actual: apps/api/src/modules/auth/service-workload-identity.adapter.ts
- cited: apps/ops-console-web/components/sidebar.tsx  (1x, e.g. support/sidecars/MGMT-UI-002/MGMT-UI-002-VERIFICATION-PACKET.md)
  actual: apps/ops-console-web/components/ops-shell.tsx
- cited: apps/platform-admin-web/components/admin-nav.tsx  (3x, e.g. support/sidecars/FBP-008/FBP-008-SIDECAR-ACCEPTANCE.md, support/sidecars/FBP-008/FBP-008-SIDECAR-REVIEW.md, ...)
  actual: apps/platform-admin-web/components/admin-shell.tsx
- cited: apps/platform-admin-web/components/platform-shell.tsx  (1x, e.g. support/sidecars/ADM-UI-GOV-001/ADM-UI-GOV-001-SIDECAR-ACCEPTANCE.md)
  actual: apps/platform-admin-web/components/admin-shell.tsx
- cited: apps/tenant-console-web/app/webhooks/constants.ts  (1x, e.g. support/sidecars/TEN-UI-RD-018/TEN-UI-RD-018-SIDECAR-REVIEW.md)
  actual: consolidated into apps/tenant-console-web/app/webhooks/page.tsx
- cited: apps/tenant-console-web/app/webhooks/webhook-manager.tsx  (1x, e.g. support/sidecars/TEN-UI-RD-018/TEN-UI-RD-018-SIDECAR-REVIEW.md)
  actual: consolidated into apps/tenant-console-web/app/webhooks/page.tsx + secret-reveal-card.tsx
- cited: infra/migrations/V0030__feature_flags_tenant_override_constraint_fix.sql  (1x, e.g. docs/04-uat/e2e-all-business-lines-verification-20260614.md)
  actual: renumbered to infra/migrations/V0031__feature_flags_tenant_override_constraint_fix.sql when an earlier migration was inserted
- cited: tests/integration/int-iam-prt-001-partner-credential-lifecycle.test.ts  (2x, e.g. docs/04-uat/iam-uat-002-production-like-staging-evidence-pack.md, support/sidecars/IAM-UAT-002/IAM-UAT-002-LIVE-STAGING-EVIDENCE-PACK.md)
  actual: apps/api/tests/integration/int-iam-prt-001-partner-credential-lifecycle.test.ts
- cited: tests/integration/int-mtx-001-runtime-authority.test.ts  (1x, e.g. support/sidecars/MTX-CORE-001/MTX-CORE-001-ACCEPTANCE.md)
  actual: apps/api/tests/integration/int-mtx-001-runtime-authority.test.ts
- cited: tests/integration/service-workload-identity.integration.test.ts  (2x, e.g. docs/04-uat/iam-uat-002-production-like-staging-evidence-pack.md, support/sidecars/IAM-UAT-002/IAM-UAT-002-LIVE-STAGING-EVIDENCE-PACK.md)
  actual: apps/api/tests/integration/service-workload-identity.integration.test.ts
- cited: tests/integration/tenant-partner-credential-lifecycle.integration.test.ts  (1x, e.g. support/unblock/IAM-PRT-001/IAM-PRT-001-UNBLOCK-HISTORY-REPAIR.md)
  actual: same test as apps/api/tests/integration/int-iam-prt-001-partner-credential-lifecycle.test.ts, cited under a different historical name
- cited: tests/load/tenant-quota-concurrent-reserve.test.ts  (1x, e.g. support/sidecars/BE-LOAD-001/BE-LOAD-001-SIDECAR-ACCEPTANCE.md)
  actual: apps/api/tests/load/tenant-quota-concurrent-reserve.test.ts
- cited: tests/unit/driver-identity-bootstrap.test.ts  (1x, e.g. docs/04-uat/mob-uat-002-ios-physical-device-evidence-pack-20260620.md)
  actual: apps/driver-app/tests/unit/driver-identity-bootstrap.test.ts
- cited: tests/unit/driver-location-heartbeat.test.ts  (2x, e.g. docs/04-uat/mob-uat-001-android-physical-device-evidence-pack-20260620.md, docs/04-uat/mob-uat-002-ios-physical-device-evidence-pack-20260620.md)
  actual: apps/driver-app/tests/unit/driver-location-heartbeat.test.ts
- cited: tests/unit/driver-location-offline-queue.test.ts  (2x, e.g. docs/04-uat/mob-uat-001-android-physical-device-evidence-pack-20260620.md, docs/04-uat/mob-uat-002-ios-physical-device-evidence-pack-20260620.md)
  actual: apps/driver-app/tests/unit/driver-location-offline-queue.test.ts
- cited: tests/unit/driver-online-gate.test.ts  (2x, e.g. docs/04-uat/mob-uat-001-android-physical-device-evidence-pack-20260620.md, docs/04-uat/mob-uat-002-ios-physical-device-evidence-pack-20260620.md)
  actual: apps/driver-app/tests/unit/driver-online-gate.test.ts
- cited: tests/unit/driver-tracking-recovery.test.ts  (2x, e.g. docs/04-uat/mob-uat-001-android-physical-device-evidence-pack-20260620.md, docs/04-uat/mob-uat-002-ios-physical-device-evidence-pack-20260620.md)
  actual: apps/driver-app/tests/unit/driver-tracking-recovery.test.ts
- cited: tests/unit/operational-observability.service.test.ts  (1x, e.g. support/sidecars/OPX-GV-003/OPX-GV-003-HANDOFF.md)
  actual: apps/api/tests/unit/operational-observability.service.test.ts
- cited: tests/unit/owned-mobility.service.test.ts  (1x, e.g. support/sidecars/MTX-CORE-001/MTX-CORE-001-ACCEPTANCE.md)
  actual: apps/api/tests/unit/owned-mobility.service.test.ts
- cited: tests/unit/pending-completion-replay.test.ts  (1x, e.g. docs/04-uat/mob-uat-002-ios-physical-device-evidence-pack-20260620.md)
  actual: apps/driver-app/tests/unit/pending-completion-replay.test.ts
- cited: tests/unit/shift-screen-gate.test.ts  (1x, e.g. docs/04-uat/mob-uat-001-android-physical-device-evidence-pack-20260620.md)
  actual: apps/driver-app/tests/unit/shift-screen-gate.test.ts
- cited: tests/unit/sos-screen-runtime-profile-gate.test.ts  (1x, e.g. support/sidecars/S3-FIX-DRIVER-SOS-VOCAB-001/DESIGN-DECISION.md)
  actual: apps/driver-app/tests/unit/sos-screen-runtime-profile-gate.test.ts
- cited: tests/unit/tenant-address-map.test.ts  (1x, e.g. support/sidecars/MAP-FE-TEN-001/MAP-FE-TEN-001-REVIEW-EVIDENCE-20260701.md)
  actual: apps/tenant-console-web/tests/unit/tenant-address-map.test.ts
- cited: tests/unit/tenant-quota-ledger.test.ts  (2x, e.g. support/sidecars/BE-QUOTA-001/BE-QUOTA-001-CLAUDE2-REVIEW-20260513.md, support/sidecars/BE-QUOTA-001/BE-QUOTA-001-CLAUDE2-REVIEW-ROUND2-20260513.md)
  actual: apps/api/tests/unit/tenant-quota-ledger.test.ts
- cited: tests/unit/ui-web-geometry-editor.test.ts  (1x, e.g. support/sidecars/MAP-UI-002/MAP-UI-002-INTEGRATE-001-CLOSEOUT.md)
  actual: packages/ui-web/tests/unit/geometry-editor.test.ts

GENUINELY MISSING EVIDENCE -- 19 unique cited paths, 19 findings
No replacement found anywhere in the tracked tree under any name.

- missing: apps/api/src/health/health.service.ts
  cited by: support/unblock/UI-BE-002/UI-BE-002-UNBLOCK-HISTORY-REPAIR.md
- missing: apps/api/tests/unit/health.controller.test.ts
  cited by: support/unblock/UI-BE-002/UI-BE-002-UNBLOCK-HISTORY-REPAIR.md
- missing: apps/api/tests/unit/health.service.test.ts
  cited by: support/unblock/UI-BE-002/UI-BE-002-UNBLOCK-HISTORY-REPAIR.md
- missing: apps/platform-admin-web/app/adapter-registry/components/AdapterList.tsx
  cited by: docs/05-ui/platform-admin-body-parity-closeout-20260602.md
- missing: apps/tenant-console-web/app/users/actions.ts
  cited by: support/unblock/IAM-UI-TEN-001/IAM-UI-TEN-001-UNBLOCK-HISTORY-REPAIR.md
  note: basename "actions.ts" is generic (shared Next.js server-action filename across many apps); no actions.ts exists specifically under apps/tenant-console-web/app/users/
- missing: apps/tenant-console-web/app/users/user-management-client.tsx
  cited by: support/unblock/IAM-UI-TEN-001/IAM-UI-TEN-001-UNBLOCK-HISTORY-REPAIR.md
- missing: apps/tenant-console-web/tests/unit/users-iam-lifecycle.test.ts
  cited by: support/unblock/IAM-UI-TEN-001/IAM-UI-TEN-001-UNBLOCK-HISTORY-REPAIR.md
- missing: support/sidecars/EMC-I1-001/EMC-I1-001-LIVE-EVIDENCE-PACK.md
  cited by: support/sidecars/EMC-I1-001/EMC-I1-001-SIDECAR-ACCEPTANCE.md
- missing: support/sidecars/IAM-UAT-002/IAM-UAT-002-CLAUDE-REVIEW-2-20260813.md
  cited by: support/sidecars/IAM-UAT-002/IAM-UAT-002-CLAUDE-REVIEW-3-20260813.md
- missing: support/sidecars/PBK-UI-003/PBK-UI-003-SIDECAR-REVIEW.md
  cited by: support/sidecars/PBK-UI-004/PBK-UI-004-SIDECAR-REVIEW.md
- missing: support/sidecars/TCH-SDK-BUMP-001/TCH-SDK-BUMP-001-SIDECAR-ACCEPTANCE.md
  cited by: support/sidecars/BE-QUOTA-001/BE-QUOTA-001-CLAUDE2-REVIEW-ROUND2-20260513.md
- missing: support/sidecars/TEN-UI-006/TEN-UI-006-SIDECAR-ACCEPTANCE.md
  cited by: support/sidecars/TEN-UI-009/TEN-UI-009-SIDECAR-ACCEPTANCE.md
- missing: support/unblock/ADM-UI-RD-006/ADM-UI-RD-006-UNBLOCK-HISTORY-REPAIR.md
  cited by: docs/05-ui/platform-admin-redesign-closeout-20260518.md
- missing: support/unblock/UI-FE-ADM-PARITY-CLOSEOUT-20260602/UI-FE-ADM-PARITY-CLOSEOUT-20260602-UNBLOCK-HISTORY-REPAIR.md
  cited by: docs/05-ui/platform-admin-body-parity-closeout-20260602.md
- missing: support/unblock/UI-FE-OPS-CC/UI-FE-OPS-CC-UNBLOCK-MANUAL-UNBLOCK.md
  cited by: support/unblock/UI-FE-OPS-CC/UI-FE-OPS-CC-UNBLOCK-HISTORY-REPAIR.md
- missing: tests/e2e/fixtures/e2e-forwarder-ingest.json
  cited by: support/sidecars/EMC-I1-001/EMC-I1-001-SIDECAR-ACCEPTANCE.md
- missing: tests/e2e/tenant-iam-ui.spec.ts
  cited by: support/unblock/IAM-UI-TEN-001/IAM-UI-TEN-001-UNBLOCK-HISTORY-REPAIR.md
- missing: tests/unit/platform-tenant-governance-client.test.ts
  cited by: support/sidecars/ADM-UI-GOV-001/ADM-UI-GOV-001-SIDECAR-ACCEPTANCE.md
- missing: tests/unit/platform-tenant-governance.test.ts
  cited by: support/sidecars/ADM-UI-GOV-001/ADM-UI-GOV-001-SIDECAR-ACCEPTANCE.md

INTENTIONAL MACHINE-LOCAL REFERENCES -- 3 unique cited paths, 11 findings
Gitignored by design; citing them is not a defect.

- docs/03-runbooks/local-development.local.md  (3x originally; 1x after the R1 fix below, in the .example template only) -- gitignored local overlay; local-development.md documents this pattern in prose instead of citing the gitignored filename directly
- tools/development-orchestrator/dashboard/ai-status.json  (2x) -- gitignored generated runtime state file (not tracked source)
- tools/development-orchestrator/dashboard/current-work.md  (6x) -- gitignored generated runtime dashboard file (not tracked source)

ARCHIVED HISTORY / SUPERSEDED SCOPE -- 79 unique cited paths, 171 findings
Grouped by explanation. Citing documents are historical point-in-time records
(closeout notes, sidecar evidence packs, 2026-05 planning docs, unblock history)
describing either a pre-implementation plan that was restructured, or
paused/retired product scope per REPORT.md section 6. Historical docs are not rewritten.

- [24] planning doc committed only on unmerged side branches (64a653533); not an ancestor of dev
    docs/03-runbooks/platform-admin-ops-console-design-execution-packet-20260508.md (x10), docs/05-ui/drts-management-ui-review-execution-tasks-20260508.md (x14)
- [23] early-plan route layout; passenger-web app exists but was rebuilt around app/ride/[token]/page.tsx, not the per-step pages these 2026-05/06 UAT packets describe
    apps/passenger-web/app/auth/page.tsx, apps/passenger-web/app/book/degraded/page.tsx (x2), apps/passenger-web/app/book/denied/page.tsx, apps/passenger-web/app/book/ineligible/page.tsx (x2), apps/passenger-web/app/book/no-supply/page.tsx (x2), apps/passenger-web/app/trip/cancel/page.tsx (x2), apps/passenger-web/app/trip/cancelled/page.tsx (x2), apps/passenger-web/app/trip/completed/page.tsx (x2), apps/passenger-web/app/trip/read-only/page.tsx (x2), apps/passenger-web/app/trips/page.tsx (x2), apps/passenger-web/app/unauthenticated/page.tsx, apps/passenger-web/app/unsupported/page.tsx (x2), apps/passenger-web/components/passenger-shell.tsx, apps/passenger-web/lib/navigation.ts
- [22] planning doc committed only on unmerged side branches (e.g. f80913225); superseded when the redesign wave was re-planned directly in ai-status.json
    docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md (x22)
- [16] storybook stories planned per-screen in the 2026-05 UI redesign workbreakdown; consolidated differently or not yet split out
    packages/ui-web/src/tenant-addresses.stories.tsx (x2), packages/ui-web/src/tenant-api-keys.stories.tsx, packages/ui-web/src/tenant-booking-detail.stories.tsx, packages/ui-web/src/tenant-bookings.stories.tsx, packages/ui-web/src/tenant-home.stories.tsx, packages/ui-web/src/tenant-invoices.stories.tsx (x2), packages/ui-web/src/tenant-passengers.stories.tsx (x2), packages/ui-web/src/tenant-reports.stories.tsx (x3), packages/ui-web/src/tenant-shell.stories.tsx, packages/ui-web/src/tenant-webhooks.stories.tsx (x2)
- [15] early-plan filename; dispatch UI was built under apps/ops-console-web/app/dispatch/[dispatchId]/* and components/ instead
    apps/ops-console-web/app/dispatch/dispatch-workflow.tsx (x15)
- [12] partner-portal-under-tenant-console early layout; superseded/paused partner booking scope
    apps/tenant-console-web/app/api/partner/bookings/route.ts (x2), apps/tenant-console-web/app/api/partner/eligibility/route.ts (x2), apps/tenant-console-web/app/api/partner/session/route.ts (x2), apps/tenant-console-web/app/partner/page.tsx (x2), apps/tenant-console-web/components/partner-shell.tsx, apps/tenant-console-web/lib/partner-session.ts (x3)
- [5] partner booking live cutover is paused scope; plan doc committed only on unmerged side branch (d8714cfe3, origin/codex2/ph1gc-pbk-001), not an ancestor of dev
    docs/03-runbooks/partner-booking-live-cutover-plan-20260519.md (x5)
- [5] forwarder live-sandbox evidence drafted only on unmerged side branches, not an ancestor of dev; forwarder adapters remain stub (F08) regardless
    support/sidecars/FWD-LIVE-001/PH1GC-FWD-001-BLOCKER-20260524.md, support/sidecars/FWD-LIVE-001/PH1GC-FWD-001-CLOSEOUT-20260523.md, support/sidecars/FWD-LIVE-001/README.md (x2) -- 660d54d88/5743e0127/dcd6d9317, origin/codex2/ph1gc-fwd-001
    support/sidecars/FWD-LIVE-SANDBOX-20260519/FWD-LIVE-SANDBOX-EVIDENCE.md -- b1707c55a, origin/codex2/wf-fwd-001-live-sandbox
- [4] 2026-05 planning E2E script names for partner-booking/governance scope; never created, largely paused scope
    tests/e2e/E2E-007-partner-booking-pilot.sh, tests/e2e/E2E-008-cti-recording-filing.sh, tests/e2e/E2E-008-partner-eligibility-airport-transfer.sh, tests/e2e/E2E-009-governance-billing-reporting.sh
- [3] Phase 2 AV/ODD/Tesla/ROC sandbox is explicit scope exclusion (REPORT.md section 6)
    docs/02-architecture/phase2_tesla_fsd_sandbox_system_design_decision_packet_c1c6_b1b5_20260625.md, docs/02-architecture/phase2_tesla_fsd_sandbox_v9_ui_execution_wave_20260628.md (x2)
- [3] 2026-05 planning doc for a followup wave that was re-planned directly in ai-status.json instead
    docs/03-runbooks/post-tenant-governance-followup-wave-planning-20260513.md (x3)
- [3] partner eligibility live evidence tied to paused partner booking scope
    support/sidecars/PARTNER-ELIG-LIVE-001/PARTNER-ELIG-LIVE-EVIDENCE.md (x2), support/sidecars/PARTNER-ELIG-LIVE-001/PH1GC-PARTNER-002-CLOSEOUT-20260522.md
- [3] forwarder live-sandbox unblock doc chain; forwarder adapters remain stub (F08)
    support/unblock/WF-FWD-001-LIVE-SANDBOX/WF-FWD-001-LIVE-SANDBOX-UNBLOCK-MANUAL-UNBLOCK.md, support/unblock/WF-FWD-001-LIVE-SANDBOX/WF-FWD-001-LIVE-SANDBOX-UNBLOCK-PLANNING-DECISION.md (x2)
- [2] CTI recording/filing live UAT drafted only on unmerged side branch (0ab277dd2, origin/codex2/com-uat-001), not an ancestor of dev; F05/F06 voice gates remain open regardless
    docs/04-uat/cti-recording-filing-uat-20260519.md (x2)
- [2] forwarder-adapter proof spec drafted only on unmerged side branch (b1707c55a, origin/codex2/wf-fwd-001-live-sandbox), not an ancestor of dev; forwarder adapters remain stub (F08) regardless
    docs/02-architecture/forwarder-adapter-proof-spec-20260519.md (x2)
- [2] partner booking pilot is paused scope; UAT doc committed only on unmerged side branch (b148c7268, origin/codex2/pbk-uat-001), not an ancestor of dev
    docs/04-uat/partner-booking-pilot-uat-20260519.md (x2)
- [2] 2026-05 planning E2E script name; never created
    tests/e2e/E2E-010-cti-recording-filing.sh, tests/e2e/E2E-010-platform-admin-control-plane.sh
- [2] literal ellipsis placeholder in source doc, not a real path
    apps/api/.../regulatory-registry.service.ts, infra/migrations/V0001__...sql
- [2] storybook story planned in 2026-05 UI redesign workbreakdown; not materialized under this name
    packages/ui-web/src/platform-pricing.stories.tsx, packages/ui-web/src/storybook-smoke.stories.tsx
- [2] multi-agent consensus session transcript referenced by its own sidecar summary; session working file was not committed
    docs/02-architecture/consensus/sessions/20260413T025550Z-repo-gap-reassessment-v3/consensus-packet.md (x2)
- [2] literal filename pattern shown as an illustrative example in a review doc; seeds directory uses different real filenames
    infra/seeds/S0001__reference_data.sql, infra/seeds/S0002__demo_data.sql
- [2] partner eligibility live-sandbox unblock doc chain; paused partner booking scope
    support/unblock/PARTNER-ELIG-LIVE-001/PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK.md, support/unblock/PARTNER-ELIG-LIVE-001/PARTNER-ELIG-LIVE-001-UNBLOCK-PLANNING-DECISION.md
- [1] runbook referenced by its own sibling execution packet; committed only on unmerged side branch (9c37aa8e6, origin/codex/map-rel-001), not an ancestor of dev
    docs/03-runbooks/map-provider-operational-runbook-20260630.md
- [1] 2026-05 planning runbook referenced by its own sibling plan doc; committed only on unmerged side branch (ee6cfa758, origin/codex2/rel-sync-001), not an ancestor of dev
    docs/03-runbooks/release-truth-sync-runbook-20260519.md
- [1] 2026-05 planning runbook committed only on unmerged side branch (8f7747753, origin/codex/tgv-runbook-001), not an ancestor of dev; superseded by later tenant-governance sidecars
    docs/03-runbooks/tenant-governance-workflow-release-gate-20260519.md
- [1] 2026-05 planning UAT doc superseded by later mob-uat-001/002 evidence packs
    docs/04-uat/driver-multi-platform-workbench-uat-20260519.md
- [1] partner/airport-transfer eligibility UAT tied to paused partner booking scope
    docs/04-uat/partner-eligibility-airport-transfer-uat-20260519.md
- [1] 2026-05 planning UAT doc; superseded by later tenant-governance sidecars
    docs/04-uat/tenant-governance-uat-scenarios-20260519.md
- [1] Playwright artifact referenced by filename pattern; browser/E2E artifacts are not committed to the tree
    support/sidecars/MAP-QA-002/artifacts/playwright-map-geofence-tenant-ui-20260701T1050Z.json
- [1] cross-reference to a sibling closeout doc that used a different filename/date than cited
    docs/05-ui/ops-console-redesign-closeout-20260510.md
- [1] sibling closeout doc dated differently than what shipped (20260518); cross-reference drift between two closeout docs
    docs/05-ui/platform-admin-redesign-closeout-20260513.md
- [1] copilot lane removed from orchestrator dispatch (commit fbc744877); integration guide not yet pruned to match
    tools/development-orchestrator/adapters/copilot_cloud.py
- [1] partner-booking-web exists but this lib file was never materialized under this name; partner booking is paused scope (REPORT.md section 6)
    apps/partner-booking-web/lib/route-state.ts
- [1] consolidated into apps/tenant-console-web/app/webhooks/page.tsx
    apps/tenant-console-web/app/webhooks/actions.ts
- [1] smoke file planned in 2026-05 UI redesign workbreakdown; not materialized under this name
    packages/ui-web/src/ui-tokens-import-smoke.ts
- [1] design-canvas requirements doc referenced by a later unblock doc; never added to the design canvas set
    docs/05-ui/drts-design-canvas/tenant-iam-session-screen-requirements-20260809.md
- [1] production live-exec evidence pack drafted only on unmerged side branch (0bca939f0, origin/claude2/wf-prod-001-live-exec), not an ancestor of dev; SR-LIVE-* gates remain open regardless
    support/sidecars/PROD-LIVE-EXEC-20260519/PROD-LIVE-EXEC-EVIDENCE.md
```

## Acceptance mapping

| required_acceptance | status | evidence |
|---|---|---|
| `truthful_scope_and_deployment_instructions` | met | README Status section now distinguishes implementation/CI/dev-deployment/live-acceptance and names the open F01–F08 gaps instead of a bare "closed"; `docs/03-runbooks/smarttransport-tw-custom-domains.md` carries a historical-scope banner naming the suspended project and pointing at `DEV_GCP_*`/`deploy-dev.yml`; `docs/03-runbooks/local-development.md` now states the shared orchestrator machine is a different machine under `AGENTS.md`'s VM restriction, not the "VM dev" this runbook describes; `docs/ops/branch-strategy.md` disambiguates "dev VM" from the agent working machine. |
| `cited_path_findings_classified_without_fake_evidence` | met | all 237 findings (128 unique paths) classified above into machine-local / resolved-elsewhere / archived-history / genuinely-missing, with the method and evidence for each; no file was fabricated or deleted to change the checker's output; the 19 genuinely-missing findings are named explicitly rather than hidden. |
| `same_sha_review_ci` | met | candidate SHA `73f60713938114ae4cb6b39c977216b84f849d1f` (this commit, PR #2280 head). Local: `python3 tools/ci/git/check_canonical_consistency.py --ci --base origin/dev --head HEAD` → exit 0, 0 findings across all four sub-checks. Hosted: `gh api repos/ajoe734/drts-fleet-platform/commits/73f60713938114ae4cb6b39c977216b84f849d1f/check-runs` → "Canonical consistency" `conclusion: success` for this exact `head_sha` (run 37080508933/job 111079759178); PR state `OPEN`/`MERGEABLE`. R2's commit:path evidence spot-checked directly against git objects (`git show <sha>:<path>`) for the three files Codex named (b1707c55a → forwarder-adapter-proof-spec-20260519.md and FWD-LIVE-SANDBOX-EVIDENCE.md; 0ab277dd2 → cti-recording-filing-uat-20260519.md; 0bca939f0 → PROD-LIVE-EXEC-EVIDENCE.md), all four confirmed present at the cited commits. |

## What was explicitly not done

- Did not edit any of the 237 findings' citing documents (all outside this
  task's `write_scopes`); did not create the 19 genuinely-missing artifacts.
- Did not touch F01–F08, G01, G03, G04, or G05 from the audit — those are
  other tasks' scope.
- Did not restore `passenger-web`, `partner-booking-web`,
  `concierge-portal-web`, or `assisted-entry-web` to any active-inventory
  listing, and did not re-create any paused/retired scope's planning docs.
- Did not re-run or re-verify the `smarttransport-tw-custom-domains.md`
  domain mappings against the live project; the historical record for the
  suspended project is left as written.

## Review round 1 fixes (Codex, candidate `5f027a42a`)

Codex reopened the first candidate (PR #2280, `5f027a42a`) with two findings.
Both are fixed in this candidate:

- **R1 (`same_sha_review_ci`, P1):** the hosted CI "Canonical consistency"
  check failed on the first candidate because `README.md` and
  `docs/03-runbooks/local-development.md` cited
  docs/03-runbooks/local-development.local.md in backticks. That file is
  intentionally gitignored, so `check_cited_paths` (diff-scoped, see Method
  above) correctly flagged it as a new missing-path regression — the
  checker has no way to know an untracked path is "intentional." Fix: both
  docs now point readers at the tracked
  `docs/03-runbooks/local-development.local.example.md` bootstrap file and
  describe the generated overlay in prose, so the gitignored filename no
  longer appears as a backtick-wrapped repo-rooted path. Reverified with
  `python3 tools/ci/git/check_canonical_consistency.py --ci --base origin/dev --head HEAD`
  → `0 finding(s)`.
- **R2 (`cited_path_findings_classified_without_fake_evidence`, P2):** nine
  finding-groups in the "archived history" classification above (originally
  describing docs/03-runbooks/partner-booking-live-cutover-plan-20260519.md,
  the `FWD-LIVE-001`/`FWD-LIVE-SANDBOX-20260519` sidecar group,
  docs/04-uat/cti-recording-filing-uat-20260519.md,
  docs/02-architecture/forwarder-adapter-proof-spec-20260519.md,
  docs/04-uat/partner-booking-pilot-uat-20260519.md,
  docs/03-runbooks/map-provider-operational-runbook-20260630.md,
  docs/03-runbooks/release-truth-sync-runbook-20260519.md,
  docs/03-runbooks/tenant-governance-workflow-release-gate-20260519.md, and
  support/sidecars/PROD-LIVE-EXEC-20260519/PROD-LIVE-EXEC-EVIDENCE.md) said
  "never created" / "never produced" / "not yet produced." Codex showed with
  `git ls-tree <sha>:<path>` that four of these files are retrievable at
  specific commits. Re-running this document's own stated Method step 4
  (`git log --all` / `git branch --all --contains` for each path) across the
  full set confirmed Codex's finding and found it applied to five more
  groups: every one of these nine files was in fact committed, but only on
  an unmerged `codex`/`codex2`/`claude2` worker side branch that was never
  merged into `dev` — the same "committed only on unmerged side branches"
  pattern already correctly identified elsewhere in this classification
  (e.g. the `64a653533` / `f80913225` entries above). "Never
  created/produced" was the wrong description for "exists on an abandoned
  branch, absent from dev"; both are real-world outcomes the checker's
  missing-path rule cannot tell apart, but this document can and should.
  Fix: each of the nine entries now names the actual commit and branch
  (e.g. `b1707c55a`, `origin/codex2/wf-fwd-001-live-sandbox`) instead of
  claiming the file was never written, while preserving the unchanged,
  still-true program fact that drove the original "archived" conclusion
  (forwarder adapters remain stub/F08, SR-LIVE-*/F05/F06 gates remain open,
  partner booking remains paused scope, etc. — none of that changed). The
  category totals (archived history: 79 unique paths / 171 findings) are
  unchanged; only the per-group explanation text was corrected. Spot-checked
  a sample of the other 70 archived-history paths and all 19
  genuinely-missing paths against `git log --all`/`git branch --all
  --contains` to confirm this was not a wider pattern: the `genuinely
  missing` category makes a narrower, still-accurate claim ("no replacement
  in the tracked tree under any name today"), not a "never existed" claim,
  so it did not need correction.
