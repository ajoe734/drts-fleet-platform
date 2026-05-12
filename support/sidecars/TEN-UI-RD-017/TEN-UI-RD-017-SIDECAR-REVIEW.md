# TEN-UI-RD-017 Review Packet & Evidence Summary

**Sidecar Kind:** `review_packet`
**Parent Task:** `TEN-UI-RD-017` — API Keys 完整化
**Parent Owner:** `Codex2`
**Parent Reviewer:** `Claude2` (current reviewer of record after the
`2026-05-11T02:43:30Z` availability-first reassignment from `Codex`)
**Sidecar Owner:** `Claude`
**Sidecar Reviewer:** `Codex2`
**Generated:** `2026-05-12` (UTC)
**Status:** `REVIEW SUPPORT ARTIFACT` — support-only; does not modify
canonical truth, runtime behavior, or the parent task's implementation files.

This packet is a reviewer-facing companion to the parent task
`TEN-UI-RD-017`, which converts `apps/tenant-console-web/app/api-keys` from
an IA shell into a contract-backed lifecycle surface (issue / rotate /
revoke) against the published tenant integration contract. The parent task
is the canonical implementation slice; this packet pins the machine-truth
handoff record, the file-by-file evidence map, the rework history across
four review-failure rounds, and the acceptance checklist that the parent
reviewer (`Claude2`) has already applied against the parent owner's working
tree.

At packet generation time the parent task is **in `review_approved`** —
Claude2 re-approved the slice at `2026-05-12T14:19:22Z` after the parent
owner's accidental progress-state regression on `2026-05-11T02:57:37Z`.
Commit `4d8ce97` has been pushed to
`origin/feat/claude2-ui-redesign-foundation`; the parent is waiting on
`Codex2` to record `done` with the commit/push metadata. This packet does
not perform the `done` closeout — that remains the parent owner's step.

Transient parent lifecycle truth (`status`, `next`, `last_update`, future
`commit_hash` / `push_*` fields) remains authoritative only in
`ai-status.json`. This packet snapshots the most recent values for reviewer
convenience but does not replace machine truth.

---

## 1. Scope Boundary

In scope:

- restate the parent acceptance bar as a concrete reviewer checklist against
  the parent's working-tree changes already on commit `4d8ce97`
- pin the machine-truth dependency on `TEN-UI-RD-001`
- enumerate the verifiable anchors the parent's implementation cites (file
  paths, contract surfaces, design canvas artboard, governance package)
- record the parent task's file-level shape so a reviewer can audit the
  route without re-deriving it from scratch
- record the parent owner's and parent reviewer's verifications across the
  four review-failure rounds and the eventual `review_approved` transition
- record the parent reviewer's verbatim approval rationale so the sidecar
  reviewer can confirm the audit chain stays anchored to working-tree files

Out of scope:

- editing L1/L2 product truth, the parent task entry in `ai-status.json`,
  or the working-tree implementation files
  (`apps/tenant-console-web/app/api-keys/*`,
  `apps/tenant-console-web/app/globals.css`)
- editing the design canvas (`docs/05-ui/drts-design-canvas/Tenant Console.html`,
  `docs/05-ui/drts-design-canvas/tenant-screens.jsx`) or any tenant parity
  story under `packages/ui-web/src/tenant-*.stories.tsx` (parent explicitly
  records Storybook as N/A for `apps/tenant-console-web`)
- expanding tenant integration contracts under
  `apps/api/src/modules/tenant-partner/` or `packages/api-client/src/`;
  the parent explicitly stays on existing `listApiKeys` / `issueApiKey` /
  `rotateApiKey` / `revokeApiKey` / `getTenantIntegrationGovernancePackage`
  surfaces
- mutating or "absorbing" the parent task; absorption is the parent owner's
  decision after parent review approval, not the sidecar's
- performing the parent's `done` closeout — owner provides
  `COMMIT_HASH=4d8ce97` / `COMMIT_SUBJECT` / `PUSH_REMOTE=origin` /
  `PUSH_BRANCH=feat/claude2-ui-redesign-foundation` themselves

---

## 2. Machine Truth Anchors

### Sidecar (this task) — `ai-status.json → TEN-UI-RD-017-SIDECAR-REVIEW`

- owner=`Claude`
- reviewer=`Codex2`
- depends_on=`TEN-UI-RD-001`
- task_class=`sidecar`
- helper_parent=`TEN-UI-RD-017`
- helper_kind=`review_packet`
- mutates_canonical=`false`
- artifacts=`support/sidecars/TEN-UI-RD-017/TEN-UI-RD-017-SIDECAR-REVIEW.md`
- live lifecycle fields (`status`, `next`, `last_update`) deferred to
  `ai-status.json`

### Parent — `ai-status.json → TEN-UI-RD-017` (snapshot)

- status=`review_approved` (at `2026-05-12T14:19:22Z`)
- owner=`Codex2`
- reviewer=`Claude2` (post-`2026-05-11T02:43:30Z` reassignment from `Codex`)
- phase=`Wave 3`
- depends_on=`TEN-UI-RD-001`
- acceptance:
  - `pnpm --filter @drts/tenant-console-web typecheck / build / test`
  - `Storybook 對照對應 TN_* artboard`
  - `若 backend contract 缺，開 blocker 回 discussion_planning，不偷擴 contract`
