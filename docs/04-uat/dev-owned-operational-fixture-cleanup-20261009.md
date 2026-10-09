# SR-DEV-EXACT-OWNED-OPERATIONAL-FIXTURE-CLEANUP-20261009 UAT Report

## 1. 任務背景與真實現況

- **原持有者 (Owner):** Gemini2
- **獨立審查者 (Reviewer):** Codex
- **產品執行版本 (Product Source):** `4a166f3ed2a7000061acc737ee475ae3c47dca56`
  - 整合審查完成之 referral embed 水合修正（PR #2462）、所有候選與合併 CI 全綠。
- **授權部署紀錄 (Authorized Deploy):** GitHub Actions run `37906298090`
  - 部署工作流定義：`publish/v2026.10.08.0`（SHA: `9a1b6466a8b15d7d328e9ceba33ba5dc92f7fa9c`）
  - 全部 9 項實際部署工作終端為 `SUCCESS`。
- **真實驗收報告 (Authentic Operational Browser Evidence):**
  - 16 項旅程全部通過（16 passed / 0 failed / 0 skipped / 0 flaky），契約驗證 14 項通過。
  - 共收集 58 筆正式驗證記錄。
  - 8 筆物理 327-byte PDF 鏈路：`intent (201) -> PUT (200) -> confirm (201) -> download (200)`，SHA-256 全數為 `4028af3714fa07d2f20e758649532faef11b4818c99a2b8dc0c88170a0dc8784`，MIME 為 `application/pdf`。
  - 首次冷啟動 PUT 經歷 20 次嘗試（19 次 `DOCUMENT_SCANNER_UNAVAILABLE` typed pending 後 clean）。
  - Referral 實際建立／取消／讀回相同 UUID 成功（取消狀態 `cancelled`）。
- **唯讀雲端中繼資料驗證 (Postdeployment Readonly Metadata):**
  - Run `37909267631`，27 reads / 0 mutations / 0 product HTTP。
  - 證明 API revision 為 `drts-dev-api-00065-smj`，image digest 為 `2d60ccea943e124ce6b55bfe0b91cfdff5ac8ff7a2c60dc162451c43899649cb`。
  - 9 個 IAM bindings、provider 參照與 scanner 規格均與先前預設完全相符。

## 2. 具體阻礙與修復範圍 (Concrete Blocker & Scope)

### 具體阻礙定位
正式驗收規格 `tests/e2e/operational-browser-acceptance.spec.ts` 的 `test.afterAll` 區塊僅負責將測試結果寫入 `operational-browser-evidence.json`，並未實作測試資料之清理機制。因此，8 個 GCS 測試物件以及資料庫中對應之 4 筆 supply submissions 與 8 筆 supply documents 紀錄仍殘留於共用 dev 環境中。

### 精確 4 個新增檔案範疇 (Zero Scope Creep)
1. `.github/workflows/dev-owned-operational-fixture-cleanup.yml`
   - PR、push 與手動派發均強制執行單元測試；
   - 僅在明確手動派發 (`workflow_dispatch`) 下才透過既有 WIF 授權執行 GCS 清理；PR 上絕無 `id-token` 權限；
   - 預設模式為 `dry-run`；具有嚴格的 source SHA、run ID 與路徑防護。
2. `operations/verification/cleanup-owned-operational-fixtures.py`
   - 提供 generation-bound GCS 物件清理規劃與執行；
   - 提供窄化參數化 guarded DB 清理語句規劃；
   - 嚴格拒絕路徑穿透、基數不符、雜湊不符、偽造種子與取消審計紀錄刪除；
   - 針對當前 hosted 環境無法安全連線 DB 提出具體 blocker。
3. `operations/verification/test_cleanup_owned_operational_fixtures.py`
   - 單元測試套件，僅模擬外部邊界，無網路連線（socket-free）；
   - 涵蓋合法正向驗證與各項負向防護情境。
