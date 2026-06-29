# P2-V9-UI-VERIFY-001 Backend / Runtime Gap Inventory

- Task: `P2-V9-UI-VERIFY-001`
- Date: `2026-06-29`

## 1. Ops AV fallback depends on missing ROC endpoints

- Route evidence: `http://127.0.0.1:3003/av-fallback` returns `500`.
- Server evidence:
  - `API error 404: {"message":"Cannot GET /api/roc/trips","error":"Not Found","status_code":404}`
  - `API error 404: {"message":"Cannot GET /api/roc/alerts","error":"Not Found","status_code":404}`
- Affected runtime routes:
  - `/av-fallback`
  - `/av-fallback/passenger-recovery/[orderId]`
  - `/av-fallback/sandbox-exceptions`
- Impact:
  - the v9 canvas route shell exists in code, but the healthy runtime surface cannot be smoke-captured until the ROC read endpoints exist for Ops

## 2. Shared dev API does not expose sandbox-governance data endpoints

- Direct API evidence:
  - `GET https://drts-dev-api-waji3fer3a-uc.a.run.app/api/admin/sandbox-governance/experiments` -> `404`
- Affected runtime routes:
  - `/sandbox`
  - `/sandbox/[experimentId]`
  - `/sandbox/suspend`
- Impact:
  - route chrome and screenshots were captured
  - live experiment rows were not available from the shared dev API
  - populated detail-tab parity could not be re-verified against seeded experiment data in this task

## 3. Tenant AV fallback list is present but degraded; no detail row could be resolved

- Local runtime evidence from `/bookings/av-fallback`:
  - `部分 AV 履約資料未成功載入`
  - `目前沒有可見的 AV 履約訂單`
- Affected runtime routes:
  - `/bookings/av-fallback`
  - `/bookings/[bookingId]/av-fallback`
- Impact:
  - the list route was verified and screenshot-captured in its degraded state
  - no visible fallback booking row was available, so the detail route could not be resolved from live runtime data
  - this task therefore records tenant detail as a runtime-data gap, not as a completed visual-parity check

