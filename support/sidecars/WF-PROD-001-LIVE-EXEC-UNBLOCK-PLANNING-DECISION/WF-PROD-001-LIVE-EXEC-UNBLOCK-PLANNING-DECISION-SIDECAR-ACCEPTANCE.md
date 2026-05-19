# WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION` — Resolve planning blocker for `WF-PROD-001-LIVE-EXEC`
**Parent Owner:** `Codex` (per `ai-status.json -> WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION.owner` at packet write)
**Parent Reviewer:** `Codex2` (per `ai-status.json -> WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION.reviewer` at packet write)
**Sidecar Owner:** `Claude2`
**Sidecar Reviewer:** `Codex`
**Generated:** `2026-05-19` (UTC)
**Last refreshed against canonical machine truth:** `2026-05-19T20:46Z`
**Status:** `ACCEPTANCE SUPPORT ARTIFACT` — support-only; does not modify
canonical truth, the planning ref, runtime behavior, the parent's
machine-truth fields, or any L1/L2 product surface. For the live
machine-truth status of this sidecar row, read
`ai-status.json -> WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION-SIDECAR-ACCEPTANCE.status`
directly; this packet does not snapshot it.

This packet is the acceptance map for parent
`WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION`. At the first
handoff attempt the parent was still in flight; the sidecar reviewer
flagged that §2 / §3 anchors had drifted from canonical truth. This
refresh re-aligns the packet against
`/home/edna/workspace/drts-fleet-platform/ai-status.json` at
`2026-05-19T20:46Z`, at which point the parent has already finalized
`done` (commit `025b1dd`, pushed to
`origin/codex/wf-prod-001-live-exec-unblock-planning-decision`) and
the parent reviewer (`Codex2`) has recorded the routing rationale —
the classification chosen was **A. External-gated** (see §4.A and the
parent artifact at
`support/unblock/WF-PROD-001-LIVE-EXEC/WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION.md`).
The grandparent `WF-PROD-001-LIVE-EXEC` has transitioned from
`blocked` to `todo` with a concrete operator `next` pointing at the
prod-deploy runbook. Each acceptance gate in §4 is therefore now a
**retrospective audit property** the sidecar reviewer can verify
against the already-merged parent artifact; the sidecar reviewer
(`Codex`) is the same lane as the parent owner (`Codex`) but the
sidecar review only audits packet accuracy and does **not** re-approve
the parent planning-decision artifact — `Codex2` has already approved
it on the parent row. This packet does not pre-approve or alter the
parent artifact and does not transition the grandparent further.

### Packet refresh history

- `2026-05-19T20:46Z` — refresh #1 by `Claude2`. Reviewer (`Codex`)
  reopened the first handoff because §2 / §3 anchors were stale
  against canonical machine truth (parent had already moved to
  `review` at `2026-05-19T20:34:47Z`; grandparent had a newer note at
  `2026-05-19T20:37:57Z`; `PROD-SPEC-001` was already `done` at
  `2026-05-19T17:19:57Z`; `PROD-DRILL-001` was already `done` at
  `2026-05-19T19:58:14Z`). Refresh re-reads
  `/home/edna/workspace/drts-fleet-platform/ai-status.json` and the
  parent commit `025b1dd` on
  `origin/codex/wf-prod-001-live-exec-unblock-planning-decision`,
  rewrites §2 / §3 / §4 framing accordingly, and re-hands off to
  `Codex`.

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
- On any subsequent refresh (e.g., refresh #1 at
  `2026-05-19T20:46Z`), re-read canonical machine truth and update
  §2 / §3 / §4 outcome lines accordingly without modifying any
  out-of-scope file.

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
- transitioning the grandparent `WF-PROD-001-LIVE-EXEC` to a
  live-execution complete state — i.e., to `done` or to
  `in_progress` for the live deploy itself. (The parent unblock task
  legitimately flipped the grandparent from `blocked` to `todo` as
  part of recording "no further planning decision needed" — see §2
  grandparent block. The remaining transitions still require the
  external GCP/WIF/Environment wiring the wave-planning runbook §HELD
  calls out plus a live-execution evidence packet, and remain out of
  scope for both the sidecar and the parent unblock task.)

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
- status at refresh time: `done`
  (`last_update=2026-05-19T20:41:33Z`). The parent has finalized; its
  `review_notes_zh` confirm canonical planning artifacts already
  classify `WF-PROD-001-LIVE-EXEC` as `HELD-external`, not pending
  product/contract, and `Codex2` accepted the `waiting_for=Gemini2`
  machine-truth limitation. Each gate in §4 is therefore now a
  retrospective audit property; the sidecar review verifies the
  parent artifact at commit `025b1dd` satisfies them.
  - For the live cycle position of the parent, read
    `ai-status.json -> WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION.status`
    directly; this packet does not snapshot transient parent status.
