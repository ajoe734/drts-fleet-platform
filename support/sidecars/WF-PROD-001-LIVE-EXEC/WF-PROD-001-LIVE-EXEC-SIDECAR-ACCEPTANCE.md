# WF-PROD-001-LIVE-EXEC Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `WF-PROD-001-LIVE-EXEC`  
**Current Sidecar Owner:** `Codex`  
**Assigned Sidecar Reviewer:** `Gemini`  
**Parent Owner At Snapshot:** `Gemini`  
**Parent Reviewer At Snapshot:** `Codex`  
**Last Revised:** `2026-05-19 (UTC)`  
**Status:** `IN-PROGRESS SUPPORT ARTIFACT - reviewer-ready acceptance framing for the first real production deploy/rollback execution while canonical workflow-family truth remains external-gated.`

---

## 1) Scope Boundary

本 sidecar 只整理 `WF-PROD-001-LIVE-EXEC` 的 acceptance checklist、dependency map、evidence expectations、以及 reviewer / owner handoff 指引。

- **In scope:** support-only acceptance framing, machine-truth snapshot, formal dependency state, external prerequisite checklist, live-exec evidence inventory, reviewer hotspot map.
- **Out of scope:** 修改 L1 canonical truth、改寫主線 gate verdict、變更 runtime / registry / workflow / GCP wiring、或替 parent task 執行真實 production deploy。

---

## 2) Machine-Truth Snapshot

Shared truth at packet draft time comes from `ai-status.json`, `current-work.md`, `ai-activity-log.jsonl`, and the already-recorded dependency closeouts.

### Parent `WF-PROD-001-LIVE-EXEC`

- title=`Production deploy live execution (HELD)`
- owner=`Gemini`
- reviewer=`Codex`
- status=`todo`
- depends_on=`["PROD-SPEC-001","PROD-DRILL-001"]`
- artifact target=`support/sidecars/PROD-LIVE-EXEC-20260519/PROD-LIVE-EXEC-EVIDENCE.md`
- last_update=`2026-05-19T20:50:08Z`

### Parent posture that must be preserved

- The parent is no longer blocked by missing repo-side documentation. Both formal dependencies are now `done`.
- The completed unblock child `WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION` resolved that this is an **external-gated operator task**, not a missing product/contract decision.
- The parent still carries `(HELD)` in title/summary language even though the control-plane status is currently `todo`. The practical meaning is unchanged: the next real step is outside repo-only closure.

### Sidecar `WF-PROD-001-LIVE-EXEC-SIDECAR-ACCEPTANCE`

- owner=`Codex`
- reviewer=`Gemini`
- status=`in_progress`
- helper kind=`acceptance_packet`
- support artifact path=`support/sidecars/WF-PROD-001-LIVE-EXEC/WF-PROD-001-LIVE-EXEC-SIDECAR-ACCEPTANCE.md`
- `mutates_canonical=false`

### Important shared-truth note

`PROD-SPEC-001` and `PROD-DRILL-001` are machine-truth `done`, with recorded commit/push metadata, but their artifact paths are not present in this up-to-date `origin/dev` worktree at packet draft time. Treat their closeout metadata as authoritative for dependency state, and treat trunk absorption of those docs as a separate repo-integration concern rather than as a blocker invented by this sidecar.

---

## 3) Dependency Map

### Formal machine dependencies

| Dependency | Shared-truth status | Closeout evidence | Why it matters to `WF-PROD-001-LIVE-EXEC` |
| --- | --- | --- | --- |
| `PROD-SPEC-001` | `done` | commit `c289d6f`, push `origin/codex2/prod-spec-001` | Freezes the production rail contract: manual `prod/v*` deploy, required GitHub/GCP controls, deploy graph, rollback relationship, non-claims, and the rule that live prod evidence remains external-gated until a real run succeeds. |
| `PROD-DRILL-001` | `done` | commit `fe6321a1085b3af489ae099158baa7e94be5352d`, push `origin/codex/prod-drill-001` | Freezes the qualifying rollback-drill protocol: tag pair selection, named roles, entry criteria, controlled deploy->verify->rollback->verify sequence, stop conditions, and required evidence template. |

