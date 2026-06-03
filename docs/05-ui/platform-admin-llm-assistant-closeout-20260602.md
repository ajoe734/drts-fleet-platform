# Platform Admin LLM Assistant — Release Closeout

Task: `PA-AI-REL-001`
Owner: Claude · Reviewer: Codex
Status authority: `ai-status.json` (this doc is the human-readable evidence record)
Last updated: 2026-06-03

## 0. TL;DR

- **All 12 PA-AI implementation + QA dependencies are `done`** and archived in machine truth, each with a recorded commit on a pushed per-lane branch.
- **All three deploy-independent technical guardrails are statically verified** against branch code (feature-flag-gated launcher, no provider secret in frontend runtime, mock/degraded provider path). File:line evidence below.
- **The release is NOT merged to `dev` and NOT deployed.** Every dependency lives only on its own per-lane branch; none is an ancestor of `origin/dev`. Cross-branch integration → CI → Cloud Run staging deploy → Secret Manager provisioning → live smoke is the remaining work and requires the integration/deploy layer (merge authority + GCP deploy credentials) **not available to an isolated worker worktree** (no `node_modules`, no `gh`, no GCP deploy authority).
- Honest integration level: **`branch_pushed`** for the implementation set + this closeout doc. The merge-to-dev and dev-deploy acceptance items are **recorded as a blocker with the exact external dependency** (see §5).

## 1. Dependency census (machine truth)

All entries verified via `scripts/ai-status.sh show <id>` and `archived_task_ids`. Commit→branch verified via `git branch -r --contains`.

| Task | Status | Owner / Reviewer | Commit | Branch |
| --- | --- | --- | --- | --- |
| PA-AI-FE-001 | done (archived) | — | `e13a9b6d2f68` | `origin/codex/pa-ai-fe-001` |
| PA-AI-FE-002 | done (archived) | — | `999704e4fd76` | `origin/claude/pa-ai-fe-002` |
| PA-AI-FE-003 | done (archived) | — | `43a706ac34aa` | `origin/codex/pa-ai-fe-003` |
| PA-AI-FE-004 | done (archived) | — | `f4e7ce338232` | `origin/codex/pa-ai-fe-004` |
| PA-AI-CONFIG-001 | done | Codex / Claude | `6d58ff950a4e` | `origin/codex/pa-ai-config-001` |
| PA-AI-BE-001 | done | Codex2 / Claude2 | `0bde952b4f1d` | `origin/codex2/pa-ai-be-001` |
| PA-AI-BE-002 | done | Claude2 / Codex | `c110c344df53` | `origin/claude2/pa-ai-be-002` |
| PA-AI-BE-003 | done | Codex / Codex2 | `1136f17fc21b` | `origin/codex/pa-ai-be-003` |
| PA-AI-BE-004 | done | Codex2 / Codex | `f49be43943e5` | `origin/codex2/pa-ai-be-004` |
| PA-AI-BE-005 | done | Claude2 / Claude | `0918a8d9c6fd` | `origin/claude2/pa-ai-be-005` |
| PA-AI-QA-001 | done | Codex2 / Claude | `a94e2ba4b3e8` | `origin/codex2/pa-ai-qa-001` |
| PA-AI-QA-002 | done | Codex2 / Claude | `3ea005fe7482` | `origin/codex2/pa-ai-qa-002` |

> Acceptance item 1 ("All PA-AI implementation and QA tasks are done or explicitly blocked with approved scope reduction") — **MET**: all 12 are `done`, none blocked.

## 2. Acceptance verification (deploy-independent guardrails)

These were verified by reading the branch code directly (`git show <branch>:<path>`); they do not need a live deploy.

### 2.1 Launcher behind a feature flag — VERIFIED

- Backend gate env: `PLATFORM_ADMIN_ASSISTANT_ENABLED` (default `false`).
- Frontend gate env: `NEXT_PUBLIC_PLATFORM_ADMIN_ASSISTANT_ENABLED` (default `false`).
- FE reader: `apps/platform-admin-web/lib/runtime-config.tsx:29` —
  `isPlatformAdminAssistantEnabled()` returns `NEXT_PUBLIC_PLATFORM_ADMIN_ASSISTANT_ENABLED === "true"`.
