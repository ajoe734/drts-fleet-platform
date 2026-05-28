# Sidecar Acceptance Packet: UI-FE-ADM-UMBRELLA

- **Parent Task:** `UI-FE-ADM-UMBRELLA` (`Platform Admin rebuild — umbrella status / closeout`)
- **Sidecar Task:** `UI-FE-ADM-UMBRELLA-SIDECAR-ACCEPTANCE`
- **Parent Owner:** `Codex2`
- **Parent Reviewer:** `Claude2`
- **Sidecar Owner:** `Codex`
- **Sidecar Reviewer:** `Codex2`
- **Status at packet write:** parent `in_progress`; sidecar `in_progress`
- **Scope Guardrail:** support artifact only; no canonical truth or runtime implementation changes
- **Primary Machine Truth:** `/home/edna/workspace/drts-fleet-platform/ai-status.json`
- **UI design authority:** `docs/05-ui/platform-admin-design-handoff-packet-20260525.md`

## 1. Purpose

This packet prepares the reviewer-facing acceptance checklist and dependency
map for `UI-FE-ADM-UMBRELLA` without mutating parent machine truth.

It exists to answer three narrow questions:

1. Are all 18 umbrella child tasks closed in current machine truth?
2. Does the current repo-visible route inventory still match the intended 18
   Platform Admin surfaces from the design handoff packet?
3. What evidence is still missing before the parent umbrella can truthfully
   satisfy its own closeout acceptance (`closeout doc; storybook; smoke test clean`)?

## 2. Machine-Truth Snapshot

Canonical root state at packet write:

| Task | Status | Owner | Reviewer | Notes |
| --- | --- | --- | --- | --- |
| `UI-FE-ADM-UMBRELLA` | `in_progress` | `Codex2` | `Claude2` | Parent `next`: auditing dependency status, rebuild coverage, storybook parity, and smoke readiness before drafting umbrella closeout evidence. |
| `UI-FE-ADM-UMBRELLA-SIDECAR-ACCEPTANCE` | `in_progress` | `Codex` | `Codex2` | Support packet only. |
| `UI-FE-ADM-HOME` | `done` | `Codex2` | `Claude` | Artifact `apps/platform-admin-web/app/page.tsx` |
| `UI-FE-ADM-TEN` | `done` | `Claude2` | `Codex2` | Artifact `apps/platform-admin-web/app/tenants/page.tsx` |
| `UI-FE-ADM-TENID` | `done` | `Codex2` | `Claude` | Artifact `apps/platform-admin-web/app/tenants/[tenantId]/page.tsx` |
| `UI-FE-ADM-TENGOV` | `done` | `Codex` | `Claude2` | Artifact `apps/platform-admin-web/app/tenant-governance/page.tsx` |
| `UI-FE-ADM-PRT` | `done` | `Codex` | `Claude` | Artifact `apps/platform-admin-web/app/partners/page.tsx` |
| `UI-FE-ADM-PRTID` | `done` | `Codex2` | `Claude2` | Artifact `apps/platform-admin-web/app/partners/[entrySlug]/page.tsx` |
| `UI-FE-ADM-USR` | `done` | `Codex` | `Claude2` | Artifact `apps/platform-admin-web/app/users/page.tsx` |
| `UI-FE-ADM-FLT` | `done` | `Codex` | `Claude` | Artifact `apps/platform-admin-web/app/fleet/page.tsx` |
| `UI-FE-ADM-SWB` | `done` | `Codex2` | `Claude2` | Artifact `apps/platform-admin-web/app/switchboard/page.tsx` |
| `UI-FE-ADM-PRC` | `done` | `Codex` | `Claude` | Artifact `apps/platform-admin-web/app/pricing/page.tsx` |
| `UI-FE-ADM-PAY` | `done` | `Codex2` | `Claude2` | Artifact `apps/platform-admin-web/app/payments/page.tsx` |
| `UI-FE-ADM-REIMB` | `done` | `Codex2` | `Claude2` | Machine truth says reimbursement queue is closed. |
| `UI-FE-ADM-REIMBID` | `done` | `Codex2` | `Claude` | Machine truth says reimbursement detail is closed. |
| `UI-FE-ADM-HLT` | `done` | `Codex2` | `Claude2` | Artifact `apps/platform-admin-web/app/health/page.tsx` |
| `UI-FE-ADM-NTC` | `done` | `Codex` | `Claude2` | Artifact `apps/platform-admin-web/app/notices/page.tsx` |
| `UI-FE-ADM-AUD` | `done` | `Codex2` | `Claude2` | Artifact `apps/platform-admin-web/app/audit/page.tsx` |
| `UI-FE-ADM-FF` | `done` | `Codex` | `Claude2` | Artifact `apps/platform-admin-web/app/feature-flags/page.tsx` |
| `UI-FE-ADM-ADP` | `done` | `Codex` | `Claude2` | Artifact `apps/platform-admin-web/app/adapter-registry/page.tsx` |

