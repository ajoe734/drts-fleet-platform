# SR-QA-BOOKING-001-FIX-QUOTA-RELEASE-STALE-GAP-ASSERTIONS — C028 額度釋放修復後缺口重現測試斷言更新

- **Task ID**: `SR-QA-BOOKING-001-FIX-QUOTA-RELEASE-STALE-GAP-ASSERTIONS`
- **Owner**: `Gemini`
- **Reviewer**: `Gemini2`
- **Wave / Phase**: `system-remediation-20260906`
- **Capability ID**: `C028`
- **Depends on**: `SR-QA-BOOKING-001-FIX-QUOTA-RELEASE`
- **Source Commit**: `4b62cf4d7dbc2363870a1e1faa8149a1a1a1d926`
- **Base Commit**: `4b62cf4d7dbc2363870a1e1faa8149a1a1a1d926` (on `origin/dev`)
- **Execution Branch**: `gemini/sr-qa-booking-001-fix-quota-release-stale-gap-assertions`

---

## 1. 問題背景與過期斷言分析 (Background & Stale Assertion Analysis)

### 1.1 歷史沿革與缺口重現
在 `SR-QA-BOOKING-001` 任務執行驗收期間，針對 C028（租戶額度預留、消費與取消返還）進行原始碼分析，發現了既有系統的業務缺口：
- `owned-mobility.service.ts` 的 `cancelOwnedOrder()` 與 `cancelTenantBooking()` 在取消訂單時，全程未呼叫 `tenantPartnerService`。
- `tenant-quota-ledger.ts` 的 `buildQuotaLifecycleEntrySpecs()` 雖然已支援 `"cancel" -> "release"` 的 ledger entry 轉換，但生產路徑從未觸發。
- 因此，取消租戶訂單完全不會釋放建單時預留的額度，`pendingReservedBookingCount` 永久停留，額度用盡後即使取消訂單仍無法再次建單。

依據 verification-only 任務紀律，`SR-QA-BOOKING-001` 不得在未授權 write_scopes 外修改業務邏輯，因此在 `tests/unit/system-remediation/sr-qa-booking-001/c028-tenant-quota-reservation-and-cancellation-gap.test.ts` 中設計了三項「現況缺陷重現，非預期通過」的斷言（`gap-1`、`gap-2`、`gap-3`），藉此鎖定缺陷並建立修復子任務 `SR-QA-BOOKING-001-FIX-QUOTA-RELEASE` 追蹤。

### 1.2 業務修復交付與斷言過期
隨後，子任務 `SR-QA-BOOKING-001-FIX-QUOTA-RELEASE`（PR #2029, commit `acfe53f6533ca2d74379c3b2b4dd7ff0c92d1bfc`）正式實作修復：
1. 在 `cancelTenantBooking` / `cancelOwnedOrder` 執行時，呼叫 `tenantPartnerService.recordQuotaLedger()` 寫入 `release` 分錄。
2. 釋放建單時預留的 `pendingReservedBookingCount` 與金額。
3. 騰出的配額即時可用於後續訂單建立。

當 release 整合任務 `SR-RELEASE-001` 同步 `origin/dev`（同時納入 commit `acfe53f65` 的額度釋放修復與 commit `4b62cf4d7` 的 `SR-QA-BOOKING-001` v2）並重跑全庫測試時，原 `c028-tenant-quota-reservation-and-cancellation-gap.test.ts` 的 `gap-1`、`gap-2`、`gap-3` 斷言全部失敗：
- `gap-1` 預期「沒有 release 分錄」（`ledger.some(entry => entry.entryType === "release") === false`），但修復後實際已產生 release 分錄（received: `true`）。
- `gap-2` 預期「pendingReservedBookingCount 殘留 1」，但修復後實際已正確歸零（received: `0`）。
- `gap-3` 預期「取消一筆後第三筆建單仍會因 QUOTA_INSUFFICIENT_AT_COMMIT 被拒絕」，但修復後實際建單成功（promise resolved）。

由於這三項斷言原本驗證的是「缺陷的現況」，在修復完成後這些斷言本身已過期（stale）。本任務的目標是將這三項斷言改寫為驗證「修復後正確行為」的回歸測試（regression suite），同時完整保留缺口重現的歷史沿革紀錄。

---

## 2. 斷言改寫與驗收落實 (Assertion Modernization Details)

