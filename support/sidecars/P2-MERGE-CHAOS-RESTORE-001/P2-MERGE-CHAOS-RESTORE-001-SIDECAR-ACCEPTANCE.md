# P2-MERGE-CHAOS-RESTORE-001 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `P2-MERGE-CHAOS-RESTORE-001` - restore three silently reverted Phase 2 deliverables  
**Current Sidecar Owner:** `Codex`  
**Assigned Reviewer:** `Codex2`  
**Parent Owner / Reviewer:** `Codex2` / `Codex`  
**Machine-Truth Snapshot Used For Draft:** sidecar `in_progress` (`last_update=2026-06-27T13:36:39Z`); parent `in_progress` (`last_update=2026-06-27T13:34:06Z`)  
**Review Approval Snapshot:** sidecar `review_approved` (`last_update=2026-06-27T13:42:42Z`; reviewer note: packet maps the three restore anchors, current missing or regressed surfaces, and compose-with-current-`dev` checkpoints)  
**Last Revised:** `2026-06-27T13:44:10Z (UTC)`  
**Scope Guardrail:** support artifact only; no canonical truth or runtime implementation changes are made by this sidecar

---

## 1) Sidecar Acceptance Mapping

| Brief Acceptance | Packet Coverage |
| --- | --- |
| Create support artifacts only | This file is the only artifact produced by the sidecar task. |
| Do not edit canonical truth | The packet records machine-truth state, repo baseline, restore anchors, and reviewer guidance only. |
| Hand off the packet to the assigned reviewer | Section 8 includes the owner handoff command and review framing for `Codex2`. |

---

## 2) Parent Task Framing

From machine truth, the parent task exists to restore three Phase 2 deliverables that were silently reverted from `dev` after stale-branch integration:

1. `V0042__passenger_disclosure_policy_catalog_acknowledgements.sql`
2. regulator-cases backend + platform-admin compliance panel surfaces
3. tenant AV fallback list/detail surfaces

Parent machine-truth acceptance is:

> `V0042 migration + S2 regulator-cases files + UI-TEN av-fallback files all present on dev again; build/typecheck/relevant tests green; merged to dev; no further silent reverts`

This packet does not change that acceptance. It expands the parent requirement into:

- restore-slice baseline evidence
- dependency and compatibility checkpoints
- reviewer hotspots
- suggested verification surfaces

---

## 3) Current Repo Baseline

### 3.1 Restore slice inventory

| Slice | Restore Anchor | Signature Surface From Parent Brief | Current Baseline | Why Reviewer Should Care |
| --- | --- | --- | --- | --- |
| Disclosure persistence | `b2c2e355d` (`P2-DP-S1-001: integrate disclosure policy closeout to dev (#926)`) | `infra/migrations/V0042__passenger_disclosure_policy_catalog_acknowledgements.sql` | The migration file is missing. Current trunk still contains passenger-disclosure runtime and contract references plus repository SQL against `av_sandbox.passenger_disclosure_*` and `av_sandbox.passenger_acknowledgement_records`. | Runtime already expects persisted disclosure policy and acknowledgement storage; missing schema means the persistence layer is incomplete even if gate logic still exists. |
| Regulator cases | `811afbaae2` (`P2-DP-S2-001: add regulator cases panel and API (#975)`) | `apps/api/src/modules/regulatory-reporting/platform-admin-regulator-cases.{controller,service}.ts`, `apps/platform-admin-web/components/sandbox-compliance-console.tsx`, `apps/platform-admin-web/lib/sandbox-compliance.ts` | Controller, service, and console component are missing. `/platform-admin/compliance` currently renders `SandboxDesignPendingScreen`. `apps/platform-admin-web/lib/sandbox-compliance.ts` still exists, but current trunk has no `loadSandboxRegulatorCases`, `loadSandboxRegulatorCaseDetail`, `regulatorBundleTone`, or `regulatorNotificationTone` exports. | The route shell still exists, but the actual regulator-cases read model and dashboard surface are gone. File presence alone is not enough; the parent must re-enable the platform-admin compliance flow on current trunk. |
| Tenant AV fallback | `80ae5caa2` (`[codex] P2-UI-TEN-001 tenant AV fallback surfaces (#927)`) | `apps/tenant-console-web/lib/tenant-av-fallback.tsx`, `apps/tenant-console-web/app/bookings/[bookingId]/av-fallback/page.tsx` | Both signature files are missing. Current `apps/tenant-console-web/app/bookings/page.tsx` has no `av-fallback` reference, and current `apps/tenant-console-web/lib/translations.ts` has no `avFallback.*` keys. | Restoring only the leaf detail surface will not recover the feature if the bookings list and translation wiring remain absent. |

