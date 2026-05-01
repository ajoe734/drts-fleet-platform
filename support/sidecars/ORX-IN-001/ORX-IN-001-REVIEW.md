# ORX-IN-001 Review Notes

Reviewer: `Codex`
Date: `2026-04-30`
Status: `changes_requested`

## Findings

1. Missing recordings never propagate into the order/dispatch model after a call closes or a closed call is linked to an order.
   Evidence:
   - `apps/api/src/modules/callcenter/callcenter.service.ts:237-250` and `301-333` only mark the call session with `recording_missing`; they do not notify owned-mobility when a call closes without a recording or when a closed session is linked late.
   - The only callcenter-to-order sync path is the recording-attached listener wired at `apps/api/src/modules/callcenter/callcenter.service.ts:87-90` and consumed by `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:653-710`, so orders only react when a recording arrives.
   - The order itself is initialized as `recording_pending` / `recording_bound` only (`apps/api/src/modules/owned-mobility/owned-mobility.service.ts:400-429`), while dispatch derives the badge from order fields and flags only (`apps/ops-console-web/app/dispatch/dispatch-workflow.tsx:139-155` and `631-705`).
     Impact:
   - A phone order whose call is already closed without a recording still shows `pending` in dispatch instead of `missing`. Operators cannot distinguish "callback still pending" from "post-call evidence gap", which misses the acceptance requirement that recording state be visible as `ready`, `pending`, or `missing` across the callcenter/dispatch workflow.
     Fix ask:
   - Propagate the closed-without-recording and late-linkage transitions into the order model (`status` and/or `complianceFlags`), then add a regression that proves dispatch sees `missing` after close/link, not only after attach.

2. Closed missing sessions keep the `recording_pending` flag, so the workspace summary and detail flags contradict the new `missing` badge.
   Evidence:
   - Sessions start with `recording_pending` in `apps/api/src/modules/callcenter/callcenter.service.ts:97-117`.
   - `closeCallSession()` adds `recording_missing` but never removes `recording_pending` in `apps/api/src/modules/callcenter/callcenter.service.ts:237-250`.
   - The page summary counts pending sessions with `session.flags.includes("recording_pending")`, and the detail card renders the raw flags list in `apps/ops-console-web/app/callcenter/page.tsx:221-223` and `542-549`.
   - The new test at `apps/api/tests/unit/callcenter.service.test.ts:29-42` only asserts that `recording_missing` was added; it does not assert that `recording_pending` was removed.
     Impact:
   - The same closed call can show the `missing` chip while still being counted inside the "recording pending" KPI and still rendering `recording_pending` in the detail flags. That is a user-visible contradiction inside the workspace itself.
     Fix ask:
   - Clear `recording_pending` whenever a linked session transitions to missing on close, and add a focused regression that proves the pending flag/count drops when the session becomes missing.

## Verification

- `pnpm --filter @drts/contracts build` -> passed
- `pnpm -C apps/api exec vitest run tests/unit/callcenter.service.test.ts tests/unit/owned-mobility-compliance-gates.test.ts` -> passed
- `pnpm -C apps/ops-console-web exec tsc --noEmit` -> passed
- The current focused tests do not cover the two blockers above.
