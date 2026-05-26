# UI-BE-004-ADM SIDECAR REVIEW PACKET (Claude2 second pass)

Snapshot Type: parallel review-support packet, second-pass run by `Claude2`
Snapshot Captured At: 2026-05-26T12:50:00Z
Snapshot Status At Capture: parent `review`, sidecar `in_progress`
Parent Task: `UI-BE-004-ADM`
Parent Title: Search endpoint for platform-admin (cross-entity)
Parent Owner: `Codex2`
Parent Reviewer: `Gemini`
Parent Branch: `origin/codex2/ui-be-004-adm` (tip `fceee7d7`)
Sidecar Task: `UI-BE-004-ADM-SIDECAR-REVIEW`
Sidecar Owner: `Claude2`
Sidecar Reviewer: `Codex2`
Sidecar Branch: `claude2/ui-be-004-adm-sidecar-review` (base `origin/dev` @ `070f9aea`)

## Purpose

This is a Claude2-authored second-pass support packet for the parent task `UI-BE-004-ADM`. The supervisor's under-utilization daemon already spawned a previous `Claude`-authored packet (commit `eca9472c` on `origin/claude/ui-be-004-adm-sidecar-review`) that has not landed on `origin/dev`. Rather than restate that packet verbatim, this run:

- re-verifies the parent acceptance against the actual code at `fceee7d7`,
- adds freshness deltas that post-date the prior packet (chiefly UI-CL-003 client wiring),
- surfaces one concrete contract-shape concern between UI-CL-003's client method and the parent's grouped response, and
- restates the reviewer handoff with Claude2/Codex2 actors.

It does NOT modify canonical truth, runtime code, contracts, the parent task entry, or test fixtures. Output is restricted to the single markdown file under `support/sidecars/UI-BE-004-ADM/`.

## Scope Boundary

- Allowed: this markdown file only.
- Not allowed: edits to `apps/api/**`, `packages/**`, `ai-status.json`, the parent task branch, planning packets, or any canonical surface.
- This packet is reviewer-facing evidence. It does not pre-approve or pre-reject the parent task — that remains the parent reviewer Gemini's call.

## Machine-Truth Snapshot (re-read 2026-05-26T12:50Z)

- Parent task `UI-BE-004-ADM` in `ai-status.json`: `status=review`, `owner=Codex2`, `reviewer=Gemini`, `last_update=2026-05-25T09:38:31Z`. Recorded `next`: "Added GET /api/platform/search with grouped tenants/partners/users/adapter_registry/audit results. Verified with targeted vitest: tests/unit/search.service.test.ts and tests/unit/search.controller.test.ts."
- Sibling task `UI-BE-004-OPS`: `status=done`, last_update `2026-05-26T06:50:54Z`, finalize commit `f183d2085e2f` on `origin/codex/ui-be-004-ops` (not yet on `origin/dev`).
- Sibling task `UI-BE-004-TEN`: `status=done`, last_update `2026-05-26T10:10:31Z`, finalize commit `8c335f0f` on `origin/codex/ui-be-004-ten` (not yet on `origin/dev`).
- Downstream task `UI-CL-003` in `ai-status.json`: `status=backlog`, last_update `2026-05-25T09:31:29Z` — but `origin/codex2/ui-cl-003` already carries `7db5a71d feat(UI-CL-003): implement search methods for ops/platform/tenant` and `bdc3bae8 UI-CL-003: finalize realm search client methods`. This is a machine-truth drift for the orchestrator to reconcile; it is informational here, not a parent-task blocker.
- `origin/dev` tip is `070f9aea`. None of OPS / TEN / ADM is merged to `dev` yet; each task branch carries its own copy of `apps/api/src/modules/search/`.

Direct ancestry checks (run at snapshot time):

```
git merge-base --is-ancestor fceee7d7 origin/dev → ADM NOT merged
git merge-base --is-ancestor f183d208 origin/dev → OPS NOT merged
git merge-base --is-ancestor 8c335f0f  origin/dev → TEN NOT merged
git merge-base --is-ancestor bdc3bae8 origin/dev → UI-CL-003 NOT merged
```

## Parent Diff Re-Verification

Re-verified the parent diff base `origin/dev` → `origin/codex2/ui-be-004-adm` matches the prior packet's inventory (9 files, +581/-0). Anchors below are at `fceee7d7` unless noted.

