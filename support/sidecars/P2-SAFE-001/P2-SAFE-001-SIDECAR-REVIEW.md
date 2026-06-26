# P2-SAFE-001 — Sidecar Review Packet & Evidence Summary

| Field | Value |
| --- | --- |
| Sidecar task | `P2-SAFE-001-SIDECAR-REVIEW` |
| Helper kind | `review_packet` |
| Parent task | `P2-SAFE-001` — Safety Operator backend: shift / checklist / takeover report / offline sync |
| Sidecar owner | Claude |
| Sidecar reviewer | Codex |
| Sidecar self-status | in_progress → handed off for review |
| Parent status (at packet build) | `review` (owner=Codex, reviewer=Claude2) |
| Parent impl commit | `8dc9972908483f3e15349c08a9c3e0cd4c2c63f5` |
| Parent impl branch | `origin/codex/p2-safe-001` |
| Mutates canonical | **No** — support artifact only |
| Integration status (this sidecar) | `not_applicable` (support-only packet; no canonical change) |

> This is a **support-only** review packet. It does not modify L1 canonical truth, the
> core contract, runtime, or governance implementation. It rebuilds the reviewer evidence
> map for parent **P2-SAFE-001** from the impl commit so the assigned reviewer (Claude2 on
> the parent; Codex on this sidecar) can review against acceptance without re-deriving it.
> The parent owner decides whether to absorb this packet into the mainline review.

---

## 0. Parent requirement (machine truth)

Spec basis (`summary_zh`): spec 07 §B, spec 06 §1.2 — device-bound identity+scope, shift
start/end, qualification check, vehicle assignment, pre-trip checklist,
`SafetyOperatorTakeoverReport` (trigger / reason / disposition / fsdResumed / bookmark),
offline queue dedup by `clientGeneratedReportId` (at-least-once, server receipt), incident /
evidence upload, trip closeout. **The takeover report must not overwrite Tesla provider events.**

Parent acceptance (single AC line, decomposed below):
> Endpoints per catalog §Safety Operator live; duplicate `clientGeneratedReportId` idempotent;
> takeover report linked to `correlationId` without overwriting provider data; offline-replay
> test passes; unit+integration green.

Dependencies: `P2-WP0`, `P2-GOV-002` (both prerequisite tasks of the parent; this sidecar
inherits the same `depends_on`).

---

## 1. Implementation scope under review

Diff `origin/dev...8dc997290` — 9 files, **+3238 / −26**:

| File | Δ | Role |
| --- | --- | --- |
| `packages/contracts/src/phase2-tesla-fsd-sandbox.ts` | +264/−26 | Safety-operator DTOs, commands, enums, receipts (contract truth) |
| `infra/migrations/V0040__phase2_safety_operator_runtime.sql` | +121 | 4 runtime tables + indexes |
| `apps/api/src/modules/safety-operator/safety-operator.service.ts` | +1495 | Business logic, idempotency, auth scope, audit |
| `apps/api/src/modules/safety-operator/safety-operator.repository.ts` | +445 | Postgres persistence (upsert + hydrate) |
| `apps/api/src/modules/safety-operator/safety-operator.controller.ts` | +300 | 14 HTTP routes under `@Controller("safety-operator")` |
| `apps/api/src/modules/safety-operator/safety-operator.module.ts` | +9/−? | DI wiring (repo + service providers) |
| `apps/api/tests/integration/int-safe-001-takeover-offline-replay.test.ts` | +292 | Offline-replay idempotency + 401 |
| `apps/api/tests/unit/safety-operator.service.test.ts` | +211 | dedup / qualification / device-scope |
| `apps/api/tests/unit/safety-operator.controller.test.ts` | +127 | API-envelope wrapping |

---

## 2. Acceptance evidence map

