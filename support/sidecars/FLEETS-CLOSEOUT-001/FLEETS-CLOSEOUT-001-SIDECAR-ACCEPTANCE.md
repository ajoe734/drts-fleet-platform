# FLEETS-CLOSEOUT-001 Sidecar Acceptance Packet

- Task: `FLEETS-CLOSEOUT-001-SIDECAR-ACCEPTANCE`
- Parent Task: `FLEETS-CLOSEOUT-001`
- Helper Kind: `acceptance_packet`
- Owner: `Codex`
- Reviewer: `Gemini2`
- Prepared: `2026-07-08`
- Parent machine-truth snapshot: `FLEETS-CLOSEOUT-001` is currently `blocked`; the recorded blocker is branch closeout / CI subject compliance on PR `#1072`, not a product-semantic dispute about map/geofence evidence.
- Scope guardrail: support artifact only; no canonical truth, runtime, registry, or governance files were edited for this sidecar.

## Acceptance Mapping

| Brief acceptance | Packet coverage |
| --- | --- |
| Create support artifacts only | This file is the only artifact added by this sidecar task. |
| Do not edit canonical truth | The packet cites existing machine truth, runbooks, support evidence, and unit/E2E artifacts; it does not modify product truth or runtime code. |
| Hand off the packet to the assigned reviewer | Reviewer guidance and machine-truth handoff notes are included below so the owner can move this sidecar to `review`. |

## Dependency Map

Control-plane note: the sidecar task's `depends_on` list names `MAP-FE-CALL-001`,
`MAP-BE-004`, `MAP-BE-005`, and `MAP-FE-OPS-001`, but
`scripts/ai-status.sh show <id>` currently returns `Task not found` for each of
those IDs. For this packet, the execution packet, gap inventory, and support
evidence files are the usable source of truth for dependency status.

| Dependency | Canonical source anchor | Evidence anchor | Relevance to `FLEETS-CLOSEOUT-001` | Current posture |
| --- | --- | --- | --- | --- |
| `MAP-FE-CALL-001` | `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md` section `MAP-FE-CALL-001`; `docs/03-runbooks/execution-next-wave-task-board.md` section `12.1` | `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md` row `E2E-MAP-001` | Supplies the callcenter map-pinned request body, coordinate provenance, and operator-visible gating required by the parent "phone order spatial proof" closeout. | Landed on `dev` per runbook/board; no per-task machine-truth row is present. |
| `MAP-BE-004` | `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md` section `MAP-BE-004`; `docs/03-runbooks/execution-next-wave-task-board.md` section `12.1` | `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md` row `E2E-MAP-003`; `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md` row `service_area.evaluated` | Establishes the backend service-area decision gate and the rule that manual-review / blocked states cannot silently proceed as normal dispatch. | Landed on `dev` per runbook/board; no per-task machine-truth row is present. |
| `MAP-BE-005` | `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md` section `MAP-BE-005`; `docs/03-runbooks/execution-next-wave-task-board.md` section `12.1` | `apps/api/tests/unit/owned-mobility.service.test.ts` test `persists service-area snapshots and emits spatial audit events for coordinate-bearing phone orders`; `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md` rows `geo.pin.confirmed` and `service_area.evaluated` | Supplies the immutable spatial snapshot, order-level audit event, and provenance payload that the parent acceptance rows need to cite. | Landed on `dev` per runbook/board; no per-task machine-truth row is present. |
| `MAP-FE-OPS-001` | `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md` section `MAP-FE-OPS-001`; `docs/03-runbooks/execution-next-wave-task-board.md` sections `12.1` and `12.2` | `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md` row `E2E-MAP-006` | Supplies the Ops map-board visibility proof that the parent closeout wants to link back to the same order/evaluation chain. | Landed on `dev` per runbook/board; no per-task machine-truth row is present. |

## Secondary Evidence Anchors

These are not in the sidecar `depends_on` field, but the parent closeout cannot
be reviewed coherently without them.

| Evidence packet | Why it matters |
| --- | --- |
| `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md` | Supplies the explicit `E2E-MAP-001`, `E2E-MAP-003`, and `E2E-MAP-006` rows the parent acceptance language already names. |
| `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md` | Supplies auditable backend evidence for `geo.pin.confirmed`, `service_area.evaluated`, and related observability/event contracts. |
| `support/sidecars/MAP-REL-001/MAP-PRODUCTION-CLOSEOUT-FLEETS-TASK-BOARD-20260708.md` | Supplies the closeout-family gate framing and shows this evidence family is being assembled as a fleets release board, even though the board currently only closes `FLEETS-CLOSEOUT-005`. |

