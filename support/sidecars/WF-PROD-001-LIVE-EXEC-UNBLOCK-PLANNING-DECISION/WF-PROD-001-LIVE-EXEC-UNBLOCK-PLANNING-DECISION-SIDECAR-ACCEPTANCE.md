# WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION` — Resolve planning blocker for `WF-PROD-001-LIVE-EXEC`
**Parent Owner:** `Codex` (per `ai-status.json -> WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION.owner` at packet write)
**Parent Reviewer:** `Codex2` (per `ai-status.json -> WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION.reviewer` at packet write)
**Sidecar Owner:** `Claude2`
**Sidecar Reviewer:** `Codex`
**Generated:** `2026-05-19` (UTC)
**Status:** `ACCEPTANCE SUPPORT ARTIFACT` — support-only; does not modify
canonical truth, the planning ref, runtime behavior, the parent's
machine-truth fields, or any L1/L2 product surface. For the live
machine-truth status of this sidecar row, read
`ai-status.json -> WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION-SIDECAR-ACCEPTANCE.status`
directly; this packet does not snapshot it.

This packet is the forward-looking acceptance map for parent
`WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION`. At packet write the
parent is `in_progress` in machine truth — the parent owner (`Codex`)
has been verifying whether the grandparent `WF-PROD-001-LIVE-EXEC` is
a true planning blocker or an external-gated `HELD` task (see the
parent's `next` field at packet write). Each acceptance gate below is
phrased as a property the parent's planning-decision artifact must
satisfy once `Codex` finalizes it. The sidecar reviewer (`Codex`) is
the same lane as the parent owner (`Codex`); the sidecar review only
audits packet accuracy and does **not** approve the parent
planning-decision artifact — only the parent reviewer (`Codex2`) may
approve `WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION`. This packet
does not pre-approve the parent artifact and does not pre-resolve the
grandparent's `blocked` state.

---

## 1. Scope Boundary

In scope for this sidecar:

- Translate the parent task's `acceptance` field and the
  Phase 1 v3 wave-planning HELD-row guidance for
  `WF-PROD-001-LIVE-EXEC` into a concrete, citation-anchored
  acceptance checklist for the planning-decision artifact at
  `support/unblock/WF-PROD-001-LIVE-EXEC/WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION.md`.
- Pin the dependency map for the parent (`PROD-SPEC-001`,
  `PROD-DRILL-001`) and confirm the live machine-truth status of
  each is read at the time the parent reviewer audits.
- Record the grandparent `WF-PROD-001-LIVE-EXEC` machine-truth state
  (status, owner, reviewer, `waiting_for`) and the existing live-rail
  evidence anchors (`PROD-RAIL-CLOSEOUT-20260519`,
  `prod-deploy-rollback-runbook-20260519.md`, `deploy-prod.yml`,
  `E2E-009`) so the parent's planning-decision artifact can correctly
  classify the blocker as **planning** vs **external-gated**.
- Preserve a reviewer-handoff command block the assigned sidecar
  reviewer (`Codex`) can run after this packet is written.

Out of scope for this sidecar:

- editing L1 / L2 product truth (`phase1_*`, contracts bundle), the
  Phase 1 v3 wave-planning runbook, the directive archive, the
  prod-deploy-rollback runbook, the workflow-acceptance gate matrix,
  or the parent task's machine-truth fields
  (`ai-status.json -> WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION`)
- editing `.github/workflows/deploy-prod.yml`,
  `tests/e2e/E2E-009-prod-rail-dry-run.sh`, or any
  parent-write-scope file under the planning-decision artifact path
  (`support/unblock/WF-PROD-001-LIVE-EXEC/`)
- pre-running the parent's acceptance commands, opening a
  parent-scoped commit, or altering parent ownership / reviewership
- writing the planning-decision artifact's body (that is the parent
  owner `Codex`'s deliverable, not this sidecar's)
- approving `WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION` itself
  (only `Codex2` may do that on the parent row, as the live parent
  reviewer)
- transitioning the grandparent `WF-PROD-001-LIVE-EXEC` out of
  `blocked` (that requires the external GCP/WIF/Environment wiring
  the wave-planning runbook §HELD calls out, plus a live-execution
  evidence packet — neither of which is in scope for either the
  sidecar or the parent unblock task)

---

## 2. Machine Truth Anchors

### Sidecar (this task) — `ai-status.json -> WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION-SIDECAR-ACCEPTANCE`

Persistent fields:

