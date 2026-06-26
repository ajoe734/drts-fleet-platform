# P2-DP-S3-001 Review Packet & Evidence Summary

**Sidecar Task:** `P2-DP-S3-001-SIDECAR-REVIEW`  
**Parent Task:** `P2-DP-S3-001`  
**Helper Kind:** `review_packet`  
**Current Owner:** `Codex`  
**Assigned Reviewer:** `Codex2`  
**Parent Owner / Reviewer:** `Codex2` / `Claude2`  
**Last Revised:** `2026-06-26 (UTC)`  
**Status:** `READY FOR REVIEW`

---

## 1. Purpose

This sidecar is support-only.

- In scope: package the relevant parent review snapshot, the sidecar handoff timeline, the clean review branch evidence, the contaminated closeout-branch warning, and reviewer handoff commands.
- Out of scope: changing contracts/runtime behavior, editing canonical truth, or reopening the parent implementation scope.

Reviewer intent:

- this packet preserves the clean-review-branch boundary that the parent review cycle established
- the repair branch remains the evidence surface reviewers should inspect
- this packet makes that boundary easy to verify without re-deriving the branch history

---

## 2. Shared-Truth Snapshot And Timing

Read this section as a time-bounded status note, not as an evergreen "current status" panel.

- Sidecar task `P2-DP-S3-001-SIDECAR-REVIEW`
  - `2026-06-26T18:34:27Z`: Orchestrator recorded the initial handoff of this packet as advanced to `review`
  - `2026-06-26T18:34:39Z`: reviewer `Codex2` reopened the sidecar because section 2 still described the pre-handoff drafting state
  - `2026-06-26T18:35:12Z`: owner `Codex` moved the task back to `in_progress` only to refresh this wording before re-handoff
- Parent review context carried by this packet
  - review the clean repair branch `origin/codex2/p2-dp-s3-001-repair@8fb33bd6f`, not the contaminated branch `origin/codex2/p2-dp-s3-001@d6cf6a8e8`

Parent semantic summary carried into this packet:

- add `SandboxFallbackCostPolicyRecord` plus resolver support
- precedence is `regulatory/safety > experiment > partner > tenant > platform default`
- platform-caused fallbacks stay on platform
- partner / tenant absorption only applies when the matching contract exists
- no matching policy resolves to `default_platform_no_contract` and emits audit `sandbox.billing.fallback_cost_policy.defaulted`
- passenger surcharge is never allowed

Parent review notes already recorded in the prior review cycle say the clean repair path meets the intended behavior and that targeted verification passed.

---

## 3. Branch And History Boundary

This is the most important reviewer context.

### 3.1 Real task commits

`git cherry -v origin/dev origin/codex2/p2-dp-s3-001` shows only two task-owned commits ahead of `origin/dev`:

- `46c9729b1fd332dc4e47b9d366a174bac7cbceee`
  - `feat(P2-DP-S3-001): add sandbox fallback cost policy resolver`
- `599c988daf7815b0005355ba62e578c21a4d2afa`
  - `P2-DP-S3-001: fix fallback-cost audit integration assertion`

### 3.2 Why the original branch is contaminated

The original closeout branch head is merge commit:

- `d6cf6a8e87f37b87e82222544ef09358a944bfdb`
  - subject: `P2-DP-S3-001: merge origin/dev for closeout`
  - parents:
    - `599c988daf7815b0005355ba62e578c21a4d2afa`
    - `6cff9a6eaefab057a2c1f18d7c2d2bf45fbb01fe`

`git diff --name-only 599c988daf7815b0005355ba62e578c21a4d2afa d6cf6a8e87f37b87e82222544ef09358a944bfdb`
shows 9 unrelated files mixed in from `origin/dev`, including:

- `apps/driver-app/app/safety-operator.tsx`
- `apps/driver-app/lib/safety-operator-fixtures.ts`
- `apps/driver-app/tests/unit/safety-operator-offline-queue.test.ts`
- `packages/api-client/src/index.ts`

Reviewer implication:

- do not review `d6cf6a8e8` as if it were the task evidence branch
- use the repair branch below

### 3.3 Clean repair branch

The clean review branch is:

- `origin/codex2/p2-dp-s3-001-repair`
- based on `origin/dev @ 1892c1c388a339e2dde19b6721f3d7ceebd1d4d7`
- rebuilt task commits:
  - `ce5f5f7481a9c69cacba809178fd3ddc69629171`
    - `feat(P2-DP-S3-001): add sandbox fallback cost policy resolver`
  - `8fb33bd6fef9daa47124943e8bce9fe9365cbb45`
    - `P2-DP-S3-001: fix fallback-cost audit integration assertion`

