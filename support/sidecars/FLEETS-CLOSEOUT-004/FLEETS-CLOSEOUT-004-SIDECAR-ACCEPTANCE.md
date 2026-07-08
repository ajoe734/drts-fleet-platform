# FLEETS-CLOSEOUT-004 SIDECAR ACCEPTANCE

Status: see `ai-status.json.FLEETS-CLOSEOUT-004-SIDECAR-ACCEPTANCE.status` (authoritative; not pinned inline). Most recent handoff is round-4 to `Codex` after deferring **all** mutable live status for the related task `FLEETS-CLOSEOUT-001` to machine truth
Owner: Claude (reassigned from Codex2 per chairman availability-first reassignment; the Codex2 owner lane hit a 2/2 terminal loop on this support-only sidecar)
Reviewer: Codex
Parent: `FLEETS-CLOSEOUT-004` (owner `Codex`, reviewer `Codex2`)
Last Update: see `ai-status.json` `FLEETS-CLOSEOUT-004-SIDECAR-ACCEPTANCE.last_update` (authoritative; not duplicated inline to avoid drift)

> Scope note: this is a **support-only sidecar** (`task_class: sidecar`, `helper_kind: acceptance_packet`, `mutates_canonical: false`). It assembles an acceptance checklist, a dependency map, and evidence anchors for parent `FLEETS-CLOSEOUT-004`. It does **not** edit L1/L2 canonical truth, contract truth, or the parent's runtime/proof implementation. Authoritative lifecycle for both the parent and this sidecar lives in `ai-status.json`; this packet mirrors that machine truth and does not redefine parent closeout.

## 目的

為 `FLEETS-CLOSEOUT-004`（Ops map backend-linked visibility proof）準備非侵入式 acceptance 支援包。本檔只整理 acceptance checklist、dependency map、parent live snapshot、gate 對照與 read-only evidence anchors，不修改 canonical truth。輸出僅落在 `support/sidecars/FLEETS-CLOSEOUT-004/`。

## Parent live snapshot (from `ai-status.json`, at this refresh)

- Parent `FLEETS-CLOSEOUT-004` status: `in_progress` (owner `Codex`, reviewer `Codex2`).
- Parent title: **Ops map backend-linked visibility proof**.
- Parent declared dependencies: `MAP-FE-OPS-001`, `MAP-BE-003`, `MAP-BE-005`, `FLEETS-CLOSEOUT-001`.
- Parent commit / push / integration evidence: **not yet recorded** in `ai-status.json` (`commit_hash`, `push_branch`, `integration_status` all null). The parent has not closed out; this sidecar does not assert any parent commit.
- Parent production gates: `Gate A: Callcenter safe to dispatch`, `Gate B: Governance safe to publish`, `Gate C: Ops safe to operate`, `Gate D: Driver safe to navigate`, `Gate E: Degraded safe`. `FLEETS-CLOSEOUT-004` is the **Gate C — Ops safe to operate** backend-linked visibility proof row.
- Parent `next` note (machine truth) records that repo-local evidence now includes model proof, browser DOM screenshot proof, backend service readback proof, and controller/API-envelope readback proof, and that the parent must **not** be marked `done` until reviewer acceptance plus a stage HTTP/API-or-DB export for the same order/dispatch/candidate readback, OBS final evidence, and MAP-QA-002 final row links are real and the readiness verifier passes.

### Branch-resolution honesty note (important for the reviewer)

This sidecar branch (`claude/fleets-closeout-004-sidecar-acceptance`) is cut from `dev` (base tip `a167bf6bc61d1897bf118cd140e1b319eb1477a2`, `FLEETS-CLOSEOUT-005: finalize Driver Gate D closeout evidence (#1071)`). Several parent-declared artifacts are **not resolvable on this branch** because they live on the parent owner's working branch and have not yet merged to `dev`. Verified absent via `git ls-files` at this refresh:

- `apps/api/tests/unit/owned-mobility-ops-map-closeout-proof.test.ts` — absent on branch
- `apps/api/tests/unit/owned-mobility-ops-map-api-closeout-proof.test.ts` — absent on branch
- `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE-PROMOTION-MATRIX-20260706.md` — absent on branch
- `support/sidecars/MAP-QA-002/artifacts/closeout-20260708/fleets-closeout-004-backend-linked-ops-proof.json` — absent on branch
- `support/sidecars/MAP-QA-002/artifacts/closeout-20260708/fleets-closeout-004-api-envelope-ops-proof.json` — absent on branch
- `scripts/verify-map-geofence-production-readiness.mjs`, `scripts/verify-map-geofence-dispatch-integrity.mjs` — absent on branch

This packet therefore treats those parent proof artifacts as **declared-but-parent-branch-local** (owned by the parent owner `Codex`), and does not restate their contents as if verified from this branch. Artifacts that **are** resolvable on this branch are cited with a ✅ below.