- owner=`Claude2`
- reviewer=`Codex`
- phase=`Phase 1 v3`
- task_class=`sidecar`
- helper_parent=`WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- auto_generated=`true`
- auto_created_by=`supervisor-underutilization`
- depends_on: `PROD-SPEC-001`, `PROD-DRILL-001` (mirrors the parent's
  dependency set)
- artifacts:
  `support/sidecars/WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION/WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION-SIDECAR-ACCEPTANCE.md`
  (this file)
- acceptance:
  - `Create support artifacts only`
  - `Do not edit canonical truth`
  - `Hand off the packet to the assigned reviewer`

Live status (read directly from machine truth, not from this packet):

- The current value of
  `ai-status.json -> WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION-SIDECAR-ACCEPTANCE.status`
  is the authoritative present state of this sidecar. This packet
  intentionally does not snapshot the live status — any such snapshot
  becomes false the moment the sidecar transitions. For the lifecycle
  history of this sidecar, see `ai-activity-log.jsonl` filtered on
  `WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION-SIDECAR-ACCEPTANCE`.

### Parent — `ai-status.json -> WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION`

- id=`WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION`
- title=`Resolve planning blocker for WF-PROD-001-LIVE-EXEC`
- summary_zh=`Chairman generated unblock task for
  WF-PROD-001-LIVE-EXEC: resolve or route the missing
  product/contract decision.`
- owner=`Codex`, reviewer=`Codex2`
- status at packet write: `in_progress`
  (`last_update=2026-05-19T20:30:09Z`); the parent has been claimed
  and is being worked. Each gate in §4 is a forward-looking property
  the planning-decision artifact must satisfy before parent reviewer
  approval.
  - For the live cycle position of the parent, read
    `ai-status.json -> WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION.status`
    directly; this packet does not snapshot transient parent status.
- depends_on: `PROD-SPEC-001`, `PROD-DRILL-001`
- artifacts:
  `support/unblock/WF-PROD-001-LIVE-EXEC/WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION.md`
- acceptance (verbatim from the parent row):
  - `Resolve or route the missing product/contract decision through
    canonical planning artifacts`
  - `Record the decision`
  - `scope cut`
  - `or explicit follow-up needed by the parent task`
  - `Produce task-scoped commit/push/PR evidence for any canonical
    change`
  - `Update the parent task with the concrete unblocked next step`
- task_class=`unblock`
- helper_parent=`WF-PROD-001-LIVE-EXEC`
- helper_kind=`planning_decision`
- mutates_canonical=`true` (parent diff IS a canonical change; this
  is one of the few cases where a parent helper task explicitly
  writes canonical state — namely, the planning-decision artifact
  itself plus a parent `next` field update on the grandparent row)
- auto_created_by=`chairman-blocked-task-triage`

This packet treats `ai-status.json` as authoritative for owner /
reviewer. If the parent owner field shifts before the parent
finalizes, the live parent reviewer (`Codex2` at packet write) should
re-confirm ownership before approving, and any parent commit's
`LLM-Agent` trailer must reflect the live owner at finalize time.

Same-lane note: at packet write the sidecar reviewer (`Codex`) is the
same lane as the parent owner (`Codex`). This is the supervisor's
standard sidecar pairing — the reviewer audits packet accuracy only,
not the parent's planning-decision artifact. The parent artifact is
still approved by the live parent reviewer (`Codex2`), not by the
sidecar reviewer.

### Grandparent — `ai-status.json -> WF-PROD-001-LIVE-EXEC`

- id=`WF-PROD-001-LIVE-EXEC`
- title=`Production deploy live execution (HELD)`
- summary_zh=`第一次真 prod deploy。HOLD pending PROD_* GCP project +
  WIF + Secret Manager + Artifact Registry + GitHub Environment
  'production' reviewer rule.`
- owner=`Gemini`, reviewer=`Gemini2`
- status at packet write: `blocked` (with `waiting_for=Gemini2`),
  `last_update=2026-05-19T20:33:02Z`
- depends_on: `PROD-SPEC-001`, `PROD-DRILL-001`
- artifacts:
  `support/sidecars/PROD-LIVE-EXEC-20260519/PROD-LIVE-EXEC-EVIDENCE.md`
  (not yet present at packet write — that path is the forward-looking
  live-execution evidence packet target; live evidence does not yet
  exist because the live execution has not run)
- `next` field at packet write records the operational gate:
  > `External-gated. Complete prod-deploy-rollback runbook GitHub
  > configuration and GCP wiring, then run the first real deploy
  > with gh workflow run deploy-prod.yml -f tag=prod/v<YYYY.MM.DD>.<N>.
  > After that run completes, attach live-execution evidence and
  > re-open WF-PROD-001-LIVE-EXEC for closeout. See
  > support/unblock/WF-PROD-001-LIVE-EXEC/WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION.md.`
- planning_ref:
  `docs/03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md`
- directive_ref:
  `docs/00-context/phase1-design-blueprint-completion-directive-20260519.md`

The grandparent is not in scope for closeout by either this sidecar or
the parent unblock task. The wave-planning runbook §5 explicitly lists
`WF-PROD-001-LIVE-EXEC` under `HELD — Pending human resources /
external resolution` (lines 134–135) with the reason `Needs prod GCP
project + WIF + Cloud SQL + Secret Manager + GitHub Environment
'production' reviewer rule`, and §8 records it as a P1 follow-on (line
176: `WF-PROD-001-LIVE-EXEC once GCP prod configured`).

### Authoritative source documents

- Phase 1 v3 wave-planning runbook (parent's planning context):
  - `docs/03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md`
    - §5 HELD table line 135:
      `WF-PROD-001-LIVE-EXEC` HELD reason
    - §8 P1 follow-ons line 176:
      `WF-PROD-001-LIVE-EXEC once GCP prod configured`
    - §3.9-style row in the workflow-family directive (line 37):
      `WF-PROD-001` gate read `PASS (dry-run contract evidence)` after
      v2; v3 adds production-deploy-rail-spec +
      production-rollback-drill docs.
- Phase 1 design-blueprint completion directive (`WF-PROD-001` design
  spec):
  - `docs/00-context/phase1-design-blueprint-completion-directive-20260519.md`
    - §3.9 (lines 560–612) defines `WF-PROD-001` Production Deploy /
      Rollback Rail — required docs, workflow, configured vars/secrets,
      workflow graph, and acceptance standards (workflow not skeleton,
      production environment required reviewer gate, dry-run or
      controlled production dry-run possible, rollback drill evidence).
    - §4 task table line 655: `WF-PROD-001` is owned by `DevOps` /
      reviewed by `Tech Lead`, P0.
- Production deploy/rollback runbook (the operational anchor the
  planning-decision artifact must align with):
  - `docs/03-runbooks/prod-deploy-rollback-runbook-20260519.md`
    - Required GitHub repo variables (lines 25–47):
      `PROD_GCP_PROJECT_ID`, `PROD_GCP_REGION`,
      `PROD_GCP_CLOUDSQL_INSTANCE`,
      `PROD_GCP_RUNTIME_SERVICE_ACCOUNT`,
      `PROD_PLATFORM_ADMIN_ORIGIN`, `PROD_OPS_CONSOLE_ORIGIN`,
      `PROD_CONTROL_PLANE_API_ORIGIN`, `PROD_IAP_CLIENT_ID`,
      and optional `PROD_ARTIFACT_*`, `PROD_SECRET_PREFIX`,
      `PROD_*_ALLOW_UNAUTHENTICATED`.
    - Required GitHub repo secrets (lines 54–57):
      `PROD_WIF_PROVIDER`, `PROD_WIF_SERVICE_ACCOUNT`.
    - GCP wiring (lines 59–105): WIF pool + provider, runtime SA
      separation, Cloud SQL connection, Secret Manager hard-fail set
      (`-db-url`, `-api-key-salt`, `-jwt-secret`,
      `-controlled-download-signing-secret`, optional `-internal-key`).
    - Workflow graph (lines 109–125):
      `validate-config → build-push → migrate → deploy →
      health-check`, with the tag shape `prod/v<YYYY.MM.DD>.<N>`,
      origin-tag existence check, and Secret Manager pre-check.
- Existing rail evidence (read-only context for this packet; the
  parent's planning-decision artifact may cite but not modify):
  - `support/sidecars/PROD-RAIL-CLOSEOUT-20260519/PROD-RAIL-CLOSEOUT-EVIDENCE.md`
    — captures `PASS (dry-run contract evidence)` for the rail
    surface, with §4 explicit non-claims (no live build, push,
    revision, migration, prod GCP contact, WIF auth, or Secret Manager
    access), §5 gate matrix update, §7 operator next steps (lines
    listing the GCP/WIF/Environment requirements that gate live
    execution).
  - `.github/workflows/deploy-prod.yml` — non-skeleton 627-line
    workflow with `validate-config`, `build-push`, `migrate`,
    `deploy`, `health-check` jobs (E2E-009 surfaces).
  - `tests/e2e/E2E-009-prod-rail-dry-run.sh` — static contract check
    asserting the rail's four surfaces (`validate-config`,
    `build-push`, `deploy-dry-run`, `rollback`) all `status=pass`.
- Workflow-family gate matrix (read-only context):
  - `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`
    line 63: `WF-PROD-001` row records gate read
    `PASS (dry-run contract evidence)` with the explicit
    EXTERNAL-GATED remaining-non-claim for live prod execution.
- Branch strategy (read-only context):
  - `docs/ops/branch-strategy.md` §7 (operator command path:
    `gh workflow run deploy-prod.yml -f tag=prod/v<date>`).

---

## 3. Dependency Map

### Formal upstream dependencies (parent's `depends_on`)

| Upstream         | Live status (read at audit time) | Lane owner / reviewer            | Why it matters for the parent unblock task                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------- | -------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PROD-SPEC-001`  | `review` at packet write          | owner=`Codex2`, reviewer=`Gemini2` | Production deploy rail formal spec. Artifact `docs/03-runbooks/production-deploy-rail-spec-20260519.md`. The parent's planning-decision artifact must cite this spec (or its successor at audit time) as the authoritative source of the `PROD_*` config surface and the workflow graph the live execution will run. If `PROD-SPEC-001` is still `review` at parent finalize, the planning-decision artifact must either reference the spec content as it stands or explicitly defer the live-execution unblock until `PROD-SPEC-001` reaches `done`. Recorded `next` at packet write: spec added; commit `2bee5bb` pushed to `origin/codex2/prod-spec-001`. |
| `PROD-DRILL-001` | `backlog` at packet write         | owner=`Gemini2`, reviewer=`Gemini`  | Production rollback drill protocol. Artifact `docs/03-runbooks/production-rollback-drill-20260519.md` (net-new). The parent's planning-decision artifact must record whether the drill protocol is required before the first live deploy (drill before first live execution) or whether the drill can run against the first live deploy itself (drill against the live tag). Recorded `next` at packet write: `Awaiting owner pickup (phase1-v3 wave)`.                                                                                                                                                                                                                                                                                                                |

