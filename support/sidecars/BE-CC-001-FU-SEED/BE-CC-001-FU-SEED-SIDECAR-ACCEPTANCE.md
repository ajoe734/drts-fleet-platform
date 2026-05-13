# BE-CC-001-FU-SEED Sidecar Acceptance Packet

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `BE-CC-001-FU-SEED`
**Parent Owner:** `Codex`
**Parent Reviewer:** `Codex2`
**Sidecar Owner:** `Codex`
**Sidecar Reviewer:** `Codex2`
**Generated:** `2026-05-13` (UTC)
**Snapshot anchor (parent `last_update`):** `2026-05-13T17:42:28Z`
**Snapshot anchor (sidecar `last_update`):** `2026-05-13T17:39:47Z`
**Status:** `ACCEPTANCE SUPPORT ARTIFACT` - support-only closeout snapshot prepared after reviewer approval; does not modify canonical truth, runtime behavior, or parent lifecycle fields.

This packet translates the accepted `ai-status.json` acceptance bar for
`BE-CC-001-FU-SEED` into a reviewable checklist, pins the upstream
dependencies on `BE-CC-001`, `BE-RULE-001`, and `BE-QUOTA-001`, and preserves
the concrete repo signals that mattered when the parent task was reopened for a
cross-profile idempotency bug and then closed again.

Transient lifecycle truth (`status`, `next`, `last_update`, handoff messages,
review notes, commit/push evidence) remains authoritative only in
`ai-status.json` and `ai-activity-log.jsonl`. If those values drift after this
packet was generated, machine truth wins.

---

## 1. Scope Boundary

In scope:

- restate the parent acceptance list as a reviewer checklist
- pin the parent task to its planning anchor and upstream governance slices
- map each acceptance item to the current seed / CLI / test surfaces
- record the current reopen reason so reviewer focus stays on the actual gap

Out of scope:

- editing L1/L2 canonical truth or any parent implementation file
- changing task lifecycle state outside `scripts/ai-status.sh`
- re-reviewing upstream slices `BE-CC-001`, `BE-RULE-001`, or `BE-QUOTA-001`
- replacing the parent's own verification, commit evidence, or final handoff

---

## 2. Machine-Truth Anchors

### 2.1 Sidecar task snapshot

Machine-truth row: `ai-status.json` -> `BE-CC-001-FU-SEED-SIDECAR-ACCEPTANCE`

- owner=`Codex`
- reviewer=`Codex2`
- status=`review_approved`
- depends_on=`[BE-CC-001, BE-RULE-001, BE-QUOTA-001]`
- helper_parent=`BE-CC-001-FU-SEED`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- artifact=`support/sidecars/BE-CC-001-FU-SEED/BE-CC-001-FU-SEED-SIDECAR-ACCEPTANCE.md`
- acceptance:
  - `Create support artifacts only`
  - `Do not edit canonical truth`
  - `Hand off the packet to the assigned reviewer`

Owner-closeout implication:

- reviewer approval is already recorded in machine truth
- the remaining lifecycle step is to commit and push this support artifact, then
  finalize the sidecar with `scripts/ai-status.sh done`

### 2.2 Parent task snapshot

Machine-truth row: `ai-status.json` -> `BE-CC-001-FU-SEED`

- owner=`Codex`
- reviewer=`Codex2`
- status=`done`
- planning_ref=`docs/03-runbooks/post-tenant-governance-followup-wave-planning-20260513.md`
- depends_on=`[BE-CC-001, BE-RULE-001, BE-QUOTA-001]`
- mutates_canonical=`true`
- commit_hash=`adea5418c232f4d56a7191c8df722a4ffa0f57bb`
- commit_subject=`BE-CC-001-FU-SEED: seed tenant governance defaults`
- push_ref=`origin/feat/claude2-ui-redesign-foundation`
- artifacts:
  - `apps/api/src/seed/tenant-governance-default.ts`
  - `apps/api/tests/unit/tenant-governance-default-seed.test.ts`
- acceptance:
  - add `seedTenantGovernance(tenantId, opts)`
  - default payload = 3 cost centers + 1 monthly quota policy + 1 amount-based approval rule
  - CLI entry = `pnpm --filter @drts/api seed:tenant-governance --tenantId=<id> [--profile=smb|midmarket|enterprise]`
  - profiles = `smb`, `midmarket`, `enterprise`
  - idempotent re-run on same tenant skips existing entries
  - emit audit on each seed step
  - unit tests cover profiles + idempotency
  - `pnpm --filter @drts/api typecheck + test pass`