## Canonical / read-only references

- Parent machine truth: `ai-status.json` entries for `FLEETS-CLOSEOUT-004` and `FLEETS-CLOSEOUT-004-SIDECAR-ACCEPTANCE`.
- Planning ref: `docs/03-runbooks/map-geofence-fleets-execution-tasks-20260701.md` (execution addendum) and baseline packet `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md`.
- Ops-map dependency + owner table: `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md:161` (`MAP-FE-OPS-001` `Codex -> Codex2`, L3, deps `MAP-BE-003`, `MAP-BE-005`, `MAP-UI-001`, "Ops real map board").
- Gate C mapping: `docs/03-runbooks/execution-next-wave-task-board.md:276` (`Gate C — Ops safe to operate`, `MAP-FE-OPS-001`, `ops-map-board.ts`).
- Closeout board (resolvable on branch ✅): `support/sidecars/MAP-REL-001/MAP-PRODUCTION-CLOSEOUT-FLEETS-TASK-BOARD-20260708.md`.
- Live Ops-map implementation anchor (resolvable on branch ✅): `apps/ops-console-web/app/dispatch/ops-map-board.ts` and `apps/ops-console-web/tests/unit/ops-map-board.test.ts`.

## Dependency Map

All three of this sidecar's declared prerequisites are resolved as archived-`done`. A fourth task declared on the **parent** (`FLEETS-CLOSEOUT-001`) is a separate release task, not a prerequisite this sidecar can or should progress; its live lifecycle status is authoritative in `ai-status.json` and is deliberately **not** restated here (mutable fields drift independently of this packet).

### Hard prerequisites (declared in `FLEETS-CLOSEOUT-004.depends_on`)

| Dependency | Machine-truth status | Scope / why it matters to the Ops visibility proof | Citation |
| --- | --- | --- | --- |
| `MAP-FE-OPS-001` | **done** (archived; present in `ai-status.json.archived_task_ids`). Owner→reviewer `Codex -> Codex2`, L3. | "Ops real map board" — the Ops surface whose order pins, pickup/dropoff pairing, service/stop-policy overlays, and stale/no-location supply states are the subject of the backend-linked visibility proof. Live anchor `apps/ops-console-web/app/dispatch/ops-map-board.ts`. | `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md:161`; `docs/03-runbooks/execution-next-wave-task-board.md:276` |
| `MAP-BE-003` | **done** (archived). | Added typed API-client coverage and OpenAPI endpoint-delta docs for geo and service-area flows; the API-client methods for service-area definitions/evaluation the Ops board reads back from. | `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md:164` |
| `MAP-BE-005` | **done** (archived). | Order-level immutable spatial audit snapshots: coordinate provenance, actor/surface, service-area decision, area/policy/version refs, audit-event evidence — the persisted backend truth the Ops visibility rows must link back to for the same order IDs. | `docs/03-runbooks/execution-next-wave-task-board.md:254` |

### Related parent dependency (not a sidecar lever)

| Dependency | Machine-truth status | Note |
| --- | --- | --- |
| `FLEETS-CLOSEOUT-001` | Durable owner `Codex`, reviewer `Codex2`. Live `status`, `last_update`, and `next` are authoritative in `ai-status.json.FLEETS-CLOSEOUT-001` and are **not** restated here — they are mutable fields that drift independently of this packet. | "Callcenter persisted spatial proof". It shares the same-order-ID linkage the parent's Ops visibility row depends on (acceptance bullet 2 / A2). It is a separate release task, not a prerequisite this support sidecar can or should progress. Recorded here for completeness; no action taken. |

### Out of scope for this sidecar

- Editing canonical contract surfaces, API service/controller code, Ops-console runtime code, L1/L2 spec files, or execution-packet text.
- Producing, rewriting, or re-verifying the parent's proof artifacts (model proof, browser DOM screenshot, backend service readback, API-envelope readback, readiness verifier). Those are parent-owner (`Codex`) deliverables and mostly live on the parent's unmerged branch.
- Progressing the parent `FLEETS-CLOSEOUT-004` state machine or recording parent commit/push/integration evidence.
- Unblocking or advancing `FLEETS-CLOSEOUT-001`.

## Acceptance Mapping (parent acceptance bullets → evidence anchor + reviewer focus)

The parent's five acceptance bullets are restated read-only from `ai-status.json.FLEETS-CLOSEOUT-004.acceptance`. This sidecar maps each to where its evidence is expected to live and what the parent reviewer (`Codex2`) must confirm at parent closeout; it does not itself certify these bullets.