| File | Verified anchor |
| --- | --- |
| `apps/api/src/modules/search/search.controller.ts` | `@Controller("platform")` line 8, `@Get("search")` line 12, throttle `READ_HEAVY_RATE_LIMIT` line 13, legacy `query` alias `q ?? query` line 19. |
| `apps/api/src/modules/search/search.service.ts` | `PlatformSearchCategory` union lines 13-18, `SearchService.search` entry line 33, grouped return shape lines 228-234, `buildResult` lines 247-275 (omits `secondaryLabel` when undefined). |
| `apps/api/src/modules/search/search.module.ts` | imports `PlatformAdminModule`, `TenantPartnerModule`, `AuditNotificationModule`; declares `SearchController`; provides `SearchService`. |
| `apps/api/src/common/auth/auth.policy.ts` | new branch lines 70-78 routes `GET platform/search` to `platform:search` / `foundation:read` / `baseAllowedRealms("platform")`. |
| `apps/api/src/modules/platform-admin/platform-admin.module.ts` | adds `exports: [PlatformAdminService, TenantsService]` so `SearchModule` can inject them (single-line additive change). |
| `apps/api/tests/unit/search.service.test.ts` | 3 cases: cross-entity grouping (line 73), case-insensitive adapter registry match `service.search("GRAB")` (line ~107), blank-query buckets (line ~123). |
| `apps/api/tests/unit/search.controller.test.ts` | 2 cases: envelope shape with `requestId` (line 6), legacy `query` alias activation (line 32). |
| `apps/api/tests/unit/auth-bootstrap.test.ts` | 2 cases anchored at lines 167 + 368: policy resolution for `GET /api/platform/search` and anonymous-reject via `AUTH_REQUIRED`/401. |

Pre-existing observations from the prior Claude packet that still hold:

1. The endpoint accepts `q` and the legacy `query` alias, but ignores any `types=` query parameter (no `Set`/allowlist for categories on this realm).
2. The response shape is a flat object `{ tenants, partners, users, adapter_registry, audit }`, each value a `SearchResultRecord[]`, distinct from the OPS sibling's `{ query, types, groups[], totalResults }` envelope.
3. `users` interleaves `platform_admin_user` and `tenant_user`. No sub-categorization.
4. The route is `@Controller("platform")` `@Get("search")` — final URL `/api/platform/search` per the auth-policy anchor.

## Second-Pass Acceptance Trace

| Acceptance bullet | Source | Status |
| --- | --- | --- |
| `GET /api/platform/search` returns `SearchResultRecord` grouped by category | `ai-status.json` task acceptance | met (controller `search.controller.ts:12`, service return shape `search.service.ts:228-234`). |
| `vitest` verification | `ai-status.json` task acceptance | met (`apps/api/tests/unit/search.service.test.ts`, `search.controller.test.ts` enumerated above). |
| Adds bootstrap policy entry for the new route | implicit from auth-bootstrap convention | met (`auth.policy.ts:70-78`, policy + anonymous-reject test cases in `auth-bootstrap.test.ts`). |
| `pnpm --filter @drts/api typecheck` recorded at closeout | sibling convention (OPS/TEN both recorded typecheck) | divergence — finalize commit `fceee7d7` `Verification:` trailer says only `pnpm --dir apps/api test -- tests/unit/auth-bootstrap.test.ts && pnpm --dir apps/api test -- tests/unit/search.controller.test.ts tests/unit/search.service.test.ts`. Reviewer may want owner to confirm typecheck before owner-closeout. |
| `types=` filter (planning sketch `?q=…&types=…`) | planning packet only, not ai-status | divergence — `search.controller.ts:14-22` does not read or forward `types`. Surfaced for Gemini. |

## Freshness Delta vs Prior Packet (post 2026-05-25T15:55Z)

The previous packet was captured before UI-CL-003 shipped a client. The relevant new evidence:

1. `origin/codex2/ui-cl-003` `7db5a71d` adds `searchOps`, `searchPlatform`, `searchTenant` to `packages/api-client/src/index.ts:1803-1825`. The new methods sit between `getReportingDailyOpsReport` and the `Platform Admin` section.
2. The client's `searchPlatform` reads:
   ```ts
   async searchPlatform(q: string, types?: string[]): Promise<SearchResultRecord[]> {
     const params = new URLSearchParams({ q });
     if (types?.length) params.set("types", types.join(","));
     const path = `/api/platform/search?${params.toString()}`;
     const result = await this.get<SearchResultRecord[] | ListEnvelope<SearchResultRecord>>(path);
     return Array.isArray(result) ? result : (result.items ?? []);
   }
   ```
