# Tenant Rollout State Machine

## Scope

- Authority for `Q-ADM05` tenant rollout lifecycle and gate semantics.
- Canonical document for `TenantRolloutStateMachineRecord` consumers in
  Platform Admin.
- Companion documents:
  - `docs/05-ui/system-design-answers-all-apps-20260524.md` §Q-ADM05
  - `docs/01-product/platform-admin-ops-tenant-console-product-spec-20260508.amendment-20260524.md` §4.1
  - `packages/contracts/src/ui-runtime.ts` `TenantRolloutStateMachineRecord`

If any lower-precedence runbook, UAT, or UI mock uses older stage names, this
document wins.

## Stages And Gate Status

Tenant rollout stage:

```text
sandbox
pilot
production
rollback_hold
```

Gate status:

```text
pending
ready
approved
blocked
```

The UI must render these values from backend-owned state. The UI must not infer
next stages from tenant status strings, local role assumptions, or visual flow
position.

## Contract

`TenantRolloutStateMachineRecord` remains the binding UI/runtime contract:

```ts
export type TenantRolloutStage =
  | "sandbox"
  | "pilot"
  | "production"
  | "rollback_hold";

export type TenantRolloutGateStatus =
  | "pending"
  | "ready"
  | "approved"
  | "blocked";

export interface TenantRolloutStateMachineRecord {
  tenantId: string;
  stage: TenantRolloutStage;
  gateStatus: TenantRolloutGateStatus;
  cutoverOwnerUserId: string | null;
  cutoverOwnerDisplayName: string | null;
  rollbackOwnerUserId: string | null;
  rollbackOwnerDisplayName: string | null;
  rollbackPrepared: boolean;
  enteredStageAt: string;
  enteredGateAt: string;
  lastUpdatedBy: string;
  lastUpdatedAt: string;
  availableActions: ResourceActionDescriptor[];
}
```

Per `Q-ADM06`, the cutover owner and rollback owner are platform user records,
not free-text workflow notes.

## Transition Rules

```text
sandbox
  ├─ gates become ready -> gateStatus=ready
  ├─ tenant manager approves ready sandbox gate -> gateStatus=approved
  ├─ approved sandbox gate -> stage=pilot, gateStatus=pending
  └─ explicit block or critical finding -> stage=rollback_hold, gateStatus=blocked

pilot
  ├─ gates become ready -> gateStatus=ready
  ├─ tenant manager approves ready pilot gate -> gateStatus=approved
  ├─ approved pilot gate + cutoverOwner + rollbackOwner + rollbackPrepared
  │  -> stage=production, gateStatus=pending
  └─ explicit block or failed readiness check -> stage=rollback_hold, gateStatus=blocked

production
  ├─ production readiness evidence settles -> gateStatus=ready or approved
  └─ incident, regression, or operator decision -> stage=rollback_hold, gateStatus=blocked

rollback_hold
  ├─ all promotion actions remain blocked
  └─ hold resolved -> stage returns to the previous safe stage, gateStatus=pending or blocked
```

## Invariants

1. Entering `production` requires `cutoverOwner`, `rollbackOwner`, and
   `rollbackPrepared=true`.
2. `rollback_hold` blocks any promotion to `production` until the hold is
   explicitly resolved.
3. Every transition and every rejected promotion attempt is audit-subject
   first-class data.
4. `availableActions[]` is the only authority for which rollout CTAs are shown
   or enabled on `/tenants` and `/tenants/[tenantId]`.
5. Notifications `tenant.rollout_gate.ready` and
   `tenant.rollback_hold.enabled` are emitted from this state machine, not from
   UI-local heuristics.

## Surface Consumption

- `/tenants` shows stage, gate status, cutover owner, rollback owner, and
  last activity as read-model data.
- `/tenants/[tenantId]` uses the full record to drive promotion, suspend,
  activate, and rollback-hold affordances.
- `/tenant-governance` may aggregate counts from this state machine, but it
  does not redefine the state set.

## Implementation Routing

- `UI-BE-006` owns storage, transition handlers, and `availableActions[]`
  computation for this record.
- `UI-CL-001` must preserve refresh and health envelopes around the read model.
- `UI-FE-ADM-TEN` and `UI-FE-ADM-TENID` consume this contract as canonical
  behavior truth for stage pills, gate pills, filter chips, and CTA authority.
