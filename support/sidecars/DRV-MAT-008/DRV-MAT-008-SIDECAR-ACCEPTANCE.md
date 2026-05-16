# DRV-MAT-008 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `DRV-MAT-008` — Driver earnings dashboard materialization
**Sidecar Owner:** `Claude2`
**Assigned Reviewer:** `Codex2`
**Parent Owner / Reviewer (current snapshot):** `Codex2` / `Claude2`
**Generated:** `2026-05-05` (UTC) · **Snapshot timestamp:** `2026-05-05T03:05Z`
**Snapshot Status:** Parent `DRV-MAT-008` is `in_progress` in `ai-status.json` (`last_update: 2026-05-05T02:58:45Z`). Parent's working tree currently shows `apps/driver-app/app/earnings.tsx` **deleted with no untracked replacement file in place**, plus modifications to `apps/driver-app/components/earnings-by-platform.tsx` and `apps/driver-app/lib/money.ts`. No parent closeout commit yet; `commit_hash` / `push_*` fields are not present on the parent task. This sidecar is a support-only acceptance frame. It does not finalize the parent task and does not pre-sign any closeout evidence.

> **Provenance.** Repo HEAD at packet generation is `c13cbf4 feat(DRV-MAT-009): materialize driver settings` on branch `codex/dev-deploy-backend-android`. The parent task references four `evidence_refs` from worker dispatch attempts (`gemini2-20260505T011452Z-e6a2159a.json`, `codex-20260505T020145Z-8d97f489.json`, `codex-20260505T023434Z-ac4944ad.json`, `codex-20260505T025638Z-ddc35daf.json`); spot-checking the latter three shows the same `kind: terminal` / `summary: "Worker exited before the task reached a terminal status."` payload, i.e. dispatch-loop telemetry rather than implementation proof. This packet treats those entries as session bookkeeping, not as parent acceptance evidence.

---

## 1) Scope Boundary

This sidecar curates support-only artifacts for `DRV-MAT-008`:

- In scope: acceptance framing pinned to the in-flight working tree, dependency map, repo baseline, reviewer hotspot guidance, handoff wording, and downstream consumer notes.
- Out of scope: editing `apps/driver-app/app/earnings.tsx` (currently deleted), `apps/driver-app/components/earnings-by-platform.tsx`, `apps/driver-app/lib/money.ts`, the canonical contracts in `packages/contracts`, the API client in `packages/api-client`, the L1/L2 product truth, the design plan, or the execution packet. The sidecar does not commit, push, recreate the deleted page, or run `pnpm typecheck` on behalf of the parent owner.

---

## 2) Current State Baseline

Anchored on `git status` + working tree at `c13cbf4` and the canonical documents listed in §4.

### 2.1 Parent task machine state

- `ai-status.json` entry for `DRV-MAT-008`: `status=in_progress`, `owner=Codex2`, `reviewer=Claude2`, `phase="Driver App Productization"`, `last_update=2026-05-05T02:58:45Z`, `next="Resuming ownership after reassignment; auditing prior evidence and current earnings dashboard files before implementing remaining KPI, segmented control, and state coverage work."`
- `depends_on=["DRV-MAT-001"]`. Dependency is `done` in `ai-status.json` (DRV-MAT-001 commit `8662350`, push ref `origin/codex/drv-mat-001-closeout`).
- `acceptance` from machine truth (4 bullets): `KPI summary exists`, `shared segmented control used`, `empty and error states covered`, `typecheck passes`.
- `artifacts` from machine truth: `apps/driver-app/app/earnings.tsx`, `apps/driver-app/components/earnings-by-platform.tsx`, `apps/driver-app/lib/money.ts`.
- `evidence_refs` (4 entries) all resolve to `kind: terminal` / `Worker exited before the task reached a terminal status.` — these are dispatcher session records, not implementation proof.

### 2.2 Working tree snapshot

`git status --short` at packet time (filtered to driver-app):

```
 D apps/driver-app/app/earnings.tsx
 M apps/driver-app/components/earnings-by-platform.tsx
 M apps/driver-app/lib/money.ts
```

`git diff --stat HEAD` for the three declared parent artifacts:

```
 apps/driver-app/app/earnings.tsx                   | 310 ---------------------
 apps/driver-app/components/earnings-by-platform.tsx | 242 ++++++++++++----
 apps/driver-app/lib/money.ts                       |  16 +-
 3 files changed, 197 insertions(+), 371 deletions(-)
```

