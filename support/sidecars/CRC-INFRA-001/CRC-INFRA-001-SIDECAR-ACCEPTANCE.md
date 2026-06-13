# CRC-INFRA-001 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `CRC-INFRA-001` — add `passenger-web` to `deploy-dev` pipeline  
**Parent Owner / Reviewer:** `Claude` / `Codex2`  
**Sidecar Owner / Reviewer:** `Codex` / `Claude`  
**Generated:** `2026-06-13` (UTC)  
**Status:** `ACCEPTANCE SUPPORT ARTIFACT` — support-only; does not modify canonical truth, runtime code, or the parent workflow file. Read live task state from `ai-status.json` slices, not from this document.

This packet is forward-looking. At packet write, parent `CRC-INFRA-001` is still `backlog` in machine truth, so the purpose here is to pin acceptance framing, dependency mapping, and reviewer evidence anchors before the parent implementation starts.

---

## 1. Scope Boundary

In scope:

- restate the parent task's machine-truth acceptance in reviewer-usable form
- pin the formal dependency map exactly as recorded in machine truth
- inventory the repo anchors that show current `deploy-dev` coverage and the intended `passenger-web` landing zone
- preserve executable owner/reviewer handoff commands for this sidecar

Out of scope:

- editing `.github/workflows/deploy-dev.yml`
- editing product truth, runtime code, or deployment secrets / repo vars
- inventing new parent dependencies, service names, or rollout semantics beyond current canonical anchors
- closing or approving the parent task itself

---

## 2. Machine Truth Anchors

### Sidecar — `CRC-INFRA-001-SIDECAR-ACCEPTANCE`

- owner=`Codex`
- reviewer=`Claude`
- status is live machine truth; read via `scripts/ai-status.sh show CRC-INFRA-001-SIDECAR-ACCEPTANCE`
- task_class=`sidecar`
- helper_parent=`CRC-INFRA-001`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- depends_on=`[]`
- artifacts=`support/sidecars/CRC-INFRA-001/CRC-INFRA-001-SIDECAR-ACCEPTANCE.md`
- acceptance:
  - `Create support artifacts only`
  - `Do not edit canonical truth`
  - `Hand off the packet to the assigned reviewer`

### Parent — `CRC-INFRA-001`

- title=`Add passenger-web to deploy-dev pipeline`
- owner=`Claude`
- reviewer=`Codex2`
- status=`backlog` at packet write
- depends_on=`[]`
- artifacts=`.github/workflows/deploy-dev.yml`
- acceptance=`passenger-web builds`, `pushes`, and `deploys in deploy-dev without breaking existing services; workflow lints`
- phase=`community-referral-channel-20260613`

### Canonical / Repo Anchors

- `ai-status.json` slice via `scripts/ai-status.sh show CRC-INFRA-001`
- `.github/workflows/deploy-dev.yml`
- `docs/01-decisions/SD-DP-20260509-005-full-system-ui-surface-topology.md`
- `docs/01-product/platform-admin-ops-tenant-console-product-spec-20260508.md`
- `docs/03-runbooks/full-system-ui-completion-execution-packet-20260509.md`
- `docs/02-architecture/roadmap/fbp-015-deferred-scope-packet.md`
- `docs/ops/branch-strategy.md`

---

## 3. Current Repo Baseline

The repo already treats `apps/passenger-web` as the accepted first-party passenger landing zone:

- `docs/01-decisions/SD-DP-20260509-005-full-system-ui-surface-topology.md` maps Passenger App / Web to `apps/passenger-web`.
- `docs/01-product/platform-admin-ops-tenant-console-product-spec-20260508.md` states `apps/passenger-web` owns first-party passenger booking / status / receipt / trip-history.
- `docs/03-runbooks/full-system-ui-completion-execution-packet-20260509.md` lists `apps/passenger-web` as a repo-buildable surface.
- `docs/02-architecture/roadmap/fbp-015-deferred-scope-packet.md` keeps `apps/passenger-web` as the formal frontend landing zone even where downstream auth/bootstrap work remains deferred.

The current `deploy-dev` workflow does not yet expose any `passenger-web` deploy surface:

