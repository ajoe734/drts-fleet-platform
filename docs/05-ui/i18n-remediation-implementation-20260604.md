# DRTS 多語系修正實作計畫 — Ops Console & Platform Admin

- 日期：2026-06-04
- 規範依據：[i18n-multilingual-spec-20260604.md](./i18n-multilingual-spec-20260604.md)（**先讀規範**）
- 完整逐行證據：[appendix-ops-console-cjk-lines.txt](./i18n-audit-20260604/appendix-ops-console-cjk-lines.txt)、[appendix-platform-admin-cjk-lines.txt](./i18n-audit-20260604/appendix-platform-admin-cjk-lines.txt)
- 目的：把「要修正的」**逐頁、逐欄位**列出，拆成可平行開發的工作包（WP），交 supervisor + auto worker 平行執行。

---

## A. 修正方法（每個 WP 一致的施工 SOP）

1. 讀規範 §1–§7。
2. 開檔，對照 appendix 的「檔案:行」清單，把每一條顯示字串收斂進該 app 的 `lib/translations.ts`（同時補 `en` 與 `zh` 兩側，key 依 §2）。
3. 刪掉該檔內聯的 `copy()`/`tx()`/`copyText()`/`locale ===`/`{en,zh}`，改為 `const { t } = useTranslation()` 或 server 端 `t(key, locale)`。
4. 套用 §3 glossary 修掉中英夾雜；統一術語。
5. 跑 i18n guard（WP-0 交付），該檔 0 violation。
6. 對照 §7 DoD 自檢；en 與 zh 各跑一遍頁面截圖比對。

> **共享檔協調**：所有 WP 都會改各自 app 的 `lib/translations.ts`（**新增 key，不改既有**）。為降低衝突：每個 WP 只**新增**自己 domain 的 key 區塊（用 `// ── <domain> (i18n remediation 20260604) ──` 標頭），不得動別人的區塊。`translations.ts` 的 merge 衝突屬「同檔不同區塊」，可快速解。

---

## B. 工作包總表（依檔案大小/風險排序，可平行）

「CJK 行」「locale 三元」數字來自盤點，代表工作量。WP 內檔案彼此相依，故綁在同一包。

### WP-0 — 基礎建設（**hub，先做，其餘 WP 依賴**）

- 交付：
  1. i18n guard 腳本 `tools/ci/i18n-guard.mjs`（規範 §6），CI + pre-commit 接上。
  2. 修 Ops `apps/ops-console-web/lib/i18n.tsx` 預設 `en`→`zh`（規範 §5）。
  3. 在兩 app `translations.ts` 補譯 §0(7) 殘留 zh==en 鍵（Accept pending／Manual fallback／Sync failed／Channel mix／Settlement matrix／Mismatch review／Insight／Forwarded reconciliation／Legal Hold…）。
  4. 在兩 app `translations.ts` 預先建立各 domain 的 key 區塊骨架（空標頭），降低後續 WP 衝突。
- 依賴：無。**其他所有 WP 等 WP-0 的 guard + translations 區塊骨架 merge 後開工。**

### Ops Console（apps/ops-console-web）