There are no untracked files anywhere under `apps/driver-app/` (`git ls-files --others --exclude-standard apps/driver-app/` returns empty), and no replacement screen lives elsewhere (`find apps/driver-app -name "*earning*"` returns only the existing `components/earnings-by-platform.tsx`).

Reviewer-critical observation: the parent's primary artifact `apps/driver-app/app/earnings.tsx` is currently **gone** in the working tree, and Expo Router will fail to resolve the `/earnings` route as a result. This is incompatible with parent acceptance until the file is re-introduced. Two routes still link into `/earnings`:

- `apps/driver-app/app/onboarding.tsx:28` declares `"/earnings"` in its route union and `apps/driver-app/app/onboarding.tsx:58` references `route: "/earnings"`.
- `apps/driver-app/app/settings.tsx:509` calls `router.push("/earnings")` from the settings footer link.

Both consumers will throw at runtime against the current working tree. The sidecar flags this as the dominant blocker for the parent slice and explicitly does **not** restore the file.

### 2.3 `apps/driver-app/components/earnings-by-platform.tsx` (modified)

The file has been productized in line with the design plan's "icon chevron, stable card layout" guidance:

- Imports now include `Ionicons` from `@expo/vector-icons`, `Pressable` (instead of `TouchableOpacity`), `PLATFORM_CODE_REGISTRY` from `@drts/contracts`, the shared `Tokens` palette, and `EmptyState` from `@/components/ui/EmptyState` (`earnings-by-platform.tsx:1-18`).
- `PlatformCard` renders a `Pressable` with `accessibilityRole="button"`, `accessibilityLabel="${platformLabel} 收益明細"`, and `accessibilityHint` toggling between `展開收益明細` / `收合收益明細` (`earnings-by-platform.tsx:60-66`).
- The header block exposes both the localized `platformLabel` (`PLATFORM_CODE_REGISTRY[code].displayName ?? code`) and a smaller raw code line (`earnings-by-platform.tsx:68-71`); a right-aligned summary block carries `本期實拿` + `formatMoney(item.netAmount)` (`earnings-by-platform.tsx:73-76`); the chevron is `Ionicons name="chevron-up"|"chevron-down"` sized 18px (`earnings-by-platform.tsx:78-82`).
- A three-chip metrics row (`總收入` / `服務費` / `補貼`) renders before expansion (`earnings-by-platform.tsx:85-102`); the expanded panel uses the local `DetailRow` helper for `總收入`, `平台服務費`, `補貼`, `實際入帳`, with `tone="positive"` highlighting net amount (`earnings-by-platform.tsx:104-119`).
- The empty branch now renders the shared `<EmptyState title="這段期間還沒有平台收益" description="切換到其他期間，或稍後再查看最新對帳彙整。" icon="cash-outline" />` (`earnings-by-platform.tsx:129-138`) instead of a raw `<Text>` line.
- All visible string literals are Traditional Chinese; no English copy remains in the modified component surface.

### 2.4 `apps/driver-app/lib/money.ts` (modified)

- Now uses `Intl.NumberFormat(LOCALE, { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 })` with `LOCALE = "zh-TW"` (`money.ts:3-15`).
- Pending-amount fallback copy is now `金額待確認` (was `Amount pending`) — eliminates the only English literal in this helper (`money.ts:6-7`).
- Public signature `formatMoney(amount: MoneyAmount | null | undefined): string` is preserved, so `earnings-by-platform.tsx` and any other downstream consumer continues to compile (the only consumer in driver-app today is `components/earnings-by-platform.tsx` itself; see §4.3).

### 2.5 `apps/driver-app/app/earnings.tsx` (deleted in working tree, baseline)

For reviewer reference, the pre-deletion file at `HEAD` (commit `c13cbf4`) implemented the following surface that the parent slice needs to either restore or replace:

