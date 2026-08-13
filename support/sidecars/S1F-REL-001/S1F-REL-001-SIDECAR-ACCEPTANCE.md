# S1F-REL-001 Acceptance Packet and Dependency Map

- Parent task: `S1F-REL-001` — Finalize the verified Stage 1 functional release candidate
- Sidecar task: `S1F-REL-001-SIDECAR-ACCEPTANCE`
- Owner: `Codex2`; reviewer: `Codex`
- Scope: reviewer-facing support material only. This packet neither changes nor supersedes canonical product truth, machine truth, runtime code, deployment state, or release evidence.
- Snapshot: 2026-08-13 UTC

## Purpose and release boundary

The parent owner must close one immutable Dev candidate, not a collection of independently green branches. A release claim requires the same candidate SHA across source, images, migrations, deployed revisions, active-surface responses, operational evidence, and post-deploy readbacks. Local runs, a branch head, or a prior deployment run alone are insufficient.

Primary truth anchors:

- `docs/02-architecture/stage1-dev-functional-completeness-gap-20260808.md` §7 — G1–G8 completion gates.
- `docs/03-runbooks/stage1-dev-functional-completion-execution-tasks-20260808.md` — `S1F-REL-001`, `S1F-UIX-001`, and `S1F-DRV-001` execution and acceptance boundaries.
- `docs/04-uat/operational-browser-acceptance-runbook.md` — deployed operational-browser gate and candidate-SHA requirements.

## Dependency map

| Dependency | Machine-truth snapshot | What it contributes | Release-owner verification still required |
| --- | --- | --- | --- |
| `S1F-REL-001-PREDEPLOY` | `done`; merged to `dev` at `f9c720fa49df888ea4761f167d16c96b64a9481f` | Candidate deployment workflow, candidate-specific operational manifest, SHA-response gate, and deployed URL record shape. | Reconcile the actual normal Dev workflow/run URL, deployed revisions, URLs, migration result, and operational-acceptance output to the exact final release candidate. Its checked-in UAT evidence template is explicitly a template and contains pending fields; it is not deployment proof. |
| `S1F-UIX-001` | `done`; reviewed candidate `5ef8259682ae8167234c64604a16478ffb13d6e4` | Cross-surface browser mutations, API readbacks, fixture/inert-control failure checks, and frozen-route checks. | Rerun against deployed URLs for the final candidate; preserve URL, actor scope, request/result ID, readback state, and candidate-header evidence. Do not promote a reviewed branch SHA as final deployment evidence. |
| `S1F-DRV-001` | `done`; merged to `dev` at `6a43f1a9423c14d9b232770222a7f5aebaa7b5b5` | Android driver login/bind, accept/start/complete, reconnect/offline readback, SOS, and operator/API readback coverage. | Confirm or replay the driver journey against the current deployed candidate and record matching app/API SHA. Earlier evidence records `5410f8f86b956a58605eb0f73377bedadc7457f8`, so it cannot by itself prove a later release candidate. |

Downstream: `S1F-DOC-001` depends on this parent task and may publish final Stage 1 truth only after this packet's evidence requirements are satisfied. This sidecar does not authorize that publication.

## Acceptance checklist

The parent owner/reviewer should retain immutable links or artifact paths beside each item. Check an item only for the release candidate SHA under review.

