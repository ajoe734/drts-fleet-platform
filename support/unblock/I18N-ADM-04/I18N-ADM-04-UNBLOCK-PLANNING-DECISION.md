# I18N-ADM-04 Planning Decision Unblock

## Scope

- Task: `I18N-ADM-04-UNBLOCK-PLANNING-DECISION`
- Parent: `I18N-ADM-04`
- Owner: `Codex`
- Reviewer: `Codex2`
- Decision date: `2026-06-04`

## Diagnosis

`I18N-ADM-04` was routed into a planning-decision helper, but the parent is not
actually blocked by a missing product or contract choice.

The relevant product/contract truth already exists:

1. `docs/01-product/platform-admin-ops-tenant-console-product-spec-20260508.md`
   §3.6 requires Traditional Chinese readiness for user-facing admin surfaces.
2. The same spec §7.4.6 defines `/switchboard` as the canonical Platform Admin
   surface for public-info versioning and placard generation / publication,
   including the required data fields and actions.
3. The same spec §7.5.4 already fixes the publication workflow:
   create draft -> validate copy/effective range -> publish version -> choose
   a valid source version -> generate placard -> publish placard -> keep audit
   history.
4. `docs/02-architecture/platform-admin-control-plane-state-machines-20260524.md`
   keeps Platform Admin write flows backend-owned and contract-shaped; this
   route must not invent new local semantics.
5. `apps/platform-admin-web/app/switchboard/page.tsx` already implements the
   parent slice under that existing contract: a `/switchboard` page for public
   info and placards, with bilingual copy work limited to localizing the
   already-defined UI content.

The helper was therefore triggered by a misclassified blocker. The unresolved
issue is not product semantics. The remaining blocker recorded on the parent is
execution closeout: repo-wide `@drts/contracts` / `@drts/ui-tokens` module
resolution failures and unrelated existing type errors preventing the parent's
requested `typecheck` / `build` verification in this worktree.

## Decision

No new product decision is required. No new contract decision is required. No
scope cut is required.

The canonical resolution is:

1. Treat the bilingual remediation for `/switchboard` as an implementation task
   under the existing Platform Admin product spec.
2. Keep the page aligned to the existing `/switchboard` contract:
   public-info versions, placard versions, publication workflow, and audit
   history remain the product boundary.
3. Treat i18n work here as copy-localization only; it does not reopen the
   public-info / placard workflow, action model, or state semantics.
4. Do not open `PHASE1_OPEN_QUESTIONS.md` for this task, because no
   higher-precedence product ambiguity remains.

## Scope Cut And Routing

- `I18N-ADM-04` stays in scope as switchboard copy centralization / bilingual
  remediation.
- This helper does not change the page's product responsibilities, action
  contract, or workflow.
- This helper does not waive the parent acceptance gate. If `typecheck` /
  `build` cannot pass because of unrelated workspace failures, that remains an
  execution blocker and should be handled as execution follow-up, not as a new
  planning question.
- No further planning-decision helper is needed for `I18N-ADM-04` unless a
  higher-precedence Platform Admin spec changes `/switchboard` semantics.

## Parent Unblocked Next Step

`I18N-ADM-04.next` should route to:

Resume the parent as an execution-closeout task, not a planning task. Use the
existing pushed implementation commit (`97d62e89`,
`I18N-ADM-04: annotate switchboard public info form state`) and the canonical
Platform Admin `/switchboard` contract as the baseline. Keep any remaining work
focused on acceptance evidence and on routing the unrelated workspace
`typecheck` / `build` failures to the correct execution blocker path instead of
reopening product/contract semantics.

This means the parent is no longer blocked on missing product/contract truth.
Its remaining blocker is verification on the shared build surface.

## Verification Basis

- `docs/01-product/platform-admin-ops-tenant-console-product-spec-20260508.md`
  §3.6, §7.4.6, §7.5.4
- `docs/02-architecture/platform-admin-control-plane-state-machines-20260524.md`
- `apps/platform-admin-web/app/switchboard/page.tsx`
- `apps/platform-admin-web/lib/translations.ts`

## Canonical Change Requirement

No canonical planning document change was required for this unblock. Existing
accepted product and architecture artifacts already resolve the route's
semantics; this helper records the routing correction and the parent's concrete
next step.
