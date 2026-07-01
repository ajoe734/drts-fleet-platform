# MAP-OBS-001 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `MAP-OBS-001` - Spatial observability and audit
**Parent Owner:** `Gemini`
**Parent Reviewer:** `Codex2`
**Sidecar Owner:** `Claude`
**Sidecar Reviewer:** `Gemini`
**Generated:** `2026-07-01` (UTC)
**Status:** `ACCEPTANCE SUPPORT ARTIFACT` - support-only; live lifecycle fields remain authoritative in `ai-status.json`.

This packet complements
`support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE-TEMPLATE.md`.
It does not claim `MAP-OBS-001` is complete. Its purpose is narrower:
capture the current acceptance bar, the dependency map with explicit
`MAP-BE-006` coverage, and the reviewer handoff path without changing
canonical truth.

---

## 1. Scope Boundary

In scope:

- translate the current `MAP-OBS-001` acceptance bar into a reviewer-facing checklist
- map the observability dependency chain, with explicit attention to `MAP-BE-006`
- point the reviewer and parent owner to the existing final-evidence template and current blocker summary
- provide machine-truth handoff commands for this sidecar

Out of scope:

- editing runtime, API, alert, dashboard, or runbook implementation
- changing L1/L2 canonical truth, the parent task record, or the final evidence template contract
- declaring `MAP-OBS-001` release-ready or production-ready

---

## 2. Machine Truth Anchors

### Sidecar task - `MAP-OBS-001-SIDECAR-ACCEPTANCE`

- owner=`Claude`
- reviewer=`Gemini`
- depends_on=`MAP-BE-006`
- task_class=`sidecar`
- helper_parent=`MAP-OBS-001`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- artifact=`support/sidecars/MAP-OBS-001/MAP-OBS-001-SIDECAR-ACCEPTANCE.md`
- live lifecycle fields such as `status`, `next`, and `last_update` remain authoritative only in `ai-status.json`

### Parent task - `MAP-OBS-001`

- owner=`Gemini`
- reviewer=`Codex2`
- status=`in_progress`
- depends_on=`MAP-BE-002`, `MAP-BE-005`, `MAP-BE-006`
- acceptance (current machine truth):
  - `MAP-OBS-001-FINAL-EVIDENCE.md` populated with real artifacts
  - required metrics PASS
  - required audit events PASS
  - required recent-window alerts PASS
  - runbooks distinguish provider outage, address ambiguity, policy denial, PostGIS, and manual override
  - no template markers or placeholder tokens remain
  - concrete `branch@sha` and artifact path/link evidence included
  - each PASS row includes row-level artifact path/link evidence
- planning_ref (per parent record)=`docs/03-runbooks/map-geofence-fleets-execution-tasks-20260701.md`
- gap_ref (per parent record)=`docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260701.md`

> Note on doc availability: the `20260701`-dated planning and gap refs above are
> named in the parent task record but are **not yet present on `dev`** in this
> worktree (base `dev@f452f019f`). The versions that resolve on `dev` today are
> the `20260630` packet and gap inventory cited in section 3.A. Reviewers should
> treat the `20260701` refs as parent-owner working docs pending integration and
> rely on the `20260630` docs plus live machine truth until they land.

Current parent blocker snapshot from machine truth (`next` field, last update `2026-07-01T10:25:15Z`):

- Readiness verifier reports `readiness=fail` with 34 failures; `task_status=in_progress`.
- Blocks production gates: `Gate A: Callcenter safe to dispatch`, `Gate B: Governance safe to publish`, `Gate E: Degraded safe`, plus `Observability Coverage`.
- Open dependencies recorded in the snapshot: `MAP-BE-002` and `MAP-BE-005` (both owner `Claude2`); see live states in section 3.B.
- The final-evidence contract requires real artifacts, recent-window alert semantics, verifier-compatible markers, and no placeholder tokens before `MAP-REL-001` may consume the evidence.

### Explicit helper dependency posture - `MAP-BE-006`

- This sidecar helper explicitly depends on `MAP-BE-006`.
- The parent task also lists `MAP-BE-006` as an active dependency alongside `MAP-BE-002` and `MAP-BE-005`.
- `MAP-BE-006` (`Service-area management APIs`, owner `Codex2`, reviewer `Codex`) now resolves to a standalone machine-truth record with `status=done`. It is committed and merged to `dev`:
  - `commit_hash=1c06a5cfb56ac94e117d2ed773f5938750be67c0`
  - `commit_subject=MAP-BE-006: rebuild clean governance integration branch (#1020)`
  - `push_remote=origin`, `push_branch=dev`, `push_ref=origin/dev`
  - reachable from `origin/dev` (verified in local git log at `1c06a5cfb`).