- depends_on: `PROD-SPEC-001`, `PROD-DRILL-001` (both `done` at
  refresh time — see §3)
- artifacts:
  `support/unblock/WF-PROD-001-LIVE-EXEC/WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION.md`
  (created on branch
  `codex/wf-prod-001-live-exec-unblock-planning-decision`, first
  appears at commit `057cddc`; closeout evidence recorded at commit
  `025b1dd`)
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
- mutates_canonical=`true` (parent diff IS a canonical change; the
  parent's artifact creation under `support/unblock/...` plus the
  grandparent `next` update are the in-scope canonical writes — both
  are now landed)
- auto_created_by=`chairman-blocked-task-triage`
- closeout evidence recorded on parent row at refresh time:
  - `commit_hash=025b1dd3cea63ed41d6814f9be0f2424c92a5d72`
  - `commit_subject=WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION: closeout evidence`
  - `commit_agent=Codex`, `commit_reviewer=Codex2`
  - `commit_recorded_at=2026-05-19T20:41:33Z`
  - `push_remote=origin`
  - `push_branch=codex/wf-prod-001-live-exec-unblock-planning-decision`
  - `push_ref=origin/codex/wf-prod-001-live-exec-unblock-planning-decision`
  - `push_commit=025b1dd3cea63ed41d6814f9be0f2424c92a5d72`
  - `push_recorded_at=2026-05-19T20:41:33Z`
  - `resolved_parent_status=todo` (the grandparent transitioned out
    of `blocked` into `todo`, with `next` carrying the operator
    runbook instruction)
- review_notes_zh recorded on parent row at refresh time:
  > 確認 canon 已將 WF-PROD-001-LIVE-EXEC 分類為 HELD-external，非待決
  > product/contract 問題；parent next 已改成可執行的 operator runbook
  > 步驟。|接受 owner 說明中的 machine-truth 限制：waiting_for 仍為
  > Gemini2，因 ai-status waiting_for 目前只接受 agent 身分。

This packet treats `ai-status.json` as authoritative for owner /
reviewer. The parent commit trailer recorded `LLM-Agent: Codex` and
`Reviewer: Codex2`, matching the live owner/reviewer at finalize
time per §4.E. The sidecar reviewer (`Codex`) is the same lane as
the parent owner (`Codex`) — the supervisor's standard sidecar
pairing; the sidecar review audits packet accuracy only and does
**not** re-approve the parent artifact (`Codex2` already approved
that on the parent row).

### Grandparent — `ai-status.json -> WF-PROD-001-LIVE-EXEC`

- id=`WF-PROD-001-LIVE-EXEC`
- title=`Production deploy live execution (HELD)`
- summary_zh=`第一次真 prod deploy。HOLD pending PROD_* GCP project +
  WIF + Secret Manager + Artifact Registry + GitHub Environment
  'production' reviewer rule.`
- owner=`Gemini`, reviewer=`Gemini2`
- status at refresh time: `todo` (transitioned out of `blocked` by the
  parent unblock task), `last_update=2026-05-19T20:41:33Z`
  - At first packet write the grandparent was `blocked`
    (`waiting_for=Gemini2`, `last_update=2026-05-19T20:33:02Z`); the
    parent owner's closeout flipped it to `todo` with the operator
    `next` text below. The grandparent's executable state is still
    external-gated — `todo` here means "no further planning decision
    needed", not "ready for live deploy".
- depends_on: `PROD-SPEC-001`, `PROD-DRILL-001` (both `done` at
  refresh time)
- artifacts:
  `support/sidecars/PROD-LIVE-EXEC-20260519/PROD-LIVE-EXEC-EVIDENCE.md`
  (still not present at refresh time — the forward-looking
  live-execution evidence packet target; live evidence will not exist
  until the first real `gh workflow run deploy-prod.yml` completes,
  which remains externally gated)
- `next` field at refresh time records the unblock-resolution outcome:
  > `Unblock resolution complete via
  > WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION: Closeout complete.
  > Commit 025b1dd records verification evidence, push to
  > origin/codex/wf-prod-001-live-exec-unblock-planning-decision
  > succeeded, and parent WF-PROD-001-LIVE-EXEC remains correctly
  > routed as external-gated with the concrete prod runbook + gh
  > workflow run next step.`
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
176: `WF-PROD-001-LIVE-EXEC once GCP prod configured`). The grandparent
will only reach `done` once the external GCP/WIF/Environment wiring
lands and a live-execution evidence packet is attached — neither in
scope for the sidecar nor the parent unblock task.

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

