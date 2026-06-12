# ENT-DISP-FE-20260612-F Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `ENT-DISP-FE-20260612-F` - Enterprise Dispatch API tests and rollout  
**Parent Owner:** `Gemini`  
**Parent Reviewer:** `Codex`  
**Sidecar Owner:** `Codex`  
**Sidecar Reviewer:** `Claude2`  
**Generated:** `2026-06-12` (UTC)  
**Status:** `ACCEPTANCE SUPPORT ARTIFACT` - support-only; does not modify canonical truth, runtime behavior, or parent task ownership.

This packet exists to keep `ENT-DISP-FE-20260612-F` reviewable as a blocked acceptance slice rather than a vaguely pending implementation task. The parent task is not ready for execution closeout today: the formal dependency `ENT-DISP-FE-20260612-A` is now in `review` with branch-pushed scaffold evidence but is not merged into `origin/dev`, the route/shell prerequisites `ENT-DISP-FE-20260612-B` through `ENT-DISP-FE-20260612-E` are still `backlog`, and the referenced Enterprise Dispatch app/design artifacts do not yet exist in this assigned worktree or on `origin/dev`. This packet records that dependency reality, the exact acceptance gate for the parent, and what evidence must exist before `F` can leave `blocked`.

---

## 1. Scope Boundary

In scope:

- capture the current machine-truth state for `ENT-DISP-FE-20260612-F` and its direct prerequisite `ENT-DISP-FE-20260612-A`
- map the practical blockers named in the parent task's `next` field to concrete upstream tasks (`B` through `E`) and missing artifacts
- define the reviewer checklist for when the parent task is resumed
- preserve the "support artifacts only" boundary for this sidecar slice

Out of scope:

- creating `apps/enterprise-dispatch-web`
- editing runtime code, tests, docs under canonical truth, or task ownership
- inventing Enterprise Dispatch routes, API contracts, or rollout claims not already present in machine truth
- marking the parent task accepted, review-ready, or done

---

## 2. Machine Truth Anchors

### Sidecar - `ENT-DISP-FE-20260612-F-SIDECAR-ACCEPTANCE`

- owner=`Codex`
- reviewer=`Claude2`
- status=`review_approved` at closeout time
- helper_parent=`ENT-DISP-FE-20260612-F`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- artifact=`support/sidecars/ENT-DISP-FE-20260612-F/ENT-DISP-FE-20260612-F-SIDECAR-ACCEPTANCE.md`

### Parent - `ENT-DISP-FE-20260612-F`

- owner=`Gemini`
- reviewer=`Codex`
- status=`blocked`
- depends_on=`ENT-DISP-FE-20260612-A`
- acceptance=`api-client gap map 完成; unit/smoke 測試覆蓋 booking/gate/embed; dev URL 和 rollback note 記錄`
- artifacts:
  - `apps/enterprise-dispatch-web/tests`
  - `support/sidecars/ENT-DISP-FE-20260612`
- `last_update=2026-06-12T15:09:22Z`
- `waiting_for=Codex`
- `next=API gap map is complete; remaining API wiring/tests/rollout are blocked until B-E UI routes and shared data adapter exist. Resume after shell/primitives and route implementation are available.`

Interpretation:

- the parent acceptance text is singular but compound: it expects both contract-mapping evidence and runnable test/rollout evidence
- machine truth already says the gap map portion is complete
- machine truth also says the runnable portion is blocked on missing UI routes and shared adapter support
- this sidecar therefore frames `F` as a deferred acceptance gate, not a failed implementation

---

## 3. Working Tree Baseline

Observed in the assigned worktree on `2026-06-12`:

- branch is `codex/ent-disp-fe-20260612-f-sidecar-acceptance`
- `apps/enterprise-dispatch-web` does not exist
- `support/sidecars/ENT-DISP-FE-20260612/` does not exist yet
- `docs/05-ui/drts-design-canvas/ent-kit.jsx` does not exist
- `docs/05-ui/drts-design-canvas/ent-shell.jsx` does not exist
- `docs/05-ui/drts-design-canvas/ent-screens-1.jsx` does not exist
- `docs/05-ui/drts-design-canvas/ent-screens-2.jsx` does not exist
- `docs/05-ui/drts-design-canvas/ent-states.jsx` does not exist

Implication:

- task `A` now has branch-pushed scaffold evidence, but that scaffold is not present in this isolated sidecar worktree and is still absent from `origin/dev`
- the artifact paths named by tasks `A` through `F` are therefore not materialized in the surfaces that matter for this packet's closeout scope: this assigned worktree and `origin/dev`
- because the parent task acceptance explicitly requires `apps/enterprise-dispatch-web/tests`, the parent task cannot honestly move into review before the app scaffold and test target exist in a branch the parent can build on, then merge forward
- because `F.next` names "B-E UI routes and shared data adapter" as blockers, the missing design-canvas files are not cosmetic gaps; they are upstream review anchors that later owners expect to use

---

## 4. Dependency Map

### 4.1 Formal machine dependency

| Dependency | Status | Evidence from machine truth | Why it gates `F` |
| --- | --- | --- | --- |
| `ENT-DISP-FE-20260612-A` | `review` | `next` records branch-pushed scaffold evidence at commit `d59ae774` on `claude2/ent-disp-fe-20260612-a`, but not merged to `origin/dev` | `F` cannot run tests or record a dev URL/rollback note from this branch until the scaffold is available to downstream work on a usable integration base |

### 4.2 Practical prerequisite chain named by the parent blocker

These are not listed in `F.depends_on`, but they are explicitly named by `F.next` and therefore must be treated as real unblockers for acceptance work:

