# GAP-VERIFY Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `GAP-VERIFY` — Re-run dev browser gap audit and refresh scoreboard evidence
**Current Sidecar Owner:** `Claude`
**Assigned Reviewer:** `Codex`
**Parent Owner:** `Codex` (reviewer `Claude`)
**Sidecar Task ID:** `GAP-VERIFY-SIDECAR-ACCEPTANCE`
**Last Revised:** `2026-06-04T02:39:48Z (UTC)`
**Status:** `review` — owner `Claude` handed packet to reviewer `Codex`.

---

## 1) Scope Boundary

本 sidecar 只整理 `GAP-VERIFY` 的 acceptance checklist、dependency map、現況基線與 reviewer handoff 指引；不修改 canonical truth，也不代替 parent 任務執行瀏覽器稽核或改寫 scoreboard。

- **In scope:** support-only acceptance framing、dependency 合併/部署狀態核對、per-route / per-bug 驗收矩陣、readiness gate、reviewer checklist。
- **Out of scope:** 實際在 dev 重跑 39-route 瀏覽器稽核、改寫 `docs/05-ui/dev-runtime-functional-gap-report-20260603.md` 的 §1/§3 scoreboard、修改 L1/L2 真相、改寫 machine truth（`ai-status.json` / `current-work.md` / `ai-activity-log.jsonl`）。
- 本 packet 為 advisory support material；是否吸收進主線由 parent owner `Codex` 決定。

---

## 2) Parent Task Framing (from machine truth)

以 `scripts/ai-status.sh show GAP-VERIFY` 為準（讀取於 `2026-06-04T02:39Z`）：

- 父任務 `GAP-VERIFY`：`status=in_progress`，Owner=`Codex`，Reviewer=`Claude`，phase=`dev-runtime-gap-fixes-202606`。
- Artifacts：`docs/05-ui/dev-runtime-functional-gap-report-20260603.md`、`.artifacts/func-audit/`。
- `next`：「Re-running dev browser gap audit and refreshing scoreboard evidence」。
- 報告 §6 意圖（摘 `summary_zh`）：上述修復都 merge + 部署到 dev 後，重跑瀏覽器稽核（HTTP 全 route + 視覺/功能），確認 ops 4 個 500 全清、`/fleet` 單殼、`/pricing` tab 正常、payments/attendance tab 手動覆核，產出更新後的 scoreboard 與截圖對照，覆寫報告 §1/§3。

### Parent acceptance criteria (verbatim)

1. **All 39 routes verified on dev: 0 HTTP 500** (ops 21 + admin 18).
2. **Single shell everywhere** (一個 sidebar、一個 `<main>` landmark / route).
3. **All tab strips round-trip; report scoreboard updated to 0 broken.**

> 註：parent acceptance 明確要求「**verified on dev**」。本 packet 不能、也不主張代替 dev 部署後的瀏覽器稽核；它只核對「達成該稽核所需的修復是否已落地 dev」並提供逐項驗收骨架。

---

## 3) Dependency Map & Integration State

四個正式 dependency 的 machine-truth 狀態與**對 origin/dev 的可達性**（`git fetch` 後 `git merge-base --is-ancestor` 核對於 `2026-06-04T02:39Z`）：

| Dependency | Status | Owner / Rev | Branch commit (ai-status) | On `origin/dev`? | Merge PR | Verify focus |
|---|---|---|---|---|---|---|
| `GAP-OPS-LIST-RSC` | `done` | Codex / Claude | `721b615f` | ✅ YES (`721b615f`) | #509 | `/drivers` `/vehicles` `/contracts` → 200, rows render |
| `GAP-PA-FLEET-SHELL` | `done` | Claude / Codex | `5ccc54cd` (`branch_pushed`) | ✅ YES — squash-merged as `1256f6d9` | #508 | `/fleet` single PLATFORM ADMIN shell, one `<main>` |
| `GAP-PA-PRICING-TABS` | `done` | Codex2 / Claude | `48ac41ed` | ✅ YES (`48ac41ed`) | #510 | `/pricing` 4 tabs round-trip + reload-persist |
| `GAP-E2E-SUITE` | `done` | Claude / Codex2 | `1a9571ea` (`branch_pushed`) | ⚠️ **NO** — branch only | none merged | Deterministic 39-route regression guard |