| WP        | 路由/檔案                                                                                                                                                                                                         | CJK 行  | locale 三元 | 重點問題                                                                                                 |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ----------- | -------------------------------------------------------------------------------------------------------- |
| WP-OPS-01 | `app/callcenter/page.tsx`                                                                                                                                                                                         | 132     | 25          | 整頁中英夾雜最嚴重：session/callback/ETA/workspace/scope 滿地；多個 `{en,zh}` inline 字典                |
| WP-OPS-02 | `app/dispatch/[dispatchId]/page.tsx`                                                                                                                                                                              | 115     | 46          | L79「建立」、L415「人工覆核」純中文；timeline title 用 `locale==="zh"`；override/reconciliation/fallback |
| WP-OPS-03 | `app/complaints/page.tsx`                                                                                                                                                                                         | 115     | 1           | empty-state 物件(L346–415) 純中文；大量 `tx(locale,…)`；`{en,zh}` action 字典                            |
| WP-OPS-04 | `app/drivers/[driverId]/page.tsx` + `app/drivers/page.tsx` + `components/driver-platform-actions.tsx`                                                                                                             | 111+3   | 3+3         | drivers L355/358 純中文（已綁定/未綁定）、L1314 `locale==="zh"`；detail 全 `copy()`                      |
| WP-OPS-05 | `app/vehicles/page.tsx` + `app/vehicles/[vehicleId]/page.tsx`                                                                                                                                                     | 108+100 | 3+4         | 全 `copy()`；欄位/空狀態/降級 banner 大量                                                                |
| WP-OPS-06 | `app/contracts/page.tsx`                                                                                                                                                                                          | 108     | 3           | 全 `copy()`；KIND/COUNTERPARTY/TERM 等表頭；夾雜 forwarder/eligibility                                   |
| WP-OPS-07 | `app/maintenance/page.tsx`                                                                                                                                                                                        | 91      | 2           | 全 `copy()`；WO/排程/技師/費用；維修 vs 保修 術語統一                                                    |
| WP-OPS-08 | `app/dispatch/page.tsx` + `app/dispatch/dispatch-workflow.tsx` + `app/dispatch/forwarded-order-board.tsx` + `components/dispatch-auto-refresh.tsx`                                                                | 80+1    | 20+1+4      | `zh ? :` action label 群（L816–862）；forwarded board L235 純；6 子看板文案                              |
| WP-OPS-09 | `app/dashboard/page.tsx`                                                                                                                                                                                          | 78      | 76          | **L736–746 純中文欄位（訂單/租戶/上車地/時窗/狀態/司機）**；CTA/empty/health 全 `locale===`              |
| WP-OPS-10 | `app/incidents/[incidentId]/page.tsx` + `incident-detail-action-panel.tsx` + `refresh-tier.tsx`                                                                                                                   | 77+40+6 | 67+40+6     | `{en,zh}` empty 字典；action panel 全 `locale===`；refresh-tier L100–112 純中文 tier 詞                  |
| WP-OPS-11 | `app/incidents/page.tsx` + `app/reports/page.tsx`                                                                                                                                                                 | 19+32   | 19+2        | reports 全 `copyText()`；incidents 列表時間/狀態                                                         |
| WP-OPS-12 | `app/feature-flags/page.tsx` + `app/attendance/page.tsx`                                                                                                                                                          | 25+16   | 13+19       | flag 描述字典(L342–355) 純中文；attendance gantt 標籤                                                    |
| WP-OPS-13 | `app/approval-requests/page.tsx` + `app/approval-requests/approval-actions.tsx`                                                                                                                                   | 16+7    | 1+1         | approval-actions **未接 i18n**（全 `copy()`，須改）；表頭 REQUEST/TENANT…                                |
| WP-OPS-14 | `components/ops-assistant/*`（assistant-widget、context-provider、publish）+ `components/ops-shell.tsx` + `app/layout.tsx` + `app/error.tsx` + `app/page.tsx` + `lib/ops-shell-nav.ts` + `lib/ops-empty-state.ts` | 殼層    | —           | 助理 widget UI chrome、shell nav、error/empty 通用文案；確認都走 `t()`                                   |

### Platform Admin（apps/platform-admin-web）