The parent should treat `PROD-SPEC-001` and `PROD-DRILL-001` as
**advisory inputs**, not blockers, because the wave-planning runbook
§5 explicitly classifies the grandparent `WF-PROD-001-LIVE-EXEC` as
external-gated. The planning-decision artifact's central question is
not "are the docs done?" but "is the live-execution blocker a
planning-shape problem or a resource-shape problem?".

### Non-formal but spec-relevant upstream context

These constrain the shape of the planning decision but are not
`depends_on` rows:

- `support/sidecars/PROD-RAIL-CLOSEOUT-20260519/PROD-RAIL-CLOSEOUT-EVIDENCE.md`
  — establishes that the rail itself is non-skeleton and dry-run
  passes; the planning-decision artifact must not contradict the
  rail-pass claim or reopen the rail-skeleton question.
- `docs/03-runbooks/prod-deploy-rollback-runbook-20260519.md` — lists
  the concrete GitHub repo variables, secrets, and GCP wiring
  required for live execution; the planning-decision artifact must
  enumerate exactly this set when deciding "external-gated" vs
  "planning-gated".
- `docs/00-context/phase1-design-blueprint-completion-directive-20260519.md`
  §3.9 — defines what "WF-PROD-001 done" means at the directive level;
  the planning-decision artifact must keep its scope within the parent
  unblock task and not re-arbitrate directive content.
