# Multi-Taxi Runtime Execution Register

**文件版本：** v1.2

**日期：** 2026-07-24
**Repository / Base：** `ajoe734/drts-fleet-platform` / `dev@2711c366f`
**用途：** Supervisor、開發團隊、Reviewer、QA 的可派工清單  
**規則：** 此表的 `done` 必須有 code + test + evidence；只有 docs、contract 或 UI 不足以結案 workflow。

---

# 1. 狀態定義

```text
landed        已在 dev
ready         規格與依賴明確，可立即開工
blocked_ext   只受外部 provider阻擋
verify        功能已落地，需 current-head驗證
deferred      產品尚未核准；不得把 UI 草稿當成 command
done          code / test / evidence全部完成
```

2026-07-24 核准的 17 頁目前沒有 `deferred` 項目；`deferred` 定義只保留給
未來未核准提案。頁面核准不會自動把 `command-pending` mutation 變成
可執行 command。

UI task 預設沿用既有 route/component。不得因 `ready` 另建專用 console；
法規只要求結果時，以最小可用入口完成。

---

# 2. Runtime Core

| Task ID           | Status | Owner Surface                            | 依賴          | 交付                                                |
| ----------------- | ------ | ---------------------------------------- | ------------- | --------------------------------------------------- |
| `MTX-CORE-001`    | verify | contracts + owned-mobility + persistence | none          | Order runtime fields                                |
| `MTX-CORE-002`    | verify | API + owned-mobility                     | CORE-001      | Dedicated passenger / call-center multi-taxi intake |
| `MTX-CORE-003`    | verify | owned-mobility                           | CORE-001      | Remove invalid subtype guard                        |
| `MTX-CORE-004`    | verify | service-product                          | CORE-001      | Profile-scoped product activation                   |
| `MTX-CORE-005`    | verify | auth / BFF                               | CORE-001      | Server-authoritative profile resolver               |
| `MTX-CORE-QA-001` | verify | QA                                       | CORE-001..005 | On-demand + scheduled intake E2E                    |

### Acceptance

```text
on-demand platform_reserved pass
scheduled platform_reserved pass
public spoofed profile denied
street_hail denied
typed code has no any-based subtype comparison
```

---

# 3. Operating Authorization

| Task ID           | Status | Owner Surface  | 依賴          | 交付                                              |
| ----------------- | ------ | -------------- | ------------- | ------------------------------------------------- |
| `MTX-AUTH-001`    | verify | contracts + DB | CORE-001      | Authorization + vehicle membership tables         |
| `MTX-AUTH-002`    | verify | API + service  | AUTH-001      | Admin CRUD / activate / suspend                   |
| `MTX-AUTH-003`    | verify | eligibility    | AUTH-001      | Runtime authorization evaluator                   |
| `MTX-AUTH-UI-001` | ready  | platform-admin | AUTH-002      | Six-screen authorization operations suite         |
| `MTX-AUTH-QA-001` | ready  | QA             | AUTH-002..003 | Inactive / expired / missing vehicle negative E2E |

---

# 4. Queue Semantics

| Task ID            | Status | Owner Surface           | 依賴      | 交付                               |
| ------------------ | ------ | ----------------------- | --------- | ---------------------------------- |
| `MTX-QUEUE-001`    | verify | contracts + persistence | CORE-001  | QueueMode                          |
| `MTX-QUEUE-002`    | verify | owned-mobility          | QUEUE-001 | Profile queue policy               |
| `MTX-QUEUE-003`    | ready  | Ops UI                  | QUEUE-002 | Queue overview/detail/legal-denial screens |
| `MTX-QUEUE-QA-001` | ready  | QA                      | QUEUE-002 | virtual pass / physical deny E2E   |

---

# 5. P-5 Data Authority

| Task ID           | Status | Owner Surface             | 依賴     | 交付                                      |
| ----------------- | ------ | ------------------------- | -------- | ----------------------------------------- |
| `P5-SUP-DRV-001`  | landed | fleet + registry          | —        | Disclosure data / credential              |
| `P5-RATE-001`     | verify | contracts + DB            | CORE-001 | Rating event / summary                    |
| `P5-RATE-002`     | verify | API / service             | RATE-001 | submit / aggregate                        |
| `P5-RATE-003`     | ready  | moderation service + audit | RATE-002 | Invalidate/rebuild moderation authority    |
| `P5-RATE-UI-001`  | ready  | platform-admin            | RATE-003 | Three-screen rating governance suite       |
| `P5-RATE-QA-001`  | ready  | QA                        | RATE-003 | submit/moderate/rebuild/authority evidence |

---

# 6. P-5 Eligibility / Assignment

