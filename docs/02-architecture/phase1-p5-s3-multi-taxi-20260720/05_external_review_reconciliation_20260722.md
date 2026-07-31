# External Review Reconciliation — 一般計程車／多元化計程車雙軌營運

**文件版本：** v2.0  
**日期：** 2026-07-23  
**Repository：** `ajoe734/drts-fleet-platform`  
**Verified Branch / Commit：** `dev@ff16b7131bee4594ec56b195d43539a8d65ce379`  
**目的：** 將外部審查意見、現行法規建模及 GitHub branch truth 逐項收斂，不留下「請開發團隊再討論」的設計空白。

---

# 1. Reconciliation 方法

每一項意見分為：

```text
ACCEPTED
ACCEPTED_WITH_REFINEMENT
VERIFIED_LANDED
LANDED_BUT_NOT_CLOSED
REJECTED
SUPERSEDED
```

「已合併」與「workflow 完成」分開判定。

---

# 2. 法規／模型意見

## 2.1 預約載客不等於未來排程

**Decision：ACCEPTED**

採用：

```text
acquisitionMode = platform_reserved
timingMode = on_demand | scheduled
```

不採用：

```text
reservationTime != null 作唯一 hard gate
```

如核准營業計畫有最短預約時間，放入 operating authorization policy。

## 2.2 虛擬媒合 queue 與實體招呼站排班分離

**Decision：ACCEPTED_WITH_REFINEMENT**

採用：

```text
virtual_matching allowed
physical_rank denied for multi_taxi_direct
taxi_stand denied for multi_taxi_direct
```

拒絕：

```text
因 API path 有 queue 字樣就全面禁止
```

## 2.3 多元化計程車營運授權 Authority

**Decision：ACCEPTED**

新增：

```text
MultiTaxiOperatingAuthorization
MultiTaxiAuthorizedVehicle
```

Vehicle license type 不得替代營運核准。

## 2.4 一般計程車可自由使用所有 queue

**Decision：REJECTED AS OVERBROAD**

修正：

- 一般計程車不受第 91 條對多元化計程車的特別禁止。
- 但仍受地方、場站、營業區域與其他規則。
- 系統必須以 queue policy判斷，不可假設 ordinary taxi 對所有 queue 無條件合法。

---

# 3. Branch-State Claims

## 3.1 原本未驗證的原因

原審查工作區停在：

```text
dev@781258283c75904d94817ff8ee1dc659683a44aa
```

當時 remote `dev` 已向前 10 commits，因此無法在舊 checkout 看見後續 PR，不代表 GitHub claims 為假。

## 3.2 已重新驗證的 remote truth

| Claim | Decision | Evidence |
|---|---|---|
| P-5 / S-3 contracts / migrations landed | VERIFIED_LANDED | PR #1108 |
| S-3 backend / Incident correlation landed | VERIFIED_LANDED | PR #1111 |
| Clean source specs / design canvas landed | VERIFIED_LANDED | PR #1112 |
| Driver SOS UI landed | VERIFIED_LANDED | PR #1114 |
| Ops SOS UI landed | VERIFIED_LANDED | PR #1116 |
| doorCount / color / canonical disclosure / credential masking landed | VERIFIED_LANDED | PR #1117 |
| Passenger P-5 UI landed | VERIFIED_LANDED | PR #1119 |
| Admin P-5 UI landed | VERIFIED_LANDED | PR #1121 |

## 3.3 已落地但尚未閉環

| Capability | Status | Reason |
|---|---|---|
| `multi_taxi_direct` | LANDED_BUT_NOT_CLOSED | Contract + partial guard，typed intake錯接 |
| Passenger UI | LANDED_BUT_NOT_CLOSED | Fixture-backed，無 live token/API/SSE |
| Vehicle / driver disclosure | LANDED_BUT_NOT_CLOSED | 未接 P-5 runtime gate / assignment snapshot |
| P-5 snapshot | LANDED_BUT_NOT_CLOSED | Contract only |
| Rating | LANDED_BUT_NOT_CLOSED | Contract / UI state，無 backend authority |
| Public fare | LANDED_BUT_NOT_CLOSED | Contract / UI，無 activation authority |
| S-3 | LANDED_BUT_NOT_CLOSED | 需 current-head E2E、SLO、真機、attachment security |

