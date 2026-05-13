## TOK-UI-001 Sidecar Acceptance Packet

- Sidecar Task: `TOK-UI-001-SIDECAR-ACCEPTANCE`
- Sidecar Owner / Reviewer: `Codex2` / `Codex`
- Parent Task: `TOK-UI-001` - Create `packages/ui-tokens` (cross-stack design tokens)
- Parent Owner / Reviewer: `Codex2` / `Claude`
- Helper Kind: `acceptance_packet`
- Class: support-only; no canonical-truth mutation
- Date: 2026-05-13

## Purpose

Capture the acceptance checklist, dependency map, and handoff summary for
`TOK-UI-001` without editing canonical truth. This packet is limited to support
evidence for the already-closed parent slice so the assigned reviewer can verify
that:

1. the parent dependency gate is closed in machine truth;
2. the parent task is already `done` with explicit acceptance evidence;
3. the shipped `@drts/ui-tokens` package still matches the parent acceptance
   contract; and
4. this sidecar remained support-only and did not mutate runtime or L1 truth.

## Scope And Guardrails

- Create or update support artifacts only under `support/sidecars/TOK-UI-001/`.
- Do not edit L1 product truth, runtime code, package contracts, or governance
  files as part of this sidecar.
- Treat `ai-status.json` as machine truth and `current-work.md` as human summary
  only.
- Hand the packet to the assigned reviewer through `scripts/ai-status.sh
handoff`.

## Machine-Truth Snapshot

At packet preparation time:

- `TOK-UI-001-SIDECAR-ACCEPTANCE` is `in_progress` with owner `Codex2` and
  reviewer `Codex`.
- Parent `TOK-UI-001` is `done` in `ai-status.json`, last updated
  `2026-05-10T12:53:54Z`.
- Dependency `RDX-W0-002` is `done` in `ai-status.json`, last updated
  `2026-05-10T10:40:05Z`.

This means the earlier dependency/reviewer blockage that previously affected the
sidecar is no longer active in current machine truth.

## Dependency Map

| Task                            | Status        | Relationship to this sidecar                                                                                                                     |
| ------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `RDX-W0-002`                    | `done`        | Declared prerequisite for parent `TOK-UI-001`; proves the Wave 0 task board seeding gate was already closed before the token package closed out. |
| `TOK-UI-001`                    | `done`        | Parent slice this packet summarizes; provides the canonical commit, acceptance evidence, and artifacts that this sidecar references.             |
| `TOK-UI-001-SIDECAR-ACCEPTANCE` | `in_progress` | Support-only packet for reviewer handoff; no canonical implementation authority.                                                                 |

## Parent Acceptance Checklist

Parent `TOK-UI-001` acceptance in machine truth:

- `pnpm --filter @drts/ui-tokens typecheck`
- `Imported successfully from packages/ui-web/ and apps/driver-app/ via temporary test import`
- `No React / Tailwind / CSS-in-JS dependency`

Packet verdict:

- [x] Parent dependency `RDX-W0-002` is `done`.
- [x] Parent task `TOK-UI-001` is `done` in machine truth.
- [x] Parent commit exists with task and verification trailers.
- [x] Token package exports the expected cross-stack surfaces.
- [x] Import-smoke evidence exists on both web and driver-app sides.
- [x] This sidecar writes support material only.

## Evidence Anchors