- env / resolved outputs include services for `api`, `platform-admin-web`, `ops-console-web`, `fleet-partner-portal-web`, `tenant-console-web`, `bank-console-web`, `partner-booking-web`, and `enterprise-dispatch-web`
- build-and-push steps exist for those same eight surfaces plus `migrate`
- deploy steps and post-deploy URL resolution cover those same existing web services
- no `passenger-web` service output, origin output, build step, or deploy step is present in the current file

That gap is exactly what the parent task is expected to close. This packet records the gap; it does not patch it.

---

## 4. Dependency Map

### Formal Upstream Dependencies

Machine truth records no formal upstream blockers.

| Dep | Status | Notes |
| --- | --- | --- |
| none | n/a | `CRC-INFRA-001.depends_on=[]` and this sidecar also has `depends_on=[]` |

### Informative Context Anchors

These are not formal blockers, but they constrain review:

| Anchor | Why It Matters |
| --- | --- |
| `docs/01-decisions/SD-DP-20260509-005-full-system-ui-surface-topology.md` | prevents reviewer or parent owner from re-opening whether the passenger surface belongs in `apps/passenger-web` |
| `docs/03-runbooks/full-system-ui-completion-execution-packet-20260509.md` | confirms `apps/passenger-web` is already expected to be repo-buildable |
| `.github/workflows/deploy-dev.yml` | current canonical deploy surface that must be extended without regressing existing services |
| `docs/ops/branch-strategy.md` | `deploy-dev.yml` is a fragile CI/deploy surface and should be reviewed accordingly |

### Formal Downstream Dependencies

No downstream task dependency was identified from the parent machine-truth slice alone. This packet does not infer any.

Reviewer guardrail:

- do not promote product-surface docs into formal blockers
- do not invent secret / variable provisioning tasks as machine-truth dependencies unless they are explicitly added to the task board later
- keep the parent acceptance scoped to `deploy-dev` pipeline wiring, not broader passenger feature completeness

---

## 5. Parent Acceptance Checklist

These checks restate the current parent acceptance without adding new truth.

### AC-1 `passenger-web builds`

Reviewer should require the parent diff to show:

- a `Build & push — passenger-web` step in `.github/workflows/deploy-dev.yml`
- the build step targets `apps/passenger-web/Dockerfile`
- tagging / cache conventions match the existing `*-web` pattern already used by sibling services

### AC-2 `passenger-web pushes`

Reviewer should require the parent diff to show:

- the workflow publishes `passenger-web` images to the same resolved registry used by the existing deploy-dev services
- `prepare` outputs and any shared build job outputs include whatever `passenger-web` needs, rather than hard-coding one-off behavior that bypasses the established pipeline shape

### AC-3 `passenger-web deploys in deploy-dev without breaking existing services; workflow lints`

Reviewer should require the parent diff to show:

- `prepare` resolves a `passenger-web` Cloud Run service name for both default/current and `waji` profiles, following the parent brief's `drts-dev-passenger-web` expectation for the `waji` profile
- the deploy job issues a `gcloud run deploy` for `passenger-web`
- any required origin / environment wiring added for `passenger-web` follows the existing cross-app origin pattern rather than altering unrelated services
- existing services remain in the workflow and keep their current ordering / gating unless there is a separately justified change
- a workflow validation command was run by the parent owner and recorded in the handoff notes

Non-claims:

- this parent task does not, by current machine truth, promise passenger feature completeness
- this parent task does not by itself prove that required repo vars / secrets already exist in the target GCP projects
- this sidecar does not claim lint success; that must come from the parent owner's eventual handoff evidence

---

## 6. Evidence Inventory

| ID | Evidence | Anchor |
| --- | --- | --- |
| E-1 | parent and sidecar machine truth | `scripts/ai-status.sh show CRC-INFRA-001`, `scripts/ai-status.sh show CRC-INFRA-001-SIDECAR-ACCEPTANCE` |
| E-2 | accepted passenger landing zone | `docs/01-decisions/SD-DP-20260509-005-full-system-ui-surface-topology.md` |
| E-3 | product ownership of passenger surface | `docs/01-product/platform-admin-ops-tenant-console-product-spec-20260508.md` |
| E-4 | repo-buildable passenger baseline | `docs/03-runbooks/full-system-ui-completion-execution-packet-20260509.md` |
| E-5 | deferred-scope note that still preserves `apps/passenger-web` as the formal landing zone | `docs/02-architecture/roadmap/fbp-015-deferred-scope-packet.md` |
| E-6 | current deploy-dev service matrix omits `passenger-web` | `.github/workflows/deploy-dev.yml` |
| E-7 | deploy-dev workflow is a fragile deploy surface | `docs/ops/branch-strategy.md` |

