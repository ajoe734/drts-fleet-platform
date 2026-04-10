# 03. API Examples + Error Contracts

## 3.1 目的

本文件不是完整 OpenAPI 取代品，而是 **LLM 最常需要的 request/response example 與錯誤契約標準**。

只要是新 endpoint、adapter、job API、webhook、download flow，都要遵守本文件。

---

## 3.2 通用約束

### 3.2.1 HTTP / JSON

- 所有 API 使用 `application/json`
- 所有時間使用 `RFC3339 UTC`
- 所有金額使用 `amount_minor`（整數，NTD 分）
- 所有 id 使用 UUID
- 所有 list 回傳都要有 `items[]` 與 `page_info`

### 3.2.2 Header 標準

| Header                          | 用途                         |
| ------------------------------- | ---------------------------- |
| `Authorization: Bearer <token>` | 身分驗證                     |
| `X-Request-Id`                  | 請求追蹤                     |
| `Idempotency-Key`               | POST/command 去重            |
| `X-Tenant-Code`                 | 平台級管理員跨租戶操作時使用 |
| `X-Signature`                   | webhook 驗簽                 |

### 3.2.3 通用成功 envelope

```json
{
  "data": {},
  "meta": {
    "request_id": "6b447b7e-c866-493c-a40b-bd8d560c1c16",
    "timestamp": "2026-04-10T09:00:00Z"
  }
}
```

### 3.2.4 通用錯誤 envelope

```json
{
  "error": {
    "code": "ORDER_NOT_MODIFIABLE",
    "message": "The order can no longer be modified.",
    "details": {
      "order_id": "f1d2b346-71b9-4db0-8f41-25cb6b2a40b3",
      "modifiable_until": "2026-04-10T08:30:00Z"
    },
    "retryable": false,
    "trace_id": "e3ef7046-6f11-4df0-b5f3-4d26e0e9202f"
  }
}
```

### 3.2.5 page_info 標準

```json
{
  "page_info": {
    "page": 1,
    "page_size": 20,
    "total_items": 150,
    "total_pages": 8
  }
}
```

### 3.2.6 Idempotency 規則

- 所有 `POST` command endpoint 都支援 `Idempotency-Key`
- 同一 key + 同一 actor + 同一路徑 + 同一 payload hash = 回傳相同結果
- 若同 key 但 payload 不同，回 `409 IDEMPOTENCY_KEY_REUSED`

---

## 3.3 Error Code Registry（平台通用）

| HTTP | code                       | retryable | 說明                     |
| ---- | -------------------------- | --------- | ------------------------ |
| 400  | `VALIDATION_ERROR`         | false     | 基本欄位錯誤             |
| 400  | `ADDRESS_UNRESOLVABLE`     | false     | 地址不可解析             |
| 400  | `FLIGHT_NO_REQUIRED`       | false     | 機場接機缺航班號         |
| 400  | `PROOF_REQUIRED`           | false     | 收尾 proof 未滿足        |
| 401  | `UNAUTHENTICATED`          | true      | 未登入或 token 失效      |
| 403  | `FORBIDDEN`                | false     | 權限不足                 |
| 404  | `NOT_FOUND`                | false     | 找不到資源               |
| 409  | `ORDER_NOT_MODIFIABLE`     | false     | 已過修改時窗             |
| 409  | `FIXED_PRICE_IMMUTABLE`    | false     | 固定價不可改價           |
| 409  | `PICKUP_NOT_ARRIVED`       | false     | 未到上車點不可開始       |
| 409  | `MIN_PHOTO_COUNT_NOT_MET`  | false     | 照片不足                 |
| 409  | `EXPENSE_PROOF_REQUIRED`   | false     | 機場接送憑證不足         |
| 409  | `DRIVER_CERT_INVALID`      | false     | 司機證照失效             |
| 409  | `VEHICLE_NOT_DISPATCHABLE` | false     | 車輛資格不足             |
| 409  | `IDEMPOTENCY_KEY_REUSED`   | false     | 相同 key 但 payload 不同 |
| 422  | `NOT_SERVICEABLE`          | false     | 不屬可派區域             |
| 429  | `RATE_LIMITED`             | true      | 超過頻率限制             |
| 500  | `INTERNAL_ERROR`           | true      | 系統錯誤                 |
| 502  | `UPSTREAM_ERROR`           | true      | 第三方依賴異常           |
| 503  | `SERVICE_DEGRADED`         | true      | 服務降級                 |
| 504  | `UPSTREAM_TIMEOUT`         | true      | 外部系統逾時             |

