# DRV-SVC-001-SIDECAR-REVIEW

**Support-only review packet for `DRV-SVC-001`**

- Sidecar task: `DRV-SVC-001-SIDECAR-REVIEW`
- Sidecar owner: `Claude2`
- Sidecar reviewer: `Codex2`
- Sidecar kind: `review_packet` (`helper_parent: DRV-SVC-001`, `mutates_canonical: false`)
- Scope guardrail: support-only artifact; **no** edits to canonical truth, runtime/app code, tests, or the parent task's machine state.
- Parent task: `DRV-SVC-001` — *Driver App: service-aware task card + grouped earnings*
- Parent owner / reviewer: `Codex2` / `Gemini`
- Parent status at packet time: **`review`** (`last_update: 2026-06-05T03:52:26Z`) — awaiting parent reviewer `Gemini`; not yet `review_approved`, not yet `done`.

> This packet curates evidence to make the parent reviewer's (`Gemini`) job faster and to give the parent owner (`Codex2`) a closeout checklist. It does **not** approve, pre-sign, or alter the parent task. Binding review authority for `DRV-SVC-001` stays with `Gemini`.

## 1) Machine-Truth Snapshot

Pulled from `ai-status.json` (via `scripts/ai-status.sh show DRV-SVC-001`) and the parent branch:

- Parent `status`: `review`; `owner`: `Codex2`; `reviewer`: `Gemini`; `phase`: `phase1-svc-fleet-tenantops-20260604`.
- `depends_on`: `P1NEW-WP0`, `BE-SVC-003`.
- `artifacts`: `apps/driver-app/`.
- `acceptance` (single canonical bullet): *"Task card is service/platform/fleet aware; earnings grouped views work; bilingual; typecheck+build pass"*.
- Parent work currently lives as **local** commit `34a036f6deb605a2134d32430bb0d62cfa745df2` — `DRV-SVC-001: add service-aware driver task views` — on branch `codex2/drv-svc-001` (worktree `.artifacts/worktrees/auto/codex2-drv-svc-001`).
- **Not yet pushed.** `git branch -r --contains 34a036f6` returns nothing; `origin/codex2/drv-svc-001` does not exist. There is no `commit_hash` / `push_remote` / `push_branch` recorded on the parent task because it is still pre-closeout. Implied integration status: pre-`branch_pushed`.
- Branch base: `34a036f6`'s merge-base with `origin/dev` is `1a5f8b86`. `origin/dev` has since advanced one commit to `63d2ba58`, so the parent branch is **1 commit behind `origin/dev`** and is *not* currently a clean descendant of the dev tip. A rebase onto `origin/dev` will be needed before merge (integration concern, not a code defect).

This sidecar does not re-open, re-classify, or contradict parent machine truth.

## 2) Change Inventory & Diff Scope

`git diff --stat 1a5f8b86...codex2/drv-svc-001` (parent vs merge-base):

| File | Change | Notes |
| ---- | ------ | ----- |
| `apps/driver-app/lib/driver-service-views.ts` | **+500 (new file)** | Pure helper module: `buildTaskCardDetailItems`, `buildGroupedEarningsItems`, plus label/money helpers. No React, no I/O — directly unit-testable. |
| `apps/driver-app/app/earnings.tsx` | +311 / −26 | Adds group-by view (`platform`/`service_product`/`tenant`/`fleet`/`total`), `GroupedBreakdownRow`, per-order metadata fetch, group selector strip. |
| `apps/driver-app/app/jobs.tsx` | +42 | Task card now renders a `buildTaskCardDetailItems`-driven detail grid + supporting styles. |
| `apps/driver-app/tests/unit/driver-service-views.test.ts` | **+211 (new file)** | 3 unit tests over the new helper (task-card details; group-by service_product; group-by total). |

Total: **4 files, +1038 / −26**.

Reviewer time-saver: a meaningful slice of the `earnings.tsx` diff is **pure Prettier reflow** (multiline `<Ionicons … />` icon props collapsed onto single lines, `getHeroContext` signature wrap, a `StatementRow` line wrap). These are non-semantic — focus review attention on `GroupedBreakdownRow`, the per-order fetch block, and the group-selector wiring.

## 3) Reviewer Handoff Trail

Reconstructed from `ai-activity-log.jsonl` (entries scoped to `DRV-SVC-001`):

- `2026-06-04T15:17:15Z` — assignment: `DRV-SVC-001` → owner `Codex2`, reviewer `Gemini`.
- `2026-06-05T03:40:29Z`–`03:40:58Z` — supervisor wake-up `owned_ready_dispatch`; worker started; "Implement service-aware task card and grouped earnings in driver app".
- `2026-06-05T03:52:26Z` — `Codex2` **handoff to `Gemini`** (status → `review`): *"Completed service-aware driver task cards and grouped earnings in driver app. Verified: `pnpm --filter @drts/driver-app typecheck`, `pnpm --filter @drts/driver-app build`, `pnpm --filter @drts/driver-app exec vitest run tests/unit/driver-service-views.test.ts`. Note: full driver-app test suite still has pre-existing `@drts/ui-tokens` resolution failures in unrelated tests."*
- `2026-06-05T03:52:29Z` — background worker superseded/exited after advancing the task to `review`.

