# MAP-REL-001 SIDECAR ACCEPTANCE

Snapshot Type: owner support packet refresh
Snapshot Captured At: 2026-07-03T18:56:57Z
Snapshot Status At Capture: `in_progress`
Worktree / HEAD: `codex/map-rel-001-sidecar-acceptance` @ `e0d0e8657`
Supersedes: reviewer-approved 2026-07-01 snapshot at `b891e1b81`
Sidecar Owner / Reviewer: `Codex` / `Codex2`
Parent Task: `MAP-REL-001`
Parent Owner / Reviewer: `Codex2` / `Gemini2`

## Purpose

This packet is a support-only acceptance artifact for `MAP-REL-001`. It
refreshes the release-gate checklist, dependency map, and reviewer handoff
notes after rebasing this sidecar branch onto `origin/dev`, without editing
canonical truth or re-signing the parent task's release evidence.

## Scope Boundary

- Allowed: acceptance framing, dependency mapping, evidence-anchor collection,
  repo-visible path checks, machine-truth drift notes, and reviewer guidance.
- Not allowed: runtime code changes, canonical doc edits, manual edits to
  `ai-status.json`, or parent-task closeout claims.

## Snapshot Method

`ai-status.json` remains authoritative. This markdown file is a reviewer packet
built from:

- `AI_NAME=Codex scripts/ai-status.sh show <TASK>` for targeted task slices
- direct repo path checks after `git fetch origin && git rebase origin/dev`
- direct reads of already-tracked sidecar evidence files under `support/`

## Machine-Truth Snapshot

| Item | State at snapshot | Why it matters to `MAP-REL-001` |
| ---- | ----------------- | -------------------------------- |
| `MAP-REL-001-SIDECAR-ACCEPTANCE` | `in_progress` | This refresh supersedes the older approved snapshot and is the packet being handed to review now. |
| `MAP-REL-001` | `in_progress` | Parent acceptance now requires manifest-linked final evidence, blocker reports, verifier passes, and no unsupported production claim. |
| `MAP-QA-002` | `in_progress` | Direct dependency. `next` says readiness is `fail` with `34` failures and cites missing report/burndown/e2e artifact paths. |
| `MAP-OBS-001` | `Task not found` via direct `show` | Direct dependency row is missing from machine truth even though repo-visible final evidence exists under `support/sidecars/MAP-OBS-001/`. |
| `MAP-FE-CON-001` | `in_progress` | One transitive Gate A/E surface still has a discoverable canonical row and is not closed. |

Direct `show` calls returned `Task not found` for:

- `MAP-QA-001`
- `MAP-FE-CALL-001`
- `MAP-FE-TEN-001`
- `MAP-FE-ADM-001`
- `MAP-MOB-DRV-001`
- `MAP-UI-001`
- `MAP-UI-002`
- `MAP-UI-002-HARDEN-001`
- `MAP-UI-002-INTEGRATE-001`
- `MAP-BE-001`
- `MAP-BE-002`
- `MAP-BE-003`
- `MAP-BE-004`
- `MAP-BE-005`
- `MAP-BE-006`
- `MAP-FE-OPS-001`
- `MAP-INFRA-001`
- `MAP-PROD-000`

That is now the main reviewer hazard: planning docs and sidecar evidence mention
many map/geofence slices that do not currently resolve to canonical task rows.

## Parent Acceptance Bar

The current `MAP-REL-001` acceptance row requires all of the following:

- `MAP-REL-001-FINAL-EVIDENCE.md populated with real artifacts`
- `Gate A through Gate E PASS`
- `rollout and rollback documented`
- `PostGIS/provider prerequisites confirmed`
- `manifest productionEvidence items linked`
- `each FLEETS-MAP productionEvidence item closed with PASS and artifact path/link evidence`
- `readiness blocker report generated and linked`
- `blocker handoff notes posted or skipped as duplicates`
- `gap inventory closeout updated`
- `no template markers or placeholder tokens remain`
- `concrete branch@sha and artifact path/link evidence included`
- `each PASS row includes row-level artifact path/link evidence`
- `dispatch integrity verifier PASS`
- `readiness verifier PASS`
- `no unsupported production claim`

