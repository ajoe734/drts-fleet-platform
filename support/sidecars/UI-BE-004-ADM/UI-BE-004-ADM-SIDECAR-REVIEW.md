# UI-BE-004-ADM SIDECAR REVIEW PACKET

Snapshot Type: parallel review-support packet built from `ai-status.json` and the parent task branch
Snapshot Captured At: 2026-05-25T15:55:00Z
Snapshot Status At Capture: `review`
Parent Task: `UI-BE-004-ADM`
Parent Title: Search endpoint for platform-admin (cross-entity)
Parent Owner: `Codex2`
Parent Reviewer: `Gemini`
Parent Branch: `origin/codex2/ui-be-004-adm` (tip `fceee7d7`)
Sidecar Owner: `Claude`
Sidecar Reviewer: `Codex2`

## Purpose

This packet is a parallel sidecar support artifact for the in-flight review of `UI-BE-004-ADM`. It bundles:

- a focused implementation summary (file/line anchors),
- an acceptance trace against the planning packet,
- a parity check against the already-merged OPS and TEN cousins,
- a contract-conformance pass against Q-X07 / Q-X08,
- an auth/policy review of the new bootstrap route, and
- a reviewer-focus list of small nits worth confirming before approve.

It does NOT modify canonical truth, runtime code, contracts, the parent task entry, or test fixtures. It is read-only support material to compress reviewer effort and to help the parent owner (Codex2) line up evidence for closeout once the parent reviewer (Gemini) approves.

## Scope Boundary

- Allowed: this single markdown file under `support/sidecars/UI-BE-004-ADM/`.
- Not allowed: edits to `apps/api/**`, `packages/contracts/**`, `ai-status.json`, the parent task branch, planning packets, or any other canonical surface.
- The sidecar must not anticipate parent approval — its job is to surface review-ready evidence, not to claim conclusions for Gemini.

## Machine-Truth Snapshot

- `ai-status.json` is authoritative; this markdown is only a reviewer-facing snapshot.
- Parent task `UI-BE-004-ADM`: `status=review`, `owner=Codex2`, `reviewer=Gemini`, `last_update=2026-05-25T09:38:31Z`, recorded next-step: "Added GET /api/platform/search with grouped tenants/partners/users/adapter_registry/audit results. Verified with targeted vitest: tests/unit/search.service.test.ts and tests/unit/search.controller.test.ts."
- Sibling task `UI-BE-004-OPS`: `done`, commit `f183d2085e2fd62768df03196a380e06e97bdebc` on `origin/codex/ui-be-004-ops`.
- Sibling task `UI-BE-004-TEN`: `done`, commit `9394612112841d78ebd7546062fb1e4f5f234b9d` on `origin/codex/ui-be-004-ten`.
- Planning anchor: `docs/03-runbooks/phase1-ui-implementation-wave-planning-20260525.md:73-75` lists the three search endpoints as a Layer-1 batch; `UI-BE-004-ADM` row at line 74 sketches the contract as `GET /api/platform/search?q=…&types=…`.

## Parent Diff Inventory

Diff base: `origin/dev` → `origin/codex2/ui-be-004-adm` (3 commits, 9 files, +581/-0).

| File | Lines added | Purpose |
| --- | --- | --- |
| `apps/api/src/app.module.ts` | +2 | Wire `SearchModule` into the Nest root composition. |
| `apps/api/src/common/auth/auth.policy.ts` | +9 | New bootstrap route policy for `GET /api/platform/search` (`platform:search` route key, `foundation:read` scope, `system`+`platform` realms). |
| `apps/api/src/modules/platform-admin/platform-admin.module.ts` | +1 | Export `PlatformAdminService` and `TenantsService` so the new `SearchModule` can inject them. |
| `apps/api/src/modules/search/search.controller.ts` | +24 | New `@Controller("platform")` with `GET search` plus the legacy `query` alias and `x-request-id` echo. |
| `apps/api/src/modules/search/search.module.ts` | +14 | Compose `PlatformAdminModule`, `TenantPartnerModule`, `AuditNotificationModule` and register the controller/service. |
| `apps/api/src/modules/search/search.service.ts` | +301 | Pure cross-entity match across 5 categories with grouped result shape. |
| `apps/api/tests/unit/auth-bootstrap.test.ts` | +36 | Two new cases: policy resolution for `GET /api/platform/search` and anonymous rejection (`AUTH_REQUIRED`/401). |
| `apps/api/tests/unit/search.controller.test.ts` | +52 | Envelope shape + legacy `query` alias coverage. |
| `apps/api/tests/unit/search.service.test.ts` | +142 | Cross-entity grouping, case-insensitive adapter-registry match, blank-query empty buckets. |

