# SR-OPS-SHELL-001 manual unblock diagnosis

- Date: 2026-09-08; owner: Codex2; reviewer: Codex.
- Inspected base: `origin/dev` = `2a093872d05a7d0344adf9bb58f9e5c4c99861d1`.
- Scope: this support artifact only; no product code or scope authorization changes.
- Result: remaining scope/receiver-contract blocker confirmed. The parent was prematurely resumed after a narrower history repair; dependency readiness does not establish product readiness.

## Machine-truth discrepancy

At dispatch inspection, parent `SR-OPS-SHELL-001` was `todo`, with no dependencies. Its next step said Chairman resumed it after `SR-OPS-SHELL-001-UNBLOCK-HISTORY-REPAIR`. That helper is `done`, with candidate `ca2c076fb28e4610a53cc4d6bd297db94430f213`, successful same-SHA CI/review, and merge `3f182f7e314b5ddb4c37f1c3f5dc214a6d0edf0e` from [PR #1775](https://github.com/ajoe734/drts-fleet-platform/pull/1775).

However, the merged [history audit](SR-OPS-SHELL-001-UNBLOCK-HISTORY-REPAIR.md) explicitly preserves the product scope/receiver-contract blocker. The [planning route](SR-OPS-SHELL-001-UNBLOCK-PLANNING-DECISION.md), `PHASE1_OPEN_QUESTIONS.md` entry `Q-SR-OPS-SHELL-001`, and parent runbook likewise require supervisor authorization before implementation. The current parent machine slice still authorizes only assistant components, ops shell, task tests and task UAT evidence. The helper's successful integration therefore cannot establish that the remaining prerequisite was met.

## Current source verification

At the base above:

- `apps/ops-console-web/app/dispatch/page.tsx:1226–1236` defines a local URL builder with `/platform-admin` fallback. At line 4520 the audit link calls it with `/audit`, without selected resource context; it already uses `target="_blank"`.
- `apps/ops-console-web/lib/ops-cross-app-links.ts` provides the existing runtime resolver with `/_apps/platform-admin` fallback. `crossAppHref` joins base and route; it does not serialize resource metadata automatically.
- `apps/platform-admin-web/app/audit/page.tsx:164` calls `client.listAuditLogs()` without arguments. Inspection found no URL search-parameter consumption in this receiver. Appending arbitrary sender parameters would not prove contextual destination behavior.

These source observations reproduce the documented prerequisite at current dev. They are not live-browser or API acceptance evidence, and no actual resource ID was exercised.

## Concrete next step

1. Supervisor/Chairman authorizes `apps/ops-console-web/app/dispatch/page.tsx` and the smallest necessary receiver/client scopes through the current task-board workflow, updating the reviewed planning record/digest consistently. Inspect overlapping writers and add actual dependencies before shared-file edits. Alternatively register a scoped receiver producer and connect its dependency; this artifact does not create or authorize one.
2. Current parent owner Codex2 and reviewer Codex confirm the authoritative selected-record audit resource type/ID, supported API filters, URL-to-query behavior and unknown-resource handling under `Q-SR-OPS-SHELL-001`. Older planning documents name prior lane assignments; the current machine slice governs ownership. Preserve full acceptance.
3. After those prerequisites are recorded, resume the parent in its own isolated checkout. Preserve the existing assistant fixes and published ancestry using the history audit's non-destructive path. Reuse the runtime URL resolver and implement only authorized sender/receiver changes.
4. Run the parent-scoped Vitest suite, ops typecheck, whitespace checks and actual 1440/390px CTA/focus/reload/navigation checks. Record base/candidate SHA and exercised resource IDs; distinguish unperformed live checks. Commit, ordinary push, and hand off the exact parent candidate to Codex.

The parent blocker/next step is written using the current release `ai-status.sh blocker`. This helper delivers diagnosis for independent review; it does not claim the parent is unblocked. Integrating this support artifact must not be interpreted as satisfying the scope/contract prerequisite.

## Verification and delivery

- `git fetch origin`: exit 0.
- `git rebase origin/dev`: exit 0, already up to date.
- `gh pr view 1775 --json state,mergedAt,mergeCommit,headRefOid,url`: exit 0, merged at `2026-09-08T15:39:00Z`, matching the helper machine slice.
- `git merge-base --is-ancestor 3f182f7e314b5ddb4c37f1c3f5dc214a6d0edf0e origin/dev`: exit 0.
- Scoped `rg`/`sed` source inspection: exit 0, findings above.
- Product tests/typecheck and live acceptance were not run: this change is a support diagnosis only.
- Final whitespace check, task commit, normal push, PR URL and exact helper candidate are recorded at handoff. Review, CI and merge remain with candidate lifecycle; no direct `done` transition is requested.