4. `docs/04-uat/dev-owned-operational-fixture-cleanup-20261009.md`
   - 本驗收文件，依循 AI Collaboration Guide §0.7 規範。

## 3. 資料保護與保留原則 (Preservation Contract)

本清理工具堅持 **Fail-Closed** 安全設計，絕不進行全域或模糊刪除：
1. **保留業務取消與審計紀錄 (Business Cancellation Records):**
   - Referral 訂單取消紀錄：`6d571eec-f271-46b8-b01f-b176994fe71e`
   - Enterprise 訂單取消紀錄：`booking-2e367210-fc7b-4bf0-9512-8ff7626b5165`
   - 依業務與法規審計要求，所有取消事件與 mutation audit logs 永久保留，絕不刪除。
2. **保留種子車隊與使用者資料 (Seed Data):**
   - `fleet-demo-001` 及預載之測試駕駛人、車輛資料嚴格保留，禁止任何級聯或全車隊刪除。
3. **保留歷史失敗測試證據 (Historical Failed Fixtures):**
   - 歷次失敗（如 8d、03a）之日誌、測試資料與證據檔全數保留，不作為本次清理對象。

## 4. GCS 清理與資料庫清理之具體阻礙分析

### A. GCS 物件清理（可安全執行）
- **儲存貯體 (Bucket):** `drts-dev-devcc-20260825-document-artifacts`
- **清理物件清單 (Exact 8 Objects):**
  1. `fleet-partner/fleet-demo-001/supply-submissions/8b7b0b8a-bc5a-48f3-b576-af201e6ba074/18f06410-510c-4107-ae21-16ab61383b95-harmless-upload.pdf`
  2. `fleet-partner/fleet-demo-001/supply-submissions/8b7b0b8a-bc5a-48f3-b576-af201e6ba074/8ad02a30-c584-4deb-b2c8-5883f9a5345a-harmless-upload.pdf`
  3. `fleet-partner/fleet-demo-001/supply-submissions/deeed4cd-ede0-4daf-a70f-4d0e900987b9/f88f9320-7c81-4df9-9abd-d7ced9c0c50a-harmless-upload.pdf`
  4. `fleet-partner/fleet-demo-001/supply-submissions/deeed4cd-ede0-4daf-a70f-4d0e900987b9/195565d9-9f64-4a29-8446-f93bb0fe252b-harmless-upload.pdf`
  5. `fleet-partner/fleet-demo-001/supply-submissions/f735275c-151d-4f25-a9f0-174f2602f919/e6a71c74-a036-4ea9-a025-0386d9ed1861-harmless-upload.pdf`
  6. `fleet-partner/fleet-demo-001/supply-submissions/f735275c-151d-4f25-a9f0-174f2602f919/a627cd09-ebc8-4024-88ba-91a4f5489574-harmless-upload.pdf`
  7. `fleet-partner/fleet-demo-001/supply-submissions/93430506-d016-4b07-897f-ab9b4d3530df/3bbb4f20-0cd5-4676-9ae1-e428ce26461b-harmless-upload.pdf`
  8. `fleet-partner/fleet-demo-001/supply-submissions/93430506-d016-4b07-897f-ab9b4d3530df/024c77c7-8d95-4c29-8fd1-51dc0a89f8ba-harmless-upload.pdf`
- **防護措施:** 透過 `gcloud storage objects describe` 獲取真實 generation，刪除指令使用 `--if-generation-match=<generation>`；若 generation 變更或物件不存在則立即終止，刪除後再度驗證物件為 absent。

