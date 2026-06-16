# Cross-Surface Full-UI Loop — Findings & Gap Inventory (2026-06-15)

Goal: a 100% UI-driven, unbroken loop on the **shared dev environment** —
service web app 下單 → (審批) → ops 派工/指派 → **driver APP** 接單/完單 →
回服務 web app 驗證 — with the driver APP pointed at the **dev API** so every
surface shares one dataset. Browser automation = Playwright; APP = adb on the
`drts-android-dev-vm` emulator.

## Environment wired up (works)
- Driver APP repointed to dev API `https://drts-dev-api-3jclgrt4xa-uc.a.run.app`
  (HTTPS, public). Bootstrap driver auth accepted (`/api/driver/task-views` 200).
- Playwright + chromium installed on the VM; drives the real dev web apps.
- dev web apps reachable + data-bound to the dev API (ops-console dispatch board
  reads `/api/orders`, `/api/dispatch/tasks`, `listDispatchCandidates` live).

## What was proven end-to-end (shared dev env)
1. **Web 下單 (real UI):** Playwright on `enterprise-dispatch-web` →確認權責→送出預約 → 已受理.
2. **Order → driver APP:** a dev order (created via the tenant→dispatch→assign
   chain, `E2E-006` against dev = 1/1) appeared in the driver APP with the exact
   matching task id; full lifecycle accept→on_trip→complete (with proof) all 201.
3. **Service back-office reflects shared state:** ops-console `/dispatch` showed
   已指派 1 / 轉派鏡像 1 for the seed tenant, source = Live.

→ The data path web ↔ dev API ↔ driver APP ↔ web is real. What is NOT yet
possible is doing **every** intermediate step **purely by clicking a UI**.

## Gaps blocking a 100% pure-UI loop (the inventory)

### G1 — Enterprise "approval" is frontstage copy, not a real gate
`POST /api/tenant/bookings` (enterprise_dispatch) returns `status=created` with no
`approvalState`/`approvalRequestIds`. The enterprise-dispatch-web "accepted +
pending / 等待主管審批" is **frontstage display copy** ("送出後可能先顯示
accepted+pending"), not a backend approval requirement. **No approval request is
created** (`GET /api/ops/approval-requests` → `total_items: 0`).
- Impact: the "approval gate" we feared does not actually gate; but it also means
  the UI tells the user it is pending approval when nothing is pending — misleading.
- Fix: align the enterprise frontstage status with the real order status
  (`created`), or, if approval IS intended for high-value bookings, actually
  create an approval request so ops-console `/approval-requests` (which already has
  a working approve/reject UI) can action it.

### G2 — Created orders do not surface in the operator dispatch queue (UI)
A `created` booking/order does not appear in ops-console `/dispatch` 待派遣佇列
(it shows 0), and `GET /api/orders` returns 0 even to `platform_admin`. So an
operator cannot select the freshly-booked order and run candidates → assign a
driver **by clicking** — the order is invisible to the dispatch UI until an
explicit `POST /orders/:id/dispatch` is issued (an API step with no surfaced UI
trigger for a just-created reservation).
- Impact: the 派工/指派 leg cannot be driven purely by UI for a web-booked order;
  it currently requires an API dispatch call (what `E2E-006` does).
- Fix: surface `created`/reservation orders awaiting dispatch in the ops dispatch
  board with a "dispatch" action, or auto-create the dispatch job on booking so it
  lands in 待派遣佇列.

### G3 — List endpoints are scope-inconsistent
`/api/orders` and `/api/ops/approval-requests` return empty to `platform_admin`
even though assigned tasks exist (driver APP + dispatch board show them). Cross-
surface verification by these list endpoints is therefore unreliable; the dispatch
board only reflected counts (已指派 1) via its own scoped reads.
- Fix: make the operator list endpoints return the same data the boards consume
  (consistent scoping), so verification is deterministic.

### G4 — Driver APP completion proof needs a gallery image
`complete` requires proof photos via the Android image picker. For automation,
push any image to the emulator gallery first (`adb push` + media scan), then drive
the picker — no real photo needed. (Per direction: a placeholder image is fine.)

## Recommended fix order (then re-verify the full UI loop)
1. **G1** (frontstage status alignment) — small, in `enterprise-dispatch-web`.
2. **G2** (surface created orders in dispatch board + dispatch action) — the key
   enabler for pure-UI 派工/指派.
3. **G3** (operator list endpoint scoping) — makes verification deterministic.
4. Seed a placeholder gallery image on the emulator for **G4**, then run the full
   pure-UI loop per service line (partner-booking / enterprise / concierge…),
   archiving screenshots + adding an integration test per line.

## Status
Inventory complete (this doc). Fixes pending sign-off on scope (G2/G3 are
operator-surface integration changes, not one-liners).