### 3.1 Key integration finding — GAP-E2E-SUITE not yet on dev

- 三個**功能修復** dep（OPS-LIST-RSC / PA-FLEET-SHELL / PA-PRICING-TABS）皆已 reachable from `origin/dev`，因此 parent 的 dev 瀏覽器稽核**所需的程式碼基線已就緒**。
  - `GAP-PA-FLEET-SHELL` 的 ai-status `commit_hash=5ccc54cd` 是 task branch tip；其內容經 PR **#508 squash-merge** 成 `origin/dev@1256f6d9`，故 SHA 不同但修復確在 dev。已驗證 `origin/dev:apps/platform-admin-web/app/fleet/page.tsx` 不再含 `<CanvasShell>` / `buildPlatformNav`（單殼成立）。
- `GAP-E2E-SUITE` 為 `done` 但 `INTEGRATION_STATUS=branch_pushed`：`tests/e2e/deterministic-route-suite.spec.ts` 與 `tests/e2e/README-route-suite.md` 目前**只存在於 `origin/claude/gap-e2e-suite`，不在 `origin/dev`**（dev 的 `tests/e2e/` 仍為 E2E-001…010 shell smoke + 既有 bootstrap/parity/assistant spec）。
  - **影響：** parent GAP-VERIFY 的一次性瀏覽器稽核**可在現有 3 個已 merge 的修復上進行**並產生 scoreboard；但「持續性迴歸保護」（CI 在每次 PR 自動抓 fleet 雙殼 / pricing tab / 三頁 500）要等 GAP-E2E-SUITE 併入 dev 才生效。
  - 這是一個 **integration-layer 後續項**，非 GAP-VERIFY 的稽核 blocker。建議在 scoreboard 旁記註：scoreboard=0-broken 由手動稽核確立，回歸自動化待 e2e suite 併 dev。

---

## 4) Acceptance Verification Matrix

下列為 GAP-VERIFY 三條 acceptance 的可勾稽展開，僅作支援骨架，不新增產品語意。狀態欄保持未勾選 `[ ]`，由 parent owner 在 dev 稽核後填寫並貼 evidence（`.artifacts/func-audit/` 截圖 + HTTP 表）。

### AC-1 — 0 HTTP 500 across all 39 routes