- planning_ref=`docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`
- branch the parent's working tree currently sits on=`feat/claude2-ui-redesign-foundation`
- shipped commit (already pushed but `done` not yet finalized in
  `ai-status.json`)=`4d8ce97f5e0e8256a8865ed77ec64da9d965fd74`
- commit subject=`feat(TEN-UI-RD-017): complete tenant api keys surface`
- push target=`origin/feat/claude2-ui-redesign-foundation`
- review_notes_zh (verbatim from `ai-status.json`):
  > 審查通過：lint/typecheck/build/test 全綠；plaintext 僅停留在 client
  > island 狀態（無 cookie/storage）；activeKeys/expiringKeys 已用共用
  > status helper 排除 expired；scope/expiry 驗證對齊 governance
  > contract。Storybook 對照不適用（apps/tenant-console-web 無
  > .storybook 設定）。請 Codex2 commit + push + done。

### Parent lifecycle log — `ai-activity-log.jsonl`

The parent's lifecycle is unusually long for a single tenant route slice
because the reviewer issued four explicit `reopen` events before the final
approve. All timestamps are UTC and copied verbatim from
`ai-activity-log.jsonl`.

| Event                | Timestamp UTC          | Agent        | Outcome                                                                                                                                    |
| -------------------- | ---------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `assign`             | `2026-05-10T06:31:45Z` | `Codex`      | Owner `Claude2` → reviewer `Codex`; planning_ref recorded.                                                                                 |
| `chair_reassign`     | `2026-05-10T12:47:04Z` | Orchestrator | Owner moved from `Claude2` → `Codex2` because Claude2's lane was auth-paused at `2026-05-10T12:36:26Z`.                                    |
| `worker_started`     | `2026-05-11T01:30:50Z` | Orchestrator | Codex2 dispatched on `owned_ready_dispatch`.                                                                                               |
| `handoff` #1         | `2026-05-11T01:46:27Z` | `Codex2`     | First handoff to `Codex`; typecheck/build/test green.                                                                                      |
| `reopen` #1          | `2026-05-11T01:53:26Z` | `Codex`      | Failure: actions invented end-of-day UTC expiry and stripped time on rotate.                                                               |
| `handoff` #2         | `2026-05-11T02:00:43Z` | `Codex2`     | Rework: explicit-timezone-only expiry; rotate preserves stored ISO.                                                                        |
| `reopen` #2          | `2026-05-11T02:08:46Z` | `Codex`      | Failure: `no-useless-escape` ESLint regression in timezone regex.                                                                          |
| `handoff` #3         | `2026-05-11T02:14:24Z` | `Codex2`     | Rework: removed unnecessary escape; lint green.                                                                                            |
| `reopen` #3          | `2026-05-11T02:22:06Z` | `Codex`      | Failure: plaintext key stored in non-httpOnly cookie + client cleanup.                                                                     |
| `handoff` #4         | `2026-05-11T02:30:06Z` | `Codex2`     | Rework: removed flash cookie / cleaner; client-island state via `ApiKeyManager`.                                                           |
| `reopen` #4          | `2026-05-11T02:36:37Z` | `Codex`      | Failure: KPI counts treated `expired` as `active`.                                                                                         |
| `handoff` #5         | `2026-05-11T02:41:09Z` | `Codex2`     | Rework: shared `resolveApiKeyStatus`/`isApiKeyUsable` helpers exclude expired.                                                             |
| `proactive_rebal`    | `2026-05-11T02:43:30Z` | Orchestrator | Reviewer reassigned `Codex` → `Claude2` (availability-first; Codex unavailable).                                                           |
| `review_approved` #1 | `2026-05-11T02:51:23Z` | `Claude2`    | First approval: plaintext stays in client island; KPI helper excludes expired; scope/expiry aligned to governance contract; Storybook N/A. |
| `progress`           | `2026-05-11T02:55:35Z` | `Codex2`     | Closeout in progress (accidentally regressed state from `review_approved`).                                                                |
| `handoff` #6         | `2026-05-11T02:57:37Z` | `Codex2`     | Closeout-ready handoff: commit `4d8ce97` pushed; typecheck/build/test re-ran green; please re-approve.                                     |
| `review_approved` #2 | `2026-05-12T14:19:22Z` | `Claude2`    | Re-approval after the progress-state regression; closeout cleared.                                                                         |

The two `review_approved` events both come from `Claude2`. Verification
trailers attached by the parent owner on commit `4d8ce97`:

- `LLM-Agent: Codex2`
- `Task-ID: TEN-UI-RD-017`
- `Reviewer: Claude2`
- `Verification: pnpm --filter @drts/tenant-console-web typecheck && pnpm --filter @drts/tenant-console-web build && pnpm --filter @drts/tenant-console-web test (Storybook N/A: apps/tenant-console-web has no .storybook)`

### Upstream dependency — `ai-status.json → TEN-UI-RD-001`

- status=`done`
- shipped commit=`515f271395a583fe25be16c110dbf232f4ebcf87`
- commit subject=`feat(TEN-UI-RD-001): finish CSS strip + add tenant-shell Storybook target`
- commit_recorded_at=`2026-05-10T16:34:46Z`
- push target=`origin/feat/claude2-ui-redesign-foundation`
- contribution to `TEN-UI-RD-017`: shell adoption baseline +
  `apps/tenant-console-web/app/globals.css` cleanup, so the redesigned
  `/api-keys` route renders inside the post-shell tenant chrome and shares
  `PageHero`, `SurfaceCard`, `CalloutPanel` primitives plus the residual
  `globals.css` token set with Wave 3 sibling routes.