## Parent Acceptance Checklist

Assessment legend:

- `PASS`: a row-level support artifact already exists on this branch.
- `PARTIAL`: implementation or suite evidence exists, but the parent row still
  needs explicit same-order stitching or a direct artifact link.

| Parent acceptance row | Current support anchors | Assessment | Notes for parent closeout |
| --- | --- | --- | --- |
| `E2E-MAP-001` final PASS row has browser artifact plus persisted API/DB/audit artifact for the same order ID | `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md` row `E2E-MAP-001`; `apps/api/tests/unit/owned-mobility.service.test.ts` phone-order spatial-audit test; `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md` rows `geo.pin.confirmed` / `service_area.evaluated` | `PARTIAL` | The branch proves the UI request-body provenance, immutable snapshot logic, and audit/event contract separately. I did not find a filed support artifact that stitches one concrete `orderId` across browser, persisted snapshot, audit export, and Ops board in one row. |
| `E2E-MAP-003` manual-review row proves no normal dispatch job | `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md` row `E2E-MAP-003`; `support/sidecars/MAP-QA-002/artifacts/service-area-service-vitest-20260704T0414Z.json`; `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md` section `MAP-BE-004` acceptance | `PARTIAL` | Current evidence proves manual-review decisions stay explicit and are not supposed to silently dispatch. I did not find a dedicated release artifact that shows the absence of a normal dispatch job for one recorded manual-review order. |
| Callcenter request-body provenance row has row-level artifact link | `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md` row `E2E-MAP-001`; `support/sidecars/MAP-QA-002/artifacts/playwright-map-geofence-callcenter-ui-20260704T0414Z.json` | `PASS` | The QA final evidence already points to a row-level browser artifact for the callcenter request-body provenance claim. |
| service-area decision snapshot row has immutable backend snapshot artifact | `apps/api/tests/unit/owned-mobility.service.test.ts` phone-order spatial-audit test; `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md` section `MAP-BE-005`; `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md` row `service_area.evaluated` | `PARTIAL` | Immutable snapshot behavior is well supported by implementation and test evidence, but the parent closeout row still needs a filed backend artifact link rather than only code/test anchors. |
| Ops visibility row links the same order ID | `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md` required scenario table for `E2E-MAP-001`; `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md` row `E2E-MAP-006`; `docs/03-runbooks/execution-next-wave-task-board.md` Gate C summary | `PARTIAL` | Ops map-board readiness is proven, but I did not find a support artifact on this branch that links one identical `orderId` from the callcenter booking proof into the Ops board row. |
| no unresolved fill-in markers remain | `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md`; `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md`; `support/sidecars/MAP-REL-001/MAP-PRODUCTION-CLOSEOUT-FLEETS-TASK-BOARD-20260708.md` | `PASS` | A marker scan over the reviewed support artifacts found no unresolved fill-in tokens. `support/sidecars/MAP-REL-001/MAP-READINESS-BLOCKER-REPORT.md` is absent on this branch, which is a completeness gap, not a fill-in token. |

## Suggested Stitching For Parent Owner

1. Lift the existing `E2E-MAP-001` browser artifact from `MAP-QA-002` and pair
   it with one filed backend artifact that exposes the persisted
   `spatialAudit` snapshot and matching audit event for the same `orderId`.
2. Lift the existing `E2E-MAP-003` QA evidence and add one explicit artifact
   proving the reviewed/manual-review order did not create a normal dispatch
   job.
3. Link the Ops board row to that same `orderId`, or state clearly that the Ops
   proof remains route-level readiness evidence rather than same-order proof.
4. Keep the parent blocker narrative separate: the current machine-truth block
   is a branch closeout / CI subject issue, so this packet should not be used
   to restate the blocker as a missing product-semantic dependency.

## Reviewer Handoff Notes

- This sidecar does not claim the parent task is ready for `done`.
- It does claim the dependency/evidence landscape is now documented enough for a
  reviewer to distinguish existing branch evidence from still-missing
  row-stitching artifacts.
- The most important review question is whether the `PARTIAL` markings above
  are appropriately conservative, given the available QA/OBS/runtime evidence.
- If accepted, the reviewer should approve this sidecar packet only; the parent
  owner still decides whether and how to absorb it into the canonical closeout
  flow.