Machine-truth implication:

- The parent umbrella no longer depends on unfinished child tasks.
- The parent umbrella is now a closeout/evidence task, not an implementation
  task.
- The sidecar reviewer should therefore focus on evidence coherence, not on
  re-opening already-closed child slices unless a concrete drift is shown.

## 3. Dependency Map

### 3.1 Child-task to design-section map

| Child task | Route / artifact | Design handoff section |
| --- | --- | --- |
| `UI-FE-ADM-HOME` | `/` → `app/page.tsx` | §5.1 |
| `UI-FE-ADM-TEN` | `/tenants` → `app/tenants/page.tsx` | §5.2 |
| `UI-FE-ADM-TENID` | `/tenants/[tenantId]` → `app/tenants/[tenantId]/page.tsx` | §5.3 |
| `UI-FE-ADM-TENGOV` | `/tenant-governance` → `app/tenant-governance/page.tsx` | §5.4 |
| `UI-FE-ADM-PRT` | `/partners` → `app/partners/page.tsx` | §5.5 |
| `UI-FE-ADM-PRTID` | `/partners/[entrySlug]` → `app/partners/[entrySlug]/page.tsx` | §5.6 |
| `UI-FE-ADM-USR` | `/users` → `app/users/page.tsx` | §5.7 |
| `UI-FE-ADM-FLT` | `/fleet` → `app/fleet/page.tsx` | §5.8 |
| `UI-FE-ADM-SWB` | `/switchboard` → `app/switchboard/page.tsx` | §5.9 |
| `UI-FE-ADM-PRC` | `/pricing` → `app/pricing/page.tsx` | §5.10 |
| `UI-FE-ADM-PAY` | `/payments` → `app/payments/page.tsx` | §5.11 |
| `UI-FE-ADM-REIMB` | `/payments/reimbursements` | §5.12 |
| `UI-FE-ADM-REIMBID` | `/payments/reimbursements/[batchId]` | §5.13 |
| `UI-FE-ADM-HLT` | `/health` → `app/health/page.tsx` | §5.14 |
| `UI-FE-ADM-NTC` | `/notices` → `app/notices/page.tsx` | §5.15 |
| `UI-FE-ADM-AUD` | `/audit` → `app/audit/page.tsx` | §5.16 |
| `UI-FE-ADM-FF` | `/feature-flags` → `app/feature-flags/page.tsx` | §5.17 |
| `UI-FE-ADM-ADP` | `/adapter-registry` → `app/adapter-registry/page.tsx` | §5.18 |

### 3.2 Repo-visible route inventory on current `HEAD`

Current worktree `HEAD` equals `origin/dev` at
`0e3de49b2409686d77c65567fe7e9da72b769855`.

Repo-visible `page.tsx` inventory under `apps/platform-admin-web/app` currently
shows 16 page entries:

- `/`
- `/tenants`
- `/tenants/[tenantId]`
- `/tenant-governance`
- `/partners`
- `/partners/[entrySlug]`
- `/users`
- `/fleet`
- `/switchboard`
- `/pricing`
- `/payments`
- `/health`
- `/notices`
- `/audit`
- `/feature-flags`
- `/adapter-registry`

Notably absent from the checked-out tree:

- `apps/platform-admin-web/app/payments/reimbursements/page.tsx`
- `apps/platform-admin-web/app/payments/reimbursements/[batchId]/page.tsx`

That means the current repo-visible route inventory is `16/18`, while machine
truth still records both reimbursement tasks as `done`.

### 3.3 Reviewer implication

This packet does not decide whether the drift came from:

- machine truth getting ahead of `origin/dev`,
- a later revert/drop from the checked-out branch,
- or a task that closed against code no longer present on the shared baseline.

It does make one acceptance implication explicit: the parent umbrella should
not claim complete route-surface closeout until the reimbursement queue/detail
artifacts are either visible again on the reviewed baseline or the discrepancy
is reconciled in machine truth.

## 4. Parent Acceptance Crosswalk

Parent umbrella acceptance from machine truth:

1. `All 18 sub-tasks done`
2. `closeout doc`
3. `storybook`
4. `smoke test clean`

Crosswalk:

| Parent acceptance item | Current evidence state | Notes for reviewer |
| --- | --- | --- |
| All 18 sub-tasks done | `PASS` in machine truth | All 18 child rows are `done` in canonical `ai-status.json`. |
| Closeout doc exists | `NOT YET EVIDENCED HERE` | No `docs/05-ui/platform-admin-rebuild-closeout-*.md` file is present in the checked-out tree during this pass. |
| Storybook parity / storybook evidence | `NOT YET EVIDENCED HERE` | Parent row acceptance requires it, but this sidecar found no umbrella closeout packet or linked storybook evidence in the checked-out tree. |
| Smoke test clean | `NOT YET EVIDENCED HERE` | Parent `next` says Codex2 is still auditing smoke readiness. This sidecar did not rerun app smoke tests. |
| 18-screen route coverage on reviewed baseline | `DRIFT` | Machine truth says 18 children are done, but repo-visible route inventory only shows 16 pages because the two reimbursement routes are absent. |

## 5. Reviewer Checklist

The `Codex2` review for this sidecar should be narrow:

1. Confirm the packet correctly reflects canonical-root machine truth for the
   parent, sidecar, and all 18 child tasks.
2. Confirm the child-task map to `docs/05-ui/platform-admin-design-handoff-packet-20260525.md`
   §§5.1-5.18 is accurate.
3. Confirm the current `origin/dev`-aligned repo inventory really lacks the
   two reimbursement route files named above.
4. Confirm the packet does not over-claim umbrella readiness: child-task
   completion is accepted, but umbrella closeout evidence is still incomplete
   and route-surface drift remains unresolved.

## 6. Evidence Anchors

- Canonical machine truth:
  - `/home/edna/workspace/drts-fleet-platform/ai-status.json`
    - `UI-FE-ADM-UMBRELLA`
    - `UI-FE-ADM-HOME`
    - `UI-FE-ADM-TEN`
    - `UI-FE-ADM-TENID`
    - `UI-FE-ADM-TENGOV`
    - `UI-FE-ADM-PRT`
    - `UI-FE-ADM-PRTID`
    - `UI-FE-ADM-USR`
    - `UI-FE-ADM-FLT`
    - `UI-FE-ADM-SWB`
    - `UI-FE-ADM-PRC`
    - `UI-FE-ADM-PAY`
    - `UI-FE-ADM-REIMB`
    - `UI-FE-ADM-REIMBID`
    - `UI-FE-ADM-HLT`
    - `UI-FE-ADM-NTC`
    - `UI-FE-ADM-AUD`
    - `UI-FE-ADM-FF`
    - `UI-FE-ADM-ADP`
    - `UI-FE-ADM-UMBRELLA-SIDECAR-ACCEPTANCE`
- Design authority:
  - `docs/05-ui/platform-admin-design-handoff-packet-20260525.md`
    - sitemap at §4
    - per-page briefs at §§5.1-5.18
- Current route shell:
  - `apps/platform-admin-web/components/admin-nav.tsx`
  - `apps/platform-admin-web/app/layout.tsx`
- Current route inventory:
  - `apps/platform-admin-web/app/page.tsx`
  - `apps/platform-admin-web/app/tenants/page.tsx`
  - `apps/platform-admin-web/app/tenants/[tenantId]/page.tsx`
  - `apps/platform-admin-web/app/tenant-governance/page.tsx`
  - `apps/platform-admin-web/app/partners/page.tsx`
  - `apps/platform-admin-web/app/partners/[entrySlug]/page.tsx`
  - `apps/platform-admin-web/app/users/page.tsx`
  - `apps/platform-admin-web/app/fleet/page.tsx`
  - `apps/platform-admin-web/app/switchboard/page.tsx`
  - `apps/platform-admin-web/app/pricing/page.tsx`
  - `apps/platform-admin-web/app/payments/page.tsx`
  - `apps/platform-admin-web/app/health/page.tsx`
  - `apps/platform-admin-web/app/notices/page.tsx`
  - `apps/platform-admin-web/app/audit/page.tsx`
  - `apps/platform-admin-web/app/feature-flags/page.tsx`
  - `apps/platform-admin-web/app/adapter-registry/page.tsx`

## 7. Sidecar Verification

Verification performed for this sidecar artifact only:

- canonical-root `ai-status.json` review for parent, sidecar, and all 18 child
  dependencies
- design handoff packet review for sitemap and per-page section mapping
- checked-out route inventory scan under `apps/platform-admin-web/app`
- branch baseline check: `git rev-parse HEAD` equals `git rev-parse origin/dev`

No runtime tests were run for this sidecar because it is support-only and does
not change executable behavior.
