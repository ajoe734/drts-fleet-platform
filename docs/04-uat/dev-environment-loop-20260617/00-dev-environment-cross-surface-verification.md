# Dev-environment cross-surface verification (2026-06-17)

## Why this exists — correction of a prior gap

The earlier cross-surface loop work (`docs/04-uat/cross-surface-ui-loop-20260615/`)
and the 10-round driver-app sweep (`docs/04-uat/driver-app-verification-20260615/`)
were executed against a **full stack run locally on `drts-dev-vm`** (local API on
`:3001` with in-memory read models, local `next dev` web apps, emulator pointed at
`10.0.2.2:3001`). That proved the *code* was correct, but it was **not** the
deployed **dev Cloud Run** environment. Two different process sets, two different
datasets.

This document records re-running the same loop against the **actual deployed dev
environment** after the persistence fix was merged and deployed.

## What changed before this verification

1. **Merged** `#750` — `V0033__missing_phase1_persistence_tables.sql` (the 5
   referenced-but-unmigrated phase1 tables) into `dev`.
2. **Deployed** to dev Cloud Run via `deploy-dev.yml` manual dispatch,
   `source_ref = 8667ec27e307622e5870cfee389ab36fe71ff602` (dev HEAD incl. #750),
   `skip_migration = false`, `target_profile = waji`.
   - Run `27697827646` — **conclusion: success**.
   - `DB migration` step executed `gcloud run jobs execute drts-dev-migrate --wait`
     (would have failed the run on a bad migration), so V0032/V0033 are applied to
     the dev Cloud SQL instance.

## Environment under test (real dev Cloud Run, project `drts-dev-ray-20260527`)

| Surface | URL |
| --- | --- |
| API | `https://drts-dev-api-waji3fer3a-uc.a.run.app` |
| Ops Console | `https://drts-dev-ops-console-web-waji3fer3a-uc.a.run.app` |
| Enterprise Dispatch | `https://drts-dev-enterprise-dispatch-web-waji3fer3a-uc.a.run.app` |
| Tenant Console | `https://drts-dev-tenant-console-web-waji3fer3a-uc.a.run.app` |

Driver app: Expo dev-client on the KVM emulator (`emulator-5554`), Metro rebundled
with `EXPO_PUBLIC_API_URL=https://drts-dev-api-waji3fer3a-uc.a.run.app` and
`EXPO_PUBLIC_DRIVER_ID=drv-demo-001`. The driver app is app-auth-first (no IAP) and
hits the public dev API directly.

## Evidence

### 1. dev API — full enterprise dispatch chain (E2E-001) PASS

`E2E_API_URL=https://drts-dev-api-waji3fer3a-uc.a.run.app ./tests/e2e/run-e2e.sh --suite 001`
→ **1/1 passed**. Chain on dev:

```
tenant.bookingId   = booking-000108         # POST /tenant/bookings PERSISTED (was the V0033-broken step)
tenant.orderId     = ad81c169-e40d-4051-be4b-291d154f75be
ops.dispatchJobId  = 4910cc8b-a559-44b6-b863-52c9ffa0cbd7
ops.driverId       = drv-demo-001  (veh-demo-001)
driver.taskId      = 63f56d2b-a629-4859-aa41-7da1c7988ee6   # accept→depart→arrived→start→complete
billing.invoiceId  = invoice-ce52ac3a-fbe7-4852-be58-1c34569040c2
audit.entryCount   = 1000
```

The booking creating-and-reading-back (`status active → completed`) is the exact
behaviour that previously rolled back / 404'd before V0033. It now succeeds **on
deployed dev**.

### 2. Fresh actionable task seeded on dev

`tests/e2e/dev-seed-pending-task.sh` (booking → dispatch → assign, left
**not accepted**):

```
bookingId      = booking-000109
orderId        = 1e618755-6a76-4c48-b0f8-92604b623d06
dispatchJobId  = 0a35078b-2825-4777-b2b9-09fb4ebfe663
taskId         = 539396c6-3012-4872-888f-797b2ad9a181  (status pending_acceptance, driver drv-demo-001)
```

`GET /api/driver/tasks` (actor `drv-demo-001`) on dev → 66 tasks, top item is the
above pending task.

### 3. Driver APP (emulator → dev API) shows dev data

- `screenshots/01-driver-cockpit-dev.png` — 工作台 cockpit, `drv-demo-001`, "live",
  Next Best Action urgent task **「優先回應 … Staging International Airport,
  Terminal 2」** with 接受任務 / 婉拒任務.
- `screenshots/02-driver-jobs-dev.png` — 任務 list: 統計 **70**, 需動作 **19**,
  外部平台 **4**; cards incl. the seeded **「88 Corporate HQ, Staging City →
  Staging International Airport, Terminal 2」** (待引機處理).

### 4. Dev Ops Console web UI shows the dev dispatch queue

- `screenshots/03-ops-console-dispatch-dev.png` — `/dispatch` 派遣工作站 renders the
  待派遣佇列 + 已指派 board and the full order table (訂單 / 租戶 / 上車→下車 / 時窗 /
  服務 / ETA / 候選 / 資格 / 關卡 / 操作), served via the control-plane-proxy against
  the dev API.

## Conclusion

The cross-surface loop — **web/ops console ↔ dev API ↔ driver Android APP** — now
verifies on the **actual deployed dev Cloud Run environment**, not a local stand-in.
The V0033 persistence fix is live on dev.

## Known still-open (unchanged by this run)

- `enterprise-dispatch-web` booking submit is a frontstage demo nav `<Link>` (does
  not call the API). Tracked in
  `docs/04-uat/cross-surface-ui-loop-20260615/02-enterprise-web-booking-frontstage.md`.
- The ops dispatch candidate-select click is hard to drive headless (no stable
  `data-testid`). Tracked in
  `docs/04-uat/cross-surface-ui-loop-20260615/03-ops-dispatch-assign-ui-flow.md`.
