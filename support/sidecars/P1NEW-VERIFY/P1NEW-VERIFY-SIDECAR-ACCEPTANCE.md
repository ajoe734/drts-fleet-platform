# P1NEW-VERIFY Sidecar Acceptance Packet

This document is the parallel support packet for `P1NEW-VERIFY` ("Wave verification: typecheck/build all, i18n-guard, E2E green, residual report"). It is a **sidecar support artifact only** — it does not change canonical truth, does not edit the parent backlog item, and does not modify any runtime/registry/governance implementation. It consolidates the repo facts that the assigned reviewer (`Codex2`) and parent-task owner (`Codex2`) need to drive `P1NEW-VERIFY` to a defensible acceptance decision.

All status facts below were read from machine truth (`scripts/ai-status.sh show`, exact-id grep of `ai-status.json`) and from git at `origin/dev` tip `aee8a965` on 2026-06-06. Where a claim is a reviewer check item rather than a verified fact, it is labelled as such.

Anchors used here:

- `ai-status.json` (parent `P1NEW-VERIFY`, this sidecar)
- `docs/02-architecture/phase1_final_sd_for_dev_team_20260604.md` §11 Acceptance Criteria (1–12), §12 conclusion
- `git log` / `git ls-tree -r origin/dev` (commit `63d2ba58` P1NEW-INTEGRATION, PR #534; dev tip `aee8a965`)
- `apps/api/src/modules/**`, `apps/platform-admin-web/app/**`, `apps/ops-console-web/app/dispatch/**`, `apps/driver-app/**`
- `tests/e2e/**`, `tests/unit/**`, root `package.json`, `apps/api/package.json`
- `infra/migrations/V00{21,22,25,26}__*.sql`

## §1 Scope & Boundary

- **Task ID:** `P1NEW-VERIFY-SIDECAR-ACCEPTANCE`
- **Parent Task:** `P1NEW-VERIFY`
- **Helper Kind:** `acceptance_packet`
- **Owner:** `Claude2`
- **Reviewer:** `Codex2`
- **`mutates_canonical`:** `false`
- **Objective:** Hand the reviewer/parent-owner a verified acceptance checklist, a reconciled dependency map, and the runnable verification commands for the parent wave-verification task — without touching L1/L2 truth, the parent backlog record, or any wave implementation.

Guardrails honoured by this packet:

- No edit to `ai-status.json` beyond this sidecar's own lifecycle (`start` → `handoff`).
- No change to `P1NEW-VERIFY` scope, acceptance text, or dependency list.
- Output confined to `support/sidecars/P1NEW-VERIFY/`.
- The parent acceptance gate is restated, not redefined; the SD §11 criteria are quoted, not reinterpreted.

## §2 Machine-Truth Anchors

### Parent Task: `P1NEW-VERIFY`

| Field          | Value                                                                                                                                                                          |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Title          | `Wave verification: typecheck/build all, i18n-guard, E2E green, residual report`                                                                                             |
| Phase          | `phase1-svc-fleet-tenantops-20260604`                                                                                                                                         |
| Owner          | `Codex2`                                                                                                                                                                      |
| Reviewer       | `Claude2`                                                                                                                                                                     |
| Status         | `in_progress` (as of 2026-06-06T09:33:48Z)                                                                                                                                   |
| Acceptance     | `All apps typecheck+build; i18n-guard clean; E2E-012/013/014 green; SD §11 AC 1-12 checked; residual report posted`                                                          |
| `next`         | "Rechecking prior blockers: i18n guard, E2E scripts, API runnable target, and residual report accuracy."                                                                     |
| Spec ref       | `docs/02-architecture/phase1_final_sd_for_dev_team_20260604.md` §11 (referenced verbatim in `summary_zh`)                                                                    |

> Note: `P1NEW-VERIFY`'s own reviewer is `Claude2` and its owner is `Codex2`. This sidecar (`Claude2` owner) is the **mirror lane** — Claude2 prepares the reviewer-facing packet; Codex2 still drives the parent task and the final residual report.

### Sidecar Task: `P1NEW-VERIFY-SIDECAR-ACCEPTANCE`

| Field               | Value                                                                  |
| ------------------- | ---------------------------------------------------------------------- |
| Owner               | `Claude2`                                                              |
| Reviewer            | `Codex2`                                                              |
| Status              | `in_progress`                                                          |
| `task_class`        | `sidecar`                                                              |
| `helper_kind`       | `acceptance_packet`                                                    |
| `mutates_canonical` | `false`                                                                |
| `auto_created_by`   | `supervisor-underutilization`                                         |
| Artifact            | `support/sidecars/P1NEW-VERIFY/P1NEW-VERIFY-SIDECAR-ACCEPTANCE.md`     |

## §3 Dependency Map

### §3.1 Reconciliation finding (read this first)

`P1NEW-VERIFY` declares 16 `depends_on` entries. **None of the 16 exist as standalone task records in `ai-status.json`** (exact-id grep returns 0 for every one). They are **wave-segment labels**, not live board tasks. Only a few *suffixed* descendant records exist:

| Declared dependency      | Standalone board record? | Related records that DO exist in `ai-status.json`                                                                                              |
| ------------------------ | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `P1NEW-WP0`              | ❌ none                  | —                                                                                                                                              |
| `BE-SVC-001/002/003`     | ❌ none                  | —                                                                                                                                              |
| `BE-FLEET-001/002`       | ❌ none                  | —                                                                                                                                              |
| `BE-TENBIZ-001`          | ❌ none                  | —                                                                                                                                              |
| `ADM-SVC-001/002`        | ❌ none                  | —                                                                                                                                              |
| `ADM-FLEET-001`          | ❌ none                  | —                                                                                                                                              |
| `DRV-SVC-001`            | ❌ none                  | `DRV-SVC-001-SIDECAR-REVIEW` (done)                                                                                                            |
| `OPS-SVC-001`            | ❌ none                  | —                                                                                                                                              |
| `FLEET-PORTAL-HANDOFF`   | ❌ none                  | —                                                                                                                                              |
| `E2E-SVC-013`            | ❌ none                  | `E2E-SVC-013-UNBLOCK-PLANNING-DECISION` (done)                                                                                                 |
| `E2E-FLEET-014`          | ❌ none                  | `E2E-FLEET-014-SIDECAR-ACCEPTANCE`, `-UNBLOCK-HISTORY-REPAIR`, `-UNBLOCK-PLANNING-DECISION` (all done)                                         |
| `E2E-TENBIZ-012`         | ❌ none                  | `E2E-TENBIZ-012-SIDECAR-ACCEPTANCE`, `-UNBLOCK-HISTORY-REPAIR`, `-UNBLOCK-PLANNING-DECISION`, `-UNBLOCK-PLANNING-DECISION-SIDECAR-ACCEPTANCE` (done) |

**Interpretation:** the SVC / Fleet Partner / Tenant Business Ops wave was *not* tracked as 16 separate board tasks. It was integrated under one umbrella commit:

- `63d2ba58` — `P1NEW-INTEGRATION-20260605: integrate Phase 1 Service Product / Fleet Partner / Tenant Business Ops wave (#534)` — merged to `dev`, present at dev tip `aee8a965`.

So "are the dependencies done?" must be answered against **shipped code on `origin/dev`** (§3.2 + §4), not against per-task board status, because the per-task board records do not exist. The reviewer should not block `P1NEW-VERIFY` waiting for `BE-SVC-001` etc. to flip to `done` — there is no such record to flip.

> Reviewer action: if the orchestration policy requires the declared dependency IDs to resolve, this is a **machine-truth gap to escalate to the parent owner / supervisor** (either backfill the records, or accept the integration commit as the dependency evidence). It is out of scope for this sidecar to mutate the parent's dependency list.

### §3.2 Shipped surface on `origin/dev` (dependency evidence)

The wave's implementation is present on `dev` at these paths (verified via `git ls-tree -r origin/dev`):

| Wave segment                     | Evidence on `dev`                                                                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Service product (`BE-SVC`)       | `apps/api/src/modules/service-product/{controller,service,repository,types,module}.ts`                                                                              |
| Vehicle eligibility (`BE-SVC`)   | `apps/api/src/modules/vehicle-eligibility/{controller,service,repository,module}.ts`; migration `V0025__vehicle_eligibility_matrix.sql`                             |
| Fleet partner (`BE-FLEET`)       | `apps/api/src/modules/fleet-partner/{controller,service,repository,module}.ts`; migration `V0026__fleet_partner_revenue_share_runtime_snapshots.sql`               |
| Tenant business ops (`BE-TENBIZ`)| `apps/api/src/modules/tenant-partner/**` (approval workflow, quota ledger, eligibility adapters), `apps/api/src/modules/platform-admin/tenants*.ts`; `V0021`/`V0022`|
| Admin surfaces (`ADM-*`)         | `apps/platform-admin-web/app/{service-products,vehicle-eligibility,fleet-partners,fleet,partners}/**`                                                               |
| Ops dispatch (`OPS-SVC`)         | `apps/ops-console-web/app/dispatch/**`                                                                                                                              |
| Driver multi-platform (`DRV-SVC`)| `apps/driver-app/components/platform-*.tsx`, `apps/driver-app/app/platform-presence.tsx`                                                                            |

## §4 Acceptance Checklist — SD §11 AC 1–12

Source: `docs/02-architecture/phase1_final_sd_for_dev_team_20260604.md` §11 (quoted). Each row maps the criterion to the shipped surface on `dev` and gives the reviewer a concrete check. **Status column is the sidecar's read of code presence, not a substitute for the owner running the gates** — "code present" ≠ "behaviour verified".

| #   | SD §11 criterion (verbatim)                                              | Mapped surface on `dev`                                                                 | Sidecar read         |
| --- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | -------------------- |
| 1   | Tenant can see payable total and completed trips.                        | `tenant-partner` + `platform-admin/tenants*`; `tests/unit/tenant-partner-foundation.test.ts` | code present; verify via E2E-012 |
| 2   | Tenant can see which users created which orders.                         | `tenant-partner` attribution path; `tests/unit/multi-tenant-header-routing.test.ts`     | code present; verify via E2E-012 |
| 3   | Tenant can export payable / invoice / cost center / service product report. | `platform-admin` reporting + `tests/unit/billing-settlement.service.test.ts`           | code present; verify export path |
| 4   | Booking service product determines vehicle eligibility.                  | `service-product/**` + `vehicle-eligibility/**`; `tests/unit/{service-product,vehicle-eligibility}.test.ts` | code present + unit tests |
| 5   | Dispatch rejects ineligible vehicles with explicit reason.              | `vehicle-eligibility.service.ts`                                                         | code present; verify reason string |
| 6   | Driver app shows service product and source platform.                    | `apps/driver-app/components/platform-*.tsx`, `platform-presence.tsx`                     | **reviewer check** — "source platform" surfaced; confirm "service product" label is present too |
| 7   | Fleet partner can be linked to drivers.                                  | `fleet-partner.service.ts`/`repository.ts`; `tests/unit/fleet-partner.repository.test.ts` | code present + unit test |
| 8   | Fleet partner revenue share is calculated.                              | `fleet-partner.service.ts`; `V0026__fleet_partner_revenue_share_runtime_snapshots.sql`; `tests/unit/fleet-partner.service.test.ts` | code present + unit test |
| 9   | Fleet partner statement is generated.                                    | `fleet-partner` module                                                                   | **reviewer check** — confirm statement endpoint/output |
| 10  | Platform admin can manage service products, eligibility matrix, fleet partners. | `apps/platform-admin-web/app/{service-products,vehicle-eligibility,fleet-partners}/page.tsx` | code present (3 surfaces) |
| 11  | Ops can filter dispatch by service product and eligibility.              | `apps/ops-console-web/app/dispatch/**`                                                    | **reviewer check** — confirm filter is by service product + eligibility, not generic |
| 12  | E2E-012 / E2E-013 / E2E-014 pass at least in staging.                    | `tests/e2e/E2E-012-*.sh` ✅, `tests/e2e/E2E-013-*.sh` ✅, **E2E-014 harness MISSING** ❌ | **partial — see §6** |

### Parent acceptance line (4 gates)

| Gate                       | Runnable on `dev`?                                       | Notes                                                                 |
| -------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------- |
| All apps typecheck + build | ✅ `pnpm typecheck`, `pnpm build` (turbo)                 | api/admin/ops all have `typecheck`+`build`; run per §5                 |
| i18n-guard clean (en/zh)   | ❌ **tooling not on `dev`**                               | no `scripts/i18n-guard.mjs`, no `i18n` script in root `package.json`  |
| E2E-012/013/014 green      | ⚠️ shell harness, 012/013 only; 014 missing               | see §6                                                                 |
| SD §11 AC 1–12 + residual  | ✅ this checklist + §6 feed it                            | owner posts final residual report                                     |

## §5 Reviewer Verification Commands

Run from repo root at the reviewed commit (parent-task worktree HEAD, not canonical root — see history-repair discipline). These are the parent's own gates; the sidecar restates them so the reviewer runs the same thing the owner claims.

```bash
# 1. Typecheck + build all (api + both admin/ops front-ends)
pnpm typecheck            # pnpm typecheck:root && turbo run typecheck
pnpm build                # turbo run build

# 2. Unit coverage for the wave (must be green, not "no tests")
pnpm --filter @drts/api test     # vitest; covers service-product, vehicle-eligibility, fleet-partner, tenant-partner

# 3. E2E shell harness (NOTE: these are .sh harnesses, NOT `playwright test`)
bash tests/e2e/E2E-012-tenant-business-operations.sh
bash tests/e2e/E2E-013-service-product-eligibility.sh
# E2E-014: NO harness file exists on dev — see §6

# 4. i18n-guard: NOT runnable on dev (no scripts/i18n-guard.mjs, no `i18n` npm script) — see §6
```

> Vacuous-pass guard: `vitest run --passWithNoTests` is the api `test` script — a "0 tests" result is **not** a green gate for AC4/7/8. Confirm the named unit specs actually executed. Likewise treat a "skipped"/"no tests" E2E result as a failure, not a pass.

## §6 Residual / Known Gaps (verified against `origin/dev` tip `aee8a965`)

1. **E2E-014 harness missing.** `tests/e2e/` contains `E2E-001..E2E-010`, `E2E-012`, `E2E-013` — there is **no `E2E-014-*.sh`**. SD §11 AC#12 explicitly requires E2E-014. The `E2E-FLEET-014-*` board records (SIDECAR-ACCEPTANCE / UNBLOCK-*) are all `done`, but no runnable 014 harness landed on `dev`. **The parent cannot claim AC#12 fully green** until either the 014 harness exists or the owner records an explicit waiver. This is the strongest blocker candidate.
2. **i18n-guard tooling not on `dev`.** No `scripts/i18n-guard.mjs` and no `i18n` script in root `package.json` at dev tip. The tool exists only inside unmerged i18n-* worktrees. The parent's "i18n-guard clean (en/zh)" gate is **not runnable from `dev` as-is** — the owner must merge/locate the guard tooling first, or scope the gate to the i18n verification lane. Matches the parent's own `next` note.
3. **E2E is a shell harness, not Playwright.** `E2E-012/013` are `tests/e2e/*.sh` driven by `tests/e2e/run-e2e.sh`, not `playwright test`. "E2E green" must be interpreted as the shell harness result. Do not substitute `pnpm test:e2e` (Playwright) and call AC#12 satisfied.
4. **Declared dependency IDs are not board records (§3.1).** 13 of 16 `depends_on` entries have zero standalone records; the wave shipped under integration commit `63d2ba58` / PR #534. If policy needs the IDs resolved, escalate to parent owner/supervisor — do not silently treat absence as "incomplete" or as "done".
5. **AC#6, #9, #11 are reviewer checks, not sidecar-verified.** Code surfaces exist, but the sidecar did not confirm: driver "service product" label (vs only source platform); fleet-partner statement output; ops dispatch filter keyed on service-product + eligibility specifically. These need eyes-on confirmation before the owner ticks them.

## §7 Handoff Notes

- This packet is **support material**; the authoritative residual report is the parent owner's (`Codex2`) deliverable on `P1NEW-VERIFY` itself.
- Recommended reviewer disposition: treat §6 items 1–2 as the gating residuals (E2E-014 harness + i18n-guard tooling), §6 item 5 as confirm-before-tick, §6 item 4 as an escalation to the supervisor on dependency-record hygiene.
- No canonical truth, runtime, contract, or parent backlog record was modified by this sidecar. Only this file under `support/sidecars/P1NEW-VERIFY/` was added.