### 3.2 Evidence notes by slice

#### Disclosure persistence

- `git show b2c2e355 --stat` shows the missing migration was created together with disclosure gate/runtime updates.
- Current tracked code still references:
  - `apps/api/src/modules/sandbox-dispatch-gate/sandbox-dispatch-gate.repository.ts`
  - `apps/api/src/modules/sandbox-dispatch-gate/sandbox-dispatch-gate.service.ts`
  - `packages/contracts/src/phase2-tesla-fsd-sandbox.ts`
- That means the restore is not speculative. The schema-backed storage layer is already assumed elsewhere in trunk.

#### Regulator cases

- `git show 811afbaae --stat` shows the original slice touched backend, compliance UI, translations, API client, and contracts.
- Current `/platform-admin/compliance` route is a pending screen:
  - `apps/platform-admin-web/app/platform-admin/compliance/page.tsx`
- Current trunk has no tracked `SandboxRegulatorCase*` contracts or API client methods, and current `sandbox-compliance.ts` omits the regulator-case loader/helper exports introduced by `811afbaae2`.
- Reviewer should therefore treat the parent restore as a compose-with-trunk exercise, not just a blind file checkout.

#### Tenant AV fallback

- `git show 80ae5caa --stat` shows the original slice added:
  - `apps/tenant-console-web/lib/tenant-av-fallback.tsx`
  - `apps/tenant-console-web/app/bookings/[bookingId]/av-fallback/page.tsx`
  - `apps/tenant-console-web/app/bookings/page.tsx`
  - `apps/tenant-console-web/lib/translations.ts`
- Current trunk is missing the two signature files and also lacks:
  - any `av-fallback` reference in `apps/tenant-console-web/app/bookings/page.tsx`
  - any `avFallback.*` translation keys in `apps/tenant-console-web/lib/translations.ts`
- Parent closeout should not claim the fallback feature is restored unless route entry points and i18n wiring are back as well.

---

## 4) Dependency Map

### 4.1 Formal upstream dependencies

- None for this sidecar task.
- Parent machine truth also lists no formal `depends_on`.

### 4.2 Restore anchors

| ID | Anchor | Role In Parent Restore |
| --- | --- | --- |
| R-1 | `b2c2e355dea9941465253107a3b835fb1ce0386e` | Source commit for the missing V0042 migration and related disclosure-policy persistence slice |
| R-2 | `811afbaae2fa6ba8dce8ae957727455b65057e4e` | Source commit for regulator-cases backend plus platform-admin compliance UI |
| R-3 | `80ae5caa28df33eaf78a41345637546f79c3e7b6` | Source commit for tenant AV fallback list/detail surfaces |

### 4.3 Practical compatibility surfaces

These are not new dependencies in machine truth. They are reviewer checkpoints for safe restoration on a moved `dev` trunk.

| Slice | Compatibility Surface | Why It Matters |
| --- | --- | --- |
| Disclosure persistence | `apps/api/src/modules/sandbox-dispatch-gate/*`, `packages/contracts/src/index.ts`, `packages/contracts/src/phase2-tesla-fsd-sandbox.ts`, related integration/unit tests | The missing migration must match the already-landed runtime and contract shapes that reference disclosure policy and acknowledgement records. |
| Regulator cases | `apps/api/src/modules/regulatory-reporting/regulatory-reporting.module.ts`, `packages/api-client/src/index.ts`, `packages/contracts/src/phase2-tesla-fsd-sandbox.ts`, `apps/platform-admin-web/app/platform-admin/compliance/page.tsx`, `apps/platform-admin-web/lib/sandbox-compliance.ts`, `apps/platform-admin-web/lib/translations.ts` | The original regulator-cases slice crossed backend, read-model helpers, client methods, contracts, route export, and UI copy. Current trunk has lost multiple pieces of that chain. |
| Tenant AV fallback | `apps/tenant-console-web/app/bookings/page.tsx`, `apps/tenant-console-web/lib/translations.ts` | Current trunk lost the route/list/i18n wiring that made the detail page discoverable and understandable. |

