# SR-BANK-002 — current-base investigation

## Baseline and status

- Base: `c4c4a35f88907df6bf68e781059dde397c06ba03` (`origin/dev`, fetched 2026-09-08).
- Branch: `codex/sr-bank-002`; rebased successfully onto that base.
- No implementation candidate yet. This document is an investigation anchor, not acceptance evidence.
- Sources: execution task SR-BANK-002, source finding R15 and capability C005.
- Both prerequisite merge commits are ancestors of HEAD: SR-BANK-001 `6d4c47feb1c68f8b53310597da7aeffb6940cc19`, SR-IAM-001 `548608e45841`.

## Current source findings

1. `app/statements/page.tsx` renders `totalIssuerPayableAmount` for all roles; `[period]/page.tsx` also renders trip fare/subsidy/paid amounts. Both extract only `.role` from session resolution, losing authentication, tampering and tenant checks before loading the tenant selected by the query. This is source confirmation, not a live exploit claim.
2. `lib/server-bank-api.ts` sends every caller as `x-actor-type: tenant_admin`; the role is only embedded in an actor-ID string by `lib/bank-dev-read-models.ts`. Thus local display masking alone cannot demonstrate direct JSON API authorization.
3. `lib/bank-dev-read-models.ts:842` substitutes `settlementStatements` on upstream failure, including authorization failures. A stricter adapter alone would still result in fabricated financial data in HTML and CSV. This file is outside this task's write scopes.
4. CSV export and statement/trip artifact routes already check signed session export permission and tenant mismatch. They share the same fallback loader. Session currently allows finance and program admin to export, while `home.settlement.denied` says finance only. Users copy denies OPS_VIEWER settlement amounts. The canonical IAM catalog has tenant roles (including `tenant_viewer` with billing read), but no explicit bank role mapping. Do not invent a canonical mapping or widen grants to resolve this.

## Supervisor action needed

Expand scope and register dependencies before writes to:

- `apps/bank-console-web/lib/bank-dev-read-models.ts`: remove authorization/error fixture fallback and propagate verified role/tenant context to the authoritative adapter (overlaps SR-BANK-001 and other bank producers; supervisor must check writers).
- `apps/bank-console-web/app/page.tsx` and `apps/bank-console-web/lib/translations.ts`: align home visibility and finance/admin policy copy with the same confirmed policy.
- If API enforcement requires policy/controller changes, route that work through SR-IAM-001 or a dependent task owned by the canonical policy writer, and record the bank-role mapping before this task's HTML/JSON/CSV acceptance. Inspect tenant settlement endpoints as part of that scope decision.

Download routes under `app/api/statements/export/` and `app/artifacts/` need regression coverage; any required implementation changes there also require supervisor scope expansion and dependency review (including SR-BANK-003).

## Commands actually executed

- `git fetch origin` — exit 0.
- `git rebase origin/dev` — exit 0.
- `git merge-base --is-ancestor 6d4c47feb1c68f8b53310597da7aeffb6940cc19 HEAD` — exit 0.
- `git merge-base --is-ancestor 548608e45841 HEAD` — exit 0.
- Source inspection: statement pages, session, API adapter, loader, CSV/artifact guards and IAM catalog read successfully.

No live session, API resources, browser, real device, HTML/JSON/CSV matrix or deployed environment was exercised. No real resource IDs were obtained. No implementation tests/typecheck run because this anchor changes documentation only. Required regression tests remain outstanding; task must not be handed off or closed from this investigation.
