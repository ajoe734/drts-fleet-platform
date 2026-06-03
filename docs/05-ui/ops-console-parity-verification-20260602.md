# Ops Console Parity Verification

- Date: 2026-06-03
- Verifier: Claude (reassigned owner; harness from prior `codex/ops-parity-verify` lane)
- Task: `OPS-PARITY-VERIFY`
- Branch: `claude/ops-parity-verify` (base `dev`)
- Local app: `apps/ops-console-web`
- Local smoke URL: `http://localhost:3003`

## 1. Scope

Verification target from the parity audit brief
(`docs/05-ui/ops-console-body-parity-audit-20260602.md` §6 P2-B / §9):

- 20 route Playwright smoke
- single Ops Console shell per route
- required title and body markers per route
- anti-mixing grep must be zero
- anti-legacy CSS markers must be absent
- screenshot set at `1440x950`
- remote dev smoke must run again after deploy

## 2. Owner reassignment + provenance

This task was reassigned Codex → Claude (Codex lane terminated 2/2 on it). All 16
dependency tasks (`OPS-PARITY-PRIM/TITLES/CMPID/CONID/CC/DEMIX-*/FORMS-*/CTA-*/REV`)
are archived/done and merged to `dev`.

The smoke harness, the missing detail routes, and the de-mix were authored on the
prior `codex/ops-parity-verify` lane. That work was **current-based** (merge-base
`12f918d2`; `dev` only 1 unrelated platform-admin commit ahead, zero ops-console
file overlap), so it was adopted onto `claude/ops-parity-verify` by clean cherry-pick
rather than re-implemented.

## 3. De-mix approach (ops-local shim)

The audit P0-A acceptance is a literal grep over `apps/ops-console-web`. The shared
Canvas primitives (`CanvasStepper` / `CanvasTimeline` / `CanvasEmptyState`) that P0-A
asked to be added to `@drts/ui-web` were **never delivered to the package** — on `dev`,
`@drts/ui-web` still only ships `Stepper`/`Timeline` (management-primitives) and
`WorkflowEmptyState` (workflow-primitives), and the merged route bodies still imported
them. The de-mix therefore uses an **ops-local** shim, `apps/ops-console-web/lib/canvas-workflow.tsx`
(built only from `CanvasBanner/Btn/Icon/Pill`), exposing `CanvasSequenceRail`,
`CanvasActivityFeed`, and `CanvasEmptyPanel` as the Canvas-family replacements, and the
ops route bodies were migrated off the banned primitives.

> Reviewer note / follow-up: the audit prefers these primitives be **shared** in
> `@drts/ui-web` (coordinated with platform-admin/tenant-console), not ops-local. The
> ops-local shim satisfies the hard grep acceptance now; promoting it into the shared
> package remains a sensible follow-up and should be tracked as its own item.

## 4. Type-clean remediation (this owner's delta)

The adopted de-mix passed local runtime smoke on the codex lane but regressed
`tsc --noEmit` from the clean `dev` baseline (0 errors) to **18 errors**. This owner
fixed all 18 so the de-mix is type-clean (commit `OPS-PARITY-VERIFY: type-clean the
ops-console de-mix`):

- `complaints/[caseNo]/page.tsx` — fallback aligned to `ComplaintCaseRecord`
  (valid `category`, all required fields) and `ComplaintExportViewRecord`
  (`{complaintCase, timeline, exportGeneratedAt, readyForAudit}`; codex had invented
  `summary`/`attachments`).
- `contracts/[contractId]/page.tsx` — `VehicleContractRecord` uses
  `startAt`/`endAt` + `partnerType`/`contractType`/`lifecycleStatus`/`approvedBy`/`approvedAt`
  (codex used `effectiveFrom`/`effectiveTo` and omitted required fields).
- `dispatch/dispatch-workflow.tsx` — `ManagementTone` is `"warning"`, not `"warn"`
  (the `AuthorityBadge`/`WorkflowPanel`/`DetailMetadataGrid` tones and
  `getOwnedAuthorityTone`). `CanvasTone` `"warn"` usages were left intact.
- `lib/translations.ts` — completed the codex key renames in the `zh` dict
  (`timelineEvents→activityEvents`, `incidents/complaints .timeline→.activity`,
  `complaints.timelineExport→.activityExport`) so `zh` mirrors `keyof typeof en`, and
  fixed two dangling `t()` references (dispatch-workflow + incidents detail) that still
  pointed at the renamed-away keys.

