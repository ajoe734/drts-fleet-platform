# UI-FE-ADM-TEN Unblock Planning Decision

## Scope

- Task: `UI-FE-ADM-TEN-UNBLOCK-PLANNING-DECISION`
- Parent: `UI-FE-ADM-TEN`
- Owner: `Codex`
- Reviewer: `Claude`
- Decision date: `2026-05-27`

## Diagnosis

`UI-FE-ADM-TEN` was routed into a planning-decision helper because the tenant
list page depends on a canonical answer for the rollout stage/gate model:

- `docs/05-ui/platform-admin-design-handoff-packet-20260525.md` §5.2 requires
  the list to show rollout stage and rollout gate status.
- `docs/05-ui/system-design-answers-all-apps-20260524.md` §Q-ADM05 already
  decided that tenant rollout must have a single source-of-truth state-machine
  document at `docs/02-architecture/tenant-rollout-state-machine.md`.
- That named document did not exist, even though related details were scattered
  across `packages/contracts/src/ui-runtime.ts`,
  `docs/01-product/platform-admin-ops-tenant-console-product-spec-20260508.amendment-20260524.md`,
  `docs/03-runbooks/tenant-onboarding-rollout-runbook.md`, and
  `docs/02-architecture/platform-admin-control-plane-state-machines-20260524.md`.

The blocker was therefore not an unresolved product choice. It was a missing
canonical planning artifact for an already-made decision.

## Decision

No scope cut is needed. The canonical resolution is:

1. Materialize the missing `Q-ADM05` source-of-truth file at
   `docs/02-architecture/tenant-rollout-state-machine.md`.
2. Treat that file as the authority for:
   - the allowed rollout stages: `sandbox`, `pilot`, `production`,
     `rollback_hold`
   - the allowed gate statuses: `pending`, `ready`, `approved`, `blocked`
   - promotion prerequisites for `production`
   - `rollback_hold` blocking behavior
   - `availableActions[]` as the only CTA authority for `/tenants` and
     `/tenants/[tenantId]`
3. Treat older or broader summaries as secondary. In particular, if a runbook
   or UAT note still uses older rollout wording, the new tenant-rollout
   state-machine document wins.

## Scope Cut And Routing

- `UI-FE-ADM-TEN` stays in scope as the Platform Admin tenant-list rebuild.
- This helper does not change the page's visual or UX acceptance.
- This helper does not bypass `UI-BE-006`, `UI-CL-001`, or the shared
  workspace import/typecheck blocker recorded on the parent task.
- No further product-semantics unblock helper is needed for `UI-FE-ADM-TEN`
  unless a higher-precedence document later changes the stage machine itself.

## Parent Unblocked Next Step

`UI-FE-ADM-TEN.next` should route to:

Resume `UI-FE-ADM-TEN` against the canonical rollout contract now recorded in
`docs/02-architecture/tenant-rollout-state-machine.md`. Keep the rebuilt
`apps/platform-admin-web/app/tenants/page.tsx` aligned to that state machine
and rerun page acceptance once `UI-BE-006`, `UI-CL-001`, and the shared
`@drts/contracts` / `@drts/ui-tokens` workspace resolution failures are
cleared. Do not spawn another planning-decision child for rollout semantics.

This means the parent is no longer blocked on missing product/contract truth.
Its remaining blockers are implementation dependencies and the shared build
surface.

## Verification Basis

- `docs/05-ui/system-design-answers-all-apps-20260524.md` §Q-ADM05, §Q-ADM06
- `docs/05-ui/platform-admin-design-handoff-packet-20260525.md` §5.2, §5.3
- `docs/01-product/platform-admin-ops-tenant-console-product-spec-20260508.amendment-20260524.md` §4.1
- `packages/contracts/src/ui-runtime.ts` `TenantRolloutStateMachineRecord`
- `docs/02-architecture/platform-admin-control-plane-state-machines-20260524.md`
- `docs/03-runbooks/tenant-onboarding-rollout-runbook.md`