| Upstream task | Status | Parent blocker relationship |
| --- | --- | --- |
| `ENT-DISP-FE-20260612-B` | `backlog` | owns shell/primitives and the missing `ent-kit.jsx` / `ent-shell.jsx` anchors; parent `F` explicitly waits on shell/primitives |
| `ENT-DISP-FE-20260612-C` | `backlog` | owns website booking flow; parent acceptance requires booking coverage in unit/smoke tests |
| `ENT-DISP-FE-20260612-D` | `backlog` | owns status/outcome pages; parent cannot claim route-level rollout evidence until these screens exist |
| `ENT-DISP-FE-20260612-E` | `backlog` | owns gate/embed states; parent acceptance explicitly requires gate/embed test coverage |

### 4.3 Existing donor surfaces that matter for `F`

These are not Enterprise Dispatch artifacts, but they explain the adapter and contract baseline that `F` is expected to wire through rather than reinvent:

| Existing surface | Current repo signal | Relevance to `F` |
| --- | --- | --- |
| `packages/api-client/src/index.ts` | already exposes broad `/api/tenant/*` booking, quota, approval, webhook, and audit methods | parent note about "api-client gap map" indicates `F` should connect Enterprise Dispatch onto shared client semantics, not create a second ad hoc fetch layer |
| `apps/tenant-console-web` | contains booking create/detail/rules/settings flows and unit tests against `/api/tenant/*` | useful contract donor for booking/quota/approval behavior, but not a UI shell to inherit visually |
| `apps/partner-booking-web` | contains integration tests and tenant-backed booking flow wiring | useful reference for BFF/proxy/test structure, but explicitly not a styling or topology base for Enterprise Dispatch |

Guardrail:

- `ENT-DISP-FE-20260612-A.next` already says the new app README must forbid extending `tenant-portal`, `tenant-console`, or `partner-booking`
- this means reuse is allowed at contract/test-pattern level, not by cloning surface identity or navigation

---

## 5. Parent Acceptance Framing

The parent task has one acceptance bullet in machine truth, but it breaks down into four reviewer checkpoints:

### AC-1 - `api-client gap map 完成`

- current machine truth says this portion is already complete
- reviewer should expect a concrete inventory of which Enterprise Dispatch booking/gate/embed calls map cleanly to existing shared client methods and which still need adapter work
- reviewer should reject vague wording like "wired through shared client" if no per-endpoint or per-flow gap inventory is attached

### AC-2 - `unit/smoke 測試覆蓋 booking`

- currently blocked because the app and booking routes are absent
- unblock signal: `ENT-DISP-FE-20260612-C` is implemented and `apps/enterprise-dispatch-web/tests` exists
- reviewer should expect tests that exercise at least home/new/review/submitted behavior, because `C.acceptance` names that fixture flow explicitly

### AC-3 - `unit/smoke 測試覆蓋 gate/embed`

- currently blocked because gate/embed routes and states are absent
- unblock signal: `ENT-DISP-FE-20260612-E` is implemented and the shell/embed state model exists
- reviewer should expect auth/suspended/approval/quota/no-supply/degraded plus embed handoff/reauth/unsupported/consent/fallback coverage, because those are the exact acceptance words on `E`

### AC-4 - `dev URL 和 rollback note 記錄`

- currently blocked because no Enterprise Dispatch app exists to deploy or verify
- reviewer should expect an evidence packet or parent handoff note that includes:
  - the actual dev URL used for verification
  - what deployment artifact or branch produced it
  - a rollback note tied to that deployment shape
- reviewer should reject placeholder text like "dev URL pending" once the parent moves to review

Summary:

- as of `2026-06-12`, only AC-1 is machine-truth-complete
- AC-2 through AC-4 are legitimately blocked, not merely unstarted

---

## 6. Missing Artifact Checklist

Before the parent task should leave `blocked`, the following artifacts should exist somewhere in the repo or parent sidecar directory:

- `apps/enterprise-dispatch-web/`
- `apps/enterprise-dispatch-web/tests/`
- `support/sidecars/ENT-DISP-FE-20260612/` with the parent evidence packet(s)
- shell/primitives design anchors referenced by task `B`
- route/state design anchors referenced by tasks `C`, `D`, and `E`
- runnable test evidence tied to booking, gate, and embed flows
- rollout evidence naming a dev URL and rollback note

This sidecar intentionally does not create placeholder versions of those artifacts. Creating fake scaffolds would blur the blocked state rather than clarify it.

---

## 7. Reviewer Hotspots

When `Claude2` reviews this sidecar, focus on these points:

1. The packet must keep the parent task in `blocked` framing. It must not imply that `F` is review-ready today.
2. The dependency map must distinguish formal dependency `A` from practical blockers `B-E` without rewriting machine truth.
3. The packet must record that the referenced Enterprise Dispatch app and design-canvas files are absent in the current worktree.
4. The packet must preserve the guardrail that Enterprise Dispatch is a new surface, even if it reuses shared `/api/tenant/*` client patterns from `tenant-console-web` or `partner-booking-web`.
5. The packet must not invent rollout evidence, test results, or adapter completion beyond what `F.next` already says.

---

## 8. Handoff Guidance For The Parent Owner

When `ENT-DISP-FE-20260612-F` is resumed by its owner, the next useful order is:

1. wait for `ENT-DISP-FE-20260612-A` to materialize `apps/enterprise-dispatch-web`
2. consume `B` through `E` outputs so the booking/gate/embed surfaces exist
3. refresh the API gap map against the actual Enterprise Dispatch route implementation, not just donor apps
4. record test evidence under `apps/enterprise-dispatch-web/tests`
5. record dev URL + rollback note in the parent support packet
6. only then hand the parent task to reviewer `Codex`

This sidecar is complete once it has captured the blocker topology and handed that packet to `Claude2`. It does not reopen or complete the parent task.