## Acceptance Trace

Planning-packet acceptance for `UI-BE-004-ADM` (row 74): "`GET /api/platform/search?q=…&types=…`" and the ai-status acceptance "`GET /api/platform/search returns SearchResultRecord grouped by category; vitest`".

| Acceptance bullet | Implementation evidence | Status |
| --- | --- | --- |
| `GET /api/platform/search` exists | `apps/api/src/modules/search/search.controller.ts:9-22` | met |
| Cross-entity scope covers tenants, partners, users, adapter registry, audit | `apps/api/src/modules/search/search.service.ts:14-22` (`PlatformSearchCategory` union) and `:36-202` (per-category builders) | met |
| Returns `SearchResultRecord` shape | `apps/api/src/modules/search/search.service.ts:215-244` (`buildResult` produces the exact contract shape from `packages/contracts/src/ui-runtime.ts:294-302`) | met |
| Grouped by category (not flat list per Q-X08) | `apps/api/src/modules/search/search.service.ts:203-211` returns a `Record<PlatformSearchCategory, SearchResultRecord[]>` keyed by category | met |
| `vitest` covers cross-entity + grouping | `apps/api/tests/unit/search.service.test.ts:62-104` (cross-entity), `:106-119` (adapter registry case-insensitive), `:121-129` (blank-query buckets); `apps/api/tests/unit/search.controller.test.ts:6-31` (envelope), `:33-48` (alias) | met |
| `types=…` query-param filter (planning sketch only) | NOT IMPLEMENTED on the platform endpoint. See parity note below. | divergence — flag for Gemini |

The `ai-status.json` acceptance string does not mention `types=`; only the planning-packet contract sketch does. Whether this counts as a blocker is a reviewer judgement call, captured in §"Reviewer Focus List" below.

## Parity Check vs UI-BE-004-OPS and UI-BE-004-TEN

Both sibling endpoints are already merged (`done`); cross-referencing their shape clarifies what "in-family" looks like:

| Aspect | OPS (`UI-BE-004-OPS`) | TEN (`UI-BE-004-TEN`) | ADM (this task) |
| --- | --- | --- | --- |
| Route | `@Controller("ops")` → `GET search` | `@Controller()` → `GET tenant/search` | `@Controller("platform")` → `GET search` |
| `q` query param | yes | yes (default `""`) | yes |
| Legacy `query` alias | no | no | yes (`q ?? query`) |
| `types=` query filter | yes (`OPS_SEARCH_CATEGORIES`, `resolveTypes`) | yes (`parseTenantSearchTypes`) | NO |
| Tenant-scoping header | n/a | `x-tenant-id` (required, 400 if missing) | n/a (platform-realm only) |
| `x-request-id` echo | yes | yes | yes |
| Throttle | `READ_HEAVY_RATE_LIMIT` | `READ_HEAVY_RATE_LIMIT` | `READ_HEAVY_RATE_LIMIT` |
| Response envelope | `toApiSuccessEnvelope` | `toApiSuccessEnvelope` | `toApiSuccessEnvelope` |
| Result wrapper | `{ query, types, groups[], totalResults }` | per-tenant grouped object | flat `Record<category, SearchResultRecord[]>` |
| Scoring / limit | yes (`MatchedCandidate.score`) | n/a (smaller surface) | no |
| Bootstrap auth policy | OPS realms (`ops`/`system`) | tenant realms | `platform:search` / `foundation:read` / `[system, platform]` |

