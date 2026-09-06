# SR-ADMIN-ADAPTER-001 Unblock — Planning Decision

- Date: 2026-09-06
- Owner: `Claude`
- Reviewer: `Claude2`
- Parent task: `SR-ADMIN-ADAPTER-001`
- Unblock task: `SR-ADMIN-ADAPTER-001-UNBLOCK-PLANNING-DECISION`
- Kind: `planning_decision`

## Decision

`SR-ADMIN-ADAPTER-001` is blocked on a real scope gap, not a genuine unresolved
product-semantic question. Grant the owner (`Codex`) a narrow, two-file write-scope
expansion so the adapter registry can be made truthful end-to-end, without routing
through `SR-CONTRACT-001` and without a new task/dependency:

1. **Scope expansion (no new dependency):**
   - `infra/migrations/V0090__platform_adapter_registry.sql` (new file) — a
     dedicated migration adding `admin.phase1_adapter_registry`, following the
     exact pattern already used for `admin.phase1_platform_tenants` /
     `admin.phase1_public_info_versions` / `admin.phase1_placard_versions` in
     `infra/migrations/V0033__missing_phase1_persistence_tables.sql` and
     `apps/api/src/modules/platform-admin/platform-admin.repository.ts`
     (JSON-record row per entity, loaded/persisted through
     `PlatformAdminRepository`).
   - `packages/contracts/src/platform-adapter-registry.ts` (existing file) —
     extend `PlatformAdapter` / `UpdatePlatformAdapterCommand` with the fields
     Codex's evidence names as missing: `credentialExpiresAt`,
     `credentialReference`, plus a mutation `reason` and an `auditReceipt` on
     the update command.
   - No other shared file needs to move. Confirmed by direct read, not by
     assumption:
     - `packages/contracts/src/index.ts:7416` already does
       `export * from "./platform-adapter-registry"` — no new export line
       needed.
     - `packages/api-client/src/index.ts` already has a complete
       `// ── Platform Adapters ──` section (`listPlatformAdapters`,
       `getPlatformAdapter`, `updatePlatformAdapter`) calling
       `/api/platform-admin/adapters` — the client the task needs already
       exists and needs no edit.
     - `apps/api/src/modules/platform-admin/platform-admin.module.ts` does not
       need a new provider/controller registration — the missing adapter
       routes/methods belong inside `PlatformAdminController` /
       `PlatformAdminService` / `PlatformAdminRepository`, all three of which
       are already in `SR-ADMIN-ADAPTER-001`'s existing write scope.
   - `serial_resources: ["platform-admin-service"]` already reserves this
     service's files exclusively to this task among concurrent workers, so
     the two added files carry no cross-task collision risk beyond the
     normal single-task diff.

2. **Rule #4 in `docs/03-runbooks/system-remediation-execution-tasks-20260906.md`
   ("`packages/contracts` exports、client、OpenAPI只由SR-CONTRACT整合") does not
   apply here.** Reading the reuse table in the same doc, `SR-CONTRACT-001`'s
   remit is the **new** Phase-1-adjacent features added in this wave (leave,
   academy, host — it depends on `SR-DESIGN-001`, `UV-EXEC-001`,
   `UV-EXEC-002`, `UV-EXEC-019`, none of which relate to adapters). The
   adapter registry is not a new feature: `packages/contracts/src/
   platform-adapter-registry.ts` already exists and is already exported, and
   `phase1_service_contracts_v1.md` §3.7 (Forwarder Service) and §8.4
   (External Forwarder Platforms) already establish "per-platform adapter
   config" and adapter health as canonical Phase 1 scope. Extending an
   existing, already-owned, dedicated contract file is an in-scope edit for
   its owning task, not a cross-feature contract integration. Routing this
   through `SR-CONTRACT-001` would additionally import that task's unrelated
   P2 dependency chain (`SR-DESIGN-001`, `UV-EXEC-001/002/019`) onto a P1 root
   task for no product reason. `SR-ADMIN-ADAPTER-001` stays a root task
   (`depends_on: []`).