### Authoritative supporting documents

- `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md:468` — records
  `TEN-UI-RD-017 API Keys 完整化 (現為 IA shell)` as a Sub-line B parity-fill
  task with the "do not extend contract; open blocker if missing" guardrail.
- `docs/05-ui/drts-design-canvas/Tenant Console.html:83` — declares
  `<DCArtboard id="apikeys" label="API 金鑰" …><TN_ApiKeys /></DCArtboard>`;
  parity anchor for the redesigned route.
- `docs/05-ui/drts-design-canvas/tenant-screens.jsx:3-23` — `TN_NAV`
  ordering; the `整合` divider precedes `apikeys` (`:17`) which precedes
  `webhooks` (`:18`).
- `docs/05-ui/drts-design-canvas/tenant-screens.jsx:338-358` — `TN_ApiKeys`
  artboard with `PageHeader(title='API 金鑰', subtitle='Live 與 sandbox ·
scope · last seen · 撤銷後永久不可復原')`, a one-time-reveal banner, and a
  table with `NAME / PREFIX / MASK / SCOPE / LAST / EXPIRES / STATE`
  columns. The parent's runtime route mirrors these column intents (plus a
  `CREATED` and an `Actions` column for parity with sibling tenant
  surfaces).
- `packages/contracts/src/index.ts:1054-1107` — tenant API key contract
  surface:
  - `TenantApiKeyRecord` (`:1054-1065`) with
    `apiKeyId / tenantId / keyName / keyPrefix / maskedSuffix / scopes /
lastUsedAt / expiresAt / revokedAt / createdAt`.
  - `TENANT_API_KEY_ALLOWED_SCOPES` (`:1067-1079`) — the eleven canonical
    scopes the route may surface for selection.
  - `TenantApiKeyGovernancePolicy` (`:1081-1089`) with
    `allowedScopes / compatibilityAliases / defaultLifetimeDays /
maxLifetimeDays / requireExpiry / breakGlassRequiresPlatformApproval /
revokeEffect`.
  - `IssueTenantApiKeyCommand` (`:1091-1095`) / `RotateTenantApiKeyCommand`
    (`:1097-1101`) — the command shapes the route writes to.
  - `TenantApiKeyIssued` (`:1103-1107`) — the response shape the issue /
    rotate actions surface; carries `plaintextKey: string` for the
    one-time reveal.
- `packages/contracts/src/index.ts:1119-1127` —
  `TenantIntegrationGovernancePackage` (`apiKeyPolicy`, `webhookPolicy`,
  baselines, onboarding checklist); this is what
  `getTenantIntegrationGovernancePackage()` returns.
- `packages/api-client/src/index.ts:1251-1320` —
  `listApiKeys` / `issueApiKey` / `rotateApiKey` / `revokeApiKey` /
  `getTenantIntegrationGovernancePackage` client methods (all pre-existing;
  no client change in this task).
- `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts:416-460`
  — the backend routes the client targets:
  - `GET tenant/api-keys` (`:416`)
  - `POST tenant/api-keys` (`:428`)
  - `POST tenant/api-keys/:apiKeyId/revoke` (`:444`)
  - `POST tenant/api-keys/:apiKeyId/rotate` (`:460`)

---

## 3. Dependency Map

### A. Upstream machine-truth dependencies

The parent task formally depends only on `TEN-UI-RD-001`. That dependency
is already `done` and shipped on the active branch.

| Dep ID          | Status | Reviewer of record | Approved (UTC)       | Shipped commit | What it contributes to `TEN-UI-RD-017`                                                                                                                                                                                                |
| --------------- | ------ | ------------------ | -------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TEN-UI-RD-001` | `done` | `Codex`            | 2026-05-10T16:34:46Z | `515f271`      | Tenant console shell + `globals.css` cleanup + `tenant-shell.stories.tsx` parity baseline; required so the `/api-keys` route renders post-shell and shares `PageHero`/`SurfaceCard`/`CalloutPanel` with Wave 3 sibling tenant routes. |

Branch presence assertion:

- `515f271` resolves on `origin/feat/claude2-ui-redesign-foundation` at
  packet generation time (recorded as `push_commit` / `push_ref` in
  `ai-status.json → TEN-UI-RD-001`).

The parent does not declare any other hard `depends_on` in machine truth.
There is no contract-side dependency entry because the parent explicitly
reuses existing tenant integration APIs and adds no new contract surface.

### B. Downstream consumer map

`TEN-UI-RD-017` is a single-route tenant parity-fill slice. Its downstream
consumers are not other `ai-status.json` tasks but the Wave 3 tenant
closeout, the sibling Webhooks slice, and the parity-decisions doc.

| Consumer                                                     | Relationship       | Why `TEN-UI-RD-017` matters                                                                                                                                                                                                                              |
| ------------------------------------------------------------ | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TEN-UI-RD-099` Wave 3 tenant closeout packet                | reference baseline | The Wave 3 closeout matrix needs a row for the `API Keys` surface with reviewer + approved-at + shipped commit + canvas anchor; this task provides those values.                                                                                         |
| `TEN-UI-RD-018` Webhooks 完整化                              | structural sibling | Webhooks lives next to API Keys in the `整合` nav band; the `CalloutPanel` at `api-key-manager.tsx:487-490` ("Shared integration band") explicitly anchors that adjacency. The Webhooks slice can reuse the issue/rotate/revoke pattern documented here. |
| Design canvas maintenance (`docs/05-ui/drts-design-canvas/`) | anchor inventory   | The `TN_ApiKeys` artboard at `Tenant Console.html#apikeys` is now load-bearing for a shipped route; canvas refactors must preserve `id="apikeys"`.                                                                                                       |
| Tenant parity decisions doc                                  | documentation      | `docs/05-ui/tenant-console-parity-decisions-20260???.md` is the parity-fill log; the API Keys route's "no contract expansion + governance-driven scopes" stance should be reflected in Wave 3 closeout writing.                                          |
| Reviewers of `apps/tenant-console-web`                       | review boundary    | The `/api-keys` route is a new server-rendered surface with a client-island manager; reviewers should treat the issue/rotate/revoke server actions and the one-time-reveal client state as part of the tenant-portal review surface.                     |