Observations:

1. The ADM endpoint is the only one in the family that lacks a `types=` query filter even though the planning packet lists `?q=…&types=…` for all three. Per Q-X08 ("Result categories must NOT be mixed into a single flat list"), the response shape is still grouped, so missing the filter does not violate the contract — but UI-CL-003 (`searchPlatform`) is the next downstream task and may want to pass `types=` for parity with `searchOps`/`searchTenant`.
2. The ADM response wrapper differs from OPS's `{ query, types, groups[], totalResults }`. The contract (`packages/contracts/src/ui-runtime.ts:294-302`) only constrains the per-record shape, not the wrapper, so the ADM choice is defensible — but reviewers should confirm UI-CL-003 will not be forced to special-case parsing per realm.
3. The legacy `query` alias is unique to ADM. It is harmless but worth noting because callers passing `?q=&query=acme` will hit the empty-string short-circuit (`q ?? query` keeps `""`); this is the same precedence rule already exercised by `:33-48` of the controller test (which only tests the alias when `q` is `undefined`, not the empty-string corner). Not blocking — surfacing for transparency.

## Contract Conformance (Q-X07 / Q-X08)

- `SearchResultRecord` fields produced (`apps/api/src/modules/search/search.service.ts:215-244`): `category`, `resourceType`, `resourceId`, `primaryLabel`, optional `secondaryLabel`, `link`, `matchedFields`. Matches `packages/contracts/src/ui-runtime.ts:294-302` exactly; `secondaryLabel` is omitted when `joinSecondaryLabel` produces no value, honoring the optional property.
- `CrossAppResourceLink` builders (`apps/api/src/modules/search/search.service.ts:246-260`) consistently set `targetApp: "platform-admin"`, `openMode: "new_tab"`, plus typed `resourceType`/`resourceId`/`route`/`label`. The route values (`/tenants/{id}`, `/partners/{slug}`, `/users/{id}`, `/tenants/{id}/users/{id}`, `/adapter-registry/{code}`, `/audit?auditId={id}`) are plausible platform-admin app routes; whether they match the actual frontend routes is a Q to confirm against the canvas spec, but this is outside the parent task's acceptance.
- Q-X07 (per-app scope): platform-admin scope is "tenants, partners, users, adapter registry, audit events." Implementation enumerates exactly these five buckets via `PlatformSearchCategory` (`apps/api/src/modules/search/search.service.ts:14-22`). met.
- Q-X08 (no flat-list mixing): response is a `Record<PlatformSearchCategory, SearchResultRecord[]>` — categories never collide. met.

## Auth / Policy Review

- Route policy added at `apps/api/src/common/auth/auth.policy.ts:70-78`:
  ```ts
  {
    routeKey: "platform:search",
    requiredScopes: ["foundation:read"],
    allowedRealms: ["system", "platform"],
    description: "Platform cross-entity search",
  }
  ```
- `baseAllowedRealms("platform")` correctly excludes `ops` and tenant realms — appropriate for platform-admin-only cross-entity search.
- `foundation:read` is the scope used elsewhere for read-only platform foundation surfaces; matches `audit:list` and partner-eligibility convention.
- New `auth-bootstrap` cases (`apps/api/tests/unit/auth-bootstrap.test.ts:166-173`, `:363-385`) lock in (a) the resolver returns the exact policy object and (b) anonymous `GET /api/platform/search?q=acme` is rejected with `ApiRequestError` (status 401, code `AUTH_REQUIRED`). These tests are well-targeted.
- No new scope was introduced; no migration to platform-admin role bindings is required.

## Module-wiring Sanity