| AC | Requirement | Evidence | Verdict |
| --- | --- | --- | --- |
| **AC-1** | Endpoints per catalog §Safety Operator live | `safety-operator.controller.ts` — 14 routes: `GET qualification` (L37), `GET/POST assignments` (L60/L82), `POST assignments/:id/engage` (L98) + `/release` (L116), `GET shifts` (L134), `POST shifts/start` (L154) + `/:id/end` (L166), `GET/POST pre-trip-checklists` (L184/L206), `GET/POST takeover-reports` (L222/L247), `GET/POST trip-closeouts` (L263/L285) | ✅ present |
| **AC-2** | Duplicate `clientGeneratedReportId` idempotent | Service `submitTakeoverReport` L767: in-memory dedup `takeoverReports.find(r => r.clientGeneratedReportId === …)` L782; on hit returns `cloneTakeoverReport(existing)` + `buildReceipt(existing, true)` L793-794 (same `reportId`, same `serverReceivedAt`, `duplicate=true`). DB backstop: `client_generated_report_id varchar(200) NOT NULL UNIQUE` (V0040 L55) + repo `ON CONFLICT (client_generated_report_id) DO UPDATE … RETURNING record` L246-248 | ✅ present (see G1 for multi-instance edge) |
| **AC-3** | Takeover report linked to `correlationId` **without overwriting provider data** | `correlation_id varchar(200) NOT NULL` stored on own table (V0040 L62); service writes **only** `av_sandbox.safety_operator_*` tables — grep of service shows **zero** writes to provider / `raw_event` / Tesla tables. `correlationId` is a stored link (L832-835), never a mutation of provider state. Existing-report path **returns the original body unchanged** (L785-795) — no overwrite even on replay | ✅ provider isolation confirmed |
| **AC-4** | Offline-replay test passes | `int-safe-001-takeover-offline-replay.test.ts` L140 "dedupes replayed takeover uploads and preserves the original report body": first POST `duplicate=false` (L253), replay of same `clientGeneratedReportId` with **different** disposition/notes → `duplicate=true` (L254), same `reportId` (L255), same `serverReceivedAt` (L258), original body preserved: `disposition="continued_manual"` (L261), `fsdResumed=false` (L262), `notes="Original takeover report."` (L263), list returns exactly **1** item (L264) | ✅ proves AC-2 + AC-3 |
| **AC-5** | Device-bound identity + scope | `assertAccess` → anon ⇒ `401 AUTH_REQUIRED`; realm-aware (system/ops/driver) scope gating (`driver:read`/`driver:write`). `assertWriteAccess` ⇒ driver `actorId` must equal `safetyOperatorId` else `403 SAFETY_OPERATOR_IDENTITY_MISMATCH`. `resolveRequestedSafetyOperatorId` enforces read-scope to own `actorId`. Shift mutations re-bind `deviceId` (`requireRequired(command.deviceId,…)` L399/L504, end-shift verifies `shift.deviceId === deviceId` L512). Integration L277 "rejects anonymous … requests" ⇒ 401 | ✅ present |
| **AC-6** | Shift start/end + vehicle assignment + qualification check | `startShift` L386 / `endShift` L493 (status `active`/`completed`/`abandoned`); `createAssignment`/`engageAssignment`/`releaseAssignment` L128/L239/L299; `checkQualification` L570 → `SafetyOperatorQualificationCheckResult` (`qualified`, `matchedQualificationIds`, `activeAssignmentId`, `reasons`). Unit L151 "reports qualification status and active assignment linkage" | ✅ present |
| **AC-7** | Pre-trip checklist + incident/evidence + trip closeout | `submitPreTripChecklist` L642 (10 fixed item keys, `allPassed`, `blockerCodes`); takeover + closeout carry `incidentId` + `evidenceArtifactIds[]` (V0040 L68-69, L106-107); `createTripCloseout` L916 with `takeoverReportIds[]` linkage | ✅ present |
| **AC-8** | unit + integration green | 3 test files / reported 6 tests (unit service ×3 L46/L151/L186, unit controller ×1 L6, integration ×2 L140/L277). Owner `next` note records: Prettier + ESLint on touched files, `tsc` on contracts + api, Vitest green incl. offline replay | ⚠️ reviewer to re-run (see G3) |

