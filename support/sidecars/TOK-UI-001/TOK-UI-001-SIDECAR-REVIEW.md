## TOK-UI-001 Sidecar Review Packet

- Sidecar Task: `TOK-UI-001-SIDECAR-REVIEW`
- Sidecar Owner / Reviewer: `Claude2` / `Codex2`
- Parent Task: `TOK-UI-001` — Create `packages/ui-tokens` (cross-stack design tokens)
- Parent Owner / Reviewer (current): `Codex2` / `Claude` (reviewer reassigned via
  availability-first handoff from `Codex` at `2026-05-10T12:40:13Z`)
- Helper Kind: `review_packet`
- Class: support-only; no canonical-truth mutation
- Date: 2026-05-10

## Purpose

Provide a parallel review packet for `TOK-UI-001` so sidecar reviewer
`Codex2` can confirm, in one place, that the parent token slice:

1. produced the cross-stack token surfaces required by the parent acceptance
   criteria;
2. carries a single canonical commit on the active branch with the required
   trailer block;
3. is consumable from both `packages/ui-web/` and `apps/driver-app/` via the
   temporary import-smoke files declared in the parent handoff; and
4. preserves the `zero React / Tailwind / CSS-in-JS dependency` constraint at
   the package boundary.

This sidecar does not approve the parent task. Parent `TOK-UI-001` remains
`review` in `ai-status.json` with the active review handoff
`Codex -> Claude` (`pending`, `2026-05-10T12:40:13Z`).

## Scope Of This Sidecar

- Create only support artifacts under `support/sidecars/TOK-UI-001/`.
- Do not modify L1 product truth, the canonical `@drts/ui-tokens` package, the
  parent commit, or the temporary import-smoke files.
- Do not rewrite the parent reviewer's prior approve/reopen wording.
- Hand this packet to the assigned sidecar reviewer (`Codex2`) through
  `scripts/ai-status.sh handoff`.

## Parent Anchors

- Parent task record: `ai-status.json::tasks[id="TOK-UI-001"]`
  (status `review`, owner `Codex2`, reviewer `Claude`, phase `Wave 1`,
  planning ref `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`).
- Parent commit: `a6028b7998653b96d07fbe35c1892be692956ac4`
  — `feat(ui-tokens): add cross-stack tokens for TOK-UI-001`
  with trailers `LLM-Agent: Codex2`, `Task-ID: TOK-UI-001`,
  `Reviewer: Codex`, `Verification: ...`.
- Parent handoff trail in machine truth (`ai-status.json::handoffs`):
  `Gemini -> Gemini2 -> Codex -> Gemini2 -> Codex2 -> Codex -> Codex2 ->
Codex -> Claude` (latest entry `pending`).
- Dependency: `RDX-W0-002` is `done` (`ai-status.json::tasks[id="RDX-W0-002"]`,
  last update `2026-05-10T10:40:05Z`).

## Parent Review State

At the time this sidecar was prepared:

1. Parent `TOK-UI-001` is `review`, not `done`, in machine truth.
2. The latest substantive reviewer note is `Codex` approving on
   `2026-05-10T12:31:26Z` (`@drts/ui-tokens 現在符合 task brief 與前次 review
blocker`), followed by an owner re-handoff because a `progress` event
   moved machine truth from `review_approved` back to `in_progress` during
   closeout — the only reason a fresh reviewer signature is still needed.
3. The parent acceptance criteria are exactly:
   - `pnpm --filter @drts/ui-tokens typecheck`
   - `Imported successfully from packages/ui-web/ and apps/driver-app/ via
temporary test import`
   - `No React / Tailwind / CSS-in-JS dependency`
4. The previous `Codex` reopen
   (`2026-05-10T11:41:01Z`, `Review failed: ...`) blocked the slice on three
   points — missing `type=module`, broken cross-stack import, and missing
   `OWNED/FORWARDED/SURFACE_ACCENTS/STATUS_TONES` plus typed status enum and
   zh-TW display strings — and all three are now resolved by the parent
   commit (see Evidence Summary below).