- `EarningsScreen` default export with `useState`-driven `statements`, `platformEarnings`, `loading`, `refreshing`, `error`, `earningsEnabled`, `period` ("today"|"week"|"month") (`HEAD:apps/driver-app/app/earnings.tsx:18-30`).
- Feature-gate via `client.isFeatureEnabled("driver-app.earnings")` with a fallback to `loadStatements()` if the gate call rejects (`HEAD:apps/driver-app/app/earnings.tsx:60-78`).
- Loading branch shows `ActivityIndicator` + `載入收入資料中…`; disabled branch shows `收入檢視暫停提供 / 此功能目前未啟用。` (`HEAD:apps/driver-app/app/earnings.tsx:97-122`).
- Period segmented control via shared `<SegmentedControl options={[今日/本週/本月]} selectedValue={period} onValueChange=... />` (`HEAD:apps/driver-app/app/earnings.tsx:124-128, 158-163`).
- KPI tiles for `總收入` and `總撥款` derived as `platformEarnings.reduce((sum, item) => sum + item.{grossEarning,netAmount}.amountMinor)` (`HEAD:apps/driver-app/app/earnings.tsx:130-148`).
- Statement list with table-style header (`ID / 期間 / 實拿 / 狀態`) using `formatMoney`, `formatDriverPayoutStatusLabel` (`HEAD:apps/driver-app/app/earnings.tsx:179-220`).
- Footer link to `/settings` rendered as a styled `<Text>` with `onPress` (`HEAD:apps/driver-app/app/earnings.tsx:222-225`) — this is a text-as-button that the productization design plan §4.6 implicitly disallows; reviewer should ensure the recreated screen replaces it with shared button posture.

This baseline already overlaps several productization acceptance bullets (KPI tiles exist, segmented control already shared). The sidecar records this so the reviewer can distinguish "needs to be restored" from "needs to be added net-new". The currently-deleted state means **none** of this surface is loadable today.

### 2.6 Parent acceptance bullets vs. design plan

Cross-referencing the four canonical machine-truth bullets against the higher-precedence design plan and execution packet:

| Parent acceptance bullet (`ai-status.json`) | Closest higher-precedence wording                                                                                                                                                                                                                               | Notes                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `KPI summary exists`                        | Design plan §4.6 row "KPI summary": "Totals derived from platform earnings and statements." Plus the target layout line `[KPI tiles: 實拿, 總收入, 平台數, 待撥款]`. Execution packet: "KPI tiles show useful totals derived from fetched earnings/statements." | Machine-truth wording is the loosest. Design plan target lists four KPI tiles (`實拿 / 總收入 / 平台數 / 待撥款`); HEAD implementation only had two (`總收入 / 總撥款`). Reviewer should decide whether the recreated screen needs all four target tiles or whether two is sufficient under the looser machine-truth bullet. |
| `shared segmented control used`             | Design plan §4.6 row "Segmented control": "Uses shared segmented control, not text tabs." Execution packet: "Period switch uses shared `SegmentedControl`."                                                                                                     | HEAD already imported `SegmentedControl` from `@/components/ui/SegmentedControl`; the new implementation must keep this import path and the `selectedValue` / `onValueChange` API.                                                                                                                                           |
| `empty and error states covered`            | Execution packet: "Disabled, empty, loading, error, and refreshing states are covered." Design plan §4.6 "Required states": loading, feature disabled, empty period, API error, refreshing.                                                                     | Machine-truth bullet is narrower than the higher-precedence sources. Reviewer should not approve a screen that only handles `empty + error` without also covering loading, disabled, and refreshing — those are higher-precedence requirements per L2 conflict precedence.                                                   |
| `typecheck passes`                          | Execution packet: `pnpm --filter @drts/driver-app typecheck`.                                                                                                                                                                                                   | Sole verification command for this slice.                                                                                                                                                                                                                                                                                    |

This sidecar does not lower the higher-precedence states list to match the looser machine-truth bullet. Reviewer hotspot #2 below records the divergence.

---

## 3) Parent Acceptance Framing

This restates the parent acceptance bullets against the in-flight working tree. The sidecar checklist marks observation rows; reviewer responsibilities remain unchecked.

### AC-1 — `KPI summary exists`

- [ ] **Not satisfied in current working tree.** `apps/driver-app/app/earnings.tsx` is deleted, so the KPI tile container at `HEAD:apps/driver-app/app/earnings.tsx:131-148` no longer renders. Whatever the parent owner restores must reinstate at least the `總收入` / `總撥款` tiles (HEAD baseline) or extend to the design plan's full `實拿 / 總收入 / 平台數 / 待撥款` set.
- [ ] Reviewer should confirm that the restored page derives KPIs from `platformEarnings.reduce(...amountMinor)` (HEAD pattern) or an equivalent typed reducer that does not silently cast `undefined` amounts. The HEAD code uses `(item.grossEarning?.amountMinor || 0)`, which collapses an unparseable amount and a missing amount into the same `0` — the reviewer may decide to tighten this in the recreate.
- [ ] Reviewer should confirm KPI tile labels remain Traditional Chinese (no English KPI labels) and use shared `Tokens` typography rather than locally hard-coded styles.