### B. 資料庫清理之具體阻礙 (Database Concrete Blocker)
- **現行通道限制:** GitHub Actions 部署者服務帳號（`github-actions-deployer@drts-dev-devcc-20260825.iam.gserviceaccount.com`）無 Cloud SQL 內部私有網路直接存取權限，亦未持有 `DATABASE_URL` 機密。
- **治理限制:** 倉庫禁止在非維護專案中任意宣告額外 IAM 授權、修改預設遷移作業（`drts-dev-migrate`）映像檔、或透過未經審查之 `node -e` / 任意 SQL 注入方式連線資料庫。
- **處置方式:** 工具精確產出參數化 SQL 語句與清理目標（8 筆 document UUID 及 4 筆 submission UUID），但於現有 hosted workflow 中誠實回報 `CONCRETE_BLOCKER`，等待經核准之專用資料庫維護維運視窗，杜絕安全繞道。

## 5. AI Collaboration Guide §0.7 交付品質核對表

| Finding／驗收項 | 原始碼依據與修改位置 | 舊版重現 → 修正版結果 | 命令、退出碼、執行版本與證據位置 | 未驗項與具體限制 |
| --- | --- | --- | --- | --- |
| 1. `owned_operational_cleanup_actual_planner_boundary_regressions` | `operations/verification/cleanup-owned-operational-fixtures.py`<br>`operations/verification/test_cleanup_owned_operational_fixtures.py` | 舊版：`test.afterAll` 僅儲存報告，未實作持有物件清理。<br>修正版：實作具備 generation 鎖定、雜湊與尺寸驗證、參數化 DB 防護及種子與取消紀錄保護之清理規劃器與單元測試。 | `python3 -m unittest operations/verification/test_cleanup_owned_operational_fixtures.py -v`<br>Exit code: `0`<br>35 項單元測試全數 PASS。 | 本機無對外網路連線，僅以外部 mock boundary 驗證。 |
| 2. `owned_operational_cleanup_exact_sha_review_ci_merge` | `.github/workflows/dev-owned-operational-fixture-cleanup.yml` | 舊版：無對應清理工作流。<br>修正版：新增專屬工作流，PR/push 強制執行單元測試，PR 上無 `id-token` 寫入權限；手動派發具備嚴格 SHA 防護並預設 dry-run。 | `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/dev-owned-operational-fixture-cleanup.yml'))"`<br>Exit code: `0`<br>YAML 語法校驗正確。 | 需待 Codex 獨立審查候選 SHA、CI 通過及合併後始可手動執行。 |
| 3. `owned_operational_cleanup_genuine_hosted_exact_objects_records_preservation` | `operations/verification/cleanup-owned-operational-fixtures.py` | 舊版：無安全執行合約判斷，易導致非預期全域刪除或權限越權。<br>修正版：在現行 hosted lane 誠實回報具體 DB blocker，並規劃 GCS 世代配對刪除與取消紀錄保留。 | `python3 operations/verification/cleanup-owned-operational-fixtures.py --inventory .local/fleet-storage-diagnosis-20261008/referral-reviewed-composition-dev-deployment-20261009/exact-owned-fixture-inventory.json --mode dry-run`<br>Exit code: `0`<br>產出 8 筆 GCS planned receipt 與 DB concrete blocker。 | 實際雲端 GCS 刪除與 DB 維護由 Operator 於獨立維護視窗透過受控環境執行。 |

## 6. 三道閘門狀態 (Three Gates Status)

1. `owned_operational_cleanup_actual_planner_boundary_regressions`:
   🟢 **READY (本機已通過)**：35 項單元測試全數通過，涵蓋正向真實 inventory、偽造 SHA、偽造 run ID、路徑穿透、種子與取消保護、GCS 世代更迭、尺寸不符、部分失敗等完整防護情境。
2. `owned_operational_cleanup_exact_sha_review_ci_merge`:
   🟡 **PENDING (待審查與合併)**：交付候選 SHA 後由獨立審查者 Codex 審查，並等待 GitHub CI 檢驗及 protected merge 至 `dev`。
3. `owned_operational_cleanup_genuine_hosted_exact_objects_records_preservation`:
   🟡 **PENDING (待託管維運執行)**：合併後由 Operator 在無衝突視窗手動觸發 GCS generation-bound 清理，DB 部分維持 concrete blocker 誠實記錄。