- [ ] 21 個 ops-console route 全部 HTTP 200（或合法非-500，如 401/redirect）。
- [ ] 18 個 platform-admin route 全部 HTTP 200。
- [ ] 報告 §2.2 三頁 RSC 500 已清：`/drivers` `/vehicles` `/contracts` 在可達 API 下回 200 且**有資料列渲染**（非僅空狀態 200）。— guard: `GAP-OPS-LIST-RSC` (#509, on dev)
- [ ] 報告 §2.1 `/revenue` 500 已清（server client 修復 #506 `44ae425b`，已在 dev；非本 task 正式 dep 但屬同一 4×500 群組，稽核需一併覆核）。

### AC-2 — Single shell everywhere

- [ ] `/fleet` 只渲染一個 PLATFORM ADMIN sidebar、單一 `<main>` landmark（雙殼 §2.3 已修）。— guard: `GAP-PA-FLEET-SHELL` (#508, on dev)
- [ ] 抽樣覆核其他 PA + ops route：`app/layout.tsx` 的 `AdminShell` / Ops shell 為唯一外殼，無頁面內再包 `<CanvasShell>`。

### AC-3 — Tab strips round-trip + scoreboard refreshed

- [ ] `/pricing` 四 tab（passenger / driver / subsidy / history）逐一點擊內容變更且可來回；reload 後維持當前 tab（URL 為單一真實來源）。— guard: `GAP-PA-PRICING-TABS` (#510, on dev)
- [ ] 報告 §2.4 列出的 payments / attendance tab strip 手動覆核 round-trip。
- [ ] 其餘有 tab strip 的 route 抽樣 round-trip 無回退失敗。
- [ ] `docs/05-ui/dev-runtime-functional-gap-report-20260603.md` §1/§3 scoreboard 更新為 **0 broken**，並附稽核日期 + 部署 SHA。
- [ ] （建議）scoreboard 註記回歸自動化狀態：GAP-E2E-SUITE 待併 dev（見 §3.1）。

### AC-4 — Evidence captured

- [ ] `.artifacts/func-audit/` 內含 39-route HTTP 結果表 + 修復前/後截圖對照（至少涵蓋 fleet 單殼、pricing tab、三頁 500）。
- [ ] 稽核所對應的 dev 部署 run（`Deploy - Dev` URL / SHA）已記錄，以證明 acceptance 的「on dev」字面要求。

---

## 5) Readiness Gate (advisory)

| Gate | 狀態 | 說明 |
|---|---|---|
| 功能修復程式碼在 dev | ✅ READY | OPS-LIST-RSC / PA-FLEET-SHELL / PA-PRICING-TABS（+ OPS-REVENUE）皆 reachable from `origin/dev`。 |
| 稽核可開跑 | ✅ READY | parent 可在現行 `origin/dev` 上重跑 39-route 瀏覽器稽核並刷新 scoreboard。 |
| 自動化迴歸保護在 dev | ⚠️ PENDING | GAP-E2E-SUITE (`1a9571ea`) 仍 `branch_pushed`；deterministic-route-suite 未併 dev。屬 integration 後續，不阻擋稽核。 |
| dev 部署 evidence | ⛔ OPEN（parent 負責） | acceptance 要求「on dev」+ scoreboard，需 parent 在稽核後補 `Deploy - Dev` run 與截圖。 |

**Bottom line:** GAP-VERIFY 的稽核**沒有 code-readiness blocker**——三個功能修復已在 dev。唯一未閉合的整合項是 GAP-E2E-SUITE 尚未併 dev（影響持續迴歸保護，非一次性稽核）。

---

## 6) Reviewer Checklist (`Codex`)

- [ ] §3 dependency 表的 merge 可達性與 PR 編號正確（可用 `git merge-base --is-ancestor <sha> origin/dev` 重核）。
- [ ] §3.1 對 `GAP-PA-FLEET-SHELL` squash-merge（branch `5ccc54cd` → dev `1256f6d9`）的判定正確；`/fleet` on dev 確為單殼。
- [ ] §3.1 對 `GAP-E2E-SUITE` 未併 dev 的判定正確（`deterministic-route-suite.spec.ts` 不在 `origin/dev`）。
- [ ] §4 驗收矩陣未越權新增產品語意，僅展開 parent 既有 acceptance。
- [ ] 確認本 sidecar 未改 canonical truth（diff 僅 `support/sidecars/GAP-VERIFY/`）。

---

## 7) Evidence Anchors

- machine truth: `scripts/ai-status.sh show GAP-VERIFY | GAP-OPS-LIST-RSC | GAP-PA-FLEET-SHELL | GAP-PA-PRICING-TABS | GAP-E2E-SUITE`
- merge reachability: `git merge-base --is-ancestor <sha> origin/dev`
- dev log: `git log origin/dev --oneline`（#506 `44ae425b`、#508 `1256f6d9`、#509 `721b615f`、#510 `48ac41ed`）
- e2e branch artifact: `git ls-tree -r origin/claude/gap-e2e-suite --name-only tests/e2e/`（含 `deterministic-route-suite.spec.ts`、`README-route-suite.md`）
- fleet single-shell on dev: `git show origin/dev:apps/platform-admin-web/app/fleet/page.tsx`（無 `CanvasShell` / `buildPlatformNav`）
- parent report (parent-owned, on Codex branch): `docs/05-ui/dev-runtime-functional-gap-report-20260603.md`

---

## 8) Handoff

- Owner `Claude` → Reviewer `Codex`：support-only packet，無 canonical 改動，`INTEGRATION_STATUS=not_applicable`（sidecar，`NO_COMMIT_REQUIRED` 適用但本 packet 仍以 task-scoped commit 落盤以利追溯）。
- 通過後 parent owner `Codex` 可將 §3.1 / §5 的 readiness 結論吸收進 GAP-VERIFY 稽核流程；§3.1 的 e2e-未併-dev 提醒建議轉成一條 integration follow-up。
