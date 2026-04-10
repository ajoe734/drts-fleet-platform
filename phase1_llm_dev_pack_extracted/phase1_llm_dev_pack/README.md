# Phase 1 LLM Dev Pack

本套件是 **Phase 1 車隊管理與派遣合規核心** 的最後一批「可執行約束」文件，目的不是重寫 SA / PRD / SD，而是把 **LLM 真正開始寫碼前最容易誤解的部分** 鎖死。

## 本套件包含

1. `00_source_of_truth_and_glossary.md`  
   名詞字典、文件優先序、欄位主責與不可誤解規則。

2. `01_decision_tables.md`  
   決策表集：產品分類、派遣邏輯、資格過濾、商務子產品、申訴 SLA、補差與報表納入規則。

3. `02_acceptance_scenarios_gherkin.md`  
   驗收場景與 Gherkin / UAT 集。開發、QA、LLM agent 都應以此作為最小行為驗證基準。

4. `03_api_examples_and_error_contracts.md`  
   API example、錯誤契約、idempotency、pagination、signature、job polling 與 webhook delivery 標準。

5. `04_integration_samples/`  
   外部整合 sample payload pack，包含 CTI、錄音回寫、第三方 forwarder、對帳、地圖 ETA、發票 metadata、立案輸出 manifest 等。

6. `05_engineering_conventions_and_ai_dev_playbook.md`  
   工程慣例與 AI Dev Playbook。當既有 SA / PRD / SD 沒有定義到技術實作細節時，LLM 一律依此執行。

## 使用順序（LLM / 開發 / QA）

### LLM agent 必讀順序

1. `phase1_system_analysis_v1.md`
2. `phase1_prd_detailed_v1.md`
3. `phase1_system_design_v1.md`
4. `phase1_service_contracts_v1.md`
5. `phase1_openapi_v1.yaml`
6. `phase1_db_migration_bundle/README.md`
7. **本套件**
   - `00_source_of_truth_and_glossary.md`
   - `01_decision_tables.md`
   - `02_acceptance_scenarios_gherkin.md`
   - `03_api_examples_and_error_contracts.md`
   - `05_engineering_conventions_and_ai_dev_playbook.md`

### 開發順序建議

1. 先依 `00` 鎖定名詞與資料邊界
2. 依 `01` 先做 decision logic
3. 依 `03` 實作 API contract
4. 依 `02` 補自動化測試
5. 對外整合一律先比對 `04` sample pack
6. Code style、repo 結構、migration、測試命名一律依 `05`

## 重要規則

- 本套件 **不推翻** SA / PRD / SD，只補足執行層的明確規則。
- 如與 SA / PRD / SD 衝突，先以 `00_source_of_truth_and_glossary.md` 的優先序表處理。
- 如需推翻本套件任一規則，必須由人類架構師 / PM 產生明確 ADR（Architecture / Product Decision Record）後才可變更。

## 產出目標

當團隊完成閱讀並採用本套件後，LLM 應可：

- 穩定生成 CRUD、workflow、job、report 與 UI 行為
- 不再混淆 `owned` 與 `forwarded`
- 不再把 `business_dispatch` 當一般即時叫車
- 不再把 incident、audit、notification 誤當 complaint
- 不再對同一名詞產生多個解釋
- 在沒有真人補充說明的前提下，完成可聯調的第一輪實作
