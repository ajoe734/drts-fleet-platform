# Phase 1 UI Implementation Wave — Planning Packet (2026-05-25)

**Date:** 2026-05-25
**Mode:** `supervisor_managed_execution`
**Wave name:** `phase1-ui-implementation-wave-202605`
**Planning author lane:** Claude

**Source-of-truth authority** (read these before claiming any task in this wave):

- `docs/05-ui/system-design-answers-all-apps-20260524.md` — system design裁決 for all UI runtime behavior (75 Q&A)
- `docs/05-ui/drts-design-canvas/` — v0.6 visual design canvas (READ `DRTS Index.html` first)
- `docs/05-ui/{ops-console,platform-admin,tenant-console,driver-app}-design-handoff-packet-20260525.md` — per-app functional + data + API contracts
- `packages/contracts/src/ui-runtime.ts` — 12 UI runtime contracts (PR #283)

**Predecessor PRs (closed onto `origin/dev`):**

- PR #269 `OPS-CANVAS-SHELL-001` — emergency ops-console shell unification (kept; baseline)
- PR #280 `SYS-DESIGN-Q-001` — 75 system-design questions
- PR #281 `SYS-DESIGN-A-001` — 75 system-design answers
- PR #282 `LAND-DESIGN-CANVAS-V06` — visual design canvas + 4 packet updates
- PR #283 `CONTRACTS-UI-RT-001` — 12 UI runtime contract types

## 1. Purpose

Take the UI from "spec + answers + canvas + contract types exist" to "production code emits the contracts and the apps render the design". This wave is the **engineering execution** between the contract layer and the live deployments.

This is NOT another redesign. The design has been delivered. This wave wires it through.

## 2. Wave Structure

Three layers, executed with internal parallelism:

```
Layer 1 (BE) — Backend contract emission (~12 tasks)
  ├── Each module gains UiRefreshMetadata + EmptyStateEnvelope + availableActions
  ├── New cross-cutting modules: notifications, search, integration-readiness, tenant rollout state
  └── ActionReceipt response wrapper standardized across write endpoints

Layer 2 (CL) — api-client wrappers (~5 tasks)
  ├── Methods wrapping new backend endpoints
  └── Type-safe consumers of the new contract envelopes

Layer 3 (FE) — Per-app rebuild (~4 large tasks, subdivided)
  ├── Tokens + shared `@drts/ui-web` update (paired with first app)
  └── Per-app screen conversions, page by page
```

**Parallelism rule:** Layer 1 tasks can run concurrently across modules. Layer 2 unlocks per Layer 1 task as it completes. Layer 3 (per app) can start when the relevant Layer 1 contracts are emitted by backend stubs, even if backend is not fully wired — frontend uses stubs / fixtures until backend lands.

## 3. Worker rules

Every worker on this wave must:

1. Read the four authority documents listed at the top before claiming.
2. Refer to the design canvas (`drts-design-canvas/`) for visual decisions. **Do not invent visuals.** If the canvas does not answer something, raise a question — do not improvise.
3. Refer to the packets for behavior / data / API contracts. **Do not invent fields.** If the packet does not answer, raise a question.
4. Refer to the contracts file (`packages/contracts/src/ui-runtime.ts`) for type shapes. Use these types directly — do not redefine.
5. Per-app frontend rebuild tasks land on a dedicated branch per app, **one app per PR** — no cross-app megapatches. Backend tasks land per task / per module.
6. Each PR carries `LLM-Agent`, `Task-ID`, `Reviewer` trailers per [`docs/ops/branch-strategy.md`](../ops/branch-strategy.md) §11.
7. **No backwards-compat shims, no stranded feature branches** — the user explicitly rejected `feat/claude2-ui-redesign-foundation` as the wrong pattern (see [`docs/05-ui/system-design-answers-all-apps-20260524.md`](../05-ui/system-design-answers-all-apps-20260524.md) preamble and the conversation history).

## 4. Task Catalog

Task IDs use the `UI-BE-NNN`, `UI-CL-NNN`, `UI-FE-{OPS,ADM,TEN,DRV}-NNN` schema for this wave.

### Layer 1 — Backend (12 tasks)

| ID            | Title                                                                                                             | Owner suggest | Reviewer suggest | Depends on | Acceptance                                                                                                                                       |
| ------------- | ----------------------------------------------------------------------------------------------------------------- | ------------- | ---------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| UI-BE-001     | `ActionReceipt` response wrapper utility + audit-id capture pattern                                               | Codex         | Claude2          | none       | Shared utility in `apps/api/src/common/` returns `ActionReceipt`; one pilot module adopts; vitest covers happy + failure                         |
| UI-BE-002     | `UiHealthEnvelope` emitted on `/api/health`; degraded-service taxonomy                                            | Gemini        | Codex            | none       | `/api/health` returns `UiHealthEnvelope`; per-dependency `degradedServices[]`; vitest covers 3 states                                            |
| UI-BE-003     | Notification module (UserNotificationRecord storage + endpoints + event emitters)                                 | Codex2        | Claude           | UI-BE-001  | `GET /api/notifications`, `POST .../{id}/read`, `POST .../read-bulk`; per-realm filtering; vitest covers 5 event types                           |
| UI-BE-004-OPS | Search endpoint for ops-console (orders / dispatch / drivers / vehicles / complaints / incidents)                 | Codex         | Codex2           | none       | `GET /api/ops/search?q=…&types=…`; result categories; vitest covers cross-entity + category grouping                                             |
| UI-BE-004-ADM | Search endpoint for platform-admin (tenants / partners / users / adapter registry / audit)                        | Codex2        | Gemini           | none       | `GET /api/platform/search?q=…&types=…`                                                                                                           |
| UI-BE-004-TEN | Search endpoint for tenant-console (bookings / passengers / addresses / cost-centers / invoices)                  | Gemini2       | Codex            | none       | `GET /api/tenant/search?q=…&types=…`                                                                                                             |
| UI-BE-005     | Tenant `/api/tenant/integration-governance/readiness` aggregated endpoint                                         | Claude2       | Codex2           | none       | Returns `TenantIntegrationReadinessSummary`; one query (no orchestration); vitest covers 4 sub-system states                                     |
| UI-BE-006     | Tenant rollout state machine module (`TenantRolloutStateMachineRecord` + transitions)                             | Codex2        | Claude           | UI-BE-001  | State storage + transition handlers; `availableActions[]` per stage / gate; vitest covers all 4 stages × 4 gate states                           |
| UI-BE-007-DSP | Per-module: dispatch module read-model wrapping (`UiRefreshMetadata` + `EmptyStateEnvelope` + `availableActions`) | Codex         | Codex2           | UI-BE-001  | Owned + forwarded queue endpoints return envelopes; `availableActions[]` per row; 6 EmptyReason coverage; vitest                                 |
| UI-BE-007-CMP | Per-module: complaint module read-model wrapping + backend-computed `slaStatus`                                   | Codex2        | Codex            | UI-BE-001  | Q-OPS13: `slaStatus`/`slaDueAt`/`slaBreachedAt` on `ComplaintCaseRecord`; vitest                                                                 |
| UI-BE-007-INC | Per-module: incident module read-model wrapping + DriverMatchingSuppression integration                           | Codex         | Claude           | UI-BE-001  | Q-OPS09: `DriverMatchingSuppression` linked to incident; 24h TTL default + ops_manager extension; vitest                                         |
| UI-BE-007-BKG | Per-module: booking module read-model wrapping + Q-TEN04 command pattern + `editableUntil`                        | Claude2       | Codex2           | UI-BE-001  | Q-TEN04: `commands/{create,update,cancel}` with `accepted+pending`; Q-TEN05: `editableUntil` + `readOnlyReasonCode` + `availableActions`; vitest |
| UI-BE-008     | `DriverOpsInstruction` module (ops issues, driver receives via push + inbox)                                      | Gemini        | Codex2           | UI-BE-003  | Storage + ops-side endpoint + driver-side read; vitest covers expiresAt handling                                                                 |

### Layer 2 — api-client (5 tasks)

| ID        | Title                                                                                      | Owner suggest | Reviewer suggest | Depends on                                  | Acceptance                                                                                                       |
| --------- | ------------------------------------------------------------------------------------------ | ------------- | ---------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| UI-CL-001 | Wrap `UiHealthEnvelope` + `UiRefreshMetadata` types into generic client response unwrapper | Claude2       | Codex            | UI-BE-002                                   | Generic `unwrap<T>` returns `{ data: T; refresh: UiRefreshMetadata; health: UiHealthEnvelope }`; typecheck clean |
| UI-CL-002 | Notification methods (`listNotifications`, `markRead`, `markBulkRead`)                     | Codex         | Codex2           | UI-BE-003                                   | Methods in `packages/api-client/src/`; typecheck clean                                                           |
| UI-CL-003 | Search methods per realm (`searchOps`, `searchPlatform`, `searchTenant`)                   | Codex2        | Gemini2          | UI-BE-004-OPS, UI-BE-004-ADM, UI-BE-004-TEN | Per-realm method; typecheck clean                                                                                |
| UI-CL-004 | Tenant integration-governance readiness method (`getTenantIntegrationReadiness`)           | Gemini2       | Codex            | UI-BE-005                                   | Single method; typecheck clean                                                                                   |
| UI-CL-005 | Driver-side methods (`listOpsInstructions`, `acknowledgeOpsInstruction`)                   | Gemini        | Codex2           | UI-BE-008                                   | Methods callable from `apps/driver-app`; typecheck clean                                                         |

### Layer 3 — Frontend rebuild (4 apps, subdivided)

Each app rebuild is large enough that it should be split into per-section sub-tasks during its kickoff. The parent task ID below is the wave-level umbrella; sub-tasks (e.g. `UI-FE-OPS-001-DSP` for dispatch board) are defined when the umbrella task starts.

| ID           | Title                                                                                                    | Owner suggest                    | Reviewer suggest | Depends on                                                                      | Acceptance                                                                                                                                        |
| ------------ | -------------------------------------------------------------------------------------------------------- | -------------------------------- | ---------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI-FE-TOKENS | New `@drts/ui-web` design tokens + primitives **paired with UI-FE-OPS umbrella** (lands in the same PR)  | Claude2 (paired)                 | Codex            | UI-BE-007-DSP                                                                   | Token export from `@drts/ui-web`; reused by ops first; canvas colors land coherently                                                              |
| UI-FE-OPS    | Ops Console screen rebuild against design canvas + new contracts                                         | Claude2 (paired w/ UI-FE-TOKENS) | Codex2           | UI-BE-007-DSP, UI-BE-007-CMP, UI-BE-007-INC, UI-BE-003, UI-BE-004-OPS, UI-CL-\* | All 20 routes per packet match canvas `Ops Console.html`; `availableActions` driven; 6 EmptyReason; refresh tier per page; canvas wins for visual |
| UI-FE-ADM    | Platform Admin screen rebuild against design canvas + new contracts                                      | Codex2                           | Claude2          | UI-BE-006, UI-BE-007-_, UI-BE-002, UI-CL-_                                      | All 18 routes per packet match canvas `Platform Admin.html`; plaintext-once secret modal; pricing version model; reimbursement state machine      |
| UI-FE-TEN    | Tenant Console screen rebuild (largest — 9 NEW routes per Q-TEN02) against design canvas + new contracts | Codex                            | Claude           | UI-BE-005, UI-BE-007-BKG, UI-CL-\*                                              | All 20 routes per packet match canvas `Tenant Console.html`; accepted+pending state; cross-actor audit; aggregated readiness page                 |
| UI-FE-DRV    | Driver App screen rebuild on independent design system (cannot share `@drts/ui-web` per Q-X04)           | Codex2 (driver-app sub-lane)     | Claude2          | UI-BE-007-DSP, UI-BE-008, UI-CL-002, UI-CL-005                                  | All 9 Expo routes match canvas `Driver App.html`; press-and-hold 2s SOS; persistent SOS ack; 4 reauth mechanisms                                  |

## 5. Dependency Graph (visual)

```
UI-BE-001 (ActionReceipt) ────┬──> UI-BE-003 (notifications)
                              ├──> UI-BE-006 (rollout state machine)
                              ├──> UI-BE-007-DSP
                              ├──> UI-BE-007-CMP
                              ├──> UI-BE-007-INC
                              └──> UI-BE-007-BKG
UI-BE-002 (health) ───────────────> UI-CL-001
UI-BE-003 (notifications) ────┬──> UI-CL-002
                              └──> UI-BE-008 (DriverOpsInstruction) ──> UI-CL-005
UI-BE-004-{OPS,ADM,TEN} ──────────> UI-CL-003
UI-BE-005 (tenant readiness) ─────> UI-CL-004
UI-BE-006 (rollout) ──────────────> UI-FE-ADM
UI-BE-007-DSP ──────┬──> UI-FE-TOKENS (paired) ──┐
                    │                              │
                    └──> UI-FE-OPS  ───────────────┤
UI-BE-007-CMP ──────────> UI-FE-OPS  ─────────────┤  All FE
UI-BE-007-INC ──────────> UI-FE-OPS  ─────────────┤  apps land
UI-BE-007-BKG ──────────> UI-FE-TEN               │  independently
UI-BE-008 ──────────────> UI-FE-DRV               │
UI-CL-* ────────────────> UI-FE-* (consumed)      │
```

## 6. Suggested wave order (rough sprint plan)

| Sprint week | Layer-1 in flight                                                                           | Layer-2 in flight    | Layer-3 in flight                                         |
| ----------- | ------------------------------------------------------------------------------------------- | -------------------- | --------------------------------------------------------- |
| Week 1      | UI-BE-001, UI-BE-002, UI-BE-005                                                             | (queued)             | (queued)                                                  |
| Week 2      | UI-BE-003, UI-BE-006, UI-BE-007-DSP, UI-BE-007-CMP, UI-BE-007-INC, UI-BE-007-BKG, UI-BE-008 | UI-CL-001, UI-CL-004 | (queued)                                                  |
| Week 3      | UI-BE-004-{OPS,ADM,TEN}                                                                     | UI-CL-002, UI-CL-005 | UI-FE-TOKENS + UI-FE-OPS (paired, start)                  |
| Week 4      | (Layer 1 wrap)                                                                              | UI-CL-003            | UI-FE-OPS finish; UI-FE-ADM + UI-FE-TEN + UI-FE-DRV start |
| Week 5–6    | —                                                                                           | —                    | UI-FE-ADM + UI-FE-TEN + UI-FE-DRV finish                  |

This is a sketch — actual workload depends on lane availability + reviewer capacity. The supervisor's availability-first scheduler will adjust.

## 7. Acceptance per layer

### Layer 1 (backend)

- `pnpm --filter @drts/api typecheck` clean
- `pnpm --filter @drts/api test` covers each new/changed handler (vitest)
- One pilot consumer demonstrates the contract is emitted (e.g. for UI-BE-001, the pilot module's response is validated against `ActionReceipt`)
- No breakage of existing endpoints (regression covered by existing vitest)

### Layer 2 (api-client)

- `pnpm --filter @drts/api-client typecheck` clean
- `pnpm --filter @drts/api-client test` (if tests exist for the touched module)
- Downstream apps' typecheck clean (no broken imports)

### Layer 3 (frontend rebuild)

- `pnpm --filter @drts/{app}-web typecheck` clean
- `pnpm --filter @drts/{app}-web build` clean
- `pnpm --filter @drts/{app}-web test` covers screen-level behavior (vitest where applicable)
- Local smoke test confirms all `EmptyReason` states render distinct treatments
- Per-page visual matches the corresponding canvas artboard (designer review optional but available)
- `pnpm --filter @drts/ui-web build-storybook` clean (if storybook stories are touched)

## 8. Out of scope for this wave

- **partner-booking-web rebuild** — Q-TEN03 deferral; needs its own packet when that app is in scope
- **WebSocket / unified shell / global cross-app search** — Phase 2 per system-design-answers §9
- **AV runtime UI** — Phase 2
- **Backend module re-architecture** — Layer 1 tasks adopt the contracts on existing modules; no module rewrites

## 9. Process notes for the supervisor

- When materializing this wave into actual task-brief files + `ai-status.json` entries, create one file per task ID under `.orchestrator/task-briefs/UI-*-001.md`.
- Task-brief template fields: title / status / owner / reviewer / planning_ref / depends_on / artifacts / acceptance / next.
- This planning doc is `planning_ref` for every task in the wave.
- Reviewer round-robin is recommended (no single agent reviewing all of one lane).
- Sub-task expansion (e.g. UI-FE-OPS into per-page sub-tasks) happens during the umbrella task's kickoff brief, NOT in this planning doc.

## 10. Open questions for the user before materializing

1. Are the owner suggestions reasonable, or should specific lanes be assigned different load? (`feedback_agent_workload_ratio.md` lists 10:10:5:5:35:35:5 — this plan tries to use Codex/Codex2 sub-lanes heavily but may need rebalancing.)
2. Should the wave be materialized **all at once** (all ~21 task briefs created and registered) or **in phases** (e.g. Layer 1 first; Layer 2-3 once Layer 1 is partially done)?
3. Should the Layer-3 umbrella tasks be subdivided **now** (so each per-page sub-task is a registered atom) or **on kickoff** (so the umbrella worker decides the split)?
4. For UI-FE-TOKENS pairing with UI-FE-OPS: do you want them as ONE PR (single commit lineage) or TWO PRs in lock-step? Single PR is more coherent; two PRs are easier to review.
5. Wave timing: any external blockers (production deploy rail readiness, backend infra, etc.) that should defer Layer 1 start?

---

## Document control

- Author: Claude (`UI-IMPL-WAVE-PLAN-001`)
- Status: **proposal — awaiting user review before materialization**
- Once approved, follow-up PR(s) register the task briefs + `ai-status.json` entries; supervisor then dispatches.
