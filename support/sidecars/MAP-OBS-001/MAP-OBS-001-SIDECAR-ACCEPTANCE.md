# MAP-OBS-001 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `MAP-OBS-001` - Spatial observability and audit  
**Parent Owner:** `Codex2`  
**Parent Reviewer:** `Codex`  
**Sidecar Owner:** `Codex`  
**Sidecar Reviewer:** `Codex2`  
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

- owner=`Codex`
- reviewer=`Codex2`
- depends_on=`MAP-BE-006`
- task_class=`sidecar`
- helper_parent=`MAP-OBS-001`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- artifact=`support/sidecars/MAP-OBS-001/MAP-OBS-001-SIDECAR-ACCEPTANCE.md`
- live lifecycle fields such as `status`, `next`, and `last_update` remain authoritative only in `ai-status.json`

### Parent task - `MAP-OBS-001`

- owner=`Codex2`
- reviewer=`Codex`
- status=`in_progress`
- depends_on=`MAP-BE-002`, `MAP-BE-005`, `MAP-BE-006`
- acceptance:
  - metrics distinguish provider outage from address ambiguity and policy denial
  - audit covers geometry mutations and booking decisions
  - runbook documents alert response
- planning_ref=`docs/03-runbooks/map-geofence-production-execution-packet-20260630.md`
- gap_ref=`docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md`

Current parent blocker snapshot from machine truth:

- `/api/operational-observability` currently derives `map_provider_outage` and `map_geofence_denial_burst` from process-lifetime counters, so alerts latch on historical events instead of a recent window.
- Release evidence is incomplete against the verifier contract: latency/quota markers and alert names are missing.
- Verifier and template audit markers expect `service_area.policy.*` and `geo.manual_override.created`, while the current implementation emits `service_area.stop_policy.*` and `geo.pin.confirmed`.
- The last recorded verification still showed core code checks passing before the OBS marker failure:
  - `pnpm --filter @drts/api typecheck`
  - `pnpm --dir apps/api exec vitest run tests/unit/geo.service.test.ts tests/unit/service-area.service.test.ts tests/unit/operational-observability.service.test.ts`
  - `pnpm --filter @drts/api test`
  - `pnpm --filter @drts/api lint`
  - `git diff --check`
  - `node scripts/verify-map-geofence-production-readiness.mjs --json`

### Explicit helper dependency posture - `MAP-BE-006`

- This sidecar helper explicitly depends on `MAP-BE-006`.
- The parent task also lists `MAP-BE-006` as an active dependency alongside `MAP-BE-002` and `MAP-BE-005`.
- A direct machine-truth lookup for `MAP-BE-006` does not currently resolve to a standalone task record from this worktree, so this packet anchors the dependency to the parent task metadata plus the planning docs and gap inventory instead of inventing a new state record.

---

## 3. Dependency Map

### A. Normative packet sources

- `AI_COLLABORATION_GUIDE.md`
- `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md`
- `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md`
- `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE-TEMPLATE.md`

### B. Upstream implementation map

| Dependency | Relationship to `MAP-OBS-001` | Evidence surfaces it feeds |
| ---------- | ----------------------------- | -------------------------- |
| `MAP-BE-002` | geocode observability source | `map_geocode_requests_total`, `map_geocode_latency_ms`, `map_provider_errors_total`, `geo.address.resolved` |
| `MAP-BE-005` | manual fallback and booking-decision source | `coordinate_less_booking_attempts_total`, `service_area.evaluated`, `geo.manual_override.created` |
| `MAP-BE-006` | service-area lifecycle and geometry-governance source | `service_area_policy_blocks_total`, `service_area_geometry_mutations_total`, `service_area.policy.published`, `service_area.policy.retired` |

### C. Why `MAP-BE-006` is the explicit sidecar dependency

`MAP-BE-006` is the dependency this helper must make easy to review because
its backend lifecycle coverage is the bridge between observability counters and
governance-safe publishing:

- The execution packet lists `MAP-OBS-001` as the observability owner for metrics, audit events, dashboards, and runbook notes.
- The gap inventory states that `MAP-BE-006` already covers backend lifecycle APIs and evaluator refresh for the current phase, while the Platform Admin review and publish UX remains open elsewhere.
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
does not mark them done.