This matters because the sidecar must summarize the parent's actual review
state, not assume it is already `done`.

## Dependency Snapshot

| Task         | Status | Why it matters here                                                                                                      |
| ------------ | ------ | ------------------------------------------------------------------------------------------------------------------------ |
| `RDX-W0-002` | `done` | The only declared dependency for `TOK-UI-001`; gates Wave 1 substrate work, including the cross-stack `@drts/ui-tokens`. |

This sidecar does not recreate that packet's evidence. It only records that
the dependency is closed in machine truth at the time the parent moved into
`review`.

## Evidence Summary

The evidence below is keyed to the three parent acceptance items and to the
prior reviewer reopen blockers.

| Review point                                                                                              | Verdict | Evidence anchor                                                                                                                                                           | Why it matters                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Package exists at the declared path with the documented entry points                                      | `met`   | `packages/ui-tokens/package.json:1-36`; `packages/ui-tokens/tsconfig.json:1-21`; `packages/ui-tokens/src/index.ts:1-3`                                                    | Confirms parent artifact list (`package.json`, `src/index.ts`, `colors.ts`, `status.ts`, `density.ts`, `tsconfig.json`) is materially present.                                 |
| `package.json` declares `type=module` and exposes the ESM entry contract                                  | `met`   | `packages/ui-tokens/package.json:5,7-8,16-22`                                                                                                                             | Resolves the `package.json is missing the required type=module contract` blocker raised by the prior `Codex` reopen on `2026-05-10T11:41:01Z`.                                 |
| Package exposes `OWNED`, `FORWARDED`, `AUTHORITY_COLORS`, `SURFACE_ACCENTS`, and `STATUS_TONES` ramps     | `met`   | `packages/ui-tokens/src/colors.ts:21-50,52-109,111-172`                                                                                                                   | Resolves the `missing OWNED/FORWARDED/SURFACE_ACCENTS/STATUS_TONES` blocker; provides typed light/dark ramps for owned/forwarded authority, four console accents, and 5 tones. |
| Status vocabulary is enumerated as a typed enum with zh-TW + en display strings and tone-by-value mapping | `met`   | `packages/ui-tokens/src/status.ts:3-12,14,21-54,56-65,67-96,98-100`                                                                                                       | Resolves the `typed zh-TW status enum/display strings` blocker; covers all 8 forwarded statuses plus authority/surface display strings.                                        |
| Density scales expose compact + comfortable as numeric scales                                             | `met`   | `packages/ui-tokens/src/density.ts:1-40`                                                                                                                                  | Matches the parent summary requirement for `density scales` without leaking CSS units or React-style props.                                                                    |
| Zero React / Tailwind / CSS-in-JS dependency at the package boundary                                      | `met`   | No `react`, `tailwind`, `@emotion`, or `styled` import found in `packages/ui-tokens/src`; `packages/ui-tokens/package.json:24-32` lists only TS-toolchain devDependencies | Matches parent acceptance item 3 and protects RN consumability.                                                                                                                |
| Cross-stack consumability from `packages/ui-web/` via temporary import smoke                              | `met`   | `packages/ui-web/src/ui-tokens-import-smoke.ts:1-16`; `packages/ui-web/package.json` (`"@drts/ui-tokens": "workspace:*"`)                                                 | Matches parent acceptance item 2 for the web side and resolves the prior `not importable from packages/ui-web` blocker.                                                        |
| Cross-stack consumability from `apps/driver-app/` via temporary import smoke                              | `met`   | `apps/driver-app/lib/ui-tokens-import-smoke.ts:1-16`; `apps/driver-app/package.json` (`"@drts/ui-tokens": "workspace:*"`)                                                 | Matches parent acceptance item 2 for the RN side and resolves the prior `not importable from apps/driver-app` blocker.                                                         |
| Canonical commit exists on the active branch with the required trailers                                   | `met`   | `git log` entry `a6028b7 feat(ui-tokens): add cross-stack tokens for TOK-UI-001` with `LLM-Agent: Codex2`, `Task-ID: TOK-UI-001`, `Reviewer: Codex`, `Verification: ...`  | Matches the canonical commit-evidence rule in `AI_COLLABORATION_GUIDE.md` §5; required before parent `done`.                                                                   |
| Single review-handoff baton is currently with reviewer (no double-ownership)                              | `met`   | `ai-status.json::handoffs[task_id="TOK-UI-001"]` last entry: `Codex -> Claude`, `pending`, `2026-05-10T12:40:13Z`                                                         | Confirms the parent is correctly waiting on a reviewer signature, not silently re-opened.                                                                                      |
| Sidecar scope stays support-only                                                                          | `met`   | This file only; no changes to `packages/ui-tokens/**`, `packages/ui-web/**`, or `apps/driver-app/**` introduced by this sidecar                                           | Enforces the sidecar guardrail `mutates_canonical: false`.                                                                                                                     |

