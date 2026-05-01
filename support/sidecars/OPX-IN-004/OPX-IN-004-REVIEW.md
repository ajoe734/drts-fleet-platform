# OPX-IN-004 Review Notes

Reviewer: `Codex`
Date: `2026-04-29`
Status: `not_approvable_yet`

## Findings

1. Scope drift: the active code delta is centered on `owned-mobility` driver-task event externalization, not the forwarder operating-model hardening required by `OPX-IN-004`.
   Evidence:
   - Task objective and acceptance require forwarded-order lifecycle, adapter failure semantics, manual fallback, reconciliation behavior, and driver-source UX coverage in [docs/03-runbooks/phase1-operational-blueprint-execution-packet-20260429.md](/home/edna/workspace/drts-fleet-platform/docs/03-runbooks/phase1-operational-blueprint-execution-packet-20260429.md:356).
   - The current implementation delta is concentrated in [owned-mobility-task-events.service.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/owned-mobility/owned-mobility-task-events.service.ts:1), which adds Postgres `LISTEN/NOTIFY`, gzip payload transport, reconnect logic, and SLA lag logging.
     Impact:
   - This work looks aligned with runtime event externalization, but it does not materially implement the `forwarder` lifecycle/error-model acceptance gate for this task.

2. Required write-scope artifacts remain untouched for the acceptance criteria that are still open.
   Evidence:
   - `OPX-IN-004` explicitly scopes `apps/api/src/modules/forwarder/`, `apps/driver-app/app/jobs.tsx`, and `docs/02-architecture/` as primary delivery surfaces in [phase1-operational-blueprint-execution-packet-20260429.md](/home/edna/workspace/drts-fleet-platform/docs/03-runbooks/phase1-operational-blueprint-execution-packet-20260429.md:359).
   - The current worktree diff for this task only changes [owned-mobility-task-events.service.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/owned-mobility/owned-mobility-task-events.service.ts:1) and [packages/contracts/src/index.ts](/home/edna/workspace/drts-fleet-platform/packages/contracts/src/index.ts:189).
   - `jobs.tsx` already contains forwarded-task badges and a local-override warning in [apps/driver-app/app/jobs.tsx](/home/edna/workspace/drts-fleet-platform/apps/driver-app/app/jobs.tsx:193), so the current delta does not newly satisfy the driver-UI acceptance item either.
     Impact:
   - Approval would overstate completion because the task-scoped forwarder/docs surfaces have not been brought up to the spec.

3. The documented forwarder gaps called out by the operational blueprint remain undocumented in code or architecture output.
   Evidence:
   - The system blueprint requires `source-aware task mirror` and keeps forwarded orders outside owned dispatch authority in [phase1-operational-system-design-blueprint-20260429.md](/home/edna/workspace/drts-fleet-platform/docs/02-architecture/phase1-operational-system-design-blueprint-20260429.md:163).
   - The SA gap supplement explicitly says forwarder `SLA`, `timeout`, `manual fallback`, and `reconciliation` responsibilities are not yet formalized in [phase1-operational-sa-gap-supplement-20260429.md](/home/edna/workspace/drts-fleet-platform/docs/02-architecture/phase1-operational-sa-gap-supplement-20260429.md:484).
   - The service contract defines `external forwarder sync failed` as `mark sync error` plus `start reconciliation job` in [phase1_service_contracts_v1.md](/home/edna/workspace/drts-fleet-platform/phase1_service_contracts_v1.md:1193).
     Impact:
   - Before re-review, the owner still needs task-scoped artifacts that make adapter failure handling, manual fallback, and reconciliation explicit in the forwarder path itself.

## Re-review Gate

- Re-scope the implementation to `forwarder` lifecycle/error handling and the missing architecture write-up.
- If the event-bus changes are intended for another task, separate them from `OPX-IN-004` or clearly justify them as prerequisite support work while still landing the forwarder acceptance slice here.
- Hand back with forwarder-specific tests and any driver-UI/doc updates needed to prove the acceptance bullets, not just contracts/event transport changes.