| Acceptance point                                          | Verdict | Evidence anchor                                                                                                         | Notes                                                                                                                                             |
| --------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package declares an ESM consumable contract               | `met`   | `packages/ui-tokens/package.json:2-7`, `packages/ui-tokens/package.json:14-19`, `packages/ui-tokens/package.json:26-34` | Confirms package name, `type: module`, exports map, and toolchain-only devDependencies.                                                           |
| Authority token ramps exist for owned and forwarded flows | `met`   | `packages/ui-tokens/src/colors.ts:21-50`                                                                                | Confirms `OWNED`, `FORWARDED`, and `AUTHORITY_COLORS`.                                                                                            |
| Surface accents and status tone ramps exist               | `met`   | `packages/ui-tokens/src/colors.ts:52-172`                                                                               | Confirms surface accents for platform/ops/tenant/partner plus `STATUS_TONES`.                                                                     |
| Forwarded status vocabulary and localized labels exist    | `met`   | `packages/ui-tokens/src/status.ts:3-65`                                                                                 | Confirms typed status vocabulary and `en`/`zhTW` display strings plus tone mapping.                                                               |
| Shared display strings and status guard exist             | `met`   | `packages/ui-tokens/src/status.ts:67-100`                                                                               | Confirms authority/surface labels and exported type guard.                                                                                        |
| Density scales exist for compact and comfortable modes    | `met`   | `packages/ui-tokens/src/density.ts:1-40`                                                                                | Confirms numeric density surfaces required by the parent brief.                                                                                   |
| Web import smoke resolves package symbols                 | `met`   | `packages/ui-web/src/ui-tokens-import-smoke.ts:1-15`                                                                    | Confirms web-side import coverage of density, display strings, tones, and accents.                                                                |
| Driver-app import smoke resolves package symbols          | `met`   | `apps/driver-app/lib/ui-tokens-import-smoke.ts:1-15`                                                                    | Confirms RN-side import coverage of authority colors, density, status vocabulary, and labels.                                                     |
| Parent closeout commit carries canonical trailers         | `met`   | `git log -1 a6028b7998653b96d07fbe35c1892be692956ac4`                                                                   | Commit subject `feat(ui-tokens): add cross-stack tokens for TOK-UI-001` includes `LLM-Agent`, `Task-ID`, `Reviewer`, and `Verification` trailers. |
| Parent and dependency are closed in machine truth         | `met`   | `ai-status.json::tasks[id=\"TOK-UI-001\"]`, `ai-status.json::tasks[id=\"RDX-W0-002\"]`                                  | Confirms this packet is a support summary, not a blocker workaround.                                                                              |

Result: 10 evidence points `met`, 0 unmet.

## Commit And Verification Snapshot

Canonical parent commit:

- `a6028b7998653b96d07fbe35c1892be692956ac4`
- Subject: `feat(ui-tokens): add cross-stack tokens for TOK-UI-001`
- Trailers:
  - `LLM-Agent: Codex2`
  - `Task-ID: TOK-UI-001`
  - `Reviewer: Codex`
  - `Verification: pnpm --filter @drts/ui-tokens build && pnpm --filter @drts/ui-tokens typecheck && pnpm --filter @drts/ui-web typecheck && pnpm --filter @drts/driver-app typecheck && pnpm --filter @drts/ui-web exec node --input-type=module -e "await import('@drts/ui-tokens')" && pnpm --filter @drts/driver-app exec node --input-type=module -e "await import('@drts/ui-tokens')"`

This sidecar does not re-run the parent toolchain; it records the accepted
verification already attached to the canonical parent commit and machine-truth
closeout.

## Reviewer Spot-Checks

The sidecar reviewer should confirm:

1. `ai-status.json` still shows `TOK-UI-001` and `RDX-W0-002` as `done`.
2. The file cited above exists at
   `support/sidecars/TOK-UI-001/TOK-UI-001-SIDECAR-ACCEPTANCE.md`.
3. The package contract in `packages/ui-tokens/package.json` still declares
   `type: "module"` and the `.` export.
4. The cited token surfaces still exist in `colors.ts`, `status.ts`, and
   `density.ts`.
5. The two import-smoke files still import from `@drts/ui-tokens`.
6. This sidecar did not modify parent runtime files or L1 docs.

If any of these checks fails, the reviewer should `reopen` the sidecar instead
of `approve`.

## Out Of Scope

- Changing `packages/ui-tokens/**`, `packages/ui-web/**`, or
  `apps/driver-app/**`.
- Reopening or re-adjudicating the parent `TOK-UI-001` implementation.
- Editing `ai-status.json` directly outside the status tool flow.
- Promoting this packet into canonical truth; that remains the parent owner's
  decision.

## Sidecar Acceptance Checklist

- [x] Create support artifacts only.
- [x] Do not edit canonical truth.
- [x] Prepare dependency map and acceptance packet for reviewer handoff.
- [x] Hand off the packet to the assigned reviewer via machine-truth status
      update.

Closeout note: reviewer `Codex` approved the packet on `2026-05-13`, confirming
the dependency gate, parent done-state, and evidence anchors remain valid.

## Local Verification For This Sidecar

- `git diff --check -- support/sidecars/TOK-UI-001/TOK-UI-001-SIDECAR-ACCEPTANCE.md`

## Files Added By This Sidecar

```text
support/sidecars/TOK-UI-001/TOK-UI-001-SIDECAR-ACCEPTANCE.md
```