| Upstream         | Live status at refresh time                                              | Lane owner / reviewer              | Why it matters for the parent unblock task                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------- | ------------------------------------------------------------------------ | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PROD-SPEC-001`  | `done` (`last_update=2026-05-19T17:19:57Z`)                              | owner=`Codex2`, reviewer=`Claude`  | Production deploy rail formal spec. Artifact `docs/03-runbooks/production-deploy-rail-spec-20260519.md`. The parent's planning-decision artifact cites the wave-planning runbook, the gate matrix, the rail closeout evidence, and the prod-deploy-rollback runbook (which references the spec surface) — it does not need a separate inline citation to `production-deploy-rail-spec-20260519.md` because the spec is consumed transitively. Closeout `next`: "Owner finalized review_approved closeout. Approved production deploy rail spec is committed and pushed on `codex2/prod-spec-001`; closeout commit records required trailers and verification evidence."                                                                                                                                                                                                                       |
| `PROD-DRILL-001` | `done` (`last_update=2026-05-19T19:58:14Z`)                              | owner=`Codex`, reviewer=`Claude2`  | Production rollback drill protocol. Artifact `docs/03-runbooks/production-rollback-drill-20260519.md`. The parent's planning-decision artifact treats drill ordering as part of the operator runbook's responsibility (per §4 of the parent artifact) rather than as a planning decision the parent must answer; this is consistent with the canonical wave-planning classification of `WF-PROD-001-LIVE-EXEC` as `HELD-external`. Closeout `next`: "Closeout commit pushed for approved production rollback drill runbook; branch remains scoped to `docs/03-runbooks/production-rollback-drill-20260519.md`."                                                                                                                                                                                                                                                                              |

Both upstream dependencies were already `done` before the parent
unblock task finalized, so the parent did not need to defer or
escalate on either. The parent treated them as **advisory inputs**,
not blockers, because the wave-planning runbook §5 explicitly
classifies the grandparent `WF-PROD-001-LIVE-EXEC` as external-gated.
The planning-decision artifact's central question was not "are the
docs done?" but "is the live-execution blocker a planning-shape
problem or a resource-shape problem?" — and the answer recorded is
resource-shape (external-gated).

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

| Downstream                            | Status at refresh time | Depends on parent unblock because                                                                                                                                                                                                                                                                                                                                                                                                                                              | Outcome recorded                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WF-PROD-001-LIVE-EXEC` (grandparent) | `todo`                 | The grandparent's `next` field had to be updated to either (a) confirm external-gated with concrete operator steps, (b) record a scope cut, or (c) define the planning follow-up. If the parent had misclassified, the chairman triage loop would re-spawn an unblock task and the grandparent would have stayed `blocked` indefinitely.                                                                                                                                          | Parent chose **(a) confirm external-gated**. Grandparent now reads `todo` with a `next` carrying the concrete operator instruction (complete prod-deploy-rollback runbook GitHub/GCP wiring, then `gh workflow run deploy-prod.yml -f tag=prod/v<YYYY.MM.DD>.<N>`, then attach live-execution evidence and re-open `WF-PROD-001-LIVE-EXEC` for closeout). The grandparent's executable state remains externally gated until that wiring lands — `todo` reflects "no further planning decision needed", not "ready to deploy". |

### Ordering guidance vs. formal blockers

The parent unblock task was **not** formally blocked on
`PROD-SPEC-001` or `PROD-DRILL-001` reaching `done`. Both were
already `done` by the time the parent took the row, so the
"defer with a `next` pointing at the missing upstream item" branch
was not exercised. The parent followed branch (1) — resolved the
decision and recorded it as external-gated. This packet does not
redefine the formal blocker set; it records that the parent reviewer
(`Codex2`) applied the ordering guidance correctly.

---

## 4. Acceptance Checklist (for the parent's planning-decision artifact)

Each item below is the property the parent's planning-decision
artifact had to satisfy. At refresh time the parent has finalized
`done` and the sidecar review uses this checklist as the **audit map**
against the merged parent artifact at commit `025b1dd` — the sidecar
review does not re-verify product semantics or re-approve the parent.
For each gate, the parent artifact section that satisfies it is noted
in italics. The sidecar reviewer can confirm each gate by reading the
referenced parent-artifact section against canonical sources; the
parent reviewer (`Codex2`) has already approved the artifact on the
parent row, with `review_notes_zh` captured in §2 above.

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