Result: 11 review points `met`, 0 `met-with-note`, 0 unmet.

## Reviewer Spot-Checks

The sidecar reviewer (`Codex2`) should be able to approve this packet by
confirming the following without rerunning the full TS toolchain:

1. Parent `TOK-UI-001` is still `review`, not `done`, in
   `ai-status.json::tasks[id="TOK-UI-001"]`.
2. The dependency snapshot here matches `ai-status.json::tasks[id="RDX-W0-002"]`
   (`done`).
3. The token surfaces named in this packet match
   `packages/ui-tokens/src/colors.ts`, `status.ts`, `density.ts`, and
   `index.ts` line ranges as cited above.
4. The two import-smoke files (`packages/ui-web/src/ui-tokens-import-smoke.ts`
   and `apps/driver-app/lib/ui-tokens-import-smoke.ts`) both resolve the
   `@drts/ui-tokens` symbols they declare.
5. This sidecar's write scope is limited to
   `support/sidecars/TOK-UI-001/TOK-UI-001-SIDECAR-REVIEW.md` and adds no
   change under `packages/`, `apps/`, or any L1 doc.
6. The parent commit `a6028b7` carries `Task-ID: TOK-UI-001` in its trailers
   (already verified by `git log a6028b7 -1`).

If any of (1)-(6) fails, the sidecar reviewer should `reopen` rather than
`approve`, since the parent's review remains the binding decision.

## Out-Of-Scope Items (Intentionally Not Addressed)

- Whether the temporary smoke files at
  `packages/ui-web/src/ui-tokens-import-smoke.ts` and
  `apps/driver-app/lib/ui-tokens-import-smoke.ts` should be deleted before or
  after parent `done` is for the parent owner/reviewer to decide; they are
  flagged in the parent handoff as `temporary`.
- Wave 1 follow-on adoption (e.g. wiring `@drts/ui-tokens` into existing
  `management-theme.ts` consumers) belongs to downstream slices, not this
  packet.
- The reviewer-reassignment chain that ended at `Codex -> Claude` is recorded
  here but not adjudicated; the supervisor/chairman owns those reassignments.

## Sidecar Acceptance Checklist

- [x] Create support artifacts only — this sidecar adds one file under
      `support/sidecars/TOK-UI-001/`.
- [x] Do not edit canonical truth — no L1 docs, runtime code, package, or
      parent commit message were modified by this sidecar.
- [x] Hand off the packet to the assigned reviewer (`Codex2`) — required
      after local verification below.

## Local Verification For This Sidecar

This sidecar packet is support-only. Local checks for this slice stay
limited to file-shape and whitespace safety:

- `git diff --check -- support/sidecars/TOK-UI-001/TOK-UI-001-SIDECAR-REVIEW.md`

The parent's broader acceptance evidence
(`pnpm --filter @drts/ui-tokens typecheck` and the cross-stack import smoke)
remains owned by parent task `TOK-UI-001` and was already recorded in the
parent's `Verification:` trailer on commit `a6028b7`.

## Files Added By This Sidecar

```text
support/sidecars/TOK-UI-001/TOK-UI-001-SIDECAR-REVIEW.md
```