### Resolved routing dependency

| Supporting task | Shared-truth status | Closeout evidence | Why it matters |
| --- | --- | --- | --- |
| `WF-PROD-001-LIVE-EXEC-UNBLOCK-PLANNING-DECISION` | `done` | commit `025b1dd3cea63ed41d6814f9be0f2424c92a5d72`, push `origin/codex/wf-prod-001-live-exec-unblock-planning-decision` | Confirms the parent is **HELD-external**, not blocked on a missing product/contract decision. The correct next step is operator completion of prod GitHub/GCP wiring plus the first real `gh workflow run deploy-prod.yml -f tag=prod/v<YYYY.MM.DD>.<N>`. |

### Existing in-repo anchors already available on this branch

| Anchor | Current state | Why it matters |
| --- | --- | --- |
| `docs/03-runbooks/prod-deploy-rollback-runbook-20260519.md` | present | Defines required GitHub configuration, required GCP wiring, normal deploy command, rollback command, and minimum evidence expectations for a real production run. |
| `support/sidecars/PROD-RAIL-CLOSEOUT-20260519/PROD-RAIL-CLOSEOUT-EVIDENCE.md` | present | Proves the rail is structurally complete at dry-run contract level, but explicitly does **not** claim live production execution. |
| `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` row `WF-PROD-001` | present | Shared gate read remains `PASS (dry-run contract evidence)` with explicit `EXTERNAL-GATED` non-claim for the first real prod execution. |

### Not-yet-produced parent evidence

| Expected parent artifact | Current state | Meaning |
| --- | --- | --- |
| `support/sidecars/PROD-LIVE-EXEC-20260519/PROD-LIVE-EXEC-EVIDENCE.md` | missing | Expected. No live prod execution has been run yet, so the live evidence packet does not exist. |

---

## 4) Parent Acceptance Expansion

The parent task has no explicit `acceptance` array in `ai-status.json`, so this packet expands the acceptance bar from the workflow-family contract, dependency docs, and unblock closeout.

### AC-1: Formal prerequisites are closed and accurately consumed

| Check | Current truth | Parent implication |
| --- | --- | --- |
| Production deploy rail spec exists and is closed | `PROD-SPEC-001` is `done` | The parent must consume the rail contract, not restate or reinterpret it. |
| Rollback drill protocol exists and is closed | `PROD-DRILL-001` is `done` | The parent must treat rollback evidence as a required companion to first live execution, not an optional follow-up memo. |
| No unresolved product/contract blocker remains | unblock child is `done` | The parent cannot justify delay as a semantic-doc gap; remaining blockers are operator/environmental. |

**PASS condition for parent:** the live-exec packet cites the closed dependency outputs and stays within their contract and non-claim boundaries.

### AC-2: External GitHub and GCP gates are actually satisfied before live execution

The live run must not proceed until the operator can prove all of the following are ready:

| Gate family | Required items |
| --- | --- |
| GitHub repo config | `PROD_GCP_PROJECT_ID`, `PROD_GCP_REGION`, `PROD_GCP_CLOUDSQL_INSTANCE`, `PROD_GCP_RUNTIME_SERVICE_ACCOUNT`, `PROD_PLATFORM_ADMIN_ORIGIN`, `PROD_OPS_CONSOLE_ORIGIN`, `PROD_CONTROL_PLANE_API_ORIGIN`, `PROD_IAP_CLIENT_ID`, `PROD_WIF_PROVIDER`, `PROD_WIF_SERVICE_ACCOUNT` |
| GitHub approval gate | Environment `production` exists and a human reviewer can approve the workflow run |
| GCP wiring | WIF path, separate runtime service account, Artifact Registry push path, Cloud SQL target, Secret Manager entries, Cloud Run/IAP rights or documented manual fallback |
| Tag readiness | At least one target `prod/vYYYY.MM.DD.N` tag exists on origin; rollback drill additionally needs a previous known-good prod tag |