### AC-2 — `shared segmented control used`

- [ ] **Not loadable in current working tree.** The deleted `earnings.tsx` was the sole consumer of `<SegmentedControl />` for the `/earnings` route. Reviewer should confirm the recreated page imports `SegmentedControl` from `@/components/ui/SegmentedControl` (re-exported via `@/components/ui/index.ts`) and uses the documented `selectedValue: string`, `onValueChange: (value: string) => void`, `options: SegmentedControlOption[]` API per `apps/driver-app/components/ui/SegmentedControl.tsx:11-23`.
- [ ] Reviewer should not accept reintroducing a local text-tab implementation as a "compatible" substitute; the parent acceptance bullet is specifically `shared segmented control used`.

### AC-3 — `empty and error states covered`

- [ ] **Page-level empty/error states not loadable.** The route is gone, so the shared `EmptyState` block per §2.3 only fires through the embedded `<EarningsByPlatform items={[]} />` branch when the recreated page mounts it.
- [x] `EarningsByPlatform` empty branch already uses the shared `<EmptyState title="這段期間還沒有平台收益" description="切換到其他期間，或稍後再查看最新對帳彙整。" icon="cash-outline" />` (`earnings-by-platform.tsx:129-138`).
- [ ] Reviewer should confirm the page-level error branch surfaces `error` through a shared `ErrorBanner` (or equivalent shared primitive from `apps/driver-app/components/ui/index.ts:12`), not a raw `<Text style={{color: "red"}}>` inline. The HEAD baseline used a styled `<Text style={styles.error}>` (`HEAD:apps/driver-app/app/earnings.tsx:151`); the recreated page should align with the shared posture established by DRV-MAT-006/007/009.
- [ ] Reviewer should also confirm the page covers loading, feature-disabled, and refreshing states per execution-packet §`DRV-MAT-008` line 252 — those are higher-precedence than the machine-truth bullet (see §2.6) and should not be skipped.
- [ ] Reviewer should not interpret AC-3 as satisfied solely by the component-level empty state in `EarningsByPlatform`; the page-level branches still need to be present for the slice to land.

### AC-4 — `typecheck passes`

- [ ] **Almost certainly not satisfied today.** With `apps/driver-app/app/earnings.tsx` deleted, Expo Router's static route inference will lose the `/earnings` typed route. Two consumers (`apps/driver-app/app/onboarding.tsx:28` `Route` union and `apps/driver-app/app/settings.tsx:509` `router.push("/earnings")`) will fail typecheck against the missing route. Reviewer should treat AC-4 as **gated on restoring `earnings.tsx`** before any `pnpm --filter @drts/driver-app typecheck` invocation can pass.
- [ ] The new `earnings-by-platform.tsx` import path `EmptyState` from `@/components/ui/EmptyState` should resolve via the existing `tsconfig` `paths` map; if it does not, typecheck fails at this file before reaching the missing route. Reviewer hotspot #4 covers this.
- [ ] Sidecar does not run typecheck on the parent's behalf and does not record AC-4 as satisfied; this row is gated on parent owner evidence.

---

## 4) Dependency Map

### 4.1 Formal Machine Dependencies