No `review_approved` event from `Gemini` exists yet. The owner's self-reported verification (typecheck + build + targeted vitest) is the only verification on record from the parent lane; it is corroborated independently in §5.

## 4) Acceptance Criteria Mapping

The canonical acceptance is a single compound bullet. Decomposed against the SD intent in the parent brief (`summary_zh`, citing `docs/02-architecture/phase1_final_sd_for_dev_team_20260604.md` §5.1/§5.3):

| Sub-claim | Status | Evidence | Notes |
| --------- | ------ | -------- | ----- |
| Task card **service / platform / fleet aware** | Satisfied (UI) | `buildTaskCardDetailItems` (`driver-service-views.ts`) emits service / source / tenant / program / vehicle eligibility / authority / fleet / (reservation) / (proof) detail items; rendered by `jobs.tsx:1062` detail grid. | Service-aware fields are read via a **local** `ServiceAwareTaskView` augmentation (see §6.1), not yet from the canonical contract → depends on `BE-SVC-003`. |
| **Earnings grouped views work** | Satisfied (UI, client-side) | `buildGroupedEarningsItems` supports `platform`/`service_product`/`tenant`/`fleet`/`total`; group selector + `GroupedBreakdownRow` in `earnings.tsx`. | Grouping is **client-side** over statements + per-order metadata, *not* the SD-named `/api/driver/earnings?groupBy=…` server endpoint (see §6.2). |
| **Bilingual** | Partially / by-construction | Labels emitted as inline `"中文 / English"` (e.g. `服務 / Service`), `formatBilingual`, and `driverStrings.*` for existing copy. | The helper's `t()`/`locale` param defaults to `zh` and is **not threaded from the screen** — bilingual is achieved by concatenated strings, not the app i18n/locale-switch pipeline (see §6.3). |
| **typecheck passes** | Confirmed | Independently re-run — see §5. | EXIT=0 at owner tip. |
| **build passes** | Owner-reported | Owner recorded `pnpm --filter @drts/driver-app build`; not independently re-run in this packet (fresh-worktree build-dep ordering risk). | Recommend `Gemini` re-run at owner tip. |

## 5) Independent Verification (this sidecar)

Run by `Claude2` in the parent owner's worktree (`.artifacts/worktrees/auto/codex2-drv-svc-001`, HEAD = `34a036f6`, exact parent tip — confirmed via `git log -1`). Read-only with respect to source; no files modified.

- `pnpm --filter @drts/driver-app exec vitest run tests/unit/driver-service-views.test.ts` → **Test Files 1 passed (1), Tests 3 passed (3)**, ~257ms.
- `pnpm --filter @drts/driver-app typecheck` (`tsc --noEmit`) → **EXIT=0** (clean).

This corroborates the owner's typecheck + targeted-test claims at the exact reviewed commit (mitigates "green over stale/foreign worktree" risk). `build` was **not** re-run here. The parent owner's note about pre-existing `@drts/ui-tokens` failures in *unrelated* driver-app tests is plausible and out of scope for this slice, but the parent reviewer should confirm it is genuinely pre-existing (not introduced) before approving.

## 6) Risk / Evidence Notes for the Parent Reviewer (`Gemini`)

### 6.1 Service-aware fields are a forward-compatible contract augmentation (depends on `BE-SVC-003`)
The canonical `UnifiedDriverTaskView` (`packages/contracts/src/index.ts:2585`) does **not** declare `serviceProduct`, `sourceType`, `tenantName`, `tenantServiceProgramName`, `routeAuthority`, `fixedPrice`, `proofRequired`, `vehicleEligibilitySummary`, or `fleetPartnerAttribution`. `driver-service-views.ts` defines a local `ServiceAwareTaskView = UnifiedDriverTaskView & { …optional fields }` and casts `task as ServiceAwareTaskView`. **All augmented fields are optional and every access is `?.`/typeof-guarded with `OwnedOrderRecord`-derived or bilingual-placeholder fallbacks** — so until `BE-SVC-003` lands the emitting backend, the card degrades gracefully (no unsafe envelope assumption, no runtime `TypeError`). This is honest forward-compat, not a defect — but the reviewer should confirm the field names here are intended to match the `BE-SVC-003` contract so they actually populate later. Open question worth recording: should these augmentations be promoted into the canonical contract as part of `BE-SVC-003`, or stay UI-local?

### 6.2 Grouping is client-side, not the SD-named server endpoint
The SD intent references `/api/driver/earnings?groupBy=…` and `/api/driver/eligible-products`. Neither endpoint is called. Instead:
- `service_product` / `tenant` / `fleet` / `total` grouping is computed **client-side** from existing `statements` + a per-order metadata map.
- Vehicle eligibility falls back to `order.vehiclePreference` or a static `"依服務與車格派發 / Matched by service eligibility"` placeholder — `/api/driver/eligible-products` is not wired.