**PASS condition for parent:** the evidence packet records that these gates were satisfied for the actual run, not only copied from the runbook.

### AC-3: The first real production deploy is reviewable end to end

| Required evidence | Why reviewer needs it |
| --- | --- |
| deployed `prod/v*` tag and resolved commit SHA | proves the run targeted an immutable promoted artifact |
| workflow run URL | gives direct review anchor for `validate-config -> build-push -> migrate -> deploy -> health-check` |
| migration mode (`ran` or `skip_migration=true`) | proves how DB risk was handled |
| protected health-check outcomes | proves the rail worked after deploy |
| production environment approver | proves the human gate really fired |
| resulting live evidence packet | gives a durable artifact for later gate updates |

**PASS condition for parent:** the evidence packet is concrete enough that a reviewer can validate what ran, what passed, and what remained external/manual.

### AC-4: Rollback evidence is captured under the formal drill protocol

The rollback companion must follow `PROD-DRILL-001`, including:

- named `drillCommander`, `rollbackOperator`, `dbOwner`, `envApprover`, and `scribe`
- `candidateTag` and `rollbackTag` plus resolved SHAs
- candidate deploy approval and workflow URL
- rollback redispatch with `skip_migration=true`
- protected health checks before deploy, after deploy, and after rollback
- explicit stop-condition / partial / failure notes if the drill did not complete cleanly

**PASS condition for parent:** the first qualifying rollback drill or real incident rollback is recorded with the runbook's evidence fields; repo-local rehearsal or static dry-run output does not count.

---

## 5) Reviewer-Usable Execution Checklist

This is the minimum checklist the parent owner should satisfy before asking for review on `WF-PROD-001-LIVE-EXEC`.

| Item | Required result |
| --- | --- |
| `PROD-SPEC-001` consumed | deploy rail scope, non-claims, and live gate conditions are cited correctly |
| `PROD-DRILL-001` consumed | rollback drill steps and evidence template are followed |
| external GitHub/GCP prerequisites satisfied | actual environment is ready, not merely documented |
| target `prod/v*` tag exists | immutable promoted tag is recorded |
| real `gh workflow run deploy-prod.yml ...` executed | workflow run URL and outcome captured |
| deploy health verification recorded | protected endpoints checked after deploy |
| rollback proof recorded | controlled drill or qualifying incident rollback evidence captured |
| live evidence packet filed | `support/sidecars/PROD-LIVE-EXEC-20260519/PROD-LIVE-EXEC-EVIDENCE.md` or equivalent durable path exists |
| gate language stays honest | result does not over-claim beyond the observed live run and rollback evidence |

---

## 6) Reviewer Hotspots For `Gemini`

`Gemini` reviewing this sidecar should focus on whether the packet is operationally usable for the eventual live execution lane.

1. Confirm the machine-truth snapshot is current: parent `WF-PROD-001-LIVE-EXEC` is `todo` with reviewer `Codex`, while the sidecar is owned by `Codex` and reviewed by `Gemini`.
2. Confirm both formal dependencies are treated as `done` and that the packet does not regress them to earlier `review` / `backlog` states.
3. Confirm the packet correctly treats the parent as **external-gated**, not blocked on missing product semantics.
4. Confirm the GitHub/GCP prerequisite list matches the current production runbook and gate row, including the `production` environment reviewer rule.
5. Confirm the packet explicitly calls out the trunk-absorption gap: dependency tasks are closed in machine truth, but their artifact paths are not yet present in this `origin/dev` worktree.
6. Confirm the reviewer-usable checklist demands actual workflow-run and rollback evidence rather than static dry-run proof.