| Dep           | Source                   | Status                                                                  | Why It Matters                                                                                                                                                                                                                                                                   |
| ------------- | ------------------------ | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DRV-MAT-001` | `DRV-MAT-008.depends_on` | `done` (commit `8662350`, push ref `origin/codex/drv-mat-001-closeout`) | Provides every shared UI primitive the recreated `/earnings` will need: `AppScreen`, `PageHeader`, `SegmentedControl`, `EmptyState`, `ErrorBanner`, `Tokens`, plus `IconButton` / `InfoTile` / `ListCard` for KPI / row formatting per `apps/driver-app/components/ui/index.ts`. |

### 4.2 Practical Review Anchors

| ID     | Anchor                                                                                  | Why It Matters                                                                                                                                                                                                  |
| ------ | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-P-1  | `docs/03-runbooks/driver-app-productization-execution-packet-20260504.md:237-258`       | Parent write scope, acceptance bullets (KPI / segmented / icon affordance / state coverage) and verification command (`pnpm --filter @drts/driver-app typecheck`).                                              |
| D-P-2  | `docs/02-architecture/driver-app-productization-design-plan-20260504.md:245-266`        | Target layout, required states, acceptance table for `/earnings` (`KPI summary` / `Segmented control` / `Expand affordance`).                                                                                   |
| D-P-3  | `docs/02-architecture/driver-app-productization-design-plan-20260504.md:18, 24, 327`    | Pre-productization gap inventory (text-only period toggle, isolated platform cards, no KPI summary, weak empty/error) and the wave-3 row pinning DRV-MAT-008's write scope.                                     |
| D-P-4  | `apps/driver-app/components/earnings-by-platform.tsx`                                   | In-flight implementation — `Pressable` + `Ionicons` chevron + `EmptyState` + `PLATFORM_CODE_REGISTRY` localization.                                                                                             |
| D-P-5  | `apps/driver-app/lib/money.ts`                                                          | In-flight `Intl.NumberFormat`-based formatter; baseline for `formatMoney(...)` consumers.                                                                                                                       |
| D-P-6  | `apps/driver-app/app/earnings.tsx` (deleted in working tree, present at `HEAD`)         | The page the parent owner must restore. Holds the page-level state machine the parent acceptance bullets attach to.                                                                                             |
| D-P-7  | `apps/driver-app/components/ui/SegmentedControl.tsx:11-23`                              | Canonical `SegmentedControl` API: `options: SegmentedControlOption[]`, `selectedValue: string`, `onValueChange: (value: string) => void`.                                                                       |
| D-P-8  | `apps/driver-app/components/ui/index.ts:1-13`                                           | Re-export surface for `Tokens`, `AppScreen`, `PageHeader`, `ActionButton`, `IconButton`, `StatusChip`, `InfoTile`, `ListCard`, `SegmentedControl`, `FormField`, `EmptyState`, `ErrorBanner`, `BottomActionBar`. |
| D-P-9  | `apps/driver-app/lib/api-client.ts` + `packages/api-client/src/index.ts:376, 920, 1078` | Driver client methods consumed by the page: `isFeatureEnabled`, `listDriverStatements`, `getPlatformEarningsByPlatform`. The recreated page must keep these names.                                              |
| D-P-10 | `apps/driver-app/lib/operational-labels.ts:52`                                          | `formatDriverPayoutStatusLabel` — used for statement row status; localized payout status labels.                                                                                                                |
| D-P-11 | `packages/contracts/src/platform-earnings.ts:4-16`                                      | `PlatformEarningsItem`, `PlatformEarningsByPlatformResponse` shape; the row + summary contract the page consumes.                                                                                               |
| D-P-12 | `packages/contracts/src/index.ts:2862` (`DriverStatementRecord`)                        | Statement row contract used by the recent-statement list.                                                                                                                                                       |
| D-P-13 | `apps/driver-app/app/onboarding.tsx:28, 58`                                             | Static route union + onboarding card referencing `/earnings`. Will break if the route file stays missing.                                                                                                       |
| D-P-14 | `apps/driver-app/app/settings.tsx:509`                                                  | `router.push("/earnings")` from settings footer. Same blocker as D-P-13 if the route file is not restored.                                                                                                      |
| D-P-15 | `tests/unit/client-integration.test.ts:77, 174`                                         | Existing client test asserts `driver-app.earnings` flag exists and is `true` — the page's feature-gate path must not regress this contract.                                                                     |

### 4.3 Informative Consumer Map

| Consumer                  | Status        | Why It Matters                                                                                                                                                                                                                                          |
| ------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DRV-MAT-009`             | `done`        | Settings page's footer link `router.push("/earnings")` (`apps/driver-app/app/settings.tsx:509`) is a downstream consumer. If `/earnings` stays missing, the just-closed `DRV-MAT-009` slice will throw at the link-press boundary.                      |
| `DRV-MAT-010`             | `backlog`     | Driver-app verification pack will inherit AC-1..AC-4 evidence after parent closes. Must not be allowed to absorb additional acceptance for `/earnings` beyond the four canonical bullets.                                                               |
| `DRV-MAT-007`             | `done`        | Localized platform-name posture (`PLATFORM_CODE_REGISTRY[code].displayName`) was established under DRV-MAT-007. The new `earnings-by-platform.tsx` continues that posture; reviewer should not accept a regression to raw codes in user-visible labels. |
| Parent owner `Codex2`     | `in_progress` | Owns `apps/driver-app/app/earnings.tsx` (currently deleted), `apps/driver-app/components/earnings-by-platform.tsx` (modified), `apps/driver-app/lib/money.ts` (modified). Will produce the parent commit + `pnpm typecheck` evidence.                   |
| Parent reviewer `Claude2` | `next`        | Will receive the parent handoff. AC-4 review depends on `pnpm --filter @drts/driver-app typecheck` succeeding, which in turn depends on the parent owner restoring `earnings.tsx`.                                                                      |
| Sidecar reviewer `Codex2` | `assigned`    | Reviews this packet for accuracy of the working-tree snapshot, the dependency closure, and the divergence flagged in §2.6.                                                                                                                              |