Dispatch interpretation:

- No `ai-status.json` task currently records a hard machine-truth
  `depends_on` edge **to** `TEN-UI-RD-017` at packet time. The consumers
  above are reference / template consumers, not formal dependencies, and
  should not be promoted to hard dependencies in machine truth without an
  explicit decision.

---

## 4. Implementation Evidence Map

Commit `4d8ce97` (`feat(TEN-UI-RD-017): complete tenant api keys surface`)
touches five files. This section records what each file contributes and
where the reviewer can find the load-bearing lines in the current working
tree.

### 4.1 `apps/tenant-console-web/app/api-keys/page.tsx` (rewritten — 52 lines)

- declares `export const dynamic = "force-dynamic"` (`page.tsx:8`) so each
  visit reloads the contract data and clears any prior one-time reveal.
- `loadApiKeyPageData()` uses `Promise.allSettled` over
  `client.listApiKeys()` and
  `client.getTenantIntegrationGovernancePackage()` (`page.tsx:16-47`); a
  rejected promise becomes a user-facing error string rather than a 5xx,
  so the UI shell stays renderable when one integration read fails.
- exposes a `(apiKeys, governance, errors)` tuple to the client island
  `ApiKeyManager`; the server component holds no plaintext key state.
- imports `TenantApiKeyRecord` and `TenantIntegrationGovernancePackage`
  from `@drts/contracts` (`page.tsx:1-4`), matching the published types
  exactly with no local shape extension.

### 4.2 `apps/tenant-console-web/app/api-keys/api-key-manager.tsx` (new — 493 lines)

- declared `"use client"` (`:1`) — this is the client island that owns the
  ephemeral one-time-reveal state. Plaintext key material lives only in
  React local state (`useState<ApiKeyFlashPayload | null>`, `:103`); no
  cookie, no `localStorage`, no `sessionStorage`.
- shared status helpers `isRevoked` (`:28-30`), `resolveApiKeyStatus`
  (`:32-49`), `isApiKeyUsable` (`:51-54`),
  `getApiKeyStateClassName` / `getApiKeyStateLabel` (`:56-74`). These are
  the post-reopen-#4 fix that excludes `expired` keys from the
  active/expiry KPIs.
- `runAction()` wrapper (`:119-137`) is the single entry point for all
  three server actions; it sets the flash, clears the issue form on
  success when requested, and calls `router.refresh()` so the next render
  shows the updated key list from the server.
- KPI grid (`:176-201`) shows `Active keys` / `Revoked` / `Scoped` /
  `Expiry` counts derived from `activeKeys` (`:109`, `isApiKeyUsable`),
  `revokedKeys` (`:110`), `allowedScopes` (governance), and `expiringKeys`
  (`:111-113`, status==`expiring`).
- issue form (`:203-276`):
  - `keyName` is required (`:226-230`).
  - `expiresAt` is an optional ISO 8601 text input with explicit
    timezone (`:234-247`); the hint copy points at
    `governance.apiKeyPolicy.defaultLifetimeDays` rather than computing
    a local default. **This is the post-reopen-#1 fix** — no client-side
    end-of-day fabrication, no pre-fill from governance days.
  - scope checkboxes are sourced from
    `governance.apiKeyPolicy.allowedScopes` (`:114`); the submit button
    is disabled when no scopes are published (`:269`). **This is the
    contract-driven scope set.**
- governance card (`:278-336`) renders the `apiKeyPolicy` fields verbatim
  (`defaultLifetimeDays`, `maxLifetimeDays`, `requireExpiry`,
  `revokeEffect`, `breakGlassRequiresPlatformApproval`, generated-at) plus
  any `compatibilityAliases` entries. The UI does not invent additional
  policy semantics.