Result: `pnpm --filter @drts/ops-console-web exec tsc --noEmit` = **0 errors**
(after building `@drts/ui-tokens` + `@drts/contracts` dist; the only remaining tsc noise
without those builds is the known baseline `@drts/ui-tokens` TS2307 resolution gap inside
`@drts/ui-web`, not ops-console-web code).

## 5. Local verification run

```bash
pnpm --filter @drts/ops-console-web dev        # next dev on :3003
pnpm exec playwright test tests/e2e/ops-console-parity.spec.ts
```

Observed on 2026-06-03 (branch `claude/ops-parity-verify`):

- `1 passed (1.2m)` — `20 routes render inside one ops shell`
- all 20 route screenshots emitted under `test-results/ops-console-parity/` (1440×950)
- pre-test HTTP probes: `/dashboard /dispatch /complaints/CMP-0908 /contracts/CTR-310
  /feature-flags` → all `200`

Covered routes:

1. `/dashboard`  2. `/dispatch`  3. `/dispatch/OPS-SMOKE-DISPATCH`  4. `/callcenter`
5. `/complaints`  6. `/complaints/CMP-0908`  7. `/incidents`  8. `/incidents/OPS-SMOKE-INCIDENT`
9. `/approval-requests`  10. `/reports`  11. `/revenue`  12. `/attendance`  13. `/maintenance`
14. `/drivers`  15. `/drivers/DRV-001`  16. `/vehicles`  17. `/vehicles/VEH-001`
18. `/contracts`  19. `/contracts/CTR-310`  20. `/feature-flags`

## 6. Assertion coverage

`tests/e2e/ops-console-parity.spec.ts` asserts per route:

- route is not a `404`; body shows no `404` / `Application error`
- the shared Ops Console shell is present (single shell, no nested shell)
- route title text matches the expected route-specific marker
- route-specific required body markers are present
- a `1440×950` screenshot is written for each route

## 7. Anti-mixing / styling checks (exact audit pattern)

On `claude/ops-parity-verify`, run against `apps/ops-console-web`:

- `grep -rn "\bStepper\b\|\bTimeline\b\|WorkflowEmptyState\|ManagementTone\|TimelineItem" apps/ops-console-web`
  → **0 matches**
- anti-legacy CSS (`.admin-*` / `.ops-*` class names) → **0 matches**

(For reference, the same grep on `origin/dev` is **non-zero** — the merged route bodies
still import `Timeline`/`WorkflowEmptyState`/`ManagementTone` from `@drts/ui-web`. The
de-mix on this branch is what brings the grep to zero.)

## 8. Screenshot evidence

`test-results/ops-console-parity/` contains 20 PNGs (one per route above; gitignored,
regenerated by re-running the spec). Filenames `ops-<route>.png`.

## 9. Status against acceptance

| Acceptance item | Status |
| --- | --- |
| All 20 routes pass smoke | ✅ `1 passed (1.2m)` |
| anti-mixing grep = 0 | ✅ exact audit pattern, 0 matches |
| anti-legacy CSS = 0 | ✅ 0 matches |
| screenshot set produced (1440×950) | ✅ 20 PNGs |
| `tsc --noEmit` clean (not in acceptance, but a hard owner gate) | ✅ 0 errors |
| remote dev smoke clean **after deploy** | ⛔ deferred to integration |

## 10. Remaining gap — remote dev smoke

The "remote dev smoke clean after deploy" item is an **integration-layer** step: it can
only run against a deployed `dev` environment after PR → CI → merge → `Deploy - Dev`.
A task worker on a feature branch has no deploy environment, so this owner cannot
execute it pre-merge. It is **not** a branch-level defect; it is the post-merge
verification that the integration owner must re-run once this branch is deployed.

Recommended closeout for this branch: `INTEGRATION_STATUS=branch_pushed`. The remote-dev
re-run of `tests/e2e/ops-console-parity.spec.ts` (pointing `OPS_CONSOLE_BASE_URL` at the
deployed dev host) is carried into integration, not claimed as done here.

Local dev logs during the smoke also showed `control-plane-proxy/*` fetch failures to
`127.0.0.1:3001`; route bodies still render because the page implementations tolerate
missing local API data with smoke-safe fallback states. Acceptable for local parity
verification; the remote re-run exercises the real adapters.