- `apps/api/src/modules/platform-admin/platform-admin.module.ts:27` adds `exports: [PlatformAdminService, TenantsService]`. `PlatformTenantGovernanceService` is intentionally not re-exported — `SearchService` does not consume it. This export change is additive and does not affect existing importers.
- `apps/api/src/modules/search/search.module.ts:7-13` imports `PlatformAdminModule`, `TenantPartnerModule`, `AuditNotificationModule`. `TenantPartnerModule` already exports `TenantPartnerService` (confirmed by the fact that the OPS and TEN search services use the same import path with no diff to the source module on the parent branch).
- `apps/api/src/app.module.ts:42` and `:67` add the `SearchModule` import + registration in a position consistent with alphabetical-ish ordering already in the file.

## Test Evidence Summary

- `apps/api/tests/unit/search.service.test.ts` (3 cases):
  - `"returns category-grouped cross-entity search results"` — exercises tenants (`code`+`name` match), partners (`entry_slug`/`display_name`/`program_id`/`program_code`), users (tenant_user `email`/`display_name`), audit (`resource_id`).
  - `"matches adapter registry entries case-insensitively"` — uses `service.search("GRAB")` and asserts a registry entry with `resourceId: "grab"`. This proves `query.toLowerCase()` plus per-field `.toLowerCase().includes(query)` work.
  - `"returns empty grouped buckets for blank queries"` — whitespace-only `"   "` returns all five empty arrays. Covers the early-return at `search.service.ts:34-37`.
- `apps/api/tests/unit/search.controller.test.ts` (2 cases):
  - Envelope shape with `requestId` echoed into `meta`.
  - Legacy `query` alias activates when `q` is `undefined`.
- `apps/api/tests/unit/auth-bootstrap.test.ts` (2 added cases): policy resolution and anonymous rejection (see Auth section above).

Coverage adequate for the acceptance bullets that are actually claimed in `ai-status.json`. Gaps below are observations, not blockers:

- No test exercises the controller code path where both `q` and the legacy `query` are present at the same time (precedence of `q ?? query`).
- No test asserts that `platform_admin_user` results land in the same `users` bucket as `tenant_user` results.
- No test exercises the case where `joinSecondaryLabel` returns `undefined` (and therefore `secondaryLabel` is omitted from the record).

## Reviewer Focus List (for Gemini)

These are spot-checks Gemini may want to confirm before approving the parent task:

1. Does the absent `types=` query param matter for the planning-packet contract sketch (`?q=…&types=…`)? If yes, it likely needs a follow-up task before UI-CL-003 starts; if no, the divergence can be tracked in the planning packet's "actuals" column rather than as a parent-task blocker.
2. Is the realm restriction (`platform` only) correct for the platform admin search, given that the OPS audit endpoint uses `[platform, ops]`? Confirm that platform admin search is not expected to be reachable from the ops realm.
3. Are the link routes (`/tenants/{id}`, `/partners/{slug}`, `/users/{id}`, `/tenants/{id}/users/{id}`, `/adapter-registry/{code}`, `/audit?auditId={id}`) the canonical platform-admin SPA routes? If not, follow-up needed during UI-FE-ADM.
4. The `users` bucket interleaves `platform_admin_user` and `tenant_user`. Confirm this is the expected grouping (vs. surfacing two sub-categories) per Q-X07's per-app scope sentence.
5. The acceptance evidence claim in `ai-status.json` lists vitest tests but does not enumerate `pnpm --filter @drts/api typecheck`. The OPS and TEN siblings both recorded typecheck in their closeout `next` field. Reviewer may want owner to confirm a clean typecheck before owner-closeout.

## Evidence Anchors