---

## 3.4 Auth Example

### POST `/api/auth/login`

```json
{
  "email": "ops.admin@example.com",
  "password": "Demo!234",
  "realm": "ops"
}
```

Response:

```json
{
  "data": {
    "access_token": "<jwt>",
    "refresh_token": "<jwt>",
    "user": {
      "user_id": "71f0c861-6fdf-40d2-b598-1cd65a9724d5",
      "role": "opco_admin",
      "tenant_id": "0f2a1cc5-bdca-4681-b9b6-5e93fe4d83fa",
      "scopes": ["read:dispatch", "write:dispatch", "read:reports"]
    }
  },
  "meta": {
    "request_id": "745c2fe9-b1c0-4638-859d-25c0f85f9670",
    "timestamp": "2026-04-10T09:00:00Z"
  }
}
```

---

## 3.5 Passenger Order Examples

### POST `/api/passenger/orders`

```json
{
  "pickup": {
    "address": "台中市梧棲區中二路一段9號",
    "lat": 24.2651,
    "lng": 120.5243
  },
  "dropoff": {
    "address": "台中市大安區興安路378號",
    "lat": 24.3478,
    "lng": 120.5861
  },
  "ride_type": "immediate",
  "service_preferences": {
    "accessible": false,
    "child_seat": false,
    "luggage_count": 1
  },
  "payment_method": "card"
}
```

Response:

```json
{
  "data": {
    "order_id": "cc0af2b6-c038-4d61-8f4f-ae0fd41381e1",
    "order_no": "O-20260410-000001",
    "order_domain": "owned",
    "service_bucket": "standard_taxi",
    "dispatch_semantics": "realtime",
    "status": "ready_for_dispatch",
    "eta_snapshot": {
      "eta_minutes": 8,
      "calculated_at": "2026-04-10T09:00:00Z"
    }
  },
  "meta": {
    "request_id": "91f36e5d-58c0-4d75-b7b8-b1e0f4510a0a",
    "timestamp": "2026-04-10T09:00:00Z"
  }
}
```

Validation failure:

```json
{
  "error": {
    "code": "ADDRESS_UNRESOLVABLE",
    "message": "Pickup address cannot be resolved.",
    "details": {
      "field": "pickup.address"
    },
    "retryable": false,
    "trace_id": "bd16c815-b298-4800-9f62-a67bb8f8665e"
  }
}
```

---

## 3.6 Tenant Booking Examples

### POST `/api/tenant/bookings`

#### enterprise_dispatch

```json
{
  "business_dispatch_subtype": "enterprise_dispatch",
  "pickup": {
    "address": "台北市信義區松仁路100號"
  },
  "dropoff": {
    "address": "桃園機場第二航廈"
  },
  "reservation_window_start": "2026-04-15T08:30:00Z",
  "reservation_window_end": "2026-04-15T08:45:00Z",
  "passenger": {
    "name": "王小明",
    "phone": "0912000111"
  },
  "booked_by": {
    "name": "林秘書",
    "email": "assistant@example.com"
  },
  "onsite_contact": {
    "name": "大廳櫃台",
    "phone": "0223456789"
  },
  "cost_center": "HQ-ADMIN",
  "vehicle_preference": "sedan",
  "signoff_required": true,
  "notes": "請提前五分鐘到場"
}
```

Response:

```json
{
  "data": {
    "order_id": "f95d35bc-6fb8-48f3-84a0-eb1d8d6c563d",
    "booking_id": "9b0f7e77-2a43-4c30-a070-e41e3d84d3b3",
    "service_bucket": "business_dispatch",
    "business_dispatch_subtype": "enterprise_dispatch",
    "dispatch_semantics": "reservation",
    "status": "created"
  },
  "meta": {
    "request_id": "d594d36d-7698-4fd6-b3d3-e15df3f47360",
    "timestamp": "2026-04-10T09:00:00Z"
  }
}
```

#### credit_card_airport_transfer