_Parent outcome_: classification **A. External-gated** chosen and
justified inline. Parent artifact §1 ("Decision") and §3 ("Why This
Is Not A Product/Contract Blocker") record the classification; §2
("Evidence") cites the wave-planning runbook (§4, §5, §7, §8), the
workflow-acceptance gate matrix row `WF-PROD-001`, the rail-closeout
evidence (§1, §4, §7), the prod-deploy-rollback runbook, and
`PHASE1_OPEN_QUESTIONS.md` / `PHASE1_DECISION_LEDGER.md` (confirmed
no product-decision row targets `WF-PROD-001`).

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

_Parent outcome_: branch (a). Parent artifact §4 ("Parent Task Next
Step") names the operator path concretely (complete the
"Required GitHub Configuration" and "Required GCP Wiring" sections in
`docs/03-runbooks/prod-deploy-rollback-runbook-20260519.md`, then run
`gh workflow run deploy-prod.yml -f tag=prod/v<YYYY.MM.DD>.<N>`, then
attach live-execution evidence and re-open `WF-PROD-001-LIVE-EXEC`
for closeout). The artifact delegates the full enumerated config
surface (vars, secrets, GCP wiring, Environment reviewer rule, tag
shape) to the runbook by reference rather than re-listing it, which
preserves single-source-of-truth discipline.

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

At packet write the grandparent's `next` already reflected this
shape; the parent had to validate it remained accurate after writing
the planning-decision artifact and either confirm or refine.

_Parent outcome_: confirmed. The grandparent's `next` at refresh time
reads "Unblock resolution complete via
WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION: Closeout complete.
Commit 025b1dd records verification evidence, push to
origin/codex/wf-prod-001-live-exec-unblock-planning-decision
succeeded, and parent WF-PROD-001-LIVE-EXEC remains correctly routed
as external-gated with the concrete prod runbook + gh workflow run
next step." — names the artifact path, the commit, the push branch,
and the runbook + command shape, and preserves the external-gated
semantics. The grandparent moved from `blocked` to `todo` (not to
`done` or to `in_progress`) because the unblock is a routing decision,
not a live-execution.

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

_Parent outcome_: the parent commits `057cddc` (routing artifact) and
`025b1dd` (closeout evidence) only modify
`support/unblock/WF-PROD-001-LIVE-EXEC/WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION.md`
and the `ai-status` machinery for the parent + grandparent rows; no
rail-implementation file, runbook, gate-matrix, directive, or
upstream-row write occurred. Sidecar reviewer can confirm via
`git show --stat 057cddc 025b1dd`. The grandparent transitioned from
`blocked` → `todo` (status field touched in addition to `next`); per
`ai-status` workflow the unblock-task's `resolved_parent_status`
field captures this, so the parent is allowed to drive that
transition as part of the unblock closeout.

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

_Parent outcome_: all six conditions satisfied. The parent row at
refresh time records `commit_hash=025b1dd…`, `commit_subject` with
the parent task id, `commit_agent=Codex`, `commit_reviewer=Codex2`,
`push_remote=origin`,
`push_branch=codex/wf-prod-001-live-exec-unblock-planning-decision`,
and `review_notes_zh` capturing the HELD-external classification and
the `waiting_for=Gemini2` machine-truth caveat (see §2 parent block
for the verbatim text). The commit body trailers (verified via
`git show 025b1dd`) read `LLM-Agent: Codex`,
`Task-ID: WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION`, and
`Reviewer: Codex2`.

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

_Parent outcome_: no conflict surfaced. The parent artifact §2
evidence table cites each canonical source by name (wave-planning
runbook §4/§5/§7/§8, gate matrix `WF-PROD-001` row, rail-closeout
evidence §1/§4/§7, prod-deploy-rollback runbook,
`PHASE1_OPEN_QUESTIONS.md`, `PHASE1_DECISION_LEDGER.md`); no
`human_required` escalation was needed.

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

_Parent outcome_: parent artifact §5 ("Machine-Truth Note") records
the `waiting_for=Gemini2` machine-truth caveat (the `ai-status`
helper only accepts agent identities); §1, §3, §4 keep scope on
routing-only; the artifact never claims a live deploy, never modifies
the gate read, never sets an external-resource deadline, and never
touches `PROD-SPEC-001` / `PROD-DRILL-001` rows. The grandparent's
gate matrix entry remains `PASS (dry-run contract evidence)` — not
upgraded by this branch.

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

_Parent outcome_: per §2 parent block, all commit-evidence fields are
recorded on the parent row at refresh time
(`commit_hash`/`commit_subject`/`commit_agent`/`commit_reviewer`/`commit_recorded_at`/`push_remote`/`push_branch`/`push_ref`/`push_commit`/`push_recorded_at`).
Trailer values verified via `git show 025b1dd`.

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
  `git diff --name-only origin/dev...HEAD` on the sidecar branch —
  only this packet file plus the ai-status / activity-log machinery
  should appear).