- [ ] **Candidate ledger:** record final source SHA, commit/review reachability, image tags/digests, migration execution, Dev workflow URL, Cloud Run/service revision IDs, and deployed URLs. Every record identifies one exact SHA.
- [ ] **G1 — active data truth:** the deployed operational suite proves no healthy active UI falls back to fixture or preview rows.
- [ ] **G2 — action truth:** every enabled active-surface control produces a request, download, or navigation and renders a result or error state; enabled inert controls fail the suite.
- [ ] **G3 — lifecycle truth:** create, update, cancel, submit, and approve paths survive refresh plus API/database readback; retain returned IDs and resulting states.
- [ ] **G4 — cross-surface truth:** formal Referral and Fleet supply records appear in their scoped downstream surfaces after their creating operations.
- [ ] **G5 — native truth:** Android emulator journey covers login/bind, task view, accept, start, complete, reconnect/offline proof, and SOS; completed trip and SOS have operator or API readback using the candidate app/API SHA.
- [ ] **G6 — runtime truth:** normal Dev deployment deployed exactly the candidate once; active services are healthy and operational journeys pass against deployed URLs while their active responses expose that same SHA in `x-drts-candidate-sha`.
- [ ] **G7 — frozen-surface truth:** Partner Booking and Concierge are HTTP `404` in the deployed check. The candidate manifest also models retired Passenger as `404`; retain that result when the deployed manifest includes it.
- [ ] **G8 — regression truth:** retain successful evidence for the existing 22/22 API E2E suite, 39-route suite, build/typecheck, and deployed smoke for the same candidate lifecycle.
- [ ] **No false promotion:** evidence contains no claim based solely on local execution, branch status, or a different historic candidate SHA.

## Operational evidence contract

For the browser gate, invoke `scripts/run-operational-browser-acceptance.sh` only with the immutable `DRTS_CANDIDATE_SHA`, candidate-specific journey manifest, and all active/retired deployed surface URLs. The manifest top-level `candidateSha` must equal the environment SHA exactly. Each active route, mutation response, and readback must return matching `x-drts-candidate-sha`.

Record or link the generated `test-results/operational-browser/operational-browser-evidence.json` with the release evidence. It must capture the candidate SHA, URL, actor scope, operation, request/result ID, and readback state. A 200 route-only check is availability evidence, not operational acceptance.

## Reviewer hotspots for Codex

1. Verify the packet remains support-only and does not create new product semantics or change canonical records.
2. Confirm every dependency status above through `scripts/ai-status.sh show <task-id>` at review time; treat this snapshot as context, not a substitute for fresh machine truth.
3. Ensure the parent candidate ledger makes the exact SHA traceable from source through deployment and all collected evidence.
4. Reject any attempt to satisfy G6/G7 with local URLs or to satisfy G5 with the historic driver SHA without a current-candidate reconciliation or replay.
5. Confirm the final evidence covers every G1–G8 item, including operational readback metadata and the frozen `404` assertions.

Suggested approval conclusion:

> Packet accurately preserves the release boundary: it maps the three formal dependencies, identifies that historic and template evidence cannot stand in for the final deployed candidate, and provides a G1–G8 checklist requiring one immutable SHA across source, deployment, operational browser evidence, Android evidence, frozen-surface checks, and regression evidence. It is support-only and introduces no canonical-truth change.

Suggested return conclusion:

> Packet needs revision: identify the dependency/status mismatch, missing exact-SHA provenance, unsupported release claim, omitted G1–G8 evidence, or support-scope drift.

## Handoff

Owner handoff after committing and pushing this support artifact:

```bash
CANDIDATE_SHA=$(git rev-parse HEAD) \
CANDIDATE_BRANCH=$(git branch --show-current) \
AI_NAME=Codex2 scripts/ai-status.sh handoff S1F-REL-001-SIDECAR-ACCEPTANCE Codex \
  "Support-only S1F-REL-001 acceptance packet is ready at support/sidecars/S1F-REL-001/S1F-REL-001-SIDECAR-ACCEPTANCE.md. It maps PREDEPLOY/UIX/DRV dependencies, distinguishes historic/template evidence from final-candidate proof, and supplies the G1-G8 exact-SHA release checklist. Verification: markdown link/path scan and git diff --check."
```

## Change log

- 2026-08-13 UTC — Initial packet prepared from the task machine-truth slices and the cited Stage 1 gap, execution runbook, operational-browser runbook, predeploy template, and driver evidence pack.
- 2026-08-13 UTC — Corrected reviewer and handoff target to `Codex`, matching task machine truth.
