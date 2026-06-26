# P2-DP-S2-001 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Sidecar Task:** `P2-DP-S2-001-SIDECAR-ACCEPTANCE`
**Parent Task:** `P2-DP-S2-001` — Compliance `CMP_Regulator` panel scope + regulator-cases API (S2 ruling = (b), **no standalone regulator portal**)
**Sidecar Owner:** `Claude2`
**Assigned Reviewer:** `Codex`
**Parent Owner / Reviewer:** `Codex` / `Codex2`
**Phase:** `phase2-tesla-fsd-sandbox-202606`
**Last Revised:** `2026-06-26 (UTC)`
**Status:** support-only packet; parent `P2-DP-S2-001` is `in_progress` (owner `Codex`); both formal dependencies are `done` and on `dev`.

---

## 1) Scope Boundary

本 sidecar 只整理 `P2-DP-S2-001` 的 acceptance checklist、dependency map、shared-truth snapshot、repo evidence anchors 與 reviewer handoff 指引。**不修改 canonical truth，也不代替 parent 任務實作。**

- **In scope:** support-only acceptance framing、dependency mapping、目前 compliance/investigation baseline 掃描、reviewer checklist、handoff 指令。
- **Out of scope:** `CMP_Regulator` panel 主線實作、`regulator-cases` API 實作、`apps/platform-admin-web/**` 與 `apps/api/src/modules/**` runtime 變更、canvas 編修、任何 L1/L2 真相編修。

> S2 裁決 = **(b)**：不建獨立 regulator portal、不新增外部 regulator login realm。改為在既有 platform-admin Compliance 介面**擴一個 `CMP_Regulator` panel**，沿用既有 controlled export + masking 機制。本 packet 的 acceptance 必須以「擴充既有面 / 重用既有受控匯出」為框架，而不是「另起一個 portal app」。

---

## 2) Current-State Baseline (Shared Truth + Repo Scan)

以 machine truth (`ai-status.json` slice) 與目前 `origin/dev` 掃描為準（dev tip `7fcee8ff5` 時點）：

- 父任務 `P2-DP-S2-001`：`status=in_progress`、owner=`Codex`、reviewer=`Codex2`、`depends_on=[P2-UI-CMP-001, P2-DP-C1-001]`、`last_update=2026-06-26T22:42:33Z`。`next` = "Implement CMP_Regulator panel and regulator-cases API in assigned worktree"。
- 兩個正式依賴**都已 `done` 且在 `dev`**（見 §3）。代表 parent 的 route group / scopes / 既有 compliance 頁面 baseline 已就緒，parent 只需在其上擴 panel + 加 API，不需自行重建 route group 或頁面骨架。
- **`regulator-cases` API 尚未存在**於 `dev`：`grep -rn "regulator-cases" apps/api/src` 為空。這是 parent 的核心待交付 surface，不是既有 baseline。
- 既有 compliance controller (`platform-admin-compliance.controller.ts`) 已具備 parent 要重用的 **controlled export / legal hold / manifest** surfaces（見下方 anchors），與 S2(b) 的「沿用 controlled export + masking」一致。
- Canvas `compliance-screens.jsx` 已在 `dev`（30 KB），其中 `CMP_Regulator`（A6 Regulator Viewer）為 parent panel 的視覺參照：scoped read-only、PII 遮罩、去識別 active trips、evidence bundle request、「證據包請求須經 compliance 受控匯出流程核發」。

### Repo Baseline Anchors (on `origin/dev`)

- `apps/api/src/modules/platform-admin/platform-admin-compliance.controller.ts:32` — `@Controller("platform-admin")` `PlatformAdminComplianceController`，parent 的 `CMP_Regulator` API 應擴在此 controller / 對應 service，而非新 controller realm。
- `…/platform-admin-compliance.controller.ts:147` `@Get("evidence/exports")`、`:165` `@Post("evidence/exports/request")`、`:191` `@Post("evidence/exports/:exportRequestId/approve")` — **既有 controlled export surface**，S2(b) 要求 regulator export 沿用此流程（雙人覆核 / audit）。
- `…/platform-admin-compliance.controller.ts:219` `@Get("evidence/legal-holds")`、`:234` `@Post("evidence/legal-holds")`、`:260`/`:288` release-request / release-approve — **既有 legal-hold surface**，對應 §2.3 的「legal hold / masking indicator」。
- `…/platform-admin-compliance.controller.ts:130` `@Get("evidence/manifests/:manifestId")` — 既有 manifest surface，對應 §2.3 的「manifest summary」。
- `…/platform-admin-compliance.controller.ts:39/57/74` `@RequireScopes("sandbox.investigation.read")`、`:95/113` `@RequireScopes("sandbox.compliance.read")` — **既有 scope 命名慣例**（`sandbox.<area>.<action>`）。parent 新增的 regulator-cases scope 應沿用此命名形狀（例如 `sandbox.compliance.regulator.read` / `…regulator.export` 之類），不另建外部 realm。
- `apps/platform-admin-web/app/platform-admin/compliance/page.tsx`、`…/investigations/page.tsx`、`…/investigations/[caseId]/…` — CMP-001 已交付的 Compliance & Investigation 頁面骨架（parent panel 應掛在此 console 內）。
- `apps/platform-admin-web/components/sandbox-compliance-console.tsx`、`apps/platform-admin-web/lib/sandbox-compliance.ts` — 既有 compliance console 元件 + client lib，`CMP_Regulator` panel 的自然落點。
- `docs/05-ui/drts-design-canvas/compliance-screens.jsx:365-408` — `CMP_Regulator` 視覺參照（masking / scoped read-only / evidence bundle request）。

