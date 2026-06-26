# P2-GATE-001 — Acceptance Packet & Dependency Map (Sidecar Support)

> **Sidecar self-status:** `in_progress` → handoff to reviewer `Codex2`
> **Task:** P2-GATE-001-SIDECAR-ACCEPTANCE · **Owner:** Claude · **Reviewer:** Codex2
> **Parent:** P2-GATE-001 (owner Codex2, reviewer Codex, `in_progress`)
> **Helper kind:** `acceptance_packet` · **Mutates canonical:** no

This is a **support-only** artifact. It does **not** modify L1 canonical truth, the
phase2 contract surface, or the parent runtime/governance implementation. It maps the
acceptance criteria for the sandbox dispatch gate, records the present-vs-absent
implementation surface as evidence, and confirms the dependency chain is unblocked so
the parent owner can decide what to absorb into the mainline slice.

All anchors below were read from the worktree at sidecar build time
(`claude/p2-gate-001-sidecar-acceptance`, base `origin/dev`, tip `054ca4f5d`).

---

## 1. Scope of P2-GATE-001

The parent task delivers the **sandbox dispatch gate**: the decision point that
evaluates whether an autonomous-vehicle (AV) dispatch into a sandbox program is
`allow` / `allow_with_safety_operator` / `block` / `defer`, emitting a versioned,
auditable `SandboxDispatchDecision` with hard/soft reason codes.

- **Parent artifact dir:** `apps/api/src/modules/sandbox-dispatch-gate/`
- **Parent declared status:** `in_progress` (owner Codex2, reviewer Codex)
- **Sidecar role:** prepare the acceptance checklist + dependency map so the parent's
  finalization review (Codex) has a single reference for what "done" requires.

---

## 2. Dependency Map