| Task ID                | Status | Owner Surface               | 依賴               | 交付                                  |
| ---------------------- | ------ | --------------------------- | ------------------ | ------------------------------------- |
| `P5-GATE-001`          | verify | runtime eligibility         | AUTH-003, RATE-002 | P-5 hard reasons                      |
| `P5-GATE-002`          | verify | owned-mobility              | GATE-001           | non-bypassable scarcity behavior      |
| `P5-SNAP-001`          | verify | contracts + DB              | GATE-001           | Snapshot persistence                  |
| `P5-ASSIGN-001`        | verify | owned-mobility + repository | SNAP-001           | Atomic assignment / snapshot / outbox |
| `P5-REDISPATCH-001`    | verify | owned-mobility              | ASSIGN-001         | Version-safe replacement              |
| `P5-ASSIGN-QA-001`     | ready  | QA                          | ASSIGN-001         | Atomic rollback integration           |
| `P5-REDISPATCH-QA-001` | ready  | QA                          | REDISPATCH-001     | stale event test                      |

---

# 7. Passenger Live Authority

| Task ID               | Status      | Owner Surface  | 依賴         | 交付                                             |
| --------------------- | ----------- | -------------- | ------------ | ------------------------------------------------ |
| `P5-UI-PASSENGER-001` | landed      | passenger-web  | —            | Canvas-aligned fixture UI                        |
| `P5-PAX-001`          | verify      | contracts + DB | ASSIGN-001   | Ride access token                                |
| `P5-PAX-002`          | verify      | Passenger API  | PAX-001      | Disclosure / cancel / rating / receipt / contact |
| `P5-PAX-003`          | verify      | SSE            | PAX-001      | Versioned events                                 |
| `P5-PAX-WEB-001`      | verify      | passenger-web  | PAX-002..003 | Live data adapter                                |
| `P5-PAX-GATE-001`     | verify      | CI             | PAX-WEB-001  | Production fixture ban                           |
| `P5-PUSH-001`         | ready       | backend        | ASSIGN-001   | Consumer outbox / provider port                  |
| `P5-PUSH-EXT-001`     | blocked_ext | integration    | PUSH-001     | Push provider                                    |
| `P5-CALL-001`         | ready       | backend        | PAX-001      | Masked-call port / support fallback              |
| `P5-CALL-EXT-001`     | blocked_ext | integration    | CALL-001     | Masked-call provider                             |

---

# 8. Fare / Payment / Receipt / Retention

| Task ID                  | Status      | Owner Surface             | 依賴         | 交付                                      |
| ------------------------ | ----------- | ------------------------- | ------------ | ----------------------------------------- |
| `P5-ROUTE-001`           | ready       | geo + owned-mobility      | CORE-002     | Route snapshot                            |
| `P5-FARE-001`            | ready       | pricing + DB              | AUTH-001     | Fare authority                            |
| `P5-FARE-ANOM-001`       | ready       | pricing                   | FARE-001     | Fail-closed anomaly read/recovery authority |
| `P5-FARE-ANOM-UI-001`    | ready       | platform-admin            | FARE-ANOM-001 | Fare anomaly queue/detail                 |
| `P5-FARE-PUB-001`        | ready       | public web + admin        | FARE-001     | Public active fare                        |
| `P5-SEAT-001`            | ready       | passenger / task event    | PAX-WEB-001  | Seatbelt reminder                         |
| `P5-PAY-001`             | ready       | billing + contracts       | CORE-002     | Payment state / recovery descriptor       |
| `P5-PAY-OPS-UI-001`      | ready       | platform-admin            | PAY-001      | Payment exception detail                  |
| `P5-PAY-EXT-001`         | blocked_ext | PSP integration           | PAY-001      | Electronic payment provider               |
| `P5-RCT-001`             | ready       | reporting + passenger API | PAY-001      | Electronic certificate                    |
| `P5-RCT-SUPPORT-UI-001`  | ready       | platform-admin            | RCT-001      | Certificate support                       |
| `P5-RET-001`             | ready       | reporting + DB            | RCT-001      | Operational record                        |
| `P5-RET-002`             | ready       | reporting + DB            | RET-001      | 730-day retention floor                   |
| `P5-RET-003`             | ready       | platform-admin API + UI   | RET-001      | Query / download baseline                 |
| `P5-RET-OPS-UI-001`      | ready       | platform-admin            | RET-003      | Full record query/detail                   |
| `P5-EXPORT-001`          | ready       | reporting + platform-admin | RET-001     | Server controlled-export jobs             |
| `P5-HOLD-001`            | ready       | evidence + reporting      | RET-001      | Legal-hold read/filter authority           |
| `P5-RET-QA-001`          | ready       | QA                        | RET-001..003 | records/export/retention/hold E2E          |

---

# 9. S-3 Closure

