# RGX-010 `tenant-commute-hub` Authority Annex Audit (Workspace vs Clean Clone)

Status: code-backed annex audit comparing the local workspace checkout and a clean `origin/main` clone, with `2026-04-23` merge-closeout and live-smoke addendum  
Task: `RGX-010` — confirm code-level authority posture after BFF cutover  
Owner: Codex  
Reviewer: Claude  
Updated: 2026-04-23

Primary citations:

- `docs/02-architecture/tenant-commute-hub-boundary.md`
- `docs/02-architecture/authority/rgp-002-authority-map.md`
- `docs/02-architecture/authority/fbp-006-tenant-commute-hub-cutover-spec.md`
- `docs/01-decisions/SD-DP-20260422-001-phase1-entry-and-receipt-topology.md`
- `docs/01-decisions/SD-DP-20260422-002-identity-cutover-topology.md`
- `/home/edna/workspace/tenant-commute-hub/vite.config.ts`
- `/home/edna/workspace/tenant-commute-hub/src/contexts/AuthContext.tsx`
- `/home/edna/workspace/tenant-commute-hub/src/lib/drtsApi.ts`
- `/home/edna/workspace/tenant-commute-hub/src/pages/Login.tsx`
- `/home/edna/workspace/tenant-commute-hub/src/pages/Dashboard.tsx`
- `/home/edna/workspace/tenant-commute-hub/src/pages/NewBooking.tsx`
- `/home/edna/workspace/tenant-commute-hub/src/pages/BookingList.tsx`
- `/home/edna/workspace/tenant-commute-hub/src/pages/WebhookManagement.tsx`
- `/tmp/tenant-commute-hub-clean-20260422/src/contexts/AuthContext.tsx`
- `/tmp/tenant-commute-hub-clean-20260422/src/pages/NewBooking.tsx`
- `/tmp/tenant-commute-hub-clean-20260422/src/App.tsx`
- `/tmp/tenant-commute-hub-clean-20260422/package.json`
- `packages/api-client/src/index.ts`

---

## 1. Scope

This annex compares two concrete audit targets:

1. local workspace checkout:
   `/home/edna/workspace/tenant-commute-hub`
2. clean clone from GitHub `origin/main`:
   `/tmp/tenant-commute-hub-clean-20260422`

It answers three narrower questions than `FBP-006`:

1. what the local workspace checkout currently looks like
2. what a clean clone of remote `main` currently looks like
3. whether the cutover claimed in repo-local docs has actually landed on remote
   `main`

No code was edited in `tenant-commute-hub` as part of this annex audit.

---

## 2. Audit Inputs

### Local workspace checkout

- path: `/home/edna/workspace/tenant-commute-hub`
- branch: `main`
- HEAD: `75fe079ec3e6e5d415203ee09c7a15e2f6b2ef32`
- status: dirty worktree with extensive uncommitted cutover changes

### Clean remote clone

- remote: `https://github.com/ajoe734/tenant-commute-hub.git`
- branch: `main`
- clean clone path: `/tmp/tenant-commute-hub-clean-20260422`
- HEAD: `cdf25a5f5f3d7e733695fe96a28877f22e17bf93`
- status: clean checkout of `origin/main`

---

## 3. Executive Verdict

- The local workspace checkout shows a substantial in-progress cutover toward a
  frontend consumer model. Tenant pages are already routed through
  `/api/tenant/*` and shared `@drts/api-client`, and direct Supabase business
  data access no longer appears in the active source tree there.
- The clean clone of `origin/main` does **not** reflect that cutover. Remote
  `main` still uses Supabase auth, Supabase table reads / writes, Supabase edge
  functions, and legacy tenant routes such as `/dashboard`, `/bookings`, and
  `/cost-centers`.
- Therefore the earlier local-only reading was incomplete: the strongest
  accurate conclusion is **not** "repo B is already cut over", but rather
  "repo B cutover work exists in the local workspace and has not yet landed on
  clean remote `main`."
- `FBP-006` should currently be read as a cutover spec plus local execution
  record, not as proof that GitHub `main` already matches that state.

### `2026-04-23` addendum

- The cutover is no longer only a local workspace observation. It has now been
  merged into remote `main` in `tenant-commute-hub` through
  `ajoe734/tenant-commute-hub#1`
  (`feat/tenant-bff-foundation-landing-20260422` ->
  merge commit `e4def813d0e8fa6978f80cd824ba415b98d392a6`).