This sidecar does not lower that bar. The snapshot read against it is:

| Parent requirement | Snapshot read |
| ------------------ | ------------- |
| `MAP-REL-001-FINAL-EVIDENCE.md populated with real artifacts` | `support/sidecars/MAP-REL-001/MAP-REL-001-FINAL-EVIDENCE.md` is `MISSING`. |
| `Gate A through Gate E PASS` | Not supportable. `MAP-QA-002` still reports readiness `fail 34 failures`; `MAP-OBS-001` has repo-visible final evidence, but its canonical row is absent. |
| `rollout and rollback documented` | The 2026-06-30 execution packet exists, but no parent closeout packet or final release evidence file is visible in this worktree. |
| `PostGIS/provider prerequisites confirmed` | Mixed. `infra/alerts/map-geofence-alerts.yaml` and `scripts/check-map-provider-config.sh` exist, but `docs/03-runbooks/map-provider-operational-runbook-20260630.md` is missing and the execution packet still references a missing `scripts/verify-map-provider-env.mjs` path in one section. |
| `manifest productionEvidence items linked` | `support/sidecars/MAP-REL-001/MAP-FLEETS-EXECUTION-MANIFEST-20260701.json` is `MISSING`. |
| `each FLEETS-MAP productionEvidence item closed with PASS and artifact path/link evidence` | Cannot be checked while the manifest and parent final evidence file are both missing. |
| `readiness blocker report generated and linked` | `support/sidecars/MAP-REL-001/MAP-READINESS-BLOCKER-REPORT.md` is `MISSING`. |
| `blocker handoff notes posted or skipped as duplicates` | `scripts/note-map-geofence-blocker-handoffs.mjs` is `MISSING`, so there is no repo-visible handoff automation evidence. |
| `gap inventory closeout updated` | `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260701.md` exists, but it still records an open visual-publication blocker for `MAP-FE-ADM-001`; this is not a release closeout. |
| `no template markers or placeholder tokens remain` | Cannot be verified while the parent final evidence file is missing. |
| `concrete branch@sha and artifact path/link evidence included` | True for `MAP-OBS-001-FINAL-EVIDENCE.md`; not true yet for the parent packet because the parent evidence file is missing. |
| `each PASS row includes row-level artifact path/link evidence` | Observable in `MAP-OBS-001-FINAL-EVIDENCE.md`; not reviewable for `MAP-REL-001` because the parent evidence file is missing. |
| `dispatch integrity verifier PASS` | `scripts/verify-map-geofence-dispatch-integrity.mjs` is `MISSING`. |
| `readiness verifier PASS` | No repo-visible readiness-verifier output or final parent evidence file is present. |
| `no unsupported production claim` | Parent must stay below any production-ready claim until the missing task rows and missing artifact paths above are reconciled. |

## Dependency Map

### 1. Direct hard dependencies

| Dependency | Current state | Relationship to `MAP-REL-001` |
| ---------- | ------------- | ------------------------------ |
| `MAP-QA-002` | `in_progress` | Owns the release-gate E2E/UAT proof. Its `next` explicitly says readiness is `fail 34 failures`, and its declared `support/sidecars/MAP-QA-002/` artifact directory is absent from this worktree. |
| `MAP-OBS-001` | direct `show` returns `Task not found`; repo-visible final evidence exists | Owns metrics, audit, alerts, and runbook distinctions. `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md` reports repo-backed scope `PASS`, but production exporter/dashboard/release wiring remains `EXTERNAL-GATED` and the canonical task row is missing. |

### 2. Gate support map