- This is a change from the earlier acceptance packet snapshot, which recorded that `MAP-BE-006` did not resolve to a standalone record. The service-area lifecycle backend that feeds policy-denial and geometry-mutation observability is therefore **landed**, so the remaining `MAP-OBS-001` work is wiring those signals into verifier-compatible evidence rather than waiting on `MAP-BE-006` backend delivery.

---

## 3. Dependency Map

### A. Normative packet sources (resolvable on `dev` today)

- `AI_COLLABORATION_GUIDE.md`
- `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md`
- `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md`
- `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE-TEMPLATE.md`

### B. Upstream implementation map

| Dependency | Live status | Relationship to `MAP-OBS-001` | Evidence surfaces it feeds |
| ---------- | ----------- | ----------------------------- | -------------------------- |
| `MAP-BE-002` (GeoModule provider gateway, owner `Claude2` / rev `Codex2`) | `in_progress` | geocode observability + provider outage source | `map_geocode_requests_total`, `map_geocode_latency_ms`, `map_provider_errors_total`, `geo.address.resolved` |
| `MAP-BE-005` (Persist service-area snapshot and spatial audit, owner `Claude2` / rev `Codex2`) | `in_progress` | manual fallback, spatial audit, and booking-decision source | `coordinate_less_booking_attempts_total`, `service_area.evaluated`, `geo.manual_override.created` |
| `MAP-BE-006` (Service-area management APIs, owner `Codex2` / rev `Codex`) | `done` @ `dev`/`1c06a5cfb` | service-area lifecycle and geometry-governance source | `service_area_policy_blocks_total`, `service_area_geometry_mutations_total`, `service_area.policy.published`, `service_area.policy.retired` |

### C. Why `MAP-BE-006` is the explicit sidecar dependency

`MAP-BE-006` is the dependency this helper must make easy to review because
its backend lifecycle coverage is the bridge between observability counters and
governance-safe publishing:

- The execution packet lists `MAP-OBS-001` as the observability owner for metrics, audit events, dashboards, and runbook notes.
- The gap inventory states that `MAP-BE-006` covers backend service-area lifecycle APIs and evaluator refresh for the current phase.
- `MAP-BE-006` is now `done` and merged to `dev`, so the policy-denial and geometry-mutation observability surfaces have a landed backend source; the open work is evidence wiring, not backend delivery.
- The final evidence template ties `MAP-BE-006` directly to the rows most likely to block release readiness:
  - `OBS-MAP-POLICY-DENIAL`
  - `OBS-MAP-GEOMETRY-MUTATION`
  - `service_area_policy_blocks_total`
  - `service_area_geometry_mutations_total`
  - `service_area.policy.published`
  - `service_area.policy.retired`

### D. Downstream evidence consumers

- `MAP-QA-002` consumes the observability implementation when validating degraded-mode and policy outcomes.
- `MAP-REL-001` consumes the final observability evidence packet after the template is copied to `MAP-OBS-001-FINAL-EVIDENCE.md` and populated with real PASS or FAIL evidence.

---

## 4. Acceptance Checklist

### A. Parent task acceptance framing

These are still open reviewer checks for `MAP-OBS-001` itself. This sidecar
does not mark them done. They mirror the current parent acceptance array.

- [ ] `MAP-OBS-001-FINAL-EVIDENCE.md` is created from the template and populated with real artifacts (no `<PASS|FAIL|EXTERNAL-GATED>` markers or placeholder tokens remain).
- [ ] Required metrics PASS with recent-window alert semantics rather than process-lifetime latching (provider outage vs address ambiguity vs policy denial distinguishable).
- [ ] Required audit events PASS, covering geometry mutations and booking decisions with verifier-compatible event names or an explicitly reconciled contract.
- [ ] Required recent-window alerts PASS.
- [ ] Runbooks distinguish provider outage, address ambiguity, policy denial, PostGIS failure, and manual override response paths.
- [ ] Concrete `branch@sha` and artifact path/link evidence are included, and each PASS row carries row-level artifact evidence.

### B. Sidecar acceptance for this helper

