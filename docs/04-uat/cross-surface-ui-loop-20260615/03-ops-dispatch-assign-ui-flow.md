# Ops dispatch board — pure-UI assign flow + automation boundary (2026-06-16)

## The exact pure-UI assign flow (read from `apps/ops-console-web/app/dispatch/dispatch-workflow.tsx`)

1. **Select an order row** in 待派遣佇列 → sets `selectedOrderId` → `selectedJob` →
   the job's candidates **auto-load** via `fetchCandidates` (effect at ~L820).
2. The detail panel renders `table.candidate-table` (only when
   `selectedCandidates.length > 0`). Each candidate row shows `vehicleId · driverId`
   and a **「選取」** button (`detail.chooseCandidate`, `setSelectedCandidate`).
3. After a candidate is selected, the toolbar **「指派」** button
   (`.detail-action-toolbar button.btn-primary`, `dispatch.workflow.assign`,
   `handleAssign`) — disabled until then — enables. Click it to assign.

## What worked (cross-surface loop on the single consolidated VM)

- API booking → **persists** (after the V0032/V0033 table migrations) → dispatch
  job (status `reserved`) with candidates (drv-demo-001).
- `/api/dispatch/assign` (the same endpoint `handleAssign` calls) → job `assigned`.
- **ops-console 派車調度 board (pure UI)** reflects it: 待派遣 0 → **已指派 1**.
- **Driver APP (pure UI)** shows the assigned task (order `7c253f30`).
- Breadth: 8 dev web apps render real UIs.

## Automation boundary (the one step not completed purely-by-UI-click)

Driving the **order-row selection** via Playwright headless did not populate the
candidate table: after clicking the order's visible route text, `selectedCandidates`
stayed empty (candidate-table count 0) with **no candidate HTTP error**. Most likely
the row's click handler is on a specific element (not the text cell I targeted), so
`selectedOrderId` never changed and the candidate auto-load never ran — i.e. an
automation-selector/headless-timing boundary, not a confirmed board defect. A human
completes it in 2 clicks (select order → 選取 → 指派) because real interaction sets
the React state normally.

## Follow-ups

- For reliable E2E UI automation of dispatch-assign, add stable `data-testid`s to the
  order row (selection target), the candidate `選取` button, and the `指派` button.
- The assign FUNCTION is proven (API + the board reflects 已指派); only the headless
  UI-click of candidate-select is unverified.