- register table (`:338-485`):
  - columns `NAME / PREFIX / MASK / SCOPES / LAST / EXPIRES / STATE /
CREATED / Actions` mirror the canvas table
    (`tenant-screens.jsx:346-353`) plus `CREATED` and per-row commands.
  - rotate form (`:403-437`) passes the existing `apiKey.expiresAt` ISO
    string verbatim through a hidden input (`:425-428`). **This is the
    post-reopen-#1 fix** — rotation can no longer silently strip time
    precision; if the user wants a new expiry they must type it.
  - revoke form (`:438-466`) posts only `apiKeyId` + `keyName`; revoke
    intent is hardcoded `revokeEffect=immediate` on the backend.
  - revoked rows show only the revoke timestamp (`:397-400`) — no
    rotate/revoke commands; revocation is irreversible per contract.
- closing `CalloutPanel` (`:487-490`) anchors the `整合` band parity:
  > API keys and webhooks stay adjacent in tenant navigation because both
  > are tenant-managed integrations, but they keep separate command
  > vocabularies and secret-handling rules.

### 4.3 `apps/tenant-console-web/app/api-keys/actions.ts` (new — 181 lines)

- declared `"use server"` (`:1`); imports `TENANT_API_KEY_ALLOWED_SCOPES`
  from `@drts/contracts` (`:4`) so scope validation tracks the canonical
  enum literally.
- `readTrimmedString()` (`:8-19`) and `readScopes()` (`:27-46`) — strict
  form-data accessors that throw on missing/invalid input.
  `readScopes()` deduplicates and rejects any non-allowed scope with the
  exact unsupported value in the error message (`:40-43`); on empty input
  it raises `"Select at least one published API key scope."` (`:36-38`).
- `buildOptionalExpiry()` (`:48-66`) — the post-reopen-#1 + post-reopen-#2
  contract-aligned expiry parser:
  - blank input returns `{}`, so the backend uses the published default
    lifetime (no client fabrication of `T23:59:59Z`).
  - non-blank input must include an explicit timezone (`Z` or `±HH:MM`,
    `:53`) or it throws `"Expiry must include an explicit timezone
offset or Z suffix."` (`:55-57`).
  - explicit timezone but invalid date throws
    `"Expiry must be a valid ISO 8601 timestamp."` (`:62-63`).
  - valid input is normalized via `new Date(...).toISOString()`
    (`:65`) before being forwarded to the backend command. **The regex
    on `:53` no longer contains the post-reopen-#2 `no-useless-escape`
    finding** (`-` is no longer escaped inside the character class).
- `issueTenantApiKeyAction(formData)` (`:68-105`):
  - returns a structured `ApiKeyFlashPayload` rather than mutating cookies
    (the post-reopen-#3 client-island contract).
  - success payload sets `plaintextKey: issued.plaintextKey` so the
    client island can render a one-shot reveal. There is no server-side
    persistence of the plaintext beyond the action's return value.
  - failure payload sets `tone: "warning"` with the underlying error
    message; the action never throws.
  - calls `revalidatePath("/api-keys")` unconditionally (`:103`) so the
    list re-renders against the updated server state.
- `rotateTenantApiKeyAction(formData)` (`:107-146`):
  - requires `apiKeyId` (`:113-118`); preserves `keyName` only if
    provided (`:122-124`) — so a hidden-input round-trip from the row
    does not nullify the existing label.
  - re-uses `readScopes()` and `buildOptionalExpiry()`, including the
    preservation of `apiKey.expiresAt` raw ISO via hidden input from
    the row form.
- `revokeTenantApiKeyAction(formData)` (`:148-181`):
  - requires `apiKeyId`; success payload references the human-friendly
    `keyName ?? apiKeyId` (`:166-168`).
  - falls through to `revalidatePath("/api-keys")` on both success and
    failure so the table reflects the post-revoke state immediately.

### 4.4 `apps/tenant-console-web/app/api-keys/constants.ts` (new — 6 lines)

- declares the `ApiKeyFlashPayload` type used by all three server actions
  and the client island:

  ```ts
  export type ApiKeyFlashPayload = {
    tone: "default" | "warning";
    title: string;
    description: string;
    plaintextKey?: string;
  };
  ```

- no other constants live in this file; this is intentionally narrow so
  that the type can be imported from both server-action and client-island
  surfaces without dragging in module side effects.

### 4.5 `apps/tenant-console-web/app/globals.css` (modified — +43 lines)

- adds five small style blocks scoped strictly to the new route:
  - `.field-stack .field-hint` (`+249-+254`) — the hint copy under the
    `Expires at` input pointing at the published default lifetime.
  - `.plaintext-key` (`+377-+386`) — the one-time reveal `<code>` block
    inside `CalloutPanel`.
  - `.scope-grid` (`+388-+392`) — the responsive scope checkbox grid.
  - `.scope-option` (`+394-+401`) — the per-scope checkbox wrapper.
  - `.row-actions` (`+403-+407`) — the inline rotate/revoke command
    cluster for the register table.
- no existing tenant-console styles are removed or restructured; no token
  changes; no theme overrides. The additions sit alongside the existing
  Wave 3 primitive styles emitted by the post-`TEN-UI-RD-001` cleanup.

### 4.6 Contract-boundary evidence

- consuming surfaces:
  - `packages/api-client/src/index.ts:1251` — existing `listApiKeys()`.
  - `packages/api-client/src/index.ts:1255` — existing `issueApiKey(...)`.
  - `packages/api-client/src/index.ts:1263` — existing `rotateApiKey(...)`.
  - `packages/api-client/src/index.ts:1302` — existing `revokeApiKey(...)`.
  - `packages/api-client/src/index.ts:1316` — existing
    `getTenantIntegrationGovernancePackage()`.
- backend routes:
  - `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts:416`
    — `GET tenant/api-keys`.
  - `:428` — `POST tenant/api-keys`.
  - `:444` — `POST tenant/api-keys/:apiKeyId/revoke`.
  - `:460` — `POST tenant/api-keys/:apiKeyId/rotate`.
- contract record types relevant to the slice:
  - `packages/contracts/src/index.ts:1054-1065` — `TenantApiKeyRecord`.
  - `:1067-1079` — `TENANT_API_KEY_ALLOWED_SCOPES`.
  - `:1081-1089` — `TenantApiKeyGovernancePolicy`.
  - `:1091-1101` — `IssueTenantApiKeyCommand` /
    `RotateTenantApiKeyCommand`.
  - `:1103-1107` — `TenantApiKeyIssued` (carries `plaintextKey`).
  - `:1119-1127` — `TenantIntegrationGovernancePackage`.
- there are no `git diff` lines under `packages/contracts/`,
  `packages/api-client/src/`, or `apps/api/src/modules/tenant-partner/`
  attributable to this task — consistent with the parent's "no contract
  expansion" guarantee (`git show --stat 4d8ce97` only touches the five
  files in §4.1–§4.5).

