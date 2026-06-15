# I18N3-VERIFY Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `I18N3-VERIFY`  
**Current Sidecar Owner:** `Codex`  
**Assigned Reviewer:** `Claude2`  
**Last Revised:** `2026-06-15T02:22:18Z`  
**Status:** `in_progress`

---

## 1) Scope Boundary

本 sidecar 只整理 `I18N3-VERIFY` 的 acceptance checklist、dependency map、integration readiness 與 reviewer handoff 指引；不改 canonical truth，不代替 parent task 執行全量 i18n 稽核或實作修復。

- **In scope:** support-only acceptance framing、7 個 dependency 的 machine-truth 狀態彙整、驗收矩陣、整合殘留風險標註、reviewer checklist。
- **Out of scope:** 修改任何 app runtime、`scripts/i18n-guard.mjs`、CI workflow、L1/L2 canonical truth、或直接改寫 machine truth 主資料。
- 本 packet 是 parent owner / reviewer 的支援材料；是否吸收進主線由 parent owner `Claude2` 決定。

---

## 2) Parent Task Framing (from machine truth)

以 `AI_NAME=Codex scripts/ai-status.sh show I18N3-VERIFY` 為準（讀取於 `2026-06-15T02:22Z`）：

- 父任務 `I18N3-VERIFY`：`status=in_progress`，Owner=`Claude2`，Reviewer=`Claude`。
- 依賴：`I18N3-PARTNER-BOOKING`、`I18N3-ENTDISPATCH`、`I18N3-OPS`、`I18N3-PLATADMIN`、`I18N3-BANK`、`I18N3-FLEET`、`I18N3-GUARD`。
- Parent summary 聚焦：
  - 對全部 9 個 app 跑 `scripts/i18n-guard.mjs` 達 `0 violation`
  - 對有改動的 app 跑 `eslint`、`typecheck`、`next build` 全綠
  - 抽查 `en/zh` 兩語渲染正確、glossary 一致

### Parent acceptance criteria (machine truth)

1. `i18n-guard` across all 9 apps reports `0 violations`
2. Changed apps pass `eslint + typecheck + build`
3. `en/zh` both render correctly and remain glossary-consistent

> 註：這個 sidecar 不能宣稱 parent acceptance 已完成；它只整理「哪些 prerequisite 已完成、還有哪些 integration residue 要在 verify 時留意」。

---

## 3) Dependency Map & Readiness

| Dependency | Status | Owner / Reviewer | Integration state from machine truth | Verify implication |
| --- | --- | --- | --- | --- |
| `I18N3-PARTNER-BOOKING` | `done` | `Claude2 / Claude` | `next`: operator-integrated to `dev`; guard `0`; baseline trimmed `22 -> 10` | Partner booking app 可視為已納入 parent 全量 guard 基線 |
| `I18N3-ENTDISPATCH` | `done` | `Codex / Claude2` | `next`: operator-integrated to `dev`; real i18n complete; guard `0` | Enterprise dispatch app 已 ready for umbrella verification |
| `I18N3-OPS` | `done` | `Claude / Codex` | Main cleanup on `origin/dev` at `bc2b759`; **residual follow-up `c461484` not on `origin/dev`** | Parent verify 應明確註記：guard `0` cleanup 已在 dev，但 zh list separator follow-up 尚未整合 |
| `I18N3-PLATADMIN` | `done` | `Claude / Codex` | `next`: operator-integrated to `dev`; guard `0`; baseline trimmed to 1 justified exemption | Platform admin app 已 ready；verify 時要接受 justified exemption 仍存在 |
| `I18N3-BANK` | `done` | `Claude2 / Gemini2` | Reconciled from `origin/dev@a726e122166f` | Bank console 已在 dev，可直接納入 umbrella verification |
| `I18N3-FLEET` | `done` | `Claude2 / Codex` | Reconciled from `origin/dev@2752fc6ec782` | Fleet portal 已在 dev，可直接納入 umbrella verification |
| `I18N3-GUARD` | `done` | `Codex / Claude` | `integration_status=merged_to_dev`; commit `6363083dd` | 全 9 app guard/CI 基線已建立，是 parent verify 的主要 gate |

### 3.1 Key integration finding

`I18N3-OPS` 雖為 `done`，但 machine truth 明確記錄一個 **非 blocker 但應揭露的整合殘留**：

- `ops-console-web` 的 286-violation i18n cleanup 已在 `origin/dev`。
- reviewer-approved follow-up `c461484` 尚未回到 `origin/dev`。
- 影響面不是 guard regress，也不是 acceptance 主 gate 失敗；是 **zh callcenter flag/compliance lists 仍可能用 English `, ` 而不是 `、`**。

這代表 parent `I18N3-VERIFY` 在做 umbrella 驗收時，應把它列為：