- Sibling unblock tasks in flight that share the same supervisor
  triage origin and similar planning-decision shape:
  - `WF-FWD-001-LIVE-SANDBOX-UNBLOCK-PLANNING-DECISION`
  - `WF-DRV-MP-001-DEVICE-EVIDENCE-UNBLOCK-MANUAL-UNBLOCK`
  - `E2E-NUMBERING-DECISION-UNBLOCK-PLANNING-DECISION`
  - `WF-PARTNER-RENAME-DECISION-UNBLOCK-PLANNING-DECISION`
  - `WF-FIN-GOV-DECISION-UNBLOCK-PLANNING-DECISION`
  - `DOCS-STRATEGY-DECISION-UNBLOCK-PLANNING-DECISION`
  - `WF-FWD-001-LIVE-SANDBOX-UNBLOCK-MANUAL-UNBLOCK`
  Visual / structural parity across these unblock artifacts is
  reviewer-helpful; this packet does not enforce it but flags it.

### Formal downstream dependents

| Downstream                     | Status at packet write | Depends on parent unblock because                                                                                                                                                                                                                                                                                                                                | Risk if parent decision drifts                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------ | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WF-PROD-001-LIVE-EXEC` (grandparent) | `blocked`              | The grandparent's `next` field at packet write already points at the parent's artifact path (`support/unblock/WF-PROD-001-LIVE-EXEC/WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION.md`). When the parent finalizes, the grandparent's `next` should be updated to either (a) confirm external-gated with concrete operator steps, (b) record a scope cut, or (c) define the planning follow-up. | If the parent's planning-decision artifact misclassifies the grandparent (e.g., calls it planning-gated when it is external-gated, or vice versa), the chairman triage loop will re-spawn an unblock task and the grandparent stays `blocked` indefinitely.                                                                                                                                                                                                                                                                                                       |

### Ordering guidance vs. formal blockers

The parent unblock task is **not** formally blocked on
`PROD-SPEC-001` or `PROD-DRILL-001` reaching `done`. The parent is
expected to read the live state of both upstream rows at audit time
and then either:

1. Resolve the decision now (most likely outcome: classify the
   grandparent as external-gated and define the concrete next step),
   OR
2. Explicitly defer with a `next` that points at the missing upstream
   item.

This packet does not redefine the formal blocker set; it only records
the ordering guidance the parent reviewer (`Codex2`) will apply.

---

## 4. Acceptance Checklist (for the parent's planning-decision artifact)

Each item is a forward-looking property the parent's
planning-decision artifact must satisfy at parent-finalize time. The
sidecar review only audits that this checklist exists and points at
the right anchors; it does **not** pre-verify the parent artifact.

### A. Decision classification recorded `[REQUIRED]`

The parent artifact must explicitly state which of the following
classifications applies to `WF-PROD-001-LIVE-EXEC`:

1. **External-gated (most likely)** — the grandparent is blocked on
   human-provisioned external resources (GCP prod project, WIF,
   Cloud SQL, Secret Manager, Artifact Registry, GitHub Environment
   `production` reviewer rule). No further planning decision is
   needed; the parent records the concrete operator checklist and
   the planning-decision branch closes.
2. **Planning-gated** — there is an unresolved product or contract
   decision (e.g., scope of the first live deploy, choice of pilot
   tenant, rollback drill ordering, IAP audience policy, deploy-time
   secret rotation policy) that must be answered before the
   external wiring is even useful. The parent records the decision
   inline or routes it to a named upstream owner with a deadline.
3. **Scope cut** — the parent records that `WF-PROD-001-LIVE-EXEC`
   should be deferred out of Phase 1 v3 and re-scoped (e.g., as
   `WF-PROD-001-LIVE-EXEC-PILOT` or as a Phase 2 task). The parent
   updates the grandparent row's `next` accordingly and notes the
   re-scope rationale.

Ambiguity is not acceptable; the parent must pick one classification
and justify it with citations to the wave-planning runbook §5/§8,
the directive §3.9, and the runbook §"Required GitHub Configuration"
+ §"Required GCP Wiring".

### B. Concrete next-step set, anchored to runbook surfaces `[REQUIRED]`

The parent artifact must enumerate the concrete operator actions
that lift `WF-PROD-001-LIVE-EXEC` from `blocked` to executable.
Specifically, the artifact must reference (by file:line where
useful) the runbook's required configuration set:

- `vars.PROD_GCP_PROJECT_ID`, `vars.PROD_GCP_REGION`,
  `vars.PROD_GCP_CLOUDSQL_INSTANCE`,
  `vars.PROD_GCP_RUNTIME_SERVICE_ACCOUNT`,
  `vars.PROD_PLATFORM_ADMIN_ORIGIN`, `vars.PROD_OPS_CONSOLE_ORIGIN`,
  `vars.PROD_CONTROL_PLANE_API_ORIGIN`, `vars.PROD_IAP_CLIENT_ID`
  (per runbook lines 25–37)
- optional `vars.PROD_ARTIFACT_*`, `vars.PROD_SECRET_PREFIX`,
  `vars.PROD_*_ALLOW_UNAUTHENTICATED` (per runbook lines 38–47)
- `secrets.PROD_WIF_PROVIDER`, `secrets.PROD_WIF_SERVICE_ACCOUNT`
  (per runbook lines 54–57)
- GCP wiring: WIF pool/provider, runtime SA distinct from deployer
  SA, Cloud SQL instance, Artifact Registry repo, Secret Manager
  hard-fail entries (per runbook lines 59–98)
- GitHub Environment `production` with required reviewer rule (per
  directive §3.9.5 and `PROD-RAIL-CLOSEOUT-EVIDENCE.md` §7)
- a `prod/v<YYYY.MM.DD>.<N>` tag produced by `hourly-promote.yml`
  (per directive §3.9.4 and `PROD-RAIL-CLOSEOUT-EVIDENCE.md` §7)

The artifact must either (a) point at these requirements as
external-gated dependencies, (b) explicitly scope-cut a subset, or
(c) escalate any unresolved planning choice (e.g., tenant scope of
first deploy) to a named upstream owner.

### C. Grandparent `next` update is concrete and machine-actionable `[REQUIRED]`

Per the parent's `acceptance` line "Update the parent task with the
concrete unblocked next step", the parent artifact must update
`ai-status.json -> WF-PROD-001-LIVE-EXEC.next` so that the next field:

- names the exact command needed for the next progression
  (e.g., `gh workflow run deploy-prod.yml -f tag=prod/v<YYYY.MM.DD>.<N>`
  for the live-execution path)
- names the exact configuration set the operator must complete
  before that command is meaningful
- references the planning-decision artifact path so future supervisor
  cycles can resolve the decision rationale
- preserves the `HELD` / `blocked` semantics if the resource gate is
  not yet cleared

At packet write the grandparent's `next` already reflects this
shape; the parent should validate it is still accurate after writing
the planning-decision artifact and either confirm or refine.

### D. Sidecar / canonical scope discipline `[REQUIRED]`

The parent's planning-decision artifact is allowed to mutate
canonical state (per `mutates_canonical=true`). However, the
allowable mutation surface is narrow:

- create / update
  `support/unblock/WF-PROD-001-LIVE-EXEC/WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION.md`
  (the parent's own artifact)
- update `ai-status.json -> WF-PROD-001-LIVE-EXEC.next` (the
  grandparent `next` field, per acceptance line)
- update `ai-status.json -> WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION`
  lifecycle fields via `scripts/ai-status.sh`

The parent must not, in the same task:

- modify `.github/workflows/deploy-prod.yml`,
  `tests/e2e/E2E-009-prod-rail-dry-run.sh`, or any rail
  implementation file
- modify the prod-deploy-rollback runbook or the workflow-acceptance
  gate matrix or the wave-planning runbook (those are canonical
  truth owned by other tasks; the parent unblock is a routing /
  decision task, not a re-spec task)
- modify the directive archive
  (`docs/00-context/phase1-design-blueprint-completion-directive-20260519.md`)
- modify `ai-status.json -> PROD-SPEC-001` or
  `ai-status.json -> PROD-DRILL-001` (those rows belong to their
  respective owners)
- change the grandparent's `owner` / `reviewer` / `status` /
  `depends_on` / `artifacts` (only `next` is in scope)

### E. Recorded acceptance commands `[REQUIRED]`

Per the parent's `acceptance` field and the AI collaboration guide
§0.5 machine-truth discipline:

1. The parent owner must use `scripts/ai-status.sh` (or
   `python3 scripts/ai_status.py`) for every state change on
   `WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION` and for any
   `next`-field update on `WF-PROD-001-LIVE-EXEC`.
2. The parent owner must produce a task-scoped commit on a
   `codex/wf-prod-001-live-exec-unblock-planning-decision`-style
   branch (or the supervisor-assigned branch) that includes the new
   `support/unblock/...` artifact.
3. The commit subject must include the parent task id
   `WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION`.
4. The commit body must include trailers:
   - `LLM-Agent: Codex` (the live parent owner at packet write;
     must reflect live owner at finalize time)
   - `Task-ID: WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION`
   - `Reviewer: Codex2` (the live parent reviewer at packet write;
     must reflect live reviewer at finalize time)
5. The parent owner must push the task-scoped branch with a normal
   non-force push and record `PUSH_REMOTE` and `PUSH_BRANCH` at
   `done` time.
6. The parent reviewer must record `REVIEW_NOTES_ZH` on approve
   capturing the classification (A/B/C) and the citation set used to
   justify it.

### F. Citation discipline `[REQUIRED]`

Per `AI_COLLABORATION_GUIDE.md` §2 conflict precedence and Phase C
"cited cross-review" discipline, every objection or refinement in
the planning-decision artifact must cite file + section. The artifact
must not invent new product semantics; it may only synthesize across:

- L1 / L2 product truth (`phase1_*` family)
- the Phase 1 v3 wave-planning runbook
- the design-blueprint completion directive
- the prod-deploy-rollback runbook
- the workflow-acceptance gate matrix
- the existing rail closeout evidence packet

If the artifact uncovers an unresolved product-semantic conflict
(e.g., the directive §3.9 acceptance bar differs from the wave §5
HELD reason in a material way), it must mark the conflict
`human_required` per the workflow's escalation rule, not silently
average them.

### G. Non-claim discipline `[REQUIRED]`

The parent artifact must record explicit non-claims to prevent
machine-truth drift:

- The artifact does **not** complete `WF-PROD-001-LIVE-EXEC` (no
  live deploy occurred, no live evidence packet was produced).
- The artifact does **not** modify the rail's gate read
  `PASS (dry-run contract evidence)`; that gate read was earned by
  `PROD-RAIL-CLOSEOUT-20260519` and remains the live state.
- The artifact does **not** promise a deadline for external
  resource arrival.
- The artifact does **not** alter `PROD-SPEC-001` /
  `PROD-DRILL-001` state.

### H. Commit evidence at parent finalize `[REQUIRED]`

Per `AI_COLLABORATION_GUIDE.md` §5 commit-evidence rule for tasks
with `mutates_canonical=true`, the parent owner's finalize must
record:

- a local task-scoped commit whose subject includes
  `WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION`
- the three required trailers (per §4.E above)
- a normal non-force push, with `PUSH_REMOTE` and `PUSH_BRANCH`
  recorded on the parent row at `done` time
- the commit must resolve locally in the canonical repo at
  finalize time

The sidecar (this packet) uses `NO_COMMIT_REQUIRED=1` at its own
`done` because it is a sidecar acceptance packet (per §5 "sidecar or
explicit non-canonical closeout tasks" rule).

---

## 5. Reviewer Evidence Anchors

For the sidecar review (`Codex` reviewing this packet), the primary
audit surfaces are:

- **Packet scope vs. parent scope**:
  `support/sidecars/WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION/WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION-SIDECAR-ACCEPTANCE.md`
  (this file) vs.
  `ai-status.json -> WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION.acceptance`
  and the parent artifact target
  `support/unblock/WF-PROD-001-LIVE-EXEC/WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION.md`.
- **Dependency map accuracy**:
  `ai-status.json -> WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION.depends_on`
  vs. §3 of this packet, plus the live status of `PROD-SPEC-001` and
  `PROD-DRILL-001` in `ai-status.json` at audit time.
- **Grandparent context accuracy**:
  `ai-status.json -> WF-PROD-001-LIVE-EXEC` (status / owner /
  reviewer / `waiting_for` / `next`) vs. §2 grandparent block of
  this packet.
- **Source citation resolution**:
  - `docs/03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md`
    lines 37, 74, 79, 98–99, 130–142, 152–153, 176
  - `docs/00-context/phase1-design-blueprint-completion-directive-20260519.md`
    §3.9 (lines 560–612), §4 task table (line 655), §5 completion
    standard (line 672)
  - `docs/03-runbooks/prod-deploy-rollback-runbook-20260519.md`
    lines 25–105 (config / GCP wiring / Secret Manager)
  - `support/sidecars/PROD-RAIL-CLOSEOUT-20260519/PROD-RAIL-CLOSEOUT-EVIDENCE.md`
    §4 non-claims, §5 gate matrix update, §7 operator next steps
- **Out-of-scope cross-check**: the parent-write-scope files
  enumerated in §1 are not edited by this packet (verify via
  `git diff --name-only origin/dev...HEAD` shows only this packet
  file plus the ai-status / activity-log machinery).
- **Same-lane handoff configuration**: at packet write the sidecar
  reviewer (`Codex`) is the same lane as the parent owner (`Codex`).
  Reviewer audits packet-only; the parent artifact is reviewed by
  `Codex2`.

For the parent review (`Codex2` reviewing the eventual
`WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION` artifact — out of
scope for this sidecar but recorded here so the parent reviewer can
reuse the anchors):

- Acceptance §4.A–§4.G against the parent artifact body.
- Commit trailers per §4.E + §4.H.
- The scope-discipline rule per §4.D (no out-of-bounds writes).
- The grandparent `next`-field update per §4.C.
- The non-claim discipline per §4.G.

---

## 6. Sidecar Acceptance Checklist

Per the sidecar's own `acceptance` field on `ai-status.json`:

- [x] **Create support artifacts only** — this packet is the only
      artifact created by the sidecar; the parent-write-scope files
      enumerated in §1 (parent artifact path, ai-status canonical
      rows other than this sidecar's lifecycle, runbooks, gate
      matrix, workflow yaml, E2E scripts, directive) are not edited.
- [x] **Do not edit canonical truth** — no L1 / L2 product truth
      files (`phase1_*`, contracts bundle, runbooks, gate matrix,
      directive, wave-planning runbook) are edited; only the new
      sidecar artifact under
      `support/sidecars/WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION/`
      is written.
- [x] **Hand off the packet to the assigned reviewer** — the
      sidecar owner (`Claude2`) hands off to the sidecar reviewer
      (`Codex`) via the `handoff` command in §7 below.

Live cycle state for this sidecar (read from
`ai-status.json -> WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION-SIDECAR-ACCEPTANCE.status`,
not from this packet) advances as:

- `backlog` → `in_progress` (sidecar owner start) →
  `review` (sidecar owner handoff to `Codex`) →
  `review_approved` (sidecar reviewer approve) →
  `done` (sidecar owner closeout with `NO_COMMIT_REQUIRED=1`).

---

## 7. Reviewer Handoff Commands

After the sidecar owner writes this packet and runs the handoff,
the sidecar reviewer (`Codex`) can audit with:

```bash
# Open the packet
sed -n '1,80p' support/sidecars/WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION/WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION-SIDECAR-ACCEPTANCE.md

