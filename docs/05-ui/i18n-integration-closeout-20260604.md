# i18n Remediation — Integration Closeout 判讀（2026-06-04）

承 [i18n-remediation-implementation-20260604.md](./i18n-remediation-implementation-20260604.md)。盤點派工後，worker 已把 29 個 WP 做到**分支層級 done**，但 **0 個進 dev、0 個開實作 PR**，且有重工/污染。本文件是整合收尾判讀。

## 1. 現況事實

- **覆蓋完整**：29 個 WP 每個都有 ≥1 條遠端分支。
- **0 整合**：`origin/dev` 無任何 I18N WP commit；無 WP 實作 PR（只有 #517 文件、#528 修 bug、5 個 unblock/planning DRAFT）。
- **品質**：分支幾乎全 clean（改動鎖在對的 app + 共享 translations.ts，0 off-scope）。
- **重工**：11 個 WP 有 codex + codex2 兩條分支。
- **共同地雷**：i18n 重構讓 `useTranslation().t` 每 render 重建 → users 頁 429 refetch loop。**#528** 已用 `useCallback([locale])` memoize 修好（MERGEABLE/CLEAN、4 CI 全綠）。

## 2. 重複分支判讀（11 WP）

| WP                                             | codex vs codex2  | 處置                                 |
| ---------------------------------------------- | ---------------- | ------------------------------------ |
| OPS-01                                         | **IDENTICAL**    | 任選一條，關另一條                   |
| OPS-04, OPS-07, OPS-11                         | 分歧（譯法不同） | reviewer 比對 zh glossary 合規後擇優 |
| ADM-01, ADM-03, ADM-05, ADM-10, ADM-11, ADM-13 | 分歧             | reviewer 擇優                        |

單一分支（直接採用）：OPS-02(codex2)、03(codex2)、05(codex2)、06(codex2)、08(codex2)、09(codex)、10(codex2)、12(codex)、13(codex2)、14(codex)；ADM-02(codex)、04(codex)、06(codex2)、07(codex2)、08(codex)、09(codex2)、12(codex)。

## 3. WP0（hub）內容確認 — `origin/claude/i18n-wp0`，可合

`.github/workflows/ci.yml`（接 guard 到 CI）、`.husky/pre-commit`（pre-commit）、`tools/ci/i18n-guard.mjs` + `i18n-guard-baseline.json`、兩 app `lib/i18n.tsx`、`lib/localized-labels.ts`（formatOpsCodeLabel 搬遷）、兩 app `translations.ts` 骨架。**與 #528 都改 i18n.tsx → 合併時需併兩處編輯**（WP0 改預設 en→zh；#528 加 t memoize）。

## 4. 建議：INTEGRATION bundle（仿先前 ASSIST-INTEGRATION 做法）

逐 WP 開 27 個 PR + 序列解 translations.ts 衝突太碎。建議：

1. **先合 #528**（t 穩定化，獨立、CI 綠）。
2. 開 `integration/i18n-bilingual-20260604`（base dev），**先疊 WP0**（解 i18n.tsx 與 #528 的併點）。
3. 依序 merge 各 WP 的 canonical 分支進 bundle；translations.ts 衝突屬「同檔不同 domain 區塊」（WP0 已鋪骨架），快速解。10 個分歧 WP 在此步由 reviewer 擇優。
4. bundle 上跑 `node tools/ci/i18n-guard.mjs` 須 0 violation + 兩 app typecheck/build。
5. 一個 PR 進 dev → 部署 → 用 §3 實機驗收（en 模式 0 中文殘留）。
6. 關閉所有 unblock/sidecar/loser 分支。

VERIFY（I18N-VERIFY）對應第 4–5 步。

## 5. 待決（需 chair/你拍板）

- merge #528 到 dev：可立即（已驗證）。
- 採 bundle 還是逐 PR：建議 bundle。
- 10 個分歧 WP 擇優：需 reviewer 比對（或指定一律採某一 lane 為主、另一作為對照）。