| Task ID            | Status | Owner Surface  | 依賴        | 交付                         |
| ------------------ | ------ | -------------- | ----------- | ---------------------------- |
| `S3-BE-001`        | landed | API            | —           | SOS backend                  |
| `S3-UI-DRIVER-001` | landed | Driver App     | —           | SOS UI / outbox              |
| `S3-UI-OPS-001`    | landed | Ops            | —           | SOS board / detail           |
| `S3-VERIFY-001`    | verify | QA             | current dev | Current-head E2E             |
| `S3-VERIFY-002`    | verify | Mobile QA      | VERIFY-001  | Android / iOS offline replay |
| `S3-VERIFY-003`    | verify | Security / API | VERIFY-001  | Attachment scan              |
| `S3-VERIFY-004`    | verify | Observability  | VERIFY-001  | p95 <=5 sec                  |
| `S3-VERIFY-005`    | verify | CI / UI QA     | VERIFY-001  | Forbidden vocabulary         |

---

# 10. Dependency Order

```text
MTX-CORE
→ MTX-AUTH + MTX-QUEUE
→ P5-RATE
→ P5-GATE
→ P5-SNAP / ASSIGN
→ P5-PAX
→ Fare / Payment / Receipt / Retention
→ Full E2E / Release
```

S-3 verification可平行。

---

# 11. Release Workflows

## `WF-MTX-001`

```text
passenger creates on-demand platform reservation
→ server resolves multi_taxi_direct
→ authorization and service area
→ order created
```

## `WF-MTX-002`

```text
scheduled reservation
→ same authority
→ confirmation window / dispatch
```

## `WF-P5-001`

```text
eligible driver / vehicle
→ assignment
→ snapshot + outbox
→ passenger live page
```

## `WF-P5-002`

```text
redispatch
→ supersede N
→ snapshot N+1
→ old event ignored
```

## `WF-P5-003`

```text
route / fare confirm
→ trip
→ seatbelt
→ payment
→ rating
→ receipt
```

## `WF-P5-004`

```text
trip complete
→ 730-day record
→ regulator export
```

## `WF-S3-001`

```text
driver SOS
→ incident / outbox
→ Ops alert / ack
→ offline replay / attachments
```

---

# 12. Closure Rule

Supervisor 不得把以下單點標為 workflow done：

```text
contracts merged
migration merged
UI screenshot approved
unit test passed
provider mock delivered
```

只有該 workflow 的：

```text
code
integration
E2E
runtime evidence
review
```

均完成，才可 `done`。

---

# 13. PR #1122 Current-Head Evidence

本節只記錄已在 PR head 的 implementation evidence，不把 `verify` 誤寫成
production `done`。

| Commit      | Scope                                                                                           | Local evidence                                                                              |
| ----------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `34b44b87e` | runtime context、dedicated intake、operating authorization、queue gate                          | multi-taxi service tests；API typecheck / lint                                              |
| `22772932f` | P-5 hard gate、atomic assignment/snapshot/outbox、version-safe redispatch                       | owned-mobility repository/service tests                                                     |
| `d12229586` | opaque passenger token、rating authority、SSE、live passenger-web、fixture ban、proxy allowlist | API 91 tests；passenger 7 tests；API/passenger lint + typecheck；passenger production build |
| `bc435dc3a` | server-authoritative profile regression reconciliation                                          | `owned-mobility.test.ts` 19 tests                                                           |
| `fc2958750` | runtime-profile service-product policy + migration + admin API                                  | service-product 8 tests；multi-taxi 10 tests；migration replay 2 tests；API lint/typecheck  |
| `bf3990d9c` | operating authorization Platform Admin console                                                  | Platform Admin lint/typecheck/production build                                              |

仍不得 close 為 `done` 的 repo-local項目：

```text
MTX-QUEUE-003
P5-FARE-001 / P5-FARE-ANOM-001 / P5-FARE-PUB-001
P5-PAY-001 / P5-RCT-001 / P5-RET-001..003
all QA rows without current-head integration/E2E/runtime evidence
```

2026-07-24 Product Owner 已改為完整 17 頁範圍，以下工作現在可派工：

```text
P5-RATE-003 / P5-RATE-UI-001
P5-FARE-ANOM-UI-001
P5-PAY-OPS-UI-001
P5-RCT-SUPPORT-UI-001
P5-RET-OPS-UI-001
P5-EXPORT-001
P5-HOLD-001
```

Write command 未落地的按鈕仍須保持 `command-pending`，不得因 UI scope 核准
而模擬後端成功。

外部阻擋保持：

```text
P5-PUSH-EXT-001
P5-CALL-EXT-001
P5-PAY-EXT-001
S3-VERIFY-002 (Android / iOS physical-device evidence)
```