### 4.4 Downstream consumer

- Parent owner `Codex2` absorbs or ignores this packet.
- Parent reviewer `Codex` should use this packet to check that restore claims are stronger than "the file exists again."

---

## 5) Parent Acceptance Checklist

The parent owns the real restore. This checklist is a reviewer-facing expansion of the existing parent acceptance.

### AC-1: Signature files are restored at the expected paths

- [ ] `infra/migrations/V0042__passenger_disclosure_policy_catalog_acknowledgements.sql`
- [ ] `apps/api/src/modules/regulatory-reporting/platform-admin-regulator-cases.controller.ts`
- [ ] `apps/api/src/modules/regulatory-reporting/platform-admin-regulator-cases.service.ts`
- [ ] `apps/platform-admin-web/components/sandbox-compliance-console.tsx`
- [ ] `apps/platform-admin-web/lib/sandbox-compliance.ts` includes the regulator-case helpers expected by the restored console
- [ ] `apps/tenant-console-web/lib/tenant-av-fallback.tsx`
- [ ] `apps/tenant-console-web/app/bookings/[bookingId]/av-fallback/page.tsx`

### AC-2: The restore composes with current trunk instead of reintroducing stale assumptions

- [ ] Disclosure persistence matches current disclosure-policy runtime expectations and does not leave repo code pointing at tables that still do not exist.
- [ ] `/platform-admin/compliance` no longer resolves to `SandboxDesignPendingScreen` once the restore lands.
- [ ] Regulator-cases restore reintroduces the missing helper/client/contract chain required by the dashboard, not just isolated backend files.
- [ ] Tenant AV fallback restore reintroduces list-entry wiring and translation keys, not just the hidden detail leaf.

### AC-3: Focused verification is recorded on the parent task

Suggested verification surfaces based on the original landing commits:

| Slice | Suggested Verification |
| --- | --- |
| Disclosure persistence | `pnpm --filter @drts/api test` or an equivalently focused API verification set that proves disclosure-policy persistence composes with current trunk |
| Regulator cases | `pnpm --filter @drts/api typecheck`; `pnpm --filter @drts/api build`; `pnpm --filter @drts/platform-admin-web typecheck`; `pnpm --filter @drts/platform-admin-web build`; `pnpm exec vitest run apps/api/tests/integration/e2e-p2-sandbox-compliance-controls.test.ts` |
| Tenant AV fallback | `pnpm --filter @drts/tenant-console-web typecheck`; `pnpm --filter @drts/tenant-console-web build` |

- [ ] Parent records the actual commands it ran and any trunk-reconciliation edits needed beyond raw checkout.

### AC-4: Parent integration closeout is explicit

- [ ] Parent closeout records the restore commit(s) and merge path to `dev`.
- [ ] Parent closeout states whether the restored change is merged to `dev`, not merely present on a task branch.
- [ ] Parent evidence addresses the original failure mode: silent revert by stale-branch integration.

---

## 6) Reviewer Hotspots (`Codex2`)

1. `V0042` is not optional cleanup. Current runtime already references disclosure-policy and acknowledgement persistence tables, so schema absence is a real restore gap.
2. For regulator cases, "controller/service restored" is insufficient if current trunk still lacks the UI helper exports, route export, client methods, and contract surfaces needed by the dashboard.
3. The current `/platform-admin/compliance` page is a pending screen. Parent should not claim this slice restored until that route serves the real compliance dashboard again.
4. For tenant AV fallback, the missing leaf files are only part of the regression. The bookings index wiring and `avFallback.*` translations also disappeared from current trunk.
5. `git checkout <adding-commit> -- <files>` is a restore tactic, not the acceptance target. Reviewer should look for compose-with-trunk corrections around evolved files such as `packages/contracts/src/phase2-tesla-fsd-sandbox.ts` and adjacent client/UI surfaces.

---

## 7) Evidence Anchors