```json
{
  "business_dispatch_subtype": "credit_card_airport_transfer",
  "benefit_reference": "CARD-BNF-7788123",
  "direction": "pickup",
  "flight_no": "CI100",
  "terminal": "T2",
  "pickup": {
    "address": "桃園機場第二航廈"
  },
  "dropoff": {
    "address": "台中市梧棲區中二路一段9號"
  },
  "reservation_window_start": "2026-04-18T10:00:00Z",
  "reservation_window_end": "2026-04-18T10:20:00Z",
  "passenger": {
    "name": "陳小姐",
    "phone": "0900123456"
  },
  "luggage_count": 2
}
```

Missing flight number:

```json
{
  "error": {
    "code": "FLIGHT_NO_REQUIRED",
    "message": "Flight number is required for airport pickup bookings.",
    "details": {
      "business_dispatch_subtype": "credit_card_airport_transfer",
      "direction": "pickup"
    },
    "retryable": false,
    "trace_id": "3735d4af-7ce3-4af1-a129-3ca29b44484e"
  }
}
```

---

## 3.7 Call Center Example

### POST `/api/call-center/orders`

```json
{
  "call_id": "CALL-20260410-000120",
  "agent_id": "AGENT-0088",
  "recording_id": "REC-20260410-000120",
  "pickup": {
    "address": "台中市大安區興安路378號"
  },
  "dropoff": {
    "address": "台中市梧棲區中二路一段9號"
  },
  "passenger": {
    "name": "李先生",
    "phone": "0911222333"
  },
  "notes": "行動不便，請靠近門口"
}
```

Response:

```json
{
  "data": {
    "order_id": "83db94cb-4818-41f2-a0dc-874b4aee1ad8",
    "order_source": "phone",
    "call_id": "CALL-20260410-000120",
    "recording_id": "REC-20260410-000120",
    "status": "ready_for_dispatch"
  },
  "meta": {
    "request_id": "6d664772-d9d3-48fc-8bd8-f397d8401d7a",
    "timestamp": "2026-04-10T09:00:00Z"
  }
}
```

---

## 3.8 Dispatch Examples

### POST `/api/orders/{id}/dispatch`

Command:

```json
{
  "mode": "auto"
}
```

Response:

```json
{
  "data": {
    "dispatch_job_id": "0a3ab558-1114-401f-b8ea-2809af744da6",
    "status": "matching"
  },
  "meta": {
    "request_id": "6a1f3d82-f784-4cdf-88e9-75c5d88bdc50",
    "timestamp": "2026-04-10T09:00:00Z"
  }
}
```

### POST `/api/dispatch/assign`

```json
{
  "dispatch_job_id": "0a3ab558-1114-401f-b8ea-2809af744da6",
  "vehicle_id": "d04d7368-df30-4c1c-a0e8-f69aa18a92f3",
  "driver_id": "af4c20a6-cc8c-4b8b-8348-94e4e04218cf"
}
```

Success:

```json
{
  "data": {
    "assignment_id": "5f31c5db-81bb-432e-a4d4-e6745ba6fe10",
    "status": "assigned"
  },
  "meta": {
    "request_id": "d0e58c13-c71b-4104-9502-2ed63157d37f",
    "timestamp": "2026-04-10T09:00:00Z"
  }
}
```

Vehicle not dispatchable:

```json
{
  "error": {
    "code": "VEHICLE_NOT_DISPATCHABLE",
    "message": "Vehicle is not eligible for dispatch.",
    "details": {
      "vehicle_id": "d04d7368-df30-4c1c-a0e8-f69aa18a92f3"
    },
    "retryable": false,
    "trace_id": "68f38082-7a4a-43c5-ac65-2f60ca38eb72"
  }
}
```

---

## 3.9 Driver Task Examples

### POST `/api/driver/tasks/{id}/accept`

```json
{
  "accepted_at": "2026-04-10T09:02:00Z"
}
```

### POST `/api/driver/tasks/{id}/reject`

```json
{
  "reason_code": "distance_too_far",
  "reason_note": "距離過遠，無法準時抵達"
}
```

### POST `/api/driver/tasks/{id}/depart`

```json
{
  "departed_at": "2026-04-10T09:03:00Z",
  "current_location": {
    "lat": 24.266,
    "lng": 120.522
  }
}
```

### POST `/api/driver/tasks/{id}/arrived_pickup`

```json
{
  "arrived_at": "2026-04-10T09:08:00Z"
}
```

### POST `/api/driver/tasks/{id}/start`