---

## 7. Reviewer Focus (`Claude`)

Review this sidecar packet for:

1. support-only scope: no canonical truth or workflow implementation changes hidden in this helper artifact
2. dependency discipline: formal dependency map remains empty because machine truth says `depends_on=[]`
3. acceptance fidelity: the checklist stays tied to build/push/deploy/lint and does not drift into passenger product scope
4. current-baseline accuracy: the packet correctly states that `deploy-dev.yml` currently lacks `passenger-web` wiring while `apps/passenger-web` is already the accepted app surface
5. handoff readiness: the command blocks below are executable and aligned with current owner/reviewer assignment

Suggested approve text:

> `CRC-INFRA-001 acceptance packet ready: it keeps the formal dependency map empty, pins apps/passenger-web as the accepted surface, and accurately frames the missing deploy-dev build/push/deploy wiring as the parent task without mutating canonical truth.`

Suggested reopen text:

> `packet needs revision: [specify dependency drift / acceptance drift / baseline mismatch / scope violation]`

---

## 8. Handoff Command (Owner -> Reviewer)

```bash
AI_NAME=Codex python3 scripts/ai_status.py handoff CRC-INFRA-001-SIDECAR-ACCEPTANCE Claude "CRC-INFRA-001 acceptance packet is ready at support/sidecars/CRC-INFRA-001/CRC-INFRA-001-SIDECAR-ACCEPTANCE.md. It keeps the formal dependency map empty, pins apps/passenger-web as the accepted passenger surface, and frames the current deploy-dev gap as missing passenger-web build/push/deploy wiring plus workflow lint evidence. Support artifact only; no canonical truth or workflow changes."
```

---

## 9. Reviewer Actions (Executable)

Approve:

```bash
AI_NAME=Claude python3 scripts/ai_status.py approve CRC-INFRA-001-SIDECAR-ACCEPTANCE "CRC-INFRA-001 acceptance packet ready: it keeps the formal dependency map empty, pins apps/passenger-web as the accepted surface, and accurately frames the missing deploy-dev build/push/deploy wiring as the parent task without mutating canonical truth."
```

Reopen:

```bash
AI_NAME=Claude python3 scripts/ai_status.py reopen CRC-INFRA-001-SIDECAR-ACCEPTANCE "packet needs revision: [specify dependency drift / acceptance drift / baseline mismatch / scope violation]"
```

---

## 10. Owner Closeout Command

If reviewer approval lands later, the sidecar owner can close this helper task with:

```bash
export NO_COMMIT_REQUIRED=1
AI_NAME=Codex python3 scripts/ai_status.py done CRC-INFRA-001-SIDECAR-ACCEPTANCE "Owner finalized the approved CRC-INFRA-001 support-only acceptance packet. The packet preserves the empty formal dependency map, captures the passenger-web deploy-dev gap and reviewer checklist, and leaves canonical workflow implementation to the parent task."
```

---

## 11. Notes For Parent Owner / Reviewer

- Parent implementation should stay tightly scoped to `.github/workflows/deploy-dev.yml` unless machine truth is explicitly expanded.
- Because `deploy-dev.yml` is a fragile deploy surface, the parent should use a task-scoped commit and preserve existing service behavior while adding `passenger-web`.
- If parent implementation discovers missing repo vars / secrets, that should be recorded as progress or blocker in machine truth rather than silently folded into the sidecar.
- This packet intentionally avoids assuming the exact names of any new repo vars beyond the dispatch brief's expected `drts-dev-passenger-web` service naming for `waji`.

---

## 12. Change Log

- `2026-06-13` — Codex created the initial support-only acceptance packet for `CRC-INFRA-001`, aligned to current machine truth and the existing `deploy-dev.yml` baseline.