3. `ApiClient.request<T>` already unwraps `envelope.data` (`packages/api-client/src/index.ts:398-399`), so `this.get<T>(path)` resolves to the inner `data` payload. For the parent endpoint that payload is `Record<PlatformSearchCategory, SearchResultRecord[]>`, e.g. `{ tenants: [...], partners: [...], users: [...], adapter_registry: [...], audit: [...] }`.
4. Consequence: at runtime, `result` is the grouped object. `Array.isArray(result)` is `false`. `(result as any).items` is `undefined`. The method always returns `[]` against the parent endpoint as currently shipped.
5. The same shape mismatch applies to `searchOps` and `searchTenant` if those endpoints likewise return grouped objects (the prior packet noted OPS uses `{ query, types, groups[], totalResults }`, and TEN groups by category as well — neither is a flat array, neither has an `items` field).

This is not a parent-task acceptance failure — the parent task acceptance only references the endpoint and the vitest coverage, both of which are met. It is a cross-task wiring concern that surfaces only because UI-CL-003 made downstream assumptions that diverge from the actual server contract.

Suggested handling (informational for reviewer, not a unilateral instruction):

- option A: keep the parent endpoint shape, and revisit UI-CL-003 to either flatten on the client side or expose a `searchPlatformGrouped()` return type.
- option B: change the parent endpoint to a list-envelope or a discriminated record so the client's flat-array assumption holds.
- option C: punt to a follow-up task once Gemini approves the parent, since the parent acceptance bullets are met today and the wiring fix sits naturally in a UI-CL-003 follow-up rather than in a UI-BE-004-ADM amendment.

## Parity Check vs UI-BE-004-OPS / UI-BE-004-TEN (re-confirmed)

The prior packet's matrix still holds at second pass. The only newly confirmed point: OPS and TEN siblings both reported typecheck in their closeout `next` blurbs but the ADM finalize commit's `Verification:` trailer did not include typecheck. Flagged as `divergence — flag for Gemini` in the acceptance trace above.

## Test Evidence Re-Confirmation

Re-read the three test files at `fceee7d7` and confirmed:

- `search.service.test.ts` covers the three behavioural arcs (cross-entity grouping, case-insensitive adapter match, blank-query empty buckets). It does NOT cover the `secondaryLabel`-omitted code path, the `q ?? query` precedence for an empty `q`, or the `users` bucket order when both `platform_admin_user` and `tenant_user` results match.
- `search.controller.test.ts` covers envelope shape and alias activation. It does NOT cover passing both `q` and `query` simultaneously, nor the throttle decoration.
- `auth-bootstrap.test.ts` adds 2 cases at lines 167 and 368 that fully cover policy resolution + anonymous reject for `/api/platform/search`.

The prior packet captured the same gaps; second pass confirms nothing has shifted.

## Reviewer Focus List (for Gemini)

Carrying forward from the prior packet and adding the freshness delta. Items are spot-checks, not asks to block on:

1. **Carry-over** — Does the absent `types=` filter (planning sketch) block parent approval, or is it a UI-CL-003 follow-up?
2. **Carry-over** — Is the realm restriction (`platform` only, no `ops`) correct for cross-entity platform-admin search?
3. **Carry-over** — Are the link routes (`/tenants/{id}`, `/partners/{slug}`, `/users/{id}`, `/tenants/{id}/users/{id}`, `/adapter-registry/{code}`, `/audit?auditId={id}`) the canonical platform-admin SPA routes?
4. **Carry-over** — Is the interleaved `users` bucket (platform_admin_user + tenant_user) the desired grouping per Q-X07?
5. **Carry-over** — Should owner-closeout require `pnpm --filter @drts/api typecheck` evidence to mirror OPS/TEN siblings?
6. **NEW (freshness)** — Awareness item: UI-CL-003 `searchPlatform()` already shipped at `bdc3bae8` and assumes a flat `SearchResultRecord[] | ListEnvelope<...>` server response. Against the grouped response shape this method returns `[]`. Decide whether to land a follow-up that aligns the client or the server, or to defer to a separate task. The parent's acceptance bullets do not require the client to work; they require the endpoint to return grouped records, which it does.
7. **NEW (orchestrator hygiene)** — `UI-CL-003` ai-status entry is still `backlog` despite the finalize commit landing. Worth a separate ai-status reconciliation outside this packet.

## Evidence Anchors (post-2026-05-26T12:50Z verification)