| Release gate | Snapshot reading |
| ------------ | ---------------- |
| Gate A: Callcenter safe to dispatch | Still depends on `MAP-QA-002` plus multiple transitive surfaces whose direct task rows are currently not discoverable (`MAP-FE-CALL-001`, `MAP-FE-TEN-001`, `MAP-QA-001`). `MAP-FE-CON-001` is discoverable and still `in_progress`. |
| Gate B: Governance safe to publish | The 2026-07-01 gap delta says the remaining blocker is visual publication for `MAP-FE-ADM-001`, not product/contract ambiguity, but `MAP-FE-ADM-001` and backend authority rows are not directly discoverable in machine truth. |
| Gate C: Ops safe to operate | `MAP-FE-OPS-001` is still planning-doc only from this worktree's machine-truth view, and `MAP-QA-002` evidence artifacts for ops are not present under `support/sidecars/MAP-QA-002/`. |
| Gate D: Driver safe to navigate | `MAP-MOB-DRV-001` is not discoverable via direct `show`, and no parent-side driver UAT closeout artifact is visible under `support/sidecars/MAP-REL-001/`. |
| Gate E: Degraded safe | `MAP-OBS-001` final evidence is the strongest repo-visible input, but parent release proof is still incomplete because provider-runbook/env-path drift and missing verifier/report artifacts remain unresolved. |

### 3. Machine-truth drift the reviewer should preserve

| Drift | Evidence | Reviewer implication |
| ----- | -------- | -------------------- |
| Direct dependency row missing while evidence file exists | `MAP-OBS-001` is declared as a dependency by both `MAP-REL-001` and this sidecar, yet `scripts/ai-status.sh show MAP-OBS-001` returns `Task not found` while `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md` is present and marked repo-backed `PASS`. | Do not let parent closeout treat either the row or the file as sufficient by itself; both machine truth and evidence need reconciliation. |
| QA dependency text references artifacts not visible in repo | `MAP-QA-002.next` names `support/sidecars/MAP-REL-001/MAP-READINESS-BLOCKER-REPORT.md`, `support/sidecars/MAP-REL-001/MAP-PRODUCTION-READINESS-BURNDOWN-20260703.md`, and multiple `support/sidecars/MAP-QA-002/artifacts/*.json` paths, but each checked path is currently `MISSING`. | Parent review should treat the QA dependency as actively open, not as an evidence packet waiting only for sign-off. |
| Transitive execution rows are absent from direct machine truth | The direct `show` misses listed above cover FE, QA, UI, BE, infra, ops, and provider slices that planning docs still cite. | Treat planning-doc mentions as planning context only. They are not current canonical task closure by themselves. |
| Provider preflight path is internally inconsistent | The execution packet operational rules say `scripts/check-map-provider-config.sh` is the shared preflight, but the `MAP-INFRA-001` implementation-status prose still says `scripts/verify-map-provider-env.mjs` was added; that path is missing from the repo. | Parent release evidence should name the actual living preflight path, or explicitly explain the rename/supersession. |

## Repo-Visible Evidence

### Present in this worktree

| Artifact | Why it matters |
| -------- | -------------- |
| `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md` | Canonical baseline execution packet for the five release gates and task graph. |
| `docs/03-runbooks/map-geofence-fleets-execution-tasks-20260701.md` | Delta task packet that narrows the `MAP-FE-ADM-001` blocker to canonical Platform Admin visual publication. |
| `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md` | Baseline gap inventory still cited by the parent task family. |
| `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260701.md` | Delta gap note showing the blocker is visual-publication scope, not unresolved product semantics. |
| `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md` | Repo-visible observability final evidence with branch/SHA, PASS rows, artifacts, and explicit `EXTERNAL-GATED` limits. |
| `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE-TEMPLATE.md` | The verifier-topic contract still useful if parent needs to compare final evidence vs. original row requirements. |
| `support/sidecars/MAP-QA-001/MAP-QA-001-MOCK-PROVIDER-HARNESS.md` | Confirms the QA harness doc now exists; the older 2026-07-01 packet wrongly flagged it missing before rebasing. |
| `infra/alerts/map-geofence-alerts.yaml` | Confirms the alert config path is now present in the repo. |
| `scripts/check-map-provider-config.sh` | Repo-visible map-provider preflight script actually present today. |

### Missing or mismatched paths