- [x] This packet exists at `support/sidecars/MAP-OBS-001/MAP-OBS-001-SIDECAR-ACCEPTANCE.md`.
- [x] The output remains support-only and does not edit canonical truth or runtime implementation.
- [x] The dependency map explicitly explains how `MAP-BE-006` feeds policy-denial and geometry-mutation observability, and records its current `done`/merged state.
- [x] The parent blocker summary is captured from machine truth without claiming the parent task is complete.
- [x] Doc-availability drift (parent's `20260701` refs not yet on `dev`) is recorded honestly.
- [x] Reviewer handoff commands and closeout notes are included.

---

## 5. Evidence Inventory

| Evidence item | Location | Use in review |
| ------------- | -------- | ------------- |
| sidecar machine-truth slice | `AI_NAME=Claude scripts/ai-status.sh show MAP-OBS-001-SIDECAR-ACCEPTANCE` | confirms owner, reviewer, helper kind, dependency, and support-only scope |
| parent machine-truth slice | `AI_NAME=Claude scripts/ai-status.sh show MAP-OBS-001` | confirms live blocker summary, acceptance text, and parent dependency chain |
| `MAP-BE-006` dependency lookup | `AI_NAME=Claude scripts/ai-status.sh show MAP-BE-006` | confirms `done` state, `commit_hash=1c06a5cfb`, and merge to `origin/dev` |
| `MAP-BE-002` / `MAP-BE-005` lookup | `AI_NAME=Claude scripts/ai-status.sh show MAP-BE-002` / `... MAP-BE-005` | confirms both remain `in_progress` (owner `Claude2`) as upstream observability sources |
| execution packet | `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md` | defines `MAP-OBS-001` goal, acceptance, verification, and graph placement |
| gap inventory | `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md` | records the `MAP-BE-006` lifecycle/evaluator-refresh contribution |
| final evidence template | `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE-TEMPLATE.md` | defines verifier-compatible observability rows and downstream `MAP-REL-001` handoff contract |

---

## 6. Reviewer Focus (`Gemini`)

Review this helper as a support packet, not as final evidence.

1. Confirm the packet stays support-only and makes no canonical or runtime edits.
2. Confirm the `MAP-BE-006` dependency map is accurate for policy-denial and geometry-mutation observability surfaces, and that its `done`/merged state (`dev@1c06a5cfb`) is correctly recorded.
3. Confirm the parent blocker summary matches the current `MAP-OBS-001` machine-truth `next` note and does not overclaim completion.
4. Confirm the doc-availability note about the parent's `20260701` refs is fair, and that the packet points future evidence work to `MAP-OBS-001-FINAL-EVIDENCE-TEMPLATE.md` instead of inventing a competing acceptance contract.

Suggested approval wording:

> support-only packet is complete; `MAP-BE-006` dependency coverage is explicit and reflects the merged `done` state; parent blocker summary matches machine truth; no canonical truth modified

Suggested reopen wording:

> packet drifts from current MAP-OBS-001 blocker state or misrepresents MAP-BE-006 / upstream dependency status

---

## 7. Handoff Commands

Owner (`Claude`) -> reviewer (`Gemini`)

```bash
AI_NAME=Claude scripts/ai-status.sh handoff MAP-OBS-001-SIDECAR-ACCEPTANCE Gemini "Acceptance packet ready: support-only packet created; dependency map covers MAP-BE-006 (done@dev/1c06a5cfb) plus MAP-BE-002/005 upstream; parent blocker summary synced from machine truth; no canonical truth modified"
```

Reviewer (`Gemini`) -> `review_approved`

```bash
AI_NAME=Gemini scripts/ai-status.sh approve MAP-OBS-001-SIDECAR-ACCEPTANCE "support-only packet is complete; MAP-BE-006 dependency coverage is explicit; parent blocker summary matches machine truth; no canonical truth modified"
```

Reviewer (`Gemini`) -> `reopen`

```bash
AI_NAME=Gemini scripts/ai-status.sh reopen MAP-OBS-001-SIDECAR-ACCEPTANCE "Packet drift: <specific missing dependency or blocker detail>"
```

Owner closeout note after `review_approved`:

- create a task-scoped commit and normal non-force push before `done`
- use `INTEGRATION_STATUS=not_applicable` because this is a support-only sidecar
- include `COMMIT_HASH` / `COMMIT_SUBJECT` / `PUSH_REMOTE` / `PUSH_BRANCH` evidence in the final `done` message

---

## 8. Change Log

- `2026-07-01` - packet refreshed for the re-created sidecar (owner `Claude` / reviewer `Gemini`). Parent blocker summary synced to current machine truth (`readiness=fail`, 34 failures, gates A/B/E + Observability Coverage). `MAP-BE-006` re-mapped as `done` and merged to `dev@1c06a5cfb` (was unresolved in the earlier snapshot). `MAP-BE-002` / `MAP-BE-005` recorded as `in_progress` upstream sources. Doc-availability drift for the parent's `20260701` planning/gap refs recorded. No canonical truth modified.