3. **Screen-requirements note — scope cut, explicit follow-up, no new open
   question.** Codex already read `packages/ui-tokens/src/{colors,realms}.ts`,
   `docs/05-ui/drts-design-canvas/Platform Admin.html` (adapters artboard),
   and `platform-screens-2.jsx:368-410`, and correctly stopped: the canvas
   has registry list, alerts, and split-authority action buttons, but no
   registration form, no config-edit form, and no credential
   edit/rotate form. Per dispatch rule ("If the canvas lacks a screen, write
   a screen-requirements note and STOP"), this is confirmed correct, and the
   fix is **not** a new product decision:
   - The write-authority split for those exact actions (create adapter
     config / edit credentials / enable-disable = platform-admin only;
     pause/resume = ops with TTL; view secret material = never after
     creation) is **already decided** at `docs/05-ui/
     system-design-answers-all-apps-20260524.md` Q-ADM17. There is nothing
     to add to `PHASE1_OPEN_QUESTIONS.md` — the "Open Items" table is empty
     for a reason (per that file's own header note, a question is only
     added there if the code or an accepted packet does not already answer
     it; Q-ADM17 already does).
   - What is missing is artwork, not a decision: the registration/config/
     credential forms themselves. This is a **scope cut** on
     `SR-ADMIN-ADAPTER-001` — it does not build those three forms — and an
     **explicit follow-up**: the design lane must add those screens to the
     canvas (`docs/05-ui/drts-design-canvas/Platform Admin.html` +
     `platform-screens-2.jsx`) using the already-decided Q-ADM17
     write-authority split and the realm tokens, before any task builds
     them. Until that canvas update lands, `SR-ADMIN-ADAPTER-001`'s
     deliverable is: real persisted registry, real list/detail read, real
     four-state expiry (unknown/valid/expiring/expired), and the existing
     canvas's enable/disable + pause/resume actions — not the three missing
     forms.

4. **Credential governance authorization is not a new decision either.**
   Codex flagged that the generic `/platform-admin/*` policy (`platform`/
   `system` realm, GET `foundation:read`, PATCH `foundation:write`) is
   untested against "new credential governance" acceptance. Per Q-ADM17,
   "edit credentials" authority is `platform-admin only` — the existing
   `foundation:write` gate on PATCH already enforces platform-admin-only
   write access at the realm level, which is consistent with, not
   contradictory to, the decided split. No step-up/MFA requirement is named
   anywhere in Q-ADM17, `phase1_service_contracts_v1.md`, or
   `phase1_prd_detailed_v1.md` for this specific action. Accept the existing
   `foundation:write` gate as sufficient for Phase 1; do not invent a new
   step-up requirement. If a reviewer disagrees, that is a normal review
   comment on the implementation PR, not a planning blocker.

## What this does not decide

- This does not mark `SR-ADMIN-ADAPTER-001` `done` or resume its status.
  Only `Supervisor` can transition a `blocked` task, and this unblock task's
  owner (`Claude`) is not the parent task's owner. This packet records the
  routing decision and updates the parent's `next` pointer; the supervisor
  or `Codex` (owner) still has to pick the task back up.
- This does not build the migration, contract fields, or backend routes.
  That is `SR-ADMIN-ADAPTER-001` implementation work for `Codex`, against
  the base already anchored on `codex/sr-admin-adapter-001`
  (`813c794f8e96b7f7a364a23372fe20a81a6f170e`).
- This does not resolve the unrelated `pnpm --filter @drts/api typecheck`
  exit 2 Codex hit after rebase (`@drts/control-plane-auth` resolving to
  another worker's unbuilt package under a shared `node_modules` symlink).
  That is a local dependency-isolation problem for the owner to fix when
  resuming, not a scope or contract question.

## Parent task next step

`SR-ADMIN-ADAPTER-001` should resume (owner `Codex`, reviewer `Codex2`) with:

1. Rebase `codex/sr-admin-adapter-001` onto current `origin/dev`.
2. Add exactly two files to the working scope (approved above, no
   `SR-CONTRACT-001` dependency needed): a new migration
   `infra/migrations/V0090__platform_adapter_registry.sql` creating
   `admin.phase1_adapter_registry` (same JSON-record-row shape as
   `admin.phase1_platform_tenants`), and extend
   `packages/contracts/src/platform-adapter-registry.ts` with
   `credentialExpiresAt`, `credentialReference`, a mutation `reason`, and an
   `auditReceipt` on `UpdatePlatformAdapterCommand`. No edit is needed to
   `packages/contracts/src/index.ts` (already exports this file) or
   `packages/api-client/src/index.ts` (already has the matching client
   methods).
3. Wire real load/persist for the new table into the existing
   `PlatformAdminRepository`/`PlatformAdminService`/`PlatformAdminController`
   (already in scope), replacing the 404s Codex reproduced against
   `grab_taiwan` with real CRUD and real four-state expiry computed from
   `credentialExpiresAt` (unknown/valid/expiring/expired), per parent
   acceptance.
4. Keep the registration/config-edit/credential-edit forms **out of scope**
   for this task (scope cut, §3 above) — ship list/detail read plus the
   existing canvas's enable/disable and pause/resume actions only, wired to
   real data. Flag the missing forms to the design lane as a follow-up
   against `docs/05-ui/drts-design-canvas/Platform Admin.html` /
   `platform-screens-2.jsx` (Q-ADM17 already supplies the authority split
   those forms must implement); do not invent the layout.
5. Fix or isolate the `@drts/control-plane-auth` dependency resolution
   locally before relying on `pnpm --filter @drts/api typecheck` again; do
   not touch another worker's package.
6. Re-run the parent's test commands, update
   `docs/04-uat/system-remediation-20260906/SR-ADMIN-ADAPTER-001.md` with
   real DB-backed evidence (resource IDs, HTTP results, migration applied),
   commit + push, then `handoff` — owner does not `done` directly.

## Non-claim

This unblock note does not claim `SR-ADMIN-ADAPTER-001` is unblocked in
machine truth, that the persisted registry exists, or that the missing
screens are designed. It records the scope decision, the scope cut on the
three missing forms, and the concrete resumption path so the parent does not
stay parked behind a mis-scoped `SR-CONTRACT-001` dependency that was never
actually required.