### 2.3 Historical reopen reason and parent outcome

Latest machine-truth reopen note from `ai-activity-log.jsonl` (`2026-05-13T17:28:27Z`):

- cost centers are skipped by code and tenant monthly quota is skipped by
  period, but approval-rule skipping is currently tied to the profile-specific
  `ruleName`
- because each profile uses a different rule name, re-running the seed on the
  same tenant with a different profile can create a second approval rule and a
  hybrid tenant state
- existing tests only cover same-profile reruns
- shared-branch `@drts/api` typecheck was also reported red due to unrelated
  `owned-mobility.service.ts` failures at review time

Reviewer implication at reopen time:

- the seed is close to complete, but reviewer focus should stay on
  cross-profile idempotency and whether verification evidence cleanly separates
  parent fixes from unrelated branch noise

Parent outcome recorded in machine truth (`ai-status.json` last_update
`2026-05-13T17:42:28Z`):

- parent status is now `done`
- closeout records commit
  `adea5418c232f4d56a7191c8df722a4ffa0f57bb`
- recorded verification:
  - `pnpm --filter @drts/api exec vitest run tests/unit/tenant-governance-default-seed.test.ts`
  - `pnpm --filter @drts/api typecheck`
  - `pnpm --filter @drts/api test`
  - `git diff --check` on the four task-owned files

---

## 3. Dependency Map

### 3.1 Hard upstream dependencies