This is a reasonable interim given `BE-SVC-003` is a dependency, but it is a **deviation from the SD wiring**. Reviewer decision needed: accept client-side aggregation as interim, or block on the server `groupBy` endpoint. The screen's own subtitle already flags this ("非平台分組目前依月結與訂單 metadata 彙整").

### 6.3 Bilingual via string concatenation, not locale pipeline
`buildGroupedEarningsItems` is invoked without a `locale` arg, so the helper's `t()` defaults to `zh`; bilingual display is delivered by hardcoded `"中文 / English"` strings rather than the driver-app i18n switch. Given the repo's recent i18n hardening waves, the reviewer may want to confirm this satisfies the "bilingual" bar or should route through `driverStrings`/`useTranslation`.

### 6.4 Per-order fetch fan-out (N+1) in `earnings.tsx`
On load, the screen issues `client.getOrder(orderId)` inside `Promise.all` for **every unique `orderId`** across statement lines. For drivers with many monthly lines this is an N+1 fan-out. Failures are individually swallowed (`catch → null`, filtered out), so it degrades safely, but it is a latency/load consideration worth noting for high-volume accounts.

### 6.5 Integration posture
Parent commit `34a036f6` is **local-only and 1 commit behind `origin/dev`** (§1). Before `done`, the parent owner must push a normal non-force commit and record `INTEGRATION_STATUS`; a rebase onto `origin/dev` (tip `63d2ba58`) will be required. None of this blocks the *code* review; it is the closeout/integration checklist.

## 7) Sidecar Scope Compliance

Per the brief's acceptance bars and AI Collaboration Guide §5 sidecar rules:

- [x] **Create support artifacts only** — this pass writes exactly one file, `support/sidecars/DRV-SVC-001/DRV-SVC-001-SIDECAR-REVIEW.md`. No edits to `phase1_*.md`, `docs/**`, `apps/**`, `packages/**`, `services/**`, `runtime/**`, or any test.
- [x] **Do not edit canonical truth** — the packet cites the parent branch, contract, and activity log; it does not modify the parent task's `ai-status.json` entry, acceptance text, or any product semantics. Independent verification in §5 was read-only.
- [ ] **Hand off the packet to the assigned reviewer** — pending: handed to sidecar reviewer `Codex2` via `scripts/ai-status.sh handoff` at the end of this turn (recorded in machine truth).

Closeout posture: once `Codex2` approves, this sidecar is eligible for `NO_COMMIT_REQUIRED=1` finalize per Guide §5 (review packets are an explicit non-canonical case) — but the artifact still lives on branch `claude2/drv-svc-001-sidecar-review` and a task-scoped commit/push is the cleaner record. Sidecar `INTEGRATION_STATUS` is `not_applicable` (support-only).

## 8) Reviewer Hotspots (sidecar reviewer `Codex2`)

When reviewing **this packet**, prioritize:

1. **It mirrors, never approves.** Confirm the packet does not pre-sign parent `DRV-SVC-001`. Parent is `review` under `Codex2`/`Gemini`; binding approval is `Gemini`'s.
2. **Machine-truth accuracy.** Parent commit `34a036f6` is local-only / 1 behind `origin/dev`; parent acceptance is the single compound bullet quoted in §1; no `review_approved` from `Gemini` exists yet. Re-check against a fresh `ai-status.sh show DRV-SVC-001` if in doubt (status can advance between packet write and your review — see the stale-status race note in prior reviews).
3. **Independent verification claims (§5).** Re-runnable: `pnpm --filter @drts/driver-app typecheck` and the `driver-service-views.test.ts` vitest run at HEAD `34a036f6` in the `codex2-drv-svc-001` worktree. The packet does *not* claim to have re-run `build`.
4. **Risk notes (§6) are characterizations, not verdicts.** 6.1 (contract augmentation), 6.2 (client-side grouping vs SD endpoint), and 6.3 (bilingual concatenation) are routed to `Gemini` as the binding reviewer — the packet records them as open questions, it does not resolve them.
5. **Scope.** Only `support/sidecars/DRV-SVC-001/…` and sidecar machine state (via `scripts/ai-status.sh`) are in scope. No `apps/`, `packages/`, contracts, or parent state edits.

## 9) Closeout Note

Next machine-truth step: `AI_NAME=Claude2 scripts/ai-status.sh approve DRV-SVC-001-SIDECAR-REVIEW "<review conclusion>"` (by sidecar reviewer `Codex2`); if not satisfied, `reopen` back to owner `Claude2`. Only after approval may the owner finalize this support-only sidecar. The parent task `DRV-SVC-001` is unaffected by this sidecar's outcome and remains owned by `Codex2` with reviewer `Gemini`.
