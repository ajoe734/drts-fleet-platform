# DRTS P-5／S-3 跨團隊 Handoff 對照表

**目的**：只定義系統與 UI 的交界，不取代兩份主文件。

---

# 1. Ownership

| 項目 | 系統開發 | UI／UX |
|---|---|---|
| 欄位真值 | Owner | Consumer |
| 狀態機 | Owner | Visual representation |
| API / events | Owner | Consume and map |
| Layout / hierarchy | Consulted | Owner |
| Copy | Consulted | Owner |
| Error code | Owner | Map to human copy |
| Accessibility | Shared | Visual/interaction owner |
| E2E | Owner | Review |
| Visual QA | Support | Owner |
| Release sign-off | Shared | Shared |

---

# 2. P-5 Field Mapping

| System field | UI label | Required |
|---|---|---|
| `vehicle.make + vehicle.model` | 車輛廠牌與車款 | Yes |
| `vehicle.plateNo` | 牌照號碼 | Yes |
| `vehicle.modelYear` | 出廠年份 | Yes |
| `vehicle.doorCount` | 車門數 | Yes |
| `vehicle.color` | 車身顏色 | Supporting / Taipei profile |
| `driver.displayName` | 駕駛 | Product |
| `driver.registrationMaskedDisplay` | 執業登記證 | Yes |
| `driver.registrationEffectiveUntil` | 有效期限 | Yes |
| `rating.displayState` | 評價狀態 | Yes |
| `rating.averageRating` | 平均星等 | Conditional |
| `rating.ratingCount` | 評價則數 | Conditional |
| `eta.minutes` | 預計抵達 | Product |
| `routeFare.*` | 預估路線與車資 | Yes |

---

# 3. S-3 State Mapping

| System status | Driver copy | Ops copy |
|---|---|---|
| `local_triggered` | SOS 已啟動 | — |
| `queued_offline` | 等待補送 | 尚未到達 server |
| `submitted` | 通報已送出 | 新 SOS |
| `duty_alerted` | 車隊已收到 | 待確認 |
| `acknowledged` | 值班人員已確認 | 已由 X 確認 |
| `false_alarm_dismissed` | 已回報誤觸 | 駕駛回報誤觸 |
| `investigating` | 處理中 | 調查中 |
| `resolved` | 已處理 | 已處理 |
| `closed` | 已結案 | 已結案 |

---

# 4. Error Mapping

| Error code | UI copy |
|---|---|
| `PASSENGER_DISCLOSURE_CHANGED_BEFORE_ASSIGNMENT` | 車輛資料正在更新，系統將重新安排 |
| `MULTI_TAXI_RESERVATION_ONLY` | 此服務僅接受預約叫車 |
| `P5_RATING_STATE_UNINITIALIZED` | 派車資料尚未完整，系統正在重新確認 |
| `MASKED_CALL_NOT_PROVISIONED` | 目前無法直接聯絡司機，請聯絡客服 |
| `SOS_OFFLINE_QUEUED` | 目前無網路，通報已保存在手機 |
| `SOS_ALREADY_ACKNOWLEDGED` | 此事件已由其他值班人員確認 |

UI 不得直接顯示 raw error code。

---

# 5. Versioning

P-5 UI 必須保存目前：

```text
assignmentVersion
eventVersion
```

只接受較新 version。

S-3 UI 必須保存：

```text
clientEventId
sosEventId
statusVersion
```

避免 retry 重複建立或狀態倒退。

---

# 6. Team Gates

## Development Ready for Design Integration

- OpenAPI / contract frozen。
- sample payload available。
- error/state catalog available。
- fixture and live mode clearly labeled。

## Design Ready for Implementation

- all mandatory states designed。
- component variants complete。
- copy frozen。
- accessibility annotations complete。
- no forbidden elements。

## Release Ready

- UI reads live API。
- no production fixture。
- system E2E green。
- visual QA green。
- screenshot evidence generated from test/prod runtime and labeled accurately。