### 4.7 Review-failure history (verbatim from `ai-activity-log.jsonl`)

For audit trail, the four `reopen` events the parent walked through
before approval. Each finding is anchored to the working-tree fix that
ultimately landed in commit `4d8ce97`.

1. **Reopen #1 (`2026-05-11T01:53:26Z`, by `Codex`):** "app/api-keys
   converts date inputs to end-of-day UTC and strips stored expiry time
   during rotate, so the UI invents expiry semantics beyond the backend
   contract. … toExpiryTimestamp() appends T23:59:59Z, while page.tsx
   pre-fills defaultExpiryDate from governance days and rotate posts
   formatDateInput(apiKey.expiresAt)."
   - working-tree fix anchor: `actions.ts:48-66` (`buildOptionalExpiry`
     refuses to fabricate end-of-day; demands explicit timezone) plus
     `api-key-manager.tsx:234-247` (expires hint references governance
     defaults rather than pre-filling).
   - rotate-preservation anchor: `api-key-manager.tsx:424-428` (hidden
     input forwards `apiKey.expiresAt` verbatim).
2. **Reopen #2 (`2026-05-11T02:08:46Z`, by `Codex`):** "actions.ts:62
   breaks package lint with eslint no-useless-escape because the timezone
   regex unnecessarily escapes '-' inside the character class."
   - working-tree fix anchor: `actions.ts:53` —
     `/(?:[zZ]|[+-]\d{2}:\d{2})$/`, no longer
     `/(?:[zZ]|[+\-]\d{2}:\d{2})$/`.
3. **Reopen #3 (`2026-05-11T02:22:06Z`, by `Codex`):** "actions.ts:75-86
   stores the plaintext flash payload in a non-httpOnly cookie, and
   page.tsx:80-145 plus app/api-keys/flash-cookie-cleaner.tsx:5-8 only
   clear it from a client useEffect after the page renders. … breaks the
   TN_ApiKeys one-time reveal guarantee."
   - working-tree fix anchor:
     - server actions return `ApiKeyFlashPayload` directly
       (`actions.ts:87-101`, `actions.ts:128-141`,
       `actions.ts:164-168`) — no cookie writes.
     - client island `api-key-manager.tsx:103, :126-136` keeps the
       reveal in `useState`; `router.refresh()` reloads server state on
       success.
     - `flash-cookie-cleaner.tsx` and the flash cookie constant were
       deleted in the same rework (no residual file exists in the
       working tree).
4. **Reopen #4 (`2026-05-11T02:36:37Z`, by `Codex`):** "api-key-manager.tsx
   derives activeKeys/expiringKeys from !revoked only, so expired keys
   are still counted in the \"Active keys\" KPI … and the \"Expiry\" KPI
   … This repeats the same expired-vs-active status bug already fixed in
   tenant-portal via resolveApiKeyStatus/isApiKeyUsable."
   - working-tree fix anchor: `api-key-manager.tsx:32-49`
     (`resolveApiKeyStatus`), `:51-54` (`isApiKeyUsable`), `:109`
     (`activeKeys` filter), `:111-113` (`expiringKeys`).

### 4.8 Canvas anchor

- `docs/05-ui/drts-design-canvas/Tenant Console.html:83` —
  `<DCArtboard id="apikeys" label="API 金鑰" …><Hero
url="/integrations/keys"><TN_ApiKeys theme={th} /></Hero></DCArtboard>`.
- `docs/05-ui/drts-design-canvas/tenant-screens.jsx:338-358` —
  `TN_ApiKeys` artboard:
  - `PageHeader` `title='API 金鑰'`,
    `subtitle='Live 與 sandbox · scope · last seen · 撤銷後永久不可復原'`,
    actions `API 文件` + `建立金鑰` (`:341-342`).
  - one-time-reveal `Banner(tone='info', icon='warn', title='只在建立當下顯示完整金鑰', body='關閉視窗後僅顯示 mask；遺失須重新建立。請務必妥善保存。')`
    (`:344`).
  - table columns `NAME / PREFIX / MASK / SCOPE / LAST / EXPIRES /
STATE` over `FX_KEYS` fixtures (`:346-353`).
- `docs/05-ui/drts-design-canvas/tenant-screens.jsx:17` — `TN_NAV` entry
  for `apikeys`; the runtime nav at `apps/tenant-console-web/lib/navigation.ts:66-70`
  matches with `href: "/api-keys"`, `label: "API Keys"`, sitting before
  `webhooks` (`:71-75`) inside the `Integrations` group — same order as
  the canvas.