| Path | Snapshot result | Why it matters |
| ---- | --------------- | -------------- |
| `support/sidecars/MAP-REL-001/MAP-FLEETS-EXECUTION-MANIFEST-20260701.json` | `MISSING` | Parent task row claims manifest-based productionEvidence closeout, but the manifest file is not visible. |
| `scripts/verify-map-geofence-dispatch-integrity.mjs` | `MISSING` | Parent task row requires dispatch integrity verifier PASS, but the referenced verifier script is absent. |
| `scripts/report-map-geofence-readiness-blockers.mjs` | `MISSING` | Parent task row requires a generated blocker report, but the referenced reporter script is absent. |
| `scripts/note-map-geofence-blocker-handoffs.mjs` | `MISSING` | Parent task row claims blocker handoff notes, but the referenced notifier script is absent. |
| `support/sidecars/MAP-REL-001/MAP-READINESS-BLOCKER-REPORT.md` | `MISSING` | `MAP-QA-002.next` cites this report as part of readiness failure context. |
| `support/sidecars/MAP-REL-001/MAP-PRODUCTION-READINESS-BURNDOWN-20260703.md` | `MISSING` | `MAP-QA-002.next` cites this burn-down file, but it is not visible here. |
| `support/sidecars/MAP-REL-001/MAP-REL-001-FINAL-EVIDENCE.md` | `MISSING` | Parent release packet itself is not present. |
| `support/sidecars/MAP-QA-002/` | `MISSING` | `MAP-QA-002` declares this directory and several `artifacts/*.json` outputs, but none are present. |
| `docs/03-runbooks/map-provider-operational-runbook-20260630.md` | `MISSING` | Execution packet implementation-status prose still claims this runbook exists. |
| `scripts/verify-map-provider-env.mjs` | `MISSING` | Likely superseded by `scripts/check-map-provider-config.sh`, but the parent should not cite the stale path without reconciliation. |

## Reviewer Hotspots

1. `MAP-OBS-001` is the clearest board-drift example: final evidence is present
   and looks substantial, but the canonical task row is absent. Parent release
   review needs both truth layers aligned before claiming dependency closure.
2. `MAP-QA-002` remains the largest direct blocker. Its own `next` says
   readiness `fail 34 failures`, and the repo paths it cites for reports,
   burn-down, and e2e outputs are missing from this worktree.
3. The parent task row asks for manifest-linked closeout plus verifier passes,
   but the manifest, dispatch-integrity script, readiness-blocker reporter, and
   parent final evidence file are all missing.
4. The 2026-07-01 gap delta matters: if parent review still describes
   `MAP-FE-ADM-001` as blocked on unresolved product/contract semantics, that
   wording is stale. The delta narrows the blocker to missing canonical visual
   publication.
5. The provider-preflight story is path-drifting. Current repo state supports
   `scripts/check-map-provider-config.sh`, while older packet prose still points
   at a missing `.mjs` verifier path.

## Reviewer Recheck

Before approving this sidecar refresh, re-run:

- `git diff --check -- support/sidecars/MAP-REL-001/MAP-REL-001-SIDECAR-ACCEPTANCE.md`
- `AI_NAME=Codex2 scripts/ai-status.sh show MAP-REL-001-SIDECAR-ACCEPTANCE`
- `AI_NAME=Codex2 scripts/ai-status.sh show MAP-REL-001`
- `AI_NAME=Codex2 scripts/ai-status.sh show MAP-QA-002`
- `AI_NAME=Codex2 scripts/ai-status.sh show MAP-OBS-001`

And re-check these path groups before citing them as landed evidence:

- `support/sidecars/MAP-REL-001/`
- `support/sidecars/MAP-QA-002/`
- `support/sidecars/MAP-OBS-001/`
- `scripts/check-map-provider-config.sh`
- `infra/alerts/map-geofence-alerts.yaml`

No runtime verification was run for this sidecar slice itself because this task
only produces a reviewer support artifact. Verification here is limited to
machine-truth queries, repo path checks, and evidence-file inspection.
