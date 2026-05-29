# Phase 1 DB Migration Bundle

這個 bundle 承接前面的 Phase 1 SA / PRD / SD 與 migration plan，將 schema draft 進一步拆成可落地的 migration、seed 與初始化腳本。

## 目錄

- `migrations/`
  - `V0001__bootstrap_extensions_and_schemas.sql`
  - `V0002__enum_types.sql`
  - `V0003__core_master_data.sql`
  - `V0004__regulatory_registry.sql`
  - `V0005__ops_rules_and_mappings.sql`
  - `V0006__ops_orders_dispatch_and_trips.sql`
  - `V0007__crm_callcenter_and_complaints.sql`
  - `V0008__billing_and_settlement.sql`
  - `V0009__admin_reporting_audit_and_integrations.sql`
  - `V0010__views_triggers_and_guardrails.sql`
  - `V0011__driver_ops_instruction_storage.sql`
- `seeds/`
  - `S0001__reference_seed.sql`
  - `S0002__demo_operational_seed.sql`
  - `templates/*.csv`
- `scripts/`
  - `apply_migrations.sh`
  - `load_seeds.sh`
  - `init_local_db.sh`
  - `verify_schema.sh`

## 設計原則

1. migration 採 forward-only，不直接 rollback schema。
2. 腳本層透過 `admin.schema_migrations` 控制重複套用。
3. seed 層透過 `admin.seed_runs` 控制重複載入。
4. tables / indexes 大多使用 `IF NOT EXISTS`，views 使用 `CREATE OR REPLACE VIEW`。
5. `V0010` 統一附加 `updated_at` trigger、readiness view 與 export view。

## 建議執行順序

```bash
export DATABASE_URL="postgresql://localhost:5432/phase1_dev"
./scripts/apply_migrations.sh
./scripts/load_seeds.sh reference
./scripts/load_seeds.sh demo
./scripts/verify_schema.sh
```

## 說明

- `S0001` 是最小 reference seed，會建立 operating areas、SLA、qualification、contract rules、public info、placard 與 driver fee plan。
- `S0002` 會建立 demo tenant / partner / vehicle / driver / order / dispatch / complaint / invoice / statement，用來支撐 portal / app / ops console smoke test。
- `templates/` 放的是 Excel/CSV 匯入模板，用於車輛、駕駛、契約、保單、乘客與地址簿 bootstrap。

## 注意事項

- 這版仍屬 **工程落地草稿**，可直接做 local / SIT / UAT 初始化，但正式 production 上線前仍建議依實際 RDBMS 版本、CI/CD、Flyway / Liquibase 規範再做一次收斂。
- 若 production 需嚴格達成「migration 可重入」，建議把所有 enum 增補改成顯式版本升級腳本，而不是修改既有 enum 定義。