```json
{
  "started_at": "2026-04-10T09:10:00Z"
}
```

Not yet arrived:

```json
{
  "error": {
    "code": "PICKUP_NOT_ARRIVED",
    "message": "Cannot start trip before arriving at pickup.",
    "details": {},
    "retryable": false,
    "trace_id": "0b47dcc4-bcff-4d49-a64b-21ae337fe35c"
  }
}
```

### POST `/api/driver/tasks/{id}/complete`

```json
{
  "completed_at": "2026-04-10T09:45:00Z",
  "actual_distance_km": 22.4,
  "actual_duration_sec": 2100,
  "fare": {
    "currency": "NTD",
    "amount_minor": 150000
  },
  "proof": {
    "photo_ids": ["FILE-1001"],
    "signature_id": "FILE-2001",
    "expense_items": [
      {
        "type": "toll",
        "amount_minor": 4000,
        "attachment_id": "FILE-3001"
      }
    ]
  }
}
```

Fixed price violation:

```json
{
  "error": {
    "code": "FIXED_PRICE_IMMUTABLE",
    "message": "Fare cannot be changed for a fixed-price job.",
    "details": {
      "assignment_type": "fixed_price"
    },
    "retryable": false,
    "trace_id": "4a6afcd0-d63b-42ce-b4f9-e882ef0b6b41"
  }
}
```

---

## 3.10 Incident Example

### POST `/api/incidents`

```json
{
  "source": "driver",
  "order_id": "cc0af2b6-c038-4d61-8f4f-ae0fd41381e1",
  "vehicle_id": "d04d7368-df30-4c1c-a0e8-f69aa18a92f3",
  "severity": "high",
  "type": "passenger_dispute",
  "description": "乘客與司機發生口角",
  "location": {
    "lat": 24.3,
    "lng": 120.55
  },
  "attachments": ["FILE-9001"]
}
```

---

## 3.11 Complaint Case Example

### POST `/api/complaints`

```json
{
  "case_source": "phone",
  "related_order_id": "cc0af2b6-c038-4d61-8f4f-ae0fd41381e1",
  "related_call_id": "CALL-20260410-000120",
  "category": "fare_dispute",
  "severity": "normal",
  "description": "乘客認為費用不正確"
}
```

Response:

```json
{
  "data": {
    "case_no": "C-20260410-000031",
    "status": "new",
    "sla_due_at": "2026-04-12T09:00:00Z"
  },
  "meta": {
    "request_id": "f20cbf1e-d132-4a30-858c-b157bdb03716",
    "timestamp": "2026-04-10T09:00:00Z"
  }
}
```

### POST `/api/complaints/{caseNo}/reopen`

```json
{
  "reason": "乘客提供新憑證"
}
```

---

## 3.12 Driver Earnings / Statement Example

### GET `/api/driver/earnings?period=2026-04`

Response:

```json
{
  "data": {
    "summary": {
      "gross_earning_minor": 1580000,
      "service_fee_minor": 180000,
      "subsidy_minor": 25000,
      "net_amount_minor": 1425000
    },
    "statements": [
      {
        "statement_id": "b0b1cd88-a1c2-4e4c-bd34-87ff425dc2a1",
        "period_month": "2026-04",
        "receipt_no": "DRV-REC-00012",
        "payout_status": "pending"
      }
    ]
  },
  "meta": {
    "request_id": "d4855f9f-4ec2-4752-a3a0-67ca7c5602d9",
    "timestamp": "2026-04-10T09:00:00Z"
  }
}
```

---

## 3.13 Report Job Example

### POST `/api/tenant/reports/jobs`

```json
{
  "type": "monthly_trip_report",
  "format": "xlsx",
  "filters": {
    "from": "2026-04-01T00:00:00Z",
    "to": "2026-04-30T23:59:59Z",
    "cost_center": "HQ-ADMIN"
  },
  "delivery": {
    "email": "finance@example.com"
  }
}
```

Response:

```json
{
  "data": {
    "job_id": "JOB-20260410-0001",
    "status": "queued"
  },
  "meta": {
    "request_id": "72a1b647-32cd-4dad-a8cc-01ef63dffb26",
    "timestamp": "2026-04-10T09:00:00Z"
  }
}
```

### GET `/api/reports/{jobId}`