- `guard/build` 層面：**READY**
- `copy polish / zh punctuation` 層面：**KNOWN RESIDUAL**

### 3.2 Dependency bottom line

- 7 個正式 dependency 都已達 machine-truth `done`
- `I18N3-GUARD` 已 merged to `dev`，因此 umbrella verify 所需 guard baseline 已就緒
- 沒有任何 dependency 仍處於 `backlog` / `in_progress` 而阻止 parent 執行全量 verification
- 唯一需要在 handoff 明示的是 `I18N3-OPS` 的 zh punctuation residual，不應被誤寫成 parent blocker

---

## 4) Acceptance Verification Matrix

以下矩陣只展開 parent 既有 acceptance，不新增產品語意。勾選應由 parent owner / reviewer 在正式 verify 時填入。

### AC-1: `i18n-guard` across all 9 apps = `0 violations`

- [ ] `node scripts/i18n-guard.mjs` 對 9 apps 的總結果為 `0 violations`
- [ ] justified exemption 只有預期保留項，沒有新增未審核例外
- [ ] 若 guard output 與 dependency `done` 狀態衝突，先以當前 guard evidence 為準並回寫 machine truth

### AC-2: Changed apps pass `eslint + typecheck + build`

- [ ] 所有此次 umbrella verify 覆蓋到的 changed apps 均有對應綠燈 evidence
- [ ] 若 parent verify 只重跑 umbrella gates，需明確列出沿用的 per-app verification 來源
- [ ] `I18N3-GUARD` 的 CI wiring 仍生效，沒有 guard-only pass 但 build regress 的情況

### AC-3: `en/zh` render correctly and glossary stays consistent

- [ ] 抽查至少涵蓋 partner booking、enterprise dispatch、ops console、platform admin、bank、fleet
- [ ] `booking / trip / receipt / dispatch / driver / passenger / pickup / drop-off / review` glossary 對齊
- [ ] 沒有回退成 inline `{en,zh}` map、`locale === "zh" ? a : b` ternary、或硬編碼 JSX 文案
- [ ] `I18N3-OPS` 的 zh callcenter list punctuation residual 若仍存在，於驗收紀錄中單列為 known residual

---

## 5) Readiness Gate

| Gate | State | Notes |
| --- | --- | --- |
| Dependency tasks complete | `READY` | 7/7 dependency tasks are `done` in machine truth |
| Guard baseline on `dev` | `READY` | `I18N3-GUARD` already recorded as `merged_to_dev` |
| Umbrella verification can start | `READY` | No upstream task remains open |
| Known residuals fully cleared | `PARTIAL` | `I18N3-OPS` punctuation follow-up is still stranded off `origin/dev` |

**Bottom line:** `I18N3-VERIFY` 沒有 dependency blocker。正式 verify 可以直接進行，但 reviewer 應要求 parent 驗收紀錄區分：

- 主 gate：all-app guard/build/render correctness
- 殘留提醒：`I18N3-OPS` zh punctuation follow-up 尚未進 dev

---

## 6) Reviewer Checklist (`Claude2`)

- [ ] 確認本 packet 僅引用 machine truth 與支援性整合結論，沒有改寫 canonical truth
- [ ] 確認 7 個 dependency 的 `done` 狀態與表內摘要一致
- [ ] 確認 `I18N3-GUARD` 已是 umbrella verify 的有效前提
- [ ] 確認 `I18N3-OPS` residual 被正確描述為 non-blocking integration residue，而非 parent blocker
- [ ] 確認 parent handoff 時應要求實際 guard/build/render evidence，而不是只依賴各子任務 `done`

---

## 7) Evidence Anchors

- `AI_NAME=Codex scripts/ai-status.sh show I18N3-VERIFY`
- `AI_NAME=Codex scripts/ai-status.sh show I18N3-PARTNER-BOOKING`
- `AI_NAME=Codex scripts/ai-status.sh show I18N3-ENTDISPATCH`
- `AI_NAME=Codex scripts/ai-status.sh show I18N3-OPS`
- `AI_NAME=Codex scripts/ai-status.sh show I18N3-PLATADMIN`
- `AI_NAME=Codex scripts/ai-status.sh show I18N3-BANK`
- `AI_NAME=Codex scripts/ai-status.sh show I18N3-FLEET`
- `AI_NAME=Codex scripts/ai-status.sh show I18N3-GUARD`

---

## 8) Handoff Notes

- 這份 sidecar 是 **support artifact only**
- 未修改 app/runtime/CI/canonical spec
- parent owner 在完成 umbrella verify 後，應把實際 guard/build/render evidence 連同 residual 判定交給 parent reviewer
- 本 packet 建議 reviewer 在 parent 驗收時特別核對 `I18N3-OPS` residual 是否已另外整合；若未整合，也不應倒推否定全量 i18n cleanup 已完成的事實