- **Parent artifact audit (advisory, not gating)**: the sidecar
  review may cross-check the §4 _Parent outcome_ italic lines
  against the merged parent artifact at commit `025b1dd`:
  `git show 025b1dd:support/unblock/WF-PROD-001-LIVE-EXEC/WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION.md`.
  This is informational — the parent artifact has already been
  approved by `Codex2`; the sidecar review is not a second approval.
- **Same-lane handoff configuration**: at packet refresh time the
  sidecar reviewer (`Codex`) is the same lane as the parent owner
  (`Codex`). Reviewer audits packet-only; the parent artifact is
  reviewed by `Codex2`.

For the parent review (`Codex2` reviewing the
`WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION` artifact — already
completed at refresh time; anchors retained here for trace and for
any future re-open):

- Acceptance §4.A–§4.G against the parent artifact body.
- Commit trailers per §4.E + §4.H.
- The scope-discipline rule per §4.D (no out-of-bounds writes).
- The grandparent `next`-field update per §4.C.
- The non-claim discipline per §4.G.

---

## 6. Sidecar Acceptance Checklist

Per the sidecar's own `acceptance` field on `ai-status.json`:

- [x] **Create support artifacts only** — this packet is the only
      artifact created or modified by the sidecar (refresh #1 edits
      only this file); the parent-write-scope files enumerated in §1
      (parent artifact path, ai-status canonical rows other than
      this sidecar's lifecycle, runbooks, gate matrix, workflow yaml,
      E2E scripts, directive) are not edited.
- [x] **Do not edit canonical truth** — no L1 / L2 product truth
      files (`phase1_*`, contracts bundle, runbooks, gate matrix,
      directive, wave-planning runbook) are edited; only the new
      sidecar artifact under
      `support/sidecars/WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION/`
      is written. The refresh likewise modifies only that file.
- [x] **Hand off the packet to the assigned reviewer** — the
      sidecar owner (`Claude2`) re-hands off to the sidecar reviewer
      (`Codex`) via the `handoff` command in §7 below after writing
      the refresh.

Live cycle state for this sidecar (read from
`ai-status.json -> WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION-SIDECAR-ACCEPTANCE.status`,
not from this packet) advances as:

- `backlog` → `in_progress` (sidecar owner start) →
  `review` (sidecar owner handoff to `Codex`) →
  [`review` → `in_progress` if reviewer reopens, then loop back
  through `review` after refresh] →
  `review_approved` (sidecar reviewer approve) →
  `done` (sidecar owner closeout with `NO_COMMIT_REQUIRED=1`).

Refresh #1 at `2026-05-19T20:46Z` exercises the reopen-then-refresh
loop: the reviewer reopened the first handoff because the packet
anchors were stale, the owner re-ran `start` → refreshed §2/§3/§4 →
re-handed off via `progress`/`handoff`.

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

Approval command (sidecar reviewer, after refresh #1 audit passes):

```bash
AI_NAME=Codex REVIEW_NOTES_ZH="WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION sidecar acceptance packet (refresh #1) 內容核對通過||scope boundary、dependency map (PROD-SPEC-001 / PROD-DRILL-001 皆 done)、grandparent (WF-PROD-001-LIVE-EXEC 已由 blocked 進入 todo, next 已記錄 operator runbook + gh workflow run 指令)、acceptance checklist (A/B/C/D/E/F/G/H, 父 artifact 已 finalize 為 External-gated, 對應 §4 _Parent outcome_ 條目)、reviewer evidence anchors 皆對齊 ai-status.json + wave-planning runbook + directive + prod-deploy-rollback runbook + PROD-RAIL-CLOSEOUT 證據 + 父 commit 025b1dd" \
  scripts/ai-status.sh approve WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION-SIDECAR-ACCEPTANCE \
  "Sidecar acceptance packet refresh #1 reviewed; support-only scope and refreshed dependency/grandparent/parent-outcome map align with machine truth at 2026-05-19T20:46Z"
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