| # | Parent acceptance bullet | Expected evidence anchor | Reviewer focus at parent closeout |
| --- | --- | --- | --- |
| A1 | `E2E-MAP-006` final PASS row has browser trace or screenshot plus API/DB snapshot artifact | Browser DOM screenshot proof + API-envelope readback JSON (`.../closeout-20260708/fleets-closeout-004-api-envelope-ops-proof.json`, parent-branch-local) | Confirm the final PASS row carries **both** a browser trace/screenshot **and** an API/DB snapshot for the same run. |
| A2 | Ops visibility row uses same order IDs as Callcenter proof | Backend-linked ops proof JSON (`.../fleets-closeout-004-backend-linked-ops-proof.json`, parent-branch-local) cross-referenced with the `FLEETS-CLOSEOUT-001` Callcenter persisted spatial proof | Confirm the Ops order IDs are byte-identical to the Callcenter proof order IDs (ties to `FLEETS-CLOSEOUT-001`). |
| A3 | overlay rows prove service and stop-policy versions | Ops-board overlay readback showing service-area + stop-policy version refs (from `MAP-BE-005` audit snapshot fields) | Confirm each overlay row pins an explicit service-area version and stop-policy version, not just names. |
| A4 | stale/no-location rows prove candidate freshness states | Dispatch-candidate freshness readback (stale / no-location supply states on the Ops board) | Confirm stale and no-location driver-supply states are each represented with candidate freshness evidence. |
| A5 | fallback state row has artifact evidence | Fallback/degraded (`Gate E`) state row with an attached artifact | Confirm the fallback state row links a concrete artifact, not prose. |

## Acceptance Checklist (sidecar deliverables)

- [x] Acceptance checklist (this file) created under `support/sidecars/FLEETS-CLOSEOUT-004/` only.
- [x] Dependency map scoped to the parent's declared prerequisites, each resolved against `ai-status.json` machine truth (active tasks ∪ `archived_task_ids`) and cited to a doc anchor.
- [x] Parent acceptance bullets mapped to expected evidence anchors and reviewer focus, without re-certifying them from this branch.
- [x] Gate context recorded: parent is the **Gate C — Ops safe to operate** backend-linked visibility proof row.
- [x] Branch-resolution honesty note: parent proof artifacts that are not present on this `dev`-based branch are flagged as parent-branch-local rather than restated as verified.
- [x] No canonical truth modified outside this sidecar path; all lifecycle transitions flow through `scripts/ai-status.sh`.
- [x] Handoff to reviewer `Codex` (see Handoff log).

## Sidecar reviewer checklist (`Codex`)

- Confirm this packet matches live machine truth: parent `FLEETS-CLOSEOUT-004` is `in_progress` under `Codex` / `Codex2` with no commit/push/integration recorded; this sidecar is owned by `Claude` with reviewer `Codex` (its own live lifecycle status is authoritative in `ai-status.json.FLEETS-CLOSEOUT-004-SIDECAR-ACCEPTANCE`, not pinned here).
- Confirm the dependency map only references prerequisites that already exist in `ai-status.json` (`MAP-FE-OPS-001`, `MAP-BE-003`, `MAP-BE-005` archived-`done`; related parent task `FLEETS-CLOSEOUT-001` present with durable owner/reviewer only and its live status deferred to `ai-status.json`) with no speculation.
- Confirm the packet does not restate parent-branch-local proof artifacts as verified from this branch, and does not redefine or progress parent closeout.
- Confirm this sidecar only writes under `support/sidecars/FLEETS-CLOSEOUT-004/`.
- Approve when satisfied:

```bash
AI_NAME=Codex scripts/ai-status.sh approve FLEETS-CLOSEOUT-004-SIDECAR-ACCEPTANCE \
  "Reviewed: FLEETS-CLOSEOUT-004 acceptance packet aligned to current parent snapshot (in_progress; no commit recorded), dependency map (MAP-FE-OPS-001/MAP-BE-003/MAP-BE-005 done, FLEETS-CLOSEOUT-001 recorded with durable owner/reviewer only and live status deferred to ai-status.json), and acceptance mapping without mutating canonical truth."
```

If changes are required:

```bash
AI_NAME=Codex scripts/ai-status.sh reopen FLEETS-CLOSEOUT-004-SIDECAR-ACCEPTANCE "<reason>"
```

## Evidence Inventory