---

## 3. Contract surface (review focus)

New exported types in `phase2-tesla-fsd-sandbox.ts` (L473+):

- **Assignment**: `CreateSafetyOperatorAssignmentCommand`, `Engage…`, `Release…`.
- **Shift**: `SAFETY_OPERATOR_SHIFT_STATUSES` (`active|completed|abandoned`), `SafetyOperatorShift`, `Start…Command`, `End…Command`.
- **Qualification**: `…QualificationCheckCommand` / `…Result`.
- **Checklist**: `SAFETY_OPERATOR_CHECKLIST_ITEM_KEYS` (10 keys), `…ITEM_STATUSES` (`pass|fail|na`), `SafetyOperatorPreTripChecklist`, `Submit…Command`.
- **Takeover**: `…TRIGGERS` (5), `…REASON_CODES` (10), `…DISPOSITIONS` (5), `SafetyOperatorTakeoverReport`, `Submit…Command`, `…Receipt` (`duplicate`, `serverReceivedAt`), `…Result`.
- **Closeout**: `…TRIP_CLOSEOUT_STATUSES` (4), `SafetyOperatorTripCloseout`, `Create…Command`.

Reviewer note: the diff also reflows two unrelated existing const blocks
(`SANDBOX_HOLIDAY_POLICIES` L98-103, `SandboxDispatchOutcome` L312-313) to single-line —
pure Prettier cosmetic, no semantic change.

---

## 4. Data model — `V0040__phase2_safety_operator_runtime.sql`

4 tables under `av_sandbox`, all `CREATE TABLE IF NOT EXISTS`, each with a `record jsonb NOT NULL`
full-snapshot column (source of truth for hydration) + typed columns for indexing:

- `safety_operator_shifts` (PK `shift_id`) — idx on `(operator, started_at)`, `(device, started_at)`.
- `safety_operator_pre_trip_checklists` (PK `checklist_id`) — idx on `(shift, completed_at)`, `(vehicle, completed_at)`.
- `safety_operator_takeover_reports` (PK `report_id`, **`client_generated_report_id … UNIQUE`** L55) — idx on operator / correlation / vehicle.
- `safety_operator_trip_closeouts` (PK `closeout_id`) — idx on operator / vehicle.

No FK constraints to provider/order tables — links (`order_id`, `correlation_id`, `incident_id`,
`assignment_id`) are loose string/uuid references, consistent with provider-data isolation (AC-3).

---

## 5. Persistence / durability semantics

`SafetyOperatorService` keeps in-memory arrays (`assignments`, `shifts`, `checklists`,
`takeoverReports`, `tripCloseouts`) and dual-writes through an **`@Optional()`** injected
`SafetyOperatorRepository` (constructor L78-80). The module **does** register the repository as a
provider (`module.ts` providers: `[SafetyOperatorRepository, SafetyOperatorService]`), so
persistence is **on by default**; the `@Optional()` is the unit-test fallback (pure in-memory).

- On init the service `loadState()`/`hydrateState()` (L91/L1007) rebuilds in-memory arrays from DB
  → dedup survives **process restart**.
- Each write upserts (`ON CONFLICT (<pk>) DO UPDATE`) and re-reads the `record` jsonb (L246-248,
  L401), so the DB row is canonical and the in-memory clone is refreshed from `persisted ?? local`.

---

## 6. Reviewer focus (R1–R7)

- **R1 — Idempotency contract.** Confirm single-instance replay returns `duplicate=true`, identical
  `reportId` + `serverReceivedAt`, and the **original** body (integration test L253-264 asserts this).
- **R2 — Provider isolation.** Confirm no write path touches Tesla provider / raw-event tables; the
  takeover row only *stores* `correlationId`. (Grep clean in this packet.)
- **R3 — Device/identity scope.** Confirm 401 anon, 403 driver-acts-as-other-operator, ops/system
  realm gating, and that end-shift rejects a mismatched `deviceId` (L512-520).
