# MAP-OBS-001 Acceptance Packet & Dependency Map

- **Sidecar Kind:** `acceptance_packet`
- **Parent Task:** `MAP-OBS-001` - Spatial observability and audit
- **Parent Owner / Reviewer:** `Gemini` / `Codex2`
- **Sidecar Owner / Reviewer:** `Claude` / `Codex`
- **Refreshed:** `2026-07-01` (UTC)
- **Status:** support-only artifact; live lifecycle fields remain authoritative in `ai-status.json`

This packet is a reviewer-facing support artifact for
`MAP-OBS-001-SIDECAR-ACCEPTANCE`. It does not claim the parent task is complete,
and it does not modify canonical product truth. Its purpose is to restate the
current acceptance bar, anchor the `MAP-BE-006` dependency with machine-truth
evidence, and keep the reviewer handoff path aligned with the current task
record.

---

## 1. Scope Boundary

In scope:

- restate the current `MAP-OBS-001` acceptance bar for reviewer use
- map the observability dependency chain, with explicit `MAP-BE-006` coverage
- point reviewers to the current final-evidence template and machine-truth
  blocker summary
- provide sidecar handoff commands that match the current owner/reviewer fields

Out of scope:

- editing runtime, API, alert, dashboard, or runbook implementation
- changing L1/L2 canonical truth, the parent task record, or the final evidence
  template contract
- declaring `MAP-OBS-001` production-ready or release-ready

---

## 2. Machine-Truth Anchors

### Sidecar task - `MAP-OBS-001-SIDECAR-ACCEPTANCE`

Source:

```bash
AI_NAME=Codex scripts/ai-status.sh show MAP-OBS-001-SIDECAR-ACCEPTANCE
```

Current slice:

- owner=`Claude`
- reviewer=`Codex`
- status=`review`
- depends_on=`MAP-BE-006`
- task_class=`sidecar`
- helper_parent=`MAP-OBS-001`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- artifact=`support/sidecars/MAP-OBS-001/MAP-OBS-001-SIDECAR-ACCEPTANCE.md`

### Parent task - `MAP-OBS-001`

Source:

```bash
AI_NAME=Codex scripts/ai-status.sh show MAP-OBS-001
```

Current slice:

- owner=`Gemini`
- reviewer=`Codex2`
- status=`in_progress`
- depends_on=`MAP-BE-002`, `MAP-BE-005`, `MAP-BE-006`
- acceptance:
  - `MAP-OBS-001-FINAL-EVIDENCE.md populated with real artifacts`
  - `required metrics PASS`
  - `required audit events PASS`
  - `required recent-window alerts PASS`
  - `runbooks distinguish provider outage address ambiguity policy denial postgis and manual override`
  - `no template markers or placeholder tokens remain`
  - `concrete branch@sha and artifact path/link evidence included`
  - `each PASS row includes row-level artifact path/link evidence`

Current blocker and readiness posture from the parent `next` field:

- readiness=`fail 34 failures`
- task_status=`in_progress`
- blocks=`Gate A: Callcenter safe to dispatch`, `Gate B: Governance safe to publish`, `Gate E: Degraded safe`, `Observability Coverage`
- open_dependencies=`MAP-BE-002=review owner=Claude2`, `MAP-BE-005=in_progress owner=Claude2`
- referenced report=`support/sidecars/MAP-REL-001/MAP-READINESS-BLOCKER-REPORT.md`

### Explicit dependency - `MAP-BE-006`

Source:

```bash
AI_NAME=Codex scripts/ai-status.sh show MAP-BE-006
```

Current slice:

- owner=`Codex2`
- reviewer=`Codex`
- status=`done`
- depends_on=`MAP-BE-001`
- acceptance:
  - `admin lifecycle APIs exist`
  - `publish/retire/effective dating tested`
  - `mutations audited`
  - `published geometry feeds evaluator`
  - `api tests pass`
- commit=`1c06a5cfb56ac94e117d2ed773f5938750be67c0`
- commit_subject=`MAP-BE-006: rebuild clean governance integration branch (#1020)`
- push_ref=`origin/dev`

