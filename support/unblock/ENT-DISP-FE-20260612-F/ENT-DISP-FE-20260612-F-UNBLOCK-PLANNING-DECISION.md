# ENT-DISP-FE-20260612-F Unblock Planning Decision

## Scope

- Task: `ENT-DISP-FE-20260612-F-UNBLOCK-PLANNING-DECISION`
- Parent: `ENT-DISP-FE-20260612-F`
- Owner: `Codex`
- Reviewer: `Claude2`
- Decision date: `2026-06-12`

## Diagnosis

`ENT-DISP-FE-20260612-F` was described as blocked on a missing product or
contract decision, but the current evidence shows a different problem:

1. The shared `dev` baseline only contains the minimal
   `apps/enterprise-dispatch-web` shell created by `ENT-DISP-FE-20260612-A`.
2. That shell explicitly says it must stop before production workflows until a
   dedicated Enterprise Dispatch design canvas exists.
3. Task `ENT-DISP-FE-20260612-B` already names the dedicated Enterprise
   Dispatch shell and primitive artifacts as its canonical inputs, but those
   files are not present on the current `dev` baseline used by this worktree.
4. A parallel umbrella branch, `claude2/ent-disp-fe-20260612`, already carries
   the Enterprise Dispatch canvas set:
   `Enterprise Dispatch.html`, `ent-kit.jsx`, `ent-shell.jsx`,
   `ent-screens-1.jsx`, `ent-screens-2.jsx`, `ent-states.jsx`,
   `ent-data.jsx`.

The blocker is therefore not unresolved backend product semantics. It is
missing shared-branch publication of the already-authored Enterprise Dispatch
design authority.

## Canonical Sources Consulted

1. `support/sidecars/ENT-DISP-FE-20260612/development-work-package.md`
2. `apps/enterprise-dispatch-web/README.md`
3. `apps/enterprise-dispatch-web/app/page.tsx`
4. `docs/02-architecture/phase1_final_sa_for_dev_team_20260604.md` §7.2
5. git branch evidence from `claude2/ent-disp-fe-20260612` for
   `docs/05-ui/drts-design-canvas/Enterprise Dispatch.html` and the `ent-*`
   canvas files

## Decision

`ENT-DISP-FE-20260612-F` is unblocked by **routing the planning decision to the
already-authored Enterprise Dispatch canvas set and freezing downstream work to
that baseline**.

Concretely:

1. The Enterprise Dispatch frontend must not continue from the temporary
   ops-realm scaffold as if that scaffold were the final product direction.
2. The canonical UI baseline for tasks `ENT-DISP-FE-20260612-B` through
   `ENT-DISP-FE-20260612-F` is the dedicated Enterprise Dispatch canvas family
   already authored on `claude2/ent-disp-fe-20260612`:
   - `docs/05-ui/drts-design-canvas/Enterprise Dispatch.html`
   - `docs/05-ui/drts-design-canvas/ent-kit.jsx`
   - `docs/05-ui/drts-design-canvas/ent-shell.jsx`
   - `docs/05-ui/drts-design-canvas/ent-screens-1.jsx`
   - `docs/05-ui/drts-design-canvas/ent-screens-2.jsx`
   - `docs/05-ui/drts-design-canvas/ent-states.jsx`
   - `docs/05-ui/drts-design-canvas/ent-data.jsx`
3. Task `ENT-DISP-FE-20260612-B` becomes the mandatory bridge task that must
   land this canvas/shell/primitives baseline into shared branch history before
   the page implementation tasks (`C`, `D`, `E`) or the API/tests task (`F`)
   claim further parity or rollout progress.
4. No new API contract decision is required by this unblock. The parent
   remains blocked on UI baseline delivery and the resulting route/data-adapter
   surfaces, not on new backend schema or product-rule definition.

## Scope Cut

This unblock does not:

1. Merge or re-author the Enterprise Dispatch canvas files itself.
2. Re-open product semantics for approvals, quota, booking review, dispatch
   queue, or reassignment behavior.
3. Expand `ENT-DISP-FE-20260612-F` into ownership of the shell/primitives task.

Those are execution follow-ups, not new planning asks.

## Parent Unblocked Next Step

`ENT-DISP-FE-20260612-F` should now be treated as:

1. Planning blocker resolved.
2. Still execution-blocked until `ENT-DISP-FE-20260612-B` lands the dedicated
   Enterprise Dispatch canvas/shell/primitives baseline into the shared branch
   history and exposes the route/data-adapter surfaces needed by `F`.
3. Once `B` is complete and the Enterprise Dispatch routes are implemented by
   `C`/`D`/`E`, resume `F` to finish API gap wiring, tests, and rollout
   evidence against that canonical UI baseline.

## Verification Basis

- `support/sidecars/ENT-DISP-FE-20260612/development-work-package.md` records
  that the current task stopped at a minimal shell because no Enterprise
  Dispatch canvas artifact was present.
- `apps/enterprise-dispatch-web/README.md` and
  `apps/enterprise-dispatch-web/app/page.tsx` both enforce the same stop-line:
  do not invent workflow boards or operator panels without the dedicated
  canvas.
- `docs/02-architecture/phase1_final_sa_for_dev_team_20260604.md` lists
  Enterprise Dispatch as a first-class P0 product surface, so borrowing another
  app's IA is not an acceptable steady-state interpretation.
- `claude2/ent-disp-fe-20260612` already contains the dedicated `ent-*`
  design-canvas files, which proves the missing item is publication/routing of
  design authority into shared branch history rather than absence of a product
  decision.