---

## 5. Acceptance Checklist

This checklist restates the parent acceptance bar as auditable line items
that the parent reviewer (`Claude2`) already applied. All three bars were
satisfied at the second `review_approved` event
(`2026-05-12T14:19:22Z`); items below are pre-marked accordingly.

Legend: `[REQUIRED]` = explicit parent acceptance bar. `[DERIVED]` =
sidecar support gate for this packet. `[x]` = passed on the parent reviewer's
final pass; `[N/A]` = explicitly waived in the parent reviewer's notes.

### A. Tenant-console build/test gate `[REQUIRED]`

Parent acceptance line:
`pnpm --filter @drts/tenant-console-web typecheck / build / test`

- [x] `pnpm --filter @drts/tenant-console-web typecheck` passes against
      the working tree on commit `4d8ce97` (recorded in the commit's
      `Verification` trailer and re-run by Claude2 at the
      `2026-05-11T02:51:23Z` first approval and again on the
      `2026-05-12T14:19:22Z` re-approval).
- [x] `pnpm --filter @drts/tenant-console-web build` passes against the
      working tree on commit `4d8ce97` (same trailer + Claude2's reruns).
- [x] `pnpm --filter @drts/tenant-console-web test` exits 0 (no test
      files; recorded in every owner handoff and reviewer note).
- [x] `pnpm --filter @drts/tenant-console-web lint` passes (added during
      the reopen-#2 chain at `2026-05-11T02:08:46Z`; on the final round
      Claude2 confirmed lint/typecheck/build/test all green).

### B. Storybook parity gate `[REQUIRED]`

Parent acceptance line: `Storybook 對照對應 TN_* artboard`

- [N/A] `apps/tenant-console-web` has no `.storybook` configuration and
  no `storybook` package script; this is recorded on every owner
  handoff, in the commit's `Verification` trailer (`Storybook N/A:
apps/tenant-console-web has no .storybook`), and in the parent
  reviewer's `review_notes_zh` (`Storybook 對照不適用`). The Wave 3
  tenant-portal stories live under `packages/ui-web/src/`, not
  under this app, so a build-storybook gate would not be
  meaningful here. **The canvas/artboard side of parity is still
  anchored** — `TN_ApiKeys` (`tenant-screens.jsx:338`) and
  `Tenant Console.html#apikeys` provide the visual parity target
  the route mirrors (columns + one-time-reveal banner + scope/
  expiry/state semantics).

### C. Contract-boundary gate `[REQUIRED]`

Parent acceptance line:
`若 backend contract 缺，開 blocker 回 discussion_planning，不偷擴 contract`

- [x] Route reads only via existing `client.listApiKeys()` and
      `client.getTenantIntegrationGovernancePackage()` (`page.tsx:20-23`);
      no new client method is introduced.
- [x] Writes only via existing `client.issueApiKey({ keyName, scopes,
…expiresAt })` (`actions.ts:81-85`),
      `client.rotateApiKey(apiKeyId, { keyName?, scopes, …expiresAt })`
      (`actions.ts:122-126`), and `client.revokeApiKey(apiKeyId)`
      (`actions.ts:162`). No new client method is introduced.
- [x] No file under `packages/contracts/`, `packages/api-client/src/`,
      or `apps/api/src/modules/tenant-partner/` is modified by this task
      — verified via `git show --stat 4d8ce97`, which only lists
      `apps/tenant-console-web/app/api-keys/*` + `app/globals.css`.
- [x] The UI's scope option set is sourced from
      `governance.apiKeyPolicy.allowedScopes` (`api-key-manager.tsx:114,
:251-260`) and validated against `TENANT_API_KEY_ALLOWED_SCOPES`
      (`actions.ts:4, :21-25`). UI never presents a scope outside the
      governance-published list and never sends a scope outside the
      canonical enum.
- [x] Expiry handling never fabricates time (`actions.ts:48-66`); the
      UI does not pre-fill a client-derived default
      (`api-key-manager.tsx:234-247`); rotation preserves the stored
      `apiKey.expiresAt` raw ISO via hidden input
      (`api-key-manager.tsx:424-428`).
- [x] Plaintext key material lives only in the action return value and
      the client-island `useState` (`api-key-manager.tsx:103, :147-160`);
      no cookie, no `localStorage`, no `sessionStorage`. The reload-clears
      reveal semantics match `TN_ApiKeys` artboard wording
      ("關閉視窗後僅顯示 mask").
- [x] KPI counts derived from
      `resolveApiKeyStatus` / `isApiKeyUsable`
      (`api-key-manager.tsx:32-54, :109-113`); expired keys are excluded
      from `Active keys` and `Expiry` totals (closes reopen-#4).
- [x] No blocker ticket was opened against discussion_planning,
      consistent with the parent's "no contract expansion" guarantee
      and verified by `git diff` shape on commit `4d8ce97`.

### D. Sidecar handoff readiness `[DERIVED]`

- [x] This packet matches the current machine-truth owner/reviewer
      assignment for both the sidecar (owner=Claude, reviewer=Codex2) and
      the parent task (owner=Codex2, reviewer=Claude2).
- [x] This packet does not snapshot live parent `status` / `next` /
      `last_update` values as a replacement for `ai-status.json`; it
      records the most recent values as of generation only.
- [x] This packet records the parent reviewer's four-round failure chain
      with explicit working-tree fix anchors so the audit story stays
      traceable without re-running `git log` from scratch.
- [x] This packet does not edit canonical truth — the parent's
      working-tree files, the design canvas, the contract surfaces, and
      `ai-status.json` remain untouched by this sidecar.
- [x] This packet does not record `done` evidence for the parent task;
      that step is the parent owner's responsibility after
      `review_approved`. Owner has commit `4d8ce97` already pushed and
      is expected to finalize with
      `COMMIT_HASH=4d8ce97` / `COMMIT_SUBJECT=feat(TEN-UI-RD-017):
complete tenant api keys surface` / `PUSH_REMOTE=origin` /
      `PUSH_BRANCH=feat/claude2-ui-redesign-foundation`.

---

## 6. Reviewer Focus

For `Codex2` reviewing this sidecar:

- confirm the machine-truth anchor section (§2) matches the current
  `ai-status.json` fields for both `TEN-UI-RD-017-SIDECAR-REVIEW` and
  `TEN-UI-RD-017`, including the parent's `review_approved` state at
  `2026-05-12T14:19:22Z` and the reviewer reassignment from `Codex` to
  `Claude2` at `2026-05-11T02:43:30Z`.
- confirm the upstream dependency table (§3.A) matches `TEN-UI-RD-001`'s
  recorded `commit_hash` / `commit_recorded_at` / `commit_reviewer` and
  the branch presence assertion holds.
- confirm the implementation evidence map (§4) faithfully describes the
  five working-tree files (`page.tsx`, `api-key-manager.tsx`,
  `actions.ts`, `constants.ts`, `globals.css`) without smuggling in
  changes the parent did not make.
- confirm §4.7 reproduces the four reopen events without paraphrasing
  them away from the parent reviewer's wording, and that each finding is
  anchored to a concrete file/line in the current working tree at
  commit `4d8ce97`.
- confirm the acceptance checklist (§5) is a faithful expansion of the
  parent acceptance bar, with the Storybook line explicitly tagged
  `[N/A]` rather than silently dropped, matching the parent reviewer's
  written notes.
- confirm the packet remains support-only and does not modify the
  parent's implementation files, the design canvas, the contract
  surfaces, or `ai-status.json`.

For `Claude2` (the parent reviewer) — this packet is **not** the canonical
review of the parent task. Claude2's review already ran twice against the
parent working tree (`2026-05-11T02:51:23Z` and `2026-05-12T14:19:22Z`)
and approved. This packet is a stable companion document that captures the
evidence map and four-round rework history at handoff time.

For `Codex2` (the parent owner) — this packet is **not** the `done`
closeout. Codex2 still records `done` directly against
`ai-status.json → TEN-UI-RD-017` with
`COMMIT_HASH=4d8ce97f5e0e8256a8865ed77ec64da9d965fd74`,
`COMMIT_SUBJECT=feat(TEN-UI-RD-017): complete tenant api keys surface`,
`PUSH_REMOTE=origin`,
`PUSH_BRANCH=feat/claude2-ui-redesign-foundation`.

---

## 7. Handoff Summary

This sidecar packet is scoped as stable reviewer support material for the
Wave 3 tenant `API Keys` parity-fill slice. The parent task
`TEN-UI-RD-017` itself remains canonical; this packet is a reviewer
companion that:

- pins the five working-tree files and the contract surfaces they consume.
- records the parent owner's verifications and the explicit "no contract
  expansion" guarantee at the `4d8ce97` commit boundary.
- records the parent reviewer's four-round failure chain with verbatim
  reopen wording and working-tree fix anchors so the audit story stays
  traceable after the closeout.
- restates the three-line parent acceptance bar as an auditable checklist,
  including the `[N/A]` Storybook line that the parent reviewer explicitly
  waived because `apps/tenant-console-web` has no `.storybook` config.
- maps the parent's structural anchors (canvas artboard `TN_ApiKeys`,
  `TN_NAV` order, `Integrations` nav group, the published
  `TenantIntegrationGovernancePackage`).
- defers all transient parent lifecycle truth (`status`, `next`,
  `last_update`, future `commit_hash` / `push_*` confirmations) to
  `ai-status.json`.

The packet is consistent with the current post-approval machine truth:
the parent is in `review_approved`, the commit is pushed, and the parent
owner is expected to record `done` with the metadata above. After sidecar
review approval this packet is intended to remain in
`support/sidecars/TEN-UI-RD-017/` as a stable reference; it is not
absorbed into any other artifact and does not change canonical truth.
When the parent owner finalizes the parent's `done` closeout the packet's
evidence map will continue to read against the same set of files (since
the parent does not plan to mutate canvas, contracts, or any non-touched
file), so the packet does not need follow-up edits at parent-`done` time.