### Repo-local reference drift to keep in mind

- `MAP-OBS-001` currently points machine-truth `planning_ref` and `gap_ref` to
  `20260701` docs, but this worktree only contains the `20260630` packet and gap
  inventory files.
- The parent `next` field references
  `support/sidecars/MAP-REL-001/MAP-READINESS-BLOCKER-REPORT.md`, but that path
  is not present in this worktree.
- Because of that drift, reviewer conclusions for this helper should treat the
  `ai-status` slices above as authoritative, and use repo-local docs below as
  supporting narrative only.

---

## 3. Dependency Map

### A. Normative and supporting sources used by this packet

- `AI_COLLABORATION_GUIDE.md`
- `AI_NAME=Codex scripts/ai-status.sh show MAP-OBS-001-SIDECAR-ACCEPTANCE`
- `AI_NAME=Codex scripts/ai-status.sh show MAP-OBS-001`
- `AI_NAME=Codex scripts/ai-status.sh show MAP-BE-006`
- `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md`
- `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md`
- `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE-TEMPLATE.md`

### B. Upstream implementation map

| Dependency | Relationship to `MAP-OBS-001` | Evidence surfaces it feeds |
| ---------- | ----------------------------- | -------------------------- |
| `MAP-BE-002` | geocode request and provider-error source | `map_geocode_requests_total`, `map_geocode_latency_ms`, `map_provider_errors_total`, `geo.address.resolved` |
| `MAP-BE-005` | coordinate-less booking and manual fallback source | `coordinate_less_booking_attempts_total`, `service_area.evaluated`, `geo.manual_override.created` |
| `MAP-BE-006` | service-area lifecycle, publish/retire audit, and evaluator-geometry source | `service_area_policy_blocks_total`, `service_area_geometry_mutations_total`, `service_area.policy.published`, `service_area.policy.retired` |

### C. Why `MAP-BE-006` is the explicit sidecar dependency

`MAP-BE-006` is not an unresolved placeholder. It is a completed upstream task
whose output is still necessary for `MAP-OBS-001` acceptance review:

- the parent task still lists `MAP-BE-006` in `depends_on`
- the parent acceptance bar requires PASS evidence for policy-denial and
  geometry-mutation observability rows
- the final evidence template ties those rows directly to `MAP-BE-006`
- the execution packet describes `MAP-BE-006` as the service-area lifecycle API
  that publishes governed geometry and audits mutations
- the gap inventory says `MAP-BE-006` already covers the backend lifecycle APIs
  and evaluator refresh path, while UI/editor experience remains open elsewhere

### D. Downstream evidence consumers

- `MAP-QA-002` consumes the observability implementation when validating policy
  outcomes and degraded-mode behavior across surfaces.
- `MAP-REL-001` should consume `MAP-OBS-001-FINAL-EVIDENCE.md` only after the
  template copy is populated with real PASS or FAIL evidence.

---

## 4. Acceptance Checklist

### A. Parent task reviewer checklist

This helper does not mark `MAP-OBS-001` done. It only restates the current bar
that the parent owner must still satisfy:

- [ ] `MAP-OBS-001-FINAL-EVIDENCE.md` is populated with real artifacts rather
      than template placeholders.
- [ ] Required metrics rows are `PASS`.
- [ ] Required audit-event rows are `PASS`.
- [ ] Required recent-window alert rows are `PASS`.
- [ ] Runbooks distinguish provider outage, address ambiguity, policy denial,
      PostGIS/evaluator failure, and manual override.
- [ ] No template markers or placeholder tokens remain.
- [ ] Concrete `branch@sha` and artifact path/link evidence are included.
- [ ] Each `PASS` row includes row-level artifact path/link evidence.

### B. Sidecar acceptance for this helper

- [x] This packet exists at `support/sidecars/MAP-OBS-001/MAP-OBS-001-SIDECAR-ACCEPTANCE.md`.
- [x] The output remains support-only and does not edit canonical truth or
      runtime implementation.
