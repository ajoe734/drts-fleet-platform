# SR-REFERRAL-001 — 修復轉介 handoff 與可用 fallback

- Owner: `Claude2`
- Reviewer: `Claude`
- Wave: `system-remediation-20260906`
- Gap ID: `R07`
- Capability IDs: `C020`, `C021`
- Base SHA: `6adf792381f99783d12c8142bfc69d2c54ad9103` (`origin/dev` at branch creation, `wip(UV-EXEC-027): anchor acceptance-phase re-verification (#1657)`)
- Candidate SHA: recorded at `handoff` time via `git rev-parse HEAD`
- Branch: `claude2/sr-referral-001`

## 1. Audit source (2026-09-06) vs. reproduction at base SHA

`docs/04-uat/system-remediation-20260906/source/findings.json` (R07, 角色: 社區乘客):

> 開始叫車與替代入口都到403白頁 — 入口宣稱簽章有效，按開始叫車→403；fallback前往獨立網站仍導回同站→403。

`capabilities.json` C020/C021:

- C020: 合法 signed handoff 進入嵌入叫車 — 目前所提供 CTA 的 entryHost 流程被 403 拒絕。
- C021: 嵌入失敗的獨立叫車 fallback — fallback 又導回 embed 並被拒絕。

Reproduced at base SHA `6adf792` by reading (not by any live/real-device probe — see §4 for that boundary):

- The handoff/session/replay/expiry/entry-host machinery on the API side
  (`apps/api/src/modules/tenant-partner/referral-embed-handoff.repository.ts`,
  `tenant-partner.service.ts#issueReferralEmbedHandoffArtifact` /
  `#consumeReferralEmbedHandoffArtifact`, `middleware.ts` +
  `lib/embed-security.ts` entry-host allowlist) was **already correct** at base
  SHA — single-use artifact, exact entry-host match, replay/expired/wrong-host
  all rejected with distinct error codes. This part of R07/C020 reads as
  already remediated by prior work (visible in `git log` as
  `REL-REF-EMBED-003`, `S1F-REF-001/002`, `feat(S1F-CHAN-001)` etc.) — not
  reworked or reverted per this task's instructions.
- The actual live defect still present at base SHA `6adf792` is in
  `apps/referral-embed-web/components/passenger-embed.tsx`'s `FallbackScreen`:
  the "前往獨立叫車網站" (go to standalone site) button called
  `buildHref(context, { state: "fallback" })`, which only ever builds
  `/embed/<entrySlug>?...&state=fallback` — i.e. **the same embed route**, not
  any external site. The card below it hard-coded a label
  `獨立網站: ride.drts.com.tw` that was never linked to and does not
  correspond to any deployed surface — `apps/referral-embed-web/README.md`
  documents that the prior standalone consumer app (`passenger-web`) was
  retired (`REFERRAL-EMBED-MIGRATE-20260616`) and "is no longer deployed."
  This exactly matches the audit repro: clicking the fallback CTA "前往獨立
  叫車網站" reloads the blocked embed and can re-hit the entry-host/session
  checks in `middleware.ts`, landing back on the same blocked state — a dead
  loop, not a working fallback.

## 2. Fix (write_scopes only: `apps/referral-embed-web/`)

- `apps/referral-embed-web/lib/embed-fallback-entry.ts` (new): pure
  `resolveStandaloneFallbackEntry()` reads `REFERRAL_EMBED_STANDALONE_URL`. It
  only returns a destination when the value is a real absolute `http(s)` URL
  that resolves to a **different host** than the current embed host —
  otherwise it returns `null`. A same-host value is refused specifically so
  a future misconfiguration cannot recreate the fallback → embed → blocked
  loop this task exists to fix. It stamps `ref_source=referral_embed_fallback`,
  `ref_entry_slug`, and `ref_entry_host` on the outbound URL so the
  destination (and any downstream revenue-share attribution) keeps the
  partner-referral source, per "保留來源歸屬".
- `apps/referral-embed-web/lib/embed-context.ts`: `resolveEmbedContext()` now
  computes `fallbackEntry` server-side (has access to the real request host
  and `entryHost`) and threads it into `EmbedContext`.
- `apps/referral-embed-web/components/passenger-embed.tsx`: `FallbackScreen`
  now:
  - renders the "前往獨立叫車網站" button with a **real external `href`**
    (`context.fallbackEntry.url`) only when a fallback entry is actually
    configured, showing the real resolved host instead of the old
    hard-coded, never-linked `ride.drts.com.tw` label;
  - otherwise renders an explicit "目前沒有可用的替代入口" state — an
    honest, recoverable status (not a fake link, not a silent 403) that still
    shows the source entry (`entrySlug` + partner display name) and the
    support phone, and offers the (real) "回社區 App" retry action.
- `apps/referral-embed-web/README.md`: documents the new
  `REFERRAL_EMBED_STANDALONE_URL` env var and its same-host guard.