依據驗收標準（Acceptance Criteria）：
> gap-1/gap-2/gap-3 三項斷言依 SR-QA-BOOKING-001-FIX-QUOTA-RELEASE 修復後之正確行為改寫（release 分錄存在、pendingReservedBookingCount 歸零、額度騰出後可再次建單），並保留原始 gap 重現的沿革説明（改為 regression 而非 bug reproduction）;同 candidate review/CI/merge 完備才可結案。

### 2.1 沿革說明保留
- 在 `c028-tenant-quota-reservation-and-cancellation-gap.test.ts` 頂部註解中，更新 2.x 區塊之沿革歷程：詳細記載原 `SR-QA-BOOKING-001` 缺口重現、`SR-QA-BOOKING-001-FIX-QUOTA-RELEASE` 修復接通，以及本任務將過期斷言更新為回歸防線的完整脈絡。
- 將測試區塊描述由 `SR-QA-BOOKING-001 / C028 [產品缺口重現，非預期通過]: 取消租戶訂單不釋放已預留額度` 更新為 `SR-QA-BOOKING-001 / C028 [回歸驗證，原產品缺口已修復]: 取消租戶訂單釋放已預留額度 (原 gap-1/gap-2/gap-3 回歸防線)`。

### 2.2 各斷言改寫項目
1. **`gap-1` [回歸驗證／原現況缺陷已修復] 取消訂單後 quota ledger 確實新增 release 分錄**：
   - 保留沿革註解。
   - 驗證 `ledger.filter(entry => entry.entryType === "release")` 長度至少為 1。
   - 驗證 `dimension: "booking_count"` 的 release 分錄存在，且 `tenantId`、`bookingId`、`amount: 1` 精確匹配。
2. **`gap-2` [回歸驗證／原現況缺陷已修復] 取消訂單後 getTenantQuotaSummary 的 pendingReservedBookingCount 正確歸零**：
   - 保留沿革註解。
   - 驗證取消前 `pendingReservedBookingCount` 為 1。
   - 驗證取消後 `usageAfterCancel.pendingReservedBookingCount` 為 0，`confirmedBookingCount` 為 0，且 `bookingCountRemaining` 恢復至租戶上限 2。
3. **`gap-3` [回歸驗證／原現況缺陷已修復／業務閉環] 額度用盡後取消一筆訂單，額度騰出後可再次成功建立新訂單**：
   - 保留沿革註解。
   - 建立 2 筆訂單使額度達到上限（remaining 為 0）。
   - 取消第一筆訂單騰出額度。
   - 建立第三筆訂單，斷言回傳成功 `status: "created"` 且 `bookingId` 存在；確認配額用量重新達到上限（`pendingReservedBookingCount: 2`、`bookingCountRemaining: 0`），完成業務閉環。

---

## 3. 驗證與驗收證據 (Verification & Acceptance Evidence)

### 3.1 驗證指令與結果

```bash
# 1. 執行目標測試檔案
pnpm exec vitest run tests/unit/system-remediation/sr-qa-booking-001/c028-tenant-quota-reservation-and-cancellation-gap.test.ts
# 結果：Test Files: 1 passed (1), Tests: 5 passed (5)

# 2. 執行 SR-QA-BOOKING-001 全套件測試（確保全套件無退化）
pnpm exec vitest run tests/unit/system-remediation/sr-qa-booking-001/
# 結果：Test Files: 4 passed (4), Tests: 32 passed (32)

# 3. 執行關聯修復套件測試（確保與 SR-QA-BOOKING-001-FIX-QUOTA-RELEASE 保持一致）
pnpm exec vitest run tests/unit/system-remediation/sr-qa-booking-001-fix-quota-release/
# 結果：Test Files: 1 passed (1), Tests: 6 passed (6)

# 4. Git diff 規範檢查
git diff --check
# 結果：Exit status 0 (clean)
```

### 3.2 虛擬機限制與環境遵循
- 本任務遵守工作環境限制：未啟動任何 HTTP development server、Playwright 瀏覽器測試或 Docker Compose 基礎架構。
- 專注於授權的 write_scopes 檔案修改與驗收。

---

## 4. 變更檔案清單 (Modified Artifacts)

- `tests/unit/system-remediation/sr-qa-booking-001/c028-tenant-quota-reservation-and-cancellation-gap.test.ts`
- `docs/04-uat/system-remediation-20260906/SR-QA-BOOKING-001-FIX-QUOTA-RELEASE-STALE-GAP-ASSERTIONS.md`