- Launcher gating: `apps/platform-admin-web/components/assistant/platform-assistant-overlay.tsx:140-141`
  returns `null` when `!enabled` — the launcher + panel never mount when the flag is off.
- e2e proof: `tests/e2e/platform-admin-assistant-overlay.spec.ts` test
  `"feature flag off hides the launcher"` asserts `platform-assistant-launcher`/`platform-assistant-panel`
  have count 0 when the flag is off, and full open/minimize/close/drag/persist behavior when on.

### 2.2 No provider secret in frontend runtime config — VERIFIED

- `infra/gcp/staging/platform-admin-web-service.yaml` (CONFIG-001) injects **only**
  `NODE_ENV`, `PORT`, `NEXT_PUBLIC_API_URL`, and `NEXT_PUBLIC_PLATFORM_ADMIN_ASSISTANT_ENABLED="false"`.
  No `LLM_GATEWAY_API_KEY`, no provider slug, no model names.
- `apps/platform-admin-web/lib/runtime-config.tsx` reads **only** `NEXT_PUBLIC_*` values.
- `LLM_GATEWAY_API_KEY` is API-only, sourced from Secret Manager `drts-staging-llm-gateway-api-key`
  via `secretKeyRef` in `infra/gcp/staging/api-service.yaml`.
- Design authority: `docs/05-ui/platform-admin-llm-assistant-design-development-plan-20260602.md` §5, §7
  (frontend may receive only `NEXT_PUBLIC_API_URL` + the enabled flag; only the API service account
  receives `secretmanager.secretAccessor`).

### 2.3 Mock / degraded provider path works — VERIFIED

- Config (`apps/api/src/common/llm-gateway/llm-gateway-config.ts`):
  - `DEFAULT_PROVIDER = "mock"`, default models `mock-chat-v1` / `mock-summary-v1`.
  - Non-`mock` provider requested **without** a key → throws (fail-fast) in production; otherwise
    falls back to `mock` (allowed in dev / CI: `NODE_ENV !== "production" || CI === "true"`).
- Provider wiring: `platform-admin-assistant.module.ts` binds `MockPlatformAdminAssistantProvider` by default.
- Degraded runtime path: `platform-admin-assistant.service.ts:399-418` emits explicit degraded responses
  — one for "no runtime provider key configured", one for "provider quota / rate budget exhausted" —
  still routing the operator to approved docs + safe manual follow-up.

