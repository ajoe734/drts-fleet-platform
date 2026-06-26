# P2-CORR-001 — Acceptance Packet & Dependency Map (Sidecar)

| Field | Value |
| --- | --- |
| Sidecar task | `P2-CORR-001-SIDECAR-ACCEPTANCE` |
| Parent task | `P2-CORR-001` — Takeover three-source correlation engine + discrepancy cases |
| Helper kind | `acceptance_packet` (support-only; `mutates_canonical=false`) |
| Owner / Reviewer | Claude / Codex2 |
| Packet date | 2026-06-26 |
| Parent owner / reviewer | Codex2 / Codex |
| Parent status (at packet time) | `in_progress` (addressing rejected review findings) |
| Evidence anchor | `codex2/p2-corr-001` @ `529e1920b` *"wip(P2-CORR-001): anchor takeover correlation engine"* |
| Anchor base | `5727eef1f` (`origin/dev`, after P2-SAFE-001 #930) |

> **Scope of this packet.** This is a parallel support artifact. It does **not** modify
> L1 canonical truth, contracts, or runtime. It maps the parent's single-line acceptance
> criterion into a verifiable checklist, maps dependencies to delivery evidence, and lists
> the reviewer-risk focus areas. The parent owner (Codex2) decides whether to absorb any of
> this into the mainline. All line/symbol citations are against anchor `529e1920b`; verify
> they still resolve before relying on them, since the parent branch is mid-revision.

---

## 1. Product intent (canonical)

Per parent summary (SD §7, spec 06 §2, flows §3): correlate three independent evidence
sources for an autonomy takeover via `takeoverCorrelationId`, **without merging them into a
single truth**:

1. `TeslaAutonomyTransitionEvent` — Tesla Fleet API autonomy transition (FSD disengage /
   manual takeover / autonomy resumed).
2. `SafetyOperatorTakeoverReport` — safety-operator field report (from **P2-SAFE-001**).
3. `RocTakeoverResponseRecord` — Remote Operations Center response.

Correlation priority ladder:

- **Priority 1** — `session/event + VIN + window` (`takeover_correlation_id`).
- **Priority 2** — `VIN + time + trip` (`vehicle_time_trip`).
- **Priority 3** — `manual` operator-supplied link.

Output is a `CorrelatedTakeoverCase` that **retains the distinct timestamps and source record
ids** of every contributing source. When sources disagree, the platform opens an
`EvidenceDiscrepancyCase` and **does not adjudicate** — it preserves all raw source facts
side-by-side.

---

## 2. Acceptance checklist (AC map)

Parent acceptance (verbatim): *"Correlation matches on fixtures across all 3 priorities;
conflicting sources create discrepancy case with no silent overwrite; correlated case retains
distinct timestamps/sources; E2E-P2-004 covered; unit+integration green."*

Decomposed and mapped to evidence in `529e1920b`:

| ID | Acceptance item | Evidence | Status in anchor |
| --- | --- | --- | --- |
| **AC-1** | Priority-1 match: `takeoverCorrelationId == report.correlationId` **&** same `vehicleId` **&** within 5-min window; ROC also matchable via `triggeredByTeslaEventId` / `autonomySessionId`. | `roc-operations.service.ts` `findPriorityOneTeslaEvent` (L198), `findPriorityOneRocResponse` (L214); `PRIORITY_ONE_WINDOW_MS = 5*60*1000`. Sets `correlationPriority:1, matchedBy:"takeover_correlation_id"`. | ✅ implemented; covered by unit "matches all three sources by priority 1…" + E2E-P2-004 |
| **AC-2** | Priority-2 fallback when correlation ids absent: `VIN + orderId(trip) + 10-min window`. | `findPriorityTwoTeslaEvent` (L238), `findPriorityTwoRocResponse` (L254); `PRIORITY_TWO_WINDOW_MS = 10*60*1000`. Sets `correlationPriority:2, matchedBy:"vehicle_time_trip"`. | ⚠️ implemented but **uses first `.find()` match, not nearest-in-window** — see §5 Open Item O-1 (parent `next` explicitly tracks this rejected finding). Unit "falls back to priority 2…" passes the single-candidate case only. |
| **AC-3** | Priority-3 manual link via `ManualTakeoverCorrelationLink`; resolves tesla/ROC by explicit ids. | `correlateForReport` manual branch (L132–133, `correlationPriority=3, matchedBy="manual"`); `createManualTakeoverCorrelation`. | ✅ implemented; covered by unit "supports priority 3 manual links…" |
| **AC-4** | Conflicting sources open an `EvidenceDiscrepancyCase` with **no silent overwrite**; platform does **not** adjudicate. | `buildDiscrepancyCase` (L270): `timestamp_mismatch` (spread > `DISCREPANCY_WINDOW_MS=2min`), `trip_mismatch` (>1 distinct `orderId`), `correlation_id_mismatch` (>1 distinct correlation id). `sourceFacts` retains every raw tesla/safety/ROC value verbatim. | ✅ implemented; E2E asserts `discrepancyTypes ⊇ {timestamp_mismatch, correlation_id_mismatch}` |
| **AC-5** | `CorrelatedTakeoverCase` retains distinct timestamps & sources (no collapse to single truth). | `sourceTimestamps` keeps `teslaOccurredAt / safetyOccurredAt / safetyServerReceivedAt / rocRequestedAt / rocRespondedAt / rocResolvedAt` separately; `sourceRecordIds` + full `teslaEvent` / `safetyOperatorTakeoverReport` / `rocTakeoverResponse` objects retained; all clone-on-read (`cloneTeslaEvent`/`cloneRocResponse`/`cloneManualLink`/`cloneTakeoverReport`). | ✅ implemented; E2E asserts all four timestamps preserved distinctly |
| **AC-6** | `E2E-P2-004` covered. | `apps/api/tests/integration/e2e-p2-004-takeover-correlation.test.ts` — "correlates priority 1 and opens discrepancy evidence without collapsing timestamps into one truth" (1 case, 1 discrepancy). | ✅ present |
| **AC-7** | unit + integration green. | unit `apps/api/tests/unit/roc-operations.service.test.ts` (3 cases: P1/P2/P3); integration e2e-p2-004. | ⏳ **must be re-run on final revision** — see Reviewer command block §6. Not independently re-run by this support packet. |

Legend: ✅ satisfied in anchor · ⚠️ partial / open item · ⏳ requires executable re-verification at review.

---

## 3. Contract surface added (in this branch)

`packages/contracts/src/phase2-tesla-fsd-sandbox.ts` (after `RocIntervention`, L747+):

- `TeslaAutonomyTransitionEvent` + `TESLA_AUTONOMY_TRANSITION_TYPES`
- `RocTakeoverResponseRecord`
- `CreateManualTakeoverCorrelationCommand` / `ManualTakeoverCorrelationLink`
- `TakeoverCorrelationMatchMode` (`takeover_correlation_id` | `vehicle_time_trip` | `manual`)
- `TakeoverDiscrepancyType` (`timestamp_mismatch` | `trip_mismatch` | `correlation_id_mismatch`)
- `EvidenceDiscrepancyCase` (with `sourceFacts` holding all three sources' raw timestamps,
  order ids, and correlation ids)
- `CorrelatedTakeoverCase` (priority 1|2|3, matchedBy, sourceRecordIds, sourceTimestamps,
  full embedded source records, `discrepancyCaseIds[]`)

Runtime wiring:

- `RocOperationsService` constructor-injects `SafetyOperatorService`; rebuilds cases from
  `safetyOperatorService.listTakeoverReports({}, INTERNAL_SYSTEM_IDENTITY)`
  (`rebuildCorrelatedTakeoverCases` L100).
- `AccidentInvestigationService` constructor-injects `RocOperationsService` and exposes
  `listCorrelatedTakeoverCases` / `listEvidenceDiscrepancyCases` /
  `rebuildTakeoverCorrelationSnapshot`.
- Both modules register the new dependency (`*.module.ts` `+2` each).

> **GOTCHA — in-memory engine.** Sources are held in service-local arrays
> (`teslaTransitionEvents`, `takeoverResponses`, `manualCorrelations`) seeded via
> `recordTeslaAutonomyTransitionEvent` / `recordRocTakeoverResponseRecord` /
> `createManualTakeoverCorrelation`. There is **no persistence / DDL** in this anchor
> (no `av_sandbox`/`av_evidence` writes for correlation cases). Correlation is recomputed
> on every `rebuild*` call. Persistence is out of scope for this slice's acceptance.

---

## 4. Dependency map

| Dependency | Board status | What it provides | Satisfied? | Notes |
| --- | --- | --- | --- | --- |
| **P2-SAFE-001** | `done` — merged `origin/dev` @ `5727eef1f363` (#930) | `SafetyOperatorTakeoverReport` contract + `SafetyOperatorService.listTakeoverReports()`; report fields consumed by the engine: `reportId`, `vehicleId`, `orderId`, `correlationId`, `occurredAt`, `serverReceivedAt`, `evidenceArtifactIds`. | ✅ **SATISFIED** | Anchor base `5727eef1f` is *after* #930, so the engine compiles against the merged safety-operator runtime. RocOperationsService injects SafetyOperatorService directly. |
| **P2-TESLA-003** | **NOT a board row** (`scripts/ai-status.sh show P2-TESLA-003` → *Task not found*) | Intended upstream producer of `TeslaAutonomyTransitionEvent` ingestion (Tesla Fleet API autonomy transitions). | ⚠️ **CONTRACT-SHAPED, not a hard runtime blocker** | The `TeslaAutonomyTransitionEvent` contract is defined **inside the P2-CORR-001 branch itself**, and the engine ingests events via `recordTeslaAutonomyTransitionEvent()` (in-memory). The correlation engine therefore does not *block* on a TESLA-003 runtime. **Reviewer action:** confirm whether TESLA-003 ownership/ingestion is tracked elsewhere (cf. `P2-TESLA-001` in `review`), and whether the contract should live in the producer's slice rather than CORR-001. Flag if the missing board row hides real upstream work. |

Sibling/related (not declared deps): `P2-TESLA-001` (`review`, Tesla public fleet
integration) — likely the real home of Tesla event ingestion; cross-check field alignment of
`TeslaAutonomyTransitionEvent`.

---

## 5. Open items the reviewer must weigh

- **O-1 (tracked by parent `next`) — Priority-2 nearest-candidate.** Parent `next`:
  *"make priority-2 matching choose nearest candidate in window."* In `529e1920b`,
  `findPriorityTwoTeslaEvent`/`findPriorityTwoRocResponse` use `Array.prototype.find` →
  **first** match in `[newest-first]` order within the window, **not the nearest by time**.
  With multiple in-window candidates this can mis-correlate. **AC-2 is not fully satisfied
  until this lands.** Confirm the fix and a multi-candidate unit fixture exist on the final
  revision before approving.
- **O-2 (tracked by parent `next`) — preserve conflicting `takeoverCorrelationId`.**
  Verify the chosen `CorrelatedTakeoverCase.takeoverCorrelationId` does not erase a
  conflicting source value: `sourceFacts.{tesla,safety,roc}TakeoverCorrelationId` must keep
  all three raw values even when they disagree (E2E-P2-004 exercises `corr-e2e-001` vs
  `corr-e2e-002` and asserts `correlation_id_mismatch`). Confirm this holds for priority-3
  manual links too (manual branch derives the case id from tesla/roc/report fallback chain).
- **O-3 — non-deterministic `openedAt`.** `buildDiscrepancyCase` uses
  `new Date().toISOString()` (L320). Acceptable for a discrepancy *open* timestamp, but note
  it makes full-object snapshot equality non-deterministic; E2E correctly asserts on
  `discrepancyTypes` only, not the whole case.
- **O-4 — single discrepancy id per report.** `discrepancyCaseId` is
  ``takeover-discrepancy-${reportId}`` and `discrepancyCaseIds` holds at most one entry; all
  detected types collapse into one case. Confirm this matches the spec's intended
  one-case-per-report cardinality.

---

## 6. Reviewer command block (Codex2)

Run from repo root against the parent's **latest** revision (re-fetch first; anchor may have
advanced past `529e1920b`):

```bash
git fetch origin
git switch codex2/p2-corr-001 || git switch -c codex2/p2-corr-001 origin/codex2/p2-corr-001
# Focused suites
pnpm --filter @drts/api test -- roc-operations.service        # unit: P1/P2/P3
pnpm --filter @drts/api test -- e2e-p2-004-takeover-correlation # integration: E2E-P2-004
# Contract + typecheck
pnpm --filter @drts/contracts build
pnpm --filter @drts/api typecheck
```

(Use the repo's actual test runner if the filter names differ — `apps/api` is vitest-based;
the goal is: unit `roc-operations.service.test.ts` + integration `e2e-p2-004-*` green, and
contracts/api typecheck clean.)

### Reviewer risk focus (R1–R7)

- **R1 — Priority-2 nearest-candidate (O-1).** Highest risk: AC-2 is only partially met in
  the anchor. Require nearest-by-time selection + a multi-candidate fixture.
- **R2 — No silent overwrite (AC-4/O-2).** Verify every conflicting raw value survives in
  `sourceFacts`; the platform must not pick a "winner" correlation id/timestamp/trip.
- **R3 — Distinct-truth preservation (AC-5).** Verify `sourceTimestamps` and embedded source
  records are never coalesced; clone-on-read prevents external mutation of stored facts.
- **R4 — Window boundaries.** 5-min (P1) vs 10-min (P2) vs 2-min (discrepancy) windows: check
  off-by-one / `<=` vs `<` at the boundary (`withinWindow` uses `<=`), and that a P1 match is
  preferred before P2 fallback (it is: P2 only runs when P1 returns null).
- **R5 — Dependency truth (P2-TESLA-003).** Confirm the missing board row does not hide real
  upstream ingestion work; confirm contract ownership vs `P2-TESLA-001`.
- **R6 — In-memory / persistence gap (§3 GOTCHA).** Confirm no-persistence is acceptable for
  this slice's acceptance and that `rebuild*` recomputation semantics are intended.
- **R7 — Idempotency.** `record*`/`createManual*` dedupe by id and return the existing record;
  confirm duplicate ingestion cannot double-count into a case.

---

## 7. Closeout note

This packet is support-only (`NO_COMMIT_REQUIRED` eligible; `INTEGRATION_STATUS=not_applicable`
at sidecar `done`). It records no canonical change. The parent `P2-CORR-001` remains the
authoritative slice and stays `in_progress` under Codex2/Codex until its own review closes.
Handoff target for this packet: **Codex2**.