- A companion backend/client compatibility patch has also been merged into
  remote `main` in `drts-fleet-platform` through
  `ajoe734/drts-fleet-platform#1`
  (`fix/tenant-cross-repo-compat-20260423` ->
  merge commit `9b9692b52f8f52681d5c18bb09ae027792b9ffaa`).
- Live cross-repo smoke now passes against the tenant landing branch plus a
  local `drts-api` server for identity, users, passengers, addresses,
  bookings, API keys, notifications, webhooks, SLA, billing, audit, and
  reports.
- That smoke surfaced two real integration bugs and both now have code fixes in
  the merged PRs:
  1. shared client runtime needed centralized `snake_case` -> `camelCase`
     response normalization
  2. `POST /api/tenant/webhooks/test` had to be declared before
     `POST /api/tenant/webhooks/:webhookId`
- The promotion-to-remote-baseline step is now complete. The backend merge was
  performed with explicit owner risk acceptance even though GitHub CI on the
  clean branch still showed unrelated repo-wide debt outside the touched files.
- The remaining cross-repo gap is now narrower: residual bootstrap-identity
  drift still exists in `tenant-commute-hub`, so "pure passive consumer" is
  stronger than the current remote-main posture.

---

## 4. Evidence From The Local Workspace Checkout

### Domain-data authority is mostly retired locally

In the local workspace checkout:

- tenant routes are wired through a frontend shell that calls shared
  `@drts/api-client`
- tenant pages such as dashboard, bookings, passengers, addresses, webhooks,
  billing, reports, and audit operate on `/api/tenant/*` plus
  `/api/identity/context`
- running
  `rg -n 'integrations/supabase|supabase\.' src package.json supabase`
  returned no matches in the active tree

This local checkout is consistent with the intended `drts-fleet-platform` BFF
direction.

### Local residual drift still exists

Even in the local cutover worktree, repo B is not yet a fully passive consumer:

- `src/contexts/AuthContext.tsx` still persists bootstrap session data in
  `window.localStorage`
- `src/lib/drtsApi.ts` still derives `roleCode`, `actorId`, and default tenant
  identity locally
- `src/pages/Login.tsx` still falls back to a local fixed role catalog when the
  backend role query fails
- the local runtime uses caller-type bootstrap headers through shared
  `@drts/api-client`

So the local workspace checkout has largely removed domain-data authority, but
it still retains local identity bootstrap behavior.

### Local workspace verification

- `npm run build` succeeded in the local workspace checkout on `2026-04-22`
- the local worktree is dirty, so this evidence reflects in-progress local
  implementation, not remote baseline truth

---

## 5. Evidence From The Clean `origin/main` Clone

### Remote `main` is still Supabase-first

In the clean clone at commit `cdf25a5f5f3d7e733695fe96a28877f22e17bf93`:

- `src/contexts/AuthContext.tsx` uses `@supabase/supabase-js` auth and profile
  fetches
- `src/pages/NewBooking.tsx` invokes Supabase edge functions and writes to the
  `bookings` table directly
- `src/App.tsx` still routes the tenant shell around legacy paths such as
  `/dashboard`, `/bookings`, and `/cost-centers`
- `package.json` still depends on `@supabase/supabase-js`
- `supabase/functions/*` is still present in the clean clone

This means clean remote `main` is still carrying forbidden backend authority by
the current boundary contract.

### Remote `main` verification

- before installing dependencies, `npm run build` failed because the clean clone
  had no installed packages
- after `npm ci`, `npm run build` succeeded on `2026-04-22`
- the successful build does **not** change the authority conclusion; it only
  confirms that the old Supabase-first tenant portal still compiles cleanly

---

## 6. Delta Between Local Workspace And Clean Remote Main

The local workspace checkout is materially ahead of clean remote `main`.

Observed divergence includes:

- removal of `src/integrations/supabase/*` in the local worktree
- deletion of local Supabase migrations and functions in the local worktree
- addition of `src/lib/drtsApi.ts` and shared-client based BFF usage locally
- addition of local shim / alias support for `@drts/api-client` and
  `@drts/contracts`
- route convergence away from legacy `/dashboard` / `/bookings` /
  `/cost-centers` style topology

In short:

- local workspace checkout = in-progress cutover branch state
- clean remote `main` = pre-cutover Supabase authority state

---

## 7. Implications For The Implementation Blueprint

- `EMC-X1-002` is no longer blocked by lack of code access. The annex audit has
  now been performed against both a real local checkout and a clean remote
  clone, and the merge/promotion phase has completed in both repos.