No files outside `apps/referral-embed-web/` were modified. `tenant-partner.controller.ts` / `tenant-partner.service.ts` were read-verified only (§1) and not changed, since their handoff/replay/expiry/host-mismatch behavior already satisfies the acceptance criteria.

## 3. Regression tests (`tests/unit/system-remediation/sr-referral-001/`, new)

- `referral-embed-fallback-entry.test.ts` (7 cases): unset → `null` (no fake
  fallback); configured on a different host → real URL with
  `ref_source`/`ref_entry_slug`/`ref_entry_host`; **same-host configuration →
  `null`** (the exact loop this task fixes, locked in as a regression case,
  case-insensitively); non-`http(s)` scheme rejected; unparseable value
  doesn't throw; `ref_entry_host` omitted when unknown.
- `referral-embed-handoff-lifecycle.test.ts` (6 cases), exercised directly
  against `ReferralEmbedHandoffRepository` (in-memory fallback store, no
  `DatabaseService` configured — `isEnabled() === false`): a legitimately
  issued artifact consumes into a bookable session (`identityActive: true`,
  correct `handoffId`/`entrySlug`/`entryHost`/`drtsPassengerId`); a second
  consume of the same artifact is `replayed`; consumption from a different
  host is `wrong_host`; an artifact issued in the past with a short TTL is
  `expired`; an artifact that was never issued is `missing`. This is the
  first regression coverage of this repository's replay/expiry/host-mismatch
  behavior in the repo (`grep -rl ReferralEmbedHandoffRepository tests` was
  empty before this task).

Resource IDs used by the tests (fixture literals, not live-system IDs):
`entrySlug=yuhe-residence`, `entryHost=app.yuhe-living.com.tw` (the formal
non-demo Yuhe partner entry seeded in `tenant-partner.service.ts`),
`artifact=test-issuer-artifact-001`, `drtsPassengerId=referral-yuhe-resident-001`.
Issued handoff records get a generated `ref_handoff_<uuid>` id from the real
repository code (not a fixture id).

## 4. Test commands run at candidate SHA (exact output)

```
$ git diff --check
(exit 0, no output)

$ pnpm --filter @drts/api typecheck
> tsc -p tsconfig.json --noEmit
(exit 0, no output)

$ pnpm --filter @drts/referral-embed-web typecheck
> tsc --noEmit
(exit 0, no output)

$ pnpm exec vitest run tests/unit/system-remediation/sr-referral-001/
 Test Files  2 passed (2)
      Tests  13 passed (13)

$ pnpm --filter @drts/referral-embed-web lint
> eslint . --max-warnings=0
(exit 0, no output)

$ pnpm exec vitest run tests/unit/referral-embed-security.test.ts tests/unit/referral-embed-routing.test.ts tests/unit/referral-embed-passenger-lifecycle.test.ts tests/unit/tenant-partner-foundation.test.ts
 Test Files  4 passed (4)
      Tests  48 passed (48)
```

(Pre-existing, unrelated environment note: this worktree's shared
`node_modules` initially had several broken/misdirected workspace symlinks
—`next`, `react`, `react-dom` under `apps/referral-embed-web/node_modules`,
and `@drts/control-plane-auth` under `apps/api/node_modules` pointing into an
*unrelated concurrent task's worktree* — left over from a concurrent `pnpm`
install elsewhere in this shared machine. These were repaired in-place
[build/link state only, no source/lockfile change, `git status` on
`apps/api/` and outside `apps/referral-embed-web/` stayed empty throughout]
before the commands above were run clean. This is infra state, not part of
the candidate diff.)

## 5. What is NOT verified (explicit boundary — not claimed as done)

- No live/real community-App-issued signed handoff was exercised — the
  original audit itself scoped this the same way ("驗證界線: 未驗真實社區
  App signed handoff"). §3's handoff-lifecycle test exercises the real
  `ReferralEmbedHandoffRepository` code path directly (in-memory store), not
  a live Postgres-backed run through the Nest HTTP layer.
- `REFERRAL_EMBED_STANDALONE_URL` is **not set** in any current dev
  deployment — per `apps/referral-embed-web/README.md`, no standalone
  passenger-booking surface is currently deployed to point it at
  (`passenger-web` was retired; "No production Referral Embed host is
  defined by the current production deploy rail" either). This task delivers
  the mechanism (a real, safe, source-attributed fallback link when one
  exists, and an honest "not configured" recoverable state when it doesn't)
  and closes the self-referential-loop defect; it does not itself provision
  or deploy a standalone booking site — that is a separate,
  infrastructure-owning task if/when one is wanted.
- No browser/E2E run of `/embed/<entrySlug>` was performed against a live
  dev URL in this pass; verification is unit-level (§3) plus static
  typecheck/lint (§4) against the real production modules.