- [ ] Metrics distinguish provider outage from address ambiguity and policy denial using recent-window alert semantics rather than process-lifetime latching.
- [ ] Audit evidence covers geometry mutations and booking decisions with verifier-compatible event names or an explicitly reconciled contract.
- [ ] Runbook and alert evidence document operator response for provider outage, policy denial spikes, quota pressure, evaluator failure, and manual override.
- [ ] The final evidence file copied from `MAP-OBS-001-FINAL-EVIDENCE-TEMPLATE.md` contains verifier-compatible row markers before `MAP-REL-001` consumes it.

### B. Sidecar acceptance for this helper

- [x] This packet exists at `support/sidecars/MAP-OBS-001/MAP-OBS-001-SIDECAR-ACCEPTANCE.md`.
- [x] The output remains support-only and does not edit canonical truth or runtime implementation.
- [x] The dependency map explicitly explains how `MAP-BE-006` feeds policy-denial and geometry-mutation observability.
- [x] The parent blocker summary is captured from machine truth without claiming the parent task is complete.
- [x] Reviewer handoff commands and closeout notes are included.

---

## 5. Evidence Inventory

| Evidence item | Location | Use in review |
| ------------- | -------- | ------------- |
| sidecar machine-truth slice | `AI_NAME=Codex scripts/ai-status.sh show MAP-OBS-001-SIDECAR-ACCEPTANCE` | confirms owner, reviewer, helper kind, dependency, and support-only scope |
| parent machine-truth slice | `AI_NAME=Codex scripts/ai-status.sh show MAP-OBS-001` | confirms live blocker summary, acceptance text, and parent dependency chain |
| explicit dependency lookup | `AI_NAME=Codex scripts/ai-status.sh show MAP-BE-006` | confirms no standalone task record resolves here, so reviewer should rely on planning docs for this helper |
| execution packet section | `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md` | defines `MAP-OBS-001` goal, acceptance, verification, and graph placement |
| gap inventory note | `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md` | records the `MAP-BE-006` lifecycle/evaluator-refresh contribution |
| final evidence template | `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE-TEMPLATE.md` | defines verifier-compatible observability rows and downstream `MAP-REL-001` handoff contract |

---

## 6. Reviewer Focus (`Codex2`)

Review this helper as a support packet, not as final evidence.

1. Confirm the packet stays support-only and makes no canonical or runtime edits.
2. Confirm the `MAP-BE-006` dependency map is accurate for policy-denial and geometry-mutation observability surfaces.
3. Confirm the parent blocker summary matches the current `MAP-OBS-001` machine-truth `next` note and does not overclaim completion.
4. Confirm the packet points future evidence work to `MAP-OBS-001-FINAL-EVIDENCE-TEMPLATE.md` instead of inventing a competing acceptance contract.

Suggested approval wording:

> support-only packet is complete; `MAP-BE-006` dependency coverage is explicit; parent blocker summary matches machine truth; no canonical truth modified

Suggested reopen wording:

> packet drifts from current MAP-OBS-001 blocker state or leaves MAP-BE-006 observability ownership ambiguous

---

## 7. Handoff Commands

Owner (`Codex`) -> reviewer (`Codex2`)

```bash
AI_NAME=Codex scripts/ai-status.sh handoff MAP-OBS-001-SIDECAR-ACCEPTANCE Codex2 "Acceptance packet ready: support-only packet created; dependency map covers MAP-BE-006 plus parent blocker summary; no canonical truth modified"
```

Reviewer (`Codex2`) -> `review_approved`

```bash
AI_NAME=Codex2 scripts/ai-status.sh approve MAP-OBS-001-SIDECAR-ACCEPTANCE "support-only packet is complete; MAP-BE-006 dependency coverage is explicit; parent blocker summary matches machine truth; no canonical truth modified"
```

Reviewer (`Codex2`) -> `reopen`

```bash
AI_NAME=Codex2 scripts/ai-status.sh reopen MAP-OBS-001-SIDECAR-ACCEPTANCE "Packet drift: <specific missing dependency or blocker detail>"
```

Owner closeout note after `review_approved`:

- create a task-scoped commit and normal non-force push before `done`
- use `INTEGRATION_STATUS=not_applicable` because this is a support-only sidecar
- include commit and push evidence in the final `done` message

---

## 8. Change Log

- `2026-07-01` - initial packet created; parent blocker summary synced from machine truth; `MAP-BE-006` dependency mapped to policy and geometry observability surfaces; no canonical truth modified