- [x] The `MAP-BE-006` dependency is described as a completed upstream task with
      explicit policy-denial and geometry-mutation evidence ownership.
- [x] The packet records current machine-truth drift where repo-local supporting
      paths are missing instead of citing nonexistent files as evidence.
- [x] Owner, reviewer, and handoff commands match the current sidecar task
      record.

---

## 5. Evidence Inventory

| Evidence item | Location | Use in review |
| ------------- | -------- | ------------- |
| sidecar machine-truth slice | `AI_NAME=Codex scripts/ai-status.sh show MAP-OBS-001-SIDECAR-ACCEPTANCE` | confirms current owner, reviewer, helper kind, dependency, and support-only scope |
| parent machine-truth slice | `AI_NAME=Codex scripts/ai-status.sh show MAP-OBS-001` | confirms live acceptance text, readiness blockers, open dependencies, and referenced evidence paths |
| dependency machine-truth slice | `AI_NAME=Codex scripts/ai-status.sh show MAP-BE-006` | confirms `MAP-BE-006` is complete and already pushed to `origin/dev` |
| execution packet | `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md` | supports the task graph and the `MAP-OBS-001` / `MAP-BE-006` responsibility split |
| gap inventory | `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md` | supports the statement that backend lifecycle APIs and evaluator refresh are already covered by `MAP-BE-006` |
| final evidence template | `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE-TEMPLATE.md` | defines the verifier-compatible observability rows that `MAP-OBS-001` still needs to populate |

---

## 6. Reviewer Focus (`Codex`)

Review this file as a support packet, not as final observability evidence:

1. Confirm it stays support-only and makes no canonical or runtime edits.
2. Confirm the `MAP-BE-006` dependency description matches current machine
   truth: completed upstream task, still relevant to `MAP-OBS-001` evidence.
3. Confirm the parent blocker summary reflects the current parent `next` field
   without inventing details from missing repo-local report files.
4. Confirm the packet directs future evidence work back to
   `MAP-OBS-001-FINAL-EVIDENCE-TEMPLATE.md` rather than creating a competing
   contract.

Suggested approval wording:

> support-only packet is current; `MAP-BE-006` dependency coverage is explicit;
> parent readiness blockers match machine truth; no canonical truth modified

Suggested reopen wording:

> packet drifts from current sidecar or parent machine truth, cites nonexistent
> support paths as evidence, or leaves `MAP-BE-006` observability ownership
> ambiguous

---

## 7. Handoff Commands

Owner (`Claude`) -> reviewer (`Codex`)

```bash
AI_NAME=Claude scripts/ai-status.sh handoff MAP-OBS-001-SIDECAR-ACCEPTANCE Codex "Acceptance packet ready: support-only packet aligned to current machine truth; MAP-BE-006 dependency coverage is explicit; no canonical truth modified"
```

Reviewer (`Codex`) -> `review_approved`

```bash
AI_NAME=Codex scripts/ai-status.sh approve MAP-OBS-001-SIDECAR-ACCEPTANCE "support-only packet is current; MAP-BE-006 dependency coverage is explicit; parent readiness blockers match machine truth; no canonical truth modified"
```

Reviewer (`Codex`) -> `reopen`

```bash
AI_NAME=Codex scripts/ai-status.sh reopen MAP-OBS-001-SIDECAR-ACCEPTANCE "Packet drift: <specific machine-truth mismatch or ambiguous dependency note>"
```

Owner closeout note after `review_approved`:

- create a task-scoped commit and normal non-force push before `done`
- use `INTEGRATION_STATUS=not_applicable` because this is a support-only sidecar
- include commit and push evidence in the final `done` writeback

---

## 8. Change Log

- `2026-07-01` - acceptance packet refreshed to current machine truth; corrected
  sidecar and parent ownership, replaced stale `MAP-BE-006` resolution claim
  with the actual `done` slice, and noted missing repo-local support paths where
  `ai-status` references newer artifacts not present in this worktree
