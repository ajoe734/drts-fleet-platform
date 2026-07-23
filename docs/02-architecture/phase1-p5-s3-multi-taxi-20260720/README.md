# Phase 1 · P-5 / S-3 · 智行叫車 (`multi_taxi_direct`) Spec Pack

**Archived：** 2026-07-20  
**Current system-design reconciliation：** 2026-07-23  
**Canonical product name：** **智行叫車**  
**Service category：** 多元化計程車  
**Repository / Branch：** `drts-fleet-platform` / `dev`  
**Current verified baseline：** `ff16b7131bee4594ec56b195d43539a8d65ce379`

本資料夾同時保存：

1. 原始 P-5 / S-3 source requirements。
2. 目前 `dev` implementation plan。
3. 一般計程車／多元化計程車雙軌法規與系統架構決策。
4. 外部審查 reconciliation。
5. 可直接派工的 execution register。

---

## Product-line boundary

`multi_taxi_direct` 是人駕、owned-order、預約平臺取得乘客需求的多元化計程車產品線。

禁止把下列 Phase 2 / external-platform 語意帶入 P-5 / S-3 read model：

```text
FSD
自駕
無人駕駛
安全員
sandbox
Tesla
AV
forwarded
mirror
native status
external platform badge
```

---

## Source of truth hierarchy

### 1. Canonical inbound requirements

[`source_specs/`](source_specs/)

- `01_system_development_team_spec_20260720.md`
- `02_ui_visual_design_team_brief_20260720.md`
- `03_cross_team_handoff_matrix_20260720.md`
- `source_manifest.json`

三份原稿均為完整 UTF-8，具有 SHA-256；由 `scripts/check_spec_source_archive.py` 檢查。

### 2. Derived navigation

`00_source_specs_index.md`

只作索引；不是 canonical。

### 3. Current implementation and design decisions

| File | Role |
|---|---|
| `03_gap_closure_implementation_plan.md` | Current `dev` gap closure、dependency、release gates |
| `04_standard_taxi_vs_multi_taxi_dispatch_compliance_review_20260721.md` | 一般／多元雙軌法規行為與系統架構決策 |
| `05_external_review_reconciliation_20260722.md` | 外部審查採納／修正／branch-state verification |
| `06_multi_taxi_runtime_execution_register_20260723.md` | 可派工 task register |
| `manifest.json` | Machine-readable index / baseline / implementation status |

---

## Current implementation baseline

截至 `dev@ff16b713...`：

### Landed

- P-5 / S-3 contracts and DB anchors。
- Vehicle disclosure and Driver credential projection。
- S-3 backend / Driver UI / Ops UI。
- P-5 Passenger UI and Platform Admin UI。
- Clean source specs and design canvas。

### Not yet workflow-closed

- Typed `multi_taxi_direct` intake。
- Server-authoritative runtime profile。
- Multi-taxi operating authorization。
- Queue-mode semantics。
- Rating authority。
- P-5 eligibility hard gate。
- Atomic assignment disclosure snapshot。
- Live Passenger token / API / SSE。
- Fare / payment / receipt / 730-day operational record。
- S-3 production SLO / physical-device closure。

不得以已合併 UI、contract 或 migration 取代上述 workflow closure。

---

## Schema reconciliation

- Canonical registry schema：`reg.*`。
- SOS schema：`safety.*`。
- Mobility：`mobility.*`。
- Reporting：`reporting.*`。
- Supply draft使用 `brand`，Passenger disclosure使用 `make`，由 ingestion mapping。
- `door_count` / `color` 已加入 supply flow。

---

## UI ownership

UI implementation 以：

```text
docs/05-ui/drts-design-canvas/
```

為 visual source；系統開發文件只定義 data / state / workflow / error / acceptance。

---

## Legal reference

- https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=K0040003
- https://law.moj.gov.tw/LawClass/LawGetFile.ashx?FileId=0000351870&lan=C
