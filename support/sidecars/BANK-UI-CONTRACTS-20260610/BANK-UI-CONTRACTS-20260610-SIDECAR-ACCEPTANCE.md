# BANK-UI-CONTRACTS-20260610 Sidecar Acceptance Packet

This document is the parallel support packet for `BANK-UI-CONTRACTS-20260610-SIDECAR-ACCEPTANCE`. It does not change canonical truth. It consolidates the repo facts the assigned reviewer (`Claude2`) needs in order to review the parent contracts slice and understand its current dependency posture.

Anchors used here come from:

- `scripts/ai-status.sh show BANK-UI-CONTRACTS-20260610`
- `scripts/dispatch-bank-console-screens-20260610.sh`
- `docs/05-ui/credit-card-airport-transfer-screen-requirements-20260610.md`
- `docs/05-ui/credit-card-airport-transfer-design-followup-request-20260610.md`
- `git show --stat 4dad0cfa8082347aefd9a75776dc1c01941a8726 -- docs/05-ui/drts-design-canvas`
- `packages/ui-tokens/src/realms.ts`
- `packages/ui-tokens/src/colors.ts`
- `apps/bank-console-web/app/contracts/page.tsx`
- `apps/bank-console-web/app/page.tsx`
- `apps/bank-console-web/components/pending-screen.tsx`
- `apps/bank-console-web/lib/navigation.ts`
- `apps/bank-console-web/lib/translations.ts`

## 1. Scope & Boundary

- **Task ID:** `BANK-UI-CONTRACTS-20260610-SIDECAR-ACCEPTANCE`
- **Parent Task:** `BANK-UI-CONTRACTS-20260610`
- **Helper Kind:** `acceptance_packet`
- **Owner:** `Codex`
- **Reviewer:** `Claude2`
- **Mutates Canonical:** `false`
- **Artifact:** `support/sidecars/BANK-UI-CONTRACTS-20260610/BANK-UI-CONTRACTS-20260610-SIDECAR-ACCEPTANCE.md`

Guardrails for this packet:

- Only support artifacts are in scope.
- Do not edit canonical truth, runtime behavior, or the parent task record.
- Treat `scripts/ai-status.sh` output as machine truth when it conflicts with older dispatch prose.

## 2. Machine-Truth Anchors

### Parent Task: `BANK-UI-CONTRACTS-20260610`

`scripts/ai-status.sh show BANK-UI-CONTRACTS-20260610` currently reports:

| Field | Value |
| --- | --- |
| Title | `BANK-UI-CONTRACTS: bank-console contracts + SLA (BK_Contracts/Detail)` |
| Phase | `bank-console-screens-202606` |
| Owner | `Codex2` |
| Reviewer | `Claude2` |
| Status | `in_progress` |
| Depends on | `CCAT-APP-SCAFFOLD-20260610`, `CCAT-API-CONTRACTS-20260610` |
| Artifacts | `apps/bank-console-web/app/contracts/page.tsx`, `apps/bank-console-web/app/contracts/[contractId]/page.tsx`, `docs/05-ui/drts-design-canvas/bank-screens-{1,2,3}.jsx`, `docs/05-ui/credit-card-airport-transfer-screen-requirements-20260610.md` |
| Acceptance | list + detail render SLA targets / attainment-vs-target / exception list; read-only; matches `BK_*` canvas; masked refs; zh-TW via central `t()`; issuer brand sourced from `@drts/ui-tokens`; `pnpm --filter @drts/bank-console-web typecheck` and `build` pass |
| Last update | `2026-06-11T11:29:39Z` |

### Sidecar Task: `BANK-UI-CONTRACTS-20260610-SIDECAR-ACCEPTANCE`

This support slice is currently assigned in machine truth as:

- owner `Codex`
- reviewer `Claude2`
- helper kind `acceptance_packet`
- `mutates_canonical=false`

## 3. Dependency Map

### Declared parent dependencies

The parent task declares two blockers:

1. `CCAT-APP-SCAFFOLD-20260610`
2. `CCAT-API-CONTRACTS-20260610`

The dispatch script also encodes the same dependency pair for `BANK-UI-CONTRACTS-20260610`.

### Current machine-truth visibility gap

At the time this packet was prepared, direct lookup of those two dependency task IDs via `scripts/ai-status.sh show ...` returned `Task not found`.

That means this packet can confirm:

- the parent task machine-truth record still names those dependencies
- the dispatch script still names those dependencies

This packet cannot independently confirm:

- whether either dependency has since been completed under the same task ID
- whether either dependency was renamed in machine truth
- whether the parent task's dependency list is stale

Reviewer implication:

- before approving the parent implementation, re-check whether `CCAT-APP-SCAFFOLD-20260610` and `CCAT-API-CONTRACTS-20260610` now resolve in machine truth, or whether their IDs changed.

### Design dependency discrepancy

There is also a branch-snapshot discrepancy around the visual contract:

- `docs/05-ui/credit-card-airport-transfer-screen-requirements-20260610.md` says the entire `bank-console-web` app requires a fresh bank-specific canvas.
- `docs/05-ui/credit-card-airport-transfer-design-followup-request-20260610.md` states the Bank Console bundle was accepted and ingested as `bank-screens-{1,2,3}.jsx`.
- Authority commit `4dad0cfa8082347aefd9a75776dc1c01941a8726` (`CCAT-CANVAS-20260610: ingest bank-console design canvas (design-team reply)`) records those files under `docs/05-ui/drts-design-canvas/`, alongside `Bank Console.html` and `bank-data.jsx`.
- The parent task artifacts and dispatch script both point at those `bank-screens-{1,2,3}.jsx` files.
- In this task worktree snapshot, `docs/05-ui/drts-design-canvas/` does not contain `bank-screens-1.jsx`, `bank-screens-2.jsx`, or `bank-screens-3.jsx`, so the ingest commit is not present on the checked-out branch tip.

