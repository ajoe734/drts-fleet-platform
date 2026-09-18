# SR-OPS-SHELL-001 planning decision routing

- Date: 2026-09-08
- Owner / reviewer: Codex / Gemini
- Parent: SR-OPS-SHELL-001
- Disposition: explicit supervisor follow-up; parent remains blocked pending scope authorization and receiver contract confirmation.
- Inspected base: `origin/dev` = `3b60a3757238663572f16f010c94f446f2c71eaa` after fetch/rebase.
- Canonical question: `PHASE1_OPEN_QUESTIONS.md`, `Q-SR-OPS-SHELL-001`.

## Evidence and decision

1. The parent task's execution prompt and canonical runbook require runtime-correct cross-app navigation with resource context, but its write scopes include only assistant components, shell, task tests and UAT evidence. The execution packet's shared-file rules §3–4 require supervisor scope/dependency changes before editing additional files.
2. At the inspected base, `apps/ops-console-web/app/dispatch/page.tsx:1226` defines a local platform-admin URL builder whose default is `/platform-admin`. Its selected-record audit CTA at line 4520 passes only `/audit`, without resource context. This is a source-level reproduction, not a live browser result.
3. `apps/ops-console-web/lib/ops-cross-app-links.ts` already exposes `crossAppHref`, with trimmed configuration and default `/_apps/platform-admin`. Reuse this existing resolver after authorization; do not create another environment-variable convention. Its `resourceType` / `resourceId` metadata is not automatically serialized by `crossAppHref`.
4. `apps/platform-admin-web/app/audit/page.tsx:164` calls `client.listAuditLogs()` without arguments. The inspected page does not read URL search parameters. Merely appending resource query parameters to the sender is therefore insufficient evidence of contextual navigation.
5. PRD §13.3 requires immutable audit; service contracts §3.13 assigns audit truth and `list_audit_logs` to Audit & Notification Service. These provisions do not specify a browser resource-filter query contract. Preserve authorization and audit semantics; do not infer a new endpoint or consider metadata alone a working receiver contract.
6. The parent machine slice records candidate `7308cc2802278d3c381c18eac4a420c4d9e2ed41`, PR #1728, and failed CI for that SHA. That is historical parent evidence, not this helper's candidate or proof of acceptance.

Decision: retain the full parent acceptance, route the missing scopes and receiver contract explicitly, and make no product-code change in this helper. No acceptance scope cut is approved.

## Concrete next steps and ownership

1. Supervisor reviews active machine-truth write scopes for overlap on the dispatch page, cross-app helper and audit receiver. Add the exact sender path `apps/ops-console-web/app/dispatch/page.tsx` to the parent scope using the current release task-board workflow, updating the reviewed planning manifest/runbook and digest consistently. Add dependencies on actual overlapping writers; a serial-resource label alone is not a lock. This record is a request, not authorization.
2. Codex with Gemini confirms the existing audit API filters and the selected board record's authoritative resource type/ID mapping. Record the chosen URL-to-query behavior and empty/unknown-resource behavior under `Q-SR-OPS-SHELL-001`. Do not substitute an order ID for a queue-entry/dispatch ID without tracing the actual audit resource mapping.
3. If receiver support is missing, supervisor authorizes the smallest required receiver/client scope and dependencies, or registers a separate producer task and adds it as a parent dependency. Candidate paths for review are `apps/platform-admin-web/app/audit/page.tsx` and, only if needed, its existing client implementation. Shared contracts/exports remain with their designated contract owner. Any new official work must be registered in machine truth before dispatch, not left only in this document.
4. After machine-truth authorization, parent owner resumes from fresh `origin/dev`, preserves useful prior assistant fixes, replaces the dispatch CTA's local URL construction with the existing resolver, and implements the confirmed resource context end to end. Check forwarded adapter navigation too if changing the shared local builder affects it. No scope broadening to unrelated navigation.
5. Parent owner runs its existing Vitest suite, ops typecheck, `git diff --check`, and any receiver-specific checks justified by the authorized change. Regress default prefix, configured origin/trailing slash, encoded real resource identity, destination consumption, and new-tab behavior. Retain 1440/390px CTA, close/reopen/reload and keyboard-focus acceptance. Record actual resource IDs and clearly separate live checks from local tests.
6. Parent owner commits, pushes normally, and hands off a new exact candidate. Supervisor/reviewer close this question only when scopes and receiver behavior are recorded. If product chooses to omit resource context, obtain an explicit human decision before changing acceptance.

## Helper validation and delivery

- `git fetch origin`: exit 0.
- `git rebase origin/dev`: exit 0; already up to date.
- Source inspection confirms sender fallback, missing sender context and receiver query consumption gap at the base above.
- Documentation-only helper: product Vitest/typecheck and live browser checks are not run and are not claimed as passing.
- Final whitespace/link checks, task-scoped commit, ordinary push and PR evidence are recorded in the helper machine-truth handoff. The locked helper candidate is the handoff SHA; no self-referential candidate hash is embedded here.