---

# 4. 對外部審查的逐項裁決

## 4.1 「runtime profile 尚未落地」

**Decision：SUPERSEDED**

修正版：

> Runtime profile contract、schema anchors及 partial guard已落地，但 server-authoritative product line及可成功 typed intake尚未完成。

## 4.2 「door_count / color 不存在」

**Decision：SUPERSEDED**

現已進入：

- supply draft contract。
- migration。
- submission／review。
- canonical disclosure projection。
- correction queue。

但仍需串 P-5 gate / snapshot。

## 4.3 「S-3 domain 不存在」

**Decision：SUPERSEDED**

Dedicated backend、Driver UI、Ops UI已合併。Remaining work是 production closure，不是 greenfield。

## 4.4 「Passenger P-5 UI 不存在」

**Decision：SUPERSEDED**

UI已合併；但 fixture-backed，所以不得宣稱 live workflow完成。

## 4.5 「多元化計程車必須 reservation-only」

**Decision：ACCEPTED_WITH_REFINEMENT**

保留法規意義：

```text
platform reserved only
```

不把它錯譯成：

```text
only future scheduled orders
```

## 4.6 「多元線不能接任何 queue」

**Decision：REJECTED AS OVERBROAD**

改採 queue mode split。

## 4.7 「`multi_purpose_taxi` 可接 realtime 必然違法」

**Decision：REJECTED AS INCOMPLETE MODEL**

Vehicle class本身不能決定營運行為。必須看：

```text
runtime profile
acquisition mode
operating authorization
service product
```

沒有 ordinary realtime authority的車不得接 ordinary realtime；但不能只因 vehicle enum 名稱判斷。

## 4.8 「seatbelt / payment / receipt / 2yr record 可放 P2」

**Decision：REJECTED**

它們是第 91 條營運閉環的一部分，應放 Phase 1 P0 closure；外部 provider可 external-gated，但 internal state / port / fail-closed logic不能延後。

---

# 5. 已消除的設計空白

以下不再留給開發團隊自行決定：

| 問題 | 最終決策 |
|---|---|
| 是否拆產品線 | 拆 `ordinary_taxi` / `multi_taxi_direct` runtime profile |
| 預約是否必須未來時間 | 否；拆 `acquisitionMode` 與 `timingMode` |
| queue 是否全部禁用 | 否；virtual allowed，physical rank / stand denied |
| 如何證明合法多元化供給 | Operating authorization + vehicle membership |
| Profile authority在哪 | Server / route / channel config，非 public header |
| Multi-taxi command如何建模 | Dedicated typed command / route |
| `taxi_reservation` 放哪 | Service Product，不是 Business Dispatch Subtype |
| P-5 gate可否 override | 法定 hard reasons不可 override |
| Passenger UI是否可用 fixture上線 | 不可 |
| P-5 assignment如何保證 | Assignment + snapshot + outbox同 transaction |
| S-3是否重做 | 不重做；做 current-head production closure |

---

# 6. 文件 Authority

## Canonical requirements

```text
source_specs/
```

仍為原始需求 source of truth。

## Current system design decision

```text
04_standard_taxi_vs_multi_taxi_dispatch_compliance_review_20260721.md
```

負責：

- 法規行為模型。
- 一般／多元雙軌架構。
- 目標 domain decisions。

## Current implementation plan

```text
03_gap_closure_implementation_plan.md
```

負責：

- 現況。
- task / dependency。
- acceptance / release gates。

## Execution register

```text
06_multi_taxi_runtime_execution_register_20260723.md
```

負責：

- 可派工 task truth。
- owner surface。
- dependencies。
- verification。

本 reconciliation 文件不取代上述文件。

---

# 7. 最終 Reconciliation 結論

外部審查對法規建模的三項核心修正已正式採納：

1. 預約載客 ≠ 必然未來排程。
2. 虛擬媒合 queue ≠ 實體招呼站排班。
3. 必須有多元化營運授權 authority。

外部審查對 GitHub branch-state的多項 claims也已重新以 remote `dev` 驗證，不再標成未驗證。

同時，所有「已合併」項目均重新檢查是否已關閉業務 workflow；P-5 Passenger、Rating、Snapshot、Fare、Payment、Receipt與二年資料仍明確列為未完成，不因 UI / contract落地而提前結案。
