# UI17-MAP-20260924 Planning Decision

Helper: `UI17-MAP-20260924-UNBLOCK-PLANNING-DECISION` (task_class=unblock, helper_kind=planning_decision)
Parent blocker resolved: Gemini2 `blocker` note at 2026-09-26T11:48:42Z on candidate
`f7c432c755c138f1f43d12a9ebbd209e40f89efc` (PR #2130), citing three unresolved
product/contract questions:

1. Partner test seam fix (acme alias in `tests/e2e/mock-map-booking-authority-server.mjs`)
   is unauthorized in current `write_scopes`.
2. Concierge/Partner E2E outage/recovery assertions need an authorized test seam;
   the production component reads `createConfiguredMockAddressProvider` from a
   build-time env var, and a runtime session/query override was already rejected
   as an unauthorized security regression (R37, two adjacent Codex2 reviews).
3. Canvas token resolution (`--slate-*` etc.) — Partner Booking Web.html has no
   `buildMgmtTheme`, so it is unclear which existing token ramp the map-picker
   canvas edit should use.

## Decision 1 — Partner Booking canvas colors: no new token layer, reuse the existing raw hex ramp

Evidence read at `f7c432c755c138f1f43d12a9ebbd209e40f89efc`:

- `docs/05-ui/drts-design-canvas/Partner Booking Web.html` mounts the `PB_*`
  family (`design-canvas.jsx` / `pb-screens.jsx` / `pb-states.jsx` /
  `pb-receipts.jsx` / `pb-embed.jsx`) via `DesignCanvas`/`IOSDevice`. It has
  never used `buildMgmtTheme` and defines no `:root` CSS custom properties.
  `buildMgmtTheme` (`docs/05-ui/drts-design-canvas/mgmt-tokens.jsx:109`) is used
  only by the management-console family: Compliance/Bank/Fleet Partner
  Portal/Ops/Platform Admin/ROC/**Tenant** Console — Partner Booking is not a
  member of that family and is not expected to become one for this task.
- Existing `PB_*` components already hard-code the exact color values in
  question, e.g. `pb-states.jsx:56,60,69,77,78,84,86,131,134`:
  `#56657F`, `#0E1424`, `#9CA3AF`, `#F0FDF4`, `#BBF7D0`, `#15803D`.
- `docs/05-ui/drts-design-canvas/map-picker-integrations.jsx:107` (in
  `PB_BookCardMap`) introduces
  `th = { text:'var(--slate-900, #0E1424)', ..., success:'var(--green-700, #15803D)', warn:'var(--amber-700, #B45309)', danger:'var(--red-700, #B91C1C)', dangerBg:'var(--red-50, #FEF2F2)' }`.
  None of `--slate-900`, `--green-700`, `--amber-700`, `--red-700`, `--red-50`
  are defined anywhere in the Partner canvas or its dependencies, so every one
  of these `var()` calls always resolves to its literal fallback — the
  fallback values are exactly the same hex values already used elsewhere in
  the PB family. The indirection is dead weight, not a real token system.
- It also caused a live regression: `map-picker-integrations.jsx:122,124` build
  `border:\`1px solid ${th.danger}40\`` for an alpha-blended border. With
  `th.danger` now the string `var(--red-700, #B91C1C)`, string concatenation
  produces the invalid CSS value `var(--red-700, #B91C1C)40`. The file's own
  established alpha convention elsewhere (e.g. the accent banner a few lines
  below: `border:'1px solid '+p.accent+'40'`) only works with a plain 6-digit
  hex literal, producing a valid 8-digit hex-alpha string.

**Decision:** `map-picker-integrations.jsx:107` must use plain hex literals —
the same values already used across `pb-states.jsx`/`pb-screens.jsx` — instead
of `var(--token, fallback)` wrapping:

```js
const th = { text:'#0E1424', textMuted:'#56657F', textDim:'#9AA5B8', border:'#E5E7EB', surface:'#fff', surfaceLo:'#F4F6FB', accent:p.primary, success:'#15803D', warn:'#B45309', danger:'#B91C1C', dangerBg:'#FEF2F2' };
```

This is a scope cut, not new design work: no new token/CSS-variable layer is
introduced, `buildMgmtTheme` stays scoped to the management-console family,
and the `${th.danger}40` alpha bug is fixed as a side effect of removing the
`var()` wrapper. File is already in `write_scopes`; no scope change needed for
this decision.

## Decision 2 — Authorized test-only seam for Concierge/Partner outage assertions, plus fixture scope

Evidence read at `f7c432c755c138f1f43d12a9ebbd209e40f89efc` and the two adjacent
Codex2 reopen reviews (06:44:14Z, 11:29:06Z on the SAME R37/R7b/R7c trigger):

- `apps/concierge-portal-web/app/bookings/new/page.tsx:126-133` and the Partner
  equivalent resolve their address provider via
  `createConfiguredMockAddressProvider(process.env.NEXT_PUBLIC_ADDRESS_PICKER_PROVIDER_MODE ?? "healthy")`,
  an in-memory mock with **zero network calls** (reviewer's real-provider
  replay measured `fetchCount=0` for every mode). Playwright's `page.route`
  HTTP interception has nothing to intercept for this path.
- Tenant's own outage test (`tests/e2e/tenant-map-booking-ui.spec.ts:214-220`)
  instead mocks a real network call, `page.route("**/api/geo/health", ...)`,
  because Tenant's flow checks an actual backend-shaped health endpoint. That
  is why Tenant's outage/degraded E2E cases already pass and Concierge/Partner's
  do not — the two surfaces use different provider integrations, not a test
  bug.
- A previous candidate tried to fix this by reading the provider mode from a
  public URL query/session parameter at runtime in production code. Two
  independent Codex2 reviews rejected that as R37: it let an unauthenticated
  visitor silently clear a configured outage and bypass the manual-review
  gate. That fix is already reverted and must not be reintroduced.
- The task's own acceptance criteria explicitly forbid changing "地圖
  provider、API 或 schema" (`docs/04-uat/...` acceptance list item 3) — so
  rearchitecting Concierge/Partner onto a networked provider like Tenant's, to
  make it mockable the same way, is out of scope for this task, not just
  undesirable right now.

**Decision:** the only remaining safe seam is a build-time one, confined to
test infrastructure: add a second Playwright project/webServer per affected
surface that starts `next dev` with
`NEXT_PUBLIC_ADDRESS_PICKER_PROVIDER_MODE=unavailable` (or `degraded`) on a
separate port, used only by the outage/recovery test case(s) in
`concierge-map-booking-ui.spec.ts` / `partner-map-booking-ui.spec.ts`. Tenant
needs no such change. No production source file changes — the env var is
already read by existing production code; only test config plumbs a second
value into a second process.

Authorized `write_scopes` additions for `UI17-MAP-20260924` (recorded on the
parent task via `ai-status.sh assign` metadata below):

- `playwright.concierge-map-booking.config.ts`
- `playwright.partner-booking-surfaces.config.ts`
- `tests/e2e/mock-map-booking-authority-server.mjs` — already diffed at
  `f7c432c75`: a one-line fixture addition,
  `acme: { ...ctbcEntry, entrySlug: "acme" }`. This file is exclusive to this
  task's own three E2E specs (all already in `write_scopes`); no other
  in-flight task references it, so there is no parallel-scope conflict to
  reconcile.

**Explicitly not authorized:** `tsconfig.json`'s `@drts/api-client` path-alias
addition (`"@drts/api-client": ["packages/api-client/src/index.ts"]`). Diffed
independently at `f7c432c75` — it is unrelated to the map picker work and
carries over from a different/rejected candidate. Owner must revert this
hunk, not fold it into this task's candidate.

Not authorized and not needed: `playwright.tenant-map-booking.config.ts`,
`playwright.config.ts`, `packages/ui-web/src/address-map-picker-core.ts`,
`packages/ui-web/src/index.tsx`, `vitest.config.ts`,
`tests/unit/system-remediation/sr-leave-fe-001/sr-leave-fe-001.test.ts`,
`tests/unit/uv-exec-019.test.ts`, `tools/ci/git/check_commit_trailers.py` — the
current candidate (`f7c432c75` vs. base `d9c1a533f`) carries no diff against
any of these except `tsconfig.json`; they are not part of this decision and
must stay untouched unless a future review identifies a concrete need.

## Unblocked next step for parent task

`UI17-MAP-20260924` (owner Gemini2, reviewer Codex2) can resume:

1. Revert the `tsconfig.json` hunk (unrelated/unauthorized).
2. Apply Decision 1 to `map-picker-integrations.jsx:107` (plain hex literals).
3. Implement Decision 2's build-time Playwright seam for Concierge and Partner
   outage/recovery cases; keep the `acme` fixture entry. `ci-integ.yml` is
   already in `write_scopes` if the `ui-route-e2e` job needs to invoke the new
   project(s).
4. Re-run the hosted map E2E suites on the resulting candidate and update the
   same UAT artifact (`docs/04-uat/ui17-handoff-20260924/UI17-MAP-20260924.md`)
   with the measured pass/fail matrix per Guide §0.7 — do not overwrite the
   unresolved-finding history with an all-fixed summary.

This does not resolve R7 (remaining test correctness), R10 (artifact accuracy)
or R23 (commit-trailer strict-check bypass) — those remain open findings for
the original owner/reviewer to work through; this helper only removes the
scope/token blocker that was stopping progress on them.