---

## 5) Reviewer Hotspots (sidecar reviewer `Codex2`)

When reviewing this sidecar packet, prioritize:

1. The packet must reflect that parent `DRV-MAT-008` is `in_progress` under owner `Codex2` / reviewer `Claude2` at `2026-05-05T02:58:45Z`, with no parent commit yet. Do not let the packet pre-sign `commit_hash` / `push_*` fields, claim AC-4 typecheck has been run, or imply the page exists in the working tree.
2. The acceptance framing must trace to higher-precedence sources (D-P-1, D-P-2) and not invent acceptance language. The four canonical bullets are `KPI summary exists`, `shared segmented control used`, `empty and error states covered`, `typecheck passes`. Note the sidecar deliberately keeps the higher-precedence "loading / feature disabled / refreshing" states alive even though the machine-truth bullet only mentions empty + error — per L2 conflict precedence, the design plan and execution packet outrank the looser bullet.
3. The deletion of `apps/driver-app/app/earnings.tsx` is the dominant blocker. The packet must surface this in §2.2, §3 (every AC row), §5, and §9 — and must **not** restore the file, run typecheck, or otherwise claim the parent slice is closer to acceptance than it actually is.
4. The new `apps/driver-app/components/earnings-by-platform.tsx` import of `EmptyState` from `@/components/ui/EmptyState` is the highest-risk regression vector for AC-4 inside the modified files (independent of the deleted page). Reviewer should not approve packet language that buries this risk.
5. The packet must not edit anything under `apps/`, `packages/`, `services/`, `runtime/`, the design plan, or the execution packet. Only `support/sidecars/DRV-MAT-008/...` and machine state via `scripts/ai_status.py` are in scope.
6. Verify the localization audit references the `PLATFORM_CODE_REGISTRY` lookup rather than re-asserting display names directly — the canonical name source is the registry, not this packet.
7. The four worker-exit `evidence_refs` on the parent task must be framed as dispatch-loop telemetry, not implementation proof. Reviewer should reject packet wording that elevates them.
8. The sidecar may finalize without a code commit. Closeout uses `NO_COMMIT_REQUIRED=1` per the AI Collaboration Guide §5 (sidecar acceptance packets are an explicit non-canonical case).

---

## 6) Evidence Inventory

| ID   | Evidence                                              | Location                                                                                                                                                          |
| ---- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E-1  | Parent task machine state                             | `ai-status.json` entry for `DRV-MAT-008`                                                                                                                          |
| E-2  | Sidecar task machine state                            | `ai-status.json` entry for `DRV-MAT-008-SIDECAR-ACCEPTANCE`                                                                                                       |
| E-3  | Parent execution instructions                         | `docs/03-runbooks/driver-app-productization-execution-packet-20260504.md:237-258`                                                                                 |
| E-4  | Product design acceptance posture                     | `docs/02-architecture/driver-app-productization-design-plan-20260504.md:245-266, 327`                                                                             |
| E-5  | Pre-productization gap inventory                      | `docs/02-architecture/driver-app-productization-design-plan-20260504.md:18, 24`                                                                                   |
| E-6  | Earnings page baseline at HEAD (deleted in worktree)  | `git show c13cbf4:apps/driver-app/app/earnings.tsx`                                                                                                               |
| E-7  | In-flight platform earnings card                      | `apps/driver-app/components/earnings-by-platform.tsx`                                                                                                             |
| E-8  | In-flight money formatter                             | `apps/driver-app/lib/money.ts`                                                                                                                                    |
| E-9  | Shared UI surface used by `/earnings`                 | `apps/driver-app/components/ui/{tokens,AppScreen,PageHeader,SegmentedControl,EmptyState,ErrorBanner,InfoTile,ListCard,IconButton,StatusChip}.tsx`                 |
| E-10 | Shared UI export barrel                               | `apps/driver-app/components/ui/index.ts:1-13`                                                                                                                     |
| E-11 | Driver client methods                                 | `apps/driver-app/lib/api-client.ts`, `packages/api-client/src/index.ts:376, 920, 1078`                                                                            |
| E-12 | Localized payout status label                         | `apps/driver-app/lib/operational-labels.ts:52`                                                                                                                    |
| E-13 | Platform earnings contract                            | `packages/contracts/src/platform-earnings.ts:4-16`                                                                                                                |
| E-14 | Driver statement contract                             | `packages/contracts/src/index.ts:2862`                                                                                                                            |
| E-15 | Existing route consumers of `/earnings`               | `apps/driver-app/app/onboarding.tsx:28, 58`, `apps/driver-app/app/settings.tsx:509`                                                                               |
| E-16 | Existing earnings feature-flag coverage               | `tests/unit/client-integration.test.ts:77, 174`                                                                                                                   |
| E-17 | Parent worker-exit evidence (dispatch telemetry only) | `.orchestrator/evidence/{gemini2-20260505T011452Z-e6a2159a,codex-20260505T020145Z-8d97f489,codex-20260505T023434Z-ac4944ad,codex-20260505T025638Z-ddc35daf}.json` |

