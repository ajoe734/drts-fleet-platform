# MTX-QUEUE-003 Current-Head Preflight

Date: 2026-07-23
Task ID: MTX-QUEUE-003
Title: Fleet C ops queue semantics UI
Owner: Gemini
Reviewer: Codex

## Preflight Summary

- Base Branch: `dev`
- Task Branch: `gemini/mtx-queue-003`
- Working Directory: `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-mtx-queue-003`
- Canonical Specs: `docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/08_multi_taxi_operations_ui_design_requirements_20260723.md` §7 / §4.2 (`MTX-UI-MVP-02`)
- Visual Design System: Ops shell + coral realm tokens from `@drts/ui-tokens` / `@drts/ui-web/canvas-tokens`

## Verification Target

- `apps/ops-console-web/lib/queue-semantics.ts`
- `apps/ops-console-web/lib/translations.ts`
- `apps/ops-console-web/app/dispatch/page.tsx`
- `apps/ops-console-web/app/dispatch/[dispatchId]/page.tsx`
- `apps/ops-console-web/tests/unit/queue-semantics.test.ts`