| WP        | 路由/檔案                                                                                                                                                                        | CJK 行      | locale 三元 | 重點問題                                                                                              |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ----------- | ----------------------------------------------------------------------------------------------------- |
| WP-ADM-01 | `app/pricing/page.tsx`                                                                                                                                                           | 59          | —           | **整頁幾乎只有中文、未接雙語**：發佈版本/生效開始/名稱/`NT$ 85 / 起`/setPublishError 全硬編；最高優先 |
| WP-ADM-02 | `app/partners/[entrySlug]/page.tsx` + `app/partners/page.tsx`                                                                                                                    | 101+13      | 49+1        | per-page `copy` 巨物件；credential/secret/entry 夾雜；modal 文案多                                    |
| WP-ADM-03 | `app/fleet/page.tsx`                                                                                                                                                             | 98          | 71          | 全 `locale===` 表頭群；offboarding/exclusivity 狀態詞；action label 字典(L293–307) 純中文             |
| WP-ADM-04 | `app/switchboard/page.tsx`                                                                                                                                                       | 80          | 3           | per-page `copy` 巨物件（牌貼/版本/稽核憑據）；多為純中文需補 en                                       |
| WP-ADM-05 | `app/feature-flags/page.tsx`                                                                                                                                                     | 64          | 6           | per-page `copy` 物件；rollout/override/tenant 夾雜                                                    |
| WP-ADM-06 | `app/tenants/page.tsx` + `app/tenants/[tenantId]/page.tsx`                                                                                                                       | 48+12       | 7+1         | tenant detail L235–240/619/693/761/770/803 **純中文**；list `copy` 物件含整段 nav 字典                |
| WP-ADM-07 | `app/payments/reimbursements/[batchId]/page.tsx` + `app/payments/reimbursements/page.tsx`                                                                                        | 43+7        | 47+3        | reimbursements list **純中文**(L128/256/440/452/465/478)；batch 全 `locale===`                        |
| WP-ADM-08 | `app/page.tsx`（home） + `components/admin-shell.tsx` + `components/assistant/route-context.ts` + `components/assistant/platform-assistant-overlay.tsx`                          | 43+31+25+15 | 15+14       | home `copy` 物件；shell nav 字典；route-context `{zh,en}` title 群；assistant overlay 純中文 chrome   |
| WP-ADM-09 | `app/notices/page.tsx` + `app/health/page.tsx`                                                                                                                                   | 38+37       | 4+23        | health L282–294 狀態詞 **純中文**；notices `copy` 物件                                                |
| WP-ADM-10 | `app/payments/page.tsx` + `app/audit/page.tsx`                                                                                                                                   | 34+16       | 12+1        | payments `copy` 物件含 reconciliation/queue 夾雜；audit `copy` 物件                                   |
| WP-ADM-11 | `app/adapter-registry/page.tsx` + `app/adapter-registry/components/AdapterList.tsx` + `app/adapter-registry/components/EditAdapterModal.tsx` + `app/adapter-registry/layout.tsx` | 32+10       | 1+1         | adapter 夾雜最多(×34)；EditAdapterModal/layout **未接 i18n**                                          |
| WP-ADM-12 | `app/users/page.tsx` + `app/tenant-governance/page.tsx` + `components/mgmt/MgmtComponents.tsx` + `components/platform-ui.tsx`                                                    | 25+19       | 1+7         | tenant-gov L144–149 狀態詞純中文；users `copy` 物件；mgmt/platform-ui 共用元件未接 i18n               |
| WP-ADM-13 | `app/feature-flags`（共用）/ `components/assistant/*`（Composer、MessageList、ReceiptCard、ActionPlanCard、ConfirmationPanel）                                                   | —           | —           | 5 個 assistant 子元件**完全未接 i18n**，UI chrome 須改 `t()`                                          |

> 注意：盤點以「含 CJK 行」為主訊號，故**純英文硬編碼**（en 模式正常、zh 模式露英文）需各 WP 在開檔時用 guard 規則 3 一併抓出清掉。各 WP 的 appendix 行號是起點，不是上限——以「整檔 0 violation」為準。

---

## C. 逐 WP 的「每一個欄位」清單來源

每個 WP 的精確逐行清單，直接對應 appendix 檔內該檔的 `=====` 區塊。Worker 開工時：

```
# Ops 範例：取 callcenter 的完整逐行待修清單
awk '/===== .*callcenter\/page.tsx =====/{f=1;next} /^===== /{f=0} f' \
  docs/05-ui/i18n-audit-20260604/appendix-ops-console-cjk-lines.txt
```

該輸出即 WP-OPS-01 的「每一行、每一欄位」修正起點。Admin 同理換 appendix 檔。

---

## D. 執行順序與相依

1. **WP-0 先行**（guard + ops i18n 預設 + translations 區塊骨架 + 字典補譯）。
2. WP-0 merge 後，**Ops 14 包 + Admin 13 包可全平行**（各自 domain key 區塊，translations.ts 僅新增不改既有）。
3. 收尾：再跑一次全庫 i18n guard，0 violation 才算整體完成；補一輪 en/zh 雙語截圖回歸（建議 `tests/e2e/` 加 locale 切換驗收）。

## E. 風險與緩解

- **translations.ts 衝突**：靠「只新增、分區塊、加標頭」緩解；WP-0 先佈骨架。
- **code 值顯示**：`formatOpsCodeLabel`/`formatPlatformCodeLabel` 須改為查字典（WP-0 或最先觸及的 WP 處理，列入 WP-0 caveat）。
- **漏抓純英文**：靠 guard 規則 3；DoD 要求 zh 模式整頁無英文殘留。
