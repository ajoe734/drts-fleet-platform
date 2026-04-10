# Bootstrap CSV Templates

這些 CSV 是 Phase 1 regulatory / directory bootstrap 的最小模板，對應前面 migration plan 中的 bootstrap source。

## 檔案

- `vehicles_import_template.csv`
- `drivers_import_template.csv`
- `vehicle_contracts_import_template.csv`
- `insurance_policies_import_template.csv`
- `passengers_import_template.csv`
- `addresses_import_template.csv`

## 使用原則

1. 先以 Excel 維護，再輸出 UTF-8 CSV。
2. `operating_area_code`、`tenant_code`、`partner_code` 需先存在 reference seed。
3. 日期欄位建議用 ISO8601；純證照效期可用 `YYYY-MM-DD`。
4. 正式 production 匯入前，請先導入 staging table，再由審核流程決定是否寫入正式表。