`git diff --stat origin/dev...origin/codex2/p2-dp-s3-001-repair` reduces the review surface to 6 task-owned files with 711 insertions and 1 deletion.

`git merge-tree $(git merge-base origin/dev 599c988daf7815b0005355ba62e578c21a4d2afa) origin/dev 599c988daf7815b0005355ba62e578c21a4d2afa`
returns `merged`, which confirms the meaningful task commits replay cleanly onto current `origin/dev`.

---

## 4. Evidence Surface

| ID  | Evidence | Anchor |
| --- | --- | --- |
| E-1 | Live sidecar machine-truth slice after reopen | `AI_NAME=Codex scripts/ai-status.sh show P2-DP-S3-001-SIDECAR-REVIEW` |
| E-2 | Sidecar review -> reopen -> refresh timeline | `grep -n 'P2-DP-S3-001-SIDECAR-REVIEW' -A 2 -B 2 /home/edna/workspace/drts-fleet-platform/ai-activity-log.jsonl \| tail -n 20` |
| E-3 | Only two real task commits exist ahead of `origin/dev` | `git cherry -v origin/dev origin/codex2/p2-dp-s3-001` |
| E-4 | Original branch contamination is caused by merge commit `d6cf6a8e8` | `git show --no-patch --format='%H%n%P%n%s' d6cf6a8e87f37b87e82222544ef09358a944bfdb` |
| E-5 | Nine unrelated files entered through the contaminated closeout merge | `git diff --name-only 599c988daf7815b0005355ba62e578c21a4d2afa d6cf6a8e87f37b87e82222544ef09358a944bfdb` |
| E-6 | Clean repair branch contains only the intended resolver slice | `git diff --stat origin/dev...origin/codex2/p2-dp-s3-001-repair` |
| E-7 | Contract surface for scopes, reasons, resolutions, and passenger guard | `origin/codex2/p2-dp-s3-001-repair:packages/contracts/src/phase2-tesla-fsd-sandbox.ts` lines `1888-1964` |
| E-8 | Resolver precedence/defaulting/passenger normalization | `origin/codex2/p2-dp-s3-001-repair:apps/api/src/modules/billing-settlement/sandbox-fallback-cost-policy-resolver.service.ts` lines `62-188` |
| E-9 | Billing-settlement wiring and audit emission | `origin/codex2/p2-dp-s3-001-repair:apps/api/src/modules/billing-settlement/billing-settlement.service.ts` lines `418-425`, `1015-1046`; module lines `9-24` |
| E-10 | Unit coverage for precedence, contract gating, and no-passenger policy | `origin/codex2/p2-dp-s3-001-repair:tests/unit/sandbox-fallback-cost-policy-resolver.test.ts` lines `14-249` |
| E-11 | Repair commit narrows the integration assertion without changing behavior | `origin/codex2/p2-dp-s3-001-repair:tests/integ/sandbox-fallback-cost-policy.integration.test.ts` lines `45-58`; commit `8fb33bd6f` |
| E-12 | Executable verification trail | parent `review_notes_zh` in machine truth plus `Verification:` trailer on commit `8fb33bd6f` |

### 4.1 Contract Anchor

The repair branch contract file adds:

- policy scopes: `experiment`, `partner_program`, `tenant_contract`
- absorbers: `platform`, `partner_program`, `tenant_contract`, `passenger`
- reasons:
  - `regulatory_requirement`
  - `safety_intervention`
  - `platform_operational_issue`
  - `experiment_learning`
  - `partner_operational_issue`
  - `tenant_operational_issue`
- resolution enums including:
  - `regulatory_override`
  - `safety_override`
  - `platform_cause_platform_default`
  - `experiment_policy`
  - `partner_policy`
  - `tenant_policy`
  - `default_platform_no_contract`
- `passengerSurchargeAllowed: false`
- resolution record field:
  - `auditEventCode: "sandbox.billing.fallback_cost_policy.defaulted" | null`

This aligns with the parent acceptance text and the parent review note.

### 4.2 Resolver Anchor

`sandbox-fallback-cost-policy-resolver.service.ts` shows the behavioral core:

- lines `65-78`
  - regulatory / safety / platform-cause reasons short-circuit to platform
- lines `80-120`
  - lookup order is experiment, then partner, then tenant
- lines `122-131`
  - no match resolves to `platform` with `default_platform_no_contract` plus the default audit event
- lines `179-188`
  - `normalizeAbsorber(...)` forbids passenger charging in practice even if a policy attempts it
- lines `202-213`
  - partner and tenant scopes require a matching contract id before they apply

### 4.3 Billing Service And Repair Commit Anchor

`billing-settlement.service.ts` shows:

- constructor injection for `SandboxFallbackCostPolicyResolverService` at lines `418-425`
- `resolveSandboxFallbackCostPolicy(...)` at lines `1015-1046`
- defaulted outcomes emit audit via:
  - `moduleName: "billing-settlement"`
  - `actionName: "sandbox.billing.fallback_cost_policy.defaulted"`
  - `resourceType: "sandbox_fallback_cost_policy"`
  - `newValuesSummary` carrying `reason`, `fallbackCostAbsorber`, and `policyResolution`

The repair commit `8fb33bd6f` only adjusts the integration test expectation to use `expect.objectContaining(...)` at lines `45-58`, so the assertion matches the audit payload shape without changing runtime semantics.

### 4.4 Executable Evidence

This sidecar did not rerun code because it is a support-only slice, but the parent trail already carries executable evidence:

- parent `review_notes_zh` records:
  - `contracts tsc` green
  - `contracts build` green
  - `api tsc` green after using the clean branch
  - targeted `vitest` run passed with 2 files / 7 tests
- commit `8fb33bd6f` carries a `Verification:` trailer for:
  - `vitest` over `tests/integ/sandbox-fallback-cost-policy.integration.test.ts`
  - `vitest` over `tests/unit/sandbox-fallback-cost-policy-resolver.test.ts`

---

## 5. Reviewer Focus

Reviewer `Codex2` should confirm:

1. This packet remains support-only and does not mutate canonical truth.
2. The packet now distinguishes the initial sidecar handoff state (`review` at `2026-06-26T18:34:27Z`) from this refresh cycle's temporary reopen / `in_progress` state (`2026-06-26T18:35:12Z`), so section 2 no longer misstates machine truth.
3. The packet clearly separates the clean review branch `origin/codex2/p2-dp-s3-001-repair@8fb33bd6f` from the contaminated closeout merge `d6cf6a8e8`.
4. The listed anchors cover the parent acceptance semantics:
   - precedence order
   - platform default for platform-caused or uncontracted fallbacks
   - partner / tenant contract gating
   - no passenger surcharge
   - audit emission for defaulted policy resolution
5. The repair commit is correctly characterized as an assertion-shape fix, not a behavior change.

Suggested approval wording:

> `審查通過：P2-DP-S3-001 sidecar review packet 已對齊最新 machine truth，現在明確區分了初次 handoff 的 review snapshot 與這次 refresh 的暫時 reopen/in_progress 狀態，並正確指向 clean repair branch origin/codex2/p2-dp-s3-001-repair@8fb33bd6f、隔離 contaminated closeout merge d6cf6a8e8。packet 保留了 resolver precedence、contract gating、default_platform_no_contract + audit、passenger 永不轉嫁，以及 repair commit 僅修正 integration assertion 形狀的關鍵證據。support artifact only，可回到 owner 後續 closeout。`

Suggested reopen wording:

> `packet needs refresh: [machine-truth mismatch / wrong branch boundary / stale evidence anchor / support-scope violation]`

---

## 6. Handoff And Review Commands

Owner handoff to reviewer:

```bash
AI_NAME=Codex scripts/ai-status.sh handoff P2-DP-S3-001-SIDECAR-REVIEW Codex2 \
  "Review packet ready at support/sidecars/P2-DP-S3-001/P2-DP-S3-001-SIDECAR-REVIEW.md. It now distinguishes the initial sidecar review snapshot from this wording-refresh reopen state, and summarizes the clean repair branch evidence (origin/codex2/p2-dp-s3-001-repair@8fb33bd6f), the contaminated closeout merge boundary (d6cf6a8e8), and the contract/resolver/test anchors without changing canonical truth."
```

Reviewer approval:

```bash
AI_NAME=Codex2 scripts/ai-status.sh approve P2-DP-S3-001-SIDECAR-REVIEW \
  "Review approved. The packet matches current machine truth, points review to the clean repair branch, cleanly isolates the contaminated closeout merge, and preserves the parent fallback-cost resolver evidence without changing canonical truth."
```

Reviewer reopen:

```bash
AI_NAME=Codex2 scripts/ai-status.sh reopen P2-DP-S3-001-SIDECAR-REVIEW \
  "packet needs refresh: [machine-truth mismatch / wrong branch boundary / stale evidence anchor / support-scope violation]"
```

---

## 7. Change Log

- `2026-06-26` - Initial sidecar review packet created for `P2-DP-S3-001`.
- `2026-06-26` - Packet aligned to current parent `review` state and the clean repair branch `origin/codex2/p2-dp-s3-001-repair@8fb33bd6f`.
- `2026-06-26` - Packet records the contaminated closeout merge `d6cf6a8e8` as out of scope for reviewer evidence.
- `2026-06-26` - Section 2 refreshed to distinguish the `2026-06-26T18:34:27Z` review handoff from the `2026-06-26T18:35:12Z` wording-refresh reopen state before re-handoff.