---

## 7) Sidecar Acceptance Checklist

### AC-S1 — `Create support artifacts only`

- [x] Only writes `support/sidecars/DRV-MAT-008/DRV-MAT-008-SIDECAR-ACCEPTANCE.md`.
- [x] Content is acceptance framing, dependency map, baseline, reviewer guidance, and downstream consumer notes — no new canonical truth.
- [x] No claim that this sidecar implements `/earnings`, restores the deleted page, runs `pnpm typecheck`, or completes parent closeout.

### AC-S2 — `Do not edit canonical truth`

- [x] No edits to `phase1_*.md`, `docs/02-architecture/...` design plan, `docs/03-runbooks/...` execution packet, `apps/driver-app/...`, `packages/...`, `services/...`, `runtime/...`, or any test file.
- [x] Machine truth changes go through `scripts/ai-status.sh` / `scripts/ai_status.py` only.
- [x] All references in §2-§6 cite higher-precedence sources rather than restating product semantics.

### AC-S3 — `Hand off the packet to the assigned reviewer`

- [x] §8 handoff command targets reviewer `Codex2` per `DRV-MAT-008-SIDECAR-ACCEPTANCE.reviewer`.
- [ ] Reviewer `Codex2` may `approve` (sidecar passes) or `reopen` / `blocker` (with reason). Owner returns to revise if reopened.

---

## 8) Handoff Command

Owner (`Claude2`) -> Reviewer (`Codex2`)

```bash
AI_NAME=Claude2 scripts/ai-status.sh handoff DRV-MAT-008-SIDECAR-ACCEPTANCE Codex2 \
  "Drafted support-only DRV-MAT-008 acceptance packet at support/sidecars/DRV-MAT-008/DRV-MAT-008-SIDECAR-ACCEPTANCE.md against the in-flight working tree (parent in_progress under Codex2/Claude2, last_update 2026-05-05T02:58:45Z; no parent commit yet). Sections cover acceptance framing pinned to the four canonical bullets (KPI summary exists, shared segmented control used, empty and error states covered, typecheck passes), dependency map citing DRV-MAT-001 done as the sole formal upstream, working-tree snapshot showing apps/driver-app/app/earnings.tsx deleted with no untracked replacement plus modifications to components/earnings-by-platform.tsx (Pressable + Ionicons chevron + EmptyState + PLATFORM_CODE_REGISTRY localization) and lib/money.ts (Intl.NumberFormat zh-TW + 金額待確認 fallback), and reviewer hotspots flagging the deleted-page blocker, the looser machine-truth state list vs higher-precedence design-plan / execution-packet states, route consumers that will break (onboarding.tsx, settings.tsx) and dispatch-only worker-exit evidence on the parent. Did not edit canonical truth, did not restore earnings.tsx, and did not run pnpm typecheck on the parent's behalf."
```

---

## 9) Notes For Parent Owner (`Codex2`) — Pre-`done` Reference

These are follow-up references for the parent owner before parent closeout. They are **not** new acceptance bars; they are observations the sidecar lane recorded while building the packet.