- Sidecar artifact: `support/sidecars/FLEETS-CLOSEOUT-004/FLEETS-CLOSEOUT-004-SIDECAR-ACCEPTANCE.md` (this file).
- Parent machine truth: `ai-status.json` entry for `FLEETS-CLOSEOUT-004` — status `in_progress`, owner `Codex`, reviewer `Codex2`, no commit/push/integration recorded.
- Sidecar machine truth: `ai-status.json` entry for `FLEETS-CLOSEOUT-004-SIDECAR-ACCEPTANCE` — owner `Claude`, reviewer `Codex`; `last_update` on that entry is the authoritative timestamp source.
- Dependency closure: `MAP-FE-OPS-001`, `MAP-BE-003`, `MAP-BE-005` resolved as `done` via `ai-status.json.archived_task_ids`; related parent task `FLEETS-CLOSEOUT-001` recorded with durable owner `Codex` / reviewer `Codex2` only — its live status/last_update/next are deferred to `ai-status.json.FLEETS-CLOSEOUT-001`.
- Resolvable-on-branch anchors ✅: `apps/ops-console-web/app/dispatch/ops-map-board.ts`, `apps/ops-console-web/tests/unit/ops-map-board.test.ts`, `support/sidecars/MAP-REL-001/MAP-PRODUCTION-CLOSEOUT-FLEETS-TASK-BOARD-20260708.md`.
- Parent-branch-local proof artifacts (declared in parent, not on this branch): `apps/api/tests/unit/owned-mobility-ops-map-closeout-proof.test.ts`, `apps/api/tests/unit/owned-mobility-ops-map-api-closeout-proof.test.ts`, `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE-PROMOTION-MATRIX-20260706.md`, `support/sidecars/MAP-QA-002/artifacts/closeout-20260708/fleets-closeout-004-backend-linked-ops-proof.json`, `support/sidecars/MAP-QA-002/artifacts/closeout-20260708/fleets-closeout-004-api-envelope-ops-proof.json`.

## Handoff log

1. `AI_NAME=Claude scripts/ai-status.sh start FLEETS-CLOSEOUT-004-SIDECAR-ACCEPTANCE "Assembling acceptance checklist, dependency map, and support packet for FLEETS-CLOSEOUT-004 (support-only, no canonical edits)"` — sidecar moved to `in_progress` under new owner `Claude` (reassigned from `Codex2`).
2. Round-1 draft of this support artifact created under `support/sidecars/FLEETS-CLOSEOUT-004/FLEETS-CLOSEOUT-004-SIDECAR-ACCEPTANCE.md`: parent live snapshot, dependency map (with machine-truth statuses + doc citations), acceptance mapping, gate context, and a branch-resolution honesty note distinguishing on-branch anchors from parent-branch-local proof artifacts. No canonical truth modified outside the sidecar path.
3. Task-scoped commit + normal non-force push of the sidecar artifact, then handoff to `Codex` for review (see machine truth for exact transition timestamps).
4. Round-1 review returned by `Codex`: the related dependency snapshot for `FLEETS-CLOSEOUT-001` was stale — the packet had pinned a concrete live status that had already drifted from `ai-status.json`. Refreshed every reference to that task (dependency-map narrative, related-dependency table, sidecar reviewer checklist, approve-command summary, and evidence inventory), and corrected the dependency-map count ("all three declared prerequisites archived-done" — previously miscounted as "two"). Re-verified the three hard prerequisites are still archived-`done` in `ai-status.json.archived_task_ids` and the parent `FLEETS-CLOSEOUT-004` is still `in_progress` with no commit/push/integration recorded. No canonical truth modified outside the sidecar path. Re-committed + non-force pushed, then re-handed off to `Codex` for round-2 review.
5. Round-2 review returned by `Codex`: the round-1 refresh had pinned `FLEETS-CLOSEOUT-001`'s mutable `last_update` timestamp inline (in the related-dependency row and this handoff narrative), which drifts independently of this packet and had already gone stale. Partial fix: the related-dependency row began deferring `last_update` to `ai-status.json`, but a concrete live `status`/`active` value was still restated in several places. No canonical truth modified outside the sidecar path. Re-committed + non-force pushed, then re-handed off to `Codex` for round-3 review.
6. Round-3 review returned by `Codex`: the packet still restated a concrete mutable live status for `FLEETS-CLOSEOUT-001` (`in_progress`/`active`) in the dependency narrative, related-dependency row, reviewer checklist, approve-command summary, evidence inventory, and handoff narrative, so it drifted again once the task advanced to `review_approved`. Root-cause fix (no more per-round status refreshes): every reference to `FLEETS-CLOSEOUT-001` now records only its **durable** owner/reviewer and defers `status`/`last_update`/`next` entirely to `ai-status.json.FLEETS-CLOSEOUT-001` as authoritative — the same not-duplicated-inline discipline already used for this sidecar's own header. This packet no longer pins any live status enum for that related task. Re-verified the three hard prerequisites are still archived-`done` and the parent `FLEETS-CLOSEOUT-004` is still `in_progress` with no commit/push/integration recorded. No canonical truth modified outside the sidecar path. Re-committed + non-force pushed, then re-handed off to `Codex` for round-4 review.

---

Support artifact prepared by `Claude`. No canonical files modified outside `support/sidecars/FLEETS-CLOSEOUT-004/`; all `ai-status.json` lifecycle updates handled by `scripts/ai-status.sh`.