| Dependency | Provides to gate | Status (machine truth) | Anchor evidence |
|---|---|---|---|
| **P2-GOV-002** | Sandbox governance: operating areas, routes, schedules, enrollments → drives `SANDBOX_PROGRAM_SUSPENDED`, ODD/program eligibility | `done` (owner Codex, rev Codex2) | `apps/api/src/modules/sandbox-governance/` (controller/service/repository/module); merged via PR #880 (`262d2dede`) |
| **P2-TESLA-002** | Tesla regulatory events: FSD engage/disengage, safety intervention, MRC, collision/near-miss → drives `ACTIVE_SAFETY_INCIDENT`, `MINIMAL_RISK_CONDITION_ACTIVE`, `TELEMETRY_STALE` | `done` (owner Codex2, rev Codex) | `apps/api/src/modules/tesla-regulatory-events/` (service/ports/module); `packages/shared-test-fixtures/` |
| P2-WP0 *(transitive)* | Phase2 contract foundation (`SandboxDispatchDecision`, outcomes, reason codes) | `merged_to_dev` (`a00a3bbd7`) | `packages/contracts/src/phase2-tesla-fsd-sandbox.ts` |
| P2-EVD-001 *(adjacent)* | Vehicle evidence recorder health → drives `RECORDER_UNHEALTHY` (the one wired branch) | `in_progress`/landed `e723d0f2c` (PR #877) | `apps/api/src/modules/vehicle-evidence/` |

**Dependency verdict:** both *declared* dependencies (P2-GOV-002, P2-TESLA-002) are
`done`. P2-GATE-001 is therefore **not dependency-blocked**; remaining work is
implementation breadth inside the parent slice, not an upstream wait. The evidence
recorder branch (P2-EVD-001) is the source of the single reason code currently wired
into the gate and is adjacent, not a declared dependency.

---

## 3. Present Implementation Surface (verified evidence)

Read directly from the worktree; line anchors are stable as of tip `054ca4f5d`.

### 3.1 Contract (P2-WP0 foundation, present)
`packages/contracts/src/phase2-tesla-fsd-sandbox.ts`
- `SANDBOX_DISPATCH_OUTCOMES` — 4 outcomes: `allow`, `allow_with_safety_operator`, `block`, `defer` (L314–321)
- `SANDBOX_DISPATCH_REASON_CODES` — 12 codes (L323–338): `ODD_OUT_OF_BOUNDS`, `ODD_BOUNDARY_RISK`, `PROVIDER_CAPABILITY_MISSING`, `RECORDER_UNHEALTHY`, `SAFETY_OPERATOR_REQUIRED`, `SAFETY_OPERATOR_UNAVAILABLE`, `REGULATORY_APPROVAL_MISSING`, `VEHICLE_NOT_CERTIFIED`, `TELEMETRY_STALE`, `ACTIVE_SAFETY_INCIDENT`, `MINIMAL_RISK_CONDITION_ACTIVE`, `SANDBOX_PROGRAM_SUSPENDED`
- `SandboxDispatchDecision` interface (L340–357): `decisionId`, `orderId`, `dispatchJobId`, `vehicleId`, `sandboxProgramId`, `decision`, `oddInBounds`, `hardReasonCodes[]`, `softReasonCodes[]`, `requiredSafetyOperatorId`, `policyVersion`, `evaluatedAt`

### 3.2 Module (present)
`apps/api/src/modules/sandbox-dispatch-gate/`
- `sandbox-dispatch-gate.module.ts` — imports `VehicleEvidenceModule`; provides + exports `SandboxDispatchGateService`
- `sandbox-dispatch-gate.service.ts` — `evaluateDispatch(input)`:
  - Reads `VehicleEvidenceService.getNoNewDispatchSignal(vehicleId)` (optional dep)
  - If recorder signal active → `decision: "block"`, `hardReasonCodes: ["RECORDER_UNHEALTHY"]`
  - Else → `decision: "allow"`, empty reason codes
  - `oddInBounds` hard-coded `true`; `requiredSafetyOperatorId` always `null`
  - Caches `lastDecision`; defensively clones reason-code arrays on read

### 3.3 Wiring (present)
`apps/api/src/app.module.ts` — `SandboxDispatchGateModule` imported (L57) and registered (L104), alongside `TeslaRegulatoryEventsModule`, `SandboxGovernanceModule`, `VehicleEvidenceModule`.

### 3.4 Tests (present)
- `apps/api/tests/unit/sandbox-dispatch-gate.service.test.ts` — 2 cases: blocks on required unhealthy recorder; allows when no block signal
- `apps/api/tests/integration/int-evd-001-vehicle-evidence-gate.test.ts` — gate ↔ evidence integration

---

## 4. Absent / Partial Surface (gaps the parent slice must close for full acceptance)

These are **not defects in the sidecar**; they are the delta between the present
foundation and a fully accepting dispatch gate. Listed so Codex's parent review is
explicit about what "done" still requires.

| # | Gap | Evidence of absence |
|---|---|---|
| G1 | **11 of 12 reason codes unevaluated.** Only `RECORDER_UNHEALTHY` is wired. No evaluation path for ODD bounds, provider capability, safety-operator availability, regulatory approval, certification, telemetry staleness, active incident, MRC, or program suspension. | `sandbox-dispatch-gate.service.ts` only branches on `recorderSignal?.active` |
| G2 | **2 of 4 outcomes unreachable.** Only `allow` / `block` are emitted. No `allow_with_safety_operator` or `defer` path. | `requiredSafetyOperatorId` hard-coded `null`; no operator/defer logic |
| G3 | **No governance integration.** `SANDBOX_PROGRAM_SUSPENDED` requires reading P2-GOV-002 enrollment/program state; gate does not import `SandboxGovernanceModule`. | module imports only `VehicleEvidenceModule` |
| G4 | **No regulatory-events integration.** `ACTIVE_SAFETY_INCIDENT` / `MINIMAL_RISK_CONDITION_ACTIVE` / `TELEMETRY_STALE` require P2-TESLA-002 event state; not consumed. | no `TeslaRegulatoryEvents*` import in gate |
| G5 | **No HTTP surface.** No controller/route to invoke the gate; only a service method. | no `*.controller.ts` in module dir |
| G6 | **`oddInBounds` is a constant.** Always `true`; no real ODD evaluation feeding `ODD_OUT_OF_BOUNDS` / `ODD_BOUNDARY_RISK`. | literal in both decision branches |
| G7 | **Decisions not persisted.** `lastDecision` is in-memory only; no repository/audit trail for the regulatory record the contract implies. | no repository in module dir |
| G8 | **No policy-version-driven rules.** `policyVersion` is echoed from input, not used to select a rule set. | passthrough in service |

---

## 5. Acceptance Checklist (AC-1 … AC-8)

For the **parent** P2-GATE-001 to finalize. The sidecar verifies present evidence (✅),
flags gaps (⛔), and leaves runtime checks honestly unrun (◻️ — not executed in this
sidecar; the parent owner runs build/typecheck/test on the mainline branch).

- **AC-1 — Contract conformance.** Gate returns a `SandboxDispatchDecision` matching the P2-WP0 contract shape. ✅ present (service constructs full shape).
- **AC-2 — Outcome coverage.** All 4 `SANDBOX_DISPATCH_OUTCOMES` reachable by some input. ⛔ gap G2 (`allow`/`block` only).
- **AC-3 — Reason-code coverage.** Hard/soft reason codes populated from real signals across the 12-code vocabulary. ⛔ gaps G1, G3, G4, G6 (only `RECORDER_UNHEALTHY`).
- **AC-4 — Dependency wiring.** Gate consumes P2-GOV-002 (program suspension) and P2-TESLA-002 (incident/MRC/telemetry) state. ⛔ gaps G3, G4 (deps are `done` and available — wiring is the remaining work, not an upstream block).
- **AC-5 — Recorder-block path.** Required unhealthy recorder → `block` + `RECORDER_UNHEALTHY`. ✅ present + unit-tested.
- **AC-6 — Module registration.** `SandboxDispatchGateModule` registered in `app.module.ts`. ✅ present (L104).
- **AC-7 — Audit/persistence.** Decision is durably recorded for regulatory retention. ⛔ gap G7 (in-memory `lastDecision` only).
- **AC-8 — Build / typecheck / unit / integration green on mainline.** ◻️ not run in this sidecar — parent owner executes on `apps/api`. Present tests: 1 unit spec (2 cases) + 1 integration spec.

**Summary:** 3 AC present-and-verified (AC-1, AC-5, AC-6), 4 AC blocked by implementation
breadth (AC-2, AC-3, AC-4, AC-7), 1 AC deferred to parent runtime execution (AC-8).
No AC is blocked by an unmet dependency.

---

## 6. Handoff Notes

- **Dependencies are unblocked.** P2-GOV-002 and P2-TESLA-002 are both `done`; their
  module surfaces exist in the tree. Any remaining gate work (G1–G8) is parent-slice
  implementation, not an upstream wait — the parent should not be parked on dependencies.
- **Sidecar made no canonical edits.** Only this support artifact was added.
- **Runtime checks honestly unrun here.** The sidecar did not run build/typecheck/test;
  AC-8 is the parent owner's to execute on the mainline branch.
- **Recommended parent focus order:** G3+G4 (wire the two `done` deps that unlock 4
  reason codes) → G2 (operator/defer outcomes) → G7 (persistence) → G5 (HTTP) →
  G6/G8/G1 remainder.

### Self-status
`in_progress` → **handoff** to `Codex2` for review. On approval, owner closeout is
`NO_COMMIT_REQUIRED`-eligible (support-only) with `INTEGRATION_STATUS=not_applicable`;
this packet is committed to the sidecar branch as evidence.