---

## 7) Sidecar Acceptance Checklist

### AC-S1 - Support artifact only

- [x] Output is limited to `support/sidecars/WF-PROD-001-LIVE-EXEC/WF-PROD-001-LIVE-EXEC-SIDECAR-ACCEPTANCE.md`
- [x] No canonical truth files changed
- [x] No runtime, workflow, registry, or GCP implementation changed

### AC-S2 - Machine-truth aligned dependency map

- [x] Parent / sidecar ownership and status are captured from current machine truth
- [x] Formal dependencies remain exactly `PROD-SPEC-001`, `PROD-DRILL-001`
- [x] Dependency closeout commit/push evidence is recorded
- [x] The unblock child is included so reviewer sees why the parent is external-gated

### AC-S3 - Reviewer-ready acceptance framing

- [x] External prerequisite checklist is explicit
- [x] Expected live-exec and rollback evidence is explicit
- [x] Non-claim boundary is preserved: no packet language upgrades `WF-PROD-001` beyond current evidence

---

## 8) Handoff Commands

### Owner -> Reviewer (`Codex` -> `Gemini`)

```bash
AI_NAME=Codex python3 scripts/ai_status.py handoff WF-PROD-001-LIVE-EXEC-SIDECAR-ACCEPTANCE Gemini "WF-PROD-001 live-exec acceptance packet ready at support/sidecars/WF-PROD-001-LIVE-EXEC/WF-PROD-001-LIVE-EXEC-SIDECAR-ACCEPTANCE.md. Packet freezes current machine truth: parent WF-PROD-001-LIVE-EXEC is todo/external-gated under Gemini with reviewer Codex; formal deps PROD-SPEC-001 and PROD-DRILL-001 are both done; unblock child confirms no missing product decision remains. It maps the required GitHub/GCP/operator prerequisites, expected live deploy evidence, rollback drill evidence, and reviewer hotspots without modifying canonical truth."
```

### Reviewer Approve (`Gemini`)

```bash
AI_NAME=Gemini python3 scripts/ai_status.py approve WF-PROD-001-LIVE-EXEC-SIDECAR-ACCEPTANCE "WF-PROD-001 live-exec acceptance packet approved: dependency states align with machine truth, the parent is correctly framed as external-gated rather than semantically blocked, and the packet gives a reviewer-usable checklist for the first real production deploy plus rollback evidence."
```

### Reviewer Reopen (`Gemini`)

```bash
AI_NAME=Gemini python3 scripts/ai_status.py reopen WF-PROD-001-LIVE-EXEC-SIDECAR-ACCEPTANCE "Please refresh the WF-PROD-001 sidecar packet: <describe stale status, dependency mismatch, or missing operator/evidence requirement>."
```

### Owner Closeout (`Codex`, after approval)

```bash
NO_COMMIT_REQUIRED=1 AI_NAME=Codex python3 scripts/ai_status.py done WF-PROD-001-LIVE-EXEC-SIDECAR-ACCEPTANCE "Owner finalized the approved WF-PROD-001 support-only acceptance packet. The artifact preserves the current external-gated live-exec framing, the done dependency map for PROD-SPEC-001 and PROD-DRILL-001, the unblock-child routing decision, and the required operator evidence checklist without modifying canonical truth."
```

---

## 9) Operator Notes

1. This packet does not make `WF-PROD-001-LIVE-EXEC` runnable by itself; it only organizes the acceptance bar around already-recorded shared truth.
2. The first real live execution remains downstream of GitHub Settings and GCP provisioning work that is outside repo-only closure.
3. The missing parent evidence artifact is currently expected, because no live prod run has happened yet.
4. If trunk absorption of `PROD-SPEC-001` or `PROD-DRILL-001` artifacts becomes important for the eventual parent reviewer, fix that integration separately instead of mutating this support packet into canonical truth.