- The real cross-repo gap is no longer uncertainty about code compatibility.
  Live smoke proves the tenant landing branch can run against the current
  backend contract once the compatibility fixes are applied.
- The promotion-to-remote-baseline gap is now closed by merge records on both
  remote `main` branches.
- `FBP-006` and related authority docs should not imply that remote `main` is
  is already a perfect pure consumer. At most, they can now claim:
  - the target topology is fixed
  - the cutover now exists on remote `main`
  - live cross-repo smoke validated the merged landing path
  - residual identity-bootstrap cleanup still remains if the team wants a
    stricter consumer posture

To close the cross-repo gap, the remaining work is:

1. remove remaining local bootstrap session / role derivation so repo B becomes
   a stronger passive identity consumer too
2. decide whether that identity-hardening remainder stays folded into
   `EMC-X1-002` or becomes a separate follow-on slice
3. keep all repo-local docs explicit about which claims refer to the historical
   `2026-04-22` clean-clone snapshot versus the merged `2026-04-23`
   remote-baseline state

Recommended landing sequence from the current workspace evidence:

1. push the already-committed portability / shim support that is ahead of
   `origin/main`
   - current ahead-only commits are:
     - `84a7913 fix(g-3): add tenant build portability alias fallback`
     - `75fe079 chore(g-1): remove legacy supabase edge functions`
   - this carries the Vite alias fallback, local shim files, and Supabase edge
     function removal into remote history before the larger UI cutover lands
2. land the BFF foundation slice from the dirty worktree
   - remove `@supabase/supabase-js` and related lockfile entries
   - delete `src/integrations/supabase/*`
   - add `src/lib/drtsApi.ts` / `src/lib/formatting.ts`
   - replace Supabase auth wiring with local bootstrap-session +
     `@drts/api-client` wiring in `src/contexts/AuthContext.tsx`
   - converge route topology in `src/App.tsx` / `src/components/DashboardLayout.tsx`
3. land the tenant surface migration slice
   - rewrite the tenant management pages to consume `/api/tenant/*` and shared
     contracts
   - add the new `BookingDetail`, `SlaManagement`, and `WebhookManagement`
     surfaces
   - delete legacy `CostCenterManagement`
   - remove remaining local Supabase config / migration artifacts
4. after the remote cutover is landed, open a separate hardening slice for
   identity cleanup
   - remove bootstrap session storage and local role derivation
   - replace locally fabricated headers with backend-issued identity context
   - align that step with the main repo's Cloud IAP / OIDC cutover sequence

Observed low-risk cleanup that should not block the landing decision:

- `src/components/ui/command.tsx` interface-to-type cleanup
- `src/components/ui/textarea.tsx` interface-to-type cleanup
- `tailwind.config.ts` plugin import style normalization

---

## 8. Verification Notes

Commands run during this audit included:

- local workspace:
  - `git status --short --branch`
  - `git rev-list --left-right --count origin/main...HEAD`
  - `git log --oneline --decorate origin/main..HEAD`
  - `git diff --stat origin/main...HEAD`
  - `git diff --stat`
  - `rg -n 'integrations/supabase|supabase\.' src package.json supabase`
  - `npm run build`
  - `npm run lint`
- clean clone:
  - `git clone --depth 1 --branch main https://github.com/ajoe734/tenant-commute-hub.git /tmp/tenant-commute-hub-clean-20260422`
  - `rg -n 'integrations/supabase|supabase\.|createTenantPortalClient|window\.localStorage|x-actor-type|@drts/api-client|/api/tenant/' src package.json supabase`
  - `npm ci`
  - `npm run build`

Observed result:

- local workspace checkout is ahead of `origin/main` by `2` commits, has an
  additional dirty BFF cutover worktree, and builds successfully
- local workspace lint passes with warnings only; no local Supabase references
  were returned by the repo-wide `rg` scan
- clean `origin/main` still reflects Supabase-first authority and also builds
  after dependencies are installed
- the tenant landing branch was merged into remote `main` through
  `ajoe734/tenant-commute-hub#1` and still builds / lints successfully after a
  response-normalization follow-up commit
- the clean-branch backend compatibility patch was merged into remote `main`
  through `ajoe734/drts-fleet-platform#1`; targeted unit tests pass there, and
  the merge happened with explicit owner risk acceptance because GitHub CI on
  the clean branch still showed unrelated existing failures outside the touched
  files
- a targeted live cross-repo smoke run against the tenant landing branch and a
  local `drts-api` server completed successfully after the shared-client
  normalization and webhook-test route-order fixes were applied