```json
{
  "data": {
    "job_id": "JOB-20260410-0001",
    "status": "completed",
    "artifact": {
      "artifact_id": "ART-0011",
      "download_url": "https://download.example.com/report/JOB-20260410-0001?sig=...",
      "expires_at": "2026-04-10T10:00:00Z"
    }
  },
  "meta": {
    "request_id": "65353908-020b-4a57-a0b2-4e5ad51520e7",
    "timestamp": "2026-04-10T09:00:00Z"
  }
}
```

---

## 3.14 Filing Package Example

### POST `/api/filing-packages/generate`

```json
{
  "package_type": "monthly_report",
  "scope": {
    "month": "2026-04"
  }
}
```

Response:

```json
{
  "data": {
    "package_id": "PKG-20260410-0002",
    "status": "queued"
  },
  "meta": {
    "request_id": "d827fe3b-0d39-42f4-9378-6d3fb7286318",
    "timestamp": "2026-04-10T09:00:00Z"
  }
}
```

---

## 3.15 Tenant Webhook Contract

### Delivery headers

| Header                  | 說明               |
| ----------------------- | ------------------ |
| `X-Webhook-Event`       | 事件名稱           |
| `X-Webhook-Delivery-Id` | delivery id        |
| `X-Webhook-Timestamp`   | RFC3339 UTC        |
| `X-Signature`           | `sha256=<hex>`     |
| `Content-Type`          | `application/json` |

### Signature base string

```
<timestamp>.<raw_body>
```

### HMAC

- algorithm: `HMAC-SHA256`
- key: current webhook secret version

### Example payload: `order.assigned`

```json
{
  "event": "order.assigned",
  "delivery_id": "WD-20260410-0001",
  "occurred_at": "2026-04-10T09:04:00Z",
  "tenant_id": "0f2a1cc5-bdca-4681-b9b6-5e93fe4d83fa",
  "data": {
    "order_id": "cc0af2b6-c038-4d61-8f4f-ae0fd41381e1",
    "order_no": "O-20260410-000001",
    "vehicle_id": "d04d7368-df30-4c1c-a0e8-f69aa18a92f3",
    "eta_minutes": 6
  }
}
```

### Retry policy

- 2xx: success
- 408/429/5xx: retry
- 4xx except 408/429: no retry
- exponential backoff: 1m / 5m / 15m / 1h / 6h
- max attempts: 5

---

## 3.16 CTI Callback Contract

### Recording ready callback

```json
{
  "call_id": "CALL-20260410-000120",
  "recording_id": "REC-20260410-000120",
  "recording_url": "https://cti.example.com/recordings/REC-20260410-000120",
  "started_at": "2026-04-10T08:58:00Z",
  "ended_at": "2026-04-10T09:01:20Z",
  "agent_id": "AGENT-0088"
}
```

### Required behavior

- If matching order exists and recording is pending → bind recording
- If no order exists → keep call_session indexed only
- If duplicate callback → idempotent success

---

## 3.17 Forwarder Callback Contract

### inbound order

```json
{
  "platform": "partner_a",
  "external_order_id": "PA-778811",
  "service_code": "taxi_standard",
  "pickup": {
    "lat": 24.264,
    "lng": 120.525,
    "address": "台中市梧棲區中二路一段9號"
  },
  "dropoff": {
    "lat": 24.347,
    "lng": 120.586,
    "address": "台中市大安區興安路378號"
  },
  "accept_timeout_sec": 15
}
```

### accept result

```json
{
  "platform": "partner_a",
  "external_order_id": "PA-778811",
  "result": "confirmed"
}
```

### lost race result

```json
{
  "platform": "partner_a",
  "external_order_id": "PA-778811",
  "result": "lost_race"
}
```

---

## 3.18 Enum Serialization Rules

- 所有 enum 以 `snake_case` 傳遞
- 不傳顯示名稱，只傳 canonical value
- UI 顯示文案由前端字典完成
- webhook / CSV / report export 也以 canonical value 為主，必要時加 display column

---

## 3.19 不允許的 API 行為

1. 前端直接 PATCH `order.current_status`
2. 以 `trip.complete=true` 取代 command endpoint
3. forwarded 單使用 owned assignment endpoint
4. 直接 update `dispatch_trace_log`
5. 以 delete 取代停用 / terminated / closed lifecycle
6. 讓 `public_info_version` 被原地覆寫