Reviewer implication:

- the parent implementation should not be accepted as canvas-matched until review is done against either the checked-out `bank-screens-{1,2,3}.jsx` files or the authoritative ingest anchor at `4dad0cfa8082347aefd9a75776dc1c01941a8726`.

## 4. Current Repo Baseline

The repo already contains the bank-console scaffold and route shell, but the contracts surface is not implemented yet.

### What exists now

- `apps/bank-console-web/` exists as a dedicated app with package metadata, Dockerfile, layout, navigation, translations, and screen routes.
- `apps/bank-console-web/app/contracts/page.tsx` exists, but it only renders `PendingScreen`.
- `apps/bank-console-web/app/page.tsx` presents the overall console as pending design rather than a finished dashboard.
- `apps/bank-console-web/components/pending-screen.tsx` explicitly documents that placeholder routes are intentional until the visual canvas lands.
- `apps/bank-console-web/lib/navigation.ts` includes `/contracts` in the shell navigation, so the route is part of the scaffolded IA.
- `apps/bank-console-web/lib/translations.ts` already encodes the intended contracts purpose: service-contract posture, SLA targets, current-period attainment, and exception list.

### What is missing now

- `apps/bank-console-web/app/contracts/[contractId]/page.tsx` is not present in the current worktree.
- No bank canvas files named in the parent task artifacts are present under `docs/05-ui/drts-design-canvas/` in this task worktree, even though the accepted ingest commit records them elsewhere in repo history.
- The current `/contracts` route is a placeholder, not a canvas-matched implementation.

## 5. Visual / Token Contract Anchors

The bank screen-requirements packet is explicit about the chrome contract:

- S3 is an issuer-tenant back-office surface.
- All cardholder and card references must remain masked.
- zh-TW is primary, with centralized copy rather than inline locale branching.
- The shell chrome uses the `tenant` realm tokens, while issuer identity appears inside that chrome.

The token sources present in repo match that rule:

- `packages/ui-tokens/src/realms.ts` defines the `tenant` realm as teal with `#0F766E` foreground in light mode and `#5EEAD4` in dark mode.
- `packages/ui-tokens/src/colors.ts` defines `SURFACE_ACCENTS.tenant` on the same token family and distinguishes it from other app accents.

Reviewer implication:

- reject any parent diff that hardcodes a separate raw-hex issuer shell palette instead of consuming the tokenized tenant realm plus issuer identity treatment.

## 6. Parent Acceptance Checklist

These checks are for the parent task review, not for this sidecar artifact itself.

### A. Scope checks

- [ ] `/contracts` and `/contracts/[contractId]` both exist under `apps/bank-console-web`.
- [ ] The contracts list stays read-only for bank users.
- [ ] The detail view surfaces SLA targets, current-period attainment vs target, gap/delta, and an exception list linking to booking detail.
- [ ] The contracts slice stays on the bank card-benefit IA, not the corporate tenant-console IA.

### B. Design / token checks

- [ ] The implementation is validated against the concrete `BK_Contracts` / `BK_ContractDetail` canvas source, using either the checked-out `bank-screens-{1,2,3}.jsx` files or the authoritative ingest anchor at `4dad0cfa8082347aefd9a75776dc1c01941a8726`.
- [ ] No raw-hex issuer chrome palette is introduced; tenant realm tokens from `@drts/ui-tokens` remain the shell source of truth.
- [ ] All cardholder/card/benefit references stay masked.
- [ ] zh-TW primary copy is still routed through central `t()`.

### C. Verification checks

- [ ] `pnpm --filter @drts/bank-console-web typecheck`
- [ ] `pnpm --filter @drts/bank-console-web build`
- [ ] Reviewer confirms the dependency gate is truly satisfied, not just copied forward from the dispatch script.

## 7. Packet Completeness Check

- [x] The packet is anchored to the current machine-truth slice for `BANK-UI-CONTRACTS-20260610`.
- [x] The packet records the declared dependency pair from both machine truth and the dispatch script.
- [x] The packet records the current verification gap: dependency IDs do not resolve via direct `ai-status` lookup.
- [x] The packet records the current design-contract gap: `bank-screens-{1,2,3}.jsx` are referenced by machine truth, present in authority commit `4dad0cfa8082347aefd9a75776dc1c01941a8726`, but absent from this worktree snapshot.
- [x] The packet records the current scaffold baseline in `apps/bank-console-web`.
- [x] The only task-scoped content artifact created here is this file.

## 8. Reviewer Handoff Notes

1. Treat `scripts/ai-status.sh show BANK-UI-CONTRACTS-20260610` as the parent-task truth. It currently says reviewer `Claude2`, not `Claude` as the older dispatch script shows.
2. Re-check the two dependency task IDs before approving the parent task. This packet could not resolve either ID directly from machine truth.
3. Re-check the design-canvas location before approving any claim of canvas parity. The follow-up note and authority commit `4dad0cfa8082347aefd9a75776dc1c01941a8726` say the bank canvas bundle was ingested, but the referenced `bank-screens-{1,2,3}.jsx` files are not present in this worktree.
4. Expect the current repo baseline to be scaffold-only: placeholder contracts list exists, detail route does not, and the shell itself still advertises pending design.
5. Treat this as a sidecar-only support packet. It should not be used to expand scope into runtime implementation, API contract authorship, or canonical design decisions.
