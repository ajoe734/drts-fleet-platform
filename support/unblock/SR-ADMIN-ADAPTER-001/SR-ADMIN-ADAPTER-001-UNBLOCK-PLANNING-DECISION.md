# SR-ADMIN-ADAPTER-001 planning routing recovery

Date: 2026-09-08. Owner: Codex. Reviewer: Codex2.
Task: SR-ADMIN-ADAPTER-001-UNBLOCK-PLANNING-DECISION.
Inspected integration base: `d4f54ef94e059a981bf2be1f7b944e815870e117`.

## Decision and authority

This helper routes the remaining scope/design decision; it does not grant shared-file writes or reduce parent acceptance. The parent is currently `todo`, owned by Codex2, reviewed by Codex. Its original authorized-role/form-readback and four expiry-state acceptance remain required.

Product authority is already established by [service contracts](../../../phase1_service_contracts_v1.md) §3.7 and §8.4 (adapter state and per-platform configuration) and [Q-ADM17](../../../docs/05-ui/system-design-answers-all-apps-20260524.md#q-adm17-adapter-registry-write-authority-split): platform-admin configures and edits credentials; ops operates, with TTL for pause/resume; secret material is never viewable after creation. No new competing product-authority question is opened.

[Planning PR #1671](https://github.com/ajoe734/drts-fleet-platform/pull/1671), inspected head `5ad2caa612ab122e7367f21354e23ad3d650922a`, is OPEN, not merged. Its proposed two-file expansion and three-form acceptance cut are not current authorization. This report supersedes that proposal's routing for this reassigned helper; it does not close or merge the historical PR.

## Rechecked gaps

- The parent machine slice and [parent runbook](../../../docs/03-runbooks/system-remediation-20260906/SR-ADMIN-ADAPTER-001.md) allow the registry UI directory, controller, service, task tests and UAT evidence. They do **not** include `apps/api/src/modules/platform-admin/platform-admin.repository.ts`.
- That repository's `PlatformAdminState`, `loadState` and `persistChanges` currently cover tenants, public-info versions and placards, not adapter records. The old claim that persistence needs only two additional files is incomplete.
- `packages/contracts/src/platform-adapter-registry.ts` has `credentialStatus` but no credential expiry timestamp. The update command lacks the proposed expiry/reference/reason fields. The exact concurrency/audit and expiry policy contract must be reviewed before implementation; a client-supplied audit receipt must not be assumed authoritative.
- `packages/api-client/src/index.ts` already exposes list/get/update through `/api/platform-admin/adapters`. The current platform-admin controller/service contain no adapter implementation. Existing client methods are not proof of working routes or durable authority.
- No tracked V0090 or adapter-named migration was found at this base. An absent number is not a reservation; supervisor must allocate a migration filename and check concurrent migration writers before authorizing it.
- [Execution rules](../../../docs/03-runbooks/system-remediation-execution-tasks-20260906.md), shared-file rules 3–4 and 7–8, require supervisor scope/dependency reconciliation. `serial_resources` is explicitly not an implemented file lock. This helper does not exempt the contract change from SR-CONTRACT coordination.

## Explicit follow-up retained by the parent

Supervisor owns the following routing action on the existing parent task; these are not unregistered independent implementation tasks:

1. Reconcile reviewed scope for registry persistence (repository plus allocated migration) and the dedicated adapter contract. Either explicitly extend parent scope with required cross-writer dependencies, or register a narrowly scoped producer and make parent depend on it. Check the platform-admin/placard writer chain and contract/migration writers; do not assume `depends_on: []` remains safe.
2. Record the reviewed field contract: nullable authoritative expiry timestamp/reference, warning-window source and boundary rules, mutation reason/concurrency, server-generated audit evidence, and missing/invalid expiry handling. Preserve the four required states; missing data is unknown, not valid or live. Existing service-contract governance requirements (§2, account/credential mutation rules) remain applicable.
3. Resolve the historical report's missing registration/config/credential-form artwork against the current design canvas. Q-ADM17 answers authority, not screen design. Record a screen-requirements/design follow-up if still missing. Any acceptance cut requires explicit reviewed planning and machine-truth changes with a registered follow-up; this helper grants no cut.
4. Write approved scope/dependencies (and any registered design producer) through the current canonical task-board commands before dispatching those shared-file edits. A merge of this routing report alone is not that authorization.

## Concrete next step for Codex2

Follow the [history-recovery packet](SR-ADMIN-ADAPTER-001-UNBLOCK-HISTORY-REPAIR.md): use the supervisor-assigned parent worktree, preserve historical refs, inspect/apply only the still-needed net patch against fresh origin/dev, and repair in-scope notice/i18n regressions with truthful unknown/error behavior. Capture current failures and screen requirements in the parent's allowed UAT artifact while supervisor resolves the four routing actions above. Do not reconstruct duplicate merge ancestry or touch extra shared files before scope is recorded.

Then implement authorized API/persistence/form work and run the parent's exact typechecks, meaningful registry regressions, i18n guard and diff check. Record role denial, form readback, real expiry boundaries and unavailable-data behavior. Live acceptance remains unverified until actually executed. A notice-only patch cannot satisfy parent acceptance.

## Verification and delivery

- `git fetch origin && git rebase origin/dev`: exit 0, already current.
- Canonical `ai-status.sh show` for parent/helper: exit 0; checked ownership, status, write scopes and acceptance without reading the complete state file.
- `gh pr view 1671 --json state,headRefOid,body,files,url`: exit 0; historical proposal inspected with `git show` at its fixed head.
- Source inspection above establishes a planning/scope gap; no product test, migration or live request was executed by this documentation-only helper.
- Task-scoped commits, normal push, replacement PR and exact candidate are recorded in canonical handoff. Parent receives the concrete continuation and pending supervisor actions via `ai-status.sh note`; its lifecycle and acceptance are preserved.