| Dependency     | Status | Why it matters                                                                                                                                             |
| -------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BE-CC-001`    | `done` | owns canonical cost-center directory records, owner fields, validation semantics, and the `CC-OPS` / `CC-ENG` / `CC-FINANCE` vocabulary this seed consumes |
| `BE-RULE-001`  | `done` | owns approval-rule contract vocabulary, `approvalMode`, approver descriptors, and evaluator semantics consumed by the seeded default rule                  |
| `BE-QUOTA-001` | `done` | owns tenant quota policy contract, enforcement modes, and monthly-limit semantics consumed by the seeded default quota                                     |

### 3.2 Planning anchor

Primary planning source:

- `docs/03-runbooks/post-tenant-governance-followup-wave-planning-20260513.md`
  - section `E.15 - Tenant Admin onboarding flow + documentation`

That planning packet defines the seed CLI as a tenant-admin bootstrap helper:

- recommended defaults: 3 cost centers + 1 monthly quota policy + 1
  amount-based approval rule
- callable from dev fixtures and from a production CLI

### 3.3 Downstream relevance

| Consumer                          | Relationship  | Relevance                                                                                                |
| --------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------- |
| tenant admin onboarding           | direct        | seed reduces manual setup for new governance tenants                                                     |
| `DOC-TEN-GOV-001`                 | companion doc | onboarding documentation can point at the seeded defaults instead of ad hoc setup                        |
| tenant-side UI governance screens | indirect      | seeded cost centers / quotas / rules provide usable initial data for demos, pilots, and tenant bootstrap |

---

## 4. Current Repo Snapshot

The current branch contains the landed seed surfaces and the parent task is
already closed in machine truth. This section records which repo surfaces
explain how the parent met the acceptance bar and where the reopen risk was
resolved.

### 4.1 Landed surfaces already visible

- `apps/api/src/seed/tenant-governance-default.ts`
  - exports `seedTenantGovernance`
  - exports CLI parsing helpers and usage text
  - defines `smb`, `midmarket`, and `enterprise` templates
  - uses tenant-partner service primitives:
    `listCostCenters`, `listQuotaPolicies`, `listApprovalRules`,
    `upsertCostCenter`, `upsertTenantQuotaPolicy`, `upsertApprovalRule`
  - emits step-level seed audits plus a completion audit
- `apps/api/seed/tenant-governance-default.ts`
  - wires the production CLI through Nest application context
- `apps/api/package.json`
  - exposes `seed:tenant-governance`
- `apps/api/tests/unit/tenant-governance-default-seed.test.ts`
  - covers default midmarket payload
  - covers `smb`
  - covers `enterprise`
  - is the parent task's recorded unit-test surface for profile and idempotency
    coverage

### 4.2 Historical acceptance risk from the reopen

The current code shape suggests this exact risk path:

- cost centers are treated as existing by stable code (`CC-OPS`, etc.)
- quota policy is treated as existing by stable tenant-scope period
- approval rules are checked by matching the current template `ruleName`
- profile-specific names mean a tenant seeded once with `midmarket` can still
  receive a second rule when re-run as `enterprise` or `smb`

That was the primary regression path the parent re-review needed to clear. The
recorded parent closeout says this path was fixed before `BE-CC-001-FU-SEED`
was moved to `done`.

### 4.3 Closeout signal after re-review

Machine-truth and branch signals now show:

- `ai-status.json` marks `BE-CC-001-FU-SEED` as `done`
- `origin/feat/claude2-ui-redesign-foundation` resolves to commit `adea541`
- the support packet is now archival review support for an already-closed parent
  task, not a blocker for the parent lifecycle

---

## 5. Acceptance Checklist For Parent Task

Review the parent against live machine truth first, then walk the code in this
order when auditing the landed implementation.

### 5.1 Seed surface and CLI

- verify `seedTenantGovernance(tenantId, opts)` remains the primary exported
  seed function
- verify the CLI wrapper calls the same function rather than duplicating seed
  logic
- verify `apps/api/package.json` still exposes
  `pnpm --filter @drts/api seed:tenant-governance`
- verify `--profile=smb|midmarket|enterprise` is accepted and defaults to
  `midmarket`

### 5.2 Payload semantics

- verify default `midmarket` payload seeds exactly:
  - `CC-OPS`
  - `CC-ENG`
  - `CC-FINANCE`
  - one monthly tenant quota
  - one amount-based approval rule above NTD 5,000 requiring
    `cost_center_owner`
- verify `smb` is narrower than default
- verify `enterprise` adds five cost centers, tighter quota, and ordered chain
  approval semantics
- verify seeded rule conditions still target `booking.amount_minor`

### 5.3 Idempotency

- verify same-profile reruns skip existing entries
- verify cross-profile reruns on the same tenant also skip or safely reconcile
  existing entries instead of creating a second approval rule
- verify the chosen idempotency rule is explicit in code:
  stable seeded identity, stable metadata marker, or another deterministic
  lookup that is not tied only to profile-specific `ruleName`
- verify the seed does not leave a mixed tenant state where cost centers / quota
  are skipped but approval rules are duplicated

### 5.4 Audit behavior

- verify audit emits on:
  - cost-center step
  - quota-policy step
  - approval-rule step
  - completion step
- verify repeated runs still emit step audits, even when entries are skipped

### 5.5 Test and verification evidence

- verify unit tests cover all three profiles
- verify unit tests include the reopened cross-profile idempotency path
- verify parent handoff states exactly which commands were rerun
- verify any `typecheck` failure cited at review time is either fixed or clearly
  identified as unrelated shared-branch drift with fresh evidence

---

## 6. Captured Evidence From Parent Re-Review

Machine-truth closeout on `BE-CC-001-FU-SEED` records this evidence set:

- commit `adea5418c232f4d56a7191c8df722a4ffa0f57bb`
- subject `BE-CC-001-FU-SEED: seed tenant governance defaults`
- push target `origin/feat/claude2-ui-redesign-foundation`
- verification commands:
  - `pnpm --filter @drts/api exec vitest run tests/unit/tenant-governance-default-seed.test.ts`
  - `pnpm --filter @drts/api typecheck`
  - `pnpm --filter @drts/api test`
  - `git diff --check` on the four task-owned files

Auditor use:

- rely on `ai-status.json` for the authoritative pass/fail record
- use sections 4 and 5 of this packet to understand why cross-profile
  idempotency was the critical reopen focus
- if later branch drift touches the seed surfaces, compare against commit
  `adea5418c232f4d56a7191c8df722a4ffa0f57bb` instead of treating unrelated
  shared-branch worktree noise as parent-task truth

---

## 7. Risks And Review Traps

- Profile-specific rule names are convenient for readability but are not a safe
  seeded identity if acceptance requires cross-profile idempotency.
- Ordered-chain support in `enterprise` depends on the BE-RULE-001 contract
  vocabulary; review must catch any downgrade that silently changes the
  acceptance semantics.
- Owner assignment for seeded cost centers depends on current tenant users and
  role resolution. Review should ensure idempotency fixes do not accidentally
  break owner selection.
- Support-only sidecar packets can go stale quickly even after the parent is
  done. `ai-status.json` remains authoritative for current lifecycle state.

---

## 8. Sidecar Verification Note

This sidecar intentionally did not run application tests because it only
creates a support artifact and does not modify executable code.

Verification for this sidecar is limited to:

- machine-truth inspection of the sidecar and parent task rows plus the recent
  activity log
- repo inspection of the planning anchor and the parent seed / CLI / test
  surfaces referenced above
- `git diff --check` on this support artifact
- task-scoped commit and normal non-force push of this support artifact before
  owner closeout moves the sidecar to `done`