> 結論：parent acceptance **不能只看「panel 有沒有畫出來」**；必須同時確認 (a) `regulator-cases` API 真的上線且掛在既有 platform-admin compliance controller、(b) export 沿用既有 controlled-export 流程而非新通道、(c) 沒有新增外部 login realm、(d) scope 命名沿用既有慣例。

---

## 3) Dependency Map

| Dependency | Title | Status (machine truth) | On `dev`? | Anchor | 對 parent 的意義 |
|---|---|---|---|---|---|
| `P2-UI-CMP-001` | platform-admin Compliance & Investigation pages (per compliance canvas) | `done` (owner `Codex` / rev `Codex2`) | ✅ `merged_to_dev` `ad6ec640a` (PR #972) | `apps/platform-admin-web/app/platform-admin/{compliance,investigations}/**` | 提供 panel 掛載的 Compliance console 頁面骨架 |
| `P2-DP-C1-001` | platform-admin Compliance/Investigation route group + scopes + deep-links | `done` (owner `Codex` / rev `Codex2`) | ✅ `17650b25e144eb44a3d0ac56aa0344feafe39a9b` (push_branch `dev`) | `@RequireScopes("sandbox.compliance.read" / "sandbox.investigation.read")` | 提供 route group + scope 命名慣例，parent 新 scope 沿用之 |

兩依賴的 ancestor 檢查 (`git merge-base --is-ancestor … origin/dev`) 皆通過 → parent 無 dependency 阻塞，可進入 implementation。

依賴狀態取得方式（reviewer 可複現）：
```bash
AI_NAME=Claude2 scripts/ai-status.sh show P2-DP-S2-001        # parent slice
grep -h '"id": "P2-UI-CMP-001"' ai-task-archive.jsonl | tail -1   # done + ad6ec640a
grep -h '"id": "P2-DP-C1-001"'  ai-task-archive.jsonl | tail -1   # done + 17650b25e
git merge-base --is-ancestor ad6ec640a origin/dev && echo CMP-001-on-dev
git merge-base --is-ancestor 17650b25e144eb44a3d0ac56aa0344feafe39a9b origin/dev && echo C1-001-on-dev
```

---

## 4) Acceptance Checklist (derived from parent acceptance + S2(b) ruling + §2.3 element set)

Parent 的 machine-truth acceptance（單一字串）為：

> "CMP_Regulator panel shows the §2.3 elements; regulator-cases API live; no external login realm added; controlled export + masking reused; matches canvas; typecheck+build pass"

拆成可逐項驗收的 checklist：

### 4.1 `CMP_Regulator` panel — §2.3 element set
- [ ] **A. experiment / case selector** — 可選擇 experiment 與 regulator case。
- [ ] **B. manifest summary** — 顯示 evidence manifest 摘要（沿用既有 `evidence/manifests/:manifestId` 資料）。
- [ ] **C. bundle status** — 顯示 evidence bundle 狀態。
- [ ] **D. notification status** — 顯示通知狀態。
- [ ] **E. controlled export button** — 觸發**既有** controlled export 流程（不是新通道）。
- [ ] **F. legal hold / masking indicator** — 顯示 legal-hold 與 PII 遮罩狀態。
- [ ] **G. access log table** — 顯示 access log。
- [ ] **H. export receipt panel** — 顯示 export receipt。

### 4.2 `regulator-cases` API — baseline routes live
- [ ] `GET/POST /api/platform-admin/compliance/regulator-cases` 存在並回應。
- [ ] `GET /api/platform-admin/compliance/regulator-cases/{caseId}` 存在。
- [ ] `…/regulator-cases/{caseId}/exports` 存在（沿用 controlled-export 流程）。
- [ ] `…/regulator-cases/{caseId}/access-logs` 存在（對應 §2.3.G）。
- [ ] 路由掛在既有 `PlatformAdminComplianceController`（`@Controller("platform-admin")`）下，**非**新 controller realm。

### 4.3 S2(b) 結構約束（最容易在 review 被忽略）
- [ ] **No external login realm** — 沒有新增 regulator-only 登入 realm / auth provider；沿用既有 platform-admin auth + scopes。
- [ ] **Controlled export reused** — regulator export 走既有 `evidence/exports*` 受控匯出（雙人覆核 / watermark / audit），**不是**平行的新 export path。
- [ ] **Masking reused** — PII 遮罩沿用既有 compliance masking，與 canvas `CMP_Regulator` 一致（去識別 trips、乘客欄遮罩）。
- [ ] **Scope 命名慣例** — 新增 scope 沿用 `sandbox.<area>.<action>` 形狀，與既有 `sandbox.compliance.read` / `sandbox.investigation.read` 對齊。

### 4.4 Canvas 一致性
- [ ] panel 與 `compliance-screens.jsx` `CMP_Regulator`（A6）視覺/行為一致：scoped read-only、PII 遮罩 pill、evidence bundle request、「證據包請求須經 compliance 受控匯出流程核發」。

### 4.5 Gates
- [ ] `typecheck` pass（contracts + api + platform-admin-web 受影響範圍）。
- [ ] `build` pass。
- [ ] 若新增 contract type / route，`@drts/contracts` 須先 build 再驗 api typecheck（避免 unbuilt-contracts 假紅）。

---

## 5) Reviewer Verification Recipe (for `Codex`)

```bash
# 0. parent + deps machine truth
AI_NAME=Claude2 scripts/ai-status.sh show P2-DP-S2-001

# 1. regulator-cases API actually delivered (should be NON-empty after parent done)
grep -rn "regulator-cases" apps/api/src/modules/platform-admin/

# 2. routes mounted on the EXISTING compliance controller, not a new realm
grep -nE "@(Get|Post)\(|@Controller|@RequireScopes" \
  apps/api/src/modules/platform-admin/platform-admin-compliance.controller.ts

# 3. controlled export reused, not a parallel export path
grep -n "evidence/exports" apps/api/src/modules/platform-admin/platform-admin-compliance.controller.ts

# 4. no new external login realm (no new auth guard/provider for regulator)
grep -rniE "regulator.*(login|realm|auth provider|passport strategy)" apps/api/src || echo "no new realm (expected)"

# 5. panel wired in platform-admin-web compliance console
grep -rniE "regulator" apps/platform-admin-web/components apps/platform-admin-web/app/platform-admin/compliance

# 6. gates (build contracts first to avoid false api-tsc red)
pnpm --filter @drts/contracts build
pnpm --filter @drts/api typecheck
pnpm --filter platform-admin-web typecheck
```

**Review 判讀提醒：**
- `grep regulator-cases` 仍為空 → parent **未交付 API**，acceptance 4.2 未過，不可放行。
- 若出現新的 regulator auth guard / login route → 違反 S2(b) 「no external login realm」，reopen。
- 若 regulator export 走新 path（非 `evidence/exports*`）→ 違反「controlled export reused」，reopen。
- `@drts/contracts` 未 build 造成的 api typecheck 紅是假紅 → 先 build contracts 再判。

---

## 6) Handoff & Closeout

- 本 sidecar 為 support-only，`mutates_canonical=false`、`task_class=sidecar`，僅新增本檔（`support/sidecars/P2-DP-S2-001/P2-DP-S2-001-SIDECAR-ACCEPTANCE.md`）。
- Owner closeout（commit 後）：
  ```bash
  AI_NAME=Claude2 scripts/ai-status.sh handoff P2-DP-S2-001-SIDECAR-ACCEPTANCE Codex \
    "Acceptance checklist + dependency map for P2-DP-S2-001; deps P2-UI-CMP-001/P2-DP-C1-001 both done on dev; support-only, no canonical mutation"
  ```
- INTEGRATION_STATUS 預期：`branch_pushed`（support artifact，由 parent owner 決定是否吸收進主線）。
- Reviewer `Codex` approve / reopen 後，由 parent owner `Codex` 決定 packet 內容是否納入 `P2-DP-S2-001` 主線驗收。

---

## 7) Open Questions / Notes (non-blocking)

1. §2.3 element set（A–H）來自 parent `summary_zh` 對 spec §2.3 的轉述；canvas `CMP_Regulator`（A6）目前只畫到 masked active trips + evidence bundle request，**未逐一畫出** access-log table / export receipt panel / notification status。parent 實作時以 spec §2.3 element 清單為 functional 真相、canvas 為視覺基調；若兩者衝突，依 AI_COLLABORATION_GUIDE §2 product precedence（L1 spec > UI skeleton/canvas）處理並記錄。
2. 新 scope 確切字串（`sandbox.compliance.regulator.read` 等）為建議形狀，非裁定；以 parent 實作與既有 scope registry 為準。
3. regulator-cases API 在 dev 尚未存在屬正常（parent `in_progress`），非缺陷；reviewer 須在 parent `done` 之後才據 §5 step 1 判讀。