- `ai-status.json` — parent record block for `UI-BE-004-ADM` (status `review`, owner `Codex2`, reviewer `Gemini`).
- `docs/03-runbooks/phase1-ui-implementation-wave-planning-20260525.md:73-75` — Layer-1 search-endpoint planning row.
- `docs/03-runbooks/phase1-ui-implementation-wave-planning-20260525.md:90` — UI-CL-003 downstream dependency on `UI-BE-004-OPS, UI-BE-004-ADM, UI-BE-004-TEN`.
- `packages/contracts/src/ui-runtime.ts:277-302` — Q-X07 / Q-X08 + `SearchResultRecord` definition.
- `apps/api/src/modules/search/search.controller.ts:9-22` (parent branch) — controller surface.
- `apps/api/src/modules/search/search.service.ts:14-22, :36-202, :203-244` (parent branch) — categories, builders, response shape.
- `apps/api/src/modules/search/search.module.ts:1-14` (parent branch) — module wiring.
- `apps/api/src/common/auth/auth.policy.ts:70-78` (parent branch) — new bootstrap policy.
- `apps/api/src/modules/platform-admin/platform-admin.module.ts:27` (parent branch) — added module exports.
- `apps/api/tests/unit/search.service.test.ts:62-129` (parent branch) — service test cases.
- `apps/api/tests/unit/search.controller.test.ts:6-48` (parent branch) — controller test cases.
- `apps/api/tests/unit/auth-bootstrap.test.ts:166-173, :363-385` (parent branch) — auth policy + anonymous-reject tests.

All "(parent branch)" anchors live on `origin/codex2/ui-be-004-adm` and are not yet on `origin/dev` at the time of this snapshot.

## Sibling Closeout Reference

Reviewer can compare against the two already-merged siblings:

- `UI-BE-004-OPS` — commit `f183d2085e2fd62768df03196a380e06e97bdebc` on `origin/codex/ui-be-004-ops`. Typecheck + vitest both run on closeout.
- `UI-BE-004-TEN` — commit `9394612112841d78ebd7546062fb1e4f5f234b9d` on `origin/codex/ui-be-004-ten`. Verified with `git diff --check`, vitest search unit tests, and `pnpm typecheck`.

## Reviewer Handoff Commands

This sidecar task uses `AI_NAME=Claude` for owner actions and `AI_NAME=Codex2` for reviewer actions.

Owner handoff (Claude → Codex2):

```
AI_NAME=Claude scripts/ai-status.sh handoff UI-BE-004-ADM-SIDECAR-REVIEW Codex2 \
  "Review packet drafted under support/sidecars/UI-BE-004-ADM/UI-BE-004-ADM-SIDECAR-REVIEW.md: diff inventory, acceptance trace, parity check vs OPS/TEN, contract conformance, auth-policy review, test evidence summary, and reviewer focus list. Canonical truth untouched."
```

Reviewer approve (Codex2):

```
AI_NAME=Codex2 scripts/ai-status.sh approve UI-BE-004-ADM-SIDECAR-REVIEW \
  "Reviewed: packet is UI-BE-004-ADM-specific, anchors are accurate, parity divergences are surfaced not silently resolved, no canonical truth was modified."
```

Owner closeout (Claude, after `review_approved`): this is a sidecar/support task; `NO_COMMIT_REQUIRED=1` is allowed per AI_COLLABORATION_GUIDE §5. The owner will still record `COMMIT_HASH`/`PUSH_REMOTE`/`PUSH_BRANCH` because the packet is committed and pushed for traceability:

```
AI_NAME=Claude NO_COMMIT_REQUIRED=1 \
  COMMIT_HASH=<sha> COMMIT_SUBJECT="UI-BE-004-ADM-SIDECAR-REVIEW: land review packet" \
  PUSH_REMOTE=origin PUSH_BRANCH=claude/ui-be-004-adm-sidecar-review \
  scripts/ai-status.sh done UI-BE-004-ADM-SIDECAR-REVIEW \
  "Sidecar review packet landed; canonical truth untouched; parent UI-BE-004-ADM review remains owned by Gemini."
```

## Local Verification For This Sidecar Slice

- Confirm only `support/sidecars/UI-BE-004-ADM/UI-BE-004-ADM-SIDECAR-REVIEW.md` changed for this task.
- Run `git diff --check origin/dev...HEAD -- support/sidecars/UI-BE-004-ADM/`.
- Spot-check the anchor lines listed above against `origin/codex2/ui-be-004-adm` for the parent-branch files and against `origin/dev` for the contract/planning anchors.
- The sidecar does not run `pnpm typecheck` or `vitest`; those are the parent task's responsibility on `origin/codex2/ui-be-004-adm`.