# Confirm sidecar + parent + grandparent machine truth anchors
python3 - <<'PY'
import json
d = json.load(open('ai-status.json'))
target = {
    'WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION-SIDECAR-ACCEPTANCE',
    'WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION',
    'WF-PROD-001-LIVE-EXEC',
    'PROD-SPEC-001',
    'PROD-DRILL-001',
}
for t in d['tasks']:
    if t['id'] in target:
        print(t['id'], t.get('status'),
              'owner=', t.get('owner'),
              'reviewer=', t.get('reviewer'),
              'waiting_for=', t.get('waiting_for'),
              'last_update=', t.get('last_update'))
PY

# Confirm planning-ref + directive citations resolve
sed -n '30,45p' docs/03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md
sed -n '130,145p' docs/03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md
sed -n '172,180p' docs/03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md
sed -n '560,615p' docs/00-context/phase1-design-blueprint-completion-directive-20260519.md

# Confirm runbook config surfaces resolve
sed -n '25,105p' docs/03-runbooks/prod-deploy-rollback-runbook-20260519.md

# Confirm rail-closeout evidence is intact and unchanged
sed -n '1,30p' support/sidecars/PROD-RAIL-CLOSEOUT-20260519/PROD-RAIL-CLOSEOUT-EVIDENCE.md
```

Approval command (sidecar reviewer, after audit passes):

```bash
AI_NAME=Codex REVIEW_NOTES_ZH="WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION sidecar acceptance packet 內容核對通過||scope boundary、dependency map (PROD-SPEC-001 / PROD-DRILL-001)、grandparent (WF-PROD-001-LIVE-EXEC blocked) 狀態、acceptance checklist (A/B/C/D/E/F/G/H)、reviewer evidence anchors 皆對齊 ai-status.json + wave-planning runbook + directive + prod-deploy-rollback runbook + PROD-RAIL-CLOSEOUT 證據" \
  scripts/ai-status.sh approve WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION-SIDECAR-ACCEPTANCE \
  "Sidecar acceptance packet reviewed; support-only scope and dependency map align with machine truth"
```

Reopen command (sidecar reviewer, if audit fails):

```bash
AI_NAME=Codex scripts/ai-status.sh reopen WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION-SIDECAR-ACCEPTANCE \
  "<具體不通過原因 — 例如 dependency map 與 ai-status.json 不一致、grandparent 狀態誤標、acceptance 條目漏列、scope boundary 與 parent artifacts 衝突、citation 找不到對應 file:line>"
```

---

## 8. Closeout Note

This sidecar is a support-only acceptance packet; per
`AI_COLLABORATION_GUIDE.md` §5 sidecar rule, the sidecar's own
`done` may use `NO_COMMIT_REQUIRED=1`. The sidecar owner's
closeout after `review_approved`:

```bash
AI_NAME=Claude2 NO_COMMIT_REQUIRED=1 \
  scripts/ai-status.sh done WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION-SIDECAR-ACCEPTANCE \
  "Sidecar acceptance packet approved by Codex; closed without commit per sidecar rule"
```

The parent task
`WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION` continues on its
own cycle independent of this sidecar's closeout. The grandparent
`WF-PROD-001-LIVE-EXEC` stays `blocked` until the external GCP / WIF
/ Environment wiring lands, regardless of where the parent or this
sidecar are in the lifecycle.
