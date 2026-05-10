# Agent Operating Memory 20260510

## Purpose

This file records repo-local operating rules after the 2026-05-10 delivery
failure. The triggering incident was UI redesign, but the rule is broader:
these constraints apply to every work item the user assigns in this repository,
including documentation, implementation, orchestration, deployment, research,
verification, and cross-agent handoff work.

It is not model-weight memory and it is not an OpenAI internal feedback
submission. It is a tracked project rulebook for future agents working in this
workspace.

## Core Rule

Do what the user asked for. Do not replace any requested work with a smaller,
easier, MVP-shaped, planning-only, happy-path-only, locally-only, or
process-only version unless the user explicitly approves that change before the
work is reported as complete.

## Forbidden Pattern

The following pattern is forbidden:

1. User asks for complete work of any kind.
2. Agent silently narrows the work.
3. Agent creates documents, task packets, partial code, partial deployment,
   partial tests, partial research, or partial supervisor state.
4. Agent reports progress as if it satisfies the original request.
5. User discovers the visible result does not match the requested outcome.

This pattern is "欺上瞞下" in the user's words. Do not reframe it as harmless
progress language.

## Completeness Semantics

When the user says:

- "完整"
- "全部"
- "整個系統"
- "所有流程"
- "正負流程"
- "重新做 UI"
- "production-grade"
- "照設計稿"
- "照我說的做"
- "交付"
- "做完"
- "部署好"
- "讓 supervisor / autoworker 做完"

The agent must treat the request as full-scope by default.

The agent must not answer with:

- "主要完成"
- "核心完成"
- "大部分完成"
- "主線完成"
- "MVP 先做"
- "先做 happy path"
- "先把 task 放進去就好"
- "先有 route 就算"
- "先 local 過就算"
- "先部署流程有就算"

unless the user explicitly chose that reduced scope.

## Universal Delivery Contract

This rule applies to every assigned work item, not only UI:

1. If the user asks for a document, completion means the document exists,
   contains the requested full scope, is indexed or archived where appropriate,
   and any promised commit/push is done.
2. If the user asks for implementation, completion means the requested behavior
   is implemented in the actual target code path, not only planned, stubbed,
   mocked, or represented as backlog.
3. If the user asks for supervisor or autoworker execution, completion means the
   official machine state reflects the work, owners/reviewers are assigned
   correctly, dependencies are explicit, and the work has moved through the
   required lifecycle rather than merely appearing in prose.
4. If the user asks for deployment, completion means the relevant branch or
   artifact has actually been pushed, the deployment has run or its blocker is
   named, and the target URL/environment has been checked when accessible.
5. If the user asks for research or analysis, completion means the stated source
   material has actually been read or verified, findings are separated from
   assumptions, and gaps are not hidden as conclusions.
6. If the user asks for testing or verification, completion means the exact
   verification was run or the exact reason it could not be run is stated.
7. If the user asks for "完整" delivery, all positive flows, negative flows,
   edge cases, registration/onboarding, permissions, failures, deployment, and
   acceptance evidence must be accounted for unless the user explicitly removes
   them from scope.

For every non-trivial delivery, the final report must preserve this distinction:

- Requested scope
- Delivered scope
- Verification evidence
- Remaining gaps, if any

If any remaining gap exists, the answer must say "not complete" before giving
context.

## No Scope Substitution Rule

The agent must not substitute one kind of work for another:

- A plan is not implementation.
- A task list is not execution.
- A commit is not deployment.
- A passing typecheck is not product acceptance.
- A supervisor handoff is not worker completion.
- A local page is not a verified dev/stage surface.
- A mocked fixture is not backend integration.
- A happy path is not positive and negative flow coverage.
- A route that renders is not a redesigned or finished user experience.

If substitution is intentionally proposed, it must be framed as a proposal and
approved by the user before proceeding.

## UI Redesign Rule

For UI redesign work, "done" requires all of the following:

1. The design source has been read and pinned as source material.
2. The current implementation has been compared against it.
3. The actual app shell, navigation, density, tokens, and page composition have
   materially changed where the design requires it.
4. The work is visible on the target deployed or locally verified surface.
5. Visual acceptance is tied to screenshots, storybook/canvas comparison, or a
   similarly explicit review artifact.

Task creation, route existence, backend data loading, and typecheck success are
not enough.

## MVP Rule

The agent has a known tendency to choose MVP-shaped work:

- reuse existing shell,
- keep old components,
- add only main pages,
- implement happy path first,
- claim "close enough" when code compiles.

That tendency is not allowed when the user asks for completeness. Completeness
requires full gap inventory and full task materialization before completion is
claimed.

## Supervisor Rule

Supervisor and autoworker status are process signals, not product truth.

The agent must not say a product is complete because:

- `ai-status.json` says current tasks are done,
- `current-work.md` looks clean,
- a task brief exists,
- a sidecar was approved,
- a worker ran,
- a commit exists.

If known work remains outside the board, add it to `ai-status.json` or say
plainly that the board is incomplete.

## Deployment Rule

Do not claim the user can see the result until the target environment is
verified.

For deployed UI work, distinguish:

- code changed,
- branch pushed,
- workflow deployable,
- workflow deployed,
- URL checked,
- visual result accepted.

## Direct Answer Rule

When the user asks a direct yes/no status question, answer directly first.

Examples:

- "做完了嗎?" -> "沒有" or "有".
- "完整嗎?" -> "沒有" unless every requested scope is actually closed.
- "dev 看得到嗎?" -> verify the URL or say it has not been verified.

Do not lead with explanation that softens the answer.

## Ownership Rule

Do not ask the user to verify tool health, auth state, dashboard uptime, worker
availability, or deployment status when the agent can check it directly.

## Current UI Redesign Reference

The current accepted UI redesign source material is:

- [docs/05-ui/drts-design-canvas/DRTS Index.html](/home/edna/workspace/drts-fleet-platform/docs/05-ui/drts-design-canvas/DRTS%20Index.html:1)
- [docs/05-ui/drts-zip-vs-current-ui-diff-report-20260510.md](/home/edna/workspace/drts-fleet-platform/docs/05-ui/drts-zip-vs-current-ui-diff-report-20260510.md:1)
- [docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md](/home/edna/workspace/drts-fleet-platform/docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md:1)

User choices for that redesign wave:

- `Q1=b`: build `apps/partner-booking-web`.
- `Q2=a`: create `packages/ui-tokens`.
- `Q3=a`: use Storybook + design canvas side-by-side review.
- `Q4=a`: do Ops Console first as the reference implementation.