- `ai-status.json` — parent record for `UI-BE-004-ADM` (status `review`).
- `apps/api/src/modules/search/search.controller.ts:8-22` (at `fceee7d7`) — controller surface, throttle, alias.
- `apps/api/src/modules/search/search.service.ts:13-18, :33-228, :228-234, :247-275` (at `fceee7d7`) — categories, search entry, grouped return, builder.
- `apps/api/src/modules/search/search.module.ts` (at `fceee7d7`) — module composition.
- `apps/api/src/common/auth/auth.policy.ts:70-78` (at `cc66e5c4`/`fceee7d7`) — bootstrap policy entry.
- `apps/api/src/modules/platform-admin/platform-admin.module.ts:27` (at `fceee7d7`) — added module exports.
- `apps/api/tests/unit/search.service.test.ts` (at `fceee7d7`) — service test cases.
- `apps/api/tests/unit/search.controller.test.ts` (at `fceee7d7`) — controller test cases.
- `apps/api/tests/unit/auth-bootstrap.test.ts:167, :368` (at `fceee7d7`) — policy + anonymous-reject.
- `packages/api-client/src/index.ts:1803-1825` (at `7db5a71d`) — UI-CL-003 search client methods.
- `packages/api-client/src/index.ts:398-399` (at `origin/dev` baseline) — envelope unwrap inside `request<T>`.
- `support/sidecars/UI-BE-004-ADM/UI-BE-004-ADM-SIDECAR-REVIEW.md` (at `eca9472c`, on `origin/claude/ui-be-004-adm-sidecar-review`) — prior packet; not on `origin/dev`.

## Sidecar Closeout Plan

- Sidecar branch: `claude2/ui-be-004-adm-sidecar-review`, base `origin/dev` @ `070f9aea`.
- Worktree: `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/claude2-ui-be-004-adm-sidecar-review`.
- Single new file: `support/sidecars/UI-BE-004-ADM/UI-BE-004-ADM-SIDECAR-REVIEW.md`.
- No other files touched. `git diff --check origin/dev...HEAD -- support/sidecars/UI-BE-004-ADM/` should be the only delta.

## Reviewer Handoff Commands

This sidecar slice uses `AI_NAME=Claude2` for the owner and `AI_NAME=Codex2` for the reviewer.

Owner handoff (Claude2 → Codex2):

```
AI_NAME=Claude2 scripts/ai-status.sh handoff UI-BE-004-ADM-SIDECAR-REVIEW Codex2 \
  "Second-pass review packet drafted under support/sidecars/UI-BE-004-ADM/UI-BE-004-ADM-SIDECAR-REVIEW.md: re-verified parent diff at fceee7d7, added freshness delta against UI-CL-003 7db5a71d/bdc3bae8, surfaced client/server shape mismatch (searchPlatform returns [] against grouped response), restated reviewer focus list. Canonical truth untouched."
```

Reviewer approve (Codex2):

```
AI_NAME=Codex2 scripts/ai-status.sh approve UI-BE-004-ADM-SIDECAR-REVIEW \
  "Reviewed Claude2 second-pass packet: anchors check, freshness delta against UI-CL-003 is fair, contract-mismatch is correctly framed as informational, no canonical truth modified."
```

Owner closeout (Claude2, after `review_approved`):

```
AI_NAME=Claude2 \
  COMMIT_HASH=<sha> COMMIT_SUBJECT="UI-BE-004-ADM-SIDECAR-REVIEW: land Claude2 second-pass review packet" \
  PUSH_REMOTE=origin PUSH_BRANCH=claude2/ui-be-004-adm-sidecar-review \
  scripts/ai-status.sh done UI-BE-004-ADM-SIDECAR-REVIEW \
  "Claude2 second-pass sidecar review packet landed; canonical truth untouched; parent UI-BE-004-ADM review remains owned by Gemini."
```

## Local Verification For This Sidecar Slice

- Confirm only `support/sidecars/UI-BE-004-ADM/UI-BE-004-ADM-SIDECAR-REVIEW.md` changed for this task.
- Run `git diff --check origin/dev...HEAD -- support/sidecars/UI-BE-004-ADM/`.
- Spot-check the anchor lines above against `origin/codex2/ui-be-004-adm` (parent runtime + tests) and `origin/codex2/ui-cl-003` (client methods).
- The sidecar does not run `pnpm typecheck` or `vitest`; those are the parent task's responsibility on `origin/codex2/ui-be-004-adm`.