> Acceptance item 3 ("Dev environment verifies launcher behind feature flag; no provider secret in
> frontend runtime config; mock/degraded provider path works") — **code-verified**; the *dev-environment
> live verification* portion is gated on the deploy blocker in §5.

### 2.4 Smoke evidence (assertions, not screenshots)

No deployed dev environment was available to capture screenshots. Smoke is delivered as automated
assertions on the branches:

- FE e2e: `tests/e2e/platform-admin-assistant-overlay.spec.ts` (flag off/on, overlay lifecycle, single-shell layout).
- FE unit: `tests/unit/platform-admin-assistant-route-context.test.ts`, `tests/unit/platform-admin-assistant-tools.test.ts`.
- BE unit: `apps/api/tests/unit/platform-admin-assistant.{controller,service}.test.ts`,
  `…-action.test.ts`, `…-policy{,-redaction}.test.ts`, `…-redaction{,-audit}.test.ts`,
  `…-knowledge{,-injection}.test.ts`, `llm-gateway-config.test.ts`.

These suites were **not executed** in this worker worktree (no `node_modules`; see §5). They run in CI on merge.

## 3. Integration plan for the merge layer

The QA bundles re-aggregate most of the stack but do **not** fully subsume the impl branches.

- **QA-001** (`origin/codex2/pa-ai-qa-001`) = full FE shell/overlay/pages/tools/`route-context.ts` + e2e/unit tests.
- **QA-002** (`origin/codex2/pa-ai-qa-002`) = full BE core (controller/service/provider/types/actions/audit/redaction/policy/tools/modules) + unit tests.
- QA-001 and QA-002 touch **zero common files** (clean FE/BE split).

Files **not** covered by the QA bundles, still required for a complete release:

- From **FE-003**: `components/assistant/Assistant{ActionPlanCard,Composer,ConfirmationPanel,MessageList,ReceiptCard}.tsx` (presentational components).
- From **FE-004**: `components/assistant/assistant-bridge.ts`, `assistant-tool-bridge.ts`, `route-context.tsx`.
- From **CONFIG-001**: `apps/api/src/common/llm-gateway/*`, `apps/platform-admin-web/lib/runtime-config.tsx`,
  `infra/gcp/staging/*.yaml`, the design plan doc, `apps/api/README.md`.
- From **BE-002**: `apps/api/src/modules/platform-admin-assistant/knowledge/*`.

**Suggested minimal merge set (onto `dev`):** QA-001, QA-002, CONFIG-001, FE-003, FE-004, BE-002.
(FE-001/FE-002 and BE-001/BE-003/BE-004/BE-005 files are reproduced inside the QA bundles; include
them only if the integrator wants per-task provenance — expect identical/overlapping content.)

### 3.1 Conflict surface to resolve during integration

Multiple branches edit the same files, so this is a conflict-laden merge that must be validated by CI:

- `apps/api/src/app.module.ts` — CONFIG-001, BE-001, BE-004, QA-002.
- `apps/platform-admin-web/components/admin-shell.tsx` — FE-001, FE-004, QA-001.
- `apps/platform-admin-web/lib/runtime-config.tsx` — CONFIG-001, FE-001, QA-001.
- `apps/platform-admin-web/components/assistant/assistant-types.ts` — FE-002, FE-003, QA-001.
- BE assistant `controller/service/provider/types/actions/module` — BE-001, BE-004, QA-002.

**Known reconciliation hazard:** `components/assistant/route-context.ts` (QA-001 / FE-002) **vs**
`components/assistant/route-context.tsx` (FE-004) — same basename, different extension. The integrator
must pick one canonical module (QA-001's `.ts` is the tested version) and drop/redirect the other to
avoid a duplicate-module build error.

## 4. What this closeout commit contains

This task's branch (`claude/pa-ai-rel-001`, base `dev`) adds only this evidence document. It does **not**
merge or rewrite any route bodies or sibling branch work (honoring the task `worker_warning`: additive
assistant closeout only).

## 5. Integration blocker — exact external dependency

Acceptance item 2 ("CI passes; changes merged to dev; dev deploy succeeds or deploy blocker is recorded
with exact external dependency") and the live-environment half of item 3 are **NOT MET** and cannot be
completed by this worker. Exact remaining dependencies:

1. **Merge authority + CI** — merge the §3 branch set into `dev` via PR(s), resolving the §3.1 conflicts,
   with CI (typecheck + unit + e2e) green. This worker worktree has **no `node_modules`** (cannot run
   `pnpm typecheck`/`vitest`/`playwright`) and **no `gh`** (cannot open/inspect PRs). Merge-to-`dev`
   requires the integration layer (reviewer-approved PR merge), not a single worker.
2. **Secret Manager provisioning** — create `drts-staging-llm-gateway-api-key` (and dev/prod equivalents)
   and grant `roles/secretmanager.secretAccessor` to the **API** Cloud Run service account only
   (design plan §7–§8). Requires GCP project IAM authority.
3. **Cloud Run staging deploy** — apply `infra/gcp/staging/api-service.yaml` +
   `infra/gcp/staging/platform-admin-web-service.yaml` (default `PLATFORM_ADMIN_ASSISTANT_ENABLED=false`,
   `LLM_GATEWAY_PROVIDER=mock`). Requires GCP deploy credentials not present in the worker.
4. **Live smoke** — once deployed, flip `NEXT_PUBLIC_PLATFORM_ADMIN_ASSISTANT_ENABLED=true` on the web
   service in a controlled window, confirm the launcher appears, exercise the mock/degraded response,
   and confirm no `LLM_GATEWAY_*` secret is present in the web service env. Capture screenshots/log
   assertions and append them here.

Until 1–4 are done by the integration/deploy layer, the honest integration status is **`branch_pushed`**
(implementation set + this doc pushed; not merged, not deployed). It must **not** be reported as
`merged_to_dev` or `dev_deployed`.