1. The dominant blocker is that `apps/driver-app/app/earnings.tsx` is currently deleted in the working tree with no untracked replacement file in place. The route is referenced by `apps/driver-app/app/onboarding.tsx:28, 58` and `apps/driver-app/app/settings.tsx:509`. Until the page is recreated, neither typecheck nor runtime navigation can pass. The HEAD baseline at `git show c13cbf4:apps/driver-app/app/earnings.tsx` is a useful starting point; the four parent acceptance bullets and the higher-precedence design plan §4.6 list together describe the surface that needs to be restored.
2. The execution packet's sole verification command for `DRV-MAT-008` is `pnpm --filter @drts/driver-app typecheck` (`docs/03-runbooks/driver-app-productization-execution-packet-20260504.md:257-258`). The parent commit body should record the command and result so AC-4 evidence is captured at machine-truth time, mirroring the DRV-MAT-006 / DRV-MAT-007 / DRV-MAT-009 pattern.
3. The four `evidence_refs` on the parent task are dispatch-loop telemetry (`Worker exited before the task reached a terminal status.`), not implementation proof. Either replace them with real evidence at closeout or keep them as session bookkeeping but explicitly note that the proof lives in the commit + typecheck output.
4. The machine-truth acceptance bullet `empty and error states covered` is narrower than the higher-precedence design plan ("Required states: loading, feature disabled, empty period, API error, refreshing"). Per L2 conflict precedence (`AI_COLLABORATION_GUIDE.md` §2), the design plan + execution packet take precedence. The recreated page should cover all five states even though the looser bullet only names two — otherwise the parent reviewer should reject closeout.
5. The HEAD baseline KPI tile set was `總收入 / 總撥款` (two tiles). The design plan target layout calls for `實拿 / 總收入 / 平台數 / 待撥款` (four tiles). Decide explicitly whether to ship with the two-tile baseline (and document why) or extend to all four. The parent reviewer should accept either path so long as the rationale is recorded in the commit body.
6. The HEAD baseline footer was a `<Text>` link rendered as a styled tap target (`HEAD:apps/driver-app/app/earnings.tsx:222-225`). DRV-MAT-005 / DRV-MAT-006 / DRV-MAT-007 / DRV-MAT-009 all replaced text-as-button with shared `ActionButton` / `IconButton` posture. Consider doing the same for `/earnings` — not strictly required by the four acceptance bullets, but consistent with the productization wave's posture.
7. The new `apps/driver-app/lib/money.ts` formatter uses `Intl.NumberFormat` with `currency: amount.currency`. If a `MoneyAmount` ever flows through with a non-ISO `currency` string, `Intl.NumberFormat` will throw at construction time rather than fall back. Verify that all `MoneyAmount.currency` inputs from `getPlatformEarningsByPlatform` and `listDriverStatements` are ISO codes (`USD`, `TWD`, etc.); if not, wrap construction in a try/catch or guard upstream.
8. The new `apps/driver-app/components/earnings-by-platform.tsx` registers `LayoutAnimation.setLayoutAnimationEnabledExperimental` on Android at module-import time. This is fine for the existing pattern but means importing the component for testing in a non-React-Native environment (e.g. node vitest) may now warn. If you add a unit test for this component, verify the test harness handles or stubs the `UIManager` reference.

---

## 10) Notes For Downstream Consumer (`DRV-MAT-010` verification owner)

1. Treat the four formal acceptance bullets (`KPI summary exists`, `shared segmented control used`, `empty and error states covered`, `typecheck passes`) as the landed contract for `/earnings` after the parent closes. Do not invent additional `DRV-MAT-008` acceptance in the verification pack.
2. The higher-precedence state list (loading / feature disabled / empty period / API error / refreshing) per design plan §4.6 is the verification surface; the looser machine-truth bullet does not lower it.
3. The `<EarningsByPlatform />` component is a productized shared card now (icon chevron, `EmptyState`, localized labels). Do not regress it back to text chevrons / raw codes during verification fixes.
4. The verification command on the parent slice is `pnpm --filter @drts/driver-app typecheck`; re-run it against the verification commit, not against this sidecar packet.
5. Two non-earnings consumers now hard-depend on the `/earnings` route: `apps/driver-app/app/onboarding.tsx` (route union + onboarding card) and `apps/driver-app/app/settings.tsx:509` (settings footer link). Verification should smoke-test that both navigate cleanly into the productized page.