- **R4 — Enum ↔ DB.** Contract enums (trigger/reason/disposition/status) are stored as free `text`
  columns in V0040 (no DB CHECK). Confirm whether enum enforcement at the contract/DTO layer is
  sufficient or a DB CHECK is wanted (see G4).
- **R5 — Audit trail.** Each mutation calls `recordAudit(...)` (e.g. `takeover_report_submit`
  L867); confirm actor/tenant derivation and that audit is best-effort vs. blocking.
- **R6 — Migration apply.** See G1 — confirm `scripts/db-apply.sh` ordering/keying tolerates a 4th
  `V0040` prefix on `dev`, or require renumber to `V0042`.
- **R7 — Test green re-run.** Re-run Vitest (3 files) + `tsc` on contracts + api against current
  `dev` before approve (owner's green was on the impl branch base, see G3).

---

## 7. Gaps & gotchas (G1–G4)

- **G1 — V0040 migration-number collision (highest integration risk).** `origin/dev` already carries
  **three** `V0040__*` files (`phase2_decision_packet_addendum`, `phase2_evidence_access_logs`,
  `tesla_regulatory_raw_event_ingress`) **plus `V0041__tesla_provider_telemetry_health`**. The impl
  branch was cut from an older `dev` and adds a **fourth** `V0040__phase2_safety_operator_runtime`.
  All four are independent `CREATE TABLE IF NOT EXISTS` with distinct table names, so there is no
  DDL conflict, but the duplicated version prefix is an ordering/hygiene smell. **Recommendation:**
  integrator should renumber to `V0042__phase2_safety_operator_runtime` on merge, or explicitly
  confirm `db-apply.sh` keys applied migrations by filename (not version) and tolerates duplicates.
  (This is a recognized fleet-wide Phase-2 parallel-branch pattern, not novel to this task.)
- **G2 — Multi-instance dedup edge.** Dedup is an in-memory `Array.find` (L782), not a DB lookup.
  In a horizontally-scaled deployment (>1 API instance), a replay that lands on an instance whose
  cache never saw the first write will **miss** the in-memory check, build a new report, then hit
  the DB `ON CONFLICT DO UPDATE … RETURNING record` — which correctly returns the **original** body
  (so AC-3 "no overwrite" still holds), but the response is built with `buildReceipt(stored, false)`
  (L879) ⇒ `duplicate=false` even though it was a replay. The `serverReceivedAt`/`reportId` returned
  are the **original** (from the DB record), so only the advisory `duplicate` flag is wrong, and only
  on the first cross-instance replay. Single-instance and post-restart (hydrated) paths are correct.
  Reviewer to decide whether `duplicate` must be authoritative across instances.
- **G3 — CI/test green is branch-local, not asserted on `dev`.** Owner's `next` note records green
  checks on `origin/codex/p2-safe-001 @ 8dc997290`, whose `dev` base predates the three landed
  V0040s + V0041. Re-run unit+integration after rebase/renumber onto current `dev` before approve.
- **G4 — Enum columns are free `text` in DDL.** `status`, `trigger`, `reason_code`, `disposition`,
  `closeout_status` are `text` with no DB `CHECK`. Enforcement relies on the contract/DTO layer.
  Acceptable if DTO validation is guaranteed on every write path; flag if a defense-in-depth DB
  CHECK is desired (consistent with other Phase-2 tables that use enum CHECKs).

---

## 8. Reviewer handoff

- **Parent verdict basis:** AC-1..AC-7 have concrete code+test evidence; AC-8 pending a re-run on
  current `dev` (G3). No provider-data overwrite path found (AC-3 strong).
- **Blocking items for integrator (not the code reviewer):** G1 (renumber V0040→V0042) before
  merge-to-dev.
- **Reviewer to weigh in on:** G2 (cross-instance `duplicate` flag), G4 (enum CHECK defense-in-depth).
- This sidecar makes **no** canonical change; closeout uses `INTEGRATION_STATUS=not_applicable`.
  Re-dispatch of this packet is redundant unless the reviewer reopens or the parent impl commit moves.