- Machine truth:
  - `AI_NAME=Codex scripts/ai-status.sh show P2-MERGE-CHAOS-RESTORE-001`
  - `AI_NAME=Codex scripts/ai-status.sh show P2-MERGE-CHAOS-RESTORE-001-SIDECAR-ACCEPTANCE`
- Restore source commits:
  - `git show --stat --summary b2c2e355`
  - `git show --stat --summary 811afbaae`
  - `git show --stat --summary 80ae5caa`
- Missing/present signature scan:
  - direct path existence check for the seven restore paths above
- Current compliance-route regression:
  - `apps/platform-admin-web/app/platform-admin/compliance/page.tsx`
- Current regulator-helper regression:
  - absence of `loadSandboxRegulatorCases`, `loadSandboxRegulatorCaseDetail`, `regulatorBundleTone`, `regulatorNotificationTone` in `apps/platform-admin-web/lib/sandbox-compliance.ts`
- Current tenant fallback regression:
  - absence of `av-fallback` references in `apps/tenant-console-web/app/bookings/page.tsx`
  - absence of `avFallback.*` keys in `apps/tenant-console-web/lib/translations.ts`
- Existing backend anchor for compliance workflow:
  - `apps/api/tests/integration/e2e-p2-sandbox-compliance-controls.test.ts`

---

## 8) Handoff Command

Owner (`Codex`) hands the packet to reviewer (`Codex2`):

```bash
AI_NAME=Codex scripts/ai-status.sh handoff P2-MERGE-CHAOS-RESTORE-001-SIDECAR-ACCEPTANCE Codex2 "Acceptance packet ready at support/sidecars/P2-MERGE-CHAOS-RESTORE-001/P2-MERGE-CHAOS-RESTORE-001-SIDECAR-ACCEPTANCE.md. It captures the missing V0042 migration, regulator-cases restore chain, and tenant AV fallback restore chain; records the current pending-screen and missing-i18n regressions on trunk; and frames reviewer checks around compose-with-current-dev rather than blind stale-file restoration."
```

Reviewer approval:

```bash
AI_NAME=Codex2 scripts/ai-status.sh approve P2-MERGE-CHAOS-RESTORE-001-SIDECAR-ACCEPTANCE "Acceptance packet is ready: it maps the three restore anchors, shows the current missing or regressed surfaces on trunk, keeps parent acceptance focused on restore-plus-verification on dev, and stays within support-only sidecar scope."
```

Reviewer reopen:

```bash
AI_NAME=Codex2 scripts/ai-status.sh reopen P2-MERGE-CHAOS-RESTORE-001-SIDECAR-ACCEPTANCE "Packet needs revision: [specify machine-truth mismatch / restore-slice gap / reviewer hotspot / support-scope concern]"
```

---

## 9) Owner Closeout Notes

- Reviewer approval remains recorded in machine truth as `review_approved` for `P2-MERGE-CHAOS-RESTORE-001-SIDECAR-ACCEPTANCE`.
- Focused closeout re-check on the current branch still matches the packet baseline:
  - all six restore signature paths listed in Section 3.1 remain absent on current trunk
  - `apps/platform-admin-web/app/platform-admin/compliance/page.tsx` still renders `SandboxDesignPendingScreen`
  - `apps/platform-admin-web/lib/sandbox-compliance.ts` still lacks `loadSandboxRegulatorCases`, `loadSandboxRegulatorCaseDetail`, `regulatorBundleTone`, and `regulatorNotificationTone`
  - `apps/tenant-console-web/app/bookings/page.tsx` still lacks any `av-fallback` reference
  - `apps/tenant-console-web/lib/translations.ts` still lacks `avFallback.*` keys
- Closeout keeps scope limited to this support packet; no canonical truth, runtime, or restore implementation files are changed here.
- Integration status for this sidecar is `not_applicable`: the artifact is support-only and has no deploy target, even though branch commit and push evidence are still required for `done`.

---

## 10) Change Log

- `2026-06-27T13:39:32Z` - Initial packet created from machine-truth state, restore-source commit inspection, direct path presence checks, and targeted trunk scans for the regulator-cases and tenant AV fallback regressions.
- `2026-06-27T13:44:10Z` - Refreshed the packet for owner closeout after review approval, re-ran the focused baseline checks, and recorded support-only integration handling for task finalization.
